(() => {
  if (!window.__myfit || window.__myfit.analyzer) return;
  const M = window.__myfit;
  M.analyzer = true;

  const candidates = new Map();
  let cid = 0;
  let analyzed = false;
  let settings = null;

  function register(el) {
    const id = `c${cid++}`;
    candidates.set(id, el);
    return id;
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  }

  function looksLikeProductPage(info, site) {
    if (site?.productUrl) return true;
    let score = site?.listed ? 1 : 0;
    if (info.source === 'jsonld' || info.source.startsWith('registry:')) score += 2;
    if (document.querySelector('meta[property="og:type"][content*="product" i]')) score += 2;
    const btns = [...document.querySelectorAll('button, input[type="submit"], a, [role="button"]')].slice(0, 1500);
    if (btns.some((b) => /add to (cart|bag|basket)|buy now/i.test((b.textContent || b.value || '').trim().slice(0, 40)))) score += 2;
    if (info.price) score += 1;
    return score >= 3;
  }

  function looksLikeOrderConfirmation() {
    if (!/(confirm|thank|success|checkout|order|purchase)/i.test(location.href)) return false;
    const t = bodyText().slice(0, 4000);
    const textHit = /(thank you for your (order|purchase)|order (confirmed|placed|complete)|your order (number|is)|order confirmation)/i.test(t);
    const urlHit = /(confirm|thank|success|checkout\/complete|order-?(placed|complete|received))/i.test(location.href);
    return textHit && (urlHit || /order\s*(#|number|no\.?)/i.test(t));
  }

  let textCache = { href: '', at: 0, body: '' };

  function bodyText() {
    if (textCache.href === location.href && Date.now() - textCache.at < 6000) return textCache.body;
    textCache = { href: location.href, at: Date.now(), body: (document.body.innerText || '').replace(/\s+/g, ' ') };
    return textCache.body;
  }

  function pageTextSummary(limit = 5500) {
    const info = window.__myfitExtract.productInfo();
    const desc =
      document.querySelector('meta[name="description"]')?.content ||
      document.querySelector('[class*="description" i], [id*="description" i]')?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 900) ||
      '';
    const bodyBits = bodyText().slice(0, limit - desc.length - 300);
    return [`Title: ${info.title}`, info.price ? `Price: ${info.price}` : '', info.brand ? `Brand: ${info.brand}` : '', desc ? `Description: ${desc}` : '', `Page text: ${bodyBits}`]
      .filter(Boolean)
      .join('\n');
  }

  function applyHighlights(data) {
    const lifespan = settings?.highlightSeconds ?? 14;
    let drawn = 0;
    for (const h of (data.highlights || []).slice(0, 3)) {
      const el = candidates.get(h.target);
      if (!el || !el.isConnected || !visible(el)) continue;
      const fn = h.kind === 'underline' ? M.crayon.underline : h.kind === 'note' ? M.crayon.note : M.crayon.circle;
      fn(el, {
        label: h.label,
        headline: h.size || undefined,
        tone: h.tone || 'info',
        lifespan: (h.kind === 'note' ? lifespan + 8 : lifespan) + drawn * 2
      });
      drawn++;
    }
    return drawn;
  }

  async function analyze(manual) {
    if (analyzed && !manual) return;
    analyzed = true;
    await window.__myfitExtract.ready;
    const ex = window.__myfitExtract;
    const info = ex.productInfo();
    const sizeResult = ex.sizes();
    const reviewResult = ex.reviews();
    const anchors = [];
    const titleEl =
      document.querySelector('#productTitle, [itemprop="name"]') ||
      [...document.querySelectorAll('h1')].filter(visible).sort((a, b) => (b.textContent || '').length - (a.textContent || '').length)[0];
    if (titleEl) anchors.push({ id: register(titleEl), role: 'title', text: (titleEl.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90) });
    const priceEl = [...document.querySelectorAll('[itemprop="price"], [class*="price" i]')].find((e) => visible(e) && /[$£€₹¥]\s?[\d,]+/.test(e.textContent || ''));
    if (priceEl) anchors.push({ id: register(priceEl), role: 'price', text: (priceEl.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) });
    const payload = {
      url: location.href,
      title: info.title,
      price: info.price,
      brand: info.brand,
      anchorCandidates: anchors,
      sizeCandidates: sizeResult.items.map((it) => ({
        id: register(it.el),
        text: it.fields.text,
        disabled: !!it.fields.disabled,
        selected: !!it.fields.selected
      })),
      reviewCandidates: reviewResult.items.map((it) => ({ id: register(it.el), text: it.fields.text })),
      extractSources: { sizes: sizeResult.source, reviews: reviewResult.source, item: info.source },
      extraText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 1800)
    };
    const res = await chrome.runtime.sendMessage({ type: 'analyze', payload }).catch(() => null);
    if (!res?.ok) {
      if (manual && M.ui) {
        M.ui.open();
        M.ui.addMsg('err', res?.error || 'Analysis failed.');
      }
      return;
    }
    const data = res.data;
    window.__myfitLastAnalysis = { at: Date.now(), payload, response: data };
    if (!data.is_product_page && !manual) return;
    const ctx = { url: location.href, title: payload.title, pageText: pageTextSummary() };
    M.ui.setContext(ctx);
    M.ui.setAnalysis(data, ctx);
    M.ui.onRedraw = () => { M.crayon.clear(); applyHighlights(data); };
    const drawn = applyHighlights(data);
    M.ui.showPebble(drawn > 0 || (data.sizing_intel || []).length > 0);
    if (manual) M.ui.open();
  }

  async function offerPurchaseCapture() {
    await window.__myfitExtract.ready;
    const info = window.__myfitExtract.productInfo();
    M.ui.setContext({ url: location.href, title: info.title, pageText: pageTextSummary(3500) });
    M.ui.showPebble(true);
    M.ui.setFootAction('Log this purchase', async (b) => {
      b.disabled = true;
      const parsed = window.__myfitExtract.purchases();
      let items = null;
      if (parsed.items.length) {
        items = parsed.items.map((it) => it.fields);
      } else {
        b.textContent = 'Reading order...';
        const res = await chrome.runtime
          .sendMessage({ type: 'extract-purchase', payload: { url: location.href, title: info.title, pageText: pageTextSummary(5000) } })
          .catch(() => null);
        if (!res?.ok || !res.data.items?.length) {
          b.textContent = res?.ok ? 'Nothing found to log' : 'Failed - check API key';
          setTimeout(() => { b.disabled = false; b.textContent = 'Log this purchase'; }, 2500);
          return;
        }
        items = res.data.items;
      }
      const save = await chrome.runtime.sendMessage({ type: 'save-purchases', items, site: location.hostname });
      b.textContent = save?.ok ? `Saved ${items.length} item${items.length > 1 ? 's' : ''}` : 'Save failed';
      if (save?.ok) {
        M.ui.addMsg('bot', `Logged: ${items.map((i) => `${i.brand || ''} ${i.item} (${i.size || 'no size'})`.trim()).join(', ')}. You can rate the fit later in the MyFit popup.`);
      }
    });
    M.ui.open();
  }

  const ORDERS_RE = /\/(your-)?orders?(\/|$|\?)|order-?history|purchase-?history|my[-_]?orders/i;

  M.getPageText = (limit) => pageTextSummary(limit);

  function refreshData() {
    const data = window.__myfitExtract.runAllForData();
    if (data.length) M.ui.setExtractedData(data);
    return data;
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type === 'toggle-panel') {
      if (M.ui) {
        if (!analyzed) analyze(true);
        else M.ui.toggle();
      }
    }
    if (msg.type === 'myfit-extractors-updated') {
      window.__myfitExtract.refresh().then(() => {
        refreshData();
        sendResponse({ ok: true });
      });
      return true;
    }
  });

  let evalToken = 0;

  async function evaluate() {
    const token = ++evalToken;
    const siteRes = await chrome.runtime.sendMessage({ type: 'site-match', url: location.href }).catch(() => null);
    if (token !== evalToken) return;
    const site = siteRes?.ok ? siteRes.data : null;

    if (site?.productUrl) {
      M.ui.setContext({ url: location.href, title: document.title.slice(0, 160), pageText: '' });
      M.ui.showPebble(false);
    }

    if (looksLikeOrderConfirmation()) {
      offerPurchaseCapture();
      return;
    }

    await window.__myfitExtract.ready;
    if (token !== evalToken) return;
    const entries = window.__myfitExtract.allEntries();
    if (entries.length) {
      M.ui.showPebble(false);
      setTimeout(() => { if (token === evalToken) refreshData(); }, 1200);
    }

    const ordersPage = site?.ordersUrl || ((site?.listed || false) && ORDERS_RE.test(location.pathname));
    if (ordersPage) {
      M.ui.setContext({ url: location.href, title: document.title.slice(0, 160), pageText: '' });
      M.ui.showPebble(false);
      if (!entries.some((e) => /purchase|order/.test(e.kind))) {
        chrome.runtime.sendMessage({ type: 'dev-auto-run', pageType: 'orders' }).catch(() => {});
      }
      return;
    }

    const begin = () => {
      M.ui.showPebble(false);
      if (!entries.length) {
        chrome.runtime.sendMessage({ type: 'dev-auto-run', pageType: 'product' }).catch(() => {});
      }
      if (settings.autoAnalyze) setTimeout(() => { if (token === evalToken) analyze(false); }, 900);
    };

    if (site?.productUrl) {
      begin();
      return;
    }

    const tryStart = () => {
      const info = window.__myfitExtract.productInfo();
      if (!looksLikeProductPage(info, site)) return false;
      M.ui.setContext({ url: location.href, title: info.title, pageText: '' });
      begin();
      return true;
    };
    let attempts = 0;
    const poll = () => {
      if (token !== evalToken) return;
      const run = () => { if (token === evalToken && !tryStart() && ++attempts < 14) setTimeout(poll, 900); };
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 });
      else run();
    };
    poll();
  }

  async function init() {
    const res = await chrome.runtime.sendMessage({ type: 'get-state' }).catch(() => null);
    if (!res?.ok) return;
    settings = res.data.settings;
    if (settings.disabledSites?.includes(location.hostname)) return;
    const hasKey = settings.provider === 'openai' ? !!settings.openaiKey : !!settings.anthropicKey;
    if (!hasKey) return;
    evaluate();
    let lastHref = location.href;
    setInterval(() => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      analyzed = false;
      M.crayon.clear();
      evaluate();
    }, 800);
  }

  if (document.readyState !== 'loading') init();
  else addEventListener('DOMContentLoaded', init, { once: true });
})();
