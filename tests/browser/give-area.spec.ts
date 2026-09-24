import { test, expect, type Page } from '@playwright/test';
import { createApp } from '../../src/server/app';
import { config } from '../../src/server/config';
import { deck, assertCards } from '../../src/engine/model';
import { addToHand } from '../../src/engine/hand';
import { create, join, state, clean } from './helpers';

async function setup(page:Page,browser:Parameters<typeof join>[0],count:number){
 let now=Date.now();const app=createApp(config({PUBLIC_ORIGIN:'http://localhost:3102',PORT:'3102',NODE_ENV:'test'}),undefined,{now:()=>now,randomInt:n=>n-1,motion:500,delay:1000,peek:3000,grace:60000,restart:1000});
 await new Promise<void>(r=>app.http.listen(3102,r));const link=await create(page,'http://localhost:3102'),pages=[page];for(let i=1;i<count;i++)pages.push(await join(browser,link,`Player ${i}`));
 const room=app.rooms.rooms.get(state(page).room)!;
 await app.rooms.transaction(room,({state:s})=>{
  const cards=deck();s.players.forEach((p,i)=>{p.slots=[];for(let j=0;j<(i===2?8:4);j++)addToHand(p,{rev:1,card:cards.pop()!});});
  const hole=s.players[1].slots[1];cards.push(hole.card!);hole.card=undefined;hole.rev++;
  s.game=1;s.round=1;s.phase='INTER_TURN';s.open=true;s.window='window';s.next=s.players[1].id;s.discard=[cards.pop()!];s.deck=cards;s.effects=[{id:'give-area',actor:s.players[0].id,kind:1}];s.seq++;assertCards(s);
 });
 await expect(page.locator('.give-area')).toHaveCount(count-1);
 await page.evaluate(()=>{const original=WebSocket.prototype.send;WebSocket.prototype.send=function(data){if(typeof data==='string'&&data.includes('["command",')){const start=data.indexOf('["command",');(window as unknown as {giveCommands:unknown[]}).giveCommands.push(JSON.parse(data.slice(start))[1]);}return original.call(this,data);};(window as unknown as {giveCommands:unknown[]}).giveCommands=[];});
 return {app,room,pages,advance:async()=>{now+=2000;await app.rooms.timers();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect.poll(()=>state(page).serverNow).toBe(now);},close:async()=>{for(const p of pages.slice(1))await p.context().close();await app.close();}};
}

