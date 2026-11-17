'use strict';
// LevelFlow presentation helpers: faces, blinks, breathing, props, cues, hints, progress bar, finale.
(() => {
const LF = E.LF, M = E.M, S = LF.S, P = LF.ptr;
const B = E.Behaviour;
const sr0 = (b, f) => (b.d[f] ? b.ref(f) : null) || b.go.comp('SR');

// ------------------------------------------------------------------ faces
class ExpressionController extends B {
  awake() { this.sr = sr0(this, '_renderer') || this.go.compInChildren('SR'); this.dirty = !!this.d._startDirty; this.expr = null; this.setExpression(this.d._startExpression || 0, true); LF.character = LF.character || this; }
  face(x) { return (this.d._faces || []).find((f) => f.Expression === x); }
  spriteOf(f, blink) { if (!f) return null; if (blink) return (this.dirty && f.DirtyBlinkSprite) || f.BlinkSprite; return (this.dirty && f.DirtySprite) || f.Sprite; }
  setExpression(x, instant) {
    if (x == null) return;
    const f = this.face(x); this.expr = x;
    for (const o of this.d._faces || []) { const g = o.Decoration && LF.go(E.resolve(this.go, o.Decoration)); if (g) g.setActive(o === f); }
    if (!f || !this.sr) return;
    const sp = this.spriteOf(f);
    if (sp && sp !== this.sr.sp) {
      const out = this.d._outgoing && this.ref('_outgoing');
      if (!instant && out && this.d._changeSeconds > 0) { out.go.setActive(true); out.sp = this.sr.sp; out.color[3] = 1; this.sr.color[3] = 0; this.sr.sp = sp; E.tween({ dur: this.d._changeSeconds, owner: this, update: (k) => { this.sr.color[3] = k; out.color[3] = 1 - k; }, done: () => out.go.setActive(false) }); }
      else this.sr.sp = sp;
    }
  }
  blinkSprite() { return this.spriteOf(this.face(this.expr), true); }
  SetDirty(v) { this.dirty = !!v; this.setExpression(this.expr, true); }
}
S('LevelFlow.ExpressionController', ExpressionController);

// blinks: the shut-lid sprite flashes on for a moment
class StateEyeBlinker extends B {
  awake() { this.next = E.time + E.rand(1, 3); this.lids = this.d._lids ? this.ref('_lids') : null; this.twin = this.d._lidsTwin ? this.ref('_lidsTwin') : null; if (this.lids) this.lids.go.setActive(false); if (this.twin) this.twin.go.setActive(false); this.extra = 0; }
  state() { for (const s of this.d._states || []) { const g = s.WhenShown && LF.go(E.resolve(this.go, s.WhenShown)); if (g && g.activeInHierarchy) { const sr = g.comp('SR'); if (!sr || sr.color[3] > 0.5) return s; } } return null; }
  BlinkTimes(n) { this.extra = n || 1; this.next = E.time; }
  blocked() { for (const g of this.refs('_notWhileShown')) if (g && LF.go(g).activeInHierarchy) return true; return false; }
  update() {
    if (E.time < this.next || this.blinking) return;
    const iv = this.d._intervalSeconds || [2.5, 5];
    this.next = E.time + E.rand(iv[0], iv[1]);
    if (this.blocked()) return;
    const st = this.state(); if (!st) return;
    this.blink(st);
  }
  blink(st) {
    const lr = (st.LidsRenderer && E.resolve(this.go, st.LidsRenderer)) || this.lids; if (!lr) return;
    const tw = (st.LidsTwinRenderer && E.resolve(this.go, st.LidsTwinRenderer)) || (st.LidsTwin ? this.twin : null);
    const from = st.LidsFrom && E.resolve(this.go, st.LidsFrom);
    if (st.Lids && !st.LidsRenderer) lr.sp = st.Lids; if (from && from.sp) lr.sp = from.sp; if (tw && st.LidsTwin && !st.LidsTwinRenderer) tw.sp = st.LidsTwin;
    const on = (v) => { lr.go.setActive(v); if (tw) tw.go.setActive(v); const sw = st.ShownWhileShut && LF.go(E.resolve(this.go, st.ShownWhileShut)); if (sw) sw.setActive(v); const hw = st.HiddenWhileShut && LF.go(E.resolve(this.go, st.HiddenWhileShut)); if (hw) hw.setActive(!v); };
    this.blinking = true; on(true);
    const dur = (this.d._closeSeconds || 0.06) + (this.d._shutSeconds || 0.06) + (this.d._openSeconds || 0.08);
    this.after(dur, () => { on(false); this.blinking = false; if (this.extra > 1 || Math.random() < (this.d._doubleBlinkChance || 0.15)) { this.extra = Math.max(0, this.extra - 1); this.after(0.12, () => this.blink(st)); } else this.extra = 0; });
  }
}
S('LevelFlow.StateEyeBlinker', StateEyeBlinker);
class EyeBlinker extends B {
  awake() { this.next = E.time + E.rand(1, 3); this.lids = this.ref('_lids'); if (this.lids) this.lids.go.setActive(false); }
  update() {
    if (E.time < this.next || !this.lids) return; const iv = this.d._intervalSeconds || [2.5, 5]; this.next = E.time + E.rand(iv[0], iv[1]);
    const ex = (this.d._expressions && this.ref('_expressions')) || this.go.compInParent('LevelFlow.ExpressionController');
    const sp = ex && ex.blinkSprite ? ex.blinkSprite() : null; if (!sp) return;
    this.lids.sp = sp; this.lids.go.setActive(true); this.after(0.18, () => this.lids.go.setActive(false));
  }
}
S('LevelFlow.EyeBlinker', EyeBlinker);
class ShutEyesUnderContact extends B {
  awake() { this.held = false; this.lids = this.d._shutLids ? this.ref('_shutLids') : null; this.until = 0; }
  HoldShut(v) { this.held = !!v; }
  update() {
    let shut = this.held;
    const t = this.d._shutWhileHeld && this.ref('_shutWhileHeld'); if (t && t.held) shut = true;
    const tool = LF.activeTool; if (!shut && tool && tool.held) { const tp = tool.tip(); for (const e of this.refs('_eyes')) if (e && LF.dist(LF.wpos(e), tp) < (this.d._reach || 0.6) + 0.3) { shut = true; break; } }
    if (shut) this.until = E.time + (this.d._openAfterSeconds || 0.4);
    const on = E.time < this.until;
    if (this.lids && this.lids.go.activeSelf !== on) this.lids.go.setActive(on);
  }
}
S('LevelFlow.ShutEyesUnderContact', ShutEyesUnderContact);
// her eyes turn toward the tool (small offset on the pupils' parent)


// ------------------------------------------------------------------ idle motion
class BreathMotion extends B {
  awake() { const g = this.go; this.b = { x: g.x, y: g.y, sx: g.sx, sy: g.sy }; this.riders = this.refs('_riders').map(LF.go).filter(Boolean).map((r) => ({ g: r, y: r.y, sx: r.sx, sy: r.sy })); }
  update() {
    const d = this.d, g = this.go, b = this.b;
    const k = 0.5 - 0.5 * Math.cos((E.time / (d._breathSeconds || 3) + (d._phase || 0)) * Math.PI * 2);
    const a = (d._amount || 0) * k; const pv = d._pivot || [0, 0, 0];
    g.sy = b.sy * (1 + a); g.sx = b.sx * (1 + a * (d._widthShare || 0));
    g.y = b.y + (b.y - pv[1]) * a * 0 + (d._lift || 0) * k - (pv[1] - b.y) * a;
    g.x = b.x - (pv[0] - b.x) * a * (d._widthShare || 0);
    for (const r of this.riders) { r.g.sx = r.sx / (1 + a * (d._widthShare || 0)); r.g.sy = r.sy / (1 + a); }
  }
}
S('LevelFlow.BreathMotion', BreathMotion);
S('MenuCharacterBreath', class extends B { awake() { this.sy = this.go.sy; } update() { this.go.sy = this.sy * (1 + 0.012 * Math.sin(E.time * 2.2)); } });
class SlotGlow extends B {
  onEnable() { this.t0 = E.time; const s = this.go.comp('SR'); if (s) { this.base = this.base || s.color[3] || 1; } this.s0 = this.s0 || [this.go.sx, this.go.sy]; }
  update() { const s = this.go.comp('SR'); if (!s) return; const d = this.d; const k = 0.5 + 0.5 * Math.sin((E.time - this.t0) * Math.PI * 2 * (d._breathsPerSecond || 1)); const fi = Math.min(1, (E.time - this.t0) / (d._fadeInSeconds || 0.2)); s.color[3] = this.base * fi * ((d._minAlpha == null ? 0.4 : d._minAlpha) + ((d._maxAlpha || 1) - (d._minAlpha == null ? 0.4 : d._minAlpha)) * k); const sw = 1 + (d._swell || 0) * k; this.go.sx = this.s0[0] * sw; this.go.sy = this.s0[1] * sw; }
}
S('LevelFlow.SlotGlow', SlotGlow);
S('LevelFlow.ScaleLoop', class extends B { awake() { this.s = [this.go.sx, this.go.sy]; } update() { const k = 1 + 0.05 * Math.sin(E.time * 4); this.go.sx = this.s[0] * k; this.go.sy = this.s[1] * k; } });
S('LevelFlow.UiBob', class extends B { awake() { this.y = this.go.rt ? this.go.rt[5] : this.go.y; } update() { if (this.go.rt) this.go.rt[5] = this.y + Math.sin(E.time * 2.4) * 8; } });
S('LevelFlow.UiSpin', class extends B { update(dt) { this.go.rot += dt * 20; } });
S('RotateObj', class extends B { update(dt) { this.go.rot -= dt * 220; } });
class SpinForever extends B { onEnable() { if (this.d._playOnEnable) this.on = true; } Play() { this.on = true; } Stop() { this.on = false; } update(dt) { if (this.on) this.go.rot += (this.d._degreesPerSecond || 90) * dt; } }
S('LevelFlow.SpinForever', SpinForever);
S('LevelFlow.LowEndParticleBudget', class extends B {});
S('LevelFlow.TrackPerformanceStub', class extends B {});
S('LevelFlow.SafeAreaRect', class extends B {});
S('LevelFlow.StageWork', class extends B {});
S('LevelFlow.LiquidSlosh', class extends B {});
S('LevelFlow.ElasticHose', class extends B {});
S('LevelFlow.HandKnead', class extends B {});
S('LevelFlow.SpritePinch', class extends B {});
S('LevelFlow.ShutLashes', class extends B {});
S('LevelFlow.StageFocus', class extends B {});
S('LevelFlow.FillsRegionOnTouch', class extends B {});
S('LevelFlow.ClearsRestAt', class extends B {});
S('LevelFlow.ScrubInPieces', class extends B {});
S('LevelFlow.WashAwayPieces', class extends B {});
S('LevelFlow.StreamSplash', class extends B {});
S('LevelFlow.SprayMist', class extends B {});
S('LevelFlow.SprayAim', class extends B {});
S('LevelFlow.SpriteFlipbook', class extends B { update() { const fr = this.d._frames || this.d._sprites; const s = this.go.comp('SR'); if (fr && fr.length && s) s.sp = fr[Math.floor(E.time * (this.d._fps || 12)) % fr.length]; } });
S('LevelFlow.SwitchOnWhenShown', class extends B {});
S('LevelFlow.TrackPerformanceAudio', class extends B {});
S('CartoonFX.CFXR_Effect', class extends B {});
S('_2dxFX_Shiny_Reflect', class extends B {});
S('GDPerfTracker', class extends B {});
S('GenericEventManager', class extends B {});
S('BannerSpaceRemoveAds', class extends B { awake() { this.go.setActive(false); } });
S('AdCanvas', class extends B { awake() { this.go.setActive(false); } });
S('EyeBlink', class extends B {});
S('BranchCutTime', class extends B {});
S('WatermelonAnimationEvent', class extends B {});
S('FaceCleanisngHusk', class extends B {});
S('UnityEngine.U2D.Animation.SpriteSkin', class extends B {});

// ------------------------------------------------------------------ props & cues
class SlideInProp extends B {
  awake() { const g = this.go; this.home = { x: g.x, y: g.y, sx: g.sx, sy: g.sy }; }
  async Arrive() {
    const d = this.d, g = this.go; await LF.wait(d._delay || 0);
    g.x = this.home.x; g.y = this.home.y; g.setActive(true);
    if (d._popInPlace) { const f = d._popFrom || 0.5; g.sx = this.home.sx * f; g.sy = this.home.sy * f; await new Promise((r) => E.tween({ dur: d._popSeconds || 0.3, owner: g, ease: E.ease.outBack, update: (k) => { g.sx = this.home.sx * (f + (1 - f) * k); g.sy = this.home.sy * (f + (1 - f) * k); }, done: r, onKill: r })); }
    else await LF.slideIn(g, d._arriveSeconds || 0.6, d._slideTilt || 0);
    LF.invoke(this, d._onArrived);
  }
  async Leave() { await LF.wait(this.d._leaveDelay || 0); await LF.slideOut(this.go, this.d._leaveSeconds || 0.5, this.d._slideTilt || 0); }
}
S('LevelFlow.SlideInProp', SlideInProp);
class SpriteFade extends B { FadeTo(a) { const s = sr0(this, '_renderer'); if (!s) return; s.go.setActive(true); const f = s.color[3]; E.tween({ dur: this.d._seconds || 0.2, owner: this, update: (k) => { s.color[3] = f + (a - f) * k; } }); } }
S('LevelFlow.SpriteFade', SpriteFade);
class ProgressCrossfade extends B {
  awake() { this.ins = this.refs('_fadeIn').filter(Boolean).map((s) => [s, s.color[3]]); this.outs = this.refs('_fadeOut').filter(Boolean).map((s) => [s, s.color[3]]); this.self = this.go.comp('SR'); this.selfA = this.self ? this.self.color[3] : 1; }
  SetProgress(p) {
    const k = E.clamp(p / (this.d._share || 1), 0, 1);
    if (!this.ins.length && !this.outs.length && this.self) { this.go.setActive(true); this.self.color[3] = this.selfA * k; return; }
    for (const [s, a] of this.ins) { s.go.setActive(true); s.color[3] = a * k; }
    for (const [s, a] of this.outs) s.color[3] = a * (1 - k);
  }
}
S('LevelFlow.ProgressCrossfade', ProgressCrossfade);
S('LevelFlow.ProgressCue', class extends B { Report(p) { if (!this.fired && p >= (this.d._at || 1) - 1e-4) { this.fired = true; LF.invoke(this, this.d._onReached); } } });
class FillReveal extends B {
  awake() { this.sr = this.go.comp('SR'); this.set_Reveal01(this.d._reveal || 0); }
  set_Reveal01(v) { this.v = v; const fr = this.d._frames || []; if (!fr.length || !this.sr) return; this.go.setActive(true); const i = Math.min(fr.length - 1, Math.floor(E.clamp(v, 0, 1) * fr.length)); if (v <= 0) { this.sr.color[3] = 0; return; } this.sr.color[3] = 1; this.sr.sp = fr[i]; }
  Settle() { const g = this.go; const sx = g.sx, sy = g.sy, a = this.d._settleAmount || 0.06, n = this.d._settleWobbles || 3; E.tween({ dur: this.d._settleSeconds || 0.8, owner: g, ease: E.ease.linear, update: (k) => { const w = Math.sin(k * Math.PI * 2 * n) * a * (1 - k); g.sx = sx * (1 + w); g.sy = sy * (1 - w); }, done: () => { g.sx = sx; g.sy = sy; } }); }
}
S('LevelFlow.FillReveal', FillReveal);
class StagePoses extends B {
  Apply(i) {
    const t = LF.go(this.ref('_target')) || this.go; const d = this.d; const p = (d._positions || [])[i]; if (!p) return;
    const s = (d._scales || [])[i]; const sec = (d._seconds || [])[i] || 0; const ez = (d._eases || [])[i];
    const fx = t.x, fy = t.y, fs = t.sx; const ts = s == null ? fs : s;
    if (!sec) { t.x = p[0]; t.y = p[1]; t.sx = t.sy = ts; return; }
    E.tween({ dur: sec, owner: t, ease: LF.ease(ez || 7), update: (k) => { t.x = fx + (p[0] - fx) * k; t.y = fy + (p[1] - fy) * k; t.sx = t.sy = fs + (ts - fs) * k; } });
  }
}
S('LevelFlow.StagePoses', StagePoses);
class StageScaleCue extends B {
  awake() { this.rest = this.refs('_targets').map(LF.go).filter(Boolean).map((g) => ({ g, wp: null, x: g.x, y: g.y, sx: g.sx, sy: g.sy })); }
  apply(s, move, sec, ez) {
    const d = this.d; const pv = d._pivot || [0, 0, 0]; const fa = d._focusAt || pv;
    for (const r of this.rest) {
      const g = r.g; if (r.tw) E.kill(r.tw); const fx = g.x, fy = g.y, fsx = g.sx, fsy = g.sy;
      const pl = g.parent ? M.ap(M.inv(g.parent.worldMatrix()), pv[0], pv[1]) : [pv[0], pv[1]];
      const fl = g.parent ? M.ap(M.inv(g.parent.worldMatrix()), fa[0], fa[1]) : [fa[0], fa[1]];
      const tx = (move ? fl[0] : pl[0]) + (r.x - pl[0]) * s, ty = (move ? fl[1] : pl[1]) + (r.y - pl[1]) * s;
      r.tw = E.tween({ dur: LF.ff ? 0.001 : sec, owner: this, ease: LF.ease(ez || 7), update: (k) => { g.x = fx + (tx - fx) * k; g.y = fy + (ty - fy) * k; g.sx = fsx + (r.sx * s - fsx) * k; g.sy = fsy + (r.sy * s - fsy) * k; } });
    }
  }
  Focus() { this.apply(this.d._scale || 1.4, !!this.d._moveToFocus, this.d._focusSeconds || 0.5, this.d._focusEase); }
  Release() { this.apply(1, false, this.d._releaseSeconds || 0.5, this.d._releaseEase); }
  OpenSmall() { const s = this.d._openScale || 0.8; for (const r of this.rest) { r.g.sx = r.sx * s; r.g.sy = r.sy * s; } this.Release(); }
}
S('LevelFlow.StageScaleCue', StageScaleCue);
class CameraFocusCue extends B {
  Focus() {
    const v = LF.viewCam; if (!v || !v.cam) return; const d = this.d; const c = d._centre || [0, 0];
    const f = E.findObjectOfType('LevelFlow.ScratchCameraFollow'); const tz = d._exactSize ? d._exactSize / v.baseSize : (d._sizeShare || 1);
    if (f) { const b0 = f.base.slice(), z0 = f.baseZoom || 1; E.tween({ dur: 0.6, owner: this, ease: E.ease.inOutSine, update: (k) => { f.base = [b0[0] + (c[0] - b0[0]) * k, b0[1] + (c[1] - b0[1]) * k]; f.baseZoom = z0 + (tz - z0) * k; } }); return; }
    const cg = v.go; const fx = cg.x, fy = cg.y, fz = v.zoom || 1;
    E.tween({ dur: 0.6, owner: cg, ease: E.ease.inOutSine, update: (k) => { cg.x = fx + (c[0] - fx) * k; cg.y = fy + (c[1] - fy) * k; v.zoom = fz + (tz - fz) * k; v.fit(); } });
  }
}
S('LevelFlow.CameraFocusCue', CameraFocusCue);
class StageLift extends B {
  // the stage opens lifted by _lift above its authored ear-work height; LowerForEars brings it down, RaiseForFace back up (and shrinks her about the pivot)
  awake() { this.parts = this.refs('_parts').map(LF.go).filter(Boolean); this.base = this.parts.map((p) => [p.x, p.y, p.sx]); this.ci = this.parts.indexOf(LF.go(this.ref('_character'))); this.up = 1; this.face = 0; this.apply(1, 0); }
  apply(up, face) {
    const L = this.d._lift || 0, fs = this.d._faceScale || 1, pv = this.d._scalePivot || [0, 0];
    this.parts.forEach((p, i) => {
      const [bx, by, bs] = this.base[i];
      if (i === this.ci) { const r = 1 + (fs - 1) * face; p.sx = p.sy = bs * r; p.x = pv[0] + (bx - pv[0]) * r; p.y = pv[1] + (by - pv[1]) * r + L * up; }
      else p.y = by + L * up;
    });
  }
  move(up, face) { const u0 = this.up, f0 = this.face; this.up = up; this.face = face; E.tween({ dur: this.d._seconds || 0.6, owner: this, ease: E.ease.inOutSine, update: (k) => this.apply(u0 + (up - u0) * k, f0 + (face - f0) * k) }); }
  RaiseForFace() { E.after(this.d._raiseDelay || 0, () => this.move(1, 1), this); }
  LowerForEars() { this.move(0, 0); }
}
S('LevelFlow.StageLift', StageLift);
class AttentionFade extends B {
  Play() { const ts = this.refs('_targets').filter(Boolean); const d = this.d; const base = ts.map((s) => s.color[3]); this.tw = E.tween({ dur: (d._halfSeconds || 0.3) * 2, delay: d._delay || 0, loops: d._times || 3, owner: this, ease: E.ease.linear, update: (k) => { const f = 1 - (1 - (d._lowAlpha || 0.3)) * Math.sin(k * Math.PI); ts.forEach((s, i) => (s.color[3] = base[i] * f)); }, done: () => ts.forEach((s, i) => (s.color[3] = base[i])) }); }
  Stop() { if (this.tw) E.kill(this.tw, true); }
}
S('LevelFlow.AttentionFade', AttentionFade);
class CanvasGroupVeil extends B { Veil() { const g = this.ref('_group'); if (g) E.fadeTo(g, 0, this.d._fadeSeconds || 0.3); } }
S('LevelFlow.CanvasGroupVeil', CanvasGroupVeil);
class SpriteFlash extends B {
  Play() { const d = this.d, g = this.go, s = g.comp('SR'); if (!s) return; g.setActive(true); const sx = g.sx, sy = g.sy; s.color[3] = 0;
    E.tween({ dur: d._riseSeconds || 0.15, delay: d._delay || 0, owner: g, update: (k) => { s.color[3] = k; const w = 1 + (d._swell || 0.1) * k; g.sx = sx * w; g.sy = sy * w; }, done: () => { const b = d._burst && this.ref('_burst'); if (b) E.particles.play(b); if (d._clip) LF.sound(d._clip, d._volume || 0.5); E.tween({ dur: d._fadeSeconds || 0.4, owner: g, update: (k) => { s.color[3] = 1 - k; }, done: () => { g.sx = sx; g.sy = sy; } }); } }); }
}
S('LevelFlow.SpriteFlash', SpriteFlash);
S('LevelFlow.SpriteSwap', class extends B { Apply() { const s = sr0(this, '_renderer'); if (s && this.d._sprite) s.sp = this.d._sprite; } });
class SpriteTintTween extends B {
  awake() { this.rs = this.refs('_renderers').filter(Boolean).map((s) => [s, s.color.slice()]); }
  onEnable() { if (this.d._playOnEnable) this.play(); }
  play() { const t = this.d._tint; const tc = Array.isArray(t) ? t : t ? [t.r, t.g, t.b, t.a] : [1, 1, 1, 1]; for (const [s, c0] of this.rs) { const f = s.color.slice(); const to = this.d._absolute ? tc : [c0[0] * tc[0], c0[1] * tc[1], c0[2] * tc[2]]; E.tween({ dur: this.d._seconds || 0.5, owner: this, update: (k) => { for (let i = 0; i < 3; i++) s.color[i] = f[i] + (to[i] - f[i]) * k; } }); } }
  SetProgress(p) { if (!this._played) { this._played = true; this.play(); } const d = this.d; const k = E.clamp(p / (d._fullAt || 1), 0, 1); const a = (d._alphaFrom == null ? 1 : d._alphaFrom) + ((d._alphaTo == null ? 1 : d._alphaTo) - (d._alphaFrom == null ? 1 : d._alphaFrom)) * k; for (const [s] of this.rs) { s.go.setActive(true); s.color[3] = a; } }
}
S('LevelFlow.SpriteTintTween', SpriteTintTween);
class SpriteChoice extends B { Select(i) { const s = sr0(this, '_renderer'); const sp = (this.d._sprites || [])[i]; if (s && sp) s.sp = sp; } }
S('LevelFlow.SpriteChoice', SpriteChoice);
class CountdownDial extends B {
  Play() { const d = this.d; const bg = d._background && this.ref('_background'); const fill = d._fill && this.ref('_fill'); const g = this.go; g.setActive(true); if (bg) bg.go.setActive(true); if (fill) fill.go.setActive(true);
    const tick = d._tick && this.ref('_tick'); if (tick) LF.asPlay(tick);
    E.tween({ dur: d._seconds || 3, owner: this, ease: E.ease.linear, update: (k) => { if (fill) fill.fa = 1 - k; }, done: () => { if (tick) LF.asStop(tick); LF.invoke(this, d._onFinished); E.punchScale(g, d._finishPop || 0.15, 0.25); this.after(0.3, () => g.setActive(false)); } }); }
}
S('LevelFlow.CountdownDial', CountdownDial);
class ToolLoadUp extends B {
  async Play() {
    const d = this.d; const tool = this.ref('_tool'); if (!tool) return; const g = tool.go; tool.locked = true;
    await LF.wait(d._startDelay || 0.6);
    const loaded = d._loaded && this.ref('_loaded'); if (loaded) { loaded.go.setActive(true); loaded.color[3] = 0; }
    const home = g.worldPos(); const touches = this.refs('_touches').map(LF.go).filter(Boolean);
    for (let i = 0; i < touches.length; i++) {
      const t = touches[i].worldPos(); const s = g.worldPos();
      await new Promise((r) => E.tween({ dur: d._toEachSeconds || 0.4, owner: g, ease: E.ease.inOutSine, update: (k) => g.setWorldPos(s[0] + (t[0] - s[0]) * k, s[1] + (t[1] - s[1]) * k + Math.sin(k * Math.PI) * (d._liftDistance || 0.3)), done: r, onKill: r }));
      if (d._clip) LF.sound(d._clip, d._volume || 0.5);
      await new Promise((r) => E.tween({ dur: d._onEachSeconds || 0.4, owner: g, ease: E.ease.linear, update: (k) => { g.setWorldPos(t[0] + Math.sin(k * Math.PI * 2) * (d._wipeDistance || 0.15), t[1]); if (loaded) loaded.color[3] = Math.max(loaded.color[3], (i + k) / touches.length); }, done: r, onKill: r }));
    }
    const s = g.worldPos(); await new Promise((r) => E.tween({ dur: d._homeSeconds || 0.4, owner: g, update: (k) => g.setWorldPos(s[0] + (home[0] - s[0]) * k, s[1] + (home[1] - s[1]) * k), done: r, onKill: r }));
    tool.locked = false;
  }
}
S('LevelFlow.ToolLoadUp', ToolLoadUp);
class ToolSnip extends B { Play() { this.on = true; } Stop() { this.on = false; const bl = this.refs('_blades').map(LF.go); bl.forEach((b) => { if (b && b._r0 != null) b.rot = b._r0; }); } update() { if (!this.on) return; const bl = this.refs('_blades').map(LF.go); const od = this.d._openDegrees || []; const k = 0.5 - 0.5 * Math.cos(E.time * Math.PI * 2 / (this.d._snipSeconds || 0.3)); bl.forEach((b, i) => { if (!b) return; if (b._r0 == null) b._r0 = b.rot; b.rot = b._r0 + (od[i] || 10) * k; }); } }
S('LevelFlow.ToolSnip', ToolSnip);
class ToolDollop extends B {
  Scoop() { const s = this.ref('_dollop'); if (!s) return; s.go.setActive(true); if (this.s0 == null) this.s0 = [s.go.sx, s.go.sy]; E.punchScale(s.go, this.d._scoopSwell || 0.2, this.d._scoopSeconds || 0.3); }
  SetUsed(p) { const s = this.ref('_dollop'); if (!s) return; if (this.s0 == null) this.s0 = [s.go.sx, s.go.sy]; const tf = this.d._thinFrom || 0.3; const k = p <= tf ? 0 : (p - tf) / (1 - tf); const sc = 1 + ((this.d._usedScale || 0) - 1) * k; s.go.sx = this.s0[0] * sc; s.go.sy = this.s0[1] * sc; }
  ResetDollop() { const s = this.ref('_dollop'); if (s && this.s0) { s.go.sx = this.s0[0]; s.go.sy = this.s0[1]; } }
}
S('LevelFlow.ToolDollop', ToolDollop);
class HairBandRelease extends B {
  Release() { const d = this.d; const band = this.ref('_band'); if (band) { const g = band.go, y = g.y, r = g.rot; E.tween({ dur: d._liftSeconds || 0.5, owner: g, update: (k) => { g.y = y + (d._liftHeight || 1) * k; g.rot = r + (d._liftDegrees || 20) * k; band.color[3] = 1 - k; }, done: () => g.setActive(false) }); }
    for (const s of this.refs('_looseHair')) if (s) { s.go.setActive(true); s.color[3] = 0; E.tween({ dur: d._revealSeconds || 0.4, owner: s.go, update: (k) => { s.color[3] = k; }, done: () => { for (const t of this.refs('_tiedHair')) if (t) t.go.setActive(false); } }); }
    const pf = d._poof && this.ref('_poof'); if (pf) E.particles.play(pf); LF.invoke(this, d._onReleased); }
}
S('LevelFlow.HairBandRelease', HairBandRelease);
S('LevelFlow.ParticleRateByProgress', class extends B { Rising() {} Falling() {} });
class PoseTween extends B {
  Play() { const d = this.d, g = this.go; const rp = d._restPose && LF.go(this.ref('_restPose')); const sw = g.worldPos(); let tw, tr;
    if (rp) { tw = rp.worldPos(); tr = rp.worldRot() - (g.parent ? g.parent.worldRot() : 0); } else { const o = d._restOffset || [0, 0]; tw = [sw[0] + o[0], sw[1] + o[1]]; tr = g.rot + (d._restDegrees || 0); }
    const fr = g.rot; const fs = g.sx, ts = d._restScale && d._restScale !== 1 ? fs * d._restScale : fs;
    E.tween({ dur: d._seconds || 0.6, owner: g, ease: LF.ease(d._ease || 7), update: (k) => { g.setWorldPos(sw[0] + (tw[0] - sw[0]) * k, sw[1] + (tw[1] - sw[1]) * k + Math.sin(k * Math.PI) * (d._arcHeight || 0)); g.rot = fr + (tr - fr) * k; g.sx = g.sy = fs + (ts - fs) * k; }, done: () => LF.invoke(this, d._onLanded) }); }
}
S('LevelFlow.PoseTween', PoseTween);
// the whirlpool is a shader quad in the original: drawn here as a soft spinning swirl while the water flows
class VortexDrain extends B {
  awake() { this.flow = 0; this.on = false; this.quads = this.go.compsInChildren('SR').filter((s) => /Quad$/.test((E.D.spr[s.sp] || [])[9] || '')); for (const q of this.quads) { q._lfSwirl = this; } }
  Play() { this.go.setActive(true); this.on = true; } StartFlow() { this.on = true; } StopFlow() { this.on = false; } SetRise(v) { this.rise = v; } ClearRise() { this.rise = 0; }
  update(dt) { this.flow = LF.damp(this.flow, this.on ? 1 : 0, 3, dt); }
}
E.drawSwirl = (c, ctx, a) => {
  const v = c._lfSwirl; const k = v ? v.flow : 0; if (k < 0.02) return;
  E.setT(c.go.wm); const s = E.sprite(c.sp); const ppu = s ? s[7] : 100; const r = s ? Math.min(s[3], s[4]) / ppu / 2 : 1;
  ctx.save(); ctx.globalAlpha = a * k * 0.55; ctx.rotate(-E.time * 4);
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = r * 0.08; for (let t = 0; t < 1; t += 0.02) { const ang = t * Math.PI * 3 + i * 2.09, rr = r * (1 - t) * 0.95; const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr; if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); }
  ctx.restore();
};
S('LevelFlow.VortexDrain', VortexDrain);
class LiquidLevel extends B { awake() { this.s0 = this.go.sy; } setLevel(v) { this.go.sy = this.s0 * Math.max(0.02, v); } }
S('LevelFlow.LiquidLevel', LiquidLevel);
// ScratchTool.OpenOntoTable: the wand comes out of its holder onto the table
E.scripts['LevelFlow.ScratchTool'].prototype.OpenOntoTable = function () {
  const g = this.go; g.setActive(true); this.drawnOut = true; LF.invoke(this, this.d._onOpened);
  const sd = this.d._setDownAt && LF.go(this.ref('_setDownAt'));
  if (sd) { const wp = sd.worldPos(); const s = g.worldPos(); E.tween({ dur: 0.5, owner: g, update: (k) => g.setWorldPos(s[0] + (wp[0] - s[0]) * k, s[1] + (wp[1] - s[1]) * k + Math.sin(k * Math.PI) * 0.5), done: () => { const l = [g.x, g.y]; this.home.x = l[0]; this.home.y = l[1]; LF.invoke(this, this.d._onLandedOnTable); } }); }
  else LF.invoke(this, this.d._onLandedOnTable);
};

// ------------------------------------------------------------------ world hint hand
class WorldHandHint extends B {
  awake() { LF.hintCtl = this; this.sr = this.go.comp('SR'); this.go.setActive(false); this.mode = null; }
  show(from, to, kind) {
    if (this.mode === kind && this.to && to && LF.dist(this.to, to) < 0.01) return;
    this.mode = kind; this.from = from; this.to = to; this.t0 = E.time; this.go.setActive(true);
    if (!this.s0) this.s0 = [this.go.sx, this.go.sy];
  }
  hide() { this.mode = null; this.go.setActive(false); }
  tipOffset() { const b = this.sr && LF.srBounds(this.sr); const wp = this.go.worldPos(); const f = this.d._fingertip || [0.25, 0.9]; return b ? [wp[0] - (b[0] + (b[2] - b[0]) * f[0]), wp[1] - (b[1] + (b[3] - b[1]) * f[1])] : [0, 0]; }
  place(p, press) { const o = this.tipOffset(); this.go.setWorldPos(p[0] + o[0], p[1] + o[1]); const s = press ? 1 - (this.d._pressShrink || 0.1) : 1; this.go.sx = this.s0[0] * s; this.go.sy = this.s0[1] * s; }
  update() {
    if (!this.mode || !this.to) return;
    const t = E.time - this.t0; const to = this.to; const hv = this.d._hover || 0.3;
    if (this.mode === 'tap') { const per = this.d._tapSeconds || 1; const k = (t % per) / per; const dip = k < 0.5 ? 0 : Math.sin((k - 0.5) * 2 * Math.PI); this.place([to[0], to[1] + hv * (1 - Math.max(0, dip))], dip > 0.5); if (this.sr) this.sr.color[3] = 1; return; }
    if (this.mode === 'rub') { const per = this.d._rubSeconds || 1.6; const k = (t % per) / per; const r = this.d._rubReach || 0.6; this.place([to[0] + Math.sin(k * Math.PI * 2 * (this.d._rubStrokes || 2)) * r, to[1]], true); return; }
    const from = this.from || [to[0] - 1, to[1] - 1]; const per = this.d._dragSeconds || 1.6; const k = (t % per) / per;
    const m = E.ease.inOutSine(E.clamp((k - 0.15) / 0.65, 0, 1));
    this.place([from[0] + (to[0] - from[0]) * m, from[1] + (to[1] - from[1]) * m], k > 0.1 && k < 0.85);
    if (this.sr) this.sr.color[3] = k < 0.1 ? k / 0.1 : k > 0.88 ? Math.max(0, 1 - (k - 0.88) / 0.12) : 1;
  }
}
S('LevelFlow.WorldHandHint', WorldHandHint);
S('LevelFlow.IdleHint', class extends B {});
S('LevelFlow.UiHandHint', class extends B {});

// ------------------------------------------------------------------ UI motion / buttons
class UiMotion extends B {
  awake() { const g = this.go; if (g.rt) this.rest = [g.rt[4], g.rt[5]]; this.s0 = [g.sx, g.sy]; this.r0 = g.rot; }
  cg() { return (this.d._group && this.ref('_group')) || this.go.comp('CG'); }
  show() { const d = this.d, g = this.go; g.setActive(true); const off = d._hiddenOffset || [0, 0], hs = d._hiddenScale == null ? 1 : d._hiddenScale; const cg = this.cg(); this.arrived = false;
    return new Promise((r) => E.tween({ dur: d._showSeconds || 0.4, owner: g, ease: d._overshoot ? E.ease.outBack : E.ease.outCubic, update: (k) => { if (this.rest) { g.rt[4] = this.rest[0] + off[0] * (1 - k); g.rt[5] = this.rest[1] + off[1] * (1 - k); } const s = hs + (1 - hs) * k; g.sx = this.s0[0] * s; g.sy = this.s0[1] * s; g.rot = this.r0 + (d._hiddenDegrees || 0) * (1 - k); if (cg) cg.alpha = Math.min(1, k * 1.5); if (k > 0.7) this.arrived = true; }, done: r, onKill: r })); }
  hide() { const d = this.d, g = this.go; const off = d._hiddenOffset || [0, 0]; const cg = this.cg();
    return new Promise((r) => E.tween({ dur: d._hideSeconds || 0.3, owner: g, ease: E.ease.inCubic, update: (k) => { if (this.rest) { g.rt[4] = this.rest[0] + off[0] * k; g.rt[5] = this.rest[1] + off[1] * k; } if (cg) cg.alpha = 1 - k; }, done: () => { if (d._deactivateWhenHidden !== false) g.setActive(false); r(); }, onKill: r })); }
  Show() { return this.show(); } Hide() { return this.hide(); }
}
S('LevelFlow.UiMotion', UiMotion);
class PillButton extends B {
  awake() { this.used = false; this.onClick = null; }
  onPointerClick() { if (this.d._oneShot && this.used) return; this.used = true; const f = this.d._face && this.ref('_face'); E.punchScale(LF.go(f) || this.go, -(this.d._pressAmount || 0.08), this.d._pressSeconds || 0.2); LF.invoke(this, this.d._onPressed); if (this.onClick) this.onClick(); }
  update() { const f = this.d._face && LF.go(this.ref('_face')); if (f) { if (f._s0 == null) f._s0 = f.sx; const k = 1 + (this.d._breathAmount || 0.03) * Math.sin(E.time * Math.PI * 2 / (this.d._breathSeconds || 1.4)); f.sx = f.sy = f._s0 * k; } }
}
S('LevelFlow.PillButton', PillButton);
S('LevelFlow.OutfitCard', class extends B { onPointerClick(ev) { if (this.onClick) this.onClick(ev); } });

// ------------------------------------------------------------------ tool progress bar (UI)
class ToolProgressBar extends B {
  start() {
    const d = this.d;
    this.steps = this.refs('_steps'); this.icons = d._icons || []; this.picks = d._pickIcons || [];
    this.fill = LF.go(this.ref('_fill')); this.fillCG = d._fillGroup && this.ref('_fillGroup');
    this.cur = this.ref('_current'); this.nxt = this.ref('_next'); this.curTile = LF.go(this.ref('_currentTile')); this.nxtTile = LF.go(this.ref('_nextTile'));
    this.trTile = LF.go(this.ref('_travelTile')); this.trIcon = this.ref('_travelIcon');
    this.shown = -1; this.k = 0; this.curIdx = -1;
    if (this.fill && this.fill.rt) this.fill.rt[2] = this.fill.rt[0];
    if (this.cur) this.cur.go.setActive(false); if (this.nxt) this.nxt.go.setActive(false);
    this.go.comp('CG') && (this.go.comp('CG').alpha = 0);
  }
  // fit icon i (its content rect, zoom, turn, focus) into its box
  place(img, i, pick) {
    if (!img) return;
    const sp = pick ? this.picks[i] : this.icons[i]; img.sp = sp; img.enabled = true; img.go.setActive(!!sp);
    if (!sp) return; const s = E.sprite(sp); const box = img.go.parent; if (!s || !box || !box.rt) return;
    const bw = box.rt[6], bh = box.rt[7];
    const C = (this.d._iconContent || [])[i]; const c = C && (C[2] > C[0]) ? C : [0, 0, 1, 1];
    const zoom = ((this.d._iconZoom || [])[i]) || 1; const deg = pick ? 0 : ((this.d._iconDegrees || [])[i] || 0);
    const sw = s[10], sh = s[11]; const cw = sw * (c[2] - c[0]), ch = sh * (c[3] - c[1]);
    const a = Math.abs(deg * E.DEG); const rw = cw * Math.cos(a) + ch * Math.sin(a), rh = cw * Math.sin(a) + ch * Math.cos(a);
    const k = Math.min(bw / rw, bh / rh) * zoom * 0.92;
    const F = (this.d._iconFocus || [])[i] || [0, 0];
    img.go.rt = [0.5, 0.5, 0.5, 0.5, 0, 0, sw * k, sh * k, 0.5, 0.5];
    const ox = -((c[0] + c[2]) / 2 - 0.5 + F[0] * (c[2] - c[0]) / 2) * sw * k, oy = -((c[1] + c[3]) / 2 - 0.5 + F[1] * (c[3] - c[1]) / 2) * sh * k;
    const rr = deg * E.DEG; img.go.rt[4] = ox * Math.cos(rr) - oy * Math.sin(rr); img.go.rt[5] = ox * Math.sin(rr) + oy * Math.cos(rr);
    img.go.rot = deg; img.color[3] = pick ? 0.55 : 1;
  }
  nextIcon(i) { for (let k = i + 1; k < this.steps.length; k++) { if (this.icons[k]) return [k, false]; if (this.picks[k]) return [k, true]; } return [-1, false]; }
  update(dt) {
    const r = LF.runner; if (!r || !this.steps) return;
    const s = r.current; const i = this.steps.indexOf(s); const d = this.d;
    const hide = (d._hideFromStep >= 0 && i >= d._hideFromStep) || (d._hiddenDuring || [])[i] || i < 0;
    const cg = this.go.comp('CG'); if (cg) cg.alpha = LF.damp(cg.alpha, hide ? 0 : 1, 8, dt);
    if (i !== this.shown && i >= 0) {
      const prev = this.shown; this.shown = i;
      if (this.icons[i] && i !== this.curIdx) {
        const fromNext = this.nxt && this.nxt.sp === this.icons[i] && prev >= 0;
        this.curIdx = i; this.place(this.cur, i, false);
        if (this.curTile) { const t = this.curTile; const x0 = t.rt[4]; if (fromNext && this.nxtTile) { const dx = this.nxtTile.rt[4] - x0; t.rt[4] = x0 + dx; E.tween({ dur: d._travelSeconds || 0.375, owner: t, ease: E.ease.inQuad, update: (k) => { t.rt[4] = x0 + dx * (1 - k); }, done: () => E.punchScale(t, 0.15, d._popSeconds || 0.35) }); } else E.punchScale(t, 0.2, d._popSeconds || 0.35); }
        this.k = 0;
      }
      const [ni, pk] = this.nextIcon(i);
      if (this.nxt) { if (ni >= 0) { this.place(this.nxt, ni, pk); if (this.nxtTile) { const t = this.nxtTile; const x0 = t.rt[4]; const cgn = t.comp('CG'); t.rt[4] = x0 + 60; if (cgn) cgn.alpha = 0; E.tween({ dur: d._arriveSeconds || 0.17, delay: d._travelSeconds || 0.3, owner: t, ease: E.ease.outQuad, update: (k) => { t.rt[4] = x0 + 60 * (1 - k); if (cgn) cgn.alpha = k; } }); } } else this.nxt.go.setActive(false); }
    }
    // the green fill follows the step in hand
    if (this.fill && this.fill.rt) {
      const target = s && this.icons[i] ? (s.progress || 0) : (s && s.isComplete ? 1 : this.k);
      this.k = this.k + (target - this.k) * (1 - Math.exp(-(d._smoothing || 10) * dt));
      this.fill.rt[2] = this.fill.rt[0] + (1 - this.fill.rt[0]) * this.k;
      if (this.fillCG) this.fillCG.alpha = this.k > 0.01 ? 1 : 0;
    }
  }
}
S('LevelFlow.ToolProgressBar', ToolProgressBar);

// ------------------------------------------------------------------ finale: photo frame, posts, play button
class PostsFollowChoice extends B { Apply(i) { const sp = (this.d._postForOption || [])[i]; const cards = this.refs('_cards').filter(Boolean); const last = cards[cards.length - 1]; if (last && sp) last.sp = sp; } }
S('LevelFlow.PostsFollowChoice', PostsFollowChoice);
class PostFanEntrance extends B {
  Play() {
    const d = this.d; const cards = this.refs('_cards').map(LF.go).filter(Boolean); this.go.setActive(true);
    cards.forEach((c, i) => { const pos = (d._positions || [])[i] || [0, 0]; const deg = (d._degrees || [])[i] || 0; const sc = (d._scales || [])[i] || 1; const hh = (d._halfHeights || [])[i] || 0;
      const last = i === cards.length - 1; const side = i % 2 ? 1 : -1; const ex = last ? 0 : side * (d._enterSide || 2), ey = -(d._enterDrop || 3);
      const tx = pos[0] - Math.sin(deg * E.DEG) * hh * sc * -1, ty = pos[1] - Math.cos(deg * E.DEG) * hh * sc;
      c.setActive(true); c.x = tx + ex; c.y = ty + ey; c.rot = deg + (last ? 0 : side * (d._enterDegrees || 20)); c.sx = c.sy = sc;
      const fx = c.x, fy = c.y, fr = c.rot;
      E.tween({ dur: d._postSeconds || 0.5, delay: (d._firstDelay || 0.2) + i * (d._stagger || 0.25), owner: c, ease: E.ease.outBack, update: (k) => { c.x = fx + (tx - fx) * k; c.y = fy + (ty - fy) * k; c.rot = fr + (deg - fr) * k; }, done: () => { const cl = d._landClips || []; if (cl.length) LF.sound(E.pick(cl), d._landVolume || 0.5); } });
    });
  }
}
S('LevelFlow.PostFanEntrance', PostFanEntrance);
class CentreInFrame extends B {
  Centre() {
    const d = this.d; const stage = LF.go(this.ref('_stage')); const subj = LF.go(this.ref('_subject')); const frame = LF.go(this.ref('_frame')); if (!stage || !subj || !frame) return;
    const b = LF.bounds(subj); if (!b) return; const fp = frame.parent; const mid = (d._frameHighY + d._frameLowY) / 2;
    const fw = fp ? M.ap(fp.worldMatrix(), frame.x, mid) : [frame.x, mid];
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const dx = d._verticalOnly ? 0 : fw[0] - cx, dy = fw[1] - cy;
    const fx = stage.x, fy = stage.y; E.tween({ dur: d._seconds || 0.6, owner: stage, ease: E.ease.inOutSine, update: (k) => { stage.x = fx + dx * k; stage.y = fy + dy * k; } });
  }
}
S('LevelFlow.CentreInFrame', CentreInFrame);
// the end-of-level sequence (FramePostObj in the original): flash, framed photo, posts fan in, hearts, then Play/Next
class FramePostObj extends B {
  onEnable() { if (this._ran) return; this._ran = true; this.run(); }
  async run() {
    const d = this.d; const rf = (k) => (d[k] ? LF.go(this.ref(k)) : null);
    const flash = d._flashSp && this.ref('_flashSp');
    if (flash) { flash.go.setActive(true); flash.color[3] = d.maxAlpha || 0.6; E.tween({ dur: 0.5, owner: this, update: (k) => { flash.color[3] = (d.maxAlpha || 0.6) * (1 - k); } }); }
    LF.sound(LF.findClip('camera') || LF.findClip('Photo'), 0.7);
    const frame = rf('_frame'); if (frame) { frame.setActive(true); E.punchScale(frame, 0.08, 0.4); }
    await LF.wait(1.6);
    const bg = rf('InstaBg'); if (bg) { bg.setActive(true); const s = bg.comp('SR'); if (s) { s.color[3] = 0; E.tween({ dur: 0.4, owner: bg, update: (k) => (s.color[3] = k) }); } }
    if (frame) frame.setActive(false);
    const mw = rf('MakeUpWorking'); if (mw) mw.setActive(false);
    const tools = E.roots.find((r) => r.name === 'Tools'); if (tools) tools.setActive(false);
    LF.invoke(this, d.OnPostsShown);
    const hp = rf('HeartPar'); if (hp) { hp.setActive(true); E.psPlay(hp); }
    await LF.wait(1.6);
    const pb = rf('playButton'); if (pb) { pb.setActive(true); E.punchScale(pb, 0.2, 0.4); const btn = pb.comp('Btn'); if (btn) btn.onClick.push(() => LF.levelDone && LF.levelDone()); }
    const hb = rf('homeButton'); if (hb) hb.setActive(true);
  }
  clickNextButton() { if (LF.levelDone) LF.levelDone(); }
}
S('FramePostObj', FramePostObj);
LF.findClip = (sub) => { const s = sub.toLowerCase(); for (const k in E.D.audio) if (E.D.audio[k][0].toLowerCase().includes(s)) return k; return null; };
S('CustomBtn', class extends B { OnBtn() { if (LF.goHome) LF.goHome(); } });
S('LevelFlow.LevelExit', class extends B {});
S('LevelFlow.SwitchOnWhenShownStub', class extends B {});
// finale bloom on the white curtain
S('LevelFlow.BloomCurtain', class extends B {});
})();

