// Shared, dependency-free simulation: used by the browser (hot-seat) and the server (online rooms).
export const DIST = 15, HP = 100, MAXV = 26, G = 9.8;
// Each archer stands in the middle of a round tower top (centre x = -DIST for Blue, +DIST for Red).
export const WALL_H = 5, TOWER_R = 2.7, RING_IN = 2.05;   // tower height and radii of the low ring wall
export const BREAST = 0.75, MERLON_H = 0.8;               // ring-wall height, merlon height above it
export const MERLON_R = 2.38, MERLON_HALF = 0.36;         // merlon centre radius and half-width
export const MERLON_ANG = [-75, -50, -25, 25, 50, 75];    // destructible merlons (degrees from the facing direction); gap in front
export const STATIC_ANG = [-100, 100];                    // decorative, indestructible
export const MERLON_HP = 2;                               // 1st hit cracks it, 2nd knocks it off (heavy arrows knock off at once)
export const MERLONS = 2 * MERLON_ANG.length;
export const SHOULDER = 1.15;                             // bow-arm pivot height above the tower floor
const towerX = s => (s ? DIST : -DIST);
// World placement of merlon id (side = floor(id / n)): centre and outward angle (atan2(z, x) around the tower centre)
export function merlonGeom(id, list = MERLON_ANG) {
  const n = list.length, s = Math.floor(id / n), deg = list[id % n];
  const ang = (s ? Math.PI : 0) + (s ? -1 : 1) * deg * Math.PI / 180, cx = towerX(s);
  return { s, ang, cx, x: cx + MERLON_R * Math.cos(ang), z: MERLON_R * Math.sin(ang) };
}
function inMerlon(g, p) { // box in the tower's radial frame
  const dx = p.x - g.cx, dz = p.z, c = Math.cos(g.ang), sn = Math.sin(g.ang);
  const rad = dx * c + dz * sn, tan = -dx * sn + dz * c;
  return Math.abs(rad - MERLON_R) < 0.3 && Math.abs(tan) < MERLON_HALF && p.y >= WALL_H + BREAST && p.y < WALL_H + BREAST + MERLON_H;
}
export const STATIC_GEOM = [0, 1, 2, 3].map(i => merlonGeom(i, STATIC_ANG));
export const ARROWS = {
  normal: { name: 'Normal', dmg: [25, 50], stone: 1, g: 1, wind: 1 },
  heavy: { name: 'Heavy', dmg: [35, 70], stone: 2, g: 1.4, wind: 0.4 },
  split: { name: 'Split', dmg: [15, 30], stone: 1, g: 1, wind: 1, split: true },
};
// Three cartoon variants. riverX/slope/riverPh shape the winding river; trees [x, z, size]; tents [x, z, r, h]; treb [x, z]; rocks [x, z, r].
export const ARENAS = {
  field: { name: 'Sunny Field', amp: 0.35, wallZ: 15, riverX: 0, slope: -0.8, riverPh: 0,
    trees: [[-9, -6, 1], [7, 8, 1.1], [10, -1, 0.9], [-5, -10, 1.2], [3, 12, 1.1], [-11, -4, 0.8]],
    tents: [[6, 5, 1.6, 3.2]], treb: [6, 1.5], rocks: [[-2, -6, 0.6], [8, -2, 0.5], [-9, 2, 0.5]] },
  dusk: { name: 'Stormy Dusk', amp: 0.45, wallZ: 14, riverX: 0, slope: 0.75, riverPh: 2,
    trees: [[-7, 7, 1.1], [8, -7, 1], [-9, -2, 1.2], [4, -11, 1], [-3, 12, 1.1]],
    tents: [[6, -5, 1.6, 3.2], [-8, 4, 1.4, 2.8]], treb: [-5, -2], rocks: [[2, -6, 0.7], [-10, 1, 0.5]] },
  winter: { name: 'Winter Siege', amp: 0.55, wallZ: 14, riverX: 0, slope: -0.6, riverPh: 4,
    trees: [[-7, -6, 1.1], [7, 6, 1.1], [-10, -2, 0.9], [10, 3, 1], [-2, -12, 1.2], [3, 11, 1]],
    tents: [[-5, -7, 1.5, 3], [5, 7, 1.5, 3]], treb: [5, 1.5], rocks: [[-10, 5, 0.6], [4, 2, 0.6]] },
};
export const ARENA_IDS = Object.keys(ARENAS);
const smooth = (d, a, b) => { const t = Math.min(1, Math.max(0, (d - a) / (b - a))); return t * t * (3 - 2 * t); };
const r2 = v => Math.round(v * 100) / 100;
export function makeWorld(id) {
  const A = ARENAS[id] || ARENAS.field;
  const riverX = z => A.riverX + A.slope * z + 2 * Math.sin(z * 0.12 + A.riverPh); // diagonal so both archers see it winding off to their left
  const groundH = (x, z) => {
    const ax = Math.abs(x), d = Math.abs(x - riverX(z));
    let h = A.amp * (Math.sin(x * 0.27) * Math.cos(z * 0.21) + 0.6 * Math.sin(x * 0.41 + z * 0.33) + 0.6);
    h *= smooth(Math.hypot(ax - DIST, z), 3.5, 6);       // flat around the towers
    h -= (h + 1.4) * (1 - smooth(d, 2, 3.4));            // river bed (always below the water)                   // river bed
    return h + Math.min(5, Math.max(0, Math.abs(z) - A.wallZ) * 0.22) + Math.min(4, Math.max(0, ax - 30) * 0.15); // gentle rims keep the sky open
  };
  const tr = A.trees.map(([x, z, s]) => ({ x, z, s, y: groundH(x, z) }));
  const tents = A.tents.map(([x, z, r, h]) => ({ x, z, r, h, y: groundH(x, z) }));
  const rocks = A.rocks.map(([x, z, r]) => ({ x, z, r, y: groundH(x, z) }));
  const treb = { x: A.treb[0], z: A.treb[1], y: groundH(A.treb[0], A.treb[1]) };
  const solid = p => {
    for (const s of [0, 1]) { // round towers and their ring walls
      const r = Math.hypot(p.x - towerX(s), p.z);
      if (r < TOWER_R && p.y < WALL_H) return true;
      if (r > RING_IN && r < TOWER_R && p.y < WALL_H + BREAST) return true;
    }
    if (STATIC_GEOM.some(g => inMerlon(g, p))) return true;
    for (const t of tr) { const ly = p.y - t.y; if (ly > 0 && ((ly < 1.6 * t.s && Math.hypot(p.x - t.x, p.z - t.z) < 0.22 * t.s) || Math.hypot(p.x - t.x, ly - 2.5 * t.s, p.z - t.z) < 1.15 * t.s)) return true; }
    for (const t of tents) { const ly = p.y - t.y, r = Math.hypot(p.x - t.x, p.z - t.z); if (ly > 0 && ly < t.h && r < (ly < t.h * 0.45 ? t.r : t.r * (1 - (ly - t.h * 0.45) / (t.h * 0.55)))) return true; }
    for (const k of rocks) if (Math.hypot(p.x - k.x, p.y - k.y, p.z - k.z) < k.r) return true;
    return Math.abs(p.x - treb.x) < 1.5 && Math.abs(p.z - treb.z) < 0.9 && p.y > treb.y && p.y < treb.y + 2.8;
  };
  return { id: ARENAS[id] ? id : 'field', A, groundH, riverX, trees: tr, tents, rocks, treb, solid };
}

