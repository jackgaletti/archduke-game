import { describe, expect, it } from 'vitest';
import { Rooms } from '../src/server/rooms';
import { MemoryStore, type RecordData } from '../src/server/store';
import { config } from '../src/server/config';
import { project } from '../src/engine/engine';
import { assertCards, deck, type Dependencies } from '../src/engine/model';

async function fixture(){
 let now=10000;
 const d:Dependencies={now:()=>now,randomInt:n=>n-1,motion:500,delay:1000,peek:3000,grace:60000,restart:1000};
 class Saved extends MemoryStore{data?:RecordData;override save(data:RecordData){this.data=structuredClone(data);}override load(){return this.data?[structuredClone(this.data)]:[];}}
 const store=new Saved(),rooms=new Rooms(store,config({}),d),host=await rooms.create('Ada',crypto.randomUUID()),room=host.room;
 const guest=await rooms.join(room,'Bea',crypto.randomUUID()),ids=[host.seat,guest.seat];for(const id of ids)await rooms.connect(room,id,id);
 const s=()=>room.data.state,v=(i=0)=>project(s(),d,ids[i]);
 const command=(action:object)=>({id:crypto.randomUUID(),game:s().game,round:s().round,...action});
 const send=(i:number,action:object)=>rooms.command(room,ids[i],ids[i],command(action));
 const advance=async(ms:number)=>{now+=ms;await rooms.timers();};
 const waiting=async(round:number)=>rooms.transaction(room,({state:s})=>{s.game=1;s.round=round;s.betweenRounds=true;s.deck=deck();s.players.forEach(p=>{p.ready=false;p.slots=[];});s.history=Array.from({length:round},()=>ids.map((player,i)=>({player,sum:i+10,count:4,lowest:i+1,place:i+1,tie:''})));s.seq++;});
 const playing=async(top=7)=>rooms.transaction(room,({state:s})=>{const cards=deck(),take=(value:number)=>cards.splice(cards.findIndex(c=>c.value===value),1)[0];s.players.forEach((p,i)=>{p.slots=(i===0?[top,top,2]:[3,4]).map((value,index)=>({rev:1,card:take(value),row:index%2,column:Math.floor(index/2)}));});s.discard=[take(top)];s.deck=cards;s.game=1;s.round=1;s.phase='INTER_TURN';s.window='window';s.open=true;s.next=ids[1];s.seq++;});
 const target=(i:number,index=0)=>({player:ids[i],slot:index,rev:s().players[i].slots[index].rev});
 const draw=(source='draw')=>({type:'draw',source,turn:s().turn,window:s().window});
 return {rooms,room,store,d,ids,s,v,send,command,advance,waiting,playing,target,draw};
}

