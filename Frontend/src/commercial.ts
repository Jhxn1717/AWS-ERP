export type ContactIdentity={id?:number;documentType?:string;taxId?:string};
type ReceiptOrder={id?:number;kind?:string;_kind?:string;contactId?:number;receiptType?:string;contactSnapshot?:ContactIdentity;invoice?:{type?:string}};
export const paymentMethods=['Efectivo','Tarjeta','Yape','Plin','Transferencia'] as const;
export function documentType(contact?:ContactIdentity):'RUC'|'DNI'{
 return contact?.documentType==='DNI'||(!contact?.documentType&&contact?.taxId?.length===8)?'DNI':'RUC';
}
export function receiptType(order:ReceiptOrder,customers:ContactIdentity[]=[]):'Factura'|'Boleta'{
 if(order.invoice)return order.invoice.type==='Boleta'?'Boleta':'Factura';
 const saved=order.receiptType;
 if(saved==='Boleta'||saved==='Factura')return saved;
 if(order.kind==='purchases'||order._kind==='purchases')return 'Factura';
 return documentType(order.contactSnapshot||customers.find(c=>c.id===order.contactId))==='DNI'?'Boleta':'Factura';
}
