const DB = 'constellation-days',
  ST = 'days';

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(ST, mode),
      s = t.objectStore(ST),
      q = fn(s);
    t.oncomplete = () => res(q && q.result);
    t.onerror = () => rej(t.error);
  });
}
export const allDays = () =>
  tx('readonly', s => s.getAll()).then(a => (a || []).filter(d => !String(d.id).startsWith('__')));
export const getRec = id => tx('readonly', s => s.get(id));
export const putDay = d => tx('readwrite', s => s.put(d));
export const delDay = id => tx('readwrite', s => s.delete(id));
export const clearDays = () => tx('readwrite', s => s.clear());

const SK = 'constellation-settings';
export const defaults = {
  speed: 1,
  intensity: 1,
  density: 1,
  volume: 0.6,
  // starts from the system setting «reduce motion»; the site's own switch can change it
  reduce: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  theme: 'night',
  ui: 'dark', // interface theme: dark or light (the sky is always night)
  sound: true,
  demoSeeded: false,
  ai: true,
  aiVoice: true,
};
export function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem(SK) || '{}');
  } catch {}
  const o = { ...defaults, ...s };
  if (!('reduce' in s) && matchMedia('(prefers-reduced-motion: reduce)').matches) o.reduce = true;
  return o;
}
export function saveSettings(s) {
  try {
    localStorage.setItem(SK, JSON.stringify(s));
  } catch {}
}
