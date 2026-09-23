import { describe, expect, it } from 'vitest';
import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assertCards, createState, deck, newPlayer, shuffle, type Dependencies, type State } from '../src/engine/model';
import { apply, connection, project, startRound, tick } from '../src/engine/engine';
import { Rooms } from '../src/server/rooms';
import { MemoryStore } from '../src/server/store';
import { config } from '../src/server/config';

const ids=(cards:{id:number}[])=>cards.map(c=>c.id);
const all=(s:State)=>[...s.deck,...s.discard,...s.players.flatMap(p=>p.slots.flatMap(slot=>slot.card?[slot.card]:[])),...(s.held?[s.held.card]:[]),...s.reshuffling?.cards??[],...s.ranking?.drawn.map(x=>x.card)??[]];
function fixture(count=2){
 let now=10000;const d:Dependencies={now:()=>now,randomInt:n=>n-1,motion:500,delay:1000,peek:3000,grace:60000,restart:1000};
 const s=createState('room','code','invite',newPlayer('p0','Ada'));s.players=Array.from({length:count},(_,i)=>({...newPlayer(`p${i}`,`Player ${i}`),connected:true}));
 const at=(time:number)=>{now=time;tick(s,d);};
 const send=(actor:string,action:object)=>apply(s,d,actor,{id:crypto.randomUUID(),game:s.game,round:s.round,...action} as Parameters<typeof apply>[3]);
 const conserve=()=>{expect(all(s).sort((a,b)=>a.id-b.id)).toEqual(deck());assertCards(s);};
 return {s,d,at,send,conserve};
}

