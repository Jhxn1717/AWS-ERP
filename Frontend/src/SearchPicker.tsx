import {createPortal} from 'react-dom';
import {useEffect,useId,useRef,useState} from 'react';
type Option={value:string;label:string;detail:string;search:string};
export function SearchPicker({label,placeholder,options,value,onChange,name,disabled=false,buttonLabel}:{label:string;placeholder:string;options:Option[];value:string;onChange:(value:string)=>void;name?:string;disabled?:boolean;buttonLabel?:string}){
 const id=useId(),[query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(0);
 const trigger=useRef<HTMLButtonElement>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(buttonLabel&&open&&!dialog.current?.open)dialog.current?.showModal()},[buttonLabel,open]);
 const selected=options.find(o=>o.value===value);
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const results=options.filter(o=>normalize(o.search).includes(normalize(query)));
 useEffect(()=>{if(open)document.getElementById(id+'-'+active)?.scrollIntoView({block:'nearest'})},[active,open,id]);
 function close(){dialog.current?.close();setOpen(false);setQuery('');trigger.current?.focus()}
 function choose(o:Option){onChange(o.value);close()}
 const panel=<div id={id+'-panel'} className={buttonLabel?'picker-panel':undefined}>
 <input autoFocus={!!buttonLabel} id={id} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={id+'-results'} aria-activedescendant={open&&results[active]?id+'-'+active:undefined} autoComplete="off" disabled={disabled} placeholder={placeholder} value={open?query:selected?.label||''} onFocus={()=>{setOpen(true);setActive(0)}} onChange={e=>{setQuery(e.target.value);if(!buttonLabel)onChange('');setOpen(true);setActive(0)}} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,Math.min(results.length-1,open?i+(e.key==='ArrowDown'?1:-1):0)))}else if(e.key==='Enter'&&open){e.preventDefault();if(results[active])choose(results[active])}else if(e.key==='Escape'&&open){e.preventDefault();e.stopPropagation();close()}}}/>
 {open&&<div id={id+'-results'} className="search-picker-results" role="listbox" aria-label={label}>{results.length?results.map((o,i)=><div id={id+'-'+i} key={o.value} role="option" title={`${o.label}${o.detail?" - "+o.detail:""}`} aria-selected={o.value===value} className={i===active?'active':''} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(i)} onClick={()=>choose(o)}><strong>{o.label}</strong><small>{o.detail}</small></div>):<p role="status">Sin resultados.</p>}</div>}</div>;
 return <div className="search-picker" onBlur={e=>{if(!buttonLabel&&!e.currentTarget.contains(e.relatedTarget)){setOpen(false);setQuery('')}}}>
 <label htmlFor={buttonLabel?id+'-trigger':id}>{label}</label>{name&&<input type="hidden" name={name} value={value}/>}
 {buttonLabel?<><button ref={trigger} id={id+'-trigger'} className="btn full picker-trigger" title={selected?`${selected.label} - ${selected.detail}`:buttonLabel} type="button" disabled={disabled} aria-haspopup="dialog" onClick={()=>{setQuery('');setActive(0);setOpen(true)}}>{selected?<span><strong>{selected.label}</strong><small>{selected.detail}</small></span>:buttonLabel}{selected&&<span>Cambiar</span>}</button>
 {open&&createPortal(<dialog ref={dialog} className="picker-dialog" aria-labelledby={id+'-title'} onCancel={e=>{e.preventDefault();e.stopPropagation();close()}} onClick={e=>{if(e.target===e.currentTarget){const bounds=e.currentTarget.getBoundingClientRect();if(e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom)close()}}}><div className="picker-dialog-heading"><h2 id={id+'-title'}>{buttonLabel}</h2><button type="button" className="btn" aria-label="Cerrar selector" onClick={close}>Cerrar</button></div>{panel}</dialog>,document.body)}</>:panel}
 </div>
}
