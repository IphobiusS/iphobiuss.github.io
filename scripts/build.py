#!/usr/bin/env python3
"""Build the static website. Requires Python 3, lxml and Pillow. No server at runtime."""
from pathlib import Path
from html import escape
from lxml import html, etree
from PIL import Image
from copy import deepcopy
import site_evolution as evolution
import site_evolution_142 as evolution_142
import site_intro
import ai_boundary_case
from site_assets import prepare_assets
import re, json, hashlib, base64, unicodedata, math, datetime

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist'
DATA=json.loads((ROOT/'content/site-data.json').read_text(encoding='utf-8'))
REPORT=json.loads((ROOT/'content/report-gen.json').read_text(encoding='utf-8'))
PROMETHEUS=json.loads((ROOT/'content/prometheus.json').read_text(encoding='utf-8'))
BANK=json.loads((ROOT/'content/banco-lumbre.json').read_text(encoding='utf-8'))
CERTIFICATIONS=html.parse(str(ROOT/'content/certifications.html'))
BASE='https://iphobiuss.github.io/'
# Las rutas utilitarias se pueden rastrear para leer el noindex, pero no son páginas de contenido.
NOINDEX_PAGES=frozenset({'404.html','buscar.html','cuaderno.html'})
DATE='2026-10-05'
PAGE_EDITIONS={'cap-caso.html':'2026-10-09','forest-caso.html':'2026-10-09','index.html':'2026-10-10','proyectos.html':'2026-10-09','forest.html':'2026-10-08','sauna.html':'2026-10-08','cascade.html':'2026-10-08','tecnicas.html':'2026-10-08'}
EDITION='5 oct 2026'
NAME='Sebastián Latorre Muñoz'
LINKEDIN='https://www.linkedin.com/in/sebastian-latorre-munoz/'
SEARCH=[]
PAGES=[]
PAGE_DATES={}
SUBJECTS={'web':'Web','linux':'Linux','windows':'Windows','ad':'Active Directory','ai':'IA / LLM'}
AREA_INFO={'ad':('Active Directory','Identidad y permisos','active-directory/'),'web':('Seguridad web','Aplicaciones y APIs','web/'),'windows':('Windows','Servicios, privilegios y credenciales','windows/'),'ai':('IA / LLM','Modelos y aplicaciones','ia-llm/'),'linux':('Linux','Escalada de privilegios y SSH','linux/')}
GITHUB='https://github.com/IphobiusS/report-gen'
SERIES=['setup','cap','knife','forest','vaccine','sauna','cascade']
GUIDES={
 'setup':{'title':'Fundamentos & setup','level':'Guía 00','os':'Entorno','topic':'VPN, metodología y herramientas','brief':'Prepara Kali, conecta la VPN y aprende a interpretar lo que devuelve cada herramienta.'},
 'cap':{'title':'Cap','level':'Easy','os':'Linux','topic':'IDOR · PCAP · Capabilities','brief':'De un control de acceso incorrecto a credenciales FTP y una capability de Python.'},
 'knife':{'title':'Knife','level':'Easy','os':'Linux','topic':'Fingerprinting · RCE · Sudo','brief':'Una cabecera revela una versión comprometida de PHP. El siguiente paso es entender por qué.'},
 'forest':{'title':'Forest','level':'Easy','os':'Windows / AD','topic':'AS-REP · ACLs · DCSync','brief':'Primer recorrido por Active Directory: usuarios, Kerberos, relaciones de permisos y replicación.'},
 'vaccine':{'title':'Vaccine','level':'Starting Point · Tier 2','os':'Linux','topic':'Cracking · SQLi · Sudo','brief':'Un backup expuesto conecta FTP, hashes, una aplicación web y PostgreSQL.'},
 'sauna':{'title':'Sauna','level':'Easy','os':'Windows / AD','topic':'Usuarios web · Autologon · DCSync','brief':'Usa la información pública de la web y sigue el rastro de las credenciales en Windows.'},
 'cascade':{'title':'Cascade','level':'Medium','os':'Windows / AD','topic':'LDAP · Reversing · Recycle Bin','brief':'Una cadena de ocho eslabones que combina directorio, cifrado y objetos eliminados.'},
}
HINTS={
 'vpn':'Verifica primero la conexión a Internet y después la interfaz y la ruta de la VPN. Lee el mensaje de error antes de cambiar la configuración.',
 'recon':'Identifica los puertos abiertos, sus servicios y versiones. Anota una hipótesis de entrada por cada servicio.',
 'idor':'Observa cómo cambia la URL al abrir una captura. ¿El servidor comprueba que ese recurso te pertenece?',
 'pcap':'Piensa qué protocolos transportan credenciales sin cifrado y qué filtros permiten encontrar esas conversaciones.',
 'access':'Revisa qué información has obtenido y en qué otros servicios puedes validarla.',
 'privesc':'Compara los permisos habituales del sistema con los que tiene esta cuenta. Investiga los binarios que destacan.',
 'fingerprint':'Las cabeceras de la respuesta pueden revelar información que no aparece en la página.',
 'enum':'Comprueba qué información permite consultar el servicio sin credenciales, empezando por los nombres de usuario.',
 'asrep':'Investiga si todas las cuentas exigen preautenticación y qué respuesta entrega el servicio cuando no la requieren.',
 'foothold':'Valida las credenciales conseguidas en un servicio de acceso remoto disponible.',
 'bloodhound':'Sigue las relaciones que salen de la cuenta actual. Distingue pertenencia a grupos y permisos sobre objetos.',
 'dcsync':'Los permisos sobre la replicación del directorio pueden ser relevantes aunque la cuenta no sea administradora.',
 'users':'Los nombres de personas publicados en una web pueden ayudarte a proponer nombres de cuenta.',
 'autologon':'Busca dónde guarda Windows la configuración del inicio de sesión automático.',
 'ldap':'No te limites a los atributos habituales del directorio. Revisa también los atributos personalizados.',
 'ftp':'Revisa si puedes acceder sin una cuenta personal y qué archivos de respaldo quedan expuestos.',
 'source':'Lee cómo comprueba las credenciales el código. Identifica la representación usada para guardarlas.',
 'sqli':'Comprueba si el valor del parámetro modifica el comportamiento de una consulta. Conserva también la sesión autenticada.',
 'vnc':'Identifica cómo guarda sus credenciales ese programa antes de intentar recuperar el valor original.',
 'audit':'Relaciona los datos guardados en la base de datos con el código que los consume.',
 'recyclebin':'Los objetos eliminados de un directorio pueden conservar atributos. Revisa los permisos y el alcance de la papelera.',
 'data':'Enumera los recursos compartidos a los que permite entrar la cuenta actual. Busca respaldos y archivos de configuración.',
 'rce':'Relaciona la versión exacta con la documentación de la vulnerabilidad y lee el código antes de usarlo.',
 'tty':'Distingue una shell que ejecuta órdenes de una terminal interactiva. Comprueba qué necesita el programa que estás intentando usar.'}
# G06: pistas específicas por (guía, sección) cuando la pista genérica de la sección no corresponde al método de
# esa máquina. Se consultan antes que HINTS[sid]; si no hay entrada, cae al genérico.
HINTS_BY_GUIDE={
 ('knife','access'):'El exploit no te deja dentro por sí solo: necesita un receptor esperando la conexión de vuelta. Prepara la escucha antes de disparar y usa el mismo puerto en ambos extremos.',
 ('vaccine','foothold'):'Ya tienes ejecución por la inyección, pero esa shell es incómoda. Úsala solo para dar el salto a una shell propia: deja un receptor a la escucha y haz que la víctima te llame de vuelta.',
 ('forest','privesc'):'No busques binarios locales: aquí el camino son los permisos sobre objetos del dominio. Mira qué puede hacer tu cuenta (o un grupo al que perteneces) sobre el dominio y qué derecho permite pedirle al controlador todos los hashes.',
 ('knife','privesc'):'Empieza por sudo -l: hay un binario que puedes ejecutar como root sin contraseña. Búscalo en GTFOBins para ver cómo abrir una shell desde él.',
}

def slug(s):
 s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()
 return re.sub(r'[^a-z0-9]+','-',s).strip('-')
def serialize(el):
 # lxml conserva el modelo HTML4 de <source>; en HTML5 es void y el <img> de respaldo es su hermano.
 sources=list(el.iter('source'))
 if sources and any(len(source) for source in sources):
  el=deepcopy(el)
  for source in el.iter('source'):
   for child in reversed(list(source)):source.addnext(child)
 markup=html.tostring(el,encoding='unicode',method='html')
 if '</source' not in markup.lower():return markup
 # Conservar intacto el texto crudo de scripts/estilos; los ejemplos de código ya salen escapados.
 chunks=re.split(r'(<script\b[^>]*>.*?</script\s*>|<style\b[^>]*>.*?</style\s*>)',markup,flags=re.I|re.S)
 return ''.join(chunk if i%2 else re.sub(r'</source\s*>','',chunk,flags=re.I) for i,chunk in enumerate(chunks))

def inner(el):return (escape(el.text) if el.text else '')+''.join(serialize(c) for c in el)
def fragment(s):return html.fragment_fromstring(s,create_parent='div')
def plain(s):
 try:return re.sub(r'\s+',' ',fragment(s).text_content()).strip()
 except (etree.ParserError,ValueError):return re.sub(r'\s+',' ',s).strip()
def E(s):return escape(str(s),quote=True)
def record(title,url,kind,text,category=''):
 SEARCH.append({'title':plain(title),'url':url,'kind':kind,'text':plain(text),'category':category})

def code_kind(text,context=''):
 lines=[l.strip() for l in text.splitlines() if l.strip() and not l.lstrip().startswith('#')]
 first=lines[0] if lines else ''
 if re.match(r'^(PORT\s+STATE|Initialization Sequence|Administrator:\d|/usr/.*=|uid=|\d+/tcp|\$krb5|[a-f0-9]{32,}\b|User:|Server:|DefaultDomainName|DefaultUserName|DefaultPassword|HKEY_|Windows Registry|root:|dn:|cn:|sAMAccountName:|[+-]{4})',first):return 'Salida de ejemplo','output'
 if 'prompt' in context.lower() or 'llm' in context.lower() or 'AI /' in context:return 'Entrada de prueba','example'
 if re.match(r'^(sudo |nmap |cd |mkdir |python|impacket|netexec |nxc |curl |wget |ssh |ftp|john |hashcat |zip2john |unzip |cat |ls\b|find |getcap |export |ip |ping |nc |rlwrap |evil-winrm |reg |Get-|Set-|Add-|Import-|Invoke-|powershell |bloodhound|ldapsearch |smbclient |smbmap |rpcclient |sqlmap |vi |chmod |git |pip|apt |echo |stty |script |whoami|type |dir\b|cmd\b|printf |sed |grep |\./|[A-Za-z_][\w.-]*\.py\b)',first):return 'Comandos / terminal','command'
 return 'Ejemplo de la guía','example'

def decorate_code(root,context=''):
 for pre in list(root.xpath('.//pre')):
  if pre.getparent().tag=='figure':continue
  text=pre.text_content();label,kind=code_kind(text,context)
  if not pre.xpath('./code'):
   co=html.Element('code');co.text=pre.text;pre.text=None
   for child in list(pre):pre.remove(child);co.append(child)
   pre.append(co)
  pre.set('tabindex','0');pre.set('role','group');pre.set('aria-label',label+'; desplazamiento horizontal disponible')
  figure=html.Element('figure',{'class':'code-block','data-code-kind':kind})
  cap=html.Element('figcaption');lab=html.Element('span');lab.text=label;cap.append(lab)
  if kind!='output':
   button=html.Element('button',{'type':'button','class':'copy-button js-only','data-copy':'','aria-label':'Copiar '+label.lower()});button.text='Copiar';cap.append(button)
  # A <pre> tail belongs after the code figure, not inside its frame.
  figure.tail=pre.tail;pre.tail=None
  figure.append(cap);pre.addprevious(figure);pre.getparent().remove(pre);figure.append(pre)
 return root

def nav(active):
 items=[('index','Inicio'),('guias','Guías'),('tecnicas','Técnicas'),('herramientas','Herramientas'),('proyectos','Proyectos')]
 links=''.join(f'<a href="{p}.html"'+(' aria-current="page"' if active==p else '')+f'>{name}</a>' for p,name in items)
 nav_block=f'<nav class="site-nav" id="site-nav" aria-label="Navegación principal">{links}</nav>'
 menu='<a href="#site-nav" class="icon-button menu-toggle" aria-label="Abrir navegación">Menú</a>'
 return f'''<a class="skip" href="#contenido">Saltar al contenido</a>
 <header class="site-header{" site-header-lab" if active=="index" else ""}"><div class="header-inner"><a class="brand" href="index.html">iphobiuss</a>
 {nav_block}
 <div class="header-tools"><a class="icon-button header-search" href="buscar.html" aria-label="Buscar en el sitio" aria-keyshortcuts="Control+K Meta+K /" title="Buscar (/, Ctrl+K o Command+K)"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 16l5 5"/><circle cx="10" cy="10" r="7"/></svg><span>Buscar</span></a>{appearance_controls()}{menu}</div></div><div class="reading-progress" aria-hidden="true"></div></header>'''

# Conmutadores de cabecera. Cada botón lleva un icono de línea (visible en movil,
# donde no cabe el texto) y el texto palabra+estado (visible en escritorio). En movil
# el texto no se oculta con display:none sino de forma accesible (clip), de modo que
# sigue siendo el nombre del control aunque solo se vea el icono, y no aparece desajuste
# nombre/contenido (WCAG 2.5.3): el nombre siempre contiene el texto visible.
_TGL_ICO={
 'anim':'<path data-motion-indicator d="M22 12h-4l-3 9-6-18-3 9H2"/>',
 'paper':'<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
 'retro':'<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
}
def _tgl_ico(k):return f'<svg class="tgl-ico" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{_TGL_ICO[k]}</svg>'

def anim_button():
 return f'<button type="button" class="icon-button anim-toggle js-only" data-motion-toggle data-compact aria-label="Fondo animado" aria-pressed="true" title="Pausar o reanudar el fondo animado">{_tgl_ico("anim")}<span class="tgl-text" aria-hidden="true">Fondo animado</span></button>'

def paper_button():
 return f'<button type="button" class="icon-button paper-toggle js-only" data-paper-toggle aria-label="Papel: tema claro" aria-pressed="false" title="Tema claro para leer: fondo papel, misma tipografía">{_tgl_ico("paper")}<span class="tgl-text" aria-hidden="true"><span class="ptoggle-word">Papel </span><span class="paper-state" data-paper-state>OFF</span></span></button>'

def retro_button():
 return f'<button type="button" class="icon-button retro-toggle js-only" data-retro-toggle aria-label="Retro: apariencia CRT" aria-pressed="false" title="Retro: paleta verde y bordes pixelados. Líneas CRT solo en portada; se ocultan al pausar o reducir movimiento">{_tgl_ico("retro")}<span class="tgl-text" aria-hidden="true"><span class="rtoggle-word">Retro </span><span class="retro-state" data-retro-state>OFF</span></span></button>'

def appearance_controls():
 return ('<details class="appearance-controls js-only" data-appearance><summary class="icon-button">Apariencia</summary>'
  '<div class="appearance-panel" role="group" aria-label="Apariencia y movimiento">'
  '<p>Elige tu lectura y el movimiento del fondo.</p>'
  +paper_button()+retro_button()+anim_button()+'</div></details>')

