import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutRooms, stationSpots, STATIONS, deskSeats, visitSpot, sharedSpots, pathBetween, hallX, hallZ, TOTAL_W, TOTAL_D } from "./layout.js";

const data = JSON.parse(readFileSync(new URL("./office.json", import.meta.url)));
const rooms = layoutRooms(data.rooms);
const spots = sharedSpots(rooms);
const all = new Map();

for (const r of data.rooms) {
  const room = rooms.get(r.id);
  const n = data.agents.filter((a) => a.room === r.id).length;
  const { seats, lanes } = deskSeats(room, n);
  assert.equal(seats.length, n, `${r.id} seat count`);
  all.set(r.id, seats);
  for (const s of seats) {
    // desk footprint x +-0.5, z +-0.25 ; person+chair z span roughly 0.55 behind the desk
    assert.ok(s.deskX - 0.5 >= room.cx - room.w / 2 + 0.3, `${r.id} desk past west wall`);
    assert.ok(s.deskX + 0.5 <= room.cx + room.w / 2 + 0.01, `${r.id} desk past east edge`);
    assert.ok(Math.min(s.z, s.deskZ) - 0.4 >= room.cz - room.d / 2, `${r.id} seat north of room`);
    assert.ok(Math.max(s.z, s.deskZ) + 0.4 <= room.cz + room.d / 2, `${r.id} seat south of room`);
    // lane must be clear of this seat's furniture (chair back is ~0.8 from the desk)
    assert.ok(Math.abs(s.laneZ - s.z) > 0.7 && Math.abs(s.laneZ - s.deskZ) > 0.7, `${r.id} lane overlaps seat`);
  }
  for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++)
    assert.ok(Math.hypot(seats[i].deskX - seats[j].deskX, seats[i].deskZ - seats[j].deskZ) > 0.45, `${r.id} desks overlap`);
  for (const lz of lanes) assert.ok(lz > room.cz - room.d / 2 && lz < room.cz + room.d / 2, `${r.id} lane outside room`);
}

const bounds = (p) => p.x > -TOTAL_W / 2 - 2 && p.x < TOTAL_W / 2 + 2 && p.z > -TOTAL_D / 2 - 2 && p.z < TOTAL_D / 2 + 2;
const stations = data.rooms.flatMap((r) => stationSpots(rooms.get(r.id), data.agents.filter((a) => a.room === r.id).length));
for (const st of stations) {
  const room = rooms.get(st.roomId);
  assert.ok(STATIONS[st.roomId].pose, "station pose");
  assert.ok(st.z > room.cz - room.d / 2 + 0.25 && st.z < st.laneZ - 0.4, `${st.roomId} station must sit between wall and north lane`);
  assert.ok(Math.abs(st.x - room.cx) < room.w / 2 - 0.5, `${st.roomId} station inside room`);
}
const targets = [...all.values()].map((s) => visitSpot(s[0])).concat(spots.me, spots.meeting, spots.break, stations);
let paths = 0;
const origins = [...[...all.values()].flatMap((s) => [s[0], s[s.length - 1]]), ...spots.meeting, ...spots.break, ...spots.me];
for (const from of origins) for (const to of targets) {
  const pts = pathBetween(from, to);
  paths++;
  assert.ok(pts.every(bounds), "path leaves the building area");
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].x === pts[i - 1].x || pts[i].z === pts[i - 1].z, "path segment not axis-aligned");
  assert.deepEqual([pts.at(-1).x, pts.at(-1).z], [to.x, to.z], "path must end on the spot");
}
// hall lines sit in the gaps
assert.ok(Math.abs(hallX(2)) < 1e-9 && Math.abs(hallZ(2)) < 1e-9);
console.log(`ok: ${all.size} rooms, ${paths} paths, ${spots.meeting.length} meeting seats, ${spots.break.length} break spots, ${spots.me.length} office spots`);
