import { moodInfo } from './analyze.js';

function rnd(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function artImage(colors, kind, seed = 1, w = 640, h = 440) {
  const r = rnd(seed * 977 + 13),
    c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const [a, b, d] = colors,
    pal = [a, b, d];
  const sky = g.createLinearGradient(0, 0, 0, h);
  if (kind === 'tense') {
    sky.addColorStop(0, shade(b, 0.16));
    sky.addColorStop(1, shade(a, 0.3));
  } else if (kind === 'melancholy') {
    sky.addColorStop(0, shade(a, 0.4));
    sky.addColorStop(1, shade(b, 0.55));
  } else {
    sky.addColorStop(0, shade(b, 0.62));
    sky.addColorStop(0.7, shade(a, 0.78));
    sky.addColorStop(1, shade(d, 0.7));
  }
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  if (kind === 'tense') {
    g.filter = 'blur(2.5px)';
    for (let x = 18; x < w; x += 46)
      for (let y = 16; y < h; y += 50) {
        if (r() < 0.45) continue;
        g.globalAlpha = 0.55 + r() * 0.4;
        g.fillStyle = r() < 0.7 ? shade(d, 0.88) : shade(a, 0.8);
        g.fillRect(x, y, 26, 30);
      }
    g.filter = 'blur(28px)';
    g.globalAlpha = 0.35;
    g.fillStyle = shade(a, 0.7);
    g.beginPath();
    g.arc(w * 0.7, h * 0.8, 120, 0, 7);
    g.fill();
  } else if (kind === 'melancholy') {
    g.filter = 'blur(26px)';
    g.globalAlpha = 0.5;
    g.fillStyle = shade(d, 0.7);
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(r() * w, h * (0.15 + r() * 0.3), 90 + r() * 70, 0, 7);
      g.fill();
    }
    g.filter = 'blur(1.5px)';
    g.globalAlpha = 0.28;
    g.strokeStyle = shade(d, 0.9);
    g.lineWidth = 1.2;
    for (let i = 0; i < 90; i++) {
      const x = r() * w,
        y = r() * h;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 5, y + 26 + r() * 20);
      g.stroke();
    }
  } else {
    g.filter = 'blur(30px)';
    g.globalAlpha = 0.85;
    g.fillStyle = shade(d, 0.9);
    g.beginPath();
    g.arc(w * (0.3 + r() * 0.4), h * (0.34 + r() * 0.1), 52 + r() * 24, 0, 7);
    g.fill();
    g.filter = 'blur(2px)';
    g.globalAlpha = 1;
    for (let L = 0; L < 3; L++) {
      g.fillStyle = shade(L === 0 ? b : L === 1 ? a : d, 0.2 + L * 0.12);
      g.beginPath();
      g.moveTo(0, h);
      const base = h * (0.58 + L * 0.13),
        ph = r() * 6,
        fr = 0.006 + r() * 0.006;
      for (let x = 0; x <= w; x += 8) g.lineTo(x, base + Math.sin(x * fr + ph) * 26 + Math.sin(x * fr * 2.7 + ph) * 8);
      g.lineTo(w, h);
      g.fill();
    }
  }
  g.filter = 'none';
  g.globalAlpha = 1;
  const grain = g.getImageData(0, 0, w, h),
    px = grain.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (r() - 0.5) * 26;
    px[i] += n;
    px[i + 1] += n;
    px[i + 2] += n;
  }
  g.putImageData(grain, 0, 0);
  return c.toDataURL('image/jpeg', 0.85);
}
function shade(hex, k) {
  const v = parseInt(hex.slice(1), 16),
    R = v >> 16,
    G = (v >> 8) & 255,
    B = v & 255;
  const mix = x => (k < 0.5 ? Math.round(x * (0.35 + k * 1.3)) : Math.round(x + (255 - x) * (k - 0.5) * 1.2));
  const cl = z => Math.max(0, Math.min(255, z));
  return '#' + [R, G, B].map(x => cl(mix(x)).toString(16).padStart(2, '0')).join('');
}

