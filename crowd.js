// The people: a desk, chair, monitor and a little character per agent, drawn as instanced meshes.
// Agents type at their desks, and now and then stand up and walk (lanes -> hallways -> room) to visit another
// department, report to my office, grab a coffee, or join a meeting. Hovered/selected agents stop and wave.
import * as THREE from "./vendor/three.module.min.js";
import { deskSeats, stationSpots, visitSpot, sharedSpots, pathBetween } from "./layout.js";

const AGENT_COLORS = { amber: "#f59e0b", "metallic-blue": "#3b6ea5", "neon-cyan": "#22d3ee", "neon-green": "#4ade80" };
const SKINS = [0xf1c7a0, 0xd9a77c, 0xb67f55, 0x8a5a3c, 0xe8b894];
const HAIRS = [0x2b2118, 0x4a3322, 0x1c1c1c, 0x8a5a2b, 0xb8860b, 0x6b6b6b];
const PANTS = [0x2f3b52, 0x3a3a3a, 0x4b4033, 0x27384a];
const S = 0.7;                 // character scale
const HIP = 0.42, SEAT_Y = 0.33 - HIP * S; // base height that puts a seated hip on a chair
const HOT_TINT = 0.45;
const UP = new THREE.Vector3(0, 1, 0);

// movement and scheduling (seconds, world units)
const SPEED = 1.6, SIDE = 0.45;       // SIDE: stand up beside the chair, not through it
const MAX_AWAY = 16, TRIP_EVERY = 1.2; // MAX_AWAY: people on long trips; board work in their own room is not capped
const STAY = { work: [9, 15], visit: [6, 10], break: [7, 11], me: [5, 8] };
const WEIGHTS = [["work", 0.5], ["visit", 0.2], ["break", 0.18], ["me", 0.12]];
// what each department does while still at its desk (the rest of the time, and everyone else, just types)
const DESK_POSE = { sales: "phone", ops: "phone", design: "sketch", marketing: "sketch", security: "think", pm: "think", specialists: "think" };

// arm angles [left x, left z, right x, right z] for a pose at animation time c (rx: + swings the arm forward and up)
function armPose(pose, c) {
  switch (pose) {
    case "type": return [1.2 + Math.sin(c * 9) * 0.12, 0, 1.2 + Math.sin(c * 9 + 1.5) * 0.12, 0];
    case "phone": return [1.0, 0, 2.4 + Math.sin(c * 1.5) * 0.05, -0.35];
    case "sketch": return [1.0, 0, 1.15 + Math.sin(c * 2.2) * 0.35, Math.sin(c * 1.7) * 0.2];
    case "think": return [1.0, 0, 2.3, -0.4];
    case "write": return [0.1, 0, 2.5 + Math.sin(c * 3.2) * 0.22, -0.1];
    case "point": return [0.05, 0, 2.0 + Math.sin(c * 1.2) * 0.12, 0];
    case "watch": return [1.0, 0.25, 1.0, -0.3];
    case "cheer": return [2.8 + Math.sin(c * 6) * 0.3, 0.2, 2.8 + Math.sin(c * 6 + 1) * 0.3, -0.2];
    case "seated": return [0.9, 0, 0.9, 0];
    default: return [0, 0, 0.7 + Math.sin(c * 4) * 0.35, 0]; // talk
  }
}
const MEETING_FIRST = 5, MEETING_GAP = 15, MEETING_SIZE = 6, MEETING_LENGTH = 22;

function agentColor(a, fallback) {
  const v = AGENT_COLORS[a.color] || a.color;
  return v && CSS.supports("color", v) ? new THREE.Color(v) : new THREE.Color(fallback);
}

// merge [geometry, hex] pairs into one geometry with vertex colours (one draw call, several colours)
function merge(parts) {
  const P = [], N = [], C = [];
  for (const [g, hex] of parts) {
    const n = g.toNonIndexed();
    const c = new THREE.Color(hex);
    for (let i = 0; i < n.attributes.position.count; i++) C.push(c.r, c.g, c.b);
    P.push(...n.attributes.position.array);
    N.push(...n.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  out.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
  out.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
  return out;
}
const B = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const Cyl = (r, h, x, y, z, seg = 10) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z);
const std = (extra = {}) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...extra });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const between = ([a, b]) => a + Math.random() * (b - a);

// out of the desk: step beside the chair, then into the lane, then on
function routeOut(seat, to) {
  const p = pathBetween(seat, to);
  return [{ x: seat.x + SIDE, z: seat.z }, { x: seat.x + SIDE, z: p[0].z }, ...p.slice(1)];
}
// back to the desk: arrive beside the chair, then step in
function routeHome(from, seat) {
  const p = pathBetween(from, seat);
  return [...p.slice(0, -2), { x: seat.x + SIDE, z: seat.laneZ }, { x: seat.x + SIDE, z: seat.z }, { x: seat.x, z: seat.z }];
}