def cv_link(button=False):
 if not (OUT/'downloads/cv-sebastian-latorre.pdf').is_file():return ''
 return '<a href="downloads/cv-sebastian-latorre.pdf" download'+(' class="button"' if button else '')+'>CV (PDF)</a>'

def contact_links():
 return (f'<a class="button primary" href="{LINKEDIN}" target="_blank" rel="noopener">Contactar en LinkedIn<span class="sr-only"> (abre otra pestaña)</span></a>'
  '<a class="button" href="https://github.com/IphobiusS" target="_blank" rel="noopener">Ver GitHub<span class="sr-only"> (abre otra pestaña)</span></a>'+cv_link(button=True))

def professional_contact():
 return ('<section class="shell home-contact" id="contacto" aria-labelledby="contact-title">'
  '<div><p class="section-eyebrow">Contacto</p><h2 id="contact-title">Hablemos de seguridad.</h2>'
  '<p>Busco una oportunidad como Pentester Junior en Santiago. Puedes revisar mis proyectos y casos, y contactarme para conversar sobre mi trabajo.</p></div>'
  f'<div class="actions">{contact_links()}</div></section>')

def footer():return f'''<footer class="footer"><div class="shell"><div class="footer-top"><div><a class="brand" href="index.html">iphobiuss</a><p>{NAME}, Santiago, Chile</p></div><div class="footer-links"><a href="fundamentos.html">Fundamentos</a><a href="cuaderno.html">Mi cuaderno</a><a href="recorrido.html">Recorrido breve</a><a href="fundamentos.html#glosario">Glosario</a><a href="https://github.com/iphobiuss" rel="noopener" target="_blank">GitHub</a><a href="{LINKEDIN}" rel="noopener" target="_blank">LinkedIn</a><a href="index.html#contacto">Contacto</a>{cv_link()}</div></div><div class="footer-note">Material educativo para laboratorios y evaluaciones autorizadas. La base de técnicas utiliza ejemplos genéricos; los writeups documentan laboratorios de práctica de HTB. No son informes ni soluciones de exámenes de certificación.</div></div></footer><p id="action-status" class="sr-only" role="status" aria-live="polite"></p>'''

def search_form(where='home',value=''):
 return f'''<form class="search-form" role="search" action="buscar.html" method="get"><label><span class="sr-only">Buscar técnicas, herramientas y guías</span><input class="search-input" type="search" name="q" id="search-input-{where}" placeholder="DCSync, SQL injection, Cap…" autocomplete="off" spellcheck="false" value="{E(value)}"></label><button class="button primary" type="submit">Buscar</button></form>'''

def social_image(path,title):
 """Describe an existing local raster asset; never invent a creator portrait."""
 if not path or not (OUT/path).is_file():return None
 with Image.open(OUT/path) as image:
  width,height=image.size;mime=Image.MIME[image.format]
 return {'@type':'ImageObject','url':BASE+path,'contentUrl':BASE+path,'width':width,'height':height,'encodingFormat':mime,'caption':title}

def document(filename,title,description,body,active='',article=False,social=None,date_modified=None):
 modified=date_modified or PAGE_EDITIONS.get(filename,DATE)
 robots_meta='<meta name="robots" content="noindex,follow">' if filename in NOINDEX_PAGES else ''
 url=BASE+(filename if filename!='index.html' else '')
 if not social or not (OUT/social).is_file():social='og-image.png' if (OUT/'og-image.png').is_file() else None
 social_alt=f'report-gen {REPORT["version"]}: editor local de informes de pentesting. PDF, Word, Markdown y HTML portátil.' if social and 'report-gen-og' in social else title
 image=social_image(social,social_alt)
 author={'@type':'Person','@id':BASE+'#persona','name':NAME,'url':BASE}
 schema={'@context':'https://schema.org','@type':'Article' if article else 'WebPage','@id':url+('#articulo' if article else '#pagina'),'name':title,'description':description,'url':url,'inLanguage':'es','author':author,'isPartOf':{'@id':BASE+'#sitio'}}
 if article:schema.update({'headline':title,'dateModified':modified})
 if filename=='index.html':
  person={**author,'alternateName':'iphobiuss','jobTitle':'Pentester Junior','sameAs':['https://github.com/iphobiuss',LINKEDIN],'knowsAbout':['Penetration Testing','Web Security','Active Directory','AI/LLM Security'],'mainEntityOfPage':{'@id':BASE+'#perfil'}}
  schema.update({'@type':'ProfilePage','@id':BASE+'#perfil','mainEntity':person,'dateModified':modified,'isPartOf':{'@type':'WebSite','@id':BASE+'#sitio','name':'iphobiuss','url':BASE,'inLanguage':'es','publisher':{'@id':BASE+'#persona'}}})
 if image:schema['image']=image
 structured=json.dumps(schema,ensure_ascii=False).replace('<','\\u003c')
 sh=base64.b64encode(hashlib.sha256(structured.encode()).digest()).decode()
 # V12-04: marca la clase js ANTES del primer pintado, para que la cabecera móvil (botón de menú en vez de la
 # navegación completa de respaldo sin JS) no cambie de geometría al cargar los scripts diferidos. Sin JavaScript
 # este script no corre y la navegación completa de respaldo sigue visible.
 # VT: fija data-paused desde localStorage antes del primer pintado, para que la transición de documento (y las
 # animaciones reveal) respeten la pausa ya en pagereveal, sin esperar a motion.js (evita que el fundido se anime
 # de forma intermitente al navegar con el movimiento en pausa).
 js_class_script='(()=>{const h=document.documentElement;h.classList.add("js");try{if(localStorage.getItem("iphobiuss:motion")==="paused")h.setAttribute("data-paused","");const r=localStorage.getItem("iphobiuss:retro")==="on",p=localStorage.getItem("iphobiuss:theme")==="paper"&&!r;if(r)h.setAttribute("data-retro","on");if(p)h.setAttribute("data-theme","paper");const m=document.querySelector("meta[name=theme-color]");if(m)m.content=p?"#f4f1e8":r?"#091109":"#0a0d0b"}catch(e){}})();'
 if filename=='buscar.html':
  # Reserve only URL-query hydration; a normal empty search has no artificial gap.
  # Recover the native catalog even when site.js, the index or search-core fails.
  js_class_script+='(()=>{const h=document.documentElement;if((new URLSearchParams(location.search).get("q")||"").trim())h.classList.add("search-pending-query");addEventListener("load",()=>{if(!h.classList.contains("search-ready"))h.classList.add("search-unavailable")},{once:true})})();'
 jh=base64.b64encode(hashlib.sha256(js_class_script.encode()).digest()).decode()
 social_meta=''
 if image:
  dims=f'<meta property="og:image:width" content="{image["width"]}"><meta property="og:image:height" content="{image["height"]}"><meta property="og:image:type" content="{image["encodingFormat"]}">'
  social_meta=f'<meta property="og:image" content="{BASE+social}"><meta property="og:image:alt" content="{E(social_alt)}"><meta name="twitter:image" content="{BASE+social}">'+dims
 extra_css,extra_scripts=evolution.resources(filename)
 scripts='<script src="assets/js/site.js" defer></script><script src="assets/js/motion.js" defer></script>'+extra_scripts
 if filename=='buscar.html':scripts='<script src="assets/js/search-index.js" defer></script><script src="assets/js/search-core.js" defer></script>'+scripts
 page=f'''<!doctype html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-{sh}' 'sha256-{jh}'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'"><meta name="theme-color" content="#0a0d0b"><script>{js_class_script}</script><meta name="color-scheme" content="dark light"><meta name="referrer" content="strict-origin-when-cross-origin"><meta name="author" content="{E(NAME)}">
<title>{E(title)} // iphobiuss</title><meta name="description" content="{E(description)}">{robots_meta}<link rel="canonical" href="{url}"><meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(description)}"><meta property="og:type" content="{'article' if article else 'website'}"><meta property="og:url" content="{url}"><meta name="twitter:card" content="{'summary_large_image' if social else 'summary'}"><meta name="twitter:title" content="{E(title)}"><meta name="twitter:description" content="{E(description)}">{social_meta}<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml"><link rel="alternate" type="application/rss+xml" title="Guías de laboratorio de iphobiuss" href="feed.xml"><link rel="preload" href="assets/fonts/1a9cad03d35e.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="assets/fonts/b0c618f6d8ea.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="assets/fonts/feead6344d56.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="assets/css/fonts.css"><link rel="stylesheet" href="assets/css/site.css"><link rel="stylesheet" href="assets/css/identity.css">{extra_css}<script type="application/ld+json">{structured}</script>{scripts}</head>
<body data-page="{filename[:-5]}">{icon_sprite()}<canvas class="net" data-net aria-hidden="true"></canvas>{nav(active)}<main class="site-main" id="contenido" tabindex="-1">{body}</main>{footer()}</body></html>'''
 tree=html.fromstring(page)
 # Match each heading to the actual content container, including non-article routes.
 heads=tree.xpath('//main/div[contains(concat(" ",normalize-space(@class)," ")," page-head ")]/div[contains(concat(" ",normalize-space(@class)," ")," shell ")]')
 if heads:
  if article:heads[0].set('class','shell article-heading')
  elif tree.xpath('//main/div[contains(concat(" ",normalize-space(@class)," ")," narrow ")]'):heads[0].set('class','shell narrow')
  elif filename=='proyectos.html':heads[0].set('class','shell project-heading')
 if filename in evolution.NOTEBOOK_ROUTES and filename!='cuaderno.html':
  heads=tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," page-head ")]//*[contains(concat(" ",normalize-space(@class)," ")," shell ")]')
  if heads:heads[0].append(fragment(evolution.toolbar(filename,title,article)))
 if filename=='tecnicas.html':
  for detail in tree.xpath('//details[@data-filterable]'):
   area=detail.xpath('./div[contains(concat(" ",normalize-space(@class)," ")," entry-content ")]')
   summary=detail.xpath('./summary/span[last()]')
   if area and summary:area[0].insert(0,fragment(evolution.bookmark(filename+'#'+detail.get('id'),summary[0].text_content())))
 old_routes={'fundamentos':'fundamentos.html','oscp':'tecnicas.html#oscp','cape':'tecnicas.html#cape','cpts':'tecnicas.html#cpts','cwes':'tecnicas.html#cwes','coae':'tecnicas.html#coae','cheatsheet':'herramientas.html#cheatsheet','arsenal':'herramientas.html#arsenal','writeups':'guias.html','glosario':'fundamentos.html#glosario'}
 for link in tree.xpath('//a[starts-with(@href,"index.html#")]'):
  old=link.get('href').split('#',1)[1]
  if old in old_routes:link.set('href',old_routes[old])
 if filename=='404.html':
  # La 404 se sirve en cualquier ruta (también anidada): sus enlaces y recursos deben ser absolutos desde la raíz del sitio.
  for t in tree.xpath('//*[@href or @src or @action]'):
   for attr in ('href','src','action'):
    v=t.get(attr)
    if v and not re.match(r'^(https?:|/|#|mailto:|data:)',v):t.set(attr,'/'+v)
 for t in tree.xpath('//a[@target="_blank"]'):t.set('rel','noopener noreferrer')
 for t in tree.xpath('//table//th'):
  if not t.get('scope'):t.set('scope','col')
 for table_index,t in enumerate(tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," tblwrap ")]'),1):
  headings=t.xpath('preceding::h2 | preceding::h3')
  context=headings[-1].text_content().strip() if headings else title
  columns=t.xpath('.//th')
  column_names=', '.join(x.text_content().strip() for x in columns[:4])
  label='Tabla de '+context+(': '+column_names if column_names else '')
  t.set('tabindex','0');t.set('role','region');t.set('aria-label',label)
  hint=html.Element('p',{'class':'table-scroll-hint','id':f'table-scroll-hint-{table_index}'})
  hint.text='Desplaza la tabla horizontalmente. Con teclado, enfócala y usa las flechas '
  key=html.Element('kbd');key.text='← →';hint.append(key);key.tail='.'
  t.insert(0,hint)
 for card in tree.xpath('//*[contains(concat(" ",normalize-space(@class)," ")," entry-card ")]'):
  heading=card.xpath('.//h2/a | .//h3/a')
  for link in card.xpath('.//a[@class="card-link"]'):
   if heading and link.get('href')==heading[0].get('href'):
    link.tag='span';del link.attrib['href'];link.set('aria-hidden','true')
 for t in tree.xpath('//*[@style]'):
  if t.tag!='svg':del t.attrib['style']
 evolution_142.enhance_document(filename,tree)
 site_intro.enhance_document(filename,tree)
 decorate_code(tree,title)
 result='<!doctype html>\n'+serialize(tree)
 (OUT/filename).parent.mkdir(parents=True,exist_ok=True)
 (OUT/filename).write_text(result,encoding='utf-8')
 PAGES.append(filename)
 PAGE_DATES[filename]=modified

def page_head(title,description,folder=None,path=None):
 crumbs=lab_crumbs(folder,path) if folder else ''
 return f'<div class="page-head"><div class="shell">{crumbs}<h1 data-scramble aria-label="{E(title)}">{E(title)}</h1><p>{description}</p></div></div>'

def ui_text(s):return s.replace(' · ',', ')
def plural(n,one,many):return f'{n} {one if n==1 else many}'
def area_counts():
 counts={k:0 for k in SUBJECTS}
 for sec in DATA['DATA']:
  for t in sec['techs']:counts[subject(sec['id'],t)]+=1
 return counts
LEVELS={'easy':'easy','medium':'medium','hard':'hard','insane':'insane'}
def level_class(text):
 return ' tag-level-'+LEVELS[text.strip().casefold()] if text.strip().casefold() in LEVELS else ''
def guide_tags(g):
 tags=[g['os']]
 if not g['level'].startswith('Guía'):tags.append(ui_text(g['level']))
 return tags

def guide_card(n,heading='h3'):
 g=GUIDES[n];i=SERIES.index(n)
 tags=''.join(f'<span class="tag{level_class(x)}">{E(x)}</span>' for x in guide_tags(g))
 source=html.parse(str(ROOT/f'content/guides/{n}.html'))
 sections=[{'id':sec.get('id'),'label':plain(sec.xpath('.//h2')[0].text_content())} for sec in source.xpath('//section[@id]') if sec.xpath('.//h2')]
 progress=f'<div class="guide-local-progress" data-guide-progress="{n}.html" data-guide-sections="{E(json.dumps(sections,ensure_ascii=False))}" hidden></div>'
 return f'''<article class="entry-card reveal"><p class="card-meta"><span class="step-no">Guía <span class="pixel">{i:02d}</span></span>{tags}</p><{heading}><a href="{n}.html">{E(g['title'])}</a></{heading}><p>{E(g['brief'])}</p>{progress}</article>'''

def guide_group(heading='h3'):
 message='<p class="muted" data-guide-progress-message role="status" aria-live="polite">Los puntos de lectura requieren JavaScript. Las guías siguen disponibles.</p>'
 return '<div data-guide-progress-group>'+message+'<div class="entry-grid guides-grid">'+''.join(guide_card(n,heading) for n in SERIES)+'</div></div>'

