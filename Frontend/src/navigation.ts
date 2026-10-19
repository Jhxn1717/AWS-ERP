const normalize = (value:string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export function pageHash(page:string):string {
 return '#'+(page==='Mi perfil'?'mi-perfil':normalize(page));
}

export function pageFromHash(hash:string,pages:readonly string[]):string {
 try{
  const route=normalize(decodeURIComponent(hash));
  if(route==='#mi-perfil')return 'Mi perfil';
  return pages.find(page=>pageHash(page)===route)||'Dashboard';
 }catch{return 'Dashboard'}
}
