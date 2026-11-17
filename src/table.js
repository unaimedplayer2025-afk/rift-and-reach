// THE RIFT & THE REACH — pinball table, dark Grayskull + pirate reskin.
// Visuals only. Collision paths, layout, and physics are unchanged.
import * as THREE from 'three';
import { std, part, grp, Tex, makeCurve, clamp, lerp, damp, rnd } from './util.js';
import { buildTableFeatures, enclosedWalls, slingSegments } from './table-features.js';
import {
  C, stoneMat, timberMat, rustMat, ironMat, goldMat, boneMat, pitchMat, eyeMat,
  makeSkull, makeKeg, makeBrain, makePtero, makeChain, makeChest, makeCannon,
  makeCoins, makeBone, stonePlayfieldMat, evilSkyMat, loadPortalArt,
} from './theme.js';

export const BALL_R = 0.42;

export function buildTable() {
  const root = new THREE.Group();
  const holoMats = [];
  const energyMats = [];
  const stone = stoneMat();
  const pitch = pitchMat();
  const rust = rustMat();
  const iron = ironMat();
  const timber = timberMat();
  const rotWood = timberMat(C.rotWood);
  const gold = goldMat();
  const bone = boneMat();

  // ---------- SKY / FOG BACKDROP (dark teal-purple, no neon nebula)
  const space = new THREE.Group(); root.add(space);
  const skyMat = evilSkyMat();
  space.add(new THREE.Mesh(new THREE.SphereGeometry(420, 24, 16), skyMat));
  // pale cursed moon
  const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 16, 12), std(0x8a8a90, { roughness: 1, metalness: 0, emissive: 0x202028, emissiveIntensity: 0.2 }));
  moon.position.set(28, 22, -60); space.add(moon);
  // fog banks
  const fogMat = new THREE.MeshBasicMaterial({ color: 0x2a1840, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(80, 18), fogMat.clone());
    f.rotation.x = -0.12;
    f.position.set((i - 1.5) * 8, 1 + i * 0.4, -28 - i * 4);
    f.material.opacity = 0.12 + i * 0.04;
    space.add(f);
  }

  // ---------- CABINET: near-black stone fortress, rotting timbers, rivets
  const cab = grp(root);
  part(cab, new THREE.BoxGeometry(22, 1.4, 30), pitch, 0, -0.8, -3);
  part(cab, new THREE.BoxGeometry(0.7, 2.4, 28), stone, -8.2, 0.4, -3);
  part(cab, new THREE.BoxGeometry(0.7, 2.4, 28), stone, 8.2, 0.4, -3);
  // timber gunwales instead of cyan trim
  part(cab, new THREE.BoxGeometry(0.18, 0.22, 28), rotWood, -8.5, 1.45, -3);
  part(cab, new THREE.BoxGeometry(0.18, 0.22, 28), rotWood, 8.5, 1.45, -3);
  part(cab, new THREE.BoxGeometry(18, 0.22, 0.18), rotWood, 0, 1.45, 10.8);
  // iron rivets along the rails
  for (let z = 9; z > -15; z -= 1.6) {
    part(cab, new THREE.SphereGeometry(0.06, 6, 4), rust, -8.5, 1.55, z);
    part(cab, new THREE.SphereGeometry(0.06, 6, 4), rust, 8.5, 1.55, z);
  }
  // backbox / fortress wall — frame with a mouth opening so the portal art is visible
  // left / right pillars
  part(cab, new THREE.BoxGeometry(2.2, 10.2, 1.6), pitch, -6.3, 5.1, -17.6);
  part(cab, new THREE.BoxGeometry(2.2, 10.2, 1.6), pitch, 6.3, 5.1, -17.6);
  // lintel and sill
  part(cab, new THREE.BoxGeometry(14.8, 1.5, 1.6), pitch, 0, 10.6, -17.6);
  part(cab, new THREE.BoxGeometry(14.8, 2.0, 1.8), pitch, 0, 1.0, -17.7);
  // rust iron trim around the opening
  part(cab, new THREE.BoxGeometry(10.8, 0.18, 0.35), rust, 0, 9.85, -16.75);
  part(cab, new THREE.BoxGeometry(10.8, 0.18, 0.35), rust, 0, 2.05, -16.75);
  part(cab, new THREE.BoxGeometry(0.18, 8.0, 0.35), rust, -5.3, 5.95, -16.75);
  part(cab, new THREE.BoxGeometry(0.18, 8.0, 0.35), rust, 5.3, 5.95, -16.75);

  // ---------- PLAYFIELD (dark stone / planks, portal wash from the back)
  const pfMat = stonePlayfieldMat();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14.2, 24.5, 1, 1), pfMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(-0.2, 0.01, -3.5);
  cab.add(floor);
  // corner plaques — weathered gold coin rings, not sigil neon
  function cornerPlaque(x, z, rot) {
    const g = grp(cab, x, 0.04, z); g.rotation.y = rot;
    part(g, new THREE.CylinderGeometry(1.7, 1.7, 0.05, 20), stoneMat(C.stoneHi), 0, 0, 0);
    part(g, new THREE.TorusGeometry(1.55, 0.05, 6, 20), rust, 0, 0.03, 0, Math.PI / 2);
    part(g, new THREE.TorusGeometry(0.7, 0.04, 6, 16), gold, 0, 0.04, 0, Math.PI / 2);
    return g;
  }
  cornerPlaque(-5.4, 7.6, 0.2);
  cornerPlaque(4.8, 7.6, -0.2);

  // ---------- OUTER WALLS + RAMPS: rusted chains and skulls on the EXISTING paths
  const rails = grp(cab);
  const leftRail = [
    [-6.2, 0.45, 8.2], [-6.2, 0.45, 2], [-6.3, 0.5, -4], [-6.0, 0.55, -10],
    [-5.2, 0.6, -14.2], [-3.2, 0.65, -15.8], [0, 0.7, -16.4]
  ];
  const rightLower = [
    [5.25, 0.45, 8.2], [5.25, 0.45, 2], [5.70, 0.45, -2]
  ];
  const rightUpper = [
    [3.9, 0.55, -12.4], [4.4, 0.6, -14.2], [2.6, 0.65, -15.8], [0, 0.7, -16.4]
  ];
  makeChain(rails, leftRail, { linkR: 0.10, thick: 0.028, step: 0.2, skullEvery: 11, skullScale: 0.36 });
  makeChain(rails, rightLower, { linkR: 0.10, thick: 0.028, step: 0.2, skullEvery: 10, skullScale: 0.36 });
  makeChain(rails, rightUpper, { linkR: 0.10, thick: 0.028, step: 0.2, skullEvery: 10, skullScale: 0.36 });
  // plunger lane walls — iron pipes, no glass
  function ironTube(pts, r) {
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(makeCurve(pts, false), 24, r, 6, false), iron);
    rails.add(mesh);
  }
  ironTube([[6.0, 0.4, 8.4], [6.0, 0.4, -2], [6.0, 0.45, -8.6]], 0.09);
  ironTube([[7.15, 0.4, 8.4], [7.15, 0.4, -2], [7.05, 0.45, -7], [6.85, 0.5, -9.2]], 0.09);

  // LEFT / RIGHT RAMPS — exact gameplay points, now rusted chains + skulls
  const rampL = [
    [-3.8, 0.35, 3.5], [-4.6, 0.9, 0.5], [-5.3, 1.6, -3.5], [-5.5, 2.0, -7.0],
    [-5.1, 1.5, -9.2], [-4.55, 0.55, -10.6]
  ];
  const rampR = [
    [2.8, 0.35, 3.2], [3.6, 1.0, 0.2], [4.2, 1.7, -3.8], [4.5, 2.1, -7.0],
    [4.0, 1.5, -9.2], [3.45, 0.55, -10.6]
  ];
  makeChain(rails, rampL, { linkR: 0.13, thick: 0.04, step: 0.18, skullEvery: 8, skullScale: 0.48 });
  makeChain(rails, rampR, { linkR: 0.13, thick: 0.04, step: 0.18, skullEvery: 8, skullScale: 0.48 });

  // timber / stone gates near flippers (same places as the old glass blocks)
  function timberGate(x, y, z, sx, sy, sz, rotY = 0) {
    const m = part(rails, new THREE.BoxGeometry(1, 1, 1), rotWood, x, y, z, 0, rotY, 0, sx, sy, sz);
    part(rails, new THREE.BoxGeometry(sx + 0.02, 0.04, sz + 0.02), rust, x, y + sy / 2, z, 0, rotY);
    return m;
  }
  timberGate(-3.6, 0.55, 3.8, 1.8, 1.1, 0.16, 0.35);
  timberGate(-2.6, 0.7, 2.2, 1.2, 1.5, 0.14, 0.15);
  timberGate(3.1, 0.55, 3.6, 1.7, 1.1, 0.16, -0.3);
  timberGate(2.3, 0.7, 2.0, 1.2, 1.5, 0.14, -0.15);
  timberGate(-2.2, 0.85, -3.2, 0.18, 1.7, 2.2, 0.1);
  timberGate(1.8, 0.85, -3.2, 0.18, 1.7, 2.2, -0.1);

  // hanging ropes / bones along the sides (decor, off the ball path)
  for (const [x, z, ry] of [[-7.4, 2, 0.2], [-7.5, -4, -0.1], [7.4, 1.5, -0.2], [7.3, -5, 0.15]]) {
    const bn = makeBone(1.1); bn.position.set(x, 1.1, z); bn.rotation.z = Math.PI / 2; bn.rotation.y = ry; cab.add(bn);
  }
  const chestL = makeChest(); chestL.position.set(-7.3, 0.15, 6.2); chestL.rotation.y = 0.4; cab.add(chestL);
  const chestR = makeChest(); chestR.position.set(7.15, 0.15, 5.4); chestR.rotation.y = -0.5; cab.add(chestR);
  const coins = makeCoins(10); coins.position.set(-5.2, 0.05, 8.3); cab.add(coins);
  const cannon = makeCannon(); cannon.position.set(7.4, 0.15, -1.5); cannon.rotation.y = -0.6; cab.add(cannon);

  // ---------- SKULL-FORTRESS + JOHN'S PORTAL as the back centerpiece
  // Carved skull facade; the open jaw is the gate. Behind it: his art, GameStop logo kept.
  // Built as a relief on the back wall (not a solid sphere) so the portal stays visible.
  const portalArtTex = loadPortalArt();
  const fortress = grp(root, 0, 0, 0);
  const jawRoot = grp(fortress, 0, 6.15, -16.95);
  const skullStone = stoneMat(0x1a1e1a);
  const skullHi = stoneMat(0x2c322c);
  // cranium / brow arch over the mouth (does not cover the portal)
  part(jawRoot, new THREE.BoxGeometry(10.2, 1.6, 1.3), skullStone, 0, 3.55, -0.15);
  part(jawRoot, new THREE.SphereGeometry(1.8, 12, 10), skullHi, 0, 3.7, 0.05, 0, 0, 0, 2.6, 0.7, 0.45);
  // cheek pillars
  part(jawRoot, new THREE.BoxGeometry(1.7, 5.6, 1.2), skullStone, -4.7, 0.6, -0.1);
  part(jawRoot, new THREE.BoxGeometry(1.7, 5.6, 1.2), skullStone, 4.7, 0.6, -0.1);
  // zygomatic bumps
  part(jawRoot, new THREE.SphereGeometry(0.85, 10, 8), skullHi, -4.05, 1.15, 0.25, 0, 0, 0, 1.05, 0.8, 0.5);
  part(jawRoot, new THREE.SphereGeometry(0.85, 10, 8), skullHi, 4.05, 1.15, 0.25, 0, 0, 0, 1.05, 0.8, 0.5);
  // eye sockets as stone rings (not solid black balls) with clear red eyes
  part(jawRoot, new THREE.TorusGeometry(0.72, 0.16, 8, 18), skullHi, -2.25, 2.45, 0.72);
  part(jawRoot, new THREE.TorusGeometry(0.72, 0.16, 8, 18), skullHi, 2.25, 2.45, 0.72);
  part(jawRoot, new THREE.CircleGeometry(0.62, 14), pitchMat({ color: 0x050505 }), -2.25, 2.45, 0.7);
  part(jawRoot, new THREE.CircleGeometry(0.62, 14), pitchMat({ color: 0x050505 }), 2.25, 2.45, 0.7);
  const eyeL = part(jawRoot, new THREE.SphereGeometry(0.36, 12, 8), eyeMat(C.eyeRed, 1.0), -2.25, 2.45, 0.82);
  const eyeR = part(jawRoot, new THREE.SphereGeometry(0.36, 12, 8), eyeMat(C.eyeRed, 1.0), 2.25, 2.45, 0.82);
  // nose cavity hanging into the opening, small so the logo stays clear
  part(jawRoot, new THREE.ConeGeometry(0.32, 0.7, 8), pitch, 0, 1.55, 0.7, 0.45);
  // upper teeth along the brow lip
  for (let i = -5; i <= 5; i++) {
    part(jawRoot, new THREE.BoxGeometry(0.32, 0.7, 0.28), bone, i * 0.42, 2.45, 0.55);
  }
  // lower jaw (the gate) — held open; sits on the sill, does not cover the logo
  const jaw = grp(jawRoot, 0, -3.15, 0.15);
  part(jaw, new THREE.BoxGeometry(8.6, 0.7, 1.5), skullStone, 0, 0, 0.1);
  for (let i = -5; i <= 5; i++) {
    part(jaw, new THREE.BoxGeometry(0.3, 0.55, 0.24), bone, i * 0.42, 0.45, 0.55);
  }
  jaw.rotation.x = 0.18;
  jawRoot.userData.jaw = jaw;
  jawRoot.userData.eyes = [eyeL, eyeR];

  // John's full art behind the open mouth. Logo stays exactly as he painted it.
  const ART = 13.2;
  const artPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(ART, ART),
    new THREE.MeshBasicMaterial({ map: portalArtTex, toneMapped: true })
  );
  // Portal ring sits in the upper-middle of the square (~v 0.62). Center the plane so
  // the GameStop wordmark lands in the jaw opening.
  // plane bottom = cy - ART/2; logo at v~0.60 -> y = cy - ART/2 + ART*0.60
  // want logo near y ≈ 6.7 (middle of the mouth). cy = 6.7 - ART*(0.60-0.5) = 5.38
  artPlane.position.set(0, 5.4, -18.55);
  fortress.add(artPlane);
  // faint 3D ring aligned to the painted portal (purple is the allowed glow)
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.05, 0.07, 8, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a0828, emissive: 0x7a20c8, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.4 })
  );
  // painted ring center ≈ art bottom + 0.60*ART = 5.4 - 6.6 + 7.92 = 6.72
  ring.position.set(0, 6.72, -18.35);
  fortress.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.5, 12, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xc060ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  );
  beam.position.set(0, 12.4, -18.4);
  fortress.add(beam);

  const portalLight = new THREE.PointLight(0xa040ff, 2.6, 36, 1.6);
  portalLight.position.set(0, 6.8, -16.0);
  fortress.add(portalLight);
  const portalFill = new THREE.PointLight(0x4a1870, 0.85, 28, 2);
  portalFill.position.set(0, 4.0, -10);
  fortress.add(portalFill);

  // low 3D peaks at the sill, in front of the painted mountains (below the logo)
  const peak = part(fortress, new THREE.ConeGeometry(2.2, 2.4, 6), stoneMat(0x1a1024), 0, 2.6, -18.15);
  peak.rotation.y = 0.3;
  part(fortress, new THREE.ConeGeometry(1.4, 1.7, 5), stoneMat(0x140c1c), -1.8, 2.2, -18.0);
  part(fortress, new THREE.ConeGeometry(1.2, 1.4, 5), stoneMat(0x120a18), 1.9, 2.1, -18.0);

  // Floating brain creatures (toys + targets) around the portal — animated in update()
  const brains = [];
  const brainSlots = [
    [-4.8, 8.8, -16.0, 0.8], [5.0, 8.5, -15.8, 0.75],
    [-6.0, 5.6, -14.8, 0.65], [6.2, 5.3, -14.6, 0.7],
    [-3.4, 10.2, -16.8, 0.5], [3.8, 10.5, -17.0, 0.55],
    [-5.2, 7.4, -15.2, 0.5], [5.4, 4.8, -15.0, 0.55],
    [-2.6, 9.2, -15.4, 0.42],
  ];
  for (let i = 0; i < brainSlots.length; i++) {
    const [x, y, z, sc] = brainSlots[i];
    const br = makeBrain(sc);
    br.position.set(x, y, z);
    fortress.add(br);
    brains.push({ mesh: br, home: new THREE.Vector3(x, y, z), phase: i * 0.7, speed: 0.5 + (i % 3) * 0.15, amp: 0.35 + (i % 4) * 0.1 });
  }
  // Pterodactyl-like flyers in the fog (replaces neon ships)
  const ships = [];
  for (let i = 0; i < 8; i++) {
    const s = makePtero(0.9 + (i % 3) * 0.25);
    s.userData.path = {
      c: new THREE.Vector3(rnd(-10, 10), rnd(6, 14), rnd(-22, -12)),
      rx: rnd(4, 9), rz: rnd(3, 7), phase: rnd(0, 6.28), speed: rnd(0.15, 0.35), yw: rnd(0.3, 0.8)
    };
    space.add(s); ships.push(s);
  }

  // ---------- SCORE / DMD plaque on the fortress sill (does not cover the portal)
  const BG_W = 8.4, BG_H = 1.7;
  const bg = grp(root, 0, 2.55, -16.55);
  part(bg, new THREE.BoxGeometry(BG_W + 0.3, BG_H + 0.25, 0.18), pitch, 0, 0, 0.02);
  part(bg, new THREE.BoxGeometry(BG_W + 0.4, 0.1, 0.14), rust, 0, BG_H / 2 + 0.04, 0.1);
  part(bg, new THREE.BoxGeometry(BG_W + 0.4, 0.1, 0.14), rust, 0, -BG_H / 2 - 0.04, 0.1);
  part(bg, new THREE.BoxGeometry(BG_W - 0.1, BG_H - 0.08, 0.04), stoneMat(0x0c0e0c), 0, 0, 0.1);
  const scoreW = 5.6, scoreH = 0.55;
  const scoreX = 0, scoreY = 0.42;
  const scoreTex = Tex.digits('SCORE:  0', '#c4a060');
  const scoreMesh = new THREE.Mesh(new THREE.PlaneGeometry(scoreW, scoreH), new THREE.MeshBasicMaterial({ map: scoreTex, transparent: true, toneMapped: false }));
  scoreMesh.position.set(scoreX, scoreY, 0.16); bg.add(scoreMesh);
  function setScore(n) {
    const s = 'SCORE:  ' + (n | 0).toLocaleString('en-US');
    const nt = Tex.digits(s, '#c4a060');
    const old = scoreMesh.material.map;
    scoreMesh.material.map = nt; scoreMesh.material.needsUpdate = true;
    if (old) old.dispose();
  }

  // ---------- FLIPPERS (rusted iron + bone, no neon strips)
  function buildFlipper(side) {
    const g = new THREE.Group();
    const body = part(g, new THREE.BoxGeometry(1.7, 0.22, 0.42), rust, 0.85, 0.12, 0);
    part(g, new THREE.BoxGeometry(0.35, 0.18, 0.32), rust, 1.65, 0.12, 0);
    part(g, new THREE.BoxGeometry(1.65, 0.03, 0.1), bone, 0.85, 0.24, 0);
    part(g, new THREE.CylinderGeometry(0.22, 0.22, 0.28, 12), iron, 0, 0.12, 0);
    const light = new THREE.PointLight(0x401018, 0, 3, 2); light.position.set(0.8, 0.4, 0); g.add(light);
    g.userData.body = body; g.userData.light = light; g.userData.side = side;
    return g;
  }
  const flipL = buildFlipper(-1); flipL.position.set(-1.9, 0, 6.45); cab.add(flipL);
  const flipR = buildFlipper(1); flipR.position.set(1.55, 0, 6.45); flipR.scale.x = -1; cab.add(flipR);
  const FLIP_REST_L = -0.42, FLIP_UP_L = 0.72;
  const FLIP_REST_R = -0.42, FLIP_UP_R = 0.72;
  flipL.rotation.y = FLIP_REST_L; flipR.rotation.y = -FLIP_REST_R;

  // ---------- PLUNGER: rusted iron rod
  const plungerGrp = grp(cab, 6.57, 0.25, 8.05);
  const plungerRod = part(plungerGrp, new THREE.CylinderGeometry(0.09, 0.09, 2.4, 12), rust, 0, 0, 0, Math.PI / 2);
  plungerRod.position.set(0, 0.05, 0.6);
  const plungerKnob = part(plungerGrp, new THREE.SphereGeometry(0.2, 12, 8), rust, 0, 0.05, 1.75);
  part(plungerGrp, new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), iron, 0, 0.05, 1.45, Math.PI / 2);
  part(cab, new THREE.BoxGeometry(0.9, 0.5, 1.6), pitch, 6.57, 0.2, 8.6);
  part(cab, new THREE.BoxGeometry(0.94, 0.06, 1.64), rust, 6.57, 0.46, 8.6);

  // ---------- BUMPERS: skulls (and one keg), same x/z/r
  const bumpers = [];
  function buildBumper(x, z, kind) {
    const g = grp(cab, x, 0, z);
    part(g, new THREE.CylinderGeometry(0.55, 0.62, 0.16, 14), rust, 0, 0.08, 0);
    let cap, eyes = [];
    if (kind === 'keg') {
      const keg = makeKeg(1.15); keg.position.y = 0.02; g.add(keg); cap = keg;
    } else {
      const sk = makeSkull(1.15, kind === 'green' ? C.eyeGreen : C.eyeRed);
      sk.position.set(0, 0.55, 0); sk.rotation.x = -0.15; g.add(sk);
      cap = sk; eyes = sk.userData.eyes || [];
    }
    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.8),
      new THREE.MeshBasicMaterial({ color: 0x200808, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; g.add(halo);
    const light = new THREE.PointLight(0x401010, 0, 3, 2); light.position.y = 0.6; g.add(light);
    const b = { x, z, r: 0.62, group: g, cap, halo, light, color: 0x401010, flash: 0, kick: 15, eyes };
    bumpers.push(b);
    return b;
  }
  buildBumper(-0.15, -7.6, 'red');
  buildBumper(-1.85, -5.7, 'keg');
  buildBumper(1.55, -5.7, 'green');

  // slings: rotting rubber / timber wedges, no orange neon
  const slings = [];
  function buildSling(x, z, dir) {
    const g = grp(cab, x, 0, z);
    part(g, new THREE.BoxGeometry(0.16, 0.4, 1.8), rotWood, 0, 0.22, 0, 0, dir * 0.5, 0);
    part(g, new THREE.BoxGeometry(0.05, 0.08, 1.8), rust, 0, 0.42, 0, 0, dir * 0.5, 0);
    const light = new THREE.PointLight(0x301010, 0, 2, 2); light.position.y = 0.4; g.add(light);
    slings.push({ x, z, dir, group: g, light, flash: 0, nx: Math.cos(dir * 0.5 + Math.PI / 2 * Math.sign(dir) || -1), nz: Math.sin(dir * 0.5 + Math.PI / 2 * Math.sign(dir) || -1) });
    return slings[slings.length - 1];
  }
  buildSling(-3.15, 4.15, 1);
  buildSling(2.75, 4.15, -1);

  // stand-up targets (top row) — small skulls, same positions
  const targets = [];
  function buildTarget(x, z) {
    const g = grp(cab, x, 0, z);
    part(g, new THREE.BoxGeometry(0.55, 0.55, 0.12), rust, 0, 0.32, 0);
    const sk = makeSkull(0.55, C.eyeGreen);
    sk.position.set(0, 0.42, 0.12); g.add(sk);
    const t = { x, z, r: 0.4, group: g, face: sk, color: 0x2a1010, down: false, flash: 0 };
    targets.push(t);
    return t;
  }
  buildTarget(-3.4, -14.2);
  buildTarget(-1.6, -15.0);
  buildTarget(0.0, -15.3);
  buildTarget(1.5, -15.0);
  buildTarget(3.1, -14.2);

  // PORTALS — iron rings, purple wash only when lit (no cyan/orange neon tubes)
  function buildPortal(x, z, label) {
    const g = grp(cab, x, 0, z);
    part(g, new THREE.TorusGeometry(0.85, 0.08, 8, 24), rust, 0, 0.06, 0, Math.PI / 2);
    part(g, new THREE.TorusGeometry(0.62, 0.04, 6, 20), iron, 0, 0.08, 0, Math.PI / 2);
    const well = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 20),
      new THREE.MeshStandardMaterial({ color: 0x0a060c, emissive: 0x3a1060, emissiveIntensity: 0.15, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide })
    );
    well.rotation.x = -Math.PI / 2; well.position.y = 0.04; g.add(well);
    const swirl = new THREE.Mesh(
      new THREE.CircleGeometry(0.65, 20),
      new THREE.MeshBasicMaterial({ color: 0x6a20a0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    swirl.rotation.x = -Math.PI / 2; swirl.position.y = 0.07; g.add(swirl);
    const light = new THREE.PointLight(0x7018b0, 0.05, 5, 2); light.position.y = 0.6; g.add(light);
    const labTex = Tex.sign(label, '#c4a060', 'rgba(0,0,0,0)', 'bold 64px "Times New Roman", serif');
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.4), new THREE.MeshBasicMaterial({ map: labTex, transparent: true, toneMapped: false, depthWrite: false }));
    lab.position.set(0, 1.15, 0); g.add(lab);
    return { x, z, r: 0.75, group: g, well, swirl, light, color: 0x7018b0, lit: false, charge: 0, label };
  }
  const portalRift = buildPortal(-4.55, -10.6, 'THE RIFT');
  const portalReach = buildPortal(3.45, -10.6, 'THE REACH');
  const portalReentry = buildPortal(0.05, -12.85, 'RE-ENTRY');

  // High-end toys / rails / lid / mini — same collision, new visuals
  const feat = buildTableFeatures(cab, { BALL_R, rampL, rampR });

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

  const dmd = feat.makeDmd(bg, 0, -0.35, 0.16, 7.2, 0.7);

  // Lighting: dim moonlight fill + the purple portal as the only real source
  const key = new THREE.PointLight(0x8a8a9a, 0.28, 32, 2); key.position.set(18, 16, 4); root.add(key);
  const fill = new THREE.HemisphereLight(0x1a2430, 0x080604, 0.22); root.add(fill);
  // keep rim refs so older code doesn't explode; intensity 0 — no neon rims
  const rimL = new THREE.PointLight(0x000000, 0, 1, 2); root.add(rimL);
  const rimR = new THREE.PointLight(0x000000, 0, 1, 2); root.add(rimR);
  const stormLight = { intensity: 0 };
  const streamMain = { uniforms: { pull: { value: 0 }, time: { value: 0 } } };
  const bolts = [];

  const state = {
    flash: 0, stormT: 0, stormOn: 0,
    portalPull: { rift: 0, reach: 0, reentry: 0 },
  };

  function flashBumper(b, strength = 1) {
    b.flash = Math.max(b.flash, strength);
    b.light.intensity = 1.2 * strength;
    b.halo.material.opacity = 0.35 * strength;
    state.flash = Math.max(state.flash, 0.5 * strength);
  }
  function setPortalLit(which, lit) {
    const p = which === 'rift' ? portalRift : which === 'reach' ? portalReach : portalReentry;
    if (!p) return;
    p.lit = lit;
    p.light.intensity = lit ? 1.1 : 0.05;
    if (p.well.material.emissiveIntensity != null) p.well.material.emissiveIntensity = lit ? 0.7 : 0.15;
  }

  function update(t, dt) {
    pfMat.uniforms.time.value = t;
    pfMat.uniforms.flash.value = state.flash;
    skyMat.uniforms.time.value = t;
    state.flash = Math.max(0, state.flash - dt * 1.8);

    state.portalPull.rift = damp(state.portalPull.rift, portalRift.lit ? 1 : 0, 3, dt);
    state.portalPull.reach = damp(state.portalPull.reach, portalReach.lit ? 1 : 0, 3, dt);
    state.portalPull.reentry = damp(state.portalPull.reentry || 0, portalReentry.lit ? 1 : 0, 3, dt);

    // portal wells
    portalRift.swirl.rotation.z += dt * (portalRift.lit ? 1.4 : 0.25);
    portalReach.swirl.rotation.z -= dt * (portalReach.lit ? 1.4 : 0.25);
    portalReentry.swirl.rotation.z += dt * (portalReentry.lit ? 1.6 : 0.25);
    portalRift.swirl.material.opacity = 0.08 + state.portalPull.rift * 0.45;
    portalReach.swirl.material.opacity = 0.08 + state.portalPull.reach * 0.45;
    portalReentry.swirl.material.opacity = 0.08 + (state.portalPull.reentry || 0) * 0.45;
    portalRift.group.scale.setScalar(1 + Math.sin(t * 2) * 0.02 * (portalRift.lit ? 1 : 0.3));
    portalReach.group.scale.setScalar(1 + Math.sin(t * 2 + 1) * 0.02 * (portalReach.lit ? 1 : 0.3));
    portalReentry.group.scale.setScalar(1 + Math.sin(t * 2 + 2) * 0.02 * (portalReentry.lit ? 1 : 0.3));

    // portal ring + light pulse (the one allowed glow)
    ring.material.emissiveIntensity = 0.55 + Math.sin(t * 1.6) * 0.18;
    portalLight.intensity = 2.3 + Math.sin(t * 1.6) * 0.35;
    beam.material.opacity = 0.16 + Math.sin(t * 1.3) * 0.06;
    // skull eyes flicker faintly
    const flick = 0.4 + Math.sin(t * 7.5) * 0.12 + Math.sin(t * 13.0) * 0.06;
    eyeL.material.emissiveIntensity = flick;
    eyeR.material.emissiveIntensity = flick * 0.95;
    jaw.rotation.x = 0.55 + Math.sin(t * 0.7) * 0.03;

    for (const b of bumpers) {
      b.flash = Math.max(0, b.flash - dt * 3);
      b.light.intensity = damp(b.light.intensity, b.flash * 1.2, 10, dt);
      b.halo.material.opacity = damp(b.halo.material.opacity, b.flash * 0.3, 10, dt);
      b.group.scale.setScalar(1 + b.flash * 0.12);
      if (b.eyes) {
        for (const e of b.eyes) if (e.material) e.material.emissiveIntensity = 0.4 + b.flash * 0.8;
      }
    }
    for (const s of slings) {
      s.flash = Math.max(0, s.flash - dt * 4);
      s.light.intensity = s.flash * 0.8;
    }

    if (feat.inserts) {
      const ins = feat.inserts;
      const n = ins.pts.length;
      for (let i = 0; i < n; i++) {
        ins.flash[i] = Math.max(0, ins.flash[i] - dt * 2.8);
        ins.dummy.position.set(ins.pts[i][0], 0.03, ins.pts[i][1]);
        ins.dummy.rotation.x = -Math.PI / 2;
        ins.dummy.scale.setScalar(0.7 + ins.flash[i] * 0.4);
        ins.dummy.updateMatrix();
        ins.mesh.setMatrixAt(i, ins.dummy.matrix);
      }
      ins.mesh.instanceMatrix.needsUpdate = true;
    }
    for (const a of feat.arcs) {
      a.t = Math.max(0, a.t - dt);
      a.line.material.opacity = a.t > 0 ? Math.min(0.6, a.t * 6) : 0;
    }
    if (feat.orb) {
      feat.orb.group.rotation.y += dt * 0.5;
      if (feat.orb.ring) feat.orb.ring.rotation.x += dt * 0.8;
      if (feat.orb.ring2) feat.orb.ring2.rotation.z -= dt * 1.0;
      if (feat.orb.core) feat.orb.core.position.y = 0.7 + Math.sin(t * 1.6) * 0.08;
    }
    if (feat.diverter) {
      const want = feat.diverter._want || 0;
      feat.diverter.arm.rotation.y = damp(feat.diverter.arm.rotation.y, want ? 0.7 : -0.55, 8, dt);
    }
    if (feat.spinner && feat.spinner.arm) feat.spinner.arm.rotation.y = feat.spinner.angle || 0;
    if (feat.captive && feat.captive.mesh) feat.captive.mesh.position.set(0, 0.3, feat.captive.ballZ + 1.2);
    if (feat.magnet) {
      const on = !!feat.magnet.on;
      feat.magnet.light.intensity = damp(feat.magnet.light.intensity, on ? 0.7 : 0, 8, dt);
      if (feat.magnet.core && feat.magnet.core.material) feat.magnet.core.material.opacity = on ? 0.45 : 0.12;
    }
    if (feat.kickback && feat.kickback.face) {
      feat.kickback.face.material.color.setHex(feat.kickback.lit ? 0x6a5a28 : 0x1a140c);
    }
    for (const d of feat.drops) d.group.visible = !d.down;
    for (const s of feat.standups) {
      if (s.face && s.face.material && s.face.material.emissiveIntensity != null) {
        s.face.material.emissiveIntensity = s.lit ? 0.6 : 0.15;
      }
    }
    for (const r of feat.rollovers) {
      if (r.lamp && r.lamp.material) r.lamp.material.color.setHex(r.lit ? 0x6a5a28 : 0x1a140c);
    }

    // brains float and slowly spin
    for (const b of brains) {
      const a = t * b.speed + b.phase;
      b.mesh.position.set(
        b.home.x + Math.sin(a) * b.amp,
        b.home.y + Math.sin(a * 1.3) * (b.amp * 0.6),
        b.home.z + Math.cos(a * 0.8) * (b.amp * 0.5)
      );
      b.mesh.rotation.y = a * 0.4;
      b.mesh.rotation.z = Math.sin(a * 0.7) * 0.2;
      if (b.mesh.userData.tendrils) {
        for (let i = 0; i < b.mesh.userData.tendrils.length; i++) {
          b.mesh.userData.tendrils[i].rotation.x = Math.sin(a + i) * 0.25;
        }
      }
    }
    for (const s of ships) {
      const p = s.userData.path;
      const a = t * p.speed + p.phase;
      s.position.set(p.c.x + Math.cos(a) * p.rx, p.c.y + Math.sin(a * p.yw) * 1.1, p.c.z + Math.sin(a) * p.rz);
      s.lookAt(p.c.x + Math.cos(a + 0.2) * p.rx, s.position.y, p.c.z + Math.sin(a + 0.2) * p.rz);
      if (s.userData.wings) {
        const flap = Math.sin(t * 6 + p.phase) * 0.35;
        s.userData.wings[0].rotation.z = flap;
        s.userData.wings[1].rotation.z = -flap;
      }
    }
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
    brains, portalLight,
  };
}
