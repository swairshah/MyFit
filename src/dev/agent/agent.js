const DEV_AGENT_SYSTEM = `You are the MyFit extraction engineer. You work inside a dev build of a fit/style shopping assistant, on a live e-commerce page, writing extractors that will later ship to all users. Be methodical and frugal with page reads.

MISSION: First survey the page and DECIDE what structured information is worth extracting for a shopping assistant that advises on fit, sizing, and style. You choose the extractors; nothing is fixed. Typical page types:
- Product pages: size options, review snippets, product identity; also anything else clearly valuable here (color options, a ratings breakdown, fabric/care details).
- Orders / purchase-history pages: the list of past purchases with item name, brand, size, price, date where visible.
- Pages with nothing worth extracting (homepages, search results, login walls): say so and finish WITHOUT saving anything.

CONVENTIONAL KINDS the runtime consumes directly — prefer these names when they fit:
- sizes: one item per size OPTION ELEMENT the user can pick. Fields: text (the size value, e.g. "M", "32"), disabled (boolean, out of stock), selected (boolean). The element itself gets circled by the extension, so "each" must select the clickable option, not a wrapper.
- reviews: one item per review text block. Fields: text (the review body, trimmed).
- item: exactly one item for the product. Fields: title, price (with currency symbol), brand.
- purchases: one item per purchased/ordered line. Fields: item, brand, size, price, category (tops|bottoms|shoes|outerwear|dress|accessory|other), date if visible.
For anything else, invent a short snake_case kind (e.g. "colors", "ratings_summary") with sensible field names, and include a "validate" block since no defaults exist for invented kinds.

THE DSL (strongly preferred — it ships over the air; JS waits for a release):
A parser entry is JSON:
{
  "id": "<registrable-domain>/<kind>@<version>",
  "domain": "<registrable domain, e.g. zara.com>",
  "kind": "sizes",
  "urlPattern": "<regex the page URL must match, keep it loose>",
  "engine": "dsl",
  "description": "what it reads and from which page",
  "program": {
    "root": "<css selector scoping the search, optional>",
    "each": "<css selector, one match per item; omit for single-item kinds>",
    "where": { "op": "...", ... } (optional filter per node),
    "fields": { "<fieldName>": { "op": "...", ... } }
  },
  "validate": { "minItems": 2, "fields": { "text": { "required": true, "regex": "..." } } } (optional; sensible kind defaults exist)
}
Field ops (the complete vocabulary — nothing else exists):
- {"op":"text","sel":"<optional css within item>"} -> trimmed text content
- {"op":"attr","sel":"...","name":"<attribute>"} -> attribute value
- {"op":"hasClass","sel":"...","name":"<class>"} -> boolean
- {"op":"matches","sel":"...","selector":"<css>"} -> boolean, node.matches()
- {"op":"exists","sel":"<css>"} -> boolean
- {"op":"regexExtract","sel":"...","pattern":"...","flags":"i","group":1} -> first match group from the text
- {"op":"regexTest","sel":"...","pattern":"...","flags":"i"} -> boolean
- {"op":"style","sel":"...","prop":"<camelCase css property>","includes":"<substring>"} -> boolean (computed style; omit "includes" to get the value)
- {"op":"const","value":<json>} -> constant
"sel" is always optional; omitted means the item node itself.

For the "disabled" field of sizes: many sites mark sold-out options only via CSS — strikethrough ({"op":"style","prop":"textDecorationLine","includes":"line-through"}), low opacity, or cursor not-allowed. Check the live page for which signal this site uses and encode that, not just class names.

WORKFLOW (follow strictly):
1. read_page once. Identify the structures for the requested kinds.
2. Probe with run_javascript: check selector match counts and sample texts BEFORE committing to a program. Prefer stable hooks: ids, data-* attributes, aria roles, itemprop. Avoid generated class names (css-1x2y3z, _3kf9s) — they rot.
2b. When candidate groups are ambiguous (several button rows could be the size picker, or you suspect options are images/swatches or hidden), take_screenshot with the group's selector — what the user visually sees is the ground truth for which group to parse and which element should later be circled.
3. Build the DSL entry, run test_parser. Iterate until validation passes and the samples look right.
4. save_parser. Bump @version if an entry for this domain+kind already exists (check get_parsers).
5. Only if the DSL genuinely cannot express the extraction (data behind JSON in a script tag, deep shadow DOM, text assembled from siblings), write engine "js": code is a function body receiving "doc" (the Document), returning an array of {el, ...fields} objects. Verify it with run_javascript (adapt: use document, return the fields only), then save with engine "js" and the code string.
6. Finish with a one-paragraph summary of what you saved and how confident you are.

RULES:
- Read-only. Never click, submit, navigate, or touch the network from run_javascript (a guard blocks it; do not try to evade the guard).
- Never invent selectors you have not verified against the live page.
- Keep urlPattern loose enough to match sibling product pages, not just this exact URL.
- If the page lacks the requested content (e.g. no reviews section), say so and skip that kind rather than saving a junk parser.`;

