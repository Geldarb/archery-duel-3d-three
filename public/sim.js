// Shared, dependency-free simulation: used by the browser (hot-seat) and the server (online rooms).
export const DIST = 22, HP = 100, MAXV = 31, G = 9.8;
// Castle geometry (mirrored for each side; |x| measured from the field centre)
export const WALL_H = 5;                          // walkway height the archers stand on
export const PARAPET = [20.4, 20.9];              // |x| range of the front parapet
export const BREAST = 0.9, MERLON_H = 1.0;        // breastwork height, merlon height above it
export const MERLON_Z = [-5, -3, -1, 1, 3, 5];    // merlon centres (1 m wide); the archer shoots through the gap at z = 0
export const MERLON_HP = 2;                       // 1st hit cracks it, 2nd knocks it off (heavy arrows knock off at once)
export const merlonId = (side, k) => side * MERLON_Z.length + k; // side 0 = Blue (x < 0), 1 = Red
export const MERLONS = 2 * MERLON_Z.length;

export const ARROWS = {
  normal: { name: 'Normal', dmg: [25, 50], stone: 1, g: 1, wind: 1 },
  heavy: { name: 'Heavy', dmg: [35, 70], stone: 2, g: 1.4, wind: 0.4 },
  split: { name: 'Split', dmg: [15, 30], stone: 1, g: 1, wind: 1, split: true },
};
// Three castle variants. props: wooden/stone obstacles in the field [x, z, sx, sy, sz] (sizes are full extents) and tents [x, z, r, h].
export const ARENAS = {
  field: { name: 'Green Field', amp: 0.35, wallZ: 16,
    boxes: [[0, 0, 0.5, 3.2, 6, 'wood'], [-9, 4, 2.2, 1.1, 1.2, 'wood'], [10, -5, 1.2, 1.2, 2.4, 'wood']],
    tents: [[-6, 11, 2, 2.8], [6, -11, 2.2, 3], [1, 13, 1.6, 2.4]] },
  dusk: { name: 'Stormy Dusk', amp: 0.45, wallZ: 15,
    boxes: [[0, 0, 1.4, 3.8, 5, 'stone'], [-10, -4, 1.5, 1.4, 1.5, 'stone'], [9, 5, 2.4, 1, 1, 'wood']],
    tents: [[-4, -12, 2.2, 3], [7, 12, 2, 2.8]] },
  winter: { name: 'Winter Siege', amp: 0.6, wallZ: 14,
    boxes: [[0, 0, 0.5, 3, 7, 'wood'], [-8, -6, 1.3, 1.3, 1.3, 'wood'], [8, 6, 1.3, 1.3, 1.3, 'wood'], [11, -3, 2.4, 1, 1, 'wood']],
    tents: [[-5, 10, 2, 2.6], [5, -10, 2, 2.6], [-1, -13, 1.8, 2.6]] },
};
export const ARENA_IDS = Object.keys(ARENAS);
const smooth = (d, a, b) => { const t = Math.min(1, Math.max(0, (d - a) / (b - a))); return t * t * (3 - 2 * t); };
const r2 = v => Math.round(v * 100) / 100;
const box = (x0, x1, y0, y1, z0, z1) => ({ x0, x1, y0, y1, z0, z1 });
const inBox = (b, p) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1 && p.z >= b.z0 && p.z <= b.z1;
const mirror = (s, a, b) => (s ? [a, b] : [-b, -a]); // |x| range -> x range for side s

export function castleBoxes(s) { // static stone of one castle
  const [p0, p1] = mirror(s, PARAPET[0], PARAPET[1]), [w0, w1] = mirror(s, PARAPET[0], 24), [t0, t1] = mirror(s, 19.9, 24.5), [r0, r1] = mirror(s, 23.6, 24);
  return [
    box(w0, w1, -2, WALL_H, -7, 7),                       // curtain wall
    box(p0, p1, WALL_H, WALL_H + BREAST, -7, 7),          // breastwork
    box(r0, r1, WALL_H, WALL_H + 0.6, -7, 7),             // rear parapet
    box(t0, t1, -2, WALL_H + 3, 7, 10), box(t0, t1, -2, WALL_H + 3, -10, -7), // towers
  ];
}
export function merlonBox(id) {
  const s = Math.floor(id / MERLON_Z.length), z = MERLON_Z[id % MERLON_Z.length], [x0, x1] = mirror(s, PARAPET[0], PARAPET[1]);
  return box(x0, x1, WALL_H + BREAST, WALL_H + BREAST + MERLON_H, z - 0.5, z + 0.5);
}

export function makeWorld(id) {
  const A = ARENAS[id] || ARENAS.field;
  const groundH = (x, z) => {
    const ax = Math.abs(x);
    let h = A.amp * (Math.sin(x * 0.17) * Math.cos(z * 0.21) + 0.6 * Math.sin(x * 0.41 + z * 0.33) + 0.6) * (1 - smooth(ax, 12, 15));
    h -= 1.4 * smooth(ax, 15.5, 16.5) * (1 - smooth(ax, 19, 20)); // moat in front of each castle
    return h + Math.max(0, Math.abs(z) - A.wallZ) * 0.5 + Math.max(0, ax - 30) * 0.6;
  };
  const solids = [...castleBoxes(0), ...castleBoxes(1)];
  const props = A.boxes.map(([x, z, sx, sy, sz, kind]) => {
    const y = groundH(x, z) - 0.2, b = box(x - sx / 2, x + sx / 2, y, y + sy, z - sz / 2, z + sz / 2);
    solids.push(b);
    return { x, y, z, sx, sy, sz, kind };
  });
  const tents = A.tents.map(([x, z, r, h]) => ({ x, z, r, h, y: groundH(x, z) }));
  const tentHit = p => tents.some(t => { const ly = p.y - t.y; return ly >= 0 && ly < t.h && Math.hypot(p.x - t.x, p.z - t.z) < t.r * (1 - ly / t.h); });
  return { id: ARENAS[id] ? id : 'field', A, groundH, solids, props, tents, tentHit };
}

