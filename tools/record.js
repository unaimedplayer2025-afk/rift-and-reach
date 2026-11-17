// Records the ?capture autopilot run frame-by-frame (fixed 60Hz sim, 30fps output) -> /tmp/rr_frames
const { chromium } = require('playwright'); const fs = require('fs');
const W = +(process.env.W || 1280), H = +(process.env.H || 720), DIR = '/tmp/rr_frames';
(async () => {
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR);
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 }); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.goto('http://localhost:8767/index.html?capture&seed=' + (process.env.SEED || 7)); await p.waitForFunction(() => window.__cap);
  await p.waitForTimeout(400);
  const log = []; let seenReach = false, finaleAt = -1;
  const MAX = 30 * 60;
  for (let f = 0; f < MAX; f++) {
    const s = await p.evaluate(() => window.__cap.step(2));
    await p.screenshot({ path: `${DIR}/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 88 });
    log.push({ f, ...s });
    if (s.mode === 'reach') seenReach = true;
    if (f % 30 === 0) console.log('frame', f, s.mode, s.sub || '', 't', (s.t || 0).toFixed(1), 'titleT', (s.titleT || 0).toFixed(1), 'modeT', (s.modeT || 0).toFixed(1), 'disc', s.disc, new Date().toLocaleTimeString());
    if (seenReach && s.mode === 'pinball' && (s.modeT || 0) > 3.2 && finaleAt < 0) finaleAt = f;
    if (finaleAt >= 0 && f - finaleAt >= 90) break;
  }
  fs.writeFileSync('/tmp/rr_frames.json', JSON.stringify(log));
  console.log('done frames', log.length, 'errors', errs.length, errs.slice(0, 8).join(' | '), 'seenReach', seenReach);
  await b.close();
})();
