import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {Truck,MapPin,Play,Pause,RotateCcw,Plus,Minus} from 'lucide-react';
import {advanceSimulation,projectPoint,simulationDuration,simulationViewport,panSimulationViewport,routeLengths,routePosition,fetchStreetRoute,saveSimulation,continuousHeading,type ShipmentSimulation as Simulation} from './shipmentMotion';
import './shipmentSimulation.css';

export function ShipmentSimulation({value,onChange,destinationLabel,closed=false}:{value:Simulation;onChange:(value:Simulation)=>void;destinationLabel:string;closed?:boolean}){
 const host=useRef<HTMLDivElement>(null),[size,setSize]=useState({width:640,height:330}),[zoomOffset,setZoom]=useState(0),[tileError,setTileError]=useState(false);
 const [pan,setPan]=useState({x:0,y:0}),[dragging,setDragging]=useState(false);
 const drag=useRef<{pointerId:number;x:number;y:number;pan:{x:number;y:number};zoom:number}|null>(null);
 const resetMap=()=>{setPan({x:0,y:0});setZoom(0)};
 useEffect(()=>{resetMap();drag.current=null;setDragging(false)},[value.orderId]);
 const latest=useRef(value);latest.current=value;
 const [routeError,setRouteError]=useState(''),[attempt,setAttempt]=useState(0);
 const route=value.route;
 useEffect(()=>{
  if(latest.current.route||closed)return;
  const controller=new AbortController();let active=true;
  setRouteError('');
  const timeout=window.setTimeout(()=>controller.abort(),15000);
  fetchStreetRoute(value.start,value.destination,controller.signal).then(points=>{
   if(active)onChange({...latest.current,route:points,elapsed:0,updatedAt:Date.now()});
  }).catch(error=>{if(active)setRouteError(error.name==='AbortError'?'La consulta de calles tardó demasiado. Comprueba tu conexión y reintenta.':error.message||'No se pudo calcular la ruta por calles.');}).finally(()=>window.clearTimeout(timeout));
  return()=>{active=false;controller.abort();window.clearTimeout(timeout)};
 },[value.orderId,value.start.latitude,value.start.longitude,value.destination.latitude,value.destination.longitude,attempt,closed,onChange]);
 useEffect(()=>{if(!host.current)return;const observer=new ResizeObserver(([entry])=>{setSize({width:Math.max(1,entry.contentRect.width),height:330})});observer.observe(host.current);return()=>observer.disconnect()},[]);
 useEffect(()=>{
  if(!value.running||closed||!route)return;
  let frame=0,lastFrame=0;
  const animate=(timestamp:number)=>{
   // Follow each street segment with small steps; never tween across a corner.
   if(timestamp-lastFrame>=1000/30){lastFrame=timestamp;onChange(advanceSimulation(latest.current,Date.now()))}
   frame=window.requestAnimationFrame(animate);
  };
  const visibility=()=>{onChange({...latest.current,updatedAt:Date.now()})};
  document.addEventListener('visibilitychange',visibility);
  frame=window.requestAnimationFrame(animate);
  return()=>{window.cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility)};
 },[value.running,closed,onChange,route]);
 useEffect(()=>{
  saveSimulation(latest.current);
  if(!value.running)return;
  // Persist periodically without blocking every animation frame with storage writes.
  const timer=window.setInterval(()=>saveSimulation(latest.current),1000);
  return()=>window.clearInterval(timer);
 },[value.orderId,value.running,value.speed,route]);
 useEffect(()=>()=>{saveSimulation({...latest.current,running:false})},[]);
 const lengths=useMemo(()=>route?routeLengths(route):[],[route]);
 const progress=route?value.elapsed/simulationDuration:0;
 const position=route?routePosition(route,lengths,progress):{point:value.start,index:1};
 const point=position.point,distance=lengths.at(-1)||0;
 const fittedView=useMemo(()=>simulationViewport(value.start,value.destination,size.width,size.height,zoomOffset,route),[value.start,value.destination,size.width,size.height,zoomOffset,route]);
 const view=useMemo(()=>panSimulationViewport(fittedView,pan,size.width,size.height),[fittedView,pan,size]);
 const currentPan=()=>({x:(view.left-fittedView.left)/2**view.zoom,y:(view.top-fittedView.top)/2**view.zoom});
 const beginDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
  if(!event.isPrimary||event.button!==0||(event.target as Element).closest('button,a,input,select'))return;
  drag.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,pan:currentPan(),zoom:view.zoom};
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.focus({preventScroll:true});setDragging(true);event.preventDefault();
 };
 const moveDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
  const origin=drag.current;if(!origin||origin.pointerId!==event.pointerId)return;
  setPan({x:origin.pan.x-(event.clientX-origin.x)/2**origin.zoom,y:origin.pan.y-(event.clientY-origin.y)/2**origin.zoom});
 };
 const endDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
  if(drag.current?.pointerId!==event.pointerId)return;
  drag.current=null;setDragging(false);
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
 };
 const moveWithKeyboard=(event:ReactKeyboardEvent<HTMLDivElement>)=>{
  if(event.target!==event.currentTarget)return;
  const directions:Record<string,{x:number;y:number}>={ArrowLeft:{x:-60,y:0},ArrowRight:{x:60,y:0},ArrowUp:{x:0,y:-60},ArrowDown:{x:0,y:60}};
  if(event.key==='Home'){event.preventDefault();resetMap();return}
  const direction=directions[event.key];if(!direction)return;
  event.preventDefault();const offset=currentPan();setPan({x:offset.x+direction.x/2**view.zoom,y:offset.y+direction.y/2**view.zoom});
 };
 const pixel=(p:typeof point)=>{const projected=projectPoint(p,view.zoom);return {x:projected.x-view.left,y:projected.y-view.top}};
 const start=pixel(value.start),end=pixel(value.destination),vehicle=pixel(point);
 const pixels=useMemo(()=>route?.map(p=>{const px=projectPoint(p,view.zoom);return {x:px.x-view.left,y:px.y-view.top}})||[],[route,view]);
 const polyline=pixels.map(p=>`${p.x},${p.y}`).join(' ');
 const traveled=[...pixels.slice(0,position.index),vehicle].map(p=>`${p.x},${p.y}`).join(' ');
 const from=pixels[position.index-1],to=pixels[position.index];
 const heading=from&&to?Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI:0;
 const angle=useRef(heading+90);
 angle.current=continuousHeading(angle.current,heading+90);
 const tiles=[];
 for(let y=Math.floor(view.top/256);y<=Math.floor((view.top+size.height)/256);y++)for(let x=Math.floor(view.left/256);x<=Math.floor((view.left+size.width)/256);x++){
  if(x>=0&&y>=0&&x<2**view.zoom&&y<2**view.zoom)tiles.push({x,y,key:`${view.zoom}/${x}/${y}`});
 }
 const change=(patch:Partial<Simulation>)=>onChange({...advanceSimulation(value,Date.now()),...patch,updatedAt:Date.now()});
 return <div className="shipment-demo">
  <header><span><Truck size={16}/> SIMULACIÓN DE ENVÍO</span><strong>{closed?'Simulación detenida':!route?(routeError?'Ruta no disponible':'Calculando calles…'):progress>=1?'Destino simulado alcanzado':value.running?'En movimiento':'En pausa'}</strong></header>
  <div className={`shipment-demo-map${dragging?' is-dragging':''}`} ref={host} role="region" tabIndex={0} aria-label="Mapa del recorrido simulado. Arrastra para mover; usa las flechas del teclado o Inicio para centrar la ruta." onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onKeyDown={moveWithKeyboard}>
   <div className="shipment-demo-tiles" aria-hidden="true">{tiles.map(tile=><img key={tile.key} src={`https://tile.openstreetmap.org/${tile.key}.png`} alt="" draggable={false} onError={()=>setTileError(true)} style={{left:tile.x*256-view.left,top:tile.y*256-view.top}}/>)}</div>
   <svg className="shipment-demo-route" width="100%" height="100%" aria-hidden="true">{route&&<><polyline points={polyline} fill="none" stroke="white" strokeWidth={8} strokeLinejoin="round"/><polyline points={polyline} fill="none" stroke="#a8522d" strokeWidth={4} strokeLinejoin="round"/><polyline points={traveled} fill="none" stroke="#365e49" strokeWidth={5} strokeLinejoin="round"/></>}</svg>
   <span className="shipment-demo-pin origin" style={{left:start.x,top:start.y}} title="Última ubicación registrada"><MapPin size={18}/><b>Origen</b></span>
   <span className="shipment-demo-pin destination" style={{left:end.x,top:end.y}} title={destinationLabel}><MapPin size={18}/><b>Destino</b></span>
   {route&&<span className="shipment-demo-truck" style={{left:vehicle.x,top:vehicle.y}} title="Vehículo simulado"><svg viewBox="0 0 28 40" width="24" height="34" aria-hidden="true" className="shipment-demo-vehicle" style={{transform:`rotate(${angle.current}deg)`}}><path d="M14 1 10 6h8Z" fill="#a8522d"/><rect x="3" y="9" width="3" height="7" rx="1" fill="#242723"/><rect x="22" y="9" width="3" height="7" rx="1" fill="#242723"/><rect x="3" y="28" width="3" height="7" rx="1" fill="#242723"/><rect x="22" y="28" width="3" height="7" rx="1" fill="#242723"/><rect x="5" y="6" width="18" height="32" rx="5" fill="#a8522d" stroke="white" strokeWidth="1.5"/><path d="M8 11h12l-1 6H9Z" fill="#d9edf0"/><rect x="8" y="20" width="12" height="13" rx="1.5" fill="#e3a17b"/><path d="M8 9h3m6 0h3" stroke="#fff5cf" strokeWidth="2"/></svg></span>}
   <div className="shipment-demo-zoom"><button type="button" aria-label="Acercar simulación" disabled={view.zoom===18||zoomOffset>=3} onClick={()=>setZoom(z=>Math.min(3,z+1))}><Plus size={17}/></button><button type="button" aria-label="Alejar simulación" disabled={view.zoom===3||zoomOffset<=-3} onClick={()=>setZoom(z=>Math.max(-3,z-1))}><Minus size={17}/></button><button type="button" title="Volver a centrar el recorrido completo" onClick={resetMap}>Ajustar</button></div>
   <a className="shipment-demo-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© Colaboradores de OpenStreetMap</a>
  </div>
  <p className="shipment-demo-detail shipment-demo-map-help">Arrastra el mapa para explorar. Pulsa Ajustar para volver a ver toda la ruta.</p>
  {!route&&<div className="shipment-demo-detail" role={routeError?'alert':'status'}><p>{routeError||'Buscando una ruta de conducción por las calles disponibles…'}</p>{routeError&&<button className="btn" onClick={()=>setAttempt(n=>n+1)}>Reintentar ruta</button>}</div>}
  {tileError&&<p className="shipment-demo-offline" role="status">El mapa base no está disponible. El trazado y la animación siguen visibles.</p>}
  <div className="shipment-demo-progress"><progress value={value.elapsed} max={simulationDuration} aria-label="Avance simulado"/><strong>{Math.round(progress*100)} %</strong></div>
  <div className="shipment-demo-controls"><button type="button" className="btn" disabled={closed||!route||progress>=1} onClick={()=>change({running:!value.running})}>{value.running?<Pause size={14}/>:<Play size={14}/>} {value.running?'Pausar':'Continuar'}</button><button type="button" className="btn" disabled={closed||!route} onClick={()=>change({elapsed:0,running:true})}><RotateCcw size={14}/> Reiniciar</button><label>Velocidad<select value={value.speed} disabled={closed||!route} onChange={e=>change({speed:Number(e.target.value)})}><option value={0.5}>0.5× · Lenta</option><option value={1}>1× · Normal</option><option value={2}>2× · Rápida</option></select></label></div>
  <p className="shipment-demo-detail">{route?`${distance.toFixed(2)} km por calles`:'Ruta pendiente'} · Duración de demostración: 5 min a 1×.<br/>Posición simulada: {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}.</p>
  <p className="shipment-demo-note">Ruta de conducción calculada con OSRM. El vehículo sigue las curvas y los giros del trazado; su velocidad es simulada, sin tráfico en tiempo real. No modifica ubicaciones reportadas, pagos, stock ni el estado de entrega. Los puntos se ajustan a una calle cercana (máximo 250 m). Cerrar el detalle pausa la simulación.</p>
 </div>;
}
