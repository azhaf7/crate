// Crate's link preview picture, 1200×630: the record sliding out of its sleeve, who sent it, the
// song (or a mixtape's collage of covers) and the note. api/card.js points og:image here.
// If it can't be drawn, it falls back to the plain cover, so a preview always has a picture.
import { ImageResponse } from '@vercel/og';
import { lookup, validId, artOK, tracksOf } from './_crate.js';

// Satori takes plain element objects; every box that holds more than one child must be a flex box.
const h = (type, style, children, props = {}) => ({ type, props: { ...props, style: type === 'img' ? style : { display: 'flex', ...style }, children } });

const TAN = '#e3c9a0';

// Inter, medium and extra-bold, fetched once per instance. Without it the picture still draws in the
// built-in font.
let fonts;
async function loadFonts() {
  if (fonts) return fonts;
  const get = (w) => fetch('https://cdn.jsdelivr.net/fontsource/fonts/inter@5.0.18/latin-' + w + '-normal.woff')
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('font ' + r.status))))
    .then((data) => ({ name: 'Inter', data, weight: w, style: 'normal' }));
  try { fonts = await Promise.all([get(500), get(800)]); } catch (e) { fonts = []; }
  return fonts;
}
const GROOVES = 'radial-gradient(circle, #0a0a0b 0%, #0a0a0b 8%, #19191c 9%, #101012 22%, #1d1d21 23%, #101012 36%, #1b1b1f 37%, #0f0f11 52%, #1c1c20 53%, #101012 68%, #1a1a1d 69%, #0c0c0e 100%)';

function sleeve(rec) {
  const mix = tracksOf(rec), arts = (mix ? mix.map((t) => t.art) : [rec.art]).filter(artOK);
  const box = { position: 'absolute', left: 0, top: 0, width: 470, height: 470, borderRadius: 4, overflow: 'hidden',
                boxShadow: '0 30px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12)', background: 'linear-gradient(150deg, #b8865a, #4a3a26)' };
  if (!mix || arts.length < 2) return h('div', box, arts[0] ? [h('img', { width: 470, height: 470 }, undefined, { src: arts[0], width: 470, height: 470 })] : []);
  const four = [0, 1, 2, 3].map((i) => arts[i % arts.length]);
  return h('div', { ...box, flexWrap: 'wrap' }, four.map((src) => h('img', { width: 235, height: 235 }, undefined, { src, width: 235, height: 235 })));
}

function vinyl(rec) {
  const mix = tracksOf(rec), label = (mix ? mix[0].art : rec.art);
  return h('div', { position: 'absolute', left: 250, top: 20, width: 430, height: 430, borderRadius: 215, background: GROOVES,
                    alignItems: 'center', justifyContent: 'center', boxShadow: '12px 20px 40px rgba(0,0,0,0.6)' }, [
    h('div', { width: 150, height: 150, borderRadius: 75, overflow: 'hidden', background: TAN, alignItems: 'center', justifyContent: 'center',
               border: '6px solid #e9dcc4' },
      artOK(label) ? [h('img', { width: 138, height: 138, borderRadius: 69 }, undefined, { src: label, width: 138, height: 138 })] : []),
  ]);
}

function picture(rec) {
  const mix = tracksOf(rec), from = (rec.from || 'A friend').slice(0, 30);
  const sub = mix ? mix.length + ' songs · ' + mix.slice(0, 3).map((t) => t.title).join(', ') : rec.artist || '';
  return h('div', { width: 1200, height: 630, padding: '0 60px', alignItems: 'center', gap: 34,
                    background: 'radial-gradient(80% 90% at 25% 40%, #3a2c22 0%, #141114 70%)', fontFamily: 'Inter, sans-serif', fontWeight: 500 }, [
    h('div', { position: 'relative', width: 680, height: 470, flexShrink: 0 }, [vinyl(rec), sleeve(rec)]),
    h('div', { flexDirection: 'column', flex: 1, minWidth: 0, gap: 12 }, [
      h('div', { fontSize: 20, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' },
        from + ' sent you a ' + (mix ? 'mixtape' : 'record')),
      h('div', { fontSize: rec.title.length > 34 ? 38 : rec.title.length > 20 ? 44 : 52, fontWeight: 800, color: '#fff', lineHeight: 1.05, letterSpacing: -1.5, maxHeight: 112, overflow: 'hidden' }, rec.title),
      sub ? h('div', { fontSize: 26, color: 'rgba(255,255,255,0.68)', lineHeight: 1.25, maxHeight: 66, overflow: 'hidden' }, sub) : null,
      rec.note ? h('div', { fontSize: 27, color: TAN, lineHeight: 1.25, marginTop: 8, maxHeight: 70, overflow: 'hidden' }, '“' + rec.note + '”') : null,
      h('div', { marginTop: 26, alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 800, color: '#fff' }, [
        h('div', { width: 30, height: 30, borderRadius: 15, background: GROOVES, alignItems: 'center', justifyContent: 'center' },
          [h('div', { width: 12, height: 12, borderRadius: 6, background: '#ff5a6e' })]),
        'Crate',
      ]),
    ].filter(Boolean)),
  ]);
}

export default async function handler(req, res) {
  const id = String(req.query.id || '');
  let rec = null;
  if (validId(id)) { try { rec = await lookup(id); } catch (e) { /* fall back below */ } }
  const fallback = (rec && artOK(rec.art) && rec.art) || '/icon-512.png';
  if (!rec) { res.statusCode = 302; res.setHeader('Location', fallback); return res.end(); }
  try {
    const img = new ImageResponse(picture(rec), { width: 1200, height: 630, emoji: 'twemoji', fonts: await loadFonts() });
    const png = Buffer.from(await img.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
    res.end(png);
  } catch (e) {
    console.error(e);
    res.statusCode = 302;
    res.setHeader('Location', fallback);
    res.end();
  }
}
