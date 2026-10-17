import 'dotenv/config';
import './safety.js';
import { test,after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app,finishApi } from '../server/app.js';
import { leads } from '../server/leads.js';
import { db } from '../server/db.js';
import { config } from '../server/config.js';
app.use('/api/leads',leads);finishApi();
test('lead CRUD, ownership, reassignment and Media Buyer API restriction',async()=>{
 const tag=Date.now();const password='Temporary-test-password-938!';const hash=await bcrypt.hash(password,12);
 const users=await Promise.all((['ADMIN','SALES','SALES','MEDIA_BUYER'] as const).map((role,i)=>db.user.create({data:{name:`Test ${i}`,email:`lead-${tag}-${i}@example.test`,passwordHash:hash,role}})));
 const source=await db.source.create({data:{name:`test-${tag}`}});let id='';
 const agents=users.map(()=>request.agent(app));
 try{
  for(let i=0;i<users.length;i++)assert.equal((await agents[i].post('/api/auth/login').set('Origin',config.FRONTEND_URL).send({email:users[i].email,password})).status,200);
  const data={customerName:'عميل تجريبي',phone:'01012345678',request:'كاميرات',price:'123.45',sourceId:source.id};
  const created=await agents[1].post('/api/leads').set('Origin',config.FRONTEND_URL).send(data);
  assert.equal(created.status,201);id=created.body.id;assert.equal(created.body.createdById,users[1].id);assert.equal(created.body.assignedSalesId,users[1].id);assert.equal(created.body.price,'123.45');
  assert.equal((await agents[2].get(`/api/leads/${id}`)).status,404);
  assert.equal((await agents[2].get('/api/leads')).body.total,0);
  assert.equal((await agents[2].put(`/api/leads/${id}`).set('Origin',config.FRONTEND_URL).send(data)).status,404);
  assert.equal((await agents[1].put(`/api/leads/${id}`).set('Origin',config.FRONTEND_URL).send({...data,status:'CONFIRMED'})).status,200);
  assert.equal((await agents[1].delete(`/api/leads/${id}`).set('Origin',config.FRONTEND_URL).send({})).status,403);
  const reassigned=await agents[0].put(`/api/leads/${id}`).set('Origin',config.FRONTEND_URL).send({...data,assignedSalesId:users[2].id});
  assert.equal(reassigned.status,200);assert.equal(reassigned.body.createdById,users[1].id);assert.equal(reassigned.body.assignedSalesId,users[2].id);
  for(const method of ['post','put','delete'] as const)assert.equal((await agents[3][method](method==='post'?'/api/leads':`/api/leads/${id}`).set('Origin',config.FRONTEND_URL).send(data)).status,403);
  assert.equal((await agents[3].get('/api/leads')).status,403);
  assert.equal((await agents[0].delete(`/api/leads/${id}`).set('Origin',config.FRONTEND_URL).send({})).status,200);
  assert.ok((await db.lead.findUnique({where:{id}}))?.deletedAt);
 }finally{if(id)await db.lead.delete({where:{id}});await db.source.delete({where:{id:source.id}});await db.user.deleteMany({where:{id:{in:users.map(u=>u.id)}}});}
});
after(()=>db.$disconnect());
