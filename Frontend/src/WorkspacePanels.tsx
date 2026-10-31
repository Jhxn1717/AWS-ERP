import {ContactFields} from './ContactFields';
import {ChoicePicker} from './ChoicePicker';
import React,{useEffect,useRef,useState} from 'react';
import {GoogleSignIn} from './GoogleSignIn';
import {Cloud,Upload,Download,FileText,Folder,Search,Users,Shield,Settings,Plus,Check,RefreshCw,Sun,Moon,ArrowRight,LockKeyhole,Building2,Package,Trash2,TriangleAlert} from 'lucide-react';

export type User={id:number;name:string;email:string;role:string;status:string;avatarUrl?:string;profile?:{avatarColor?:string}};
type Row={id:number;name:string;[key:string]:any};
export type Company={name:string;taxId:string;email:string;phone:string;address:string};
export async function request(path:string,method='GET',body?:object|FormData){
 if(body instanceof FormData && (path==='documents'||path==='me/avatar')){
  const file=body.get('file');
  if(file instanceof File && file.size>4*1024*1024){
   const maximum=(path==='documents'?10:5)*1024*1024;
   if(file.size>maximum)throw Error(path==='documents'?'El archivo supera el límite de 10 MB.':'La foto debe pesar como máximo 5 MB.');
   const token=Math.floor(Date.now()/1000)+'-'+crypto.randomUUID().replaceAll('-','');
   const parts=Math.ceil(file.size/(2*1024*1024));
   for(let index=0;index<parts;index++){
    const chunk=new FormData();chunk.set('file',file.slice(index*2*1024*1024,(index+1)*2*1024*1024),'parte');
    await request(`me/transfers/${token}/${index}`,'POST',chunk);
   }
   const original=body,transferred=new FormData();
   // Keep the form metadata while replacing the large file with its transfer ID.
   original.forEach((value,key)=>{if(key!=='file')transferred.append(key,value)});
   transferred.set('transfer',token);transferred.set('parts',String(parts));transferred.set('filename',file.name);
   body=transferred;
  }
 }
 let response:Response;
 try{response=await fetch('/api/v1/'+path,{method,headers:body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:undefined,body:body instanceof FormData?body:body?JSON.stringify(body):undefined})}
 catch{throw Error('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.')}
 const data=await response.json().catch(()=>null);
 if(!response.ok){
  if(response.status===401)window.dispatchEvent(new Event('erp-session-expired'));
  if(typeof data?.detail==='string')throw Error(data.detail);
  if(Array.isArray(data?.detail)){
   const labels:Record<string,string>={name:'Nombre',email:'Correo',password:'Contraseña',sku:'SKU',category:'Categoría',taxId:'Documento (RUC o DNI)',documentType:'Tipo de documento',method:'Método de pago',paymentReference:'Referencia de pago',phone:'Teléfono',price:'Precio',cost:'Costo',stock:'Stock',minimum:'Stock mínimo',quantity:'Cantidad',reason:'Motivo',amount:'Importe',contactId:'Cliente o proveedor',orderId:'Operación',lines:'Productos',role:'Rol',address:'Dirección',dueDate:'Vencimiento',validUntil:'Vigencia',deliveryDate:'Entrega prevista',paymentDays:'Plazo de pago',supplierReference:'Factura del proveedor',taxRate:'Impuesto',stage:'Estado de entrega',note:'Observación'};
   const fields=[...new Set<string>(data.detail.map((issue:{loc?:Array<string|number>})=>{const key=String(issue.loc?.at(-1)||'');return labels[key]||'Formulario'}))];
   throw Error('Revisa los campos: '+fields.join(', ')+'. Verifica el contenido y los límites permitidos.');
  }
  throw Error(response.status>=500?'El servidor no pudo completar la operación. Inténtalo de nuevo.':'No se pudo completar la operación.');
 }
 if(data===null)throw Error('El servidor devolvió una respuesta inesperada. Inténtalo de nuevo.');
 return data;
}
async function downloadDocument(event:React.MouseEvent<HTMLAnchorElement>,document:Row){
 if(document.size<=4*1024*1024)return;
 event.preventDefault();
 const link=event.currentTarget;
 if(link.getAttribute('aria-busy')==='true')return;
 link.setAttribute('aria-busy','true');
 try{
  const chunks:Blob[]=[];
  for(let index=0;index<Math.ceil(document.size/(2*1024*1024));index++){
   const response=await fetch(`/api/v1/documents/${document.id}/download?part=${index}`);
   if(!response.ok)throw Error('No se pudo descargar el archivo. Vuelve a intentarlo.');
   chunks.push(await response.blob());
  }
  const url=URL.createObjectURL(new Blob(chunks));const anchor=window.document.createElement('a');
  anchor.href=url;anchor.download=document.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(error){window.alert((error as Error).message)}finally{link.removeAttribute('aria-busy')}
}
export function ThemeButton({dark,toggle}:{dark:boolean;toggle:()=>void}){return <button className="theme-toggle" aria-label={dark?'Activar modo claro':'Activar modo nocturno'} aria-pressed={dark} title={dark?'Modo claro':'Modo nocturno'} onClick={toggle}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button>}

export function LoginScreen({setup,onLogin,dark,toggle}:{setup:boolean;onLogin:(u:User)=>void;dark:boolean;toggle:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[register,setRegister]=useState(false);
 const [googleEnabled,setGoogleEnabled]=useState(false);
 useEffect(()=>{request('auth/google/config').then(config=>setGoogleEnabled(config.enabled)).catch(()=>setGoogleEnabled(false))},[]);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[emailFocused,setEmailFocused]=useState(false),[passwordFocused,setPasswordFocused]=useState(false);
 useEffect(()=>{setEmail('');setPassword('');setEmailFocused(false);setPasswordFocused(false)},[register]);
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');try{onLogin(await request('auth/'+(setup?'setup':'login'),'POST',Object.fromEntries(new FormData(e.currentTarget))))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="login-layout"><section className="login-story"><a className="brand" href="#"><span className="brand-icon"><Cloud size={32}/></span><span>Nix<small>GESTIÓN EMPRESARIAL</small></span></a><div className="login-copy"><span className="login-kicker">EL SIGUIENTE PASO DE TU EMPRESA</span><h1>Todo tu negocio.<br/>Una sola visión.</h1><p>Conecta tus operaciones, cuida tus recursos y toma decisiones con claridad.</p><div className="login-highlights"><span><Check size={17}/> Operaciones integradas</span><span><Check size={17}/> Información siempre a mano</span><span><Check size={17}/> Control en cada movimiento</span></div></div><small>Nix · Gestión empresarial</small><div className="login-orbit"/></section><section className="login-side"><div className="login-theme"><ThemeButton dark={dark} toggle={toggle}/></div><div className="login-form"><span className="large-icon"><LockKeyhole size={25}/></span><div className="eyebrow">BIENVENIDO A NIX</div><h2>{register?'Tu cuenta empieza aquí':setup?'Construyamos tu espacio':'Qué bueno verte de nuevo'}</h2><p>{register?'Regístrate con tu Gmail para empezar a usar Nix.':setup?'Crea la cuenta administradora para empezar a gestionar tu empresa.':'Ingresa a tu cuenta para continuar con tu día.'}</p><GoogleSignIn onLogin={onLogin} registration={register||setup}/>{!register&&<form id="login-password-form" autoComplete="off" onSubmit={submit}>{setup&&<label>Nombre completo<input name="name" required minLength={2} maxLength={100} autoComplete="name" placeholder="Tu nombre"/></label>}<label>Correo electrónico<input name="email" type="email" required maxLength={160} autoComplete="off" value={email} onChange={event=>setEmail(event.target.value)} readOnly={!emailFocused} onFocus={()=>setEmailFocused(true)} placeholder="nombre@empresa.com"/></label><label>Contraseña<input name="password" type="password" value={password} onChange={event=>setPassword(event.target.value)} readOnly={!passwordFocused} onFocus={()=>setPasswordFocused(true)} required minLength={setup?12:1} maxLength={200} autoComplete={setup?'new-password':'off'} placeholder={setup?'Mínimo 12 caracteres':'Tu contraseña'}/></label>{error&&<div className="inline-error" role="alert">{error}</div>}<button className="btn primary full" disabled={busy}>{busy?<RefreshCw size={17} className="spin"/>:<ArrowRight size={17}/>} {busy?'Un momento…':setup?'Crear mi espacio':'Iniciar sesión'}</button></form>}{googleEnabled&&<div className="login-register">{register?'¿Ya tienes cuenta? ':'¿No tienes cuenta? '}<button type="button" onClick={()=>{setRegister(value=>!value);setError('')}}>{register?'Inicia sesión':'Regístrate'}</button></div>}<div className="login-security"><Shield size={14}/> Sesión privada · Acceso por roles</div></div></section></div>
}

export function DocumentsPanel({documents,onSaved,notify,canUpload,onExport,user}:{user:User;onExport:(rows:Row[])=>void;documents:Row[];onSaved:()=>Promise<void>;notify:(s:string)=>void;canUpload:boolean}){
 const [search,setSearch]=useState(''),[category,setCategory]=useState('Todos'),[upload,setUpload]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [pendingDelete,setPendingDelete]=useState<Row|null>(null),[deleting,setDeleting]=useState(false),[deleteError,setDeleteError]=useState('');
 const deleteDialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=deleteDialog.current;if(pendingDelete&&!dialog?.open)dialog?.showModal();else if(!pendingDelete&&dialog?.open)dialog.close()},[pendingDelete]);
 const canDelete=(document:Row)=>canUpload&&(user.role==='Administrador'||document.uploadedBy===user.id);
 async function removeDocument(){if(!pendingDelete||deleting)return;setDeleting(true);setDeleteError('');try{await request(`documents/${pendingDelete.id}`,'DELETE');setPendingDelete(null);await onSaved();notify('Documento eliminado.')}catch(error){setDeleteError((error as Error).message)}finally{setDeleting(false)}}
 const categories=['General','Facturas','Contratos','Órdenes','Comprobantes'];
 const rows=documents.filter(d=>(category==='Todos'||d.category===category)&&`${d.name} ${d.reference}`.toLowerCase().includes(search.toLowerCase()));
 const size=(v:number)=>v===0?'0 KB':v>1048576?(v/1048576).toFixed(1)+' MB':Math.max(1,Math.round(v/1024))+' KB';
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setError('');try{await request('documents','POST',new FormData(e.currentTarget));await onSaved();setUpload(false);notify('Documento guardado en el repositorio.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <><dialog ref={deleteDialog} className="document-delete-dialog" aria-labelledby="delete-document-title" aria-describedby="delete-document-warning" onCancel={event=>{if(deleting)event.preventDefault();else setPendingDelete(null)}} onClose={()=>{if(!deleting)setPendingDelete(null)}}><TriangleAlert size={28}/><h2 id="delete-document-title">Eliminar documento</h2><p id="delete-document-warning">Se eliminará permanentemente <strong>{pendingDelete?.name}</strong> y su archivo. Esta acción no se puede deshacer.</p>{deleteError&&<p className="inline-error" role="alert">{deleteError}</p>}<div className="document-delete-actions"><button type="button" className="btn" autoFocus disabled={deleting} onClick={()=>setPendingDelete(null)}>Cancelar</button><button type="button" className="btn danger" disabled={deleting} onClick={removeDocument}>{deleting?'Eliminando…':'Sí, eliminar'}</button></div></dialog><div className="document-stats"><article className="card"><Folder size={20}/><div><strong>{documents.length}</strong><span>Documentos en tu repositorio</span></div></article><article className="card"><Cloud size={20}/><div><strong>{size(documents.reduce((s,d)=>s+d.size,0))}</strong><span>Almacenamiento utilizado</span></div></article><button className="btn primary" disabled={!canUpload} onClick={()=>setUpload(!upload)}><Upload size={16}/>{upload?'Ocultar formulario':'Subir documento'}</button></div>{upload&&<article className="card inline-form"><div className="section-title"><h3>Agregar al repositorio</h3><p>Guarda facturas, contratos, órdenes y comprobantes como respaldo. Puedes anotar la referencia de una operación.</p><p>PDF, imágenes, Office, CSV o TXT · Hasta 10 MB por archivo</p></div><form onSubmit={submit}><div className="form-grid"><label>Archivo<input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv,.txt"/></label><ChoicePicker label="Categoría" name="category" disabled={busy}>{categories.map(c=><option key={c}>{c}</option>)}</ChoicePicker><label>Referencia de operación<input name="reference" maxLength={100} placeholder="Ej. VEN-2026-0045"/></label></div>{error&&<div className="inline-error" role="alert">{error}</div>}<button className="btn primary" disabled={busy}>{busy?<RefreshCw size={16} className="spin"/>:<Upload size={16}/>} Guardar documento</button></form></article>}<article className="card"><div className="table-toolbar"><div className="search-box"><Search size={17}/><input aria-label="Buscar documentos" placeholder="Buscar documentos o referencias…" value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="btn" onClick={()=>onExport(rows)}><Download size={16}/> Exportar</button><ChoicePicker compact label="Categoría documental" value={category} onChange={setCategory}>{['Todos',...categories].map(c=><option key={c}>{c}</option>)}</ChoicePicker></div><div className="table-scroll"><table><thead><tr><th>Documento</th><th>Categoría</th><th>Referencia</th><th>Tamaño</th><th>Fecha</th><th/></tr></thead><tbody>{rows.map(d=><tr key={d.id}><td><div className="entity"><span className="product-icon"><FileText size={19}/></span><strong>{d.name}</strong></div></td><td><span className="badge blue">{d.category}</span></td><td>{d.reference||'—'}</td><td>{size(d.size)}</td><td>{new Date(d.date).toLocaleDateString('es-PE')}</td><td><a className="btn" href={`/api/v1/documents/${d.id}/download`} onClick={event=>downloadDocument(event,d)} download><Download size={14}/> Descargar</a>{canDelete(d)&&<button type="button" className="btn danger document-delete-button" aria-label={'Eliminar '+d.name} disabled={busy||deleting} onClick={()=>{setDeleteError('');setPendingDelete(d)}}><Trash2 size={14}/> Eliminar</button>}</td></tr>)}</tbody></table>{!rows.length&&<div className="empty"><Folder size={35}/><h3>{search?'No encontramos documentos':'Organiza tus documentos empresariales'}</h3><p>{search?'Prueba con otro término.':'Sube tu primer archivo para tenerlo siempre a mano.'}</p></div>}</div></article></>
}

export function EditRecordForm({record,onSaved,notify,onClose,onBusyChange,onDirtyChange}:{record:Row;onSaved:()=>Promise<void>;notify:(s:string)=>void;onClose:()=>void;onBusyChange?:(busy:boolean)=>void;onDirtyChange?:(dirty:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[adjust,setAdjust]=useState(false);
 const [pendingSave,setPendingSave]=useState<{path:string;method:string;body:object}|null>(null),[changed,setChanged]=useState(false);
 const product=record._kind==='products';
 function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));const path=adjust?'inventory/adjustments':product?`products/${record.id}`:`contacts/${record._kind}/${record.id}`;const body=adjust?{productId:record.id,quantity:Number(f.quantity),reason:f.reason}:product?{...f,price:Number(f.price),cost:Number(f.cost),stock:record.stock,minimum:Number(f.minimum)}:f;setPendingSave({path,method:adjust?'POST':'PUT',body})}
 async function persist(){if(!pendingSave||busy)return;setBusy(true);onBusyChange?.(true);setError('');try{await request(pendingSave.path,pendingSave.method,pendingSave.body);await onSaved();onClose();notify(adjust?'Existencias actualizadas.':'Registro actualizado.')}catch(e){setError((e as Error).message)}finally{setBusy(false);onBusyChange?.(false)}}

 return <>{pendingSave&&<div className="invoice-confirm" role="alert"><h3>{adjust?'Confirmar ajuste de inventario':'Confirmar cambios'}</h3><p>{record.name}</p>{adjust&&<><p>Variación: <strong>{(pendingSave.body as {quantity:number}).quantity} unidades</strong></p><p>Motivo: {(pendingSave.body as {reason:string}).reason}</p></>}{error&&<p className="inline-error">{error}</p>}<div className="dialog-actions"><button type="button" className="btn" disabled={busy} onClick={()=>setPendingSave(null)}>Volver a editar</button><button type="button" className="btn primary" disabled={busy} onClick={persist}>{busy?'Guardando…':'Sí, guardar'}</button></div></div>}<form hidden={!!pendingSave} onChange={()=>setChanged(true)} onSubmit={submit}><p className="form-intro">{record.name}</p>{product&&<div className="workspace-tabs compact"><button type="button" disabled={busy||changed} title={changed?'Guarda los cambios antes de cambiar de sección':undefined} className={!adjust?'selected':''} onClick={()=>setAdjust(false)}>Datos del producto</button><button type="button" disabled={busy||changed} title={changed?'Guarda los cambios antes de cambiar de sección':undefined} className={adjust?'selected':''} onClick={()=>setAdjust(true)}><Package size={15}/> Ajustar stock</button></div>}{adjust?<><div className="settings-note">Existencias actuales: {record.stock} unidades</div><label>Cantidad a ajustar<input name="quantity" type="number" required min="-100000" max="100000" placeholder="Ej. 10 para entrada o -2 para salida"/></label><label>Motivo del ajuste<textarea name="reason" required minLength={5} maxLength={250} placeholder="Describe el motivo para mantener la trazabilidad"/></label></>:product?<><label>Nombre<input name="name" defaultValue={record.name} minLength={2} maxLength={160} required/></label><div className="form-grid">{[['sku','SKU'],['category','Categoría'],['price','Precio de venta (S/)'],['cost','Costo (S/)'],['minimum','Stock mínimo']].map(([k,l])=><label key={k}>{l}<input name={k} defaultValue={record[k]} required type={['price','cost','minimum'].includes(k)?'number':'text'} min={k==='price'?'0.01':'0'} max={k==='minimum'?'1000000':['price','cost'].includes(k)?'9999999999.99':undefined} minLength={['sku','category'].includes(k)?2:undefined} step={k==='minimum'?'1':'0.01'} maxLength={k==='sku'?40:60}/></label>)}</div></>:<ContactFields customer={record._kind==='customers'} initial={record} busy={busy} onDirty={()=>{setChanged(true);onDirtyChange?.(true)}}/>}{error&&<div className="inline-error" role="alert">{error}</div>}<button className="btn primary full submit" disabled={busy}>{busy?<RefreshCw className="spin" size={16}/>:<Check size={16}/>} Guardar cambios</button></form></>
}