let currentRun = null;

function summarizeTool(entry) {
  const i = entry.input || {};
  if (entry.name === 'run_javascript') return (i.code || '').replace(/\s+/g, ' ').slice(0, 80);
  if (entry.name === 'test_parser' || entry.name === 'save_parser') return i.entry?.id || '';
  if (entry.name === 'take_screenshot') return i.selector || 'viewport';
  if (entry.name === 'get_parsers') return i.domain || '';
  return '';
}

function slimEntry(e) {
  if (e.kind === 'tool') return { kind: 'tool', name: e.name, summary: summarizeTool(e), detail: JSON.stringify(e.input ?? {}, null, 1).slice(0, 700) };
  if (e.kind === 'tool-result') return { kind: 'tool-result', summary: (e.output || '').replace(/\s+/g, ' ').slice(0, 90), detail: (e.output || '').slice(0, 700) };
  if (e.kind === 'text') return { kind: 'text', text: (e.text || '').slice(0, 600) };
  if (e.kind === 'error') return { kind: 'error', text: (e.text || '').slice(0, 300) };
  if (e.kind === 'saved') return { kind: 'saved', data: e.data };
  return null;
}

function broadcast(entry) {
  if (currentRun) {
    currentRun.trace.push(entry);
    if (entry.kind === 'saved' && entry.data?.id) currentRun.saved.push(entry.data.id);
    const slim = slimEntry(entry);
    if (slim && currentRun.tabId != null) {
      chrome.tabs.sendMessage(currentRun.tabId, { type: 'myfit-agent-trace', entry: slim }).catch(() => {});
    }
  }
  chrome.runtime.sendMessage({ type: 'dev-trace', entry }).catch(() => {});
}

function notifyTab(tabId, text, state) {
  chrome.tabs.sendMessage(tabId, { type: 'myfit-agent-status', text, state }).catch(() => {});
}

function setBadge(text, color) {
  chrome.action.setBadgeText({ text }).catch(() => {});
  if (color) chrome.action.setBadgeBackgroundColor({ color }).catch(() => {});
}

async function recordRun(run, outcome) {
  const { devRuns } = await chrome.storage.local.get('devRuns');
  const list = devRuns || [];
  list.unshift({
    id: run.id,
    domain: run.domain,
    auto: !!run.auto,
    startedAt: run.startedAt,
    finishedAt: Date.now(),
    outcome,
    saved: run.saved
  });
  await chrome.storage.local.set({ devRuns: list.slice(0, 20) });
}

