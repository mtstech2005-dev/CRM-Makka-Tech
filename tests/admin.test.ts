import 'dotenv/config';
import './safety.js';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {app,finishApi} from '../server/app.js';
import {admin} from '../server/admin.js';
import {leads} from '../server/leads.js';
import {db} from '../server/db.js';
import {config} from '../server/config.js';
app.use('/api',admin);app.use('/api/leads',leads);finishApi();
test('admin management, source and custom field lifecycle, preserved historical values, revoked sessions',async()=>{
 const tag=Date.now();const password='Temporary-test-password-938!';
 const owner=await db.user.create({data:{name:'Test Admin',email:`admin-${tag}@example.test`,passwordHash:await bcrypt.hash(password,12),role:'ADMIN'}});
 const a=request.agent(app),s=request.agent(app),m=request.agent(app);const users=[owner.id];let sourceId='',fieldId='',leadId='';
 const mutate=(agent:typeof a,method:'post'|'put'|'delete',url:string,data:unknown)=>agent[method](url).set('Origin',config.FRONTEND_URL).send(data);
 try{
  await mutate(a,'post','/api/auth/login',{email:owner.email,password});
  const sales=(await mutate(a,'post','/api/users',{name:'Test Sales',email:`sales-${tag}@example.test`,password,role:'SALES'})).body;users.push(sales.id);
  const media=(await mutate(a,'post','/api/users',{name:'Test Media',email:`buyer-${tag}@example.test`,password,role:'MEDIA_BUYER'})).body;users.push(media.id);
  await mutate(s,'post','/api/auth/login',{email:sales.email,password});await mutate(m,'post','/api/auth/login',{email:media.email,password});
  assert.equal((await s.get('/api/users')).status,403);assert.equal((await m.get('/api/lookups')).status,403);
  const source=(await mutate(a,'post','/api/sources',{name:`admin-source-${tag}`})).body;sourceId=source.id;
  assert.equal((await mutate(a,'put',`/api/sources/${sourceId}`,{name:`renamed-${tag}`})).status,200);
  const field=(await mutate(a,'post','/api/custom-fields',{name:'نوع المنتج',type:'SELECT',options:['كاميرا','إنتركم']})).body;fieldId=field.id;
  assert.ok((await s.get('/api/lookups')).body.fields.some((f:{id:string})=>f.id===fieldId));
  const data={customerName:'Test',phone:'01012345678',request:'كاميرات',sourceId,customFields:{[fieldId]:field.options[0].id}};
  const created=await mutate(s,'post','/api/leads',data);assert.equal(created.status,201);leadId=created.body.id;
  assert.equal((await mutate(a,'put',`/api/custom-fields/${fieldId}`,{name:'نوع الجهاز',type:'SELECT',active:false,options:['كاميرا','إنتركم']})).status,200);
  assert.equal((await s.get('/api/lookups')).body.fields.some((f:{id:string})=>f.id===fieldId),false);
  assert.equal((await s.get(`/api/leads/${leadId}`)).body.customFieldValues[0].value,field.options[0].id);
  assert.equal((await mutate(s,'post','/api/leads',data)).status,400);
  assert.equal((await mutate(a,'delete',`/api/custom-fields/${fieldId}`,{})).status,200);
  assert.equal((await db.leadCustomFieldValue.count({where:{fieldId}})),1);
  assert.equal((await mutate(a,'put',`/api/sources/${sourceId}`,{active:false})).status,200);
  const plain={customerName:'Test',phone:'01012345678',request:'updated',sourceId};
  assert.equal((await mutate(s,'post','/api/leads',plain)).status,400);
  assert.equal((await mutate(s,'put',`/api/leads/${leadId}`,plain)).status,200);
  assert.equal((await mutate(a,'delete',`/api/sources/${sourceId}`,{})).status,409);
  assert.equal((await mutate(a,'put',`/api/users/${sales.id}`,{active:false})).status,200);
  assert.equal((await s.get('/api/auth/me')).status,401);
  assert.equal((await db.lead.findUnique({where:{id:leadId}}))?.createdById,sales.id);
  assert.equal((await mutate(a,'delete',`/api/users/${owner.id}`,{})).status,400);
 }finally{
  if(leadId){await db.leadCustomFieldValue.deleteMany({where:{leadId}});await db.lead.delete({where:{id:leadId}});}
  if(fieldId){await db.customFieldOption.deleteMany({where:{fieldId}});await db.customField.delete({where:{id:fieldId}});}
  if(sourceId)await db.source.delete({where:{id:sourceId}});
  await db.user.deleteMany({where:{id:{in:users.filter(Boolean)}}});
 }
});
after(()=>db.$disconnect());