for(const [count,width,height] of [[2,1440,900],[3,1280,800],[4,1920,1080],[5,820,1180],[6,1180,820]])test(`Give area: ${count} players, ${width}×${height}, unchanged cards and tight bounds`,async({page,browser})=>{
 await page.setViewportSize({width,height});const f=await setup(page,browser,count);try{
  await page.mouse.move(0,0);const recipient=state(page).players[1].id,seat=page.locator(`[data-seat="${recipient}"]`),name=seat.locator('.player-name'),target=seat.locator('.give-area');
  const cardState=()=>seat.locator('[data-slot]').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {id:(el as HTMLElement).dataset.cardId,x:r.x,y:r.y,w:r.width,h:r.height,transform:s.transform,translate:s.translate,filter:s.filter,shadow:s.boxShadow,outline:s.outline,z:s.zIndex,background:s.backgroundColor};}));
  await expect(page.locator('.game')).not.toHaveClass(/resizing/);
  const before=await cardState(),nodes=await seat.locator('[data-slot]').elementHandles();
  const areas=await page.locator('.give-area').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(let i=0;i<areas.length;i++){const a=areas[i];expect(a.x).toBeGreaterThanOrEqual(0);expect(a.right).toBeLessThanOrEqual(width);for(const b of areas.slice(i+1))expect(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y).toBe(true);}
  const n=(await name.boundingBox())!,grid=(await seat.locator('.hand .card-grid').boundingBox())!,bounds=(await target.boundingBox())!;
  expect(bounds.x).toBeLessThanOrEqual(grid.x);expect(bounds.y).toBeLessThanOrEqual(n.y);expect(bounds.x+bounds.width).toBeGreaterThanOrEqual(grid.x+grid.width);expect(bounds.y+bounds.height).toBeGreaterThanOrEqual(grid.y+grid.height);
  await name.evaluate(el=>{(window as unknown as {hoverChanges:string[]}).hoverChanges=[];new MutationObserver(()=>{(window as unknown as {hoverChanges:string[]}).hoverChanges.push(el.getAttribute('data-hovered')!);}).observe(el,{attributes:true,attributeFilter:['data-hovered']});});
  const points=[{x:n.x+n.width/2,y:n.y+n.height/2},{x:grid.x+5,y:grid.y+5},{x:grid.x+5,y:grid.y+grid.height-5},{x:grid.x+grid.width/2,y:grid.y+grid.height/2},{x:grid.x+grid.width/2,y:grid.y-1}];
  for(const point of points){await page.mouse.move(point.x,point.y);await expect(name).toHaveAttribute('data-hovered','true');await expect(name).toHaveCSS('color','rgb(57, 70, 116)');expect(await cardState()).toEqual(before);}
  expect(await page.evaluate(()=>(window as unknown as {hoverChanges:string[]}).hoverChanges)).toEqual(['true']);
  for(const [i,node] of nodes.entries())expect(await node.evaluate((el,index)=>el===el.parentElement!.querySelectorAll('[data-slot]')[index],i)).toBe(true);
  await page.screenshot({path:`artifacts/give-area-${count}-${width}.png`});await page.mouse.move(0,0);await expect(name).toHaveAttribute('data-hovered','false');
  // An empty bottom-left base slot is part of the recipient target, not a card action.
  const click=points[count===2?0:count===3?1:2];await page.mouse.click(click.x,click.y,{clickCount:2});await expect(page.locator('.give-area')).toHaveCount(0);
  await expect.poll(()=>f.room.data.state.effects.length).toBe(0);expect(f.room.data.state.players[1].slots.filter(s=>s.card)).toHaveLength(4);
  const commands=await page.evaluate(()=>(window as unknown as {giveCommands:{type:string;recipient:string}[]}).giveCommands);expect(commands).toHaveLength(1);expect(commands[0]).toMatchObject({type:'effect',effect:'give-area',recipient});
  for(const p of f.pages){await expect.poll(()=>state(p).effects.length).toBe(0);expect(state(p).players[1].slots.every(s=>s.value===undefined)).toBe(true);await expect(p.locator(`[data-seat="${recipient}"] .card-front img`)).toHaveCount(0);}
  expect(f.room.data.state.movements.at(-1)).toMatchObject({kind:'give',from:'draw'});assertCards(f.room.data.state);clean(f.pages);
 }finally{await f.close();}
});

for(const key of ['Enter','Space','tap'])test(`Give ${key}: authority, cancellation, reconnect and single selection`,async({page,browser})=>{
 if(key==='tap'){const ctx=await browser.newContext({hasTouch:true});page=await ctx.newPage();}
 const f=await setup(page,browser,3);try{
  const [actor,recipient,caller]=state(page).players;
  await f.app.rooms.transaction(f.room,({state:s})=>{s.caller=caller.id;s.seq++;});
  await expect(page.locator('.give-area')).toHaveCount(1);await expect(page.locator('.own .give-area')).toHaveCount(0);await expect(f.pages[1].locator('.give-area')).toHaveCount(0);
  await page.reload();await expect(page.locator('.game')).toBeVisible();await f.advance();await expect(page.getByRole('button',{name:`Give to ${recipient.name}`})).toBeVisible();
  const target=page.getByRole('button',{name:`Give to ${recipient.name}`});await target.focus();await expect(page.locator(`[data-seat="${recipient.id}"] .player-name`)).toHaveCSS('color','rgb(57, 70, 116)');
  await f.app.rooms.transaction(f.room,({state:s})=>{s.effects=[];s.seq++;});await expect(page.locator('.give-area')).toHaveCount(0);
  await f.app.rooms.transaction(f.room,({state:s})=>{s.effects=[{id:'give-next',actor:actor.id,kind:1}];s.seq++;});await expect(target).toBeVisible();
  if(key==='tap')await target.tap();else await target.press(key);
  await expect(page.locator('.give-area')).toHaveCount(0);await expect.poll(()=>f.room.data.state.players[1].slots.filter(s=>s.card).length).toBe(4);
  await page.reload();await expect(page.locator('.game')).toBeVisible();await expect(page.locator('.give-area')).toHaveCount(0);clean(f.pages);
 }finally{await f.close();if(key==='tap')await page.context().close();}
});
