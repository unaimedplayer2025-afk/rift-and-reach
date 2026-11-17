import * as THREE from 'three';
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const angLerp = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

export function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o }); }
export function glow(color, intensity = 2) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false }); }
export function additive(color, opacity = 0.5, o = {}) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, ...o }); }

export function rimify(mat, rimColor, strength = 2.6, power = 2.0) {
  const rim = { value: new THREE.Color(rimColor).multiplyScalar(strength) }, pw = { value: power };
  mat.userData.rim = rim;
  mat.onBeforeCompile = sh => {
    sh.uniforms.rimColor = rim; sh.uniforms.rimPow = pw;
    sh.fragmentShader = 'uniform vec3 rimColor; uniform float rimPow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n float rimF = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);\n totalEmissiveRadiance += rimColor * pow(rimF, rimPow);');
  };
  mat.customProgramCacheKey = () => 'rim';
  return mat;
}

export function part(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); parent.add(m); return m;
}
export function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; }

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}

export const Tex = {
  grid(rep) {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#07010f'; g.fillRect(0, 0, w, h);
      g.shadowBlur = 10; g.shadowColor = '#ff2ad4'; g.strokeStyle = '#ff3ae0'; g.lineWidth = 5; g.strokeRect(0, 0, w, h);
      g.shadowColor = '#2af0ff'; g.strokeStyle = 'rgba(60,220,255,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    }, rep);
  },
  windows(lit, colors) {
    return canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = '#0a0612'; g.fillRect(0, 0, w, h);
      for (let y = 8; y < h - 8; y += 16) for (let x = 6; x < w - 6; x += 14) {
        if (Math.random() < lit) { g.fillStyle = pick(colors); g.globalAlpha = 0.5 + Math.random() * 0.5; g.fillRect(x, y, 8, 9); }
        else { g.fillStyle = '#140c20'; g.globalAlpha = 1; g.fillRect(x, y, 8, 9); }
      }
      g.globalAlpha = 1;
    });
  },
  sign(text, color, bg = 'rgba(0,0,0,0)', font = 'bold italic 72px "Arial Black", Impact, sans-serif') {
    return canvasTex(1024, 160, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 28; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4);
      g.shadowBlur = 0; g.fillStyle = '#fff'; g.globalAlpha = 0.65; g.fillText(text, w / 2, h / 2 + 4);
    });
  },
  digits(text, color = '#ff9a2a') {
    return canvasTex(1024, 160, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = 'bold 92px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = color; g.shadowBlur = 16; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4);
      g.shadowBlur = 0; g.fillStyle = '#ffd89a'; g.globalAlpha = 0.9; g.fillText(text, w / 2, h / 2 + 4);
    });
  },
  dot() {
    return canvasTex(64, 64, (g, w) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  },
  ring() {
    return canvasTex(128, 128, (g, w) => { const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  },
  rock() {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#1a2228'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) { const v = 30 + Math.random() * 50 | 0; g.fillStyle = `rgba(${v - 8},${v},${v + 8},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 2); }
      for (let i = 0; i < 16; i++) { g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 50; y += Math.random() * 30; g.lineTo(x, y); } g.stroke(); }
    });
  },
  nebula(rep) {
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#02010c'; g.fillRect(0, 0, w, h);
      const clouds = [
        [0.28, 0.38, 210, 'rgba(70,18,110,0.9)'],
        [0.72, 0.32, 230, 'rgba(18,40,120,0.8)'],
        [0.5, 0.68, 190, 'rgba(110,20,90,0.65)'],
        [0.18, 0.78, 150, 'rgba(8,80,110,0.6)'],
        [0.88, 0.62, 170, 'rgba(80,10,100,0.55)'],
        [0.45, 0.2, 160, 'rgba(30,60,140,0.45)'],
        [0.6, 0.85, 140, 'rgba(40,20,90,0.5)']
      ];
      for (const [u, v, r, col] of clouds) {
        const x = u * w, y = v * h;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.fillStyle = '#fff';
      for (let i = 0; i < 400; i++) {
        g.globalAlpha = 0.2 + Math.random() * 0.8;
        const s = Math.random() < 0.9 ? 1 : 2;
        g.fillRect(Math.random() * w, Math.random() * h, s, s);
      }
      g.globalAlpha = 1;
    }, rep);
  },
  circuit() {
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#050114'; g.fillRect(0, 0, w, h);
      const traces = (color, n, lw) => {
        g.strokeStyle = color; g.lineWidth = lw; g.shadowColor = color; g.shadowBlur = 8;
        for (let i = 0; i < n; i++) {
          g.beginPath();
          let x = Math.random() * w, y = Math.random() * h;
          g.moveTo(x, y);
          const segs = 4 + (Math.random() * 6 | 0);
          for (let k = 0; k < segs; k++) {
            if (Math.random() < 0.5) x += (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 60);
            else y += (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 60);
            g.lineTo(x, y);
          }
          g.stroke();
        }
        g.shadowBlur = 0;
        g.fillStyle = color;
        for (let i = 0; i < n * 2; i++) {
          const x = Math.random() * w, y = Math.random() * h;
          g.beginPath(); g.arc(x, y, 2 + Math.random() * 2, 0, 6.28); g.fill();
        }
      };
      traces('rgba(40,220,255,0.55)', 28, 1.4);
      traces('rgba(255,130,40,0.45)', 18, 1.2);
      traces('rgba(180,80,255,0.35)', 12, 1);
    });
  },
  sigil() {
    // Technical holographic glyph, like the bottom-corner panels in the reference
    return canvasTex(512, 512, (g, w, h) => {
      const cx = w / 2, cy = h / 2;
      g.clearRect(0, 0, w, h);
      const ring = (r, color, lw, dash) => {
        g.save();
        g.strokeStyle = color; g.lineWidth = lw; g.shadowColor = color; g.shadowBlur = 10;
        if (dash) g.setLineDash(dash);
        g.beginPath(); g.arc(cx, cy, r, 0, 6.28); g.stroke();
        g.restore();
      };
      ring(240, 'rgba(40,220,255,0.55)', 2);
      ring(228, 'rgba(255,140,40,0.7)', 3);
      ring(200, 'rgba(160,80,255,0.45)', 1.5, [6, 8]);
      ring(172, 'rgba(40,220,255,0.7)', 2);
      ring(118, 'rgba(255,150,50,0.55)', 1.5);
      ring(88, 'rgba(40,220,255,0.85)', 2.5);
      ring(36, 'rgba(255,170,70,0.95)', 2);
      // tick marks around the outer ring
      g.shadowBlur = 6;
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * Math.PI * 2;
        const long = i % 5 === 0;
        const r0 = 228, r1 = 228 + (long ? 16 : 8);
        g.strokeStyle = long ? 'rgba(255,150,50,0.85)' : 'rgba(40,220,255,0.6)';
        g.lineWidth = long ? 2 : 1;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        g.stroke();
      }
      // radial construction lines
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + Math.PI / 8;
        g.strokeStyle = i % 2 ? 'rgba(40,220,255,0.45)' : 'rgba(255,140,40,0.4)';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 40);
        g.lineTo(cx + Math.cos(a) * 200, cy + Math.sin(a) * 200);
        g.stroke();
      }
      // inner diamond / tetrahedron
      g.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + Math.PI / 4;
        const x = cx + Math.cos(a) * 62, y = cy + Math.sin(a) * 62;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.strokeStyle = 'rgba(40,230,255,0.95)'; g.lineWidth = 2.2; g.shadowColor = '#40e8ff'; g.shadowBlur = 12; g.stroke();
      // crosshair
      g.beginPath(); g.moveTo(cx - 18, cy); g.lineTo(cx + 18, cy); g.moveTo(cx, cy - 18); g.lineTo(cx, cy + 18); g.stroke();
      // corner orange circuit brackets
      g.shadowColor = '#ff8a20'; g.shadowBlur = 8; g.strokeStyle = 'rgba(255,140,40,0.8)'; g.lineWidth = 2;
      const br = 200;
      for (const [sx, sy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
        g.beginPath();
        g.moveTo(cx + sx * (br - 40), cy + sy * br);
        g.lineTo(cx + sx * br, cy + sy * br);
        g.lineTo(cx + sx * br, cy + sy * (br - 40));
        g.stroke();
      }
      g.shadowBlur = 0;
    });
  },
  bark() {
    return canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#0a0c0a'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 8) {
        g.strokeStyle = `rgba(${10 + Math.random() * 20 | 0},${14 + Math.random() * 16 | 0},${8 + Math.random() * 10 | 0},0.8)`;
        g.lineWidth = 3 + Math.random() * 4;
        g.beginPath(); g.moveTo(x + Math.random() * 4, 0);
        for (let y = 0; y < h; y += 16) g.lineTo(x + Math.sin(y * 0.04) * 4, y);
        g.stroke();
      }
    });
  },
  metal() {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#2a2e32'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        const v = 40 + Math.random() * 50 | 0;
        g.fillStyle = `rgba(${v},${v + 2},${v + 4},0.35)`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    });
  },
  armor() {
    // Dark forest-green plate armor with visible panel seams
    return canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#2a4a36'; g.fillRect(0, 0, w, h);
      // subtle noise
      for (let i = 0; i < 8000; i++) {
        const v = 14 + Math.random() * 28 | 0;
        g.fillStyle = `rgba(${v - 4},${v + 6},${v - 2},0.28)`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      // plate grid
      const cols = 6, rows = 5;
      const pw = w / cols, ph = h / rows;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = i * pw + 6, y = j * ph + 6;
        const lift = 10 + Math.random() * 18 | 0;
        g.fillStyle = `rgba(${28 + lift},${50 + lift},${34 + lift},0.5)`;
        g.fillRect(x, y, pw - 12, ph - 12);
        g.strokeStyle = 'rgba(6,10,8,0.85)'; g.lineWidth = 3;
        g.strokeRect(x, y, pw - 12, ph - 12);
        // rivets
        g.fillStyle = 'rgba(30,36,32,0.9)';
        for (const [rx, ry] of [[8, 8], [pw - 20, 8], [8, ph - 20], [pw - 20, ph - 20]]) {
          g.beginPath(); g.arc(x + rx, y + ry, 2.4, 0, 6.28); g.fill();
        }
      }
      // a few curved seam highlights
      g.strokeStyle = 'rgba(8,14,10,0.7)'; g.lineWidth = 2;
      g.beginPath(); g.arc(w * 0.5, h * 0.55, 180, 0.2, 2.6); g.stroke();
      g.beginPath(); g.arc(w * 0.5, h * 0.4, 200, 3.4, 5.9); g.stroke();
    });
  }
};

export function instanced(geo, mat, poses) {
  const mesh = new THREE.InstancedMesh(geo, mat, poses.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  for (let i = 0; i < poses.length; i++) {
    const o = poses[i];
    p.set(o.x, o.y, o.z);
    e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    q.setFromEuler(e);
    s.set(o.s || o.sx || 1, o.sy || o.s || 1, o.sz || o.s || 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

export function makeCurve(pts, closed = false) {
  const v = pts.map(p => p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2]));
  return new THREE.CatmullRomCurve3(v, closed, 'catmullrom', 0.35);
}
