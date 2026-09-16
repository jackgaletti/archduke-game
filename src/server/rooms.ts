import { randomBytes, randomInt, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { apply, connection, pause, project, tick } from '../engine/engine.js';
import { assertCards, deck, createState, newPlayer, RuleError, need, type Dependencies } from '../engine/model.js';
import { MAX_PLAYERS, commandSchema, type Command, type Reply, type View } from '../shared/protocol.js';
import type { RecordData, Store } from './store.js';
import type { Config } from './config.js';
const token=()=>randomBytes(24).toString('base64url');
export const verifier=(value:string)=>createHash('sha256').update(value).digest('hex');
export type Room={callDeadline?:number;data:RecordData;queue:Promise<unknown>;controllers:Map<string,string>;pendingDisconnects:Map<string,string>;publish:(view:(you:string)=>View)=>void;expire:()=>void};
export class Rooms {
 rooms=new Map<string,Room>();deps:Dependencies;metrics:number[]=[];
 constructor(public store:Store,public config:Config,dependencies?:Dependencies){
  this.deps=dependencies??{now:()=>performance.timeOrigin+performance.now(),randomInt,delay:config.delay,motion:config.motion,peek:config.peek,grace:config.grace,restart:config.restart};
  for(const data of store.load()){
   const s=data.state;if(s.phase==='LOBBY'&&!s.round&&!s.deck.length)s.deck=deck();for(const p of s.players){if(p.slots.some(slot=>slot.row===undefined||slot.column===undefined)){const columns=[0,0];p.columns=Math.max(2,Math.ceil(p.slots.length/2));p.slots.forEach((slot,i)=>{slot.row=i%2;slot.column=slot.card?columns[slot.row]++:Math.floor(i/2);});}}for(const p of s.players){p.initialOpen??=p.hidden?[]:[...(p.initial??[])];p.viewingLeaderboard??=false;p.seen??=[];}if(s.held)s.held.id??=token();for(const m of s.movements)m.id??=token();const restoredReason=s.paused?.reason==='No cards available'?'No cards available':'Server restarted. Rejoin and resume.';const oldNow=s.paused?.since??data.lastActive;
   // Rebase saved remaining durations. Downtime never consumes a competitive window.
   const delta=this.deps.now()-oldNow;
   s.visualUntil+=delta;s.unlockAt+=delta;if(s.initialPeek){s.initialPeek.revealAt+=delta;s.initialPeek.hideAt+=delta;s.initialPeek.finishAt+=delta;}else if(s.phase==='INITIAL_PEEK'){s.initialPeek={revealAt:this.deps.now()-2720,hideAt:this.deps.now()-360,finishAt:this.deps.now(),stage:2};}if(s.finalEndsAt!==undefined)s.finalEndsAt+=delta;s.restartAt=0;
   for(const m of s.movements){m.start+=delta;m.end+=delta;}
   for(const r of s.reveals)r.until+=delta;
   for(const e of s.effects)if(e.viewUntil!==undefined)e.viewUntil+=delta;
   s.players.forEach(p=>p.connected=false);s.paused=undefined;
   if(!['LOBBY','ROUND_RESULTS','GAME_RESULTS'].includes(s.phase))pause(s,this.deps,restoredReason);
   s.seq++;this.add(data);store.save(data);
  }
 }
 private add(data:RecordData){const room:Room={data,queue:Promise.resolve(),controllers:new Map(),pendingDisconnects:new Map(),publish:()=>{},expire:()=>{}};this.rooms.set(data.state.room,room);return room;}
 async create(name:string,requestId:string){
  const request=verifier(`create:${requestId}`);const previous=[...this.rooms.values()].find(r=>r.data.admissions?.[request]);
  const credential=token();
  if(previous){const seat=previous.data.admissions![request];await this.transaction(previous,d=>{for(const [key,value] of Object.entries(d.sessions))if(value===seat)delete d.sessions[key];d.sessions[verifier(credential)]=seat;});return {room:previous,seat,credential};}
  const id=token();const seat=token();const s=createState(id,randomBytes(6).toString('hex').toUpperCase(),token(),newPlayer(seat,name));const data={state:s,sessions:{[verifier(credential)]:seat},admissions:{[request]:seat},lastActive:this.deps.now()};this.store.save(data);return {room:this.add(data),seat,credential};
 }
 findInvite(invite:string){return [...this.rooms.values()].find(r=>r.data.state.invite===invite||r.data.state.code===invite.toUpperCase());}
 async join(room:Room,name:string,requestId:string){const credential=token();let seat=token();await this.transaction(room,d=>{
  const request=verifier(`join:${requestId}`);const previous=d.admissions?.[request];
  if(previous){seat=previous;for(const [key,value] of Object.entries(d.sessions))if(value===seat)delete d.sessions[key];}
  else{need(d.state.phase==='LOBBY'&&!d.state.betweenRounds,'This game has started. Existing players can reconnect.');need(d.state.players.length<MAX_PLAYERS,'Room is full (6 players).');d.state.players.push(newPlayer(seat,name));(d.admissions??={})[request]=seat;d.state.seq++;}
  d.sessions[verifier(credential)]=seat;
 });return {seat,credential};}
 auth(room:Room,credential:string){return room.data.sessions[verifier(credential)];}
 transaction<T>(room:Room,fn:(d:RecordData)=>T):Promise<T>{
  const queued=performance.now();const task=room.queue.then(()=>{
   need(this.rooms.get(room.data.state.room)===room,'This game is no longer available','EXPIRED');const candidate=structuredClone(room.data);const result=fn(candidate);assertCards(candidate.state);candidate.lastActive=this.deps.now();this.store.save(candidate);room.data=candidate;room.publish(you=>project(candidate.state,this.deps,you,this.config.persistence));this.metrics.push(performance.now()-queued);if(this.metrics.length>10000)this.metrics.shift();return result;
  });room.queue=task.catch(()=>{});return task;
 }
 async command(room:Room,seat:string,controller:string,input:unknown):Promise<Reply>{
  const parsed=commandSchema.safeParse(input);if(!parsed.success)return {ok:false,code:'MALFORMED',message:'Invalid action format.',seq:room.data.state.seq};
  const c=parsed.data as Command;
  try{return await this.transaction(room,d=>{
   need(room.controllers.get(seat)===controller,'This seat is controlled by another tab.','TAKEN_OVER');
   const previous=d.state.acks[seat]?.[c.id];if(previous)return previous;need(!room.pendingDisconnects.size,'A disconnect is being saved. The table is paused.','PAUSED');
   const reply=apply(d.state,this.deps,seat,c);(d.state.acks[seat]??={})[c.id]=reply;return reply;
  });}catch(e){return {ok:false,code:e instanceof RuleError?e.code:'PERSISTENCE',message:e instanceof RuleError?e.message:'Unable to commit the action. Please reconnect and check its status.',seq:room.data.state.seq};}
 }
 async connect(room:Room,seat:string,socket:string){await this.transaction(room,d=>{connection(d.state,this.deps,seat,true);});room.controllers.set(seat,socket);room.pendingDisconnects.delete(seat);}
 async disconnect(room:Room,seat:string,socket:string){
  if(room.controllers.get(seat)!==socket)return;
  room.pendingDisconnects.set(seat,socket);
  const removed=await this.transaction(room,d=>{if(room.controllers.get(seat)===socket){connection(d.state,this.deps,seat,false);return true;}return false;});
  if(removed&&room.controllers.get(seat)===socket)room.controllers.delete(seat);
  if(room.pendingDisconnects.get(seat)===socket)room.pendingDisconnects.delete(seat);
 }
 async timers(){await Promise.all([...this.rooms.values()].map(async room=>{
  for(const [seat,socket] of room.pendingDisconnects)await this.disconnect(room,seat,socket);
  const s=room.data.state;const now=this.deps.now();const ttl=s.phase==='GAME_RESULTS'?1800000:7200000;
  if((s.phase==='GAME_RESULTS'||!s.players.some(p=>p.connected))&&now-room.data.lastActive>=ttl){const task=room.queue.then(()=>{if(this.deps.now()-room.data.lastActive>=ttl){this.store.remove(s.room);this.rooms.delete(s.room);room.expire();}});room.queue=task.catch(()=>{});await task;return;}
  if(!s.paused&&s.lastTurn&&s.visualUntil>0&&now>=s.visualUntil&&room.callDeadline!==s.visualUntil){await this.transaction(room,d=>{d.state.seq++;});room.callDeadline=s.visualUntil;}
  if(!s.paused&&(s.phase==='INITIAL_PEEK'&&!!s.initialPeek&&now>=[s.initialPeek.revealAt,s.initialPeek.hideAt,s.initialPeek.finishAt][s.initialPeek.stage]||s.effects[0]?.viewUntil!==undefined&&s.effects[0].viewUntil<=now||s.reveals.some(r=>r.until<=now)||s.phase==='FINAL_MATCH_WINDOW'&&!s.effects.length&&(s.finalEndsAt===undefined||s.finalEndsAt<=now)))await this.transaction(room,d=>tick(d.state,this.deps));
 }));}
}
