// High-density playfield toys and an enclosed collision layout.
// Multi-level ramps, crossing habitrails, upper mini-playfield, magnet, moving toys.
import * as THREE from 'three';
import { std, glow, additive, part, grp, Tex, instanced, makeCurve } from './util.js';
import { holographicMat } from './models.js';

const chrome = std(0xc8d0dc, { metalness: 1, roughness: 0.18 });
const darkMetal = std(0x12141c, { metalness: 0.7, roughness: 0.4 });
const orangeLit = std(0xff8a20, { roughness: 0.35, metalness: 0.4, emissive: 0xff8a20, emissiveIntensity: 0.7 });

function glass(color, opacity) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.08, metalness: 0.05, transparent: true, opacity,
    depthWrite: false, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.15,
  });
}

export function buildTableFeatures(cab, ctx) {
  const { BALL_R } = ctx;
  const toys = cab;
  const features = {};

  // ---------- GLASS LID (real pinball machine cover) ----------
  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(14.2, 0.06, 27.2),
    new THREE.MeshPhysicalMaterial({
      color: 0xa8d8ff, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.09,
      side: THREE.DoubleSide, depthWrite: false, emissive: 0x204060, emissiveIntensity: 0.08,
    })
  );
  lid.position.set(0.4, 2.48, -3.4);
  lid.name = 'glassLid';
  cab.add(lid);
  features.lid = lid;

  // ---------- HABITRAIL PATHS (crossing wireforms at different heights) ----------
  // Rail A: climbs from the left ramp mouth, loops high over mid-table, drops mid-right.
  const railA = [
    [-3.8, 0.45, 3.4], [-4.4, 1.3, 0.6], [-4.2, 2.4, -3.2], [-2.4, 3.15, -6.6],
    [0.2, 3.35, -8.0], [2.6, 3.15, -6.5], [3.8, 2.5, -3.0], [3.4, 1.4, 0.4], [2.2, 0.45, 2.6],
  ];
  // Rail B: starts right, crosses UNDER/through A's mid loop at a lower height, feeds the mini-playfield.
  const railB = [
    [2.7, 0.45, 3.1], [3.6, 1.2, 0.2], [3.9, 2.05, -3.6], [2.2, 2.55, -7.2],
    [-0.4, 2.7, -9.4], [-2.4, 2.2, -11.2], [-3.2, 1.55, -12.2],
  ];
  // Mini-playfield exit: drop trough back to the main field.
  const miniDrop = [
    [-1.1, 1.55, -10.15], [-0.6, 1.1, -8.6], [0.2, 0.55, -6.8], [0.6, 0.42, -5.2],
  ];

  function wire(pts, r, mat, segs = 40) {
    const curve = makeCurve(pts, false);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, r, 6, false), mat);
    cab.add(mesh);
    return mesh;
  }
  const railMat = chrome;
  const railGlow = additive(0x40e8ff, 0.22);
  wire(railA, 0.055, railMat, 64);
  wire(railA, 0.09, railGlow, 40);
  // twin rail for a real wireform look
  const railA2 = railA.map((p) => [p[0], p[1] + 0.16, p[2]]);
  wire(railA2, 0.045, railMat, 64);
  wire(railB, 0.055, std(0xb8c0cc, { metalness: 1, roughness: 0.2 }), 56);
  wire(railB, 0.085, additive(0xc040ff, 0.2), 36);
  const railB2 = railB.map((p) => [p[0], p[1] + 0.16, p[2]]);
  wire(railB2, 0.045, chrome, 56);
  wire(miniDrop, 0.05, chrome, 24);

  features.paths = [
    { name: 'railA', kind: 'rail', pts: railA, score: 2500, exitSpd: 14,
      enter: { x: -3.8, z: 3.4, r: 0.7, dirZ: -1, minSpd: 7 }, diverter: 0 },
    { name: 'railB', kind: 'rail', pts: railB, score: 2500, exitSpd: 11,
      enter: { x: 2.7, z: 3.1, r: 0.7, dirZ: -1, minSpd: 7 }, diverter: 1 },
    { name: 'leftHolo', kind: 'ramp', pts: ctx.rampL, score: 1500, exitSpd: 13,
      enter: { x: -3.8, z: 3.5, r: 0.55, dirZ: -1, minSpd: 6 }, diverter: 1 },
    { name: 'rightHolo', kind: 'ramp', pts: ctx.rampR, score: 1500, exitSpd: 13,
      enter: { x: 2.8, z: 3.2, r: 0.55, dirZ: -1, minSpd: 6 }, diverter: 0 },
    { name: 'miniDrop', kind: 'rail', pts: miniDrop, score: 400, exitSpd: 9,
      enter: { x: -1.1, z: -10.15, r: 0.45, minSpd: 0, dirZ: 1 } },
  ];

  // ---------- UPPER MINI-PLAYFIELD ----------
  const mini = grp(cab, -2.15, 1.35, -11.6);
  // Platform
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 3.4), std(0x0a1020, { metalness: 0.4, roughness: 0.5, map: Tex.nebula(1) }));
  deck.position.y = 0; mini.add(deck);
  const deckGlow = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.03, 3.5), glow(0x40e8ff, 0.7));
  deckGlow.position.y = 0.07; mini.add(deckGlow);
  // Mini walls (visual)
  function miniWall(x, z, sx, sz) {
    part(mini, new THREE.BoxGeometry(sx, 0.45, sz), holographicMat ? holographicMat(0x40e8ff) : glass(0x40e8ff, 0.4), x, 0.28, z);
  }
  // Will use holographicMat if it's a function - it's imported as holographicMat from models.
  // rails around the deck
  const mw = (x, z, sx, sz) => {
    part(mini, new THREE.BoxGeometry(sx, 0.5, sz), glass(0x40e8ff, 0.35), x, 0.3, z);
    part(mini, new THREE.BoxGeometry(sx + 0.02, 0.04, sz + 0.02), glow(0x40e8ff, 1.1), x, 0.55, z);
  };
  mw(0, -1.65, 4.4, 0.1); // back
  mw(-2.15, 0, 0.1, 3.3); // left
  mw(2.15, -0.5, 0.1, 2.4); // right (opening at the front-right for the flipper / drain)
  // Mini flipper
  const miniFlipG = new THREE.Group();
  part(miniFlipG, new THREE.BoxGeometry(0.95, 0.14, 0.28), orangeLit, 0.45, 0.1, 0);
  part(miniFlipG, new THREE.BoxGeometry(0.9, 0.03, 0.12), glow(0xffc070, 2.2), 0.45, 0.18, 0);
  part(miniFlipG, new THREE.CylinderGeometry(0.14, 0.14, 0.2, 10), chrome, 0, 0.1, 0);
  const miniLight = new THREE.PointLight(0xff8a20, 0.7, 3, 2); miniLight.position.set(0.4, 0.3, 0); miniFlipG.add(miniLight);
  miniFlipG.position.set(0.85, 0.08, 1.35);
  mini.add(miniFlipG);
  features.miniFlip = miniFlipG;
  features.miniRoot = mini;
  // World-space mini flipper pivot: mini origin (-2.15, 1.35, -11.6) + (0.85, 0, 1.35) => (-1.3, 1.43, -10.25)
  features.miniFlipSpec = {
    x: -1.3, z: -10.25, rest: -0.35, up: 0.78, len: 0.95, thick: 0.16, sign: 1, side: 'M', upRate: 42, downRate: 24, y: 1.5,
  };
  // Mini bumper
  const miniBump = grp(mini, -0.6, 0.12, -0.3);
  part(miniBump, new THREE.CylinderGeometry(0.28, 0.32, 0.12, 12), darkMetal, 0, 0.06, 0);
  part(miniBump, new THREE.CylinderGeometry(0.24, 0.24, 0.32, 12), glass(0xc040ff, 0.5), 0, 0.25, 0);
  part(miniBump, new THREE.TorusGeometry(0.26, 0.03, 6, 14), glow(0xc040ff, 1.6), 0, 0.14, 0, Math.PI / 2);

  // Mini-playfield collision in world space (y is ignored by 2D solver; floor is visual).
  // The 2D solver is on the main plane — the mini field is reached via rails (path constraint).
  // While on the mini deck we need the ball to stay at y≈1.55. That's handled by a "mini" path-less zone
  // in layout.miniZone: if the ball is in the zone and y is high, treat floor as 1.55... 
  // Simpler: mini is rail-fed and the exit is a path. While in the zone, main.js/physics can use a raised floor.
  features.miniZone = { x0: -4.3, x1: 0.15, z0: -13.35, z1: -9.8, floor: 1.55, drop: { x: -1.1, z: -10.15, r: 0.5 } };
  features.miniBumper = { x: -2.15 - 0.6, z: -11.6 - 0.3, r: 0.32, kick: 12, color: 0xc040ff };

  // ---------- MAGNET ----------
  const mag = grp(cab, 0.15, 0, -3.4);
  part(mag, new THREE.CylinderGeometry(0.55, 0.65, 0.1, 16), darkMetal, 0, 0.06, 0);
  const magRing = part(mag, new THREE.TorusGeometry(0.48, 0.05, 8, 20), glow(0xff3a6a, 0.8), 0, 0.12, 0, Math.PI / 2);
  const magCore = part(mag, new THREE.CircleGeometry(0.4, 16), additive(0xff3a6a, 0.25, { side: THREE.DoubleSide }));
  magCore.rotation.x = -Math.PI / 2; magCore.position.y = 0.13;
  const magLight = new THREE.PointLight(0xff3a6a, 0, 5, 2); magLight.position.y = 0.5; mag.add(magLight);
  features.magnet = { x: 0.15, z: -3.4, r: 2.2, pull: 28, hold: 0.75, group: mag, ring: magRing, core: magCore, light: magLight };

  // ---------- DIVERTER (moving gate at the left ramp / rail split) ----------
  const div = grp(cab, -4.15, 1.15, -1.4);
  const divArm = new THREE.Group();
  part(divArm, new THREE.BoxGeometry(1.15, 0.08, 0.12), chrome, 0.5, 0, 0);
  part(divArm, new THREE.BoxGeometry(1.15, 0.02, 0.04), glow(0xff8a20, 1.8), 0.5, 0.05, 0);
  div.add(divArm);
  part(div, new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), darkMetal, 0, -0.05, 0);
  features.diverter = { group: div, arm: divArm, x: -4.15, z: -1.4 };
  features.diverterSw = { x: -4.15, z: -1.4, r: 0.55 };

  // ---------- ROWLEX HEAD TOY (eye tracks the ball) ----------
  const head = grp(cab, 2.55, 0.15, -8.35);
  part(head, new THREE.SphereGeometry(0.48, 18, 14), std(0x2a4a34, { roughness: 0.55, metalness: 0.42, emissive: 0x0a1a10, emissiveIntensity: 0.22 }), 0, 0.55, 0);
  const headEye = grp(head, 0, 0.58, 0.42);
  part(headEye, new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: 0x4a0000, toneMapped: false }));
  const iris = part(headEye, new THREE.CircleGeometry(0.08, 12), new THREE.MeshBasicMaterial({ color: 0xe01000, toneMapped: false }));
  iris.position.z = 0.01;
  const headHalo = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), additive(0xff2010, 0.2, { side: THREE.DoubleSide }));
  headHalo.position.z = -0.01; headEye.add(headHalo);
  const headLight = new THREE.PointLight(0xff2010, 0.15, 2.5, 2); headEye.add(headLight);
  // bezel
  part(head, new THREE.TorusGeometry(0.18, 0.025, 8, 16), std(0x2a2c30, { metalness: 0.85, roughness: 0.3 }), 0, 0.58, 0.40);
  features.head = { group: head, eye: headEye, iris, light: headLight };

  // ---------- SPINNING RIFT ORB ----------
  const orb = grp(cab, -3.35, 0.2, -6.4);
  const orbCore = part(orb, new THREE.SphereGeometry(0.32, 16, 12), glow(0x40e8ff, 1.4), 0, 0.7, 0);
  const orbRing = part(orb, new THREE.TorusGeometry(0.42, 0.03, 8, 20), glow(0xc040ff, 1.6), 0, 0.7, 0, 0.6, 0.2, 0);
  const orbRing2 = part(orb, new THREE.TorusGeometry(0.5, 0.02, 6, 18), glow(0x40e8ff, 1.2), 0, 0.7, 0, 1.2, 0.4, 0.3);
  const orbLight = new THREE.PointLight(0x40e8ff, 0.8, 5, 2); orbLight.position.y = 0.7; orb.add(orbLight);
  features.orb = { group: orb, core: orbCore, ring: orbRing, ring2: orbRing2, light: orbLight };

  // ---------- SAUCER / SCOOP ----------
  const saucerG = grp(cab, -2.15, 0, -2.15);
  part(saucerG, new THREE.CylinderGeometry(0.55, 0.7, 0.14, 16, 1, true), darkMetal, 0, 0.08, 0);
  const well = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), additive(0xff8a20, 0.3, { side: THREE.DoubleSide }));
  well.rotation.x = -Math.PI / 2; well.position.y = 0.03; saucerG.add(well);
  part(saucerG, new THREE.TorusGeometry(0.58, 0.04, 8, 18), glow(0xff8a20, 1.3), 0, 0.1, 0, Math.PI / 2);
  features.saucer = { x: -2.15, z: -2.15, r: 0.48, hold: 0.9, eject: [4, -18], group: saucerG, well };

  // ---------- KICKBACK (left outlane) ----------
  const kb = grp(cab, -4.85, 0, 7.55);
  part(kb, new THREE.BoxGeometry(0.5, 0.28, 0.7), darkMetal, 0, 0.16, 0);
  const kbFace = part(kb, new THREE.BoxGeometry(0.4, 0.18, 0.06), glow(0x40e8ff, 0.6), 0, 0.18, -0.32);
  features.kickback = { x: -4.85, z: 7.55, r: 0.55, dir: [3, -22], lit: true, group: kb, face: kbFace };

  // ---------- CAPTIVE BALL ----------
  const capG = grp(cab, 4.15, 0, -1.2);
  // short cage along z
  part(capG, new THREE.BoxGeometry(0.12, 0.35, 2.0), chrome, -0.4, 0.2, 0);
  part(capG, new THREE.BoxGeometry(0.12, 0.35, 2.0), chrome, 0.4, 0.2, 0);
  part(capG, new THREE.BoxGeometry(0.9, 0.12, 0.12), chrome, 0, 0.08, -1.0);
  part(capG, new THREE.BoxGeometry(0.9, 0.12, 0.12), chrome, 0, 0.08, 1.0);
  const capBall = part(capG, new THREE.SphereGeometry(0.28, 14, 10), std(0x2a4a34, { metalness: 0.5, roughness: 0.4 }), 0, 0.3, 0);
  features.captive = {
    a: [4.15, -2.15], b: [4.15, 0.75], r: 0.28, s: 0.45, ballV: 0, ballX: 4.15, ballZ: -0.7,
    group: capG, mesh: capBall,
  };

  // ---------- SPINNER ----------
  const spG = grp(cab, -5.35, 0, -3.1);
  const spArm = new THREE.Group();
  part(spArm, new THREE.BoxGeometry(1.1, 0.05, 0.16), chrome, 0, 0.35, 0);
  part(spArm, new THREE.BoxGeometry(0.16, 0.05, 1.1), chrome, 0, 0.35, 0);
  part(spArm, new THREE.BoxGeometry(1.05, 0.02, 0.05), glow(0x40e8ff, 1.6), 0, 0.38, 0);
  part(spG, new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), darkMetal, 0, 0.25, 0);
  spG.add(spArm);
  features.spinner = { a: [-5.7, -3.1], b: [-5.0, -3.1], group: spG, arm: spArm, spin: 0, angle: 0 };

  // ---------- ROWLEX STAND-UPS ----------
  const letters = 'ROWLEX';
  const standups = [];
  const standupRoot = grp(cab, 0, 0, 0);
  for (let i = 0; i < 6; i++) {
    const x = -2.7 + i * 0.95, z = -9.15;
    const g = grp(standupRoot, x, 0, z);
    part(g, new THREE.BoxGeometry(0.42, 0.55, 0.14), darkMetal, 0, 0.32, 0);
    const face = part(g, new THREE.BoxGeometry(0.36, 0.48, 0.04), glow(0x40e8ff, 0.35), 0, 0.32, 0.08);
    const lab = Tex.sign ? Tex.sign(letters[i], '#ffffff') : null;
    if (lab) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.36), new THREE.MeshBasicMaterial({ map: lab, transparent: true, toneMapped: false }));
      pl.position.set(0, 0.32, 0.11); g.add(pl);
    }
    standups.push({ x, z, r: 0.32, letter: letters[i], lit: false, down: false, group: g, face });
  }
  features.standups = standups;

  // ---------- DROP TARGET BANK ----------
  const drops = [];
  for (let i = 0; i < 3; i++) {
    const x = 2.35 + i * 0.7, z = -6.35;
    const g = grp(cab, x, 0, z);
    const body = part(g, new THREE.BoxGeometry(0.55, 0.62, 0.14), std(0x3a1040, { metalness: 0.4, roughness: 0.45, emissive: 0xc040ff, emissiveIntensity: 0.3 }), 0, 0.34, 0);
    drops.push({ x, z, r: 0.36, down: false, bank: 'right', group: g, body });
  }
  features.drops = drops;

  // ---------- ROLLOVER LANES (top) ----------
  const rollovers = [];
  const roLetters = ['R', 'I', 'F'];
  for (let i = 0; i < 3; i++) {
    const x = -1.7 + i * 1.7, z = -15.15;
    const g = grp(cab, x, 0, z);
    part(g, new THREE.BoxGeometry(0.9, 0.08, 0.35), darkMetal, 0, 0.04, 0);
    const lamp = part(g, new THREE.BoxGeometry(0.7, 0.04, 0.22), glow(0xff8a20, 0.3), 0, 0.1, 0);
    rollovers.push({ x, z, r: 0.4, index: i, letter: roLetters[i], lit: false, group: g, lamp });
  }
  features.rollovers = rollovers;
  features.rolloverOrder = [0, 1, 2]; // rotated by flippers

  // ---------- INSERT LIGHTS (instanced under-playfield lamps) ----------
  const insertPts = [];
  // inlanes / outlanes
  for (const p of [[-4.5, 7.2], [-2.6, 7.4], [2.35, 7.4], [4.3, 7.2], [-3.5, 5.8], [3.15, 5.8],
    [-2.4, 3.6], [2.1, 3.6], [0, 4.6], [-1.1, 5.5], [0.9, 5.5],
    [-4.8, 0.5], [-4.8, -2], [-4.8, -5], [3.6, 0.2], [3.6, -3],
    [-2, -4.2], [0, -4.2], [1.8, -4.2], [0.15, -2.2],
    [-3.2, -7.4], [0, -8.3], [3.0, -7.4],
    [-1.7, -14.4], [0, -14.4], [1.7, -14.4],
    [-5.2, 4], [5.0, 3.2]]) {
    insertPts.push(p);
  }
  const insGeo = new THREE.CircleGeometry(0.16, 10);
  const insMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, toneMapped: false });
  const inserts = new THREE.InstancedMesh(insGeo, insMat, insertPts.length);
  inserts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  const insColor = new THREE.Color();
  inserts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(insertPts.length * 3), 3);
  insertPts.forEach((p, i) => {
    dummy.position.set(p[0], 0.03, p[1]);
    dummy.rotation.x = -Math.PI / 2;
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    inserts.setMatrixAt(i, dummy.matrix);
    insColor.set(i % 3 === 0 ? 0x40e8ff : i % 3 === 1 ? 0xc040ff : 0xff8a20);
    inserts.setColorAt(i, insColor);
  });
  cab.add(inserts);
  features.inserts = { mesh: inserts, pts: insertPts, dummy, colors: insertPts.map((_, i) => i % 3), flash: new Float32Array(insertPts.length) };

  // ---------- LIGHTNING ARCS BETWEEN MAIN BUMPERS (updated live) ----------
  const arcMat = new THREE.LineBasicMaterial({ color: 0xa0e8ff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const arcs = [];
  const bumpPairs = [[-0.15, -7.6, -1.85, -5.7], [-0.15, -7.6, 1.55, -5.7], [-1.85, -5.7, 1.55, -5.7]];
  for (const pr of bumpPairs) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(12 * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const line = new THREE.Line(geo, arcMat.clone());
    cab.add(line);
    arcs.push({ line, from: [pr[0], 0.6, pr[1]], to: [pr[2], 0.6, pr[3]], t: 0 });
  }
  features.arcs = arcs;

  // ---------- EXTRA POSTS (rubber corners, no dead pockets) ----------
  const posts = [
    { x: -3.35, z: 8.15, r: 0.16, e: 0.5 },
    { x: 2.95, z: 8.15, r: 0.16, e: 0.5 },
    { x: -5.85, z: 2.2, r: 0.14, e: 0.45 },
    { x: 5.0, z: 2.2, r: 0.14, e: 0.45 },
    { x: -5.7, z: -9.6, r: 0.14, e: 0.45 },
    { x: 4.5, z: -11.0, r: 0.14, e: 0.45 },
    { x: -2.2, z: 3.5, r: 0.13, e: 0.5 },
    { x: 1.85, z: 3.5, r: 0.13, e: 0.5 },
    { x: -4.7, z: 5.5, r: 0.12, e: 0.5 },
    { x: 4.15, z: 5.5, r: 0.12, e: 0.5 },
  ];
  for (const p of posts) {
    part(cab, new THREE.CylinderGeometry(p.r, p.r, 0.45, 10), std(0x1a0a08, { roughness: 0.7 }), p.x, 0.22, p.z);
    part(cab, new THREE.TorusGeometry(p.r, 0.03, 6, 12), glow(0xff8a20, 0.8), p.x, 0.28, p.z, Math.PI / 2);
  }
  features.posts = posts;

  // ---------- DMD (dot-matrix style strip under the score window, on the backglass) ----------
  // Built in table.js near the backglass — we expose a factory.
  features.makeDmd = (parent, x, y, z, w, h) => {
    const cnv = document.createElement('canvas');
    cnv.width = 512; cnv.height = 128;
    const c = cnv.getContext('2d');
    const tex = new THREE.CanvasTexture(cnv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true })
    );
    mesh.position.set(x, y, z);
    parent.add(mesh);
    const state = { line1: 'THE RIFT & THE REACH', line2: 'PRESS START', blink: 0 };
    function draw(score, balls, mode, callout) {
      c.fillStyle = '#020806'; c.fillRect(0, 0, 512, 128);
      // scanline dots
      c.fillStyle = '#03140e';
      for (let yy = 0; yy < 128; yy += 3) c.fillRect(0, yy, 512, 1);
      c.font = 'bold 36px "Courier New", monospace';
      c.fillStyle = '#4cff9a';
      c.textAlign = 'center';
      const top = callout || state.line1;
      c.fillText(top.slice(0, 22), 256, 48);
      c.font = 'bold 26px "Courier New", monospace';
      c.fillStyle = '#9dffc8';
      const bot = callout ? (state.line2 || '') : (mode || state.line2);
      c.fillText((bot + '   ' + (score != null ? String(score).padStart(8, '0') : '')).slice(0, 28), 256, 96);
      if (balls != null) {
        c.textAlign = 'left'; c.font = 'bold 18px "Courier New", monospace';
        c.fillStyle = '#ffe08a';
        c.fillText('BALL ' + balls, 12, 122);
      }
      tex.needsUpdate = true;
    }
    draw(0, 3, 'PINBALL');
    features.dmd = { mesh, canvas: cnv, ctx: c, tex, state, draw };
    return features.dmd;
  };

  return features;
}

