// Builds the jury demo into dist-demo/: the same site, but without AI and read-aloud, so every new day is
// made by the built-in algorithm in the browser (colours from photos and words, notes split into sheets).
// Usage: node build-demo.mjs && npx.cmd wrangler deploy -c wrangler.demo.toml
import { execSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';

const keep = existsSync('dist');
if (keep) renameSync('dist', 'dist.keep');
try {
  execSync('node build.mjs', { stdio: 'inherit', env: { ...process.env, DEMO: '1' } });
  rmSync('dist-demo', { recursive: true, force: true });
  renameSync('dist', 'dist-demo');
} finally {
  if (keep) renameSync('dist.keep', 'dist');
}
console.log('dist-demo ready');
