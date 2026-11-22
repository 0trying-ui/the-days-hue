// Client for the Gemini proxy. Every call has a timeout and returns null on any problem,
// so the site silently falls back to the built-in analysis and system voice.
import { AI_URL } from './config.js';

const KINDS = ['calm', 'tense', 'bright', 'melancholy'];
const WEATHER = ['rain', 'snow', 'wind', 'sun', 'fog'];
const HEX = /^#[0-9a-f]{6}$/i;

export function aiUrl() {
  let o = '';
  try {
    o = localStorage.getItem('ottenok-ai-url') || '';
  } catch {}
  return (o || AI_URL || '').replace(/\/+$/, '');
}


// an own Gemini key from earlier versions is no longer used: forget it
try {
  localStorage.removeItem('ottenok-user-key');
} catch {}

async function call(path, opts = {}, ms = 25000) {
  const base = aiUrl();
  if (!base) return null;
  const ctl = new AbortController(),
    timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(base + path, { ...opts, signal: ctl.signal });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      // the proxy answers 429 {error:'limit', kind} when this visitor's daily allowance is used up
      if (r.status === 429 && /"limit"/.test(t)) limitHit = (t.match(/"kind":"(w+)"/) || [])[1] || 'days';
      console.warn('AI', path, r.status, t);
      return null;
    }
    return r;
  } catch (e) {
    console.warn('AI', path, e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let limitHit = '';
// 'days' or 'voices' if the last call was refused because today's allowance ran out (read once)
export function takeLimitHit() {
  const k = limitHit;
  limitHit = '';
  return k;
}
// today's use for this visitor: { days:{used,max}, voices:{used,max}, src, primary, resetAt } or null
export async function aiUsage() {
  const r = await call('/usage', { cache: 'no-store' }, 6000);
  if (!r) return null;
  const j = await r.json().catch(() => null);
  return j && j.days && j.voices ? j : null;
}

export async function aiHealth() {
  const r = await call('/health', {}, 6000);
  if (!r) return false;
  const j = await r.json().catch(() => null);
  return !!(j && j.ok);
}

async function smallJpeg(src, max = 448) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
  const k = Math.min(1, max / Math.max(img.width, img.height)),
    c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8).split(',')[1];
}

export async function aiAnalyze({ notes, photos = [], song = null, date }) {
  if (!aiUrl()) return null;
  const pics = [];
  for (const p of photos.slice(0, 3)) {
    try {
      pics.push(await smallJpeg(p));
    } catch {}
  }
  const r = await call(
    '/analyze',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, photos: pics, song, date }),
    },
    40000,
  );
  if (!r) return null;
  const j = await r.json().catch(() => null);
  return validate(j, notes);
}

function validate(j, notes) {
  if (!j || typeof j !== 'object') return null;
  const out = {};
  out.kind = KINDS.includes(j.mood) ? j.mood : null;
  const cols = Array.isArray(j.colors)
    ? j.colors.filter(c => HEX.test(String(c).trim())).map(c => String(c).trim().toLowerCase())
    : [];
  out.colors = cols.length >= 2 ? [cols[0], cols[1], cols[2] || cols[0]] : null;
  const t = typeof j.title === 'string' ? j.title.replace(/["«»]/g, '').replace(/\.$/, '').trim() : '';
  out.title = t.length >= 3 && t.length <= 70 ? t : null;
  const src = notes.join(' ').replace(/\s+/g, ' ').trim();
  const fr = Array.isArray(j.fragments)
    ? j.fragments
        .map(s => String(s).trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const covered = fr.join(' ').replace(/\s+/g, ' ').length;
  out.fragments = fr.length && covered >= src.length * 0.75 && covered <= src.length * 1.25 ? fr : null;
  // the same pieces with spelling fixed, for reading aloud only (the notes keep the user's own words)
  const sp = Array.isArray(j.spoken) ? j.spoken.map(s => String(s).trim()).filter(Boolean) : [];
  out.spoken = out.fragments && sp.length === out.fragments.length ? sp : null;
  out.weather = Array.isArray(j.weather) ? [...new Set(j.weather.filter(w => WEATHER.includes(w)))] : null;
  out.why = Array.isArray(j.why)
    ? j.why
        .map(s => String(s).trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  out.voice = typeof j.voice === 'string' ? j.voice.slice(0, 160) : '';
  out.energy = Number.isFinite(+j.energy) ? Math.max(0, Math.min(1, +j.energy)) : null;
  out.valence = Number.isFinite(+j.valence) ? Math.max(-1, Math.min(1, +j.valence)) : null;
  return out.kind || out.colors || out.title ? out : null;
}

export async function aiSpeak(text, kind, style) {
  const r = await call(
    '/tts',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, kind, style }) },
    45000,
  );
  if (!r) return null;
  const b = await r.blob().catch(() => null);
  return b && b.size > 1000 ? b : null;
}

// Speech to text: the recorded audio goes to the proxy (Cloudflare Workers AI, Whisper). Returns text or null.
export async function aiTranscribe(blob) {
  const r = await call(
    '/transcribe',
    { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob },
    40000,
  );
  if (!r) return null;
  const j = await r.json().catch(() => null);
  return j && typeof j.text === 'string' ? j.text.trim() : null;
}

// Song cover from a Spotify / SoundCloud / Apple Music link, fetched by the proxy:
// { cover: data URL, title, author } or null
export const MUSIC_LINK =
  /^https:\/\/(open\.spotify\.com|spotify\.link|(m\.|on\.)?soundcloud\.com|music\.apple\.com)\//i;
export async function aiCover(link) {
  if (!MUSIC_LINK.test(link)) return null;
  const r = await call('/cover?url=' + encodeURIComponent(link), {}, 12000);
  if (!r) return null;
  const j = await r.json().catch(() => null);
  // strict: only a base64 image, nothing that could break out of the CSS url("…") it is placed in
  if (!(j && typeof j.cover === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(j.cover))) return null;
  return {
    cover: j.cover,
    title: typeof j.title === 'string' ? j.title.slice(0, 160) : '',
    author: typeof j.author === 'string' ? j.author.slice(0, 120) : '',
    embed: typeof j.embed === 'string' ? j.embed.slice(0, 200) : '',
  };
}
