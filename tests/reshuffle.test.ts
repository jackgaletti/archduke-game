import { describe, it, expect } from 'vitest';
import { apply, project, tick, connection, startRound } from '../src/engine/engine';
import { assertCards, createState, deck, newPlayer, type Dependencies } from '../src/engine/model';
import type { Command, Target } from '../src/shared/protocol';
import { deckLayers } from '../src/client/reshuffle';
import { Rooms } from '../src/server/rooms';
import { MemoryStore, type RecordData } from '../src/server/store';
import { config } from '../src/server/config';

type Action=Command extends infer C?C extends Command?Omit<C,'id'|'game'|'round'>:never:never;
function fixture(hands=[[2,3,4,5],[6,8,9,10]],last=8,top=7){
 let now=10000;const randomBounds:number[]=[];const all=deck();
 const d:Dependencies={now:()=>now,randomInt:n=>{randomBounds.push(n);return 0;},motion:500,delay:1000,peek:3000,grace:60000,restart:1000};
 function take(value:number){const index=all.findIndex(c=>c.value===value);if(index<0)throw new Error('Fixture supply');return all.splice(index,1)[0];}
 const s=createState('room','code','invite',newPlayer('p0','Ada'));
 s.players=hands.map((values,i)=>({...newPlayer(`p${i}`,`Player ${i}`),connected:true,slots:values.map((value,index)=>({rev:1,card:take(value),row:index%2,column:Math.floor(index/2)}))}));
 s.game=1;s.round=1;s.phase='INTER_TURN';s.open=true;s.window='window';s.next='p0';s.deck=[take(last)];const protectedTop=take(top);s.discard=[...all,protectedTop];
 const ref=(player='p0',slot=0):Target=>({player,slot,rev:s.players.find(p=>p.id===player)!.slots[slot].rev});
 const send=(a:Action,actor='p0')=>{const r=apply(s,d,actor,{...a,id:crypto.randomUUID(),game:s.game,round:s.round} as Command);assertCards(s);return r;};
 const at=(time:number)=>{now=time;tick(s,d);assertCards(s);};
 const finish=()=>at(s.reshuffling!.end);
 const draw=()=>send({type:'draw',source:'draw',window:s.window,turn:s.turn});
 const resolve=(target?:Target)=>{at(s.visualUntil);return send({type:'resolveDraw',turn:s.turn,...(target?{target}:{})});};
 assertCards(s);return {s,d,randomBounds,ref,send,at,finish,draw,resolve};
}

