import express from 'express';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { Server } from 'socket.io';
import { z } from 'zod';
import { Rooms, verifier } from './rooms.js';
import { MemoryStore, SQLiteStore, type Store } from './store.js';
import { project } from '../engine/engine.js';
import { RuleError, type Dependencies } from '../engine/model.js';
import type { Config } from './config.js';
const name=z.string().trim().min(1).max(24).regex(/^[^\p{Cc}\p{Cf}]+$/u);
function cookie(header:string|undefined,room:string){return (header??'').split(';').map(v=>v.trim().split('=')).find(([k])=>k===`ad_${room}`)?.[1]??'';}
export function createApp(config:Config,store?:Store,dependencies?:Dependencies){
 const app=express();const http=createServer(app);const rooms=new Rooms(store??(config.persistence==='sqlite'?new SQLiteStore(config.dataDir):new MemoryStore()),config,dependencies);
 app.disable('x-powered-by');app.set('trust proxy',config.production?1:false);app.use(express.json({limit:'8kb'}));
 app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'");
  if(req.method==='POST'&&req.headers.origin!==config.origin){res.status(403).json({message:'Origin not allowed.'});return;}next();});
 const limits=new Map<string,{count:number;until:number}>();
 app.use('/api',(req,res,next)=>{const key=req.ip??'unknown';const now=Date.now();let b=limits.get(key);if(!b||b.until<now){b={count:0,until:now+60000};limits.set(key,b);}if(++b.count>80){res.status(429).json({message:'Too many requests. Try again shortly.'});return;}if(limits.size>10000)for(const [k,v] of limits)if(v.until<now)limits.delete(k);next();});
 const setCookie=(res:express.Response,room:string,credential:string)=>res.cookie(`ad_${room}`,credential,{httpOnly:true,secure:config.production,sameSite:'strict',maxAge:604800000,path:'/'});
 app.get('/healthz',(_req,res)=>res.json({ok:true}));
 app.post('/api/create',async(req,res)=>{const input=z.object({name,secret:z.string().max(256),id:z.string().uuid()}).strict().safeParse(req.body);if(!input.success){res.status(400).json({message:'Enter a name and host passphrase.'});return;}
  if(!timingSafeEqual(Buffer.from(verifier(input.data.secret)),Buffer.from(verifier(config.secret)))){res.status(403).json({message:'Incorrect host passphrase.'});return;}
  const result=await rooms.create(input.data.name,input.data.id);setCookie(res,result.room.data.state.room,result.credential);res.json({room:result.room.data.state.room});});
 app.post('/api/join',async(req,res)=>{const input=z.object({name,invite:z.string().min(1).max(100),id:z.string().uuid()}).strict().safeParse(req.body);if(!input.success){res.status(400).json({message:'Enter a name and valid invitation or room code.'});return;}
  const room=rooms.findInvite(input.data.invite);if(!room){res.status(404).json({message:'This game is no longer available'});return;}
  const existing=rooms.auth(room,cookie(req.headers.cookie,room.data.state.room));if(existing){res.json({room:room.data.state.room});return;}
  try{const result=await rooms.join(room,input.data.name,input.data.id);setCookie(res,room.data.state.room,result.credential);res.json({room:room.data.state.room});}catch(e){res.status(400).json({message:e instanceof RuleError?e.message:'Could not save your seat. Try again.'});}});
 app.get('/api/room/:room',(req,res)=>{const room=rooms.rooms.get(req.params.room);if(!room){res.status(404).json({message:'This game is no longer available'});return;}if(!rooms.auth(room,cookie(req.headers.cookie,req.params.room))){res.status(403).json({message:'Use your invitation to join this room.'});return;}res.json({room:req.params.room});});
 const io=new Server(http,{transports:['websocket'],maxHttpBufferSize:16384,allowRequest:(req,done)=>done(null,req.headers.origin===config.origin)});
 io.use((socket,next)=>{const id=socket.handshake.auth.room;if(typeof id!=='string'){next(new Error('Invalid room'));return;}const room=rooms.rooms.get(id);if(!room){next(new Error('This game is no longer available'));return;}const seat=rooms.auth(room,cookie(socket.request.headers.cookie,id));if(!seat){next(new Error('Invitation/session required'));return;}socket.data.room=room;socket.data.seat=seat;next();});
 io.on('connection',socket=>{
  const room=socket.data.room as ReturnType<Rooms['findInvite']> & {};const seat=socket.data.seat as string;
  room.expire=()=>{for(const controller of room.controllers.values()){const client=io.sockets.sockets.get(controller);client?.emit('expired');client?.disconnect(true);}};
  room.publish=view=>{for(const [id,controller] of room.controllers)io.sockets.sockets.get(controller)?.emit('state',view(id));};
  const previous=room.controllers.get(seat);
  const connected=rooms.connect(room,seat,socket.id).then(()=>{if(previous){const old=io.sockets.sockets.get(previous);old?.emit('takenOver');old?.disconnect(true);}socket.emit('state',project(room.data.state,rooms.deps,seat,config.persistence));}).catch(()=>socket.disconnect(true));
  let count=0;let until=Date.now()+1000;
  socket.on('command',async(input,ack)=>{await connected;if(typeof ack!=='function')return;if(Date.now()>until){until=Date.now()+1000;count=0;}if(++count>80){ack({ok:false,code:'RATE_LIMIT',message:'Too many actions. Slow down.',seq:room.data.state.seq});return;}ack(await rooms.command(room,seat,socket.id,input));});
  socket.on('sync',async()=>{await connected;socket.emit('state',project(room.data.state,rooms.deps,seat,config.persistence));});
  socket.on('pingClock',(_input,ack)=>{if(typeof ack==='function')ack({now:rooms.deps.now()});});
  socket.on('actionStatus',(id,ack)=>{if(typeof id==='string'&&typeof ack==='function')ack(Object.hasOwn(room.data.state.acks[seat]??{},id)?room.data.state.acks[seat][id]:null);});
  socket.on('disconnect',()=>{void connected.then(()=>rooms.disconnect(room,seat,socket.id)).catch(()=>{});});
 });
 app.use(express.static(resolve('dist/client'),{index:false,maxAge:'1h'}));
 app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/client/index.html')));
 app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{void err;void _next;res.status(500).json({message:'Request could not be completed.'});});
 let lastMaintenanceLog=0;const timer=setInterval(()=>{void rooms.timers().catch(()=>{if(Date.now()-lastMaintenanceLog>30000){console.error('Room maintenance could not be committed; affected rooms remain blocked.');lastMaintenanceLog=Date.now();}});},100);
 async function close(){clearInterval(timer);io.disconnectSockets(true);await new Promise<void>(r=>io.close(()=>r()));await Promise.all([...rooms.rooms.values()].map(r=>r.queue));rooms.store.close();}
 return {app,http,io,rooms,close};
}
