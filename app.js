// Crate: paste a Spotify or Apple Music link, get a sealed record to send. Records you open or send
// are kept on this device. With Spotify connected, the Library lists your own music.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const CRATE = 'crate-records-v1';           // shared with the record page (r/)
  const FROM = 'crate-from';
  const SPOTIFY_TOKENS = 'crate-spotify';
  const cfg = window.CRATE || {};

  // ---------- Small helpers ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const artOK = (u) => { try { const h = new URL(u); return h.protocol === 'https:' && /(^|\.)(scdn\.co|mzstatic\.com|spotifycdn\.com)$/.test(h.hostname); } catch (e) { return false; } };
  const big = (u) => (u || '').replace(/\/\d+x\d+bb\./, '/600x600bb.');
  const cssURL = (u) => 'url("' + u.replace(/["\\\n]/g, encodeURIComponent) + '")';
  const artCSS = (u) => (u && artOK(u) ? 'center / cover no-repeat ' + cssURL(u) + ', ' : '') + 'linear-gradient(160deg, #c9b79c, #6f5e48)';
  const idOf = (r) => (r.spotify || r.apple || (r.title + '|' + r.artist)).toLowerCase();

  function fetchJSON(url, ms = 8000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    return fetch(url, { signal: ctl.signal }).then((r) => { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  // The iTunes API also answers as JSONP, which works even where a browser blocks the plain request.
  function itunes(path) {
    const url = 'https://itunes.apple.com/' + path;
    return fetchJSON(url).catch(() => new Promise((resolve, reject) => {
      const cb = 'crateCb' + Math.random().toString(36).slice(2);
      const s = document.createElement('script');
      const done = (v, err) => { delete window[cb]; s.remove(); err ? reject(err) : resolve(v); };
      window[cb] = (j) => done(j);
      s.onerror = () => done(null, new Error('jsonp'));
      s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
      document.head.appendChild(s);
      setTimeout(() => window[cb] && done(null, new Error('timeout')), 8000);
    }));
  }

  // ---------- Reading a pasted link ----------
  function parseLink(text) {
    const s = (text || '').trim();
    let m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})/) || s.match(/^spotify:track:([A-Za-z0-9]{22})$/);
    if (m) return { kind: 'spotify', id: m[1], url: 'https://open.spotify.com/track/' + m[1] };
    if (/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(album|playlist|artist|episode|show)\//.test(s)) return { kind: 'unsupported', what: RegExp.$1 };
    m = s.match(/music\.apple\.com\/.*[?&]i=(\d+)/) || s.match(/music\.apple\.com\/[a-z]{2}\/song\/[^/]*\/(\d+)/) || s.match(/music\.apple\.com\/[a-z]{2}\/song\/(\d+)/);
    if (m) return { kind: 'apple', id: m[1], url: s };
    if (/music\.apple\.com\/.*\/(album|playlist|artist)\//.test(s)) return { kind: 'unsupported', what: RegExp.$1 };
    if (/^https?:\/\/(spotify\.link|link\.tospotify\.com|song\.link|album\.link|odesli\.co|youtu\.?be|music\.youtube\.com|www\.youtube\.com)/.test(s)) return { kind: 'other', url: s };
    return null;
  }

  // song.link knows a song on every platform: title, artist, cover and the links for each.
  function viaSongLink(url) {
    return fetchJSON('https://api.song.link/v1-alpha.1/links?userCountry=US&url=' + encodeURIComponent(url)).then((j) => {
      const ents = j.entitiesByUniqueId || {};
      const main = ents[j.entityUniqueId] || {};
      const apple = Object.values(ents).find((e) => e.apiProvider === 'itunes');
      const spotify = Object.values(ents).find((e) => e.apiProvider === 'spotify');
      const links = j.linksByPlatform || {};
      const spId = (links.spotify && (links.spotify.url.match(/track\/([A-Za-z0-9]{22})/) || [])[1]) || (spotify && spotify.id) || '';
      const apId = (links.appleMusic && (links.appleMusic.url.match(/[?&]i=(\d+)/) || [])[1]) || (apple && apple.id) || '';
      if (!main.title) throw new Error('no title');
      return {
        title: main.title, artist: main.artistName || '',
        art: big((apple && apple.thumbnailUrl) || main.thumbnailUrl || ''),
        spotify: /^[A-Za-z0-9]{22}$/.test(spId) ? spId : '', apple: /^\d+$/.test(apId) ? apId : '',
      };
    });
  }

  function viaApple(id) {
    return itunes('lookup?entity=song&id=' + id).then((j) => {
      const r = (j.results || []).find((x) => x.wrapperType === 'track') || (j.results || [])[0];
      if (!r) throw new Error('not found');
      return { title: r.trackName, artist: r.artistName, art: big(r.artworkUrl100), spotify: '', apple: String(r.trackId) };
    });
  }

  // Spotify's public embed info has the title and cover; the artist comes from Apple's catalogue.
  function viaSpotify(id) {
    return fetchJSON('https://open.spotify.com/oembed?url=' + encodeURIComponent('https://open.spotify.com/track/' + id)).then((o) => {
      if (!o.title) throw new Error('no title');
      return itunes('search?media=music&entity=song&limit=5&term=' + encodeURIComponent(o.title)).then((j) => {
        const r = (j.results || [])[0];
        return { title: o.title, artist: r ? r.artistName : '', art: o.thumbnail_url || (r ? big(r.artworkUrl100) : ''), spotify: id, apple: r ? String(r.trackId) : '' };
      }, () => ({ title: o.title, artist: '', art: o.thumbnail_url || '', spotify: id, apple: '' }));
    });
  }

  // A cover from Apple for songs typed in by hand or missing one.
  function findCover(rec) {
    return itunes('search?media=music&entity=song&limit=10&term=' + encodeURIComponent(rec.title + ' ' + rec.artist)).then((j) => {
      const want = rec.title.toLowerCase(), r = (j.results || []).find((x) => (x.trackName || '').toLowerCase() === want) || (j.results || [])[0];
      if (r) { rec.art = rec.art || big(r.artworkUrl100); rec.apple = rec.apple || String(r.trackId); }
      return rec;
    }).catch(() => rec);
  }

  async function resolve(text) {
    const link = parseLink(text);
    if (!link) throw Object.assign(new Error('That doesn’t look like a Spotify or Apple Music song link.'), { soft: true });
    if (link.kind === 'unsupported') throw Object.assign(new Error('That’s a link to a whole ' + link.what + '. Paste a link to one song.'), { soft: true });
    const tries = [() => viaSongLink(link.url)];
    if (link.kind === 'apple') tries.push(() => viaApple(link.id));
    if (link.kind === 'spotify') tries.push(() => viaSpotify(link.id));
    for (const t of tries) {
      try {
        const r = await t();
        if (link.kind === 'spotify' && !r.spotify) r.spotify = link.id;
        if (link.kind === 'apple' && !r.apple) r.apple = link.id;
        return r.art ? r : findCover(r);
      } catch (e) { /* next source */ }
    }
    const e = new Error('Couldn’t read that link.'); e.manual = link; throw e;
  }

  // ---------- Share link ----------
  const recordBase = () => new URL('r/', location.origin + location.pathname).href;
  function shareURL(rec) {
    const fields = [['song', rec.title], ['by', rec.artist], ['from', rec.from || 'A friend'], ['note', rec.note],
                    ['art', artOK(rec.art) ? rec.art : ''], ['spotify', rec.spotify], ['apple', rec.apple]];
    return recordBase() + '#' + fields.filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  }
  const shareText = (rec) => (rec.from ? rec.from : 'Someone') + ' sent you a record' + (rec.note ? ': “' + rec.note + '”' : '') + ' 🎧';

  // ---------- Crate ----------
  const crate = () => store.get(CRATE, []);
  function keep(rec, kind) {
    const list = crate(), id = idOf(rec);
    const i = list.findIndex((r) => r.kind === kind && r.id === id);
    const entry = { id, kind, title: rec.title, artist: rec.artist, art: rec.art || '', spotify: rec.spotify || '', apple: rec.apple || '',
                    from: rec.from || '', note: rec.note || '', at: Date.now() };
    if (i >= 0) list.splice(i, 1);
    list.unshift(entry);
    store.set(CRATE, list.slice(0, 500));
  }

  // ---------- Make screen ----------
  let current = null;

  function showRecord(rec) {
    current = rec;
    const art = artCSS(rec.art);
    $('makeSleeve').style.background = art;
    $('makeLabel').style.background = art;
    $('makeStage').classList.add('ready');
    const st = $('makeSticker');
    st.textContent = 'Tap to open';
    st.classList.remove('slap'); void st.offsetWidth; st.classList.add('slap');
    $('sTitle').textContent = rec.title;
    $('sArtist').textContent = rec.artist;
    $('studio').hidden = false;
    $('manual').hidden = true;
    setStatus('');
    updateShare();
  }

  function updateShare() {
    if (!current) return;
    current.from = $('from').value.trim();
    current.note = $('note').value.trim();
    store.set(FROM, current.from);
    const url = shareURL(current), text = shareText(current), both = text + '\n' + url;
    $('scMessages').href = 'sms:&body=' + encodeURIComponent(both);
    $('scWhatsApp').href = 'https://wa.me/?text=' + encodeURIComponent(both);
    $('scTelegram').href = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text);
    $('scEmail').href = 'mailto:?subject=' + encodeURIComponent(text) + '&body=' + encodeURIComponent(both);
    $('scX').href = 'https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
    $('previewLink').href = url;
  }

  function setStatus(msg, error) {
    $('status').textContent = msg;
    $('status').classList.toggle('error', !!error);
  }

  async function makeFrom(text) {
    if (!text.trim()) return;
    setStatus('Finding the song…');
    $('studio').hidden = true;
    try {
      showRecord(await resolve(text));
    } catch (e) {
      setStatus(e.message, true);
      $('manual').hidden = !e.manual;
      if (e.manual) $('mTitle').focus();
    }
  }

  function sent() { if (current) keep(current, 'sent'); }

  function wireMake() {
    $('from').value = store.get(FROM, '');
    $('pasteForm').addEventListener('submit', (e) => { e.preventDefault(); makeFrom($('link').value); });
    $('link').addEventListener('paste', () => setTimeout(() => makeFrom($('link').value), 0));
    $('link').addEventListener('change', () => makeFrom($('link').value));
    $('pasteBtn').addEventListener('click', async () => {
      try { const t = await navigator.clipboard.readText(); $('link').value = t; makeFrom(t); }
      catch (e) { $('link').focus(); setStatus('Paste the link into the box (⌘V or long-press → Paste).'); }
    });
    $('manual').addEventListener('submit', async (e) => {
      e.preventDefault();
      const link = parseLink($('link').value) || {};
      setStatus('Finding the cover…');
      showRecord(await findCover({ title: $('mTitle').value.trim(), artist: $('mArtist').value.trim(), art: '',
                                   spotify: link.kind === 'spotify' ? link.id : '', apple: link.kind === 'apple' ? link.id : '' }));
    });
    ['from', 'note'].forEach((id) => $(id).addEventListener('input', updateShare));
    $('sendBtn').addEventListener('click', async () => {
      if (!current) return;
      updateShare();
      const url = shareURL(current);
      if (navigator.share) {
        try { await navigator.share({ title: current.title + ' · ' + current.artist, text: shareText(current), url }); sent(); setStatus('Sent. It’s in your records.'); }
        catch (e) { /* closed the share sheet */ }
      } else {
        copy(url); sent();
      }
    });
    ['scMessages', 'scWhatsApp', 'scTelegram', 'scEmail', 'scX'].forEach((id) => $(id).addEventListener('click', sent));
    $('scCopy').addEventListener('click', () => { updateShare(); copy(shareURL(current)); sent(); });
  }

  function copy(text) {
    const done = () => { $('copyLabel').textContent = 'Copied'; setTimeout(() => ($('copyLabel').textContent = 'Copy link'), 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); done(); } catch (e) {} t.remove();
  }

  // ---------- Crate screen ----------
  let crateKind = 'received';
  function renderCrate() {
    const all = crate(), list = all.filter((r) => r.kind === crateKind);
    const received = all.filter((r) => r.kind === 'received').length, sentN = all.length - received;
    $('crateCount').textContent = received + ' received · ' + sentN + ' sent';
    $('segReceived').setAttribute('aria-selected', String(crateKind === 'received'));
    $('segSent').setAttribute('aria-selected', String(crateKind === 'sent'));
    const grid = $('crateGrid');
    grid.textContent = '';
    $('crateEmpty').hidden = list.length > 0;
    $('crateEmpty').textContent = crateKind === 'received'
      ? 'Records friends send you land here when you tap “Save in Crate”.'
      : 'Records you send show up here.';
    for (const r of list) {
      const a = document.createElement('a');
      a.className = 'rec';
      a.href = shareURL(r);
      a.setAttribute('aria-label', r.title + ' by ' + r.artist + (r.from && crateKind === 'received' ? ', from ' + r.from : ''));
      a.innerHTML = '<div class="rec-art"><div class="rec-disc"></div><div class="rec-sleeve"></div></div><div class="rec-title"></div><div class="rec-meta"></div><button class="rec-remove" type="button" aria-label="Remove">×</button>';
      a.querySelector('.rec-sleeve').style.background = artCSS(r.art);
      a.querySelector('.rec-title').textContent = r.title;
      a.querySelector('.rec-meta').textContent = r.artist + (crateKind === 'received' && r.from ? ' · from ' + r.from : '');
      a.querySelector('.rec-remove').addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        store.set(CRATE, crate().filter((x) => !(x.kind === r.kind && x.id === r.id)));
        renderCrate();
      });
      grid.appendChild(a);
    }
  }

  // ---------- Spotify (optional): your own library, with PKCE so no secret lives in the page ----------
  const redirectURI = () => location.origin + location.pathname;
  const spotifyOn = () => !!cfg.spotifyClientId;

  function b64url(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  async function connectSpotify() {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    sessionStorage.setItem('crate-verifier', verifier);
    const q = new URLSearchParams({ client_id: cfg.spotifyClientId, response_type: 'code', redirect_uri: redirectURI(),
      code_challenge_method: 'S256', code_challenge: challenge, scope: 'user-library-read user-read-recently-played playlist-read-private' });
    location.href = 'https://accounts.spotify.com/authorize?' + q;
  }
  async function tokenRequest(body) {
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    if (!r.ok) throw new Error('Spotify sign-in failed');
    const j = await r.json(), old = store.get(SPOTIFY_TOKENS, {});
    store.set(SPOTIFY_TOKENS, { access: j.access_token, refresh: j.refresh_token || old.refresh, until: Date.now() + (j.expires_in - 60) * 1000 });
  }
  async function finishSpotifyLogin() {
    const q = new URLSearchParams(location.search), code = q.get('code');
    if (!code) return;
    history.replaceState(null, '', location.pathname + '#/library');
    try {
      await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectURI(), client_id: cfg.spotifyClientId, code_verifier: sessionStorage.getItem('crate-verifier') || '' });
    } catch (e) { /* shown as not connected */ }
  }
  async function spotifyGET(path) {
    let t = store.get(SPOTIFY_TOKENS, null);
    if (!t) throw new Error('not connected');
    if (Date.now() > t.until && t.refresh) { await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: cfg.spotifyClientId }); t = store.get(SPOTIFY_TOKENS, null); }
    const r = await fetch('https://api.spotify.com/v1/' + path, { headers: { Authorization: 'Bearer ' + t.access } });
    if (r.status === 401) { store.set(SPOTIFY_TOKENS, null); throw new Error('not connected'); }
    if (!r.ok) throw new Error('Spotify error ' + r.status);
    return r.json();
  }
  const fromSpotifyTrack = (t) => t && t.id && { title: t.name, artist: (t.artists || []).map((a) => a.name).join(', '),
    art: ((t.album && t.album.images) || [])[0] ? t.album.images[0].url : '', spotify: t.id, apple: '' };

  let libTab = 'liked', libPlaylist = null;
  async function renderLibrary() {
    const body = $('libBody');
    body.textContent = '';
    const card = (html) => { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = html; body.appendChild(d); return d; };
    if (!spotifyOn()) {
      card('<h2>Spotify library</h2><p>To list your liked songs and playlists here, add a Spotify Client ID to <code>config.js</code> (see the README). Pasting links works without it.</p>');
    } else if (!store.get(SPOTIFY_TOKENS, null)) {
      const c = card('<h2>Connect Spotify</h2><p>See your liked songs, recently played and playlists, and send any of them as a record. Crate only reads your library.</p><button class="btn spotify" type="button">Connect Spotify</button>');
      c.querySelector('button').addEventListener('click', connectSpotify);
    } else {
      const seg = document.createElement('div');
      seg.className = 'seg'; seg.setAttribute('role', 'tablist');
      [['liked', 'Liked'], ['recent', 'Recent'], ['playlists', 'Playlists']].forEach(([k, label]) => {
        const b = document.createElement('button'); b.textContent = label; b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(libTab === k));
        b.addEventListener('click', () => { libTab = k; libPlaylist = null; renderLibrary(); });
        seg.appendChild(b);
      });
      body.appendChild(seg);
      const rows = document.createElement('div'); rows.className = 'rows'; body.appendChild(rows);
      const note = document.createElement('p'); note.className = 'empty'; note.textContent = 'Loading…'; body.appendChild(note);
      try {
        let items = [];
        if (libTab === 'liked') items = (await spotifyGET('me/tracks?limit=50')).items.map((i) => fromSpotifyTrack(i.track));
        else if (libTab === 'recent') items = (await spotifyGET('me/player/recently-played?limit=50')).items.map((i) => fromSpotifyTrack(i.track));
        else if (libPlaylist) items = (await spotifyGET('playlists/' + libPlaylist + '/tracks?limit=100')).items.map((i) => fromSpotifyTrack(i.track));
        else {
          const pls = (await spotifyGET('me/playlists?limit=50')).items;
          note.textContent = pls.length ? '' : 'No playlists yet.';
          for (const p of pls) rows.appendChild(row(p.name, (p.tracks ? p.tracks.total : 0) + ' songs', (p.images || [])[0] && p.images[0].url, () => { libPlaylist = p.id; renderLibrary(); }));
          return;
        }
        items = items.filter(Boolean);
        const seen = new Set(); items = items.filter((t) => !seen.has(t.spotify) && seen.add(t.spotify));
        note.textContent = items.length ? '' : 'Nothing here yet.';
        for (const t of items) rows.appendChild(row(t.title, t.artist, t.art, () => { location.hash = '#/'; setTimeout(() => showRecord(t), 0); }));
      } catch (e) {
        note.textContent = e.message === 'not connected' ? 'Spotify disconnected. Connect again.' : 'Couldn’t load your library right now.';
        if (e.message === 'not connected') renderLibrary();
      }
      const out = document.createElement('button'); out.className = 'btn ghost'; out.textContent = 'Disconnect Spotify'; out.style.marginTop = '16px';
      out.addEventListener('click', () => { store.set(SPOTIFY_TOKENS, null); renderLibrary(); });
      body.appendChild(out);
    }
    card('<h2>Apple Music library</h2><p>Coming later: reading an Apple Music library needs an Apple developer account. You can paste Apple Music links today.</p>');
  }
  function row(title, sub, img, onClick) {
    const b = document.createElement('button'); b.className = 'row'; b.type = 'button';
    b.innerHTML = (img ? '<img alt="">' : '<span class="ph"></span>') + '<span class="row-text"><b></b><span></span></span>';
    if (img) b.querySelector('img').src = img;
    b.querySelector('b').textContent = title; b.querySelector('.row-text span').textContent = sub;
    b.addEventListener('click', onClick);
    return b;
  }

  // ---------- Routing ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, '').split('?')[0];
    const view = h === 'records' ? 'crate' : h === 'library' ? 'library' : 'make';
    ['make', 'crate', 'library'].forEach((v) => { $('view-' + v).hidden = v !== view; });
    $('tabMake').toggleAttribute('aria-current', view === 'make'); if (view === 'make') $('tabMake').setAttribute('aria-current', 'page');
    $('tabCrate').toggleAttribute('aria-current', view === 'crate'); if (view === 'crate') $('tabCrate').setAttribute('aria-current', 'page');
    $('tabLibrary').toggleAttribute('aria-current', view === 'library'); if (view === 'library') $('tabLibrary').setAttribute('aria-current', 'page');
    if (view === 'crate') renderCrate();
    if (view === 'library') renderLibrary();
    window.scrollTo(0, 0);
  }

  $('segReceived').addEventListener('click', () => { crateKind = 'received'; renderCrate(); });
  $('segSent').addEventListener('click', () => { crateKind = 'sent'; renderCrate(); });
  wireMake();
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', (e) => { if (e.key === CRATE && !$('view-crate').hidden) renderCrate(); });
  // Opened with ?link=… (e.g. from a shortcut or the share sheet): make it straight away.
  const incoming = new URLSearchParams(location.search).get('link') || new URLSearchParams(location.search).get('text');
  finishSpotifyLogin().then(() => {
    route();
    if (incoming) { history.replaceState(null, '', location.pathname); $('link').value = incoming; makeFrom(incoming); }
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
