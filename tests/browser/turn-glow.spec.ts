import { test, expect, type Page, type Browser } from '@playwright/test';
import sharp from 'sharp';
import { createApp } from '../../src/server/app';
import { config } from '../../src/server/config';
import { deck, assertCards } from '../../src/engine/model';
import { addToHand } from '../../src/engine/hand';
import { create, join, state, clean } from './helpers';

async function setup(page:Page,browser:Browser,count:number){
 const now=Date.now(),app=createApp(config({PUBLIC_ORIGIN:'http://localhost:3102',PORT:'3102',NODE_ENV:'test'}),undefined,{now:()=>now,randomInt:n=>n-1,motion:500,delay:1000,peek:3000,grace:60000,restart:1000});
 await new Promise<void>(r=>app.http.listen(3102,r));const pages=[page],link=await create(page,'http://localhost:3102','jack');
 for(let i=1;i<count;i++)pages.push(await join(browser,link,i===1?'jgjpqy':`Player ${i+1}`));
 await expect(page.locator('.turn-triangle,[aria-current=true]')).toHaveCount(0);
 const room=app.rooms.rooms.get(state(page).room)!;
 await app.rooms.transaction(room,({state:s})=>{
  const cards=deck();s.players.forEach((p,index)=>{p.slots=[];for(let i=0;i<(index===2?8:4);i++)addToHand(p,{card:cards.pop()!,rev:1});});
  s.game=1;s.round=1;s.phase='INTER_TURN';s.open=true;s.window='glow-window';s.next=s.players[0].id;s.deck=cards;s.discard=[s.deck.pop()!];s.seq++;assertCards(s);
 });
 await expect(page.locator('.game')).toBeVisible();
 return {app,room,pages,close:async()=>{for(const p of pages.slice(1))await p.context().close();await app.close();}};
}
const geometry=(page:Page)=>page.locator('.seat .player-name,.seat .card-grid,.seat [data-slot]').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));

for(const count of [2,3,4,5,6])test(`${count} players: authoritative glow, caller priority and stationary names/hands`,async({page,browser})=>{
 const f=await setup(page,browser,count);try{
  const ids=state(page).players.map(p=>p.id),nodes=await page.locator('.seat .player-name').elementHandles();
  for(const [width,height] of [[1440,900],[820,1180],[390,844]]){
   await page.setViewportSize({width,height});await expect(page.locator('.game')).toHaveAttribute('data-layout-width',String(width));await expect(page.locator('.game')).toHaveAttribute('data-layout-height',String(height));await expect(page.locator('.game')).not.toHaveClass(/resizing/);
   const before=await geometry(page);
   for(const [next,caller] of [[ids[0],undefined],[ids[1],ids[0]],[ids[0],ids[0]],[ids.at(-1)!,undefined]] as const){
    await f.app.rooms.transaction(f.room,({state:s})=>{s.next=next;s.caller=caller;s.seq++;});
    for(const p of f.pages){
     await expect(p.locator('.seat[aria-current=true]')).toHaveCount(1);await expect(p.locator('.seat[aria-current=true]')).toHaveAttribute('data-seat',next);
     await expect(p.locator('.turn-triangle')).toHaveCount(count);await expect(p.locator('.caller-crown')).toHaveCount(0);await expect(p.locator('.turn-seat .turn-triangle')).toHaveCSS('border-left-color','rgb(217, 145, 61)');
     for(const id of ids){const seat=p.locator(`[data-seat="${id}"]`),name=seat.locator('.player-name');await expect(seat.locator('.turn-triangle')).toHaveCSS('opacity',id===next?'1':'0');await expect(name).toHaveCSS('color',id===caller?'rgb(217, 145, 61)':'rgb(27, 30, 67)');await expect(name).toHaveCSS('filter',id===next?'drop-shadow(rgb(217, 145, 61) 0px 0px 3px)':'none');}
    }
    expect(await geometry(page)).toEqual(before);
    expect(await page.locator('.turn-seat .player-name').evaluate(el=>el.getAnimations().length)).toBe(0);
   }
   for(const node of nodes)expect(await node.evaluate(el=>el.isConnected)).toBe(true);
   await page.screenshot({path:`artifacts/turn-glow-${count}-${width}.png`});
  }
  await page.reload();await expect(page.locator('.seat[aria-current=true]')).toHaveAttribute('data-seat',ids.at(-1)!);await expect(page.locator('.turn-seat')).toHaveCount(1);await expect(page.locator('.turn-triangle')).toHaveCount(count);await expect(page.locator('.turn-seat .turn-triangle')).toHaveCSS('opacity','1');clean(f.pages);
 }finally{await f.close();}
});