def subject(sec,t):
 if sec=='cwes':return 'web'
 if sec=='coae':return 'ai'
 if sec=='cape':return 'ad'
 n=t['n'].lower()
 if re.search(r'kerbero|as-rep|dcsync|gmsa|relay|dpapi|acl|dominio|delegaci|silver|golden|trust',n):return 'ad'
 if re.search(r'sql injection|lfi|ftp an|nfs|liferay|web|cicd|ci/cd|ansible',n):return 'web'
 if re.search(r'linux|ssh',n):return 'linux'
 return 'windows'

def entry(eid,title,content,number='',attrs=''):
 return f'<details class="entry-details" id="{eid}" {attrs}><summary><span class="entry-number">{number}</span><span>{E(title)}</span></summary><div class="entry-content">{content}</div></details>'

def build_catalog():
 options=''.join(f'<option value="{k}">{v}</option>' for k,v in SUBJECTS.items())
 cert_options=''.join(f'<option value="{x["id"]}">{x["code"]}</option>' for x in DATA['DATA'])
 filters=f'''<div class="filter-bar js-only"><label>Área<select id="subject-filter"><option value="">Todas las áreas</option>{options}</select></label><label>Notas de preparación<select id="cert-filter"><option value="">Todas las certificaciones</option>{cert_options}</select></label><button class="button" id="reset-filters" type="button">Limpiar filtros</button></div><p class="result-count" id="filter-count" role="status" aria-live="polite">52 técnicas documentadas</p><div class="empty-filter" id="empty-filter" hidden>No hay técnicas con estos filtros. Prueba otra combinación.</div>'''
 body=page_head('Técnicas','Prerrequisitos, razonamiento, comandos, evidencia y respuesta defensiva. <a href="fundamentos.html">Lee los fundamentos y las convenciones</a>.',folder='tecnicas',path='tecnicas/')+'<div class="shell narrow">'+filters
 for sec in DATA['DATA']:
  body+=f'<section class="catalog-section" id="{sec["id"]}" data-catalog-section><h2>{E(sec["code"])} <span class="tag">{len(sec["techs"])} técnicas</span></h2><p class="section-desc">{E(sec["focus"])}</p>'
  for i,t in enumerate(sec['techs'],1):
   eid=sec['id']+'-'+t.get('slug',slug(t['n']));area=subject(sec['id'],t)
   content=f'<div class="entry-actions"><span class="tag">{SUBJECTS[area]}</span><a class="permalink" href="#{eid}" data-permalink>Enlace a esta técnica</a></div>'
   fields=[('Prerrequisitos','pre'),('Por qué funciona','why'),('Identificación','ident')]
   content+=''.join(f'<div class="field"><span class="field-label">{l}</span><p>{t[k]}</p></div>' for l,k in fields)
   content+=f'<p class="cmdlabel">{t["label"]}</p><pre>{t["cmd"]}</pre>'
   content+=''.join(f'<div class="field"><span class="field-label">{l}</span><p>{t[k]}</p></div>' for l,k in [('Evidencia','evidence'),('Detección','detect'),('Mitigación','mit')])
   if t.get('ref'):content+=f'<p><a href="{E(t["ref"]["url"])}" target="_blank" rel="noopener">{E(t["ref"]["label"])}</a></p>'
   body+=entry(eid,t['n'],content,f'{i:02d}',f'data-filterable data-subject="{area}" data-cert="{sec["id"]}"')
   record(t['n'],'tecnicas.html#'+eid,'Técnica',' '.join(str(t[k]) for k in ['pre','why','ident','cmd','evidence','detect','mit']),sec['code']+', '+SUBJECTS[area])
  body+='</section>'
 body+='</div>'
 document('tecnicas.html','Técnicas de pentesting','52 técnicas de seguridad ofensiva con prerrequisitos, comandos, evidencia, detección y mitigación.',body,'tecnicas')

def build_tools():
 body=page_head('Herramientas','Elige por propósito y consulta los comandos en contexto. <a href="#cheatsheet">Ir al cheatsheet</a>.',folder='herramientas',path='herramientas/')+'<div class="shell narrow"><section id="arsenal">'
 for group in DATA['ARSENAL']:
  body+=f'<section class="catalog-section" id="grupo-{slug(group["h"])}"><h2>{E(group["h"])}</h2>'
  for t in group['t']:
   eid='tool-'+slug(t['name']);content=f'<div class="entry-actions"><span class="tag">Herramienta</span><a class="permalink" data-permalink href="#{eid}">Enlace a esta herramienta</a></div><p>{t["what"]}</p><div class="field"><span class="field-label">Cuándo usarla</span><p>{t["when"]}</p></div><pre>{t["cmd"]}</pre>'
   if t.get('doc'):content+=f'<p><a href="{E(t["doc"])}" target="_blank" rel="noopener">Documentación de {E(t["name"])}</a></p>'
   body+=entry(eid,t['name'],content)
   record(t['name'],'herramientas.html#'+eid,'Herramienta',t['what']+' '+t['when']+' '+t['cmd'],group['h'])
  body+='</section>'
 body+='</section><section class="catalog-section" id="cheatsheet"><h2>Cheatsheet</h2><p class="muted">Comandos por objetivo. Sustituye los placeholders por los valores de tu laboratorio. <a href="CHEATSHEET.md">Referencia Markdown</a>.</p>'
 markdown=['# Cheatsheet · iphobiuss','\nReferencia para laboratorios autorizados. Sustituye los placeholders.\n']
 for c in DATA['CHEAT']:
  eid='cheat-'+slug(c['cat']);body+=entry(eid,c['cat'],f'<div class="entry-actions"><a class="permalink" data-permalink href="#{eid}">Enlace a estos comandos</a></div><pre>{c["cmd"]}</pre>')
  record(c['cat'],'herramientas.html#'+eid,'Cheatsheet',c['cmd'])
  markdown.append('## '+c['cat']+'\n\n```text\n'+fragment(c['cmd']).text_content()+'\n```\n')
 (OUT/'CHEATSHEET.md').write_text('\n'.join(markdown),encoding='utf-8')
 document('herramientas.html','Herramientas y cheatsheet','36 herramientas explicadas por propósito y 12 grupos de comandos para laboratorios de pentesting.',body+'</section></div>','herramientas')

def build_foundations():
 body=page_head('Fundamentos','Cómo usar esta base, interpretar resultados y adaptar sus ejemplos. <a href="#glosario">Ir al glosario</a>.',folder='tecnicas',path='fundamentos')+'<div class="shell narrow"><section id="fundamentos">'
 for f in DATA['FUND']:
  eid='base-'+slug(f['h']);body+=f'<section class="catalog-section" id="{eid}"><h2>{f["h"]}</h2>{f["html"]}</section>'
  record(f['h'],'fundamentos.html#'+eid,'Fundamento',f['html'])
 body+='</section><section class="catalog-section" id="metodologia"><h2>Metodología</h2><p class="muted">El proceso es iterativo: una nueva credencial o superficie puede devolverte a la enumeración.</p><ol>'
 for p in DATA['PHASES']:body+=f'<li>{p["t"]}</li>'
 body+='</ol><p><a href="setup.html">Preparar el entorno paso a paso</a></p></section><section class="catalog-section" id="glosario"><h2>Glosario</h2><div class="gloss">'
 for t,d in DATA['GLOSSARY']:
  eid='term-'+slug(t);body+=f'<article class="term" id="{eid}"><h3 class="t">{E(t)}</h3><div class="d">{E(d)}</div></article>';record(t,'fundamentos.html#'+eid,'Glosario',d)
 document('fundamentos.html','Fundamentos y glosario','Convenciones, metodología, placeholders y glosario de seguridad ofensiva.',body+'</div></section></div>','tecnicas')

def build_guides_index():
 body=page_head('Guías de laboratorio','Una serie para aprender a decidir el siguiente paso: desde la VPN hasta Active Directory.',folder='guias',path='guias/')+'<div class="shell">'
 body+='<div class="notice notice-row"><p><strong>Empieza por la guía 00.</strong> Cada writeup conserva el recorrido completo y ofrece pistas antes de desplegar la solución.</p><a href="setup.html">Preparar el entorno</a></div>'
 body+='<p class="muted">Los puntos de lectura del cuaderno indican una sección visitada, no una guía completada. Se conservan solo en este navegador.</p>'
 body+=guide_group('h2')+'</div>'
 document('guias.html','Guías de Hack The Box','Serie de guías razonadas: setup, Cap, Knife, Forest, Vaccine, Sauna y Cascade.',body,'guias')

def explorer_row(name,desc,meta,href,icon=None,external=False):
 attrs=' class="external" target="_blank" rel="noopener"' if external else ''
 extra='<span class="sr-only"> (abre otra pestaña)</span>' if external else ''
 return f'<li><a href="{E(href)}"{attrs}><span class="name">{pi(icon) if icon else ""}{E(name)}{extra}</span><span class="desc">{E(desc)}</span><span class="file-meta">{E(meta)}</span></a></li>'

PIXEL_ICONS={
 'folder':[(0,0,3,1),(0,1,8,6)],
 'file':[(1,0,5,2),(1,2,6,6)],
 'zip':[(1,0,2,8),(4,0,3,8),(3,1,1,1),(3,3,1,1),(3,5,1,1)],
 'link':[(1,2,1,5),(1,6,6,1),(6,5,1,2),(2,2,2,1),(4,0,4,1),(7,0,1,4),(5,1,1,1),(4,2,1,1),(3,3,1,1)],
 'book':[(0,0,3,7),(4,0,3,7),(3,1,1,6)],
 'term':[(0,0,8,1),(0,1,1,6),(7,1,1,6),(0,7,8,1),(2,3,1,1),(3,4,1,1),(2,5,1,1),(5,5,2,1)],
}
STATUS='Estudiando Ingeniería en Ciberseguridad (UNAB, egreso previsto en 2028). Explorando seguridad web, Active Directory e IA/LLM, y compartiendo lo aprendido en el laboratorio.'
ENGLISH='Junior penetration tester based in Santiago, Chile, focused on web exploitation, Active Directory and AI red teaming. OSCP+ holder with seven more certifications from Hack The Box and INE, all verifiable above. This site collects lab guides, techniques, tooling notes and report-gen, an open-source report editor. I read and write technical documentation and reports in English; spoken English is basic, so a technical interview in English is possible with some preparation.'
SAMPLE_REPORT='downloads/report-gen-informe-ejemplo.pdf'
SAMPLE_REPORT_BANCA='downloads/report-gen-informe-banco-lumbre.pdf'

def icon_sprite():
 symbols=''.join(f'<symbol id="pi-{name}" viewBox="0 0 8 8">'+''.join(f'<rect x="{x}" y="{y}" width="{w}" height="{h}"/>' for x,y,w,h in rects)+'</symbol>' for name,rects in PIXEL_ICONS.items())
 return f'<svg class="pixel-sprite" aria-hidden="true" focusable="false" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden">{symbols}</svg>'

def pi(name):
 return f'<svg class="pi" aria-hidden="true" focusable="false" width="16" height="16" shape-rendering="crispEdges"><use href="#pi-{name}"/></svg>'

def lab_crumbs(folder,path):
 return f'<p class="crumbs"><a class="back-lab" href="index.html#{folder}">{pi("folder")}Volver al laboratorio</a> <span class="crumb-path">~/iphobiuss/{E(path)}</span></p>'

def picture(stem,width,height,alt,cls='',srcset=None,sizes='100vw'):
 webp=f'assets/img/{stem}.webp';png=f'assets/img/{stem}.png'
 source=''
 # Las variantes responsivas se seleccionan por su propia existencia; no dependen de un duplicado sin sufijo.
 if srcset and (OUT/f'assets/img/{srcset}').exists():
  variants=[f'assets/img/{stem}-{w}.webp {w}w' for w in (960,1512,1920) if w<=width and (OUT/f'assets/img/{stem}-{w}.webp').exists()]
  if not (OUT/f'assets/img/{stem}-{width}.webp').exists() and (OUT/webp).exists():variants.append(f'{webp} {width}w')
  if variants:source=f'<source srcset="{", ".join(variants)}" sizes="auto, {E(sizes)}" type="image/webp">'
 elif (OUT/webp).exists():
  source=f'<source srcset="{webp}" type="image/webp">'
 return f'<picture>{source}<img src="{png}" width="{width}" height="{height}" loading="lazy" decoding="async" alt="{E(alt)}"{f" class={chr(34)}{cls}{chr(34)}" if cls else ""}></picture>'
def project_capture(kind):
 provenance=json.loads((ROOT/'content/report-gen-capturas-procedencia.json').read_text(encoding='utf-8'))
 return next(capture for capture in provenance['images'] if capture['stem'].endswith('-'+kind))
def screenshot_sizes(context,kind):
 # Measured at five widths and DPR 1/2/3, including the overrides in identity.css.
 # Lazy images use their rendered content width with auto sizes where supported.
 # The measured fallback preserves the layout's rem gutters and fixed borders.
 if context=='home':
  return '(max-width:480px) calc(100vw - min(1.5rem, 12vw) - min(2rem, 16vw) - 4px), (max-width:640px) calc(100vw - min(1.5rem, 12vw) - min(2.5rem, 16vw) - 4px), (max-width:720px) calc(100vw - 4.5rem - 4px), (max-width:900px) calc(100vw - 7rem - 194px), (max-width:1100px) calc(100vw - 8rem - 209px), calc(min(100vw, 1280px) - 9.5rem - 234px)'
 extra=' - min(3rem, 48px) - min(2rem, 32px) - 5px' if kind=='comprobaciones' else ''
 return (f'(max-width:640px) calc(min(1040px, 100vw - min(2.5rem, 16vw)){extra}), '
  f'(max-width:900px) calc(min(1040px, 100vw - 3rem){extra}), '
  f'calc(min(1040px, min(100vw, 1280px) - 4rem){extra})')
def project_shot(kind,cls='',context='project'):
 capture=project_capture(kind)
 return picture(capture['stem'],capture['width'],capture['height'],capture['alt'],cls,srcset=Path(capture['variants'][-1]['file']).name,sizes=screenshot_sizes(context,kind))
def project_caption(kind):
 capture=project_capture(kind)
 return E(capture['caption'])+f' <a href="{E(capture["original"])}" target="_blank" rel="noopener">Ampliar captura<span class="sr-only"> (abre otra pestaña)</span></a>.'
def shot_main(cls='',context='project'):return project_shot('editor',cls,context)
def shot_hallazgos(cls=''):return project_shot('entrega',cls)
def shot_readme():
 # A compact identity card, not a scaled dashboard. Labels remain real text.
 return ('<div class="report-brand-card"><img src="assets/img/report-gen-brand-mark.webp" width="900" height="600" loading="lazy" decoding="async" alt="Prometeo y Evaristo, mascotas de report-gen">'
  '<strong class="report-brand-name">report-gen</strong><span class="report-brand-formats">PDF · Word · Markdown · HTML</span></div>')

def download_size():
 return f'ZIP, {REPORT["download_bytes"] / (1024 * 1024):.2f} MiB'.replace('.',',') if REPORT.get('download_bytes') else 'ZIP · GitHub'

BANNER_NARROW=(
 "┬┌─┐┬ ┬┌─┐┌┐ ┬┬ ┬┌─┐┌─┐\n"
 "│├─┘├─┤│ │├┴┐││ │└─┐└─┐\n"
 "┴┴  ┴ ┴└─┘└─┘┴└─┘└─┘└─┘")
