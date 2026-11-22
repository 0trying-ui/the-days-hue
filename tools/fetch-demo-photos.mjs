// Dev tool: downloads freely licensed photos for the built-in demo days from Wikimedia Commons.
// Only public-domain / CC0 / CC BY / CC BY-SA files are taken; every file's author and licence go to
// assets/demo/credits.json and CREDITS.md. Usage: node tools/fetch-demo-photos.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const UA = 'ottenok-dnya-demo/1.0 (demo photo fetcher)';
const API = 'https://commons.wikimedia.org/w/api.php';
const OK_LICENSE = /^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+)/i;
// two searches per demo day, in the order of DAYS in js/demo.js
const QUERIES = [
  ['snowman', 'snowy courtyard'],
  ['autumn park', 'hot chocolate'],
  ['office night', 'laptop night'],
  ['concert crowd stage lights', 'music festival crowd night lights'],
  ['rain window', 'cup of tea'],
  ['sunset beach', 'watermelon slices'],
  ['book coffee', 'reading armchair'],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(params, tries = 5) {
  await sleep(1500); // be gentle with the public API
  const u = new URL(API);
  for (const [k, v] of Object.entries({ format: 'json', origin: '*', ...params })) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { 'User-Agent': UA } });
  if (r.status === 429 && tries > 0) {
    await sleep(8000);
    return api(params, tries - 1);
  }
  if (!r.ok) throw new Error('commons ' + r.status);
  return r.json();
}
const strip = s =>
  String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

async function find(query, used) {
  const j = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: 6,
    gsrlimit: 30,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata|mime',
    iiurlwidth: 1000,
  });
  const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
  for (const p of pages) {
    const ii = p.imageinfo && p.imageinfo[0];
    if (!ii || !/jpeg/.test(ii.mime) || used.has(p.title)) continue;
    if (ii.width < 1200 || ii.width < ii.height * 1.15) continue; // landscape, big enough
    const md = ii.extmetadata || {};
    // real-life photos only: no paintings or museum pieces
    const about = p.title + ' ' + strip(md.ImageDescription && md.ImageDescription.value) + ' ' + strip(md.Categories && md.Categories.value);
    if (/painting|gallery|museum|oil on|canvas|Gogh|Vasnetsov|Kallela|artwork|illustration/i.test(about)) continue;
    const lic = strip(md.LicenseShortName && md.LicenseShortName.value);
    if (!OK_LICENSE.test(lic)) continue;
    return {
      title: p.title,
      thumb: ii.thumburl,
      page: ii.descriptionurl,
      license: lic,
      licenseUrl: strip(md.LicenseUrl && md.LicenseUrl.value),
      author: strip(md.Artist && md.Artist.value).slice(0, 120) || 'unknown',
    };
  }
  return null;
}

mkdirSync('assets/demo', { recursive: true });
// REDO="0-0:snowman garden,1-1:cocoa mug" re-picks only those slots (optionally with a new search)
const redo = new Map(
  String(process.env.REDO || '')
    .split(',')
    .filter(Boolean)
    .map(x => {
      const [slot, q] = x.split(':');
      return [slot.trim(), q && q.trim()];
    }),
);
const old = existsSync('assets/demo/credits.json') ? JSON.parse(readFileSync('assets/demo/credits.json', 'utf8')) : [];
const used = new Set(old.map(c => c.title)),
  credits = redo.size ? old.filter(c => !redo.has(c.file.match(/day(\d+-\d+)/)[1])) : [];
for (let d = 0; d < QUERIES.length; d++) {
  for (let k = 0; k < QUERIES[d].length; k++) {
    const slot = `${d}-${k}`;
    if (redo.size && !redo.has(slot)) continue;
    const hit = await find(redo.get(slot) || QUERIES[d][k], used);
    if (!hit) {
      console.log(`day ${d} photo ${k}: nothing suitable for "${QUERIES[d][k]}"`);
      continue;
    }
    used.add(hit.title);
    await sleep(1500);
    const r = await fetch(hit.thumb, { headers: { 'User-Agent': UA } });
    const buf = Buffer.from(await r.arrayBuffer());
    const file = `assets/demo/day${d}-${k}.jpg`;
    writeFileSync(file, buf);
    credits.push({ file, ...hit });
    credits.sort((a, b) => a.file.localeCompare(b.file));
    console.log(`${file}  ${Math.round(buf.length / 1024)} KB  ${hit.license}  ${hit.title}`);
  }
}
writeFileSync('assets/demo/credits.json', JSON.stringify(credits, null, 2));
writeFileSync(
  'CREDITS.md',
  `# Фото в демо-днях\n\nВсе фото взяты с Wikimedia Commons под свободными лицензиями. Свои дни пользователя хранятся только у него в браузере.\n\n` +
    credits.map(c => `- \`${c.file}\` — ${c.title.replace(/^File:/, '')}, автор: ${c.author}, лицензия: ${c.license} — ${c.page}`).join('\n') +
    '\n',
);
