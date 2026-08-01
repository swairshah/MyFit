(() => {
  const bundled = {};
  if (typeof window !== 'undefined') window.MyFitBundled = bundled;
  else globalThis.MyFitBundled = bundled;
})();
