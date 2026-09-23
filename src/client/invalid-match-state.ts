import type { InvalidMatch, PublicPlayer } from '../shared/protocol';

/** Per-view presentation memory, separate from authoritative hand state. */
export class InvalidMatchQueue {
 private scope='';
 private initialized=false;
 private seen=new Set<string>();
 private running=new Map<string,InvalidMatch>();
 accept(scope:string,events:InvalidMatch[],now:number){
  if(this.scope!==scope){this.scope=scope;this.initialized=false;this.seen.clear();this.running.clear();}
  // Refreshes settle the authoritative hand instead of replaying snapshot history.
  if(!this.initialized){events.forEach(e=>this.seen.add(e.id));this.initialized=true;return;}
  for(const e of events){if(this.seen.has(e.id))continue;this.seen.add(e.id);if(e.end>now)this.running.set(e.id,e);}
  for(const [id,e] of this.running)if(e.end+1000<now)this.running.delete(id);
 }
 events(){return [...this.running.values()];}
}
export function visibleHand(player:PublicPlayer,events:InvalidMatch[],now:number):PublicPlayer{
 const arrivals=events.filter(e=>e.end>now&&player.slots.some(s=>s.cardId===e.penalty.cardId));
 if(!arrivals.length)return player;
 const pending=new Set(arrivals.map(e=>e.penalty.cardId));
 const slots=player.slots.filter(s=>!s.cardId||!pending.has(s.cardId));
 const columns=Math.max(2,Math.min(player.columns,...arrivals.map(e=>e.penalty.beforeColumns)),...slots.filter(s=>s.occupied).map(s=>s.column+1));
 return {...player,slots,columns};
}
export function invalidFace(events:InvalidMatch[],cardId:string|undefined,now:number){
 return cardId?events.find(e=>e.attempted.cardId===cardId&&e.start<=now&&now<e.flightAt):undefined;
}
