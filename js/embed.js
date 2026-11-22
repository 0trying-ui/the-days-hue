/* EmbedSong: a song from a Spotify or SoundCloud link, played by the service's own official player
   (an invisible iframe), controlled like an <audio> element: play(), pause(), currentTime, duration,
   paused, volume, muted. The site never downloads or stores the song itself.
   Limits of the services: Spotify plays the full track only when the visitor is signed in to Spotify
   in this browser (otherwise a 30-second preview) and has no volume control; SoundCloud plays full tracks. */

const SPOTIFY_URI = /^spotify:(track|album|playlist|episode):[A-Za-z0-9]{10,32}$/;
const SOUNDCLOUD_URL = /^https:\/\/(api\.soundcloud\.com\/(tracks|playlists)\/\d+|(m\.)?soundcloud\.com\/[\w-]+\/[\w-]+(\/[\w-]+)?)$/;

// the address a player needs, from what we know about the link
export function embedOf(link, fromProxy) {
  if (fromProxy && (SPOTIFY_URI.test(fromProxy) || SOUNDCLOUD_URL.test(fromProxy)))
    return { svc: SPOTIFY_URI.test(fromProxy) ? 'spotify' : 'soundcloud', uri: fromProxy };
  try {
    const u = new URL(link);
    const sp = u.hostname === 'open.spotify.com' && u.pathname.match(/\/(track|album|playlist|episode)\/([A-Za-z0-9]{10,32})/);
    if (sp) return { svc: 'spotify', uri: `spotify:${sp[1]}:${sp[2]}` };
    const sc = u.protocol + '//' + u.hostname + u.pathname.replace(/\/+$/, '');
    if (SOUNDCLOUD_URL.test(sc)) return { svc: 'soundcloud', uri: sc };
  } catch {}
  return null;
}
export const SERVICE_NAME = { spotify: 'Spotify', soundcloud: 'SoundCloud' };

/* Where to start if the visitor did not choose: the first chorus of a pop song usually comes after the
   intro and first verse, around 25–35 % of its length. Short pieces simply start from the beginning. */
export function bestStart(dur) {
  if (!dur || dur < 75) return 0;
  return Math.round(Math.min(Math.max(dur * 0.28, 20), dur - 45));
}

/* SoundCloud's widget is driven by messages too (the protocol of its official api.js, which is not loaded,
   so no third-party script runs on the page): commands {method, value} as JSON, events come back the same way. */
const SC_HOST = 'https://w.soundcloud.com';
class SoundCloudCtl {
  constructor(f) {
    this.f = f;
    this.on = {};
    this.asks = {};
    this.onMsg = e => {
      if (e.source !== f.contentWindow || e.origin !== SC_HOST) return;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!m || typeof m.method !== 'string') return;
      const ask = this.asks[m.method];
      if (ask) {
        delete this.asks[m.method];
        ask(m.value);
      }
      (this.on[m.method] || []).forEach(fn => fn(m.value));
    };
    addEventListener('message', this.onMsg);
  }
  send(method, value) {
    this.f.contentWindow && this.f.contentWindow.postMessage(JSON.stringify({ method, value }), SC_HOST + '/player/');
  }
  bind(ev, fn) {
    (this.on[ev] ||= []).push(fn);
    if (ev !== 'ready') this.send('addEventListener', ev);
  }
  getDuration(cb) {
    this.asks.getDuration = cb;
    this.send('getDuration');
  }
  play() {
    this.send('play');
  }
  pause() {
    this.send('pause');
  }
  seekTo(ms) {
    this.send('seekTo', ms);
  }
  setVolume(v) {
    this.send('setVolume', v);
  }
  destroy() {
    removeEventListener('message', this.onMsg);
    this.f.remove();
  }
}

/* Spotify's embed player is driven by messages (the same ones its official iFrame API sends; that script
   itself is not loaded, because it needs eval, which the site's security policy forbids) */
const SPOTIFY_HOST = 'https://open.spotify.com';
class SpotifyCtl {
  constructor(host, uri, onReady, onUpdate) {
    const [, type, id] = uri.split(':');
    const f = (this.f = document.createElement('iframe'));
    f.allow = 'autoplay; encrypted-media';
    f.title = 'Spotify';
    f.src = SPOTIFY_HOST + '/embed/' + type + '/' + id + '?utm_source=iframe-api';
    this.q = [];
    this.loading = true;
    this.onMsg = e => {
      if (e.source !== f.contentWindow || e.origin !== SPOTIFY_HOST || !e.data) return;
      if (e.data.type === 'ready') {
        this.loading = false;
        this.q.splice(0).forEach(m => this.send(m));
        this.send({ command: 'load_complete_ack' });
        onReady();
      }
      if (e.data.type === 'playback_update' || e.data.type === 'playback_started') onUpdate(e.data.payload || {});
    };
    addEventListener('message', this.onMsg);
    host.appendChild(f);
  }
  send(m) {
    if (this.loading) return this.q.push(m);
    this.f.contentWindow && this.f.contentWindow.postMessage(m, SPOTIFY_HOST);
  }
  play() {
    this.send({ command: 'play' });
  }
  resume() {
    this.send({ command: 'resume' });
  }
  pause() {
    this.send({ command: 'pause' });
  }
  seek(t) {
    this.send({ command: 'seek', timestamp: t });
  }
  destroy() {
    removeEventListener('message', this.onMsg);
    this.f.remove();
  }
}

