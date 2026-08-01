(() => {
  if (window.__myfit) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE_OUT = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

  const TONES = {
    good: { stroke: 'oklch(0.60 0.15 156)', text: 'oklch(0.42 0.11 156)', textDark: 'oklch(0.80 0.12 156)' },
    warn: { stroke: 'oklch(0.70 0.15 70)', text: 'oklch(0.48 0.11 70)', textDark: 'oklch(0.84 0.11 80)' },
    info: { stroke: 'oklch(0.62 0.13 237)', text: 'oklch(0.46 0.10 237)', textDark: 'oklch(0.80 0.11 237)' }
  };

  const BASE_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .wrap {
      position: fixed; inset: 0; pointer-events: none;
      z-index: 2147483000;
      font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
      -webkit-font-smoothing: antialiased;
      --bg-raised: #ffffff;
      --bg-component: oklch(0.955 0.0016 106);
      --text: oklch(0.210 0.0048 106);
      --text-secondary: oklch(0.450 0.0040 106);
      --text-tertiary: oklch(0.640 0.0040 106);
      --accent-9: oklch(0.715 0.143 237);
      --accent-5: oklch(0.882 0.058 237);
      --accent-11: oklch(0.520 0.115 237);
      --overlay-hover: oklch(0.21 0.005 106 / 0.05);
      --shadow-border: 0 0 0 1px oklch(0 0 0 / 0.06), 0 1px 2px -1px oklch(0 0 0 / 0.06), 0 2px 4px 0 oklch(0 0 0 / 0.04);
      --shadow-md: 0 0 0 1px oklch(0 0 0 / 0.05), 0 2px 4px -1px oklch(0 0 0 / 0.05), 0 6px 16px -2px oklch(0 0 0 / 0.08);
      --shadow-lg: 0 0 0 1px oklch(0 0 0 / 0.05), 0 4px 8px -2px oklch(0 0 0 / 0.06), 0 16px 40px -8px oklch(0 0 0 / 0.16);
      --ease-out: ${EASE_OUT};
      --ease-spring: linear(0, 0.0036 1.1%, 0.0185 2.4%, 0.0577 4.3%, 0.1336 6.8%, 0.2521 9.9%, 0.5095 15.5%, 0.6671 19%, 0.8019 22.5%, 0.8834 25.2%, 0.9426 28%, 0.9817 31.1%, 1.0033 34.7%, 1.0125 39%, 1.0128 44.5%, 1.0034 56.4%, 0.9999 76.5%, 1);
    }
    @media (prefers-color-scheme: dark) {
      .wrap {
        --bg-raised: oklch(0.252 0.0048 256);
        --bg-component: oklch(0 0 0 / 0.30);
        --text: oklch(0.940 0.0040 256);
        --text-secondary: oklch(0.760 0.0050 256);
        --text-tertiary: oklch(0.582 0.0064 256);
        --accent-5: oklch(0.350 0.075 237);
        --accent-11: oklch(0.800 0.115 237);
        --overlay-hover: oklch(0.95 0.005 256 / 0.06);
        --shadow-border: 0 0 0 1px oklch(1 0 0 / 0.11), 0 1px 2px -1px oklch(0 0 0 / 0.40), 0 2px 4px 0 oklch(0 0 0 / 0.30);
        --shadow-md: 0 0 0 1px oklch(1 0 0 / 0.11), 0 2px 4px -1px oklch(0 0 0 / 0.40), 0 6px 16px -2px oklch(0 0 0 / 0.45);
        --shadow-lg: 0 0 0 1px oklch(1 0 0 / 0.13), 0 4px 8px -2px oklch(0 0 0 / 0.45), 0 16px 40px -8px oklch(0 0 0 / 0.60);
      }
    }
    svg.board { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .note {
      position: absolute;
      z-index: 2;
      max-width: 240px;
      padding: 8px 12px;
      background: var(--bg-raised);
      box-shadow: var(--shadow-md);
      border-radius: 12px;
      font-size: 0.8125rem;
      line-height: 1.45;
      color: var(--text);
      pointer-events: auto;
      user-select: none;
      display: flex;
      gap: 8px;
      align-items: baseline;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 350ms var(--ease-out), transform 350ms var(--ease-out);
    }
    .note.in { opacity: 1; transform: translateY(0); }
    .note .dot { width: 6px; height: 6px; border-radius: 999px; flex-shrink: 0; transform: translateY(-1px); }
    .note.verdict {
      flex-direction: column;
      align-items: flex-start;
      gap: 3px;
      max-width: 264px;
      padding: 11px 14px;
      box-shadow: var(--shadow-lg);
    }
    .note.verdict .v-head { display: flex; align-items: baseline; gap: 7px; }
    .note.verdict .v-size { font-size: 1.0625rem; font-weight: 600; letter-spacing: -0.01em; }
    .note.verdict .v-text { color: var(--text-secondary); }
    .note-border { position: absolute; left: -7px; top: -7px; pointer-events: none; overflow: visible; }
  `;

  let host = null;
  let root = null;
  let wrap = null;
  let svg = null;
  let defsDone = false;
  const items = [];
  let trackerOn = false;
  let raf = 0;

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement('myfit-root');
    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = BASE_CSS;
    wrap = document.createElement('div');
    wrap.className = 'wrap';
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'board');
    wrap.appendChild(svg);
    root.append(style, wrap);
    document.documentElement.appendChild(host);
    addDefs();
  }

  function addDefs() {
    if (defsDone) return;
    defsDone = true;
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.innerHTML = `
      <filter id="myfit-wax" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.07 0.09" numOctaves="2" seed="7" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G"/>
      </filter>
      <filter id="myfit-wax-soft" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.045 0.06" numOctaves="2" seed="13" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/>
      </filter>`;
    svg.appendChild(defs);
  }

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function toPath(pts) {
    if (pts.length < 3) return '';
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6;
      const c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6;
      const c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  }

  function ellipsePoints(rect, pad, seed) {
    const rnd = mulberry32(seed);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const rx = rect.width / 2 + pad + Math.min(rect.width * 0.06, 10);
    const ry = rect.height / 2 + pad;
    const start = -Math.PI * 0.72 + (rnd() - 0.5) * 0.5;
    const sweep = Math.PI * 2 * (1.08 + rnd() * 0.1);
    const steps = 30;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = start + (sweep * i) / steps;
      const wob = 1 + (rnd() - 0.5) * 0.075 + Math.sin(a * 3 + seed) * 0.018;
      const drift = (i / steps) * 4 * (rnd() - 0.35);
      pts.push([cx + Math.cos(a) * rx * wob, cy + Math.sin(a) * ry * wob + drift]);
    }
    return pts;
  }

  function roughRectPoints(x, y, w, h, seed) {
    const rnd = mulberry32(seed);
    const pts = [];
    const edge = (x1, y1, x2, y2, n) => {
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([x1 + (x2 - x1) * t + (rnd() - 0.5) * 2.4, y1 + (y2 - y1) * t + (rnd() - 0.5) * 2.4]);
      }
    };
    const nx = Math.max(4, Math.round(w / 36));
    const ny = Math.max(2, Math.round(h / 36));
    edge(x, y, x + w, y, nx);
    edge(x + w, y, x + w, y + h, ny);
    edge(x + w, y + h, x, y + h, nx);
    edge(x, y + h, x, y - 1 + (rnd() - 0.5) * 3, ny);
    pts.push([x + 6 + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 2.5]);
    return pts;
  }

  function attachCrayonBorder(note, tone, seed) {
    const w = note.offsetWidth;
    const h = note.offsetHeight;
    if (!w || !h) return;
    const b = document.createElementNS(SVG_NS, 'svg');
    b.setAttribute('class', 'note-border');
    b.setAttribute('width', w + 14);
    b.setAttribute('height', h + 14);
    const p = makeStroke(toPath(roughRectPoints(5, 5, w + 4, h + 4, seed)), tone.stroke, 2.6, 0.55, 'myfit-wax');
    b.appendChild(p);
    note.appendChild(b);
    animateDraw(p, 650, 80);
  }

  function underlinePoints(rect, seed) {
    const rnd = mulberry32(seed);
    const y = rect.bottom + 5;
    const steps = Math.max(10, Math.round(rect.width / 14));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const x = rect.left - 3 + ((rect.width + 6) * i) / steps;
      const wave = Math.sin((i / steps) * Math.PI * 2.2 + seed) * 1.6;
      pts.push([x, y + wave + (rnd() - 0.5) * 2.2]);
    }
    return pts;
  }

  function makeStroke(d, color, width, opacity, filter) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', width);
    p.setAttribute('stroke-opacity', opacity);
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('filter', `url(#${filter})`);
    return p;
  }

  function animateDraw(path, duration, delay) {
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    if (REDUCED) {
      path.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay, fill: 'backwards' });
      return;
    }
    path.style.strokeDashoffset = `${len}`;
    const anim = path.animate(
      [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration, delay, easing: EASE_OUT, fill: 'forwards' }
    );
    anim.onfinish = () => { path.style.strokeDashoffset = '0'; };
  }

  function placeNote(note, rect) {
    const vw = innerWidth;
    const vh = innerHeight;
    const w = Math.min(252, note.offsetWidth || 240);
    const h = note.offsetHeight || 40;
    let x, y;
    if (rect.right + 18 + w < vw) {
      x = rect.right + 18;
      y = rect.top + rect.height / 2 - h / 2;
    } else if (rect.left - 18 - w > 0) {
      x = rect.left - 18 - w;
      y = rect.top + rect.height / 2 - h / 2;
    } else {
      x = Math.min(Math.max(12, rect.left), vw - w - 12);
      y = rect.bottom + 14;
    }
    y = Math.min(Math.max(12, y), vh - h - 12);
    if (x + w > vw - 84 && y + h > vh - 84) y = Math.max(12, vh - 84 - h);
    note.style.left = `${x}px`;
    note.style.top = `${y}px`;
  }

  function startTracker() {
    if (trackerOn) return;
    trackerOn = true;
    const tick = () => {
      raf = 0;
      for (const it of items) {
        if (!it.el.isConnected) { it.group.style.opacity = '0'; if (it.note) it.note.style.opacity = '0'; continue; }
        const r = it.el.getBoundingClientRect();
        const dx = r.left - it.r0.left;
        const dy = r.top - it.r0.top;
        it.group.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
        if (it.note) {
          it.note.style.transition = 'opacity 350ms var(--ease-out)';
          placeNote(it.note, r);
        }
      }
    };
    const onMove = () => { if (!raf) raf = requestAnimationFrame(tick); };
    addEventListener('scroll', onMove, { passive: true, capture: true });
    addEventListener('resize', onMove, { passive: true });
  }

  function scheduleFade(item, seconds) {
    if (!seconds || seconds <= 0) return;
    const start = () => {
      item.fadeTimer = setTimeout(() => fadeOut(item), seconds * 1000);
    };
    start();
    if (item.note) {
      item.note.addEventListener('mouseenter', () => clearTimeout(item.fadeTimer));
      item.note.addEventListener('mouseleave', () => { item.fadeTimer = setTimeout(() => fadeOut(item), 4000); });
    }
  }

  function fadeOut(item) {
    if (item.done) return;
    item.done = true;
    const opts = { duration: 700, easing: EASE_OUT, fill: 'forwards' };
    item.group.animate([{ opacity: 1 }, { opacity: 0 }], opts).onfinish = () => item.group.remove();
    if (item.note) {
      item.note.classList.remove('in');
      setTimeout(() => item.note.remove(), 400);
    }
    const idx = items.indexOf(item);
    if (idx >= 0) items.splice(idx, 1);
  }

  function draw(el, opts = {}) {
    ensure();
    startTracker();
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const tone = TONES[opts.tone] || TONES.info;
    const kind = opts.kind === 'underline' || opts.kind === 'note' ? opts.kind : 'circle';
    const seed = (opts.seed || Math.floor(Math.random() * 1e6)) + 1;
    const pad = kind === 'circle' ? Math.max(6, Math.min(14, rect.height * 0.22)) : 0;

    const group = document.createElementNS(SVG_NS, 'g');
    const dur = kind === 'circle' ? 750 : 550;
    const width = Math.max(4.5, Math.min(7, rect.height * 0.1));

    if (kind === 'note') {
      svg.appendChild(group);
    } else if (kind === 'circle') {
      const d1 = toPath(ellipsePoints(rect, pad, seed));
      const d2 = toPath(ellipsePoints(rect, pad * 0.92, seed * 3 + 11));
      const main = makeStroke(d1, tone.stroke, width, 0.5, 'myfit-wax');
      const echo = makeStroke(d2, tone.stroke, width * 0.75, 0.22, 'myfit-wax-soft');
      group.append(echo, main);
      svg.appendChild(group);
      animateDraw(main, dur, 0);
      animateDraw(echo, dur * 1.05, 140);
    } else {
      const d1 = toPath(underlinePoints(rect, seed));
      const main = makeStroke(d1, tone.stroke, Math.max(4, width * 0.8), 0.5, 'myfit-wax');
      group.append(main);
      svg.appendChild(group);
      animateDraw(main, dur, 0);
    }

    let note = null;
    if (opts.label) {
      note = document.createElement('div');
      note.className = 'note';
      if (kind === 'note') {
        note.classList.add('verdict');
        const head = document.createElement('div');
        head.className = 'v-head';
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = tone.stroke;
        head.appendChild(dot);
        if (opts.headline) {
          const sz = document.createElement('span');
          sz.className = 'v-size';
          sz.textContent = opts.headline;
          head.appendChild(sz);
        }
        const txt = document.createElement('div');
        txt.className = 'v-text';
        txt.textContent = opts.label;
        note.append(head, txt);
      } else {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = tone.stroke;
        const txt = document.createElement('span');
        txt.textContent = opts.label;
        note.append(dot, txt);
      }
      wrap.appendChild(note);
      placeNote(note, rect);
      const noteDelay = REDUCED ? 80 : kind === 'note' ? 150 : dur * 0.75;
      setTimeout(() => {
        placeNote(note, el.getBoundingClientRect());
        note.classList.add('in');
        if (kind === 'note') attachCrayonBorder(note, tone, seed * 7 + 3);
      }, noteDelay);
    }

    const item = { el, group, note, r0: rect, done: false, fadeTimer: 0 };
    items.push(item);
    scheduleFade(item, opts.lifespan ?? 14);
    return item;
  }

  function clear() {
    for (const it of [...items]) fadeOut(it);
  }

  window.__myfit = {
    ensure,
    get root() { ensure(); return root; },
    get wrap() { ensure(); return wrap; },
    crayon: {
      circle: (el, o) => draw(el, { ...o, kind: 'circle' }),
      underline: (el, o) => draw(el, { ...o, kind: 'underline' }),
      note: (el, o) => draw(el, { ...o, kind: 'note' }),
      clear,
      count: () => items.length
    },
    reduced: REDUCED
  };
})();
