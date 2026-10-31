import {openIncidents} from './logistics';
export type PendingRow={id:number;[key:string]:any};
export const pendingCategories=[
 {key:'quotes',label:'Cotizaciones por resolver'},
 {key:'invoices',label:'Operaciones sin comprobante'},
 {key:'receivables',label:'Cobros pendientes'},
 {key:'payables',label:'Pagos a proveedores'},
 {key:'prepare',label:'Pedidos por preparar'},
 {key:'dispatch',label:'Pedidos por despachar'},
 {key:'delivery',label:'Entregas por confirmar'},
 {key:'stock',label:'Productos por reponer'},
] as const;
export type PendingCategory=typeof pendingCategories[number]['key'];
export type PendingTask={key:string;category:PendingCategory;record:PendingRow;target:'quote'|'order'|'product';title:string;entity:string;action:string;amount?:number;dueDate?:string;priority:'urgent'|'today'|'normal';note:string};
export function limaDate(value=new Date()):string{
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
}
export function buildPending(data:Record<string,PendingRow[]>,today=limaDate()):PendingTask[]{
 const tasks:PendingTask[]=[];
 const priority=(due?:string):PendingTask['priority']=>due&&due<today?'urgent':due===today?'today':'normal';
 const add=(category:PendingCategory,record:PendingRow,details:Omit<PendingTask,'key'|'category'|'record'>)=>tasks.push({key:`${category}-${record.id}`,category,record,...details});
 for(const r of data.quotes||[]){
  if(r.status!=='Cotización'||r.orderId)continue;
  const expired=!!r.validUntil&&r.validUntil<today;
  add('quotes',r,{target:'quote',title:String(r.reference||`Cotización #${r.id}`),entity:r.name,action:expired?'Revisar cotización vencida':'Confirmar o rechazar cotización',amount:r.amount,dueDate:r.validUntil,priority:priority(r.validUntil),note:expired?'La vigencia terminó; requiere una nueva propuesta o cierre.':'Propuesta abierta. Todavía no genera deuda ni mueve stock.'});
 }
 for(const kind of ['sales','purchases'])for(const r of data[kind]||[]){
  if(r.status==='Anulado')continue;
  const record={...r,_kind:kind};
  const contact=r.contactSnapshot||(data.customers||[]).find(c=>c.id===r.contactId);
  const billType=r.receiptType||((contact?.documentType==='DNI'||(!contact?.documentType&&contact?.taxId?.length===8))?'Boleta':'Factura');
  const common={target:'order' as const,title:String(r.reference||`${kind==='sales'?'Venta':'Compra'} #${r.id}`),entity:r.name};
  if(!r.invoice)add('invoices',record,{...common,action:kind==='sales'?`Emitir ${billType.toLowerCase()}`:'Registrar factura del proveedor',amount:r.amount,priority:'normal',note:r.lines?.length?'Operación confirmada sin comprobante vinculado.':'Registro histórico sin detalle de productos; requiere revisión.'});
  const balance=Math.round((Number(r.amount)-Number(r.paid||0))*100)/100;
  if(balance>0){
   const due=r.invoice?.dueDate;
   add(kind==='sales'?'receivables':'payables',record,{...common,action:kind==='sales'?'Registrar cobro':'Registrar pago al proveedor',amount:balance,dueDate:due,priority:priority(due),note:due?(due<today?'Saldo vencido.':due===today?'El saldo vence hoy.':'Saldo pendiente de pago.'):'Sin comprobante: el saldo aún no tiene vencimiento definido.'});
  }
  if(kind==='sales'&&r.deliveryStage!=='Entregado'){
   const stage=r.deliveryStage||'Pendiente';
   const deliveryDate=r.logistics?.scheduledDate||r.deliveryDate;
   const incidents=openIncidents(r).length;
   const category=stage==='Despachado'?'delivery':stage==='Preparando'?'dispatch':'prepare';
   add(category,record,{...common,action:incidents?'Atender incidencia logística':category==='delivery'?'Confirmar entrega':category==='dispatch'?'Registrar despacho':'Preparar pedido',dueDate:deliveryDate,priority:incidents?'urgent':priority(deliveryDate),note:incidents?`${incidents} incidencia(s) pendiente(s) en la entrega.`:deliveryDate&&deliveryDate<today?'La fecha prevista de entrega ya pasó.':!r.deliveryStage?'Sin estado de entrega registrado; verificar la preparación o entrega.':category==='delivery'?'Despachado; falta la constancia de entrega.':category==='dispatch'?'En preparación; falta registrar la salida para entrega.':'Confirmado; falta comenzar la preparación.'});
  }
  if(kind==='sales'&&r.deliveryStage==='Entregado'&&openIncidents(r).length)add('delivery',record,{...common,action:'Resolver incidencia posterior a la entrega',priority:'urgent',note:`${openIncidents(r).length} incidencia(s) pendiente(s). La entrega ya fue confirmada.`});
 }
 for(const r of data.products||[]){
  if(r.stock>0&&r.stock>=r.minimum)continue;
  add('stock',r,{target:'product',title:String(r.sku||`Producto #${r.id}`),entity:r.name,action:'Revisar reposición',priority:r.stock===0?'urgent':'normal',note:`${r.stock} unidades disponibles · Mínimo: ${r.minimum} · Reponer al menos ${Math.max(1,r.minimum-r.stock)} unidades.`});
 }
 const rank={urgent:0,today:1,normal:2};
 return tasks.sort((a,b)=>rank[a.priority]-rank[b.priority]||(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.title.localeCompare(b.title));
}
