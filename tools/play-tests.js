// Real-time Playwright tests for the rebuilt pinball physics and failsafe.
// Real keyboard events on the live rAF loop. No ?demo / ?capture.
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8767/index.html';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ARGS = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--autoplay-policy=no-user-gesture-required',
];
const SOAK_MS = Number(process.env.SOAK_MS || 180000);

let failed = 0;
function pass(name, extra) { console.log('PASS  ' + name + (extra ? '  ' + extra : '')); }
function fail(name, extra) { failed++; console.log('FAIL  ' + name + (extra ? '  ' + extra : '')); }

async function snap(page, name) {
  try { await page.screenshot({ path: '/tmp/rr_rt_' + name + '.png' }); } catch (e) {}
}

async function state(page) {
  return page.evaluate(() => {
    const d = window.__dbg, G = d.G, b = d.ball, p = d.player, w = d.world;
    const balls = (w && w.balls) ? w.balls.map((bb) => ({
      id: bb.id, x: +bb.x.toFixed(3), y: +bb.y.toFixed(3), z: +bb.z.toFixed(3),
      vx: +bb.vx.toFixed(2), vy: +bb.vy.toFixed(2), vz: +bb.vz.toFixed(2),
      live: !!bb.live, inLane: !!bb.inLane, path: !!(bb.path && bb.path.name) ? bb.path.name : null,
      captured: +(bb.captured || 0).toFixed(2),
      magnet: +(bb.heldByMagnet || 0).toFixed(2),
      saveT: +(bb.saveT || 0).toFixed(2),
      stuckT: +(bb.stuckT || 0).toFixed(2),
      charged: +(bb.charged || 0).toFixed(2),
      finite: Number.isFinite(bb.x) && Number.isFinite(bb.y) && Number.isFinite(bb.z)
        && Number.isFinite(bb.vx) && Number.isFinite(bb.vy) && Number.isFinite(bb.vz),
      oob: w.outOfBounds(bb),
      spd: +Math.hypot(bb.vx, bb.vy, bb.vz).toFixed(2),
    })) : [];
    const pri = balls[0] || {};
    return {
      mode: G.mode, sub: G.sub, modeT: +(G.modeT || 0).toFixed(2), t: +(G.t || 0).toFixed(2),
      countdown: +(G.countdown || 0).toFixed(2),
      ballsLeft: G.balls, score: G.score, hits: G.hits,
      returned: w ? w.returned : 0,
      liveBalls: balls.filter((bb) => bb.live).length,
      tilted: !!(w && w.tilted),
      bx: pri.x, by: pri.y, bz: pri.z,
      bvx: pri.vx, bvy: pri.vy, bvz: pri.vz,
      live: !!pri.live, inLane: !!pri.inLane, stuckT: pri.stuckT, charged: pri.charged,
      path: pri.path, captured: pri.captured, oob: pri.oob, finite: pri.finite, spd: pri.spd,
      anyOob: balls.some((bb) => bb.oob),
      anyNan: balls.some((bb) => !bb.finite),
      ballList: balls,
      pSpeed: p ? +p.speed.toFixed(2) : null,
      pAccel: p ? p.accel : null,
      pSteer: p ? +p.steer.toFixed(2) : null,
      pS: p ? +p.s.toFixed(2) : null,
      pLap: p ? p.lap : null,
      pLat: p ? +p.lateral.toFixed(2) : null,
      pFin: p ? !!p.finished : null,
      hx: +d.hero.pos.x.toFixed(2), hy: +d.hero.pos.y.toFixed(2), hz: +d.hero.pos.z.toFixed(2),
      hvy: +d.hero.vel.y.toFixed(2),
      disc: d.hero.disc && d.hero.disc.state,
      riftKills: G.riftKills || 0, riftGoal: !!G.riftGoal,
      rePhase: d.reentryW && d.reentryW.flight ? d.reentryW.flight.phase : null,
      reAlt: d.reentryW && d.reentryW.flight ? +d.reentryW.flight.alt.toFixed(2) : null,
      rePitch: d.reentryW && d.reentryW.flight ? +d.reentryW.flight.pitch.toFixed(2) : null,
      reHeat: d.reentryW && d.reentryW.flight ? +d.reentryW.flight.heat.toFixed(1) : null,
      reHull: d.reentryW && d.reentryW.flight ? +d.reentryW.flight.hull.toFixed(1) : null,
      reSpeed: d.reentryW && d.reentryW.flight ? +d.reentryW.flight.speed.toFixed(1) : null,
      reCorr: d.reentryW && d.reentryW.flight ? !!d.reentryW.flight.inCorridor : null,
      reLx: d.reentryW && d.reentryW.flight ? +((d.reentryW.flight.lx || 0).toFixed(2)) : null,
      reLz: d.reentryW && d.reentryW.flight ? +((d.reentryW.flight.lz || 0).toFixed(2)) : null,
      reDist: d.reentryW && d.reentryW.flight ? +((d.reentryW.flight.dist || 0).toFixed(2)) : null,
      reH: d.reentryW && d.reentryW.flight ? +((d.reentryW.flight.hSpeed || 0).toFixed(2)) : null,
      reV: d.reentryW && d.reentryW.flight ? +((d.reentryW.flight.vSpeed || 0).toFixed(2)) : null,
      reGrade: d.reentryW && d.reentryW.flight ? (d.reentryW.flight.grade || '') : '',
      keyS: !!(d.keys && d.keys.KeyS), keyW: !!(d.keys && d.keys.KeyW),
      music: d.ModeMusic && d.ModeMusic.url ? String(d.ModeMusic.url) : '',
      musicPaused: d.ModeMusic && d.ModeMusic.el ? !!d.ModeMusic.el.paused : null,
      musicVol: d.ModeMusic ? +((d.ModeMusic.vol || 0).toFixed(2)) : 0,
      musicOut: d.ModeMusic && d.ModeMusic.outgoing ? (d.ModeMusic.outgoing.src || 'yes') : null,
      titleMusic: d.Snd && d.Snd.title && d.Snd.title.src ? String(d.Snd.title.src) : '',
      titlePaused: d.Snd && d.Snd.title ? !!d.Snd.title.paused : null,
    };
  });
}

