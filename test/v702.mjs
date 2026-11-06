// v7.0.2: mid-lane solid scenery culled; power-ups still spawn between towers.
import * as sim from '../public/sim.js';
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok', m); };
const MID = sim.DIST - 5;
for (const id of sim.ARENA_IDS) {
  const w = sim.makeWorld(id), A = sim.ARENAS[id];
  for (const t of w.trees) assert(Math.abs(t.x) >= MID, `${id}: tree at x=${t.x} still in mid lane`);
  for (const t of w.tents) assert(Math.abs(t.x) >= MID, `${id}: tent at x=${t.x} still in mid lane`);
  for (const k of w.rocks) assert(Math.abs(k.x) >= MID, `${id}: rock at x=${k.x} still in mid lane`);
  if (w.treb) assert(Math.abs(w.treb.x) >= MID, `${id}: treb at x=${w.treb.x} still in mid lane`);
  for (const x of [-8, -4, 0, 4, 8]) for (const z of [-4, 0, 4]) {
    assert(!w.solid({ x, y: 1.5, z }), `${id}: solid hit at (${x},1.5,${z})`);
  }
  const before = A.trees.length + A.tents.length + A.rocks.length + 1;
  const after = w.trees.length + w.tents.length + w.rocks.length + (w.treb ? 1 : 0);
  assert(after < before, `${id}: some mid props were removed (${after}<${before})`);
  console.log('ok', id, 'kept', { trees: w.trees.length, tents: w.tents.length, rocks: w.rocks.length, treb: !!w.treb });
}
const p = sim.spawnPickup(sim.rng(3));
assert(p && p.kind && Math.abs(p.pos[0]) < sim.DIST, `power-up still between towers (${JSON.stringify(p)})`);
console.log('ok pickup', p);
console.log('PASS v7.0.2');
