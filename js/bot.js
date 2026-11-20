'use strict';
// Dev-only autoplayer: drives the current LevelFlow step with synthetic pointer events. Load with ?bot=1 (or call E.bot.run()).
(() => {
const LF = E.LF;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toClient = (w) => { const s = E.worldToScreen(w[0], w[1]); const r = E.canvas.getBoundingClientRect(); return [r.left + (s[0] / E.W + 0.5) * r.width, r.top + (0.5 - s[1] / E.H) * r.height]; };
const fire = (type, w) => { if (!w || !isFinite(w[0]) || !isFinite(w[1])) { B.log.push('bad pt ' + type); return; } const [x, y] = toClient(w); if (!isFinite(x) || !isFinite(y)) { B.log.push('bad client ' + JSON.stringify([w, E.worldToScreen(w[0], w[1]), E.mainCam && E.mainCam.sz, E.W, E.H])); return; } E.canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 7, bubbles: true, isPrimary: true, pointerType: 'touch' })); };
const B = (E.bot = { log: [], speed: 1 });
B.down = async (w) => { fire('pointerdown', w); await sleep(50); };
B.up = async (w) => { fire('pointerup', w); await sleep(50); };
B.move = async (w) => { fire('pointermove', w); await sleep(16); };
B.drag = async (from, to, steps = 20) => { await B.down(from); for (let i = 1; i <= steps; i++) await B.move([from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps]); };
B.tap = async (w) => { await B.down(w); await B.up(w); await sleep(150); };
const colCenter = (c) => { const o = c.of || [0, 0]; return E.M.ap(c.go.worldMatrix(), o[0], o[1]); };
const center = (g) => { const b = LF.bounds(g); return b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : g.worldPos(); };
const grabPoint = (tool) => center(tool.go);
// move the tool so that its TIP goes to w (tool rides with grabOffset; correct by tip-vs-finger delta)
const tipFollow = async (tool, pts, until) => {
  // finger position that puts the tool's tip on p once the tool has caught up: p - grabOffset - (tip - origin)
  const fingerFor = (p) => { const tip = tool.tip(), o = tool.go.worldPos(), go = tool.d._grabOffset || [0, 0.5]; return [p[0] - go[0] - (tip[0] - o[0]), p[1] - go[1] - (tip[1] - o[1])]; };
  for (const p of pts) {
    const n = pts.length <= 3 ? 25 : 2;
    for (let k = 0; k < n; k++) {
      await B.move(fingerFor(p));
      if (n > 3) { const tip = tool.tip(); if (Math.hypot(tip[0] - p[0], tip[1] - p[1]) < 0.08) break; }
      if (until && until()) return;
    }
  }
};
B.scratch = async (s) => {
  const surf = s.surface(); const tool = s.tool();
  await LF.until(() => !tool || (tool.go.activeInHierarchy && !tool.arriving && !tool.locked));
  await sleep(300);
  const srs = surf.members ? surf.surfaces().map((m) => m.sr).filter(Boolean) : [surf.sr].filter(Boolean);
  let b = null; for (const sr of srs) { const r = LF.srBounds(sr); if (r) b = b ? [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[2]), Math.max(b[3], r[3])] : r; }
  if (surf.b) b = surf.b; if (!b && surf.build) { surf.build(); b = surf.b; }
  if (!b) return;
  if (tool) await B.down(grabPoint(tool)); else await B.down([b[0], b[1]]);
  const pts = []; const rows = Math.max(14, Math.ceil((b[3] - b[1]) / 0.35));
  for (let pass = 0; pass < 6 && s.isRunning; pass++) {
    pts.length = 0;
    for (let j = 0; j <= rows; j++) { const y = b[1] + (b[3] - b[1]) * (j / rows); const xs = j % 2 ? [b[2], b[0]] : [b[0], b[2]]; for (let i = 0; i <= 10; i++) pts.push([xs[0] + (xs[1] - xs[0]) * i / 10, y]); }
    if (tool) await tipFollow(tool, pts, () => !s.isRunning); else for (const p of pts) { await B.move(p); if (!s.isRunning) break; }
  }
  await B.up(LF.ptrWorld());
};
B.step = async (s) => {
  const c = s.cls.replace('LevelFlow.', '');
  B.log.push(c + ' ' + s.go.name);
  if (c === 'ScratchStep' || c === 'ChosenScratchStep') return B.scratch(s);
  if (c === 'PluckStep') {
    for (const p of s.refs('_pieces').filter(Boolean)) { if (p.phase) continue; const w = p.go.worldPos(); if (s.d._tool) { const tool = s.ref('_tool'); await B.down(grabPoint(tool)); await tipFollow(tool, [w, [w[0] + 0.5, w[1] + 0.5], [w[0] + 1, w[1] + 1]]); await B.up(LF.ptrWorld()); } else if (s.d._dragOut) { await B.drag(w, [w[0] + 1.5, w[1] + 1.5], 12); await B.up(LF.ptrWorld()); } else { await B.down([w[0] - 0.6, w[1] - 0.3]); for (let i = 0; i <= 8; i++) await B.move([w[0] - 0.6 + 1.2 * i / 8, w[1] - 0.3 + 0.6 * i / 8]); await B.up(LF.ptrWorld()); } await sleep(250); }
    return;
  }
  if (c === 'TapStep') { const t = s.refs('_targets').filter(Boolean)[0]; if (!t) return; const w = colCenter(t); if (s.d._tool) { const tool = s.ref('_tool'); await LF.until(() => !tool.arriving && !tool.locked); await B.down(grabPoint(tool)); await tipFollow(tool, [w, w]); await B.up(LF.ptrWorld()); } else await B.tap(center(t.go)); return; }
  if (c === 'CraftingStep') {
    const slots = s.refs('_slots').filter(Boolean);
    for (const p of s.refs('_pieces').filter(Boolean)) { await LF.until(() => p.go.activeInHierarchy && !E.tweens.some((t) => t.owner === p.go)); await sleep(500); const sl = slots.find((q) => q.accepts(p)); if (!sl) continue; const a = sl.anchorPos(); const go = p.d._grabOffset || [0, 0.5]; await B.drag(center(p.go), [a[0] - go[0], a[1] - go[1]], 25); await sleep(300); await B.up(LF.ptrWorld()); await sleep(400); }
    return;
  }
  if (c === 'ChoiceStep') { await sleep(1200); const o = s.refs('_options').map(LF.go).filter(Boolean)[0]; for (let i = 0; i < 8 && o && s._picked == null; i++) { await B.tap(center(o)); await sleep(500); } if (s.d._tryOn) { await sleep(800); const n = LF.go(s.ref('_next')); if (n) await B.tap(center(n)); } return; }
  if (c === 'ClipPluckStep') {
    for (const st of s.d._stages || []) { const tool = st.Tool ? E.resolve(s.go, st.Tool) : s.ref('_tool'); const reach = E.resolve(s.go, st.Reach); if (!tool || !reach) continue; await LF.until(() => tool.go.activeInHierarchy && !tool.arriving && !tool.locked); await sleep(300); await B.down(grabPoint(tool)); await tipFollow(tool, [colCenter(reach), colCenter(reach)]); await B.up(LF.ptrWorld()); await LF.until(() => tool.go.activeInHierarchy || !s.isRunning || (st.Tool && s.d._stageTakesToolAway)); await sleep(300 + (st.Seconds || 0) * 1000); }
    return;
  }
  if (c === 'PeelStep') { const src = s.ref('_sheet').ref('_source'); const b = LF.srBounds(src); await B.drag([b[0] + 0.1, b[1] + 0.1], [b[0] - 4, b[1] - 4], 25); await B.up(LF.ptrWorld()); return; }
  if (c === 'PourStep') { const v = s.ref('_vessel'); if (s.d._autoPlay) return; await LF.until(() => !E.tweens.some((t) => t.owner === v.go)); await sleep(300); const src = s.d._source && LF.go(s.ref('_source'));
    const fingerFor = (p) => { const m = v.mouth(), o = v.go.worldPos(), go = v.d._grabOffset || [0, 0.5]; return [p[0] - go[0] - (m[0] - o[0]), p[1] - go[1] - (m[1] - o[1])]; };
    await B.down(center(v.go)); if (src) { const sp = src.worldPos(); for (let i = 0; i < 40 && v.amount <= 0; i++) await B.move(fingerFor(sp)); } const t = LF.go(s.ref('_target')).worldPos(); const dock = [t[0], t[1] + (s.d._dockHeight || 1)]; for (let i = 0; i < 600 && s.isRunning; i++) await B.move(fingerFor(dock)); await B.up(LF.ptrWorld()); return; }
  if (c === 'VineCutStep') { const tool = s.ref('_tool'); await LF.until(() => !tool.arriving && !tool.locked); await B.down(grabPoint(tool)); for (const p of s.refs('_pieces').filter(Boolean)) { const w = center(p.go); for (let i = 0; i < 60 && p.go.activeInHierarchy && s.isRunning; i++) await tipFollow(tool, [w]); } await B.up(LF.ptrWorld()); return; }
  if (c === 'OutfitChoiceStep') { await sleep(1500); const card = s.refs('_cards')[0]; if (card && card.onPointerClick) card.onPointerClick(); await sleep(2000); const dn = s.ref('_done'); if (dn && dn.onPointerClick) dn.onPointerClick(); return; }
};
B.run = async () => {
  B.running = true;
  let lastStep = null, same = 0;
  while (B.running) {
    const r = LF.runner; const s = r && r.current;
    if (r && r.isComplete) { B.log.push('LEVEL COMPLETE'); break; }
    if (s && s.isRunning && s !== lastStep) { lastStep = s; same = 0; try { await B.step(s); } catch (e) { B.log.push('ERR ' + e.message); } }
    else if (s && s.isRunning) { same++; if (same > 120) { B.log.push('STUCK ' + s.go.name); lastStep = null; same = 0; } }
    await sleep(250);
  }
  B.running = false;
};
if (/[?&]bot=1/.test(location.search)) setTimeout(() => B.run(), 1500);
})();
