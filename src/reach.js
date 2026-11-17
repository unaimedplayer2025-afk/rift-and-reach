// Portal B — THE REACH: F-Zero-style high-speed racer through a purple neon city.
import * as THREE from 'three';
import { std, glow, additive, part, grp, Tex, instanced, makeCurve, clamp, lerp, rnd, pick } from './util.js';
import { holographicMat, buildTower, buildFlyer } from './models.js';

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return (v0, v1, v2, v3) => 0.5 * ((2 * v1) + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
}

function sampleSpline(pts, closed, ds = 2.2) {
  const n = pts.length;
  const P = pts.map(p => p.isVector3 ? p : new THREE.Vector3(p.x, p.y, p.z));
  const samples = [];
  let length = 0, prev = null;
  const count = closed ? n : n - 1;
  const steps = 8;
  for (let i = 0; i < count; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      const z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
      const p = new THREE.Vector3(x, y, z);
      const w = lerp(p1.w ?? 8, p2.w ?? 8, t);
      const bank = lerp(p1.bank ?? 0, p2.bank ?? 0, t);
      if (prev) length += p.distanceTo(prev);
      samples.push({ p, s: length, w, bank, surface: p1.surface || 'grid' });
      prev = p.clone();
    }
  }
  // tangents / frames
  const N = samples.length;
  for (let i = 0; i < N; i++) {
    const a = samples[(i - 1 + N) % N].p, b = samples[(i + 1) % N].p;
    const t = b.clone().sub(a).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const bnm = new THREE.Vector3().crossVectors(up, t).normalize();
    if (bnm.lengthSq() < 0.01) bnm.set(1, 0, 0);
    const nm = new THREE.Vector3().crossVectors(t, bnm).normalize();
    // apply bank
    const q = new THREE.Quaternion().setFromAxisAngle(t, samples[i].bank);
    nm.applyQuaternion(q); bnm.applyQuaternion(q);
    samples[i].t = t; samples[i].n = nm; samples[i].b = bnm;
  }
  return { samples, length };
}

function atS(samples, length, s) {
  s = ((s % length) + length) % length;
  let lo = 0, hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].s <= s) lo = mid; else hi = mid - 1;
  }
  const a = samples[lo], b = samples[(lo + 1) % samples.length];
  const seg = b.s >= a.s ? (b.s - a.s) : (length - a.s + b.s);
  const u = seg > 1e-6 ? (s - a.s < 0 ? (s + length - a.s) : (s - a.s)) / seg : 0;
  return { a, b, u: Math.min(1, Math.max(0, u)), i: lo };
}

export function sampleAt(track, s, out = {}) {
  const { samples, length } = track;
  const { a, b, u } = atS(samples, length, s);
  const p = (out.p || new THREE.Vector3()).lerpVectors(a.p, b.p, u);
  const t = (out.t || new THREE.Vector3()).lerpVectors(a.t, b.t, u).normalize();
  const n = (out.n || new THREE.Vector3()).lerpVectors(a.n, b.n, u).normalize();
  const bn = (out.b || new THREE.Vector3()).lerpVectors(a.b, b.b, u).normalize();
  const w = lerp(a.w, b.w, u);
  return { p, t, n, b: bn, w, s: ((s % length) + length) % length, surface: u < 0.5 ? a.surface : b.surface, bank: lerp(a.bank, b.bank, u) };
}

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Vector3();
export function project(track, pos, hintS) {
  const { samples, length } = track;
  const N = samples.length;
  let start = 0;
  if (hintS != null) start = atS(samples, length, hintS).i;
  let bestD = 1e15, bestI = start, bestU = 0, bestC = new THREE.Vector3();
  const window = hintS != null ? 28 : N;
  for (let k = 0; k < window; k++) {
    const i = (start + k - (hintS != null ? (window >> 2) : 0) + N * 4) % N;
    const a = samples[i], b = samples[(i + 1) % N];
    const abx = b.p.x - a.p.x, aby = b.p.y - a.p.y, abz = b.p.z - a.p.z;
    const apx = pos.x - a.p.x, apy = pos.y - a.p.y, apz = pos.z - a.p.z;
    const ab2 = abx * abx + aby * aby + abz * abz || 1;
    const u = clamp((apx * abx + apy * aby + apz * abz) / ab2, 0, 1);
    const cx = a.p.x + abx * u, cy = a.p.y + aby * u, cz = a.p.z + abz * u;
    const d = (pos.x - cx) ** 2 + (pos.y - cy) ** 2 + (pos.z - cz) ** 2;
    if (d < bestD) { bestD = d; bestI = i; bestU = u; bestC.set(cx, cy, cz); }
  }
  const a = samples[bestI], b = samples[(bestI + 1) % N];
  const t = _t.lerpVectors(a.t, b.t, bestU).normalize();
  const n = _n.lerpVectors(a.n, b.n, bestU).normalize();
  const bn = _b.lerpVectors(a.b, b.b, bestU).normalize();
  const rel = _q.subVectors(pos, bestC);
  const lateral = rel.dot(bn);
  const w = lerp(a.w, b.w, bestU);
  const seg = b.s >= a.s ? (b.s - a.s) : (length - a.s + b.s);
  const s = (a.s + seg * bestU) % length;
  const onRoad = Math.abs(lateral) < w * 0.5 + 0.6 && Math.abs(rel.dot(n)) < 6;
  return { s, lateral, onRoad, w, p: bestC.clone(), t: t.clone(), n: n.clone(), b: bn.clone(), surface: a.surface, dist: Math.sqrt(bestD), bank: lerp(a.bank, b.bank, bestU) };
}