// ------------------------------------------------------------------ feel: cloth sway, bristle bend, gaze, trigger squeeze
(() => {
const LF = E.LF, S = LF.S, B = E.Behaviour;
const toolOf = (b) => (b.d._tool && b.ref('_tool')) || b.go.comps.find((c) => c.cls === 'LevelFlow.ScratchTool') || null;
// a spring chasing a target
const spring = (st, target, freq, damp, dt) => { const w = 2 * Math.PI * (freq || 2); st.v += (w * w * (target - st.x) - 2 * (damp == null ? 0.3 : damp) * w * st.v) * dt; st.x += st.v * dt; return st.x; };
class ClothSway extends B {
  awake() { this.sr = this.go.comp('SR'); this.st = { x: 0, v: 0 }; this.ph = 0; this.rip = 0; this.tool = null; }
  start() { this.tool = toolOf(this); if (this.tool) this.tool.onPicked.push(() => { this.st.v -= (this.d._pickUpFlop || 0.15) * 30; }); if (this.sr) this.sr._warp = (v) => this.warp(v); }
  update(dt) {
    const d = this.d, t = this.tool; const held = !t || t.held; const vx = held && t ? t.vel[0] : 0; const sp = held && t ? t.speed : 0;
    const ls = this.go.lossyScale()[0] || 1;
    const target = E.clamp(-vx * (d._trailPerSpeed || 0.04), -(d._maxTrail || 0.5), d._maxTrail || 0.5) / ls;
    spring(this.st, held ? target : 0, d._frequency, d._damping, Math.min(dt, 0.05));
    const k = Math.min(1, sp / (d._fullAtSpeed || 7)); this.ph += dt * (d._rippleSpeed || 2) * (0.3 + k); this.rip = held && t ? ((d._ripple || 0.05) * k + (d._rippleHeldStill || 0.008)) / ls : 0;
  }
  warp(v) { const pin = (this.d._pin || [0.5, 0.9])[1]; const free = pin * (1 - (this.d._pinnedShare || 0.2)); if (v >= free) return 0; const a = (free - v) / Math.max(0.01, free); return this.st.x * a * a + Math.sin(this.ph * Math.PI * 2 - a * (this.d._ripplesAlong || 1.6) * Math.PI * 2) * this.rip * a; }
}
S('LevelFlow.ClothSway', ClothSway);
class BristleFlex extends B {
  awake() { this.sr = (this.d._renderer && this.ref('_renderer')) || this.go.comp('SR'); this.st = { x: 0, v: 0 }; this.press = 0; }
  start() { this.tool = toolOf(this); const fs = [this.sr].concat(this.refs('_followers')).filter(Boolean); for (const s of fs) s._warp = (v) => this.warp(v); if (this.tool) this.tool.onPicked.push(() => { this.st.v += 4; }); }
  update(dt) {
    const d = this.d, t = this.tool; const ls = this.go.lossyScale()[0] || 1;
    const vx = t && t.held ? t.vel[0] / ls : 0; const pressed = t && t.held && t.onArt ? 1 : 0;
    this.press = LF.damp(this.press, pressed, d._pressSharpness || 16, dt);
    const tgt = E.clamp(-vx * (d._bendPerSpeed || 0.05) * (1 + (d._pressedDrag || 1) * this.press), -(d._maxBend || 0.3), d._maxBend || 0.3);
    spring(this.st, tgt, d._frequency || 4, d._damping || 0.3, Math.min(dt, 0.05));
  }
  warp(v) { const tip = (this.d._tuftAlong || 1) > 0 ? v : 1 - v; return this.st.x * tip * tip; }
}
S('LevelFlow.BristleFlex', BristleFlex);
class GazeFollow extends B {
  awake() { this.ir = this.refs('_irises').map(LF.go).filter(Boolean).map((g) => ({ g, x: g.x, y: g.y })); this.off = [0, 0]; this.nextGlance = E.time + E.rand(1.5, 3.5); this.glance = null; this.lastTouch = -9; }
  update(dt) {
    const d = this.d; const reach = d._reach || [0.1, 0.05];
    let target = null; const tool = LF.activeTool;
    if (tool && tool.held) target = tool.tip(); else if (LF.ptr.down && !LF.ptr.overUI) target = LF.ptrWorld();
    if (target) this.lastTouch = E.time;
    let want = [0, 0];
    const eye = this.ir.find((e) => e.g.activeInHierarchy);
    if (target && eye) { const ep = eye.g.parent ? eye.g.parent.worldPos() : eye.g.worldPos(); const dx = target[0] - ep[0], dy = target[1] - ep[1]; const n = Math.hypot(dx, dy) || 1; const k = Math.min(1, n / (d._fullLookDistance || 2.5)); want = [dx / n * k * reach[0], dy / n * k * reach[1]]; this.glance = null; }
    else if (E.time - this.lastTouch > (d._lingerSeconds || 0.8)) {
      if (!this.glance && E.time > this.nextGlance) { const a = Math.random() * Math.PI * 2; const s = d._glanceShare || 0.5; this.glance = { v: [Math.cos(a) * reach[0] * s, Math.sin(a) * reach[1] * s], until: E.time + (d._glanceHoldSeconds || 0.9) }; }
      if (this.glance) { want = this.glance.v; if (E.time > this.glance.until) { this.glance = null; const ge = d._glanceEvery || [1.8, 4.2]; this.nextGlance = E.time + E.rand(ge[0], ge[1]); } }
    } else want = this.off;
    const sec = target ? (d._followSeconds || 0.1) : (d._returnSeconds || 0.3);
    const k = 1 - Math.exp(-dt / Math.max(0.02, sec) * 2.5);
    this.off = [this.off[0] + (want[0] - this.off[0]) * k, this.off[1] + (want[1] - this.off[1]) * k];
    for (const e of this.ir) { const ls = e.g.parent ? e.g.parent.lossyScale() : [1, 1]; e.g.x = e.x + this.off[0] / (ls[0] || 1); e.g.y = e.y + this.off[1] / (ls[1] || 1); }
  }
}
S('LevelFlow.GazeFollow', GazeFollow);
class ToolHeldSqueeze extends B {
  awake() { this.part = (this.d._part && LF.go(this.ref('_part'))) || this.go; this.r0 = this.part.rot; this.p0 = [this.part.x, this.part.y]; this.k = 0; this.ph = 0; this._lastF = 0; }
  start() { this.tool = toolOf(this); if (this.tool) this.tool.onPicked.push(() => { this.ph = 0; this.fired = false; }); }
  update(dt) {
    const d = this.d; const held = this.tool && this.tool.held;
    let tgt = held ? 1 : 0;
    if (held && d._pumpWhileHeld) { this.ph += dt / (d._pumpSeconds || 0.5); const f = this.ph % 1; tgt = f < 0.5 ? 1 : 1 - (d._pumpEase == null ? 0.6 : d._pumpEase); if (f < 0.5 && this._lastF >= 0.5) this.fired = false; this._lastF = f; }
    const sp = tgt > this.k ? (d._pressSeconds || 0.08) : (d._releaseSeconds || 0.15);
    this.k += Math.sign(tgt - this.k) * Math.min(Math.abs(tgt - this.k), dt / Math.max(0.01, sp));
    if (this.k >= 0.98 && !this.fired && held) { this.fired = true; LF.invoke(this, d._onSqueezed); }
    const po = d._pressOffset || [0, 0]; this.part.rot = this.r0 + (d._squeezeDegrees || 0) * this.k; this.part.x = this.p0[0] + po[0] * this.k; this.part.y = this.p0[1] + po[1] * this.k;
  }
}
S('LevelFlow.ToolHeldSqueeze', ToolHeldSqueeze);
})();

