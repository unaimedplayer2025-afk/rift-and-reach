// Dark-and-evil Castle Grayskull + pirate table theme.
// Visuals only: no physics, no collision path changes.
import * as THREE from 'three';
import { std, part, grp, makeCurve, rnd, clamp } from './util.js';

export const C = {
  pitch: 0x07080a,      // near-black stone
  stone: 0x121614,
  stoneHi: 0x1c201c,
  moss: 0x1a2a1c,
  timber: 0x2a1c12,
  rotWood: 0x1a120c,
  rust: 0x4a2a16,
  rustDark: 0x2a160c,
  iron: 0x1a1c1e,
  brass: 0x5a4a28,
  gold: 0x6a5a28,       // cursed / tarnished
  bone: 0x7a6c54,
  boneDark: 0x4a4034,
  blood: 0x4a0808,
  eyeRed: 0x8a1010,
  eyeGreen: 0x1c3a14,
  portal: 0xa020f0,
  fog: 0x4a2870,
};

export function stoneMat(color = C.stone, o = {}) {
  return std(color, { roughness: 0.92, metalness: 0.08, ...o });
}
export function timberMat(color = C.timber, o = {}) {
  return std(color, { roughness: 0.88, metalness: 0.04, ...o });
}
export function rustMat(o = {}) {
  return std(C.rust, { roughness: 0.72, metalness: 0.55, ...o });
}
export function ironMat(o = {}) {
  return std(C.iron, { roughness: 0.55, metalness: 0.7, ...o });
}
export function goldMat(o = {}) {
  return std(C.gold, { roughness: 0.45, metalness: 0.85, emissive: 0x1a1408, emissiveIntensity: 0.12, ...o });
}
export function boneMat(o = {}) {
  return std(C.bone, { roughness: 0.82, metalness: 0.05, ...o });
}
export function pitchMat(o = {}) {
  return std(C.pitch, { roughness: 0.9, metalness: 0.12, ...o });
}

/** Faint eye glow — allowed as a feature, not a neon tube or a light. */
export function eyeMat(color = C.eyeRed, intensity = 0.45) {
  return std(0x050000, { roughness: 0.4, metalness: 0.1, emissive: color, emissiveIntensity: intensity });
}

export function makeSkull(scale = 1, eyeColor = C.eyeRed) {
  const g = new THREE.Group();
  const bone = boneMat();
  const dark = boneMat({ color: C.boneDark });
  part(g, new THREE.SphereGeometry(0.45, 14, 10), bone, 0, 0.05, 0);
  part(g, new THREE.SphereGeometry(0.22, 10, 8), dark, 0, -0.28, 0.08, 0.2, 0, 0, 1.1, 0.7, 0.9); // jaw
  // sockets
  part(g, new THREE.SphereGeometry(0.11, 8, 6), std(0x050505, { roughness: 1 }), -0.16, 0.1, 0.32);
  part(g, new THREE.SphereGeometry(0.11, 8, 6), std(0x050505, { roughness: 1 }), 0.16, 0.1, 0.32);
  const eL = part(g, new THREE.SphereGeometry(0.055, 8, 6), eyeMat(eyeColor), -0.16, 0.1, 0.38);
  const eR = part(g, new THREE.SphereGeometry(0.055, 8, 6), eyeMat(eyeColor), 0.16, 0.1, 0.38);
  // nose
  part(g, new THREE.ConeGeometry(0.05, 0.1, 6), dark, 0, -0.02, 0.4, -0.6);
  // teeth
  for (let i = -2; i <= 2; i++) {
    part(g, new THREE.BoxGeometry(0.06, 0.1, 0.05), bone, i * 0.08, -0.32, 0.28);
  }
  g.scale.setScalar(scale);
  g.userData.eyes = [eL, eR];
  return g;
}

export function makeKeg(scale = 1) {
  const g = new THREE.Group();
  const wood = timberMat(C.rotWood);
  const band = rustMat();
  part(g, new THREE.CylinderGeometry(0.42, 0.42, 0.7, 12), wood, 0, 0.35, 0);
  part(g, new THREE.CylinderGeometry(0.44, 0.44, 0.06, 12), band, 0, 0.12, 0);
  part(g, new THREE.CylinderGeometry(0.44, 0.44, 0.06, 12), band, 0, 0.58, 0);
  part(g, new THREE.CylinderGeometry(0.38, 0.38, 0.04, 12), timberMat(), 0, 0.72, 0);
  g.scale.setScalar(scale);
  return g;
}

