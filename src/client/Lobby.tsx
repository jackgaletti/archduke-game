import type { Command, View } from '../shared/protocol';
import { Invite } from './GameTable';
import './lobby.css';
type Action=Command extends infer C?C extends Command?Omit<C,'id'|'game'|'round'>:never:never;
export function Lobby({v,blocked,loaded,error,send}:{v:View;blocked:boolean;loaded:boolean;error:string;send:(a:Action)=>void}){
 const lobby=v.lobby!,me=lobby.players.find(p=>p.id===v.you)!;
 return <main className="room-lobby" data-phase="LOBBY">
  <header className="game-header"><span/><h1 className="lobby-wordmark">ARCHDUKE</h1><Invite token={v.invite}/></header>
  <div className="lobby-center">
   {lobby.inProgress&&<p className="lobby-progress" role="status">Game in progress</p>}
   <ul className="lobby-players" aria-label="Players">{lobby.players.map(p=><li key={p.id} data-player={p.id} data-ready={p.ready}>
    <span className="lobby-name-anchor"><span className="lobby-name">{p.name}</span>{p.id===v.host&&<span className="host-badge">HOST</span>}</span><span className="sr-only">{p.connected?p.ready?'Ready':'Not ready':'Disconnected'}</span>
   </li>)}</ul>
   {!lobby.inProgress&&<div className="lobby-actions">
    <button className="primary ready-control" disabled={blocked||!loaded||me.ready||!me.connected} onClick={()=>send({type:'ready',ready:true})}>Ready</button>
    {v.host===v.you&&<button className="primary ready-control" disabled={blocked||!loaded||!lobby.canStart} onClick={()=>send({type:'start'})}>Start Game</button>}
   </div>}
   {(error||v.incompatible)&&<p className="lobby-error" role="alert">{error||v.incompatible}</p>}
  </div>
 </main>;
}
