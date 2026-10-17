import { Router } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import { allow,ApiError } from './security.js';
import { leadWhere } from './filters.js';
import { validateWorkflow } from './workflow.js';
export const shipping=Router();
shipping.use(allow('ADMIN','SHIPPING'));
shipping.use((req,_res,next)=>{
 if(req.actor.role==='SHIPPING'&&Object.keys(req.query).some(key=>!['period','from','to','assignedSalesId','shippingStatusId','orderStatusId','search','page','pageSize'].includes(key)))throw new ApiError(403,'يسمح بفلاتر عمليات الشحن فقط');
 next();
});
// Deliberately excludes price, notes, marketing attribution and custom fields.
const shippingSelect={id:true,date:true,customerName:true,phone:true,address:true,request:true,shippingStatusId:true,orderStatusId:true,shippingStatus:true,orderStatus:true,assignedSales:{select:{id:true,name:true}}} as const;
shipping.get('/options',async(_req,res)=>{
 const [statuses,sales]=await db.$transaction([db.workflowStatus.findMany({orderBy:{createdAt:'asc'}}),db.user.findMany({where:{OR:[{role:'SALES'},{assignedLeads:{some:{}}}]},select:{id:true,name:true}})]);res.json({statuses,sales});
});
shipping.get('/summary',async(req,res)=>{
 const {where}=leadWhere(req.query,req.actor);
 const [total,byShipping,byOrder]=await db.$transaction([db.lead.count({where}),db.lead.groupBy({by:['shippingStatusId'],where,orderBy:{shippingStatusId:'asc'},_count:true}),db.lead.groupBy({by:['orderStatusId'],where,orderBy:{orderStatusId:'asc'},_count:true})]);res.json({total,byShipping,byOrder});
});
shipping.get('/orders',async(req,res)=>{
 const {where,filters:f}=leadWhere(req.query,req.actor);
 const [items,total]=await db.$transaction([db.lead.findMany({where,select:shippingSelect,orderBy:[{date:'desc'},{id:'desc'}],skip:(f.page-1)*f.pageSize,take:f.pageSize}),db.lead.count({where})]);res.json({items,total,page:f.page,pageSize:f.pageSize});
});
shipping.get('/orders/:id',async(req,res)=>{
 const lead=await db.lead.findFirst({where:{id:String(req.params.id),deletedAt:null},select:shippingSelect});if(!lead)throw new ApiError(404,'الطلب غير موجود');res.json(lead);
});
const statusUpdate=z.object({shippingStatusId:z.string().min(1).nullable().optional(),orderStatusId:z.string().min(1).nullable().optional()}).strict().refine(v=>Object.keys(v).length>0);
shipping.patch('/orders/:id/status',async(req,res)=>{
 if(req.body&&Object.keys(req.body).some(k=>!['shippingStatusId','orderStatusId'].includes(k)))throw new ApiError(403,'يسمح بتعديل حالة الشحن وحالة الطلب فقط');
 const data=statusUpdate.parse(req.body);
 const lead=await db.$transaction(async tx=>{
  const old=await tx.lead.findFirst({where:{id:String(req.params.id),deletedAt:null}});if(!old)throw new ApiError(404,'الطلب غير موجود');
  await validateWorkflow(tx,data,old);
  // Only these two validated columns can reach the database update operation.
  return tx.lead.update({where:{id:old.id},data:{shippingStatusId:data.shippingStatusId,orderStatusId:data.orderStatusId},select:shippingSelect});
 },{isolationLevel:'Serializable'});res.json(lead);
});
