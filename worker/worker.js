// «Оттенок дня» — proxy between the site and Google Gemini.
// The Gemini API key lives only here (Cloudflare secret GEMINI_API_KEY); the site never sees it.
//
// Routes:
//   GET  /health   -> { ok, model, tts }
//   GET  /usage    -> today's use for this visitor: { days:{used,max}, voices:{used,max}, src, resetAt }
//   GET  /cover?url=<song link>  -> { cover: data URL, title, author } for Spotify, SoundCloud, Apple Music links
//   POST /transcribe (body: recorded audio) -> { text }  speech to text with Cloudflare Workers AI (Whisper)
//   POST /analyze  -> mood, palette, title, fragments, weather, explanation, reading style for one day
//   POST /tts      -> audio/wav of a note read with an emotion that fits the day
//
// Env vars (wrangler.toml [vars] or dashboard):
//   GEMINI_API_KEY   (secret, required)
//   ALLOWED_ORIGINS  comma list of site origins allowed to call the proxy, e.g. "https://name.github.io,http://localhost:5173"
//   GEMINI_MODEL     main analysis model, default "gemini-flash-lite-latest" (fast, large free daily quota)
//   GEMINI_FALLBACK  comma list of Gemini models tried next
//   CF_MODEL         Cloudflare Workers AI model used last (binding AI), text only
//   LIMIT_DAYS / LIMIT_VOICES / LIMIT_DICT  daily allowance per visitor (counted in the Usage Durable Object)
//
// Groq (optional secret GROQ_API_KEY): analysis and dictation try it first, then Gemini, then Workers AI.
//   GROQ_MODEL / GROQ_VISION_MODEL / GROQ_WHISPER  override the Groq models
//   GEMINI_TTS_MODEL default "gemini-2.5-flash-preview-tts"

const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const KINDS = ['calm', 'tense', 'bright', 'melancholy'];
const WEATHER = ['rain', 'snow', 'wind', 'sun', 'fog'];
const VOICES = { calm: 'Sulafat', bright: 'Puck', tense: 'Kore', melancholy: 'Enceladus' };
const hits = new Map();
// Gemini 3 models think a lot by default; keep it short so the answer comes in seconds.
const thinking = model => (/gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: 'low' } } : {});
// errors worth trying the next model for: overload, timeouts, retired or unknown models, a used-up daily quota
const RETRY =
  /demand|overload|unavailable|timeout|HTTP 5\d\d|not found|no longer available|not supported|deprecated|quota|exhausted|rate limit|HTTP 429/i;

