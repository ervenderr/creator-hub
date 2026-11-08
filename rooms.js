// Themed look for each department room: floor pattern, wall board at the standing stations, and props in the
// free band south of the desks. Meeting and break rooms get a few extras too. Visual only: walking spots live in layout.js.
import * as THREE from "./vendor/three.module.min.js";
import { deskSeats } from "./layout.js";

const WALL_T = 0.25;
const boardDx = (def) => def.w / 2 - 2.2; // boards hang between each pair of standing stations (see stationSpots)
const mat = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0, ...extra });
const glowMat = (hex) => mat(hex, { emissive: hex, emissiveIntensity: 1.2 });
const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function paint(w, h, draw, repeat) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const fill = (g, color, w, h) => { g.fillStyle = color; g.fillRect(0, 0, w, h); };
const line = (g, x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
const lighter = (hex, a) => "#" + new THREE.Color(hex).lerp(new THREE.Color(0xffffff), a).getHexString();
const STICKY = ["#fde047", "#fb7185", "#7dd3fc", "#86efac", "#c4b5fd"];

// ---- floors: 256px tile = 4 world units ----
const FLOORS = {
  engineering: (g, w) => { fill(g, "#1f2a3a", w, w); g.strokeStyle = "#3b6ea5"; g.lineWidth = 2; for (let i = 0; i <= w; i += 64) { line(g, i, 0, i, w); line(g, 0, i, w, i); } },
  specialists: (g, w) => { fill(g, "#4b3b7a", w, w); g.strokeStyle = "#5c4a93"; g.lineWidth = 14; for (let i = -w; i < 2 * w; i += 40) line(g, i, 0, i + w, w); },
  marketing: (g, w, c) => { fill(g, "#f6e7d3", w, w); const r = rng(3); g.fillStyle = lighter(c, 0.45); for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(r() * w, r() * w, 14 + r() * 26, 0, 7); g.fill(); } },
  security: (g, w) => { fill(g, "#2b2e33", w, w); g.fillStyle = "#c0392b"; g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, w); const r = rng(5); g.fillStyle = "#3a3e44"; for (let i = 0; i < 80; i++) g.fillRect(r() * w, r() * w, 3, 3); },
  geo: (g, w) => { fill(g, "#d5e8cd", w, w); g.strokeStyle = "#9fc79a"; g.lineWidth = 2; for (let k = 1; k < 7; k++) for (const [x, y] of [[70, 80], [190, 180]]) { g.beginPath(); g.ellipse(x, y, k * 16, k * 11, 0.4, 0, 7); g.stroke(); } },
  design: (g, w) => { fill(g, "#fbfaf7", w, w); const r = rng(9), pal = ["#f26b1d", "#3b82f6", "#ec4899", "#10b981", "#8b5cf6", "#facc15"]; for (let i = 0; i < 70; i++) { g.fillStyle = pal[i % 6]; g.beginPath(); g.ellipse(r() * w, r() * w, 2 + r() * 6, 2 + r() * 4, r() * 3, 0, 7); g.fill(); } },
  sales: (g, w) => { fill(g, "#6e1c28", w, w); g.strokeStyle = "#c9a24b"; g.lineWidth = 2; for (let i = 0; i <= w; i += 128) { line(g, i, 0, i, w); line(g, 0, i, w, i); } },
  qa: (g, w) => { fill(g, "#eaf4f0", w, w); g.fillStyle = "#dff0ea"; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) g.fillRect(i * 64, j * 64, 64, 64); g.strokeStyle = "#b9cfc7"; g.lineWidth = 2; for (let i = 0; i <= w; i += 64) { line(g, i, 0, i, w); line(g, 0, i, w, i); } },
  pm: (g, w) => { const t = ["#d9b98c", "#cfae80", "#e0c398", "#c8a478"]; g.strokeStyle = "#a88358"; g.lineWidth = 2; for (let r = 0; r < 8; r++) { const off = (r % 2) * 64; for (let x = -off; x < w; x += 128) { g.fillStyle = t[(r + (((x + off) / 128) % 2) * 2) % 4]; g.fillRect(x, r * 32, 128, 32); g.strokeRect(x, r * 32, 128, 32); } } },
  ops: (g, w) => { fill(g, "#3d4f66", w, w); const r = rng(11); g.fillStyle = "#46596f"; for (let i = 0; i < 120; i++) g.fillRect(r() * w, r() * w, 4, 2); },
  meeting: (g, w) => { fill(g, "#efeaf9", w, w); g.strokeStyle = "#ddd5f2"; g.lineWidth = 6; for (let i = 0; i <= w; i += 128) { line(g, i, 0, i, w); line(g, 0, i, w, i); } },
  break: (g, w) => { fill(g, "#f2efe8", w, w); g.fillStyle = "#2d3340"; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) g.fillRect(i * 64, j * 64, 64, 64); },
};
export const floorTexture = (id, color, w, d) => FLOORS[id] && paint(256, 256, (g, s) => FLOORS[id](g, s, color), [w / 4, d / 4]);
const WALLS = { engineering: 0xd8e2f0, security: 0xa3a8b3, sales: 0xe9cfd2, qa: 0xe6f2ee, ops: 0xd9e0ea, meeting: 0xf5f2fc, break: 0xf7e8c8 };
export const wallColor = (id) => WALLS[id] ?? null;

