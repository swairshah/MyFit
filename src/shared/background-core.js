const DEFAULTS = {
  settings: {
    provider: 'anthropic',
    anthropicKey: '',
    openaiKey: '',
    anthropicModel: 'claude-sonnet-4-6',
    openaiModel: 'gpt-5.5',
    autoAnalyze: true,
    highlightSeconds: 14,
    disabledSites: []
  },
  profile: {
    sizes: { tops: '', bottoms: '', shoes: '', outerwear: '', dress: '' },
    fitPref: 'regular',
    heightCm: '',
    notes: '',
    brandNotes: []
  },
  purchases: []
};

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const init = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (cur[k] === undefined) init[k] = DEFAULTS[k];
  }
  if (Object.keys(init).length) await chrome.storage.local.set(init);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'toggle-panel' }).catch(() => {});
});

async function getState() {
  const s = await chrome.storage.local.get(['settings', 'profile', 'purchases']);
  return {
    settings: { ...DEFAULTS.settings, ...s.settings },
    profile: { ...DEFAULTS.profile, ...s.profile },
    purchases: s.purchases || []
  };
}

async function callLLM(settings, system, userText, maxTokens) {
  if (settings.provider === 'openai') {
    if (!settings.openaiKey) throw new Error('No OpenAI API key set. Open the MyFit popup and add one in Settings.');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.openaiKey}`
      },
      body: JSON.stringify({
        model: settings.openaiModel,
        max_completion_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText }
        ]
      })
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
  if (!settings.anthropicKey) throw new Error('No Anthropic API key set. Open the MyFit popup and add one in Settings.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: settings.anthropicModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userText }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('');
}

function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Model did not return JSON.');
  return JSON.parse(raw.slice(start, end + 1));
}

function profileBlock(profile, purchases) {
  const sizes = Object.entries(profile.sizes || {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  const brandNotes = (profile.brandNotes || [])
    .map((b) => `- ${b.brand}: ${b.note}`)
    .join('\n');
  const relevant = purchases
    .slice(-25)
    .map(
      (p) =>
        `- ${p.date || '?'} | ${p.brand || '?'} ${p.item || ''} | category ${p.category || '?'} | size ${p.size || '?'}${p.fit ? ` | fit felt: ${p.fit}` : ''}${p.notes ? ` | note: ${p.notes}` : ''}`
    )
    .join('\n');
  return [
    `USER FIT PROFILE`,
    sizes ? `Usual sizes — ${sizes}` : `Usual sizes — not provided yet`,
    profile.heightCm ? `Height: ${profile.heightCm} cm` : '',
    `Fit preference: ${profile.fitPref || 'regular'}`,
    profile.notes ? `Style notes: ${profile.notes}` : '',
    brandNotes ? `Brand-specific notes:\n${brandNotes}` : '',
    relevant ? `PURCHASE HISTORY (most recent last):\n${relevant}` : 'PURCHASE HISTORY: none recorded yet'
  ]
    .filter(Boolean)
    .join('\n');
}

const ANALYZE_SYSTEM = `You are MyFit, a careful personal fit-and-style advisor embedded in a browser extension. You receive a structured extract of an e-commerce product page (title, price, size options, review snippets — each with a stable id) plus the user's fit profile and purchase history.

Your job:
1. Decide if this is really a product page the user might buy from.
2. Mine the review snippets for sizing and quality signals: "runs small/large", "size up/down", brand-vs-brand comparisons ("M here fits like S at X"), fabric/shrinkage complaints, fit on specific body types.
3. Cross-reference with the user's history (e.g. they wear M at brand A, reviews say this brand runs small versus A → suggest L).
4. Pick at most 3 elements to highlight, by candidate id. Prefer circling the single recommended size option. Underline at most one especially telling review snippet. Never highlight more than 3 things — this must feel gentle, not noisy.

AVAILABILITY IS A HARD RULE: never recommend or circle a size marked (out of stock). If the size you would otherwise recommend (e.g. the user's usual size) is out of stock, SAY THAT — it is exactly the useful thing to know: recommend the nearest available size instead, and make the label explicit, e.g. "Your usual M is sold out here — L is the closest available, reviews say it runs small anyway". If everything sensible is sold out, anchor a warn-tone note to the title saying so.

Highlight kinds:
- "circle": hand-drawn circle around the element (use on the recommended size option).
- "underline": wavy underline (use on one telling review snippet).
- "note": a small annotation card pinned next to the element, with an optional "size" headline. Use a note anchored to the TITLE anchor candidate whenever there are NO size option candidates but reviews still carry sizing signal — give concrete guidance like "Reviewers say it runs small; with your usual M, try L here". A page without a size picker should still get one useful note if reviews allow it.

Respond with ONLY a JSON object, no prose:
{
  "is_product_page": boolean,
  "category": "tops"|"bottoms"|"shoes"|"outerwear"|"dress"|"accessory"|"other",
  "recommendation": { "size": string|null, "confidence": "high"|"medium"|"low", "summary": "one or two warm, concise sentences" },
  "highlights": [ { "target": "<candidate id>", "kind": "circle"|"underline"|"note", "label": "<text shown with the drawing; max 90 chars for circle/underline, max 140 for note>", "size": "<headline size for notes, optional>", "tone": "good"|"warn"|"info" } ],
  "sizing_intel": [ "<short bullet of what reviewers say about sizing/quality, max 4>" ]
}

If nothing at all is worth highlighting, return an empty highlights array. If the user profile is empty, base the recommendation on reviews alone and lower confidence. Labels must be specific ("Reviews: runs ~1 size small vs your usual M at Uniqlo") not generic ("Good choice").`;

const PURCHASE_SYSTEM = `You extract a completed purchase from an order-confirmation page extract. Respond with ONLY JSON:
{ "items": [ { "brand": string, "item": string, "category": "tops"|"bottoms"|"shoes"|"outerwear"|"dress"|"accessory"|"other", "size": string|null, "price": string|null } ] }
Only include real purchased items, not recommendations or ads. If nothing identifiable, return {"items":[]}.`;

const ASK_SYSTEM = `You are MyFit, a warm, concise personal fit-and-style advisor in a small side panel. Ground every answer in the provided page extract, the user's fit profile and purchase history. Mine reviews for sizing signals when relevant. Keep answers short (2-5 sentences), plain text, no markdown headers, no bullet lists unless the user asks for a comparison. If you are unsure, say what extra info would help.`;

async function handleAnalyze(payload) {
  const { settings, profile, purchases } = await getState();
  const user = [
    profileBlock(profile, purchases),
    '',
    'PAGE EXTRACT',
    `URL: ${payload.url}`,
    `Title: ${payload.title}`,
    payload.price ? `Price: ${payload.price}` : '',
    payload.anchorCandidates?.length
      ? `Anchor candidates (for "note" highlights):\n${payload.anchorCandidates.map((c) => `[${c.id}] ${c.role}: "${c.text}"`).join('\n')}`
      : '',
    payload.sizeCandidates.length
      ? `Size option candidates:\n${payload.sizeCandidates.map((c) => `[${c.id}] "${c.text}"${c.selected ? ' (currently selected)' : ''}${c.disabled ? ' (out of stock)' : ''}`).join('\n')}`
      : 'Size option candidates: NONE FOUND on this page — if reviews carry sizing signal, anchor a "note" to the title instead.',
    payload.reviewCandidates.length
      ? `Review snippets:\n${payload.reviewCandidates.map((c) => `[${c.id}] ${c.text}`).join('\n')}`
      : 'Review snippets: none found on this page',
    payload.extraText ? `Other page text:\n${payload.extraText}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  const text = await callLLM(settings, ANALYZE_SYSTEM, user, 1200);
  return extractJSON(text);
}

async function handleAsk(payload) {
  const { settings, profile, purchases } = await getState();
  const convo = (payload.history || [])
    .map((m) => `${m.role === 'user' ? 'User' : 'MyFit'}: ${m.text}`)
    .join('\n');
  const user = [
    profileBlock(profile, purchases),
    '',
    'PAGE EXTRACT',
    `URL: ${payload.url}`,
    `Title: ${payload.title}`,
    payload.pageText ? payload.pageText : '',
    convo ? `\nCONVERSATION SO FAR\n${convo}` : '',
    '',
    `User: ${payload.question}`
  ]
    .filter(Boolean)
    .join('\n');
  return callLLM(settings, ASK_SYSTEM, user, 800);
}

async function handlePurchaseExtract(payload) {
  const { settings } = await getState();
  const user = `URL: ${payload.url}\nTitle: ${payload.title}\nPage text:\n${payload.pageText}`;
  const text = await callLLM(settings, PURCHASE_SYSTEM, user, 800);
  return extractJSON(text);
}

async function savePurchases(items, site) {
  const { purchases } = await chrome.storage.local.get('purchases');
  const list = purchases || [];
  const date = new Date().toISOString().slice(0, 10);
  for (const it of items) {
    list.push({
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date,
      site,
      brand: it.brand || '',
      item: it.item || '',
      category: it.category || 'other',
      size: it.size || '',
      price: it.price || '',
      fit: '',
      notes: ''
    });
  }
  await chrome.storage.local.set({ purchases: list });
  return list.length;
}

async function getRegistry() {
  let packaged = { version: 0, entries: [] };
  try {
    const res = await fetch(chrome.runtime.getURL('parsers/registry.json'));
    packaged = await res.json();
  } catch {}
  const { devParsers } = await chrome.storage.local.get('devParsers');
  const dev = Object.values(devParsers || {});
  const ids = new Set(dev.map((e) => e.id));
  return {
    version: packaged.version,
    entries: [...dev, ...(packaged.entries || []).filter((e) => !ids.has(e.id))]
  };
}

let sitesCache = null;

async function getSiteMatch(url) {
  if (!sitesCache) {
    try {
      const res = await fetch(chrome.runtime.getURL('parsers/sites.json'));
      sitesCache = await res.json();
    } catch {
      sitesCache = { domains: [] };
    }
  }
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return { listed: false, productUrl: false }; }
  const { extraSites } = await chrome.storage.local.get('extraSites');
  const all = [...(sitesCache.domains || []), ...(extraSites || []).map((d) => (typeof d === 'string' ? { domain: d } : d))];
  for (const entry of all) {
    if (host !== entry.domain && !host.endsWith(`.${entry.domain}`)) continue;
    let productUrl = false;
    let ordersUrl = false;
    if (entry.productUrlPattern) {
      try { productUrl = new RegExp(entry.productUrlPattern).test(url); } catch {}
    }
    if (entry.ordersUrlPattern) {
      try { ordersUrl = new RegExp(entry.ordersUrlPattern).test(url); } catch {}
    }
    return { listed: true, productUrl, ordersUrl, domain: entry.domain };
  }
  return { listed: false, productUrl: false, ordersUrl: false };
}

async function logParserFailure(msg) {
  const { parserFailures } = await chrome.storage.local.get('parserFailures');
  const log = parserFailures || [];
  log.push({ id: msg.id, url: msg.url, error: msg.error, at: Date.now() });
  await chrome.storage.local.set({ parserFailures: log.slice(-200) });
  return true;
}

globalThis.MyFitHandlers = {
  analyze: (msg) => handleAnalyze(msg.payload),
  ask: (msg) => handleAsk(msg.payload),
  'extract-purchase': (msg) => handlePurchaseExtract(msg.payload),
  'save-purchases': (msg) => savePurchases(msg.items, msg.site),
  'get-state': () => getState(),
  'get-registry': () => getRegistry(),
  'site-match': (msg, sender) => getSiteMatch(msg.url || sender?.tab?.url || ''),
  'parser-failed': (msg) => logParserFailure(msg)
};

globalThis.MyFitLLM = { callLLM, extractJSON, getState };

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = globalThis.MyFitHandlers[msg.type];
  if (!handler) {
    sendResponse({ ok: false, error: `Unknown message: ${msg.type}` });
    return false;
  }
  (async () => {
    try {
      sendResponse({ ok: true, data: await handler(msg, sender) });
    } catch (e) {
      sendResponse({ ok: false, error: e.message || String(e) });
    }
  })();
  return true;
});
