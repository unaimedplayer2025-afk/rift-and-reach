// THE RIFT & THE REACH — Rowlex pinball portal game.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Snd, SFX, AUDIO_V } from './audio.js';
import { rnd, pick, clamp, lerp, damp, angLerp, Tex, additive } from './util.js';
import { buildRowlex, poseRowlex, buildDisc, RIVALS } from './models.js';
import { buildTable, BALL_R } from './table.js';
import { createWorld, syncMesh, BOUNDS } from './physics.js';
import { buildRiftWorld, RIFT_ENEMIES } from './rift.js';
import { buildReachWorld, sampleAt, project, wrapDist, deltaS } from './reach.js';
import { buildReentryWorld } from './reentry.js';

const Q = new URLSearchParams(location.search);
const CAPTURE = Q.has('capture'), DEMO = Q.has('demo') || CAPTURE;
const TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const $ = id => document.getElementById(id);

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
let pixelRatio = Math.min(window.devicePixelRatio || 1, Q.has('lowfx') ? 0.7 : (CAPTURE ? 1.25 : 1.25));
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 900);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera); composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(480, 270), 0.52, 0.42, 0.82); composer.addPass(bloom);
let useBloom = !Q.has('lowfx');
function resize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  renderer.setSize(w, h, false); composer.setSize(w, h);
  bloom.setSize(w * 0.4, h * 0.4);
}
addEventListener('resize', resize); resize();

const table = buildTable(); scene.add(table.root);
const riftW = buildRiftWorld(); scene.add(riftW.group);
const reachW = buildReachWorld(); scene.add(reachW.group);
const reentryW = buildReentryWorld(); scene.add(reentryW.group);

const H = buildRowlex(1); scene.add(H.root);
const extraBalls = [buildRowlex(1), buildRowlex(1)];
for (const E of extraBalls) { E.setMode('ball'); E.root.visible = false; scene.add(E.root); }
const world = createWorld(table.layout);
const disc = buildDisc(1); scene.add(disc);
const CHAIN_N = 18;
const chain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.045, 0.16), new THREE.MeshStandardMaterial({ color: 0x8a8a90, metalness: 1, roughness: 0.3, emissive: 0x400800 }), CHAIN_N);
chain.frustumCulled = false; scene.add(chain);

const G = {
  mode: 'title', t: 0, titleT: 0, modeT: 0, score: 0, balls: 3, shake: 0,
  hits: 0, combo: 0, comboT: 0, endT: 0, flash: 0,
  enemies: [], shots: [], racers: [],
  riftKills: 0, riftWaves: 0, riftGoal: false,
  reentryHits: 0, reentryLitNeed: 2,
  warpDest: null, warpFrom: null,
  demoStarted: false, demoPhase: 'sweep', demoWant: 'rift', lastBonus: 0, portalGrace: 0, riftLitNeed: 3, reachLitNeed: 3,
  multiball: false, jackpot: 5000, locks: 0, dmdCall: '', dmdCallT: 0, rowlex: '',
  shotCombo: 0, _lastShotT: 0, _lastShot: '',
};
window.__game = G;

function pickSrc(base) {
  if (/\.(ogg|mp3|wav|m4a)$/i.test(base)) return base;
  const a = document.createElement('audio');
  const ogg = a.canPlayType('audio/ogg; codecs="vorbis"') || a.canPlayType('audio/ogg; codecs="opus"');
  return (ogg ? base + '.ogg' : base + '.mp3') + '?v=' + AUDIO_V;
}
const ModeMusic = {
  el: null, url: null, vol: 0, outgoing: null, outVol: 0,
  set(base) {
    const src = pickSrc(base);
    if (src === this.url) { this.sync(); return; }
    // Crossfade: keep the outgoing track playing while the new one fades in.
    if (this.el) {
      if (this.outgoing) { try { this.outgoing.pause(); } catch (e) {} }
      this.outgoing = this.el;
      this.outVol = this.vol;
    }
    this.url = src;
    const a = new Audio(); a.loop = true; a.preload = 'auto'; a.src = src; a.volume = 0; this.el = a; this.vol = 0;
    this.sync();
  },
  sync() {
    if (!this.el) return;
    const want = playingMusic() && Snd.unlocked && !Snd.muted;
    if (want && this.el.paused) { const p = this.el.play(); if (p && p.catch) p.catch(() => {}); }
  },
  update(dt) {
    const want = playingMusic() && Snd.unlocked && !Snd.muted;
    this.vol = want ? Math.min(0.55, this.vol + dt * 0.8) : Math.max(0, this.vol - dt * 0.7);
    if (this.el) {
      if (want && this.el.paused) this.sync();
      try { this.el.volume = this.vol; } catch (e) {}
      if (!want && this.vol <= 0 && !this.el.paused) this.el.pause();
    }
    if (this.outgoing) {
      this.outVol = Math.max(0, this.outVol - dt * 0.8);
      try { this.outgoing.volume = this.outVol; } catch (e) {}
      if (this.outVol <= 0) { try { this.outgoing.pause(); } catch (e) {} this.outgoing = null; }
    }
  }
};
function playingMusic() { return G.mode === 'pinball' || G.mode === 'rift' || G.mode === 'reach' || G.mode === 'reentry'; }

const PN = 1100;
const pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pData = [];
for (let i = 0; i < PN; i++) pData.push({ life: 0, vel: new THREE.Vector3(), g: 8 });
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.28, map: Tex.dot(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
scene.add(points);
let pNext = 0; const tmpC = new THREE.Color();
function emit(pos, n, color, spd = 6, o = {}) {
  const cols = Array.isArray(color) ? color : [color];
  for (let i = 0; i < n; i++) {
    const k = (pNext++) % PN, d = pData[k];
    d.life = o.life ?? rnd(0.35, 0.8);
    d.max = d.life; d.g = o.g ?? (o.flat ? 0 : 8);
    d.vel.set((Math.random() - 0.5) * spd, (o.up ?? (o.flat ? 0.2 : spd * 0.5)) + Math.random() * spd * 0.4, (Math.random() - 0.5) * spd);
    pPos[k * 3] = pos.x; pPos[k * 3 + 1] = pos.y; pPos[k * 3 + 2] = pos.z;
    tmpC.set(pick(cols)); pCol[k * 3] = tmpC.r; pCol[k * 3 + 1] = tmpC.g; pCol[k * 3 + 2] = tmpC.b;
  }
}
function updateParticles(dt) {
  for (let i = 0; i < PN; i++) {
    const d = pData[i]; if (d.life <= 0) { pPos[i * 3 + 1] = -999; continue; }
    d.life -= dt; d.vel.y -= d.g * dt;
    pPos[i * 3] += d.vel.x * dt; pPos[i * 3 + 1] += d.vel.y * dt; pPos[i * 3 + 2] += d.vel.z * dt;
  }
  pGeo.attributes.position.needsUpdate = true;
}
const DN = 180, debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.6 }), DN);
debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(debris);
const dData = []; const dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), de = new THREE.Euler(), dv = new THREE.Vector3(), ds = new THREE.Vector3();
for (let i = 0; i < DN; i++) dData.push({ life: 0, vel: new THREE.Vector3(), pos: new THREE.Vector3(), spin: new THREE.Vector3(), size: 0.1 });
let dNext = 0;
function burstDebris(pos, n, colors, spd = 7, size = 0.12) {
  for (let i = 0; i < n; i++) {
    const k = (dNext++) % DN, d = dData[k];
    d.life = rnd(0.5, 1.1); d.size = size * rnd(0.6, 1.4);
    d.pos.copy(pos); d.vel.set((Math.random() - 0.5) * spd, Math.random() * spd, (Math.random() - 0.5) * spd);
    d.spin.set(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8));
    debris.setColorAt(k, tmpC.set(pick(colors)));
  }
  if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
}
function updateDebris(dt) {
  for (let i = 0; i < DN; i++) {
    const d = dData[i];
    if (d.life <= 0) { ds.set(0, 0, 0); dm.compose(dv.set(0, -99, 0), dq, ds); debris.setMatrixAt(i, dm); continue; }
    d.life -= dt; d.vel.y -= 18 * dt; d.pos.addScaledVector(d.vel, dt);
    de.set(d.spin.x * (1 - d.life), d.spin.y * (1 - d.life), d.spin.z * (1 - d.life)); dq.setFromEuler(de);
    ds.set(d.size, d.size, d.size); dm.compose(d.pos, dq, ds); debris.setMatrixAt(i, dm);
  }
  debris.instanceMatrix.needsUpdate = true;
}
const rings = [], ringTex = Tex.ring();
function ring(pos, color, maxR = 4, dur = 0.5) {
  let r = rings.find(x => x.t <= 0);
  if (!r) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, map: ringTex, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; scene.add(m); r = { m, t: 0, dur, maxR }; rings.push(r);
  }
  r.m.position.copy(pos); r.m.material.color.set(color); r.t = r.dur = dur; r.maxR = maxR; r.m.visible = true;
}
function updateRings(dt) {
  for (const r of rings) {
    if (r.t <= 0) { r.m.visible = false; continue; }
    r.t -= dt; const k = 1 - r.t / r.dur; r.m.scale.setScalar(0.2 + k * r.maxR); r.m.material.opacity = (1 - k) * 0.7;
  }
}
const floats = [];
function floatText(pos, text, color = '#fff', size = 16) {
  const el = document.createElement('div'); el.className = 'float'; el.textContent = text; el.style.color = color; el.style.fontSize = size + 'px'; document.body.appendChild(el);
  floats.push({ el, pos: pos.clone(), t: 0.9, y: 0 });
}
const proj = new THREE.Vector3();
function toScreen(p, out = {}) { proj.copy(p).project(camera); out.x = (proj.x * 0.5 + 0.5) * innerWidth; out.y = (-proj.y * 0.5 + 0.5) * innerHeight; out.behind = proj.z > 1; return out; }
function updateFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t -= dt; f.y += dt * 40;
    if (f.t <= 0) { f.el.remove(); floats.splice(i, 1); continue; }
    const s = toScreen(f.pos); f.el.style.left = s.x + 'px'; f.el.style.top = (s.y - f.y) + 'px'; f.el.style.opacity = String(Math.max(0, f.t / 0.5));
  }
}
let msgT = 0, flashA = 0, hurtA = 0;
function showMsg(a, b = '', dur = 2) { $('msg').textContent = a; $('sub').textContent = b; $('msg').style.opacity = 1; $('sub').style.opacity = b ? 1 : 0; msgT = dur; }
function flash(a = 0.8) { flashA = Math.max(flashA, a); }
function addScore(n, pos) {
  G.score += n | 0; G.comboT = 2; G.combo++;
  table.setScore(G.score);
  if (pos && n >= 100) floatText(pos, (n > 0 ? '+' : '') + n, n >= 1000 ? '#ff8a20' : '#40e8ff', n >= 1000 ? 20 : 15);
}

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();
const tmpF = new THREE.Vector3();
const handPos = new THREE.Vector3();
const hero = {
  pos: H.root.position, vel: new THREE.Vector3(), yaw: 0, onGround: true, hp: 100, maxHp: 100,
  rollT: 0, rollCD: 0, rollDir: new THREE.Vector3(), hurtT: 0, throwT: 0, phase: 0, airT: 0, jumpBuf: 0, coyote: 0, dead: false,
  lastSafe: new THREE.Vector3(),
  disc: { state: 'held', pos: new THREE.Vector3(), vel: new THREE.Vector3(), t: 0, target: null, hits: new Set(), dir: new THREE.Vector3() },
};
const GRAV = 26;

function setHeroMode(mode) {
  H.setMode(mode);
  disc.visible = mode !== 'ball';
  chain.visible = mode !== 'ball' && hero.disc.state !== 'held';
}

const ball = {
  pos: new THREE.Vector3(6.57, BALL_R, 7.15),
  vel: new THREE.Vector3(),
  omega: new THREE.Vector3(),
  ramp: null, rampS: 0,
  inLane: true, charged: 0, pulling: false, live: false, stuckT: 0,
};
const FLIP_LEN = 1.7, FLIP_THICK = 0.22;
let angL = table.FLIP_REST_L, angR = table.FLIP_REST_R, omL = 0, omR = 0;
const flipHeld = { L: false, R: false };

function flipperTip(side, ang, out) {
  const L = FLIP_LEN;
  if (side < 0) {
    const p = table.flipL.position;
    out.set(p.x + Math.cos(ang) * L, 0, p.z - Math.sin(ang) * L);
  } else {
    const p = table.flipR.position;
    out.set(p.x - Math.cos(ang) * L, 0, p.z - Math.sin(ang) * L);
  }
  return out;
}
function updateFlippers(dt) {
  const wantL = !!(keys.FlipL || touch.flipL);
  const wantR = !!(keys.FlipR || touch.flipR);
  const targetL = wantL ? table.FLIP_UP_L : table.FLIP_REST_L;
  const targetR = wantR ? table.FLIP_UP_R : table.FLIP_REST_R;
  const prevL = angL, prevR = angR;
  angL = damp(angL, targetL, wantL ? 22 : 16, dt);
  angR = damp(angR, targetR, wantR ? 22 : 16, dt);
  if (wantL && Math.abs(angL - table.FLIP_UP_L) > 0.05) angL += (targetL - angL) * Math.min(1, dt * 18);
  if (wantR && Math.abs(angR - table.FLIP_UP_R) > 0.05) angR += (targetR - angR) * Math.min(1, dt * 18);
  omL = (angL - prevL) / Math.max(dt, 1e-4);
  omR = (angR - prevR) / Math.max(dt, 1e-4);
  if (wantL && !flipHeld.L) { SFX.flip(); flipHeld.L = true; }
  if (wantR && !flipHeld.R) { SFX.flip(); flipHeld.R = true; }
  if (!wantL) flipHeld.L = false; if (!wantR) flipHeld.R = false;
  table.flipL.rotation.y = angL;
  table.flipR.rotation.y = -angR;
  table.flipL.userData.light.intensity = 0.8 + (wantL ? 1.4 : 0);
  table.flipR.userData.light.intensity = 0.8 + (wantR ? 1.4 : 0);
}

