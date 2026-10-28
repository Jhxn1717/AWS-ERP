import {useState} from 'react';
import {Upload,Download,Check,RefreshCw} from 'lucide-react';
import {Dialog} from './Dialog';
import {request} from './WorkspacePanels';
type Kind='products'|'customers'|'suppliers';
const labels={products:'productos',customers:'clientes',suppliers:'proveedores'};
const columns={products:[['name','Nombre'],['sku','SKU'],['category','Categoría'],['price','Precio'],['cost','Costo'],['stock','Stock'],['minimum','Mínimo']],customers:[['name','Nombre'],['documentType','Tipo'],['taxId','Documento'],['email','Correo'],['phone','Teléfono']],suppliers:[['name','Nombre'],['documentType','Tipo'],['taxId','Documento'],['email','Correo'],['phone','Teléfono']]};
export function CsvImport({kind:initialKind,close,onSaved,notify}:{kind?:Kind;close:()=>void;onSaved:()=>Promise<void>;notify:(message:string)=>void}){
 const [kind,setKind]=useState<Kind|null>(null);
 const [file,setFile]=useState<File|null>(null),[preview,setPreview]=useState<Record<string,string|number>[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function process(save:boolean,candidate=file){
  if(!candidate||busy)return;
  setBusy(true);setError('');
  try{
   const body=new FormData();body.set('file',candidate);
   const result=await request('imports/csv'+(save?'':'/preview'),'POST',body);
   if(save){await onSaved();notify(`${result.count} ${labels[result.kind as Kind]} importados correctamente.`);close()}
   else {setKind(result.kind);setPreview(result.rows)}
  }catch(error){setError(error instanceof Error?error.message:'No se pudo importar el archivo.');setPreview(null)}finally{setBusy(false)}
 }
 return <Dialog title="Importar registros desde CSV" close={close} size="detail" busy={busy} dirty={!!preview}>
  <p className="form-intro">Selecciona un CSV UTF-8. Detectaremos automáticamente si contiene productos, clientes o proveedores y mostraremos la vista previa. Se guardan todos juntos; si hay un error, no se importa ninguno.</p>
  <a className="btn" download href={initialKind?`/samples/${labels[initialKind]}-5.csv`:'/samples/ejemplos-csv.zip'}><Download size={16}/> {initialKind?'Descargar ejemplo con 5 registros':'Descargar ejemplos con 5 registros'}</a>
  <label style={{marginTop:18}}>Archivo CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={event=>{const next=event.target.files?.[0]||null;setPreview(null);setKind(null);setError('');if(next&&next.size>1024*1024){setFile(null);setError('El archivo debe pesar como máximo 1 MB.')}else {setFile(next);if(next)void process(false,next)}}}/></label>
  <p className="form-note">Separador: coma o punto y coma. Hasta 500 registros. Los SKU y documentos no pueden repetirse.</p>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  {preview&&kind&&<><h3><Check size={17}/>{preview.length} {labels[kind]} detectados</h3><div className="table-scroll csv-import-preview"><table><thead><tr>{columns[kind].map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{preview.map((row,index)=><tr key={index}>{columns[kind].map(([key])=><td key={key}>{row[key]}</td>)}</tr>)}</tbody></table></div><p className="form-note">{kind==='products'?'Se crearán los productos con el stock inicial del archivo.':'Se crearán contactos activos con su RUC o DNI.'}</p></>}
  <div className="dialog-actions"><button className="btn" disabled={busy} onClick={()=>{if(preview){setPreview(null)}else close()}}>{preview?'Volver':'Cancelar'}</button><button className="btn primary" disabled={busy||!file} onClick={()=>process(!!preview)}>{busy?<RefreshCw size={16} className="spin"/>:<Upload size={16}/>} {busy?'Procesando…':preview?'Confirmar importación':'Revisar archivo'}</button></div>
 </Dialog>;
}
