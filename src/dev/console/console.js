const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let runTabId = null;
let running = false;

function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

async function pickActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs.find((t) => t.url && /^https?:/.test(t.url) && !t.url.includes(location.host));
  if (tab) {
    runTabId = tab.id;
    $('#tabUrl').textContent = tab.url;
    $('#tabDot').classList.add('on');
  } else {
    const all = await chrome.tabs.query({ currentWindow: true });
    const candidate = all.find((t) => t.url && /^https?:/.test(t.url));
    if (candidate) {
      runTabId = candidate.id;
      $('#tabUrl').textContent = candidate.url;
      $('#tabDot').classList.add('on');
    } else {
      runTabId = null;
      $('#tabUrl').textContent = 'Open a product page in another tab first';
      $('#tabDot').classList.remove('on');
    }
  }
}

function traceNode(entry) {
  const div = document.createElement('div');
  if (entry.kind === 'tool' || entry.kind === 'tool-result') {
    const d = document.createElement('details');
    d.className = 't t-tool';
    const isResult = entry.kind === 'tool-result';
    const payload = isResult ? entry.output : JSON.stringify(entry.input, null, 2);
    const meta = isResult ? `${(payload || '').length} chars returned` : summarizeInput(entry);
    d.innerHTML = `
      <summary>
        <span class="chev">›</span>
        <span class="tname">${isResult ? '↳ ' : ''}${entry.name}</span>
        <span class="tmeta"></span>
      </summary>
      <pre></pre>`;
    d.querySelector('.tmeta').textContent = meta;
    d.querySelector('pre').textContent = pretty(payload);
    return d;
  }
  div.className = `t t-${entry.kind}`;
  if (entry.kind === 'saved') div.textContent = `Saved parser ${entry.data?.id} (${entry.data?.engine})`;
  else if (entry.kind === 'start') div.textContent = `Run started — ${new Date(entry.ts).toLocaleTimeString()}`;
  else div.textContent = entry.text || entry.kind;
  return div;
}

function summarizeInput(entry) {
  const i = entry.input || {};
  if (entry.name === 'run_javascript') return (i.code || '').slice(0, 90).replace(/\s+/g, ' ');
  if (entry.name === 'test_parser' || entry.name === 'save_parser') return i.entry?.id || '';
  if (entry.name === 'get_parsers') return i.domain || 'run tab domain';
  return '';
}

function pretty(payload) {
  if (typeof payload !== 'string') return JSON.stringify(payload, null, 2);
  try { return JSON.stringify(JSON.parse(payload), null, 2); } catch { return payload; }
}

function addTrace(entry) {
  $('#traceEmpty').style.display = 'none';
  const t = $('#trace');
  const atBottom = t.scrollHeight - t.scrollTop - t.clientHeight < 60;
  t.appendChild(traceNode(entry));
  if (atBottom) t.scrollTop = t.scrollHeight;
  if (entry.kind === 'saved') renderParsers();
  if (entry.kind === 'stopped' || entry.kind === 'done' || entry.kind === 'error') {
    setRunning(false);
    renderRuns();
  }
}

function setRunning(on) {
  running = on;
  $('#run').disabled = on;
  $('#stop').hidden = !on;
  $('#tabDot').classList.toggle('busy', on);
}

async function renderParsers() {
  const res = await send('dev-list-parsers');
  const list = res?.ok ? res.data : [];
  const holder = $('#parserList');
  holder.innerHTML = '';
  $('#parserEmpty').hidden = list.length > 0;
  for (const p of list) {
    const card = document.createElement('div');
    card.className = 'parser';
    card.innerHTML = `
      <div class="head"><span class="pid"></span><span class="engine"></span></div>
      <div class="desc"></div>
      <div class="acts">
        <button data-act="test">Test on run tab</button>
        <button data-act="copy">Copy JSON</button>
        <button data-act="delete" class="danger">Delete</button>
      </div>`;
    card.querySelector('.pid').textContent = p.id;
    card.querySelector('.engine').textContent = p.engine;
    card.querySelector('.desc').textContent = p.description || '';
    card.querySelector('[data-act="test"]').addEventListener('click', async (e) => {
      if (!runTabId) return;
      e.target.textContent = 'Testing...';
      const out = await chrome.tabs.sendMessage(runTabId, { type: 'dev-test-entry', entry: p }).catch((err) => ({ ok: false, error: String(err.message || err) }));
      e.target.textContent = 'Test on run tab';
      let pre = card.querySelector('.test-out');
      if (!pre) {
        pre = document.createElement('div');
        pre.className = 'test-out';
        card.appendChild(pre);
      }
      pre.textContent = JSON.stringify(out, null, 2);
    });
    card.querySelector('[data-act="copy"]').addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify(p, null, 2));
    });
    card.querySelector('[data-act="delete"]').addEventListener('click', async () => {
      await send('dev-delete-parser', { id: p.id });
      renderParsers();
    });
    holder.appendChild(card);
  }
}

