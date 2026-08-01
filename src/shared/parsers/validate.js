(() => {
  function validateItems(items, rules) {
    if (!rules) return { ok: items.length > 0, errors: items.length ? [] : ['no items'] };
    const errors = [];
    if (rules.minItems != null && items.length < rules.minItems) errors.push(`got ${items.length} items, need >= ${rules.minItems}`);
    if (rules.maxItems != null && items.length > rules.maxItems) errors.push(`got ${items.length} items, max ${rules.maxItems}`);
    const fieldRules = rules.fields || {};
    let checked = 0;
    for (const item of items) {
      const f = item.fields || item;
      for (const [name, r] of Object.entries(fieldRules)) {
        const v = f[name];
        if (r.required && (v == null || v === '')) { errors.push(`item ${checked}: field "${name}" missing`); continue; }
        if (v == null) continue;
        if (r.type === 'boolean' && typeof v !== 'boolean') errors.push(`item ${checked}: "${name}" not boolean`);
        if (r.type === 'string' && typeof v !== 'string') errors.push(`item ${checked}: "${name}" not string`);
        if (r.regex && typeof v === 'string') {
          try {
            if (!new RegExp(r.regex, r.flags || 'i').test(v)) errors.push(`item ${checked}: "${name}"="${String(v).slice(0, 40)}" fails /${r.regex}/`);
          } catch { errors.push(`bad validator regex for "${name}"`); }
        }
        if (r.maxLength && typeof v === 'string' && v.length > r.maxLength) errors.push(`item ${checked}: "${name}" too long`);
      }
      checked++;
      if (errors.length > 8) break;
    }
    return { ok: errors.length === 0, errors: errors.slice(0, 8) };
  }

  const SIZE_REGEX = '^(XXS|XS|S|M|L|XL|XXL|[2-6]XL|OS|ONE SIZE|\\d{1,2}(\\.5)?|W?[23][0-9]|W?4[0-4]|(\\d?X{0,3}[- ]?)?(SMALL|LARGE)([ -](TALL|SHORT|BIG|PETITE|REGULAR))?|MEDIUM([ -](TALL|SHORT|BIG|PETITE|REGULAR))?)$';

  const KIND_DEFAULTS = {
    sizes: { minItems: 2, maxItems: 40, fields: { text: { required: true, type: 'string', regex: SIZE_REGEX } } },
    reviews: { minItems: 1, maxItems: 40, fields: { text: { required: true, type: 'string', maxLength: 2000 } } },
    purchases: { minItems: 1, maxItems: 30, fields: { item: { required: true, type: 'string', maxLength: 300 } } },
    item: { minItems: 1, maxItems: 1, fields: { title: { required: true, type: 'string', maxLength: 300 } } }
  };

  function validate(items, entry) {
    const rules = entry.validate || KIND_DEFAULTS[entry.kind] || { minItems: 1 };
    return validateItems(items, rules);
  }

  const api = { validate, validateItems, KIND_DEFAULTS, SIZE_REGEX };
  if (typeof window !== 'undefined') window.MyFitValidate = api;
  else globalThis.MyFitValidate = api;
})();
