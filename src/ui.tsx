import { useEffect,useRef,type ReactNode } from 'react';
import { X,Inbox,LoaderCircle,AlertCircle } from 'lucide-react';
import type { Status } from './types';
import { statusLabels } from './api';
export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{ref.current?.showModal();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};},[]);
 return <dialog className={wide?'modal wide':'modal'} ref={ref} onCancel={e=>{e.preventDefault();onClose();}}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="إغلاق" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
export function ErrorBox({error}:{error:unknown}){return error?<div role="alert" className="error-box"><AlertCircle size={18}/>{error instanceof Error?error.message:String(error)}</div>:null;}
export function Loading(){return <div role="status" className="empty"><LoaderCircle className="spin"/><p>جاري تحميل البيانات…</p></div>;}
export function Empty({text='لا توجد بيانات تطابق اختيارك',children}:{text?:string;children?:ReactNode}){return <div className="empty"><Inbox size={36}/><h3>{text}</h3>{children}</div>;}
export function Badge({status}:{status:Status}){return <span className={'badge '+status}><i/>{statusLabels[status]}</span>;}
export function Confirm({title,description,onCancel,onConfirm,pending,error}:{title:string;description:string;onCancel:()=>void;onConfirm:()=>void;pending:boolean;error?:unknown}){return <Modal title={title} onClose={onCancel}><p>{description}</p><ErrorBox error={error}/><div className="form-actions"><button className="danger" disabled={pending} onClick={onConfirm}>{pending?'جاري التنفيذ…':'تأكيد'}</button><button className="secondary" onClick={onCancel}>إلغاء</button></div></Modal>;}
