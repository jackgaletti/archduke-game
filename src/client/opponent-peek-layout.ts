import type { View } from '../shared/protocol';
export type PeekBounds={x:number;y:number;width:number;height:number};
export function peekBounds(card:PeekBounds,hand:PeekBounds,viewport:{width:number;height:number},top=0,bottom=viewport.height):PeekBounds{
 const padding=8,cx=hand.x+hand.width/2,cy=hand.y+hand.height/2;
 const width=Math.max(1,Math.min(card.width*1.6,hand.width*.85,(hand.height-4)/1.4,viewport.width-padding*2,(bottom-top-padding*2)/1.4));
 const height=width*1.4;
 return {x:Math.max(padding,Math.min(cx-width/2,viewport.width-padding-width)),y:Math.max(top+padding,Math.min(cy-height/2,bottom-padding-height)),width,height};
}
export function opponentPeek(v:View){
 const e=v.effects[0],t=e?.target;
 if(e?.actor!==v.you||e.kind!==12||!e.peek||!t||t.player===v.you||e.viewUntil===undefined)return;
 const p=v.players.find(p=>p.id===t.player),slot=p?.slots.find(s=>s.index===t.slot);
 if(!slot?.occupied||slot.rev!==t.rev||slot.cardId!==e.peek.cardId||slot.value===undefined)return;
 return {id:e.id,target:t,cardId:e.peek.cardId,value:slot.value,name:p!.name,until:e.viewUntil,start:e.viewUntil-e.peek.duration-e.peek.motion,readyAt:e.viewUntil-e.peek.duration,motion:e.peek.motion};
}
export type OpponentPeek=NonNullable<ReturnType<typeof opponentPeek>>;
