# MyFit

A Chrome extension that knows your fit. On a product page it reads the size options and reviews, cross-references your purchase history ("you wear M at Uniqlo, reviewers say this brand runs a size small"), and draws a soft, disappearing crayon circle around the size that's right for you — with a short note explaining why.

Two builds ship from one codebase:

- **prod** (`build/prod`) — what users install. No code generation, no special permissions. Parsers arrive as reviewable code bundled into releases, plus declarative DSL entries that can update over the air.
- **dev** (`build/dev`) — what you install. Adds an agent that, on any e-commerce tab, writes extraction parsers, tests them against the live page, and registers them — while you watch every tool call in a console.

## Build

```
node scripts/build.mjs
```

Outputs `build/prod` and `build/dev`. Load either via `chrome://extensions` → Developer mode → Load unpacked.

## Setup

1. Open the popup → **Settings** → pick provider, paste API key
2. **Profile** tab → your sizes, fit preference, brand notes
3. Dev build only: `chrome://extensions` → MyFit (Dev) → Details → enable **Allow user scripts** (resets on every extension reload — the console will remind you)

## How extraction works (the cascade)

When a page needs parsing, `content/extract.js` tries, in order:

1. **Registry parser** — an entry matching this domain + URL pattern, run through the DSL interpreter (`parsers/dsl.js`) or a bundled JS function (`parsers/bundled.js`), then checked by validators (`parsers/validate.js`). Failures are logged and fed back to the dev loop.
2. **Structured data** — JSON-LD `Product` for title/price/brand.
3. **Generic heuristics** — the size-regex / review-zone scan, works on a decent chunk of sites, misses the rest.

A parser entry looks like:

```json
{
  "id": "zara.com/sizes@1",
  "domain": "zara.com",
  "kind": "sizes",
  "urlPattern": "/p/",
  "engine": "dsl",
  "description": "size buttons on product pages",
  "program": {
    "root": "[data-qa='size-selector']",
    "each": "button",
    "fields": {
      "text": { "op": "text" },
      "disabled": { "op": "hasClass", "name": "disabled" },
      "selected": { "op": "attr", "name": "aria-checked" }
    }
  }
}
```

DSL ops are a closed vocabulary (`text`, `attr`, `hasClass`, `matches`, `exists`, `regexExtract`, `regexTest`, `const`) — no control flow, no abstraction, bounded iteration. That keeps over-the-air entries on the config side of Chrome Web Store's remote-code line. Anything the DSL can't express is written as `engine: "js"` and ships as ordinary bundled code in the next release, where it's reviewable.

## The dev loop

1. Open a product page, then the popup → **Dev console** (link appears only in the dev build)
2. Pick parser kinds (sizes / reviews / item / purchases), hit **Run agent on this tab**
3. The agent reads the page, probes selectors with read-only JavaScript (network, clicks, and form submission are blocked by a guard in the user-script world), builds a DSL entry, tests it through the same engine production uses, and saves it — every tool call streams into the trace
4. DSL parsers take effect immediately in your dev build (they merge into the registry ahead of packaged entries). JS parsers wait for export
5. **Export registry + bundled.js** downloads the two generated files — commit them to `src/shared/parsers/` and rebuild; the next release carries them to everyone
6. The **failures** panel shows registry parsers that broke on real pages — your regeneration queue

## Repo layout

| Path | Role |
|---|---|
| `src/shared/` | Everything both builds use: crayon engine, panel, analyzer, extraction cascade, popup, parser DSL + validators + registry |
| `src/dev/` | Agent (tools, loop, read-only guard), dev console, manifest patch adding `userScripts`/`scripting`/`tabs` |
| `src/prod/` | Manifest patch (empty — prod is the baseline) |
| `scripts/build.mjs` | Assembles `build/prod` and `build/dev`, merges manifests |
| `demo.html` | The crayon engine in isolation — open directly in a browser, no install needed |

## Privacy

API keys live in extension storage. Page extracts go to the provider you chose, nowhere else. The prod build runs no generated code at runtime; the dev build runs agent-written JS only on your machine, behind the user-scripts toggle, with a guard blocking network and page mutation.
