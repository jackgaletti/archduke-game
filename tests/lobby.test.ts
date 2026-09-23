import { describe, expect, it } from 'vitest';
import { Rooms } from '../src/server/rooms';
import { MemoryStore, type RecordData } from '../src/server/store';
import { config } from '../src/server/config';
import { project, tick } from '../src/engine/engine';
import { assertCards, type Dependencies } from '../src/engine/model';

async function fixture(count=2){
 let now=10000;
 const deps:Dependencies={now:()=>now,randomInt:n=>n-1,motion:500,delay:1000,peek:3000,grace:60000,restart:1000};
 class SavedStore extends MemoryStore{data?:RecordData;override save(data:RecordData){this.data=structuredClone(data);}override load(){return this.data?[structuredClone(this.data)]:[];}}
 const store=new SavedStore(),rooms=new Rooms(store,config({}),deps),host=await rooms.create('Ada',crypto.randomUUID()),room=host.room;
 const participants=[host];await rooms.connect(room,host.seat,host.seat);
 for(let i=1;i<count;i++){const guest=await rooms.join(room,`Guest ${i}`,crypto.randomUUID());participants.push({...guest,room});await rooms.connect(room,guest.seat,guest.seat);}
 const state=()=>room.data.state,view=(i=0)=>project(state(),deps,participants[i].seat);
 const command=(i:number,action:object)=>({id:crypto.randomUUID(),game:state().game,round:state().round,...action});
 const send=(i:number,action:object)=>rooms.command(room,participants[i].seat,participants[i].seat,command(i,action));
 const ready=async()=>{for(let i=0;i<count;i++)expect((await send(i,{type:'ready',ready:true})).ok).toBe(true);};
 const start=async()=>{await ready();expect((await send(0,{type:'start'})).ok).toBe(true);};
 const advance=async(ms:number)=>{now+=ms;await rooms.timers();};
 return {rooms,room,store,deps,participants,state,view,command,send,ready,start,advance};
}

