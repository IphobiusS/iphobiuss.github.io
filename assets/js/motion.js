/* La terminal se abre completa; sólo Repetir inicia su secuencia local. La
   presentación permanece legible. El HTML conserva el estado final sin JavaScript;
   la pausa persiste y se respeta la reducción de movimiento. */
(() => {
  'use strict';
  const html = document.documentElement;
  const toggles = [...document.querySelectorAll('[data-motion-toggle]')];
  const replays = [...document.querySelectorAll('[data-motion-replay]')];
  const key = 'iphobiuss:motion';
  const storedPreference = () => { try { return localStorage.getItem(key) === 'paused' ? 'paused' : 'running'; } catch { return 'running'; } };
  let preference = storedPreference();
  // Comparte la preferencia de pausa con los estilos de animación y syncControls().
  const reflectPaused = () => { if (preference === 'paused') html.setAttribute('data-paused', ''); else html.removeAttribute('data-paused'); };
  reflectPaused();
  const media = query => typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
  const reduced = media('(prefers-reduced-motion: reduce)'), printMedia = media('print');
  let onScreen = true, printing = false;
  const timers = new Set(), frames = new Set();
  const after = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const nextFrame = fn => { const id = requestAnimationFrame(now => { frames.delete(id); fn(now); }); frames.add(id); };
  // V12-02: registro de descifrados activos con su texto final, para restaurarlos al cancelar.
  const activeScrambles = new Map();
  const clearAll = () => {
    timers.forEach(clearTimeout); timers.clear(); frames.forEach(cancelAnimationFrame); frames.clear();
    // V12-02: cualquier descifrado en curso se restaura a su texto final exacto; nunca quedan glifos congelados.
    activeScrambles.forEach((text, el) => { el.textContent = text; }); activeScrambles.clear();
  };
  const systemReduced = () => !!(reduced && reduced.matches);
  const running = () => !!reduced && !systemReduced() && preference === 'running' && !document.hidden && !printing && !(printMedia && printMedia.matches);

  const session = document.querySelector('[data-session]'), stage = document.querySelector('[data-motion-stage]');
  const sessionDisclosure = session?.closest('details');
  const glyphs = '01$#&%@/\\<>|*+=';
  const cmds = session ? [...session.querySelectorAll('[data-cmd]')].map(el => ({wrap: el, text: el.querySelector('.tcmd-text'), value: el.querySelector('.tcmd-text').textContent})) : [];
  const termLines = session ? [...session.querySelectorAll('.spane-term .tl')] : [];
  const visible = el => el.getClientRects ? !!(el.offsetParent !== null || el.getClientRects().length) : true;
  const tagLine = termLines.find(el => el.classList.contains('ttag')), promptTwo = termLines.find(el => el.classList.contains('tp2'));
  const nmapLines = termLines.filter(el => !el.classList.contains('tb') && !el.classList.contains('ttag') && !el.classList.contains('tp2'));
  const repLines = session ? [...session.querySelectorAll('.rep .tl')] : [];
  const pages = session ? session.querySelector('[data-pages]') : null, pageTotal = pages ? +pages.dataset.pages : 0, pagesText = pages ? pages.textContent : '';
  const panes = {};
  if (session) session.querySelectorAll('[data-pane]').forEach(p => { panes[p.dataset.pane] = p; });

  function syncControls() {
    const reducedNow = systemReduced(), unsupported = !reduced, active = running() && onScreen;
    html.dataset.motion = active ? 'running' : 'paused';
    reflectPaused();
    const label = reducedNow ? 'Animación: reducida' : unsupported ? 'Animación: no disponible' : preference === 'paused' ? 'Animación: pausada' : active ? 'Animación: activa' : 'Animación: pausada automáticamente';
    toggles.forEach(button => {
      button.hidden = false; button.disabled = unsupported || reducedNow;
      // Pulsado significa movimiento habilitado, igual que en Papel y Retro. El nombre accesible permanece
      // estable; la reducción del sistema lo desactiva sin borrar la preferencia manual guardada. Una pausa
      // automática fuera de pantalla no cambia esa selección del usuario.
      const enabled = preference === 'running' && !reducedNow && !unsupported;
      button.setAttribute('aria-pressed', String(enabled));
      // Visible labels stay stable. A wave or pause bars conveys state without relying on color.
      const indicator = button.querySelector('[data-motion-indicator]');
      if (indicator) indicator.setAttribute('d', enabled ? 'M22 12h-4l-3 9-6-18-3 9H2' : 'M9 4v16M15 4v16');
      button.setAttribute('aria-label', button.hasAttribute('data-compact') ? 'Fondo animado' : 'Animación del sitio');
      button.title = reducedNow ? 'Tu sistema solicita menos movimiento.' : unsupported ? 'Este navegador no permite consultar la preferencia de movimiento.' : preference === 'paused' ? 'Activar las animaciones.' : 'Pausar las animaciones.';
      if (!button.hasAttribute('data-compact')) {
        const state = button.querySelector('[data-motion-state]');
        if (state) state.textContent = label.slice('Animación'.length);
        else if (button.textContent !== 'Animación del sitio') button.textContent = 'Animación del sitio';
      }
    });
    replays.forEach(button => { button.hidden = false; button.disabled = unsupported || reducedNow || preference === 'paused'; });
    net.sync();
    syncClock();
  }
  function finish() {
    clearAll();
    if (!session) return;
    session.classList.remove('boot'); session.classList.add('done');
    Object.values(panes).forEach(p => p.classList.remove('active'));
    cmds.forEach(c => { c.wrap.classList.remove('typing'); c.text.textContent = c.value; });
    if (pages) pages.textContent = pagesText;
    session.querySelectorAll('.on').forEach(el => el.classList.remove('on'));
  }
  function scramble(el, text, duration) {
    const start = performance.now(), chars = [...text];
    activeScrambles.set(el, text);
    el.innerHTML = chars.map(c => `<span class="ch sc">${c === ' ' ? '&nbsp;' : glyphs[Math.random() * glyphs.length | 0]}</span>`).join('');
    const spans = [...el.querySelectorAll('.ch')];
    const step = now => {
      const p = Math.min(1, (now - start) / duration), settled = Math.floor(p * chars.length);
      spans.forEach((s, i) => {
        if (chars[i] === ' ') return;
        if (i < settled) { s.textContent = chars[i]; s.classList.remove('sc'); } else s.textContent = glyphs[Math.random() * glyphs.length | 0];
      });
      if (p < 1) nextFrame(step); else { el.textContent = text; activeScrambles.delete(el); el.classList.remove('scrambling'); }
    };
    nextFrame(step);
  }
  function typeInto(cmd, at, speed) {
    cmd.text.textContent = '';
    after(at, () => cmd.wrap.classList.add('typing'));
    [...cmd.value].forEach((ch, i) => after(at + i * speed, () => { cmd.text.textContent += ch; }));
    after(at + cmd.value.length * speed + 120, () => cmd.wrap.classList.remove('typing'));
    return at + cmd.value.length * speed;
  }
  const activate = (which, at) => after(at, () => Object.entries(panes).forEach(([k, p]) => p.classList.toggle('active', k === which)));

  // F02: mientras la secuencia corre, si una fila oculta recibe foco por teclado, se muestra de inmediato.
  const bootFocusReveal = event => { const row = event.target.closest && event.target.closest('.tl.trow, .tl'); if (row && session.classList.contains('boot')) row.classList.add('on'); };
  function playSession() {
    if (!session) return;
    if (!playSession.bound) { session.addEventListener('focusin', bootFocusReveal); playSession.bound = true; }
    session.classList.remove('done'); session.classList.add('boot');
    activate('term', 0);
    const bannerLines = termLines.filter(el => el.classList.contains('tb') && visible(el));
    let t = cmds[0] ? typeInto(cmds[0], 220, 70) : 220;
    bannerLines.forEach((line, i) => after(t + 240 + i * 60, () => line.classList.add('on')));
    t += 240 + bannerLines.length * 60 + 120;
    if (tagLine) after(t, () => tagLine.classList.add('on'));
    if (promptTwo) after(t + 320, () => promptTwo.classList.add('on'));
    t = cmds[1] ? typeInto(cmds[1], t + 420, 26) : t + 420;
    nmapLines.forEach((line, i) => after(t + 300 + i * (i < 4 ? 80 : 110), () => line.classList.add('on')));
    const nmapDone = t + 300 + nmapLines.length * 110 + 150;
    const g0 = t - 150;
    activate('graph', g0);
    const items = ['n1', 'e1', 'n2', 'e2', 'n3', 'e3', 'n4', 'e4', 'n5'], labels = [...session.querySelectorAll('.gph .gl')];
    items.forEach((item, i) => after(g0 + i * 190, () => {
      const el = document.getElementById(item); if (el) el.classList.add('on');
      if (item.startsWith('e') && labels[+item[1] - 1]) labels[+item[1] - 1].classList.add('on');
    }));
    const r0 = g0 + items.length * 190 + 60;
    activate('report', r0);
    repLines.slice(0, 3).forEach((line, i) => after(r0 + i * 170, () => line.classList.add('on')));
    const p0 = r0 + 520, bar = session.querySelector('[data-bar]');
    after(p0, () => { if (bar) bar.classList.add('on'); if (pages && pageTotal) pages.textContent = '0 páginas'; });
    if (pages && pageTotal) for (let i = 1; i <= pageTotal; i++) after(p0 + i * Math.round(1050 / pageTotal), () => { pages.textContent = i + ' páginas'; });
    if (repLines[3]) after(p0 + 1150, () => repLines[3].classList.add('on'));
    if (repLines[4]) after(p0 + 1250, () => repLines[4].classList.add('on'));
    session.querySelectorAll('.sev .sbi').forEach((b, i) => after(p0 + 1350 + i * 140, () => b.classList.add('on')));
    after(Math.max(nmapDone, p0 + 2050), () => { session.classList.remove('boot'); session.classList.add('done'); Object.values(panes).forEach(p => p.classList.remove('active')); session.querySelectorAll('.on').forEach(el => el.classList.remove('on')); });
  }
  function play() {
    finish();
    if (!running() || !session || (sessionDisclosure && !sessionDisclosure.open)) return;
    playSession();
  }

  // Fondo: red de nodos y paquetes en canvas (solo en la portada), con los colores del tema vigente.
  const net = (() => {
    const canvas = document.querySelector('[data-net]');
    const supported = !!canvas && typeof window.CanvasRenderingContext2D === 'function';
    const ctx = supported ? canvas.getContext('2d') : null;
    if (!ctx) return {sync() {}};
    let w = 0, h = 0, nodes = [], packets = [], frame = 0, on = false, pointer = {x: -1e4, y: -1e4}, colors = {};
    const rgb = hex => { const m = /^#([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return '110,226,131'; const n = parseInt(m[1], 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };
    const readColors = () => { const cs = getComputedStyle(html); colors = {line: rgb(cs.getPropertyValue('--acc')), near: rgb(cs.getPropertyValue('--link')), dot: rgb(cs.getPropertyValue('--dim'))}; };
    const R = () => (w < 700 ? 110 : 150);
    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1), oldW = w, oldH = h;
      w = window.innerWidth; h = window.innerHeight;
      // Keep the same spatial distribution after a resize; old off-screen coordinates never bounce back.
      if (oldW && oldH) nodes.forEach(n => { n.x = Math.max(0, Math.min(w, n.x * w / oldW)); n.y = Math.max(0, Math.min(h, n.y * h / oldH)); });
      packets = []; // Transient packets may reference nodes removed by the new density.
      canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(72, Math.max(24, w * h / 24000)));
      while (nodes.length < count) nodes.push({x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18});
      nodes.length = count;
      if (!on) draw(true);
    }
    function spawn() {
      const a = nodes[Math.random() * nodes.length | 0], r = R(), ns = nodes.filter(b => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < r);
      if (ns.length) packets.push({a, b: ns[Math.random() * ns.length | 0], t: 0, v: .012 + Math.random() * .014});
    }
    function draw(still) {
      ctx.clearRect(0, 0, w, h);
      const r = R();
      if (!still) nodes.forEach(n => { n.x += n.vx; n.y += n.vy; if (n.x < 0 || n.x > w) n.vx *= -1; if (n.y < 0 || n.y > h) n.vy *= -1; });
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < r) { ctx.strokeStyle = `rgba(${colors.line},${(.22 * (1 - d / r)).toFixed(3)})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      nodes.forEach(n => {
        const dp = Math.hypot(n.x - pointer.x, n.y - pointer.y), near = dp < 190;
        if (near) { ctx.strokeStyle = `rgba(${colors.near},${(.35 * (1 - dp / 190)).toFixed(3)})`; ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke(); }
        ctx.fillStyle = near ? `rgba(${colors.near},.95)` : `rgba(${colors.dot},.6)`;
        ctx.beginPath(); ctx.arc(n.x, n.y, near ? 2.2 : 1.4, 0, Math.PI * 2); ctx.fill();
      });
      if (!still) {
        if (frame % 7 === 0 && packets.length < 18) spawn();
        packets = packets.filter(p => p.t <= 1);
        packets.forEach(p => {
          p.t += p.v;
          for (let k = 0; k < 4; k++) {
            const tt = Math.max(0, p.t - k * .03), x = p.a.x + (p.b.x - p.a.x) * tt, y = p.a.y + (p.b.y - p.a.y) * tt;
            ctx.fillStyle = `rgba(${colors.line},${(.95 - k * .22).toFixed(2)})`; ctx.beginPath(); ctx.arc(x, y, 2 - k * .35, 0, Math.PI * 2); ctx.fill();
          }
        });
      }
      frame++;
    }
    let rafId = 0;
    function loop() { if (!on) { rafId = 0; return; } draw(false); rafId = requestAnimationFrame(loop); }
    window.addEventListener('resize', resize, {passive: true});
    window.addEventListener('pointermove', e => { pointer = {x: e.clientX, y: e.clientY}; }, {passive: true});
    document.addEventListener('pointerleave', () => { pointer = {x: -1e4, y: -1e4}; });
    if (typeof MutationObserver === 'function') new MutationObserver(() => { readColors(); if (!on) draw(true); }).observe(html, {attributes: true, attributeFilter: ['data-theme', 'data-retro']});
    readColors(); resize();
    return {sync() {
      const should = running() && onScreen;
      // F07: una sola cadena de requestAnimationFrame. Se cancela al detener y no se agenda una segunda.
      if (should && !on) { on = true; if (!rafId) rafId = requestAnimationFrame(loop); }
      else if (!should && on) { on = false; if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } packets = []; draw(true); }
    }};
  })();

  toggles.forEach(button => button.addEventListener('click', () => {
    if (!reduced || reduced.matches) { syncControls(); return; }
    preference = preference === 'paused' ? 'running' : 'paused';
    try { localStorage.setItem(key, preference); } catch { /* La elección de esta página sigue funcionando. */ }
    syncControls();
    if (preference === 'paused') { finish(); removeCrt(); cancelTitle(); }
  }));
  replays.forEach(button => button.addEventListener('click', () => {
    // Repetir pertenece a la sesión extensa; no desplaza ni anima la presentación.
    if (!onScreen) { session?.scrollIntoView({block: 'start', behavior: 'auto'}); onScreen = true; }
    syncControls(); play();
  }));
  document.addEventListener('keydown', event => { if (event.key !== 'Escape') return; finish(); cancelTitle(); syncControls(); });
  const listen = (m, fn) => { if (!m) return; if (m.addEventListener) m.addEventListener('change', fn); else if (m.addListener) m.addListener(fn); };
  listen(reduced, () => { if (systemReduced()) { finish(); cancelTitle(); } syncControls(); });
  listen(printMedia, event => { printing = event.matches; if (printing) { finish(); cancelTitle(); } syncControls(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { finish(); cancelTitle(); } syncControls(); });
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) { preference = storedPreference(); syncControls(); if (preference === 'paused') { finish(); removeCrt(); cancelTitle(); } } });
  window.addEventListener('beforeprint', () => { printing = true; finish(); cancelTitle(); syncControls(); });
  window.addEventListener('afterprint', () => { printing = false; syncControls(); });
  window.addEventListener('pageshow', () => { if (!printMedia || !printMedia.matches) printing = false; syncControls(); });
  if (stage && typeof IntersectionObserver !== 'undefined') {
    // Fuera de pantalla (por ejemplo, un enlace directo a una carpeta) la sesión salta a su estado final y el fondo se detiene.
    new IntersectionObserver(entries => { const entry = entries.find(e => e.target === stage); if (entry) { onScreen = entry.isIntersecting; if (!onScreen) finish(); syncControls(); } }, {threshold: 0}).observe(stage);
  }
  // F05: la ruta de Forest es accesible por teclado y toque. Nodos y botones de paso seleccionan un eslabón;
  // la explicación aparece en el pie y permanece hasta cambiar de selección (no depende de mantener el puntero).
  const caption = document.querySelector('[data-gcap]');
  const gnodes = [...document.querySelectorAll('.gph .gn[data-tip]')];
  const gsteps = [...document.querySelectorAll('[data-gstep]')].map(step => {
    // Sin este recurso, el HTML conserva la ruta como texto y no ofrece botones sin eventos.
    if (step.tagName === 'BUTTON') return step;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = step.className;
    button.dataset.gstep = step.dataset.gstep;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', step.dataset.stepLabel || step.textContent.trim());
    while (step.firstChild) button.appendChild(step.firstChild);
    step.replaceWith(button);
    return button;
  });
  let gcurrent = null;
  function selectStep(id) {
    const node = gnodes.find(n => n.id === id); if (!node || !caption) return;
    gcurrent = id;
    caption.textContent = node.dataset.tip;
    gnodes.forEach(n => { if (n.id === id) n.setAttribute('data-current', ''); else n.removeAttribute('data-current'); });
    gsteps.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gstep === id)));
  }
  function clearStep() {
    gcurrent = null; if (caption) caption.textContent = caption.dataset.default;
    gnodes.forEach(n => n.removeAttribute('data-current'));
    gsteps.forEach(b => b.setAttribute('aria-pressed', 'false'));
  }
  if (caption) {
    // R05: el SVG es decorativo (aria-hidden). El hover de un nodo elige su paso, pero la explicación PERMANECE
    // hasta elegir otro paso o cerrar con Escape; mover el puntero al párrafo para leerlo ya no la borra.
    // Los botones de paso dan el mismo acceso por teclado y toque.
    gnodes.forEach(node => node.addEventListener('pointerenter', () => selectStep(node.id)));
    gsteps.forEach(button => {
      button.addEventListener('click', () => selectStep(button.dataset.gstep));
      button.addEventListener('focus', () => selectStep(button.dataset.gstep));
    });
    // Escape restablece el resumen cuando hay un paso seleccionado.
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && gcurrent) clearStep(); });
  }
  // R07: el título interior se descifra al cargar, pero el ciclo de la sesión no debe cancelarlo. Solo se
  // agenda si de verdad se va a animar (running()) y no se toca el timer de la sesión. Si no, queda el texto final.
  // V13-03: el descifrado interior tiene su PROPIO ciclo, independiente del de la sesión (en páginas interiores
  // finish() corre al inicializar y no debe cancelar su arranque, que causaba el viejo R07). Un timer dedicado y
  // cancelable gobierna el arranque diferido; cancelTitle() detiene arranque y animación y deja el texto final.
  const headTitle = document.querySelector('.page-head h1[data-scramble]');
  const headText = headTitle ? headTitle.textContent : '';
  let titleTimer = null;
  function cancelTitle() {
    if (titleTimer) { clearTimeout(titleTimer); titleTimer = null; }
    if (headTitle) { if (activeScrambles.has(headTitle)) activeScrambles.delete(headTitle); headTitle.classList.remove('scrambling'); headTitle.textContent = headText; }
  }
  function startTitle() {
    if (!headTitle) return;
    cancelTitle();
    if (!running()) { headTitle.textContent = headText; return; }
    titleTimer = setTimeout(() => { titleTimer = null; if (running()) { headTitle.classList.add('scrambling'); scramble(headTitle, headText, 700); } else headTitle.textContent = headText; }, 80);
  }
  if (headTitle) startTitle();
  // R04: las tarjetas .reveal aparecen al entrar en viewport, pero solo si el movimiento está realmente activo
  // (incluye la pausa guardada, no solo el movimiento reducido del sistema). En pausa se muestran en su estado final.
  // V14-03: el estado oculto de las tarjetas solo se activa cuando este script prepara el observador (clase
  // reveal-ready). Si motion.js no carga, las tarjetas no se ocultan nunca y el catálogo se ve completo.
  const reveals = [...document.querySelectorAll('.reveal')];
  if (reveals.length) {
    // Un enlace puede estar dentro del viewport pero fuera del margen del observador. Tab debe mostrar
    // su tarjeta inmediatamente y conservarla visible después, sin esperar al scroll ni al fundido.
    reveals.forEach(el => el.addEventListener('focusin', () => el.classList.add('in', 'reveal-focus')));
    if (!running() || typeof IntersectionObserver === 'undefined') { html.classList.add('reveal-ready'); reveals.forEach(el => el.classList.add('in')); }
    else {
      html.classList.add('reveal-ready');
      const io = new IntersectionObserver((entries, obs) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } }), {rootMargin: '0px 0px -10% 0px'});
      reveals.forEach(el => io.observe(el));
    }
  }
  // R08: encendido CRT al activar Retro. Limpieza idempotente: una sola instancia, retirada en animationend,
  // animationcancel o cuando el movimiento deja de estar activo; no queda elemento residual.
  const retroButtons = [...document.querySelectorAll('[data-retro-toggle]')];
  let crtFlash = null;
  const removeCrt = () => { if (crtFlash) { crtFlash.remove(); crtFlash = null; } };
  retroButtons.forEach(button => button.addEventListener('click', () => {
    if (!running() || html.dataset.retro !== 'on') return;
    removeCrt();
    crtFlash = document.createElement('div'); crtFlash.className = 'crt-on'; document.body.appendChild(crtFlash);
    requestAnimationFrame(() => { if (crtFlash) crtFlash.classList.add('go'); });
    crtFlash.addEventListener('animationend', removeCrt);
    crtFlash.addEventListener('animationcancel', removeCrt);
  }));
  // R06: el reloj decorativo solo corre con el movimiento activo Y la portada a la vista (la misma condición
  // que el canvas). En pausa manual o automática (fuera de pantalla) se detiene y no vuelve a leer la hora;
  // al reanudar se actualiza una sola vez.
  const clock = document.querySelector('[data-clock]');
  let clockTimer = null;
  const clockActive = () => running() && onScreen && (!sessionDisclosure || sessionDisclosure.open);
  function tickClock() { if (clock) clock.textContent = new Date().toLocaleTimeString('es-CL', {hour12: false}); }
  function syncClock() {
    if (!clock) return;
    if (clockActive()) { tickClock(); if (!clockTimer) clockTimer = setInterval(tickClock, 1000); }
    else if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  }
  syncControls();
  // Animación y Repetir ya están cableados y con estado: se revelan (reservaban su espacio pero estaban invisibles).
  // Si motion.js no llega a ejecutarse, siguen ocultos en vez de aparecer habilitados sin responder.
  html.classList.add('motion-ready');
  // Abrir, cerrar o restaurar la sesión siempre conserva el contenido completo.
  // La secuencia sólo se ejecuta mediante Repetir.
  if (sessionDisclosure) sessionDisclosure.addEventListener('toggle', () => {
    finish();
    syncControls();
  });
  finish();
})();