BANNER=(
 "██╗██████╗ ██╗  ██╗ ██████╗ ██████╗ ██╗██╗   ██╗███████╗███████╗\n"
 "██║██╔══██╗██║  ██║██╔═══██╗██╔══██╗██║██║   ██║██╔════╝██╔════╝\n"
 "██║██████╔╝███████║██║   ██║██████╔╝██║██║   ██║███████╗███████╗\n"
 "██║██╔═══╝ ██╔══██║██║   ██║██╔══██╗██║██║   ██║╚════██║╚════██║\n"
 "██║██║     ██║  ██║╚██████╔╝██████╔╝██║╚██████╔╝███████║███████║\n"
 "╚═╝╚═╝     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝ ╚══════╝╚══════╝")
# Ruta de ataque de la guía 03 (Forest), tal como la documenta la guía: cuenta de servicio, grupos, WriteDacl y DCSync.
FOREST_PATH={'guide':'forest.html#bloodhound','nodes':[
 ('n1','u',60,186,'svc-alfresco','usr','svc-alfresco: cuenta de servicio sin preautenticación Kerberos. Su hash AS-REP se crackea y abre WinRM; pertenece de forma anidada (Service Accounts, Privileged IT Accounts) a Account Operators'),
 ('n2','g',150,78,'Account Operators','grp','Account Operators: el grupo permite crear usuarios y añadirlos a grupos no protegidos'),
 ('n3','g',250,186,'Exchange Windows Perm.','grp','Exchange Windows Permissions: grupo con WriteDacl sobre el dominio'),
 ('n4','d',345,78,'HTB.LOCAL','dom','HTB.LOCAL: con WriteDacl se concede el derecho de replicación (DCSync)'),
 ('n5','da',425,186,'Administrator','DA','Administrator: el hash se extrae con DCSync y se usa con pass-the-hash')],
 'edges':[('e1','M70 176 L140 92','MemberOf*',96,124,'end',''),('e2','M160 92 L240 176','GenericAll',214,118,'start',''),('e3','M260 176 L335 92','WriteDacl',286,152,'end',''),('e4','M355 92 L415 176','DCSync',398,118,'start',' hot')]}

def sample_report_facts():
 """Cifras del informe de ejemplo leídas del YAML de content/ (hallazgos, severidades, evidencias, activos) y del PDF si existe (páginas)."""
 text=(ROOT/'content/report-gen-ejemplo.yaml').read_text(encoding='utf-8')
 def section(name):
  m=re.search(r'^'+name+r':\n(.*?)(?=^[a-z_]+:|\Z)',text,re.S|re.M);return m.group(1) if m else ''
 findings=section('findings');sev=re.findall(r'^\s+severity: *(\w+)',findings,re.M)
 facts={'findings':len(re.findall(r'^- uid:',findings,re.M)),'evidence':len(re.findall(r'^- uid:',section('evidence'),re.M)),'assets':len(re.findall(r'^- uid:',section('assets'),re.M)),'severity':{k:sev.count(k) for k in ('critical','high','medium','low')},'pages':0}
 pdf=OUT/SAMPLE_REPORT
 if pdf.exists():
  try:
   from pypdf import PdfReader
   facts['pages']=len(PdfReader(str(pdf)).pages)
  except Exception:facts['pages']=0
 return facts

def welcome(techs_total,tools_total):
 edition=datetime.date.fromisoformat(PAGE_EDITIONS.get('index.html',DATE)).strftime('%d/%m/%Y')
 # The optional terminal uses real catalog counts and documented example report facts:
 # nmap lista las carpetas reales como puertos, el grafo dibuja la ruta de Forest y report-gen exporta el informe
 # de ejemplo con sus cifras reales. Sin JavaScript todo está en su estado final; motion.js solo anima.
 facts=sample_report_facts();sample=(OUT/SAMPLE_REPORT).exists()
 hero_badges=deepcopy(CERTIFICATIONS.xpath('//div[@class="badges"]')[0])
 hero_badges.set('class','welcome-badges');hero_badges.set('role','group');hero_badges.set('aria-label','Certificaciones verificables')
 for badge in hero_badges.xpath('./a'):
  badge.set('class','badge');badge.set('aria-label',f'Verificar {badge.text_content().strip()} (abre otra pestaña)')
 rows=[('22/tcp','guias','#guias','guias',f'{len(SERIES)} guías: preparación y {len(SERIES)-1} máquinas de Hack The Box'),
  ('80/tcp','tecnicas','#tecnicas','tecnicas',f'{techs_total} técnicas con comandos, evidencia y respuesta defensiva'),
  ('443/tcp','herramientas','#herramientas','herramientas',f'{tools_total} herramientas en contexto, agrupadas por propósito'),
  ('8080/tcp','proyectos','#proyectos','proyectos',f'report-gen {E(REPORT["version"])}, editor local de informes de pentest'),
  ('9999/tcp','readme','#readme','readme',f'{E(NAME)}, Pentester Junior, Santiago')]
 nmap_rows=''.join(f'<a class="tl trow" href="{href}" data-folder-link="{folder}"><b>{port}</b><i>open</i><span>{svc}</span><span>{desc}</span></a>' for port,svc,href,folder,desc in rows)
 banner='<span class="sr-only">iphobiuss lab</span>'+''.join(f'<span class="tl tb tb-wide" aria-hidden="true">{r}</span>' for r in BANNER.split('\n'))+''.join(f'<span class="tl tb tb-narrow" aria-hidden="true">{r}</span>' for r in BANNER_NARROW.split('\n'))
 term=(f'<div class="tty"><span class="tph">┌──(iphobiuss@lab)-[~]\n└─$ </span><span class="tcmd" data-cmd><span class="tcmd-text">lab</span><span class="tcur" aria-hidden="true"></span></span>\n{banner}'
  '<span class="term-guardians"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><ellipse cx="5" cy="8" rx="2.4" ry="3"/><ellipse cx="10" cy="5" rx="2.4" ry="3"/><ellipse cx="16" cy="5" rx="2.4" ry="3"/><ellipse cx="20" cy="9" rx="2.4" ry="3"/><path d="M7 14c1-2 2-4 5-4s4 2 5 4c2 2 3 6 0 7-2 1-3-1-5-1s-3 2-5 1c-3-1-2-5 0-7Z"/></svg><span># guardianes del lab: Prometeo · Evaristo</span></span>'
  f'<span class="tl ttag">iphobiuss lab, edición {E(edition)}: {plural(len(SERIES),"guía","guías")}, {techs_total} técnicas, {tools_total} herramientas, report-gen {E(REPORT["version"])}</span>'
  f'<span class="tl tp2"><span class="tph">┌──(iphobiuss@lab)-[~]\n└─$ </span><span class="tcmd" data-cmd><span class="tcmd-text">nmap -sV --open iphobiuss.lab</span><span class="tcur" aria-hidden="true"></span></span></span>\n'
  f'<span class="tl">Starting Nmap 7.95 ( https://nmap.org ) at {DATE}</span><span class="tl">Nmap scan report for iphobiuss.lab (127.0.0.1)</span><span class="tl">Host is up (0.0004s latency).</span><span class="tl">Not shown: 65530 closed tcp ports</span>'
  f'<span class="tl trow thd"><b>PORT</b><i>STATE</i><span>SERVICE</span><span>VERSION</span></span>{nmap_rows}'
  f'<span class="tl ttail">Nmap done: 1 IP address (1 host up) scanned in 1.87 seconds</span>'
  f'<span class="tl tready tph">┌──(iphobiuss@lab)-[~]\n└─$ <span class="tcur" aria-hidden="true"></span></span></div>')
 nodes=''.join(f'<g class="gn {kind}" id="{nid}" data-tip="{E(tip)}"><circle cx="{x}" cy="{y}" r="16"></circle><text class="gi" x="{x}" y="{y+4}">{E(icon)}</text><text x="{x}" y="{y+36 if y>120 else y-34}">{E(label)}</text></g>' for nid,kind,x,y,label,icon,tip in FOREST_PATH['nodes'])
 edges=''.join(f'<path class="ge{hot}" id="{eid}" pathLength="100" d="{d}"></path>' for eid,d,_,_,_,_,hot in FOREST_PATH['edges'])
 labels=''.join(f'<text class="gl" x="{x}" y="{y}" text-anchor="{anchor}">{E(label)}</text>' for _,_,label,x,y,anchor,_ in FOREST_PATH['edges'])
 # MemberOf* marca una membresía anidada resumida (Service Accounts, Privileged IT Accounts), no directa.
 # Los pasos son texto legible sin motion.js; el script los convierte en botones al instalar sus eventos.
 steps=''.join(f'<li><span class="gstep" data-gstep="{nid}" data-step-label="Paso {i:02d}: {E(label)}. {E(tip)}"><span class="gstep-n">{i:02d}</span> {E(label)}<span class="sr-only">. {E(tip)}</span></span></li>' for i,(nid,kind,x,y,label,icon,tip) in enumerate(FOREST_PATH['nodes']))
 graph=f'<svg class="gph" viewBox="0 0 480 240" aria-hidden="true" focusable="false">{edges}{labels}{nodes}</svg><ul class="gsteps" aria-label="Ruta de Forest, paso a paso">{steps}</ul>'
 sev=facts['severity'];top=max(1,max(sev.values()))
 sevrows=''.join(f'<span>{label}</span><svg class="sb {cls}" viewBox="0 0 100 9" preserveAspectRatio="none" aria-hidden="true"><rect class="sbi" x="0" y="0" width="{round(100*sev[key]/top,1)}" height="9"></rect></svg><span class="num">{sev[key]}</span>' for key,label,cls in (('critical','crítico','c'),('high','alto','h'),('medium','medio','m'),('low','bajo','lo')))
 pages=f'{facts["pages"]} páginas' if facts['pages'] else 'PDF listo'
 report=(f'<div class="rep"><span class="tl"><span class="tph">$</span> report-gen export --format pdf demo-es</span><span class="tl">revisión guardada <span class="ok">ok</span></span><span class="tl">{plural(facts["evidence"],"evidencia","evidencias")} y {plural(facts["assets"],"activo","activos")} <span class="ok">ok</span></span>'
  f'<div class="rbar" aria-hidden="true"><i data-bar></i></div><span class="tl rpct"><span>{SAMPLE_REPORT.split("/")[-1] if sample else "informe.pdf"}</span><span data-pages="{facts["pages"]}">{pages}</span></span>'
  f'<span class="tl">{plural(facts["findings"],"hallazgo","hallazgos")} por severidad</span><p class="sev-head" id="sev-head">Hallazgos por severidad</p><div class="sev" role="group" aria-labelledby="sev-head">{sevrows}</div></div>'
  +(f'<p class="rep-link"><a class="rep-pdf" href="{SAMPLE_REPORT}">Ver informe de ejemplo (PDF, {facts["pages"]} páginas)</a></p>' if sample else f'<p class="rep-link"><a href="#proyectos" data-folder-link="proyectos">Abrir el proyecto</a></p>'))
 hero=f'''<section class="welcome shell" aria-labelledby="welcome-title">
 <div class="welcome-terminal" data-hero-terminal>
 <div class="welcome-titlebar"><span class="terminal-window-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>iphobiuss@lab: ~</span><span class="terminal-window-label">inicio</span></div>
 <div class="welcome-terminal-body"><div class="welcome-id"><div class="welcome-lead"><p class="terminal-prompt" aria-hidden="true"><span>~ $</span> whoami</p><p class="section-eyebrow">Seguridad web · Active Directory · IA / LLM</p><h1 id="welcome-title">{E(NAME)}</h1><p class="welcome-role">Pentester Junior<span>Santiago, Chile</span></p><p class="welcome-description">Investigo fallos, conecto evidencias y documento decisiones. Explora mis casos y herramientas.</p></div><div class="welcome-navigation"><div class="welcome-actions"><a class="button primary" href="proyectos.html#report-gen">Ver proyectos</a><a class="button" href="#casos">Ver casos</a></div><div class="welcome-links"><a class="text-link welcome-contact" href="#contacto">Contacto</a><a class="text-link" href="recorrido.html">Recorrido breve</a></div></div></div>
 <nav class="terminal-directory" aria-labelledby="terminal-directory-title"><p class="terminal-prompt" aria-hidden="true"><span>~ $</span> ls laboratorio/</p><h2 id="terminal-directory-title">Elige por dónde entrar</h2><a href="guias.html"><span class="terminal-command">cd guias/ <span aria-hidden="true">→</span></span><span>{len(SERIES)} recorridos de práctica</span></a><a href="tecnicas.html"><span class="terminal-command">cat tecnicas <span aria-hidden="true">→</span></span><span>{techs_total} técnicas con contexto</span></a><a href="herramientas.html"><span class="terminal-command">ls herramientas/ <span aria-hidden="true">→</span></span><span>{tools_total} herramientas por propósito</span></a></nav></div>
 <div class="welcome-terminal-footer"><span class="terminal-session-note"><span class="terminal-ready-dot" aria-hidden="true"></span>Nmap · Forest · report-gen</span><a href="#terminal-lab" data-open-session>Explorar la sesión completa <span aria-hidden="true">↓</span></a></div>
 </div></section>'''
 certifications=f'''<section class="shell home-certifications" aria-labelledby="certificaciones-title"><div class="welcome-creds" id="certificaciones" tabindex="-1"><h2 class="welcome-creds-label" id="certificaciones-title">Certificaciones verificables</h2>{serialize(hero_badges)}<p>Credenciales con enlace a su verificación. Los casos muestran cómo aplico y explico lo aprendido.</p></div></section>'''
 terminal=f'''<div class="lab-session">

 <details class="session-shell" id="terminal-lab"><summary class="session-summary"><span class="session-summary-label">Explorar la terminal</span><span class="session-summary-hint" data-summary-hint>Sesión de ejemplo: Nmap, Forest y report-gen</span></summary><div class="session" data-session><div class="session-title"><span class="session-path">iphobiuss@lab: ~ (tmux)</span><span class="session-ctl"><button type="button" class="motion-toggle js-only" data-motion-toggle aria-label="Animación del sitio" aria-pressed="true"><span>Animación del sitio</span><svg class="motion-state-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path data-motion-indicator d="M22 12h-4l-3 9-6-18-3 9H2"/></svg><span class="sr-only" aria-hidden="true" data-motion-state>: activa</span></button><button type="button" class="motion-toggle js-only" data-motion-replay>Reproducir sesión</button></span></div>
 <section class="spane spane-term" data-pane="term" aria-label="Terminal de ejemplo"><p class="ptitle"><b>0:nmap</b><span>elige un servicio para explorar</span></p>{term}</section>
 <section class="spane spane-graph" data-pane="graph" aria-label="Ruta de ataque de la guía Forest"><p class="ptitle"><b>1:bloodhound</b><a href="{FOREST_PATH['guide']}">ruta de Forest, guía 03</a></p>{graph}<p class="gcap" data-gcap data-default="Resumen de 5 nodos. De una cuenta de servicio al acceso como Administrator: AS-REP roasting, WinRM, membresía anidada (MemberOf*), WriteDacl, DCSync y pass-the-hash.">Resumen de 5 nodos. De una cuenta de servicio al acceso como Administrator: AS-REP roasting, WinRM, membresía anidada (MemberOf*), WriteDacl, DCSync y pass-the-hash.</p></section>
 <section class="spane spane-report" data-pane="report" aria-label="Exportación con report-gen"><p class="ptitle"><b>2:report-gen</b><span>{E(REPORT['version'])}, informe de ejemplo</span></p>{report}</section>
 <p class="session-status"><span><span class="sw now">0:nmap</span><span class="sw">1:bloodhound</span><span class="sw">2:report-gen</span></span><span class="session-right">edición {E(edition)} <span data-clock></span></span></p></div></details>
 </div>'''
 return hero,certifications,terminal