export function archerHit(i, p) {
  const bx = i === 0 ? -DIST : DIST, r2d = (p.x - bx) ** 2 + p.z ** 2, y = p.y - WALL_H;
  if ((y - 1.8) ** 2 + r2d < 0.27 ** 2) return 'head';
  if (y > 0 && y < 1.62 && r2d < 0.3 ** 2) return 'body';
  return null;
}
// aim: { pitch, yaw (+ = shooter's right), power 0..1 }
export function launch(i, aim) {
  const f = i ? -1 : 1, cp = Math.cos(aim.pitch);
  const d = { x: f * cp * Math.cos(aim.yaw), y: Math.sin(aim.pitch), z: f * cp * Math.sin(aim.yaw) };
  const v = MAXV * aim.power;
  return { pos: { x: -f * DIST + d.x * 0.9, y: WALL_H + 1.44 + d.y * 0.9, z: d.z * 0.9 }, vel: { x: d.x * v, y: d.y * v, z: d.z * v } };
}
function collide(world, p, shooter, merlons) {
  for (let i = 0; i < 2; i++) if (i !== shooter) { const part = archerHit(i, p); if (part) return { kind: part, who: i }; }
  for (let m = 0; m < MERLONS; m++) if (merlons[m] > 0 && inBox(merlonBox(m), p)) return { kind: 'merlon', merlon: m };
  if (world.solids.some(b => inBox(b, p))) return { kind: 'stone' };
  if (p.y <= world.groundH(p.x, p.z)) return { kind: 'ground' };
  if (world.tentHit(p)) return { kind: 'tent' };
  if (Math.abs(p.x) > 85 || Math.abs(p.z) > 55 || p.y < -5) return { kind: 'out' };
  return null;
}
// Returns { type, arrows: [{ t0, pts: [[x,y,z] every 1/60 s], res: { kind, who?, merlon?, dmg, pos, dir, t } }] }
export function simulateShot(world, shooter, aim, wind, type = 'normal', merlons = fullMerlons()) {
  const T = ARROWS[type] || ARROWS.normal, DT = 1 / 240, out = [];
  const { pos, vel } = launch(shooter, aim);
  const queue = [{ t0: 0, p: pos, v: vel, child: false }];
  while (queue.length) {
    const a = queue.shift(), p = a.p, v = a.v, pts = [[r2(p.x), r2(p.y), r2(p.z)]];
    let t = a.t0, res = null;
    for (let n = 1; n <= 12 * 240 && !res; n++) {
      const vy0 = v.y;
      v.x += wind.x * T.wind * DT; v.z += wind.z * T.wind * DT; v.y -= G * T.g * DT;
      p.x += v.x * DT; p.y += v.y * DT; p.z += v.z * DT; t += DT;
      if (T.split && !a.child && vy0 > 0 && v.y <= 0) { // split into 3 at the top of the arc
        a.child = true;
        for (const s of [-1, 1]) {
          const c = Math.cos(0.12 * s), sn = Math.sin(0.12 * s);
          queue.push({ t0: t, p: { ...p }, v: { x: v.x * c - v.z * sn, y: v.y, z: v.x * sn + v.z * c }, child: true });
        }
      }
      const hit = collide(world, p, shooter, merlons);
      if (hit) {
        const sp = Math.hypot(v.x, v.y, v.z);
        res = { ...hit, dmg: hit.who !== undefined ? T.dmg[hit.kind === 'head' ? 1 : 0] : hit.kind === 'merlon' ? T.stone : 0,
          pos: [r2(p.x), r2(p.y), r2(p.z)], dir: [v.x / sp, v.y / sp, v.z / sp].map(r2), t: r2(t) };
        pts.push(res.pos);
      } else if (n % 4 === 0) pts.push([r2(p.x), r2(p.y), r2(p.z)]);
    }
    out.push({ t0: r2(a.t0), pts, res: res || { kind: 'out', dmg: 0, pos: pts[pts.length - 1], dir: [1, 0, 0], t: r2(t) } });
  }
  return { type: ARROWS[type] ? type : 'normal', arrows: out };
}
export const fullMerlons = () => Array(MERLONS).fill(MERLON_HP);
// Apply one arrow result to { hp, merlons } (used per arrow for animation, and for the whole shot)
export function applyResult(state, res) {
  if (res.who !== undefined) state.hp[res.who] = Math.max(0, state.hp[res.who] - res.dmg);
  if (res.merlon !== undefined) state.merlons[res.merlon] = Math.max(0, state.merlons[res.merlon] - res.dmg);
}
export function applyShot(hp, merlons, shot) {
  const s = { hp: [...hp], merlons: [...merlons] };
  for (const a of shot.arrows) applyResult(s, a.res);
  return s;
}
export const winnerOf = hp => (hp[0] <= 0 ? 1 : hp[1] <= 0 ? 0 : -1);
export const randomWind = () => ({ x: r2((Math.random() * 2 - 1) * 3.5), z: r2((Math.random() * 2 - 1) * 1.2) });
