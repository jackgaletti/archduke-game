import type { Command, Target, Reply, View, Result } from '../shared/protocol.js';
import { type State, type Dependencies, type Card, type Player, type Slot, need, deck, shuffle, matches, occupied, sum } from './model.js';
const active=(s:State)=>!['LOBBY','ROUND_RESULTS','GAME_RESULTS'].includes(s.phase);
const player=(s:State,id:string)=>{const p=s.players.find(p=>p.id===id);need(p,'Unknown seat');return p;};
const endpoint=(p:string,i:number)=>`${p}:${i}`;
const ident=(s:State)=>`${s.game}.${s.round}.${++s.serial}`;
function slot(s:State,t:Target):Slot {const p=player(s,t.player);const v=p.slots[t.slot];need(v?.card&&v.rev===t.rev,'The selected slot changed. Select again.','STALE');return v;}
function log(s:State,text:string){s.activity=[text,...s.activity].slice(0,12);}
function movement(s:State,d:Dependencies,kind:string,from:string,to:string,value?:number){
 const start=Math.max(d.now(),s.visualUntil); const end=start+d.motion;
 s.movements.push({kind,from,to,start,end,...(value===undefined?{}:{value})});
 s.movements=s.movements.filter(m=>m.end>d.now()-1000).slice(-104);
 s.visualUntil=end;s.unlockAt=Math.max(s.unlockAt,end+d.delay);
}
function supply(s:State,d:Dependencies):Card|undefined{
 if(!s.deck.length&&s.discard.length>1){const top=s.discard.pop()!;s.deck=shuffle(s.discard,d.randomInt);s.discard=[top];movement(s,d,'recycle','discard','draw');log(s,'The discard pile was shuffled, keeping its top card.');}
 return s.deck.pop();
}
const available=(s:State)=>s.deck.length+Math.max(0,s.discard.length-1);
function append(s:State,d:Dependencies,p:Player,c:Card,kind:string){const index=p.slots.length;p.slots.push({rev:1,card:c});movement(s,d,kind,'draw',endpoint(p.id,index));}
function blockSupply(s:State,d:Dependencies){pause(s,d,'No cards available');s.open=false;log(s,'No cards available. Host may redeal this round without awarding placements.');}
function penalty(s:State,d:Dependencies,p:Player){
 if(s.penalized.includes(p.id))return;
 s.penalized.push(p.id);const card=supply(s,d);
 if(!card){blockSupply(s,d);return;}
 append(s,d,p,card,'penalty');log(s,`${p.name} received one unknown matching penalty card.`);
}
function effect(s:State,actor:string,value:number){if(value===1||value===11||value===12)s.effects.push({id:ident(s),actor,kind:value});}
function legalTargets(s:State){return s.players.filter(p=>p.id!==s.caller&&occupied(p));}
function autoSkip(s:State){
 while(s.effects.length){const e=s.effects[0];const eligible=legalTargets(s);
  const possible=e.kind===1?s.players.some(p=>p.id!==e.actor&&p.id!==s.caller)&&available(s)>0:e.kind===11?eligible.length>=2:eligible.length>0;
  if(possible)break;s.effects.shift();log(s,`${player(s,e.actor).name}'s effect skipped: no legal target or card supply.`);
 }
}
function windowOpen(s:State,d:Dependencies){s.window=ident(s);s.open=true;s.penalized=[];s.phase=s.caller&&!s.finalTurns.length?'FINAL_MATCH_WINDOW':'INTER_TURN';s.unlockAt=Math.max(s.visualUntil,d.now())+d.delay;}
export function startRound(s:State,d:Dependencies,redeal=false){
 const starter=(redeal?s.round===1:s.round===0)?s.players[d.randomInt(s.players.length)].id:s.history.at(-1)!.at(-1)!.player;
 if(!redeal)s.round++;
 s.deck=shuffle(deck(),d.randomInt);s.discard=[];s.held=undefined;s.effects=[];s.caller=undefined;s.finalTurns=[];s.lastTurn=undefined;s.open=false;s.window='';s.penalized=[];s.incorrectApplied=false;s.ending=false;s.paused=undefined;s.reveals=[];s.movements=[];s.next=starter;s.turn=0;s.visualUntil=d.now();s.unlockAt=d.now();s.restartAt=0;s.phase='INITIAL_PEEK';
 for(const p of s.players){p.slots=Array.from({length:4},()=>({rev:1,card:s.deck.pop()!}));p.initial=undefined;p.hidden=false;p.ready=false;for(let i=0;i<4;i++){const start=d.now()+i*40;s.movements.push({kind:'deal',from:'draw',to:endpoint(p.id,i),start,end:start+d.motion});}}
 s.visualUntil=d.now()+120+d.motion;
 log(s,`Round ${s.round}: privately inspect two cards, then hide and ready.`);
}
function rank(s:State,d:Dependencies):Result[]{
 const rows=s.players.map(p=>({player:p.id,sum:sum(p),count:occupied(p),lowest:Math.min(...p.slots.flatMap(x=>x.card?[x.card.value]:[]),Infinity),place:0,tie:''}));
 const primary=(a:Result,b:Result)=>a.sum-b.sum||a.count-b.count||a.lowest-b.lowest;
 rows.sort(primary);
 for(const row of rows){const tied=rows.filter(other=>other.sum===row.sum);if(tied.length>1){if(tied.some(other=>other.count!==row.count))row.tie=`Card count: ${row.count}`;if(tied.some(other=>other.count===row.count&&other.lowest!==row.lowest))row.tie+=`${row.tie?' → ':''}Lowest card: ${row.lowest}`;}}

 function breakTie(group:Result[],depth=0):Result[]{
  if(group.length<2)return group;
  if(available(s)<group.length){for(const r of group)r.tie='Random tie order (exhausted supply fallback)';return shuffle(group,d.randomInt);}
  const drawn=group.map(row=>({row,card:supply(s,d)!}));
  drawn.sort((a,b)=>a.card.value-b.card.value);
  for(const {row,card} of drawn)row.tie+=`${row.tie?' → ':''}Tie-break ${card.value}`;
  s.deck=shuffle([...s.deck,...drawn.map(x=>x.card)],d.randomInt);
  const result:Result[]=[];
  for(let i=0;i<drawn.length;){let j=i+1;while(j<drawn.length&&drawn[j].card.value===drawn[i].card.value)j++;result.push(...breakTie(drawn.slice(i,j).map(x=>x.row),depth+1));i=j;}
  return result;
 }
 const result:Result[]=[];
 for(let i=0;i<rows.length;){let j=i+1;while(j<rows.length&&primary(rows[i],rows[j])===0)j++;result.push(...breakTie(rows.slice(i,j)));i=j;}
 return result.map((r,i)=>({...r,lowest:Number.isFinite(r.lowest)?r.lowest:0,place:i+1}));
}
function endRound(s:State,d:Dependencies){
 if(s.history.length>=s.round)return;
 s.ending=true;s.open=false;s.effects=[];s.reveals=[];
 if(s.caller&&!s.incorrectApplied){const p=player(s,s.caller);if(sum(p)>Math.min(...s.players.map(sum))){const c=supply(s,d);if(!c){blockSupply(s,d);return;}append(s,d,p,c,'incorrect-call');log(s,`${p.name} received the incorrect-call penalty.`);}s.incorrectApplied=true;}
 const result=rank(s,d);s.history.push(result);s.phase=s.round===4?'GAME_RESULTS':'ROUND_RESULTS';s.ending=false;
 for(const p of s.players)p.ready=false;
 movement(s,d,'round-reveal','table','table');log(s,`${player(s,result.at(-1)!.player).name} got dead last!`);
 if(s.round===4){const totals=s.players.map(p=>({id:p.id,total:s.history.reduce((n,r)=>n+r.find(x=>x.player===p.id)!.place,0)}));const best=Math.min(...totals.map(x=>x.total));s.winners=totals.filter(x=>x.total===best).map(x=>x.id);}
}
export function pause(s:State,d:Dependencies,reason:string){if(!s.paused)s.paused={reason,since:d.now(),graceUntil:d.now()+d.grace};}
export function connection(s:State,d:Dependencies,id:string,connected:boolean){
 const p=player(s,id);p.connected=connected;
 if(connected&&!player(s,s.host).connected){const index=s.players.findIndex(p=>p.id===s.host);for(let i=1;i<=s.players.length;i++){const candidate=s.players[(index+i)%s.players.length];if(candidate.connected){s.host=candidate.id;break;}}}
 if(!connected){if(active(s))pause(s,d,`${p.name} disconnected`);if(s.host===id){const index=s.players.indexOf(p);for(let i=1;i<=s.players.length;i++){const next=s.players[(index+i)%s.players.length];if(next.connected){s.host=next.id;break;}}}}
 s.seq++;
}
export function tick(s:State,d:Dependencies):boolean{
 if(s.paused)return false;
 let changed=false;const e=s.effects[0];
 if(e?.viewUntil!==undefined&&d.now()>=e.viewUntil){s.effects.shift();changed=true;log(s,'Private peek ended.');s.unlockAt=Math.max(s.unlockAt,d.now()+d.delay);}
 const count=s.reveals.length;s.reveals=s.reveals.filter(r=>r.until>d.now());if(count!==s.reveals.length)changed=true;
 if(changed){autoSkip(s);s.seq++;}return changed;
}
export function apply(s:State,d:Dependencies,actor:string,c:Command):Reply{
 const p=player(s,actor);
 need(c.game===s.game&&c.round===s.round,'This action belongs to an earlier game or round.','STALE');
 const host=()=>need(s.host===actor,'Only the host can do that.');
 const settled=()=>need(!s.effects.length&&d.now()>=s.visualUntil,'Wait for the card effects and movement.','WAIT');
 if(c.type==='abort'){host();s.phase='LOBBY';s.round=0;s.game++;s.history=[];s.deck=[];s.discard=[];s.held=undefined;s.effects=[];s.paused=undefined;s.open=false;s.movements=[];s.reveals=[];s.winners=[];s.caller=undefined;s.lastTurn=undefined;s.finalTurns=[];s.penalized=[];s.ending=false;s.incorrectApplied=false;s.next='';s.turn=0;s.window='';s.visualUntil=d.now();s.unlockAt=d.now();s.restartAt=0;for(const q of s.players){q.slots=[];q.ready=false;q.initial=undefined;q.hidden=false;}log(s,'Game returned to lobby.');}
 else if(c.type==='resume'){host();need(s.paused,'Game is not paused.');need(s.paused.reason!=='No cards available','Redeal this round to restore the card supply.');need(s.players.every(p=>p.connected),'Wait for all players to reconnect.');const shift=d.now()-s.paused.since+d.restart;s.visualUntil+=shift;s.unlockAt+=shift;for(const e of s.effects)if(e.viewUntil!==undefined)e.viewUntil+=shift;for(const r of s.reveals)r.until+=shift;for(const m of s.movements){m.start+=shift;m.end+=shift;}s.restartAt=d.now()+d.restart;s.paused=undefined;log(s,'Everyone is back. Resuming after the countdown.');}
 else if(c.type==='redeal'){host();need(s.paused?.reason==='No cards available','Redeal is only available when the card supply is exhausted.');need(s.players.every(p=>p.connected),'All players must be connected.');startRound(s,d,true);}
 else {
  need(!s.paused,'Room is paused.','PAUSED');need(d.now()>=s.restartAt,'Restart countdown is running.','WAIT');
  switch(c.type){
   case 'ready':need(['LOBBY','ROUND_RESULTS','GAME_RESULTS'].includes(s.phase),'Cannot change readiness during a round.');p.ready=c.ready;break;
   case 'start':host();need(['LOBBY','GAME_RESULTS'].includes(s.phase),'Game already started.');need(s.players.length>=2&&s.players.length<=10&&s.players.every(p=>p.ready&&p.connected),'Need 2–10 connected, ready players.');s.game++;s.round=0;s.history=[];s.winners=[];startRound(s,d);break;
   case 'next':host();need(s.phase==='ROUND_RESULTS'&&s.players.every(p=>p.ready&&p.connected),'All players must be ready.');startRound(s,d);break;
   case 'peekInitial':need(d.now()>=s.visualUntil,'Wait for the deal movement.','WAIT');need(s.phase==='INITIAL_PEEK'&&!p.initial&&!p.hidden,'Your initial peek has already been used.');need(c.slots.length===2&&new Set(c.slots.map(t=>t.slot)).size===2&&c.slots.every(t=>t.player===actor),'Choose exactly two different own slots.');c.slots.forEach(t=>slot(s,t));p.initial=c.slots.map(t=>t.slot);break;
   case 'hideInitial':need(s.phase==='INITIAL_PEEK'&&p.initial?.length===2&&!p.hidden,'Inspect two cards first.');p.hidden=true;p.ready=true;if(s.players.every(p=>p.hidden)){s.discard.push(supply(s,d)!);movement(s,d,'initial-discard','draw','discard',s.discard.at(-1)!.value);windowOpen(s,d);}break;
   case 'draw':need((s.phase==='INTER_TURN')&&s.open,'Drawing is unavailable.');need(c.window===s.window&&c.turn===s.turn,'Turn or matching window changed.','STALE');need(s.next===actor,'It is another player’s turn.');settled();need(d.now()>=s.unlockAt,'Matching opportunity is still protected.','EARLY');need(c.source==='draw'?available(s)>0:s.discard.length>0,'That pile is empty.');{const card=c.source==='draw'?supply(s,d)!:s.discard.pop()!;s.held={owner:actor,source:c.source,card};s.open=false;s.phase='HOLDING_DRAWN_CARD';s.lastTurn=undefined;movement(s,d,'draw',c.source,`held:${actor}`);}break;
   case 'resolveDraw':need(s.phase==='HOLDING_DRAWN_CARD'&&s.held?.owner===actor,'You are not holding a drawn card.');need(c.turn===s.turn,'Turn changed.','STALE');need(d.now()>=s.visualUntil,'Wait for the draw movement.','WAIT');{const held=s.held;let outgoing=held.card;let from=`held:${actor}`;if(c.target){need(c.target.player===actor,'Replace only your own occupied slot.');const v=slot(s,c.target);outgoing=v.card!;v.card=held.card;v.rev++;from=endpoint(actor,c.target.slot);movement(s,d,'replace',`held:${actor}`,from);effect(s,actor,outgoing.value);}else need(held.source==='draw','A discard-pile card must replace a grid card.');s.discard.push(outgoing);s.held=undefined;movement(s,d,'discard',from,'discard',outgoing.value);s.lastTurn=actor;s.turn++;if(s.caller){need(s.finalTurns[0]===actor,'Final turn order corrupted.','INTERNAL');s.finalTurns.shift();s.next=s.finalTurns[0]??s.caller;}else s.next=s.players[(s.players.indexOf(p)+1)%s.players.length].id;windowOpen(s,d);autoSkip(s);}break;
   case 'match':{
    need(active(s)&&s.phase!=='INITIAL_PEEK'&&!s.ending,'Matching is unavailable.');need(c.window===s.window,'This matching window is obsolete.','STALE');need(c.slots.length>0&&new Set(c.slots.map(t=>`${t.player}:${t.slot}`)).size===c.slots.length,'Select distinct cards.');need(c.slots.every(t=>t.player===actor),'Only match your own cards.');c.slots.forEach(t=>slot(s,t));const results:string[]=[];
    if(!s.open){need(s.phase==='HOLDING_DRAWN_CARD','Matching window closed.','STALE');penalty(s,d,p);for(const _t of c.slots){void _t;results.push('late');}}
    else{need(s.discard.length,'No discard available.');for(const t of c.slots){const v=slot(s,t);if(matches(v.card!.value,s.discard.at(-1)!.value)){const card=v.card!;v.card=undefined;v.rev++;s.discard.push(card);movement(s,d,'match',endpoint(actor,t.slot),'discard',card.value);results.push('matched');if(!occupied(p)){endRound(s,d);break;}effect(s,actor,card.value);}else {s.reveals.push({target:t,value:v.card!.value,until:Math.max(d.now(),s.visualUntil)+d.motion+800});movement(s,d,'wrong-match',endpoint(actor,t.slot),endpoint(actor,t.slot),v.card!.value);penalty(s,d,p);s.visualUntil=Math.max(s.visualUntil,...s.reveals.map(r=>r.until));s.unlockAt=Math.max(s.unlockAt,s.visualUntil+d.delay);results.push('wrong');if(s.paused)break;}}autoSkip(s);}
    s.seq++;return {ok:true,code:results.includes('late')?'LATE':results.includes('wrong')?'PENALTY':'OK',message:results.join(', '),seq:s.seq,results};}
   case 'effect':{
    const e=s.effects[0];need(e&&e.id===c.effect,'Effect changed.','STALE');need(e.actor===actor,'Another player owns this effect.');need(!e.viewUntil,'Finish the current private peek.');need(d.now()>=s.visualUntil,'Wait for card movement.','WAIT');
    if(c.skip){s.effects.shift();log(s,`${p.name} skipped an effect.`);s.unlockAt=d.now()+d.delay;break;}
    if(e.kind===1){need(c.recipient&&c.recipient!==actor&&c.recipient!==s.caller,'Choose another non-immune player.');const recipient=player(s,c.recipient);need(available(s)>0,'No cards available for Give.');append(s,d,recipient,supply(s,d)!,'give');log(s,`${p.name} gave ${recipient.name} an unknown card.`);s.effects.shift();}
    else{const targets=c.targets??[];need(targets.length===(e.kind===11?2:1),'Choose the required targets.');need(targets.every(t=>t.player!==s.caller),'The Archduke caller is immune.');const slots=targets.map(t=>slot(s,t));if(e.kind===11){need(targets[0].player!==targets[1].player,'Swap between two different players.');[slots[0].card,slots[1].card]=[slots[1].card,slots[0].card];slots.forEach(v=>v.rev++);movement(s,d,'swap',endpoint(targets[0].player,targets[0].slot),endpoint(targets[1].player,targets[1].slot));s.effects.shift();log(s,`${p.name} swapped the selected cards.`);}else {e.target=targets[0];e.value=slots[0].card!.value;movement(s,d,'peek',endpoint(targets[0].player,targets[0].slot),endpoint(targets[0].player,targets[0].slot));e.viewUntil=s.visualUntil+d.peek;s.unlockAt=e.viewUntil+d.delay;log(s,`${p.name} is privately inspecting a card.`);}}
    autoSkip(s);break;}
   case 'done':{const e=s.effects[0];need(e&&e.id===c.effect&&e.actor===actor&&e.viewUntil!==undefined,'No active private peek.');s.effects.shift();s.unlockAt=Math.max(d.now(),s.visualUntil)+d.delay;autoSkip(s);break;}
   case 'call':need(s.open&&s.phase==='INTER_TURN'&&!s.caller&&s.lastTurn===actor,'Only the player who just finished a turn can call.');need(c.window===s.window&&c.turn===s.turn,'Turn changed.','STALE');settled();s.caller=actor;s.finalTurns=Array.from({length:s.players.length-1},(_,i)=>s.players[(s.players.indexOf(p)+i+1)%s.players.length].id);log(s,`${p.name} called Archduke. Everyone else has one final turn.`);break;
   case 'finish':need(s.phase==='FINAL_MATCH_WINDOW'&&s.caller===actor&&s.open,'Only the caller may finish the final matching window.');need(c.window===s.window,'Matching window changed.','STALE');settled();need(d.now()>=s.unlockAt,'Wait for the final matching opportunity.','EARLY');endRound(s,d);break;
   case 'pause':host();need(active(s),'No active round.');pause(s,d,'Host paused the round');break;
  }
 }
 s.seq++;return {ok:true,code:'OK',message:'Accepted',seq:s.seq};
}
export function project(s:State,d:Dependencies,you:string,persistence:'memory'|'sqlite'='memory'):View{
 const now=s.paused?.since??d.now();const scoring=['ROUND_RESULTS','GAME_RESULTS'].includes(s.phase);
 return {room:s.room,code:s.code,invite:s.invite,you,host:s.host,game:s.game,round:s.round,seq:s.seq,phase:s.phase,serverNow:d.now(),
 players:s.players.map(p=>({id:p.id,name:p.name,connected:p.connected,ready:p.ready,peeked:!!p.initial,slots:p.slots.map((v,index)=>{
 let value:number|undefined;if(v.card){if(scoring)value=v.card.value;
 else if(p.id===you&&s.phase==='INITIAL_PEEK'&&!p.hidden&&p.initial?.includes(index))value=v.card.value;
 else if(s.reveals.some(r=>r.target.player===p.id&&r.target.slot===index&&r.target.rev===v.rev&&r.until>now))value=v.card.value;
 else {const e=s.effects[0];if(e?.actor===you&&e.viewUntil!==undefined&&e.viewUntil>now&&e.target?.player===p.id&&e.target.slot===index&&e.target.rev===v.rev)value=e.value;}}
 return {index,rev:v.rev,occupied:!!v.card,...(value===undefined?{}:{value})};})})),
 next:s.next,turn:s.turn,window:s.window,open:s.open,unlockAt:s.unlockAt,visualUntil:s.visualUntil,restartAt:s.restartAt,
 drawCount:s.deck.length,discardCount:s.discard.length,discard:s.discard.at(-1)?.value,
 held:s.held?{owner:s.held.owner,source:s.held.source,...(s.held.owner===you?{value:s.held.card.value}:{})}:undefined,
 effects:s.effects.map(e=>({id:e.id,actor:e.actor,kind:e.kind,viewUntil:e.viewUntil,target:e.target})),caller:s.caller,finalTurns:s.finalTurns,
 paused:s.paused,movements:s.movements.filter(m=>m.end>now-500),activity:s.activity,history:s.history,winners:s.winners,lastTurn:s.lastTurn,acks:Object.fromEntries(Object.entries(s.acks[you]??{}).slice(-32)),persistence};
}
