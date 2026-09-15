import {describe,it,expect} from 'vitest';
import {relativePlayers,handGeometry,playLayout} from '../src/client/table-layout';
import {playerCountSchema} from '../src/shared/protocol';
describe('fixed cyclic opponent strip',()=>{
 for(let count=2;count<=6;count++)for(let seat=0;seat<count;seat++)it(`${count} players from seat ${seat}`,()=>{const players=Array.from({length:count},(_,i)=>({id:String(i)}));expect(relativePlayers(players,String(seat)).map(p=>p.id)).toEqual(Array.from({length:count},(_,i)=>String((seat+i)%count)));});
 it('admits only 2–6 configured players',()=>{for(const n of [2,3,4,5,6])expect(playerCountSchema.safeParse(n).success).toBe(true);for(const n of [0,1,7,10,2.5])expect(playerCountSchema.safeParse(n).success).toBe(false);});
});
describe('fixed-footprint overlapped hands',()=>{
 for(const slots of [2,3,4,6,8,20,104])it(`${slots} persistent slots keep the same card and hand width`,()=>{const h=handGeometry(160,8,slots);expect(h.width).toBe(328);expect(h.height).toBe(456);expect(h.columns).toBe(Math.max(2,Math.ceil(slots/2)));expect((h.columns-1)*h.step+160).toBeCloseTo(328);expect(h.step).toBeGreaterThan(0);if(slots>4)expect(h.step).toBeLessThan(160);});
});
describe('measured primary sizing',()=>{
 for(const [width,height] of [[1280,800],[1440,900],[1920,1080],[820,1180],[1180,820],[390,844]])it(`${width}×${height} keeps lower zones in bounds`,()=>{
  const p=playLayout(width,height,5);expect(p.card).toBeGreaterThanOrEqual(48);expect(p.reserve+p.central*(p.compact?1:3)+p.zone*(p.compact?1:3)+p.pad*2).toBeLessThanOrEqual(width);expect(p.header+p.stripHeight+52+100+p.gap+(p.compact?p.zone:0)+p.card*(p.compact?4.97:2.8)).toBeLessThanOrEqual(height+1);if(width>=900)expect(p.stripColumns).toBe(5);
 });
});

it('reserves a stable expanded own footprint and uses spare width for central cards',()=>{for(const [w,h] of [[1280,800],[1440,900],[1920,1080],[820,1180],[1180,820]]){const p=playLayout(w,h,5);const normal=handGeometry(p.card,p.gap,4,p.expansion);for(const n of [6,8,20,104]){const expanded=handGeometry(p.card,p.gap,n,p.expansion);expect(expanded.width).toBeCloseTo(normal.width*1.3);expect(expanded.width).toBe(p.reserve);}expect(p.central).toBeGreaterThan(p.card*1.35);}});
