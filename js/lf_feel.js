'use strict';
// Game-feel components the scenes use that were stubs: written from the game's own field docs (tools/doc.py).
//   UiFlash, ScrubInPieces, WashAwayPieces, HandKnead, PourSqueeze, ToolCapOpener, ElasticHose, SprayMist, SprayAim,
//   StreamSplash, StageFocus, ShutLashes, FillsRegionOnTouch, ClearsRestAt
(() => {
if (/[?&]nofeel=1/.test(location.search)) return; // dev: compare with the stubs
const LF = E.LF, S = LF.S, B = E.Behaviour, M = E.M;
const sharp = (k, dt) => 1 - Math.exp(-k * dt);
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const contactOf = (tool) => { const c = LF.contact; return c && E.frame - c.f <= 1 && (!tool || c.tool === tool) ? c : null; };
const workPoint = (tool) => { const c = contactOf(tool); if (c) return c.p; return tool && tool.held ? tool.tip() : null; };
const toLocal = (g, w) => (g.parent ? M.ap(M.inv(g.parent.worldMatrix()), w[0], w[1]) : w);
const tw = (owner, dur, update, ease) => new Promise((res) => E.tween({ dur: Math.max(0.001, dur), owner, ease: ease || E.ease.inOutSine, update, done: res, onKill: res }));
const playAS = (as) => { if (as && as.t === 'AS' && LF.asPlay) LF.asPlay(as); };

// ------------------------------------------------------------------ UiFlash: the white flash of the photo
S('LevelFlow.UiFlash', class extends B {
  onEnable() {
    const cg = this.ref('_group'); if (!cg) return; const d = this.d;
    E.killOwner(this); cg.alpha = 0;
    const up = d._inSeconds || 0.05, hold = d._holdSeconds || 0.06, out = d._outSeconds || 0.65;
    E.tween({ dur: up, owner: this, ease: E.ease.linear, update: (k) => { cg.alpha = k; }, done: () => E.tween({ dur: out, delay: hold, owner: this, ease: E.ease.outQuad, update: (k) => { cg.alpha = 1 - k; } }) });
  }
});

// ------------------------------------------------------------------ ScrubInPieces: bits worked into the foam under the tool
S('LevelFlow.ScrubInPieces', class extends B {
  awake() { this.gone = new Set(); }
  update() {
    const tool = this.ref('_tool'); if (!tool || !tool.held) return;
    const p = workPoint(tool); if (!p) return; const d = this.d; const r = d._radius || 0.7;
    for (const sr of this.refs('_pieces')) {
      if (!sr || this.gone.has(sr)) continue; const g = LF.go(sr); if (!g || !g.activeInHierarchy) continue;
      const w = g.worldPos(); if (Math.hypot(w[0] - p[0], w[1] - p[1]) > r) continue;
      this.gone.add(sr); const s0x = g.sx, s0y = g.sy, a0 = sr.color ? sr.color[3] : 1, f = d._shrinkTo == null ? 0.6 : d._shrinkTo, rot0 = g.rot, spin = (Math.random() * 2 - 1) * 40;
      E.tween({ dur: d._seconds || 0.3, owner: g, ease: E.ease.inQuad, update: (k) => { g.sx = s0x * (1 + (f - 1) * k); g.sy = s0y * (1 + (f - 1) * k); g.rot = rot0 + spin * k; if (sr.color) sr.color[3] = a0 * (1 - k); }, done: () => { g.setActive(false); g.sx = s0x; g.sy = s0y; g.rot = rot0; if (sr.color) sr.color[3] = a0; } });
    }
  }
});

// ------------------------------------------------------------------ WashAwayPieces: bits knocked loose and thrown off to their side
S('LevelFlow.WashAwayPieces', class extends B {
  awake() { this.gone = new Set(); }
  update() {
    const tool = this.ref('_tool'); if (!tool || !tool.held) return;
    const p = workPoint(tool); if (!p) return; const d = this.d; const r = d._radius || 0.9;
    for (const x of this.refs('_pieces')) {
      const g = LF.go(x); if (!g || this.gone.has(g) || !g.activeInHierarchy) continue;
      const w = g.worldPos(); if (Math.hypot(w[0] - p[0], w[1] - p[1]) > r) continue;
      this.gone.add(g);
      const side = w[0] < (d._middleX || 0) ? -1 : 1; const thr = (d._throw || 1.6) * (0.75 + Math.random() * 0.5), hop = (d._hop || 0.8) * (0.7 + Math.random() * 0.6);
      const srs = g.compsInChildren('SR'); const a0 = srs.map((s) => s.color[3]); const spin = side * (120 + Math.random() * 160), rot0 = g.rot;
      if (d._popClip) LF.sound(d._popClip, d._popVolume || 0.4); else playAS(this.ref('_audio'));
      E.tween({ dur: d._seconds || 0.6, owner: g, ease: E.ease.linear, update: (k) => { g.setWorldPos(w[0] + side * thr * k, w[1] + hop * 4 * k * (1 - k) - thr * 0.6 * k * k); g.rot = rot0 + spin * k; srs.forEach((s, i) => { s.color[3] = a0[i] * (1 - smooth((k - 0.5) * 2)); }); }, done: () => { g.setActive(false); srs.forEach((s, i) => { s.color[3] = a0[i]; }); } });
    }
  }
});

// ------------------------------------------------------------------ HandKnead: the fingers knead while the hands are on her
S('LevelFlow.HandKnead', class extends B {
  start() { this.f = this.refs('_fingers').map((x) => LF.go(x)).filter(Boolean).map((g) => ({ g, rot: g.rot, sy: g.sy })); this.a = 0; this.ph = 0; }
  update(dt) {
    const tool = this.ref('_tool'); if (!this.f) return; const d = this.d;
    const on = !!(tool && tool.held && tool.onArt);
    this.a += ((on ? 1 : 0) - this.a) * sharp(1 / Math.max(0.03, d._easeSeconds || 0.15), dt);
    this.ph += dt * (d._rate || 2.2) * Math.PI * 2;
    const sides = d._sides || [];
    const deep = (0.5 - 0.5 * Math.cos(this.ph)) * this.a, rock = Math.sin(this.ph) * this.a;
    this.f.forEach((f, i) => { const sd = sides[i] || 1; f.g.rot = f.rot + sd * (d._rockDegrees || 3) * rock; f.g.sy = f.sy * (1 - (d._bend || 0.12) * deep); });
  }
});

// ------------------------------------------------------------------ PourSqueeze: a hand squeezes the tube in presses while it pours
S('LevelFlow.PourSqueeze', class extends B {
  start() {
    this.v = (this.d._vessel && this.ref('_vessel')) || this.go.comps.find((c) => c.cls === 'LevelFlow.PourVessel');
    const b = this.d._body && LF.go(this.ref('_body')); this.b = b; if (!b) return;
    this.rest = { x: b.x, y: b.y, sx: b.sx, sy: b.sy }; this.hand = 0; this.ph = 0;
  }
  update(dt) {
    const b = this.b, v = this.v; if (!b || !v) return; const d = this.d;
    const pouring = !!v._pp || !!v._loop || (v.amount > 0 && v.amount < 1 && E.time - (this._lastAmtT || 0) < 0.2);
    if (v.amount !== this._lastAmt) { this._lastAmt = v.amount; this._lastAmtT = E.time; }
    this.hand += ((pouring ? 1 : 0) - this.hand) * sharp(3 / Math.max(0.03, d._settleSeconds || 0.18), dt);
    if (this.hand < 0.002 && !pouring) { this.ph = 0; b.sx = this.rest.sx; b.sy = this.rest.sy; b.x = this.rest.x; b.y = this.rest.y; return; }
    const T = d._pressSeconds || 1.05; this.ph = (this.ph + dt / T) % 1;
    const pi = d._pressIn || 0.18, ph = d._pressHold || 0.34, po = d._pressOut || 0.3; const t = this.ph;
    const press = t < pi ? smooth(t / pi) : t < pi + ph ? 1 : t < pi + ph + po ? 1 - smooth((t - pi - ph) / po) : 0;
    const k = press * this.hand;
    const fx = 1 - (d._pinch || 0.13) * k, fy = 1 + (d._stretch || 0.05) * k;
    b.sx = this.rest.sx * fx; b.sy = this.rest.sy * fy;
    if (d._holdsTheNozzle) {
      // keep the nozzle end where it is: the squeeze comes out of the far end
      if (this.nz == null) { const m = v.mouth(); const l = M.ap(M.inv(b.worldMatrix()), m[0], m[1]); this.nz = l[1] * this.rest.sy; }
      b.y = this.rest.y - (fy - 1) * this.nz;
    }
  }
});

// ------------------------------------------------------------------ ToolCapOpener: the cap is twisted off before the tool can be used
S('LevelFlow.ToolCapOpener', class extends B {
  awake() { this.opened = false; this.busy = false; }
  update() {
    if (this.opened || this.busy) return;
    const tool = this.ref('_tool'); const cap = LF.go(this.ref('_cap')); if (!tool || !cap) return;
    const d = this.d; const c0 = d._closed || [cap.x, cap.y];
    if (!this.homed) { this.homed = { x: cap.x, y: cap.y, rot: cap.rot }; cap.x = c0[0]; cap.y = c0[1]; }
    tool.locked = true;
    if (tool.arriving) return;
    this.busy = true; this.run(tool, cap);
  }
  async run(tool, cap) {
    const d = this.d; const r0 = cap.rot; const c0 = [cap.x, cap.y], lift = d._lifted || [c0[0], c0[1] + 0.5], away = d._away || [c0[0] + 3, c0[1] + 3];
    const srs = cap.compsInChildren('SR'); const a0 = srs.map((s) => s.color[3]);
    await LF.wait(d._holdSeconds || 0.2);
    playAS(this.ref('_openSound'));
    const wd = d._wiggleDegrees || 14;
    await tw(cap, d._wiggleSeconds || 0.15, (k) => { cap.rot = r0 + Math.sin(k * Math.PI * 3) * wd * (1 - k * 0.3); }, E.ease.linear);
    await tw(cap, d._liftSeconds || 0.13, (k) => { cap.x = c0[0] + (lift[0] - c0[0]) * k; cap.y = c0[1] + (lift[1] - c0[1]) * k; cap.rot = r0 + wd * 0.5 * k; }, E.ease.outQuad);
    await tw(cap, d._flySeconds || 0.18, (k) => { cap.x = lift[0] + (away[0] - lift[0]) * k; cap.y = lift[1] + (away[1] - lift[1]) * k; cap.rot = r0 + wd * 0.5 + 220 * k; srs.forEach((s, i) => { s.color[3] = a0[i] * (1 - k * k); }); }, E.ease.inQuad);
    cap.setActive(false); srs.forEach((s, i) => { s.color[3] = a0[i]; }); cap.rot = r0;
    tool.locked = false; this.opened = true; this.busy = false;
  }
  onDisable() { if (this.busy) { const tool = this.ref('_tool'); if (tool) tool.locked = false; this.busy = false; } }
});

// ------------------------------------------------------------------ ElasticHose: the shower hose from off screen to the head, sagging and swinging
const hoseImg = () => E.texImg('polarbear_hose_pipe.webp');
S('LevelFlow.ElasticHose', class extends B {
  awake() { this.c = null; this.cv = [0, 0]; hoseImg(); }
  get sortOrder() { const t = this.ref('_tool'); const sr = t && LF.go(t).comp('SR'); return sr ? (sr.o || 0) - 2 : 58; }
  ends() { const a = LF.go(this.ref('_attach')), b = LF.go(this.ref('_anchor')); return a && b ? [a.worldPos(), b.worldPos()] : null; }
  update(dt) {
    const e = this.ends(); if (!e) return; dt = Math.min(dt, 1 / 30); const d = this.d;
    const [A, Bp] = e; const gap = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]); const L = d._length || gap;
    const slack = Math.max(0, L - gap) * (d._sag == null ? 0.7 : d._sag);
    const tgt = [(A[0] + Bp[0]) / 2, (A[1] + Bp[1]) / 2 - slack];
    if (!this.c) { this.c = tgt.slice(); return; }
    const w = 2 * Math.PI * (d._swingsPerSecond || 1.8); const keep = Math.max(0.01, Math.min(0.99, d._keepPerSwing == null ? 0.4 : d._keepPerSwing)); const z = Math.min(1, -Math.log(keep) / (2 * Math.PI));
    for (let i = 0; i < 2; i++) { this.cv[i] += (w * w * (tgt[i] - this.c[i]) - 2 * z * w * this.cv[i]) * dt; this.c[i] += this.cv[i] * dt; }
    this.gap = gap; this.L = L;
  }
  drawWorld(ctx, alpha) {
    const e = this.ends(); const im = hoseImg(); if (!e || !this.c || !im._ok) return; const d = this.d;
    const [A, Bp] = e; const C = this.c;
    const tool = LF.go(this.ref('_tool')); const ts = tool ? Math.abs(tool.sx) : 1;
    let width = (d._width || 0.42) * ts; if (this.gap > this.L) width *= Math.max(d._thinnest || 0.62, this.L / this.gap);
    const n = Math.max(4, d._segments || 16) * 2; const span = d._artSpan || [0.12, 0.88];
    const pt = (t) => [(1 - t) * (1 - t) * A[0] + 2 * (1 - t) * t * C[0] + t * t * Bp[0], (1 - t) * (1 - t) * A[1] + 2 * (1 - t) * t * C[1] + t * t * Bp[1]];
    E.setT(E._cm); ctx.globalAlpha = alpha;
    const ih = im.height, iw = im.width; const v0 = ih * (1 - span[1]), vh = ih * (span[1] - span[0]);
    let p = pt(0);
    for (let i = 1; i <= n; i++) {
      const q = pt(i / n); const dx = q[0] - p[0], dy = q[1] - p[1]; const len = Math.hypot(dx, dy); if (len < 1e-5) { p = q; continue; }
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
      const sv = v0 + vh * ((i - 1) / n), svh = Math.max(1, vh / n);
      ctx.drawImage(im, 0, sv, iw, svh, -width / 2, -0.01, width, len + 0.02);
      ctx.restore(); p = q;
    }
    ctx.globalAlpha = 1;
  }
});

