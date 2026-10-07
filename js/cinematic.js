/* SILO — a one-minute vertical (9:16) cinematic.
   Everything on screen is a pure function of the timeline time T: each frame resets every actor and every
   setting, finds the current shot, runs it, and renders. Nothing is accumulated, so pause, skip, the seek bar
   and re-recording always give the same picture. Shots are written against u (0..1 through the shot), never
   in fixed seconds, so changing a beat's length in story.js re-times the film. */
(function () {
'use strict';
THREE.ColorManagement.legacyMode = false;

// ───────────────────────── timeline ─────────────────────────
const S = window.STORY, BE = S.beats, NB = BE.length, B = [], ID = {};
let acc = 0; BE.forEach((b, i) => { B.push(acc); ID[b.id] = i; acc += b.d; });
const STORY_END = acc, T_BRAND = STORY_END + S.endCard, TOTAL = T_BRAND + S.brandCard;
function LT(x) { if (x <= 0) return 0; if (x >= NB) return STORY_END; const i = Math.floor(x); return B[i] + (x - i) * BE[i].d; }

const PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos;
const cl = (x, a, b) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t;
const sm = t => { t = cl(t, 0, 1); return t * t * (3 - 2 * t); }, seg = (u, a, b) => cl((u - a) / (b - a), 0, 1), ss = (u, a, b) => sm(seg(u, a, b));
const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const $ = id => document.getElementById(id);

// ───────────────────────── renderer ─────────────────────────
const frameEl = $('frame'), canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x000000, 0.01); scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(62, 9 / 16, 0.2, 7000); scene.add(camera);

// The picture is always 9:16: the largest 9:16 frame that fits the window, centred, black outside it.
function layout() {
  const W0 = window.innerWidth, H0 = window.innerHeight; let w = Math.min(W0, H0 * 9 / 16), h = w * 16 / 9;
  w = Math.max(90, Math.floor(w)); h = Math.floor(h);
  frameEl.style.width = w + 'px'; frameEl.style.height = h + 'px'; frameEl.style.left = Math.round((W0 - w) / 2) + 'px'; frameEl.style.top = Math.round((H0 - h) / 2) + 'px';
  frameEl.style.setProperty('--u', (w / 100) + 'px');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(w, h, false);
  camera.aspect = 9 / 16; camera.updateProjectionMatrix();
  $('turn').style.display = (('ontouchstart' in window) && W0 > H0 * 1.2) ? 'block' : 'none';
}

// ───────────────────────── small helpers ─────────────────────────
const C = h => new THREE.Color(h);
const M = (hex, o) => new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: 0.88, metalness: 0 }, o || {}));
const glow = (hex, k) => new THREE.MeshBasicMaterial({ color: C(hex).multiplyScalar(k || 1) });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s, open) => new THREE.CylinderGeometry(rt, rb, h, s || 16, 1, !!open);
const sph = (r, a, b) => new THREE.SphereGeometry(r, a || 16, b || 12);
function mesh(geo, mat, parent, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = m.receiveShadow = true; if (parent) parent.add(m); return m; }
function inst(geo, mat, n, parent) { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; parent.add(m); return m; }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _col = new THREE.Color();
function setI(im, i, x, y, z, ry, sx, sy, sz, rx, rz) {
  _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z);
  if (sx == null) sx = 1; _s.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m);
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function between(m, ax, ay, az, bx, by, bz) { _a.set(ax, ay, az); _b.set(bx, by, bz); m.position.copy(_a).add(_b).multiplyScalar(0.5); _b.sub(_a); const l = _b.length(); m.scale.set(1, l, 1); m.quaternion.setFromUnitVectors(_up, _b.normalize()); }
function canvasTex(w, h, draw, srgb) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb !== false) t.encoding = THREE.sRGBEncoding; return t; }

// environment map so metal and glass have something to reflect
const ENV = (function () {
  const es = new THREE.Scene(), g = new THREE.SphereGeometry(50, 24, 12), p = g.attributes.position, col = [], a = C(0xa9bcb6), b = C(0x0b0e0f), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const t = cl(p.getY(i) / 100 + 0.5, 0, 1); c.copy(b).lerp(a, t * t); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); es.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  [[20, 25, -30, 0xffd9a0], [-30, 12, 20, 0x9fe0d0], [5, 40, 10, 0xffffff]].forEach(l => { const m = new THREE.Mesh(box(14, 6, 14), glow(l[3], 3)); m.position.set(l[0], l[1], l[2]); es.add(m); });
  const pm = new THREE.PMREMGenerator(renderer), t = pm.fromScene(es, 0.03).texture; pm.dispose(); return t;
})();
const MM = (hex, o) => M(hex, Object.assign({ metalness: 0.8, roughness: 0.38, envMap: ENV, envMapIntensity: 0.9 }, o || {}));

// ───────────────────────── world state (reset every frame) ─────────────────────────
const W = { up: new THREE.Vector3(0, 1, 0) }, CP = new THREE.Vector3(), CT = new THREE.Vector3();
const sets = {};
function newSet(name, x) { const g = new THREE.Group(); g.position.x = x; g.visible = false; scene.add(g); sets[name] = g; return g; }
function use(name) { sets[name].visible = true; W.ox = sets[name].position.x; }
function cam(px, py, pz, tx, ty, tz, fov) { CP.set(px + W.ox, py, pz); CT.set(tx + W.ox, ty, tz); if (fov) W.fov = fov; }
// a point given in the camera's own frame (right, up, forward) -> world
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u2 = new THREE.Vector3();
function camPoint(r, u, f, out) { _f.copy(CT).sub(CP).normalize(); _r.crossVectors(_f, _up).normalize(); _u2.crossVectors(_r, _f); return out.copy(CP).addScaledVector(_r, r).addScaledVector(_u2, u).addScaledVector(_f, f); }

// ───────────────────────── sky, lights ─────────────────────────
const skyU = { top: { value: C(0) }, bot: { value: C(0) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: C(0xffffff) } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vD;\nvoid main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vD;\nvoid main(){ vec3 d = normalize(vD); float h = clamp(d.y + 0.02, 0.0, 1.0); vec3 c = mix(bot, top, pow(h, 0.5)); float s = max(dot(d, normalize(sunDir)), 0.0); c += sunCol * (pow(s, 800.0) * 5.0 + pow(s, 18.0) * 0.3); gl_FragColor = vec4(c, 1.0);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}'
}));
sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

const sun = new THREE.DirectionalLight(0xffffff, 1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05; scene.add(sun); scene.add(sun.target);
const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.5); scene.add(hemi);
const sunDir = new THREE.Vector3(0, 1, 0);
const PL = []; for (let i = 0; i < 4; i++) { const p = new THREE.PointLight(0xffffff, 0, 30, 1.5); scene.add(p); PL.push(p); }
function pl(i, x, y, z, hex, I, dist) { const p = PL[i]; p.position.set(x + W.ox, y, z); p.color.set(hex); p.intensity = I; p.distance = dist || 30; }

// named lighting presets; a shot picks one (W.la) or blends two (W.la -> W.lb by W.lm)
const L = {
  shaft:   { fog: 0x0b1614, fd: 0.0105, sun: 0xffdca8, si: 1.7, sd: [0.24, 1, 0.14], hs: 0x5d8a80, hg: 0x1c1610, hi: 0.62, ex: 1.25 },
  alarm:   { fog: 0x120506, fd: 0.012, sun: 0xff6a50, si: 0.9, sd: [0.24, 1, 0.14], hs: 0x6a4a50, hg: 0x100506, hi: 0.7, ex: 1.25 },
  cafe:    { fog: 0x0a0f11, fd: 0.016, sun: 0xaab8b4, si: 0.35, sd: [0.1, 1, 0.5], hs: 0x4a5a5a, hg: 0x0c0c0c, hi: 0.4, ex: 1.2 },
  airlock: { fog: 0x0e1310, fd: 0.02, sun: 0xffe6b0, si: 0.9, sd: [0.2, 1, 0.4], hs: 0x7a8468, hg: 0x14120c, hi: 0.55, ex: 1.2 },
  mech:    { fog: 0x170b05, fd: 0.015, sun: 0xffa050, si: 1.0, sd: [-0.3, 1, 0.55], hs: 0x8a5226, hg: 0x0c0705, hi: 0.6, ex: 1.25 },
  desk:    { fog: 0x040708, fd: 0.03, sun: 0x50706a, si: 0.35, sd: [0.3, 1, 0.6], hs: 0x2a3a3a, hg: 0x050505, hi: 0.35, ex: 1.25 },
  server:  { fog: 0x03070d, fd: 0.02, sun: 0x9ab8ff, si: 0.55, sd: [0.05, 1, 0.3], hs: 0x2f5594, hg: 0x03050a, hi: 0.65, ex: 1.25 },
  bench:   { fog: 0x070605, fd: 0.05, sun: 0xffd9a0, si: 1.7, sd: [0.3, 1, 0.6], hs: 0x5a4a38, hg: 0x0a0806, hi: 0.45, ex: 1.2 },
  lie:     { sky: 1, top: 0x1f74d8, bot: 0xc4e6ff, fog: 0xbfe0f5, fd: 0.0011, sun: 0xfff3d6, si: 2.3, sd: [0.5, 0.8, 0.2], hs: 0xa8d4ff, hg: 0x4c7a34, hi: 0.85, ex: 1.0 },
  dead:    { sky: 1, top: 0x5f5846, bot: 0xa69a7c, fog: 0x989077, fd: 0.0036, sun: 0xf4dfc0, si: 1.5, sd: [0.8, 0.3, 0.15], hs: 0xa39272, hg: 0x3a3024, hi: 0.75, ex: 1.0 },
  deadFar: { sky: 1, top: 0x5f5846, bot: 0xa69a7c, fog: 0x989077, fd: 0.00085, sun: 0xf4dfc0, si: 1.5, sd: [0.8, 0.3, 0.15], hs: 0xa39272, hg: 0x3a3024, hi: 0.75, ex: 1.0 }
};
const _c2 = new THREE.Color();
function mixC(out, a, b, t) { out.set(a); if (t > 0) out.lerp(_c2.set(b), t); return out; }
function applyLight(a, b, t) {
  const A = L[a], Bp = b ? L[b] : A; t = b ? t : 0; const n = k => lerp(A[k], Bp[k], t);
  mixC(scene.fog.color, A.fog, Bp.fog, t); scene.fog.density = n('fd'); scene.background.copy(scene.fog.color);
  mixC(sun.color, A.sun, Bp.sun, t); sun.intensity = n('si'); sunDir.set(lerp(A.sd[0], Bp.sd[0], t), lerp(A.sd[1], Bp.sd[1], t), lerp(A.sd[2], Bp.sd[2], t)).normalize();
  mixC(hemi.color, A.hs, Bp.hs, t); mixC(hemi.groundColor, A.hg, Bp.hg, t); hemi.intensity = n('hi'); renderer.toneMappingExposure = n('ex');
  const P = t < 0.5 ? A : Bp; sky.visible = !!P.sky;
  if (P.sky) { mixC(skyU.top.value, A.top || A.fog, Bp.top || Bp.fog, t); mixC(skyU.bot.value, A.bot || A.fog, Bp.bot || Bp.fog, t); skyU.sunCol.value.copy(sun.color); skyU.sunDir.value.copy(sunDir); }
}
// the sun's shadow box follows what the camera is looking at
function placeSun(tx, ty, tz, R) {
  const D = R * 3 + 60, sc = sun.shadow.camera; sun.target.position.set(tx, ty, tz); sun.position.set(tx + sunDir.x * D, ty + sunDir.y * D, tz + sunDir.z * D); sun.target.updateMatrixWorld();
  if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = D * 2 + R * 2; sc.updateProjectionMatrix(); }
}

