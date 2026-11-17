'use strict';
// Scratch surfaces (rub away / rub into being), held tools, ScratchStep.
(() => {
const LF = E.LF, M = E.M, S = LF.S, P = LF.ptr;

// ------------------------------------------------------------------ BrushScratchSurface
// CPU mask (Float32, 0 = untouched, 1 = fully worked) at maskResolution; composited into a canvas that replaces the
// cover sprite's image in the renderer.
class BrushScratchSurface extends E.Behaviour {
  awake() {
    this.sr = (this.d._renderer && this.ref('_renderer')) || this.go.compInChildren('SR');
    this.mode = this.d._mode || 0;
    this.inputEnabled = !!this.d._inputEnabled;
    this.ready = false; this.dirty = true;
    this.lastWorkedFrame = -1;
    this._init();
  }
  _init() {
    const sr = this.sr; if (!sr) return;
    const s = E.sprite(sr.sp); if (!s) return;
    this.s = s;
    if (!s.img._ok) { s.img._p.then(() => this._init()); this._hideUntilReady(); return; }
    const res = this.d._maskResolution || 128;
    const sw = Math.max(1, Math.round(s[3])), sh = Math.max(1, Math.round(s[4]));
    const k = res / Math.max(sw, sh);
    this.mw = Math.max(2, Math.round(sw * k)); this.mh = Math.max(2, Math.round(sh * k));
    // art alpha at mask resolution
    const ac = document.createElement('canvas'); ac.width = this.mw; ac.height = this.mh;
    const ag = ac.getContext('2d', { willReadFrequently: true });
    ag.drawImage(s.img, s[1], s[2], s[3], s[4], 0, 0, this.mw, this.mh);
    const px = ag.getImageData(0, 0, this.mw, this.mh).data;
    const n = this.mw * this.mh;
    this.art = new Float32Array(n);
    this.artSum = 0; for (let i = 0; i < n; i++) { this.art[i] = px[i * 4 + 3] / 255; this.artSum += this.art[i]; }
    this.mask = this.mask && this.mask.length === n ? this.mask : new Float32Array(n);
    // weights for progress
    this.weight = new Float32Array(n);
    const d = this.d;
    const m = sr.go.worldMatrix();
    const ppu = s[7], x0 = (-s[5] * s[10] + s[12]) / ppu, y0 = (-s[6] * s[11] + s[13]) / ppu, w = s[3] / ppu, h = s[4] / ppu;
    this.loc = { x0, y0, w, h };
    for (let j = 0; j < this.mh; j++) for (let i = 0; i < this.mw; i++) {
      const idx = j * this.mw + i; const a = this.art[idx];
      if (a < 0.08) continue;
      if (d._countAboveOnly) { const wp = M.ap(m, x0 + (i + 0.5) / this.mw * w, y0 + (1 - (j + 0.5) / this.mh) * h); if (wp[1] < d._countAboveY) continue; }
      this.weight[idx] = 1;
    }
    this.parts = (d._mustClean || []).map((r) => { const rr = Array.isArray(r) ? r : [r.x, r.y, r.width, r.height]; return [rr[0] * this.mw, (1 - rr[1] - rr[3]) * this.mh, (rr[0] + rr[2]) * this.mw, (1 - rr[1]) * this.mh]; });
    // display canvases
    const dk = Math.min(1, 1024 / Math.max(sw, sh));
    this.cw = Math.max(2, Math.round(sw * dk)); this.ch = Math.max(2, Math.round(sh * dk));
    this.base = document.createElement('canvas'); this.base.width = this.cw; this.base.height = this.ch;
    const bg = this.base.getContext('2d');
    const col = sr.color; const tinted = (col[0] < 0.999 || col[1] < 0.999 || col[2] < 0.999) ? E.tinted(s, col) : null;
    const stack = Math.max(1, Math.round(d._alphaStack || 1));
    for (let i = 0; i < stack; i++) { if (tinted) bg.drawImage(tinted, 0, 0, this.cw, this.ch); else bg.drawImage(s.img, s[1], s[2], s[3], s[4], 0, 0, this.cw, this.ch); }
    this.comp = document.createElement('canvas'); this.comp.width = this.cw; this.comp.height = this.ch;
    this.mc = document.createElement('canvas'); this.mc.width = this.mw; this.mc.height = this.mh;
    this.mctx = this.mc.getContext('2d'); this.mimg = this.mctx.createImageData(this.mw, this.mh);
    this.ready = true; this.dirty = true;
    if (sr._hiddenUntilReady) { sr.color[3] = sr._hiddenUntilReady; sr._hiddenUntilReady = 0; }
    this.refresh();
  }
  _hideUntilReady() { const sr = this.sr; if (sr && !sr._hiddenUntilReady) { sr._hiddenUntilReady = sr.color[3] || 1; sr.color[3] = 0; } }
  setMode(m) { if (m != null && m !== this.mode) { this.mode = m; this.dirty = true; } }
  resetSurface() { if (this.mask) this.mask.fill(0); this.dirty = true; this.refresh(); }
  setInput(on) { this.inputEnabled = on; }
  refresh() {
    if (!this.ready || !this.dirty) return;
    this.dirty = false;
    const n = this.mw * this.mh, D = this.mimg.data, res = this.d._residue || 0, rem = this.mode === 0;
    for (let i = 0; i < n; i++) { const v = this.mask[i]; D[i * 4] = D[i * 4 + 1] = D[i * 4 + 2] = 255; D[i * 4 + 3] = (rem ? v * (1 - res) : v) * 255; }
    this.mctx.putImageData(this.mimg, 0, 0);
    const g = this.comp.getContext('2d');
    g.globalCompositeOperation = 'copy'; g.drawImage(this.base, 0, 0);
    g.globalCompositeOperation = rem ? 'destination-out' : 'destination-in';
    g.imageSmoothingEnabled = true; g.drawImage(this.mc, 0, 0, this.cw, this.ch);
    g.globalCompositeOperation = 'source-over';
    this.sr._override = this.comp;
  }
  lateUpdate() { if (this.dirty) this.refresh(); }
  // world point -> mask pixel coords (float)
  toMask(wx, wy) {
    const im = M.inv(this.sr.go.worldMatrix()); let p = M.ap(im, wx, wy);
    let x = p[0], y = p[1]; if (this.sr.fx) x = -x; if (this.sr.fy) y = -y;
    const L = this.loc; return [(x - L.x0) / L.w * this.mw, (1 - (y - L.y0) / L.h) * this.mh];
  }
  worldToMaskScale() { const ls = this.sr.go.lossyScale(); return this.mw / (this.loc.w * Math.max(1e-4, (ls[0] + ls[1]) / 2)); }
  // is there art under this world point
  artAt(wx, wy) { if (!this.ready) return 0; const [x, y] = this.toMask(wx, wy); const i = Math.floor(x), j = Math.floor(y); if (i < 0 || j < 0 || i >= this.mw || j >= this.mh) return 0; return this.art[j * this.mw + i]; }
  inRect(wx, wy, pad = 0) { if (!this.ready) return false; const [x, y] = this.toMask(wx, wy); const pm = pad * this.worldToMaskScale(); return x >= -pm && y >= -pm && x <= this.mw + pm && y <= this.mh + pm; }
  // stamp a round brush. strength: 1 = brush clears in one pass; wipe: compounding fraction
  stamp(wx, wy, radius, opts = {}) {
    if (!this.ready) return false;
    const [cx, cy] = this.toMask(wx, wy);
    const r = Math.max(0.5, radius * (opts.scale || 1) * this.worldToMaskScale());
    const soft = E.clamp(this.d._brushSoftness == null ? 0.5 : this.d._brushSoftness, 0, 1);
    const inner = 1 - soft;
    const i0 = Math.max(0, Math.floor(cx - r)), i1 = Math.min(this.mw - 1, Math.ceil(cx + r));
    const j0 = Math.max(0, Math.floor(cy - r)), j1 = Math.min(this.mh - 1, Math.ceil(cy + r));
    if (i0 > i1 || j0 > j1) return false;
    const wipe = opts.wipe; const str = opts.strength == null ? 1 : opts.strength;
    let worked = false, cleared = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5 - cx) / r, dy = (j + 0.5 - cy) / r; const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd >= 1) continue;
      const v = dd <= inner ? 1 : 1 - (dd - inner) / (soft || 1e-6);
      const idx = j * this.mw + i; const m0 = this.mask[idx];
      const m1 = wipe ? m0 + (1 - m0) * v * str : Math.max(m0, v * str);
      if (m1 > m0 + 1e-4) { this.mask[idx] = m1; if (this.art[idx] > 0.05) { worked = true; cleared += (m1 - m0) * this.art[idx]; } }
    }
    if (worked) { this.dirty = true; this.lastWorkedFrame = E.frame; this.cleared = (this.cleared || 0) + cleared / (this.artSum || 1); }
    return worked;
  }
  partProgress(r) {
    const cl = this.d._cleanAt || 0.5; let tot = 0, ok = 0;
    const [x0, y0, x1, y1] = r || [0, 0, this.mw, this.mh];
    for (let j = Math.max(0, Math.floor(y0)); j < Math.min(this.mh, Math.ceil(y1)); j++) for (let i = Math.max(0, Math.floor(x0)); i < Math.min(this.mw, Math.ceil(x1)); i++) {
      const idx = j * this.mw + i; const w = this.weight[idx]; if (!w) continue; tot += w; if (this.mask[idx] >= cl) ok += w;
    }
    return tot ? ok / tot : 1;
  }
  get area() { if (!this.ready) return 0; let a = 0; for (let i = 0; i < this.weight.length; i++) a += this.weight[i]; return a * this.loc.w * this.loc.h / (this.mw * this.mh); }
  progress01() {
    if (!this.ready) return 0;
    if (this._pf === E.frame) return this._pv;
    let p = this.partProgress();
    if (this.parts.length) {
      const each = this.d._eachPartDoneAt || 0;
      if (each > 0) { let s = 0, all = true; for (const r of this.parts) { const q = this.partProgress(r); s += Math.min(1, q / each); if (q < each) all = false; } p = all ? p : Math.min(p, s / this.parts.length * 0.999); }
      else for (const r of this.parts) p = Math.min(p, this.partProgress(r));
    }
    this._pf = E.frame; this._pv = p; return p;
  }
  // rub the rest away (complete) over seconds
  clearRest(seconds) {
    return new Promise((res) => {
      if (!this.ready) return res();
      const from = Float32Array.from(this.mask);
      E.tween({ dur: Math.max(0.01, seconds || 0.4), owner: this, ease: E.ease.inOutSine, update: (k) => { for (let i = 0; i < from.length; i++) this.mask[i] = from[i] + (1 - from[i]) * k; this.dirty = true; }, done: res, onKill: res });
    });
  }
  surfaces() { return [this]; }
}
S('LevelFlow.BrushScratchSurface', BrushScratchSurface);
S('LevelFlow.ScratchSurface', BrushScratchSurface);

