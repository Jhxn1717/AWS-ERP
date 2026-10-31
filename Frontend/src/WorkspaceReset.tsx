import {useState} from 'react';
import {Download,RefreshCw,RotateCcw} from 'lucide-react';
import {Dialog} from './Dialog';
import {request} from './WorkspacePanels';
import {downloadBlob} from './exportReport';
type Preview={snapshot:string;counts:Record<string,number>;backup:object};
const labels:Record<string,string>={products:'Productos',customers:'Clientes',suppliers:'Proveedores',quotes:'Cotizaciones',sales:'Ventas',purchases:'Compras',payments:'Pagos',movements:'Movimientos de stock',documents:'Documentos'};
export function WorkspaceReset({onSaved,notify}:{onSaved:()=>Promise<void>;notify:(message:string)=>void}){
 const [open,setOpen]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[downloaded,setDownloaded]=useState(false),[confirmation,setConfirmation]=useState(''),[error,setError]=useState('');
 async function prepare(){
  setOpen(true);setBusy(true);setError('');setPreview(null);setDownloaded(false);setConfirmation('');
  try{setPreview(await request('admin/data/reset-preview'))}catch(error){setError(error instanceof Error?error.message:'No se pudo preparar el respaldo.')}finally{setBusy(false)}
 }
 async function reset(){
  if(!preview||!downloaded||confirmation!=='BORRAR DATOS'||busy)return;
  setBusy(true);setError('');
  try{await request('admin/data/reset','POST',{snapshot:preview.snapshot,backupDownloaded:true,confirmation});await onSaved();setOpen(false);notify('Datos comerciales reiniciados. Ya puedes importar los CSV.')}catch(error){setError(error instanceof Error?error.message:'No se pudieron reiniciar los datos.');setDownloaded(false);setConfirmation('')}finally{setBusy(false)}
 }
 const count=preview?Object.values(preview.counts).reduce((sum,value)=>sum+value,0):0;
 return <article className="card workspace-reset-card"><div><h3>Reiniciar datos comerciales</h3><p>Deja el ERP listo para cargar nuevos CSV. Conserva los usuarios, las sesiones, la empresa y la auditoría.</p></div><button className="btn danger" disabled={busy} onClick={prepare}><RotateCcw size={16}/> Preparar reinicio</button>
  {open&&<Dialog title="Reiniciar datos comerciales" close={()=>setOpen(false)} size="detail" busy={busy}>
   {busy&&!preview&&<p role="status"><RefreshCw className="spin" size={16}/> Preparando respaldo…</p>}
   {error&&<p className="inline-error" role="alert">{error}</p>}
   {preview&&<><p>Se eliminarán <strong>{count} registros comerciales</strong> de este espacio. La acción afecta a todos los usuarios. Las cuentas, la configuración de empresa y el historial de auditoría se conservan.</p><dl>{Object.entries(preview.counts).map(([key,value])=><div key={key}><dt>{labels[key]}</dt><dd>{value}</dd></div>)}</dl>
    <p className="form-note">El respaldo JSON conserva los registros y referencias de documentos. Los archivos privados permanecen en su almacenamiento; el JSON no contiene sus archivos adjuntos. La recuperación del respaldo requiere intervención técnica.</p>
    <button className="btn full" disabled={busy||!count} onClick={()=>{downloadBlob(new Blob([JSON.stringify(preview.backup,null,2)],{type:'application/json'}),'respaldo-erp-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');setDownloaded(true)}}><Download size={16}/> Descargar respaldo antes de borrar</button>
    <label style={{marginTop:18}}>Escribe BORRAR DATOS para confirmar<input autoComplete="off" value={confirmation} disabled={busy||!downloaded} onChange={event=>setConfirmation(event.target.value)}/></label>
    {!count&&<p className="inline-success">Los datos comerciales ya están vacíos. Puedes importar tus CSV.</p>}
   </>}
   <div className="dialog-actions"><button className="btn" disabled={busy} onClick={()=>setOpen(false)}>Cancelar</button>{error&&<button className="btn" disabled={busy} onClick={prepare}>Actualizar respaldo</button>}<button className="btn danger" disabled={busy||!count||!downloaded||confirmation!=='BORRAR DATOS'} onClick={reset}>{busy?'Procesando…':'Reiniciar datos'}</button></div>
  </Dialog>}
 </article>;
}
