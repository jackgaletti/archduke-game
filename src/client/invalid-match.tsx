import { useLayoutEffect, useRef } from 'react';
import type { InvalidMatch } from '../shared/protocol';
import artwork from '../shared/artwork.json';

type Bounds={x:number;y:number;width:number;height:number};
type Sequence={event:InvalidMatch;face?:HTMLElement;faceAnimations:Animation[];last?:Bounds;fallback?:HTMLElement;flight?:HTMLElement;move?:Animation;moveStart?:number;destination?:Bounds};
const easing='cubic-bezier(.25,.1,.25,1)';
const endpoint=(cardId:string)=>document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`);
function faceNode(value?:number){
 const face=document.createElement('span');face.className='card-face';
 for(const side of ['back','front']){const el=document.createElement('span');el.className=`card-${side}`;const img=document.createElement('img');img.src=artwork[String(side==='front'&&value!==undefined?value:'back') as keyof typeof artwork].url;img.alt='';img.draggable=false;el.append(img);face.append(el);}
 return face;
}
function proxy(layer:HTMLElement,bounds:Bounds,className:string,value?:number){
 const node=document.createElement('span');node.className=`flying-card ${className}`;
 node.style.cssText=`visibility:hidden;left:${bounds.x}px;top:${bounds.y}px;width:${bounds.width}px;height:${bounds.height}px;pointer-events:none;`;
 node.append(faceNode(value));layer.append(node);return node;
}
/** Only invalid attempts live here. It does not touch the shared movement renderer. */
export function InvalidMatchMotion({events,now,scope,destination}:{events:InvalidMatch[];now:number;scope:string;destination:(event:InvalidMatch)=>Bounds|undefined}){
 const layer=useRef<HTMLDivElement>(null),sequences=useRef(new Map<string,Sequence>()),currentScope=useRef(scope);
 const clear=(s:Sequence)=>{if(s.face)delete s.face.dataset.invalidPhase;s.faceAnimations.forEach(a=>a.cancel());s.fallback?.remove();s.move?.cancel();s.flight?.remove();};
 useLayoutEffect(()=>{
  if(currentScope.current!==scope){sequences.current.forEach(clear);sequences.current.clear();currentScope.current=scope;}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function animateFace(s:Sequence,face:HTMLElement){
   const e=s.event,duration=e.flightAt-e.start;
   const frames:Keyframe[]=reduced?[
    {transform:'rotateY(180deg)',offset:0,easing:'steps(1,end)'},{transform:'rotateY(180deg)',offset:(e.shakeEnd-e.start)/duration,easing:'steps(1,start)'},{transform:'rotateY(0deg)',offset:1}
   ]:[
    {transform:'rotateY(0deg)',offset:0,easing},{transform:'rotateY(180deg)',offset:(e.faceUpAt-e.start)/duration},{transform:'rotateY(180deg)',offset:(e.shakeEnd-e.start)/duration,easing},{transform:'rotateY(0deg)',offset:1}
   ];
   const flip=face.animate(frames,{duration,fill:'both'});
   const shake=face.animate(reduced?[{opacity:1},{opacity:.65},{opacity:1}]:[0,-6,6,-4,4,0].map(x=>({translate:`${x}px 0px`})),{duration:e.shakeEnd-e.faceUpAt,delay:e.faceUpAt-e.start,fill:'none',easing:'linear'});
   for(const animation of [flip,shake]){animation.currentTime=Math.max(0,now-e.start);}
   s.face=face;s.faceAnimations=[flip,shake];
  }
  for(const e of events){
   if(now<e.start)continue;
   let s=sequences.current.get(e.id);
   if(!s&&now<e.end){s={event:e,faceAnimations:[]};sequences.current.set(e.id,s);}
   if(!s)continue;
   const attempted=endpoint(e.attempted.cardId),face=attempted?.querySelector<HTMLElement>(':scope > .card-face');
   if(now<e.flightAt){
    const anchor=attempted??document.querySelector<HTMLElement>(`[data-endpoint="${e.player}:${e.attempted.slot}"]`);if(anchor)s.last=anchor.getBoundingClientRect();
    if((face!==s.face||!s.face)&&!s.fallback){
     if(s.face)delete s.face.dataset.invalidPhase;s.faceAnimations.forEach(a=>a.cancel());
     // A subsequent legitimate swap/replacement may move this instance. Keep the
     // accepted presentation alive without revealing the replacement's value.
     if(!face&&s.last&&layer.current){s.fallback=proxy(layer.current,s.last,'invalid-attempt-ghost',e.attempted.value);animateFace(s,s.fallback.firstElementChild as HTMLElement);s.fallback.style.visibility='visible';}
     else if(face)animateFace(s,face);
    }
    if(s.face){s.face.dataset.invalidPhase=now<e.faceUpAt?'flip-up':now<e.shakeEnd?'shake':'flip-down';for(const a of s.faceAnimations){if(Math.abs(Number(a.currentTime??0)-(now-e.start))>80)a.currentTime=now-e.start;}}
   }else{
    if(s.face){delete s.face.dataset.invalidPhase;s.faceAnimations.forEach(a=>a.cancel());s.faceAnimations=[];s.face=undefined;}s.fallback?.remove();s.fallback=undefined;
    if(now<e.end&&!s.flight&&layer.current){
     const source=document.querySelector<HTMLElement>('[data-endpoint="draw"]')?.getBoundingClientRect(),target=destination(e);
     if(source?.width&&target){
      s.destination=target;s.flight=proxy(layer.current,source,'invalid-penalty-flight');s.flight.dataset.motion='penalty';s.flight.dataset.invalidEvent=e.id;
      const transform=`translate(${target.x-source.x}px,${target.y-source.y}px) scale(${target.width/source.width},${target.height/source.height})`;
      const frames:Keyframe[]=reduced?[{transform,opacity:0},{transform,opacity:1}]:[{transform:'translate(0px,0px) scale(1,1)'},{transform}];
      s.moveStart=e.flightAt;s.move=s.flight.animate(frames,{duration:e.end-e.flightAt,easing,fill:'both'});s.move.currentTime=now-e.flightAt;s.flight.style.visibility='visible';
     }
    }
    if(s.move&&now<e.end){
     const elapsed=now-(s.moveStart??e.flightAt);if(Math.abs(Number(s.move.currentTime??0)-elapsed)>80)s.move.currentTime=elapsed;
     // Responsive geometry can change while this independent flight is running.
     const target=destination(e);
     if(target&&s.destination&&Object.keys(target).some(k=>target[k as keyof Bounds]!==s!.destination![k as keyof Bounds])){
      const from=s.flight!.getBoundingClientRect();s.move.cancel();Object.assign(s.flight!.style,{left:`${from.x}px`,top:`${from.y}px`,width:`${from.width}px`,height:`${from.height}px`});
      s.move=s.flight!.animate([{transform:'translate(0px,0px) scale(1,1)'},{transform:`translate(${target.x-from.x}px,${target.y-from.y}px) scale(${target.width/from.width},${target.height/from.height})`}],{duration:Math.max(1,e.end-now),easing,fill:'both'});s.moveStart=now;s.destination=target;
     }
    }
   }
  }
  // React has already materialized the authoritative slot in this commit. Only
  // now remove its transient proxy, avoiding a blank or doubled landing frame.
  for(const [id,s] of sequences.current)if(now>=s.event.end){clear(s);sequences.current.delete(id);}
 },[events,now,scope,destination]);
 useLayoutEffect(()=>{const active=sequences.current;return()=>{active.forEach(clear);active.clear();};},[]);
 return <div ref={layer} className="animation-overlay invalid-match-overlay" aria-hidden="true"/>;
}