export function enclosedWalls() {
  // Fully closed outer shell. Drain is a detected zone in front of a hard cabinet wall —
  // the ball can never leave the machine.
  return [
    // left rail, continuous to the back
    { a: [-6.3, 9.5], b: [-6.3, 2.0], r: 0.14, e: 0.3 },
    { a: [-6.3, 2.0], b: [-6.4, -4.0], r: 0.14, e: 0.3 },
    { a: [-6.4, -4.0], b: [-6.15, -10.0], r: 0.14, e: 0.3 },
    { a: [-6.15, -10.0], b: [-5.3, -14.3], r: 0.14, e: 0.3 },
    { a: [-5.3, -14.3], b: [-3.2, -16.0], r: 0.14, e: 0.3 },
    { a: [-3.2, -16.0], b: [0.0, -16.55], r: 0.14, e: 0.3 },
    // right back arch to the lane-exit mouth, then the mouth is a one-way gate
    { a: [0.0, -16.55], b: [2.6, -16.0], r: 0.14, e: 0.3 },
    { a: [2.6, -16.0], b: [4.4, -14.3], r: 0.14, e: 0.3 },
    { a: [4.4, -14.3], b: [4.75, -12.2], r: 0.14, e: 0.3 },
    // close the upper-right shell into a hood just above the shooter exit
    { a: [4.75, -12.2], b: [5.15, -10.0], r: 0.14, e: 0.3 },
    { a: [5.15, -10.0], b: [5.2, -9.25], r: 0.14, e: 0.3 },
    // plunger lane LEFT / divider — STOPS at the mouth so the ball can leave left
    { a: [6.0, 9.5], b: [6.0, -2.0], r: 0.1, e: 0.28 },
    { a: [6.0, -2.0], b: [6.0, -7.45], r: 0.1, e: 0.28 },
    // plunger lane RIGHT, curving into a leftward shooter groove
    { a: [7.2, 9.5], b: [7.2, -2.0], r: 0.1, e: 0.28 },
    { a: [7.2, -2.0], b: [7.15, -7.2], r: 0.1, e: 0.28 },
    { a: [7.15, -7.2], b: [6.9, -8.4], r: 0.1, e: 0.22 },
    { a: [6.9, -8.4], b: [6.2, -9.15], r: 0.11, e: 0.2 },
    { a: [6.2, -9.15], b: [5.2, -9.25], r: 0.11, e: 0.18 }, // dumps the ball left onto the field
    // lower-right playfield / outlane, joins the divider on the PLAYFIELD side (no poke into the lane)
    { a: [5.25, 9.5], b: [5.25, 2.0], r: 0.14, e: 0.3 },
    { a: [5.25, 2.0], b: [5.70, -2.0], r: 0.14, e: 0.3 },
    // FRONT cabinet wall — hard stop across the entire apron (drain is detected in front of this)
    { a: [-6.3, 9.55], b: [7.2, 9.55], r: 0.18, e: 0.15 },
    // bottom aprons (drain mouth lives between them)
    { a: [-6.3, 8.35], b: [-3.45, 8.75], r: 0.12, e: 0.28 },
    { a: [5.25, 8.35], b: [3.05, 8.75], r: 0.12, e: 0.28 },
    // inlane / outlane dividers
    { a: [-3.55, 8.7], b: [-3.15, 5.55], r: 0.09, e: 0.4 },
    { a: [3.25, 8.7], b: [2.85, 5.55], r: 0.09, e: 0.4 },
    // plunger backstop
    { a: [6.0, 8.4], b: [7.2, 8.4], r: 0.16, e: 0.2 },
    // one-way gate at the lane exit: solid only from the playfield (keeps returns from falling back in)
    { a: [6.0, -7.45], b: [6.0, -9.05], r: 0.08, e: 0.2, oneWay: { nx: -1, nz: 0 } },
  ];
}

export function slingSegments() {
  return [
    { a: [-4.25, 5.45], b: [-2.15, 3.15], r: 0.11, kick: 16, index: 0 },
    { a: [3.75, 5.45], b: [1.75, 3.15], r: 0.11, kick: 16, index: 1 },
  ];
}
