export type Coordinate={latitude:number;longitude:number};
export type ShipmentSimulation={orderId:number;start:Coordinate;destination:Coordinate;elapsed:number;running:boolean;speed:number;updatedAt:number;route?:Coordinate[]};
export const simulationDuration=300000;
export const simulationSpeeds=[0.5,1,2] as const;
/** Avoid a full rotation when the direction crosses -180/180 degrees. */
export function continuousHeading(previous:number,target:number){
 return previous+((target-previous+180)%360+360)%360-180;
}
export function validCoordinate(point:unknown):point is Coordinate{
 const p=point as Coordinate|undefined;
 return !!p&&typeof p.latitude==='number'&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=85&&typeof p.longitude==='number'&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
}
export function simulationPoint(start:Coordinate,end:Coordinate,progress:number):Coordinate{
 const t=Math.max(0,Math.min(1,progress));
 return {latitude:start.latitude+(end.latitude-start.latitude)*t,longitude:start.longitude+(end.longitude-start.longitude)*t};
}
export function advanceSimulation(value:ShipmentSimulation,now:number):ShipmentSimulation{
 const elapsed=Math.min(simulationDuration,Math.max(0,value.elapsed)+(value.running?Math.max(0,now-value.updatedAt)*value.speed:0));
 return {...value,elapsed,running:value.running&&elapsed<simulationDuration,updatedAt:now};
}
export function simulationDistance(a:Coordinate,b:Coordinate){
 const rad=Math.PI/180,deltaLat=(b.latitude-a.latitude)*rad,deltaLon=(b.longitude-a.longitude)*rad;
 const h=Math.sin(deltaLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(deltaLon/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function routeLengths(route:Coordinate[]){
 const lengths=[0];for(let i=1;i<route.length;i++)lengths.push(lengths[i-1]+simulationDistance(route[i-1],route[i]));return lengths;
}
export function routePosition(route:Coordinate[],lengths:number[],progress:number){
 const target=Math.max(0,Math.min(1,progress))*(lengths.at(-1)||0);
 let end=1;while(end<lengths.length-1&&lengths[end]<target)end++;
 const a=route[end-1],b=route[end],segment=lengths[end]-lengths[end-1];
 return {point:simulationPoint(a,b,segment?(target-lengths[end-1])/segment:1),index:end};
}
export function parseStreetRoute(data:any,start:Coordinate,end:Coordinate):Coordinate[]{
 const coordinates=data?.routes?.[0]?.geometry?.coordinates;
 if(data?.code!=='Ok'||!Array.isArray(coordinates)||coordinates.length<2||coordinates.length>50000)throw Error('No se encontró una ruta transitable entre esos puntos.');
 const route=coordinates.map((p:unknown)=>{
  if(!Array.isArray(p)||p.length<2)throw Error('El servicio devolvió una ruta inválida.');
  const point={longitude:p[0],latitude:p[1]};if(!validCoordinate(point))throw Error('El servicio devolvió coordenadas inválidas.');return point;
 });
 if(simulationDistance(start,route[0])>.26||simulationDistance(end,route.at(-1)!)>.26)throw Error('Los puntos están demasiado lejos de una calle. Ajusta sus coordenadas.');
 return route;
}
export async function fetchStreetRoute(start:Coordinate,end:Coordinate,signal:AbortSignal):Promise<Coordinate[]>{
 const coordinates=[start,end].map(p=>`${p.longitude},${p.latitude}`).join(';');
 const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false&radiuses=250;250`,{signal});
 if(!response.ok)throw Error('El servicio de rutas no está disponible. Vuelve a intentarlo.');
 return parseStreetRoute(await response.json(),start,end);
}
export function projectPoint(point:Coordinate,zoom:number){
 const sin=Math.sin(Math.max(-85,Math.min(85,point.latitude))*Math.PI/180),scale=256*2**zoom;
 return {x:(point.longitude+180)/360*scale,y:(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale};
}
export function simulationViewport(start:Coordinate,end:Coordinate,width:number,height:number,zoomOffset=0,route:Coordinate[]=[]){
 const points=[start,end,...route];
 const bounds=(zoom:number)=>{let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const point of points){const p=projectPoint(point,zoom);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)}return {minX,minY,maxX,maxY}};
 let fitted=3;
 for(let z=17;z>=3;z--){const b=bounds(z);if(b.maxX-b.minX<=width-100&&b.maxY-b.minY<=height-100){fitted=z;break}}
 const zoom=Math.max(3,Math.min(18,fitted+zoomOffset)),b=bounds(zoom);
 return {zoom,left:(b.minX+b.maxX-width)/2,top:(b.minY+b.maxY-height)/2};
}
/** Store panning in zoom-zero pixels so zooming keeps the same geographic center. */
export function panSimulationViewport(view:{zoom:number;left:number;top:number},pan:{x:number;y:number},width:number,height:number){
 const scale=2**view.zoom,world=256*scale;
 return {...view,left:Math.max(0,Math.min(Math.max(0,world-width),view.left+pan.x*scale)),top:Math.max(0,Math.min(Math.max(0,world-height),view.top+pan.y*scale))};
}
export function readSimulation(orderId:number):ShipmentSimulation|null{
 try{
  const value=JSON.parse(sessionStorage.getItem('nix-local-shipment-'+orderId)||'null');
  const storedDuration=value?.duration??60000;
  if(!value||![60000,simulationDuration].includes(storedDuration)||value.orderId!==orderId||!validCoordinate(value.start)||!validCoordinate(value.destination)||!Number.isFinite(value.elapsed)||value.elapsed<0||value.elapsed>storedDuration||![...simulationSpeeds,4].includes(value.speed)||!Number.isFinite(value.updatedAt)||typeof value.running!=='boolean')return null;
  // Closing the detail pauses the demonstration; reopening never jumps silently to the end.
  const route=Array.isArray(value.route)&&value.route.length>=2&&value.route.length<=50000&&value.route.every(validCoordinate)?value.route:undefined;
  return {...value,route,elapsed:route?value.elapsed/storedDuration*simulationDuration:0,speed:value.speed===4?1:value.speed,running:false,updatedAt:Date.now()};
 }catch{return null}
}
export function saveSimulation(value:ShipmentSimulation){try{sessionStorage.setItem('nix-local-shipment-'+value.orderId,JSON.stringify({...value,duration:simulationDuration,running:false}))}catch{/* The live demo still works without browser storage. */}}
