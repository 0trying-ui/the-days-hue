// Reads notes aloud with a voice tuned to the day's mood (browser speech synthesis, no real people's voices).
// Prefers natural/online neural voices when the browser has them and speaks phrase by phrase with pauses
// and punctuation-driven intonation, so it sounds less monotonous.
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
let voices = [];
function load() {
  voices = canSpeak ? speechSynthesis.getVoices() : [];
}
if (canSpeak) {
  load();
  speechSynthesis.onvoiceschanged = load;
}
const PROS = { calm: [0.93, 1.0], tense: [1.08, 1.03], bright: [1.04, 1.12], melancholy: [0.86, 0.92] };
export function ruVoice() {
  const ru = voices.filter(v => /^ru/i.test(v.lang));
  const score = v =>
    (/Natural|Neural|Online/i.test(v.name) ? 100 : 0) +
    (/Google/i.test(v.name) ? 60 : 0) +
    (/Svetlana|Dariya|Milena/i.test(v.name) ? 20 : 0) +
    (/Irina/i.test(v.name) ? 5 : 0) +
    (v.localService ? 0 : 10);
  return ru.sort((a, b) => score(b) - score(a))[0] || null;
}
export const voiceQuality = () => {
  const v = ruVoice();
  return !v ? 'none' : /Natural|Neural|Online|Google/i.test(v.name) ? 'good' : 'basic';
};

function phrases(text) {
  const out = [];
  (text.match(/[^.!?…]+[.!?…]*/g) || [text]).forEach(s => {
    s = s.trim();
    if (!s) return;
    const end = (s.match(/[.!?…]+$/) || ['.'])[0];
    const parts = s.split(/,\s+|\s[—–]\s/);
    parts.forEach((p, i) =>
      out.push({ t: p.trim() + (i < parts.length - 1 ? ',' : ''), end: i < parts.length - 1 ? ',' : end }),
    );
  });
  return out.filter(p => p.t.replace(/[,.!?…]/g, '').trim());
}

let token = 0;
export function stop() {
  token++;
  if (canSpeak) speechSynthesis.cancel();
}
export function speak(texts, kind, cb = {}) {
  if (!canSpeak) return false;
  stop();
  const my = token,
    v = ruVoice(),
    [rate, pitch] = PROS[kind] || PROS.calm;
  const list = texts.filter(Boolean);
  if (!list.length) return false;
  const queue = [];
  list.forEach((t, idx) => phrases(t).forEach((p, k, arr) => queue.push({ ...p, idx, last: k === arr.length - 1 })));
  let i = 0,
    curIdx = -1;
  const next = () => {
    if (my !== token) return;
    if (i >= queue.length) {
      cb.onend && cb.onend();
      return;
    }
    const q = queue[i];
    const u = new SpeechSynthesisUtterance(q.t);
    u.lang = 'ru-RU';
    if (v) u.voice = v;
    const jitter = Math.sin(i * 12.9898) * 0.5 * 0.06;
    let r = rate + jitter * 0.6,
      p = pitch + jitter;
    if (q.end.includes('!')) {
      r += 0.05;
      p += 0.1;
    }
    if (q.end.includes('?')) {
      p += 0.12;
    }
    if (q.end.includes('…')) {
      r -= 0.08;
      p -= 0.04;
    }
    u.rate = Math.max(0.6, Math.min(1.4, r));
    u.pitch = Math.max(0.6, Math.min(1.5, p));
    u.volume = 1;
    u.onstart = () => {
      if (my === token && q.idx !== curIdx) {
        curIdx = q.idx;
        cb.onpart && cb.onpart(q.idx);
      }
    };
    const pause = q.last ? 650 : q.end === ',' ? 140 : q.end.includes('…') ? 520 : 340;
    u.onend = () => {
      i++;
      setTimeout(next, pause);
    };
    u.onerror = () => {
      i++;
      next();
    };
    speechSynthesis.speak(u);
  };
  cb.onstart && cb.onstart();
  next();
  return true;
}
