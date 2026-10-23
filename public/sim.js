// Shared, dependency-free simulation: used by the browser (hot-seat) and the server (online rooms).
export const DIST = 15, HP = 100, MAXV = 26, G = 9.8;
// Each archer stands on top of a square tower built from loose stone blocks (every block is a rigid body, see physics.js).
export const WALL_H = 5, SHOULDER = 1.15;                 // tower-top floor height, bow-arm pivot height above the archer's feet
export const TOWER_HALF = 1.6, WALL_T = 0.8, COURSE_H = 0.92, COURSES = 5, SLAB_H = 0.4, MERLON_S = 0.7;
export const ARCHER_HALF = [0.28, 0.8, 0.28];              // archer physics box (feet at y - 0.8)
export const BUILD_MAX = 30, CELL = 0.8, PARK_Y = -40;     // build phase: blocks per player, grid cell (= block size), parked-slot height
const towerX = s => (s ? DIST : -DIST);
// Block layout: hollow square shell (5 courses x 6 blocks), 3 floor slabs the archer stands on, 8 merlons. 41 per tower.
export const LAYOUT = (() => {
  const L = [], o = TOWER_HALF - WALL_T / 2, g = 0.012; // lateral gap so resting blocks never overlap
  const B = (s, kind, x, y, z, sx, sy, sz) => L.push({ s, kind, pos: [towerX(s) + x, y, z], half: [sx / 2 - g, sy / 2, sz / 2 - g] });
  for (const s of [0, 1]) {
    for (let c = 0; c < COURSES; c++) {
      const y = c * COURSE_H + COURSE_H / 2;
      for (const sg of [-1, 1]) { // facing walls (toward / away from the enemy) sit between the side walls, so a push drops them inward
        B(s, 'wall', sg * o, y, 0, WALL_T, COURSE_H, 1.5);
        for (const k of [-1, 1]) B(s, 'wall', k * 0.8, y, sg * o, 1.6, COURSE_H, WALL_T);
      }
    }
    for (const k of [-1, 0, 1]) B(s, 'slab', 0, COURSES * COURSE_H + SLAB_H / 2, k * 3.2 / 3, 3.2, SLAB_H, 3.2 / 3);
    for (const i of [-1, 0, 1]) for (const k of [-1, 0, 1]) if (i || k) B(s, 'merlon', i * 1.25, WALL_H + MERLON_S / 2, k * 1.25, MERLON_S, MERLON_S, MERLON_S);
  }
  for (const s of [0, 1]) for (let n = 0; n < BUILD_MAX; n++) B(s, 'build', 0, PARK_Y, 0, CELL, CELL, CELL); // build-phase blocks: parked (no body, hidden) until placed
  return L;
})();
export const BLOCKS = LAYOUT.length;
export const parked = q => q[1] < PARK_Y / 2;
// physics snapshot: b = per block [x,y,z,qx,qy,qz,qw], a = per archer feet position [x,y,z]
// builds[s] = validated build-phase result { blocks: [[x,y,z]...], archer: [x,y,z] }: that side's classic tower is parked and the player's
// own tower (built from the ground up) is used instead. null = the classic 41-block tower (legacy layout, kept for the regression suites).
export function initialPhys(builds = null) {
  const b = LAYOUT.map(l => [...l.pos, 0, 0, 0, 1]), a = [[-DIST, WALL_H, 0], [DIST, WALL_H, 0]];
  if (builds) for (const s of [0, 1]) {
    const B = builds[s]; if (!B) continue;
    LAYOUT.forEach((l, i) => { if (l.s === s && l.kind !== 'build') b[i] = [l.pos[0], PARK_Y, l.pos[2], 0, 0, 0, 1]; });
    B.blocks.forEach((p, n) => { b[BUILD_SLOT0[s] + n] = [p[0], p[1], p[2], 0, 0, 0, 1]; });
    a[s] = [...B.archer];
  }
  return { b, a };
}
// ---------- build phase (once per match / series): each player builds their own tower from the ground up ----------
// Blocks snap to a 0.8 m grid: a 6x6-column zone on your own side (centred where the classic tower stood, flat ground, far from the
// middle), up to BUILD_LEVELS high. A block sits on the ground or straight on top of another block (no floating, no overlaps). Cells are
// [gx, gz] (dropped onto the column) or [gx, gz, level] (must be exactly the column's next level). The archer starts on the ground and
// may stand on a 0.4 m grid on the ground or on any block top, centre fully supported. Pure + deterministic (server and both clients).
export const BUILD_GRID = 3, ARCHER_GRID = 5, BUILD_LEVELS = 8, BUILD_TOP = BUILD_LEVELS * CELL, BUILD_TIME = 60;
export const BUILD_SLOT0 = [0, 1].map(s => LAYOUT.findIndex(l => l.s === s && l.kind === 'build'));
export const defaultPlan = () => ({ blocks: [], archer: [0, 0] });
// Skip / quick play: a ready-made 30-block tower (2x2 keep, 6 high, plus a 2x1x3 front buttress), archer on the keep top (4.8 m).
export function autoPlan(s) {
  const blocks = [], front = s ? -2 : 1;
  for (let y = 0; y < 6; y++) {
    for (const gx of [-1, 0]) for (const gz of [-1, 0]) blocks.push([gx, gz, y]);
    if (y < 3) for (const gz of [-1, 0]) blocks.push([front, gz, y]);
  }
  return { blocks, archer: [0, 0] };
}
const box = (p, h) => ({ x0: p[0] - h[0], x1: p[0] + h[0], y1: p[1] + h[1], z0: p[2] - h[2], z1: p[2] + h[2] });
const ON = 0.015; // blocks sit 2 x 0.012 apart, so a spot on the seam between two equal tops still counts as supported
function surface(boxes, cx, cz, hx, hz) { // highest top under a footprint, and whether the centre point rests on something at that height
  let top = 0;
  for (const b of boxes) if (b.x0 < cx + hx && b.x1 > cx - hx && b.z0 < cz + hz && b.z1 > cz - hz) top = Math.max(top, b.y1);
  const on = top === 0 || boxes.some(b => Math.abs(b.y1 - top) < 1e-6 && cx >= b.x0 - ON && cx <= b.x1 + ON && cz >= b.z0 - ON && cz <= b.z1 + ON);
  return { top, on };
}
const rd = v => Math.round(v * 1e6) / 1e6;
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
export const cellPos = (s, gx, gz, level) => [rd(towerX(s) + (gx + 0.5) * CELL), rd((level + 0.5) * CELL), rd((gz + 0.5) * CELL)];
export function validateBuild(s, plan) {
  const fail = (err, at = -1) => ({ ok: false, err, at });
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.blocks)) return fail('Bad plan');
  if (plan.blocks.length > BUILD_MAX) return fail(`Only ${BUILD_MAX} blocks`);
  const H = LAYOUT[BUILD_SLOT0[s]].half, boxes = [], out = [], cols = new Map();
  for (let n = 0; n < plan.blocks.length; n++) {
    const c = plan.blocks[n];
    if (!Array.isArray(c) || c.length < 2 || c.length > 3 || !isInt(c[0], -BUILD_GRID, BUILD_GRID - 1) || !isInt(c[1], -BUILD_GRID, BUILD_GRID - 1)) return fail('Outside your build zone', n);
    const k = c[0] + ',' + c[1], lv = cols.get(k) || 0, want = c.length === 3 ? c[2] : lv;
    if (!Number.isInteger(want) || want < 0) return fail('Bad block', n);
    const at = cellPos(s, c[0], c[1], Math.min(want, BUILD_LEVELS));
    if (want > lv) return { ...fail('No floating blocks: it needs support underneath', n), pos: at };
    if (want < lv) return { ...fail('That spot is taken', n), pos: at };
    if (lv >= BUILD_LEVELS) return { ...fail(`Too high (max ${BUILD_LEVELS} blocks)`, n), pos: cellPos(s, c[0], c[1], lv) };
    cols.set(k, lv + 1); out.push(at); boxes.push(box(at, H));
  }
  const a = plan.archer || [0, 0];
  if (!Array.isArray(a) || !isInt(a[0], -ARCHER_GRID, ARCHER_GRID) || !isInt(a[1], -ARCHER_GRID, ARCHER_GRID)) return fail('Archer must stay in your build zone');
  const ax = towerX(s) + a[0] * 0.4, az = a[1] * 0.4, sf = surface(boxes, ax, az, ARCHER_HALF[0], ARCHER_HALF[2]);
  if (!sf.on) return { ...fail('Archer needs solid stone underfoot'), pos: out.at(-1) };
  return { ok: true, blocks: out, archer: [rd(ax), rd(sf.top), rd(az)] };
}
function inBlock(b, h, p, m = 0.03) { // point inside an oriented box (inverse-rotate by the quaternion)
  const dx = p.x - b[0], dy = p.y - b[1], dz = p.z - b[2], qx = -b[3], qy = -b[4], qz = -b[5], qw = b[6];
  const tx = 2 * (qy * dz - qz * dy), ty = 2 * (qz * dx - qx * dz), tz = 2 * (qx * dy - qy * dx);
  const lx = dx + qw * tx + (qy * tz - qz * ty), ly = dy + qw * ty + (qz * tx - qx * tz), lz = dz + qw * tz + (qx * ty - qy * tx);
  return Math.abs(lx) < h[0] + m && Math.abs(ly) < h[1] + m && Math.abs(lz) < h[2] + m;
}
// Projectiles. push = impulse given to a stone block on impact (Heavy strongest, Split lightest, per arrow).
// Specials come from sky power-ups; `land` says what happens on impact (handled in physics.js). Add new specials here + a LANDING handler.
export const ARROWS = {
  normal: { name: 'Normal', dmg: [25, 50], push: 14, g: 1, wind: 1 },
  heavy: { name: 'Heavy', dmg: [35, 70], push: 30, g: 1.4, wind: 0.4 },
  split: { name: 'Split', dmg: [15, 30], push: 6, g: 1, wind: 1, split: true },
  bomb: { name: 'Bomb', dmg: [0, 0], push: 0, g: 1.3, wind: 0.3, special: true, land: 'blast', radius: 3.2, power: 34, blastDmg: 38 },
  wheelchair: { name: 'Wheelchair', dmg: [10, 15], push: 6, g: 1.25, wind: 0.5, special: true, land: 'spin', spin: 3, radius: 1.7, tick: 5, ticks: 6 },
};
export const SPECIALS = Object.keys(ARROWS).filter(k => ARROWS[k].special);
export const BASIC = Object.keys(ARROWS).filter(k => !ARROWS[k].special);
export const emptyAmmo = () => Object.fromEntries(SPECIALS.map(k => [k, 0]));
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
    for (const t of tr) { const ly = p.y - t.y; if (ly > 0 && ((ly < 1.6 * t.s && Math.hypot(p.x - t.x, p.z - t.z) < 0.22 * t.s) || Math.hypot(p.x - t.x, ly - 2.5 * t.s, p.z - t.z) < 1.15 * t.s)) return true; }
    for (const t of tents) { const ly = p.y - t.y, r = Math.hypot(p.x - t.x, p.z - t.z); if (ly > 0 && ly < t.h && r < (ly < t.h * 0.45 ? t.r : t.r * (1 - (ly - t.h * 0.45) / (t.h * 0.55)))) return true; }
    for (const k of rocks) if (Math.hypot(p.x - k.x, p.y - k.y, p.z - k.z) < k.r) return true;
    return Math.abs(p.x - treb.x) < 1.5 && Math.abs(p.z - treb.z) < 0.9 && p.y > treb.y && p.y < treb.y + 2.8;
  };
  return { id: ARENAS[id] ? id : 'field', A, groundH, riverX, trees: tr, tents, rocks, treb, solid };
}

