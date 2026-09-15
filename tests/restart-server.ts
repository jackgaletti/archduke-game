// Test process: only randomness is injected; HTTP, socket, storage and rules are the real application.
import { performance } from 'node:perf_hooks';
import { createApp } from '../src/server/app.js';
import { config } from '../src/server/config.js';
const c=config();const app=createApp(c,undefined,{now:()=>performance.timeOrigin+performance.now(),randomInt:max=>max-1,delay:c.delay,motion:c.motion,peek:c.peek,grace:c.grace,restart:c.restart});
app.http.listen(c.port,'127.0.0.1',()=>console.log('test-process-ready'));
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>void app.close().then(()=>process.exit(0)));
