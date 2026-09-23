import { randomInt } from 'node:crypto';
import type { Page } from '@playwright/test';
import { createApp } from '../../src/server/app';
import { config } from '../../src/server/config';
import { state } from './helpers';

// Test-owned clock: skip only the new pre-round wait; all existing motion still
// runs normally. No clock controls or test endpoints enter the application.
export async function roundServer(){
 let offset=0;const now=()=>Date.now()+offset;
 const cfg=config({PUBLIC_ORIGIN:'http://localhost:3102',PORT:'3102',NODE_ENV:'test'});
 const app=createApp(cfg,undefined,{now,randomInt,motion:cfg.motion,delay:cfg.delay,peek:cfg.peek,grace:cfg.grace,restart:cfg.restart});
 await new Promise<void>(resolve=>app.http.listen(3102,resolve));
 return {url:'http://localhost:3102',close:()=>app.close(),finish:async(pages:Page[])=>{
  const deadline=state(pages[0]).roundStartsAt;if(deadline===undefined)return;
  offset+=Math.max(0,deadline-now());await app.rooms.timers();
  for(const page of pages)await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 }};
}