class ScratchSurfaceGroup extends E.Behaviour {
  awake() { this.inputEnabled = false; this.mode = this.d._mode || 0; }
  members() { if (!this._m) this._m = this.refs('_surfaces').filter((s) => s && s.stamp); return this._m; }
  surfaces() { const out = []; for (const m of this.members()) out.push(...m.surfaces()); return out; }
  setMode(m) { this.members().forEach((s, i) => s.setMode(this.d._membersKeepOwnModes ? (this.d._memberModes || [])[i] : m)); }
  resetSurface() { for (const s of this.members()) s.resetSurface(); }
  setInput(on) { this.inputEnabled = on; for (const s of this.members()) s.setInput(on); }
  get sr() { const m = this.members()[0]; return m && m.sr; }
  get ready() { return this.members().every((m) => m.ready); }
  stamp(wx, wy, r, opts = {}) { let w = false; const sc = this.d._memberBrushScales || []; this.members().forEach((s, i) => { if (s.stamp(wx, wy, r, Object.assign({}, opts, { scale: (opts.scale || 1) * (sc[i] || 1) }))) w = true; }); return w; }
  artAt(wx, wy) { let a = 0; for (const s of this.members()) a = Math.max(a, s.artAt(wx, wy)); return a; }
  inRect(wx, wy, pad) { return this.members().some((s) => s.inRect(wx, wy, pad)); }
  progress01() {
    const ms = this.members(); if (!ms.length) return 1;
    if (this.d._progressMode === 1) { let a = 0, s = 0; for (const m of ms) { const ar = m.area || 0; a += ar; s += ar * m.progress01(); } return a ? s / a : 1; }
    return Math.min(...ms.map((m) => m.progress01()));
  }
  clearRest(sec) { return Promise.all(this.members().map((m) => m.clearRest(sec))); }
  get lastWorkedFrame() { return Math.max(-1, ...this.members().map((m) => m.lastWorkedFrame)); }
}
S('LevelFlow.ScratchSurfaceGroup', ScratchSurfaceGroup);