// ------------------------------------------------------------------ counter shadow and surface hints
(() => {
const LF = E.LF, S = LF.S, B = E.Behaviour;
class CounterShadow extends B {
  awake() { this.sh = this.ref('_shadow'); this.a0 = this.sh ? this.sh.color[3] : 1; }
  lateUpdate() {
    const s = LF.go(this.ref('_subject')); const sh = this.sh; if (!sh) return;
    const vis = !!(s && s.activeInHierarchy);
    if (!vis) { sh.color[3] = 0; return; }
    const r = this.d._rest || [0, 0]; const p = s.worldPos(); const dd = Math.hypot(p[0] - r[0], p[1] - r[1]);
    sh.color[3] = this.a0 * Math.max(0, 1 - dd / (this.d._fadeDistance || 0.45));
  }
}
S('LevelFlow.CounterShadow', CounterShadow);
class SurfaceHint extends B {
  onEnable() { this.t0 = E.time; this.sr = this.go.comp('SR'); if (this.sr && this.a0 == null) this.a0 = this.sr.color[3] || 1; this.s0 = this.s0 || [this.go.sx, this.go.sy]; this.fade = 1; }
  update(dt) {
    const d = this.d, sr = this.sr; if (!sr) return;
    const surf = this.ref('_surface'); let w = 0;
    if (surf && surf.ready) { const ri = d._region == null ? -1 : d._region; w = ri >= 0 && surf.parts && surf.parts[ri] ? surf.partProgress(surf.parts[ri]) : surf.progress01(); }
    const want = Math.max(0, 1 - w / (d._goneAt || 0.6)); this.fade = LF.damp(this.fade, want, d._fadeSharpness || 8, dt);
    const k = 0.5 + 0.5 * Math.sin((E.time - this.t0) * Math.PI * 2 * (d._breathsPerSecond || 1)); const mn = d._minAlpha == null ? 0.4 : d._minAlpha, mx = d._maxAlpha || 1;
    const fi = Math.min(1, (E.time - this.t0) / (d._fadeInSeconds || 0.3));
    sr.color[3] = this.a0 * fi * this.fade * (mn + (mx - mn) * k);
    const sw = 1 + (d._swell || 0) * k; this.go.sx = this.s0[0] * sw; this.go.sy = this.s0[1] * sw;
  }
}
S('LevelFlow.SurfaceHint', SurfaceHint);
})();