async function waitFor(page, pred, timeoutMs) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await state(page);
    if (pred(last)) return last;
    await page.waitForTimeout(120);
  }
  return last;
}

async function placeBall(page, x, z, opts) {
  return page.evaluate(({ x, z, opts }) => {
    const d = window.__dbg, w = d.world, b = w.primary();
    w.tilted = false; w.tiltMeter = 0; w.magnetOn = false;
    w.resetBall(b, x, z, { live: true, inLane: !!(opts && opts.inLane), save: 0 });
    b.live = opts && opts.live != null ? !!opts.live : true;
    b.inLane = !!(opts && opts.inLane);
    b.vx = opts && opts.vx != null ? opts.vx : 0;
    b.vy = opts && opts.vy != null ? opts.vy : 0;
    b.vz = opts && opts.vz != null ? opts.vz : 0;
    b.y = opts && opts.y != null ? opts.y : 0.42;
    b.path = null; b.pathS = 0; b.captured = 0; b.heldByMagnet = 0; b.saveT = opts && opts.saveT != null ? opts.saveT : 0;
    d.G.sub = 'play';
    d.G.mode = 'pinball';
    if (d.ball) {
      d.ball.pos.set(b.x, b.y, b.z);
      d.ball.vel.set(b.vx, b.vy, b.vz);
      d.ball.live = b.live; d.ball.inLane = b.inLane;
    }
    return { x: b.x, z: b.z, vx: b.vx, vz: b.vz };
  }, { x, z, opts: opts || {} });
}