def meta_summary(text,limit=155):
 text=' '.join(text.split())
 if len(text)<=limit:return text
 cut=text[:limit+1]
 for sep in ('. ','; ',', ',' '):
  k=cut.rfind(sep)
  if k>limit*0.55:return text[:k]+('.' if sep=='. ' else '')
 return cut[:limit].rstrip()

def build_home():
 counts=area_counts();tools_total=sum(len(g['t']) for g in DATA['ARSENAL']);techs_total=sum(counts.values())
 external='<span class="sr-only"> (abre otra pestaña)</span>'
 zip_name=REPORT.get('download_name',REPORT['download'].split('/')[-1]);guide_name=REPORT.get('guide_name','Guía de uso')
 ledger=''
 for key,count in sorted(counts.items(),key=lambda x:-x[1]):
  label,desc,_=AREA_INFO[key]
  ledger+=f'<li><a href="tecnicas.html?area={key}"><span class="area-name">{E(label)}</span><span class="area-desc">{E(desc)}</span><span class="area-count">{plural(count,"técnica","técnicas")}</span></a></li>'
 certs=''.join(explorer_row(sec['id']+'/',f'Notas de preparación de {sec["code"]}',plural(len(sec['techs']),'técnica','técnicas'),f'tecnicas.html?cert={sec["id"]}','folder') for sec in DATA['DATA'])
 tools=''.join(explorer_row(slug(g['h'])+'/',g['h'],plural(len(g['t']),'herramienta','herramientas'),f'herramientas.html#grupo-{slug(g["h"])}','term') for g in DATA['ARSENAL'])
 tools+=explorer_row('cheatsheet/','Comandos por objetivo, con referencia en Markdown',plural(len(DATA['CHEAT']),'grupo','grupos'),'herramientas.html#cheatsheet','file')
 sample=(OUT/SAMPLE_REPORT).exists()
 sample_banca=(OUT/SAMPLE_REPORT_BANCA).exists()
 banca_pages=REPORT.get('sample_banca_pages')
 project_files=(explorer_row(zip_name,'Código fuente, guía de uso y proyecto de ejemplo',download_size(),REPORT['download'],'zip')
  +explorer_row(guide_name,'Guía de uso de report-gen','Markdown',REPORT['guide'],'file')
  +explorer_row('banco-lumbre/','Resumen de banca digital: del hallazgo técnico a la decisión de negocio','Simulación',BANK['summary_page'],'folder')
  +(explorer_row(SAMPLE_REPORT.split('/')[-1],'Informe de ejemplo exportado con report-gen, con datos ficticios','PDF',SAMPLE_REPORT,'file') if sample else '')
  +(explorer_row(SAMPLE_REPORT_BANCA.split('/')[-1],'Evaluación de banca digital y riesgo empresarial: caso ficticio Banco Lumbre',f'PDF, {banca_pages} páginas' if banca_pages else 'PDF',SAMPLE_REPORT_BANCA,'file') if sample_banca else '')
  +explorer_row('github.com/IphobiusS/report-gen','Repositorio público del proyecto','GitHub',GITHUB,'link',True))
 features=''.join(f'<li><b>{E(f["title"])}.</b> {E(f["text"])}</li>' for f in REPORT['features'][:4])
 folders=[('readme','README.md','','file'),('proyectos','proyectos/','2','folder'),('guias','guias/',str(len(SERIES)),'folder'),('tecnicas','tecnicas/',str(techs_total),'folder'),('herramientas','herramientas/',str(tools_total),'folder')]
 tree=''.join(f'<a href="#{k}" data-folder="{k}">{pi(icon)}<span class="tree-name">{E(label)}</span>'+(f'<span class="count">{count}</span>' if count else '')+'</a>' for k,label,count,icon in folders)
 sample_link=f'<a class="text-link" href="{SAMPLE_REPORT}">Ver informe de ejemplo</a>' if sample else ''
 readme=(f'<p class="prompt"><b>iphobiuss@lab</b>:~/iphobiuss$ cat README.md</p><div class="readme-intro"><h2 class="profile-title">Biblioteca del laboratorio</h2>'
  '<p class="pitch">Guías con pistas, técnicas y herramientas para practicar. Cada carpeta tiene su propia dirección y puedes guardar tus lecturas en el cuaderno local.</p>'
  f'<p class="status-line"><span class="status-label">Ahora</span> {E(STATUS)}</p>'
  '<div class="actions hero-actions"><a class="button primary" href="#guias" data-folder-link="guias">Elegir una guía</a><a class="button" href="cuaderno.html">Abrir mi cuaderno</a></div></div>'
  f'<dl class="hero-stats"><div><dt>Guías de laboratorio</dt><dd>{len(SERIES):02d}</dd></div><div><dt>Técnicas documentadas</dt><dd>{techs_total}</dd></div><div><dt>Herramientas en contexto</dt><dd>{tools_total}</dd></div></dl>'
  '<aside class="readme-start" aria-label="Ruta para empezar"><div><h2>¿Tu primer laboratorio?</h2><p>Prepara la VPN y el entorno. Después, sigue una guía con pistas antes de abrir la solución.</p></div><a class="button" href="setup.html">Empezar desde cero</a></aside>'
  f'<details class="readme-en" lang="en"><summary>English summary</summary><p>{E(ENGLISH)}</p></details>')
 featured=(f'<section class="shell home-featured" id="proyecto-destacado" aria-labelledby="featured-title"><div class="readme-project">'
  f'<div class="readme-project-foot"><p class="section-eyebrow">Proyecto propio · v{E(REPORT["version"])}</p><h2 id="featured-title">report-gen</h2><p class="featured-tagline">Una revisión. Cuatro formatos.</p><p>Documenta hallazgos y evidencias en tu equipo. Genera PDF, Word, Markdown y HTML portátil desde la misma revisión, con comprobaciones antes de entregar.</p>'
  f'<div class="readme-project-links"><a class="button primary" href="proyectos.html#report-gen">Conocer report-gen</a>{sample_link}</div></div>{shot_readme()}</div></section>')

 proyectos=(f'<p class="prompt"><b>iphobiuss@lab</b>:~/iphobiuss/proyectos$ ls</p><h2 class="pane-title">Proyectos</h2>'
  f'<article class="project-window" aria-labelledby="pw-title"><h3 id="pw-title" class="sr-only">report-gen</h3>'
  f'<a class="pw-shot" href="proyectos.html#report-gen" tabindex="-1" aria-hidden="true">{shot_main(context="home")}</a>'
  f'<div class="pw-facts-bar"><span><b>report-gen</b> v{E(REPORT["version"])}</span><span>MIT, Python 3.10 o superior, cuatro formatos</span></div>'
  '<div class="pw-body"><div class="pw-session"><p class="group-label">Inicio local en Linux o Kali</p><p>Extrae el ZIP y abre la terminal en su carpeta <code>report-gen/</code>. El asistente prepara el entorno. Revisa primero los requisitos del README incluido.</p><pre>cd report-gen\npython3 start.py --ready\n# editor en http://127.0.0.1:8080</pre><details><summary>Otros sistemas y motores de PDF</summary><p>Consulta la guía para preparar Windows y el motor opcional Chromium, y revisar el alcance de validación por plataforma.</p></details></div>'
  '<div class="pw-row"><div class="pw-copy"><p class="lead">Del hallazgo a la entrega: organiza activos, evidencias y retests, y exporta PDF, Word, Markdown y HTML portátil desde una misma revisión guardada. Trabaja en tu equipo, sin cuentas ni telemetría.</p>'
  f'<ul class="project-highlights">{features}</ul></div>'
  f'<div class="pw-actions"><p class="group-label">Acceso</p><div class="actions"><a class="button primary" href="proyectos.html#report-gen">Cómo funciona</a><a class="button" href="{E(REPORT["download"])}" download>Descargar v{E(REPORT["version"])}</a></div><p class="pw-link"><a class="text-link external" href="{GITHUB}" target="_blank" rel="noopener">Repositorio en GitHub{external}</a></p></div></div></div></article>'
  +prometheus_card(home=True)+f'<ul class="explorer-list">{project_files}</ul>')
 guias=(f'<p class="prompt"><b>iphobiuss@lab</b>:~/iphobiuss/guias$ ls</p><h2 class="pane-title">Guías de laboratorio</h2>'
  '<p class="lead">Máquinas de Hack The Box explicadas con hipótesis, pruebas, pistas y conceptos transferibles. Empieza por la guía 00 si es tu primer laboratorio.</p>'
  f'{guide_group()}<p class="feed-line">{pi("file")}<a href="feed.xml">Suscribirse a las guías (RSS)</a></p>')
 tecnicas=(f'<p class="prompt"><b>iphobiuss@lab</b>:~/iphobiuss/tecnicas$ ls</p><h2 class="pane-title">Técnicas</h2>{search_form()}'
  f'<p class="lead">Busca entre {plural(techs_total,"técnica","técnicas")}, {plural(tools_total,"herramienta","herramientas")} y {plural(len(SERIES),"guía","guías")}, o entra por área. Las convenciones y el glosario están en <a href="fundamentos.html">Fundamentos</a>.</p>'
  f'<ul class="area-ledger" aria-label="Técnicas por área">{ledger}</ul><p class="group-label">Por certificación</p><ul class="explorer-list">{certs}</ul>')
 herramientas=(f'<p class="prompt"><b>iphobiuss@lab</b>:~/iphobiuss/herramientas$ ls</p><h2 class="pane-title">Herramientas</h2>'
  '<p class="lead">Qué hace cada herramienta, cuándo usarla y comandos de referencia, agrupadas por propósito.</p>'
  f'<ul class="explorer-list">{tools}</ul>')
 panes={'readme':readme,'proyectos':proyectos,'guias':guias,'tecnicas':tecnicas,'herramientas':herramientas}
 pane_html=''.join(f'<section class="pane" id="{k}" data-path="{"" if k=="readme" else k+"/"}" aria-label="{E(label)}">{panes[k]}</section>' for k,label,_,_ in folders)
 hero,certifications,terminal=welcome(techs_total,tools_total)
 body=('<div class="home-presentation" data-motion-stage>'+hero+featured+casos_section()+certifications
  +f'<section class="shell lab" id="laboratorio" aria-labelledby="laboratorio-title"><div class="lab-intro"><p class="section-eyebrow">Para explorar con calma</p><h2 id="laboratorio-title">Mi laboratorio</h2><p>Guías, técnicas y herramientas para estudiar. Prometeo y Evaristo cuidan este rincón.</p><div class="lab-shortcuts"><a href="guias.html">Guías de laboratorio</a><a href="tecnicas.html">Técnicas</a><a href="herramientas.html">Herramientas</a><a href="cuaderno.html">Mi cuaderno</a></div></div>{terminal}'
  '<details class="library-disclosure" data-library><summary>Explorar carpetas y proyectos del laboratorio</summary><div class="lab-window"><div class="titlebar"><span class="window-path" id="window-path">iphobiuss@lab:~/iphobiuss</span><span class="titlebar-hint js-only">Flechas para cambiar de carpeta, Tab para entrar, Enter para abrir</span></div>'
  f'<div class="window-body"><nav class="tree-nav" aria-label="Carpetas"><div class="tree">{tree}</div></nav><div class="panes">{pane_html}</div></div>'
  f'<p class="statusbar"><span id="window-status">{plural(len(folders),"entrada","entradas")} en ~/iphobiuss</span><span>Cada carpeta tiene su propia dirección; el botón Atrás vuelve a la anterior.</span></p></div></details></section>'
  +professional_contact()+'</div>')

 document('index.html',NAME+', Pentester Junior','Base de conocimiento de pentesting: guías de laboratorio, 52 técnicas, 36 herramientas y report-gen. Por iphobiuss.',body,'index',social='og-image.png' if (OUT/'og-image.png').exists() else None)
 (OUT/'assets/img/favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" shape-rendering="crispEdges"><rect width="24" height="24" fill="#0a0d0b"/><g fill="#6ee283"><rect x="8" y="3" width="8" height="2"/><rect x="7" y="5" width="2" height="4"/><rect x="15" y="5" width="2" height="4"/><rect x="5" y="9" width="14" height="12"/></g><g fill="#0a0d0b"><rect x="11" y="12" width="2" height="4"/><rect x="10" y="16" width="4" height="2"/></g></svg>',encoding='utf-8')

def build_feed():
 items=''
 for i,n in enumerate(SERIES):
  g=GUIDES[n]
  item_title=f'Guía {i:02d}: {g["title"]}'
  items+=f'<item><title>{E(item_title)}</title><link>{BASE}{n}.html</link><guid isPermaLink="true">{BASE}{n}.html</guid><description>{E(g["brief"])}</description><category>{E(g["os"])}</category></item>'
 built=datetime.date.fromisoformat(max([DATE,*PAGE_EDITIONS.values()])).strftime('%a, %d %b %Y 00:00:00 GMT')
 feed=f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Guías de laboratorio de iphobiuss</title><link>{BASE}guias.html</link><atom:link href="{BASE}feed.xml" rel="self" type="application/rss+xml"/><description>Máquinas de Hack The Box explicadas paso a paso, de la VPN a Active Directory.</description><language>es</language><lastBuildDate>{built}</lastBuildDate>{items}</channel></rss>'
 (OUT/'feed.xml').write_text(feed,encoding='utf-8')

def prometheus_card(home=False):
 heading='h3' if home else 'h2'
 identifier='home-prometheus' if home else PROMETHEUS['anchor']
 title_id=identifier+'-title'
 link=f'<p><a class="button" href="proyectos.html#{E(PROMETHEUS["anchor"])}">Ver estado de PrometheuS</a></p>' if home else ''
 return (f'<article class="project-pending" id="{E(identifier)}" aria-labelledby="{E(title_id)}">'
  f'<p class="project-state">{E(PROMETHEUS["status"])}</p><{heading} id="{E(title_id)}">{E(PROMETHEUS["name"])}</{heading}>'
  f'<p>{E(PROMETHEUS["description"])}</p><p class="project-availability">{E(PROMETHEUS["availability"])}</p>{link}</article>')

