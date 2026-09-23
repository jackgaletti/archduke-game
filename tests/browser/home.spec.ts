import { test, expect } from '@playwright/test';
import { create, join, state, clean } from './helpers';

test('Home leaves once, transfers host, clears the session and returns to entry',async({page,browser})=>{
 const link=await create(page),guest=await join(browser,link,'Bea'),third=await join(browser,link,'Cora');const pages=[page,guest,third];
 try{
  for(const [width,height] of [[1440,900],[820,1180],[390,844]]){
   await page.setViewportSize({width,height});await page.mouse.move(0,100);const home=page.getByRole('button',{name:'Home',exact:true}),invite=page.getByRole('button',{name:'Invite',exact:true});
   const appearance=(el:HTMLElement)=>{const c=getComputedStyle(el),r=el.getBoundingClientRect();return {height:r.height,font:c.fontFamily,size:c.fontSize,weight:c.fontWeight,color:c.color};};
   await expect(home).toHaveCSS('color','rgb(27, 30, 67)');await expect(invite).toHaveCSS('color','rgb(27, 30, 67)');expect(await home.evaluate(appearance)).toEqual(await invite.evaluate(appearance));const h=(await home.boundingBox())!,i=(await invite.boundingBox())!,logo=(await page.locator('.lobby-wordmark').boundingBox())!;
   expect(h.x+h.width).toBeLessThan(logo.x);expect(i.x).toBeGreaterThan(logo.x+logo.width);expect(logo.x+logo.width/2).toBeCloseTo(width/2,1);expect(h.y).toBe(i.y);
   await page.screenshot({path:`artifacts/home-header-${width}.png`});
  }
  await guest.getByRole('button',{name:'Ready',exact:true}).click();await third.getByRole('button',{name:'Ready',exact:true}).click();
  let requests=0;page.on('request',r=>{if(r.url().endsWith('/leave'))requests++;});const room=state(page).room;
  let release!:()=>void;const responseGate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/leave',async route=>{await responseGate;await route.continue();},{times:1});
  await page.getByRole('button',{name:'Home',exact:true}).evaluate(el=>{(el as HTMLButtonElement).click();(el as HTMLButtonElement).click();});
  await expect(page.getByRole('button',{name:'Home',exact:true})).toBeDisabled();await expect.poll(()=>requests).toBe(1);release();
  await expect(page).toHaveURL('http://localhost:3100/');await expect(page.getByRole('button',{name:'Start',exact:true})).toBeVisible();expect(requests).toBe(1);
  for(const p of [guest,third]){await expect(p.locator('.lobby-players li')).toHaveCount(2);await expect(p.locator('.lobby-name')).toHaveText(['Bea','Cora']);}
  await expect(guest.getByRole('button',{name:'Start Game',exact:true})).toBeEnabled();await expect(guest.locator('.host-badge').locator('..')).toContainText('Bea');
  expect((await page.context().cookies()).some(c=>c.name===`ad_${room}`)).toBe(false);expect(await page.evaluate(()=>sessionStorage.getItem('archduke.pending-admission'))).toBeNull();
  await page.goto(link);await expect(page.getByRole('textbox',{name:'Name',exact:true})).toBeVisible();await expect(page.locator('.room-lobby')).toHaveCount(0);
  await third.getByRole('button',{name:'Home',exact:true}).click();await expect(guest.locator('.lobby-name')).toHaveText(['Bea']);expect(state(guest).host).toBe(state(guest).you);await expect(guest.getByRole('button',{name:'Start Game',exact:true})).toBeDisabled();
  await guest.getByRole('button',{name:'Home',exact:true}).click();await expect(guest).toHaveURL('http://localhost:3100/');const response=await guest.request.get(`/api/room/${room}`);expect(response.status()).toBe(404);clean(pages);
 }finally{await guest.context().close();await third.context().close();}
});

test('late waiting Home leaves the active match intact and a rejected leave stays in the lobby',async({page,browser})=>{
 const link=await create(page),guest=await join(browser,link,'Bea');let late:Awaited<ReturnType<typeof join>>|undefined;
 try{
  await page.route('**/leave',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Could not leave the room. Try again.'})}),{times:1});
  await page.getByRole('button',{name:'Home',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('Could not leave the room. Try again.');await expect(page.getByRole('button',{name:'Home',exact:true})).toBeEnabled();await expect(guest.locator('.lobby-players li')).toHaveCount(2);
  await page.getByRole('button',{name:'Ready',exact:true}).click();await guest.getByRole('button',{name:'Ready',exact:true}).click();await page.getByRole('button',{name:'Start Game',exact:true}).click();await expect(page.locator('.game')).toBeVisible();await expect(page.getByRole('button',{name:'Home',exact:true})).toHaveCount(0);
  const ids=state(page).players.map(p=>p.id);late=await join(browser,link,'Late');await expect(late.locator('.lobby-progress')).toBeVisible();await late.getByRole('button',{name:'Home',exact:true}).click();await expect(late).toHaveURL('http://localhost:3100/');
  expect(state(page).players.map(p=>p.id)).toEqual(ids);expect(state(page).paused).toBeUndefined();await expect(guest.locator('.game')).toBeVisible();
 }finally{await guest.context().close();await late?.context().close();}
});