// hair dried by a dryer held over it: wet sprites fade out, dry fade in, by covered cells
class HeldDrySurface extends E.Behaviour {
  awake() { this.inputEnabled = false; this.dried = 0; this.cells = null; this.mode = 0; this.lastWorkedFrame = -1; }
  get sr() { const w = this.refs('_wet')[0]; return w || null; }
  get ready() { return true; }
  setMode() {} setInput(on) { this.inputEnabled = on; }
  resetSurface() { this.cells = null; this.dried = 0; this.apply(); }
  build() {
    const wet = this.refs('_wet').filter(Boolean); let b = null;
    for (const s of wet) { const r = LF.srBounds(s); if (r) b = b ? [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[2]), Math.max(b[3], r[3])] : r; }
    this.b = b || [0, 0, 1, 1]; const n = this.d._grid || 12;
    this.cells = new Float32Array(n * n); this.n = n;
  }
  stamp(wx, wy, r) {
    if (!this.cells) this.build();
    const b = this.b, n = this.n, rad = (this.d._airRadius || r) + 0;
    const reach = this.d._reach || 0;
    if (wx < b[0] - reach - rad || wx > b[2] + reach + rad || wy < b[1] - reach - rad || wy > b[3] + reach + rad) return false;
    const cw = (b[2] - b[0]) / n, chh = (b[3] - b[1]) / n; const dt = E.dt / Math.max(0.05, this.d._cellSeconds || 0.3);
    let any = false;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cx = b[0] + (i + 0.5) * cw, cy = b[1] + (j + 0.5) * chh;
      if (Math.hypot(cx - wx, cy - wy) <= rad) { this.cells[j * n + i] = Math.min(1, this.cells[j * n + i] + dt); any = true; }
    }
    if (any) { this.lastWorkedFrame = E.frame; this.apply(); }
    return any;
  }
  artAt(wx, wy) { if (!this.cells) this.build(); const b = this.b, r = this.d._reach || 0; return wx >= b[0] - r && wx <= b[2] + r && wy >= b[1] - r && wy <= b[3] + r ? 1 : 0; }
  inRect(wx, wy, pad = 0) { return this.artAt(wx, wy) > 0 || false; }
  progress01() { if (!this.cells) return 0; let s = 0; for (const v of this.cells) s += v >= 1 ? 1 : 0; return Math.min(1, s / this.cells.length / (this.d._driedBy || 0.85)); }
  apply() {
    const p = this.progress01();
    const din = Math.min(1, p / (this.d._dryInBy || 1)); const wf = this.d._wetOutFrom || 0;
    const wout = p <= wf ? 0 : Math.min(1, (p - wf) / Math.max(0.01, 1 - wf));
    for (const s of this.refs('_dry')) if (s) { s.go.setActive(true); s.color[3] = din; }
    for (const s of this.refs('_wet')) if (s) s.color[3] = 1 - wout;
  }
  clearRest(sec) { return new Promise((res) => { if (!this.cells) this.build(); const f = Float32Array.from(this.cells); E.tween({ dur: sec || 0.4, owner: this, update: (k) => { for (let i = 0; i < f.length; i++) this.cells[i] = f[i] + (1 - f[i]) * k; this.apply(); }, done: res, onKill: res }); }); }
  surfaces() { return [this]; }
}
S('LevelFlow.HeldDrySurface', HeldDrySurface);