export function archerHit(i, p) { // chunky, big-headed archer standing at the tower centre
  const bx = towerX(i), r2d = (p.x - bx) ** 2 + p.z ** 2, y = p.y - WALL_H;
  if ((y - 1.55) ** 2 + r2d < 0.36 ** 2) return 'head';
  if (y > 0 && y < 1.25 && r2d < 0.34 ** 2) return 'body';
  return null;
}
// aim: { pitch, power 0..1 }. No sideways aim: every shot flies straight down the lane at the opponent (z = 0).
export function launch(i, aim) {
  const f = i ? -1 : 1, cp = Math.cos(aim.pitch);
  const d = { x: f * cp, y: Math.sin(aim.pitch), z: 0 };
  const v = MAXV * aim.power;
  return { pos: { x: -f * DIST + d.x * 0.9, y: WALL_H + SHOULDER + d.y * 0.9, z: d.z * 0.9 }, vel: { x: d.x * v, y: d.y * v, z: d.z * v } };
}
function collide(world, p, shooter, merlons) {
  for (let i = 0; i < 2; i++) if (i !== shooter) { const part = archerHit(i, p); if (part) return { kind: part, who: i }; }
  for (let m = 0; m < MERLONS; m++) if (merlons[m] > 0 && inMerlon(merlonGeom(m), p)) return { kind: 'merlon', merlon: m };
  if (world.solid(p)) return { kind: 'stone' };
  if (p.y <= world.groundH(p.x, p.z)) return { kind: 'ground' };
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
export const randomWind = () => ({ x: r2((Math.random() * 2 - 1) * 3.5), z: 0 }); // head/tail wind only, so wind never pushes a shot sideways
