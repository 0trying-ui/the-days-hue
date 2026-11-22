// Swipe trail for touch screens: a white "falling star" follows the finger. The head is thick and bright,
// the tail tapers to nothing and fades in a quarter of a second. Phones only (coarse pointer).
// The canvas never takes input (pointer-events: none) and the loop sleeps when there is nothing to draw.
const LIFE_MS = 260; // how long a point of the tail lives
const HEAD_W = 10; // px, width at the head
const MIN_STEP = 3; // px between recorded points

export function startTrail({ reduce = () => false, paper = () => false } = {}) {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const cv = document.createElement('canvas');
  cv.className = 'trail';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  let pts = [],
    raf = 0,
    active = null,
    d = 1;
  const size = () => {
    d = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * d;
    cv.height = innerHeight * d;
  };
  size();
  addEventListener('resize', size);

  // only swipes over the scene draw a trail, not taps on buttons, sheets or the slider
  const onScene = e =>
    !(e.target.closest && e.target.closest('button,input,textarea,select,a,.glass,.dock,.bmodal,.sheet,.menu'));
  addEventListener(
    'pointerdown',
    e => {
      if (e.pointerType === 'mouse' || reduce() || !onScene(e)) return;
      active = e.pointerId;
      pts = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    },
    { passive: true },
  );
  addEventListener(
    'pointermove',
    e => {
      if (e.pointerId !== active) return;
      const last = pts[pts.length - 1];
      if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < MIN_STEP) return;
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (!raf) raf = requestAnimationFrame(draw);
    },
    { passive: true },
  );
  const end = e => {
    if (e.pointerId === active) active = null;
  };
  addEventListener('pointerup', end, { passive: true });
  addEventListener('pointercancel', end, { passive: true });

  function draw(now) {
    raf = 0;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    pts = pts.filter(p => now - p.t < LIFE_MS);
    const n = pts.length;
    if (n < 2) {
      if (n && active !== null) raf = requestAnimationFrame(draw);
      return;
    }
    const ink = paper() ? '70,52,36' : '255,255,255';
    // outline of a tapering ribbon: width grows from 0 at the tail to HEAD_W at the head
    const left = [],
      right = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i],
        q = pts[Math.min(n - 1, i + 1)],
        o = pts[Math.max(0, i - 1)];
      let nx = -(q.y - o.y),
        ny = q.x - o.x;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const age = 1 - (now - p.t) / LIFE_MS,
        k = (i / (n - 1)) * age,
        w = (HEAD_W / 2) * Math.pow(k, 1.35);
      left.push([p.x + nx * w, p.y + ny * w]);
      right.push([p.x - nx * w, p.y - ny * w]);
    }
    const head = pts[n - 1],
      tail = pts[0];
    const ribbon = () => {
      g.beginPath();
      g.moveTo(left[0][0], left[0][1]);
      for (const [x, y] of left) g.lineTo(x, y);
      for (let i = right.length - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
      g.closePath();
    };
    const gr = g.createLinearGradient(tail.x, tail.y, head.x, head.y);
    gr.addColorStop(0, `rgba(${ink},0)`);
    gr.addColorStop(1, `rgba(${ink},1)`);
    // soft glow, then the bright body
    g.shadowColor = `rgba(${ink},0.8)`;
    g.shadowBlur = 14;
    g.fillStyle = gr;
    ribbon();
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = `rgba(${ink},1)`;
    g.beginPath();
    g.arc(head.x, head.y, HEAD_W / 2, 0, Math.PI * 2);
    g.fill();
    raf = requestAnimationFrame(draw);
  }
}
