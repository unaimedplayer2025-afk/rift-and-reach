// Low-poly models. Rowlex matches the reference: dark-green armored sphere,
// gear-ringed red eye, amber side lights, nail-spikes, thin clawed arms, bird legs.
import * as THREE from 'three';
import { std, glow, additive, rimify, part, grp, pick, Tex, instanced } from './util.js';

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 16, 12),
  sphLo: new THREE.SphereGeometry(1, 10, 8),
  sphHi: new THREE.SphereGeometry(1, 22, 16),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone: new THREE.ConeGeometry(1, 1, 6),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  tor: new THREE.TorusGeometry(1, 0.2, 8, 20),
  torHi: new THREE.TorusGeometry(1, 0.18, 10, 28),
};
export { G as GEO };
const B = (p, m, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => part(p, G.box, m, x, y, z, rx, ry, rz, sx, sy, sz);
const S = (p, m, x, y, z, r, sy = 1, sz = 1) => part(p, G.sph, m, x, y, z, 0, 0, 0, r, r * sy, r * sz);
const C = (p, m, x, y, z, r, h, rx = 0, ry = 0, rz = 0, r2) => part(p, G.cyl, m, x, y, z, rx, ry, rz, r, h, r2 ?? r);
const K = (p, m, x, y, z, r, h, rx = 0, ry = 0, rz = 0, geo = G.cone) => part(p, geo, m, x, y, z, rx, ry, rz, r, h, r);

// ---------------------------------------------------------------- spiked disc (same Rygar-style chained blade)
export function buildDisc(scale = 1) {
  const g = new THREE.Group(), spin = grp(g);
  const red = glow(0xff2a1a, 2.6), metal = std(0x3a3a40, { metalness: 0.9, roughness: 0.3 }), steel = std(0xc8c8d0, { metalness: 1, roughness: 0.22 });
  part(spin, G.tor, red, 0, 0, 0, Math.PI / 2, 0, 0, 0.3, 0.3, 0.3);
  C(spin, metal, 0, 0, 0, 0.27, 0.05);
  C(spin, red, 0, 0.03, 0, 0.1, 0.03);
  part(spin, G.tor, steel, 0, 0, 0, Math.PI / 2, 0, 0, 0.17, 0.17, 0.12);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, s = K(spin, steel, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, 0.05, 0.22, 0, 0, 0, G.cone4);
    s.rotation.set(0, -a, -Math.PI / 2); s.rotateZ(0.5);
  }
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), additive(0xff2a1a, 0.55, { map: Tex.ring(), side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; spin.add(halo);
  g.scale.setScalar(scale); g.userData.spin = spin; g.userData.halo = halo;
  return g;
}

function clawHand(parent, mat, scale = 1) {
  const h = grp(parent);
  // palm
  S(h, mat, 0, 0, 0, 0.055 * scale, 0.7, 0.85);
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.45;
    const f = grp(h, Math.sin(a) * 0.04 * scale, 0, 0.04 * scale);
    C(f, mat, 0, 0, 0.06 * scale, 0.014 * scale, 0.11 * scale, Math.PI / 2);
    K(f, mat, 0, 0, 0.13 * scale, 0.016 * scale, 0.07 * scale, Math.PI / 2);
  }
  // thumb
  const th = grp(h, 0.05 * scale, 0, 0);
  C(th, mat, 0, 0, 0.04 * scale, 0.013 * scale, 0.08 * scale, Math.PI / 2, 0, 0.8);
  return h;
}

function birdFoot(parent, mat, scale = 1) {
  const f = grp(parent);
  S(f, mat, 0, 0, 0, 0.06 * scale, 0.6, 1.1);
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.5;
    const t = grp(f, Math.sin(a) * 0.06 * scale, -0.01, Math.cos(a) * 0.02 * scale + 0.05 * scale);
    C(t, mat, 0, 0, 0.07 * scale, 0.016 * scale, 0.14 * scale, Math.PI / 2);
    K(t, mat, 0, -0.01, 0.15 * scale, 0.02 * scale, 0.08 * scale, Math.PI / 2);
  }
  // rear claw
  const back = grp(f, 0, 0, -0.05 * scale);
  C(back, mat, 0, 0, -0.05 * scale, 0.014 * scale, 0.1 * scale, Math.PI / 2);
  K(back, mat, 0, -0.01, -0.11 * scale, 0.016 * scale, 0.07 * scale, -Math.PI / 2);
  return f;
}

function limbSeg(parent, mat, len, r, r2) {
  const g = grp(parent);
  C(g, mat, 0, -len / 2, 0, r, len, 0, 0, 0, r2 ?? r * 0.85);
  S(g, mat, 0, 0, 0, r * 1.15);
  return g;
}

