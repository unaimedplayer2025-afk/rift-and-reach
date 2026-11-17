// Real-time (rAF) Playwright tests for pinball plunge and both portal games.
// No ?demo / ?capture — real keyboard events on the live animation loop.
const { chromium } = require('playwright');

const BASE = process.argv[2] || 'http://localhost:8767/index.html';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];

let failed = 0;
function pass(name, extra) { console.log('PASS  ' + name + (extra ? '  ' + extra : '')); }
function fail(name, extra) { failed++; console.log('FAIL  ' + name + (extra ? '  ' + extra : '')); }

async function snap(page, name) {
  try { await page.screenshot({ path: '/tmp/rr_rt_' + name + '.png' }); } catch (e) {}
}

async function state(page) {
  return page.evaluate(() => {
    const d = window.__dbg, G = d.G, b = d.ball, p = d.player;
    return {
      mode: G.mode, sub: G.sub, modeT: +(G.modeT || 0).toFixed(2), t: +(G.t || 0).toFixed(2),
      countdown: +(G.countdown || 0).toFixed(2),
      balls: G.balls, score: G.score, hits: G.hits,
      bx: +b.pos.x.toFixed(3), bz: +b.pos.z.toFixed(3),
      bvx: +b.vel.x.toFixed(2), bvz: +b.vel.z.toFixed(2),
      live: !!b.live, inLane: !!b.inLane, stuckT: +(b.stuckT || 0).toFixed(2), charged: +(b.charged || 0).toFixed(2),
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
    };
  });
}

async function waitFor(page, pred, timeoutMs, label) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await state(page);
    if (pred(last)) return last;
    await page.waitForTimeout(150);
  }
  return last;
}

