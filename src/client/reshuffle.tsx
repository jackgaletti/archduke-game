import { useLayoutEffect, useRef } from 'react';
import type { Reshuffle } from '../shared/protocol';
import artwork from '../shared/artwork.json';

export const deckLayers=(count:number)=>Math.min(Math.max(0,count),10);

// This overlay owns only its ghosts. It never hides, animates, or remounts a table endpoint.
export function ReshuffleOverlay({event,now,paused,resumeAt=0}:{event?:Reshuffle;now:number;paused:boolean;resumeAt?:number}){
 const layer=useRef<HTMLDivElement>(null);
 const flight=useRef<{id:string;bounds:string;animations:Animation[];nodes:HTMLElement[]}|undefined>(undefined);
 // The existing room policy rebases deadlines through its restart delay.
 // Hold the saved progress during that delay instead of replaying earlier frames.
 const sequenceNow=paused?now:Math.max(now,resumeAt),stopped=paused||now<resumeAt;
 useLayoutEffect(()=>{
  const clear=()=>{flight.current?.animations.forEach(a=>a.cancel());flight.current?.nodes.forEach(n=>n.remove());flight.current=undefined;};
  if(!event){clear();return;}
  if(sequenceNow<event.moveAt){flight.current?.nodes.forEach(n=>n.style.visibility='hidden');return;}
  const table=document.querySelector<HTMLElement>('.game');
  if(!table||Number(table.dataset.layoutWidth)!==table.clientWidth||Number(table.dataset.layoutHeight)!==table.clientHeight){flight.current?.nodes.forEach(n=>n.style.visibility='hidden');return;}
  const source=document.querySelector('[data-endpoint="discard"]')?.getBoundingClientRect();
  const destination=document.querySelector('[data-endpoint="draw"]')?.getBoundingClientRect();
  if(!source?.width||!destination?.width||!layer.current)return;
  const bounds=[source.x,source.y,source.width,source.height,destination.x,destination.y,destination.width,destination.height].join(',');
  if(flight.current?.id!==event.id||flight.current.bounds!==bounds){
   clear();
   // A hole in this overlay lets the real protected top stay fully visible. Ghosts
   // emerge from beneath it without touching its DOM, styles or animation lifecycle.
   layer.current.style.clipPath=`path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z M${source.left-2} ${source.top-2}H${source.right+2}V${source.bottom+2}H${source.left-2}Z")`;
   const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   const animations:Animation[]=[],nodes:HTMLElement[]=[];
   // Card backs only: no private card values or identities enter the visual layer.
   for(let i=deckLayers(event.count)-1;i>=0;i--){
    const node=document.createElement('img');node.src=artwork.back.url;node.alt='';node.draggable=false;node.className='reshuffle-ghost';
    node.style.cssText=`position:fixed;visibility:hidden;left:${source.x}px;top:${source.y}px;width:${destination.width}px;height:${destination.height}px;border-radius:6px;pointer-events:none;`;
    layer.current.append(node);nodes.push(node);
    const x=i*1.3,y=i*1.1,dx=destination.x-source.x,dy=destination.y-source.y;
    const frames:Keyframe[]=reduced?[
     {opacity:0,transform:`translate(${dx+x}px,${dy+y}px)`,offset:0},
     {opacity:0,transform:`translate(${dx+x}px,${dy+y}px)`,offset:.8},
     {opacity:1,transform:`translate(${dx+x}px,${dy+y}px)`,offset:1}
    ]:[
     {opacity:0,transform:`translate(0px,0px)`,offset:0},
     {opacity:1,transform:`translate(${dx*.25+x}px,${dy*.25-12}px)`,offset:.16},
     {opacity:1,transform:`translate(${dx+x}px,${dy+y-5}px)`,offset:.83},
     {opacity:1,transform:`translate(${dx+x}px,${dy+y}px) rotateY(0deg)`,offset:1}
    ];
    const stagger=(deckLayers(event.count)-1-i)*35;
    const animation=node.animate(frames,{duration:1250,delay:stagger,easing:'cubic-bezier(.25,.1,.25,1)',fill:'both'});
    animation.pause();animations.push(animation);
   }
   flight.current={id:event.id,bounds,animations,nodes};
  }
  // Drive the independent sequence from the same server clock, including reconnect/pause.
  // Holding the settled ghosts until the completion snapshot avoids an empty-frame flash.
  flight.current?.animations.forEach(a=>{
  const elapsed=Math.max(0,sequenceNow-event.moveAt);
  if(stopped||a.playState==='paused'||Math.abs(Number(a.currentTime??0)-elapsed)>100)a.currentTime=elapsed;
  if(stopped)a.pause();else if(a.playState==='paused')a.play();
 });
  flight.current?.nodes.forEach(n=>{n.style.visibility='visible';n.dataset.paused=String(stopped);});
 },[event,sequenceNow,stopped]);
 useLayoutEffect(()=>()=>{flight.current?.animations.forEach(a=>a.cancel());flight.current?.nodes.forEach(n=>n.remove());},[]);
 return <div ref={layer} className="reshuffle-overlay" aria-hidden="true" style={{position:'fixed',inset:0,pointerEvents:'none',zIndex:39}}/>;
}
