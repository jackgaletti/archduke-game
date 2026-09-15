import {useLayoutEffect,useRef} from 'react';
import artwork from '../shared/artwork.json';
import type {View} from '../shared/protocol';
/** Public timing, recipient-only face. The animation catches up instead of restarting on refresh. */
export function InitialFace({value,timing,now,paused}:{value?:number;timing:NonNullable<View['initialPeek']>;now:number;paused:boolean}){
 const face=useRef<HTMLSpanElement>(null);const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 useLayoutEffect(()=>{if(reduced||!face.current)return;const duration=timing.finishAt-timing.revealAt;const animation=face.current.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(180deg)',offset:360/duration},{transform:'rotateY(180deg)',offset:(timing.hideAt-timing.revealAt)/duration},{transform:'rotateY(0deg)'}],{duration,fill:'both',easing:'linear'});animation.currentTime=now-timing.revealAt;if(paused)animation.pause();return()=>animation.cancel();},[timing.revealAt,timing.hideAt,timing.finishAt,paused,reduced]);
 return <span ref={face} className="card-face" aria-hidden="true" style={reduced?{transform:`rotateY(${now>=timing.revealAt+360&&now<timing.hideAt?180:0}deg)`}:undefined}><span className="card-back"><img draggable="false" src={artwork.back.url} alt="Face-down card"/></span><span className="card-front">{value!==undefined&&<img draggable="false" src={artwork[String(value) as keyof typeof artwork].url} alt={`Card ${value}`}/>}</span></span>;
}
