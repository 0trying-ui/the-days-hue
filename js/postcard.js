// the interface font: the system font, the same as on the page
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif';
import { moodToneHex } from './scene.js';
// Renders a shareable postcard (PNG) of a day: painterly background, title, and every piece of the day —
// all photos as polaroids, all notes as handwritten sheets, the song as its cover with the name below.
// Pieces are laid out in justified rows (like the wall in the day); the card grows taller when there are many.
const MNG = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
const W = 1080, // card width
  MIN_H = 1350, // 4:5, the usual feed size
  MAX_H = 1920, // 9:16, a phone story: never taller
  SIDE = 70, // margin left and right
  GAP = 34, // between pieces
  ROW_H = 360, // preferred row height
  ROW_MIN = 190; // smallest row height when there is a lot to fit

const loadImg = src =>
  new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
function rnd(seed) {
  let s = seed % 2147483647 || 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function wrap(g, text, maxW) {
  const words = String(text).split(/\s+/),
    lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
const sentences = t => (String(t).match(/[^.!?…]+[.!?…]*/g) || [t]).map(s => s.trim()).filter(Boolean);

// rows of equal height; every full row is stretched to the full width, the last one keeps its size
function justify(ar, rowH, width) {
  const rows = [];
  let cur = [],
    sum = 0;
  ar.forEach((a, i) => {
    const w = a * rowH;
    if (cur.length && sum + w + GAP * cur.length > width) {
      rows.push({ items: cur, full: true });
      cur = [];
      sum = 0;
    }
    cur.push(i);
    sum += w;
  });
  if (cur.length) rows.push({ items: cur, full: false });
  return rows.map(r => {
    const natural = r.items.reduce((s, i) => s + ar[i] * rowH, 0),
      free = width - GAP * (r.items.length - 1);
    const k = r.full ? free / natural : Math.min(1, free / natural);
    return { items: r.items, h: rowH * k };
  });
}

export async function makePostcard(d, { title, moodName, paper, songName = '' }) {
  try {
    await Promise.all(
      [
        '500 96px "Cormorant Garamond"',
        'italic 400 36px "Cormorant Garamond"',
        '600 40px Caveat',
        '600 22px ' + SANS,
      ].map(f => document.fonts.load(f)),
    );
  } catch {}
  const r = rnd([...d.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) * 97);
  const [y, m, dd] = d.date.split('-');
  const short = `${+dd} ${MNG[+m - 1].slice(0, 3)}`;

  // ---------- pieces of the day ----------
  const pieces = [];
  for (const src of d.photos || []) {
    try {
      const img = await loadImg(src);
      // polaroid: picture plus a white border with a wider bottom for the caption
      const pa = Math.max(0.75, Math.min(1.4, img.width / img.height));
      pieces.push({ kind: 'photo', img, ar: (pa + 0.12) / 1.32, pa });
    } catch {}
  }
  const notes =
    d.fragments && d.fragments.length
      ? d.fragments
      : d.notes && d.notes.length
        ? d.notes.flatMap(n => (n.length <= 240 ? [n] : sentences(n)))
        : sentences(d.text || '');
  for (const t of notes)
    pieces.push({ kind: 'note', text: t, ar: t.length > 160 ? 1.55 : t.length > 70 ? 1.35 : 1.15 });
  if (d.audio) {
    let img = null;
    const cv = d.cover || (d.photos && d.photos[d.coverPhoto || 0]);
    if (cv) img = await loadImg(cv).catch(() => null);
    // the cover is a square; the name sits under it, without any frame
    pieces.push({ kind: 'song', img, name: songName || 'Песня дня', ar: 0.8 });
  }
  // shuffle a little so photos and notes interleave, keep the song last
  const song = pieces.filter(p => p.kind === 'song'),
    rest = pieces.filter(p => p.kind !== 'song');
  const ph = rest.filter(p => p.kind === 'photo'),
    nt = rest.filter(p => p.kind === 'note'),
    order = [];
  while (ph.length || nt.length) {
    if (ph.length) order.push(ph.shift());
    if (nt.length) order.push(nt.shift());
  }
  order.push(...song);

  // ---------- size of the card ----------
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = '500 96px "Cormorant Garamond", Georgia, serif';
  const titleLines = wrap(probe, title, W - 160).slice(0, 2);
  // date, title lines, mood chip (its top is at 175 + lines * 100, 44 px tall) and some air
  const headH = 175 + titleLines.length * 100 + 44 + 56,
    footH = 190;
  const width = W - SIDE * 2,
    ar = order.map(p => p.ar);
  let rowH = ROW_H,
    rows = justify(ar, rowH, width),
    bodyH = rows.reduce((s, rw) => s + rw.h, 0) + GAP * Math.max(0, rows.length - 1);
  while (headH + bodyH + footH > MAX_H && rowH > ROW_MIN) {
    rowH -= 10;
    rows = justify(ar, rowH, width);
    bodyH = rows.reduce((s, rw) => s + rw.h, 0) + GAP * Math.max(0, rows.length - 1);
  }
  const H = Math.round(Math.min(MAX_H, Math.max(MIN_H, headH + bodyH + footH)));

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');

  // ---------- painterly background ----------
  const cols = d.mood.colors.map(c => moodToneHex(c, d.mood.kind));
  g.fillStyle = paper ? '#efe7d7' : '#0b0d16';
  g.fillRect(0, 0, W, H);
  g.filter = 'blur(110px)';
  for (let i = 0; i < 10; i++) {
    g.globalAlpha = paper ? 0.55 : 0.8;
    g.fillStyle = cols[i % cols.length];
    g.beginPath();
    g.arc(r() * W, r() * H, 220 + r() * 260, 0, 7);
    g.fill();
  }
  g.filter = 'none';
  g.globalAlpha = 1;
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, paper ? 'rgba(90,60,30,.25)' : 'rgba(0,0,0,.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  const n = g.getImageData(0, 0, W, H),
    px = n.data;
  for (let i = 0; i < px.length; i += 4) {
    const v = (Math.random() - 0.5) * 18;
    px[i] += v;
    px[i + 1] += v;
    px[i + 2] += v;
  }
  g.putImageData(n, 0, 0);
  const ink = paper ? '#2b2119' : '#f6f2ea';

  // ---------- header ----------
  g.textAlign = 'center';
  g.fillStyle = ink;
  g.font = 'italic 400 36px "Cormorant Garamond", Georgia, serif';
  g.globalAlpha = 0.8;
  g.fillText(`${+dd} ${MNG[+m - 1]} ${y}`, W / 2, 110);
  g.globalAlpha = 1;
  g.font = '500 96px "Cormorant Garamond", Georgia, serif';
  g.shadowColor = 'rgba(0,0,0,.35)';
  g.shadowBlur = paper ? 0 : 30;
  titleLines.forEach((l, i) => g.fillText(l, W / 2, 215 + i * 100));
  g.shadowBlur = 0;
  const chipY = 215 + titleLines.length * 100 - 40;
  g.font = '600 22px ' + SANS;
  const cw = g.measureText(moodName.toUpperCase()).width + 44;
  g.fillStyle = paper ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.14)';
  g.beginPath();
  g.roundRect(W / 2 - cw / 2, chipY, cw, 44, 22);
  g.fill();
  g.fillStyle = ink;
  g.fillText(moodName.toUpperCase(), W / 2, chipY + 30);

  // ---------- pieces ----------
  let top = headH + Math.max(0, (H - headH - footH - bodyH) / 2);
  for (const row of rows) {
    const ws = row.items.map(i => ar[i] * row.h),
      rw = ws.reduce((s, w) => s + w, 0) + GAP * (row.items.length - 1);
    let x = (W - rw) / 2;
    row.items.forEach((idx, j) => {
      const p = order[idx],
        w = ws[j],
        h = row.h,
        rot = ((r() - 0.5) * 5 * Math.PI) / 180;
      g.save();
      g.translate(x + w / 2, top + h / 2);
      if (p.kind !== 'song') g.rotate(rot);
      if (p.kind === 'photo') drawPhoto(g, p, w, h, short);
      else if (p.kind === 'note') drawNote(g, p, w, h, short);
      else drawSong(g, p, w, h, ink, cols);
      g.restore();
      x += w + GAP;
    });
    top += row.h + GAP;
  }

  // ---------- footer ----------
  g.textAlign = 'center';
  g.fillStyle = ink;
  g.globalAlpha = 0.7;
  g.font = 'italic 400 30px "Cormorant Garamond", Georgia, serif';
  g.fillText('Оттенок дня', W / 2, H - 60);
  g.globalAlpha = 1;
  cols.forEach((cc, i) => {
    g.fillStyle = cc;
    g.beginPath();
    g.arc(W / 2 - (cols.length - 1) * 16 + i * 32, H - 110, 9, 0, 7);
    g.fill();
  });
  return new Promise(res => c.toBlob(res, 'image/png'));
}

function shadow(g, on) {
  g.shadowColor = on ? 'rgba(0,0,0,.42)' : 'transparent';
  g.shadowBlur = on ? 36 : 0;
  g.shadowOffsetY = on ? 16 : 0;
}
function drawPhoto(g, p, w, h, short) {
  const bd = w * 0.06,
    cap = h * 0.17;
  shadow(g, true);
  g.fillStyle = '#f8f5ef';
  g.fillRect(-w / 2, -h / 2, w, h);
  shadow(g, false);
  const iw = w - bd * 2,
    ih = h - bd - cap;
  // cover-crop the picture into its window
  const ia = p.img.width / p.img.height,
    wa = iw / ih;
  let sw = p.img.width,
    sh = p.img.height,
    sx = 0,
    sy = 0;
  if (ia > wa) {
    sw = sh * wa;
    sx = (p.img.width - sw) / 2;
  } else {
    sh = sw / wa;
    sy = (p.img.height - sh) / 2;
  }
  g.drawImage(p.img, sx, sy, sw, sh, -w / 2 + bd, -h / 2 + bd, iw, ih);
  g.fillStyle = '#3a2f26';
  g.font = `600 ${Math.round(cap * 0.55)}px Caveat, cursive`;
  g.textAlign = 'left';
  g.fillText(short, -w / 2 + bd, h / 2 - cap * 0.32);
}
function drawNote(g, p, w, h, short) {
  shadow(g, true);
  g.fillStyle = '#f7f1e3';
  g.fillRect(-w / 2, -h / 2, w, h);
  shadow(g, false);
  // tape
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.save();
  g.rotate((-4 * Math.PI) / 180);
  g.fillRect(-w * 0.16, -h / 2 - 14, w * 0.32, 28);
  g.restore();
  // fit the handwriting: the biggest size at which the whole note fits
  const padL = w * 0.13,
    padR = w * 0.06,
    padT = h * 0.14,
    sigH = h * 0.14;
  let fs = Math.min(46, h * 0.2),
    lines,
    lh;
  for (; fs >= 14; fs -= 2) {
    g.font = `600 ${fs}px Caveat, cursive`;
    lh = fs * 1.18;
    lines = wrap(g, p.text, w - padL - padR);
    if (lines.length * lh <= h - padT - sigH) break;
  }
  const maxLines = Math.max(1, Math.floor((h - padT - sigH) / lh));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  g.strokeStyle = 'rgba(90,120,170,.2)';
  g.lineWidth = 2;
  for (let i = 0; i < Math.max(lines.length, 2); i++) {
    const ly = -h / 2 + padT + (i + 1) * lh + 4;
    if (ly > h / 2 - sigH) break;
    g.beginPath();
    g.moveTo(-w / 2 + 14, ly);
    g.lineTo(w / 2 - 14, ly);
    g.stroke();
  }
  g.strokeStyle = 'rgba(210,90,90,.35)';
  g.beginPath();
  g.moveTo(-w / 2 + padL - 12, -h / 2);
  g.lineTo(-w / 2 + padL - 12, h / 2);
  g.stroke();
  g.fillStyle = '#2c2622';
  g.textAlign = 'left';
  lines.forEach((l, i) => g.fillText(l, -w / 2 + padL, -h / 2 + padT + (i + 1) * lh - lh * 0.22));
  g.textAlign = 'right';
  g.fillStyle = 'rgba(44,38,34,.6)';
  g.font = `600 ${Math.round(Math.min(30, sigH * 0.5))}px Caveat, cursive`;
  g.fillText('— ' + short, w / 2 - padR, h / 2 - sigH * 0.32);
}
function drawSong(g, p, w, h, ink, cols) {
  // just the cover and the name under it — no player banner
  const s = Math.min(w, h * 0.8),
    x = -s / 2,
    y = -h / 2;
  shadow(g, true);
  if (p.img) {
    const ia = p.img.width / p.img.height;
    let sw = p.img.width,
      sh = p.img.height,
      sx = 0,
      sy = 0;
    if (ia > 1) {
      sw = sh;
      sx = (p.img.width - sw) / 2;
    } else {
      sh = sw;
      sy = (p.img.height - sh) / 2;
    }
    g.drawImage(p.img, sx, sy, sw, sh, x, y, s, s);
  } else {
    const gr = g.createLinearGradient(x, y, x + s, y + s);
    cols.forEach((cc, i) => gr.addColorStop(i / Math.max(1, cols.length - 1), cc));
    g.fillStyle = gr;
    g.fillRect(x, y, s, s);
  }
  shadow(g, false);
  g.fillStyle = ink;
  g.textAlign = 'center';
  const fs = Math.max(18, Math.round(h * 0.075));
  g.font = `600 ${fs}px ${SANS}`;
  let name = p.name;
  while (name.length > 3 && g.measureText(name).width > w * 1.15) name = name.slice(0, -2);
  if (name !== p.name) name = name.trimEnd() + '…';
  g.shadowColor = 'rgba(0,0,0,.45)';
  g.shadowBlur = 10;
  g.fillText(name, 0, y + s + fs * 1.35);
  g.shadowBlur = 0;
  g.globalAlpha = 0.7;
  g.font = `400 ${Math.round(fs * 0.78)}px ${SANS}`;
  g.fillText('песня дня', 0, y + s + fs * 2.45);
  g.globalAlpha = 1;
}
