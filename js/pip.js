'use strict';
// Pip the hedgehog (level11, "Hedgehog"): a new level designed in the level sheet, built on the Bunny scene's frame
// (data/level11.json from tools/pip_scene.py) with art cut by tools/pip_export.py (data/level11_pack.json).
// Stages: spa table -> wooden tub -> spa table -> dressing room. 27 steps, using the game's own LevelFlow steps.
(() => {
const LF = E.LF, G = E.Game;
const SCENE = 'level11';
E.scenePacks[SCENE] = SCENE;
E.scenePreload[SCENE] = () => Object.keys((E.D[SCENE] || {}).spr || {});
G.order.push('Hedgehog');
G.scene.Hedgehog = SCENE;

const PPU = 153.6; // character canvas (1024x1536) -> 10 world units
const CHAR_Y = 0.3, BG_Y = -0.4;
const CLIP = {
  whoosh: 'sharedassets3.assets:132', tap: 'sharedassets2.assets:242', tap2: 'sharedassets2.assets:241', pick: 'sharedassets2.assets:237',
  pop: 'sharedassets0.assets:10', bubble: 'sharedassets6.assets:182', brush: 'sharedassets7.assets:151', fill: 'sharedassets0.assets:13',
  powder: 'sharedassets7.assets:146', shower: 'sharedassets0.assets:14', soap: 'sharedassets0.assets:27', towelOn: 'sharedassets0.assets:19',
  towelPick: 'sharedassets0.assets:15', sparkle: 'sharedassets3.assets:130', cream: 'sharedassets2.assets:240', sticker: 'sharedassets6.assets:178',
  balm: 'sharedassets10.assets:269', spray: 'sharedassets5.assets:155', dye: 'sharedassets2.assets:236', dress: 'sharedassets0.assets:25',
  stars: 'sharedassets6.assets:180', change: 'sharedassets2.assets:234', change2: 'sharedassets2.assets:246', snip: 'sharedassets10.assets:266',
  scar: 'sharedassets9.assets:154', rub: 'sharedassets7.assets:153',
};

// ------------------------------------------------------------------ building blocks
const node = (name, parent, x = 0, y = 0, s = 1, active = true) => { const g = E.newGO(name, parent); g.x = x; g.y = y; g.sx = g.sy = s; g.activeSelf = active; return g; };
const sr = (g, sp, o, col) => { const c = { t: 'SR', sp, o, color: col || [1, 1, 1, 1], go: g, enabled: true }; g.comps.push(c); return c; };
const box = (g, w, h) => { const c = { t: 'Box', sz: [w, h], of: [0, 0], go: g, enabled: true }; g.comps.push(c); return c; };
const circle = (g, r) => { const c = { t: 'Circle', r, of: [0, 0], go: g, enabled: true }; g.comps.push(c); return c; };
const add = (g, cls, d) => { const C = E.scripts[cls]; const c = new C(g, { cls, id: 0, d: d || {} }); g.comps.push(c); return c; };
const ev = (...fns) => ({ _js: fns });
const size = (key) => { const s = E.D.spr[key]; return s ? [s[3] / s[7], s[4] / s[7]] : [1, 1]; };
const lay = () => E.D[SCENE].pip;
// a layer of the character canvas, placed where it sits in the 1024x1536 render
const cpos = (key) => { const l = lay()[key.replace('pip:', '')]; return [(l.cx - 512) / PPU, (768 - l.cy) / PPU]; };
const layerGO = (name, parent, key, o, active = true) => { const p = cpos(key); const g = node(name, parent, p[0], p[1], 1, active); sr(g, key, o); return g; };
const playFx = (name, at) => { const g = E.findInScene(name); if (!g) return; if (at) g.setWorldPos(at[0], at[1]); g.setActive(true); E.psPlay(g); };
const sound = (k, v = 0.6, p) => LF.sound(CLIP[k] || k, v, p);
const fade = (srs, to, sec = 0.35) => { for (const s of [].concat(srs)) { if (!s) continue; s.go.setActive(true); const f = s.color[3]; E.tween({ dur: sec, owner: s.go, update: (k) => { s.color[3] = f + (to - f) * k; }, done: () => { if (to <= 0) { s.go.setActive(false); s.color[3] = 1; } } }); } };

// ------------------------------------------------------------------ faces (shared by the three bodies)
const FACE = { 0: 'normal', 1: 'happy', 2: 'sad', 3: 'surprised', 4: 'closed' };
const makeFaces = () => ({
  cur: 2, srs: [], blinkUntil: 0,
  key(x) { return 'pip:face_' + (FACE[x] || 'normal'); },
  setExpression(x) { if (x == null) return; this.cur = x; this.apply(); },
  apply() { const k = E.time < this.blinkUntil ? 'pip:face_closed' : this.key(this.cur); for (const s of this.srs) s.sp = k; },
});
class PipBlink extends E.Behaviour {
  awake() { this.next = E.time + 2; }
  update() {
    const f = this.d._faces; if (!f) return;
    if (E.time > this.next) { this.next = E.time + E.rand(2.4, 5.2); if (f.cur !== 4 && f.cur !== 1) { f.blinkUntil = E.time + 0.14; f.apply(); this.after(0.15, () => f.apply()); } }
  }
}
LF.S('Pip.Blink', PipBlink);

// ------------------------------------------------------------------ tools
const TOOL_HOME = [2.05, -5.35];
const scratchTool = (name, key, o) => {
  // o: {tip:[x,y] local at scale 1, scale, grab, radius, loop, loopVol, loopHeld, rot, home}
  const sc = o.scale || 1, gs = o.grab || 1.1;
  const home = o.home || TOOL_HOME;
  const g = o.go || node(name, LF.pipTools, home[0], home[1], sc, false);
  if (o.go) { g.x = home[0]; g.y = home[1]; g.sx = g.sy = sc; g.rot = o.rot || 0; g.activeSelf = false; }
  g.rot = o.rot || 0;
  const own = g.comp('SR'); if (own) { own.sp = key; own.o = 60; } else sr(g, key, 60);
  const sz = size(key); const bx = g.comp('Box'); if (bx) bx.sz = [sz[0], sz[1]]; else box(g, sz[0], sz[1]);
  let tip = g.find('Tip'); if (!tip) tip = node('Tip', g); tip.x = o.tip[0]; tip.y = o.tip[1];
  const lift = o.lift == null ? 0.55 : o.lift;
  const d = {
    _toolName: name, _tip: tip, _overrideBrushRadius: true, _brushRadius: o.radius || 0.5, _grabOffset: [-o.tip[0] * sc * gs, lift - o.tip[1] * sc * gs],
    _grabScale: gs, _followSpeed: 30, _promoteSorting: true, _heldSortingBoost: 80, _slideFromSide: o.slide !== false, _arriveSeconds: 0.6, _leaveSeconds: 0.45,
    _slideTilt: 10, _returnHomeOnRelease: true, _returnSeconds: 0.25, _activeWhileHeld: o.whileHeld || [], _effectsOnArtOnly: !!o.fxOnArt,
    _wipeRegion: [0.05, 0.05, 0.9, 0.9], _heldDegrees: o.heldDeg || 0, _heldLeanSeconds: 0.2, _swayDegrees: o.sway || 0, _swayPerSpeed: 1.5,
  };
  let st = g.comps.find((c) => c.cls === 'LevelFlow.ScratchTool');
  if (st) st.d = Object.assign(st.d, d); else st = add(g, 'LevelFlow.ScratchTool', d);
  const ad = { _pickUpClip: CLIP.pick, _pickUpVolume: 0.5, _workLoop: o.loop ? CLIP[o.loop] : null, _workVolume: o.loopVol || 0.4, _loopWhileHeld: !!o.loopHeld, _pickUpGraceSeconds: 0.1 };
  const au = g.comps.find((c) => c.cls === 'LevelFlow.ScratchToolAudio'); if (au) au.d = ad; else add(g, 'LevelFlow.ScratchToolAudio', ad);
  return st;
};
const surface = (go, extra) => add(go, 'LevelFlow.BrushScratchSurface', Object.assign({ _maskResolution: 128, _brushSoftness: 0.55, _debris: 0 }, extra || {}));

// ------------------------------------------------------------------ the level
const build = () => {
  const P = E.D[SCENE]; if (!P) return;
  const sm = (id) => E.sceneMap.get(SCENE + ':' + id);
  const runner = sm(1824); const bar = sm(2012);
  const salonRoot = E.findInScene('Stage - Salon');
  const stepsRoot = E.roots.find((r) => r.name === 'Steps');
  const toolsRoot = E.roots.find((r) => r.name === 'Tools');
  const dressStage = E.roots.find((r) => r.name === 'Stage - Dress Up');
  LF.pipTools = toolsRoot;
  const faces = makeFaces(); LF.pipFaces = faces;
  const built = [];

  // ---------------- salon (spa table with the mirror)
  const salon = node('Pip Salon', salonRoot);
  add(salon, 'Pip.Blink', { _faces: faces });
  node('BG', salon, 0, BG_Y); sr(salon.children[0], 'pip:bg1', 0);
  const counter = node('Counter', salon, 0, BG_Y + (768 - lay().counter.cy) / (1536 / 17.6)); sr(counter, 'pip:counter', 40);
  const pip = node('Pip', salon, 0, CHAR_Y);
  add(pip, 'LevelFlow.BreathMotion', { _amount: 0.006, _breathSeconds: 3.2, _widthShare: 0.3 });
  layerGO('Body', pip, 'pip:base', 10);
  const face = layerGO('Face', pip, 'pip:face_sad', 12); faces.srs.push(face.comp('SR'));
  const messy = layerGO('Messy Quills', pip, 'pip:messy', 14);
  const gloss = layerGO('Gloss', pip, 'pip:gloss', 15, false);
  const tipCols = ['mint', 'peach', 'lilac'];
  const tips = tipCols.map((c) => layerGO('Tips ' + c, pip, 'pip:tips_' + c, 16, false));
  const charmNames = ['star', 'berry', 'mushroom'];
  const charms = charmNames.map((c) => layerGO('Charms ' + c, pip, 'pip:charms_' + c, 17, false));
  const scratches = lay().scratch_parts.map((k, i) => layerGO('Scratch ' + i, pip, k, 18));
  const nose = layerGO('Dry Nose', pip, 'pip:nose_dry', 18);
  const cotton = layerGO('Cotton Candy', pip, 'pip:cottoncandy', 19);
  const gums = lay().gums.map((k, i) => layerGO('Gum ' + i, pip, k, 20));
  // frozen blobs pair with the gum blobs by position
  const frozenKeys = lay().frozen.slice().sort((a, b) => cpos(a)[0] - cpos(b)[0]);
  const gumOrder = gums.slice().sort((a, b) => a.x - b.x);
  const frozen = gumOrder.map((g, i) => layerGO('Frozen ' + i, pip, frozenKeys[i], 20, false));
  const burrs = lay().burrs.map((k, i) => layerGO('Burr ' + i, pip, k, 21));
  const leaves = lay().leaves.map((k, i) => layerGO('Leaf ' + i, pip, k, 21));
  const piece = (g, extra) => { const s = size(g.comp('SR').sp); box(g, s[0], s[1]); return add(g, 'LevelFlow.PluckPiece', Object.assign({ _flightOrder: 90, _launchShare: 0.5, _launchSpeedRange: [3, 7], _lift: 3, _gravity: 16, _spin: 300, _shrinkTo: 0.6, _flightSeconds: 0.9, _tugSeconds: 0.12, _tugDistance: 0.08 }, extra || {})); };
  const burrPieces = burrs.map((g) => piece(g));
  const leafPieces = leaves.map((g) => piece(g, { _stretchShare: 0.35, _stretchMax: 0.45, _spin: 200 }));
  const frozenPieces = frozen.map((g) => piece(g, { _spin: 420, _lift: 2 }));

  // ---------------- bath (wooden tub)
  const bath = node('Pip Bath', salonRoot, 0, 0, 1, false);
  node('BG', bath, 0, BG_Y); sr(bath.children[0], 'pip:bg2', 0);
  const tubPip = node('Pip In Tub', bath, 0, CHAR_Y);
  add(tubPip, 'LevelFlow.BreathMotion', { _amount: 0.004, _breathSeconds: 3.2, _widthShare: 0.3 });
  layerGO('Body', tubPip, 'pip:tub', 10);
  const tubFace = layerGO('Face', tubPip, 'pip:face_normal', 12); faces.srs.push(tubFace.comp('SR'));
  const tubMessy = layerGO('Messy Quills', tubPip, 'pip:messy', 13);
  const dust = layerGO('Dust', tubPip, 'pip:dust', 14);
  const mud = layerGO('Mud', tubPip, 'pip:mud', 14);
  const foam = layerGO('Foam', tubPip, 'pip:foam', 15);
  const towelWorn = layerGO('Towel', tubPip, 'pip:towel', 16, false);
  const water = node('Water', tubPip, 0, -1.6);
  const shoulders = node('Shoulders', tubPip, 0, -1.2);

  // ---------------- tools
  const reuse = (n) => toolsRoot.children.find((c) => c.name === n);
  const ice = scratchTool('Tool - Ice', 'pip:tl_ice', { tip: [0, 0], scale: 0.75, slide: false, lift: 0.3 });
  const brush = scratchTool('Tool - Soft Brush', 'pip:tl_softbrush', { tip: [0.48, 0.5], scale: 0.95, radius: 0.55, loop: 'brush', loopVol: 0.5 });
  const shower = scratchTool('Tool - Shower', 'pip:tl_shower', { go: reuse('Tool - Shower'), tip: [-0.42, 0.56], scale: 1, radius: 1.05, loop: 'shower', loopVol: 0.3, loopHeld: true, home: [2.1, -5.5], whileHeld: [reuse('Tool - Shower').find('Shower Particles')] });
  const showerFx = reuse('Tool - Shower').find('Shower Particles'); if (showerFx) { showerFx.x = -0.45; showerFx.y = 0.4; }
  const soapGO = reuse('Tool - Soap Brush'); const hl = soapGO.comps.find((c) => c.cls === 'LevelFlow.ToolHeldLook'); if (hl) hl.d._held = null;
  const sponge = scratchTool('Tool - Mushroom Sponge', 'pip:tl_sponge', { go: soapGO, tip: [0, 0.3], scale: 0.9, radius: 0.62, loop: 'soap', loopVol: 0.35, home: [2.1, -5.5], whileHeld: [soapGO.find('Foam')] });
  const swab = scratchTool('Tool - Antiseptic Swab', 'pip:tl_swab', { tip: [0.7, 0.86], scale: 0.9 });
  const balm = scratchTool('Tool - Honey Balm', 'pip:tl_balm', { tip: [-0.26, 0.86], scale: 0.85, radius: 0.24, loop: 'balm', loopVol: 0.5 });
  const combGO = reuse('Tool - Comb');
  const comb = scratchTool('Tool - Quill Comb', 'pip:tl_comb', { go: combGO, tip: [0.32, 0.42], scale: 0.95, radius: 0.62, loop: 'brush', loopVol: 0.55, whileHeld: [combGO.find('Comb Work FX')], fxOnArt: true });
  const combFx = combGO.find('Comb Work FX'); if (combFx) { combFx.x = 0.32; combFx.y = 0.42; }
  const mist = scratchTool('Tool - Shine Mist', 'pip:tl_mist', { tip: [0, 1.45], scale: 0.85, radius: 0.95, loop: 'spray', loopVol: 0.35, loopHeld: true, lift: 0.2 });
  const dyeBrush = scratchTool('Tool - Tip Dye Brush', 'pip:tl_dyebrush', { tip: [-0.7, -0.75], scale: 0.9, radius: 0.42, loop: 'dye', loopVol: 0.5, rot: 0 });
  const dyeDab = node('Dye', dyeBrush.go, -0.62, -0.66, 0.42); const dyeDabSR = sr(dyeDab, 'sharedassets2.assets:401', 61, [1, 1, 1, 0.9]);
  // pour vessels
  const vessel = (name, key, sc, mouth, angle, loop, streamCol, streamW) => {
    const g = node(name, toolsRoot, TOOL_HOME[0], TOOL_HOME[1] - 0.1, sc, false); sr(g, key, 60); const s = size(key); box(g, s[0], s[1]);
    const m = node('Mouth', g, mouth[0], mouth[1]);
    const stG = node('Stream', toolsRoot); const st = add(stG, 'LevelFlow.LiquidStream', { _width: streamW }); sr(stG, null, 0, streamCol);
    return add(g, 'LevelFlow.PourVessel', { _mouth: m, _slideFromSide: true, _arriveSeconds: 0.6, _leaveSeconds: 0.45, _slideTilt: 8, _startsFull: true, _pourAngle: angle, _grabScale: 1.08, _grabOffset: [0, 0.2], _followSpeed: 18, _promoteSorting: true, _pourLoop: CLIP[loop], _pourVolume: 0.5, _stream: st, _pickUpClip: CLIP.pick });
  };
  const kettle = vessel('Copper Kettle', 'pip:tl_kettle', 1, [-0.86, 0.18], 52, 'fill', [0.82, 0.92, 1, 0.75], 0.13);
  const oat = vessel('Oat Milk Bag', 'pip:tl_oatbag', 0.95, [0.05, 0.86], 115, 'powder', [0.97, 0.93, 0.84, 0.85], 0.1);
  // towel and plasters (dragged into place)
  const craftPiece = (name, key, x, y, sc, extra) => { const g = node(name, toolsRoot, x, y, sc, false); sr(g, key, 60); const s = size(key); box(g, s[0], s[1]); return add(g, 'LevelFlow.CraftPiece', Object.assign({ _pieceId: name, _grabOffset: [0, 0.4], _followSpeed: 28, _grabScale: 1.1, _growSeconds: 0.2, _promoteSorting: true, _heldSortingBoost: 100, _snapSeconds: 0.25, _snapEase: 27, _returnSeconds: 0.28, _slideFromSide: true, _arriveSeconds: 0.6, _slideTilt: 10, _onPickedUp: ev(() => sound('pick', 0.5)) }, extra || {})); };
  const towel = craftPiece('Fluffy Towel', 'pip:tl_towel', TOOL_HOME[0] - 0.1, TOOL_HOME[1] - 0.2, 1, { _placedScale: 1.25 });
  const plasters = [-0.15, 1.15, 2.45].map((x, i) => craftPiece('Acorn Plaster ' + i, 'pip:tl_plaster', x, -5.45, 0.42, { _placedScale: 0.52, _placedSortingOrder: 22 }));
  const slot = (name, parent, x, y, r) => { const g = node(name, parent, x, y); return add(g, 'LevelFlow.CraftSlot', { _acceptsAnyPiece: true, _snapRadius: r }); };
  const towelSlot = slot('Towel Slot', shoulders, 0, 0, 1.8);
  const scratchAt = scratches.map((g) => [g.x, g.y]);
  const plasterSlots = scratchAt.map((p, i) => slot('Plaster Slot ' + i, pip, p[0], p[1], 0.8));
  // ClipPluck stand-ins (the tool's double that plays the touch) and reach boxes
  const standIn = (name, key, sc) => { const g = node(name, pip, 0, 0, sc, false); sr(g, key, 70); return g; };
  const reach = (name, parent, x, y, r) => { const g = node(name, parent, x, y); return circle(g, r); };

  // ---------------- choice cards (the Bunny's card plates, new pictures)
  const cardSet = (names, keys) => names.map((n, i) => { const c = reuse(n); const img = c.find('Image'); if (img) { img.comp('SR').sp = keys[i]; img.sx = img.sy = 1; img.y = 0.03; } return c; });
  const marks = (cards) => cards.map((c) => c.find('Selected'));
  const tipCards = cardSet(['Blush Card One', 'Blush Card Two', 'Blush Card Three'], ['pip:cd_tip_mint', 'pip:cd_tip_peach', 'pip:cd_tip_lilac']);
  const charmCards = cardSet(['Earrings Card One', 'Earrings Card Two', 'Earrings Card Three'], ['pip:cd_charm_star', 'pip:cd_charm_berry', 'pip:cd_charm_mushroom']);
  const outfitNames = ['hoodie', 'explorer', 'suit'];
  const outfitCards = cardSet(['Dress up Card One', 'Dress up Card Two', 'Dress up Card Three'], outfitNames.map((n) => 'pip:card_' + n));
  const memGO = node('Pip Choices', salonRoot);
  const tipMem = add(memGO, 'LevelFlow.ChoiceMemory', { _default: 0 });
  const charmMem = add(memGO, 'LevelFlow.ChoiceMemory', { _default: 0 });
  const burst = (E.findInScene('Card Sparkle') || {}).comps ? E.findInScene('Card Sparkle').comp('PS') : null;
  const next = node('Next', toolsRoot, 2.8, -3.41, 0.56, false); sr(next, 'sharedassets2.assets:251', 61); box(next, 2.07, 1.71);

  // ---------------- dressing room
  const dressBG = dressStage.find('Background'); if (dressBG) { dressBG.comp('SR').sp = 'pip:bg3'; dressBG.y = BG_Y; }
  const dressChar = dressStage.find('Character'); const breath = dressChar.find('Bounce/Breath');
  const dressPip = node('Pip Dress', breath, 0, 768 / PPU);
  layerGO('Head', dressPip, 'pip:dress_head', 10);
  const bodies = ['robe'].concat(outfitNames).map((n, i) => layerGO('Body ' + n, dressPip, 'pip:body_' + n, 11, i === 0));
  const dressFace = layerGO('Face', dressPip, 'pip:face_happy', 13); faces.srs.push(dressFace.comp('SR'));
  const dGloss = layerGO('Gloss', dressPip, 'pip:gloss', 15);
  const dTips = tipCols.map((c) => layerGO('Tips ' + c, dressPip, 'pip:tips_' + c, 16, false));
  const dCharms = charmNames.map((c) => layerGO('Charms ' + c, dressPip, 'pip:charms_' + c, 17, false));
  void dGloss;
  const dressUp = sm(1934);
  if (dressUp) Object.assign(dressUp.d, { _arrivalLook: { Name: 'Robe', Parts: [{ Renderer: bodies[0].comp('SR') }] }, _looks: bodies.slice(1).map((b, i) => ({ Name: outfitNames[i], Parts: [{ Renderer: b.comp('SR') }] })) });
  const posts = sm(1828);
  const postKeys = outfitNames.map((n) => 'pip:post_' + n);
  if (posts) { posts.Apply = (i) => { const cards = posts.refs('_cards').filter(Boolean); const order = [0, 1, 2].filter((k) => k !== i).concat([i]); cards.forEach((c, k) => { c.sp = postKeys[order[k]]; }); }; posts.Apply(0); }
  for (const r of E.roots) for (const img of r.compsInChildren('Img')) if (/^sharedassets8\.assets:(147|114|152)$/.test(img.sp || '')) img.sp = postKeys[['sharedassets8.assets:147', 'sharedassets8.assets:114', 'sharedassets8.assets:152'].indexOf(img.sp)];
  const dressMem = sm(1904);
  const wear = add(memGO, 'LevelFlow.ChoiceWear', { _character: dressUp, _from: outfitCards });
  if (dressMem) dressMem.d._onChosen = ev((i) => { wear.Wear(i); if (posts) posts.Apply(i); });

  // ------------------------------------------------------------------ steps
  const BASE = { _settleSeconds: 0.45, _sulkWhenIdle: true, _expressionWhenIdle: 2, _idleSeconds: 7, _showWhileRunning: [], _hideWhileRunning: [] };
  const steps = [], icons = [], pickIcons = [];
  const step = (title, cls, d, icon, pickIcon) => { const g = node(steps.length + ' - ' + title, stepsRoot); const s = add(g, cls, Object.assign({ _title: title }, BASE, d)); steps.push(s); icons.push(icon || null); pickIcons.push(pickIcon || null); return s; };
  const scratch = (title, d, icon) => step(title, 'LevelFlow.ScratchStep', Object.assign({ _completionThreshold: 0.85, _autoFinishAt: 0.9, _clearSeconds: 0.45, _resetSurfaceOnBegin: false }, d), icon);
  const fadeStep = (title, d) => step(title, 'LevelFlow.ScreenFadeStep', Object.assign({ _fadeOutSeconds: 0.5, _holdSeconds: 0.25, _fadeInSeconds: 0.75, _sulkWhenIdle: false }, d));
  const show = (title, d) => step(title, 'LevelFlow.SpriteToggleStep', Object.assign({ _toggles: [], _sulkWhenIdle: false }, d));

  // 0 Meet Pip
  fadeStep('Meet Pip', { _openFromBlack: true, _fadeInSeconds: 0.9, _holdSeconds: 0.3, _expressionOnBegin: 2, _expressionOnComplete: 2, _settleSeconds: 0.6, _onCovered: ev(() => sound('whoosh', 0.4)) });
  // 1 Burrs
  step('Burrs', 'LevelFlow.PluckStep', { _pieces: burrPieces, _tapPlucks: true, _tapRadius: 0.32, _minSwipeSpeed: 2.5, _catchRadius: 0.22, _pluckClips: [CLIP.tap, CLIP.tap2], _pitchJitter: 0.35, _volume: 0.7, _expressionOnBegin: 2, _expressionOnComplete: 1, _onPlucked: ev(() => faces.setExpression(3)) });
  // 2 Leaves
  step('Leaves', 'LevelFlow.PluckStep', { _pieces: leafPieces, _dragOut: true, _breakDistance: 0.85, _tapRadius: 0.38, _minSwipeSpeed: 2.5, _catchRadius: 0.25, _pluckClips: [CLIP.towelPick, CLIP.tap], _pitchJitter: 0.25, _volume: 0.7, _hintDirection: [0.6, 0.8], _expressionOnBegin: 2, _expressionOnComplete: 0 });
  // 3 Here comes the ice cube
  show('Ice cube', { _toggles: [{ Target: ice.go, Renderer: ice.go.comp('SR'), SetActive: true, Fade: true, FadeSeconds: 0.35 }], _holdSeconds: 0.9, _expressionOnBegin: 3, _expressionOnComplete: 3, _onBegan: ev(() => { sound('pop', 0.6); const g = ice.go; g.setActive(true); const s0 = 0.75; g.comp('SR').color[3] = 0; g.sx = g.sy = s0 * 0.4; E.tween({ dur: 0.45, owner: g, ease: E.ease.outBack, update: (k) => { g.sx = g.sy = s0 * (0.4 + 0.6 * k); } }); playFx('Pop Sparkle', [TOOL_HOME[0], TOOL_HOME[1]]); }) });
  // 4 Freeze the gum: take the ice to each blob, it frosts over
  const iceDouble = standIn('Ice (touch)', 'pip:tl_ice', 0.75 * 1.1);
  const gumStages = gumOrder.map((g, i) => {
    const p = [g.x, g.y]; const r = reach('Gum Reach ' + i, pip, p[0], p[1], 0.42);
    return { Reach: r, Seconds: 1.25, PluckTimes: [0.35, 0.7], Sound: CLIP.bubble, ToolBackAt: 1.2, HideWhenDone: [g],
      Tracks: [
        { Target: iceDouble, StartsAtTool: true, ShowAt: 0, HideAt: 1.2, MoveTimes: [0, 0.25, 0.45, 0.65, 0.85, 1.05, 1.2], MovePoints: [[p[0], p[1]], [p[0], p[1] + 0.05], [p[0] + 0.12, p[1] + 0.02], [p[0] - 0.12, p[1] + 0.06], [p[0] + 0.08, p[1] + 0.03], [p[0] + 0.3, p[1] + 0.5], [p[0] + 0.8, p[1] - 0.8]], ScaleTimes: [0, 1.0, 1.2], Scales: [0.82, 0.82, 0.6] },
        { Target: frozen[i], ShowAt: 0.25, FadeTimes: [0.25, 0.95], FadeAlphas: [0, 1] },
        { Target: g, FadeTimes: [0.3, 1.0], FadeAlphas: [1, 0] },
      ] };
  });
  step('Freeze the gum', 'LevelFlow.ClipPluckStep', { _tool: ice, _stages: gumStages, _toolReturnsToCounter: true, _volume: 0.6, _expressionOnBegin: 2, _expressionOnComplete: 3 }, 'pip:tl_ice');
  // 5 Crack it off
  step('Crack it off', 'LevelFlow.PluckStep', { _pieces: frozenPieces, _tapPlucks: true, _tapRadius: 0.45, _minSwipeSpeed: 2.5, _catchRadius: 0.3, _pluckClips: [CLIP.snip, CLIP.bubble], _pitchJitter: 0.3, _volume: 0.8, _expressionOnBegin: 1, _expressionOnComplete: 1 });
  // 6 Cotton candy
  const cottonS = surface(cotton, { _debris: 0.6 });
  scratch('Cotton candy', { _surface: cottonS, _tool: brush, _mode: 0, _hideUntilMyTurn: false, _hideOnComplete: true, _completionThreshold: 0.82, _expressionOnBegin: 0, _expressionOnComplete: 1 }, 'pip:tl_softbrush');
  // 7 Bath time
  fadeStep('Bath time', { _swaps: [{ Target: salon, SetActive: false }, { Target: bath, SetActive: true }], _expressionOnBegin: 0, _expressionOnComplete: 0, _onCovered: ev(() => sound('tap2', 0.5)) });
  // 8 Warm water, 9 Oat milk
  step('Warm water', 'LevelFlow.PourStep', { _vessel: kettle, _target: water, _dockHeight: 1.9, _captureRadius: 1.25, _releaseRadius: 2, _pourSeconds: 2.2, _leaveWhenDone: true, _sulkWhenIdle: false, _expressionOnBegin: 1, _expressionOnComplete: 1 }, 'pip:tl_kettle');
  step('Oat milk', 'LevelFlow.PourStep', { _vessel: oat, _target: water, _dockHeight: 1.7, _captureRadius: 1.25, _releaseRadius: 2, _pourSeconds: 2, _leaveWhenDone: true, _sulkWhenIdle: false, _expressionOnBegin: 1, _expressionOnComplete: 1 }, 'pip:tl_oatbag');
  // 10 Rinse the dust off his quills
  const dustS = surface(dust, { _debris: 0.4 });
  scratch('Rinse', { _surface: dustS, _tool: shower, _mode: 0, _hideUntilMyTurn: false, _hideOnComplete: true, _expressionOnBegin: 4, _expressionOnComplete: 0 }, 'pip:tl_shower');
  // 11 Belly scrub (foam comes in over the mud), 12 rinse the foam
  const foamS = surface(foam);
  scratch('Belly scrub', { _surface: foamS, _tool: sponge, _mode: 1, _hideUntilMyTurn: true, _resetSurfaceOnBegin: true, _expressionOnBegin: 1, _expressionOnComplete: 1, _onCompleted: ev(() => mud.setActive(false)) }, 'pip:tl_sponge');
  scratch('Rinse foam', { _surface: foamS, _tool: shower, _mode: 0, _hideUntilMyTurn: false, _resetSurfaceOnBegin: true, _hideOnComplete: true, _expressionOnBegin: 4, _expressionOnComplete: 1, _onBegan: ev(() => { foam.setActive(true); mud.setActive(false); }) }, 'pip:tl_shower');
  // 13 Towel
  step('Towel', 'LevelFlow.CraftingStep', { _pieces: [towel], _slots: [towelSlot], _placeOnReach: true, _expressionOnBegin: 1, _expressionOnGoodDrop: 1, _expressionOnComplete: 1,
    _onPiecePlaced: ev(() => { sound('towelOn', 0.7); E.after(0.22, () => { fade(towel.go.comp('SR'), 0, 0.3); towelWorn.setActive(true); const s = towelWorn.comp('SR'); s.color[3] = 0; fade(s, 1, 0.35); tubMessy.setActive(false); }); }) }, 'pip:tl_towel');
  // 14 All fluffy
  show('Fluffy', { _holdSeconds: 1.4, _expressionOnBegin: 1, _expressionOnComplete: 1, _onBegan: ev(() => { sound('sparkle', 0.7); playFx('Reveal Sparkle', tubPip.worldPos()); }) });
  // 15 Back to the mirror
  fadeStep('Vanity', { _swaps: [{ Target: bath, SetActive: false }, { Target: salon, SetActive: true }], _expressionOnBegin: 0, _expressionOnComplete: 0 });
  // 16 Antiseptic on each scratch
  const swabDouble = standIn('Swab (touch)', 'pip:tl_swab', 0.9 * 1.1);
  const swabStages = scratches.map((g, i) => {
    const p = [g.x, g.y]; const r = reach('Scratch Reach ' + i, pip, p[0], p[1], 0.35); const t = [p[0] - 0.7 * 0.99, p[1] - 0.86 * 0.99];
    return { Reach: r, Seconds: 1.0, PluckTimes: [0.3], Sound: CLIP.cream, ToolBackAt: 0.95,
      Tracks: [
        { Target: swabDouble, StartsAtTool: true, ShowAt: 0, HideAt: 0.95, MoveTimes: [0, 0.22, 0.38, 0.52, 0.66, 0.95], MovePoints: [t, t, [t[0] + 0.04, t[1] + 0.07], t, [t[0] + 0.04, t[1] + 0.07], [t[0] + 0.9, t[1] - 1.2]] },
        { Target: g, FadeTimes: [0.25, 0.8], FadeAlphas: [1, 0.38] },
      ] };
  });
  step('Antiseptic', 'LevelFlow.ClipPluckStep', { _tool: swab, _stages: swabStages, _toolReturnsToCounter: true, _volume: 0.6, _expressionOnBegin: 2, _expressionOnComplete: 0, _onCompleted: ev(() => playFx('Pop Sparkle', scratches[1].worldPos())) }, 'pip:tl_swab');
  // 17 Plasters
  step('Plasters', 'LevelFlow.CraftingStep', { _pieces: plasters, _slots: plasterSlots, _placeOnReach: false, _expressionOnBegin: 0, _expressionOnGoodDrop: 1, _expressionOnComplete: 1, _onPiecePlaced: ev(() => sound('sticker', 0.6)) }, 'pip:tl_plaster');
  // 18 Nose balm
  const noseS = surface(nose, { _brushSoftness: 0.6 });
  scratch('Nose balm', { _surface: noseS, _tool: balm, _mode: 0, _hideUntilMyTurn: false, _hideOnComplete: true, _completionThreshold: 0.8, _expressionOnBegin: 4, _expressionOnComplete: 1 }, 'pip:tl_balm');
  // 19 Comb the quills smooth
  const messyS = surface(messy);
  scratch('Comb quills', { _surface: messyS, _tool: comb, _mode: 0, _hideUntilMyTurn: false, _hideOnComplete: true, _completionThreshold: 0.8, _autoFinishAt: 0.86, _expressionOnBegin: 0, _expressionOnComplete: 1 }, 'pip:tl_comb');
  // 20 Shine mist
  const glossS = surface(gloss);
  scratch('Quill shine', { _surface: glossS, _tool: mist, _mode: 1, _hideUntilMyTurn: true, _resetSurfaceOnBegin: true, _completionThreshold: 0.8, _autoFinishAt: 0.86, _expressionOnBegin: 4, _expressionOnComplete: 1, _onCompleted: ev(() => { sound('sparkle', 0.5); playFx('Reveal Sparkle', [pip.worldPos()[0], pip.worldPos()[1] + 2.2]); }) }, 'pip:tl_mist');
  // 21 Tip colour
  const choiceD = { _touchSlop: 0.2, _arriveStagger: 0.12, _arriveSeconds: 0.6, _breathe: 0.02, _hopHeight: 0.22, _hopSeconds: 0.45, _holdSeconds: 0.45, _markSeconds: 0.32, _chosenLeaves: true, _chosenLeaveSeconds: 0.45, _chooseClip: CLIP.change, _chooseVolume: 0.6, _burst: burst, _sulkWhenIdle: false, _expressionOnBegin: 1, _expressionOnComplete: 1 };
  const TIP_RGB = [[0.55, 0.95, 0.8], [1, 0.72, 0.55], [0.8, 0.66, 1]];
  step('Tip colour', 'LevelFlow.ChoiceStep', Object.assign({}, choiceD, { _options: tipCards, _memory: tipMem, _selectedMarks: marks(tipCards) }), null, 'pip:cd_tip_mint');
  // 22 Dip-dye: the dye brush carries the chosen colour
  const tipSurfaces = tips.map((g) => surface(g));
  step('Dip-dye', 'LevelFlow.ChosenScratchStep', { _memory: tipMem, _branches: tipSurfaces.map((s, i) => ({ Name: tipCols[i], Surface: s, Tool: dyeBrush })), _mode: 1, _hideUntilMyTurn: true, _resetSurfaceOnBegin: true, _completionThreshold: 0.8, _autoFinishAt: 0.86, _clearSeconds: 0.5, _expressionOnBegin: 1, _expressionOnComplete: 1,
    _onBegan: ev(() => { const c = TIP_RGB[tipMem.chosen] || TIP_RGB[0]; dyeDabSR.color = [c[0], c[1], c[2], 0.95]; }), _onCompleted: ev(() => { sound('stars', 0.5); playFx('Reveal Sparkle', [pip.worldPos()[0], pip.worldPos()[1] + 2.4]); }) }, 'pip:tl_dyebrush');
  // 23 Charms
  step('Charms', 'LevelFlow.ChoiceStep', Object.assign({}, choiceD, { _options: charmCards, _memory: charmMem, _selectedMarks: marks(charmCards),
    _onChosen: ev((i) => { charms.forEach((c, k) => c.setActive(false)); const c = charms[i] || charms[0]; c.setActive(true); const s = c.comp('SR'); s.color[3] = 0; fade(s, 1, 0.4); sound('change2', 0.6); playFx('Pop Sparkle', [pip.worldPos()[0], pip.worldPos()[1] + 3]); }) }), null, 'pip:cd_charm_star');
  // 24 Dressing room: what he chose comes along
  fadeStep('Dressing room', { _swaps: [{ Target: salonRoot, SetActive: false }, { Target: dressStage, SetActive: true }], _expressionOnBegin: 1, _expressionOnComplete: 1, _fadeOutSeconds: 0.55, _holdSeconds: 0.2, _fadeInSeconds: 0.8,
    _onBegan: ev(() => { const v = sm(1848); if (v && v.Veil) v.Veil(); }),
    _onCovered: ev(() => { dTips.forEach((g, i) => g.setActive(tips[i].activeSelf || (i === tipMem.chosen && tipMem.hasChoice))); dCharms.forEach((g, i) => g.setActive(charms[i].activeSelf)); playFx('Bokeh'); sound('stars', 0.5); }) });
  // 25 Outfit (try on, then Next)
  step('Outfit', 'LevelFlow.ChoiceStep', Object.assign({}, choiceD, { _options: outfitCards, _memory: dressMem, _selectedMarks: marks(outfitCards), _tryOn: true, _next: next, _chooseClip: CLIP.dress, _onNext: ev(() => { sound('tap', 0.6); playFx('Change Sparkle', dressChar.worldPos()); }) }), null, 'pip:card_hoodie');
  // 26 Say cheese!
  const photo = step('Photo', 'LevelFlow.SpriteToggleStep', { _toggles: [], _holdSeconds: 0.3, _sulkWhenIdle: false, _expressionOnBegin: 1, _expressionOnComplete: 1,
    _onBegan: ev(() => { const c = photo.go.comps.find((x) => x.cls === 'LevelFlow.CentreInFrame'); if (c) c.Centre(); const fp = sm(563); if (fp) fp.setActive(true); const ui = sm(141); if (ui) ui.setActive(false); }) });
  add(photo.go, 'LevelFlow.CentreInFrame', { _stage: dressStage, _subject: dressChar, _frame: sm(575), _frameHighY: -0.3, _frameLowY: -0.3, _verticalOnly: true, _seconds: 0.6 });

  // ------------------------------------------------------------------ runner, tool bar
  runner.d._groups = steps.map((s) => ({ _mode: 0, _steps: [s] }));
  runner.d._levelName = 'Hedgehog'; runner.d._character = faces; runner.d._expressionOnLevelComplete = 1;
  LF.character = faces;
  if (bar) Object.assign(bar.d, { _steps: steps, _icons: icons, _pickIcons: pickIcons, _iconDegrees: [], _iconContent: [], _iconZoom: [], _iconFocus: [], _hideFromStep: 24, _hiddenDuring: [] });

  for (const g of [salon, bath, memGO]) built.push(g);
  for (const g of built) E._awakeTree(g);
  E._awakeTree(stepsRoot);
  // components added to objects that were already awake
  for (const c of [cottonS, messyS, noseS, dustS]) if (c.go.activeInHierarchy && !c._awoken) { c._awoken = true; c.awake(); }
};

const prev = E.onSceneLoaded;
E.onSceneLoaded = (level) => { if (prev) prev(level); if (level === SCENE) { try { build(); } catch (e) { console.error('pip build', e); } } if (level === 'level1') { try { menu(); } catch (e) { console.error('pip menu', e); } } };

// ------------------------------------------------------------------ main menu: Pip's level card and menu figure
const menu = async () => {
  await E.loadPack(SCENE);
  const F = E.D.files.level1; if (!F) return;
  const grid = E.findInScene('Container'); if (!grid) return;
  const tpl = grid.children.find((c) => c.comps.some((x) => x.cls === 'LevelInformation' && x.d.levelName === 'Bunny')); if (!tpl) return;
  const card = E.instantiate(tpl._src[0] + ':' + tpl._src[1], grid, { noAwake: true });
  card.name = 'Hedgehog';
  const soon = grid.children.find((c) => c.name === 'Lion'); if (soon) card.setSiblingIndex(soon.siblingIndex); // before the "coming soon" card
  const li = card.comps.find((x) => x.cls === 'LevelInformation'); if (li) li.d = { levelName: 'Hedgehog' };
  const img = card.comp('Img'); if (img) img.sp = 'pip:menu_card';
  const btn = card.comp('Btn'); if (btn && btn.cb) { btn.cb = JSON.parse(JSON.stringify(btn.cb)); for (const pc of btn.cb.m_PersistentCalls.m_Calls) if (pc.m_MethodName === 'PlayLevel') pc.m_Arguments.m_StringArgument = 'Hedgehog'; }
  for (const ch of card.children) { if (/lock$/i.test(ch.name) && !/unlock/i.test(ch.name)) { ch.name = 'HedgehogLock'; const i2 = ch.comp('Img'); if (i2) i2.sp = 'pip:menu_card_dirty'; } else if (/unlock$/i.test(ch.name)) ch.name = 'HedgehogUnlock'; }
  E._awakeTree(card);
  // the pop's cards are wired by reference: add the new one
  const pop = E.findObjectOfType('SelectionPop'); if (pop && Array.isArray(pop.d._allBtns)) pop.d._allBtns = pop.d._allBtns.concat([card]);
  // main menu figure when Pip is the next level
  const mm = E.findObjectOfType('MainmenuObj');
  if (mm && G.current() === 'Hedgehog') {
    const any = mm.refs('AllMainChar').map(LF.go).filter(Boolean)[0]; const par = any ? any.parent : null;
    const g = node('HedgehogChar', par, 0, -1.2, 1);
    sr(g, 'pip:menu_card', 5); g.sx = g.sy = 1.5;
    add(g, 'MenuCharacterBreath', {});
    E._awakeTree(g);
  }
};
})();
