import {useState,type FormEvent} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import {Plus,Pencil,Trash2} from 'lucide-react';
import {api,queryClient,roleLabels} from './api';
import type {User,Source,Field} from './types';
import {Modal,Confirm,ErrorBox,Loading,Empty} from './ui';
type Kind='users'|'sources'|'custom-fields';
type Item=Partial<User&Source&Field> & {id:string;name:string;active:boolean};
const labels={users:'المستخدمون',sources:'مصادر العملاء','custom-fields':'الحقول الإضافية'};
const singular={users:'مستخدم',sources:'مصدر','custom-fields':'حقل إضافي'};
const fieldLabels={TEXT:'نص قصير',LONG_TEXT:'نص طويل',NUMBER:'رقم',SELECT:'قائمة اختيار',DATE:'تاريخ',CHECKBOX:'مربع اختيار'};
export default function Admin({kind}:{kind:Kind}){
 const [editing,setEditing]=useState<Item|null|undefined>(),[deleting,setDeleting]=useState<Item|null>(null),[notice,setNotice]=useState('');
 const items=useQuery({queryKey:[kind],queryFn:()=>api<Item[]>('/'+kind)});
 const refresh=()=>{queryClient.invalidateQueries();};
 const remove=useMutation({mutationFn:(id:string)=>api(`/${kind}/${id}`,'DELETE',{}),onSuccess:()=>{setDeleting(null);setNotice('تم تنفيذ الإجراء');refresh();}});
 return <><div className="page-heading"><div><div className="eyebrow">إدارة النظام</div><h1>{labels[kind]}</h1><p>{kind==='users'?'تحكّم في حسابات الفريق وصلاحيات الوصول.':kind==='sources'?'نظّم مصادر العملاء مع الاحتفاظ بالبيانات التاريخية.':'أضف البيانات التي يحتاجها فريقك، ببساطة.'}</p></div><button className="primary" onClick={()=>setEditing(null)}><Plus size={19}/>إضافة {singular[kind]}</button></div>
 {notice&&<div className="success-box" role="status">{notice}<button onClick={()=>setNotice('')}>×</button></div>}<ErrorBox error={items.error}/>
 <section className="panel"><div className="panel-title"><h2>{labels[kind]}</h2><span className="pill">{items.data?.length??0}</span></div>{items.isLoading?<Loading/>:items.data?.length?<div className="table-scroll"><table><thead><tr><th>الاسم</th>{kind==='users'&&<><th>البريد الإلكتروني</th><th>الدور</th></>}{kind==='custom-fields'&&<><th>نوع الحقل</th><th>الخيارات</th></>}<th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{items.data.map(item=><tr key={item.id}><td className="strong">{item.name}</td>{kind==='users'&&<><td dir="ltr">{item.email}</td><td>{roleLabels[item.role!]}</td></>}{kind==='custom-fields'&&<><td>{fieldLabels[item.type!]}</td><td>{item.options?.filter(o=>o.active).map(o=>o.label).join('، ')||'—'}</td></>}<td><span className={'badge '+(item.active?'CONFIRMED':'LOST')}>{item.active?'نشط':'معطّل'}</span></td><td><div className="row-actions"><button aria-label={'تعديل '+item.name} onClick={()=>setEditing(item)}><Pencil size={17}/></button><button className="red-text" aria-label={(kind==='users'?'تعطيل ':'حذف ')+item.name} onClick={()=>{remove.reset();setDeleting(item);}}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div>:<Empty text={`لا توجد بيانات بعد`}/>}</section>
 {editing!==undefined&&<Editor kind={kind} item={editing} onClose={()=>setEditing(undefined)} onSaved={()=>{setEditing(undefined);setNotice('تم الحفظ بنجاح');refresh();}}/>}
 {deleting&&<Confirm title={kind==='users'?'تعطيل المستخدم؟':'حذف '+singular[kind]+'؟'} description={kind==='users'?'سيتم إلغاء جلسات المستخدم ومنع دخوله. العملاء المسجلون باسمه سيظلون محفوظين.':kind==='sources'?'لا يمكن حذف مصدر مرتبط بعملاء. يمكنك تعطيله من شاشة التعديل.':'سيُؤرشف الحقل وتُحفظ قيمه القديمة، ولن يظهر في الإدخالات الجديدة.'} onCancel={()=>setDeleting(null)} onConfirm={()=>remove.mutate(deleting.id)} pending={remove.isPending} error={remove.error}/>}
 </>;
}
function Editor({kind,item,onClose,onSaved}:{kind:Kind;item:Item|null;onClose:()=>void;onSaved:()=>void}){
 const [type,setType]=useState(item?.type??'TEXT');
 const save=useMutation({mutationFn:(data:unknown)=>api('/'+kind+(item?'/'+item.id:''),item?'PUT':'POST',data),onSuccess:onSaved});
 function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const data:Record<string,unknown>={name:f.get('name'),active:f.get('active')==='on'};
  if(kind==='users'){data.email=f.get('email');data.role=f.get('role');if(f.get('password'))data.password=f.get('password');}
  if(kind==='custom-fields'){data.type=type;data.options=type==='SELECT'?String(f.get('options')).split('\n').map(s=>s.trim()).filter(Boolean):[];}
  save.mutate(data);
 }
 return <Modal title={(item?'تعديل ':'إضافة ')+singular[kind]} onClose={onClose}><form onSubmit={submit}><ErrorBox error={save.error}/><div className="form-grid"><label className="full">الاسم<input autoFocus name="name" required maxLength={100} defaultValue={item?.name}/></label>
 {kind==='users'&&<><label className="full">البريد الإلكتروني<input type="email" name="email" required dir="ltr" defaultValue={item?.email}/></label><label>الدور<select name="role" defaultValue={item?.role??'SALES'}>{Object.entries(roleLabels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label><label>{item?'كلمة مرور جديدة (اختياري)':'كلمة المرور'}<input type="password" name="password" required={!item} minLength={12} maxLength={128} autoComplete="new-password" placeholder="12 حرفًا على الأقل"/></label></>}
 {kind==='custom-fields'&&<><label className="full">نوع الحقل<select value={type} onChange={e=>setType(e.target.value as Field['type'])}>{Object.entries(fieldLabels).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>{type==='SELECT'&&<label className="full">الخيارات <small>خيار واحد في كل سطر</small><textarea name="options" rows={5} required defaultValue={item?.options?.filter(o=>o.active).map(o=>o.label).join('\n')}/></label>}</>}
 <label className="checkbox-label full"><input type="checkbox" name="active" defaultChecked={item?.active??true}/>نشط</label></div><div className="form-actions"><button className="primary" disabled={save.isPending}>{save.isPending?'جاري الحفظ…':'حفظ'}</button><button type="button" className="secondary" onClick={onClose}>إلغاء</button></div></form></Modal>;
}