describe('authoritative next-round deadline',()=>{
 for(const previous of [1,2,3])it(`counts down before round ${previous+1}, once, with unchanged deal timing`,async()=>{
  const f=await fixture();await f.waiting(previous);await f.send(0,{type:'ready',ready:true});expect(f.s().roundStartsAt).toBeUndefined();
  const rngCalls:number[]=[];f.d.randomInt=n=>{rngCalls.push(n);return n-1;};const cmd=f.command({type:'ready',ready:true});const replies=await Promise.all([f.rooms.command(f.room,f.ids[1],f.ids[1],cmd),f.rooms.command(f.room,f.ids[1],f.ids[1],cmd)]);expect(replies[1]).toEqual(replies[0]);
  const end=f.d.now()+3000;expect(f.s().phase).toBe('NEXT_ROUND_COUNTDOWN');expect(f.v().phase).toBe('NEXT_ROUND_COUNTDOWN');expect(f.v().roundStartsAt).toBe(end);expect(f.v(1).roundStartsAt).toBe(end);expect(f.s().round).toBe(previous);expect(f.s().movements).toEqual([]);
  await f.send(1,{type:'ready',ready:true});expect(f.s().roundStartsAt).toBe(end);expect((await f.send(1,{type:'ready',ready:false})).ok).toBe(false);expect((await f.send(0,{type:'start'})).ok).toBe(false);
  for(const number of [3,2,1]){expect(Math.ceil((f.v().roundStartsAt!-f.d.now())/1000)).toBe(number);expect(f.s().players.every(p=>p.slots.length===0)).toBe(true);await f.advance(number===1?999:1000);}
  expect(f.s().round).toBe(previous);expect(rngCalls).toEqual([]);await f.advance(1);expect(rngCalls).toHaveLength(103);expect(f.s().round).toBe(previous+1);expect(f.s().phase).toBe('INITIAL_PEEK');expect(f.s().roundStartsAt).toBe(end);
  const moves=structuredClone(f.s().movements);expect(moves).toHaveLength(8);expect(moves.every(m=>m.end-m.start===500)).toBe(true);expect(moves.slice(0,4).map(m=>m.start-f.d.now())).toEqual([0,40,80,120]);await f.rooms.timers();expect(f.s().movements).toEqual(moves);await f.advance(620);expect(f.s().roundStartsAt).toBeUndefined();assertCards(f.s());
 });
 it('round one still starts immediately and Exit invalidates a pending countdown',async()=>{
  const f=await fixture();for(const i of [0,1])await f.send(i,{type:'ready',ready:true});expect(f.s().roundStartsAt).toBeUndefined();await f.send(0,{type:'start'});expect(f.s().phase).toBe('INITIAL_PEEK');expect(f.s().roundStartsAt).toBeUndefined();
  await f.send(0,{type:'abort'});await f.waiting(1);for(const i of [0,1])await f.send(i,{type:'ready',ready:true});const old=f.command({type:'ready',ready:true});await f.send(0,{type:'abort'});await f.advance(10000);expect(f.s().phase).toBe('LOBBY');expect(f.s().round).toBe(0);expect(f.s().roundStartsAt).toBeUndefined();expect((await f.rooms.command(f.room,f.ids[0],f.ids[0],old)).code).toBe('STALE');
 });
 it('queued stale maintenance and Ready cannot start a future match after Exit',async()=>{
  const f=await fixture();await f.waiting(1);for(const i of [0,1])await f.send(i,{type:'ready',ready:true});const stale=f.command({type:'ready',ready:true});
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});f.room.queue=f.room.queue.then(()=>gate);
  const exit=f.send(0,{type:'abort'}),due=f.advance(3000);release();await Promise.all([exit,due]);expect(f.s().phase).toBe('LOBBY');expect(f.s().round).toBe(0);expect(f.s().movements).toEqual([]);
  for(const i of [0,1])await f.send(i,{type:'ready',ready:true});await f.send(0,{type:'start'});const moves=structuredClone(f.s().movements);expect((await f.rooms.command(f.room,f.ids[0],f.ids[0],stale)).code).toBe('STALE');await f.rooms.timers();expect(f.s().round).toBe(1);expect(f.s().movements).toEqual(moves);expect(f.s().roundStartsAt).toBeUndefined();
 });
 it('migrates a saved pre-phase countdown without resetting its deadline',async()=>{
  const f=await fixture();await f.waiting(1);for(const i of [0,1])await f.send(i,{type:'ready',ready:true});await f.advance(1200);
  await f.rooms.transaction(f.room,({state:s})=>{s.phase='LOBBY';});const savedEnd=f.s().roundStartsAt;
  const restored=new Rooms(f.store,config({}),f.d),s=restored.rooms.get(f.s().room)!.data.state;
  expect(s.phase).toBe('NEXT_ROUND_COUNTDOWN');expect(s.roundStartsAt).toBe(savedEnd);expect(s.paused).toBeDefined();expect(s.movements).toEqual([]);
 });
 it('reconnect and saved-room recovery preserve the remaining countdown instead of resetting it',async()=>{
  const f=await fixture();await f.waiting(2);for(const i of [0,1])await f.send(i,{type:'ready',ready:true});await f.advance(1200);const remaining=f.s().roundStartsAt!-f.d.now();
  await f.rooms.disconnect(f.room,f.ids[1],f.ids[1]);await f.advance(20000);expect(f.s().round).toBe(2);expect(f.s().paused).toBeDefined();await f.rooms.connect(f.room,f.ids[1],f.ids[1]);expect(f.s().roundStartsAt!-f.s().restartAt).toBe(remaining);
  const restored=new Rooms(f.store,config({}),f.d),room=restored.rooms.get(f.s().room)!;expect(room.data.state.paused).toBeDefined();for(const id of f.ids)await restored.connect(room,id,id);expect(room.data.state.roundStartsAt!-room.data.state.restartAt).toBe(remaining+f.d.restart);
  await f.advance(f.s().roundStartsAt!-f.d.now());expect(f.s().round).toBe(3);assertCards(f.s());
 });
});