// ---------------------------------------------------------------- ROWLEX
export function buildRowlex(scale = 1) {
  const armorMap = Tex.armor();
  const hide = std(0x2a4a34, { roughness: 0.55, metalness: 0.42, map: armorMap, color: 0x2e5238, emissive: 0x0a1a10, emissiveIntensity: 0.22 });
  const hideHi = std(0x34583e, { roughness: 0.45, metalness: 0.5, map: armorMap, emissive: 0x0a1a10, emissiveIntensity: 0.15 });
  const plate = std(0x101a14, { roughness: 0.5, metalness: 0.7 });
  const rust = std(0x2e241c, { roughness: 0.62, metalness: 0.65 });
  const iron = std(0x2a2c2a, { roughness: 0.45, metalness: 0.85 });
  const steel = std(0x4a4c4a, { roughness: 0.4, metalness: 0.88 });
  const nail = std(0x3a3834, { roughness: 0.45, metalness: 0.8 });
  const eyeLens = new THREE.MeshBasicMaterial({ color: 0x4a0000, toneMapped: false });
  const eyeCore = new THREE.MeshBasicMaterial({ color: 0xe01000, toneMapped: false });
  const eyeRing = new THREE.MeshBasicMaterial({ color: 0x2a0000, toneMapped: false });
  const amber = new THREE.MeshBasicMaterial({ color: 0xc87814, toneMapped: false });
  const amberDim = new THREE.MeshBasicMaterial({ color: 0x8a4a08, toneMapped: false });

  const root = new THREE.Group();
  const body = grp(root, 0, 0, 0);
  const shell = grp(body);

  // armored sphere
  const hull = part(shell, G.sphHi, hide, 0, 0, 0, 0, 0, 0, 0.55, 0.55, 0.55);
  hull.castShadow = false;
  // panel seams sit below / behind the eye so they never bar the lens
  part(shell, new THREE.TorusGeometry(0.515, 0.01, 6, 24), iron, 0, -0.30, 0, Math.PI / 2);
  part(shell, new THREE.TorusGeometry(0.53, 0.008, 6, 20), iron, 0, 0.28, -0.22, 1.15, 0, 0.25);

  // nails / pins on the upper hemisphere (irregular, as in the art)
  const nails = [];
  const nailPts = [
    [0.15, 0.52, 0.08, 0.14], [ -0.22, 0.48, 0.18, 0.18], [0.28, 0.44, -0.16, 0.12],
    [-0.08, 0.50, -0.22, 0.16], [0.38, 0.36, 0.12, 0.11], [-0.36, 0.38, -0.08, 0.13],
    [0.10, 0.46, 0.32, 0.10], [-0.30, 0.34, 0.30, 0.12], [0.32, 0.30, 0.30, 0.09],
    [-0.12, 0.42, -0.36, 0.11], [0.02, 0.54, -0.05, 0.15]
  ];
  for (const [x, y, z, len] of nailPts) {
    const n = grp(shell, x, y, z);
    const dir = new THREE.Vector3(x, y, z).normalize();
    n.lookAt(n.position.clone().add(dir));
    C(n, nail, 0, 0, len * 0.35, 0.018, len * 0.7, Math.PI / 2);
    // flat head
    C(n, steel, 0, 0, 0, 0.032, 0.02, Math.PI / 2);
    nails.push(n);
  }

  // ---- EYE (front, +Z): deep red orb in a dark recessed gear bezel — no bloom wash
  const eye = grp(shell, 0, 0.02, 0.505);
  // socket stays behind the lens so no rim silhouettes across the eye
  part(eye, new THREE.CylinderGeometry(0.2, 0.22, 0.07, 20), plate, 0, 0, -0.08, Math.PI / 2);
  part(eye, new THREE.CircleGeometry(0.2, 20), plate, 0, 0, -0.12);
  // gear bezel around the opening, slightly behind the lens front
  const bezel = part(eye, new THREE.TorusGeometry(0.2, 0.014, 8, 24), iron, 0, 0, -0.015);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    B(eye, iron, Math.cos(a) * 0.215, Math.sin(a) * 0.215, -0.015, 0.026, 0.014, 0.02, 0, 0, a);
  }
  // deep-red lens (basic, unboosted) + smaller bright core so bloom stays red, not white
  const lens = part(eye, new THREE.SphereGeometry(0.16, 18, 14), eyeLens, 0, 0, 0.05, 0, 0, 0, 1, 1, 0.78);
  const iris = part(eye, new THREE.SphereGeometry(0.075, 14, 10), eyeCore, 0, 0, 0.115);
  const eyeHalo = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), additive(0xff1408, 0.22, { map: Tex.dot(), side: THREE.DoubleSide, depthWrite: false }));
  eyeHalo.position.z = 0.12; eye.add(eyeHalo);
  const eyeLight = new THREE.PointLight(0xff1808, 0.1, 1.8, 2); eyeLight.position.set(0, 0, 0.2); eye.add(eyeLight);

  // amber side lights (slightly above and beside the eye)
  const lamps = [];
  for (const s of [-1, 1]) {
    const lamp = grp(shell, s * 0.29, 0.11, 0.41);
    part(lamp, new THREE.CylinderGeometry(0.05, 0.055, 0.045, 10), iron, 0, 0, 0, Math.PI / 2);
    const bulb = part(lamp, G.sph, amber, 0, 0, 0.02, 0, 0, 0, 0.038, 0.038, 0.038);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), additive(0xffaa22, 0.28, { map: Tex.dot(), side: THREE.DoubleSide, depthWrite: false }));
    halo.position.z = 0.04; lamp.add(halo);
    lamps.push({ lamp, bulb, halo });
  }

  // ---- LIMBS
  const limbs = grp(root);
  const armMat = rust;
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = grp(limbs, s * 0.48, -0.05, 0.05);
    sh.rotation.z = s * 0.55;
    sh.rotation.x = 0.25;
    const upper = limbSeg(sh, armMat, 0.42, 0.045, 0.035);
    const el = grp(upper, 0, -0.42, 0);
    el.rotation.x = -0.35;
    const lower = limbSeg(el, armMat, 0.38, 0.032, 0.026);
    const wrist = grp(lower, 0, -0.38, 0);
    wrist.rotation.x = 0.2;
    const hand = clawHand(wrist, iron, 1.15);
    hand.rotation.x = -Math.PI / 2;
    arms.push({ sh, upper, el, lower, wrist, hand, side: s });
  }
  // disc mounts on right wrist
  const discMount = grp(arms[1].wrist, 0, -0.05, 0.08);

  const legs = [];
  const legMat = rust;
  for (const s of [-1, 1]) {
    const hip = grp(limbs, s * 0.28, -0.42, 0.0);
    hip.rotation.z = s * 0.15;
    hip.rotation.x = 0.15;
    const thigh = limbSeg(hip, legMat, 0.42, 0.07, 0.055);
    const knee = grp(thigh, 0, -0.42, 0);
    knee.rotation.x = 0.55;
    const shin = limbSeg(knee, legMat, 0.46, 0.05, 0.04);
    const ankle = grp(shin, 0, -0.46, 0);
    ankle.rotation.x = -0.55;
    const foot = birdFoot(ankle, iron, 1.2);
    foot.rotation.x = Math.PI / 2;
    legs.push({ hip, thigh, knee, shin, ankle, foot, side: s });
  }

  // hover sled (Reach mode)
  const sled = grp(root, 0, -0.15, 0);
  sled.visible = false;
  const glassM = holographicMat(0x40e8ff, 0.45);
  const sledBody = part(sled, new THREE.BoxGeometry(1.1, 0.12, 1.8), glassM, 0, -0.55, 0.05);
  sledBody.scale.set(1, 1, 1);
  // tapered nose via scaled boxes
  part(sled, new THREE.BoxGeometry(0.7, 0.1, 0.6), glassM, 0, -0.54, 0.85);
  part(sled, new THREE.BoxGeometry(0.4, 0.08, 0.35), glassM, 0, -0.52, 1.2);
  // side rails
  const railM = glow(0x40e8ff, 1.4);
  part(sled, new THREE.BoxGeometry(0.05, 0.05, 1.9), railM, 0.55, -0.48, 0.05);
  part(sled, new THREE.BoxGeometry(0.05, 0.05, 1.9), railM, -0.55, -0.48, 0.05);
  part(sled, new THREE.BoxGeometry(0.05, 0.05, 1.3), glow(0xc040ff, 1.2), 0.55, -0.58, 0.1);
  part(sled, new THREE.BoxGeometry(0.05, 0.05, 1.3), glow(0xc040ff, 1.2), -0.55, -0.58, 0.1);
  // underside glow
  const sledGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.0), additive(0x40e8ff, 0.45, { map: Tex.dot(), side: THREE.DoubleSide }));
  sledGlow.rotation.x = Math.PI / 2; sledGlow.position.set(0, -0.64, 0.05); sled.add(sledGlow);
  const sledLight = new THREE.PointLight(0x40e8ff, 1.2, 8, 2); sledLight.position.set(0, -0.4, 0); sled.add(sledLight);
  // rear thrusters
  for (const s of [-1, 1]) {
    C(sled, iron, s * 0.28, -0.55, -0.95, 0.08, 0.16, Math.PI / 2);
    const thr = part(sled, G.sph, glow(0xff6a20, 3), s * 0.28, -0.55, -1.08, 0, 0, 0, 0.09, 0.09, 0.14);
  }

  // blob shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.05; root.add(shadow);

  root.scale.setScalar(scale);

  const P = {
    root, body, shell, eye, lens, iris, eyeHalo, eyeLight, lamps, nails,
    limbs, arms, legs, discMount, sled, sledGlow, shadow,
    mode: 'walk', hipY: 0,
  };

  P.setMode = function setMode(mode) {
    this.mode = mode;
    if (mode === 'ball') {
      this.limbs.visible = false;
      this.sled.visible = false;
      this.body.position.y = 0;
      this.shadow.position.y = -0.56;
      this.shadow.scale.setScalar(0.7);
    } else if (mode === 'sled') {
      this.limbs.visible = true;
      this.sled.visible = true;
      this.body.position.y = 0.05;
      // tuck legs a bit
      for (const L of this.legs) { L.hip.rotation.x = 0.8; L.knee.rotation.x = 1.1; }
      this.shadow.position.y = -0.66;
      this.shadow.scale.setScalar(1.2);
    } else {
      this.limbs.visible = true;
      this.sled.visible = false;
      this.body.position.y = 0;
      for (const L of this.legs) { L.hip.rotation.x = 0.15; L.knee.rotation.x = 0.55; L.ankle.rotation.x = -0.55; }
      this.shadow.position.y = -1.05;
      this.shadow.scale.setScalar(1);
    }
  };

  // walk-mode standing height: bottom of feet around y=-1.05, sphere center at 0, so root is placed with y = 1.05 on ground
  P.standHeight = 1.05;
  P.ballRadius = 0.55 * scale;
  P.setMode('walk');
  return P;
}