/** Purple brain creature with pink glowing eyes and dripping tendrils, from John's art. */
export function makeBrain(scale = 1) {
  const g = new THREE.Group();
  const flesh = std(0x4a1a68, { roughness: 0.55, metalness: 0.12, emissive: 0x2a0850, emissiveIntensity: 0.22 });
  const drip = std(0x3a1458, { roughness: 0.5, metalness: 0.08, emissive: 0x1a0430, emissiveIntensity: 0.15 });
  part(g, new THREE.SphereGeometry(0.42, 12, 10), flesh, 0, 0, 0);
  part(g, new THREE.SphereGeometry(0.28, 10, 8), flesh, -0.18, 0.12, 0.05, 0, 0, 0, 1, 0.8, 0.9);
  part(g, new THREE.SphereGeometry(0.28, 10, 8), flesh, 0.18, 0.12, 0.05, 0, 0, 0, 1, 0.8, 0.9);
  const eL = part(g, new THREE.SphereGeometry(0.09, 8, 6), eyeMat(0xff40c8, 1.1), -0.14, 0.02, 0.34);
  const eR = part(g, new THREE.SphereGeometry(0.09, 8, 6), eyeMat(0xff40c8, 1.1), 0.14, 0.02, 0.34);
  // tendrils
  const tendrils = [];
  for (let i = 0; i < 5; i++) {
    const t = part(g, new THREE.CylinderGeometry(0.035, 0.012, 0.45, 6), drip, (i - 2) * 0.1, -0.42, 0.05 + (i % 2) * 0.04, 0.15 * (i - 2), 0, 0.2 * (i % 3 - 1));
    tendrils.push(t);
  }
  g.scale.setScalar(scale);
  g.userData.eyes = [eL, eR];
  g.userData.tendrils = tendrils;
  return g;
}

export function makePtero(scale = 1) {
  const g = new THREE.Group();
  const hide = std(0x1a1220, { roughness: 0.8, metalness: 0.05 });
  part(g, new THREE.ConeGeometry(0.12, 0.7, 6), hide, 0, 0, 0, Math.PI / 2);
  part(g, new THREE.SphereGeometry(0.1, 8, 6), hide, 0, 0.04, 0.32);
  const wingL = part(g, new THREE.BoxGeometry(0.9, 0.04, 0.35), hide, -0.5, 0.05, 0);
  const wingR = part(g, new THREE.BoxGeometry(0.9, 0.04, 0.35), hide, 0.5, 0.05, 0);
  g.userData.wings = [wingL, wingR];
  g.scale.setScalar(scale);
  return g;
}

/**
 * Rusted iron chain following an existing path. pts must be the gameplay path
 * so the visual sits on the collision / rail path.
 */
export function makeChain(parent, pts, opts = {}) {
  const linkR = opts.linkR != null ? opts.linkR : 0.11;
  const thick = opts.thick != null ? opts.thick : 0.032;
  const step = opts.step != null ? opts.step : 0.2;
  const skullEvery = opts.skullEvery != null ? opts.skullEvery : 10;
  const skullScale = opts.skullScale != null ? opts.skullScale : 0.42;
  const rust = rustMat();
  const rustDark = rustMat({ color: C.rustDark });
  const curve = makeCurve(pts, false);
  const len = Math.max(0.01, curve.getLength());
  // thin core so the path still reads as a continuous rail
  const core = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 8), thick * 0.7, 5, false), rustDark);
  parent.add(core);
  const n = Math.max(3, Math.floor(len / step));
  const linkGeo = new THREE.TorusGeometry(linkR, thick, 5, 8);
  const skulls = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1);
    const p = curve.getPointAt(Math.min(0.999, u));
    const tan = curve.getTangentAt(Math.min(0.999, u));
    const m = new THREE.Mesh(linkGeo, i % 2 ? rust : rustDark);
    m.position.copy(p);
    const up = Math.abs(tan.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.clone().normalize());
    m.quaternion.copy(quat);
    if (i % 2) m.rotateX(Math.PI / 2);
    parent.add(m);
    if (skullEvery && i % skullEvery === Math.floor(skullEvery / 2)) {
      const sk = makeSkull(skullScale, i % 2 ? C.eyeRed : C.eyeGreen);
      sk.position.copy(p);
      sk.quaternion.copy(quat);
      sk.position.add(new THREE.Vector3(0, linkR + 0.08 * skullScale, 0));
      parent.add(sk);
      skulls.push(sk);
    }
  }
  return { core, skulls, curve };
}

export function makeChest() {
  const g = new THREE.Group();
  part(g, new THREE.BoxGeometry(0.7, 0.35, 0.45), timberMat(C.rotWood), 0, 0.18, 0);
  part(g, new THREE.BoxGeometry(0.72, 0.08, 0.47), rustMat(), 0, 0.36, 0);
  part(g, new THREE.BoxGeometry(0.08, 0.12, 0.08), goldMat(), 0, 0.32, 0.22);
  // coins spilling
  for (let i = 0; i < 6; i++) {
    const c = part(g, new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), goldMat(), (i - 2.5) * 0.08, 0.42 + (i % 3) * 0.02, 0.05 * (i % 2));
    c.rotation.x = Math.PI / 2;
  }
  return g;
}

