// Crate: the sleeve stack on Records. Flip through your records; the front one slides out of its
// sleeve and spins, and the page glows in its cover's colour.
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const A = () => window.CrateApp;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };

  // ---------- Cover colour, for the glow behind the front sleeve ----------
  const tints = {};
  function tint(url, done) {
    if (!url || !A().artOK(url)) return null;
    if (tints[url] !== undefined) return tints[url];
    tints[url] = null;
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = c.height = 24;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data; let r = 0, g = 0, b = 0, w = 0;
        for (let p = 0; p < d.length; p += 4) { const mx = Math.max(d[p], d[p + 1], d[p + 2]), mn = Math.min(d[p], d[p + 1], d[p + 2]); const wt = (mx ? (mx - mn) / mx : 0) ** 2 + 0.05; r += d[p] * wt; g += d[p + 1] * wt; b += d[p + 2] * wt; w += wt; }
        tints[url] = 'rgb(' + [r, g, b].map((v) => Math.round(v / w)).join(',') + ')'; done && done();
      } catch (e) {}
    };
    img.src = url;
    return null;
  }

  // ---------- The sleeve stack ----------
  let pos = 0, target = 0, drag = null, outs = [], angle = 0, list = [], slabs = [], last = performance.now(), focus = -1;
  const VISIBLE = 7;   // sleeves further than this from the front aren't drawn at all
  const FILTERS = [['all', 'All'], ['favs', 'Favorites'], ['received', 'From friends'], ['sent', 'Sent']];
  const FAVS = 'crate-favs';
  const favs = () => { try { return JSON.parse(localStorage.getItem(FAVS)) || {}; } catch (e) { return {}; } };
  const favKey = (r) => r.kind + ':' + (r.rid || r.id);
  const filter = () => A().kind();
  function stackList() { const c = A().crate(), f = filter(); if (f === 'all') return c; if (f === 'favs') { const F = favs(); return c.filter((r) => F[favKey(r)]); } return c.filter((r) => r.kind === f); }
  function renderStack() {
    const chips = $('stackChips'); chips.textContent = '';
    FILTERS.forEach(([k, label]) => {
      const b = el('<button class="chip" type="button"></button>'); b.textContent = label;
      b.setAttribute('aria-pressed', String(filter() === k));
      b.addEventListener('click', () => { pos = target = 0; A().setKind(k); });
      chips.appendChild(b);
    });
    list = stackList();
    const st = $('stack'); st.querySelectorAll('.slab').forEach((n) => n.remove()); outs = []; slabs = [];
    pos = target = Math.max(0, Math.min(list.length - 1, target));
    list.forEach((r, i) => {
      // A sleeve is a sheet of printed card with the record inside: no depth of its own.
      const s = el('<div class="slab"><div class="slab-rec"></div><div class="slab-art"></div></div>');
      s.dataset.i = i;
      s.style.setProperty('--a', A().coverCSS ? A().coverCSS(r) : A().artCSS(r.art));
      tint(r.art, paintTints);
      st.appendChild(s);
      slabs.push(s);
    });
    const empty = !list.length;
    $('stack').hidden = empty; $('stackActions').hidden = empty; if (empty) $('stackGlow').style.background = 'none';
    $('stackInfo').querySelector('small').textContent = '';
    $('stackInfo').classList.toggle('is-empty', empty);
    $('stackInfo').querySelector('b').textContent = empty ? 'No records here yet' : '';
    $('stackInfo').querySelector('span').textContent = empty ? (filter() === 'sent' ? 'Records you send show up here, with whether they’ve been opened.' : filter() === 'favs' ? 'Tap the heart under a record to keep it here.' : filter() === 'received' ? 'Records friends send you land here when you tap “Save in Crate”.' : 'Make a record, or save one a friend sends you.') : '';
    focus = -1;
  }
  function paintTints() {
    focus = -1;
  }
  const clamp = (v) => Math.max(0, Math.min(list.length - 1, v));
  function setFocus(i) {
    focus = i; const r = list[i]; if (!r) return;
    const info = $('stackInfo');
    info.querySelector('b').textContent = r.title;
    info.querySelector('span').textContent = r.artist || ' ';
    info.querySelector('small').textContent = r.kind === 'sent' ? (r.to ? 'Sent to ' + r.to : 'Sent') + (r.rid ? ' · ' + A().stateText(r) : '') + (r.note ? ' · “' + r.note + '”' : '') : 'From ' + (r.from || 'a friend') + (r.note ? ' · “' + r.note + '”' : '');
    const fv = !!favs()[favKey(r)]; $('stackFav').setAttribute('aria-pressed', String(fv)); $('stackFav').setAttribute('aria-label', fv ? 'Remove from favorites' : 'Favorite');
    $('stackOpen').href = A().shareURL(r);
    const tc = tints[r.art];
    $('stackGlow').style.background = tc ? 'radial-gradient(70% 38% at 50% 44%, color-mix(in oklch, ' + tc + ' 55%, transparent) 0%, transparent 70%)' : 'none';
  }
  function tick(now) {
    const dt = Math.min(64, now - last); last = now;
    const st = $('stack');
    if (st && !st.hidden && !$('view-crate').hidden && list.length) {
      if (!drag) pos += (target - pos) * (1 - Math.exp(-dt / 190));
      if (!reduced) angle = (angle + dt * 0.2) % 360;
      slabs.forEach((s, i) => {
        const d = i - pos, ad = Math.abs(d), sd = Math.sign(d), m = Math.min(1, ad);
        // Only the sleeves near the front are moved each frame; the rest wait out of sight.
        if (ad > VISIBLE) { if (!s.hidden) { s.hidden = true; outs[i] = 0; } return; }
        if (s.hidden) s.hidden = false;
        const y = sd * (ad < 1 ? ad * 170 : 170 + (ad - 1) * 56), z = -m * 60 - Math.max(0, ad - 1) * 12;
        s.style.transform = 'translate3d(' + (-(1 - m) * 36).toFixed(1) + 'px,' + y.toFixed(1) + 'px,' + z.toFixed(1) + 'px) rotateX(' + (sd * m * 56).toFixed(2) + 'deg) scale(' + (1 - m * 0.06).toFixed(3) + ')';
        s.style.zIndex = String(1000 - Math.round(ad * 10));
        s.style.opacity = String(Math.max(0, Math.min(1, 6 - ad)));
        // The record stays in its sleeve until this one settles in front, then slides out and spins.
        const want = ad < 0.12 && !drag ? 1 : 0, cur = outs[i] || 0;
        const o = outs[i] = cur + (want - cur) * (1 - Math.exp(-dt / (want > cur ? 200 : 90))), e = o * o * (3 - 2 * o);
        s.firstChild.style.transform = 'translateZ(-1px) translateX(' + (e * 96).toFixed(1) + 'px) rotate(' + (angle * e).toFixed(1) + 'deg)';
      });
      const f = clamp(Math.round(pos)); if (f !== focus) setFocus(f);
    }
    requestAnimationFrame(tick);
  }
  function wireStack() {
    const st = $('stack');
    st.addEventListener('pointerdown', (e) => {
      const s = e.target.closest('.slab');
      drag = { y: e.clientY, p: pos, moved: 0, ly: e.clientY, lt: performance.now(), v: 0, i: s ? +s.dataset.i : -1 };
      try { st.setPointerCapture(e.pointerId); } catch (er) {}
    });
    st.addEventListener('pointermove', (e) => {
      if (!drag) return; const dy = e.clientY - drag.y, now = performance.now();
      drag.moved = Math.max(drag.moved, Math.abs(dy));
      drag.v = drag.v * 0.6 + ((e.clientY - drag.ly) / Math.max(1, now - drag.lt)) * 0.4; drag.ly = e.clientY; drag.lt = now;
      let p = drag.p - dy / 150; if (p < 0) p *= 0.35; if (p > list.length - 1) p = list.length - 1 + (p - list.length + 1) * 0.35;
      pos = p;
    });
    const up = () => {
      if (!drag) return; const d = drag; drag = null;
      if (d.moved < 6) { if (d.i >= 0 && d.i !== focus) target = d.i; else if (d.i >= 0) window.open($('stackOpen').href, '_blank', 'noopener'); return; }
      // A flick carries on: where the sleeves would be after ~a quarter second at that speed.
      if (performance.now() - d.lt > 80) d.v = 0;   // held still before letting go: no flick
      target = clamp(Math.round(pos - Math.max(-6, Math.min(6, (d.v * 260) / 150))));
    };
    st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    // Wheel and trackpad move the sleeves continuously, then settle on the nearest one. At the first
    // or last record the page scrolls on instead of getting stuck.
    st.addEventListener('wheel', (e) => {
      const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      if ((dy < 0 && target <= 0) || (dy > 0 && target >= list.length - 1)) return;
      e.preventDefault();
      target = Math.max(0, Math.min(list.length - 1, target + dy / 160));
      clearTimeout(st.wt);
      st.wt = setTimeout(() => { target = clamp(Math.round(target)); }, 110);
    }, { passive: false });
    st.tabIndex = 0;
    st.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { target = clamp(target + 1); e.preventDefault(); } if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { target = clamp(target - 1); e.preventDefault(); } });
    $('stackFav').addEventListener('click', () => {
      const r = list[focus]; if (!r) return;
      const F = favs(), k = favKey(r); if (F[k]) delete F[k]; else F[k] = true;
      try { localStorage.setItem(FAVS, JSON.stringify(F)); } catch (e) {}
      if (filter() === 'favs') { pos = target = Math.max(0, Math.min(focus, list.length - 2)); renderStack(); } else setFocus(focus);
    });
    $('stackSend').addEventListener('click', () => {
      const r = list[focus]; if (!r) return;
      location.hash = '#/';
      setTimeout(() => { A().showRecord({ title: r.title, artist: r.artist, art: r.art, spotify: r.spotify, apple: r.apple, tracks: r.tracks }); $('sendBtn').click(); }, 60);
    });
    requestAnimationFrame(tick);
  }

  function init() {
    if (!A()) return setTimeout(init, 30);
    wireStack();
    document.addEventListener('crate:view', (e) => { if (e.detail === 'crate') renderStack(); });
    document.addEventListener('crate:records', () => { if (!$('view-crate').hidden) renderStack(); });
    document.addEventListener('crate:seeded', () => { if (!$('view-crate').hidden) renderStack(); });
    if (location.hash.replace(/^#\/?/, '').startsWith('records')) renderStack();
  }
  init();
})();