// ───────────────────────── sprites: steam / dust (soft) and glints (additive) ─────────────────────────
const softTex = canvasTex(64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }, false);
const PUFF = [], GL = []; let nPuff = 0, nGl = 0;
for (let i = 0; i < 56; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; scene.add(s); PUFF.push(s); }
for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, fog: false })); s.visible = false; scene.add(s); GL.push(s); }
function puff(x, y, z, size, op, hex) { if (nPuff >= PUFF.length || op <= 0.003) return; const s = PUFF[nPuff++]; s.visible = true; s.position.set(x + W.ox, y, z); s.scale.setScalar(size); s.material.opacity = op; s.material.color.set(hex || 0xffffff); }
function glint(x, y, z, size, op, hex) { if (nGl >= GL.length || op <= 0.003) return; const s = GL[nGl++]; s.visible = true; s.position.set(x + W.ox, y, z); s.scale.setScalar(size); s.material.opacity = op; s.material.color.set(hex || 0xffffff); }
function jet(T, x, y, z, dx, dy, dz, n, amt, hex, seed) {
  for (let k = 0; k < n; k++) { const a = (T * 0.8 + k / n + rnd(seed + k) * 0.3) % 1, d = a * 2.6; puff(x + dx * d + (rnd(seed + k * 3) - 0.5) * 0.3 * a, y + dy * d + a * a * 0.8, z + dz * d, 0.35 + a * 1.7, (1 - a) * 0.42 * amt, hex); }
}

// ───────────────────────── people ─────────────────────────
// Simple stylized figures built from primitives: stocky, in coveralls, no faces.
const figs = [];
const visorMat = M(0x06090a, { metalness: 0.95, roughness: 0.12, envMap: ENV, envMapIntensity: 1.6 });
const tapeMat = M(0xe9c531, { roughness: 0.6, emissive: 0x4a3a00 });
function makeFig(o) {
  o = o || {}; const k = o.bulk || 1;
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.visible = false; g.rotation.order = 'YXZ'; scene.add(g);
  const suit = M(o.suit || 0x4a5a66, { roughness: 0.9 }), skin = M(o.skin || 0x9a745a, { roughness: 0.8 }), dark = M(o.dark || 0x17181a, { roughness: 0.7 });
  const torso = mesh(cyl(0.21 * k, 0.17 * k, 0.62, 10), suit, body, 0, 1.21, 0); torso.scale.z = 0.7;
  const hip = mesh(cyl(0.17 * k, 0.165 * k, 0.22, 10), suit, body, 0, 0.84, 0); hip.scale.z = 0.74;
  const neck = new THREE.Group(); neck.position.set(0, 1.53, 0); body.add(neck);
  if (o.helmet) {
    mesh(sph(0.215, 32, 24), M(0xb5b2a4, { roughness: 0.5 }), neck, 0, 0.16, 0);
    const v = mesh(sph(0.2, 32, 24), visorMat, neck, 0, 0.175, 0.075); v.scale.set(0.8, 0.6, 0.86);
    mesh(cyl(0.2, 0.24, 0.09, 14), dark, neck, 0, 0, 0);
    mesh(box(0.38, 0.5, 0.2), M(0x8f8d80, { roughness: 0.8 }), body, 0, 1.24, -0.23);
  } else {
    mesh(sph(0.135, 14, 10), skin, neck, 0, 0.13, 0); mesh(cyl(0.055, 0.06, 0.08, 8), skin, neck, 0, 0.02, 0);
    if (o.hair) { const h = mesh(new THREE.SphereGeometry(0.143, 14, 10, 0, TAU, 0, 1.75), M(o.hair, { roughness: 0.95 }), neck, 0, 0.135, -0.014); h.rotation.x = -0.3; if (o.pony) mesh(sph(0.06, 8, 6), h.material, neck, 0, 0.12, -0.16); }
    if (o.cap) { mesh(new THREE.SphereGeometry(0.155, 14, 10, 0, TAU, 0, 1.9), MM(0x101214, { roughness: 0.3 }), neck, 0, 0.135, 0); const v = mesh(box(0.2, 0.07, 0.06), visorMat, neck, 0, 0.14, 0.13); v.castShadow = false; }
  }
  function limb(x, y, l1, l2, r, end) {
    const a = new THREE.Group(); a.position.set(x, y, 0); body.add(a); mesh(cyl(r, r * 0.92, l1, 8), suit, a, 0, -l1 / 2, 0);
    const b = new THREE.Group(); b.position.y = -l1; a.add(b); mesh(cyl(r * 0.92, r * 0.8, l2, 8), suit, b, 0, -l2 / 2, 0); mesh(sph(r * 1.0, 8, 6), suit, b, 0, 0, 0); end(b, l2); return { a: a, b: b };
  }
  const hand = (b, l) => mesh(sph(0.058 * k, 8, 6), (o.helmet || o.gloves) ? dark : skin, b, 0, -l - 0.03, 0);
  const foot = (b, l) => mesh(box(0.11 * k, 0.08, 0.26 * k), dark, b, 0, -l + 0.04, 0.05);
  const f = { g: g, body: body, neck: neck, tapes: [],
    aL: limb(-0.275 * k, 1.45, 0.29, 0.28, 0.062 * k, hand), aR: limb(0.275 * k, 1.45, 0.29, 0.28, 0.062 * k, hand),
    lL: limb(-0.1 * k, 0.8, 0.4, 0.4, 0.088 * k, foot), lR: limb(0.1 * k, 0.8, 0.4, 0.4, 0.088 * k, foot) };
  if (o.helmet) [f.aL, f.aR, f.lL, f.lR].forEach((l, i) => { const t = mesh(cyl(0.07 * k * (i > 1 ? 1.3 : 1), 0.07 * k * (i > 1 ? 1.3 : 1), 0.05, 10), tapeMat, l.b, 0, i > 1 ? -0.3 : -0.2, 0); t.visible = false; f.tapes.push(t); });
  figs.push(f); return f;
}
function neutral(f) {
  f.g.visible = false; f.g.position.set(0, 0, 0); f.g.rotation.set(0, 0, 0); f.body.position.set(0, 0, 0); f.body.rotation.set(0, 0, 0); f.neck.rotation.set(0, 0, 0);
  [f.aL, f.aR, f.lL, f.lR].forEach(l => { l.a.rotation.set(0, 0, 0); l.b.rotation.set(0, 0, 0); }); f.aL.a.rotation.z = -0.09; f.aR.a.rotation.z = 0.09;
  f.tapes.forEach(t => { t.visible = false; }); if (f.star) f.star.visible = false;
}
function put(f, x, y, z, ry) { f.g.visible = true; f.g.position.set(x + W.ox, y, z); f.g.rotation.set(0, ry || 0, 0); return f; }
// walk cycle: ph = phase, amt = how big (1 walk, 1.5 run). A figure faces +z; forward swing is a negative x-rotation.
function walk(f, ph, amt) {
  amt = amt == null ? 1 : amt; const s = sin(ph), c = cos(ph);
  f.lL.a.rotation.x = -s * 0.55 * amt; f.lR.a.rotation.x = s * 0.55 * amt;
  f.lL.b.rotation.x = (0.12 + Math.max(0, c) * 0.75) * amt; f.lR.b.rotation.x = (0.12 + Math.max(0, -c) * 0.75) * amt;
  f.aL.a.rotation.x = s * 0.5 * amt; f.aR.a.rotation.x = -s * 0.5 * amt; f.aL.b.rotation.x = -0.4 * amt; f.aR.b.rotation.x = -0.4 * amt;
  f.body.position.y = Math.abs(c) * 0.035 * amt - 0.02 * amt; f.body.rotation.x = 0.07 * amt;
}
function sit(f) { f.body.position.y = -0.38; f.lL.a.rotation.x = f.lR.a.rotation.x = -1.45; f.lL.b.rotation.x = f.lR.b.rotation.x = 1.45; f.aL.a.rotation.x = f.aR.a.rotation.x = -0.95; f.aL.b.rotation.x = f.aR.b.rotation.x = -0.6; f.body.rotation.x = 0.1; }

const jul = makeFig({ suit: 0x3f6078, hair: 0x1a120e, pony: true });
const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.03 : 0.072, a = i * PI / 5 + PI / 2; if (i) starShape.lineTo(cos(a) * r, sin(a) * r); else starShape.moveTo(cos(a) * r, sin(a) * r); }
jul.star = mesh(new THREE.ExtrudeGeometry(starShape, { depth: 0.012, bevelEnabled: false }), M(0xe8b446, { metalness: 0.9, roughness: 0.25, envMap: ENV, envMapIntensity: 1.5, emissive: 0x5a3c08 }), jul.body, -0.095, 1.37, 0.14);
const cleaner = makeFig({ suit: 0xa9a797, bulk: 1.22, helmet: true });
const bern = makeFig({ suit: 0x5b5e62, hair: 0xa3a39f, skin: 0xb08a70 });
const mech1 = makeFig({ suit: 0x6b5a3c, hair: 0x2a2018 });
const raiders = [0, 1, 2].map(() => makeFig({ suit: 0x121416, cap: true, gloves: true, bulk: 1.1 }));

// a whole person as one turned shape, for crowds (one draw call)
const personGeo = new THREE.LatheGeometry([[0.001, 0], [0.16, 0], [0.17, 0.5], [0.2, 0.95], [0.225, 1.3], [0.17, 1.46], [0.07, 1.51], [0.07, 1.55], [0.13, 1.61], [0.14, 1.69], [0.11, 1.79], [0.001, 1.83]].map(p => new THREE.Vector2(p[0], p[1])), 8);
const crowdMat = M(0xffffff, { roughness: 0.95, side: THREE.DoubleSide });
const COVER = [0x4a6072, 0x6a5a40, 0x5a6a52, 0x77746a, 0x3c4448, 0x7a4a3a, 0x8a8472].map(C);
function crowd(n, parent, dark) { const im = inst(personGeo, crowdMat, n, parent); for (let i = 0; i < n; i++) { _col.copy(COVER[Math.floor(rnd(i * 3.3 + n) * COVER.length)]); if (dark) _col.multiplyScalar(dark); im.setColorAt(i, _col); } im.instanceColor.needsUpdate = true; return im; }

