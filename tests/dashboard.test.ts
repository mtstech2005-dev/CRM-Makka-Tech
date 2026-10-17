import 'dotenv/config';
import './safety.js';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {app,finishApi} from '../server/app.js';
import {dashboard} from '../server/dashboard.js';
import {db} from '../server/db.js';
import {config} from '../server/config.js';
app.use('/api/dashboard',dashboard);finishApi();
test('database aggregates, combined filters, Cairo date boundaries and privacy',async()=>{
 const tag=Date.now();const password='Temporary-test-password-938!';const hash=await bcrypt.hash(password,12);
 const sales=await db.user.create({data:{email:`analytics-${tag}@example.test`,name:'Analytics Sales',role:'SALES',passwordHash:hash}});
 const media=await db.user.create({data:{email:`media-${tag}@example.test`,name:'Analytics Viewer',role:'MEDIA_BUYER',passwordHash:hash}});
 const source=await db.source.create({data:{name:`analytics-${tag}`}});
 try{
  for(const [i,price] of ['0.10','0.20','25.55'].entries())await db.lead.create({data:{customerName:'PRIVATE CUSTOMER',phone:'01099998888',address:'PRIVATE ADDRESS',request:'PRIVATE REQUEST',notes:'PRIVATE NOTES',price,status:i===2?'LOST':'CONFIRMED',date:new Date(i===2?'2026-09-02T21:30:00Z':'2026-09-01T21:30:00Z'),sourceId:source.id,createdById:sales.id,assignedSalesId:sales.id}});
  const agent=request.agent(app);await agent.post('/api/auth/login').set('Origin',config.FRONTEND_URL).send({email:media.email,password});
  const data=(await agent.get(`/api/dashboard/all?sourceId=${source.id}`)).body;
  assert.deepEqual(data.summary,{total:3,confirmed:2,followUp:0,lost:1,totalValue:'25.85'});
  assert.equal(data.sources[0].totalValue,'25.85');assert.equal(data.sales[0].totalValue,'25.85');assert.equal(data.sales[0].leads,3);
  const filtered=(await agent.get(`/api/dashboard/all?sourceId=${source.id}&assignedSalesId=${sales.id}&status=CONFIRMED&period=custom&from=2026-09-02&to=2026-09-02`)).body;
  assert.equal(filtered.summary.total,2);assert.equal(filtered.summary.totalValue,'0.30');
  assert.equal((await agent.get(`/api/dashboard/summary?sourceId=${source.id}&period=custom&from=2026-09-01&to=2026-09-01`)).body.total,0);
  assert.equal((await agent.get('/api/dashboard/summary?period=custom&from=2026-09-03&to=2026-09-01')).status,400);
  assert.doesNotMatch(JSON.stringify(data),/PRIVATE|01099998888|customerName|phone|address|notes|password/);
  await db.lead.updateMany({where:{sourceId:source.id},data:{deletedAt:new Date()}});
  assert.equal((await agent.get(`/api/dashboard/summary?sourceId=${source.id}`)).body.total,0);
 }finally{await db.lead.deleteMany({where:{sourceId:source.id}});await db.source.delete({where:{id:source.id}});await db.user.deleteMany({where:{id:{in:[sales.id,media.id]}}});}
});
after(()=>db.$disconnect());
