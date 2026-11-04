import {documentType,receiptType} from './commercial';
import {orderBalance,type BusinessRow} from './orderView';

export const invoiceMoney=(value:number)=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(value||0);
export function invoiceDate(value?:string){
 if(!value)return 'Sin registrar';
 // A due date is a calendar day, not midnight UTC in another time zone.
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const [year,month,day]=value.split('-');return `${day}/${month}/${year}`}
 const parsed=new Date(value);
 return Number.isNaN(parsed.getTime())?'Sin registrar':parsed.toLocaleDateString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric'});
}
export function invoiceDocument(order:BusinessRow,payments:BusinessRow[]=[]){
 const invoice=order.invoice;if(!invoice)throw Error('La operación no tiene un comprobante registrado.');
 const purchase=order.kind==='purchases'||order._kind==='purchases';
 const issuer=(purchase?invoice.contact:invoice.company)||{};
 const customer=(purchase?invoice.company:invoice.contact)||{};
 const outstanding=orderBalance(order),cancelled=order.status==='Anulado';
 return {
  type:receiptType(order),number:String(invoice.number||''),purchase,issuer,customer,
  issuerDocument:documentType(issuer),customerDocument:documentType(customer),
  issuedAt:invoiceDate(invoice.issuedAt),dueDate:invoiceDate(invoice.dueDate),reference:String(order.reference||''),
  terms:order.paymentDays===undefined?'Sin especificar':Number(order.paymentDays)>0?`Crédito a ${order.paymentDays} días`:'Al contado',
  status:cancelled?'Anulado':outstanding===0?'Pagado':Number(order.paid)>0?'Pago parcial':'Pendiente de pago',
  cancelled,outstanding,paid:Number(order.paid||0),subtotal:Number(invoice.subtotal),tax:Number(invoice.tax),total:Number(invoice.total),taxRate:Number(invoice.taxRate??18),
  lines:((invoice.lines||[]) as BusinessRow[]).map((line:BusinessRow,index:number)=>({number:index+1,name:String(line.name||''),quantity:Number(line.quantity),price:Number(line.price),total:Math.round(Number(line.quantity)*Number(line.price)*100)/100})),
  payments:payments.filter(payment=>payment.orderId===order.id).slice().sort((a,b)=>a.date.localeCompare(b.date)),
  notice:purchase?'Registro interno de un comprobante del proveedor. No sustituye el documento original.':'Comprobante interno. Sin validez como comprobante electrónico SUNAT.',
 };
}
