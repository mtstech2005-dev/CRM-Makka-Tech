import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api,platformLabels} from './api';
import type {Lead,TrackingOptions,WorkflowStatus} from './types';
import {ErrorBox} from './ui';
export function StatusSelect({kind,states,value,name,onChange}:{kind:'SHIPPING'|'ORDER';states:WorkflowStatus[];value?:string|null;name:string;onChange?:(v:string)=>void}){
 return <label>{kind==='SHIPPING'?'حالة الشحن':'حالة الطلب'}<select aria-label={kind==='SHIPPING'?'حالة الشحن':'حالة الطلب'} name={name} defaultValue={onChange?undefined:value??''} value={onChange?value??'':undefined} onChange={e=>onChange?.(e.target.value)}><option value="">غير محددة</option>{states.filter(s=>s.kind===kind&&(s.active||s.id===value)).map(s=><option key={s.id} value={s.id}>{s.label}{s.active?'':' (معطّلة)'}</option>)}</select></label>;
}
export default function TrackingFields({lead}:{lead?:Lead}){
 const [campaignId,setCampaign]=useState(lead?.campaignId??'');const [adId,setAd]=useState(lead?.adId??'');
 const options=useQuery({queryKey:['tracking-options','active'],queryFn:()=>api<TrackingOptions>('/tracking/options?active=true')});
 const campaigns=[...(options.data?.campaigns??[])];if(lead?.campaign&&!campaigns.some(c=>c.id===lead.campaign!.id))campaigns.push(lead.campaign);
 const ads=[...(options.data?.ads??[])];if(lead?.ad&&!ads.some(a=>a.id===lead.ad!.id))ads.push(lead.ad);
 const states=[...(options.data?.statuses??[])];for(const s of [lead?.orderStatus,lead?.shippingStatus])if(s&&!states.some(v=>v.id===s.id))states.push(s);
 return <><div className="full"><ErrorBox error={options.error}/></div><label>الحملة الإعلانية <small>اختياري</small><select name="campaignId" value={campaignId} onChange={e=>{setCampaign(e.target.value);setAd('');}}><option value="">بدون حملة</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.name} — {platformLabels[c.platform]}{!c.active?' (معطّلة)':''}</option>)}</select></label><label>الإعلان <small>اختياري</small><select name="adId" value={adId} disabled={!campaignId} onChange={e=>setAd(e.target.value)}><option value="">بدون إعلان محدد</option>{ads.filter(a=>a.campaignId===campaignId&&(a.active||a.id===lead?.adId)).map(a=><option key={a.id} value={a.id}>{a.name}{!a.active?' (معطّل)':''}</option>)}</select></label>
 <StatusSelect kind="ORDER" name="orderStatusId" states={states} value={lead?.orderStatusId??'legacy-follow-up'}/><StatusSelect kind="SHIPPING" name="shippingStatusId" states={states} value={lead?.shippingStatusId}/>
 {!states.some(s=>s.kind==='SHIPPING'&&s.active)&&<p className="form-hint full">لم يضف المدير قائمة حالات الشحن بعد. يمكنك حفظ العميل بدون حالة شحن.</p>}</>;
}
