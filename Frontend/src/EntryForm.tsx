import {useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {Check,RefreshCw,Plus,Minus,X,FileText,Package,UserRound,Wallet,Truck,ShieldCheck} from 'lucide-react';
import {SearchPicker} from './SearchPicker';
import {ContactFields} from './ContactFields';
import {PaymentFields} from './PaymentFields';
import {documentType} from './commercial';
import {operationTotals} from './operationTotals';
import {useDialogClose} from './Dialog';

type Row={id:number;name:string;[key:string]:any};
type Props={kind:string;data:Record<string,Row[]>;busy:boolean;send:(path:string,body:object)=>Promise<void>;initialOrderId?:number;onDirty?:(dirty:boolean)=>void;operator:string;company:string};
const money=(value:number)=>new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(value||0);
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'America/Lima'});
function dueAfter(days:number){const value=new Date(today()+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)}
function Section({number,title,note,children}:{number:string;title:string;note?:string;children:ReactNode}){
 return <section className="entry-section"><header><span>{number}</span><div><h3>{title}</h3>{note&&<p>{note}</p>}</div></header><div className="entry-section-content">{children}</div></section>;
}

export function EntryForm({kind,data,busy,send,initialOrderId,onDirty,operator,company}:Props){
 const close=useDialogClose();
 const isQuote=kind==='quote',isSale=kind==='sale'||isQuote,isOrder=isSale||kind==='purchase',isPayment=kind==='payment';
 const [confirmation,setConfirmation]=useState<{path:string;body:Record<string,any>}|null>(null);
 const [contactId,setContactId]=useState(''),[lines,setLines]=useState<{productId:number;quantity:number}[]>([]),[productNotice,setProductNotice]=useState('');
 const [orderId,setOrderId]=useState(String(initialOrderId||'')),[method,setMethod]=useState(''),[payNow,setPayNow]=useState(false),[paymentAmount,setPaymentAmount]=useState('');
 const [credit,setCredit]=useState(isQuote),[paymentDays,setPaymentDays]=useState(isQuote?30:0),[dueDate,setDueDate]=useState(dueAfter(isQuote?30:0)),[taxRate,setTaxRate]=useState(18),[notes,setNotes]=useState('');
 const pending=[...data.sales,...data.purchases].filter(order=>order.status!=='Anulado'&&order.amount>order.paid);
 const remaining=pending.find(order=>order.id===Number(orderId));
 const selectedContact=data[isSale?'customers':'suppliers'].find(contact=>contact.id===Number(contactId));
 const receipt=selectedContact?documentType(selectedContact)==='DNI'?'Boleta':'Factura':undefined;
 const total=operationTotals(lines.map(line=>({quantity:line.quantity,unitPrice:Number(data.products.find(product=>product.id===line.productId)?.[isSale?'price':'cost']||0)})),taxRate);
 const quantityLimit=(product:Row)=>Math.max(0,Math.min(100000,isQuote?100000:isSale?product.stock:1000000-product.stock));
 const missing=isOrder?(!data[isSale?'customers':'suppliers'].length?(isSale?'Registra un cliente antes de continuar.':'Registra un proveedor antes de continuar.'):!data.products.length?'Registra un producto antes de continuar.':''):isPayment&&!pending.length?'No hay operaciones con saldo pendiente.':'';
 const needsMethod=isPayment||(!isQuote&&isSale&&payNow);
 const paymentValid=!!remaining&&Number(paymentAmount)>0&&Number(paymentAmount)<=Math.round((remaining.amount-remaining.paid)*100)/100;
 const disabled=busy||!!missing||(needsMethod&&!method)||(isPayment&&!paymentValid)||(isOrder&&(!contactId||!lines.length||total.exceedsLimit));
 useEffect(()=>{onDirty?.(!!(contactId||lines.length||confirmation||payNow||method||notes))},[contactId,lines,confirmation,payNow,method,notes,onDirty]);
 useEffect(()=>{setPaymentAmount(remaining?Number((remaining.amount-remaining.paid).toFixed(2)).toString():'')},[remaining?.id]);
 function setDays(days:number){setPaymentDays(days);if(Number.isInteger(days)&&days>=0&&days<=365)setDueDate(dueAfter(days))}
 function selectProduct(value:string){
  if(busy)return;
  const product=data.products.find(product=>product.id===Number(value));if(!product)return;
  const existing=lines.find(line=>line.productId===product.id);
  if((existing?.quantity||0)>=quantityLimit(product)){setProductNotice(isSale&&!isQuote?`No hay más existencias disponibles de ${product.name}.`:`Se alcanzó el límite de unidades de ${product.name}.`);return}
  if(!existing&&lines.length>=100){setProductNotice('Puedes seleccionar hasta 100 productos por operación.');return}
  setProductNotice('');setLines(previous=>{
   const current=previous.find(line=>line.productId===product.id);
   if((current?.quantity||0)>=quantityLimit(product)||(!current&&previous.length>=100))return previous;
   return current?previous.map(line=>line.productId===product.id?{...line,quantity:line.quantity+1}:line):[...previous,{productId:product.id,quantity:1}];
  });
 }
 function changeQuantity(product:Row,delta:number){
  if(busy)return;setProductNotice('');
  setLines(previous=>previous.map(line=>{
   if(line.productId!==product.id)return line;
   const quantity=line.quantity+delta;
   return quantity>=1&&(delta<0||quantity<=quantityLimit(product))?{...line,quantity}:line;
  }));
 }
 function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(disabled)return;
  const fields=Object.fromEntries(new FormData(event.currentTarget));
  if(isOrder)setConfirmation({path:isQuote?'quotes':'orders/'+(isSale?'sales':'purchases'),body:{contactId:Number(contactId),lines,notes,paymentDays:credit?paymentDays:0,taxRate,
   ...(isQuote?{validUntil:fields.validUntil,deliveryDate:fields.deliveryDate}:kind==='sale'?{emitReceipt:true,receiptDueDate:dueDate,deliveryDate:fields.deliveryDate||null,initialPayment:payNow?{method,paymentReference:fields.paymentReference}:null}:{})}});
  else if(kind==='product')setConfirmation({path:'products',body:{...fields,price:Number(fields.price),cost:Number(fields.cost),stock:Number(fields.stock),minimum:Number(fields.minimum)}});
  else if(isPayment)setConfirmation({path:'payments',body:{orderId:Number(orderId),amount:Number(paymentAmount),method,paymentReference:fields.paymentReference}});
  else setConfirmation({path:'contacts/'+(kind==='customer'?'customers':'suppliers'),body:fields});
 }
 const documentSection=<Section number="01" title="Datos del documento" note="La numeración y el responsable se asignan al guardar.">
  <div className="form-grid entry-document-grid"><label>Número de documento<input readOnly value="Correlativo automático"/></label><label>Fecha de registro<input readOnly value={new Date().toLocaleDateString('es-PE',{timeZone:'America/Lima'})}/></label><label>Responsable<input readOnly value={operator}/></label><label>Moneda<input readOnly value="PEN · Sol peruano"/></label>
  {isOrder&&<><label>Almacén<input readOnly value="Almacén principal"/></label><label>Estado del registro<input readOnly value="Sin guardar"/></label></>}
  </div>
 </Section>;
 const terms=<><div className="form-grid"><label>Condición de pago<select value={credit?'credit':'cash'} disabled={busy} onChange={event=>{const value=event.target.value==='credit';setCredit(value);setDays(value?30:0)}}><option value="cash">Contado</option><option value="credit">Crédito</option></select></label>
  <label>Plazo de pago (días)<input type="number" name="paymentDays" min={credit?1:0} max="365" required value={credit?paymentDays:0} readOnly={!credit} disabled={busy} onChange={event=>setDays(Number(event.target.value))}/></label></div>
  {isQuote?<div className="form-grid"><label>Válida hasta<input type="date" name="validUntil" min={today()} defaultValue={dueAfter(7)} required disabled={busy}/></label><label>Entrega prevista<input type="date" name="deliveryDate" min={today()} required disabled={busy}/></label></div>:kind==='sale'?<div className="form-grid"><label>Vencimiento del comprobante<input type="date" name="receiptDueDate" min={today()} value={dueDate} readOnly={!credit} required disabled={busy} onChange={event=>{const value=event.target.value;setDueDate(value);if(value){const days=Math.round((Date.parse(value+'T12:00:00Z')-Date.parse(today()+'T12:00:00Z'))/86400000);setPaymentDays(days);setCredit(days>0)}}}/></label><label>Entrega prevista (opcional)<input type="date" name="deliveryDate" min={today()} disabled={busy}/></label></div>:<p className="form-note">La compra se registra recibida. El vencimiento se confirma al registrar la factura del proveedor.</p>}
  <label>Impuesto incluido en los precios<select value={taxRate} disabled={busy} onChange={event=>setTaxRate(Number(event.target.value))}><option value={18}>IGV 18 % incluido</option><option value={0}>Sin impuesto · 0 %</option></select></label>
  {kind==='sale'&&<><div className="sale-payment-option"><input id="pay-sale-now" type="checkbox" checked={payNow} disabled={busy} onChange={event=>setPayNow(event.target.checked)}/><label htmlFor="pay-sale-now">Registrar el cobro total ahora</label></div>{payNow?<PaymentFields method={method} onChange={setMethod} busy={busy}/>:<p className="form-note">{credit?'El saldo queda pendiente de cobro hasta el vencimiento acordado.':'El saldo vence hoy. La condición contado no registra un cobro automáticamente.'}</p>}</>}
 </>;
 return <>{confirmation&&<div className="entry-confirmation"><ShieldCheck size={32}/><span className="entry-kicker">REVISIÓN FINAL</span><h2>¿Confirmar {isQuote?'la cotización':isPayment?'el pago':isOrder?'la operación':'el registro'}?</h2>
  <p>{isQuote?'Se guardarán la propuesta, sus condiciones y los precios acordados. El stock no cambia.':isOrder?kind==='purchase'?'Se registrará la recepción y aumentarán las existencias.':'Se registrará la venta, se descontarán las existencias y se generará el comprobante interno.':isPayment?'Se registrará el movimiento y se actualizará el saldo de la operación.':'Se guardará el registro con los datos ingresados.'}</p>
  {isOrder&&<><div className="entry-review-total"><span>{selectedContact?.name}</span><strong>{money(total.total)}</strong></div><p>{total.units} unidades · {lines.length} productos · {credit?`Crédito a ${paymentDays} días`:'Contado'}</p>{kind==='sale'&&<p>Comprobante: <strong>{receipt}</strong> · Cobro: <strong>{payNow?method:'Pendiente'}</strong></p>}</>}
  {isPayment&&<><div className="entry-review-total"><span>{remaining?.reference} · {remaining?.name}</span><strong>{money(Number(paymentAmount))}</strong></div><p>Método: <strong>{method}</strong>{confirmation.body.paymentReference&&<> · Referencia: {confirmation.body.paymentReference}</>}</p></>}
  {!isOrder&&!isPayment&&<p><strong>{confirmation.body.name}</strong>{confirmation.body.taxId&&<> · {confirmation.body.documentType} {confirmation.body.taxId}</>}</p>}
  <div className="dialog-actions"><button className="btn" disabled={busy} onClick={()=>setConfirmation(null)}>Volver al formulario</button><button className="btn primary" disabled={busy} onClick={async()=>{await send(confirmation.path,confirmation.body);setConfirmation(null)}}>{busy?'Guardando…':'Sí, confirmar'}</button></div>
 </div>}
 <form className="entry-form" hidden={!!confirmation} onSubmit={submit}>
  <div className="entry-layout"><main className="entry-fields">
   {missing&&<p className="inline-error" role="status">{missing}</p>}
   {isOrder?<>{documentSection}<Section number="02" title={isSale?'Cliente y condiciones comerciales':'Proveedor y condiciones comerciales'}>
    <SearchPicker buttonLabel={isSale?'Seleccionar cliente':'Seleccionar proveedor'} label={isSale?'Cliente':'Proveedor'} placeholder="Nombre, RUC o DNI" name="contactId" value={contactId} onChange={setContactId} disabled={busy} options={data[isSale?'customers':'suppliers'].map(contact=>({value:String(contact.id),label:contact.name,detail:`${documentType(contact)}: ${contact.taxId}`,search:`${contact.name} ${contact.taxId}`}))}/>{terms}
   </Section><Section number="03" title="Productos" note="Selecciona un producto y ajusta sus unidades en la lista.">
    <SearchPicker buttonLabel={lines.length?'Seleccionar otro producto':'Seleccionar producto'} label="Catálogo de productos" placeholder="Nombre o SKU" value="" onChange={selectProduct} disabled={busy} options={data.products.map(product=>({value:String(product.id),label:product.name,detail:`${product.sku} · ${product.stock} unid. · ${money(isSale?product.price:product.cost)}`,search:`${product.name} ${product.sku}`}))}/>
    {productNotice&&<p className="form-note" role="status">{productNotice}</p>}
    <div className="entry-products-head"><span>Producto / precio unitario</span><span>Cantidad e importe</span></div>
    <div className="order-lines">{lines.length?lines.map(line=>{const product=data.products.find(product=>product.id===line.productId)!;const limit=line.quantity>=quantityLimit(product);return <div key={line.productId} className="order-product-row">
     <span className="order-product-info"><strong title={product.name}>{product.name}</strong><small>{product.sku} · {money(isSale?product.price:product.cost)} / unid.</small></span>
     <div className="line-quantity" role="group" aria-label={'Cantidad de '+product.name}><button type="button" disabled={busy||line.quantity<=1} aria-label={'Reducir cantidad de '+product.name} onClick={()=>changeQuantity(product,-1)}><Minus size={14}/></button><output aria-live="polite" aria-label={'Unidades de '+product.name}>{line.quantity}</output><button type="button" disabled={busy||limit} title={limit?'Límite de unidades alcanzado':'Aumentar cantidad'} aria-label={'Aumentar cantidad de '+product.name} onClick={()=>changeQuantity(product,1)}><Plus size={14}/></button></div>
     <strong className="order-product-subtotal">{money(line.quantity*(isSale?product.price:product.cost))}</strong><button type="button" className="icon-button order-product-remove" disabled={busy} aria-label={'Quitar '+product.name} onClick={()=>{setProductNotice('');setLines(previous=>previous.filter(item=>item.productId!==line.productId))}}><X size={15}/></button>
    </div>}):<div className="entry-empty-products"><Package size={26}/><strong>Sin productos seleccionados</strong><p>El detalle y los importes aparecerán aquí.</p></div>}</div>
    {total.exceedsLimit&&<p className="inline-error" role="alert">El total supera el límite permitido por operación.</p>}
   </Section><Section number="04" title="Observaciones"><label>Indicaciones comerciales o de entrega<textarea name="notes" maxLength={1000} value={notes} disabled={busy} onChange={event=>setNotes(event.target.value)} placeholder="Condiciones acordadas, indicaciones de recepción o referencias útiles"/></label></Section></>:isPayment?<>{documentSection}<Section number="02" title="Operación y movimiento financiero">
    <SearchPicker buttonLabel="Seleccionar operación" label="Operación pendiente" placeholder="Número o cliente / proveedor" name="orderId" disabled={busy} value={orderId} onChange={setOrderId} options={pending.map(order=>({value:String(order.id),label:`${order.reference} · ${order.name}`,detail:`Saldo: ${money(order.amount-order.paid)} · ${order.invoice?`${order.invoice.type||'Factura'} ${order.invoice.number}`:'Sin comprobante vinculado'}`,search:`${order.reference} ${order.name} ${order.invoice?.number||''}`}))}/>
    <label>Importe de este pago (S/)<input name="amount" type="number" min="0.01" step="0.01" required disabled={busy} max={remaining?Number((remaining.amount-remaining.paid).toFixed(2)):undefined} value={paymentAmount} onChange={event=>setPaymentAmount(event.target.value)}/></label><PaymentFields method={method} onChange={setMethod} busy={busy}/><p className="form-note">Se permiten pagos parciales. Cada movimiento conserva su método y referencia, y no puede superar el saldo.</p>
   </Section></>:kind==='product'?<><Section number="01" title="Identificación del producto"><label>Nombre del producto<input name="name" required minLength={2} maxLength={160} placeholder="Ej. Monitor profesional 27 pulgadas" disabled={busy}/></label><div className="form-grid"><label>SKU<input name="sku" required minLength={2} maxLength={40} placeholder="TEC-007" disabled={busy}/></label><label>Categoría<input name="category" required minLength={2} maxLength={60} placeholder="Tecnología" disabled={busy}/></label></div></Section><Section number="02" title="Precios y costo" note="Importes finales en soles peruanos."><div className="form-grid"><label>Precio de venta (S/)<input name="price" type="number" min="0.01" max="9999999999.99" step="0.01" required disabled={busy}/></label><label>Costo unitario (S/)<input name="cost" type="number" min="0" max="9999999999.99" step="0.01" required disabled={busy}/></label></div></Section><Section number="03" title="Control de inventario"><label>Almacén<input readOnly value="Almacén principal"/></label><div className="form-grid"><label>Stock inicial (unidades)<input name="stock" type="number" min="0" max="1000000" required disabled={busy}/></label><label>Stock mínimo (unidades)<input name="minimum" type="number" min="0" max="1000000" defaultValue="10" required disabled={busy}/></label></div></Section></>:<ContactFields customer={kind==='customer'} busy={busy} onDirty={()=>onDirty?.(true)}/>}
  </main><aside className="entry-summary" aria-label="Resumen del registro"><span className="entry-kicker">RESUMEN</span><div className="entry-summary-icon">{isPayment?<Wallet size={24}/>:isOrder?<FileText size={24}/>:kind==='product'?<Package size={24}/>:<UserRound size={24}/>}</div>
   <h3>{isPayment?'Comprobante de pago':isOrder?isQuote?'Propuesta comercial':kind==='purchase'?'Recepción de compra':'Venta directa':kind==='product'?'Ficha del producto':kind==='customer'?'Ficha del cliente':'Ficha del proveedor'}</h3>
   <p className="entry-summary-company">{company}</p>
   {isOrder?<><div className="entry-party"><strong>{selectedContact?.name||`Selecciona un ${isSale?'cliente':'proveedor'}`}</strong>{selectedContact&&<><small>{documentType(selectedContact)}: {selectedContact.taxId}</small><small>{selectedContact.email}</small>{selectedContact.address&&<small>{selectedContact.address}</small>}</>}</div>
    <dl className="entry-summary-details"><div><dt>Documento</dt><dd>{isQuote?'Cotización':isSale?receipt||'Según cliente':'Factura del proveedor'}</dd></div><div><dt>Condición</dt><dd>{credit?`Crédito · ${paymentDays} días`:'Contado'}</dd></div><div><dt>Productos</dt><dd>{lines.length}</dd></div><div><dt>Unidades</dt><dd>{total.units}</dd></div></dl>
    <div className="entry-amounts"><div><span>Base</span><strong>{money(total.subtotal)}</strong></div><div><span>IGV incluido ({taxRate} %)</span><strong>{money(total.tax)}</strong></div><div className="entry-grand-total"><span>Total de la operación</span><strong>{money(total.total)}</strong></div></div>
    <div className="entry-effect"><Truck size={17}/><p>{isQuote?'La propuesta no mueve existencias ni genera un saldo por cobrar.':kind==='purchase'?'Al confirmar se incrementa el stock y se registra el saldo al proveedor.':payNow?'Al confirmar se descuentan existencias y se registra el cobro total.':'Al confirmar se descuentan existencias y queda el saldo por cobrar.'}</p></div>
   </>:isPayment?<><div className="entry-party"><strong>{remaining?.name||'Selecciona una operación'}</strong><small>{remaining?.reference||'El comprobante se vincula al registro elegido.'}</small>{remaining?.invoice&&<small>{remaining.invoice.type||'Factura'} {remaining.invoice.number}</small>}</div><div className="entry-amounts"><div><span>Saldo pendiente</span><strong>{money(remaining?remaining.amount-remaining.paid:0)}</strong></div><div><span>Saldo después del pago</span><strong>{money(Math.max(0,(remaining?remaining.amount-remaining.paid:0)-Number(paymentAmount)))}</strong></div><div className="entry-grand-total"><span>Importe a registrar</span><strong>{money(Number(paymentAmount))}</strong></div></div><p className="form-note">Método: {method||'Por seleccionar'}. La constancia de pago se podrá consultar y descargar en Pagos.</p></>:<><div className="entry-party"><strong>Registro maestro</strong><small>{kind==='product'?'SKU único y control de existencias.':'Identidad, datos de contacto y dirección.'}</small></div><p className="form-note">{kind==='customer'?'RUC identifica una empresa y genera factura; DNI identifica a una persona y genera boleta.':kind==='supplier'?'Los proveedores se registran con RUC y se vinculan a las compras recibidas.':'El stock mínimo alimenta las alertas de reposición. Los cambios posteriores de existencias se registran mediante ajustes.'}</p></>}
   <div className="entry-summary-footer"><ShieldCheck size={15}/><span>Revisión y confirmación antes de guardar</span></div>
  </aside></div>
  <footer className="entry-actions"><span><ShieldCheck size={15}/> {isOrder?`${lines.length} ${lines.length===1?'producto':'productos'} · ${total.units} ${total.units===1?'unidad':'unidades'}`:'Los campos del registro se validan al continuar.'}</span><div><button className="btn" type="button" disabled={busy} onClick={close}>Cancelar</button><button className="btn primary submit" type="submit" disabled={disabled}>{busy?<RefreshCw size={16} className="spin"/>:<Check size={16}/>} {busy?'Guardando…':isQuote?'Revisar cotización':isPayment?'Revisar pago':isOrder?'Revisar operación':'Revisar registro'}</button></div></footer>
 </form></>;
}
