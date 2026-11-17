'use strict';
// Shuriken ParticleSystem emulation in 3D (emitter/shape rotations, local/world simulation), projected onto the 2D view.
(() => {
const M = E.M;
const curve = (pts, t) => { const f = E.clamp(t, 0, 1) * 8; const i = Math.min(7, Math.floor(f)); return pts[i] + (pts[i + 1] - pts[i]) * (f - i); };
const ev = (m, t, rnd) => {
  if (m == null) return 0;
  if (typeof m === 'number') return m;
  switch (m[0]) {
    case 'c': return m[1];
    case 'r': return m[1] + (m[2] - m[1]) * (rnd == null ? Math.random() : rnd);
    case 'k': return m[1] * curve(m[2], t || 0);
    case 'rk': { const a = curve(m[2], t || 0), b = curve(m[3], t || 0); return m[1] * (a + (b - a) * (rnd == null ? Math.random() : rnd)); }
  }
  return 0;
};
const gradAt = (g, t) => {
  const c = g.c, a = g.a; let col = c[0][1], al = a[0][1];
  for (let i = 0; i < c.length; i++) { if (t <= c[i][0]) { if (i === 0) { col = c[0][1]; break; } const p = c[i - 1], q = c[i]; const k = (t - p[0]) / (q[0] - p[0] || 1); col = [p[1][0] + (q[1][0] - p[1][0]) * k, p[1][1] + (q[1][1] - p[1][1]) * k, p[1][2] + (q[1][2] - p[1][2]) * k]; break; } col = c[i][1]; }
  for (let i = 0; i < a.length; i++) { if (t <= a[i][0]) { if (i === 0) { al = a[0][1]; break; } const p = a[i - 1], q = a[i]; const k = (t - p[0]) / (q[0] - p[0] || 1); al = p[1] + (q[1] - p[1]) * k; break; } al = a[i][1]; }
  return [col[0], col[1], col[2], al];
};
const colEv = (m, t, rnd) => {
  if (!m) return [1, 1, 1, 1];
  if (m[0] === 'c') return m[1];
  if (m[0] === 'r') { const r = rnd == null ? Math.random() : rnd; return m[1].map((v, i) => v + (m[2][i] - v) * r); }
  if (m[0] === 'g') return gradAt(m[1], t);
  if (m[0] === 'rg') { const a = gradAt(m[1], t), b = gradAt(m[2], t); const r = rnd == null ? Math.random() : rnd; return a.map((v, i) => v + (b[i] - v) * r); }
  return [1, 1, 1, 1];
};
// ---- 3x3 linear algebra (column vectors), row-major arrays of 9
const m3mul = (a, b) => { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; };
const m3v = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const quatM = (q) => { const [x, y, z, w] = q; return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]; };
const rotZ = (deg) => { const c = Math.cos(deg * E.DEG), s = Math.sin(deg * E.DEG); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const rotX = (deg) => { const c = Math.cos(deg * E.DEG), s = Math.sin(deg * E.DEG); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = (deg) => { const c = Math.cos(deg * E.DEG), s = Math.sin(deg * E.DEG); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const scl = (x, y, z) => [x, 0, 0, 0, y, 0, 0, 0, z];
const euler = (e) => m3mul(rotY(e[1]), m3mul(rotX(e[0]), rotZ(e[2]))); // Unity order Z, X, Y
// the emitter's own linear part (rotation incl. X/Y tilt, and scale) and its parent's 2D world matrix
const goLinear = (g) => { const sz = g.sz3 == null ? 1 : g.sz3; const R = g.q ? quatM(g.q) : rotZ(g.rot); return m3mul(R, scl(g.sx, g.sy, sz)); };
// full 3D world transform of the emitter (every ancestor's position, rotation incl. X/Y tilt, and scale)
const emitterWorld = (g) => {
  let lin = [1, 0, 0, 0, 1, 0, 0, 0, 1], t = [0, 0, 0];
  const chain = []; for (let x = g; x; x = x.parent) chain.push(x);
  for (let i = chain.length - 1; i >= 0; i--) {
    const x = chain[i];
    const px = x.rt && x._ui ? x._lx : x.x, py = x.rt && x._ui ? x._ly : x.y;
    const lp = m3v(lin, [px, py, x.z || 0]); t = [t[0] + lp[0], t[1] + lp[1], t[2] + lp[2]];
    lin = m3mul(lin, goLinear(x));
  }
  const ps = g.parent ? Math.hypot(g.parent.worldMatrix()[0], g.parent.worldMatrix()[1]) : 1;
  return { lin, tx: t[0], ty: t[1], ps };
};
const normalize = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const randDir = () => { const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), r * Math.sin(a), z]; };
// shape-local spawn position and direction
const shapeSample = (sh) => {
  const r = sh.r == null ? 1 : sh.r, t = sh.type, rt = sh.rt == null ? 1 : sh.rt; const arc = (sh.arc == null ? 360 : sh.arc) * E.DEG;
  const rr = () => r * (1 - rt * Math.random()); // radius thickness: 1 = whole volume, 0 = edge
  let p = [0, 0, 0], d = [0, 0, 1];
  if (t === 0 || t === 1 || t === 2 || t === 3) { d = randDir(); if (t === 2 || t === 3) d[2] = Math.abs(d[2]); const k = t === 1 || t === 3 ? r : rr(); p = [d[0] * k, d[1] * k, d[2] * k]; }
  else if (t === 4 || t === 7 || t === 8 || t === 9) { const a = Math.random() * arc; const k = t === 7 || t === 9 ? 1 : Math.sqrt(1 - rt * Math.random()); const x = Math.cos(a) * k, y = Math.sin(a) * k; const sa = Math.sin((sh.angle || 0) * E.DEG), ca = Math.cos((sh.angle || 0) * E.DEG); d = normalize([x * sa, y * sa, ca]); p = [x * r, y * r, 0]; if (t === 8 || t === 9) { const l = Math.random() * (sh.len || 1); p = [p[0] + d[0] * l, p[1] + d[1] * l, d[2] * l]; } }
  else if (t === 5 || t === 15 || t === 16) { p = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]; d = [0, 0, 1]; }
  else if (t === 10 || t === 11) { const a = Math.random() * arc; const k = t === 11 ? r : rr(); p = [Math.cos(a) * k, Math.sin(a) * k, 0]; d = [Math.cos(a), Math.sin(a), 0]; }
  else if (t === 12) { p = [(Math.random() * 2 - 1) * r, 0, 0]; d = [0, 1, 0]; }
  else if (t === 18) { p = [Math.random() - 0.5, Math.random() - 0.5, 0]; d = [0, 0, 1]; }
  if (sh.sph) { const n = normalize(p[0] || p[1] || p[2] ? p : [0, 0, 1]); d = normalize([d[0] + (n[0] - d[0]) * sh.sph, d[1] + (n[1] - d[1]) * sh.sph, d[2] + (n[2] - d[2]) * sh.sph]); }
  if (sh.rnd) { const n = randDir(); d = normalize([d[0] + (n[0] - d[0]) * sh.rnd, d[1] + (n[1] - d[1]) * sh.rnd, d[2] + (n[2] - d[2]) * sh.rnd]); }
  return { p, d };
};
const shapeMatrix = (sh) => { if (sh._m) return sh._m; const R = euler(sh.rot3 || [0, 0, sh.rotz || 0]); const S = scl(sh.scale ? sh.scale[0] : 1, sh.scale ? sh.scale[1] : 1, sh.sz || 1); sh._m = m3mul(R, S); sh._r = R; return sh._m; };
const systems = new Set();
const P = (E.particles = {
  get(comp) {
    if (comp.sys) return comp.sys;
    const key = comp.go.file + ':' + comp.id;
    const cfg = E.D.ps[key]; if (!cfg) return null;
    comp.sys = { cfg, comp, parts: [], t: 0, acc: 0, accD: 0, playing: false, emitting: false, bursts: [], last: null };
    return comp.sys;
  },
  play(comp) { const s = this.get(comp); if (!s) return; s.t = -(ev(s.cfg.delay) || 0); s.acc = 0; s.playing = true; s.emitting = true; s.last = null; s.bursts = (s.cfg.bursts || []).map((b) => ({ time: b[0], n: b[1], cycles: b[2] || 1, iv: b[3] || 0.01, done: 0 })); systems.add(s); },
  stop(comp, clear) { const s = comp.sys; if (!s) return; s.emitting = false; if (clear) s.parts.length = 0; },
  clear(comp) { if (comp.sys) comp.sys.parts.length = 0; },
  emit(comp, n) { const s = this.get(comp); if (!s) return; systems.add(s); s.playing = true; const W = emitterWorld(comp.go); for (let i = 0; i < n; i++) spawn(s, W); },
  isAlive(comp) { const s = comp.sys; return !!(s && (s.emitting || s.parts.length)); },
  update(dt) {
    for (const s of systems) {
      const c = s.cfg; const g = s.comp.go;
      if (g.destroyed) { systems.delete(s); continue; }
      const active = g.activeInHierarchy;
      if (!active) { s.parts.length = 0; if (!s.emitting) { s.playing = false; systems.delete(s); } continue; }
      const sdt = dt * (c.sim || 1);
      const W = emitterWorld(g); s.W = W;
      if (s.playing && s.emitting) {
        s.t += sdt;
        if (s.t >= 0) {
          if (s.t > c.dur) { if (c.loop) { s.t -= c.dur; for (const b of s.bursts) b.done = 0; } else s.emitting = false; }
          if (s.emitting) {
            const k = s.t / (c.dur || 1);
            const rate = ev(c.rate, k) * (s.rateScale == null ? 1 : s.rateScale);
            s.acc += rate * sdt; while (s.acc >= 1) { s.acc -= 1; if (s.parts.length < (c.max || 1000)) spawn(s, W); }
            if (c.rate_d && s.last) { const dd = Math.hypot(W.tx - s.last[0], W.ty - s.last[1]); s.accD += ev(c.rate_d, k) * dd; while (s.accD >= 1) { s.accD -= 1; if (s.parts.length < (c.max || 1000)) spawn(s, W); } }
            for (const b of s.bursts) { while (b.done < b.cycles && s.t >= b.time + b.done * b.iv) { const n = Math.round(ev(b.n)); for (let i = 0; i < n; i++) if (s.parts.length < (c.max || 1000)) spawn(s, W); b.done++; } }
          }
        }
      }
      s.last = [W.tx, W.ty];
      const gv = ev(c.grav) * 9.81;
      // gravity / world-space forces expressed in the particle's frame
      const inv = c.space === 1 ? null : invLin(W.lin);
      const gl = inv ? m3v(inv, [0, -gv, 0]) : [0, -gv, 0];
      const damp = c.drag ? Math.max(0, 1 - ev(c.drag) * sdt) : 1;
      for (let i = s.parts.length - 1; i >= 0; i--) {
        const p = s.parts[i]; p.age += sdt;
        if (p.age >= p.life) { s.parts.splice(i, 1); continue; }
        const k = p.age / p.life;
        p.v[0] += gl[0] * sdt; p.v[1] += gl[1] * sdt; p.v[2] += gl[2] * sdt;
        if (c.force) { const f = [ev(c.force[0], k, p.r1), ev(c.force[1], k, p.r2), ev(c.force[2], k, p.r3)]; const fl = c.forceW && inv ? m3v(inv, f) : !c.forceW && !inv ? m3v(W.lin, f) : f; p.v[0] += fl[0] * sdt; p.v[1] += fl[1] * sdt; p.v[2] += fl[2] * sdt; }
        if (damp !== 1) { p.v[0] *= damp; p.v[1] *= damp; p.v[2] *= damp; }
        let vx = p.v[0], vy = p.v[1], vz = p.v[2];
        if (c.vel) { const v = [ev(c.vel[0], k, p.r1), ev(c.vel[1], k, p.r2), ev(c.vel[2], k, p.r3)]; const vl = c.velW && inv ? m3v(inv, v) : !c.velW && !inv ? m3v(W.lin, v) : v; vx += vl[0]; vy += vl[1]; vz += vl[2]; }
        if (c.limit) { const lm = ev(c.limit, k); const sp = Math.hypot(vx, vy, vz); if (sp > lm && sp > 0) { const f = 1 - (c.dampen == null ? 1 : c.dampen) * (1 - lm / sp); p.v[0] *= f; p.v[1] *= f; p.v[2] *= f; } }
        if (c.noise) { const st = ev(c.noise[0]) || 0; vx += (Math.sin(p.age * 9 + p.r4 * 20) * st); vy += (Math.cos(p.age * 8 + p.r5 * 20) * st); }
        p.p[0] += vx * sdt; p.p[1] += vy * sdt; p.p[2] += vz * sdt; p.cv = [vx, vy, vz];
        if (c.rotLife) p.rot += ev(c.rotLife, k, p.r3) * sdt;
      }
      if (!s.emitting && !s.parts.length) { s.playing = false; systems.delete(s); }
    }
  },
  draw(comp, ctx) {
    const s = comp.sys; if (!s || !s.parts.length) return;
    const c = s.cfg; const g = comp.go; if (c.rmode === 5) return;
    const W = s.W || emitterWorld(g);
    let img = null, tf = null;
    if (c.tex && E.D.tex[c.tex]) { tf = E.D.tex[c.tex][0]; img = E.texImg(tf); if (!img._ok) img = null; }
    const add = c.mat && c.mat.add; const tint = c.mat && c.mat.tint; const tm = tint ? [Math.min(1, tint[0] * 2), Math.min(1, tint[1] * 2), Math.min(1, tint[2] * 2), Math.min(1, tint[3] * 2)] : [1, 1, 1, 1];
    E.setT(E._cm);
    if (add) ctx.globalCompositeOperation = 'lighter';
    const L = W.lin; const det = L[0] * (L[4] * L[8] - L[5] * L[7]) - L[1] * (L[3] * L[8] - L[5] * L[6]) + L[2] * (L[3] * L[7] - L[4] * L[6]); const sizeK = Math.cbrt(Math.abs(det)) || 1;
    const rend = c.rend || {};
    for (const p of s.parts) {
      const k = p.age / p.life;
      const sl = c.sizeLife ? ev(c.sizeLife, k, p.r4) : 1;
      let size = p.size * sl * (c.scaling === 0 ? sizeK : 1);
      const col = colEv(c.colLife, k, p.r5);
      const a = p.col[3] * col[3] * tm[3]; if (a <= 0.01 || size <= 0.001) continue;
      // world position
      let wx, wy, vx = 0, vy = 0;
      if (c.space === 1) { wx = p.p[0]; wy = p.p[1]; if (p.cv) { vx = p.cv[0]; vy = p.cv[1]; } }
      else { const q = m3v(W.lin, p.p); wx = W.tx + q[0]; wy = W.ty + q[1]; if (p.cv) { const v = m3v(W.lin, p.cv); vx = v[0]; vy = v[1]; } }
      ctx.save(); ctx.translate(wx, wy); ctx.globalAlpha = Math.min(1, a);
      let w = size, h = size;
      if (c.rmode === 1) { const sp = Math.hypot(vx, vy); const L = size * (rend.ls == null ? 2 : rend.ls) + sp * (rend.vs || 0); ctx.rotate(Math.atan2(vy, vx)); w = Math.max(size, L); h = size; }
      else ctx.rotate(-p.rot);
      const rgb = [p.col[0] * col[0] * tm[0], p.col[1] * col[1] * tm[1], p.col[2] * col[2] * tm[2]];
      if (img) {
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (c.tiles) { const tx = c.tiles[0] || 1, ty = c.tiles[1] || 1; sw = img.width / tx; sh = img.height / ty; const fr = Math.floor((ev(c.tiles[3], 0, p.r6) * tx * ty + ev(c.tiles[2], k, p.r6) * tx * ty * (c.tiles[5] || 1))) % (tx * ty); sx = (fr % tx) * sw; sy = Math.floor(fr / tx) * sh; }
        ctx.scale(1, -1);
        const white = rgb[0] > 0.93 && rgb[1] > 0.93 && rgb[2] > 0.93;
        const src = white ? null : tintedCell(img, tf, sx, sy, sw, sh, rgb);
        if (c.rmode === 1) { ctx.rotate(Math.PI / 2); if (src) ctx.drawImage(src, -h / 2, -w / 2, h, w); else ctx.drawImage(img, sx, sy, sw, sh, -h / 2, -w / 2, h, w); }
        else if (src) ctx.drawImage(src, -w / 2, -h / 2, w, h); else ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
      } else {
        const r = Math.max(w, h) / 2; const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, E.colorStr(rgb.concat(1), 1)); gr.addColorStop(1, E.colorStr(rgb.concat(0), 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  },
});
const invLin = (m) => {
  const [a, b, c, d, e, f, g, h, i] = m; const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g; const det = a * A + b * B + c * C || 1e-9;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
};
// tinted copies of a texture cell, colour quantised so the cache stays small
const _tc = new Map();
const tintedCell = (img, tf, sx, sy, sw, sh, rgb) => {
  const q = rgb.map((v) => Math.round(E.clamp(v, 0, 1) * 12));
  const key = tf + '|' + sx + ',' + sy + ',' + sw + ',' + sh + '|' + q.join(',');
  let cv = _tc.get(key);
  if (!cv) {
    cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(sw)); cv.height = Math.max(1, Math.round(sh));
    const g = cv.getContext('2d'); g.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${q[0] * 255 / 12 | 0},${q[1] * 255 / 12 | 0},${q[2] * 255 / 12 | 0})`; g.fillRect(0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
    _tc.set(key, cv); if (_tc.size > 400) _tc.delete(_tc.keys().next().value);
  }
  return cv;
};
const spawn = (s, W) => {
  const c = s.cfg; const k = Math.max(0, s.t) / (c.dur || 1);
  const sh = c.shape || {};
  let p = [0, 0, 0], d = [0, 0, 1];
  if (sh.en) {
    const smp = shapeSample(sh); const Sm = shapeMatrix(sh);
    p = m3v(Sm, smp.p); p[0] += sh.pos ? sh.pos[0] : 0; p[1] += sh.pos ? sh.pos[1] : 0; p[2] += sh.pz || 0;
    d = normalize(m3v(sh._r, smp.d));
  }
  const sp = ev(c.speed, k);
  let v = [d[0] * sp, d[1] * sp, d[2] * sp];
  if (c.space === 1) {
    // to world: positions through the full emitter transform, velocities too (scaled except in shape mode)
    const q = m3v(W.lin, p); p = [W.tx + q[0], W.ty + q[1], q[2]];
    if (c.scaling === 2) { const n = normalize(m3v(W.lin, d)); v = [n[0] * sp, n[1] * sp, n[2] * sp]; } else v = m3v(W.lin, v);
  } else if (c.scaling === 2) {
    // shape scaling: the speed is not scaled; compensate the frame's scale in local space
    const n = m3v(W.lin, d); const l = Math.hypot(n[0], n[1], n[2]) || 1; v = [v[0] / l, v[1] / l, v[2] / l];
  }
  const col = colEv(c.color, k);
  const life = Math.max(0.01, ev(c.life, k));
  const rot = ev(c.rot, k) * (c.flip && Math.random() < c.flip ? -1 : 1);
  s.parts.push({ p, v, age: 0, life, size: ev(c.size, k), rot, col, r1: Math.random(), r2: Math.random(), r3: Math.random(), r4: Math.random(), r5: Math.random(), r6: Math.random() });
};
// play-on-awake when the object comes alive; Play() on a system plays its child systems too
const origAwake = E._awakeTree;
E._awakeTree = (root) => {
  origAwake(root);
  if (!root.activeInHierarchy) return;
  const walk = (g) => { if (!g.activeSelf) return; for (const c of g.comps) if (c.t === 'PS') { const s = P.get(c); if (s && s.cfg.paw && !s.playing) P.play(c); } for (const ch of g.children) walk(ch); };
  walk(root);
};
E.psPlay = (g) => { const go = g.go || g; for (const c of go.compsInChildren('PS')) P.play(c); };
E.psStop = (g, clear) => { const go = g.go || g; for (const c of go.compsInChildren('PS')) P.stop(c, clear); };
})();

// ---------------------------------------------------------------- AssetKits ParticleImage (UI particles)
(() => {
const mmv = (v, t) => {
  if (v == null) return 0; if (typeof v === 'number') return v;
  const m = v.m_Mode;
  const cv = (c) => { const k = (c && c.curve) || []; if (!k.length) return 1; if (t <= k[0][0]) return k[0][1]; for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const a = k[i - 1], b = k[i]; return a[1] + (b[1] - a[1]) * ((t - a[0]) / (b[0] - a[0] || 1)); } return k[k.length - 1][1]; };
  if (m === 0) return v.m_ConstantMax;
  if (m === 3) return v.m_ConstantMin + Math.random() * (v.m_ConstantMax - v.m_ConstantMin);
  if (m === 1) return (v.m_CurveMultiplier || 1) * cv(v.m_CurveMax);
  if (m === 2) return (v.m_CurveMultiplier || 1) * (cv(v.m_CurveMin) + Math.random() * (cv(v.m_CurveMax) - cv(v.m_CurveMin)));
  return v.m_ConstantMax || 0;
};
const sep = (v, t) => (v && v.mainCurve ? (v.separated ? [mmv(v.xCurve, t), mmv(v.yCurve, t)] : [mmv(v.mainCurve, t), mmv(v.mainCurve, t)]) : [mmv(v, t), mmv(v, t)]);
const cget = (c, k) => (Array.isArray(c) ? c[k] : c ? c['rgba'[k]] : 1);
const gradCol = (g, t, rnd) => {
  if (!g) return [1, 1, 1, 1];
  const mode = g.m_Mode;
  if (mode === 0 || mode == null) { const c = g.m_ColorMax || g.m_Color; return c ? [0, 1, 2, 3].map((k) => cget(c, k)) : [1, 1, 1, 1]; }
  if (mode === 2) { const a = g.m_ColorMin, b = g.m_ColorMax; const r = rnd == null ? Math.random() : rnd; return [0, 1, 2, 3].map((k) => cget(a, k) + (cget(b, k) - cget(a, k)) * r); }
  const gr = g.m_GradientMax; if (!gr) return [1, 1, 1, 1];
  const keys = (n, pre) => { const a = []; for (let i = 0; i < n; i++) a.push([gr[pre + 'time' + i] / 65535, gr['key' + i]]); return a; };
  const ck = keys(gr.m_NumColorKeys || 2, 'c'), ak = keys(gr.m_NumAlphaKeys || 2, 'a');
  if (mode === 4) { const kk = ck[Math.floor((rnd == null ? Math.random() : rnd) * ck.length)][1]; return [cget(kk, 0), cget(kk, 1), cget(kk, 2), 1]; }
  const tt = mode === 3 ? (rnd == null ? Math.random() : rnd) : t;
  const at = (arr, k) => { for (let i = 0; i < arr.length; i++) if (tt <= arr[i][0]) { if (!i) return cget(arr[0][1], k); const a = arr[i - 1], b = arr[i]; const f = (tt - a[0]) / (b[0] - a[0] || 1); return cget(a[1], k) + (cget(b[1], k) - cget(a[1], k)) * f; } return cget(arr[arr.length - 1][1], k); };
  return [at(ck, 0), at(ck, 1), at(ck, 2), at(ak, 3)];
};
class ParticleImage extends E.Behaviour {
  awake() { this.parts = []; this.t = 0; this.acc = 0; this.playing = false; this.onFinish = []; this.onArrive = []; }
  onEnable() { if (this.d._playMode === 0) this.play(); }
  play() { this.t = 0; this.acc = 0; this.playing = true; this.emitting = true; this.bursts = (this.d._bursts || []).map((b) => ({ time: b.time || 0, count: b.count || 10, done: false })); for (const ch of this.d._children || []) { const c = E.resolve(this.go, ch); if (c && c.play && c !== this) c.play(); } }
  stop() { this.emitting = false; }
  clear() { this.parts.length = 0; }
  spawn() {
    const d = this.d; const sh = d._shape;
    let x = 0, y = 0, dx = 0, dy = 1;
    if (sh === 1) { const a = Math.random() * Math.PI * 2; const r = (d._radius || 0) * (d._emitOnSurface ? 1 : Math.sqrt(Math.random())); x = Math.cos(a) * r; y = Math.sin(a) * r; dx = Math.cos(a); dy = Math.sin(a); }
    else if (sh === 3) { x = (Math.random() - 0.5) * (d._width || 0); y = (Math.random() - 0.5) * (d._height || 0); dx = 0; dy = 1; }
    else if (sh === 2 || sh === 4) { const half = ((d._angle || 30) / 2) * E.DEG; const a = (Math.random() * 2 - 1) * half; dx = Math.sin(a); dy = Math.cos(a); }
    const k = this.t / (d._duration || 1);
    const sp = mmv(d._startSpeed, k) * 60;
    const life = Math.max(0.05, mmv(d._lifetime, k));
    const size = sep(d._startSize, k);
    const col = gradCol(d._startColor, k);
    this.parts.push({ x, y, vx: dx * sp, vy: dy * sp, age: 0, life, w: size[0], h: size[1], rot: mmv(d._startRotation, k) || 0, col, r: Math.random(), fi: null });
  }
  update(dt) {
    const d = this.d;
    if (this.playing && this.emitting) {
      this.t += dt;
      const dur = d._duration || 1;
      if (this.t >= dur) { if (d._loop) { this.t -= dur; for (const b of this.bursts) b.done = false; } else this.emitting = false; }
      if (this.emitting) {
        this.acc += (d._rate || 0) * dt; while (this.acc >= 1) { this.acc -= 1; this.spawn(); }
        for (const b of this.bursts) if (!b.done && this.t >= b.time) { b.done = true; for (let i = 0; i < b.count; i++) this.spawn(); }
      }
    }
    const grav = mmv(d._gravity, 0) * 60;
    const tgt = this.target || (d._attractorTarget ? E.resolve(this.go, d._attractorTarget) : null);
    let tp = null;
    if (tgt && tgt.wm && this.go.wm) tp = E.M.ap(E.M.inv(this.go.wm), tgt.wm[4], tgt.wm[5]);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); if (tp) for (const f of this.onArrive) f(); continue; }
      const k = p.age / p.life;
      p.vy += grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += (mmv(d._rotationOverLifetime, k) || 0) * dt;
      if (tp) { const f = E.clamp(mmv(d._toTarget, k), 0, 1); p.dx = p.x + (tp[0] - p.x) * f; p.dy = p.y + (tp[1] - p.y) * f; } else { p.dx = p.x; p.dy = p.y; }
    }
    if (this.playing && !this.emitting && !this.parts.length) { this.playing = false; for (const f of this.onFinish.slice()) f(); }
  }
  drawUI(ctx, alpha) {
    if (!this.parts.length) return;
    const d = this.d;
    let img = null, tf = null;
    if (d.m_Texture && E.D.tex[d.m_Texture]) { tf = E.D.tex[d.m_Texture][0]; img = E.texImg(tf); if (!img._ok) img = null; }
    E.setT(this.go.wm);
    const tiles = d._textureTile;
    for (const p of this.parts) {
      const k = p.age / p.life;
      const sz = d._sizeOverLifetime ? sep(d._sizeOverLifetime, k) : [1, 1];
      const lc = d._colorOverLifetime ? gradCol(d._colorOverLifetime, k, p.r) : [1, 1, 1, 1];
      const a = alpha * p.col[3] * lc[3]; if (a < 0.01) continue;
      const w = p.w * sz[0], h = p.h * sz[1];
      ctx.save(); ctx.translate(p.dx, p.dy); ctx.rotate(-p.rot * E.DEG); ctx.globalAlpha = a;
      const col = [p.col[0] * lc[0], p.col[1] * lc[1], p.col[2] * lc[2]];
      if (img) {
        let sx = 0, sy = 0, sw = img.width, sh = img.height;
        if (d._sheetModule && tiles) { const tx = tiles.x || tiles[0] || 1, ty = tiles.y || tiles[1] || 1; sw = img.width / tx; sh = img.height / ty; if (p.fi == null) p.fi = Math.floor(Math.random() * tx * ty); sx = (p.fi % tx) * sw; sy = Math.floor(p.fi / tx) * sh; }
        ctx.scale(1, -1);
        const tinted = (col[0] < 0.99 || col[1] < 0.99 || col[2] < 0.99) ? E.tinted(Object.assign([tf, sx, sy, sw, sh], { img }), [col[0], col[1], col[2]]) : null;
        if (tinted) ctx.drawImage(tinted, -w / 2, -h / 2, w, h); else ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
      } else { ctx.fillStyle = E.colorStr([col[0], col[1], col[2], 1]); ctx.fillRect(-w / 2, -h / 2, w, h); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
E.scripts['AssetKits.ParticleImage.ParticleImage'] = ParticleImage;
})();
