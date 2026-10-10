/* Optional location marker. Native anchors and all four stops remain usable without it. */
(() => {
  'use strict';
  const nav = document.querySelector('[data-journey-nav]');
  if (!nav) return;
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const stops = links.map(link => document.getElementById(link.hash.slice(1)));
  if (links.length !== 4 || stops.some(stop => !stop?.hasAttribute('data-journey-stop'))) return;
  let scheduled = false;
  const refresh = () => {
    scheduled = false;
    // The reading axis follows the real header geometry. At narrow widths the
    // header is in normal flow, so it must not count as a permanent obstruction.
    const header = document.querySelector('.site-header');
    const headerHeight = header && getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0;
    const axis = headerHeight + 40;
    const boxes = stops.map(stop => stop.getBoundingClientRect());
    let active = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].top <= axis && boxes[i].bottom > axis) { active = i; break; }
    }
    // When an anchor aligns just below the axis, choose that visible stop.
    // Before/after the stops there is no location marker or completion state.
    if (active < 0) active = boxes.findIndex(box => box.top >= axis && box.top < Math.min(innerHeight - 40, axis + 80));
    links.forEach((link, i) => i === active ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current'));
  };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(refresh); } };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('hashchange', schedule);
  addEventListener('pageshow', schedule);
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(schedule);
    stops.forEach(stop => observer.observe(stop));
    const header = document.querySelector('.site-header');
    if (header) observer.observe(header);
  }
  document.fonts?.ready.then(schedule);
  refresh();
})();
