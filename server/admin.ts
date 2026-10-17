import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { allow,ApiError,publicUser } from './security.js';
import {passwordSchema} from './password.js';
export const admin=Router();
admin.get('/lookups',allow('ADMIN','SALES'),async(req,res)=>{
 const [sources,fields,sales,creators]=await db.$transaction([
  db.source.findMany({where:{active:true},orderBy:{name:'asc'}}),
  db.customField.findMany({where:{active:true,deletedAt:null},include:{options:{where:{active:true}}},orderBy:{createdAt:'asc'}}),
  db.user.findMany({where:req.actor.role==='ADMIN'?{role:'SALES',active:true}:{id:req.actor.id},select:{id:true,name:true}}),
  db.user.findMany({where:req.actor.role==='ADMIN'?{}:{createdLeads:{some:{assignedSalesId:req.actor.id,deletedAt:null}}},select:{id:true,name:true}})
 ]);res.json({sources,fields,sales,creators});
});
admin.use(['/users','/sources','/custom-fields'],allow('ADMIN'));
const userCreate=z.object({name:z.string().trim().min(1).max(100),email:z.email().transform(s=>s.toLowerCase()),password:passwordSchema,role:z.enum(['ADMIN','SALES','MEDIA_BUYER','SHIPPING']),active:z.boolean().default(true)}).strict();
const userUpdate=userCreate.partial().strict();
admin.get('/users',async(_req,res)=>res.json(await db.user.findMany({select:publicUser,orderBy:{createdAt:'asc'}})));
admin.post('/users',async(req,res)=>{const {password,...data}=userCreate.parse(req.body);res.status(201).json(await db.user.create({data:{...data,passwordHash:await bcrypt.hash(password,12)},select:publicUser}));});
async function updateUser(id:string,data:z.infer<typeof userUpdate>,actorId:string){
 const hash=data.password?await bcrypt.hash(data.password,12):undefined;
 return db.$transaction(async tx=>{
  const old=await tx.user.findUnique({where:{id}});if(!old)throw new ApiError(404,'المستخدم غير موجود');
  if(id===actorId&&(data.active===false||(data.role&&data.role!=='ADMIN')))throw new ApiError(400,'لا يمكنك تعطيل حسابك أو إزالة دور المدير من حسابك');
  if(old.role==='ADMIN'&&old.active&&(data.active===false||(data.role&&data.role!=='ADMIN'))){if(await tx.user.count({where:{role:'ADMIN',active:true}})<=1)throw new ApiError(400,'يجب الاحتفاظ بمدير نشط واحد على الأقل');}
  const {password,...core}=data;
  const user=await tx.user.update({where:{id},data:{...core,...(hash?{passwordHash:hash}:{})},select:publicUser});
  if(hash||data.role!==undefined||data.active===false)await tx.session.deleteMany({where:{userId:id}});
  return user;
 },{isolationLevel:'Serializable'});
}
admin.put('/users/:id',async(req,res)=>res.json(await updateUser(String(req.params.id),userUpdate.parse(req.body),req.actor.id)));
admin.delete('/users/:id',async(req,res)=>res.json(await updateUser(String(req.params.id),{active:false},req.actor.id)));
const sourceSchema=z.object({name:z.string().trim().min(1).max(100),active:z.boolean().default(true)}).strict();
admin.get('/sources',async(_req,res)=>res.json(await db.source.findMany({orderBy:{createdAt:'asc'}})));
admin.post('/sources',async(req,res)=>res.status(201).json(await db.source.create({data:sourceSchema.parse(req.body)})));
admin.put('/sources/:id',async(req,res)=>res.json(await db.source.update({where:{id:String(req.params.id)},data:sourceSchema.partial().parse(req.body)})));
admin.delete('/sources/:id',async(req,res)=>{
 await db.$transaction(async tx=>{const id=String(req.params.id);if(await tx.lead.count({where:{sourceId:id}}))throw new ApiError(409,'المصدر مرتبط بعملاء؛ يمكنك تعطيله للحفاظ على التاريخ');await tx.source.delete({where:{id}});},{isolationLevel:'Serializable'});
 res.json({ok:true});
});
const fieldSchema=z.object({name:z.string().trim().min(1).max(100),type:z.enum(['TEXT','LONG_TEXT','NUMBER','SELECT','DATE','CHECKBOX']),active:z.boolean().default(true),options:z.array(z.string().trim().min(1).max(100)).max(100).default([])}).strict().refine(v=>v.type!=='SELECT'||v.options.length>0,{message:'أضف خيارًا واحدًا على الأقل',path:['options']}).refine(v=>new Set(v.options).size===v.options.length,{message:'الخيارات مكررة',path:['options']});
admin.get('/custom-fields',async(_req,res)=>res.json(await db.customField.findMany({where:{deletedAt:null},include:{options:true},orderBy:{createdAt:'asc'}})));
admin.post('/custom-fields',async(req,res)=>{const {options,...data}=fieldSchema.parse(req.body);res.status(201).json(await db.customField.create({data:{...data,options:{create:options.map(label=>({label}))}},include:{options:true}}));});
admin.put('/custom-fields/:id',async(req,res)=>{
 const {options,...data}=fieldSchema.parse(req.body);const id=String(req.params.id);
 const field=await db.$transaction(async tx=>{
  const old=await tx.customField.findUnique({where:{id}});if(!old||old.deletedAt)throw new ApiError(404,'الحقل غير موجود');
  if(old.type!==data.type&&await tx.leadCustomFieldValue.count({where:{fieldId:id}}))throw new ApiError(409,'لا يمكن تغيير نوع حقل له قيم محفوظة؛ أضف حقلًا جديدًا');
  await tx.customFieldOption.updateMany({where:{fieldId:id},data:{active:false}});
  if(data.type==='SELECT')for(const label of options)await tx.customFieldOption.upsert({where:{fieldId_label:{fieldId:id,label}},create:{fieldId:id,label},update:{active:true}});
  return tx.customField.update({where:{id},data,include:{options:true}});
 },{isolationLevel:'Serializable'});res.json(field);
});
admin.delete('/custom-fields/:id',async(req,res)=>{
 await db.customField.update({where:{id:String(req.params.id)},data:{active:false,deletedAt:new Date()}});res.json({ok:true});
});
