// Phase 2: the building shell. Rooms from office.json, my office, camera with drag/zoom/room focus.
// Skipped on narrow screens (the room list is the fallback); no WebGL keeps the list too.
import * as THREE from "./vendor/three.module.min.js";
import { floorTexture, wallColor, decorateRoom } from "./rooms.js";
import { createCrowd } from "./crowd.js";
import { layoutRooms, sharedSpots, SPECIAL, TOTAL_W, TOTAL_D, CELL } from "./layout.js";

const WALL_H = 2.4, WALL_T = 0.25;
const ACCENT = 0xf26b1d;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (s) => document.querySelector(s);
const OVERVIEW_DIST = 118, MAX_DIST = 150, LIVE_EVERY_MS = 1000;

const rooms = new Map(); // id -> { cx, cz, w, d, floorMat, tag, color }
let data, crowd = null;
const BUBBLE_EVERY_MS = 3500, BUBBLE_LIFE_MS = 4000, BUBBLE_MAX = 3, BUBBLE_MAX_DIST = 40;

async function main() {
  try {
    const r = await fetch("office.json");
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch (err) {
    console.error("office.json load failed", err);
    $("#sub").textContent = "Couldn't load the office. Please refresh.";
    return;
  }
  $("#sub").textContent = `${data.agents.length} agents in ${data.rooms.length} departments.`;
  buildList();
  // start the 3D view once the window is wide enough, including when it is resized/rotated wider later
  const wide = matchMedia("(min-width: 701px)");
  let started = false;
  const tryStart = () => {
    if (started || !wide.matches) return;
    started = true;
    try { start(); } catch (err) { console.warn("WebGL unavailable, keeping the list", err); }
  };
  wide.addEventListener("change", tryStart);
  tryStart();
}

function buildList() {
  const box = $("#rooms");
  const add = (id, label, color, n) => {
    const b = document.createElement("button");
    const sw = document.createElement("span"); sw.className = "sw"; sw.style.background = color;
    const t = document.createElement("span"); t.textContent = label;
    b.append(sw, t);
    if (n != null) { const c = document.createElement("span"); c.className = "n"; c.textContent = n; b.append(c); }
    b.onclick = () => {
      if (rooms.has(id)) return focusRoom(id);
      if (data.rooms.some((r) => r.id === id)) showResults(data.agents.filter((a) => a.room === id), label); // list-only mode (phones)
    };
    box.append(b);
    return b;
  };
  const btns = {};
  for (const [id, s] of Object.entries(SPECIAL)) btns[id] = add(id, s.label, s.color, null);
  data.rooms.forEach((r) => (btns[r.id] = add(r.id, r.label, r.color, r.count)));
  buildList.btns = btns;
}

// ---- agent list, search and card ----
function showResults(list, title) {
  const box = $("#results");
  const back = document.createElement("button");
  back.className = "back"; back.textContent = "← Departments";
  back.onclick = showRooms;
  const head = document.createElement("div");
  head.className = "rh"; head.textContent = `${title} · ${list.length}${list.length > 60 ? " (showing 60)" : ""}`;
  box.replaceChildren(back, head, ...list.slice(0, 60).map((a) => {
    const b = document.createElement("button");
    b.textContent = `${a.emoji} ${a.name}`.trim();
    b.onclick = () => selectAgent(a);
    return b;
  }));
  $("#rooms").hidden = true;
  box.hidden = false;
}
function showRooms() { $("#results").hidden = true; $("#rooms").hidden = false; $("#q").value = ""; }
function onSearch(e) {
  const q = e.target.value.trim().toLowerCase();
  if (!q) return showRooms();
  const label = Object.fromEntries(data.rooms.map((r) => [r.id, r.label.toLowerCase()]));
  showResults(data.agents.filter((a) => `${a.name} ${a.role} ${a.desc} ${label[a.room]}`.toLowerCase().includes(q)), "Results");
}
function selectAgent(a) {
  const idx = data.agents.indexOf(a);
  if (rooms.has(a.room)) {
    if (focused !== a.room) focusRoom(a.room);
    const p = crowd?.pos(idx);
    if (p) Object.assign(goal, { tx: p.x, tz: p.z, dist: 12 }); // fly in on the agent
  }
  crowd?.setTalk(idx);
  openCard(a);
}
const card = $("#card");
card.addEventListener("close", () => { crowd?.setTalk(null); if (focused) focusRoom(focused); });
function openCard(a) {
  const room = data.rooms.find((r) => r.id === a.room);
  $("#cName").textContent = `${a.emoji} ${a.name}`.trim();
  $("#cMeta").textContent = room ? room.label : "";
  $("#cRole").textContent = a.role;
  $("#cDesc").textContent = a.desc;
  $("#cSetup").textContent = a.setup;
  const src = $("#cSrc");
  const ok = a.source.startsWith("https://github.com/");
  src.hidden = !ok;
  if (ok) src.href = a.source;
  card.showModal();
}
$("#cClose").onclick = () => card.close();
$("#cCopy").onclick = async (e) => {
  try { await navigator.clipboard.writeText($("#cSetup").textContent); e.target.textContent = "Copied ✓"; }
  catch (err) { console.warn("clipboard blocked", err); e.target.textContent = "Select and copy manually"; }
  setTimeout(() => (e.target.textContent = "Copy setup"), 1500);
};
$("#q").addEventListener("input", onSearch);

const view = { yaw: 0.785, pitch: 0.85, dist: OVERVIEW_DIST, tx: 0, tz: 0 };
const goal = { ...view };
let focused = null;
const OVERVIEW = { ...view };

function focusRoom(id) {
  const room = rooms.get(id);
  if (!room) return; // list-only mode has no 3D rooms to focus
  focused = id;
  Object.assign(goal, { tx: room.cx, tz: room.cz, dist: room.w > CELL * 1.5 ? 30 : 24 }); // double-width rooms need a bit more distance
  $("#back").classList.add("show");
  for (const [k, b] of Object.entries(buildList.btns)) b.classList.toggle("on", k === id);
  for (const [k, r] of rooms) r.tag.classList.toggle("on", k === id);
}
function overview() {
  focused = null;
  Object.assign(goal, OVERVIEW);
  $("#back").classList.remove("show");
  for (const b of Object.values(buildList.btns)) b.classList.remove("on");
  for (const r of rooms.values()) r.tag.classList.remove("on");
}

const mat = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0, ...extra });
const box = (w, h, d, material, x, y, z) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
};
const tint = (hex, amount) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), amount);

