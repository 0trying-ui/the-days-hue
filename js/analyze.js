const POS = [
  'рад',
  'счаст',
  'любим',
  'красив',
  'тепл',
  'смех',
  'смея',
  'улыб',
  'круто',
  'здорово',
  'классн',
  'прекрасн',
  'весел',
  'празд',
  'ура',
  'вкусн',
  'уют',
  'нрав',
  'отлично',
  'подарок',
  'встреч',
  'друз',
  'море',
  'солнц',
  'танц',
  'концерт',
];
const NEG = [
  'груст',
  'плох',
  'устал',
  'тяжел',
  'тяжёл',
  'тревог',
  'страшн',
  'злой',
  'зло',
  'бесит',
  'ссор',
  'плак',
  'слёз',
  'слез',
  'одинок',
  'больн',
  'боль',
  'холодн',
  'пасмурн',
  'тоск',
  'скучн',
  'провал',
  'ошибк',
];
const TENSE = [
  'срочн',
  'дедлайн',
  'сдач',
  'спеш',
  'бежал',
  'бегом',
  'нервн',
  'стресс',
  'много дел',
  'не успе',
  'ночью',
  'аврал',
  'проект',
  'горит',
  'тревог',
  'шум',
  'пробк',
  'опазд',
];
const CALM = [
  'тих',
  'спокой',
  'медленн',
  'неспешн',
  'уют',
  'какао',
  'чай',
  'плед',
  'книг',
  'дожд',
  'пруд',
  'парк',
  'гуляли',
  'прогулк',
  'закат',
  'тепл',
  'дом',
];
const ENERGY = [
  'танц',
  'концерт',
  'бегал',
  'бежал',
  'драйв',
  'вечеринк',
  'праздн',
  'смех',
  'скорост',
  'гонк',
  'прыг',
  'ура',
  'быстр',
];

const count = (t, list) => list.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);

export function textMood(text) {
  const t = text.toLowerCase();
  const pos = count(t, POS),
    neg = count(t, NEG),
    tense = count(t, TENSE),
    calm = count(t, CALM),
    en = count(t, ENERGY);
  const exc = (t.match(/!/g) || []).length;
  const sents = Math.max(1, (t.match(/[.!?…]+/g) || []).length);
  const avgLen = t.split(/\s+/).length / sents;
  let valence = (pos - neg) / Math.max(2, pos + neg + 1);
  let energy =
    0.35 + 0.18 * tense + 0.15 * en + 0.05 * exc - 0.12 * calm + (avgLen < 6 ? 0.12 : avgLen > 14 ? -0.08 : 0);
  energy = clamp(energy, 0.05, 1);
  valence = clamp(valence, -1, 1);
  return { valence, energy, pos, neg, tense, calm, exc, avgLen };
}

export async function photoPalette(src) {
  const img = await loadImg(src),
    S = 48,
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data,
    bins = new Map();
  let lum = 0,
    sat = 0,
    n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      gg = d[i + 1],
      b = d[i + 2];
    const mx = Math.max(r, gg, b),
      mn = Math.min(r, gg, b),
      s = mx ? (mx - mn) / mx : 0;
    lum += (0.2126 * r + 0.7152 * gg + 0.0722 * b) / 255;
    sat += s;
    n++;
    const k = ((r >> 5) << 6) | ((gg >> 5) << 3) | (b >> 5),
      e = bins.get(k) || { w: 0, r: 0, g: 0, b: 0 };
    const w = 0.4 + s * 1.6;
    e.w += w;
    e.r += r * w;
    e.g += gg * w;
    e.b += b * w;
    bins.set(k, e);
  }
  const arr = [...bins.values()].sort((a, b) => b.w - a.w).map(e => [e.r / e.w, e.g / e.w, e.b / e.w]);
  const out = [];
  for (const c of arr) {
    if (out.every(o => dist(o, c) > 70)) out.push(c);
    if (out.length === 3) break;
  }
  while (out.length < 3 && out.length) out.push(out[out.length - 1]);
  return { colors: out.map(hex), brightness: lum / n, sat: sat / n };
}

export async function audioFeatures(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const sr = buf.sampleRate,
      ch = buf.getChannelData(0);
    const start = Math.max(0, Math.floor(buf.length / 2 - 15 * sr)),
      end = Math.min(buf.length, start + 30 * sr);
    const hop = 512,
      frames = Math.floor((end - start) / hop),
      env = new Float32Array(frames);
    let zc = 0,
      tot = 0;
    for (let f = 0; f < frames; f++) {
      let s = 0,
        o = start + f * hop;
      for (let i = 0; i < hop; i++) {
        const v = ch[o + i];
        s += v * v;
        if (i && v >= 0 !== ch[o + i - 1] >= 0) zc++;
      }
      env[f] = Math.sqrt(s / hop);
      tot += hop;
    }
    const meanRms = env.reduce((a, b) => a + b, 0) / frames;
    const on = new Float32Array(frames);
    for (let i = 1; i < frames; i++) on[i] = Math.max(0, env[i] - env[i - 1]);
    const fps = sr / hop;
    let best = 0,
      bestLag = 0;
    for (let bpm = 55; bpm <= 180; bpm++) {
      const lag = Math.round((fps * 60) / bpm);
      let s = 0;
      for (let i = lag; i < frames; i++) s += on[i] * on[i - lag];
      if (s > best) {
        best = s;
        bestLag = lag;
      }
    }
    let tempo = bestLag ? Math.round((fps * 60) / bestLag) : 90;
    while (tempo < 70) tempo *= 2;
    while (tempo > 160) tempo = Math.round(tempo / 2);
    return {
      energy: clamp(meanRms * 4.2 + (tempo - 80) / 200, 0.05, 1),
      tempo,
      bright: clamp((zc / tot) * 6, 0, 1),
      dur: Math.round(buf.duration),
    };
  } finally {
    ctx.close();
  }
}