export function wrapDist(s, length) { return ((s % length) + length) % length; }
export function deltaS(from, to, length) {
  let d = to - from;
  if (d > length * 0.5) d -= length;
  if (d < -length * 0.5) d += length;
  return d;
}

function buildRibbon(samples, length) {
  const N = samples.length;
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const a = samples[i % N];
    const half = a.w * 0.5;
    const l = a.p.clone().addScaledVector(a.b, -half);
    const r = a.p.clone().addScaledVector(a.b, half);
    pos.push(l.x, l.y, l.z, r.x, r.y, r.z);
    nor.push(a.n.x, a.n.y, a.n.z, a.n.x, a.n.y, a.n.z);
    const u = (a.s / length) * (length / 8);
    uv.push(0, u, 1, u);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x14081c, roughness: 0.35, metalness: 0.55,
    map: Tex.grid(4), emissive: 0x3a0850, emissiveIntensity: 0.45, emissiveMap: Tex.grid(4)
  });
  const mesh = new THREE.Mesh(g, mat);
  // rails
  const rails = new THREE.Group();
  const railM = glow(0xc040ff, 1.6);
  const railM2 = glow(0x40e8ff, 1.3);
  const railPos = [[], []];
  for (let i = 0; i <= N; i++) {
    const a = samples[i % N];
    const half = a.w * 0.5 + 0.08;
    const l = a.p.clone().addScaledVector(a.b, -half).addScaledVector(a.n, 0.12);
    const r = a.p.clone().addScaledVector(a.b, half).addScaledVector(a.n, 0.12);
    railPos[0].push(l); railPos[1].push(r);
  }
  for (let k = 0; k < 2; k++) {
    const curve = new THREE.CatmullRomCurve3(railPos[k], true);
    rails.add(new THREE.Mesh(new THREE.TubeGeometry(curve, N, 0.07, 5, true), k ? railM2 : railM));
  }
  const group = new THREE.Group(); group.add(mesh, rails);
  return group;
}

function pt(x, y, z, o = {}) { return Object.assign(new THREE.Vector3(x, y, z), { w: o.w ?? 9, bank: o.bank ?? 0, surface: 'grid' }); }

