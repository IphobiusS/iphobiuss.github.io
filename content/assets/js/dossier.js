/* Page-only interactions. Content and explanations remain available without JS. */
(() => {
 'use strict';
 const root=document.documentElement;
 const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||root.hasAttribute('data-paused');
 document.querySelectorAll('.dossier-decision').forEach(details=>details.addEventListener('toggle',()=>{
  const body=details.querySelector('.dossier-body');if(!body)return;body.classList.remove('dossier-reveal');if(details.open&&!reduced()){requestAnimationFrame(()=>body.classList.add('dossier-reveal'));}
 }));
 const form=document.querySelector('[data-risk-form]'),feedback=document.querySelector('[data-risk-feedback]');
 if(form&&feedback){
  form.addEventListener('submit',event=>{
   event.preventDefault();const values=['F02','F07','F10'].map(id=>form.elements.namedItem(id).value);
   if(new Set(values).size!==3){feedback.textContent='Usa una posición diferente para cada condición. Los tres siguen siendo P0 en el informe.';const duplicate=values.find(value=>values.filter(v=>v===value).length>1);form.elements.namedItem(['F02','F07','F10'][values.indexOf(duplicate)])?.focus();return;}
   const expected=values.join(',')==='1,2,3';feedback.textContent=expected?'Tu orden coincide con los supuestos de este ejercicio: contener pagos sin independencia, retirar capacidad de despliegue y proteger auditoría. Los tres son P0; consulta debajo qué cambia si varía el contexto.':'Tu orden difiere del ejemplo didáctico. Con pagos activos, despliegues suspendibles y una copia externa de auditoría, el ejemplo prioriza F02 → F07 → F10. Los tres siguen siendo P0. Tu orden puede tener sentido con otros supuestos: consulta la explicación y documenta esos supuestos.';
  });
 }
 root.classList.add('dossier-ready');
})();
