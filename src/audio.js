// Audio: procedural WebAudio SFX + music hooks.
// Swap tracks by replacing the matching pair in /audio (OGG + MP3 Safari/iOS fallback):
//   audio/title-theme.{ogg,mp3}  — title / backglass screen
//   audio/pinball.{ogg,mp3}      — table play
//   audio/rift.{ogg,mp3}         — Portal A action level
//   audio/reach.{ogg,mp3}        — Portal B racer
// Picked with canPlayType. ModeMusic in main.js fades between gameplay beds.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const Snd = {
  ac: null, master: null, title: null, titleVol: 0, unlocked: false, muted: false, duck: 1, noiseBuf: null, onTitle: true,
  init() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ac = new AC(); this.master = this.ac.createGain(); this.master.gain.value = this.muted ? 0 : 0.45; this.master.connect(this.ac.destination);
        const n = this.ac.sampleRate; this.noiseBuf = this.ac.createBuffer(1, n, n); const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
    }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume().catch(() => {});
    this.unlocked = true;
    if (this.onTitle) this.playTitle();
  },
  makeTitle() {
    if (this.title) return;
    const a = new Audio(); a.loop = true; a.preload = 'auto';
    const ogg = a.canPlayType('audio/ogg; codecs="vorbis"') || a.canPlayType('audio/ogg; codecs="opus"');
    a.src = ogg ? 'audio/title-theme.ogg' : 'audio/title-theme.mp3';
    a.volume = 0; this.title = a;
  },
  playTitle() {
    this.makeTitle();
    if (this.title.paused && !this.muted && this.unlocked) { try { this.title.volume = this.titleVol; } catch (e) {} const p = this.title.play(); if (p && p.catch) p.catch(() => {}); }
  },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.45;
    if (this.title) { if (m) this.title.pause(); else if (this.onTitle) this.playTitle(); }
  },
  toggleMute() { this.setMuted(!this.muted); if (!this.muted && !this.unlocked) this.init(); return this.muted; },
  update(dt) {
    this.duck += (1 - this.duck) * Math.min(1, dt * 2);
    const want = this.onTitle && this.unlocked && !this.muted;
    this.titleVol = want ? Math.min(0.6, this.titleVol + dt * 0.9) : Math.max(0, this.titleVol - dt * 0.65);
    if (this.title) {
      if (want && this.title.paused) this.playTitle();
      try { this.title.volume = clamp(this.titleVol * (0.6 + 0.4 * this.duck), 0, 1); } catch (e) {}
      if (!want && this.titleVol <= 0 && !this.title.paused) this.title.pause();
    }
  },
  tone(f, d, type = 'square', v = 0.15, f2 = 0, delay = 0) {
    if (!this.ac || this.muted) return; this.duck = Math.min(this.duck, 0.6);
    const t = this.ac.currentTime + delay, o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + d + 0.05);
  },
  noise(d, v = 0.3, freq = 1000, type = 'lowpass', f2 = 0) {
    if (!this.ac || this.muted) return; this.duck = Math.min(this.duck, 0.6);
    const t = this.ac.currentTime, s = this.ac.createBufferSource(), fl = this.ac.createBiquadFilter(), g = this.ac.createGain();
    s.buffer = this.noiseBuf; fl.type = type; fl.frequency.setValueAtTime(freq, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
  }
};
export const SFX = {
  throw()  { Snd.noise(0.2, 0.2, 2600, 'bandpass', 700); Snd.tone(260, 0.18, 'sawtooth', 0.05, 900); },
  catch()  { Snd.tone(1300, 0.05, 'square', 0.05, 900); Snd.noise(0.05, 0.12, 4000, 'highpass'); },
  hit()    { Snd.tone(900, 0.06, 'square', 0.08, 300); Snd.noise(0.08, 0.25, 3000); },
  clang()  { Snd.tone(1400, 0.12, 'triangle', 0.08, 700); Snd.tone(2100, 0.1, 'square', 0.03, 1500); Snd.noise(0.07, 0.2, 5000, 'highpass'); },
  boom()   { Snd.noise(0.5, 0.5, 900, 'lowpass', 80); Snd.tone(110, 0.4, 'sawtooth', 0.15, 30); },
  jump()   { Snd.tone(180, 0.12, 'square', 0.07, 360); },
  roll()   { Snd.noise(0.22, 0.16, 1200, 'bandpass', 3000); },
  land()   { Snd.tone(70, 0.12, 'square', 0.08, 35); Snd.noise(0.1, 0.12, 400); },
  hurt()   { Snd.tone(300, 0.25, 'sawtooth', 0.14, 70); Snd.noise(0.12, 0.2, 1500); },
  die()    { Snd.tone(330, 0.9, 'sawtooth', 0.18, 40); Snd.noise(0.5, 0.35, 700, 'lowpass', 100); },
  start()  { Snd.tone(110, 0.6, 'sawtooth', 0.12, 55); Snd.noise(0.5, 0.3, 500); },
  win()    { [523, 659, 784, 1046].forEach((f, i) => Snd.tone(f, 0.25, 'square', 0.08, 0, i * 0.14)); },
  warp()   { Snd.tone(200, 0.9, 'sine', 0.22, 1600); Snd.tone(1600, 0.9, 'triangle', 0.08, 120); Snd.noise(0.8, 0.18, 4000, 'bandpass', 300); },
  pickup() { Snd.tone(523, 0.08, 'square', 0.09); Snd.tone(784, 0.1, 'square', 0.09, 0, 0.08); Snd.tone(1046, 0.2, 'square', 0.09, 0, 0.16); },
  dash()   { Snd.noise(0.16, 0.14, 1800, 'bandpass', 4000); },
  ko()     { Snd.tone(180, 0.18, 'square', 0.1, 60); Snd.noise(0.14, 0.25, 1200); Snd.tone(880, 0.12, 'square', 0.05, 1320, 0.05); },
  // pinball
  flip()    { Snd.tone(80, 0.08, 'square', 0.1, 40); Snd.noise(0.06, 0.12, 400, 'lowpass'); },
  bumper()  { Snd.tone(880, 0.12, 'square', 0.12, 400); Snd.tone(1320, 0.1, 'triangle', 0.06, 800); Snd.noise(0.08, 0.18, 2000); },
  sling()   { Snd.tone(600, 0.08, 'square', 0.08, 200); Snd.noise(0.07, 0.16, 1500); },
  target()  { Snd.tone(1480, 0.1, 'triangle', 0.1, 2200); Snd.tone(988, 0.12, 'square', 0.05); },
  plunger() { Snd.noise(0.18, 0.22, 600, 'lowpass', 80); Snd.tone(90, 0.2, 'sawtooth', 0.12, 40); },
  drain()   { Snd.tone(200, 0.5, 'sawtooth', 0.12, 50); Snd.noise(0.35, 0.2, 400, 'lowpass', 80); },
  glass()   { Snd.tone(1800, 0.08, 'triangle', 0.04, 900); Snd.noise(0.06, 0.08, 5000, 'highpass'); },
  ding()    { Snd.tone(1200, 0.15, 'sine', 0.08, 1800); Snd.tone(1800, 0.12, 'triangle', 0.05, 0, 0.04); },
  lit()     { Snd.tone(392, 0.12, 'square', 0.07); Snd.tone(523, 0.12, 'square', 0.07, 0, 0.1); Snd.tone(784, 0.3, 'square', 0.07, 0, 0.2); },
  boost()   { Snd.noise(0.3, 0.2, 800, 'lowpass', 2000); Snd.tone(140, 0.25, 'sawtooth', 0.08, 400); },
  open()    { Snd.tone(392, 0.12, 'square', 0.07); Snd.tone(523, 0.12, 'square', 0.07, 0, 0.1); Snd.tone(784, 0.3, 'square', 0.07, 0, 0.2); },
  charge()  { Snd.tone(200, 0.5, 'sawtooth', 0.05, 1200); },
  spawn()   { Snd.tone(60, 0.4, 'sawtooth', 0.08, 400); Snd.noise(0.3, 0.15, 5000, 'highpass'); },
  pad()      { Snd.tone(150, 0.5, 'sine', 0.2, 900); Snd.noise(0.4, 0.15, 3000, 'bandpass', 600); },
  ramp()     { Snd.noise(0.45, 0.22, 900, 'bandpass', 2800); Snd.tone(220, 0.4, 'sine', 0.07, 880); },
  jackpot()  { [523, 659, 784, 1046, 1318].forEach((f, i) => Snd.tone(f, 0.22, 'square', 0.1, 0, i * 0.09)); Snd.noise(0.3, 0.12, 2000, 'bandpass', 800); },
  save()     { Snd.tone(440, 0.12, 'square', 0.09); Snd.tone(880, 0.18, 'square', 0.09, 0, 0.1); },
  nudge()    { Snd.noise(0.08, 0.18, 200, 'lowpass'); Snd.tone(60, 0.08, 'sine', 0.08); },
  tilt()     { Snd.tone(90, 0.8, 'sawtooth', 0.16, 40); Snd.noise(0.5, 0.22, 300, 'lowpass'); },
  saucer()   { Snd.tone(180, 0.2, 'triangle', 0.08, 90); Snd.noise(0.15, 0.1, 700, 'lowpass'); },
  kicker()   { Snd.tone(140, 0.16, 'sawtooth', 0.12, 50); Snd.noise(0.12, 0.2, 500, 'lowpass'); },
  spinner()  { Snd.tone(1400, 0.06, 'triangle', 0.05, 900); },
  magnet()   { Snd.tone(90, 0.35, 'sine', 0.1, 180); Snd.tone(180, 0.35, 'sine', 0.06, 80); },
  returned() { Snd.tone(330, 0.12, 'square', 0.07); Snd.tone(220, 0.2, 'square', 0.07, 0, 0.1); },
  undock()   { Snd.tone(90, 0.3, 'sine', 0.08, 40); Snd.noise(0.2, 0.12, 400, 'lowpass'); Snd.tone(220, 0.15, 'triangle', 0.05, 0, 0.2); },
  reentry()  { Snd.noise(0.6, 0.08, 300, 'lowpass'); Snd.tone(70, 0.8, 'sine', 0.07); },
  plasma()   { Snd.noise(0.18, 0.16, 900, 'bandpass', 600); Snd.tone(110, 0.2, 'sawtooth', 0.05, 80); },
  shield()   { Snd.tone(180, 0.2, 'sine', 0.1, 320); Snd.noise(0.12, 0.1, 1200, 'bandpass', 400); },
  chute()    { Snd.noise(0.25, 0.1, 600, 'lowpass'); Snd.tone(330, 0.3, 'triangle', 0.07, 180); },
  splash()   { Snd.noise(0.35, 0.16, 400, 'lowpass'); Snd.tone(140, 0.35, 'sine', 0.08, 40); Snd.tone(220, 0.2, 'sine', 0.05, 0, 0.15); },
  breakup()  { Snd.noise(0.7, 0.28, 200, 'lowpass'); Snd.tone(80, 0.7, 'sawtooth', 0.16, 30); Snd.tone(40, 0.5, 'sine', 0.12); },
  skip()     { Snd.tone(200, 0.4, 'sine', 0.08, 80); Snd.noise(0.3, 0.1, 800, 'bandpass', 200); },
  touchdown(){ [392, 523, 659, 784].forEach((f, i) => Snd.tone(f, 0.18, 'square', 0.08, 0, i * 0.08)); Snd.noise(0.15, 0.1, 400, 'lowpass'); },
  hardland() { Snd.noise(0.55, 0.28, 180, 'lowpass'); Snd.tone(70, 0.5, 'sawtooth', 0.14, 25); },
  miss()     { Snd.noise(0.4, 0.18, 350, 'lowpass'); Snd.tone(160, 0.3, 'sine', 0.07, 50); },
  callout(name) {
    // Simple voice-like formant blips — short announced phrases.
    const map = {
      MULTIBALL: [180, 220, 280, 200, 320],
      JACKPOT: [300, 380, 240, 420],
      'RIFT OPEN': [200, 260, 340],
      'REACH OPEN': [180, 240, 300, 360],
      'BALL SAVED': [240, 200, 280],
      'BALL RETURNED': [200, 160, 200],
      TILT: [90, 70],
      'DANGER': [160, 120, 160],
      ROWLEX: [200, 240, 180, 260, 220, 300],
      COMBO: [260, 320, 280],
      'RE-ENTRY': [160, 200, 260, 320],
      'RE-ENTRY OPEN': [160, 200, 260, 320],
      SPLASHDOWN: [200, 260, 320, 260],
      BREAKUP: [80, 60, 40],
      SKIPPED: [220, 180, 140],
      BULLSEYE: [300, 380, 460, 520],
      'ON DECK': [240, 300, 360],
      'CENTER DECK': [240, 300, 380],
      'HARD LANDING': [80, 60, 40],
      MISSED: [160, 120, 90],
    };
    const seq = map[name] || [200, 250, 180];
    seq.forEach((f, i) => {
      Snd.tone(f, 0.11, 'sawtooth', 0.07, f * 0.8, i * 0.09);
      Snd.tone(f * 1.6, 0.09, 'triangle', 0.035, f * 1.2, i * 0.09);
    });
  },
};
