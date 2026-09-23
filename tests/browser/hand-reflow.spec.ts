import { test, expect, type Page } from '@playwright/test';
import { createApp } from '../../src/server/app';
import { config } from '../../src/server/config';
import { assertCards, deck } from '../../src/engine/model';
import { addToHand } from '../../src/engine/hand';
import { create, join, state, clean } from './helpers';

async function setup(page:Page,browser:Parameters<typeof join>[0],count:number){
 let now=Date.now();const app=createApp(config({PUBLIC_ORIGIN:'http://localhost:3102',PORT:'3102',NODE_ENV:'test'}),undefined,{now:()=>now,randomInt:n=>n-1,motion:500,delay:1000,peek:3000,grace:60000,restart:1000});
 await new Promise<void>(r=>app.http.listen(3102,r));const link=await create(page,'http://localhost:3102'),pages=[page];for(let i=1;i<count;i++)pages.push(await join(browser,link,`Player ${i}`));
 const room=app.rooms.rooms.get(state(page).room)!;
 for(const p of pages){await p.clock.install({time:now-1000});await p.clock.pauseAt(now);await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));}
 async function advance(ms:number){now+=ms;await app.rooms.timers();await Promise.all(pages.map(p=>p.clock.runFor(ms)));for(const p of pages){await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect.poll(()=>state(p).serverNow).toBe(now);}}
 await app.rooms.transaction(room,({state:s})=>{
  const cards=deck(),take=(v:number)=>cards.splice(cards.findIndex(c=>c.value===v),1)[0];s.players.forEach((p,i)=>{p.slots=[];for(const value of i?[2,3,4,5]:[2,7,7,7,7,7,7])addToHand(p,{rev:1,card:take(value)});});
  s.game=1;s.round=1;s.phase='INTER_TURN';s.open=true;s.window='window';s.next=s.players[1].id;s.discard=[take(7)];s.deck=cards;s.seq++;assertCards(s);
 });
 await expect(page.locator('.own [data-slot]')).toHaveCount(7);await advance(500);
 return {app,room,pages,advance,close:async()=>{for(const p of pages.slice(1))await p.context().close();await app.close();}};
}

