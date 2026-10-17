import {Router} from 'express';
import {Prisma} from '@prisma/client';
import {formatInTimeZone} from 'date-fns-tz';
import {db} from './db.js';
import {allow} from './security.js';
import {leadWhere} from './filters.js';
import {config} from './config.js';
import {COLLECTED_LABEL} from './workflow.js';
export const advertisingReports=Router();
advertisingReports.use(allow('ADMIN','MEDIA_BUYER'));
type Row={id:string;name:string;campaignId:string;platform:string;leads:number;confirmed:number;followUp:number;lost:number;totalValue:string;collectedCount:number;collectedValue:string;campaignSpend:string;adSpend:string;effectiveSpend:string;cpl:string|null;costPerCollected:string|null;roas:string|null};
const decimal=(v:Prisma.Decimal.Value)=>new Prisma.Decimal(v);
const plus=(a:string,b:Prisma.Decimal.Value)=>decimal(a).plus(b).toFixed(2);
const ratio=(a:string,b:Prisma.Decimal.Value,precision=2)=>decimal(b).isZero()?null:decimal(a).div(b).toFixed(precision);
advertisingReports.get('/',async(req,res)=>{
 const {where,filters:f}=leadWhere(req.query,req.actor);
 // No PII search oracle is exposed through financial analytics.
 if(f.search||f.createdById){res.status(400).json({error:'هذه الفلاتر غير متاحة في تقارير الإعلانات'});return;}
 const data=await db.$transaction(async tx=>{
  const states=await tx.workflowStatus.findMany();
  const groups=await tx.lead.groupBy({by:['campaignId','adId','status','orderStatusId'],where:{...where,campaignId:f.campaignId??{not:null}},_count:true,_sum:{price:true}});
  const campaignWhere:Prisma.CampaignWhereInput={...(f.platform?{platform:f.platform}:{}),...(f.campaignId?{id:f.campaignId}:{}),...(f.adId?{ads:{some:{id:f.adId}}}:{})};
  const campaigns=await tx.campaign.findMany({where:campaignWhere,include:{ads:{where:f.adId?{id:f.adId}:{}}},orderBy:{name:'asc'}});
  const date=where.date as Prisma.DateTimeFilter|undefined;
  const conditions:Prisma.Sql[]=[Prisma.sql`1=1`];
  if(f.platform)conditions.push(Prisma.sql`c."platform"::text=${f.platform}`);
  if(f.campaignId)conditions.push(Prisma.sql`s."campaignId"=${f.campaignId}`);
  if(f.adId)conditions.push(Prisma.sql`s."adId"=${f.adId}`);
  if(date?.gte)conditions.push(Prisma.sql`s."date">=${formatInTimeZone(new Date(date.gte as Date),config.APP_TIMEZONE,'yyyy-MM-dd')}::date`);
  if(date?.lt)conditions.push(Prisma.sql`s."date"<${formatInTimeZone(new Date(date.lt as Date),config.APP_TIMEZONE,'yyyy-MM-dd')}::date`);
  const spendWhere=Prisma.join(conditions,' AND ');
  // Aggregate per calendar day FIRST; presence of even a zero campaign entry
  // makes it authoritative for that day. Never add the two levels together.
  const spend=await tx.$queryRaw<{campaignId:string;campaignSpend:Prisma.Decimal;adSpend:Prisma.Decimal;effectiveSpend:Prisma.Decimal}[]>(Prisma.sql`
   WITH days AS (SELECT s."campaignId", s."date",
    COALESCE(SUM(s."amount") FILTER (WHERE s."adId" IS NULL),0) AS campaign,
    COALESCE(SUM(s."amount") FILTER (WHERE s."adId" IS NOT NULL),0) AS ads,
    COUNT(*) FILTER (WHERE s."adId" IS NULL) AS has_campaign
    FROM "AdvertisingSpend" s JOIN "Campaign" c ON c.id=s."campaignId"
    WHERE ${spendWhere} GROUP BY s."campaignId",s."date")
   SELECT "campaignId", SUM(campaign) AS "campaignSpend", SUM(ads) AS "adSpend",
    SUM(CASE WHEN has_campaign>0 THEN campaign ELSE ads END) AS "effectiveSpend"
    FROM days GROUP BY "campaignId"`);
  const adSpend=await tx.$queryRaw<{adId:string;amount:Prisma.Decimal}[]>(Prisma.sql`SELECT s."adId",SUM(s.amount) AS amount FROM "AdvertisingSpend" s JOIN "Campaign" c ON c.id=s."campaignId" WHERE ${spendWhere} AND s."adId" IS NOT NULL GROUP BY s."adId"`);
  const fresh=(id:string,name:string,campaignId:string,platform:string):Row=>({id,name,campaignId,platform,leads:0,confirmed:0,followUp:0,lost:0,totalValue:'0.00',collectedCount:0,collectedValue:'0.00',campaignSpend:'0.00',adSpend:'0.00',effectiveSpend:'0.00',cpl:null,costPerCollected:null,roas:null});
  const campaignRows=new Map<string,Row>();const adRows=new Map<string,Row>();
  for(const c of campaigns){const row=fresh(c.id,c.name,c.id,c.platform);const cost=spend.find(s=>s.campaignId===c.id);if(cost){row.campaignSpend=cost.campaignSpend.toFixed(2);row.adSpend=cost.adSpend.toFixed(2);row.effectiveSpend=cost.effectiveSpend.toFixed(2);}campaignRows.set(c.id,row);
   for(const ad of c.ads){const item=fresh(ad.id,ad.name,c.id,c.platform);item.adSpend=adSpend.find(s=>s.adId===ad.id)?.amount.toFixed(2)??'0.00';item.effectiveSpend=item.adSpend;adRows.set(ad.id,item);}
  }
  for(const g of groups){const state=states.find(s=>s.id===g.orderStatusId);const category=state?.category??g.status;const collected=state?.kind==='ORDER'&&state.label===COLLECTED_LABEL;
   for(const row of [campaignRows.get(g.campaignId!),g.adId?adRows.get(g.adId):undefined])if(row){row.leads+=g._count;row[category==='CONFIRMED'?'confirmed':category==='LOST'?'lost':'followUp']+=g._count;row.totalValue=plus(row.totalValue,g._sum.price??0);if(collected){row.collectedCount+=g._count;row.collectedValue=plus(row.collectedValue,g._sum.price??0);}}
  }
  const metrics=(r:Row)=>{r.cpl=ratio(r.effectiveSpend,r.leads);r.costPerCollected=ratio(r.effectiveSpend,r.collectedCount);r.roas=ratio(r.collectedValue,r.effectiveSpend,4);return r;};
  const totals=fresh('total','الإجمالي','','');for(const row of campaignRows.values()){for(const k of ['leads','confirmed','followUp','lost','collectedCount'] as const)totals[k]+=row[k];for(const k of ['totalValue','collectedValue','campaignSpend','adSpend','effectiveSpend'] as const)totals[k]=plus(totals[k],row[k]);}
  return {campaigns:[...campaignRows.values()].map(metrics),ads:[...adRows.values()].map(metrics),totals:metrics(totals),spendRule:f.adId?'AD_ONLY':'CAMPAIGN_PER_DAY_ELSE_ADS',dateBasis:'LEAD_REGISTRATION_AND_SPEND_DAY',spendUnaffectedByLeadFilters:true};
 },{isolationLevel:'RepeatableRead'});res.json(data);
});
