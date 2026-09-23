import { describe, expect, it } from 'vitest';
import { apply, project, tick } from '../src/engine/engine';
import { assertCards, createState, newPlayer, deck, type Dependencies } from '../src/engine/model';
import { InvalidMatchQueue, invalidFace, visibleHand } from '../src/client/invalid-match-state';
import { Rooms } from '../src/server/rooms';
import { MemoryStore } from '../src/server/store';
import { config } from '../src/server/config';

function fixture(){
 let now=10000;const d:Dependencies={now:()=>now,randomInt:n=>n-1,motion:500,delay:1000,peek:3000,grace:60000,restart:1000};
 const s=createState('room','code','invite',newPlayer('p0','Ada')),cards=deck(),take=(n:number)=>cards.splice(cards.findIndex(c=>c.value===n),1)[0];
 s.players=[0,1,2].map(i=>({...newPlayer(`p${i}`,`Player ${i}`),connected:true,columns:2,slots:[2,3,7,4].map((n,j)=>({rev:1,row:j%2,column:Math.floor(j/2),card:take(n)}))}));
 s.game=1;s.round=1;s.phase='INTER_TURN';s.next='p1';s.open=true;s.window='window';s.discard=[take(7)];s.deck=cards;
 const ref=(p=0,i=0)=>({player:`p${p}`,slot:i,rev:s.players[p].slots[i].rev});
 const command=(action:object)=>({id:crypto.randomUUID(),game:s.game,round:s.round,...action});
 const send=(actor:string,action:object)=>apply(s,d,actor,command(action) as Parameters<typeof apply>[3]);
 const match=(p=0,indices=[0])=>send(`p${p}`,{type:'match',window:s.window,slots:indices.map(i=>ref(p,i))});
 const at=(n:number)=>{now=n;tick(s,d);};
 return {s,d,ref,command,send,match,at};
}

describe('authoritative invalid attempts with independent presentation deadlines',()=>{
 for(const late of [false,true])it(`${late?'late':'incorrect'} retains the attempted instance and immediately reserves one private penalty`,()=>{
  const f=fixture();if(late)f.send('p1',{type:'draw',source:'draw',turn:f.s.turn,window:f.s.window});
  const before=f.s.deck.length,attempt=f.s.players[0].slots[late?2:0].card!,visual=f.s.visualUntil,unlock=f.s.unlockAt;
  expect(f.match(0,[late?2:0]).code).toBe(late?'LATE':'PENALTY');const e=f.s.invalidMatches![0];
  expect(f.s.players[0].slots[late?2:0].card).toBe(attempt);expect(f.s.players[0].slots).toHaveLength(5);expect(f.s.deck).toHaveLength(before-1);expect(f.s.visualUntil).toBe(visual);expect(f.s.unlockAt).toBe(unlock);
  expect(e).toMatchObject({room:'room',game:1,round:1,turn:0,window:'window',seq:f.s.seq,player:'p0',reason:late?'late':'incorrect',attempted:{value:attempt.value,slot:late?2:0,rev:1},penalty:{slot:4,row:0,column:2,beforeColumns:2},start:10000,faceUpAt:10360,shakeEnd:10720,flightAt:11080,end:11580});
  for(const viewer of ['p0','p1','p2']){const v=project(f.s,f.d,viewer);expect(v.invalidMatches).toEqual([e]);expect(v.players[0].slots[4].cardId).toBe(e.penalty.cardId);expect(v.players[0].slots[4].value).toBeUndefined();expect(e.penalty).not.toHaveProperty('value');expect(e.attempted.cardId).not.toBe(String(attempt.id));}
  assertCards(f.s);
 });
 it('does not expose a recycled hidden card through its former public token',()=>{
  const f=fixture(),card=f.s.deck.at(-1)!;f.s.cardTokens={[card.id]:'previously-revealed'};f.match();const e=f.s.invalidMatches![0];expect(e.penalty.cardId).not.toBe('previously-revealed');expect(f.s.players[0].slots.at(-1)!.card).toBe(card);expect(project(f.s,f.d,'p1').players[0].slots.at(-1)!.value).toBeUndefined();
  const next=f.s.deck.at(-1)!;f.s.cardTokens[next.id]='another-known-card';f.send('p1',{type:'draw',source:'draw',turn:0,window:f.s.window});expect(f.s.cardTokens[next.id]).toBeUndefined();assertCards(f.s);
 });
 it('does not delay draw, resolution, special actions or other matches',()=>{
  const f=fixture();f.match();const e=f.s.invalidMatches![0];f.match(2,[2]);f.send('p1',{type:'draw',source:'discard',turn:f.s.turn,window:f.s.window});f.at(f.s.visualUntil);
  expect(f.d.now()).toBeLessThan(e.end);f.send('p1',{type:'resolveDraw',turn:f.s.turn,target:f.ref(1)});expect(f.s.turn).toBe(1);expect(f.s.invalidMatches![0]).toEqual(e);
  f.at(f.s.visualUntil);f.s.effects=[{id:'peek',actor:'p0',kind:12}];f.send('p0',{type:'effect',effect:'peek',targets:[f.ref(2)]});expect(f.s.effects[0].viewUntil).toBeDefined();assertCards(f.s);
 });
 it('queues each player independently and retains batch order and counts',()=>{
  const f=fixture();f.match(0,[0,1]);f.match(2,[0]);const [a,b,c]=f.s.invalidMatches!;
  expect(a.end).toBe(b.start);expect(c.start).toBe(a.start);expect(c.end).toBe(a.end);expect([a.penalty.row,b.penalty.row]).toEqual([0,1]);expect([a.penalty.slot,b.penalty.slot]).toEqual([4,5]);expect(f.s.players[0].slots).toHaveLength(6);expect(new Set([a.penalty.cardId,b.penalty.cardId,c.penalty.cardId]).size).toBe(3);assertCards(f.s);
 });
 it('deduplicates identical accepted commands without reserving cards or events twice',async()=>{
  const f=fixture(),rooms=new Rooms(new MemoryStore(),config({}),f.d),created=await rooms.create('Ada',crypto.randomUUID()),room=created.room;f.s.room=room.data.state.room;room.data.state=f.s;room.controllers.set('p0','socket');
  const cmd=f.command({type:'match',window:f.s.window,slots:[f.ref()]});const [a,b]=await Promise.all([rooms.command(room,'p0','socket',cmd),rooms.command(room,'p0','socket',cmd)]);expect(a).toEqual(b);expect(room.data.state.players[0].slots).toHaveLength(5);expect(room.data.state.invalidMatches).toHaveLength(1);assertCards(room.data.state);
 });
 it('captures the original attempted card before a queued late penalty outlives its slot revision',()=>{
  const f=fixture();const rest=f.s.deck.splice(0,f.s.deck.length-1);f.s.discard.unshift(...rest);f.send('p1',{type:'draw',source:'draw',turn:0,window:f.s.window});
  const attempted=f.s.players[1].slots[0].card!;f.match(1,[0]);expect(f.s.pendingMatch).toBeDefined();f.at(f.s.visualUntil);f.send('p1',{type:'resolveDraw',turn:0,target:f.ref(1)});f.at(f.s.reshuffling!.end);
  expect(f.s.invalidMatches![0].attempted.value).toBe(attempted.value);expect(f.s.players[1].slots[0].card).not.toEqual(attempted);assertCards(f.s);
 });
});