// subtle checker so floors read as tiles; 1-unit squares
function checker(w, d) {
  const c = document.createElement("canvas");
  c.width = c.height = 2;
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, 2, 2);
  g.fillStyle = "#ebebeb"; g.fillRect(0, 0, 1, 1); g.fillRect(1, 1, 1, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 2, d / 2);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// department name plate on the back wall
function signMesh(label, color) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 96;
  const g = c.getContext("2d");
  g.fillStyle = color; g.fillRect(0, 0, 512, 96);
  g.fillStyle = "#fff"; g.font = "700 44px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(label, 256, 50, 480);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.85), new THREE.MeshBasicMaterial({ map: t }));
}

function start() {
  const stage = $("#stage");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // throws without WebGL
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.append(renderer.domElement);

  const world = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 300);
  world.add(new THREE.HemisphereLight(0xffffff, 0xcfc8bd, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(20, 40, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 42, bottom: -42, near: 5, far: 140 });
  sun.shadow.bias = -0.0005;
  world.add(sun);

  world.add(box(TOTAL_W + 3, 0.8, TOTAL_D + 3, mat(0xd9d4cc), 0, -0.7, 0));

  const pickables = [];
  const layout = layoutRooms(data.rooms); // id -> { cx, cz, w, d, label, color, count? }, incl. my office, meeting and break rooms
  for (const def of layout.values()) {
    const { w, d, cx, cz } = def;
    const themed = floorTexture(def.id, def.color, w, d);
    const floorMat = themed ? mat(0xffffff, { map: themed }) : mat(def.id === "me" ? 0xe9d3b4 : tint(def.color, 0.55), { map: checker(w, d) });
    const wallMat = mat(def.id === "me" ? 0xf5ead8 : wallColor(def.id) ?? tint(def.color, 0.8));
    const capMat = mat(def.color);
    const floor = box(w, 0.3, d, floorMat, cx, -0.15, cz);
    floor.userData.room = def.id;
    floor.receiveShadow = true;
    pickables.push(floor);
    const sign = signMesh(def.label, def.color);
    sign.position.set(cx, 1.55, cz - d / 2 + WALL_T + 0.02);
    world.add(floor, sign,
      box(w, WALL_H, WALL_T, wallMat, cx, WALL_H / 2, cz - d / 2 + WALL_T / 2),
      box(WALL_T, WALL_H, d, wallMat, cx - w / 2 + WALL_T / 2, WALL_H / 2, cz),
      box(w, 0.08, WALL_T + 0.04, capMat, cx, WALL_H + 0.04, cz - d / 2 + WALL_T / 2),
      box(WALL_T + 0.04, 0.08, d, capMat, cx - w / 2 + WALL_T / 2, WALL_H + 0.04, cz));
    const tag = document.createElement("button");
    tag.className = "tag" + (def.id === "me" ? " me" : "");
    tag.textContent = def.label;
    if (def.count) { const s = document.createElement("small"); s.textContent = ` · ${def.count}`; tag.append(s); }
    tag.onclick = () => focusRoom(def.id);
    $("#tags").append(tag);
    rooms.set(def.id, { cx, cz, w, d, floorMat, tag, color: def.color });
  }
  for (const def of layout.values()) decorateRoom(world, def, def.count);
  addMyOffice(world, rooms.get("me"));
  const spots = sharedSpots(layout);
  addMeetingRoom(world, layout.get("meeting"), spots);
  addBreakRoom(world, layout.get("break"));
  crowd = createCrowd(world, data.agents, layout);
  const resize = () => {
    const { clientWidth: w, clientHeight: h } = stage;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  // drag to turn, wheel to zoom, click (not drag) to pick a room
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pick = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(pickables, false)[0]?.object.userData.room ?? null;
  };
  const pickAgent = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(crowd.pickMeshes, false)[0]?.instanceId ?? null; // agent index or null
  };
  const tip = $("#tip"), officeBox = $(".office");
  let down = null, hover = null;
  const canvas = renderer.domElement;
  canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; });
  canvas.addEventListener("pointermove", (e) => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 5) down.moved = true;
      if (down.moved) {
        goal.yaw = Math.min(1.37, Math.max(0.2, goal.yaw - dx * 0.005));
        goal.pitch = Math.min(1.2, Math.max(0.5, goal.pitch + dy * 0.004));
        down.x = e.clientX; down.y = e.clientY;
      }
    } else {
      const ai = pickAgent(e);
      const a = ai == null ? null : data.agents[ai];
      crowd.setHot(ai);
      hover = a ? null : pick(e);
      canvas.style.cursor = a || hover ? "pointer" : "grab";
      tip.style.display = a ? "block" : "none";
      if (a) {
        const b = officeBox.getBoundingClientRect();
        tip.textContent = a.name;
        tip.style.left = `${e.clientX - b.left}px`;
        tip.style.top = `${e.clientY - b.top}px`;
      }
    }
  });
  canvas.addEventListener("pointerleave", () => { tip.style.display = "none"; crowd.setHot(null); });
  canvas.addEventListener("pointerup", (e) => {
    const wasClick = down && !down.moved;
    down = null; canvas.style.cursor = "grab";
    if (!wasClick) return;
    const ai = pickAgent(e);
    if (ai != null) return selectAgent(data.agents[ai]);
    const id = pick(e);
    id ? focusRoom(id) : focused && overview();
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    goal.dist = Math.min(MAX_DIST, Math.max(12, goal.dist * (1 + Math.sign(e.deltaY) * 0.08)));
  }, { passive: false });
  $("#back").onclick = overview;
  addEventListener("keydown", (e) => { if (e.key === "Escape" && focused && !card.open) overview(); });

  const v = new THREE.Vector3();
  let raf = 0;
  // speech bubbles: now and then an agent in the focused room says their one-liner
  const bubbles = [];
  let nextBubble = 0;
  const updateBubbles = (now) => {
    if (!REDUCED && focused && focused !== "me" && view.dist < BUBBLE_MAX_DIST && !card.open && now > nextBubble && bubbles.length < BUBBLE_MAX) {
      nextBubble = now + BUBBLE_EVERY_MS;
      const mine = data.agents.map((a, i) => [a, i]).filter(([a]) => a.room === focused && a.role);
      const [a, i] = mine[Math.floor(Math.random() * mine.length)] ?? [];
      if (a && !bubbles.some((b) => b.i === i)) {
        const el = document.createElement("div");
        el.className = "bubble";
        el.textContent = a.role.length > 80 ? `${a.role.slice(0, 77)}…` : a.role;
        $("#tags").append(el);
        bubbles.push({ el, i, until: now + BUBBLE_LIFE_MS });
      }
    }
    for (let k = bubbles.length - 1; k >= 0; k--) {
      const b = bubbles[k], p = crowd.pos(b.i);
      if (!p || now > b.until || !focused || card.open) { b.el.remove(); bubbles.splice(k, 1); continue; }
      v.set(p.x, 1.35, p.z).project(camera);
      b.el.style.left = `${((v.x + 1) / 2) * stage.clientWidth}px`;
      b.el.style.top = `${((1 - v.y) / 2) * stage.clientHeight}px`;
    }
  };

  // one-line live status: who is where right now
  let nextLive = 0;
  const showLive = () => {
    const s = crowd.stats();
    const parts = [[s.working, "at the boards"], [s.meeting, "in the meeting"], [s.break, "on a break"], [s.visiting, "visiting"], [s.office, "with Ervenderr"], [s.walking, "walking"]]
      .filter(([n]) => n).map(([n, t]) => `${n} ${t}`);
    $("#live").textContent = parts.join(" · ");
  };

  const tick = (now) => {
    crowd.animate(REDUCED ? 0 : now / 1000, camera);
    for (const k of Object.keys(view)) view[k] += REDUCED ? goal[k] - view[k] : (goal[k] - view[k]) * 0.12;
    const cp = Math.cos(view.pitch);
    camera.position.set(view.tx + view.dist * Math.sin(view.yaw) * cp, view.dist * Math.sin(view.pitch), view.tz + view.dist * Math.cos(view.yaw) * cp);
    camera.lookAt(view.tx, 0, view.tz);
    camera.updateMatrixWorld();

    for (const [id, r] of rooms) {
      r.floorMat.emissive.set(r.color);
      r.floorMat.emissiveIntensity = id === hover || id === focused ? 0.18 : 0;
      v.set(r.cx, WALL_H + 0.2, r.cz - r.d / 2).project(camera);
      const hidden = v.z > 1;
      r.tag.style.display = hidden ? "none" : "";
      r.tag.style.left = `${((v.x + 1) / 2) * stage.clientWidth}px`;
      r.tag.style.top = `${((1 - v.y) / 2) * stage.clientHeight}px`;
    }
    updateBubbles(now);
    if (now > nextLive) { nextLive = now + LIVE_EVERY_MS; showLive(); }
    renderer.render(world, camera);
    raf = document.hidden ? 0 : requestAnimationFrame(tick);
  };
  document.addEventListener("visibilitychange", () => { if (!raf && !document.hidden) raf = requestAnimationFrame(tick); });
  raf = requestAnimationFrame(tick);
}

