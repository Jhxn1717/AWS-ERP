export type DestinationMatch={latitude:number;longitude:number;label:string;approximate:boolean};
const cache=new Map<string,DestinationMatch[]>();
export function parseDestinations(data:any,address=''):DestinationMatch[]{
 if(!Array.isArray(data?.features))throw Error('El servicio devolvió una respuesta inválida.');
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const streetPart=address.split(',')[0],number=streetPart.match(/\s(\d+)\s*$/)?.[1];
 const words=normalize(streetPart).match(/[a-z]+/g)?.filter(word=>word.length>2&&!['calle','avenida','av','jiron','pasaje','los','las','del'].includes(word))||[];
 const seen=new Set<string>();
 return data.features.flatMap((feature:any)=>{
  const p=feature.properties||{},coordinates=feature.geometry?.coordinates;
  if(feature.geometry?.type!=='Point'||!Array.isArray(coordinates)||String(p.countrycode).toUpperCase()!=='PE'||(!p.street&&p.osm_key!=='highway'))return [];
  const street=normalize(String(p.street||p.name||''));
  if(words.length&&!words.every(word=>street.includes(word)))return [];
  const [longitude,latitude]=coordinates;
  if(typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude< -19||latitude>1||longitude< -82||longitude> -68)return [];
  const label=[p.street||p.name,p.housenumber,p.district,p.city||p.county,p.state].filter(Boolean).join(',');
  const key=`${latitude},${longitude}`;if(seen.has(key))return [];seen.add(key);
  return [{latitude,longitude,label,approximate:!p.housenumber||!!number&&String(p.housenumber)!==number}];
 });
}
export async function lookupDestination(address:string,signal:AbortSignal):Promise<DestinationMatch[]>{
 const query=address.trim().replace(/\s+/g,' '),key=query.toLocaleLowerCase();
 if(cache.has(key))return cache.get(key)!;
 const params=new URLSearchParams({q:query,countrycode:'PE',limit:'5'});
 const response=await fetch(`https://photon.komoot.io/api/?${params}`,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
 if(!response.ok)throw Error('No se pudo consultar la dirección. Reintenta en unos momentos.');
 const results=parseDestinations(await response.json(),query);
 if(results.length){if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,results)}
 return results;
}