export class EmbedSong {
  /* box: the element the iframe lives in; opts.start: where to begin (seconds), or null to pick the best
     moment automatically once the length is known; opts.onState(): called on play, pause, progress */
  constructor(box, { svc, uri }, opts = {}) {
    this.box = box;
    this.svc = svc;
    this.uri = uri;
    this.opts = opts;
    this.paused = true;
    this._muted = false;
    this._vol = 1;
    this.duration = 0;
    this._pos = 0;
    this._at = 0; // when _pos was reported (performance.now)
    this._want = false; // play as soon as the player is ready
    this._started = false;
    this.failed = false;
    this.ready = this._mount().catch(e => {
      this.failed = true;
      console.warn('song player:', e.message);
      opts.onState && opts.onState(this);
    });
  }
  get currentTime() {
    return this.paused ? this._pos : this._pos + (performance.now() - this._at) / 1000;
  }
  set currentTime(t) {
    this.seek(t);
  }
  async _mount() {
    this.box.innerHTML = '';
    const host = document.createElement('div');
    this.box.appendChild(host);
    if (this.svc === 'spotify') {
      await new Promise((ok, fail) => {
        const t = setTimeout(() => fail(new Error('spotify player did not answer')), 15000);
        const c = new SpotifyCtl(
          host,
          this.uri,
          () => {
            clearTimeout(t);
            this.ctl = c;
            ok();
          },
          d => {
            if (d.duration) this.duration = d.duration / 1000;
            this._pos = (d.position || 0) / 1000;
            this._at = performance.now();
            const was = this.paused;
            this.paused = !!d.isPaused;
            if (!this.paused && !this._started && this.duration) {
              // first moments of playback: jump to the chosen or the best moment
              this._started = true;
              const s = this.opts.start != null ? this.opts.start : bestStart(this.duration);
              if (s > 1) c.seek(s);
            }
            if (was !== this.paused || !this.paused) this._emit();
          },
        );
      });
    } else {
      const f = document.createElement('iframe');
      f.allow = 'autoplay; encrypted-media';
      f.title = 'SoundCloud';
      f.src =
        'https://w.soundcloud.com/player/?url=' +
        encodeURIComponent(this.uri) +
        '&auto_play=false&visual=false&show_artwork=false&buying=false&sharing=false&download=false&show_comments=false&show_user=true&single_active=false';
      const w = new SoundCloudCtl(f);
      const ready = new Promise((ok, fail) => {
        const t = setTimeout(() => fail(new Error('soundcloud player did not answer')), 15000);
        w.bind('ready', () => (clearTimeout(t), ok()));
      });
      host.appendChild(f);
      await ready;
      this.ctl = w;
      this.duration = (await new Promise(ok => w.getDuration(ok))) / 1000;
      const s = this.opts.start != null ? this.opts.start : bestStart(this.duration);
      this._pos = s;
      const upd = e => {
        this._pos = (e && e.currentPosition != null ? e.currentPosition : 0) / 1000;
        this._at = performance.now();
      };
      w.bind('play', e => {
        upd(e);
        this.paused = false;
        if (!this._started) {
          this._started = true;
          if (s > 1) w.seekTo(s * 1000);
        }
        this._emit();
      });
      w.bind('pause', e => {
        upd(e);
        this.paused = true;
        this._emit();
      });
      w.bind('playProgress', upd);
      w.bind('finish', () => {
        // the song of the day plays in a loop, from its starting moment
        w.seekTo(s * 1000);
        w.play();
      });
      this._applyVolume();
    }
    if (this._want) this.play();
  }
  _emit() {
    this.opts.onState && this.opts.onState(this);
  }
  _applyVolume() {
    if (this.svc === 'soundcloud' && this.ctl) this.ctl.setVolume(this._muted ? 0 : Math.round(this._vol * 100));
  }
  get volume() {
    return this._vol;
  }
  set volume(v) {
    this._vol = v;
    this._applyVolume();
  }
  get muted() {
    return this._muted;
  }
  set muted(m) {
    this._muted = m;
    this._applyVolume();
    // Spotify's player has no volume control: when sound is off, it is paused instead
    if (this.svc === 'spotify' && m && !this.paused) this.pause();
  }
  play() {
    this._want = true;
    if (!this.ctl) return Promise.resolve();
    if (this.svc === 'spotify') {
      if (this._muted) return Promise.resolve();
      this._started ? this.ctl.resume() : this.ctl.play();
    } else this.ctl.play();
    return Promise.resolve();
  }
  pause() {
    this._want = false;
    if (!this.ctl) return;
    this.ctl.pause();
    this.paused = true;
  }
  seek(t) {
    t = Math.max(0, Math.min(this.duration || t, t));
    this._pos = t;
    this._at = performance.now();
    if (!this.ctl) return;
    if (this.svc === 'spotify') this.ctl.seek(t);
    else this.ctl.seekTo(t * 1000);
  }
  destroy() {
    try {
      this.pause();
      if (this.ctl) this.ctl.destroy();
    } catch {}
    this.box.innerHTML = '';
    this.ctl = null;
  }
}