function closestOnSeg(px, pz, ax, az, bx, bz, out) {
  const abx = bx - ax, abz = bz - az;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / (abx * abx + abz * abz || 1), 0, 1);
  out.x = ax + abx * t; out.z = az + abz * t; out.t = t;
  return out;
}
const _c = { x: 0, z: 0, t: 0 };
function collideBallFlipper(side, ang, om) {
  const pivot = side < 0 ? table.flipL.position : table.flipR.position;
  flipperTip(side, ang, tmpV);
  closestOnSeg(ball.pos.x, ball.pos.z, pivot.x, pivot.z, tmpV.x, tmpV.z, _c);
  const dx = ball.pos.x - _c.x, dz = ball.pos.z - _c.z;
  const dist = Math.hypot(dx, dz), minD = BALL_R + FLIP_THICK;
  if (dist >= minD || dist < 1e-5) return false;
  const nx = dx / dist, nz = dz / dist;
  const pen = minD - dist;
  ball.pos.x += nx * pen; ball.pos.z += nz * pen;
  const kick = om * _c.t * FLIP_LEN;
  const tvx = (side < 0 ? -Math.sin(ang) : Math.sin(ang)) * kick;
  const tvz = -Math.cos(ang) * kick;
  const relVx = ball.vel.x - tvx, relVz = ball.vel.z - tvz;
  const vn = relVx * nx + relVz * nz;
  if (vn < 0) {
    const e = 0.35;
    ball.vel.x -= (1 + e) * vn * nx;
    ball.vel.z -= (1 + e) * vn * nz;
    const boost = clamp(Math.abs(om) * 0.45, 0, 18);
    if (Math.abs(om) > 2) { ball.vel.x += nx * boost + tvx * 0.5; ball.vel.z += nz * boost + tvz * 0.5; }
  }
  return true;
}

function collideWalls() {
  for (const w of table.walls) {
    closestOnSeg(ball.pos.x, ball.pos.z, w.a[0], w.a[1], w.b[0], w.b[1], _c);
    const dx = ball.pos.x - _c.x, dz = ball.pos.z - _c.z;
    const dist = Math.hypot(dx, dz), minD = BALL_R + (w.r || 0.1);
    if (dist < minD && dist > 1e-6) {
      const nx = dx / dist, nz = dz / dist, pen = minD - dist;
      ball.pos.x += nx * pen; ball.pos.z += nz * pen;
      const vn = ball.vel.x * nx + ball.vel.z * nz;
      if (vn < 0) {
        const e = w.kind === 'sling' ? 0.2 : 0.52;
        ball.vel.x -= (1 + e) * vn * nx;
        ball.vel.z -= (1 + e) * vn * nz;
        if (w.kind === 'sling') {
          const k = w.kick || 13;
          ball.vel.x += nx * k; ball.vel.z += nz * k;
          const sl = table.slings[w.sling]; if (sl) sl.flash = 1;
          SFX.sling(); addScore(50, ball.pos); G.shake = Math.max(G.shake, 0.15);
        }
      }
    }
  }
}

function collideCircles() {
  let ev = null;
  for (const b of table.bumpers) {
    const dx = ball.pos.x - b.x, dz = ball.pos.z - b.z;
    const dist = Math.hypot(dx, dz), minD = BALL_R + b.r;
    if (dist < minD && dist > 1e-6) {
      const nx = dx / dist, nz = dz / dist, pen = minD - dist;
      ball.pos.x += nx * pen; ball.pos.z += nz * pen;
      ball.vel.x = nx * b.kick; ball.vel.z = nz * b.kick;
      table.flashBumper(b, 1);
      SFX.bumper(); addScore(250, tmpV.set(b.x, 0.5, b.z));
      G.shake = Math.max(G.shake, 0.35); flash(0.25);
      emit(tmpV.set(b.x, 0.6, b.z), 18, [b.color, 0xffffff], 7, { up: 3, g: 2 });
      ring(tmpV.set(b.x, 0.08, b.z), b.color, 2.4, 0.35);
      G.hits++;
      if (b.x < 0) G.riftHits++; else G.reachHits++;
      ev = 'bumper';
    }
  }
  for (const t of table.targets) {
    if (t.down) continue;
    const dx = ball.pos.x - t.x, dz = ball.pos.z - t.z;
    if (Math.hypot(dx, dz) < BALL_R + t.r) {
      t.down = true; t.group.visible = false;
      SFX.target(); addScore(400, tmpV.set(t.x, 0.6, t.z));
      emit(tmpV.set(t.x, 0.6, t.z), 12, [t.color, 0xffffff], 5);
      G.hits++; if (t.x < 0) G.riftHits++; else G.reachHits++;
      ev = ev || 'target';
    }
  }
  return ev;
}

function maybeRamps(dt) {
  if (ball.ramp) {
    const path = ball.ramp.pts;
    ball.rampS += dt * 0.55;
    const u = Math.min(0.999, ball.rampS);
    const n = path.length - 1, i = Math.min(n - 1, Math.floor(u * n)), f = u * n - i;
    const a = path[i], b = path[i + 1];
    ball.pos.set(lerp(a[0], b[0], f), lerp(a[1], b[1], f) + BALL_R, lerp(a[2], b[2], f));
    tmpV.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (u >= 0.98) {
      const len = tmpV.length() || 1;
      ball.vel.copy(tmpV).multiplyScalar(14 / len);
      ball.ramp = null; ball.rampS = 0;
    }
    return;
  }
  if (ball.vel.z > -2) return;
  for (const rp of table.rampPaths) {
    const e = rp.enter;
    if (Math.hypot(ball.pos.x - e.x, ball.pos.z - e.z) < e.r && ball.vel.length() > 6) {
      ball.ramp = rp; ball.rampS = 0;
      SFX.glass(); addScore(rp.score, ball.pos.clone());
      emit(ball.pos, 12, [0x40e8ff, 0xc040ff], 4, { g: 1 });
    }
  }
}

function maybePortals() {
  if (G.mode === 'warp' || (G.portalGrace || 0) > 0) return null;
  for (const [id, p] of [['rift', table.portalRift], ['reach', table.portalReach]]) {
    if (!p.lit) continue;
    const d = Math.hypot(ball.pos.x - p.x, ball.pos.z - p.z);
    if (d < 4.5) {
      const k = (1 - d / 4.5) * 18;
      const nx = (p.x - ball.pos.x) / (d || 1), nz = (p.z - ball.pos.z) / (d || 1);
      ball.vel.x += nx * k * 0.25;
      ball.vel.z += nz * k * 0.25;
    }
    if (d < p.r + 0.15) return id;
  }
  return null;
}

function updatePlunger(dt) {
  const down = !!(keys.Plunge || touch.plunge);
  if (ball.inLane && !ball.live) {
    if (down) { ball.pulling = true; ball.charged = Math.min(1, ball.charged + dt * 1.1); }
    else if (ball.pulling) launchPlunger();
  } else ball.pulling = false;
  const pull = ball.pulling ? ball.charged : 0;
  table.plungerRod.position.z = 0.6 + pull * 1.1;
  table.plungerKnob.position.z = 1.75 + pull * 1.1;
}

function launchPlunger() {
  // A tap must still clear the lane exit (~16 units uphill against gravity + friction).
  const power = 26 + ball.charged * 10;
  ball.vel.set(-0.8, 0, -power);
  ball.inLane = true; ball.live = true; ball.pulling = false; ball.charged = 0; ball.stuckT = 0;
  SFX.plunger(); G.shake = Math.max(G.shake, 0.2);
  emit(ball.pos.clone(), 10, [0x40e8ff, 0xffffff], 3, { g: 0 });
}

function drainCheck() {
  if (ball.ramp) return false;
  if (ball.inLane || ball.pos.x > 5.4) return false; // plunger lane is safe
  if (ball.pos.z > 8.7 && ball.pos.x > -3.2 && ball.pos.x < 3.0) return true;
  if (ball.pos.z > 10) return true;
  if (ball.pos.y < -1) return true;
  return false;
}

function updateBall(dt) {
  if (!ball.live && !ball.pulling && ball.inLane) {
    ball.pos.set(6.57, BALL_R, 7.15);
    ball.vel.set(0, 0, 0);
    poseBall();
    return null;
  }
  const steps = 3, h = dt / steps;
  let portal = null;
  for (let s = 0; s < steps; s++) {
    if (!ball.ramp) {
      ball.vel.z += 11.5 * h;
      ball.vel.x *= Math.max(0, 1 - 0.22 * h);
      ball.vel.z *= Math.max(0, 1 - 0.18 * h);
      const spd = Math.hypot(ball.vel.x, ball.vel.z);
      if (spd > 32) { ball.vel.x *= 32 / spd; ball.vel.z *= 32 / spd; }
      ball.pos.x += ball.vel.x * h;
      ball.pos.z += ball.vel.z * h;
      ball.pos.y = BALL_R;
      collideWalls();
      collideBallFlipper(-1, angL, omL);
      collideBallFlipper(1, angR, omR);
      collideCircles();
      if (ball.inLane && (ball.pos.z < -8.8 || ball.pos.x < 5.3)) {
        ball.inLane = false;
        // Peel left onto mid-playfield instead of overshooting into the back-right portal well.
        if (ball.vel.x > -8) ball.vel.x -= 8;
        if (ball.vel.z < -12) ball.vel.z = -12;
      }
      if (ball.pos.x > 5.85 && ball.pos.z > -8.5) ball.inLane = true;
    }
    maybeRamps(h);
    const p = maybePortals(); if (p) portal = p;
  }
  updateStuckBall(dt);
  ball.omega.x = ball.vel.z / BALL_R;
  ball.omega.z = -ball.vel.x / BALL_R;
  poseBall();
  return portal;
}

function updateStuckBall(dt) {
  if (!ball.live || ball.ramp) { ball.stuckT = 0; ball._stuckAt = null; return; }
  if (!ball._stuckAt) ball._stuckAt = ball.pos.clone();
  const moved = Math.hypot(ball.pos.x - ball._stuckAt.x, ball.pos.z - ball._stuckAt.z);
  if (moved < 0.8) {
    ball.stuckT = (ball.stuckT || 0) + dt;
  } else {
    ball.stuckT = 0;
    ball._stuckAt.copy(ball.pos);
  }
  if ((ball.stuckT || 0) < 2) return;
  ball.stuckT = 0;
  ball._stuckAt = ball.pos.clone();
  SFX.ding();
  G.shake = Math.max(G.shake, 0.18);
  if (ball.inLane) {
    if (ball.pos.z > -2) {
      // Sitting or bouncing in the lower lane — shoot through the exit.
      ball.vel.set(-5, 0, -28);
    } else {
      // Jammed at the gate — kick left onto the field.
      ball.vel.set(-14, 0, -6);
      if (ball.pos.x > 5.3) ball.pos.x = 5.2;
      ball.inLane = false;
    }
  } else {
    const ax = ball.pos.x === 0 ? -1 : -Math.sign(ball.pos.x);
    ball.vel.x += ax * 7;
    ball.vel.z = Math.min(ball.vel.z, 0) - 8;
  }
  emit(ball.pos.clone(), 8, [0x40e8ff, 0xffc070], 3, { g: 0 });
}

function poseBall() {
  H.root.position.set(ball.pos.x, ball.pos.y, ball.pos.z);
  H.shell.rotation.x += ball.omega.x * (1 / 60);
  H.shell.rotation.z += ball.omega.z * (1 / 60);
  H.shadow.position.y = -BALL_R + 0.02;
  H.shadow.material.opacity = 0.4;
}

function resetBallToPlunger() {
  const L = table.layout.plunger;
  world.resetBall(world.primary(), L.x, L.z, { live: false, inLane: true });
  const b = world.primary();
  ball.pos.set(b.x, b.y, b.z); ball.vel.set(0, 0, 0);
  ball.ramp = null; ball.rampS = 0;
  ball.inLane = true; ball.live = false; ball.pulling = false; ball.charged = 0; ball.stuckT = 0;
  setHeroMode('ball');
  poseBall();
}

function syncCompatBall() {
  const b = world.primary();
  if (!b) return;
  ball.pos.set(b.x, b.y, b.z);
  ball.vel.set(b.vx, b.vy, b.vz);
  ball.live = b.live; ball.inLane = b.inLane; ball.charged = b.charged;
  ball.pulling = b.pulling; ball.saveT = b.saveT;
}

function poseAllBalls(dt) {
  const meshes = [H, ...extraBalls];
  for (let i = 0; i < meshes.length; i++) {
    const E = meshes[i], b = world.balls[i];
    if (!b || i > 0 && !b.live && (b.inLane || !b.live)) {
      if (i > 0) E.root.visible = false;
      if (i === 0 && b) syncMesh(b, E.root, E.shell, dt);
      continue;
    }
    E.root.visible = true;
    if (i > 0) E.setMode('ball');
    syncMesh(b, E.root, E.shell, dt);
    if (E.shadow) { E.shadow.position.y = -b.r + 0.02; E.shadow.material.opacity = 0.4; }
  }
}

function dmdSay(text, sub, dur) {
  G.dmdCall = text; G.dmdCallT = dur || 1.8;
  if (table.dmd) table.dmd.state.line2 = sub || '';
}

function startMultiball() {
  if (G.multiball) return;
  G.multiball = true; G.jackpot = 8000;
  world.magnetOn = true;
  if (table.feat && table.feat.magnet) table.feat.magnet.on = true;
  const L = table.layout;
  const spots = [
    [L.saucer.x, L.saucer.z - 0.2],
    [0.4, 5.2],
  ];
  while (world.balls.length < 3) {
    const s = spots[world.balls.length - 1] || [0, 4];
    const nb = world.addBall(s[0], s[1]);
    nb.live = true; nb.inLane = false; nb.vx = (Math.random() - 0.5) * 6; nb.vz = -12; nb.saveT = 4;
  }
  SFX.callout('MULTIBALL'); SFX.jackpot();
  showMsg('MULTIBALL', '3 ROWLEX IN PLAY', 2.2);
  dmdSay('MULTIBALL', 'JACKPOT LIT', 2.4);
  G.shake = Math.max(G.shake, 0.45); flash(0.4);
  table.flashInserts('all');
}