// comb: messy hair cover rubbed away by the comb's teeth line (approximated with a brush mask on the messy sprite)
class HairCombSurface extends BrushScratchSurface {
  awake() { this.d._renderer = this.d._messy; super.awake(); this.mode = 0; }
  setMode() {}
}
S('LevelFlow.HairCombSurface', HairCombSurface);

// ------------------------------------------------------------------ ScratchTool
class ScratchTool extends E.Behaviour {
  awake() {
    const g = this.go; this.home = { x: g.x, y: g.y, rot: g.rot, sx: g.sx, sy: g.sy, par: g.parent };
    this.held = false; this.tipW = null; this.prevTip = null; this.speed = 0; this.vel = [0, 0];
    this.onPicked = []; this.onReleasedJs = [];
    this.audio = g.comps.find((c) => c.cls === 'LevelFlow.ScratchToolAudio') || null;
    for (const e of this.refs('_activeWhileHeld')) if (e) LF.go(e).setActive(false);
  }
  get name() { return this.d._toolName || this.go.name; }
  tip() {
    const g = this.go;
    if (this.d._tip) { const t = this.ref('_tip'); if (t) return LF.go(t).worldPos(); }
    const o = this.d._tipOffset || [0, 0]; return M.ap(g.worldMatrix(), o[0], o[1]);
  }
  // the part of the tool's sprite that wipes (wipeRegion), as a circle in world space
  wipeArea() {
    const sr = this.go.comp('SR'); if (!sr) return null; const s = E.sprite(sr.sp); if (!s) return null;
    const reg = this.d._wipeRegion || [0.05, 0.05, 0.9, 0.9]; const R = Array.isArray(reg) ? reg : [reg.x, reg.y, reg.width, reg.height];
    const ppu = s[7], x0 = (-s[5] * s[10] + s[12]) / ppu, y0 = (-s[6] * s[11] + s[13]) / ppu, w = s[3] / ppu, h = s[4] / ppu;
    const m = this.go.worldMatrix(); const c = M.ap(m, x0 + (R[0] + R[2] / 2) * w, y0 + (R[1] + R[3] / 2) * h);
    const ls = this.go.lossyScale(); return { c, r: 0.5 * Math.min(R[2] * w * ls[0], R[3] * h * ls[1]) };
  }
  tipFrom() { if (!this.d._tipFrom) return null; const t = this.ref('_tipFrom'); return t ? LF.go(t).worldPos() : null; }
  secondTip() { if (!this.d._secondTip) return null; const t = this.ref('_secondTip'); return t ? LF.go(t).worldPos() : null; }
  canGrab(wx, wy) {
    if (!this.go.activeInHierarchy || this.arriving || this.leaving || this.locked) return false;
    if (LF.hitGO(this.go, wx, wy, 0.3, false)) return true;
    const b = LF.bounds(this.go); return !!(b && wx >= b[0] - 0.2 && wx <= b[2] + 0.2 && wy >= b[1] - 0.2 && wy <= b[3] + 0.2);
  }
  pickUp(wx, wy) {
    if (this.held) return;
    this.held = true; this.heldT = 0; this.pickT = E.time;
    E.killOwner(this.go);
    const g = this.go;
    if (this.dock && this.dock.onTaken) this.dock.onTaken();
    this.grabFrom = [g.x, g.y];
    if (this.d._promoteSorting) LF.boost(g, this.d._heldSortingBoost || 50);
    const gs = this.d._grabScale || 1;
    const s0x = g.sx, s0y = g.sy, tx = this.home.sx * gs, ty = this.home.sy * gs;
    E.tween({ dur: 0.15, owner: g, update: (k) => { g.sx = s0x + (tx - s0x) * k; g.sy = s0y + (ty - s0y) * k; } });
    if (!this.d._effectsOnArtOnly) for (const e of this.refs('_activeWhileHeld')) if (e) { LF.go(e).setActive(true); E.psPlay(LF.go(e)); }
    LF.invoke(this, this.d._onPickedUp);
    for (const f of this.onPicked.slice()) f(this);
    if (this.audio) this.audio.pickedUp();
    for (const c of g.comps) if (c.onToolPicked) c.onToolPicked(this);
    this.prevTip = null;
  }
  release() {
    if (!this.held) return;
    this.held = false;
    const g = this.go;
    for (const e of this.refs('_activeWhileHeld')) if (e) LF.go(e).setActive(false);
    LF.invoke(this, this.d._onReleased);
    for (const f of this.onReleasedJs.slice()) f(this);
    if (this.audio) this.audio.released();
    for (const c of g.comps) if (c.onToolReleased) c.onToolReleased(this);
    if (this.d._returnHomeOnRelease !== false && !this.keepWhereDropped) this.goHome(this.d._returnSeconds || 0.25);
  }
  goHome(sec = 0.25) {
    const g = this.go, h = this.home;
    const sd = this.d._setDownAt && this.ref('_setDownAt');
    let tx = h.x, ty = h.y;
    if (sd && this.drawnOut) { const wp = LF.go(sd).worldPos(); const l = g.parent ? M.ap(M.inv(g.parent.worldMatrix()), wp[0], wp[1]) : wp; tx = l[0]; ty = l[1]; }
    const fx = g.x, fy = g.y, fr = g.rot, fsx = g.sx, fsy = g.sy;
    return new Promise((res) => E.tween({ dur: sec, owner: g, ease: E.ease.outQuad, update: (k) => { g.x = fx + (tx - fx) * k; g.y = fy + (ty - fy) * k; g.rot = fr + (h.rot - fr) * k; g.sx = fsx + (h.sx - fsx) * k; g.sy = fsy + (h.sy - fsy) * k; }, done: () => { LF.unboost(g); if (this.dock && this.dock.onHome) this.dock.onHome(); res(); }, onKill: res }));
  }
  async arrive() {
    const g = this.go; g.setActive(true);
    g.x = this.home.x; g.y = this.home.y; g.rot = this.home.rot; g.sx = this.home.sx; g.sy = this.home.sy;
    if (this.d._slideFromSide && !this.d._arriveInPlace) { this.arriving = true; await LF.slideIn(g, this.d._arriveSeconds || 0.6, this.d._slideTilt || 0); this.arriving = false; }
    if (this.audio) this.audio.arrived();
  }
  async leave() {
    if (this.held) this.release();
    const g = this.go; if (!g.activeInHierarchy) return;
    this.leaving = true;
    await LF.until(() => !E.tweens.some((t) => t.owner === g));
    if (this.d._leaveIntoHome) { await this.goHome(0.25); g.setActive(false); }
    else if (this.d._slideFromSide) await LF.slideOut(g, this.d._leaveSeconds || 0.5, this.d._slideTilt || 0);
    else g.setActive(false);
    this.leaving = false;
    if (this.audio) this.audio.released();
  }
  update(dt) {
    if (!this.held) return;
    const g = this.go, d = this.d; this.heldT += dt;
    const w = LF.ptrWorld();
    const go = d._grabOffset || [0, 0.5];
    let tx = w[0] + go[0], ty = w[1] + go[1];
    if (d._heldCircleRadius > 0) { const a = (E.time / (d._heldCircleSeconds || 1)) * Math.PI * 2; tx += Math.cos(a) * d._heldCircleRadius; ty += Math.sin(a) * d._heldCircleRadius; }
    const wb = d._workBounds;
    if (wb && wb[2] > 0 && wb[3] > 0) { // keep the tip inside the oval
      const tp = this.tip(); const wp = g.worldPos(); const ox = tp[0] - wp[0], oy = tp[1] - wp[1];
      const cx = wb[0] + wb[2] / 2, cy = wb[1] + wb[3] / 2, rx = wb[2] / 2, ry = wb[3] / 2;
      let px = tx + ox - cx, py = ty + oy - cy; const q = (px * px) / (rx * rx) + (py * py) / (ry * ry);
      if (q > 1) { const k = 1 / Math.sqrt(q); px *= k; py *= k; tx = cx + px - ox; ty = cy + py - oy; }
    }
    const cur = g.worldPos();
    const k = 1 - Math.exp(-(d._followSpeed || 20) * dt);
    const nx = cur[0] + (tx - cur[0]) * k, ny = cur[1] + (ty - cur[1]) * k;
    this.vel = [(nx - cur[0]) / Math.max(dt, 1e-3), (ny - cur[1]) / Math.max(dt, 1e-3)];
    g.setWorldPos(nx, ny);
    // lean / sway / wobble
    let rot = this.home.rot;
    if (d._heldDegrees) rot += d._heldDegrees * Math.min(1, this.heldT / Math.max(0.01, d._heldLeanSeconds || 0.01));
    if (d._swayDegrees) { const sway = E.clamp(-this.vel[0] * (d._swayPerSpeed || 1), -d._swayDegrees, d._swayDegrees); this._sway = LF.damp(this._sway || 0, sway, d._swaySharpness || 8, dt); rot += this._sway; }
    if (d._heldWobbleDegrees) rot += Math.sin(E.time * Math.PI * 2 * (d._heldWobbleRate || 1)) * d._heldWobbleDegrees;
    if (this.aimAt && d._faceTargetDegrees) { const t = this.aimAt; const wp = g.worldPos(); let a = Math.atan2(t[1] - wp[1], t[0] - wp[0]) / E.DEG - 90; a = E.clamp(((a + 540) % 360) - 180, -d._faceTargetDegrees, d._faceTargetDegrees); this._aim = LF.damp(this._aim || 0, a, d._faceTargetSharpness || 10, dt); rot += this._aim; }
    else if (this._aim) { this._aim = LF.damp(this._aim, 0, d._faceTargetSharpness || 10, dt); rot += this._aim; }
    g.rot = rot;
    if (d._heldBob) { const wp = g.worldPos(); g.setWorldPos(wp[0], wp[1] + Math.sin(E.time * Math.PI * 2 * (d._heldWobbleRate || 1.3)) * d._heldBob); }
    const gs = d._grabScale || 1;
    if (d._workPump && (this.onArt || d._pumpOnArt) && this.heldT > 0.15) { const k = Math.max(0, Math.sin(E.time * Math.PI * 2 * (d._workPumpRate || 6))); g.sy = this.home.sy * gs * (1 - d._workPump * k); g.sx = this.home.sx * gs * (1 + d._workPump * 0.5 * k); }
    else if (this.heldT > 0.15) { g.sx = LF.damp(g.sx, this.home.sx * gs, 12, dt); g.sy = LF.damp(g.sy, this.home.sy * gs, 12, dt); }
    if (d._mirrorWhileHeld) g.sx = -Math.abs(g.sx);
    this.speed = Math.hypot(this.vel[0], this.vel[1]);
  }
}
S('LevelFlow.ScratchTool', ScratchTool);

