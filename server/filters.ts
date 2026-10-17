import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { addDays, startOfWeek, startOfMonth, subMonths, format } from 'date-fns';
import { config } from './config.js';
import type { Actor } from './security.js';
export const dateOnly=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return !isNaN(+d)&&d.toISOString().slice(0,10)===v;});
export const filtersSchema=z.object({
  period:z.enum(['all','today','yesterday','week','month','lastMonth','custom']).default('all'),
  from:dateOnly.optional(),to:dateOnly.optional(),sourceId:z.string().max(100).optional(),
  assignedSalesId:z.string().max(100).optional(),createdById:z.string().max(100).optional(),
  status:z.enum(['FOLLOW_UP','CONFIRMED','LOST']).optional(),search:z.string().max(200).optional(),
  platform:z.enum(['META','GOOGLE']).optional(),campaignId:z.string().max(100).optional(),adId:z.string().max(100).optional(),
  shippingStatusId:z.string().max(100).optional(),orderStatusId:z.string().max(100).optional(),
  page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20)
}).refine(v=>v.period!=='custom'||(!!v.from&&!!v.to&&v.from<=v.to),{message:'حدد بداية ونهاية صحيحتين للفترة',path:['from']});
export function leadWhere(query:unknown,actor:Actor){
 const f=filtersSchema.parse(query);const where:Prisma.LeadWhereInput={deletedAt:null};
 if(f.sourceId)where.sourceId=f.sourceId;
 if(f.status)where.AND=[{OR:[{orderStatus:{category:f.status}},{status:f.status,OR:[{orderStatusId:null},{orderStatus:{category:null}}]}]}];
 if(f.platform)where.campaign={platform:f.platform};
 if(f.campaignId)where.campaignId=f.campaignId;
 if(f.adId)where.adId=f.adId;
 if(f.shippingStatusId)where.shippingStatusId=f.shippingStatusId;
 if(f.orderStatusId)where.orderStatusId=f.orderStatusId;
 if(f.createdById)where.createdById=f.createdById;
 if(f.assignedSalesId)where.assignedSalesId=f.assignedSalesId;
 if(actor.role==='SALES')where.assignedSalesId=actor.id;
 if(f.search)where.OR=['customerName','phone','request'].map(key=>({[key]:{contains:f.search,mode:'insensitive'}}));
 const today=new Date(formatInTimeZone(new Date(),config.APP_TIMEZONE,'yyyy-MM-dd')+'T12:00:00');
 let start:string|undefined,end:string|undefined;
 const day=(d:Date)=>format(d,'yyyy-MM-dd');
 switch(f.period){
  case 'today':start=day(today);end=day(addDays(today,1));break;
  case 'yesterday':start=day(addDays(today,-1));end=day(today);break;
  case 'week':start=day(startOfWeek(today,{weekStartsOn:6}));end=day(addDays(startOfWeek(today,{weekStartsOn:6}),7));break;
  case 'month':start=day(startOfMonth(today));end=day(startOfMonth(subMonths(today,-1)));break;
  case 'lastMonth':start=day(startOfMonth(subMonths(today,1)));end=day(startOfMonth(today));break;
  case 'custom':start=f.from;end=day(addDays(new Date(f.to!+'T12:00:00'),1));break;
 }
 if(start&&end)where.date={gte:fromZonedTime(start+'T00:00:00',config.APP_TIMEZONE),lt:fromZonedTime(end+'T00:00:00',config.APP_TIMEZONE)};
 return {where,filters:f};
}
