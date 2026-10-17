import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {passwordSchema} from '../server/password.js';
if(process.env.NODE_ENV==='production')throw new Error('Demo seeding is forbidden in production');
const password=passwordSchema.parse(process.env.DEMO_PASSWORD);
const db=new PrismaClient();
try{
 if(await db.user.count())throw new Error('Seed requires an empty database to avoid changing existing accounts or creating duplicate leads');
 const hash=await bcrypt.hash(password,12);
 await db.$transaction(async tx=>{
  await tx.user.create({data:{name:'مدير النظام',email:'admin@mts-makka.com',passwordHash:hash,role:'ADMIN'}});
  await tx.user.create({data:{name:'مسؤول الإعلانات',email:'media@mts-makka.com',passwordHash:hash,role:'MEDIA_BUYER'}});
  const sales=[];
  for(const [name,email] of [['أحمد محمود','ahmed'],['محمد علي','mohamed'],['محمود حسن','mahmoud']])sales.push(await tx.user.create({data:{name,email:`${email}@mts-makka.com`,passwordHash:hash,role:'SALES'}}));
  const sources=[];for(const name of ['Website','Messenger','Instagram','WhatsApp','Hotline'])sources.push(await tx.source.create({data:{name}}));
  const field=await tx.customField.create({data:{name:'نوع المشروع',type:'SELECT',options:{create:[{label:'سكني'},{label:'تجاري'},{label:'مؤسسي'}]}},include:{options:true}});
  const names=['أحمد محمد','محمد إبراهيم','محمود عبد الله','علي حسن','خالد سمير','مصطفى سعيد','عمر عادل','يوسف محمود','حسن سامي','كريم وليد'];
  const requests=['تركيب ٦ كاميرات مراقبة وجهاز تسجيل','تجهيز شبكة داخلية لمكتب','إنتركم مرئي لمدخل عمارة','نظام حضور وانصراف بالبصمة','تأمين مخزن بكاميرات IP','تركيب سنترال للشركة'];
  for(let i=0;i<30;i++){
   const date=new Date();date.setDate(date.getDate()-(i*2));date.setHours(12,0,0,0);
   await tx.lead.create({data:{date,customerName:names[i%names.length]+' (تجريبي)',phone:`0100000${String(i).padStart(4,'0')}`,address:['القاهرة','دمياط الجديدة','المنصورة'][i%3],request:requests[i%6],price:String(7500+(i*1750)),status:(['FOLLOW_UP','CONFIRMED','LOST'] as const)[(i*7+Math.floor(i/3))%3],sourceId:sources[i%5].id,createdById:sales[i%3].id,assignedSalesId:sales[i%3].id,notes:'بيانات تجريبية للاختبار فقط',customFieldValues:{create:{fieldId:field.id,value:field.options[i%3].id,optionId:field.options[i%3].id}}}});
  }
 },{timeout:30000});
 console.log('Seed complete: 5 demo accounts and 30 fictional leads. Password: DEMO_PASSWORD in your private .env.');
}finally{await db.$disconnect();}
