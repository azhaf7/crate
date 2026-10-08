// Shared by api/card.js and api/og.js (files starting with _ aren't functions on Vercel).
// Reads a record by its id through public.record_card (supabase/growth.sql, mixtapes.sql).
import fs from 'node:fs';
import path from 'node:path';

let cfg;
function config() {
  if (cfg) return cfg;
  let src = '';
  try { src = fs.readFileSync(path.join(process.cwd(), 'config.js'), 'utf8'); } catch (e) { /* env vars only */ }
  const pick = (k) => (src.match(new RegExp(k + ":\\s*'([^']*)'")) || [])[1] || '';
  cfg = { url: process.env.SUPABASE_URL || pick('supabaseUrl'), key: process.env.SUPABASE_ANON_KEY || pick('supabaseAnonKey') };
  return cfg;
}

export async function lookup(id) {
  const { url, key } = config();
  const r = await fetch(url + '/rest/v1/rpc/record_card', {
    method: 'POST',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rid: id }),
  });
  if (!r.ok) throw new Error('db ' + r.status);
  return r.json();   // the record, or null
}

export const validId = (id) => /^[A-Za-z0-9]{12}$/.test(id);
export const artOK = (u) => { try { const h = new URL(u); return h.protocol === 'https:' && /(^|\.)(scdn\.co|mzstatic\.com|spotifycdn\.com)$/.test(h.hostname); } catch (e) { return false; } };
export const tracksOf = (rec) => (Array.isArray(rec && rec.tracks) && rec.tracks.length > 1 ? rec.tracks : null);