// ───────────────────────── SET: the shaft (the great stair) ─────────────────────────
const SH = { H: 7, N: 16, TURN: 3 * PI, STEPS: 45, rRing: 15 };
const stairY = th => th * SH.H / SH.TURN;
let walkers, NWALK = 110;
(function () {
  const g = newSet('shaft', 4000), TH = SH.H * SH.N, n = SH.N * SH.STEPS;
  const conc = M(0x587670, { roughness: 0.93 }), concD = M(0x334743, { roughness: 0.95 }), flat = M(0x4f6b65, { roughness: 0.93, flatShading: true, side: THREE.DoubleSide });
  const lamp = glow(0xffc46a, 2.6);
  mesh(cyl(2, 2, TH + 30, 20), concD, g, 0, TH / 2, 0);
  const wall = mesh(cyl(20.3, 20.3, TH + 30, 64, true), M(0x3d544f, { roughness: 0.95, side: THREE.BackSide }), g, 0, TH / 2, 0); wall.castShadow = false;
  const steps = inst(box(4.1, 0.5, 1.34), conc, n, g), par = inst(box(0.2, 1.1, 1.36), concD, n, g), rl = inst(box(0.24, 0.07, 0.5), lamp, Math.ceil(n / 9), g); rl.castShadow = false;
  for (let i = 0; i < n; i++) {
    const th = i * SH.TURN / SH.STEPS, y = stairY(th);
    setI(steps, i, 4 * cos(th), y - 0.25, 4 * sin(th), -th); setI(par, i, 6.05 * cos(th), y + 0.5, 6.05 * sin(th), -th);
    if (i % 9 === 0) setI(rl, i / 9, 6.05 * cos(th), y + 1.09, 6.05 * sin(th), -th);
  }
  const lathe = (pts, a, b) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 64, a || 0, b || TAU);
  const rings = inst(lathe([[15, -0.45], [20.3, -0.45], [20.3, 0], [15, 0], [15, -0.45]]), flat, SH.N + 1, g);
  const bal = inst(lathe([[15, 0], [15.25, 0], [15.25, 1.1], [15, 1.1], [15, 0]], PI / 2 + 0.1, TAU - 0.2), flat, SH.N + 1, g);
  const bridges = inst(box(9.6, 0.45, 2.6), conc, SH.N + 1, g), bpar = inst(box(9.2, 1.1, 0.18), concD, (SH.N + 1) * 2, g);
  const lamps = inst(box(0.9, 0.12, 0.34), lamp, (SH.N + 1) * 12, g); lamps.castShadow = false;
  const doors = inst(box(1.5, 2.4, 0.4), M(0x1b2424, { roughness: 0.7 }), (SH.N + 1) * 14, g);
  const lights = inst(box(1.1, 0.26, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }), (SH.N + 1) * 14, g); lights.castShadow = false;
  const warm = C(0xffbe62).multiplyScalar(2.2), teal = C(0x7fe6d2).multiplyScalar(1.5), off = C(0x1a2020);
  for (let k = 0; k <= SH.N; k++) {
    const y = k * SH.H, s = k % 2 ? -1 : 1;
    setI(rings, k, 0, y, 0, 0); setI(bal, k, 0, y, 0, k % 2 ? PI : 0);
    setI(bridges, k, s * 10.6, y - 0.225, 0, 0); setI(bpar, k * 2, s * 10.6, y + 0.55, 1.3, 0); setI(bpar, k * 2 + 1, s * 10.6, y + 0.55, -1.3, 0);
    for (let j = 0; j < 12; j++) { const a = j * TAU / 12 + 0.26; setI(lamps, k * 12 + j, 17.4 * cos(a), y - 0.5, 17.4 * sin(a), -a + PI / 2); }
    for (let j = 0; j < 14; j++) {
      const a = j * TAU / 14 + 0.12 + k * 0.2, i = k * 14 + j, r = rnd(i * 1.7);
      setI(doors, i, 20.1 * cos(a), y + 1.2, 20.1 * sin(a), -a + PI / 2); setI(lights, i, 20.0 * cos(a), y + 2.75, 20.0 * sin(a), -a + PI / 2);
      lights.setColorAt(i, r < 0.5 ? warm : r < 0.78 ? teal : off);
    }
  }
  lights.instanceColor.needsUpdate = true;
  const ribs = inst(box(0.9, TH + 30, 0.9), concD, 24, g); for (let j = 0; j < 24; j++) { const a = j * TAU / 24; setI(ribs, j, 20.1 * cos(a), TH / 2, 20.1 * sin(a), -a); }
  walkers = crowd(NWALK, g);
  const stand = crowd(120, g);
  for (let i = 0; i < 120; i++) {
    const k = 4 + Math.floor(rnd(i * 2.1) * 12);
    if (i % 5 === 0) { const s = k % 2 ? -1 : 1; setI(stand, i, s * (7.5 + rnd(i) * 6), k * SH.H, (rnd(i + 7) - 0.5) * 1.6, rnd(i + 3) * TAU, 1, 1, 0.68); }
    else { const a = rnd(i * 5.3) * TAU, r = 15.9 + rnd(i * 9.1) * 3; setI(stand, i, r * cos(a), k * SH.H, r * sin(a), rnd(i + 3) * TAU, 1, 1, 0.68); }
  }
})();
function shaftPeople(T) {
  for (let i = 0; i < NWALK; i++) {
    const dir = i % 2 ? 1 : -1, r = 3.1 + rnd(i) * 2.4, th = SH.TURN * (5 + rnd(i + 50) * 10) + dir * T * (0.8 / r) * (0.8 + rnd(i + 9) * 0.5), s = sin(th), c = cos(th);
    setI(walkers, i, r * c, stairY(th) + Math.abs(sin(T * 5 + i)) * 0.04, r * s, dir > 0 ? Math.atan2(-s, c) : Math.atan2(s, -c), 1, 1, 0.68);
  }
  walkers.instanceMatrix.needsUpdate = true;
}

// ───────────────────────── SET: outside ─────────────────────────
// Each silo sits at the bottom of a crater. hAt = ground height of the home crater.
function hAt(x, z) {
  const r = Math.hypot(x, z); if (r <= 18 || r >= 100) return 0;
  const th = Math.atan2(z, x), f = 1 + 0.06 * sin(3 * th) + 0.04 * sin(7 * th + 1);
  return 14 * (r < 60 ? sm((r - 18) / 42) : 1 - sm((r - 60) / 40)) * f;
}
const GR_DEAD = C(0x6f6757), GR_LIE = C(0x55a53c), RK_DEAD = C(0x3f372c), RK_LIE = C(0x6f7468);
const groundMat = M(0xffffff, { roughness: 1, vertexColors: true, side: THREE.DoubleSide }), flatGround = M(0xffffff, { roughness: 1 }), rockMat = M(0xffffff, { roughness: 1, flatShading: true });
let lieG, truthG, bodies, sensorGrime, birds = [], deadTree;
const CRATERS = [];
(function () {
  const g = newSet('out', 0);
  const disc = mesh(new THREE.CircleGeometry(5200, 48), flatGround, g, 0, -0.04, 0); disc.rotation.x = -PI / 2; disc.castShadow = false;
  const pts = []; for (let i = 0; i <= 24; i++) pts.push(new THREE.Vector2(18 + i * 82 / 24, 0));
  const cg = new THREE.LatheGeometry(pts, 44), pos = cg.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, hAt(x, z)); const v = 0.86 + 0.26 * rnd(Math.round(x * 3.1) + Math.round(z * 7.7) * 13); col.push(v, v, v); }
  cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cg.computeVertexNormals();
  for (let j = -2; j <= 9; j++) for (let i = -6; i <= 6; i++) CRATERS.push([i * 250 + (j & 1 ? 125 : 0), j * 235]);
  const cr = inst(cg, groundMat, CRATERS.length, g);
  CRATERS.forEach((c, i) => { const home = c[0] === 0 && c[1] === 0, s = home ? 1 : 0.86 + rnd(i * 3.7) * 0.3; setI(cr, i, c[0], 0, c[1], home ? 0 : rnd(i) * TAU, s, home ? 1 : s * (0.8 + rnd(i * 5.1) * 0.5), s); });
  // home: the way out and the sensor that everyone below is watching
  const conc = M(0x6d6a60, { roughness: 0.95 });
  mesh(cyl(4.2, 4.6, 2.5, 20), conc, g, 0, 1.25, -2.4); mesh(box(2.2, 2.1, 0.5), M(0x16181a), g, 0, 1.05, 1.95); mesh(box(3, 0.3, 6), conc, g, 0, 0.05, 4.6);
  mesh(cyl(0.07, 0.1, 1.5, 8), MM(0x2a2c2c), g, 0, 0.75, 10); mesh(box(0.3, 0.24, 0.42), MM(0x34383a), g, 0, 1.62, 10);
  const lens = mesh(cyl(0.1, 0.1, 0.03, 20), visorMat, g, 0, 1.62, 10.22); lens.rotation.x = PI / 2; const barrel = mesh(cyl(0.125, 0.125, 0.1, 20, true), MM(0x5a5f60, { side: THREE.DoubleSide }), g, 0, 1.62, 10.2); barrel.rotation.x = PI / 2;
  sensorGrime = mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ color: 0x6b5a3c, transparent: true, opacity: 0.85 }), g, 0, 1.62, 10.24); sensorGrime.castShadow = false;
  const rocks = inst(new THREE.IcosahedronGeometry(1, 0), rockMat, 260, g);
  for (let i = 0; i < 260; i++) { const a = rnd(i * 1.9) * TAU, r = 12 + rnd(i * 4.3) * 150, x = r * cos(a), z = r * sin(a), s = 0.15 + Math.pow(rnd(i * 7.1), 3) * 1.4; setI(rocks, i, x, hAt(x, z) + s * 0.2, z, rnd(i) * 6, s, s * 0.7, s, rnd(i + 1) * 3); }

  // what the helmet shows: grass, trees, clouds, birds
  lieG = new THREE.Group(); g.add(lieG);
  const trunkM = M(0x4a3524), leafM = M(0x2f8a33, { roughness: 0.9, flatShading: true });
  const trunks = inst(cyl(0.2, 0.34, 3.2, 6), trunkM, 330, lieG), leaves = inst(new THREE.IcosahedronGeometry(2.1, 1), leafM, 330, lieG);
  let nT = 0; const far = (x, z) => CRATERS.every(c => Math.hypot(x - c[0], z - c[1]) > 106);
  for (let k = 0; nT < 330 && k < 6000; k++) {
    let x, z, y;
    if (nT < 150) { const a = rnd(k * 1.3) * TAU, r = 24 + rnd(k * 3.3) * 82; x = r * cos(a); z = r * sin(a); if (Math.abs(x) < 7 && z > 0 && z < 72) continue; if (Math.hypot(x - 5.5, z - 52) < 6) continue; y = hAt(x, z); }
    else { x = (rnd(k * 2.7) - 0.5) * 1100; z = 100 + rnd(k * 6.1) * 900; if (!far(x, z)) continue; y = 0; }
    const s = 0.7 + rnd(k * 9.9) * 0.9; setI(trunks, nT, x, y + 1.5 * s, z, 0, s); setI(leaves, nT, x, y + 4.2 * s, z, rnd(k) * 6, s, s * (1 + rnd(k + 2) * 0.5), s); nT++;
  }
  trunks.count = leaves.count = nT;
  mesh(cyl(0.3, 0.5, 5, 7), trunkM, lieG, 5.5, hAt(5.5, 52) + 2.5, 52); const bigLeaf = mesh(new THREE.IcosahedronGeometry(3.6, 1), leafM, lieG, 5.5, hAt(5.5, 52) + 7, 52); bigLeaf.scale.y = 1.2;
  const grass = inst(new THREE.ConeGeometry(0.13, 0.6, 4), M(0x74c043, { roughness: 1 }), 900, lieG); grass.castShadow = false;
  for (let i = 0; i < 900; i++) { const x = (rnd(i * 1.7) - 0.5) * 36, z = 5 + rnd(i * 2.9) * 64; setI(grass, i, x, hAt(x, z) + 0.25, z, rnd(i) * 6, 0.7 + rnd(i * 3) * 0.9); }
  const cloudM = new THREE.SpriteMaterial({ map: softTex, transparent: true, depthWrite: false, opacity: 0.9, fog: false });
  for (let i = 0; i < 9; i++) { const s = new THREE.Sprite(cloudM); s.position.set((rnd(i * 3) - 0.5) * 2400, 380 + rnd(i * 7) * 260, (i % 3 === 0 ? -1 : 1) * (500 + rnd(i * 5) * 1300)); s.scale.set(520 + rnd(i) * 420, 190 + rnd(i * 2) * 90, 1); lieG.add(s); }
  const wingG = new THREE.BufferGeometry(); wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.28, 0, 0, -0.28, 1.2, 0, 0], 3));
  const birdM = new THREE.MeshBasicMaterial({ color: 0x14161a, side: THREE.DoubleSide });
  for (let i = 0; i < 12; i++) { const b = new THREE.Group(), l = new THREE.Mesh(wingG, birdM), r = new THREE.Mesh(wingG, birdM); r.scale.x = -1; b.add(l); b.add(r); b.visible = false; b.rotation.order = 'YXZ'; lieG.add(b); birds.push({ g: b, l: l, r: r }); }

  // what is really there: the dead, the dead tree, the other silos, the old city
  truthG = new THREE.Group(); g.add(truthG);
  bodies = inst(personGeo, M(0xa39f8c, { roughness: 0.95, side: THREE.DoubleSide }), 6, truthG);
  const bark = M(0x1d1712, { roughness: 1 }); deadTree = new THREE.Group(); deadTree.position.set(5.5, hAt(5.5, 52), 52); truthG.add(deadTree);
  const tr = mesh(cyl(0.16, 0.45, 5.2, 7), bark, deadTree, 0, 2.6, 0); tr.rotation.z = 0.08;
  [[0.4, 3.6, 0, 0.9, 2.6], [-0.5, 4.3, 0.2, -0.8, 2.2], [0.1, 5.2, -0.3, 0.35, 2.4], [-0.2, 5.6, 0.3, -0.4, 1.8], [0.7, 4.9, 0.4, 1.2, 1.5], [-0.9, 3.4, -0.3, -1.25, 1.4]].forEach(b => { const m = mesh(cyl(0.035, 0.1, b[4], 5), bark, deadTree, b[0] + sin(b[3]) * b[4] * -0.5 * -1, b[1] + cos(b[3]) * b[4] * 0.5, b[2]); m.rotation.z = -b[3]; });
  const drums = inst(cyl(5, 5.6, 2.6, 12), conc, CRATERS.length, truthG); CRATERS.forEach((c, i) => setI(drums, i, c[0], (c[0] === 0 && c[1] === 0) ? -20 : 1.3, c[1], 0));
  const city = inst(box(1, 1, 1), M(0x35312b, { roughness: 1 }), 120, truthG); city.castShadow = false;
  for (let i = 0; i < 120; i++) { const top = i >= 70, j = top ? i - 70 : i, x = (rnd(j * 3.1) - 0.5) * 3200, z = 1650 + rnd(j * 5.7) * 600, h = 130 + Math.pow(rnd(j * 8.3), 2) * 480, w = 45 + rnd(j * 2.3) * 70; if (top) setI(city, i, x + w * 0.18, h + h * 0.09, z, 0, w * 0.5, h * 0.2, w * 0.5, 0, 0.1); else setI(city, i, x, h / 2, z, rnd(j) * 0.6, w, h, w * 0.8, 0, (rnd(j * 4.4) - 0.5) * 0.12); }
})();
function applyLie(v) {
  groundMat.color.lerpColors(GR_DEAD, GR_LIE, v); flatGround.color.copy(groundMat.color).multiplyScalar(0.97); rockMat.color.lerpColors(RK_DEAD, RK_LIE, v);
  lieG.visible = v > 0.5; truthG.visible = v <= 0.5;
}
const BODY = [[-3.2, 25, 0.5], [3.8, 29.5, 2.1], [-1.6, 37, 1.2], [4.4, 40, 0.2], [-4.6, 43.5, 2.7], [2.2, 32.6, 0]];
function outsideUpdate(T) {
  for (let i = 0; i < 6; i++) { const b = BODY[i], show = i < 5 || T >= B[ID.fall] + BE[ID.fall].d; setI(bodies, i, b[0], show ? hAt(b[0], b[1]) + 0.2 : -30, b[1], b[2], 1, 1, 0.7, PI / 2 - 0.25); }
  bodies.instanceMatrix.needsUpdate = true; sensorGrime.material.opacity = 0.85 * W.grime;
}
function flock(T, cx, cy, cz, heading) {
  for (let i = 0; i < birds.length; i++) {
    const b = birds[i], row = Math.ceil(i / 2), side = i % 2 ? 1 : -1, lx = side * row * 2.3, lz = -row * 2.1, c = cos(heading), s = sin(heading), fl = sin(T * 9 + i * 1.7) * 0.75;
    b.g.visible = true; b.g.position.set(cx + lx * c + lz * s, cy + sin(T * 1.3 + i) * 0.7, cz - lx * s + lz * c); b.g.rotation.y = heading + PI / 2; b.l.rotation.z = fl; b.r.rotation.z = -fl;
  }
}
// the arm of the person whose eyes we are looking through
const arm = mesh(cyl(0.05, 0.062, 1, 10), M(0xa9a797, { roughness: 0.9 }), scene), glove = mesh(sph(0.062, 12, 10), M(0x2c2e31, { roughness: 0.7 }), scene);
const pad = mesh(new THREE.IcosahedronGeometry(0.1, 1), M(0xe2dccb, { roughness: 1, flatShading: true }), scene); pad.scale.set(1.25, 0.5, 1.1);
const armTape = mesh(cyl(0.066, 0.066, 0.05, 12), tapeMat, scene);
const _h = new THREE.Vector3(), _sh = new THREE.Vector3();
function povArm(sh, h, tape) { arm.visible = glove.visible = true; between(arm, sh.x, sh.y, sh.z, h.x, h.y, h.z); glove.position.copy(h); if (tape) { armTape.visible = true; armTape.position.copy(sh).lerp(h, 0.84); armTape.quaternion.copy(arm.quaternion); } }

