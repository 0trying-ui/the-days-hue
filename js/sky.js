const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MAXD = 1.6;
const hexRgb = h => {
  const v = parseInt(h.replace('#', ''), 16);
  return [v >> 16, (v >> 8) & 255, v & 255];
};

export class Sky {
  constructor(cv) {
    this.cv = cv;
    this.g = cv.getContext('2d');
    this.dens = 1;
    this.densT = 1;
    this.t = 0;
    this.pal = [[214, 224, 255]];
    this.cache = new Map();
    this.ptr = { x: -999, y: -999 };
    addEventListener(
      'pointermove',
      e => {
        this.ptr.x = e.clientX;
        this.ptr.y = e.clientY;
      },
      { passive: true },
    );
    document.addEventListener('pointerleave', () => {
      this.ptr.x = this.ptr.y = -999;
    });
    addEventListener('resize', () => this.resize());
    this.resize(true);
  }
  resize(first) {
    const d = Math.min(2, devicePixelRatio || 1),
      ow = this.w,
      oh = this.h;
    this.w = innerWidth;
    this.h = innerHeight;
    this.d = d;
    this.cv.width = this.w * d;
    this.cv.height = this.h * d;
    if (first || !this.stars) this.gen();
    else
      this.stars.forEach(s => {
        s.x *= this.w / ow;
        s.y *= this.h / oh;
      });
  }
  setDensity(v) {
    this.densT = clamp(v, 0.2, MAXD);
  }
  setPalette(hexes) {
    const uniq = [...new Set(hexes.filter(Boolean).map(h => h.toLowerCase()))].slice(0, 24);
    if (!uniq.length) return;
    this.pal = uniq.map(hexRgb);
    if (this.stars)
      this.stars.forEach(s => {
        s.ci = Math.floor(Math.random() * this.pal.length);
      });
  }
  gen() {
    const n = clamp(Math.round(((this.w * this.h) / 12000) * MAXD), 50, 180);
    this.stars = Array.from({ length: n }, (_, i) => {
      const z = 0.25 + Math.random() * 0.75;
      return {
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        z,
        ph: Math.random() * 6.28,
        rank: Math.random(),
        vx: (Math.random() - 0.5) * 5 * z,
        vy: (Math.random() - 0.5) * 3 * z,
        big: Math.random() < 0.09,
        rot: Math.random() * 3.14,
        ci: Math.floor(Math.random() * this.pal.length),
        col: [214, 224, 255],
      };
    }).sort((a, b) => a.rank - b.rank);
  }
  sprite(r, g, b, paper) {
    const key = `${r >> 3},${g >> 3},${b >> 3},${paper}`;
    let s = this.cache.get(key);
    if (s) return s;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const core = paper
      ? `rgba(${(r * 0.45) | 0},${(g * 0.4) | 0},${(b * 0.38) | 0},`
      : `rgba(${Math.min(255, r + 70)},${Math.min(255, g + 70)},${Math.min(255, b + 70)},`;
    const halo = paper ? `rgba(${(r * 0.7) | 0},${(g * 0.65) | 0},${(b * 0.6) | 0},` : `rgba(${r},${g},${b},`;
    let gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, halo + '.55)');
    gr.addColorStop(0.25, halo + '.16)');
    gr.addColorStop(1, halo + '0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    gr = x.createRadialGradient(32, 32, 0, 32, 32, 5);
    gr.addColorStop(0, core + '1)');
    gr.addColorStop(1, core + '0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    // glint
    const gl = document.createElement('canvas');
    gl.width = gl.height = 96;
    const y = gl.getContext('2d');
    for (const [w, h] of [
      [96, 2.2],
      [2.2, 96],
    ]) {
      const lg = w > h ? y.createLinearGradient(0, 48, 96, 48) : y.createLinearGradient(48, 0, 48, 96);
      lg.addColorStop(0, halo + '0)');
      lg.addColorStop(0.5, core + '.7)');
      lg.addColorStop(1, halo + '0)');
      y.fillStyle = lg;
      y.fillRect(48 - w / 2, 48 - h / 2, w, h);
    }
    s = { dot: c, glint: gl };
    this.cache.set(key, s);
    return s;
  }
  frame(dt, o) {
    const g = this.g,
      w = this.w,
      h = this.h,
      d = this.d;
    this.t += dt * (o.reduce ? 0.1 : 1);
    this.dens += (this.densT - this.dens) * Math.min(1, dt * 2.2);
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, w, h);
    const fade = 1 - 0.75 * o.dive,
      paper = o.paper > 0.5;
    const S = this.stars,
      pos = new Array(S.length),
      vis = this.dens / MAXD;
    const kk = Math.min(1, dt * 1.5);
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      const tc = this.pal[s.ci % this.pal.length];
      s.col[0] += (tc[0] - s.col[0]) * kk;
      s.col[1] += (tc[1] - s.col[1]) * kk;
      s.col[2] += (tc[2] - s.col[2]) * kk;
      s.a = clamp((vis - s.rank) / 0.06 + 0.5, 0, 1);
      if (!o.reduce) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += dt * 0.05;
      }
      let x = s.x - o.scroll * 55 * s.z - o.lx * 42 * s.z,
        y = s.y - o.ly * 26 * s.z;
      x = ((x % w) + w) % w;
      y = ((y % h) + h) % h;
      const zoom = 1 + (o.depth || 0) * 2.4 * s.z * s.z;
      pos[i] = [w / 2 + (x - w / 2) * zoom, h / 2 + (y - h / 2) * zoom];
    }
    g.lineWidth = 0.6;
    const D = 135,
      px = this.ptr.x,
      py = this.ptr.y;
    for (let i = 0; i < S.length; i++) {
      if (S[i].a <= 0) continue;
      const a = pos[i];
      for (let j = i + 1; j < S.length; j++) {
        if (S[j].a <= 0) continue;
        const b = pos[j],
          dx = a[0] - b[0],
          dy = a[1] - b[1];
        if (dx > D || dx < -D || dy > D || dy < -D) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > D) continue;
        const al = (1 - dist / D) * 0.3 * Math.min(S[i].z, S[j].z) * fade * S[i].a * S[j].a;
        const c1 = S[i].col,
          c2 = S[j].col,
          m = paper ? 0.55 : 1;
        g.strokeStyle = `rgba(${((c1[0] + c2[0]) * 0.5 * m) | 0},${((c1[1] + c2[1]) * 0.5 * m) | 0},${((c1[2] + c2[2]) * 0.5 * m) | 0},${al.toFixed(3)})`;
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
      }
    }
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (s.a <= 0) continue;
      const [x, y] = pos[i],
        c = s.col;
      const dd = Math.hypot(x - px, y - py),
        near = dd < 170;
      if (near) {
        g.strokeStyle = `rgba(${(c[0] * (paper ? 0.55 : 1)) | 0},${(c[1] * (paper ? 0.55 : 1)) | 0},${(c[2] * (paper ? 0.55 : 1)) | 0},${((1 - dd / 170) * 0.45 * fade * s.a).toFixed(3)})`;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(px, py);
        g.stroke();
      }
      const tw = 0.62 + 0.38 * Math.sin(this.t * (0.6 + s.z) + s.ph);
      const sp = this.sprite(c[0], c[1], c[2], paper);
      const sz = (s.big ? 16 : 8) * (0.45 + s.z) * (near ? 1.35 : 1);
      g.globalAlpha = (s.big ? 0.95 : 0.7) * tw * fade * s.a;
      g.drawImage(sp.dot, x - sz, y - sz, sz * 2, sz * 2);
      if (s.big) {
        const gs = sz * 1.6 * (0.8 + 0.2 * tw);
        g.save();
        g.translate(x, y);
        g.rotate(s.rot);
        g.globalAlpha *= 0.55;
        g.drawImage(sp.glint, -gs, -gs, gs * 2, gs * 2);
        g.restore();
      }
    }
    g.globalAlpha = 1;
    if (o.mask) o.mask(g);
  }
}