test('gold halo paints on all sides without clipping or intercepting cards',async({page,browser})=>{
 const f=await setup(page,browser,2);try{
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const [width,height] of [[1440,900],[820,1180],[390,844]]){
   await page.setViewportSize({width,height});await expect(page.locator('.game')).toHaveAttribute('data-layout-width',String(width));await expect(page.locator('.game')).toHaveAttribute('data-layout-height',String(height));await expect(page.locator('.game')).not.toHaveClass(/resizing/);
   for(const player of state(page).players){
    await f.app.rooms.transaction(f.room,({state:s})=>{s.next=player.id;s.seq++;});await expect(page.locator('.turn-seat')).toHaveAttribute('data-seat',player.id);
    const name=page.locator('.turn-seat .player-name');
    const ink=await name.evaluate(el=>{
     const r=el.getBoundingClientRect(),s=getComputedStyle(el),ctx=document.createElement('canvas').getContext('2d')!;ctx.font=`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;const m=ctx.measureText(el.textContent!);
     const left=r.x+parseFloat(s.paddingLeft),baseline=r.y+parseFloat(s.paddingTop)+(parseFloat(s.lineHeight)-m.fontBoundingBoxAscent-m.fontBoundingBoxDescent)/2+m.fontBoundingBoxAscent;
     const ancestors=[];for(let p=el.parentElement;p&&!p.classList.contains('game');p=p.parentElement)ancestors.push(getComputedStyle(p).overflow);
     return {left:left-m.actualBoundingBoxLeft,right:left+m.actualBoundingBoxRight,top:baseline-m.actualBoundingBoxAscent,bottom:baseline+m.actualBoundingBoxDescent,ancestors};
    });
    expect(ink.ancestors.every(o=>o==='visible')).toBe(true);
    expect(ink.left-9).toBeGreaterThanOrEqual(0);expect(ink.right+9).toBeLessThanOrEqual(width);expect(ink.top-9).toBeGreaterThan(0);expect(ink.bottom+9).toBeLessThan(height);
    const clip={x:Math.floor(ink.left-10),y:Math.floor(ink.top-10),width:Math.ceil(ink.right-ink.left+21),height:Math.ceil(ink.bottom-ink.top+21)};
    const glowing=await page.screenshot({clip});await name.evaluate(el=>(el as HTMLElement).style.filter='none');const plain=await page.screenshot({clip});await name.evaluate(el=>(el as HTMLElement).style.removeProperty('filter'));
    const a=await sharp(glowing).removeAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(plain).removeAlpha().raw().toBuffer();const sides=[0,0,0,0];
    for(let y=0;y<a.info.height;y++)for(let x=0;x<a.info.width;x++){
     const i=(y*a.info.width+x)*3,change=Math.abs(a.data[i]-b[i])+Math.abs(a.data[i+1]-b[i+1])+Math.abs(a.data[i+2]-b[i+2]);if(change<8)continue;
     if(x+clip.x<ink.left)sides[0]++;if(x+clip.x>ink.right)sides[1]++;if(y+clip.y<ink.top)sides[2]++;if(y+clip.y>ink.bottom)sides[3]++;
    }
    for(const pixels of sides)expect(pixels).toBeGreaterThan(3);
    const seat=page.locator('.turn-seat');expect(await seat.locator('.card-grid>.card').first().evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
    await page.screenshot({path:`artifacts/glow-ink-${player.name}-${width}.png`});
   }
  }
  clean(f.pages);
 }finally{await f.close();}
});
