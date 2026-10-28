export type ExportRow = Record<string, any>;
export type Column = {key:string; label:string; kind?:'money'|'number'|'date'|'bytes'};
export type Section = {title:string; columns:Column[]; rows:ExportRow[]; note?:string};
export type Report = {title:string; scope:string; company:string; taxId:string; generated:string; sections:Section[]; trend?:{day:string;ventas:number;compras:number}[]};
export function hasExportData(sections:Section[],dashboard=false):boolean {
 // Dashboard indicators and the daily chart contain generated rows even with no records.
 return (dashboard?sections.slice(2):sections).some(section=>section.rows.length>0);
}
const col=(key:string,label:string,kind?:Column['kind']):Column=>({key,label,kind});
const orders=[col('reference','N.º de operación'),col('receiptType','Tipo de comprobante'),col('receiptNumber','Comprobante'),col('name','Empresa'),col('date','Fecha','date'),col('amount','Importe (PEN)','money'),col('paid','Pagado (PEN)','money'),col('balance','Saldo (PEN)','money'),col('status','Estado'),col('detail','Detalle de productos')];
const schemas:Record<string,Column[]>={
 Ventas:orders,Compras:orders,
 Inventario:[col('sku','SKU'),col('name','Producto'),col('category','Categoría'),col('price','Precio (PEN)','money'),col('cost','Costo (PEN)','money'),col('stock','Stock','number'),col('minimum','Stock mínimo','number'),col('valuation','Valor al costo (PEN)','money')],
 Clientes:[col('name','Nombre o razón social'),col('documentType','Tipo de documento'),col('taxId','Documento'),col('email','Correo electrónico'),col('phone','Teléfono'),col('status','Estado')],
 Finanzas:[col('reference','Operación'),col('receiptType','Tipo de comprobante'),col('receiptNumber','Comprobante'),col('name','Empresa'),col('type','Tipo'),col('method','Método de pago'),col('paymentReference','Referencia de pago'),col('date','Fecha','date'),col('amount','Importe (PEN)','money'),col('status','Estado')],
 Documentos:[col('name','Documento'),col('category','Categoría'),col('reference','Referencia'),col('size','Tamaño','bytes'),col('date','Fecha','date'),col('status','Estado')],
 Movimientos:[col('name','Producto'),col('date','Fecha','date'),col('quantity','Cantidad','number'),col('stock','Stock resultante','number'),col('status','Tipo'),col('reason','Motivo')],
 Auditoría:[col('date','Fecha y hora','date'),col('name','Actividad'),col('module','Módulo'),col('user','Usuario'),col('reference','Referencia'),col('status','Estado')],
};
schemas.Proveedores=schemas.Clientes;
schemas.Pagos=schemas.Finanzas;
schemas['Cuentas por cobrar']=orders;
schemas['Cuentas por pagar']=orders;
export function reportSection(title:string,items:ExportRow[],schema=title,note?:string):Section {
 return {title,note,columns:schemas[schema]||schemas.Ventas,rows:items.map(r=>({...r,
  documentType:r.documentType||(String(r.taxId||'').length===8?'DNI':'RUC'),
  method:r.method||'No especificado',receiptType:r.invoice?(r.invoice.type||'Factura'):(r.receiptType||''),receiptNumber:r.invoice?.number||'',
  balance:r.status==='Anulado'?0:Math.max(0,Number(r.amount||0)-Number(r.paid||0)),
  valuation:Number(r.cost||0)*Number(r.stock||0),
  detail:(r.lines||[]).map((l:ExportRow)=>`${l.quantity} x ${l.name} (${Number(l.price||0).toFixed(2)} PEN)`).join(' | '),
 }))};
}
export function cellValue(row:ExportRow,column:Column):string {
 const v=row[column.key];if(v===null||v===undefined||v==='')return '';
 if(column.kind==='money')return Number(v).toFixed(2);
 if(column.kind==='number')return String(Number(v));
 if(column.kind==='bytes')return `${(Number(v)/1024).toFixed(1)} KB`;
 if(column.kind==='date'){const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('es-PE',{timeZone:'America/Lima',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});}
 return String(v);
}
export function csvContent(report:Report,delimiter=';',excelCompatible=true):string {
 // Keep a single table for module exports; a dashboard uses clearly named blocks.
 // Quote every field and neutralize spreadsheet formulas, including leading whitespace.
 const escape=(value:string,numeric=false)=>'"'+((!numeric&&/^\s*[=+@\-\t\r\n]/.test(value)?"'":'')+value).replaceAll('"','""')+'"';
 const lines:string[]=[];
 const multi=report.sections.length>1;
 if(multi){lines.push(escape(report.title),escape(report.company),escape(report.scope),'');}
 for(const s of report.sections){
  if(multi)lines.push(escape(s.title));
  lines.push(s.columns.map(c=>escape(c.label)).join(delimiter));
  for(const r of s.rows)lines.push(s.columns.map(c=>escape(cellValue(r,c),c.kind==='money'||c.kind==='number')).join(delimiter));
  if(multi)lines.push('');
 }
 // Excel reads this directive on double-click, independent of the OS list separator.
 return '\uFEFF'+(excelCompatible?`sep=${delimiter}\r\n`:'')+lines.join('\r\n');
}
export function reportFilename(report:Report,extension:string){return `${report.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase()}-${report.generated.slice(0,10)}.${extension}`;}
export function downloadBlob(blob:Blob,filename:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}

