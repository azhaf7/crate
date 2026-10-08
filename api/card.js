// Crate short links: /s/<id> (vercel.json sends them here).
// Chat apps (iMessage, WhatsApp, Slack, X…) read this page's tags for the link preview: the cover,
// the song and who sent it. People's browsers go straight on to the record page. The link carries
// only the record's id; the record comes from Supabase (public.record_card, supabase/growth.sql).
import { lookup, validId, artOK, tracksOf } from './_crate.js';

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The same link format the app makes (app.js shareURL), so the record page needs nothing new.
function recordHash(rec) {
  const fields = [['song', rec.title], ['by', rec.artist], ['from', rec.from || 'A friend'], ['note', rec.note],
                  ['art', artOK(rec.art) ? rec.art : ''], ['spotify', rec.spotify], ['apple', rec.apple], ['id', rec.id],
                  ['mix', tracksOf(rec) ? JSON.stringify(tracksOf(rec).map((t) => [t.title, t.artist, t.apple || '', t.spotify || '', t.art || '', t.line || ''])) : '']];
  return '#' + fields.filter(([, v]) => v).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
}

function page({ title, description, image, url, go }) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#000000">' +
    '<title>' + esc(title) + '</title><meta name="description" content="' + esc(description) + '">' +
    '<meta property="og:type" content="music.song"><meta property="og:site_name" content="Crate">' +
    '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(description) + '">' +
    '<meta property="og:url" content="' + esc(url) + '">' +
    (image ? '<meta property="og:image" content="' + esc(image) + '"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="' + esc(title) + '">' : '') +
    '<meta name="twitter:card" content="' + (image ? 'summary_large_image' : 'summary') + '">' +
    '<meta name="twitter:title" content="' + esc(title) + '"><meta name="twitter:description" content="' + esc(description) + '">' +
    (image ? '<meta name="twitter:image" content="' + esc(image) + '">' : '') +
    '<script>location.replace(' + JSON.stringify(go).replace(/</g, '\\u003c') + ')</script>' +
    '</head><body style="background:#000000;color:#fff;font:16px -apple-system,sans-serif;text-align:center;padding:40vh 20px 0">' +
    '<a href="' + esc(go) + '" style="color:#ffd60a">Open the record</a></body></html>';
}

export default async function handler(req, res) {
  // The app checks this once to know short links work here (and the database is set up for them).
  if (req.query.probe) {
    try { await lookup('probeprobe00'); res.statusCode = 204; } catch (e) { res.statusCode = 503; }
    return res.end();
  }
  const id = String(req.query.id || '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const url = 'https://' + host + '/s/' + id;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  let rec = null;
  if (validId(id)) { try { rec = await lookup(id); } catch (e) { /* shown as missing below */ } }
  if (!rec) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    return res.end(page({ title: 'Crate · send songs as records', description: 'This record isn’t here anymore. Make your own on Crate.', url, go: '/' }));
  }
  const from = rec.from || 'A friend', mix = tracksOf(rec);
  // Records never change once sent, so previews can be cached at the edge.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400');
  res.end(page({
    title: from + ' sent you a ' + (mix ? 'mixtape' : 'record'),
    description: (rec.note ? '“' + rec.note + '” · ' : '') +
      (mix ? rec.title + ': ' + mix.slice(0, 3).map((t) => t.title).join(', ') + (mix.length > 3 ? '…' : '')
           : rec.title + (rec.artist ? ' by ' + rec.artist : '')) + '. Tap to open it.',
    // The vinyl picture (api/og.js); the plain cover if that can't be drawn.
    image: 'https://' + host + '/api/og?id=' + rec.id,
    url,
    go: '/r/' + recordHash(rec),
  }));
}
