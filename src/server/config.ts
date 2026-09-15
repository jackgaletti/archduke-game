export type Config={port:number;origin:string;secret:string;persistence:'memory'|'sqlite';dataDir:string;delay:number;motion:number;peek:number;grace:number;restart:number;production:boolean};
export function config(env:NodeJS.ProcessEnv=process.env):Config{
 const production=env.NODE_ENV==='production';
 function number(key:string,fallback:number,min:number,max=600000){const n=env[key]===undefined?fallback:Number(env[key]);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${key} must be an integer from ${min} to ${max}`);return n;}
 const secret=env.HOST_SECRET??'';if(secret.length<8)throw new Error('Set HOST_SECRET to a private passphrase of at least 8 characters in .env or your hosting environment.');
 const origin=env.PUBLIC_ORIGIN??(production?'':'http://localhost:5173');let parsed:URL;try{parsed=new URL(origin);}catch{throw new Error('PUBLIC_ORIGIN must be the public origin of this server.');}
 if(parsed.origin!==origin||!['http:','https:'].includes(parsed.protocol)||(production&&(parsed.protocol!=='https:'||['localhost','127.0.0.1'].includes(parsed.hostname))))throw new Error('PUBLIC_ORIGIN must be a clean origin; production requires public HTTPS.');
 const persistence=env.PERSISTENCE??'memory';if(persistence!=='memory'&&persistence!=='sqlite')throw new Error('PERSISTENCE must be memory or sqlite.');
 return {port:number('PORT',3000,0,65535),origin,secret,persistence,dataDir:env.DATA_DIR??'./data',delay:number('MATCH_DELAY_MS',1000,1000),motion:number('ANIMATION_MS',280,100,2000),peek:number('PEEK_MS',3000,1000,10000),grace:number('RECONNECT_GRACE_MS',60000,1000),restart:number('RESTART_MS',2000,1000,10000),production};
}