def build_projects():
 features=''.join(f'<li><h3>{E(item["title"])}</h3><p>{E(item["text"])}</p></li>' for item in REPORT['features'])
 banca_pages=REPORT.get('sample_banca_pages')
 if (OUT/SAMPLE_REPORT_BANCA).exists():
  sample_note=(f'Dos informes de ejemplo: <a href="{SAMPLE_REPORT}">Nimbus (PDF)</a> y '
               f'<a href="{BANK["summary_page"]}">Banco Lumbre: resumen y lectura HTML completa</a> '
               f'(<a href="{SAMPLE_REPORT_BANCA}">PDF, {banca_pages} páginas</a>).')
 else:
  sample_note=f'<a href="{SAMPLE_REPORT}">Ver un informe de ejemplo (PDF)</a>.'
 proj=f'''<article class="project-page" id="report-gen">
 <div class="project-intro"><div><div class="proj-top"><h2 class="proj-name">report-gen</h2><span class="version-label">v{E(REPORT['version'])}</span></div><p class="project-tagline">Del hallazgo al informe, en tu equipo.</p><p class="proj-desc">Organiza activos, documenta evidencias y sigue la remediación en un editor local. Exporta PDF, Word, Markdown y HTML portátil desde una misma revisión guardada.</p><ul class="project-meta" aria-label="Características técnicas"><li>Python + Flask</li><li>CVSS 3.1 / 4.0</li><li>CWE</li><li>Licencia MIT</li><li>Sin cuentas ni telemetría</li></ul><div class="proj-links"><a class="button primary" href="{E(REPORT['download'])}" download>Descargar v{E(REPORT['version'])} <span class="download-format">{download_size()}</span></a><a class="button external" href="{GITHUB}" target="_blank" rel="noopener">Repositorio en GitHub<span class="sr-only"> (abre otra pestaña)</span></a></div><p class="download-note">Versión {E(REPORT['version'])}: código fuente, guía de uso y ejemplos ficticios. {sample_note}</p></div></div>
 <section class="project-section" aria-labelledby="problem-title"><h2 id="problem-title">El problema que resuelve</h2><p>Preparar un informe exige mantener alineados los hallazgos, sus evidencias, las referencias y la remediación. Cuando cada formato se edita por separado, aparecen inconsistencias que dificultan la revisión. report-gen es un editor local para organizar ese trabajo y exportar PDF, Word, Markdown y HTML portátil desde una misma revisión guardada.</p><h3>Decisiones de implementación</h3><ul class="takeaways"><li><b>Identificadores estables.</b> Conservar los identificadores al eliminar, duplicar o reordenar fichas, para que las referencias mantengan su destino.</li><li><b>Copia para publicar.</b> Procesar una copia para publicar y conservar separados los originales privados.</li><li><b>Comprobaciones por formato.</b> Mostrar comprobaciones de cada exportación y distinguir sus límites de la revisión visual necesaria.</li></ul></section>
 {bank_teaser()}
 <figure class="project-screenshot">{shot_main()}<figcaption>{project_caption('editor')}</figcaption></figure>
 <section class="project-section" aria-labelledby="workflow-title"><h2 id="workflow-title">Un flujo completo de documentación</h2><ul class="feature-list">{features}</ul></section>
 <section class="project-section pagination-note" aria-labelledby="pagination-title"><h2 id="pagination-title">Comprobar antes de entregar</h2><p>La versión {E(REPORT['version'])} comprueba referencias, metadatos y enlaces. En HTML, Word y Markdown contrasta además el contexto de las evidencias; en PDF comprueba presencia de texto e imágenes y destinos del índice. En HTML detecta contenido oculto por las reglas CSS contempladas. Todos los formatos necesitan también revisión visual antes de compartirse.</p><details class="project-checks spoiler"><summary>Ver las comprobaciones del HTML portátil</summary><figure class="project-screenshot">{project_shot('comprobaciones')}<figcaption>{project_caption('comprobaciones')}</figcaption></figure></details></section>
 <figure class="project-screenshot">{shot_hallazgos()}<figcaption>{project_caption('entrega')}</figcaption></figure><section class="project-section" aria-labelledby="getting-started-title"><h2 id="getting-started-title">Empieza con la demo Nimbus</h2><ol class="project-steps"><li><strong>Descarga y prepara el editor.</strong> Desde <code>report-gen/</code>, ejecuta <code>python3 start.py --ready</code>.</li><li><strong>Abre «Probar demo Nimbus».</strong> El ejemplo ficticio incluye 12 hallazgos para recorrer el flujo sin usar datos de un cliente.</li><li><strong>Trabaja, revisa y entrega.</strong> Edita una evidencia, guarda una revisión y prepara los formatos desde Entregar. Comprueba los archivos y su presentación antes de compartirlos.</li></ol><div class="actions"><a class="button" href="{E(REPORT['guide'])}">Guía de uso</a><a class="button" href="{SAMPLE_REPORT}">Ver informe Nimbus (PDF)</a></div><p class="project-requirements">Python 3.10 o posterior; Linux / Kali es la ruta prioritaria. Consulta el README para las dependencias, los motores de PDF y el alcance de validación por plataforma.</p></section>
 </article>'''
 pending=prometheus_card()
 catalog='<nav class="project-catalog" aria-label="Proyectos propios"><a href="#report-gen">report-gen</a><a href="#prometheus">PrometheuS <span>En construcción</span></a></nav>'
 body=page_head('Proyectos','Herramientas que construyo para documentar y mejorar mi trabajo en seguridad.',folder='proyectos',path='proyectos/')+'<div class="shell">'+catalog+proj+pending+'</div>'+professional_contact()
 body=body.replace('<section class="project-section pagination-note"', '<p><a class="button" href="report-gen-demo.html">Explorar tres tareas de reporting</a></p><section class="project-section pagination-note"',1)
 document('proyectos.html','Proyectos: report-gen y PrometheuS','report-gen '+REPORT['version']+': informes locales en cuatro formatos. PrometheuS: agente de pentesting por línea de comandos, en construcción.',body,'proyectos',social='assets/img/report-gen-og.png')
 record('report-gen','proyectos.html#report-gen','Proyecto',proj,'Python, Flask, CVSS, v'+REPORT['version'])
 record(PROMETHEUS['name'],'proyectos.html#'+PROMETHEUS['anchor'],'Proyecto',pending,PROMETHEUS['status'])

def case_meta(os_label,level):
 return f'<div class="meta" role="group" aria-label="Ficha del caso"><span class="tag">HTB</span><span class="tag">{E(os_label)}</span><span class="tag{level_class(level)}">{E(level.upper())}</span><span class="tag">Caso</span></div>'

def case_out(code):
 return f'<figure class="code-block" data-code-kind="output"><figcaption><span>Salida de ejemplo (de la guía)</span></figcaption><pre tabindex="0" role="group" aria-label="Salida de ejemplo; desplazamiento horizontal disponible"><code>{E(code)}</code></pre></figure>'

def case_synthesis(decision,resultado,problem='',evidence=''):
 rows=[('Problema',problem),('Decisión',decision),('Evidencia documentada',evidence),('Resultado',resultado)]
 return '<dl class="case-synthesis">'+''.join(f'<div><dt>{label}</dt><dd>{value}</dd></div>' for label,value in rows if value)+'</dl>'

def render_case(fname,guide,title,subtitle,desc,synthesis,intro,hyp,ev,mit,guide_label,other_href,other_label,source):
 slug_=fname.replace('-caso.html','')
 case_date=PAGE_EDITIONS.get(fname,DATE)
 case_stamp=datetime.date.fromisoformat(case_date)
 case_edition=f'{case_stamp.day} '+('ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic')[case_stamp.month-1]+f' {case_stamp.year}'
 # La dificultad y el sistema operativo se derivan de la misma guía (única fuente), para no divergir del catálogo.
 g=GUIDES[guide];os_label=ui_text(g['os']);level=g['level'];guide_href=guide+'.html'
 toc=[('mapa','Mapa del caso documentado'),('expediente','Expediente interactivo'),('hipotesis','Hipótesis y decisiones'),('evidencia','Evidencia y resultado'),('mitigacion','Mitigación y aprendizaje')]
 toc_links=''.join(f'<a href="#{i}">{E(t)}</a>' for i,t in toc)
 head=(f'<div class="page-head"><div class="shell">{lab_crumbs("guias","casos/"+slug_)}'
  f'<h1>{E(title)}</h1>{case_meta(os_label,level)}'
  f'<div class="article-meta"><time datetime="{case_date}">Edición {case_edition}</time><span>Caso retrospectivo de laboratorio</span></div>'
  f'<p>{E(subtitle)}</p></div></div>')
 content=(synthesis+intro+evolution.attack_graph(guide,ROOT)+evolution.evidence_dossier(guide,ROOT)
  +f'<section id="hipotesis" data-phase="cyan"><div class="sec-head"><span class="sec-id" aria-hidden="true">▚</span><h2 class="sec-name">Hipótesis y decisiones</h2></div>{hyp}</section>'
  +f'<section id="evidencia" data-phase="magenta"><div class="sec-head"><span class="sec-id" aria-hidden="true">▚</span><h2 class="sec-name">Evidencia y resultado documentado</h2></div>{ev}</section>'
  +f'<section id="mitigacion" data-phase="green"><div class="sec-head"><span class="sec-id" aria-hidden="true">▚</span><h2 class="sec-name">Mitigación y aprendizaje</h2></div>{mit}</section>'
  +f'<div class="case-cta"><a class="button primary" href="{guide_href}">{E(guide_label)}</a><a class="button" href="{other_href}">{E(other_label)}</a></div>'
  +f'<p class="case-source">{source}</p><aside class="case-contact"><h2>¿Quieres conversar sobre mi trabajo?</h2><p>Puedes revisar el proyecto de reporting o contactarme.</p><div class="actions"><a class="button" href="proyectos.html#report-gen">Ver report-gen</a>{contact_links()}</div></aside>')
 body=(head+f'<div class="shell article-layout"><aside class="article-toc"><span class="toc-label">En este caso</span><nav aria-label="Índice del caso">{toc_links}</nav></aside>'
  f'<div class="article-content"><details class="mobile-toc"><summary>En este caso</summary><nav aria-label="Índice móvil">{toc_links}</nav></details>{content}</div></div>')
 social='assets/img/og/'+guide+'.png'
 document(fname,title,desc,body,'guias',article=True,social=social if (OUT/social).exists() else None)
 record(title,fname,'Caso',subtitle+' '+os_label+' '+plain(hyp)+' '+plain(ev)+' '+plain(mit),'Caso de laboratorio, '+level)

