import 'dotenv/config';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {app,finishApi} from '../server/app.js';
import {admin} from '../server/admin.js';
import {leads} from '../server/leads.js';
import {dashboard} from '../server/dashboard.js';
import {db} from '../server/db.js';
import {config} from '../server/config.js';
if(config.NODE_ENV==='production'||!['127.0.0.1','localhost'].includes(new URL(config.DATABASE_URL).hostname))throw new Error('Acceptance tests require a local non-production database');
app.use('/api',admin);app.use('/api/leads',leads);app.use('/api/dashboard',dashboard);finishApi();
test('48-step acceptance workflow: admin, sales, reassignment, media privacy, historical fields/sources and combined filters',async()=>{
 const stamp=Date.now();const password='Acceptance-temporary-strong-password!';
 const owner=await db.user.create({data:{name:'Acceptance Admin',email:`accept-admin-${stamp}@example.test`,passwordHash:await bcrypt.hash(password,12),role:'ADMIN'}});
 const a=request.agent(app),s=request.agent(app),m=request.agent(app);const userIds=[owner.id];let sourceId='',fieldId='',leadId='';
 const change=(agent:typeof a,method:'post'|'put'|'delete',url:string,data:unknown)=>agent[method](url).set('Origin',config.FRONTEND_URL).send(data);
 const login=async(agent:typeof a,email:string)=>assert.equal((await change(agent,'post','/api/auth/login',{email,password})).status,200);
 try{
  await login(a,owner.email);
  const createUser=async(role:string,name:string)=>{const r=await change(a,'post','/api/users',{name,email:`${name}-${stamp}@example.test`,password,role});assert.equal(r.status,201);userIds.push(r.body.id);return r.body;};
  const sales=await createUser('SALES','accept-sales');const other=await createUser('SALES','accept-other');const media=await createUser('MEDIA_BUYER','accept-media');
  const src=await change(a,'post','/api/sources',{name:`Acceptance ${stamp}`});assert.equal(src.status,201);sourceId=src.body.id;
  const field=await change(a,'post','/api/custom-fields',{name:'اسم الشركة',type:'TEXT'});assert.equal(field.status,201);fieldId=field.body.id;
  const q=`sourceId=${sourceId}`;
  const initial=await a.get('/api/dashboard/all?'+q);assert.equal(initial.status,200);assert.equal(initial.body.summary.total,0);assert.deepEqual(initial.body.sources,[]);assert.deepEqual(initial.body.sales,[]);
  await login(s,sales.email);const payload={customerName:'عميل اختبار القبول',phone:'01087654321',address:'PRIVATE ACCEPTANCE ADDRESS',request:'نظام مراقبة',price:'19999.99',sourceId,customFields:{[fieldId]:'شركة الاختبار'}};
  const lead=await change(s,'post','/api/leads',payload);assert.equal(lead.status,201);leadId=lead.body.id;
  assert.equal(lead.body.createdById,sales.id);assert.equal(lead.body.assignedSalesId,sales.id);
  assert.equal((await change(s,'put','/api/leads/'+leadId,{...payload,request:'نظام مراقبة محدث',status:'CONFIRMED'})).status,200);
  const own=await s.get('/api/dashboard/all?'+q);assert.equal(own.body.summary.total,1);assert.equal(own.body.summary.confirmed,1);assert.equal(own.body.summary.totalValue,'19999.99');
  await change(a,'post','/api/auth/logout',{});await login(a,owner.email);
  const reassigned=await change(a,'put','/api/leads/'+leadId,{...payload,status:'CONFIRMED',assignedSalesId:other.id,date:'2026-09-15T09:00:00.000Z'});
  assert.equal(reassigned.status,200);assert.equal(reassigned.body.createdById,sales.id);assert.equal(reassigned.body.assignedSalesId,other.id);
  assert.equal((await s.get('/api/leads/'+leadId)).status,404);assert.equal((await s.get('/api/dashboard/summary?'+q+`&assignedSalesId=${other.id}`)).body.total,0);
  await login(m,media.email);
  const analytics=await m.get('/api/dashboard/all?'+q);assert.equal(analytics.status,200);assert.equal(analytics.body.sources[0].leads,1);assert.equal(analytics.body.sources[0].totalValue,'19999.99');assert.equal(analytics.body.sales[0].id,other.id);assert.equal(analytics.body.sales[0].totalValue,'19999.99');
  assert.doesNotMatch(JSON.stringify(analytics.body),/01087654321|PRIVATE ACCEPTANCE|phone|address|customerName|notes|شركة الاختبار/);
  for(const method of ['post','put','delete'] as const)assert.equal((await change(m,method,method==='post'?'/api/leads':'/api/leads/'+leadId,payload)).status,403);
  for(const route of ['/leads','/leads/'+leadId,'/users','/sources','/custom-fields','/lookups'])assert.equal((await m.get('/api'+route)).status,403);
  assert.ok((await s.get('/api/lookups')).body.fields.some((f:{id:string})=>f.id===fieldId));
  assert.equal((await change(a,'put','/api/custom-fields/'+fieldId,{name:'اسم الشركة',type:'TEXT',active:false})).status,200);
  assert.equal((await a.get('/api/leads/'+leadId)).body.customFieldValues[0].value,'شركة الاختبار');
  assert.ok(!(await s.get('/api/lookups')).body.fields.some((f:{id:string})=>f.id===fieldId));
  assert.equal((await change(a,'put','/api/sources/'+sourceId,{active:false})).status,200);
  assert.equal((await a.get('/api/leads/'+leadId)).body.sourceId,sourceId);
  const {customFields,...plain}=payload;assert.equal((await change(s,'post','/api/leads',plain)).status,400);
  for(const filter of ['period=custom&from=2026-09-01&to=2026-09-30',`assignedSalesId=${other.id}`,'status=CONFIRMED',`period=custom&from=2026-09-01&to=2026-09-30&assignedSalesId=${other.id}&status=CONFIRMED`]){
   const response=await m.get('/api/dashboard/all?'+q+'&'+filter);assert.equal(response.status,200);assert.equal(response.body.summary.total,1);assert.equal(response.body.summary.totalValue,'19999.99');assert.equal(response.body.sources[0].leads,1);assert.equal(response.body.sales[0].leads,1);
  }
  assert.equal((await m.get('/api/dashboard/summary?'+q+'&status=LOST')).body.total,0);
  assert.equal((await m.get('/api/dashboard/summary?'+q+'&period=custom&from=2026-10-01&to=2026-10-31')).body.total,0);
  for(const period of ['all','today','yesterday','week','month','lastMonth'])assert.equal((await m.get('/api/dashboard/summary?'+q+'&period='+period)).status,200);
 }finally{
  if(leadId){await db.leadCustomFieldValue.deleteMany({where:{leadId}});await db.lead.delete({where:{id:leadId}});}
  if(fieldId)await db.customField.delete({where:{id:fieldId}});
  if(sourceId)await db.source.delete({where:{id:sourceId}});
  await db.user.deleteMany({where:{id:{in:userIds}}});
 }
});
after(()=>db.$disconnect());
