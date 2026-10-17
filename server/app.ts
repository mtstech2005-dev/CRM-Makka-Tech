import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { config } from './config.js';
import { db } from './db.js';
import { ApiError, authenticate, cookieOptions, createSession, csrf, publicUser } from './security.js';
export const app=express();
app.disable('x-powered-by');
app.set('trust proxy',config.TRUST_PROXY);
app.use(helmet({contentSecurityPolicy:config.NODE_ENV==='production'?undefined:false}));
app.use(cors({origin:new URL(config.FRONTEND_URL).origin,credentials:true}));
app.use(express.json({limit:'100kb'}),cookieParser());
app.use('/api', (_req,res,next)=>{res.set('Cache-Control','no-store');next();},csrf);
app.get('/api/health',async (_req,res)=>{await db.$queryRaw`SELECT 1`;res.json({status:'ok'});});
const loginLimiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,skipSuccessfulRequests:true,message:{error:'محاولات كثيرة، حاول بعد ١٥ دقيقة'}});
const loginSchema=z.object({email:z.email().transform(s=>s.toLowerCase()),password:z.string().min(1).max(72).refine(v=>Buffer.byteLength(v,'utf8')<=72)}).strict();
const dummyHash=bcrypt.hashSync('unused-timing-equalizer',12);
app.post('/api/auth/login',loginLimiter,async(req,res)=>{
  const data=loginSchema.parse(req.body);
  const user=await db.user.findUnique({where:{email:data.email}});
  const valid=await bcrypt.compare(data.password,user?.passwordHash??dummyHash);
  if(!user || !valid || !user.active) throw new ApiError(401,'البريد الإلكتروني أو كلمة المرور غير صحيحة');
  if(typeof req.cookies.mts_session==='string') { const {digest}=await import('./security.js'); await db.session.deleteMany({where:{id:digest(req.cookies.mts_session)}}); }
  await db.session.deleteMany({where:{expiresAt:{lt:new Date()}}});
  await createSession(user.id,res);
  res.json({id:user.id,name:user.name,email:user.email,role:user.role,active:user.active});
});
app.use('/api',authenticate);
app.get('/api/auth/me',(req,res)=>res.json(req.actor));
app.post('/api/auth/logout',async(req,res)=>{await db.session.deleteMany({where:{id:req.sessionId}});res.clearCookie('mts_session',cookieOptions);res.json({ok:true});});
export function finishApi(){
  app.use('/api',(_req,_res,next)=>next(new ApiError(404,'المسار غير موجود')));
  app.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    if(error instanceof z.ZodError){res.status(400).json({error:'راجع البيانات المدخلة',fields:error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});return;}
    if(error instanceof ApiError){res.status(error.status).json({error:error.message});return;}
    if(error instanceof Prisma.PrismaClientKnownRequestError){
      if(['P2002','P2003','P2025','P2034'].includes(error.code)){res.status(409).json({error:'تعذر حفظ التغيير: بيانات مكررة أو مرتبطة أو تم تعديلها. حدّث الصفحة وحاول مجددًا.'});return;}
    }
    if(error instanceof SyntaxError){res.status(400).json({error:'صيغة الطلب غير صحيحة'});return;}
    console.error('API failure',error instanceof Error?error.name:'Unknown');
    res.status(500).json({error:'حدث خطأ غير متوقع، حاول مجددًا'});
  });
}