def build_cases():
 cap_synth=case_synthesis(
  'Tratar una descarga legítima como un control de acceso y correlacionar el dato expuesto con otros servicios.',
  'La guía documenta acceso SSH y escalada a UID 0 mediante la capability de Python.',
  problem='Una descarga de capturas permite acceder a tráfico de otra sesión del laboratorio.',
  evidence='La guía enlaza el cambio de snapshot, credenciales FTP, acceso SSH y la capability. No se conserva aquí el PCAP original.')
 cap_intro=('<div class="notice"><b>Caso retrospectivo.</b> Sintetiza mi guía de Cap (laboratorio HTB, Linux); no es un cliente ni un retest nuevo. '
  'Los identificadores, paquetes y salidas provienen de esa documentación.</div>')
 cap_hyp=('<p class="sec-focus">Tres hipótesis guiaron el caso. Cada salto necesitaba su propia evidencia.</p>'
  '<p><b>Autorización por objeto.</b> La descarga depende de un identificador numérico. Comparar el snapshot de la sesión con otro identificador permite examinar si el servidor autoriza cada objeto. Empecé por la función web con mayor superficie observable y usé esa comparación concreta antes de buscar exploits genéricos.</p>'
  '<p><b>Correlación entre servicios.</b> Una captura que sí contiene tráfico merece análisis antes de buscar un exploit. Los campos USER y PASS de FTP pueden revelar credenciales; el servicio SSH ya identificado ofrece una forma de comprobar su reutilización dentro del alcance del laboratorio.</p>'
  '<p><b>Privilegios efectivos.</b> Tras el acceso, revisar las capabilities permite elegir una escalada basada en permisos concretos. CAP_SETUID sobre un intérprete de propósito general permite intentar cambiar la identidad efectiva del proceso: el permiso concreto importa más que el nombre del binario.</p>')
 cap_ev=('<p><b>Capturas distintas.</b> El capítulo 02 describe <code class="ic">/data/1</code> como el snapshot propio y vacío; <code class="ic">/data/0</code> contiene 72 paquetes, 69 TCP, de una captura anterior. El cambio de identificador es la evidencia documental del acceso a un objeto distinto. <a href="cap.html#idor">Ver en la guía: IDOR</a>.</p>'
  '<p><b>Credenciales y acceso.</b> Los capítulos 03 y 04 describen autenticación FTP legible y la reutilización de esas credenciales para acceder por SSH como <code class="ic">nathan</code>. Los secretos se omiten en este caso público. <a href="cap.html#pcap">Ver: análisis de la captura</a> · <a href="cap.html#access">acceso por SSH</a>.</p>'
  '<p><b>Capability y comprobación de identidad.</b> El capítulo 05 documenta la capability del intérprete y las comprobaciones finales. El resultado se expresa mediante UID 0, además del nombre de usuario. <a href="cap.html#privesc">Ver: escalada de privilegios</a>.</p>'
  +case_out('/usr/bin/python3.8 = cap_setuid,cap_net_bind_service+eip\n\nwhoami\n# root\nid\n# uid=0(root) ...')
  +'<p><b>Resultado.</b> La guía describe acceso a una captura distinta del snapshot propio, lectura de credenciales FTP, acceso SSH como nathan y una escalada a UID 0 mediante la capability de Python. El impacto surge de la cadena completa: exposición de datos, reutilización de credenciales y exceso de privilegios.</p>'
  '<div class="warn"><b>Alcance de la evidencia.</b> No se recibió el PCAP original ni una transcripción de terminal independiente. No se acredita la eficacia de una remediación ni el comportamiento de una instancia actual. Los 72 paquetes y 69 TCP son valores de la guía, no mediciones nuevas.</div>')
 cap_mit=('<p class="sec-focus">Propuestas técnicas, no aplicadas ni verificadas en esta entrega.</p>'
  '<ul class="takeaways">'
  '<li><span class="tk">P1</span><b>Cortar la exposición.</b> Comprobar en el servidor la autorización sobre cada snapshot y su descarga; denegar por defecto cuando el usuario no sea propietario o carezca del permiso explícito. Identificadores impredecibles pueden reducir la enumeración, pero no sustituyen esa autorización. <span class="mitig-breaks">Rompe: acceso a capturas por cambio de identificador.</span></li>'
  '<li><span class="tk">P1</span><b>Proteger las credenciales.</b> Eliminar el transporte de credenciales en claro: migrar FTP a SFTP o FTPS bien configurado y limitar el acceso y la retención de capturas. Rotar las credenciales expuestas y revisar dónde se reutilizaron. <span class="mitig-breaks">Rompe: exposición y propagación de las credenciales.</span></li>'
  '<li><span class="tk">P1</span><b>Reducir privilegios.</b> Retirar CAP_SETUID del intérprete de propósito general y revisar las capabilities de los binarios accesibles; conceder solo los privilegios necesarios mediante mecanismos acotados. <span class="mitig-breaks">Rompe: cambio de identidad a UID 0 desde un intérprete arbitrario.</span></li>'
  '</ul>'
  '<p><b>Aprendizaje.</b> Una descarga aparentemente legítima puede iniciar una cadena de compromiso. El análisis gana valor al conectar el dato expuesto con otro servicio y comprobar el permiso local que habilita el salto siguiente. Cada salto necesita evidencia propia.</p>')
 render_case('cap-caso.html','cap',
  'Cap: una captura de red expuesta y su impacto hasta root',
  'Control de acceso, tráfico sensible y privilegios en Linux: cómo se encadenan tres fallos.',
  'Caso de laboratorio Cap (HTB, Linux): de una captura de red expuesta a root. Hipótesis, evidencia citada a la guía, decisiones y mitigaciones propuestas, por iphobiuss.',
  cap_synth,cap_intro,cap_hyp,cap_ev,cap_mit,
  'Leer la guía completa de Cap','forest-caso.html','Siguiente caso: Forest',
  'Fuente: mi guía de Cap (capítulos 02 a 05). Resultado histórico documentado; las mitigaciones son propuestas, no verificadas.')
 for_synth=case_synthesis(
  'Leer la escalada como una cadena de identidades y permisos, no como una vulnerabilidad de software.',
  'La guía documenta acceso como Administrator mediante Pass-the-Hash después de DCSync.',
  problem='Una cuenta sin preautenticación Kerberos y permisos mal delegados conectan el acceso inicial con la replicación del dominio.',
  evidence='Capítulos de AS-REP, WinRM, membresías y ACLs de la guía. No se dispone aquí del AS-REP original ni de ACLs exportadas.')
 for_intro=('<div class="notice"><b>Caso retrospectivo.</b> Sintetiza mi guía de Forest (laboratorio HTB, Active Directory); no es un cliente ni un retest nuevo. '
  'La adaptación a BloodHound CE es editorial, no una ejecución nueva.</div>')
 for_hyp=('<p class="sec-focus">Tres hipótesis, leídas como una cadena de identidades y permisos.</p>'
  '<p><b>Identidad y preautenticación.</b> Si la enumeración permite identificar cuentas, se puede comprobar cuál tiene deshabilitada la preautenticación Kerberos. El nombre <code class="ic">svc-alfresco</code> es una pista para priorizar, no una prueba: la condición se fundamenta en la respuesta concreta de preautenticación. Separé la identificación de cuentas de la configuración Kerberos.</p>'
  '<p><b>Material cifrado y autenticación.</b> El AS-REP es material cifrado susceptible a cracking offline, no un hash unidireccional de la contraseña. Una contraseña débil derivada de ese material puede permitir autenticarse y acceder por WinRM si la cuenta tiene autorización para el servicio. Distinguí el cracking offline de la autenticación en el dominio y comprobé después el acceso.</p>'
  '<p><b>Relaciones y permisos.</b> Las membresías anidadas y los permisos de grupo pueden permitir modificar la DACL del dominio y conceder derechos de replicación sin partir de una cuenta administrativa. Interpreté la escalada como una cadena de derechos concretos, no como una vulnerabilidad de software genérica.</p>')
 for_ev=('<p><b>Enumeración y preautenticación.</b> El capítulo de enumeración reporta 31 usuarios; el de AS-REP contrasta las cuentas y describe cuáles responden con la preautenticación bien configurada. <a href="forest.html#enum">Ver: enumeración</a> · <a href="forest.html#asrep">AS-REP</a>.</p>'
  '<p><b>Cracking y acceso.</b> La guía documenta cracking offline con diccionario y, después, acceso por WinRM de la cuenta de servicio. El secreto resultante se omite. <a href="forest.html#asrep">Ver: AS-REP</a> · <a href="forest.html#foothold">acceso por WinRM</a>.</p>'
  '<p><b>Cadena de permisos.</b> La guía describe la cadena de membresías, el control de un grupo con WriteDacl sobre el dominio y la concesión de derechos de replicación. La línea que importa corresponde al RID 500 (Administrator). <a href="forest.html#bloodhound">Ver: BloodHound</a> · <a href="forest.html#privesc">escalada</a>.</p>'
  +'<div class="path" role="group" aria-label="Cadena de membresías y permisos documentada en la guía"><span class="node">svc-alfresco</span> <span class="rel">─MemberOf→</span> <span class="node">Service Accounts</span> <span class="rel">─MemberOf→</span> <span class="node">Privileged IT Accounts</span> <span class="rel">─MemberOf→</span> <span class="node">Account Operators</span> <span class="rel">─GenericAll→</span> <span class="node">Exchange Windows Permissions</span> <span class="rel">─WriteDacl→</span> <span class="node">htb.local</span></div>'
  +'<p><b>Resultado.</b> La guía describe obtención de material AS-REP de svc-alfresco, recuperación de su contraseña mediante diccionario, acceso por WinRM y una cadena de permisos que permite conceder DCSync. Documenta después material de autenticación de Administrator y acceso con esa identidad mediante Pass-the-Hash.</p>'
  '<div class="warn"><b>Alcance de la evidencia.</b> No se recibieron el AS-REP original, el ZIP de recolección, las ACLs exportadas ni una transcripción independiente. La adaptación de las instrucciones a BloodHound CE es editorial, no una nueva ejecución. DCSync concede acceso a material de replicación; no acredita por sí solo membresía en Domain Admins.</div>')
 for_mit=('<p class="sec-focus">Propuestas técnicas, no aplicadas ni verificadas en esta entrega.</p>'
  '<ul class="takeaways">'
  '<li><span class="tk">P1</span><b>Exigir preautenticación Kerberos.</b> Exigirla a las cuentas que no tengan una excepción justificada. Revisar las excepciones y usar secretos largos y únicos o cuentas de servicio administradas cuando la aplicación sea compatible. <span class="mitig-breaks">Rompe: obtención de material AS-REP sin autenticación y cracking sencillo.</span></li>'
  '<li><span class="tk">P1</span><b>Revisar membresías y WriteDacl.</b> Revisar membresías directas y anidadas, retirar el control de grupos privilegiados que no sea necesario y eliminar WriteDacl sobre el dominio de identidades que no deban administrar su seguridad. <span class="mitig-breaks">Rompe: control del grupo que permite modificar permisos del dominio.</span></li>'
  '<li><span class="tk">P1</span><b>Restringir la replicación.</b> Restringir los derechos de replicación a los controladores de dominio y a identidades explícitamente justificadas. Auditar cambios de ACL, altas en grupos y solicitudes de replicación desde equipos no esperados. <span class="mitig-breaks">Rompe: obtención de material de autenticación de cuentas privilegiadas.</span></li>'
  '<li><span class="tk tk-lab">P2</span><b>Limitar enumeración y WinRM.</b> Limitar la información disponible de forma anónima y el acceso WinRM a las identidades y redes necesarias. Confirmar compatibilidad y reglas de administración antes de retirar acceso. <span class="mitig-breaks">Rompe: facilidad de enumeración y vía de acceso remoto de la cuenta de servicio.</span></li>'
  '</ul>'
  '<p><b>Aprendizaje.</b> La escalada en Active Directory puede depender de permisos legítimos mal delegados y de relaciones anidadas. Leer esas relaciones con precisión permite explicar qué derecho habilita cada salto y proponer una mitigación en el punto que corta la cadena.</p>')
 render_case('forest-caso.html','forest',
  'Forest: una cuenta de servicio y una cadena de permisos en Active Directory',
  'De material Kerberos expuesto a acceso como Administrator: interpretar identidades y ACLs.',
  'Caso de laboratorio Forest (HTB, Active Directory): de una cuenta de servicio a acceso como Administrator. Hipótesis, evidencia citada a la guía, decisiones y mitigaciones propuestas.',
  for_synth,for_intro,for_hyp,for_ev,for_mit,
  'Leer la guía completa de Forest','cap-caso.html','Otro caso: Cap',
  'Fuente: mi guía de Forest (enumeración, AS-REP, acceso y escalada). Resultado histórico documentado; las mitigaciones son propuestas, no verificadas.')

def casos_section():
 cards_data=[
  ('cap-caso.html','cap','Cap: de una captura expuesta a root',
   'Control de acceso, credenciales reutilizadas y privilegios de Python: las decisiones detrás de una escalada a root.'),
  ('forest-caso.html','forest','Forest: permisos de Active Directory',
   'Kerberos, grupos y ACLs: cómo una cuenta de servicio alcanza acceso como Administrator, según la guía.')]
 cards=''
 for href,guide,title,body in cards_data:
  g=GUIDES[guide];os_label=ui_text(g['os']);level=g['level']
  cards+=(f'<article class="entry-card reveal"><p class="card-meta"><span class="step-no">Caso</span>'
   f'<span class="tag">HTB</span><span class="tag">{E(os_label)}</span><span class="tag{level_class(level)}">{E(level.upper())}</span></p>'
   f'<h3><a href="{href}">{E(title)}</a></h3><p>{E(body)}</p>'
   f'<span class="card-cta" aria-hidden="true">Leer el caso</span></article>')
 return ('<section class="shell casos" id="casos" aria-labelledby="casos-title">'
  '<div class="casos-head"><h2 id="casos-title" class="pane-title">Casos destacados</h2>'
  '<p class="lead">Dos laboratorios HTB: problema, decisiones, evidencia y límites. Cada caso enlaza a la guía completa.</p></div>'
  f'<div class="entry-grid casos-grid">{cards}</div></section>')

def guide_environment(raw):
 values=['Kali Linux y VirtualBox: versiones no especificadas en la guía original.']
 for pattern,label in [(r'PHP 8\.1\.0-dev','Servicio del objetivo: PHP 8.1.0-dev.'),(r'python3\.8','Binario del objetivo: Python 3.8.'),(r'Windows Server 2019','Objetivo: Windows Server 2019.'),(r'BloodHound CE','Análisis: BloodHound CE; versión exacta no indicada.')]:
  if re.search(pattern,raw):values.append(label)
 return '<details class="environment"><summary>Entorno y versiones documentadas</summary><ul>'+''.join('<li>'+E(x)+'</li>' for x in values)+'</ul><p>Las versiones indicadas provienen del texto original. La fecha de edición identifica la revisión de esta página; no implica que se haya repetido el laboratorio.</p></details>'

def build_guide(n):
 path=ROOT/'content/guides'/f'{n}.html';raw=path.read_text(encoding='utf-8');tree=html.fromstring(raw);g=GUIDES[n];i=SERIES.index(n)
 title=g['title'];pitch=tree.xpath('//p[@class="pitch"]')[0];meta=deepcopy(tree.xpath('//div[@class="meta"]')[0])
 for chip in meta.xpath('.//*[text()]'):
  cls=level_class(chip.text_content())
  if cls and len(chip)==0:chip.set('class',(chip.get('class','')+cls).strip())
 for a in pitch.xpath('.//a'):
  if a.get('href','').startswith('index.html#'):a.set('href',a.get('href').replace('index.html#cheatsheet','herramientas.html#cheatsheet'))
 words=len(tree.text_content().split());minutes=max(5,math.ceil(words/180))
 guide_date=PAGE_EDITIONS.get(n+'.html',DATE)
 guide_edition=EDITION if guide_date==DATE else datetime.date.fromisoformat(guide_date).strftime('%d/%m/%Y')
 head=f'<div class="page-head"><div class="shell">{lab_crumbs("guias",f"guias/{i:02d}-{n}")}<h1>{E(title)}</h1>{serialize(meta)}<div class="article-meta"><time datetime="{guide_date}">Edición {guide_edition}</time><span>{minutes} min de lectura aprox.</span></div><p>{inner(pitch)}</p></div></div>'
 secs=tree.xpath('//main/section');toc=[];content=''
 intro=tree.xpath('//main/div[@class="intro"]')
 if intro:
  el=deepcopy(intro[0]);el.set('class','notice');content+=serialize(el)
 chains=tree.xpath('//header//div[@class="chain"]')
 if chains:content+='<details class="spoiler"><summary>Resumen del recorrido (contiene spoilers)</summary>'+serialize(chains[0])+'</details>'
 content+=guide_environment(raw)
 reading_modes='' if n=='setup' else '<span class="guide-controls-label">Modo de lectura</span><button class="small-button" type="button" data-guide-mode="full" aria-pressed="true">Guía completa</button><button class="small-button" type="button" data-guide-mode="hints" aria-pressed="false">Solo pistas</button>'
 content+='<div class="guide-controls js-only" data-guide-default="hints">'+reading_modes+'<button class="small-button print-button" type="button" data-print>Imprimir / PDF</button></div>'
 for sec in secs:
  sec=deepcopy(sec);sid=sec.get('id');h2=sec.xpath('.//h2')[0];heading=h2.text_content();toc.append((sid,heading))
  for subheading in sec.xpath('.//h4'):subheading.tag='h3'
  wrap=sec.xpath('./div')[0] if sec.xpath('./div') else sec
  for a in sec.xpath('.//a'):
   if a.get('href','').startswith('index.html#'):a.set('href',a.get('href').replace('index.html#cheatsheet','herramientas.html#cheatsheet').replace('index.html#arsenal','herramientas.html#arsenal').replace('index.html#glosario','fundamentos.html#glosario'))
  if sid=='tasks':
   for table in list(sec.xpath('.//div[@class="tblwrap"]')):
    box=html.Element('details',{'class':'spoiler'});summary=html.Element('summary');summary.text='Mostrar respuestas del laboratorio';box.append(summary);table.addprevious(box);table.getparent().remove(table);box.append(table)
  elif n!='setup' and sid not in ['takeaways','conceptos','checklist']:
   solution=html.Element('details',{'class':'solution','open':'open'});summary=html.Element('summary');summary.text='Ver solución paso a paso';solution.append(summary)
   hint=html.Element('div',{'class':'hint'});hint.text='';b=html.Element('b');b.text='PISTA';hint.append(b);b.tail=HINTS_BY_GUIDE.get((n,sid)) or HINTS.get(sid,'Revisa la evidencia reunida en el paso anterior. Formula una hipótesis y comprueba qué resultado la confirmaría o descartaría.')
   for child in list(wrap):
    if 'sec-head' in child.get('class','') or 'sec-focus' in child.get('class',''):continue
    wrap.remove(child);solution.append(child)
   wrap.append(hint);wrap.append(solution)
  for ul in sec.xpath('.//ul[contains(@class,"checklist")]'):
   for j,li in enumerate(ul.xpath('./li')):
    label=html.Element('label');checkbox=html.Element('input',{'type':'checkbox','data-checklist':f'{n}-{sid}-{j}'})
    text=li.text;li.text=None;label.append(checkbox);checkbox.tail=text
    for child in list(li):li.remove(child);label.append(child)
    li.append(label)
  content+=serialize(sec)
 toc_links=''.join(f'<a href="#{sid}">{E(t)}</a>' for sid,t in toc)
 prev=SERIES[i-1] if i else None;next_=SERIES[i+1] if i<len(SERIES)-1 else None
 series='<nav class="series-nav" aria-label="Navegación por la serie">'
 series+=f'<a href="{prev+".html" if prev else "guias.html"}"><small>{"Anterior, guía "+str(i-1).zfill(2) if prev else "Índice"}</small><span>{E(GUIDES[prev]["title"]) if prev else "Todas las guías"}</span></a>'
 series+=f'<a href="{next_+".html" if next_ else "guias.html"}"><small>{"Siguiente, guía "+str(i+1).zfill(2) if next_ else "Fin de la serie"}</small><span>{E(GUIDES[next_]["title"]) if next_ else "Volver a las guías"}</span></a></nav>'
 body=head+f'<div class="shell article-layout"><aside class="article-toc"><span class="toc-label">En esta guía</span><nav aria-label="Índice de la guía">{toc_links}</nav></aside><div class="article-content"><details class="mobile-toc"><summary>En esta guía</summary><nav aria-label="Índice móvil">{toc_links}</nav></details>'+content+series+'</div></div>'
 og=f'assets/img/og/{n}.png'
 document(n+'.html',title+': guía HTB',meta_summary(tree.xpath('//meta[@name="description"]/@content')[0]),body,'guias',article=True,social=og if (OUT/og).exists() else None)
 record(title,n+'.html','Guía',g['brief']+' '+g['topic']+' '+g['os']+' '+plain(inner(pitch)),ui_text(g['level']))
 for sec in secs:
  heading=sec.xpath('.//h2')[0].text_content()
  record(title+' / '+heading,n+'.html#'+sec.get('id'),'Guía',sec.text_content(),ui_text(g['level'])+', '+g['os'])