export function poseRowlex(P, opt = {}) {
  const t = opt.t || 0, sp = opt.sp || 0, mode = P.mode;
  const throwT = opt.throwT || 0;
  // eye pulse — kept small so the close-up stays a deep red, not a white bloom
  const pulse = 0.85 + Math.sin(t * 3.4) * 0.15;
  if (P.eyeLight) P.eyeLight.intensity = 0.08 + pulse * 0.04;
  if (P.eyeHalo) P.eyeHalo.material.opacity = 0.16 + pulse * 0.07;
  for (const L of P.lamps) L.halo.material.opacity = 0.2 + Math.sin(t * 2.6 + 1) * 0.06;

  if (mode === 'ball') {
    // rolling applied by caller on P.body (or P.shell)
    return;
  }
  if (mode === 'sled') {
    P.body.position.y = 0.05 + Math.sin(t * 8) * 0.02;
    P.sled.position.y = -0.15 + Math.sin(t * 8 + 0.4) * 0.015;
    if (P.sledGlow) P.sledGlow.material.opacity = 0.35 + Math.sin(t * 12) * 0.12;
    // arms slightly out
    for (const A of P.arms) {
      A.sh.rotation.z = A.side * 0.7;
      A.sh.rotation.x = 0.5;
      A.el.rotation.x = -0.2;
    }
    if (throwT > 0) {
      const k = Math.min(1, throwT / 0.3);
      P.arms[1].sh.rotation.x = -1.0 * k + 0.3;
    }
    return;
  }
  // walk / idle
  const amt = Math.min(1, sp / 7);
  const phase = opt.phase || t * (3 + amt * 5);
  if (amt < 0.08) {
    // idle breathe
    P.body.position.y = Math.sin(t * 2.2) * 0.03;
    for (let i = 0; i < 2; i++) {
      const L = P.legs[i], A = P.arms[i];
      L.hip.rotation.x = 0.15 + Math.sin(t * 1.6 + i) * 0.04;
      L.knee.rotation.x = 0.55;
      A.sh.rotation.x = 0.25 + Math.sin(t * 1.6 + i + 1) * 0.06;
      A.el.rotation.x = -0.35;
    }
  } else {
    P.body.position.y = Math.abs(Math.sin(phase)) * 0.05 * amt;
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const sw = Math.sin(phase + (i === 0 ? 0 : Math.PI)) * amt;
      P.legs[i].hip.rotation.x = 0.15 + sw * 0.7;
      P.legs[i].knee.rotation.x = 0.45 + Math.max(0, -sw) * 0.7;
      P.legs[i].ankle.rotation.x = -0.5 - sw * 0.2;
      P.arms[i].sh.rotation.x = 0.25 - sw * 0.5;
      P.arms[i].el.rotation.x = -0.35 - Math.max(0, sw) * 0.25;
    }
  }
  if (throwT > 0) {
    const k = Math.min(1, throwT / 0.3);
    P.arms[1].sh.rotation.x = -1.15 * k;
    P.arms[1].el.rotation.x = 0.1;
  }
}

