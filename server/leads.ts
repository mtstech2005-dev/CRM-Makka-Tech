import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { db } from './db.js';
import { allow,ApiError } from './security.js';
import { leadWhere,dateOnly } from './filters.js';
import {validateAttribution} from './tracking.js';
import {validateWorkflow} from './workflow.js';
export const leads=Router();
leads.use(allow('ADMIN','SALES'));
const person={select:{id:true,name:true}} as const;
const include={source:true,createdBy:person,assignedSales:person,campaign:true,ad:true,orderStatus:true,shippingStatus:true,customFieldValues:{include:{field:true,option:true}}} as const;
const base=z.object({
 customerName:z.string().trim().min(1).max(150),phone:z.string().trim().min(5).max(30).regex(/^[+\d\s()-]+$/),
 address:z.string().max(500).nullable().optional(),request:z.string().trim().min(1).max(5000),
 price:z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).default('0'),sourceId:z.string().min(1),
 status:z.enum(['FOLLOW_UP','CONFIRMED','LOST']).optional(),notes:z.string().max(10000).nullable().optional(),
 campaignId:z.string().min(1).nullable().optional(),adId:z.string().min(1).nullable().optional(),
 shippingStatusId:z.string().min(1).nullable().optional(),orderStatusId:z.string().min(1).nullable().optional(),
 assignedSalesId:z.string().optional(),date:z.iso.datetime().optional(),
 customFields:z.record(z.string(),z.union([z.string().max(10000),z.boolean(),z.null()])).optional()
}).strict();
type Tx=Prisma.TransactionClient;
async function validateRelations(tx:Tx,data:z.infer<typeof base>,old?:{sourceId:string;assignedSalesId:string}){
 if(data.sourceId!==old?.sourceId){const source=await tx.source.findUnique({where:{id:data.sourceId}});if(!source?.active)throw new ApiError(400,'اختر مصدرًا نشطًا');}
 if(data.assignedSalesId&&data.assignedSalesId!==old?.assignedSalesId){const user=await tx.user.findUnique({where:{id:data.assignedSalesId}});if(!user?.active||user.role!=='SALES')throw new ApiError(400,'اختر موظف مبيعات نشطًا');}
}
async function saveFields(tx:Tx,leadId:string,values:Record<string,string|boolean|null>={}){
 for(const [fieldId,value] of Object.entries(values)){
  const field=await tx.customField.findUnique({where:{id:fieldId},include:{options:true}});
  if(!field?.active||field.deletedAt)throw new ApiError(400,'الحقل الإضافي غير متاح');
  if(value===null||value===''){await tx.leadCustomFieldValue.deleteMany({where:{leadId,fieldId}});continue;}
  let optionId:string|undefined;
  let valid=true;
  if(field.type==='CHECKBOX')valid=typeof value==='boolean';
  else if(typeof value!=='string')valid=false;
  else if(field.type==='NUMBER')valid=/^-?\d{1,20}(\.\d{1,8})?$/.test(value);
  else if(field.type==='DATE')valid=dateOnly.safeParse(value).success;
  else if(field.type==='TEXT')valid=value.length<=500;
  else if(field.type==='SELECT'){
   const existing=await tx.leadCustomFieldValue.findUnique({where:{leadId_fieldId:{leadId,fieldId}}});
   const option=field.options.find(o=>o.id===value&&(o.active||existing?.optionId===o.id));
   valid=!!option;optionId=option?.id;
  }
  if(!valid)throw new ApiError(400,`قيمة غير صحيحة للحقل: ${field.name}`);
  await tx.leadCustomFieldValue.upsert({where:{leadId_fieldId:{leadId,fieldId}},create:{leadId,fieldId,value:String(value),optionId},update:{value:String(value),optionId:optionId??null}});
 }
}
leads.get('/',async(req,res)=>{
 const {where,filters:f}=leadWhere(req.query,req.actor);
 const [items,total]=await db.$transaction([db.lead.findMany({where,include,orderBy:[{date:'desc'},{id:'desc'}],skip:(f.page-1)*f.pageSize,take:f.pageSize}),db.lead.count({where})]);
 res.json({items,total,page:f.page,pageSize:f.pageSize});
});
leads.get('/:id',async(req,res)=>{
 const lead=await db.lead.findFirst({where:{id:String(req.params.id),deletedAt:null,...(req.actor.role==='SALES'?{assignedSalesId:req.actor.id}:{})},include});
 if(!lead)throw new ApiError(404,'العميل غير موجود');res.json(lead);
});
leads.post('/',async(req,res)=>{
 const data=base.parse(req.body);
 if(req.actor.role==='SALES'&&(data.assignedSalesId||data.date))throw new ApiError(403,'تغيير التاريخ أو المسؤول متاح للمدير فقط');
 if(req.actor.role==='SALES')data.assignedSalesId=req.actor.id;
 if(!data.assignedSalesId)throw new ApiError(400,'اختر مسؤول المبيعات');
 const lead=await db.$transaction(async tx=>{
  await validateRelations(tx,data);
  await validateAttribution(tx,data);
  await validateWorkflow(tx,data);
  const {customFields,...core}=data;
  const result=await tx.lead.create({data:{...core,assignedSalesId:data.assignedSalesId!,createdById:req.actor.id}});
  await saveFields(tx,result.id,customFields);
  return tx.lead.findUnique({where:{id:result.id},include});
 },{isolationLevel:'Serializable'});
 res.status(201).json(lead);
});
leads.put('/:id',async(req,res)=>{
 const data=base.parse(req.body);
 if(req.actor.role==='SALES'&&(data.assignedSalesId||data.date))throw new ApiError(403,'تغيير التاريخ أو المسؤول متاح للمدير فقط');
 const lead=await db.$transaction(async tx=>{
  const old=await tx.lead.findFirst({where:{id:String(req.params.id),deletedAt:null,...(req.actor.role==='SALES'?{assignedSalesId:req.actor.id}:{})}});
  if(!old)throw new ApiError(404,'العميل غير موجود');
  await validateRelations(tx,data,old);
  await validateAttribution(tx,data,old);
  await validateWorkflow(tx,data,old);
  const {customFields,...core}=data;
  await tx.lead.update({where:{id:old.id},data:core});
  await saveFields(tx,old.id,customFields);
  return tx.lead.findUnique({where:{id:old.id},include});
 },{isolationLevel:'Serializable'});
 res.json(lead);
});
leads.delete('/:id',allow('ADMIN'),async(req,res)=>{
 const count=await db.lead.updateMany({where:{id:String(req.params.id),deletedAt:null},data:{deletedAt:new Date()}});
 if(!count.count)throw new ApiError(404,'العميل غير موجود');res.json({ok:true});
});
