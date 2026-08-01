(() => {
  const OPS = {
    text(el, spec) {
      const node = spec.sel ? el.querySelector(spec.sel) : el;
      return node ? node.textContent.trim().replace(/\s+/g, ' ') : null;
    },
    attr(el, spec) {
      const node = spec.sel ? el.querySelector(spec.sel) : el;
      return node ? node.getAttribute(spec.name) : null;
    },
    hasClass(el, spec) {
      const node = spec.sel ? el.querySelector(spec.sel) : el;
      return node ? node.classList.contains(spec.name) : false;
    },
    matches(el, spec) {
      const node = spec.sel ? el.querySelector(spec.sel) : el;
      try { return node ? node.matches(spec.selector) : false; } catch { return false; }
    },
    exists(el, spec) {
      return !!el.querySelector(spec.sel);
    },
    regexExtract(el, spec) {
      const base = OPS.text(el, { sel: spec.sel });
      if (base == null) return null;
      try {
        const m = base.match(new RegExp(spec.pattern, spec.flags || ''));
        return m ? (m[spec.group ?? 0] ?? null) : null;
      } catch { return null; }
    },
    regexTest(el, spec) {
      const base = OPS.text(el, { sel: spec.sel });
      if (base == null) return false;
      try { return new RegExp(spec.pattern, spec.flags || '').test(base); } catch { return false; }
    },
    style(el, spec) {
      const node = spec.sel ? el.querySelector(spec.sel) : el;
      if (!node || typeof getComputedStyle !== 'function') return false;
      const v = String(getComputedStyle(node)[spec.prop] ?? '');
      return spec.includes != null ? v.includes(spec.includes) : v;
    },
    const(_el, spec) {
      return spec.value;
    }
  };

  const MAX_ITEMS = 60;

  function runProgram(program, doc) {
    if (!program || typeof program !== 'object') throw new Error('Bad program');
    const scope = program.root ? doc.querySelector(program.root) : doc;
    if (!scope) return { items: [], reason: `root not found: ${program.root}` };
    let nodes;
    if (program.each) nodes = [...scope.querySelectorAll(program.each)].slice(0, MAX_ITEMS);
    else nodes = [scope === doc ? doc.documentElement : scope];
    const items = [];
    for (const node of nodes) {
      if (program.where) {
        const op = OPS[program.where.op];
        if (!op || !op(node, program.where)) continue;
      }
      const fields = {};
      let bad = false;
      for (const [name, spec] of Object.entries(program.fields || {})) {
        const op = OPS[spec.op];
        if (!op) { bad = true; break; }
        fields[name] = op(node, spec);
      }
      if (bad) continue;
      items.push({ el: node, fields });
    }
    return { items };
  }

  const api = { run: runProgram, ops: Object.keys(OPS) };
  if (typeof window !== 'undefined') window.MyFitDSL = api;
  else globalThis.MyFitDSL = api;
})();
