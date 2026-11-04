import {useEffect,useState} from 'react';
import {lookupDestination,type DestinationMatch} from './destinationLookup';

export function DestinationFields({initialAddress,onBusy}:{initialAddress:string;onBusy:(busy:boolean)=>void}){
 const [address,setAddress]=useState(initialAddress),[query,setQuery]=useState(initialAddress.trim()),[attempt,setAttempt]=useState(0),[results,setResults]=useState<DestinationMatch[]>([]),[selected,setSelected]=useState<DestinationMatch|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[manual,setManual]=useState(false);
 const [latitude,setLatitude]=useState(''),[longitude,setLongitude]=useState('');
 const choose=(match:DestinationMatch)=>{setSelected(match);setLatitude(String(match.latitude));setLongitude(String(match.longitude))};
 useEffect(()=>{
  if(query.length<6||manual)return;
  const controller=new AbortController();let active=true;
  const timer=window.setTimeout(()=>controller.abort(),12000);
  setLoading(true);onBusy(true);setError('');
  lookupDestination(query,controller.signal).then(matches=>{
   if(!active)return;setResults(matches);
   if(matches.length)choose(matches[0]);else setError('No encontramos esa calle. Completa la dirección con distrito y ciudad, o indica el punto manualmente.');
  }).catch(err=>{if(active)setError(err.name==='AbortError'?'La búsqueda tardó demasiado. Reintenta o indica el punto manualmente.':err.message)}).finally(()=>{window.clearTimeout(timer);if(active){setLoading(false);onBusy(false)}});
  return()=>{active=false;controller.abort();window.clearTimeout(timer);onBusy(false);setLoading(false)};
 },[query,attempt,manual,onBusy]);
 return <><label>Dirección de entrega<input name="destination" required minLength={6} maxLength={250} value={address} placeholder="Calle, número, distrito y ciudad" onChange={event=>{setAddress(event.target.value);setQuery('');setSelected(null);setResults([]);setLatitude('');setLongitude('');setError('');setManual(false)}} onBlur={()=>setQuery(address.trim())}/></label>
  <div className="simulation-destination-fields" aria-busy={loading}><p><strong>Destino automático del envío</strong><br/>La ubicación se busca al terminar de escribir la dirección.</p>
   {loading&&<p role="status">Buscando la dirección de entrega…</p>}
   {error&&<p role="alert">{error}</p>}
   {selected&&!manual&&<p role="status"><strong>{selected.approximate?'Referencia aproximada de la calle':'Ubicación encontrada'}</strong><br/>{selected.label}{selected.approximate&&<><br/>No se encontró el número exacto. Verifica el punto antes de guardar.</>}<br/><a href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}#map=17/${selected.latitude}/${selected.longitude}`} target="_blank" rel="noreferrer">Ver ubicación en el mapa</a></p>}
   {results.length>1&&!manual&&<label>Otras coincidencias<select value={selected?results.indexOf(selected):0} onChange={event=>choose(results[Number(event.target.value)])}>{results.map((match,index)=><option key={index} value={index}>{match.label}</option>)}</select></label>}
   <div className="form-grid"><label>Latitud del destino<input name="destinationLatitude" type="number" step="any" min={-85} max={85} required value={latitude} readOnly={!manual} onChange={event=>setLatitude(event.target.value)}/></label><label>Longitud del destino<input name="destinationLongitude" type="number" step="any" min={-180} max={180} required value={longitude} readOnly={!manual} onChange={event=>setLongitude(event.target.value)}/></label></div>
   <div className="invoice-actions"><button type="button" className="btn" disabled={loading||address.trim().length<6} onClick={()=>{setManual(false);setQuery(address.trim());setAttempt(n=>n+1)}}>Buscar dirección</button><button type="button" className="btn" onClick={()=>{setManual(value=>!value);setSelected(null);setResults([]);setError('');if(manual){setLatitude('');setLongitude('')}}}>{manual?'Usar búsqueda automática':'Ajustar punto manualmente'}</button></div>
   <p>Geocodificación: Photon · © OpenStreetMap. Se consulta únicamente la dirección de entrega.</p>
  </div></>;
}
