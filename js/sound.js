const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const SCALES = {
  major: [0, 2, 4, 7, 9, 12],
  minor: [0, 3, 5, 7, 10, 12],
  dorian: [0, 2, 3, 5, 7, 9, 10, 12],
  lydian: [0, 2, 4, 6, 7, 9, 11, 12],
  penta: [0, 2, 4, 7, 9, 12, 14],
};
const PROG = {
  major: [
    [0, 4, 7],
    [5, 9, 12],
    [7, 11, 14],
    [4, 7, 11],
  ],
  minor: [
    [0, 3, 7],
    [8, 12, 15],
    [5, 8, 12],
    [7, 10, 14],
  ],
  dorian: [
    [0, 3, 7, 10],
    [5, 9, 12, 15],
    [3, 7, 10, 14],
    [5, 9, 12, 16],
  ],
  lydian: [
    [0, 4, 7, 11],
    [2, 6, 9, 14],
    [7, 11, 14, 18],
    [2, 6, 9, 13],
  ],
  penta: [
    [0, 4, 7],
    [9, 12, 16],
    [5, 9, 12],
    [7, 11, 14],
  ],
};
// pad wave, pluck timbre, noise bed, soft beat and birds make each preset feel like a different place
export const PRESETS = {
  galaxy: { root: 45, mode: 'minor', bpm: 40, cutoff: 700, density: 0.12, wave: 'sine', pad: 0.5 },
  calm: { root: 57, mode: 'major', bpm: 58, cutoff: 1300, density: 0.28, wave: 'triangle', pad: 0.5 },
  tense: { root: 50, mode: 'minor', bpm: 108, cutoff: 2400, density: 0.65, wave: 'sawtooth', pad: 0.28 },
  bright: { root: 62, mode: 'major', bpm: 96, cutoff: 3400, density: 0.6, wave: 'triangle', pad: 0.4 },
  melancholy: { root: 52, mode: 'minor', bpm: 52, cutoff: 900, density: 0.22, wave: 'sine', pad: 0.55 },
  rainwin: {
    root: 50,
    mode: 'minor',
    bpm: 54,
    cutoff: 1100,
    density: 0.3,
    wave: 'sine',
    pad: 0.45,
    pluck: 'piano',
    noise: 'rain',
    noiseGain: 0.11,
  },
  ocean: {
    root: 55,
    mode: 'lydian',
    bpm: 46,
    cutoff: 1500,
    density: 0.16,
    wave: 'sine',
    pad: 0.55,
    pluck: 'bell',
    noise: 'waves',
    noiseGain: 0.16,
  },
  lofi: {
    root: 53,
    mode: 'dorian',
    bpm: 76,
    cutoff: 1700,
    density: 0.42,
    wave: 'triangle',
    pad: 0.38,
    pluck: 'piano',
    noise: 'vinyl',
    noiseGain: 0.06,
    beat: true,
  },
  musicbox: {
    root: 60,
    mode: 'major',
    bpm: 70,
    cutoff: 4200,
    density: 0.78,
    wave: 'sine',
    pad: 0.12,
    pluck: 'box',
    oct: 24,
  },
  morning: {
    root: 62,
    mode: 'lydian',
    bpm: 84,
    cutoff: 2800,
    density: 0.45,
    wave: 'triangle',
    pad: 0.35,
    pluck: 'bell',
    birds: 0.35,
  },
  aurora: {
    root: 49,
    mode: 'minor',
    bpm: 38,
    cutoff: 2200,
    density: 0.12,
    wave: 'sine',
    pad: 0.6,
    pluck: 'bell',
    shimmer: true,
  },
  forest: {
    root: 57,
    mode: 'penta',
    bpm: 64,
    cutoff: 2000,
    density: 0.3,
    wave: 'triangle',
    pad: 0.4,
    pluck: 'piano',
    birds: 0.8,
    noise: 'waves',
    noiseGain: 0.04,
  },
  deep: {
    root: 38,
    mode: 'minor',
    bpm: 30,
    cutoff: 500,
    density: 0.07,
    wave: 'sine',
    pad: 0.65,
    pluck: 'bell',
    noise: 'brown',
    noiseGain: 0.05,
  },
};

// the day's song heard from under water (see attach)
const UNDERWATER_HZ = 750,
  UNDERWATER_SWAY_HZ = 160,
  UNDERWATER_LEVEL = 0.8;

