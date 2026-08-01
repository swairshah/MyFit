(() => {
  if (!window.__myfit || window.__myfit.ui) return;
  const M = window.__myfit;

  const CSS = `
    .pebble {
      position: fixed;
      right: 20px; bottom: 20px;
      width: 40px; height: 40px;
      border-radius: 999px;
      background: var(--bg-raised);
      box-shadow: var(--shadow-md);
      display: grid; place-content: center;
      pointer-events: auto;
      cursor: pointer;
      border: none;
      color: var(--text-secondary);
      user-select: none;
      opacity: 0;
      transform: scale(0.6);
      transition: opacity 300ms var(--ease-out), transform 300ms var(--ease-spring), box-shadow 120ms var(--ease-out), color 120ms var(--ease-out);
    }
    .pebble.in { opacity: 1; transform: scale(1); }
    .pebble:hover { box-shadow: var(--shadow-lg); color: var(--text); }
    .pebble:active { transform: scale(0.94); }
    .pebble svg { width: 18px; height: 18px; display: block; }
    .pebble .ping {
      position: absolute; top: 3px; right: 3px;
      width: 8px; height: 8px; border-radius: 999px;
      background: var(--accent-9);
      opacity: 0;
      transition: opacity 300ms var(--ease-out);
    }
    .pebble.has-news .ping { opacity: 1; }
    .panel {
      position: fixed;
      right: 20px; bottom: 72px;
      width: 336px;
      max-height: min(560px, calc(100vh - 96px));
      display: none;
      flex-direction: column;
      background: var(--bg-raised);
      border-radius: 16px;
      box-shadow: var(--shadow-lg);
      pointer-events: auto;
      overflow: hidden;
      opacity: 0;
      transform: translateY(8px) scale(0.98);
      transition: opacity 250ms var(--ease-out), transform 300ms var(--ease-spring);
    }
    .panel.open { display: flex; }
    .panel.in { opacity: 1; transform: translateY(0) scale(1); }
    .panel-head {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 14px 10px;
      user-select: none;
    }
    .panel-head .title { font-size: 0.9375rem; font-weight: 600; color: var(--text); }
    .panel-head .spacer { flex: 1; }
    .icon-btn {
      width: 28px; height: 28px;
      display: grid; place-content: center;
      border: none; background: none;
      border-radius: 8px;
      color: var(--text-tertiary);
      cursor: pointer;
      transition: background-color 120ms var(--ease-out), color 120ms var(--ease-out), transform 200ms var(--ease-out);
    }
    .icon-btn:hover { background: var(--overlay-hover); color: var(--text); }
    .icon-btn:active { transform: scale(0.94); }
    .icon-btn svg { width: 15px; height: 15px; display: block; }
    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 0 14px 12px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .rec {
      padding: 10px 12px;
      background: var(--bg-component);
      border-radius: 12px;
      font-size: 0.8125rem;
      line-height: 1.45;
      color: var(--text);
    }
    .rec .size-line { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
    .rec .size { font-size: 1.125rem; font-weight: 600; font-variant-numeric: tabular-nums; }
    .rec .conf { font-size: 0.75rem; color: var(--text-tertiary); }
    .intel { display: flex; flex-direction: column; gap: 6px; }
    .intel .row {
      display: flex; gap: 8px;
      font-size: 0.8125rem; line-height: 1.45;
      color: var(--text-secondary);
    }
    .intel .row::before {
      content: "";
      width: 5px; height: 5px; border-radius: 999px;
      background: var(--text-tertiary);
      flex-shrink: 0;
      margin-top: 7px;
    }
    .msgs { display: flex; flex-direction: column; gap: 8px; }
    .msg {
      max-width: 86%;
      padding: 8px 11px;
      border-radius: 12px;
      font-size: 0.8125rem;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: break-word;
    }
    .msg.user { align-self: flex-end; background: var(--accent-9); color: #fff; border-bottom-right-radius: 5px; }
    .msg.bot { align-self: flex-start; background: var(--bg-component); color: var(--text); border-bottom-left-radius: 5px; }
    .msg.err { align-self: stretch; max-width: none; background: none; color: var(--text-tertiary); font-size: 0.75rem; text-align: center; }
    .thinking { align-self: flex-start; display: flex; gap: 4px; padding: 10px 12px; }
    .thinking span {
      width: 5px; height: 5px; border-radius: 999px;
      background: var(--text-tertiary);
      animation: mf-pulse 1.1s ease-in-out infinite;
    }
    .thinking span:nth-child(2) { animation-delay: 0.18s; }
    .thinking span:nth-child(3) { animation-delay: 0.36s; }
    @keyframes mf-pulse { 0%, 100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }
    .panel-foot { padding: 10px 14px 14px; display: flex; flex-direction: column; gap: 8px; }
    .ask-row { display: flex; gap: 8px; }
    .ask-input {
      flex: 1;
      height: 34px;
      padding: 0 12px;
      border: none;
      border-radius: 10px;
      background: var(--bg-component);
      color: var(--text);
      font-size: 0.8125rem;
      font-family: inherit;
      outline: none;
      box-shadow: 0 0 0 0 transparent;
      transition: box-shadow 120ms var(--ease-out);
    }
    .ask-input::placeholder { color: var(--text-tertiary); }
    .ask-input:focus-visible { box-shadow: 0 0 0 3px var(--accent-5), 0 0 0 1px var(--accent-9); }
    .send-btn {
      width: 34px; height: 34px; flex-shrink: 0;
      border: none; border-radius: 10px;
      background: var(--accent-9); color: #fff;
      display: grid; place-content: center;
      cursor: pointer;
      transition: transform 200ms var(--ease-out), opacity 120ms var(--ease-out), filter 120ms var(--ease-out);
    }
    .send-btn:hover { filter: brightness(1.05); }
    .send-btn:active { transform: scale(0.94); }
    .send-btn:disabled { opacity: 0.4; cursor: default; }
    .send-btn svg { width: 14px; height: 14px; display: block; }
    .foot-actions { display: flex; gap: 6px; }
    .chip-btn {
      height: 26px;
      padding: 0 10px;
      border: none;
      border-radius: 999px;
      background: var(--bg-component);
      color: var(--text-secondary);
      font-size: 0.75rem;
      font-family: inherit;
      cursor: pointer;
      user-select: none;
      transition: background-color 120ms var(--ease-out), color 120ms var(--ease-out), transform 200ms var(--ease-out);
    }
    .chip-btn:hover { color: var(--text); }
    .chip-btn:active { transform: scale(0.96); }
    .agent-box {
      background: var(--bg-component);
      border-radius: 12px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .agent-head {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      user-select: none;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }
    .agent-head .dot {
      width: 7px; height: 7px;
      border-radius: 999px;
      background: var(--text-tertiary);
      flex-shrink: 0;
    }
    .agent-box.running .agent-head .dot { background: var(--accent-9); animation: mf-pulse 1.1s ease-in-out infinite; }
    .agent-box.saved .agent-head .dot { background: oklch(0.64 0.15 156); }
    .agent-box.error .agent-head .dot { background: oklch(0.62 0.2 26); }
    .agent-head .txt { flex: 1; line-height: 1.4; }
    .agent-head .chev { color: var(--text-tertiary); transition: transform 200ms var(--ease-out); }
    .agent-box.open .agent-head .chev { transform: rotate(90deg); }
    .agent-trace {
      display: none;
      flex-direction: column;
      gap: 4px;
      padding: 0 10px 10px;
      max-height: 180px;
      overflow-y: auto;
    }
    .agent-box.open .agent-trace { display: flex; }
    .ae {
      font-size: 0.6875rem;
      line-height: 1.5;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--text-tertiary);
      overflow-wrap: break-word;
    }
    .ae .nm { color: var(--text-secondary); font-weight: 500; }
    .ae.has-detail { cursor: pointer; }
    .ae.msg {
      font-family: inherit;
      color: var(--text);
      background: var(--bg-raised);
      padding: 6px 9px;
      border-radius: 8px;
      font-size: 0.75rem;
    }
    .ae pre {
      display: none;
      white-space: pre-wrap;
      overflow-wrap: break-word;
      margin: 4px 0 2px;
      padding: 6px 8px;
      background: var(--bg-raised);
      border-radius: 8px;
      max-height: 130px;
      overflow-y: auto;
    }
    .ae.open pre { display: block; }
    .pebble { z-index: 10; }
    .panel { z-index: 9; }
    .ptabs {
      display: flex;
      gap: 2px;
      margin: 0 14px 8px;
      padding: 3px;
      background: var(--bg-component);
      border-radius: 10px;
      user-select: none;
      flex-shrink: 0;
    }
    .ptab {
      flex: 1;
      height: 26px;
      border: none;
      background: none;
      border-radius: 7px;
      font-size: 0.75rem;
      font-weight: 500;
      font-family: inherit;
      color: var(--text-secondary);
      cursor: pointer;
      position: relative;
      transition: color 120ms var(--ease-out), background-color 120ms var(--ease-out);
    }
    .ptab.active { background: var(--bg-raised); color: var(--text); box-shadow: var(--shadow-border); }
    .ptab .ping-dot {
      position: absolute;
      top: 4px; right: 6px;
      width: 6px; height: 6px;
      border-radius: 999px;
      background: var(--accent-9);
      opacity: 0;
      transition: opacity 200ms var(--ease-out);
    }
    .ptab.has-news .ping-dot { opacity: 1; }
    .pview { display: flex; flex-direction: column; gap: 10px; }
    .pview[hidden] { display: none; }
    .dev-title {
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-tertiary);
      user-select: none;
      margin-top: 4px;
    }
    .dev-hint { font-size: 0.75rem; color: var(--text-tertiary); }
    .ext-row {
      background: var(--bg-component);
      border-radius: 10px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .ext-row .top { display: flex; align-items: center; gap: 8px; }
    .ext-row .eid {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.6875rem;
      color: var(--text);
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ext-row .tag {
      font-size: 0.625rem;
      font-weight: 500;
      padding: 1px 7px;
      border-radius: 999px;
      background: var(--bg-raised);
      box-shadow: var(--shadow-border);
      color: var(--text-secondary);
      flex-shrink: 0;
    }
    .run-btn {
      height: 22px;
      padding: 0 10px;
      border: none;
      border-radius: 999px;
      background: var(--accent-9);
      color: #fff;
      font-size: 0.6875rem;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      flex-shrink: 0;
      transition: transform 200ms var(--ease-out), filter 120ms var(--ease-out);
    }
    .run-btn:hover { filter: brightness(1.05); }
    .run-btn:active { transform: scale(0.95); }
    .ext-out {
      display: none;
      white-space: pre-wrap;
      overflow-wrap: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.6875rem;
      color: var(--text-secondary);
      background: var(--bg-raised);
      border-radius: 8px;
      padding: 6px 8px;
      max-height: 170px;
      overflow-y: auto;
    }
    .ext-out.show { display: block; }
    .panel.wide { width: min(460px, calc(100vw - 40px)); }
    .sumline {
      display: none;
      align-items: center;
      gap: 6px;
      font-size: 0.6875rem;
      color: var(--text-secondary);
      cursor: pointer;
      user-select: none;
    }
    .sumline.show { display: flex; }
    .sumline .sdot { width: 6px; height: 6px; border-radius: 999px; flex-shrink: 0; }
    .sumline .sdot.ok { background: oklch(0.64 0.15 156); }
    .sumline .sdot.bad { background: oklch(0.62 0.2 26); }
    .sumline .more { color: var(--text-tertiary); margin-left: auto; flex-shrink: 0; }
    .chiprow { display: none; flex-wrap: wrap; gap: 4px; }
    .chiprow.show { display: flex; }
    .szchip {
      font-size: 0.6875rem;
      padding: 2px 9px;
      border-radius: 999px;
      background: var(--bg-raised);
      box-shadow: var(--shadow-border);
      color: var(--text);
      user-select: none;
    }
    .szchip.sel { background: var(--accent-9); color: #fff; box-shadow: none; }
    .szchip.dis { opacity: 0.45; text-decoration: line-through; }
    @media (prefers-reduced-motion: reduce) {
      .pebble, .panel, .icon-btn, .send-btn, .chip-btn { transition: none; }
      .thinking span, .agent-box.running .agent-head .dot { animation: none; opacity: 0.6; }
    }
  `;

  const CRAYON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-5 0-8.5-3.2-8.5-7.6 0-5 4.6-9.4 9.3-9.4 4.2 0 7.7 2.9 7.7 6.9 0 4.6-4 7.4-7.6 7.4-2.9 0-5.2-1.8-5.2-4.4 0-2.9 2.5-5.1 5.3-5.1"/></svg>`;
  const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
  const SEND_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>`;

  let built = false;
  let pebble, panel, body, recEl, intelEl, msgsEl, input, sendBtn;
  const history = [];
  let lastAnalysis = null;
  let pageContext = { url: '', title: '', pageText: '' };

  function build() {
    if (built) return;
    built = true;
    M.ensure();
    const style = document.createElement('style');
    style.textContent = CSS;
    M.root.appendChild(style);

    pebble = document.createElement('button');
    pebble.className = 'pebble';
    pebble.innerHTML = `${CRAYON_ICON}<span class="ping"></span>`;
    pebble.title = 'MyFit (Alt+M)';
    pebble.addEventListener('click', toggle);

    panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <div class="panel-head">
        <span class="title">MyFit</span>
        <span class="spacer"></span>
        <button class="icon-btn" data-act="redraw" title="Redraw highlights">${CRAYON_ICON}</button>
        <button class="icon-btn" data-act="close" title="Close">${CLOSE_ICON}</button>
      </div>
      <div class="ptabs" hidden>
        <button class="ptab active" data-v="fit">Fit</button>
        <button class="ptab" data-v="data" hidden>Data<span class="ping-dot"></span></button>
        <button class="ptab" data-v="dev" hidden>Dev<span class="ping-dot"></span></button>
      </div>
      <div class="panel-body">
        <div class="pview" data-v="fit">
          <div class="rec" hidden></div>
          <div class="intel" hidden></div>
          <div class="msgs"></div>
        </div>
        <div class="pview" data-v="data" hidden></div>
        <div class="pview" data-v="dev" hidden>
          <div class="dev-agent"></div>
          <div class="dev-ext"></div>
        </div>
      </div>
      <div class="panel-foot">
        <div class="foot-actions"></div>
        <div class="ask-row">
          <input class="ask-input" type="text" placeholder="Ask about fit, sizing, reviews..." />
          <button class="send-btn" title="Send">${SEND_ICON}</button>
        </div>
      </div>`;

    body = panel.querySelector('.panel-body');
    recEl = panel.querySelector('.rec');
    intelEl = panel.querySelector('.intel');
    msgsEl = panel.querySelector('.msgs');
    input = panel.querySelector('.ask-input');
    sendBtn = panel.querySelector('.send-btn');

    panel.querySelector('[data-act="close"]').addEventListener('click', close);
    panel.querySelector('[data-act="redraw"]').addEventListener('click', () => M.ui.onRedraw && M.ui.onRedraw());

    panel.querySelectorAll('.ptab').forEach((tab) => {
      tab.addEventListener('click', () => switchView(tab.dataset.v));
    });
    chrome.runtime.sendMessage({ type: 'dev-agent-status' }).then((res) => {
      if (res?.ok) {
        panel.querySelector('.ptabs').hidden = false;
        panel.querySelector('.ptab[data-v="dev"]').hidden = false;
      }
    }).catch(() => {});
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) send();
      if (e.key === 'Escape') close();
      e.stopPropagation();
    });

    M.wrap.append(panel, pebble);
  }

  function showPebble(hasNews) {
    build();
    requestAnimationFrame(() => {
      pebble.classList.add('in');
      pebble.classList.toggle('has-news', !!hasNews);
    });
  }

  function open() {
    build();
    showPebble(false);
    pebble.classList.remove('has-news');
    panel.classList.add('open');
    requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('in')));
    setTimeout(() => input.focus(), 120);
  }

  function close() {
    if (!built || !panel.classList.contains('open')) return;
    panel.classList.remove('in');
    setTimeout(() => panel.classList.remove('open'), 220);
  }

  function toggle() {
    if (built && panel.classList.contains('open')) close();
    else open();
  }

  function setAnalysis(data, ctx) {
    build();
    lastAnalysis = data;
    if (ctx) pageContext = ctx;
    const rec = data.recommendation || {};
    if (rec.summary || rec.size) {
      recEl.hidden = false;
      recEl.innerHTML = '';
      const line = document.createElement('div');
      line.className = 'size-line';
      if (rec.size) {
        const s = document.createElement('span');
        s.className = 'size';
        s.textContent = rec.size;
        line.appendChild(s);
      }
      const c = document.createElement('span');
      c.className = 'conf';
      c.textContent = rec.confidence ? `${rec.confidence} confidence` : '';
      line.appendChild(c);
      const sum = document.createElement('div');
      sum.textContent = rec.summary || '';
      recEl.append(line, sum);
    }
    const intel = data.sizing_intel || [];
    if (intel.length) {
      intelEl.hidden = false;
      intelEl.innerHTML = '';
      for (const t of intel.slice(0, 4)) {
        const row = document.createElement('div');
        row.className = 'row';
        const span = document.createElement('span');
        span.textContent = t;
        row.appendChild(span);
        intelEl.appendChild(row);
      }
    }
  }

  function setFootAction(label, fn) {
    build();
    const holder = panel.querySelector('.foot-actions');
    const btn = document.createElement('button');
    btn.className = 'chip-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => fn(btn));
    holder.appendChild(btn);
    return btn;
  }

  function addMsg(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.textContent = text;
    msgsEl.appendChild(div);
    body.scrollTop = body.scrollHeight;
    return div;
  }

  async function send() {
    const q = input.value.trim();
    if (!q || sendBtn.disabled) return;
    input.value = '';
    addMsg('user', q);
    history.push({ role: 'user', text: q });
    sendBtn.disabled = true;
    const think = document.createElement('div');
    think.className = 'thinking';
    think.innerHTML = '<span></span><span></span><span></span>';
    msgsEl.appendChild(think);
    body.scrollTop = body.scrollHeight;
    try {
      if (!pageContext.pageText && M.getPageText) pageContext.pageText = M.getPageText(5500);
      const res = await chrome.runtime.sendMessage({
        type: 'ask',
        payload: { ...pageContext, question: q, history: history.slice(-10, -1) }
      });
      think.remove();
      if (!res?.ok) throw new Error(res?.error || 'No response');
      addMsg('bot', res.data.trim());
      history.push({ role: 'bot', text: res.data.trim() });
    } catch (e) {
      think.remove();
      addMsg('err', e.message);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  let agentBox = null;
  let agentTxt = null;
  let agentTrace = null;

  function switchView(v) {
    panel.querySelectorAll('.ptab').forEach((t) => t.classList.toggle('active', t.dataset.v === v));
    panel.querySelectorAll('.pview').forEach((p) => { p.hidden = p.dataset.v !== v; });
    panel.classList.toggle('wide', v === 'dev' || v === 'data');
    if (v === 'dev') {
      panel.querySelector('.ptab[data-v="dev"]').classList.remove('has-news');
      renderDevTab();
    }
    if (v === 'data') panel.querySelector('.ptab[data-v="data"]').classList.remove('has-news');
  }

  function flagDevNews() {
    panel.querySelector('.ptabs').hidden = false;
    panel.querySelector('.ptab[data-v="dev"]').hidden = false;
    if (panel.querySelector('.pview[data-v="dev"]').hidden) {
      panel.querySelector('.ptab[data-v="dev"]').classList.add('has-news');
    }
  }

  function ensureAgentBox() {
    build();
    if (agentBox) return;
    agentBox = document.createElement('div');
    agentBox.className = 'agent-box';
    agentBox.innerHTML = `
      <div class="agent-head">
        <span class="dot"></span>
        <span class="txt">Agent</span>
        <span class="chev">›</span>
      </div>
      <div class="agent-trace"></div>`;
    agentTxt = agentBox.querySelector('.txt');
    agentTrace = agentBox.querySelector('.agent-trace');
    agentBox.querySelector('.agent-head').addEventListener('click', () => agentBox.classList.toggle('open'));
    panel.querySelector('.dev-agent').appendChild(agentBox);
  }

  function setAgentStatus(text, state) {
    ensureAgentBox();
    agentTxt.textContent = text;
    agentBox.classList.remove('running', 'saved', 'error');
    if (state && state !== 'idle') agentBox.classList.add(state);
    flagDevNews();
    showPebble(true);
  }

  function slimFull(e) {
    if (e.kind === 'tool') return { kind: 'tool', name: e.name, summary: JSON.stringify(e.input ?? {}).slice(1, 80), detail: JSON.stringify(e.input ?? {}, null, 1).slice(0, 700) };
    if (e.kind === 'tool-result') return { kind: 'tool-result', summary: (e.output || '').replace(/\s+/g, ' ').slice(0, 90), detail: (e.output || '').slice(0, 700) };
    return e;
  }

  async function backfillTrace() {
    ensureAgentBox();
    if (agentTrace.children.length) return;
    const res = await chrome.runtime.sendMessage({ type: 'dev-agent-status' }).catch(() => null);
    if (!res?.ok) return;
    if (!res.data) {
      agentTxt.textContent = 'No agent runs since the browser started.';
      return;
    }
    agentTxt.textContent = res.data.active ? `Agent running on ${res.data.domain}...` : `Last run: ${res.data.domain}`;
    agentBox.classList.toggle('running', !!res.data.active);
    for (const e of res.data.trace || []) addAgentTrace(slimFull(e));
  }

  function extRow(label, tag, onRun) {
    const row = document.createElement('div');
    row.className = 'ext-row';
    const top = document.createElement('div');
    top.className = 'top';
    const eid = document.createElement('span');
    eid.className = 'eid';
    eid.textContent = label;
    top.appendChild(eid);
    if (tag) {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = tag;
      top.appendChild(t);
    }
    const btn = document.createElement('button');
    btn.className = 'run-btn';
    btn.textContent = 'Run';
    top.appendChild(btn);

    const sum = document.createElement('div');
    sum.className = 'sumline';
    const sdot = document.createElement('span');
    sdot.className = 'sdot';
    const stext = document.createElement('span');
    const more = document.createElement('span');
    more.className = 'more';
    more.textContent = 'raw';
    sum.append(sdot, stext, more);

    const chips = document.createElement('div');
    chips.className = 'chiprow';
    const out = document.createElement('div');
    out.className = 'ext-out';
    row.append(top, sum, chips, out);

    sum.addEventListener('click', () => out.classList.toggle('show'));
    btn.addEventListener('click', async () => {
      btn.textContent = '...';
      chips.innerHTML = '';
      chips.classList.remove('show');
      out.classList.remove('show');
      try {
        const r = await onRun();
        sdot.className = `sdot ${r.ok === false ? 'bad' : 'ok'}`;
        stext.textContent = r.summary;
        out.textContent = JSON.stringify(r.raw, null, 2);
        if (r.chips?.length) {
          for (const c of r.chips.slice(0, 24)) {
            const chip = document.createElement('span');
            chip.className = `szchip${c.selected ? ' sel' : ''}${c.disabled ? ' dis' : ''}`;
            chip.textContent = c.text;
            chips.appendChild(chip);
          }
          chips.classList.add('show');
        }
      } catch (e) {
        sdot.className = 'sdot bad';
        stext.textContent = String(e.message || e).slice(0, 80);
        out.textContent = String(e.stack || e);
      }
      sum.classList.add('show');
      btn.textContent = 'Run';
    });
    return row;
  }

  function fieldsOf(items) {
    return (items || []).map((i) => i.fields || i);
  }

  function ensureAgentRunRow() {
    ensureAgentBox();
    if (panel.querySelector('.agent-run-row')) return;
    const row = document.createElement('div');
    row.className = 'ext-row agent-run-row';
    const top = document.createElement('div');
    top.className = 'top';
    const label = document.createElement('span');
    label.className = 'eid';
    label.textContent = 'agent · sizes, reviews, item';
    const btn = document.createElement('button');
    btn.className = 'run-btn';
    btn.textContent = 'Run agent';
    top.append(label, btn);
    row.appendChild(top);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Starting...';
      const res = await chrome.runtime.sendMessage({ type: 'dev-run-agent-here', kinds: ['sizes', 'reviews', 'item'] }).catch((e) => ({ ok: false, error: String(e.message || e) }));
      if (res?.ok) {
        setAgentStatus(`Agent running on ${location.hostname.replace(/^www\./, '')}...`, 'running');
        agentBox.classList.add('open');
      } else {
        setAgentStatus(res?.error || 'Could not start run.', 'error');
      }
      btn.disabled = false;
      btn.textContent = 'Run agent';
    });
    panel.querySelector('.dev-agent').insertBefore(row, agentBox);
  }

  async function renderDevTab() {
    backfillTrace();
    ensureAgentRunRow();
    const holder = panel.querySelector('.dev-ext');
    holder.innerHTML = '';
    const ex = window.__myfitExtract;
    if (!ex) return;
    await ex.ready;

    if (window.__myfitLastAnalysis) {
      holder.appendChild(extRow('last analysis (what the model saw)', null, () => {
        const a = window.__myfitLastAnalysis;
        const sc = a.payload.sizeCandidates || [];
        return {
          ok: true,
          summary: `${sc.length} size cands (${sc.filter((c) => c.disabled).length} disabled) · ${(a.payload.reviewCandidates || []).length} reviews · ${new Date(a.at).toLocaleTimeString()}`,
          chips: sc.map((c) => ({ text: c.text, disabled: c.disabled, selected: c.selected })),
          raw: a
        };
      }));
    }

    const entries = ex.allEntries();
    if (!entries.length) {
      const diag = document.createElement('div');
      diag.className = 'dev-hint';
      diag.textContent = 'No extractors for this page yet.';
      holder.appendChild(diag);
      return;
    }

    const t1 = document.createElement('div');
    t1.className = 'dev-title';
    t1.textContent = `Extractors — ${location.hostname.replace(/^www\./, '')}`;
    holder.appendChild(t1);
    for (const entry of entries) {
      holder.appendChild(extRow(`${entry.kind} · ${entry.id}`, entry.engine, () => {
        const r = ex.testEntry(entry);
        return {
          ok: r.ok && r.count > 0,
          summary: r.ok ? `${r.count} items · ${r.ms}ms` : `failed: ${(r.errors || [r.error]).join('; ').slice(0, 70)}`,
          chips: entry.kind === 'sizes' ? (r.sample || []) : null,
          raw: r
        };
      }));
    }
  }

  function kvLine(holder, k, v) {
    const div = document.createElement('div');
    div.className = 'ae';
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = `${k}: `;
    const val = document.createElement('span');
    val.textContent = v;
    div.append(nm, val);
    holder.appendChild(div);
  }

  function setExtractedData(results) {
    build();
    const view = panel.querySelector('.pview[data-v="data"]');
    view.innerHTML = '';
    panel.querySelector('.ptabs').hidden = false;
    const dataTab = panel.querySelector('.ptab[data-v="data"]');
    dataTab.hidden = false;
    if (panel.querySelector('.pview[data-v="data"]').hidden) dataTab.classList.add('has-news');

    const head = document.createElement('div');
    head.className = 'dev-title';
    head.textContent = `Extracted from this page — ${new Date().toLocaleTimeString()}`;
    view.appendChild(head);

    for (const r of results) {
      const sec = document.createElement('div');
      sec.className = 'ext-row';
      const top = document.createElement('div');
      top.className = 'top';
      const eid = document.createElement('span');
      eid.className = 'eid';
      eid.textContent = r.kind;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = r.ok ? `${r.items.length} items` : 'failed';
      top.append(eid, tag);
      sec.appendChild(top);

      if (!r.ok) {
        const err = document.createElement('div');
        err.className = 'dev-hint';
        err.textContent = r.error || 'extraction failed';
        sec.appendChild(err);
        view.appendChild(sec);
        continue;
      }

      if (r.kind === 'sizes') {
        const chips = document.createElement('div');
        chips.className = 'chiprow show';
        for (const f of r.items.slice(0, 24)) {
          const chip = document.createElement('span');
          chip.className = `szchip${f.selected ? ' sel' : ''}${f.disabled ? ' dis' : ''}`;
          chip.textContent = f.text;
          chips.appendChild(chip);
        }
        sec.appendChild(chips);
      } else if (r.kind === 'reviews') {
        for (const f of r.items.slice(0, 5)) {
          const m = document.createElement('div');
          m.className = 'ae msg';
          m.textContent = (f.text || '').slice(0, 220);
          sec.appendChild(m);
        }
        if (r.items.length > 5) {
          const more = document.createElement('div');
          more.className = 'dev-hint';
          more.textContent = `+ ${r.items.length - 5} more in raw`;
          sec.appendChild(more);
        }
      } else if (r.kind === 'item' && r.items[0]) {
        for (const [k, v] of Object.entries(r.items[0])) {
          if (v != null && v !== '') kvLine(sec, k, String(v).slice(0, 120));
        }
      } else if (/purchase|order/.test(r.kind)) {
        for (const f of r.items.slice(0, 8)) {
          kvLine(sec, f.date || '·', [f.brand, f.item || f.name || f.title, f.size, f.price].filter(Boolean).join(' — ').slice(0, 140));
        }
        const save = document.createElement('button');
        save.className = 'run-btn';
        save.textContent = `Save ${r.items.length} to purchase log`;
        save.addEventListener('click', async () => {
          save.disabled = true;
          const items = r.items.map((f) => ({
            brand: f.brand || '',
            item: f.item || f.name || f.title || '',
            category: f.category || 'other',
            size: f.size || '',
            price: f.price || ''
          })).filter((i) => i.item);
          const res = await chrome.runtime.sendMessage({ type: 'save-purchases', items, site: location.hostname }).catch(() => null);
          save.textContent = res?.ok ? 'Saved' : 'Failed';
        });
        sec.appendChild(save);
      } else {
        for (const f of r.items.slice(0, 6)) {
          kvLine(sec, '·', Object.values(f).filter((v) => v != null && v !== '').map(String).join(' — ').slice(0, 140));
        }
      }

      const pre = document.createElement('div');
      pre.className = 'ext-out';
      pre.textContent = JSON.stringify(r.items, null, 2);
      const rawToggle = document.createElement('div');
      rawToggle.className = 'sumline show';
      rawToggle.innerHTML = '<span class="more">raw</span>';
      rawToggle.addEventListener('click', () => pre.classList.toggle('show'));
      sec.append(rawToggle, pre);
      view.appendChild(sec);
    }
  }

  function addAgentTrace(e) {
    ensureAgentBox();
    flagDevNews();
    const div = document.createElement('div');
    div.className = 'ae';
    if (e.kind === 'text') {
      div.classList.add('msg');
      div.textContent = e.text;
    } else if (e.kind === 'error') {
      div.classList.add('msg');
      div.textContent = `Error: ${e.text}`;
    } else if (e.kind === 'saved') {
      div.classList.add('msg');
      div.textContent = `Registered ${e.data?.id || 'parser'} (${e.data?.engine || '?'})`;
    } else if (e.kind === 'tool' || e.kind === 'tool-result') {
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = e.kind === 'tool' ? `› ${e.name}` : '↳';
      const sm = document.createElement('span');
      sm.textContent = ` ${e.summary || ''}`;
      div.append(nm, sm);
      if (e.detail) {
        div.classList.add('has-detail');
        const pre = document.createElement('pre');
        pre.textContent = e.detail;
        div.appendChild(pre);
        div.addEventListener('click', () => div.classList.toggle('open'));
      }
    } else return;
    const atBottom = agentTrace.scrollHeight - agentTrace.scrollTop - agentTrace.clientHeight < 40;
    agentTrace.appendChild(div);
    if (agentTrace.children.length > 120) agentTrace.firstChild.remove();
    if (atBottom) agentTrace.scrollTop = agentTrace.scrollHeight;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'myfit-agent-status') setAgentStatus(msg.text, msg.state);
    else if (msg.type === 'myfit-agent-trace') addAgentTrace(msg.entry);
  });

  M.ui = { showPebble, open, close, toggle, setAnalysis, setFootAction, addMsg, setExtractedData, setContext: (c) => { pageContext = c; }, onRedraw: null };
})();
