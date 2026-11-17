// Portal A — THE RIFT: Rygar-style third-person action on cyan floating islands.
import * as THREE from 'three';
import { std, glow, additive, part, grp, Tex, instanced, rnd, pick, clamp } from './util.js';
import { holographicMat, buildDarkTree, buildIsland, buildStormWisp, buildIslandCrawler, buildStormBird } from './models.js';

export function buildRiftWorld() {
  const group = new THREE.Group();
  group.visible = false;

  // storm sky
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { time: { value: 0 }, flash: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `
      uniform float time, flash; varying vec3 vP;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      void main(){
        float y = vP.y;
        vec3 top = vec3(0.02, 0.06, 0.10);
        vec3 hor = vec3(0.04, 0.18, 0.22);
        vec3 bot = vec3(0.01, 0.04, 0.06);
        vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y,0.0,1.0), 0.6)) : mix(hor, bot, clamp(-y*3.0,0.0,1.0));
        c += vec3(0.1, 0.35, 0.4) * pow(h21(vP.xz * 3.0), 2.0) * 0.4;
        c += vec3(0.6, 0.9, 1.0) * flash * 0.55;
        // rain streaks
        float rain = step(0.97, h21(vec2(vP.x * 40.0, fract(vP.y * 8.0 + time * 0.8))));
        c += vec3(0.4, 0.7, 0.8) * rain * 0.25;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(280, 20, 14), skyMat));

  // walkable islands: {x,z,r,y}
  const islands = [
    { x: 0, z: 8, r: 7.5, y: 0, name: 'start' },
    { x: -12, z: -2, r: 5.5, y: 0.4 },
    { x: 12, z: -1, r: 5.2, y: 0.2 },
    { x: 0, z: -12, r: 6.5, y: 1.1, name: 'tree' },
    { x: -8, z: -18, r: 4.2, y: 1.8 },
    { x: 9, z: -20, r: 4.6, y: 1.6 },
    { x: 0, z: -28, r: 5.5, y: 2.4, name: 'exit' },
    { x: -18, z: -10, r: 3.6, y: 1.2 },
    { x: 18, z: -10, r: 3.5, y: 1.0 },
  ];

  const isleColor = 0x163848;
  for (const isl of islands) {
    const m = buildIsland(isl.r, isl.r * 1.1, isleColor);
    m.position.set(isl.x, isl.y, isl.z);
    group.add(m);
    // cyan sheen
    const w = new THREE.Mesh(new THREE.CircleGeometry(isl.r * 0.85, 16), additive(0x40e8ff, 0.16, { side: THREE.DoubleSide }));
    w.rotation.x = -Math.PI / 2; w.position.set(isl.x, isl.y + 0.13, isl.z); group.add(w);
  }

  // glass bridges between nearby islands
  const links = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6], [1, 7], [2, 8]];
  const holo = holographicMat(0x40e8ff, 0.35);
  const bridges = [];
  for (const [ia, ib] of links) {
    const a = islands[ia], b = islands[ib];
    const dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
    const len = Math.hypot(dx, dz);
    const mid = grp(group, (a.x + b.x) / 2, (a.y + b.y) / 2 + 0.12, (a.z + b.z) / 2);
    mid.rotation.y = Math.atan2(dx, dz);
    const plat = part(mid, new THREE.BoxGeometry(1.4, 0.12, len - a.r - b.r + 0.8), holo, 0, 0, 0);
    part(mid, new THREE.BoxGeometry(0.06, 0.06, len - a.r - b.r + 0.8), glow(0x40e8ff, 1.4), 0.7, 0.08, 0);
    part(mid, new THREE.BoxGeometry(0.06, 0.06, len - a.r - b.r + 0.8), glow(0x40e8ff, 1.4), -0.7, 0.08, 0);
    bridges.push({ a, b, y: (a.y + b.y) / 2, len, dx, dz, mid });
  }

  const tree = buildDarkTree(2.2);
  tree.position.set(0, 1.1, -12); group.add(tree);

  // distant background islands (non-walkable)
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2, r = 40 + rnd(0, 30);
    const isl = buildIsland(rnd(1.5, 3.5), rnd(2, 5), 0x102830);
    isl.position.set(Math.cos(a) * r, rnd(-8, -2), Math.sin(a) * r - 10);
    group.add(isl);
  }

  // rusty planet in the sky
  const planet = new THREE.Mesh(new THREE.SphereGeometry(14, 20, 14), std(0x6a3a28, { roughness: 0.9, emissive: 0x1a0804, emissiveIntensity: 0.25 }));
  planet.position.set(-40, 22, -50); group.add(planet);

  const hemi = new THREE.HemisphereLight(0x80e0ff, 0x041018, 0.9); group.add(hemi);
  const dir = new THREE.DirectionalLight(0xb8f0ff, 1.05); dir.position.set(-12, 30, 8); group.add(dir);
  const stormLight = new THREE.PointLight(0xa0e8ff, 0.5, 40, 2); stormLight.position.set(0, 18, -8); group.add(stormLight);

  // exit rift (appears when goal met)
  const exit = grp(group, 0, 2.4, -28);
  exit.visible = false;
  part(exit, new THREE.TorusGeometry(1.6, 0.12, 10, 28), glow(0x40e8ff, 2.2), 0, 1.6, 0, 0, 0, 0);
  part(exit, new THREE.TorusGeometry(1.9, 0.05, 8, 28), glow(0xc0ffff, 1.6), 0, 1.6, 0);
  const vortex = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), additive(0x40e8ff, 0.7, { map: Tex.ring(), side: THREE.DoubleSide }));
  vortex.position.y = 1.6; exit.add(vortex);
  const exitLight = new THREE.PointLight(0x40e8ff, 2, 12, 2); exitLight.position.y = 1.6; exit.add(exitLight);

  const spawnPts = islands.filter(i => i.name !== 'start').map(i => new THREE.Vector3(i.x, i.y, i.z));

  let flash = 0, boltT = 0;
  function update(t, dt) {
    skyMat.uniforms.time.value = t;
    skyMat.uniforms.flash.value = flash;
    flash = Math.max(0, flash - dt * 4);
    boltT -= dt;
    if (boltT <= 0) { flash = 1; boltT = rnd(1.4, 3.5); stormLight.intensity = 6; }
    stormLight.intensity = dampSafe(stormLight.intensity, 0.5, 6, dt);
    tree.rotation.z = Math.sin(t * 0.4) * 0.03;
    vortex.rotation.z += dt * 1.5;
    exit.rotation.y += dt * 0.4;
    if (holo.userData.time) holo.userData.time.value = t;
  }

  function groundAt(pos, prevY = 0, step = 0.4) {
    let best = -40, hit = null;
    for (const isl of islands) {
      const d = Math.hypot(pos.x - isl.x, pos.z - isl.z);
      if (d <= isl.r + 0.15 && isl.y <= (prevY || pos.y) + step + 0.5) {
        if (isl.y >= best) { best = isl.y; hit = isl; }
      }
    }
    // bridges
    for (const br of bridges) {
      const lx = pos.x - br.a.x, lz = pos.z - br.a.z;
      const len = br.len || 1;
      const ux = br.dx / len, uz = br.dz / len;
      const t = lx * ux + lz * uz;
      const px = lx - ux * t, pz = lz - uz * t;
      const lateral = Math.hypot(px, pz);
      if (t > br.a.r * 0.6 && t < len - br.b.r * 0.6 && lateral < 0.85) {
        const y = br.a.y + (br.b.y - br.a.y) * (t / len);
        if (y <= (prevY || pos.y) + step + 0.5 && y >= best) { best = y; hit = br; }
      }
    }
    return { y: best, box: hit };
  }

  function resolveHoriz(pos, rad) {
    for (const isl of islands) {
      // no wall — islands have open edges (you can fall)
    }
    // keep on bridges laterally a little? no, allow falling
    return pos;
  }

  function spawnPos() {
    const p = pick(spawnPts);
    const a = Math.random() * 6.28, r = rnd(0.5, 2.2);
    return new THREE.Vector3(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r);
  }

  const start = new THREE.Vector3(0, 0, 10);
  const exitPos = new THREE.Vector3(0, 2.4, -28);

  return {
    group, skyMat, islands, bridges, tree, exit, exitPos, start, spawnPts,
    stormLight, holo, update, groundAt, resolveHoriz, spawnPos,
    hemi, dir, look: {
      fog: { color: 0x083038, density: 0.012 },
      bloom: 0.7, exposure: 1.05,
    }
  };
}

function dampSafe(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }

export const RIFT_ENEMIES = {
  wisp:    { name: 'STORM WISP', build: () => buildStormWisp(1), hp: 2, r: 0.5, h: 0.8, hitY: 0.2, hitR: 0.7, score: 200, kind: 'storm', fly: true, debris: [0x40e8ff, 0xc0ffff, 0x206080] },
  crawler: { name: 'ISLAND CRAWLER', build: () => buildIslandCrawler(1), hp: 3, r: 0.5, h: 0.8, hitY: 0.4, hitR: 0.7, score: 250, kind: 'beast', fly: false, debris: [0x2a3a44, 0xff4020, 0x40e8ff] },
  bird:    { name: 'STORM BIRD', build: () => buildStormBird(1), hp: 2, r: 0.6, h: 0.6, hitY: 0.1, hitR: 0.8, score: 220, kind: 'storm', fly: true, debris: [0x1a2830, 0x40e8ff, 0xc0ffff] },
};
