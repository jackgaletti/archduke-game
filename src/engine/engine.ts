import { normalizeRows, reflowAfterRemoval, addToHand } from './hand.js';
import { MAX_PLAYERS, playerCountSchema } from '../shared/protocol.js';
import type { Command, Target, Reply, View, Result } from '../shared/protocol.js';
import { type State, type Dependencies, type Card, type Player, type Slot, need, deck, shuffle, matches, occupied, sum, newPlayer, createState } from './model.js';
const active=(s:State)=>!['LOBBY','NEXT_ROUND_COUNTDOWN','ROUND_RESULTS','GAME_RESULTS'].includes(s.phase);
const player=(s:State,id:string)=>{const p=[...s.players,...s.waiting??[]].find(p=>p.id===id);need(p,'Unknown seat');return p;};
const endpoint=(p:string,i:number)=>`${p}:${i}`;
const ident=(s:State)=>`${s.game}.${s.round}.${++s.serial}`;
function slot(s:State,t:Target):Slot {const p=player(s,t.player);const v=p.slots[t.slot];need(v?.card&&v.rev===t.rev,'The selected slot changed. Select again.','STALE');return v;}
function log(s:State,text:string){s.activity=[text,...s.activity].slice(0,12);}
function movement(s:State,d:Dependencies,kind:string,from:string,to:string,value?:number,privateTo?:string,at?:number,under?:number){
 const start=at??Math.max(d.now(),s.visualUntil); const end=start+d.motion;
 s.movements.push({id:ident(s),kind,from,to,start,end,...(privateTo?{privateTo}:{}),...(value===undefined?{}:{value}),...(under===undefined?{}:{under})});
 s.movements=s.movements.filter(m=>m.end>d.now()-1000).slice(-104);
 s.visualUntil=Math.max(s.visualUntil,end);
}
// A separate supply barrier: the current phase, held card and movement timeline stay intact.
function beginReshuffle(s:State,d:Dependencies,departure=false){
 if(s.reshufflePending||s.reshuffling||s.deck.length||s.discard.length<2)return false;
 const start=d.now(),moveAt=Math.max(start,s.visualUntil,...s.movements.filter(m=>m.to==='discard').map(m=>m.end+120))+(departure?d.motion:0)+250;
 s.reshuffling={id:ident(s),start,moveAt,end:moveAt+1700,count:s.discard.length-1,cards:[],collected:false};
 log(s,'The discard pile is reshuffling, keeping its top card.');return true;
}
function supply(s:State,d:Dependencies,normalDraw=false):Card|undefined{
 if(s.reshuffling)return;
 const card=s.deck.pop();
 // A hidden deck draw gets a fresh presentation alias; a recycled public face
 // must not be identifiable by its previous reveal token. Physical IDs stay intact.
 if(card&&s.cardTokens)delete s.cardTokens[card.id];
 if((normalDraw||s.held)&&!s.deck.length)s.reshufflePending=true;
 else beginReshuffle(s,d,!!card);
 return card;
}
const available=(s:State)=>s.deck.length+(s.reshuffling?.cards.length??0)+Math.max(0,s.discard.length-1);
function append(s:State,d:Dependencies,p:Player,c:Card,kind:string,animate=true){const index=p.slots.length;addToHand(p,{rev:1,card:c});if(animate)movement(s,d,kind,'draw',endpoint(p.id,index));}
function remembers(p:Player,c:Card){return (p.seen??=[]).includes(c.id);}
function remember(p:Player,c:Card){if(![11,12].includes(c.value)||remembers(p,c))return;p.seen!.push(c.id);}
function forget(p:Player,c:Card){p.seen=(p.seen??[]).filter(id=>id!==c.id);}
function matchKnown(s:State,d:Dependencies,p:Player,t:Target,v:Slot){normalizeRows(p);const overflow=occupied(p)>4;const card=v.card!;forget(p,card);v.card=undefined;v.rev++;if(overflow)reflowAfterRemoval(p,v.row!);s.discard.push(card);movement(s,d,'match',endpoint(p.id,t.slot),'discard',card.value,undefined,undefined,s.discard.at(-2)?.value);if(!occupied(p)){endRound(s,d);return;}effect(s,p.id,card.value);}

