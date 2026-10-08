// Spotify's new releases, for the "New on Spotify" shelf in Discover.
// Uses a Spotify app's Client Credentials (no one signs in, so the 25-user limit on apps in development
// mode doesn't apply). Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in Vercel → Settings →
// Environment Variables; the secret never reaches the page. Answers 503 until they're set, and the
// app then just leaves the shelf out.
let token = null;

async function spotifyToken(id, secret) {
  if (token && Date.now() < token.until) return token.value;
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error('token ' + r.status);
  const j = await r.json();
  token = { value: j.access_token, until: Date.now() + (j.expires_in - 60) * 1000 };
  return token.value;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'Spotify isn’t set up here.' })); }
  const country = /^[a-z]{2}$/i.test(String(req.query.country || '')) ? String(req.query.country).toUpperCase() : 'US';
  try {
    const t = await spotifyToken(id, secret);
    const get = async (path) => {
      const r = await fetch('https://api.spotify.com/v1/' + path, { headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) throw new Error('spotify ' + r.status);
      return r.json();
    };
    // Singles are songs; a new album's first track isn't necessarily the song people mean, so albums are left out.
    const nr = await get('browse/new-releases?limit=50&country=' + country);
    const singles = ((nr.albums && nr.albums.items) || []).filter((a) => a && a.album_type === 'single').slice(0, 20);
    const full = singles.length ? await get('albums?market=' + country + '&ids=' + singles.map((a) => a.id).join(',')) : { albums: [] };
    const songs = (full.albums || []).filter(Boolean).map((a) => {
      const tr = a.tracks && a.tracks.items && a.tracks.items[0];
      if (!tr || !/^[A-Za-z0-9]{22}$/.test(tr.id)) return null;
      return { title: tr.name, artist: (tr.artists || []).map((x) => x.name).join(', '), spotify: tr.id, apple: '',
               art: ((a.images || [])[0] || {}).url || '', released: a.release_date || '' };
    }).filter(Boolean);
    res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400');
    res.end(JSON.stringify({ songs }));
  } catch (e) {
    console.error(e);
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Couldn’t reach Spotify.' }));
  }
}
