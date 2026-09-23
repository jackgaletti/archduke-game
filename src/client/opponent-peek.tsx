import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import { createPortal } from 'react-dom';
import artwork from '../shared/artwork.json';
import { peekBounds, type OpponentPeek, type PeekBounds } from './opponent-peek-layout';
import './opponent-peek.css';
export type PeekHandle={close:()=>void};
type Lift={peek:OpponentPeek;source:HTMLElement;node:HTMLButtonElement;face:HTMLElement;move?:Animation;flip?:Animation;stage:'opening'|'open'|'closing';frame?:number;moveStart?:number;start:number;end:number;to:PeekBounds;requested:boolean;sent:boolean};
const easing='cubic-bezier(.25,.1,.25,1)';
const different=(a:PeekBounds,b:PeekBounds)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+Math.abs(a.width-b.width)+Math.abs(a.height-b.height)>.5;
function place(node:HTMLElement,r:PeekBounds){Object.assign(node.style,{left:`${r.x}px`,top:`${r.y}px`,width:`${r.width}px`,height:`${r.height}px`,perspective:`${r.width*8}px`});}
function transform(a:PeekBounds,b:PeekBounds){return `translate(${b.x-a.x}px,${b.y-a.y}px) scale(${b.width/a.width},${b.height/a.height})`;}
function animate(l:Lift,to:PeekBounds,start:number,end:number,closing:boolean,reduced:boolean){
 const from=l.node.getBoundingClientRect();l.move?.cancel();l.flip?.cancel();place(l.node,from);
 l.start=start;l.moveStart=start;l.end=end;l.to=to;l.node.style.pointerEvents='none';l.node.tabIndex=-1;l.node.dataset.phase=closing?'closing':'opening';
 const duration=Math.max(1,end-start);
 l.move=l.node.animate([{transform:'translate(0,0) scale(1,1)'},{transform:transform(from,to)}],{duration,easing,fill:'both'});
 l.flip=l.face.animate([{transform:`rotateY(${closing?180:0}deg)`},{transform:`rotateY(${closing?0:180}deg)`}],{duration:reduced?Math.min(80,duration):duration,easing,fill:'both'});
}
function sync(animation:Animation|undefined,elapsed:number,paused:boolean){
 if(!animation)return;if(paused||Math.abs(Number(animation.currentTime??0)-elapsed)>80)animation.currentTime=Math.max(0,elapsed);if(paused)animation.pause();else if(animation.playState==='paused')animation.play();
}
function release(l:Lift){if(l.frame)cancelAnimationFrame(l.frame);l.move?.cancel();l.flip?.cancel();l.node.remove();delete l.source.dataset.peekLifted;}
/** Isolated private overlay. Canonical hand keys, coordinates and CardFace stay intact. */
export function OpponentPeekOverlay({peek,now,scope,blocked,paused,ref,onClose}:{peek?:OpponentPeek;now:number;scope:string;blocked:boolean;paused:boolean;ref:Ref<PeekHandle>;onClose:(id:string)=>void}){
 const layer=useRef<HTMLDivElement>(null),active=useRef<Lift>(undefined),currentScope=useRef(scope),completed=useRef(new Set<string>());
 const close=()=>{const l=active.current;if(!l||l.stage==='closing'||l.sent)return;l.requested=true;};
 useImperativeHandle(ref,()=>({close}));
 useLayoutEffect(()=>{
  if(currentScope.current!==scope){if(active.current)release(active.current);active.current=undefined;completed.current.clear();currentScope.current=scope;}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let l=active.current;
  // Superseded effects and changed physical instances cannot leave a stale face behind.
  if(l&&(peek&&peek.id!==l.peek.id||!l.source.isConnected||l.source.dataset.cardId!==l.peek.cardId)){
   release(l);completed.current.add(l.peek.id);active.current=l=undefined;
  }
  function bounds(source:HTMLElement){
   const hand=source.closest('.card-grid')?.getBoundingClientRect();if(!hand)return;
   const header=document.querySelector('.game-header')?.getBoundingClientRect().bottom??0;
   const bottom=document.querySelector('.personal-area')?.getBoundingClientRect().top??innerHeight;
   return peekBounds(source.getBoundingClientRect(),hand,{width:innerWidth,height:innerHeight},header,Math.min(bottom,innerHeight));
  }
  if(!l&&peek&&now<peek.until&&!completed.current.has(peek.id)&&layer.current){
   const source=document.querySelector<HTMLElement>(`[data-card-id="${peek.cardId}"][data-endpoint="${peek.target.player}:${peek.target.slot}"]`);
   // Focusing a source inside the overflow-hidden table can pan it horizontally.
   // Restore its normal origin before measuring the private lift.
   const table=source?.closest<HTMLElement>('.game');if(table)table.scrollLeft=0;
   const to=source&&bounds(source);
   if(source&&to){
    const rect=source.getBoundingClientRect(),node=document.createElement('button');node.type='button';node.className='card opponent-peek-card';node.dataset.peekId=`${peek.id}:${peek.cardId}`;node.setAttribute('aria-label',`${peek.name}, card ${peek.value}. Close peek`);node.style.visibility='hidden';place(node,rect);
    const face=document.createElement('span');face.className='card-face';face.setAttribute('aria-hidden','true');
    for(const side of ['back','front']){const el=document.createElement('span');el.className=`card-${side}`;const img=document.createElement('img');img.src=artwork[String(side==='back'?'back':peek.value) as keyof typeof artwork].url;img.alt=side==='back'?'Face-down card':`Card ${peek.value}`;img.draggable=false;el.append(img);face.append(el);}
    node.append(face);layer.current.append(node);
    l={peek,source,node,face,stage:'opening',start:peek.start,end:peek.readyAt,to,requested:false,sent:false};active.current=l;node.onclick=close;
    // No uninitialized frame: layout and both animation endpoints exist before visibility.
    const duration=reduced?80:Math.min(500,peek.motion);animate(l,to,peek.start,peek.start+duration,false,reduced);
    l.frame=requestAnimationFrame(()=>{source.dataset.peekLifted='true';node.style.visibility='visible';});
   }
  }
  if(!l)return;
  const live=peek?.id===l.peek.id?peek:undefined;
  if(live){
   // Pause/reconnect adjusts the authoritative deadline, without a new local timer.
   const shift=live.start-l.peek.start;
   if(shift&&l.stage==='opening'){l.start+=shift;l.end+=shift;l.moveStart=(l.moveStart??l.start)+shift;}
   l.peek=live;
  }
  if(l.stage==='opening'){
   const to=bounds(l.source);if(to&&different(l.to,to)){const from=l.node.getBoundingClientRect();l.move?.cancel();place(l.node,from);l.move=l.node.animate([{transform:'translate(0,0) scale(1,1)'},{transform:transform(from,to)}],{duration:Math.max(1,l.end-now),easing,fill:'both'});l.moveStart=now;l.to=to;}
   sync(l.move,now-(l.moveStart??l.start),paused);sync(l.flip,now-l.start,paused);
   if(now>=l.end){l.move?.cancel();l.flip?.cancel();place(l.node,l.to);l.face.style.transform='rotateY(180deg)';l.stage='open';l.node.dataset.phase='open';}
  }
  if(l.stage==='open'){
   const to=bounds(l.source);if(to&&different(l.to,to)){place(l.node,to);l.to=to;}
   l.node.style.pointerEvents=blocked?'none':'auto';l.node.tabIndex=blocked?-1:0;
   if(l.requested&&!l.sent&&live&&now<live.until&&!blocked){l.sent=true;onClose(l.peek.id);}
   if(!live||now>=l.peek.until){
    const closeAt=Math.max(l.end,Math.min(now,l.peek.until));l.stage='closing';animate(l,l.source.getBoundingClientRect(),closeAt,closeAt+(reduced?80:Math.min(500,l.peek.motion)),true,reduced);
   }
  }
  if(l.stage==='closing'){
   const to=l.source.getBoundingClientRect();
   if(different(l.to,to)){const remaining=Math.max(1,l.end-now);const from=l.node.getBoundingClientRect();l.move?.cancel();place(l.node,from);l.move=l.node.animate([{transform:'translate(0,0) scale(1,1)'},{transform:transform(from,to)}],{duration:remaining,easing,fill:'both'});l.move.currentTime=0;l.to=to;l.start=now;}
   sync(l.move,now-l.start,paused);sync(l.flip,Number(l.flip?.effect!.getTiming().duration??0)-(l.end-now),paused);
   if(now>=l.end){release(l);completed.current.add(l.peek.id);active.current=undefined;}
  }
 },[peek,now,scope,blocked,paused,onClose]);
 useLayoutEffect(()=>{
  const openingClick=(event:PointerEvent)=>{const l=active.current;if(l?.stage!=='opening')return;const r=l.node.getBoundingClientRect();if(event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom)l.requested=true;};
  addEventListener('pointerdown',openingClick);return()=>{removeEventListener('pointerdown',openingClick);if(active.current)release(active.current);active.current=undefined;};
 },[]);
 return createPortal(<div ref={layer} className="opponent-peek-layer"/>,document.body);
}