async function renderRuns() {
  const { devRuns } = await chrome.storage.local.get('devRuns');
  const list = devRuns || [];
  const holder = $('#runList');
  holder.innerHTML = '';
  $('#runEmpty').hidden = list.length > 0;
  for (const r of list.slice(0, 10)) {
    const div = document.createElement('div');
    div.className = 'failure';
    const when = new Date(r.startedAt).toLocaleString();
    const dur = r.finishedAt ? `${Math.round((r.finishedAt - r.startedAt) / 1000)}s` : '';
    div.textContent = `${r.domain} ${r.auto ? '(auto)' : '(manual)'} — ${r.outcome} ${r.saved?.length ? `[${r.saved.join(', ')}]` : ''}\n${when} · ${dur}`;
    holder.appendChild(div);
  }
}

async function renderFailures() {
  const res = await send('dev-failures');
  const list = res?.ok ? res.data : [];
  const holder = $('#failureList');
  holder.innerHTML = '';
  $('#failureEmpty').hidden = list.length > 0;
  for (const f of list.slice(0, 12)) {
    const div = document.createElement('div');
    div.className = 'failure';
    div.textContent = `${f.id} — ${f.error}\n${f.url}`;
    holder.appendChild(div);
  }
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function init() {
  const stored = localStorage.getItem('myfit-theme');
  applyTheme(stored || 'system');
  $('#themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('myfit-theme', next);
    applyTheme(next);
  });

  await pickActiveTab();
  $('#refreshTab').addEventListener('click', pickActiveTab);

  const { devAutoRun } = await chrome.storage.local.get('devAutoRun');
  const autoRun = $('#autoRun');
  autoRun.checked = devAutoRun !== false;
  autoRun.addEventListener('change', () => chrome.storage.local.set({ devAutoRun: autoRun.checked }));

  const status = await send('dev-agent-status');
  if (status?.ok && status.data) {
    for (const entry of status.data.trace) addTrace(entry);
    setRunning(status.data.active);
  }

  $('#run').addEventListener('click', async () => {
    if (!runTabId) return;
    const kinds = $$('#kinds input:checked').map((c) => c.value);
    if (!kinds.length) return;
    setRunning(true);
    const res = await send('dev-run-agent', { tabId: runTabId, kinds, instructions: $('#instructions').value.trim() });
    if (!res?.ok) {
      setRunning(false);
      addTrace({ kind: 'error', text: res?.error || 'Could not start run.', ts: Date.now() });
      if (/user scripts/i.test(res?.error || '')) $('#permHint').hidden = false;
    }
  });

  $('#stop').addEventListener('click', async () => {
    await send('dev-stop-agent');
    setRunning(false);
  });

  $('#clearTrace').addEventListener('click', () => {
    $('#trace').innerHTML = '';
    $('#traceEmpty').style.display = '';
  });

  $('#export').addEventListener('click', async () => {
    const res = await send('dev-export');
    if (!res?.ok) return;
    download('registry.json', res.data.registryJson);
    if (res.data.jsCount > 0) download('bundled.js', res.data.bundledJs);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'dev-trace') {
      addTrace(msg.entry);
      if (msg.entry.kind === 'start') setRunning(true);
    }
  });

  renderParsers();
  renderRuns();
  renderFailures();
}

init();
