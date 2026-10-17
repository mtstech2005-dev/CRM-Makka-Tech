import 'dotenv/config';
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
mkdirSync('.local',{recursive:true});
if(!existsSync('.env')){
 const password=randomBytes(24).toString('hex');
 writeFileSync('.env',`NODE_ENV=development\nPORT=3000\nFRONTEND_URL=http://127.0.0.1:3000\nBACKEND_URL=http://127.0.0.1:3000\nDATABASE_URL=postgresql://mts:${password}@127.0.0.1:55432/mts_crm?schema=public\nSESSION_SECRET=${randomBytes(48).toString('hex')}\nDEMO_PASSWORD=${randomBytes(18).toString('base64url')}\n`);
 const {config}=await import('dotenv');config({override:true});
}
const url=new URL(process.env.DATABASE_URL!);
if(url.hostname!=='127.0.0.1'||url.port!=='55432')throw new Error('Local database helper only accepts 127.0.0.1:55432');
const pg=new EmbeddedPostgres({databaseDir:'.local/postgres',user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),port:55432,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],onLog:()=>{},onError:console.error});
if(!existsSync('.local/postgres/PG_VERSION'))await pg.initialise();
await pg.start();
try {await pg.createDatabase('mts_crm');}catch(error){if(!String(error).includes('already exists'))throw error;}
console.log('Local PostgreSQL ready on 127.0.0.1:55432. Credentials are stored only in ignored .env.');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await pg.stop();process.exit(0);});
setInterval(()=>{},60000);