function blockSupply(s:State,d:Dependencies){pause(s,d,'No cards available');s.open=false;log(s,'No cards available. Host may redeal this round without awarding placements.');}
function penalty(s:State,d:Dependencies,p:Player,t:Target){
 const batch=s.pendingMatch!,attempt=batch.attempts?.find(a=>a.target.slot===t.slot)??{target:t,card:p.slots[t.slot].card!};
 const card=supply(s,d);
 if(!card){if(!s.reshuffling&&!s.reshufflePending)blockSupply(s,d);return false;}
 normalizeRows(p);const beforeColumns=p.columns!;
 append(s,d,p,card,'penalty',false);
 const token=(c:Card)=>(s.cardTokens??={})[c.id]??=ident(s);
 const events=s.invalidMatches=(s.invalidMatches??[]).filter(e=>e.end>d.now()-1000);
 const start=Math.max(d.now(),...events.filter(e=>e.player===p.id).map(e=>e.end));
 const at=p.slots.length-1,destination=p.slots[at];
 events.push({id:ident(s),room:s.room,game:s.game,round:s.round,turn:batch.turn??s.turn,window:batch.window??s.window,seq:s.seq+1,player:p.id,reason:batch.late?'late':'incorrect',
  attempted:{cardId:token(attempt.card),slot:t.slot,rev:t.rev,value:attempt.card.value},penalty:{cardId:token(card),slot:at,rev:destination.rev,row:destination.row!,column:destination.column!,beforeColumns},
  start,faceUpAt:start+360,shakeEnd:start+720,flightAt:start+1080,end:start+1080+d.motion});
 if(p.slots[t.slot]?.card?.id===attempt.card.id)remember(p,attempt.card);
 log(s,`${p.name} received one unknown matching penalty card.`);return true;
}
function matchReply(s:State,results:string[],queued=false):Reply{return {ok:true,code:queued?'QUEUED':results.includes('late')?'LATE':results.includes('wrong')?'PENALTY':'OK',message:results.join(', '),seq:s.seq,results:[...results]};}
function continueMatch(s:State,d:Dependencies){
 const batch=s.pendingMatch!;const p=player(s,batch.actor);
 while(batch.slots.length&&!s.reshuffling&&!s.paused){
  const t=batch.slots[0],v=batch.late?undefined:slot(s,t);
  if(batch.late){if(!penalty(s,d,p,t)&&(s.reshuffling||s.reshufflePending))break;batch.results.push('late');}
  else if(matches(v!.card!.value,s.discard.at(-1)!.value)){
   matchKnown(s,d,p,t,v!);batch.results.push('matched');
   if(!occupied(p)){batch.slots=[];break;}
  }else{
   // If no card is currently drawable, defer this entire attempt until supply resumes.
   if(!s.deck.length&&(s.reshufflePending||beginReshuffle(s,d)))break;
   penalty(s,d,p,t);batch.results.push('wrong');
  }
  batch.slots.shift();
 }
 if(!batch.slots.length||s.paused){s.pendingMatch=undefined;autoSkip(s);}
 if(s.acks[batch.actor]?.[batch.id])s.acks[batch.actor][batch.id]=matchReply(s,batch.results,!!s.pendingMatch);
}

