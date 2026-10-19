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
 const parse=value=>{if(new TextEncoder().encode(value).length>MAX_BYTES)throw Error('El cuaderno supera 4 MiB.');return validateImport(JSON.parse(value));};
 let persistent=true,data=blank(),recovery=null;
 const preserveRaw=raw=>{persistent=false;if(typeof raw==='string'&&raw!==recovery?.raw){recovery={raw,reviewed:null};document.querySelector('[data-notebook-recovery]')?.remove();}};
 try{const value=localStorage.getItem(KEY);if(value!==null){try{data=parse(value);}catch{preserveRaw(value);}}}catch{persistent=false;}
 const persistenceMessage='No se puede leer o guardar el cuaderno local. Este cuaderno solo durará durante esta página; exporta una copia antes de salir.';
 const now=()=>new Date().toISOString();
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
 const link=item=>{const a=node('a',item.title||item.url);a.href=item.url;return a;};
 const drafts=new Map(),orphans=new Map();let copyGeneration=0;
 const captureDrafts=()=>document.querySelectorAll('textarea[data-notebook-note]').forEach(input=>{
  const url=input.dataset.notebookNote,previous=drafts.get(url);
  if(input.value!==input.dataset.savedNote||previous?.conflict)drafts.set(url,{...previous,value:input.value,base:previous?.base??input.dataset.savedNote,item:previous?.item??{url,title:input.dataset.notebookTitle,note:input.dataset.savedNote,updated:input.dataset.updated}});
  else drafts.delete(url);
 });
 const download=(text,filename,type='application/json;charset=utf-8')=>{const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const rawMessage='El original local no se puede abrir y permanece intacto. En «Mi cuaderno» puedes descargarlo y revisar una copia recuperable. ';
 // Lock the read/modify/write sequence across tabs. Older browsers keep this
 // notebook in memory instead of pretending their separate storage calls are atomic.
 if(!navigator.locks?.request)persistent=false;
 const locked=async task=>{
  if(!navigator.locks?.request)return task();
  let entered=false;
  try{return await navigator.locks.request(KEY,()=>{entered=true;return task();});}
  catch(error){if(entered)throw error;persistent=false;return task();}
 };
 const latest=()=>{
  if(!persistent)return data;
  let raw;try{raw=localStorage.getItem(KEY);}catch{persistent=false;return data;}
  try{return raw===null?blank():parse(raw);}catch{preserveRaw(raw);throw Error(rawMessage);}
 };
 const mutate=async(change,message)=>locked(()=>{
  captureDrafts();let result;
  try{const base=latest();data=base;result=validateImport(change(structuredClone(base)));}
  catch(error){render();status(error.message+' Los borradores permanecen disponibles.');return false;}
  // Validate before changing either persistent data or the in-memory notebook.
  if(persistent){try{localStorage.setItem(KEY,JSON.stringify(result));}catch{persistent=false;}}
  data=result;if(message)status((recovery?rawMessage:'')+(persistent?message:persistenceMessage));return true;
 });
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
 const recoveryPanel=()=>{
  const list=document.querySelector('[data-notebook-list]');if(!list)return;
  let panel=document.querySelector('[data-notebook-recovery]');
  if(!recovery){panel?.remove();return;}
  if(panel)return;
  panel=node('section',undefined,'notice');panel.dataset.notebookRecovery='';panel.setAttribute('aria-labelledby','notebook-recovery-title');
  const title=node('h2','Revisar cuaderno');title.id='notebook-recovery-title';
  const explanation=node('p','El original no se puede abrir, pero sigue intacto. Descárgalo antes de intentar repararlo. La revisión crea una copia con las entradas válidas sin cambiar el almacenamiento. Ambas copias pueden contener notas personales.');
  const actions=node('div',undefined,'actions'),raw=node('button','Descargar original','button'),review=node('button','Revisar copia','button'),session=node('button','Descargar esta pestaña','button'),summary=node('p');summary.dataset.notebookRecoverySummary='';summary.setAttribute('role','status');
  raw.type=review.type='button';raw.dataset.notebookRecoveryRaw='';review.dataset.notebookRecoveryReview='';
  raw.addEventListener('click',()=>download(recovery.raw,'iphobiuss-cuaderno-original.json'));
  session.type='button';session.dataset.notebookRecoverySession='';session.addEventListener('click',()=>download(JSON.stringify(data,null,2),'iphobiuss-cuaderno-pestana.json'));
  review.addEventListener('click',()=>{
   try{
    if(new TextEncoder().encode(recovery.raw).length>MAX_BYTES)throw Error('El original supera 4 MiB. Descárgalo para revisarlo fuera del navegador.');
    const source=JSON.parse(recovery.raw);
    if(!source||source.version!==VERSION||!Array.isArray(source.items)||!Array.isArray(source.reading)||Object.keys(source).sort().join(',')!=='items,reading,version')throw Error('No se reconoce el formato versión 1. Descarga el original para revisarlo sin alterarlo.');
    const result=blank();let rejected=0;
    for(const key of ['items','reading']){const limit=key==='items'?200:40;rejected+=Math.max(0,source[key].length-limit);for(const item of source[key].slice(0,limit)){try{const candidate=structuredClone(result);candidate[key].push(item);validateImport(candidate);result[key].push(item);}catch{rejected++;}}}
    recovery.reviewed=result;summary.textContent='Copia revisada: '+result.items.length+' favoritos y '+result.reading.length+' puntos de lectura válidos. '+rejected+' entradas excluidas por ser inválidas, duplicadas o exceder los límites. El original las conserva. Descarga y revisa ambas copias antes de sustituir el cuaderno mediante borrado e importación.';
    let clean=actions.querySelector('[data-notebook-recovery-clean]');if(!clean){clean=node('button','Descargar copia revisada','button');clean.type='button';clean.dataset.notebookRecoveryClean='';clean.addEventListener('click',()=>download(JSON.stringify(recovery.reviewed,null,2),'iphobiuss-cuaderno-recuperable.json'));actions.append(clean);}
   }catch(error){summary.textContent=error instanceof SyntaxError?'El original no es JSON válido. Descárgalo para revisarlo sin alterarlo.':error.message;}
  });
  actions.append(raw,review,session);panel.append(title,explanation,actions,summary);list.parentElement.before(panel);
 };
 const renderOrphans=()=>{
  const list=document.querySelector('[data-notebook-list]');if(!list)return;
  let panel=document.querySelector('[data-notebook-orphans]');if(!orphans.size){panel?.remove();return;}
  if(!panel){panel=node('section');panel.dataset.notebookOrphans='';panel.setAttribute('aria-labelledby','notebook-orphans-title');list.parentElement.after(panel);}
  panel.replaceChildren();const title=node('h2','Notas por recuperar');title.id='notebook-orphans-title';panel.append(title,node('p','Estos favoritos fueron retirados mientras tenías notas sin guardar. Los borradores permanecen en esta pestaña; restáuralos o descárgalos antes de salir.'));
  for(const [url,draft] of orphans){
   const article=node('article',undefined,'notebook-item'),h=node('h3',draft.item.title||url),label=node('label','Borrador conservado'),input=node('textarea');input.readOnly=true;input.rows=3;input.value=draft.value;input.dataset.notebookOrphan=url;input.id='orphan-'+[...orphans.keys()].indexOf(url);label.htmlFor=input.id;
   const actions=node('div',undefined,'actions'),restore=node('button',data.items.some(item=>item.url===url)?'Revisar borrador en el favorito':'Restaurar favorito y borrador','button'),copy=node('button','Descargar borrador (JSON)','button');restore.type=copy.type='button';restore.dataset.notebookRestore=url;copy.dataset.notebookOrphanDownload=url;
   restore.addEventListener('click',async()=>{
    const ok=await mutate(base=>{if(!base.items.some(item=>item.url===url)){if(base.items.length>=200)throw Error('El cuaderno admite 200 favoritos; libera espacio antes de restaurar.');base.items.push({...draft.item,updated:now()});}return base;},'Favorito restaurado. Revisa y guarda su borrador para conservar la nota.');
    if(ok){orphans.delete(url);drafts.set(url,draft);render(false);document.querySelector('textarea[data-notebook-note="'+CSS.escape(url)+'"]')?.focus();}
   });
   copy.addEventListener('click',()=>download(JSON.stringify({version:VERSION,items:[{...draft.item,note:draft.value}],reading:[]},null,2),'iphobiuss-borrador.json'));
   actions.append(restore,copy);article.append(h,label,input,actions);panel.append(article);
  }
 };
 const render=(capture=true)=>{
  const active=document.activeElement;
  const focusAttribute=['note','save','copy','remove','open','conflict','markdown','restore','orphan-download','orphan'].map(name=>'data-notebook-'+name).find(name=>active?.hasAttribute(name));
  const focusedURL=focusAttribute?active.getAttribute(focusAttribute):null;
  const selection=focusAttribute&&typeof active.selectionStart==='number'?[active.selectionStart,active.selectionEnd,active.selectionDirection]:null;
  // A cross-tab update must not discard the manual clipboard fallback while it
  // is selected for copying. Keep its snapshot until the reader copies again.
  const manualCopies=new Map([...document.querySelectorAll('[data-notebook-markdown]')].filter(input=>!input.parentElement.hidden).map(input=>[input.dataset.notebookMarkdown,input.value]));
  if(capture)captureDrafts();for(const [url,draft] of drafts){if(!data.items.some(item=>item.url===url)){orphans.set(url,draft);drafts.delete(url);}}
  for(const button of document.querySelectorAll('[data-bookmark]')){
   const saved=data.items.some(item=>item.url===button.dataset.bookmark);button.setAttribute('aria-pressed',String(saved));button.title=saved?'Pulsa de nuevo para quitar este favorito':'Guardar este enlace como favorito local';const mark=button.querySelector('[data-bookmark-mark]');if(mark)mark.textContent=saved?'✓':'';
  }
  const list=document.querySelector('[data-notebook-list]');if(list){
   list.replaceChildren();if(!data.items.length)list.append(node('p','Todavía no hay favoritos. Abre una guía, técnica o caso y pulsa «Guardar en mi cuaderno».'));
   for(const [index,item] of data.items.entries()){
    const article=node('article',undefined,'notebook-item'),h=node('h3'),open=link(item);open.dataset.notebookOpen=item.url;h.append(open);article.append(h);
    const draft=drafts.get(item.url),conflict=draft&&draft.base!==item.note;
    if(draft)draft.conflict=Boolean(conflict);
    const label=node('label','Nota personal'),input=node('textarea');input.rows=3;input.maxLength=2000;input.value=draft?draft.value:item.note;input.dataset.notebookNote=item.url;input.dataset.savedNote=item.note;input.dataset.notebookTitle=item.title;input.dataset.updated=item.updated;input.id='note-'+index;label.htmlFor=input.id;article.append(label,input);
    const actions=node('div',undefined,'actions'),saveButton=node('button',conflict?'Guardar mi borrador sobre la versión revisada':'Guardar nota','button');saveButton.type='button';saveButton.dataset.notebookSave=item.url;
    if(conflict){const details=node('div'),savedLabel=node('label','Versión guardada en otra pestaña'),saved=node('textarea');saved.id='conflict-'+index;saved.readOnly=true;saved.rows=3;saved.value=item.note;saved.dataset.notebookConflict=item.url;savedLabel.htmlFor=saved.id;details.append(node('p','La nota guardada cambió en otra pestaña. Compara ambas versiones antes de guardar tu borrador sobre ella.'),savedLabel,saved);article.append(details);}
    saveButton.addEventListener('click',async()=>{
     const value=input.value,expected=item.note;
     const ok=await mutate(base=>{const target=base.items.find(row=>row.url===item.url);if(!target)throw Error('Este favorito fue retirado desde otra pestaña. Puedes restaurar el borrador conservado.');if(target.note!==expected)throw Error('La nota cambió en otra pestaña. Revisa ambas versiones antes de guardar.');target.note=value;target.updated=now();return base;},'Nota guardada en este navegador.');
     if(ok){input.dataset.savedNote=value;drafts.delete(item.url);render();}
    });
    const copy=node('button','Copiar nota en Markdown','button');copy.type='button';copy.dataset.notebookCopy=item.url;
    const copyHint=node('p','La copia incluye el texto actual de la nota, aunque aún no lo hayas guardado.','muted');
    const fallback=node('div');fallback.hidden=!manualCopies.has(item.url);const fallbackLabel=node('label','Markdown para copiar manualmente'),fallbackInput=node('textarea');fallbackInput.readOnly=true;fallbackInput.rows=6;fallbackInput.value=manualCopies.get(item.url)||'';fallbackInput.id='markdown-'+index;fallbackInput.dataset.notebookMarkdown=item.url;fallbackLabel.htmlFor=fallbackInput.id;fallback.append(fallbackLabel,fallbackInput);
    copy.addEventListener('click',async()=>{
     const generation=++copyGeneration,value=input.value,text=markdown({...item,note:value});
     // A browser permission may resolve after a storage event rebuilds this item.
     // Find its current control and retain the requested snapshot, never a detached textarea.
     const currentFallback=()=>generation===copyGeneration?document.querySelector('[data-notebook-markdown="'+CSS.escape(item.url)+'"]'):null;
     try{
      if(!navigator.clipboard?.writeText)throw Error('unavailable');await navigator.clipboard.writeText(text);
      const current=currentFallback();if(!current)return;current.parentElement.hidden=true;
      status(value===item.note?'Nota copiada en Markdown.':'Texto seleccionado copiado en Markdown; los cambios de la nota todavía no se han guardado.');
     }catch{
      const current=currentFallback();if(!current)return;current.value=text;current.parentElement.hidden=false;current.focus();current.select();
      status('No se pudo usar el portapapeles. El Markdown está seleccionado; cópialo con el menú del navegador o Ctrl+C / Command+C.');
     }
    });
    const remove=node('button','Quitar favorito','button');remove.type='button';remove.dataset.notebookRemove=item.url;remove.addEventListener('click',async()=>{const ok=await mutate(base=>{const target=base.items.find(row=>row.url===item.url);if(target&&JSON.stringify(target)!==JSON.stringify(item))throw Error('El favorito cambió en otra pestaña. Revisa su contenido antes de retirarlo.');base.items=base.items.filter(row=>row.url!==item.url);return base;},'Favorito retirado; cualquier borrador sin guardar sigue disponible para recuperarlo.');if(ok){render();const next=document.querySelector('[data-notebook-restore]')||document.querySelector('[data-notebook-list] a')||document.querySelector('[data-notebook-export]');next?.focus();}});actions.append(saveButton,copy,remove);article.append(actions,copyHint,fallback);list.append(article);
   }
  }
  const resume=document.querySelector('[data-notebook-resume]');if(resume){resume.replaceChildren();if(!data.reading.length)resume.append(node('p','Aún no hay puntos de lectura. Se guardan al recorrer una guía o un caso con JavaScript activo.'));for(const item of [...data.reading].reverse()){const p=node('p');p.append(link(item));resume.append(p);}}
  recoveryPanel();renderOrphans();renderProgress();
  if(focusAttribute){
   const replacement=[...document.querySelectorAll('['+focusAttribute+']')].find(el=>el.getAttribute(focusAttribute)===focusedURL);
   if(replacement){replacement.focus({preventScroll:true});if(selection)replacement.setSelectionRange(...selection);}
   else {const next=[...document.querySelectorAll('[data-notebook-restore]')].find(el=>el.dataset.notebookRestore===focusedURL)||document.querySelector('[data-notebook-list] a')||document.querySelector('[data-notebook-export]');next?.focus({preventScroll:true});}
  }
 };
 document.querySelectorAll('[data-bookmark]').forEach(button=>button.addEventListener('click',async()=>{
  const url=cleanURL(button.dataset.bookmark);if(!url)return;const found=data.items.find(item=>item.url===url);
  const ok=await mutate(base=>{const current=base.items.find(item=>item.url===url);
   if(found){if(current&&JSON.stringify(current)!==JSON.stringify(found))throw Error('El favorito cambió en otra pestaña. Revísalo en Mi cuaderno antes de retirarlo.');base.items=base.items.filter(item=>item.url!==url);}
   else if(!current){if(base.items.length>=200)throw Error('El cuaderno admite 200 favoritos. Exporta una copia y retira algunos para añadir más.');base.items.push({url,title:(button.dataset.bookmarkTitle||url).slice(0,160),note:'',updated:now()});}return base;
  },found?'Favorito retirado de este navegador.':'Favorito guardado en este navegador.');if(ok)render();
 }));
 document.querySelectorAll('[data-notebook-export]').forEach(button=>button.addEventListener('click',()=>{
  if(recovery&&button.dataset.notebookExport==='json'){download(recovery.raw,'iphobiuss-cuaderno-original.json');status('Se descargó el original sin modificar. Revisa su recuperación antes de importarlo; el almacenamiento sigue intacto.');return;}
  const links=button.dataset.notebookExport==='links';
  const text=links?['Cuaderno local de iphobiuss','Favoritos:',...data.items.map(item=>item.title+'\nhttps://iphobiuss.github.io/'+item.url),'Puntos de lectura:',...data.reading.map(item=>item.title+'\nhttps://iphobiuss.github.io/'+item.url)].join('\n\n'):JSON.stringify(data,null,2);
  download(text,links?'iphobiuss-cuaderno-enlaces.txt':'iphobiuss-cuaderno.json',links?'text/plain;charset=utf-8':'application/json;charset=utf-8');status(links?'Enlaces exportados. El archivo TXT no contiene tus notas.':'Cuaderno exportado; el JSON incluye solo tus notas guardadas, que pueden ser personales.');
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
 apply?.addEventListener('click',async()=>{
  if(!staged)return;const imported=staged,generation=importGeneration;apply.disabled=true;captureDrafts();
  try{
   await locked(()=>{
    // Cancelled/replaced reviews must never commit after waiting for another tab.
    if(generation!==importGeneration)return;
    const {result,added,conflicts}=merge(imported,latest());validateImport(result);
    if(persistent)localStorage.setItem(KEY,JSON.stringify(result));
    data=result;render();closeImport();status('Se añadieron '+added+' entradas; '+conflicts+' coincidencias conservaron su contenido.'+(!persistent?' '+persistenceMessage:''));
   });
  }catch(error){if(generation!==importGeneration)return;recoveryPanel();preview.textContent='No se pudo añadir el respaldo. Se conserva el cuaderno y los borradores. '+(error.name==='QuotaExceededError'?'El almacenamiento está lleno; exporta una copia y libera espacio.':error.message);apply.disabled=false;}
 });
 const clear=document.querySelector('[data-notebook-clear]'),confirm=document.querySelector('[data-notebook-clear-confirm]');let clearGeneration=0;
 const closeClear=()=>{clearGeneration++;confirm.hidden=true;clear.setAttribute('aria-expanded','false');clear.focus();};
 clear?.addEventListener('click',()=>{clearGeneration++;confirm.hidden=false;clear.setAttribute('aria-expanded','true');document.querySelector('[data-notebook-clear-cancel]')?.focus();});
 document.querySelector('[data-notebook-clear-cancel]')?.addEventListener('click',closeClear);
 document.querySelector('[data-notebook-clear-yes]')?.addEventListener('click',async()=>{const generation=clearGeneration;await locked(()=>{if(generation!==clearGeneration)return;copyGeneration++;data=blank();drafts.clear();orphans.clear();document.querySelectorAll('textarea[data-notebook-note]').forEach(input=>input.dataset.savedNote=input.value);let removed=true;try{localStorage.removeItem(KEY);/* También las marcas de pasos leídos de las guías. */for(const name of Object.keys(localStorage))if(name.startsWith('iphobiuss:seen:'))localStorage.removeItem(name);persistent=Boolean(navigator.locks?.request);recovery=null;}catch{removed=false;persistent=false;}closeClear();render();status(removed?'Cuaderno eliminado de este navegador. Los archivos exportados permanecen en tu equipo.':'Se vació el cuaderno de esta página; no pudo confirmarse el borrado del almacenamiento del navegador.');});});
 confirm?.addEventListener('keydown',event=>{if(event.key==='Escape'&&!confirm.hidden){event.stopPropagation();closeClear();}});
 const progress=document.querySelector('[data-reader-progress]');
 if(progress){
  const title=(document.querySelector('h1')?.getAttribute('aria-label')||document.querySelector('h1')?.textContent||page).slice(0,130);
  const headings=[...document.querySelectorAll('.article-content h2[id],.article-content section[id],.guide-body section[id]')].filter(el=>el.id&&!el.closest('[hidden]'));let timer=0,last='';
  const update=async()=>{
   const available=headings.filter(el=>el.getClientRects().length>0);if(!available.length)return;
   let current=available[0];for(const el of available){if(el.getBoundingClientRect().top<=innerHeight*.45)current=el;else break;}
   const url=page+'.html#'+current.id;if(url===last)return;
   const label=(current.querySelector('h2')?.textContent||current.textContent).trim().slice(0,100);
   const ok=await mutate(base=>{base.reading=base.reading.filter(item=>item.url.split('#')[0]!==page+'.html');base.reading.push({url,title:(title+' · '+label).slice(0,160),note:'',updated:now()});base.reading=base.reading.slice(-40);return base;});
   if(ok){last=url;progress.textContent=persistent?'Punto de lectura guardado':'Punto de lectura disponible solo durante esta página';progress.title=label;}
  };
  window.addEventListener('scroll',()=>{if(!timer)timer=setTimeout(()=>{timer=0;update();},650);},{passive:true});
 }
 window.addEventListener('storage',event=>{
  if(event.key!==KEY&&event.key!==null)return;
  let raw;try{
   if(event.storageArea!==localStorage)return;
   // Read the latest value: queued events can describe an older state than our own write.
   raw=localStorage.getItem(KEY);const next=raw===null?blank():parse(raw);
   if(!persistent){status('El almacenamiento cambió en otra pestaña. Esta página conserva su cuaderno temporal; exporta una copia antes de recargar.');return;}
   data=next;render();status('Cuaderno actualizado desde otra pestaña.'+(drafts.size||orphans.size?' Las notas sin guardar permanecen disponibles en esta pestaña.':''));
  }catch{preserveRaw(raw);render();status('No se pudo leer la actualización de otra pestaña. Se conservan los datos de esta página sin sobrescribir el almacenamiento; exporta una copia antes de salir.');}
 });
 render();document.documentElement.classList.add('notebook-ready');status(persistent?'Favoritos y lectura guardados solo en este navegador.':(recovery?rawMessage:'')+persistenceMessage,false);
})();
