import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { db } from './db.js';
import { allow,ApiError } from './security.js';
import { dateOnly } from './filters.js';
export const tracking=Router();
tracking.get('/options',allow('ADMIN','SALES','MEDIA_BUYER'),async(req,res)=>{
 const active=req.query.active==='true';
 const [campaigns,ads,statuses]=await db.$transaction([
  db.campaign.findMany({where:active?{active:true}:{},orderBy:{name:'asc'}}),
  db.ad.findMany({where:active?{active:true,campaign:{active:true}}:{},orderBy:{name:'asc'}}),
  db.workflowStatus.findMany({where:active?{active:true}:{},orderBy:{createdAt:'asc'}})
 ]);res.json({campaigns,ads,statuses});
});
tracking.use(allow('ADMIN','MEDIA_BUYER'));
const campaignSchema=z.object({name:z.string().trim().min(1).max(150),platform:z.enum(['META','GOOGLE']),active:z.boolean().default(true)}).strict();
const adSchema=z.object({name:z.string().trim().min(1).max(150),campaignId:z.string().min(1),active:z.boolean().default(true)}).strict();
tracking.get('/campaigns',async(_req,res)=>res.json(await db.campaign.findMany({orderBy:{createdAt:'desc'}})));
tracking.post('/campaigns',async(req,res)=>res.status(201).json(await db.campaign.create({data:campaignSchema.parse(req.body)})));
tracking.put('/campaigns/:id',async(req,res)=>{
 const data=campaignSchema.parse(req.body);const id=String(req.params.id);
 const old=await db.campaign.findUnique({where:{id}});if(!old)throw new ApiError(404,'الحملة غير موجودة');
 if(data.platform!==old.platform)throw new ApiError(400,'منصة الحملة ثابتة للحفاظ على الإسناد التاريخي');
 res.json(await db.campaign.update({where:{id},data:{name:data.name,active:data.active}}));
});
tracking.get('/ads',async(_req,res)=>res.json(await db.ad.findMany({include:{campaign:true},orderBy:{createdAt:'desc'}})));
tracking.post('/ads',async(req,res)=>{
 const data=adSchema.parse(req.body);const campaign=await db.campaign.findUnique({where:{id:data.campaignId}});
 if(!campaign?.active)throw new ApiError(400,'اختر حملة نشطة');
 res.status(201).json(await db.ad.create({data,include:{campaign:true}}));
});
tracking.put('/ads/:id',async(req,res)=>{
 const data=adSchema.parse(req.body);const id=String(req.params.id);const old=await db.ad.findUnique({where:{id}});
 if(!old)throw new ApiError(404,'الإعلان غير موجود');if(data.campaignId!==old.campaignId)throw new ApiError(400,'لا يمكن نقل إعلان إلى حملة أخرى');
 res.json(await db.ad.update({where:{id},data:{name:data.name,active:data.active},include:{campaign:true}}));
});
export const amountSchema=z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const spendSchema=z.object({campaignId:z.string().min(1),adId:z.string().min(1).nullable().default(null),date:dateOnly,amount:amountSchema,notes:z.string().max(2000).nullable().optional()}).strict();
tracking.get('/spend',async(req,res)=>{
 const f=z.object({page:z.coerce.number().int().min(1).default(1),campaignId:z.string().optional(),adId:z.string().optional()}).parse(req.query);
 const where={...(f.campaignId?{campaignId:f.campaignId}:{}),...(f.adId?{adId:f.adId}:{})};
 const [items,total]=await db.$transaction([db.advertisingSpend.findMany({where,include:{campaign:true,ad:true},orderBy:[{date:'desc'},{id:'desc'}],skip:(f.page-1)*30,take:30}),db.advertisingSpend.count({where})]);res.json({items,total,page:f.page,pageSize:30});
});
async function saveSpend(input:unknown,id?:string){
 const data=spendSchema.parse(input);
 return db.$transaction(async tx=>{
  const campaign=await tx.campaign.findUnique({where:{id:data.campaignId}});if(!campaign)throw new ApiError(400,'الحملة غير موجودة');
  if(data.adId){const ad=await tx.ad.findUnique({where:{id:data.adId}});if(!ad||ad.campaignId!==data.campaignId)throw new ApiError(400,'الإعلان لا ينتمي للحملة');}
  // Historical spend may be corrected even after deactivation.
  const value={...data,date:new Date(data.date+'T00:00:00Z')};
  return id?tx.advertisingSpend.update({where:{id},data:value,include:{campaign:true,ad:true}}):tx.advertisingSpend.create({data:value,include:{campaign:true,ad:true}});
 },{isolationLevel:'Serializable'});
}
tracking.post('/spend',async(req,res)=>res.status(201).json(await saveSpend(req.body)));
tracking.put('/spend/:id',async(req,res)=>res.json(await saveSpend(req.body,String(req.params.id))));
export async function validateAttribution(tx:Prisma.TransactionClient,data:{campaignId?:string|null;adId?:string|null},old?:{campaignId:string|null;adId:string|null}){
 const campaignId=data.campaignId===undefined?old?.campaignId??null:data.campaignId;
 const adId=data.adId===undefined?old?.adId??null:data.adId;
 if(adId&&!campaignId)throw new ApiError(400,'اختر الحملة أولًا');
 if(campaignId){const campaign=await tx.campaign.findUnique({where:{id:campaignId}});if(!campaign||(!campaign.active&&campaignId!==old?.campaignId))throw new ApiError(400,'اختر حملة نشطة');}
 if(adId){const ad=await tx.ad.findUnique({where:{id:adId},include:{campaign:true}});if(!ad||ad.campaignId!==campaignId||((!ad.active||!ad.campaign.active)&&adId!==old?.adId))throw new ApiError(400,'اختر إعلانًا نشطًا تابعًا للحملة');}
}
