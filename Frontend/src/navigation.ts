export const adminPages:Record<string,string>={
 'Administración':'Resumen',Usuarios:'Usuarios','Roles y permisos':'Roles y permisos',
 Sesiones:'Sesiones',Empresa:'Empresa',Importaciones:'Importaciones','Auditoría':'Auditoría','Vaciar datos':'Vaciar datos',
};

export function navigationPage(page:string):string {
 return Object.prototype.hasOwnProperty.call(adminPages,page)?'Administración':page;
}

const normalize = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function pageHash(page:string):string {
 return '#'+(page==='Mi perfil'?'mi-perfil':normalize(page).replace(/\s+/g,'-'));
}

export function pageFromHash(hash:string,pages:readonly string[]):string {
 try{
  const route=normalize(decodeURIComponent(hash));
  if(route==='#mi-perfil')return 'Mi perfil';
  return pages.find(page=>pageHash(page)===route)||'Dashboard';
 }catch{return 'Dashboard'}
}
