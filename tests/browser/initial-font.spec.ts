import { test,expect } from '@playwright/test';

test('cold entry never paints the fallback font while either local font subset is pending',async({page})=>{
 let normal!:()=>void,logo!:()=>void;
 const normalGate=new Promise<void>(r=>normal=r),logoGate=new Promise<void>(r=>logo=r),requested=new Set<string>();
 await page.route('**/fonts/*.ttf',async route=>{const path=new URL(route.request().url()).pathname;requested.add(path);await (path.endsWith('-logo.ttf')?logoGate:normalGate);await route.continue();});
 await page.addInitScript(()=>{
  const samples:boolean[]=[];(window as unknown as {fontSamples:boolean[]}).fontSamples=samples;
  new MutationObserver(()=>{if(document.querySelector('#root')?.textContent?.trim())samples.push(document.fonts.check('400 16px "Dela Gothic One"','ARCHDUKE Name Start Join'));}).observe(document,{childList:true,subtree:true});
 });
 try{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect.poll(()=>requested.size).toBe(2);
  await expect(page.locator('link[rel="preload"][as="font"]')).toHaveCount(2);
  await expect(page.locator('#root')).toBeEmpty();await expect(page.locator('html')).toHaveCSS('background-color','rgb(203, 215, 229)');
  normal();await expect.poll(()=>page.evaluate(()=>Array.from(document.fonts).filter(f=>f.status==='loaded').length)).toBe(1);
  await expect(page.locator('#root')).toBeEmpty();
  logo();await expect(page.getByRole('button',{name:'Start',exact:true})).toBeVisible();
  const samples=await page.evaluate(()=>(window as unknown as {fontSamples:boolean[]}).fontSamples);expect(samples.length).toBeGreaterThan(0);expect(samples.every(Boolean)).toBe(true);
  for(const el of [page.locator('.archduke-logo'),page.getByRole('textbox',{name:'Name',exact:true}),page.getByRole('button',{name:'Start',exact:true}),page.getByRole('button',{name:'Join',exact:true})])await expect(el).toHaveCSS('font-family','"Dela Gothic One", cursive');
  await page.screenshot({path:'artifacts/initial-font-ready.png'});
 }finally{normal();logo();}
});
