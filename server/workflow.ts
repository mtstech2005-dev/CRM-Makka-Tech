import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, LeadStatus } from '@prisma/client';
import { db } from './db.js';
import { allow, ApiError } from './security.js';
export const COLLECTED_LABEL='تم التسليم للعميل';
export const workflow=Router();
workflow.use(allow('ADMIN'));
const schema=z.object({label:z.string().trim().min(1).max(100),kind:z.enum(['ORDER','SHIPPING']),category:z.enum(['FOLLOW_UP','CONFIRMED','LOST']).nullable().optional(),active:z.boolean().default(true)}).strict().refine(v=>v.kind==='ORDER'||!v.category,{message:'التصنيف الإحصائي لحالات الطلب فقط'});
workflow.get('/',async(_req,res)=>res.json(await db.workflowStatus.findMany({orderBy:[{kind:'asc'},{createdAt:'asc'}]})));
workflow.post('/',async(req,res)=>{
 const data=schema.parse(req.body);
 if(data.label===COLLECTED_LABEL)throw new ApiError(409,'حالة التسليم المحصل موجودة بالفعل ضمن حالات الطلب');
 res.status(201).json(await db.workflowStatus.create({data}));
});
workflow.put('/:id',async(req,res)=>{
 const data=schema.parse(req.body);const id=String(req.params.id);
 const result=await db.$transaction(async tx=>{
  const old=await tx.workflowStatus.findUnique({where:{id}});if(!old)throw new ApiError(404,'الحالة غير موجودة');
  if(data.kind!==old.kind)throw new ApiError(400,'لا يمكن نقل الحالة بين الطلب والشحن');
  if(old.systemKey&&(old.label!==data.label||(data.category??null)!==old.category))throw new ApiError(400,'لا يمكن تغيير اسم أو تصنيف الحالة الأساسية؛ يمكن تعطيلها');
  if(!old.systemKey&&data.label===COLLECTED_LABEL)throw new ApiError(409,'استخدم حالة التسليم المحصل الأساسية');
  if((data.label!==old.label||(data.category??null)!==old.category)&&await tx.lead.count({where:{OR:[{orderStatusId:id},{shippingStatusId:id}]}}))throw new ApiError(409,'الحالة مستخدمة؛ عطّلها وأنشئ حالة جديدة للحفاظ على التاريخ');
  return tx.workflowStatus.update({where:{id},data:{...data,category:data.category??null}});
 },{isolationLevel:'Serializable'});res.json(result);
});
export type WorkflowInput={shippingStatusId?:string|null;orderStatusId?:string|null;status?:LeadStatus};
export async function validateWorkflow(tx:Prisma.TransactionClient,data:WorkflowInput,old?:{shippingStatusId:string|null;orderStatusId:string|null}){
 for(const [key,kind] of [['shippingStatusId','SHIPPING'],['orderStatusId','ORDER']] as const){
  const id=data[key];if(!id||id===old?.[key])continue;
  const state=await tx.workflowStatus.findUnique({where:{id}});
  if(!state||state.kind!==kind||!state.active)throw new ApiError(400,'اختر حالة نشطة من القائمة الصحيحة');
 }
 // Backward compatibility: old API clients still sending status keep working.
 if(data.orderStatusId===undefined&&(data.status!==undefined||!old)){
  const legacy=await tx.workflowStatus.findUnique({where:{systemKey:data.status??'FOLLOW_UP'}});
  if(legacy)data.orderStatusId=legacy.id;
 }
}
