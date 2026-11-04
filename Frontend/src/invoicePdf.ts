import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import {invoiceDocument,invoiceMoney,invoiceDate} from './invoicePresentation';
import type {BusinessRow} from './orderView';

// Helvetica's PDF encoding supports Spanish accents, but not arbitrary Unicode symbols.
const safe=(value:unknown)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[^\u0020-\u00ff\n\r]/g,'-');
const ink:[number,number,number]=[36,39,35],muted:[number,number,number]=[111,115,107],copper:[number,number,number]=[168,82,45],rule:[number,number,number]=[227,225,219];
export function createInvoicePdf(order:BusinessRow,payments:BusinessRow[]=[]):Blob{
 const bill=invoiceDocument(order,payments),doc=new jsPDF({unit:'mm',format:'a4'});
 const money=(value:number)=>safe(invoiceMoney(value));
 const wrap=(value:unknown,size:number,width:number)=>{doc.setFontSize(size);return doc.splitTextToSize(safe(value),width) as string[]};
 doc.setProperties({title:`${bill.type} ${bill.number}`,author:safe(bill.issuer.name||'Nix'),subject:'Comprobante interno de la operación '+safe(bill.reference),creator:'Nix'});
 const continuation=()=>{
  doc.setFillColor(...copper);doc.rect(0,0,210,2,'F');doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(...ink);doc.text('NIX',14,15);
  doc.setFont('helvetica','normal');doc.setTextColor(...muted);doc.setFontSize(8);doc.text(wrap(`${bill.type.toUpperCase()} / ${bill.number}`,8,150),196,15,{align:'right'});
  doc.setDrawColor(...rule);doc.line(14,23,196,23);
 };
 const tableStyle={font:'helvetica',fontSize:9,cellPadding:3,textColor:ink,lineColor:rule,lineWidth:0,overflow:'linebreak' as const};
 const tableEnd=()=>((doc as unknown as {lastAutoTable:{finalY:number}}).lastAutoTable.finalY);
 const ensureSpace=(y:number,height:number)=>{if(y+height>272){doc.addPage();continuation();return 32}return y};
 doc.setFillColor(...copper);doc.rect(0,0,210,3,'F');
 doc.setFont('helvetica','bold');doc.setTextColor(...ink);doc.setFontSize(25);doc.text('NIX',14,23);
 doc.setFontSize(7);doc.setTextColor(...muted);doc.text('GESTIÓN COMERCIAL',14,30);
 doc.setFont('helvetica','bold');doc.setTextColor(...ink);
 const company=wrap(bill.issuer.name||'Empresa sin configurar',11,100);doc.text(company,14,38);
 let issuerY=38+company.length*5;
 doc.setFont('helvetica','normal');doc.setTextColor(...muted);
 for(const detail of [`${bill.issuerDocument}: ${bill.issuer.taxId||'Sin configurar'}`,bill.issuer.address,bill.issuer.email,bill.issuer.phone].filter(Boolean)){
  const lines=wrap(detail,8.5,100);doc.text(lines,14,issuerY);issuerY+=lines.length*4.2;
 }
 doc.setFont('helvetica','bold');const numberLines=wrap(bill.number,12,62),boxHeight=32+numberLines.length*5;
 doc.setFillColor(252,248,244);doc.setDrawColor(217,185,166);doc.roundedRect(124,13,72,boxHeight,2,2,'FD');
 doc.setTextColor(...copper);doc.setFontSize(7);doc.text(bill.purchase?'COMPROBANTE REGISTRADO':'COMPROBANTE INTERNO',160,21,{align:'center'});
 doc.setTextColor(...ink);doc.setFontSize(18);doc.text(bill.type.toUpperCase(),160,31,{align:'center'});
 doc.setFontSize(12);doc.text(numberLines,160,40,{align:'center'});
 let y=Math.max(issuerY,13+boxHeight)+6;
 const customer=[bill.customer.name||'Sin registrar',`${bill.customerDocument}: ${bill.customer.taxId||'Sin registrar'}`,bill.customer.address,bill.customer.email].filter(Boolean).join('\n');
 autoTable(doc,{startY:y,margin:{left:14,right:14,top:32,bottom:25},theme:'plain',head:[[bill.purchase?'ADQUIRENTE':'CLIENTE / ADQUIRENTE']],body:[[safe(customer)]],styles:{...tableStyle,cellPadding:4,fillColor:[248,247,244]},headStyles:{fillColor:[248,247,244],fontSize:7,textColor:muted,cellPadding:{top:4,right:4,bottom:0,left:4}},willDrawPage:()=>{if(doc.getCurrentPageInfo().pageNumber>1)continuation()}});
 y=tableEnd()+5;
 autoTable(doc,{startY:y,margin:{left:14,right:14,top:32,bottom:25},theme:'plain',head:[['EMISIÓN','VENCIMIENTO','OPERACIÓN','MONEDA']],body:[[bill.issuedAt,bill.dueDate,safe(bill.reference),'PEN / Soles']],styles:{...tableStyle,cellPadding:{top:2,right:0,bottom:2,left:0},fontSize:9},headStyles:{textColor:muted,fontSize:7,fontStyle:'normal'},columnStyles:{0:{cellWidth:43},1:{cellWidth:43},2:{cellWidth:53},3:{cellWidth:43}},willDrawPage:()=>{if(doc.getCurrentPageInfo().pageNumber>1)continuation()}});
 y=tableEnd()+6;
 autoTable(doc,{startY:y,margin:{left:14,right:14,top:32,bottom:25},head:[['N.º','DESCRIPCIÓN','CANT.','P. UNITARIO','IMPORTE']],body:bill.lines.map(line=>[String(line.number).padStart(2,'0'),safe(line.name),line.quantity,money(line.price),money(line.total)]),theme:'striped',styles:tableStyle,headStyles:{fillColor:ink,textColor:255,fontSize:7.5,cellPadding:3},alternateRowStyles:{fillColor:[248,247,244]},columnStyles:{0:{cellWidth:12,textColor:muted},1:{cellWidth:76},2:{cellWidth:17,halign:'right'},3:{cellWidth:37,halign:'right'},4:{cellWidth:40,halign:'right',fontStyle:'bold'}},rowPageBreak:'avoid',showHead:'everyPage',willDrawPage:()=>{if(doc.getCurrentPageInfo().pageNumber>1)continuation()}});
 y=ensureSpace(tableEnd()+8,65);
 doc.setFont('helvetica','bold');doc.setTextColor(...muted);doc.setFontSize(7);doc.text('CONDICIÓN DE PAGO',14,y+3);
 doc.setFontSize(10);doc.setTextColor(...ink);doc.text(wrap(bill.terms,10,75),14,y+10);
 doc.setFont('helvetica','normal');doc.setTextColor(...muted);doc.text(wrap(`Precios finales en soles${bill.taxRate>0?', con impuesto incluido':''}.`,8,75),14,y+19);
 doc.setFont('helvetica','bold');doc.setTextColor(...(bill.cancelled?[174,63,53] as [number,number,number]:ink));doc.text(wrap('Estado: '+bill.status,9,75),14,y+32);
 autoTable(doc,{startY:y,margin:{left:108,right:14,top:32,bottom:25},theme:'plain',body:[['Base imponible',money(bill.subtotal)],[`Impuesto incluido (${bill.taxRate} %)`,money(bill.tax)],['TOTAL',money(bill.total)],['Pagado acumulado',money(bill.paid)],['Saldo actual',money(bill.outstanding)]],styles:{...tableStyle,cellPadding:3,fontSize:9},columnStyles:{0:{cellWidth:47},1:{cellWidth:41,halign:'right',fontStyle:'bold'}},pageBreak:'avoid',didParseCell:cell=>{if(cell.row.index===2){cell.cell.styles.fillColor=ink;cell.cell.styles.textColor=255;cell.cell.styles.fontStyle='bold';cell.cell.styles.minCellHeight=13;if(cell.column.index===1)cell.cell.styles.fontSize=14}if(cell.row.index===4){cell.cell.styles.textColor=copper;cell.cell.styles.lineWidth={top:.25};cell.cell.styles.lineColor=rule}},willDrawPage:()=>{if(doc.getCurrentPageInfo().pageNumber>1)continuation()}});
 y=tableEnd()+8;
 if(bill.payments.length){
  y=ensureSpace(y,26);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(...ink);doc.text('Pagos registrados',14,y);
  autoTable(doc,{startY:y+5,margin:{left:14,right:14,top:32,bottom:25},head:[['FECHA','MÉTODO','REFERENCIA','IMPORTE']],body:bill.payments.map(payment=>[invoiceDate(payment.date),safe(payment.method||'Sin especificar'),safe(payment.paymentReference||'-'),money(payment.amount)]),styles:{...tableStyle,fontSize:8},headStyles:{fillColor:ink,textColor:255,fontSize:7},theme:'striped',alternateRowStyles:{fillColor:[248,247,244]},columnStyles:{0:{cellWidth:28},1:{cellWidth:34},2:{cellWidth:80},3:{cellWidth:40,halign:'right'}},rowPageBreak:'avoid',willDrawPage:()=>{if(doc.getCurrentPageInfo().pageNumber>1)continuation()}});
 }
 const count=doc.getNumberOfPages();
 for(let page=1;page<=count;page++){
  doc.setPage(page);doc.setDrawColor(...rule);doc.setLineWidth(.25);doc.line(14,277,196,277);
  doc.setTextColor(...muted);doc.setFont('helvetica','normal');doc.setFontSize(7);
  doc.text(wrap(bill.notice,7,157),14,283);doc.text('Pagos y saldos al momento de la descarga.',14,291);
  doc.text(`${page} / ${count}`,196,291,{align:'right'});
 }
 return doc.output('blob');
}
export function invoiceFilename(order:BusinessRow){return `${(order.invoice?.type||'Factura').toLowerCase()}-${String(order.invoice?.number||order.id).replace(/[^a-zA-Z0-9-]/g,'_')}.pdf`}
