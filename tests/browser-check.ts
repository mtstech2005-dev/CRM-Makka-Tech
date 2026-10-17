import 'dotenv/config';
import './safety.js';
import {chromium,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import bcrypt from 'bcryptjs';
const db=new PrismaClient();
const tag=Date.now();const customerName='اختبار واجهة الموبايل '+tag;
const password='Browser-regression-only-2026!';const hash=await bcrypt.hash(password,12);
const accounts=await Promise.all((['ADMIN','SALES','MEDIA_BUYER'] as const).map(role=>db.user.create({data:{name:'Regression '+role,email:`regression-${role.toLowerCase()}-${tag}@example.test`,passwordHash:hash,role}})));
const source=await db.source.create({data:{name:'Browser regression '+tag}});
const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.FRONTEND_URL!;
mkdirSync('.local/screenshots',{recursive:true});
const errors:string[]=[];
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.on('pageerror',e=>errors.push(e.message));
async function login(email:string){await page.goto(base);await page.getByLabel('البريد الإلكتروني',{exact:true}).fill(email);await page.getByLabel('كلمة المرور',{exact:true}).fill(password);await page.getByRole('button',{name:'تسجيل الدخول',exact:true}).click();await expect(page.getByRole('heading',{name:'لوحة التحكم',exact:true})).toBeVisible();await expect(page.getByText('جاري تحميل البيانات…')).toHaveCount(0);}
try{
 await page.goto(base);await page.screenshot({path:'.local/screenshots/login-desktop.png',fullPage:true});
 await login(accounts.find(u=>u.role==='ADMIN')!.email);await expect(page.getByText('أداء مصادر العملاء',{exact:true})).toBeVisible();await page.screenshot({path:'.local/screenshots/dashboard-desktop.png',fullPage:true});
 await page.getByRole('link',{name:'العملاء',exact:true}).click();await expect(page.locator('tbody tr').first()).toBeVisible();await page.getByRole('button',{name:'إضافة عميل',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:'.local/screenshots/add-lead-desktop.png',fullPage:true});await page.getByRole('button',{name:'إلغاء',exact:true}).click();
 for(const title of ['المستخدمون','مصادر العملاء','الحقول الإضافية']){await page.getByRole('link',{name:title,exact:true}).click();await expect(page.locator('tbody tr').first()).toBeVisible();}
 await page.getByRole('button',{name:'تسجيل الخروج',exact:true}).click();await expect(page.getByRole('heading',{name:'تسجيل الدخول',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await login(accounts.find(u=>u.role==='SALES')!.email);await page.screenshot({path:'.local/screenshots/dashboard-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 await page.getByRole('link',{name:/إضافة عميل/}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByLabel('اسم العميل').fill(customerName);await page.getByLabel('رقم الهاتف').fill('01012345678');await page.getByRole('dialog').locator('[name=request]').fill('تركيب كاميرات — اختبار واجهة');await page.getByRole('dialog').locator('[name=sourceId]').selectOption({label:source.name});
 await page.screenshot({path:'.local/screenshots/add-lead-mobile.png',fullPage:true});await page.getByRole('button',{name:'حفظ العميل',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('تمت إضافة العميل بنجاح')).toBeVisible();
 await page.getByRole('textbox',{name:'بحث العملاء'}).fill(customerName);await expect(page.locator('tbody tr')).toHaveCount(1);await page.getByRole('button',{name:'عرض '+customerName,exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Regression SALES');await page.getByRole('button',{name:'إغلاق',exact:true}).first().click();
 await page.getByRole('button',{name:'فتح القائمة'}).click();await page.getByRole('button',{name:'تسجيل الخروج',exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});await login(accounts.find(u=>u.role==='MEDIA_BUYER')!.email);await expect(page.getByRole('link',{name:'العملاء',exact:true})).toHaveCount(0);
 const privacy=await page.evaluate(async()=>({leads:(await fetch('/api/leads')).status,data:await (await fetch('/api/dashboard/all')).text()}));expect(privacy.leads).toBe(403);expect(privacy.data).not.toMatch(/customerName|phone|address|notes/);
 expect(errors).toEqual([]);console.log('Browser checks passed: desktop, mobile, login/logout, lead creation/details, admin pages and Media Buyer privacy.');
}catch(error){console.error(error instanceof Error ? error.message.replaceAll(password,'[redacted]') : 'Test failed');console.error('Browser test failed. Inspect the local failure screenshot.');await page.screenshot({path:'.local/screenshots/failure.png',fullPage:true});process.exitCode=1;}finally{await browser.close();const where={customerName};await db.leadCustomFieldValue.deleteMany({where:{lead:where}});await db.lead.deleteMany({where});await db.source.delete({where:{id:source.id}});await db.user.deleteMany({where:{id:{in:accounts.map(u=>u.id)}}});await db.$disconnect();}