describe('persistent room lobby',()=>{
 it('creates and joins without cards, synchronizes readiness and requires explicit host start',async()=>{
  const f=await fixture();const published:unknown[]=[];f.room.publish=make=>published.push(f.participants.map(p=>make(p.seat).lobby));
  expect(f.view().lobby).toMatchObject({inProgress:false,canStart:false});expect(f.state().deck).toEqual([]);expect(f.state().players.every(p=>!p.ready&&!p.slots.length)).toBe(true);
  expect((await f.send(0,{type:'start'})).ok).toBe(false);expect((await f.send(1,{type:'ready',ready:true,actor:f.participants[0].seat})).code).toBe('MALFORMED');
  await f.send(1,{type:'ready',ready:true});expect(f.view(0).lobby!.players.map(p=>p.ready)).toEqual([false,true]);expect(f.view(1).lobby).toEqual(f.view().lobby);expect(published).toHaveLength(1);
  expect((await f.send(1,{type:'ready',ready:false})).ok).toBe(false);expect((await f.send(0,{type:'start'})).ok).toBe(false);
  await f.send(0,{type:'ready',ready:true});expect(f.view().lobby?.canStart).toBe(true);expect(f.state().phase).toBe('LOBBY');expect((await f.send(1,{type:'start'})).ok).toBe(false);
  const action=f.command(0,{type:'start'}),id=f.participants[0].seat;
  const replies=await Promise.all([f.rooms.command(f.room,id,id,action),f.rooms.command(f.room,id,id,action)]);expect(replies[1]).toEqual(replies[0]);
  expect(f.view().lobby).toBeUndefined();expect(f.state().game).toBe(1);expect(f.state().round).toBe(1);expect(f.state().movements.filter(m=>m.kind==='deal')).toHaveLength(8);expect(f.state().initialPeek!.hideAt-f.state().initialPeek!.revealAt).toBe(2360);
  expect((await f.send(0,{type:'start'})).ok).toBe(false);assertCards(f.state());
 });
 it('requires the minimum roster and gives disconnected seats the existing reconnection grace',async()=>{
  const alone=await fixture(1);await alone.ready();expect(alone.view().lobby?.canStart).toBe(false);expect((await alone.send(0,{type:'start'})).ok).toBe(false);
  const f=await fixture(3);await f.ready();const absent=f.participants[2];await f.rooms.disconnect(f.room,absent.seat,absent.seat);expect(f.view().lobby?.canStart).toBe(false);
  await f.advance(60001);expect(f.view().lobby?.canStart).toBe(true);expect((await f.send(0,{type:'start'})).ok).toBe(true);
  expect(f.state().players.map(p=>p.id)).toEqual(f.participants.slice(0,2).map(p=>p.seat));expect(f.state().waiting?.map(p=>p.id)).toEqual([absent.seat]);
  await f.rooms.connect(f.room,absent.seat,'again');expect(f.view(2).lobby?.inProgress).toBe(true);expect(f.state().paused).toBeUndefined();
 });
 it.each(['join-first','start-first'])('serializes %s against the roster freeze',async order=>{
  const f=await fixture();await f.ready();
  const join=()=>f.rooms.join(f.room,'Late',crypto.randomUUID()),start=()=>f.send(0,{type:'start'});
  if(order==='join-first'){
   const [guest,result]=await Promise.all([join(),start()]);expect(result.ok).toBe(false);expect(f.state().players).toHaveLength(3);expect(f.view().lobby?.canStart).toBe(false);
   await f.rooms.connect(f.room,guest.seat,guest.seat);expect(f.view().lobby?.canStart).toBe(false);
  }else{
   const [result,guest]=await Promise.all([start(),join()]);expect(result.ok).toBe(true);expect(f.state().players).toHaveLength(2);expect(f.state().waiting?.[0].id).toBe(guest.seat);
  }
 });
 it('keeps late joins private and separate through refresh, reconnect, Give and capacity checks',async()=>{
  const f=await fixture();await f.start();await f.advance(620);const active=structuredClone(f.state().players);
  const late=await f.rooms.join(f.room,'Late',crypto.randomUUID());await f.rooms.connect(f.room,late.seat,'late');
  const view=()=>project(f.state(),f.deps,late.seat);expect(view().lobby?.inProgress).toBe(true);expect(view().players.every(p=>!p.slots.length)).toBe(true);
  for(const field of ['held','discard','initialPeek','reshuffling'])expect(view()).not.toHaveProperty(field);expect(view().movements).toEqual([]);expect(view().effects).toEqual([]);expect(view().history).toEqual([]);
  expect(f.state().players).toEqual(active);expect(f.view().players).toHaveLength(2);
  expect((await f.rooms.command(f.room,late.seat,'late',f.command(0,{type:'ready',ready:true}))).ok).toBe(false);
  await f.rooms.disconnect(f.room,late.seat,'late');expect(f.state().paused).toBeUndefined();await f.rooms.connect(f.room,late.seat,'late2');expect(view().lobby?.inProgress).toBe(true);
  await f.rooms.connect(f.room,f.participants[0].seat,f.participants[0].seat);expect(f.view().lobby).toBeUndefined();expect(f.state().players).toHaveLength(2);
  await f.advance(2720);await f.advance(2000);f.state().effects=[{id:'give',kind:1,actor:f.participants[0].seat}];const before=structuredClone(f.state());expect((await f.send(0,{type:'effect',effect:'give',recipient:late.seat})).ok).toBe(false);expect(f.state()).toEqual(before);
  for(let i=0;i<3;i++)await f.rooms.join(f.room,`Waiting ${i}`,crypto.randomUUID());await expect(f.rooms.join(f.room,'Seventh',crypto.randomUUID())).rejects.toThrow(/full/);expect(f.rooms.auth(f.room,late.credential)).toBe(late.seat);
 });
 it('Exit cancels all match state, preserves identity and sessions, and invalidates old callbacks/commands',async()=>{
  const f=await fixture();await f.start();const late=await f.rooms.join(f.room,'Late',crypto.randomUUID());await f.rooms.connect(f.room,late.seat,'late');
  const identity={room:f.state().room,code:f.state().code,invite:f.state().invite,host:f.state().host},old=f.command(0,{type:'ready',ready:true});
  expect((await f.send(1,{type:'abort'})).ok).toBe(false);expect((await f.send(0,{type:'abort'})).ok).toBe(true);
  expect(f.state()).toMatchObject(identity);expect(f.state().players).toHaveLength(3);expect(f.state().players.every(p=>!p.ready&&!p.slots.length&&!p.seen?.length)).toBe(true);expect(f.state().waiting).toEqual([]);
  expect(f.state()).toMatchObject({round:0,deck:[],discard:[],history:[],effects:[],movements:[],reveals:[],finalTurns:[]});
  for(const field of ['initialPeek','reshufflePending','reshuffling','pendingMatch','ranking','held','caller','finalEndsAt','paused'])expect(f.state()[field as keyof ReturnType<typeof f.state>]).toBeUndefined();
  const generation=f.state().game;expect((await f.send(0,{type:'abort'})).ok).toBe(true);expect(f.state().game).toBe(generation);
  await f.advance(100000);expect(f.state().phase).toBe('LOBBY');expect(f.state().movements).toEqual([]);expect(f.rooms.auth(f.room,late.credential)).toBe(late.seat);
  expect((await f.rooms.command(f.room,f.participants[0].seat,f.participants[0].seat,old)).code).toBe('STALE');
 });
 it('New Game resets the whole room once after the final podium',async()=>{
  const f=await fixture();await f.start();f.state().phase='GAME_RESULTS';f.state().round=4;f.state().initialPeek=undefined;f.state().players.forEach(p=>{p.reviewingResults=true;p.viewingLeaderboard=true;});
  const late=await f.rooms.join(f.room,'Late',crypto.randomUUID());const invite=f.state().invite;const cmd=f.command(1,{type:'next'}),guest=f.participants[1].seat;
  const first=await f.rooms.command(f.room,guest,guest,cmd);expect(first.ok).toBe(true);const generation=f.state().game;expect(await f.rooms.command(f.room,guest,guest,cmd)).toEqual(first);expect(f.state().game).toBe(generation);
  expect(f.state().invite).toBe(invite);expect(f.view().lobby?.inProgress).toBe(false);expect(f.state().players.map(p=>p.id)).toContain(late.seat);expect(f.state().players.every(p=>!p.ready)).toBe(true);expect(f.state().round).toBe(0);
 });
 it('abandoning a pending reshuffle invalidates its event and queued game work',async()=>{
  const f=await fixture();await f.start();const s=f.state(),actor=f.participants[0].seat;
  s.phase='INTER_TURN';s.initialPeek=undefined;s.discard=s.deck.splice(0);s.reshuffling={id:'old-refill',start:f.deps.now(),moveAt:f.deps.now()+700,end:f.deps.now()+2400,count:s.discard.length-1,cards:[],collected:false};
  s.effects=[{id:'old-peek',kind:12,actor,viewUntil:f.deps.now()+1000}];s.pendingMatch={actor,id:'old-batch',late:true,results:[],slots:[{player:actor,slot:0,rev:1}]};s.caller=actor;s.finalEndsAt=f.deps.now()+3000;
  const old=f.command(0,{type:'effect',effect:'old-peek',skip:true});await f.send(0,{type:'abort'});await f.start();const fresh=structuredClone(f.state());
  expect((await f.rooms.command(f.room,actor,actor,old)).code).toBe('STALE');expect(f.state()).toEqual(fresh);expect(f.state().reshuffling).toBeUndefined();expect(f.state().pendingMatch).toBeUndefined();expect(f.state().effects).toEqual([]);expect(f.state().caller).toBeUndefined();assertCards(f.state());
  await f.advance(2400);expect(f.state().deck).toHaveLength(96);expect(f.state().round).toBe(1);expect(f.state().reshuffling).toBeUndefined();
 });
 it('persisted active and waiting identities restore into their own views',async()=>{
  const f=await fixture();await f.start();const late=await f.rooms.join(f.room,'Late',crypto.randomUUID());const restored=new Rooms(f.store,config({}),f.deps),room=restored.rooms.get(f.state().room)!;
  for(const p of f.participants)await restored.connect(room,p.seat,p.seat);await restored.connect(room,late.seat,'late');
  expect(project(room.data.state,f.deps,late.seat).lobby?.inProgress).toBe(true);expect(project(room.data.state,f.deps,f.participants[0].seat).lobby).toBeUndefined();expect(room.data.state.players).toHaveLength(2);assertCards(room.data.state);
  tick(room.data.state,f.deps);expect(room.data.state.round).toBe(1);
 });
});