function effect(s:State,actor:string,value:number){if(value===1||value===11||value===12)s.effects.push({id:ident(s),actor,kind:value});}
function legalTargets(s:State){return s.players.filter(p=>p.id!==s.caller&&occupied(p));}
function autoSkip(s:State){
 while(s.effects.length){const e=s.effects[0];const eligible=legalTargets(s);
  const possible=e.kind===1?s.players.some(p=>p.id!==e.actor&&p.id!==s.caller)&&available(s)>0:e.kind===11?eligible.length>=2:eligible.length>0;
  if(possible)break;s.effects.shift();log(s,`${player(s,e.actor).name}'s effect skipped: no legal target or card supply.`);
 }
}
function windowOpen(s:State,d:Dependencies){s.window=ident(s);s.open=true;s.phase=s.caller&&!s.finalTurns.length?'FINAL_MATCH_WINDOW':'INTER_TURN';s.unlockAt=d.now();}
function matchingOpen(s:State){return s.open||(s.effects.length>0&&['INTER_TURN','FINAL_MATCH_WINDOW'].includes(s.phase));}
export function startRound(s:State,d:Dependencies,redeal=false){
 const starter=(redeal?s.round===1:s.round===0)?s.players[d.randomInt(s.players.length)].id:s.history.at(-1)!.at(-1)!.player;
 if(!redeal)s.round++;
 if(redeal||s.round===1)s.roundStartsAt=undefined;
 s.invalidMatches=[];s.cardTokens={};
 s.reshufflePending=undefined;s.reshuffling=undefined;s.pendingMatch=undefined;s.ranking=undefined;
 s.deck=shuffle(deck(),d.randomInt);s.discard=[];s.held=undefined;s.effects=[];s.caller=undefined;s.finalTurns=[];s.lastTurn=undefined;s.open=false;s.window='';s.incorrectApplied=false;s.ending=false;s.paused=undefined;s.reveals=[];s.movements=[];s.next=starter;s.turn=0;s.visualUntil=d.now();s.unlockAt=d.now();s.restartAt=0;s.phase='INITIAL_PEEK';s.finalEndsAt=undefined;s.betweenRounds=false;
 for(const p of s.players){p.slots=Array.from({length:4},(_,i)=>({rev:1,card:s.deck.pop()!,row:i%2,column:Math.floor(i/2)}));p.columns=2;p.initial=undefined;p.initialOpen=[];p.seen=[];p.hidden=false;p.ready=false;p.reviewingResults=false;p.viewingLeaderboard=false;for(let i=0;i<4;i++){const start=d.now()+i*40;s.movements.push({id:ident(s),kind:'deal',from:'draw',to:endpoint(p.id,i),start,end:start+d.motion});}}
 s.visualUntil=d.now()+120+d.motion;
 s.initialPeek={revealAt:s.visualUntil,hideAt:s.visualUntil+2360,finishAt:s.visualUntil+2720,stage:0};
 log(s,`Round ${s.round}: automatic bottom-row peek.`);
}
export const roomLobby=(s:State)=>s.phase==='LOBBY'&&!s.betweenRounds;
export function canStartGame(s:State,d:Dependencies){
 const eligible=s.players.filter(p=>p.connected||p.rejoinUntil!==undefined&&d.now()<p.rejoinUntil);
 return roomLobby(s)&&s.players.length<=MAX_PLAYERS&&playerCountSchema.safeParse(eligible.length).success&&eligible.every(p=>p.connected&&p.ready);
}
function returnToLobby(s:State,d:Dependencies){
 const participants=[...s.players,...s.waiting??[]].map(p=>({...newPlayer(p.id,p.name),connected:p.connected,rejoinUntil:p.connected?undefined:d.now()+d.grace}));
 const clean=createState(s.room,s.code,s.invite,participants.find(p=>p.id===s.host)!);
 const preserved={players:participants,host:s.host,game:s.game+1,seq:s.seq,serial:s.serial,acks:s.acks};
 // Recreate only match data. Sessions, invitations and socket controllers live on the room.
 for(const key of Object.keys(s))Reflect.deleteProperty(s,key);
 Object.assign(s,clean,preserved);
}
function beginReadyRound(s:State,d:Dependencies){
 if(!s.betweenRounds||s.round===4){s.game++;s.round=0;s.history=[];s.winners=[];}
 startRound(s,d);
}
function maybeBeginReadyRound(s:State,d:Dependencies){
 if(!s.betweenRounds||!['LOBBY'].includes(s.phase)||!playerCountSchema.safeParse(s.players.length).success)return;
 if(s.round>=1&&s.round<4&&s.players.every(p=>p.ready&&p.connected&&!p.reviewingResults)){s.phase='NEXT_ROUND_COUNTDOWN';s.roundStartsAt??=d.now()+3000;}
}
function prepareNextRound(s:State,d:Dependencies){
 s.reshufflePending=undefined;s.reshuffling=undefined;s.pendingMatch=undefined;s.ranking=undefined;
 s.phase='LOBBY';s.betweenRounds=true;s.deck=deck();s.discard=[];s.held=undefined;s.caller=undefined;s.lastTurn=undefined;s.finalTurns=[];s.finalEndsAt=undefined;s.effects=[];s.movements=[];s.reveals=[];s.next='';s.open=false;
 for(const p of s.players){p.slots=[];p.columns=2;p.reviewingResults=false;p.viewingLeaderboard=false;p.initial=undefined;p.initialOpen=[];p.seen=[];p.hidden=false;}
 maybeBeginReadyRound(s,d);
}
function rank(s:State,d:Dependencies):Result[]|undefined{
 const rows=s.players.map(p=>({player:p.id,sum:sum(p),count:occupied(p),lowest:Math.min(...p.slots.flatMap(x=>x.card?[x.card.value]:[]),Infinity),place:0,tie:''}));
 const primary=(a:Result,b:Result)=>a.sum-b.sum||a.count-b.count||a.lowest-b.lowest;
 rows.sort(primary);
 for(const row of rows){const tied=rows.filter(other=>other.sum===row.sum);if(tied.length>1){if(tied.some(other=>other.count!==row.count))row.tie=`Card count: ${row.count}`;if(tied.some(other=>other.count===row.count&&other.lowest!==row.lowest))row.tie+=`${row.tie?' → ':''}Lowest card: ${row.lowest}`;}}

 if(!s.ranking){
  const groups:Result[][]=[];
  for(let i=0;i<rows.length;){let j=i+1;while(j<rows.length&&primary(rows[i],rows[j])===0)j++;groups.push(rows.slice(i,j));i=j;}
  s.ranking={groups,result:[],drawn:[]};
 }
 const ranking=s.ranking;
 while(ranking.groups.length){
  const group=ranking.groups[0];
  if(group.length<2){ranking.result.push(...group);ranking.groups.shift();continue;}
  if(!ranking.drawn.length&&available(s)<group.length){for(const r of group)r.tie='Random tie order (exhausted supply fallback)';ranking.result.push(...shuffle(group,d.randomInt));ranking.groups.shift();continue;}
  while(ranking.drawn.length<group.length){
   const card=supply(s,d);
   if(!card)return;
   ranking.drawn.push({row:group[ranking.drawn.length],card});
   if(s.reshuffling)return;
  }
  const drawn=ranking.drawn;drawn.sort((a,b)=>a.card.value-b.card.value);
  for(const {row,card} of drawn)row.tie+=`${row.tie?' → ':''}Tie-break ${card.value}`;
  s.deck=shuffle([...s.deck,...drawn.map(x=>x.card)],d.randomInt);ranking.drawn=[];
  const groups:Result[][]=[];
  for(let i=0;i<drawn.length;){let j=i+1;while(j<drawn.length&&drawn[j].card.value===drawn[i].card.value)j++;groups.push(drawn.slice(i,j).map(x=>x.row));i=j;}
  ranking.groups.splice(0,1,...groups);
 }
 const result=ranking.result.map((r,i)=>({...r,lowest:Number.isFinite(r.lowest)?r.lowest:0,place:i+1}));s.ranking=undefined;return result;
}

