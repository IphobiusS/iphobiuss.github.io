/* Optional notebook. JSON imports are bounded, reviewed and additive. No network. */
(() => {
 'use strict';
 // Worst JSON string escaping is 6 bytes per UTF-16 unit.
 // 240 × (URL 500 + title 160 + note 2000 + date 24) × 6
 // plus < 200 bytes of pretty-JSON overhead per row is < 4 MiB.
 const KEY='iphobiuss:notebook:v1', VERSION=1, MAX_BYTES=4*1024*1024;
 const routes=new Set(['guias','tecnicas','herramientas','fundamentos','setup','cap','knife','forest','vaccine','sauna','cascade','cap-caso','forest-caso','banco-lumbre','cuaderno','recorrido','report-gen-demo']);
 const page=document.body.dataset.page;if(!routes.has(page)&&page!=='index')return;
 const status=(text,feedback=true)=>document.querySelectorAll('[data-notebook-status]').forEach(el=>{
  if(el.closest('.reader-toolbar')&&!feedback){const message=document.createElement('span');message.className='sr-only';message.textContent=text;el.replaceChildren(message);}
  else el.textContent=text;
 });
 const cleanURL=value=>{
  if(typeof value!=='string'||value.length>500||/[\u0000-\u0020\u007f]/.test(value))return null;
  // Backups use a basename, optionally followed by a fragment. Do not collapse paths.
  const match=/^([a-z-]+)\.html(#[^#]*)?$/.exec(value);if(!match||!routes.has(match[1]))return null;
  try{const fragment=decodeURIComponent((match[2]||'').slice(1));if(/[\u0000-\u001f\u007f]/.test(fragment))return null;}catch{return null;}
  return value;
 };
 const blank=()=>({version:VERSION,items:[],reading:[]});
 const validDate=value=>value===''||(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().replace('.000Z','Z')===value.replace('.000Z','Z'));
 const validateImport=raw=>{
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
  if(!exact(raw,['version','items','reading'])||raw.version!==VERSION)throw Error('Se requiere el formato completo de cuaderno JSON, versión 1.');
  const result=blank();
  for(const key of ['items','reading']){
   if(!Array.isArray(raw[key])||raw[key].length>(key==='items'?200:40))throw Error('El archivo supera el límite de 200 favoritos o 40 puntos de lectura, o tiene un formato incorrecto.');
   const seen=new Set();
   for(const item of raw[key]){
    if(!exact(item,['url','title','note','updated'])||!cleanURL(item.url)||typeof item.title!=='string'||item.title.length>160||typeof item.note!=='string'||item.note.length>2000||typeof item.updated!=='string'||!validDate(item.updated)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item.title+item.note))throw Error('Hay una entrada inválida: revisa rutas, texto (título 160, nota 2000 caracteres), campos y fechas. No se añadió ningún dato.');
    const identity=key==='reading'?item.url.split('#')[0]:item.url;
    if(seen.has(identity))throw Error('El archivo contiene favoritos repetidos o varios puntos para una misma página. No se añadió ningún dato.');seen.add(identity);
    result[key].push({url:item.url,title:item.title,note:item.note,updated:item.updated});
   }
  }return result;
 };
 let persistent=true,data;
 try{const value=localStorage.getItem(KEY);data=value?validateImport(JSON.parse(value)):blank();}catch{persistent=false;data=blank();}
 const persistenceMessage='No se puede leer o guardar el cuaderno local. Este cuaderno solo durará durante esta página; exporta una copia antes de salir.';
 const save=message=>{try{if(persistent)localStorage.setItem(KEY,JSON.stringify(data));}catch{persistent=false;}if(!persistent)status(persistenceMessage);else if(message)status(message);};
 const now=()=>new Date().toISOString();
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const link=item=>{const a=node('a',item.title||item.url);a.href=item.url;return a;};
 const drafts=new Map();
 const captureDrafts=()=>document.querySelectorAll('textarea[data-notebook-note]').forEach(input=>{if(input.value!==input.dataset.savedNote)drafts.set(input.dataset.notebookNote,input.value);else drafts.delete(input.dataset.notebookNote);});
 const markdown=item=>{
  const title=(item.title||item.url).replace(/[\r\n]/g,' ').replace(/([\\`*_{}\[\]<>#])/g,'\\$1');
  const url=new URL(item.url,'https://iphobiuss.github.io/').href.replace(/[()]/g,char=>'%'+char.charCodeAt(0).toString(16));
  return '# '+title+'\n\nFuente: <'+url+'>\n\n## Nota personal\n\n'+item.note+'\n';
 };
 const renderProgress=()=>{
  for(const panel of document.querySelectorAll('[data-guide-progress]')){
   const reading=data.reading.find(item=>item.url.split('#')[0]===panel.dataset.guideProgress);panel.replaceChildren();panel.hidden=!reading;
   if(!reading)continue;
   let sections=[];try{sections=JSON.parse(panel.dataset.guideSections);}catch{}
   const fragment=reading.url.split('#').slice(1).join('#');let id=fragment;try{id=decodeURIComponent(fragment);}catch{}
   const index=sections.findIndex(section=>section.id===id),point=node('p',index>=0?'Punto de lectura: sección '+(index+1)+' de '+sections.length+' · '+sections[index].label:'Punto de lectura guardado; la sección puede haber cambiado.');
   const a=link({url:reading.url,title:'Retomar '+(document.querySelector('a[href="'+panel.dataset.guideProgress+'"]')?.textContent||'guía')});a.className='text-link';panel.append(point,a);
   if(!persistent)panel.append(node('p','Disponible solo durante esta página.'));
  }
  for(const group of document.querySelectorAll('[data-guide-progress-group]')){
   const message=group.querySelector('[data-guide-progress-message]');if(!message)continue;
   const hasReading=[...group.querySelectorAll('[data-guide-progress]')].some(panel=>!panel.hidden);
   message.hidden=hasReading;
   message.textContent=persistent?'Aún no tienes puntos de lectura en estas guías.':'No se pueden consultar los puntos de lectura de este navegador.';
  }
 };
 const render=()=>{
  const active=document.activeElement,focusedURL=active?.dataset.notebookNote,selection=focusedURL?[active.selectionStart,active.selectionEnd]:null;
  captureDrafts();for(const url of drafts.keys()){if(!data.items.some(item=>item.url===url))drafts.delete(url);}
  for(const button of document.querySelectorAll('[data-bookmark]')){
   const saved=data.items.some(item=>item.url===button.dataset.bookmark);button.setAttribute('aria-pressed',String(saved));button.title=saved?'Pulsa de nuevo para quitar este favorito':'Guardar este enlace como favorito local';const mark=button.querySelector('[data-bookmark-mark]');if(mark)mark.textContent=saved?'✓':'';
  }
  const list=document.querySelector('[data-notebook-list]');if(list){
   list.replaceChildren();if(!data.items.length)list.append(node('p','Todavía no hay favoritos. Abre una guía, técnica o caso y pulsa «Guardar en mi cuaderno».'));
   for(const [index,item] of data.items.entries()){
    const article=node('article',undefined,'notebook-item'),h=node('h3');h.append(link(item));article.append(h);
    const label=node('label','Nota personal'),input=node('textarea');input.rows=3;input.maxLength=2000;input.value=drafts.has(item.url)?drafts.get(item.url):item.note;input.dataset.notebookNote=item.url;input.dataset.savedNote=item.note;input.id='note-'+index;label.htmlFor=input.id;article.append(label,input);
    const actions=node('div',undefined,'actions'),saveButton=node('button','Guardar nota','button');saveButton.type='button';saveButton.addEventListener('click',()=>{item.note=input.value;input.dataset.savedNote=item.note;drafts.delete(item.url);item.updated=now();save('Nota guardada en este navegador.');});
    const copy=node('button','Copiar nota en Markdown','button');copy.type='button';copy.dataset.notebookCopy=item.url;
    const copyHint=node('p','La copia incluye el texto actual de la nota, aunque aún no lo hayas guardado.','muted');
    const fallback=node('div');fallback.hidden=true;const fallbackLabel=node('label','Markdown para copiar manualmente'),fallbackInput=node('textarea');fallbackInput.readOnly=true;fallbackInput.rows=6;fallbackInput.id='markdown-'+index;fallbackInput.dataset.notebookMarkdown=item.url;fallbackLabel.htmlFor=fallbackInput.id;fallback.append(fallbackLabel,fallbackInput);
    copy.addEventListener('click',async()=>{const text=markdown({...item,note:input.value});try{if(!navigator.clipboard?.writeText)throw Error('unavailable');await navigator.clipboard.writeText(text);fallback.hidden=true;status(input.value===item.note?'Nota copiada en Markdown.':'Texto actual copiado en Markdown; los cambios de la nota todavía no se han guardado.');}catch{fallbackInput.value=text;fallback.hidden=false;fallbackInput.focus();fallbackInput.select();status('No se pudo usar el portapapeles. El Markdown está seleccionado; cópialo con el menú del navegador o Ctrl+C / Command+C.');}});
    const remove=node('button','Quitar favorito','button');remove.type='button';remove.addEventListener('click',()=>{data.items=data.items.filter(i=>i!==item);save('Favorito retirado; su nota también se eliminó.');render();const next=document.querySelector('[data-notebook-list] a')||document.querySelector('[data-notebook-export]');next?.focus();});actions.append(saveButton,copy,remove);article.append(actions,copyHint,fallback);list.append(article);
   }
  }
  if(focusedURL){const replacement=[...document.querySelectorAll('textarea[data-notebook-note]')].find(input=>input.dataset.notebookNote===focusedURL);if(replacement){replacement.focus({preventScroll:true});replacement.setSelectionRange(...selection);}}
  const resume=document.querySelector('[data-notebook-resume]');if(resume){resume.replaceChildren();if(!data.reading.length)resume.append(node('p','Aún no hay puntos de lectura. Se guardan al recorrer una guía o un caso con JavaScript activo.'));for(const item of [...data.reading].reverse()){const p=node('p');p.append(link(item));resume.append(p);}}
  renderProgress();
 };
 document.querySelectorAll('[data-bookmark]').forEach(button=>button.addEventListener('click',()=>{
  const url=cleanURL(button.dataset.bookmark);if(!url)return;const found=data.items.find(item=>item.url===url);
  if(found){data.items=data.items.filter(item=>item!==found);save('Favorito retirado de este navegador.');}
  else{if(data.items.length>=200){status('El cuaderno admite 200 favoritos. Exporta una copia y retira algunos para añadir más.');return;}data.items.push({url,title:button.dataset.bookmarkTitle.slice(0,160),note:'',updated:now()});save('Favorito guardado en este navegador.');}render();
 }));
 document.querySelectorAll('[data-notebook-export]').forEach(button=>button.addEventListener('click',()=>{
  const links=button.dataset.notebookExport==='links';
  const text=links?['Cuaderno local de iphobiuss','Favoritos:',...data.items.map(item=>item.title+'\nhttps://iphobiuss.github.io/'+item.url),'Puntos de lectura:',...data.reading.map(item=>item.title+'\nhttps://iphobiuss.github.io/'+item.url)].join('\n\n'):JSON.stringify(data,null,2);
  const blob=new Blob([text],{type:links?'text/plain;charset=utf-8':'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=links?'iphobiuss-cuaderno-enlaces.txt':'iphobiuss-cuaderno.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status(links?'Enlaces exportados. El archivo TXT no contiene tus notas.':'Cuaderno exportado; el JSON incluye solo tus notas guardadas, que pueden ser personales.');
 }));
 const importButton=document.querySelector('[data-notebook-import]'),importPanel=document.querySelector('[data-notebook-import-panel]'),fileInput=document.querySelector('[data-notebook-import-file]'),apply=document.querySelector('[data-notebook-import-apply]'),preview=document.querySelector('[data-notebook-import-preview]');let staged=null,importGeneration=0;
 const merge=(imported,base=data)=>{
  const result={version:VERSION,items:[...base.items],reading:[...base.reading]};let added=0,conflicts=0;
  for(const key of ['items','reading'])for(const item of imported[key]){const identity=key==='reading'?item.url.split('#')[0]:item.url;if(result[key].some(existing=>(key==='reading'?existing.url.split('#')[0]:existing.url)===identity)){conflicts++;continue;}result[key].push(item);added++;}
  if(result.items.length>200||result.reading.length>40)throw Error('La suma superaría 200 favoritos o 40 puntos de lectura. Exporta una copia y libera espacio antes de importar. No se añadió ningún dato.');
  return {result,added,conflicts};
 };
 const closeImport=()=>{importGeneration++;staged=null;fileInput.value='';apply.disabled=true;importPanel.hidden=true;importButton.setAttribute('aria-expanded','false');importButton.focus();};
 importButton?.addEventListener('click',()=>{importPanel.hidden=false;importButton.setAttribute('aria-expanded','true');fileInput.focus();});
 document.querySelector('[data-notebook-import-cancel]')?.addEventListener('click',closeImport);
 importPanel?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();closeImport();}});
 fileInput?.addEventListener('change',async()=>{
  const generation=++importGeneration;staged=null;apply.disabled=true;const file=fileInput.files[0];if(!file){preview.textContent='Selecciona un archivo para revisarlo antes de añadirlo.';return;}
  try{if(file.size>MAX_BYTES)throw Error('El archivo supera 4 MiB. No se leyó ni añadió su contenido.');const text=await file.text();if(generation!==importGeneration)return;if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('El archivo supera 4 MiB.');const imported=validateImport(JSON.parse(text));const {added,conflicts}=merge(imported);staged=imported;preview.textContent='Revisión: '+added+' entradas nuevas y '+conflicts+' coincidencias que se conservarán como están en tu cuaderno. Los borradores sin guardar permanecen en pantalla.';apply.disabled=!added;apply.textContent='Añadir '+added+' entradas nuevas';}
  catch(error){if(generation!==importGeneration)return;preview.textContent=error instanceof SyntaxError?'El archivo no es un JSON válido. No se añadió ningún dato.':error.message;}
 });
 apply?.addEventListener('click',()=>{
  if(!staged)return;captureDrafts();
  try{
   // Re-read at commit so a preview cannot overwrite another tab's newer notebook.
   let base=data;
   if(persistent){const latest=localStorage.getItem(KEY);base=latest?validateImport(JSON.parse(latest)):blank();}
   const {result,added,conflicts}=merge(staged,base);
   if(persistent)localStorage.setItem(KEY,JSON.stringify(result));
   data=result;render();closeImport();status('Se añadieron '+added+' entradas; '+conflicts+' coincidencias conservaron su contenido.'+(!persistent?' '+persistenceMessage:''));
  }catch(error){preview.textContent='No se pudo añadir el respaldo. Se conserva el cuaderno y los borradores. '+(error.name==='QuotaExceededError'?'El almacenamiento está lleno; exporta una copia y libera espacio.':error.message);apply.disabled=false;}
 });
 const clear=document.querySelector('[data-notebook-clear]'),confirm=document.querySelector('[data-notebook-clear-confirm]');
 clear?.addEventListener('click',()=>{confirm.hidden=false;clear.setAttribute('aria-expanded','true');document.querySelector('[data-notebook-clear-cancel]')?.focus();});
 document.querySelector('[data-notebook-clear-cancel]')?.addEventListener('click',()=>{confirm.hidden=true;clear.setAttribute('aria-expanded','false');clear.focus();});
 document.querySelector('[data-notebook-clear-yes]')?.addEventListener('click',()=>{data=blank();drafts.clear();document.querySelectorAll('textarea[data-notebook-note]').forEach(input=>input.dataset.savedNote=input.value);let removed=true;try{localStorage.removeItem(KEY);persistent=true;}catch{removed=false;persistent=false;}confirm.hidden=true;clear.setAttribute('aria-expanded','false');render();status(removed?'Cuaderno eliminado de este navegador. Los archivos exportados permanecen en tu equipo.':'Se vació el cuaderno de esta página; no pudo confirmarse el borrado del almacenamiento del navegador.');clear.focus();});
 confirm?.addEventListener('keydown',event=>{if(event.key==='Escape'&&!confirm.hidden){event.stopPropagation();confirm.hidden=true;clear.setAttribute('aria-expanded','false');clear.focus();}});
 const progress=document.querySelector('[data-reader-progress]');
 if(progress){
  const title=(document.querySelector('h1')?.getAttribute('aria-label')||document.querySelector('h1')?.textContent||page).slice(0,130);
  const headings=[...document.querySelectorAll('.article-content h2[id],.article-content section[id],.guide-body section[id]')].filter(el=>el.id&&!el.closest('[hidden]'));let timer=0,last='';
  const update=()=>{
   const available=headings.filter(el=>el.getClientRects().length>0);if(!available.length)return;
   let current=available[0];for(const el of available){if(el.getBoundingClientRect().top<=innerHeight*.45)current=el;else break;}
   const url=page+'.html#'+current.id;if(url===last)return;last=url;
   const label=(current.querySelector('h2')?.textContent||current.textContent).trim().slice(0,100);
   data.reading=data.reading.filter(item=>item.url.split('#')[0]!==page+'.html');data.reading.push({url,title:(title+' · '+label).slice(0,160),note:'',updated:now()});data.reading=data.reading.slice(-40);save(null);progress.textContent=persistent?'Punto de lectura guardado':'Punto de lectura disponible solo durante esta página';progress.title=label;
  };
  window.addEventListener('scroll',()=>{if(!timer)timer=setTimeout(()=>{timer=0;update();},650);},{passive:true});
 }
 window.addEventListener('storage',event=>{if(event.key!==KEY&&event.key!==null)return;try{data=event.key===null||!event.newValue?blank():validateImport(JSON.parse(event.newValue));render();status('Cuaderno actualizado desde otra pestaña.'+(drafts.size?' Las notas sin guardar permanecen en pantalla.':''));}catch{persistent=false;renderProgress();status('No se pudo leer la actualización de otra pestaña. Se conservan los datos de esta página sin sobrescribir el almacenamiento; exporta una copia antes de salir.');}});
 render();document.documentElement.classList.add('notebook-ready');status(persistent?'Favoritos y lectura guardados solo en este navegador.':persistenceMessage,false);
})();
