'use strict';
// LevelFlow runtime core: runner, base step, UnityEvents, pointer, camera, screen fade, track performances.
(() => {
const LF = (E.LF = {});
const M = E.M;
const S = (cls, C) => { E.scripts[cls] = C; return C; };
S.__noop = class {};
LF.S = S;

// ------------------------------------------------------------------ helpers
LF.go = (x) => (x ? (x instanceof E.GO ? x : x.go || null) : null);
LF.comp = (x, t) => { const g = LF.go(x); return g ? g.comp(t) : null; };
LF.wpos = (x) => { const g = LF.go(x); return g ? g.worldPos() : [0, 0]; };
LF.dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
LF.lerp = (a, b, k) => a + (b - a) * k;
LF.damp = (cur, tgt, sharp, dt) => cur + (tgt - cur) * (1 - Math.exp(-sharp * dt));
LF.srs = (g) => (g ? g.compsInChildren('SR') : []);
LF.setAlpha = (g, a) => { for (const s of LF.srs(g)) s.color[3] = a; };
LF.sound = (clipKey, vol = 1, pitch) => {
  if (!clipKey) return null;
  const a = E.D.audio[clipKey]; if (!a) return null;
  return E.audio.play(a[0], { vol, pitch });
};
LF.ease = (id) => E.easeById[id] || E.ease.outQuad;
// promise that resolves after t seconds of game time
LF.wait = (t) => new Promise((r) => { if (!(t > 0)) r(); else E.after(t, r, 'lfwait'); });
LF.frame = () => new Promise((r) => E.after(0.0001, r, 'lfwait'));
LF.until = (pred) => new Promise((r) => { const f = () => { if (pred()) r(); else E.after(0.0001, f, 'lfwait'); }; f(); });
// sorting boost of every SR under g (store originals)
LF.boostables = (g) => (g ? g.compsInChildren('SR').concat(g.compsInChildren('PSR')) : []);
// parts drawn well behind the object's own sprite (a steamer's back panel behind her head) keep their place
LF.boost = (g, by) => { const own = g.comp('SR'); const base = own ? (own._o0 != null ? own._o0 : own.o || 0) : -1e9; for (const s of LF.boostables(g)) { const o0 = s._o0 != null ? s._o0 : s.o || 0; if (o0 < base - 10) continue; s._o0 = o0; s.o = o0 + by; } };
LF.unboost = (g) => { for (const s of LF.boostables(g)) if (s._o0 != null) { s.o = s._o0; s._o0 = null; } };

// ------------------------------------------------------------------ UnityEvent
LF.invoke = (owner, ev, ...dyn) => {
  if (!ev) return;
  const calls = ev.m_PersistentCalls && ev.m_PersistentCalls.m_Calls;
  if (calls) for (const pc of calls) {
    if (pc.m_CallState === 0) continue;
    try { LF.call(owner, pc, dyn); } catch (e) { console.error('event', pc.m_MethodName, e); }
  }
  if (ev._js) for (const f of ev._js.slice()) f(...dyn);
};
LF.on = (ev, f) => { (ev._js || (ev._js = [])).push(f); };
LF.call = (owner, pc, dyn) => {
  const t = E.resolve(owner.go || owner, pc.m_Target); const mn = pc.m_MethodName; if (!t || !mn) return;
  const a = pc.m_Arguments || {};
  let arg;
  switch (pc.m_Mode) {
    case 0: arg = dyn[0]; break;
    case 2: arg = a.m_ObjectArgument ? E.resolve(owner.go || owner, a.m_ObjectArgument) : null; break;
    case 3: arg = a.m_IntArgument; break;
    case 4: arg = a.m_FloatArgument; break;
    case 5: arg = a.m_StringArgument; break;
    case 6: arg = !!a.m_BoolArgument; break;
  }
  LF.callMethod(t, mn, arg, pc);
};
LF.callMethod = (t, mn, arg, pc) => {
  if (t instanceof E.GO) {
    if (mn === 'SetActive') t.setActive(arg);
    else if (mn === 'set_enabled') { const tn = (pc && pc.m_TargetAssemblyTypeName) || ''; const c = /Renderer/.test(tn) ? (t.comp('SR') || t.comp('PSR') || t.comp('MR')) : /Collider/.test(tn) ? LF.colliders(t)[0] : t.comps.find((x) => x instanceof E.Behaviour) || t.comp('SR'); if (c) { if (c.setEnabled) c.setEnabled(arg); else c.enabled = !!arg; } }
    else if (mn === 'set_localScale' && arg) { /* unsupported */ }
    else LF.warnOnce('GO.' + mn);
    return;
  }
  if (t instanceof E.Behaviour) {
    const f = t[mn] || t[mn[0].toLowerCase() + mn.slice(1)];
    if (typeof f === 'function') { f.call(t, arg); return; }
    if (mn === 'set_enabled') { t.setEnabled(arg); return; }
    LF.warnOnce(t.cls + '.' + mn); return;
  }
  if (t.t) { // built-in component
    const ty = t.t;
    if (mn === 'set_enabled') { t.enabled = !!arg; return; }
    if (ty === 'AS') {
      if (mn === 'PlayOneShot') { const clip = arg && arg.clip; if (clip) E.audio.play(clip, { vol: t.vol == null ? 1 : t.vol }); return; }
      if (mn === 'Play') { LF.asPlay(t); return; }
      if (mn === 'Stop' || mn === 'Pause') { LF.asStop(t); return; }
      if (mn === 'set_volume') { t.vol = arg; return; }
    }
    if (ty === 'PS') { if (mn === 'Play') E.psPlay(t.go); else if (mn === 'Stop' || mn === 'Clear') E.particles.stop(t, mn === 'Clear'); else if (mn === 'Emit') E.particles.emit(t, arg || 1); return; }
    if (ty === 'SR') { if (mn === 'set_sprite') { t.sp = arg && arg.sprite; return; } if (mn === 'set_flipX') { t.fx = arg; return; } }
    if (ty === 'Anim') { if (E.animCall) E.animCall(t, mn, arg); return; }
    if (ty === 'Img' && mn === 'set_sprite') { t.sp = arg && arg.sprite; return; }
    LF.warnOnce(ty + '.' + mn);
    return;
  }
  LF.warnOnce('?' + mn);
};
LF._warned = new Set();
LF.warnOnce = (k) => { if (!LF._warned.has(k)) { LF._warned.add(k); console.warn('LF: unhandled call', k); } };
// AudioSource play / stop
LF.asPlay = (as) => {
  if (as._rec) as._rec.stop();
  const clip = as.clip && E.D.audio[as.clip]; if (!clip) return;
  as._rec = E.audio.play(clip[0], { vol: as.vol == null ? 1 : as.vol, loop: !!as.loop, pitch: as.pitch && as.pitch !== 1 ? as.pitch : undefined });
  if (!as.loop && as._rec) { const r = as._rec; E.after(clip[1] + 0.05, () => { if (as._rec === r) as._rec = null; }); }
};
LF.asStop = (as) => { if (as._rec) { as._rec.stop(); as._rec = null; } };

// ------------------------------------------------------------------ pointer
const P = (LF.ptr = { down: false, wx: 0, wy: 0, sx: 0, sy: 0, justDown: false, justUp: false, t0: 0, consumed: false, vx: 0, vy: 0 });
E.input.on((type, ev) => {
  if (type === 'down') { P.down = true; P.justDown = true; P.consumed = false; P.t0 = E.time; P.dsx = ev.x; P.dsy = ev.y; P.overUI = !!(E.uiRaycast(ev.x, ev.y)); }
  if (type === 'up' && !P.justDown) P.justUpOnly = true;
  if (type === 'up') { P.down = false; P.justUp = true; }
  P.sx = ev.x; P.sy = ev.y;
  const w = E.screenToWorld(ev.x, ev.y); P.wx = w[0]; P.wy = w[1];
});
LF.ptrWorld = () => { const w = E.screenToWorld(P.sx, P.sy); return w; };
// where the current press went down (grab tests use this: the finger may have moved on before the next frame)
LF.downWorld = () => { const w = E.screenToWorld(P.dsx, P.dsy); return w; };
LF.endFrame = () => { P.justDown = false; P.justUp = false; };
// UI over the pointer blocks world input
LF.ptrOverUI = () => P.overUI;

// collider helpers
LF.colliders = (g) => (g ? g.comps.filter((c) => (c.t === 'Box' || c.t === 'Circle' || c.t === 'Poly')) : []);
LF.collidersIn = (g) => (g ? g.compsInChildren('Box').concat(g.compsInChildren('Circle'), g.compsInChildren('Poly')) : []);
LF.hitCollider = (c, wx, wy, slop = 0) => {
  if (!c || !c.go.activeInHierarchy) return false;
  if (E.ptInCollider(c, c.go, wx, wy)) return true;
  if (slop > 0) { for (const [ox, oy] of [[slop, 0], [-slop, 0], [0, slop], [0, -slop], [slop * 0.7, slop * 0.7], [-slop * 0.7, slop * 0.7], [slop * 0.7, -slop * 0.7], [-slop * 0.7, -slop * 0.7]]) if (E.ptInCollider(c, c.go, wx + ox, wy + oy)) return true; }
  return false;
};
LF.hitGO = (g, wx, wy, slop = 0, deep = true) => { for (const c of deep ? LF.collidersIn(g) : LF.colliders(g)) if (LF.hitCollider(c, wx, wy, slop)) return true; return false; };
// world bounds of the SRs under g: [x0,y0,x1,y1]
LF.srBounds = (sr) => {
  const s = E.sprite(sr.sp); if (!s) return null;
  const ppu = s[7]; let x0, y0, w, h;
  if (sr.dm && sr.sz) { w = sr.sz[0]; h = sr.sz[1]; x0 = -s[5] * w; y0 = -s[6] * h; }
  else { x0 = (-s[5] * s[10] + s[12]) / ppu; y0 = (-s[6] * s[11] + s[13]) / ppu; w = s[3] / ppu; h = s[4] / ppu; }
  const m = sr.go.worldMatrix();
  const pts = [[x0, y0], [x0 + w, y0], [x0, y0 + h], [x0 + w, y0 + h]].map((p) => M.ap(m, p[0], p[1]));
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
};
LF.bounds = (g) => {
  let b = null;
  for (const s of LF.srs(g)) { if (!s.go.activeInHierarchy || !s.enabled) continue; const r = LF.srBounds(s); if (!r) continue; b = b ? [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[2]), Math.max(b[3], r[3])] : r; }
  return b;
};
// visible half extents of the main camera in world units
LF.view = () => { const cam = E.mainCam; const sz = cam ? cam.sz : 7.6; const p = cam ? cam.go.worldPos() : [0, 0]; return { cx: p[0], cy: p[1], hh: sz, hw: sz * E.W / E.H }; };

// ------------------------------------------------------------------ slide on / off the counter (StageEntrance)
LF.slideIn = (g, seconds = 0.6, tilt = 0) => new Promise((res) => {
  if (!g) return res();
  g.setActive(true);
  const hx = g.x, hy = g.y, hr = g.rot;
  const v = LF.view(); const wp = g.worldPos();
  const side = wp[0] >= v.cx ? 1 : -1;
  const b = LF.bounds(g); const halfW = b ? (b[2] - b[0]) / 2 + 0.3 : 2;
  const tx = v.cx + side * (v.hw + halfW);
  const off = g.parent ? M.ap(M.inv(g.parent.worldMatrix()), tx, wp[1]) : [tx, wp[1]];
  const sx = off[0];
  g.x = sx; g.rot = hr + side * tilt;
  E.tween({ dur: seconds, owner: g, ease: E.ease.outBack, update: (k) => { g.x = sx + (hx - sx) * k; g.rot = hr + side * tilt * (1 - Math.min(1, k)); }, done: () => { g.x = hx; g.y = hy; g.rot = hr; res(); }, onKill: res });
});
LF.slideOut = (g, seconds = 0.5, tilt = 0, deactivate = true) => new Promise((res) => {
  if (!g || !g.activeInHierarchy) return res();
  const hx = g.x, hr = g.rot;
  const v = LF.view(); const wp = g.worldPos();
  const side = wp[0] >= v.cx ? 1 : -1;
  const b = LF.bounds(g); const halfW = b ? (b[2] - b[0]) / 2 + 0.3 : 2;
  const tx = v.cx + side * (v.hw + halfW);
  const off = g.parent ? M.ap(M.inv(g.parent.worldMatrix()), tx, wp[1]) : [tx, wp[1]];
  E.tween({ dur: seconds, owner: g, ease: E.ease.inBack, update: (k) => { g.x = hx + (off[0] - hx) * k; g.rot = hr - side * tilt * k; }, done: () => { if (deactivate) g.setActive(false); g.x = hx; g.rot = hr; res(); }, onKill: res });
});

// ------------------------------------------------------------------ hint hand (world) used by steps
LF.hint = null;
LF.showHint = (fromW, toW, kind = 'drag') => { if (LF.hintCtl) LF.hintCtl.show(fromW, toW, kind); };
LF.hideHint = () => { if (LF.hintCtl) LF.hintCtl.hide(); };

// ------------------------------------------------------------------ camera
class DesignResolutionCamera extends E.Behaviour {
  awake() { this.cam = this.go.comp('Cam'); this.fit(); LF.viewCam = this; }
  fit() {
    const r = this.d._designResolution || [708, 1520], ppu = this.d._pixelsPerUnit || 100;
    const asp = E.W / E.H;
    this.baseSize = Math.max(r[1] / ppu / 2, r[0] / ppu / 2 / asp);
    if (this.cam) this.cam.sz = this.baseSize * (this.zoom || 1);
  }
  update() { const asp = E.W / E.H; if (asp !== this._asp) { this._asp = asp; this.fit(); } }
}
S('LevelFlow.DesignResolutionCamera', DesignResolutionCamera);
S('LevelFlow.ViewCameraRegistrar', class extends E.Behaviour {});

// ------------------------------------------------------------------ base step
class LevelStep extends E.Behaviour {
  awake() {
    this.progress = 0; this.isRunning = false; this.isComplete = false;
    if (this.stepAwake) this.stepAwake();
  }
  get title() { return this.d._title || this.go.name; }
  get character() { return (this.d._expressionController && this.ref('_expressionController')) || (this.runner && this.runner.character) || null; }
  setExpression(x) { const c = this.character; if (c && c.setExpression && x != null) c.setExpression(x); }
  setProgress(p) {
    p = E.clamp(p, 0, 1);
    if (p > this.progress + 1e-4 || p >= 1) this._lastProgressTime = E.time;
    if (Math.abs(p - this.progress) < 1e-5) return;
    this.progress = p;
    LF.invoke(this, this.d._onProgressChanged, p);
    if (this.runner) this.runner.onStepProgress(this, p);
  }
  async run(runner) {
    this.runner = runner;
    if (this.d._leadInSeconds > 0) { LF.invoke(this, this.d._onLeadIn); await LF.wait(this.d._leadInSeconds); }
    else LF.invoke(this, this.d._onLeadIn);
    this.isRunning = true; this.progress = 0; this._lastProgressTime = E.time;
    for (const g of this.refs('_showWhileRunning')) if (g) LF.go(g).setActive(true);
    for (const g of this.refs('_hideWhileRunning')) if (g) LF.go(g).setActive(false);
    this.setExpression(this.d._expressionOnBegin);
    LF.invoke(this, this.d._onBegan);
    if (runner) runner.onStepStarted(this);
    try { await this.execute(); } catch (e) { console.error(this.cls, 'execute', e); }
    this.setProgress(1);
    this.isRunning = false; this.isComplete = true;
    if (this.onComplete) try { this.onComplete(); } catch (e) { console.error(this.cls, 'onComplete', e); }
    this.setExpression(this.d._expressionOnComplete);
    LF.invoke(this, this.d._onCompleted);
    if (this.d._closeStageOnComplete) {
      for (const g of this.refs('_showWhileRunning')) if (g) LF.go(g).setActive(false);
      for (const g of this.refs('_hideWhileRunning')) if (g) LF.go(g).setActive(true);
    }
    if (runner) runner.onStepCompleted(this);
    if (this.afterComplete) await this.afterComplete();
    if (this.d._settleSeconds > 0) await LF.wait(this.d._settleSeconds);
  }
  async execute() {}
  // idle face pull while waiting for the player
  idleTick() {
    if (!this.d._sulkWhenIdle || !this.isRunning) return;
    const idle = E.time - (this._lastProgressTime || E.time) > (this.d._idleSeconds || 6);
    if (idle && !this._idleShowing) { this._idleShowing = true; this.setExpression(this.d._expressionWhenIdle); }
    else if (!idle && this._idleShowing) { this._idleShowing = false; this.setExpression(this.d._expressionOnBegin); }
  }
}
LF.LevelStep = LevelStep;
S('LevelFlow.LevelStep', LevelStep);

// ------------------------------------------------------------------ runner
class LevelStepsRunner extends E.Behaviour {
  awake() { LF.runner = this; this.steps = []; this.stepIndex = -1; this.levelProgress = 0; }
  get character() { return this.ref('_character'); }
  allSteps() { const out = []; for (const g of this.d._groups || []) for (const s of g._steps || []) { const st = E.resolve(this.go, s); if (st) out.push(st); } return out; }
  start() { this.steps = this.allSteps(); if (this.d._runOnStart) this.runAll(); }
  async runAll() {
    if (this._running) return; this._running = true;
    LF.invoke(this, this.d._onLevelStarted);
    await LF.wait(this.d._openingDelaySeconds || 0);
    const groups = this.d._groups || [];
    const q = new URLSearchParams(location.search); const skipTo = +(q.get('step') || -1);
    for (let gi = 0; gi < groups.length; gi++) {
      const grp = groups[gi];
      const steps = (grp._steps || []).map((s) => E.resolve(this.go, s)).filter((s) => s && s.run);
      if (skipTo > 0 && gi < skipTo) { LF.ff = true; for (const s of steps) { try { LF.invoke(s, s.d._onLeadIn); if (s.fastForward) s.fastForward(); else { LF.invoke(s, s.d._onBegan); LF.invoke(s, s.d._onCompleted); } const tl = s.tool ? s.tool() : s.d._tool ? s.ref('_tool') : null; if (tl && tl.go) tl.go.setActive(false); } catch (e) { console.error('ff', e); } } LF.ff = false; if (gi === skipTo - 1 && LF.screenFade && LF.screenFade.cg) LF.screenFade.cg.alpha = 0; continue; }
      this.groupIndex = gi;
      if (grp._mode === 1) await Promise.all(steps.map((s) => s.run(this)));
      else for (const s of steps) await s.run(this);
      const last = steps[steps.length - 1];
      if (!(last && last.d._nextOpensAtOnce) && gi < groups.length - 1) await LF.wait(this.d._gapSeconds || 0);
    }
    this.isComplete = true;
    const ch = this.character; if (ch && ch.setExpression) ch.setExpression(this.d._expressionOnLevelComplete);
    LF.invoke(this, this.d._onLevelCompleted);
    if (LF.onLevelCompleted) LF.onLevelCompleted(this);
  }
  onStepStarted(s) { this.current = s; this.stepIndex = this.steps.indexOf(s); if (LF.onStepStarted) LF.onStepStarted(s); }
  onStepProgress(s, p) { const n = this.steps.length || 1; this.levelProgress = (this.steps.indexOf(s) + p) / n; LF.invoke(this, this.d._onProgressChanged, this.levelProgress); if (LF.onStepProgress) LF.onStepProgress(s, p); }
  onStepCompleted(s) { if (LF.look && !(s instanceof LF.S.__noop)) LF.look.landed(); if (LF.onStepCompleted) LF.onStepCompleted(s); }
}
S('LevelFlow.LevelStepsRunner', LevelStepsRunner);

// ------------------------------------------------------------------ screen fade
class ScreenFade extends E.Behaviour {
  awake() {
    this.cg = this.d._group ? this.ref('_group') : this.go.comp('CG');
    if (this.cg) this.cg.alpha = this.d._startAlpha || 0;
    if (!LF.screenFade || this.go.name === 'Screen Fade') LF.screenFade = this;
  }
  fadeTo(a, seconds) {
    return new Promise((res) => {
      const cg = this.cg; if (!cg) return res();
      this.go.setActive(true);
      if (this._tw) E.kill(this._tw);
      const f = cg.alpha;
      this._tw = E.tween({ dur: seconds || 0.001, owner: this, ease: E.ease.linear, update: (k) => { cg.alpha = f + (a - f) * k; }, done: () => { this._tw = null; res(); }, onKill: res });
    });
  }
  FadeOut(s) { return this.fadeTo(1, s == null ? 0.35 : s); }
  FadeIn(s) { return this.fadeTo(0, s == null ? 0.35 : s); }
}
S('LevelFlow.ScreenFade', ScreenFade);
class ScreenFadeStep extends LevelStep {
  async execute() {
    const d = this.d;
    const fade = (d._fade && this.ref('_fade')) || LF.screenFade;
    if (!d._openFromBlack && fade) await fade.fadeTo(1, d._fadeOutSeconds || 0.35);
    else if (fade && fade.cg) fade.cg.alpha = 1;
    this.setProgress(0.5);
    for (const sw of d._swaps || []) { const t = E.resolve(this.go, sw.Target); if (t) LF.go(t).setActive(!!sw.SetActive); }
    if (LF.onCovered) LF.onCovered(this);
    LF.invoke(this, d._onCovered);
    await LF.wait(d._holdSeconds || 0);
    if (!d._stayBlack && fade) await fade.fadeTo(0, d._fadeInSeconds || 0.35);
  }
  fastForward() { for (const sw of this.d._swaps || []) { const t = E.resolve(this.go, sw.Target); if (t) LF.go(t).setActive(!!sw.SetActive); } LF.invoke(this, this.d._onCovered); LF.invoke(this, this.d._onBegan); LF.invoke(this, this.d._onCompleted); }
}
S('LevelFlow.ScreenFadeStep', ScreenFadeStep);
// black square shown while the level loads (hidden as soon as the first fade takes over)
S('ShowBlack', class extends E.Behaviour { start() { this.after(0.05, () => this.go.setActive(false)); } });

// ------------------------------------------------------------------ keyed tracks (TrackPerformance, ClipPluckStep stages)
const keyAt = (times, vals, t) => {
  if (!times || !times.length) return null;
  if (t <= times[0]) return vals[0];
  for (let i = 1; i < times.length; i++) if (t <= times[i]) {
    const k = (t - times[i - 1]) / ((times[i] - times[i - 1]) || 1e-6); const a = vals[i - 1], b = vals[i];
    return Array.isArray(a) ? [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k] : a + (b - a) * k;
  }
  return vals[vals.length - 1];
};
LF.keyAt = keyAt;
// play a list of tracks; returns {stop, done(promise)}. opts: {speed, loop, startFrom (GO), toolPos (world), owner}
LF.playTracks = (owner, tracks, opts = {}) => {
  const speed = opts.speed || 1;
  const prep = [];
  let dur = 0;
  for (const tr of tracks || []) {
    const tg = E.resolve(owner.go, tr.Target); const g = LF.go(tg); if (!g) continue;
    const sr = g.comp('SR');
    const p = { tr, g, sr, sp0: sr ? sr.sp : null, o0: sr ? sr.o : 0, shown: false, hidden: false, ordered: false, mp: tr.MovePoints ? tr.MovePoints.slice() : [] };
    for (const arr of [tr.MoveTimes, tr.TurnTimes, tr.ScaleTimes, tr.FadeTimes]) if (arr && arr.length) dur = Math.max(dur, arr[arr.length - 1]);
    if (tr.ShowAt > dur) dur = tr.ShowAt; if (tr.HideAt > dur) dur = tr.HideAt; if (tr.OrderAt > dur) dur = tr.OrderAt;
    prep.push(p);
  }
  // first-waypoint overrides (StartsAtTool / startFrom)
  prep.forEach((p, i) => {
    let from = null;
    if (i === 0 && opts.startFrom) from = LF.wpos(opts.startFrom);
    if (p.tr.StartsAtTool && opts.toolPos) from = opts.toolPos;
    if (from && p.mp.length) { const l = p.g.parent ? M.ap(M.inv(p.g.parent.worldMatrix()), from[0], from[1]) : from; p.mp[0] = [l[0], l[1]]; }
  });
  if (opts.seconds) dur = Math.max(dur, opts.seconds);
  let t = 0, stopped = false, resolve;
  const done = new Promise((r) => (resolve = r));
  const apply = (tt) => {
    for (const p of prep) {
      const tr = p.tr, g = p.g;
      if (tr.ShowAt >= 0 && tt >= tr.ShowAt && !p.shown) { p.shown = true; g.setActive(true); }
      if (tr.HideAt >= 0 && tt >= tr.HideAt && !p.hidden) { p.hidden = true; g.setActive(false); }
      if (tr.OrderAt >= 0 && tt >= tr.OrderAt && !p.ordered && p.sr) { p.ordered = true; p.sr.o = tr.OrderTo; }
      if (tr.MoveTimes && tr.MoveTimes.length) { const v = keyAt(tr.MoveTimes, p.mp, tt); if (v) { g.x = v[0]; g.y = v[1]; } }
      if (tr.TurnTimes && tr.TurnTimes.length) { const v = keyAt(tr.TurnTimes, tr.TurnDegrees, tt); if (v != null) g.rot = v; }
      if (tr.ScaleTimes && tr.ScaleTimes.length) {
        if (tr.ScaleXY && tr.ScaleXY.length) { const v = keyAt(tr.ScaleTimes, tr.ScaleXY, tt); if (v) { g.sx = v[0]; g.sy = v[1]; } }
        else { const v = keyAt(tr.ScaleTimes, tr.Scales, tt); if (v != null) { g.sx = v; g.sy = v; } }
      }
      if (tr.FadeTimes && tr.FadeTimes.length && p.sr) { const v = keyAt(tr.FadeTimes, tr.FadeAlphas, tt); if (v != null) p.sr.color[3] = v; }
      if (tr.GripSprite && p.sr && tr.GripFrom) {
        let grip = false; for (let i = 0; i < tr.GripFrom.length; i++) if (tt >= tr.GripFrom[i] && tt < (tr.GripUntil[i] == null ? 1e9 : tr.GripUntil[i])) grip = true;
        p.sr.sp = grip ? tr.GripSprite : p.sp0;
      }
    }
  };
  apply(0);
  if (LF.ff && !opts.loop) { apply(dur); resolve(); return { duration: dur, done, stop() {}, get t() { return dur; } }; }
  const tw = E.tween({ dur: 1e9, owner: opts.owner || owner, ease: E.ease.linear, update: () => {
    if (stopped) return;
    t += E.dt * speed;
    if (opts.onTime) opts.onTime(t);
    if (t >= dur) {
      if (opts.loop) { t = t % (dur || 1); for (const p of prep) { p.shown = p.hidden = p.ordered = false; } apply(t); return; }
      apply(dur); stopped = true; E.kill(tw); resolve(); return;
    }
    apply(t);
  } });
  return { duration: dur, done, stop() { if (!stopped) { stopped = true; E.kill(tw); resolve(); } }, get t() { return t; } };
};
class TrackPerformance extends E.Behaviour {
  onEnable() { if (this.d._playOnEnable) this.Play(); }
  Play() {
    if (this.perf) this.perf.stop();
    this.playing = true;
    const p = (this.perf = LF.playTracks(this, this.d._tracks, { speed: this.d._speed || 1, loop: this.d._loop, startFrom: this.d._startFrom ? this.ref('_startFrom') : null, owner: this }));
    return p.done.then(() => { if (this.perf === p) { this.playing = false; if (!this.d._loop) LF.invoke(this, this.d._onFinished); } });
  }
  Stop() { if (this.perf) this.perf.stop(); this.perf = null; this.playing = false; }
  Finish() { this.Stop(); }
  get IsPlaying() { return !!this.playing; }
}
S('LevelFlow.TrackPerformance', TrackPerformance);
})();
// components reached through a reference are awoken on first use, even on an object that is still switched off
// (a step talks to props and pieces that only appear later).
(() => {
  const orig = E.resolve;
  E.resolve = (go, key) => {
    const r = orig(go, key);
    if (r instanceof E.Behaviour && !r._awoken) { r._awoken = true; if (r.awake) try { r.awake(); } catch (e) { console.error(r.cls, 'awake', e); } }
    return r;
  };
})();
// AudioSources that play on awake start when their object comes alive and stop when it goes away
(() => {
  const oa = E._awakeTree;
  E._awakeTree = (root) => {
    oa(root);
    if (!root.activeInHierarchy) return;
    const walk = (g) => { if (!g.activeSelf) return; for (const c of g.comps) if (c.t === 'AS' && c.paw && c.clip && c.enabled !== false && !c._rec) E.LF.asPlay(c); for (const ch of g.children) walk(ch); };
    walk(root);
  };
  const op = E._propagateActive;
  E._propagateActive = (g, now) => {
    op(g, now);
    if (now) return;
    const walk = (x) => { for (const c of x.comps) if (c.t === 'AS' && c._rec) { E.LF.asStop(c); } for (const ch of x.children) walk(ch); };
    walk(g);
  };
})();
