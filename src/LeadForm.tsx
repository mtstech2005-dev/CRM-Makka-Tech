import {useMutation,useQuery} from '@tanstack/react-query';
import type {FormEvent} from 'react';
import {formatInTimeZone,fromZonedTime} from 'date-fns-tz';
import {api,queryClient,statusLabels} from './api';
import type {User,Lead,Lookups,Field} from './types';
import {Modal,ErrorBox,Loading} from './ui';
import TrackingFields from './TrackingFields';
export default function LeadForm({user,lead,onClose,onSaved}:{user:User;lead?:Lead;onClose:()=>void;onSaved:()=>void}){
 const lookups=useQuery({queryKey:['lookups'],queryFn:()=>api<Lookups>('/lookups')});
 const save=useMutation({mutationFn:(data:unknown)=>api(lead?`/leads/${lead.id}`:'/leads',lead?'PUT':'POST',data),onSuccess:()=>{queryClient.invalidateQueries({queryKey:['leads']});queryClient.invalidateQueries({queryKey:['dashboard']});onSaved();}});
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=new FormData(e.currentTarget);const data:Record<string,unknown>={};
  for(const key of ['customerName','phone','address','request','price','sourceId','notes'])data[key]=form.get(key)|| (key==='price'?'0':'');
  for(const key of ['campaignId','adId','orderStatusId','shippingStatusId'])data[key]=form.get(key)||null;
  if(user.role==='ADMIN'){data.assignedSalesId=form.get('assignedSalesId');const date=String(form.get('date')||'');if(date)data.date=fromZonedTime(date,'Africa/Cairo').toISOString();}
  data.customFields=Object.fromEntries((lookups.data?.fields??[]).map(f=>[f.id,f.type==='CHECKBOX'?form.get(f.id)==='on':form.get(f.id)]));save.mutate(data);
 }
 const existing=(field:Field)=>lead?.customFieldValues.find(v=>v.fieldId===field.id);
 return <Modal title={lead?'تعديل بيانات العميل':'إضافة عميل جديد'} onClose={onClose} wide><p className="modal-description">{lead?'حدّث الطلب وحالة المتابعة.':'بيانات بسيطة، ومتابعة تبدأ من أول تواصل.'}</p><ErrorBox error={lookups.error??save.error}/>{lookups.isLoading?<Loading/>:lookups.data&&<form onSubmit={submit}><div className="form-grid">
 <label>اسم العميل <span className="required">*</span><input name="customerName" autoFocus required maxLength={150} placeholder="الاسم الكامل" defaultValue={lead?.customerName}/></label>
 <label>رقم الهاتف <span className="required">*</span><input name="phone" required type="tel" minLength={5} maxLength={30} placeholder="010xxxxxxxx" dir="ltr" defaultValue={lead?.phone}/></label>
 <label className="full">الطلب <span className="required">*</span><textarea name="request" required maxLength={5000} rows={2} placeholder="العميل محتاج إيه؟" defaultValue={lead?.request}/></label>
 <label>السعر المتوقع <small>EGP</small><input name="price" inputMode="decimal" pattern="[0-9]{1,12}(\.[0-9]{1,2})?" defaultValue={lead?.price??'0'} dir="ltr"/></label>
 <label>المصدر <span className="required">*</span><select name="sourceId" required defaultValue={lead?.sourceId??''}><option value="" disabled>اختر مصدر العميل</option>{lead&&!lookups.data.sources.some(s=>s.id===lead.sourceId)&&<option value={lead.sourceId}>{lead.source.name} (معطّل)</option>}{lookups.data.sources.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
 <TrackingFields lead={lead}/>
 <label>العنوان <small>اختياري</small><input name="address" maxLength={500} placeholder="المدينة أو عنوان العميل" defaultValue={lead?.address??''}/></label>
 {user.role==='ADMIN'&&<><label>مسؤول المبيعات <span className="required">*</span><select name="assignedSalesId" required defaultValue={lead?.assignedSalesId??''}><option value="" disabled>اختر موظف المبيعات</option>{lead&&!lookups.data.sales.some(s=>s.id===lead.assignedSalesId)&&<option value={lead.assignedSalesId}>{lead.assignedSales.name} (غير متاح للتعيين الجديد)</option>}{lookups.data.sales.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>تاريخ التسجيل <small>توقيت القاهرة</small><input type="datetime-local" name="date" defaultValue={formatInTimeZone(lead?new Date(lead.date):new Date(),'Africa/Cairo',"yyyy-MM-dd'T'HH:mm")}/></label></>}
 {lookups.data.fields.map(f=>{const old=existing(f);return <label key={f.id} className={f.type==='LONG_TEXT'?'full':f.type==='CHECKBOX'?'checkbox-label':''}>{f.name}
 {f.type==='SELECT'?<select name={f.id} defaultValue={old?.value??''}><option value="">اختر…</option>{old&&!f.options.some(o=>o.id===old.value)&&<option value={old.value}>{old.option?.label??old.value} (خيار قديم)</option>}{f.options.map(o=><option value={o.id} key={o.id}>{o.label}</option>)}</select>:f.type==='LONG_TEXT'?<textarea name={f.id} rows={2} maxLength={10000} defaultValue={old?.value}/>:f.type==='CHECKBOX'?<input name={f.id} type="checkbox" defaultChecked={old?.value==='true'}/>:<input name={f.id} type={f.type==='DATE'?'date':'text'} inputMode={f.type==='NUMBER'?'decimal':undefined} pattern={f.type==='NUMBER'?'-?[0-9]{1,20}(\.[0-9]{1,8})?':undefined} maxLength={f.type==='TEXT'?500:undefined} defaultValue={old?.value}/>}</label>;})}
 <label className="full">ملاحظات <small>اختياري</small><textarea name="notes" rows={2} maxLength={10000} placeholder="أي تفاصيل تساعدك في المتابعة" defaultValue={lead?.notes??''}/></label></div>
 {user.role==='SALES'&&<p className="form-hint">{lead?'المسؤول الحالي: ':'سيُسجّل العميل باسمك ويُسند إليك تلقائيًا: '}{user.name}</p>}
 <div className="form-actions"><button className="primary" disabled={save.isPending}>{save.isPending?'جاري الحفظ…':lead?'حفظ التغييرات':'حفظ العميل'}</button><button type="button" className="secondary" onClick={onClose}>إلغاء</button></div></form>}</Modal>;
}