function handlePhysEvents(evs) {
  let portal = null;
  for (const ev of evs) {
    const pos = tmpV.set(ev.x || 0, (ev.y || 0.4) + 0.2, ev.z || 0);
    switch (ev.type) {
      case 'bumper':
        if (ev.bumper && ev.bumper.group) table.flashBumper(ev.bumper, 1);
        else if (ev.bumper) table.flashBumper(table.bumpers[0] || ev.bumper, 0.7);
        SFX.bumper(); addScore(250, pos); G.hits++;
        if ((ev.x || 0) < 0) G.riftHits++; else G.reachHits++;
        G.shake = Math.max(G.shake, 0.35); flash(0.2);
        emit(pos, 16, [ev.color || 0x40e8ff, 0xffffff], 6, { up: 3, g: 2 });
        table.flashArcs();
        noteCombo('bumper', ev);
        break;
      case 'sling':
        if (table.slings[ev.sling]) table.slings[ev.sling].flash = 1;
        SFX.sling(); addScore(50, pos); G.shake = Math.max(G.shake, 0.15);
        break;
      case 'flip':
        SFX.flip();
        // Cycle rollover lights with the flippers, like a real table.
        if (table.layout.rollovers && table.layout.rollovers.length) {
          const arr = table.layout.rollovers;
          const lit = arr.map((r) => r.lit);
          if (ev.side === 'L') {
            const f = lit.shift(); lit.push(f);
          } else {
            const f = lit.pop(); lit.unshift(f);
          }
          arr.forEach((r, i) => { r.lit = lit[i]; });
        }
        break;
      case 'standup':
        SFX.target(); addScore(400, pos); G.hits++;
        noteCombo('standup', ev);
        if (ev.letter) {
          const all = table.layout.standups.every((s) => s.lit);
          if (all) {
            addScore(2500, pos); SFX.callout('ROWLEX'); dmdSay('ROWLEX', 'MULTIBALL LOCK', 2);
            G.locks++;
            if (G.locks >= 1 && !G.multiball) startMultiball();
            table.layout.standups.forEach((s) => { s.lit = false; });
          }
        }
        break;
      case 'drop':
        SFX.target(); addScore(350, pos); G.hits++;
        if (table.layout.drops.every((d) => d.down)) {
          addScore(2000, pos); showMsg('BANK DOWN', '+2000', 1.4);
          table.layout.drops.forEach((d) => { d.down = false; });
          world.magnetOn = true;
          if (table.feat && table.feat.magnet) table.feat.magnet.on = true;
        }
        break;
      case 'rollover':
        if (ev.lane != null && table.layout.rollovers[ev.lane]) table.layout.rollovers[ev.lane].lit = true;
        SFX.ding(); addScore(150, pos);
        if (table.layout.rollovers.every((r) => r.lit)) {
          addScore(1000, pos);
          if (table.layout.kickback) table.layout.kickback.lit = true;
          table.layout.rollovers.forEach((r) => { r.lit = false; });
          showMsg('KICKBACK LIT', 'LEFT OUTLANE', 1.4);
        }
        break;
      case 'spinner':
        SFX.spinner(); addScore(100 + Math.floor((ev.speed || 0) * 20), pos);
        break;
      case 'saucerIn':
        SFX.saucer(); addScore(G.multiball ? G.jackpot : 750, pos);
        if (G.multiball) {
          SFX.jackpot(); SFX.callout('JACKPOT'); dmdSay('JACKPOT', String(G.jackpot), 1.8);
          showMsg('JACKPOT', '+' + G.jackpot, 1.6);
          G.jackpot += 2500;
          G.shake = Math.max(G.shake, 0.5); flash(0.35);
        } else {
          dmdSay('SCOOP', 'HOLD ON', 1);
        }
        break;
      case 'saucerOut':
        SFX.kicker();
        break;
      case 'kickback':
        SFX.kicker(); addScore(500, pos); showMsg('KICKBACK', '', 1);
        break;
      case 'captive':
        SFX.clang(); addScore(200, pos);
        break;
      case 'rampEnter':
      case 'railEnter':
        SFX.ramp(); addScore(ev.score || 1500, pos); G.shake = Math.max(G.shake, 0.2);
        noteCombo('ramp', ev);
        G.reentryHits = (G.reentryHits || 0) + 1;
        if (G.multiball) { addScore(1500, pos); }
        break;
      case 'launch':
        SFX.plunger(); G.shake = Math.max(G.shake, 0.2);
        emit(pos, 10, [0x40e8ff, 0xffffff], 3, { g: 0 });
        break;
      case 'save':
        SFX.save(); SFX.callout('BALL SAVED'); showMsg('BALL SAVED', 'SHOOT AGAIN', 1.6); dmdSay('BALL SAVED', '', 1.6);
        G.shake = Math.max(G.shake, 0.25);
        break;
      case 'returned':
        SFX.returned(); SFX.callout('BALL RETURNED'); showMsg('BALL RETURNED', 'BACK TO THE LANE', 1.8);
        dmdSay('BALL RETURNED', '', 1.8);
        G.sub = 'plunge';
        break;
      case 'drain':
        handleDrain(ev);
        break;
      case 'stuck':
        SFX.ding();
        break;
      case 'magnetGrab':
        SFX.magnet(); showMsg('MAGNET', '', 0.8);
        break;
      case 'diverter':
        SFX.ding();
        if (table.feat && table.feat.diverter) table.feat.diverter._want = ev.state;
        break;
      case 'tiltWarn':
        SFX.callout('DANGER'); showMsg('DANGER', 'TILT WARNING', 1.4); dmdSay('DANGER', 'TILT WARNING', 1.4);
        break;
      case 'tilt':
        SFX.tilt(); SFX.callout('TILT'); showMsg('TILT', 'FLIPPERS DEAD', 2); dmdSay('TILT', '', 2);
        G.shake = Math.max(G.shake, 0.5);
        break;
    }
  }
  return portal;
}

function handleDrain(ev) {
  const still = world.balls.filter((b) => b !== ev.ball && b.live);
  if (still.length) {
    showMsg('BALL DRAINED', still.length + ' IN PLAY', 1.2);
    return;
  }
  ballLost();
}

function noteCombo(kind, ev) {
  const now = G.t;
  if (G._lastShotT != null && now - G._lastShotT < 2.6 && G._lastShot !== kind) {
    G.shotCombo = (G.shotCombo || 1) + 1;
    if (G.shotCombo >= 3) {
      const bonus = 400 * G.shotCombo;
      addScore(bonus, tmpV.set(ev.x, 0.6, ev.z));
      SFX.callout('COMBO'); showMsg('COMBO x' + G.shotCombo, '+' + bonus, 1.2);
      dmdSay('COMBO x' + G.shotCombo, '+' + bonus, 1.2);
    }
  } else G.shotCombo = 1;
  G._lastShotT = now; G._lastShot = kind;
}

function checkPortals() {
  if (G.mode === 'warp' || (G.portalGrace || 0) > 0) return null;
  for (const b of world.balls) {
    if (!b.live || b.path || b.inLane) continue;
    for (const [id, p] of [['rift', table.portalRift], ['reach', table.portalReach], ['reentry', table.portalReentry]]) {
      if (!p.lit) continue;
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      if (d < 3.2) {
        const k = (1 - d / 3.2) * 10;
        const nx = (p.x - b.x) / (d || 1), nz = (p.z - b.z) / (d || 1);
        b.vx += nx * k * 0.15; b.vz += nz * k * 0.15;
      }
      if (d < p.r + 0.15) return id;
    }
  }
  return null;
}

function stepPinball(dt) {
  world.setFlippers(!!(keys.FlipL || touch.flipL), !!(keys.FlipR || touch.flipR));
  world.plungerDown = !!(keys.Plunge || touch.plunge);
  const pull = world.updatePlunger(dt);
  table.plungerRod.position.z = 0.6 + pull * 1.1;
  table.plungerKnob.position.z = 1.75 + pull * 1.1;
  const evs = world.step(dt);
  handlePhysEvents(evs);
  syncCompatBall();
  if (ball.live && G.sub === 'plunge') G.sub = 'play';
  table.flipL.rotation.y = world.flipL.ang;
  table.flipR.rotation.y = -world.flipR.ang;
  table.flipL.userData.light.intensity = 0.8 + (world.flipL.pressed ? 1.4 : 0);
  table.flipR.userData.light.intensity = 0.8 + (world.flipR.pressed ? 1.4 : 0);
  if (table.feat && table.feat.miniFlip) table.feat.miniFlip.rotation.y = world.miniFlip.ang;
  if (table.feat && table.feat.diverter) table.feat.diverter._want = world.diverter;
  const focus = world.balls.find((b) => b.live) || world.primary();
  if (focus) table.trackBall(focus.x, focus.z);
  poseAllBalls(dt);
  if (G.dmdCallT > 0) G.dmdCallT -= dt;
  const save = world.primary() && world.primary().saveT > 0 ? ('SAVE ' + world.primary().saveT.toFixed(1)) : '';
  const modeLine = G.multiball ? 'MULTIBALL' : (table.portalRift.lit ? 'RIFT OPEN' : (table.portalReach.lit ? 'REACH OPEN' : 'PINBALL'));
  if (table.dmd) table.dmd.draw(G.score, G.balls, save || modeLine, G.dmdCallT > 0 ? G.dmdCall : '');
  return checkPortals();
}

function updatePortalLights() {
  if (!table.portalRift.lit && (G.riftHits >= G.riftLitNeed || G.hits >= G.riftLitNeed + 3)) {
    table.setPortalLit('rift', true); SFX.lit(); SFX.callout('RIFT OPEN');
    showMsg('RIFT OPEN', 'DROP IN TO ENTER', 2.2); dmdSay('RIFT OPEN', 'DROP IN', 2.2);
  }
  if (!table.portalReach.lit && (G.reachHits >= G.reachLitNeed || G.hits >= G.reachLitNeed + 5)) {
    table.setPortalLit('reach', true); SFX.lit(); SFX.callout('REACH OPEN');
    showMsg('REACH OPEN', 'DROP IN TO ENTER', 2.2); dmdSay('REACH OPEN', 'DROP IN', 2.2);
  }
  if (table.portalReentry && !table.portalReentry.lit && (G.reentryHits >= G.reentryLitNeed || G.hits >= G.reentryLitNeed + 6)) {
    table.setPortalLit('reentry', true); SFX.lit(); SFX.callout('RE-ENTRY OPEN');
    showMsg('RE-ENTRY OPEN', 'DROP IN TO ENTER', 2.2); dmdSay('RE-ENTRY OPEN', 'DROP IN', 2.2);
  }
}

function resetHeroRift() {
  hero.pos.copy(riftW.start); hero.pos.y = riftW.groundAt(hero.pos, 10, 10).y + 1.05;
  hero.vel.set(0, 0, 0); hero.hp = hero.maxHp; hero.dead = false; hero.yaw = Math.PI;
  hero.rollT = 0; hero.hurtT = 0; hero.throwT = 0; hero.disc.state = 'held';
  hero.lastSafe.copy(hero.pos);
  setHeroMode('walk'); H.root.visible = true; H.root.rotation.set(0, hero.yaw, 0);
  H.shell.rotation.set(0, 0, 0);
  camState.yaw = 0; camState.pitch = 0.35; camState.dist = 8.5;
}

function hurtHero(dmg, from) {
  if (G.mode !== 'rift' || hero.rollT > 0 || hero.hurtT > 0 || hero.dead) return;
  if (DEMO) dmg *= 0.3;
  hero.hp -= dmg; hero.hurtT = 0.45; hurtA = 0.8; SFX.hurt(); G.shake = Math.max(G.shake, 0.25);
  if (from) { tmpV.subVectors(hero.pos, from).setY(0).normalize(); hero.vel.addScaledVector(tmpV, 4); }
  if (DEMO) hero.hp = Math.max(hero.hp, 35);
  if (hero.hp <= 0) { hero.hp = 0; hero.dead = true; SFX.die(); setTimeout(() => leavePortal(false, 4000), CAPTURE ? 0 : 900); }
}

function camForwardXZ(out) { return out.set(-Math.sin(camState.yaw), 0, -Math.cos(camState.yaw)); }

function updateHeroRift(dt) {
  if (hero.dead) return;
  const fwd = camForwardXZ(tmpV), right = tmpV2.set(-fwd.z, 0, fwd.x);
  const moveDir = tmpV3.set(0, 0, 0).addScaledVector(fwd, input.my).addScaledVector(right, input.mx);
  const mlen = Math.min(1, moveDir.length());
  hero.rollCD -= dt; hero.hurtT -= dt; hero.throwT -= dt; hero.jumpBuf -= dt; hero.coyote -= dt;
  if (input.jump) hero.jumpBuf = 0.15;
  if (input.roll && hero.rollCD <= 0 && hero.rollT <= 0 && hero.onGround) {
    hero.rollT = 0.48; hero.rollCD = 0.75; SFX.roll();
    if (mlen > 0.1) hero.rollDir.copy(moveDir).normalize(); else hero.rollDir.set(Math.sin(hero.yaw), 0, Math.cos(hero.yaw));
    hero.yaw = Math.atan2(hero.rollDir.x, hero.rollDir.z);
  }
  let speed = 8.2, accel = hero.onGround ? 14 : 4;
  const want = tmpF.copy(moveDir).multiplyScalar(speed);
  if (hero.rollT > 0) { hero.rollT -= dt; want.copy(hero.rollDir).multiplyScalar(13); accel = 30; }
  hero.vel.x = damp(hero.vel.x, want.x, accel, dt); hero.vel.z = damp(hero.vel.z, want.z, accel, dt);
  if (hero.jumpBuf > 0 && (hero.onGround || hero.coyote > 0) && hero.rollT <= 0) {
    hero.vel.y = 9.6; hero.onGround = false; hero.coyote = 0; hero.jumpBuf = 0; SFX.jump();
    emit(tmpV.copy(hero.pos), 8, 0x80e0ff, 2, { flat: true, g: 0 });
  }
  hero.vel.y -= GRAV * dt;
  const prevY = hero.pos.y, wasGround = hero.onGround;
  hero.pos.x += hero.vel.x * dt; hero.pos.z += hero.vel.z * dt;
  hero.pos.y += hero.vel.y * dt;
  const gnd = riftW.groundAt(hero.pos, prevY, wasGround ? 0.45 : 0.05);
  const stand = 1.05;
  if (hero.pos.y <= gnd.y + stand && gnd.y > -20) {
    if (!wasGround && hero.airT > 0.35) { SFX.land(); emit(tmpV.copy(hero.pos).setY(gnd.y), 10, 0x80e0ff, 3, { flat: true, g: 0 }); }
    hero.pos.y = gnd.y + stand; if (hero.vel.y < 0) hero.vel.y = 0; hero.onGround = true; hero.airT = 0;
    hero.lastSafe.copy(hero.pos);
  } else { if (wasGround) hero.coyote = 0.1; hero.onGround = false; hero.airT += dt; }
  if (hero.pos.y < -10) {
    hero.pos.copy(hero.lastSafe); hero.vel.set(0, 0, 0);
    if (!DEMO) hurtHero(25, null);
  }
  if (hero.throwT > 0 && hero.disc.aimYaw !== undefined) hero.yaw = angLerp(hero.yaw, hero.disc.aimYaw, 1 - Math.exp(-20 * dt));
  else if (mlen > 0.1 && hero.rollT <= 0) hero.yaw = angLerp(hero.yaw, Math.atan2(moveDir.x, moveDir.z), 1 - Math.exp(-12 * dt));
  H.root.rotation.set(0, hero.yaw, 0);
  if (input.throw) throwDisc();
  poseRowlex(H, { t: G.t, sp: Math.hypot(hero.vel.x, hero.vel.z), phase: (hero.phase += dt * (3 + mlen * 5)), throwT: hero.throwT });
  if (hero.rollT > 0) { const k = 1 - hero.rollT / 0.48; H.body.rotation.x = k * Math.PI * 2; }
  else H.body.rotation.x = damp(H.body.rotation.x, 0, 12, dt);
  H.root.visible = !(hero.hurtT > 0 && Math.floor(G.t * 30) % 2 === 0);
  updateDisc(dt);
  if (G.riftGoal && riftW.exit.visible) {
    const d = Math.hypot(hero.pos.x - riftW.exitPos.x, hero.pos.z - riftW.exitPos.z);
    if (d < 2.2) leavePortal(true, 8000 + G.riftKills * 400);
  }
}

