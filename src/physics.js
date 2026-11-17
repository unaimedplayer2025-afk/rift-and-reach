// Fixed-timestep 2D pinball solver on the playfield plane (XZ), rendered in 3D.
// 240 Hz substeps, circle vs capsule/circle, kinematic flippers, path rails,
// a glass lid, and a hard failsafe that never leaves a ball frozen in the void.
export const BALL_R = 0.42;
export const PHYS_HZ = 240;
export const PHYS_DT = 1 / 240;

const SLOPE = 6.5 * Math.PI / 180;
const G_PLAY = 9.81 * Math.sin(SLOPE) * 15.5; // ~17.2 u/s² along +Z (toward the player)
const FRICTION = 0.055;
const ROLL_DAMP = 0.012;
const MAX_SPEED = 46;
const EXTREME_SPEED = 80;
const LID_Y = 2.45;
const FLOOR_Y = BALL_R;

// Cabinet interior — anything outside this is a failsafe return, not a "drain".
export const BOUNDS = { x0: -7.15, x1: 8.15, z0: -17.4, z1: 10.4, y0: -0.2, y1: 6.4 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hypot = Math.hypot;
const finite = (n) => Number.isFinite(n);

function closestOnSeg(px, pz, ax, az, bx, bz, out) {
  const abx = bx - ax, abz = bz - az;
  const ab2 = abx * abx + abz * abz || 1;
  let t = ((px - ax) * abx + (pz - az) * abz) / ab2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  out.x = ax + abx * t; out.z = az + abz * t; out.t = t;
  return out;
}
const _c = { x: 0, z: 0, t: 0 };
const _c2 = { x: 0, z: 0, t: 0 };

function reflect(b, nx, nz, e, mu, kick) {
  const vn = b.vx * nx + b.vz * nz;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx;
    b.vz -= (1 + e) * vn * nz;
    const tx = -nz, tz = nx;
    const vt = b.vx * tx + b.vz * tz;
    const fr = Math.min(Math.abs(vt), mu * Math.abs(vn) * 1.2);
    const s = vt >= 0 ? 1 : -1;
    b.vx -= s * fr * tx;
    b.vz -= s * fr * tz;
  }
  if (kick) { b.vx += nx * kick; b.vz += nz * kick; }
  const spd = hypot(b.vx, b.vz);
  if (spd > MAX_SPEED) { b.vx *= MAX_SPEED / spd; b.vz *= MAX_SPEED / spd; }
}

function resolveCapsule(b, ax, az, bx, bz, wr, e, mu, kick, oneWay) {
  closestOnSeg(b.x, b.z, ax, az, bx, bz, _c);
  const dx = b.x - _c.x, dz = b.z - _c.z;
  const dist = hypot(dx, dz);
  const minD = b.r + wr;
  if (dist >= minD || dist < 1e-8) return 0;
  let nx = dx / dist, nz = dz / dist;
  if (oneWay) {
    // only collide when the ball is on the 'inside' (dot with oneWay normal is negative after push? )
    // oneWay is { nx, nz } pointing toward the solid side's exterior (the side that should bounce).
    if (nx * oneWay.nx + nz * oneWay.nz < 0.15) return 0;
  }
  const pen = minD - dist;
  b.x += nx * pen; b.z += nz * pen;
  reflect(b, nx, nz, e, mu, kick || 0);
  return pen;
}

function resolveCircle(b, cx, cz, cr, e, mu, kick) {
  const dx = b.x - cx, dz = b.z - cz;
  const dist = hypot(dx, dz);
  const minD = b.r + cr;
  if (dist >= minD || dist < 1e-8) return 0;
  const nx = dx / dist, nz = dz / dist;
  const pen = minD - dist;
  b.x += nx * pen; b.z += nz * pen;
  reflect(b, nx, nz, e, mu, kick || 0);
  return pen;
}

function resolveBallBall(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = hypot(dx, dz);
  const minD = a.r + b.r;
  if (dist >= minD || dist < 1e-8) return;
  const nx = dx / dist, nz = dz / dist;
  const pen = (minD - dist) * 0.5;
  a.x -= nx * pen; a.z -= nz * pen;
  b.x += nx * pen; b.z += nz * pen;
  const rvx = a.vx - b.vx, rvz = a.vz - b.vz;
  const vn = rvx * nx + rvz * nz;
  if (vn > 0) return;
  const j = -(1 + 0.45) * vn * 0.5;
  a.vx += j * nx; a.vz += j * nz;
  b.vx -= j * nx; b.vz -= j * nz;
}

