import './safety.js';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import {app,finishApi} from '../server/app.js';
import {admin} from '../server/admin.js';
import {leads} from '../server/leads.js';
import {dashboard} from '../server/dashboard.js';
import {tracking} from '../server/tracking.js';
import {shipping} from '../server/shipping.js';
import {workflow,COLLECTED_LABEL} from '../server/workflow.js';
import {advertisingReports} from '../server/advertising-reports.js';
import {db} from '../server/db.js';
import {config} from '../server/config.js';
app.use('/api',admin);app.use('/api/leads',leads);app.use('/api/dashboard',dashboard);app.use('/api/tracking',tracking);app.use('/api/shipping',shipping);app.use('/api/workflow-statuses',workflow);app.use('/api/advertising-reports',advertisingReports);finishApi();
test('campaigns, shipping and spend acceptance',async t=>{
 const tag=Date.now();const password='Acceptance-shipping-password-123!';
 const root=await db.user.create({data:{name:'Test Admin',email:`new-admin-${tag}@example.test`,passwordHash:await bcrypt.hash(password,12),role:'ADMIN'}});
 const a=request.agent(app),m=request.agent(app),s=request.agent(app),h=request.agent(app);const userIds=[root.id];const campaignIds:string[]=[];const leadIds:string[]=[];const stateIds:string[]=[];let sourceId='';let c1:any,c2:any,ad1:any,ad2:any,adOther:any,sales:any,ship:any,shipState:any,lead:any,payload:any;
 const change=(agent:typeof a,method:'post'|'put'|'patch'|'delete',url:string,body:unknown)=>agent[method](url).set('Origin',config.FRONTEND_URL).send(body);
 const login=async(agent:typeof a,email:string,pass=password)=>{assert.equal((await change(agent,'post','/api/auth/login',{email,password:pass})).status,200);};
 try{
  await login(a,root.email);
  const createUser=async(role:string,agent:typeof a)=>{const r=await change(a,'post','/api/users',{name:`Test ${role}`,email:`new-${role}-${tag}@example.test`,password,role});assert.equal(r.status,201);userIds.push(r.body.id);await login(agent,r.body.email);return r.body;};
  await createUser('MEDIA_BUYER',m);sales=await createUser('SALES',s);ship=await createUser('SHIPPING',h);
  const source=await change(a,'post','/api/sources',{name:`campaign-tests-${tag}`});sourceId=source.body.id;
  await t.test('role authorization and immutable platform/campaign associations',async()=>{
   for(const [name,platform] of [['Test Meta','META'],['Test Google','GOOGLE']]){const r=await change(m,'post','/api/tracking/campaigns',{name,platform});assert.equal(r.status,201);campaignIds.push(r.body.id);if(platform==='META')c1=r.body;else c2=r.body;}
   const createAd=async(campaignId:string,name:string)=>{const r=await change(m,'post','/api/tracking/ads',{name,campaignId});assert.equal(r.status,201);return r.body;};
   ad1=await createAd(c1.id,'Ad 1');ad2=await createAd(c1.id,'Ad 2');adOther=await createAd(c2.id,'Google Ad');
   assert.equal((await change(m,'put','/api/tracking/campaigns/'+c1.id,{name:c1.name,platform:'GOOGLE',active:true})).status,400);
   assert.equal((await change(m,'put','/api/tracking/ads/'+ad1.id,{name:ad1.name,campaignId:c2.id,active:true})).status,400);
   for(const agent of [s,h])for(const route of ['/tracking/campaigns','/tracking/ads','/tracking/spend'])assert.equal((await change(agent,'post','/api'+route,{})).status,403);
   for(const route of ['/dashboard/all','/dashboard/filters','/advertising-reports','/tracking/options','/users','/sources','/custom-fields','/lookups','/leads'])assert.equal((await h.get('/api'+route)).status,403,route);
   for(const route of ['/leads','/shipping/orders','/shipping/summary','/workflow-statuses'])assert.equal((await m.get('/api'+route)).status,403,route);
   assert.equal((await change(m,'post','/api/workflow-statuses',{label:'غير مسموح',kind:'SHIPPING'})).status,403);
   for(const key of ['search','createdById'])assert.equal((await m.get('/api/dashboard/all?'+key+'=private')).status,400);
   for(const key of ['campaignId','adId','platform','createdById','sourceId'])for(const route of ['/orders','/summary'])assert.equal((await h.get('/api/shipping'+route+'?'+key+'=private')).status,403);
  });
  await t.test('lead attribution validation and inactive association preservation',async()=>{
   payload={customerName:'PRIVATE TEST NAME',phone:'01055556666',address:'PRIVATE TEST ADDRESS',request:'Delivery request',price:'1000.00',sourceId,campaignId:c1.id,adId:ad1.id};
   assert.equal((await change(s,'post','/api/leads',{...payload,adId:adOther.id})).status,400);
   assert.equal((await change(s,'post','/api/leads',{...payload,platform:'GOOGLE'})).status,400);
   const r=await change(s,'post','/api/leads',payload);assert.equal(r.status,201);lead=r.body;leadIds.push(lead.id);assert.equal(lead.campaign.platform,'META');assert.equal(lead.createdById,sales.id);
   await assert.rejects(db.lead.update({where:{id:lead.id},data:{adId:adOther.id}}));
   await change(m,'put','/api/tracking/campaigns/'+c1.id,{name:c1.name,platform:'META',active:false});
   await change(m,'put','/api/tracking/ads/'+ad1.id,{name:ad1.name,campaignId:c1.id,active:false});
   const options=(await s.get('/api/tracking/options?active=true')).body;assert.ok(!options.campaigns.some((c:any)=>c.id===c1.id));assert.ok(!options.ads.some((ad:any)=>ad.id===ad1.id));
   assert.equal((await change(s,'post','/api/leads',payload)).status,400);
   assert.equal((await change(s,'put','/api/leads/'+lead.id,{...payload,notes:'PRIVATE TEST NOTES'})).status,200);
   assert.equal((await s.get('/api/leads/'+lead.id)).body.adId,ad1.id);
   await change(m,'put','/api/tracking/campaigns/'+c1.id,{name:c1.name,platform:'META',active:true});await change(m,'put','/api/tracking/ads/'+ad1.id,{name:ad1.name,campaignId:c1.id,active:true});
   const unattributed=await change(s,'post','/api/leads',{customerName:'Unattributed test',phone:'01012345678',request:'Old workflow',sourceId});assert.equal(unattributed.status,201);leadIds.push(unattributed.body.id);assert.equal(unattributed.body.campaignId,null);
  });
  await t.test('shipping only changes the two status columns; protected-field tampering rejected',async()=>{
   const st=await change(a,'post','/api/workflow-statuses',{label:`حالة شحن اختبارية ${tag}`,kind:'SHIPPING'});assert.equal(st.status,201);shipState=st.body;stateIds.push(shipState.id);
   const before=await db.lead.findUniqueOrThrow({where:{id:lead.id}});
   for(const [key,value] of Object.entries({customerName:'changed',phone:'01000000000',address:'changed',price:'1',notes:'changed',campaignId:c2.id,adId:adOther.id,platform:'GOOGLE',assignedSalesId:root.id,createdById:root.id,status:'LOST',date:'2020-01-01T00:00:00.000Z',request:'changed',sourceId,customFields:{}}))assert.equal((await change(h,'patch',`/api/shipping/orders/${lead.id}/status`,{shippingStatusId:shipState.id,[key]:value})).status,403,key);
   for(const method of ['post','put','delete'] as const)assert.equal((await change(h,method,method==='post'?'/api/leads':'/api/leads/'+lead.id,payload)).status,403);
   assert.equal((await change(h,'patch',`/api/shipping/orders/${lead.id}/status`,{orderStatusId:shipState.id})).status,400);
   const changed=await change(h,'patch',`/api/shipping/orders/${lead.id}/status`,{shippingStatusId:shipState.id,orderStatusId:'delivered-collected'});assert.equal(changed.status,200);assert.equal(changed.body.orderStatus.label,COLLECTED_LABEL);
   const after=await db.lead.findUniqueOrThrow({where:{id:lead.id}});for(const key of Object.keys(before) as (keyof typeof before)[])if(!['updatedAt','orderStatusId','shippingStatusId'].includes(key))assert.equal(JSON.stringify(before[key]),JSON.stringify(after[key]),key);
   const list=await h.get('/api/shipping/orders?search=PRIVATE%20TEST&shippingStatusId='+shipState.id);assert.equal(list.body.total,1);assert.doesNotMatch(JSON.stringify(list.body),/PRIVATE TEST NOTES|"price"|"campaign"|"createdBy"|"customFieldValues"/);
   assert.equal((await h.get('/api/shipping/orders/'+lead.id)).status,200);assert.equal((await h.get('/api/shipping/summary')).status,200);
  });
  await t.test('campaign/day precedence, ad reports, collected-only ROAS, date/status/sales filters',async()=>{
   await change(a,'put','/api/leads/'+lead.id,{...payload,orderStatusId:'delivered-collected',shippingStatusId:shipState.id,date:'2026-10-10T09:00:00.000Z'});
   for(const [adId,price,status] of [[ad2.id,'500','FOLLOW_UP'],[null,'200','LOST']] as const){const r=await change(a,'post','/api/leads',{...payload,adId,price,status,assignedSalesId:sales.id,date:'2026-10-10T09:00:00.000Z'});assert.equal(r.status,201);leadIds.push(r.body.id);}
   const costs=[{date:'2026-10-10',adId:null,amount:'150'},{date:'2026-10-10',adId:ad1.id,amount:'60'},{date:'2026-10-10',adId:ad2.id,amount:'40'},{date:'2026-10-11',adId:ad1.id,amount:'30'},{date:'2026-10-12',adId:null,amount:'0'},{date:'2026-10-12',adId:ad1.id,amount:'20'}];
   for(const cost of costs)assert.equal((await change(m,'post','/api/tracking/spend',{campaignId:c1.id,...cost})).status,201);
   assert.equal((await change(m,'post','/api/tracking/spend',{campaignId:c1.id,...costs[0]})).status,409);
   assert.equal((await change(m,'post','/api/tracking/spend',{campaignId:c1.id,adId:adOther.id,date:'2026-10-13',amount:'1'})).status,400);
   assert.equal((await change(m,'post','/api/tracking/spend',{campaignId:c1.id,date:'2026-10-13',amount:'-1'})).status,400);
   const url='/api/advertising-reports?campaignId='+c1.id;const report=await m.get(url);assert.equal(report.status,200);const r=report.body.totals;
   assert.equal(r.leads,3);assert.equal(r.confirmed,1);assert.equal(r.followUp,1);assert.equal(r.lost,1);assert.equal(r.totalValue,'1700.00');assert.equal(r.collectedCount,1);assert.equal(r.collectedValue,'1000.00');assert.equal(r.campaignSpend,'150.00');assert.equal(r.adSpend,'150.00');assert.equal(r.effectiveSpend,'180.00');assert.equal(r.cpl,'60.00');assert.equal(r.costPerCollected,'180.00');assert.equal(r.roas,'5.5556');
   const ar=report.body.ads.find((v:any)=>v.id===ad1.id);assert.equal(ar.effectiveSpend,'110.00');assert.equal(ar.roas,'9.0909');
   assert.doesNotMatch(JSON.stringify(report.body),/PRIVATE|01055556666|customerName|phone|address|notes|passwordHash/);
   const combined=await m.get(url+`&platform=META&period=custom&from=2026-10-10&to=2026-10-10&orderStatusId=delivered-collected&shippingStatusId=${shipState.id}&assignedSalesId=${sales.id}&status=CONFIRMED`);assert.equal(combined.body.totals.leads,1);assert.equal(combined.body.totals.effectiveSpend,'150.00');
   assert.equal((await m.get(url+'&adId='+ad1.id)).body.totals.effectiveSpend,'110.00');assert.equal((await m.get(url+'&platform=GOOGLE')).body.totals.leads,0);
   const zero=(await m.get('/api/advertising-reports?campaignId='+c2.id)).body.totals;assert.equal(zero.roas,null);assert.equal(zero.cpl,null);assert.equal(zero.costPerCollected,null);
   const none=(await m.get(url+'&period=custom&from=2026-01-01&to=2026-01-02')).body.totals;assert.equal(none.leads,0);assert.equal(none.effectiveSpend,'0.00');
   await change(h,'patch',`/api/shipping/orders/${lead.id}/status`,{orderStatusId:'legacy-confirmed'});const notCollected=(await m.get(url)).body.totals;assert.equal(notCollected.confirmed,1);assert.equal(notCollected.collectedValue,'0.00');assert.equal(notCollected.roas,'0.0000');
   await change(h,'patch',`/api/shipping/orders/${lead.id}/status`,{orderStatusId:'delivered-collected'});
   const dash=(await a.get('/api/dashboard/all?campaignId='+c1.id+'&orderStatusId=delivered-collected')).body;assert.equal(dash.summary.total,1);assert.equal(dash.summary.confirmed,1);
  });
  await t.test('historical statuses, spend edits and shipping-account revocation',async()=>{
   assert.equal((await change(a,'put','/api/workflow-statuses/'+shipState.id,{label:shipState.label,kind:'SHIPPING',active:false})).status,200);
   assert.equal((await h.get('/api/shipping/orders/'+lead.id)).body.shippingStatus.label,shipState.label);
   assert.equal((await change(a,'put','/api/workflow-statuses/'+shipState.id,{label:'Renamed historical status',kind:'SHIPPING',active:true})).status,409);
   assert.equal((await change(a,'put','/api/workflow-statuses/delivered-collected',{label:'Changed',kind:'ORDER',category:'CONFIRMED',active:true})).status,400);
   const spend=(await m.get('/api/tracking/spend?campaignId='+c1.id)).body.items.find((v:any)=>v.adId===ad1.id&&v.date.startsWith('2026-10-11'));
   assert.equal((await change(m,'put','/api/tracking/spend/'+spend.id,{campaignId:c1.id,adId:ad1.id,date:'2026-10-11',amount:'35.25',notes:'Correction'})).status,200);
   assert.equal((await m.get('/api/advertising-reports?campaignId='+c1.id)).body.totals.effectiveSpend,'185.25');
   assert.equal((await change(a,'put','/api/users/'+ship.id,{password:'New-shipping-password-123!'})).status,200);assert.equal((await h.get('/api/shipping/orders')).status,401);
   await login(h,ship.email,'New-shipping-password-123!');await change(a,'put','/api/users/'+ship.id,{active:false});assert.equal((await h.get('/api/shipping/orders')).status,401);
  });
 }finally{
  await db.leadCustomFieldValue.deleteMany({where:{leadId:{in:leadIds}}});await db.lead.deleteMany({where:{id:{in:leadIds}}});
  await db.advertisingSpend.deleteMany({where:{campaignId:{in:campaignIds}}});await db.ad.deleteMany({where:{campaignId:{in:campaignIds}}});await db.campaign.deleteMany({where:{id:{in:campaignIds}}});
  await db.workflowStatus.deleteMany({where:{id:{in:stateIds}}});if(sourceId)await db.source.delete({where:{id:sourceId}});await db.user.deleteMany({where:{id:{in:userIds}}});
 }
});
after(()=>db.$disconnect());
