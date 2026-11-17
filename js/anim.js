'use strict';
// Animator (state machine: default state, exit-time and trigger transitions) and legacy Animation, playing clips
// exported as 30 fps sampled tracks (data/clips.json).
(() => {
const FPS = 30;
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return (s) => { let c = 0xffffffff; const b = new TextEncoder().encode(s); for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
const relPaths = (root) => { const m = new Map(); const walk = (g, p) => { m.set(p, g); m.set('#' + CRC(p), g); for (const c of g.children) walk(c, p ? p + '/' + c.name : c.name); }; walk(root, ''); return m; };
const bindClip = (root, clip, cache) => {
  if (!clip) return null;
  const map = cache.map || (cache.map = relPaths(root));
  return clip.t.map((tr) => ({ tr, g: map.get(tr.path) || null })).filter((b) => b.g);
};
const sample = (v, f) => { const n = v.length; if (!n) return null; const i = Math.max(0, Math.min(n - 1, Math.floor(f))); const j = Math.min(n - 1, i + 1); const a = v[i], b = v[j]; if (typeof a !== 'number' || typeof b !== 'number') return a; return a + (b - a) * (f - i); };
const apply = (binds, t, len, loop) => {
  let f = t * FPS;
  for (const { tr, g } of binds) {
    const n = tr.v.length; let ff = f;
    if (loop && n > 1) ff = f % (n - 1); else ff = Math.min(f, n - 1);
    const v = sample(tr.v, ff); if (v == null && tr.p !== 'sp') continue;
    switch (tr.p) {
      case 'px': if (g.rt && g._ui) g.rt[4] = v; else g.x = v; break;
      case 'py': if (g.rt && g._ui) g.rt[5] = v; else g.y = v; break;
      case 'ax': if (g.rt) g.rt[4] = v; break;
      case 'ay': if (g.rt) g.rt[5] = v; break;
      case 'w': if (g.rt) g.rt[6] = v; break;
      case 'h': if (g.rt) g.rt[7] = v; break;
      case 'sx': g.sx = v; break;
      case 'sy': g.sy = v; break;
      case 'rz': g.rot = v; break;
      case 'active': { const on = v > 0.5; if (g.activeSelf !== on) g.setActive(on); break; }
      case 'en': { const c = tr.cls === 212 ? g.comp('SR') : tr.cls === 114 ? g.comps.find((x) => x.t === 'Img' || x.t === 'MB' || x.t === 'Txt') : g.comp('SR'); if (c) c.enabled = v > 0.5; break; }
      case 'a': case 'r': case 'g': case 'b': { const c = g.comp('SR') || g.comp('Img') || g.comp('Txt'); if (c && c.color) c.color['rgba'.indexOf(tr.p)] = v; break; }
      case 'cga': { const c = g.comp('CG'); if (c) c.alpha = v; break; }
      case 'fill': { const c = g.comp('Img'); if (c) c.fa = v; break; }
      case 'sp': { const c = g.comp('SR') || g.comp('Img'); if (c && v) c.sp = v; break; }
    }
  }
};
// ------------------------------------------------------------------ Animator
const A = (E.anims = new Set());
const ctrlOf = (c) => E.D.clips && E.D.clips.ctrls && E.D.clips.ctrls[c.ctrl];
const enter = (c, li, si) => {
  const L = c.ctrl_.layers[li]; const st = L.states[si]; if (!st) return;
  const clip = st.clip && E.D.clips.clips[st.clip];
  c.L[li] = { si, st, clip, t: 0, binds: clip ? bindClip(c.go, clip, c) : [] };
};
E.animStart = (c) => {
  const C = ctrlOf(c); if (!C) return;
  c.ctrl_ = C; c.L = []; c.params = c.params || {};
  C.layers.forEach((L, i) => enter(c, i, L.def));
  A.add(c);
};
const condOk = (c, conds) => conds.every(([mode, ev]) => { const v = c.params[ev]; if (mode === 1) return !!v; if (mode === 2) return !v; return false; });
E.animUpdate = (dt) => {
  for (const c of A) {
    if (c.go.destroyed) { A.delete(c); continue; }
    if (!c.enabled || !c.go.activeInHierarchy) continue;
    c.ctrl_.layers.forEach((L, li) => {
      const s = c.L[li]; if (!s) return;
      for (const tr of L.any || []) if (tr.cond.length && condOk(c, tr.cond)) { for (const [, ev] of tr.cond) c.params[ev] = false; enter(c, li, tr.dst); return; }
      s.t += dt * (s.st.speed || 1) * (c.speed == null ? 1 : c.speed);
      const len = s.clip ? Math.max(1e-3, s.clip.len) : 1; const norm = s.t / len;
      const loop = s.st.loop || (s.clip && s.clip.loop);
      for (const tr of s.st.tr) {
        const timeOk = !tr.hasExit || norm >= (tr.exit || 1);
        const condsOk = tr.cond.length ? condOk(c, tr.cond) : tr.hasExit;
        if (timeOk && condsOk) { for (const [, ev] of tr.cond) c.params[ev] = false; enter(c, li, tr.dst); return; }
      }
      if (s.clip) apply(s.binds, s.t, len, loop);
    });
  }
};
E.animCall = (c, mn, arg) => {
  if (mn === 'SetTrigger' || mn === 'SetBool') { c.params = c.params || {}; c.params[arg] = mn === 'SetTrigger' ? true : arg; return; }
  if (mn === 'Play' && c.ctrl_) { c.ctrl_.layers[0].states.forEach((s, i) => { if (s.n === arg) enter(c, 0, i); }); return; }
  if (mn === 'set_enabled') c.enabled = !!arg;
};
// ------------------------------------------------------------------ legacy Animation
const LA = new Set();
E.lanimPlay = (c, clipKey) => { const clip = E.D.clips && E.D.clips.clips[clipKey || c.clip]; if (!clip) return; c.cur = { clip, t: 0, binds: bindClip(c.go, clip, c), loop: clip.loop || c.wrap === 2 }; LA.add(c); };
E.lanimUpdate = (dt) => {
  for (const c of LA) {
    if (c.go.destroyed) { LA.delete(c); continue; }
    if (!c.cur || !c.go.activeInHierarchy || !c.enabled) continue;
    c.cur.t += dt; apply(c.cur.binds, c.cur.t, c.cur.clip.len, c.cur.loop);
    if (!c.cur.loop && c.cur.t >= c.cur.clip.len) { c.cur = null; LA.delete(c); }
  }
};
// hook into the engine lifecycle: start animators and auto-play animations when their object comes alive
const origAwake = E._awakeTree;
E._awakeTree = (root) => {
  origAwake(root);
  if (!root.activeInHierarchy) return;
  const walk = (g) => { if (!g.activeSelf) return; for (const c of g.comps) { if (c.t === 'Anim' && c.enabled !== false && !c.ctrl_) E.animStart(c); if (c.t === 'LAnim' && c.auto && !c._autoPlayed) { c._autoPlayed = true; E.lanimPlay(c); } } for (const ch of g.children) walk(ch); };
  walk(root);
};
const origUpdate = E.update;
E.update = (dt) => { origUpdate(dt); E.animUpdate(dt); E.lanimUpdate(dt); };
})();
