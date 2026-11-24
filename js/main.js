import { Engine, moodToneHex } from './scene.js';
import { Sky } from './sky.js';
import { Ambient, MUSIC_FADE_SEC } from './sound.js';
import { liquid } from './glass.js';
import { startTrail } from './trail.js';
import { playRitual, ritualTarget, RITUAL_FALL_SEC } from './ritual.js';
import { allDays, putDay, delDay, clearDays, loadSettings, saveSettings, getRec } from './store.js';
import { textMood, photoPalette, audioFeatures, combine, downscale, moodInfo, shrinkPhoto } from './analyze.js';
import { makeTitle } from './titles.js';
import { buildDemo } from './demo.js';
import { Weather, detectWeather, WEATHER_NAMES } from './fx.js';
import { speak, stop as stopVoice, canSpeak, ruVoice } from './voice.js';
import { makePostcard } from './postcard.js';
import { EmbedSong, embedOf, SERVICE_NAME, bestStart } from './embed.js';
import {
  aiUrl,
  aiHealth,
  aiAnalyze,
  aiSpeak,
  aiUsage,
  takeLimitHit,
  aiCover,
  MUSIC_LINK,
  aiTranscribe,
} from './ai.js';
// a day's colours as they are shown: its own colours pulled towards its mood's tone (cached per day)
const toneCache = new WeakMap();
function toned(d) {
  const key = d.mood.kind + d.mood.colors.join();
  const c = toneCache.get(d);
  if (c && c.key === key) return c.list;
  const list = d.mood.colors.map(x => moodToneHex(x, d.mood.kind));
  toneCache.set(d, { key, list });
  return list;
}

const $ = id => document.getElementById(id);
// timings (ms) — kept in one place so the feel of the app can be tuned without hunting numbers
const DELETE_AFTER_LEAVE_MS = 1600; // let the camera leave the day before its sphere disappears
const OPEN_NEW_DAY_DELAY_MS = 1100; // let the archive scroll to the new sphere before diving in
const MEMO_SHOW_DELAY_MS = 2200; // "a year ago" card appears after the intro settles
const MEMO_VISIBLE_MS = 14000;
const SHEET_CLOSE_MS = 520; // matches the bottom sheet slide-down transition
const SHEET_SWIPE_CLOSE_PX = 110; // swipe distance that closes the bottom sheet
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const fmtDate = iso => {
  const [y, m, d] = iso.split('-');
  return `${+d} ${MONTHS[+m - 1]} ${y}`;
};
const shortDate = iso => `${+iso.slice(8)} ${MONTHS[+iso.slice(5, 7) - 1]}`;
const titleOf = d => d.userTitle || d.title;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ICON = {
  theme: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.2"/></svg>',
  set: '<svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  music:
    '<svg viewBox="0 0 24 24"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
  speak:
    '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4"/></svg>',
  card: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 15l5-4.5 4 3.5 3-2.5 5 4"/><circle cx="15.5" cy="9" r="1.4"/></svg>',
  spark:
    '<svg viewBox="0 0 24 24"><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>',
  check: '<svg class="ck" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play: '<svg class="pl" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>',
  pause: '<svg class="pa" viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>',
};

let settings = loadSettings();
// «Бумага» is gone: the scene is always the night sky, and the theme only changes the interface.
// Someone who used «Бумага» gets the light interface.
if (settings.theme === 'paper') settings.ui = 'light';
settings.theme = 'night';
if (settings.ui !== 'light') settings.ui = 'dark';
let days = [],
  openDay = null,
  songEl = null,
  filterTag = null,
  entered = false,
  itemZ = [],
  player = null,
  paused = false;
startTrail({ reduce: () => settings.reduce, paper: () => settings.theme === 'paper' });
const snd = new Ambient();
snd.vol = settings.volume;
snd.enabled = settings.sound;
const sky = new Sky($('sky'));
const weather = new Weather($('fx'));
const linksCv = $('links'),
  lg = linksCv.getContext('2d');
let linkT = 0;
function sizeLinks() {
  const d = Math.min(2, devicePixelRatio || 1);
  linksCv.width = innerWidth * d;
  linksCv.height = innerHeight * d;
  lg.setTransform(d, 0, 0, d, 0, 0);
}
sizeLinks();
addEventListener('resize', sizeLinks);
const hexA = (h, a) => {
  const v = parseInt(h.slice(1), 16);
  return `rgba(${v >> 16},${(v >> 8) & 255},${v & 255},${a})`;
};
/* Beat follower for the day's sphere: the bass is compared with its own recent average, so a quiet song
   and a loud one both "breathe"; the pulse rises fast on a hit and fades slowly. 0 when paused or silent. */
const BEAT_GAIN = 1.6; // how strongly a hit above the average shows
let beatAvg = 0,
  beatOut = 0;
function beatLevel(dt) {
  if (!openDay || paused || !settings.sound) return (beatOut *= 0.9);
  const b = snd.bands(12),
    bass = (b[0] + b[1] + b[2]) / 3;
  beatAvg += (bass - beatAvg) * Math.min(1, dt * 1.5);
  const hit = Math.max(0, Math.min(1, ((bass - beatAvg * 1.04) / (beatAvg * 0.5 + 0.04)) * BEAT_GAIN));
  beatOut += (hit - beatOut) * Math.min(1, dt * (hit > beatOut ? 18 : 3.5));
  return beatOut;
}

/* drops of paint scattering from a deleted day (drawn on the links canvas, above the spheres) */
let drops = [];
function burstDrops({ x, y, r, colors, reduce }) {
  if (reduce || perf().noRitual) return;
  const n = 70;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2,
      sp = 60 + Math.random() * 220,
      st = r * (0.35 + Math.random() * 0.6);
    drops.push({
      x: x + Math.cos(a) * st,
      y: y + Math.sin(a) * st,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      s: 2 + Math.random() * 5,
      life: 0.9 + Math.random() * 0.8,
      t: -Math.random() * 0.35,
      c: colors[i % colors.length] || '#ffffff',
    });
  }
}
function drawDrops(dt) {
  if (!drops.length) return;
  for (const d of drops) {
    d.t += dt;
    if (d.t < 0) continue;
    d.vy += 160 * dt;
    d.vx *= 1 - 0.9 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    const k = 1 - d.t / d.life;
    if (k <= 0) continue;
    lg.globalAlpha = Math.min(1, k * 1.4);
    lg.fillStyle = d.c;
    lg.beginPath();
    lg.arc(d.x, d.y, d.s * (0.5 + 0.5 * k), 0, Math.PI * 2);
    lg.fill();
  }
  lg.globalAlpha = 1;
  drops = drops.filter(d => d.t < d.life);
  linksBlank = false;
}
let linksBlank = false;
let linksK = 1,
  linksT = 1; // threads between days fade in after the days of a month have settled
