import {useState} from 'react';
import {Download,FileUp,Package,ShieldCheck,Truck,Users} from 'lucide-react';
import {CsvImport,type ImportKind} from './CsvImport';
import './adminImports.css';

export type ImportCounts=Record<ImportKind,number>;
const modules=[
 {kind:'products',module:'Inventario',name:'Productos',file:'productos',Icon:Package,description:'Catálogo, SKU, categoría, precios, costos y existencias iniciales.'},
 {kind:'customers',module:'Clientes',name:'Clientes',file:'clientes',Icon:Users,description:'Personas y empresas con DNI o RUC, dirección y datos de contacto.'},
 {kind:'suppliers',module:'Proveedores',name:'Proveedores',file:'proveedores',Icon:Truck,description:'Empresas proveedoras con RUC y datos de contacto comercial.'},
] as const;
export function AdminImports({counts,onSaved,notify}:{counts:ImportCounts;onSaved:()=>Promise<void>;notify:(message:string)=>void}){
 const [kind,setKind]=useState<ImportKind|null>(null);
 return <section className="admin-imports" aria-label="Importaciones CSV por módulo">
  <div className="admin-imports-heading"><div><span className="eyebrow">CARGA DE DATOS</span><h3>Importaciones por módulo</h3><p>Descarga la plantilla correspondiente, completa los registros y revisa el archivo antes de confirmar la carga.</p></div><span className="admin-imports-access"><ShieldCheck size={15}/> Solo administradores</span></div>
  <div className="admin-imports-grid">{modules.map(({kind,module,name,file,Icon,description})=><article className="card admin-import-card" key={kind}>
   <div className="admin-import-card-header"><span className="admin-import-icon"><Icon size={22}/></span><span className="admin-import-format">CSV · UTF-8</span></div>
   <span className="admin-import-module">MÓDULO {module.toUpperCase()}</span><h3>{name}</h3><p>{description}</p><span className="admin-import-count">{counts[kind]} registros actuales</span>
   <div className="admin-import-card-actions"><button className="btn primary" onClick={()=>setKind(kind)}><FileUp size={15}/> Importar {name.toLowerCase()}</button><a className="btn" href={`/samples/prueba-completa/${file}-completo-5.csv`} download><Download size={15}/> Plantilla con 5 registros</a></div>
  </article>)}</div>
  <div className="admin-import-policy"><ShieldCheck size={19}/><div><strong>Vista previa y validación antes de guardar</strong><p>Se reconoce el contenido del archivo y se comprueba que corresponda al módulo elegido. Se admiten hasta 500 registros y 1 MB por archivo. Si hay errores o duplicados, no se importa el lote. Cada carga queda registrada en Auditoría.</p></div></div>
  {kind&&<CsvImport kind={kind} close={()=>setKind(null)} onSaved={onSaved} notify={notify}/>}
 </section>;
}
