import { QueryClient } from '@tanstack/react-query';
export class ApiError extends Error { constructor(message:string,public status:number){super(message);} }
export const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:15000,refetchOnWindowFocus:true}}});
export async function api<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const res=await fetch('/api'+path,{method,credentials:'include',headers:body!==undefined?{'Content-Type':'application/json'}:{},body:body!==undefined?JSON.stringify(body):undefined});
 const data=await res.json();
 if(!res.ok){if(res.status===401&&path!=='/auth/login'&&path!=='/auth/me')queryClient.setQueryData(['me'],null);throw new ApiError(data.error??'تعذر إتمام الطلب',res.status);}
 return data;
}
export const qs=(value:Record<string,string|number>)=>new URLSearchParams(Object.entries(value).filter(([,v])=>v!==''&&v!==undefined).map(([k,v])=>[k,String(v)])).toString();
export const statusLabels={FOLLOW_UP:'متابعة',CONFIRMED:'مؤكد',LOST:'مفقود'};
export const roleLabels={ADMIN:'مدير النظام',SALES:'موظف مبيعات',MEDIA_BUYER:'مسؤول الإعلانات',SHIPPING:'مسؤول الشحن'};
export const platformLabels={META:'Meta Ads',GOOGLE:'Google Ads'};
export const count=(n:number)=>new Intl.NumberFormat('en-US').format(n);
// Decimal strings remain exact when formatting money; only chart coordinates use Number.
export function money(value:string){const [whole,fraction='00']=value.split('.');return `${BigInt(whole).toLocaleString('en-US')}${fraction==='00'||fraction==='0'?'':'.'+fraction.padEnd(2,'0')} EGP`;}
export const dateText=(v:string)=>new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Cairo'}).format(new Date(v));
