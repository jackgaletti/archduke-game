import {test,expect} from '@playwright/test';
import {createApp} from '../../src/server/app';
import {config} from '../../src/server/config';
import {project} from '../../src/engine/engine';
import {create,join,start,peek,nextActor,state,clean} from './helpers';

test('real back layers track the deck through one card and empty without moving the target',async({browser,page})=>{
 const app=createApp(config({PUBLIC_ORIGIN:'http://localhost:3102',PORT:'3102',NODE_ENV:'test'}));
 await new Promise<void>(resolve=>app.http.listen(3102,resolve));
 try{
  const link=await create(page,'http://localhost:3102');const guest=await join(browser,link,'Bea');const pages=[page,guest];await start(pages);await peek(pages);const actor=await nextActor(pages);
  const room=app.rooms.rooms.get(state(actor).room)!;const s=room.data.state;const recipient=s.players.find(p=>p.id!==state(actor).you)!;
  const target=actor.locator('[data-endpoint=draw]');const before=await target.boundingBox();await expect(actor.locator('.stack-layer')).toHaveCount(7);
  // A test-owned exhausted-deck fixture: move actual cards, preserving the multiset and privacy.
  while(s.deck.length>1){const counts=[0,1].map(row=>recipient.slots.filter(slot=>slot.card&&slot.row===row).length);const row=counts[0]<=counts[1]?0:1;recipient.slots.push({card:s.deck.pop()!,rev:0,row,column:counts[row]});recipient.columns=Math.max(recipient.columns??2,counts[row]+1);}
  s.seq++;room.publish(you=>project(s,app.rooms.deps,you));
  await expect.poll(()=>state(actor).drawCount).toBe(1);await expect(actor.locator('.stack-layer')).toHaveCount(0);await expect(target.locator('img')).toHaveCount(1);expect(await target.boundingBox()).toEqual(before);await actor.screenshot({path:'artifacts/draw-stack-one.png'});
  expect(state(actor).players.find(p=>p.id===recipient.id)!.slots.every(slot=>slot.value===undefined)).toBe(true);
  await target.click();await expect.poll(()=>state(actor).drawCount).toBe(0);await expect(actor.locator('.stack-layer')).toHaveCount(0);await expect(target.locator('img')).toHaveCount(0);expect(await target.boundingBox()).toEqual(before);await expect(actor.locator('.own .pending-card')).toBeEnabled();await actor.screenshot({path:'artifacts/draw-stack-empty.png'});
  expect(state(pages.find(p=>p!==actor)!).held?.value).toBeUndefined();await actor.locator('[data-endpoint="discard"]').click();await expect.poll(()=>state(actor).held).toBeUndefined();clean(pages);await guest.context().close();
 }finally{await app.close();}
});