export async function createReportPdf(report:Report):Promise<Blob>{
 const [{jsPDF},{autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);
 const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();
 doc.setProperties({title:report.title,subject:report.scope,author:report.company,creator:'EnterpriseCloud ERP'});
 const text=(value:string)=>value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[^\u0020-\u00ff\n\r]/g,'-');
 const fit=(value:string,size:number,max:number)=>{doc.setFontSize(size);return doc.splitTextToSize(text(value),max) as string[]};
 const header=()=>{
  doc.setFillColor(16,44,42);doc.rect(0,0,width,29,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');
  doc.setFontSize(9);doc.text('ENTERPRISECLOUD / REPORTE EMPRESARIAL',14,10);
  doc.setFontSize(17);doc.text(text(report.title),14,21);
  doc.setFontSize(8);doc.setFont('helvetica','normal');
  doc.text(fit(report.company,9,95).slice(0,2),width-14,11,{align:'right'});
  doc.text(`RUC: ${text(report.taxId||'-')}  |  PEN`,width-14,23,{align:'right'});
  doc.setTextColor(85,103,98);doc.setFontSize(8);doc.text(fit(report.scope,8,width-28).slice(0,2),14,36);
 };
 header();let y=47;
 if(report.trend?.length){
  const trend=report.trend,max=Math.max(1,...trend.flatMap(r=>[r.ventas,r.compras]));
  doc.setTextColor(24,68,57);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('Evolución del período',14,y);y+=8;
  const chartX=35,chartW=width-58,chartH=25;
  doc.setDrawColor(220,230,225);doc.line(chartX,y+chartH,chartX+chartW,y+chartH);
  doc.setFontSize(7);doc.setTextColor(90);doc.text(`${max.toFixed(2)} PEN`,14,y+2);doc.text('0',29,y+chartH);
  for(const [key,color] of [['ventas',[22,138,115]],['compras',[130,145,159]]] as const){
   doc.setDrawColor(color[0],color[1],color[2]);doc.setLineWidth(.7);
   trend.forEach((r,i)=>{if(i){const prev=trend[i-1];doc.line(chartX+(i-1)*chartW/Math.max(1,trend.length-1),y+chartH-prev[key]/max*chartH,chartX+i*chartW/Math.max(1,trend.length-1),y+chartH-r[key]/max*chartH);}});
   if(trend.length===1){doc.setFillColor(color[0],color[1],color[2]);doc.circle(chartX,y+chartH-trend[0][key]/max*chartH,1,'F');}
  }
  doc.setTextColor(90);doc.text(text(trend[0].day),chartX,y+chartH+5);doc.text(text(trend[trend.length-1].day),chartX+chartW,y+chartH+5,{align:'right'});
  doc.setTextColor(22,138,115);doc.text('Ventas',width-55,y-3);doc.setTextColor(130,145,159);doc.text('Compras',width-34,y-3);y+=chartH+17;
 }
 for(const section of report.sections){
  if(y>height-48){doc.addPage();header();y=47;}
  doc.setTextColor(24,68,57);doc.setFont('helvetica','bold');doc.setFontSize(11);
  const heading=fit(`${section.title}  /  ${section.rows.length} registros`,11,width-28);doc.text(heading,14,y);y+=heading.length*5+2;
  if(section.note){doc.setFont('helvetica','normal');doc.setTextColor(100);const note=fit(section.note,8,width-28);doc.text(note,14,y);y+=note.length*4+3;}
  if(!section.rows.length){doc.setTextColor(110);doc.setFontSize(9);doc.text('No hay registros para este alcance.',14,y+3);y+=15;continue;}
  const numeric=Object.fromEntries(section.columns.flatMap((c,i)=>c.kind==='money'||c.kind==='number'?[[i,{halign:'right' as const}]]:[]));
  autoTable(doc,{startY:y,margin:{top:47,bottom:17,left:14,right:14},head:[section.columns.map(c=>text(c.label))],body:section.rows.map(r=>section.columns.map(c=>text(cellValue(r,c)))),
   theme:'striped',styles:{font:'helvetica',fontSize:8,cellPadding:3,overflow:'linebreak',textColor:[45,63,57],lineWidth:0},
   headStyles:{fillColor:[22,111,92],textColor:255,fontStyle:'bold'},alternateRowStyles:{fillColor:[242,247,244]},columnStyles:numeric,
   rowPageBreak:'avoid',showHead:'everyPage',willDrawPage:()=>{header();},
  });
  y=(doc as unknown as {lastAutoTable:{finalY:number}}).lastAutoTable.finalY+12;
 }
 const count=doc.getNumberOfPages();
 for(let i=1;i<=count;i++){doc.setPage(i);doc.setDrawColor(220,230,225);doc.setLineWidth(.2);doc.line(14,height-13,width-14,height-13);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(100);doc.text(`Generado: ${new Date(report.generated).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Lima) | Importes en PEN`,14,height-8);doc.text(`Página ${i} de ${count}`,width-14,height-8,{align:'right'});}
 return doc.output('blob');
}
