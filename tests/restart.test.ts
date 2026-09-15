import { it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import type { View, Reply } from '../src/shared/protocol.js';
const url='http://localhost:3199';
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
it('crash/restart preserves held draw, queued peek, action IDs, credentials and frozen time; memory loses room',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'archduke-process-'));const sockets:Socket[]=[];let child:ChildProcess|undefined;
 async function launch(mode:'memory'|'sqlite'){
  child=spawn(process.execPath,['--import','tsx','tests/restart-server.ts'],{cwd:process.cwd(),env:{...process.env,PUBLIC_ORIGIN:url,PORT:'3199',PERSISTENCE:mode,DATA_DIR:dir,NODE_ENV:'test'},stdio:['ignore','pipe','pipe']});
  const processChild=child;
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Process failed to start')),5000);processChild.stdout!.on('data',data=>{if(String(data).includes('test-process-ready')){clearTimeout(timer);resolve();}});processChild.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}`));});});
 }
 async function crash(){const processChild=child!;const exited=new Promise<void>(r=>processChild.once('exit',()=>r()));processChild.kill('SIGKILL');await exited;child=undefined;sockets.splice(0).forEach(s=>s.disconnect());}
 async function post(path:string,body:object){const response=await fetch(url+path,{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),...body})});expect(response.status).toBe(200);return {data:await response.json(),cookie:response.headers.get('set-cookie')!.split(';')[0]};}
 async function connect(room:string,cookie:string){let view:View;const socket=io(url,{autoConnect:false,reconnection:false,transports:['websocket'],auth:{room},extraHeaders:{Origin:url,Cookie:cookie}});sockets.push(socket);socket.on('state',s=>view=s);await new Promise<void>((r,j)=>{socket.once('state',()=>r());socket.once('connect_error',j);socket.connect();});return {get v(){return view!;},send:async(a:object,id=crypto.randomUUID()):Promise<Reply>=>await socket.emitWithAck('command',{id,game:view!.game,round:view!.round,...a})};}
 try{
  await launch('sqlite');const host=await post('/api/create',{name:'Host'});const room=host.data.room as string;let a=await connect(room,host.cookie);const guest=await post('/api/join',{name:'Guest',invite:a.v.invite});let b=await connect(room,guest.cookie);
  for(const p of [a,b])expect((await p.send({type:'ready',ready:true})).ok).toBe(true);expect((await a.send({type:'start'})).ok).toBe(true);
  await expect.poll(()=>a.v.open&&b.v.open,{timeout:7000}).toBe(true);
  await delay(Math.max(0,b.v.unlockAt-Date.now()+10));const drawId=crypto.randomUUID();const draw={type:'draw',source:'draw',window:b.v.window,turn:b.v.turn};const drawReply=await b.send(draw,drawId);expect(drawReply.ok).toBe(true);const heldValue=b.v.held?.value;const identities=b.v.players.map(p=>p.id);
  await crash();await launch('sqlite');a=await connect(room,host.cookie);b=await connect(room,guest.cookie);expect(b.v.players.map(p=>p.id)).toEqual(identities);expect(b.v.held?.value).toBe(heldValue);expect(a.v.held?.value).toBeUndefined();expect(b.v.paused).toBeDefined();expect(await b.send(draw,drawId)).toEqual(drawReply);expect((await a.send({type:'resume'})).ok).toBe(true);await expect.poll(()=>b.v.paused).toBeUndefined();await delay(Math.max(0,b.v.restartAt-Date.now(),b.v.visualUntil-Date.now())+20);
  expect((await b.send({type:'resolveDraw',turn:b.v.turn,target:{player:b.v.you,slot:0,rev:1}})).ok).toBe(true);expect(b.v.effects[0].kind).toBe(12);const effect=b.v.effects[0].id;await delay(Math.max(0,b.v.visualUntil-Date.now())+20);expect((await b.send({type:'effect',effect,targets:[{player:a.v.you,slot:0,rev:1}]})).ok).toBe(true);const db=new DatabaseSync(join(dir,'archduke.sqlite'),{readOnly:true});const saved=JSON.parse((db.prepare('SELECT body FROM rooms WHERE id=?').get(room) as {body:string}).body);db.close();const remaining=saved.state.effects[0].viewUntil-saved.lastActive;const face=b.v.players[0].slots[0].value;expect(face).toBe(13);
  await crash();await delay(200);await launch('sqlite');a=await connect(room,host.cookie);b=await connect(room,guest.cookie);expect(b.v.effects[0].id).toBe(effect);expect(b.v.effects[0].viewUntil!-b.v.paused!.since).toBeCloseTo(remaining,0);expect(b.v.players[0].slots[0].value).toBe(face);expect(a.v.players[0].slots[0].value).toBeUndefined();expect((await a.send({type:'resume'})).ok).toBe(true);await expect.poll(()=>b.v.paused).toBeUndefined();await delay(b.v.restartAt-Date.now()+20);expect((await b.send({type:'done',effect})).ok).toBe(true);expect(b.v.effects).toHaveLength(0);
  await crash();await launch('memory');const lost=await fetch(`${url}/api/room/${room}`,{headers:{Cookie:host.cookie}});expect(lost.status).toBe(404);expect((await lost.json()).message).toBe('This game is no longer available');
 }finally{if(child)await crash();rmSync(dir,{recursive:true,force:true});}
},25000);
