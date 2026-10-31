import {useState} from 'react';
import {Download,Files,RefreshCw} from 'lucide-react';
import {Dialog} from './Dialog';
import {documentType} from './commercial';
import {paymentReceiptNumber} from './paymentDetails';
import {downloadBlob} from './exportReport';
type Row={id:number;name:string;[key:string]:any};
const money=(value:number)=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(value);
export function PaymentReceipt({payment,company,close,onInvoice}:{payment:Row;company:{name:string;taxId?:string;address?:string};close:()=>void;onInvoice:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const order=payment._order,number=paymentReceiptNumber(payment.id);
 const identity=order?.invoice?.contact||order?.contactSnapshot;
 const date=new Date(payment.date).toLocaleString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
 const receipt=payment.receiptNumber?`${payment.receiptType} ${payment.receiptNumber}`:'Sin comprobante vinculado';
 const details=[['Movimiento',payment.type||'No especificado'],['Fecha y hora (Lima)',date],['Cliente / proveedor',payment.name],...(identity?.taxId?[[documentType(identity),identity.taxId]]:[]),['Operación',order?.reference||payment.reference||'No disponible'],['Método de pago',payment.method||'No especificado'],['Referencia del pago',payment.paymentReference||'Sin referencia'],['Comprobante asociado',receipt],['Estado del pago',payment.status||'Registrado']];
 async function download(){
  setBusy(true);setError('');
  try{
   const [{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
   const doc=new jsPDF();
   doc.setFillColor(168,82,45);doc.rect(0,0,210,39,'F');doc.setTextColor(255);doc.setFontSize(17);doc.text('COMPROBANTE DE PAGO',14,16);doc.setFontSize(11);doc.text(number,14,27);
   doc.setTextColor(52,55,49);doc.setFontSize(11);
   const heading=doc.splitTextToSize(`${company.name}\nRUC: ${company.taxId||'Sin configurar'}${company.address?'\n'+company.address:''}`,180);
   doc.text(heading,14,50);
   autoTable(doc,{startY:55+heading.length*5,head:[['Detalle','Información']],body:[...details,['Importe de este pago',money(payment.amount)],...(order?[['Total de la operación',money(order.amount)],['Pagado acumulado a la fecha',money(order.paid)],['Saldo actual',money(Math.max(0,order.amount-order.paid))]]:[])],theme:'striped',headStyles:{fillColor:[168,82,45]},styles:{fontSize:10,cellPadding:4,overflow:'linebreak'},columnStyles:{0:{cellWidth:63}},margin:{bottom:25}});
   const count=doc.getNumberOfPages();
   for(let page=1;page<=count;page++){doc.setPage(page);doc.setFontSize(8);doc.setTextColor(100);doc.text('Constancia interna del pago registrado. No sustituye la factura o boleta.',14,283);doc.text(`${number} · Página ${page} de ${count}`,14,289);}
   downloadBlob(doc.output('blob'),number.toLowerCase()+'.pdf');
  }catch{setError('No se pudo generar el comprobante. Inténtalo nuevamente.')}finally{setBusy(false)}
 }
 return <Dialog title={'Comprobante de pago '+number} size="detail" busy={busy} close={close}>
  <div className="payment-receipt-heading"><strong>{company.name}</strong><small>RUC: {company.taxId||'Sin configurar'}</small><span>Importe de este pago</span><h2>{money(payment.amount)}</h2></div>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  <dl>{details.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  {order&&<div className="invoice-summary"><span>Total operación<strong>{money(order.amount)}</strong></span><span>Pagado acumulado<strong>{money(order.paid)}</strong></span><span>Saldo actual<strong>{money(Math.max(0,order.amount-order.paid))}</strong></span></div>}
  <p className="form-note">Constancia interna del pago registrado. No sustituye la factura o boleta. Los saldos muestran el estado actual de la operación.</p>
  <div className="dialog-actions">{order&&<button className="btn" disabled={busy} onClick={onInvoice}><Files size={16}/>{payment.receiptNumber?'Ver '+payment.receiptType.toLowerCase():'Ver operación'}</button>}<button className="btn primary" disabled={busy} onClick={download}>{busy?<RefreshCw className="spin" size={16}/>:<Download size={16}/>}Descargar comprobante</button></div>
 </Dialog>;
}
