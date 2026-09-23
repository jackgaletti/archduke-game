import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { observe,state } from './helpers';

test('name-only creation, branded invite entry, seat reconnect, and landing code/link joining',async({browser,page})=>{
 mkdirSync('artifacts',{recursive:true});observe(page);await page.context().grantPermissions(['clipboard-read','clipboard-write']);
 await page.goto('/');await expect(page.locator('.home')).toHaveCSS('background-color','rgb(203, 215, 229)');await expect(page.locator('.home input')).toHaveCount(1);await expect(page.getByPlaceholder('Name',{exact:true})).toBeVisible();await expect(page.locator('.home label')).toHaveCount(0);
 await page.getByRole('textbox',{name:'Name',exact:true}).fill('Creator');
 const creation=page.waitForRequest('**/api/create');await page.getByRole('button',{name:'Start',exact:true}).click();
 expect(Object.keys((await creation).postDataJSON()).sort()).toEqual(['id','name']);
 await expect(page.locator('.lobby-players li')).toHaveCount(1);const roomURL=page.url();const hostSeat=state(page).you;
 await expect(page.getByRole('button',{name:'Ready',exact:true})).toBeVisible();
 const code=state(page).code;await page.getByRole('button',{name:'Invite',exact:true}).click();
 const link=await page.evaluate(()=>navigator.clipboard.readText());expect(link).toMatch(/\/invite\/[\w-]+$/);
 const guestContext=await browser.newContext();const guest=await guestContext.newPage();observe(guest);await guest.goto(link);
 await expect(guest.locator('.home')).toHaveCSS('background-color','rgb(203, 215, 229)');await expect(guest.locator('.invite-entry')).toBeVisible();await expect(guest.locator('.archduke-logo')).toHaveText('Archduke');await expect(guest.locator('.landing-graphic img')).toHaveCount(1);
 await expect(guest.locator('input')).toHaveCount(1);await expect(guest.locator('button')).toHaveCount(1);
 await guest.screenshot({path:'artifacts/invite-name-desktop.png',fullPage:true});await guest.setViewportSize({width:320,height:568});
 await guest.screenshot({path:'artifacts/invite-name-mobile.png',fullPage:true});expect(await guest.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
 await guest.getByRole('textbox',{name:'Name',exact:true}).fill('Friend');await guest.getByRole('button',{name:'Join',exact:true}).click();await expect(guest).toHaveURL(roomURL);
 await expect(guest.locator('.lobby-players li')).toHaveCount(2);const guestSeat=state(guest).you;expect(guestSeat).not.toBe(hostSeat);
 await expect(guest.getByRole('button',{name:'Start',exact:true})).toHaveCount(0);
 await guest.reload();await expect(guest.locator(`.lobby-players [data-player="${guestSeat}"] .lobby-name`)).toHaveText('Friend');await expect(guest.getByRole('dialog')).toHaveCount(0);
 await guest.goto(link);await expect(guest).toHaveURL(roomURL);await expect(guest.locator(`.lobby-players [data-player="${guestSeat}"] .lobby-name`)).toHaveText('Friend');await expect(guest.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.lobby-players li')).toHaveCount(2);
 // Keep all seats connected while independently exercising both landing entry formats.
 const landingContexts=[];
 for(const [i,invitation] of [code,link].entries()){
  const context=await browser.newContext();landingContexts.push(context);const landing=await context.newPage();await landing.goto(new URL(roomURL).origin);await landing.getByRole('textbox',{name:'Name',exact:true}).fill(`Landing ${i}`);
  await landing.getByRole('button',{name:'Join',exact:true}).click();await expect(landing.getByRole('textbox',{name:'Name',exact:true})).toHaveValue(`Landing ${i}`);
  await landing.getByLabel('Invitation link or room code').fill(invitation);if(i===0)await landing.getByLabel('Invitation link or room code').press('Enter');else await landing.getByRole('button',{name:'Join',exact:true}).click();await expect(landing).toHaveURL(roomURL);await expect(landing.locator('.lobby-name').filter({hasText:`Landing ${i}`})).toHaveText(`Landing ${i}`);
 }
 await expect(page.locator('.lobby-players li')).toHaveCount(4);await expect(page.locator(`.lobby-players [data-player="${hostSeat}"] .lobby-name`)).toHaveText('Creator');
 await page.goto(link);await expect(page).toHaveURL(roomURL);await expect(page.locator(`.lobby-players [data-player="${hostSeat}"] .lobby-name`)).toHaveText('Creator');await expect(page.getByRole('dialog')).toHaveCount(0);
 await guestContext.close();for(const context of landingContexts)await context.close();
});

test('production logo/font and original GIF fit desktop/mobile with a still reduced-motion alternative',async({page})=>{
 mkdirSync('artifacts',{recursive:true});const font=page.waitForResponse('**/fonts/dela-gothic-one-logo.ttf');const gif=page.waitForResponse('**/graphics/graphic_1.gif');await page.goto('/');
 expect((await font).ok()).toBe(true);expect((await gif).headers()['content-type']).toContain('image/gif');expect(await (await gif).body()).toEqual(readFileSync('public/graphics/graphic_1.gif'));
 await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.fonts.check('63px "Dela Gothic One"','ARCHDUKE'))).toBe(true);
 const logo=page.locator('.archduke-logo');await expect(logo).toHaveCSS('color','rgb(27, 30, 67)');await expect(logo).toHaveCSS('font-family','"Dela Gothic One", cursive');await expect(logo).toHaveCSS('font-size','63px');
 expect(await page.locator('.landing-graphic img').evaluate((img:HTMLImageElement)=>[img.naturalWidth,img.naturalHeight])).toEqual([1200,1200]);
 await expect(page.locator('.home img')).toHaveCount(1);await expect(page.locator('.home button')).toHaveCount(2);await expect(page.locator('.home a')).toHaveCount(0);
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844],['narrow',320,568]] as const){
  await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  const dimensions=await logo.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  const group=await page.locator('.home-group').boundingBox();expect(group!.x).toBeGreaterThanOrEqual(0);expect(group!.y).toBeGreaterThanOrEqual(0);expect(group!.y+group!.height).toBeLessThanOrEqual(height);
  await page.screenshot({path:`artifacts/entry-${label}.png`,fullPage:true});
 }
 const firstFrame=await page.locator('.landing-graphic').screenshot();await expect.poll(async()=>!firstFrame.equals(await page.locator('.landing-graphic').screenshot()),{timeout:5000}).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await expect.poll(()=>page.locator('.landing-graphic img').evaluate((img:HTMLImageElement)=>img.currentSrc)).toContain('/graphic_1-still.png');
 await page.screenshot({path:'artifacts/entry-reduced-motion.png',fullPage:true});
});
