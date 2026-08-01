const PARSER_KINDS = ['sizes', 'reviews', 'item', 'purchases'];

const TOOLS = [
  {
    name: 'read_page',
    description:
      'Read the page in the run tab: returns url, title, visible text, and a pruned HTML outline. Call this first to learn how the site structures the content you need to extract.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'run_javascript',
    description:
      'Execute read-only JavaScript in the run tab and return its JSON-serialized result. The code is the body of an async function: end with `return <value>`. Use it to probe selectors (counts, sample texts) and to test extraction logic before saving. Network and click/submit calls are blocked by a guard.',
    input_schema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'JavaScript function body to run in the page.' } },
      required: ['code']
    }
  },
  {
    name: 'test_parser',
    description:
      'Run a parser entry against the live page through the SAME engine production uses (DSL interpreter + validators). Always test an entry here before saving it. Returns item count, validation errors, and sample fields. Only engine "dsl" entries can be tested this way; test engine "js" code via run_javascript instead.',
    input_schema: {
      type: 'object',
      properties: { entry: { type: 'object', description: 'The parser entry: {id, domain, kind, urlPattern, engine, program, validate?}.' } },
      required: ['entry']
    }
  },
  {
    name: 'save_parser',
    description:
      'Persist a tested parser entry to the dev registry. DSL entries take effect immediately in this dev build; JS entries take effect in the next release after export. Only save entries that passed test_parser (dsl) or were verified with run_javascript (js).',
    input_schema: {
      type: 'object',
      properties: {
        entry: { type: 'object', description: 'Full parser entry including description.' }
      },
      required: ['entry']
    }
  },
  {
    name: 'take_screenshot',
    description:
      'Look at the run tab with your own eyes: focuses the tab, optionally scrolls a selector into view, and returns a screenshot of the visible viewport. Use it when DOM text is ambiguous — several candidate groups could be "the size picker" — or to confirm the elements you plan to target are the visible, clickable option chips. Briefly steals window focus.',
    input_schema: {
      type: 'object',
      properties: { selector: { type: 'string', description: 'Optional CSS selector to scroll into view (centered) before capturing.' } },
      required: []
    }
  },
  {
    name: 'get_parsers',
    description: 'List parser entries known for a domain (dev-saved and packaged), so you can improve or version-bump instead of duplicating.',
    input_schema: {
      type: 'object',
      properties: { domain: { type: 'string', description: 'Hostname, defaults to the run tab domain.' } },
      required: []
    }
  }
];

function validateEntryShape(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') return ['entry must be an object'];
  if (!entry.id || !/^[a-z0-9.-]+\/[a-z][a-z0-9_-]{0,30}@\d+$/.test(entry.id)) {
    errors.push('id must look like "domain.com/kind@1"');
  }
  if (!entry.domain) errors.push('domain required');
  if (!entry.kind || !/^[a-z][a-z0-9_-]{1,30}$/.test(entry.kind)) errors.push('kind must be a short snake_case slug, e.g. "sizes" or "order_history"');
  if (!['dsl', 'js'].includes(entry.engine)) errors.push('engine must be "dsl" or "js"');
  if (entry.engine === 'dsl' && !entry.program) errors.push('dsl entry needs program');
  if (entry.engine === 'js' && !entry.code) errors.push('js entry needs code');
  if (!entry.description) errors.push('description required');
  if (entry.urlPattern) {
    try { new RegExp(entry.urlPattern); } catch { errors.push('urlPattern is not a valid regex'); }
  }
  return errors;
}

function createDevToolExecutor(tabId, trace) {
  const P = globalThis.MyFitDevPage;
  return async (name, rawInput) => {
    const input = rawInput || {};
    switch (name) {
      case 'read_page': {
        const snapshot = await P.capturePage(tabId);
        return JSON.stringify(snapshot);
      }
      case 'run_javascript': {
        const result = await P.execInTab(tabId, String(input.code || ''));
        return JSON.stringify(result);
      }
      case 'take_screenshot': {
        const tab = await P.getTab(tabId);
        if (input.selector) {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: (sel) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: 'center' }); },
            args: [String(input.selector)]
          }).catch(() => {});
          await new Promise((r) => setTimeout(r, 400));
        }
        await chrome.tabs.update(tabId, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
        await new Promise((r) => setTimeout(r, 350));
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 55 });
        return {
          __screenshot: dataUrl.split(',')[1],
          note: input.selector ? `Viewport after scrolling "${input.selector}" into view.` : 'Visible viewport of the run tab.'
        };
      }
      case 'test_parser': {
        const entry = input.entry;
        const shapeErrors = validateEntryShape({ description: 'x', ...entry });
        if (shapeErrors.length) return JSON.stringify({ ok: false, shape_errors: shapeErrors });
        const res = await chrome.tabs.sendMessage(tabId, { type: 'dev-test-entry', entry }).catch((e) => ({ ok: false, error: String(e.message || e) }));
        return JSON.stringify(res ?? { ok: false, error: 'no response from content script' });
      }
      case 'save_parser': {
        const entry = input.entry;
        const errors = validateEntryShape(entry);
        if (errors.length) return JSON.stringify({ saved: false, errors });
        const { devParsers } = await chrome.storage.local.get('devParsers');
        const map = devParsers || {};
        map[entry.id] = { ...entry, savedAt: Date.now() };
        await chrome.storage.local.set({ devParsers: map });
        await chrome.tabs.sendMessage(tabId, { type: 'dev-refresh-registry' }).catch(() => {});
        trace('saved', { id: entry.id, engine: entry.engine });
        return JSON.stringify({ saved: true, id: entry.id, effective: entry.engine === 'dsl' ? 'immediately' : 'after export + release' });
      }
      case 'get_parsers': {
        const tab = await P.getTab(tabId);
        const domain = input.domain || P.tabDomain(tab);
        const registry = await globalThis.MyFitHandlers['get-registry']();
        const entries = registry.entries.filter((e) => domain === e.domain || domain.endsWith(`.${e.domain}`));
        return JSON.stringify({ domain, entries });
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };
}

globalThis.MyFitDevTools = { TOOLS, createDevToolExecutor, validateEntryShape, PARSER_KINDS };