describe('materialized hand and reconnect snapshots',()=>{
 it('withholds arrivals and expansion until landing, once, without hiding existing cards',()=>{
  const f=fixture(),q=new InvalidMatchQueue();q.accept('room:1',[],f.d.now());f.match(0,[0,1]);q.accept('room:1',f.s.invalidMatches!,f.d.now());const [a,b]=q.events(),p=project(f.s,f.d,'p0').players[0];
  for(const now of [a.start,a.faceUpAt,a.shakeEnd,a.flightAt,a.end-1]){const visible=visibleHand(p,q.events(),now);expect(visible.slots).toHaveLength(4);expect(visible.columns).toBe(2);expect(visible.slots.map(s=>s.index)).toEqual([0,1,2,3]);}
  expect(visibleHand(p,q.events(),a.end).slots).toHaveLength(5);expect(visibleHand(p,q.events(),a.end).columns).toBe(3);expect(visibleHand(p,q.events(),b.end).slots).toHaveLength(6);
  q.accept('room:1',f.s.invalidMatches!,a.end);expect(q.events()).toHaveLength(2);expect(invalidFace(q.events(),a.attempted.cardId,a.start)).toEqual(a);expect(invalidFace(q.events(),a.attempted.cardId,a.flightAt)).toBeUndefined();
 });
 it('continues accepted events when snapshots omit them, and settles reconnect history',()=>{
  const f=fixture(),q=new InvalidMatchQueue();q.accept('room:1',[],f.d.now());f.match();const event=f.s.invalidMatches![0];q.accept('room:1',[event],f.d.now());q.accept('room:1',[],event.flightAt);expect(q.events()).toEqual([event]);
  for(const now of [event.start+100,event.end+100]){const reconnect=new InvalidMatchQueue();reconnect.accept('room:1',[event],now);expect(reconnect.events()).toEqual([]);expect(visibleHand(project(f.s,f.d,'p0').players[0],reconnect.events(),now).slots).toHaveLength(5);}
  q.accept('room:2',[],event.flightAt);expect(q.events()).toEqual([]);
 });
});