// Shared holographic glass material (cheap, bloom-friendly, no transmission)
export function holographicMat(color = 0x40e8ff, opacity = 0.38) {
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.12,
    metalness: 0.15,
    transparent: true,
    opacity,
    emissive: new THREE.Color(color).multiplyScalar(0.35),
    emissiveIntensity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.2,
  });
  mat.userData.time = { value: 0 };
  const col = new THREE.Color(color);
  mat.onBeforeCompile = sh => {
    sh.uniforms.holoTime = mat.userData.time;
    sh.uniforms.holoCol = { value: col };
    sh.fragmentShader = `
      uniform float holoTime; uniform vec3 holoCol;
    ` + sh.fragmentShader.replace('#include <emissivemap_fragment>', `
      #include <emissivemap_fragment>
      float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.4);
      float scan = 0.5 + 0.5 * sin(vViewPosition.y * 14.0 + holoTime * 3.0);
      float grid = abs(sin(vViewPosition.x * 8.0 + holoTime)) * abs(sin(vViewPosition.z * 8.0));
      totalEmissiveRadiance += holoCol * (fres * 1.8 + scan * 0.25 + grid * 0.12);
      diffuseColor.a = clamp(diffuseColor.a + fres * 0.45, 0.0, 1.0);
    `);
  };
  mat.customProgramCacheKey = () => 'holo';
  return mat;
}