// ------------------------------------------------------------------ SprayMist: the mist takes the dye's colour; the cone flickers while it sprays
S('LevelFlow.SprayMist', class extends B {
  awake() { this.coneA = 0; }
  start() { this.apply(); }
  onEnable() { this.apply(); }
  apply() {
    const d = this.d; const t = d._tint || [1, 1, 1, 1];
    for (const ps of this.refs('_systems')) for (const c of (ps && LF.go(ps) ? LF.go(ps).compsInChildren('PS') : [])) { c._tint = [t[0], t[1], t[2]]; c._tintVar = d._variation || 0; }
    const cone = this.d._cone && this.ref('_cone'); if (cone && d._tintCone !== false) { cone.color[0] = t[0]; cone.color[1] = t[1]; cone.color[2] = t[2]; }
  }
  update(dt) {
    const cone = this.d._cone && this.ref('_cone'); if (!cone) return; const d = this.d;
    const emitting = this.refs('_systems').some((ps) => ps && LF.go(ps) && LF.go(ps).activeInHierarchy && LF.go(ps).compsInChildren('PS').some((c) => c.sys && c.sys.emitting));
    const tgt = emitting ? 1 : 0; const sec = emitting ? d._coneFadeInSeconds || 0.08 : d._coneFadeOutSeconds || 0.14;
    this.coneA += (tgt - this.coneA) * sharp(3 / Math.max(0.02, sec), dt);
    const fl = 1 + (d._flicker || 0.16) * Math.sin(E.time * Math.PI * 2 * (d._flickerRate || 11)) * (0.6 + 0.4 * Math.sin(E.time * 7.3));
    cone.color[3] = (d._coneAlpha || 0.7) * this.coneA * fl;
    if (!this._sy) this._sy = cone.go.sy; cone.go.sy = this._sy * (0.92 + 0.08 * fl);
  }
});
// tint in the particle draw (fx.js reads c._tint)

