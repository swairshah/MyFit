const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let state = { settings: {}, profile: {}, purchases: [] };
let saveTimer = 0;
let savebarTimer = 0;

const TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6.5 7l1 13h9l1-13"/></svg>`;

function showSaved() {
  const bar = $('#savebar');
  bar.classList.add('show');
  clearTimeout(savebarTimer);
  savebarTimer = setTimeout(() => bar.classList.remove('show'), 1400);
}

function persist(keys) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const out = {};
    for (const k of keys) out[k] = state[k];
    await chrome.storage.local.set(out);
    showSaved();
  }, 350);
}

function moveIndicator(seg, target) {
  const ind = $('.seg-indicator', seg);
  ind.style.width = `${target.offsetWidth}px`;
  ind.style.transform = `translateX(${target.offsetLeft - 3}px)`;
}

function wireSegment(seg, attr, onPick) {
  $$('.seg-item', seg).forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.seg-item', seg).forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      moveIndicator(seg, btn);
      onPick(btn.dataset[attr]);
    });
  });
}

function setSegment(seg, attr, value) {
  const btn = $$('.seg-item', seg).find((b) => b.dataset[attr] === value) || $('.seg-item', seg);
  $$('.seg-item', seg).forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  requestAnimationFrame(() => moveIndicator(seg, btn));
}

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function renderBrandNotes() {
  const holder = $('#brandNotes');
  holder.innerHTML = '';
  (state.profile.brandNotes || []).forEach((bn, i) => {
    const row = document.createElement('div');
    row.className = 'brand-row';
    const brand = document.createElement('input');
    brand.className = 'input';
    brand.placeholder = 'Brand';
    brand.value = bn.brand || '';
    const note = document.createElement('input');
    note.className = 'input';
    note.placeholder = 'Runs small, size up...';
    note.value = bn.note || '';
    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Remove';
    del.innerHTML = TRASH;
    brand.addEventListener('input', () => { bn.brand = brand.value; persist(['profile']); });
    note.addEventListener('input', () => { bn.note = note.value; persist(['profile']); });
    del.addEventListener('click', () => {
      state.profile.brandNotes.splice(i, 1);
      renderBrandNotes();
      persist(['profile']);
    });
    row.append(brand, note, del);
    holder.appendChild(row);
  });
}

function renderPurchases() {
  const holder = $('#purchaseList');
  const empty = $('#purchaseEmpty');
  holder.innerHTML = '';
  const list = [...state.purchases].reverse();
  empty.hidden = list.length > 0;
  for (const p of list) {
    const card = document.createElement('div');
    card.className = 'purchase';
    const head = document.createElement('div');
    head.className = 'head';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = [p.brand, p.item].filter(Boolean).join(' ') || 'Item';
    head.appendChild(name);
    if (p.size) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = p.size;
      head.appendChild(badge);
    }
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = [p.date, p.site, p.category, p.price].filter(Boolean).join(' · ');
    const controls = document.createElement('div');
    controls.className = 'controls';
    const fit = document.createElement('select');
    fit.innerHTML = `
      <option value="">How did it fit?</option>
      <option value="perfect">Fit perfectly</option>
      <option value="tight">Too tight</option>
      <option value="loose">Too loose</option>
      <option value="short">Too short</option>
      <option value="long">Too long</option>
      <option value="returned">Returned it</option>`;
    fit.value = p.fit || '';
    fit.addEventListener('change', () => { p.fit = fit.value; persist(['purchases']); });
    const del = document.createElement('button');
    del.className = 'del';
    del.title = 'Delete';
    del.innerHTML = TRASH;
    del.addEventListener('click', () => {
      state.purchases = state.purchases.filter((x) => x.id !== p.id);
      renderPurchases();
      persist(['purchases']);
    });
    controls.append(fit, del);
    card.append(head, meta, controls);
    holder.appendChild(card);
  }
}

function renderDisabledSites() {
  const holder = $('#disabledSites');
  const empty = $('#disabledEmpty');
  holder.innerHTML = '';
  const sites = state.settings.disabledSites || [];
  empty.hidden = sites.length > 0;
  sites.forEach((site, i) => {
    const row = document.createElement('div');
    row.className = 'site-row';
    const span = document.createElement('span');
    span.textContent = site;
    const btn = document.createElement('button');
    btn.textContent = 'Enable';
    btn.addEventListener('click', () => {
      state.settings.disabledSites.splice(i, 1);
      renderDisabledSites();
      persist(['settings']);
    });
    row.append(span, btn);
    holder.appendChild(row);
  });
}