(async () => {
  const errs = [];
  const b = await chromium.launch({ executablePath: CHROME, args: ARGS });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => errs.push('PAGE ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')));
  p.on('console', m => { if (m.type() === 'error') errs.push('CON ' + m.text()); });

  await p.goto(BASE + (BASE.includes('?') ? '&' : '?') + 'seed=7&nocache=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__dbg && window.__dbg.world, { timeout: 25000 });
  await p.waitForTimeout(400);

  // ---------- start a real game (two-step title) ----------
  await p.keyboard.press('Enter');
  let st = await waitFor(p, s => /title-theme\.(ogg|mp3)/i.test(s.titleMusic || '') && s.titlePaused === false, 8000);
  if (st && /title-theme\.(ogg|mp3)/i.test(st.titleMusic || '') && st.titlePaused === false) {
    pass('title-music-plays', 'src=' + st.titleMusic);
  } else fail('title-music-plays', JSON.stringify({ titleMusic: st && st.titleMusic, titlePaused: st && st.titlePaused, mode: st && st.mode }));
  await p.keyboard.press('Enter');
  st = await waitFor(p, s => s.mode === 'pinball' && s.sub === 'plunge', 20000);
  if (!(st && st.mode === 'pinball' && st.sub === 'plunge')) {
    fail('start-plunge', JSON.stringify(st));
    await snap(p, 'start_fail');
    console.log('ERRORS', errs.length, errs.join('\n'));
    await b.close();
    process.exit(1);
  }
  pass('start-plunge', 'modeT=' + st.modeT);
  st = await waitFor(p, s => /pinball\.(ogg|mp3)/i.test(s.music || ''), 8000);
  if (st && /pinball\.(ogg|mp3)/i.test(st.music || '')) {
    pass('table-music-plays', 'src=' + st.music + ' paused=' + st.musicPaused + ' vol=' + st.musicVol);
  } else fail('table-music-plays', JSON.stringify({ music: st && st.music, paused: st && st.musicPaused, mode: st && st.mode }));

  // ---------- (1) real Space plunge — ball must roll out onto the playfield ----------
  await p.keyboard.down('Space');
  await p.waitForTimeout(750);
  const charging = await state(p);
  await p.keyboard.up('Space');
  st = await waitFor(p, s => s.live && !s.inLane && s.bx < 5.4, 14000);
  if (st && st.live && !st.inLane && st.bx < 5.4) {
    pass('plunge-exits-lane', `x=${st.bx} z=${st.bz} vz=${st.bvz} charged=${charging.charged}`);
  } else {
    fail('plunge-exits-lane', JSON.stringify({ charging, st }));
  }
  await snap(p, 'plunge');

  // ---------- (1b) stuck-ball detector: rest in the lane ~1.2s, then get kicked out ----------
  await placeBall(p, 6.57, 7.15, { live: true, inLane: true, vx: 0, vz: 0 });
  st = await waitFor(p, s => s.live && !s.inLane && s.bx < 5.4, 20000);
  if (st && st.live && !st.inLane && st.bx < 5.4) {
    pass('stuck-ball-kick', `x=${st.bx} z=${st.bz} vz=${st.bvz} stuckT=${st.stuckT}`);
  } else {
    fail('stuck-ball-kick', JSON.stringify(st));
  }

  // ---------- (2) flippers can send the ball to the top of the table ----------
  // Seat the ball on the left flipper face (coming downhill) and flip with a real key.
  await placeBall(p, -1.05, 6.35, { live: true, inLane: false, vx: 0.2, vz: 3.2 });
  await p.waitForTimeout(180);
  await p.keyboard.down('KeyZ');
  st = await waitFor(p, s => s.live && s.bz < -4.5, 8000);
  await p.keyboard.up('KeyZ');
  if (st && st.live && st.bz < -4.5) {
    pass('flipper-reaches-top', `z=${st.bz} vz=${st.bvz} y=${st.by}`);
  } else {
    // one retry from a slightly higher contact
    await placeBall(p, -0.85, 6.2, { live: true, inLane: false, vx: 1.2, vz: 2.0 });
    await p.keyboard.down('KeyZ');
    st = await waitFor(p, s => s.live && s.bz < -4.5, 8000);
    await p.keyboard.up('KeyZ');
    if (st && st.live && st.bz < -4.5) pass('flipper-reaches-top', `retry z=${st.bz} vz=${st.bvz}`);
    else fail('flipper-reaches-top', JSON.stringify(st));
  }

  // ---------- (3) ramps / habitrails are completable ----------
  // Diverter 0 opens railA. Shoot into its mouth and ride it out.
  await p.evaluate(() => { window.__dbg.world.diverter = 0; });
  await placeBall(p, -3.75, 3.55, { live: true, inLane: false, vx: -1, vz: -16 });
  const entered = await waitFor(p, s => s.path === 'railA' || s.path === 'leftHolo' || (s.by && s.by > 1.6), 4000);
  const finished = await waitFor(p, s => s.live && !s.path && entered && (entered.path || entered.by > 1.6) && s.t > entered.t + 0.3, 25000);
  if (entered && (entered.path || entered.by > 1.6) && finished && !finished.path && finished.live) {
    pass('ramp-completable', `enter=${entered.path || ('y=' + entered.by)} exit z=${finished.bz} y=${finished.by}`);
  } else {
    fail('ramp-completable', JSON.stringify({ entered, finished }));
  }

  // ---------- (4) drain works (no ball save) ----------
  const beforeBalls = (await state(p)).ballsLeft;
  await placeBall(p, 0, 8.35, { live: true, inLane: false, vx: 0, vz: 14, saveT: 0 });
  st = await waitFor(p, s => s.ballsLeft < beforeBalls || (s.sub === 'plunge' && s.inLane && !s.live), 6000);
  if (st && (st.ballsLeft < beforeBalls || (st.sub === 'plunge' && st.inLane && !st.live))) {
    pass('drain-works', `balls ${beforeBalls} -> ${st.ballsLeft} sub=${st.sub} x=${st.bx} z=${st.bz}`);
  } else {
    fail('drain-works', JSON.stringify({ beforeBalls, st }));
  }

  // ---------- (5) ball-escape failsafe: out of bounds, NaN, extreme speed ----------
  const ret0 = (await state(p)).returned;
  await p.evaluate(() => {
    const w = window.__dbg.world, b = w.primary();
    b.live = true; b.inLane = false; b.x = 40; b.z = -40; b.y = -8; b.vx = 0; b.vz = 0;
    window.__dbg.G.sub = 'play';
  });
  st = await waitFor(p, s => s.returned > ret0 && s.inLane && !s.live && Math.abs(s.bx - 6.57) < 0.4, 4000);
  if (st && st.returned > ret0 && st.inLane && !st.anyOob && !st.anyNan) {
    pass('failsafe-void', `returned ${ret0} -> ${st.returned} pos=${st.bx},${st.by},${st.bz}`);
  } else {
    fail('failsafe-void', JSON.stringify({ ret0, st }));
  }

  const ret1 = (await state(p)).returned;
  await p.evaluate(() => {
    const b = window.__dbg.world.primary();
    b.live = true; b.inLane = false; b.x = 0; b.z = 0; b.y = 0.42; b.vx = NaN; b.vz = Infinity;
    window.__dbg.G.sub = 'play';
  });
  st = await waitFor(p, s => s.returned > ret1 && s.inLane && !s.anyNan && !s.anyOob, 4000);
  if (st && st.returned > ret1 && st.inLane && !st.anyNan) {
    pass('failsafe-nan', `returned ${ret1} -> ${st.returned}`);
  } else {
    fail('failsafe-nan', JSON.stringify({ ret1, st }));
  }

  const ret2 = (await state(p)).returned;
  await p.evaluate(() => {
    const b = window.__dbg.world.primary();
    b.live = true; b.inLane = false; b.x = 0; b.z = 2; b.y = 0.42; b.vx = 400; b.vz = -400;
    window.__dbg.G.sub = 'play';
  });
  st = await waitFor(p, s => s.returned > ret2 && s.inLane && !s.anyOob, 4000);
  if (st && st.returned > ret2 && st.inLane) {
    pass('failsafe-speed', `returned ${ret2} -> ${st.returned}`);
  } else {
    fail('failsafe-speed', JSON.stringify({ ret2, st }));
  }
  await snap(p, 'failsafe');

  // Put a fresh ball in play (restart if we lost all balls during drain test).
  await p.evaluate(() => {
    const d = window.__dbg;
    if (d.G.mode !== 'pinball' || d.G.balls <= 0) d.startGame();
    else {
      d.resetBallToPlunger();
      d.G.sub = 'plunge';
      d.G.modeT = 1;
    }
  });
  st = await waitFor(p, s => s.mode === 'pinball' && (s.sub === 'plunge' || s.sub === 'curl' || s.sub === 'toLane'), 20000);
  if (st && (st.sub === 'curl' || st.sub === 'toLane')) {
    st = await waitFor(p, s => s.mode === 'pinball' && s.sub === 'plunge', 20000);
  }

  // ---------- (6) never-stop + never-void soak: randomized flipper mashing ----------
  const soakStart = Date.now();
  let maxIdle = 0, idleMs = 0, lastPos = null, samples = 0, oobHits = 0, nanHits = 0, froze = false;
  let launches = 0, flips = 0, minZ = 99, maxY = 0, drainOrSave = 0, returnedSoak = 0;
  const retSoak0 = (await state(p)).returned;
  // Launch once to get a live ball.
  await p.keyboard.down('Space');
  await p.waitForTimeout(700);
  await p.keyboard.up('Space');
  launches++;

  while (Date.now() - soakStart < SOAK_MS) {
    const s = await state(p);
    samples++;
    if (s.anyOob) oobHits++;
    if (s.anyNan) nanHits++;
    if (s.bz != null && s.bz < minZ) minZ = s.bz;
    if (s.by != null && s.by > maxY) maxY = s.by;
    if (s.mode === 'pinball' && s.live && !s.inLane && !s.path && !(s.captured > 0)) {
      const key = s.bx + ',' + s.bz;
      const moving = s.spd > 0.45 || (lastPos && lastPos !== key);
      if (moving) { idleMs = 0; lastPos = key; }
      else {
        idleMs += 160;
        if (idleMs > maxIdle) maxIdle = idleMs;
        if (idleMs > 1500) froze = true;
      }
    } else { idleMs = 0; lastPos = null; }

    if (s.mode === 'pinball' && (s.sub === 'plunge' || (!s.live && s.inLane))) {
      await p.keyboard.down('Space');
      await p.waitForTimeout(550);
      await p.keyboard.up('Space');
      launches++;
      continue;
    }
    if (s.mode !== 'pinball') {
      // Should not leave the table during this soak. Pull back if a portal somehow opened.
      await p.evaluate(() => {
        const d = window.__dbg;
        if (d.G.mode === 'rift' || d.G.mode === 'reach' || d.G.mode === 'warp') {
          try { d.leavePortal(false, 0); } catch (e) {}
          d.G.mode = 'pinball'; d.G.sub = 'play';
        }
      });
    }

    const r = Math.random();
    if (r < 0.45) { await p.keyboard.down('KeyZ'); flips++; }
    if (r < 0.35 || r > 0.7) { await p.keyboard.down('Slash'); flips++; }
    await p.waitForTimeout(80 + Math.floor(Math.random() * 140));
    await p.keyboard.up('KeyZ');
    await p.keyboard.up('Slash');
    if (Math.random() < 0.04) {
      await p.keyboard.press(Math.random() < 0.5 ? 'KeyQ' : 'KeyE');
    }
  }
  await p.keyboard.up('KeyZ');
  await p.keyboard.up('Slash');
  await p.keyboard.up('Space');

  const soakEnd = await state(p);
  returnedSoak = soakEnd.returned - retSoak0;
  if (oobHits === 0 && nanHits === 0) pass('soak-never-void', `samples=${samples} returned=${returnedSoak} minZ=${minZ} maxY=${maxY}`);
  else fail('soak-never-void', JSON.stringify({ oobHits, nanHits, soakEnd, samples }));

  if (!froze && maxIdle <= 1500) pass('soak-never-stops', `maxIdleMs=${maxIdle} launches=${launches} flips=${flips}`);
  else fail('soak-never-stops', `maxIdleMs=${maxIdle} froze=${froze} launches=${launches}`);

  await snap(p, 'soak');

  // ---------- brief portal smoke so those worlds still boot after the overhaul ----------
  await p.evaluate(() => window.__dbg.enterPortal('reach'));
  st = await waitFor(p, s => s.mode === 'reach', 20000);
  if (st && st.mode === 'reach') pass('reach-arrive', 'countdown=' + st.countdown);
  else fail('reach-arrive', JSON.stringify(st));
  st = await waitFor(p, s => s.mode === 'reach' && s.countdown <= 0, 20000);
  if (st && st.mode === 'reach' && st.countdown <= 0) pass('reach-countdown-ends', 'modeT=' + st.modeT);
  else fail('reach-countdown-ends', JSON.stringify(st));
  await p.keyboard.down('KeyW');
  st = await waitFor(p, s => s.mode === 'reach' && s.pSpeed > 15, 10000);
  if (st && st.pSpeed > 15) pass('reach-accelerates', 'speed=' + st.pSpeed + ' s=' + st.pS);
  else fail('reach-accelerates', JSON.stringify(st));
  await p.keyboard.up('KeyW');
  await p.evaluate(() => window.__dbg.leavePortal(true, 5000));
  st = await waitFor(p, s => s.mode === 'pinball', 20000);
  if (st && st.mode === 'pinball') pass('reach-returns-table', 'sub=' + st.sub);
  else fail('reach-returns-table', JSON.stringify(st));

  await p.evaluate(() => window.__dbg.enterPortal('rift'));
  st = await waitFor(p, s => s.mode === 'rift', 20000);
  if (st && st.mode === 'rift') pass('rift-arrive', `pos=${st.hx},${st.hy},${st.hz}`);
  else fail('rift-arrive', JSON.stringify(st));
  const h0 = st ? { x: st.hx, z: st.hz } : { x: 0, z: 0 };
  await p.keyboard.down('KeyW');
  st = await waitFor(p, s => s.mode === 'rift' && Math.hypot(s.hx - h0.x, s.hz - h0.z) > 1.2, 10000);
  await p.keyboard.up('KeyW');
  if (st && Math.hypot(st.hx - h0.x, st.hz - h0.z) > 1.2) pass('rift-moves', `d=${Math.hypot(st.hx - h0.x, st.hz - h0.z).toFixed(2)}`);
  else fail('rift-moves', JSON.stringify({ h0, st }));
  await p.evaluate(() => window.__dbg.leavePortal(true, 4000));
  st = await waitFor(p, s => s.mode === 'pinball', 20000);
  if (st && st.mode === 'pinball') pass('rift-returns-table', 'sub=' + st.sub + ' score=' + st.score);
  else fail('rift-returns-table', JSON.stringify(st));

  // ---------- (7) RE-ENTRY: real pitch / shield input, heat, and a return to the table ----------
  await p.evaluate(() => window.__dbg.enterPortal('reentry'));
  st = await waitFor(p, s => s.mode === 'reentry', 20000);
  if (st && st.mode === 'reentry') pass('reentry-arrive', 'phase=' + st.rePhase + ' alt=' + st.reAlt);
  else fail('reentry-arrive', JSON.stringify(st));
  st = await waitFor(p, s => s.mode === 'reentry' && /reentry\.(ogg|mp3)/i.test(s.music || ''), 8000);
  if (st && /reentry\.(ogg|mp3)/i.test(st.music || '')) {
    pass('reentry-music-starts', 'src=' + st.music + ' paused=' + st.musicPaused + ' vol=' + st.musicVol);
  } else fail('reentry-music-starts', JSON.stringify({ music: st && st.music, paused: st && st.musicPaused, vol: st && st.musicVol }));

  st = await waitFor(p, s => s.mode === 'reentry' && (s.rePhase === 'reentry' || s.rePhase === 'undock'), 15000);
  if (st && (st.rePhase === 'reentry' || st.rePhase === 'undock')) pass('reentry-undock', 'phase=' + st.rePhase);
  else fail('reentry-undock', JSON.stringify(st));

  st = await waitFor(p, s => s.mode === 'reentry' && s.rePhase === 'reentry', 15000);
  if (!(st && st.rePhase === 'reentry')) fail('reentry-interface', JSON.stringify(st));
  else {
    const p0 = st.rePitch;
    const a0 = st.reAlt;
    await p.mouse.click(640, 360);
    await p.keyboard.down('KeyS');
    st = await waitFor(p, s => s.mode === 'reentry' && s.rePitch < p0 - 1.2, 8000);
    await p.keyboard.up('KeyS');
    if (st && st.rePitch < p0 - 1.2) pass('reentry-pitches', `pitch ${p0} -> ${st.rePitch}`);
    else fail('reentry-pitches', JSON.stringify({ p0, st }));

    // Fly the corridor with real keys long enough for heat to build and altitude to drop.
    const tFly = Date.now();
    while (Date.now() - tFly < 28000) {
      const s = await state(p);
      if (s.mode !== 'reentry') break;
      if (s.rePhase === 'descent' || s.rePhase === 'touchdown' || s.rePhase === 'hardland' || s.rePhase === 'miss' || s.rePhase === 'breakup' || s.rePhase === 'skip') break;
      await p.keyboard.up('KeyW'); await p.keyboard.up('KeyS'); await p.keyboard.up('ShiftLeft');
      if (s.rePitch > -9) await p.keyboard.down('KeyS');
      else if (s.rePitch < -13.5) await p.keyboard.down('KeyW');
      if (s.reHeat > 60) await p.keyboard.down('ShiftLeft');
      await p.waitForTimeout(180);
    }
    await p.keyboard.up('KeyW'); await p.keyboard.up('KeyS'); await p.keyboard.up('ShiftLeft');
    st = await state(p);
    if (st && (st.reAlt < a0 - 5 || st.reHeat > 3 || st.rePhase !== 'reentry')) {
      pass('reentry-heats-or-descends', `alt ${a0} -> ${st.reAlt} heat=${st.reHeat} phase=${st.rePhase}`);
    } else fail('reentry-heats-or-descends', JSON.stringify({ a0, st }));
  }

  // Final descent: real thruster input onto the drone-ship pad.
  st = await waitFor(p, s => s.mode !== 'reentry' || s.rePhase === 'descent' || s.rePhase === 'touchdown' || s.rePhase === 'hardland' || s.rePhase === 'miss' || s.rePhase === 'breakup' || s.rePhase === 'skip', 20000);
  if (st && st.mode === 'reentry' && st.rePhase === 'descent') {
    pass('reentry-descent', `dist=${st.reDist} alt=${st.reAlt} v=${st.reV}`);
    const x0 = st.reLx, z0 = st.reLz;
    await p.keyboard.down('KeyA');
    st = await waitFor(p, s => s.mode === 'reentry' && s.rePhase === 'descent' && s.reLx < x0 - 1.5, 6000);
    await p.keyboard.up('KeyA');
    if (st && st.reLx < x0 - 1.5) pass('reentry-steers-pad', `lx ${x0} -> ${st.reLx} lz ${z0} -> ${st.reLz}`);
    else fail('reentry-steers-pad', JSON.stringify({ x0, z0, st }));

    const tLand = Date.now();
    while (Date.now() - tLand < 25000) {
      const s = await state(p);
      if (s.mode !== 'reentry') break;
      if (s.rePhase === 'touchdown' || s.rePhase === 'hardland' || s.rePhase === 'miss') break;
      await p.keyboard.up('KeyW'); await p.keyboard.up('KeyS'); await p.keyboard.up('KeyA'); await p.keyboard.up('KeyD'); await p.keyboard.up('ShiftLeft');
      if (s.reLx > 0.5) await p.keyboard.down('KeyA');
      else if (s.reLx < -0.5) await p.keyboard.down('KeyD');
      if (s.reLz > 0.5) await p.keyboard.down('KeyW');
      else if (s.reLz < -0.5) await p.keyboard.down('KeyS');
      if (s.reV > 4.0 || (s.reAlt != null && s.reAlt < 10 && s.reV > 2.6)) await p.keyboard.down('ShiftLeft');
      await p.waitForTimeout(120);
    }
    await p.keyboard.up('KeyW'); await p.keyboard.up('KeyS'); await p.keyboard.up('KeyA'); await p.keyboard.up('KeyD'); await p.keyboard.up('ShiftLeft');
    st = await waitFor(p, s => s.mode !== 'reentry' || s.rePhase === 'touchdown' || s.rePhase === 'hardland' || s.rePhase === 'miss' || s.mode === 'pinball', 8000);
    if (st && (st.rePhase === 'touchdown' || (st.mode === 'pinball' && st.score > 0))) {
      pass('reentry-lands-on-pad', `phase=${st.rePhase} dist=${st.reDist} v=${st.reV} grade=${st.reGrade} score=${st.score}`);
    } else fail('reentry-lands-on-pad', JSON.stringify(st));
  } else if (st && st.rePhase === 'touchdown') {
    pass('reentry-descent', 'already down');
    pass('reentry-steers-pad', 'already down');
    pass('reentry-lands-on-pad', `phase=${st.rePhase} dist=${st.reDist} grade=${st.reGrade}`);
  } else {
    fail('reentry-descent', JSON.stringify(st));
  }
  await snap(p, 'reentry');

  if ((await state(p)).mode === 'reentry') {
    await p.evaluate(() => {
      const f = window.__dbg.reentryW && window.__dbg.reentryW.flight;
      if (f && (f.phase === 'touchdown' || f.phase === 'hardland' || f.phase === 'miss' || f.phase === 'breakup' || f.phase === 'skip')) {
        window.__dbg.leavePortal(!!f.success, f.bonus || 0);
      } else {
        window.__dbg.leavePortal(true, 4000);
      }
    });
  }
  st = await waitFor(p, s => s.mode === 'pinball', 20000);
  if (st && st.mode === 'pinball') pass('reentry-returns-table', 'sub=' + st.sub + ' score=' + st.score);
  else fail('reentry-returns-table', JSON.stringify(st));
  st = await waitFor(p, s => s.mode === 'pinball' && /pinball\.(ogg|mp3)/i.test(s.music || ''), 8000);
  if (st && /pinball\.(ogg|mp3)/i.test(st.music || '')) {
    pass('reentry-music-returns-pinball', 'src=' + st.music + ' paused=' + st.musicPaused + ' vol=' + st.musicVol);
  } else fail('reentry-music-returns-pinball', JSON.stringify({ mode: st && st.mode, music: st && st.music, paused: st && st.musicPaused }));

  await snap(p, 'done');
  console.log('ERRORS', errs.length, errs.length ? '\n' + errs.join('\n') : '');
  console.log(failed ? `FAILED ${failed}` : 'ALL PASSED');
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
