import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {create,join,start,peek,state,clean} from './helpers';
test('2–6 players retain a fixed opponent strip, larger central cards and readable responsive bounds',async({browser,page})=>{
 const measurements:object[]=[];
 for(const count of [2,3,4,5,6]){
  const link=await create(page);const pages=[page];for(let i=1;i<count;i++)pages.push(await join(browser,link,`Player ${i+1}`));if(count===6){await page.setViewportSize({width:390,height:844});await expect(page.locator('.game')).not.toHaveClass(/resizing/);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);for(const [width,height] of [[1280,800],[1440,900],[1920,1080],[820,1180],[1180,820]]){await page.setViewportSize({width,height});await expect(page.locator('.game')).not.toHaveClass(/resizing/);await expect(page.locator('.waiting-slot')).toHaveCount(24);await expect(page.locator('.card-front img')).toHaveCount(0);await page.screenshot({path:`artifacts/waiting-six-${width}x${height}.png`});}}await start(pages);await peek(pages);
  const canonical=state(page).players.map(p=>p.id);
  for(const [width,height] of [[1280,800],[1440,900],[1920,1080],[820,1180],[1180,820]]){
   for(const p of pages){await p.setViewportSize({width,height});await expect.poll(()=>p.locator('.game').evaluate(el=>Number(el.getAttribute('data-layout-width'))===el.clientWidth&&Number(el.getAttribute('data-layout-height'))===el.clientHeight)).toBe(true);await expect(p.locator('.flying-card')).toHaveCount(0);
    const index=canonical.indexOf(state(p).you),expected=[...canonical.slice(index+1),...canonical.slice(0,index)];expect(await p.locator('.opponent-strip .seat').evaluateAll(els=>els.map(el=>el.getAttribute('data-seat')))).toEqual(expected);await expect(p.locator('.personal-area .seat.own')).toHaveCount(1);await expect(p.locator('.seat.own .seat-heading')).toHaveText('You');
    const boxes=await p.locator('.card-grid,.seat-heading,.piles,.pending-card,.archduke-button,.invite-control>button').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
    for(let i=0;i<boxes.length;i++){const a=boxes[i];expect(a.x).toBeGreaterThanOrEqual(0);expect(a.y).toBeGreaterThanOrEqual(0);expect(a.right).toBeLessThanOrEqual(width+.1);expect(a.bottom).toBeLessThanOrEqual(height+.1);for(const b of boxes.slice(i+1))expect(a.right<=b.x+.1||b.right<=a.x+.1||a.bottom<=b.y+.1||b.bottom<=a.y+.1).toBe(true);}
    const cards=await p.locator('.seat.own [data-slot],.seat.own .pending-card,.pile').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height};}));for(const c of cards){expect(c.width/c.height).toBeCloseTo(5/7,3);}expect(cards[0].width).toBeGreaterThanOrEqual(100);for(const c of cards.slice(4)){expect(c.width).toBeCloseTo(cards[4].width,1);expect(c.width).toBeGreaterThan(cards[0].width*1.35);}
    for(const seat of await p.locator('.seat.opponent').all()){const name=await seat.locator('.seat-heading').boundingBox(),hand=await seat.locator('.card-grid').boundingBox();expect(name!.x+name!.width/2).toBeCloseTo(hand!.x+hand!.width/2,1);}await expect(p.locator('.turn-seat .name-mark')).toHaveCSS('color','rgb(27, 30, 67)');if(count===6&&p===page)measurements.push({width,height,hand:cards[0],pending:cards[4],draw:cards[5],discard:cards[6]});await expect(p.locator('.turn-seat')).toHaveAttribute('data-seat',state(p).next);await expect(p.locator('.archduke-button')).toHaveCSS('font-weight','400');expect(await p.evaluate(()=>document.fonts.check('20px "Dela Gothic One"'))).toBe(true);
   }
   await page.screenshot({path:`artifacts/strip-${count}-${width}x${height}.png`});
  }
  if(count===6){const guest=pages[5],id=state(guest).you;await guest.reload();await expect(guest.locator('.seat.own')).toHaveAttribute('data-seat',id);await expect(guest.locator('.opponent-strip .seat')).toHaveCount(5);}
  clean(pages);for(const p of pages.slice(1))await p.context().close();
 }
 writeFileSync('artifacts/central-card-measurements.json',JSON.stringify(measurements,null,2));
});