async function callAnthropicWithTools(settings, messages) {
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
      max_tokens: 4000,
      system: DEV_AGENT_SYSTEM,
      tools: globalThis.MyFitDevTools.TOOLS,
      messages
    })
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function toOpenAITools(tools) {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

async function callOpenAIWithTools(settings, messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.openaiKey}`
    },
    body: JSON.stringify({
      model: settings.openaiModel,
      max_completion_tokens: 4000,
      tools: toOpenAITools(globalThis.MyFitDevTools.TOOLS),
      messages
    })
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function runToolSafely(execute, name, input) {
  broadcast({ kind: 'tool', name, input, ts: Date.now() });
  try {
    return await execute(name, input);
  } catch (e) {
    return JSON.stringify({ error: String(e.message || e) });
  }
}

async function runAnthropicLoop(settings, goal, execute) {
  const messages = [{ role: 'user', content: goal }];
  for (let turn = 0; turn < 30; turn++) {
    if (!currentRun?.active) return;
    const response = await callAnthropicWithTools(settings, messages);
    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) broadcast({ kind: 'text', text: block.text.trim(), ts: Date.now() });
    }
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      broadcast({ kind: 'done', text: 'Run finished.', ts: Date.now() });
      return;
    }
    messages.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const tu of toolUses) {
      const output = await runToolSafely(execute, tu.name, tu.input);
      if (output && typeof output === 'object' && output.__screenshot) {
        broadcast({ kind: 'tool-result', name: tu.name, output: `[screenshot] ${output.note}`, ts: Date.now() });
        results.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: output.__screenshot } },
            { type: 'text', text: output.note }
          ]
        });
      } else {
        broadcast({ kind: 'tool-result', name: tu.name, output: output.slice(0, 4000), ts: Date.now() });
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: output.slice(0, 90000) });
      }
    }
    messages.push({ role: 'user', content: results });
  }
}

async function runOpenAILoop(settings, goal, execute) {
  const messages = [
    { role: 'system', content: DEV_AGENT_SYSTEM },
    { role: 'user', content: goal }
  ];
  for (let turn = 0; turn < 30; turn++) {
    if (!currentRun?.active) return;
    const response = await callOpenAIWithTools(settings, messages);
    const m = response.choices?.[0]?.message;
    if (!m) throw new Error('OpenAI returned no message.');
    if (typeof m.content === 'string' && m.content.trim()) broadcast({ kind: 'text', text: m.content.trim(), ts: Date.now() });
    const calls = m.tool_calls || [];
    if (!calls.length) {
      broadcast({ kind: 'done', text: 'Run finished.', ts: Date.now() });
      return;
    }
    messages.push(m);
    const pendingImages = [];
    for (const c of calls) {
      let input = {};
      try { input = JSON.parse(c.function?.arguments || '{}'); } catch {}
      const output = await runToolSafely(execute, c.function?.name, input);
      if (output && typeof output === 'object' && output.__screenshot) {
        broadcast({ kind: 'tool-result', name: c.function?.name, output: `[screenshot] ${output.note}`, ts: Date.now() });
        messages.push({ role: 'tool', tool_call_id: c.id, content: `${output.note} The screenshot image is attached in the next user message.` });
        pendingImages.push(`data:image/jpeg;base64,${output.__screenshot}`);
      } else {
        broadcast({ kind: 'tool-result', name: c.function?.name, output: output.slice(0, 4000), ts: Date.now() });
        messages.push({ role: 'tool', tool_call_id: c.id, content: output.slice(0, 90000) });
      }
    }
    if (pendingImages.length) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Screenshot(s) from take_screenshot:' },
          ...pendingImages.map((url) => ({ type: 'image_url', image_url: { url } }))
        ]
      });
    }
  }
}

async function runAgent({ tabId, kinds, instructions, auto, pageType }) {
  if (currentRun?.active) throw new Error('A run is already active. Stop it first.');
  const { settings } = await globalThis.MyFitLLM.getState();
  const provider = settings.provider === 'openai' ? 'openai' : 'anthropic';
  if (provider === 'openai' && !settings.openaiKey) throw new Error('Set an OpenAI API key in the MyFit popup first.');
  if (provider === 'anthropic' && !settings.anthropicKey) throw new Error('Set an Anthropic API key in the MyFit popup first.');
  if (!globalThis.MyFitDevPage.userScriptsAvailable()) {
    broadcast({ kind: 'error', text: 'User scripts are disabled. Enable "Allow user scripts" in chrome://extensions for MyFit (Dev).', ts: Date.now() });
  }
  const tab = await globalThis.MyFitDevPage.getTab(tabId);
  const domain = globalThis.MyFitDevPage.tabDomain(tab);
  const runId = `run_${Date.now()}`;
  currentRun = { id: runId, active: true, tabId, domain, trace: [], saved: [], auto: !!auto, startedAt: Date.now() };
  setBadge('AI', '#0090ed');
  notifyTab(tabId, `Agent ${auto ? 'auto-' : ''}surveying ${domain}${kinds?.length ? ` (${kinds.join(', ')})` : ''}...`, 'running');

  const goal = [
    `Survey this page and register extractors for whatever is worth extracting.`,
    `Tab URL: ${tab.url}`,
    `Registrable domain to use in entry ids: ${domain.replace(/^www\./, '')}`,
    pageType ? `Page type hint: ${pageType}` : '',
    kinds?.length ? `Developer-requested kinds (treat as priorities, not limits): ${kinds.join(', ')}` : 'Decide yourself which extractors this page deserves.',
    instructions ? `Extra instructions from the developer: ${instructions}` : ''
  ].filter(Boolean).join('\n');

  const execute = globalThis.MyFitDevTools.createDevToolExecutor(tabId, (k, d) => broadcast({ kind: k, data: d, ts: Date.now() }));
  broadcast({ kind: 'start', text: `[${provider}] ${goal}`, runId, ts: Date.now() });

  (async () => {
    try {
      if (provider === 'openai') await runOpenAILoop(settings, goal, execute);
      else await runAnthropicLoop(settings, goal, execute);
      if (currentRun) {
        const n = currentRun.saved.length;
        const outcome = n ? `saved ${n} parser${n > 1 ? 's' : ''}` : 'finished, nothing saved';
        await recordRun(currentRun, outcome);
        setBadge(n ? '✓' : '–', n ? '#16a34a' : '#6b7280');
        notifyTab(tabId, n ? `Registered: ${currentRun.saved.join(', ')}.` : 'Agent finished without saving an extractor. See the trace.', n ? 'saved' : 'idle');
        if (n) chrome.tabs.sendMessage(tabId, { type: 'myfit-extractors-updated' }).catch(() => {});
      }
    } catch (e) {
      broadcast({ kind: 'error', text: String(e.message || e), ts: Date.now() });
      if (currentRun) {
        await recordRun(currentRun, `error: ${String(e.message || e).slice(0, 140)}`);
        setBadge('!', '#dc2626');
        notifyTab(tabId, `Agent run failed: ${String(e.message || e).slice(0, 120)}`, 'error');
      }
    } finally {
      if (currentRun) currentRun.active = false;
      broadcast({ kind: 'stopped', ts: Date.now() });
      setTimeout(() => setBadge('', null), 30000);
    }
  })();

  return { started: true, runId, domain };
}

function buildExport(registry) {
  const dev = registry.entries.filter((e) => e.savedAt);
  const registryEntries = dev.map(({ savedAt, code, ...rest }) => rest);
  const packagedShape = {
    version: Math.floor(Date.now() / 1000),
    updated: new Date().toISOString().slice(0, 10),
    entries: registryEntries
  };
  const jsEntries = dev.filter((e) => e.engine === 'js');
  const bundled = [
    '(() => {',
    '  const bundled = {};',
    ...jsEntries.map((e) => `  bundled[${JSON.stringify(e.id)}] = function (doc) {\n${e.code}\n  };`),
    "  if (typeof window !== 'undefined') window.MyFitBundled = bundled;",
    '  else globalThis.MyFitBundled = bundled;',
    '})();',
    ''
  ].join('\n');
  return { registryJson: JSON.stringify(packagedShape, null, 2), bundledJs: bundled, jsCount: jsEntries.length, total: dev.length };
}

const AUTO_RUN_COOLDOWN_MS = 24 * 60 * 60 * 1000;

async function maybeAutoRun(msg, sender) {
  const tabId = sender?.tab?.id;
  if (!tabId) return { skipped: 'no tab' };
  const { devAutoRun, devAutoRunLog } = await chrome.storage.local.get(['devAutoRun', 'devAutoRunLog']);
  if (devAutoRun === false) return { skipped: 'auto-run disabled' };
  if (currentRun?.active) return { skipped: 'run already active' };
  if (!globalThis.MyFitDevPage.userScriptsAvailable()) return { skipped: 'user scripts disabled' };
  let domain;
  try { domain = new URL(sender.tab.url).hostname.replace(/^www\./, ''); } catch { return { skipped: 'bad url' }; }
  const pageType = msg.pageType || 'product';
  const key = `${domain}|${pageType}`;
  const log = devAutoRunLog || {};
  if (log[key] && Date.now() - log[key] < AUTO_RUN_COOLDOWN_MS) return { skipped: `cooldown for ${key}` };
  log[key] = Date.now();
  await chrome.storage.local.set({ devAutoRunLog: log });
  return runAgent({
    tabId,
    kinds: [],
    pageType,
    instructions:
      `AUTO-DISPATCHED: no extractors exist for this site's ${pageType} pages yet. Survey the page, decide what is worth extracting, and register extractors for it. Work quietly; do not assume the developer is watching. If nothing here is worth extracting, finish without saving.`
  });
}

