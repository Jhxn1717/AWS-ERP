import {Files,ArrowRight} from 'lucide-react';
type Row={id:number;name:string;[key:string]:any};
const money=(value:number)=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(value);
export function PaymentLedger({rows,onOpen,onReceipt}:{rows:Row[];onOpen:(row:Row)=>void;onReceipt:(row:Row)=>void}){
 return <div className="table-scroll"><table><thead><tr><th>Movimiento / operación</th><th>Cliente / proveedor</th><th>Comprobante asociado</th><th>Método / referencia</th><th>Fecha</th><th>Importe pagado</th><th>Acciones</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} tabIndex={0} onClick={()=>onOpen(row)} onKeyDown={event=>{if(event.key==='Enter'&&event.target===event.currentTarget)onOpen(row)}}>
  <td><strong>{row.reference}</strong><small className="block">{row.type} · {row.paymentNumber}</small></td><td>{row.name}</td>
  <td>{row.receiptNumber?<><strong>{row.receiptType}</strong><small className="block">{row.receiptNumber}</small></>:<span className="muted">{row._order?'Sin comprobante vinculado':'Operación no disponible'}</span>}</td>
  <td><strong>{row.method||'No especificado'}</strong><small className="block">{row.paymentReference||'Sin referencia de pago'}</small></td>
  <td>{new Date(row.date).toLocaleDateString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'short',year:'numeric'})}</td><td className="numeric"><strong>{money(row.amount)}</strong></td>
  <td><div className="operation-row-actions" onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}><button className="btn" onClick={()=>onOpen(row)}>Comprobante de pago <ArrowRight size={14}/></button>{row._order&&<button className="btn" onClick={()=>onReceipt(row)}><Files size={14}/>{row.receiptNumber?'Ver '+row.receiptType.toLowerCase():'Ver operación'}</button>}</div></td>
 </tr>)}</tbody></table>{!rows.length&&<div className="empty"><Files size={28}/><h3>Sin pagos para mostrar</h3><p>Registra un pago o cambia la búsqueda.</p></div>}</div>;
}
