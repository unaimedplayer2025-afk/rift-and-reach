// Portal C — RE-ENTRY: Rowlex starts docked to a generic white capsule in Earth orbit,
// undocks, then has to ride the corridor home without burning up or skipping off.
import * as THREE from 'three';
import { std, glow, additive, part, grp, Tex, clamp, lerp, damp } from './util.js';

const DEG = Math.PI / 180;
const CORRIDOR_LO = -14.5;
const CORRIDOR_HI = -7.2;

function earthTex() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#0a2a6a';
  g.fillRect(0, 0, 1024, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#d8e8f8');
  grd.addColorStop(0.08, '#0a3a7a');
  grd.addColorStop(0.5, '#07306c');
  grd.addColorStop(0.92, '#0a3a7a');
  grd.addColorStop(1, '#d8e8f8');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 512);
  // Simple generic continents — not a map of Earth, just landmass color.
  g.fillStyle = '#2d6a38';
  function blob(x, y, rx, ry, rot) {
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  g.fillStyle = '#3b7a3a';
  blob(180, 220, 140, 70, -0.3);
  blob(260, 260, 80, 50, 0.4);
  blob(420, 180, 60, 90, 0.2);
  blob(700, 240, 160, 80, 0.15);
  blob(820, 300, 90, 55, -0.5);
  blob(80, 340, 70, 40, 0.2);
  blob(560, 300, 50, 30, 0);
  g.fillStyle = '#5a7a3a';
  blob(200, 210, 50, 24, 0.1);
  blob(740, 220, 40, 20, -0.2);
  // ice caps already in gradient; add a few cloud swirls on a second pass later
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(0, 0, 1024, 18);
  g.fillRect(0, 494, 1024, 18);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function cloudTex() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 512);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 1024, y = 40 + Math.random() * 430;
    const rx = 30 + Math.random() * 80, ry = 10 + Math.random() * 22;
    g.globalAlpha = 0.15 + Math.random() * 0.4;
    g.beginPath(); g.ellipse(x, y, rx, ry, Math.random() * 0.6, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function panelCellTex() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#0b1a3a'; g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#1a3a6a'; g.lineWidth = 2;
  for (let y = 4; y < 256; y += 16) for (let x = 4; x < 128; x += 16) {
    g.strokeRect(x, y, 14, 14);
    g.fillStyle = (x + y) % 32 === 4 ? '#16325c' : '#0d2248';
    g.fillRect(x + 1, y + 1, 12, 12);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function chuteTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const n = 16;
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? '#f4f4f0' : '#e06018';
    g.beginPath();
    g.moveTo(128, 128);
    g.arc(128, 128, 128, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
    g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildCapsule() {
  const root = new THREE.Group();
  const white = std(0xf2f4f6, { roughness: 0.38, metalness: 0.12 });
  const whiteSoft = std(0xe8eaee, { roughness: 0.55, metalness: 0.06 });
  const charcoal = std(0x2a2c30, { roughness: 0.7, metalness: 0.25 });
  const shieldMat = std(0x3a3d42, { roughness: 0.85, metalness: 0.08 });
  const metal = std(0x9aa3ad, { roughness: 0.28, metalness: 0.85 });

  // Gumdrop pressure vessel
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.72), white);
  body.rotation.x = Math.PI; body.position.z = 0.15; root.add(body);

  // Trunk
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 1.55, 16), whiteSoft);
  trunk.rotation.x = Math.PI / 2; trunk.position.z = 1.55; root.add(trunk);
  const trunkBack = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.6, 0.2, 16), charcoal);
  trunkBack.rotation.x = Math.PI / 2; trunkBack.position.z = 2.35; root.add(trunkBack);
  // trunk hard-points / radiators (unbranded)
  part(root, new THREE.BoxGeometry(0.08, 0.7, 1.1), metal, 0.74, 0.15, 1.5);
  part(root, new THREE.BoxGeometry(0.08, 0.7, 1.1), metal, -0.74, 0.15, 1.5);

  // Heat shield (forebody)
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.22, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), shieldMat);
  shield.rotation.x = 0; shield.position.z = -0.55; root.add(shield);
  const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.05, 8, 24), metal);
  shieldRim.position.z = -0.15; root.add(shieldRim);

  // Docking ring / hatch (where Rowlex starts clamped)
  const dock = grp(root, 0, 0.15, -0.15);
  part(dock, new THREE.TorusGeometry(0.38, 0.05, 8, 16), metal, 0, 0, 0);
  part(dock, new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16), charcoal, 0, 0, 0, Math.PI / 2);
  const clampL = part(dock, new THREE.BoxGeometry(0.12, 0.08, 0.28), metal, -0.4, 0, 0.05);
  const clampR = part(dock, new THREE.BoxGeometry(0.12, 0.08, 0.28), metal, 0.4, 0, 0.05);

  // Window
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), std(0x0a1a2a, { roughness: 0.05, metalness: 0.3, emissive: 0x204060, emissiveIntensity: 0.4 }));
  win.position.set(0, 0.62, -0.55); win.rotation.x = -0.7; root.add(win);

  // RCS bumps
  for (const [x, y, z] of [[0.7, 0.5, 0.3], [-0.7, 0.5, 0.3], [0.5, -0.7, 0.2], [-0.5, -0.7, 0.2]]) {
    part(root, new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), metal, x, y, z);
  }

  // Solar wings (fold during reentry)
  const cell = std(0x0c1a38, { roughness: 0.35, metalness: 0.4, map: panelCellTex() });
  const hingeL = grp(root, -0.8, 0.1, 1.55);
  const hingeR = grp(root, 0.8, 0.1, 1.55);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 1.1), cell);
  wingL.position.x = -1.35; hingeL.add(wingL);
  const wingR = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.04, 1.1), cell);
  wingR.position.x = 1.35; hingeR.add(wingR);
  part(hingeL, new THREE.BoxGeometry(0.12, 0.12, 0.2), metal, 0, 0, 0);
  part(hingeR, new THREE.BoxGeometry(0.12, 0.12, 0.2), metal, 0, 0, 0);

  // Plasma / flame envelope in front of the heat shield
  const plasmaMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      heat: { value: 0 },
      col: { value: new THREE.Color(0xff7a28) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time, heat;
      uniform vec3 col;
      varying vec2 vUv;
      void main() {
        float t = time;
        float n = sin(vUv.x * 18.0 + t * 9.0) * 0.5 + sin(vUv.y * 26.0 - t * 14.0) * 0.5;
        float radial = 1.0 - length(vUv - vec2(0.5, 0.35));
        float core = smoothstep(0.05, 0.7, radial + n * 0.12) * heat;
        float rim = smoothstep(0.0, 0.35, radial) * (1.0 - smoothstep(0.55, 1.0, radial));
        vec3 c = mix(col, vec3(1.0, 0.95, 0.8), clamp(heat * radial * 1.2, 0.0, 1.0));
        float a = clamp(core * 0.95 + rim * heat * 0.5, 0.0, 1.0);
        if (a < 0.03) discard;
        gl_FragColor = vec4(c, a);
      }
    `,
  });
  const plasma = new THREE.Mesh(new THREE.SphereGeometry(1.45, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), plasmaMat);
  plasma.position.z = -0.85; plasma.rotation.x = Math.PI; root.add(plasma);

  const trailMat = plasmaMat.clone();
  trailMat.uniforms = {
    time: plasmaMat.uniforms.time,
    heat: plasmaMat.uniforms.heat,
    col: { value: new THREE.Color(0xff4a10) },
  };
  const trail = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5.5, 16, 1, true), trailMat);
  trail.rotation.x = Math.PI / 2; trail.position.z = 3.4; root.add(trail);

  // Drogue / main chute (hidden until deploy)
  const chute = new THREE.Mesh(new THREE.CircleGeometry(3.2, 24), new THREE.MeshBasicMaterial({
    map: chuteTex(), side: THREE.DoubleSide, transparent: true, depthWrite: false,
  }));
  chute.rotation.x = Math.PI / 2; chute.position.z = 6; chute.scale.setScalar(0.01); chute.visible = false;
  root.add(chute);
  const lines = new THREE.Group(); root.add(lines);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xddd8cc, transparent: true, opacity: 0.7 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 2.3),
      new THREE.Vector3(Math.cos(a) * 3, Math.sin(a) * 3, 6),
    ]);
    const ln = new THREE.Line(geo, lineMat); lines.add(ln);
  }
  lines.visible = false;

  return { root, dock, clampL, clampR, hingeL, hingeR, plasma, plasmaMat, trail, chute, lines, shield };
}


function padDeckTex() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2d32';
  g.fillRect(0, 0, 512, 512);
  // deck plating, unbranded
  g.strokeStyle = '#3a3e44';
  g.lineWidth = 2;
  for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(512, i * 32); g.stroke(); }
  for (let i = 0; i < 16; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 512); g.stroke(); }
  // bullseye rings — generic, no logos or letters
  const rings = [
    [240, '#d8d8d4', 10],
    [190, '#e07020', 12],
    [130, '#d8d8d4', 10],
    [70, '#e07020', 14],
    [22, '#f4f4f0', 0],
  ];
  g.save();
  g.translate(256, 256);
  for (const [r, col, w] of rings) {
    if (w === 0) { g.fillStyle = col; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); }
    else { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
  }
  g.restore();
  // safety edge
  g.strokeStyle = '#e8e0c8';
  g.lineWidth = 14;
  g.strokeRect(8, 8, 496, 496);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function oceanTex() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 512, 512);
  grd.addColorStop(0, '#0a3a5a');
  grd.addColorStop(0.5, '#0c4a6a');
  grd.addColorStop(1, '#0a3050');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = 'rgba(180,220,255,0.08)';
  g.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    g.beginPath();
    g.moveTo(0, i * 22 + 4);
    for (let x = 0; x <= 512; x += 16) g.lineTo(x, i * 22 + 4 + Math.sin(x * 0.04 + i) * 3);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildLandingField() {
  const root = new THREE.Group();
  root.name = 'landingField';
  root.visible = false;

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshStandardMaterial({ map: oceanTex(), roughness: 0.35, metalness: 0.15, color: 0x8ab0c8 })
  );
  ocean.rotation.x = -Math.PI / 2; ocean.position.y = 0; root.add(ocean);

  // Generic unbranded ocean drone-ship / barge
  const barge = new THREE.Group();
  barge.position.y = 0.16; root.add(barge);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(22, 0.7, 18), std(0x3a3e44, { roughness: 0.7, metalness: 0.35 }));
  hull.position.y = -0.1; barge.add(hull);
  const sheer = new THREE.Mesh(new THREE.BoxGeometry(22.4, 0.18, 18.4), std(0xd8d2c0, { roughness: 0.5, metalness: 0.2 }));
  sheer.position.y = 0.28; barge.add(sheer);
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(16.4, 0.12, 16.4),
    new THREE.MeshStandardMaterial({ map: padDeckTex(), roughness: 0.55, metalness: 0.25 })
  );
  deck.position.y = 0.38; barge.add(deck);

  // Corner posts / floodlights — no markings
  const postMat = std(0x2a2c30, { metalness: 0.6, roughness: 0.35 });
  for (const [x, z] of [[9.2, 7.4], [9.2, -7.4], [-9.2, 7.4], [-9.2, -7.4]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 2.2, 8), postMat);
    post.position.set(x, 1.3, z); barge.add(post);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), glow(0xfff2c8, 1.4));
    lamp.position.set(x, 2.45, z); barge.add(lamp);
    const light = new THREE.PointLight(0xfff0d0, 0.7, 14, 2); light.position.set(x, 2.5, z); barge.add(light);
  }
  // Small unbranded equipment hut at the stern, just so it reads as a ship
  const hut = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 2.4), std(0x4a5058, { roughness: 0.6, metalness: 0.3 }));
  hut.position.set(0, 1.15, 9.2); barge.add(hut);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.4, 6), postMat);
  mast.position.set(0, 2.9, 9.2); barge.add(mast);

  // Vertical target beacon over the bullseye
  const beaconMat = additive(0xff8a20, 0.55, { side: THREE.DoubleSide });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 22, 12, 1, true), beaconMat);
  beacon.position.y = 11; root.add(beacon);
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), glow(0xffc070, 2.2));
  diamond.position.y = 22.4; root.add(diamond);
  const halo = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.1, 28), additive(0xff8a20, 0.7, { side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.55; root.add(halo);

  // Projected touchdown pip (follows the capsule's ground track)
  const pip = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.15, 24), additive(0x40e8ff, 0.85, { side: THREE.DoubleSide }));
  pip.rotation.x = -Math.PI / 2; pip.position.y = 0.62; root.add(pip);

  const fireball = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12), additive(0xff4a10, 0.0));
  fireball.visible = false; root.add(fireball);

  return { root, barge, beacon, diamond, halo, pip, fireball, ocean };
}

export function buildReentryWorld() {
  const group = new THREE.Group();
  group.visible = false;
  group.name = 'reentry';

  const starsG = new THREE.BufferGeometry();
  const sN = 1600, sPos = new Float32Array(sN * 3);
  for (let i = 0; i < sN; i++) {
    const r = 220 + Math.random() * 280;
    const u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1);
    sPos[i * 3] = r * Math.sin(v) * Math.cos(u);
    sPos[i * 3 + 1] = r * Math.cos(v);
    sPos[i * 3 + 2] = r * Math.sin(v) * Math.sin(u);
  }
  starsG.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const stars = new THREE.Points(starsG, new THREE.PointsMaterial({ color: 0xfff8e8, size: 0.9, sizeAttenuation: true }));
  group.add(stars);

  const earthR = 80;
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(earthR, 48, 32),
    new THREE.MeshStandardMaterial({ map: earthTex(), roughness: 0.9, metalness: 0.0, emissive: 0x021018, emissiveIntensity: 0.25 })
  );
  group.add(earth);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(earthR * 1.045, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false,
      uniforms: { color: { value: new THREE.Color(0x4aa8ff) } },
      vertexShader: `varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 color; varying vec3 vN;
        void main(){
          float f = pow(1.0 - abs(vN.z), 2.2);
          gl_FragColor = vec4(color, clamp(f * 0.85, 0.0, 0.85));
        }`,
    })
  );
  group.add(atmo);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(earthR * 1.018, 32, 20),
    new THREE.MeshStandardMaterial({
      map: cloudTex(), transparent: true, opacity: 0.55, depthWrite: false, roughness: 1,
    })
  );
  group.add(clouds);

  // Rushing cloud sheets when low
  const rushMats = [];
  const rushGroup = new THREE.Group();
  group.add(rushGroup);
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: cloudTex(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), mat);
    sheet.position.set((i - 2) * 18, -8 - i * 3, 20 + i * 12);
    sheet.rotation.x = -0.9;
    rushGroup.add(sheet);
    rushMats.push({ sheet, mat, z0: sheet.position.z });
  }

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
  sun.position.set(-40, 60, -20); group.add(sun);
  group.add(new THREE.HemisphereLight(0x9ec8ff, 0x1a1020, 0.55));
  const rim = new THREE.PointLight(0xff6a20, 0, 40, 2); group.add(rim);

  const cap = buildCapsule();
  const craft = new THREE.Group();
  craft.add(cap.root);
  group.add(craft);

  // Landing RCS jets (under the heat shield) — lit while thrusting
  const jetMat = additive(0xffc080, 0.0);
  const jets = [];
  for (const [x, y] of [[0.45, 0.35], [-0.45, 0.35], [0.45, -0.35], [-0.45, -0.35]]) {
    const j = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 8, 1, true), jetMat.clone());
    j.rotation.x = Math.PI; j.position.set(x, y, 0.15); cap.root.add(j);
    jets.push(j);
  }

  const landing = buildLandingField();
  group.add(landing.root);

  // Splash ring
  const splash = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 6, 32),
    additive(0x80c8ff, 0.0, { side: THREE.DoubleSide })
  );
  splash.rotation.x = -Math.PI / 2; splash.visible = false;
  group.add(splash);

  // Breakup debris
  const debris = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.15 + Math.random() * 0.35, 0.08 + Math.random() * 0.2, 0.2 + Math.random() * 0.4),
      std(Math.random() > 0.5 ? 0xf0f2f4 : 0x33363c, { roughness: 0.6 })
    );
    m.visible = false;
    group.add(m);
    debris.push({ m, v: new THREE.Vector3(), spin: new THREE.Vector3() });
  }

  const flight = {
    phase: 'dock',
    t: 0,
    alt: 110,
    speed: 78,
    pitch: -1.2, // flight-path angle, degrees (negative = descending)
    bank: 0,
    yaw: 0,
    heat: 0,
    hull: 100,
    shield: 1,
    shieldT: 0,
    skipT: 0,
    endT: 0,
    inCorridor: false,
    success: false,
    reason: '',
    bonus: 0,
    panelsFold: 0,
    chute: 0,
    lx: 0, lz: 0, vx: 0, vz: 0, vy: 0,
    dist: 0, hSpeed: 0, vSpeed: 0, grade: '',
  };

  function reset() {
    Object.assign(flight, {
      phase: 'dock', t: 0, alt: 110, speed: 78, pitch: -1.2, bank: 0, yaw: 0,
      heat: 0, hull: 100, shield: 1, shieldT: 0, skipT: 0, endT: 0,
      inCorridor: false, success: false, reason: '', bonus: 0, panelsFold: 0, chute: 0,
      lx: 0, lz: 0, vx: 0, vz: 0, vy: 0, dist: 0, hSpeed: 0, vSpeed: 0, grade: '',
    });
    cap.chute.visible = false; cap.lines.visible = false; cap.chute.scale.setScalar(0.01);
    cap.hingeL.rotation.z = 0; cap.hingeR.rotation.z = 0;
    splash.visible = false; splash.scale.setScalar(0.2);
    for (const d of debris) d.m.visible = false;
    cap.root.visible = true;
    cap.plasmaMat.uniforms.heat.value = 0;
    landing.root.visible = false;
    landing.fireball.visible = false;
    landing.fireball.material.opacity = 0;
    for (const j of jets) j.material.opacity = 0;
  }

  function density(alt) {
    return Math.exp(-Math.max(0, alt) / 16.5);
  }

  function stepFlight(dt, input) {
    const f = flight;
    if (f.phase === 'dock') {
      f.t += dt;
      if (f.t > 2.2) { f.phase = 'undock'; f.t = 0; return { event: 'undock' }; }
      return null;
    }
    if (f.phase === 'undock') {
      f.t += dt;
      // Fold the arrays as attitude is set for the burn.
      f.panelsFold = clamp(f.t / 2.4, 0, 1);
      f.pitch = damp(f.pitch, -9.0, 1.6, dt);
      if (f.t > 2.6) { f.phase = 'reentry'; f.t = 0; return { event: 'reentry' }; }
      return null;
    }
    if (f.phase === 'descent') return stepDescent(dt, input);

    if (f.phase === 'splash' || f.phase === 'breakup' || f.phase === 'skip' || f.phase === 'touchdown' || f.phase === 'hardland' || f.phase === 'miss') {
      f.endT += dt;
      if (f.phase === 'touchdown' && f.endT > 2.4) return { leave: true, success: true, bonus: f.bonus, reason: 'touchdown' };
      if (f.phase === 'hardland' && f.endT > 2.5) return { leave: true, success: false, bonus: 0, reason: 'hardland' };
      if (f.phase === 'miss' && f.endT > 2.5) return { leave: true, success: false, bonus: 0, reason: 'miss' };
      if (f.phase === 'splash' && f.endT > 2.2) return { leave: true, success: false, bonus: 0, reason: 'splash' };
      if ((f.phase === 'breakup' || f.phase === 'skip') && f.endT > 2.6) {
        return { leave: true, success: false, bonus: 0, reason: f.reason };
      }
      if (f.phase === 'breakup') {
        for (const d of debris) {
          d.m.position.addScaledVector(d.v, dt);
          d.v.y -= 8 * dt;
          d.m.rotation.x += d.spin.x * dt; d.m.rotation.z += d.spin.z * dt;
        }
      }
      if (f.phase === 'skip') {
        f.alt += dt * 12; f.pitch = damp(f.pitch, 8, 2, dt); f.heat = Math.max(0, f.heat - dt * 10);
      }
      return null;
    }

    // ---- live reentry ----
    f.t += dt;
    const pitchIn = input ? clamp(input.pitch || 0, -1, 1) : 0;
    const bankIn = input ? clamp(input.bank || 0, -1, 1) : 0;
    f.pitch = clamp(f.pitch + pitchIn * 22 * dt, -32, 10);
    f.bank = damp(f.bank, bankIn * 28, 6, dt);
    f.yaw += f.bank * 0.015 * dt;

    if (input && input.shield && f.shield > 0.15 && f.shieldT <= 0) {
      f.shieldT = 0.85;
      f.shield = Math.max(0, f.shield - 0.34);
      f.heat = Math.max(0, f.heat - 22);
      f.speed = Math.max(18, f.speed - 7);
      return { event: 'shield' };
    }
    if (f.shieldT > 0) f.shieldT -= dt;
    f.shield = Math.min(1, f.shield + dt * 0.12);

    const rho = density(f.alt);
    const ang = f.pitch * DEG;
    // Descent from flight-path angle (negative pitch lowers altitude).
    f.alt += f.speed * Math.sin(ang) * 0.42 * dt;
    // Drag grows in thicker air; a shallow skip can actually gain altitude and keep speed.
    const drag = rho * f.speed * f.speed * 0.0044;
    f.speed -= drag * dt;
    f.speed += Math.sin(ang) * 3.2 * dt; // steep dive picks up a little speed
    f.speed = clamp(f.speed, 4, 95);
    f.alt = clamp(f.alt, 0, 140);

    const steep = Math.max(0, CORRIDOR_LO - f.pitch); // too steep (more negative)
    const shallow = Math.max(0, f.pitch - CORRIDOR_HI);
    f.inCorridor = f.pitch <= CORRIDOR_HI && f.pitch >= CORRIDOR_LO;
    const heatGain = rho * (f.speed / 18) * (f.speed / 18) * (1.15 + steep * 0.18) * 22;
    const heatLoss = 7 + (input && input.shield && f.shieldT > 0 ? 18 : 0);
    f.heat = clamp(f.heat + (heatGain - heatLoss) * dt, 0, 100);
    if (f.heat > 82) f.hull -= (f.heat - 82) * 0.55 * dt;
    if (steep > 8 && rho > 0.25) f.hull -= steep * 0.35 * dt;

    // Skip only if the flight path stays clearly too shallow in the upper air for a few seconds.
    // A late correction can still save it — no automatic skip on altitude alone.
    if (f.alt > 45 && f.pitch > -5 && f.t > 6) {
      f.skipT += dt;
      if (f.skipT > 3.2) {
        f.phase = 'skip'; f.endT = 0; f.reason = 'skip'; f.success = false;
        return { event: 'skip' };
      }
    } else f.skipT = Math.max(0, f.skipT - dt * 0.6);

    if (f.heat >= 100 || f.hull <= 0) {
      f.phase = 'breakup'; f.endT = 0; f.reason = f.hull <= 0 ? 'hull' : 'heat'; f.success = false;
      cap.root.visible = false;
      for (const d of debris) {
        d.m.visible = true;
        d.m.position.copy(craft.position);
        d.m.position.x += (Math.random() - 0.5) * 1.2;
        d.m.position.y += (Math.random() - 0.5) * 1.2;
        d.v.set((Math.random() - 0.5) * 10, Math.random() * 6, (Math.random() - 0.5) * 8);
        d.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      }
      return { event: 'breakup' };
    }

    if (f.alt <= 7.5 && f.speed < 26 && f.heat < 88 && f.hull > 0) {
      beginDescent();
      return { event: 'descent' };
    }
    if (f.alt <= 0.2 && f.phase === 'reentry') {
      // Hit the surface still too fast / hot — breakup.
      f.phase = 'breakup'; f.endT = 0; f.reason = 'impact'; f.success = false;
      cap.root.visible = false;
      return { event: 'breakup' };
    }
    return null;
  }

  const PAD_R = 8.2;
  const SOFT_V = 5.15;
  const VERY_SOFT = 3.0;

  function beginDescent() {
    const f = flight;
    f.phase = 'descent'; f.t = 0; f.endT = 0; f.success = false; f.reason = ''; f.grade = '';
    f.chute = 0; f.heat = Math.max(0, f.heat * 0.35);
    f.alt = 52;
    f.lx = 15; f.lz = 11;
    f.vx = -1.1; f.vz = -0.7;
    f.vy = 6.6;
    f.dist = Math.hypot(f.lx, f.lz);
    f.hSpeed = Math.hypot(f.vx, f.vz);
    f.vSpeed = f.vy;
    f.pitch = 0; f.bank = 0; f.yaw = 0;
    cap.chute.visible = true; cap.lines.visible = true;
    landing.root.visible = true;
    landing.fireball.visible = false;
    cap.root.visible = true;
    splash.visible = false;
  }

  function stepDescent(dt, input) {
    const f = flight;
    f.t += dt;
    f.chute = clamp(f.chute + dt * 1.5, 0, 1);
    f.heat = Math.max(0, f.heat - dt * 18);
    const tx = input ? clamp(input.bank || 0, -1, 1) : 0;
    const tz = input ? clamp(-(input.pitch || 0), -1, 1) : 0; // W (pitch +) thrusts toward -Z
    const brake = !!(input && input.shield);
    // Lateral RCS — snappy enough to close a ~18 m offset in the time you have.
    f.vx += tx * 13.5 * dt;
    f.vz += tz * 13.5 * dt;
    const h = Math.hypot(f.vx, f.vz);
    if (h > 14) { f.vx *= 14 / h; f.vz *= 14 / h; }
    const hDrag = 1.6 + (brake ? 1.2 : 0);
    f.vx *= Math.max(0, 1 - hDrag * dt);
    f.vz *= Math.max(0, 1 - hDrag * dt);
    // Vertical: chute has a slightly-hot terminal; hold shield / space to bleed speed for a soft touchdown.
    f.vy += 3.4 * dt;
    f.vy -= f.vy * 0.52 * dt;
    if (brake) f.vy = Math.max(0.6, f.vy - 9.5 * dt);
    f.vy = clamp(f.vy, 0.4, 16);
    f.lx += f.vx * dt;
    f.lz += f.vz * dt;
    f.alt -= f.vy * dt;
    f.dist = Math.hypot(f.lx, f.lz);
    f.hSpeed = Math.hypot(f.vx, f.vz);
    f.vSpeed = f.vy;
    f.speed = Math.hypot(f.hSpeed, f.vSpeed);
    if (f.alt <= 0.35) return resolveLanding();
    return null;
  }

  function resolveLanding() {
    const f = flight;
    f.alt = 0;
    f.endT = 0;
    const dist = f.dist;
    const onPad = dist <= PAD_R;
    const soft = f.vy <= SOFT_V;
    if (!onPad) {
      f.phase = 'miss'; f.success = false; f.reason = 'miss'; f.bonus = 0; f.grade = 'MISSED';
      splash.visible = true; splash.position.set(f.lx, 0.15, f.lz);
      return { event: 'miss', dist, vy: f.vy };
    }
    if (!soft) {
      f.phase = 'hardland'; f.success = false; f.reason = 'hardland'; f.bonus = 0; f.grade = 'HARD LANDING';
      cap.root.visible = false;
      landing.fireball.visible = true;
      landing.fireball.position.set(f.lx, 1.1, f.lz);
      landing.fireball.material.opacity = 0.95;
      for (const d of debris) {
        d.m.visible = true;
        d.m.position.set(f.lx + (Math.random() - 0.5) * 1.4, 1 + Math.random(), f.lz + (Math.random() - 0.5) * 1.4);
        d.v.set((Math.random() - 0.5) * 10, 3 + Math.random() * 8, (Math.random() - 0.5) * 10);
        d.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      }
      return { event: 'hardland', dist, vy: f.vy };
    }
    const acc = clamp(1 - dist / PAD_R, 0, 1);
    const very = f.vy <= VERY_SOFT;
    f.phase = 'touchdown'; f.success = true; f.reason = 'touchdown';
    f.grade = dist <= 1.6 ? 'BULLSEYE' : dist <= 3.6 ? 'CENTER DECK' : 'ON DECK';
    f.bonus = 5000 + Math.round(acc * 10000) + (very ? 4000 : 1500) + Math.floor(Math.max(0, f.hull) * 20);
    f.vx = 0; f.vz = 0; f.vy = 0;
    return { event: 'touchdown', dist, vy: f.vSpeed, bonus: f.bonus, grade: f.grade };
  }

  function layoutCraft() {
    const f = flight;
    const landingPhase = f.phase === 'descent' || f.phase === 'touchdown' || f.phase === 'hardland' || f.phase === 'miss';
    cap.hingeL.rotation.z = lerp(0, 1.25, f.panelsFold);
    cap.hingeR.rotation.z = lerp(0, -1.25, f.panelsFold);
    cap.plasmaMat.uniforms.time.value = f.t + (flight._clock || 0);

    if (landingPhase) {
      landing.root.visible = true;
      rushGroup.visible = false;
      // Park the globe on the horizon so the ocean pad can take the stage.
      earth.position.set(0, -earthR * 0.85, 210);
      atmo.position.copy(earth.position);
      clouds.position.copy(earth.position);
      const deckY = 0.7;
      const cy = (f.phase === 'miss' ? -0.4 : deckY) + Math.max(0, f.alt);
      craft.position.set(f.lx, cy, f.lz);
      const tiltX = clamp(f.vz * 0.03, -0.35, 0.35);
      const tiltZ = clamp(-f.vx * 0.03, -0.35, 0.35);
      if (f.phase === 'touchdown') craft.rotation.set(0, 0, 0);
      else if (f.phase === 'miss') craft.rotation.set(0.4, f.t * 0.4, 0.2);
      else craft.rotation.set(tiltX, 0, tiltZ);
      cap.plasmaMat.uniforms.heat.value = 0;
      cap.chute.scale.setScalar(0.01 + f.chute * 0.99);
      cap.chute.visible = f.phase === 'descent' || f.phase === 'touchdown';
      cap.lines.visible = cap.chute.visible;
      cap.chute.position.z = 5.5 + f.chute * 1.2;
      cap.chute.rotation.x = Math.PI / 2;
      landing.pip.position.set(f.lx, 0.62, f.lz);
      landing.diamond.rotation.y += 0.015;
      landing.halo.scale.setScalar(1 + Math.sin((flight._clock || 0) * 3) * 0.08);
      landing.barge.position.y = 0.16 + Math.sin((flight._clock || 0) * 0.7) * 0.04;
      const thrusting = f.phase === 'descent' && (Math.abs(f.vx) > 0.4 || Math.abs(f.vz) > 0.4);
      for (const j of jets) j.material.opacity = thrusting ? 0.7 : (f.phase === 'descent' ? 0.12 : 0);
      if (f.phase === 'hardland' && landing.fireball.visible) {
        landing.fireball.scale.setScalar(1 + f.endT * 3.5);
        landing.fireball.material.opacity = Math.max(0, 0.95 - f.endT * 0.4);
        for (const d of debris) {
          d.m.position.addScaledVector(d.v, 1 / 60);
          d.v.y -= 10 / 60;
          d.m.rotation.x += d.spin.x / 60; d.m.rotation.z += d.spin.z / 60;
        }
      }
      if (f.phase === 'miss' && splash.visible) {
        splash.position.set(f.lx, 0.2, f.lz);
        splash.scale.setScalar(0.5 + f.endT * 4);
        splash.material.opacity = Math.max(0, 0.75 - f.endT * 0.28);
      }
      rim.position.set(f.lx, cy + 1, f.lz);
      rim.intensity = f.phase === 'hardland' ? 8 : 0.4;
      return;
    }

    landing.root.visible = false;
    rushGroup.visible = true;
    const hover = earthR + 6 + f.alt * 0.85;
    earth.position.set(0, -earthR * 0.15, hover);
    atmo.position.copy(earth.position);
    clouds.position.copy(earth.position);
    earth.rotation.y += 0.02 * (f.phase === 'reentry' ? 1 : 0.3);
    clouds.rotation.y = earth.rotation.y * 1.15;

    craft.position.set(f.bank * 0.04, Math.sin(f.t * 0.7) * 0.08, 0);
    const att = -f.pitch * DEG * 0.35 + 0.55;
    craft.rotation.set(att, f.yaw, -f.bank * DEG);
    const heatN = f.heat / 100;
    cap.plasmaMat.uniforms.heat.value = f.phase === 'reentry' ? heatN : (f.phase === 'undock' ? 0.05 : 0);
    rim.position.copy(craft.position); rim.position.z -= 2;
    rim.intensity = heatN * 6;
    rim.color.setHSL(0.06 - heatN * 0.04, 0.95, 0.55);
    for (const j of jets) j.material.opacity = 0;

    cap.chute.scale.setScalar(0.01 + f.chute * 0.99);
    cap.chute.visible = f.chute > 0.02;
    cap.lines.visible = cap.chute.visible;
    cap.chute.position.z = 5.5 + f.chute * 1.2;

    const rush = f.phase === 'reentry' && f.alt < 42 ? clamp((42 - f.alt) / 30, 0, 1) * (f.speed / 50) : 0;
    for (const r of rushMats) {
      r.mat.opacity = rush * 0.35;
      r.sheet.position.z -= rush * f.speed * 0.15;
      if (r.sheet.position.z < -20) r.sheet.position.z = 70;
    }
  }

  function applyCamera(camera, shake, dt) {
    const f = flight;
    let back = 7.5, up = 2.4, lookZ = -6, lookY = -0.8;
    if (f.phase === 'dock') { back = 9; up = 2.8; lookZ = -1; lookY = 0.2; }
    if (f.phase === 'undock') { back = 8.2; up = 2.5; }
    if (f.phase === 'reentry') { back = 6.6 + f.heat * 0.01; up = 2.1; lookY = -1.1; }
    if (f.phase === 'breakup') { back = 11; up = 3; }
    if (f.phase === 'skip') { back = 9; up = 3.5; lookY = 0.8; }
    const landingPhase = f.phase === 'descent' || f.phase === 'touchdown' || f.phase === 'hardland' || f.phase === 'miss';
    if (landingPhase) {
      const cy = Math.max(0, f.alt) + 0.7;
      const backX = f.lx * 0.25;
      const backZ = f.lz * 0.25 + 16 + Math.max(0, f.alt) * 0.15;
      camera.position.set(backX, Math.max(8, cy + 7), backZ);
      camera.up.set(0, 1, 0);
      camera.lookAt(f.lx * 0.55, 0.4, f.lz * 0.55);
      if (shake) shake.set(0, 0, 0);
      return;
    }
    const hs = (f.heat / 100) * (f.phase === 'reentry' ? 1 : 0.2);
    const sx = (Math.random() - 0.5) * hs * 0.35;
    const sy = (Math.random() - 0.5) * hs * 0.35;
    if (shake) shake.set(sx, sy, 0);
    camera.position.set(sx, up + sy, back);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, lookY, lookZ);
    camera.rotation.z = -f.bank * DEG * 0.45;
  }

  // Dock clamp animation lives here so main can query a Rowlex local offset.
  function rowlexOffset() {
    const f = flight;
    if (f.phase === 'dock') return { x: 0, y: 0.05, z: -0.55, s: 1 };
    if (f.phase === 'undock') {
      const k = clamp(f.t / 1.4, 0, 1);
      // Float off the hatch, then settle back onto the docking ring for the ride home.
      const out = Math.sin(k * Math.PI);
      return { x: out * 0.15, y: 0.05 + out * 1.4, z: -0.55 - out * 1.8, s: 1 };
    }
    return { x: 0, y: 0.08, z: -0.2, s: 0.85 };
  }

  reset();

  return {
    group, earth, atmo, clouds, craft, cap, flight, look: { fog: { color: 0x02010a, density: 0.0016 }, bloom: 0.78, exposure: 1.04 },
    reset,
    update(dt, input) {
      flight._clock = (flight._clock || 0) + dt;
      const ev = stepFlight(dt, input);
      layoutCraft();
      return ev;
    },
    applyCamera,
    rowlexOffset,
    PAD_R: 8.2,
  };
}