// ------------------------------------------------------------------ SprayAim: the bottle turns to spray toward the middle from either side
S('LevelFlow.SprayAim', class extends B {
  awake() { this.side = null; this.f = 1; }
  lateUpdate(dt) {
    const tool = this.ref('_tool'); if (!tool) return; const g = tool.go; const d = this.d;
    const mid = LF.go(this.ref('_middle')); const built = d._builtSide || 1;
    if (!tool.held) { this.side = null; this.f += (1 - this.f) * sharp(12, dt); g.sx = Math.abs(g.sx) * this.f; return; }
    if (mid) { const x = g.worldPos()[0] - mid.worldPos()[0]; const past = d._turnPast || 0.28; const want = x < -past ? 1 : x > past ? -1 : this.side; if (want != null) this.side = want; }
    const s = this.side == null ? built : this.side; const tgt = s === built ? 1 : -1;
    this.f += (tgt - this.f) * sharp(3 / Math.max(0.05, d._rockSeconds || 0.25), dt);
    const f = Math.abs(this.f) < 0.05 ? (this.f < 0 ? -0.05 : 0.05) : this.f;
    g.sx = Math.abs(g.sx) * f;
  }
});

// ------------------------------------------------------------------ StreamSplash: splashes where the stream lands
S('LevelFlow.StreamSplash', class extends B {
  awake() { this.on = false; }
  update() {
    const st = this.ref('_stream'); const on = !!(st && st.on && st.to && st.go.activeInHierarchy);
    if (on) { const f = this.d._follow && LF.go(this.ref('_follow')); const p = f ? f.worldPos() : st.to; this.go.setWorldPos(p[0], p[1]); }
    if (on === this.on) return; this.on = on;
    for (const ps of this.refs('_systems')) { const g = LF.go(ps); if (!g) continue; if (on) { g.setActive(true); E.psPlay(g); } else E.psStop(g); }
  }
});

