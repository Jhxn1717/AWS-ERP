import {useState} from 'react';
import {Download,RefreshCw,Trash2,ShieldCheck,FileUp} from 'lucide-react';
import {Dialog} from './Dialog';
import {request} from './WorkspacePanels';
import {downloadBlob} from './exportReport';
type Preview={snapshot:string;counts:Record<string,number>;backup:object};
const labels:Record<string,string>={products:'Productos',customers:'Clientes',suppliers:'Proveedores',quotes:'Cotizaciones',sales:'Ventas',purchases:'Compras',payments:'Pagos',movements:'Movimientos de stock',documents:'Documentos'};
export function WorkspaceReset({onSaved,notify,onImport}:{onSaved:()=>Promise<void>;notify:(message:string)=>void;onImport:()=>void}){
 const [open,setOpen]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[downloaded,setDownloaded]=useState(false),[confirmation,setConfirmation]=useState(''),[error,setError]=useState('');
 const [password,setPassword]=useState('');
 function close(){if(!busy){setOpen(false);setPassword('')}}
 async function prepare(){
  setOpen(true);setBusy(true);setError('');setPreview(null);setDownloaded(false);setConfirmation('');setPassword('');
  try{setPreview(await request('admin/data/reset-preview'))}catch(error){setError(error instanceof Error?error.message:'No se pudo preparar el respaldo.')}finally{setBusy(false)}
 }
 async function reset(){
  if(!preview||!downloaded||confirmation!=='BORRAR DATOS'||!password||busy)return;
  setBusy(true);setError('');
  try{await request('admin/data/reset','POST',{snapshot:preview.snapshot,backupDownloaded:true,confirmation,password});await onSaved();setOpen(false);notify('Datos comerciales reiniciados. Ya puedes importar los CSV.')}catch(error){setError(error instanceof Error?error.message:'No se pudieron reiniciar los datos.');setDownloaded(false);setConfirmation('')}finally{setBusy(false);setPassword('')}
 }
 const count=preview?Object.values(preview.counts).reduce((sum,value)=>sum+value,0):0;
 return <section className="workspace-reset-panel" aria-label="Vaciar datos operativos">
  <article className="card workspace-reset-card"><div className="reset-card-content"><span className="reset-danger-icon"><Trash2 size={24}/></span><div><span className="reset-kicker">SOLO ADMINISTRADORES</span><h3>Vaciar datos operativos</h3><p>Deja Nix en cero para volver a cargar tus CSV. Se eliminan productos, clientes, proveedores, cotizaciones, ventas, compras, pagos, movimientos y registros de documentos.</p></div></div><button className="btn reset-destructive" disabled={busy} onClick={prepare}><Trash2 size={16}/> Vaciar datos</button></article>
  <div className="reset-preserved"><ShieldCheck size={18}/><p><strong>Conserva tus accesos y la empresa.</strong> Los usuarios, las sesiones, la configuración de empresa y la auditoría permanecen. El reinicio afecta a los datos operativos de todos los usuarios de este espacio.</p></div>
  <article className="card reset-instructions"><h3>Vuelve a empezar cuando lo necesites</h3><ol><li><strong>Prepara el reinicio</strong><span>Revisa cuántos registros se eliminarán y descarga el respaldo.</span></li><li><strong>Confirma la eliminación</strong><span>Escribe BORRAR DATOS y confirma con tu contraseña de Nix.</span></li><li><strong>Importa tus CSV</strong><span>Abre Administración → Importaciones y elige Inventario, Clientes o Proveedores. Nix reconoce y valida el archivo de cada módulo.</span></li></ol><button className="btn" onClick={onImport}><FileUp size={16}/> Ir a Importaciones</button></article>
  {open&&<Dialog title="Vaciar datos operativos" close={close} size="detail" busy={busy}>
   {busy&&!preview&&<p role="status"><RefreshCw className="spin" size={16}/> Preparando respaldo…</p>}
   {error&&<p className="inline-error" role="alert">{error}</p>}
   {preview&&<><div className="reset-confirm-warning" role="alert"><Trash2 size={21}/><p>Se eliminarán <strong>{count} registros operativos</strong> de este espacio. La acción afecta a todos los usuarios y no se puede deshacer desde la aplicación.</p></div><dl className="reset-counts">{Object.entries(preview.counts).map(([key,value])=><div key={key}><dt>{labels[key]}</dt><dd>{value}</dd></div>)}</dl>
    <p className="form-note">El respaldo JSON conserva los registros y referencias de documentos. Los archivos privados permanecen en su almacenamiento; el JSON no contiene sus archivos adjuntos. La recuperación del respaldo requiere intervención técnica.</p>
    <button className="btn full" disabled={busy||!count} onClick={()=>{downloadBlob(new Blob([JSON.stringify(preview.backup,null,2)],{type:'application/json'}),'respaldo-erp-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');setDownloaded(true)}}><Download size={16}/> Descargar respaldo antes de borrar</button>
    {downloaded&&<p className="inline-success reset-backup-status" role="status"><ShieldCheck size={16}/> Respaldo preparado para descargar. Conserva el archivo antes de continuar.</p>}
    <label style={{marginTop:18}}>Escribe BORRAR DATOS para confirmar<input autoComplete="off" spellCheck={false} maxLength={12} placeholder="BORRAR DATOS" value={confirmation} disabled={busy||!downloaded} onChange={event=>setConfirmation(event.target.value)}/></label>
    <label>Contraseña de tu cuenta de Nix<input type="password" autoComplete="current-password" maxLength={200} value={password} disabled={busy||!downloaded||!count} onChange={event=>setPassword(event.target.value)}/></label>
    <p className="form-note">Usa la contraseña con la que inicias sesión en Nix. Si solo utilizas Google y no tienes una contraseña de Nix, solicita su configuración a administración; no ingreses aquí tu contraseña de Google.</p>
    {!count&&<p className="inline-success">Los datos comerciales ya están vacíos. Puedes importar tus CSV.</p>}
   </>}
   <div className="dialog-actions reset-dialog-actions"><button className="btn" disabled={busy} onClick={close}>Cancelar</button>{error&&<button className="btn" disabled={busy} onClick={prepare}>Actualizar respaldo</button>}<button className="btn reset-destructive" disabled={busy||!count||!downloaded||confirmation!=='BORRAR DATOS'||!password} onClick={reset}><Trash2 size={15}/>{busy?'Vaciando…':'Vaciar todos los datos operativos'}</button></div>
  </Dialog>}
 </section>;
}
