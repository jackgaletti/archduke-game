import { config } from './config.js';
import { createApp } from './app.js';
try{
 const c=config();const server=createApp(c);server.http.listen(c.port,'0.0.0.0',()=>console.log(`Archduke listening on port ${c.port} (${c.persistence} persistence)`));
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void server.close().then(()=>process.exit(0));});
}catch(e){console.error(e instanceof Error?e.message:'Startup failed.');process.exit(1);}