// ---------------------------------------------------------------- backglass faces (stylized 3D busts)
export function buildGoggledFace(scale = 1) { // scale applied at end
  const skin = std(0x6a4a36, { roughness: 0.7 });
  const skinD = std(0x4a3226, { roughness: 0.75 });
  const beard = std(0x3a2a20, { roughness: 0.9 });
  const hair = std(0x2a1c14, { roughness: 0.85 });
  const leather = std(0x1a120e, { roughness: 0.6, metalness: 0.2 });
  const root = new THREE.Group();
  S(root, skin, 0, 0, 0, 0.42, 1.15, 0.9);
  S(root, skin, 0, 0.15, 0.15, 0.32, 0.9, 0.85); // brow
  // nose
  K(root, skinD, 0, -0.02, 0.38, 0.07, 0.18, Math.PI / 2);
  // goggles — huge orange lenses
  for (const s of [-1, 1]) {
    const gog = grp(root, s * 0.18, 0.12, 0.32);
    part(gog, new THREE.TorusGeometry(0.13, 0.03, 8, 16), leather, 0, 0, 0, Math.PI / 2);
    part(gog, new THREE.SphereGeometry(0.12, 12, 8), glow(0xff6a10, 2.4), 0, 0, 0.01, 0, 0, 0, 1, 1, 0.5);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), additive(0xff6a10, 0.55, { map: Tex.dot(), side: THREE.DoubleSide }));
    halo.position.z = 0.05; gog.add(halo);
  }
  // strap
  part(root, new THREE.TorusGeometry(0.38, 0.03, 6, 20, Math.PI), leather, 0, 0.1, 0, 0, Math.PI / 2, 0);
  // beard
  S(root, beard, 0, -0.35, 0.1, 0.32, 1.3, 0.9);
  S(root, beard, 0, -0.55, 0.05, 0.22, 1.4, 0.8);
  // hair / hood shadow
  S(root, hair, 0, 0.28, -0.05, 0.4, 0.7, 0.85);
  root.scale.setScalar(scale);
  return root;
}

export function buildCosmicFace(scale = 1) {
  const skin = std(0x2a3a55, { roughness: 0.55, metalness: 0.25, emissive: 0x102040, emissiveIntensity: 0.35 });
  const skinD = std(0x1a2438, { roughness: 0.6 });
  const beard = std(0x1a2848, { roughness: 0.7, emissive: 0x2040a0, emissiveIntensity: 0.4 });
  const root = new THREE.Group();
  S(root, skin, 0, 0, 0, 0.42, 1.15, 0.9);
  S(root, skin, 0, 0.15, 0.15, 0.32, 0.9, 0.85);
  K(root, skinD, 0, -0.02, 0.38, 0.07, 0.18, Math.PI / 2);
  // cosmic eyes — deep blue glow
  for (const s of [-1, 1]) {
    const e = grp(root, s * 0.14, 0.10, 0.34);
    S(e, glow(0x40c8ff, 3), 0, 0, 0, 0.055);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), additive(0x40c8ff, 0.6, { map: Tex.dot(), side: THREE.DoubleSide }));
    halo.position.z = 0.04; e.add(halo);
  }
  // star-speckled beard
  S(root, beard, 0, -0.38, 0.1, 0.34, 1.4, 0.95);
  S(root, beard, 0, -0.62, 0.04, 0.22, 1.5, 0.8);
  // marks on brow
  B(root, glow(0x40c8ff, 1.4), 0, 0.28, 0.32, 0.12, 0.02, 0.02);
  // faint constellation dots
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI + 0.2;
    S(root, glow(0xa0e0ff, 2), Math.cos(a) * 0.22, -0.35 + Math.sin(a * 2) * 0.2, 0.28, 0.015);
  }
  root.scale.setScalar(scale);
  return root;
}