// every answer: no sniffing, no caching, no referrer
const SAFE = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...SAFE, ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
// errors: the visitor gets a short, safe reason; details go only to our logs
const PUBLIC_ERRORS = new Set(['empty', 'bad link', 'no id in link', 'unsupported service', 'no cover', 'too large']);
function failure(e, cors) {
  const msg = String((e && e.message) || e);
  if (PUBLIC_ERRORS.has(msg)) return json({ error: msg }, (e && e.status) || 400, cors);
  console.warn('request failed:', msg.slice(0, 300));
  return json(
    { error: /quota|exhausted|rate|429/i.test(msg) ? 'ai busy' : 'ai unavailable' },
    (e && e.status) || 502,
    cors,
  );
}
function limited(ip, limit = 40) {
  const now = Date.now(),
    win = 60_000,
    arr = (hits.get(ip) || []).filter(t => now - t < win);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > limit;
}
async function gemini(env, model, body, ms = 22000) {
  const ctl = new AbortController(),
    timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`${API}${model}:generateContent`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data.error && data.error.message) || `Gemini HTTP ${r.status}`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(`timeout after ${ms / 1000}s (${model})`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
// Tries the primary model, then each fallback, when the error is transient (overload, timeout, retired model).
async function withFallback(env, primary, fallbacks, makeBody, ms) {
  const chain = [
    primary,
    ...String(fallbacks || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean),
  ];
  let last;
  for (const m of chain) {
    try {
      return { data: await gemini(env, m, makeBody(m), ms), model: m };
    } catch (e) {
      last = e;
      console.warn('model failed:', m, String(e.message).slice(0, 200));
      if (!RETRY.test(String(e.message))) throw e;
    }
  }
  throw last;
}

const SYSTEM = `Ты художник-колорист и бережный редактор личного дневника «Оттенок дня».
Человек описал свой день заметками, иногда приложил фото и песню. Твоя задача — передать АТМОСФЕРУ дня, а не пересказать события.
Настроение и цвета выбирай по самим воспоминаниям: что случилось, где, с кем, что человек почувствовал. Фото и песня — только подсказка и сверка.
Правила:
- mood: одно из calm (спокойный, тёплый), tense (напряжённый, собранный, тревожный), bright (яркий, радостный, живой), melancholy (задумчивый, грустный, тихий). Определи по событиям и чувствам в заметках.
- colors: ровно 3 цвета в формате #rrggbb, которые рассказывают о событиях и местах дня в его настроении: море и пляж — лазурь, бирюза, песок; закат — коралл, золото; снег и зима — холодный белый, голубой; осенний парк — охра, медь; ночной офис и дедлайн — индиго, холодный неон; концерт — пурпур, электрический розовый; дождь — серо-синий, мокрый асфальт; уютный дом — карамель, тёплый крем. Если есть фото — сверь с ними оттенки, но главное — события. Без кислотных и грязно-серых цветов. Первый цвет — главный.
- title: название папки дня по-русски, 3–7 слов, образно, в одном тоне (например «Вечер у пруда с какао»), без кавычек, без даты, без точки.
- fragments: раздели текст пользователя на 1–5 смысловых кусочков для отдельных листков. НЕ меняй, не дописывай и не сокращай слова пользователя, только раздели.
- spoken: те же кусочки в том же порядке и того же количества, но для чтения вслух: исправь опечатки, пропущенные и лишние буквы, раскладку, расставь знаки препинания и ё, раскрой сокращения так, как их произносят. Смысл, порядок и стиль не меняй, ничего не добавляй.
- weather: какие погодные явления реально упомянуты или видны на фото: rain, snow, wind, sun, fog. Пустой список, если ничего нет.
- why: 3–5 коротких предложений по-русски, почему день выглядит именно так: ссылайся на конкретные детали (слова, цвета на фото, темп песни).
- voice: короткая подсказка по-русски, как читать заметки вслух (темп, тембр, эмоция).
- energy: от 0 до 1. valence: от -1 (грустно) до 1 (радостно).
Не делай медицинских или психологических выводов о человеке.
Отвечай только JSON-объектом с полями: mood, energy, valence, colors, title, fragments, spoken, weather, why, voice.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    mood: { type: 'STRING', enum: KINDS },
    energy: { type: 'NUMBER' },
    valence: { type: 'NUMBER' },
    colors: { type: 'ARRAY', items: { type: 'STRING' } },
    title: { type: 'STRING' },
    fragments: { type: 'ARRAY', items: { type: 'STRING' } },
    spoken: { type: 'ARRAY', items: { type: 'STRING' } },
    weather: { type: 'ARRAY', items: { type: 'STRING', enum: WEATHER } },
    why: { type: 'ARRAY', items: { type: 'STRING' } },
    voice: { type: 'STRING' },
  },
  required: ['mood', 'energy', 'valence', 'colors', 'title', 'fragments', 'spoken', 'weather', 'why', 'voice'],
  propertyOrdering: ['mood', 'energy', 'valence', 'colors', 'title', 'fragments', 'spoken', 'weather', 'why', 'voice'],
};

async function analyze(input, env) {
  const notes = (Array.isArray(input.notes) ? input.notes : [])
    .map(s => String(s).slice(0, 2000))
    .filter(Boolean)
    .slice(0, 8);
  if (!notes.length) throw Object.assign(new Error('empty'), { status: 400 });
  const photos = (Array.isArray(input.photos) ? input.photos : [])
    .filter(p => typeof p === 'string' && p.length < 400_000)
    .slice(0, 3);
  const song = input.song && typeof input.song === 'object' ? input.song : null;
  const facts = [
    `Дата: ${String(input.date || '').slice(0, 10)}`,
    `Заметки (каждая с новой строки):\n${notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}`,
    song
      ? `Песня: ${String(song.name || 'без названия').slice(0, 120)}; темп около ${Number(song.tempo) || '?'} уд/мин; энергия ${Number(song.energy) || '?'}; тембр ${Number(song.bright) > 0.5 ? 'светлый' : 'тёмный'}`
      : 'Песни нет или она дана ссылкой.',
    photos.length ? `Фото дня приложены (${photos.length}).` : 'Фото нет.',
  ].join('\n\n');
  if (env.GROQ_API_KEY) {
    try {
      return await groqAnalyze(env, facts, photos);
    } catch (e) {
      console.warn('groq failed:', String(e.message).slice(0, 300));
    }
  }
  if (!env.GEMINI_API_KEY) {
    if (env.AI) return { out: await cfAnalyze(env, facts), src: 'workers-ai' };
    throw new Error('no AI is set up');
  }
  const parts = [{ text: facts }, ...photos.map(data => ({ inlineData: { mimeType: 'image/jpeg', data } }))];
  let res;
  try {
    res = await withFallback(
      env,
      env.GEMINI_MODEL || 'gemini-flash-lite-latest',
      env.GEMINI_FALLBACK ?? 'gemini-3.8-flash',
      m => ({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.7,
          responseMimeType: 'application/json',
          ...(env.GEMINI_SCHEMA === 'off' ? {} : { responseSchema: SCHEMA }),
          ...thinking(m),
        },
      }),
      12000,
    );
  } catch (e) {
    // every Gemini model is overloaded or out of quota: Cloudflare Workers AI answers from the text alone
    console.warn('gemini chain failed:', String(e.message).slice(0, 300));
    if (!env.AI || !(RETRY.test(String(e.message)) || /quota|exhausted|rate|429/i.test(String(e.message)))) throw e;
    return { out: await cfAnalyze(env, facts), src: 'workers-ai' };
  }
  const text = res.data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  let out;
  try {
    out = JSON.parse(text);
  } catch {
    throw new Error('bad JSON from model');
  }
  return { out, src: res.model };
}

/* Groq (OpenAI-compatible API, pay per use): tried first when GROQ_API_KEY is set.
   With photos a model that sees images, without them a cheap text model. On any error the Gemini chain runs. */
const GROQ = 'https://api.groq.com/openai/v1';
async function groqAnalyze(env, facts, photos) {
  const model = photos.length
    ? env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b'
    : env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const ctl = new AbortController(),
    timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(GROQ + '/chat/completions', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.GROQ_API_KEY },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            // text models get plain text; a list of parts only when there are photos to show
            content: photos.length
              ? [
                  { type: 'text', text: facts },
                  ...photos.map(p => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + p } })),
                ]
              : facts,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_completion_tokens: 2000,
        ...(/gpt-oss/.test(model) ? { reasoning_effort: 'low' } : {}),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data.error && data.error.message) || 'Groq HTTP ' + r.status);
    const text = data.choices?.[0]?.message?.content || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('bad JSON from Groq');
    return { out: JSON.parse(m[0]), src: 'groq:' + model };
  } finally {
    clearTimeout(timer);
  }
}
async function groqTranscribe(env, buf, type) {
  const fd = new FormData();
  // the file name tells Groq the format (Safari records mp4, others webm or ogg)
  const ext = /mp4|m4a|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : /wav/.test(type) ? 'wav' : 'webm';
  fd.append('file', new Blob([buf], { type: type || 'audio/webm' }), 'voice.' + ext);
  fd.append('model', env.GROQ_WHISPER || 'whisper-large-v3-turbo');
  fd.append('language', 'ru');
  fd.append('response_format', 'json');
  const r = await fetch(GROQ + '/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.GROQ_API_KEY },
    body: fd,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data.error && data.error.message) || 'Groq HTTP ' + r.status);
  return String(data.text || '').trim();
}

// Last-resort analysis on Cloudflare Workers AI (same account, no extra key). Photos are not sent here.
async function cfAnalyze(env, facts) {
  const model = env.CF_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const r = await env.AI.run(model, {
    messages: [
      {
        role: 'system',
        content: SYSTEM + '\nФото тебе не показаны: опирайся только на текст и песню. Ответь только JSON-объектом.',
      },
      { role: 'user', content: facts },
    ],
    max_tokens: 900,
    temperature: 0.7,
  });
  const raw = typeof r?.response === 'string' ? r.response : JSON.stringify(r?.response ?? r ?? '');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('bad JSON from fallback model');
  return JSON.parse(m[0]);
}

function wav(pcm, rate = 24000) {
  const h = new ArrayBuffer(44),
    v = new DataView(h),
    w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(h), 0);
  out.set(pcm, 44);
  return out;
}

async function tts(input, env, cors, usage) {
  const text = String(input.text || '')
    .slice(0, 700)
    .trim();
  if (!text) return json({ error: 'empty' }, 400, cors);
  if ((await usage.get()).voices >= limits(env).voices) return json({ error: 'limit', kind: 'voices' }, 429, cors);
  const kind = KINDS.includes(input.kind) ? input.kind : 'calm';
  const style = String(input.style || '').slice(0, 200) || 'тепло и естественно, как будто вспоминаешь этот день';
  const { data } = await withFallback(
    env,
    env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
    env.GEMINI_TTS_FALLBACK || '',
    () => ({
      contents: [
        {
          parts: [
            {
              text: `Прочитай по-русски ${style}. Если в тексте есть опечатки, пропущенные буквы или неправильная раскладка, произноси слова так, как они должны быть написаны правильно. Не добавляй ничего от себя:\n\n${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[kind] } } },
      },
    }),
    40000,
  );
  const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part) throw new Error('no audio from model');
  const mime = part.inlineData.mimeType || '';
  const rate = +(mime.match(/rate=(\d+)/) || [0, 24000])[1];
  const bin = Uint8Array.from(atob(part.inlineData.data), c => c.charCodeAt(0));
  await usage.add('voices');
  return new Response(wav(bin, rate), {
    headers: { ...cors, 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
  });
}