// ---- wall boards (512x256) ----
const BOARDS = {
  engineering: (g) => { fill(g, "#fbfbf8", 512, 256); g.strokeStyle = "#23324a"; g.lineWidth = 4; g.fillStyle = "#23324a"; g.font = "700 30px sans-serif"; g.textAlign = "center";
    [["API", 40], ["DB", 205], ["UI", 370]].forEach(([t, x]) => { g.strokeRect(x, 40, 110, 70); g.fillText(t, x + 55, 88); });
    line(g, 150, 75, 205, 75); line(g, 315, 75, 370, 75); g.fillStyle = "#16a34a"; g.font = "16px monospace"; g.textAlign = "left";
    ["def deploy():", "  run(tests)", "  ship(build)  # ok"].forEach((t, i) => g.fillText(t, 40, 160 + i * 26)); },
  specialists: (g) => { fill(g, "#c89a62", 512, 256); const r = rng(2); g.strokeStyle = "#dc2626"; g.lineWidth = 2; g.beginPath(); g.moveTo(60, 60); g.lineTo(250, 180); g.lineTo(440, 70); g.stroke();
    for (let i = 0; i < 14; i++) { g.save(); g.translate(30 + (i % 7) * 68, 30 + Math.floor(i / 7) * 110); g.rotate((r() - 0.5) * 0.25); g.fillStyle = STICKY[i % 5]; g.fillRect(0, 0, 58, 54); g.fillStyle = "#0004"; g.fillRect(8, 20, 40, 3); g.fillRect(8, 30, 30, 3); g.fillStyle = "#dc2626"; g.beginPath(); g.arc(29, 6, 4, 0, 7); g.fill(); g.restore(); } },
  marketing: (g) => { fill(g, "#16181d", 512, 256); g.fillStyle = "#fff"; g.font = "700 26px sans-serif"; g.fillText("REACH", 30, 50); g.strokeStyle = "#f26b1d"; g.lineWidth = 6; g.beginPath();
    [[30, 210], [110, 190], [190, 195], [270, 140], [350, 110], [420, 60]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.fillStyle = "#f26b1d"; g.font = "700 54px sans-serif"; g.textAlign = "right"; g.fillText("+248%", 490, 230); },
  security: (g) => { fill(g, "#06120c", 512, 256); g.strokeStyle = "#22c55e"; g.lineWidth = 2; for (const r of [100, 66, 33]) { g.beginPath(); g.arc(140, 128, r, 0, 7); g.stroke(); } line(g, 140, 128, 210, 70);
    g.fillStyle = "#ef4444"; for (const [x, y] of [[110, 90], [180, 150], [95, 160]]) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); } g.fillStyle = "#22c55e"; g.font = "700 22px monospace"; g.fillText("THREATS BLOCKED", 270, 100); g.font = "700 48px monospace"; g.fillText("0 ACTIVE", 270, 170); },
  geo: (g) => { fill(g, "#1e4d7a", 512, 256); g.strokeStyle = "#ffffff30"; g.lineWidth = 1; for (let i = 0; i < 512; i += 64) line(g, i, 0, i, 256); for (let j = 0; j < 256; j += 64) line(g, 0, j, 512, j);
    const r = rng(4); g.fillStyle = "#4ea66b"; for (let i = 0; i < 16; i++) { g.beginPath(); g.ellipse(40 + r() * 430, 40 + r() * 170, 24 + r() * 40, 14 + r() * 26, r() * 3, 0, 7); g.fill(); } g.fillStyle = "#ef4444"; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(60 + r() * 400, 50 + r() * 150, 5, 0, 7); g.fill(); } },
  design: (g) => { fill(g, "#faf7f2", 512, 256); ["#f26b1d", "#3b82f6", "#ec4899", "#10b981", "#8b5cf6", "#facc15"].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(50 + i * 80, 50, 28, 0, 7); g.fill(); });
    g.strokeStyle = "#23324a"; g.lineWidth = 4; for (let i = 0; i < 3; i++) g.strokeRect(30 + i * 160, 110, 130, 110); g.beginPath(); g.moveTo(40, 190); g.bezierCurveTo(80, 120, 120, 230, 150, 150); g.stroke(); },
  sales: (g) => { fill(g, "#2a0e14", 512, 256); g.fillStyle = "#facc15"; g.font = "700 26px sans-serif"; g.fillText("TOP CLOSERS", 30, 42);
    [380, 320, 250, 190].forEach((w, i) => { g.fillStyle = i ? "#c9a24b" : "#facc15"; g.fillRect(30, 62 + i * 46, w, 32); g.fillStyle = "#2a0e14"; g.font = "700 20px sans-serif"; g.fillText(String(i + 1), 40, 86 + i * 46); }); },
  qa: (g) => { fill(g, "#f4faf7", 512, 256); g.fillStyle = "#23324a"; g.font = "700 26px sans-serif"; g.fillText("BUGS", 30, 42);
    for (let i = 0; i < 5; i++) { const y = 66 + i * 36, bad = i === 1 || i === 3; g.strokeStyle = "#23324a"; g.lineWidth = 2; g.strokeRect(30, y, 24, 24); g.strokeStyle = bad ? "#dc2626" : "#16a34a"; g.lineWidth = 4;
      if (bad) { line(g, 34, y + 4, 50, y + 20); line(g, 50, y + 4, 34, y + 20); } else { g.beginPath(); g.moveTo(34, y + 12); g.lineTo(42, y + 20); g.lineTo(54, y + 2); g.stroke(); } g.fillStyle = "#cbd5d1"; g.fillRect(70, y + 8, 300 - i * 30, 8); } },
  pm: (g) => { fill(g, "#f7f7f2", 512, 256); [["TO DO", "#ef4444"], ["DOING", "#f59e0b"], ["DONE", "#22c55e"]].forEach(([t, c], i) => { const x = 20 + i * 165; g.fillStyle = c; g.fillRect(x, 16, 150, 28); g.fillStyle = "#fff"; g.font = "700 18px sans-serif"; g.fillText(t, x + 10, 36);
      for (let k = 0; k < 3 - i + 1; k++) { g.fillStyle = STICKY[(i * 2 + k) % 5]; g.fillRect(x + 10 + (k % 2) * 68, 58 + Math.floor(k / 2) * 64 + (k % 2) * 8, 58, 52); } }); },
  ops: (g) => { fill(g, "#0f172a", 512, 256); g.fillStyle = "#22c55e"; g.font = "700 24px monospace"; g.fillText("ALL SYSTEMS OK", 30, 44);
    for (let i = 0; i < 4; i++) { g.fillStyle = "#22c55e"; g.beginPath(); g.arc(44, 80 + i * 34, 8, 0, 7); g.fill(); g.fillStyle = "#334155"; g.fillRect(66, 74 + i * 34, 220, 12); g.fillStyle = "#38bdf8"; g.fillRect(66, 74 + i * 34, 90 + i * 35, 12); }
    g.strokeStyle = "#f59e0b"; g.lineWidth = 3; g.beginPath(); [[320, 200], [360, 160], [400, 180], [440, 120], [490, 140]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); },
};
BOARDS.agenda = (g) => { fill(g, "#fdfdfb", 512, 256); g.fillStyle = "#6d28d9"; g.font = "700 30px sans-serif"; g.fillText("AGENDA", 30, 46); g.strokeStyle = "#16a34a"; g.lineWidth = 4;
  [300, 250, 340, 200].forEach((w, i) => { const y = 78 + i * 42; g.beginPath(); g.moveTo(32, y + 12); g.lineTo(42, y + 22); g.lineTo(58, y); g.stroke(); g.fillStyle = "#cbd5e1"; g.fillRect(76, y + 6, w, 10); }); };
