import 'dotenv/config';
import './safety.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app,finishApi } from '../server/app.js';
import { db } from '../server/db.js';
import { config } from '../server/config.js';
finishApi();
test('authentication: protected routes, invalid/valid login, CSRF and logout',async()=>{
 const email=`auth-${Date.now()}@example.test`;
 const password='Temporary-test-password-938!';
 const user=await db.user.create({data:{name:'اختبار',email,passwordHash:await bcrypt.hash(password,12),role:'ADMIN'}});
 try{
  const agent=request.agent(app);
  assert.equal((await agent.get('/api/auth/me')).status,401);
  assert.equal((await agent.post('/api/auth/login').send({email,password})).status,403);
  assert.equal((await agent.post('/api/auth/login').set('Origin',config.FRONTEND_URL).send({email,password:'invalid'})).status,401);
  const login=await agent.post('/api/auth/login').set('Origin',config.FRONTEND_URL).send({email,password});
  assert.equal(login.status,200);assert.equal(login.body.passwordHash,undefined);
  assert.match(String(login.headers['set-cookie']),/HttpOnly/);
  assert.equal((await agent.get('/api/auth/me')).body.id,user.id);
  assert.equal((await agent.post('/api/auth/logout').set('Origin',config.FRONTEND_URL).send({})).status,200);
  assert.equal((await agent.get('/api/auth/me')).status,401);
 }finally{await db.user.delete({where:{id:user.id}});}
});
after(()=>db.$disconnect());
