import {Children,isValidElement,useState,type ReactNode} from 'react';
import {SearchPicker} from './SearchPicker';
export function ChoicePicker({label,name,value,defaultValue,onChange,children,disabled=false,compact=false}:{label:string;name?:string;value?:string;defaultValue?:string;onChange?:(value:string)=>void;children:ReactNode;disabled?:boolean;compact?:boolean}){
 const options=Children.toArray(children).filter(isValidElement).map(child=>{const props=child.props as {value?:string;children:ReactNode};const label=String(props.children);return {value:String(props.value??label),label,detail:'',search:label}});
 const [local,setLocal]=useState(defaultValue??options[0]?.value??'');
 return <div className={compact?'choice-picker compact':'choice-picker'}><SearchPicker label={label} buttonLabel={'Seleccionar '+label.toLowerCase()} placeholder={'Buscar '+label.toLowerCase()} name={name} disabled={disabled} value={value??local} onChange={next=>{setLocal(next);onChange?.(next)}} options={options}/></div>
}
