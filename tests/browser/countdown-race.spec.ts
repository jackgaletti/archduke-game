import { test, expect, type Locator } from '@playwright/test';
import { createApp } from '../../src/server/app';
import { config } from '../../src/server/config';
import { deck } from '../../src/engine/model';
import { create, join, start, state, clean, observe } from './helpers';

const metrics=(button:Locator)=>button.evaluate(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {width:r.width,height:r.height,padding:s.padding,borderWidth:s.borderWidth,borderStyle:s.borderStyle,radius:s.borderRadius,shadow:s.boxShadow,font:s.fontFamily,size:s.fontSize,weight:s.fontWeight,lineHeight:s.lineHeight,x:r.x,y:r.y};});
const colors=(button:Locator)=>button.evaluate(el=>{const s=getComputedStyle(el);return {color:s.color,background:s.backgroundColor,border:s.borderColor,opacity:s.opacity};});

test('server countdown changes only existing button text in rounds 2–4; Next shares its geometry',async({browser,page})=>{
 let now=Date.now();const app=createApp(config({PUBLIC_ORIGIN:'http://localhost:3102',PORT:'3102',NODE_ENV:'test'}),undefined,{now:()=>now,randomInt:n=>n-1,motion:500,delay:1000,peek:3000,grace:60000,restart:1000});
 await new Promise<void>(resolve=>app.http.listen(3102,resolve));const pages=[page];
 try{
  const link=await create(page,'http://localhost:3102');pages.push(await join(browser,link,'Bea'));const guest=pages[1],room=app.rooms.rooms.get(state(page).room)!;
  for(const p of pages){await p.clock.install({time:now-1000});await p.clock.pauseAt(now);await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));}
  async function advance(ms:number){now+=ms;await app.rooms.timers();await Promise.all(pages.map(p=>p.clock.runFor(ms)));for(const p of pages){await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect.poll(()=>state(p).serverNow).toBe(now);}}
  await start(pages);expect(state(page).roundStartsAt).toBeUndefined();await expect(page.locator('.archduke-button')).toHaveText('ARCHDUKE!');
  const seed=async(previous:number,results=false)=>app.rooms.transaction(room,({state:s})=>{s.phase=results?'ROUND_RESULTS':'LOBBY';s.round=previous;s.betweenRounds=!results;s.roundStartsAt=undefined;s.initialPeek=undefined;s.deck=deck();s.discard=[];s.movements=[];s.visualUntil=now;s.unlockAt=now;s.restartAt=0;s.paused=undefined;s.history=Array.from({length:previous},()=>s.players.map((p,i)=>({player:p.id,sum:i+10,count:4,lowest:i+1,place:i+1,tie:''})));s.players.forEach(p=>{p.slots=[];p.ready=false;p.reviewingResults=results;p.viewingLeaderboard=false;});s.seq++;});
  for(const previous of [1,2,3]){
   await seed(previous);await expect(page.locator('.game')).toHaveAttribute('data-phase','LOBBY');
   for(const [width,height] of previous===1?[[1280,800],[1440,900],[1920,1080],[820,1180],[1180,820],[390,844]]:[[1440,900]]){
    await page.setViewportSize({width,height});await expect.poll(()=>page.locator('.game').evaluate(el=>Number((el as HTMLElement).dataset.layoutWidth)===el.clientWidth&&Number((el as HTMLElement).dataset.layoutHeight)===el.clientHeight)).toBe(true);await advance(500);const shape=await metrics(page.locator('.archduke-button'));
    await seed(previous,true);const next=page.locator('.round-next');await expect(next).toHaveText('Next');await expect(next).toHaveCSS('text-transform','none');expect(await metrics(next)).toEqual(shape);await expect(next).toHaveCSS('background-color','rgb(27, 30, 67)');await page.screenshot({path:`artifacts/next-header-${width}.png`});
    await seed(previous);await expect(page.locator('.archduke-button')).toHaveText('ARCHDUKE!');
   }
   // Traverse the real results -> podium -> waiting path before Ready.
   await seed(previous,true);for(const p of pages){await p.getByRole('button',{name:'Next',exact:true}).click();await expect(p.getByRole('dialog')).toBeVisible();await p.getByRole('button',{name:'Next',exact:true}).click();await expect(p.getByRole('button',{name:'Ready',exact:true})).toBeVisible();}
   await expect(page.locator('.game')).toHaveAttribute('data-phase','LOBBY');
   await page.setViewportSize({width:1440,height:900});await expect(page.locator('.game')).toHaveAttribute('data-layout-height','900');await expect(page.locator('.game')).toHaveAttribute('data-layout-width','1440');await advance(500);
   await expect(page.locator('.archduke-button')).toHaveCSS('background-color','rgb(227, 233, 240)');await expect(page.locator('.archduke-button')).toHaveCSS('color','rgb(100, 115, 139)');
   const button=page.locator('.archduke-button'),node=await button.elementHandle(),shape=await metrics(button),paint=await colors(button);
   await page.getByRole('button',{name:'Ready',exact:true}).click();expect(state(page).roundStartsAt).toBeUndefined();await guest.getByRole('button',{name:'Ready',exact:true}).click();await expect.poll(()=>!!state(page).roundStartsAt).toBe(true);await expect.poll(()=>state(guest).roundStartsAt).toBe(state(page).roundStartsAt);
   async function numeral(value:string){for(const p of pages){await expect(p.locator('.archduke-button')).toHaveText(value);await expect(p.locator('.archduke-button')).toBeDisabled();}expect(await metrics(button)).toEqual(shape);expect(await colors(button)).toEqual(paint);expect(await node!.evaluate(el=>el===document.querySelector('.archduke-button'))).toBe(true);await expect(page.locator('.flying-card')).toHaveCount(0);for(const p of pages){expect(state(p).phase).toBe('NEXT_ROUND_COUNTDOWN');expect(state(p).players.every(player=>player.slots.length===0)).toBe(true);expect(state(p).movements).toEqual([]);await expect(p.locator('.seat [data-slot]')).toHaveCount(0);}}
   await numeral('3');await advance(999);await numeral('3');await advance(1);await numeral('2');
   if(previous===1){
    const remaining=state(guest).roundStartsAt!-now;await guest.reload();await expect(guest.locator('.game')).toHaveAttribute('data-phase','NEXT_ROUND_COUNTDOWN');await expect.poll(()=>state(guest).players.every(p=>p.connected)&&!state(guest).paused).toBe(true);expect(state(guest).roundStartsAt!-state(guest).restartAt).toBe(remaining);
    await advance(1000);await numeral('2');
   }
   await advance(999);await numeral('2');await advance(1);await numeral('1');await advance(999);await numeral('1');await page.screenshot({path:`artifacts/round-${previous+1}-countdown.png`});await advance(1);
   await expect(page.locator('.game')).toHaveAttribute('data-phase','INITIAL_PEEK');expect(state(page).round).toBe(previous+1);expect(state(page).movements.filter(m=>m.kind==='deal')).toHaveLength(8);expect(state(page).movements.every(m=>m.end-m.start===500)).toBe(true);await expect(button).toHaveText('1');expect(await node!.evaluate(el=>el===document.querySelector('.archduke-button'))).toBe(true);
   await advance(620);await expect(button).toHaveText('ARCHDUKE!');expect(await metrics(button)).toEqual(shape);await expect(page.locator('.own .card-front img')).toHaveCount(2);await expect(guest.locator('.opponent .card-front img')).toHaveCount(0);const ids=state(page).movements.map(m=>m.id);await app.rooms.timers();expect(state(page).movements.map(m=>m.id)).toEqual(ids);
  }
  clean(pages);
 }finally{for(const p of pages.slice(1))await p.context().close();await app.close();}
});