for(const [count,width,height] of [[2,1440,900],[6,820,1180],[6,1180,820]])test(`${count} players at ${width}×${height}: stable holes and live overflow reflow`,async({page,browser})=>{
 await page.setViewportSize({width,height});const f=await setup(page,browser,count);try{
  await expect(page.locator('.game')).toHaveAttribute('data-layout-width',String(width));await expect(page.locator('.game')).toHaveAttribute('data-layout-height',String(height));await expect.poll(async()=>{await f.advance(500);return page.locator('.game').getAttribute('class');}).not.toMatch(/resizing/);
  const owner=state(page).you,seat=(p:Page)=>p.locator(`[data-seat="${owner}"]`),grid=(p:Page)=>seat(p).locator('.hand .card-grid');
  const nodes=await seat(page).locator('[data-slot]').elementHandles(),ids=f.room.data.state.players[0].slots.map(s=>s.card!.id);
  const geometry=async(p:Page)=>grid(p).evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,cards:[...el.querySelectorAll<HTMLButtonElement>('.card:not(.hole)')].map(c=>{const b=c.getBoundingClientRect();return {index:Number(c.dataset.slot),row:Number(c.dataset.row),column:Number(c.dataset.column),x:b.x-r.x,y:b.y-r.y,width:b.width,height:b.height,targetX:parseFloat(c.style.getPropertyValue('--slot-x')),targetY:parseFloat(c.style.getPropertyValue('--slot-y'))};})};});
  async function verify(count:number){
   for(const p of f.pages){await expect(seat(p).locator('.card-grid>.card:not(.hole)')).toHaveCount(count);const view=state(p).players.find(q=>q.id===owner)!;expect(view.columns).toBe(Math.max(2,Math.ceil(count/2)));expect(view.slots.every(s=>s.value===undefined)).toBe(true);}
   await page.mouse.move(0,0);
   // The existing CSS transition remains the only reflow mechanism.
   for(const p of [page,f.pages[1]])await expect.poll(async()=>{const g=await geometry(p);return g.cards.every(c=>Math.abs(c.x-c.targetX)<.2&&Math.abs(c.y-c.targetY)<.2);}).toBe(true);
   const a=state(page).players.find(p=>p.id===owner)!,b=state(f.pages[1]).players.find(p=>p.id===owner)!;expect(a.slots).toEqual(b.slots);
   for(const p of [page,f.pages[1]]){const g=await geometry(p);for(const c of g.cards){expect(c.width/c.height).toBeCloseTo(5/7,2);expect(Math.abs(c.y-c.targetY)).toBeLessThan(.2);expect(c.x+c.width).toBeLessThanOrEqual(g.width+.2);}}
   for(const [i,node] of nodes.entries())expect(await node.evaluate((el,index)=>el===document.querySelector(`.own [data-slot="${index}"]`),i)).toBe(true);
   assertCards(f.room.data.state);
  }
  async function match(index:number,remaining:number){
   if(remaining===6)await seat(page).locator('[data-slot="4"]').evaluate(el=>{
    const capture=(event:Event)=>{if((event as TransitionEvent).propertyName!=='transform')return;const a=el.getAnimations().find(a=>a instanceof CSSTransition&&a.transitionProperty==='transform');if(a){a.pause();a.currentTime=190;}el.removeEventListener('transitionrun',capture);};
    el.addEventListener('transitionrun',capture);
   });
   const target=seat(page).locator(`[data-slot="${index}"]`),bounds=await target.boundingBox();await target.click({position:{x:Math.max(3,12-bounds!.x),y:20}});await expect.poll(()=>state(page).players[0].slots[index].occupied).toBe(false);await page.mouse.move(0,0);
   if(remaining===6){
    const moving=seat(page).locator('[data-slot="4"]');
    const motion=()=>moving.evaluate(el=>{const a=el.getAnimations().find(a=>a instanceof CSSTransition&&a.transitionProperty==='transform');if(!a)return;const timing=a.effect!.getTiming();a.pause();a.currentTime=190;return {duration:timing.duration,easing:timing.easing};});
    await expect.poll(motion).toEqual({duration:380,easing:'ease'});
    const mid=await moving.evaluate(el=>({x:new DOMMatrix(getComputedStyle(el).transform).m41,y:new DOMMatrix(getComputedStyle(el).transform).m42,targetX:parseFloat((el as HTMLElement).style.getPropertyValue('--slot-x')),targetY:parseFloat((el as HTMLElement).style.getPropertyValue('--slot-y'))}));
    expect(mid.y).toBeCloseTo(mid.targetY,1);expect(mid.x).toBeGreaterThan(mid.targetX);await page.screenshot({path:`artifacts/hand-${count}-${width}-reflow-middle.png`});await moving.evaluate(el=>el.getAnimations().forEach(a=>a.play()));
   }
   await f.advance(600);await verify(remaining);
  }
  await verify(7);const wide=await geometry(page);await match(2,6);const six=await geometry(page);expect(six.width).toBe(wide.width);expect(six.cards[2].x-six.cards[0].x).toBeGreaterThan(wide.cards[2].x-wide.cards[0].x);
  await page.screenshot({path:`artifacts/hand-${count}-${width}-six.png`});await match(6,5);await match(5,4);const four=await geometry(page);expect(four.width).toBeLessThan(six.width);expect(four.width).toBeCloseTo(four.cards[0].width*2+8,1);
  expect(f.room.data.state.players[0].slots.filter(s=>s.card).map(s=>s.card!.id)).toEqual([ids[0],ids[1],ids[3],ids[4]]);
  await page.screenshot({path:`artifacts/hand-${count}-${width}-four.png`});const before=await geometry(page);await match(1,3);const hole=seat(page).locator('[data-slot="1"]');await expect(hole).toBeDisabled();await expect(hole).toHaveCSS('visibility','hidden');await expect(hole).toHaveCSS('pointer-events','none');
  const after=await geometry(page);expect(after.width).toBe(before.width);expect(after.height).toBe(before.height);expect(after.cards).toEqual(before.cards.filter(c=>c.index!==1));expect(after.cards.find(c=>c.index===3)).toMatchObject({row:1,column:1});
  await page.screenshot({path:`artifacts/hand-${count}-${width}-hole.png`});
  async function give(remaining:number){
   await f.app.rooms.transaction(f.room,({state:s})=>{s.effects=[{id:`give-${remaining}`,actor:s.players[1].id,kind:1}];s.seq++;});
   await expect(f.pages[1].getByRole('button',{name:'Give to Ada',exact:true})).toBeEnabled();await f.pages[1].getByRole('button',{name:'Give to Ada',exact:true}).click();await expect.poll(()=>state(page).players[0].slots.filter(s=>s.occupied).length).toBe(remaining);await f.advance(600);await verify(remaining);
  }
  await give(4);const filled=await geometry(page);expect(filled.cards.find(c=>c.index===7)).toMatchObject({row:1,column:0});expect(filled.cards.filter(c=>c.index!==7)).toEqual(after.cards);
  await give(5);const five=await geometry(page);expect(five.cards.filter(c=>c.row===0)).toHaveLength(3);expect(five.cards.filter(c=>c.row===1)).toHaveLength(2);expect(five.width).toBe(six.width);
  await page.screenshot({path:`artifacts/hand-${count}-${width}-five.png`});clean(f.pages);
 }finally{await f.close();}
});

