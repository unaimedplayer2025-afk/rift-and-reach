// THE RIFT & THE REACH — pinball table showpiece.
// Built to match table-ref.png: holographic cyan glass, living energy streams,
// a cosmic playfield, and real 3D dioramas of The Rift and The Reach mixed
// into one cabinet that feels like a portal between worlds.
import * as THREE from 'three';
import { std, glow, additive, part, grp, Tex, instanced, makeCurve, clamp, lerp, damp, rnd, pick } from './util.js';
import { holographicMat, buildDarkTree, buildIsland, buildFlyer, buildTower } from './models.js';
import { buildTableFeatures, enclosedWalls, slingSegments } from './table-features.js';

export const BALL_R = 0.42;

// ------------------------------------------------------------------------------------------ shaders
function playfieldShader() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      flash: { value: 0 },
      nebula: { value: Tex.nebula(2) },
      circuit: { value: Tex.circuit() },
      sigil: { value: Tex.sigil() },
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vP;
      void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      uniform float time, flash; uniform sampler2D nebula, circuit, sigil;
      varying vec2 vUv; varying vec3 vP;
      void main(){
        vec2 uv = vUv;
        vec3 neb = texture2D(nebula, uv * 1.4 + vec2(time * 0.01, time * 0.006)).rgb;
        neb += texture2D(nebula, uv * 0.7 - vec2(time * 0.008, 0.0)).rgb * 0.45;
        vec3 cir = texture2D(circuit, uv * 2.2 + vec2(0.0, time * 0.02)).rgb;
        // corner sigils (near flippers, both sides) + mid-upper marks
        vec2 sL = (uv - vec2(0.14, 0.18)) * 3.6;
        vec2 sR = (uv - vec2(0.86, 0.18)) * 3.6;
        float inL = 1.0 - smoothstep(0.45, 0.52, length(sL - 0.5));
        float inR = 1.0 - smoothstep(0.45, 0.52, length(sR - 0.5));
        vec3 sig = texture2D(sigil, sL).rgb * inL + texture2D(sigil, sR).rgb * inR;
        // flowing energy veins
        float vein = 0.5 + 0.5 * sin((uv.x * 8.0 + uv.y * 3.0) * 3.14159 - time * 2.4);
        float vein2 = 0.5 + 0.5 * sin((uv.x * -5.0 + uv.y * 7.0) * 3.14159 - time * 1.7);
        vec3 energy = vec3(0.25, 0.45, 1.0) * vein * 0.25 + vec3(0.7, 0.25, 1.0) * vein2 * 0.2;
        vec3 col = neb * 1.05 + cir * 0.55 + sig * 1.15 + energy;
        col += vec3(1.0, 0.7, 0.4) * flash * 0.35;
        // vignette toward edges so the dioramas read
        float vig = smoothstep(0.0, 0.12, uv.x) * smoothstep(1.0, 0.88, uv.x) * smoothstep(0.0, 0.08, uv.y) * smoothstep(1.0, 0.9, uv.y);
        col *= 0.55 + 0.45 * vig;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
  });
  return mat;
}

function energyMat(colorA, colorB) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      pull: { value: 0 },
      colA: { value: new THREE.Color(colorA) },
      colB: { value: new THREE.Color(colorB) },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position,1.0);
        vN = normalize(normalMatrix * normal);
        vV = cameraPosition - wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float time, pull; uniform vec3 colA, colB;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float u = vUv.x, v = vUv.y;
        float flow = fract(u * 5.0 - time * 1.6);
        float pulse = smoothstep(0.0, 0.15, flow) * smoothstep(0.55, 0.2, flow);
        float band = pow(1.0 - abs(v - 0.5) * 2.0, 1.4);
        float n = sin((u * 30.0 + time * 8.0) + sin(v * 20.0 + time * 4.0));
        float bolt = pow(max(0.0, n), 8.0);
        vec3 col = mix(colA, colB, 0.5 + 0.5 * sin(u * 6.0 - time * 2.0));
        float fres = pow(1.0 - clamp(dot(normalize(vV), normalize(vN)), 0.0, 1.0), 2.0);
        float a = band * (0.22 + pulse * 0.4 + bolt * 0.5 + pull * 0.25) + fres * 0.12;
        // mid-intensity purple/blue — do not multiply into white
        gl_FragColor = vec4(col * (0.65 + pulse * 0.25 + bolt * 0.35 + pull * 0.2), clamp(a, 0.0, 0.85));
      }
    `,
  });
  return mat;
}

function spaceSkyMat() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { time: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `
      uniform float time; varying vec3 vP;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main(){
        float y = vP.y;
        vec3 top = vec3(0.01, 0.02, 0.06);
        vec3 hor = vec3(0.06, 0.03, 0.12);
        vec3 bot = vec3(0.01, 0.01, 0.03);
        vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y * 1.6, 0.0, 1.0), 0.7)) : mix(hor, bot, clamp(-y * 2.0, 0.0, 1.0));
        // nebula wash
        float n1 = h21(vP.xz * 4.0 + time * 0.01);
        c += vec3(0.12, 0.04, 0.2) * pow(h21(vP.xy * 2.0), 2.0) * 0.45;
        c += vec3(0.04, 0.08, 0.2) * pow(h21(vP.yz * 3.0), 2.0) * 0.35;
        // stars
        vec2 sp = vec2(atan(vP.x, -vP.z) * 1.5915, y);
        float s = h21(floor(sp * vec2(80.0, 50.0)));
        if (s > 0.96) c += vec3(0.9, 0.95, 1.0) * ((s - 0.96) / 0.04) * (0.6 + 0.4 * sin(time * 4.0 + s * 20.0));
        float s2 = h21(floor(sp * vec2(160.0, 100.0) + 17.0));
        if (s2 > 0.985) c += vec3(1.0) * 0.7;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
}

