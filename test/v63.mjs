// v6.3 checks: heavy stone / cloud / trampoline build pieces + the 40-block shared budget (no per-piece caps).
// Usage: node test/v63.mjs <baseUrl> <outDir> [prefix]   Build palette is checked at 360x640 and 740x360.
import { createRequire } from 'module';
import fs from 'fs';
import * as sim from '../public/sim.js';
import * as phys from '../public/physics.js';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3963', out = 'shots/v63', pre = 'v63'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const errors = [], sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok', m); };

// ---------------- 0. rules (node) ----------------
{
  assert(sim.BUILD_MAX === 40 && sim.autoPlan(0).blocks.length === 40 && sim.validateBuild(0, sim.autoPlan(0)).ok && sim.validateBuild(1, sim.autoPlan(1)).ok, 'rules: 40-block budget, quick-play tower uses all 40');
  const forty = { blocks: Array.from({ length: 40 }, (_, i) => [i % 6 - 3, Math.floor(i / 6) % 6 - 3, Math.floor(i / 36)]), archer: [0, 0] };
  for (const k of ['banana', 'bouncy', 'heavy', 'cloud', 'tramp']) assert(sim.validateBuild(0, { ...forty, kinds: forty.blocks.map(() => k) }).ok, `rules: 40 ${k} pieces allowed (no per-type cap)`);
  assert(/40/.test(sim.validateBuild(0, { ...forty, blocks: [...forty.blocks, [2, 2, 1]], kinds: [...forty.blocks.map(() => 'block'), 'block'] }).err), 'rules: a 41st piece is refused');
  assert(/floating/.test(sim.validateBuild(0, { blocks: [[0, 0, 3]], kinds: ['block'], archer: [0, 0] }).err), 'rules: a plain block still cannot float');
  const cp = { blocks: [[0, 0, 3], [0, 0, 4], [-3, -3, 0], [-2, -2, 0]], kinds: ['cloud', 'block', 'block', 'heavy'], archer: [5, 5] }, cr = sim.validateBuild(0, cp);
  assert(cr.ok && cr.blocks[0][1] > 2.5, `rules: a cloud floats 3 levels up and a block may rest on it (${cr.err || cr.blocks[0]})`);
  const run = (res, ev) => { const r = new phys.PhysRun(sim.initialPhys([res, null]), ev); r.run(); return r; };
  const S0 = sim.BUILD_SLOT0[0], hitEv = (i, pos, j = [14, 1.7, 0]) => [{ k: 0, kind: 'hit', i, j, p: pos }];
  // heavy stone vs plain block, same shove
  const one = k => sim.validateBuild(0, { blocks: [[-3, -3, 0]], kinds: [k], archer: [5, 5] });
  const moved = k => { const r = one(k), p = r.blocks[0], q = run(r, hitEv(S0, p)).snapshot().b[S0]; return Math.hypot(q[0] - p[0], q[2] - p[2]); };
  const mb = moved('block'), mh = moved('heavy');
  assert(mh < mb * 0.35, `rules: heavy stone barely budges (${mh.toFixed(2)} m vs ${mb.toFixed(2)} m)`);
  // cloud stays put (with its load) until hit, then pops and the load falls
  const calm = run(cr, hitEv(S0 + 2, cr.blocks[2])).snapshot().b;
  assert(Math.abs(calm[S0][1] - cr.blocks[0][1]) < 0.01 && Math.abs(calm[S0 + 1][1] - cr.blocks[1][1]) < 0.05, 'rules: cloud (and the block on it) stays floating');
  const pr = run(cr, hitEv(S0, cr.blocks[0])), pb = pr.snapshot().b;
  assert(sim.parked(pb[S0]) && pr.fx.some(f => f.kind === 'pop') && pb[S0 + 1][1] < 1, `rules: hit cloud pops, the block on it falls (y ${pb[S0 + 1][1].toFixed(2)})`);
  // trampoline: arrows bounce off at random-ish angles, deterministically
  const ap = sim.autoPlan(0), tr = sim.validateBuild(0, { ...ap, kinds: ap.blocks.map(() => 'tramp') });
  const st = sim.newRound(sim.rng(3), null, { builds: [tr, null] }); st.phys = sim.initialPhys([tr, null]);
  const w = sim.makeWorld('field'); let tb = null;
  for (let pd = 3; pd <= 40 && !tb; pd++) for (let pw = 0.5; pw <= 1 && !tb; pw += 0.01) {
    const s = sim.simulateShot(w, 1, { pitch: pd * Math.PI / 180, power: pw }, { x: 0, z: 0 }, 'normal', st);
    if ((s.arrows[0].bounces || []).some(b => b.tramp)) tb = { s, aim: { pitch: pd * Math.PI / 180, power: pw } };
  }
  assert(tb, 'rules: an arrow hitting a trampoline bounces');
  const again = sim.simulateShot(w, 1, tb.aim, { x: 0, z: 0 }, 'normal', st);
  assert(JSON.stringify(again.arrows) === JSON.stringify(tb.s.arrows), 'rules: trampoline bounce is deterministic (server = clients)');
  const dirs = new Set(); for (let n = 0; n < 40; n++) dirs.add(Math.round(sim.hash01(n, S0) * 10)); assert(dirs.size >= 6, 'rules: trampoline angles vary');
}

