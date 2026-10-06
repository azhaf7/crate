#// Crate: paste a Spotify or Apple Music link, get a sealed record to send. Records you open or send
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
  const artCSS = (u) => (u && artOK(u) ? 'center / cover no-repeat ' + cssURL(u) + ', ' : '') + 'linear-gradient(150deg, oklch(0.72 0.12 40), oklch(0.42 0.1 80))';
  const idOf = (r) => (r.spotify || r.apple || (r.title + '|' + r.artist)).toLowerCase();
  // A record's own id: random, so only people holding the link know it.
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join('');

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
    const want = o.title.toLowerCase();
    const none = { title: o.title, artist: '', art: o.thumbnail_url || '', spotify: id, apple: '' };
    return itunes('search?media=music&entity=song&limit=25&term=' + encodeURIComponent(o.title)).then((j) => {
      // Only trust a result whose title actually matches; never take the first hit blindly.
      const r = (j.results || []).find((x) => (x.trackName || '').toLowerCase() === want);
      if (!r) return none;
      return { title: o.title, artist: r.artistName, art: o.thumbnail_url || big(r.artworkUrl100), spotify: id, apple: String(r.trackId) };
    }, () => none);
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

  // ---------- Database: has the record been opened? ----------
  // Each browser that sends a record gets an anonymous Supabase identity (no account, no email).
  // Writes are fire-and-forget: the link carries the whole song, so a record opens even when the
  // database can't be reached, and unsent rows are retried next time.
  const AUTH = 'crate-auth', STATUS = 'crate-status', ACCOUNT = 'crate-account', CLAIM = 'crate-claim';
  const account = () => store.get(ACCOUNT, null);   // { email } once signed in with email
  const dbOn = () => !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  let authing = null;

  async function authCall(path, body) {
    const r = await fetch(cfg.supabaseUrl + '/auth/v1/' + path, { method: 'POST',
      headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw Object.assign(new Error('auth ' + r.status), { status: r.status });
    return keepSession(await r.json());
  }
  function keepSession(j) {
    const a = { access: j.access_token, refresh: j.refresh_token, until: Date.now() + ((j.expires_in || 3600) - 60) * 1000 };
    store.set(AUTH, a);
    return a;
  }
  function session() {
    const a = store.get(AUTH, null);
    if (a && a.access && Date.now() < a.until) return Promise.resolve(a);
    if (!authing) {
      // A refresh token that's been revoked means a new identity; a network error just waits for next time.
      authing = (a && a.refresh
        ? authCall('token?grant_type=refresh_token', { refresh_token: a.refresh }).catch((e) => {
            if (!(e.status >= 400 && e.status < 500)) throw e;
            if (account()) { store.set(ACCOUNT, null); paintAccount(); }   // signed out elsewhere
            return authCall('signup', {});
          })
        : authCall('signup', {})).finally(() => { authing = null; });
    }
    return authing;
  }
  async function db(method, path, body, prefer) {
    const a = await session();
    const headers = { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + a.access, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(cfg.supabaseUrl + '/rest/v1/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401) store.set(AUTH, Object.assign(a, { until: 0 }));
    if (!r.ok) throw new Error('db ' + r.status);
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }

  const dbRow = (r) => ({ id: r.rid, sender_name: (r.from || '').slice(0, 40) || null, to_name: (r.to || '').slice(0, 40) || null,
    title: r.title.slice(0, 200), artist: (r.artist || '').slice(0, 200), note: (r.note || '').slice(0, 80) || null,
    art: artOK(r.art) ? r.art : null, spotify: /^[A-Za-z0-9]{22}$/.test(r.spotify) ? r.spotify : null,
    apple: /^\d{4,15}$/.test(r.apple) ? r.apple : null });

  async function syncSent() {
    const todo = crate().filter((r) => r.kind === 'sent' && r.rid && !r.synced);
    if (!dbOn() || !todo.length) return;
    await db('POST', 'records', todo.map(dbRow), 'resolution=ignore-duplicates,return=minimal');
    const done = new Set(todo.map((r) => r.rid)), acct = account() && account().email;
    store.set(CRATE, crate().map((r) => (r.kind === 'sent' && done.has(r.rid) ? Object.assign(r, { synced: true }, acct ? { acct } : {}) : r)));
  }

  // ---------- Email sign-in (optional): the same records on every device ----------
  // No password: Supabase emails a 6-digit code that's typed in here. A code, not a link, because on a
  // phone the link would open in the browser, not in the home-screen app.
  const savedRow = (r) => ({ song_key: r.id.slice(0, 300), title: (r.title || 'Untitled').slice(0, 200), artist: (r.artist || '').slice(0, 200),
    from_name: (r.from || '').slice(0, 40) || null, note: (r.note || '').slice(0, 80) || null, art: artOK(r.art) ? r.art : null,
    spotify: /^[A-Za-z0-9]{22}$/.test(r.spotify) ? r.spotify : null, apple: /^\d{4,15}$/.test(r.apple) ? r.apple : null });

  async function sendCode(email) {
    // Records already sent from this browser move into the account after sign-in.
    store.set(CLAIM, null);
    if (store.get(AUTH, null) && !account()) {
      try { store.set(CLAIM, await db('POST', 'rpc/start_claim', {})); } catch (e) { /* nothing to move */ }
    }
    const back = encodeURIComponent(location.origin + location.pathname);
    const r = await fetch(cfg.supabaseUrl + '/auth/v1/otp?redirect_to=' + back, { method: 'POST',
      headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, create_user: true }) });
    if (!r.ok) throw new Error(r.status === 429 ? 'Too many codes asked for. Wait a minute and try again.' : 'Couldn’t send a code to that address.');
  }

  async function verifyCode(email, token) {
    const r = await fetch(cfg.supabaseUrl + '/auth/v1/verify', { method: 'POST',
      headers: { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'email', email, token }) });
    if (!r.ok) throw new Error('That code didn’t work. Check it, or send a new one.');
    const j = await r.json();
    keepSession(j);
    signedIn((j.user && j.user.email) || email);
  }

  async function signedIn(email) {
    store.set(ACCOUNT, { email });
    const claim = store.get(CLAIM, null);
    if (claim) { try { await db('POST', 'rpc/finish_claim', { c: claim }); } catch (e) {} store.set(CLAIM, null); }
    await syncAll();
  }

  // A sign-in link (if the email template has one) lands here with the session in the address.
  async function finishLinkSignIn() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.get('access_token') || !h.get('refresh_token')) return;
    history.replaceState(null, '', location.pathname + '#/records');
    keepSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: Number(h.get('expires_in')) || 3600 });
    try {
      const u = await fetch(cfg.supabaseUrl + '/auth/v1/user', { headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + h.get('access_token') } }).then((r) => r.json());
      if (u && u.email) await signedIn(u.email);
    } catch (e) {}
  }

  function signOut() {
    const a = store.get(AUTH, null);
    if (a && a.access) fetch(cfg.supabaseUrl + '/auth/v1/logout', { method: 'POST', headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + a.access } }).catch(() => {});
    // The records stay in the account; this device forgets them.
    [AUTH, ACCOUNT, STATUS, CRATE, CLAIM].forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
    paintAccount(); paintStatus();
  }

  // Signed in: push what's only here, then take the account's copy of Sent and Saved.
  async function syncAll() {
    const me = account();
    if (!dbOn() || !me) return refreshStatus();
    try {
      await syncSent();
      const todo = crate().filter((r) => r.kind === 'received' && r.acct !== me.email);
      if (todo.length) await db('POST', 'saved', todo.map(savedRow), 'resolution=ignore-duplicates,return=minimal');
      const [sent, saved] = await Promise.all([
        db('GET', 'records?select=*&order=created_at.desc&limit=500'),
        db('GET', 'saved?select=*&order=saved_at.desc&limit=500'),
      ]);
      const rids = new Set(sent.map((r) => r.id)), keys = new Set(saved.map((r) => r.song_key));
      const inAccount = (r) => (r.kind === 'sent' ? rids.has(r.rid) : keys.has(r.id));
      // Removed on another device: remove here too. Everything else here belongs to the account now.
      const list = crate().filter((r) => !(r.acct === me.email && !inAccount(r)))
        .map((r) => (inAccount(r) ? Object.assign(r, { acct: me.email, synced: true }) : r));
      for (const r of sent) {
        if (list.some((x) => x.kind === 'sent' && x.rid === r.id)) continue;
        list.push({ id: idOf({ spotify: r.spotify, apple: r.apple, title: r.title, artist: r.artist }), kind: 'sent', rid: r.id,
          title: r.title, artist: r.artist, art: r.art || '', spotify: r.spotify || '', apple: r.apple || '', from: r.sender_name || '',
          to: r.to_name || '', note: r.note || '', at: Date.parse(r.created_at), synced: true, acct: me.email });
      }
      for (const r of saved) {
        if (list.some((x) => x.kind === 'received' && x.id === r.song_key)) continue;
        list.push({ id: r.song_key, kind: 'received', title: r.title, artist: r.artist, art: r.art || '', spotify: r.spotify || '',
          apple: r.apple || '', from: r.from_name || '', note: r.note || '', at: Date.parse(r.saved_at), acct: me.email });
      }
      store.set(CRATE, list.sort((a, b) => b.at - a.at).slice(0, 500));
      const st = {};
      sent.forEach((r) => { st[r.id] = { opened: r.opened_at, opens: r.opens, seen: r.seen_at }; });
      store.set(STATUS, st);
      paintStatus();
    } catch (e) { /* offline: this device's copy stays */ }
  }

  let codeFor = '';   // the email a code was sent to, while waiting for it
  function paintAccount() {
    const box = $('account'), me = account();
    box.textContent = '';
    if (!dbOn()) return;
    if (me) {
      box.className = 'account in';
      const t = document.createElement('span'); t.textContent = 'Synced with ' + me.email;
      const out = document.createElement('button'); out.type = 'button'; out.className = 'link'; out.textContent = 'Sign out';
      out.addEventListener('click', () => { if (confirm('Sign out? Your records stay in your account; this device forgets them.')) signOut(); });
      box.append(t, out);
      return;
    }
    box.className = 'account card';
    box.innerHTML = codeFor
      ? '<h2>Check your email</h2><p></p><form class="inline"><label class="visually-hidden" for="acCode">Code</label><input id="acCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="6-digit code" required><button class="pill accent" type="submit">Sign in</button></form><p class="ac-msg" role="status"></p><button class="link" type="button">Use a different email</button>'
      : '<h2>Your records on every device</h2><p>Sign in with your email to see what you’ve sent and saved on any phone or computer. No password: we email you a code.</p><form class="inline"><label class="visually-hidden" for="acEmail">Email</label><input id="acEmail" type="email" autocomplete="email" placeholder="you@example.com" required><button class="pill accent" type="submit">Send code</button></form><p class="ac-msg" role="status"></p>';
    const msg = box.querySelector('.ac-msg'), form = box.querySelector('form'), btn = form.querySelector('button');
    if (codeFor) {
      box.querySelector('p').textContent = 'We emailed ' + codeFor + '. Type the code from it here, or just tap the link in it.';
      box.querySelector('.link').addEventListener('click', () => { codeFor = ''; paintAccount(); });
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true; msg.classList.remove('error'); msg.textContent = codeFor ? 'Signing in…' : 'Sending…';
      try {
        if (codeFor) { await verifyCode(codeFor, $('acCode').value.replace(/\s/g, '')); codeFor = ''; }
        else { const em = $('acEmail').value.trim(); await sendCode(em); codeFor = em; }
        paintAccount();
        if (codeFor) $('acCode').focus();
      } catch (err) { msg.textContent = err.message; msg.classList.add('error'); btn.disabled = false; }
    });
  }

  // Only browsers that have sent something talk to the database.
  async function refreshStatus() {
    if (!dbOn() || !crate().some((r) => r.kind === 'sent' && r.rid)) return;
    try {
      await syncSent();
      const rows = await db('GET', 'records?select=id,opened_at,opens,seen_at&order=created_at.desc&limit=500');
      const st = {};
      rows.forEach((r) => { st[r.id] = { opened: r.opened_at, opens: r.opens, seen: r.seen_at }; });
      store.set(STATUS, st);
      paintStatus();
    } catch (e) { /* offline: keep the last known statuses */ }
  }
  const statusOf = (r) => (r.rid && store.get(STATUS, {})[r.rid]) || null;
  const isNew = (r) => { const s = statusOf(r); return !!(s && s.opened && !s.seen); };
  const stateText = (r) => { const s = statusOf(r); return s && s.opened ? 'Opened' : r.rid ? 'Sealed' : 'Sent'; };
  const newOpens = () => crate().filter((r) => r.kind === 'sent' && isNew(r));

  // Looking at Sent counts as seeing who opened what.
  function markSeen() {
    const ids = newOpens().map((r) => r.rid);
    if (!ids.length) return;
    const now = new Date().toISOString(), st = store.get(STATUS, {});
    ids.forEach((id) => { st[id].seen = now; });
    store.set(STATUS, st);
    paintBadge();
    db('PATCH', 'records?id=in.(' + ids.join(',') + ')', { seen_at: now }, 'return=minimal').catch(() => {});
  }

  function paintBadge() {
    const n = newOpens().length, b = $('inboxBadge');
    b.hidden = !n;
    b.textContent = n > 9 ? '9+' : String(n);
    $('tabCrate').setAttribute('aria-label', n ? 'Records, ' + n + ' newly opened' : 'Records');
    // New opens: the tab goes straight to Sent.
    $('tabCrate').setAttribute('href', n ? '#/records/sent' : '#/records');
  }
  function paintStatus() {
    paintBadge();
    renderRecent();
    if (!$('view-crate').hidden) renderCrate();
  }

  // ---------- Share link ----------
  const recordBase = () => new URL('r/', location.origin + location.pathname).href;
  function shareURL(rec) {
    const fields = [['song', rec.title], ['by', rec.artist], ['from', rec.from || 'A friend'], ['note', rec.note],
                    ['art', artOK(rec.art) ? rec.art : ''], ['spotify', rec.spotify], ['apple', rec.apple], ['id', rec.rid]];
    return recordBase() + '#' + fields.filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  }
  const shareText = (rec) => (rec.from ? rec.from : 'Someone') + ' sent you a record' + (rec.note ? ': “' + rec.note + '”' : '') + ' 🎧';

  // ---------- Crate ----------
  const crate = () => store.get(CRATE, []);
  // Sent records are one entry per link (rid); received ones one per song.
  function keep(rec, kind) {
    const list = crate(), id = idOf(rec), same = (r) => r.kind === kind && (kind === 'sent' && rec.rid ? r.rid === rec.rid : r.id === id);
    const old = list.find(same) || {};
    const entry = { id, kind, rid: rec.rid || '', title: rec.title, artist: rec.artist, art: rec.art || '', spotify: rec.spotify || '', apple: rec.apple || '',
                    from: rec.from || '', to: rec.to || '', note: rec.note || '', at: Date.now(),
                    // Name or note changed since the row was written: the database keeps the first version.
                    synced: !!old.synced };
    store.set(CRATE, [entry].concat(list.filter((r) => !same(r))).slice(0, 500));
  }

  // ---------- Make screen ----------
  let current = null;

  // The card's band takes the cover's own colour, darkened so white text reads on it.
  function bandFrom(url) {
    $('makeCard').style.background = '';
    if (!artOK(url)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data;
        let r = 0, g = 0, b = 0, w = 0;
        for (let p = 0; p < d.length; p += 4) {
          const mx = Math.max(d[p], d[p + 1], d[p + 2]), mn = Math.min(d[p], d[p + 1], d[p + 2]);
          const wt = (mx ? (mx - mn) / mx : 0) ** 2 + 0.05;
          r += d[p] * wt; g += d[p + 1] * wt; b += d[p + 2] * wt; w += wt;
        }
        const k = 0.32 / w;
        if (current && current.art === url) $('makeCard').style.background = 'rgb(' + [r, g, b].map((v) => Math.round(v * k)).join(',') + ')';
      } catch (e) { /* cover server didn't allow reading pixels: keep the plain card */ }
    };
    img.src = url;
  }

  function showRecord(rec) {
    current = Object.assign({}, rec, { rid: newId() });
    const art = artCSS(rec.art);
    $('makeArt').style.background = art;
    $('makeLabel').style.background = art;
    $('makeEmpty').hidden = true;
    const stg = $('makeStage');
    stg.classList.remove('ready', 'pop'); void stg.offsetWidth; stg.classList.add('ready', 'pop');
    bandFrom(rec.art);
    $('hero-title').textContent = 'Ready to Send';
    $('sTitle').textContent = rec.title;
    $('sArtist').textContent = rec.artist || ' ';
    $('studio').hidden = false;
    $('manual').hidden = true;
    $('link').value = '';
    setStatus('');
    updateShare();
  }

  function updateShare() {
    if (!current) return;
    current.from = $('from').value.trim();
    current.to = $('to').value.trim();
    current.note = $('note').value.trim();
    store.set(FROM, current.from);
    $('previewLink').href = shareURL(current);
  }

  // Back to an empty card, ready for the next song.
  function resetMake() {
    current = null;
    $('makeStage').classList.remove('ready', 'pop');
    $('makeArt').style.background = ''; $('makeLabel').style.background = ''; $('makeCard').style.background = '';
    $('makeEmpty').hidden = false;
    $('hero-title').textContent = 'Make a Record';
    $('sTitle').textContent = 'Nothing pressed yet';
    $('sArtist').textContent = 'Spotify and Apple Music links work';
    $('studio').hidden = true;
    $('to').value = ''; $('note').value = '';
  }

  function setStatus(msg, error) {
    $('status').textContent = msg;
    $('status').classList.toggle('error', !!error);
  }

  async function makeFrom(text) {
    if (!text.trim()) return;
    setStatus('Finding the song…');
    $('makeStage').classList.add('loading');
    try {
      showRecord(await resolve(text));
    } catch (e) {
      setStatus(e.message, true);
      $('manual').hidden = !e.manual;
      if (e.manual) $('mTitle').focus();
    } finally {
      $('makeStage').classList.remove('loading');
    }
  }

  function sent() {
    if (!current) return;
    keep(current, 'sent');
    renderRecent();
    syncAll();
  }

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
    ['from', 'to', 'note'].forEach((id) => $(id).addEventListener('input', updateShare));
    // Send opens one sheet with two choices: the phone's own share list, or copy the link.
    const sheet = $('sendSheet');
    let wasSent = false;
    const markSent = (msg) => {
      sent(); wasSent = true;
      $('sheetNote').textContent = msg;
      $('sheet-title').textContent = 'Sent ✓';
    };
    $('sendBtn').addEventListener('click', () => {
      if (!current) return;
      updateShare();
      wasSent = false;
      $('sheetArt').style.background = artCSS(current.art);
      $('sheet-title').textContent = current.to ? 'Send to ' + current.to : 'Your record is ready';
      $('sheetSub').textContent = current.title + (current.artist ? ' · ' + current.artist : '');
      $('sheetNote').textContent = '';
      // Without a share list (most desktop browsers), copying is the one choice, so it leads.
      $('shShare').hidden = !navigator.share;
      $('shCopy').classList.toggle('accent', !navigator.share);
      sheet.showModal();
    });
    $('shShare').addEventListener('click', async () => {
      try {
        await navigator.share({ title: current.title + ' · ' + current.artist, text: shareText(current), url: shareURL(current) });
        markSent('You’ll see on Make when it’s opened.');
      } catch (e) { /* closed the share list */ }
    });
    $('shCopy').addEventListener('click', () => {
      copy(shareURL(current));
      markSent('Link copied. Paste it in any chat.');
    });
    $('shDone').addEventListener('click', () => sheet.close());
    // Tapping outside the sheet closes it.
    sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
    sheet.addEventListener('close', () => { if (wasSent) { resetMake(); setStatus(''); } });
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
  // One sleeve with its record peeking out: the shelf on Make and the Records grid both use it.
  function tile(r, cls, i) {
    const a = document.createElement('a');
    a.className = cls;
    a.href = shareURL(r);
    a.target = '_blank'; a.rel = 'noopener';
    a.style.animationDelay = Math.min(i, 8) * 60 + 'ms';
    a.innerHTML = '<div class="tile-art"><div class="sleeve-disc"></div><div class="sleeve-art"></div></div><div class="' + cls + '-title"></div><div class="' + cls + '-meta"></div>';
    a.querySelector('.sleeve-art').style.background = artCSS(r.art);
    a.querySelector('.' + cls + '-title').textContent = r.title;
    const meta = a.querySelector('.' + cls + '-meta');
    if (r.kind === 'sent') {
      const state = document.createElement('span');
      state.textContent = stateText(r);
      if (isNew(r)) state.className = 'opened';
      meta.append((r.to ? 'To ' + r.to : r.artist) + ' · ', state);
      a.setAttribute('aria-label', r.title + (r.to ? ', to ' + r.to : '') + ', ' + state.textContent);
    } else {
      meta.textContent = r.artist + (r.from ? ' · from ' + r.from : '');
      a.setAttribute('aria-label', r.title + ' by ' + r.artist + (r.from ? ', from ' + r.from : ''));
    }
    return a;
  }

  function renderRecent() {
    const list = crate().filter((r) => r.kind === 'sent').slice(0, 12), shelf = $('recentShelf');
    $('recent').hidden = !list.length;
    shelf.textContent = '';
    list.forEach((r, i) => shelf.appendChild(tile(r, 'tile', i)));
  }

  let crateKind = 'all';
  function renderCrate() {
    document.dispatchEvent(new Event('crate:records'));
    const all = crate(), list = crateKind === 'all' ? all : all.filter((r) => r.kind === crateKind);
    const received = all.filter((r) => r.kind === 'received').length, sentN = all.length - received;
    $('crateCount').textContent = all.length + ' record' + (all.length === 1 ? '' : 's');
    $('gridHead').textContent = crateKind === 'sent' ? 'All sent' : crateKind === 'received' ? 'All received' : 'All records';
    const grid = $('crateGrid');
    grid.textContent = '';
    list.forEach((r, i) => {
      const a = tile(r, 'rec', i);
      const x = document.createElement('button');
      x.className = 'rec-remove'; x.type = 'button'; x.textContent = '×';
      x.setAttribute('aria-label', 'Remove ' + r.title);
      x.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const same = (y) => y.kind === r.kind && (r.rid ? y.rid === r.rid : y.id === r.id);
        store.set(CRATE, crate().filter((y) => !same(y)));
        if (r.kind === 'sent' && r.rid && r.synced) db('DELETE', 'records?id=eq.' + r.rid, null, 'return=minimal').catch(() => {});
        if (r.kind === 'received' && r.acct && account()) db('DELETE', 'saved?song_key=eq.' + encodeURIComponent(r.id), null, 'return=minimal').catch(() => {});
        renderCrate(); renderRecent();
      });
      a.appendChild(x);
      grid.appendChild(a);
    });
    if (crateKind === 'sent') setTimeout(markSeen, 1200);
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
      card('<div class="src"><i style="background:#1ed760"></i><div><h2>Spotify</h2><span>Not set up</span></div></div><p>To list your liked songs and playlists here, add a Spotify Client ID to <code>config.js</code> (see the README). Pasting links works without it.</p>');
    } else if (!store.get(SPOTIFY_TOKENS, null)) {
      const c = card('<div class="src"><i style="background:#1ed760"></i><div><h2>Spotify</h2><span>Not connected</span></div><button class="pill accent" type="button">Connect</button></div><p>See your liked songs, recently played and playlists, and send any of them as a record. Crate only reads your library.</p>');
      c.querySelector('button').addEventListener('click', connectSpotify);
    } else {
      card('<div class="src"><i style="background:#1ed760"></i><div><h2>Spotify</h2><span>Connected</span></div></div>').classList.add('slim');
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
    card('<div class="src"><i style="background:#fa2d48"></i><div><h2>Apple Music</h2><span>Coming soon</span></div></div><p>Reading an Apple Music library needs an Apple developer account. You can paste Apple Music links today.</p>');
    card('<div class="src"><i style="background:#0a84ff"></i><div><h2>Shazam</h2><span>Through Apple Music</span></div></div><p>Shazam doesn’t let other apps read its history. Turn on <b>Shazam → Settings → Sync to Apple Music</b> and your Shazams show up as a “My Shazam Tracks” playlist, ready once Apple Music connects here. You can paste a Shazam song’s Apple Music link today.</p>');
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
    const view = h.startsWith('records') ? 'crate' : h === 'library' ? 'library' : 'make';
    if (h === 'records/sent') crateKind = 'sent';
    if (h === 'records/received') crateKind = 'received';
    ['make', 'crate', 'library'].forEach((v) => { $('view-' + v).hidden = v !== view; });
    $('tabMake').toggleAttribute('aria-current', view === 'make'); if (view === 'make') $('tabMake').setAttribute('aria-current', 'page');
    $('tabCrate').toggleAttribute('aria-current', view === 'crate'); if (view === 'crate') $('tabCrate').setAttribute('aria-current', 'page');
    $('tabLibrary').toggleAttribute('aria-current', view === 'library'); if (view === 'library') $('tabLibrary').setAttribute('aria-current', 'page');
    if (view === 'crate') renderCrate();
    if (view === 'library') renderLibrary();
    if (view === 'make') renderRecent();
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('crate:view', { detail: view }));
  }

  wireMake();
  // Library needs a Spotify app; without one the tab would only explain that, so it's left out.
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', (e) => { if (e.key === CRATE && !$('view-crate').hidden) renderCrate(); });
  // Statuses on launch, and whenever Crate comes back to the front.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncAll(); });
  paintBadge();
  paintAccount();
  finishLinkSignIn().then(syncAll);
  // Opened with ?link=… (e.g. from a shortcut or the share sheet): make it straight away.
  const incoming = new URLSearchParams(location.search).get('link') || new URLSearchParams(location.search).get('text');
  finishSpotifyLogin().then(() => {
    route();
    if (incoming) { history.replaceState(null, '', location.pathname); $('link').value = incoming; makeFrom(incoming); }
  });
  // The sleeve stack on Records (stack.js) uses these.
  window.CrateApp = {
    crate, artCSS, artOK, shareURL, showRecord,
    kind: () => crateKind, setKind: (k) => { crateKind = k; renderCrate(); },
  };
  document.dispatchEvent(new Event('crate:ready'));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