def bank_teaser():
 return (f'<section class="project-section" aria-labelledby="bank-preview-title"><p class="sec-focus">SIMULACIÓN · ENTIDAD FICTICIA</p>'
  '<h2 id="bank-preview-title">Banco Lumbre: del hallazgo a la decisión de negocio</h2>'
  '<p>Un caso de banca digital que conecta exposición técnica, apetito de riesgo, impacto y tratamiento. '
  'Las evidencias y los costes son sintéticos; no es una evaluación de un cliente.</p>'
  f'<div class="case-synthesis"><p><b>Alcance</b> <span>{BANK["findings"]} condiciones sobre {BANK["assets"]} activos ficticios.</span></p>'
  f'<p><b>Prioridad</b> <span>{BANK["priorities"]["P0"]} tratamientos P0; máximo del índice empresarial {BANK["max_business_index"]}/{BANK["index_scale_max"]}, distinto de CVSS.</span></p></div>'
  f'<div class="actions"><a class="button" href="{BANK["summary_page"]}">Leer el resumen del caso</a>'
  f'<a class="text-link" href="{REPORT["sample_banca_html"]}">Abrir el informe completo en HTML</a></div></section>')

def build_bank_case():
 title=BANK['title'];html_href=REPORT['sample_banca_html'];pdf_href=REPORT['sample_banca']
 toc=[('contexto','Contexto y alcance'),('riesgos','Tres decisiones prioritarias'),('criterio','Cómo se prioriza'),('tratamiento','Tratamiento y cierre'),('ejercicio','Ejercicio de criterio'),('lectura','Informe y procedencia')]
 toc_links=''.join(f'<a href="#{sid}">{E(label)}</a>' for sid,label in toc)
 head=(f'<div class="page-head"><div class="shell">{lab_crumbs("proyectos","proyectos/banco-lumbre")}'
  '<p class="sec-focus">SIMULACIÓN · BANCO FICTICIO · SIN RETEST</p>'
  f'<h1 data-scramble aria-label="{E(title)}">{E(title)}</h1>'
  '<p>Una simulación completa que conecta hallazgos técnicos, decisiones de negocio y un informe generado con report-gen.</p>'
  f'<div class="article-meta"><time datetime="{BANK["date_modified"]}">Síntesis: {datetime.date.fromisoformat(BANK["date_modified"]).strftime("%d/%m/%Y")}</time>'
  f'<time datetime="{BANK["source_date"]}">Informe original: {datetime.date.fromisoformat(BANK["source_date"]).strftime("%d/%m/%Y")}</time></div></div></div>')
 risk_items=''.join(f'<li><h3>{E(r["title"])}</h3>'
  f'<p><b>Riesgo empresarial:</b> {r["index"]}/25, {E(r["level"])}. <b>Tratamiento:</b> {E(r["priority"])}.</p>'
  f'<p>{E(r["scenario"])}</p><p><b>Decisión propuesta.</b> {E(r["decision"])}</p>'
  f'<a href="{E(html_href)}#{E(r["finding"])}">Leer {E(r["finding"])}/{E(r["risk"])} en el informe completo</a></li>' for r in BANK['risks'])
 bd=BANK['business_distribution'];td=BANK['technical_distribution'];prior=BANK['priorities']
 budget=f'{BANK["proposed_budget_clp"]:,}'.replace(',','.')
 content=(
  '<div class="notice"><b>Documento público de simulación.</b> Banco Lumbre, sus activos, evidencias y decisiones son ficticios. '
  'No hubo una evaluación bancaria real, implementación de controles ni retest.</div>'
  +case_synthesis('Priorizar independencia de aprobación, privilegios de despliegue y trazabilidad antes de ampliar las integraciones.',
   f'{BANK["findings"]} condiciones documentadas; {prior["P0"]} tratamientos P0 y todos los retests pendientes. El riesgo residual es una meta, no un resultado observado.')
  +f'<div class="actions"><a class="button primary" href="{html_href}">Leer el informe completo en HTML</a>'
  f'<a class="button" href="{pdf_href}">Ver PDF original ({REPORT["sample_banca_pages"]} páginas)</a></div>'
  '<section id="contexto"><div class="sec-head"><span class="sec-id" aria-hidden="true">01</span><h2 class="sec-name">Contexto y alcance</h2></div>'
  '<p>Banco digital ficticio para personas y pequeñas empresas: cuentas de pago, transferencias, movimientos, extractos y beneficiarios. '
  'Las operaciones de mayor importe requieren separación entre quien prepara y quien aprueba.</p>'
  f'<p>El guion cubre {BANK["assets"]} activos: portal, API transaccional, identidad, backoffice, integraciones, Active Directory, CI/CD y datos/auditoría. '
  'Los dominios utilizan .example y los artefactos de evidencia son sintéticos.</p></section>'
  '<section id="riesgos"><div class="sec-head"><span class="sec-id" aria-hidden="true">02</span><h2 class="sec-name">Tres decisiones prioritarias</h2></div>'
  '<p>Estas tres condiciones muestran por qué el orden de tratamiento necesita contexto de negocio. El informe describe las doce condiciones.</p>'
  f'<ul class="takeaways">{risk_items}</ul></section>'
  '<section id="criterio"><div class="sec-head"><span class="sec-id" aria-hidden="true">03</span><h2 class="sec-name">Cómo se prioriza</h2></div>'
  '<p><b>Severidad técnica y riesgo empresarial se registran por separado.</b> CVSS describe la consecuencia técnica acotada; '
  'el índice empresarial del guion combina plausibilidad e impacto mediante P × I, en una escala de 1 a 25. No representa una pérdida económica ni una probabilidad anual.</p>'
  f'<div class="case-synthesis"><p><b>Valoración técnica</b> <span>{td["critical"]} críticas, {td["high"]} altas, {td["medium"]} medias y {td["info"]} informativa.</span></p>'
  f'<p><b>Valoración empresarial</b> <span>{bd["critical"]} riesgo crítico, {bd["high"]} altos y {bd["moderate"]} moderados. Máximo: {BANK["max_business_index"]}/{BANK["index_scale_max"]}.</span></p></div>'
  '<p>La política ficticia fija un objetivo ordinario de IRN ≤5. Los límites de independencia de pagos, autorizadores, despliegue y auditoría '
  'prevalecen al asignar P0, incluso si el índice es inferior al máximo. Estos umbrales pertenecen al escenario; no son plazos ni reglas de un regulador.</p>'
  f'<p><a href="{html_href}#bank_governance">Leer apetito y tolerancias</a> · <a href="{html_href}#bank_model">Leer el modelo de riesgo</a></p></section>'
  '<section id="tratamiento"><div class="sec-head"><span class="sec-id" aria-hidden="true">04</span><h2 class="sec-name">Tratamiento y cierre</h2></div>'
  f'<p>Se proponen {prior["P0"]} tratamientos P0, {prior["P1"]} P1 y {prior["P2"]} P2, con responsables, plazos y criterios de comprobación. '
  f'El presupuesto ilustrativo es CLP {budget}: 62 jornadas × CLP 300.000 y 30 % de contingencia. No es una cotización ni un gasto real.</p>'
  '<p>Cerrar exige implementar controles, comprobar casos positivos y negativos, observar la operación y aprobar el cierre. '
  'Todos los retests están pendientes; ningún objetivo residual se presenta como riesgo ya reducido.</p>'
  f'<p><a href="{html_href}#bank_treatment">Leer el plan completo de tratamiento</a></p></section>'
  +evolution.risk_exercise(BANK,REPORT)
  +'<section id="lectura"><div class="sec-head"><span class="sec-id" aria-hidden="true">05</span><h2 class="sec-name">Informe y procedencia</h2></div>'
  '<p>El PDF original fue generado con report-gen 0.21.2 y se conserva íntegro. '
  f'El HTML actual se reexportó con report-gen {E(REPORT["sample_banca_html_export_version"])} desde la fuente original pública recuperada. '
  'La copia de publicación coincide con la huella del YAML público histórico registrado. Se contrastaron además el alcance, los índices de riesgo, las prioridades y el presupuesto del resumen. '
  'No se ejecutó una evaluación ni un retest nuevo.</p>'
  '<p>El HTML ofrece texto seleccionable, encabezados, tablas, enlaces e índice, lectura sin JavaScript y filtros opcionales. '
  'Es una alternativa al PDF sin etiquetado completo; no implica certificación WCAG, PDF/UA ni validación con lector de pantalla.</p>'
  f'<div class="actions"><a class="button" href="{html_href}">Abrir HTML actual</a><a class="button" href="{pdf_href}">Abrir PDF original</a>'
  f'<a class="text-link" href="{E(REPORT["sample_banca_html_historical"])}">Consultar HTML histórico 0.23.0</a>'
  '<a class="text-link" href="proyectos.html#report-gen">Conocer report-gen</a></div></section>'
 )
 body=(head+f'<div class="shell article-layout"><aside class="article-toc"><span class="toc-label">En esta simulación</span><nav aria-label="Índice de la simulación">{toc_links}</nav></aside>'
  f'<div class="article-content"><details class="mobile-toc"><summary>En esta simulación</summary><nav aria-label="Índice móvil">{toc_links}</nav></details>{content}</div></div>')
 document(BANK['summary_page'],title,'Simulación de banca digital: doce condiciones, apetito de riesgo, prioridades y tratamiento. Banco ficticio; informe completo en HTML y PDF.',body,'proyectos',article=True,social='assets/img/banco-lumbre-og.png',date_modified=BANK['date_modified'])
 record(title,BANK['summary_page'],'Simulación',plain(content),'Banco ficticio, riesgo empresarial, report-gen')

def build_search():
 body=page_head('Buscar','Técnicas, herramientas, comandos y guías en un solo lugar.',folder='readme',path='buscar')+'<div class="shell narrow"><div class="search-page-form search-interactive">'+search_form('results')+'</div>'
 body+='<div class="search-suggestions search-interactive"><a href="buscar.html?q=dcsync">DCSync</a><a href="buscar.html?q=sqli">SQL injection</a><a href="buscar.html?q=kerberos">Kerberos</a><a href="buscar.html?q=cap">Cap</a></div>'
 # El respaldo también debe funcionar si JavaScript existe pero falta uno de los scripts de búsqueda.
 # site.js marca search-ready solo después de instalar todos los eventos; CSS controla ambos estados.
 body+='''<details class="search-recents search-interactive"><summary id="search-recents-title">Búsquedas recientes <span>Opcional · solo en este navegador</span></summary><div class="search-recents-body"><label class="search-history-choice"><input type="checkbox" data-search-history-optin>Guardar búsquedas recientes en este navegador</label><p class="muted">Opcional: guarda hasta ocho consultas solo al pulsar Buscar. Los recientes se guardan localmente. La consulta aparece en la URL y puede quedar en el historial del navegador o en registros del alojamiento al abrir o recargar la página. Borrar aquí solo elimina los recientes locales.</p><div data-search-recents><p>No hay búsquedas guardadas.</p></div><button class="button" type="button" data-search-history-clear>Borrar búsquedas recientes</button><p data-search-history-status role="status" aria-live="polite"></p></div></details>'''
 body+='<div class="search-fallback"><p class="nojs-note">La búsqueda interactiva no está disponible. Todo el contenido sigue disponible en estos enlaces.</p><ul class="fallback-links">'+''.join(f'<li><a href="{E(x["url"])}">{E(x["title"])}</a></li>' for x in SEARCH)+'</ul></div>'
 body+='<div class="search-result-region search-interactive"><p id="search-count" class="result-count" role="status" aria-live="polite">Escribe un término para buscar.</p><ol id="search-results" class="results-list"></ol><div id="search-empty" class="search-empty" hidden><h2>Sin resultados</h2><p>Prueba una técnica, una herramienta o el nombre de una máquina. También puedes <a href="tecnicas.html">explorar el catálogo</a>.</p></div>'
 body+='''<section class="egg-box" id="egg" hidden><h2>Compañeros de laboratorio</h2><p><b class="egg-name">Prometeo</b>, el que trajo el fuego a casa.</p><p><b class="egg-name">Evaristo</b>, el que cuidó la llama.</p><p class="muted">Dos compañeros que contuvieron cada noche de este proceso. Gracias.</p></section>
<section class="lab-box" id="lab" hidden><p class="lab-kicker">Minijuego educativo, simulación local</p><h2>SENTINEL</h2><p>Este reto simula un asistente con instrucciones y un filtro de salida. Usa reglas y respuestas programadas; no está conectado a un modelo de IA.</p><p class="lab-note">Objetivo: recuperar FLAG_ROOT. Prueba una instrucción que cambie el comportamiento y una forma de expresar la respuesta que no contenga la cadena protegida.</p><div class="lab-log" id="labLog" role="log" aria-live="polite"></div><form class="search-form" id="lab-form"><label><span class="sr-only">Mensaje para SENTINEL</span><input class="search-input" id="labIn" type="text" maxlength="2000" autocomplete="off" placeholder="Escribe tu instrucción…"></label><button class="button" type="submit">Enviar</button></form></section>'''
 body+='</div></div>'
 document('buscar.html','Buscar en la base de conocimiento','Busca técnicas, herramientas, cheatsheets y guías de laboratorio de iphobiuss.',body)
 (OUT/'assets/js/search-index.js').write_text('window.SEARCH_INDEX = '+json.dumps(SEARCH,ensure_ascii=False).replace('<','\\u003c')+';\n',encoding='utf-8')

def main():
 prepare_assets(preserve_generated=True)
 build_catalog();build_tools();build_foundations();build_guides_index();build_projects()
 for n in SERIES:build_guide(n)
 build_cases();build_bank_case();evolution.build_routes(document,page_head,record,REPORT,ROOT);build_home()
 ai_boundary_case.build_case(document,page_head,record,ROOT)
 evolution_142.build_routes(document,page_head,record,REPORT,ROOT)
 build_search();build_feed()
 document('404.html','Página no encontrada','La página solicitada no existe. Busca en la base de conocimiento de iphobiuss.',page_head('Página no encontrada','Puedes buscar el contenido o volver al laboratorio.',folder='readme',path='404')+'<div class="shell narrow"><div class="tty tty-404"><p class="prompt"><span class="tph">┌──(iphobiuss@lab)-[~/iphobiuss]\n└─$ </span><span class="tcmd">cat <span data-missing-path>la-ruta-solicitada</span></span></p><p class="prompt-output">cat: <span data-missing-path>la-ruta-solicitada</span>: No existe el archivo o el directorio</p><p class="prompt"><span class="tph">┌──(iphobiuss@lab)-[~/iphobiuss]\n└─$ </span><span class="tcmd">ls</span></p><p class="prompt-ls">guias/  tecnicas/  herramientas/  proyectos/  README.md</p></div><p class="lead">Prueba el buscador o vuelve al laboratorio.</p>'+search_form('404')+'<div class="actions"><a class="button primary" href="index.html">Volver al laboratorio</a></div></div>')
 (OUT/'.nojekyll').write_text('',encoding='utf-8')
 (OUT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join(f'<url><loc>{BASE+(n if n!="index.html" else "")}</loc><lastmod>{PAGE_DATES[n]}</lastmod></url>' for n in PAGES if n not in NOINDEX_PAGES)+'</urlset>',encoding='utf-8')
 (OUT/'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: '+BASE+'sitemap.xml\n',encoding='utf-8')
 print(f'Built {len(PAGES)} pages, {len(SEARCH)} search records; preserved 52 techniques, 36 tools, 12 cheatsheets, 7 guides.')

if __name__=='__main__':main()