// ------------------------------------------------------------------ StageFocus: the stage leans in while she is worked on
S('LevelFlow.StageFocus', class extends B {
  start() { const g = this.go; this.rest = { x: g.x, y: g.y, sx: g.sx, sy: g.sy }; this.z = 1; this.piv = null; this.pan = [0, 0]; this.last = -9; }
  update(dt) {
    const d = this.d, g = this.go; if (!this.rest) return;
    const c = contactOf(); const working = !!(c && c.onArt); if (working) this.last = E.time;
    const engaged = working || E.time - this.last < (d._releaseGrace || 1);
    const zt = engaged ? d._zoom || 1.12 : 1;
    this.z += (zt - this.z) * sharp(3 / Math.max(0.05, d._zoomSeconds || 0.6), dt);
    const kp = sharp(3 / Math.max(0.05, d._pivotSeconds || 0.7), dt);
    let piv, pan = [0, 0];
    if (d._frameWork && d._work) {
      const W = Array.isArray(d._work) ? d._work : [d._work.x, d._work.y, d._work.width, d._work.height];
      const mid = [W[0] + W[2] / 2, W[1] + W[3] / 2]; piv = mid;
      if (working) {
        const l = toLocal(g, c.p); const reach = d._panReach || 0.6;
        const nx = E.clamp((l[0] - mid[0]) / (W[2] / 2 * reach), -1, 1), ny = E.clamp((l[1] - mid[1]) / (W[3] / 2 * reach), -1, 1);
        const over = this.z - 1; pan = [-nx * over * W[2] / 2, -ny * over * W[3] / 2]; this._pan = pan;
      } else if (engaged && this._pan) pan = this._pan;
    } else {
      const reach = d._pivotReach || [2.4, 3];
      piv = working ? (() => { const l = toLocal(g, c.p); return [E.clamp(l[0], this.rest.x - reach[0], this.rest.x + reach[0]), E.clamp(l[1], this.rest.y - reach[1], this.rest.y + reach[1])]; })() : this.piv || [this.rest.x, this.rest.y];
    }
    if (!this.piv) this.piv = piv.slice();
    this.piv[0] += (piv[0] - this.piv[0]) * kp; this.piv[1] += (piv[1] - this.piv[1]) * kp;
    this.pan[0] += (pan[0] - this.pan[0]) * kp; this.pan[1] += (pan[1] - this.pan[1]) * kp;
    const z = this.z;
    g.sx = this.rest.sx * z; g.sy = this.rest.sy * z;
    g.x = this.piv[0] + (this.rest.x - this.piv[0]) * z + this.pan[0];
    g.y = this.piv[1] + (this.rest.y - this.piv[1]) * z + this.pan[1];
    if (d._viewFloor != null && this.pan[1] > 0) g.y = Math.min(g.y, this.rest.y + Math.max(0, this.pan[1]));
  }
  onDisable() { if (this.rest) { const g = this.go; g.x = this.rest.x; g.y = this.rest.y; g.sx = this.rest.sx; g.sy = this.rest.sy; this.z = 1; } }
});

