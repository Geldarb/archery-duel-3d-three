// Shared, dependency-free simulation: used by the browser (hot-seat) and the server (online rooms).
export const DIST = 22, HP = 100, MAXV = 31, G = 9.8;
export const ARROWS = {
  normal: { name: 'Normal', dmg: [25, 50], g: 1, wind: 1 },
  heavy: { name: 'Heavy', dmg: [35, 70], g: 1.4, wind: 0.4 },
  split: { name: 'Split', dmg: [15, 30], g: 1, wind: 1, split: true },
};
export const ARENAS = {
  meadow: { name: 'Meadow', amp: 0.5, wall: 0.4, wallZ: 16, tree: 'pine',
    rocks: [[0, 0, 1.6, 2.8, 3], [-9, -3, 0.8, 0.6, 0.8], [11, 4, 1, 0.7, 1]],
    trees: [[-7, 7, 1.2], [9, -8, 1.4], [-14, -9, 1.1], [15, 9, 1.3], [3, 13, 1.5], [-3, -15, 1.6], [-25, -12, 1.4], [26, 12, 1.2], [-28, 10, 1.5], [27, -11, 1.3]] },
  canyon: { name: 'Canyon', amp: 0.25, wall: 1.6, wallZ: 11, tree: 'cactus',
    rocks: [[0, 0, 2.4, 3.6, 2.2], [-12, 5, 1.4, 1.1, 1.4], [13, -4, 1.2, 1.8, 1.2], [5, -8, 1, 0.8, 1], [-5, 8, 0.9, 0.7, 0.9]],
    trees: [[-7, -6, 1], [9, 6, 1.1], [-16, 7, 1], [17, -7, 0.9], [-27, -6, 1], [26, 6, 1]] },
  peaks: { name: 'Peaks', amp: 0.9, wall: 0.7, wallZ: 14, tree: 'snowpine',
    rocks: [[0, 0, 1.8, 3.2, 2.4], [-10, 4, 1.1, 0.9, 1.1], [8, -5, 0.9, 0.7, 0.9]],
    trees: [[-6, -7, 1.3], [7, 8, 1.5], [-13, 8, 1.2], [14, -9, 1.4], [2, -13, 1.6], [-2, 12, 1.4], [-26, 9, 1.5], [25, -10, 1.3]] },
};
export const ARENA_IDS = Object.keys(ARENAS);
const smooth = (d, a, b) => { const t = Math.min(1, Math.max(0, (d - a) / (b - a))); return t * t * (3 - 2 * t); };
const r2 = v => Math.round(v * 100) / 100;

export function makeWorld(id) {
  const A = ARENAS[id] || ARENAS.meadow;
  const groundH = (x, z) => {
    let h = A.amp * (Math.sin(x * 0.17) * Math.cos(z * 0.21) + 0.6 * Math.sin(x * 0.41 + z * 0.33) + 0.6);
    h *= smooth(Math.hypot(x + DIST, z), 3, 8) * smooth(Math.hypot(x - DIST, z), 3, 8);
    return h + Math.max(0, Math.abs(z) - A.wallZ) * A.wall + Math.max(0, Math.abs(x) - 36) * 0.5;
  };
  const obstacles = [];
  const rocks = A.rocks.map(([x, z, sx, sy, sz]) => {
    const y = groundH(x, z) + sy * 0.45;
    obstacles.push(p => ((p.x - x) / sx) ** 2 + ((p.y - y) / sy) ** 2 + ((p.z - z) / sz) ** 2 < 0.85);
    return { x, y, z, sx, sy, sz };
  });
  const trees = A.trees.map(([x, z, s]) => {
    const y = groundH(x, z);
    obstacles.push(p => {
      const ly = p.y - y, r = Math.hypot(p.x - x, p.z - z);
      if (ly < 0) return false;
      if (A.tree === 'cactus') return ly < 2.6 * s && r < 0.3 * s;
      if (ly < 1.2 * s) return r < 0.24 * s;
      return ly < 4 * s && r < 1.2 * s * (1 - (ly - 1.2 * s) / (2.8 * s));
    });
    return { x, y, z, s };
  });
  return { id: ARENAS[id] ? id : 'meadow', A, groundH, rocks, trees, obstacles };
}

export function archerHit(i, p) {
  const bx = i === 0 ? -DIST : DIST, r2d = (p.x - bx) ** 2 + p.z ** 2;
  if ((p.y - 1.8) ** 2 + r2d < 0.26 ** 2) return 'head';
  if (p.y > 0 && p.y < 1.62 && r2d < 0.3 ** 2) return 'body';
  return null;
}
// aim: { pitch, yaw (+ = shooter's right), power 0..1 }
export function launch(i, aim) {
  const f = i ? -1 : 1, cp = Math.cos(aim.pitch);
  const d = { x: f * cp * Math.cos(aim.yaw), y: Math.sin(aim.pitch), z: f * cp * Math.sin(aim.yaw) };
  const v = MAXV * aim.power;
  return { pos: { x: -f * DIST + d.x * 0.9, y: 1.44 + d.y * 0.9, z: d.z * 0.9 }, vel: { x: d.x * v, y: d.y * v, z: d.z * v } };
}
function collide(world, p, shooter) {
  for (let i = 0; i < 2; i++) if (i !== shooter) { const part = archerHit(i, p); if (part) return { kind: part, who: i }; }
  if (p.y <= world.groundH(p.x, p.z)) return { kind: 'ground' };
  if (world.obstacles.some(t => t(p))) return { kind: 'obstacle' };
  if (Math.abs(p.x) > 85 || Math.abs(p.z) > 55 || p.y < -5) return { kind: 'out' };
  return null;
}
// Returns { type, arrows: [{ t0, pts: [[x,y,z] every 1/60 s], res: { kind, who?, dmg, pos, dir, t } }] }
export function simulateShot(world, shooter, aim, wind, type = 'normal') {
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
      const hit = collide(world, p, shooter);
      if (hit) {
        const sp = Math.hypot(v.x, v.y, v.z);
        res = { ...hit, dmg: hit.who !== undefined ? T.dmg[hit.kind === 'head' ? 1 : 0] : 0,
          pos: [r2(p.x), r2(p.y), r2(p.z)], dir: [v.x / sp, v.y / sp, v.z / sp].map(r2), t: r2(t) };
        pts.push(res.pos);
      } else if (n % 4 === 0) pts.push([r2(p.x), r2(p.y), r2(p.z)]);
    }
    out.push({ t0: r2(a.t0), pts, res: res || { kind: 'out', dmg: 0, pos: pts[pts.length - 1], dir: [1, 0, 0], t: r2(t) } });
  }
  return { type: ARROWS[type] ? type : 'normal', arrows: out };
}
export function applyDamage(hp, shot) {
  const h = [...hp];
  for (const a of shot.arrows) if (a.res.who !== undefined) h[a.res.who] = Math.max(0, h[a.res.who] - a.res.dmg);
  return h;
}
export const winnerOf = hp => (hp[0] <= 0 ? 1 : hp[1] <= 0 ? 0 : -1);
export const randomWind = () => ({ x: r2((Math.random() * 2 - 1) * 3.5), z: r2((Math.random() * 2 - 1) * 1.2) });