function targets() { return G.enemies; }
function center(e, out) { return out.copy(e.pos).setY(e.pos.y + (e.def && e.def.hitY || 0.4)); }
function findLock() {
  const fwd = camForwardXZ(tmpF), chest = tmpV3.copy(hero.pos).setY(hero.pos.y + 0.4);
  let best = null, bs = 1e9; const c = tmpV;
  if (G.mode === 'rift') {
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      center(e, c); const v = c.sub(chest), d = v.length(); if (d > 30) continue;
      const ang = Math.acos(clamp((v.x * fwd.x + v.z * fwd.z) / (Math.hypot(v.x, v.z) || 1), -1, 1));
      if (ang > 1.0 && d > 7) continue;
      const s = d * 0.35 + ang * 9; if (s < bs) { bs = s; best = e; }
    }
  }
  if (G.mode === 'reach') {
    for (const r of G.racers) {
      if (r.isPlayer || r.finished) continue;
      const d = r.pos.distanceTo(hero.pos); if (d > 36) continue;
      const v = tmpV.subVectors(r.pos, hero.pos);
      const ang = Math.acos(clamp((v.x * fwd.x + v.z * fwd.z) / (Math.hypot(v.x, v.z) || 1), -1, 1));
      const s = d * 0.3 + ang * 8; if (s < bs) { bs = s; best = r; }
    }
  }
  return best;
}
function throwDisc() {
  const D = hero.disc; if (D.state !== 'held' || hero.rollT > 0 || hero.dead) return;
  D.target = findLock(); H.root.updateMatrixWorld(true); H.discMount.getWorldPosition(D.pos);
  if (D.target) {
    const tp = D.target.def ? center(D.target, tmpV) : tmpV.copy(D.target.pos);
    tp.sub(D.pos).normalize();
  } else { camera.getWorldDirection(tmpV); tmpV.y = clamp(tmpV.y + 0.12, -0.25, 0.35); tmpV.normalize(); }
  D.vel.copy(tmpV).multiplyScalar(30); D.state = 'out'; D.t = 0; D.hits.clear(); D.aimYaw = Math.atan2(tmpV.x, tmpV.z);
  hero.throwT = 0.3; SFX.throw();
}
const bez = new THREE.Vector3(), cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), cs = new THREE.Vector3(1, 1, 1), prevPt = new THREE.Vector3();
function updateDisc(dt) {
  const D = hero.disc;
  if (H.mode === 'ball') { disc.visible = false; chain.visible = false; return; }
  H.root.updateMatrixWorld(true); H.discMount.getWorldPosition(handPos);
  const spin = disc.userData.spin;
  if (D.state === 'held') {
    disc.position.copy(handPos); H.discMount.getWorldQuaternion(disc.quaternion); spin.rotation.y += dt * 5; chain.visible = false; disc.visible = H.root.visible || hero.hurtT > 0;
    disc.userData.halo.material.opacity = 0.35; return;
  }
  disc.visible = true; chain.visible = true; disc.userData.halo.material.opacity = 0.7;
  D.t += dt; spin.rotation.y += dt * 38;
  if (D.state === 'out') {
    if (D.target && !D.target.dead && !D.target.finished) {
      const tp = D.target.def ? center(D.target, tmpV) : tmpV.copy(D.target.pos);
      tp.sub(D.pos); const dist = tp.length(); tp.normalize().multiplyScalar(32); D.vel.lerp(tp, 1 - Math.exp(-11 * dt)); if (dist < 0.6) D.t = 9;
    }
    D.pos.addScaledVector(D.vel, dt);
    if (D.t > 0.55 || D.pos.distanceTo(hero.pos) > 26) { D.state = 'back'; D.t = 0; D.hits.clear(); }
  } else {
    tmpV.subVectors(handPos, D.pos); const dist = tmpV.length(); tmpV.normalize().multiplyScalar(26 + D.t * 30); D.vel.lerp(tmpV, 1 - Math.exp(-14 * dt));
    D.pos.addScaledVector(D.vel, dt);
    if (dist < 0.9 || D.t > 2.5) { D.state = 'held'; SFX.catch(); emit(handPos, 6, 0xff3a1a, 2); }
  }
  disc.position.copy(D.pos);
  const ax = tmpV2.set(D.vel.z, 0, -D.vel.x); if (ax.lengthSq() > 0.001) { ax.normalize(); disc.quaternion.setFromAxisAngle(ax, 0.25); }
  if (Math.random() < 0.8) emit(D.pos, 1, [0xff2a1a, 0xff6a2a], 0.5, { g: 0, life: 0.35 });
  if (G.mode === 'rift') {
    for (const e of G.enemies) {
      if (e.dead || e.spawnT > 0 || D.hits.has(e)) continue;
      center(e, tmpV3); if (tmpV3.distanceTo(D.pos) < e.def.hitR + 0.45) {
        D.hits.add(e); damageEnemy(e, 1, D.vel);
        if (D.state === 'out' && e === D.target) { D.state = 'back'; D.t = 0; D.hits.clear(); D.hits.add(e); }
      }
    }
  }
  if (G.mode === 'reach') {
    for (const r of G.racers) {
      if (r.isPlayer || r.finished || D.hits.has(r)) continue;
      if (r.pos.distanceTo(D.pos) < 1.2) {
        D.hits.add(r);
        r.stun = 0.7; r.spinOutT = 0.8; r.speed *= 0.45; r.vel.y += 6;
        SFX.ko(); emit(r.pos, 14, [0xff2a1a, 0xffffff], 8, { up: 3 });
        addScore(300, r.pos); G.shake = Math.max(G.shake, 0.2);
        if (D.state === 'out') { D.state = 'back'; D.t = 0; }
      }
    }
  }
  const len = handPos.distanceTo(D.pos), sag = Math.min(1.2, len * 0.08) * (D.state === 'out' ? 0.4 : 1);
  prevPt.copy(handPos);
  for (let i = 0; i < CHAIN_N; i++) {
    const k = (i + 1) / CHAIN_N; bez.lerpVectors(handPos, D.pos, k); bez.y -= Math.sin(k * Math.PI) * sag;
    tmpV.subVectors(bez, prevPt); const l = tmpV.length() || 0.001; cq.setFromUnitVectors(tmpV2.set(0, 0, 1), tmpV.divideScalar(l));
    cs.set(1, 1, Math.min(4, l / 0.16)); cm.compose(tmpV2.lerpVectors(prevPt, bez, 0.5), cq, cs); chain.setMatrixAt(i, cm); prevPt.copy(bez);
  }
  chain.instanceMatrix.needsUpdate = true;
}

function damageEnemy(e, dmg, from) {
  e.hp -= dmg; e.flash = 0.15; SFX.hit();
  emit(center(e, tmpV), 10, e.def.debris, 5);
  if (from) { tmpV2.copy(from).setY(0).normalize(); e.vel.addScaledVector(tmpV2, 4); }
  addScore(40, e.pos);
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  if (e.dead) return; e.dead = true;
  SFX.clang(); burstDebris(e.pos.clone().setY(e.pos.y + 0.4), 14, e.def.debris, 7);
  emit(e.pos, 22, e.def.debris, 7, { up: 3 });
  addScore(e.def.score, e.pos); G.riftKills++;
  scene.remove(e.P.root);
  G.enemies = G.enemies.filter(x => x !== e);
  if (G.riftKills >= 8 || (G.riftWaves >= 3 && G.enemies.length === 0)) openRiftExit();
}
function openRiftExit() {
  if (G.riftGoal) return;
  G.riftGoal = true; riftW.exit.visible = true; SFX.open();
  showMsg('EXIT RIFT OPEN', 'JUMP IN TO RETURN', 2.2);
}
function makeEnemy(type, pos) {
  const def = RIFT_ENEMIES[type], P = def.build();
  const e = { type, def, P, pos: P.root.position, vel: new THREE.Vector3(), hp: def.hp, st: 'idle', t: 0, cool: rnd(0.6, 1.6), flash: 0, yaw: 0, spawnT: 0.5, dead: false, phase: Math.random() * 6 };
  e.pos.copy(pos); if (def.fly) e.pos.y += 1.4;
  scene.add(P.root); G.enemies.push(e);
  emit(e.pos, 16, def.debris, 4, { g: 0 });
  return e;
}
function updateEnemies(dt) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.spawnT -= dt; e.cool -= dt; e.flash -= dt; e.t += dt;
    const to = tmpV.subVectors(hero.pos, e.pos); const dist = to.length(); to.normalize();
    if (e.def.fly) {
      e.pos.x += to.x * 2.4 * dt + Math.sin(e.t * 2 + e.phase) * 0.8 * dt;
      e.pos.z += to.z * 2.4 * dt + Math.cos(e.t * 2 + e.phase) * 0.8 * dt;
      e.pos.y += Math.sin(e.t * 3 + e.phase) * 0.6 * dt;
      e.P.body.rotation.y = Math.atan2(to.x, to.z);
      if (e.P.bolts) for (let i = 0; i < e.P.bolts.length; i++) e.P.bolts[i].rotation.z = e.t * 6 + i;
      if (e.P.wings) { e.P.wings[0].rotation.z = Math.sin(e.t * 10) * 0.5; e.P.wings[1].rotation.z = -Math.sin(e.t * 10) * 0.5; }
      if (e.cool <= 0 && dist < 16) {
        e.cool = rnd(1.6, 2.6);
        const v = tmpV2.copy(to).multiplyScalar(10); v.y += 0.2;
        fireShot(e.pos.clone().add(tmpV3.set(0, 0.2, 0)), v);
      }
    } else {
      if (dist > 1.4) { e.vel.x = to.x * 2.8; e.vel.z = to.z * 2.8; }
      else e.vel.x = e.vel.z = 0;
      e.vel.y -= GRAV * dt;
      e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt; e.pos.y += e.vel.y * dt;
      const gnd = riftW.groundAt(e.pos, e.pos.y + 0.4, 0.4);
      const stand = 0.35;
      if (e.pos.y <= gnd.y + stand && gnd.y > -20) { e.pos.y = gnd.y + stand; e.vel.y = 0; }
      if (e.pos.y < -8) { e.pos.copy(riftW.spawnPos()); e.pos.y += 0.4; e.vel.set(0, 0, 0); }
      e.P.root.rotation.y = Math.atan2(to.x, to.z);
      if (e.P.legs) for (let i = 0; i < e.P.legs.length; i++) e.P.legs[i].rotation.z = Math.sin(e.t * 8 + i) * 0.4;
      if (dist < 1.6 && e.cool <= 0) { e.cool = 1.1; hurtHero(12, e.pos); }
    }
  }
  for (const s of G.shots) {
    if (s.dead) continue;
    s.t += dt; s.pos.addScaledVector(s.vel, dt);
    s.m.position.copy(s.pos);
    if (s.t > 4 || s.pos.y < -12) s.dead = true;
    if (!hero.dead && s.pos.distanceTo(hero.pos) < 0.9) { s.dead = true; hurtHero(8, s.pos); emit(s.pos, 6, 0x40e8ff, 3); }
  }
  G.shots = G.shots.filter(s => { if (s.dead) { scene.remove(s.m); return false; } return true; });
}
function fireShot(from, vel) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0x80e8ff, toneMapped: false }));
  m.position.copy(from); scene.add(m);
  G.shots.push({ m, pos: m.position, vel: vel.clone(), t: 0, dead: false });
}
function updateRiftSpawner(dt) {
  if (G.riftGoal) return;
  G.spawnT = (G.spawnT ?? 1.2) - dt;
  const maxA = 3 + Math.min(3, G.riftWaves);
  if (G.spawnT <= 0 && G.enemies.length < maxA) {
    G.spawnT = rnd(1.3, 2.4);
    makeEnemy(pick(['wisp', 'crawler', 'bird']), riftW.spawnPos()); SFX.spawn();
    if (G.enemies.length === 1) G.riftWaves = Math.max(G.riftWaves, 1);
  }
  if (G.riftKills >= 3 && G.riftWaves < 2) G.riftWaves = 2;
  if (G.riftKills >= 6 && G.riftWaves < 3) G.riftWaves = 3;
}

const RIDE = 0.7, MAX_SPD = 84, BOOST_SPD = 138, ACCEL = 50, BRAKE = 78, COAST = 14, STEER = 2.05;
const LAPS = 2;
let player = null;
function makeRacer(opt) {
  const P = opt.build();
  if (!opt.isPlayer) scene.add(P.root);
  return {
    isPlayer: !!opt.isPlayer, name: opt.name, color: opt.color, P: opt.isPlayer ? H : P,
    pos: opt.isPlayer ? hero.pos : new THREE.Vector3(),
    vel: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, speed: 0, onGround: true,
    s: 0, lateral: 0, hintS: 0, boost: opt.isPlayer ? 50 : 30,
    lap: 0, ck: 0, finished: false, place: 1, stun: 0, spinOutT: 0, airT: 0,
    skill: opt.skill ?? 0.85, accel: 0, steer: 0, brake: 0, wantBoost: false, throwT: 0,
  };
}
function clearRacers() {
  for (const r of G.racers) if (!r.isPlayer && r.P && r.P.root) scene.remove(r.P.root);
  G.racers = []; player = null;
}
function spawnField() {
  clearRacers();
  const T = reachW.track, len = T.length;
  const start = wrapDist(len - 14, len);
  player = makeRacer({ isPlayer: true, name: 'ROWLEX', color: '#40e8ff', build: () => H, skill: 1 });
  G.racers.push(player);
  for (let i = 0; i < 3; i++) {
    const def = RIVALS[i];
    G.racers.push(makeRacer({ name: def.name, color: def.color, build: () => def.build(1), skill: 0.74 + i * 0.06 }));
  }
  for (let i = 0; i < G.racers.length; i++) {
    const row = i >> 1, side = i % 2 ? 2.2 : -2.2;
    const s = wrapDist(start - row * 8, len);
    const sm = sampleAt(T, s);
    const r = G.racers[i];
    r.s = r.hintS = s; r.lateral = side;
    r.pos.copy(sm.p).addScaledVector(sm.b, side).addScaledVector(sm.n, RIDE);
    r.yaw = Math.atan2(sm.t.x, sm.t.z);
    r.pitch = Math.asin(clamp(sm.t.y, -1, 1));
    r.roll = -sm.bank; r.speed = 0; r.vel.set(0, 0, 0);
    r.lap = 0; r.finished = false; r.boost = r.isPlayer ? 55 : 35; r.ck = 0;
    poseRacer(r);
  }
  setHeroMode('sled');
  hero.disc.state = 'held'; hero.throwT = 0; hero.dead = false; hero.hp = hero.maxHp;
}