// work-loop audio of a held tool
class ScratchToolAudio extends E.Behaviour {
  arrived() { if (this.d._arriveClip) LF.sound(this.d._arriveClip, this.d._arriveVolume || 0.5); }
  pickedUp() { if (this.d._pickUpClip) LF.sound(this.d._pickUpClip, this.d._pickUpVolume || 0.5); this.held = true; this.t0 = E.time; }
  released() { this.held = false; this.stopLoop(); }
  stopLoop() { if (this.loop) { this.loop.stop(); this.loop = null; } }
  update() {
    const d = this.d; if (!d._workLoop || !this.held) { this.stopLoop(); return; }
    if (E.time - (this.t0 || 0) < (d._pickUpGraceSeconds || 0)) return;
    const tool = this.go.comps.find((c) => c instanceof ScratchTool);
    const working = d._loopWhileHeld || (tool && tool.onArt && (tool.speed > 0.3));
    if (working && !this.loop) { const a = E.D.audio[d._workLoop]; if (a) this.loop = E.audio.play(a[0], { loop: true, vol: d._workVolume || 0.4, pitch: d._pitch || 1 }); }
    else if (!working && this.loop && E.time - (this._lastWork || 0) > 0.2) this.stopLoop();
    if (working) this._lastWork = E.time;
  }
  onDisable() { this.stopLoop(); }
}
S('LevelFlow.ScratchToolAudio', ScratchToolAudio);

