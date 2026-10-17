import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import {passwordSchema} from '../server/password.js';
const email=z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
const password=passwordSchema.parse(process.env.ADMIN_PASSWORD);
const db=new PrismaClient();
try {
 if(await db.user.findUnique({where:{email}}))throw new Error('Account already exists; use the admin interface to reset passwords.');
 await db.user.create({data:{name:'مدير النظام',email,passwordHash:await bcrypt.hash(password,12),role:'ADMIN'}});
 for(const name of ['Website','Messenger','Instagram','WhatsApp','Hotline'])await db.source.upsert({where:{name},create:{name},update:{}});
 console.log('Admin created successfully. Remove ADMIN_PASSWORD from the environment.');
}finally{await db.$disconnect();}
