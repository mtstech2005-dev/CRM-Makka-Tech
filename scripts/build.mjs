import {execFileSync} from 'node:child_process';
// Ensure both the React transform and runtime use production mode, even when
// a developer's .env contains NODE_ENV=development.
for(const args of [
 ['node_modules/prisma/build/index.js','generate'],
 ['node_modules/typescript/bin/tsc','-p','tsconfig.server.json'],
 ['node_modules/typescript/bin/tsc','--noEmit','-p','tsconfig.json'],
 ['node_modules/vite/bin/vite.js','build']
])execFileSync(process.execPath,args,{stdio:'inherit',env:{...process.env,NODE_ENV:'production'}});
