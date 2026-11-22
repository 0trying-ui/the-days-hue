// Builds dist/ with only the files the public site needs (no proxy code, dev server or notes).
// Optimization is lossless: the same code and styles, only smaller and fewer requests.
//   - all JS modules bundled into one minified file (one request instead of 14 in a chain)
//   - CSS minified
//   - file names carry a content hash, so browsers cache them for a year and still get every update
// Usage: node build.mjs && npx wrangler deploy -c wrangler.site.toml
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

const PAGES = ['index.html', 'privacy.html', 'terms.html', '404.html'];
const SITE_FILES = ['robots.txt', 'sitemap.xml', 'manifest.webmanifest'];
const PROXY = 'https://ottenok-dnya-ai.tryfx.workers.dev';
const ESBUILD = 'npx --yes esbuild@0.24.0';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/js', { recursive: true });
mkdirSync('dist/css');
for (const f of SITE_FILES) cpSync(f, `dist/${f}`);
cpSync('assets', 'dist/assets', { recursive: true });

const run = cmd => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });
// Renames a built file to name.<hash>.ext and returns its new site path.
function hashed(path) {
  const h = createHash('sha256')
    .update(readFileSync(`dist/${path}`))
    .digest('hex')
    .slice(0, 10);
  const out = path.replace(/\.(\w+)$/, `.${h}.$1`);
  renameSync(`dist/${path}`, `dist/${out}`);
  return out;
}

// photo worker: its own minified file; its hashed name is written into the app bundle
run(`${ESBUILD} js/photo-worker.js --minify --legal-comments=none --outfile=dist/js/photo-worker.js`);
const workerPath = hashed('js/photo-worker.js');
run(`${ESBUILD} js/main.js --bundle --minify --format=esm --legal-comments=none --outfile=dist/js/app.js`);
writeFileSync(
  'dist/js/app.js',
  readFileSync('dist/js/app.js', 'utf8').replaceAll('/js/photo-worker.js', '/' + workerPath),
);
run(`${ESBUILD} css/style.css --minify --outfile=dist/css/style.css`);
run(`${ESBUILD} css/page.css --minify --outfile=dist/css/page.css`);
const map = {
  'js/main.js': hashed('js/app.js'),
  'css/style.css': hashed('css/style.css'),
  'css/page.css': hashed('css/page.css'),
};

for (const page of PAGES) {
  let html = readFileSync(page, 'utf8');
  for (const [from, to] of Object.entries(map))
    html = html.replaceAll(`"${from}"`, `"/${to}"`).replaceAll(`"/${from}"`, `"/${to}"`);
  writeFileSync(`dist/${page}`, html);
}

// Credits page for the demo photos, built from assets/demo/credits.json with the same look as the terms page
{
  const credits = JSON.parse(readFileSync('assets/demo/credits.json', 'utf8'));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const head = readFileSync('dist/terms.html', 'utf8')
    .split('<main>')[0]
    .replace(/<title>[^<]*<\/title>/, '<title>Фото в демо-днях — Оттенок дня</title>');
  const items = credits
    .map(
      c =>
        `<li><b>${esc(c.title.replace(/^File:/, '').replace(/\.jpe?g$/i, ''))}</b><br />автор: ${esc(c.author)} · лицензия: ${esc(c.license)} · <a href="${esc(c.page)}" rel="noopener noreferrer" target="_blank">Wikimedia Commons</a></li>`,
    )
    .join('\n        ');
  writeFileSync(
    'dist/credits.html',
    `${head}<main>
      <a class="back" href="./">← к дневнику</a>
      <h1>Фото в демо-днях</h1>
      <p>Демо-дни показывают, как работает дневник. Их фото взяты с Wikimedia Commons под свободными лицензиями (общественное достояние, CC0, CC BY, CC BY-SA). Твои собственные дни и фото хранятся только у тебя в браузере.</p>
      <ul>
        ${items}
      </ul>
    </main>
  </body>
</html>
`,
  );
}

// Offline service worker: the list of this build's files and a version that changes with them
const OFFLINE = [
  '/',
  // pages by their clean addresses (the host redirects *.html to them)
  '/privacy',
  '/terms',
  '/credits',
  '/manifest.webmanifest',
  '/assets/favicon.svg',
  '/assets/apple-touch-icon.png',
  '/assets/icon-512.png',
  '/' + workerPath,
  ...Object.values(map).map(p => '/' + p),
];
const swVersion = createHash('sha256').update(OFFLINE.join('|')).digest('hex').slice(0, 10);
writeFileSync(
  'dist/sw.js',
  readFileSync('sw.js', 'utf8')
    .replace("'__VERSION__'", JSON.stringify(swVersion))
    .replace('__FILES__', JSON.stringify(OFFLINE)),
);

// Security headers (the same CSP as the <meta> tag, plus headers a meta tag cannot set) and caching.
const CSP = [
  "default-src 'self'",
  // a day's song from a Spotify or SoundCloud link plays in the service's own player (an iframe), driven by
  // messages: none of their scripts run on the page
  "script-src 'self'",
  'frame-src https://open.spotify.com https://w.soundcloud.com',
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob: https://audio-ssl.itunes.apple.com",
  `connect-src 'self' ${PROXY} https://itunes.apple.com`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');
writeFileSync(
  'dist/_headers',
  `/*
  Content-Security-Policy: ${CSP}
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(self), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/sw.js
  Cache-Control: no-cache

/js/*
  Cache-Control: public, max-age=31536000, immutable

/css/*
  Cache-Control: public, max-age=31536000, immutable

/assets/*
  Cache-Control: public, max-age=604800
`,
);
console.log('dist ready:', Object.values(map).join(', '));
