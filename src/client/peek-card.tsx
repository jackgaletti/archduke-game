import { useLayoutEffect, useRef } from 'react';
import type { Target } from '../shared/protocol';
import { CardFace } from './card-motion';

export function PeekCard({target,value,onClose}:{target:Target;value:number;onClose:()=>void}){
 const card=useRef<HTMLButtonElement>(null);const closing=useRef(false);const animations=useRef<Animation[]>([]);
 const source=()=>document.querySelector<HTMLElement>(`[data-endpoint="${target.player}:${target.slot}"]`);
 useLayoutEffect(()=>{
  const node=card.current,origin=source();if(!node||!origin||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const from=origin.getBoundingClientRect(),to=node.getBoundingClientRect();
  const start=`translate(${from.x-to.x}px,${from.y-to.y}px) scale(${from.width/to.width},${from.height/to.height})`;
  const move=node.animate([{transform:start},{transform:'translate(0,0) scale(1)'}],{duration:440,easing:'cubic-bezier(.25,.1,.25,1)',fill:'both'});
  const face=node.querySelector<HTMLElement>('.card-face');const flip=face?.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)'}],{duration:360,easing:'cubic-bezier(.25,.1,.25,1)',fill:'both'});
  animations.current=flip?[move,flip]:[move];return()=>animations.current.forEach(animation=>animation.cancel());
 },[target.player,target.slot,target.rev]);
 function close(){
  if(closing.current)return;closing.current=true;const node=card.current,origin=source();
  if(!node||!origin||matchMedia('(prefers-reduced-motion: reduce)').matches){onClose();return;}
  animations.current.forEach(animation=>animation.cancel());const from=node.getBoundingClientRect(),to=origin.getBoundingClientRect();
  const end=`translate(${to.x-from.x}px,${to.y-from.y}px) scale(${to.width/from.width},${to.height/from.height})`;
  const move=node.animate([{transform:'translate(0,0) scale(1)'},{transform:end}],{duration:440,easing:'cubic-bezier(.25,.1,.25,1)',fill:'both'});
  const face=node.querySelector<HTMLElement>('.card-face');const flip=face?.animate([{transform:'rotateY(180deg)'},{transform:'rotateY(0deg)'}],{duration:360,easing:'cubic-bezier(.25,.1,.25,1)',fill:'both'});
  animations.current=flip?[move,flip]:[move];void move.finished.then(onClose,()=>{});
 }
 return <button ref={card} className="peek-card" onClick={close} aria-label={`Card ${value}. Close peek.`}><CardFace value={value}/></button>;
}