function drawLinks(f) {
  linksK += (linksT - linksK) * Math.min(1, f.dt * 2.5);
  const fade = (1 - Math.min(1, f.z / 0.45)) * linksK;
  // inside a day there are no links: clear once and stop repainting the canvas
  if (fade <= 0 || !engine.base || !engine.order || level === 'months') {
    if (!linksBlank) lg.clearRect(0, 0, innerWidth, innerHeight);
    linksBlank = true;
    return;
  }
  linksBlank = false;
  lg.clearRect(0, 0, innerWidth, innerHeight);
  linkT += f.dt * (settings.reduce ? 0.2 : 1);
  const vis = engine.order.filter(i => engine.base[i]),
    P = {};
  (engine.masks || []).forEach(m => {
    P[m.i] = [m.x, m.y, m.r];
  });
  vis.forEach(i => {
    if (!P[i]) {
      const b = engine.base[i];
      P[i] = engine._proj(b.x, b.y, b.r * 0.65, b.zd);
    }
  });
  for (let a = 0; a < vis.length; a++)
    for (let b = a + 1; b < vis.length; b++) {
      const i = Math.min(vis[a], vis[b]),
        j = Math.max(vis[a], vis[b]);
      if (j - i > 5) continue;
      const di = engine.days[i],
        dj = engine.days[j];
      if (di.nebula || dj.nebula) continue;
      const shared = (di.tags || []).some(t => (dj.tags || []).includes(t));
      const same = di.mood.kind === dj.mood.kind;
      if (!shared && !same) continue;
      if (filterTag && !(shared && (di.tags || []).includes(filterTag))) continue;
      const [x1, y1, r1] = P[i],
        [x2, y2, r2] = P[j];
      if ((x1 < -100 && x2 < -100) || (x1 > innerWidth + 100 && x2 > innerWidth + 100)) continue;
      const dx = x2 - x1,
        dy = y2 - y1,
        L = Math.hypot(dx, dy) || 1,
        ux = dx / L,
        uy = dy / L;
      // run centre to centre: the part inside each sphere is cut away by maskBlobs, so the thread always meets the edge
      const sx = x1,
        sy = y1,
        ex = x2,
        ey = y2;
      if (L < (r1 + r2) * 1.05 + 24) continue;
      const mx = (sx + ex) / 2,
        my = (sy + ey) / 2 - (40 + L * 0.16) * (shared ? 1 : 0.6);
      const hot = engine.hov === i || engine.hov === j;
      const al = (shared ? 0.42 : 0.2) * fade * (hot ? 1.8 : 1) * (engine.hov >= 0 && !hot ? 0.45 : 1);
      const gr = lg.createLinearGradient(sx, sy, ex, ey);
      gr.addColorStop(0, hexA(toned(di)[0], al));
      gr.addColorStop(1, hexA(toned(dj)[0], al));
      lg.strokeStyle = gr;
      lg.lineCap = 'round';
      lg.lineWidth = shared ? 1.6 : 1;
      lg.setLineDash(shared ? [] : [2, 7]);
      lg.lineDashOffset = -linkT * 14;
      lg.beginPath();
      lg.moveTo(sx, sy);
      lg.quadraticCurveTo(mx, my, ex, ey);
      lg.stroke();
      if (shared) {
        const k = (linkT * 0.25 + ((i * 0.37) % 1)) % 1,
          q = 1 - k;
        const px = q * q * sx + 2 * q * k * mx + k * k * ex,
          py = q * q * sy + 2 * q * k * my + k * k * ey;
        const pg = lg.createRadialGradient(px, py, 0, px, py, 7);
        pg.addColorStop(0, hexA(k < 0.5 ? toned(di)[0] : toned(dj)[0], Math.min(1, al * 2.2)));
        pg.addColorStop(1, 'rgba(0,0,0,0)');
        lg.fillStyle = pg;
        lg.beginPath();
        lg.arc(px, py, 7, 0, 7);
        lg.fill();
      }
    }
  lg.setLineDash([]);
  maskBlobs(lg);
}
// cut out everything drawn on 2D layers where the spheres stand, so links and stars sit behind them
function maskBlobs(g) {
  if (!engine.masks || engine.z > 0.98) return;
  g.save();
  g.globalCompositeOperation = 'destination-out';
  for (const m of engine.masks) {
    if (m.a < 0.05 || m.x < -m.r * 1.4 || m.x > innerWidth + m.r * 1.4) continue;
    const R = m.r * 1.32,
      gr = g.createRadialGradient(m.x, m.y, m.r * 0.92, m.x, m.y, R);
    gr.addColorStop(0, `rgba(0,0,0,${m.a})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(m.x, m.y, R, 0, 7);
    g.fill();
    g.fillStyle = `rgba(0,0,0,${m.a})`;
    g.beginPath();
    g.arc(m.x, m.y, m.r * 0.93, 0, 7);
    g.fill();
  }
  g.restore();
}
let skyDive = 0,
  ribW = 0,
  rd = false;
const thumbX = { v: 0, vel: 0 },
  gapS = { v: 0, vel: 0 };
function damp(s, target, time, dt) {
  const om = 2 / Math.max(0.0001, time),
    x = om * dt,
    e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = s.v - target,
    tmp = (s.vel + om * ch) * dt;
  s.vel = (s.vel - om * tmp) * e;
  return target + (ch + tmp) * e;
}
const gradOf = cols => `linear-gradient(90deg,${cols.join(',')})`;

const engine = new Engine($('gl'), {
  settings: () => settings,
  onOpen: d => (openDay ? null : d.nebula ? enterMonth(d.month) : openDayView(d)),
  onState: st => {
    if (st === 'archive') {
      setDock('archive');
      hint(level === 'months' ? HINT.archive : HINT.month);
    }
    if (st === 'day') hint(HINT.day);
  },
  onDissolve: burstDrops,
  onPinch: (v, fingers) => onPinch(v, fingers),
  onPinchEnd: () => pinchEnd(),
  beat: beatLevel,
  onFrame: f => {
    guideClear();
    skyDive += (f.z - skyDive) * Math.min(1, f.dt * 2.5);
    if (!perf().noSky)
      sky.frame(f.dt, {
        scroll: f.scroll,
        lx: f.lx,
        ly: f.ly,
        dive: skyDive,
        depth: f.depth * f.z,
        tint: f.tint,
        paper: settings.theme === 'paper' ? 1 : 0,
        reduce: settings.reduce,
        mask: maskBlobs,
      });
    const fr = f.state === 'archive' || f.state === 'leaving' ? f.f : f.depth,
      th = $('thumb'),
      tw = th.offsetWidth; // read layout before any style write this frame (no forced re-layout)
    const root = document.documentElement;
    setStyle(root, '--tint', `rgb(${f.tint.map(v => Math.round(v * 255)).join(',')})`);
    const tgt = Math.max(0, Math.min(1, fr)) * Math.max(0, ribW - tw);
    thumbX.v = damp(thumbX, tgt, rd ? 0.06 : f.state === 'diving' || f.state === 'leaving' ? 0.5 : 0.18, f.dt);
    setStyle(th, 'left', thumbX.v.toFixed(1) + 'px');
    gapS.v = damp(gapS, rd ? tw * 0.27 : 0, 0.22, f.dt);
    const rb = $('rib');
    setStyle(rb, '--fx', (thumbX.v + tw / 2).toFixed(1) + 'px');
    setStyle(rb, '--tl', (thumbX.v - gapS.v).toFixed(1) + 'px');
    setStyle(rb, '--tr', (thumbX.v + tw + gapS.v).toFixed(1) + 'px');
    moveKnots(thumbX.v + tw / 2, tw, f.dt);
    // while the pill is dragged in the archive, a bubble above it names the month or the day under it
    const tipOn = rd && f.state === 'archive' && engine.days.length;
    if (tipOn) {
      const d = engine.days[engine._idxAt(f.scroll)];
      const txt = d.nebula
        ? `${monthName(d.month)} · ${d.title}`
        : `${+d.date.slice(8)} ${MONTHS_GEN[+d.date.slice(5, 7) - 1]} ${d.date.slice(0, 4)} · ${titleOf(d)}`;
      setStyle($('ribTip'), 'left', (thumbX.v + tw / 2).toFixed(1) + 'px');
      if ($('ribTip').textContent !== txt) $('ribTip').textContent = txt;
    }
    $('ribTip').classList.toggle('show', !!tipOn);
    setStyle(root, '--gx', (-f.lx * 30).toFixed(1) + '%');
    if (player && openDay) tickPlayer();
    if (!perf().noSky) drawLinks(f);
    drawDrops(f.dt);
    if (!perf().noWeather)
      weather.frame(f.dt, {
        lx: f.lx,
        ly: f.ly,
        reduce: settings.reduce,
        intensity: settings.intensity,
        paper: settings.theme === 'paper',
        show: Math.max(0, (f.z - 0.5) / 0.5),
        colors: openDay ? toned(openDay) : null,
      });
  },
});

/* Writes a style only when its value changed. Per-frame code goes through this: an unchanged
   value costs nothing, while re-setting a variable on <html> restyles the whole page. */
const styleCache = new WeakMap();
function setStyle(el, prop, val) {
  let c = styleCache.get(el);
  if (!c) styleCache.set(el, (c = {}));
  if (c[prop] === val) return;
  c[prop] = val;
  el.style.setProperty(prop, val);
}

// local development only: lets the browser console reach the engine for checks
if (location.hostname === 'localhost')
  window.__dev = {
    engine,
    burstDrops,
    snd,
    enterMonth: ym => enterMonth(ym),
    exitMonth: () => exitMonth(),
    openDay: d => openDayView(d),
    back: () => backToArchive(),
    get bgm() {
      return bgmEl;
    },
    get song() {
      return songEl;
    },
  };

let hiddenPaused = [];
function quietWhileHidden() {
  if (document.hidden) {
    hiddenPaused = [songEl, bgmEl, aiAudio, cut && cut.el].filter(el => el && !el.paused);
    hiddenPaused.forEach(el => el.pause());
    if (snd.ctx && snd.ctx.state === 'running') snd.ctx.suspend();
    if (window.speechSynthesis && speechSynthesis.speaking) speechSynthesis.pause();
  } else {
    if (snd.ctx && snd.ctx.state === 'suspended') snd.ctx.resume();
    hiddenPaused.forEach(el => el.play().catch(() => {}));
    hiddenPaused = [];
    if (window.speechSynthesis && speechSynthesis.paused) speechSynthesis.resume();
  }
}
document.addEventListener('visibilitychange', quietWhileHidden);
addEventListener('pagehide', () => {
  if (!document.hidden) return;
  quietWhileHidden();
});

function toast(t, ms = 2600) {
  const e = $('toast');
  e.textContent = t;
  e.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove('show'), ms);
}
/* ControlsGuide: a small list in the top-left corner that always says what the controls do right now
   (all months, a month, a day). It speaks the language of the device: fingers on phones, mouse and keys
   on computers. Each row: [gesture or key, what it does]. */
const TOUCH = matchMedia('(pointer: coarse)').matches;
const HINT = TOUCH
  ? {
      archive: [
        ['свайп', 'листать'],
        ['тап по туманности', 'открыть месяц'],
      ],
      month: [
        ['свайп', 'листать'],
        ['тап по пятну', 'открыть день'],
        ['свести два пальца', 'все месяцы'],
      ],
      day: [
        ['свайп вверх', 'идти вглубь'],
        ['тап по фото', 'рассмотреть'],
        ['‹ внизу', 'назад'],
      ],
    }
  : {
      archive: [
        ['колесо / тянуть', 'листать'],
        ['клик по туманности', 'открыть месяц'],
      ],
      month: [
        ['колесо / тянуть', 'листать'],
        ['клик по пятну', 'открыть день'],
        ['щипок · Ctrl + колесо · Esc', 'все месяцы'],
      ],
      day: [
        ['колесо / ползунок', 'вглубь'],
        ['клик по фото', 'рассмотреть'],
        ['Esc', 'назад'],
      ],
    };
let guideRows = null;
// the guide steps aside (fades) while the day's title or its hover caption passes under it
let guideCheckAt = 0;
function guideClear() {
  const now = performance.now();
  if (now - guideCheckAt < GUIDE_CHECK_MS) return;
  guideCheckAt = now;
  const h = $('hint'),
    g = h.getBoundingClientRect();
  if (!g.width) return;
  const hit = [...document.querySelectorAll('#world .ttl, .blab')].some(e => {
    const it = e.closest('.it') || e;
    if (it.style.visibility === 'hidden' || e.style.opacity === '0' || +it.style.opacity === 0 || e.style.display === 'none') return false;
    const r = e.getBoundingClientRect();
    return r.width && r.left < g.right + 8 && r.right > g.left - 8 && r.top < g.bottom + 8 && r.bottom > g.top - 8;
  });
  h.classList.toggle('under', hit);
}
const GUIDE_CHECK_MS = 150;
function hint(rows) {
  if (!rows || rows === guideRows) return;
  guideRows = rows;
  const h = $('hint');
  h.classList.add('swap');
  clearTimeout(hint.t);
  hint.t = setTimeout(() => {
    h.innerHTML = '';
    for (const [k, v] of rows) {
      const r = document.createElement('div'),
        b = document.createElement('b');
      b.textContent = k;
      r.append(b, ' — ' + v);
      h.appendChild(r);
    }
    h.classList.remove('swap');
  }, h.childElementCount ? 220 : 0);
}

function setRangeFill(el) {
  const p = ((el.value - el.min) / (el.max - el.min)) * 100;
  el.style.setProperty('--p', p + '%');
}
function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  document.documentElement.dataset.ui = settings.ui;
  document.documentElement.classList.toggle('reduce', settings.reduce);
  engine.setPaper(false);
  sky.setDensity(settings.density);
  snd.setVolume(settings.volume);
  snd.setEnabled(settings.sound && !paused);
  $('b-snd').setAttribute('aria-pressed', String(settings.sound));
  if (songEl) songEl.muted = !settings.sound;
  if (bgmEl) {
    bgmEl.muted = !settings.sound;
    vol(bgmEl, Math.max(0.15, settings.volume));
  }
  document.querySelectorAll('#s-ui button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.ui));
  $('s-ui').classList.toggle('r', settings.ui === 'light');
  saveSettings(settings);
}

/* ---------- archive levels: months as nebulae, then the days of one month ----------
   level 'months': every month is a soft nebula of three spheres in the colours of its days.
   Tapping a nebula pours its days out of it; «‹ Все месяцы» (or Esc) gathers them back. */
const MONTHS_RU = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];
const MONTHS_GEN = [
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
/* Space: leaving a month, its days drift away into the depth while they flow together and melt into one
   drop (LiquidMerge); that drop grows into the month's nebula and comes forward. Entering, the nebula sinks
   back and its days come out of it as droplets that separate on their way to the front. */
const DEPTH_AWAY = 0.9; // how far into the depth the meeting point lies
const MONTH_GATHER_MS = 1900; // days drift away and melt into one drop, it grows forward, then the other months appear
const NEB_BORN_SEC = 0.6; // the nebula starts to grow out of the drop when the days have nearly met
const DAYS_MELT_KEEP = 0.6; // size the days keep while they flow together, so they visibly merge
const DAYS_SPLIT_MS = 1150; // entering: the droplets stop being liquid and become separate days
const MONTH_FOCUS_MS = 260; // other months fade before the chosen one opens
const MONTH_MELT_MS = 1100; // the opened nebula melts away while its days come out
const DAY_STAGGER_SEC = 0.07; // days leave the nebula one after another
// entering a month, step by step: the nebula splits into days around the camera, the days settle,
// threads appear between them, then their dates; the camera stays on the middle of the month
const LINKS_AT_MS = 1300,
  DATES_AT_MS = 1900;
let level = 'months',
  curMonth = '';
const ymOf = d => d.date.slice(0, 7);
const monthName = ym => MONTHS_RU[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
const daysWord = n =>
  n % 10 === 1 && n % 100 !== 11
    ? 'день'
    : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)
      ? 'дня'
      : 'дней';
// a month is one big nebula: a soft core in the month's most common colours, and around it lobes,
// each painted with the colours of one of its days — so different parts of the nebula show different days
// (sizes are a little smaller than they look: as one liquid drop the parts add up and swell)
const NEB_CORE = { dx: 0, dy: 0, dz: 0, rs: 1.15 };
const NEB_LOBES = [
  { dx: -0.19, dy: 0.09, dz: 0.2, rs: 0.6 },
  { dx: 0.2, dy: -0.07, dz: 0.3, rs: 0.52 },
  { dx: 0.05, dy: 0.15, dz: 0.38, rs: 0.42 },
  { dx: -0.07, dy: -0.13, dz: 0.42, rs: 0.38 },
];
const NEB_LOBE_WAIT = 0.12; // leaving a month: lobes bloom out of the core one after another (seconds)
const MONTH_GAP = 2.1; // months sit further apart than days, so each nebula has room
function nebulaSpheres() {
  const groups = new Map();
  [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(d => {
      const k = ymOf(d);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    });
  const out = [];
  [...groups.entries()].forEach(([ym, list], mi) => {
    const slot = mi * MONTH_GAP;
    const freq = new Map();
    list.forEach(d =>
      d.mood.colors.forEach((c, j) => {
        const tc = moodToneHex(c, d.mood.kind);
        freq.set(tc, (freq.get(tc) || 0) + (3 - j));
      }),
    );
    const pal = [...freq.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
    while (pal.length < 3) pal.push(pal[pal.length - 1] || '#ffc482');
    const tags = [...new Set(list.flatMap(d => d.tags || []))];
    const base = {
      date: ym + '-15',
      month: ym,
      nebula: true,
      slot,
      title: `${list.length} ${daysWord(list.length)}`,
      tags,
    };
    out.push({ ...base, ...NEB_CORE, id: `m:${ym}:0`, label: monthName(ym), mood: { kind: 'nebula', colors: pal.slice(0, 3) } });
    // lobes: days spread evenly over the month, each lobe in its own day's colours
    const k = Math.min(NEB_LOBES.length, list.length);
    for (let j = 0; j < k; j++) {
      const d = list[Math.round(((j + 0.5) * list.length) / k - 0.5)];
      out.push({
        ...base,
        ...NEB_LOBES[j],
        id: `m:${ym}:${j + 1}`,
        label: '',
        noLabel: true,
        lobe: j,
        mood: { kind: 'nebula', colors: toned(d) },
      });
    }
  });
  return out;
}
function showLevel(keepId, opts) {
  if (level === 'months') engine.setDays(nebulaSpheres(), keepId, opts);
  else
    engine.setDays(
      days.filter(d => ymOf(d) === curMonth),
      keepId,
      opts,
    );
}
let monthBusy = false;
// the timeline pill is hidden while a month splits or gathers: it moves to its new place unseen and
// fades back in there, instead of sliding across the track in the middle of the animation
function ribbonAside(ms) {
  const b = $('bar');
  b.classList.add('aside');
  clearTimeout(ribbonAside.t);
  ribbonAside.t = setTimeout(() => b.classList.remove('aside'), settings.reduce ? 0 : ms);
}
function enterMonth(ym) {
  if (level !== 'months' || !ym || monthBusy) return;
  monthBusy = true;
  ribbonAside(MONTH_FOCUS_MS + LINKS_AT_MS);
  engine.setFilter(d => d.month === ym);
  setTimeout(
    () => {
      level = 'days';
      curMonth = ym;
      const list = monthDaysOf(ym),
        n = list.length;
      // the nebula stays where it is and melts, while its days come out of it one after another
      // the camera stays on the middle of the month while the nebula splits; the opened nebula and the
      // other months stay where they are on screen and melt away
      const mid = (n - 1) / 2;
      const ghosts = nebulaSpheres().map(d => ({
        ...d,
        ghost: true,
        noLabel: true,
        label: '',
        // the opened nebula sinks back into the depth while it melts
        ...(d.month === ym ? { slot: mid, dz: (d.dz || 0) + DEPTH_AWAY } : { keep: true }),
      }));
      linksT = linksK = 0;
      // the days come out of the depth as liquid droplets and separate on their way forward
      engine.setMerge(!settings.reduce);
      const deep = engine.place(mid);
      engine.setDays([...list, ...ghosts], null, {
        scrollSlot: mid,
        keepScreen: true,
        spawn: {
          atScroll: true,
          y: deep.y,
          zd: deep.zd + DEPTH_AWAY,
          rs: 0.35,
          stagger: settings.reduce ? 0 : DAY_STAGGER_SEC,
        },
      });
      setTimeout(() => level === 'days' && curMonth === ym && engine.setMerge(false), settings.reduce ? 0 : DAYS_SPLIT_MS);
      engine.showLabels(false);
      const quick = settings.reduce;
      setTimeout(() => (linksT = 1), quick ? 0 : LINKS_AT_MS);
      setTimeout(() => engine.showLabels(true), quick ? 0 : DATES_AT_MS);
      // the camera stays on the middle of the month (the pill in the centre): no glide to the first day
      // the other months keep fading while they melt; the days of this month are fully visible
      engine.setFilter(d => !d.nebula || d.month === ym);
      renderRibbon();
      hint(HINT.month);
      setTimeout(
        () => {
          if (level === 'days' && curMonth === ym && !openDay) showLevel(null);
          applyFilter();
          monthBusy = false;
        },
        settings.reduce ? 0 : MONTH_MELT_MS,
      );
    },
    settings.reduce ? 0 : MONTH_FOCUS_MS,
  );
}
function exitMonth() {
  if (level !== 'days' || openDay || monthBusy) return;
  monthBusy = true;
  ribbonAside(MONTH_GATHER_MS + 600);
  engine.showLabels(false);
  linksT = 0;
  setTimeout(() => (engine.showLabels(true), (linksT = 1)), MONTH_GATHER_MS + 300);
  // the month's nebula is born in the centre while its days flow into it
  // the camera stops where it is, so the gathering point stays in the middle of the screen
  engine.scroll = engine.scrollT = engine.scroll; // also stops its momentum
  const list = monthDays(),
    at = gatherPoint(),
    far = { ...at, zd: at.zd + DEPTH_AWAY },
    quick = settings.reduce,
    mine = nebulaSpheres()
      .filter(d => d.month === curMonth)
      .map(d => ({
        ...d,
        at,
        noLabel: true,
        label: '',
        // the core is born as the days arrive, the lobes open out of it after
        wait: quick ? 0 : NEB_BORN_SEC + (d.lobe != null ? (d.lobe + 1) * NEB_LOBE_WAIT : 0),
      }));
  engine.setMerge(true);
  // the nebula is born deep where the days meet, then comes forward to its place among the months
  engine.setDays([...list, ...mine], null, { spawn: { atScroll: true, y: far.y, zd: far.zd, rs: 0.02 } });
  engine.gather(d => !d.nebula, far, quick ? 0 : DAYS_MELT_KEEP);
  setTimeout(() => level === 'days' && engine.gather(d => !d.nebula, far, 0), quick ? 0 : NEB_BORN_SEC * 1000);
  setTimeout(
    () => {
      level = 'months';
      const neb = nebulaSpheres(),
        i = neb.findIndex(d => d.month === curMonth && d.id.endsWith(':0'));
      // the same nebula spheres stay on screen; the other months grow in one after another
      showLevel(null, {
        scrollTo: Math.max(0, i),
        keepScreen: true,
        spawn: { rs: 0.05, stagger: settings.reduce ? 0 : 0.08 },
      });
      engine.setMerge(false);
      applyFilter();
      renderRibbon();
      hint(HINT.archive);
      monthBusy = false;
    },
    settings.reduce ? 0 : MONTH_GATHER_MS,
  );
}
// open a particular day's month first (used by «год назад» and after creating a day)
function showMonthOf(d) {
  if (level === 'days' && curMonth === ymOf(d)) return;
  level = 'days';
  curMonth = ymOf(d);
  showLevel(d.id);
  applyFilter();
  renderRibbon();
}
/* Живой жест: leaving a month without a button. Two fingers coming together (or ctrl + wheel, which is
   also how a laptop touchpad reports a pinch) pull the month's days into one point while its nebula grows
   there; let go past the middle and the month closes, before it and everything springs back. */
const PINCH_COMMIT = 0.55, // how far the pinch must go to close the month
  WHEEL_PULL = 0.0045, // pull per wheel pixel
  WHEEL_IDLE_MS = 220, // a wheel has no "let go": this long without a turn counts as letting go
  PINCH_BACK_MS = 520; // a cancelled pinch: time for the days to spring back before the nebula is removed
let pinchOn = false,
  wheelPull = 0,
  wheelTimer = 0;
// the month's days in date order, each in its own slot (so extra spheres never shift them)
const monthDays = () => monthDaysOf(curMonth);
const monthDaysOf = ym =>
  days
    .filter(d => ymOf(d) === ym)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((d, i) => ({ ...d, slot: i }));
// where a month gathers: in the middle of the screen, at the height and depth its nebula has among the
// months, so that after the switch to all months nothing has to move
function gatherPoint() {
  const months = [...new Set(days.map(ymOf))].sort(),
    p = engine.place(Math.max(0, months.indexOf(curMonth)) * MONTH_GAP);
  return { x: engine.scroll, y: p.y, zd: p.zd };
}
function pinchStart() {
  if (level !== 'days' || openDay || monthBusy) return false;
  pinchOn = true;
  // the camera stops; the nebula waits invisible at the gathering point and grows as the days come together
  engine.scroll = engine.scrollT = engine.scroll; // also stops its momentum
  const at = gatherPoint(),
    far = { ...at, zd: at.zd + DEPTH_AWAY };
  engine.pullAt = far;
  engine.setMerge(true);
  const neb = nebulaSpheres()
    .filter(d => d.month === curMonth)
    .map(d => ({ ...d, at: far, noLabel: true, label: '', pullRole: 'neb' }));
  engine.setDays([...monthDays().map(d => ({ ...d, pullRole: 'day' })), ...neb], null, {
    spawn: { atScroll: true, y: far.y, zd: far.zd, rs: 0 },
  });
  engine.pull = 0;
  engine.pullLive = true;
  return true;
}
function pinchTo(p) {
  engine.pull = p;
  linksT = linksK = Math.min(linksK, 1 - p);
  if (p >= 1) pinchEnd();
}
function pinchEnd() {
  if (!pinchOn) return;
  pinchOn = false;
  clearTimeout(wheelTimer);
  wheelPull = 0;
  engine.pullLive = false;
  if (engine.pull >= PINCH_COMMIT) {
    engine.pull = 0;
    exitMonth();
    return;
  }
  engine.pull = 0;
  linksT = 1;
  engine.setMerge(false);
  setTimeout(() => {
    if (!pinchOn && level === 'days' && !openDay && !monthBusy) showLevel(null);
  }, PINCH_BACK_MS);
}
function onPinch(v, fingers) {
  if (!pinchOn) {
    // a wheel turn towards "zoom in" does nothing until a pinch has begun
    if (!fingers && v <= 0) return;
    if (!pinchStart()) return;
  }
  if (fingers) return pinchTo(v);
  wheelPull = Math.max(0, Math.min(1, wheelPull + v * WHEEL_PULL));
  pinchTo(wheelPull);
  clearTimeout(wheelTimer);
  wheelTimer = setTimeout(pinchEnd, WHEEL_IDLE_MS);
}
// Safari on a Mac reports a touchpad pinch as gesture events instead of ctrl + wheel
addEventListener('gesturestart', e => {
  if (engine.state === 'archive' && level === 'days') e.preventDefault();
});
addEventListener('gesturechange', e => {
  if (engine.state !== 'archive' || level !== 'days') return;
  e.preventDefault();
  if (pinchOn || pinchStart()) pinchTo(Math.max(0, Math.min(1, (1 - e.scale) / 0.6)));
});
addEventListener('gestureend', () => pinchEnd());

async function reload(keepId) {
  days = await allDays();
  const kd = keepId && days.find(x => x.id === keepId);
  if (kd) {
    level = 'days';
    curMonth = ymOf(kd);
  }
  if (level === 'days' && !days.some(d => ymOf(d) === curMonth)) level = 'months';
  showLevel(keepId);
  sky.setPalette(days.flatMap(toned));
  applyFilter();
  renderRibbon();
  renderTags();
  $('empty').classList.toggle('hidden', days.length > 0 || !entered);
}
function applyFilter() {
  engine.setFilter(filterTag ? d => (d.tags || []).includes(filterTag) : null);
}

function renderRibbon() {
  // the wave shows what the archive shows: months (one knot each) or the days of the open month
  const sorted =
      level === 'months'
        ? engine.days.filter(d => d.id.endsWith(':0'))
        : [...days].filter(d => ymOf(d) === curMonth).sort((a, b) => a.date.localeCompare(b.date)),
    n = sorted.length;
  const grad = n
    ? gradOf(n === 1 ? [toned(sorted[0])[0], toned(sorted[0])[0]] : sorted.map(d => toned(d)[0]))
    : 'transparent';
  $('trackAll').style.background = grad;
  if (!openDay) {
    $('trackGlow').style.background = grad;
    buildKnots(
      sorted.map((d, i) => (n > 1 ? i / (n - 1) : 0.5)),
      sorted.map(d => toned(d)[0]),
      level === 'months'
        ? sorted.map(d => MONTHS_RU[+d.month.slice(5, 7) - 1].slice(0, 3) + ' ' + d.month.slice(2, 4))
        : [],
    );
  } else {
    buildKnots(
      itemZ.map(z => Math.min(1, z)),
      toned(openDay),
    );
  }
}
const dayGradient = colors => gradOf(colors.length > 1 ? colors : [colors[0], colors[0]]);
// track and glow take the day's own colours while inside a day
function paintDayTrack(colors) {
  const g = dayGradient(colors);
  $('trackDay').style.background = g;
  $('trackGlow').style.background = g;
}

/* SwellTrack wave: the coloured line itself swells smoothly wherever there is a day (or, inside a day,
   a photo or a note); swells near the pill grow more, like icons in the macOS Dock. One canvas, redrawn
   only while the pill moves or a swell is still settling. */
const WAVE_AMP = 3; // px of extra half-thickness at a day
const WAVE_SWELL = 0.9; // extra growth right under the pill
let knots = [],
  waveCols = ['#ffffff'],
  waveCv = null,
  waveKey = '';
let markKey = '';
function buildKnots(fractions, colors, labels = []) {
  const box = $('ticks');
  if (!waveCv) {
    box.innerHTML = '';
    waveCv = document.createElement('canvas');
    box.appendChild(waveCv);
  }
  waveCols = colors.length ? colors : ['#ffffff'];
  knots = fractions.map((f, i) => ({ f, s: 1, label: labels[i] || '' }));
  waveKey = '';
  markKey = '';
}
function moveKnots(center, pillW, dt) {
  if (!waveCv) return;
  const narrow = innerWidth < 700,
    reach = narrow ? 34 : 60,
    sigma = narrow ? 7 : 9;
  const span = Math.max(0, ribW - pillW);
  // month marks above the wave, placed exactly over their knots
  const mk = `${Math.round(ribW)}|${Math.round(pillW)}|${knots.map(k => k.label).join()}`;
  if (mk !== markKey) {
    markKey = mk;
    const box = $('ribMarks');
    box.innerHTML = '';
    for (const kn of knots) {
      if (!kn.label) continue;
      const e = document.createElement('span');
      e.textContent = kn.label;
      e.style.left = (kn.f * span + pillW / 2).toFixed(1) + 'px';
      box.appendChild(e);
    }
  }
  let settling = false;
  for (const kn of knots) {
    const x = kn.f * span + pillW / 2;
    const target = 1 + WAVE_SWELL * Math.exp(-Math.pow((x - center) / reach, 2));
    kn.s += (target - kn.s) * Math.min(1, dt * 12);
    if (Math.abs(target - kn.s) > 0.002) settling = true;
    kn.x = x;
  }
  const d = Math.min(2, devicePixelRatio || 1),
    W = Math.round(ribW),
    H = 24;
  const key = `${W}|${center.toFixed(1)}|${knots.length}|${waveCols.join()}|${document.documentElement.dataset.theme}`;
  if (!settling && key === waveKey) return;
  waveKey = key;
  if (waveCv.width !== W * d) {
    waveCv.width = W * d;
    waveCv.height = H * d;
  }
  const g = waveCv.getContext('2d');
  g.setTransform(d, 0, 0, d, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!knots.length || W < 2) return;
  const gr = g.createLinearGradient(0, 0, W, 0);
  const cols = waveCols.length > 1 ? waveCols : [waveCols[0], waveCols[0]];
  cols.forEach((c, i) => gr.addColorStop(i / (cols.length - 1), c));
  const cy = H / 2,
    top = [];
  for (let x = 0; x <= W; x += 1.5) {
    let w = 1.5;
    for (const kn of knots) {
      const dx = (x - kn.x) / sigma;
      if (dx > -4 && dx < 4) w += WAVE_AMP * kn.s * Math.exp(-dx * dx);
    }
    top.push(x, Math.min(cy - 0.5, w));
  }
  g.fillStyle = gr;
  g.globalAlpha = 0.92;
  g.beginPath();
  g.moveTo(0, cy);
  for (let i = 0; i < top.length; i += 2) g.lineTo(top[i], cy - top[i + 1]);
  for (let i = top.length - 2; i >= 0; i -= 2) g.lineTo(top[i], cy + top[i + 1]);
  g.closePath();
  g.fill();
}
function renderTags() {
  const set = new Set();
  days.forEach(d => (d.tags || []).forEach(t => set.add(t)));
  const bar = $('tagbar');
  bar.innerHTML = '';
  [...set].sort().forEach(t => {
    const c = document.createElement('button');
    c.className = 'chip glass' + (filterTag === t ? ' on' : '');
    const s = document.createElement('span');
    s.textContent = '#' + t;
    c.appendChild(s);
    c.onclick = () => {
      filterTag = filterTag === t ? null : t;
      renderTags();
      applyFilter();
    };
    bar.appendChild(c);
  });
  if (!set.size) bar.classList.add('hidden');
}

function dialog({ title, value = '', input = true, ok = 'Готово' }) {
  return new Promise(res => {
    $('dlg-title').textContent = title;
    const inp = $('dlg-input');
    inp.value = value;
    inp.style.display = input ? '' : 'none';
    $('dlg-ok').textContent = ok;
    $('dlg').classList.remove('hidden');
    if (input) setTimeout(() => inp.focus(), 50);
    const done = v => {
      $('dlg').classList.add('hidden');
      $('dlg-form').onsubmit = null;
      $('dlg-cancel').onclick = null;
      res(v);
    };
    $('dlg-form').onsubmit = e => {
      e.preventDefault();
      done(input ? inp.value : true);
    };
    $('dlg-cancel').onclick = () => done(null);
  });
}

function closePanels() {
  hideLabel();
  const m = $('menu');
  m.classList.remove('open');
  $('b-menu').setAttribute('aria-expanded', 'false');
  clearTimeout(closePanels.t);
  closePanels.t = setTimeout(() => {
    if (!m.classList.contains('open')) m.classList.add('gone');
  }, 750);
  document.querySelectorAll('.sheet').forEach(s => s.classList.remove('open'));
}
const SHORT = {
  theme: 'Тема',
  music: 'Музыка',
  tag: 'Теги',
  set: 'Настройки',
  speak: 'Читать',
  card: 'Открытка',
  spark: 'ИИ',
  info: 'Почему',
  pin: 'Закрепить',
  pen: 'Имя',
  trash: 'Удалить',
};
// floating palette of round glass buttons; the first one sits closest to the "···" button
function setMenu(list) {
  const m = $('menu');
  m.innerHTML = '';
  const items = list.filter(it => it !== '-');
  m.style.setProperty('--n', items.length);
  let k = 0;
  list.forEach(it => {
    if (it === '-') {
      const s = document.createElement('i');
      s.className = 'mgap';
      m.appendChild(s);
      return;
    }
    const b = document.createElement('button');
    b.className = 'pb glass' + (it.danger ? ' danger' : '');
    b.setAttribute('role', 'menuitem');
    b.setAttribute('aria-label', it.label);
    b.style.setProperty('--k', k++);
    b.innerHTML = (ICON[it.icon] || '') + `<span class="cap">${esc(it.short || SHORT[it.icon] || it.label)}</span>`;
    b.onclick = () => {
      hideLabel();
      closePanels();
      it.fn();
    };
    b.onpointerenter = () => showLabel(b, it.label);
    b.onfocus = () => showLabel(b, it.label);
    b.onpointerleave = hideLabel;
    b.onblur = hideLabel;
    m.appendChild(b);
  });
}
function showLabel(b, text) {
  const l = $('plabel'),
    r = b.getBoundingClientRect();
  l.innerHTML = '';
  const s = document.createElement('span');
  s.textContent = text;
  l.appendChild(s);
  l.style.left = r.left + r.width / 2 + 'px';
  l.style.top = r.top + 'px';
  l.classList.add('show');
}
function hideLabel() {
  $('plabel').classList.remove('show');
}
function toggleSheet(id) {
  const s = $(id),
    was = s.classList.contains('open');
  closePanels();
  if (!was) s.classList.add('open');
}
function archiveMenu() {
  setMenu([
    {
      icon: 'theme',
      label: settings.ui === 'light' ? 'Тёмная тема' : 'Светлая тема',
      fn: () => setTheme(settings.ui === 'light' ? 'dark' : 'light'),
    },
    {
      icon: 'music',
      label: 'Музыка на главной',
      fn: () => {
        renderMusic();
        toggleSheet('music');
      },
    },
    { icon: 'tag', label: 'Фильтр по тегам', fn: () => $('tagbar').classList.toggle('hidden') },
    '-',
    { icon: 'set', label: 'Настройки', fn: () => (toggleSheet('settings'), refreshUsage()) },
  ]);
}
function dayMenu() {
  setMenu([
    ...(canSpeak
      ? [
          {
            icon: 'speak',
            label: 'Прочитать день вслух',
            fn: () => {
              const ns = [...document.querySelectorAll('#world .note')];
              readNotes(
                ns.map(n => n.querySelector('p').textContent),
                ns,
              );
            },
          },
        ]
      : []),
    { icon: 'card', label: 'Сохранить открытку', fn: savePostcard },
    ...(aiReady ? [{ icon: 'spark', label: 'Пересчитать с ИИ', fn: reanalyze }] : []),
    { icon: 'info', label: 'Почему день выглядит так', fn: () => toggleSheet('why') },
    {
      icon: 'pin',
      label: openDay && openDay.pinned ? 'Открепить' : 'Закрепить',
      fn: async () => {
        openDay.pinned = !openDay.pinned;
        await putDay(openDay);
        await refreshKeep();
        dayMenu();
        toast(openDay.pinned ? 'Закреплено: пятно стало крупнее' : 'Откреплено');
      },
    },
    {
      icon: 'pen',
      label: 'Переименовать',
      fn: async () => {
        const v = await dialog({ title: 'Название дня', value: titleOf(openDay) });
        if (v === null) return;
        openDay.userTitle = v.trim();
        await putDay(openDay);
        const t = document.querySelector('.ttl h2');
        if (t) t.textContent = titleOf(openDay);
        await refreshKeep();
      },
    },
    {
      icon: 'tag',
      label: 'Теги дня',
      fn: async () => {
        const v = await dialog({ title: 'Теги через запятую', value: (openDay.tags || []).join(', ') });
        if (v === null) return;
        openDay.tags = v
          .split(',')
          .map(s => s.trim().replace(/^#/, ''))
          .filter(Boolean);
        await putDay(openDay);
        await refreshKeep();
        renderTags();
        toast('Теги сохранены');
      },
    },
    '-',
    {
      icon: 'trash',
      label: 'Удалить день',
      danger: true,
      fn: async () => {
        const ok = await dialog({ title: 'Удалить этот день навсегда?', input: false, ok: 'Удалить' });
        if (!ok) return;
        const id = openDay.id;
        backToArchive();
        // once the camera is back in the archive, the sphere dissolves into drops of paint,
        // then the day is removed and its neighbours glide in to close the gap
        setTimeout(
          () =>
            engine.dissolve(id, async () => {
              await delDay(id);
              await reload();
            }),
          DELETE_AFTER_LEAVE_MS,
        );
      },
    },
  ]);
}
async function refreshKeep() {
  days = await allDays();
  const id = openDay && openDay.id;
  showLevel(null);
  if (id) openDay = days.find(d => d.id === id) || openDay;
}

function setDock(mode) {
  $('i-add').classList.toggle('hidden', mode === 'day');
  $('i-back').classList.toggle('hidden', mode !== 'day');
  $('b-add').setAttribute('aria-label', mode === 'day' ? 'Назад к ленте' : 'Новый день');
  closePanels();
  if (mode === 'day') dayMenu();
  else {
    archiveMenu();
    renderRibbon();
  }
}

/* ---------- background music on the main screen ---------- */
const BGM = [
  ['galaxy', 'Тишина космоса', 'низкий спокойный эмбиент', '#8fa3ff'],
  ['calm', 'Тёплый вечер', 'мягкий мажор, медленно', '#ffc482'],
  ['melancholy', 'Дождь за окном', 'задумчивый минор', '#a98bff'],
  ['bright', 'Праздник', 'светло и живо', '#ff78be'],
  ['tense', 'Ночной город', 'собранный ритм', '#6ea0ff'],
  ['rainwin', 'Дождь по стеклу', 'капли, тихое пианино', '#7fa3c9'],
  ['ocean', 'Морской прибой', 'дыхание волн, колокольчики', '#5fc2c0'],
  ['lofi', 'Ночное лоу-фай', 'мягкий бит, треск винила', '#c49bff'],
  ['musicbox', 'Музыкальная шкатулка', 'хрупкая мелодия', '#ffd6a0'],
  ['morning', 'Утро', 'светло, птицы за окном', '#ffe27a'],
  ['forest', 'Лесная тропа', 'птицы и ветер в листьях', '#8fd18f'],
  ['aurora', 'Северное сияние', 'мерцающий высокий фон', '#7ff0d0'],
  ['deep', 'Глубокий космос', 'низкий гул и редкие звоны', '#5560c0'],
  ['off', 'Без музыки', 'тишина', '#777'],
];
let bgmEl = null,
  bgmRec = null;
/* Library: your own background tracks, covers and day songs are kept (IndexedDB, in this browser only)
   so they can be picked again instead of being uploaded every time. */
const LIB_MAX = { bgm: 8, covers: 16, songs: 10, links: 12 };
const lib = { bgm: [], covers: [], songs: [], links: [] };
async function loadLib() {
  for (const k of Object.keys(lib)) {
    try {
      const rec = await getRec('__lib-' + k);
      lib[k] = (rec && rec.list) || [];
    } catch {
      lib[k] = [];
    }
  }
  // the single track saved by earlier versions becomes the first one in the library
  try {
    const old = await getRec('__bgm');
    if (old && old.blob && !lib.bgm.some(t => t.id === 'old')) {
      lib.bgm.unshift({ id: 'old', name: old.name, blob: old.blob });
      await saveLib('bgm');
    }
  } catch {}
  if (settings.bgm === 'custom') settings.bgm = lib.bgm[0] ? 'custom:' + lib.bgm[0].id : 'galaxy';
  if (String(settings.bgm).startsWith('custom:') && !libTrack(settings.bgm)) settings.bgm = 'galaxy';
}
const saveLib = k => putDay({ id: '__lib-' + k, list: lib[k] });
function libAdd(k, item, same) {
  lib[k] = [item, ...lib[k].filter(x => !same(x))].slice(0, LIB_MAX[k]);
  return saveLib(k);
}
function libRemove(k, id) {
  lib[k] = lib[k].filter(x => x.id !== id);
  return saveLib(k);
}
const libId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const libTrack = v => lib.bgm.find(t => 'custom:' + t.id === v);
let pendingPlay = null;
function playMedia(el) {
  const p = el.play();
  if (p && p.catch)
    p.catch(() => {
      if (document.hidden) return;
      pendingPlay = el;
      toast('Нажми на экран, чтобы включить музыку');
    });
}
addEventListener(
  'pointerdown',
  () => {
    if (!pendingPlay) return;
    const el = pendingPlay;
    pendingPlay = null;
    if (el === bgmEl || el === songEl) el.play().catch(() => {});
  },
  true,
);
function vol(el, v) {
  const g = el && el.fade;
  if (v === undefined) return g ? g.gain.value : el.volume;
  if (g) {
    el.volume = 1;
    g.gain.value = v;
  } else el.volume = v;
}
function stopBgmEl() {
  if (!bgmEl) return;
  const el = bgmEl;
  bgmEl = null;
  const v0 = vol(el),
    t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / (MUSIC_FADE_SEC * 1000));
    vol(el, v0 * (1 - k));
    if (k < 1) requestAnimationFrame(step);
    else el.pause();
  };
  step();
}
function playBgm() {
  if (!snd.ctx) return;
  stopBgmEl();
  const v = settings.bgm || 'galaxy';
  if (v === 'off') {
    snd.stop();
    return;
  }
  const own = libTrack(v);
  if (own) {
    snd.stop();
    const el = new Audio(URL.createObjectURL(own.blob));
    el.loop = true;
    el.muted = !settings.sound;
    snd.attach(el, { soft: true });
    vol(el, 0);
    bgmEl = el;
    playMedia(el);
    const tv = Math.max(0.15, settings.volume),
      t0 = performance.now();
    const step = () => {
      if (bgmEl !== el) return;
      const k = Math.min(1, (performance.now() - t0) / (MUSIC_FADE_SEC * 1000));
      vol(el, tv * k);
      if (k < 1) requestAnimationFrame(step);
    };
    step();
    return;
  }
  snd.play(String(v).startsWith('custom') ? 'galaxy' : v, { soft: true });
}
function renderMusic() {
  const box = $('bgm-list');
  box.innerHTML = '';
  const list = [...BGM, ...lib.bgm.map(t => ['custom:' + t.id, t.name, 'свой трек', '#e8e2d6'])];
  list.forEach(([id, name, sub, c]) => {
    const b = document.createElement('button');
    b.className = 'opt' + ((settings.bgm || 'galaxy') === id ? ' on' : '');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String((settings.bgm || 'galaxy') === id));
    b.innerHTML = `<i class="dotc" style="--c:${c}"></i><span class="tx"><b></b><small></small></span>${ICON.check}`;
    b.querySelector('b').textContent = name;
    b.querySelector('small').textContent = sub;
    if (String(id).startsWith('custom:')) {
      // own tracks can be removed from the library
      const x = document.createElement('span');
      x.className = 'opt-x';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', 'Убрать трек');
      x.innerHTML = XI;
      x.onclick = async ev => {
        ev.stopPropagation();
        await libRemove('bgm', id.slice(7));
        if (settings.bgm === id) {
          settings.bgm = 'galaxy';
          saveSettings(settings);
          if (!openDay) playBgm();
        }
        renderMusic();
      };
      b.appendChild(x);
    }
    b.onclick = () => {
      settings.bgm = id;
      saveSettings(settings);
      renderMusic();
      if (!openDay) playBgm();
    };
    box.appendChild(b);
  });
}
$('bgm-file').onchange = async () => {
  const f = $('bgm-file').files[0];
  if (!f) return;
  const t = { id: libId(), blob: f, name: f.name.replace(/\.[a-z0-9]+$/i, '') };
  await libAdd('bgm', t, x => x.name === t.name && x.blob.size === f.size);
  settings.bgm = 'custom:' + t.id;
  if (!settings.sound) {
    settings.sound = true;
    applySettings();
  }
  saveSettings(settings);
  renderMusic();
  if (!openDay) playBgm();
  toast(openDay ? 'Свой трек заиграет на главной' : 'Свой трек играет на главной');
  $('bgm-file').value = '';
};

/* ---------- 3D day scene ---------- */
function sentences(text) {
  const s = (text.match(/[^.!?…]+[.!?…]*/g) || [text]).map(x => x.trim()).filter(Boolean);
  const cap = Math.min(4, Math.max(1, Math.ceil(s.length / 2))),
    per = Math.ceil(s.length / cap),
    out = [];
  for (let i = 0; i < s.length; i += per) out.push(s.slice(i, i + per).join(' '));
  return out;
}
function el(cls, html) {
  const e = document.createElement('div');
  e.className = 'it ' + cls;
  e.innerHTML = html || '';
  $('world').appendChild(e);
  return e;
}

// the song's display name: file name without extension, or the title found from its link
// a Spotify song plays inside Spotify's own player (an iframe of another site): the browser lets no page
// change that sound, and Spotify gives no volume command — so no «under water» and no fades for it
const SPOTIFY_NOTE = 'Spotify не даёт сайту менять звук: без эффекта «под водой» и плавности. Для эффекта добавь файл или ссылку SoundCloud.',
  PREVIEW_NOTE = 'Играет отрывок 30 с из Apple Music, со звуком сайта';
// a Spotify song with Apple Music's preview of it: the preview plays through the site's own sound
const usesPreview = d => !!(d && d.audio && d.audio.preview && (songEmbed(d) || {}).svc === 'spotify');
function songNote(pe, d) {
  const info = pe.querySelector('.pinfo');
  info.querySelectorAll('.pnote, .plink.sp').forEach(x => x.remove());
  if ((songEmbed(d) || {}).svc !== 'spotify') return;
  const n = document.createElement('div');
  n.className = 'pnote';
  n.textContent = usesPreview(d) ? PREVIEW_NOTE : SPOTIFY_NOTE;
  info.appendChild(n);
  if (usesPreview(d) && safeUrl(d.audio.url)) {
    const a = document.createElement('a');
    a.className = 'plink sp';
    a.href = d.audio.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'вся песня в Spotify ↗';
    info.appendChild(a);
  }
}
/* Sheets from one text: whole sentences, grouped so that each sheet holds about 90–200 characters,
   at most SHEET_MAX sheets. The user's words are not changed, only divided. */
const SHEET_SPLIT_CHARS = 170,
  // a day made without AI (no fragments from it) splits sooner, so its notes still become a few sheets
  SHEET_SPLIT_LOCAL = 90,
  SHEET_TARGET = 150,
  SHEET_MAX = 5;
function groupSentences(text) {
  const ss = (String(text).match(/[^.!?…]+[.!?…]+["»)]*\s*|[^.!?…]+$/g) || [text]).map(s => s.trim()).filter(Boolean);
  if (ss.length < 2) return [text];
  const n = Math.min(SHEET_MAX, Math.max(2, Math.round(text.length / SHEET_TARGET))),
    per = text.length / n,
    out = [];
  let cur = '';
  for (const s of ss) {
    if (cur && (cur + ' ' + s).length > per * 1.15 && out.length < n - 1) {
      out.push(cur);
      cur = s;
    } else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) out.push(cur);
  return out;
}
function songNameOf(d) {
  if (!d.audio) return '';
  if (d.audio.blob) return (d.audio.name || 'Песня дня').replace(/\.[a-z0-9]+$/i, '');
  return d.audio.name || 'Песня дня';
}
function buildItems(d) {
  stopDayMedia();
  $('world').innerHTML = '';
  player = null;
  const items = [],
    ph = () => Math.random() * 6.28;
  const [c1, c2] = toned(d);
  items.push({
    el: el(
      'ttl',
      `<div class="d">${esc(fmtDate(d.date))}</div><h2>${esc(titleOf(d))}</h2><span class="m">${esc(moodInfo(d.mood.kind).name)}</span>`,
    ),
    z: 0.04,
    x: 0,
    y: -10,
    rx: 0,
    ry: 0,
    rz: 0,
    ph: ph(),
    pinTitle: true,
  });
  const chunk = s => (s.length <= 240 ? [s] : sentences(s));
  // one long text (written in a single note, and the AI kept it whole) is split into sheets of a few sentences
  const sheets = list =>
    list.length === 1 && list[0].length > (d.ai ? SHEET_SPLIT_CHARS : SHEET_SPLIT_LOCAL) ? groupSentences(list[0]) : list;
  const photos = (d.photos || []).slice(0, 8),
    frags =
      d.fragments && d.fragments.length
        ? sheets(d.fragments)
        : d.notes && d.notes.length
          ? sheets(d.notes).flatMap(chunk)
          : sentences(d.text),
    seq = [];
  for (let i = 0; i < Math.max(photos.length, frags.length); i++) {
    if (photos[i]) seq.push(['ph', photos[i], i]);
    if (frags[i]) seq.push(['tx', frags[i], i]);
    if (i === 0 && d.video && d.video.blob) seq.push(['tv', d.video, 0]);
    if (i === 1 && d.tape && d.tape.blob) seq.push(['tape', d.tape, 0]);
  }
  // a day with one photo or note still gets its cassette, a step further than the TV
  if (d.tape && d.tape.blob && !seq.some(x => x[0] === 'tape')) seq.push(['tape', d.tape, 0]);
  const z0 = 0.36,
    z1 = 0.86,
    total = seq.length;
  // rule-of-thirds resting points, shuffled per day so every memory composes differently
  let sd = [...d.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 2147483647, 11) || 11;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const P = [
    [-1 / 6, -1 / 6],
    [1 / 6, -1 / 6],
    [-1 / 6, 1 / 6],
    [1 / 6, 1 / 6],
    [-0.3, 0.02],
    [0.3, -0.02],
    [0, -0.13],
    [0.02, 0.17],
  ];
  for (let i = P.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [P[i], P[j]] = [P[j], P[i]];
  }
  let pinN = 0;
  seq.forEach(([k, v, n], i) => {
    const z = total > 1 ? z0 + (z1 - z0) * (i / (total - 1)) : 0.4;
    const side = i % 2 ? 1 : -1,
      x = side * (200 + (i % 3) * 30),
      y = (((i * 37) % 3) - 1) * 60;
    const pt = P[pinN % P.length],
      lap = Math.floor(pinN / P.length);
    const slot = {
      fx: pt[0] + (rnd() - 0.5) * 0.05 + lap * 0.03,
      fy: pt[1] + (rnd() - 0.5) * 0.05 + lap * 0.03,
      srz: (rnd() - 0.5) * 5,
      order: pinN++,
    };
    let e;
    if (k === 'tv' || k === 'tape') {
      e = k === 'tv' ? tvItem(v, d) : tapeItem(v, d);
      items.push({ el: e, z, x, y, ry: -side * 16, rx: 4, rz: side * 2, ph: ph(), pin: true, interactive: true, ...slot });
      return;
    }
    if (k === 'ph') {
      e = el(
        'frame',
        `<div class="pic"><img alt=""><i class="glare"></i></div><div class="cap"><span>${esc(shortDate(d.date))}</span><small>кадр ${n + 1}</small></div>`,
      );
      const im = e.querySelector('img');
      im.decoding = 'async';
      im.alt = `Фото дня ${n + 1} из ${photos.length}, ${shortDate(d.date)}`;
      im.src = v;
      items.push({ el: e, z, x, y, ry: -side * 22, rx: 4, rz: side * 3.5, ph: ph(), pin: true, ...slot });
    } else {
      e = el(
        'note' + (i % 2 ? ' b' : ''),
        `<i class="tape"></i><p></p><span class="sig">— ${esc(shortDate(d.date))}</span>${canSpeak ? `<button class="say" aria-label="Прочитать вслух">${ICON.speak}</button>` : ''}`,
      );
      e.querySelector('p').textContent = v;
      const sb = e.querySelector('.say');
      if (sb)
        sb.onclick = ev => {
          ev.stopPropagation();
          readNotes([v], [e]);
        };
      items.push({
        el: e,
        z,
        x,
        y,
        ry: -side * 18,
        rx: 6,
        rz: -side * 4,
        ph: ph(),
        pin: true,
        interactive: !!sb,
        note: v,
        ...slot,
      });
    }
  });
  // player
  const pe = el('player album', '');
  pe.style.setProperty('--c1', c1);
  pe.style.setProperty('--c2', c2);
  pe.style.setProperty('--c3', toned(d)[2] || c1);
  const name = songNameOf(d) || 'Музыка этого дня';
  const sub = `альбом «${fmtDate(d.date).replace(/ \d{4}$/, '')}»` + (d.audio && d.audio.url ? ' · ' + (SERVICE_NAME[(songEmbed(d) || {}).svc] || 'по ссылке') : '');
  // AlbumPlayer: a sleeve whose cover is painted from the day (its first photo, tinted by the palette),
  // and a record that slides out of it and spins while the song plays
  pe.innerHTML = `<div class="album-art" aria-hidden="true"><div class="record"><div class="disc"></div><div class="sheen"></div></div><div class="sleeve"><i class="cover-photo"></i><i class="cover-paint"></i><i class="cover-gloss"></i></div></div>
    <div class="pinfo"><div class="ptitle"></div><div class="psub"></div><div class="bars">${'<i></i>'.repeat(22)}</div><div class="prog"><i></i></div></div>
    <button class="pbtn" aria-label="Пауза">${ICON.pause}${ICON.play}</button>`;
  pe.querySelector('.ptitle').textContent = name;
  pe.querySelector('.psub').textContent = sub;
  // a Spotify song: either Apple's preview through the site's sound, or Spotify's own player
  songNote(pe, d);
  const cv = d.cover || (d.photos && d.photos[d.coverPhoto || 0]) || (d.photos && d.photos[0]);
  if (cv) pe.querySelector('.cover-photo').style.backgroundImage = `url("${cv}")`;
  // a chosen picture (song artwork, own image, ready-made cover) is shown as it is, without the day's tint
  if (d.coverOwn) pe.querySelector('.album-art').classList.add('own');
  if (d.audio && d.audio.url && safeUrl(d.audio.url) && !songEmbed(d)) {
    const a = document.createElement('a');
    a.className = 'plink';
    a.href = d.audio.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'открыть песню ↗';
    pe.querySelector('.pinfo').appendChild(a);
  }
  pe.querySelector('.pbtn').onclick = e => {
    e.stopPropagation();
    togglePlay();
  };
  items.push({ el: pe, z: 0.93, x: 0, y: 20, rx: 8, ry: 0, rz: 0, ph: ph(), interactive: true, player: true });
  player = { el: pe, bars: [...pe.querySelectorAll('.bars i')], prog: pe.querySelector('.prog i') };
  setupSeek(pe, d);
  itemZ = items.map(i => i.z);
  engine.setItems(items);
  renderRibbon();
  const w = $('why-list');
  w.innerHTML = '';
  const wk = d.weather ?? detectWeather(d.text);
  const whys = [...(d.mood.why || [])];
  if (d.mood.ai) whys.unshift('Атмосферу этого дня разобрал ИИ (Google Gemini) по заметкам, фото и песне.');
  if (wk.length)
    whys.push(`Погода внутри дня: ${wk.map(k => WEATHER_NAMES[k]).join(', ')}. Она взята из слов заметок.`);
  whys.forEach(t => {
    const li = document.createElement('li');
    li.textContent = t;
    w.appendChild(li);
  });
}
/* ---------- AI (Gemini via proxy) ---------- */
let aiReady = false,
  aiAudio = null,
  aiTok = 0;
function renderAiStatus() {
  const url = aiUrl();
  $('ai-dot').className = 'ai-dot' + (aiReady ? ' on' : url ? ' warn' : '');
  // a settings row in the iOS way: «ИИ — ● Работает» (the value is short; the note below the group explains the rest)
  $('ai-status').textContent = !url ? 'Не настроен' : aiReady ? 'Работает' : 'Недоступен';
}
/* AI limits screen (Settings → «Лимиты на сегодня»): a GroupedList with a thin bar under each count.
   Bar colour: green while plenty is left, amber under 30 %, red when almost or fully used. */
const MODEL_NAMES = {
  'workers-ai': 'Cloudflare Workers AI',
  'gemini-flash-lite-latest': 'Gemini Flash-Lite',
  'gemini-3.8-flash': 'Gemini Flash',
};
const modelName = id =>
  MODEL_NAMES[id] ||
  (/^groq/.test(id) ? 'Groq' + (/qwen/.test(id) ? ' · Qwen' : /gpt-oss/.test(id) ? ' · GPT-OSS' : '') : /lite/.test(id) ? 'Gemini Flash-Lite' : /gemini/.test(id) ? 'Gemini' : id);
const barColor = f => (f < 0.7 ? 'var(--c-ok)' : f < 0.95 ? 'var(--c-warn)' : 'var(--c-danger)');
function resetText(iso) {
  try {
    const t = new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `Лимиты обновятся в ${t} по твоему времени.`;
  } catch {
    return 'Лимиты обновятся в полночь по UTC.';
  }
}
let usage = null;
async function refreshUsage() {
  if (!aiUrl()) return;
  usage = await aiUsage();
  renderUsage();
}
function renderUsage() {
  const u = usage;
  const row = (k, n) => {
    const f = u ? u[k].used / Math.max(1, u[k].max) : 0;
    $(`lim-${n}-n`).textContent = u ? `${u[k].used} из ${u[k].max}` : '—';
    const b = $(`lim-${n}-b`);
    b.style.width = (u ? Math.max(2, f * 100) : 0) + '%';
    b.style.background = barColor(f);
    return f;
  };
  const fd = row('days', 'days'),
    fv = row('voices', 'voices');
  if (u && u.dict) row('dict', 'dict');
  const backup = u && u.src === 'workers-ai';
  $('lim-dot').className = 'ai-dot' + (!aiReady ? '' : backup ? ' warn' : ' on');
  $('lim-st').textContent = !aiReady ? 'Недоступен' : backup ? 'Запасной ИИ' : 'Работает';
  $('lim-model').textContent = u ? modelName(u.src || u.primary) : '—';
  const notes = [];
  if (fd >= 1) notes.push('Дни с ИИ на сегодня закончились: новые дни собираются без ИИ, цвета по фото и тексту.');
  if (fv >= 1) notes.push('Озвучки на сегодня закончились: заметки читает голос браузера.');
  if (u) notes.push(resetText(u.resetAt));
  else if (aiReady) notes.push('Не удалось узнать лимиты, попробуй позже.');
  $('lim-note').textContent = notes.join(' ');
  $('s-ailim-n').textContent = u ? `${u.days.max - u.days.used} дн. · ${u.voices.max - u.voices.used} озв.` : '';
}
// after any AI call: refresh the counters, and say once if today's allowance just ran out
function afterAiCall() {
  const k = takeLimitHit();
  if (k === 'days') toast('Дни с ИИ на сегодня закончились — собираю день без ИИ');
  if (k === 'voices') toast('Озвучки ИИ на сегодня закончились — читает голос браузера');
  if (k === 'dict') toast('Диктовки на сегодня закончились — допиши текстом');
  refreshUsage();
  return k;
}

async function checkAi() {
  aiReady = aiUrl() ? await aiHealth() : false;
  renderAiStatus();
  refreshUsage();
  if (openDay) dayMenu();
}
function applyAi(mood, ai, hasAudio) {
  if (!ai) return mood;
  if (ai.kind) mood.kind = ai.kind;
  if (ai.colors) mood.colors = ai.colors;
  if (ai.energy != null) mood.energy = ai.energy;
  if (ai.valence != null) mood.valence = ai.valence;
  if (!hasAudio && ai.energy != null) mood.tempo = Math.round(52 + ai.energy * 70);
  const tech = (mood.why || []).filter(w => /Песня:|Фоновая музыка/.test(w));
  mood.why = [...ai.why, ...tech];
  mood.ai = true;
  return mood;
}
const hashStr = s => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'h' + (h >>> 0).toString(36);
};
async function ttsFor(day, text) {
  day.tts = day.tts || {};
  const key = hashStr(text);
  if (day.tts[key]) return day.tts[key];
  // read the spelling-corrected version of this note when the AI made one
  const i = day.fragments && day.spoken ? day.fragments.indexOf(text) : -1,
    say = i >= 0 && day.spoken[i] ? day.spoken[i] : text;
  const b = await aiSpeak(say, day.mood.kind, day.voiceStyle || '');
  afterAiCall();
  if (b) {
    day.tts[key] = b;
    putDay(day).catch(() => {});
  }
  return b;
}
function stopAiVoice() {
  aiTok++;
  if (aiAudio) {
    aiAudio.pause();
    aiAudio = null;
  }
}
function playBlob(b, my) {
  return new Promise(res => {
    const el = new Audio(URL.createObjectURL(b));
    aiAudio = el;
    el.volume = 1;
    el.muted = !settings.sound;
    snd.attach(el);
    el.onended = el.onerror = () => res(true);
    el.play().catch(() => res(false));
    const chk = setInterval(() => {
      if (my !== aiTok) {
        clearInterval(chk);
        el.pause();
        res(false);
      }
    }, 120);
    el.addEventListener('ended', () => clearInterval(chk));
  });
}
async function aiRead(texts, els) {
  stopVoice();
  stopAiVoice();
  const my = ++aiTok,
    day = openDay;
  const unmark = clearSpeaking;
  const duck = on => {
    snd.setDuck(on ? 0.15 : songEl ? 0.2 : 1);
    if (songEl) songEl.baseVol = on ? 0.1 : Math.max(0.3, settings.volume);
  };
  const cached = day.tts && day.tts[hashStr(texts[0])];
  if (!cached) toast('Голос готовится…', 2500);
  duck(true);
  let next = ttsFor(day, texts[0]);
  for (let i = 0; i < texts.length; i++) {
    const b = await next;
    if (my !== aiTok) return;
    if (!b) {
      unmark();
      duck(false);
      toast('Голос ИИ недоступен, читаю встроенным', 3000);
      speakLocal(texts.slice(i), els.slice(i));
      return;
    }
    next = i + 1 < texts.length ? ttsFor(day, texts[i + 1]) : null;
    unmark();
    els[i] && els[i].classList.add('speaking');
    await playBlob(b, my);
    if (my !== aiTok) return;
    await new Promise(r => setTimeout(r, 380));
  }
  unmark();
  duck(false);
  aiAudio = null;
}
const clearSpeaking = () => document.querySelectorAll('.note.speaking').forEach(n => n.classList.remove('speaking'));
function readNotes(texts, els) {
  if (aiReady && settings.aiVoice !== false && openDay) {
    aiRead(texts, els);
    return;
  }
  // the system voice also reads the spelling-corrected notes when the AI made them
  const d = openDay,
    say = texts.map(t => {
      const i = d && d.fragments && d.spoken ? d.fragments.indexOf(t) : -1;
      return i >= 0 && d.spoken[i] ? d.spoken[i] : t;
    });
  speakLocal(say, els);
}
async function reanalyze() {
  if (!openDay || !aiReady) return;
  const d = openDay;
  toast('ИИ пересматривает день…', 4000);
  const notes = d.notes && d.notes.length ? d.notes : [d.text];
  const ai = await aiAnalyze({
    notes,
    photos: d.photos || [],
    song: d.audio ? { name: d.audio.name || 'песня по ссылке', tempo: d.mood.tempo } : null,
    date: d.date,
  });
  const hit = afterAiCall();
  if (!ai) {
    if (!hit) toast('ИИ не ответил, попробуй позже');
    return;
  }
  applyAi(d.mood, ai, !!(d.audio && d.audio.blob));
  if (ai.title) d.title = ai.title;
  d.fragments = ai.fragments || d.fragments || null;
  d.spoken = ai.fragments ? ai.spoken : d.spoken || null;
  d.weather = ai.weather;
  d.voiceStyle = ai.voice || d.voiceStyle;
  d.ai = true;
  d.tts = {};
  await putDay(d);
  await refreshKeep();
  openDay = days.find(x => x.id === d.id) || d;
  buildItems(openDay);
  weather.set(openDay.weather ?? detectWeather(openDay.text));
  paintDayTrack(toned(openDay));
  dayMenu();
  toast('Готово: ИИ обновил цвета, название и листки');
}
function speakLocal(texts, els) {
  if (!canSpeak) {
    toast('Браузер не умеет читать вслух');
    return;
  }
  if (!ruVoice()) toast('Русский голос не найден, читаю тем, что есть', 3200);
  const all = document.querySelectorAll('.note.speaking');
  all.forEach(n => n.classList.remove('speaking'));
  speak(texts, openDay ? openDay.mood.kind : 'calm', {
    onstart: () => {
      snd.setDuck(songEl ? 0.12 : 0.3);
      if (songEl) songEl.baseVol = 0.12;
    },
    onpart: k => {
      clearSpeaking();
      els[k] && els[k].classList.add('speaking');
    },
    onend: () => {
      clearSpeaking();
      snd.setDuck(songEl ? 0.2 : 1);
      if (songEl) songEl.baseVol = Math.max(0.3, settings.volume);
    },
  });
}
async function savePostcard() {
  if (!openDay) return;
  toast('Рисую открытку…', 2000);
  try {
    const blob = await makePostcard(openDay, {
      title: titleOf(openDay),
      moodName: moodInfo(openDay.mood.kind).name,
      paper: settings.theme === 'paper',
      songName: songNameOf(openDay),
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${titleOf(openDay).replace(/[\\/:*?"<>|]/g, '')} — ${openDay.date}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Открытка сохранена');
  } catch (err) {
    console.error(err);
    toast('Не получилось нарисовать открытку');
  }
}
function tickPlayer() {
  const b = snd.bands(player.bars.length);
  player.bars.forEach((e, i) => {
    e.style.transform = `scaleY(${Math.max(0.07, Math.min(1, Math.pow(b[i], 1.6) * (0.85 + (i / player.bars.length) * 0.9))).toFixed(3)})`;
  });
  const r = songRange();
  if (r) player.prog.style.width = (Math.max(0, Math.min(1, (songEl.currentTime - r.a) / Math.max(1, r.b - r.a))) * 100).toFixed(2) + '%';
  else player.prog.style.width = ((((performance.now() / 1000) % 60) / 60) * 100).toFixed(2) + '%';
}
/* Seeking: drag or tap the progress line of the day's player. For a song from a link, a button then offers
   to start this day's song from the chosen moment next time. */
const fmtTime = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
// the seek line covers the part cut in the form, or else the whole song (seeking then moves the part)
function songRange() {
  if (!songEl || !songEl.duration || !isFinite(songEl.duration)) return null;
  const s = songEl.seg;
  return s && s.fixed ? { a: s.a, b: s.b } : { a: 0, b: songEl.duration };
}
/* SongPart: the day's song plays a part of about a minute — from the moment chosen in the form or in the
   day, otherwise from where the first chorus usually comes. It rises softly, dies away softly at the end,
   and after a short silence plays again. A part cut in the form (with its own end) keeps its length. */
const EMBED_QUIET = 0.6,
  SONG_PART_SEC = 50,
  SONG_FADE_IN_SEC = MUSIC_FADE_SEC,
  SONG_FADE_OUT_SEC = 3,
  SONG_GAP_MS = 1500,
  SONG_LEAVE_MS = MUSIC_FADE_SEC * 1000,
  SONG_TICK_MS = 50;
function startSongPart(el, audio) {
  // a song from a link cannot be filtered (it plays in the service's own player): it is only quieter
  el.baseVol = Math.max(0.3, settings.volume) * (el.svc ? EMBED_QUIET : 1) * (audio.gain || 1);
  vol(el, 0);
  el.seg = {
    a: audio.start != null ? audio.start : null,
    b: audio.end || 0,
    fixed: !!audio.end,
  };
  el.placed = false;
  el.gap = false;
  clearInterval(el.fadeTimer);
  el.fadeTimer = setInterval(() => {
    if (songEl !== el) return clearInterval(el.fadeTimer);
    const dur = el.duration,
      s = el.seg;
    if (!dur || !isFinite(dur)) return;
    if (s.a == null) s.a = bestStart(dur);
    if (!s.fixed) s.b = Math.min(dur, s.a + SONG_PART_SEC);
    if (!el.placed) {
      el.placed = true;
      if (Math.abs(el.currentTime - s.a) > 1) el.currentTime = s.a;
    }
    if ((el.paused && !el.ended) || el.gap) return;
    const t = el.currentTime;
    if (t >= s.b - 0.1 || t < s.a - 1.5) {
      // the end of the part: a moment of silence, then from its start again
      el.gap = true;
      vol(el, 0);
      el.pause();
      setTimeout(() => {
        el.gap = false;
        if (songEl !== el || paused) return;
        el.currentTime = s.a;
        el.play();
      }, SONG_GAP_MS);
      return;
    }
    const env = Math.max(0, Math.min(1, (t - s.a) / SONG_FADE_IN_SEC, (s.b - t) / SONG_FADE_OUT_SEC));
    const v = el.baseVol * env;
    if (Math.abs((el.lastVol ?? -1) - v) > 0.004) vol(el, (el.lastVol = v));
  }, SONG_TICK_MS);
}
function setupSeek(pe, d) {
  const bar = pe.querySelector('.prog'),
    info = pe.querySelector('.pinfo');
  bar.classList.add('seek');
  bar.setAttribute('role', 'slider');
  bar.setAttribute('aria-label', 'Перемотка песни');
  let pin = null;
  const showPin = t => {
    if (!pin) {
      pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'pstart';
      info.appendChild(pin);
    }
    pin.textContent = 'начинать с ' + fmtTime(t);
    pin.onclick = async e => {
      e.stopPropagation();
      d.audio.start = Math.round(t);
      await putDay(d);
      pin.remove();
      pin = null;
      toast('Песня этого дня будет начинаться с ' + fmtTime(t));
    };
  };
  const go = e => {
    const r = songRange();
    if (!r) return;
    const box = bar.getBoundingClientRect(),
      f = Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)),
      t = r.a + f * (r.b - r.a);
    if (songEl.seg && !songEl.seg.fixed) songEl.seg.a = t;
    songEl.currentTime = t;
    player.prog.style.width = (f * 100).toFixed(2) + '%';
    if (d.audio && !(songEl.seg && songEl.seg.fixed)) showPin(t);
  };
  bar.onpointerdown = e => {
    e.stopPropagation();
    bar.setPointerCapture(e.pointerId);
    go(e);
    bar.onpointermove = go;
  };
  bar.onpointerup = bar.onpointercancel = () => (bar.onpointermove = null);
  bar.onclick = e => e.stopPropagation();
}
// a song from a link that the site can play (Spotify, SoundCloud)
function songEmbed(d) {
  if (!d || !d.audio || !d.audio.url) return null;
  return embedOf(d.audio.url, d.audio.embed);
}
let embedNag = 0;
function togglePlay() {
  paused = !paused;
  player && player.el.classList.toggle('paused', paused);
  if (songEl) {
    if (paused) songEl.pause();
    else songEl.play().catch(() => {});
  }
  snd.setEnabled(settings.sound && !paused);
}

function stopSong() {
  clearTimeout(embedNag);
  $('embedbox').classList.remove('show');
  if (!songEl) return;
  const el = songEl;
  songEl = null;
  clearInterval(el.fadeTimer);
  const v0 = el.paused ? 0 : vol(el),
    t0 = performance.now(),
    end = () => {
      el.pause();
      if (el.destroy) el.destroy();
    };
  if (!v0 || el.svc === 'spotify') return end();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / SONG_LEAVE_MS);
    vol(el, v0 * (1 - k));
    if (k < 1) setTimeout(step, SONG_TICK_MS);
    else end();
  };
  step();
}
/* DayMedia in the day. While the TV's sound or the cassette plays, the day's own music drops by about
   two thirds (the ambient sky and the song alike), and comes back when they stop. */
let dayMedia = [];
const MEDIA_DUCK = 0.33;
function mediaDuck() {
  const on = dayMedia.some(m => m.loud());
  if (songEl) {
    if (songEl.base0 == null) songEl.base0 = songEl.baseVol;
    songEl.baseVol = songEl.base0 * (on ? MEDIA_DUCK : 1);
  }
  snd.setDuck((songEl ? 0.2 : 1) * (on ? MEDIA_DUCK : 1));
}
function stopDayMedia() {
  dayMedia.forEach(m => m.stop());
  dayMedia = [];
}
/* Knob: a round control turned by dragging up/down (or sideways), the wheel or the arrow keys.
   Its mark points from -135° (0) to +135° (1). get() reads the value, set(v) applies it. */
function knob(b, get, set, label) {
  b.setAttribute('role', 'slider');
  b.setAttribute('aria-label', label);
  b.setAttribute('aria-valuemin', '0');
  b.setAttribute('aria-valuemax', '100');
  const show = () => {
    const v = Math.max(0, Math.min(1, get() || 0));
    b.style.setProperty('--a', -135 + 270 * v + 'deg');
    b.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  };
  const put = v => {
    set(Math.max(0, Math.min(1, v)));
    show();
  };
  let drag = null;
  b.addEventListener('pointerdown', ev => {
    ev.stopPropagation();
    ev.preventDefault();
    b.setPointerCapture(ev.pointerId);
    drag = { x: ev.clientX, y: ev.clientY, v: get() || 0 };
    b.classList.add('turn');
  });
  b.addEventListener('pointermove', ev => {
    if (!drag) return;
    ev.stopPropagation();
    put(drag.v + (ev.clientX - drag.x - (ev.clientY - drag.y)) / 160);
  });
  const end = ev => {
    if (!drag) return;
    ev.stopPropagation();
    drag = null;
    b.classList.remove('turn');
  };
  b.addEventListener('pointerup', end);
  b.addEventListener('pointercancel', end);
  b.addEventListener(
    'wheel',
    ev => {
      ev.stopPropagation();
      ev.preventDefault();
      put((get() || 0) - Math.sign(ev.deltaY) * 0.05);
    },
    { passive: false },
  );
  b.addEventListener('keydown', ev => {
    const k = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 }[ev.key];
    if (k == null) return;
    ev.stopPropagation();
    ev.preventDefault();
    put((get() || 0) + k);
  });
  b.onclick = ev => ev.stopPropagation();
  show();
  return show;
}
const ICON_PP = '<svg class="i-pause" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>';
/* RetroTV: the video plays on a loop, silent at first. Tapping the screen pauses or resumes it; the
   upper knob scrubs through the video, the lower knob is its volume (turned to zero it is silent). */
function tvItem(v, d) {
  const e = el(
    'tv',
    `<div class="tv-body"><div class="tv-scr"><video muted loop playsinline preload="metadata"></video><i class="tv-scan"></i><button type="button" class="tv-pp" aria-label="Пауза">${ICON_PP}</button></div><div class="tv-side"><button type="button" class="knob k-time"></button><small>время</small><button type="button" class="knob k-vol"></button><small>звук</small><i class="grill"></i></div><i class="tv-leg l"></i><i class="tv-leg r"></i></div>`,
  );
  const vd = e.querySelector('video'),
    pp = e.querySelector('.tv-pp'),
    url = URL.createObjectURL(v.blob);
  vd.src = url;
  vd.volume = 0;
  vd.setAttribute('aria-label', 'Видео дня, ' + shortDate(d.date));
  const state = () => {
    e.classList.toggle('paused', vd.paused);
    e.classList.toggle('loud', !vd.muted && !vd.paused);
    pp.setAttribute('aria-label', vd.paused ? 'Продолжить видео' : 'Пауза');
    mediaDuck();
  };
  const toggle = ev => {
    ev.stopPropagation();
    if (vd.paused) vd.play().catch(() => {});
    else vd.pause();
  };
  pp.onclick = toggle;
  e.querySelector('.tv-scr').onclick = toggle;
  vd.addEventListener('play', state);
  vd.addEventListener('pause', state);
  const showTime = knob(
    e.querySelector('.k-time'),
    () => (vd.duration ? vd.currentTime / vd.duration : 0),
    k => vd.duration && (vd.currentTime = k * vd.duration * 0.999),
    'Время видео',
  );
  knob(
    e.querySelector('.k-vol'),
    () => (vd.muted ? 0 : vd.volume),
    k => {
      vd.volume = k;
      vd.muted = k < 0.02 || !settings.sound;
      state();
    },
    'Громкость видео',
  );
  vd.addEventListener('timeupdate', showTime);
  vd.play().catch(() => {});
  dayMedia.push({
    loud: () => !vd.muted && !vd.paused && vd.volume > 0,
    stop: () => {
      vd.pause();
      vd.removeAttribute('src');
      vd.load();
      URL.revokeObjectURL(url);
    },
  });
  return e;
}
/* CassettePlayer: a pocket tape player in 3D. The cassette floats above it; ▶ drops it into the window
   and plays it on a loop, ‖ pauses, ⏏ takes it out. The player tilts toward the pointer. */
function tapeItem(v, d) {
  const name = (v.name || 'Звук дня').replace(/\.[a-z0-9]+$/i, '').slice(0, 28);
  const e = el(
    'deck',
    `<div class="wm"><div class="wm-body"><div class="wm-top"><span class="wm-brand">звук дня</span><span class="wm-led"></span></div><div class="wm-win"><div class="cassette"><div class="c-label"></div><div class="c-win"><i class="reel"></i><i class="c-tape"></i><i class="reel"></i></div></div><i class="wm-glass"></i></div><div class="wm-keys"><button type="button" data-k="play" aria-label="Играть"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg></button><button type="button" data-k="pause" aria-label="Пауза"><svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg></button><button type="button" data-k="eject" aria-label="Достать кассету"><svg viewBox="0 0 24 24"><path d="M5 14l7-8 7 8zM5 18.5h14"/></svg></button></div><div class="wm-foot"><span class="wm-count">000</span><span class="wm-name"></span></div></div><i class="wm-side"></i></div>`,
  );
  e.querySelector('.c-label').textContent = name;
  e.querySelector('.wm-name').textContent = name;
  const tc = toned(d);
  e.style.setProperty('--c1', tc[0]);
  e.style.setProperty('--c2', tc[1] || tc[0]);
  const url = URL.createObjectURL(v.blob),
    a = new Audio(url),
    cnt = e.querySelector('.wm-count');
  a.loop = true;
  let wait = 0;
  const state = () => {
    e.classList.toggle('play', !a.paused);
    mediaDuck();
  };
  a.addEventListener('play', state);
  a.addEventListener('pause', state);
  a.addEventListener('timeupdate', () => (cnt.textContent = String(Math.floor(a.currentTime) % 1000).padStart(3, '0')));
  const play = () => {
    a.volume = Math.max(0.3, settings.volume);
    a.muted = !settings.sound;
    a.play().catch(() => {});
  };
  e.querySelectorAll('.wm-keys button').forEach(b => {
    b.onclick = ev => {
      ev.stopPropagation();
      b.classList.add('down');
      setTimeout(() => b.classList.remove('down'), 180);
      clearTimeout(wait);
      const k = b.dataset.k;
      if (k === 'play') {
        if (e.classList.contains('in')) play();
        else {
          // the cassette drops into the window first, then the tape starts
          e.classList.add('in');
          wait = setTimeout(play, 700);
        }
      } else if (k === 'pause') a.pause();
      else {
        a.pause();
        e.classList.remove('in');
      }
    };
  });
  // a gentle tilt toward the pointer gives the player its depth
  const wm = e.querySelector('.wm');
  e.addEventListener('pointermove', ev => {
    const r = wm.getBoundingClientRect(),
      x = (ev.clientX - r.left) / r.width - 0.5,
      y = (ev.clientY - r.top) / r.height - 0.5;
    wm.style.setProperty('--ry', (x * 18).toFixed(1) + 'deg');
    wm.style.setProperty('--rx', (12 - y * 14).toFixed(1) + 'deg');
  });
  e.addEventListener('pointerleave', () => {
    wm.style.removeProperty('--ry');
    wm.style.removeProperty('--rx');
  });
  dayMedia.push({
    loud: () => !a.paused,
    stop: () => {
      clearTimeout(wait);
      a.pause();
      URL.revokeObjectURL(url);
    },
  });
  return e;
}
function openDayView(d) {
  // entry ritual: the sphere falls as a drop and blooms into the day's paint while the camera dives
  // the sphere itself falls as the drop; the camera dives in when it touches the water
  const ritual = !settings.reduce && !perf().noRitual && engine.screenOf(d.id);
  if (ritual) {
    const p = engine.screenOf(d.id);
    playRitual({ ...p, colors: toned(d), paper: settings.theme === 'paper', track: () => engine.dropScreen() });
    engine.drop(d.id, ritualTarget(p.r, p.y), RITUAL_FALL_SEC).then(() => openDay === d && engine.open(d));
  }
  openDay = d;
  paused = false;
  hint(HINT.day);
  closePanels();
  $('tagbar').classList.add('hidden');
  buildItems(d);
  if (!ritual) engine.open(d);
  setDock('day');
  paintDayTrack(toned(d));
  $('track').classList.add('inday');
  weather.set(d.weather ?? detectWeather(d.text));
  hideMemo();
  stopSong();
  stopBgmEl();
  snd.setDuck(1);
  snd.setEnabled(settings.sound);
  if (d.audio && d.audio.blob) {
    songEl = new Audio(URL.createObjectURL(d.audio.blob));
    startSongPart(songEl, d.audio);
    songEl.muted = !settings.sound;
    snd.attach(songEl, fxOf(d.audio));
    playMedia(songEl);
    if (!settings.sound) toast('Звук выключен — нажми на динамик внизу, чтобы услышать песню дня', 4200);
    snd.setDuck(0.2);
  } else if (usesPreview(d)) {
    playPreview(d);
  } else if ((songEmbed(d) || {}).svc === 'spotify' && d.audio.preview == null) {
    // an older Spotify day: look for Apple's preview of it once (while the drop falls), then play
    findPreview(d).then(() => {
      if (openDay !== d || songEl) return;
      if (usesPreview(d)) playPreview(d);
      else playEmbed(d);
      if (player) songNote(player.el, d);
    });
  } else if (songEmbed(d)) playEmbed(d);
  if (snd.ctx) {
    const t = d.mood.tempo;
    snd.play(d.mood.kind, { bpm: t ? Math.max(44, Math.min(120, t > 125 ? t / 2 : t)) : undefined, underwater: true });
  }
}
// Apple Music's 30 s preview of a Spotify song: an ordinary audio file, so it goes through the site's
// sound (under water, echo, 3 s fades), from its start and round again
function playPreview(d) {
  songEl = new Audio();
  songEl.crossOrigin = 'anonymous';
  songEl.src = d.audio.preview;
  const c = d.audio.cut;
  startSongPart(songEl, { start: c ? c.a : 0, end: c ? c.b : 0, gain: d.audio.gain });
  songEl.muted = !settings.sound;
  snd.attach(songEl, fxOf(d.audio));
  playMedia(songEl);
  songEl.addEventListener('error', () => {
    // the preview went away: Spotify's own player instead
    if (!songEl || songEl.src !== d.audio.preview || openDay !== d) return;
    const dead = songEl;
    songEl = null;
    dead.pause();
    clearInterval(dead.fadeTimer);
    d.audio.preview = '';
    putDay(d).catch(() => {});
    if (player) songNote(player.el, d);
    playEmbed(d);
  });
  if (!settings.sound) toast('Звук выключен — нажми на динамик внизу, чтобы услышать песню дня', 4200);
  snd.setDuck(0.2);
}
// the song's effect chosen in the form: under water (the default), soft, or none
const fxOf = a => ({ underwater: !a || !a.fx || a.fx === 'underwater', soft: !!a && a.fx === 'soft' });
const PREVIEW_WAIT_MS = 5000;
async function findPreview(d) {
  const j = await Promise.race([aiCover(d.audio.url).catch(() => null), new Promise(r => setTimeout(() => r(undefined), PREVIEW_WAIT_MS))]);
  if (j === undefined) return; // too slow this time: ask again next visit
  d.audio.preview = (j && j.preview) || '';
  await putDay(d).catch(() => {});
}
function playEmbed(d) {
  {
    // a song from Spotify / SoundCloud plays in the service's own player, from the chosen or the best moment
    const el = (songEl = new EmbedSong($('embedbox'), songEmbed(d), {
      start: d.audio.start != null ? d.audio.start : null,
      onState: s => {
        if (s !== songEl) return;
        if (!s.paused || s.failed) $('embedbox').classList.remove('show');
        if (s.failed) toast('Песня по ссылке не загрузилась — проверь интернет');
      },
    }));
    startSongPart(el, d.audio);
    el.muted = !settings.sound;
    if (settings.sound) el.play();
    else toast('Звук выключен — нажми на динамик внизу, чтобы услышать песню дня', 4200);
    snd.setDuck(0.2);
    // some browsers only let a player start after a tap inside it: then show it so it can be tapped
    embedNag = setTimeout(() => {
      if (songEl === el && el.paused && !el.failed && !paused && settings.sound && openDay === d)
        $('embedbox').classList.add('show');
    }, 6000);
  }
}
function backToArchive() {
  if (!openDay) return;
  stopDayMedia();
  stopSong();
  paused = false;
  snd.setDuck(1);
  snd.setEnabled(settings.sound);
  openDay = null;
  itemZ = [];
  engine.close();
  stopVoice();
  stopAiVoice();
  weather.off();
  $('track').classList.remove('inday');
  renderRibbon();
  playBgm();
  setTimeout(() => {
    if (!openDay) {
      engine.setItems([]);
      $('world').innerHTML = '';
      player = null;
    }
  }, 1500);
}

/* ---------- "a year ago today" ---------- */
function hideMemo() {
  $('memo').classList.remove('show');
  clearTimeout(hideMemo.t);
}
function showMemo() {
  const today = isoLocal(new Date()),
    md = today.slice(5);
  const found = days
    .filter(d => d.date.slice(5) === md && d.date.slice(0, 4) < today.slice(0, 4))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!found) return;
  const yrs = +today.slice(0, 4) - +found.date.slice(0, 4);
  const m = $('memo');
  m.innerHTML = '';
  m.style.setProperty('--c1', toned(found)[0]);
  m.style.setProperty('--c2', toned(found)[1] || toned(found)[0]);
  m.innerHTML = `<i class="mdot"></i><div class="mt"><div class="mk">${yrs === 1 ? 'Год назад' : yrs + ' ' + (yrs < 5 ? 'года' : 'лет') + ' назад'} в этот день</div><div class="mn"></div></div><button class="pill" type="button">Вернуться</button><button class="mx" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg></button>`;
  m.querySelector('.mn').textContent = titleOf(found);
  m.querySelector('.pill').onclick = () => {
    hideMemo();
    showMonthOf(found);
    const i = engine.days.findIndex(x => x.id === found.id);
    if (i >= 0) engine.goTo(i);
    setTimeout(() => openDayView(found), 700);
  };
  m.querySelector('.mx').onclick = hideMemo;
  m.classList.add('show');
  hideMemo.t = setTimeout(hideMemo, MEMO_VISIBLE_MS);
}

/* ---------- wiring ---------- */
$('enter').onclick = () => {
  snd.init();
  entered = true;
  document.body.classList.add('entered'); // the controls guide appears with the archive
  snd.setVolume(settings.volume);
  snd.setEnabled(settings.sound);
  playBgm();
  $('intro').classList.add('out');
  setTimeout(() => $('intro').remove(), 1700);
  $('dock').classList.remove('hidden');
  requestAnimationFrame(() => {
    ribW = $('rib').offsetWidth;
    liquid($('thumb'), { scale: 90, blur: 0.2, sat: 1.7, bright: 1.1, bezel: 17 });
    document
      .querySelectorAll('#dock .glass')
      .forEach(e => liquid(e, { scale: 30, blur: 8, sat: 2.1, bright: 1.08, bezel: 18 }));
    // PaletteMenu: the container is only a layout box; each round button (.pb.glass) is its own glass.
    // Giving the container a backdrop filter drew a blurred rectangle behind the buttons on bright days.
    document
      .querySelectorAll('.sheet')
      .forEach(e => liquid(e, { scale: 26, blur: 14, sat: 2.1, bright: 1.08, bezel: 22 }));
    ['form', 'dlg-form'].forEach(id => liquid($(id), { scale: 26, blur: 26, bezel: 26 }));
    ['toast', 'memo', 'busy'].forEach(id => liquid($(id), { scale: 32, blur: 12, sat: 2.1, bright: 1.08, bezel: 18 }));
  });
  $('empty').classList.toggle('hidden', days.length > 0);
  setDock('archive');
  hint(HINT.archive);
  setTimeout(showMemo, MEMO_SHOW_DELAY_MS);
  checkAi();
};
addEventListener('resize', () => {
  ribW = $('rib').offsetWidth;
});
new ResizeObserver(() => {
  ribW = $('rib').offsetWidth;
}).observe($('rib'));
$('b-add').onclick = () => {
  if (openDay) backToArchive();
  else openModal();
};
$('b-snd').onclick = () => {
  settings.sound = !settings.sound;
  applySettings();
};
$('b-menu').onclick = e => {
  e.stopPropagation();
  const m = $('menu'),
    was = m.classList.contains('open');
  closePanels();
  if (!was) {
    clearTimeout(closePanels.t);
    m.classList.remove('gone');
    void m.offsetWidth;
    m.classList.add('open');
    $('b-menu').setAttribute('aria-expanded', 'true');
  }
};
addEventListener('pointerdown', e => {
  if (!e.target.closest('.menu,.sheet,#b-menu,.modal,.tagbar')) closePanels();
});
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('dlg').classList.contains('hidden')) $('dlg-cancel').click();
  else if (!$('modal').classList.contains('hidden')) closeModal();
  else if (document.querySelector('.menu.open,.sheet.open')) closePanels();
  else if (engine.focused) engine.unfocus();
  else if (openDay) backToArchive();
  else exitMonth();
});
const rib = $('rib');
const ribSet = e => {
  const r = rib.getBoundingClientRect(),
    tw = $('thumb').offsetWidth,
    f = Math.max(0, Math.min(1, (e.clientX - r.left - tw / 2) / Math.max(1, r.width - tw)));
  if (engine.state === 'day') {
    engine.unfocus();
    engine.setDepth(f);
  } else engine.setScroll01(f);
};
rib.addEventListener('pointerdown', e => {
  rd = true;
  rib.classList.add('drag');
  rib.setPointerCapture(e.pointerId);
  ribSet(e);
});
rib.addEventListener('pointermove', e => {
  if (rd) ribSet(e);
});
const ribUp = () => {
  rd = false;
  rib.classList.remove('drag');
};
rib.addEventListener('pointerup', ribUp);
rib.addEventListener('pointercancel', ribUp);

const bind = (id, key) => {
  const e = $(id);
  setRangeFill(e);
  e.oninput = () => {
    settings[key] = e.type === 'checkbox' ? e.checked : +e.value;
    if (e.type === 'range') setRangeFill(e);
    applySettings();
  };
};
$('s-speed').value = settings.speed;
$('s-intensity').value = settings.intensity;
$('s-density').value = settings.density;
$('s-volume').value = settings.volume;
$('s-reduce').checked = settings.reduce;
['s-speed', 's-intensity', 's-density', 's-volume'].forEach((id, i) =>
  bind(id, ['speed', 'intensity', 'density', 'volume'][i]),
);
$('s-reduce').onchange = () => {
  settings.reduce = $('s-reduce').checked;
  applySettings();
};
$('s-ai').checked = settings.ai !== false;
$('s-aivoice').checked = settings.aiVoice !== false;
$('s-ai').onchange = () => {
  settings.ai = $('s-ai').checked;
  saveSettings(settings);
};
$('s-aivoice').onchange = () => {
  settings.aiVoice = $('s-aivoice').checked;
  saveSettings(settings);
};
renderAiStatus();
document.querySelectorAll('#s-ui button').forEach(b => (b.onclick = () => setTheme(b.dataset.v)));
// the interface theme (dark / light): panels, buttons and lists change at once, the sky stays as it is
function setTheme(v) {
  if (v === settings.ui) return;
  settings.ui = v;
  applySettings();
  if (!openDay) archiveMenu();
}
/* Offline and install: the service worker keeps the site's files, the days already live in IndexedDB.
   Off on localhost, so development always sees fresh files. */
if ('serviceWorker' in navigator && location.hostname !== 'localhost')
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
let installPrompt = null;
addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  $('s-install').classList.remove('hidden');
});
$('s-install').onclick = async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => null);
  installPrompt = null;
  $('s-install').classList.add('hidden');
};
addEventListener('appinstalled', () => toast('Оттенок дня теперь на главном экране'));
addEventListener('offline', () => toast('Нет интернета — дневник работает, ИИ вернётся вместе с сетью'));

/* Performance options (Settings → «Оптимизация»): each is a switch, saved with the settings.
   Every option makes the site both smoother and lighter; none of them caps the frame rate. */
const PERF = [
  ['lowRes', 'Меньше разрешение фона', 'пятна рисуются в 60% от экрана вместо 90%'],
  ['noSky', 'Без звёзд и нитей', 'фон без звёздного неба и связей между днями'],
  ['noWeather', 'Без погоды', 'дождь, снег и ветер внутри дня выключены'],
  ['liteGlass', 'Простые панели', 'панели без размытия фона под ними'],
  ['noRitual', 'Без ритуала и капель', 'вход в день и удаление без особых анимаций'],
];
const perf = () => settings.perf || (settings.perf = {});
function applyPerf() {
  const p = perf();
  engine.setPerf({ resMax: p.lowRes ? 0.6 : 0.9 });
  document.documentElement.classList.toggle('lite-glass', !!p.liteGlass);
  if (p.noSky) {
    lg.clearRect(0, 0, innerWidth, innerHeight);
    sky.g.clearRect(0, 0, sky.cv.width, sky.cv.height);
  }
  if (p.noWeather) weather.off();
  const on = PERF.filter(([k]) => p[k]).length;
  $('s-perf-n').textContent = on ? `включено ${on}` : '';
}
function renderPerf() {
  const box = $('perf-list');
  box.innerHTML = '';
  for (const [k, name, sub] of PERF) {
    const l = document.createElement('label');
    l.className = 'gr sw perf-row';
    l.innerHTML =
      '<span class="tx"><b></b><small></small></span><input type="checkbox" role="switch" /><span class="switch"></span>';
    l.querySelector('b').textContent = name;
    l.querySelector('small').textContent = sub;
    const inp = l.querySelector('input');
    inp.checked = !!perf()[k];
    inp.onchange = () => {
      perf()[k] = inp.checked;
      saveSettings(settings);
      applyPerf();
    };
    box.appendChild(l);
  }
}
$('s-perf').onclick = () => {
  renderPerf();
  toggleSheet('perf');
};
$('perf-back').onclick = () => toggleSheet('settings');
$('perf-all').onclick = () => {
  for (const [k] of PERF) perf()[k] = true;
  saveSettings(settings);
  applyPerf();
  renderPerf();
  toast('Включена максимальная экономия');
};

$('s-ailim').onclick = () => {
  toggleSheet('ailim');
  refreshUsage();
};
$('ailim-back').onclick = () => toggleSheet('settings');
$('s-demo').onclick = async () => {
  for (const d of buildDemo()) await putDay(d);
  await reload();
  toast('Демо-дни вернулись');
};
$('s-clear').onclick = async () => {
  const ok = await dialog({ title: 'Удалить все дни, включая твои?', input: false, ok: 'Удалить' });
  if (!ok) return;
  await clearDays();
  settings.demoSeeded = true;
  saveSettings(settings);
  await reload();
};

/* ---------- new day form ---------- */
const MN = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];
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
const pad = v => String(v).padStart(2, '0');
const isoLocal = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
const XI = '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';
let photoFiles = [],
  calY = 2026,
  calM = 0;
function setDate(iso) {
  $('f-date').value = iso;
  const [y, m, d] = iso.split('-');
  $('f-datetxt').textContent = `${+d} ${MNG[+m - 1]} ${y}`;
}
function renderCal() {
  const today = isoLocal(new Date()),
    cur = $('f-date').value;
  const startDow = (new Date(calY, calM, 1).getDay() + 6) % 7,
    dim = new Date(calY, calM + 1, 0).getDate();
  let g =
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(w => `<span class="wd">${w}</span>`).join('') +
    '<span></span>'.repeat(startDow);
  for (let d = 1; d <= dim; d++) {
    const iso = `${calY}-${pad(calM + 1)}-${pad(d)}`;
    g += `<button type="button" data-d="${iso}" class="${iso === cur ? 'on' : ''} ${iso === today ? 'today' : ''}" ${iso > today ? 'disabled' : ''}>${d}</button>`;
  }
  const chev = dir => `<svg viewBox="0 0 24 24"><path d="${dir < 0 ? 'M14.5 6 8.5 12l6 6' : 'M9.5 6l6 6-6 6'}"/></svg>`;
  $('cal').innerHTML =
    `<div><div class="cal-in"><div class="cal-h"><button type="button" data-n="-1" aria-label="Предыдущий месяц">${chev(-1)}</button><b>${MN[calM]} ${calY}</b><button type="button" data-n="1" aria-label="Следующий месяц">${chev(1)}</button></div><div class="cal-g">${g}</div></div></div>`;
  $('cal')
    .querySelectorAll('[data-n]')
    .forEach(
      b =>
        (b.onclick = () => {
          calM += +b.dataset.n;
          if (calM < 0) {
            calM = 11;
            calY--;
          }
          if (calM > 11) {
            calM = 0;
            calY++;
          }
          renderCal();
        }),
    );
  $('cal')
    .querySelectorAll('[data-d]')
    .forEach(
      b =>
        (b.onclick = () => {
          setDate(b.dataset.d);
          renderCal();
          setTimeout(() => toggleCal(false), 220);
        }),
    );
}
function toggleCal(open) {
  if (open) {
    const [y, m] = $('f-date').value.split('-');
    calY = +y;
    calM = +m - 1;
    renderCal();
  }
  $('cal').classList.toggle('open', open);
  $('f-datebtn').classList.toggle('open', open);
}
$('f-datebtn').onclick = () => toggleCal(!$('cal').classList.contains('open'));
function addNote(v = '') {
  const box = $('notes'),
    first = !box.children.length;
  const w = document.createElement('div');
  w.className = 'note-in';
  const ta = document.createElement('textarea');
  ta.rows = first ? 4 : 3;
  ta.value = v;
  ta.placeholder = first
    ? 'Гуляли по парку, всё в жёлтых листьях, было холодно, но мы пили какао.'
    : 'Ещё одна мысль: деталь, звук, запах, кто был рядом…';
  w.appendChild(ta);
  if (!first) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rm';
    b.innerHTML = XI;
    b.setAttribute('aria-label', 'Убрать заметку');
    b.onclick = () => w.remove();
    w.appendChild(b);
  }
  box.appendChild(w);
  return ta;
}
/* Dictation: record a note by voice, the proxy turns it into text (Whisper on Cloudflare Workers AI).
   The text goes into the first empty note, or a new one. Recording stops by itself after DICT_MAX_SEC. */
const DICT_MAX_SEC = 120;
// the voice check works on the raw microphone level (RMS, 0–1) measured every MIC_TICK_MS
const MIC_TICK_MS = 100,
  MIC_VOICE = 0.0015, // quieter than this is no voice, only the microphone's own hiss
  MIC_OVER_FLOOR = 2.2, // a voice stands out above the steady background (hiss, a fan) at least so many times
  MIC_VOICE_TICKS = 4, // so many loud moments make a recording worth sending
  MIC_HINT_SEC = 3, // after so long without a voice the button says so
  MIC_TARGET = 0.07, // a quiet voice is raised to about this level
  MIC_MAX_GAIN = 8;
let rec = null;
// the site's own music must not get into the recording
function quietForMic(on) {
  snd.setEnabled(!on && settings.sound && !paused);
  for (const el of [bgmEl, songEl]) if (el) el.muted = on || !settings.sound;
  if (on) stopCutPreview();
}
/* MicInput: raises a quiet voice before it is recorded and reports its level.
   Returns null where the browser cannot do it; then the microphone is recorded as it is, unchecked. */
async function micInput(stream) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  let ctx;
  try {
    ctx = new AC();
    // a suspended context would record silence, and resume() may never settle
    if (ctx.state !== 'running') await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 600))]);
    if (ctx.state !== 'running') throw new Error('audio is suspended');
    const src = ctx.createMediaStreamSource(stream),
      an = ctx.createAnalyser(),
      gain = ctx.createGain(),
      lim = ctx.createDynamicsCompressor(),
      out = ctx.createMediaStreamDestination();
    an.fftSize = 2048;
    lim.threshold.value = -6;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    src.connect(an);
    src.connect(gain).connect(lim).connect(out);
    const buf = new Float32Array(an.fftSize);
    const levels = [];
    // the background is the quietest tenth of what was heard so far: there are pauses between words
    const bar = () => {
      const q = [...levels].sort((a, b) => a - b)[Math.floor(levels.length / 10)] || 0;
      return Math.max(MIC_VOICE, q * MIC_OVER_FLOOR);
    };
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      levels.push(rms);
      const voice = rms >= bar();
      if (voice) {
        gain.gain.setTargetAtTime(Math.max(1, Math.min(MIC_MAX_GAIN, MIC_TARGET / rms)), ctx.currentTime, 0.3);
      }
      // the bar is logarithmic, like hearing: -60 dB is empty, -12 dB is full
      const db = 20 * Math.log10(rms + 1e-6);
      const i = $('f-level').firstElementChild;
      i.style.width = Math.max(0, Math.min(100, ((db + 60) / 48) * 100)).toFixed(0) + '%';
      i.style.background = voice ? 'var(--c-ok)' : 'var(--c-warn)';
    };
    const timer = setInterval(tick, MIC_TICK_MS);
    return {
      stream: out.stream,
      heard: () => {
        const b = bar();
        return levels.filter(v => v >= b).length;
      },
      close: () => {
        clearInterval(timer);
        ctx.close().catch(() => {});
      },
    };
  } catch (err) {
    console.warn('microphone level is not available', err);
    if (ctx) ctx.close().catch(() => {});
    return null;
  }
}
function canDictate() {
  return !!(navigator.mediaDevices && window.MediaRecorder && aiReady);
}
function micUi(state, sec = 0, deaf = false) {
  const b = $('f-mic');
  $('f-level').classList.toggle('hidden', !(state === 'rec' && rec && rec.input));
  b.classList.toggle('rec', state === 'rec');
  b.classList.toggle('busy', state === 'busy');
  b.setAttribute('aria-pressed', String(state === 'rec'));
  $('f-mictxt').textContent =
    state === 'rec' ? `● ${mmss(sec)} · ${deaf ? 'не слышу голос' : 'нажми, чтобы закончить'}` : state === 'busy' ? 'Расшифровываю…' : 'Надиктовать';
}
let micOpening = false;
async function startDictation() {
  if (micOpening) return;
  micOpening = true;
  let stream;
  try {
    // the browser's noise suppression can swallow a quiet voice, and its own gain raises silence to the level
    // of a voice: both are off, micInput() raises only what stands out above the background
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
  } catch {
    micOpening = false;
    toast('Нет доступа к микрофону — разреши его в браузере');
    return;
  }
  const type =
    ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  quietForMic(true);
  const input = await micInput(stream);
  let mr;
  try {
    mr = new MediaRecorder(input ? input.stream : stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
  } catch {
    stream.getTracks().forEach(t => t.stop());
    if (input) input.close();
    quietForMic(false);
    micOpening = false;
    toast('Этот браузер не умеет записывать голос');
    return;
  }
  micOpening = false;
  const parts = [],
    t0 = performance.now();
  rec = { mr, stream, timer: 0, input };
  mr.ondataavailable = e => e.data.size && parts.push(e.data);
  mr.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    clearInterval(rec && rec.timer);
    rec = null;
    if (input) input.close();
    quietForMic(false);
    const blob = new Blob(parts, { type: mr.mimeType || type || 'audio/webm' });
    // nothing was said: do not spend a dictation (and do not let the model invent a phrase)
    if (input && input.heard() < MIC_VOICE_TICKS) {
      micUi('idle');
      toast('Не слышу голос — проверь, тот ли микрофон выбран в браузере', 4200);
      return;
    }
    if (blob.size < 2000) return micUi('idle');
    micUi('busy');
    const text = await aiTranscribe(blob);
    const hit = afterAiCall();
    micUi('idle');
    if (!text) {
      if (!hit) toast(text === '' ? 'Не расслышал, скажи ещё раз' : 'Не получилось расшифровать, попробуй ещё раз');
      return;
    }
    const empty = [...$('notes').querySelectorAll('textarea')].find(t => !t.value.trim());
    const ta = empty || addNote();
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus({ preventScroll: false });
  };
  mr.start(1000);
  micUi('rec', 0);
  rec.timer = setInterval(() => {
    const sec = (performance.now() - t0) / 1000;
    if (sec >= DICT_MAX_SEC) stopDictation();
    else micUi('rec', sec, !!input && sec >= MIC_HINT_SEC && input.heard() < MIC_VOICE_TICKS);
  }, 250);
}
function stopDictation() {
  if (rec && rec.mr.state !== 'inactive') rec.mr.stop();
}
$('f-mic').onclick = () => (rec ? stopDictation() : !$('f-mic').classList.contains('busy') && startDictation());

$('f-addnote').onclick = () => {
  if ($('notes').children.length < 6) addNote().focus();
};
/* Preview of a chosen photo: decoded off the main thread and shrunk once to 3x the 72 px tile
   (sharp even on 3x screens), instead of showing a 12-megapixel original in a tiny box. */
const THUMB_PX = 72 * 3;
async function thumbOf(file) {
  try {
    return URL.createObjectURL(await shrinkPhoto(file, { size: THUMB_PX, by: 'short', quality: 0.92, as: 'blob' }));
  } catch {
    return URL.createObjectURL(file);
  }
}
/* ---------- song cover picker (new-day sheet): record preview + tabs Фото / Ссылка / Готовые / Своя ----------
   The choice is kept as { type: 'photo', i } | { type: 'link' } | { type: 'gen', style } | { type: 'own' }.
   Ready-made covers are painted from the day's own colours once the day is analysed. */
const COVER_PX = 600; // side of a stored cover
const GEN_STYLES = [
  ['paint', 'краска'],
  ['stripes', 'полосы'],
  ['sunset', 'закат'],
];
const PREVIEW_COLORS = ['#ffb36b', '#ff7aa8', '#6fd3e8'];
let cover = { pick: null, tab: 'photo', link: null, own: null, colors: PREVIEW_COLORS, linkFor: '' };
function paintCover(style, colors, px = COVER_PX) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d'),
    [a, b, d] = [colors[0], colors[1] || colors[0], colors[2] || colors[0]];
  if (style === 'stripes') {
    g.fillStyle = a;
    g.fillRect(0, 0, px, px);
    g.translate(px / 2, px / 2);
    g.rotate(-Math.PI / 4);
    const w = px / 7;
    for (let i = -6; i < 6; i++) {
      g.fillStyle = [a, b, d][(i + 6) % 3];
      g.fillRect(i * w, -px, w, px * 2);
    }
  } else if (style === 'sunset') {
    const gr = g.createLinearGradient(0, 0, 0, px);
    gr.addColorStop(0, a);
    gr.addColorStop(0.55, b);
    gr.addColorStop(1, d);
    g.fillStyle = gr;
    g.fillRect(0, 0, px, px);
    g.globalAlpha = 0.85;
    g.fillStyle = '#fff6e4';
    g.beginPath();
    g.arc(px * 0.5, px * 0.62, px * 0.2, Math.PI, 0);
    g.fill();
  } else {
    g.fillStyle = d;
    g.fillRect(0, 0, px, px);
    [
      [0.32, 0.36, 0.42, a],
      [0.7, 0.68, 0.38, b],
      [0.62, 0.22, 0.22, d],
    ].forEach(([x, y, r, col]) => {
      const gr = g.createRadialGradient(px * x, px * y, 0, px * x, px * y, px * r);
      gr.addColorStop(0, col);
      gr.addColorStop(0.7, col + 'cc');
      gr.addColorStop(1, col + '00');
      g.fillStyle = gr;
      g.fillRect(0, 0, px, px);
    });
  }
  return c.toDataURL('image/jpeg', 0.9);
}
// what the cover is right now (auto: first photo, else the "paint" cover)
function coverChoice() {
  if (cover.pick) return cover.pick;
  if (photoFiles.length) return { type: 'photo', i: 0 };
  if (cover.link) return { type: 'link' };
  return { type: 'gen', style: 'paint' };
}
async function coverPreviewUrl(ch) {
  if (ch.type === 'photo')
    return photoFiles[ch.i]
      ? await (photoFiles[ch.i]._thumb || (photoFiles[ch.i]._thumb = thumbOf(photoFiles[ch.i])))
      : '';
  if (ch.type === 'link') return cover.link ? cover.link.cover : '';
  if (ch.type === 'own') return cover.own || '';
  if (ch.type === 'lib') return (lib.covers.find(c => c.id === ch.id) || {}).data || '';
  return paintCover(ch.style, cover.colors, 160);
}
async function renderCover() {
  const ch = coverChoice();
  document.querySelectorAll('.cv-tabs button').forEach(b => {
    b.classList.toggle('on', b.dataset.t === cover.tab);
    b.setAttribute('aria-selected', String(b.dataset.t === cover.tab));
  });
  const box = $('cv-tiles');
  box.innerHTML = '';
  const tile = (url, label, choice) => {
    const t = document.createElement('button');
    t.type = 'button';
    t.className = 'cv-t';
    t.setAttribute('aria-label', 'Обложка: ' + label);
    const same = JSON.stringify(choice) === JSON.stringify(ch);
    t.classList.toggle('sel', same);
    if (url) t.style.backgroundImage = `url("${url}")`;
    const s = document.createElement('small');
    s.textContent = label;
    t.appendChild(s);
    t.onclick = () => {
      cover.pick = choice;
      renderCover();
    };
    box.appendChild(t);
    return t;
  };
  const note = text => {
    const p = document.createElement('p');
    p.className = 'fine';
    p.textContent = text;
    box.appendChild(p);
  };
  if (cover.tab === 'photo') {
    if (!photoFiles.length) note('Добавь фото дня выше — любое из них можно сделать обложкой.');
    for (let i = 0; i < photoFiles.length; i++)
      tile(await coverPreviewUrl({ type: 'photo', i }), `фото ${i + 1}`, { type: 'photo', i });
  } else if (cover.tab === 'link') {
    if (cover.link) tile(cover.link.cover, cover.link.title || 'из ссылки', { type: 'link' });
    else note('Вставь ссылку на песню в Spotify, SoundCloud или Apple Music — обложка подтянется сама.');
  } else if (cover.tab === 'gen') {
    for (const [st, name] of GEN_STYLES) tile(paintCover(st, cover.colors, 120), name, { type: 'gen', style: st });
    note('Готовые обложки рисуются в цветах дня, когда он соберётся.');
  } else {
    const add = tile('', cover.own ? 'другая' : 'загрузить', null);
    add.classList.add('add');
    add.textContent = '+';
    add.onclick = () => $('cv-file').click();
    if (cover.own && !lib.covers.some(c => c.data === cover.own)) tile(cover.own, 'своя', { type: 'own' });
    for (const c of lib.covers) {
      const t = tile(c.data, 'из библиотеки', { type: 'lib', id: c.id });
      const x = document.createElement('span');
      x.className = 'cv-x';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', 'Убрать обложку');
      x.innerHTML = XI;
      x.onclick = async ev => {
        ev.stopPropagation();
        await libRemove('covers', c.id);
        if (cover.pick && cover.pick.id === c.id) cover.pick = null;
        renderCover();
      };
      t.appendChild(x);
    }
    if (!lib.covers.length && !cover.own)
      note('Загруженные обложки сохраняются здесь — их можно взять для любого дня.');
  }
  const url = await coverPreviewUrl(ch);
  $('cv-img').style.backgroundImage = url ? `url("${url}")` : '';
}
document
  .querySelectorAll('.cv-tabs button')
  .forEach(b => (b.onclick = () => ((cover.tab = b.dataset.t), renderCover())));
$('cv-file').onchange = async () => {
  const f = $('cv-file').files[0];
  $('cv-file').value = '';
  if (!f || !/^image\//.test(f.type) || f.size > MAX_PHOTO) return;
  try {
    cover.own = await shrinkPhoto(f, { size: COVER_PX, by: 'short', quality: 0.88 });
    const id = libId();
    await libAdd('covers', { id, data: cover.own }, x => x.data === cover.own);
    cover.pick = { type: 'lib', id };
    renderCover();
  } catch {
    toast('Не получилось открыть картинку');
  }
};
/* A day was created before its song link's cover and name arrived: fill them in when they come
   (the cover only if the day was meant to use the song's artwork), keep the link in the library up to date,
   and refresh the open player. */
function completeLinkLater(id, { pending, linkCover }) {
  pending.then(async j => {
    if (!j) return;
    const day = days.find(x => x.id === id);
    if (!day || !day.audio || !day.audio.url) return;
    let changed = false;
    if (!day.audio.name && j.title) (day.audio.name = j.title), (changed = true);
    const e = embedOf(day.audio.url, j.embed);
    if (e && !day.audio.embed) (day.audio.embed = e.uri), (changed = true);
    if (e && e.svc === 'spotify' && day.audio.preview == null) (day.audio.preview = j.preview || ''), (changed = true);
    if (linkCover && j.cover) (day.cover = j.cover), (day.coverOwn = true), (changed = true);
    if (!changed) return;
    await putDay(day);
    const item = lib.links.find(x => x.url === day.audio.url);
    if (item) {
      if (j.title) item.name = j.title;
      if (j.cover) item.cover = j.cover;
      if (e) item.embed = e.uri;
      if (j.preview) item.preview = j.preview;
      saveLib('links');
    }
    if (openDay && openDay.id === id && player) {
      player.el.querySelector('.ptitle').textContent = songNameOf(day);
      if (linkCover && j.cover) {
        player.el.querySelector('.cover-photo').style.backgroundImage = `url("${j.cover}")`;
        player.el.querySelector('.album-art').classList.add('own');
      }
    }
  });
}
// the form's song settings for a link: none while a file is chosen (the file wins)
function linkSongSet(u, j) {
  if ($('f-audio').files[0] || chosenSong) return;
  const e = embedOf(u, j && j.embed);
  setupCut(e && e.svc === 'spotify' && j && j.preview ? j.preview : e && e.svc === 'soundcloud' ? 'volume' : null);
}
// what the form sets for the day's song: its volume and effect (only when changed)
function songSettings(audio) {
  if (cut.vol < 1) audio.gain = cut.vol;
  if (cut.fx !== 'underwater') audio.fx = cut.fx;
}
// what the form says about a pasted link: will it play here, did its cover come
function linkStatus(u, j, loading = false) {
  const e = embedOf(u, j && j.embed),
    parts = [];
  if (loading) {
    // nothing to wait for: the day can be created right away, the cover and name arrive in the background
    $('f-linkst').textContent = (e ? `♪ Будет играть из ${SERVICE_NAME[e.svc]}` : '♪ Песня по ссылке') + ' · обложка подтянется сама';
    return;
  }
  if (e && e.svc === 'spotify' && j && j.preview) parts.push('♪ Будет играть отрывок 30 с из Apple Music, со звуком сайта: момент, громкость и эффект — ниже');
  else if (e) parts.push(`♪ Будет играть из ${SERVICE_NAME[e.svc]}, с лучшего момента — перемотать можно в дне`);
  if (e && e.svc === 'spotify' && !(j && j.preview)) parts.push(SPOTIFY_NOTE);
  parts.push(j ? `✓ Обложка${j.title ? ': ' + j.title : ''}` : 'Обложка не нашлась — выбери другую ниже');
  $('f-linkst').textContent = parts.join(' · ');
}
// a pasted music link fetches its cover (once per link)
let linkTimer = 0;
$('f-link').addEventListener('input', () => {
  clearTimeout(linkTimer);
  linkTimer = setTimeout(async () => {
    const u = $('f-link').value.trim(),
      st = $('f-linkst');
    if (!MUSIC_LINK.test(u)) {
      st.textContent =
        u && !safeUrl(u) ? '' : u ? 'Обложку можно взять только из Spotify, SoundCloud и Apple Music' : '';
      if (!u) cover.link = null;
      if (!$('f-audio').files[0] && !chosenSong) setupCut(null);
      return renderCover();
    }
    if (cover.linkFor === u) return;
    cover.linkFor = u;
    cover.link = null;
    linkStatus(u, null, true);
    if (!$('f-audio').files[0] && !chosenSong) setupCut(null);
    const pending = (cover.pending = aiCover(u));
    cover.pendingFor = u;
    const j = await pending;
    if ($('f-link').value.trim() !== u) return;
    cover.link = j;
    linkStatus(u, j);
    linkSongSet(u, j);
    if (j && (!cover.pick || cover.pick.type === 'link')) {
      // the song's own artwork wins over the automatic choice, but never over a cover picked by hand
      cover.pick = { type: 'link' };
      cover.tab = 'link';
    }
    renderCover();
  }, 600);
});
// ready-made previews take the colours of the first photo, so they hint at the real result
async function coverColorsFromPhotos() {
  if (!photoFiles.length) return (cover.colors = PREVIEW_COLORS);
  try {
    const p = await photoPalette(await (photoFiles[0]._thumb || (photoFiles[0]._thumb = thumbOf(photoFiles[0]))));
    if (p.colors && p.colors.length) cover.colors = p.colors;
  } catch {}
}
// the cover to store with a new day (photos are already downscaled data URLs)
function coverForDay(photos, colors) {
  const ch = coverChoice();
  if (ch.type === 'photo') return { coverPhoto: Math.min(ch.i, photos.length - 1), cover: null, coverOwn: false };
  if (ch.type === 'link' && cover.link) return { cover: cover.link.cover, coverOwn: true };
  if (ch.type === 'own' && cover.own) return { cover: cover.own, coverOwn: true };
  if (ch.type === 'lib') {
    const c = lib.covers.find(x => x.id === ch.id);
    if (c) return { cover: c.data, coverOwn: true };
  }
  return { cover: paintCover(ch.style || 'paint', colors), coverOwn: true };
}
// title field shows only when the AI will not name the day
function aiWillRun() {
  return aiReady && settings.ai !== false && !(usage && usage.days.used >= usage.days.max);
}
function updateTitleField() {
  $('f-titlefield').classList.toggle('hidden', aiWillRun());
  $('f-mic').classList.toggle('hidden', !canDictate());
}

function renderPhotos() {
  const box = $('f-prev'),
    add = box.querySelector('.addph');
  box.querySelectorAll('.ph').forEach(e => e.remove());
  photoFiles.forEach((f, i) => {
    const d = document.createElement('div');
    d.className = 'ph';
    const im = new Image();
    im.decoding = 'async';
    im.alt = `Выбранное фото ${i + 1}`;
    (f._thumb || (f._thumb = thumbOf(f))).then(u => (im.src = u));
    d.appendChild(im);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rm';
    b.innerHTML = XI;
    b.setAttribute('aria-label', 'Убрать фото');
    b.onclick = () => {
      photoFiles.splice(i, 1);
      renderPhotos();
    };
    d.appendChild(b);
    box.insertBefore(d, add);
  });
  add.style.display = photoFiles.length >= 8 ? 'none' : '';
  $('f-phcount').textContent = photoFiles.length ? `${photoFiles.length} из 8` : '';
  if (cover.pick && cover.pick.type === 'photo' && cover.pick.i >= photoFiles.length) cover.pick = null;
  coverColorsFromPhotos().then(renderCover);
}
const MAX_PHOTO = 20 * 1024 * 1024,
  MAX_AUDIO = 30 * 1024 * 1024;
function safeUrl(u) {
  try {
    const x = new URL(String(u).trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
  } catch {
    return null;
  }
}
$('f-photos').onchange = () => {
  const ok = [],
    bad = [];
  [...$('f-photos').files].forEach(f => (/^image\//.test(f.type) && f.size <= MAX_PHOTO ? ok : bad).push(f));
  photoFiles.push(...ok);
  const over = photoFiles.length > 8;
  photoFiles = photoFiles.slice(0, 8);
  $('f-photos').value = '';
  renderPhotos();
  $('f-err').textContent = bad.length
    ? `Пропущено ${bad.length}: нужны картинки до 20 МБ.`
    : over
      ? 'Можно до 8 фото, лишние не добавлены.'
      : '';
};
let chosenSong = null;
function renderRecentSongs() {
  const box = $('f-recent');
  box.innerHTML = '';
  box.classList.toggle('hidden', !lib.songs.length && !lib.links.length);
  if (!lib.songs.length && !lib.links.length) return;
  const cap = document.createElement('span');
  cap.className = 'recent-cap';
  cap.textContent = 'Недавние:';
  box.appendChild(cap);
  for (const s of lib.songs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (chosenSong && chosenSong.id === s.id ? ' on' : '');
    b.textContent = s.name;
    b.onclick = () => {
      chosenSong = chosenSong && chosenSong.id === s.id ? null : s;
      $('f-audio').value = '';
      $('f-audiotxt').textContent = chosenSong ? chosenSong.name : 'Выбрать аудиофайл';
      setupCut(chosenSong ? chosenSong.blob : null);
      if (chosenSong) $('f-link').value = '';
      renderRecentSongs();
    };
    box.appendChild(b);
  }
  // songs from links: one tap and the link, its cover and its player are back, without pasting it again
  const cur = $('f-link').value.trim();
  for (const s of lib.links) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip link' + (cur === s.url ? ' on' : '');
    const e = embedOf(s.url, s.embed);
    b.textContent = (e ? (e.svc === 'spotify' ? '● ' : '☁ ') : '') + s.name;
    b.title = s.url;
    b.onclick = () => {
      const off = $('f-link').value.trim() === s.url;
      chosenSong = null;
      $('f-audio').value = '';
      $('f-audiotxt').textContent = 'Выбрать аудиофайл';
      setupCut(null);
      $('f-link').value = off ? '' : s.url;
      if (off) {
        cover.link = null;
        cover.linkFor = '';
        $('f-linkst').textContent = '';
      } else {
        cover.link = s.cover ? { cover: s.cover, title: s.name, embed: s.embed, preview: s.preview || '' } : null;
        cover.linkFor = s.url;
        if (cover.link && (!cover.pick || cover.pick.type === 'link')) {
          cover.pick = { type: 'link' };
          cover.tab = 'link';
        }
        linkStatus(s.url, cover.link || { embed: s.embed, cover: '', title: s.name });
        linkSongSet(s.url, cover.link || { embed: s.embed });
        if (e && e.svc === 'spotify' && !s.preview)
          aiCover(s.url).then(j => {
            if (!j || !j.preview || $('f-link').value.trim() !== s.url) return;
            s.preview = j.preview;
            saveLib('links');
            if (cover.link) cover.link.preview = j.preview;
            linkStatus(s.url, cover.link || j);
            linkSongSet(s.url, cover.link || j);
          });
      }
      renderCover();
      renderRecentSongs();
    };
    box.appendChild(b);
  }
}
$('f-audio').onchange = () => {
  chosenSong = null;
  renderRecentSongs();
  const f = $('f-audio').files[0];
  if (f && (!/^audio\//.test(f.type) || f.size > MAX_AUDIO)) {
    $('f-audio').value = '';
    $('f-audiotxt').textContent = 'Выбрать аудиофайл';
    $('f-err').textContent = 'Нужен аудиофайл до 30 МБ.';
    return;
  }
  $('f-audiotxt').textContent = f ? f.name : 'Выбрать аудиофайл';
  $('f-err').textContent = '';
  setupCut(f || null);
};
/* DayMedia: one video (a small retro TV in the day) and one sound (a cassette that slides into a player). */
const MAX_VIDEO = 80 * 1024 * 1024,
  MAX_TAPE = 30 * 1024 * 1024;
const mediaPick = (id, txt, empty, re, max, err) => {
  $(id).onchange = () => {
    const f = $(id).files[0];
    if (f && (!re.test(f.type) || f.size > max)) {
      $(id).value = '';
      $(txt).textContent = empty;
      $('f-err').textContent = err;
      return;
    }
    $(txt).textContent = f ? f.name : empty;
    $('f-err').textContent = '';
  };
};
mediaPick('f-video', 'f-videotxt', 'Видео', /^video\//, MAX_VIDEO, 'Нужно видео до 80 МБ.');
mediaPick('f-tape', 'f-tapetxt', 'Звук', /^audio\//, MAX_TAPE, 'Нужен звук до 30 МБ.');
/* Song segment ("тайминг"): which part of the song plays in the day, on a loop. */
const CUT_MIN_SEC = 10; // the shortest part; the longest is the whole song
let cut = { el: null, url: '', dur: 0, own: false, preview: false, touched: false, fx: 'underwater', vol: 1 };
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function stopCutPreview() {
  if (cut.el) cut.el.pause();
  $('cut-play').classList.remove('on');
}
/* SongSettings in the form: the part (at least CUT_MIN_SEC, at most the whole song), the volume and the
   effect, heard right here before the day is created. src is an audio file, Apple's preview address of a
   Spotify song, or 'volume' for a SoundCloud link (its player only lets the site set the volume). */
function setupCut(src) {
  stopCutPreview();
  if (cut.own) URL.revokeObjectURL(cut.url);
  const keep = { fx: cut.fx, vol: cut.vol };
  cut = { el: null, url: '', dur: 0, own: false, preview: false, touched: false, ...keep };
  $('f-cut').classList.add('hidden');
  renderSongSet();
  if (!src) return;
  const timeline = src !== 'volume';
  for (const id of ['cut-range', 'cut-play', 'cut-fx']) $(id).classList.toggle('hidden', !timeline);
  document.querySelector('#f-cut .cut-times').classList.toggle('hidden', !timeline);
  if (!timeline) {
    $('cut-txt').textContent = 'SoundCloud даёт сайту менять только громкость; момент можно перемотать в дне';
    $('f-cut').classList.remove('hidden');
    return;
  }
  cut.preview = typeof src === 'string';
  cut.own = !cut.preview;
  cut.url = cut.preview ? src : URL.createObjectURL(src);
  const a = cutAudio();
  a.preload = 'metadata';
  a.onloadedmetadata = () => {
    if (cut.el !== a || !isFinite(a.duration)) return;
    cut.dur = Math.floor(a.duration);
    for (const id of ['cut-a', 'cut-b']) $(id).max = cut.dur;
    $('cut-a').value = 0;
    $('cut-b').value = cut.dur;
    // a sound too short to cut just loops whole: only its volume and effect
    const short = cut.dur < CUT_MIN_SEC + 2;
    $('cut-range').classList.toggle('hidden', short);
    document.querySelector('#f-cut .cut-times').classList.toggle('hidden', short);
    renderCut();
    $('f-cut').classList.remove('hidden');
  };
}
// the form's listening copy of the song, through the chosen effect (a new element for each effect:
// an element is bound to its effect once it plays through the site's sound)
function cutAudio() {
  const a = new Audio();
  if (cut.preview) a.crossOrigin = 'anonymous';
  a.src = cut.url;
  if (snd.ctx) snd.attach(a, fxOf({ fx: cut.fx }));
  a.ontimeupdate = () => {
    if (cut.el === a && a.currentTime >= +$('cut-b').value) stopCutPreview();
  };
  cut.el = a;
  cutLevel();
  return a;
}
function cutLevel() {
  if (cut.el) vol(cut.el, Math.max(0.3, settings.volume) * cut.vol);
}
function renderSongSet() {
  $('cut-vol').value = cut.vol;
  setRangeFill($('cut-vol'));
  const i = ['underwater', 'soft', 'none'].indexOf(cut.fx);
  $('cut-fx').style.setProperty('--k', String(Math.max(0, i)));
  $('cut-fx').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.fx === cut.fx));
}
$('cut-vol').oninput = () => {
  cut.vol = +$('cut-vol').value;
  setRangeFill($('cut-vol'));
  cutLevel();
};
$('cut-fx').querySelectorAll('button').forEach(
  b =>
    (b.onclick = () => {
      if (cut.fx === b.dataset.fx) return;
      cut.fx = b.dataset.fx;
      renderSongSet();
      if (!cut.el) return;
      // swap the listening copy for one with the new effect, at the same moment
      const old = cut.el,
        t = old.currentTime,
        on = !old.paused;
      old.pause();
      const a = cutAudio();
      a.currentTime = t;
      if (on) a.play().catch(() => {});
    }),
);
function renderCut(moved) {
  let a = +$('cut-a').value,
    b = +$('cut-b').value;
  if (b - a < CUT_MIN_SEC) {
    // the moved knob pushes the other one; at the song's edge it stops itself, so the part never gets shorter
    if (moved === 'b') {
      b = Math.min(cut.dur, Math.max(b, CUT_MIN_SEC));
      a = Math.max(0, b - CUT_MIN_SEC);
    } else {
      a = Math.max(0, Math.min(a, cut.dur - CUT_MIN_SEC));
      b = Math.min(cut.dur, a + CUT_MIN_SEC);
    }
    $('cut-a').value = a;
    $('cut-b').value = b;
  }
  const whole = cut.preview ? 'весь отрывок Apple Music' : 'вся песня';
  $('cut-txt').textContent = !cut.touched
    ? cut.preview
      ? `Играет ${whole} (${mmss(cut.dur)}) — или выбери свой момент`
      : `Сыграет около минуты с самого яркого места — или выбери своё`
    : a === 0 && b === cut.dur
      ? `Играет ${whole}`
      : `Играет с ${mmss(a)} до ${mmss(b)} (${mmss(b - a)})`;
  placeCut(a, b);
}
/* SongCut range: one track with two round knobs (start and end) over the whole song, made for a finger and
   a mouse alike. A press anywhere moves the nearer knob there; arrows move a focused knob by a second
   (Page Up / Page Down by ten). The values live in the hidden #cut-a / #cut-b, so the rest stays the same. */
function placeCut(a, b) {
  const r = $('cut-range'),
    d = Math.max(1, cut.dur);
  r.style.setProperty('--fa', (a / d).toFixed(4));
  r.style.setProperty('--fb', (b / d).toFixed(4));
  // under the track: the song's own beginning and length (the chosen part is written above)
  $('cut-ta').textContent = '0:00';
  $('cut-tb').textContent = mmss(cut.dur);
  for (const [k, v] of [
    ['cut-ka', a],
    ['cut-kb', b],
  ]) {
    $(k).setAttribute('aria-valuemin', '0');
    $(k).setAttribute('aria-valuemax', String(cut.dur));
    $(k).setAttribute('aria-valuenow', String(v));
    $(k).setAttribute('aria-valuetext', mmss(v));
  }
}
function setCut(which, v) {
  cut.touched = true;
  const inp = $(which === 'a' ? 'cut-a' : 'cut-b');
  inp.value = Math.round(Math.max(0, Math.min(cut.dur, v)));
  inp.dispatchEvent(new Event('input'));
}
{
  const r = $('cut-range');
  let drag = null;
  const at = e => {
    const box = r.getBoundingClientRect(),
      k = 14; // half a knob: the track starts and ends at the knob centres
    return (Math.max(0, Math.min(1, (e.clientX - box.left - k) / Math.max(1, box.width - 2 * k))) * cut.dur);
  };
  r.addEventListener('pointerdown', e => {
    if (!cut.dur) return;
    const v = at(e),
      a = +$('cut-a').value,
      b = +$('cut-b').value;
    drag = e.target.id === 'cut-ka' ? 'a' : e.target.id === 'cut-kb' ? 'b' : Math.abs(v - a) <= Math.abs(v - b) ? 'a' : 'b';
    r.setPointerCapture(e.pointerId);
    r.classList.add('drag');
    $(drag === 'a' ? 'cut-ka' : 'cut-kb').classList.add('on');
    setCut(drag, v);
    e.preventDefault();
  });
  r.addEventListener('pointermove', e => drag && setCut(drag, at(e)));
  const end = () => {
    drag = null;
    r.classList.remove('drag');
    $('cut-ka').classList.remove('on');
    $('cut-kb').classList.remove('on');
  };
  r.addEventListener('pointerup', end);
  r.addEventListener('pointercancel', end);
  for (const [id, which] of [
    ['cut-ka', 'a'],
    ['cut-kb', 'b'],
  ])
    $(id).addEventListener('keydown', e => {
      const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -10, PageUp: 10 }[e.key];
      if (!step) return;
      e.preventDefault();
      setCut(which, +$(which === 'a' ? 'cut-a' : 'cut-b').value + step);
    });
}
$('cut-a').oninput = () => (renderCut('a'), cut.el && !cut.el.paused && (cut.el.currentTime = +$('cut-a').value));
$('cut-b').oninput = () => renderCut('b');
$('cut-play').onclick = () => {
  if (!cut.el) return;
  if (!cut.el.paused) return stopCutPreview();
  cut.el.currentTime = +$('cut-a').value;
  cutLevel();
  cut.el.play().catch(() => {});
  $('cut-play').classList.add('on');
};
$('f-link').oninput = () => {
  $('f-link').classList.remove('bad');
  $('f-err').textContent = '';
};
function resetForm() {
  $('form').reset();
  photoFiles.forEach(f => f._thumb && f._thumb.then(u => URL.revokeObjectURL(u)));
  photoFiles = [];
  renderPhotos();
  $('notes').innerHTML = '';
  addNote();
  $('f-audiotxt').textContent = 'Выбрать аудиофайл';
  $('f-videotxt').textContent = 'Видео';
  $('f-tapetxt').textContent = 'Звук';
  setDate(isoLocal(new Date()));
  toggleCal(false);
  $('f-err').textContent = '';
  $('f-linkst').textContent = '';
  chosenSong = null;
  renderRecentSongs();
  cut.fx = 'underwater';
  cut.vol = 1;
  setupCut(null);
  stopDictation();
  cover = { pick: null, tab: 'photo', link: null, own: null, colors: PREVIEW_COLORS, linkFor: '' };
  renderCover();
  updateTitleField();
}
// bottom sheet: slides up on a spring, can be swiped down by its handle or closed by tapping the backdrop
function showSheet() {
  const m = $('modal');
  clearTimeout(showSheet.t);
  m.style.setProperty('--drag', '0px');
  m.classList.remove('hidden');
  void m.offsetHeight;
  m.classList.add('show');
}
function hideSheet(after) {
  const m = $('modal');
  m.classList.remove('show');
  clearTimeout(showSheet.t);
  showSheet.t = setTimeout(() => {
    m.classList.add('hidden');
    m.style.setProperty('--drag', '0px');
    after && after();
  }, SHEET_CLOSE_MS);
}
function openModal() {
  closePanels();
  resetForm();
  refreshUsage().then(updateTitleField);
  showSheet();
  setTimeout(() => $('notes').querySelector('textarea').focus({ preventScroll: true }), 450);
}
function closeModal() {
  hideSheet(resetForm);
}
$('modal').addEventListener('pointerdown', e => {
  if (e.target === $('modal')) closeModal();
});
(() => {
  const g = $('grab'),
    m = $('modal');
  let y0 = null,
    dy = 0;
  g.addEventListener('pointerdown', e => {
    y0 = e.clientY;
    dy = 0;
    g.setPointerCapture(e.pointerId);
    m.classList.add('dragging');
  });
  g.addEventListener('pointermove', e => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    m.style.setProperty('--drag', (dy < 0 ? 0 : dy) + 'px');
  });
  const up = () => {
    if (y0 === null) return;
    y0 = null;
    m.classList.remove('dragging');
    if (dy > SHEET_SWIPE_CLOSE_PX) closeModal();
    else m.style.setProperty('--drag', '0px');
  };
  g.addEventListener('pointerup', up);
  g.addEventListener('pointercancel', up);
})();
$('f-cancel').onclick = closeModal;
$('form').onsubmit = async e => {
  e.preventDefault();
  const notes = [...$('notes').querySelectorAll('textarea')].map(t => t.value.trim()).filter(Boolean),
    date = $('f-date').value;
  const text = notes.join('\n\n');
  if (!text) {
    $('f-err').textContent = 'Напиши хотя бы пару слов о дне.';
    $('notes').querySelector('textarea').focus();
    return;
  }
  if (text.length > 6000) {
    $('f-err').textContent = 'Слишком длинно: до 6000 символов на день.';
    return;
  }
  if (!date || date > isoLocal(new Date())) {
    $('f-err').textContent = 'Выбери прошедший или сегодняшний день.';
    return;
  }
  const linkRaw = $('f-link').value.trim();
  if (linkRaw && !safeUrl(linkRaw)) {
    $('f-err').textContent = 'Ссылка на песню должна начинаться с https://';
    $('f-link').classList.add('bad');
    $('f-link').focus();
    return;
  }
  hideSheet();
  $('busy').classList.remove('hidden');
  try {
    const files = photoFiles.slice(0, 8),
      photos = [];
    for (const f of files) photos.push(await downscale(f));
    let pal = null;
    if (photos.length) {
      const ps = [];
      for (const p of photos) ps.push(await photoPalette(p));
      const all = ps.flatMap(p => p.colors);
      pal = {
        colors: [all[0], all[3] || all[1], all[6] || all[2]].filter(Boolean),
        brightness: ps.reduce((a, p) => a + p.brightness, 0) / ps.length,
      };
    }
    let late = null; // a song link whose cover and name are still on their way
    const picked = $('f-audio').files[0],
      af = picked || (chosenSong && chosenSong.blob);
    let audio = null,
      feats = null;
    if (af) {
      try {
        feats = await audioFeatures(af);
      } catch (err) {
        console.warn('audio analysis failed', err);
      }
      audio = { blob: af, name: picked ? af.name : chosenSong.name };
      if (picked)
        await libAdd(
          'songs',
          { id: libId(), name: af.name.replace(/\.[a-z0-9]+$/i, ''), blob: af },
          x => x.name === af.name.replace(/\.[a-z0-9]+$/i, '') && x.blob.size === af.size,
        );
      if (cut.el && cut.touched) {
        // the chosen part plays as it is, up to the whole song
        audio.start = +$('cut-a').value;
        audio.end = +$('cut-b').value;
      }
      songSettings(audio);
    } else if (linkRaw) {
      const url = safeUrl(linkRaw),
        lk = cover.linkFor === linkRaw ? cover.link : null,
        e = embedOf(url, lk && lk.embed);
      if (!lk && cover.pendingFor === linkRaw && cover.pending)
        late = { pending: cover.pending, linkCover: cover.pick ? cover.pick.type === 'link' : !photos.length };
      audio = { url };
      if (e) audio.embed = e.uri;
      if (lk && lk.title) audio.name = lk.title;
      if (lk && e && e.svc === 'spotify') audio.preview = lk.preview || '';
      // the part chosen in Apple's preview (its own seconds, not the Spotify song's)
      if (cut.preview && cut.touched && audio.preview === cut.url) audio.cut = { a: +$('cut-a').value, b: +$('cut-b').value };
      songSettings(audio);
      await libAdd(
        'links',
        {
          id: libId(),
          url,
          name: (lk && lk.title) || url.replace(/^https:\/\/(www\.)?/, '').slice(0, 40),
          cover: (lk && lk.cover) || '',
          embed: e ? e.uri : '',
          preview: (lk && lk.preview) || '',
        },
        x => x.url === url,
      );
    }
    const tm = textMood(text),
      mood = combine(tm, pal, feats);
    let ai = null;
    if (aiReady && settings.ai !== false) {
      $('busy').textContent = 'ИИ рассматривает день…';
      ai = await aiAnalyze({
        notes,
        photos,
        date,
        song: af
          ? {
              name: af.name,
              tempo: feats ? feats.tempo : null,
              energy: feats ? +feats.energy.toFixed(2) : null,
              bright: feats ? +feats.bright.toFixed(2) : null,
            }
          : null,
      });
      afterAiCall();
      $('busy').textContent = 'собираю воспоминание…';
    }
    applyAi(mood, ai, !!feats);
    const d = {
      id: 'd-' + Date.now(),
      date,
      text,
      notes,
      title:
        (!$('f-titlefield').classList.contains('hidden') && $('f-title').value.trim().slice(0, 60)) ||
        (ai && ai.title) ||
        makeTitle(text, mood.kind, new Date().getHours()),
      userTitle: '',
      pinned: false,
      tags: [],
      photos,
      audio,
      mood,
      fragments: (ai && ai.fragments) || null,
      spoken: (ai && ai.fragments && ai.spoken) || null,
      weather: ai ? ai.weather : null,
      voiceStyle: (ai && ai.voice) || '',
      ai: !!ai,
      video: $('f-video').files[0] ? { blob: $('f-video').files[0], name: $('f-video').files[0].name } : null,
      tape: $('f-tape').files[0] ? { blob: $('f-tape').files[0], name: $('f-tape').files[0].name } : null,
      ...coverForDay(photos, mood.colors),
    };
    if (d.audio && d.audio.url && cover.link && cover.link.title && !d.audio.name) d.audio.name = cover.link.title;
    await putDay(d);
    await reload(d.id);
    if (late) completeLinkLater(d.id, late);
    $('busy').classList.add('hidden');
    resetForm();
    const idx = engine.days.findIndex(x => x.id === d.id);
    if (idx >= 0) engine.goTo(idx);
    setTimeout(() => openDayView(days.find(x => x.id === d.id) || d), OPEN_NEW_DAY_DELAY_MS);
  } catch (err) {
    console.error(err);
    $('busy').classList.add('hidden');
    showSheet();
    $('f-err').textContent = 'Не получилось собрать день. Попробуй другие файлы.';
  }
};

(async () => {
  applySettings();
  applyPerf();
  const list = await allDays();
  if (settings.demoVer !== 5) {
    for (const d of list.filter(x => x.demo)) await delDay(d.id);
    for (const d of buildDemo()) await putDay(d);
    settings.demoVer = 5; // 5: demo days use real photos
    settings.demoSeeded = true;
    saveSettings(settings);
  } else if (!list.length && !settings.demoSeeded) {
    for (const d of buildDemo()) await putDay(d);
    settings.demoSeeded = true;
    saveSettings(settings);
  }
  await reload();
  engine.goTo(engine.days.length - 1);
  engine.scroll = engine.scrollT;
  await loadLib();
  renderRecentSongs();
})();