// light-wood table and chairs (exactly where the crowd sits); the wall whiteboard and TV come from rooms.js
function addMeetingRoom(world, r, spots) {
  const wood = mat(0xd9c3a3), leg = mat(0xf4f4f4), seat = mat(0xb9a7f0), post = mat(0xdedede);
  world.add(
    box(7.6, 0.12, 1.5, wood, r.cx, 0.72, spots.tableZ),
    box(0.25, 0.7, 1.0, leg, r.cx - 3, 0.35, spots.tableZ), box(0.25, 0.7, 1.0, leg, r.cx + 3, 0.35, spots.tableZ));
  for (const s of spots.meeting) {
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.yaw;
    g.add(box(0.5, 0.06, 0.5, seat, 0, 0.3, 0), box(0.5, 0.45, 0.06, seat, 0, 0.56, 0.25), box(0.06, 0.28, 0.06, post, 0, 0.15, 0));
    g.traverse((m) => { m.castShadow = true; });
    world.add(g);
  }
}

// coffee counter, fridge and two small tables (the crowd stands at the counter and around the tables)
function addBreakRoom(world, r) {
  const counter = mat(0xd8d0c4), dark = mat(0x2d3340), white = mat(0xf4f4f4), wood = mat(0x8a6a4a);
  const z0 = r.cz - r.d / 2 + 0.7;
  world.add(box(8, 1.0, 0.8, counter, r.cx + 1, 0.5, z0), box(0.7, 0.8, 0.5, dark, r.cx + 0.5, 1.4, z0), box(0.9, 1.9, 0.8, white, r.cx - 4.8, 0.95, z0));
  for (const dx of [-2.7, 2.7]) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 20), wood);
    top.position.set(r.cx + dx, 0.85, r.cz + 2.1);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.85, 8), dark);
    leg.position.set(r.cx + dx, 0.42, r.cz + 2.1);
    world.add(top, leg);
  }
}