test('landing controls use the accent font and the unchanged loading state has only Loading...',async({page})=>{
 observe(page);await page.goto('/');
 for(const control of [page.getByRole('textbox',{name:'Name',exact:true}),page.getByRole('button',{name:'Start',exact:true}),page.getByRole('button',{name:'Join',exact:true})]){await expect(control).toHaveCSS('font-family','"Dela Gothic One", cursive');await expect(control).toHaveCSS('font-weight','400');await expect(control).toHaveCSS('text-transform','none');}
 await expect(page.getByPlaceholder('Name',{exact:true})).toHaveCSS('height','48px');for(const button of await page.locator('.entry-form button').all())await expect(button).toHaveCSS('height','46px');
 expect(await page.getByPlaceholder('Name',{exact:true}).evaluate(el=>getComputedStyle(el,'::placeholder').fontFamily)).toBe('"Dela Gothic One", cursive');
 await page.getByRole('textbox',{name:'Name',exact:true}).fill('Ada');await page.screenshot({path:'artifacts/landing-accent-font.png'});
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/room/*',async route=>{await gate;await route.continue();});
 try{await page.getByRole('button',{name:'Start',exact:true}).click();const loading=page.locator('.loading');await expect(loading).toHaveText('Loading...');await expect(loading.getByRole('status')).toHaveCSS('font-family','"Dela Gothic One", cursive');await expect(loading.getByRole('status')).toHaveCSS('color','rgb(27, 30, 67)');await expect(loading).toHaveCSS('background-color','rgb(203, 215, 229)');await expect(loading.locator('a,img,button')).toHaveCount(0);await page.screenshot({path:'artifacts/loading-accent-font.png'});}finally{release();}
 await expect(page.locator('.room-lobby')).toBeVisible();clean([page]);
});

test('both next-player piles enable during discard motion and a failed match cannot lock them',async({browser,page})=>{
 let now=Date.now();const app=createApp(config({PUBLIC_ORIGIN:'http://localhost:3102',PORT:'3102',NODE_ENV:'test'}),undefined,{now:()=>now,randomInt:n=>n-1,motion:500,delay:1000,peek:3000,grace:60000,restart:1000});
 await new Promise<void>(resolve=>app.http.listen(3102,resolve));const pages=[page];
 try{
  const link=await create(page,'http://localhost:3102');pages.push(await join(browser,link,'Bea'));const guest=pages[1],room=app.rooms.rooms.get(state(page).room)!;
  for(const p of pages){await p.clock.install({time:now-1000});await p.clock.pauseAt(now);await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));}
  for(const source of ['draw','discard']){
   await app.rooms.transaction(room,({state:s})=>{const cards=deck(),take=(value:number)=>cards.splice(cards.findIndex(c=>c.value===value),1)[0];s.players.forEach((p,i)=>{p.slots=(i?[3,4,5,6]:[7,2,8,9]).map((value,index)=>({rev:1,card:take(value),row:index%2,column:Math.floor(index/2)}));});s.game=1;s.round=1;s.phase='HOLDING_DRAWN_CARD';s.open=false;s.next=s.players[1].id;s.held={id:`held-${source}`,owner:s.players[1].id,source:'draw',card:take(7)};s.discard=[take(8)];s.deck=cards;s.window=`window-${source}`;s.movements=[];s.visualUntil=now;s.unlockAt=now;s.reveals=[];s.seq++;});
   await expect(guest.locator('.own .pending-card')).toBeEnabled();await guest.locator('[data-endpoint=discard]').click();await expect.poll(()=>state(page).open).toBe(true);expect(state(page).visualUntil).toBeGreaterThan(now);
   await expect(page.locator('[data-endpoint=draw]')).toBeEnabled();await expect(page.locator('[data-endpoint=discard]')).toBeEnabled();const own=page.locator('.own [data-slot="1"]');await own.click();await expect.poll(()=>state(page).players.find(p=>p.id===state(page).you)!.slots.length).toBe(5);await expect(page.locator('[data-endpoint=draw]')).toBeEnabled();await expect(page.locator('[data-endpoint=discard]')).toBeEnabled();expect(state(page).visualUntil).toBeGreaterThan(now);
   const actions:string[]=[];const command=app.rooms.command.bind(app.rooms);app.rooms.command=async(...args)=>{const input=args[3] as {type:string};if(input.type==='draw')actions.push(input.type);return command(...args);};
   await page.locator(`[data-endpoint=${source}]`).evaluate(el=>{(el as HTMLButtonElement).click();(el as HTMLButtonElement).click();});await expect.poll(()=>state(page).held?.owner).toBe(state(page).you);await expect.poll(()=>state(guest).seq).toBe(state(page).seq);expect(actions).toEqual(['draw']);expect(state(page).open).toBe(false);if(source==='draw')expect(state(guest).held?.value).toBeUndefined();else expect(state(page).held?.value).toBe(7);app.rooms.command=command;
   now+=200;await Promise.all(pages.map(p=>p.clock.runFor(200)));await page.screenshot({path:`artifacts/immediate-${source}-midflight.png`});
  }
  clean(pages);
 }finally{for(const p of pages.slice(1))await p.context().close();await app.close();}
});
