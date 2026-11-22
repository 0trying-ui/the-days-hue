// Entry ritual: the day's sphere becomes a drop of paint that falls into dark water.
//   1. fall    — the sphere pulls into a drop and falls under gravity, stretching with its speed;
//                the water surface and the drop's reflection appear below.
//   2. impact  — a crown of droplets flies up along parabolas and falls back, rings run across the surface.
//   3. bloom   — hundreds of paint particles sink and billow in a turbulent flow (viscosity, slight
//                buoyancy, curl noise), leaving smoky trails, like ink in a glass of water.
//   4. becoming the background — the paint grows until it fills the screen and dissolves into the day,
//                whose own background is painted in the same colours, so the change is seamless.
// Runs on its own canvas above the scene while the camera dives into the day underneath.
const T_FALL = 0.62, // drop reaches the water
  T_FILL = 2.05, // paint starts filling the whole screen
  T_FADE = 2.45, // overlay starts dissolving into the day
  T_END = 3.15;
const INK = 420, // paint particles
  CROWN = 26, // splash droplets
  G = 2600; // gravity, px/s²

const clamp01 = v => Math.max(0, Math.min(1, v));
const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const hexRgb = h => {
  const v = parseInt(String(h).replace('#', ''), 16) || 0xffc482;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
// a soft round sprite per colour, drawn scaled (much cheaper than gradients per particle)
function sprite([r, g, b]) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'),
    gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
  gr.addColorStop(0.45, `rgba(${r},${g},${b},.55)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  return c;
}
// smooth pseudo-random flow: the curl of a sum of sines, so particles swirl instead of drifting straight
function flow(x, y, t, s) {
  const a = Math.sin(x * s + t * 0.9) + Math.sin(y * s * 1.3 - t * 0.7) + Math.sin((x + y) * s * 0.7 + t * 0.4);
  const b = Math.cos(x * s * 1.1 - t * 0.6) + Math.cos(y * s * 0.9 + t * 0.8) + Math.cos((x - y) * s * 0.6 - t * 0.5);
  return [b, -a];
}

// the drop keeps a good part of the sphere, so it is clearly the same sphere falling
const dropR = r => Math.max(20, Math.min(40, r * 0.5));
// where the drop meets the water (screen px), so the scene can drop the real sphere there
export const RITUAL_FALL_SEC = T_FALL;
export function ritualTarget(r, y = innerHeight / 2) {
  const rDrop = dropR(r);
  return { x: innerWidth / 2, y: waterY(y) - rDrop, r: rDrop };
}
// on a computer the water is at 62 % of the height; on a tall screen (a phone) it lies at least 30 % of
// the height below the sphere, so the drop has room to fall and speed up
function waterY(y) {
  const H = innerHeight;
  return innerHeight > innerWidth ? Math.min(H * 0.84, Math.max(H * 0.62, y + H * 0.3)) : H * 0.62;
}
// the falling drop's tail: a spring (it lags behind the speed and swings a little, like real water)
const TAIL_K = 170, // stiffness
  TAIL_DAMP = 11, // damping
  TAIL_MAX = 2.6; // tail length at full speed, in body radii

/* track(): when given, the falling drop is the day's real sphere, drawn by the scene underneath; it returns
   its place on screen {x, y, r, speed}. The ritual then dims everything except a soft window around it and
   draws only the water and the reflection until the moment of impact. */
export function playRitual({ x, y, r, colors, paper = false, track = null }) {
  const cv = document.createElement('canvas');
  cv.className = 'ritual';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  const dpr = Math.min(1.5, devicePixelRatio || 1),
    W = innerWidth,
    H = innerHeight;
  cv.width = W * dpr;
  cv.height = H * dpr;
  const g = cv.getContext('2d');
  // paint lives on its own layer that is never fully cleared: its old strokes fade slowly into smoke
  const ink = document.createElement('canvas');
  ink.width = Math.ceil(W * dpr * 0.5);
  ink.height = Math.ceil(H * dpr * 0.5);
  const ig = ink.getContext('2d');
  ig.setTransform(dpr * 0.5, 0, 0, dpr * 0.5, 0, 0);

  const cols = (colors.length ? colors : ['#ffc482']).map(hexRgb);
  const sprites = cols.map(sprite);
  const ground = paper ? [237, 228, 211] : [5, 6, 13];
  const water = waterY(y),
    cx = W / 2,
    rDrop = dropR(r),
    scale = Math.min(W, H);

  const crown = [];
  const parts = [];
  const rings = [];
  let impacted = false;
  const t0 = performance.now();
  const tail = { L: 0, v: 0 };
  let last = t0,
    clock = 0; // ritual time; while the real sphere is still falling, it waits just before the impact

  return new Promise(done => {
    const frame = now => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      clock += dt;
      // the splash comes when the sphere really touches the water (the scene may run a little behind)
      if (track && clock > T_FALL - 0.02 && (now - t0) / 1000 < T_FALL + 1.5 && track()) clock = T_FALL - 0.02;
      const t = clock;
      const out = 1 - ease(clamp01((t - T_FADE) / (T_END - T_FADE)));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);

      // the world dims and the water appears
      const dim = ease(clamp01(t / 0.35));
      g.globalAlpha = out;
      g.fillStyle = `rgba(${ground},${0.9 * dim})`;
      g.fillRect(0, 0, W, H);
      const real = track && t < T_FALL ? track() : null;
      if (real) {
        // a window around the falling sphere, so the drop is the sphere itself
        g.save();
        g.globalCompositeOperation = 'destination-out';
        const hr = real.r * (1.7 + 0.6 * real.speed),
          hg = g.createRadialGradient(real.x, real.y, real.r * 0.4, real.x, real.y, hr);
        hg.addColorStop(0, 'rgba(0,0,0,1)');
        hg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = hg;
        g.fillRect(real.x - hr, real.y - hr, hr * 2, hr * 2);
        g.restore();
      }
      const wg = g.createLinearGradient(0, water, 0, H);
      wg.addColorStop(0, `rgba(${cols[0]},${0.1 * dim})`);
      wg.addColorStop(1, `rgba(${ground},${0.25 * dim})`);
      g.fillStyle = wg;
      g.fillRect(0, water, W, H - water);
      g.strokeStyle = `rgba(255,255,255,${0.16 * dim})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, water);
      g.lineTo(W, water);
      g.stroke();

      // 1. the fall: shrink to a drop, then fall with gravity; stretch with speed
      if (t < T_FALL) {
        const k = t / T_FALL,
          shrink = ease(clamp01(k / 0.35)),
          fallK = clamp01((k - 0.25) / 0.75),
          fx = x + (cx - x) * ease(clamp01(k / 0.6)),
          fy = y + (water - rDrop - y) * fallK * fallK,
          speed = fallK, // 0..1, grows with the fall
          rr = real ? real.r : r + (rDrop - r) * shrink;
        // reflection under the surface
        g.save();
        g.globalAlpha = 0.25 * dim * out;
        g.translate(real ? real.x : fx, water + (water - (real ? real.y : fy)));
        g.scale(1 - 0.25 * speed, -(1 + 0.6 * speed));
        g.drawImage(sprites[0], -rr, -rr, rr * 2, rr * 2);
        g.restore();
        // the drop: round body with a tail that stretches upwards as it speeds up
        if (real) {
          // the sphere itself falls; above it its paint is drawn out into the neck of a teardrop
          const s = real.speed,
            bw = real.r * 0.62 * (1 - 0.22 * s), // the body's visible half-width and half-height
            bh = real.r * 0.62 * (1 + 0.55 * s);
          tail.v += (TAIL_K * (TAIL_MAX * s * s - tail.L) - TAIL_DAMP * tail.v) * dt;
          tail.L = Math.max(0, tail.L + tail.v * dt);
          const L = tail.L * bw,
            neck = bw * (0.78 - 0.18 * Math.min(1, tail.L / TAIL_MAX)) * (1 + 0.05 * Math.sin(t * 31)),
            tipR = bw * 0.07;
          if (L > 1) {
            g.save();
            g.globalAlpha = out;
            g.translate(real.x, real.y);
            const gr = g.createLinearGradient(0, -bh * 0.35, 0, -bh - L);
            gr.addColorStop(0, `rgba(${cols[0]},0)`);
            gr.addColorStop(0.25, `rgba(${cols[0]},.9)`);
            gr.addColorStop(1, `rgba(${cols[1] || cols[0]},.75)`);
            g.fillStyle = gr;
            // a smooth teardrop: the sides leave the body tangentially and narrow into a rounded tip
            g.beginPath();
            g.moveTo(-neck, -bh * 0.4);
            g.bezierCurveTo(-neck * 0.95, -bh * 0.95, -tipR * 2.2, -bh - L * 0.62, -tipR, -bh - L + tipR);
            g.arc(0, -bh - L + tipR, tipR, Math.PI, 0);
            g.bezierCurveTo(tipR * 2.2, -bh - L * 0.62, neck * 0.95, -bh * 0.95, neck, -bh * 0.4);
            g.quadraticCurveTo(0, -bh * 0.15, -neck, -bh * 0.4);
            g.fill();
            // a thin highlight along one side, as on a real drop of liquid
            g.strokeStyle = 'rgba(255,255,255,.28)';
            g.lineWidth = Math.max(1, bw * 0.06);
            g.beginPath();
            g.moveTo(-neck * 0.62, -bh * 0.7);
            g.bezierCurveTo(-neck * 0.55, -bh * 1.0, -tipR * 1.6, -bh - L * 0.55, -tipR * 0.6, -bh - L * 0.85);
            g.stroke();
            g.restore();
          }
        } else {
        g.save();
        g.globalAlpha = out;
        g.translate(fx, fy);
        g.scale(1 - 0.22 * speed, 1 + 0.55 * speed);
        g.drawImage(sprites[0], -rr * 1.3, -rr * 1.3, rr * 2.6, rr * 2.6);
        g.fillStyle = `rgb(${cols[0]})`;
        g.beginPath();
        g.arc(0, 0, rr * 0.72, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.moveTo(-rr * 0.5, -rr * 0.35);
        g.quadraticCurveTo(0, -rr * (0.9 + 1.6 * speed), rr * 0.5, -rr * 0.35);
        g.fill();
        g.restore();
        }
      } else if (!impacted) {
        // 2. impact: the crown, the rings and the first cloud of paint
        impacted = true;
        for (let i = 0; i < CROWN; i++) {
          const a = Math.PI * (0.08 + 0.84 * (i / (CROWN - 1))),
            v = 380 + ((i * 53) % 9) * 45;
          crown.push({
            x: cx,
            y: water,
            vx: Math.cos(a) * v * 0.9,
            vy: -Math.sin(a) * v,
            r: 2 + ((i * 7) % 4),
            c: i % cols.length,
          });
        }
        for (let i = 0; i < 4; i++) rings.push({ t: -i * 0.12 });
        for (let i = 0; i < INK; i++) {
          const a = (i / INK) * Math.PI * 2 * 7.3,
            v = 110 + ((i * 97) % 320);
          parts.push({
            x: cx + Math.cos(a) * 4,
            y: water + 6,
            vx: Math.cos(a) * v * 0.9,
            vy: 180 + Math.abs(Math.sin(a)) * v * 1.4,
            s: 6 + ((i * 31) % 10),
            c: i % cols.length,
            life: 0,
          });
        }
      }

      if (impacted) {
        const k = t - T_FALL;
        // rings on the surface, slowing down
        for (const rg of rings) {
          rg.t += dt;
          if (rg.t <= 0) continue;
          const rr = 1 - Math.exp(-rg.t * 2.2);
          g.globalAlpha = Math.max(0, 0.6 - rg.t * 0.45) * out;
          g.strokeStyle = `rgb(${cols[0]})`;
          g.lineWidth = 1.6;
          g.beginPath();
          g.ellipse(cx, water, rr * scale * 0.55, rr * scale * 0.05, 0, 0, Math.PI * 2);
          g.stroke();
        }
        // the crown: ballistic droplets that fall back into the water
        for (const c of crown) {
          if (c.y > water + 2) continue;
          c.vy += G * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          g.globalAlpha = out;
          g.fillStyle = `rgb(${cols[c.c]})`;
          g.beginPath();
          g.ellipse(
            c.x,
            c.y,
            c.r,
            c.r * (1 + Math.min(1.5, Math.abs(c.vy) / 900)),
            Math.atan2(c.vy, c.vx) - Math.PI / 2,
            0,
            Math.PI * 2,
          );
          g.fill();
        }
        // 3. paint in water: viscosity slows the plume, a flow field curls it, it sinks and spreads
        ig.globalCompositeOperation = 'destination-out';
        ig.fillStyle = `rgba(0,0,0,${0.06})`;
        ig.fillRect(0, 0, W, H);
        ig.globalCompositeOperation = 'source-over';
        const visc = Math.exp(-dt * 1.25),
          grow = 1 + dt * (1.2 + clamp01((t - T_FILL) / 0.6) * 3.5);
        for (const p of parts) {
          const [fx, fy] = flow(p.x, p.y, t, 0.012);
          p.vx = p.vx * visc + fx * 170 * dt;
          p.vy = p.vy * visc + (fy * 170 - 22) * dt; // a little buoyancy keeps the cloud billowing
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.y < water + 2) {
            p.y = water + 2;
            p.vy = Math.abs(p.vy) * 0.3;
          }
          p.s *= grow;
          p.life += dt;
          const a = Math.min(1, p.life * 3) * 0.22;
          ig.globalAlpha = a;
          ig.drawImage(sprites[p.c], p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
        }
        // 4. the paint takes over the screen and becomes the day's background
        const fill = ease(clamp01((t - T_FILL) / (T_FADE - T_FILL + 0.25)));
        g.globalAlpha = out;
        g.drawImage(ink, 0, 0, W, H);
        if (fill > 0) {
          const bg = g.createRadialGradient(cx, water, 0, cx, water, scale * 1.1);
          bg.addColorStop(0, `rgba(${cols[0]},${0.85 * fill})`);
          bg.addColorStop(0.55, `rgba(${cols[1 % cols.length]},${0.7 * fill})`);
          bg.addColorStop(1, `rgba(${cols[2 % cols.length]},${0.55 * fill})`);
          g.globalAlpha = out * 0.9;
          g.fillStyle = bg;
          g.fillRect(0, 0, W, H);
        }
        if (k < 0.5) {
          // a soft flash where the drop met the water
          g.globalAlpha = (1 - k / 0.5) * 0.5 * out;
          g.drawImage(sprites[0], cx - 60, water - 60, 120, 120);
        }
      }
      g.globalAlpha = 1;
      if (t < T_END) requestAnimationFrame(frame);
      else {
        cv.remove();
        done();
      }
    };
    requestAnimationFrame(frame);
  });
}