for(const scenario of ['top-left','bottom-left','bottom-longer'] as const)test(`row-preserving ${scenario}, then stable four-card threshold`,async({page,browser})=>{
 const f=await setup(page,browser,2);try{
  const owner=state(page).you;
  await f.app.rooms.transaction(f.room,({state:s})=>{
   const p=s.players[0];s.deck.push(p.slots[0].card!);p.slots[0].card=s.deck.splice(s.deck.findIndex(c=>c.value===7),1)[0];
   for(const slot of p.slots.slice(5)){s.deck.push(slot.card!);slot.card=undefined;slot.rev++;}
   p.columns=3;
   if(scenario==='bottom-longer')p.slots.slice(0,5).forEach((slot,i)=>{slot.row=i===0?0:1;slot.column=i===0?0:i-1;});
   s.seq++;assertCards(s);
  });await f.advance(500);await page.mouse.move(0,0);
  await expect.poll(()=>page.locator('.own .card:not(.hole)[data-slot]').evaluateAll(els=>els.every(el=>{const t=new DOMMatrix(getComputedStyle(el).transform);return Math.abs(t.m41-parseFloat((el as HTMLElement).style.getPropertyValue('--slot-x')))<.2;}))).toBe(true);
  const rowIds=()=>[0,1].map(row=>state(page).players[0].slots.filter(s=>s.occupied&&s.row===row).sort((a,b)=>a.column-b.column).map(s=>s.index));
  const expected=scenario==='top-left'?[[2,4],[1,3]]:scenario==='bottom-left'?[[0,2],[3,4]]:[[0,3],[1,2]];
  const removed=scenario==='top-left'?0:scenario==='bottom-left'?1:4;
  const bottoms=await page.locator('.own [data-row="1"]:not(.hole)').evaluateAll(els=>els.map(el=>({id:(el as HTMLElement).dataset.slot,x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y})));
  await page.locator(`.own [data-slot="${removed}"]`).click({position:{x:10,y:20}});await expect.poll(rowIds).toEqual(expected);await page.mouse.move(0,0);await f.advance(600);
  for(const p of f.pages){
   const hand=p.locator(`[data-seat="${owner}"] .hand .card-grid`);await expect(hand.locator('.card:not(.hole)')).toHaveCount(4);
   await expect.poll(()=>hand.evaluate(el=>[...el.querySelectorAll<HTMLElement>('.card:not(.hole)')].every(c=>Math.abs(new DOMMatrix(getComputedStyle(c).transform).m41-parseFloat(c.style.getPropertyValue('--slot-x')))<.2))).toBe(true);
  }
  if(scenario==='top-left')expect(await page.locator('.own [data-row="1"]:not(.hole)').evaluateAll(els=>els.map(el=>({id:(el as HTMLElement).dataset.slot,x:el.getBoundingClientRect().x,y:el.getBoundingClientRect().y})))).toEqual(bottoms);
  const stable=await page.locator('.own .card:not(.hole)[data-slot]').evaluateAll(els=>els.map(el=>({id:(el as HTMLElement).dataset.slot,x:(el as HTMLElement).style.getPropertyValue('--slot-x'),y:(el as HTMLElement).style.getPropertyValue('--slot-y')})));
  const bottomLeft=expected[1][0];await page.locator(`.own [data-slot="${bottomLeft}"]`).click({position:{x:10,y:20}});await expect.poll(()=>state(page).players[0].slots.filter(s=>s.occupied).length).toBe(3);await f.advance(600);
  expect(await page.locator('.own .card:not(.hole)[data-slot]').evaluateAll(els=>els.map(el=>({id:(el as HTMLElement).dataset.slot,x:(el as HTMLElement).style.getPropertyValue('--slot-x'),y:(el as HTMLElement).style.getPropertyValue('--slot-y')})))).toEqual(stable.filter(c=>c.id!==String(bottomLeft)));
  await page.screenshot({path:`artifacts/row-preserving-${scenario}.png`});clean(f.pages);
 }finally{await f.close();}
});
