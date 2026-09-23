import { describe, expect, it } from 'vitest';
import { apply, project } from '../src/engine/engine';
import { addToHand, reflowAfterRemoval } from '../src/engine/hand';
import { assertCards, createState, deck, newPlayer, occupied, type Dependencies } from '../src/engine/model';
import { handGeometry, rowStep } from '../src/client/table-layout';
import { visibleHand } from '../src/client/invalid-match-state';
import type { Command } from '../src/shared/protocol';

function fixture(values=[7,7,7,7]){
 let time=10000,serial=0;const d:Dependencies={now:()=>time,randomInt:n=>n-1,delay:1000,motion:500,peek:3000,grace:60000,restart:1000};
 const s=createState('room','code','invite',newPlayer('p0','Ada')),cards=deck(),take=(value:number)=>cards.splice(cards.findIndex(c=>c.value===value),1)[0];
 s.players.push(newPlayer('p1','Bea'));s.players.forEach((p,i)=>{p.connected=true;p.columns=2;for(const value of i?[2,3,4,5]:values)addToHand(p,{rev:1,card:take(value)});});
 s.game=1;s.round=1;s.phase='INTER_TURN';s.open=true;s.window='window';s.next='p1';s.discard=[take(7)];s.deck=cards;
 const ref=(index:number,who='p0')=>({player:who,slot:index,rev:s.players.find(p=>p.id===who)!.slots[index].rev});
 const send=(action:object,who='p0')=>{const result=apply(s,d,who,{...action,id:`cmd-${++serial}`,game:s.game,round:s.round} as Command);assertCards(s);return result;};
 const match=(indices:number[])=>send({type:'match',window:s.window,slots:indices.map(i=>ref(i))});
 const give=()=>{time=Math.max(time,s.visualUntil);s.effects=[{id:`give-${serial}`,actor:'p1',kind:1}];send({type:'effect',effect:s.effects[0].id,recipient:'p0'},'p1');};
 const settle=()=>{time=Math.max(time,s.visualUntil);};
 return {s,d,p:s.players[0],ref,send,match,give,settle};
}
const positions=(p:ReturnType<typeof fixture>['p'])=>p.slots.filter(s=>s.card).map(s=>({id:s.card!.id,row:s.row,column:s.column}));
const ordered=(p:ReturnType<typeof fixture>['p'])=>positions(p).sort((a,b)=>a.column!-b.column!||a.row!-b.row!).map(s=>s.id);
function formation(f:ReturnType<typeof fixture>,count:number){
 const cards=positions(f.p);expect(cards).toHaveLength(count);expect(f.p.columns).toBe(Math.max(2,Math.ceil(count/2)));
 expect(cards.filter(s=>s.row===0)).toHaveLength(Math.ceil(count/2));expect(cards.filter(s=>s.row===1)).toHaveLength(Math.floor(count/2));
 for(const row of [0,1])expect(cards.filter(s=>s.row===row).map(s=>s.column).sort()).toEqual(Array.from({length:row?Math.floor(count/2):Math.ceil(count/2)},(_,i)=>i));
}

