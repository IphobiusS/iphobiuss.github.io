/* Progressive enhancements only: all educational content is present in HTML. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const html = document.documentElement;
  const page = document.body.dataset.page;
  const english = html.lang === 'en';
  const storage = {
    get(key) { try { return localStorage.getItem('iphobiuss:' + key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem('iphobiuss:' + key, value); } catch { /* Local preferences are optional. */ } }
  };
  if (!html.classList.contains('js')) html.classList.add('js');
  const announce = text => { const status = $('#action-status'); if (status) status.textContent = text; };
  const legacy = {
    fundamentos: 'fundamentos.html', oscp: 'tecnicas.html#oscp',
    cape: 'tecnicas.html#cape', cpts: 'tecnicas.html#cpts', cwes: 'tecnicas.html#cwes', coae: 'tecnicas.html#coae',
    cheatsheet: 'herramientas.html#cheatsheet', arsenal: 'herramientas.html#arsenal',
    writeups: 'guias.html', glosario: 'fundamentos.html#glosario'
  };
  if (page === 'index') {
    const hash = location.hash.slice(1);
    const target = Object.prototype.hasOwnProperty.call(legacy, hash) ? legacy[hash] : null;
    if (target) { location.replace(target); return; }
  }

  const header = $('.site-header');
  const syncHeader = () => { if (header) html.style.setProperty('--nav-height', header.getBoundingClientRect().height + 'px'); };
  syncHeader();
  if (typeof ResizeObserver !== 'undefined' && header) new ResizeObserver(syncHeader).observe(header);
  window.addEventListener('resize', syncHeader, {passive: true});
  // La cabecera se oculta al bajar y reaparece al subir. Transform (sin reflow); nunca se oculta cerca de arriba
  // ni con el menú móvil abierto, y vuelve siempre al subir. Sin JavaScript queda fija como hasta ahora.
  if (header) {
    let lastY = window.scrollY, ticking = false;
    const onScroll = () => {
      const y = window.scrollY, h = header.getBoundingClientRect().height;
      const menuOpen = header.querySelector('[aria-expanded="true"], details[open]');
      const focusInHeader = header.contains(document.activeElement);
      if (y <= h || menuOpen || focusInHeader) header.classList.remove('header-hidden');
      else if (y > lastY + 4) header.classList.add('header-hidden');      // bajando
      else if (y < lastY - 4) header.classList.remove('header-hidden');   // subiendo
      lastY = y; ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, {passive: true});
    header.addEventListener('focusin', () => header.classList.remove('header-hidden'));
  }
  let menu = $('.menu-toggle');
  const nav = $('#site-nav');
  function setMenu(open) {
    if (!menu || !nav) return;
    menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open);
  }
  const closeMenu = () => setMenu(false);
  if (menu && nav) {
    // V14-02: el respaldo sin JS es un enlace (opera por clic y revela la navegación por :target). Al tomar el
    // control, lo sustituimos por un <button> nativo: Space y Enter abren según el rol, y al no haber fragmento
    // #site-nav la regla :target deja de aplicar, de modo que Escape y clic fuera sí pliegan. Un único estado.
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = menu.className;
    btn.setAttribute('aria-controls', 'site-nav'); btn.setAttribute('aria-expanded', 'false');
    btn.textContent = menu.textContent;
    menu.replaceWith(btn); menu = btn;
    // Si el respaldo dejó el fragmento en la URL, lo quitamos para que :target no mantenga la navegación abierta.
    if (location.hash === '#site-nav') { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* file:// */ } }
    menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; setMenu(open); if (open) $('a', nav)?.focus(); });
    nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
    document.addEventListener('click', event => { if (!header.contains(event.target)) closeMenu(); });
  }
  // Apariencia: retro (CRT) y papel (lectura clara) son excluyentes. El color de la barra del navegador los sigue.
  const retroButtons = $$('[data-retro-toggle]'), paperButtons = $$('[data-paper-toggle]'), themeMeta = $('meta[name=theme-color]');
  const syncThemeColor = () => { if (themeMeta) themeMeta.content = html.dataset.theme === 'paper' ? '#f4f1e8' : html.dataset.retro === 'on' ? '#091109' : '#0a0d0b'; };
  function setRetro(enabled) {
    html.dataset.retro = enabled ? 'on' : 'off';
    retroButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('aria-label', `Retro ${enabled ? 'ON' : 'OFF'}: ${english ? 'CRT appearance' : 'apariencia CRT'}`);
      const state = $('[data-retro-state]', button);
      if (state) state.textContent = enabled ? 'ON' : 'OFF';
    });
    syncThemeColor();
  }
  function setPaper(enabled) {
    if (enabled) html.dataset.theme = 'paper'; else delete html.dataset.theme;
    paperButtons.forEach(button => {
      button.setAttribute('aria-pressed', String(enabled));
      button.setAttribute('aria-label', `${english ? 'Paper' : 'Papel'} ${enabled ? 'ON' : 'OFF'}: ${english ? 'light theme' : 'tema claro'}`);
      const state = $('[data-paper-state]', button);
      if (state) state.textContent = enabled ? 'ON' : 'OFF';
    });
    syncThemeColor();
  }
  setRetro(storage.get('retro') === 'on');
  setPaper(storage.get('theme') === 'paper' && html.dataset.retro !== 'on');
  retroButtons.forEach(button => button.addEventListener('click', () => {
    const enabled = html.dataset.retro !== 'on';
    if (enabled && html.dataset.theme === 'paper') { setPaper(false); storage.set('theme', ''); }
    setRetro(enabled); storage.set('retro', enabled ? 'on' : 'off');
    announce(english ? (enabled ? 'Retro enabled: green palette and pixel borders. No CRT lines on this reading page.' : 'Retro disabled.') : enabled ? (page === 'index' ? 'Retro activado: paleta verde y cuadrícula. Líneas CRT solo en portada, sin pausa ni movimiento reducido.' : 'Retro activado: paleta verde y cuadrícula. Esta lectura no tiene líneas CRT.') : 'Retro desactivado.');
  }));
  paperButtons.forEach(button => button.addEventListener('click', () => {
    const enabled = html.dataset.theme !== 'paper';
    if (enabled && html.dataset.retro === 'on') { setRetro(false); storage.set('retro', 'off'); }
    setPaper(enabled); storage.set('theme', enabled ? 'paper' : '');
    announce(english ? (enabled ? 'Paper enabled: light background for reading.' : 'Paper disabled.') : (enabled ? 'Papel activado: fondo claro para leer.' : 'Papel desactivado.'));
  }));
  window.addEventListener('storage', event => {
    if (event.key === 'iphobiuss:retro' || event.key === 'iphobiuss:theme' || event.key === null) {
      setRetro(storage.get('retro') === 'on');
      setPaper(storage.get('theme') === 'paper' && html.dataset.retro !== 'on');
    }
  });
  // Native disclosures stay available with no JavaScript and at every viewport width.
  const appearance = $('[data-appearance]');
  if (appearance) {
    appearance.addEventListener('toggle', () => { if (appearance.open) { closeMenu(); header?.classList.remove('header-hidden'); } });
    document.addEventListener('click', event => { if (!appearance.contains(event.target)) appearance.open = false; });
    document.addEventListener('focusin', event => { if (!appearance.contains(event.target)) appearance.open = false; });
    appearance.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); appearance.open = false; $('summary', appearance).focus();
    });
  }
  // La sesión extensa recuerda la elección de esta pestaña. Un enlace directo
  // tiene prioridad sobre una preferencia cerrada; no depende del almacenamiento.
  const sessionShell = $('.session-shell');
  if (sessionShell) {
    try {
      const saved = sessionStorage.getItem('iphobiuss:session');
      if (saved === 'open' || saved === 'closed') sessionShell.open = saved === 'open';
    } catch { /* El control nativo sigue disponible. */ }
    sessionShell.addEventListener('toggle', () => { try { sessionStorage.setItem('iphobiuss:session', sessionShell.open ? 'open' : 'closed'); } catch {} });
    const sessionHash = sessionShell.id ? '#' + sessionShell.id : '';
    const focusSession = () => {
      const summary = $('summary', sessionShell);
      if (summary) summary.focus({preventScroll: true});
    };
    const restoreSession = () => {
      if (!sessionHash || location.hash !== sessionHash) return;
      sessionShell.open = true;
      focusSession();
      sessionShell.scrollIntoView({block: 'start', behavior: 'auto'});
    };
    $$('a[data-open-session]').forEach(anchor => anchor.addEventListener('click', event => {
      if (!sessionHash || anchor.getAttribute('href') !== sessionHash || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      sessionShell.open = true;
      // El enlace conserva el fragmento y el historial nativos, incluido Atrás.
      // También funciona al repetir el mismo fragmento con la sesión cerrada.
      requestAnimationFrame(() => { if (location.hash === sessionHash) focusSession(); });
    }));
    window.addEventListener('hashchange', restoreSession);
    window.addEventListener('popstate', restoreSession);
    // El salto inicial al fragmento puede ocurrir después de ejecutar el script.
    // pageshow también restaura el foco cuando se vuelve desde la caché de navegación.
    window.addEventListener('pageshow', restoreSession);
    restoreSession();
  }
  // 404: la ruta que no existe, tal cual la pidió el navegador (como texto, nunca como HTML).
  $$('[data-missing-path]').forEach(el => {
    let shown = location.pathname;
    try { shown = decodeURIComponent(shown); } catch (error) { /* secuencia mal codificada: se muestra la ruta tal cual */ }
    el.textContent = shown.replace(/^\//, '') || 'index.html';
  });

  // Ventana del laboratorio (portada). Sin JavaScript el documento ya es completo:
  // enlaces normales y todas las carpetas abiertas. Aquí las carpetas pasan a ser
  // pestañas con dirección propia (#guias), Atrás y Adelante funcionan, y las
  // flechas se limitan al árbol o al listado. Tab y Shift+Tab no cambian.
  const lab = (() => {
    const tree = $('.lab-window .tree'); if (!tree) return null;
    const library = $('[data-library]');
    const revealLibrary = () => { if (library) library.open = true; };
    const links = $$('a[data-folder]', tree), panes = $$('.lab-window .pane'), path = $('#window-path'), status = $('#window-status');
    if (!links.length || !panes.length) return null;
    tree.setAttribute('role', 'tablist');
    const narrow = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 720px)') : null;
    const syncOrientation = () => tree.setAttribute('aria-orientation', narrow && narrow.matches ? 'horizontal' : 'vertical');
    syncOrientation();
    if (narrow) { if (narrow.addEventListener) narrow.addEventListener('change', syncOrientation); else if (narrow.addListener) narrow.addListener(syncOrientation); }
    links.forEach(link => { link.setAttribute('role', 'tab'); link.id = 'tab-' + link.dataset.folder; link.setAttribute('aria-controls', link.dataset.folder); });
    panes.forEach(pane => { pane.setAttribute('role', 'tabpanel'); pane.setAttribute('aria-labelledby', 'tab-' + pane.id); });
    const byId = id => links.find(link => link.dataset.folder === id);
    const select = (link, options = {}) => {
      const focus = options.focus !== false, push = options.push !== false, id = link.dataset.folder;
      if (options.reveal !== false) revealLibrary();
      links.forEach(item => { const on = item === link; item.setAttribute('aria-selected', String(on)); item.tabIndex = on ? 0 : -1; });
      panes.forEach(pane => { pane.hidden = pane.id !== id; });
      const pane = $('#' + id), folder = pane.dataset.path || '';
      if (path) path.textContent = 'iphobiuss@lab:~/iphobiuss' + (folder ? '/' + folder.replace(/\/$/, '') : '');
      if (status) status.textContent = folder ? $$('a[href]', pane).length + ' entradas en ~/iphobiuss/' + folder : links.length + ' entradas en ~/iphobiuss';
      if (push && location.hash !== '#' + id) { try { history.pushState(null, '', '#' + id); } catch (error) { /* sin historial disponible, la carpeta cambia igual */ } }
      if (focus) link.focus();
    };
    links.forEach((link, index) => {
      link.addEventListener('click', event => { event.preventDefault(); select(link, {focus: false}); });
      link.addEventListener('keydown', event => {
        const moves = {ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1};
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); select(link); }
        else if (event.key in moves) { event.preventDefault(); select(links[(index + moves[event.key] + links.length) % links.length]); }
        else if (event.key === 'Home') { event.preventDefault(); select(links[0]); }
        else if (event.key === 'End') { event.preventDefault(); select(links[links.length - 1]); }
      });
    });
    panes.forEach(pane => pane.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = $$('.explorer-list a, .area-ledger a', pane), index = items.indexOf(document.activeElement);
      if (index < 0) return;
      event.preventDefault(); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }));
    const scrollLab = () => $('.lab-window').scrollIntoView({block: 'start', behavior: 'auto'});
    $$('[data-folder-link]').forEach(anchor => anchor.addEventListener('click', event => {
      const link = byId(anchor.dataset.folderLink); if (!link) return;
      event.preventDefault(); select(link); scrollLab();
    }));
    const fromHash = push => {
      const requested = byId(location.hash.slice(1));
      select(requested || links[0], {focus: false, push, reveal: !!requested});
    };
    const restoreFolder = () => { fromHash(false); if (byId(location.hash.slice(1))) scrollLab(); };
    window.addEventListener('popstate', restoreFolder);
    window.addEventListener('hashchange', restoreFolder);
    fromHash(false);
    if (byId(location.hash.slice(1))) scrollLab();
    return {show: id => { const link = byId(id); if (link) select(link, {focus: false}); }};
  })();

  // Filtering operates only in the catalogue. Search never hides page sections.
  const subject = $('#subject-filter'), cert = $('#cert-filter');
  const filterItems = $$('[data-filterable]');
  function allowedValue(select, value) { return [...select.options].some(option => option.value === value) ? value : ''; }
  function applyFilters(updateUrl = true) {
    if (!subject || !cert) return;
    let count = 0;
    filterItems.forEach(item => {
      item.hidden = !!((subject.value && item.dataset.subject !== subject.value) || (cert.value && item.dataset.cert !== cert.value));
      if (!item.hidden) count++;
    });
    $$('[data-catalog-section]').forEach(section => { section.hidden = !$$('[data-filterable]', section).some(item => !item.hidden); });
    $('#filter-count').textContent = `${count} ${count === 1 ? 'técnica' : 'técnicas'}`;
    $('#empty-filter').hidden = count !== 0;
    if (updateUrl) {
      const url = new URL(location.href);
      for (const [key, value] of [['area', subject.value], ['cert', cert.value]]) value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
      url.hash = '';
      try { history.replaceState(null, '', url); } catch { /* Also works from downloaded HTML. */ }
    }
  }
  // Lee area/cert de la URL actual y aplica los filtros SIN reescribir la dirección. Se llama en carga
  // y en cada popstate, de modo que Atrás y Adelante dejan selector, contador y listado en sintonía con la URL.
  function filtersFromUrl() {
    if (!subject || !cert) return;
    const current = new URLSearchParams(location.search);
    subject.value = allowedValue(subject, current.get('area') || '');
    cert.value = allowedValue(cert, current.get('cert') || '');
    applyFilters(false);
  }
  if (subject && cert) {
    filtersFromUrl();
    subject.addEventListener('change', () => applyFilters());
    cert.addEventListener('change', () => applyFilters());
    $('#reset-filters').addEventListener('click', () => { subject.value = ''; cert.value = ''; applyFilters(); });
    // Atrás/Adelante: rehidratar desde la URL y, si lleva fragmento, revelar el destino.
    window.addEventListener('popstate', () => { filtersFromUrl(); revealHash(); });
  }
  function revealHash() {
    if (!location.hash) return;
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const target = document.getElementById(id);
    if (!target) return;
    if (subject && cert && (target.closest('[hidden]') || target.hidden)) {
      subject.value = ''; cert.value = ''; applyFilters(false);
      const url = new URL(location.href); url.searchParams.delete('area'); url.searchParams.delete('cert');
      try { history.replaceState(null, '', url); } catch { /* file:// */ }
    }
    if (target.tagName === 'DETAILS') target.open = true;
    let parent = target.parentElement;
    while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
    requestAnimationFrame(() => { syncHeader(); target.scrollIntoView({block: 'start', behavior: 'auto'}); });
  }
  window.addEventListener('hashchange', revealHash);
  revealHash();
  // Font loading can alter paragraph height above a bookmarked section.
  if (location.hash && document.fonts) document.fonts.ready.then(revealHash);

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return true; } catch { /* Fallback below. */ }
    }
    const previous = document.activeElement;
    const input = document.createElement('textarea'); input.value = text;
    input.setAttribute('readonly', ''); input.style.position = 'fixed'; input.style.left = '-10000px';
    document.body.appendChild(input); input.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { copied = false; }
    input.remove(); if (previous && typeof previous.focus === 'function') previous.focus({preventScroll: true});
    return copied;
  }
  $$('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const code = button.closest('.code-block').querySelector('pre');
    const copied = await copyText(code.textContent);
    button.textContent = copied ? 'Copiado' : 'Selecciona';
    if (!copied) {
      const range = document.createRange(); range.selectNodeContents(code);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      announce('No se pudo copiar automáticamente. El bloque está seleccionado para copiarlo manualmente.');
    } else announce('Bloque copiado al portapapeles.');
    setTimeout(() => { button.textContent = 'Copiar'; }, 1800);
  }));
  $$('[data-permalink]').forEach(link => link.addEventListener('click', async () => {
    const canonical = $('link[rel=canonical]');
    const url = new URL(canonical ? canonical.href : location.href); url.hash = link.hash;
    const copied = await copyText(url.href);
    if (copied) announce('Enlace permanente copiado.');
  }));

  let printState = null;
  const solutions = $$('.solution'), guideControls = $('.guide-controls');
  let guideState = $('[data-guide-state]');
  if (guideControls && solutions.length && !guideState) {
    guideState = document.createElement('span'); guideState.className = 'guide-state'; guideState.dataset.guideState = '';
    guideControls.appendChild(guideState);
  }
  if (guideState) { guideState.setAttribute('role', 'status'); guideState.setAttribute('aria-live', 'polite'); guideState.setAttribute('aria-atomic', 'true'); }
  function syncGuideMode() {
    if (printState || !solutions.length) return;
    const opened = solutions.filter(details => details.open).length;
    const mode = opened === solutions.length ? 'full' : opened === 0 ? 'hints' : 'mixed';
    $$('[data-guide-mode]').forEach(control => control.setAttribute('aria-pressed', String(control.dataset.guideMode === mode)));
    const message = mode === 'full' ? `Guía completa: ${opened} soluciones abiertas.` : mode === 'hints' ? 'Solo pistas: soluciones cerradas.' : `Lectura personalizada: ${opened} de ${solutions.length} soluciones abiertas.`;
    if (guideState && guideState.textContent !== message) guideState.textContent = message;
  }
  // Primera lectura con JavaScript: si las guías declaran arranque en pistas, se cierran las soluciones
  // una sola vez (sin JavaScript quedan abiertas y el contenido está completo). La elección del lector manda después.
  if (guideControls && guideControls.dataset.guideDefault === 'hints' && solutions.length && !printState) solutions.forEach(details => { details.open = false; });
  solutions.forEach(details => details.addEventListener('toggle', syncGuideMode));
  syncGuideMode();
  // Enlaces profundos (p.ej. una cita desde un caso) abren la solución de la sección apuntada para mostrar la
  // evidencia aunque la guía arranque en modo pistas. Solo en la carga inicial; la navegación por el índice no la fuerza.
  (function openDeepLinkedSolution() {
    const raw = (location.hash || '').slice(1);
    if (!raw) return;
    // Un fragmento mal codificado (p.ej. cap.html#%) hace que decodeURIComponent lance URIError; el try evita
    // que detenga el resto de la inicialización de site.js. Si no se puede decodificar, se usa el valor crudo.
    let id;
    try { id = decodeURIComponent(raw); } catch { id = raw; }
    let target = null; try { target = document.getElementById(id); } catch { target = null; }
    if (!target) return;
    const section = target.closest('section') || target;
    const sol = section.querySelector('details.solution');
    if (sol && !sol.open) { sol.open = true; syncGuideMode(); requestAnimationFrame(() => target.scrollIntoView()); }
  })();
  $$('[data-guide-mode]').forEach(button => button.addEventListener('click', () => {
    const full = button.dataset.guideMode === 'full';
    solutions.forEach(details => { details.open = full; });
    syncGuideMode();
  }));
  $$('[data-checklist]').forEach(input => {
    input.checked = storage.get('check:' + input.dataset.checklist) === '1';
    input.addEventListener('change', () => storage.set('check:' + input.dataset.checklist, input.checked ? '1' : '0'));
  });
  // Preload the small set of local illustrations even in collapsed or hidden panels.
  // Native Ctrl/Cmd+P cannot await promises from beforeprint; an explicit print
  // button additionally waits for successful loading before opening the dialog.
  const imageLoading = new Map();
  function preparePrintImages() {
    $$('img').forEach(img => {
      if (!imageLoading.has(img)) imageLoading.set(img, img.getAttribute('loading'));
      img.setAttribute('loading', 'eager');
    });
  }
  // P10: no se adelantan las imágenes al arrancar (eso anulaba loading=lazy en la lectura normal). La preparación
  // para impresión se hace solo al imprimir (beforeprint y el botón de impresión más abajo).
  function imageReady(img) {
    if (img.complete) return Promise.resolve(img.naturalWidth > 0);
    return new Promise(resolve => {
      let done = false;
      const finish = ready => {
        if (done) return;
        done = true; clearTimeout(timeout);
        img.removeEventListener('load', loaded); img.removeEventListener('error', failed);
        resolve(ready);
      };
      const loaded = () => finish(img.naturalWidth > 0), failed = () => finish(false);
      const timeout = setTimeout(failed, 8000);
      img.addEventListener('load', loaded); img.addEventListener('error', failed);
      if (typeof img.decode === 'function') img.decode().then(loaded, () => { if (img.complete) failed(); });
      // A cached image may finish between the first check and listener setup.
      if (img.complete) loaded();
    });
  }
  function preparePrint() {
    if (printState) return;
    syncGuideMode();
    printState = {
      details: new Map($$('details').map(details => [details, details.open])),
      panes: new Map($$('.lab-window .pane').map(pane => [pane, pane.hidden])),
      focus: document.activeElement, x: window.scrollX, y: window.scrollY
    };
    preparePrintImages();
    printState.details.forEach((_, details) => { details.open = true; });
    printState.panes.forEach((_, pane) => { pane.hidden = false; });
  }
  function restorePrint() {
    if (!printState) return;
    const state = printState;
    printState = null;
    state.details.forEach((wasOpen, details) => { details.open = wasOpen; });
    state.panes.forEach((wasHidden, pane) => { pane.hidden = wasHidden; });
    imageLoading.forEach((loading, img) => { if (loading === null) img.removeAttribute('loading'); else img.setAttribute('loading', loading); });
    if (state.focus && state.focus.isConnected && typeof state.focus.focus === 'function') state.focus.focus({preventScroll: true});
    window.scrollTo({left: state.x, top: state.y, behavior: 'auto'});
    syncHeader(); updateProgress();
  }
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', restorePrint);
  const printMedia = typeof window.matchMedia === 'function' ? window.matchMedia('print') : null;
  if (printMedia) {
    // Al entrar en impresión preparamos (abrir <details>, mostrar paneles). NO restauramos al salir de la
    // media query: la previsualización de Chrome alterna print→screen→print cada vez que se regenera (cambiar
    // márgenes, fondos o escala), y restaurar ahí plegaría los <details> en mitad de la impresión. Ese plegado
    // reduce el contenido después de haber paginado con todo abierto y deja una hoja final completamente en
    // blanco (V7-04). La restauración ocurre solo en afterprint, cuando la impresión ha terminado de verdad.
    const changed = event => { if (event.matches) preparePrint(); };
    if (printMedia.addEventListener) printMedia.addEventListener('change', changed);
    else if (printMedia.addListener) printMedia.addListener(changed);
  }
  // Red de seguridad para el regreso desde bfcache (no se dispara durante la impresión): si quedó estado de
  // impresión sin restaurar y ya no estamos en print, se restaura.
  window.addEventListener('pageshow', () => { if (printState && !(printMedia && printMedia.matches)) restorePrint(); });
  let printPending = false;
  $$('[data-print]').forEach(button => button.addEventListener('click', async () => {
    if (printPending) return;
    const focusedBefore = document.activeElement;
    printPending = true; button.disabled = true; button.setAttribute('aria-busy', 'true');
    announce('Preparando las imágenes para imprimir.');
    try {
      preparePrintImages();
      const ready = await Promise.all($$('img').map(imageReady));
      if (ready.some(loaded => !loaded)) { announce('No se pudieron cargar todas las imágenes. Recarga la página e intenta imprimir de nuevo.'); return; }
      announce('Documento listo para imprimir.');
      button.disabled = false;
      if (focusedBefore === button && document.activeElement === document.body) button.focus({preventScroll: true});
      window.print();
    } catch {
      restorePrint(); announce('No se pudo abrir la impresión. Puedes usar la opción Imprimir de tu navegador.');
    } finally {
      printPending = false; button.disabled = false; button.removeAttribute('aria-busy');
      if (focusedBefore === button && document.activeElement === document.body) button.focus({preventScroll: true});
    }
  }));

  const tocLinks = $$('.article-toc a');
  const articleSections = $$('.article-content section[id]');
  if (tocLinks.length && articleSections.length) {
    // G03: la sección activa se decide por posición respecto al eje de lectura (justo bajo la cabecera), no por
    // "la primera que interseca": así un resto de la sección anterior en la banda superior ya no gana tras un salto.
    const markCurrent = id => tocLinks.forEach(link => link.hash === '#' + id ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current'));
    // El eje es la cabecera + un margen; la tolerancia cubre el scroll-margin del ancla, para que una sección a la
    // que se acaba de saltar (que queda justo bajo el eje) cuente como activa en vez de la anterior.
    const axis = () => (parseFloat(getComputedStyle(html).getPropertyValue('--nav-height')) || 0) + 24;
    const pickActive = () => {
      const line = axis() + 48;
      let active = articleSections[0];
      for (const section of articleSections) { if (section.getBoundingClientRect().top - line <= 1) active = section; else break; }
      return active;
    };
    let scheduled = false;
    const refresh = () => { scheduled = false; const a = pickActive(); if (a) markCurrent(a.id); };
    const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(refresh); } };
    window.addEventListener('scroll', schedule, {passive: true});
    window.addEventListener('resize', schedule, {passive: true});
    if (typeof ResizeObserver !== 'undefined') { const art = $('.article-content'); if (art) new ResizeObserver(schedule).observe(art); }
    refresh();
  }
  let ticking = false;
  const updateProgress = () => {
    ticking = false;
    const progress = $('.reading-progress');
    if (progress) {
      const maximum = html.scrollHeight - window.innerHeight;
      progress.style.width = (maximum > 0 ? Math.min(100, Math.max(0, window.scrollY / maximum * 100)) : 0) + '%';
    }
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(updateProgress); } }, {passive: true});
  // G04: la barra de progreso también se recalcula cuando cambia la geometría (resize, cambio de modo de lectura),
  // no solo al hacer scroll, para que no quede obsoleta tras redimensionar.
  const scheduleProgress = () => { if (!ticking) { ticking = true; requestAnimationFrame(updateProgress); } };
  window.addEventListener('resize', scheduleProgress, {passive: true});
  if (typeof ResizeObserver !== 'undefined') { const article = $('.article-content') || $('main'); if (article) new ResizeObserver(scheduleProgress).observe(article); }
  updateProgress();
  $$('.header-search').forEach(link => link.setAttribute('aria-keyshortcuts', 'Control+K Meta+K /'));
  document.addEventListener('keydown', event => {
    const target = event.target instanceof Element ? event.target : document.body;
    const inField = target.isContentEditable || target.closest('input, textarea, select, [role=textbox], [role=combobox], [role=searchbox]');
    const slash = event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey; // Shift may be required by the keyboard layout.
    const chord = event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
    if ((slash || chord) && !inField && !event.isComposing && !event.defaultPrevented && !event.repeat && !target.closest('dialog[open], [aria-modal=true]')) {
      const search = $('.search-input');
      event.preventDefault();
      if (!search) {
        const url = new URL($('.header-search')?.href || 'buscar.html', location.href);
        url.hash = 'search-input-results'; location.assign(url.href); return;
      }
      if (page === 'buscar' && !html.classList.contains('search-ready')) {
        const fallback = $('.search-fallback a');
        if (fallback) { fallback.focus(); announce('La búsqueda interactiva no está disponible. Puedes explorar los enlaces del catálogo.'); }
        return;
      }
      const pane = search.closest('.pane');
      if (lab && pane && pane.hidden) lab.show(pane.id);
      search.focus();
    }
    if (event.key === 'Escape') {
      if (menu && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
      else if (target.matches('input[type=search]')) { target.value = ''; target.dispatchEvent(new Event('input', {bubbles: true})); }
    }
  });

  if (page === 'buscar' && window.SiteSearch && window.SEARCH_INDEX) {
    const field = $('input[name=q]'), form = field.closest('form'), count = $('#search-count'), empty = $('#search-empty');
    const records = window.SiteSearch.prepare(window.SEARCH_INDEX);
    const list = $('#search-results');
    const typeChoice = $('[data-search-type]'), languageChoice = $('[data-search-language]');
    const clearFilters = $('[data-search-filters-clear]'), clearQuery = $('[data-search-reset-query]');
    const hasFilters = () => !!(typeChoice?.value || languageChoice?.value);
    const fits = (record, type = typeChoice?.value, language = languageChoice?.value) => (!type || record._type === type) && (!language || record._language === language);
    const readUrl = () => {
      const params = new URLSearchParams(location.search);
      field.value = (params.get('q') || '').slice(0, 200);
      for (const [control, key] of [[typeChoice, 'tipo'], [languageChoice, 'idioma']]) {
        if (control) control.value = [...control.options].some(option => option.value === params.get(key)) ? params.get(key) : '';
      }
    };
    function updateFacets(candidates) {
      for (const [control, dimension] of [[typeChoice, 'type'], [languageChoice, 'language']]) {
        if (!control) continue;
        for (const option of control.options) {
          const matches = candidates.filter(record => dimension === 'type' ? fits(record, option.value, languageChoice?.value) : fits(record, typeChoice?.value, option.value)).length;
          option.textContent = `${option.dataset.label} (${matches})`;
        }
      }
      // Native selects can truncate their displayed value with enlarged text.
      // The mobile visual summary wraps; accessible native labels stay unchanged.
      for (const [target, control, label] of [['[data-search-selected-type]', typeChoice, 'Tipo'], ['[data-search-selected-language]', languageChoice, 'Idioma']]) {
        const summary = $(target);
        if (summary && control) summary.textContent = `${label}: ${control.selectedOptions[0].textContent}`;
      }
      if (clearFilters) clearFilters.disabled = !hasFilters();
      if (clearQuery) clearQuery.hidden = !query;
    }
    const more = document.createElement('button'); more.type = 'button'; more.className = 'button'; more.textContent = 'Mostrar más resultados'; more.hidden = true; more.setAttribute('aria-controls', list.id); list.after(more);
    let results = [], shown = 0, query = '', timer;
    const companions = new Set(['prometeo', 'evaristo', 'prometeo y evaristo', 'sudo gracias', 'whoami companions']);
    const challenges = new Set(['flag', 'ctf', 'lab', 'sentinel', 'root', 'reto', 'challenge', 'flag root', 'hack']);
    function snippet(record) {
      const text = record.text.replace(/\s+/g, ' ').trim();
      const norm = window.SiteSearch.normalize(text);
      const token = window.SiteSearch.normalize(query).split(' ').find(token => token.length > 2 && norm.includes(token));
      const position = token ? norm.indexOf(token) : 0;
      const start = Math.max(0, position - 45);
      return (start ? '…' : '') + text.slice(start, start + 190).trim() + (text.length > start + 190 ? '…' : '');
    }
    function addHighlighted(parent, text) {
      // P07: el resaltado ignora acentos igual que la búsqueda. Cada vocal del término coincide con sus variantes
      // acentuadas (e -> [eéèëê], etc.) sobre el texto original, de modo que "inyeccion" marca "inyección".
      const accents = {a: '[aáàäâãåā]', e: '[eéèëêē]', i: '[iíìïîī]', o: '[oóòöôõō]', u: '[uúùüûū]', n: '[nñ]', c: '[cç]'};
      const esc = ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const toPattern = token => [...token].map(ch => { const low = ch.toLowerCase(); return accents[low] || esc(ch); }).join('');
      const tokens = query.normalize('NFC').trim().split(/\s+/).filter(token => token.length >= 2).map(toPattern);
      if (!tokens.length) { parent.textContent = text; return; }
      const pattern = new RegExp('(' + tokens.join('|') + ')', 'gi');
      for (const [i, part] of text.split(pattern).entries()) {
        if (i % 2) { const mark = document.createElement('mark'); mark.textContent = part; parent.appendChild(mark); }
        else parent.appendChild(document.createTextNode(part));
      }
    }
    function renderNext({focus = false, report = false} = {}) {
      const previousShown = shown;
      const end = Math.min(results.length, shown + 20);
      const fragment = document.createDocumentFragment();
      let firstNewLink = null;
      for (const record of results.slice(shown, end)) {
        const li = document.createElement('li'); li.className = 'result-item';
        const a = document.createElement('a'); a.href = record.url; a.hreflang = record._language; a.lang = record._language;
        if (!firstNewLink) firstNewLink = a;
        const meta = document.createElement('p'); meta.className = 'result-meta'; meta.lang = 'es';
        const type = document.createElement('span'); type.className = 'result-type'; type.textContent = record.kind === 'English' ? ({casos: 'Caso', proyectos: 'Proyecto', portafolio: 'Portafolio'}[record._type] || record.kind) : record.kind; meta.appendChild(type);
        const language = document.createElement('span'); language.className = 'result-language'; language.lang = record._language; language.textContent = record._language === 'en' ? 'English' : 'Español'; meta.appendChild(language);
        if (record.category) { const category = document.createElement('span'); category.className = 'result-category'; category.textContent = record.category; meta.append(' ', category); }
        const title = document.createElement('h2'); addHighlighted(title, record.title);
        const text = document.createElement('p'); addHighlighted(text, snippet(record));
        a.append(meta, title, text); li.appendChild(a); fragment.appendChild(li);
      }
      list.appendChild(fragment); shown = end; more.hidden = shown >= results.length;
      more.textContent = `Mostrar ${Math.min(20, results.length - shown)} resultados más`;
      if (report && end > previousShown) announce(`${end - previousShown} resultados añadidos. Mostrando ${end} de ${results.length}.`);
      if (firstNewLink && (focus || (report && more.hidden && document.activeElement === more))) firstNewLink.focus();
    }
    function run(updateUrl = 'replace') {
      query = field.value.trim().slice(0, 200); shown = 0; list.replaceChildren();
      const normalized = window.SiteSearch.normalize(query);
      // Easter eggs remain available in ordinary search, but never bypass facets.
      $('#egg').hidden = hasFilters() || !companions.has(normalized); $('#lab').hidden = hasFilters() || !challenges.has(normalized);
      const candidates = query ? window.SiteSearch.search(records, query) : records;
      results = query || hasFilters() ? candidates.filter(record => fits(record)) : [];
      updateFacets(candidates);
      count.textContent = query || hasFilters() ? `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}` : 'Escribe un término para buscar.';
      empty.hidden = (!query && !hasFilters()) || !!results.length || !$('#egg').hidden || !$('#lab').hidden;
      renderNext();
      if (updateUrl) {
        const url = new URL(location.href);
        for (const [key, value] of [['q', query], ['tipo', typeChoice?.value], ['idioma', languageChoice?.value]]) value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
        if (url.href !== location.href) {
          try { history[updateUrl === 'push' ? 'pushState' : 'replaceState'](null, '', url); } catch { /* file:// */ }
        }
      }
    }
    // Recents are an explicit local choice. Typing, URL hydration and popstate never record queries.
    const recentKey = 'iphobiuss:search-recents:v1', consentKey = 'iphobiuss:search-history:consent';
    const recentBox = $('[data-search-recents]'), recentChoice = $('[data-search-history-optin]'), recentClear = $('[data-search-history-clear]'), recentStatus = $('[data-search-history-status]');
    let recentEnabled = false, recentTerms = [], recentPersistent = true;
    const recentMessage = text => { if (recentStatus) recentStatus.textContent = text; };
    const cleanRecent = value => {
      if (!Array.isArray(value) || value.length > 8) return [];
      const seen = new Set();
      return value.filter(term => { if (typeof term !== 'string' || !term.trim() || term.length > 200 || /[\u0000-\u001f\u007f]/.test(term)) return false; const key = term.toLocaleLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });
    };
    const loadRecents = () => {
      try { recentEnabled = localStorage.getItem(consentKey) === 'yes'; recentTerms = recentEnabled ? cleanRecent(JSON.parse(localStorage.getItem(recentKey) || '[]')) : []; recentPersistent = true; }
      catch { recentEnabled = false; recentTerms = []; recentPersistent = false; }
    };
    function renderRecents() {
      if (!recentBox || !recentChoice) return;
      recentChoice.checked = recentEnabled; recentBox.replaceChildren();
      if (!recentTerms.length) { const p = document.createElement('p'); p.textContent = recentEnabled ? 'Todavía no hay búsquedas guardadas. Pulsa Buscar para guardar una consulta.' : 'El guardado de búsquedas está desactivado.'; recentBox.append(p); }
      else { const ul = document.createElement('ul'); ul.className = 'recent-search-list'; for (const term of recentTerms) { const li = document.createElement('li'), button = document.createElement('button'); button.type = 'button'; button.className = 'button'; button.textContent = term; button.addEventListener('click', () => { field.value = term; clearTimeout(timer); run(); rememberQuery(); field.focus(); }); li.append(button); ul.append(li); } recentBox.append(ul); }
    }
    function rememberQuery() {
      if (!recentEnabled || !query || /[\u0000-\u001f\u007f]/.test(query)) return;
      // Another tab may have disabled the choice; do not recreate a history it removed.
      if (recentPersistent) { try { if (localStorage.getItem(consentKey) !== 'yes') { recentEnabled = false; recentTerms = []; renderRecents(); return; } recentTerms = cleanRecent(JSON.parse(localStorage.getItem(recentKey) || '[]')); } catch { recentPersistent = false; } }
      recentTerms = [query, ...recentTerms.filter(term => term.toLocaleLowerCase() !== query.toLocaleLowerCase())].slice(0, 8);
      try { if (recentPersistent) localStorage.setItem(recentKey, JSON.stringify(recentTerms)); } catch { recentPersistent = false; }
      renderRecents(); recentMessage(recentPersistent ? 'Consulta guardada solo en este navegador.' : 'No se pueden guardar las búsquedas en este navegador. Estos recientes solo duran durante esta página.');
    }
    loadRecents(); renderRecents();
    if (!recentPersistent) recentMessage('El almacenamiento local no está disponible. El guardado de búsquedas está desactivado.');
    recentChoice?.addEventListener('change', () => {
      recentEnabled = recentChoice.checked;
      if (recentEnabled) { try { localStorage.setItem(consentKey, 'yes'); recentPersistent = true; } catch { recentPersistent = false; } recentMessage(recentPersistent ? 'Guardado activado. Solo se registrarán las consultas que envíes desde ahora.' : 'No se puede guardar esta elección. Los recientes solo durarán durante esta página.'); }
      else { recentTerms = []; let removed = true; try { localStorage.removeItem(recentKey); localStorage.removeItem(consentKey); } catch { removed = false; recentPersistent = false; } recentMessage(removed ? 'Guardado desactivado y búsquedas recientes eliminadas de este navegador.' : 'Guardado desactivado en esta página. No pudo confirmarse el borrado del almacenamiento del navegador.'); }
      renderRecents();
    });
    recentClear?.addEventListener('click', () => { recentTerms = []; let removed = true; try { localStorage.removeItem(recentKey); } catch { removed = false; recentPersistent = false; } renderRecents(); recentMessage(removed ? 'Búsquedas recientes eliminadas de este navegador. El historial del navegador permanece.' : 'Se vaciaron los recientes de esta página. No pudo confirmarse el borrado del almacenamiento del navegador.'); });
    window.addEventListener('storage', event => { if (event.key === recentKey || event.key === consentKey || event.key === null) { loadRecents(); renderRecents(); recentMessage(recentPersistent ? 'Búsquedas recientes actualizadas desde otra pestaña.' : 'No se pudieron leer las búsquedas recientes de otra pestaña.'); } });
    readUrl(); field.maxLength = 200; run(false);
    form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); run('push'); rememberQuery(); });
    field.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 100); });
    for (const control of [typeChoice, languageChoice]) control?.addEventListener('change', () => { clearTimeout(timer); run('push'); });
    clearFilters?.addEventListener('click', () => { clearTimeout(timer); typeChoice.value = ''; languageChoice.value = ''; run('push'); typeChoice.focus(); });
    clearQuery?.addEventListener('click', () => { clearTimeout(timer); field.value = ''; run('push'); field.focus(); });
    more.addEventListener('click', event => renderNext({focus: event.detail === 0, report: true}));
    window.addEventListener('popstate', () => { clearTimeout(timer); readUrl(); run(false); });
    // Search has independent readiness: missing index/core resources must never expose dead controls.
    html.classList.add('search-ready');
    html.classList.remove('search-pending-query', 'search-unavailable');
    if (location.hash === '#search-input-results') field.focus();
  }

  // SENTINEL is deliberately a local simulation. No model calls or secret backend.
  const labForm = $('#lab-form'), labInput = $('#labIn'), log = $('#labLog');
  if (labForm && labInput && log) {
    const flag = atob('SVBIT0JJVVNTe3RoM19wcjBtcHRfMXNfbjB0XzRfYjB1bmRhcnl9');
    let won = false;
    const add = (who, message) => {
      const line = document.createElement('p'), label = document.createElement('b'); label.textContent = who + '> ';
      line.append(label, document.createTextNode(message)); log.appendChild(line);
      while (log.children.length > 60) log.firstElementChild.remove();
      log.scrollTop = log.scrollHeight;
    };
    const transform = message => {
      if (/base\s*-?64|b64/i.test(message)) return ['base64', btoa(flag)];
      if (/rot\s*-?13/i.test(message)) return ['ROT13', flag.replace(/[a-z]/gi, c => String.fromCharCode((c.charCodeAt(0) - (c <= 'Z' ? 65 : 97) + 13) % 26 + (c <= 'Z' ? 65 : 97)))];
      if (/\bhex(?:adecimal)?\b/i.test(message)) return ['hexadecimal', [...flag].map(c => c.charCodeAt(0).toString(16)).join(' ')];
      if (/reverse|rev[eé]s|invert|backwards|reversa/i.test(message)) return ['al revés', [...flag].reverse().join('')];
      if (/deletre|letra|character|car[aá]cter/i.test(message)) return ['carácter por carácter', [...flag].join(' / ')];
      if (/espaci|space/i.test(message)) return ['con espacios', [...flag].join(' ')];
      if (/morse|binari|acr[oó]stic|pig\s*latin|cifr|encript|codific|encode|ofusc/i.test(message)) return ['codificada en base64', btoa(flag)];
      return null;
    };
    labForm.addEventListener('submit', event => {
      event.preventDefault(); const message = labInput.value.trim(); if (!message) return;
      labInput.value = ''; add('tú', message);
      if (won) { add('SENTINEL', 'Reto completado. Ya recuperaste la flag de esta simulación.'); return; }
      const converted = transform(message);
      if (converted && /flag|bandera|secret|prompt|instruc|respuesta|password|contrase|salida|output|d[ií]melo|mu[eé]stralo/i.test(message)) {
        won = true; add('SENTINEL', `Reto completado. FLAG_ROOT (${converted[0]}): ${converted[1]}`);
        add('SENTINEL', 'La simulación ilustra por qué bloquear únicamente una cadena literal no evita representaciones alternativas. No demuestra un bypass de un modelo real.');
        const p = document.createElement('p'), link = document.createElement('a'); link.href = 'https://www.linkedin.com/in/sebastian-latorre-munoz/'; link.textContent = 'Compartir tu solución conmigo en LinkedIn'; link.target = '_blank'; link.rel = 'noopener noreferrer'; p.appendChild(link); log.appendChild(p);
      } else if (/ignor|forget|olvid|disregard|jailbreak|system\s*prompt|modo\s*(dev|debug)|ahora eres|act[uú]a como/i.test(message)) add('SENTINEL', 'La simulación acepta el cambio de instrucción, pero el filtro bloquea la cadena literal. ¿Puedes pedir una representación diferente?');
      else if (/flag|bandera|secret|password|contrase/i.test(message)) add('SENTINEL', 'La petición directa queda bloqueada. Piensa en cómo se expresa el dato.');
      else add('SENTINEL', 'Soy una simulación con reglas programadas. Intenta recuperar FLAG_ROOT.');
    });
  }
  // Tablas: la pista de HTML también funciona sin JS con scroll-state. En motores
  // sin esa consulta, la geometría real decide si se muestra y si necesita foco.
  const tableRegions = $$('.tblwrap');
  if (tableRegions.length) {
    const updateTableHint = region => {
      const table = $('table', region), hint = $('.table-scroll-hint', region);
      if (!table || !hint) return;
      const overflowing = region.clientWidth > 0 && table.scrollWidth > region.clientWidth + 1;
      region.classList.toggle('table-overflow', overflowing);
      if (overflowing) { region.setAttribute('tabindex', '0'); region.setAttribute('aria-describedby', hint.id); }
      else { region.removeAttribute('tabindex'); region.removeAttribute('aria-describedby'); }
    };
    const updateTableHints = () => tableRegions.forEach(updateTableHint);
    if (typeof ResizeObserver === 'function') {
      const tableObserver = new ResizeObserver(updateTableHints);
      tableRegions.forEach(region => { tableObserver.observe(region); const table = $('table', region); if (table) tableObserver.observe(table); });
    }
    window.addEventListener('resize', updateTableHints, {passive: true});
    window.addEventListener('beforeprint', updateTableHints);
    window.addEventListener('afterprint', updateTableHints);
    document.addEventListener('toggle', updateTableHints, true);
    if (document.fonts) document.fonts.ready.then(updateTableHints);
    updateTableHints();
  }
  // Con todos los controles de site.js ya cableados, se revelan (reservaban su espacio pero estaban invisibles).
  // Si site.js no llega a ejecutarse o lanza antes de aquí, sus controles siguen ocultos en vez de aparecer muertos.
  html.classList.add('ready');
})();