// a tool that rests inside a holder (gloss in its bottle): docked parts show while home
class DockedTool extends E.Behaviour {
  start() { const t = this.ref('_tool'); if (t) { t.dock = this; this.tool = t; } this.onHome(); }
  onTaken() { for (const p of this.refs('_dockedParts')) if (p) LF.go(p).setActive(false); }
  onHome() { for (const p of this.refs('_dockedParts')) if (p) LF.go(p).setActive(true); }
}
S('LevelFlow.DockedTool', DockedTool);

// swaps the tool's sprite while held
class ToolHeldLook extends E.Behaviour {
  start() { const t = (this.d._tool && this.ref('_tool')) || this.go.comps.find((c) => c instanceof ScratchTool); this.sr = (this.d._renderer && this.ref('_renderer')) || this.go.comp('SR'); this.rest = this.sr && this.sr.sp; if (t) { t.onPicked.push(() => { if (this.sr && this.d._held) this.sr.sp = this.d._held; }); t.onReleasedJs.push(() => { if (this.sr) this.sr.sp = this.rest; }); } }
}
S('LevelFlow.ToolHeldLook', ToolHeldLook);

// bubbles / particles emitted at the contact on the art
class ContactBubbles extends E.Behaviour {
  awake() { this.acc = 0; }
  contact(wx, wy, dist, r) {
    const ps = this.d._system ? this.ref('_system') : this.go.compInChildren('PS'); if (!ps) return;
    const sys = E.particles.get(ps); if (!sys) return;
    this.acc += Math.min((this.d._maxPerSecond || 40) * E.dt, dist * (this.d._perUnit || 10) + (this.d._perSecondWhileTouching || 0) * E.dt);
    const lp = M.ap(M.inv(ps.go.worldMatrix()), wx, wy);
    while (this.acc >= 1) { this.acc -= 1; E.particles.emit(ps, 1); const p = sys.parts[sys.parts.length - 1]; if (p) { const a = Math.random() * Math.PI * 2, rr = (r || 0.3) * ((this.d._ring || 0.6) + (Math.random() - 0.5) * (this.d._spread || 0.4)); p.x = lp[0] + Math.cos(a) * rr; p.y = lp[1] + Math.sin(a) * rr; } }
  }
}
S('LevelFlow.ContactBubbles', ContactBubbles);

