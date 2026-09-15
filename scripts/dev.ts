import { spawn } from 'node:child_process';
const server=spawn(process.execPath,['--env-file-if-exists=.env','--import','tsx','src/server/main.ts'],{stdio:'inherit'});
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js'],{stdio:'inherit'});
function stop(){server.kill();vite.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);server.on('exit',()=>vite.kill());vite.on('exit',()=>server.kill());