// ------------------------------------------------------------------------------------------ build
export function buildTable() {
  const root = new THREE.Group();
  const holoMats = [];
  const energyMats = [];
  const glass = (c = 0x40e8ff, o = 0.38) => { const m = holographicMat(c, o); holoMats.push(m); return m; };
  const glassA = glass(0x40e8ff, 0.36);
  const glassB = glass(0x2080ff, 0.32);
  const glassP = glass(0xc040ff, 0.3);
  const edgeCyan = glow(0x40e8ff, 1.6);
  const edgePurp = glow(0xc040ff, 1.35);
  const chrome = std(0xc8d0d8, { metalness: 1, roughness: 0.18, envMapIntensity: 1.4 });
  const darkMetal = std(0x0a0c12, { metalness: 0.8, roughness: 0.4 });
  const orangeLit = std(0x1a0c06, { metalness: 0.6, roughness: 0.35, emissive: 0xff6a18, emissiveIntensity: 1.1 });

  // ---------- SPACE BACKDROP
  const space = new THREE.Group(); root.add(space);
  const skyMat = spaceSkyMat();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), skyMat); space.add(sky);
  // rusty planet (left, as in the art)
  const planetMat = std(0x6a3a28, { roughness: 0.9, metalness: 0.05, emissive: 0x1a0804, emissiveIntensity: 0.25 });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 16), planetMat);
  planet.position.set(-48, 8, -36); space.add(planet);
  const planetAtmo = new THREE.Mesh(new THREE.SphereGeometry(19.2, 16, 12), additive(0xff8040, 0.18, { side: THREE.BackSide }));
  planet.add(planetAtmo);
  // smaller cold moon
  const moon = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 12), std(0x4a5868, { roughness: 0.8 }));
  moon.position.set(36, 18, -50); space.add(moon);

  // ---------- CABINET SHELL
  const cab = grp(root);
  // underside / body
  part(cab, new THREE.BoxGeometry(22, 1.2, 30), darkMetal, 0, -0.7, -3);
  // side cheeks
  part(cab, new THREE.BoxGeometry(0.6, 2.2, 28), darkMetal, -8.2, 0.4, -3);
  part(cab, new THREE.BoxGeometry(0.6, 2.2, 28), darkMetal, 8.2, 0.4, -3);
  // cyan edge trim
  part(cab, new THREE.BoxGeometry(0.08, 0.12, 28), edgeCyan, -8.5, 1.45, -3);
  part(cab, new THREE.BoxGeometry(0.08, 0.12, 28), edgeCyan, 8.5, 1.45, -3);
  part(cab, new THREE.BoxGeometry(18, 0.12, 0.08), edgeCyan, 0, 1.45, 10.8);
  // backbox housing
  part(cab, new THREE.BoxGeometry(12, 8.4, 1.2), darkMetal, 0, 4.6, -17.6);
  part(cab, new THREE.BoxGeometry(12.3, 0.12, 0.12), edgeCyan, 0, 8.8, -16.95);
  part(cab, new THREE.BoxGeometry(12.3, 0.12, 0.12), edgeCyan, 0, 0.5, -16.95);
  part(cab, new THREE.BoxGeometry(0.12, 8.4, 0.12), edgeCyan, -6.15, 4.6, -16.95);
  part(cab, new THREE.BoxGeometry(0.12, 8.4, 0.12), edgeCyan, 6.15, 4.6, -16.95);

  // ---------- PLAYFIELD FLOOR (nebula + circuits + sigils)
  const pfMat = playfieldShader();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14.2, 24.5, 1, 1), pfMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(-0.2, 0.01, -3.5);
  // plane is in XY after rot, so scale already matches: width 14.2 along X, 24.5 along Z
  cab.add(floor);
  // raised sigil discs at the near corners (the "bottom-corner panels" in the art)
  function sigilPanel(x, z, rot = 0) {
    const g = grp(cab, x, 0.04, z);
    g.rotation.y = rot;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.85, 28), new THREE.MeshBasicMaterial({
      map: Tex.sigil(), transparent: true, opacity: 0.98, toneMapped: false, depthWrite: false
    }));
    disc.rotation.x = -Math.PI / 2; g.add(disc);
    part(g, new THREE.TorusGeometry(1.85, 0.04, 6, 24), edgeCyan, 0, 0.03, 0, Math.PI / 2);
    part(g, new THREE.TorusGeometry(1.15, 0.022, 6, 20), glow(0xff8a20, 1.05), 0, 0.04, 0, Math.PI / 2);
    return g;
  }
  sigilPanel(-5.4, 7.6, 0.2);
  sigilPanel(4.8, 7.6, -0.2);

  // ---------- HOLOGRAPHIC GLASS RAILS + RAMPS
  const rails = grp(cab);
  function tube(pts, r, mat, segs = 40) {
    const curve = makeCurve(pts, false);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, 8, false), mat);
    rails.add(mesh);
    return mesh;
  }
  function glowTube(pts, r, mat, segs = 32) {
    const curve = makeCurve(pts, false);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, 6, false), mat);
    rails.add(mesh);
    return mesh;
  }
  // outer left rail (playfield wall)
  const leftRail = [
    [-6.2, 0.45, 8.2], [-6.2, 0.45, 2], [-6.3, 0.5, -4], [-6.0, 0.55, -10],
    [-5.2, 0.6, -14.2], [-3.2, 0.65, -15.8], [0, 0.7, -16.4]
  ];
  // lower-right playfield rail joins the plunger-lane divider (closes the tight corridor)
  const rightLower = [
    [5.25, 0.45, 8.2], [5.25, 0.45, 2], [5.70, 0.45, -2]
  ];
  // upper-right playfield — starts left of the lane exit so the ball can roll out
  const rightUpper = [
    [3.9, 0.55, -12.4], [4.4, 0.6, -14.2], [2.6, 0.65, -15.8], [0, 0.7, -16.4]
  ];
  tube(leftRail, 0.11, glassA, 48);
  tube(rightLower, 0.11, glassA, 24);
  tube(rightUpper, 0.11, glassA, 32);
  glowTube(leftRail, 0.16, additive(0x40e8ff, 0.28), 32);
  glowTube(rightLower, 0.16, additive(0x40e8ff, 0.28), 18);
  glowTube(rightUpper, 0.16, additive(0x40e8ff, 0.28), 24);

  // plunger lane glass — divider ends as a one-way tip; right wall guides up and slightly in
  tube([[6.0, 0.4, 8.4], [6.0, 0.4, -2], [6.0, 0.45, -8.6]], 0.09, glassB, 24);
  tube([[7.15, 0.4, 8.4], [7.15, 0.4, -2], [7.05, 0.45, -7], [6.85, 0.5, -9.2]], 0.09, glassB, 24);

  // LEFT holographic ramp — a soaring glass arc toward the rift diorama
  const rampL = [
    [-3.8, 0.35, 3.5], [-4.6, 0.9, 0.5], [-5.3, 1.6, -3.5], [-5.5, 2.0, -7.0],
    [-5.1, 1.5, -9.2], [-4.55, 0.55, -10.6]
  ];
  tube(rampL, 0.2, glassA, 48);
  glowTube(rampL, 0.28, additive(0x40e8ff, 0.18), 32);
  // ramp floor ribbon (walkable/rollable visual)
  tube(rampL, 0.32, glass(0x88f0ff, 0.16), 32);

  // RIGHT holographic ramp — swirling toward the city
  const rampR = [
    [2.8, 0.35, 3.2], [3.6, 1.0, 0.2], [4.2, 1.7, -3.8], [4.5, 2.1, -7.0],
    [4.0, 1.5, -9.2], [3.45, 0.55, -10.6]
  ];
  tube(rampR, 0.2, glassP, 48);
  glowTube(rampR, 0.28, additive(0xc040ff, 0.16), 32);
  tube(rampR, 0.32, glass(0xc080ff, 0.16), 32);

  // angular glass blocks near the flippers (as in the concept, geometric transparent structures)
  function glassBlock(x, y, z, sx, sy, sz, rotY = 0, mat = glassA) {
    const m = part(rails, new THREE.BoxGeometry(1, 1, 1), mat, x, y, z, 0, rotY, 0, sx, sy, sz);
    // edge glow frame
    const e = glow(mat === glassP ? 0xc040ff : 0x40e8ff, 1.3);
    part(rails, new THREE.BoxGeometry(sx + 0.02, 0.03, 0.03), e, x, y + sy / 2, z + sz / 2, 0, rotY);
    part(rails, new THREE.BoxGeometry(sx + 0.02, 0.03, 0.03), e, x, y + sy / 2, z - sz / 2, 0, rotY);
    return m;
  }
  glassBlock(-3.6, 0.55, 3.8, 1.8, 1.1, 0.16, 0.35);
  glassBlock(-2.6, 0.7, 2.2, 1.2, 1.5, 0.14, 0.15);
  glassBlock(3.1, 0.55, 3.6, 1.7, 1.1, 0.16, -0.3, glassP);
  glassBlock(2.3, 0.7, 2.0, 1.2, 1.5, 0.14, -0.15, glassP);
  // mid-field gates
  glassBlock(-2.2, 0.85, -3.2, 0.18, 1.7, 2.2, 0.1);
  glassBlock(1.8, 0.85, -3.2, 0.18, 1.7, 2.2, -0.1, glassP);

  // ---------- ENERGY STREAMS (living purple / blue lightning)
  const streams = grp(cab);
  const streamDefs = [];
  function addStream(pts, colA, colB, radius = 0.18) {
    const curve = makeCurve(pts, false);
    const mat = energyMat(colA, colB); energyMats.push(mat);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, radius, 8, false), mat);
    streams.add(mesh);
    const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, radius * 0.28, 6, false), additive(colA, 0.28));
    streams.add(core);
    streamDefs.push({ mesh, core, mat, pts, curve });
    return mat;
  }
  // main cross-playfield river (city → center → rift), as in the art
  // Rivers stay in mid-playfield or hug the side windows — never arc across the SCORE panel
  const streamMain = addStream([
    [7.2, 1.05, -7.5], [5.0, 1.35, -5.5], [2.6, 1.2, -2.0], [0.2, 1.15, 1.6],
    [-2.4, 1.25, -2.0], [-4.8, 1.4, -7.0], [-7.6, 1.05, -9.0]
  ], 0x3a28e0, 0x9010e8, 0.16);
  addStream([
    [6.6, 0.85, -3.0], [5.0, 1.25, -5.5], [4.2, 1.5, -8.2], [5.6, 1.1, -11.0]
  ], 0x4a20c8, 0x7020ff, 0.1);
  addStream([
    [-6.0, 0.8, 1.2], [-4.4, 1.25, -2.2], [-4.9, 1.55, -7.0], [-6.6, 1.1, -10.0]
  ], 0x2818c8, 0x4070ff, 0.1);
  addStream([
    [-5.2, 0.85, 3.2], [-2.2, 1.2, 1.0], [0.4, 1.35, -0.6], [3.0, 1.15, -3.0], [5.6, 0.8, -6.0]
  ], 0x5810d8, 0x3040e8, 0.09);

  // lightning bolts (flashed in update)
  const bolts = [];
  function makeBolt(from, to, color = 0xccf4ff) {
    const pts = [];
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      if (i > 0 && i < n) p.add(new THREE.Vector3(rnd(-0.4, 0.4), rnd(-0.25, 0.25), rnd(-0.4, 0.4)));
      pts.push(p);
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, toneMapped: false }));
    streams.add(line);
    bolts.push({ line, from, to, color, t: 0, next: rnd(0.6, 2.4) });
    return line;
  }
  makeBolt([-8, 6, -10], [-4, 1.2, -8], 0x80d8ff);
  makeBolt([-10, 7, -6], [-5, 1.5, -11], 0x60a0ff);
  makeBolt([-7, 8, -14], [-5, 2.0, -11], 0x70c0ff);
  makeBolt([6, 5, -12], [4, 1.4, -9], 0xb060ff);
  makeBolt([8, 6, -7], [5, 1.6, -10], 0x9020e0);

  // ---------- LEFT DIORAMA: The Rift (cyan floating islands, dark tree, storm)
  const riftD = grp(root, -12.0, -2.0, -6);
  // glowing window frame (angled, as in the art)
  const frameL = grp(root, -8.4, 3.2, -5);
  frameL.rotation.y = 0.55; frameL.rotation.z = -0.08;
  const frameMat = edgeCyan;
  // trapezoid-ish frame
  part(frameL, new THREE.BoxGeometry(0.12, 9.2, 0.12), frameMat, -5.2, 0, 0);
  part(frameL, new THREE.BoxGeometry(0.12, 9.2, 0.12), frameMat, 5.2, 0, 0);
  part(frameL, new THREE.BoxGeometry(10.6, 0.12, 0.12), frameMat, 0, 4.6, 0);
  part(frameL, new THREE.BoxGeometry(10.6, 0.12, 0.12), frameMat, 0, -4.6, 0);
  // inner faint glass pane (very transparent, so the 3D world reads through)
  const paneL = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 9.0), additive(0x40e8ff, 0.06, { side: THREE.DoubleSide }));
  frameL.add(paneL);

  // storm volume behind / inside
  const storm = new THREE.Mesh(new THREE.SphereGeometry(14, 12, 8), new THREE.MeshBasicMaterial({
    color: 0x082028, transparent: true, opacity: 0.45, side: THREE.BackSide, depthWrite: false
  }));
  storm.position.set(-2, 3, -6); riftD.add(storm);
  // islands
  const islandPoses = [
    [0, 0, 0, 2.8, 2.6], [3.4, -1.1, 2.6, 1.5, 1.7], [-3.0, -0.7, 3.4, 1.7, 2.0],
    [1.9, -2.2, 5.6, 2.0, 2.5], [-3.6, -2.6, 6.4, 1.4, 2.1], [4.6, -1.6, -1.4, 1.2, 1.6],
    [-1.4, -3.4, 8.6, 2.3, 3.0], [2.8, -4.0, 9.2, 1.3, 2.3], [-4.4, -1.3, -2.0, 1.15, 1.5],
    [0.6, -5.0, 12.2, 2.8, 3.4], [-5.2, -3.5, 4.2, 1.05, 1.9], [5.6, -2.8, 4.6, 1.15, 1.8],
    [0.8, -1.6, 2.0, 1.0, 1.3], [-2.2, -4.6, 10.5, 1.2, 2.0], [4.0, -3.8, 7.5, 1.1, 1.9],
    [-6.0, -2.4, 1.0, 0.9, 1.4], [6.2, -4.2, 8.0, 1.0, 1.7], [-0.6, -6.2, 14.5, 1.8, 2.4]
  ];
  for (const [x, y, z, r, h] of islandPoses) {
    const isl = buildIsland(r, h, 0x163848);
    isl.position.set(x, y, z); riftD.add(isl);
  }
  // far-field instanced mesas to fill the storm world
  const farPoses = [];
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2 + 0.4;
    const rad = 9 + (i % 5) * 1.6;
    farPoses.push({
      x: Math.cos(a) * rad, y: -4.5 - (i % 4) * 0.7, z: 8 + Math.sin(a) * rad * 0.6,
      sx: 0.6 + (i % 3) * 0.25, sy: 1.2 + (i % 4) * 0.3, sz: 0.6 + (i % 3) * 0.25,
    });
  }
  riftD.add(instanced(new THREE.ConeGeometry(1, 1, 6), std(0x102028, { roughness: 0.86 }), farPoses.map(o => ({ ...o, rx: Math.PI }))));
  const tree = buildDarkTree(1.85);
  tree.position.set(0.15, 0.05, -0.4); riftD.add(tree);
  // cyan water-sheen / mist on nearer islands
  for (const [x, y, z, r] of [[0, 0.12, 0, 2.4], [1.9, -2.08, 5.6, 1.5], [0.6, -4.88, 12.2, 2.2], [-1.4, -3.28, 8.6, 1.8]]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(r, 14), additive(0x40e8ff, 0.2, { side: THREE.DoubleSide }));
    w.rotation.x = -Math.PI / 2; w.position.set(x, y, z); riftD.add(w);
  }
  // low storm mist sheet
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(28, 28), additive(0x2080a0, 0.12, { side: THREE.DoubleSide }));
  mist.rotation.x = -Math.PI / 2; mist.position.set(0, -4.2, 6); riftD.add(mist);
  // storm point light (flashes with lightning)
  const stormLight = new THREE.PointLight(0xa0e8ff, 0.6, 28, 2);
  stormLight.position.set(-2, 8, -4); riftD.add(stormLight);
  const riftFill = new THREE.PointLight(0x40e8ff, 1.3, 22, 2);
  riftFill.position.set(0, 3, 2); riftD.add(riftFill);

  // ---------- RIGHT DIORAMA: The Reach (purple future city, flying ships)
  const reachD = grp(root, 16.5, -8.0, -7);
  const frameR = grp(root, 9.6, 3.0, -5);
  frameR.rotation.y = -0.55; frameR.rotation.z = 0.08;
  part(frameR, new THREE.BoxGeometry(0.12, 9.2, 0.12), edgePurp, -5.2, 0, 0);
  part(frameR, new THREE.BoxGeometry(0.12, 9.2, 0.12), edgePurp, 5.2, 0, 0);
  part(frameR, new THREE.BoxGeometry(10.6, 0.12, 0.12), edgePurp, 0, 4.6, 0);
  part(frameR, new THREE.BoxGeometry(10.6, 0.12, 0.12), edgePurp, 0, -4.6, 0);
  const paneR = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 9.0), additive(0xc040ff, 0.07, { side: THREE.DoubleSide }));
  frameR.add(paneR);

  // city towers — mix of unique and instanced
  const towers = [];
  const towerPts = [
    [2, 0, 0, 22, 2.6], [5, 0, 3, 16, 2.1], [7, 0, -2, 19, 2.3],
    [9, 0, 1, 13, 1.9], [4, 0, -5, 17, 2.1], [6, 0, 6, 11, 1.7],
    [11, 0, 4, 14, 1.9], [8, 0, 8, 10, 1.5], [12, 0, -3, 15, 1.8],
    [3.5, 0, -3, 24, 2.9], [10, 0, -6, 16, 2.1], [14, 0, 2, 18, 2.3],
    [13, 0, 7, 9, 1.5], [16, 0, 0, 12, 1.7], [8, 0, 12, 8, 1.4],
    [5, 0, 11, 9, 1.5], [18, 0, 5, 10, 1.6], [15, 0, -5, 14, 1.8],
    [7, 0, -8, 12, 1.6], [20, 0, 3, 11, 1.7], [17, 0, 9, 8, 1.4],
    [11, 0, 10, 9, 1.5], [4, 0, 8, 13, 1.8], [19, 0, -2, 15, 1.9],
    [22, 0, 6, 9, 1.5], [9, 0, -10, 11, 1.6], [13, 0, 14, 7, 1.3],
    // closer cluster, still safely right of the playfield (reachD.x = 16.5)
    [0.8, 0, 2, 18, 2.2], [1.2, 0, 5, 14, 1.8], [0.5, 0, -2, 16, 2.0],
    [2.2, 0, 7, 12, 1.6], [1.6, 0, -4, 15, 1.9], [0.2, 0, 8, 11, 1.5],
    [3.0, 0, 1, 20, 2.4], [1.0, 0, 10, 9, 1.4]
  ];
  const pals = [0x1a0820, 0x12081c, 0x18061a, 0x0e0614, 0x160820];
  for (let i = 0; i < towerPts.length; i++) {
    const [x, y, z, h, w] = towerPts[i];
    const tw = buildTower(h, w, pals[i % pals.length], i % 4);
    tw.position.set(x, y, z); reachD.add(tw); towers.push(tw);
  }
  // ground plane of the city (deep below)
  const cityFloor = new THREE.Mesh(new THREE.CircleGeometry(28, 24), new THREE.MeshStandardMaterial({
    color: 0x08010e, roughness: 0.7, metalness: 0.3, map: Tex.grid(8), emissive: 0x1a0420, emissiveIntensity: 0.35
  }));
  cityFloor.rotation.x = -Math.PI / 2; cityFloor.position.y = -0.05; reachD.add(cityFloor);
  // flying ships
  const ships = [];
  for (let i = 0; i < 16; i++) {
    const s = buildFlyer(0.65 + Math.random() * 0.7, pick([0xc040ff, 0x8020ff, 0x40e8ff, 0xff40c0]));
    s.userData.path = {
      c: new THREE.Vector3(rnd(-4, 10), rnd(5, 18), rnd(-6, 10)),
      rx: rnd(5, 11), rz: rnd(5, 12), phase: rnd(0, 6.28), speed: rnd(0.18, 0.45), yw: rnd(0.4, 1.2)
    };
    reachD.add(s); ships.push(s);
  }
  // city energy swirl
  const cityStream = energyMat(0xb030ff, 0x4030e0); energyMats.push(cityStream);
  const cityCurve = makeCurve([
    [8, 8, -2], [4, 12, 2], [0, 10, 6], [-3, 7, 3], [0, 5, -2], [5, 8, -4], [8, 8, -2]
  ], true);
  reachD.add(new THREE.Mesh(new THREE.TubeGeometry(cityCurve, 64, 0.18, 8, true), cityStream));
  const cityLight = new THREE.PointLight(0xc040ff, 1.6, 30, 2);
  cityLight.position.set(0, 10, 2); reachD.add(cityLight);
  const cityFill = new THREE.PointLight(0x8020ff, 0.9, 24, 2);
  cityFill.position.set(6, 6, 6); reachD.add(cityFill);

  // ---------- BACKGLASS (painted texture derived from table-ref.png: faces, ring, title, bezel)
  const BG_W = 11.0, BG_H = BG_W / 1.3061224489795917; // match art aspect
  const bg = grp(root, 0, 5.15, -16.95);
  const bgTex = new THREE.TextureLoader().load('./assets/backglass.jpg', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true;
    if (artMat) artMat.needsUpdate = true;
  });
  bgTex.colorSpace = THREE.SRGBColorSpace;
  const artMat = new THREE.MeshBasicMaterial({ map: bgTex, toneMapped: true });
  // backing plate
  part(bg, new THREE.BoxGeometry(BG_W + 0.2, BG_H + 0.2, 0.08), std(0x080614, { roughness: 0.5, metalness: 0.25 }), 0, 0, 0.08);
  const art = new THREE.Mesh(new THREE.PlaneGeometry(BG_W, BG_H), artMat);
  art.position.set(0, 0, 0.14); bg.add(art);
  // holographic cyan frame, as in the art
  const frameM = glow(0x40e8ff, 1.15);
  part(bg, new THREE.BoxGeometry(BG_W + 0.18, 0.08, 0.08), frameM, 0, BG_H / 2 + 0.02, 0.16);
  part(bg, new THREE.BoxGeometry(BG_W + 0.18, 0.08, 0.08), frameM, 0, -BG_H / 2 - 0.02, 0.16);
  part(bg, new THREE.BoxGeometry(0.08, BG_H + 0.18, 0.08), frameM, -BG_W / 2 - 0.02, 0, 0.16);
  part(bg, new THREE.BoxGeometry(0.08, BG_H + 0.18, 0.08), frameM, BG_W / 2 + 0.02, 0, 0.16);
  // live SCORE digits over the painted bezel window (UV well: u 0.242-0.768, v 0.110-0.204)
  const scoreW = 0.5254 * BG_W, scoreH = 0.0944 * BG_H;
  const scoreX = (0.5049 - 0.5) * BG_W;
  const scoreY = (0.1569 - 0.5) * BG_H;
  const scoreTex = Tex.digits('SCORE:  0', '#ff9a2a');
  const scoreMesh = new THREE.Mesh(new THREE.PlaneGeometry(scoreW, scoreH), new THREE.MeshBasicMaterial({ map: scoreTex, transparent: true, toneMapped: false }));
  scoreMesh.position.set(scoreX, scoreY, 0.18); bg.add(scoreMesh);
  const bgLight = new THREE.PointLight(0xff6a20, 0.45, 10, 2); bgLight.position.set(0, 0.4, 1.6); bg.add(bgLight);
  const bgCyan = new THREE.PointLight(0x40e8ff, 0.35, 8, 2); bgCyan.position.set(0, 2.6, 1.2); bg.add(bgCyan);

  function setScore(n) {
    const s = 'SCORE:  ' + (n | 0).toLocaleString('en-US');
    const nt = Tex.digits(s, '#ff9a2a');
    const old = scoreMesh.material.map;
    scoreMesh.material.map = nt; scoreMesh.material.needsUpdate = true;
    if (old) old.dispose();
  }

  // ---------- FLIPPERS (orange-lit, chunky, glowing bands)
  function buildFlipper(side) {
    const g = new THREE.Group();
    // paddle body
    const body = part(g, new THREE.BoxGeometry(1.7, 0.22, 0.42), orangeLit, 0.85, 0.12, 0);
    // slightly tapered tip
    part(g, new THREE.BoxGeometry(0.35, 0.18, 0.32), orangeLit, 1.65, 0.12, 0);
    // orange light strip on top
    part(g, new THREE.BoxGeometry(1.65, 0.04, 0.18), glow(0xff8a20, 2.2), 0.85, 0.24, 0);
    part(g, new THREE.BoxGeometry(1.65, 0.04, 0.06), glow(0xffe0a0, 2.8), 0.85, 0.26, 0);
    // pivot hub
    part(g, new THREE.CylinderGeometry(0.22, 0.22, 0.28, 12), chrome, 0, 0.12, 0);
    part(g, new THREE.CylinderGeometry(0.1, 0.1, 0.32, 10), glow(0xff8a20, 1.8), 0, 0.12, 0);
    const light = new THREE.PointLight(0xff8a20, 0.9, 4, 2); light.position.set(0.8, 0.4, 0); g.add(light);
    g.userData.body = body; g.userData.light = light; g.userData.side = side;
    return g;
  }
  const flipL = buildFlipper(-1); flipL.position.set(-1.9, 0, 6.45); cab.add(flipL);
  const flipR = buildFlipper(1); flipR.position.set(1.55, 0, 6.45); flipR.scale.x = -1; cab.add(flipR);
  // Angle convention: 0 = along +X (left) / -X (right, via scale.x=-1). Positive angle swings tips toward -Z (up the table).
  // Three.js left rotation.y = angle; right rotation.y = -angle (because of scale.x = -1).
  const FLIP_REST_L = -0.42, FLIP_UP_L = 0.72;
  const FLIP_REST_R = -0.42, FLIP_UP_R = 0.72;
  flipL.rotation.y = FLIP_REST_L; flipR.rotation.y = -FLIP_REST_R;

  // ---------- CHROME PLUNGER (right lane) + dramatic foreground housing
  const plungerGrp = grp(cab, 6.57, 0.25, 8.05);
  const plungerRod = part(plungerGrp, new THREE.CylinderGeometry(0.09, 0.09, 2.4, 12), chrome, 0, 0, 0, Math.PI / 2);
  plungerRod.position.set(0, 0.05, 0.6);
  const plungerKnob = part(plungerGrp, new THREE.SphereGeometry(0.2, 12, 8), chrome, 0, 0.05, 1.75);
  part(plungerGrp, new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), std(0x2a2a30, { metalness: 0.9, roughness: 0.3 }), 0, 0.05, 1.45, Math.PI / 2);
  // housing / spring well
  part(cab, new THREE.BoxGeometry(0.9, 0.5, 1.6), darkMetal, 6.57, 0.2, 8.6);
  part(cab, new THREE.BoxGeometry(0.94, 0.06, 1.64), edgeCyan, 6.57, 0.46, 8.6);

  // ---------- BUMPERS, SLINGS, TARGETS, PORTALS
  const bumpers = [];
  function buildBumper(x, z, color = 0x40e8ff) {
    const g = grp(cab, x, 0, z);
    part(g, new THREE.CylinderGeometry(0.55, 0.62, 0.16, 14), darkMetal, 0, 0.08, 0);
    const cap = part(g, new THREE.CylinderGeometry(0.48, 0.48, 0.55, 14), glass(color, 0.5), 0, 0.42, 0);
    part(g, new THREE.TorusGeometry(0.5, 0.05, 6, 16), glow(color, 1.8), 0, 0.22, 0, Math.PI / 2);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), additive(color, 0.0, { map: Tex.ring(), side: THREE.DoubleSide }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; g.add(halo);
    const light = new THREE.PointLight(color, 0, 5, 2); light.position.y = 0.6; g.add(light);
    const b = { x, z, r: 0.62, group: g, cap, halo, light, color, flash: 0, kick: 15 };
    bumpers.push(b);
    return b;
  }
  buildBumper(-0.15, -7.6, 0x40e8ff);
  buildBumper(-1.85, -5.7, 0xc040ff);
  buildBumper(1.55, -5.7, 0xff8a20);

  // slingshot wedges near flippers
  const slings = [];
  function buildSling(x, z, dir) {
    // triangular rubber — visual as a glass/orange wedge
    const g = grp(cab, x, 0, z);
    const w = part(g, new THREE.BoxGeometry(0.16, 0.4, 1.8), orangeLit, 0, 0.22, 0, 0, dir * 0.5, 0);
    const light = new THREE.PointLight(0xff8a20, 0, 3, 2); light.position.y = 0.4; g.add(light);
    slings.push({ x, z, dir, group: g, light, flash: 0, nx: Math.cos(dir * 0.5 + Math.PI / 2 * Math.sign(dir) || -1), nz: Math.sin(dir * 0.5 + Math.PI / 2 * Math.sign(dir) || -1) });
    return slings[slings.length - 1];
  }
  // We'll collide slings as wall segments defined below; these are visuals
  const slingL = buildSling(-3.15, 4.15, 1);
  const slingR = buildSling(2.75, 4.15, -1);

  // stand-up targets (top row)
  const targets = [];
  function buildTarget(x, z, color = 0xff8a20) {
    const g = grp(cab, x, 0, z);
    part(g, new THREE.BoxGeometry(0.55, 0.7, 0.12), darkMetal, 0, 0.4, 0);
    const face = part(g, new THREE.BoxGeometry(0.45, 0.5, 0.06), glow(color, 0.8), 0, 0.42, 0.08);
    const t = { x, z, r: 0.4, group: g, face, color, down: false, flash: 0 };
    targets.push(t);
    return t;
  }
  buildTarget(-3.4, -14.2, 0x40e8ff);
  buildTarget(-1.6, -15.0, 0xc040ff);
  buildTarget(0.0, -15.3, 0xff8a20);
  buildTarget(1.5, -15.0, 0xc040ff);
  buildTarget(3.1, -14.2, 0x40e8ff);

  // PORTALS (saucers at the threshold of each diorama)
  function buildPortal(x, z, color, label) {
    const g = grp(cab, x, 0, z);
    part(g, new THREE.TorusGeometry(0.85, 0.08, 8, 24), glow(color, 1.2), 0, 0.06, 0, Math.PI / 2);
    part(g, new THREE.TorusGeometry(0.62, 0.04, 6, 20), glow(color, 0.7), 0, 0.08, 0, Math.PI / 2);
    const well = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), additive(color, 0.25, { map: Tex.ring(), side: THREE.DoubleSide }));
    well.rotation.x = -Math.PI / 2; well.position.y = 0.04; g.add(well);
    // vortex swirl
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(0.65, 20), additive(color, 0.0, { map: Tex.sigil(), side: THREE.DoubleSide }));
    swirl.rotation.x = -Math.PI / 2; swirl.position.y = 0.07; g.add(swirl);
    const light = new THREE.PointLight(color, 0.2, 6, 2); light.position.y = 0.6; g.add(light);
    const labTex = Tex.sign(label, '#ffffff');
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.4), new THREE.MeshBasicMaterial({ map: labTex, transparent: true, toneMapped: false, depthWrite: false }));
    lab.position.set(0, 1.15, 0); g.add(lab);
    return { x, z, r: 0.75, group: g, well, swirl, light, color, lit: false, charge: 0, label };
  }
  const portalRift = buildPortal(-4.55, -10.6, 0x40e8ff, 'THE RIFT');
  const portalReach = buildPortal(3.45, -10.6, 0xc040ff, 'THE REACH');
  const portalReentry = buildPortal(0.05, -12.85, 0xff8a20, 'RE-ENTRY');

  // High-end toys, multi-level rails, lid, mini-playfield (needs ramp paths as enter fallbacks)
  const feat = buildTableFeatures(cab, { BALL_R, rampL, rampR });

  // ---------- COLLISION LAYOUT: fully enclosed cabinet, no void exits
  const walls = enclosedWalls();
  const slingsPhys = slingSegments();
  const rampPaths = feat.paths;

  const layout = {
    walls,
    posts: feat.posts,
    bumpers: bumpers,
    slings: slingsPhys,
    flipL: { x: -1.9, z: 6.45, rest: FLIP_REST_L, up: FLIP_UP_L, len: 1.7, thick: 0.22, sign: 1, side: 'L', upRate: 36, downRate: 22 },
    flipR: { x: 1.55, z: 6.45, rest: FLIP_REST_R, up: FLIP_UP_R, len: 1.7, thick: 0.22, sign: -1, side: 'R', upRate: 36, downRate: 22 },
    miniFlip: feat.miniFlipSpec,
    plunger: { x: 6.57, z: 7.15, exitZ: -7.8, exitX: 5.92, reenterX: 6.05, reenterZ: -7.4 },
    drain: { x0: -1.55, x1: 1.25, z: 8.55 },
    paths: feat.paths,
    standups: feat.standups,
    drops: feat.drops,
    rollovers: feat.rollovers,
    spinner: feat.spinner,
    saucer: feat.saucer,
    kickback: feat.kickback,
    captive: feat.captive,
    magnet: feat.magnet,
    diverterSw: feat.diverterSw,
    miniZone: feat.miniZone,
    miniBumper: feat.miniBumper,
  };

  // DMD strip sitting on the backglass, just under the painted SCORE well
  const dmd = feat.makeDmd(bg, 0, scoreY - scoreH * 1.15, 0.19, 7.2, 1.05);

  // ---------- LIGHTS (playfield)
  const key = new THREE.PointLight(0xa0d0ff, 1.4, 30, 2); key.position.set(0, 8, 2); root.add(key);
  const fill = new THREE.HemisphereLight(0x6080c0, 0x100818, 0.55); root.add(fill);
  const rimL = new THREE.PointLight(0x40e8ff, 0.8, 16, 2); rimL.position.set(-7, 4, -4); root.add(rimL);
  const rimR = new THREE.PointLight(0xc040ff, 0.8, 16, 2); rimR.position.set(7, 4, -4); root.add(rimR);

  // ---------- state for animation
  const state = {
    flash: 0, stormT: 0, stormOn: 0,
    portalPull: { rift: 0, reach: 0, reentry: 0 },
  };

  function flashBumper(b, strength = 1) {
    b.flash = Math.max(b.flash, strength);
    b.light.intensity = 4 * strength;
    b.halo.material.opacity = 0.85 * strength;
    state.flash = Math.max(state.flash, 0.7 * strength);
  }
  function setPortalLit(which, lit) {
    const p = which === 'rift' ? portalRift : which === 'reach' ? portalReach : portalReentry;
    if (!p) return;
    p.lit = lit;
    p.light.intensity = lit ? 2.4 : 0.2;
    p.well.material.opacity = lit ? 0.7 : 0.25;
  }

  function update(t, dt) {
    // holo scan
    for (const m of holoMats) m.userData.time.value = t;
    for (const m of energyMats) m.uniforms.time.value = t;
    pfMat.uniforms.time.value = t;
    pfMat.uniforms.flash.value = state.flash;
    skyMat.uniforms.time.value = t;
    state.flash = Math.max(0, state.flash - dt * 1.8);

    // portal pull visuals
    state.portalPull.rift = damp(state.portalPull.rift, portalRift.lit ? 1 : 0, 3, dt);
    state.portalPull.reach = damp(state.portalPull.reach, portalReach.lit ? 1 : 0, 3, dt);
    state.portalPull.reentry = damp(state.portalPull.reentry || 0, portalReentry.lit ? 1 : 0, 3, dt);
    const pull = Math.max(state.portalPull.rift, state.portalPull.reach);
    streamMain.uniforms.pull.value = pull;
    for (const m of energyMats) m.uniforms.pull.value = Math.max(m.uniforms.pull.value * 0.9, pull * 0.7);

    // swirl portals
    portalRift.swirl.rotation.z += dt * (portalRift.lit ? 2.4 : 0.4);
    portalReach.swirl.rotation.z -= dt * (portalReach.lit ? 2.4 : 0.4);
    portalReentry.swirl.rotation.z += dt * (portalReentry.lit ? 2.8 : 0.35);
    portalRift.swirl.material.opacity = 0.15 + state.portalPull.rift * 0.7;
    portalReach.swirl.material.opacity = 0.15 + state.portalPull.reach * 0.7;
    portalReentry.swirl.material.opacity = 0.15 + (state.portalPull.reentry || 0) * 0.7;
    portalRift.group.scale.setScalar(1 + Math.sin(t * 3) * 0.03 * (portalRift.lit ? 1 : 0.3));
    portalReach.group.scale.setScalar(1 + Math.sin(t * 3 + 1) * 0.03 * (portalReach.lit ? 1 : 0.3));
    portalReentry.group.scale.setScalar(1 + Math.sin(t * 3 + 2) * 0.03 * (portalReentry.lit ? 1 : 0.3));

    // bumpers idle pulse + flash decay
    for (const b of bumpers) {
      b.flash = Math.max(0, b.flash - dt * 3);
      b.light.intensity = damp(b.light.intensity, 0.25 + Math.sin(t * 4 + b.x) * 0.1 + b.flash * 4, 10, dt);
      b.halo.material.opacity = damp(b.halo.material.opacity, 0.12 + b.flash * 0.7, 10, dt);
      b.group.scale.setScalar(1 + b.flash * 0.18);
    }
    for (const s of slings) {
      s.flash = Math.max(0, s.flash - dt * 4);
      s.light.intensity = s.flash * 3;
    }

    // lightning
    state.stormOn = Math.max(0, state.stormOn - dt * 6);
    stormLight.intensity = 0.4 + state.stormOn * 8;
    for (const b of bolts) {
      b.next -= dt;
      if (b.next <= 0) {
        b.t = 0.12 + Math.random() * 0.08;
        b.next = rnd(0.7, 2.8);
        // jitter geometry
        const a = new THREE.Vector3(...b.from), c = new THREE.Vector3(...b.to);
        const arr = b.line.geometry.attributes.position.array;
        const n = arr.length / 3 - 1;
        for (let i = 0; i <= n; i++) {
          const p = a.clone().lerp(c, i / n);
          if (i > 0 && i < n) p.add(new THREE.Vector3(rnd(-0.45, 0.45), rnd(-0.3, 0.3), rnd(-0.45, 0.45)));
          arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
        }
        b.line.geometry.attributes.position.needsUpdate = true;
        if (b.from[0] < 0) state.stormOn = 1;
      }
      b.t = Math.max(0, b.t - dt);
      b.line.material.opacity = b.t > 0 ? Math.min(1, b.t * 10) : 0;
    }

    // insert light chase
    if (feat.inserts) {
      const ins = feat.inserts;
      const n = ins.pts.length;
      for (let i = 0; i < n; i++) {
        ins.flash[i] = Math.max(0, ins.flash[i] - dt * 2.8);
        const chase = 0.25 + 0.75 * Math.max(0, Math.sin(t * 6 + i * 0.45));
        const pulse = 0.35 + chase * 0.5 + ins.flash[i];
        ins.dummy.position.set(ins.pts[i][0], 0.03, ins.pts[i][1]);
        ins.dummy.rotation.x = -Math.PI / 2;
        ins.dummy.scale.setScalar(0.85 + ins.flash[i] * 0.6);
        ins.dummy.updateMatrix();
        ins.mesh.setMatrixAt(i, ins.dummy.matrix);
      }
      ins.mesh.instanceMatrix.needsUpdate = true;
    }
    // bumper lightning arcs
    for (const a of feat.arcs) {
      a.t = Math.max(0, a.t - dt);
      a.line.material.opacity = a.t > 0 ? Math.min(1, a.t * 8) : 0;
    }
    // spinning rift orb
    if (feat.orb) {
      feat.orb.group.rotation.y += dt * 0.8;
      feat.orb.ring.rotation.x += dt * 1.3;
      feat.orb.ring2.rotation.z -= dt * 1.6;
      feat.orb.core.position.y = 0.7 + Math.sin(t * 2.2) * 0.08;
    }
    // diverter arm
    if (feat.diverter) {
      const want = feat.diverter._want || 0;
      feat.diverter.arm.rotation.y = damp(feat.diverter.arm.rotation.y, want ? 0.7 : -0.55, 8, dt);
    }
    // spinner
    if (feat.spinner && feat.spinner.arm) {
      feat.spinner.arm.rotation.y = feat.spinner.angle || 0;
    }
    // captive ball mesh
    if (feat.captive && feat.captive.mesh) {
      feat.captive.mesh.position.set(0, 0.3, feat.captive.ballZ + 1.2);
    }
    // magnet pulse
    if (feat.magnet) {
      const on = !!feat.magnet.on;
      feat.magnet.light.intensity = damp(feat.magnet.light.intensity, on ? 2.2 : 0.15, 8, dt);
      feat.magnet.core.material.opacity = on ? 0.7 + Math.sin(t * 10) * 0.2 : 0.2;
    }
    // kickback lamp
    if (feat.kickback && feat.kickback.face) {
      feat.kickback.face.material.color.setHex(feat.kickback.lit ? 0x80ffff : 0x143040);
    }
    // drop / standup lamps
    for (const d of feat.drops) {
      d.group.visible = !d.down;
    }
    for (const s of feat.standups) {
      if (s.face && s.face.material) s.face.material.color.setHex(s.lit ? 0xa0ffe8 : 0x164050);
    }
    for (const r of feat.rollovers) {
      if (r.lamp && r.lamp.material) r.lamp.material.color.setHex(r.lit ? 0xffc070 : 0x3a2010);
    }

    // ships
    for (const s of ships) {
      const p = s.userData.path;
      const a = t * p.speed + p.phase;
      s.position.set(p.c.x + Math.cos(a) * p.rx, p.c.y + Math.sin(a * p.yw) * 1.4, p.c.z + Math.sin(a) * p.rz);
      s.lookAt(p.c.x + Math.cos(a + 0.2) * p.rx, s.position.y, p.c.z + Math.sin(a + 0.2) * p.rz);
    }

    // tree slight sway
    tree.rotation.z = Math.sin(t * 0.4) * 0.03;
    tree.rotation.x = Math.sin(t * 0.3) * 0.02;
  }

  function trackBall(x, z) {
    if (!feat.head) return;
    const dx = x - 2.55, dz = z + 8.35;
    feat.head.eye.rotation.y = clamp(-Math.atan2(dx, 3), -0.55, 0.55);
    feat.head.eye.rotation.x = clamp(Math.atan2(-(dz), 4) * 0.4, -0.35, 0.35);
  }
  function flashInserts(kind) {
    if (!feat.inserts) return;
    for (let i = 0; i < feat.inserts.flash.length; i++) {
      if (kind === 'all' || (kind === 'chase' && i % 2 === 0)) feat.inserts.flash[i] = 1;
    }
  }
  function flashArcs() {
    for (const a of feat.arcs) {
      a.t = 0.16;
      const arr = a.line.geometry.attributes.position.array;
      const n = arr.length / 3 - 1;
      const ax = a.from[0], ay = a.from[1], az = a.from[2];
      const bx = a.to[0], by = a.to[1], bz = a.to[2];
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        arr[i * 3] = ax + (bx - ax) * u + (i && i < n ? (Math.random() - 0.5) * 0.5 : 0);
        arr[i * 3 + 1] = ay + (by - ay) * u + (i && i < n ? Math.random() * 0.4 : 0);
        arr[i * 3 + 2] = az + (bz - az) * u + (i && i < n ? (Math.random() - 0.5) * 0.5 : 0);
      }
      a.line.geometry.attributes.position.needsUpdate = true;
    }
  }

  return {
    root, space, cab, floor, pfMat,
    flipL, flipR, FLIP_REST_L, FLIP_UP_L, FLIP_REST_R, FLIP_UP_R,
    plungerGrp, plungerRod, plungerKnob,
    bumpers, slings, targets, walls,
    portalRift, portalReach, portalReentry, rampPaths, rampL, rampR,
    ships, bolts, streamMain, holoMats, energyMats,
    scoreMesh, setScore, dmd,
    stormLight, key, state,
    flashBumper, setPortalLit, update,
    layout, feat, trackBall, flashInserts, flashArcs,
  };
}

function G_sph(r) { return new THREE.SphereGeometry(r, 16, 12); }
