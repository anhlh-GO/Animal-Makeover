'use strict';
(async () => {
  const boot = document.getElementById('boot');
  const cv = document.getElementById('c');
  E.initCanvas(cv);
  E.bindInput(cv);
  E.loadSave();
  const [sp, so, names, mats, audio, ps] = await Promise.all([
    E.fetchJSON('data/sprites.json'), E.fetchJSON('data/so.json'), E.fetchJSON('data/names.json'),
    E.fetchJSON('data/mats.json'), E.fetchJSON('assets/audio/audio.json'), E.fetchJSON('data/ps.json'),
  ]);
  E.D.ps = ps;
  E.D.spr = sp.spr; E.D.tex = sp.tex; E.D.so = so; E.D.names = names; E.D.mats = mats; E.D.audio = audio;
  try { E.D.clips = await E.fetchJSON('data/clips.json'); } catch (e) { E.D.clips = {}; }
  boot.style.display = 'none';
  let last = performance.now();
  const step = () => {
    const now = performance.now();
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1; if (dt <= 0) return;
    try { E.update(dt); E.updateScrolls(dt); E.render(); } catch (e) { console.error(e); }
    if (E.LF) E.LF.endFrame();
  };
  const raf = () => { step(); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  setInterval(() => { if (performance.now() - last > 120) step(); }, 50);
  const q = new URLSearchParams(location.search);
  if (E.Game && E.Game.boot && !q.get('scene')) E.Game.boot();
  else await E.loadScene(q.get('scene') || 'level0');
})();