BOARDS.slides = (g) => { const gr = g.createLinearGradient(0, 0, 512, 288); gr.addColorStop(0, "#1e3a8a"); gr.addColorStop(1, "#7c3aed"); g.fillStyle = gr; g.fillRect(0, 0, 512, 288);
  g.fillStyle = "#fff"; g.font = "700 38px sans-serif"; g.fillText("Q4 Roadmap", 36, 70); g.fillStyle = "#ffffff80"; for (let i = 0; i < 3; i++) g.fillRect(36, 110 + i * 34, 200 - i * 30, 10);
  g.fillStyle = "#facc15"; g.beginPath(); g.moveTo(380, 190); g.arc(380, 190, 70, 0, 4.2); g.fill(); g.fillStyle = "#22d3ee"; g.beginPath(); g.moveTo(380, 190); g.arc(380, 190, 70, 4.2, 6.28); g.fill(); };
const boardTex = (id) => paint(512, 256, BOARDS[id]);

// ---- a small builder that adds meshes to a group at the room centre ----
function kit(def) {
  const g = new THREE.Group();
  g.position.set(def.cx, 0, def.cz);
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  const B = (w, h, d, m, x, y, z, rx, ry, rz) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz);
  const cyl = (rt, rb, h, m, x, y, z, rx, ry, rz) => add(new THREE.CylinderGeometry(rt, rb, h, 16), m, x, y, z, rx, ry, rz);
  const ball = (r, m, x, y, z) => add(new THREE.SphereGeometry(r, 16, 12), m, x, y, z);
  const flat = (w, h, m, x, y, z, rx = 0) => add(new THREE.PlaneGeometry(w, h), m, x, y, z, rx);
  const plant = (x, z, h = 0.7) => {
    cyl(0.22, 0.17, 0.35, mat(0xb9714a), x, 0.18, z);
    cyl(0.025, 0.025, h, mat(0x6b4a30), x, 0.35 + h / 2, z);
    for (const [dx, dy, r] of [[0, 0.1, 0.33], [0.18, -0.1, 0.26], [-0.18, -0.18, 0.24]]) add(new THREE.IcosahedronGeometry(r, 0), mat(0x3f9b5a), x + dx, 0.35 + h + dy, z);
  };
  const tv = (x, y, z, w) => { // wall TV showing a slide (16:9)
    B(w + 0.12, w * 0.5625 + 0.12, 0.08, mat(0x16181d), x, y, z);
    flat(w, w * 0.5625, new THREE.MeshBasicMaterial({ map: paint(512, 288, BOARDS.slides) }), x, y, z + 0.045);
  };
  const boardAt = (id, x, y, z, w = 2.6) => {
    B(w + 0.1, w / 2 + 0.1, 0.05, mat(0x23262d), x, y, z);
    flat(w, w / 2, new THREE.MeshBasicMaterial({ map: boardTex(id) }), x, y, z + 0.03);
  };
  return { g, w: def.w, add, B, cyl, ball, flat, plant, boardAt, tv };
}

