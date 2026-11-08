// Pure geometry for the office: room rectangles, desk pods with walking lanes, meeting/break spots,
// and walking paths along the lanes and hallways. No THREE, no DOM, so it can be tested with node.
//
// Rooms have walls on their north and west sides only; the east and south sides are open onto hallways.
// Desk rows are paired back-to-back (pods) with a lane between pods, so people can stand up, walk out
// along a lane and leave the room through its east side.

export const CELL = 12, GAP = 1.5, GRID_COLS = 4, GRID_ROWS = 3;
export const TOTAL_W = GRID_COLS * CELL + (GRID_COLS - 1) * GAP;
export const TOTAL_D = GRID_ROWS * CELL + (GRID_ROWS - 1) * GAP;

// One cell per department; my office takes two. 12 rooms fill the 4x3 grid exactly.
const DEPT_SLOTS = {
  engineering: [2, 0, 1], specialists: [0, 1, 1], security: [1, 1, 1], design: [2, 1, 1], marketing: [3, 1, 1],
  qa: [0, 2, 1], pm: [1, 2, 1], ops: [2, 2, 1],
};
export const SPECIAL = {
  me: { col: 0, row: 0, span: 2, label: "Ervenderr's office", color: "#f26b1d" },
  meeting: { col: 3, row: 0, span: 1, label: "Meeting room", color: "#8b5cf6" },
  break: { col: 3, row: 2, span: 1, label: "Break room", color: "#f59e0b" },
};

const LANE = 0.9, PAIR = 2.1, MAX_PAIRS = 3, PITCH_MIN = 1.4, PITCH_MAX = 2.0, EDGE = 0.6;

function gridRect(col, row, span) {
  const w = span * CELL + (span - 1) * GAP;
  return { col, row, span, w, d: CELL, cx: -TOTAL_W / 2 + col * (CELL + GAP) + w / 2, cz: -TOTAL_D / 2 + row * (CELL + GAP) + CELL / 2 };
}

// id -> room rect (+ label/color). deptRooms is office.json's rooms list, in slot order.
export function layoutRooms(deptRooms) {
  const m = new Map();
  for (const [id, s] of Object.entries(SPECIAL)) m.set(id, { id, ...gridRect(s.col, s.row, s.span), label: s.label, color: s.color });
  for (const r of deptRooms) {
    const slot = DEPT_SLOTS[r.id];
    if (!slot) throw new Error(`no grid slot for room ${r.id}`);
    m.set(r.id, { id: r.id, ...gridRect(...slot), label: r.label, color: r.color, count: r.count });
  }
  return m;
}

// hallway centre lines: x between column j-1 and j, z between row r-1 and r
export const hallX = (j) => -TOTAL_W / 2 + j * (CELL + GAP) - GAP / 2;
export const hallZ = (r) => -TOTAL_D / 2 + r * (CELL + GAP) - GAP / 2;

// A "port" is where a spot connects to the hallways: its lane z, its room's east hall x and south hall z.
const port = (room, laneZ) => ({ laneZ, hx: hallX(room.col + room.span), hz: hallZ(room.row + 1), roomId: room.id });

// Desk seats for n agents in a dept room: pods of two back-to-back rows with a lane above and below.
// yaw 0 faces north (-z), PI faces south. Row A sits north of its desk facing south, row B the opposite.
export function deskSeats(room, n) {
  let pairs = 1;
  while (pairs < MAX_PAIRS && (room.w - 2 * EDGE) / Math.ceil(n / (2 * pairs)) < PITCH_MIN) pairs++; // roomier desks first, more pods if needed
  const cols = Math.ceil(n / (2 * pairs));
  const pitch = Math.min(PITCH_MAX, (room.w - 2 * EDGE) / cols);
  const startX = room.cx - (cols * pitch) / 2;
  const extent = (PAIR + LANE) * pairs + LANE;
  const zTop = room.cz - extent / 2;
  const lanes = Array.from({ length: pairs + 1 }, (_, k) => zTop + LANE / 2 + k * (PAIR + LANE));
  const seats = [];
  for (let s = 0; s < n; s++) {
    const pair = Math.floor(s / (2 * cols)), within = s % (2 * cols);
    const isB = within >= cols, c = within % cols;
    const deskX = startX + (c + 0.5) * pitch;
    const deskA = lanes[pair] + LANE / 2 + 0.8; // z of the row-A desk centre
    const deskZ = isB ? deskA + 0.5 : deskA;
    const laneZ = isB ? lanes[pair + 1] : lanes[pair];
    seats.push({ x: deskX, z: isB ? deskA + 1.0 : deskA - 0.5, yaw: isB ? 0 : Math.PI, deskX, deskZ, deskYaw: isB ? 0 : Math.PI, laneZ, isB, ...port(room, laneZ) });
  }
  return { seats, lanes };
}

