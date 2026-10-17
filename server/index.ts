import { app, finishApi } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import express from 'express';
import path from 'node:path';
import { leads } from './leads.js';
import { dashboard } from './dashboard.js';
import { admin } from './admin.js';
import {tracking} from './tracking.js';
import {shipping} from './shipping.js';
import {workflow} from './workflow.js';
import {advertisingReports} from './advertising-reports.js';
app.use('/api/advertising-reports',advertisingReports);
app.use('/api/tracking',tracking);
app.use('/api/shipping',shipping);
app.use('/api/workflow-statuses',workflow);
app.use('/api/leads',leads);
app.use('/api/dashboard',dashboard);
app.use('/api',admin);
finishApi();
if(config.NODE_ENV==='development'){
  const {createServer}=await import('vite');
  const vite=await createServer({server:{middlewareMode:true},appType:'spa'});
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve('dist/client')));
  app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist/client/index.html')));
}
await db.$connect();
const server=app.listen(config.PORT,config.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1',()=>console.log(`MTS CRM ready on port ${config.PORT}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await db.$disconnect();process.exit(0);}));
