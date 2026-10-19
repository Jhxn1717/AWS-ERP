/// <reference types="vite/client" />
import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import {ChevronLeft,ChevronRight,RefreshCw} from 'lucide-react';

export function PdfPreview({blob}:{blob:Blob}){
 const [pdf,setPdf]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[zoom,setZoom]=useState('fit'),[rendering,setRendering]=useState(true),[error,setError]=useState('');
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{let alive=true;let document:PDFDocumentProxy|undefined;
  (async()=>{const [lib,worker]=await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);lib.GlobalWorkerOptions.workerSrc=worker.default;
   document=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),useSystemFonts:true}).promise;
   if(alive)setPdf(document);else await document.destroy();
  })().catch(e=>{console.error('PDF preview:',e.message,e.details);if(alive)setError('No se pudo mostrar el PDF. Cierra esta vista e inténtalo nuevamente.');});
  return()=>{alive=false;void document?.destroy();};
 },[blob]);
 useEffect(()=>{if(!pdf||!canvas.current)return;let alive=true;let task:{cancel:()=>void;promise:Promise<void>}|undefined;
  setRendering(true);
  pdf.getPage(page).then(p=>{if(!alive||!canvas.current)return;const target=canvas.current,viewport=p.getViewport({scale:1.6});target.width=viewport.width;target.height=viewport.height;task=p.render({canvas:target,canvasContext:target.getContext('2d')!,viewport});return task.promise;}).then(()=>{if(alive)setRendering(false);}).catch(e=>{if(alive&&e.name!=='RenderingCancelledException')setError('No se pudo mostrar esta página.');});
  return()=>{alive=false;task?.cancel();};
 },[pdf,page]);
 return <div className="export-pdf-viewer"><div className="export-pdf-controls"><button className="btn" aria-label="Página anterior" disabled={!pdf||page<=1} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button><span aria-live="polite">Página {page} de {pdf?.numPages||'…'}</span><button className="btn" aria-label="Página siguiente" disabled={!pdf||page>=pdf.numPages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button><select aria-label="Zoom del PDF" value={zoom} onChange={e=>setZoom(e.target.value)}><option value="fit">Ajustar al ancho</option><option value="100">100 %</option><option value="150">150 %</option></select></div>
 <div className="export-pdf-pages">{error?<p role="alert">{error}</p>:<>{rendering&&<span className="export-rendering" role="status"><RefreshCw className="spin" size={16}/> Preparando página…</span>}<canvas ref={canvas} role="img" aria-label={`Página ${page} del PDF, vista previa del archivo de descarga`} data-rendered={!rendering} style={{width:zoom==='fit'?'100%':zoom==='100'?'1123px':'1684px',maxWidth:zoom==='fit'?'100%':'none'}}/></>}</div></div>;
}
