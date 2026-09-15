import {useEffect,useRef} from 'react';
import type {Movement} from '../shared/protocol';
export function CallBurst({movements,now,connected}:{movements:Movement[];now:number;connected:boolean}){
 const layer=useRef<HTMLDivElement>(null);const seen=useRef<Set<string>|null>(null);const online=useRef(connected);
 useEffect(()=>{
  if(!seen.current||!online.current||!connected){seen.current=new Set(movements.map(m=>m.id));online.current=connected;return;}
  for(const m of movements){if(seen.current.has(m.id))continue;seen.current.add(m.id);if(m.kind!=='call'||m.end<=now)continue;
   const node=document.createElement('div');node.className='call-burst';layer.current?.append(node);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
   node.dataset.reduced=String(reduced);const button=document.querySelector('.archduke-button')!.getBoundingClientRect();
   if(!reduced){node.style.left=`${button.x+button.width/2-60}px`;node.style.top=`${button.y+button.height/2-60}px`;}
   const cx=button.x+button.width/2,cy=button.y+button.height/2;
   const scale=(Math.hypot(Math.max(cx,innerWidth-cx),Math.max(cy,innerHeight-cy))+90)/60;
   const animation=node.animate(reduced?[{opacity:.16},{opacity:0}]:[{transform:'scale(.2)',opacity:.28},{transform:`scale(${scale*.8})`,opacity:.16,offset:.8},{transform:`scale(${scale})`,opacity:0}],{duration:m.end-m.start,easing:'cubic-bezier(.3,0,.2,1)',fill:'both'});animation.currentTime=Math.max(0,now-m.start);animation.onfinish=()=>node.remove();
  }
 },[movements,now,connected]);
 return <div ref={layer} className="burst-layer" aria-hidden="true"/>;
}
