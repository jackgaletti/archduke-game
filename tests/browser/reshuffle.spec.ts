import { test, expect } from '@playwright/test';
import { createApp } from '../../src/server/app';
import { config } from '../../src/server/config';
import { assertCards, deck } from '../../src/engine/model';
import { create, join, state, clean } from './helpers';

for(const reduced of [false,true])test(`synchronized isolated reshuffle, low layers and reconnect (${reduced?'reduced':'full'} motion)`,async({browser,page})=>{
 let now=Date.now();const app=createApp(config({PUBLIC_ORIGIN:'http://localhost:3102',PORT:'3102',NODE_ENV:'test'}),undefined,{now:()=>now,randomInt:n=>n-1,delay:1000,motion:500,peek:3000,grace:60000,restart:1000});
 await new Promise<void>(resolve=>app.http.listen(3102,resolve));
 try{
  if(reduced)await page.emulateMedia({reducedMotion:'reduce'});
  const link=await create(page,'http://localhost:3102');const guest=await join(browser,link,'Bea');const pages=[page,guest];
  for(const p of pages){await p.clock.install({time:now-1000});await p.clock.pauseAt(now);if(reduced)await p.emulateMedia({reducedMotion:'reduce'});await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));}
  const room=app.rooms.rooms.get(state(page).room)!;
  async function advance(ms:number){now+=ms;await app.rooms.timers();await Promise.all(pages.map(p=>p.clock.runFor(ms)));}
  await app.rooms.transaction(room,({state:s})=>{
   const cards=deck();s.players.forEach(p=>{p.slots=Array.from({length:4},(_,i)=>({rev:1,card:cards.pop()!,row:i%2,column:Math.floor(i/2)}));p.columns=2;});
   s.game=1;s.round=1;s.phase='INTER_TURN';s.open=true;s.next=s.players[0].id;s.window='window';s.deck=cards;s.discard=[s.deck.pop()!];s.seq++;
  });
  await expect.poll(()=>state(page).phase).toBe('INTER_TURN');
  const draw=page.locator('[data-endpoint=draw]'),discard=page.locator('[data-endpoint=discard]');
  await advance(500);const before=await draw.boundingBox(),discardBox=await discard.boundingBox();
  const canonical=await draw.elementHandle(),topNode=await discard.locator('.card-face').elementHandle();
  for(const count of [50,11,10,9,2,1]){
   await app.rooms.transaction(room,({state:s})=>{s.discard.unshift(...s.deck.splice(0,s.deck.length-count));s.seq++;});
   await expect.poll(()=>state(page).drawCount).toBe(count);await expect(page.locator('.stack-layer')).toHaveCount(Math.min(count,10)-1);await expect(draw.locator('img')).toHaveCount(1);
   expect(await draw.boundingBox()).toEqual(before);
  }
  await draw.click();await expect.poll(()=>state(page).drawCount).toBe(0);expect(state(page).reshuffling).toBeUndefined();expect(state(page).reshufflePending).toBe(true);
  expect(state(guest).held?.value).toBeUndefined();await expect(draw).toBeDisabled();await expect(draw.locator('img')).toHaveCount(0);await expect(page.locator('.stack-layer')).toHaveCount(0);expect(await draw.boundingBox()).toEqual(before);
  await advance(5000);expect(state(page).reshuffling).toBeUndefined();await expect(page.locator('.reshuffle-ghost')).toHaveCount(0);await expect(discard).toBeEnabled();
  await page.screenshot({path:`artifacts/reshuffle-${reduced?'reduced':'full'}-empty.png`});
  const protectedValue=state(page).held!.value;await discard.click();await expect.poll(()=>!!state(page).reshuffling).toBe(true);const event=state(page).reshuffling!;await expect.poll(()=>state(guest).reshuffling?.id).toBe(event.id);await expect(discard).toBeDisabled();
  await advance(event.moveAt-now-50);await expect(page.locator('.flying-card')).toHaveCount(0);await expect(page.locator('.reshuffle-ghost')).toHaveCount(0);const protectedPixels=await discard.screenshot();
  // Observe intermediate motion through the independent ghost animations, not screenshots alone.
  await advance(event.moveAt+300-now);
  await expect(page.locator('.reshuffle-ghost')).toHaveCount(10);
  const middle=await page.locator('.reshuffle-ghost').last().evaluate(el=>({rect:el.getBoundingClientRect().toJSON(),transform:getComputedStyle(el).transform,src:(el as HTMLImageElement).src}));
  expect(middle.src).toContain('back');const origin=await page.locator('.reshuffle-ghost').last().evaluate(el=>({left:parseFloat((el as HTMLElement).style.left),top:parseFloat((el as HTMLElement).style.top)}));expect(origin.left).toBeCloseTo(discardBox!.x,2);expect(origin.top).toBeCloseTo(discardBox!.y,2);if(!reduced){expect(middle.rect.x).toBeLessThan(discardBox!.x);expect(middle.rect.x).toBeGreaterThan(before!.x-20);}expect(state(page).discard).toBe(protectedValue);
  await expect(discard.locator('.card-front img')).toHaveAttribute('alt',`Card ${protectedValue}`);
  expect(await discard.boundingBox()).toEqual(discardBox);expect(await topNode!.evaluate(el=>el.isConnected)).toBe(true);expect(await canonical!.evaluate(el=>el.isConnected)).toBe(true);
  await page.screenshot({path:`artifacts/reshuffle-${reduced?'reduced':'full'}-moving.png`});
  await advance(350);expect((await discard.screenshot()).equals(protectedPixels)).toBe(true);await page.screenshot({path:`artifacts/reshuffle-${reduced?'reduced':'full'}-midflight.png`});const later=await page.locator('.reshuffle-ghost').last().evaluate(el=>getComputedStyle(el).transform);if(!reduced)expect(later).not.toBe(middle.transform);
  // Refresh only the spectator while the server holds the same event and restores its remaining time.
  const beforeRefresh=state(guest).seq;const clockSynced=new Promise<void>(resolve=>guest.once('websocket',socket=>socket.on('framereceived',frame=>{const raw=String(frame.payload);if(raw.startsWith('43')&&raw.includes('"now"'))resolve();})));await guest.reload();await clockSynced;await expect(guest.locator('.game')).toHaveAttribute('data-phase','INTER_TURN');await expect.poll(()=>state(guest).seq>beforeRefresh&&state(guest).players.every(p=>p.connected)&&!state(guest).paused).toBe(true);expect(state(guest).reshuffling?.id).toBe(event.id);await advance(Math.max(0,room.data.state.reshuffling!.moveAt-now)+100);
  // The fake clock is stopped inside the reconnect delay. Let layout settle, then
  // request the normal visibility-resync snapshot before inspecting paused ghosts.
  // Otherwise the first snapshot can arrive before ResizeObserver while all
  // subsequent clock-driven renders remain frozen at the same restart timestamp.
  await expect.poll(()=>guest.locator('.game').evaluate(el=>Number((el as HTMLElement).dataset.layoutWidth)===el.clientWidth&&Number((el as HTMLElement).dataset.layoutHeight)===el.clientHeight)).toBe(true);
  await guest.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(guest.locator('.reshuffle-ghost')).toHaveCount(10);const resumedOrigin=await guest.locator('.reshuffle-ghost').last().evaluate(el=>({left:parseFloat((el as HTMLElement).style.left),top:parseFloat((el as HTMLElement).style.top)}));const resumedDiscard=await guest.locator('[data-endpoint=discard]').boundingBox();expect(resumedOrigin.left).toBeCloseTo(resumedDiscard!.x,2);expect(resumedOrigin.top).toBeCloseTo(resumedDiscard!.y,2);if(now<room.data.state.restartAt){const ghost=guest.locator('.reshuffle-ghost').last();await expect(ghost).toHaveAttribute('data-paused','true');expect(await ghost.evaluate(el=>Number(el.getAnimations()[0].currentTime))).toBeCloseTo(room.data.state.restartAt-room.data.state.reshuffling!.moveAt,0);}
  const current=room.data.state.reshuffling!;await advance(current.end-now+50);
  await expect.poll(()=>state(page).reshuffling).toBeUndefined();await expect(page.locator('.reshuffle-ghost')).toHaveCount(0);await expect(page.locator('.stack-layer')).toHaveCount(9);
  expect(await draw.boundingBox()).toEqual(before);expect(state(page).discardCount).toBe(1);expect(state(page).discard).toBe(protectedValue);expect(state(page).held).toBeUndefined();expect(state(page).turn).toBe(1);
  assertCards(room.data.state);await page.screenshot({path:`artifacts/reshuffle-${reduced?'reduced':'full'}-settled.png`});clean(pages);await guest.context().close();
 }finally{await app.close();}
});