export const yawToward = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

// Where a visitor stands to talk to a host at a desk: in the lane behind the host's chair, facing it.
export function visitSpot(hostSeat) {
  return { x: hostSeat.deskX, z: hostSeat.laneZ, yaw: hostSeat.isB ? 0 : Math.PI, laneZ: hostSeat.laneZ, hx: hostSeat.hx, hz: hostSeat.hz, roomId: hostSeat.roomId };
}

// What each department does standing up: where (a wall board) and how (pose, see crowd.js).
export const STATIONS = {
  engineering: { label: "at the architecture board", pose: "write" },
  specialists: { label: "at the idea wall", pose: "point" },
  marketing: { label: "at the campaign wall", pose: "point" },
  security: { label: "watching the threat wall", pose: "watch" },
  geo: { label: "at the world map", pose: "point" },
  design: { label: "at the moodboard", pose: "write" },
  sales: { label: "at the leaderboard", pose: "cheer" },
  qa: { label: "at the bug board", pose: "point" },
  pm: { label: "at the kanban board", pose: "write" },
  ops: { label: "at the status wall", pose: "write" },
};
const STATION_WALL_GAP = 0.85; // gap from the room's north edge (wall is 0.25 thick)

// Standing spots at the wall boards, reached from the room's north lane. Two people fit at each board.
export function stationSpots(room, n) {
  const { lanes } = deskSeats(room, n);
  const edge = room.w / 2 - 1.7; // 4.3 in a one-cell room
  return [-edge, 1 - edge, edge - 1, edge].map((dx) => ({ x: room.cx + dx, z: room.cz - room.d / 2 + STATION_WALL_GAP, yaw: 0, ...STATIONS[room.id], ...port(room, lanes[0]) }));
}

// Fixed spots in the shared rooms.
export function sharedSpots(rooms) {
  const me = rooms.get("me"), meet = rooms.get("meeting"), brk = rooms.get("break");
  const meSpots = [[-3.2, 0.6], [3.2, 0.6], [-2.2, 2.8], [2.2, 2.8], [0, 4], [-4.4, 3.2]].map(([dx, dz]) => {
    const p = { x: me.cx + dx, z: me.cz + dz };
    return { ...p, yaw: yawToward(p, { x: me.cx, z: me.cz + 0.6 }), ...port(me, me.cz + 4.9) };
  });
  const tableZ = meet.cz - 0.6;
  // north-side seats are behind the table, so they are reached around its east end (approach points, in order from the lane)
  const around = meet.cx + 4.6;
  const meetSeats = [-2.7, -0.9, 0.9, 2.7].flatMap((dx) => {
    const x = meet.cx + dx, laneZ = meet.cz + 4.9, zN = tableZ - 1.15;
    return [
      { x, z: zN, yaw: Math.PI, sit: true, approach: [{ x: around, z: laneZ }, { x: around, z: zN - 1 }, { x, z: zN - 1 }], ...port(meet, laneZ) },
      { x, z: tableZ + 1.15, yaw: 0, sit: true, ...port(meet, laneZ) },
    ];
  });
  const breakSpots = [
    ...[-3.6, -1.2, 1.2, 3.6].map((dx) => ({ x: brk.cx + dx, z: brk.cz - brk.d / 2 + 1.4, yaw: 0, ...port(brk, brk.cz + 4.9) })),
    ...[[-3.6, 1.2], [-3.6, 3], [3.6, 1.2], [3.6, 3]].map(([dx, dz]) => ({ x: brk.cx + dx, z: brk.cz + dz, yaw: dx < 0 ? -Math.PI / 2 : Math.PI / 2, ...port(brk, brk.cz + 4.9) })),
  ];
  return { me: meSpots, meeting: meetSeats, break: breakSpots, tableZ };
}

// Polyline from one spot to another: out along the lane, east to the hallway, around, then in.
// A spot may carry `approach`: extra points between its lane and itself (used to go around the meeting table).
export function pathBetween(from, to) {
  const pts = from.approach ? [...from.approach].reverse() : [{ x: from.x, z: from.laneZ }];
  const entry = to.approach ?? [{ x: to.x, z: to.laneZ }];
  if (from.roomId === to.roomId && from.laneZ === to.laneZ && !from.approach && !to.approach) {
    // same lane: walk straight along it
  } else {
    pts.push({ x: from.hx, z: from.laneZ });
    if (from.hx !== to.hx) pts.push({ x: from.hx, z: from.hz }, { x: to.hx, z: from.hz });
    pts.push({ x: to.hx, z: to.laneZ });
  }
  pts.push(...entry, { x: to.x, z: to.z });
  return pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z) > 1e-6);
}
