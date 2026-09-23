import { test, expect, type Page } from '@playwright/test';
import { createApp } from '../../src/server/app';
import { config } from '../../src/server/config';
import { assertCards, deck } from '../../src/engine/model';
import { create, join, state, clean } from './helpers';

async function setup(page:Page,browser:Parameters<typeof join>[0],reduced=false){
 let now=Date.now();const app=createApp(config({PUBLIC_ORIGIN:'http://localhost:3102',PORT:'3102',NODE_ENV:'test'}),undefined,{now:()=>now,randomInt:n=>n-1,motion:500,delay:1000,peek:3000,grace:60000,restart:1000});
 await new Promise<void>(resolve=>app.http.listen(3102,resolve));
 const link=await create(page,'http://localhost:3102'),guest=await join(browser,link,'Bea'),pages=[page,guest],room=app.rooms.rooms.get(state(page).room)!;
 for(const p of pages){await p.clock.install({time:now-1000});await p.clock.pauseAt(now);await p.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));}
 async function advance(ms:number){now+=ms;await app.rooms.timers();await Promise.all(pages.map(p=>p.clock.runFor(ms)));for(const p of pages){await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect.poll(()=>state(p).serverNow).toBe(now);}}
 await app.rooms.transaction(room,({state:s})=>{const cards=deck(),take=(v:number)=>cards.splice(cards.findIndex(c=>c.value===v),1)[0];s.players.forEach(p=>{p.slots=[2,3,7,4].map((v,i)=>({card:take(v),rev:1,row:i%2,column:Math.floor(i/2)}));p.columns=2;});s.game=1;s.round=1;s.phase='INTER_TURN';s.open=true;s.window='window';s.next=s.players[1].id;s.discard=[take(7)];const top=take(7);s.deck=[...cards,top];s.seq++;});
 for(const p of pages)await expect(p.locator('.own [data-slot]')).toHaveCount(4);await advance(500);
 const send=(p:Page,action:object)=>app.rooms.command(room,state(p).you,room.controllers.get(state(p).you)!,{id:crypto.randomUUID(),game:state(p).game,round:state(p).round,...action});
 return {app,room,guest,pages,advance,now:()=>now,send,close:async()=>{await guest.context().close();await app.close();}};
}

for(const reduced of [false,true])for(const late of [false,true])test(`${late?'late':'incorrect'} flip, shake, close and land (${reduced?'reduced':'full'} motion) without blocking turns`,async({browser,page})=>{
 const f=await setup(page,browser,reduced);try{
  const {guest,pages}=f,index=late?2:0,slot=page.locator(`.own [data-slot="${index}"]`),node=await slot.elementHandle(),face=slot.locator('.card-face');
  const hand=await page.locator('.own .card-grid').boundingBox(),before=await slot.boundingBox(),layoutTransform=await slot.evaluate(el=>getComputedStyle(el).transform);
  if(late){const command=f.app.rooms.command.bind(f.app.rooms);f.app.rooms.command=async(...args)=>{if((args[3] as {type:string}).type==='match'){f.app.rooms.command=command;await f.send(guest,{type:'draw',source:'draw',window:state(guest).window,turn:state(guest).turn});}return command(...args);};}
  await slot.click();await expect.poll(()=>state(page).invalidMatches?.length).toBe(1);const event=state(page).invalidMatches![0];expect(event.reason).toBe(late?'late':'incorrect');
  for(const p of pages){await expect.poll(()=>state(p).players[0].slots.length).toBe(5);await expect(p.locator(`[data-seat="${state(page).you}"] [data-slot]`)).toHaveCount(4);await expect(p.locator('.invalid-penalty-flight')).toHaveCount(0);expect(state(p).invalidMatches![0]).toEqual(event);expect(state(p).players[0].slots.at(-1)!.value).toBeUndefined();}
  await expect(face).toHaveAttribute('data-invalid-phase','flip-up');await expect(face.locator('.card-front img')).toHaveAttribute('alt',`Card ${late?7:2}`);expect(await node!.evaluate((el,i)=>el===document.querySelector(`.own [data-slot="${i}"]`),index)).toBe(true);
  // The next player draws while the reveal is still starting.
  if(!late){await expect(guest.locator('[data-endpoint=draw]')).toBeEnabled();await guest.locator('[data-endpoint=draw]').click();}
  await expect.poll(()=>state(guest).held?.owner).toBe(state(guest).you);expect(state(page).held?.value).toBeUndefined();
  await f.advance(360);await expect(face).toHaveAttribute('data-invalid-phase','shake');await expect(page.locator('.invalid-penalty-flight')).toHaveCount(0);
  const shake=await face.evaluate(el=>el.getAnimations().map(a=>({timing:a.effect!.getTiming(),frames:(a.effect as KeyframeEffect).getKeyframes()})).find(a=>a.timing.duration===360&&a.timing.delay===360)!);
  expect(shake.timing.delay).toBe(360);if(!reduced)expect(shake.frames.map(frame=>parseFloat(String(frame.translate)))).toEqual([0,-6,6,-4,4,0]);
  await f.advance(180);expect(await face.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m11)).toBeCloseTo(-1,1);await page.screenshot({path:`artifacts/invalid-${late?'late':'wrong'}-${reduced?'reduced':'full'}-shake.png`});expect(await slot.evaluate(el=>getComputedStyle(el).transform)).toBe(layoutTransform);expect((await slot.boundingBox())!.x).toBe(before!.x);expect(await page.locator('.own .card-grid').boundingBox()).toEqual(hand);
  await guest.locator('[data-endpoint=discard]').click();await expect.poll(()=>state(page).turn).toBe(1);expect(state(page).invalidMatches![0].id).toBe(event.id);await expect(face).toHaveAttribute('data-invalid-phase','shake');
  await f.advance(180);await expect(face).toHaveAttribute('data-invalid-phase','flip-down');await expect(page.locator('.invalid-penalty-flight')).toHaveCount(0);
  await f.advance(360);const flight=page.locator('.invalid-penalty-flight');await expect(flight).toHaveCount(1);await expect(face.locator('.card-front img')).toHaveCount(0);await expect(page.locator('.own [data-slot]')).toHaveCount(4);expect(await page.locator('.own .card-grid').boundingBox()).toEqual(hand);
  const source=await page.locator('[data-endpoint=draw]').boundingBox(),geometry=await flight.evaluate(el=>{const s=(el as HTMLElement).style,frames=(el.getAnimations()[0].effect as KeyframeEffect).getKeyframes(),last=new DOMMatrix(String(frames.at(-1)!.transform));return {x:parseFloat(s.left),y:parseFloat(s.top),width:parseFloat(s.width),height:parseFloat(s.height),dx:last.m41,dy:last.m42,sx:last.m11,sy:last.m22};});
  expect(geometry.x).toBeCloseTo(source!.x,2);expect(geometry.y).toBeCloseTo(source!.y,2);await expect(flight).toHaveCSS('pointer-events','none');expect(await flight.locator('img').evaluateAll(images=>images.every(img=>(img as HTMLImageElement).src.includes('back')))).toBe(true);
  await f.advance(250);if(!reduced){const mid=await flight.boundingBox();expect(mid!.x).toBeLessThan(source!.x);expect(mid!.x).toBeGreaterThan(geometry.x+geometry.dx);}await page.screenshot({path:`artifacts/invalid-${late?'late':'wrong'}-${reduced?'reduced':'full'}-flight.png`});await expect(page.locator('.own [data-slot="4"]')).toHaveCount(0);
  await f.advance(250);const arrived=page.locator('.own [data-slot="4"]');await expect(arrived).toHaveCount(1);await expect(flight).toHaveCount(0);const landed=await arrived.boundingBox();
  expect(landed!.x).toBeCloseTo(geometry.x+geometry.dx,1);expect(landed!.y).toBeCloseTo(geometry.y+geometry.dy,1);expect(landed!.width).toBeCloseTo(geometry.width*geometry.sx,1);expect(landed!.height).toBeCloseTo(geometry.height*geometry.sy,1);await expect(arrived.locator('.card-front img')).toHaveCount(0);expect(await node!.evaluate(el=>el.isConnected)).toBe(true);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await f.advance(200);await expect(page.locator('.invalid-penalty-flight')).toHaveCount(0);await expect(page.locator('.own [data-slot]')).toHaveCount(5);assertCards(f.room.data.state);await page.screenshot({path:`artifacts/invalid-${late?'late':'wrong'}-${reduced?'reduced':'full'}-landed.png`});clean(pages);
 }finally{await f.close();}
});

