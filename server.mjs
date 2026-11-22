import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// Local imitation of the Gemini proxy (dev only): lets you test the AI flow without a key.
// Enable in the browser console: localStorage.setItem('ottenok-ai-url', 'http://localhost:5173/__mock')
function body(req) {
  return new Promise(r => {
    let s = '';
    req.on('data', c => {
      s += c;
      if (s.length > 3e6) req.destroy();
    });
    req.on('end', () => {
      try {
        r(JSON.parse(s || '{}'));
      } catch {
        r({});
      }
    });
  });
}
function tone(sec = 1.4, rate = 24000) {
  const n = Math.round(sec * rate),
    b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate,
      e = Math.min(1, t * 8, (sec - t) * 8);
    b.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (330 + 40 * Math.sin(t * 3)) * t) * e * 6000), 44 + i * 2);
  }
  return b;
}
async function mock(req, res, path) {
  const send = (o, s = 200) =>
    res.writeHead(s, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(o));
  if (path === '/health') return send({ ok: true, model: 'mock', tts: 'mock' });
  const j = await body(req);
  await new Promise(r => setTimeout(r, 900));
  if (path === '/tts') {
    res.writeHead(200, { 'Content-Type': 'audio/wav' }).end(tone(Math.min(4, 0.8 + String(j.text || '').length / 60)));
    return;
  }
  if (path === '/analyze') {
    const t = (j.notes || []).join(' ').toLowerCase();
    const mood = /грус|дожд|устал/.test(t)
      ? 'melancholy'
      : /срочн|дедлайн|нерв/.test(t)
        ? 'tense'
        : /смея|радост|праздн|!/.test(t)
          ? 'bright'
          : 'calm';
    const pal = {
      calm: ['#e8a86b', '#c56b4a', '#f3dcb4'],
      tense: ['#4f7fd9', '#d7e2ff', '#283e86'],
      bright: ['#ff6fb0', '#ffd66b', '#6fe6ff'],
      melancholy: ['#8d7bd6', '#4fa7a8', '#d2cbf5'],
    }[mood];
    const sentences = (j.notes || [])
      .flatMap(n => n.match(/[^.!?…]+[.!?…]*/g) || [n])
      .map(s => s.trim())
      .filter(Boolean);
    const per = Math.max(1, Math.ceil(sentences.length / 3)),
      fragments = [];
    for (let i = 0; i < sentences.length; i += per) fragments.push(sentences.slice(i, i + per).join(' '));
    const weather = [
      ['rain', /дожд/],
      ['snow', /снег/],
      ['wind', /ветер|ветр/],
      ['sun', /солнц|закат/],
      ['fog', /туман/],
    ]
      .filter(([, r]) => r.test(t))
      .map(([k]) => k);
    return send({
      mood,
      energy: mood === 'tense' ? 0.8 : mood === 'bright' ? 0.7 : 0.3,
      valence: mood === 'melancholy' ? -0.5 : 0.5,
      colors: pal,
      title: '(ИИ-имитация) Тёплый вечер у воды',
      fragments,
      weather,
      why: [
        'Это ответ имитации ИИ для проверки без ключа.',
        `Фото получено: ${(j.photos || []).length}.`,
        'Палитра и название подставлены заглушкой.',
      ],
      voice: 'тихо и тепло, с паузами',
    });
  }
  send({ error: 'not found' }, 404);
}

http
  .createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.startsWith('/__mock/')) return await mock(req, res, p.slice(7));
      if (p === '/') p = '/index.html';
      const f = normalize(join(root, p));
      if (!f.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      const b = await readFile(f);
      res
        .writeHead(200, {
          'Content-Type': types[extname(f)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        .end(b);
    } catch {
      try {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(await readFile(join(root, '404.html')));
      } catch {
        res.writeHead(404).end('not found');
      }
    }
  })
  .listen(5173, () => console.log('http://localhost:5173'));