function endRound(s:State,d:Dependencies){
 if(s.history.length>=s.round)return;
 if(s.reshuffling){s.ending=true;s.open=false;s.effects=[];s.reveals=[];return;}
 s.ending=true;s.open=false;s.effects=[];s.reveals=[];
 if(s.caller&&!s.incorrectApplied){const p=player(s,s.caller);if(sum(p)>Math.min(...s.players.map(sum))){const c=supply(s,d);if(!c){if(!s.reshuffling)blockSupply(s,d);return;}append(s,d,p,c,'incorrect-call');log(s,`${p.name} received the incorrect-call penalty.`);}s.incorrectApplied=true;}
 if(s.reshuffling)return;
 const result=rank(s,d);if(!result)return;s.history.push(result);s.phase=s.round===4?'GAME_RESULTS':'ROUND_RESULTS';s.ending=false;
 for(const p of s.players){p.ready=false;p.reviewingResults=true;p.viewingLeaderboard=false;}
 movement(s,d,'round-reveal','table','table');log(s,`${player(s,result.at(-1)!.player).name} got dead last!`);
 if(s.round===4){const totals=s.players.map(p=>({id:p.id,total:s.history.reduce((n,r)=>n+r.find(x=>x.player===p.id)!.place,0)}));const best=Math.min(...totals.map(x=>x.total));s.winners=totals.filter(x=>x.total===best).map(x=>x.id);}
}
export function pause(s:State,d:Dependencies,reason:string){if(!s.paused)s.paused={reason,since:d.now(),graceUntil:d.now()+d.grace};}
export function connection(s:State,d:Dependencies,id:string,connected:boolean){
 const p=player(s,id);p.connected=connected;
 if((s.waiting??[]).some(q=>q.id===id)){p.ready=false;s.seq++;return;}
 if(roomLobby(s)){p.rejoinUntil=connected?undefined:d.now()+d.grace;if(!connected)p.ready=false;}
 if(connected&&!player(s,s.host).connected){const index=s.players.findIndex(p=>p.id===s.host);for(let i=1;i<=s.players.length;i++){const candidate=s.players[(index+i)%s.players.length];if(candidate.connected){s.host=candidate.id;break;}}}
 if(!connected){if(active(s)||s.roundStartsAt!==undefined)pause(s,d,`${p.name} disconnected`);if(s.host===id){const index=s.players.indexOf(p);for(let i=1;i<=s.players.length;i++){const next=s.players[(index+i)%s.players.length];if(next.connected){s.host=next.id;break;}}}}
 if(connected&&s.paused&&s.paused.reason!=='No cards available'&&s.players.every(p=>p.connected))resumeRound(s,d);
 if(connected)maybeBeginReadyRound(s,d);
 s.seq++;
}
function resumeRound(s:State,d:Dependencies){
 if(s.reshuffling){const shift=d.now()-s.paused!.since+d.restart;s.reshuffling.start+=shift;s.reshuffling.moveAt+=shift;s.reshuffling.end+=shift;}
 const paused=s.paused!;const shift=d.now()-paused.since+d.restart;s.visualUntil+=shift;s.unlockAt+=shift;if(s.roundStartsAt!==undefined)s.roundStartsAt+=shift;if(s.initialPeek){s.initialPeek.revealAt+=shift;s.initialPeek.hideAt+=shift;s.initialPeek.finishAt+=shift;}if(s.finalEndsAt!==undefined)s.finalEndsAt+=shift;for(const e of s.effects)if(e.viewUntil!==undefined)e.viewUntil+=shift;for(const r of s.reveals)r.until+=shift;for(const m of s.movements){m.start+=shift;m.end+=shift;}s.restartAt=d.now()+d.restart;s.paused=undefined;log(s,'Everyone is back. Resuming automatically.');
}
function finalDeadline(s:State,d:Dependencies){
 if(s.reshuffling||s.ending)return;
 if(s.phase!=='FINAL_MATCH_WINDOW'){s.finalEndsAt=undefined;return;}
 if(s.effects.length){s.finalEndsAt=undefined;return;}
 s.finalEndsAt??=Math.max(d.now(),s.visualUntil)+3000;
}
export function tick(s:State,d:Dependencies):boolean{
 if(s.paused||s.players.length>MAX_PLAYERS)return false;
 let changed=false;
 if(s.phase==='NEXT_ROUND_COUNTDOWN'&&s.betweenRounds&&s.roundStartsAt!==undefined&&d.now()>=s.roundStartsAt&&s.players.every(p=>p.connected&&p.ready&&!p.reviewingResults)){beginReadyRound(s,d);s.seq++;return true;}
 if(s.reshuffling){
  const reshuffle=s.reshuffling;
  if(!reshuffle.collected&&d.now()>=reshuffle.moveAt){
   reshuffle.cards=shuffle(s.discard.splice(0,s.discard.length-1),d.randomInt);reshuffle.collected=true;changed=true;
  }
  if(d.now()>=reshuffle.end){
   s.deck=reshuffle.cards;s.reshuffling=undefined;
   // Freeze only eligibility deadlines, never the existing card movement timeline.
   const shift=d.now()-reshuffle.start;
   if(s.unlockAt>reshuffle.start)s.unlockAt+=shift;
   if(s.finalEndsAt!==undefined)s.finalEndsAt+=shift;
   if(s.pendingMatch)continueMatch(s,d);
   if(s.ending&&!s.reshuffling)endRound(s,d);
   changed=true;
  }
 }
 // Also recover an older snapshot with an already-empty deck and recyclable discards.
 if(active(s)&&s.phase!=='INITIAL_PEEK'&&beginReshuffle(s,d))changed=true;
 const initial=s.initialPeek;
 if(s.phase==='INITIAL_PEEK'&&initial){
  if(initial.stage===0&&d.now()>=initial.revealAt){const delay=d.now()-initial.revealAt;initial.revealAt+=delay;initial.hideAt+=delay;initial.finishAt+=delay;initial.stage=1;s.roundStartsAt=undefined;for(const p of s.players){p.initial=[1,3];p.initialOpen=[1,3];for(const index of p.initial){const card=p.slots[index]?.card;if(card)remember(p,card);}}changed=true;}
  if(initial.stage===1&&d.now()>=initial.hideAt){initial.stage=2;for(const p of s.players)p.initialOpen=[];changed=true;}
  if(initial.stage===2&&d.now()>=initial.finishAt){for(const p of s.players){p.hidden=true;p.ready=true;}s.discard.push(supply(s,d)!);movement(s,d,'initial-discard','draw','discard',s.discard.at(-1)!.value);windowOpen(s,d);s.initialPeek=undefined;changed=true;}
 }
 const e=s.effects[0];
 if(e?.viewUntil!==undefined&&d.now()>=e.viewUntil){s.effects.shift();changed=true;log(s,'Private peek ended.');}
 const count=s.reveals.length;s.reveals=s.reveals.filter(r=>r.until>d.now());if(count!==s.reveals.length)changed=true;
 autoSkip(s);const previous=s.finalEndsAt;finalDeadline(s,d);if(previous!==s.finalEndsAt)changed=true;
 if(!s.reshuffling&&s.finalEndsAt!==undefined&&d.now()>=s.finalEndsAt&&d.now()>=s.restartAt){endRound(s,d);s.finalEndsAt=undefined;changed=true;}
 if(changed)s.seq++;return changed;
}
export function canCallArchduke(s:State,d:Dependencies,actor:string){
 return !s.reshuffling&&!s.ending&&s.players.length<=MAX_PLAYERS&&!s.paused&&d.now()>=s.restartAt&&s.open&&s.phase==='INTER_TURN'&&!s.caller&&s.lastTurn===actor&&!s.effects.length&&d.now()>=s.visualUntil;
}
export function apply(s:State,d:Dependencies,actor:string,c:Command):Reply{
 const p=player(s,actor);
 need(!(s.waiting??[]).some(q=>q.id===actor),'A game is in progress.','WAIT');
 need(s.players.length<=MAX_PLAYERS,'This saved room exceeds the six-player limit. Seats are preserved; create a new room to play.','INCOMPATIBLE_ROOM');
 need(c.game===s.game&&c.round===s.round,'This action belongs to an earlier game or round.','STALE');
 const host=()=>need(s.host===actor,'Only the host can do that.');
 const settled=()=>need(!s.effects.length&&d.now()>=s.visualUntil,'Wait for the card effects and movement.','WAIT');
 if(c.type==='abort'){host();if(!roomLobby(s))returnToLobby(s,d);}
 else if(c.type==='resume'){host();need(s.paused,'Game is not paused.');need(s.paused.reason!=='No cards available','Redeal this round to restore the card supply.');need(s.players.every(p=>p.connected),'Wait for all players to reconnect.');resumeRound(s,d);}
 else if(c.type==='redeal'){host();need(s.paused?.reason==='No cards available','Redeal is only available when the card supply is exhausted.');need(s.players.every(p=>p.connected),'All players must be connected.');startRound(s,d,true);}
 else {
  need(!s.reshuffling,'','WAIT');
  need(!(s.phase==='FINAL_MATCH_WINDOW'&&s.finalEndsAt!==undefined&&d.now()>=s.finalEndsAt&&c.type!=='finish'),'The final matching window has closed.','STALE');need(!s.paused,'Room is paused.','PAUSED');need(d.now()>=s.restartAt,'Restart countdown is running.','WAIT');
  switch(c.type){
   case 'ready':need(['LOBBY','NEXT_ROUND_COUNTDOWN','ROUND_RESULTS','GAME_RESULTS'].includes(s.phase),'Cannot change readiness during a round.');need(!p.reviewingResults,'Continue from the results first.');need((!roomLobby(s)&&s.roundStartsAt===undefined)||c.ready,'Readiness is one-way in this lobby or countdown.');p.ready=c.ready;if(c.ready)maybeBeginReadyRound(s,d);break;
   case 'start':host();need(canStartGame(s,d),'Need 2–6 connected, ready players.');{
    const absent=s.players.filter(q=>!q.connected);s.players=s.players.filter(q=>q.connected);s.waiting=[...s.waiting??[],...absent.map(q=>({...q,ready:false}))];
    beginReadyRound(s,d);
   }break;
   case 'next':need(['ROUND_RESULTS','GAME_RESULTS'].includes(s.phase)||s.phase==='LOBBY'&&s.betweenRounds,'Results are not ready.');if(p.reviewingResults&&!p.viewingLeaderboard){p.viewingLeaderboard=true;break;}if(s.phase==='GAME_RESULTS'){returnToLobby(s,d);break;}p.reviewingResults=false;p.viewingLeaderboard=false;if(['ROUND_RESULTS','GAME_RESULTS'].includes(s.phase)&&s.players.every(q=>!q.reviewingResults))prepareNextRound(s,d);break;
   case 'peekInitial':need(false,'Initial peeking is automatic.');break;
   case 'draw':need((s.phase==='INTER_TURN')&&s.open,'Drawing is unavailable.');need(c.window===s.window&&c.turn===s.turn,'Turn or matching window changed.','STALE');need(s.next===actor,'It is another player’s turn.');need(!s.effects.length&&!s.ending,'Resolve the required card effect first.','WAIT');need(c.source==='draw'?s.deck.length>0:s.discard.length>0,'That pile is empty.');{s.open=false;const card=c.source==='draw'?supply(s,d,true)!:s.discard.pop()!;remember(p,card);s.held={id:ident(s),owner:actor,source:c.source,card};s.phase='HOLDING_DRAWN_CARD';s.lastTurn=undefined;movement(s,d,'draw',c.source,`held:${actor}`,card.value,c.source==='draw'?actor:undefined);}break;
   case 'resolveDraw':need(s.phase==='HOLDING_DRAWN_CARD'&&s.held?.owner===actor,'You are not holding a drawn card.');need(c.turn===s.turn,'Turn changed.','STALE');need(d.now()>=s.visualUntil,'Wait for the draw movement.','WAIT');{const held=s.held;const at=Math.max(d.now(),s.visualUntil);let outgoing=held.card;let from=`held:${actor}`;if(c.target){need(c.target.player===actor,'Replace only your own occupied slot.');const v=slot(s,c.target);outgoing=v.card!;forget(p,outgoing);v.card=held.card;v.rev++;from=endpoint(actor,c.target.slot);movement(s,d,'replace',`held:${actor}`,from,held.card.value,held.source==='draw'?actor:undefined,at);effect(s,actor,outgoing.value);}else {need(held.source==='draw','A discard-pile card must replace a grid card.');forget(p,outgoing);}s.discard.push(outgoing);const underlying=s.discard.at(-2)?.value;s.held=undefined;s.reshufflePending=undefined;movement(s,d,'discard',from,'discard',outgoing.value,undefined,at,underlying);s.lastTurn=actor;s.turn++;if(s.caller){need(s.finalTurns[0]===actor,'Final turn order corrupted.','INTERNAL');s.finalTurns.shift();s.next=s.finalTurns[0]??s.caller;}else s.next=s.players[(s.players.indexOf(p)+1)%s.players.length].id;windowOpen(s,d);autoSkip(s);}break;
   case 'match':{
    need(active(s)&&s.phase!=='INITIAL_PEEK'&&!s.ending,'Matching is unavailable.');need(c.window===s.window,'This matching window is obsolete.','STALE');need(c.slots.length>0&&new Set(c.slots.map(t=>`${t.player}:${t.slot}`)).size===c.slots.length,'Select distinct cards.');need(c.slots.every(t=>t.player===actor),'Only match your own cards.');c.slots.forEach(t=>slot(s,t));need(!s.pendingMatch,'','WAIT');const late=!matchingOpen(s);
    if(late)need(s.phase==='HOLDING_DRAWN_CARD','Matching window closed.','STALE');else need(s.discard.length,'No discard available.');
    s.pendingMatch={actor,id:c.id,window:c.window,turn:s.turn,attempts:c.slots.map(target=>({target,card:slot(s,target).card!})),slots:[...c.slots],late,results:[]};
    const batch=s.pendingMatch;continueMatch(s,d);finalDeadline(s,d);s.seq++;
    return matchReply(s,batch.results,!!s.pendingMatch);}

   case 'effect':{
    const e=s.effects[0];need(e&&e.id===c.effect,'Effect changed.','STALE');need(e.actor===actor,'Another player owns this effect.');need(!e.viewUntil,'Finish the current private peek.');need(d.now()>=s.visualUntil,'Wait for card movement.','WAIT');
    if(c.skip){s.effects.shift();log(s,`${p.name} skipped an effect.`);break;}
    if(e.kind===1){need(c.recipient&&c.recipient!==actor&&c.recipient!==s.caller,'Choose another non-immune player.');need(s.players.some(p=>p.id===c.recipient),'Choose an active player.');const recipient=player(s,c.recipient);need(s.deck.length>0,'No cards available for Give.');const card=supply(s,d);need(card,'Deck is reshuffling.','WAIT');append(s,d,recipient,card,'give');log(s,`${p.name} gave ${recipient.name} an unknown card.`);s.effects.shift();}
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
     else {if(targets[0].player===actor)remember(p,selected.card!);e.target=targets[0];e.value=selected.card!.value;movement(s,d,'peek',endpoint(targets[0].player,targets[0].slot),endpoint(targets[0].player,targets[0].slot));e.viewUntil=s.visualUntil+d.peek;if(targets[0].player!==actor)e.peek={cardId:(s.cardTokens??={})[selected.card!.id]??=ident(s),motion:d.motion,duration:d.peek};log(s,`${p.name} is privately inspecting a card.`);}
    }
    autoSkip(s);break;}
   case 'done':{const e=s.effects[0];need(e&&e.id===c.effect&&e.actor===actor&&e.viewUntil!==undefined,'No active private peek.');s.effects.shift();autoSkip(s);break;}
   case 'call':need(canCallArchduke(s,d,actor),'Only the player who just finished a turn can call.');need(c.window===s.window&&c.turn===s.turn,'Turn changed.','STALE');settled();s.caller=actor;s.movements.push({id:ident(s),kind:'call',from:'archduke',to:'table',start:d.now(),end:d.now()+1350});s.finalTurns=Array.from({length:s.players.length-1},(_,i)=>s.players[(s.players.indexOf(p)+i+1)%s.players.length].id);log(s,`${p.name} called Archduke. Everyone else has one final turn.`);break;
   case 'finish':need(s.phase==='FINAL_MATCH_WINDOW'&&s.caller===actor&&s.open,'Only the caller may finish the final matching window.');need(c.window===s.window,'Matching window changed.','STALE');settled();need(s.finalEndsAt!==undefined&&d.now()>=s.finalEndsAt,'Wait for the three-second final matching opportunity.','EARLY');endRound(s,d);break;
   case 'pause':host();need(active(s),'No active round.');pause(s,d,'Host paused the round');break;
  }
 }
 if(active(s)&&s.phase!=='INITIAL_PEEK'){beginReshuffle(s,d);if(s.pendingMatch&&!s.held&&!s.deck.length&&!s.reshuffling)blockSupply(s,d);}
 finalDeadline(s,d);s.seq++;return {ok:true,code:'OK',message:'Accepted',seq:s.seq};
}
export function project(s:State,d:Dependencies,you:string,persistence:'memory'|'sqlite'='memory'):View{
 const waiting=(s.waiting??[]).some(p=>p.id===you);
 if(roomLobby(s)||waiting){
  const participants=[...s.players,...s.waiting??[]];
  return {room:s.room,code:s.code,invite:s.invite,you,host:s.host,game:s.game,round:waiting?s.round:0,seq:s.seq,phase:'LOBBY',serverNow:d.now(),
   lobby:{inProgress:waiting,canStart:!waiting&&canStartGame(s,d),players:participants.map(p=>({id:p.id,name:p.name,connected:p.connected,ready:!waiting&&p.connected&&p.ready}))},
   players:participants.map(p=>({id:p.id,name:p.name,connected:p.connected,ready:!waiting&&p.connected&&p.ready,peeked:false,columns:2,slots:[]})),
   next:'',turn:0,window:'',open:false,unlockAt:0,visualUntil:0,restartAt:0,drawCount:0,discardCount:0,effects:[],finalTurns:[],movements:[],activity:[],history:[],winners:[],canCallArchduke:false,acks:Object.fromEntries(Object.entries(s.acks[you]??{}).slice(-32)),...(participants.length>MAX_PLAYERS?{incompatible:'This saved room exceeds the six-player limit. Seats are preserved; create a new room to play.'}:{}),persistence};
 }
 const now=s.paused?.since??d.now();const scoring=['ROUND_RESULTS','GAME_RESULTS'].includes(s.phase);
 return {room:s.room,code:s.code,invite:s.invite,you,host:s.host,game:s.game,round:s.round,seq:s.seq,phase:s.phase,serverNow:d.now(),initialPeek:s.phase==='INITIAL_PEEK'&&s.initialPeek?{revealAt:s.initialPeek.revealAt,hideAt:s.initialPeek.hideAt,finishAt:s.initialPeek.finishAt}:undefined,
 players:s.players.map(p=>({id:p.id,name:p.name,connected:p.connected,ready:p.ready,reviewingResults:p.reviewingResults,viewingLeaderboard:p.viewingLeaderboard,peeked:p.hidden,columns:p.columns??Math.max(2,Math.ceil(p.slots.length/2)),...(p.id===you&&s.phase==='INITIAL_PEEK'?{initialViewed:p.initial??[],initialOpen:p.initialOpen??[]}:{}),slots:p.slots.map((v,index)=>{
 let value:number|undefined;if(v.card){if(scoring)value=v.card.value;
 else if(p.id===you&&s.phase==='INITIAL_PEEK'&&s.initialPeek&&s.initialPeek.stage>0&&now>=s.initialPeek.revealAt&&now<s.initialPeek.finishAt&&[1,3].includes(index))value=v.card.value;
 else if(s.reveals.some(r=>r.target.player===p.id&&r.target.slot===index&&r.target.rev===v.rev&&r.until>now))value=v.card.value;
 else {const e=s.effects[0];if(e?.actor===you&&e.viewUntil!==undefined&&e.viewUntil>now&&e.target?.player===p.id&&e.target.slot===index&&e.target.rev===v.rev)value=e.value;}}
 return {index,rev:v.rev,row:v.row??index%2,column:v.column??Math.floor(index/2),occupied:!!v.card,...(v.card&&s.cardTokens?.[v.card.id]?{cardId:s.cardTokens[v.card.id]}:{}),...(value===undefined?{}:{value})};})})),
 next:s.next,turn:s.turn,window:s.window,open:matchingOpen(s),unlockAt:s.unlockAt,visualUntil:s.visualUntil,restartAt:s.restartAt,finalEndsAt:s.finalEndsAt,betweenRounds:s.betweenRounds,roundStartsAt:s.roundStartsAt,
 reshufflePending:s.reshufflePending,reshuffling:s.reshuffling?{id:s.reshuffling.id,start:s.reshuffling.start,moveAt:s.reshuffling.moveAt,end:s.reshuffling.end,count:s.reshuffling.count}:undefined,drawCount:s.deck.length,discardCount:s.discard.length,discard:s.discard.at(-1)?.value,
 held:s.held?{id:s.held.id,owner:s.held.owner,source:s.held.source,...((s.held.owner===you||s.held.source==='discard')?{value:s.held.card.value}:{})}:undefined,
 effects:s.effects.map(e=>({id:e.id,actor:e.actor,kind:e.kind,viewUntil:e.viewUntil,target:e.target,...(e.actor===you&&e.peek?{peek:e.peek}:{}),...(e.actor===you&&e.targets?{targets:e.targets}:{})})),caller:s.caller,finalTurns:s.finalTurns,
 invalidMatches:(s.invalidMatches??[]).filter(e=>e.end>d.now()-1000),paused:s.paused,movements:s.movements.filter(m=>m.end>now-500).map(({privateTo,value,...m})=>({...m,...(value!==undefined&&(!privateTo||privateTo===you)?{value}:{})})),activity:s.activity,history:s.history,winners:s.winners,canCallArchduke:canCallArchduke(s,d,you),...(s.players.length>MAX_PLAYERS?{incompatible:'This saved room exceeds the six-player limit. Seats are preserved; create a new room to play.'}:{}),lastTurn:s.lastTurn,acks:Object.fromEntries(Object.entries(s.acks[you]??{}).slice(-32)),persistence};
}
