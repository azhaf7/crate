// Crate record page: a song sent as a sealed vinyl sleeve. Tap to open, the record slides out and spins.
// Link format: r/#song=<title>&by=<artist>&from=<sender>&note=<note>&art=<cover>&spotify=<id>&apple=<id>
// (the same fields as Vinyl Player's share links, so links from the Mac app open here too)
// (query-string parameters are read as a fallback). Artwork lookup, tint and needle-drop
// sound follow design/vinyl-shared.js so this page matches the player.
(() => {
  'use strict';

  const FALLBACK_TINT = '#8a6a4a';
  const RPM = 33.3;
  const SPIN_TAU = 600; // ms, spin-up time constant
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const $ = (id) => document.getElementById(id);
  const page = $('page'), stage = $('stage'), record = $('record');

  // ---- Link parameters ----
  // Only covers from Spotify's or Apple's image servers are shown.
  function artOK(u) {
    try { const h = new URL(u); return h.protocol === 'https:' && /(^|\.)(scdn\.co|mzstatic\.com|spotifycdn\.com)$/.test(h.hostname); }
    catch (e) { return false; }
  }

  function params() {
    const h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
    const g = (k) => (h.get(k) || q.get(k) || '').trim();
    const sp = g('spotify');
    const ap = g('apple');
    return { title: g('song') || 'Get Lucky', artist: g('by') || 'Daft Punk', from: g('from') || 'A friend', pet: g('pet'),
             note: g('note').slice(0, 80),
             spotify: /^[A-Za-z0-9]{22}$/.test(sp) ? sp : '',
             apple: /^\d{4,15}$/.test(ap) ? ap : '',
             art: artOK(g('art')) ? g('art') : '' };
  }

  // ---- Artwork (iTunes Search API, cached in localStorage) ----
  const AKEY = 'vinyl-art-v3';
  const readCache = () => { try { return JSON.parse(localStorage.getItem(AKEY)) || {}; } catch (e) { return {}; } };
  const writeCache = (c) => { try { localStorage.setItem(AKEY, JSON.stringify(c)); } catch (e) {} };
  const keyOf = (t) => (t.title + '|' + t.artist).toLowerCase();

  function pickResult(results, t) {
    const norm = (s) => (s || '').toLowerCase().replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/\s+-\s+.*$/, '').trim();
    const bad = /remix|live|karaoke|instrumental|acoustic|sped up|slowed|cover|tribute|8-bit|lullaby/i;
    const want = norm(t.title), artist = t.artist.toLowerCase();
    let best = null, bestScore = -Infinity;
    for (const x of results || []) {
      if (norm(x.trackName) !== want) continue;
      if (bad.test(x.trackName) || bad.test(x.collectionName)) continue;
      const an = (x.artistName || '').toLowerCase();
      let s = 10;
      if (an === artist) s += 6; else if (an.includes(artist)) s += 3; else continue;
      const album = x.collectionName || '';
      if (!/ - (single|ep)$/i.test(album)) s += 4;
      if (/deluxe|remaster|anniversary|expanded/i.test(album)) s -= 1;
      if (/greatest|hits|best of|collection|essentials|now that/i.test(album)) s -= 3;
      if (s > bestScore) { best = x; bestScore = s; }
    }
    return best;
  }

  // Dominant colour weighted by saturation² × (1 − |luminance − 0.5|) + 0.02, on a 300×300 downscale.
  function tintOf(img) {
    const S = 300, c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d'), m = Math.min(img.naturalWidth, img.naturalHeight);
    x.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, S, S);
    const d = x.getImageData(0, 0, S, S).data;
    let r = 0, g = 0, b = 0, w = 0;
    for (let p = 0; p < d.length; p += 16) {
      const R = d[p], G = d[p + 1], B = d[p + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      const sat = mx ? (mx - mn) / mx : 0, lum = (mx + mn) / 510, wt = sat * sat * (1 - Math.abs(lum - 0.5)) + 0.02;
      r += R * wt; g += G * wt; b += B * wt; w += wt;
    }
    const hex = (v) => Math.round(v / w).toString(16).padStart(2, '0');
    return '#' + hex(r) + hex(g) + hex(b);
  }

  function applyArt(entry) {
    if (!entry) return;
    if (entry.url) {
      const safe = entry.url.replace(/["\\\n]/g, encodeURIComponent);
      page.style.setProperty('--art', 'center / cover no-repeat url("' + safe + '"), linear-gradient(160deg, oklch(0.6 0.1 60), oklch(0.3 0.06 40))');
    }
    if (entry.tint) page.style.setProperty('--tint', entry.tint);
  }

  function measureTint(k, entry) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        entry.tint = tintOf(img);
        const c = readCache(); c[k] = entry; writeCache(c);
        applyArt(entry);
      } catch (e) { /* canvas tainted: keep the fallback tint */ }
    };
    img.src = entry.url;
  }

  function loadArtwork(t) {
    if (t.art) {
      // The link carries the exact cover: show it, then measure its colour.
      const entry = { url: t.art, tint: null };
      applyArt(entry);
      measureTint(keyOf(t), entry);
      return;
    }
    const k = keyOf(t), cached = readCache()[k];
    if (cached) {
      applyArt(cached);
      if (!cached.tint) measureTint(k, cached);
      return;
    }
    fetch('https://itunes.apple.com/search?media=music&entity=song&limit=25&term=' + encodeURIComponent(t.title + ' ' + t.artist))
      .then((r) => r.json())
      .then((j) => {
        const res = pickResult(j.results, t);
        if (!res || !res.artworkUrl100) return;
        const entry = { url: res.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.'), tint: null, album: res.collectionName };
        const c = readCache(); c[k] = entry; writeCache(c);
        applyArt(entry);
        measureTint(k, entry);
      })
      .catch(() => { /* offline: the abstract fallback art stays */ });
  }

  // ---- Needle drop: 90→38 Hz sine thump + band-passed noise tick ----
  function needleDrop() {
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    const c = new A(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.2);
    const n = c.createBufferSource(), buf = c.createBuffer(1, c.sampleRate * 0.08, c.sampleRate), ch = buf.getChannelData(0);
    for (let k = 0; k < ch.length; k++) ch[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / ch.length, 3);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.8;
    const ng = c.createGain(); ng.gain.value = 0.12;
    n.buffer = buf; n.connect(bp).connect(ng).connect(c.destination); n.start(t);
    setTimeout(() => c.close && c.close(), 600);
  }

  // ---- Spin: velocity eases toward 33⅓ rpm; the angle only ever accumulates ----
  let opened = false, angle = 0, vel = 0, last = 0, raf = 0;
  function tick(now) {
    const dt = Math.min(64, now - last); last = now;
    const target = opened ? RPM * 360 / 60000 * (reduceMotion.matches ? 0.12 : 1) : 0;
    vel += (target - vel) * (1 - Math.exp(-dt / SPIN_TAU));
    angle = (angle + vel * dt) % 360;
    record.style.transform = 'rotate(' + angle.toFixed(2) + 'deg)';
    raf = requestAnimationFrame(tick);
  }

  function open() {
    if (opened) return;
    opened = true;
    page.classList.add('is-open');
    stage.setAttribute('aria-disabled', 'true');
    stage.setAttribute('aria-label', 'Record opened');
    $('headline').textContent = params().note ? '“' + params().note + '”' : 'Now spinning';
    $('song').hidden = false;
    const p = params();
    document.title = p.title + ' · ' + p.artist;
    needleDrop();
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // ---- Render ----
  function render() {
    const p = params();
    const fromLine = p.from + (p.pet ? ' & ' + p.pet : '') + ' sent you a record';
    $('fromLine').textContent = fromLine;
    $('songTitle').textContent = p.title;
    $('songArtist').textContent = p.artist;
    const q = encodeURIComponent(p.title + ' ' + p.artist);
    $('spotifyLink').href = p.spotify ? 'https://open.spotify.com/track/' + p.spotify : 'https://open.spotify.com/search/' + q;
    $('appleLink').href = p.apple ? 'https://music.apple.com/song/' + p.apple : 'https://music.apple.com/search?term=' + q;
    if (p.note) $('headline').textContent = '“' + p.note + '”';
    showSaved(p);
    document.title = opened ? p.title + ' · ' + p.artist : fromLine;
    page.style.setProperty('--tint', FALLBACK_TINT);
    page.style.removeProperty('--art');
    loadArtwork(p);
  }

  // ---- Save in Crate: the friend's own crate, kept on this device ----
  const CRATE = 'crate-records-v1';
  const readCrate = () => { try { return JSON.parse(localStorage.getItem(CRATE)) || []; } catch (e) { return []; } };
  const idOf = (p) => (p.spotify || p.apple || (p.title + '|' + p.artist)).toLowerCase();
  function showSaved(p) {
    const saved = readCrate().some((r) => r.kind === 'received' && r.id === idOf(p));
    const b = $('saveBtn');
    b.dataset.saved = String(saved);
    b.textContent = saved ? 'Saved in Crate ✓' : 'Save in Crate';
    $('appLink').textContent = saved ? 'Open your records' : 'Make your own record on Crate';
    $('appLink').href = saved ? '../#/records' : '../';
  }
  $('saveBtn').addEventListener('click', () => {
    const p = params(), list = readCrate();
    if (!list.some((r) => r.kind === 'received' && r.id === idOf(p))) {
      list.unshift({ id: idOf(p), kind: 'received', title: p.title, artist: p.artist, from: p.from, note: p.note,
                     art: p.art || (readCache()[keyOf(p)] || {}).url || '', spotify: p.spotify, apple: p.apple, at: Date.now() });
      try { localStorage.setItem(CRATE, JSON.stringify(list.slice(0, 500))); } catch (e) {}
    }
    showSaved(p);
  });

  stage.addEventListener('click', open);
  window.addEventListener('hashchange', render);
  render();
})();