// ---------- song cover from a music link ----------
// Only these services are asked, and only images from their own CDNs are downloaded (no open proxy).
const COVER_IMG_HOSTS = /(^|\.)(scdn\.co|spotifycdn\.com|sndcdn\.com|mzstatic\.com)$/i;
async function getJson(url) {
  const r = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; diary-cover/1.0)' },
    cf: { cacheTtl: 86400 },
  });
  if (!r.ok) throw Object.assign(new Error('music service answered ' + r.status), { status: 404 });
  return r.json();
}
async function coverInfo(link) {
  let u;
  try {
    u = new URL(link);
  } catch {
    throw Object.assign(new Error('bad link'), { status: 400 });
  }
  if (u.protocol !== 'https:') throw Object.assign(new Error('bad link'), { status: 400 });
  const host = u.hostname.toLowerCase();
  if (host === 'open.spotify.com' || host === 'spotify.link') {
    const j = await getJson('https://open.spotify.com/oembed?url=' + encodeURIComponent(u.href));
    // what the site's player needs to play it: spotify:<type>:<id>
    const m = String(j.iframe_url || '').match(/^https:\/\/open\.spotify\.com\/embed\/(track|album|playlist|episode)\/([A-Za-z0-9]{10,32})/);
    return { img: j.thumbnail_url, title: j.title || '', author: '', embed: m ? `spotify:${m[1]}:${m[2]}` : '' };
  }
  if (/(^|\.)soundcloud\.com$/.test(host) || host === 'on.soundcloud.com') {
    const j = await getJson('https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(u.href));
    const img = String(j.thumbnail_url || '').replace(/-(large|t\d+x\d+)\./, '-t500x500.');
    // the widget plays the track by its API address
    const src = (String(j.html || '').match(/src="([^"]+)"/) || [])[1] || '';
    let api = '';
    try {
      api = new URL(src.replace(/&amp;/g, '&')).searchParams.get('url') || '';
    } catch {}
    if (!/^https:\/\/api\.soundcloud\.com\/(tracks|playlists)\/\d+$/.test(api)) api = '';
    return { img, title: j.title || '', author: j.author_name || '', embed: api };
  }
  if (host === 'music.apple.com' || host === 'itunes.apple.com') {
    // track links carry ?i=<track id>, album links end with /id<number> or /<number>
    const id = u.searchParams.get('i') || (u.pathname.match(/(?:id)?(\d{5,})\/?$/) || [])[1];
    if (!id) throw Object.assign(new Error('no id in link'), { status: 400 });
    try {
      const j = await getJson('https://itunes.apple.com/lookup?id=' + encodeURIComponent(id));
      const it = (j.results || [])[0] || {};
      const img = String(it.artworkUrl100 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.');
      if (img) return { img, title: it.trackName || it.collectionName || '', author: it.artistName || '' };
    } catch {}
    // the lookup API may refuse servers: read the cover from the public page's og:image instead
    const r = await fetch('https://music.apple.com' + u.pathname + u.search, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; diary-cover/1.0)', Accept: 'text/html' },
      cf: { cacheTtl: 86400 },
    });
    if (!r.ok) throw Object.assign(new Error('music service answered ' + r.status), { status: 404 });
    const html = (await r.text()).slice(0, 400_000);
    const meta = p => (html.match(new RegExp(`<meta[^>]+property="${p}"[^>]+content="([^"]+)"`)) || [])[1] || '';
    const dec = s =>
      s
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    return { img: dec(meta('og:image')), title: dec(meta('og:title')).replace(/ on Apple Music$/, ''), author: '' };
  }
  throw Object.assign(new Error('unsupported service'), { status: 400 });
}
async function cover(link, cors) {
  const info = await coverInfo(link);
  let iu;
  try {
    iu = new URL(info.img);
  } catch {
    return json({ error: 'no cover' }, 404, cors);
  }
  if (iu.protocol !== 'https:' || !COVER_IMG_HOSTS.test(iu.hostname)) return json({ error: 'no cover' }, 404, cors);
  const r = await fetch(iu.href, { cf: { cacheTtl: 86400 } });
  const type = r.headers.get('Content-Type') || '';
  if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type)) return json({ error: 'no cover' }, 404, cors);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > 2_000_000) return json({ error: 'cover too large' }, 413, cors);
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return json(
    {
      cover: `data:${type.split(';')[0]};base64,${btoa(bin)}`,
      title: String(info.title).slice(0, 160),
      author: String(info.author).slice(0, 120),
      embed: String(info.embed || ''),
    },
    200,
    cors,
  );
}