describe('serialized draw-versus-match race',()=>{
 for(const source of ['draw','discard'])for(const first of ['match','draw'])it(`${first} first against ${source}: one atomic result per action, all clients converge`,async()=>{
  const f=await fixture();await f.playing();const frames:ReturnType<typeof f.v>[][]=[];f.room.publish=make=>frames.push(f.ids.map(make));
  const match=f.command({type:'match',window:f.s().window,slots:[f.target(0,0),f.target(0,1)]}),draw=f.command(f.draw(source));const a=()=>f.rooms.command(f.room,f.ids[0],f.ids[0],match),b=()=>f.rooms.command(f.room,f.ids[1],f.ids[1],draw);
  const replies=await Promise.all(first==='match'?[a(),b()]:[b(),a()]);expect(replies.every(r=>r.ok)).toBe(true);expect(replies[1].seq).toBe(replies[0].seq+1);expect(f.s().open).toBe(false);expect(f.s().phase).toBe('HOLDING_DRAWN_CARD');
  const matchReply=first==='match'?replies[0]:replies[1];expect(matchReply.results).toEqual(first==='match'?['matched','matched']:['late','late']);expect(f.s().players[0].slots.filter(s=>s.card)).toHaveLength(first==='match'?1:5);
  const before=structuredClone(f.s());expect(await a()).toEqual(matchReply);expect(await b()).toEqual(first==='match'?replies[1]:replies[0]);expect(f.s()).toEqual(before);
  expect(frames.every(frame=>frame.every(v=>v.seq===frame[0].seq&&v.window===frame[0].window&&v.turn===frame[0].turn&&v.game===frame[0].game&&v.room===frame[0].room))).toBe(true);expect(frames.slice(0,2).map(frame=>frame[0].seq)).toEqual(replies.map(r=>r.seq));assertCards(f.s());
 });
 for(const source of ['draw','discard'])it(`ordinary discard opens ${source} immediately, even while discard and failed-match animations remain`,async()=>{
  const f=await fixture();await f.playing();await f.send(1,f.draw());await f.advance(f.s().visualUntil-f.d.now());await f.send(1,{type:'resolveDraw',turn:f.s().turn});const time=f.d.now();expect(f.s().visualUntil).toBeGreaterThan(time);expect(f.s().unlockAt).toBe(time);
  const failed=await f.send(0,{type:'match',window:f.s().window,slots:[f.target(0,2)]});expect(failed.code).toBe('PENALTY');expect(f.d.now()).toBe(time);expect((await f.send(0,f.draw(source))).ok).toBe(true);expect(f.s().invalidMatches).toHaveLength(1);assertCards(f.s());
 });
 it('obsolete windows and stale slots cannot act on a newer discard or multiply penalties',async()=>{
  const f=await fixture();await f.playing();const old=f.s().window,target=f.target(0);await f.send(1,f.draw());await f.advance(f.s().visualUntil-f.d.now());await f.send(1,{type:'resolveDraw',turn:f.s().turn});const before=structuredClone(f.s());expect((await f.send(0,{type:'match',window:old,slots:[target]})).code).toBe('STALE');expect(f.s()).toEqual(before);
  expect((await f.send(0,{type:'match',window:f.s().window,slots:[target,target]})).ok).toBe(false);expect((await f.send(0,{type:'match',window:f.s().window,slots:[{...target,rev:0}]})).code).toBe('STALE');expect(f.s()).toEqual(before);
 });
 for(const kind of [1,11,12])it(`keeps the ${kind} effect barrier, then permits drawing immediately after resolution`,async()=>{
  const f=await fixture();await f.playing(kind);await f.send(0,{type:'match',window:f.s().window,slots:[f.target(0)]});expect((await f.send(1,f.draw())).code).toBe('WAIT');await f.advance(f.s().visualUntil-f.d.now());expect((await f.send(0,{type:'effect',effect:f.s().effects[0].id,skip:true})).ok).toBe(true);expect((await f.send(1,f.draw())).ok).toBe(true);assertCards(f.s());
 });
});