// ───────────────────────── SET: the cafeteria and its screen ─────────────────────────
const rt = new THREE.WebGLRenderTarget(704, 640), sensorCam = new THREE.PerspectiveCamera(24, 6.6 / 5.9, 0.3, 4000);
(function () {
  const g = newSet('cafe', 2000), wallM = M(0x2a3431, { roughness: 0.95 });
  mesh(box(24, 0.2, 22), M(0x1a1f21, { roughness: 0.55, metalness: 0.3, envMap: ENV, envMapIntensity: 0.4 }), g, 0, -0.1, 0);
  mesh(box(24, 10, 0.4), wallM, g, 0, 5, -7.5); mesh(box(0.4, 10, 22), wallM, g, -9, 5, 0); mesh(box(0.4, 10, 22), wallM, g, 9, 5, 0); mesh(box(24, 0.4, 22), wallM, g, 0, 7.3, 0);
  mesh(box(7.1, 6.4, 0.2), M(0x0c0e0e), g, 0, 3.65, -7.28);
  const scr = mesh(new THREE.PlaneGeometry(6.6, 5.9), new THREE.MeshBasicMaterial({ map: rt.texture, color: C(0xffffff).multiplyScalar(1.25) }), g, 0, 3.65, -7.16); scr.castShadow = false;
  const lines = canvasTex(4, 256, (x) => { x.clearRect(0, 0, 4, 256); x.fillStyle = 'rgba(0,0,0,.22)'; for (let y = 0; y < 256; y += 4) x.fillRect(0, y, 4, 1.4); }, false);
  const ov = mesh(new THREE.PlaneGeometry(6.6, 5.9), new THREE.MeshBasicMaterial({ map: lines, transparent: true }), g, 0, 3.65, -7.14); ov.castShadow = false;
  const strip = inst(box(3.2, 0.08, 0.3), glow(0x9fb8b0, 0.9), 6, g); for (let i = 0; i < 6; i++) setI(strip, i, (i % 2 ? 2.6 : -2.6), 7.06, -5 + Math.floor(i / 2) * 3.2, 0);
  const tables = inst(box(2.4, 0.09, 0.9), M(0x3a4442, { roughness: 0.6 }), 8, g); for (let i = 0; i < 8; i++) setI(tables, i, (i % 2 ? 5.4 : -5.4), 0.78, -4.5 + Math.floor(i / 2) * 2.4, 0);
  const cr = crowd(46, g, 0.55), fixed = [[-0.95, -3.3], [0.75, -3.6], [-0.1, -4.4], [1.7, -2.6], [-1.9, -2.9], [0.2, 0.9], [-1.0, 1.4], [1.15, 1.7], [-2.3, 0.3], [2.4, 0.6]];
  for (let i = 0; i < 46; i++) { const p = fixed[i] || [(rnd(i * 2.3) - 0.5) * 11, -5 + rnd(i * 5.1) * 6.5]; setI(cr, i, p[0], 0, p[1], PI + (rnd(i) - 0.5) * 0.4, 0.94 + rnd(i * 7) * 0.12, 0.92 + rnd(i * 9) * 0.14, 0.68); }
})();

// ───────────────────────── SET: the airlock ─────────────────────────
let hatch, hatchGlow;
(function () {
  const g = newSet('airlock', 2200), wallM = M(0x4b534a, { roughness: 0.9 }), dk = M(0x1c201d, { roughness: 0.8 }), yel = M(0xcfa520, { roughness: 0.7 });
  mesh(box(4.8, 0.2, 10), MM(0x25292a, { roughness: 0.6 }), g, 0, -0.1, -0.3); mesh(box(4.8, 0.3, 10), dk, g, 0, 4.75, -0.3);
  mesh(box(0.3, 4.8, 10), wallM, g, -2.35, 2.3, -0.3); mesh(box(0.3, 4.8, 10), wallM, g, 2.35, 2.3, -0.3); mesh(box(4.8, 4.8, 0.3), wallM, g, 0, 2.3, -5.1); mesh(box(4.8, 4.8, 0.3), wallM, g, 0, 2.3, 4.9);
  const ribs = inst(box(0.25, 4.6, 0.3), dk, 10, g), band = inst(box(0.06, 0.28, 9.6), yel, 2, g);
  for (let i = 0; i < 10; i++) setI(ribs, i, i % 2 ? 2.15 : -2.15, 2.3, -4 + Math.floor(i / 2) * 2, 0);
  setI(band, 0, -2.17, 1.15, -0.3, 0); setI(band, 1, 2.17, 1.15, -0.3, 0);
  const pipes = inst(cyl(0.11, 0.11, 9.6, 8), MM(0x555a52), 3, g); for (let i = 0; i < 3; i++) setI(pipes, i, -1.2 + i * 1.2, 4.45, -0.3, 0, 1, 1, 1, PI / 2);
  const lamps = inst(box(0.7, 0.1, 0.24), glow(0xffc46a, 2.4), 4, g); lamps.castShadow = false; for (let i = 0; i < 4; i++) setI(lamps, i, i % 2 ? 1.5 : -1.5, 4.55, -3 + Math.floor(i / 2) * 3.4, 0);
  const ring = mesh(new THREE.TorusGeometry(1.62, 0.2, 10, 40), MM(0x3a3f3b), g, 0, 1.9, -4.9);
  hatchGlow = mesh(new THREE.CircleGeometry(1.55, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), g, 0, 1.9, -4.93); hatchGlow.castShadow = false;
  hatch = new THREE.Group(); hatch.position.set(-1.6, 1.9, -4.86); g.add(hatch);
  const d = mesh(cyl(1.56, 1.56, 0.16, 40), MM(0x5a6058, { roughness: 0.5 }), hatch, 1.6, 0, 0); d.rotation.x = PI / 2;
  mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 24), MM(0xb9a23a, { roughness: 0.4 }), hatch, 1.6, 0, 0.16); const sp = inst(box(0.92, 0.05, 0.05), MM(0xb9a23a), 3, hatch); for (let i = 0; i < 3; i++) setI(sp, i, 1.6, 0, 0.16, 0, 1, 1, 1, 0, i * PI / 3);
  const bolts = inst(cyl(0.07, 0.07, 0.08, 6), MM(0x2c302d), 12, hatch); for (let i = 0; i < 12; i++) setI(bolts, i, 1.6 + cos(i * TAU / 12) * 1.3, sin(i * TAU / 12) * 1.3, 0.1, 0, 1, 1, 1, PI / 2);
  void ring;
})();

