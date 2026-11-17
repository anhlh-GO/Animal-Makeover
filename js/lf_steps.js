'use strict';
// Interactive LevelFlow steps: toggles, taps, plucks, crafting (drag to slot), choices, peel, pour, outfits, cuts, machines.
(() => {
const LF = E.LF, M = E.M, S = LF.S, P = LF.ptr;
const Step = LF.LevelStep;
const tick = (owner, fn) => new Promise((res) => { const f = () => { if (fn() === true || !owner.isRunning) { res(); return; } E.after(0.0001, f, owner); }; f(); });
LF.tick = tick;
const grabbedAt = () => { if (!P.justDown || LF.ptrOverUI()) return null; return LF.downWorld(); };
// tool pick-up / release handling shared by steps with an optional ScratchTool
const toolTick = (tool) => {
  if (!tool) return null;
  if (!tool.held && P.justDown && !LF.ptrOverUI()) { const w = LF.downWorld(); if (tool.canGrab(w[0], w[1])) { tool.pickUp(w[0], w[1]); LF.hideHint(); } }
  if (tool.held && !P.down) tool.release();
  return tool.held ? tool.tip() : null;
};
LF.toolTick = toolTick;

// ------------------------------------------------------------------ SpriteToggleStep
class SpriteToggleStep extends Step {
  async execute() {
    const ts = this.d._toggles || [];
    let maxT = 0;
    await Promise.all(ts.map((t, i) => (async () => {
      await LF.wait(t.DelaySeconds || 0);
      const g = LF.go(E.resolve(this.go, t.Target)); const sr = t.Renderer ? E.resolve(this.go, t.Renderer) : null;
      if (t.Fade && sr && sr.color) {
        const sg = sr.go; const to = t.FadeToPartial ? t.PartialAlpha : t.SetActive ? 1 : 0;
        if (t.SetActive || t.FadeToPartial) { if (g) g.setActive(true); sg.setActive(true); if (t.SetActive && !t.FadeToPartial && !sr._wasOn) sr.color[3] = sr.color[3] >= 0.99 ? 0 : sr.color[3]; }
        const tint = t.FadeToPartial && t.PartialTint ? (Array.isArray(t.PartialTint) ? t.PartialTint : [t.PartialTint.r, t.PartialTint.g, t.PartialTint.b, 1]) : null;
        const c0 = sr.color.slice();
        await new Promise((r) => E.tween({ dur: t.FadeSeconds || 0.3, owner: this, update: (k) => { sr.color[3] = c0[3] + (to - c0[3]) * k; if (tint) for (let q = 0; q < 3; q++) sr.color[q] = c0[q] + (c0[q] * tint[q] - c0[q]) * k; }, done: r, onKill: r }));
        if (!t.SetActive && !t.FadeToPartial) { if (g) g.setActive(false); else sg.setActive(false); sr.color[3] = c0[3] || 1; }
      } else if (g) g.setActive(!!t.SetActive);
      this.setProgress((i + 1) / ts.length);
    })()));
    await LF.wait(this.d._holdSeconds || 0);
  }
  fastForward() {
    for (const t of this.d._toggles || []) { const g = LF.go(E.resolve(this.go, t.Target)); const sr = t.Renderer ? E.resolve(this.go, t.Renderer) : null; if (t.FadeToPartial && sr) { sr.go.setActive(true); sr.color[3] = t.PartialAlpha; } else if (g) g.setActive(!!t.SetActive); else if (sr && sr.go) sr.go.setActive(!!t.SetActive); }
    LF.invoke(this, this.d._onBegan); LF.invoke(this, this.d._onCompleted);
  }
}
S('LevelFlow.SpriteToggleStep', SpriteToggleStep);

// ------------------------------------------------------------------ TapStep
class TapStep extends Step {
  async execute() {
    const d = this.d; const targets = this.refs('_targets').filter(Boolean);
    const tool = d._tool ? this.ref('_tool') : null;
    if (tool) await tool.arrive();
    const hint = d._hint ? this.ref('_hint') : null;
    const t0 = E.time; let tapped = null;
    await tick(this, () => {
      let pt = null;
      if (tool) { const tip = toolTick(tool); if (tip) pt = tip; }
      else { const w = grabbedAt(); if (w) pt = w; }
      if (pt) for (const c of targets) if (LF.hitCollider(c, pt[0], pt[1], d._touchSlop || 0.15)) { tapped = c; return true; }
      const idle = E.time - t0 > (d._firstHintAtOnce ? 0 : (d._hintAfterSeconds || 3));
      if (hint && idle && !this._hintOn) { this._hintOn = true; this.runHint(hint, targets[0]); }
      if (!hint && idle && targets[0] && !P.down) LF.showHint(null, LF.wpos(targets[0].go), 'tap');
      return false;
    });
    this._hintOn = false; if (hint) hint.go.setActive(false); LF.hideHint();
    for (const g of this.refs('_showOnTap')) if (g) LF.go(g).setActive(true);
    for (const g of this.refs('_hideOnTap')) if (g) LF.go(g).setActive(false);
    const pt = (d._punchTarget && this.ref('_punchTarget')) || (tapped && tapped.go);
    if (pt && d._punchAmount > 0) E.punchScale(LF.go(pt), d._punchAmount, d._punchSeconds || 0.3);
    LF.invoke(this, d._onTapped);
    if (tool) { tool.release(); tool.leave(); }
    const hs = d._holdSeconds || 0;
    if (hs > 0) await new Promise((r) => E.tween({ dur: hs, owner: this, ease: E.ease.linear, update: (k) => this.setProgress(k), done: r, onKill: r }));
  }
  runHint(hint, target) {
    const g = hint.go; g.setActive(true);
    const tp = target ? LF.wpos(target.go) : [0, 0];
    const fp = this.d._hintFingertip || [0.2, 0.9];
    const loop = () => {
      if (!this._hintOn) { g.setActive(false); return; }
      const b = LF.srBounds(hint); const wp = g.worldPos();
      const off = b ? [wp[0] - (b[0] + (b[2] - b[0]) * fp[0]), wp[1] - (b[1] + (b[3] - b[1]) * fp[1])] : [0, 0];
      const dip = this.d._hintDip || 0.3;
      g.setWorldPos(tp[0] + off[0], tp[1] + off[1] + dip);
      const y0 = g.y;
      E.tween({ dur: 0.5, owner: this, ease: E.ease.inOutSine, loops: 2, yoyo: true, update: (k) => { g.y = y0 - dip * k; }, done: () => E.after(this.d._hintLoopSeconds || 0.6, loop, this) });
    };
    loop();
  }
  fastForward() { for (const g of this.refs('_showOnTap')) if (g) LF.go(g).setActive(true); for (const g of this.refs('_hideOnTap')) if (g) LF.go(g).setActive(false); LF.invoke(this, this.d._onBegan); LF.invoke(this, this.d._onTapped); LF.invoke(this, this.d._onCompleted); }
}
S('LevelFlow.TapStep', TapStep);

// ------------------------------------------------------------------ PluckStep / PluckPiece
class PluckPiece extends E.Behaviour {
  awake() { this.phase = 0; const g = this.go; this.rest = { x: g.x, y: g.y, rot: g.rot }; }
  get sr() { return (this.d._renderer && this.ref('_renderer')) || this.go.comp('SR'); }
  get collider() { return (this.d._collider && this.ref('_collider')) || LF.collidersIn(this.go)[0]; }
  showOutline(on) { const o = this.d._outline && this.ref('_outline'); if (o) o.go.setActive(on); }
  hit(wx, wy, r) { const c = this.collider; if (c && LF.hitCollider(c, wx, wy, r)) return true; const sr = this.sr; const b = sr && LF.srBounds(sr); return !!(b && wx >= b[0] - r && wx <= b[2] + r && wy >= b[1] - r && wy <= b[3] + r && !c); }
  async free(dir, speed) {
    if (this.phase) return; this.phase = 1;
    const d = this.d, g = this.go;
    this.showOutline(false);
    // tug
    const tug = d._tugSeconds || 0.15, tugD = d._tugDistance || 0.1;
    const n = Math.hypot(dir[0], dir[1]) || 1; const ux = dir[0] / n, uy = dir[1] / n;
    const wp0 = g.worldPos();
    await new Promise((r) => E.tween({ dur: tug, owner: this, update: (k) => { g.setWorldPos(wp0[0] + ux * tugD * k, wp0[1] + uy * tugD * k); g.rot = this.rest.rot + Math.sin(k * 30) * (d._tugTremble || 4); }, done: r, onKill: r }));
    this.phase = 2;
    LF.invoke(this, d._onFree);
    const sr = this.sr; if (sr && d._flightOrder) sr.o = d._flightOrder;
    const wp = g.worldPos();
    if (g.parent && LF.runner) g.setParent(null, true);
    const rng = d._launchSpeedRange || [3, 8];
    const sp = E.clamp((speed || 5) * (d._launchShare || 0.5), rng[0], rng[1]);
    let vx = ux * sp, vy = uy * sp + (d._lift || 3);
    const grav = d._gravity || 18, spin = (d._spin || 360) * (Math.random() < 0.5 ? -1 : 1), sh = d._shrinkTo == null ? 0.6 : d._shrinkTo;
    const s0x = g.sx, s0y = g.sy; let x = wp[0], y = wp[1];
    g.x = x; g.y = y;
    await new Promise((r) => E.tween({ dur: d._flightSeconds || 0.9, owner: this, ease: E.ease.linear, update: (k) => { const dt = E.dt; vy -= grav * dt; x += vx * dt; y += vy * dt; g.x = x; g.y = y; g.rot += spin * dt; const s = 1 + (sh - 1) * k; g.sx = s0x * s; g.sy = s0y * s; if (sr) sr.color[3] = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1; }, done: r, onKill: r }));
    g.setActive(false); this.phase = 3;
  }
}
S('LevelFlow.PluckPiece', PluckPiece);
class PluckStep extends Step {
  async execute() {
    const d = this.d; const pieces = this.refs('_pieces').filter(Boolean);
    for (const p of pieces) { p.go.setActive(true); p.showOutline(true); }
    const tool = d._tool ? this.ref('_tool') : null;
    if (tool) await tool.arrive();
    let last = null, lastT = 0; const t0 = E.time;
    const total = pieces.length; let done = 0; const flights = [];
    const pluck = (p, dir, sp) => {
      if (p.phase) return; done++;
      const clips = d._pluckClips || []; if (clips.length) LF.sound(E.pick(clips), d._volume || 0.6, 1 + (Math.random() - 0.5) * (d._pitchJitter || 0.1));
      flights.push(p.free(dir, sp)); LF.invoke(this, d._onPlucked); this.setProgress(done / total); this._lastProgressTime = E.time;
    };
    let downPt = null, held = null;
    await tick(this, () => {
      this.idleTick();
      let pt = null;
      if (tool) pt = toolTick(tool);
      else if (P.down && !P.overUI) pt = LF.ptrWorld();
      if (P.justDown && !tool) { downPt = LF.downWorld(); if (d._dragOut) held = pieces.find((p) => !p.phase && p.hit(downPt[0], downPt[1], d._tapRadius || 0.3)); }
      if (pt) {
        LF.hideHint();
        if (d._dragOut && held) {
          const dx = pt[0] - downPt[0], dy = pt[1] - downPt[1]; const dist = Math.hypot(dx, dy);
          const share = held.d._stretchShare || 0.3; const mx = Math.min(dist * share, held.d._stretchMax || 0.4);
          const g = held.go; g.x = held.rest.x + (dx / (dist || 1)) * mx; g.y = held.rest.y + (dy / (dist || 1)) * mx;
          if (dist >= (d._breakDistance || 0.8)) { pluck(held, [dx, dy], 6); held = null; }
        } else if (last) {
          const dt = Math.max(1e-3, E.time - lastT); const dist = LF.dist(last, pt); const sp = dist / dt;
          if (sp >= (d._minSwipeSpeed || 2)) {
            const n = Math.max(1, Math.ceil(dist / 0.05));
            for (let i = 0; i <= n; i++) { const k = i / n; const x = last[0] + (pt[0] - last[0]) * k, y = last[1] + (pt[1] - last[1]) * k; for (const p of pieces) if (!p.phase && p.hit(x, y, d._catchRadius || 0.25)) pluck(p, [pt[0] - last[0], pt[1] - last[1]], sp); }
          }
        }
        last = pt; lastT = E.time;
      } else last = null;
      if (P.justUp && downPt && (d._tapPlucks || d._dragOut) && !tool) {
        const up = LF.ptrWorld();
        if (LF.dist(up, downPt) <= (d._tapSlop || 0.3)) {
          const p = pieces.find((q) => !q.phase && q.hit(up[0], up[1], d._tapRadius || 0.3));
          if (p) { const wp = p.go.worldPos(); const out = wp[0] >= 0 ? 1 : -1; const k = d._tapOutward == null ? 0.5 : d._tapOutward; pluck(p, [out * k, 1 - k * 0.5], 6); }
        }
        if (held) { const g = held.go; E.tween({ dur: 0.2, owner: held, update: (kk) => { g.x += (held.rest.x - g.x) * kk; g.y += (held.rest.y - g.y) * kk; } }); held = null; }
        downPt = null;
      }
      if (!P.down && E.time - Math.max(t0, this._lastProgressTime || 0) > 3) {
        const nxt = pieces.find((p) => !p.phase);
        if (nxt) { const wp = nxt.go.worldPos(); const hd = d._hintDirection || [1, 0.5]; const r = d._hintReach || 0.6; LF.showHint(tool ? tool.go.worldPos() : [wp[0] - hd[0] * r, wp[1] - hd[1] * r], tool ? wp : [wp[0] + hd[0] * r, wp[1] + hd[1] * r], tool ? 'drag' : 'swipe'); }
      }
      return done >= total;
    });
    LF.hideHint();
    if (tool) { tool.release(); tool.leave(); }
    await Promise.race([Promise.all(flights), LF.wait(1.2)]);
  }
  fastForward() { for (const p of this.refs('_pieces')) if (p) p.go.setActive(false); LF.invoke(this, this.d._onBegan); LF.invoke(this, this.d._onCompleted); }
}
S('LevelFlow.PluckStep', PluckStep);

// ------------------------------------------------------------------ ClipPluckStep: bring the tool to a reach box, a keyed clip plays
class ClipPluckStep extends Step {
  async execute() {
    const d = this.d; const stages = (d._stages || []).slice();
    const ownTools = stages.some((s) => s.Tool);
    const stageTool = (s) => (s.Tool ? E.resolve(this.go, s.Tool) : this.ref('_tool'));
    const tools = [...new Set(stages.map(stageTool).filter(Boolean))];
    for (const st of stages) for (const o of st.Outlines || []) { const g = LF.go(E.resolve(this.go, o)); if (g) g.setActive(true); }
    await Promise.all(tools.map((t) => t.arrive()));
    const left = new Set(stages);
    let total = stages.length, done = 0; const t0 = E.time;
    while (left.size && this.isRunning) {
      let fired = null, firedTool = null;
      await tick(this, () => {
        this.idleTick();
        for (const t of tools) { if (!t.go.activeInHierarchy) continue; const tip = toolTick(t); if (!tip) continue; for (const st of left) { if (ownTools && stageTool(st) !== t) continue; const reach = st.Reach ? E.resolve(this.go, st.Reach) : null; if (reach && LF.hitCollider(reach, tip[0], tip[1], 0.15)) { fired = st; firedTool = t; return true; } } }
        if (!P.down && E.time - Math.max(t0, this._lastProgressTime || 0) > 3) {
          const st = [...left][0]; const t = stageTool(st); const reach = st.Reach && E.resolve(this.go, st.Reach);
          if (t && reach) LF.showHint(t.go.worldPos(), reach.go.worldPos(), 'drag');
        }
        return false;
      });
      LF.hideHint();
      if (!fired) break;
      left.delete(fired);
      const st = fired; const tool = firedTool;
      for (const o of st.Outlines || []) { const g = LF.go(E.resolve(this.go, o)); if (g) g.setActive(false); }
      const toolPos = tool.tip(); const toolWorld = tool.go.worldPos();
      tool.release(); E.killOwner(tool.go); tool.go.setActive(false); tool.go.x = tool.home.x; tool.go.y = tool.home.y; tool.go.rot = tool.home.rot; tool.go.sx = tool.home.sx; tool.go.sy = tool.home.sy; LF.unboost(tool.go);
      const grp = st.Group ? LF.go(E.resolve(this.go, st.Group)) : null; if (grp) grp.setActive(true);
      const plucks = (st.PluckTimes || []).slice(); let backDone = false;
      const back = st.ToolBackAt;
      const perf = LF.playTracks(this, st.Tracks, { seconds: st.Seconds, toolPos: toolWorld, onTime: (t) => {
        while (plucks.length && t >= plucks[0]) { plucks.shift(); if (st.Sound) LF.sound(st.Sound, d._volume || 0.7); }
        if (d._toolReturnsToCounter && back >= 0 && !backDone && t >= back && left.size) { backDone = true; tool.go.setActive(true); }
      } });
      await perf.done;
      for (const h of st.HideWhenDone || []) { const g = LF.go(E.resolve(this.go, h)); if (g) g.setActive(false); }
      done++; this.setProgress(done / total); this._lastProgressTime = E.time;
      if (left.size && !d._stageTakesToolAway && !(ownTools)) { if (!tool.go.activeSelf) await tool.arrive(); }
      else if (left.size && ownTools) { /* stage tools are separate */ }
    }
    for (const t of tools) if (t.go.activeSelf) t.leave();
  }
  fastForward() { for (const st of this.d._stages || []) { for (const h of st.HideWhenDone || []) { const g = LF.go(E.resolve(this.go, h)); if (g) g.setActive(false); } for (const o of st.Outlines || []) { const g = LF.go(E.resolve(this.go, o)); if (g) g.setActive(false); } } LF.invoke(this, this.d._onBegan); LF.invoke(this, this.d._onCompleted); }
}
S('LevelFlow.ClipPluckStep', ClipPluckStep);

// ------------------------------------------------------------------ CraftingStep: drag pieces into slots
class CraftPiece extends E.Behaviour {
  awake() { const g = this.go; this.home = { x: g.x, y: g.y, rot: g.rot, sx: g.sx, sy: g.sy }; this.homeParentScale = g.parent ? g.parent.lossyScale()[0] : 1; this.homeParentRot = g.parent ? g.parent.worldRot() : 0; this.placed = false; this.locked = false; }
  get pieceId() { return this.d._pieceId; }
  Lock() { this.locked = true; } Unlock() { this.locked = false; }
  SlideIn() { return this.arrive(); }
  async arrive() { const g = this.go; g.setActive(true); if (this.d._slideFromSide) await LF.slideIn(g, this.d._arriveSeconds || 0.6, this.d._slideTilt || 0); }
  canGrab(wx, wy) { if (!this.go.activeInHierarchy || this.placed || this.locked) return false; if (LF.hitGO(this.go, wx, wy, 0.25, false)) return true; const b = LF.bounds(this.go); return !!(b && wx >= b[0] - 0.15 && wx <= b[2] + 0.15 && wy >= b[1] - 0.15 && wy <= b[3] + 0.15); }
  pick() {
    const d = this.d, g = this.go; E.killOwner(g); this.held = true;
    if (d._promoteSorting) LF.boost(g, d._heldSortingBoost || 50);
    const s = d._holdAtPlacedScale ? (d._placedScale || 1) : (d._grabScale || 1);
    const fx = g.sx, fy = g.sy; E.tween({ dur: d._growSeconds || 0.15, owner: g, update: (k) => { g.sx = fx + (this.home.sx * s - fx) * k; g.sy = fy + (this.home.sy * s - fy) * k; } });
    const cl = d._carriedLook && this.ref('_carriedLook'); const own = g.comp('SR');
    if (cl) { cl.go.setActive(true); const a0 = own ? own.color[3] : 1; cl.color[3] = 0; E.tween({ dur: d._growSeconds || 0.2, owner: g, update: (k) => { cl.color[3] = k; if (own && own !== cl) own.color[3] = a0 * (1 - k); } }); }
    LF.invoke(this, d._onPickedUp);
  }
  follow(dt) {
    const d = this.d, g = this.go; const w = LF.ptrWorld(); const go = d._grabOffset || [0, 0.5];
    let tx = w[0] + go[0], ty = w[1] + go[1];
    const cur = g.worldPos();
    if (d._lockX) tx = cur[0];
    if (d._clampLowestY) ty = Math.max(ty, d._lowestY);
    const k = 1 - Math.exp(-(d._followSpeed || 20) * dt);
    g.setWorldPos(cur[0] + (tx - cur[0]) * k, cur[1] + (ty - cur[1]) * k);
  }
  async place(slot) {
    // PlaceInto: the piece becomes a child of the slot (world pose kept), then travels to the anchor and its placed size
    const d = this.d, g = this.go; this.held = false; this.placed = true;
    LF.unboost(g);
    if (d._placedSortingOrder >= 0) for (const s of LF.srs(g)) { if (s === g.comp('SR')) s.o = d._placedSortingOrder; }
    const a = slot.anchorPos();
    g.setParent(slot.go, true);
    const pm = M.inv(slot.go.worldMatrix()); const l = M.ap(pm, a[0], a[1]);
    const ls = slot.go.lossyScale(); const ps = d._placedScale || 1;
    const tsx = this.home.sx * ps * (this.homeParentScale || 1) / (ls[0] || 1), tsy = this.home.sy * ps * (this.homeParentScale || 1) / (ls[1] || 1);
    const pr = slot.go.worldRot(); g.rot -= pr; const tr = this.home.rot + (this.homeParentRot || 0) - pr;
    g.sx *= (this.homeParentScale || 1) / (ls[0] || 1); g.sy *= (this.homeParentScale || 1) / (ls[1] || 1);
    const fx = g.x, fy = g.y, fr = g.rot, fsx = g.sx, fsy = g.sy;
    for (const c of LF.colliders(g)) c.enabled = false;
    await new Promise((r) => E.tween({ dur: d._snapSeconds || 0.3, owner: g, ease: LF.ease(d._snapEase || 27), update: (k) => { g.x = fx + (l[0] - fx) * k; g.y = fy + (l[1] - fy) * k; g.rot = fr + (tr - fr) * k; g.sx = fsx + (tsx - fsx) * k; g.sy = fsy + (tsy - fsy) * k; }, done: r, onKill: r }));
    LF.invoke(this, d._onPlaced);
  }
  goBack() {
    const d = this.d, g = this.go, h = this.home; this.held = false; LF.unboost(g);
    const cl = d._carriedLook && this.ref('_carriedLook'); if (cl) cl.go.setActive(false); const own = g.comp('SR'); if (own && own !== cl) own.color[3] = 1;
    const fx = g.x, fy = g.y, fr = g.rot, fsx = g.sx, fsy = g.sy;
    E.tween({ dur: d._returnSeconds || 0.3, owner: g, update: (k) => { g.x = fx + (h.x - fx) * k; g.y = fy + (h.y - fy) * k; g.rot = fr + (h.rot - fr) * k; g.sx = fsx + (h.sx - fsx) * k; g.sy = fsy + (h.sy - fsy) * k; } });
    LF.invoke(this, d._onRejected);
  }
}
S('LevelFlow.CraftPiece', CraftPiece);
class CraftSlot extends E.Behaviour {
  awake() { this.filled = false; const gh = this.d._ghost && this.ref('_ghost'); if (gh) LF.go(gh).setActive(false); }
  anchorGO() { return (this.d._anchor && LF.go(this.ref('_anchor'))) || this.go; }
  anchorPos() { return this.anchorGO().worldPos(); }
  accepts(p) { return !this.filled && (this.d._acceptsAnyPiece || this.d._acceptsPieceId === p.pieceId); }
  reached(p) {
    const wp = p.go.worldPos(); if (LF.dist(wp, this.anchorPos()) <= (this.d._snapRadius || 1)) return true;
    const ra = this.d._reachArea && this.ref('_reachArea'); if (ra && ra.go.activeInHierarchy && LF.hitCollider(ra, wp[0], wp[1], this.d._reachMargin || 0.2)) return true;
    return false;
  }
  ghost(on) { const gh = this.d._ghost && this.ref('_ghost'); if (gh) LF.go(gh).setActive(on); }
  fill() { this.filled = true; this.ghost(false); const fv = this.d._filledVisual && this.ref('_filledVisual'); if (fv) LF.go(fv).setActive(true); LF.invoke(this, this.d._onFilled); }
}
S('LevelFlow.CraftSlot', CraftSlot);
class CraftingStep extends Step {
  async execute() {
    const d = this.d; const pieces = this.refs('_pieces').filter(Boolean); const slots = this.refs('_slots').filter(Boolean);
    await Promise.all(pieces.map((p) => (p.go.activeSelf && !p.d._slideFromSide ? null : p.arrive())));
    const req = slots.filter((s) => s.d._required !== false);
    const total = req.length || 1; let held = null; const t0 = E.time;
    await tick(this, () => {
      this.idleTick();
      if (!held && P.justDown && !LF.ptrOverUI()) { const w = LF.downWorld(); held = pieces.find((p) => p.canGrab(w[0], w[1])) || null; if (held) { held.pick(); LF.hideHint(); if (d._highlightTargetSlot !== false) for (const s of slots) if (s.accepts(held)) s.ghost(true); } }
      if (held) {
        held.follow(E.dt);
        const slot = slots.find((s) => s.accepts(held) && s.reached(held));
        if (slot && (d._placeOnReach || !P.down)) {
          const p = held; held = null; for (const s of slots) s.ghost(false);
          slot.fill(); p.place(slot); LF.invoke(this, d._onPiecePlaced); this.setExpression(d._expressionOnGoodDrop);
          this.setProgress(req.filter((s) => s.filled).length / total); this._lastProgressTime = E.time;
        } else if (!P.down) {
          const p = held; held = null; for (const s of slots) s.ghost(false);
          if (d._returnOnMiss !== false) p.goBack(); LF.invoke(this, d._onPieceRejected);
        }
      } else if (!P.down && E.time - Math.max(t0, this._lastProgressTime || 0) > 3) {
        const p = pieces.find((q) => !q.placed && q.go.activeInHierarchy); const s = p && slots.find((q) => q.accepts(p));
        if (p && s) LF.showHint(p.go.worldPos(), s.anchorPos(), 'drag');
      }
      return req.every((s) => s.filled);
    });
    LF.hideHint();
    await LF.wait(0.35);
  }
  fastForward() {
    const pieces = this.refs('_pieces').filter(Boolean); const slots = this.refs('_slots').filter(Boolean);
    for (const s of slots) { const p = pieces.find((q) => !q.placed && s.accepts(q)); if (!p) continue; p.go.setActive(true); s.filled = true; p.placed = true; const a = s.anchorPos(); p.go.setParent(s.go, true); p.go.setWorldPos(a[0], a[1]); const ps = p.d._placedScale || 1; const ls = s.go.lossyScale(); p.go.sx = p.home.sx * ps * p.homeParentScale / (ls[0] || 1); p.go.sy = p.home.sy * ps * p.homeParentScale / (ls[1] || 1); for (const c of LF.colliders(p.go)) c.enabled = false; if (p.d._placedSortingOrder >= 0) { const sr = p.go.comp('SR'); if (sr) sr.o = p.d._placedSortingOrder; } const fv = s.d._filledVisual && s.ref('_filledVisual'); if (fv) LF.go(fv).setActive(true); LF.invoke(s, s.d._onFilled); LF.invoke(p, p.d._onPlaced); }
    LF.invoke(this, this.d._onBegan); LF.invoke(this, this.d._onCompleted);
  }
}
S('LevelFlow.CraftingStep', CraftingStep);

// ------------------------------------------------------------------ choices
class ChoiceMemory extends E.Behaviour {
  awake() { this.chosen = this.d._default || 0; this.hasChoice = false; }
  get Chosen() { return this.chosen; }
  choose(i) { this.chosen = i; this.hasChoice = true; LF.invoke(this, this.d._onChosen, i); }
}
S('LevelFlow.ChoiceMemory', ChoiceMemory);
class ChoiceLock extends E.Behaviour {
  awake() { this.locked = new Set(this.d._lockedOptions || []); this.refresh(); }
  isLocked(i) { return this.locked.has(i); }
  Unlock(i) { this.locked.delete(i); this.refresh(); }
  refresh() { (this.d._badges || []).forEach((b, i) => { const g = b && LF.go(E.resolve(this.go, b)); if (g) g.setActive(this.locked.has(i)); }); }
  request(i) { LF.invoke(this, this.d._onUnlockRequested, i); if (LF.onUnlockRequested) return LF.onUnlockRequested(this, i); this.Unlock(i); return Promise.resolve(true); }
}
S('LevelFlow.ChoiceLock', ChoiceLock);
S('RewardedChoiceUnlocker', class extends E.Behaviour {});
class ChosenObject extends E.Behaviour {
  Apply(i) {
    const opts = this.refs('_options'); opts.forEach((o, k) => { const g = LF.go(o); if (g) g.setActive(k === i); });
    const g = LF.go(opts[i]); if (g && this.d._popSeconds) { const sx = g.sx, sy = g.sy, f = this.d._popFrom == null ? 0.6 : this.d._popFrom; g.sx = sx * f; g.sy = sy * f; E.tween({ dur: this.d._popSeconds, owner: g, ease: E.ease.outBack, update: (k) => { g.sx = sx * (f + (1 - f) * k); g.sy = sy * (f + (1 - f) * k); } }); }
    for (const ps of this.refs('_sparkles')) if (ps) E.particles.play(ps);
  }
}
S('LevelFlow.ChosenObject', ChosenObject);
class ChosenSprite extends E.Behaviour {
  start() { const mem = this.ref('_memory'); if (mem) { this.apply(mem.chosen); LF.on(mem.d._onChosen || (mem.d._onChosen = {}), (i) => this.apply(i)); } }
  onEnable() { const mem = this.ref('_memory'); if (mem) this.apply(mem.chosen); }
  apply(i) { const sp = (this.d._options || [])[i]; const sr = this.go.comp('SR'); if (sr && sp) sr.sp = sp; }
}
S('LevelFlow.ChosenSprite', ChosenSprite);
class ChoiceStep extends Step {
  async execute() {
    const d = this.d; const opts = this.refs('_options').map(LF.go).filter(Boolean);
    const lock = d._lock ? this.ref('_lock') : null; const mem = d._memory ? this.ref('_memory') : null;
    const marks = (d._selectedMarks || []).map((m) => LF.go(E.resolve(this.go, m)));
    for (const m of marks) if (m) m.setActive(false);
    // arrive
    const homes = opts.map((g) => ({ x: g.x, y: g.y, sx: g.sx, sy: g.sy }));
    opts.forEach((g, i) => { if (g.parent) g.parent.setActive(true); g.setActive(true); g.sx = 0; g.sy = 0; E.tween({ dur: d._arriveSeconds || 0.5, delay: i * (d._arriveStagger || 0.1), owner: g, ease: E.ease.outBack, update: (k) => { g.sx = homes[i].sx * k; g.sy = homes[i].sy * k; } }); });
    if (d._arriveClip) LF.sound(d._arriveClip, d._arriveVolume || 0.3);
    await LF.wait((d._arriveSeconds || 0.5) + opts.length * (d._arriveStagger || 0.1));
    const breathe = E.tween({ dur: 1e9, owner: this, update: () => { opts.forEach((g, i) => { if (g._lfPicked) return; const s = 1 + Math.sin(E.time * 3 + i) * (d._breathe || 0.02); g.sx = homes[i].sx * s; g.sy = homes[i].sy * s; }); } });
    let chosen = -1; let deaf = 0; const t0 = E.time;
    const pickAt = (w) => { for (let i = 0; i < opts.length; i++) if (LF.hitGO(opts[i], w[0], w[1], d._touchSlop || 0.15)) return i; return -1; };
    let nextShown = false; const next = d._next ? LF.go(this.ref('_next')) : null;
    await tick(this, () => {
      if (E.time < deaf) return false;
      const w = grabbedAt();
      if (!w) { if (E.time - t0 > 4 && chosen < 0 && !P.down) LF.showHint(null, opts[0] ? opts[0].worldPos() : [0, 0], 'tap'); return false; }
      LF.hideHint();
      if (d._tryOn && nextShown && next && LF.hitGO(next, w[0], w[1], 0.15)) { LF.invoke(this, d._onNext); return true; }
      const i = pickAt(w); if (i < 0) return false;
      if (lock && lock.isLocked(i)) { deaf = E.time + (lock.d._deafSeconds || 0.5); lock.request(i).then((ok) => { if (ok) this.pick(i, opts, homes, marks, mem); }); if (!d._tryOn) chosen = -2; return false; }
      chosen = i; this.pick(i, opts, homes, marks, mem);
      if (d._tryOn) { if (!nextShown && next) { nextShown = true; next.setActive(true); E.punchScale(next, 0.2, d._nextPopSeconds || 0.35); } return false; }
      return true;
    });
    if (chosen === -2) await LF.until(() => this._picked != null);
    E.kill(breathe);
    if (next) next.setActive(false);
    await LF.wait((d._hopSeconds || 0.4) + (d._holdSeconds || 0.4));
    // leave: every option slides off (the chosen one only with chosenLeaves)
    const ci = this._picked;
    await Promise.all(opts.map((g, i) => (i !== ci || d._chosenLeaves ? LF.slideOut(g, d._chosenLeaveSeconds || 0.4, 0) : null)));
  }
  pick(i, opts, homes, marks, mem) {
    const d = this.d; this._picked = i;
    const g = opts[i]; g._lfPicked = true;
    if (d._chooseClip) LF.sound(d._chooseClip, d._chooseVolume || 0.6);
    const burst = d._burst && this.ref('_burst'); if (burst) { const wp = g.worldPos(); burst.go.setWorldPos(wp[0], wp[1]); E.particles.play(burst); for (const c of burst.go.compsInChildren('PS')) E.particles.play(c); }
    const mk = marks[i]; if (mk) { marks.forEach((m) => m && m.setActive(false)); mk.setActive(true); E.punchScale(mk, 0.25, d._markSeconds || 0.3); }
    const y0 = homes[i].y, hh = d._hopHeight || 0.2;
    E.tween({ dur: d._hopSeconds || 0.4, owner: g, update: (k) => { g.y = y0 + Math.sin(k * Math.PI) * hh; } });
    if (mem) mem.choose(i);
    LF.invoke(this, d._onChosen, i);
    this.setProgress(1);
  }
  fastForward() { const mem = this.d._memory ? this.ref('_memory') : null; const i = mem ? mem.chosen : 0; if (mem) mem.choose(i); LF.invoke(this, this.d._onBegan); LF.invoke(this, this.d._onChosen, i); LF.invoke(this, this.d._onCompleted); for (const o of this.refs('_options')) { const g = LF.go(o); if (g) g.setActive(false); } }
}
S('LevelFlow.ChoiceStep', ChoiceStep);

// a dress look: garments fly from the card onto her (simplified to pop/fade swaps)
class DressUpCharacter extends E.Behaviour {
  awake() { this.current = -1; }
  lookParts(look) { if (!look) return []; const out = []; for (const k in look) { const v = look[k]; if (Array.isArray(v)) for (const x of v) { const r = x && (typeof x === 'string' ? E.resolve(this.go, x) : x.Part || x.Target || x.Renderer ? E.resolve(this.go, x.Part || x.Target || x.Renderer) : null); const g = LF.go(r); if (g) out.push(g); } else if (typeof v === 'string' && v.includes(':')) { const g = LF.go(E.resolve(this.go, v)); if (g) out.push(g); } } return out; }
  wear(i, fromW) {
    const d = this.d; const looks = d._looks || [];
    const cur = this.current < 0 ? d._arrivalLook : looks[this.current];
    const nxt = looks[i]; if (!nxt) return;
    for (const g of this.lookParts(cur)) { const sr = g.comp('SR'); if (sr) E.tween({ dur: 0.25, owner: g, update: (k) => { sr.color[3] = 1 - k; }, done: () => { g.setActive(false); sr.color[3] = 1; } }); else g.setActive(false); }
    for (const g of this.lookParts(nxt)) {
      g.setActive(true); const sx = g.sx, sy = g.sy; const sr = g.comp('SR');
      if (fromW && sr) { const home = [g.x, g.y]; const wp = g.worldPos(); const l = g.parent ? M.ap(M.inv(g.parent.worldMatrix()), fromW[0], fromW[1]) : fromW; const sc = d._garmentStartScale || 0.3; void wp;
        E.tween({ dur: d._garmentSeconds || 0.45, owner: g, ease: E.ease.outQuad, update: (k) => { g.x = l[0] + (home[0] - l[0]) * k; g.y = l[1] + (home[1] - l[1]) * k + Math.sin(k * Math.PI) * (d._arcHeight || 0.6); const s = sc + (1 - sc) * k; g.sx = sx * s; g.sy = sy * s; } });
      } else { g.sx = sx * 0.6; g.sy = sy * 0.6; E.tween({ dur: d._popSeconds || 0.3, owner: g, ease: E.ease.outBack, update: (k) => { g.sx = sx * (0.6 + 0.4 * k); g.sy = sy * (0.6 + 0.4 * k); } }); }
    }
    this.current = i;
    const ls = d._landSparkle && this.ref('_landSparkle'); if (ls) E.after(d._garmentSeconds || 0.45, () => E.particles.play(ls), this);
    const b = d._bounce && LF.go(this.ref('_bounce')); if (b) E.after(d._celebrateDelay || 0.3, () => E.punchScale(b, d._bounceAmount || 0.06, d._bounceSeconds || 0.4), this);
  }
  update() { const br = this.d._breath && LF.go(this.ref('_breath')); if (br) { if (br._sy0 == null) br._sy0 = br.sy; br.sy = br._sy0 * (1 + Math.sin(E.time * Math.PI * 2 / (this.d._breathSeconds || 3)) * (this.d._breathAmount || 0.01)); } }
}
S('LevelFlow.DressUpCharacter', DressUpCharacter);
class ChoiceWear extends E.Behaviour {
  Wear(i) { const ch = this.ref('_character'); const from = this.refs('_from')[i]; if (ch) ch.wear(i, from ? LF.wpos(from) : null); }
}
S('LevelFlow.ChoiceWear', ChoiceWear);

// ------------------------------------------------------------------ PeelStep: drag the sheet off her face
class PeelSheet extends E.Behaviour {
  LayOn() { const src = this.ref('_source'); if (src) { src.go.setActive(true); const sx = src.go.sx; src.go.sx = sx * 1.2; src.color[3] = 0; E.tween({ dur: this.d._layOnSeconds || 0.5, owner: this, update: (k) => { src.color[3] = k; src.go.sx = sx * (1.2 - 0.2 * k); } }); } }
}
S('LevelFlow.PeelSheet', PeelSheet);
class PeelStep extends Step {
  async execute() {
    const d = this.d; const sheet = this.ref('_sheet'); const src = sheet && sheet.ref('_source'); if (!src) return;
    const g = src.go; g.setActive(true);
    const home = { x: g.x, y: g.y, rot: g.rot };
    const b0 = LF.srBounds(src); const depth = b0 ? Math.max(b0[2] - b0[0], b0[3] - b0[1]) : 2;
    const margin = sheet.d._grabMargin || 0.3; let held = null; let lifted = 0; const t0 = E.time;
    const inside = (w) => { const b = LF.srBounds(src); return b && w[0] >= b[0] - margin && w[0] <= b[2] + margin && w[1] >= b[1] - margin && w[1] <= b[3] + margin; };
    let tapped = false, downAt = null;
    await tick(this, () => {
      if (P.justDown && !LF.ptrOverUI()) { const w = LF.downWorld(); if (inside(w)) { held = w; downAt = E.time; LF.hideHint(); } }
      if (held && P.down) {
        const w = LF.ptrWorld(); const dx = w[0] - held[0], dy = w[1] - held[1]; const dist = Math.hypot(dx, dy);
        lifted = Math.min(1, dist / (depth * (sheet.d._comeAwayAt || 0.6)));
        const l = g.parent ? M.ap(M.inv(g.parent.worldMatrix()), 0, 0) : [0, 0]; void l;
        g.x = home.x + dx * 0.35; g.y = home.y + dy * 0.35; g.rot = home.rot + E.clamp(dx * 8, -20, 20);
        this.setProgress(lifted * 0.9); this._lastProgressTime = E.time;
        if (lifted >= 1) return true;
      } else if (held && !P.down) {
        if (d._comeAwayOnTap && E.time - downAt < 0.3) { tapped = true; return true; }
        held = null; const fx = g.x, fy = g.y, fr = g.rot; E.tween({ dur: sheet.d._layBackSeconds || 0.25, owner: g, update: (k) => { g.x = fx + (home.x - fx) * k; g.y = fy + (home.y - fy) * k; g.rot = fr + (home.rot - fr) * k; } });
      }
      if (!held && E.time - Math.max(t0, this._lastProgressTime || 0) > 3 && b0) LF.showHint([b0[0] + 0.2, b0[1] + 0.2], [b0[0] - 1, b0[1] - 1.2], 'drag');
      return false;
    });
    LF.hideHint();
    if (tapped && d._tapAwayClip) LF.sound(d._tapAwayClip, 0.6);
    if (sheet.d._comeAwayClip) LF.sound(sheet.d._comeAwayClip, sheet.d._comeAwayVolume || 0.6);
    LF.invoke(sheet, sheet.d._onCameAway); this.setExpression(d._expressionOnCameAway);
    const fx = g.x, fy = g.y, fr = g.rot; const dir = g.x >= home.x ? 1 : -1; const dist = sheet.d._throwDistance || 6;
    if (LF.skinPress && b0) LF.skinPress.jiggle([(b0[0] + b0[2]) / 2, (b0[1] + b0[3]) / 2], depth * 0.6, [dir * 0.1, 0.06], 0.12);
    await new Promise((r) => E.tween({ dur: sheet.d._throwSeconds || 0.5, owner: g, ease: E.ease.inQuad, update: (k) => { g.x = fx + dir * dist * k; g.y = fy + dist * 0.4 * k; g.rot = fr + dir * (sheet.d._throwSpin || 90) * k; }, done: r, onKill: r }));
    g.setActive(false); g.x = home.x; g.y = home.y; g.rot = home.rot;
  }
  fastForward() { const sheet = this.ref('_sheet'); const src = sheet && sheet.ref('_source'); if (src) src.go.setActive(false); LF.invoke(this, this.d._onBegan); if (sheet) LF.invoke(sheet, sheet.d._onCameAway); LF.invoke(this, this.d._onCompleted); }
}
S('LevelFlow.PeelStep', PeelStep);

// ------------------------------------------------------------------ PourStep / PourVessel / LiquidStream
class PourVessel extends E.Behaviour {
  awake() { const g = this.go; this.home = { x: g.x, y: g.y, rot: g.rot, sx: g.sx, sy: g.sy }; this.amount = this.d._startsFull ? 1 : 0; const heap = this.d._heap && LF.go(this.ref('_heap')); if (heap && !this.d._startsFull) heap.setActive(false); }
  mouth() { const m = this.d._mouth && LF.go(this.ref('_mouth')); return (m || this.go).worldPos(); }
  async arrive() { const g = this.go; g.setActive(true); if (this.d._slideFromSide) await LF.slideIn(g, this.d._arriveSeconds || 0.6, this.d._slideTilt || 0); if (this.d._arriveClip) LF.sound(this.d._arriveClip, this.d._arriveVolume || 0.4); }
  canGrab(w, slop) { return LF.hitGO(this.go, w[0], w[1], slop || 0.3) || (() => { const b = LF.bounds(this.go); return !!(b && w[0] >= b[0] - 0.2 && w[0] <= b[2] + 0.2 && w[1] >= b[1] - 0.2 && w[1] <= b[3] + 0.2); })(); }
  pick() { const g = this.go, d = this.d; E.killOwner(g); if (d._promoteSorting) LF.boost(g, d._heldSortingBoost || 50); if (d._pickUpClip) LF.sound(d._pickUpClip, d._pickUpVolume || 0.5); LF.invoke(this, d._onPickedUp); const gs = d._grabScale || 1, fx = g.sx, fy = g.sy; E.tween({ dur: d._grabSeconds || 0.15, owner: g, update: (k) => { g.sx = fx + (this.home.sx * gs - fx) * k; g.sy = fy + (this.home.sy * gs - fy) * k; } }); }
  carryTo(tx, ty, dt, angle) { const g = this.go; const cur = g.worldPos(); const k = 1 - Math.exp(-(this.d._followSpeed || 18) * dt); g.setWorldPos(cur[0] + (tx - cur[0]) * k, cur[1] + (ty - cur[1]) * k); g.rot = LF.damp(g.rot, this.home.rot + (this.d._heldAngle || 0) + (angle || 0), this.d._tiltSharpness || 8, dt); }
  goHome() { const g = this.go, h = this.home; LF.unboost(g); const fx = g.x, fy = g.y, fr = g.rot, fsx = g.sx, fsy = g.sy; return new Promise((r) => E.tween({ dur: this.d._returnSeconds || 0.3, owner: g, update: (k) => { g.x = fx + (h.x - fx) * k; g.y = fy + (h.y - fy) * k; g.rot = fr + (h.rot - fr) * k; g.sx = fsx + (h.sx - fsx) * k; g.sy = fsy + (h.sy - fsy) * k; }, done: r, onKill: r })); }
  scoop() { this.amount = 1; const heap = this.d._heap && LF.go(this.ref('_heap')); if (heap) { heap.setActive(true); E.punchScale(heap, 0.3, this.d._heapPopSeconds || 0.3); } if (this.d._scoopClip) LF.sound(this.d._scoopClip, this.d._scoopVolume || 0.5); LF.invoke(this, this.d._onScooped); }
  setLevel() { const liq = this.d._liquid && this.ref('_liquid'); if (liq && liq.setLevel) liq.setLevel(this.amount); const heap = this.d._heap && LF.go(this.ref('_heap')); if (heap && heap.activeSelf) { if (heap._s0 == null) heap._s0 = heap.sx; heap.sx = heap.sy = heap._s0 * Math.max(0.05, this.amount); } }
  pouring(on, toW) {
    const st = this.d._stream && this.ref('_stream'); if (st && st.set) st.set(on, this.mouth(), toW, this.amount);
    const pp = this.d._pourParticles && this.ref('_pourParticles'); if (pp) { if (on && !this._pp) E.particles.play(pp); else if (!on && this._pp) E.particles.stop(pp); }
    this._pp = on;
    if (on && !this._loop && this.d._pourLoop) { const a = E.D.audio[this.d._pourLoop]; if (a) this._loop = E.audio.play(a[0], { loop: true, vol: this.d._pourVolume || 0.5 }); LF.invoke(this, this.d._onPourStarted); }
    if (!on && this._loop) { this._loop.stop(); this._loop = null; LF.invoke(this, this.d._onPourStopped); }
  }
}
S('LevelFlow.PourVessel', PourVessel);
class LiquidStream extends E.Behaviour {
  awake() { this.on = false; }
  set(on, from, to) { this.on = on; this.from = from; this.to = to; this.go.setActive(true); }
  drawWorld(ctx, alpha) {
    if (!this.on || !this.from || !this.to) return;
    E.setT(E._cm);
    const sr = this.go.comp('SR'); const col = sr ? sr.color : [0.8, 0.9, 1, 0.8];
    ctx.strokeStyle = E.colorStr(col, (col[3] || 0.8) * alpha); ctx.lineWidth = this.d._width || 0.12; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(this.from[0], this.from[1]); ctx.quadraticCurveTo(this.from[0], (this.from[1] + this.to[1]) / 2, this.to[0], this.to[1]); ctx.stroke();
  }
  get sortOrder() { return 200; }
}
S('LevelFlow.LiquidStream', LiquidStream);
class PourStep extends Step {
  async execute() {
    const d = this.d; const v = this.ref('_vessel'); if (!v) return;
    await v.arrive();
    const target = LF.go(this.ref('_target')); const landing = (d._landing && LF.go(this.ref('_landing'))) || target;
    const source = d._source ? LF.go(this.ref('_source')) : null;
    const dock = () => { const t = target.worldPos(); return [t[0], t[1] + (d._dockHeight || 1)]; };
    const scoopShare = source ? (d._scoopShare || 0.3) : 0;
    const ghost = d._dockGhost && LF.go(this.ref('_dockGhost'));
    let held = false, docked = false, poured = 0; const pourS = d._pourSeconds || 2.5; const t0 = E.time;
    const auto = !!d._autoPlay;
    if (auto) await LF.wait(d._autoStartDelay || 0.4);
    let autoPhase = 0, autoT = 0;
    await tick(this, () => {
      const dt = E.dt;
      if (auto) {
        if (!held) { held = true; v.pick(); }
        autoT += dt; const cs = d._autoCarrySeconds || 0.8;
        if (source && v.amount <= 0 && autoPhase === 0) { const s = source.worldPos(); v.carryTo(s[0], s[1] + 0.2, dt); if (autoT > cs) { v.scoop(); autoPhase = 1; autoT = 0; this.setProgress(scoopShare); } }
        else { const p = dock(); v.carryTo(p[0], p[1], dt, docked ? v.d._pourAngle || -60 : 0); if (autoT > cs) docked = true; }
      } else {
        if (!held && P.justDown && !LF.ptrOverUI()) { const w = LF.downWorld(); if (v.canGrab(w, d._touchSlop)) { held = true; v.pick(); LF.hideHint(); } }
        if (held && !P.down && !(docked && d._lockWhilePouring)) { held = false; docked = false; v.pouring(false); v.goHome(); if (ghost) ghost.setActive(false); }
        if (held) {
          const w = LF.ptrWorld(); const go = v.d._grabOffset || [0, 0.5];
          if (source && v.amount <= 0) { const s = source.worldPos(); if (LF.dist(v.mouth(), s) < (d._sourceRadius || 0.8)) { v.scoop(); this.setProgress(scoopShare); } }
          const p = dock();
          if (v.amount > 0) { if (ghost && !docked) ghost.setActive(true); if (!docked && LF.dist(v.mouth(), p) < (d._captureRadius || 1)) { docked = true; if (ghost) ghost.setActive(false); } else if (docked && !d._lockWhilePouring && LF.dist([w[0] + go[0], w[1] + go[1]], p) > (d._releaseRadius || 1.6)) docked = false; }
          if (docked) { const m = v.mouth(), gp = v.go.worldPos(); v.carryTo(p[0] - (m[0] - gp[0]), p[1] - (m[1] - gp[1]), dt, v.d._pourAngle || -60); }
          else v.carryTo(w[0] + go[0], w[1] + go[1], dt, 0);
        }
      }
      if (docked && v.amount > 0) {
        poured += dt / pourS; v.amount = Math.max(0, 1 - poured); v.setLevel(); v.pouring(true, landing.worldPos());
        this.setProgress(scoopShare + (1 - scoopShare) * Math.min(1, poured)); this._lastProgressTime = E.time;
      } else v.pouring(false);
      if (!held && !auto && E.time - Math.max(t0, this._lastProgressTime || 0) > 3) LF.showHint(v.go.worldPos(), source && v.amount <= 0 ? source.worldPos() : dock(), 'drag');
      return poured >= 1;
    });
    v.pouring(false); LF.hideHint(); if (ghost) ghost.setActive(false);
    LF.invoke(v, v.d._onEmptied);
    if (d._leaveWhenDone) await LF.slideOut(v.go, v.d._leaveSeconds || 0.5, v.d._slideTilt || 0); else await v.goHome();
  }
}
S('LevelFlow.PourStep', PourStep);

// ------------------------------------------------------------------ OutfitChoiceStep (UI cards)
class OutfitCard extends E.Behaviour {}
S('LevelFlow.OutfitCard', OutfitCard);
class OutfitChoiceStep extends Step {
  async execute() {
    const d = this.d; const ch = this.ref('_character'); const cards = this.refs('_cards').filter(Boolean);
    const tray = d._tray && this.ref('_tray'); if (tray) { tray.go.setActive(true); if (tray.show) tray.show(); }
    await LF.wait(d._cardsDelaySeconds || 0.2);
    cards.forEach((c, i) => { const g = c.go; g.setActive(true); g.sx = g.sy = 0; E.tween({ dur: 0.35, delay: i * (d._cardStaggerSeconds || 0.08), owner: g, ease: E.ease.outBack, update: (k) => { g.sx = g.sy = k; } }); });
    const lock = d._lock && this.ref('_lock');
    const done = d._done && this.ref('_done'); const dm = d._doneMotion && this.ref('_doneMotion');
    let chosen = -1, finished = false, firstAt = 0;
    for (const c of cards) c.onPointerClick = () => {};
    const tap = async (i) => {
      if (finished) return;
      if (lock && lock.isLocked(i)) { const ok = await lock.request(i); if (!ok) return; }
      chosen = i; if (!firstAt) firstAt = E.time;
      cards.forEach((c, k) => { const ring = c.d._ring && c.ref('_ring'); if (ring && ring.go) ring.go.setActive(k === i); });
      const sp = d._cardSparkle && this.ref('_cardSparkle'); if (sp) E.particles.play(sp);
      E.punchScale(cards[i].go, 0.12, 0.3);
      if (ch) ch.wear(i, null);
      LF.invoke(this, d._onLookChanged); LF.invoke(this, d._onLookChosen, i);
      this.setProgress(0.6);
    };
    cards.forEach((c, i) => { c.onPointerClick = () => tap(i); });
    if (done) done.onClick = () => { finished = true; };
    await tick(this, () => {
      if (chosen >= 0 && d._settleOnFirstChoice && E.time - firstAt > (d._firstChoiceHoldSeconds || 1.2)) return true;
      if (chosen >= 0 && !d._settleOnFirstChoice && done && !done.go.activeSelf && E.time - firstAt > (d._doneAfterSeconds || 0.8)) { done.go.setActive(true); if (dm && dm.show) dm.show(); }
      return finished;
    });
    LF.invoke(this, d._onDone);
    for (const c of cards) c.onPointerClick = null;
    if (tray && tray.hide) await tray.hide(); else if (tray) tray.go.setActive(false);
    if (done) done.go.setActive(false);
  }
}
S('LevelFlow.OutfitChoiceStep', OutfitChoiceStep);

// ------------------------------------------------------------------ VineCutStep: hold the blades on each piece
class VineCutStep extends Step {
  async execute() {
    const d = this.d; const pieces = this.refs('_pieces').filter(Boolean); const tool = this.ref('_tool');
    if (tool) await tool.arrive();
    const fx = d._cutEffect && LF.go(this.ref('_cutEffect'));
    const cut = new Map(); let done = 0; const t0 = E.time;
    await tick(this, () => {
      const tip = toolTick(tool); let on = null;
      if (tip) for (const p of pieces) { if (cut.get(p) === -1) continue; const b = LF.srBounds(p); const r = d._cutRadius || 0.3; if (b && tip[0] >= b[0] - r && tip[0] <= b[2] + r && tip[1] >= b[1] - r && tip[1] <= b[3] + r) { on = p; break; } }
      if (fx) fx.setActive(!!on);
      if (on) {
        const t = (cut.get(on) || 0) + E.dt; cut.set(on, t); this._lastProgressTime = E.time;
        if (t >= (d._cutSeconds || 0.6)) { cut.set(on, -1); done++; this.fall(on); this.setProgress(done / pieces.length); if (d._cutClip) LF.sound(d._cutClip, d._cutVolume || 0.6); LF.invoke(this, d._onCut); }
      }
      if (!tool.held && E.time - Math.max(t0, this._lastProgressTime || 0) > 3) { const p = pieces.find((q) => cut.get(q) !== -1); if (p) LF.showHint(tool.go.worldPos(), p.go.worldPos(), 'drag'); }
      return done >= pieces.length;
    });
    if (fx) fx.setActive(false); LF.hideHint();
    if (tool) { tool.release(); tool.leave(); }
  }
  fall(sr) {
    const g = sr.go; const fp = this.d._fallParent && LF.go(this.ref('_fallParent')); g.setParent(fp || null, true);
    const y0 = g.y, r0 = g.rot, dist = this.d._fallDistance || 6, deg = (this.d._fallDegrees || 60) * (Math.random() < 0.5 ? -1 : 1);
    E.tween({ dur: this.d._fallSeconds || 0.8, owner: g, ease: E.ease.inQuad, update: (k) => { g.y = y0 - dist * k; g.rot = r0 + deg * k; sr.color[3] = 1 - Math.max(0, k - 0.6) / 0.4; }, done: () => g.setActive(false) });
  }
  fastForward() { for (const p of this.refs('_pieces')) if (p) p.go.setActive(false); LF.invoke(this, this.d._onBegan); LF.invoke(this, this.d._onCompleted); }
}
S('LevelFlow.VineCutStep', VineCutStep);

// ------------------------------------------------------------------ MachineStep: hum, then pour into the mould
class MachineStep extends Step {
  async execute() {
    const d = this.d; const body = d._body && LF.go(this.ref('_body')); const glow = d._glow && this.ref('_glow');
    const home = body ? { x: body.x, y: body.y, rot: body.rot } : null;
    LF.invoke(this, d._onRunStarted);
    let hum = null; if (d._runLoop) { const a = E.D.audio[d._runLoop]; if (a) hum = E.audio.play(a[0], { loop: true, vol: d._runVolume || 0.5 }); }
    for (const ps of this.refs('_whileRunning')) if (ps) E.particles.play(ps);
    if (glow) glow.go.setActive(true);
    const run = d._runSeconds || 1.5;
    await new Promise((r) => E.tween({ dur: run, owner: this, ease: E.ease.linear, update: (k) => { if (body) { const a = d._trembleAmplitude || 0.02; body.x = home.x + (Math.random() - 0.5) * a * 2; body.y = home.y + (Math.random() - 0.5) * a * 2; body.rot = home.rot + (Math.random() - 0.5) * (d._trembleDegrees || 1); } if (glow) glow.color[3] = 1 - (d._glowPulseDepth || 0.3) * (0.5 + 0.5 * Math.sin(E.time * Math.PI * 2 * (d._glowPulsesPerSecond || 2))); this.setProgress(k * 0.4); }, done: r, onKill: r }));
    for (const ps of this.refs('_whileRunning')) if (ps) E.particles.stop(ps);
    LF.invoke(this, d._onPourStarted);
    const st = d._stream && this.ref('_stream'); const sp = d._spout && LF.go(this.ref('_spout')); const ld = d._landing && LF.go(this.ref('_landing'));
    let pl = null; if (d._pourLoop) { const a = E.D.audio[d._pourLoop]; if (a) pl = E.audio.play(a[0], { loop: true, vol: d._pourVolume || 0.5 }); }
    for (const ps of this.refs('_atLanding')) if (ps) E.particles.play(ps);
    const fill = d._fill && this.ref('_fill');
    const ps2 = d._pourSeconds || 2;
    await new Promise((r) => E.tween({ dur: ps2, owner: this, ease: E.ease.linear, update: (k) => { const f = E.ease.inOutSine(k); if (fill && fill.set_Reveal01) fill.set_Reveal01(f); if (st && sp && ld) st.set(k < 1 - (d._streamLeadSeconds || 0.2) / ps2, sp.worldPos(), ld.worldPos()); if (body) { body.x = home.x + (Math.random() - 0.5) * 0.01; } this.setProgress(0.4 + 0.6 * k); }, done: r, onKill: r }));
    if (st) st.set(false);
    for (const ps of this.refs('_atLanding')) if (ps) E.particles.stop(ps);
    if (pl) pl.stop(); if (hum) hum.stop();
    if (body) { body.x = home.x; body.y = home.y; body.rot = home.rot; }
    if (fill && fill.Settle) fill.Settle();
    LF.invoke(this, d._onFilled);
    await LF.wait(d._wobbleSeconds || 0.6);
  }
}
S('LevelFlow.MachineStep', MachineStep);
})();
