// Weather inside a day's sphere: rain, snow, wind, sun, fog — chosen from the day's words (or by the AI).
// Everything is drawn on one 2D canvas with depth layers, pre-rendered textures and soft, blurred light.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RULES = [
  ['rain', /дожд|ливень|ливн|морос|лужи|гроз/],
  ['snow', /снег|снеж|метел|сугроб|вьюг/],
  ['wind', /ветер|ветр|ветрен|вьюг|сквозняк|штормо?в/],
  ['sun', /солнц|солнеч|жар[кa]|лучи|закат|рассвет|лето|летн/],
  ['fog', /туман|дымк|мгл|пасмурн|облачн/],
];
export function detectWeather(text) {
  const t = (text || '').toLowerCase();
  return RULES.filter(([, re]) => re.test(t)).map(([k]) => k);
}
export const WEATHER_NAMES = { rain: 'дождь', snow: 'снег', wind: 'ветер', sun: 'солнечный свет', fog: 'туман' };

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function softDot(size, inner = 0.3) {
  const c = canvas(size, size),
    g = c.getContext('2d'),
    r = size / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(inner, 'rgba(255,255,255,.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}
function fogTexture(size = 512) {
  const c = canvas(size, size),
    g = c.getContext('2d');
  g.filter = 'blur(28px)';
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size,
      y = Math.random() * size,
      r = 40 + Math.random() * 120;
    g.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.09})`;
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) {
        g.beginPath();
        g.arc(x + dx, y + dy, r, 0, 7);
        g.fill();
      }
  }
  return c;
}
function raysTexture(w, h, warm) {
  const c = canvas(w, h),
    g = c.getContext('2d');
  g.filter = 'blur(22px)';
  const ox = w * 0.9,
    oy = -h * 0.12,
    len = Math.hypot(w, h) * 1.2;
  for (let i = 0; i < 9; i++) {
    const ang = Math.PI * 0.62 + (i - 4) * 0.085 + (Math.random() - 0.5) * 0.03,
      wd = 0.012 + Math.random() * 0.03;
    const gr = g.createLinearGradient(ox, oy, ox + Math.cos(ang) * len * 0.8, oy + Math.sin(ang) * len * 0.8);
    gr.addColorStop(0, `rgba(${warm},${0.5 + Math.random() * 0.3})`);
    gr.addColorStop(0.55, `rgba(${warm},.12)`);
    gr.addColorStop(1, `rgba(${warm},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(ox, oy);
    g.lineTo(ox + Math.cos(ang - wd) * len, oy + Math.sin(ang - wd) * len);
    g.lineTo(ox + Math.cos(ang + wd) * len, oy + Math.sin(ang + wd) * len);
    g.closePath();
    g.fill();
  }
  g.filter = 'blur(40px)';
  const glow = g.createRadialGradient(ox, oy, 0, ox, oy, h * 0.6);
  glow.addColorStop(0, `rgba(${warm},.55)`);
  glow.addColorStop(1, `rgba(${warm},0)`);
  g.fillStyle = glow;
  g.fillRect(0, 0, w, h);
  return c;
}