// ---- props in the free band south of the desks (z local, 0 = room centre); each uses only low, open space ----
const wood = () => mat(0x9a7350), dark = () => mat(0x23262d), white = () => mat(0xf4f1ea), gold = () => mat(0xe2b93b, { metalness: 0.5, roughness: 0.4 });
const PROPS = {
  engineering: (k, z) => {
    const x0 = k.w / 2 - 1;
    for (let x = -x0; x <= x0; x += 0.5) k.B(0.3, 0.03, 0.08, glowMat(Math.abs(x) % 1 ? 0xf59e0b : 0x22c55e), x, 0.03, z + 0.4); // build pipeline strip
    for (const x of [-10.4, -9.3, -8.2]) { k.B(0.95, 1.3, 0.6, dark(), x, 0.65, z + 1.4); for (let j = 0; j < 4; j++) k.B(0.7, 0.04, 0.02, glowMat(j % 3 ? 0x22c55e : 0xf59e0b), x, 0.25 + j * 0.28, z + 1.71); } // server racks
    [[0x3b82f6, 7.4], [0xf26b1d, 8.6], [0x10b981, 9.8]].forEach(([c, x], i) => { const b = k.ball(0.55, mat(c), x, 0.3, z + 1.4 + (i % 2) * 0.4); b.scale.y = 0.55; }); // beanbags
  },
  specialists: (k, z) => {
    for (let x = -9; x <= 9; x += 3) { k.B(0.3, 0.45, 0.3, dark(), x, 0.22, z + 0.55); k.add(new THREE.IcosahedronGeometry(0.2, 0), glowMat(0xa78bfa), x, 0.65, z + 0.55); }
    k.B(3.2, 0.08, 0.9, white(), -8, 0.75, z + 1.6); for (const dx of [-1.4, 1.4]) k.B(0.07, 0.72, 0.8, dark(), -8 + dx, 0.37, z + 1.6);
    [0x22d3ee, 0xa78bfa, 0xf472b6, 0x4ade80].forEach((c, i) => k.cyl(0.08, 0.08, 0.25, mat(c, { transparent: true, opacity: 0.85 }), -9 + i * 0.7, 0.9, z + 1.6)); // lab beakers
  },
  marketing: (k, z) => {
    for (const [dx, dz, rz] of [[-0.2, 0, 0.18], [0.2, 0, -0.18], [0, -0.2, 0]]) k.B(0.04, 1.3, 0.04, dark(), -4 + dx, 0.65, z + 0.55 + dz, dz ? -0.18 : 0, 0, rz);
    k.B(0.45, 0.3, 0.28, dark(), -4, 1.4, z + 0.55); k.cyl(0.1, 0.1, 0.22, dark(), -4, 1.4, z + 0.75, Math.PI / 2);
    k.cyl(0.03, 0.03, 1.3, dark(), -2.6, 0.65, z + 0.55); k.add(new THREE.TorusGeometry(0.32, 0.035, 8, 28), glowMat(0xffffff), -2.6, 1.45, z + 0.55);
    k.B(2.6, 1.5, 0.05, mat(0xf26b1d), 2.8, 0.85, z + 0.5); k.B(0.9, 0.24, 0.06, glowMat(0xef4444), 2.8, 1.8, z + 0.5);
  },
  security: (k, z) => {
    for (const x of [-4.4, -3.3, -2.2]) { k.B(0.95, 1.8, 0.7, dark(), x, 0.9, z + 1.2); for (let j = 0; j < 6; j++) k.B(0.7, 0.04, 0.02, glowMat(j % 3 ? 0x22c55e : 0xef4444), x, 0.3 + j * 0.28, z + 1.56); }
    k.B(2.6, 0.06, 0.9, dark(), 3, 0.75, z + 1.2);
    for (const dx of [-0.9, 0.9]) k.B(0.06, 0.72, 0.8, dark(), 3 + dx, 0.37, z + 1.2);
    for (const dx of [-0.85, 0, 0.85]) { k.B(0.8, 0.5, 0.04, dark(), 3 + dx, 1.15, z + 1.0); k.flat(0.72, 0.42, new THREE.MeshBasicMaterial({ color: 0x16a34a }), 3 + dx, 1.15, z + 1.03); }
  },
  geo: (k, z) => {
    const earth = new THREE.MeshStandardMaterial({ map: boardTex("geo"), roughness: 0.7 });
    k.cyl(0.3, 0.3, 0.05, dark(), -3.5, 0.03, z + 1.4); k.cyl(0.05, 0.05, 1.1, dark(), -3.5, 0.55, z + 1.4);
    k.add(new THREE.SphereGeometry(0.85, 24, 18), earth, -3.5, 1.5, z + 1.4, 0, 0, 0.4);
    k.B(2.6, 0.1, 1.5, wood(), 2.5, 0.75, z + 1.4); for (const [dx, dz] of [[-1.1, -0.6], [1.1, -0.6], [-1.1, 0.6], [1.1, 0.6]]) k.B(0.07, 0.72, 0.07, dark(), 2.5 + dx, 0.36, z + 1.4 + dz);
    k.flat(2.5, 1.4, new THREE.MeshBasicMaterial({ map: boardTex("geo") }), 2.5, 0.806, z + 1.4, -Math.PI / 2);
    for (const [dx, dz] of [[-0.7, 0.2], [0.4, -0.3], [0.9, 0.3]]) k.ball(0.07, glowMat(0xef4444), 2.5 + dx, 0.88, z + 1.4 + dz);
  },
  design: (k, z) => {
    const pal = ["#f26b1d", "#3b82f6", "#ec4899", "#10b981", "#8b5cf6", "#facc15"];
    [-4.3, -2.7, -1.1].forEach((x, i) => {
      for (const dx of [-0.4, 0.4]) k.B(0.05, 1.5, 0.05, wood(), x + dx, 0.75, z + 1.2);
      k.B(0.95, 0.04, 0.2, wood(), x, 0.5, z + 1.3); k.B(0.9, 1.1, 0.04, white(), x, 1.1, z + 1.25);
      k.flat(0.8, 1.0, new THREE.MeshBasicMaterial({ map: paint(128, 160, (g) => { fill(g, "#faf7f2", 128, 160); g.fillStyle = pal[i]; g.beginPath(); g.arc(50, 60, 34, 0, 7); g.fill(); g.fillStyle = pal[i + 3]; g.fillRect(40, 90, 70, 50); }) }), x, 1.1, z + 1.275);
    });
    k.B(1.8, 0.06, 0.9, white(), 2.6, 0.7, z + 1.3); for (const dx of [-0.8, 0.8]) k.B(0.06, 0.68, 0.7, wood(), 2.6 + dx, 0.34, z + 1.3);
    pal.forEach((c, i) => k.cyl(0.07, 0.07, 0.1, mat(c), 2.0 + i * 0.25, 0.78, z + 1.3));
  },
  sales: (k, z) => {
    k.B(0.9, 0.9, 0.9, gold(), -3, 0.45, z + 1.3); k.B(0.9, 0.6, 0.9, mat(0xc0c0c8), -4, 0.3, z + 1.3); k.B(0.9, 0.4, 0.9, mat(0xb87333), -2, 0.2, z + 1.3);
    k.cyl(0.16, 0.07, 0.28, gold(), -3, 1.14, z + 1.3); k.cyl(0.05, 0.05, 0.12, gold(), -3, 0.96, z + 1.3);
    for (const dx of [-0.8, 0.8]) k.cyl(0.04, 0.04, 1.9, dark(), 3 + dx, 0.95, z + 1.3);
    k.B(1.7, 0.06, 0.06, dark(), 3, 1.85, z + 1.3); k.cyl(0.5, 0.5, 0.05, gold(), 3, 1.25, z + 1.3, Math.PI / 2);
    k.cyl(0.03, 0.03, 2, dark(), 5.1, 1, z + 1.3); k.B(0.7, 0.45, 0.03, mat(0xef4444), 5.45, 1.7, z + 1.3);
  },
  qa: (k, z) => {
    k.B(4.2, 0.08, 0.9, white(), -1.5, 0.75, z + 1.3); for (const dx of [-1.9, 1.9]) k.B(0.07, 0.72, 0.8, dark(), -1.5 + dx, 0.37, z + 1.3);
    for (let i = 0; i < 9; i++) { const x = -3.4 + i * 0.45; k.B(0.2, 0.36, 0.02, dark(), x, 0.97, z + 1.3); k.flat(0.17, 0.3, new THREE.MeshBasicMaterial({ color: i % 4 ? 0x22c55e : 0xef4444 }), x, 0.97, z + 1.315); }
    const bug = mat(0x3fae4e); k.ball(0.38, bug, 3.8, 0.55, z + 1.3); k.ball(0.2, bug, 3.8, 0.7, z + 1.62);
    for (const s of [-1, 1]) for (const dz of [-0.2, 0, 0.2]) k.cyl(0.02, 0.02, 0.5, dark(), 3.8 + s * 0.4, 0.3, z + 1.3 + dz, 0, 0, s * 1.0);
    for (const s of [-1, 1]) k.ball(0.05, white(), 3.8 + s * 0.08, 0.76, z + 1.8);
  },
  pm: (k, z) => {
    for (const dx of [-1.4, 1.4]) k.B(0.06, 1.6, 0.06, dark(), -2.5 + dx, 0.8, z + 1.3);
    k.B(3.0, 1.5, 0.04, white(), -2.5, 1.35, z + 1.27); k.flat(2.8, 1.4, new THREE.MeshBasicMaterial({ map: boardTex("pm") }), -2.5, 1.35, z + 1.3);
    k.cyl(0.65, 0.65, 0.06, wood(), 3.4, 1.0, z + 1.3); k.cyl(0.06, 0.06, 1.0, dark(), 3.4, 0.5, z + 1.3);
    STICKY.forEach((c, i) => k.B(0.14, 0.01, 0.14, mat(c), 3.1 + i * 0.15, 1.04, z + 1.3 + (i % 2) * 0.2, 0, i));
  },
  ops: (k, z) => {
    for (const x of [-4.5, -3.8, -3.1]) { k.B(0.6, 1.2, 0.6, mat(0x8a94a3), x, 0.6, z + 0.9); for (const y of [0.3, 0.65, 1.0]) k.B(0.5, 0.2, 0.02, mat(0x5b6573), x, y, z + 1.21); }
    k.B(0.45, 0.9, 0.45, white(), 3.8, 0.45, z + 0.9); k.cyl(0.17, 0.17, 0.45, mat(0x7dd3fc, { transparent: true, opacity: 0.8 }), 3.8, 1.12, z + 0.9);
    k.B(1.0, 0.5, 0.6, wood(), 1.2, 0.25, z + 0.9); k.B(0.7, 0.3, 0.45, dark(), 1.2, 0.65, z + 0.9);
  },
};