// ------------------------------------------------------------------ ScratchStep
LF.activeTool = null;
class ScratchStep extends LF.LevelStep {
  stepAwake() {
    const s = this.surface();
    if (this.d._hideUntilMyTurn !== false && s) { const g = this.surfaceGO(); if (g) g.setActive(false); }
  }
  surface() { return this._surface || (this._surface = this.ref('_surface')); }
  surfaceGO() { const s = this.surface(); return s ? s.go : null; }
  tool() { return this.d._tool ? this.ref('_tool') : null; }
  async openSurface() {
    const s = this.surface(); if (!s) return;
    const g = this.surfaceGO(); g.setActive(true);
    s.setMode(this.d._mode);
    if (this.d._resetSurfaceOnBegin) s.resetSurface();
    s.setInput(true);
    await LF.until(() => s.ready !== false);
  }
  async execute() {
    const d = this.d; const s = this.surface();
    await this.openSurface();
    const tool = this.tool();
    this.toolObj = tool;
    if (tool) { LF.activeTool = tool; await tool.arrive(); }
    this.heldSeconds = 0; this.bar = 0;
    const thr = d._completionThreshold || 0.9, auto = d._autoFinishAt || 1;
    const radius = () => (tool && tool.d._overrideBrushRadius ? tool.d._brushRadius : (s.d && s.d._brushRadius) || 0.4);
    let last = null, lastSecond = null;
    this.showHintLater();
    await new Promise((resolve) => {
      const tick = () => {
        if (!this.isRunning) return resolve();
        this.idleTick();
        let tip = null, tip2 = null, from = null, active = false;
        if (tool) {
          if (!tool.held && P.justDown && !LF.ptrOverUI()) { const w = LF.downWorld(); if (tool.canGrab(w[0], w[1])) { tool.pickUp(w[0], w[1]); LF.hideHint(); } }
          if (tool.held && !P.down) tool.release();
          if (tool.held) { active = true; const wr = tool.d._wipeWithSprite ? tool.wipeArea() : null; if (wr) { tip = wr.c; this._wipeR = wr.r; } else { tip = tool.tip(); this._wipeR = 0; } tip2 = tool.secondTip(); from = tool.tipFrom(); }
        } else if (P.down && !P.overUI) { active = true; tip = LF.ptrWorld(); }
        if (active && tip) {
          const r = this._wipeR || radius();
          let spread = 1;
          if (tool && tool.d._holdSpreadScale > 1) { const still = last && LF.dist(last, tip) < 0.02; this._still = still ? (this._still || 0) + E.dt : 0; spread = 1 + (tool.d._holdSpreadScale - 1) * Math.min(1, this._still / (tool.d._holdSpreadSeconds || 1)); }
          const wipe = tool && (tool.d._wipeWithSprite || tool.d._dryBrush);
          const strength = wipe ? Math.min(1, (tool.d._wipeStrength || 0.3)) : 1;
          let worked = false;
          const onArt = s.artAt(tip[0], tip[1]) > 0.05 || (from && s.artAt(from[0], from[1]) > 0.05);
          if (tool) tool.onArt = onArt;
          LF.contact = { p: tip, p2: tip2, r: r * spread, tool, onArt, f: E.frame };
          const artOnly = tool && tool.d._worksOnArtOnly;
          const doStamp = (a, b) => {
            const seg = last && !wipe ? Math.max(1, Math.ceil(LF.dist(a, b) / Math.max(0.03, r * 0.3))) : 1;
            for (let i = 1; i <= seg; i++) { const k = i / seg; const x = a[0] + (b[0] - a[0]) * k, y = a[1] + (b[1] - a[1]) * k; if (artOnly && s.artAt(x, y) < 0.05) continue; if (s.stamp(x, y, r, { scale: spread, wipe, strength: wipe ? strength * (wipe ? 0.6 : 1) : 1 })) worked = true; }
          };
          if (from) { const n = Math.max(2, Math.ceil(LF.dist(from, tip) / Math.max(0.05, r * 0.5))); for (let i = 0; i <= n; i++) { const k = i / n; const p = [from[0] + (tip[0] - from[0]) * k, from[1] + (tip[1] - from[1]) * k]; if (s.stamp(p[0], p[1], r, { scale: spread })) worked = true; } }
          else doStamp(last || tip, tip);
          if (tip2) { doStamp(lastSecond || tip2, tip2); lastSecond = tip2; }
          // effects on art only
          if (tool && tool.d._effectsOnArtOnly) { const on = onArt && (!tool.d._effectsWhileRubbing || tool.speed > 0.3); for (const e of tool.refs('_activeWhileHeld')) if (e) { const eg = LF.go(e); if (eg.activeSelf !== on) { eg.setActive(on); if (on) E.psPlay(eg); } } }
          // contact feedback
          if (onArt && tool) { for (const cb of tool.go.compsInChildren('LevelFlow.ContactBubbles')) cb.contact(tip[0], tip[1], last ? LF.dist(last, tip) : 0, r); }
          if (LF.dust && worked) for (const m of s.surfaces()) { const deb = m.d && m.d._debris; if (m.cleared && deb > 0 && m.mode === 0) LF.dust.emit(tip, r * spread, m.cleared * deb); m.cleared = 0; }
          if (onArt) this.heldSeconds += E.dt;
          if (worked || onArt) this._lastProgressTime = E.time;
          last = tip;
        } else { last = null; lastSecond = null; if (tool) tool.onArt = false; }
        let bar = Math.min(1, s.progress01() / thr);
        if (d._finishAfterHeldSeconds > 0) bar = Math.max(bar, Math.min(1, this.heldSeconds / d._finishAfterHeldSeconds));
        if (bar > this.bar + 0.002) this._lastInc = E.time;
        if (bar > this.bar) { this.bar = bar; this.setProgress(bar); }
        if (active) this._rubT = (this._rubT || 0) + E.dt;
        const stalled = this.bar > 0.75 && active && this._rubT > 2 && E.time - (this._lastInc || E.time) > 3;
        if (this.bar >= auto - 1e-4 || this._skip || stalled) { resolve(); return; }
        E.after(0.0001, tick, this);
      };
      tick();
    });
    LF.hideHint();
    s.setInput(false);
    if (tool && tool.held) tool.release();
    if (d._clearRemainderOnComplete !== false) { this.setProgress(1); await s.clearRest(d._clearSeconds || 0.4); }
    if (d._hideOnComplete) { const g = this.surfaceGO(); if (g && d._mode === 0) g.setActive(false); }
    if (tool && !this.keepTool) tool.leave();
    if (LF.activeTool === tool) LF.activeTool = null;
  }
  // idle hint: drag hand from the tool to the surface's middle
  showHintLater() {
    const tool = this.tool(); const s = this.surface();
    const t0 = E.time;
    const tick = () => {
      if (!this.isRunning) return;
      const idle = E.time - Math.max(t0, this._lastProgressTime || 0);
      if (idle > 3.5 && !(tool && tool.held) && !P.down) {
        const sr = s && s.sr; const b = sr ? LF.srBounds(sr) : null;
        const to = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0];
        LF.showHint(tool ? tool.go.worldPos() : [to[0] - 1, to[1]], to, tool ? 'drag' : 'rub');
      } else if ((tool && tool.held) || P.down) LF.hideHint();
      E.after(0.25, tick, this);
    };
    tick();
  }
  fastForward() {
    const s = this.surface(); const g = this.surfaceGO();
    if (g) g.setActive(true);
    if (s) { s.setMode(this.d._mode); const done = () => { for (const x of s.surfaces()) if (x.mask) { x.mask.fill(1); x.dirty = true; } }; if (s.ready) done(); else LF.until(() => s.ready).then(done); }
    LF.invoke(this, this.d._onBegan); LF.invoke(this, this.d._onProgressChanged, 1); LF.invoke(this, this.d._onCompleted);
    if (this.d._hideOnComplete && g && this.d._mode === 0) g.setActive(false);
  }
}
LF.ScratchStep = ScratchStep;
S('LevelFlow.ScratchStep', ScratchStep);

