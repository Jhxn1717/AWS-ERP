import {useState} from 'react';
import {Upload,Download,Check,RefreshCw} from 'lucide-react';
import {Dialog} from './Dialog';
import {request} from './WorkspacePanels';
export type ImportKind='products'|'customers'|'suppliers';
type Kind=ImportKind;
const labels={products:'productos',customers:'clientes',suppliers:'proveedores'};
const columns={products:[['name','Nombre'],['sku','SKU'],['category','Categoría'],['price','Precio'],['cost','Costo'],['stock','Stock'],['minimum','Mínimo']],customers:[['name','Nombre'],['documentType','Tipo'],['taxId','Documento'],['email','Correo'],['phone','Teléfono'],['address','Dirección'],['contactPerson','Contacto']],suppliers:[['name','Nombre'],['documentType','Tipo'],['taxId','Documento'],['email','Correo'],['phone','Teléfono'],['address','Dirección'],['contactPerson','Contacto']]};
export function CsvImport({kind:initialKind,close,onSaved,notify}:{kind:Kind;close:()=>void;onSaved:()=>Promise<void>;notify:(message:string)=>void}){
 const [kind,setKind]=useState<Kind|null>(null);
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<Record<string,string|number>[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function process(save:boolean,candidate=file){
  if(!candidate||busy)return;
  setBusy(true);setError('');
  try{
   const body=new FormData();body.set('file',candidate);body.set('expectedKind',initialKind);
   const result=await request('imports/csv'+(save?'':'/preview'),'POST',body);
   if(save){await onSaved();notify(`${result.count} ${labels[result.kind as Kind]} importados correctamente.`);close()}
   else {setKind(result.kind);setPreview(result.rows)}
  }catch(error){setError(error instanceof Error?error.message:'No se pudo importar el archivo.');setPreview(null)}finally{setBusy(false)}
 }
 return <Dialog title={`Importar ${labels[initialKind]} desde CSV`} close={close} size="detail" busy={busy} dirty={!!preview}>
  <p className="form-intro">Selecciona el CSV de {labels[initialKind]} en formato UTF-8. Reconoceremos automáticamente su contenido y mostraremos la vista previa. El archivo debe corresponder a este módulo. Si hay un error, no se importa ningún registro.</p>
  <a className="btn" download href={`/samples/prueba-completa/${labels[initialKind]}-completo-5.csv`}><Download size={16}/> Descargar ejemplo con 5 registros</a>
  <label style={{marginTop:18}}>Archivo CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={event=>{const next=event.target.files?.[0]||null;setPreview(null);setKind(null);setError('');if(next&&next.size>1024*1024){setFile(null);setError('El archivo debe pesar como máximo 1 MB.')}else {setFile(next);if(next)void process(false,next)}}}/></label>
  <p className="form-note">Separador: coma o punto y coma. Hasta 500 registros. Los SKU y documentos no pueden repetirse.</p>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  {preview&&kind&&<><h3><Check size={17}/>{preview.length} {labels[kind]} detectados</h3><div className="table-scroll csv-import-preview"><table><thead><tr>{columns[kind].map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{preview.map((row,index)=><tr key={index}>{columns[kind].map(([key])=><td key={key}>{row[key]}</td>)}</tr>)}</tbody></table></div><p className="form-note">{kind==='products'?'Se crearán los productos con el stock inicial del archivo.':'Se crearán contactos activos con su RUC o DNI.'}</p></>}
  <div className="dialog-actions"><button className="btn" disabled={busy} onClick={()=>{if(preview){setPreview(null)}else close()}}>{preview?'Volver':'Cancelar'}</button><button className="btn primary" disabled={busy||!file} onClick={()=>process(!!preview)}>{busy?<RefreshCw size={16} className="spin"/>:<Upload size={16}/>} {busy?'Procesando…':preview?'Confirmar importación':'Revisar archivo'}</button></div>
 </Dialog>;
}