// warm plank floor; one 4-unit tile (2-unit planks, staggered rows) repeats across the room
function woodFloor(w, d) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const tones = ["#c8a37a", "#bf9a70", "#d1ad84", "#b98f66"];
  g.strokeStyle = "#8d6a47"; g.lineWidth = 2;
  for (let row = 0; row < 8; row++) {
    const off = (row % 2) * 64;
    for (let x = -off; x < 256; x += 128) {
      g.fillStyle = tones[(row + (((x + off) / 128) % 2) * 2) % 4];
      g.fillRect(x, row * 32, 128, 32);
      g.strokeRect(x, row * 32, 128, 32);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 4, d / 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// small abstract wall art
function artMesh(w, h, colors) {
  const c = document.createElement("canvas");
  c.width = 320; c.height = Math.round(320 * h / w);
  const g = c.getContext("2d");
  g.fillStyle = "#f3ead8"; g.fillRect(0, 0, c.width, c.height);
  colors.forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath(); g.arc(70 + i * 90, c.height * (i % 2 ? 0.62 : 0.4), 38 + i * 6, 0, Math.PI * 2); g.fill();
  });
  g.fillStyle = colors[0]; g.fillRect(24, c.height - 30, c.width - 48, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

// Ervenderr's office: wood floor, walnut desk with me behind it facing the visitors, windows, bookshelf,
// sofa corner and plants. Same scale as the crowd (desk top 0.74, seat 0.34). Local coords: origin = room
// centre, -z = north wall. Visitors stand south of the desk (see sharedSpots), so keep that area open.
function addMyOffice(world, r) {
  r.floorMat.map = woodFloor(r.w, r.d);
  r.floorMat.color.set(0xffffff);
  r.floorMat.needsUpdate = true;

  const walnut = mat(0x6b4a30), oak = mat(0x9a7350), dark = mat(0x23262d), white = mat(0xf4f1ea);
  const teal = mat(0x2f4858), sofa = mat(0x3f6f73), orange = mat(ACCENT), leaf = mat(0x3f9b5a), pot = mat(0xb9714a);
  const warm = () => mat(0xffd9a0, { emissive: 0xffb347, emissiveIntensity: 0.9 });
  const g = new THREE.Group();
  g.position.set(r.cx, 0, r.cz);
  const B = (w, h, d, m, x, y, z) => { const b = box(w, h, d, m, x, y, z); g.add(b); return b; };
  const add = (geo, m, x, y, z, rx = 0, ry = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, 0);
    g.add(o);
    return o;
  };
  const cyl = (rt, rb, h, m, x, y, z) => add(new THREE.CylinderGeometry(rt, rb, h, 16), m, x, y, z);
  const glow = (w, h, color, x, y, z, ry = 0) => add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color }), x, y, z, 0, ry);

  // rug: navy with an orange ring
  for (const [rad, hex, y] of [[3.9, 0x23324a, 0.02], [3.4, ACCENT, 0.03], [3.15, 0x23324a, 0.04]]) {
    add(new THREE.CylinderGeometry(rad, rad, 0.03, 48), mat(hex, { roughness: 1 }), 0, y, 1.4).name = "flat";
  }

  // desk
  B(3.8, 0.08, 1.1, walnut, 0, 0.74, -0.45);
  B(0.08, 0.7, 1.0, walnut, -1.8, 0.35, -0.45);
  B(0.9, 0.7, 0.95, walnut, 1.3, 0.35, -0.45);
  B(3.5, 0.45, 0.04, walnut, 0, 0.5, 0);
  B(0.7, 0.12, 0.04, dark, 0, 0.8, -0.02);
  const plate = signMesh("Ervenderr", "#23262d");
  plate.scale.setScalar(0.14);
  plate.position.set(0, 0.8, 0.004);
  g.add(plate);
  // wide monitor: screen faces me (north), glowing logo on the back faces the room
  B(1.5, 0.45, 0.04, dark, 0, 1.05, -0.55);
  glow(1.4, 0.37, 0x3b82f6, 0, 1.05, -0.575, Math.PI);
  add(new THREE.CircleGeometry(0.06, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 1.05, -0.528);
  B(0.1, 0.25, 0.08, dark, 0, 0.9, -0.55);
  B(0.5, 0.02, 0.25, dark, 0, 0.79, -0.55);
  B(0.7, 0.025, 0.22, white, 0, 0.7925, -0.85);
  B(0.08, 0.03, 0.12, white, 0.55, 0.795, -0.85);
  cyl(0.06, 0.05, 0.12, orange, -1.3, 0.84, -0.4);
  B(0.5, 0.01, 0.35, white, -1.0, 0.785, -0.2).rotation.y = 0.3;
  cyl(0.08, 0.06, 0.12, pot, -1.6, 0.84, -0.8);
  add(new THREE.IcosahedronGeometry(0.13, 0), leaf, -1.6, 1.0, -0.8);
  // desk lamp
  cyl(0.12, 0.14, 0.03, dark, 1.6, 0.8, -0.8);
  cyl(0.015, 0.015, 0.5, dark, 1.6, 1.05, -0.8);
  cyl(0.05, 0.16, 0.16, warm(), 1.6, 1.34, -0.8);
  const lamp = new THREE.PointLight(0xffc27a, 3, 7, 2);
  lamp.position.set(1.6, 1.3, -0.8);
  g.add(lamp);

  // chair and me (orange hoodie), facing south toward the visitors
  cyl(0.28, 0.28, 0.04, dark, 0, 0.06, -1.55);
  cyl(0.04, 0.04, 0.25, dark, 0, 0.2, -1.55);
  B(0.56, 0.08, 0.56, teal, 0, 0.34, -1.55);
  B(0.56, 0.7, 0.08, teal, 0, 0.75, -1.85);
  B(0.06, 0.06, 0.4, dark, -0.3, 0.52, -1.55); B(0.06, 0.06, 0.4, dark, 0.3, 0.52, -1.55);
  const me = new THREE.Group(), skin = mat(0xf1c7a0), pants = mat(0x2f3b52), hair = mat(0x2b2118), eye = mat(0x1a1a1a);
  const part = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; me.add(o); };
  part(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10), orange, 0, 0.32, 0);
  part(new THREE.SphereGeometry(0.2, 16, 12), skin, 0, 0.84, 0);
  part(new THREE.SphereGeometry(0.215, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, 0, 0.85, 0.015);
  for (const sx of [-1, 1]) {
    part(new THREE.SphereGeometry(0.03, 8, 6), eye, sx * 0.07, 0.86, -0.185);
    part(new THREE.CapsuleGeometry(0.05, 0.36, 4, 8), orange, sx * 0.22, 0.4, -0.3, Math.PI / 2);
    part(new THREE.BoxGeometry(0.13, 0.13, 0.42), pants, sx * 0.09, 0, -0.2);
    part(new THREE.BoxGeometry(0.13, 0.4, 0.13), pants, sx * 0.09, -0.22, -0.4);
  }
  me.position.set(0, 0.38, -1.5);
  me.scale.setScalar(0.85);
  me.rotation.y = Math.PI;
  g.add(me);

  // north wall: windows, clock, bookshelf, sofa corner with art
  for (const x of [-5.2, 5.2]) {
    B(2.7, 1.4, 0.06, white, x, 1.4, -5.72);
    glow(2.5, 1.2, 0xcfe9ff, x, 1.4, -5.685);
    B(0.05, 1.2, 0.02, white, x, 1.4, -5.675); B(2.5, 0.05, 0.02, white, x, 1.4, -5.675);
    B(2.9, 0.06, 0.2, white, x, 0.73, -5.62);
  }
  add(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 24), white, 3.05, 1.9, -5.73, Math.PI / 2);
  B(0.02, 0.15, 0.01, dark, 3.05, 1.94, -5.705); B(0.1, 0.02, 0.01, dark, 3.09, 1.9, -5.705);

  const sx0 = -9.5;
  B(3.2, 2.0, 0.04, oak, sx0, 1.0, -5.72);
  for (const dx of [-1.575, 1.575]) B(0.05, 2.0, 0.4, oak, sx0 + dx, 1.0, -5.55);
  const levels = [0.025, 0.55, 1.05, 1.55];
  for (const y of [...levels, 1.975]) B(3.2, 0.05, 0.4, oak, sx0, y, -5.55);
  const palette = [0xe85d3a, 0x3b6ea5, 0xf2b93b, 0x4a9d6b, 0x7a4fb0, 0xd8d0c4, 0x23324a, 0xc2477a];
  const books = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(0xffffff), 120);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  let seed = 7, n = 0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  levels.forEach((y, li) => {
    for (let x = sx0 - 1.5; x < sx0 + 1.45 && n < 120;) {
      const bw = 0.05 + rnd() * 0.08, bh = 0.28 + rnd() * (li === 3 ? 0.08 : 0.17);
      if (rnd() > 0.12) {
        dummy.position.set(x + bw / 2, y + 0.025 + bh / 2, -5.55);
        dummy.scale.set(bw, bh, 0.26);
        dummy.updateMatrix();
        books.setMatrixAt(n, dummy.matrix);
        books.setColorAt(n++, col.setHex(palette[Math.floor(rnd() * palette.length)]));
      }
      x += bw + 0.01;
    }
  });
  books.count = n;
  books.castShadow = true;
  g.add(books);

  const sx = 9;
  B(3.2, 0.6, 0.25, sofa, sx, 0.6, -5.5);
  B(3.2, 0.28, 0.9, sofa, sx, 0.24, -5.1);
  for (const dx of [-1.6, 1.6]) B(0.25, 0.5, 1.0, sofa, sx + dx, 0.35, -5.1);
  B(0.4, 0.4, 0.12, orange, sx - 0.8, 0.6, -5.2).rotation.z = 0.2;
  B(0.4, 0.4, 0.12, white, sx + 0.8, 0.6, -5.2).rotation.z = -0.2;
  B(1.6, 0.05, 0.8, oak, sx, 0.34, -3.7);
  for (const [dx, dz] of [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]]) B(0.05, 0.32, 0.05, dark, sx + dx, 0.16, -3.7 + dz);
  B(0.4, 0.06, 0.3, white, sx - 0.3, 0.39, -3.7); cyl(0.06, 0.05, 0.1, orange, sx + 0.4, 0.42, -3.7);
  B(1.7, 1.1, 0.03, dark, sx, 1.45, -5.735);
  const art = artMesh(1.6, 1.0, ["#f26b1d", "#8b5cf6", "#23324a"]);
  art.position.set(sx, 1.45, -5.71);
  g.add(art);
  // floor lamp
  cyl(0.2, 0.2, 0.03, dark, 11.6, 0.02, -4.9);
  cyl(0.02, 0.02, 1.6, dark, 11.6, 0.8, -4.9);
  cyl(0.2, 0.3, 0.35, warm(), 11.6, 1.7, -4.9);
  const floorLamp = new THREE.PointLight(0xffc27a, 3, 8, 2);
  floorLamp.position.set(11.6, 1.6, -4.5);
  g.add(floorLamp);

  // west wall art and plants
  const art2 = artMesh(1.2, 0.8, ["#3b6ea5", "#f2b93b"]);
  art2.position.set(-r.w / 2 + WALL_T + 0.04, 1.4, 1.5);
  art2.rotation.y = Math.PI / 2;
  g.add(art2);
  for (const [x, z, h] of [[-11.8, -3.4, 0.9], [11.7, 0.5, 0.8], [6.6, -5.1, 0.5]]) {
    cyl(0.25, 0.18, 0.4, pot, x, 0.2, z);
    cyl(0.03, 0.03, h, mat(0x6b4a30), x, 0.4 + h / 2, z);
    for (const [dx, dy, rad] of [[0, 0.1, 0.38], [0.2, -0.1, 0.3], [-0.2, -0.2, 0.28]]) add(new THREE.IcosahedronGeometry(rad, 0), leaf, x + dx, 0.4 + h + dy, z);
  }

  g.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true;
    if (o.isMesh && o.material.type === "MeshStandardMaterial" && o.name !== "flat") o.castShadow = true;
  });
  world.add(g);
}

main();
