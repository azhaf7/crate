// Crate record page: a song sent as a sealed vinyl sleeve. Tap to open, the record slides out and spins.
// Link format: r/#song=<title>&by=<artist>&from=<sender>&note=<note>&art=<cover>&spotify=<id>&apple=<id>&id=<record>
// (the same fields as Vinyl Player's share links, so links from the Mac app open here too;
// query-string parameters are read as a fallback). Opening plays Apple's 30-second preview and,
// when the link has a record id, tells the sender it was opened.
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
    const song = g('song');
    // The demo record only shows when the link carries no song at all; never invent an artist.
    return { title: song || 'Get Lucky', artist: g('by') || (song ? '' : 'Daft Punk'), from: g('from') || 'A friend', pet: g('pet'),
             note: g('note').slice(0, 80),
             spotify: /^[A-Za-z0-9]{22}$/.test(sp) ? sp : '',
             apple: /^\d{4,15}$/.test(ap) ? ap : '',
             rid: /^[A-Za-z0-9]{12}$/.test(g('id')) ? g('id') : '',
             art: artOK(g('art')) ? g('art') : '',
             tracks: mixOf(g('mix')) };
  }

  // A mixtape's songs: [title, artist, apple, spotify, cover, line] each, 2 to 5 of them.
  function mixOf(raw) {
    let a = [];
    try { a = JSON.parse(raw || '[]'); } catch (e) { return null; }
    const ts = (Array.isArray(a) ? a : []).slice(0, 5).filter(Array.isArray).map((x) => ({
      title: String(x[0] || '').slice(0, 200), artist: String(x[1] || '').slice(0, 200),
      apple: /^\d{4,15}$/.test(x[2]) ? x[2] : '', spotify: /^[A-Za-z0-9]{22}$/.test(x[3]) ? x[3] : '',
      art: artOK(x[4]) ? x[4] : '', line: String(x[5] || '').slice(0, 80) })).filter((t) => t.title);
    return ts.length > 1 ? ts : null;
  }
  const cssURL = (u) => 'url("' + u.replace(/["\\\n]/g, encodeURIComponent) + '")';
  // A mixtape's sleeve is a collage of its first four covers.
  function mosaic(ts) {
    const arts = ts.map((t) => t.art).filter(Boolean).slice(0, 4);
    if (arts.length < 2) return '';
    return ['0 0', '100% 0', '0 100%', '100% 100%'].map((q, i) => cssURL(arts[i % arts.length]) + ' ' + q + ' / 50% 50% no-repeat').join(', ') +
      ', linear-gradient(160deg, oklch(0.6 0.1 60), oklch(0.3 0.06 40))';
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
    // A mixtape's sleeve keeps its collage; its first cover only sets the colour.
    if (entry.url && !params().tracks) {
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

  // ---- Preview: Apple's 30-second clip, found while the sleeve is still sealed ----
  // It's fetched on load so the tap that opens the record can start it straight away: phones only
  // allow sound to start inside a tap.
  function itunes(path) {
    const url = 'https://itunes.apple.com/' + path;
    return fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(() => new Promise((resolve, reject) => {
      const cb = 'crateCb' + Math.random().toString(36).slice(2), s = document.createElement('script');
      const done = (v, err) => { delete window[cb]; s.remove(); err ? reject(err) : resolve(v); };
      window[cb] = (j) => done(j);
      s.onerror = () => done(null, new Error('jsonp'));
      s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
      document.head.appendChild(s);
      setTimeout(() => window[cb] && done(null, new Error('timeout')), 8000);
    }));
  }

  // One 30-second preview per song: one for a record, up to five for a mixtape, played in order.
  const audio = new Audio();
  audio.preload = 'auto';
  let previewFor = '', songs = [], queue = [], qi = 0;
  function lookupPreview(t) {
    const pick = (j) => {
      const rs = (j && j.results) || [];
      return (t.apple && rs.find((x) => String(x.trackId) === t.apple)) || pickResult(rs, t) || null;
    };
    const look = t.apple ? itunes('lookup?entity=song&id=' + t.apple).then(pick) : Promise.resolve(null);
    return look.then((r) => r || itunes('search?media=music&entity=song&limit=25&term=' + encodeURIComponent(t.title + ' ' + t.artist)).then(pick))
      .then((r) => (r && r.previewUrl && /^https:\/\//.test(r.previewUrl) ? r.previewUrl : ''))
      .catch(() => '');
  }
  function findPreview(p) {
    const key = p.tracks ? p.tracks.map(keyOf).join(',') : keyOf(p);
    if (previewFor === key) return;
    previewFor = key;
    songs = p.tracks || [p];
    queue = songs.map(() => '');
    qi = 0;
    audio.pause(); audio.removeAttribute('src');
    paintPreview();
    songs.forEach((t, i) => lookupPreview(t).then((u) => {
      if (previewFor !== key) return;
      queue[i] = u;
      if (i === qi && u && !audio.getAttribute('src')) setTrack(i);
      paintPreview();
    }));
  }
  function setTrack(i) {
    qi = i;
    if (queue[i]) { audio.src = queue[i]; audio.load(); } else audio.removeAttribute('src');
    // On a mixtape the record's label turns to the cover of the song that's playing.
    if (songs.length > 1 && songs[i] && songs[i].art) document.querySelector('.record-label').style.background = 'center / cover no-repeat ' + cssURL(songs[i].art);
    paintPreview();
  }
  const nextWithPreview = (from) => { for (let i = from; i < queue.length; i++) if (queue[i]) return i; return -1; };

  function playPreview() {
    if (!audio.getAttribute('src')) { const n = nextWithPreview(0); if (n < 0) return; setTrack(n); }
    audio.play().catch(() => paintPreview());
  }

  function paintPreview() {
    const b = $('previewBtn'), has = queue.some(Boolean);
    b.hidden = !opened || !has;
    const playing = !audio.paused && !audio.ended, mix = songs.length > 1;
    b.setAttribute('aria-pressed', String(playing));
    b.setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview');
    $('previewLabel').textContent = playing ? (mix ? 'Playing ' + (qi + 1) + ' of ' + songs.length : 'Playing preview')
      : audio.ended ? 'Play again' : mix ? 'Play the mixtape' : 'Play preview';
    document.querySelectorAll('#tracklist li').forEach((li, i) => {
      li.classList.toggle('is-playing', playing && i === qi);
      li.classList.toggle('no-preview', !queue[i]);
    });
  }
  ['play', 'pause'].forEach((ev) => audio.addEventListener(ev, paintPreview));
  // A mixtape plays on to the next song.
  audio.addEventListener('ended', () => {
    const n = nextWithPreview(qi + 1);
    if (songs.length > 1 && n >= 0) { setTrack(n); audio.play().catch(() => paintPreview()); return; }
    paintPreview();
  });
  audio.addEventListener('timeupdate', () => {
    $('previewBar').style.transform = 'scaleX(' + (audio.duration ? audio.currentTime / audio.duration : 0) + ')';
  });
  $('previewBtn').addEventListener('click', () => {
    if (!audio.paused && !audio.ended) audio.pause();
    else if (audio.ended && songs.length > 1) { setTrack(nextWithPreview(0)); audio.play().catch(() => {}); }
    else { if (audio.ended) audio.currentTime = 0; playPreview(); }
  });

  // A mixtape's tracklist: tap a song to hear it, or open it in Spotify or Apple Music.
  function renderTracks(p) {
    const ol = $('tracklist');
    ol.textContent = '';
    ol.hidden = !p.tracks;
    $('mainActions').hidden = !!p.tracks;
    if (!p.tracks) return;
    p.tracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<button type="button" class="track"><span class="track-art"></span><span class="track-text"><b></b><span></span><i></i></span><span class="track-eq" aria-hidden="true"><i></i><i></i><i></i></span></button>' +
        '<span class="track-links"><a target="_blank" rel="noopener">Spotify</a><a target="_blank" rel="noopener">Apple</a></span>';
      if (t.art) li.querySelector('.track-art').style.background = 'center / cover no-repeat ' + cssURL(t.art);
      li.querySelector('b').textContent = t.title;
      li.querySelector('.track-text span').textContent = t.artist;
      li.querySelector('i').textContent = t.line;
      const q = encodeURIComponent(t.title + ' ' + t.artist), [sp, ap] = li.querySelectorAll('a');
      sp.href = t.spotify ? 'https://open.spotify.com/track/' + t.spotify : 'https://open.spotify.com/search/' + q;
      ap.href = t.apple ? 'https://music.apple.com/song/' + t.apple : 'https://music.apple.com/search?term=' + q;
      sp.setAttribute('aria-label', t.title + ' on Spotify'); ap.setAttribute('aria-label', t.title + ' on Apple Music');
      li.querySelector('.track').setAttribute('aria-label', 'Play ' + t.title + ' by ' + t.artist);
      li.querySelector('.track').addEventListener('click', () => {
        if (i === qi && !audio.paused) { audio.pause(); return; }
        if (!queue[i]) return;
        setTrack(i);
        audio.play().catch(() => paintPreview());
      });
      ol.appendChild(li);
    });
    paintPreview();
  }

  // ---- Telling the sender it was opened ----
  // Once per device, and never for the sender's own copy. Nothing about who opened it is sent.
  const cfg = window.CRATE || {};
  function reportOpen(p) {
    if (!p.rid || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
    const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
    if (readCrate().some((r) => r.kind === 'sent' && r.rid === p.rid)) return;
    const done = read('crate-opened', []);
    if (done.includes(p.rid)) return;
    const me = read('crate-auth', null), token = me && me.access && Date.now() < me.until ? me.access : cfg.supabaseAnonKey;
    fetch(cfg.supabaseUrl + '/rest/v1/rpc/open_record', {
      method: 'POST', keepalive: true,
      headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rid: p.rid }),
    }).then((r) => {
      if (!r.ok) return;
      try { localStorage.setItem('crate-opened', JSON.stringify([p.rid].concat(done).slice(0, 300))); } catch (e) {}
    }).catch(() => {});
  }

  // ---- Reactions: one tap tells the sender how it landed ----
  // Like opening, nothing about who reacted is sent. Remembered per device so the choice shows again.
  const REACTED = 'crate-reacted';
  function paintReact(p) {
    const box = $('react');
    box.hidden = !opened || !p.rid || !cfg.supabaseUrl || readCrate().some((r) => r.kind === 'sent' && r.rid === p.rid);
    let mine = '';
    try { mine = (JSON.parse(localStorage.getItem(REACTED)) || {})[p.rid] || ''; } catch (e) {}
    box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === mine)));
    $('reactLabel').textContent = mine ? (p.from === 'A friend' ? 'They’ll see it' : p.from + ' will see it') : 'How did it land?';
  }
  $('react').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-r]'), p = params();
    if (!b || !p.rid) return;
    const me = (() => { try { return JSON.parse(localStorage.getItem('crate-auth')); } catch (er) { return null; } })();
    const token = me && me.access && Date.now() < me.until ? me.access : cfg.supabaseAnonKey;
    fetch(cfg.supabaseUrl + '/rest/v1/rpc/react_record', {
      method: 'POST', keepalive: true,
      headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rid: p.rid, r: b.dataset.r }),
    }).catch(() => {});
    try {
      const all = JSON.parse(localStorage.getItem(REACTED)) || {};
      all[p.rid] = b.dataset.r;
      localStorage.setItem(REACTED, JSON.stringify(all));
    } catch (er) {}
    b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    paintReact(p);
  });

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
    document.title = p.title + (p.artist ? ' · ' + p.artist : '');
    playPreview();
    paintPreview();
    paintReact(p);
    reportOpen(p);
    last = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // ---- Render ----
  function render() {
    const p = params();
    const fromLine = p.from + (p.pet ? ' & ' + p.pet : '') + ' sent you a ' + (p.tracks ? 'mixtape' : 'record');
    $('fromLine').textContent = fromLine;
    $('songTitle').textContent = p.title;
    $('songArtist').textContent = p.artist;
    const q = encodeURIComponent(p.title + ' ' + p.artist);
    $('spotifyLink').href = p.spotify ? 'https://open.spotify.com/track/' + p.spotify : 'https://open.spotify.com/search/' + q;
    $('appleLink').href = p.apple ? 'https://music.apple.com/song/' + p.apple : 'https://music.apple.com/search?term=' + q;
    if (p.note) $('headline').textContent = '“' + p.note + '”';
    // Reply with a record: Make opens with their name already in To.
    const back = p.from && p.from !== 'A friend' ? p.from : '';
    const rq = [back ? 'to=' + encodeURIComponent(back) : '', p.rid ? 're=' + p.rid : ''].filter(Boolean).join('&');
    $('replyLink').href = '../#/' + (rq ? '?' + rq : '');
    $('replyLink').textContent = back ? 'Send ' + back + ' one back' : 'Send one back';
    paintReact(p);
    showSaved(p);
    document.title = opened ? p.title + (p.artist ? ' · ' + p.artist : '') : fromLine;
    page.style.setProperty('--tint', FALLBACK_TINT);
    page.style.removeProperty('--art');
    if (p.tracks) {
      $('songArtist').textContent = 'Mixtape · ' + p.tracks.length + ' songs';
      loadArtwork(Object.assign({}, p.tracks[0]));
      const m = mosaic(p.tracks);
      if (m) page.style.setProperty('--art', m);
      if (p.tracks[0].art) document.querySelector('.record-label').style.background = 'center / cover no-repeat ' + cssURL(p.tracks[0].art);
    } else {
      document.querySelector('.record-label').style.background = '';
      loadArtwork(p);
    }
    renderTracks(p);
    findPreview(p);
  }

  // ---- Save in Crate: the friend's own crate, kept on this device ----
  const CRATE = 'crate-records-v1';
  const readCrate = () => { try { return JSON.parse(localStorage.getItem(CRATE)) || []; } catch (e) { return []; } };
  const idOf = (p) => (p.tracks ? 'mix:' + p.tracks.map((t) => t.apple || t.spotify || t.title).join(',')
                                 : p.spotify || p.apple || p.title + '|' + p.artist).toLowerCase();
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
      list.unshift({ id: idOf(p), kind: 'received', title: p.title, artist: p.tracks ? 'Mixtape · ' + p.tracks.length + ' songs' : p.artist,
                     from: p.from, note: p.note, tracks: p.tracks || undefined,
                     art: p.art || (readCache()[keyOf(p)] || {}).url || '', spotify: p.spotify, apple: p.apple, at: Date.now() });
      try { localStorage.setItem(CRATE, JSON.stringify(list.slice(0, 500))); } catch (e) {}
    }
    showSaved(p);
  });

  stage.addEventListener('click', open);
  window.addEventListener('hashchange', render);
  render();
})();