export function createCrowd(world, agents, rooms) {
  const n = agents.length;
  const inst = (geo, material, { cast = true, colors = false } = {}) => {
    const m = new THREE.InstancedMesh(geo, material, n);
    m.frustumCulled = false; // instances span the whole building
    m.castShadow = cast;
    if (colors) m.setColorAt(0, new THREE.Color(1, 1, 1)); // allocate instanceColor
    world.add(m);
    return m;
  };

  const desk = inst(merge([
    [B(0.95, 0.05, 0.5, 0, 0.55, 0), 0xb08a5c], [B(0.04, 0.52, 0.46, -0.43, 0.26, 0), 0x8d6b44], [B(0.04, 0.52, 0.46, 0.43, 0.26, 0), 0x8d6b44],
    [B(0.36, 0.02, 0.12, 0, 0.585, 0.1), 0x2a2a2a], [B(0.06, 0.14, 0.05, 0, 0.64, -0.13), 0x3a3a3a], [Cyl(0.035, 0.07, 0.35, 0.61, 0.02), 0xf4f4f4],
  ]), std({ vertexColors: true }));
  const chair = inst(merge([
    [B(0.5, 0.06, 0.5, 0, 0.3, 0), 0x2d3340], [B(0.5, 0.45, 0.06, 0, 0.56, 0.25), 0x2d3340], [Cyl(0.04, 0.28, 0, 0.15, 0), 0x1d2129], [Cyl(0.22, 0.03, 0, 0.02, 0), 0x1d2129],
  ]), std({ vertexColors: true }));
  const screen = inst(new THREE.BoxGeometry(0.44, 0.28, 0.03).translate(0, 0.82, -0.14), new THREE.MeshBasicMaterial({ color: 0xffffff }), { colors: true, cast: false });

  const armG = new THREE.CapsuleGeometry(0.05, 0.26, 4, 8).translate(0, -0.18, 0);
  const legG = new THREE.BoxGeometry(0.13, 0.42, 0.13).translate(0, -0.21, 0);
  const torso = inst(new THREE.CapsuleGeometry(0.17, 0.3, 4, 10), std(), { colors: true });
  const head = inst(new THREE.SphereGeometry(0.2, 16, 12), std(), { colors: true });
  const hair = inst(new THREE.SphereGeometry(0.215, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52).translate(0, 0.01, 0.015), std(), { colors: true });
  const face = inst(merge([
    [new THREE.SphereGeometry(0.03, 8, 6).translate(-0.07, 0.01, -0.185), 0x1a1a1a],
    [new THREE.SphereGeometry(0.03, 8, 6).translate(0.07, 0.01, -0.185), 0x1a1a1a],
  ]), std({ vertexColors: true }), { cast: false });
  const armL = inst(armG, std(), { colors: true }), armR = inst(armG, std(), { colors: true });
  const legL = inst(legG, std(), { colors: true }), legR = inst(legG, std(), { colors: true });

  const base = new Map(); // agent index -> torso colour, to restore after a hover tint
  const people = [];
  const o = new THREE.Object3D();
  const stations = new Map(); // room id -> standing spots at its wall boards
  for (const room of rooms.values()) {
    const mine = agents.map((a, i) => [a, i]).filter(([a]) => a.room === room.id);
    if (!mine.length) continue;
    const { seats } = deskSeats(room, mine.length);
    stations.set(room.id, stationSpots(room, mine.length));
    mine.forEach(([a, i], k) => {
      const seat = seats[k];
      o.rotation.set(0, seat.deskYaw, 0);
      o.position.set(seat.deskX, 0, seat.deskZ); o.updateMatrix();
      desk.setMatrixAt(i, o.matrix); screen.setMatrixAt(i, o.matrix);
      o.rotation.set(0, seat.yaw, 0);
      o.position.set(seat.x, 0, seat.z); o.updateMatrix(); chair.setMatrixAt(i, o.matrix);
      const cloth = agentColor(a, room.color);
      base.set(i, cloth);
      torso.setColorAt(i, cloth); armL.setColorAt(i, cloth); armR.setColorAt(i, cloth);
      head.setColorAt(i, new THREE.Color(SKINS[i % SKINS.length]));
      hair.setColorAt(i, new THREE.Color(HAIRS[(i * 3) % HAIRS.length]));
      const pants = new THREE.Color(PANTS[i % PANTS.length]);
      legL.setColorAt(i, pants); legR.setColorAt(i, pants);
      screen.setColorAt(i, cloth.clone().lerp(new THREE.Color(0x2a6df4), 0.6));
      people.push({
        i, seat, x: seat.x, z: seat.z, yaw: seat.yaw, targetYaw: seat.yaw, phase: i * 1.7, clock: 0, wave: 0,
        mode: "seat", sitting: true, path: [], pi: 0, dest: null, key: null, until: 0, returning: false, kind: null, pose: null,
        deskPose: i % 5 < 3 ? DESK_POSE[room.id] || "type" : "type",
      });
    });
  }
  for (const m of [desk, chair, screen]) m.instanceMatrix.needsUpdate = true;
  for (const m of [screen, torso, head, hair, armL, armR, legL, legR]) m.instanceColor.needsUpdate = true;

  const spots = sharedSpots(rooms);
  const busy = new Set(); // reserved spot keys: "me:2", "brk:0", "meet:3", "host:17"
  let hot = null, talk = null, last = 0, nextTrip = 2, nextMeeting = MEETING_FIRST;
  const byIndex = new Map(people.map((p) => [p.i, p]));
  const engaged = (p) => p.i === hot || p.i === talk;

  // ---- behaviour ----
  function go(p, dest, key, kind, stay, until = 0) {
    busy.add(key);
    Object.assign(p, { dest, key, kind, stay, until, returning: false, mode: "walk", sitting: false, path: routeOut(p.seat, dest), pi: 0 });
  }
  function goHome(p) {
    busy.delete(p.key);
    Object.assign(p, { returning: true, mode: "walk", sitting: false, path: routeHome(p.dest, p.seat), pi: 0 });
  }
  function arrive(p, now) {
    if (p.returning) {
      Object.assign(p, { mode: "seat", sitting: true, returning: false, dest: null, key: null, kind: null, pose: null, targetYaw: p.seat.yaw });
      return;
    }
    Object.assign(p, { mode: "stay", sitting: !!p.dest.sit, pose: p.dest.sit ? "seated" : p.dest.pose || "talk", until: Math.max(now + p.stay, p.until), targetYaw: p.dest.yaw });
  }
  function advance(p, dt, now) {
    let left = SPEED * dt;
    while (left > 0 && p.pi < p.path.length) {
      const t = p.path[p.pi], dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1e-6) p.targetYaw = Math.atan2(-dx, -dz);
      if (d <= left) { p.x = t.x; p.z = t.z; left -= d; p.pi++; }
      else { p.x += (dx / d) * left; p.z += (dz / d) * left; left = 0; }
    }
    if (p.pi >= p.path.length) arrive(p, now);
  }
  const free = (arr, prefix) => { const k = arr.map((_, j) => j).filter((j) => !busy.has(`${prefix}:${j}`)); return k.length ? pick(k) : null; };
  const seated = () => people.filter((p) => p.mode === "seat" && !engaged(p));

  function startTrip(now) {
    const pool = seated();
    if (!pool.length) return;
    const p = pick(pool);
    const away = people.filter((q) => q.mode !== "seat" && q.kind !== "work").length >= MAX_AWAY;
    const r = Math.random();
    let acc = 0, kind = "visit";
    for (const [k, w] of WEIGHTS) { acc += w; if (r < acc) { kind = k; break; } }
    if (kind === "work") {
      const list = stations.get(p.seat.roomId), prefix = `st:${p.seat.roomId}`, j = free(list, prefix);
      if (j != null) return go(p, list[j], `${prefix}:${j}`, "work", between(STAY.work));
      if (away) return;
      kind = "visit";
    }
    if (away) return;
    if (kind === "visit") {
      const host = pick(pool.filter((h) => h.seat.roomId !== p.seat.roomId && !busy.has(`host:${h.i}`)));
      if (host) return go(p, visitSpot(host.seat), `host:${host.i}`, "visit", between(STAY.visit));
      kind = "break";
    }
    const list = kind === "me" ? spots.me : spots.break, prefix = kind === "me" ? "me" : "brk";
    const j = free(list, prefix);
    if (j != null) go(p, list[j], `${prefix}:${j}`, kind, between(STAY[kind]));
  }
  function convene(now) {
    const pool = seated().sort(() => Math.random() - 0.5);
    const seatIdx = spots.meeting.map((_, j) => j).filter((j) => !busy.has(`meet:${j}`)).sort(() => Math.random() - 0.5);
    const who = pool.slice(0, Math.min(MEETING_SIZE, pool.length, seatIdx.length));
    who.forEach((p, k) => go(p, spots.meeting[seatIdx[k]], `meet:${seatIdx[k]}`, "meeting", 0));
    // everyone stays until MEETING_LENGTH after the last attendee arrives
    const walk = Math.max(...who.map((p) => p.path.reduce((sum, pt, j) => sum + Math.hypot(pt.x - (j ? p.path[j - 1].x : p.x), pt.z - (j ? p.path[j - 1].z : p.z)), 0))) / SPEED;
    const until = now + walk + MEETING_LENGTH;
    for (const p of who) p.until = until;
    return who.length ? until : now;
  }

  // ---- drawing ----
  const tintTorso = (i, on) => {
    torso.setColorAt(i, on ? base.get(i).clone().lerp(new THREE.Color(0xffffff), HOT_TINT) : base.get(i));
    torso.instanceColor.needsUpdate = true;
  };
  const parent = new THREE.Matrix4(), local = new THREE.Matrix4(), out = new THREE.Matrix4();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(S, S, S), one = new THREE.Vector3(1, 1, 1);
  const put = (mesh, i, x, y, z, rx = 0, rz = 0) => {
    local.compose(v.set(x, y, z), q.setFromEuler(e.set(rx, 0, rz)), one);
    mesh.setMatrixAt(i, out.multiplyMatrices(parent, local));
  };

  const animate = (now, camera) => {
    const dt = Math.min(0.05, Math.max(0, now - last)); last = now;
    if (dt > 0) {
      if (now >= nextTrip) {
        nextTrip = now + TRIP_EVERY;
        startTrip(now);
      }
      if (now >= nextMeeting) nextMeeting = convene(now) + MEETING_GAP; // next one a while after this one ends
    }
    for (const p of people) {
      const stopped = engaged(p);
      if (dt > 0 && !stopped) {
        p.clock += dt;
        if (p.mode === "walk") advance(p, dt, now);
        else if (p.mode === "stay" && now >= p.until) goHome(p);
      }
      p.wave += ((stopped ? 1 : 0) - p.wave) * 0.15;
      if (stopped) p.targetYaw = Math.atan2(-(camera.position.x - p.x), -(camera.position.z - p.z));
      p.yaw += wrap(p.targetYaw - p.yaw) * Math.min(1, dt * 9 + (dt ? 0 : 1));

      const c = p.clock + p.phase, walking = p.mode === "walk" && !stopped;
      const sitting = p.sitting && !(p.mode === "walk");
      const swing = walking ? Math.sin(c * 7) : 0;
      const y = (sitting ? SEAT_Y : 0) + (walking ? Math.abs(swing) * 0.02 : 0) + (p.pose === "cheer" && p.mode === "stay" ? Math.abs(Math.sin(c * 6)) * 0.05 : 0);
      parent.compose(v.set(p.x, y, p.z), q.setFromAxisAngle(UP, p.yaw), sc);

      const nod = Math.sin(c * 2) * 0.05;
      const [lx, lz, rx0, rz0] = walking ? [swing * 0.7, 0, -swing * 0.7, 0] : armPose(p.mode === "seat" ? p.deskPose : p.pose, c);
      put(torso, p.i, 0, HIP + 0.32, 0, sitting ? -0.1 + Math.sin(c * 3) * 0.02 : 0);
      put(head, p.i, 0, 1.25, 0, nod);
      put(hair, p.i, 0, 1.25, 0, nod);
      put(face, p.i, 0, 1.25, 0, nod);
      put(legL, p.i, -0.09, HIP, 0, sitting ? Math.PI / 2 : -swing * 0.6);
      put(legR, p.i, 0.09, HIP, 0, sitting ? Math.PI / 2 : swing * 0.6);
      put(armL, p.i, -0.23, 0.98, 0, lx, -lz);
      put(armR, p.i, 0.23, 0.98, 0, rx0 * (1 - p.wave), rz0 * (1 - p.wave) + p.wave * (2.5 + Math.sin(now * 10) * 0.3));
    }
    for (const m of [torso, head, hair, face, armL, armR, legL, legR]) m.instanceMatrix.needsUpdate = true;
  };

  return {
    animate,
    pickMeshes: [torso, head],
    pos: (i) => { const p = byIndex.get(i); return p ? { x: p.x, z: p.z } : null; },
    setHot(i) { if (hot === i) return; if (hot != null && hot !== talk) tintTorso(hot, false); hot = i; if (i != null) tintTorso(i, true); },
    setTalk(i) { if (talk === i) return; if (talk != null && talk !== hot) tintTorso(talk, false); talk = i; if (i != null) tintTorso(i, true); },
    // what everyone is doing right now, for the on-screen status line and tests
    stats() {
      const s = { seated: 0, walking: 0, meeting: 0, break: 0, visiting: 0, office: 0, working: 0 };
      for (const p of people) {
        if (p.mode === "seat") s.seated++;
        else if (p.mode === "walk") s.walking++;
        else if (p.kind === "meeting") s.meeting++;
        else if (p.kind === "break") s.break++;
        else if (p.kind === "visit") s.visiting++;
        else if (p.kind === "me") s.office++;
        else if (p.kind === "work") s.working++;
      }
      return s;
    },
  };
}