function wireProfile() {
  $$('[data-size]').forEach((input) => {
    input.value = state.profile.sizes?.[input.dataset.size] || '';
    input.addEventListener('input', () => {
      state.profile.sizes = state.profile.sizes || {};
      state.profile.sizes[input.dataset.size] = input.value.trim();
      persist(['profile']);
    });
  });
  const height = $('#heightCm');
  height.value = state.profile.heightCm || '';
  height.addEventListener('input', () => { state.profile.heightCm = height.value.trim(); persist(['profile']); });

  const notes = $('#styleNotes');
  notes.value = state.profile.notes || '';
  notes.addEventListener('input', () => { state.profile.notes = notes.value; persist(['profile']); });

  const fitSeg = $('#fitSeg');
  setSegment(fitSeg, 'fit', state.profile.fitPref || 'regular');
  wireSegment(fitSeg, 'fit', (v) => { state.profile.fitPref = v; persist(['profile']); });

  $('#addBrandNote').addEventListener('click', () => {
    state.profile.brandNotes = state.profile.brandNotes || [];
    state.profile.brandNotes.push({ brand: '', note: '' });
    renderBrandNotes();
    const rows = $$('#brandNotes .brand-row input');
    rows[rows.length - 2]?.focus();
  });
  renderBrandNotes();
}

function wirePurchases() {
  const form = $('#purchaseForm');
  $('#addPurchase').addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) $('#pBrand').focus();
  });
  $('#pCancel').addEventListener('click', () => { form.hidden = true; });
  $('#pSave').addEventListener('click', () => {
    const brand = $('#pBrand').value.trim();
    const item = $('#pItem').value.trim();
    if (!brand && !item) return;
    state.purchases.push({
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      date: new Date().toISOString().slice(0, 10),
      site: '',
      brand,
      item,
      category: $('#pCategory').value,
      size: $('#pSize').value.trim(),
      price: '',
      fit: '',
      notes: ''
    });
    ['#pBrand', '#pItem', '#pSize'].forEach((s) => { $(s).value = ''; });
    form.hidden = true;
    renderPurchases();
    persist(['purchases']);
  });
  renderPurchases();
}

function wireSettings() {
  const providerSeg = $('#providerSeg');
  setSegment(providerSeg, 'provider', state.settings.provider || 'anthropic');
  wireSegment(providerSeg, 'provider', (v) => { state.settings.provider = v; persist(['settings']); });

  for (const id of ['anthropicKey', 'openaiKey', 'anthropicModel', 'openaiModel']) {
    const el = $(`#${id}`);
    el.value = state.settings[id] || '';
    el.addEventListener('input', () => { state.settings[id] = el.value.trim(); persist(['settings']); });
  }

  const auto = $('#autoAnalyze');
  auto.setAttribute('aria-checked', String(state.settings.autoAnalyze !== false));
  auto.addEventListener('click', () => {
    const next = auto.getAttribute('aria-checked') !== 'true';
    auto.setAttribute('aria-checked', String(next));
    state.settings.autoAnalyze = next;
    persist(['settings']);
  });

  const secs = $('#highlightSeconds');
  secs.value = state.settings.highlightSeconds ?? 14;
  secs.addEventListener('input', () => {
    const n = parseInt(secs.value, 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 600) {
      state.settings.highlightSeconds = n;
      persist(['settings']);
    }
  });

  renderDisabledSites();
}

function wireTabs() {
  const tabs = $('#tabs');
  setSegment(tabs, 'view', 'profile');
  wireSegment(tabs, 'view', (view) => {
    $$('.view').forEach((v) => v.classList.remove('active'));
    $(`#view-${view}`).classList.add('active');
  });
}

function wireTheme() {
  const stored = localStorage.getItem('myfit-theme');
  applyTheme(stored || 'system');
  $('#themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    localStorage.setItem('myfit-theme', next);
    applyTheme(next);
  });
}

async function wireDevLink() {
  try {
    const url = chrome.runtime.getURL('console/console.html');
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) return;
    $('#devFoot').hidden = false;
    $('#openConsole').addEventListener('click', () => chrome.tabs.create({ url }));
  } catch {}
}

async function init() {
  wireTheme();
  wireDevLink();
  const stored = await chrome.storage.local.get(['settings', 'profile', 'purchases']);
  state.settings = stored.settings || {};
  state.profile = stored.profile || {};
  state.purchases = stored.purchases || [];
  wireTabs();
  wireProfile();
  wirePurchases();
  wireSettings();
}

init();