// ───────────────────────── SET: Mechanical, the generator ─────────────────────────
let rotor;
(function () {
  const g = newSet('mech', 2400), iron = MM(0x3a3d36, { roughness: 0.55 }), rust = M(0x5a3a24, { roughness: 0.9 }), dk = M(0x14110e, { roughness: 0.9 });
  mesh(box(40, 0.2, 30), MM(0x1d1a17, { roughness: 0.7 }), g, 0, -0.1, 0); mesh(box(40, 30, 0.5), dk, g, 0, 15, -16);
  const h = mesh(cyl(5.3, 5.3, 7, 40), iron, g, 0, 6.5, -9.6); h.rotation.x = PI / 2; mesh(box(9, 2.2, 7), rust, g, 0, 1.1, -9.6);
  const core = mesh(new THREE.CircleGeometry(4.6, 40), glow(0xff7a22, 0.55), g, 0, 6.5, -6.06); core.castShadow = false;
  rotor = new THREE.Group(); rotor.position.set(0, 6.5, -5.9); g.add(rotor);
  const hub = mesh(cyl(1.0, 1.0, 0.7, 20), iron, rotor); hub.rotation.x = PI / 2; mesh(new THREE.TorusGeometry(4.5, 0.36, 10, 48), iron, rotor);
  const spokes = inst(box(8.6, 0.5, 0.3), iron, 4, rotor); for (let i = 0; i < 4; i++) setI(spokes, i, 0, 0, 0, 0, 1, 1, 1, 0, i * PI / 4);
  const rim = mesh(new THREE.TorusGeometry(5.3, 0.28, 8, 48), rust, g, 0, 6.5, -6.1); void rim;
  const pipes = inst(cyl(0.45, 0.45, 26, 10), rust, 6, g); [[-6.6, -8], [-7.8, -10.5], [6.4, -7.6], [7.9, -10], [-4.4, -13], [4.8, -13.4]].forEach((p, i) => setI(pipes, i, p[0], 13, p[1], 0));
  const hp = inst(cyl(0.3, 0.3, 30, 8), iron, 3, g); for (let i = 0; i < 3; i++) setI(hp, i, 0, 13.5 + i * 2.6, -12 - i, 0, 1, 1, 1, 0, PI / 2);
  // the catwalk she stands on
  mesh(box(9, 0.14, 2.4), MM(0x2a2c2a, { roughness: 0.6 }), g, 0, -0.03, 2.8); const posts = inst(cyl(0.035, 0.035, 1.05, 6), iron, 10, g); for (let i = 0; i < 10; i++) setI(posts, i, -4.4 + i * 0.98, 0.52, 1.65, 0);
  const rl = mesh(cyl(0.04, 0.04, 9, 6), iron, g, 0, 1.05, 1.65); rl.rotation.z = PI / 2;
  const lamps = inst(box(0.5, 0.12, 0.3), glow(0xffa24a, 2.2), 4, g); lamps.castShadow = false; [[-6.6, 9, -7.4], [6.4, 11, -7], [-7.8, 15, -9.9], [7.9, 17, -9.4]].forEach((p, i) => setI(lamps, i, p[0], p[1], p[2], 0));
})();

// ───────────────────────── SET: the desk and the hard drive ─────────────────────────
let monImg, monStatic;
(function () {
  const g = newSet('desk', 2600), dk = M(0x191b1a, { roughness: 0.8 });
  mesh(box(8, 0.2, 8), dk, g, 0, -0.1, 0); mesh(box(8, 5, 0.3), M(0x1f2624), g, 0, 2.5, -1.9);
  mesh(box(1.9, 0.07, 0.85), M(0x3b3227, { roughness: 0.7 }), g, 0, 0.78, -1.05); mesh(box(0.08, 0.76, 0.75), dk, g, -0.88, 0.38, -1.05); mesh(box(0.08, 0.76, 0.75), dk, g, 0.88, 0.38, -1.05);
  mesh(box(0.66, 0.54, 0.5), M(0x8d8a7c, { roughness: 0.7 }), g, 0, 1.16, -1.2); mesh(box(0.3, 0.08, 0.3), M(0x7b796c), g, 0, 0.85, -1.2); mesh(box(0.5, 0.03, 0.18), M(0x6f6d62), g, 0, 0.83, -0.78);
  const pg = new THREE.PlaneGeometry(0.54, 0.42);
  monImg = mesh(pg, new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(256, 200, (x, w, h) => {
    const s = x.createLinearGradient(0, 0, 0, h); s.addColorStop(0, '#2f86e0'); s.addColorStop(0.62, '#d2edff'); x.fillStyle = s; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff6c8'; x.beginPath(); x.arc(200, 40, 16, 0, 7); x.fill();
    x.fillStyle = '#3f9a3c'; x.beginPath(); x.moveTo(0, 150); x.bezierCurveTo(60, 95, 120, 120, 256, 105); x.lineTo(256, 200); x.lineTo(0, 200); x.fill();
    x.fillStyle = '#2c7a2c'; x.beginPath(); x.moveTo(0, 175); x.bezierCurveTo(90, 135, 170, 170, 256, 148); x.lineTo(256, 200); x.lineTo(0, 200); x.fill();
    x.fillStyle = '#1f5f24'; [[40, 138, 13], [70, 128, 9], [176, 132, 12], [214, 124, 8]].forEach(t => { x.beginPath(); x.arc(t[0], t[1], t[2], 0, 7); x.fill(); });
    x.strokeStyle = '#111'; x.lineWidth = 2.2; [[70, 50], [96, 38], [120, 56], [146, 44], [108, 72], [58, 76]].forEach(b => { x.beginPath(); x.moveTo(b[0] - 9, b[1] - 4); x.quadraticCurveTo(b[0] - 4, b[1] - 8, b[0], b[1]); x.quadraticCurveTo(b[0] + 4, b[1] - 8, b[0] + 9, b[1] - 4); x.stroke(); });
    x.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < h; y += 3) x.fillRect(0, y, w, 1);
  }) }), g, 0, 1.17, -0.945); monImg.castShadow = false;
  monStatic = mesh(pg, new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(128, 100, (x, w, h) => { const d = x.createImageData(w, h); for (let i = 0; i < w * h; i++) { const v = 40 + Math.floor(rnd(i * 1.37) * 170); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; } x.putImageData(d, 0, 0); }) }), g, 0, 1.17, -0.944); monStatic.castShadow = false;
  mesh(box(0.17, 0.04, 0.12), MM(0x8a8f90, { roughness: 0.25 }), g, 0.52, 0.835, -0.86);
  const cable = mesh(cyl(0.008, 0.008, 0.36, 5), dk, g, 0.36, 0.83, -1.0); cable.rotation.z = PI / 2; cable.rotation.y = 0.7;
})();

// ───────────────────────── SET: the server room ─────────────────────────
let leds, monitors; const NLED = 16 * 30, NMON = 24;
(function () {
  const g = newSet('server', 2800), blk = MM(0x0d0f12, { roughness: 0.45 });
  mesh(box(12, 0.2, 24), MM(0x0a0d12, { roughness: 0.22, envMapIntensity: 1.2 }), g, 0, -0.1, -5); mesh(box(12, 0.3, 24), M(0x080a0c), g, 0, 5.75, -5); mesh(box(12, 6, 0.3), M(0x0c1014), g, 0, 3, -14.3);
  mesh(box(0.3, 6, 24), M(0x0b0e12), g, -3.2, 3, -5); mesh(box(0.3, 6, 24), M(0x0b0e12), g, 3.2, 3, -5);
  const racks = inst(box(1.15, 2.8, 1.5), blk, 16, g); leds = inst(new THREE.PlaneGeometry(0.06, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }), NLED, g); leds.castShadow = false;
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1, z = 1.6 - Math.floor(i / 2) * 1.78; setI(racks, i, side * 2.0, 1.4, z, 0);
    for (let j = 0; j < 30; j++) setI(leds, i * 30 + j, side * 1.42, 0.35 + Math.floor(j / 5) * 0.41 + rnd(i * 30 + j) * 0.1, z - 0.5 + (j % 5) * 0.25, -side * PI / 2);
  }
  const strips = inst(box(0.12, 0.05, 1.2), glow(0xa9c8ff, 1.8), 8, g); strips.castShadow = false; for (let i = 0; i < 8; i++) setI(strips, i, 0, 5.55, 1.6 - i * 1.78, 0);
  monitors = inst(new THREE.PlaneGeometry(0.98, 0.64), new THREE.MeshBasicMaterial({ color: 0xffffff }), NMON, g); monitors.castShadow = false;
  for (let i = 0; i < NMON; i++) setI(monitors, i, -1.62 + (i % 4) * 1.08, 0.95 + Math.floor(i / 4) * 0.74, -14.1, 0);
  mesh(box(4.6, 4.8, 0.12), M(0x050607), g, 0, 2.85, -14.18);
})();
const LEDC = [C(0x3f8cff).multiplyScalar(2.2), C(0x35e6c8).multiplyScalar(2), C(0xffffff).multiplyScalar(1.6), C(0xffb040).multiplyScalar(2)], LEDOFF = C(0x05080c);
function serverBlink(T) {
  for (let i = 0; i < NLED; i++) leds.setColorAt(i, rnd(i * 3.1 + Math.floor(T * (3 + rnd(i) * 9))) > 0.42 ? LEDC[i % 7 === 0 ? 3 : i % 3] : LEDOFF);
  leds.instanceColor.needsUpdate = true;
  for (let i = 0; i < NMON; i++) { const fl = rnd(i * 7.7 + Math.floor(T * 6)) > 0.9 ? 0.35 : 1, b = (0.35 + rnd(i * 2.9) * 0.5) * fl; _col.set(i % 9 === 4 ? 0xc04a3a : i % 2 ? 0x4fb8a6 : 0x6f8f9a).multiplyScalar(b * 1.5); monitors.setColorAt(i, _col); }
  monitors.instanceColor.needsUpdate = true;
}