describe('authoritative supply barrier',()=>{
 for(const replace of [false,true])it(`waits for the final draw decision, protects the new ${replace?'replacement':'direct'} discard and conserves identities`,()=>{
  const f=fixture(),{s}=f;const buried=[...s.discard],last=s.deck[0],hands=structuredClone(s.players.map(p=>p.slots)),old=s.players[0].slots[0].card!;
  f.draw();expect(s.deck).toEqual([]);expect(s.held?.card).toEqual(last);expect(s.reshufflePending).toBe(true);expect(s.reshuffling).toBeUndefined();
  f.at(f.d.now()+20000);expect(s.reshuffling).toBeUndefined();expect(s.deck).toEqual([]);expect(s.discard).toEqual(buried);expect(s.held?.card).toEqual(last);
  // Inspection/decision time never starts a refill. Only the committed discard does.
  f.resolve(replace?f.ref():undefined);const top=replace?old:last,event=s.reshuffling!,moves=structuredClone(s.movements);
  expect(s.discard.at(-1)).toEqual(top);expect(s.held).toBeUndefined();expect(s.reshufflePending).toBeUndefined();expect(event.cards).toEqual([]);
  expect(event.moveAt).toBeGreaterThan(s.movements.at(-1)!.end+120);expect(event.end-event.start).toBeLessThanOrEqual(3000);
  f.at(event.moveAt-1);expect(s.discard).toHaveLength(buried.length+1);
  f.at(event.moveAt);expect(s.discard).toEqual([top]);expect(new Set(event.cards.map(c=>c.id))).toEqual(new Set(buried.map(c=>c.id)));
  expect(event.cards.map(c=>c.id)).not.toEqual(buried.map(c=>c.id));expect(f.randomBounds).toEqual(Array.from({length:buried.length-1},(_,i)=>buried.length-i));
  const order=structuredClone(event.cards);f.finish();expect(s.deck).toEqual(order);expect(s.movements).toEqual(moves);
  if(replace)hands[0][0]={...hands[0][0],rev:2,card:last};expect(s.players.map(p=>p.slots)).toEqual(hands);
  expect(s.phase).toBe('INTER_TURN');expect(s.next).toBe('p1');expect(s.turn).toBe(1);expect(s.reshuffling).toBeUndefined();
  assertCards(s);
 });
 it('publishes only event metadata, with the same event/timestamps for every viewer',()=>{
  const f=fixture();f.draw();f.resolve();f.at(f.s.reshuffling!.moveAt);
  const a=project(f.s,f.d,'p0'),b=project(f.s,f.d,'p1');
  expect(a.reshuffling).toEqual(b.reshuffling);expect(Object.keys(a.reshuffling!).sort()).toEqual(['count','end','id','moveAt','start']);
  expect(b.held?.value).toBeUndefined();expect(b.players.flatMap(p=>p.slots).every(c=>c.value===undefined)).toBe(true);
  const id=a.reshuffling!.id;f.at(f.d.now()+100);expect(project(f.s,f.d,'p0').reshuffling!.id).toBe(id);
 });
 it('blocks conflicting commands without mutating accepted work or retriggering',()=>{
  const f=fixture();f.draw();f.resolve();const before=structuredClone(f.s);
  for(const a of [{type:'draw',source:'discard',window:f.s.window,turn:0},{type:'resolveDraw',turn:0},{type:'match',window:f.s.window,slots:[f.ref()]},{type:'call',window:f.s.window,turn:0}] as Action[])expect(()=>f.send(a)).toThrow();
  expect(f.s).toEqual(before);f.at(f.d.now()+100);expect(f.s.reshuffling!.id).toBe(before.reshuffling!.id);
 });
 for(const late of [false,true])it(`resumes ordered ${late?'late':'incorrect'} batch penalties, one per attempted card`,()=>{
  const f=fixture();if(late){f.s.held={id:'held',owner:'p1',source:'discard',card:f.s.discard.pop()!};f.s.phase='HOLDING_DRAWN_CARD';f.s.open=false;f.s.next='p1';}
  const reply=f.send({type:'match',window:f.s.window,slots:[f.ref('p0',0),f.ref('p0',1),f.ref('p0',2)]});
  expect(reply.code).toBe('QUEUED');expect(f.s.players[0].slots).toHaveLength(5);expect(f.s.pendingMatch?.slots).toHaveLength(2);expect(f.s.invalidMatches).toHaveLength(1);
  const first=f.s.players[0].slots[4].card;if(late){expect(f.s.reshuffling).toBeUndefined();expect(f.s.reshufflePending).toBe(true);f.at(f.s.visualUntil);f.send({type:'resolveDraw',turn:0,target:f.ref('p1',0)},'p1');}f.finish();expect(f.s.players[0].slots).toHaveLength(7);expect(f.s.players[0].slots[4].card).toEqual(first);expect(f.s.players[0].slots.slice(4).map(c=>c.row)).toEqual([0,1,0]);
  expect(f.s.pendingMatch).toBeUndefined();expect(f.s.invalidMatches?.filter(e=>e.penalty.slot>4)).toHaveLength(2);expect(f.s.turn).toBe(late?1:0);
  for(const viewer of ['p0','p1'])expect(project(f.s,f.d,viewer).players[0].slots.slice(4).every(c=>c.value===undefined)).toBe(true);
 });
 it('keeps mixed batch order and protected match eligibility across the pause',()=>{
  const f=fixture([[2,7,3,5],[6,8,9,10]]);const ids=f.s.players[0].slots.map(c=>c.card!.id);
  f.send({type:'match',window:f.s.window,slots:[f.ref('p0',0),f.ref('p0',1),f.ref('p0',2)]});f.finish();
  expect(f.s.players[0].slots[0].card!.id).toBe(ids[0]);expect(f.s.players[0].slots[1].card).toBeUndefined();expect(f.s.discard.at(-1)!.id).toBe(ids[1]);expect(f.s.players[0].slots).toHaveLength(6);expect(f.s.open).toBe(true);expect(f.s.window).toBe('window');
 });
 it('owes late penalties even when the holder replaces an attempted slot before supply resumes',()=>{
  const f=fixture();f.draw();const original=f.s.players[0].slots[0].card;
  f.send({type:'match',window:f.s.window,slots:[f.ref('p0',0),f.ref('p0',1)]});expect(f.s.pendingMatch?.slots).toHaveLength(2);expect(f.s.players[0].slots).toHaveLength(4);
  f.resolve(f.ref());expect(f.s.discard.at(-1)).toEqual(original);f.finish();expect(f.s.players[0].slots).toHaveLength(6);expect(f.s.pendingMatch).toBeUndefined();expect(f.s.turn).toBe(1);assertCards(f.s);
 });
 it('retains queued specials and the matching window across a final-card replacement',()=>{
  const f=fixture([[12,3,4,5],[6,8,9,10]]);f.draw();f.resolve(f.ref());const effect=f.s.effects[0],window=f.s.window;
  expect(effect).toMatchObject({actor:'p0',kind:12});expect(f.s.discard.at(-1)!.value).toBe(12);f.finish();expect(f.s.effects).toEqual([effect]);expect(f.s.window).toBe(window);expect(f.s.open).toBe(true);expect(f.s.turn).toBe(1);
 });
 it('Give consumes the last card exactly once and retains the remaining FIFO effects',()=>{
  const f=fixture();f.s.effects=[{id:'give1',actor:'p0',kind:1},{id:'give2',actor:'p1',kind:1}];
  f.send({type:'effect',effect:'give1',recipient:'p1'});expect(f.s.players[1].slots).toHaveLength(5);expect(f.s.effects.map(e=>e.id)).toEqual(['give2']);
  f.finish();f.send({type:'effect',effect:'give2',recipient:'p0'},'p1');expect(f.s.players[0].slots).toHaveLength(5);expect(f.s.effects).toEqual([]);expect(f.s.turn).toBe(0);
 });
 it('preserves private-peek expiry and existing animation timestamps during the supply barrier',()=>{
  const f=fixture();f.s.phase='FINAL_MATCH_WINDOW';f.s.caller='p1';f.s.finalEndsAt=f.d.now()+3000;f.s.effects=[{id:'peek',actor:'p1',kind:12,target:f.ref(),value:2,viewUntil:f.d.now()+1700}];
  f.send({type:'match',window:f.s.window,slots:[f.ref()]});const event=f.s.reshuffling!,deadline=f.s.finalEndsAt!,until=f.s.effects[0].viewUntil!;const moves=structuredClone(f.s.movements);
  f.at(event.moveAt);expect(f.s.effects).toHaveLength(1);f.finish();expect(until).toBe(11700);expect(f.s.effects).toHaveLength(0);expect(f.s.movements).toEqual(moves);
  // The existing private face deadline expires normally; only matching eligibility is paused.
  expect(deadline).toBe(13000);expect(f.s.finalEndsAt).toBe(13000+event.end-event.start);
 });
 it('preserves the remaining final-match deadline without reopening the window',()=>{
  const f=fixture();f.s.phase='FINAL_MATCH_WINDOW';f.s.caller='p1';f.s.finalEndsAt=f.d.now()+3000;
  f.send({type:'match',window:f.s.window,slots:[f.ref()]});const event=f.s.reshuffling!;f.finish();
  expect(f.s.finalEndsAt).toBe(13000+event.end-event.start);expect(f.s.phase).toBe('FINAL_MATCH_WINDOW');expect(f.s.window).toBe('window');
 });
 it('reconnect freezes and resumes the same event instead of issuing a new shuffle',()=>{
  const f=fixture();f.draw();f.resolve();f.at(f.s.reshuffling!.moveAt+100);const before=structuredClone(f.s.reshuffling!);
  connection(f.s,f.d,'p1',false);f.at(f.d.now()+10000);expect(f.s.deck).toEqual([]);connection(f.s,f.d,'p1',true);
  expect(f.s.reshuffling!.id).toBe(before.id);expect(f.s.reshuffling!.cards).toEqual(before.cards);expect(f.s.reshuffling!.end).toBe(before.end+11000);f.finish();expect(f.s.deck).toEqual(before.cards);
 });
 it('never moves the only discard, permits resolving the held card, then reshuffles newly available buried cards',()=>{
  const f=fixture();f.s.players[1].slots.push(...f.s.discard.splice(0,f.s.discard.length-1).map(card=>({rev:1,card})));f.draw();
  expect(f.s.deck).toEqual([]);expect(f.s.reshuffling).toBeUndefined();expect(f.s.discard).toHaveLength(1);expect(()=>f.draw()).toThrow();
  f.at(f.s.visualUntil);f.send({type:'resolveDraw',turn:0});expect(f.s.reshuffling?.count).toBe(1);f.finish();expect(f.s.deck).toHaveLength(1);expect(f.s.discard).toHaveLength(1);
 });
 it('mandatory penalties with genuinely exhausted supply retain the existing safe redeal path',()=>{
  const f=fixture();f.s.players[1].slots.push(...f.s.deck.splice(0).map(card=>({rev:1,card})),...f.s.discard.splice(0,f.s.discard.length-1).map(card=>({rev:1,card})));
  f.send({type:'match',window:f.s.window,slots:[f.ref()]});expect(f.s.paused?.reason).toBe('No cards available');expect(f.s.reshuffling).toBeUndefined();assertCards(f.s);
 });
 it('safely pauses an owed late batch if a discard-pile replacement leaves no recyclable cards',()=>{
  const f=fixture();f.s.players[1].slots.push(...f.s.discard.splice(0,f.s.discard.length-1).map(card=>({rev:1,card})));
  f.send({type:'draw',source:'discard',window:f.s.window,turn:0});f.send({type:'match',window:f.s.window,slots:[f.ref('p0',0),f.ref('p0',1)]});expect(f.s.pendingMatch?.slots).toHaveLength(1);
  f.resolve(f.ref());expect(f.s.paused?.reason).toBe('No cards available');expect(f.s.reshuffling).toBeUndefined();expect(f.s.discard).toHaveLength(1);assertCards(f.s);
 });
 it('resumes incorrect-call scoring and tie-break bulk draws with conservation',()=>{
  const f=fixture([[0],[3],[3]],8,0);f.s.caller='p1';f.send({type:'match',window:f.s.window,slots:[f.ref()]});expect(f.s.ending).toBe(true);expect(f.s.incorrectApplied).toBe(true);f.finish();expect(f.s.history).toHaveLength(1);expect(f.s.players[1].slots).toHaveLength(2);
  const g=fixture([[0],[3],[3]],8,0);g.send({type:'match',window:g.s.window,slots:[g.ref()]});expect(g.s.ranking?.drawn).toHaveLength(1);expect(g.s.ending).toBe(true);g.finish();expect(g.s.history).toHaveLength(1);expect(g.s.ranking).toBeUndefined();assertCards(g.s);
 });
 it('still ends immediately at zero cards and never awards queued special actions',()=>{
  const f=fixture([[12],[4,5]],8,12);f.send({type:'match',window:f.s.window,slots:[f.ref()]});expect(f.s.phase).toBe('ROUND_RESULTS');expect(f.s.effects).toEqual([]);expect(f.s.reshuffling).toBeUndefined();
 });
 it('setup always deals from a fresh full deck within the six-player limit',()=>{
  const f=fixture(Array.from({length:6},()=>[2]));startRound(f.s,f.d,true);expect(f.s.deck).toHaveLength(80);expect(f.s.reshuffling).toBeUndefined();f.at(f.s.initialPeek!.revealAt);f.at(f.s.initialPeek!.finishAt);expect(f.s.deck).toHaveLength(79);
 });
 it.each([50,11,10,9,2,1,0])('renders min(count,10) layers for %i cards',count=>expect(deckLayers(count)).toBe(Math.min(count,10)));
});

