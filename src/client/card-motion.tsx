import { useLayoutEffect, useRef } from 'react';
import type { Movement } from '../shared/protocol';
import artwork from '../shared/artwork.json';
const art=(value:number|'back')=>artwork[String(value) as keyof typeof artwork].url;
export function CardFace({value}:{value?:number}){
 return <span className={`card-face ${value===undefined?'':'face-up'}`} aria-hidden="true"><span className="card-back"><img draggable="false" src={art('back')} alt="Face-down card"/></span><span className="card-front">{value!==undefined&&<img draggable="false" src={art(value)} alt={`Card ${value}`}/>}</span></span>;
}
type Flight={node?:HTMLElement;animations:Animation[];targets:HTMLElement[];movement:Movement;paused:boolean;destination?:HTMLElement};
export function CardMotion({movements,clockNow,paused,scope}:{movements:Movement[];clockNow:number;paused:boolean;scope:string}){
 const layer=useRef<HTMLDivElement>(null);const flights=useRef(new Map<string,Flight>());const seen=useRef(new Set<string>());const initial=useRef(true);const currentScope=useRef(scope);const hidden=useRef(new Map<HTMLElement,number>());
 useLayoutEffect(()=>{
  const hide=(el:HTMLElement)=>{hidden.current.set(el,(hidden.current.get(el)??0)+1);el.dataset.flight='true';};
  const release=(id:string)=>{const flight=flights.current.get(id);if(!flight)return;for(const animation of flight.animations)animation.cancel();flight.node?.remove();for(const el of flight.targets){const count=(hidden.current.get(el)??1)-1;if(count){hidden.current.set(el,count);}else{hidden.current.delete(el);delete el.dataset.flight;}}flights.current.delete(id);};
  if(currentScope.current!==scope){for(const id of flights.current.keys())release(id);seen.current.clear();currentScope.current=scope;}
  // Reconnect snapshots show the current endpoints; they never replay old movements.
  if(initial.current){movements.forEach(m=>seen.current.add(m.id));initial.current=false;return;}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  for(const [id,flight] of flights.current){const m=movements.find(m=>m.id===flight.movement.id);const visualEnd=m?.kind==='discard'?m.end+120:m?.end;if(!m||visualEnd!==undefined&&visualEnd<=clockNow&&!paused){release(id);continue;}if(flight.paused!==paused||flight.movement.start!==m.start){for(const animation of flight.animations){animation.currentTime=clockNow-m.start;if(paused)animation.pause();else animation.play();}flight.paused=paused;flight.movement=m;}}
  for(const m of movements){if(seen.current.has(m.id)||m.end<=clockNow||(m.kind!=='deal'&&m.start>clockNow))continue;seen.current.add(m.id);
   const from=document.querySelector<HTMLElement>(`[data-endpoint="${m.from}"]`),to=document.querySelector<HTMLElement>(`[data-endpoint="${m.to}"]`);if(!from||!to)continue;
   const duration=m.end-m.start+(m.kind==='discard'?120:0);const options:KeyframeAnimationOptions={duration,easing:'cubic-bezier(.25,.1,.25,1)',fill:'both'};
   function register(id:string,flight:Flight){flights.current.set(id,flight);for(const a of flight.animations){a.currentTime=clockNow-m.start;if(paused)a.pause();}if(m.kind==='deal')flight.animations[0].onfinish=()=>release(id);}
   if(reduced||m.from===m.to){
    // A static endpoint cue retains the same server timeline without spatial motion.
    const animation=to.animate([{outlineColor:'#1b1e4366',outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'-2px'},{outlineColor:'#1b1e4366',outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'-2px'}],options);
    register(m.id,{animations:[animation],targets:[],movement:m,paused});continue;
   }
   function fly(source:HTMLElement,destination:HTMLElement,id:string){
    const a=source.getBoundingClientRect(),b=destination.getBoundingClientRect();const node=document.createElement('span');node.className='flying-card';node.dataset.motion=m.kind;node.dataset.motionId=m.id;node.dataset.from=source.dataset.endpoint;node.dataset.to=destination.dataset.endpoint;
    node.style.cssText=`left:${a.x}px;top:${a.y}px;width:${a.width}px;height:${a.height}px`;
    const flip=document.createElement('span');flip.className='card-face';const back=document.createElement('span');back.className='card-back';const front=document.createElement('span');front.className='card-front';
    for(const [el,value] of [[back,'back'],[front,m.value??'back']] as const){const img=document.createElement('img');img.src=art(value);img.alt='';el.append(img);}flip.append(back,front);node.append(flip);layer.current?.append(node);
    const publicFace=m.value!==undefined;const fromFace=publicFace&&(m.kind==='replace'||m.kind==='draw'&&m.from==='discard'||m.kind==='discard'&&m.from.startsWith('held:'));
    const toFace=publicFace&&m.kind!=='replace';
    const move=node.animate([{transform:'translate(0px,0px) scale(1,1)'},{transform:`translate(${b.x-a.x}px,${b.y-a.y}px) scale(${b.width/a.width},${b.height/a.height})`}],options);
    const turn=flip.animate([{transform:`rotateY(${fromFace?180:0}deg)`},{transform:`rotateY(${toFace?180:0}deg)`}],options);
    // A slot already contains the incoming replacement when the server snapshot
    // arrives. Keep that face-down endpoint rendered underneath the outgoing card
    // instead of hiding it for the longer discard flight.
    const targets=m.to==='discard'?[]:source.dataset.endpoint==='draw'||source.dataset.endpoint==='discard'?[destination]:[source,destination];targets.forEach(hide);register(id,{node,animations:[move,turn],targets,movement:m,paused,destination});
   }
   fly(from,to,m.id);if(m.kind==='swap')fly(to,from,`${m.id}:return`);
  }
 },[movements,clockNow,paused,scope]);
 useLayoutEffect(()=>{
  let frame=0;const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
   for(const flight of flights.current.values()){
    if(!flight.node||!flight.destination)continue;
    const node=flight.node,a=node.getBoundingClientRect(),b=flight.destination.getBoundingClientRect();const old=flight.animations[0];const elapsed=Number(old.currentTime??0);const timing=old.effect?.getComputedTiming();const remaining=Math.max(80,Number(timing?.endTime??420)-elapsed);
    old.cancel();node.style.left=`${a.x}px`;node.style.top=`${a.y}px`;node.style.width=`${a.width}px`;node.style.height=`${a.height}px`;
    const move=node.animate([{transform:'translate(0,0) scale(1,1)'},{transform:`translate(${b.x-a.x}px,${b.y-a.y}px) scale(${b.width/a.width},${b.height/a.height})`}],{duration:remaining,easing:'cubic-bezier(.25,.1,.25,1)',fill:'both'});if(flight.paused)move.pause();flight.animations[0]=move;
   }
  });};addEventListener('resize',resize);return()=>{removeEventListener('resize',resize);cancelAnimationFrame(frame);};
 },[]);
 useLayoutEffect(()=>{const active=flights.current,marked=hidden.current;return()=>{for(const f of active.values()){f.animations.forEach(a=>a.cancel());f.node?.remove();}active.clear();for(const el of marked.keys())delete el.dataset.flight;marked.clear();};},[]);
 return <div ref={layer} className="animation-overlay" aria-hidden="true"/>;
}
