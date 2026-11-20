'use strict';
// The game's two sprite shaders, run for real through a small WebGL2 side canvas:
//   LevelFlow/SkinPressSprite - skin gives under the tool (press, drag, release wobble, jiggle), hair is pushed
//                               by the stroke (HairDisturbance field), hair sways idle, water waves the hair in the basin
//   LevelFlow/SwaySprite      - wet hair sways about a root
// The fragment code is a straight port of the shipped GLSL (GLES3 blob in sharedassets2/5). Sprites using these
// materials are drawn through it only while something actually moves them; otherwise they draw as plain sprites.
// The scene components (SkinPress, SkinPressPulse, ContactJiggle, HairDisturbance, HairAnchor, WaterField) set the
// shader's global uniforms the way the C# does (Shader.SetGlobalVector).
(() => {
const LF = E.LF, S = LF.S, B = E.Behaviour;
const G = (E.skinFX = {
  press: [0, 0, 0, 0], drag: [0, 0, 0, 0], shape: [0, 0, 0, 0], jigS: [0, 0, 0, 0], jigO: [0, 0, 0, 0], echo: [0, 0, 0, 0],
  ceil: [0, 0, 0, 0], hairRect: [0, 0, 0, 0], hairP: [0, 0, 0, 0], wStill: [0, 0, 0, 0], wDepth: [0, 0, 0, 0],
  hair: null, // {w,h,bytes,dirty}
  on: !/[?&]nofx=1/.test(location.search),
});
const resetGlobals = () => { for (const k of ['press', 'drag', 'shape', 'jigS', 'jigO', 'echo', 'ceil', 'hairRect', 'hairP', 'wStill', 'wDepth']) G[k] = [0, 0, 0, 0]; G.hair = null; };

const VS = `#version 300 es
in vec2 aPos; in vec2 aUV; in vec2 aW; out vec2 vUV; out vec2 vW;
void main(){ vUV=aUV; vW=aW; gl_Position=vec4(aPos,0.,1.); }`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform sampler2D uHair;
uniform int uMode; uniform float uTime; uniform vec4 uRect; uniform vec4 uColor; uniform vec2 uTexel;
uniform float uPressAmt, uHairAmt; uniform vec4 uSway, uHold, uWave;
uniform vec4 uPress, uDrag, uShape, uJigS, uJigO, uEcho, uCeil, uHairRect, uHairP, uWStill, uWDepth;
uniform vec4 uSwayPiv; uniform vec3 uSwayP;
in vec2 vUV; in vec2 vW; out vec4 o;
float bump(float d, float r){ float t=max(1.-d/max(r,1e-4),0.); return t*t*(3.-2.*t); }
float sstep(float t){ t=clamp(t,0.,1.); return t*t*(3.-2.*t); }
void main(){
  vec2 uv=vUV, w=vW; float shade=1.;
  if(uMode==1){
    float k=clamp((length(w-uSwayPiv.xy)-uSwayPiv.z)/max(uSwayPiv.w,1e-4),0.,1.); k*=k;
    float a=uTime*uSwayP.y+dot(w,vec2(.9,1.3))*uSwayP.z;
    uv+=k*uSwayP.x*vec2(sin(a),.5*sin(a*.8+1.7))*uTexel;
  } else {
    vec2 off=vec2(0.);
    if(uPressAmt>0. && !(uPress.w==0. && uJigO.x==0. && uJigO.y==0. && uJigS.w==0.)){
      float s=uPress.w*uPressAmt*(1.-uShape.z*clamp(uHairAmt,0.,1.));
      if(uCeil.z!=0.) s*=clamp((uCeil.x-w.y)/max(uCeil.y,1e-4),0.,1.);
      vec2 d=w-uPress.xy; float f=bump(length(d),uPress.z);
      vec2 dj=w-uJigS.xy; float fj=bump(length(dj),uJigS.z)*uPressAmt;
      float pin=s*uShape.x;
      vec2 p=d*(f*pin)-uDrag.xy*(s*f)-(dj*uJigS.w+uJigO.xy)*fj; float ff=f;
      if(uEcho.w!=0.){
        vec2 d2=d-uEcho.xy; float f2=bump(length(d2),uPress.z);
        vec2 dj2=dj-uEcho.xy; float fj2=bump(length(dj2),uJigS.z)*uPressAmt;
        p+=d2*(f2*pin)-uDrag.xy*(s*f2)-(dj2*uJigS.w+uJigO.xy)*fj2; ff=max(f2,f);
      }
      off=p; shade=1.-ff*ff*clamp(s,0.,1.)*uShape.y;
    }
    if(uHairP.x>0. && uHairAmt>0.){
      vec2 h=(w-uHairRect.xy)*uHairRect.zw;
      if(h.x>=0. && h.y>=0. && h.x<=1. && h.y<=1.){
        vec2 p=(textureLod(uHair,h,0.).xy*255.-128.)*uHairP.x*uHairAmt*0.00787401572;
        float r=sin(dot(w,uHairP.z*vec2(1.,.61))+uTime*uHairP.w)*uHairP.y;
        p=p+vec2(-p.y,p.x)*r; off-=p;
      }
    }
    if(uSway.x!=0.){
      float sw=abs(uSway.w)>1e-4?uSway.w:1e-4; float t=clamp((uSway.z-uv.y)/sw,0.,1.);
      if(t>0.){
        float k=t*t*(3.-2.*t)*t; float side=uv.x-.5; bool zero=false;
        if(uHold.y>0.){ k*=sstep((abs(side)-uHold.x)/uHold.y); zero=k<=0.; }
        float sd=clamp(side*6.,-1.,1.); float T=uTime*uSway.y;
        float sx=sin(T-t*1.6+sd*.6)+.3*sin(T*2.1-t*2.24+1.3);
        float sy=t*sin(sd+T*2.-t*3.2)*.35;
        if(!zero) off+=vec2(sx,sy)*k*uSway.x;
      }
    }
    if(off.x!=0. || off.y!=0.){
      vec4 dx=dFdx(vec4(vUV,vW)), dy=dFdy(vec4(vUV,vW));
      float det=dx.z*dy.w-dx.w*dy.z;
      if(abs(det)>=1e-12){ float a=(off.x*dy.w-off.y*dy.z)/det; float b=(dx.z*off.y-dx.w*off.x)/det; uv+=dx.xy*a+dy.xy*b; }
    }
    if(uWave.x>0. || uWave.y>0.){
      float st=uWStill.z>0.?sstep((length(w-uWStill.xy)-uWStill.z)/max(uWStill.w,1e-4)):1.;
      if(uWDepth.y<uWDepth.x) st*=clamp((w.y-uWDepth.y)/(uWDepth.x-uWDepth.y),0.,1.);
      if(uWDepth.w>0.) st*=clamp(uWDepth.z,0.,1.);
      if(st>0.){
        float ph=6.2831855/max(uWave.w,.01)*uTime; float fr=uWave.z*6.2831855;
        uv+=vec2(sin(uv.y*fr*1.93-1.31*ph)*.3+sin(uv.y*fr+ph)*.7, sin(uv.x*fr*.74-.8*ph+1.7))*uWave.xy*st;
      }
    }
  }
  if(uv.x<uRect.x||uv.y<uRect.y||uv.x>uRect.z||uv.y>uRect.w){ o=vec4(0.); return; }
  vec4 c=texture(uTex,vec2(uv.x,1.-uv.y))*uColor;
  o=vec4(c.rgb*shade*c.a,c.a);
}`;

let gl = null, cv = null, prog = null, U = {}, buf = null, hairTex = null, failed = false;
const CW = 1024, CH = 1024;
let texs = new WeakMap();
const disable = (why) => { if (!failed) console.warn('skinfx off, sprites drawn plain:', why); failed = true; gl = null; };
const init = () => {
  if (gl || failed) return !!gl;
  try {
    cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    // a lost context draws nothing: fall back to plain sprites instead of losing the character
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); disable('context lost'); });
    gl = cv.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, alpha: true, depth: false, stencil: false });
    if (!gl) throw new Error('no webgl2');
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(prog, i); U[u.name] = gl.getUniformLocation(prog, u.name); }
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const st = 6 * 4;
    for (const [nm, off] of [['aPos', 0], ['aUV', 8], ['aW', 16]]) { const l = gl.getAttribLocation(prog, nm); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, st, off); }
    gl.uniform1i(U.uTex, 0); gl.uniform1i(U.uHair, 1);
    hairTex = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, hairTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 1, 1, 0, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array([128, 128]));
    gl.disable(gl.BLEND);
    return true;
  } catch (e) { console.warn('skinfx disabled:', e); failed = true; gl = null; return false; }
};
const texFor = (img, live) => {
  let t = texs.get(img);
  gl.activeTexture(gl.TEXTURE0);
  if (t && (!live || t.f === E.frame)) { gl.bindTexture(gl.TEXTURE_2D, t.t); return t.t; }
  if (!t) {
    t = { t: gl.createTexture(), f: -1 }; texs.set(img, t);
    gl.bindTexture(gl.TEXTURE_2D, t.t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  } else gl.bindTexture(gl.TEXTURE_2D, t.t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  t.f = E.frame;
  return t.t;
};
let hairUploaded = null;
const uploadHair = () => {
  const h = G.hair; if (!h || (!h.dirty && hairUploaded === h)) return;
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, hairTex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, h.w, h.h, 0, gl.RG, gl.UNSIGNED_BYTE, h.bytes);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  h.dirty = false; hairUploaded = h;
};
const fxOf = (c) => { if (c._fxm === undefined) { const m = c.mat && E.D.mats && E.D.mats[c.mat]; c._fxm = (m && m.fx) || null; } return c._fxm; };
const circleHits = (b, x, y, r) => { const cx = Math.max(b[0], Math.min(x, b[2])), cy = Math.max(b[1], Math.min(y, b[3])); return (cx - x) * (cx - x) + (cy - y) * (cy - y) < r * r; };
// does anything move this sprite right now
const active = (p, b) => {
  if (p.sh === 'sway') return true;
  if (p.sway[0] !== 0) return true;
  if ((p.wave[0] > 0 || p.wave[1] > 0) && !(G.wDepth[3] > 0 && G.wDepth[2] <= 0.001)) return true;
  if (p.press > 0) {
    if (G.press[3] !== 0 && circleHits(b, G.press[0], G.press[1], G.press[2] + (G.echo[3] ? Math.hypot(G.echo[0], G.echo[1]) : 0))) return true;
    if ((G.jigO[0] || G.jigO[1] || G.jigS[3]) && circleHits(b, G.jigS[0], G.jigS[1], G.jigS[2] + (G.echo[3] ? Math.hypot(G.echo[0], G.echo[1]) : 0))) return true;
  }
  if (p.hair > 0 && G.hairP[0] > 0) { const r = G.hairRect; const x1 = r[0] + 1 / r[2], y1 = r[1] + 1 / r[3]; if (b[2] >= r[0] && b[0] <= x1 && b[3] >= r[1] && b[1] <= y1) return true; }
  return false;
};
const vtx = new Float32Array(24);
// draw the sprite through the shader; x,y,w,h = local quad (as drawSR passes to blit). Returns false to fall back.
// any throw in here (tainted image, driver error) must not abort the frame's drawing: switch the effect off instead
G.draw = (c, s, ov, x, y, w, h, blit) => {
  if (!G.on || failed) return false;
  try { return drawFX(c, s, ov, x, y, w, h, blit); } catch (e) { disable(e && e.message); return false; }
};
const drawFX = (c, s, ov, x, y, w, h, blit) => {
  const p = fxOf(c); if (!p) return false;
  const m = c.go.worldMatrix(); const fx = c.fx ? -1 : 1, fy = c.fy ? -1 : 1;
  const corners = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map((q) => M.ap(m, q[0] * fx, q[1] * fy));
  const b = [Math.min(...corners.map((q) => q[0])), Math.min(...corners.map((q) => q[1])), Math.max(...corners.map((q) => q[0])), Math.max(...corners.map((q) => q[1]))];
  if (!active(p, b)) return false;
  if (!init()) return false;
  const img = ov || s.img; const iw = img.width, ih = img.height; if (!iw || !ih) return false;
  // sprite rect in Unity uv (v up)
  let u0, v0, u1, v1;
  if (ov) { u0 = 0; v0 = 0; u1 = 1; v1 = 1; } else { u0 = s[1] / iw; u1 = (s[1] + s[3]) / iw; v0 = 1 - (s[2] + s[4]) / ih; v1 = 1 - s[2] / ih; }
  // resolution: about one texel per device pixel, never more than the texture has
  const dm = c.go.wm; const devW = Math.hypot(dm[0], dm[1]) * Math.abs(w), devH = Math.hypot(dm[2], dm[3]) * Math.abs(h);
  const texW = (u1 - u0) * iw, texH = (v1 - v0) * ih;
  let W = Math.max(2, Math.min(texW, devW * 1.1)), H = Math.max(2, Math.min(texH, devH * 1.1));
  const k = Math.min(1, CW / W, CH / H); W = Math.ceil(W * k); H = Math.ceil(H * k);
  gl.viewport(0, 0, W, H);
  gl.useProgram(prog);
  texFor(img, !!ov);
  uploadHair();
  const uvs = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]], pos = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let i = 0; i < 4; i++) { vtx.set([pos[i][0], pos[i][1], uvs[i][0], uvs[i][1], corners[i][0], corners[i][1]], i * 6); }
  gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, vtx, gl.STREAM_DRAW);
  const col = c.color; gl.uniform4f(U.uColor, col[0], col[1], col[2], 1);
  gl.uniform4f(U.uRect, u0 - 1e-4, v0 - 1e-4, u1 + 1e-4, v1 + 1e-4);
  gl.uniform1f(U.uTime, E.time);
  gl.uniform2f(U.uTexel, 1 / iw, 1 / ih);
  if (p.sh === 'sway') {
    gl.uniform1i(U.uMode, 1); gl.uniform4fv(U.uSwayPiv, p.piv); gl.uniform3f(U.uSwayP, p.tex, p.spd, p.waves);
  } else {
    gl.uniform1i(U.uMode, 0);
    gl.uniform1f(U.uPressAmt, p.press); gl.uniform1f(U.uHairAmt, p.hair);
    gl.uniform4fv(U.uSway, p.sway); gl.uniform4fv(U.uHold, p.hold); gl.uniform4fv(U.uWave, p.wave);
    for (const [u, k2] of [['uPress', 'press'], ['uDrag', 'drag'], ['uShape', 'shape'], ['uJigS', 'jigS'], ['uJigO', 'jigO'], ['uEcho', 'echo'], ['uCeil', 'ceil'], ['uHairRect', 'hairRect'], ['uHairP', 'hairP'], ['uWStill', 'wStill'], ['uWDepth', 'wDepth']]) gl.uniform4fv(U[u], G[k2]);
  }
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (gl.isContextLost()) { disable('context lost'); return false; }
  // the first few times a sprite goes through the shader, make sure something came out (some GPUs/WebViews return
  // an empty buffer); if not, the effect is switched off for good and the sprite is drawn plain
  const n = (c._fxN = (c._fxN || 0) + 1);
  if (n <= 3 || n % 90 === 0) {
    let want = 0, got = 1;
    try {
      if (c._fxWant == null || ov) c._fxWant = coverage(img, ov ? 0 : s[1], ov ? 0 : s[2], ov ? iw : s[3], ov ? ih : s[4]);
      want = c._fxWant; got = coverage(cv, 0, CH - H, W, H);
    } catch (e) { /* unreadable source: skip the check */ }
    if (want > 0.02 && got < want * 0.35) { disable('empty output for ' + c.go.name + ' ' + got.toFixed(3) + '/' + want.toFixed(3)); return false; }
  }
  blit(cv, 0, CH - H, W, H, x, y, w, h);
  return true;
};
let chk = null;
const coverage = (src, sx, sy, sw, sh) => {
  if (!chk) { const k = document.createElement('canvas'); k.width = k.height = 24; chk = k.getContext('2d', { willReadFrequently: true }); }
  chk.clearRect(0, 0, 24, 24); chk.drawImage(src, sx, sy, sw, sh, 0, 0, 24, 24);
  const d = chk.getImageData(0, 0, 24, 24).data; let a = 0; for (let i = 3; i < d.length; i += 4) a += d[i]; return a / (576 * 255);
};

// ------------------------------------------------------------------ the contact the active scratch step reports each frame
// LF.contact = { p, p2, r, tool, onArt, t }  (set by ScratchStep)
const contactNow = () => { const c = LF.contact; return c && E.frame - c.f <= 1 ? c : null; };
const spring = (x, v, target, freq, damp, dt) => { const w = 2 * Math.PI * freq; v += (w * w * (target - x) - 2 * damp * w * v) * dt; x += v * dt; return [x, v]; };
const sharp = (k, dt) => 1 - Math.exp(-k * dt);

// ------------------------------------------------------------------ SkinPress: the give of the skin under the tool
class SkinPress extends B {
  awake() {
    LF.skinPress = this; resetGlobals();
    this.str = 0; this.strV = 0; this.pt = null; this.rad = 0.5; this.drag = [0, 0]; this.prev = null; this.depth = 1; this.hairShare = 0;
    this.jo = [0, 0]; this.jv = [0, 0]; this.jc = [0, 0]; this.jcT = [0, 0]; this.jr = 0; this.jrT = 0; this.sw = 0; this.swV = 0; this.swT = 0; this.jDamp = null;
    this.pulse = null; this.echo = null; this.ceil = null;
  }
  onDisable() { G.press[3] = 0; G.jigO = [0, 0, 0, 0]; G.jigS[3] = 0; }
  // a press from somewhere other than a tool: SkinPressPulse
  pulseAt(p, r, pressure, seconds) { this.pulse = { p, r, pr: pressure, until: E.time + seconds }; }
  // throw a wobble: centre, reach, first swing (world vector), swell
  jiggle(c, reach, kick, swell, tug) {
    const d = this.d; const max = d._maxJiggle || 0.12;
    const om = 2 * Math.PI * (d._jiggleFrequency || 4.5);
    this.jcT = c.slice(); if (!this.jr) this.jc = c.slice(); this.jrT = reach; if (!this.jr) this.jr = reach;
    this.jv[0] = this.jv[0] * 0.4 + E.clamp(kick[0], -max, max) * om; this.jv[1] = this.jv[1] * 0.4 + E.clamp(kick[1], -max, max) * om;
    this.swV = this.swV * 0.4 + (swell || 0) * om; this.jDamp = tug ? (d._tugDamping || 0.35) : null;
  }
  update(dt) {
    dt = Math.min(dt, 1 / 30); const d = this.d;
    let c = contactNow(); let pressure = 0, p = null, r = 0, tool = null;
    if (this.pulse) { if (E.time < this.pulse.until) { p = this.pulse.p; r = this.pulse.r; pressure = this.pulse.pr; } else this.pulse = null; }
    if (!p && c && c.onArt) {
      tool = c.tool; p = c.p;
      pressure = tool ? (tool.d._skinPressure == null ? 1 : tool.d._skinPressure) : 1;
      r = c.r * (tool && tool.d._pressReach ? tool.d._pressReach : 1);
      this.depth = tool && tool.d._pressDepth ? Math.max(1, tool.d._pressDepth) : 1;
      this.hairShare = tool && !tool.d._pressesHair ? 1 : 0;
      this.echo = c.p2 || null;
      const stop = tool && tool.d._pressStopBelow && tool.ref('_pressStopBelow');
      const sb = stop && LF.srBounds(stop); this.ceil = sb ? [sb[1], Math.max(0.01, tool.d._pressStopFade || 0.3), 1, 0] : null;
    }
    // press strength: a spring, so letting go wobbles
    [this.str, this.strV] = spring(this.str, this.strV, p ? pressure : 0, d._frequency || 4.5, d._damping == null ? 0.38 : d._damping, dt);
    if (p) {
      const tr = r * (d._radiusScale || 2.8);
      if (!this.pt || this.str < 0.02) { this.pt = p.slice(); this.rad = tr; this.prev = p.slice(); }
      if (!this.prev) this.prev = p.slice();
      const k = sharp(d._followSharpness || 20, dt);
      this.pt[0] += (p[0] - this.pt[0]) * k; this.pt[1] += (p[1] - this.pt[1]) * k; this.rad += (tr - this.rad) * k;
      const vx = (p[0] - this.prev[0]) / Math.max(dt, 1e-3), vy = (p[1] - this.prev[1]) / Math.max(dt, 1e-3); this.prev = p.slice();
      const mx = d._maxDrag || 0.05, dp = d._dragPerSpeed || 0.008;
      let gx = vx * dp, gy = vy * dp; const gl2 = Math.hypot(gx, gy); if (gl2 > mx) { gx *= mx / gl2; gy *= mx / gl2; }
      this.drag[0] += (gx - this.drag[0]) * sharp(12, dt); this.drag[1] += (gy - this.drag[1]) * sharp(12, dt);
    } else { this.drag[0] *= 1 - sharp(8, dt); this.drag[1] *= 1 - sharp(8, dt); this.prev = null; }
    const live = this.pt && Math.abs(this.str) + Math.abs(this.strV) * 0.05 > 1e-3;
    G.press = live ? [this.pt[0], this.pt[1], this.rad, this.str] : [0, 0, 0, 0];
    G.drag = [this.drag[0], this.drag[1], 0, 0];
    G.shape = [(d._pinch || 0.04) * this.depth, (d._shade || 0.05) * this.depth, this.hairShare, 0];
    G.echo = live && this.echo ? [this.echo[0] - this.pt[0], this.echo[1] - this.pt[1], 0, 1] : [0, 0, 0, 0];
    G.ceil = live && this.ceil ? this.ceil : [0, 0, 0, 0];
    // jiggle
    const jf = d._jiggleFrequency || 4.5, jd = this.jDamp != null ? this.jDamp : (d._jiggleDamping == null ? 0.11 : d._jiggleDamping);
    for (let i = 0; i < 2; i++) { const s2 = spring(this.jo[i], this.jv[i], 0, jf, jd, dt); this.jo[i] = s2[0]; this.jv[i] = s2[1]; }
    [this.sw, this.swV] = spring(this.sw, this.swV, 0, jf, jd, dt);
    const max = d._maxJiggle || 0.12; const jl = Math.hypot(this.jo[0], this.jo[1]); if (jl > max) { this.jo[0] *= max / jl; this.jo[1] *= max / jl; }
    const kf = sharp(d._jiggleFollowSharpness || 14, dt);
    this.jc[0] += (this.jcT[0] - this.jc[0]) * kf; this.jc[1] += (this.jcT[1] - this.jc[1]) * kf; this.jr += (this.jrT - this.jr) * kf;
    const moving = jl > 2e-4 || Math.hypot(this.jv[0], this.jv[1]) > 2e-3 || Math.abs(this.sw) > 2e-4;
    if (!moving) { this.jo = [0, 0]; this.jv = [0, 0]; this.sw = 0; this.swV = 0; this.jDamp = null; }
    G.jigO = moving ? [this.jo[0], this.jo[1], 0, 0] : [0, 0, 0, 0];
    G.jigS = [this.jc[0], this.jc[1], this.jr, moving ? E.clamp(this.sw, -0.3, 0.3) : 0];
  }
}
S('LevelFlow.SkinPress', SkinPress);

// a short press at this object's position, called from the level's events (a slot taking a piece)
S('LevelFlow.SkinPressPulse', class extends B {
  Pulse() {
    const d = this.d; const go = () => { if (LF.skinPress) LF.skinPress.pulseAt(this.go.worldPos(), d._radius || 1, d._pressure == null ? 0.5 : d._pressure, d._seconds || 0.1); };
    if (d._delaySeconds > 0) this.after(d._delaySeconds, go); else go();
  }
});

// throws little wobbles into the skin while the stroke keeps moving (legs, bellies)
S('LevelFlow.ContactJiggle', class extends B {
  awake() { this.next = 0; this.prev = null; }
  update(dt) {
    const d = this.d, sp = LF.skinPress; const c = contactNow(); if (!sp || !c || !c.onArt) { this.prev = null; return; }
    const v = this.prev ? [(c.p[0] - this.prev[0]) / Math.max(dt, 1e-3), (c.p[1] - this.prev[1]) / Math.max(dt, 1e-3)] : [0, 0]; this.prev = c.p.slice();
    const speed = Math.hypot(v[0], v[1]);
    const pr = c.tool ? (c.tool.d._skinPressure == null ? 1 : c.tool.d._skinPressure) : 1;
    if (speed < (d._minSpeed || 0.6) || pr < (d._minPressure || 0) || E.time < this.next) return;
    this.next = E.time + (d._interval || 0.14);
    const kick = Math.min(d._maxKick || 0.09, (d._kick || 0.035) + (d._kickPerSpeed || 0.004) * speed);
    sp.jiggle(c.p, c.r * (d._reach || 2), [v[0] / speed * kick, v[1] / speed * kick], (d._swell || 0.06) * 0.5);
  }
});

// ------------------------------------------------------------------ HairDisturbance: a grid of pushes the stroke leaves in the hair
class HairDisturbance extends B {
  awake() { this.ok = false; this.still = []; this.stillSoft = 0.3; }
  start() { this.build(); }
  build() {
    const sr = this.ref('_area'); const b = sr && LF.srBounds(sr);
    if (!b) return;
    const d = this.d; const res = d._resolution || 96; const sw = b[2] - b[0], shh = b[3] - b[1]; const L = Math.max(sw, shh);
    this.w = Math.max(2, Math.round(res * sw / L)); this.h = Math.max(2, Math.round(res * shh / L));
    this.min = [b[0], b[1]]; this.size = [sw, shh];
    const n = this.w * this.h; this.px = new Float32Array(n); this.py = new Float32Array(n); this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.mask = new Float32Array(n).fill(1);
    this.bytes = new Uint8Array(n * 2).fill(128);
    this.tex = { w: this.w, h: this.h, bytes: this.bytes, dirty: true };
    this.moving = false; this.prev = null; this.ok = true; this.buildMask();
  }
  // HairAnchor: boxes the hair is held still inside
  setStill(rects, soft) { this.still = rects || []; this.stillSoft = soft || 0.3; if (this.ok) this.buildMask(); }
  buildMask() {
    const { w, h } = this; const cw = this.size[0] / w, ch = this.size[1] / h;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = this.min[0] + (i + 0.5) * cw, y = this.min[1] + (j + 0.5) * ch; let m = 1;
      for (const r of this.still) { const dx = Math.max(r[0] - x, 0, x - (r[0] + r[2])), dy = Math.max(r[1] - y, 0, y - (r[1] + r[3])); const dd = Math.hypot(dx, dy); const t = Math.min(1, dd / Math.max(0.01, this.stillSoft)); m = Math.min(m, t * t * (3 - 2 * t)); }
      this.mask[j * w + i] = m;
    }
  }
  onDisable() { G.hairP = [0, 0, 0, 0]; }
  update(dt) {
    if (!this.ok) return; dt = Math.min(dt, 1 / 30);
    const d = this.d, c = contactNow(); const { w, h, px, py, vx, vy, mask } = this;
    const maxP = d._maxPush || 0.22;
    let touching = false, cx = 0, cy = 0, rr = 0, tx = 0, ty = 0, kg = 0;
    if (c) {
      const stir = c.tool ? (c.tool.d._hairStir == null ? 1 : c.tool.d._hairStir) : 1;
      const v = this.prev ? [(c.p[0] - this.prev[0]) / Math.max(dt, 1e-3), (c.p[1] - this.prev[1]) / Math.max(dt, 1e-3)] : [0, 0]; this.prev = c.p.slice();
      if (stir > 0) {
        touching = true; cx = c.p[0]; cy = c.p[1]; rr = c.r * (d._radiusScale || 1.8);
        tx = v[0] * (d._pushPerSpeed || 0.02) * stir; ty = v[1] * (d._pushPerSpeed || 0.02) * stir; const l = Math.hypot(tx, ty); if (l > maxP) { tx *= maxP / l; ty *= maxP / l; }
        kg = sharp(d._grip || 24, dt);
      }
    } else this.prev = null;
    if (!touching && !this.moving) { G.hairP = [0, 0, 0, 0]; return; }
    const om = 2 * Math.PI * (d._frequency || 3.2), z = d._damping == null ? 0.32 : d._damping;
    const cw = this.size[0] / w, ch = this.size[1] / h; let any = false;
    let i0 = 0, i1 = w - 1, j0 = 0, j1 = h - 1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const n = j * w + i;
      let ax = -om * om * px[n] - 2 * z * om * vx[n], ay = -om * om * py[n] - 2 * z * om * vy[n];
      vx[n] += ax * dt; vy[n] += ay * dt; px[n] += vx[n] * dt; py[n] += vy[n] * dt;
      if (touching) {
        const x = this.min[0] + (i + 0.5) * cw, y = this.min[1] + (j + 0.5) * ch; const dd = Math.hypot(x - cx, y - cy);
        if (dd < rr) { let f = 1 - dd / rr; f = f * f * (3 - 2 * f) * kg; px[n] += (tx - px[n]) * f; py[n] += (ty - py[n]) * f; vx[n] *= 1 - f; vy[n] *= 1 - f; }
      }
      const m = mask[n]; let qx = px[n] * m, qy = py[n] * m;
      if (Math.abs(px[n]) > 1e-4 || Math.abs(py[n]) > 1e-4 || Math.abs(vx[n]) > 1e-3 || Math.abs(vy[n]) > 1e-3) any = true; else { px[n] = py[n] = vx[n] = vy[n] = 0; qx = qy = 0; }
      this.bytes[n * 2] = Math.max(0, Math.min(255, Math.round(128 + qx / maxP * 127)));
      this.bytes[n * 2 + 1] = Math.max(0, Math.min(255, Math.round(128 + qy / maxP * 127)));
    }
    void i0; void i1; void j0; void j1;
    this.moving = any; this.tex.dirty = true; G.hair = this.tex;
    G.hairRect = [this.min[0], this.min[1], 1 / this.size[0], 1 / this.size[1]];
    G.hairP = any || touching ? [maxP, d._ripple || 0.35, d._rippleFrequency || 9, d._rippleSpeed || 5] : [0, 0, 0, 0];
  }
}
S('LevelFlow.HairDisturbance', HairDisturbance);
S('LevelFlow.HairAnchor', class extends B {
  start() {
    const f = this.ref('_field'); if (!f || !f.setStill) return; const d = this.d;
    const r2 = (r) => (Array.isArray(r) ? r : [r.x, r.y, r.width, r.height]);
    const rs = [d._stillArea].concat(d._alsoStill || []).filter((r) => r && (r.width || r[2])).map(r2);
    if (f.ok) f.setStill(rs, d._softness); else this.after(0.05, () => f.setStill(rs, d._softness));
  }
});

// ------------------------------------------------------------------ WaterField: how much water is in the basin, and where it stays still
S('LevelFlow.WaterField', class extends B {
  awake() { this.water = 0; }
  update(dt) {
    const d = this.d; let w = 0;
    for (const f of this.refs('_fills')) if (f && f.go.activeInHierarchy) w = Math.max(w, f.v != null ? f.v : (f.sr ? f.sr.color[3] : 0));
    for (const s of this.refs('_surfaces')) if (s && s.go.activeInHierarchy && s.progress01) w = Math.max(w, s.progress01());
    for (const l of this.refs('_layers')) if (l && l.go.activeInHierarchy && l.enabled !== false) w = Math.max(w, l.color[3]);
    this.water += (w - this.water) * sharp(1 / Math.max(0.05, d._followSeconds || 0.45) * 2.5, dt);
    const dr = d._drain && this.ref('_drain'); const dp = dr ? LF.go(dr).worldPos() : this.go.worldPos();
    G.wStill = [dp[0], dp[1], d._stillRadius || 0, d._stillSoftness || 0.5];
    G.wDepth = [d._wholeAboveY || 0, d._goneBelowY || 0, this.water, 1];
  }
  onDisable() { G.wDepth = [0, 0, 0, 1]; }
});
})();
