export type BusinessRow={id:number;[key:string]:any};
export type TimelineEvent={key:string;date:string;title:string;detail:string};

export function orderBalance(row:BusinessRow):number{
 if(row.status==='Anulado')return 0;
 return Math.max(0,Math.round((Number(row.amount||0)-Number(row.paid||0))*100)/100);
}

/** Payment and delivery are independent events; show the actual chronology. */
export function orderTimeline(order:BusinessRow,payments:BusinessRow[]):TimelineEvent[]{
 const events:TimelineEvent[]=[{key:'created',date:order.date,title:'Operación registrada',detail:order.kind==='purchases'?'Compra recibida; existencias ingresadas.':'Venta confirmada; existencias descontadas.'}];
 if(order.invoice)events.push({key:'invoice',date:order.invoice.issuedAt,title:`${order.invoice.type||'Factura'} ${order.invoice.number}`,detail:`Vence ${order.invoice.dueDate}${order.invoice.issuedBy?' · '+order.invoice.issuedBy:''}`});
 for(const payment of payments.filter(p=>p.orderId===order.id))events.push({key:`payment-${payment.id}`,date:payment.date,title:payment.type==='Ingreso'?'Cobro registrado':'Pago registrado',detail:[new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(payment.amount),payment.method||'Método no especificado',payment.paymentReference?'Ref.: '+payment.paymentReference:''].filter(Boolean).join(' · ')});
 for(const [index,event] of (order.tracking||[]).entries())events.push({key:`tracking-${index}`,date:event.date,title:event.stage,detail:[event.note,event.user].filter(Boolean).join(' · ')});
 if(order.cancelledAt)events.push({key:'cancelled',date:order.cancelledAt,title:'Operación anulada',detail:'Existencias revertidas. Sin saldo exigible.'});
 return events.sort((a,b)=>(Date.parse(a.date)||0)-(Date.parse(b.date)||0));
}