const DAYS = [
  {
    off: 0,
    years: 1,
    kind: 'bright',
    title: 'Первый снег во дворе',
    text: 'Утром выпал первый снег! Весь двор белый, мы с друзьями лепили снеговика и смеялись. Потом пили горячий чай, щёки горели.',
    tags: ['друзья', 'зима'],
  },
  {
    off: 14,
    kind: 'calm',
    title: 'Осенний парк и какао',
    text: 'Гуляли по парку, всё в жёлтых листьях, было холодно, но мы пили какао и долго разговаривали. Тихий тёплый день, ни куда не спешили.',
    tags: ['друзья', 'осень'],
  },
  {
    off: 11,
    kind: 'tense',
    title: 'Ночь в офисе перед сдачей',
    text: 'Срочная сдача проекта. Ночью в офисе, в наушниках электронная музыка. Много дел, не успеваем, дедлайн горит, но команда собранная.',
    tags: ['работа'],
  },
  {
    off: 8,
    kind: 'bright',
    title: 'Концерт до утра',
    text: 'Классный концерт! Танцевали, смеялись, друзья рядом, музыка гремела. Вернулись под утро счастливые и уставшие.',
    tags: ['друзья', 'музыка'],
  },
  {
    off: 5,
    kind: 'melancholy',
    title: 'Дождь и тихая грусть',
    text: 'Весь день дождь, пасмурно и немного грустно. Сидела дома с чаем, смотрела в окно. Не было сил ни на что, но в этом тоже есть уют.',
    tags: ['дом'],
  },
  {
    off: 2,
    kind: 'bright',
    title: 'Вечер у моря',
    text: 'Поездка к морю. Тёплый закат, песок, ветер, мы смеялись и ели вкусные фрукты. Солнце садилось медленно, красиво.',
    tags: ['море', 'поездка'],
  },
  {
    off: 0,
    kind: 'calm',
    title: 'Тихое воскресенье дома',
    text: 'Спокойный день дома. Читал книгу, пил кофе, слушал музыку. Никакой спешки, неспешные дела и уютный плед.',
    tags: ['дом'],
  },
];
const TEMPO = { calm: 64, tense: 118, bright: 100, melancholy: 54 };
const EN = { calm: 0.28, tense: 0.78, bright: 0.66, melancholy: 0.22 };

export function buildDemo() {
  const now = new Date();
  return DAYS.map((d, i) => {
    const m = moodInfo(d.kind),
      dt = new Date(now);
    dt.setDate(dt.getDate() - d.off);
    if (d.years) dt.setFullYear(dt.getFullYear() - d.years);
    dt.setHours(12, 0, 0, 0);
    const colors = m.colors;
    return {
      id: 'demo-' + i,
      demo: true,
      date: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`,
      text: d.text,
      title: d.title,
      userTitle: '',
      pinned: false,
      tags: d.tags,
      // real-life photos from Wikimedia Commons under free licences (authors and licences: /credits.html)
      photos: [`/assets/demo/day${i}-0.jpg`, `/assets/demo/day${i}-1.jpg`],
      audio: null,
      mood: {
        kind: d.kind,
        energy: EN[d.kind],
        valence: d.kind === 'melancholy' ? -0.5 : d.kind === 'tense' ? -0.1 : 0.5,
        colors,
        tempo: TEMPO[d.kind],
        why: [
          'Демо-день: текст, палитра и звук выбраны вручную, чтобы показать правила системы.',
          `Настроение «${m.name}»: ${d.kind === 'calm' ? 'медленный дрейф и мягкие круги' : d.kind === 'tense' ? 'резкие штрихи, острая геометрия, быстрый ритм' : d.kind === 'bright' ? 'пульс частиц и искры в такт' : 'медленное падение частиц, как дождь'}.`,
          `Фоновая музыка собрана в темпе ${TEMPO[d.kind]} уд/мин.`,
        ],
      },
    };
  });
}
