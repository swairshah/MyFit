import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const dist = process.argv[2] ? process.argv[2] : join(root, 'build');

function copyTree(from, to, exclude = []) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (exclude.includes(name)) continue;
    const s = join(from, name);
    const d = join(to, name);
    if (statSync(s).isDirectory()) copyTree(s, d);
    else copyFileSync(s, d);
  }
}

function mergeManifest(base, patch) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(patch)) {
    if (Array.isArray(v) && Array.isArray(out[k])) out[k] = [...new Set([...out[k], ...v])];
    else out[k] = v;
  }
  return out;
}

function build(target) {
  const out = join(dist, target);
  try { rmSync(out, { recursive: true, force: true }); } catch {}
  mkdirSync(out, { recursive: true });

  copyTree(join(src, 'shared'), out, ['manifest.base.json']);
  const variant = join(src, target);
  if (existsSync(variant)) copyTree(variant, out, ['manifest.patch.json']);

  const base = JSON.parse(readFileSync(join(src, 'shared', 'manifest.base.json'), 'utf8'));
  const patch = JSON.parse(readFileSync(join(src, target, 'manifest.patch.json'), 'utf8'));
  const manifest = mergeManifest(base, patch);
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`built ${join(dist, target)}`);
  return manifest;
}

const prodManifest = build('prod');
build('dev');

try {
  const zipName = `myfit-prod-v${prodManifest.version}.zip`;
  const zipPath = join(dist, zipName);
  try { rmSync(zipPath, { force: true }); } catch {}
  execFileSync('zip', ['-rq', zipPath, '.'], { cwd: join(dist, 'prod') });
  console.log(`packaged ${join(dist, zipName)} (upload this to the Chrome Web Store)`);
} catch {
  console.log('zip not available — upload the build/prod directory contents manually');
}