// ---------- daily allowance per visitor ----------
const limits = env => ({ days: +env.LIMIT_DAYS || 10, voices: +env.LIMIT_VOICES || 10, dict: +env.LIMIT_DICT || 20 });
const today = () => new Date().toISOString().slice(0, 10); // free quotas reset at 00:00 UTC
const nextReset = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
};
async function usageOf(env, ip) {
  // the visitor is known only by a hash of the address; the address itself is never stored
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ottenok:' + (ip || 'x')));
  const name = [...new Uint8Array(h)]
    .slice(0, 12)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  const stub = env.USAGE ? env.USAGE.get(env.USAGE.idFromName(name)) : null;
  const send = async body => {
    if (!stub) return { date: today(), days: 0, voices: 0, dict: 0, src: '' };
    const r = await stub.fetch('https://usage/', { method: 'POST', body: JSON.stringify({ ...body, date: today() }) });
    return r.json();
  };
  return { get: () => send({ op: 'get' }), add: (kind, src) => send({ op: 'add', kind, src }) };
}
export class Usage {
  constructor(ctx) {
    this.ctx = ctx;
  }
  async fetch(req) {
    const { op, kind, src, date } = await req.json();
    let st = (await this.ctx.storage.get('st')) || {};
    if (st.date !== date) st = { date, days: 0, voices: 0, dict: 0, src: '' };
    if (op === 'add' && (kind === 'days' || kind === 'voices' || kind === 'dict')) {
      st[kind] = (st[kind] || 0) + 1;
      if (src) st.src = src;
      await this.ctx.storage.put('st', st);
    }
    return Response.json(st);
  }
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '*')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const ok = allowed.includes('*') || allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': ok ? origin || '*' : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!ok) return json({ error: 'origin not allowed' }, 403, cors);
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    if (req.method === 'GET' && path === '/health')
      return json(
        {
          ok: !!(env.GEMINI_API_KEY || env.GROQ_API_KEY),
          model: env.GEMINI_MODEL || 'gemini-flash-lite-latest',
          tts: env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts',
        },
        200,
        cors,
      );
    const ip = req.headers.get('CF-Connecting-IP') || 'x';
    if (req.method === 'GET' && path === '/cover') {
      if (limited(ip, 20)) return json({ error: 'too many requests' }, 429, cors);
      try {
        return await cover(new URL(req.url).searchParams.get('url') || '', cors);
      } catch (e) {
        return failure(e, cors);
      }
    }
    if (req.method === 'GET' && path === '/usage') {
      if (limited(ip, 60)) return json({ error: 'too many requests' }, 429, cors);
      const st = await (await usageOf(env, ip)).get(),
        L = limits(env);
      return json(
        {
          days: { used: Math.min(st.days, L.days), max: L.days },
          voices: { used: Math.min(st.voices, L.voices), max: L.voices },
          dict: { used: Math.min(st.dict || 0, L.dict), max: L.dict },
          src: st.src || '',
          primary: env.GROQ_API_KEY ? 'groq' : env.GEMINI_MODEL || 'gemini-flash-lite-latest',
          resetAt: nextReset(),
        },
        200,
        { ...cors, 'Cache-Control': 'no-store' },
      );
    }
    if (req.method !== 'POST') return json({ error: 'method' }, 405, cors);
    if (!env.GEMINI_API_KEY && !env.GROQ_API_KEY) return json({ error: 'no AI key is set' }, 500, cors);
    if (limited(req.headers.get('CF-Connecting-IP') || 'x', path === '/tts' ? 30 : 15))
      return json({ error: 'too many requests' }, 429, cors);
    const len = +(req.headers.get('Content-Length') || 0);
    if (len > 1_500_000) return json({ error: 'too large' }, 413, cors);
    if (path === '/transcribe') {
      const usage = await usageOf(env, ip);
      if (((await usage.get()).dict || 0) >= limits(env).dict) return json({ error: 'limit', kind: 'dict' }, 429, cors);
      if (!env.AI && !env.GROQ_API_KEY) return json({ error: 'speech to text is not set up' }, 500, cors);
      try {
        const buf = new Uint8Array(await req.arrayBuffer());
        if (buf.length < 800) return json({ error: 'empty' }, 400, cors);
        if (buf.length > 1_500_000) return json({ error: 'too large' }, 413, cors);
        if (env.GROQ_API_KEY) {
          try {
            const text = await groqTranscribe(env, buf, req.headers.get('Content-Type'));
            await usage.add('dict');
            return json({ text: text.slice(0, 4000) }, 200, cors);
          } catch (e) {
            console.warn('groq whisper failed:', String(e.message).slice(0, 200));
            if (!env.AI) throw e;
          }
        }
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const r = await env.AI.run(env.CF_WHISPER || '@cf/openai/whisper-large-v3-turbo', {
          audio: btoa(bin),
          language: 'ru',
        });
        const text = String((r && r.text) || '').trim();
        await usage.add('dict');
        return json({ text: text.slice(0, 4000) }, 200, cors);
      } catch (e) {
        console.warn('transcribe failed:', String((e && e.message) || e).slice(0, 200));
        return json({ error: 'transcribe failed' }, 502, cors);
      }
    }
    if (path !== '/analyze' && path !== '/tts') return json({ error: 'not found' }, 404, cors);
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'bad request' }, 400, cors);
    }
    if (!body || typeof body !== 'object') return json({ error: 'bad request' }, 400, cors);
    try {
      const usage = await usageOf(env, ip);
      if (path === '/analyze') {
        if ((await usage.get()).days >= limits(env).days) return json({ error: 'limit', kind: 'days' }, 429, cors);
        const { out, src } = await analyze(body, env);
        await usage.add('days', src);
        return json({ ...out, _src: src }, 200, cors);
      }
      if (path === '/tts') {
        if (!env.GEMINI_API_KEY) return json({ error: 'ai unavailable' }, 502, cors);
        return await tts(body, env, cors, usage);
      }
      return json({ error: 'not found' }, 404, cors);
    } catch (e) {
      return failure(e, cors);
    }
  },
};