describe('authoritative stable base slots',()=>{
 for(const index of [0,1,2,3])it(`removing base slot ${index} preserves every survivor and the 2×2 bounds`,()=>{
  const f=fixture(),before=positions(f.p),removed=f.p.slots[index].card!.id;f.match([index]);
  expect(positions(f.p)).toEqual(before.filter(p=>p.id!==removed));expect(f.p.slots[index].card).toBeUndefined();expect(f.p.columns).toBe(2);
  expect(handGeometry(100,8,f.p.columns!*2)).toEqual(handGeometry(100,8,4));
  const a=project(f.s,f.d,'p0').players[0],b=project(f.s,f.d,'p1').players[0];expect(a).toEqual(b);expect(a.slots.every(s=>s.value===undefined)).toBe(true);
  expect(()=>f.match([index])).toThrow(/changed/);
 });
 it('fills multiple holes in the existing column-major deal order without moving survivors',()=>{
  const f=fixture();f.match([1,2]);const survivors=positions(f.p);f.give();f.give();
  expect(positions(f.p).slice(0,2)).toEqual(survivors);expect(f.p.slots.slice(4).map(s=>[s.row,s.column])).toEqual([[1,0],[0,1]]);formation(f,4);
 });
 it('penalties fill a base hole, remain private and do not appear before arrival',()=>{
  const f=fixture([2,7,3,4]);f.match([1]);const before=positions(f.p);f.match([0]);const event=f.s.invalidMatches![0];
  expect(event.penalty).toMatchObject({slot:4,row:1,column:0,beforeColumns:2});expect(positions(f.p).slice(0,3)).toEqual(before);
  const p=project(f.s,f.d,'p1').players[0];expect(p.slots[4].value).toBeUndefined();expect(visibleHand(p,[event],event.end-1).slots.some(s=>s.cardId===event.penalty.cardId)).toBe(false);
  expect(visibleHand(p,[event],event.end).slots[4].occupied).toBe(true);formation(f,4);
 });
 it('replacement and Swap keep the precise slot while stale targets reject new occupants',()=>{
  const f=fixture([2,7,3,4]);f.match([1]);const original=f.ref(3),before=positions(f.p),incoming=f.s.discard.at(-1)!;f.s.next='p0';
  f.send({type:'draw',source:'discard',window:f.s.window,turn:f.s.turn});f.settle();f.send({type:'resolveDraw',turn:f.s.turn,target:original});
  expect(f.p.slots[3].card).toBe(incoming);expect(positions(f.p).map(s=>[s.row,s.column])).toEqual(before.map(s=>[s.row,s.column]));expect(()=>f.send({type:'match',window:f.s.window,slots:[original]})).toThrow(/changed/);
  f.settle();f.s.effects=[{id:'swap',actor:'p0',kind:11}];const other=f.s.players[1].slots[0].card!;f.send({type:'effect',effect:'swap',targets:[f.ref(0,'p1'),f.ref(3)]});
  expect(f.p.slots[3].card).toBe(other);expect(f.p.slots[3]).toMatchObject({row:1,column:1});expect(f.p.slots[1].card).toBeUndefined();
  f.settle();f.s.effects=[{id:'peek',actor:'p0',kind:12}];f.send({type:'effect',effect:'peek',targets:[f.ref(3)]});expect(project(f.s,f.d,'p0').players[0].slots[3].value).toBe(other.value);expect(project(f.s,f.d,'p1').players[0].slots[3].value).toBeUndefined();
 });
});