export function buildReachWorld() {
  const group = new THREE.Group();
  group.visible = false;

  // city circuit — a sweeping loop through and above the neon towers
  const pts = [
    pt(0, 8, 40, { w: 11 }),
    pt(35, 10, 25, { w: 10, bank: -0.25 }),
    pt(48, 14, -5, { w: 10, bank: -0.4 }),
    pt(30, 18, -40, { w: 11 }),
    pt(-5, 16, -55, { w: 12, bank: 0.2 }),
    pt(-40, 12, -35, { w: 10, bank: 0.35 }),
    pt(-52, 10, 0, { w: 10, bank: 0.2 }),
    pt(-38, 9, 30, { w: 10 }),
    pt(-10, 8, 42, { w: 11 }),
  ];
  const { samples, length } = sampleSpline(pts, true, 2.2);
  const track = { samples, length, group, pads: [] };

  group.add(buildRibbon(samples, length));

  // sky
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      uniform float time; varying vec3 vP;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main(){
        float y = vP.y;
        vec3 top = vec3(0.02, 0.0, 0.06);
        vec3 hor = vec3(0.18, 0.04, 0.28);
        vec3 bot = vec3(0.04, 0.0, 0.08);
        vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y*1.4,0.0,1.0), 0.7)) : mix(hor, bot, clamp(-y*3.0,0.0,1.0));
        c += vec3(0.3, 0.05, 0.4) * pow(h21(vP.xz * 2.5), 2.0) * 0.5;
        vec2 sp = vec2(atan(vP.x, -vP.z), y);
        float s = h21(floor(sp * vec2(90.0, 50.0)));
        if (s > 0.96) c += vec3(1.0, 0.8, 1.0) * ((s-0.96)/0.04);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(400, 20, 14), skyMat));

  // city floor
  const ground = new THREE.Mesh(new THREE.CircleGeometry(280, 32), new THREE.MeshStandardMaterial({
    color: 0x08010e, roughness: 0.7, metalness: 0.3, map: Tex.grid(16), emissive: 0x1a0420, emissiveIntensity: 0.3
  }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -8; group.add(ground);

  // towers instanced-ish (unique enough, keep count reasonable)
  const pal = [0x1a0820, 0x12081c, 0x18061a, 0x0e0614];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2 + rnd(-0.08, 0.08);
    const r = 18 + (i % 9) * 11 + rnd(0, 7);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 14 + (i * 17) % 44;
    const tw = buildTower(h, 2.0 + (i % 5) * 0.65, pal[i % pal.length], i % 4);
    tw.position.set(x, -8, z); group.add(tw);
  }
  // extra inner cluster
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const tw = buildTower(26 + (i % 6) * 3, 2.6 + (i % 3) * 0.4, 0x14081c, i % 4);
    tw.position.set(Math.cos(a) * (7 + (i % 3) * 2.5), -8, Math.sin(a) * (7 + (i % 3) * 2.5)); group.add(tw);
  }

  const ships = [];
  for (let i = 0; i < 18; i++) {
    const s = buildFlyer(1.1 + Math.random() * 0.8, pick([0xc040ff, 0x8020ff, 0x40e8ff, 0xff40c0]));
    s.userData.path = {
      c: new THREE.Vector3(rnd(-40, 40), rnd(16, 36), rnd(-40, 40)),
      rx: rnd(8, 22), rz: rnd(8, 22), phase: rnd(0, 6.28), speed: rnd(0.2, 0.5), yw: rnd(0.4, 1.2)
    };
    group.add(s); ships.push(s);
  }

  // boost pads along the track
  const padS = [length * 0.15, length * 0.45, length * 0.75];
  const pads = [];
  const padMat = additive(0xffee55, 0.55, { map: Tex.ring(), side: THREE.DoubleSide });
  for (const s of padS) {
    const sm = sampleAt(track, s);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.2), padMat.clone());
    g.position.copy(sm.p).addScaledVector(sm.n, 0.05);
    g.lookAt(sm.p.clone().add(sm.n));
    group.add(g);
    pads.push({ s, mesh: g });
  }
  track.pads = pads;

  const hemi = new THREE.HemisphereLight(0xe080ff, 0x100818, 0.85); group.add(hemi);
  const dir = new THREE.DirectionalLight(0xffc0ff, 0.9); dir.position.set(16, 40, -10); group.add(dir);
  const neon = new THREE.PointLight(0xc040ff, 1.4, 80, 2); neon.position.set(0, 24, 0); group.add(neon);

  function update(t, dt) {
    skyMat.uniforms.time.value = t;
    for (const s of ships) {
      const p = s.userData.path;
      const a = t * p.speed + p.phase;
      s.position.set(p.c.x + Math.cos(a) * p.rx, p.c.y + Math.sin(a * p.yw) * 2.0, p.c.z + Math.sin(a) * p.rz);
      s.lookAt(p.c.x + Math.cos(a + 0.2) * p.rx, s.position.y, p.c.z + Math.sin(a + 0.2) * p.rz);
    }
    for (const p of pads) p.mesh.material.opacity = 0.35 + Math.sin(t * 6 + p.s) * 0.2;
  }

  return {
    group, track, ships, pads, skyMat, hemi, dir, update,
    look: { fog: { color: 0x120818, density: 0.008 }, bloom: 0.72, exposure: 1.08 }
  };
}