function poseRacer(r) {
  const P = r.P;
  P.root.position.copy(r.pos);
  P.root.rotation.order = 'YXZ';
  P.root.rotation.y = r.yaw;
  P.root.rotation.x = r.pitch;
  P.root.rotation.z = r.roll;
  if ((r.spinOutT || 0) > 0) {
    const u = r.spinOutT;
    P.root.rotation.z = r.roll + u * 14;
    P.root.rotation.x = r.pitch + Math.sin(u * 18) * 0.55;
  }
  if (P.shadow) { P.shadow.visible = r.onGround; P.shadow.position.y = r.isPlayer ? -0.66 : -RIDE + 0.05; }
  if (r.isPlayer) poseRowlex(H, { t: G.t, sp: r.speed * 0.08, throwT: hero.throwT });
}

function currentMax(r) {
  let m = MAX_SPD * (0.92 + (r.skill - 0.8) * 0.5);
  if (r.boosting) m = BOOST_SPD;
  const pr = project(reachW.track, r.pos, r.hintS);
  if (!pr.onRoad && r.onGround) m *= 0.58;
  if (r.stun > 0) m *= 0.35;
  return m;
}
function updateRacer(r, dt) {
  const T = reachW.track, len = T.length;
  if (r.finished) {
    r.speed = damp(r.speed, 22, 2, dt);
    r.s = wrapDist(r.s + r.speed * dt, len);
    const sm = sampleAt(T, r.s);
    r.pos.copy(sm.p).addScaledVector(sm.b, r.lateral).addScaledVector(sm.n, RIDE);
    r.yaw = angLerp(r.yaw, Math.atan2(sm.t.x, sm.t.z), 0.15);
    poseRacer(r); return;
  }
  r.stun = Math.max(0, r.stun - dt);
  r.spinOutT = Math.max(0, (r.spinOutT || 0) - dt);
  r.throwT = Math.max(0, (r.throwT || 0) - dt);
  r.boosting = !!(r.wantBoost && r.boost > 1);
  if (r.boosting) { r.boost = Math.max(0, r.boost - 30 * dt); if (r.boost <= 0) r.boosting = false; }
  else r.boost = Math.min(100, r.boost + (r.isPlayer ? 8.4 : 6) * dt);

  const cap = currentMax(r);
  if (G.countdown > 0) r.speed = 0;
  else {
    if (r.brake > 0) r.speed = Math.max(0, r.speed - BRAKE * r.brake * dt);
    else if (r.accel > 0) r.speed = Math.min(cap, r.speed + ACCEL * r.accel * (r.boosting ? 1.8 : 1) * dt);
    else r.speed = Math.max(0, r.speed - COAST * dt);
    if (r.speed > cap) r.speed = damp(r.speed, cap, 3, dt);
  }
  const steerIn = r.stun > 0 ? 0 : r.steer;
  const prevS = r.s;
  const sm0 = sampleAt(T, r.s);
  const half = sm0.w * 0.5;
  if (r.onGround) {
    // Spline-locked: holding accel follows the circuit; A/D changes lane position.
    r.s = wrapDist(r.s + r.speed * dt, len);
    r.lateral = clamp(r.lateral + steerIn * Math.max(14, r.speed) * dt * 0.16, -half + 0.2, half - 0.2);
    const sm = sampleAt(T, r.s);
    r.pos.copy(sm.p).addScaledVector(sm.b, r.lateral).addScaledVector(sm.n, RIDE);
    r.hintS = r.s;
    r.yaw = angLerp(r.yaw, Math.atan2(sm.t.x, sm.t.z) + steerIn * 0.35, 1 - Math.exp(-8 * dt));
    r.pitch = damp(r.pitch, Math.asin(clamp(sm.t.y, -1, 1)), 8, dt);
    r.roll = damp(r.roll, -sm.bank - steerIn * 0.25, 6, dt);
    r.vel.set(sm.t.x * r.speed, sm.t.y * r.speed, sm.t.z * r.speed);
  } else {
    const fwd = tmpF.set(Math.sin(r.yaw), 0, Math.cos(r.yaw));
    r.vel.y -= 28 * dt;
    r.vel.x = damp(r.vel.x, fwd.x * r.speed, 2, dt);
    r.vel.z = damp(r.vel.z, fwd.z * r.speed, 2, dt);
    r.pos.addScaledVector(r.vel, dt);
    const pr = project(T, r.pos, r.hintS);
    r.hintS = r.s = pr.s; r.lateral = pr.lateral;
    const rideY = pr.p.y + pr.n.y * RIDE;
    if (pr.onRoad && r.pos.y <= rideY + 0.4) {
      r.onGround = true;
      r.pos.copy(pr.p).addScaledVector(pr.b, clamp(pr.lateral, -pr.w * 0.5 + 0.2, pr.w * 0.5 - 0.2)).addScaledVector(pr.n, RIDE);
    } else r.airT += dt;
  }
  if (r.pos.y < -6) {
    const sm = sampleAt(T, r.s);
    r.pos.copy(sm.p).addScaledVector(sm.n, RIDE); r.speed *= 0.5; r.vel.set(0, 0, 0);
    r.yaw = Math.atan2(sm.t.x, sm.t.z); r.onGround = true;
  }
  const ds = deltaS(prevS, r.s, len);
  if (ds > -40 && ds < 80) {
    if (r.s > len * 0.4 && r.s < len * 0.7) r.ck = 1;
    if (r.ck && prevS > len * 0.7 && r.s < len * 0.25) {
      r.ck = 0; r.lap++;
      if (r.isPlayer) { SFX.ding(); showMsg('LAP ' + Math.min(r.lap + 1, LAPS) + '/' + LAPS, '', 1.2); }
      if (r.lap >= LAPS) { r.finished = true; r.finishT = G.modeT; if (r.isPlayer) finishReach(); }
    }
  }
  for (const p of T.pads) {
    if (Math.abs(deltaS(r.s, p.s, len)) < 2 && r.onGround) {
      if (!r._pad || r._pad !== p) { r.boost = Math.min(100, r.boost + 35); r.speed = Math.max(r.speed, 70); if (r.isPlayer) SFX.boost(); r._pad = p; }
    } else if (r._pad === p) r._pad = null;
  }
  poseRacer(r);
}
function collideRacers() {
  for (let i = 0; i < G.racers.length; i++) for (let j = i + 1; j < G.racers.length; j++) {
    const a = G.racers[i], b = G.racers[j];
    const d = a.pos.distanceTo(b.pos);
    if (d < 1.6 && d > 1e-4) {
      const n = tmpV.subVectors(a.pos, b.pos).normalize();
      const push = (1.6 - d) * 0.5;
      a.pos.addScaledVector(n, push); b.pos.addScaledVector(n, -push);
      const rel = a.speed - b.speed;
      a.speed -= rel * 0.2; b.speed += rel * 0.2;
    }
  }
}
function rankRacers() {
  const T = reachW.track;
  const arr = G.racers.map(r => ({ r, k: r.lap * T.length + r.s }));
  arr.sort((a, b) => b.k - a.k);
  arr.forEach((o, i) => { o.r.place = i + 1; });
}
function updateAI(r, dt) {
  if (r.isPlayer || r.finished) return;
  const T = reachW.track;
  const look = sampleAt(T, wrapDist(r.s + 10, T.length));
  const wantYaw = Math.atan2(look.t.x, look.t.z);
  let err = wantYaw - r.yaw; while (err > Math.PI) err -= Math.PI * 2; while (err < -Math.PI) err += Math.PI * 2;
  const wantLat = r.skill > 0.8 ? 0 : (r.skill * 3 - 1.5);
  err += clamp(r.lateral - wantLat, -3, 3) * 0.08;
  r.steer = clamp(err * 1.4, -1, 1);
  r.accel = 1; r.brake = Math.abs(err) > 0.8 ? 0.3 : 0;
  r.wantBoost = r.boost > 40 && Math.abs(err) < 0.35 && Math.random() < 0.02;
}
function finishReach() {
  if (G._reachDone) return; G._reachDone = true;
  const bonus = Math.max(2000, 12000 - Math.floor(G.modeT * 80)) + (4 - (player.place || 4)) * 2500;
  showMsg(ordinal(player.place).toUpperCase(), '+' + bonus, 1.8); SFX.win();
  setTimeout(() => leavePortal(true, bonus), CAPTURE ? 400 : 1600);
}
function ordinal(n) { const k = n % 10, e = n % 100; if (e !== 11 && k === 1) return n + 'st'; if (e !== 12 && k === 2) return n + 'nd'; if (e !== 13 && k === 3) return n + 'rd'; return n + 'th'; }

