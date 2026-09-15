import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, type Socket } from 'socket.io-client';
import type { Command, Reply, View } from '../shared/protocol';
import artwork from '../shared/artwork.json';
import './style.css';
import { GameTable } from './GameTable';
type Action = Command extends infer C ? C extends Command ? Omit<C,'id'|'game'|'round'> : never : never;
function Branding(){return <><h1 className="archduke-logo">Archduke</h1><picture className="landing-graphic"><source media="(prefers-reduced-motion: reduce)" srcSet="/graphics/graphic_1-still.png"/><img src="/graphics/graphic_1.gif" width="1200" height="1200" alt=""/></picture></>;}
function NameField({name,setName}:{name:string;setName:(value:string)=>void}){return <input className="name-field" aria-label="Name" placeholder="Name" autoComplete="nickname" maxLength={24} required value={name} onChange={e=>setName(e.target.value)}/>;}
function App(){
 const [room,setRoom]=useState(()=>location.pathname.startsWith('/room/')?location.pathname.split('/')[2]:'');
 const [v,setV]=useState<View>();const [error,setError]=useState('');const [connected,setConnected]=useState(false);const [taken,setTaken]=useState(false);
 const [name,setName]=useState('');const [invite,setInvite]=useState(()=>location.pathname.startsWith('/invite/')?location.pathname.split('/')[2]:'');
 const [directInvite]=useState(()=>location.pathname.startsWith('/invite/'));const [inviteRoom,setInviteRoom]=useState('');
 const [form,setForm]=useState<'create'|'join'>(invite?'join':'create');const [pending,setPending]=useState(0);const [loaded,setLoaded]=useState(false);
 const [now,setNow]=useState(Date.now());const actionLock=useRef(false);
 const offset=useRef(0);const socket=useRef<Socket>(undefined);const latest=useRef<View>(undefined);const outstanding=useRef(new Set<string>());
 useEffect(()=>{void Promise.all(Object.values(artwork).map(a=>new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=reject;image.src=a.url;}))).then(()=>setLoaded(true)).catch(()=>setError('Card artwork could not load. Refresh to try again.'));},[]);
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()+offset.current),50);return()=>clearInterval(t);},[]);
 useEffect(()=>{
  if(!room)return;setTaken(false);setError('');let cancelled=false;
  const s=io({autoConnect:false,transports:['websocket'],auth:{room},reconnection:true});socket.current=s;
  const clock=()=>{if(!s.connected)return;const start=Date.now();s.timeout(3000).emit('pingClock',{},(err:Error|null,data:{now:number})=>{if(!err){const end=Date.now();offset.current=data.now-(start+end)/2;}});};
  s.on('connect',()=>{setConnected(true);clock();for(const id of outstanding.current)s.emit('actionStatus',id,(r:Reply|null)=>{if(!r)setError('An earlier action was not committed. Check the table before trying again.');outstanding.current.delete(id);});setPending(0);actionLock.current=false;});
  s.on('state',(state:View)=>{if(latest.current&&state.seq<latest.current.seq)return;latest.current=state;setNow(Date.now()+offset.current);setV(state);});
  s.on('disconnect',()=>{s.sendBuffer.length=0;setConnected(false);});s.on('connect_error',(e:Error)=>{setError(e.message);if(/no longer|session|Invitation/.test(e.message))s.disconnect();});
  s.on('expired',()=>{setError('This game is no longer available');setV(undefined);s.disconnect();});
  s.on('takenOver',()=>{setTaken(true);setConnected(false);s.disconnect();});
  const refresh=()=>{if(document.visibilityState==='visible'&&s.connected){clock();s.emit('sync');}};
  document.addEventListener('visibilitychange',refresh);const timer=setInterval(clock,15000);
  void fetch(`/api/room/${room}`).then(async r=>{if(!r.ok)throw new Error((await r.json()).message);if(!cancelled)s.connect();}).catch(e=>setError(e.message));
  return()=>{cancelled=true;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);s.disconnect();latest.current=undefined;};
 },[room]);
 useEffect(()=>{
  if(!directInvite||room)return;let cancelled=false;
  void fetch(`/api/invite/${encodeURIComponent(invite)}`).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.message);if(cancelled)return;if(data.authenticated){history.replaceState({},'',`/room/${data.room}`);setRoom(data.room);}else setInviteRoom(data.room);}).catch(e=>{if(!cancelled)setError(e.message);});
  return()=>{cancelled=true;};
 },[directInvite,invite,room]);
 async function enter(e:React.FormEvent,mode:'create'|'join'){e.preventDefault();setError('');setPending(1);try{
  // Keep an unacknowledged admission's ID across retries and refresh.
  let capability=invite.trim();if(mode==='join'){if(/^https?:\/\//i.test(capability)){const path=new URL(capability).pathname;const match=path.match(/^\/invite\/([^/]+)\/?$/);if(!match)throw new Error('Enter an invite link or room code.');capability=match[1];}if(!capability)throw new Error('Enter an invite link or room code.');}
  const key=JSON.stringify([mode,name.trim(),mode==='join'?capability:'']);let id:string=crypto.randomUUID();
  try{const saved=JSON.parse(sessionStorage.getItem('archduke.pending-admission')??'null') as {key?:string;id?:string}|null;if(saved?.key===key&&typeof saved.id==='string')id=saved.id;sessionStorage.setItem('archduke.pending-admission',JSON.stringify({key,id}));}catch{/* Storage may be disabled; the current request still has an ID. */}
  const r=await fetch(`/api/${mode}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name,...(mode==='join'?{invite:capability}:{})})});const body=await r.json();if(!r.ok)throw new Error(body.message);try{sessionStorage.removeItem('archduke.pending-admission');}catch{/* Optional local retry cache. */}history.pushState({},'',`/room/${body.room}`);setRoom(body.room);}catch(e){setError((e as Error).message);}finally{setPending(0);}}
 function send(action:Action){
  if(actionLock.current)return;const s=socket.current;const state=v;if(!s?.connected||!state||taken)return;
  actionLock.current=true;const command={...action,id:crypto.randomUUID(),game:state.game,round:state.round};outstanding.current.add(command.id);setPending(n=>n+1);setError('');
  s.timeout(5000).emit('command',command,(err:Error|null,r:Reply)=>{actionLock.current=false;setPending(n=>Math.max(0,n-1));if(err){setError('Acknowledgement delayed. Reconnecting will check this action; it will not be replayed.');s.emit('actionStatus',command.id,(reply:Reply|null)=>{if(reply)outstanding.current.delete(command.id);});return;}outstanding.current.delete(command.id);if(!r.ok)setError(r.message);else if(r.code==='LATE')setError('Too late: one unknown penalty card for each attempted card.');s.emit('sync');});
 }
 if(!room&&directInvite)return <main className="home" data-room={inviteRoom||undefined}><div className="home-group"><Branding/>{inviteRoom?<form className="entry-form invite-entry" onSubmit={e=>void enter(e,'join')}><NameField name={name} setName={setName}/><button className="primary" disabled={!!pending}>Join game</button>{error&&<p role="alert" className="error">{error}</p>}</form>:<p role="status">{error||'Opening room…'}</p>}</div></main>;
 if(!room)return <main className="home"><div className="home-group"><Branding/><form className="entry-form" onSubmit={e=>void enter(e,(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')==='join'?'join':'create')}><NameField name={name} setName={setName}/>{form==='join'&&<label>Invitation link or room code<input autoFocus onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.form?.requestSubmit(e.currentTarget.form.querySelector<HTMLButtonElement>('button[value="join"]')!);}}} value={invite} onChange={e=>setInvite(e.target.value)} placeholder="Paste a link or enter a code"/></label>}<div className="entry-buttons"><button className="primary" type="submit" value="create" disabled={!!pending}>Start game</button><button type={form==='join'?'submit':'button'} value="join" disabled={!!pending} aria-expanded={form==='join'} onClick={form==='join'?undefined:()=>setForm('join')}>Join game</button></div>{error&&<p role="alert" className="error">{error}</p>}</form></div></main>;
 if(!v)return <main className="loading"><span className="sigil">A</span><h1>{error||'Finding your table…'}</h1><a href="/">Back to home</a></main>;
 return <GameTable v={v} now={now} connected={connected} taken={taken} pending={pending>0} loaded={loaded} error={error} clearError={()=>setError('')} send={send}/>;
}
createRoot(document.getElementById('root')!).render(<App/>);
