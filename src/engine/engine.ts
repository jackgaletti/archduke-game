import { MAX_PLAYERS, playerCountSchema } from '../shared/protocol.js';
import type { Command, Target, Reply, View, Result } from '../shared/protocol.js';
import { type State, type Dependencies, type Card, type Player, type Slot, need, deck, shuffle, matches, occupied, sum } from './model.js';
const active=(s:State)=>!['LOBBY','ROUND_RESULTS','GAME_RESULTS'].includes(s.phase);
const player=(s:State,id:string)=>{const p=s.players.find(p=>p.id===id);need(p,'Unknown seat');return p;};
const endpoint=(p:string,i:number)=>`${p}:${i}`;
const ident=(s:State)=>`${s.game}.${s.round}.${++s.serial}`;
function slot(s:State,t:Target):Slot {const p=player(s,t.player);const v=p.slots[t.slot];need(v?.card&&v.rev===t.rev,'The selected slot changed. Select again.','STALE');return v;}
function log(s:State,text:string){s.activity=[text,...s.activity].slice(0,12);}
function movement(s:State,d:Dependencies,kind:string,from:string,to:string,value?:number,privateTo?:string,at?:number,under?:number){
 const start=at??Math.max(d.now(),s.visualUntil); const end=start+d.motion;
 s.movements.push({id:ident(s),kind,from,to,start,end,...(privateTo?{privateTo}:{}),...(value===undefined?{}:{value}),...(under===undefined?{}:{under})});
 s.movements=s.movements.filter(m=>m.end>d.now()-1000).slice(-104);
 s.visualUntil=Math.max(s.visualUntil,end);s.unlockAt=Math.max(s.unlockAt,end+d.delay);
}
function supply(s:State,d:Dependencies):Card|undefined{
 if(!s.deck.length&&s.discard.length>1){const top=s.discard.pop()!;s.deck=shuffle(s.discard,d.randomInt);s.discard=[top];movement(s,d,'recycle','discard','draw');log(s,'The discard pile was shuffled, keeping its top card.');}
 return s.deck.pop();
}
const available=(s:State)=>s.deck.length+Math.max(0,s.discard.length-1);
function normalizeRows(p:Player){p.slots.forEach((slot,i)=>{slot.row??=i%2;slot.column??=Math.floor(i/2);});p.columns=Math.max(p.columns??2,...p.slots.map(s=>(s.column??0)+1));}
function append(s:State,d:Dependencies,p:Player,c:Card,kind:string){normalizeRows(p);const counts=[0,1].map(row=>p.slots.filter(s=>s.card&&s.row===row).length);const row=counts[0]<=counts[1]?0:1,index=p.slots.length;p.slots.push({rev:1,card:c,row,column:counts[row]});p.columns=Math.max(p.columns!,counts[row]+1);movement(s,d,kind,'draw',endpoint(p.id,index));}
function closeRow(p:Player,row:number){let column=0;for(const slot of p.slots)if(slot.card&&slot.row===row)slot.column=column++;}
function remembers(p:Player,c:Card){return (p.seen??=[]).includes(c.id);}
function remember(p:Player,c:Card){if(!remembers(p,c))p.seen!.push(c.id);}
function forget(p:Player,c:Card){p.seen=(p.seen??[]).filter(id=>id!==c.id);}
function matchKnown(s:State,d:Dependencies,p:Player,t:Target,v:Slot){normalizeRows(p);const card=v.card!;forget(p,card);v.card=undefined;v.rev++;closeRow(p,v.row!);s.discard.push(card);movement(s,d,'match',endpoint(p.id,t.slot),'discard',card.value,undefined,undefined,s.discard.at(-2)?.value);if(!occupied(p)){endRound(s,d);return;}effect(s,p.id,card.value);}

