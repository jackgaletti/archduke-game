import { useLayoutEffect, useRef } from 'react';

/** A temporary hit target only: canonical names, hands and card motion stay in place. */
export function GiveTarget({name,onHover,onSelect}:{name:string;onHover:(active:boolean)=>void;onSelect:()=>void}){
 const target=useRef<HTMLButtonElement>(null),submitted=useRef(false);
 useLayoutEffect(()=>{
  const button=target.current,seat=button?.parentElement;
  const name=seat?.querySelector<HTMLElement>('.player-name'),grid=seat?.querySelector<HTMLElement>('.hand .card-grid');
  if(!button||!seat||!name||!grid)return;
  const measure=()=>{
   const s=seat.getBoundingClientRect(),n=name.getBoundingClientRect(),h=grid.getBoundingClientRect();
   // The seat owns at most three extra pixels on each side, less than half the strip gap.
   const left=Math.max(s.left-3,Math.min(n.left,h.left)-4),right=Math.min(s.right+3,Math.max(n.right,h.right)+4);
   const top=Math.min(n.top,h.top)-4,bottom=Math.max(n.bottom,h.bottom)+4;
   Object.assign(button.style,{left:`${left-s.left}px`,top:`${top-s.top}px`,width:`${right-left}px`,height:`${bottom-top}px`,visibility:'visible'});
  };
  measure();const observer=new ResizeObserver(measure);[seat,name,grid].forEach(el=>observer.observe(el));
  addEventListener('resize',measure);return()=>{observer.disconnect();removeEventListener('resize',measure);};
 },[]);
 // Pointer movement preserves the existing rule: a newly available Give must not highlight a stationary pointer.
 return <button ref={target} className="give-area" style={{visibility:'hidden'}} aria-label={`Give to ${name}`}
  onPointerEnter={e=>{if(e.movementX||e.movementY)onHover(true);}} onPointerMove={()=>onHover(true)} onPointerLeave={()=>onHover(false)}
  onFocus={()=>onHover(true)} onBlur={()=>onHover(false)}
  onClick={e=>{e.stopPropagation();if(submitted.current)return;submitted.current=true;onHover(false);onSelect();}}/>;
}