const warpScene = new THREE.Scene(), warpCam = new THREE.PerspectiveCamera(70, 16 / 9, 0.08, 400);
const tunnelMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, toneMapped: false, fog: false,
  uniforms: { time: { value: 0 }, colA: { value: new THREE.Color(0x2a20e0) }, colB: { value: new THREE.Color(0x9010d8) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform float time; uniform vec3 colA, colB; varying vec2 vUv;
    void main(){
      float around = vUv.x * 6.283185;
      float along = vUv.y;
      float swirl = around * 2.0 + along * 16.0 - time * 3.4;
      float arm = pow(abs(sin(swirl)), 2.2);
      float rib = pow(abs(sin(around * 9.0 + along * 3.0)), 12.0);
      float ring = pow(0.5 + 0.5 * sin(along * 36.0 - time * 7.0), 10.0);
      vec3 col = mix(colA, colB, 0.5 + 0.5 * sin(along * 7.0 + time));
      vec3 wall = col * 0.08;
      float lit = arm * 0.32 + rib * 0.4 + ring * 0.5;
      gl_FragColor = vec4(wall + col * lit, 1.0);
    }`,
});
const tunnelGeo = new THREE.CylinderGeometry(4.0, 6.2, 160, 48, 24, true);
tunnelGeo.rotateX(Math.PI / 2); tunnelGeo.translate(0, 0, -60);
const tunnel = new THREE.Mesh(tunnelGeo, tunnelMat); warpScene.add(tunnel);
const warpRings = [];
for (let i = 0; i < 16; i++) {
  const rm = new THREE.MeshBasicMaterial({ color: 0x7040ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4 - (i % 3) * 0.15, 0.05, 7, 28), rm);
  ring.position.z = -i * 8; warpScene.add(ring); warpRings.push(ring);
}
const SN = 360, sPos = new Float32Array(SN * 3);
for (let i = 0; i < SN; i++) { const a = Math.random() * 6.28, r = rnd(0.4, 3.8); sPos[i * 3] = Math.cos(a) * r; sPos[i * 3 + 1] = Math.sin(a) * r; sPos[i * 3 + 2] = rnd(-140, 10); }
const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
const warpStars = new THREE.Points(sGeo, new THREE.PointsMaterial({ size: 0.1, color: 0xc8b0ff, toneMapped: false, transparent: true, opacity: 0.9 }));
warpScene.add(warpStars);
const portalAperture = new THREE.Mesh(
  new THREE.CircleGeometry(2.8, 32),
  new THREE.MeshBasicMaterial({ color: 0x40e8ff, toneMapped: false, transparent: true, opacity: 0.85 })
);
portalAperture.position.z = -92; warpScene.add(portalAperture);
const apertureHalo = new THREE.Mesh(
  new THREE.PlaneGeometry(7, 7),
  additive(0x8060ff, 0.45, { map: Tex.dot(), side: THREE.DoubleSide })
);
apertureHalo.position.z = -91.5; warpScene.add(apertureHalo);
let warpT = 0, WARP_DUR = 1.55;
function enterPortal(dest) {
  if (G.mode === 'warp') return;
  G.warpFrom = G.mode; G.warpDest = dest; G.mode = 'warp'; G.modeT = 0; warpT = 0;
  SFX.warp(); flash(0.16); showMsg(dest === 'rift' ? 'THE RIFT' : dest === 'reach' ? 'THE REACH' : dest === 'reentry' ? 'RE-ENTRY' : 'THE TABLE', '', 1.2);
  bloom.strength = 0.32;
  if (dest === 'rift') { tunnelMat.uniforms.colA.value.set(0x1860e0); tunnelMat.uniforms.colB.value.set(0x20d0e8); portalAperture.material.color.set(0x40e8ff); }
  else if (dest === 'reach') { tunnelMat.uniforms.colA.value.set(0x7010d0); tunnelMat.uniforms.colB.value.set(0xe040c0); portalAperture.material.color.set(0xe040ff); }
  else if (dest === 'reentry') { tunnelMat.uniforms.colA.value.set(0x3a1a08); tunnelMat.uniforms.colB.value.set(0xff6a20); portalAperture.material.color.set(0xff8a20); }
  else { tunnelMat.uniforms.colA.value.set(0x2a20e0); tunnelMat.uniforms.colB.value.set(0x9010d8); portalAperture.material.color.set(0xc080ff); }
  warpCam.position.set(0, 0, 8); warpCam.lookAt(0, 0, -8);
}
function updateWarp(dt) {
  warpT += dt; tunnelMat.uniforms.time.value = warpT;
  const u = Math.min(1, warpT / WARP_DUR);
  const ease = u * u * (3 - 2 * u);
  const z = 8 + ( -96 - 8) * ease;
  warpCam.position.set(Math.sin(warpT * 1.4) * 0.28, Math.cos(warpT * 1.05) * 0.16, z);
  warpCam.lookAt(Math.sin(warpT * 0.7) * 0.15, 0, z - 14);
  warpCam.rotation.z = Math.sin(warpT * 0.85) * 0.22;
  const endScale = 0.7 + ease * 2.4;
  portalAperture.scale.setScalar(endScale);
  apertureHalo.scale.setScalar(endScale);
  apertureHalo.material.opacity = 0.3 + ease * 0.5;
  for (const r of warpRings) {
    r.position.z += dt * 42;
    if (r.position.z > warpCam.position.z + 5) r.position.z -= 16 * 8;
    r.rotation.z += dt * 1.4;
    r.material.color.copy(tunnelMat.uniforms.colA.value);
  }
  const arr = sGeo.attributes.position.array;
  for (let i = 0; i < SN; i++) {
    arr[i * 3 + 2] += dt * 55;
    if (arr[i * 3 + 2] > warpCam.position.z + 8) arr[i * 3 + 2] -= 150;
  }
  sGeo.attributes.position.needsUpdate = true;
  if (warpT >= WARP_DUR) arrive(G.warpDest);
}
function showWorld(name) {
  table.root.visible = name === 'table';
  table.space.visible = name === 'table';
  riftW.group.visible = name === 'rift';
  reachW.group.visible = name === 'reach';
  reentryW.group.visible = name === 'reentry';
  document.body.classList.toggle('mode-pinball', name === 'table');
  document.body.classList.toggle('mode-rift', name === 'rift');
  document.body.classList.toggle('mode-reach', name === 'reach');
  document.body.classList.toggle('mode-reentry', name === 'reentry');
  if (name === 'table') { renderer.toneMappingExposure = 1.0; bloom.strength = 0.52; scene.fog = null; }
  else if (name === 'rift') { renderer.toneMappingExposure = riftW.look.exposure; bloom.strength = riftW.look.bloom; scene.fog = new THREE.FogExp2(riftW.look.fog.color, riftW.look.fog.density); }
  else if (name === 'reach') { renderer.toneMappingExposure = reachW.look.exposure; bloom.strength = reachW.look.bloom; scene.fog = new THREE.FogExp2(reachW.look.fog.color, reachW.look.fog.density); }
  else if (name === 'reentry') { renderer.toneMappingExposure = reentryW.look.exposure; bloom.strength = reentryW.look.bloom; scene.fog = new THREE.FogExp2(reentryW.look.fog.color, reentryW.look.fog.density); }
}
function arrive(dest) {
  if (dest === 'rift') {
    clearRift(); showWorld('rift'); G.mode = 'rift'; G.modeT = 0;
    G.riftKills = 0; G.riftWaves = 0; G.riftGoal = false; riftW.exit.visible = false; G.spawnT = 0.6;
    resetHeroRift(); ModeMusic.set('audio/rift');
    showMsg('THE RIFT', 'THROW THE BLADE · CLEAR THE ISLES', 2.2);
    for (let i = 0; i < 3; i++) makeEnemy(pick(['wisp', 'crawler', 'bird']), riftW.spawnPos());
  } else if (dest === 'reach') {
    showWorld('reach'); G.mode = 'reach'; G.modeT = 0; G.countdown = 3; G._reachDone = false;
    spawnField(); ModeMusic.set('audio/reach');
    showMsg('THE REACH', 'HOLD W TO ACCEL  ·  A / D STEER', 1.8);
  } else if (dest === 'reentry') {
    startReentry();
  } else {
    clearRift(); clearRacers(); endReentry();
    showWorld('table'); G.mode = 'pinball'; G.modeT = 0; G.portalGrace = 1.5;
    setHeroMode('ball'); resetBallToPlunger(); ModeMusic.set('audio/pinball');
    if (G.warpFrom === 'rift') { table.setPortalLit('rift', false); G.riftLitNeed = G.riftHits + 3; G.demoWant = 'reach'; }
    if (G.warpFrom === 'reach') { table.setPortalLit('reach', false); G.reachLitNeed = G.reachHits + 3; G.demoWant = 'reentry'; }
    if (G.warpFrom === 'reentry') { table.setPortalLit('reentry', false); G.reentryLitNeed = (G.reentryHits || 0) + 2; G.demoWant = 'done'; }
    showMsg('BACK TO THE TABLE', G.lastBonus ? '+' + G.lastBonus : '', 1.8);
  }
  G.modeT = 0;
}
function startReentry() {
  showWorld('reentry');
  G.mode = 'reentry'; G.modeT = 0; G._reentryDone = false;
  reentryW.reset();
  input.mx = input.my = 0; input.boost = false;
  setHeroMode('ball');
  reentryW.cap.dock.add(H.root);
  const off = reentryW.rowlexOffset();
  H.root.position.set(off.x, off.y, off.z);
  H.root.rotation.set(0, 0, 0);
  H.root.scale.setScalar(off.s);
  ModeMusic.set('audio/reentry');
  SFX.undock(); SFX.callout('RE-ENTRY');
  showMsg('RE-ENTRY', 'UNDOCKING  ·  HOLD THE CORRIDOR', 2.4);
}
function endReentry() {
  H.root.scale.setScalar(1);
  if (H.root.parent !== scene) scene.add(H.root);
}
function updateReentry(dt) {
  const stick = touch.stickId != null;
  const pitch = ((keys.KeyS || keys.ArrowDown || touch.pitchDown) ? -1 : 0)
    + ((keys.KeyW || keys.ArrowUp || touch.pitchUp) ? 1 : 0)
    + (stick && input.my < -0.25 ? -1 : stick && input.my > 0.25 ? 1 : 0);
  const bank = ((keys.KeyD || keys.ArrowRight || touch.bankR) ? 1 : 0)
    + ((keys.KeyA || keys.ArrowLeft || touch.bankL) ? -1 : 0)
    + (stick ? (input.mx || 0) : 0);
  const shield = !!(keys.ShiftLeft || keys.ShiftRight || keys.Space || keys.Plunge || input.boost || touch.shield);
  const ev = reentryW.update(dt, { pitch, bank, shield });
  const off = reentryW.rowlexOffset();
  if (H.root.parent !== reentryW.cap.dock) reentryW.cap.dock.add(H.root);
  H.root.position.set(off.x, off.y, off.z);
  H.root.scale.setScalar(off.s);
  poseRowlex(H, { t: G.t, sp: reentryW.flight.speed * 0.2 });
  if (ev && ev.event === 'undock') { SFX.undock(); showMsg('UNDOCK', 'ARRAYS FOLDING', 1.4); }
  if (ev && ev.event === 'reentry') { SFX.reentry(); showMsg('INTERFACE', 'W / S PITCH  ·  SHIFT SHIELD', 2.2); }
  if (ev && ev.event === 'shield') SFX.shield();
  if (ev && ev.event === 'chute') { SFX.chute(); showMsg('CHUTES', 'STEER TO THE PAD', 1.8); dmdSay('CHUTES', '', 1.8); }
  if (ev && ev.event === 'descent') { SFX.chute(); showMsg('FINAL DESCENT', 'WASD THRUST  ·  SHIFT BRAKE', 2.2); dmdSay('STEER TO PAD', '', 2.2); }
  if (ev && ev.event === 'touchdown') {
    SFX.touchdown(); SFX.callout(ev.grade || 'ON DECK');
    showMsg(ev.grade || 'ON DECK', '+' + ev.bonus + '  ·  ' + (ev.dist != null ? ev.dist.toFixed(1) + 'm' : ''), 2.4);
    dmdSay(ev.grade || 'ON DECK', '+' + ev.bonus, 2.2); flash(0.3);
  }
  if (ev && ev.event === 'hardland') { SFX.hardland(); SFX.callout('HARD LANDING'); showMsg('HARD LANDING', 'TOO FAST', 2.2); flash(0.5); G.shake = 0.8; }
  if (ev && ev.event === 'miss') { SFX.miss(); SFX.callout('MISSED'); showMsg('MISSED THE PAD', 'SPLASH', 2.2); flash(0.25); }
  if (ev && ev.event === 'splash') { SFX.splash(); showMsg('SPLASH', '', 2.0); }
  if (ev && ev.event === 'breakup') { SFX.breakup(); SFX.callout('BREAKUP'); showMsg('BREAKUP', 'HULL LOST', 2.2); flash(0.5); G.shake = 0.8; }
  if (ev && ev.event === 'skip') { SFX.skip(); SFX.callout('SKIPPED'); showMsg('SKIPPED', 'TOO SHALLOW', 2.2); }
  if (ev && ev.leave && !G._reentryDone) {
    G._reentryDone = true;
    leavePortal(!!ev.success, ev.bonus || 0);
  }
  // plasma rumble while in the fire
  if (reentryW.flight.phase === 'reentry' && reentryW.flight.heat > 40 && Math.random() < dt * 1.2) SFX.plasma();
  G.shake = Math.max(G.shake, (reentryW.flight.heat / 100) * 0.35);
}
function leavePortal(success, bonus) {
  if (G.mode !== 'rift' && G.mode !== 'reach' && G.mode !== 'reentry') return;
  G.lastBonus = bonus | 0; addScore(G.lastBonus);
  SFX.ding(); enterPortal('table');
}
function clearRift() {
  for (const e of G.enemies) scene.remove(e.P.root);
  for (const s of G.shots) scene.remove(s.m);
  G.enemies = []; G.shots = [];
}

const camState = { yaw: 0, pitch: 0.35, dist: 8.5, target: new THREE.Vector3(), curDist: 8.5 };
const camShake = new THREE.Vector3();

const SWEEP = [
  { t: 0.0, p: [0.35, 1.15, 2.15], l: [0.0, 1.05, 0.55] },
  { t: 1.8, p: [1.6, 1.8, 5.2], l: [0, 0.9, 0.4] },
  { t: 3.4, p: [-7.2, 4.8, 3.0], l: [-9.5, 1.2, -6] },
  { t: 5.0, p: [0.2, 6.8, -3.5], l: [0, 5.2, -17] },
  { t: 6.6, p: [8.0, 4.6, 2.2], l: [11, 2.0, -6] },
  { t: 8.2, p: [0, 8.8, 16.2], l: [0, 1.2, -6] },
];
function lerpSweep(t) {
  const Tmax = SWEEP[SWEEP.length - 1].t;
  const u = t;
  if (u >= Tmax) {
    const d = u - Tmax;
    const p = SWEEP[SWEEP.length - 1].p, l = SWEEP[SWEEP.length - 1].l;
    return { p: [p[0] + Math.sin(d * 0.3) * 1.2, p[1] + Math.sin(d * 0.2) * 0.4, p[2]], l: [l[0], l[1], l[2]] };
  }
  let a = SWEEP[0], b = SWEEP[SWEEP.length - 1];
  for (let i = 0; i < SWEEP.length - 1; i++) if (u >= SWEEP[i].t && u <= SWEEP[i + 1].t) { a = SWEEP[i]; b = SWEEP[i + 1]; }
  const k = (u - a.t) / Math.max(1e-4, b.t - a.t);
  const s = k * k * (3 - 2 * k);
  return {
    p: [lerp(a.p[0], b.p[0], s), lerp(a.p[1], b.p[1], s), lerp(a.p[2], b.p[2], s)],
    l: [lerp(a.l[0], b.l[0], s), lerp(a.l[1], b.l[1], s), lerp(a.l[2], b.l[2], s)],
  };
}

function updateCamera(dt) {
  G.shake = Math.max(0, G.shake - dt * 2.5);
  const sh = G.shake * (CAPTURE ? 0.6 : 1);
  camShake.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh * 0.5);
  if (G.mode === 'title') {
    const s = lerpSweep(G.titleT);
    camera.position.set(s.p[0], s.p[1], s.p[2]).add(camShake);
    camera.lookAt(s.l[0], s.l[1], s.l[2]);
    return;
  }
  if (G.mode === 'warp') return;
  if (G.mode === 'pinball') {
    let bx = ball.pos.x, bz = ball.pos.z;
    let bestZ = -999, nLive = 0, ax = 0, az = 0;
    for (const b of world.balls) {
      if (!b.live && !(b.inLane && !b.live && nLive === 0)) continue;
      if (b.live) { nLive++; ax += b.x; az += b.z; if (b.z > bestZ) { bestZ = b.z; bx = b.x; bz = b.z; } }
    }
    if (nLive > 1) { bx = (bx + ax / nLive) * 0.5; bz = (bz + az / nLive) * 0.5; }
    const px = clamp(bx * 0.16, -2.2, 2.2);
    const pz = clamp(bz * 0.1, -2, 1.5);
    const want = tmpV.set(px, 8.6 + Math.sin(G.t * 0.3) * 0.1, 15.8 + pz);
    camera.position.lerp(want, 1 - Math.exp(-3.2 * dt)).add(camShake);
    camera.lookAt(bx * 0.25, 1.1, bz * 0.35 - 5);
    return;
  }
  if (G.mode === 'rift') {
    camState.target.copy(hero.pos).setY(hero.pos.y + 0.6);
    const dist = damp(camState.curDist, camState.dist, 4, dt); camState.curDist = dist;
    const off = tmpV.set(Math.sin(camState.yaw) * dist, dist * 0.28 + Math.sin(camState.pitch) * 5, Math.cos(camState.yaw) * dist);
    off.y += camState.pitch * 4;
    camera.position.copy(camState.target).add(off).add(camShake);
    camera.lookAt(camState.target);
    return;
  }
  if (G.mode === 'reentry') {
    reentryW.applyCamera(camera, camShake, dt);
    camera.position.add(camShake);
    return;
  }
  if (G.mode === 'reentry') {
    const f = reentryW.flight;
    $('modeTag').textContent = 'RE-ENTRY';
    const landing = f.phase === 'descent' || f.phase === 'touchdown' || f.phase === 'hardland' || f.phase === 'miss';
    $('modeSub').textContent = f.phase === 'dock' ? 'IN ORBIT' : f.phase === 'undock' ? 'UNDOCKING' : f.phase === 'descent' ? 'FINAL DESCENT' : f.phase === 'touchdown' ? (f.grade || 'TOUCHDOWN') : f.phase === 'hardland' ? 'HARD LANDING' : f.phase === 'miss' ? 'MISSED' : f.phase === 'breakup' ? 'BREAKUP' : f.phase === 'skip' ? 'SKIPPED' : 'INTERFACE';
    if (landing) {
      $('objText').textContent = 'PAD  ' + (f.dist || 0).toFixed(1) + 'm  ·  H ' + (f.hSpeed || 0).toFixed(1) + '  ·  V ' + (f.vSpeed || 0).toFixed(1);
      if ($('corr')) {
        const ok = (f.dist || 99) <= 8.2 && (f.vSpeed || 99) <= 5.15;
        $('corr').textContent = 'TARGET  ' + (f.dist || 0).toFixed(1) + 'm  ·  V ' + (f.vSpeed || 0).toFixed(1);
        $('corr').className = ok ? 'ok' : 'bad';
      }
      $('speedo').innerHTML = Math.round((f.vSpeed || 0) * 10) / 10 + ' <span>V SPD</span>';
    } else {
      $('objText').textContent = 'ALT ' + f.alt.toFixed(0) + '  ·  PITCH ' + f.pitch.toFixed(1) + '°  ·  HOLD ' + (-14) + ' TO ' + (-7) + '°';
      if ($('corr')) { $('corr').textContent = f.inCorridor ? 'CORRIDOR  LOCK' : (f.pitch < -14.5 ? 'TOO STEEP' : 'TOO SHALLOW'); $('corr').className = f.inCorridor ? 'ok' : 'bad'; }
      $('speedo').innerHTML = Math.round(f.speed) + ' <span>KM/S ×10</span>';
    }
    if ($('heat')) $('heat').style.width = (f.heat).toFixed(0) + '%';
    if ($('hull')) $('hull').style.width = Math.max(0, f.hull).toFixed(0) + '%';
  }
  if (G.mode === 'reach' && player) {
    const back = tmpV.set(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const want = tmpV2.copy(player.pos).addScaledVector(back, 7.2).add(tmpV3.set(0, 2.8, 0));
    camera.position.lerp(want, 1 - Math.exp(-5 * dt)).add(camShake);
    camera.lookAt(player.pos.x + Math.sin(player.yaw) * 8, player.pos.y + 0.4, player.pos.z + Math.cos(player.yaw) * 8);
  }
}

const keys = { FlipL: false, FlipR: false, Plunge: false };
const input = { mx: 0, my: 0, jump: false, roll: false, throw: false, accel: 0, brake: 0, steer: 0, boost: false };
const touch = { flipL: false, flipR: false, plunge: false, pitchUp: false, pitchDown: false, bankL: false, bankR: false, shield: false, stickId: null, sx: 0, sy: 0, vx: 0, vy: 0 };
let titleArmed = false;

function anyStartInput() {
  if (G.mode === 'title') { titleInput(); return true; }
  if ((G.mode === 'win' || G.mode === 'over') && G.endT > 1.2) { toTitle(); return true; }
  return false;
}
function isFlipL(c) { return c === 'KeyZ' || c === 'ArrowLeft' || c === 'ShiftLeft'; }
function isFlipRKey(c) { return c === 'Slash' || c === 'ArrowRight' || c === 'ShiftRight' || c === 'Period' || c === 'KeyX'; }

addEventListener('keydown', e => {
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (e.repeat) return;
  if (anyStartInput()) return;
  if (isFlipL(e.code)) keys.FlipL = true;
  if (isFlipRKey(e.code)) keys.FlipR = true;
  if (e.code === 'Space' || e.code === 'ArrowDown') { keys.Plunge = true; if (G.mode === 'rift') input.jump = true; e.preventDefault(); }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') { if (G.mode === 'rift') input.roll = true; if (G.mode === 'reach') input.boost = true; }
  if (e.code === 'KeyF' || e.code === 'KeyJ' || e.code === 'Enter') input.throw = true;
  if (G.mode === 'pinball' && (e.code === 'KeyQ' || e.code === 'KeyE' || e.code === 'KeyW' || e.code === 'ControlLeft')) {
    const dx = e.code === 'KeyQ' ? -90 : e.code === 'KeyE' ? 90 : 0;
    const dz = (e.code === 'KeyW' || e.code === 'ControlLeft') ? -80 : 0;
    const r = world.nudge(dx, dz);
    if (r === 'ok') SFX.nudge();
  }
  keys[e.code] = true;
});
addEventListener('keyup', e => {
  if (isFlipL(e.code)) keys.FlipL = false;
  if (isFlipRKey(e.code)) keys.FlipR = false;
  if (e.code === 'Space' || e.code === 'ArrowDown') keys.Plunge = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyC') input.boost = false;
  keys[e.code] = false;
});
canvas.addEventListener('mousedown', e => {
  if (anyStartInput()) return;
  if (G.mode === 'rift' || G.mode === 'reach') { input.throw = true; if (G.mode === 'rift') lockPointer(); }
});
function lockPointer() { if (TOUCH || DEMO || !canvas.requestPointerLock) return; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
addEventListener('mousemove', e => {
  if (G.mode !== 'rift' || document.pointerLockElement !== canvas) return;
  camState.yaw -= e.movementX * 0.0025; camState.pitch = clamp(camState.pitch + e.movementY * 0.002, -0.45, 1.1);
});
function onPtrDown(e) {
  if (anyStartInput()) return;
  if (G.mode === 'pinball') {
    if (e.clientX < innerWidth * 0.5) touch.flipL = true; else touch.flipR = true;
  } else if (G.mode === 'rift' || G.mode === 'reach') {
    if (e.clientX < innerWidth * 0.45) { touch.stickId = e.pointerId; touch.sx = e.clientX; touch.sy = e.clientY; $('stick').style.display = 'block'; placeStick(e.clientX, e.clientY); }
  }
}
function onPtrMove(e) {
  if (touch.stickId === e.pointerId) {
    const dx = e.clientX - touch.sx, dy = e.clientY - touch.sy;
    const m = Math.hypot(dx, dy), r = 50, k = m > r ? r / m : 1;
    touch.vx = dx * k / r; touch.vy = dy * k / r;
    $('knob').style.left = (35 + dx * k) + 'px'; $('knob').style.top = (35 + dy * k) + 'px';
  }
}
function onPtrUp(e) {
  if (touch.stickId === e.pointerId) { touch.stickId = null; touch.vx = touch.vy = 0; $('stick').style.display = 'none'; }
  touch.flipL = touch.flipR = false;
}
function placeStick(x, y) { $('stick').style.left = (x - 60) + 'px'; $('stick').style.top = (y - 60) + 'px'; $('knob').style.left = '35px'; $('knob').style.top = '35px'; }
addEventListener('pointerdown', onPtrDown);
addEventListener('pointermove', onPtrMove);
addEventListener('pointerup', onPtrUp);
addEventListener('pointercancel', onPtrUp);
function bindBtn(id, down, up) {
  const el = $(id); if (!el) return;
  el.addEventListener('pointerdown', e => { e.stopPropagation(); down(); });
  el.addEventListener('pointerup', e => { e.stopPropagation(); if (up) up(); });
  el.addEventListener('pointerleave', e => { if (up) up(); });
}
bindBtn('bDisc', () => input.throw = true);
bindBtn('bJump', () => input.jump = true);
bindBtn('bRoll', () => input.roll = true);
bindBtn('bAccel', () => input.accel = 1, () => input.accel = 0);
bindBtn('bBrake', () => input.brake = 1, () => input.brake = 0);
bindBtn('bBoost', () => input.boost = true, () => input.boost = false);
bindBtn('bPitchUp', () => touch.pitchUp = true, () => touch.pitchUp = false);
bindBtn('bPitchDown', () => touch.pitchDown = true, () => touch.pitchDown = false);
bindBtn('bBankL', () => touch.bankL = true, () => touch.bankL = false);
bindBtn('bBankR', () => touch.bankR = true, () => touch.bankR = false);
bindBtn('bShield', () => touch.shield = true, () => touch.shield = false);
bindBtn('bPlunge', () => { touch.plunge = true; }, () => { touch.plunge = false; });
if (TOUCH) document.body.classList.add('touch');

function toggleMute() { const m = Snd.toggleMute(); $('mute').innerHTML = m ? '&#128263;' : '&#128266;'; ModeMusic.sync(); }
$('mute').addEventListener('click', e => { e.stopPropagation(); toggleMute(); });

function readMove() {
  if (G.mode !== 'rift' && G.mode !== 'reach') { input.mx = 0; input.my = 0; }
  if (G.mode === 'rift') {
    let mx = 0, my = 0;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyW || keys.ArrowUp) my += 1;
    if (keys.KeyS || keys.ArrowDown) my -= 1;
    if (touch.stickId != null) { mx += touch.vx; my -= touch.vy; }
    input.mx = clamp(mx, -1, 1); input.my = clamp(my, -1, 1);
  }
  if (G.mode === 'reach' && player) {
    let st = 0, ac = 0, br = 0;
    if (keys.KeyA || keys.ArrowLeft) st -= 1;
    if (keys.KeyD || keys.ArrowRight) st += 1;
    if (keys.KeyW || keys.ArrowUp) ac = 1;
    if (keys.KeyS || keys.ArrowDown) br = 1;
    if (touch.stickId != null) { st += touch.vx; if (touch.vy < -0.3) ac = 1; if (touch.vy > 0.3) br = 1; }
    ac = Math.max(ac, input.accel); br = Math.max(br, input.brake);
    player.steer = clamp(st, -1, 1); player.accel = ac; player.brake = br; player.wantBoost = input.boost;
  }
}

function titleInput() {
  if (!titleArmed) { titleArmed = true; Snd.onTitle = true; Snd.init(); $('prompt').textContent = 'PRESS AGAIN TO START'; return; }
  startGame();
}
function startGame() {
  G.mode = 'pinball'; G.t = 0; G.modeT = 0; G.score = 0; G.balls = 3; G.hits = 0; G.riftHits = 0; G.reachHits = 0;
  G.endT = 0; G.combo = 0; table.setScore(0); G.demoWant = 'rift'; G.riftLitNeed = 3; G.reachLitNeed = 3; G.portalGrace = 0;
  G.multiball = false; G.jackpot = 5000; G.locks = 0; G.dmdCall = ''; G.dmdCallT = 0; G.rowlex = '';
  table.setPortalLit('rift', false); table.setPortalLit('reach', false); table.setPortalLit('reentry', false);
  G.reentryHits = 0; G.reentryLitNeed = 2;
  for (const t of table.targets) { t.down = false; t.group.visible = true; }
  if (table.layout) {
    for (const s of table.layout.standups) { s.lit = false; s.down = false; }
    for (const d of table.layout.drops) d.down = false;
    for (const r of table.layout.rollovers) r.lit = false;
    if (table.layout.kickback) table.layout.kickback.lit = true;
  }
  world.clearExtraBalls();
  world.resetBall(world.primary(), table.layout.plunger.x, table.layout.plunger.z, { live: false, inLane: true });
  world.tilted = false; world.tiltMeter = 0; world.diverter = 0; world.magnetOn = false;
  if (table.feat && table.feat.magnet) table.feat.magnet.on = false;
  extraBalls.forEach((E) => { E.root.visible = false; });
  document.body.classList.add('playing'); $('end').style.display = 'none';
  Snd.onTitle = false; SFX.start(); ModeMusic.set('audio/pinball'); ModeMusic.sync();
  showWorld('table');
  G.sub = 'curl';
  H.root.position.set(0, 1.05, 1.2);
  H.root.rotation.set(0, 0, 0); H.shell.rotation.set(0, 0, 0);
  setHeroMode('walk');
  showMsg('ROWLEX', 'CHAINED TO THE TABLE', 1.6);
  AP.reset();
}
function ballLost() {
  world.tilted = false;
  G.multiball = false;
  world.magnetOn = false;
  if (table.feat && table.feat.magnet) table.feat.magnet.on = false;
  world.clearExtraBalls();
  extraBalls.forEach((E) => { E.root.visible = false; });
  if (DEMO) {
    resetBallToPlunger();
    G.sub = 'plunge';
    showMsg('BALL SAVED', 'DEMONSTRATION', 1.2);
    return;
  }
  SFX.drain(); G.balls--; G.shake = Math.max(G.shake, 0.3);
  showMsg(G.balls > 0 ? 'BALL LOST' : 'DRAINED', G.balls > 0 ? (G.balls + ' LEFT') : '', 1.5);
  if (G.balls <= 0) { endGame(false); return; }
  resetBallToPlunger(); G.sub = 'plunge';
}
function endGame(win) {
  if (G.mode === 'win' || G.mode === 'over') return;
  G.mode = win ? 'win' : 'over'; G.endT = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  $('endTitle').textContent = win ? 'THE TABLE HOLDS' : 'TILTED OUT OF TIME';
  $('endText').textContent = 'SCORE  ' + G.score.toLocaleString('en-US');
  $('end').style.display = 'flex'; if (win) SFX.win();
}
function toTitle() {
  clearRift(); clearRacers();
  G.mode = 'title'; G.titleT = 0; G.demoStarted = false; G.demoPhase = 'sweep';
  document.body.classList.remove('playing'); $('end').style.display = 'none';
  showWorld('table'); setHeroMode('walk');
  H.root.position.set(0, 1.05, 1.2); H.root.rotation.set(0, 0, 0); H.shell.rotation.set(0, 0, 0);
  poseRowlex(H, { t: 0, sp: 0 });
  Snd.onTitle = true; if (Snd.unlocked) Snd.playTitle();
  $('prompt').textContent = titleArmed ? 'PRESS AGAIN TO START' : 'TAP OR PRESS ANY KEY';
  ModeMusic.sync();
}

const AP = {
  throwWait: 0, _steer: 0, _accel: 1, _boost: false,
  reset() { this.throwWait = 0; },
  update(dt) {
    input.mx = input.my = 0; input.jump = input.roll = input.throw = false;
    input.accel = 0; input.brake = 0; input.boost = false;
    keys.FlipL = keys.FlipR = keys.Plunge = false;
    touch.plunge = false;
    if (G.mode === 'pinball') this.pinball(dt);
    else if (G.mode === 'rift') this.rift(dt);
    else if (G.mode === 'reach') this.reach(dt);
    else if (G.mode === 'reentry') this.reentry(dt);
  },
  reentry(dt) {
    const f = reentryW.flight;
    keys.KeyS = keys.KeyW = keys.KeyA = keys.KeyD = keys.ShiftLeft = false;
    if (f.phase === 'reentry') {
      const mid = -10.6;
      if (f.pitch > mid + 0.5) keys.KeyS = true;
      else if (f.pitch < mid - 0.5) keys.KeyW = true;
      keys.ShiftLeft = f.heat > 62 && f.shield > 0.3 && f.shieldT <= 0;
      return;
    }
    if (f.phase === 'descent') {
      if (f.lx > 0.6) keys.KeyA = true;
      else if (f.lx < -0.6) keys.KeyD = true;
      if (f.lz > 0.6) keys.KeyW = true;   // W thrusts -Z toward a +Z offset
      else if (f.lz < -0.6) keys.KeyS = true;
      keys.ShiftLeft = f.vy > 4.2 || (f.alt < 8 && f.vy > 2.8);
    }
  },
  pinball(dt) {
    if (G.sub === 'curl' || G.sub === 'toLane') return;
    const b0 = world.primary();
    if (G.sub === 'plunge' || (b0 && !b0.live && b0.inLane)) {
      if (G.modeT > 0.15) keys.Plunge = true;
      if (b0 && b0.charged > 0.72) keys.Plunge = false;
      return;
    }
    for (const b of world.balls) {
      if (!b.live) continue;
      if (b.z > 4.8 && b.z < 7.8 && b.vz > 0.4) {
        if (b.x < 0.55) keys.FlipL = true;
        if (b.x > -0.55) keys.FlipR = true;
      }
    }
    // Force-light portals on a schedule so a demo run still visits both worlds.
    if (G.demoWant === 'rift' && G.modeT > 5.5 && G.sub === 'play') table.setPortalLit('rift', true);
    if (G.demoWant === 'reach' && G.modeT > 2.8 && G.sub === 'play') table.setPortalLit('reach', true);
    if (G.sub === 'play' && G.demoWant === 'rift' && G.modeT > 9.2 && table.portalRift.lit) enterPortal('rift');
    if (G.sub === 'play' && G.demoWant === 'reach' && G.modeT > 6.0 && table.portalReach.lit) enterPortal('reach');
  },
  rift(dt) {
    this.throwWait -= dt;
    const lock = findLock();
    if (lock && hero.disc.state === 'held' && this.throwWait <= 0 && lock.pos.distanceTo(hero.pos) < 24) {
      input.throw = true; this.throwWait = 0.35;
    }
    let goal = null;
    if (G.riftGoal && riftW.exit.visible) goal = riftW.exitPos;
    else if (G.enemies.length) {
      let near = null, nd = 1e9;
      for (const e of G.enemies) { const d = e.pos.distanceTo(hero.pos); if (d < nd) { nd = d; near = e; } }
      if (near) {
        const to = tmpV.subVectors(near.pos, hero.pos).setY(0); const d = to.length(); to.normalize();
        goal = tmpV2.copy(hero.pos).addScaledVector(to, clamp(d - 6, -4, 8));
        goal.y = near.pos.y;
      }
    }
    if (goal) {
      const want = tmpV.subVectors(goal, hero.pos).setY(0);
      const flat = want.length();
      if (flat > 0.4) {
        want.normalize();
        const f = camForwardXZ(tmpV3), r = tmpV2.set(-f.z, 0, f.x);
        input.my = want.dot(f); input.mx = want.dot(r);
      }
      if (flat > 3 && hero.onGround && Math.abs((goal.y || hero.pos.y) - hero.pos.y) > 0.6) input.jump = true;
      if (G.riftGoal && flat < 3.2 && hero.onGround) input.jump = true;
    }
    if (DEMO && G.modeT > 6.5 && !G.riftGoal) openRiftExit();
    if (DEMO && G.riftGoal && G.modeT > 7) {
      const s = riftW.exitPos;
      const k = 1 - Math.exp(-dt * 2.4);
      hero.pos.x += (s.x - hero.pos.x) * k * 0.55;
      hero.pos.z += (s.z - hero.pos.z) * k * 0.55;
    }
    if (DEMO && G.modeT > 10.2 && G.mode === 'rift') leavePortal(true, 8000 + G.riftKills * 400);
  },
  reach(dt) {
    if (!player) return;
    const T = reachW.track;
    const look = sampleAt(T, wrapDist(player.s + 14, T.length));
    const wantYaw = Math.atan2(look.t.x, look.t.z);
    let err = wantYaw - player.yaw; while (err > Math.PI) err -= Math.PI * 2; while (err < -Math.PI) err += Math.PI * 2;
    err += clamp(player.lateral, -3, 3) * 0.1;
    this._steer = clamp(err * 1.6, -1, 1);
    this._accel = 1;
    this._boost = player.boost > 30 && Math.abs(err) < 0.4;
    this.throwWait -= dt;
    let tgt = null, bd = 20;
    for (const r of G.racers) {
      if (r.isPlayer || r.finished) continue;
      const d = deltaS(player.s, r.s, T.length);
      if (d > 0 && d < bd) { bd = d; tgt = r; }
    }
    if (tgt && hero.disc.state === 'held' && this.throwWait <= 0 && player.pos.distanceTo(tgt.pos) < 18) {
      input.throw = true; this.throwWait = 1.1;
    }
  }
};

function updateHud(dt) {
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) { $('msg').style.opacity = 0; $('sub').style.opacity = 0; } }
  flashA = Math.max(0, flashA - dt * 2.2); $('flash').style.opacity = flashA;
  const countEl = $('count');
  if (countEl) {
    if (G.mode === 'reach' && (G.countdown > 0 || G.modeT < 3.7)) {
      if (G.countdown > 0) {
        countEl.textContent = String(Math.max(1, Math.ceil(G.countdown)));
        countEl.style.opacity = '1';
      } else {
        countEl.textContent = 'GO!';
        countEl.style.opacity = String(clamp(1 - (G.modeT - 3) / 0.6, 0, 1));
      }
    } else {
      countEl.style.opacity = '0';
    }
  }
  hurtA = Math.max(0, hurtA - dt * 2.5); $('hurt').style.opacity = String(hurtA);
  $('score').textContent = 'SCORE  ' + (G.score | 0).toLocaleString('en-US');
  $('balls').textContent = 'BALLS  ' + Math.max(0, G.balls);
  $('hp').style.width = clamp(hero.hp / hero.maxHp, 0, 1) * 100 + '%';
  $('stRift').className = table.portalRift.lit ? 'lit' : '';
  $('stReach').className = table.portalReach.lit ? 'lit reach' : '';
  if ($('stReentry')) {
    $('stReentry').className = table.portalReentry && table.portalReentry.lit ? 'lit reentry' : '';
    $('stReentry').textContent = table.portalReentry && table.portalReentry.lit ? 'RE-ENTRY LIT' : 'RE-ENTRY';
  }
  $('stRift').textContent = table.portalRift.lit ? 'RIFT LIT' : 'RIFT';
  $('stReach').textContent = table.portalReach.lit ? 'REACH LIT' : 'REACH';
  if (G.mode === 'pinball') {
    $('modeTag').textContent = G.multiball ? 'MULTIBALL' : 'PINBALL';
    $('modeSub').textContent = world.tilted ? 'TILT' : (world.primary() && world.primary().saveT > 0 ? ('BALL SAVE ' + world.primary().saveT.toFixed(1)) : 'THE TABLE');
    const letters = (table.layout.standups || []).map((s) => s.lit ? s.letter : '·').join('');
    $('objText').textContent = G.multiball ? ('JACKPOT  ' + G.jackpot) : ('SPELL ROWLEX  ' + letters + '   ·   LIGHT THE PORTALS');
  }
  if (G.mode === 'rift') { $('modeTag').textContent = 'THE RIFT'; $('modeSub').textContent = 'FLOATING ISLES'; $('objText').textContent = G.riftGoal ? 'ENTER THE EXIT RIFT' : ('CLEAR THE STORM  ·  ' + G.riftKills + '/8'); }
  if (G.mode === 'reach' && player) {
    $('modeTag').textContent = 'THE REACH'; $('modeSub').textContent = 'NEON GRID';
    $('speedo').innerHTML = String(Math.round(player.speed * 4.2)).padStart(3, '0') + ' <span>KM/H</span>';
    $('boost').style.width = clamp(player.boost, 0, 100) + '%';
    $('objText').textContent = 'LAP ' + Math.min(player.lap + 1, LAPS) + '/' + LAPS + '  ·  ' + ordinal(player.place).toUpperCase();
    $('discSlot').textContent = hero.disc.state === 'held' ? 'DISC  READY' : 'DISC  OUT';
  }
  if (G.mode === 'rift') $('discSlot').textContent = hero.disc.state === 'held' ? 'DISC  READY' : 'DISC  OUT';
}

function updateTitle(dt) {
  G.titleT += dt;
  H.root.position.set(0, 1.05, 1.2);
  H.root.rotation.y = Math.sin(G.titleT * 0.35) * 0.25;
  setHeroMode('walk');
  poseRowlex(H, { t: G.titleT, sp: 0 });
  table.update(G.titleT, dt);
  if (CAPTURE) {
    const fade = G.titleT < 2.15 ? 1 : Math.max(0, 1 - (G.titleT - 2.15) / 0.75);
    const tel = $('title'); if (tel) tel.style.opacity = String(fade);
  }
  if (DEMO && G.titleT > 8.4 && !G.demoStarted) { G.demoStarted = true; if (!titleArmed) { titleArmed = true; Snd.init(); } startGame(); }
}

function update(dt) {
  G.t += dt; G.modeT += dt;
  if (G.portalGrace) G.portalGrace = Math.max(0, G.portalGrace - dt);
  if (G.mode === 'title') { updateTitle(dt); updateParticles(dt); updateDebris(dt); updateRings(dt); updateCamera(dt); return; }
  if (G.mode === 'win' || G.mode === 'over') { G.endT += dt; table.update(G.t, dt); updateParticles(dt); updateDebris(dt); updateRings(dt); updateCamera(dt); if (DEMO && G.endT > 6 && !CAPTURE) toTitle(); return; }
  if (G.mode === 'warp') { updateWarp(dt); updateParticles(dt); updateCamera(dt); return; }

  if (DEMO) AP.update(dt);
  else readMove();

  if (G.mode === 'pinball') {
    if (G.sub === 'curl') {
      const k = clamp(G.modeT / 0.7, 0, 1);
      if (k > 0.45) setHeroMode('ball');
      else { setHeroMode('walk'); poseRowlex(H, { t: G.t, sp: 0 }); }
      H.root.position.set(0, lerp(1.05, BALL_R, Math.min(1, k * 1.3)), lerp(1.2, 1.0, k));
      H.root.rotation.x = k * 0.8;
      extraBalls.forEach((E) => { E.root.visible = false; });
      if (k >= 1) G.sub = 'toLane';
    } else if (G.sub === 'toLane') {
      setHeroMode('ball');
      const tgt = tmpV.set(6.57, BALL_R, 7.15);
      H.root.position.lerp(tgt, 1 - Math.exp(-dt * 3.2));
      H.shell.rotation.x += dt * 8;
      if (H.root.position.distanceTo(tgt) < 0.2) {
        resetBallToPlunger(); G.sub = 'plunge'; G.modeT = 0;
        showMsg('LAUNCH', 'HOLD SPACE / DOWN  ·  Q/E NUDGE', 1.6);
      }
    } else {
      const portal = stepPinball(dt);
      updatePortalLights();
      if (portal) enterPortal(portal);
    }
    table.update(G.t, dt);
    const pb = world.primary();
    poseRowlex(H, { t: G.t, sp: pb ? Math.hypot(pb.vx, pb.vz) : 0 });
  }

  if (G.mode === 'rift') {
    updateHeroRift(dt);
    updateEnemies(dt);
    updateRiftSpawner(dt);
    riftW.update(G.t, dt);
    input.jump = input.roll = input.throw = false;
  }

  if (G.mode === 'reentry') {
    updateReentry(dt);
  }

  if (G.mode === 'reach') {
    G.countdown = Math.max(0, (G.countdown || 0) - dt);
    if (DEMO && player) { player.steer = AP._steer; player.accel = AP._accel; player.wantBoost = AP._boost; player.brake = 0; }
    for (const r of G.racers) { if (!r.isPlayer) updateAI(r, dt); updateRacer(r, dt); }
    collideRacers(); rankRacers();
    if (player) { hero.pos.copy(player.pos); hero.yaw = player.yaw; hero.throwT -= dt; if (input.throw) throwDisc(); }
    updateDisc(dt);
    reachW.update(G.t, dt);
    input.throw = false;
    if (DEMO && G.modeT > 11.5 && player && !player.finished) { player.lap = LAPS; finishReach(); }
  }

  updateParticles(dt); updateDebris(dt); updateRings(dt); updateCamera(dt);
}

function render() {
  if (G.mode === 'warp') {
    if (useBloom) { renderPass.scene = warpScene; renderPass.camera = warpCam; composer.render(); }
    else renderer.render(warpScene, warpCam);
    renderPass.scene = scene; renderPass.camera = camera;
    return;
  }
  if (useBloom) composer.render();
  else renderer.render(scene, camera);
}

let lastT = performance.now(), acc = 0, perfN = 0, perfSum = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const rawDt = Math.min(0.5, Math.max(0, (now - lastT) / 1000)); let dt = Math.min(0.1, rawDt); lastT = now; acc += dt;
  const STEP_DT = 1 / 60; let n = 0;
  while (acc >= STEP_DT && n < 6) { update(STEP_DT); acc -= STEP_DT; n++; }
  if (n === 6) acc = 0;
  Snd.update(rawDt); ModeMusic.update(rawDt); updateHud(dt); updateFloats(dt); render();
  if (G.mode !== 'title') {
    perfSum += dt; perfN++;
    if (perfN >= 60) {
      const avg = perfSum / perfN; perfN = 0; perfSum = 0;
      if (avg > 1 / 36 && !Q.has('hifx')) { if (useBloom) useBloom = false; else if (pixelRatio > 0.6) { pixelRatio = Math.max(0.6, pixelRatio * 0.8); renderer.setPixelRatio(pixelRatio); resize(); } }
    }
  }
}

showWorld('table');
setHeroMode('walk');
H.root.position.set(0, 1.05, 1.2);
poseRowlex(H, { t: 0, sp: 0 });
camera.position.set(0, 8.8, 16.2); camera.lookAt(0, 1.2, -6);
table.update(0, 0.016);
renderer.compile(scene, camera);
renderer.compile(warpScene, warpCam);

if (DEMO) { titleArmed = true; try { Snd.init(); } catch (e) {} }
if (CAPTURE) document.body.classList.add('capture');

if (CAPTURE) {
  const capState = () => ({
    mode: G.mode, sub: G.sub, t: G.t, titleT: G.titleT, modeT: G.modeT, score: G.score, balls: G.balls,
    disc: hero.disc.state, hits: G.hits, riftLit: !!table.portalRift.lit, reachLit: !!table.portalReach.lit,
    enemies: G.enemies.map(e => e.type), place: player ? player.place : null, speed: player ? +player.speed.toFixed(1) : 0,
    bx: +ball.pos.x.toFixed(2), by: +ball.pos.y.toFixed(2), bz: +ball.pos.z.toFixed(2),
    returned: world.returned, liveBalls: world.balls.filter((b) => b.live).length,
    oob: world.balls.some((b) => world.outOfBounds(b)),
  });
  window.__cap = {
    step(n) { for (let i = 0; i < n; i++) update(1 / 60); updateHud(n / 60); updateFloats(n / 60); ModeMusic.update(n / 60); render(); return capState(); },
    sim(n) { for (let i = 0; i < n; i++) update(1 / 60); return capState(); },
  };
} else requestAnimationFrame(loop);

window.__dbg = {
  G, hero, ball, table, H, Snd, AP, camState, startGame, enterPortal, leavePortal, openRiftExit,
  world, BOUNDS, keys, input, resetBallToPlunger, startMultiball, reentryW, ModeMusic, get player() { return player; }, get titleArmed() { return titleArmed; },
};