// the surface (and tool) depend on an earlier choice
class ChosenScratchStep extends ScratchStep {
  branch() { const mem = this.ref('_memory'); const i = mem ? mem.chosen : 0; return (this.d._branches || [])[i] || (this.d._branches || [])[0] || null; }
  surface() {
    const b = this.branch();
    if (b) { const k = Object.keys(b).find((x) => /surface/i.test(x)); if (k && b[k]) return E.resolve(this.go, b[k]); }
    return super.surface();
  }
  tool() {
    const b = this.branch();
    if (b) { const k = Object.keys(b).find((x) => /tool/i.test(x)); if (k && b[k]) return E.resolve(this.go, b[k]); }
    return super.tool();
  }
  stepAwake() {
    for (const b of this.d._branches || []) { const k = Object.keys(b).find((x) => /surface/i.test(x)); const s = k && E.resolve(this.go, b[k]); if (s && s.go && this.d._hideUntilMyTurn !== false) s.go.setActive(false); }
    super.stepAwake();
  }
  async execute() {
    const b = this.branch();
    if (b) for (const k of Object.keys(b)) { const v = b[k]; if (Array.isArray(v) && /show/i.test(k)) for (const x of v) { const g = LF.go(E.resolve(this.go, x)); if (g) g.setActive(true); } }
    this._surface = null;
    return super.execute();
  }
}
S('LevelFlow.ChosenScratchStep', ChosenScratchStep);
})();

// dust and crumbs shed by dirt as it is rubbed away
(() => {
const LF = E.LF;
class ScratchDust extends E.Behaviour {
  awake() { LF.dust = this; this.pa = 0; this.ca = 0; this.t = 0; }
  onDestroy() { if (LF.dust === this) LF.dust = null; }
  emit(at, r, amount) {
    const d = this.d; const dt = Math.max(E.dt, 1 / 60);
    this.pa += Math.min(amount * (d._puffsPerClear || 100), (d._maxPuffsPerSecond || 30) * dt);
    this.ca += Math.min(amount * (d._crumbsPerClear || 200), (d._maxCrumbsPerSecond || 50) * dt);
    const put = (ps, n) => { if (!ps || n < 1) return n; const sys = E.particles.get(ps); if (!sys) return n; while (n >= 1) { n -= 1; E.particles.emit(ps, 1); const p = sys.parts[sys.parts.length - 1]; if (p) { const a = Math.random() * Math.PI * 2, rr = r * ((d._emitRing || 0.85) + (Math.random() - 0.5) * 2 * (d._emitSpread || 0.25)); const x = at[0] + Math.cos(a) * rr, y = at[1] + Math.sin(a) * rr; if (sys.cfg.space === 1) p.p = [x, y, 0]; } } return n; };
    this.pa = put(this.d._puffs && this.ref('_puffs'), this.pa); this.ca = put(this.d._crumbs && this.ref('_crumbs'), this.ca);
  }
}
LF.S('LevelFlow.ScratchDust', ScratchDust);
})();
