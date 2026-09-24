import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { Command, Target, View, InvalidMatch } from '../shared/protocol';
import { relativePlayers, playLayout, handGeometry, rowStep } from './table-layout';
import { CardFace, CardMotion } from './card-motion';
import { InvalidMatchQueue, visibleHand, invalidFace } from './invalid-match-state';
import { InvalidMatchMotion } from './invalid-match';
import { OpponentPeekOverlay, type PeekHandle } from './opponent-peek';
import { opponentPeek } from './opponent-peek-layout';
import { GiveTarget } from './give-target';
import { InitialFace } from './initial-face';
import artwork from '../shared/artwork.json';
import { CallBurst } from './call-burst';
import { deckLayers, ReshuffleOverlay } from './reshuffle';
type Action=Command extends infer C?C extends Command?Omit<C,'id'|'game'|'round'>:never:never;
type Props={v:View;now:number;connected:boolean;taken:boolean;pending:boolean;loaded:boolean;error:string;clearError:()=>void;send:(a:Action)=>void};

export function Invite({token,onExit,exitDisabled}:{token:string;onExit?:()=>void;exitDisabled?:boolean}){
 const [copied,setCopied]=useState(false);const [fallback,setFallback]=useState(false);const timer=useRef<ReturnType<typeof setTimeout>>(undefined);
 useEffect(()=>()=>clearTimeout(timer.current),[]);
 const link=`${location.origin}/invite/${token}`;
 async function copy(){clearTimeout(timer.current);try{await navigator.clipboard.writeText(link);setFallback(false);setCopied(true);timer.current=setTimeout(()=>setCopied(false),1800);}catch{setCopied(false);setFallback(true);}}
 return <div className={`invite-control ${onExit?'with-exit':''}`}>{onExit&&<><button disabled={exitDisabled} onClick={onExit}>Exit</button><span aria-hidden="true">/</span></>}<button onClick={()=>void copy()}>{copied?'Copied':'Invite'}</button><span className="sr-only" role="status">{copied?'Invite link copied':''}</span>{fallback&&<div className="invite-fallback"><p role="alert">Couldn’t copy. Select the link:</p><input aria-label="Invite link" readOnly value={link} onFocus={e=>e.currentTarget.select()}/><button aria-label="Close invite link" onClick={()=>setFallback(false)}>×</button></div>}</div>;
}
export function GameTable({v,now,connected,taken,pending,loaded,error,clearError,send}:Props){
 const surface=useRef<HTMLDivElement>(null);const [resizing,setResizing]=useState(false);const [portrait,setPortrait]=useState(()=>innerHeight>innerWidth);const [giveHover,setGiveHover]=useState<string>();const [size,setSize]=useState({width:innerWidth-64,height:innerHeight-150});const dialog=useRef<HTMLDialogElement>(null);const [inspection,setInspection]=useState<{player:string;slot:number}>();const inspector=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const update=()=>{setPortrait(innerHeight>innerWidth);const bounds=surface.current?.getBoundingClientRect();if(bounds)setSize({width:bounds.width,height:bounds.height});};addEventListener('resize',update);return()=>removeEventListener('resize',update);},[]);
 useEffect(()=>{setGiveHover(undefined);setInspection(undefined);},[v.phase,v.effects[0]?.id,v.game,v.round]);
 useLayoutEffect(()=>{const element=surface.current;if(!element)return;let timer:ReturnType<typeof setTimeout>;const observer=new ResizeObserver(([entry])=>{setResizing(true);setSize({width:entry.contentRect.width,height:entry.contentRect.height});clearTimeout(timer);timer=setTimeout(()=>setResizing(false),400);});observer.observe(element);return()=>{observer.disconnect();clearTimeout(timer);};},[]);
 useEffect(()=>{if(inspection)inspector.current?.showModal();else inspector.current?.close();},[inspection]);
 const me=v.players.find(p=>p.id===v.you)!;const resultPhase=['ROUND_RESULTS','GAME_RESULTS'].includes(v.phase);
 const results=(me.reviewingResults??resultPhase)&&v.history.length>0;
 const reviewedResults=resultPhase&&me.reviewingResults===false&&v.history.length>0;
 const showLeaderboard=results&&!!me.viewingLeaderboard,revealResults=results&&!showLeaderboard,lobby=(['LOBBY','NEXT_ROUND_COUNTDOWN'].includes(v.phase)||reviewedResults)&&!results;
 useEffect(()=>{if(showLeaderboard)dialog.current?.showModal();else dialog.current?.close();},[showLeaderboard]);
 const peekOverlay=useRef<PeekHandle>(null);const liftedPeek=opponentPeek(v);
 const host=v.host===v.you;const effect=v.effects[0];const ownEffect=effect?.actor===v.you;const selected=ownEffect&&effect.kind===11?effect.targets??[]:[];const held=v.held?.owner===v.you;
 const paused=!!v.paused||!connected||taken||!!v.incompatible;const blocked=paused||pending||!!v.reshuffling||now<v.restartAt;const settled=now>=v.visualUntil;
 useEffect(()=>{if(blocked||!ownEffect||effect?.kind!==1)setGiveHover(undefined);},[blocked,ownEffect,effect?.kind]);
 const canDraw=!blocked&&!v.effects.length&&now>=v.restartAt&&v.phase==='INTER_TURN'&&v.open&&v.next===v.you;
 const pendingDiscardMovement=v.movements.filter(m=>m.to==='discard'&&m.end+(m.kind==='discard'?120:0)>now).sort((a,b)=>a.start-b.start)[0];
 const displayedDiscard=lobby?undefined:v.discard;const displayedDiscardTop=pendingDiscardMovement?pendingDiscardMovement.under:displayedDiscard;const displayedDrawCount=v.drawCount;

 const invalidQueue=useRef(new InvalidMatchQueue());const invalidScope=`${v.room}:${v.game}`;invalidQueue.current.accept(invalidScope,v.invalidMatches??[],now);const invalidEvents=invalidQueue.current.events();
 const activePlayer=v.held?.owner??v.next;const players=relativePlayers(v.players.map(p=>visibleHand(p,invalidEvents,now)),v.you);const layout=playLayout(size.width,size.height,players.length-1);
 // Keep the name's center over its hand even where the existing table extends past a viewport edge.
 useLayoutEffect(()=>{surface.current?.querySelectorAll<HTMLElement>('.seat-heading').forEach(heading=>{const r=heading.getBoundingClientRect(),center=r.x+r.width/2;heading.style.setProperty('--name-width',`${Math.max(0,Math.min(r.width,2*(center-3),2*(innerWidth-3-center)))}px`);});},[size.width,size.height,players.length,me.columns,lobby]);
 const title=(id?:string)=>v.players.find(p=>p.id===id)?.name??'';
 const effectLabel=(kind:1|11|12)=>kind===1?'Give':kind===11?'Swap':'Peek';
 function cardClick(t:Target){
  if(blocked||results||lobby)return;
  if(v.phase==='INITIAL_PEEK')return;
  if(held){send({type:'resolveDraw',turn:v.turn,target:t});return;}
  if(ownEffect){
   if(effect.viewUntil){if(liftedPeek){peekOverlay.current?.close();return;}send({type:'done',effect:effect.id});return;}
   if(effect.kind===12){send({type:'effect',effect:effect.id,targets:[t]});return;}
   if(effect.kind===11){const first=selected[0];if(!first){send({type:'effect',effect:effect.id,targets:[t]});return;}if(first.player===t.player&&first.slot===t.slot){send({type:'effect',effect:effect.id,targets:[]});return;}if(first.player!==t.player){send({type:'effect',effect:effect.id,targets:[first,t]});return;}send({type:'effect',effect:effect.id,targets:[t]});return;}
   if(t.player===v.you){send({type:'match',window:v.window,slots:[t]});return;}
  }
  send({type:'match',window:v.window,slots:[t]});
 }
 function allowed(p:View['players'][number],slot:View['players'][number]['slots'][number]){
  if(blocked||results||lobby||!slot.occupied)return false;
  if(v.phase==='INITIAL_PEEK')return false;
  if(held)return p.id===v.you&&settled;
  if(ownEffect){if(effect.viewUntil)return effect.target?.player===p.id&&effect.target.slot===slot.index&&effect.target.rev===slot.rev;if(p.id===v.you)return [11,12].includes(effect.kind)?settled:v.open;if(effect.kind===1)return false;return settled&&p.id!==v.caller;}
  return p.id===v.you&&v.open;
 }
 const last=v.history.at(-1);const pointsFor=(id:string)=>v.history.reduce((n,round)=>n+(round.find(x=>x.player===id)?.place??0),0);
 const standing=last?.map(r=>({...r,points:pointsFor(r.player)})).sort((a,b)=>v.round===4?a.points-b.points||a.place-b.place:a.place-b.place).map((r,i,rows)=>({...r,overallPlace:rows.findIndex(row=>row.points===r.points)+1}));
 const finalCount=v.phase==='FINAL_MATCH_WINDOW'&&v.finalEndsAt!==undefined?Math.min(3,Math.max(1,Math.ceil((v.finalEndsAt-(v.paused?.since??v.reshuffling?.start??now))/1000))):undefined;
 const roundCount=v.roundStartsAt!==undefined?Math.min(3,Math.max(1,Math.ceil((v.roundStartsAt-(v.paused?.since??Math.max(now,v.restartAt)))/1000))):undefined;
 const displayedRound=lobby?(v.round===4?1:Math.max(1,v.round+1)):Math.max(1,v.round);
 function invalidDestination(event:InvalidMatch){
  const owner=v.players.find(p=>p.slots.some(s=>s.cardId===event.penalty.cardId));if(!owner)return;const future=visibleHand(owner,invalidEvents,event.end);const slot=future.slots.find(s=>s.cardId===event.penalty.cardId);if(!slot)return;
  const own=owner.id===v.you,card=own?layout.card:layout.opponentCard,gap=own?layout.gap:5;const geometry=handGeometry(card,gap,future.columns*2,own?layout.expansion:1);const step=rowStep(card,gap,geometry.width,future.slots,slot.row);
  const grid=surface.current?.querySelector<HTMLElement>(`[data-seat="${owner.id}"] .hand .card-grid`)?.getBoundingClientRect();if(!grid)return;
  return {x:grid.x+(own?0:(grid.width-geometry.width)/2)+slot.column*step,y:grid.y+slot.row*(card*1.4+gap),width:card,height:card*1.4};
 }
 const inspectionPlayer=players.find(p=>p.id===inspection?.player);const inspectionSlot=inspectionPlayer?.slots.find(s=>s.index===inspection?.slot);
 function renderSeat(p:View['players'][number],index:number){
  const own=p.id===v.you;const giving=ownEffect&&effect.kind===1&&settled&&!blocked&&!lobby&&!results&&p.connected&&p.id!==v.you&&p.id!==v.caller;
  const card=own?layout.card:layout.opponentCard,gap=own?layout.gap:5;const geometry=handGeometry(card,gap,p.columns*2,own?layout.expansion:1);geometry.columns=p.columns;geometry.step=(geometry.width-card)/(Math.max(2,p.columns)-1);
  const ownPending=v.held?.owner===p.id;const isTurn=p.id===activePlayer&&!lobby&&!results&&v.phase!=='INITIAL_PEEK';
  const pendingCard=<button className={`card pending-card ${ownPending?'occupied':''}`} data-endpoint={`held:${p.id}`} data-held-id={ownPending?v.held?.id:undefined} title={ownPending&&own&&v.held?.source==='draw'?'Discard drawn card':undefined} aria-label={ownPending?own&&v.held?.source==='draw'?'Discard drawn card':`${p.name} pending card${own?' — replace an occupied slot':''}`:'Pending card area'} disabled={!ownPending||!own||v.held?.source!=='draw'||blocked||!settled} onClick={()=>send({type:'resolveDraw',turn:v.turn})}>{ownPending&&<CardFace value={v.held?.value}/>}</button>;
  return <section key={p.id} className={`seat ${own?'own':'opponent'} ${isTurn?'turn-seat':''} ${effect?.target?.player===p.id?'effect-target':''}`} data-seat={p.id} data-relative={index} aria-current={isTurn?'true':undefined} style={{'--card-width':`${card}px`,'--card-gap':`${gap}px`,'--hand-width':`${geometry.width}px`,'--hand-height':`${geometry.height}px`} as CSSProperties}>
   <div className={`seat-heading ${!lobby&&p.id===v.caller?'caller-name':''}`}><div className="name-mark"><span className="turn-triangle" aria-hidden="true"/>{giving?<button className="give-target player-name" data-hovered={giveHover===p.id} tabIndex={-1} aria-hidden="true">{p.name}</button>:<span className="player-name" title={p.name}>{p.name}</span>}{lobby&&p.ready&&<span className="ready-check" aria-label="Ready">✓</span>}</div></div>
   {lobby?<div className="waiting-hand"><div className="card-grid">{[0,1,2,3].map(i=><div key={i} className="card waiting-slot" style={{'--slot-x':`${Math.floor(i/2)*(card+gap)}px`,'--slot-y':`${i%2*(card*1.4+gap)}px`} as CSSProperties}/>)}</div>{own&&!me.ready&&<button className="ready-button primary ready-control" disabled={!loaded||blocked} onClick={()=>send({type:'ready',ready:true})}>Ready</button>}</div>:<div className="hand"><div className="card-grid">{p.slots.map(slot=>{
    const isSelected=selected.some(t=>t.player===p.id&&t.slot===slot.index&&t.rev===slot.rev);const target=effect?.target?.player===p.id&&effect.target.slot===slot.index;const displayValue=slot.value??invalidFace(invalidEvents,slot.cardId,now)?.attempted.value;
    return <button key={slot.index} className={`card ${slot.occupied?'':'hole'} ${isSelected?'selected':''} ${target?'peek-target':''} ${displayValue!==undefined?'revealed':''}`} style={{'--slot-x':`${slot.column*rowStep(card,gap,geometry.width,p.slots,slot.row)}px`,'--slot-y':`${slot.row*(card*1.4+gap)}px`,'--layer':slot.column+1} as CSSProperties} data-endpoint={`${p.id}:${slot.index}`} data-card-id={slot.cardId} data-slot={slot.index} data-row={slot.row} data-column={slot.column} disabled={!allowed(p,slot)} onClick={()=>cardClick({player:p.id,slot:slot.index,rev:slot.rev})} aria-label={`${p.name} slot ${slot.index+1}${displayValue!==undefined?`, card ${displayValue}`:slot.occupied?', face down':', empty'}`} aria-pressed={isSelected}>{slot.occupied&&(own&&v.initialPeek&&[1,3].includes(slot.index)?<InitialFace value={displayValue} timing={v.initialPeek} now={v.paused?.since??now} paused={!!v.paused}/>:<CardFace value={liftedPeek?.cardId===slot.cardId&&liftedPeek!==undefined?undefined:displayValue}/>)}</button>;
   })}</div>{!own&&pendingCard}</div>}
   {giving&&<GiveTarget key={effect.id} name={p.name} onHover={active=>setGiveHover(active?p.id:undefined)} onSelect={()=>send({type:'effect',effect:effect.id,recipient:p.id})}/>}
   {own&&<div className="own-pending-zone">{pendingCard}</div>}
  </section>;
 }
 return <main ref={surface} className={`game ${resizing?'resizing':''} players-${v.players.length} ${layout.compact?'compact-table':''} ${v.caller&&!lobby?'final-phase':''}`} data-phase={v.phase} data-orientation={portrait?'portrait':'landscape'} data-layout-width={size.width} data-layout-height={size.height} style={{'--central-card':`${layout.central}px`,'--hand-reserve':`${layout.reserve}px`,'--primary-card':`${layout.card}px`,'--card-width':`${layout.card}px`,'--zone-gap':`${layout.zone}px`,'--outer-pad':`${layout.pad}px`,'--strip-height':`${layout.stripHeight}px`,'--header-height':`${layout.header}px`,'--opponent-width':`${Math.min(Math.max(150,layout.opponentCard*3+24),(size.width-2*layout.pad-24*(layout.stripColumns-1))/layout.stripColumns)}px`,'--strip-columns':layout.stripColumns} as CSSProperties}>
  <header className="game-header"><span className="round-label">Round {displayedRound} / 4</span>{revealResults?<button className="primary round-next" disabled={paused||pending} onClick={()=>send({type:'next'})}>Next</button>:<button className={`archduke-button ${!lobby&&v.caller?'called':!lobby&&v.canCallArchduke&&!blocked?'available':'unavailable'}`} aria-label={roundCount!==undefined?`Next round countdown ${roundCount}`:finalCount===undefined?undefined:`Final matching countdown ${finalCount}`} disabled={lobby||!!v.caller||!v.canCallArchduke||blocked} onClick={()=>send({type:'call',window:v.window,turn:v.turn})}>{roundCount??finalCount??'ARCHDUKE!'}</button>}<Invite token={v.invite} onExit={host?()=>send({type:'abort'}):undefined} exitDisabled={!connected||taken||pending}/></header>
  <div className="game-feedback">{error&&<div className="notice" role="alert">{error}<button aria-label="Dismiss message" onClick={clearError}>×</button></div>}{v.incompatible&&<p role="alert">{v.incompatible} <a href="/">New room</a></p>}{v.paused?.reason==='No cards available'&&<section className="supply-notice"><span>Card supply exhausted.</span>{host&&<button onClick={()=>send({type:'redeal'})}>Redeal round</button>}</section>}</div>
  {v.incompatible?<ul>{v.players.map(p=><li key={p.id}>{p.name}</li>)}</ul>:<>
  <div className="opponent-strip">{players.slice(1).map((p,i)=>renderSeat(p,i+1))}</div>
  <div className="personal-area"><div className="lower-composition">
   {renderSeat(players[0],0)}
   <section className="center-table">{<div className="piles"><div className="draw-stack">{Array.from({length:Math.max(0,deckLayers(displayedDrawCount)-1)},(_,i)=><img key={i} className="stack-layer" src={artwork.back.url} alt="" aria-hidden="true" draggable="false" style={{transform:`translate(${(i+1)*1.3}px,${(i+1)*1.1}px)`,zIndex:-i-1}}/>)}<button className="card pile" data-endpoint="draw" aria-label="Draw from draw pile" disabled={!canDraw||v.drawCount===0} onClick={()=>send({type:'draw',source:'draw',window:v.window,turn:v.turn})}>{displayedDrawCount>0&&<CardFace/>}</button></div><button className={`card pile ${displayedDiscard===undefined?'empty-pile':''}`} data-endpoint="discard" aria-label={v.held?.source==='draw'?'Discard drawn card':'Draw from discard pile'} disabled={held?blocked||v.held?.source!=='draw'||!settled:!canDraw||!v.discardCount} onClick={()=>v.held?.source==='draw'?send({type:'resolveDraw',turn:v.turn}):send({type:'draw',source:'discard',window:v.window,turn:v.turn})}>{displayedDiscardTop!==undefined&&<CardFace value={displayedDiscardTop}/>}</button><div className="effect-queue-slot">{!lobby&&!results&&v.effects.length>0&&<aside className="effect-queue" aria-label="Pending actions" aria-live="polite">{v.effects.map((queued,index)=><div className="effect-queue-entry" key={queued.id}>{(index===0||v.effects[index-1].kind!==queued.kind)&&<h3>{effectLabel(queued.kind)}</h3>}<div className="effect-queue-player"><span>{index+1}</span><strong>{title(queued.actor)}</strong></div></div>)}</aside>}</div></div>}
   </section>
  </div></div></>}
  <div className="sr-only" role="status" aria-live="polite">{!lobby&&!results?`${title(activePlayer)} ${v.held?'is taking a turn.':v.open?'is next. Matching remains open.':'is next.'}`:''}</div>
  {ownEffect&&!effect.viewUntil&&<button className="effect-skip" aria-label="Skip effect" disabled={blocked||!settled} onClick={()=>send({type:'effect',effect:effect.id,skip:true})}>Skip</button>}
  <OpponentPeekOverlay ref={peekOverlay} peek={liftedPeek} now={v.paused?.since??now} scope={`${v.room}:${v.game}:${v.round}:${lobby?'lobby':'game'}`} blocked={blocked} paused={!!v.paused} onClose={id=>send({type:'done',effect:id})}/>
  <InvalidMatchMotion events={invalidEvents} now={now} scope={invalidScope} destination={invalidDestination}/>
  <ReshuffleOverlay event={v.reshuffling} now={v.paused?.since??now} paused={!!v.paused} resumeAt={v.restartAt}/>
  <CallBurst movements={v.movements} now={now} connected={connected}/>
  {inspection&&inspectionPlayer&&inspectionSlot&&<dialog ref={inspector} className="card-inspector" onCancel={()=>setInspection(undefined)}><button className="close-dialog" aria-label="Close card inspection" onClick={()=>setInspection(undefined)}>×</button><h2>{inspectionPlayer.id===v.you?'Your cards':inspectionPlayer.name}</h2><div className="slot-choices">{inspectionPlayer.slots.filter(s=>s.occupied).map(s=><button key={s.index} aria-label={`Inspect ${inspectionPlayer.name} slot ${s.index+1}`} aria-pressed={s.index===inspection.slot} onClick={()=>setInspection({player:inspection.player,slot:s.index})}>{s.index+1}{s.occupied?'':' · empty'}</button>)}</div><button className={`card inspection-card ${inspectionSlot.occupied?'':'hole'}`} disabled={!allowed(inspectionPlayer,inspectionSlot)} aria-label={`${inspectionPlayer.name} slot ${inspectionSlot.index+1}${inspectionSlot.value!==undefined?`, card ${inspectionSlot.value}`:', face down'}`} onClick={()=>cardClick({player:inspectionPlayer.id,slot:inspectionSlot.index,rev:inspectionSlot.rev})}>{inspectionSlot.occupied&&<CardFace value={inspectionSlot.value}/>}</button><p>Slot {inspectionSlot.index+1}</p></dialog>}
  <CardMotion movements={v.movements} paused={!!v.paused} clockNow={v.paused?.since??now} scope={`${v.game}:${v.round}`} />
  {showLeaderboard&&<dialog ref={dialog} className="results" onCancel={e=>e.preventDefault()}><h2>{v.round===4?'Final Scores':`Round ${v.round}`}</h2><div className="podium" aria-label={v.round===4?'Final leaderboard':'Round leaderboard'}><div className="podium-top">{standing?.slice(0,3).map((r,i)=><div className={`podium-entry podium-${i+1}`} key={r.player}><span className="podium-place">{v.round===4?r.overallPlace:r.place}</span><strong>{title(r.player)}</strong><div className="podium-totals">{v.round!==4&&<span>Round Total: {r.sum}</span>}<span>Score Total: {r.points}</span></div></div>)}</div>{standing&&standing.length>3&&<div className="podium-rest">{standing.slice(3).map(r=><div className="podium-entry" key={r.player}><span className="podium-place">{v.round===4?r.overallPlace:r.place}</span><strong>{title(r.player)}</strong><div className="podium-totals">{v.round!==4&&<span>Round Total: {r.sum}</span>}<span>Score Total: {r.points}</span></div></div>)}</div>}</div><button className="primary next-results" disabled={paused||pending} onClick={()=>send({type:'next'})}>{v.round===4?'New Game':'Next'}</button></dialog>}
 </main>;
}