export function makeCannon() {
  const g = new THREE.Group();
  part(g, new THREE.CylinderGeometry(0.16, 0.2, 1.4, 10), rustMat(), 0, 0.35, 0, Math.PI / 2);
  part(g, new THREE.SphereGeometry(0.22, 10, 8), rustMat({ color: C.iron }), 0, 0.35, 0.7);
  part(g, new THREE.BoxGeometry(0.7, 0.18, 0.5), timberMat(), 0, 0.1, 0);
  return g;
}

export function makeCoins(n = 8) {
  const g = new THREE.Group();
  const gold = goldMat();
  for (let i = 0; i < n; i++) {
    const c = part(g, new THREE.CylinderGeometry(0.08, 0.08, 0.02, 10), gold,
      (Math.random() - 0.5) * 0.6, 0.02, (Math.random() - 0.5) * 0.6);
    c.rotation.x = Math.PI / 2;
    c.rotation.z = Math.random() * 0.5;
  }
  return g;
}

export function makeBone(len = 0.8) {
  const g = new THREE.Group();
  const b = boneMat();
  part(g, new THREE.CylinderGeometry(0.045, 0.045, len, 6), b, 0, 0, 0);
  part(g, new THREE.SphereGeometry(0.08, 8, 6), b, 0, len / 2, 0);
  part(g, new THREE.SphereGeometry(0.08, 8, 6), b, 0, -len / 2, 0);
  return g;
}

export function stonePlayfieldMat() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, flash: { value: 0 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vP;
      void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform float time, flash;
      varying vec2 vUv; varying vec3 vP;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main(){
        vec2 uv = vUv;
        // near-black stone with faint plank striations
        float plank = floor(uv.y * 22.0);
        float n = h21(uv * 18.0 + plank);
        float grain = h21(vec2(uv.x * 40.0, plank));
        vec3 stone = vec3(0.05, 0.055, 0.05) + n * 0.03;
        vec3 wood = vec3(0.07, 0.045, 0.03) * (0.7 + grain * 0.4);
        vec3 col = mix(stone, wood, 0.45);
        // grout / mortar lines
        float line = smoothstep(0.02, 0.0, abs(fract(uv.y * 22.0) - 0.5) - 0.46);
        col *= 1.0 - line * 0.45;
        // cursed gold inlay, very dim
        float coin = 0.0;
        vec2 c1 = uv - vec2(0.2, 0.16); coin += 1.0 - smoothstep(0.03, 0.05, length(c1));
        vec2 c2 = uv - vec2(0.8, 0.16); coin += 1.0 - smoothstep(0.03, 0.05, length(c2));
        col += vec3(0.18, 0.14, 0.05) * coin * 0.35;
        // blood stains
        float blood = pow(h21(uv * 6.0 + 3.0), 8.0);
        col = mix(col, vec3(0.12, 0.02, 0.02), blood * 0.5);
        // portal wash — only colored light, from the far (top of uv) back of the table
        float wash = smoothstep(0.45, 1.0, uv.y) * 0.18;
        col += vec3(0.18, 0.05, 0.28) * wash;
        col += vec3(0.2, 0.05, 0.04) * flash * 0.2;
        float vig = smoothstep(0.0, 0.1, uv.x) * smoothstep(1.0, 0.9, uv.x) * smoothstep(0.0, 0.06, uv.y);
        col *= 0.7 + 0.3 * vig;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: true,
  });
}

export function evilSkyMat() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float time; varying vec3 vP;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main(){
        float y = vP.y;
        // dark teal / purple like John's art, but gloomier
        vec3 top = vec3(0.03, 0.02, 0.08);
        vec3 hor = vec3(0.04, 0.12, 0.14);
        vec3 bot = vec3(0.04, 0.02, 0.08);
        vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y * 1.4, 0.0, 1.0), 0.75)) : mix(hor, bot, clamp(-y * 1.8, 0.0, 1.0));
        c += vec3(0.16, 0.04, 0.22) * pow(h21(vP.xz * 2.4), 2.2) * 0.4;
        c += vec3(0.02, 0.08, 0.1) * pow(h21(vP.xy * 1.8 + 2.0), 2.0) * 0.3;
        // sparse cold stars
        vec2 sp = vec2(atan(vP.x, -vP.z) * 1.5915, y);
        float s = h21(floor(sp * vec2(70.0, 44.0)));
        if (s > 0.97) c += vec3(0.7, 0.6, 0.9) * ((s - 0.97) / 0.03) * 0.55;
        // purple fog bank near the horizon
        float fog = exp(-abs(y) * 6.0) * 0.35;
        c = mix(c, vec3(0.14, 0.06, 0.2), fog);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}

export function loadPortalArt() {
  const tex = new THREE.TextureLoader().load('./assets/portal-art-ref.png');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}
