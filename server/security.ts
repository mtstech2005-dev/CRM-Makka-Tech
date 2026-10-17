import { createHmac, randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { db } from './db.js';
import { config } from './config.js';
export const publicUser = { id:true, name:true, email:true, role:true, active:true } as const;
export type Actor = {id:string; name:string; email:string; role:Role; active:boolean};
declare global { namespace Express { interface Request { actor: Actor; sessionId: string; } } }
export class ApiError extends Error { constructor(public status:number, message:string){super(message);} }
export const digest = (token:string) => createHmac('sha256',config.SESSION_SECRET).update(token).digest('hex');
export const cookieOptions = { httpOnly:true, secure:config.NODE_ENV==='production', sameSite:'strict' as const, path:'/' };
export async function createSession(userId:string,res:Response){
  const token=randomBytes(32).toString('hex');
  await db.session.create({data:{id:digest(token), userId, expiresAt:new Date(Date.now()+8*60*60*1000)}});
  res.cookie('mts_session',token,{...cookieOptions,maxAge:8*60*60*1000});
}
export async function authenticate(req:Request,_res:Response,next:NextFunction){
  const token=req.cookies.mts_session;
  if(typeof token!=='string') throw new ApiError(401,'سجّل الدخول للمتابعة');
  const session=await db.session.findUnique({where:{id:digest(token)},include:{user:{select:publicUser}}});
  if(!session || session.expiresAt < new Date() || !session.user.active) throw new ApiError(401,'انتهت الجلسة، سجّل الدخول مجددًا');
  req.actor=session.user; req.sessionId=session.id; next();
}
export const allow = (...roles:Role[]) => (req:Request,_res:Response,next:NextFunction) => {
  if(!roles.includes(req.actor.role)) throw new ApiError(403,'غير مسموح لك بتنفيذ هذا الإجراء'); next();
};
// All mutations require a trusted Origin and JSON. Browsers cannot forge Origin;
// cross-origin simple form requests are rejected, including login/logout CSRF.
export function csrf(req:Request,_res:Response,next:NextFunction){
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
    if(req.get('origin') !== new URL(config.FRONTEND_URL).origin) throw new ApiError(403,'مصدر الطلب غير مسموح');
    if(!req.is('application/json')) throw new ApiError(415,'يجب إرسال الطلب بصيغة JSON');
  } next();
}