Object.assign(globalThis.MyFitHandlers, {
  'dev-run-agent': (msg) => runAgent(msg),
  'dev-run-agent-here': (msg, sender) => {
    if (!sender?.tab?.id) throw new Error('No tab to run on.');
    return runAgent({ tabId: sender.tab.id, kinds: msg.kinds || ['sizes', 'reviews', 'item'], instructions: msg.instructions || '', auto: false });
  },
  'dev-auto-run': (msg, sender) => maybeAutoRun(msg, sender),
  'dev-stop-agent': () => {
    if (currentRun) currentRun.active = false;
    return { stopped: true };
  },
  'dev-agent-status': () => currentRun ? { id: currentRun.id, active: currentRun.active, domain: currentRun.domain, trace: currentRun.trace.slice(-400) } : null,
  'dev-list-parsers': async () => {
    const { devParsers } = await chrome.storage.local.get('devParsers');
    return Object.values(devParsers || {}).sort((a, b) => b.savedAt - a.savedAt);
  },
  'dev-delete-parser': async (msg) => {
    const { devParsers } = await chrome.storage.local.get('devParsers');
    const map = devParsers || {};
    delete map[msg.id];
    await chrome.storage.local.set({ devParsers: map });
    return { deleted: true };
  },
  'dev-export': async () => buildExport(await globalThis.MyFitHandlers['get-registry']()),
  'dev-failures': async () => {
    const { parserFailures } = await chrome.storage.local.get('parserFailures');
    return (parserFailures || []).slice(-50).reverse();
  }
});
