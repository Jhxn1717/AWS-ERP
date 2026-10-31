import {useEffect,useRef,useState} from 'react';
import {request,type User} from './WorkspacePanels';

type GoogleAPI={accounts:{id:{initialize:(options:{client_id:string;nonce:string;callback:(result:{credential:string})=>void;auto_select:boolean})=>void;renderButton:(element:HTMLElement,options:object)=>void}}};
declare global {interface Window {google?:GoogleAPI}}
let sdk:Promise<GoogleAPI>|undefined;
function loadGoogle():Promise<GoogleAPI>{
 if(window.google)return Promise.resolve(window.google);
 if(!sdk)sdk=new Promise<GoogleAPI>((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
  script.onload=()=>window.google?resolve(window.google):reject(Error('No se pudo cargar Google.'));
  script.onerror=()=>{script.remove();sdk=undefined;reject(Error('No se pudo conectar con Google. Revisa tu conexión.'))};document.head.appendChild(script);
 });
 return sdk;
}

export function GoogleSignIn({onLogin,registration=false}:{onLogin:(user:User)=>void;registration?:boolean}){
 const host=useRef<HTMLDivElement>(null),onSuccess=useRef(onLogin);
 onSuccess.current=onLogin;
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[available,setAvailable]=useState<boolean|null>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>setError(''),[registration]);
 useEffect(()=>{
  let active=true;
  let resize:ResizeObserver|undefined;
  async function start(){
   setBusy(false);
   try{
    const config=await request('auth/google/config');if(!active)return;setAvailable(config.enabled);
    if(!config.enabled)return;
    const google=await loadGoogle();if(!active)return;
    const challenge=await request('auth/google/challenge');if(!active||!host.current)return;
    google.accounts.id.initialize({client_id:config.clientId,nonce:challenge.nonce,auto_select:false,callback:async({credential})=>{
     if(!active)return;setBusy(true);setError('');
     try{const user=await request('auth/google','POST',{credential,intent:registration?'register':'login'});if(active)onSuccess.current(user)}
     catch(e){if(active){setError((e as Error).message);setAttempt(n=>n+1)}}
     finally{if(active)setBusy(false)}
    }});
    let lastWidth=0;
    const render=()=>{
     if(!active||!host.current||!host.current.clientWidth)return;
     // The Google iframe adds 20px around its requested button width.
     const width=Math.max(200,Math.min(Math.floor(host.current.clientWidth)-20,355));
     if(width===lastWidth)return;
     lastWidth=width;host.current.replaceChildren();
     google.accounts.id.renderButton(host.current,{type:'standard',theme:'outline',size:'medium',text:registration?'signup_with':'signin_with',shape:'rectangular',locale:'es',width});
    };
    render();resize=new ResizeObserver(render);resize.observe(host.current);
   }catch(e){if(active)setError((e as Error).message)}
  }
  start();return()=>{active=false;resize?.disconnect();host.current?.replaceChildren()};
 },[attempt,registration]);
 return <div className="google-signin">
  <div ref={host} className="google-button" hidden={busy} aria-label="Acceder con Google"/>
  {busy&&<p role="status">Verificando tu cuenta con Google…</p>}
  {available===null&&!error&&<p role="status">Cargando acceso con Google…</p>}
  {available===false&&<><button type="button" className="btn full" disabled>Continuar con Google</button><p>El acceso con Google aún no está activado.</p></>}
  {error&&<div className="inline-error" role="alert">{error}<button type="button" className="btn" onClick={()=>{setError('');setAttempt(n=>n+1)}}>Reintentar</button></div>}
  {!registration&&<div className="login-divider"><span>o utiliza tu correo y contraseña</span></div>}
 </div>;
}
