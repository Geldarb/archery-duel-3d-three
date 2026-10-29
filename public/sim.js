// Shared simulation (no deps beyond looks.js): used by the browser (hot-seat) and the server (online rooms).
import { DEFAULT_BLOCK, isBlockColor } from './looks.js';
export const DIST = 15, HP = 100, MAXV = 26, G = 9.8;
// Each archer stands on top of a square tower built from loose stone blocks (every block is a rigid body, see physics.js).
export const WALL_H = 5, SHOULDER = 1.15;                 // tower-top floor height, bow-arm pivot height above the archer's feet
export const TOWER_HALF = 1.6, WALL_T = 0.8, COURSE_H = 0.92, COURSES = 5, SLAB_H = 0.4, MERLON_S = 0.7;
export const ARCHER_HALF = [0.28, 0.8, 0.28];              // archer physics box (feet at y - 0.8)
export const BUILD_MAX = 40, CELL = 0.8, PARK_Y = -40, SLOTS = 80;     // build phase: blocks per player, grid cell (= block size), parked-slot height
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
  for (const s of [0, 1]) for (let n = 0; n < SLOTS; n++) B(s, 'build', 0, PARK_Y, 0, CELL, CELL, CELL); // build-phase blocks: parked (no body, hidden) until placed
  return L;
})();
export const BLOCKS = LAYOUT.length;
export const parked = q => q[1] < PARK_Y / 2;
// physics snapshot: b = per block [x,y,z,qx,qy,qz,qw], a = per archer feet position [x,y,z]
// builds[s] = validated build-phase result { blocks: [[x,y,z]...], archer: [x,y,z] }: that side's classic tower is parked and the player's
// own tower (built from the ground up) is used instead. null = the classic 41-block tower (legacy layout, kept for the regression suites).
export function initialPhys(builds = null) {
  const b = LAYOUT.map(l => [...l.pos, 0, 0, 0, 1]), a = [[-DIST, WALL_H, 0], [DIST, WALL_H, 0]], k = { banana: [], bouncy: [], heavy: [], cloud: [], tramp: [], sz: {} }; // k: v6.1/v6.3 special build pieces (block indices)
  if (builds) for (const s of [0, 1]) {
    const B = builds[s]; if (!B) continue;
    LAYOUT.forEach((l, i) => { if (l.s === s && l.kind !== 'build') b[i] = [l.pos[0], PARK_Y, l.pos[2], 0, 0, 0, 1]; });
    B.blocks.forEach((p, n) => { b[BUILD_SLOT0[s] + n] = [p[0], p[1], p[2], 0, 0, 0, 1]; });
    a[s] = [...B.archer];
    (B.kinds || []).forEach((kd, n) => { if (k[kd]) k[kd].push(BUILD_SLOT0[s] + n); });
    (B.sizes || []).forEach((z, n) => { if (z > 1) k.sz[BUILD_SLOT0[s] + n] = z; }); // v7.0 big blocks
  }
  return { b, a, k };
}
// ---------- build phase (once per match / series): each player builds their own tower from the ground up ----------
// Blocks snap to a 0.8 m grid: a 6x6-column zone on your own side (centred where the classic tower stood, flat ground, far from the
// middle), up to BUILD_LEVELS high. A block sits on the ground or straight on top of another block (no floating, no overlaps). Cells are
// [gx, gz] (dropped onto the column) or [gx, gz, level] (must be exactly the column's next level). The archer starts on the ground and
// may stand on a 0.4 m grid on the ground or on any block top, centre fully supported. Pure + deterministic (server and both clients).
export const BUILD_GRID = 3, ARCHER_GRID = 5, BUILD_LEVELS = 8, BUILD_TOP = BUILD_LEVELS * CELL, BUILD_TIME = 60;
export const BUILD_SLOT0 = [0, 1].map(s => LAYOUT.findIndex(l => l.s === s && l.kind === 'build'));
export const defaultPlan = () => ({ blocks: [], colors: [], archer: [0, 0] });
// v7.0 block sizes: plan.sizes[n] = 1 | 2 | 3 (a z x z x z cube, min corner at [gx, gz]); costs z*z of the budget
export const SIZES = [1, 2, 3];
const halfZ = (H, z) => H.map(h => rd(h + (z - 1) * CELL / 2));
export const halfOf = (i, k) => { const z = k && k.sz && k.sz[i]; return z > 1 ? halfZ(LAYOUT[i].half, z) : LAYOUT[i].half; };
export const sizesOf = plan => plan.blocks.map((_, n) => (plan.sizes && plan.sizes[n]) || 1);
export const planCost = plan => sizesOf(plan).reduce((a, z) => a + z * z, 0);
export function footTop(plan, gx, gz, z) { // next free level under a z x z footprint (client mirror of validateBuild's column heights)
  const sz = sizesOf(plan); let top = 0;
  plan.blocks.forEach((c, n) => { const k = sz[n]; if (c[0] < gx + z && c[0] + k > gx && c[1] < gz + z && c[1] + k > gz) top = Math.max(top, (c.length > 2 ? c[2] : 0) + k); });
  return top;
}
// v7.0 Defend the Castle: 1 defender (80-block castle, wider zone) vs a squad of 3 attackers (10-block cover); attackers win only by killing
// the defender, the defender wins by surviving `turns` of their own shots or knocking out all 3. Then sides swap and the legs are compared.
export const CASTLE_MAX = 80, COVER_MAX = 10, CASTLE_GRID = 5, CASTLE_TIME = 90, SQUAD = 3, CASTLE_TURNS = [10, 15], SQUAD_Z = [-14, 0, 14];
export const COVER_GX = 6, COVER_GZ = 8; // v7.0.1: attackers get a much bigger zone (9.6 m along the field x 12.8 m deep), archers spread ~5.6 m apart
export const zoneOf = (s, mode) => { const c = !!mode && (mode.def === 0 || mode.def === 1), def = c && s === mode.def;
  const sq = c && !def, grid = def ? CASTLE_GRID : sq ? COVER_GX : BUILD_GRID, gz = sq ? COVER_GZ : grid;
  return { grid, gz, agrid: def ? 2 * CASTLE_GRID : sq ? 2 * COVER_GX : ARCHER_GRID, agz: def ? 2 * CASTLE_GRID : sq ? 2 * COVER_GZ : ARCHER_GRID, max: !c ? BUILD_MAX : def ? CASTLE_MAX : COVER_MAX, squad: c && !def, castle: def }; };
