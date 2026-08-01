const GUARD_PRELUDE = `
if (!globalThis.__myfitGuarded) {
  globalThis.__myfitGuarded = true;
  const deny = (name) => () => { throw new Error('MyFit guard: ' + name + ' is blocked. Extraction code must be read-only.'); };
  globalThis.fetch = deny('fetch');
  globalThis.XMLHttpRequest = function () { deny('XMLHttpRequest')(); };
  globalThis.WebSocket = function () { deny('WebSocket')(); };
  if (globalThis.navigator) { try { navigator.sendBeacon = deny('sendBeacon'); } catch {} }
  try { HTMLElement.prototype.click = deny('element.click'); } catch {}
  try { HTMLFormElement.prototype.submit = deny('form.submit'); } catch {}
  try { HTMLFormElement.prototype.requestSubmit = deny('form.requestSubmit'); } catch {}
  try {
    const loc = { assign: deny('location.assign'), replace: deny('location.replace'), reload: deny('location.reload') };
    void loc;
  } catch {}
}
`;

const USER_SCRIPTS_BLOCKED =
  "USER_SCRIPTS_DISABLED: Chrome's 'Allow user scripts' toggle is off (it resets every reload of an unpacked extension). " +
  'Open chrome://extensions -> MyFit (Dev) -> Details -> enable Allow user scripts, then run again. ' +
  'This cannot be worked around from inside the extension. Stop and tell the developer.';

function userScriptsAvailable() {
  return !!chrome.userScripts?.execute;
}

let worldConfigured = false;

async function execInTab(tabId, code) {
  if (!userScriptsAvailable()) return { ok: false, error: USER_SCRIPTS_BLOCKED };
  if (!worldConfigured) {
    try {
      await chrome.userScripts.configureWorld({ csp: "script-src 'self' 'unsafe-eval'", messaging: false });
    } catch {}
    worldConfigured = true;
  }
  const wrapped = `(async () => {
    try {
      ${GUARD_PRELUDE}
      const __value = await (async () => { ${code}\n })();
      return { ok: true, value: __value === undefined ? null : JSON.parse(JSON.stringify(__value)) };
    } catch (e) {
      return { ok: false, error: String((e && e.stack) || e).slice(0, 1500) };
    }
  })()`;
  try {
    const results = await chrome.userScripts.execute({
      target: { tabId },
      js: [{ code: wrapped }],
      world: 'USER_SCRIPT',
      injectImmediately: true
    });
    return results?.[0]?.result ?? { ok: false, error: 'No result from page.' };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function snapshotInPage(maxHtml, maxText) {
  const clone = document.body.cloneNode(true);
  for (const sel of ['script', 'style', 'noscript', 'svg', 'link', 'iframe', 'video', 'audio', 'canvas', 'img']) {
    clone.querySelectorAll(sel).forEach((el) => el.remove());
  }
  clone.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      if (!/^(id|class|role|type|name|href|aria-[a-z-]+|data-[a-z-]+|itemprop)$/.test(attr.name)) el.removeAttribute(attr.name);
      else if (attr.value.length > 120) el.setAttribute(attr.name, attr.value.slice(0, 120));
    }
  });
  const html = clone.innerHTML.replace(/>\s+</g, '><');
  const text = document.body.innerText.replace(/\n{3,}/g, '\n\n');
  return {
    url: location.href,
    title: document.title,
    html: html.length > maxHtml ? html.slice(0, maxHtml) + '<!-- truncated -->' : html,
    text: text.length > maxText ? text.slice(0, maxText) + '\n[truncated]' : text
  };
}

async function capturePage(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: snapshotInPage,
    args: [90000, 25000]
  });
  const snapshot = results?.[0]?.result;
  if (!snapshot) throw new Error('Could not read the page.');
  return snapshot;
}

async function getTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab) throw new Error(`No tab ${tabId}`);
  return tab;
}

function tabDomain(tab) {
  try {
    return new URL(tab.url || '').hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

globalThis.MyFitDevPage = { execInTab, capturePage, getTab, tabDomain, userScriptsAvailable };
