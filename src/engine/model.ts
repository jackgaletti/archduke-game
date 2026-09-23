import type { Phase, Movement, Result, Reply, Target, Reshuffle, InvalidMatch, PeekPresentation } from '../shared/protocol.js';
export type Card = {id:number;value:number};
export type Slot = {rev:number;card?:Card;row?:number;column?:number};
export type Player = {id:string;name:string;connected:boolean;ready:boolean;rejoinUntil?:number;reviewingResults?:boolean;viewingLeaderboard?:boolean;slots:Slot[];columns?:number;initial?:number[];initialOpen?:number[];seen?:number[];hidden:boolean};
export type Effect = {id:string;actor:string;kind:1|11|12;target?:Target;targets?:Target[];viewUntil?:number;peek?:PeekPresentation;value?:number};
export type State = {
 room:string;code:string;invite:string;host:string;game:number;round:number;seq:number;phase:Phase;players:Player[];waiting?:Player[];
 deck:Card[];discard:Card[];held?:{id:string;owner:string;source:'draw'|'discard';card:Card};
 reshufflePending?:boolean;
 reshuffling?:(Reshuffle & {cards:Card[];collected:boolean});
 invalidMatches?:InvalidMatch[];cardTokens?:Record<number,string>;
 pendingMatch?:{window?:string;turn?:number;attempts?:{target:Target;card:Card}[];actor:string;id:string;slots:Target[];late:boolean;results:string[]};
 ranking?:{groups:Result[][];result:Result[];drawn:{row:Result;card:Card}[]};
 initialPeek?:{revealAt:number;hideAt:number;finishAt:number;stage:number};next:string;turn:number;window:string;open:boolean;unlockAt:number;visualUntil:number;restartAt:number;finalEndsAt?:number;betweenRounds?:boolean;roundStartsAt?:number;
 effects:Effect[];caller?:string;finalTurns:string[];lastTurn?:string;
 paused?:{reason:string;since:number;graceUntil:number};ending?:boolean;incorrectApplied:boolean;
 movements:(Movement & {privateTo?:string})[];reveals:{target:Target;value:number;until:number}[];activity:string[];history:Result[][];winners:string[];
 acks:Record<string,Record<string,Reply>>;serial:number;
};
export type Dependencies = {now:()=>number;randomInt:(max:number)=>number;delay:number;motion:number;peek:number;grace:number;restart:number};
export class RuleError extends Error { constructor(public code:string,message:string) {super(message);} }
export function need(condition:unknown,message:string,code='ILLEGAL'):asserts condition {if(!condition)throw new RuleError(code,message);}
export function deck():Card[]{
 const cards:Card[]=[];
 for(const [value,copies] of [[-3,2],[0,4],...Array.from({length:10},(_,i)=>[i+1,8]),[11,6],[12,8],[13,4]])
  for(let i=0;i<copies;i++)cards.push({id:cards.length,value});
 return cards;
}
export function shuffle<T>(items:T[],randomInt:Dependencies['randomInt']):T[]{
 for(let i=items.length-1;i>0;i--){const j=randomInt(i+1);need(j>=0&&j<=i,'Invalid random source');[items[i],items[j]]=[items[j],items[i]];}
 return items;
}
export const matches=(a:number,b:number)=>a===b||([0,13].includes(a)&&[0,13].includes(b));
export const occupied=(p:Player)=>p.slots.filter(s=>s.card).length;
export const sum=(p:Player)=>p.slots.reduce((n,s)=>n+(s.card?.value??0),0);
export function createState(room:string,code:string,invite:string,host:Player):State{
 return {room,code,invite,host:host.id,game:0,round:0,seq:0,phase:'LOBBY',players:[host],waiting:[],deck:[],discard:[],next:'',turn:0,window:'',open:false,unlockAt:0,visualUntil:0,restartAt:0,effects:[],finalTurns:[],incorrectApplied:false,movements:[],reveals:[],activity:[],history:[],winners:[],acks:{},serial:0};
}
export function newPlayer(id:string,name:string):Player{return {id,name,connected:false,ready:false,reviewingResults:false,viewingLeaderboard:false,slots:[],seen:[],hidden:false};}
export function assertCards(s:State){
 if(!s.round)return;
 const all=[...(s.reshuffling?.cards??[]),...(s.ranking?.drawn.map(x=>x.card)??[]),...s.deck,...s.discard,...s.players.flatMap(p=>p.slots.flatMap(t=>t.card?[t.card]:[])),...(s.held?[s.held.card]:[])];
 need(all.length===104&&new Set(all.map(c=>c.id)).size===104,'Card conservation invariant violated','INTERNAL');
}