const MOODS = {
  calm: { name: 'спокойное', colors: ['#ffc482', '#e18c69', '#f5e2c0'], hue: 30 },
  tense: { name: 'собранное', colors: ['#6ea0ff', '#e1ebff', '#3d56a8'], hue: 220 },
  bright: { name: 'яркое', colors: ['#ff78be', '#ffde78', '#7cf0ff'], hue: 330 },
  melancholy: { name: 'задумчивое', colors: ['#a98bff', '#5fc2c0', '#d9d3ff'], hue: 265 },
};
export const moodInfo = k => MOODS[k] || MOODS.calm;

export function combine(tm, photo, audio) {
  const energy = audio ? 0.5 * tm.energy + 0.5 * audio.energy : tm.energy;
  const valence = clamp(tm.valence + (photo ? (photo.brightness - 0.45) * 0.5 : 0), -1, 1);
  let kind;
  if (valence < -0.2 && energy < 0.55) kind = 'melancholy';
  else if (energy >= 0.6 && valence < 0.15) kind = 'tense';
  else if (energy >= 0.45 && valence >= 0.15) kind = 'bright';
  else if (energy >= 0.6) kind = 'tense';
  else kind = 'calm';
  const base = MOODS[kind];
  const colors = photo && photo.colors.length ? photo.colors : base.colors;
  const tempo = audio ? audio.tempo : Math.round(52 + energy * 70);
  const why = [];
  why.push(
    `Текст: энергия ${Math.round(tm.energy * 100)}%, тон ${tm.valence > 0.1 ? 'тёплый' : tm.valence < -0.1 ? 'грустный' : 'ровный'}.`,
  );
  if (audio)
    why.push(
      `Песня: энергия ${Math.round(audio.energy * 100)}%, темп около ${audio.tempo} уд/мин, ${audio.bright > 0.5 ? 'светлый' : 'тёмный'} тембр.`,
    );
  else why.push('Песня без файла: темп и характер оценены по тексту.');
  why.push(
    photo
      ? 'Палитра взята из фото дня, поэтому цвета пятна и поля те же, что на снимках.'
      : 'Фото нет: палитра выбрана по настроению дня.',
  );
  const motion = {
    calm: 'медленное дыхание пятна и плавное течение красок: день спокойный',
    tense: 'мелкая дрожь, плотные края и быстрое течение цвета: день напряжённый',
    bright: 'пружинящий пульс и живые переливы: день яркий',
    melancholy: 'тяжёлое медленное течение вниз, как дождь: день задумчивый',
  };
  why.push(`Движение: ${motion[kind]}.`);
  why.push(
    `Фоновая музыка собрана в ${kind === 'tense' || kind === 'melancholy' ? 'миноре' : 'мажоре'} в темпе ${tempo} уд/мин.`,
  );
  return { kind, energy, valence, colors, tempo, why };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
export function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}
/* Photo shrinking runs in a background thread (js/photo-worker.js): decoding a 12-megapixel photo
   on the main thread froze the page for ~100 ms per photo. Resampling uses high-quality smoothing.
   If workers are unavailable, the old main-thread path is used. */
const PHOTO_WORKER = '/js/photo-worker.js';
let worker = null,
  jobs = 0;
const waiting = new Map();
function photoWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(PHOTO_WORKER);
    worker.onmessage = ({ data }) => {
      const p = waiting.get(data.id);
      waiting.delete(data.id);
      if (p) data.error ? p.rej(new Error(data.error)) : p.res(data.out);
    };
    worker.onerror = () => {
      waiting.forEach(p => p.rej(new Error('photo worker failed')));
      waiting.clear();
      worker = false;
    };
  } catch {
    worker = false;
  }
  return worker;
}
async function shrinkOnMain(file, size, by, quality, as) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const side = by === 'short' ? Math.min(img.width, img.height) : Math.max(img.width, img.height);
    const k = Math.min(1, size / side),
      c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return as === 'blob'
      ? await new Promise(r => c.toBlob(r, 'image/jpeg', quality))
      : c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
// size: target length of the long (or short) side in px; as: 'dataurl' or 'blob'
export function shrinkPhoto(file, { size, by = 'long', quality = 0.82, as = 'dataurl' }) {
  const w = typeof OffscreenCanvas !== 'undefined' && photoWorker();
  if (!w) return shrinkOnMain(file, size, by, quality, as);
  const id = ++jobs;
  return new Promise((res, rej) => {
    waiting.set(id, { res, rej });
    w.postMessage({ id, file, size, by, quality, as });
  }).catch(() => shrinkOnMain(file, size, by, quality, as));
}
export const downscale = (file, max = 900) => shrinkPhoto(file, { size: max });