describe('finite canonical deck and unbiased server shuffle',()=>{
 it('has exactly the required quantities and 104 distinct card objects/IDs',()=>{
  const cards=deck();expect(cards).toHaveLength(104);expect(new Set(cards).size).toBe(104);expect(ids(cards)).toEqual(Array.from({length:104},(_,i)=>i));
  expect(Object.fromEntries([...new Set(cards.map(c=>c.value))].map(v=>[v,cards.filter(c=>c.value===v).length]))).toEqual({'-3':2,0:4,1:8,2:8,3:8,4:8,5:8,6:8,7:8,8:8,9:8,10:8,11:6,12:8,13:4});
 });
 it('uses crypto.randomInt in production, with no random comparator or client deck construction',()=>{
  expect(new Rooms(new MemoryStore(),config({})).deps.randomInt).toBe(randomInt);
  const model=readFileSync('src/engine/model.ts','utf8');expect(model).not.toMatch(/\.sort\s*\(/);
  for(const path of ['src/client/main.tsx','src/client/GameTable.tsx'])expect(readFileSync(path,'utf8')).not.toMatch(/(?:from\s*['"][^'"]*engine|\b(?:shuffle|randomInt|Math\.random)\s*\()/);
 });
 it('injected indices produce a known order and preserve the same instances',()=>{
  const a=deck().slice(0,4),original=[...a],choices=[0,1,0],bounds:number[]=[];
  expect(shuffle(a,max=>{bounds.push(max);return choices.shift()!;})).toBe(a);expect(bounds).toEqual([4,3,2]);expect(a).toEqual([original[2],original[3],original[1],original[0]]);for(const card of a)expect(original).toContain(card);
 });
 it('covers both inclusive index boundaries without rounding or out-of-range access',()=>{
  expect(shuffle([0,1,2,3,4],()=>0)).toEqual([1,2,3,4,0]);expect(shuffle([0,1,2,3,4],n=>n-1)).toEqual([0,1,2,3,4]);
  expect(()=>shuffle([0,1],()=>-1)).toThrow('Invalid random source');expect(()=>shuffle([0,1],n=>n)).toThrow('Invalid random source');
  expect(shuffle([],()=>{throw Error('no RNG for empty deck');})).toEqual([]);expect(shuffle([7],()=>{throw Error('no RNG for singleton');})).toEqual([7]);
 });
 it('maps the 24 equally likely Fisher–Yates index sequences bijectively to all four-card permutations',()=>{
  const orders=new Set<string>();for(let a=0;a<4;a++)for(let b=0;b<3;b++)for(let c=0;c<2;c++){const choices=[a,b,c];orders.add(shuffle([0,1,2,3],()=>choices.shift()!).join(','));}expect(orders.size).toBe(24);
 });
 for(const count of [2,3,4,5,6])it(`deals ${count} players from one retained shuffled order, without replacement`,()=>{
  const f=fixture(count),bounds:number[]=[];f.d.randomInt=max=>{bounds.push(max);return max-1;};startRound(f.s,f.d);
  expect(bounds).toEqual([count,...Array.from({length:103},(_,i)=>104-i)]);expect(f.s.deck).toHaveLength(104-count*4);
  expect(ids(f.s.players.flatMap(p=>p.slots.map(slot=>slot.card!)))).toEqual(Array.from({length:count*4},(_,i)=>103-i));expect(ids(f.s.deck)).toEqual(Array.from({length:104-count*4},(_,i)=>i));f.conserve();
  // A same-value bottom pair is legal: no anti-clumping or re-roll.
  expect(f.s.players[0].slots[1].card!.value).toBe(13);expect(f.s.players[0].slots[3].card!.value).toBe(13);
  f.at(f.s.initialPeek!.revealAt);expect(project(f.s,f.d,'p1').players[0].slots.every(s=>s.value===undefined)).toBe(true);f.at(f.s.initialPeek!.finishAt);expect(f.s.deck).toHaveLength(103-count*4);f.conserve();
  const actor=f.s.next,top=f.s.deck.at(-1)!;f.send(actor,{type:'draw',source:'draw',window:f.s.window,turn:f.s.turn});expect(f.s.held!.card).toBe(top);expect(f.s.deck).not.toContain(top);f.conserve();
  f.at(f.s.visualUntil);f.send(actor,{type:'resolveDraw',turn:f.s.turn});expect(f.s.discard.at(-1)).toBe(top);f.conserve();
 });
 it('covers every round-one starting seat and never rerolls on projection/reconnect',()=>{
  for(let seat=0;seat<6;seat++){
   const f=fixture(6);let calls=0;f.d.randomInt=n=>calls++===0?seat:n-1;startRound(f.s,f.d);expect(f.s.next).toBe(`p${seat}`);expect(calls).toBe(104);
   project(f.s,f.d,'p0');connection(f.s,f.d,'p1',false);connection(f.s,f.d,'p1',true);expect(f.s.next).toBe(`p${seat}`);expect(calls).toBe(104);
  }
 });
 it('later rounds start with the prior loser, with no random seat draw',()=>{
  for(const previous of [1,2,3]){const f=fixture(3);f.s.round=previous;f.s.history=Array.from({length:previous},()=>[0,2,1].map((i,j)=>({player:`p${i}`,sum:i,count:4,lowest:0,place:j+1,tie:''})));const bounds:number[]=[];f.d.randomInt=n=>{bounds.push(n);return n-1;};startRound(f.s,f.d);expect(f.s.next).toBe('p1');expect(bounds).toHaveLength(103);f.conserve();}
 });
 it('reshuffles only buried instances through the same injected algorithm, retaining top/hand/held identities',()=>{
  const f=fixture();startRound(f.s,f.d);f.at(f.s.initialPeek!.revealAt);f.at(f.s.initialPeek!.finishAt);const s=f.s;
  const buried=s.deck.splice(0,s.deck.length-1);s.discard.unshift(...buried);const originalHands=s.players.flatMap(p=>p.slots.map(slot=>slot.card!)),last=s.deck[0],actor=s.next;
  f.send(actor,{type:'draw',source:'draw',window:s.window,turn:s.turn});expect(s.reshuffling).toBeUndefined();expect(s.held?.card).toBe(last);f.conserve();
  f.at(s.visualUntil);const owner=s.players.find(p=>p.id===actor)!,outgoing=owner.slots[0].card!,pool=[...s.discard];f.send(actor,{type:'resolveDraw',turn:s.turn,target:{player:actor,slot:0,rev:owner.slots[0].rev}});
  const bounds:number[]=[];f.d.randomInt=n=>{bounds.push(n);return 0;};f.at(s.reshuffling!.moveAt);expect(s.discard).toEqual([outgoing]);expect(s.reshuffling!.cards).toEqual([...pool.slice(1),pool[0]]);expect(bounds).toEqual(Array.from({length:pool.length-1},(_,i)=>pool.length-i));expect(s.reshuffling!.cards.every(c=>!originalHands.includes(c)&&c!==last)).toBe(true);f.conserve();
  f.at(s.reshuffling!.end);expect(s.deck).toEqual([...pool.slice(1),pool[0]]);expect(owner.slots[0].card).toBe(last);f.conserve();
 });
});