describe('balanced overflow with current column counts',()=>{
 for(const count of [5,6,7,8,9,10,20])it(`${count} cards use the smallest balanced formation`,()=>{
  const f=fixture();while(occupied(f.p)<count)f.give();formation(f,count);const h=handGeometry(100,8,f.p.columns!*2,1.3);expect(h.columns).toBe(Math.ceil(count/2));expect(h.width).toBe(208*1.3);
 });
 const rows=(f:ReturnType<typeof fixture>)=>[0,1].map(row=>f.p.slots.map((s,i)=>({...s,index:i})).filter(s=>s.card&&s.row===row).sort((a,b)=>a.column!-b.column!).map(s=>s.index));
 for(const [removed,expected] of [[0,[[2,4],[1,3]]],[2,[[0,4],[1,3]]],[4,[[0,2],[1,3]]],[1,[[0,2],[3,4]]],[3,[[0,2],[1,4]]]] as const)it(`5 → 4 removes ${removed} with minimum row movement`,()=>{
  const f=fixture(Array(5).fill(7)),before=positions(f.p);f.match([removed]);expect(rows(f)).toEqual(expected);formation(f,4);
  if(removed%2===0)expect(positions(f.p).filter(s=>s.row===1)).toEqual(before.filter(s=>s.row===1));
 });
 it('preserves a balanced bottom-extra row, then transfers only its rightmost card when needed',()=>{
  const f=fixture(Array(6).fill(7));f.match([2]);expect(rows(f)).toEqual([[0,4],[1,3,5]]);expect(f.p.columns).toBe(3);
  const before=positions(f.p);f.match([0]);expect(rows(f)).toEqual([[4,5],[1,3]]);expect(f.p.columns).toBe(2);
  expect(positions(f.p).filter(s=>before.filter(s=>s.row===1&&s.column!<2).some(b=>b.id===s.id))).toEqual(before.filter(s=>s.row===1&&s.column!<2));
 });
 it('rebalances an older 1/3 formation by transferring only the longer row’s rightmost card',()=>{
  const f=fixture();f.p.slots[2].row=1;f.p.slots[2].column=1;f.p.slots[3].column=2;
  reflowAfterRemoval(f.p,0);expect(rows(f)).toEqual([[0,3],[1,2]]);
 });
 it('reevaluates the four-card threshold for each removal within one batch',()=>{
  const f=fixture(Array(6).fill(7));f.match([0,2,1]);expect(rows(f)).toEqual([[4,5],[3]]);
  expect(f.p.slots[3]).toMatchObject({row:1,column:1});expect(f.p.slots[1].card).toBeUndefined();expect(f.p.columns).toBe(2);
 });
 it('eight to six recomputes columns and retains survivor order in each row',()=>{
  const f=fixture([7,7,7,7,7,7,7,2]);f.match([2,5]);expect(rows(f)).toEqual([[0,4,6],[1,3,7]]);formation(f,6);
 });
 it('stable hands never rebalance even when one row becomes empty',()=>{
  const f=fixture();f.match([1]);const before=positions(f.p);f.match([3]);expect(positions(f.p)).toEqual(before.filter(s=>s.row===0));
 });
 it('row-specific spacing leaves a two-card unaffected row stationary across overflow removal',()=>{
  const slots=[{occupied:true,row:1,column:0},{occupied:true,row:1,column:1}];
  expect(rowStep(100,8,270.4,slots,1)).toBe(108);expect(rowStep(100,8,208,slots,1)).toBe(108);
 });
 it('5 → 4 restores full spacing, then 4 → 3 preserves the bottom-left hole',()=>{
  const f=fixture(Array(5).fill(7));f.match([4]);formation(f,4);expect(handGeometry(100,8,f.p.columns!*2,1.3).step).toBe(108);
  const before=positions(f.p);f.match([1]);expect(positions(f.p)).toEqual(before.filter(c=>c.id!==before[1].id));expect(f.p.slots[3]).toMatchObject({row:1,column:1});
  f.give();expect(f.p.slots.at(-1)).toMatchObject({row:1,column:0});formation(f,4);const order=ordered(f.p);f.give();formation(f,5);expect(ordered(f.p).slice(0,4)).toEqual(order);
 });
 it('new cards filling old holes remain selectable, and old references never select them',()=>{
  const f=fixture(),stale=f.ref(1);f.match([1]);f.give();const added=f.p.slots.length-1;expect(()=>f.send({type:'match',window:f.s.window,slots:[stale]})).toThrow(/changed/);
  f.settle();f.s.effects=[{id:'peek-new',actor:'p0',kind:12}];f.send({type:'effect',effect:'peek-new',targets:[f.ref(added)]});expect(f.s.effects[0].target?.slot).toBe(added);
 });
 it('ignores empty historical overflow columns when an arrival is withheld',()=>{
  const f=fixture(Array(7).fill(7));f.match([0,2,4,6]);expect(occupied(f.p)).toBe(3);f.give();f.match([1]);
  // Wrong attempt against a different discard creates an arrival after shrinking.
  const top=f.s.deck.findIndex(c=>c.value===2);f.s.discard.push(...f.s.deck.splice(top,1));f.match([3]);
  const e=f.s.invalidMatches!.at(-1)!,p=project(f.s,f.d,'p0').players[0];expect(visibleHand(p,[e],e.end-1).columns).toBe(2);assertCards(f.s);
 });
 it('clears overflow capacity when the room returns to the empty between-round hands',()=>{
  const f=fixture();addToHand(f.s.players[1],{rev:1,card:f.s.deck.pop()!});expect(f.s.players[1].columns).toBe(3);
  f.match([0,1,2,3]);expect(f.s.phase).toBe('ROUND_RESULTS');for(const p of f.s.players){f.send({type:'next'},p.id);f.send({type:'next'},p.id);}
  expect(f.s.phase).toBe('LOBBY');for(const p of f.s.players){expect(p.slots).toEqual([]);expect(p.columns).toBe(2);}
 });
});
