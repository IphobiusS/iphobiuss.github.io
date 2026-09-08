/* Progressive enhancements only: all educational content is present in HTML. */
(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const html = document.documentElement;
  const page = document.body.dataset.page;
  const storage = {
    get(key) { try { return localStorage.getItem('iphobiuss:' + key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem('iphobiuss:' + key, value); } catch { /* Local preferences are optional. */ } }
  };
  html.classList.add('js');
  $$('.js-only').forEach(el => { el.hidden = false; });
  const announce = text => { const status = $('#action-status'); if (status) status.textContent = text; };
  const legacy = {
    proyectos: 'proyectos.html', fundamentos: 'fundamentos.html', oscp: 'tecnicas.html#oscp',
    cape: 'tecnicas.html#cape', cpts: 'tecnicas.html#cpts', cwes: 'tecnicas.html#cwes', coae: 'tecnicas.html#coae',
    cheatsheet: 'herramientas.html#cheatsheet', arsenal: 'herramientas.html#arsenal',
    writeups: 'guias.html', glosario: 'fundamentos.html#glosario'
  };
  if (page === 'index') {
    const target = legacy[location.hash.slice(1)];
    if (target) { location.replace(target); return; }
  }

  const header = $('.site-header');
  const syncHeader = () => { if (header) html.style.setProperty('--nav-height', header.getBoundingClientRect().height + 'px'); };
  syncHeader();
  if (typeof ResizeObserver !== 'undefined' && header) new ResizeObserver(syncHeader).observe(header);
  window.addEventListener('resize', syncHeader, {passive: true});
  const menu = $('.menu-toggle'), nav = $('#site-nav');
  function closeMenu() {
    if (!menu || !nav) return;
    menu.setAttribute('aria-expanded', 'false'); nav.classList.remove('is-open');
  }
  if (menu && nav) {
    menu.hidden = false;
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open)); nav.classList.toggle('is-open', open);
    });
    nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  }
  const retroButtons = $$('[data-retro-toggle]');
  function setRetro(enabled) {
    html.dataset.retro = enabled ? 'on' : 'off';
    retroButtons.forEach(button => button.setAttribute('aria-pressed', String(enabled)));
  }
  setRetro(storage.get('retro') === 'on');
  retroButtons.forEach(button => button.addEventListener('click', () => {
    const enabled = html.dataset.retro !== 'on'; setRetro(enabled); storage.set('retro', enabled ? 'on' : 'off');
  }));

  // Filtering operates only in the catalogue. Search never hides page sections.
  const subject = $('#subject-filter'), cert = $('#cert-filter');
  const filterItems = $$('[data-filterable]');
  const params = new URLSearchParams(location.search);
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
  if (subject && cert) {
    subject.value = allowedValue(subject, params.get('area') || '');
    cert.value = allowedValue(cert, params.get('cert') || '');
    applyFilters(false);
    subject.addEventListener('change', () => applyFilters());
    cert.addEventListener('change', () => applyFilters());
    $('#reset-filters').addEventListener('click', () => { subject.value = ''; cert.value = ''; applyFilters(); });
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

  $$('[data-guide-mode]').forEach(button => button.addEventListener('click', () => {
    const full = button.dataset.guideMode === 'full';
    $$('.solution').forEach(details => { details.open = full; });
    $$('[data-guide-mode]').forEach(control => control.setAttribute('aria-pressed', String(control === button)));
    announce(full ? 'Guía completa desplegada. Las respuestas finales permanecen bajo tu control.' : 'Soluciones cerradas. Puedes consultar una pista y abrir cada paso cuando quieras.');
  }));
  $$('[data-checklist]').forEach(input => {
    input.checked = storage.get('check:' + input.dataset.checklist) === '1';
    input.addEventListener('change', () => storage.set('check:' + input.dataset.checklist, input.checked ? '1' : '0'));
  });
  $$('[data-print]').forEach(button => button.addEventListener('click', () => window.print()));
  let printState = null;
  window.addEventListener('beforeprint', () => {
    if (printState) return;
    printState = new Map($$('details').map(details => [details, details.open]));
    printState.forEach((_, details) => { details.open = true; });
  });
  window.addEventListener('afterprint', () => {
    if (printState) printState.forEach((wasOpen, details) => { details.open = wasOpen; });
    printState = null;
  });

  const tocLinks = $$('.article-toc a');
  const articleSections = $$('.article-content section[id]');
  if (tocLinks.length && typeof IntersectionObserver !== 'undefined') {
    const positions = new Map();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => positions.set(entry.target.id, entry.isIntersecting));
      const current = articleSections.find(section => positions.get(section.id));
      if (current) tocLinks.forEach(link => link.hash === '#' + current.id ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current'));
    }, {rootMargin: '-100px 0px -65% 0px', threshold: 0});
    articleSections.forEach(section => observer.observe(section));
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
  updateProgress();
  document.addEventListener('keydown', event => {
    const inField = event.target.closest('input, textarea, select, [contenteditable=true]');
    if (event.key === '/' && !inField && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const search = $('.search-input');
      event.preventDefault(); search ? search.focus() : location.assign('buscar.html');
    }
    if (event.key === 'Escape') {
      if (menu && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
      else if (event.target.matches('input[type=search]')) { event.target.value = ''; event.target.dispatchEvent(new Event('input', {bubbles: true})); }
    }
  });

  if (page === 'buscar' && window.SiteSearch && window.SEARCH_INDEX) {
    const field = $('input[name=q]'), form = field.closest('form'), count = $('#search-count'), empty = $('#search-empty');
    const records = window.SiteSearch.prepare(window.SEARCH_INDEX);
    const list = $('#search-results');
    const more = document.createElement('button'); more.type = 'button'; more.className = 'button'; more.textContent = 'Mostrar más resultados'; more.hidden = true; list.after(more);
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
      const tokens = query.trim().split(/\s+/).filter(token => token.length >= 2).map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (!tokens.length) { parent.textContent = text; return; }
      const pattern = new RegExp('(' + tokens.join('|') + ')', 'gi');
      for (const [i, part] of text.split(pattern).entries()) {
        if (i % 2) { const mark = document.createElement('mark'); mark.textContent = part; parent.appendChild(mark); }
        else parent.appendChild(document.createTextNode(part));
      }
    }
    function renderNext() {
      const end = Math.min(results.length, shown + 20);
      const fragment = document.createDocumentFragment();
      for (const record of results.slice(shown, end)) {
        const li = document.createElement('li'); li.className = 'result-item';
        const a = document.createElement('a'); a.href = record.url;
        const type = document.createElement('span'); type.className = 'result-type'; type.textContent = record.kind + (record.category ? ' · ' + record.category : '');
        const title = document.createElement('h2'); addHighlighted(title, record.title);
        const text = document.createElement('p'); addHighlighted(text, snippet(record));
        a.append(type, title, text); li.appendChild(a); fragment.appendChild(li);
      }
      list.appendChild(fragment); shown = end; more.hidden = shown >= results.length;
      more.textContent = `Mostrar ${Math.min(20, results.length - shown)} resultados más`;
    }
    function run(updateUrl = true) {
      query = field.value.trim().slice(0, 200); shown = 0; list.replaceChildren();
      const normalized = window.SiteSearch.normalize(query);
      $('#egg').hidden = !companions.has(normalized); $('#lab').hidden = !challenges.has(normalized);
      results = window.SiteSearch.search(records, query);
      count.textContent = query ? `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}` : 'Escribe un término para buscar.';
      empty.hidden = !query || !!results.length || !$('#egg').hidden || !$('#lab').hidden;
      renderNext();
      if (updateUrl) {
        const url = new URL(location.href); query ? url.searchParams.set('q', query) : url.searchParams.delete('q');
        try { history.replaceState(null, '', url); } catch { /* file:// */ }
      }
    }
    field.value = params.get('q') || ''; field.maxLength = 200; run(false);
    form.addEventListener('submit', event => { event.preventDefault(); clearTimeout(timer); run(); });
    field.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 100); });
    more.addEventListener('click', renderNext);
    window.addEventListener('popstate', () => { field.value = new URLSearchParams(location.search).get('q') || ''; run(false); });
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
})();