// ---------------------------------------------------------------- scenery pieces
export function buildDarkTree(scale = 1) {
  const bark = std(0x0b0c0a, { roughness: 0.94, map: Tex.bark(), color: 0x121410 });
  const leaf = std(0x070908, { roughness: 0.88, color: 0x0a0e0c });
  const root = new THREE.Group();
  // tall thick trunk — storm-blasted giant, not a mushroom
  root.add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.78, 4.6, 8), bark)).position.set(0, 2.3, 0);
  // slight lean in the upper trunk
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.8, 7), bark);
  upper.position.set(0.15, 5.0, 0.1); upper.rotation.z = -0.18; upper.rotation.x = 0.08; root.add(upper);
  // spreading limbs
  const limbs = [
    [0.3, 4.6, 0.1, 1.8, 0.18, 0.8, 0.4],
    [-0.2, 4.3, -0.15, 2.0, -0.9, 0.5, 0.2],
    [0.1, 5.2, 0.2, 1.6, 0.2, 0.9, -0.7],
    [0.0, 3.8, 0.0, 1.5, -0.5, 0.2, 1.0],
    [0.2, 5.4, 0.0, 1.3, 1.1, 0.6, 0.2],
  ];
  for (const [x, y, z, len, rx, ry, rz] of limbs) {
    const b = grp(root, x, y, z);
    b.rotation.set(rx, ry, rz);
    b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.16, len, 5), bark)).position.set(0, len / 2, 0);
  }
  // irregular dark canopy clusters — a wide, torn silhouette
  const clusters = [
    [0.0, 6.4, 0.0, 1.7, 1.1, 1.5],
    [1.4, 6.0, 0.3, 1.3, 0.9, 1.2],
    [-1.5, 5.8, -0.2, 1.4, 0.95, 1.2],
    [0.6, 6.8, -0.8, 1.1, 0.8, 1.0],
    [-0.7, 6.7, 0.9, 1.15, 0.75, 1.05],
    [1.8, 5.3, -0.6, 0.9, 0.7, 0.85],
    [-1.9, 5.2, 0.5, 0.95, 0.7, 0.9],
    [0.2, 7.3, 0.2, 0.9, 0.65, 0.85],
  ];
  for (const [x, y, z, sx, sy, sz] of clusters) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), leaf);
    c.position.set(x, y, z); c.scale.set(sx, sy, sz); c.rotation.set(x, y, z);
    root.add(c);
  }
  // roots gripping the island
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const r = grp(root, Math.cos(a) * 0.45, 0.08, Math.sin(a) * 0.45);
    r.rotation.z = Math.cos(a) * 1.05; r.rotation.x = Math.sin(a) * 1.05;
    C(r, bark, 0, 0.7, 0, 0.1, 1.5, 0, 0, 0, 0.04);
  }
  root.scale.setScalar(scale);
  return root;
}

export function buildIsland(r = 2, h = 1.2, color = 0x1a3040) {
  const g = new THREE.Group();
  const top = std(color, { roughness: 0.72, metalness: 0.12, emissive: 0x042028, emissiveIntensity: 0.28, map: Tex.rock() });
  const side = std(0x10161c, { roughness: 0.88, map: Tex.rock() });
  part(g, new THREE.CylinderGeometry(r, r * 0.9, 0.2, 8), top, 0, 0, 0);
  // hanging inverted mesa, plus a couple of rock lumps so the silhouette isn't a clean cone
  part(g, new THREE.ConeGeometry(r * 0.9, h, 7), side, 0, -h / 2 - 0.08, 0, Math.PI, 0, 0);
  const lumps = 2 + (r * 3 | 0) % 3;
  for (let i = 0; i < lumps; i++) {
    const a = i / lumps * Math.PI * 2 + r;
    const rr = r * (0.35 + (i % 3) * 0.12);
    S(g, side, Math.cos(a) * r * 0.45, -h * (0.35 + (i % 2) * 0.2), Math.sin(a) * r * 0.45, rr, 0.7, 0.85);
  }
  part(g, new THREE.TorusGeometry(r * 0.95, 0.035, 5, 14), glow(0x40e8ff, 1.05), 0, 0.11, 0, Math.PI / 2);
  return g;
}

