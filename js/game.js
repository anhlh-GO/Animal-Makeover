'use strict';
// Game shell: splash, main menu, level selection, level order and progress, scene loading.
(() => {
const LF = E.LF, S = LF.S, B = E.Behaviour;
const G = (E.Game = {});
// LevelHandler order (the game's own) -> scene files
G.order = ['Cat', 'Watermelon', 'Alligator', 'Parrot', 'Husky', 'ButterFly', 'Panda', 'Bunny', 'PolarBear'];
G.scene = { Cat: 'level2', Husky: 'level3', Alligator: 'level4', Parrot: 'level5', Panda: 'level6', ButterFly: 'level7', Bunny: 'level8', Watermelon: 'level9', PolarBear: 'level10' };
G.sfx = { click: 'sharedassets0.assets:11', pop: 'sharedassets0.assets:10' };
const save = () => E.writeSave();
G.state = () => { const s = E.save; if (s.level == null) s.level = 0; if (!s.unlocked) s.unlocked = ['Cat']; if (s.sound == null) s.sound = true; if (s.vib == null) s.vib = true; return s; };
G.current = () => G.order[G.state().level % G.order.length];
G.unlock = (name) => { const s = G.state(); if (!s.unlocked.includes(name)) { s.unlocked.push(name); save(); } };

// ------------------------------------------------------------------ loading overlay
const ov = document.createElement('div');
ov.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;background:#000;z-index:5;transition:opacity .25s';
ov.innerHTML = '<div style="width:46vmin;max-width:260px;height:14px;border-radius:7px;background:rgba(255,255,255,.18);overflow:hidden"><div id="ldf" style="height:100%;width:0;background:#ff7bc0;border-radius:7px"></div></div>';
document.body.appendChild(ov);
const fill = ov.querySelector('#ldf');
G.go = async (scene) => {
  if (G._loading) return; G._loading = true;
  ov.style.display = 'flex'; ov.style.opacity = '1'; fill.style.width = '0';
  E.audio.stopAll && E.audio.stopAll();
  LF.runner = null; LF.screenFade = null; LF.hintCtl = null; LF.viewCam = null; LF.character = null; LF.activeTool = null; LF.contact = null; LF.skinPress = null;
  try { await E.loadScene(scene, (p) => { fill.style.width = Math.round(p * 100) + '%'; }); } catch (e) { console.error(e); }
  fill.style.width = '100%';
  G.sceneName = scene;
  setTimeout(() => { ov.style.opacity = '0'; setTimeout(() => { ov.style.display = 'none'; }, 250); }, 120);
  G._loading = false;
};
G.playLevel = (name) => { const s = G.state(); const i = G.order.indexOf(name); if (i >= 0) { s.level = i; save(); } G.unlock(name); G.go(G.scene[name] || 'level2'); };
G.menu = () => G.go('level1');
G.boot = () => G.go('level0');
LF.levelDone = () => { const s = G.state(); const i = G.order.indexOf(G.levelNameOf(G.sceneName)); s.level = (i >= 0 ? i : s.level) + 1; G.unlock(G.order[s.level % G.order.length]); save(); G.go(G.scene[G.current()]); };
LF.goHome = () => G.menu();
G.levelNameOf = (scene) => Object.keys(G.scene).find((k) => G.scene[k] === scene);
E.audio.stopAll = () => { /* loops are owned by their components and stop with them */ };
// sound / vibration toggles
const play0 = E.audio.play.bind(E.audio);
E.audio.play = (name, o) => (G.state().sound ? play0(name, o) : null);

// ------------------------------------------------------------------ splash
S('SplashObj', class extends B {
  start() {
    const tl = this.ref('_title'); const t = LF.go(tl);
    for (const g of this.refs('loading')) if (g) LF.go(g).setActive(true);
    if (t) { t.sx = t.sy = 0.6; E.tween({ dur: 0.6, owner: t, ease: E.ease.outBack, update: (k) => { t.sx = t.sy = 0.6 + 0.4 * k; } }); }
    this.after(2.2, () => G.menu());
  }
});
S('LoadingPanel', class extends B {});
S('LevelHandler', class extends B {});
S('Audio_Manager', class extends B {});
S('LevelInformation', class extends B {});

// ------------------------------------------------------------------ main menu
S('MainmenuObj', class extends B {
  start() {
    const cur = G.current();
    const chars = this.refs('AllMainChar').map(LF.go);
    chars.forEach((g) => { if (!g) return; const li = g.comps.find((c) => c.cls === 'LevelInformation'); g.setActive(!!li && li.d.levelName === cur); });
    const p = LF.go(this.ref('PlayBtn')); if (p) { p._s0 = p.sx; if (p.rt) { const y0 = p.rt[5]; this.after(2, () => E.tween({ dur: 0.5, owner: p, ease: E.ease.outBack, update: (k) => { p.rt[5] = y0 + (260 - y0) * k; } })); } }
    const na = LF.go(this.ref('inappRemoveAds')); if (na) na.setActive(false);
  }
  OnPlayBtn() { if (this.isPlayClick) return; this.isPlayClick = true; G.playLevel(G.current()); }
  playBtnClickSound() { LF.sound(G.sfx.click, 0.5); }
  callInter() {}
  setStarsOnRateDialogue(n) { this.refs('allStars').forEach((g, i) => { const x = LF.go(g); if (x) x.setActive(i < n); }); }
});
S('SelectionPop', class extends B {
  onEnable() {
    const s = G.state(); const cards = this.refs('_allBtns').map(LF.go).filter(Boolean);
    if (!this._fitted) { this._fitted = true; E.layoutAll(); this.fitContent(cards); }
    cards.forEach((c, i) => {
      const li = c.comps.find((x) => x.cls === 'LevelInformation'); const name = li ? li.d.levelName : '';
      const open = s.unlocked.includes(name);
      for (const ch of c.children) { if (/lock$/i.test(ch.name) && !/unlock/i.test(ch.name)) ch.setActive(!open); if (/unlock$/i.test(ch.name)) ch.setActive(name === G.current()); }
      c.sx = c.sy = 0; E.tween({ dur: this.d._cardSeconds || 0.4, delay: i * (this.d._cardStagger || 0.06), owner: c, ease: E.ease.outBack, update: (k) => { c.sx = c.sy = k; } });
    });
  }
  // the card grid is taller than the content rect it was authored with: grow the content (keeping its top) so the last row can be scrolled to
  fitContent(cards) {
    const c = cards[0] && cards[0].parent; const L = c && c.comp('Layout'); if (!c || !L || L.k !== 'G' || !c.rect) return;
    const n = c.children.filter((x) => x.activeSelf).length; const cols = L.con === 1 ? L.cc : 2; const rows = Math.ceil(n / cols);
    const pad = L.pad || [0, 0, 0, 0]; const need = pad[2] + pad[3] + rows * L.cell[1] + Math.max(0, rows - 1) * L.gsp[1] + 40;
    const dh = need - c.rect.h; if (dh <= 0) return;
    c.rt[7] += dh; c.rt[5] -= dh * (1 - c.rt[9]);
  }
  PlayLevel(name) { LF.sound(G.sfx.click, 0.5); G.playLevel(name); }
  // locked cards ask for a rewarded video in the original; here they simply open
  selectLockedLevel(x) { const g = LF.go(x); const li = g && g.comps.find((c) => c.cls === 'LevelInformation'); if (li) G.playLevel(li.d.levelName); }
});
S('SettingPanel', class extends B {
  onEnable() { this.refresh(); }
  refresh() { const s = G.state(); const v = this.ref('VolumeBtn'), b = this.ref('VibBtn'); if (v) v.sp = s.sound ? this.d.Volume_OnSp : this.d.Volume_OffSp; if (b) b.sp = s.vib ? this.d.Vib_OnSp : this.d.Vib_OffSp; }
  SoundClick() { const s = G.state(); s.sound = !s.sound; save(); this.refresh(); }
  VibClick() { const s = G.state(); s.vib = !s.vib; save(); this.refresh(); }
  PolicyLink() {}
  clickOnRateButton() {} clickOnNoThanks() {} sendRatingEvents() {}
});
S('Monetization.Runtime.InAppPurchasing.InAppButton', class extends B {});
S('Monetization.Runtime.Consent.PrivacyPolicyPanel', class extends B { awake() { this.go.setActive(false); } });
S('Monetization.Runtime.Internet.InternetPanelObject', class extends B { awake() { this.go.setActive(false); } });
S('Monetization.Runtime.Utilities.EventSystemEnabler', class extends B {});
S('ShowBlackStub', class extends B {});
})();
// mouse wheel scrolls the open scroll view (desktop testing)
window.addEventListener('wheel', (e) => {
  for (const r of E.roots) for (const s of r.compsInChildren('Scroll', [], false)) {
    if (!s.go.activeInHierarchy || !s.v) continue;
    const c = E.resolve(s.go, s.content); const g = c && (c.go || c); if (!g || !g.rt) continue;
    g.rt[5] += e.deltaY * 1.5; E.scrollClamp(s);
  }
}, { passive: true });
// every button press clicks, as Audio_Manager's ButtonClick does in the original
(() => { const oc = E.clickButton; E.clickButton = (b) => { if (b && b.interactable && b.enabled) E.LF.sound(E.Game.sfx.click, 0.4); return oc(b); }; })();