// ---------------- 1. build palette (browser) ----------------
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [W, H] of [[360, 640], [740, 360]]) {
  const pg = await b.newPage(); await pg.setViewport({ width: W, height: H, isMobile: true, hasTouch: true });
  pg.on('pageerror', e => errors.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await pg.goto(base, { waitUntil: 'load' }); await pg.waitForFunction('window.__ready', { timeout: 30000 }); await sleep(500);
  await pg.evaluate(() => __game.startHotBuild('field', 0)); await sleep(600); await pg.evaluate(() => __game.passGo()); await sleep(800);
  const tools = await pg.$$eval('#bTool button', bs => bs.map(x => x.dataset.tool));
  assert(['heavy', 'cloud', 'tramp'].every(t => tools.includes(t)), `${W}x${H}: palette has heavy / cloud / trampoline (${tools})`);
  const place = (t, cells) => pg.evaluate((t, cells) => { __game.buildTool(t); return cells.map(c => __game.buildPlace(c[0], c[1])); }, t, cells);
  await place('heavy', [[-3, -3], [-3, -3]]); await place('tramp', [[-2, -3]]); await place('cloud', [[1, -3], [2, -3]]); await place('block', [[1, -3]]);
  const ok = await place('banana', [[-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1]]);
  assert(ok.every(Boolean), '5 banana peels placed (old cap was 2)');
  const kinds = await pg.evaluate(() => __game.kinds()), dec = (await pg.evaluate(() => __game.decos())).map(d => d.kind);
  assert(kinds.filter(k => k === 'heavy').length === 2 && kinds.filter(k => k === 'cloud').length === 2 && kinds.includes('tramp') && ['heavy', 'cloud', 'tramp'].every(k => dec.includes(k)), `pieces placed with their 3D looks (${kinds})`);
  const fit = await pg.evaluate(() => [...document.querySelectorAll('#bTool button, #bTools > button, #bMain button')].filter(e => e.offsetWidth).every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; }));
  const ns = await pg.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1 && document.scrollingElement.scrollWidth <= innerWidth + 1);
  assert(fit && ns, `${W}x${H}: build bar fits, no scroll`);
  const cnt = await pg.$eval('#bTool [data-tool=block] .cnt', e => e.textContent);
  assert(cnt === String(40 - kinds.length), `shared budget counter (${cnt} left)`);
  await pg.evaluate(() => __game.buildTool('cloud')); await sleep(900);
  await pg.screenshot({ path: `${out}/${pre}-build-${W}x${H}.png`, captureBeyondViewport: false });
  await pg.close();
}
await b.close();
assert(!errors.length, `no console errors (${errors.slice(0, 3)})`);
console.log('ALL OK');