// ───────────────────────── SET: the workbench (the tape) ─────────────────────────
let tapeBits, tapeRoll, tapeHand; const NTAPE = 64;
(function () {
  const g = newSet('bench', 3000);
  mesh(box(3, 0.1, 2), M(0x33291f, { roughness: 0.8 }), g, 0, -0.3, 0); mesh(box(3, 3, 0.2), M(0x14110e), g, 0, 1, -1);
  const sl = mesh(cyl(0.078, 0.092, 0.72, 16), M(0xa9a797, { roughness: 0.9 }), g, -0.28, 0, 0); sl.rotation.z = PI / 2;
  const cuff = mesh(cyl(0.085, 0.085, 0.07, 16), M(0x2b2d2f, { roughness: 0.6 }), g, 0.1, 0, 0); cuff.rotation.z = PI / 2;
  const gl = M(0x3a3d41, { roughness: 0.7 }); mesh(box(0.2, 0.07, 0.17), gl, g, 0.25, 0, 0); const fingers = inst(cyl(0.02, 0.017, 0.13, 6), gl, 4, g); for (let i = 0; i < 4; i++) setI(fingers, i, 0.4, -0.012, -0.06 + i * 0.04, 0, 1, 1, 1, 0, PI / 2 + 0.15);
  const th = mesh(cyl(0.022, 0.018, 0.1, 6), gl, g, 0.27, 0.01, 0.11); th.rotation.x = PI / 2 - 0.4; th.rotation.z = 0.5;
  tapeBits = inst(box(0.052, 0.008, 0.024), tapeMat, NTAPE, g);
  tapeRoll = mesh(new THREE.TorusGeometry(0.055, 0.026, 10, 24), tapeMat, g); tapeHand = mesh(sph(0.05, 12, 10), M(0x6a5a48, { roughness: 0.8 }), g);
  const tools = inst(box(0.5, 0.04, 0.08), MM(0x6a6e70), 3, g); for (let i = 0; i < 3; i++) setI(tools, i, -0.7 + i * 0.5, -0.23, -0.5 - i * 0.1, 0.4 + i);
})();

// ───────────────────────── the shots ─────────────────────────
const shots = []; function shot(id, fn) { shots[ID[id]] = fn; }
const inGlitch = (b, u) => (b.glitch || []).some(w => u >= w[0] && u < w[1]);
const putO = (f, x, z, ry) => put(f, x, hAt(x, z), z, ry);
function dust(T, z0) { for (let k = 0; k < 8; k++) { const x = ((T * 3.2 + k * 13.7) % 64) - 32, z = z0 + rnd(k * 3.3) * 34; puff(x - W.ox, hAt(x, z) + 1.2 + rnd(k) * 2, z, 7 + rnd(k * 5) * 6, 0.11, 0x9c8a66); } }
function screen(fov, tx, ty, tz) { W.screen = { fov: fov, tx: tx, ty: ty, tz: tz }; }