function blockSupply(s:State,d:Dependencies){pause(s,d,'No cards available');s.open=false;log(s,'No cards available. Host may redeal this round without awarding placements.');}
function penalty(s:State,d:Dependencies,p:Player){
 const card=supply(s,d);
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
function windowOpen(s:State,d:Dependencies){s.window=ident(s);s.open=true;s.phase=s.caller&&!s.finalTurns.length?'FINAL_MATCH_WINDOW':'INTER_TURN';s.unlockAt=Math.max(s.visualUntil,d.now())+d.delay;}
function matchingOpen(s:State){return s.open||(s.effects.length>0&&['INTER_TURN','FINAL_MATCH_WINDOW'].includes(s.phase));}
export function startRound(s:State,d:Dependencies,redeal=false){
 const starter=(redeal?s.round===1:s.round===0)?s.players[d.randomInt(s.players.length)].id:s.history.at(-1)!.at(-1)!.player;
 if(!redeal)s.round++;
 s.deck=shuffle(deck(),d.randomInt);s.discard=[];s.held=undefined;s.effects=[];s.caller=undefined;s.finalTurns=[];s.lastTurn=undefined;s.open=false;s.window='';s.incorrectApplied=false;s.ending=false;s.paused=undefined;s.reveals=[];s.movements=[];s.next=starter;s.turn=0;s.visualUntil=d.now();s.unlockAt=d.now();s.restartAt=0;s.phase='INITIAL_PEEK';s.finalEndsAt=undefined;s.betweenRounds=false;
 for(const p of s.players){p.slots=Array.from({length:4},(_,i)=>({rev:1,card:s.deck.pop()!,row:i%2,column:Math.floor(i/2)}));p.columns=2;p.initial=undefined;p.initialOpen=[];p.seen=[];p.hidden=false;p.ready=false;p.reviewingResults=false;p.viewingLeaderboard=false;for(let i=0;i<4;i++){const start=d.now()+i*40;s.movements.push({id:ident(s),kind:'deal',from:'draw',to:endpoint(p.id,i),start,end:start+d.motion});}}
 s.visualUntil=d.now()+120+d.motion;
 s.initialPeek={revealAt:s.visualUntil,hideAt:s.visualUntil+2360,finishAt:s.visualUntil+2720,stage:0};
 log(s,`Round ${s.round}: automatic bottom-row peek.`);
}
function beginReadyRound(s:State,d:Dependencies){
 if(!s.betweenRounds||s.round===4){s.game++;s.round=0;s.history=[];s.winners=[];}
 startRound(s,d);
}
function maybeBeginReadyRound(s:State,d:Dependencies){
 if(!['LOBBY'].includes(s.phase)||!playerCountSchema.safeParse(s.players.length).success)return;
 if(s.players.every(p=>p.ready&&p.connected&&!p.reviewingResults))beginReadyRound(s,d);
}
function prepareNextRound(s:State,d:Dependencies){
 s.phase='LOBBY';s.betweenRounds=true;s.deck=deck();s.discard=[];s.held=undefined;s.caller=undefined;s.lastTurn=undefined;s.finalTurns=[];s.finalEndsAt=undefined;s.effects=[];s.movements=[];s.reveals=[];s.next='';s.open=false;
 for(const p of s.players){p.slots=[];p.reviewingResults=false;p.viewingLeaderboard=false;p.initial=undefined;p.initialOpen=[];p.seen=[];p.hidden=false;}
 maybeBeginReadyRound(s,d);
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
 for(const p of s.players){p.ready=false;p.reviewingResults=true;p.viewingLeaderboard=false;}
 movement(s,d,'round-reveal','table','table');log(s,`${player(s,result.at(-1)!.player).name} got dead last!`);
 if(s.round===4){const totals=s.players.map(p=>({id:p.id,total:s.history.reduce((n,r)=>n+r.find(x=>x.player===p.id)!.place,0)}));const best=Math.min(...totals.map(x=>x.total));s.winners=totals.filter(x=>x.total===best).map(x=>x.id);}
}
export function pause(s:State,d:Dependencies,reason:string){if(!s.paused)s.paused={reason,since:d.now(),graceUntil:d.now()+d.grace};}
export function connection(s:State,d:Dependencies,id:string,connected:boolean){
 const p=player(s,id);p.connected=connected;
 if(connected&&!player(s,s.host).connected){const index=s.players.findIndex(p=>p.id===s.host);for(let i=1;i<=s.players.length;i++){const candidate=s.players[(index+i)%s.players.length];if(candidate.connected){s.host=candidate.id;break;}}}
 if(!connected){if(active(s))pause(s,d,`${p.name} disconnected`);if(s.host===id){const index=s.players.indexOf(p);for(let i=1;i<=s.players.length;i++){const next=s.players[(index+i)%s.players.length];if(next.connected){s.host=next.id;break;}}}}
 if(connected&&s.paused&&s.paused.reason!=='No cards available'&&s.players.every(p=>p.connected))resumeRound(s,d);
 if(connected)maybeBeginReadyRound(s,d);
 s.seq++;
}
function resumeRound(s:State,d:Dependencies){
 const paused=s.paused!;const shift=d.now()-paused.since+d.restart;s.visualUntil+=shift;s.unlockAt+=shift;if(s.initialPeek){s.initialPeek.revealAt+=shift;s.initialPeek.hideAt+=shift;s.initialPeek.finishAt+=shift;}if(s.finalEndsAt!==undefined)s.finalEndsAt+=shift;for(const e of s.effects)if(e.viewUntil!==undefined)e.viewUntil+=shift;for(const r of s.reveals)r.until+=shift;for(const m of s.movements){m.start+=shift;m.end+=shift;}s.restartAt=d.now()+d.restart;s.paused=undefined;log(s,'Everyone is back. Resuming automatically.');
}
function finalDeadline(s:State,d:Dependencies){
 if(s.phase!=='FINAL_MATCH_WINDOW'){s.finalEndsAt=undefined;return;}
 if(s.effects.length){s.finalEndsAt=undefined;return;}
 s.finalEndsAt??=Math.max(d.now(),s.visualUntil)+3000;
}
export function tick(s:State,d:Dependencies):boolean{
 if(s.paused||s.players.length>MAX_PLAYERS)return false;
 let changed=false;const initial=s.initialPeek;
 if(s.phase==='INITIAL_PEEK'&&initial){
  if(initial.stage===0&&d.now()>=initial.revealAt){const delay=d.now()-initial.revealAt;initial.revealAt+=delay;initial.hideAt+=delay;initial.finishAt+=delay;initial.stage=1;for(const p of s.players){p.initial=[1,3];p.initialOpen=[1,3];for(const index of p.initial){const card=p.slots[index]?.card;if(card)remember(p,card);}}changed=true;}
  if(initial.stage===1&&d.now()>=initial.hideAt){initial.stage=2;for(const p of s.players)p.initialOpen=[];changed=true;}
  if(initial.stage===2&&d.now()>=initial.finishAt){for(const p of s.players){p.hidden=true;p.ready=true;}s.discard.push(supply(s,d)!);movement(s,d,'initial-discard','draw','discard',s.discard.at(-1)!.value);windowOpen(s,d);s.initialPeek=undefined;changed=true;}
 }
 const e=s.effects[0];
 if(e?.viewUntil!==undefined&&d.now()>=e.viewUntil){s.effects.shift();changed=true;log(s,'Private peek ended.');s.unlockAt=Math.max(s.unlockAt,d.now()+d.delay);}
 const count=s.reveals.length;s.reveals=s.reveals.filter(r=>r.until>d.now());if(count!==s.reveals.length)changed=true;
 autoSkip(s);const previous=s.finalEndsAt;finalDeadline(s,d);if(previous!==s.finalEndsAt)changed=true;
 if(s.finalEndsAt!==undefined&&d.now()>=s.finalEndsAt&&d.now()>=s.restartAt){endRound(s,d);s.finalEndsAt=undefined;changed=true;}
 if(changed)s.seq++;return changed;
}
export function canCallArchduke(s:State,d:Dependencies,actor:string){
 return s.players.length<=MAX_PLAYERS&&!s.paused&&d.now()>=s.restartAt&&s.open&&s.phase==='INTER_TURN'&&!s.caller&&s.lastTurn===actor&&!s.effects.length&&d.now()>=s.visualUntil;
}
export function apply(s:State,d:Dependencies,actor:string,c:Command):Reply{
 const p=player(s,actor);
 need(s.players.length<=MAX_PLAYERS,'This saved room exceeds the six-player limit. Seats are preserved; create a new room to play.','INCOMPATIBLE_ROOM');
 need(c.game===s.game&&c.round===s.round,'This action belongs to an earlier game or round.','STALE');
 const host=()=>need(s.host===actor,'Only the host can do that.');
 const settled=()=>need(!s.effects.length&&d.now()>=s.visualUntil,'Wait for the card effects and movement.','WAIT');
 if(c.type==='abort'){host();s.phase='LOBBY';s.betweenRounds=false;s.finalEndsAt=undefined;s.round=0;s.game++;s.history=[];s.deck=deck();s.discard=[];s.held=undefined;s.effects=[];s.paused=undefined;s.open=false;s.movements=[];s.reveals=[];s.winners=[];s.caller=undefined;s.lastTurn=undefined;s.finalTurns=[];s.ending=false;s.incorrectApplied=false;s.next='';s.turn=0;s.window='';s.visualUntil=d.now();s.unlockAt=d.now();s.restartAt=0;for(const q of s.players){q.slots=[];q.ready=false;q.reviewingResults=false;q.viewingLeaderboard=false;q.initial=undefined;q.initialOpen=[];q.seen=[];q.hidden=false;}log(s,'Game returned to lobby.');}
 else if(c.type==='resume'){host();need(s.paused,'Game is not paused.');need(s.paused.reason!=='No cards available','Redeal this round to restore the card supply.');need(s.players.every(p=>p.connected),'Wait for all players to reconnect.');resumeRound(s,d);}
 else if(c.type==='redeal'){host();need(s.paused?.reason==='No cards available','Redeal is only available when the card supply is exhausted.');need(s.players.every(p=>p.connected),'All players must be connected.');startRound(s,d,true);}
 else {
  need(!(s.phase==='FINAL_MATCH_WINDOW'&&s.finalEndsAt!==undefined&&d.now()>=s.finalEndsAt&&c.type!=='finish'),'The final matching window has closed.','STALE');need(!s.paused,'Room is paused.','PAUSED');need(d.now()>=s.restartAt,'Restart countdown is running.','WAIT');
  switch(c.type){
   case 'ready':need(['LOBBY','ROUND_RESULTS','GAME_RESULTS'].includes(s.phase),'Cannot change readiness during a round.');need(!p.reviewingResults,'Continue from the results first.');p.ready=c.ready;if(c.ready)maybeBeginReadyRound(s,d);break;
   case 'start':host();need(['LOBBY','GAME_RESULTS'].includes(s.phase),'Game already started.');need(playerCountSchema.safeParse(s.players.length).success&&s.players.every(p=>p.ready&&p.connected&&!p.reviewingResults),'Need 2–6 connected, ready players.');beginReadyRound(s,d);break;
   case 'next':need(['ROUND_RESULTS','GAME_RESULTS'].includes(s.phase)||s.phase==='LOBBY'&&s.betweenRounds,'Results are not ready.');if(p.reviewingResults&&!p.viewingLeaderboard){p.viewingLeaderboard=true;break;}p.reviewingResults=false;p.viewingLeaderboard=false;if(['ROUND_RESULTS','GAME_RESULTS'].includes(s.phase)&&s.players.every(q=>!q.reviewingResults))prepareNextRound(s,d);break;
   case 'peekInitial':need(false,'Initial peeking is automatic.');break;
   case 'draw':need((s.phase==='INTER_TURN')&&s.open,'Drawing is unavailable.');need(c.window===s.window&&c.turn===s.turn,'Turn or matching window changed.','STALE');need(s.next===actor,'It is another player’s turn.');settled();need(d.now()>=s.unlockAt,'Matching opportunity is still protected.','EARLY');need(c.source==='draw'?available(s)>0:s.discard.length>0,'That pile is empty.');{const card=c.source==='draw'?supply(s,d)!:s.discard.pop()!;remember(p,card);s.held={id:ident(s),owner:actor,source:c.source,card};s.open=false;s.phase='HOLDING_DRAWN_CARD';s.lastTurn=undefined;movement(s,d,'draw',c.source,`held:${actor}`,card.value,c.source==='draw'?actor:undefined);}break;
   case 'resolveDraw':need(s.phase==='HOLDING_DRAWN_CARD'&&s.held?.owner===actor,'You are not holding a drawn card.');need(c.turn===s.turn,'Turn changed.','STALE');need(d.now()>=s.visualUntil,'Wait for the draw movement.','WAIT');{const held=s.held;const at=Math.max(d.now(),s.visualUntil);let outgoing=held.card;let from=`held:${actor}`;if(c.target){need(c.target.player===actor,'Replace only your own occupied slot.');const v=slot(s,c.target);outgoing=v.card!;forget(p,outgoing);v.card=held.card;v.rev++;from=endpoint(actor,c.target.slot);movement(s,d,'replace',`held:${actor}`,from,held.card.value,held.source==='draw'?actor:undefined,at);effect(s,actor,outgoing.value);}else {need(held.source==='draw','A discard-pile card must replace a grid card.');forget(p,outgoing);}s.discard.push(outgoing);const underlying=s.discard.at(-2)?.value;s.held=undefined;movement(s,d,'discard',from,'discard',outgoing.value,undefined,at,underlying);s.lastTurn=actor;s.turn++;if(s.caller){need(s.finalTurns[0]===actor,'Final turn order corrupted.','INTERNAL');s.finalTurns.shift();s.next=s.finalTurns[0]??s.caller;}else s.next=s.players[(s.players.indexOf(p)+1)%s.players.length].id;windowOpen(s,d);autoSkip(s);}break;
   case 'match':{
    need(active(s)&&s.phase!=='INITIAL_PEEK'&&!s.ending,'Matching is unavailable.');need(c.window===s.window,'This matching window is obsolete.','STALE');need(c.slots.length>0&&new Set(c.slots.map(t=>`${t.player}:${t.slot}`)).size===c.slots.length,'Select distinct cards.');need(c.slots.every(t=>t.player===actor),'Only match your own cards.');c.slots.forEach(t=>slot(s,t));const results:string[]=[];
    if(!matchingOpen(s)){need(s.phase==='HOLDING_DRAWN_CARD','Matching window closed.','STALE');for(const _t of c.slots){void _t;penalty(s,d,p);results.push('late');if(s.paused)break;}}
    else{need(s.discard.length,'No discard available.');for(const t of c.slots){const v=slot(s,t);if(matches(v.card!.value,s.discard.at(-1)!.value)){matchKnown(s,d,p,t,v);results.push('matched');if(!occupied(p))break;}else {remember(p,v.card!);s.reveals.push({target:t,value:v.card!.value,until:Math.max(d.now(),s.visualUntil)+d.motion+800});movement(s,d,'wrong-match',endpoint(actor,t.slot),endpoint(actor,t.slot),v.card!.value);penalty(s,d,p);s.visualUntil=Math.max(s.visualUntil,...s.reveals.map(r=>r.until));s.unlockAt=Math.max(s.unlockAt,s.visualUntil+d.delay);results.push('wrong');if(s.paused)break;}}autoSkip(s);}
    finalDeadline(s,d);s.seq++;return {ok:true,code:results.includes('late')?'LATE':results.includes('wrong')?'PENALTY':'OK',message:results.join(', '),seq:s.seq,results};}
   case 'effect':{
    const e=s.effects[0];need(e&&e.id===c.effect,'Effect changed.','STALE');need(e.actor===actor,'Another player owns this effect.');need(!e.viewUntil,'Finish the current private peek.');need(d.now()>=s.visualUntil,'Wait for card movement.','WAIT');
    if(c.skip){s.effects.shift();log(s,`${p.name} skipped an effect.`);s.unlockAt=d.now()+d.delay;break;}
    if(e.kind===1){need(c.recipient&&c.recipient!==actor&&c.recipient!==s.caller,'Choose another non-immune player.');const recipient=player(s,c.recipient);need(available(s)>0,'No cards available for Give.');append(s,d,recipient,supply(s,d)!,'give');log(s,`${p.name} gave ${recipient.name} an unknown card.`);s.effects.shift();}
    else if(e.kind===11){
     const targets=c.targets??[];need(targets.length<=2,'Choose no more than two targets.');
     if(!targets.length){e.targets=undefined;break;}
     need(targets.every(t=>t.player!==s.caller),'The Archduke caller is immune.');const slots=targets.map(t=>slot(s,t));
     if(targets.length===1){
      const own=targets[0].player===actor;
      if(own&&remembers(p,slots[0].card!)&&s.discard.length&&matches(slots[0].card!.value,s.discard.at(-1)!.value)){matchKnown(s,d,p,targets[0],slots[0]);log(s,`${p.name} matched a known card while choosing a Swap target.`);}
      else e.targets=targets;
     }else if(!e.targets&&targets[0].player===actor&&remembers(p,slots[0].card!)&&s.discard.length&&matches(slots[0].card!.value,s.discard.at(-1)!.value)){
      matchKnown(s,d,p,targets[0],slots[0]);log(s,`${p.name} matched a known card while choosing a Swap target.`);
     }else{
      if(e.targets?.length)need(e.targets[0].player===targets[0].player&&e.targets[0].slot===targets[0].slot&&e.targets[0].rev===targets[0].rev,'The first Swap target changed.','STALE');
      need(targets[0].player!==targets[1].player,'Swap between two different players.');const owners=targets.map(t=>player(s,t.player));const cards=slots.map(v=>v.card!);forget(owners[0],cards[0]);forget(owners[1],cards[1]);[slots[0].card,slots[1].card]=[cards[1],cards[0]];slots.forEach(v=>v.rev++);movement(s,d,'swap',endpoint(targets[0].player,targets[0].slot),endpoint(targets[1].player,targets[1].slot));s.effects.shift();log(s,`${p.name} swapped the selected cards.`);
     }
    }else{
     const targets=c.targets??[];need(targets.length===1,'Choose the required target.');need(targets[0].player!==s.caller,'The Archduke caller is immune.');const selected=slot(s,targets[0]);
     if(targets[0].player===actor&&remembers(p,selected.card!)&&s.discard.length&&matches(selected.card!.value,s.discard.at(-1)!.value)){matchKnown(s,d,p,targets[0],selected);log(s,`${p.name} matched a known card while choosing a Peek target.`);}
     else {if(targets[0].player===actor)remember(p,selected.card!);e.target=targets[0];e.value=selected.card!.value;movement(s,d,'peek',endpoint(targets[0].player,targets[0].slot),endpoint(targets[0].player,targets[0].slot));e.viewUntil=s.visualUntil+d.peek;s.unlockAt=e.viewUntil+d.delay;log(s,`${p.name} is privately inspecting a card.`);}
    }
    autoSkip(s);break;}
   case 'done':{const e=s.effects[0];need(e&&e.id===c.effect&&e.actor===actor&&e.viewUntil!==undefined,'No active private peek.');s.effects.shift();s.unlockAt=Math.max(d.now(),s.visualUntil)+d.delay;autoSkip(s);break;}
   case 'call':need(canCallArchduke(s,d,actor),'Only the player who just finished a turn can call.');need(c.window===s.window&&c.turn===s.turn,'Turn changed.','STALE');settled();s.caller=actor;s.movements.push({id:ident(s),kind:'call',from:'archduke',to:'table',start:d.now(),end:d.now()+1350});s.finalTurns=Array.from({length:s.players.length-1},(_,i)=>s.players[(s.players.indexOf(p)+i+1)%s.players.length].id);log(s,`${p.name} called Archduke. Everyone else has one final turn.`);break;
   case 'finish':need(s.phase==='FINAL_MATCH_WINDOW'&&s.caller===actor&&s.open,'Only the caller may finish the final matching window.');need(c.window===s.window,'Matching window changed.','STALE');settled();need(s.finalEndsAt!==undefined&&d.now()>=s.finalEndsAt,'Wait for the three-second final matching opportunity.','EARLY');endRound(s,d);break;
   case 'pause':host();need(active(s),'No active round.');pause(s,d,'Host paused the round');break;
  }
 }
 finalDeadline(s,d);s.seq++;return {ok:true,code:'OK',message:'Accepted',seq:s.seq};
}
export function project(s:State,d:Dependencies,you:string,persistence:'memory'|'sqlite'='memory'):View{
 const now=s.paused?.since??d.now();const scoring=['ROUND_RESULTS','GAME_RESULTS'].includes(s.phase);
 return {room:s.room,code:s.code,invite:s.invite,you,host:s.host,game:s.game,round:s.round,seq:s.seq,phase:s.phase,serverNow:d.now(),initialPeek:s.phase==='INITIAL_PEEK'&&s.initialPeek?{revealAt:s.initialPeek.revealAt,hideAt:s.initialPeek.hideAt,finishAt:s.initialPeek.finishAt}:undefined,
 players:s.players.map(p=>({id:p.id,name:p.name,connected:p.connected,ready:p.ready,reviewingResults:p.reviewingResults,viewingLeaderboard:p.viewingLeaderboard,peeked:p.hidden,columns:p.columns??Math.max(2,Math.ceil(p.slots.length/2)),...(p.id===you&&s.phase==='INITIAL_PEEK'?{initialViewed:p.initial??[],initialOpen:p.initialOpen??[]}:{}),slots:p.slots.map((v,index)=>{
 let value:number|undefined;if(v.card){if(scoring)value=v.card.value;
 else if(p.id===you&&s.phase==='INITIAL_PEEK'&&s.initialPeek&&s.initialPeek.stage>0&&now>=s.initialPeek.revealAt&&now<s.initialPeek.finishAt&&[1,3].includes(index))value=v.card.value;
 else if(s.reveals.some(r=>r.target.player===p.id&&r.target.slot===index&&r.target.rev===v.rev&&r.until>now))value=v.card.value;
 else {const e=s.effects[0];if(e?.actor===you&&e.viewUntil!==undefined&&e.viewUntil>now&&e.target?.player===p.id&&e.target.slot===index&&e.target.rev===v.rev)value=e.value;}}
 return {index,rev:v.rev,row:v.row??index%2,column:v.column??Math.floor(index/2),occupied:!!v.card,...(value===undefined?{}:{value})};})})),
 next:s.next,turn:s.turn,window:s.window,open:matchingOpen(s),unlockAt:s.unlockAt,visualUntil:s.visualUntil,restartAt:s.restartAt,finalEndsAt:s.finalEndsAt,betweenRounds:s.betweenRounds,
 drawCount:s.deck.length,discardCount:s.discard.length,discard:s.discard.at(-1)?.value,
 held:s.held?{id:s.held.id,owner:s.held.owner,source:s.held.source,...((s.held.owner===you||s.held.source==='discard')?{value:s.held.card.value}:{})}:undefined,
 effects:s.effects.map(e=>({id:e.id,actor:e.actor,kind:e.kind,viewUntil:e.viewUntil,target:e.target,...(e.actor===you&&e.targets?{targets:e.targets}:{})})),caller:s.caller,finalTurns:s.finalTurns,
 paused:s.paused,movements:s.movements.filter(m=>m.end>now-500).map(({privateTo,value,...m})=>({...m,...(value!==undefined&&(!privateTo||privateTo===you)?{value}:{})})),activity:s.activity,history:s.history,winners:s.winners,canCallArchduke:canCallArchduke(s,d,you),...(s.players.length>MAX_PLAYERS?{incompatible:'This saved room exceeds the six-player limit. Seats are preserved; create a new room to play.'}:{}),lastTurn:s.lastTurn,acks:Object.fromEntries(Object.entries(s.acks[you]??{}).slice(-32)),persistence};
}