// ------------------------------------------------------------------ screen look (grade/vignette/landing glow) and the camera that leans into the work
(() => {
const LF = E.LF, S = LF.S, B = E.Behaviour;
class ScreenLook extends B {
  awake() { const p = this.d._profile && E.so(this.d._profile); this.st = (p && p._settings) || {}; this.glow = 0; this.focus = 0; LF.look = this; E.onPostWorld = (ctx, w, h) => this.draw(ctx, w, h); }
  onDestroy() { if (LF.look === this) { LF.look = null; E.onPostWorld = null; } }
  landed() { const d = this.d; const up = d._landedRiseSeconds || 0.12, down = d._landedFallSeconds || 0.9; E.tween({ dur: up + down, owner: this, ease: E.ease.linear, update: (k) => { const t = k * (up + down); this.glow = t < up ? t / up : 1 - (t - up) / down; } }); }
  update(dt) { const touching = (LF.activeTool && LF.activeTool.held && LF.activeTool.onArt) || false; this.focus = LF.damp(this.focus, touching ? 1 : 0, 1 / Math.max(0.05, (this.d._focusSeconds || 0.5) * (touching ? 1 : 2)), dt); }
  draw(ctx, w, h) {
    const s = this.st; const d = this.d;
    const vi = (s.VignetteIntensity || 0) + (d._focusVignette || 0) * this.focus;
    if (vi > 0.001) {
      const vc = s.VignetteColor || [0.4, 0.28, 0.36, 1]; const r = Math.hypot(w, h) / 2; const sm = s.VignetteSmoothness == null ? 0.7 : s.VignetteSmoothness;
      const g = ctx.createRadialGradient(w / 2, h / 2, r * (1 - sm) * 0.9, w / 2, h / 2, r);
      const c = `${vc[0] * 255 | 0},${vc[1] * 255 | 0},${vc[2] * 255 | 0}`;
      g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(1, `rgba(${c},${Math.min(0.85, vi * 1.1)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    const warm = (s.Temperature || 0) * 0.35; if (warm > 0.001) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = `rgba(255,200,150,${Math.min(0.3, warm)})`; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
    const gl = this.glow * ((d._landedGlow || 0.24) + (d._landedExposure || 0)); if (gl > 0.002) { ctx.globalCompositeOperation = 'lighter'; const gt = s.GlowTint || [1, 0.94, 0.88]; const g2 = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.7); g2.addColorStop(0, `rgba(${gt[0] * 255 | 0},${gt[1] * 255 | 0},${gt[2] * 255 | 0},${gl})`); g2.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
  }
}
S('LevelFlow.ScreenLook', ScreenLook);
class ScratchCameraFollow extends B {
  awake() { this.base = [this.go.x, this.go.y]; this.off = [0, 0]; this.vel = [0, 0]; this.zoom = 1; this.last = -9; this.paused = false; this.roll = 0; }
  SetGlide() {} SetHoldStill(v) { this.still = !!v; } SetPaused(v) { this.paused = !!v; }
  update(dt) {
    const d = this.d; const vc = LF.viewCam; if (!vc) return;
    const t = LF.activeTool; let contact = null;
    if (t && t.held && t.onArt) contact = t.tip(); else if (!d._toolsOnly && LF.ptr.down && !LF.ptr.overUI) contact = LF.ptrWorld();
    if (contact) this.last = E.time;
    const engaged = !this.paused && !this.still && (contact || E.time - this.last < (d._releaseGrace || 0.25));
    const hh = (vc.baseSize || 7.6);
    let tx = 0, ty = 0;
    if (engaged && contact) { tx = E.clamp((contact[0] - this.base[0]) * (d._followAmount || 0.3), -(d._maxOffsetX || 0.03) * hh, (d._maxOffsetX || 0.03) * hh); ty = E.clamp((contact[1] - this.base[1]) * (d._followAmount || 0.3), -(d._maxOffsetY || 0) * hh, (d._maxOffsetY || 0) * hh); this._t = [tx, ty]; }
    else if (engaged && this._t) { tx = this._t[0]; ty = this._t[1]; }
    const k = 1 - Math.exp(-dt / Math.max(0.05, d._smoothTime || 0.35) * 2);
    this.off[0] += (tx - this.off[0]) * k; this.off[1] += (ty - this.off[1]) * k;
    const kz = 1 - Math.exp(-dt / Math.max(0.05, d._zoomSmoothTime || 0.6) * 2);
    this.zoom += ((this.baseZoom || 1) * (engaged ? (d._engagedZoom || 1) : 1) - this.zoom) * kz;
    if (!vc._focusZoom) { this.go.x = this.base[0] + this.off[0]; this.go.y = this.base[1] + this.off[1]; vc.zoom = this.zoom; vc.fit(); }
  }
}
S('LevelFlow.ScratchCameraFollow', ScratchCameraFollow);
})();