test('per-player penalty queues overlap across players, survive state changes, and settle on reconnect',async({browser,page})=>{
 const f=await setup(page,browser);try{
  const {guest,pages}=f;
  const batch={type:'match',window:state(page).window,slots:[0,1].map(slot=>({player:state(page).you,slot,rev:1}))};await f.send(page,batch);await f.send(guest,{type:'match',window:state(guest).window,slots:[{player:state(guest).you,slot:0,rev:1}]});
  await expect.poll(()=>state(page).invalidMatches?.length).toBe(3);const [a,b,c]=state(page).invalidMatches!;expect(a.end).toBe(b.start);expect(c.start).toBe(a.start);await expect(page.locator('.own [data-slot]')).toHaveCount(4);await expect(page.locator('.opponent [data-slot]')).toHaveCount(4);
  // A successful match and its unchanged motion can overlap these sequences.
  await page.locator('.own [data-slot="2"]').click();await expect(page.locator('.own [data-slot="2"]')).toHaveClass(/hole/);await expect(page.locator('.flying-card[data-motion=match]')).toHaveCount(1);
  await f.advance(1080);await expect(page.locator('.invalid-penalty-flight')).toHaveCount(2);await f.advance(500);await expect(page.locator('.invalid-penalty-flight')).toHaveCount(0);await expect(page.locator('.own [data-slot]')).toHaveCount(5);await expect(page.locator('.opponent [data-slot]')).toHaveCount(5);await expect(page.locator('.own [data-slot="1"] .card-face')).toHaveAttribute('data-invalid-phase','flip-up');
  // A refresh midway safely materializes all authoritative cards without replay.
  await guest.reload();await expect(guest.locator('.own [data-slot]')).toHaveCount(5);await expect(guest.locator('.opponent [data-slot]')).toHaveCount(6);await expect(guest.locator('.invalid-penalty-flight')).toHaveCount(0);await expect(guest.locator('[data-invalid-phase]')).toHaveCount(0);
  await f.advance(b.end-f.now()+50);await expect(page.locator('.own [data-slot]')).toHaveCount(6);await expect(page.locator('.invalid-penalty-flight')).toHaveCount(0);await expect(page.locator('.own .card-front img')).toHaveCount(0);assertCards(f.room.data.state);clean(pages);
 }finally{await f.close();}
});