(async () => {
  const errs = [];
  const b = await chromium.launch({ executablePath: CHROME, args: ARGS });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => errs.push('PAGE ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
  p.on('console', m => { if (m.type() === 'error') errs.push('CON ' + m.text()); });

  await p.goto(BASE + (BASE.includes('?') ? '&' : '?') + 'seed=7&nocache=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__dbg, { timeout: 20000 });
  await p.waitForTimeout(400);

  // ---------- start a real game (two-step title) ----------
  await p.keyboard.press('Enter');
  await p.waitForTimeout(200);
  await p.keyboard.press('Enter');
  let st = await waitFor(p, s => s.mode === 'pinball' && s.sub === 'plunge', 15000, 'plunge ready');
  if (!(st && st.mode === 'pinball' && st.sub === 'plunge')) {
    fail('start-plunge', JSON.stringify(st));
    await snap(p, 'start_fail');
    console.log('ERRORS', errs.length, errs.join('\n'));
    await b.close();
    process.exit(1);
  }
  pass('start-plunge', 'modeT=' + st.modeT);

  // ---------- (1) real Space plunge — ball must roll out onto the playfield ----------
  await p.keyboard.down('Space');
  await p.waitForTimeout(700);
  const charging = await state(p);
  await p.keyboard.up('Space');
  st = await waitFor(p, s => s.live && !s.inLane && s.bx < 5.4, 12000, 'exit lane');
  if (st && st.live && !st.inLane && st.bx < 5.4) {
    pass('plunge-exits-lane', `x=${st.bx} z=${st.bz} vz=${st.bvz} charged=${charging.charged}`);
  } else {
    fail('plunge-exits-lane', JSON.stringify({ charging, st }));
  }
  await snap(p, 'plunge');

  // ---------- (1b) stuck-ball detector: rest in the lane ~2s, then get kicked out ----------
  await p.evaluate(() => {
    const b = window.__dbg.ball;
    b.pos.set(6.57, 0.42, 7.15);
    b.vel.set(0, 0, 0);
    b.live = true; b.inLane = true; b.pulling = false; b.charged = 0; b.stuckT = 0; b.ramp = null;
  });
  st = await waitFor(p, s => s.live && !s.inLane && s.bx < 5.4, 20000, 'stuck kick');
  if (st && st.live && !st.inLane && st.bx < 5.4) {
    pass('stuck-ball-kick', `x=${st.bx} z=${st.bz} vz=${st.bvz} stuckT=${st.stuckT}`);
  } else {
    fail('stuck-ball-kick', JSON.stringify(st));
  }

  // ---------- (2) The Reach: force portal in real mode, race, steer, finish, return ----------
  await p.evaluate(() => window.__dbg.enterPortal('reach'));
  st = await waitFor(p, s => s.mode === 'reach', 20000, 'arrive reach');
  if (!(st && st.mode === 'reach')) {
    fail('reach-arrive', JSON.stringify(st));
  } else {
    pass('reach-arrive', 'countdown=' + st.countdown);
  }
  await snap(p, 'reach_count');

  st = await waitFor(p, s => s.mode === 'reach' && s.countdown <= 0, 20000, 'countdown end');
  if (st && st.mode === 'reach' && st.countdown <= 0) pass('reach-countdown-ends', 'modeT=' + st.modeT);
  else fail('reach-countdown-ends', JSON.stringify(st));

  await p.keyboard.down('KeyW');
  st = await waitFor(p, s => s.mode === 'reach' && s.pSpeed > 15, 10000, 'accel');
  if (st && st.pSpeed > 15) pass('reach-accelerates', 'speed=' + st.pSpeed + ' s=' + st.pS);
  else fail('reach-accelerates', JSON.stringify(st));

  const s0 = st && st.pS != null ? st.pS : 0;
  const lap0 = st && st.pLap != null ? st.pLap : 0;
  st = await waitFor(p, s => s.mode === 'reach' && (s.pLap > lap0 || (s.pS + 40) % 1000 < (s0 + 40) % 1000 - 20 || Math.abs(s.pS - s0) > 40), 25000, 'progress');
  if (st && (st.pLap > lap0 || Math.abs(st.pS - s0) > 40)) pass('reach-progress', `s ${s0} -> ${st.pS} lap ${lap0} -> ${st.pLap}`);
  else fail('reach-progress', JSON.stringify({ s0, lap0, st }));

  // steer
  await p.keyboard.down('KeyA');
  await p.waitForTimeout(600);
  const steered = await state(p);
  await p.keyboard.up('KeyA');
  if (steered.pSteer < -0.4) pass('reach-steers', 'steer=' + steered.pSteer + ' lat=' + steered.pLat);
  else fail('reach-steers', JSON.stringify(steered));

  // finish the race (hold W the whole time)
  st = await waitFor(p, s => s.pFin || s.mode === 'warp' || s.mode === 'pinball', 90000, 'finish');
  if (st && (st.pFin || st.mode === 'warp' || st.mode === 'pinball')) pass('reach-finishes', `mode=${st.mode} fin=${st.pFin} lap=${st.pLap}`);
  else fail('reach-finishes', JSON.stringify(st));
  await p.keyboard.up('KeyW');

  st = await waitFor(p, s => s.mode === 'pinball', 20000, 'return table from reach');
  if (st && st.mode === 'pinball') pass('reach-returns-table', 'sub=' + st.sub + ' score=' + st.score);
  else fail('reach-returns-table', JSON.stringify(st));
  await snap(p, 'reach_done');

  // ---------- (3) The Rift: force portal, move, jump, throw, return ----------
  await p.evaluate(() => window.__dbg.enterPortal('rift'));
  st = await waitFor(p, s => s.mode === 'rift', 20000, 'arrive rift');
  if (st && st.mode === 'rift') pass('rift-arrive', `pos=${st.hx},${st.hy},${st.hz}`);
  else fail('rift-arrive', JSON.stringify(st));

  const h0 = st ? { x: st.hx, z: st.hz } : { x: 0, z: 0 };
  await p.keyboard.down('KeyW');
  st = await waitFor(p, s => s.mode === 'rift' && Math.hypot(s.hx - h0.x, s.hz - h0.z) > 1.2, 10000, 'rift move');
  await p.keyboard.up('KeyW');
  if (st && Math.hypot(st.hx - h0.x, st.hz - h0.z) > 1.2) pass('rift-moves', `d=${Math.hypot(st.hx - h0.x, st.hz - h0.z).toFixed(2)}`);
  else fail('rift-moves', JSON.stringify({ h0, st }));

  await p.keyboard.down('Space');
  await p.waitForTimeout(80);
  await p.keyboard.up('Space');
  st = await waitFor(p, s => s.mode === 'rift' && (s.hvy > 2 || s.hy > 1.4), 4000, 'rift jump');
  if (st && (st.hvy > 2 || st.hy > 1.4)) pass('rift-jumps', `vy=${st.hvy} y=${st.hy}`);
  else fail('rift-jumps', JSON.stringify(st));

  await p.keyboard.press('KeyF');
  st = await waitFor(p, s => s.disc && s.disc !== 'held', 4000, 'rift disc');
  if (st && st.disc && st.disc !== 'held') pass('rift-throws', 'disc=' + st.disc);
  else fail('rift-throws', JSON.stringify(st));
  await snap(p, 'rift');

  await p.evaluate(() => window.__dbg.leavePortal(true, 8000));
  st = await waitFor(p, s => s.mode === 'pinball', 20000, 'return table from rift');
  if (st && st.mode === 'pinball') pass('rift-returns-table', 'sub=' + st.sub + ' score=' + st.score);
  else fail('rift-returns-table', JSON.stringify(st));

  await snap(p, 'done');
  console.log('ERRORS', errs.length, errs.length ? '\n' + errs.join('\n') : '');
  console.log(failed ? `FAILED ${failed}` : 'ALL PASSED');
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
