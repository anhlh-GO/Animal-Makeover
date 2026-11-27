'use strict';
// Test cheats: finish steps or whole levels quickly. A small panel on the left edge; ?cheat=0 hides it.
//   Skip step   - the step in hand completes at once (its end state applied, as the ?step= fast-forward does)
//   To photo    - restarts the level fast-forwarded to its last step (the photo / finale)
//   Pass level  - marks the level done and opens the next one
//   Unlock all  - (menu) every level card shows as unlocked
(() => {
if (/[?&]cheat=0/.test(location.search)) return;
const LF = E.LF, G = E.Game;

const skipStep = (s) => {
  if (!s || !s.isRunning) return;
  // apply the step's end state without firing its begin / complete events a second time (run() fires complete)
  const inv = LF.invoke;
  LF.invoke = (owner, ev, ...a) => { if (owner === s && (ev === s.d._onBegan || ev === s.d._onCompleted || ev === s.d._onLeadIn)) return; return inv(owner, ev, ...a); };
  try { LF.ff = true; if (s.fastForward) s.fastForward(); } catch (e) { console.error('cheat skip', e); } finally { LF.ff = false; LF.invoke = inv; }
  s._skip = true; s.isRunning = false; LF.hideHint();
  const t = LF.activeTool; if (t && t.held) t.release();
};
const levelScene = () => { const sc = E.scene; return sc && sc !== 'level0' && sc !== 'level1' && LF.runner; };
const actions = {
  skip() { const r = LF.runner; if (!r) return; const run = (r.steps || []).filter((s) => s.isRunning); if (run.length) run.forEach(skipStep); else if (r.current) skipStep(r.current); },
  photo() { const r = LF.runner; if (!r) return; const n = (r.d._groups || []).length; if (!n) return; LF.skipTo = n - 1; G.go(E.scene); },
  pass() { if (!levelScene()) return; if (!G.sceneName) G.sceneName = E.scene; LF.levelDone(); },
  unlock() { const s = G.state(); s.unlocked = G.order.slice(); E.writeSave(); G.menu(); },
};

const css = document.createElement('style');
css.textContent = `
#cheat{position:fixed;left:6px;bottom:16%;z-index:4;display:flex;flex-direction:column;gap:6px;font:700 12px/1 system-ui,sans-serif;user-select:none}
#cheat button{border:0;border-radius:999px;padding:8px 11px;background:rgba(40,20,60,.72);color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;text-align:left;white-space:nowrap}
#cheat button:active{transform:scale(.94)}
#cheat .tab{background:rgba(255,123,192,.85);padding:6px 10px;font-size:11px;letter-spacing:.04em}
#cheat.min button:not(.tab){display:none}
#cheat [data-only=level],#cheat [data-only=menu]{display:none}
#cheat.level [data-only=level],#cheat.menu [data-only=menu]{display:block}
#cheat.min.level [data-only=level],#cheat.min.menu [data-only=menu]{display:none}`;
document.head.appendChild(css);
const box = document.createElement('div');
box.id = 'cheat';
box.innerHTML = '<button class="tab">CHEAT</button>' +
  '<button data-a="skip" data-only="level">⏭ Qua bước</button>' +
  '<button data-a="photo" data-only="level">📸 Tới chụp ảnh</button>' +
  '<button data-a="pass" data-only="level">✅ Qua màn</button>' +
  '<button data-a="unlock" data-only="menu">🔓 Mở khóa tất cả</button>';
document.body.appendChild(box);
let min = false; try { min = localStorage.getItem('cheat-min') === '1'; } catch (e) { /* */ }
box.classList.toggle('min', min);
const stop = (e) => e.stopPropagation();
for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']) box.addEventListener(t, stop);
box.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; e.stopPropagation();
  if (b.classList.contains('tab')) { min = !min; box.classList.toggle('min', min); try { localStorage.setItem('cheat-min', min ? '1' : '0'); } catch (er) { /* */ } return; }
  const f = actions[b.dataset.a]; if (f) try { f(); } catch (er) { console.error('cheat', er); }
});
setInterval(() => { box.classList.toggle('level', !!levelScene()); box.classList.toggle('menu', E.scene === 'level1'); }, 300);
})();