function makeBall(id, x, z) {
  return {
    id, r: BALL_R,
    x, z, y: FLOOR_Y,
    vx: 0, vz: 0, vy: 0,
    omega: 0,
    live: false, inLane: true, pulling: false, charged: 0,
    path: null, pathS: 0, pathSpd: 0,
    stuckT: 0, stuckX: x, stuckZ: z,
    saveT: 0, captured: 0, capturer: null,
    heldByMagnet: 0,
  };
}

export function createWorld(layout) {
  const W = {
    layout,
    balls: [],
    acc: 0,
    events: [],
    flipL: { pressed: false, ang: layout.flipL.rest, omega: 0, held: false },
    flipR: { pressed: false, ang: layout.flipR.rest, omega: 0, held: false },
    miniFlip: { pressed: false, ang: layout.miniFlip ? layout.miniFlip.rest : 0, omega: 0, held: false },
    plungerDown: false,
    nudgeX: 0, nudgeZ: 0, nudgeT: 0, tiltMeter: 0, tilted: false, tiltWarn: 0,
    magnetOn: false, magnetT: 0,
    diverter: 0, // 0 left path, 1 right path
    time: 0,
    returned: 0,
  };

  function emit(type, ball, extra) {
    W.events.push(Object.assign({ type, ball, x: ball ? ball.x : 0, z: ball ? ball.z : 0, y: ball ? ball.y : 0 }, extra || {}));
  }

  function primary() { return W.balls[0] || null; }

  function addBall(x, z) {
    const b = makeBall(W.balls.length, x, z);
    W.balls.push(b);
    return b;
  }

  function clearExtraBalls() {
    W.balls.length = 1;
  }

  function resetBall(b, x, z, opts) {
    const L = layout.plunger;
    b.x = x != null ? x : L.x;
    b.z = z != null ? z : L.z;
    b.y = FLOOR_Y;
    b.vx = 0; b.vz = 0; b.vy = 0; b.omega = 0;
    b.live = !!(opts && opts.live);
    b.inLane = opts && opts.inLane != null ? opts.inLane : true;
    b.pulling = false; b.charged = 0;
    b.path = null; b.pathS = 0; b.pathSpd = 0;
    b.stuckT = 0; b.stuckX = b.x; b.stuckZ = b.z;
    b.captured = 0; b.capturer = null; b.heldByMagnet = 0;
    b.saveT = (opts && opts.save) ? opts.save : 0;
  }

  function returnToPlunger(b, why, silent) {
    const L = layout.plunger;
    const already = !b.live && b.inLane && hypot(b.x - L.x, b.z - L.z) < 0.2;
    resetBall(b, L.x, L.z, { live: false, inLane: true });
    if (!already && !silent) {
      W.returned++;
      emit('returned', b, { why: why || 'void' });
    }
  }

  function outOfBounds(b) {
    if (!finite(b.x) || !finite(b.z) || !finite(b.y) || !finite(b.vx) || !finite(b.vz) || !finite(b.vy)) return 'nan';
    const spd = hypot(b.vx, b.vz, b.vy);
    if (spd > EXTREME_SPEED) return 'speed';
    if (b.x < BOUNDS.x0 || b.x > BOUNDS.x1 || b.z < BOUNDS.z0 || b.z > BOUNDS.z1) return 'xz';
    if (b.y < BOUNDS.y0 || b.y > BOUNDS.y1) return 'y';
    return null;
  }

  function failsafe(b) {
    const why = outOfBounds(b);
    if (why) { returnToPlunger(b, why); return true; }
    return false;
  }

  function updateFlip(f, spec, dt) {
    if (W.tilted) f.pressed = false;
    const target = f.pressed ? spec.up : spec.rest;
    const rate = f.pressed ? (spec.upRate || 36) : (spec.downRate || 22);
    const prev = f.ang;
    const diff = target - f.ang;
    const max = rate * dt;
    if (Math.abs(diff) <= max) { f.ang = target; f.omega = dt > 0 ? (f.ang - prev) / dt : 0; }
    else { f.ang += Math.sign(diff) * max; f.omega = Math.sign(diff) * rate; }
    if (f.pressed && !f.held) { f.held = true; emit('flip', null, { side: spec.side }); }
    if (!f.pressed) f.held = false;
  }

  function collideFlipper(b, f, spec) {
    if (b.path || b.captured > 0) return;
    if (spec.y != null && b.y < spec.y - 0.55) return;
    const ang = f.ang;
    const len = spec.len, thick = spec.thick;
    const px = spec.x, pz = spec.z;
    const sign = spec.sign || 1; // left +1: tip = pivot + (cos, -sin)*len; right uses sign -1 with angle
    const dirx = sign * Math.cos(ang);
    const dirz = -Math.sin(ang);
    const tx = px + dirx * len, tz = pz + dirz * len;
    closestOnSeg(b.x, b.z, px, pz, tx, tz, _c);
    const dx = b.x - _c.x, dz = b.z - _c.z;
    const dist = hypot(dx, dz);
    const minD = b.r + thick;
    if (dist >= minD || dist < 1e-8) return;
    const nx = dx / dist, nz = dz / dist;
    const pen = minD - dist;
    b.x += nx * pen; b.z += nz * pen;
    // World ω around +Y: the right flipper's angle is mirrored, so ω_world = sign * d(ang)/dt.
    const arm = _c.t * len;
    const w = (spec.sign || 1) * f.omega;
    const fvx = w * dirz * arm;
    const fvz = -w * dirx * arm;
    const relx = b.vx - fvx, relz = b.vz - fvz;
    const vn = relx * nx + relz * nz;
    if (vn < 0) {
      const e = 0.28;
      b.vx = fvx + relx - (1 + e) * vn * nx;
      b.vz = fvz + relz - (1 + e) * vn * nz;
      if (Math.abs(f.omega) > 8) {
        const boost = clamp(Math.abs(f.omega) * arm * 0.55, 0, 22);
        b.vx += nx * boost;
        b.vz += nz * boost;
      }
    }
    const spd = hypot(b.vx, b.vz);
    if (spd > MAX_SPEED) { b.vx *= MAX_SPEED / spd; b.vz *= MAX_SPEED / spd; }
  }

  function enterPath(b, path, s0) {
    b.path = path; b.pathS = s0 || 0.02; b.pathSpd = Math.max(8, hypot(b.vx, b.vz) * 0.85);
    b.inLane = false;
    emit(path.kind === 'rail' ? 'railEnter' : 'rampEnter', b, { name: path.name, score: path.score || 0 });
  }

  function samplePath(path, s) {
    const pts = path.pts;
    const n = pts.length - 1;
    const u = clamp(s, 0, 0.9999) * n;
    const i = Math.min(n - 1, Math.floor(u));
    const f = u - i;
    const a = pts[i], c = pts[i + 1];
    return {
      x: a[0] + (c[0] - a[0]) * f,
      y: a[1] + (c[1] - a[1]) * f,
      z: a[2] + (c[2] - a[2]) * f,
      dx: c[0] - a[0], dy: c[1] - a[1], dz: c[2] - a[2],
    };
  }

  function stepPath(b, dt) {
    const path = b.path;
    // Gravity component along the path tangent, plus carried speed.
    const sm = samplePath(path, b.pathS);
    const len = hypot(sm.dx, sm.dy, sm.dz) || 1;
    const tx = sm.dx / len, ty = sm.dy / len, tz = sm.dz / len;
    // Playfield gravity is +Z; also a little -Y when descending.
    const gAlong = (G_PLAY * tz - 9.8 * ty * 0.35);
    b.pathSpd += gAlong * dt;
    b.pathSpd *= Math.max(0, 1 - 0.08 * dt);
    if (b.pathSpd < 3 && tz > 0.2) b.pathSpd = 3; // never stall on a downward rail
    const pathLen = path.length || approxPathLen(path);
    b.pathS += (b.pathSpd * dt) / pathLen;
    if (b.pathS >= 1) {
      const end = samplePath(path, 0.999);
      const elen = hypot(end.dx, end.dy, end.dz) || 1;
      b.x = end.x; b.y = Math.max(FLOOR_Y, end.y); b.z = end.z;
      const out = path.exitSpd || Math.max(10, b.pathSpd);
      b.vx = (end.dx / elen) * out;
      b.vy = (end.dy / elen) * out * 0.3;
      b.vz = (end.dz / elen) * out;
      b.path = null; b.pathS = 0;
      emit(path.kind === 'rail' ? 'railExit' : 'rampExit', b, { name: path.name });
      // Drop to floor if we exited near the playfield.
      if (b.y < FLOOR_Y + 0.35) { b.y = FLOOR_Y; b.vy = 0; }
      return;
    }
    if (b.pathS < 0) {
      const st = samplePath(path, 0);
      b.x = st.x; b.y = Math.max(FLOOR_Y, st.y); b.z = st.z;
      b.vx = -tx * 4; b.vz = -tz * 4; b.vy = 0;
      b.path = null; b.pathS = 0;
      return;
    }
    const p = samplePath(path, b.pathS);
    b.x = p.x; b.y = p.y; b.z = p.z;
    b.vx = tx * b.pathSpd; b.vy = ty * b.pathSpd; b.vz = tz * b.pathSpd;
  }

  function approxPathLen(path) {
    if (path._len) return path._len;
    let L = 0;
    for (let i = 1; i < path.pts.length; i++) {
      const a = path.pts[i - 1], c = path.pts[i];
      L += hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    }
    path._len = Math.max(1, L);
    return path._len;
  }

  function maybeEnterPaths(b) {
    if (b.path || b.captured > 0 || b.inLane) return;
    for (const path of layout.paths) {
      if (path.diverter != null && W.diverter !== path.diverter) continue;
      const e = path.enter;
      if (hypot(b.x - e.x, b.z - e.z) < e.r && hypot(b.vx, b.vz) > (e.minSpd || 6)) {
        if (e.dirZ != null && Math.sign(b.vz) !== Math.sign(e.dirZ) && Math.abs(b.vz) > 2) continue;
        if (e.dirX != null && Math.sign(b.vx) !== Math.sign(e.dirX) && Math.abs(b.vx) > 2) continue;
        enterPath(b, path, 0.01);
        return;
      }
    }
  }

  function stepBall(b, dt) {
    if (failsafe(b)) return;
    if (b.captured > 0) {
      b.captured -= dt;
      b.vx = 0; b.vz = 0; b.vy = 0;
      if (b.captured <= 0) {
        const sc = b.capturer;
        b.capturer = null;
        if (sc && sc.eject) { b.vx = sc.eject[0]; b.vz = sc.eject[1]; }
        else { b.vx = 0; b.vz = -16; }
        b.live = true; b.inLane = false;
        emit('saucerOut', b);
      }
      return;
    }
    if (b.heldByMagnet > 0) {
      b.heldByMagnet -= dt;
      const m = layout.magnet;
      b.x += (m.x - b.x) * Math.min(1, dt * 8);
      b.z += (m.z - b.z) * Math.min(1, dt * 8);
      b.y = Math.max(b.y, FLOOR_Y + 0.15);
      b.vx *= 0.5; b.vz *= 0.5;
      if (b.heldByMagnet <= 0) {
        b.vx += (Math.random() - 0.5) * 6;
        b.vz -= 10;
        emit('magnetRelease', b);
      }
      return;
    }
    if (!b.live && b.inLane) {
      const L = layout.plunger;
      // Hold on the plunger rod while charging so gravity can't roll the ball into the backstop.
      b.x = L.x;
      b.z = L.z + (b.pulling ? b.charged * 0.5 : 0);
      b.y = FLOOR_Y;
      b.vx = 0; b.vz = 0; b.vy = 0;
      return;
    }

    if (b.path) { stepPath(b, dt); failsafe(b); return; }

    // Gravity along the sloped playfield (+Z) and a glass-enclosed Y.
    b.vz += G_PLAY * dt;
    if (W.nudgeT > 0) { b.vx += W.nudgeX * dt; b.vz += W.nudgeZ * dt; }
    // Light linear damping (air + rolling) — keep the ball snappy, no dead spots.
    const spd0 = hypot(b.vx, b.vz);
    const damp = Math.max(0, 1 - (FRICTION + ROLL_DAMP) * dt);
    b.vx *= damp; b.vz *= damp;
    // A tiny downhill bias when nearly stopped so it can never rest on the field.
    if (b.live && !b.inLane && spd0 < 1.2) b.vz += 2.4 * dt;

    // Magnet attraction
    if (W.magnetOn && layout.magnet && b.live && !b.inLane) {
      const m = layout.magnet;
      const dx = m.x - b.x, dz = m.z - b.z;
      const d = hypot(dx, dz);
      if (d < m.r && d > 0.05) {
        const k = m.pull * (1 - d / m.r);
        b.vx += (dx / d) * k * dt;
        b.vz += (dz / d) * k * dt;
        if (d < 0.7 && spd0 < 10) {
          b.heldByMagnet = m.hold || 0.7;
          emit('magnetGrab', b);
        }
      }
    }

    let spd = hypot(b.vx, b.vz);
    if (spd > MAX_SPEED) { b.vx *= MAX_SPEED / spd; b.vz *= MAX_SPEED / spd; spd = MAX_SPEED; }

    // Enough substeps that a step is shorter than the ball radius (no tunneling).
    const move = spd * dt;
    const micro = move > b.r * 0.7 ? Math.min(4, Math.ceil(move / (b.r * 0.5))) : 1;
    const h = dt / micro;
    for (let m = 0; m < micro; m++) {
      b.x += b.vx * h; b.z += b.vz * h;
      collideSolids(b);
      if (failsafe(b)) return;
    }

    // Height: raised mini-playfield floor, else the main playfield, under a glass lid.
    const mz = layout.miniZone;
    const inMini = mz && b.x > mz.x0 && b.x < mz.x1 && b.z > mz.z0 && b.z < mz.z1 && (b.y > mz.floor - 0.7);
    const floor = inMini ? mz.floor : FLOOR_Y;
    if (inMini && mz.drop && hypot(b.x - mz.drop.x, b.z - mz.drop.z) < mz.drop.r) {
      const dropPath = layout.paths.find((p) => p.name === 'miniDrop');
      if (dropPath) { enterPath(b, dropPath, 0.01); return; }
    }
    if (b.y > floor + 0.05 && !b.path) {
      b.vy -= 28 * dt;
      b.y += b.vy * dt;
      if (b.y <= floor) { b.y = floor; b.vy = 0; }
    } else if (!b.path) {
      b.y = floor; b.vy = 0;
    }
    const lid = inMini ? Math.max(LID_Y, floor + 1.1) : LID_Y;
    if (!b.path && b.y > lid) { b.y = lid; if (b.vy > 0) b.vy = 0; }
    if (inMini && layout.miniBumper) {
      const bm = layout.miniBumper;
      const dx = b.x - bm.x, dz = b.z - bm.z;
      const dist = hypot(dx, dz), minD = b.r + bm.r;
      if (dist < minD && dist > 1e-6) {
        const nx = dx / dist, nz = dz / dist;
        b.x += nx * (minD - dist); b.z += nz * (minD - dist);
        b.vx = nx * (bm.kick || 12); b.vz = nz * (bm.kick || 12);
        emit('bumper', b, { bumper: bm, color: bm.color, mini: true });
      }
    }

    // Shooter-lane peel: as the ball nears the mouth, kick it left into the exit.
    if (b.inLane && b.live && b.z < -6.2 && b.vx > -16) b.vx -= 55 * dt;
    maybeEnterPaths(b);
    collideDevices(b, dt);
    updateLane(b);
    maybeDrain(b);
    antiStuck(b, dt);
    failsafe(b);

    b.omega = (b.vx !== 0 || b.vz !== 0) ? hypot(b.vx, b.vz) / b.r : b.omega * 0.99;
    if (b.saveT > 0) b.saveT = Math.max(0, b.saveT - dt);
  }

  function collideSolids(b) {
    const L = layout;
    for (let i = 0; i < 3; i++) {
      let hit = 0;
      for (const w of L.walls) {
        hit += resolveCapsule(b, w.a[0], w.a[1], w.b[0], w.b[1], w.r || 0.1, w.e != null ? w.e : 0.32, w.mu != null ? w.mu : 0.12, 0, w.oneWay || null);
      }
      for (const p of L.posts) {
        hit += resolveCircle(b, p.x, p.z, p.r, p.e != null ? p.e : 0.45, 0.08, 0);
      }
      if (hit < 1e-5) break;
    }
    // Bumpers (pop)
    for (const bm of L.bumpers) {
      const dx = b.x - bm.x, dz = b.z - bm.z;
      const dist = hypot(dx, dz), minD = b.r + bm.r;
      if (dist < minD && dist > 1e-6) {
        const nx = dx / dist, nz = dz / dist;
        b.x += nx * (minD - dist); b.z += nz * (minD - dist);
        const kick = bm.kick || 16;
        b.vx = nx * kick; b.vz = nz * kick;
        emit('bumper', b, { bumper: bm, color: bm.color });
      }
    }
    // Active slingshots
    for (const s of L.slings) {
      const pen = resolveCapsule(b, s.a[0], s.a[1], s.b[0], s.b[1], s.r || 0.1, 0.18, 0.05, 0, null);
      if (pen > 0) {
        closestOnSeg(b.x, b.z, s.a[0], s.a[1], s.b[0], s.b[1], _c2);
        let nx = b.x - _c2.x, nz = b.z - _c2.z;
        const d = hypot(nx, nz) || 1; nx /= d; nz /= d;
        const k = s.kick || 15;
        b.vx = nx * k; b.vz = nz * k;
        emit('sling', b, { sling: s.index });
      }
    }
    collideFlipper(b, W.flipL, L.flipL);
    collideFlipper(b, W.flipR, L.flipR);
    if (L.miniFlip) collideFlipper(b, W.miniFlip, L.miniFlip);
  }

  function collideDevices(b, dt) {
    const L = layout;
    if (!b.live || b.path) return;
    // Stand-ups / drops / ROWLEX
    for (const t of L.standups) {
      if (t.down) continue;
      if (hypot(b.x - t.x, b.z - t.z) < b.r + t.r) {
        t.lit = true;
        emit('standup', b, { target: t, letter: t.letter });
        // soft bounce
        const dx = b.x - t.x, dz = b.z - t.z, d = hypot(dx, dz) || 1;
        b.vx += (dx / d) * 4; b.vz += (dz / d) * 4;
      }
    }
    for (const t of L.drops) {
      if (t.down) continue;
      if (hypot(b.x - t.x, b.z - t.z) < b.r + t.r) {
        t.down = true;
        emit('drop', b, { target: t, bank: t.bank });
        const dx = b.x - t.x, dz = b.z - t.z, d = hypot(dx, dz) || 1;
        b.vx += (dx / d) * 5; b.vz += (dz / d) * 5;
      }
    }
    for (const r of L.rollovers) {
      if (hypot(b.x - r.x, b.z - r.z) < r.r) {
        if (!r._hit) { r._hit = true; emit('rollover', b, { lane: r.index, letter: r.letter }); }
      } else r._hit = false;
    }
    if (L.spinner) {
      const s = L.spinner;
      closestOnSeg(b.x, b.z, s.a[0], s.a[1], s.b[0], s.b[1], _c2);
      if (hypot(b.x - _c2.x, b.z - _c2.z) < b.r + 0.2) {
        const spd = hypot(b.vx, b.vz);
        if (spd > 3 && !s._hit) {
          s._hit = true; s.spin = (s.spin || 0) + spd * 0.8;
          emit('spinner', b, { speed: spd });
        }
      } else s._hit = false;
    }
    if (L.saucer && hypot(b.x - L.saucer.x, b.z - L.saucer.z) < L.saucer.r && hypot(b.vx, b.vz) < 14) {
      b.x = L.saucer.x; b.z = L.saucer.z; b.y = FLOOR_Y;
      b.captured = L.saucer.hold || 0.85;
      b.capturer = L.saucer;
      emit('saucerIn', b);
    }
    if (L.kickback && L.kickback.lit && hypot(b.x - L.kickback.x, b.z - L.kickback.z) < L.kickback.r) {
      b.vx = L.kickback.dir[0]; b.vz = L.kickback.dir[1];
      L.kickback.lit = false;
      emit('kickback', b);
    }
    if (L.captive) {
      const c = L.captive;
      // The captive slug slides on a short segment; the live ball can smack it.
      closestOnSeg(b.x, b.z, c.a[0], c.a[1], c.b[0], c.b[1], _c2);
      const dx = b.x - c.ballX, dz = b.z - c.ballZ;
      if (hypot(dx, dz) < b.r + c.r) {
        const nx = dx / (hypot(dx, dz) || 1), nz = dz / (hypot(dx, dz) || 1);
        const imp = Math.max(2, -(b.vx * nx + b.vz * nz));
        c.ballV += -imp * (nx * (c.b[0] - c.a[0]) + nz * (c.b[1] - c.a[1]) >= 0 ? 1 : -1);
        b.vx += nx * 3; b.vz += nz * 3;
        emit('captive', b);
      }
    }
    if (L.diverterSw && hypot(b.x - L.diverterSw.x, b.z - L.diverterSw.z) < L.diverterSw.r) {
      if (!L.diverterSw._hit) {
        L.diverterSw._hit = true;
        W.diverter = W.diverter ? 0 : 1;
        emit('diverter', b, { state: W.diverter });
      }
    } else if (L.diverterSw) L.diverterSw._hit = false;
  }

  function updateLane(b) {
    const L = layout.plunger;
    if (b.inLane && (b.z < L.exitZ || b.x < L.exitX)) {
      b.inLane = false;
      if (b.vx > -6) b.vx -= 6;
      emit('laneExit', b);
    }
    if (!b.inLane && b.x > L.reenterX && b.z > L.reenterZ && !b.path) b.inLane = true;
  }

  function maybeDrain(b) {
    if (!b.live || b.path || b.inLane || b.captured > 0) return;
    const d = layout.drain;
    if (b.z > d.z && b.x > d.x0 && b.x < d.x1) {
      if (b.saveT > 0) {
        b.x = 0; b.z = d.z - 0.4; b.y = FLOOR_Y;
        b.vx = 0; b.vz = -18; b.vy = 0;
        b.saveT = 0;
        emit('save', b);
        return;
      }
      emit('drain', b);
      returnToPlunger(b, 'drain', true);
    }
  }

  function antiStuck(b, dt) {
    if (!b.live || b.path || b.captured > 0 || b.heldByMagnet > 0) { b.stuckT = 0; return; }
    const moved = hypot(b.x - b.stuckX, b.z - b.stuckZ);
    if (moved < 0.55) b.stuckT += dt;
    else { b.stuckT = 0; b.stuckX = b.x; b.stuckZ = b.z; }
    const stuckLim = b.inLane ? 0.8 : 1.2;
    if (b.stuckT < stuckLim) return;
    b.stuckT = 0; b.stuckX = b.x; b.stuckZ = b.z;
    emit('stuck', b);
    if (b.inLane) {
      b.x = Math.min(b.x, 6.55);
      b.vx = -8; b.vz = -34;
      if (b.z < -6.5) { b.inLane = false; if (b.x > 5.9) b.x = 5.7; b.vx = -14; }
    } else {
      b.vx += (b.x === 0 ? -1 : -Math.sign(b.x)) * 7;
      b.vz = Math.min(b.vz, 0) - 10;
    }
  }

  function updateCaptive(dt) {
    const c = layout.captive;
    if (!c) return;
    const abx = c.b[0] - c.a[0], abz = c.b[1] - c.a[1];
    const len = hypot(abx, abz) || 1;
    c.ballV *= Math.max(0, 1 - 0.8 * dt);
    c.ballV += (G_PLAY * (abz / len)) * dt * 0.4;
    c.s = clamp((c.s || 0.3) + c.ballV * dt / len, 0.05, 0.95);
    if (c.s <= 0.06 || c.s >= 0.94) c.ballV *= -0.35;
    c.ballX = c.a[0] + abx * c.s;
    c.ballZ = c.a[1] + abz * c.s;
  }

  function step(dt) {
    if (dt > 0.05) dt = 0.05;
    W.acc += dt;
    W.time += dt;
    if (W.nudgeT > 0) W.nudgeT = Math.max(0, W.nudgeT - dt);
    else { W.nudgeX = 0; W.nudgeZ = 0; }
    if (W.tiltMeter > 0) W.tiltMeter = Math.max(0, W.tiltMeter - dt * 0.22);
    if (W.tiltWarn > 0) W.tiltWarn = Math.max(0, W.tiltWarn - dt);
    if (W.tilted) { /* flippers dead until the ball drains */ }
    updateCaptive(dt);
    if (layout.spinner && layout.spinner.spin) {
      layout.spinner.spin = Math.max(0, layout.spinner.spin - dt * 8);
      layout.spinner.angle = (layout.spinner.angle || 0) + layout.spinner.spin * dt;
    }
    let n = 0;
    while (W.acc >= PHYS_DT && n < 12) {
      updateFlip(W.flipL, layout.flipL, PHYS_DT);
      updateFlip(W.flipR, layout.flipR, PHYS_DT);
      if (layout.miniFlip) {
        // Mini flipper: follow the same side as the right flipper by default, or its own flag.
        if (W.miniFlip.follow == null) W.miniFlip.pressed = W.flipR.pressed || W.flipL.pressed;
        updateFlip(W.miniFlip, layout.miniFlip, PHYS_DT);
      }
      for (const b of W.balls) stepBall(b, PHYS_DT);
      if (W.balls.length > 1) {
        for (let i = 0; i < W.balls.length; i++)
          for (let j = i + 1; j < W.balls.length; j++) {
            const A = W.balls[i], B = W.balls[j];
            if (A.live && B.live && !A.path && !B.path && A.captured <= 0 && B.captured <= 0) resolveBallBall(A, B);
          }
      }
      W.acc -= PHYS_DT; n++;
    }
    if (n === 12) W.acc = 0;
    // One last bounds pass so a ball can never be rendered in the void for a frame.
    for (const b of W.balls) failsafe(b);
    return drainEvents();
  }

  function drainEvents() {
    if (!W.events.length) return W.events;
    const ev = W.events; W.events = []; return ev;
  }

  function launch(b, power) {
    const pwr = power != null ? power : (26 + b.charged * 12);
    const L = layout.plunger;
    b.x = L.x; b.z = L.z; b.y = FLOOR_Y;
    b.vx = -3.2; b.vz = -pwr; b.vy = 0;
    b.live = true; b.inLane = true; b.pulling = false; b.charged = 0;
    b.saveT = 8; b.stuckT = 0; b.path = null;
    emit('launch', b, { power: pwr });
  }

  function updatePlunger(dt) {
    const b = primary();
    if (!b) return 0;
    if (W.tilted && !b.live) return b.charged;
    if (b.inLane && !b.live) {
      if (W.plungerDown) { b.pulling = true; b.charged = Math.min(1, b.charged + dt * 1.15); }
      else if (b.pulling) launch(b);
    } else b.pulling = false;
    return b.charged;
  }

  function nudge(dx, dz) {
    if (W.tilted) return 'tilted';
    W.nudgeX = dx; W.nudgeZ = dz; W.nudgeT = 0.12;
    W.tiltMeter += 0.38;
    if (W.tiltMeter > 1.35) {
      W.tilted = true; W.tiltWarn = 0;
      emit('tilt', primary());
      return 'tilt';
    }
    if (W.tiltMeter > 0.75 && W.tiltWarn <= 0) {
      W.tiltWarn = 1.6;
      emit('tiltWarn', primary());
      return 'warn';
    }
    emit('nudge', primary());
    return 'ok';
  }

  function setFlippers(l, r, mini) {
    W.flipL.pressed = !!l; W.flipR.pressed = !!r;
    if (mini != null) { W.miniFlip.pressed = !!mini; W.miniFlip.follow = false; }
    else W.miniFlip.follow = true;
  }

  // Seed the player ball in the plunger lane.
  addBall(layout.plunger.x, layout.plunger.z);

  W.addBall = addBall;
  W.clearExtraBalls = clearExtraBalls;
  W.resetBall = resetBall;
  W.returnToPlunger = returnToPlunger;
  W.step = step;
  W.updatePlunger = updatePlunger;
  W.launch = launch;
  W.nudge = nudge;
  W.setFlippers = setFlippers;
  W.primary = primary;
  W.failsafe = failsafe;
  W.outOfBounds = outOfBounds;
  W.emit = emit;
  W.BOUNDS = BOUNDS;
  W.LID_Y = LID_Y;
  W.G_PLAY = G_PLAY;
  return W;
}

export function syncMesh(b, root, shell, dt) {
  if (!root || !b) return;
  root.position.set(b.x, b.y, b.z);
  if (shell) {
    shell.rotation.x += (b.vz / b.r) * (dt || 1 / 60);
    shell.rotation.z += (-b.vx / b.r) * (dt || 1 / 60);
  }
}