export class Ambient {
  constructor() {
    this.ctx = null;
    this.vol = 0.6;
    this.enabled = true;
    this.duck = 1;
    this.voice = null;
    this.bpm = 60;
    this.t0 = 0;
  }
  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    const comp = this.ctx.createDynamicsCompressor();
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 128;
    this.an.smoothingTimeConstant = 0.82;
    this.bins = new Uint8Array(this.an.frequencyBinCount);
    this.master.connect(comp);
    comp.connect(this.an);
    this.an.connect(this.ctx.destination);
    this.delay = this.ctx.createDelay(1.5);
    this.delay.delayTime.value = 0.45;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.35;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.4;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(wet);
    wet.connect(this.master);
    this.t0 = performance.now();
    this._level();
  }
  _level(t = 1.5) {
    if (!this.ctx) return;
    const v = this.enabled ? this.vol * 0.35 * this.duck : 0;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, t / 3);
  }
  setVolume(v) {
    this.vol = v;
    this._level(0.3);
  }
  setEnabled(b) {
    this.enabled = b;
    this._level(0.4);
  }
  setDuck(d) {
    this.duck = d;
    this._level(0.8);
  }
  play(name, over = {}) {
    if (!this.ctx) return;
    const p = { ...(PRESETS[name] || PRESETS.calm), ...over };
    this.bpm = p.bpm;
    const old = this.voice;
    if (old) this._stopVoice(old);
    this.voice = this._start(p);
  }
  stop() {
    if (this.voice) this._stopVoice(this.voice);
    this.voice = null;
  }
  _stopVoice(v) {
    v.dead = true;
    clearTimeout(v.timer);
    const t = this.ctx.currentTime;
    v.out.gain.cancelScheduledValues(t);
    v.out.gain.setTargetAtTime(0, t, 0.7);
    setTimeout(() => {
      v.nodes.forEach(n => {
        try {
          n.stop();
        } catch {}
      });
      v.out.disconnect();
    }, 4000);
  }
  _start(p) {
    const ctx = this.ctx,
      v = { dead: false, nodes: [], timer: 0 };
    v.out = ctx.createGain();
    v.out.gain.value = 0;
    v.out.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = p.cutoff;
    lp.Q.value = 0.6;
    lp.connect(v.out);
    v.out.connect(this.master);
    const lfo = ctx.createOscillator(),
      lg = ctx.createGain();
    lfo.frequency.value = 0.07;
    lg.gain.value = p.cutoff * 0.25;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    v.nodes.push(lfo);
    const beat = 60 / p.bpm,
      chordLen = beat * 4;
    const prog = PROG[p.mode] || PROG.major,
      scale = SCALES[p.mode] || SCALES.major;
    let ci = 0;
    if (p.noise) this._noiseBed(p, v);
    if (p.shimmer) this._shimmer(p, v);
    const chord = () => {
      if (v.dead) return;
      const t = ctx.currentTime,
        ch = prog[ci++ % prog.length];
      ch.forEach((semi, k) => {
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = p.wave;
        o.frequency.value = midi(p.root + semi);
        o.detune.value = (k - 1) * 7;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16 * p.pad, t + chordLen * 0.35);
        g.gain.linearRampToValueAtTime(0, t + chordLen * 1.25);
        o.connect(g);
        g.connect(lp);
        o.start(t);
        o.stop(t + chordLen * 1.3);
      });
      const bo = ctx.createOscillator(),
        bg = ctx.createGain();
      bo.type = 'sine';
      bo.frequency.value = midi(p.root - 12 + ch[0]);
      bg.gain.setValueAtTime(0, t);
      bg.gain.linearRampToValueAtTime(0.2, t + 1);
      bg.gain.linearRampToValueAtTime(0, t + chordLen * 1.2);
      bo.connect(bg);
      bg.connect(v.out);
      bo.start(t);
      bo.stop(t + chordLen * 1.3);
      for (let i = 0; i < 8; i++)
        if (Math.random() < p.density) {
          const at = t + i * beat * 0.5 + (p.beat && i % 2 ? beat * 0.08 : 0),
            n = p.root + (p.oct ?? 12) + scale[Math.floor(Math.random() * scale.length)];
          this._pluck(p.pluck || 'sine', midi(n), at, beat, v);
        }
      if (p.beat)
        for (let i = 0; i < 4; i++) {
          const at = t + i * beat;
          if (i % 2 === 0) this._kick(at, v);
          this._hat(at + beat * 0.5 + beat * 0.06, v, 0.022);
          if (Math.random() < 0.3) this._hat(at + beat * 0.75, v, 0.012);
        }
      if (p.noise === 'rain') for (let i = 0; i < 10; i++) this._drop(t + Math.random() * chordLen, v);
      if (p.noise === 'vinyl') for (let i = 0; i < 14; i++) this._crackle(t + Math.random() * chordLen, v);
      if (p.birds && Math.random() < p.birds) {
        const b0 = t + Math.random() * chordLen * 0.7;
        for (let k = 0, n = 2 + Math.floor(Math.random() * 4); k < n; k++)
          this._chirp(b0 + k * (0.09 + Math.random() * 0.08), v);
      }
      v.timer = setTimeout(chord, chordLen * 1000 * 0.98);
    };
    chord();
    return v;
  }
  _noiseBuf(kind) {
    this._nb = this._nb || {};
    if (this._nb[kind]) return this._nb[kind];
    const ctx = this.ctx,
      len = ctx.sampleRate * 4,
      buf = ctx.createBuffer(1, len, ctx.sampleRate),
      d = buf.getChannelData(0);
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        b0 = 0.997 * b0 + w * 0.029;
        b1 = 0.985 * b1 + w * 0.032;
        b2 = 0.95 * b2 + w * 0.048;
        d[i] = (b0 + b1 + b2 + w * 0.02) * 1.2;
      }
    }
    return (this._nb[kind] = buf);
  }
  _noiseBed(p, v) {
    const ctx = this.ctx,
      src = ctx.createBufferSource(),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    src.buffer = this._noiseBuf(p.noise === 'waves' || p.noise === 'brown' ? 'brown' : 'pink');
    src.loop = true;
    if (p.noise === 'rain') {
      f.type = 'bandpass';
      f.frequency.value = 2600;
      f.Q.value = 0.4;
    } else if (p.noise === 'vinyl') {
      f.type = 'bandpass';
      f.frequency.value = 1200;
      f.Q.value = 0.8;
    } else {
      f.type = 'lowpass';
      f.frequency.value = p.noise === 'waves' ? 700 : 260;
    }
    g.gain.value = p.noiseGain || 0.06;
    src.connect(f);
    f.connect(g);
    g.connect(v.out);
    src.start();
    v.nodes.push(src);
    if (p.noise === 'waves') {
      const l = ctx.createOscillator(),
        lg = ctx.createGain();
      l.frequency.value = 0.11;
      lg.gain.value = (p.noiseGain || 0.1) * 0.9;
      l.connect(lg);
      lg.connect(g.gain);
      l.start();
      v.nodes.push(l);
      const l2 = ctx.createOscillator(),
        lg2 = ctx.createGain();
      l2.frequency.value = 0.11;
      lg2.gain.value = 500;
      l2.connect(lg2);
      lg2.connect(f.frequency);
      l2.start();
      v.nodes.push(l2);
    }
  }
  _shimmer(p, v) {
    const ctx = this.ctx;
    [24, 31, 36].forEach((semi, k) => {
      const o = ctx.createOscillator(),
        g = ctx.createGain(),
        l = ctx.createOscillator(),
        lg = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = midi(p.root + semi);
      o.detune.value = (k - 1) * 9;
      g.gain.value = 0.012;
      l.frequency.value = 0.05 + k * 0.03;
      lg.gain.value = 0.012;
      l.connect(lg);
      lg.connect(g.gain);
      o.connect(g);
      g.connect(v.out);
      g.connect(this.delay);
      o.start();
      l.start();
      v.nodes.push(o, l);
    });
  }
  _pluck(kind, f, at, beat, v) {
    const ctx = this.ctx,
      g = ctx.createGain(),
      dec = kind === 'bell' ? beat * 3.2 : kind === 'box' ? beat * 0.9 : kind === 'piano' ? beat * 1.6 : beat * 1.8;
    const vol = kind === 'box' ? 0.07 : kind === 'bell' ? 0.06 : 0.085;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0006, at + dec);
    g.connect(v.out);
    g.connect(this.delay);
    const parts =
      kind === 'bell'
        ? [
            [1, 1],
            [2.76, 0.35],
            [5.4, 0.12],
          ]
        : kind === 'box'
          ? [
              [1, 1],
              [3, 0.25],
            ]
          : kind === 'piano'
            ? [
                [1, 1],
                [2, 0.3],
                [3, 0.12],
              ]
            : [[1, 1]];
    parts.forEach(([m, a]) => {
      const o = ctx.createOscillator(),
        og = ctx.createGain();
      o.type = kind === 'box' ? 'triangle' : 'sine';
      o.frequency.value = f * m;
      og.gain.value = a;
      o.connect(og);
      og.connect(g);
      o.start(at);
      o.stop(at + dec + 0.05);
    });
  }
  _kick(at, v) {
    const ctx = this.ctx,
      o = ctx.createOscillator(),
      g = ctx.createGain();
    o.frequency.setValueAtTime(120, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.18);
    g.gain.setValueAtTime(0.22, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.32);
    o.connect(g);
    g.connect(v.out);
    o.start(at);
    o.stop(at + 0.35);
  }
  _hat(at, v, vol) {
    const ctx = this.ctx,
      s = ctx.createBufferSource(),
      f = ctx.createBiquadFilter(),
      g = ctx.createGain();
    s.buffer = this._noiseBuf('pink');
    f.type = 'highpass';
    f.frequency.value = 7000;
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0005, at + 0.06);
    s.connect(f);
    f.connect(g);
    g.connect(v.out);
    s.start(at, Math.random() * 3, 0.08);
  }
  _drop(at, v) {
    const ctx = this.ctx,
      o = ctx.createOscillator(),
      g = ctx.createGain(),
      f = 1800 + Math.random() * 2200;
    o.type = 'sine';
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * 0.55, at + 0.05);
    g.gain.setValueAtTime(0.012 + Math.random() * 0.012, at);
    g.gain.exponentialRampToValueAtTime(0.0004, at + 0.07);
    o.connect(g);
    g.connect(v.out);
    o.start(at);
    o.stop(at + 0.08);
  }
  _crackle(at, v) {
    const ctx = this.ctx,
      s = ctx.createBufferSource(),
      g = ctx.createGain();
    s.buffer = this._noiseBuf('pink');
    g.gain.setValueAtTime(0.05 + Math.random() * 0.06, at);
    g.gain.exponentialRampToValueAtTime(0.0005, at + 0.012);
    s.connect(g);
    g.connect(v.out);
    s.start(at, Math.random() * 3, 0.015);
  }
  _chirp(at, v) {
    const ctx = this.ctx,
      o = ctx.createOscillator(),
      g = ctx.createGain(),
      f = 2600 + Math.random() * 1600;
    o.type = 'sine';
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * (1.3 + Math.random() * 0.4), at + 0.06);
    o.frequency.exponentialRampToValueAtTime(f * 0.9, at + 0.11);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.018, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0004, at + 0.12);
    o.connect(g);
    g.connect(v.out);
    g.connect(this.delay);
    o.start(at);
    o.stop(at + 0.13);
  }
  /* attach(el, { underwater }): plays an <audio> through the analyser (bars, beat).
     Underwater: the day's own song sounds as if heard from under water — two low-pass filters cut the
     sharp highs (24 dB/oct around 750 Hz), the cut-off sways slowly like a moving surface, the level is a
     little lower and a soft echo from the shared delay adds depth. */
  attach(el, { underwater = false } = {}) {
    if (!this.ctx) return;
    try {
      const s = this.ctx.createMediaElementSource(el);
      if (!underwater) return s.connect(this.an);
      const ctx = this.ctx,
        f1 = ctx.createBiquadFilter(),
        f2 = ctx.createBiquadFilter(),
        lvl = ctx.createGain(),
        echo = ctx.createGain(),
        lfo = ctx.createOscillator(),
        sway = ctx.createGain();
      for (const f of [f1, f2]) {
        f.type = 'lowpass';
        f.frequency.value = UNDERWATER_HZ;
        f.Q.value = 0.6;
      }
      lfo.frequency.value = 0.13;
      sway.gain.value = UNDERWATER_SWAY_HZ;
      lfo.connect(sway);
      sway.connect(f1.frequency);
      sway.connect(f2.frequency);
      lfo.start();
      lvl.gain.value = UNDERWATER_LEVEL;
      echo.gain.value = 0.18;
      s.connect(f1);
      f1.connect(f2);
      f2.connect(lvl);
      lvl.connect(this.an);
      lvl.connect(echo);
      echo.connect(this.delay);
    } catch (e) {
      console.warn(e);
    }
  }
  bands(n) {
    const out = new Array(n).fill(0);
    if (!this.an) return out;
    this.an.getByteFrequencyData(this.bins);
    const m = this.bins.length * 0.7;
    for (let i = 0; i < n; i++) {
      const a = Math.floor(Math.pow(i / n, 1.6) * m),
        b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 1.6) * m));
      let s = 0;
      for (let j = a; j < b; j++) s += this.bins[j];
      out[i] = s / (b - a) / 255;
    }
    return out;
  }
  beat() {
    return (((performance.now() - this.t0) / 1000) * this.bpm) / 60;
  }
}
