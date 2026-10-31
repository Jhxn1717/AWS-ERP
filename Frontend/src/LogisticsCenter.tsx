import {useState,type FormEvent} from 'react';
import {Truck,MapPin,Search,TriangleAlert,Package,CheckCircle,RefreshCw,ArrowRight,ExternalLink} from 'lucide-react';
import {Dialog} from './Dialog';
import {request} from './WorkspacePanels';
import {deliveryStages,openIncidents,lastPosition,deliveryOverdue,positionMap} from './logistics';
import {orderTimeline,type BusinessRow as Row} from './orderView';
import './logistics.css';

type Props={sales:Row[];payments:Row[];canWrite:boolean;onSaved:()=>Promise<void>;onDocument:(id:number)=>void;notify:(text:string)=>void;initialOrderId?:number;detailOnly?:boolean;onClose?:()=>void};
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Lima'});
const date=(value:string)=>value?new Date(value.length===10?value+'T12:00:00Z':value).toLocaleString('es-PE',{timeZone:'America/Lima',...(value.length===10?{dateStyle:'medium'}:{dateStyle:'medium',timeStyle:'short'})}):'Sin programar';

export function LogisticsCenter({sales,payments,canWrite,onSaved,onDocument,notify,initialOrderId,detailOnly=false,onClose}:Props){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('Activas'),[selected,setSelected]=useState<number|null>(initialOrderId||null);
 const [action,setAction]=useState<'assignment'|'position'|'incident'|'resolution'|'stage'|null>(null),[incidentId,setIncidentId]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirmation,setConfirmation]=useState<{path:string;body:object}|null>(null);
 const orders=sales.filter(s=>s.status!=='Anulado'),order=sales.find(s=>s.id===selected);
 const position=order&&lastPosition(order),incidents=order?openIncidents(order):[],stage=order?.status==='Anulado'?'Anulado':order?.deliveryStage||'Pendiente';
 const next=deliveryStages.includes(stage as any)?deliveryStages[deliveryStages.indexOf(stage as any)+1]:undefined;
 const rows=orders.filter(s=>{
  const stage=s.deliveryStage||'Pendiente';
  return (filter==='Todas'||filter==='Activas'&&stage!=='Entregado'||filter===stage||filter==='Con incidencias'&&openIncidents(s).length>0||filter==='Atrasadas'&&deliveryOverdue(s,today()))&&[s.reference,s.name,...Object.values(s.logistics||{})].join(' ').toLowerCase().includes(query.toLowerCase());
 }).sort((a,b)=>Number(deliveryOverdue(b,today()))-Number(deliveryOverdue(a,today()))||(b.date||'').localeCompare(a.date||''));
 function openAction(value:typeof action,id=''){setError('');setIncidentId(id);setAction(value)}
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!order)return;
  const values=Object.fromEntries(new FormData(event.currentTarget));
  let body:object=values,path=`orders/sales/${order.id}/logistics`;
  if(action==='stage'){path=`orders/sales/${order.id}/tracking`;body={stage:next,note:values.note}}
  else if(action!=='assignment'){path+='/events';body={type:action,note:values.note,...(action==='position'?{latitude:Number(values.latitude),longitude:Number(values.longitude)}:{}),...(action==='resolution'?{incidentId}:{})}}
  setConfirmation({path,body});
 }
 async function save(){if(!confirmation)return;setBusy(true);setError('');try{await request(confirmation.path,'POST',confirmation.body);await onSaved();setConfirmation(null);setAction(null);notify('Seguimiento actualizado correctamente.')}catch(e){setError((e as Error).message);setConfirmation(null)}finally{setBusy(false)}}
 const assignment=order?.logistics||{};
 return <div className="logistics-center">
  {!detailOnly&&<>
  <section className="logistics-metrics">{[
   ['Por preparar',orders.filter(s=>!s.deliveryStage||s.deliveryStage==='Pendiente').length,Package,'Pendiente'],
   ['En preparación',orders.filter(s=>s.deliveryStage==='Preparando').length,Package,'Preparando'],
   ['En ruta',orders.filter(s=>s.deliveryStage==='Despachado').length,Truck,'Despachado'],
   ['Atrasadas',orders.filter(s=>deliveryOverdue(s,today())).length,TriangleAlert,'Atrasadas'],
   ['Con incidencias',orders.filter(s=>openIncidents(s).length).length,TriangleAlert,'Con incidencias'],
   ['Entregadas',orders.filter(s=>s.deliveryStage==='Entregado').length,CheckCircle,'Entregado'],
  ].map(([label,count,Icon,value])=>{const Symbol=Icon as typeof Truck;return <button key={String(label)} className={'card logistics-metric '+(filter===value?'selected':'')} onClick={()=>setFilter(String(value))}><Symbol size={18}/><span>{String(label)}</span><strong>{Number(count)}</strong></button>})}</section>
  <article className="card"><div className="table-toolbar"><div className="search-box"><Search size={17}/><input aria-label="Buscar entregas" placeholder="Pedido, cliente, transportista o placa…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="logistics-filters"><select aria-label="Estado de entrega" value={filter} onChange={e=>setFilter(e.target.value)}>{['Activas','Todas',...deliveryStages,'Atrasadas','Con incidencias'].map(f=><option key={f}>{f}</option>)}</select><button className="icon-button" aria-label="Actualizar entregas" onClick={onSaved}><RefreshCw size={17}/></button></div></div>
   <div className="table-scroll"><table><thead><tr><th>Pedido / cliente</th><th>Transporte</th><th>Destino / fecha prevista</th><th>Entrega</th><th>Último reporte</th><th/></tr></thead><tbody>{rows.map(s=>{const p=lastPosition(s);return <tr key={s.id}><td><strong>{s.reference}</strong><small className="block">{s.name}</small></td><td>{s.logistics?.carrier||'Sin asignar'}<small className="block">{s.logistics?.plate||'Vehículo pendiente'}</small></td><td><span className="logistics-address">{s.logistics?.destination||s.contactSnapshot?.address||'Dirección pendiente'}</span><small className={'block '+(deliveryOverdue(s,today())?'logistics-warning':'')}>{date(s.logistics?.scheduledDate||s.deliveryDate)}{deliveryOverdue(s,today())?' · Atrasada':''}</small></td><td><span className="badge">{s.deliveryStage||'Pendiente'}</span>{openIncidents(s).length>0&&<small className="block logistics-warning">{openIncidents(s).length} incidencia(s)</small>}</td><td>{p?date(p.date):'Sin ubicación registrada'}</td><td><button className="btn" onClick={()=>setSelected(s.id)}>Rastrear <ArrowRight size={14}/></button></td></tr>})}</tbody></table></div>
   {!rows.length&&<div className="empty"><Truck size={30}/><h3>{orders.length?'Sin entregas para este filtro':'Aún no hay entregas'}</h3><p>{orders.length?'Prueba con otro estado o búsqueda.':'Las ventas confirmadas aparecerán aquí para organizar su despacho.'}</p></div>}
   <div className="table-footer"><span>{rows.length} entregas · Estado logístico independiente del cobro</span></div>
  </article>
  </>}
  {order&&<Dialog title={'Rastreo · '+order.reference} size="operation" close={()=>{setSelected(null);onClose?.()}}><div className="logistics-detail">
   <div className="logistics-detail-heading"><div><h3>{order.name}</h3><p>{stage} · {order.logistics?.carrier||'Transporte sin asignar'}</p><small>Estado de cobro: {order.status} · Saldo: {new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Math.max(0,order.amount-order.paid))}</small></div><button className="btn" onClick={()=>{setSelected(null);onDocument(order.id)}}>Ver comprobante</button></div>
   <ol className="logistics-stages">{deliveryStages.map((value,index)=><li key={value} className={index<=deliveryStages.indexOf(stage as any)?'complete':''}><span>{index+1}</span>{value}</li>)}</ol>
   <div className="logistics-detail-grid"><section><div className="logistics-map">{position?<iframe title={'Última ubicación de '+order.reference} src={positionMap(position)} loading="lazy" referrerPolicy="no-referrer"/>:<div className="empty"><MapPin size={30}/><h3>Sin ubicación registrada</h3><p>Asigna el transporte y registra un reporte con coordenadas para verlo en el mapa.</p></div>}</div><div className="logistics-location-note">{position?<><strong>Última ubicación reportada</strong><span>{date(position.date)} · {position.user}</span><span>{position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}</span><a target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${position.latitude}&mlon=${position.longitude}#map=14/${position.latitude}/${position.longitude}`}>Abrir mapa <ExternalLink size={12}/></a></>:<span>El mapa se habilita cuando existe un reporte de ubicación.</span>}<small>Ubicaciones registradas manualmente. No hay un dispositivo GPS conectado.</small></div>
    <h3>Productos del pedido</h3><div className="table-scroll"><table><thead><tr><th>Producto</th><th>Cantidad</th></tr></thead><tbody>{(order.lines||[]).map((line:any,index:number)=><tr key={index}><td>{line.name}<small className="block">{line.sku}</small></td><td>{line.quantity}</td></tr>)}</tbody></table>{!order.lines?.length&&<p>Esta venta histórica no tiene detalle de productos.</p>}</div>
    <h3>Historial de la operación</h3><ol className="logistics-timeline">{orderTimeline({...order,kind:'sales'},payments).slice().reverse().map(event=><li key={event.key}><small>{date(event.date)}</small><strong>{event.title}</strong><p>{event.detail}</p></li>)}</ol>
   </section><aside className="logistics-assignment"><h3>Datos del envío</h3><dl>{[['Origen',assignment.origin||order.warehouse||'Almacén principal'],['Destino',assignment.destination||order.contactSnapshot?.address||'Sin registrar'],['Entrega prevista',date(assignment.scheduledDate||order.deliveryDate)],['Transportista',assignment.carrier||'Sin asignar'],['Conductor',assignment.driver||'Sin asignar'],['Teléfono',assignment.phone||'Sin registrar'],['Placa',assignment.plate||'Sin registrar'],['Referencia de despacho',assignment.dispatchReference||'Sin registrar']].map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    {canWrite&&<div className="logistics-actions">{stage!=='Entregado'&&stage!=='Anulado'&&<><button className="btn" onClick={()=>openAction('assignment')}>{order.logistics?'Editar transporte':'Asignar transporte'}</button><button className="btn" disabled={!order.logistics} onClick={()=>openAction('position')}><MapPin size={15}/> Registrar ubicación</button><button className="btn" disabled={!order.logistics} onClick={()=>openAction('incident')}><TriangleAlert size={15}/> Reportar incidencia</button>{next&&<button className="btn primary" onClick={()=>openAction('stage')}>Pasar a {next.toLowerCase()}</button>}</>}</div>}
    <h3>Incidencias pendientes</h3>{incidents.length?incidents.map(e=><div className="logistics-incident" key={e.id}><small>{date(e.date)}</small><p>{e.note}</p>{canWrite&&stage!=='Anulado'&&<button className="btn" onClick={()=>openAction('resolution',e.id)}>Resolver incidencia</button>}</div>):<p>No hay incidencias pendientes.</p>}
   </aside></div>
  </div></Dialog>}
  {order&&action&&<Dialog title={action==='assignment'?'Asignación del transporte':action==='position'?'Registrar ubicación':action==='incident'?'Reportar incidencia':action==='resolution'?'Resolver incidencia':'Confirmar '+next} close={()=>setAction(null)} busy={busy} trackChanges><form className="entry-form logistics-form" onSubmit={submit}>
   <p>{order.reference} · {order.name}</p>
   {action==='assignment'&&<><div className="form-grid"><label>Transportista / empresa<input name="carrier" required minLength={2} maxLength={100} defaultValue={assignment.carrier}/></label><label>Conductor<input name="driver" required minLength={2} maxLength={100} defaultValue={assignment.driver}/></label><label>Teléfono de contacto<input name="phone" type="tel" required minLength={6} maxLength={30} defaultValue={assignment.phone}/></label><label>Placa del vehículo<input name="plate" required minLength={3} maxLength={20} defaultValue={assignment.plate}/></label></div><label>Origen<input name="origin" required minLength={3} maxLength={250} defaultValue={assignment.origin||order.warehouse||'Almacén principal'}/></label><label>Dirección de entrega<input name="destination" required minLength={3} maxLength={250} defaultValue={assignment.destination||order.contactSnapshot?.address}/></label><div className="form-grid"><label>Fecha prevista<input type="date" name="scheduledDate" required min={order.date.slice(0,10)} defaultValue={assignment.scheduledDate||order.deliveryDate||today()}/></label><label>Referencia de despacho (opcional)<input name="dispatchReference" maxLength={60} defaultValue={assignment.dispatchReference}/></label></div></>}
   {action==='position'&&<><p>Registra las coordenadas reportadas por el conductor. La fecha, hora y usuario se guardan automáticamente.</p><div className="form-grid"><label>Latitud<input name="latitude" type="number" step="any" min={-90} max={90} required placeholder="Ej.: -12.0464"/></label><label>Longitud<input name="longitude" type="number" step="any" min={-180} max={180} required placeholder="Ej.: -77.0428"/></label></div></>}
   {action==='stage'&&<p>{next==='Entregado'?'Incluye el nombre de quien recibe y la constancia de entrega en el detalle.':'Describe el avance realizado para conservar la trazabilidad.'}</p>}
   <label>{action==='resolution'?'Solución aplicada':action==='stage'&&next==='Entregado'?'Receptor y constancia de entrega':'Detalle del reporte'}<textarea name="note" required minLength={3} maxLength={500} rows={3}/></label>
   {error&&<p role="alert">{error}</p>}<button className="btn primary full" disabled={busy}>Revisar y guardar</button>
  </form></Dialog>}
  {confirmation&&<Dialog title="¿Guardar este reporte?" size="confirm" close={()=>!busy&&setConfirmation(null)} busy={busy}><p>El registro se agregará al historial de {order?.reference} con tu usuario, fecha y hora.</p><div className="dialog-actions"><button className="btn" disabled={busy} onClick={()=>setConfirmation(null)}>Volver</button><button className="btn primary" disabled={busy} onClick={save}>{busy?'Guardando…':'Confirmar registro'}</button></div></Dialog>}
 </div>;
}