it('serializes simultaneous requests, deduplicates a suspended batch and restores its continuation from storage',async()=>{
 const f=fixture();class SavedStore extends MemoryStore{data?:RecordData;override save(data:RecordData){this.data=structuredClone(data);}override load(){return this.data?[structuredClone(this.data)]:[];}}
 const store=new SavedStore();const rooms=new Rooms(store,config({}),f.d);const made=await rooms.create('Ada',crypto.randomUUID());const room=made.room;f.s.room=room.data.state.room;room.data.state=f.s;room.controllers.set('p0','socket');
 const command={type:'match',id:crypto.randomUUID(),game:1,round:1,window:'window',slots:[f.ref('p0',0),f.ref('p0',1),f.ref('p0',2)]};
 const [a,b,c]=await Promise.all([rooms.command(room,'p0','socket',command),rooms.command(room,'p0','socket',command),rooms.command(room,'p0','socket',{...command,id:crypto.randomUUID()})]);
 expect(a.ok).toBe(true);expect(b).toEqual(a);expect(c.code).toBe('WAIT');expect(room.data.state.players[0].slots).toHaveLength(5);const event=structuredClone(room.data.state.reshuffling!);
 const restored=new Rooms(store,config({}),f.d),again=restored.rooms.get(f.s.room)!;
 expect(again.data.state.reshuffling!.id).toBe(event.id);await restored.connect(again,'p0','new');await restored.connect(again,'p1','guest');expect(again.data.state.paused).toBeUndefined();
 const end=again.data.state.reshuffling!.end;f.at(end);await restored.timers();expect(again.data.state.players[0].slots).toHaveLength(7);expect(again.data.state.pendingMatch).toBeUndefined();
 const replay=await restored.command(again,'p0','new',command);expect(replay.results).toEqual(['wrong','wrong','wrong']);expect(again.data.state.players[0].slots).toHaveLength(7);assertCards(again.data.state);
});
