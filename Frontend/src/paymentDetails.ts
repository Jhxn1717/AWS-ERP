import {receiptType} from './commercial';
type Row={id:number;[key:string]:any};
export function paymentReceiptNumber(id:number):string{return 'CP-'+String(id).padStart(8,'0')}
export function paymentDetails<T extends Row>(payment:T,data:Record<string,Row[]>){
 const kind=payment.type==='Ingreso'?'sales':payment.type==='Egreso'?'purchases':undefined;
 const candidates=kind?(data[kind]||[]):[...(data.sales||[]),...(data.purchases||[])];
 const order=candidates.find(order=>order.id===payment.orderId);
 return {...payment,paymentNumber:paymentReceiptNumber(payment.id),_order:order,_orderKind:order?(kind||((data.sales||[]).some(r=>r.id===order.id)?'sales':'purchases')):undefined,
  invoice:order?.invoice,receiptType:order?.invoice?receiptType(order):'',receiptNumber:order?.invoice?.number||'',
 };
}