export function archerHit(ap, p) { // chunky, big-headed archer whose feet are at ap = [x, y, z]
  const r2d = (p.x - ap[0]) ** 2 + (p.z - ap[2]) ** 2, y = p.y - ap[1];
  if ((y - 1.55) ** 2 + r2d < 0.36 ** 2) return 'head';
  if (y > 0 && y < 1.25 && r2d < 0.34 ** 2) return 'body';
  return null;
}
// Archers always stand upright and face each other: the horizontal shot direction is the unit vector from the shooter's feet to the
// opponent's feet (wherever a fall, a blast or the build phase left them), never anything from a physics body's rotation.
export function facing(i, ap, op) {
  const f = i ? -1 : 1, dx = op[0] - ap[0], dz = op[2] - ap[2], h = Math.hypot(dx, dz);
  return h < 0.5 || dx * f <= 0 ? [f, 0] : [dx / h, dz / h]; // degenerate / crossed over: plain down-the-lane
}
export const yawOf = d => Math.atan2(-d[1], d[0]); // three.js rotation.y that turns the model's +x forward onto d
// aim: { pitch, power 0..1 }. No free sideways aim: the shot flies along the facing direction. Launch from wherever the archer now stands.
export function launch(i, aim, ap = initialPhys().a[i], op = initialPhys().a[1 - i]) {
  const [fx, fz] = facing(i, ap, op), cp = Math.cos(aim.pitch);
  const d = { x: fx * cp, y: Math.sin(aim.pitch), z: fz * cp };
  const v = MAXV * aim.power;
  return { pos: { x: ap[0] + d.x * 0.9, y: ap[1] + SHOULDER + d.y * 0.9, z: ap[2] + d.z * 0.9 }, vel: { x: d.x * v, y: d.y * v, z: d.z * v } };
}
export const PICKUP_R = 1.3;
function towerBoxes(b) { // loose AABB per side, for a cheap early-out
  const bx = [0, 1].map(() => [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]);
  b.forEach((q, i) => { if (parked(q)) return; const B = bx[LAYOUT[i].s]; for (let k = 0; k < 3; k++) { B[k] = Math.min(B[k], q[k] - 1.2); B[k + 3] = Math.max(B[k + 3], q[k] + 1.2); } });
  return bx;
}
function collide(world, p, shooter, st, t, tb, pickupTaken) {
  const a = st.phys.a;
  for (let i = 0; i < 2; i++) if (i !== shooter) { const part = archerHit(a[i], p); if (part) return { kind: part, who: i }; }
  if (st.pickup && !pickupTaken && Math.hypot(p.x - st.pickup.pos[0], p.y - st.pickup.pos[1], p.z - st.pickup.pos[2]) < PICKUP_R) return { kind: 'pickup', pickup: st.pickup.kind };
  for (let s = 0; s < 2; s++) { // own tower blocks are ignored right after release (you shoot over your own parapet)
    if (s === shooter && t < 0.35) continue;
    const B = tb[s];
    if (p.x < B[0] || p.y < B[1] || p.z < B[2] || p.x > B[3] || p.y > B[4] || p.z > B[5]) continue;
    for (let i = 0; i < BLOCKS; i++) if (LAYOUT[i].s === s && !parked(st.phys.b[i]) && inBlock(st.phys.b[i], LAYOUT[i].half, p)) return { kind: 'block', block: i };
  }
  if (world.solid(p)) return { kind: 'stone' };
  if (p.y <= world.groundH(p.x, p.z)) return { kind: 'ground' };
  if (Math.abs(p.x) > 85 || Math.abs(p.z) > 55 || p.y < -5) return { kind: 'out' };
  return null;
}
// st = { phys: { b, a }, pickup }. Returns { type, arrows: [{ t0, pts: [[x,y,z] every 1/60 s], res: { kind, who?, block?, pickup?, dmg, pos, dir, t } }] }
export function simulateShot(world, shooter, aim, wind, type = 'normal', st = { phys: initialPhys(), pickup: null }) {
  const T = ARROWS[type] || ARROWS.normal, DT = 1 / 240, out = [], tb = towerBoxes(st.phys.b);
  const { pos, vel } = launch(shooter, aim, st.phys.a[shooter], st.phys.a[1 - shooter]);
  const queue = [{ t0: 0, p: pos, v: vel, child: false }];
  let taken = false;
  while (queue.length) {
    const a = queue.shift(), p = a.p, v = a.v, pts = [[r2(p.x), r2(p.y), r2(p.z)]];
    let t = a.t0, res = null;
    for (let n = 1; n <= 12 * 240 && !res; n++) {
      const vy0 = v.y;
      v.x += wind.x * T.wind * DT; v.z += wind.z * T.wind * DT; v.y -= G * T.g * DT;
      p.x += v.x * DT; p.y += v.y * DT; p.z += v.z * DT; t += DT;
      if (T.split && !a.child && vy0 > 0 && v.y <= 0) { // split into 3 at the top of the arc: high, middle and low (vertical spread, same line)
        a.child = true;
        for (const s of [1, -1]) {
          const c = Math.cos(0.16 * s), sn = Math.sin(0.16 * s), h = Math.hypot(v.x, v.z), ux = v.x / h, uz = v.z / h, h2 = h * c - v.y * sn; // tilt within the shot's own vertical plane
          queue.push({ t0: t, p: { ...p }, v: { x: ux * h2, y: h * sn + v.y * c, z: v.z === 0 ? v.z : uz * h2 }, child: true });
        }
      }
      const hit = collide(world, p, shooter, st, t, tb, taken);
      if (hit) {
        if (hit.kind === 'pickup') taken = true;
        const sp = Math.hypot(v.x, v.y, v.z);
        res = { ...hit, dmg: hit.who !== undefined ? T.dmg[hit.kind === 'head' ? 1 : 0] : 0,
          pos: [r2(p.x), r2(p.y), r2(p.z)], dir: [v.x / sp, v.y / sp, v.z / sp].map(r2), speed: r2(sp), t: r2(t) };
        pts.push(res.pos);
      } else if (n % 4 === 0) pts.push([r2(p.x), r2(p.y), r2(p.z)]);
    }
    out.push({ t0: r2(a.t0), pts, res: res || { kind: 'out', dmg: 0, pos: pts[pts.length - 1], dir: [1, 0, 0], speed: 0, t: r2(t) } });
  }
  return { type: ARROWS[type] ? type : 'normal', arrows: out };
}
// ---------- sky power-ups ----------
// Every 2-4 turns (max one at a time) a power-up floats in the sky between the towers; hitting it grants a special for your next shots.
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const spawnDelay = rand => 2 + Math.floor(rand() * 3);
export function spawnPickup(rand) {
  return { kind: SPECIALS[Math.floor(rand() * SPECIALS.length)], pos: [r2((rand() * 2 - 1) * 6), r2(7 + rand() * 5), 0] };
}
// Combine a shot's arrow results with its physics result (falls, debris, blasts, spins) into the next round state. Used by server and hot-seat.
export function finishShot(prev, shooter, type, shot, phys, rand) {
  const hp = [...prev.hp], ammo = prev.ammo.map(a => ({ ...a }));
  let pickup = prev.pickup, spawnIn = prev.spawnIn, got = null;
  if (ARROWS[type] && ARROWS[type].special) ammo[shooter][type] = Math.max(0, ammo[shooter][type] - 1);
  for (const a of shot.arrows) {
    if (a.res.who !== undefined) hp[a.res.who] = Math.max(0, hp[a.res.who] - a.res.dmg);
    if (a.res.kind === 'pickup' && pickup && !got) { got = pickup.kind; ammo[shooter][got]++; pickup = null; spawnIn = spawnDelay(rand); }
  }
  for (const i of [0, 1]) hp[i] = Math.max(0, hp[i] - (phys.dmg[i] || 0));
  if (!pickup && !got && --spawnIn <= 0) { pickup = spawnPickup(rand); spawnIn = spawnDelay(rand); }
  return { hp, ammo, pickup, spawnIn, got, phys: phys.phys };
}
export const newRound = (rand, builds = null) => ({ hp: [HP, HP], phys: initialPhys(builds), ammo: [emptyAmmo(), emptyAmmo()], pickup: null, spawnIn: spawnDelay(rand) });
export const winnerOf = hp => (hp[0] <= 0 ? 1 : hp[1] <= 0 ? 0 : -1);
// Series: Single (1), Best of 3 or Best of 5. Returns the series winner or -1.
export const SERIES = [1, 3, 5];
export const seriesWinnerOf = (score, best) => score.findIndex(w => w >= Math.ceil(best / 2));
export const randomWind = () => ({ x: r2((Math.random() * 2 - 1) * 3.5), z: 0 }); // head/tail wind only, so wind never pushes a shot sideways