export class Weather {
  constructor(cv) {
    this.cv = cv;
    this.g = cv.getContext('2d');
    this.kinds = [];
    this.a = 0;
    this.aT = 0;
    this.t = 0;
    this.dot = softDot(64, 0.3);
    this.bokeh = softDot(96, 0.55);
    this.fogTex = null;
    this.rays = null;
    addEventListener('resize', () => this.resize());
    this.resize();
  }
  resize() {
    const d = Math.min(1.5, devicePixelRatio || 1);
    this.w = innerWidth;
    this.h = innerHeight;
    this.d = d;
    this.cv.width = this.w * d;
    this.cv.height = this.h * d;
    this.rays = null;
    if (this.kinds.length) this._build();
  }
  set(kinds) {
    this.kinds = kinds.slice();
    this._build();
    this.aT = kinds.length ? 1 : 0;
  }
  off() {
    this.aT = 0;
  }
  _build() {
    const w = this.w,
      h = this.h,
      R = Math.random,
      has = k => this.kinds.includes(k),
      area = w * h;
    this.rain = has('rain')
      ? Array.from({ length: Math.round(area / 2600) }, () => ({
          x: R() * w,
          y: R() * h,
          z: Math.pow(R(), 1.6),
          l: 0.7 + R() * 0.6,
        }))
      : [];
    this.splash = [];
    this.snow = has('snow')
      ? Array.from({ length: Math.round(area / 5200) }, () => ({
          x: R() * w,
          y: R() * h,
          z: Math.pow(R(), 1.4),
          ph: R() * 6.28,
          tw: R() * 6.28,
        }))
      : [];
    this.ribbons = has('wind')
      ? Array.from({ length: 14 }, () => ({
          x: R() * w * 1.4 - w * 0.2,
          y: R() * h,
          l: 220 + R() * 380,
          sp: 180 + R() * 260,
          amp: 10 + R() * 26,
          ph: R() * 6.28,
          th: 6 + R() * 18,
          a: 0.04 + R() * 0.06,
        }))
      : [];
    this.dust = has('wind')
      ? Array.from({ length: 60 }, () => ({ x: R() * w, y: R() * h, z: R(), sp: 220 + R() * 260 }))
      : [];
    this.leaves = has('wind')
      ? Array.from({ length: 16 }, () => ({
          x: R() * w,
          y: R() * h,
          s: 4 + R() * 5,
          ph: R() * 6.28,
          sp: 140 + R() * 160,
          spin: 1.5 + R() * 2.5,
        }))
      : [];
    this.motes = has('sun')
      ? Array.from({ length: 80 }, () => ({ x: R() * w, y: R() * h, z: R(), ph: R() * 6.28 }))
      : [];
    if (has('fog') && !this.fogTex) this.fogTex = fogTexture();
  }
  frame(dt, o) {
    this.a += (this.aT - this.a) * Math.min(1, dt * 1.2);
    const g = this.g,
      w = this.w,
      h = this.h;
    const A = this.a * clamp(o.intensity || 1, 0.4, 1.4) * (o.show ?? 1);
    // nothing to draw: clear once, then leave the empty canvas alone (no repaint every frame)
    if (this.a < 0.01 || A < 0.01) {
      if (!this.blank) g.clearRect(0, 0, this.cv.width, this.cv.height);
      this.blank = true;
      return;
    }
    this.blank = false;
    g.setTransform(this.d, 0, 0, this.d, 0, 0);
    g.clearRect(0, 0, w, h);
    const sp = o.reduce ? 0.15 : 1;
    const paper = o.paper,
      ink = paper ? '58,46,36' : '226,234,255';
    this.t += dt * sp;
    const t = this.t,
      lx = o.lx * 34,
      ly = o.ly * 20,
      leaf = o.colors && o.colors[0] ? o.colors[0] : paper ? '#a0643a' : '#ffc890';

    if (this.kinds.includes('fog') && this.fogTex) {
      const T = this.fogTex,
        s = T.width;
      for (let L = 0; L < 3; L++) {
        const sc = 1.4 + L * 0.9,
          tw = s * sc,
          ox = (((t * (10 + L * 9) - lx * (0.3 + L * 0.3)) % tw) + tw) % tw,
          oy = h * (0.15 + L * 0.2) - ly * (0.2 + L * 0.2);
        g.globalAlpha = A * (paper ? 0.3 : 0.26) * (0.9 - L * 0.2);
        if (paper) g.globalCompositeOperation = 'source-over';
        for (let x = -ox; x < w; x += tw) g.drawImage(T, x, oy - tw * 0.3, tw, tw);
      }
      g.globalAlpha = 1;
    }

    if (this.motes.length) {
      if (!this.rays)
        this.rays = raysTexture(Math.round(w / 2), Math.round(h / 2), paper ? '255,214,150' : '255,226,175');
      g.save();
      g.globalCompositeOperation = paper ? 'multiply' : 'lighter';
      const br = 0.75 + 0.25 * Math.sin(t * 0.35);
      g.globalAlpha = A * (paper ? 0.45 : 0.7) * br;
      g.translate(w * 0.95 - lx * 0.4, -h * 0.1 - ly * 0.4);
      g.rotate(Math.sin(t * 0.05) * 0.03);
      g.translate(-w * 0.95, h * 0.1);
      g.drawImage(this.rays, 0, 0, w, h);
      g.restore();
      g.save();
      g.globalCompositeOperation = paper ? 'source-over' : 'lighter';
      for (let i = 0; i < 4; i++) {
        const k = 0.25 + i * 0.2,
          fx = w * 0.95 - (w * 0.95 - w * 0.3) * k - lx * (1 + i),
          fy = -h * 0.1 + h * 0.8 * k - ly * (1 + i),
          r = 18 + i * 14;
        const gr = g.createRadialGradient(fx, fy, 0, fx, fy, r);
        gr.addColorStop(0, `rgba(255,${200 + i * 10},${170 + i * 20},${0.1 * A})`);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.arc(fx, fy, r, 0, 7);
        g.fill();
      }
      for (const m of this.motes) {
        m.y -= (5 + 12 * m.z) * dt * sp;
        m.x += Math.sin(t * 0.6 + m.ph) * 6 * dt * sp;
        if (m.y < -12) {
          m.y = h + 12;
          m.x = Math.random() * w;
        }
        const s = 1.2 + m.z * m.z * 7,
          a = (0.3 + 0.4 * Math.sin(t * 1.3 + m.ph)) * A * (0.4 + m.z * 0.6);
        g.globalAlpha = Math.max(0, a);
        g.drawImage(m.z > 0.75 ? this.bokeh : this.dot, m.x - lx * m.z - s, m.y - ly * m.z - s, s * 2, s * 2);
      }
      g.restore();
      g.globalAlpha = 1;
    }

    if (this.ribbons.length) {
      g.lineCap = 'round';
      for (const p of this.ribbons) {
        p.x += p.sp * dt * sp;
        if (p.x - p.l > w + 60) {
          p.x = -60;
          p.y = Math.random() * h;
        }
        const y = p.y + Math.sin(t * 0.7 + p.ph) * p.amp - ly;
        const gr = g.createLinearGradient(p.x - p.l, 0, p.x, 0);
        gr.addColorStop(0, `rgba(${ink},0)`);
        gr.addColorStop(0.65, `rgba(${ink},${p.a * A})`);
        gr.addColorStop(1, `rgba(${ink},0)`);
        g.strokeStyle = gr;
        g.lineWidth = p.th;
        g.filter = 'blur(6px)';
        g.beginPath();
        g.moveTo(p.x - p.l - lx, y + p.amp * 0.6);
        g.bezierCurveTo(p.x - p.l * 0.66 - lx, y - p.amp, p.x - p.l * 0.33 - lx, y + p.amp, p.x - lx, y);
        g.stroke();
      }
      g.filter = 'none';
      for (const d of this.dust) {
        d.x += d.sp * (0.4 + d.z) * dt * sp;
        d.y += Math.sin(t * 2 + d.x * 0.01) * 12 * dt * sp;
        if (d.x > w + 10) {
          d.x = -10;
          d.y = Math.random() * h;
        }
        g.globalAlpha = A * (0.15 + 0.35 * d.z);
        const s = 0.8 + d.z * 1.8;
        g.drawImage(this.dot, d.x - lx * d.z - s * 3, d.y - ly * d.z - s, s * 6, s * 2);
      }
      for (const l of this.leaves) {
        l.x += l.sp * dt * sp;
        l.y += (Math.sin(t * 1.6 + l.ph) * 48 + 14) * dt * sp;
        if (l.x > w + 30) {
          l.x = -30;
          l.y = Math.random() * h * 0.9;
        }
        const flip = Math.cos(t * l.spin + l.ph);
        g.save();
        g.translate(l.x - lx, l.y - ly);
        g.rotate(t * l.spin * 0.6 + l.ph);
        g.scale(1, Math.max(0.15, Math.abs(flip)));
        g.globalAlpha = A * 0.75;
        g.fillStyle = leaf;
        g.beginPath();
        g.moveTo(-l.s * 1.8, 0);
        g.quadraticCurveTo(0, -l.s, l.s * 1.8, 0);
        g.quadraticCurveTo(0, l.s, -l.s * 1.8, 0);
        g.fill();
        g.globalAlpha = A * 0.35;
        g.strokeStyle = 'rgba(255,255,255,.6)';
        g.lineWidth = 0.6;
        g.beginPath();
        g.moveTo(-l.s * 1.6, 0);
        g.lineTo(l.s * 1.6, 0);
        g.stroke();
        g.restore();
      }
      g.globalAlpha = 1;
    }

    if (this.snow.length) {
      for (const f of this.snow) {
        const z = f.z,
          fall = 12 + 46 * z;
        f.y += fall * dt * sp;
        f.x += (Math.sin(t * 0.7 + f.ph + f.y * 0.01) * 18 + Math.sin(t * 0.21) * 10) * (0.4 + z) * dt * sp;
        if (f.y > h + 30) {
          f.y = -30;
          f.x = Math.random() * w;
        }
        const near = z > 0.8,
          s = near ? 8 + z * 14 : 1.2 + z * 5;
        let a = (near ? 0.25 : 0.4 + 0.5 * z) * A;
        if (!near && z > 0.45) a *= 0.8 + 0.4 * Math.max(0, Math.sin(t * 3 + f.tw));
        g.globalAlpha = a * (paper ? 0.65 : 1);
        g.drawImage(near ? this.bokeh : this.dot, f.x - lx * z - s, f.y - ly * z - s, s * 2, s * 2);
      }
      g.globalAlpha = 1;
    }

    if (this.rain.length) {
      const slant = 0.16;
      g.lineCap = 'round';
      const sheet = g.createLinearGradient(0, 0, w, h);
      sheet.addColorStop(0, `rgba(${ink},0)`);
      sheet.addColorStop(0.5, `rgba(${ink},${0.035 * A})`);
      sheet.addColorStop(1, `rgba(${ink},0)`);
      g.fillStyle = sheet;
      g.fillRect(0, 0, w, h);
      for (const r of this.rain) {
        const z = r.z,
          v = 480 + 900 * z;
        r.y += v * dt * sp;
        r.x += v * slant * dt * sp;
        if (r.y > h * (0.72 + z * 0.3)) {
          if (z > 0.35 && this.splash.length < 70) this.splash.push({ x: r.x - lx * z, y: r.y - ly * z, t: 0, z });
          r.y = -30 - Math.random() * 80;
          r.x = Math.random() * w * 1.15 - w * 0.15;
        }
        const x = r.x - lx * z,
          y = r.y - ly * z,
          len = (10 + 34 * z) * r.l;
        const gr = g.createLinearGradient(x, y - len, x, y);
        gr.addColorStop(0, `rgba(${ink},0)`);
        gr.addColorStop(1, `rgba(${ink},${(0.08 + 0.32 * z) * A})`);
        g.strokeStyle = gr;
        g.lineWidth = 0.6 + z * 1.4;
        g.beginPath();
        g.moveTo(x - len * slant, y - len);
        g.lineTo(x, y);
        g.stroke();
      }
      for (let i = this.splash.length - 1; i >= 0; i--) {
        const s = this.splash[i];
        s.t += dt * sp * 2.2;
        if (s.t >= 1) {
          this.splash.splice(i, 1);
          continue;
        }
        const rr = (3 + 14 * s.z) * s.t;
        g.strokeStyle = `rgba(${ink},${(1 - s.t) * 0.35 * A * s.z})`;
        g.lineWidth = 0.8;
        g.beginPath();
        g.ellipse(s.x, s.y, rr, rr * 0.3, 0, 0, 7);
        g.stroke();
      }
    }
  }
}
