import { Router } from 'express';
import { Prisma, type LeadStatus } from '@prisma/client';
import { db } from './db.js';
import { leadWhere } from './filters.js';
import { allow } from './security.js';
export const dashboard=Router();
dashboard.use(allow('ADMIN','SALES','MEDIA_BUYER'));
dashboard.get('/filters',async(req,res)=>{
 const [sources,sales]=await db.$transaction([
  db.source.findMany({select:{id:true,name:true,active:true},orderBy:{name:'asc'}}),
  db.user.findMany({where:req.actor.role==='SALES'?{id:req.actor.id}:{OR:[{role:'SALES'},{assignedLeads:{some:{}}}]},select:{id:true,name:true,active:true},orderBy:{name:'asc'}})
 ]);res.json({sources,sales});
});
type Row={id:string;name:string;leads:number;confirmed:number;followUp:number;lost:number;totalValue:string};
dashboard.get('/:section',async(req,res)=>{
 const section=String(req.params.section);
 if(!['summary','sources','sales','status','all'].includes(section)){res.status(404).json({error:'المسار غير موجود'});return;}
 const {where,filters}=leadWhere(req.query,req.actor);
 if(req.actor.role==='MEDIA_BUYER'&&(filters.search||filters.createdById)){res.status(400).json({error:'هذه الفلاتر غير متاحة في التقارير'});return;}
 const result=await db.$transaction(async tx=>{
  const [total,statusGroups,sourceGroups,salesGroups,sources,users,states]=await Promise.all([
   tx.lead.aggregate({where,_count:true,_sum:{price:true}}),
   tx.lead.groupBy({by:['status','orderStatusId'],where,_count:true,_sum:{price:true}}),
   tx.lead.groupBy({by:['sourceId','status','orderStatusId'],where,_count:true,_sum:{price:true}}),
   tx.lead.groupBy({by:['assignedSalesId','status','orderStatusId'],where,_count:true,_sum:{price:true}}),
   tx.source.findMany({select:{id:true,name:true}}),
   tx.user.findMany({where:req.actor.role==='SALES'?{id:req.actor.id}:{OR:[{role:'SALES'},{assignedLeads:{some:{}}}]},select:{id:true,name:true}}),
   tx.workflowStatus.findMany({select:{id:true,category:true}})
  ]);
  const category=(g:{status:LeadStatus;orderStatusId:string|null})=>states.find(s=>s.id===g.orderStatusId)?.category??g.status;
  const statusMap=new Map<LeadStatus,{status:LeadStatus;count:number;totalValue:string}>();
  for(const g of statusGroups){const key=category(g);const row=statusMap.get(key)??{status:key,count:0,totalValue:'0.00'};row.count+=g._count;row.totalValue=new Prisma.Decimal(row.totalValue).plus(g._sum.price??0).toFixed(2);statusMap.set(key,row);}
  function rows(groups:typeof sourceGroups|typeof salesGroups,catalog:{id:string;name:string}[],key:'sourceId'|'assignedSalesId'){
   const map=new Map<string,Row>();
   for(const g of groups){const id=(g as unknown as Record<string,string>)[key];let row=map.get(id);
    if(!row){row={id,name:catalog.find(i=>i.id===id)?.name??'غير معروف',leads:0,confirmed:0,followUp:0,lost:0,totalValue:'0.00'};map.set(id,row);}
    const state=category(g);row.leads+=g._count;row[state==='CONFIRMED'?'confirmed':state==='LOST'?'lost':'followUp']+=g._count;
    row.totalValue=new Prisma.Decimal(row.totalValue).plus(g._sum.price??0).toFixed(2);
   }return [...map.values()].sort((a,b)=>b.leads-a.leads);
  }
  return {summary:{total:total._count,confirmed:statusMap.get('CONFIRMED')?.count??0,followUp:statusMap.get('FOLLOW_UP')?.count??0,lost:statusMap.get('LOST')?.count??0,totalValue:(total._sum.price??new Prisma.Decimal(0)).toFixed(2)},sources:rows(sourceGroups,sources,'sourceId'),sales:rows(salesGroups,users,'assignedSalesId'),status:[...statusMap.values()]};
 },{isolationLevel:'RepeatableRead'});
 res.json(section==='all'?result:result[section as keyof typeof result]);
});
