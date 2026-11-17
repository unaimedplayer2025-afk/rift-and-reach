// Fast deterministic-step run of the ?capture demo: logs events; optional screenshots.
const { chromium } = require('playwright');
const STEP = +(process.argv[2] || 4), SHOTS = process.argv[3] === 'shots';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | ')));
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ' ' + m.text()); });
  await p.goto('http://localhost:8767/index.html?capture&seed=' + (process.env.SEED || 7)); await p.waitForFunction(() => window.__cap);
  let last = '', t0 = Date.now(); const shots = {};
  for (let f = 0; f < 60 * 70 / STEP; f++) {
    const s = await p.evaluate(n => window.__cap.step(n), STEP);
    const key = [s.mode, s.sub, s.riftLit, s.reachLit, s.disc].join('|');
    if (key !== last) { console.log((s.t || 0).toFixed(1).padStart(6), key, 'score', s.score, 'en', (s.enemies || []).join(',')); last = key; }
    if (SHOTS) {
      const tag = s.mode === 'title' && s.titleT > 1 && s.titleT < 2 ? 'title-eye'
        : s.mode === 'title' && s.titleT > 3 && s.titleT < 4 ? 'title-rift'
        : s.mode === 'title' && s.titleT > 5 && s.titleT < 6 ? 'title-backglass'
        : s.mode === 'title' && s.titleT > 6.5 && s.titleT < 7.5 ? 'title-reach'
        : s.mode === 'pinball' && s.sub === 'play' && !shots.pinball ? 'pinball'
        : s.mode === 'rift' && s.disc === 'out' ? 'rift-disc'
        : s.mode === 'rift' && !shots.rift ? 'rift'
        : s.mode === 'reach' && s.disc === 'out' ? 'reach-disc'
        : s.mode === 'reach' && !shots.reach ? 'reach'
        : s.mode === 'warp' && !shots['warp-' + s.t] ? 'warp'
        : null;
      if (tag && !shots[tag]) { shots[tag] = 1; await p.screenshot({ path: `/tmp/rr_${tag}.png` }); }
    }
  }
  console.log('wall', ((Date.now() - t0) / 1000).toFixed(0), 's  errors', errs.length, errs.slice(0, 10).join('\n'));
  await b.close();
})();
