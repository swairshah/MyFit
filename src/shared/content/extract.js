(() => {
  if (!window.__myfit || window.__myfitExtract) return;

  const SIZE_RE = new RegExp(window.MyFitValidate.SIZE_REGEX, 'i');
  let registry = { entries: [] };
  let readyResolve;
  const ready = new Promise((r) => { readyResolve = r; });

  async function loadRegistry() {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'get-registry' });
      if (res?.ok) registry = res.data;
    } catch {}
    readyResolve();
  }
  loadRegistry();

  function hostMatches(domain) {
    const h = location.hostname;
    return h === domain || h.endsWith(`.${domain}`);
  }

  function entryMatches(e) {
    if (e.disabled || !hostMatches(e.domain)) return false;
    if (e.urlPattern) {
      try { if (!new RegExp(e.urlPattern).test(location.href)) return false; } catch { return false; }
    }
    return true;
  }

  function findEntries(kind) {
    return (registry.entries || []).filter((e) => e.kind === kind && entryMatches(e));
  }

  function allEntries() {
    return (registry.entries || []).filter(entryMatches);
  }

  function runAllForData() {
    const out = [];
    for (const entry of allEntries()) {
      try {
        const { items, error } = runEntry(entry);
        out.push({
          id: entry.id,
          kind: entry.kind,
          ok: !!items,
          error: error || null,
          items: items ? items.slice(0, 40).map((i) => i.fields) : []
        });
      } catch (e) {
        out.push({ id: entry.id, kind: entry.kind, ok: false, error: String(e.message || e), items: [] });
      }
    }
    return out;
  }

  function runEntry(entry) {
    let items;
    if (entry.engine === 'dsl') {
      items = window.MyFitDSL.run(entry.program, document).items;
    } else if (entry.engine === 'js') {
      const fn = window.MyFitBundled[entry.id];
      if (typeof fn !== 'function') return { items: null, error: 'bundled fn missing' };
      items = fn(document) || [];
      items = items.slice(0, 60).map((it) => (it.el ? { el: it.el, fields: { ...it, el: undefined } } : { el: null, fields: it }));
    } else {
      return { items: null, error: `unknown engine ${entry.engine}` };
    }
    const check = window.MyFitValidate.validate(items, entry);
    if (!check.ok) return { items: null, error: check.errors.join('; ') };
    return { items };
  }

  function fromRegistry(kind) {
    for (const entry of findEntries(kind)) {
      try {
        const { items, error } = runEntry(entry);
        if (items) return { items, source: `registry:${entry.id}` };
        reportFailure(entry, error);
      } catch (e) {
        reportFailure(entry, e.message);
      }
    }
    return null;
  }

  function reportFailure(entry, error) {
    chrome.runtime.sendMessage({ type: 'parser-failed', id: entry.id, url: location.href, error: String(error).slice(0, 300) }).catch(() => {});
  }

  function jsonldProduct() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        let data = JSON.parse(s.textContent);
        const list = Array.isArray(data) ? data : data['@graph'] || [data];
        for (const node of list) {
          if (node && /Product$/i.test(String(node['@type'] || ''))) return node;
        }
      } catch {}
    }
    return null;
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  }

  function groupHint(el) {
    let hint = 0;
    let node = el;
    for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
      const attrs = [node.id, node.className, node.getAttribute?.('aria-label'), node.getAttribute?.('data-attribute'), node.getAttribute?.('data-csa-c-content-id')]
        .filter((v) => typeof v === 'string')
        .join(' ');
      if (/size/i.test(attrs)) hint += 6;
      if (/(quantity|qty|pack|count|number.?of.?items|bundle)/i.test(attrs)) hint -= 8;
      if (/(color|colour|style|flavor|material)/i.test(attrs)) hint -= 4;
    }
    return hint;
  }

  function looksDisabled(el) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return true;
    if (/disabled|unavailable|out-of-stock|soldout|strike/i.test(`${el.className} ${el.parentElement?.className || ''}`)) return true;
    const s = getComputedStyle(el);
    if (s.textDecorationLine.includes('line-through') || parseFloat(s.opacity) < 0.55 || s.pointerEvents === 'none' || s.cursor === 'not-allowed') return true;
    let i = 0;
    for (const ch of el.querySelectorAll('*')) {
      if (++i > 6) break;
      if (getComputedStyle(ch).textDecorationLine.includes('line-through')) return true;
    }
    return false;
  }

  function heuristicSizes() {
    const groups = document.querySelectorAll(
      '[class*="size" i], [id*="size" i], [data-attribute*="size" i], [aria-label*="size" i], fieldset, [role="radiogroup"], [role="listbox"], ul'
    );
    const scored = [];
    const used = new Set();
    for (const group of groups) {
      if (used.has(group)) continue;
      used.add(group);
      const opts = group.querySelectorAll('button, [role="radio"], [role="option"], label, li, a');
      if (opts.length > 80) continue;
      const local = [];
      const seenLocal = new Set();
      for (const o of opts) {
        const t = (o.textContent || '').trim().replace(/\s+/g, ' ');
        if (t.length > 16 || !SIZE_RE.test(t)) continue;
        if (!visible(o) || seenLocal.has(t)) continue;
        seenLocal.add(t);
        local.push(o);
      }
      if (local.length < 2) continue;
      const wordy = local.filter((o) => /[a-z]/i.test(o.textContent)).length;
      const score = groupHint(group) + Math.min(local.length, 8) + (wordy >= 2 ? 3 : 0);
      scored.push({ score, local });
    }
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 2) return [];
    return best.local.slice(0, 16).map((o) => ({
      el: o,
      fields: {
        text: o.textContent.trim().replace(/\s+/g, ' '),
        disabled: looksDisabled(o),
        selected: o.getAttribute('aria-checked') === 'true' || o.getAttribute('aria-selected') === 'true' || /\b(selected|active|checked)\b/i.test(`${o.className} ${o.parentElement?.className || ''}`)
      }
    }));
  }

  function heuristicReviews() {
    const found = [];
    const seenText = new Set();
    const zones = [...document.querySelectorAll(
      '[class*="review" i], [id*="review" i], [data-hook*="review" i], [class*="comment" i], [itemprop="review"]'
    )].slice(0, 50);
    for (const z of zones) {
      if (found.length >= 18) break;
      const blocks = z.querySelectorAll('p, span, div');
      for (const b of blocks) {
        if (found.length >= 18) break;
        if (b.children.length > 2) continue;
        const t = (b.textContent || '').trim().replace(/\s+/g, ' ');
        if (t.length < 50 || t.length > 480) continue;
        const key = t.slice(0, 80);
        if (seenText.has(key)) continue;
        if (!/\b(fit|size|sizing|small|large|tight|loose|big|snug|true to|runs|quality|fabric|material|comfortable|shrink|stretch|width|narrow|wide|length|short|long)\b/i.test(t)) continue;
        seenText.add(key);
        found.push({ el: b, fields: { text: t.slice(0, 420) } });
      }
    }
    return found;
  }

  function sizes() {
    const hit = fromRegistry('sizes');
    if (hit) return hit;
    return { items: heuristicSizes(), source: 'heuristic' };
  }

  function reviews() {
    const hit = fromRegistry('reviews');
    if (hit) return hit;
    return { items: heuristicReviews(), source: 'heuristic' };
  }

  function purchases() {
    const hit = fromRegistry('purchases');
    return hit || { items: [], source: 'none' };
  }

  function bestTitle() {
    const known = document.querySelector('#productTitle, [data-testid*="product-title" i], [itemprop="name"]');
    const knownText = known?.textContent?.trim().replace(/\s+/g, ' ');
    if (knownText && knownText.length > 5) return knownText.slice(0, 160);
    const og = document.querySelector('meta[property="og:title"]')?.content;
    if (og && og.length > 5) return og.slice(0, 160);
    let best = '';
    for (const h of document.querySelectorAll('h1')) {
      if (!visible(h)) continue;
      const t = (h.textContent || '').trim().replace(/\s+/g, ' ');
      if (t.length > best.length) best = t;
    }
    return (best || document.title).slice(0, 160);
  }

  function bestBrand() {
    const itemprop = document.querySelector('[itemprop="brand"]');
    const ipText = itemprop?.textContent?.trim().replace(/\s+/g, ' ');
    if (ipText && ipText.length <= 60) return ipText;
    const meta = document.querySelector('meta[property="product:brand"], meta[name="brand"]')?.content;
    if (meta) return meta.slice(0, 60);
    const byline = document.querySelector('#bylineInfo, [id*="byline" i], [class*="byline" i], a[href*="/stores/"]');
    if (byline) {
      const t = (byline.textContent || '').trim().replace(/\s+/g, ' ');
      const m = t.match(/visit the (.+?) store|^brand:\s*(.+)$/i);
      if (m) return (m[1] || m[2] || '').slice(0, 60);
      if (t.length > 1 && t.length <= 40) return t;
    }
    return '';
  }

  function bestPrice() {
    const els = [...document.querySelectorAll('[itemprop="price"], [class*="price" i][class*="current" i], [data-testid*="price" i], [class*="price" i]')].slice(0, 60);
    for (const pe of els) {
      if (!visible(pe)) continue;
      const pt = (pe.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      const m = pt.match(/[$£€₹¥]\s?[\d,]+(\.\d{1,2})?|\d[\d,]*(\.\d{1,2})?\s?(USD|EUR|GBP|INR)/);
      if (m) return m[0];
    }
    return '';
  }

  function productInfo() {
    const hit = fromRegistry('item');
    if (hit && hit.items[0]) {
      const f = hit.items[0].fields;
      return { title: f.title || '', price: f.price || '', brand: f.brand || '', source: hit.source };
    }
    const ld = jsonldProduct();
    if (ld) {
      const offer = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
      return {
        title: String(ld.name || '').slice(0, 160) || bestTitle(),
        price: offer?.price ? `${offer.priceCurrency || ''} ${offer.price}`.trim() : bestPrice(),
        brand: String(ld.brand?.name || ld.brand || '').slice(0, 60) || bestBrand(),
        source: 'jsonld'
      };
    }
    return { title: bestTitle(), price: bestPrice(), brand: bestBrand(), source: 'heuristic' };
  }

  function testEntry(entry) {
    const t0 = performance.now();
    try {
      let items;
      if (entry.engine === 'dsl') items = window.MyFitDSL.run(entry.program, document).items;
      else if (entry.engine === 'js' && entry.code) {
        const fn = window.MyFitBundled[entry.id];
        if (typeof fn !== 'function') return { ok: false, error: 'js entries can only be tested via run_javascript in dev; bundled fn not loaded' };
        items = fn(document) || [];
      } else return { ok: false, error: 'untestable entry' };
      const check = window.MyFitValidate.validate(items, entry);
      return {
        ok: check.ok,
        errors: check.errors,
        count: items.length,
        ms: Math.round(performance.now() - t0),
        sample: items.slice(0, 5).map((i) => i.fields || i)
      };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type === 'dev-test-entry') {
      ready.then(() => sendResponse(testEntry(msg.entry)));
      return true;
    }
    if (msg.type === 'dev-refresh-registry') {
      loadRegistry().then(() => sendResponse({ ok: true }));
      return true;
    }
  });

  window.__myfitExtract = { ready, sizes, reviews, purchases, productInfo, jsonldProduct, testEntry, findEntries, allEntries, runAllForData, refresh: loadRegistry, registrySource: () => registry };
})();
