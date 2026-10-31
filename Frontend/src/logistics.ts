import type {BusinessRow} from './orderView';
export const deliveryStages=['Pendiente','Preparando','Despachado','Entregado'] as const;
export function openIncidents(order:BusinessRow){
 const events:any[]=order.logisticsEvents||[];
 const resolved=new Set(events.filter(e=>e.type==='resolution').map(e=>e.incidentId));
 return events.filter(e=>e.type==='incident'&&!resolved.has(e.id));
}
export function lastPosition(order:BusinessRow){
 return [...(order.logisticsEvents||[])].reverse().find(e=>e.type==='position'&&typeof e.latitude==='number'&&Number.isFinite(e.latitude)&&Math.abs(e.latitude)<=90&&typeof e.longitude==='number'&&Number.isFinite(e.longitude)&&Math.abs(e.longitude)<=180);
}
export function deliveryOverdue(order:BusinessRow,today:string){
 const scheduled=order.logistics?.scheduledDate||order.deliveryDate;
 return order.status!=='Anulado'&&order.deliveryStage!=='Entregado'&&!!scheduled&&scheduled<today;
}
export function positionMap(position:{latitude:number;longitude:number}){
 const {latitude:lat,longitude:lon}=position;
 const bbox=[Math.max(-180,lon-.04),Math.max(-90,lat-.025),Math.min(180,lon+.04),Math.min(90,lat+.025)].join(',');
 return 'https://www.openstreetmap.org/export/embed.html?'+new URLSearchParams({bbox,layer:'mapnik',marker:`${lat},${lon}`});
}