// ------------------------------------------------------------------ ShutLashes: lashes drawn over a shut lid, only while that lid is showing
S('LevelFlow.ShutLashes', class extends B {
  lateUpdate() {
    const pairs = this.d._pairs || [];
    for (const f of this.d._follows || []) {
      const src = E.resolve(this.go, f.Source), las = E.resolve(this.go, f.Lashes); if (!src || !las || !las.color) continue;
      const shown = src.go.activeInHierarchy && src.enabled !== false && src.color[3] > 0.003;
      const p = shown && pairs.find((q) => q.Shut === src.sp);
      if (p) { las.sp = p.Lashes; las.color[3] = src.color[3]; } else las.color[3] = 0;
    }
  }
});

// ------------------------------------------------------------------ ClearsRestAt: once most of it is worked, the rest goes by itself
S('LevelFlow.ClearsRestAt', class extends B {
  awake() { this.done = false; }
  update() {
    const s = this.ref('_surface'); if (!s || !s.ready || !s.go.activeInHierarchy || !s.inputEnabled) return;
    const p = s.progress01();
    if (p < 0.02) this.done = false;
    if (!this.done && p >= (this.d._at || 0.7)) { this.done = true; s.clearRest(this.d._seconds || 0.45); }
  }
});

// ------------------------------------------------------------------ FillsRegionOnTouch: one stroke over a nail fills the whole nail
S('LevelFlow.FillsRegionOnTouch', class extends B {
  awake() { this.st = []; }
  update() {
    const s = this.ref('_surface'); if (!s || !s.ready || !s.parts || !s.parts.length || !s.go.activeInHierarchy) return;
    const d = this.d; const c = contactOf();
    if (s.progress01() < 0.001) this.st = [];
    s.parts.forEach((r, i) => {
      const st = this.st[i] || (this.st[i] = { dist: 0, prev: null, filled: false });
      if (st.filled) return;
      if (!c || !s.inputEnabled) { st.prev = null; return; }
      const m = s.toMask(c.p[0], c.p[1]); const inside = m[0] >= r[0] && m[0] <= r[2] && m[1] >= r[1] && m[1] <= r[3];
      if (!inside) { st.prev = null; return; }
      if (s.partProgress(r) < (d._touchedAt || 0.03)) { st.prev = c.p.slice(); return; }
      if (st.prev) st.dist += Math.hypot(c.p[0] - st.prev[0], c.p[1] - st.prev[1]); st.prev = c.p.slice();
      if (st.dist >= (d._dragDistance || 0)) { st.filled = true; this.fill(s, r); }
    });
  }
  fill(s, r) {
    playAS(this.ref('_audio'));
    const x0 = Math.max(0, Math.floor(r[0])), x1 = Math.min(s.mw, Math.ceil(r[2])), y0 = Math.max(0, Math.floor(r[1])), y1 = Math.min(s.mh, Math.ceil(r[3]));
    const idx = []; const from = [];
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) { const k = j * s.mw + i; idx.push(k); from.push(s.mask[k]); }
    E.tween({ dur: this.d._fillSeconds || 0.3, owner: this, ease: E.ease.outQuad, update: (k) => { for (let n = 0; n < idx.length; n++) s.mask[idx[n]] = Math.max(s.mask[idx[n]], from[n] + (1 - from[n]) * k); s.dirty = true; } });
  }
});
})();
