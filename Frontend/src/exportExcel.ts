import {cellValue,type Column,type ExportRow,type Report} from './exportReport';

function excelValue(row:ExportRow,column:Column):string|number|Date|null {
 const raw=row[column.key];
 if(raw===null||raw===undefined||raw==='')return null;
 if(column.kind==='money'||column.kind==='number')return Number.isFinite(Number(raw))?Number(raw):null;
 if(column.kind==='date'){
  const date=new Date(raw);
  if(!Number.isNaN(date.getTime())){
   // Excel has no timezone. Store the wall-clock date and time shown in Lima.
   const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
   return new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second));
  }
 }
 // Strings stay strings, including RUC/SKU values and text beginning with =.
 return cellValue(row,column);
}

export async function createReportExcel(report:Report):Promise<Blob>{
 const {default:ExcelJS}=await import('exceljs');
 const workbook=new ExcelJS.Workbook();
 workbook.creator=report.company;workbook.subject=report.scope;workbook.title=report.title;workbook.created=new Date(report.generated);
 const usedNames=new Set<string>();
 report.sections.forEach((section,index)=>{
  const base=section.title.replace(/[\\/*?:\[\]]/g,' ').replace(/^'+|'+$/g,'').trim().slice(0,31)||'Reporte';
  let name=base,n=2;while(usedNames.has(name.toLowerCase())){const suffix=` (${n++})`;name=base.slice(0,31-suffix.length)+suffix;}usedNames.add(name.toLowerCase());
  const sheet=workbook.addWorksheet(name,{properties:{tabColor:{argb:'FF19765C'}},views:[{state:'frozen',ySplit:9,showGridLines:false}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:9'}});
  const end=Math.max(3,section.columns.length);
  const banner=(row:number,value:string,size:number,fill?:string)=>{
   sheet.mergeCells(row,1,row,end);const cell=sheet.getCell(row,1);cell.value=value;
   cell.font={name:'Calibri',size,bold:row<=2,color:{argb:fill?'FFFFFFFF':'FF244E3B'}};
   cell.alignment={vertical:'middle',wrapText:true};if(fill)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
  };
  banner(1,'ENTERPRISECLOUD  /  REPORTE EMPRESARIAL',10,'FF102C2A');sheet.getRow(1).height=26;
  banner(2,section.title,19,'FF19765C');sheet.getRow(2).height=38;
  banner(3,`${report.company}  |  RUC ${report.taxId}`,11);sheet.getRow(3).height=30;
  banner(4,report.scope,10);sheet.getRow(4).height=38;
  banner(5,`Generado: ${new Date(report.generated).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Lima)  |  Moneda: PEN`,10);sheet.getRow(5).height=24;
  banner(6,`${section.rows.length} registros${section.note?'  |  '+section.note:''}`,10);sheet.getRow(6).height=section.note?38:24;
  if(!section.rows.length){banner(7,'Sin registros para este alcance.',11);sheet.getRow(7).height=24;}
  const values=section.rows.map(row=>section.columns.map(column=>excelValue(row,column)));
  sheet.addTable({name:`Reporte_${index+1}`,ref:'A9',headerRow:true,totalsRow:false,style:{theme:'TableStyleMedium4',showRowStripes:true},columns:section.columns.map(column=>({name:column.label,filterButton:true})),rows:values.length?values:[section.columns.map(()=>null)]});
  section.columns.forEach((column,i)=>{
   const width=Math.min(column.key==='detail'?60:44,section.rows.reduce((max,row)=>Math.max(max,Math.min(60,cellValue(row,column).split(/\r?\n/).reduce((length,line)=>Math.max(length,line.length),0)+2)),Math.max(16,column.label.length+4)));
   const target=sheet.getColumn(i+1);target.width=width;
   const header=sheet.getCell(9,i+1);header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF19765C'}};header.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};header.alignment={vertical:'middle',wrapText:true};
   for(let r=10;r<=9+Math.max(1,values.length);r++){
    const cell=sheet.getCell(r,i+1);cell.font={name:'Calibri',size:11,color:{argb:'FF30473D'}};cell.alignment={vertical:'top',wrapText:true,horizontal:column.kind==='money'||column.kind==='number'?'right':'left'};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:r%2?'FFF0F6F2':'FFFFFFFF'}};
    cell.border={bottom:{style:'hair',color:{argb:'FFDCE8E0'}}};
    cell.numFmt=column.kind==='money'?'"S/ "#,##0.00;[Red]-"S/ "#,##0.00':column.kind==='number'?'#,##0.########':column.kind==='date'?'dd/mm/yyyy hh:mm':'@';
   }
  });
  sheet.getRow(9).height=32;
  values.forEach((row,i)=>{const lines=Math.max(...row.map((value,j)=>String(value??'').split(/\r?\n/).reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/Math.max(8,(sheet.getColumn(j+1).width||20)-2))),0)));sheet.getRow(i+10).height=Math.min(409,Math.max(24,lines*16+8));});
  sheet.headerFooter.oddFooter='&L'+report.company.replaceAll('&','&&')+'&RPágina &P de &N';
 });
 const buffer=await workbook.xlsx.writeBuffer();
 return new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