// 1. The fall down the shaft (the title sits over this shot)
shot('shaft', (u, t, T) => {
  use('shaft'); W.la = 'shaft'; shaftPeople(T); W.shR = 34;
  const y = 100 - 27 * Math.pow(u, 1.25), a = 0.2 + u * 0.55; W.up.set(sin(a), 0, -cos(a));
  cam(0, y, 10.6, 0, y - 30, 7.6, 74); pl(0, 0, y - 9, 10, 0xffc070, 1.7, 40); pl(1, 0, y - 27, 9, 0x6fd0c0, 1.3, 46);
});
// 2. The levels, and the people on the stairs
shot('levels', (u, t, T) => {
  use('shaft'); W.la = 'shaft'; shaftPeople(T); W.shR = 30;
  const y = 44.6 + 9 * sm(u); cam(-3.6, y, 13.4, 1.6, y + 2.3, 0, 64); pl(0, -1, y + 3, 9.5, 0xffc070, 1.9, 34); pl(1, 8, y - 4, 4, 0x6fd0c0, 1.3, 30);
});
// 3. The cafeteria: everyone watches the dead world on the screen
shot('cafe', (u, t, T) => {
  use('cafe'); W.la = 'cafe'; screen(26, 2.5, 8, 44); dust(T, 20);
  cam(0, 1.75, 3.4 - 2.3 * sm(u), 0, 3.5, -7, 62); pl(0, 0, 3.6, -4.6, 0xb8a47c, 1.8, 16);
});
// 4. The sheriff walks into the airlock
shot('airlock1', (u, t, T) => {
  use('airlock'); W.la = 'airlock'; put(cleaner, 0, 0, lerp(2.4, -2.5, u), PI); walk(cleaner, t * 5.2, 0.8);
  cam(0.55, 0.7, 4.1 - 0.5 * u, 0, 1.75, -4, 60);
  const st = ss(u, 0.4, 0.55); jet(T, -2.0, 2.7, -1.2, 1, -0.25, 0, 9, st, 0xe8f0e8, 10); jet(T, 2.0, 2.4, -2.8, -1, -0.2, 0, 9, st, 0xe8f0e8, 60);
  const o = ss(u, 0.78, 1); hatch.rotation.y = o * 0.42; hatchGlow.material.color.setScalar(1 + o * 3);
  pl(0, 0, 3.7, 0, 0xffc878, 1.7, 12); pl(1, 0, 1.9, -4.2, 0xffffff, o * 5, 10); W.flash = ss(u, 0.9, 1) * 0.35;
});
// 5. Through his helmet: a green world. He cleans the lens.
shot('clean', (u, t, T) => {
  use('out'); W.lie = 1; W.la = 'lie'; W.helmet = 1; W.scan = 1; W.shR = 70; W.flash = (1 - ss(u, 0, 0.12)) * 0.35;
  cam(0.04, 1.66, 11.3, 0, 1.8, 0, 62); W.grime = 1 - ss(u, 0.14, 0.9) * 0.92;
  const ph = u * TAU * 3; camPoint(0.4, -0.6, 0.02, _sh); _h.set(0.08 * cos(ph), 1.62 + 0.065 * sin(ph), 10.34); povArm(_sh, _h); pad.visible = true; pad.position.set(_h.x, _h.y, _h.z - 0.06); pad.rotation.set(PI / 2, 0, 0);
  flock(T, -34 + 62 * u, 17 + 3 * u, -44, PI / 2);
});
// 6. On the screen he walks a little way up the hill, and falls
shot('fall', (u, t, T) => {
  use('cafe'); W.la = 'cafe'; const x = lerp(1.2, 2.2, u), z = lerp(21, 31.6, seg(u, 0, 0.58)); screen(15, 1.2, hAt(1.2, 28) + 1.4, 28.5); dust(T, 18);
  W.ox = 0; putO(cleaner, x, z, 0.08); W.ox = sets.cafe.position.x;
  walk(cleaner, t * 4.2, 0.75 * (1 - ss(u, 0.42, 0.58))); const f = Math.pow(ss(u, 0.5, 0.84), 2.2); cleaner.g.rotation.z = -f * 1.45; cleaner.g.rotation.x = f * 0.25; cleaner.g.position.y += f * 0.22; cleaner.aL.a.rotation.z = -0.09 - f * 1.3; cleaner.aR.a.rotation.x = -f * 0.8;
  cam(0.2, 2.0, -1.2 - 0.5 * u, 0.1, 3.5, -7, 58); pl(0, 0, 3.6, -4.6, 0xb8a47c, 1.8, 16);
});
// 7. Far below: the generator, and Juliette
shot('gen', (u, t, T) => {
  use('mech'); W.la = 'mech'; W.shR = 22; rotor.rotation.z = T * 3.4; const s = sm(u);
  put(jul, -0.7, 0.04, 3.2, PI); jul.neck.rotation.x = -0.55 * ss(u, 0.05, 0.6); jul.aR.a.rotation.x = -0.25;
  put(mech1, 2.5, 0.04, 2.5, PI - 0.4); mech1.aR.a.rotation.x = -2.5; mech1.aR.b.rotation.x = -0.3; mech1.neck.rotation.x = -0.4;
  cam(1.3, 1.45 + 0.75 * s, 6.7 - 1.0 * s, lerp(-0.5, 0, s), lerp(1.45, 7.6, s), lerp(1, -6, s), 66);
  pl(0, 0, 6.5, -4.4, 0xff8a30, 2.8, 22); pl(1, -3.5, 2.4, 4.5, 0xffb060, 1.1, 12); pl(2, 5, 12, -6, 0xff7020, 1.4, 22);
  jet(T, 6.4, 8.5, -7.4, -0.5, 0.5, 0.6, 8, 0.8, 0xffd9b0, 30); jet(T, -6.6, 4.2, -7.7, 0.7, 0.3, 0.6, 6, 0.6, 0xffd9b0, 80);
  for (let k = 0; k < 6; k++) { const a = (T * 1.7 + k / 6) % 1; glint(-1 + rnd(k) * 2 + a * (rnd(k * 3) - 0.5) * 3, 2.3 - a * a * 2.2 + a * 1.2, -5.6 + a, 0.16, (1 - a) * 0.9, 0xffb050); }
});
// 8. She climbs to the top, and the star is hers
shot('star', (u, t, T) => {
  use('shaft'); W.la = 'shaft'; shaftPeople(T); W.shR = 22;
  if (u < 0.58) {
    const uu = u / 0.58, th = SH.TURN * 10 - 2.05 + 1.3 * uu, r = 4.1, x = r * cos(th), z = r * sin(th), y = stairY(th);
    put(jul, x, y, z, Math.atan2(-sin(th), cos(th))); walk(jul, t * 7.6, 1.1);
    const tc = th - 0.82; cam(4.7 * cos(tc), stairY(tc) + 0.95, 4.7 * sin(tc), x - sin(th) * 1.5, y + 2.5, z + cos(th) * 1.5, 66);
    pl(0, 5 * cos(th + 0.3), y + 2.9, 5 * sin(th + 0.3), 0xffc070, 2.0, 14); pl(1, 9 * cos(th), y, 9 * sin(th), 0x6fd0c0, 1.2, 24);
  } else {
    const ub = (u - 0.58) / 0.42; put(jul, 10.5, 70, 0, 0); jul.star.visible = true; jul.aL.a.rotation.z = -0.14; jul.aR.a.rotation.z = 0.14;
    cam(10.5 + 0.4 - 0.25 * ub, 71.4, 3.4 - 0.6 * ub, 10.5, 71.32, 0, 34);
    const gl = sin(PI * seg(ub, 0.25, 0.8)); glint(10.5 - 0.095, 71.375, 0.17, 0.12 + 0.6 * gl, gl * 0.9, 0xffe2a0); glint(10.5 - 0.095, 71.375, 0.17, 0.06 + 0.2 * gl, gl, 0xffffff);
    pl(0, 11.6, 72.3, 3, 0xfff0dc, 2.4, 10); pl(1, 8, 71, -4, 0x6fd0c0, 1.4, 16);
  }
});
// 9. The hard drive, and the picture that should not exist
shot('relic', (u, t, T) => {
  use('desk'); W.la = 'desk'; W.shR = 6; put(jul, -0.3, 0.16, 0.05, PI); sit(jul); jul.neck.rotation.x = -0.1; pl(1, 0.9, 2.0, 1.2, 0x5f8f9a, 0.9, 5);
  let mix = ss(u, 0.46, 0.54); if (u > 0.4 && u < 0.6 && rnd(Math.floor(T * 30)) > 0.6) mix = 1 - mix;
  monImg.material.opacity = mix; monStatic.material.opacity = (1 - mix) * (0.75 + 0.25 * rnd(Math.floor(T * 24))); monStatic.position.x = (rnd(Math.floor(T * 24) + 5) - 0.5) * 0.03;
  cam(0.42, 1.52, 1.45 - 0.35 * sm(u), 0.0, 1.14, -1.1, 46);
  _col.set(0x8c9896).lerp(_c2.set(0x7fd88a), mix); pl(0, 0, 1.22, -0.5, _col.getHex(), 1.5 + 0.3 * rnd(Math.floor(T * 20)), 5);
  glint(0.52, 0.87, -0.8, 0.07, 0.5 + 0.5 * Math.round(rnd(Math.floor(T * 9))), 0xffa030);
});
// 10. IT: the man who watches everything
shot('server', (u, t, T) => {
  use('server'); W.la = 'server'; W.shR = 14; serverBlink(T); const s = sm(u), cz = 3 - 11 * s;
  put(bern, 0, 0, -11.5, PI - 2.55 * ss(u, 0.58, 0.95)); bern.neck.rotation.y = -1.0 * ss(u, 0.45, 0.65) * (1 - ss(u, 0.7, 0.95)); bern.aL.a.rotation.x = bern.aR.a.rotation.x = 0.35; bern.aL.b.rotation.x = bern.aR.b.rotation.x = -0.5;
  cam(0, 1.5, cz, 0, 2.25, -13.5, 62); pl(0, 0, 4.6, cz - 3.5, 0x8ab0ff, 1.3, 14); pl(1, 0, 2.7, -12.7, 0x60ffe0, 1.7, 9);
});
// 11. The chase down the stairs
shot('chase', (u, t, T) => {
  use('shaft'); W.la = 'alarm'; walkers.visible = false; W.shR = 22;
  const th = SH.TURN * 8 + 2.4 - 2.3 * u, r = 4.2, x = r * cos(th), z = r * sin(th), y = stairY(th);
  put(jul, x, y, z, Math.atan2(sin(th), -cos(th))); walk(jul, t * 13, 1.5); jul.body.rotation.x = 0.22;
  raiders.forEach((f, k) => { const tk = th + 0.5 + k * 0.3, rk = 3.3 + k * 0.85; put(f, rk * cos(tk), stairY(tk), rk * sin(tk), Math.atan2(sin(tk), -cos(tk))); walk(f, t * 12 + k * 2, 1.45); f.body.rotation.x = 0.2; f.aR.a.rotation.x = -1.3; });
  const tc = th - 1.2; cam(4.9 * cos(tc), stairY(tc) + 2.0, 4.9 * sin(tc), x, y + 1.75, z, 64); W.roll = sin(T * 17) * 0.014;
  const st = 0.5 + 0.5 * sin(T * 9); pl(0, 3.2 * cos(th + 0.3), y + 3.6, 3.2 * sin(th + 0.3), 0xff2010, 1.3 + 2.2 * st, 20); pl(1, 5.2 * cos(tc), stairY(tc) + 2.6, 5.2 * sin(tc), 0xd8e4ff, 1.5, 12);
});
// 12. Good tape from Supply goes on her suit
shot('tape', (u, t, T) => {
  use('bench'); W.la = 'bench'; W.shR = 3; cam(0.12 - 0.1 * u, 0.36, 0.86 - 0.12 * u, 0.1, 0, 0, 46);
  const n = Math.floor(ss(u, 0.04, 0.94) * NTAPE), half = NTAPE / 2; let ea = 0, ex = 0.085;
  for (let i = 0; i < NTAPE; i++) { const a = (i % half) / half * TAU, x = i < half ? 0.085 : 0.135; if (i < n) { setI(tapeBits, i, x, 0.089 * cos(a), 0.089 * sin(a), 0, 1, 1, 1, a); ea = a; ex = x; } else setI(tapeBits, i, 0, -9, 0, 0); }
  tapeBits.instanceMatrix.needsUpdate = true;
  tapeRoll.position.set(ex, 0.16 * cos(ea + 0.35), 0.16 * sin(ea + 0.35)); tapeRoll.rotation.set(ea, PI / 2, 0); tapeHand.position.set(ex + 0.02, 0.23 * cos(ea + 0.5), 0.23 * sin(ea + 0.5));
  pl(0, 0.3, 0.8, 0.6, 0xffd29a, 1.8, 4); pl(1, 0.9, 0.3, 0.7, 0x9fc0d0, 1.6, 3);
});
// 13. Juliette is sent out
shot('airlock2', (u, t, T) => {
  use('airlock'); W.la = 'airlock'; cleaner.tapes.forEach(x => { x.visible = true; });
  const st = 0.5 + 0.5 * sin(T * 7);
  if (u < 0.5) {
    const ua = u / 0.5, o = ss(ua, 0.3, 1); put(cleaner, 0, 0, -1.2, PI); cleaner.neck.rotation.x = -0.12 * o; hatch.rotation.y = o * 0.7; hatchGlow.material.color.setScalar(1 + o * 5);
    cam(-0.5 + 0.12 * ua, 1.12, -3.35, 0, 1.72, -1.2, 50); pl(0, 1.7, 4.1, 0.5, 0xff3020, 0.8 + 1.6 * st, 10); pl(1, 0.4, 2.1, -4.3, 0xffffff, o * 4.5, 10);
    jet(T, -2.0, 2.7, -1.2, 1, -0.25, 0, 7, 0.6, 0xe8f0e8, 10);
  } else {
    const ub = (u - 0.5) / 0.5; put(cleaner, 0, 0, lerp(-1.2, -3.5, ub), PI); walk(cleaner, t * 5, 0.8); hatch.rotation.y = 1.95; hatchGlow.material.color.setScalar(9);
    cam(0, 1.35, 2.9 - 0.7 * ub, 0, 1.75, -5, 58); pl(0, 0, 3.8, 1.5, 0xfff0dc, 1.2, 9); pl(1, 0, 1.9, -3.9, 0xffffff, 7, 15); W.flash = ss(ub, 0.5, 1);
    jet(T, 2.0, 2.4, -2.8, -1, -0.2, 0, 7, 0.7, 0xffffff, 60);
  }
});
// 14. Her helmet shows the green world too — but it flickers. She drops the wool.
shot('green', (u, t, T) => {
  use('out'); W.helmet = 1; W.scan = 1; W.shR = 70; W.flash = 1 - ss(u, 0, 0.14);
  const gl = inGlitch(BE[ID.green], u); W.glitch = gl ? 1 : 0; W.lie = gl && rnd(Math.floor(T * 24)) > 0.42 ? 0 : 1; W.la = W.lie ? 'lie' : 'dead';
  const dn = ss(u, 0.46, 0.62) * (1 - ss(u, 0.74, 0.92)), fw = ss(u, 0.78, 1), bob = sin(t * 5) * 0.03 * fw;
  cam(0.3, 1.62 + bob, 13.5 + 1.3 * fw, lerp(0, 0.5, dn), lerp(7.5, 0, dn), lerp(60, 14.7, dn), 68);
  const rel = 0.48, low = ss(u, rel, rel + 0.14); camPoint(0.34, -0.5, 0.05, _sh); camPoint(0.17 + 0.1 * low, -0.2 - 0.36 * low, 0.52 - 0.1 * low, _h); povArm(_sh, _h, true);
  pad.visible = true;
  if (u < rel) { pad.position.set(_h.x - 0.02, _h.y + 0.06, _h.z); pad.rotation.set(0.2, 0, 0.1); }
  else { const tf = (u - rel) * BE[ID.green].d, y = Math.max(0.06, 1.47 - 4.9 * tf * tf); pad.position.set(0.47, y, 14.02 + Math.min(tf, 0.55) * 0.5); pad.rotation.set(y > 0.07 ? tf * 7 : 0, 0, y > 0.07 ? tf * 4 : 0); }
  flock(T, -28 + 52 * u, 24, 58, PI / 2);
});
// 15. Below, they watch her walk. She does not fall.
shot('climb', (u, t, T) => {
  cleaner.tapes.forEach(x => { x.visible = true; });
  if (u < 0.36) {
    const ua = u / 0.36; use('cafe'); W.la = 'cafe'; screen(20, 0.6, hAt(0.6, 30) + 1.2, 30); dust(T, 18);
    W.ox = 0; putO(cleaner, 0.2 + 0.3 * ua, 24 + 9 * ua, 0.03); W.ox = sets.cafe.position.x; walk(cleaner, t * 4.8, 0.9);
    cam(0.15, 1.9, -0.6 - 0.3 * ua, 0, 3.5, -7, 58); pl(0, 0, 3.6, -4.6, 0xb8a47c, 1.8, 16);
  } else {
    const ub = (u - 0.36) / 0.64, z = 40 + 11 * ub; use('out'); W.la = 'dead'; W.shR = 46; putO(cleaner, 0.3, z, 0); walk(cleaner, t * 4.8, 0.95); cleaner.body.rotation.x = 0.16; dust(T, 36);
    cam(-1.0, hAt(-1.0, z - 5.4) + 0.65, z - 5.4, 1.2, hAt(0.3, z) + 2.3, z + 7, 64);
  }
});
// 16. On the ridge the display breaks for good: the green was a lie
shot('ridge', (u, t, T) => {
  use('out'); const b = BE[ID.ridge], tr = b.truth || 0.56, gl = inGlitch(b, u), after = u >= tr; W.shR = 260;
  W.glitch = gl ? 1 : 0; W.lie = after ? 0 : (gl && rnd(Math.floor(T * 24)) > 0.5 ? 0 : 1); W.la = W.lie ? 'lie' : 'deadFar';
  W.helmet = after ? 1 - 0.6 * ss(u, tr, tr + 0.12) : 1; W.scan = after ? 0 : 1; W.flash = after ? (1 - seg(u, tr, tr + 0.09)) * 0.7 : 0;
  const zc = 57.2 + 3.2 * sm(u), y = hAt(0, zc) + 1.64 + sin(t * 5) * 0.025 * (1 - seg(u, 0.3, 0.5));
  cam(0, y, zc, 0, y - 26, zc + 300, 70); flock(T, -60 + 90 * u, 34, 150, PI / 2);
});
// 17. The truth: her silo is one of many
shot('reveal', (u, t, T) => {
  use('out'); W.la = 'deadFar'; cleaner.tapes.forEach(x => { x.visible = true; }); const yR = hAt(0, 60), s = Math.pow(sm(u), 1.25);
  putO(cleaner, 0, 60, 0); cleaner.neck.rotation.y = 0.5 * sin(u * 4); cleaner.aL.a.rotation.z = -0.2; cleaner.aR.a.rotation.z = 0.2;
  cam(lerp(0.9, 0, s), lerp(yR + 1.05, yR + 66, s), lerp(55.6, 6, s), 0, lerp(yR + 2.6, -10, s), lerp(95, 660, s), 64); W.shR = lerp(40, 320, s); dust(T, 50);
});
// 18. Higher: craters to the edge of the world, and the old city
shot('aerial', (u, t, T) => {
  use('out'); W.la = 'deadFar'; W.shR = 400; putO(cleaner, 0, 60, 0);
  cam(40 * u, 250 + 120 * u, 110 + 170 * u, 14 * u, 0, 470 + 250 * u, 62); W.roll = 0.05 * u; W.fade = ss(u, 0.72, 1);
});
// behind the menu: a slow turn around the great stair
function menuShot(t) { use('shaft'); W.la = 'shaft'; shaftPeople(t); W.shR = 30; const a = t * 0.05 + 1.2; cam(12.6 * cos(a), 59.6, 12.6 * sin(a), 0, 61.5, 0, 66); pl(0, 9 * cos(a + 0.5), 62, 9 * sin(a + 0.5), 0xffc070, 1.9, 34); pl(1, 8 * cos(a - 1), 55, 8 * sin(a - 1), 0x6fd0c0, 1.3, 30); }