// v6.1 special build pieces (count toward BUILD_MAX): banana peel (archers who end up on it after a hit/fall slip) and bouncy castle
// (arrows bounce off it, anything landing on it gets bounced up). plan.kinds = optional per-block kind, validated with these limits.
// v6.3: no per-type caps any more (every piece just counts toward BUILD_MAX); + heavy stone (6x mass), cloud (floats, pops when hit), trampoline
export const PIECES = { block: { max: BUILD_MAX }, banana: { max: BUILD_MAX, name: 'Banana peel' }, bouncy: { max: BUILD_MAX, name: 'Bouncy castle' },
  heavy: { max: BUILD_MAX, name: 'Heavy stone' }, cloud: { max: BUILD_MAX, name: 'Cloud' }, tramp: { max: BUILD_MAX, name: 'Trampoline' } };
export const CLOUD_LV = 3, HEAVY_MASS = 6; // clouds float at least 3 levels up; heavy stone mass multiplier
// deterministic 0..1 hash (same on server and every client): trampoline bounce angles
export const hash01 = (a, b) => ((Math.imul(a | 0, 2654435761) ^ Math.imul((b | 0) + 7, 40503)) >>> 0) % 10007 / 10007;
// Skip / quick play: a ready-made 30-block tower (2x2 keep, 6 high, plus a 2x1x3 front buttress), archer on the keep top (4.8 m).
export function autoPlan(s, color = DEFAULT_BLOCK, mode = null) {
  const z0 = zoneOf(s, mode);
  if (z0.castle || z0.squad) { // v7.0 auto castle (80) / auto cover wall (10), laid out for side 0 then mirrored
    const B = [], add = (gx, gz, lv, z = 1, kd = 'block') => B.push({ gx, gz, lv, z, kd });
    if (z0.castle) {
      for (const lv of [0, 2, 4]) add(-1, -1, lv, 2, 'heavy'); // 2x2 heavy keep, 6 high: the defender stands on top
      for (let lv = 0; lv < 3; lv++) {
        for (let gz = -4; gz <= 3; gz++) add(2, gz, lv); // front wall
        if (lv < 2) for (let gx = -4; gx <= 1; gx++) { add(gx, -4, lv); add(gx, 3, lv); } // side walls
        if (lv === 0 || lv === 2) { add(3, -5, lv, 2); add(3, 3, lv, 2); } // big corner towers
      }
      for (let gz = -2; gz <= 1; gz++) add(-5, gz, 0, 1, 'tramp');
    } else {
      for (const c of SQUAD_Z.map(k => k / 2)) { add(1, c - 1, 0); add(1, c, 0); add(1, c - 1, 1); } // a short wall in front of each attacker
      add(1, 0, 1);
    }
    const blocks = B.map(b => [s ? -b.gx - b.z : b.gx, b.gz, b.lv]);
    const squad = z0.squad ? SQUAD_Z.map(k => [0, k]) : undefined;
    return { blocks, sizes: B.map(b => b.z), kinds: B.map(b => b.kd), colors: B.map(() => (isBlockColor(color) ? color : DEFAULT_BLOCK)), archer: [0, z0.squad ? SQUAD_Z[0] : 0], ...(squad ? { squad } : {}) };
  }
  const blocks = [], front = s ? -2 : 1;
  for (let y = 0; y < 6; y++) {
    for (const gx of [-1, 0]) for (const gz of [-1, 0]) blocks.push([gx, gz, y]);
    if (y < 3) for (const gz of [-1, 0]) blocks.push([front, gz, y]);
    if (y < 3) for (const gz of [-1, 0]) blocks.push([s ? 1 : -2, gz, y]); // v6.3: 40-block budget, back buttress
    if (y < 2) for (const gx of [-1, 0]) blocks.push([gx, 1, y]);
  }
  return { blocks, colors: blocks.map(() => (isBlockColor(color) ? color : DEFAULT_BLOCK)), archer: [0, 0] };
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
const sizedPos = (s, gx, gz, level, z) => [rd(towerX(s) + (gx + z / 2) * CELL), rd((level + z / 2) * CELL), rd((gz + z / 2) * CELL)];
export const cellPos = (s, gx, gz, level) => [rd(towerX(s) + (gx + 0.5) * CELL), rd((level + 0.5) * CELL), rd((gz + 0.5) * CELL)];
export function validateBuild(s, plan, mode = null) {
  const Z = zoneOf(s, mode), G = Z.grid;
  const fail = (err, at = -1) => ({ ok: false, err, at });
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.blocks)) return fail('Bad plan');
  const zs = plan.sizes; // v7.0 optional per-block size
  if (zs !== undefined && (!Array.isArray(zs) || zs.length !== plan.blocks.length || !zs.every(z => SIZES.includes(z)))) return fail('Bad block size');
  if (plan.blocks.length > SLOTS || planCost(plan) > Z.max) return fail(`Only ${Z.max} blocks`);
  const cl = plan.colors; // v5.3: optional per-block colour ids (missing = sandstone), only from the palette
  if (cl !== undefined && (!Array.isArray(cl) || cl.length !== plan.blocks.length || !cl.every(isBlockColor))) return fail('Bad block colour');
  const kd = plan.kinds; // v6.1: optional per-block piece kind
  if (kd !== undefined && (!Array.isArray(kd) || kd.length !== plan.blocks.length || !kd.every(x => Object.hasOwn(PIECES, x)))) return fail('Bad build piece');
  if (kd) for (const x of ['banana', 'bouncy']) if (kd.filter(y => y === x).length > PIECES[x].max) return fail(`Only ${PIECES[x].max} ${PIECES[x].name.toLowerCase()} pieces`);
  const H = LAYOUT[BUILD_SLOT0[s]].half, boxes = [], out = [], cols = new Map();
  for (let n = 0; n < plan.blocks.length; n++) {
    const c = plan.blocks[n], z = zs ? zs[n] : 1;
    if (!Array.isArray(c) || c.length < 2 || c.length > 3 || !isInt(c[0], -G, G - z) || !isInt(c[1], -Z.gz, Z.gz - z)) return fail('Outside your build zone', n);
    let lv = 0; for (let dx = 0; dx < z; dx++) for (let dz = 0; dz < z; dz++) lv = Math.max(lv, cols.get((c[0] + dx) + ',' + (c[1] + dz)) || 0);
    const want = c.length === 3 ? c[2] : lv;
    if (!Number.isInteger(want) || want < 0) return fail('Bad block', n);
    const at = sizedPos(s, c[0], c[1], Math.min(want, BUILD_LEVELS), z);
    if (want > lv && !(kd && kd[n] === 'cloud')) return { ...fail('No floating blocks: it needs support underneath', n), pos: at };
    if (want < lv) return { ...fail('That spot is taken', n), pos: at };
    if (want + z > BUILD_LEVELS) return { ...fail(`Too high (max ${BUILD_LEVELS} blocks)`, n), pos: at };
    for (let dx = 0; dx < z; dx++) for (let dz = 0; dz < z; dz++) cols.set((c[0] + dx) + ',' + (c[1] + dz), want + z);
    out.push(at); boxes.push(box(at, halfZ(H, z)));
  }
  const a = plan.archer || [0, 0];
  const inA = q => Array.isArray(q) && isInt(q[0], -Z.agrid, Z.agrid) && isInt(q[1], -Z.agz, Z.agz);
  if (!inA(a)) return fail('Archer must stay in your build zone');
  const sp = Z.squad ? (plan.squad === undefined ? SQUAD_Z.map(k => [a[0], k]) : plan.squad) : null; // v7.0.1: each attacker placed on its own
  if (sp && (!Array.isArray(sp) || sp.length !== SQUAD || !sp.every(inA))) return fail('Archers must stay in your build zone');
  if (sp && sp.some((p, i) => sp.some((q, j) => j > i && Math.abs(p[0] - q[0]) < 2 && Math.abs(p[1] - q[1]) < 2))) return fail('Archers are too close together');
  const spot = (az, gx = a[0]) => { const ax = towerX(s) + gx * 0.4, sf = surface(boxes, ax, az, ARCHER_HALF[0], ARCHER_HALF[2]); return sf.on ? [rd(ax), rd(sf.top), rd(az)] : null; };
  const squad = sp ? sp.map(q => spot(q[1] * 0.4, q[0])) : null; // v7.0 attackers: 3 archers, each anywhere in the zone
  const ap = squad ? squad[0] : spot(a[1] * 0.4);
  if (!ap || (squad && squad.some(q => !q))) return { ...fail(squad ? 'Your 3 archers need solid ground (move them)' : 'Archer needs solid stone underfoot'), pos: out.at(-1) };
  return { ok: true, sizes: plan.blocks.map((_, n) => (zs ? zs[n] : 1)), squad, blocks: out, colors: plan.blocks.map((_, n) => (cl ? cl[n] : DEFAULT_BLOCK)), kinds: plan.blocks.map((_, n) => (kd ? kd[n] : 'block')), archer: ap };
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
  // v6.0 fun batch. chicken: bounces off up to 2 surfaces (light shove on blocks), small damage on an archer.
  chicken: { name: 'Chicken', dmg: [8, 12], push: 7, g: 1.05, wind: 1.2, special: true, land: 'bounce', bounces: 2, rest: 0.55 },
  // cow: lobbed, flattens what it lands on (radial + downward shove) and hurts archers near the impact.
  cow: { name: 'Cow', dmg: [10, 10], push: 0, g: 1.35, wind: 0.2, special: true, land: 'cow', radius: 3, power: 18, cowDmg: 24 },
  // boot: a giant boot drops from the sky onto the landing spot (or the enemy tower at the aim line) `delay` steps later and stomps.
  boot: { name: 'Giant Boot', dmg: [8, 8], push: 6, g: 1, wind: 0.8, special: true, land: 'boot', radius: 2.4, power: 22, bootDmg: 20, delay: 36 },
  // v6.1 fun drop 2 (effects resolved in physics.js shotEvents + funEffects below; statuses live in st.fx[i]).
  // pigeon: wherever it lands, a flock flies over the enemy and poops on them: small damage + splattered aim (no preview / guide) next turn.
  pigeon: { name: 'Pigeons', dmg: [6, 8], push: 4, g: 0.9, wind: 1.1, special: true, land: 'pigeon', delay: 45, pigeonDmg: 6 },
  // toilet roll: a direct hit or a landing within `radius` of the enemy wraps them up: they skip their next shot.
  toilet: { name: 'Toilet Roll', dmg: [6, 9], push: 5, g: 1, wind: 1, special: true, land: 'toilet', radius: 2.4, wrapDmg: 5 },
  // disco: the enemy tower flashes and dances (small periodic shoves) for this shot and their whole next turn.
  disco: { name: 'Disco', dmg: [5, 5], push: 4, g: 1, wind: 0.8, special: true, land: 'disco', pulses: 12, every: 20, sway: 0.18 },
  // big head: the enemy's head grows (2x hitbox, head hits +25%) for your next 2 shots.
  bighead: { name: 'Big Head', dmg: [5, 5], push: 4, g: 1, wind: 0.8, special: true, land: 'bighead', turns: 2 },
  // grandma: lands, runs to the enemy tower and smacks its base with her handbag (strong pushes), then hobbles off.
  grandma: { name: 'Grandma', dmg: [6, 6], push: 4, g: 1.2, wind: 0.5, special: true, land: 'grandma', run: 80, smacks: 4, every: 34, power: 7, smackDmg: 3 },
};
export const BIG_HEAD = 2, NECK_Y = 1.25; // big-head scale (head pivots at the neck)
export const bigOf = (st, i) => (st && (st.big || (st.fx && st.fx[i] && st.fx[i].big > 0)) ? BIG_HEAD : 1);
export const emptyFx = () => ({ splat: 0, wrap: 0, disco: 0, big: 0 });
export const SPECIALS = Object.keys(ARROWS).filter(k => ARROWS[k].special);
// v6.2 easter egg: a player named 'jesus' (any case, trimmed) may fire any special, every turn (st.jesus[i] = 1, set from the names).
export const isJesus = l => !!l && String(l.name ?? '').trim().toLowerCase() === 'jesus';
export const canFire = (st, i, type) => !!ARROWS[type] && (!ARROWS[type].special || (st.ammo[i][type] > 0) || !!(st.jesus && st.jesus[i]));
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

