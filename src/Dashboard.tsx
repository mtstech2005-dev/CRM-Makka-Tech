import { useState,lazy,Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users,UserCheck,Clock3,UserX,Wallet,ArrowUpLeft,ChartNoAxesCombined } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api,qs,count,money } from './api';
import type { DashboardData,StatsRow,User,Source,Person } from './types';
import { Filters,initialFilters } from './Filters';
import { Empty,ErrorBox,Loading } from './ui';
const Charts=lazy(()=>import('./charts'));
function StatsTable({title,subtitle,rows}:{title:string;subtitle:string;rows:StatsRow[]}){return <section className="panel"><div className="panel-title"><div><h2>{title}</h2><p>{subtitle}</p></div><span className="pill">{rows.length}</span></div>{rows.length?<div className="table-scroll"><table><thead><tr><th>الاسم</th><th>العملاء</th><th>مؤكد</th><th>متابعة</th><th>مفقود</th><th>إجمالي القيمة</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td className="strong">{r.name}</td><td>{count(r.leads)}</td><td className="green-text">{count(r.confirmed)}</td><td className="amber-text">{count(r.followUp)}</td><td className="red-text">{count(r.lost)}</td><td className="numeric strong">{money(r.totalValue)}</td></tr>)}</tbody></table></div>:<Empty/>}</section>;}
export default function Dashboard({user}:{user:User}){
 const [filters,setFilters]=useState(initialFilters);
 const options=useQuery({queryKey:['dashboard-filters'],queryFn:()=>api<{sources:Source[];sales:Person[]}>('/dashboard/filters')});
 const stats=useQuery({queryKey:['dashboard',filters],queryFn:()=>api<DashboardData>('/dashboard/all?'+qs(filters))});
 const s=stats.data?.summary;
 const cards=[{label:'إجمالي العملاء',value:s?count(s.total):'—',icon:Users,color:'blue',hint:'عملاء خلال الفترة المحددة'},{label:'عملاء مؤكدون',value:s?count(s.confirmed):'—',icon:UserCheck,color:'green',hint:'طلبات تم تأكيدها'},{label:'قيد المتابعة',value:s?count(s.followUp):'—',icon:Clock3,color:'amber',hint:'فرص تحتاج إلى متابعة'},{label:'عملاء مفقودون',value:s?count(s.lost):'—',icon:UserX,color:'red',hint:'طلبات لم تكتمل'}];
 return <><div className="page-heading"><div><div className="eyebrow">نظرة واضحة. متابعة أفضل.</div><h1>لوحة التحكم</h1><p>{user.role==='SALES'?'تابع عملاءك وفرصك، خطوة بخطوة.':'كل ما تحتاجه لمتابعة العملاء وأداء فريق المبيعات.'}</p></div>{user.role!=='MEDIA_BUYER'&&<Link className="primary" to="/leads?new=1">+ إضافة عميل</Link>}</div>
 <Filters value={filters} onChange={setFilters} sources={options.data?.sources??[]} sales={options.data?.sales??[]} own={user.role==='SALES'}/><ErrorBox error={options.error??stats.error}/>
 {stats.isLoading?<Loading/>:<><div className="kpi-grid">{cards.map(c=><article className="kpi" key={c.label}><div className={'kpi-icon '+c.color}><c.icon size={22}/></div><span>{c.label}</span><strong className="kpi-number">{c.value}</strong><small>{c.hint}</small></article>)}<article className="kpi value-card"><div className="kpi-icon"><Wallet size={22}/></div><span>إجمالي القيمة المحتملة</span><strong className="value-number" dir="ltr">{s?money(s.totalValue):'—'}</strong><small>قيمة طلبات العملاء بالجنيه المصري</small></article></div>
 {stats.data&&<><div className="section-heading"><div><h2>من أين يأتي عملاؤك؟</h2><p>توزيع العملاء وقيمة الفرص حسب المصدر والحالة</p></div><ChartNoAxesCombined size={23}/></div><Suspense fallback={<Loading/>}><Charts data={stats.data}/></Suspense><div className="analytics-tables"><StatsTable title="أداء مصادر العملاء" subtitle="قيمة الطلبات الواردة من كل مصدر" rows={stats.data.sources}/><StatsTable title="أداء فريق المبيعات" subtitle="حسب مسؤول المبيعات الحالي للعميل" rows={stats.data.sales}/></div></>}
 {user.role!=='MEDIA_BUYER'&&<Link className="inline-link" to="/leads">عرض العملاء ومتابعتهم <ArrowUpLeft size={18}/></Link>}</>}
 <p className="footnote">الأرقام حسب تاريخ تسجيل العميل بتوقيت القاهرة. القيمة المحتملة تشمل جميع حالات العملاء، وليست إيرادًا محصلًا أو تكلفة إعلانات.</p></>;
}