export function buildFlyer(scale = 1, color = 0xc040ff) {
  const g = new THREE.Group();
  const hull = std(0x1a1020, { roughness: 0.4, metalness: 0.7, emissive: color, emissiveIntensity: 0.25 });
  const lit = glow(color, 1.8);
  B(g, hull, 0, 0, 0, 0.35, 0.12, 1.1);
  B(g, hull, 0, 0, 0.4, 0.5, 0.08, 0.4);
  // wings
  B(g, hull, 0, 0, -0.1, 1.4, 0.04, 0.3);
  B(g, lit, 0.7, 0, -0.1, 0.3, 0.02, 0.18);
  B(g, lit, -0.7, 0, -0.1, 0.3, 0.02, 0.18);
  C(g, lit, 0, 0, -0.6, 0.06, 0.12, Math.PI / 2);
  const glowP = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), additive(color, 0.5, { map: Tex.dot(), side: THREE.DoubleSide }));
  glowP.position.set(0, 0, -0.7); g.add(glowP);
  g.scale.setScalar(scale);
  g.userData.glow = glowP;
  return g;
}

const WIN_TEX = [];
function winTex(i = 0) {
  if (!WIN_TEX[i]) {
    const pals = [
      ['#ff2ad4', '#c040ff', '#2af0ff', '#ff77cc'],
      ['#40e8ff', '#7a40ff', '#ff40c0', '#60a0ff'],
      ['#ffa0e8', '#8040ff', '#40f0ff', '#ff80d0'],
    ];
    WIN_TEX[i] = Tex.windows(0.62, pals[i % pals.length]);
    WIN_TEX[i].wrapS = WIN_TEX[i].wrapT = THREE.RepeatWrapping;
    WIN_TEX[i].repeat.set(1, Math.max(1, 2));
  }
  return WIN_TEX[i];
}

export function buildTower(h = 20, w = 3, pal = 0x1a0820, variant) {
  const g = new THREE.Group();
  variant = variant ?? ((Math.abs(h * 13 + w * 7) | 0) % 4);
  const mat = std(pal, { roughness: 0.5, metalness: 0.48, map: winTex(variant % 3), emissive: 0x1a000e, emissiveIntensity: 0.32 });
  const cap = glow(0xc040ff, 0.85);
  const spireM = std(0x140818, { metalness: 0.62, roughness: 0.4 });
  if (variant === 0) {
    B(g, mat, 0, h / 2, 0, w, h, w * 0.85);
    B(g, cap, 0, h + 0.18, 0, w * 0.7, 0.16, w * 0.6);
    K(g, spireM, 0, h + 1.5, 0, 0.2, 2.5);
  } else if (variant === 1) {
    // setback tower
    B(g, mat, 0, h * 0.32, 0, w * 1.15, h * 0.64, w * 1.05);
    B(g, mat, 0, h * 0.78, 0, w * 0.78, h * 0.4, w * 0.7);
    B(g, cap, 0, h + 0.12, 0, w * 0.55, 0.12, w * 0.5);
    K(g, spireM, 0, h + 1.3, 0, 0.16, 2.2);
  } else if (variant === 2) {
    // twin fins
    B(g, mat, -w * 0.38, h * 0.55, 0, w * 0.55, h * 1.1, w * 0.55);
    B(g, mat, w * 0.38, h * 0.42, 0, w * 0.5, h * 0.84, w * 0.5);
    B(g, cap, -w * 0.38, h * 1.1 + 0.1, 0, w * 0.4, 0.1, w * 0.4);
    K(g, spireM, -w * 0.38, h * 1.1 + 1.3, 0, 0.14, 2.2);
    K(g, spireM, w * 0.38, h * 0.84 + 1.0, 0, 0.12, 1.7);
  } else {
    // wide crown + antennae
    B(g, mat, 0, h / 2, 0, w * 1.2, h, w * 0.7);
    B(g, mat, 0, h + 0.6, 0, w * 1.35, 0.5, w * 0.9);
    B(g, cap, 0, h + 0.9, 0, w * 1.1, 0.1, w * 0.7);
    K(g, spireM, -w * 0.35, h + 2.0, 0, 0.1, 2.0);
    K(g, spireM, w * 0.35, h + 2.4, 0, 0.09, 2.6);
  }
  return g;
}

