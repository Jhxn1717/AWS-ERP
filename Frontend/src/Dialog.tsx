import {createContext,useContext,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X,TriangleAlert} from 'lucide-react';

let locks=0;
let previousOverflow='';
const DialogCloseContext=createContext<()=>void>(()=>{});
export const useDialogClose=()=>useContext(DialogCloseContext);

/** Native modality keeps background controls inert and allows nested picker dialogs. */
export function Dialog({title,close,children,busy=false,dirty=false,trackChanges=false,size='form'}:{title:string;close:()=>void;children:ReactNode;busy?:boolean;dirty?:boolean;trackChanges?:boolean;size?:'form'|'detail'|'confirm'|'operation'}){
 const ref=useRef<HTMLDialogElement>(null),body=useRef<HTMLDivElement>(null),heading=useRef<HTMLHeadingElement>(null),id=useId();
 const [changed,setChanged]=useState(false),[discard,setDiscard]=useState(false);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null;
  if(locks++===0){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}
  ref.current?.showModal();heading.current?.focus();
  return()=>{ref.current?.close();if(--locks===0)document.body.style.overflow=previousOverflow;if(previous?.isConnected)previous.focus()};
 },[]);
 useEffect(()=>{if(body.current)body.current.scrollTop=0},[title]);
 useEffect(()=>{if(!busy)body.current?.querySelector<HTMLElement>('[role="alert"]')?.scrollIntoView({block:'nearest'})},[busy]);
 function requestClose(){if(busy)return;if(dirty||changed)setDiscard(true);else close()}
 return createPortal(<><dialog ref={ref} className={`modal erp-dialog erp-dialog-${size}`} aria-labelledby={id} aria-busy={busy||undefined} onCancel={event=>{event.preventDefault();event.stopPropagation();requestClose()}}>
  <header className="modal-header"><div><div className="eyebrow">NIX</div><h2 id={id} title={title} tabIndex={-1} ref={heading}>{title}</h2></div><button type="button" className="icon-button" aria-label="Cerrar ventana" disabled={busy} onClick={requestClose}><X size={20}/></button></header>
  <div className="modal-body" ref={body} onChangeCapture={event=>{if(trackChanges&&event.currentTarget.contains(event.target as Node))setChanged(true)}}><DialogCloseContext.Provider value={requestClose}>{children}</DialogCloseContext.Provider></div>
 </dialog>{discard&&<Dialog title="¿Descartar los cambios?" close={()=>setDiscard(false)} size="confirm"><div className="discard-message"><TriangleAlert size={26}/><p>Hay datos sin guardar. Si cierras esta ventana, se perderán.</p></div><div className="dialog-actions"><button type="button" className="btn" onClick={()=>setDiscard(false)}>Seguir editando</button><button type="button" className="btn danger" onClick={()=>{setDiscard(false);close()}}>Descartar y cerrar</button></div></Dialog>}</>,document.body);
}