export function archerHit(ap, p, big = 1) { // chunky, big-headed archer whose feet are at ap = [x, y, z]; big = v6.1 head scale
  const r2d = (p.x - ap[0]) ** 2 + (p.z - ap[2]) ** 2, y = p.y - ap[1];
  if ((y - (NECK_Y + 0.3 * big)) ** 2 + r2d < (0.36 * big) ** 2) return 'head';
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
const STEP60 = 1 / 60; // = physics.js STEP
function towerBoxes(b) { // loose AABB per side, for a cheap early-out
  const bx = [0, 1].map(() => [1e9, 1e9, 1e9, -1e9, -1e9, -1e9]);
  b.forEach((q, i) => { if (parked(q)) return; const B = bx[LAYOUT[i].s]; for (let k = 0; k < 3; k++) { B[k] = Math.min(B[k], q[k] - 2.6); B[k + 3] = Math.max(B[k + 3], q[k] + 2.6); } });
  return bx;
}
function collide(world, p, shooter, st, t, tb, pickupTaken) {
  const a = st.phys.a;
  for (let i = 0; i < 2; i++) if (i !== shooter) { const part = archerHit(a[i], p, bigOf(st, i)); if (part) return { kind: part, who: i }; }
  const c = st.castle; // v7.0.1: the defender can hit every living attacker, not just the active one
  if (c && shooter === c.def) { const q = c.squad; for (let k = 0; k < q.pos.length; k++) if (k !== q.act && q.hp[k] > 0) { const part = archerHit(q.pos[k], p, 1); if (part) return { kind: part, who: 1 - c.def, sq: k }; } }
  if (st.pickup && !pickupTaken && Math.hypot(p.x - st.pickup.pos[0], p.y - st.pickup.pos[1], p.z - st.pickup.pos[2]) < PICKUP_R) return { kind: 'pickup', pickup: st.pickup.kind };
  for (let s = 0; s < 2; s++) { // own tower blocks are ignored right after release (you shoot over your own parapet)
    if (s === shooter && t < 0.35) continue;
    const B = tb[s];
    if (p.x < B[0] || p.y < B[1] || p.z < B[2] || p.x > B[3] || p.y > B[4] || p.z > B[5]) continue;
    for (let i = 0; i < BLOCKS; i++) if (LAYOUT[i].s === s && !parked(st.phys.b[i]) && inBlock(st.phys.b[i], halfOf(i, st.phys.k), p)) return { kind: 'block', block: i };
  }
  if (world.solid(p)) return { kind: 'stone' };
  if (p.y <= world.groundH(p.x, p.z)) return { kind: 'ground' };
  if (Math.abs(p.x) > 85 || Math.abs(p.z) > 55 || p.y < -5) return { kind: 'out' };
  return null;
}
// st = { phys: { b, a }, pickup }. Returns { type, arrows: [{ t0, pts: [[x,y,z] every 1/60 s], res: { kind, who?, block?, pickup?, dmg, pos, dir, t } }] }
export function simulateShot(world, shooter, aim, wind, type = 'normal', st = { phys: initialPhys(), pickup: null }) {
  const T = ARROWS[type] || ARROWS.normal, DT = 1 / 240, out = [], tb = towerBoxes(st.phys.b), bouncy = new Set((st.phys.k && st.phys.k.bouncy) || []), tramp = new Set((st.phys.k && st.phys.k.tramp) || []);
  const { pos, vel } = launch(shooter, aim, st.phys.a[shooter], st.phys.a[1 - shooter]);
  const queue = [{ t0: 0, p: pos, v: vel, child: false }];
  let taken = false;
  while (queue.length) {
    const a = queue.shift(), p = a.p, v = a.v, pts = [[r2(p.x), r2(p.y), r2(p.z)]], bounces = [];
    let t = a.t0, res = null;
    for (let n = 1; n <= 12 * 240 && !res; n++) {
      const vy0 = v.y, px = p.x, py = p.y, pz = p.z;
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
      if (hit && hit.kind === 'block' && tramp.has(hit.block) && bounces.filter(x => x.boing).length < 3 && Math.hypot(v.x, v.y, v.z) > 2) {
        // v6.3 trampoline: launches the projectile back up at a random-ish (deterministic) angle
        const sp = Math.hypot(v.x, v.y, v.z), r = hash01(n, hit.block), r2_ = hash01(hit.block, n), yaw = (r - 0.5) * 2.4, h = Math.hypot(v.x, v.z) || 1;
        bounces.push({ kind: 'block', block: hit.block, boing: true, tramp: true, pos: [r2(p.x), r2(p.y), r2(p.z)], dir: [v.x / sp, v.y / sp, v.z / sp].map(r2), t: r2(t) });
        const hs = sp * (0.35 + 0.4 * r2_), ux = v.x / h, uz = v.z / h, c = Math.cos(yaw), sn = Math.sin(yaw);
        v.x = (ux * c - uz * sn) * hs * (r2_ < 0.35 ? -1 : 1); v.z = (ux * sn + uz * c) * hs; v.y = Math.max(5, sp * (0.6 + 0.3 * r));
        p.x = px; p.y = py; p.z = pz;
        if (n % 4 === 0) pts.push([r2(p.x), r2(p.y), r2(p.z)]);
        continue;
      }
      if (hit && hit.kind === 'block' && bouncy.has(hit.block) && bounces.filter(x => x.boing).length < 2 && Math.hypot(v.x, v.y, v.z) > 2) {
        // v6.1 bouncy castle: every projectile bounces off it (boing), keeps 80% of its speed
        const sp = Math.hypot(v.x, v.y, v.z), nrm = bounceNormal(hit, p, v, st), dot = v.x * nrm[0] + v.y * nrm[1] + v.z * nrm[2];
        bounces.push({ kind: 'block', block: hit.block, boing: true, pos: [r2(p.x), r2(p.y), r2(p.z)], dir: [v.x / sp, v.y / sp, v.z / sp].map(r2), t: r2(t) });
        if (dot < 0) { v.x -= 2 * dot * nrm[0]; v.y -= 2 * dot * nrm[1]; v.z -= 2 * dot * nrm[2]; }
        v.x *= 0.8; v.y = Math.max(v.y * 0.8, 3); v.z *= 0.8;
        p.x = px; p.y = py; p.z = pz;
        if (n % 4 === 0) pts.push([r2(p.x), r2(p.y), r2(p.z)]);
        continue;
      }
      if (hit && T.bounces && bounces.length < T.bounces && ['block', 'stone', 'ground'].includes(hit.kind) && Math.hypot(v.x, v.y, v.z) > 3) {
        // rubber chicken: reflect off the surface (deterministic, same on server and clients) and keep flying
        const sp = Math.hypot(v.x, v.y, v.z), nrm = bounceNormal(hit, p, v, st), dot = v.x * nrm[0] + v.y * nrm[1] + v.z * nrm[2];
        bounces.push({ kind: hit.kind, block: hit.block, pos: [r2(p.x), r2(p.y), r2(p.z)], dir: [v.x / sp, v.y / sp, v.z / sp].map(r2), t: r2(t) });
        if (dot < 0) { v.x -= 2 * dot * nrm[0]; v.y -= 2 * dot * nrm[1]; v.z -= 2 * dot * nrm[2]; }
        v.x *= T.rest; v.y = Math.max(v.y * T.rest, 2.5); v.z *= T.rest; // always pop up a little
        p.x = px; p.y = Math.max(py, hit.kind === 'ground' ? world.groundH(px, pz) + 0.05 : py); p.z = pz;
        if (n % 4 === 0) pts.push([r2(p.x), r2(p.y), r2(p.z)]);
        continue;
      }
      if (hit) {
        if (hit.kind === 'pickup') taken = true;
        const sp = Math.hypot(v.x, v.y, v.z);
        const big = hit.who !== undefined && hit.kind === 'head' && bigOf(st, hit.who) > 1; // v6.1: big-head hits +25%
        res = { ...hit, dmg: hit.who !== undefined ? Math.round(T.dmg[hit.kind === 'head' ? 1 : 0] * (big ? 1.25 : 1)) : 0, ...(big ? { big: true } : {}),
          pos: [r2(p.x), r2(p.y), r2(p.z)], dir: [v.x / sp, v.y / sp, v.z / sp].map(r2), speed: r2(sp), t: r2(t) };
        pts.push(res.pos);
      } else if (n % 4 === 0) pts.push([r2(p.x), r2(p.y), r2(p.z)]);
    }
    const arrow = { t0: r2(a.t0), pts, res: res || { kind: 'out', dmg: 0, pos: pts[pts.length - 1], dir: [1, 0, 0], speed: 0, t: r2(t) } };
    if (bounces.length) arrow.bounces = bounces;
    if (T.land === 'boot' && arrow.res.kind !== 'pickup') { // where the giant boot comes down
      const r = arrow.res, e = st.phys.a[1 - shooter];
      if (r.kind !== 'out') arrow.res.bootAt = r.pos;
      else { // flew off: stomp the enemy tower area on the aim line (the trajectory point nearest the enemy's x)
        let best = pts[0]; for (const q of pts) if (Math.abs(q[0] - e[0]) < Math.abs(best[0] - e[0])) best = q;
        const bz = Math.max(e[2] - 1.5, Math.min(e[2] + 1.5, best[2]));
        arrow.res.bootAt = [r2(e[0]), r2(Math.max(world.groundH(e[0], bz), e[1])), r2(bz)];
      }
    }
    out.push(arrow);
  }
  const shot = { type: ARROWS[type] ? type : 'normal', shooter, arrows: out };
  if (st.swap) { const w = warpTarget(world, shooter, shot, st); if (w && w.p) shot.warp = w; else if (w) shot.noWarp = w.why; } // v6.2 Arrow Becomes You
  return shot;
}
// ---------- v6.2 'Arrow Becomes You' mode: the shooter swaps places with their arrow ----------
// Where the main arrow stopped (block / scenery / ground / the enemy). Lost off-map, sailed past the enemy or caught a power-up = no swap. The spot is clamped to
// the playable field, kept out of the river and never past the enemy (so the archers still face each other); physics.js puts the feet on
// top of whatever block column is under it when the swap happens, and a landing right next to the enemy gives a melee BONK.
export const WARP = { field: [DIST + 5, 8], river: 3.1, behind: 0.9, nearEnemy: 0.85, bonkR: 1.7, bonkDmg: 12, delay: 14 };
export function warpTarget(world, shooter, shot, st) { // -> { who, k, from, p } or { why } when there's no swap
  const a = shot.arrows[0], r = a && a.res, T = ARROWS[shot.type] || ARROWS.normal;
  if (!r || r.kind === 'out' || r.kind === 'pickup') return { why: r ? r.kind : 'out' }; // lost off the map / caught a power-up: no swap
  const me = st.phys.a[shooter], e = st.phys.a[1 - shooter], f = shooter ? -1 : 1;
  let x = r.pos[0], z = r.pos[2];
  if (r.who !== undefined) { // direct hit: you pop up right next to them (on the side you shot from)
    const dx = me[0] - e[0], dz = me[2] - e[2], h = Math.hypot(dx, dz) || 1; x = e[0] + dx / h * WARP.nearEnemy; z = e[2] + dz / h * WARP.nearEnemy;
  }
  else if ((r.kind === 'ground' || r.kind === 'stone') && (x - e[0]) * f > -WARP.behind) return { why: 'past' }; // sailed past them: lost behind the enemy
  const [FX, FZ] = WARP.field;
  x = Math.max(-FX, Math.min(FX, x)); z = Math.max(-FZ, Math.min(FZ, z));
  const rx = world.riverX(z), d = x - rx; // no standing in the river: step out onto the nearer bank
  if (Math.abs(d) < WARP.river) x = rx + (d === 0 ? -f : Math.sign(d)) * WARP.river;
  if ((x - e[0]) * f > -WARP.behind) x = e[0] - f * WARP.behind; // never past the enemy
  const k = Math.ceil(r.t / STEP60 - 1e-6) + WARP.delay + (T.land === 'boot' ? T.delay : 0); // after the impact (and after the boot comes down)
  return { who: shooter, k, from: [...me].map(r2), p: [r2(x), r2(Math.max(0, world.groundH(x, z))), r2(z)] };
}
function bounceNormal(hit, p, v, st) { // surface normal for a bounce: ground = up, block = its face nearest the hit point, scenery = straight back
  if (hit.kind === 'ground') return [0, 1, 0];
  if (hit.kind === 'block') {
    const b = st.phys.b[hit.block], h = halfOf(hit.block, st.phys.k), d = [p.x - b[0], p.y - b[1], p.z - b[2]];
    let ax = 0, best = -1; for (let k = 0; k < 3; k++) { const r = Math.abs(d[k]) / h[k]; if (r > best) { best = r; ax = k; } }
    const n = [0, 0, 0]; n[ax] = Math.sign(d[ax]) || 1; return n;
  }
  const s = Math.hypot(v.x, v.y, v.z) || 1; return [-v.x / s, -v.y / s, -v.z / s];
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
  const sqd = [0, 0, 0];
  for (const a of shot.arrows) {
    if (a.res.sq !== undefined) sqd[a.res.sq] += a.res.dmg; // v7.0.1: a waiting attacker was hit
    else if (a.res.who !== undefined) hp[a.res.who] = Math.max(0, hp[a.res.who] - a.res.dmg);
    if (a.res.kind === 'pickup' && pickup && !got) { got = pickup.kind; ammo[shooter][got]++; pickup = null; spawnIn = spawnDelay(rand); }
  }
  for (const i of [0, 1]) hp[i] = Math.max(0, hp[i] - (phys.dmg[i] || 0));
  if (!pickup && !got && --spawnIn <= 0) { pickup = spawnPickup(rand); spawnIn = spawnDelay(rand); }
  const castle = castleAfter(prev, shooter, hp, phys.phys, sqd);
  return { hp, ammo, pickup, spawnIn, got, phys: phys.phys, fx: funEffects(prev, shooter, type, shot), big: prev.big || 0, swap: prev.swap || 0, jesus: prev.jesus || [0, 0], ...(castle ? { castle } : {}) };
}
// v6.1 status effects per player (st.fx[i]): splat (pigeon: no aim preview on their next turn), wrap (toilet roll: skip their next
// shot), disco (their tower dances through their next shot), big (big head: for the shooter's next `turns` shots at them).
export const wrapHit = (prev, shooter, shot) => { // toilet roll: direct hit, or a landing near the enemy (pre-shot position)
  const e = 1 - shooter, ap = prev.phys.a[e], R = ARROWS.toilet.radius;
  return shot.arrows.some(a => a.res.who === e || (a.res.kind !== 'out' && a.res.kind !== 'pickup' && Math.hypot(a.res.pos[0] - ap[0], a.res.pos[1] - ap[1] - 0.8, a.res.pos[2] - ap[2]) < R));
};
export function funEffects(prev, shooter, type, shot) {
  const fx = (prev.fx || [emptyFx(), emptyFx()]).map(f => ({ ...emptyFx(), ...f })), me = fx[shooter], en = fx[1 - shooter];
  me.splat = 0; me.disco = 0; // their effects lasted for this, their own shot
  en.big = Math.max(0, en.big - 1); // one of your shots at the big head used up
  if (type === 'pigeon') en.splat = 1;
  if (type === 'disco') en.disco = 1;
  if (type === 'bighead') en.big = ARROWS.bighead.turns;
  if (type === 'toilet' && wrapHit(prev, shooter, shot)) en.wrap = 1;
  return fx;
}
// Whose turn is next: normally the other player; a wrapped-up player skips once (the wrap is used up). Mutates st.fx.
export function nextTurn(st, shooter) {
  const o = 1 - shooter;
  if (st.fx && st.fx[o] && st.fx[o].wrap > 0) { st.fx[o].wrap = 0; return { turn: shooter, skipped: o }; }
  return { turn: o, skipped: -1 };
}
export const roundState = n => ({ hp: n.hp, phys: n.phys, ammo: n.ammo, pickup: n.pickup, spawnIn: n.spawnIn, fx: n.fx, big: n.big, swap: n.swap || 0, jesus: n.jesus || [0, 0], ...(n.castle ? { castle: n.castle } : {}) }); // what's carried between shots
export const newRound = (rand, builds = null, opts = {}) => withCastle({ hp: [HP, HP], phys: initialPhys(builds), ammo: [emptyAmmo(), emptyAmmo()], pickup: null, spawnIn: spawnDelay(rand), fx: [emptyFx(), emptyFx()], big: opts.big ? 1 : 0,
  swap: opts.swap ? 1 : 0, jesus: [0, 1].map(i => (opts.jesus && opts.jesus[i] ? 1 : 0)) }, opts.castle, builds); // v6.2: Arrow Becomes You mode, jesus egg
export const winnerOf = (hp, st) => { const c = st && st.castle; // v7.0 castle: defender dead = attackers win; squad wiped out or turns survived = defender wins
  if (c) return hp[c.def] <= 0 ? 1 - c.def : hp[1 - c.def] <= 0 || c.done >= c.turns ? c.def : -1;
  return hp[0] <= 0 ? 1 : hp[1] <= 0 ? 0 : -1; };
function withCastle(st, opt, builds) { // opt = { def, turns }
  if (!opt || !(opt.def === 0 || opt.def === 1)) return st;
  const a = 1 - opt.def, tx = towerX(a), sq = (builds && builds[a] && builds[a].squad) || SQUAD_Z.map(k => [tx, 0, k * 0.4]);
  st.castle = { def: opt.def, turns: CASTLE_TURNS.includes(opt.turns) ? opt.turns : CASTLE_TURNS[0], done: 0, squad: { hp: [HP, HP, HP], pos: sq.map(p => [...p]), act: 0 } };
  st.phys.a[a] = [...sq[0]];
  return st;
}
export function pickAttacker(st, who) { // the attacker chooses which of their 3 archers shoots (mutates st); false if not allowed
  const c = st && st.castle; if (!c || !Number.isInteger(who)) return false;
  const a = 1 - c.def, q = c.squad;
  if (who < 0 || who >= SQUAD || who === q.act || !(q.hp[who] > 0)) return false;
  q.pos[q.act] = [...st.phys.a[a]]; q.hp[q.act] = st.hp[a]; q.act = who; st.phys.a[a] = [...q.pos[who]]; st.hp[a] = q.hp[who];
  return true;
}
function castleAfter(prev, shooter, hp, ph, sqd = [0, 0, 0]) { // count defender turns, sync the active attacker, bring on the next one after a knockout
  const c0 = prev.castle; if (!c0) return null;
  const c = { ...c0, squad: { hp: [...c0.squad.hp], pos: c0.squad.pos.map(p => [...p]), act: c0.squad.act } }, a = 1 - c.def, q = c.squad;
  if (shooter === c.def) c.done++;
  q.hp[q.act] = hp[a]; q.pos[q.act] = [...ph.a[a]];
  q.hp.forEach((h, k) => { if (k !== q.act) q.hp[k] = Math.max(0, h - (sqd[k] || 0)); });
  if (hp[a] <= 0 && hp[c.def] > 0) { const nx = q.hp.findIndex(h => h > 0); if (nx >= 0) { q.act = nx; ph.a[a] = [...q.pos[nx]]; hp[a] = q.hp[nx]; } }
  return c;
}
export const legResult = (st, w) => { const c = st.castle; return { def: c.def, held: w === c.def ? c.turns : c.done, survived: w === c.def, hp: Math.max(0, st.hp[c.def]), ko: c.squad.hp.filter(h => h <= 0).length }; };
export function castleOverall(legs) { // whose castle held longer; ties: more HP left, then more attackers knocked out; 2 = draw
  const by = [0, 1].map(p => legs.find(l => l.def === p)); if (!by[0] || !by[1]) return -1;
  for (const k of ['held', 'hp', 'ko']) { const d = by[0][k] - by[1][k]; if (d) return d > 0 ? 0 : 1; }
  return 2;
}
// Series: Single (1), Best of 3 or Best of 5. Returns the series winner or -1.
export const SERIES = [1, 3, 5];
export const seriesWinnerOf = (score, best) => score.findIndex(w => w >= Math.ceil(best / 2));
export const randomWind = () => ({ x: r2((Math.random() * 2 - 1) * 3.5), z: 0 }); // head/tail wind only, so wind never pushes a shot sideways
