import {useState} from 'react';
import {ChoicePicker} from './ChoicePicker';
import {documentType} from './commercial';

export type ContactRow={name?:string;documentType?:string;taxId?:string;email?:string;phone?:string;address?:string;contactPerson?:string};
/** Creation and editing share the same identity fields and document validation. */
export function ContactFields({customer,initial={},busy=false,onDirty}:{customer:boolean;initial?:ContactRow;busy?:boolean;onDirty?:()=>void}){
 const [type,setType]=useState<'RUC'|'DNI'>(customer?documentType(initial):'RUC');
 const [number,setNumber]=useState(initial.taxId||'');
 const dni=type==='DNI';
 return <><section className="entry-section"><header><span>01</span><div><h3>Identificación {customer?'del cliente':'del proveedor'}</h3><p>Datos del titular y documento de identidad.</p></div></header><div className="entry-section-content">
 {customer?<ChoicePicker label="Tipo de documento" name="documentType" value={type} disabled={busy} onChange={value=>{setType(value as 'RUC'|'DNI');setNumber('');onDirty?.()}}><option value="RUC">RUC</option><option value="DNI">DNI</option></ChoicePicker>:<input type="hidden" name="documentType" value="RUC"/>}
 <label>{dni?'Nombres y apellidos':'Razón social'}<input name="name" required minLength={2} maxLength={160} defaultValue={initial.name} placeholder={dni?'Nombre completo del cliente':'Nombre de la empresa'} disabled={busy}/></label>
 <label>{type}<input name="taxId" inputMode="numeric" autoComplete="off" required pattern={dni?'[0-9]{8}':'[0-9]{11}'} maxLength={dni?8:11} minLength={dni?8:11} value={number} onChange={event=>setNumber(event.target.value.replace(/\D/g,''))} placeholder={dni?'8 dígitos':'11 dígitos'} disabled={busy}/></label>
 {customer&&<p className="form-note contact-receipt-note">{dni?'Con DNI se genera boleta de venta.':'Con RUC se genera factura.'}</p>}
 </div></section><section className="entry-section"><header><span>02</span><div><h3>Contacto y dirección</h3><p>Información para coordinar operaciones y entregas.</p></div></header><div className="entry-section-content">
 <div className="form-grid"><label>Correo electrónico<input name="email" type="email" required maxLength={160} defaultValue={initial.email} placeholder="correo@ejemplo.com" disabled={busy}/></label><label>Teléfono<input name="phone" maxLength={40} defaultValue={initial.phone} placeholder="Número de contacto" disabled={busy}/></label></div>
 <label>Persona de contacto (opcional)<input name="contactPerson" maxLength={100} defaultValue={initial.contactPerson} placeholder="Persona con quien se coordina" disabled={busy}/></label>
 <label>Dirección (opcional)<textarea name="address" maxLength={250} defaultValue={initial.address} placeholder="Dirección comercial o de contacto" disabled={busy}/></label>
 </div></section></>;
}