// ---------------------------------------------------------------- rift enemies
export function buildStormWisp(scale = 1) {
  const root = new THREE.Group(), body = grp(root);
  const core = S(body, glow(0x40e8ff, 3.5), 0, 0, 0, 0.28);
  const shell = part(body, G.sph, additive(0x40e8ff, 0.35, { side: THREE.DoubleSide }), 0, 0, 0, 0, 0, 0, 0.45, 0.45, 0.45);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), additive(0x40e8ff, 0.5, { map: Tex.dot(), side: THREE.DoubleSide }));
  body.add(halo);
  const bolts = [];
  for (let i = 0; i < 4; i++) {
    const b = B(body, glow(0xc0ffff, 2), 0, 0, 0, 0.04, 0.7, 0.04);
    bolts.push(b);
  }
  root.scale.setScalar(scale);
  return { root, body, core, halo, bolts, hipY: 0 };
}

export function buildIslandCrawler(scale = 1) {
  const rock = std(0x2a3a44, { roughness: 0.7, metalness: 0.3, emissive: 0x082028, emissiveIntensity: 0.3 });
  const claw = std(0x1a2428, { roughness: 0.55, metalness: 0.5 });
  const root = new THREE.Group(), body = grp(root, 0, 0.35, 0);
  S(body, rock, 0, 0, 0, 0.4, 0.7, 1.1);
  const eye = S(body, glow(0xff4020, 2.5), 0, 0.1, 0.38, 0.1);
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const s = i < 3 ? -1 : 1;
    const k = i % 3;
    const hip = grp(body, s * 0.3, -0.1, (k - 1) * 0.25);
    C(hip, claw, s * 0.15, -0.2, 0, 0.04, 0.45, 0, 0, s * 0.7);
    legs.push(hip);
  }
  root.scale.setScalar(scale);
  return { root, body, eye, legs, hips: body, hipY: 0.35 };
}

export function buildStormBird(scale = 1) {
  const mat = std(0x1a2830, { roughness: 0.5, metalness: 0.4, emissive: 0x043040, emissiveIntensity: 0.4 });
  const root = new THREE.Group(), body = grp(root);
  S(body, mat, 0, 0, 0, 0.35, 0.7, 1.3);
  K(body, mat, 0, 0, 0.5, 0.15, 0.4, Math.PI / 2);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = grp(body, s * 0.2, 0.1, 0);
    B(w, mat, s * 0.5, 0, 0, 1.0, 0.06, 0.45);
    B(w, glow(0x40e8ff, 1.2), s * 0.5, 0, -0.15, 0.8, 0.02, 0.08);
    wings.push(w);
  }
  S(body, glow(0x40e8ff, 2), 0, 0.08, 0.4, 0.07);
  root.scale.setScalar(scale);
  return { root, body, wings, hipY: 0 };
}

// ---------------------------------------------------------------- reach rivals (hover craft)
export function buildRivalSled(scale = 1, color = 0xff2ad4) {
  const hull = std(0x121018, { roughness: 0.35, metalness: 0.75, emissive: color, emissiveIntensity: 0.3 });
  const lit = glow(color, 1.8);
  const root = new THREE.Group(), body = grp(root);
  B(body, hull, 0, 0, 0, 0.9, 0.22, 1.6);
  B(body, hull, 0, 0.05, 0.55, 0.55, 0.16, 0.6);
  B(body, lit, 0.46, 0.02, 0, 0.05, 0.05, 1.5);
  B(body, lit, -0.46, 0.02, 0, 0.05, 0.05, 1.5);
  const glowP = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.8), additive(color, 0.4, { map: Tex.dot(), side: THREE.DoubleSide }));
  glowP.rotation.x = Math.PI / 2; glowP.position.y = -0.16; body.add(glowP);
  for (const s of [-1, 1]) C(body, lit, s * 0.22, 0, -0.85, 0.07, 0.14, Math.PI / 2);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.0), new THREE.MeshBasicMaterial({ color: 0x000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.25; root.add(shadow);
  root.scale.setScalar(scale);
  return { root, body, shadow, glow: glowP };
}

export const RIVALS = [
  { id: 'violet', name: 'VOID RUNNER', color: '#c040ff', hex: 0xc040ff, build: s => buildRivalSled(s, 0xc040ff) },
  { id: 'cyan', name: 'ION PIKE', color: '#2af0ff', hex: 0x2af0ff, build: s => buildRivalSled(s, 0x2af0ff) },
  { id: 'amber', name: 'SOL STORM', color: '#ff8a20', hex: 0xff8a20, build: s => buildRivalSled(s, 0xff8a20) },
  { id: 'rose', name: 'NEON FANG', color: '#ff2a8a', hex: 0xff2a8a, build: s => buildRivalSled(s, 0xff2a8a) },
];
