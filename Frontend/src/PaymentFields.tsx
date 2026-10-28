import {paymentMethods} from './commercial';
export function PaymentFields({method,onChange,busy=false}:{method:string;onChange:(method:string)=>void;busy?:boolean}){
 return <><label>Método de pago (obligatorio)<select name="method" value={method} onChange={event=>onChange(event.target.value)} disabled={busy} required><option value="" disabled>Selecciona un método de pago</option>{paymentMethods.map(value=><option key={value} value={value}>{value}</option>)}</select></label><label>Referencia de operación (opcional)<input name="paymentReference" maxLength={100} disabled={busy} placeholder={method==='Tarjeta'?'Código del voucher':method==='Yape'||method==='Plin'?'Número de operación':'Referencia o comprobante del pago'}/></label></>;
}
