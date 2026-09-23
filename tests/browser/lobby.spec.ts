import { test, expect } from '@playwright/test';
import { createApp } from '../../src/server/app';
import { config } from '../../src/server/config';
import { create, join, start, state, clean, invite } from './helpers';

test('room lobby, unchanged initial deal, late waiting entry and host Exit',async({browser,page})=>{
 let now=Date.now();const app=createApp(config({PUBLIC_ORIGIN:'http://localhost:3102',PORT:'3102',NODE_ENV:'test'}),undefined,{now:()=>now,randomInt:n=>n-1,motion:500,delay:1000,peek:3000,grace:60000,restart:1000});
 await new Promise<void>(resolve=>app.http.listen(3102,resolve));
 const pages=[page];
 try{
  const link=await create(page,'http://localhost:3102');await expect(page.locator('.game')).toHaveCount(0);await expect(page.locator('.round-label')).toHaveCount(0);await expect(page.locator('.lobby-wordmark')).toHaveText('ARCHDUKE');
  await expect(page.locator('.lobby-wordmark')).toHaveCSS('color','rgb(27, 30, 67)');await expect(page.locator('.lobby-wordmark')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');await expect(page.locator('.lobby-wordmark')).toHaveCSS('border-width','0px');await expect(page.getByRole('button',{name:'ARCHDUKE',exact:true})).toHaveCount(0);
  await expect(page.locator('.host-badge')).toHaveCSS('background-color','rgb(217, 145, 61)');await expect(page.locator('.host-badge')).toHaveCSS('color','rgb(27, 30, 67)');await expect(page.getByRole('button',{name:'Start Game',exact:true})).toBeDisabled();
  await expect(page.locator('.host-badge')).toHaveCSS('border','1px solid rgb(27, 30, 67)');
  for(const label of ['Ready','Start Game']){const button=page.getByRole('button',{name:label,exact:true});await expect(button).toHaveText(label);await expect(button).toHaveCSS('text-transform','none');}
  await expect(page.locator('.game-header > .lobby-wordmark')).toHaveCount(1);await expect(page.locator('.lobby-center .lobby-wordmark')).toHaveCount(0);
  await expect(page.locator('.lobby-wordmark')).toHaveCSS('box-shadow','none');await expect(page.locator('.lobby-wordmark')).toHaveCSS('font-weight','400');expect(await page.locator('.lobby-wordmark').evaluate(el=>({tag:el.tagName,tabIndex:(el as HTMLElement).tabIndex}))).toEqual({tag:'H1',tabIndex:-1});
  pages.push(await join(browser,link,'Bea'));
  for(const [width,height] of [[1280,800],[1440,900],[1920,1080],[820,1180],[1180,820],[390,844]]){
   await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);const box=await page.locator('.lobby-players').boundingBox();expect(box!.x+box!.width/2).toBeCloseTo(width/2,1);
   for(const name of await page.locator('.lobby-name').all()){const bounds=(await name.boundingBox())!;expect(bounds.x+bounds.width/2).toBeCloseTo(box!.x+box!.width/2,1);}
   const wordmark=(await page.locator('.lobby-wordmark').boundingBox())!;expect(wordmark.x+wordmark.width/2).toBeCloseTo(width/2,1);expect(box!.y-wordmark.y-wordmark.height).toBeGreaterThanOrEqual(24);expect(await page.locator('.lobby-wordmark').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(width<700?18:Math.min(28,Math.max(20,width*.0185)),1);
   const control=(await page.locator('.invite-control:not(.lobby-home)').boundingBox())!;expect(control.x).toBeGreaterThan(width/2);expect(control.y+control.height).toBeLessThanOrEqual(88);await page.screenshot({path:`artifacts/lobby-two-${width}x${height}.png`});
  }
  const guest=pages[1];await expect(guest.getByRole('button',{name:'Start Game',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Ready',exact:true}).click();await expect(page.getByRole('button',{name:'Ready',exact:true})).toBeDisabled();await expect(page.locator('.lobby-players li').first()).toHaveAttribute('data-ready','true');await expect(guest.locator('.lobby-players li').first()).toHaveAttribute('data-ready','true');await expect(page.locator('.lobby-players li').first().locator('.lobby-name')).toHaveCSS('color','rgb(27, 30, 67)');
  await expect(page.locator('.lobby-players li').last().locator('.lobby-name')).toHaveCSS('color','rgb(64, 80, 106)');const contrast=await page.locator('.lobby-players li').last().locator('.lobby-name').evaluate(el=>{const luminance=(color:string)=>color.match(/[0-9.]+/g)!.slice(0,3).map(v=>Number(v)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((total,v,i)=>total+v*[.2126,.7152,.0722][i],0);return (luminance(getComputedStyle(el.closest('.lobby-players')!).backgroundColor)+.05)/(luminance(getComputedStyle(el).color)+.05);});expect(contrast).toBeGreaterThanOrEqual(4.5);await expect(page.getByRole('button',{name:'Start Game',exact:true})).toBeDisabled();
  await guest.getByRole('button',{name:'Ready',exact:true}).click();await expect(page.getByRole('button',{name:'Start Game',exact:true})).toBeEnabled();await expect(page.locator('.game')).toHaveCount(0);
  await page.setViewportSize({width:1440,height:900});for(const p of pages){await p.clock.install({time:now-1000});await p.clock.pauseAt(now);await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));}
  async function advance(ms:number){now+=ms;await app.rooms.timers();await Promise.all(pages.map(p=>p.clock.runFor(ms)));}
  await page.getByRole('button',{name:'Start Game',exact:true}).click();await expect(page.locator('.game')).toHaveAttribute('data-phase','INITIAL_PEEK');await expect(page.locator('.room-lobby')).toHaveCount(0);
  await expect(page.locator('.flying-card[data-motion=deal]')).toHaveCount(8);await expect(page.locator('.archduke-button')).toHaveText('ARCHDUKE!');await expect(page.locator('.archduke-button')).toHaveCSS('border-width','1px');
  const moves=state(page).movements;expect(moves.filter(m=>m.kind==='deal').map(m=>m.end-m.start)).toEqual(Array(8).fill(500));await advance(200);const targets=await page.locator('.flying-card[data-motion=deal]').evaluateAll(nodes=>nodes.map(node=>{const el=node as HTMLElement,dest=document.querySelector(`[data-endpoint="${el.dataset.to}"]`)!.getBoundingClientRect();const frames=(el.getAnimations()[0].effect as KeyframeEffect).getKeyframes();const transform=new DOMMatrix(String(frames.at(-1)!.transform));return {x:parseFloat(el.style.left)+transform.m41,y:parseFloat(el.style.top)+transform.m42,dx:dest.x,dy:dest.y};}));for(const target of targets){expect(target.x).toBeCloseTo(target.dx,1);expect(target.y).toBeCloseTo(target.dy,1);}await page.screenshot({path:'artifacts/lobby-deal-midflight.png'});await expect(page.locator('.own [data-flight=true]')).toHaveCount(4);
  await advance(420);await expect(page.locator('.own .card-front img')).toHaveCount(2);await expect(guest.locator('.opponent .card-front img')).toHaveCount(0);await advance(2720);await advance(1600);
  const late=await join(browser,link,'Late guest');pages.push(late);await late.clock.install({time:now-1000});await late.clock.pauseAt(now);await expect(late.locator('.lobby-progress')).toHaveText('Game in progress');await expect(late.locator('.game')).toHaveCount(0);await expect(late.locator('img')).toHaveCount(0);await expect(late.getByRole('button',{name:'Ready',exact:true})).toHaveCount(0);
  const lateId=state(late).you;await late.reload();await expect(late.locator('.room-lobby')).toBeVisible();expect(state(late).you).toBe(lateId);expect(state(late).players.every(p=>!p.slots.length)).toBe(true);
  const activeId=state(guest).you;await guest.reload();await expect(guest.locator('.game')).toHaveAttribute('data-phase','INTER_TURN');expect(state(guest).you).toBe(activeId);await expect(guest.getByRole('button',{name:'Exit',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Exit',exact:true})).toBeVisible();const header=page.locator('.invite-control.with-exit');expect(await header.innerText()).toContain('/');await page.getByRole('button',{name:'Invite',exact:true}).hover();await expect(page.getByRole('button',{name:'Invite',exact:true})).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await page.getByRole('button',{name:'Exit',exact:true}).click();for(const p of pages){await expect(p.locator('.room-lobby')).toBeVisible();expect(state(p).room).toBe(state(page).room);expect(state(p).lobby!.players.every(p=>!p.ready)).toBe(true);await expect(p.getByRole('button',{name:'Ready',exact:true})).toBeEnabled();}
  // Wait out clipboard feedback using the fake clock before copying the persistent link again.
  await advance(2000);expect(await invite(page)).toBe(link);
  for(let i=3;i<6;i++)pages.push(await join(browser,link,`Guest ${i}`));
  for(const [width,height] of [[1280,800],[1440,900],[1920,1080],[820,1180],[1180,820]]){await page.setViewportSize({width,height});await expect(page.locator('.lobby-players li')).toHaveCount(6);await expect(page.locator('.lobby-players')).toBeInViewport();await page.screenshot({path:`artifacts/lobby-six-${width}x${height}.png`});}
  await start(pages);await expect(page.locator('.opponent-strip .seat')).toHaveCount(5);expect(state(page).round).toBe(1);clean(pages);
 }finally{for(const p of pages.slice(1))await p.context().close();await app.close();}
});