// meeting and break rooms: extras only, their furniture is built in office.js
const SHARED = {
  meeting: (k, def) => {
    const wz = -def.d / 2 + WALL_T;
    k.boardAt("agenda", -4, 1.4, wz + 0.04, 2.8);
    k.tv(4, 1.45, wz + 0.06, 2.9);
    k.B(2.6, 0.5, 0.45, wood(), 4, 0.25, wz + 0.3);
    k.plant(-5.2, 3.6, 0.9); k.plant(5.2, 3.6, 0.9); k.plant(-5.2, -4.9, 0.5);
  },
  break: (k, def) => {
    const wz = -def.d / 2 + WALL_T;
    k.B(0.8, 1.9, 1.0, mat(0xdc2626), -5.3, 0.95, -2.4); k.flat(0.9, 1.2, new THREE.MeshBasicMaterial({ color: 0xfde68a }), -4.89, 1.1, -2.4, 0).rotation.y = Math.PI / 2;
    k.boardAt("ops", 4, 1.65, wz + 0.04, 2.2);
    k.plant(5.2, -2.2, 1.0); k.plant(5.2, 3.6, 0.8); k.plant(-5.2, 3.6, 0.7);
  },
};

// add the themed decor for one room. def: {id, cx, cz, w, d, color}; count: agents in a department room
export function decorateRoom(world, def, count) {
  const k = kit(def), trim = mat(new THREE.Color(def.color).getHex());
  if (SHARED[def.id]) SHARED[def.id](k, def);
  else if (PROPS[def.id]) {
    const { lanes } = deskSeats(def, count);
    const south = lanes.at(-1) + 0.45 - def.cz; // local z where the free band south of the desks starts
    const wz = -def.d / 2 + WALL_T;
    for (const s of [-1, 1]) k.boardAt(def.id, s * boardDx(def), 1.35, wz + 0.04);
    for (const s of [-1, 1]) k.plant(s * (def.w / 2 - 0.75), wz + 0.5, 0.5);
    PROPS[def.id](k, south);
    k.B(def.w - WALL_T, 0.12, 0.06, trim, WALL_T / 2, 0.06, wz + 0.03); // coloured skirting
    k.B(0.06, 0.12, def.d - WALL_T, trim, -def.w / 2 + WALL_T + 0.03, 0.06, WALL_T / 2);
  }
  k.g.traverse((o) => {
    if (o.isMesh) { o.receiveShadow = true; o.castShadow = o.material.type === "MeshStandardMaterial"; }
  });
  world.add(k.g);
}