// ───────────────────────── one frame ─────────────────────────
let mode = 'menu', T = 0, paused = false, menuT = 0;
function reset() {
  for (const k in sets) sets[k].visible = false; figs.forEach(neutral);
  nPuff = 0; nGl = 0; PUFF.forEach(s => { s.visible = false; }); GL.forEach(s => { s.visible = false; }); PL.forEach(p => { p.intensity = 0; });
  W.ox = 0; W.la = 'shaft'; W.lb = null; W.lm = 0; W.lie = 0; W.fade = 0; W.flash = 0; W.helmet = 0; W.scan = 0; W.glitch = 0; W.fov = 62; W.shR = 28; W.roll = 0; W.screen = null; W.grime = 1; W.up.set(0, 1, 0);
  arm.visible = glove.visible = pad.visible = armTape.visible = false; birds.forEach(b => { b.g.visible = false; });
  hatch.rotation.y = 0; hatchGlow.material.color.setScalar(1); walkers.visible = true;
}
function renderScreen(Tm) {
  const o = W.screen, vis = {}; for (const k in sets) { vis[k] = sets[k].visible; sets[k].visible = k === 'out'; }
  applyLie(0); applyLight('dead'); outsideUpdate(Tm);
  sensorCam.fov = o.fov; sensorCam.position.set(0, 1.7, 10.6); sensorCam.lookAt(o.tx, o.ty, o.tz); sensorCam.updateProjectionMatrix();
  placeSun(o.tx, o.ty, o.tz, 40); sky.position.copy(sensorCam.position);
  renderer.setRenderTarget(rt); renderer.render(scene, sensorCam); renderer.setRenderTarget(null);
  for (const k in sets) sets[k].visible = vis[k];
}
function draw() {
  reset(); const Tm = mode === 'menu' ? menuT : T; let black = false;
  if (mode === 'menu') menuShot(menuT);
  else if (T < STORY_END) { let i = NB - 1; while (i > 0 && T < B[i]) i--; shots[i](cl((T - B[i]) / BE[i].d, 0, 1), T - B[i], T); }
  else black = true;
  if (!black) {
    if (W.screen) renderScreen(Tm);
    if (sets.out.visible) { applyLie(W.lie); outsideUpdate(Tm); }
    applyLight(W.la, W.lb, W.lm);
    const d = mode === 'menu' ? 0.6 : 1;
    camera.fov = W.fov; camera.updateProjectionMatrix(); camera.position.copy(CP); camera.position.x += sin(Tm * 0.71) * 0.012 * d; camera.position.y += sin(Tm * 0.93 + 1) * 0.01 * d;
    camera.up.copy(W.up); camera.lookAt(CT); camera.rotateZ(W.roll + sin(Tm * 0.83) * 0.004 * d);
    placeSun(CT.x, CT.y, CT.z, Math.round(W.shR)); sky.position.copy(camera.position);
    renderer.render(scene, camera);
  }
  overlays(black);
}

// ───────────────────────── overlays: title, cards, helmet, glitch, fades ─────────────────────────
const elHelmet = $('helmet'), elScan = elHelmet.querySelector('.scan'), elGlitch = $('glitch'), elFlash = $('flash'), elFade = $('fade'), elTitle = $('title'), elEnd = $('endcard'), elBrand = $('brand'), elGrain = $('grain');
const gbars = []; for (let i = 0; i < 12; i++) { const b = document.createElement('i'); elGlitch.appendChild(b); gbars.push(b); }
elGrain.style.backgroundImage = 'url(' + (function () { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), d = x.createImageData(128, 128); for (let i = 0; i < 128 * 128; i++) { const v = Math.floor(rnd(i * 0.731) * 255); d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = v; d.data[i * 4 + 3] = 255; } x.putImageData(d, 0, 0); return c.toDataURL(); })() + ')';
(function () { const b = S.brand; $('ben').textContent = b.name_en || ''; $('btag').textContent = b.tagline_en || ''; $('cen').textContent = b.name_en || ''; if (b.logo) { const im = $('blogo'); im.src = b.logo; im.hidden = false; } })();
function overlays(black) {
  const play = mode === 'play', n = Math.floor(T * 30);
  elHelmet.style.opacity = play && !black ? W.helmet : 0; elScan.style.opacity = W.scan;
  const g = play && !black ? W.glitch : 0; elGlitch.style.opacity = g; canvas.style.transform = g ? 'translateX(' + ((rnd(n * 1.3) - 0.5) * 3).toFixed(2) + '%)' : '';
  if (g) gbars.forEach((b, i) => { const r = rnd(n * 7 + i * 13); b.style.top = (rnd(n * 3 + i * 5) * 96) + '%'; b.style.height = (0.25 + rnd(n + i * 3) * (i < 2 ? 5 : 1.4)) + '%'; b.style.background = r < 0.33 ? 'rgba(120,255,200,.5)' : r < 0.66 ? 'rgba(255,60,160,.42)' : 'rgba(255,255,255,.6)'; b.style.transform = 'translateX(' + ((rnd(n * 5 + i) - 0.5) * 30).toFixed(1) + '%)'; });
  elFlash.style.opacity = play && !black ? W.flash : 0;
  elFade.style.opacity = !play ? 0 : black ? 1 : Math.max(W.fade, 1 - ss(T, 0, 0.35));
  elTitle.style.opacity = play ? ss(T, S.titleFrom, S.titleFrom + 0.45) * (1 - ss(T, S.titleTo - 0.6, S.titleTo)) : 0;
  elEnd.style.opacity = play ? ss(T, STORY_END, STORY_END + 0.5) * (1 - ss(T, T_BRAND - 0.4, T_BRAND)) : 0;
  elBrand.style.opacity = play ? ss(T, T_BRAND, T_BRAND + 0.5) * (1 - ss(T, TOTAL - 0.5, TOTAL)) : 0;
  elGrain.style.backgroundPosition = Math.floor(rnd(n) * 128) + 'px ' + Math.floor(rnd(n + 9) * 128) + 'px';
}

// ───────────────────────── playing, seeking, keys ─────────────────────────
const elMenu = $('menu'), elSeek = $('seek'), elBar = $('bar'), elFill = elBar.querySelector('.fl'), elKnob = elBar.querySelector('.kn'), elTip = $('tip'), elTime = $('tm'), elPP = $('pp');
let barOff = false, hideAt = 0, dragging = false;
const mmss = s => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0'); };
B.concat([STORY_END, T_BRAND]).forEach((t, i) => { if (!i) return; const m = document.createElement('div'); m.className = 'mk'; m.style.left = (t / TOTAL * 100) + '%'; elBar.appendChild(m); });
function ui() {
  const p = cl(T / TOTAL, 0, 1) * 100; elFill.style.width = p + '%'; elKnob.style.left = p + '%'; elTime.textContent = mmss(T) + ' / ' + mmss(TOTAL); elPP.textContent = paused ? '▶' : '❚❚';
  if (mode === 'play' && !dragging && performance.now() > hideAt) { elSeek.classList.remove('show'); document.body.classList.add('idle'); }
}
function wake() { document.body.classList.remove('idle'); if (mode !== 'play') return; hideAt = performance.now() + 2500; if (!barOff) elSeek.classList.add('show'); }
function start() { mode = 'play'; T = 0; paused = false; elMenu.classList.add('off'); elSeek.classList.remove('show'); hideAt = 0; draw(); }
function toMenu() { mode = 'menu'; paused = false; T = 0; elMenu.classList.remove('off'); elSeek.classList.remove('show'); document.body.classList.remove('idle'); window.SND.sync(0, false); draw(); }
function seek(s) { T = cl(s, 0, TOTAL - 0.01); draw(); ui(); }
function setPaused(b) { paused = !!b; ui(); }
function advance(dt) {
  if (mode === 'play') { if (!paused) { T += dt; if (T >= TOTAL) { toMenu(); return; } } } else menuT += dt;
  draw(); window.SND.sync(T, mode === 'play' && !paused); ui();
}
let last = performance.now();
function loop(now) { requestAnimationFrame(loop); const dt = Math.min(0.1, (now - last) / 1000); last = now; advance(dt); }

const barT = e => { const r = elBar.getBoundingClientRect(); return cl((e.clientX - r.left) / r.width, 0, 1) * TOTAL; };
function tip(e) { const t = barT(e); let i = NB - 1; while (i > 0 && t < B[i]) i--; const lab = t >= T_BRAND ? 'Brand' : t >= STORY_END ? 'End card' : BE[i].label; elTip.textContent = mmss(t) + '  ' + lab; elTip.style.display = 'block'; elTip.style.left = cl(t / TOTAL * 100, 18, 82) + '%'; }
elBar.addEventListener('pointerdown', e => { dragging = true; elBar.setPointerCapture(e.pointerId); seek(barT(e)); tip(e); e.stopPropagation(); });
elBar.addEventListener('pointermove', e => { tip(e); if (dragging) seek(barT(e)); wake(); });
elBar.addEventListener('pointerup', () => { dragging = false; }); elBar.addEventListener('pointercancel', () => { dragging = false; }); elBar.addEventListener('pointerleave', () => { if (!dragging) elTip.style.display = 'none'; });
elPP.addEventListener('click', e => { window.SND.unlock(); setPaused(!paused); wake(); e.stopPropagation(); });
window.addEventListener('pointermove', wake); window.addEventListener('pointerdown', () => { window.SND.unlock(); wake(); });
const bSound = $('bsound');
function setSound(b) { window.SND.setOn(b); bSound.textContent = 'SOUND: ' + (b ? 'ON' : 'OFF'); }
function fullscreen() { const d = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else if (d.requestFullscreen) d.requestFullscreen().catch(() => {}); else if (d.webkitRequestFullscreen) d.webkitRequestFullscreen(); }
$('play').addEventListener('click', () => { window.SND.unlock(); start(); });
bSound.addEventListener('click', () => setSound(!window.SND.isOn())); $('bfull').addEventListener('click', fullscreen);
window.addEventListener('keydown', e => {
  const k = e.key;
  if (k === 'f' || k === 'F') return fullscreen();
  if (k === 'm' || k === 'M' || k === 'v' || k === 'V') return setSound(!window.SND.isOn());
  if (mode !== 'play') { if (k === 'Enter' || k === ' ') { e.preventDefault(); window.SND.unlock(); start(); } return; }
  if (k === ' ') { e.preventDefault(); setPaused(!paused); }
  else if (k === 'ArrowRight') seek(T + 5); else if (k === 'ArrowLeft') seek(T - 5);
  else if (k === 'h' || k === 'H') { barOff = !barOff; if (barOff) elSeek.classList.remove('show'); }
  else if (k === 'Escape') toMenu();
});
(function () {
  const lan = (window.LAN || [])[0], touch = 'ontouchstart' in window;
  $('info').innerHTML = (lan ? 'On your phone, same Wi-Fi:<br><b>' + lan + '</b><br>' : '') + (touch ? 'Tap the picture to show the time bar.' : 'Space pause · ← → skip · M sound<br>H hide the bar · F fullscreen · Esc menu');
})();

window.addEventListener('resize', () => { layout(); draw(); });
layout(); if (S.sound) window.SND.build(S);
draw(); requestAnimationFrame(loop);

// for checking the film from the console
window.CINE = {
  start: start, seek: seek, LT: LT, pause: setPaused, step: draw, tick: advance, setSound: setSound, menu: toMenu,
  total: TOTAL, beats: BE, starts: B, snd: window.SND, get T() { return T; }, get mode() { return mode; },
  dbg: { scene: scene, camera: camera, THREE: THREE, renderer: renderer, sets: sets, W: W, L: L, hAt: hAt }
};
})();
