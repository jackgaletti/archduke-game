// Deterministic shuffle dependency used only by the browser acceptance runner.
// No test endpoint, environment switch, or fixture is included in dist/server.
import { randomInt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createApp } from '../dist/server/server/app.js';
import { config } from '../dist/server/server/config.js';
import { deck } from '../dist/server/engine/model.js';
const ordered=deck();const rest=deck();
const tops=[1,11,12,7,7,2,3,4,7,8,9,10,6,5];
const selected=tops.map(v=>rest.splice(rest.findIndex(c=>c.value===v),1)[0]);
const target=[...rest,...selected.reverse()];
const choices=[0];
for(let i=103;i>0;i--){const j=ordered.findIndex(c=>c.id===target[i].id);choices.push(j);[ordered[i],ordered[j]]=[ordered[j],ordered[i]];}
const cfg=config({HOST_SECRET:'browser-test-passphrase',PUBLIC_ORIGIN:'http://localhost:3101',PORT:'3101'});
const app=createApp(cfg,undefined,{now:()=>performance.timeOrigin+performance.now(),randomInt:max=>choices.length?choices.shift():randomInt(max),delay:1000,motion:280,peek:3000,grace:60000,restart:2000});
app.http.listen(3101,'0.0.0.0');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void app.close().then(()=>process.exit(0)));
