import { describe,it,expect } from 'vitest';
import { apply,project,tick,connection } from '../src/engine/engine';
import { createState,newPlayer,deck,assertCards,type Dependencies } from '../src/engine/model';
import type { Command } from '../src/shared/protocol';
import { opponentPeek,peekBounds } from '../src/client/opponent-peek-layout';

function fixture(){
 let now=10000;const d:Dependencies={now:()=>now,randomInt:n=>n-1,motion:500,peek:3000,delay:1000,grace:60000,restart:1000};
 const s=createState('room','code','invite',newPlayer('p0','Ada'));s.players.push(newPlayer('p1','Bea'),newPlayer('p2','Cal'));s.game=1;s.round=1;s.phase='INTER_TURN';s.open=true;s.window='window';s.next='p1';s.deck=deck();
 for(const p of s.players){p.connected=true;p.columns=2;p.slots=Array.from({length:4},(_,i)=>({card:s.deck.pop()!,rev:1,row:i%2,column:Math.floor(i/2)}));}s.discard.push(s.deck.pop()!);s.effects=[{id:'peek',actor:'p0',kind:12}];
 const send=(actor:string,action:object)=>apply(s,d,actor,{id:crypto.randomUUID(),game:1,round:1,...action} as Command),select=(player='p1',rev=1)=>send('p0',{type:'effect',effect:'peek',targets:[{player,slot:2,rev}]});
 return {s,d,send,select,at:(t:number)=>{now=t;tick(s,d);}};
}
describe('private opponent Peek presentation',()=>{
 it('uses opaque instance identity, existing motion and three seconds of full viewing; only actor receives private data',()=>{
  const f=fixture(),card=f.s.players[1].slots[2].card!,before=f.s.players.map(p=>p.slots.map(s=>s.card));f.select();const e=f.s.effects[0],v=project(f.s,f.d,'p0'),peek=opponentPeek(v)!;
  expect(e.viewUntil).toBe(13500);expect(peek).toMatchObject({id:'peek',value:card.value,start:10000,readyAt:10500,until:13500,motion:500,target:{player:'p1',slot:2,rev:1}});expect(peek.cardId).not.toBe(String(card.id));expect(v.players[1].slots[2].cardId).toBe(peek.cardId);
  for(const id of ['p1','p2']){const other=project(f.s,f.d,id);expect(other.effects[0].peek).toBeUndefined();expect(other.effects[0]).not.toHaveProperty('value');expect(other.players[1].slots[2].value).toBeUndefined();expect(opponentPeek(other)).toBeUndefined();}
  expect(f.s.players.map(p=>p.slots.map(s=>s.card))).toEqual(before);assertCards(f.s);f.at(13499);expect(opponentPeek(project(f.s,f.d,'p0'))).toBeDefined();f.at(13500);expect(opponentPeek(project(f.s,f.d,'p0'))).toBeUndefined();expect(project(f.s,f.d,'p0').players[1].slots[2].value).toBeUndefined();
 });
 it('retains own-card peeks, immunity, actor authorization and stale-slot rejection',()=>{
  const f=fixture();expect(()=>f.send('p1',{type:'effect',effect:'peek',targets:[{player:'p0',slot:2,rev:1}]})).toThrow(/owns/);expect(()=>f.select('p1',0)).toThrow(/changed/);f.s.caller='p1';expect(()=>f.select()).toThrow(/immune/);f.select('p0');expect(f.s.effects[0].peek).toBeUndefined();expect(project(f.s,f.d,'p0').players[0].slots[2].value).toBeDefined();expect(opponentPeek(project(f.s,f.d,'p0'))).toBeUndefined();f.send('p0',{type:'done',effect:'peek'});expect(f.s.effects).toHaveLength(0);
 });
 it('reconstructs remaining time and identity across disconnect pause/resume, without replaying expired reveals',()=>{
  const f=fixture();f.select();f.at(11200);const before=opponentPeek(project(f.s,f.d,'p0'))!;connection(f.s,f.d,'p0',false);f.at(21200);connection(f.s,f.d,'p0',true);const after=opponentPeek(project(f.s,f.d,'p0'))!;
  expect(after.cardId).toBe(before.cardId);expect(after.start-before.start).toBe(11000);expect(after.until-before.until).toBe(11000);f.at(after.until);expect(opponentPeek(project(f.s,f.d,'p0'))).toBeUndefined();
 });
 it('does not render a different instance or revision if the target changed',()=>{
  const f=fixture();f.select();const v=project(f.s,f.d,'p0');v.players[1].slots[2].cardId='different';expect(opponentPeek(v)).toBeUndefined();v.players[1].slots[2].cardId=v.effects[0].peek!.cardId;v.players[1].slots[2].rev++;expect(opponentPeek(v)).toBeUndefined();
 });
});
describe('opponent-relative geometry',()=>{
 it.each([2,3,4,5,6])('centers over the selected hand for %i players, retains ratio, and leaves surrounding cards visible',count=>{
  for(const viewport of [{width:1280,height:800},{width:1440,height:900},{width:1920,height:1080},{width:820,height:1180},{width:1180,height:820}])for(let i=0;i<count-1;i++){
   const card={x:30+i*100,y:160,width:60,height:84},hand={x:card.x,y:card.y,width:125,height:173},r=peekBounds(card,hand,viewport,80,400);
   expect(r.width).toBeCloseTo(96);expect(r.width/r.height).toBeCloseTo(5/7);expect(r.x+r.width/2).toBeCloseTo(hand.x+hand.width/2);expect(r.y+r.height/2).toBeCloseTo(hand.y+hand.height/2);expect(r.width).toBeLessThan(hand.width);expect(r.height).toBeLessThan(hand.height);
  }
 });
 it('caps edge and short-viewport expansion inside safe bounds',()=>{
  const r=peekBounds({x:245,y:100,width:80,height:112},{x:240,y:95,width:165,height:230},{width:280,height:300},64,240);
  expect(r.x).toBeGreaterThanOrEqual(8);expect(r.x+r.width).toBeLessThanOrEqual(272);expect(r.y).toBeGreaterThanOrEqual(72);expect(r.y+r.height).toBeLessThanOrEqual(232);expect(r.width/r.height).toBeCloseTo(5/7);
 });
});
