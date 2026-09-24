import { test, expect, type Locator } from '@playwright/test';
import { createApp } from '../../src/server/app';
import { config } from '../../src/server/config';
import { deck } from '../../src/engine/model';
import { create, join, state, clean } from './helpers';

const appearance=(button:Locator)=>button.evaluate(el=>{
 const s=getComputedStyle(el);
 return {background:s.backgroundColor,color:s.color,font:s.fontFamily,weight:s.fontWeight,size:s.fontSize,transform:s.textTransform,border:s.border,radius:s.borderRadius,shadow:s.boxShadow};
});

test('long lobby names stay truly centered with the outlined badge inside narrow panels',async({browser,page})=>{
 const link=await create(page,undefined,'WWWWWWWWWWWWWWWWWWWWWWWW');
 const guest=await join(browser,link,'Long guest player name');
 try{
  for(const [width,height] of [[1440,900],[390,844],[320,700],[280,700]]){
   await page.setViewportSize({width,height});
   const panel=(await page.locator('.lobby-players').boundingBox())!;
   for(const name of await page.locator('.lobby-name').all()){
    const box=(await name.boundingBox())!;
    expect(box.x+box.width/2).toBeCloseTo(panel.x+panel.width/2,1);
    expect(await name.evaluate(el=>el.scrollWidth)).toBeLessThanOrEqual(Math.ceil(box.width));
   }
   const host=(await page.locator('.lobby-name').first().boundingBox())!,badge=(await page.locator('.host-badge').boundingBox())!;
   expect(badge.x-host.x-host.width).toBeCloseTo(10,1);expect(badge.x+badge.width).toBeLessThan(panel.x+panel.width-12);
   expect(badge.y+badge.height/2).toBeCloseTo(host.y+host.height/2,1);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
   const logo=page.locator('.lobby-wordmark');expect(await logo.evaluate(el=>el.scrollWidth)).toBeLessThanOrEqual(Math.ceil((await logo.boundingBox())!.width));
   await page.screenshot({path:`artifacts/lobby-long-names-${width}.png`,fullPage:true});
  }
  clean([page,guest]);
 }finally{await guest.context().close();}
});

test('rounds 2–4 share lobby Ready styling and remove it only after one accepted action',async({browser,page})=>{
 const app=createApp(config({PUBLIC_ORIGIN:'http://localhost:3102',PORT:'3102',NODE_ENV:'test'}));
 await new Promise<void>(resolve=>app.http.listen(3102,resolve));
 let release:(()=>void)|undefined;let guest:Awaited<ReturnType<typeof join>>|undefined;
 try{
  const commands:unknown[]=[];
  page.on('websocket',socket=>socket.on('framesent',frame=>{const raw=String(frame.payload);if(raw.startsWith('42')){const [,value]=JSON.parse(raw.slice(raw.indexOf('[')));if(value?.type==='ready')commands.push(value);}}));
  const link=await create(page,'http://localhost:3102');guest=await join(browser,link,'Bea');
  const ready=page.getByRole('button',{name:'Ready',exact:true});await page.mouse.move(0,0);
  const lobbyStyle=await appearance(ready),lobbyWidth=(await ready.boundingBox())!.width;
  expect(lobbyStyle).toMatchObject({background:'rgb(27, 30, 67)',color:'rgb(255, 255, 255)',font:'"Dela Gothic One", cursive',weight:'400',transform:'none',border:'1px solid rgb(27, 30, 67)'});
  await ready.hover();await expect(ready).toHaveCSS('background-color','rgb(48, 52, 94)');const hovered=await appearance(ready);await page.mouse.move(0,0);
  await ready.click();await expect(ready).toBeDisabled();await expect(ready).toHaveCSS('opacity','0.45');await expect(ready).toBeVisible();
  const room=app.rooms.rooms.get(state(page).room)!;
  for(const round of [2,3,4]){
   // A committed between-round fixture keeps the other player unready; no deals or timers are bypassed in application code.
   await app.rooms.transaction(room,({state:s})=>{s.game=1;s.round=round-1;s.phase='LOBBY';s.betweenRounds=true;s.deck=deck();s.discard=[];s.players.forEach(p=>{p.ready=false;p.slots=[];p.reviewingResults=false;p.viewingLeaderboard=false;});s.seq++;});
   await expect(page.locator('.game')).toHaveAttribute('data-phase','LOBBY');await expect(page.locator('.round-label')).toHaveText(`Round ${round} / 4`);
   await expect(ready).toBeEnabled();await expect(ready).toHaveText('Ready');await expect(ready).toHaveCSS('text-transform','none');await expect(page.locator('.opponent .ready-button')).toHaveCount(0);
   await page.mouse.move(0,0);await expect(ready).toHaveCSS('background-color','rgb(27, 30, 67)');expect(await appearance(ready)).toEqual(lobbyStyle);expect((await ready.boundingBox())!.width).toBeLessThan(lobbyWidth);
   await ready.hover();await expect(ready).toHaveCSS('background-color','rgb(48, 52, 94)');expect(await appearance(ready)).toEqual(hovered);await page.mouse.move(0,0);
   const grid=(await page.locator('.own .card-grid').boundingBox())!,button=(await ready.boundingBox())!;
   expect(button.y).toBeGreaterThanOrEqual(grid.y+grid.height);expect(button.x+button.width/2).toBeCloseTo(grid.x+grid.width/2,1);
   await page.screenshot({path:`artifacts/round-${round}-ready.png`});
   const before=commands.length;
   // Hold the actual room transaction queue to inspect the UI before authoritative acknowledgement.
   const gate=new Promise<void>(resolve=>{release=resolve;});room.queue=room.queue.then(()=>gate);
   await ready.evaluate(el=>{(el as HTMLButtonElement).click();(el as HTMLButtonElement).click();});
   await expect(ready).toBeVisible();await expect(ready).toBeDisabled();await expect.poll(()=>commands.length).toBe(before+1);expect(room.data.state.players.find(p=>p.id===state(page).you)!.ready).toBe(false);
   release!();release=undefined;
   await expect(ready).toHaveCount(0);await expect.poll(()=>state(page).players.find(p=>p.id===state(page).you)!.ready).toBe(true);await expect.poll(()=>state(guest!).players.find(p=>p.id===state(page).you)!.ready).toBe(true);
   expect(commands.length).toBe(before+1);await expect(guest.getByRole('button',{name:'Ready',exact:true})).toBeEnabled();await expect(page.locator('.own .ready-check')).toHaveCount(1);
  }
  clean([page,guest]);
 }finally{release?.();if(guest)await guest.context().close();await app.close();}
});
