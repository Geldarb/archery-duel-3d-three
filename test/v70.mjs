// v7.0 checks: block sizes (tap the icon again), Defend the Castle (1 vs 3, legs swap), Tower Builder presets (also online).
// Usage: node test/v70.mjs <baseUrl> <outDir> [prefix] [rules|all]
import { createRequire } from 'module';
import fs from 'fs';
import * as sim from '../public/sim.js';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3970', out = 'shots/v70', pre = 'v70', which = 'all'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const errors = [], sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok', m); };

// ---------------- 0. rules (node) ----------------
const big = { blocks: [[0, 0, 0], [-3, -3, 0]], sizes: [2, 1], kinds: ['block', 'block'], archer: [-5, -5] };
{
  const r = sim.validateBuild(0, big);
  assert(r.ok && sim.planCost(big) === 5 && r.sizes[0] === 2, `rules: a 2x2 block costs 4 (${r.err || ''})`);
  assert(/taken/.test(sim.validateBuild(0, { ...big, blocks: [[0, 0, 0], [1, 1, 0]] }).err), 'rules: a block inside a 2x2 footprint is refused');
  assert(sim.validateBuild(0, { ...big, blocks: [[0, 0, 0], [1, 1, 2]] }).ok, 'rules: a block can stack on top of a 2x2');
  const ten = { blocks: [[-3, -3, 0], [0, -3, 0], [-3, 0, 0], [0, 0, 0], [-3, -3, 3]], sizes: [3, 3, 3, 3, 2], archer: [5, 5] }, te = sim.validateBuild(0, ten).err || '';
  assert(sim.planCost(ten) === 40 && sim.validateBuild(0, ten).ok, 'rules: four 3x3 + one 2x2 = exactly 40');
  ten.sizes[4] = 3; assert(/40/.test(sim.validateBuild(0, ten).err || ''), `rules: sizes count against the 40 budget (${sim.validateBuild(0, ten).err})`);
  const ph = sim.initialPhys([r, null]), S0 = sim.BUILD_SLOT0[0];
  assert(ph.k.sz[S0] === 2 && sim.halfOf(S0, ph.k)[0] > sim.halfOf(S0 + 1, ph.k)[0] * 1.9, 'rules: physics body is 2x bigger (mass scales)');
  for (const s of [0, 1]) {
    const c = sim.autoPlan(s, 0, { def: s }), cv = sim.autoPlan(s, 0, { def: 1 - s });
    const rc = sim.validateBuild(s, c, { def: s }), rv = sim.validateBuild(s, cv, { def: 1 - s });
    assert(rc.ok && sim.planCost(c) === sim.CASTLE_MAX && !rc.squad, `rules: side ${s} auto castle costs 80 (${rc.err || ''})`);
    assert(rv.ok && sim.planCost(cv) <= sim.COVER_MAX && rv.squad && rv.squad.length === 3, `rules: side ${s} attacker cover <= 10 + 3 archer spots (${rv.err || ''})`);
    assert(!sim.validateBuild(s, c, { def: 1 - s }).ok, `rules: side ${s} attacker cannot build an 80-block castle`);
  }
}

// ---------------- browser ----------------
if (which !== 'rules') {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shot = (pg, name) => { const v = pg.viewport(); return pg.screenshot({ path: `${out}/${pre}-${name}-${v.width}x${v.height}.png` }); };
  async function open(w, h, ctx = b, init = null) {
    const pg = await ctx.newPage(); await pg.setViewport({ width: w, height: h, isMobile: true, hasTouch: true });
    pg.on('pageerror', e => errors.push(`${w}x${h}: ${e.message}`)); pg.on('console', m => { if (m.type() === 'error') errors.push(`${w}x${h}: ${m.text()}`); });
    if (init) await pg.evaluateOnNewDocument(init);
    await pg.goto(base, { waitUntil: 'load' }); await pg.waitForFunction('window.__ready', { timeout: 30000 }); await sleep(500); return pg;
  }
  const noScroll = pg => pg.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1 && document.scrollingElement.scrollWidth <= innerWidth + 1);
  const inView = (pg, sel) => pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.width > 0; });
  const settle = pg => pg.waitForFunction(() => !__game.S.play && ['aim', 'over', 'menu', 'round', 'pass', 'build'].includes(__game.S.phase), { timeout: 90000, polling: 100 });

  // 1. menu + size picker (duel)
  const P = await open(360, 640);
  for (const [W, H] of [[360, 640], [740, 360]]) { await P.setViewport({ width: W, height: H, isMobile: true, hasTouch: true }); await sleep(300); assert(await noScroll(P) && await inView(P, '#builderBtn') && await inView(P, '#castleBtn') && await inView(P, '#createBtn'), `menu ${W}x${H}: Tower Builder + Castle chip fit, no scroll`); }
  await P.setViewport({ width: 360, height: 640, isMobile: true, hasTouch: true });
  await P.click('#castleBtn'); const c1 = await P.evaluate(() => __game.S.castleChoice); await P.click('#castleBtn'); const c2 = await P.evaluate(() => __game.S.castleChoice);
  await P.click('#seriesBtns button[data-s="3"]'); const c3 = await P.evaluate(() => [__game.S.castleChoice, __game.S.seriesChoice]);
  assert(c1 === 10 && c2 === 15 && c3[0] === 0 && c3[1] === 3, 'menu: castle chip 10 -> 15 turns, picking a series turns it off');
  await P.click('#seriesBtns button[data-s="1"]');
  await P.evaluate(() => __game.startHotBuild('field', 0)); await sleep(500); await P.evaluate(() => __game.passGo()); await sleep(600);
  const z = await P.evaluate(() => { __game.buildTool('block'); return __game.size(); }); // Block is already selected: one more tap = 2x2
  const placed = await P.evaluate(() => [__game.buildPlace(0, 0), __game.cost(0), __game.bs().plans[0].sizes]);
  const badge = await P.$eval('#bTool button[data-tool="block"] .sz', e => !e.hidden && e.textContent);
  assert(z === 2 && placed[1] === 4 && placed[2][0] === 2 && badge === '2×2' && /36/.test(await P.$eval('#bTool button[data-tool="block"] .cnt', e => e.textContent)), `duel: tapping Block again makes it 2x2, costs 4, badge shows (${placed[1]}, ${badge})`);
  await P.evaluate(() => { __game.buildTool('block'); __game.buildPlace(-2, -2); }); await sleep(900);
  assert(await P.evaluate(() => __game.size()) === 3 && await P.evaluate(() => __game.cost(0)) === 13, 'duel: next tap = 3x3 (cost 9)');
  assert(await noScroll(P) && await inView(P, '#bPreset'), 'duel build 360x640: Presets button fits');
  await shot(P, 'duel-size');

  // 2. Tower Builder + presets
  await P.evaluate(() => { localStorage.removeItem('ad3t-presets'); __game.S.mode = 'menu'; }); await P.goto(base, { waitUntil: 'load' }); await P.waitForFunction('window.__ready'); await sleep(400);
  await P.click('#builderBtn'); await sleep(900);
  assert(await P.evaluate(() => __game.S.builder && __game.S.phase === 'build') && await P.$eval('#bTimer', e => e.classList.contains('hidden')) && await P.$eval('#bReady', e => e.textContent) === 'Exit', 'builder: opens a solo build with no timer');
  await P.evaluate(() => { __game.buildTool('block'); __game.buildPlace(-1, -1); __game.buildTool('heavy'); __game.buildPlace(2, 2); __game.buildPlace(2, 2); });
  await P.click('#bPreset'); await sleep(300);
  await P.$eval('#pn1', e => { e.value = 'Big Keep'; e.dispatchEvent(new Event('change')); });
  await P.click('#presetRows .pRow:nth-child(2) button[data-a="save"]'); await sleep(300);
  let ps = await P.evaluate(() => __game.presets());
  assert(ps[1] && ps[1].name === 'Big Keep' && sim.planCost(ps[1].plan) === 6 && sim.validateBuild(0, ps[1].plan).ok && sim.validateBuild(1, { ...ps[1].plan, blocks: ps[1].plan.blocks.map((c, n) => [-c[0] - (ps[1].plan.sizes[n] || 1), c[1], c[2]]), archer: [-ps[1].plan.archer[0], ps[1].plan.archer[1]] }).ok, 'builder: saved to a named slot, valid for both sides');
  assert(await noScroll(P) && await inView(P, '#presets'), 'builder 360x640: preset panel fits');
  await shot(P, 'tower-builder');
  await P.evaluate(() => __game.presetSave(0)); await P.$eval('#pn0', e => { e.value = 'Renamed'; e.dispatchEvent(new Event('change')); });
  await P.click('#presetRows .pRow:nth-child(1) button[data-a="del"]'); await sleep(200);
  ps = await P.evaluate(() => __game.presets());
  assert(!ps[0] && ps[1] && ps[1].name === 'Big Keep', 'builder: rename + delete work (slot 1 kept)');
  await P.click('#presetClose'); await P.click('#bReady'); await sleep(400);
  assert(await P.evaluate(() => __game.S.phase === 'menu'), 'builder: Exit goes back to the menu');
  // load into a hot-seat duel as player 2 (mirrored)
  await P.evaluate(() => { __game.startHotBuild('field', 0); }); await sleep(400); await P.evaluate(() => { __game.passGo(); }); await sleep(300);
  await P.evaluate(() => __game.buildSkip()); await sleep(400); await P.evaluate(() => __game.passGo()); await sleep(400);
  assert(await P.evaluate(() => __game.bs().side === 1 && __game.presetLoad(1) && __game.cost(1) === 6), 'duel: Load preset places it instantly for player 2');
  assert(await P.evaluate(() => __game.buildPlace(-3, 3) && __game.cost(1) === 7), 'duel: a loaded preset can still be edited');

  // 3. castle hot-seat: build at 360x640, battle at 740x360, legs swap
  await P.evaluate(() => { __game.S.mode = 'menu'; }); await P.goto(base, { waitUntil: 'load' }); await P.waitForFunction('window.__ready'); await sleep(400);
  await P.click('#castleBtn'); await P.evaluate(() => __game.startHotBuild('field', 0)); await sleep(500); await P.evaluate(() => __game.passGo()); await sleep(400);
  assert(await P.evaluate(() => __game.bs().cmode.def === 0 && /80/.test(document.querySelector('#bCount').textContent)) && await P.$eval('#bPreset', e => e.classList.contains('hidden')), 'castle: defender gets an 80 budget, no presets');
  await P.evaluate(() => __game.buildSkip()); await sleep(500); await P.evaluate(() => __game.passGo()); await sleep(400);
  assert(await P.evaluate(() => __game.bs().side === 1 && /10/.test(document.querySelector('#bCount').textContent)), 'castle: attacker gets a 10-block cover wall');
  await P.evaluate(() => { __game.buildTool('block'); __game.buildPlace(1, 0); }); await sleep(900);
  assert(await noScroll(P), 'castle build 360x640: no scroll');
  await shot(P, 'castle-build');
  await P.evaluate(() => __game.buildSkip()); await P.waitForFunction(() => __game.S.phase === 'aim', { timeout: 20000 }); await sleep(900);
  await P.setViewport({ width: 740, height: 360, isMobile: true, hasTouch: true }); await sleep(900);
  let cs = await P.evaluate(() => ({ c: __game.castle(), turn: __game.S.turn, n: __game.squadN(), sq: !document.querySelector('#squad').classList.contains('hidden') }));
  assert(cs.c && cs.c.def === 0 && cs.turn === 1 && cs.n === 2 && cs.sq, `castle: attackers shoot first, 2 waiting archers shown, picker visible (${JSON.stringify(cs.n)})`);
  assert(await P.evaluate(() => __game.pickSquad(2) && __game.castle().squad.act === 2 && __game.squadN() === 2), 'castle: attacker picks archer 3');
  assert(await noScroll(P), 'castle battle 740x360: no scroll');
  await shot(P, 'castle-battle');
  await P.evaluate(() => __game.setHp(0, 1)); const aim = await P.evaluate(() => __game.findHit()); assert(aim, 'castle: found a hit on the defender');
  await P.evaluate(a => __game.shootAim(a), aim);
  await P.waitForFunction(() => __game.S.phase === 'pass' || __game.S.phase === 'build', { timeout: 90000, polling: 200 }); await sleep(300);
  const l2 = await P.evaluate(() => ({ legs: __game.legs(), cm: __game.bs().cmode }));
  assert(l2.legs.length === 1 && !l2.legs[0].survived && l2.cm.def === 1, 'castle: killing the defender ends leg 1, sides swap for leg 2');
  await P.close();

  // 4. online: preset loaded and sent as a normal build; castle room starts
  const cA = await b.createBrowserContext(), cB = await b.createBrowserContext();
  const plan = ps[1].plan;
  const A = await open(360, 640, cA, `localStorage.setItem('ad3t-presets', JSON.stringify([null, ${JSON.stringify({ name: 'Big Keep', plan })}, null]));`), B = await open(740, 360, cB);
  await A.click('#arenas button[data-a="field"]'); await A.click('#createBtn');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code = await A.$eval('#code', e => e.textContent); await B.goto(`${base}/?room=${code}`, { waitUntil: 'load' });
  for (const X of [A, B]) await X.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'build', { timeout: 30000 });
  await sleep(500);
  assert(await A.evaluate(() => __game.presetLoad(1)), 'online: Load preset in the build phase');
  await A.evaluate(() => __game.buildReady()); await B.evaluate(() => __game.sendPlan(__game.autoPlan(1), true));
  for (const X of [A, B]) await X.waitForFunction(() => __game.S.phase === 'aim', { timeout: 40000 });
  const S0 = sim.BUILD_SLOT0[0], k = await B.evaluate(() => __game.st.phys.k.sz);
  assert(Object.keys(k).length === 1 && k[Object.keys(k)[0]] === 2 && +Object.keys(k)[0] >= S0, 'online: server accepted the preset (the 2x2 block reaches the other player)');
  const bad = { blocks: Array.from({ length: 11 }, (_, i) => [i % 3 * 2 - 3, Math.floor(i / 3) * 2 - 3, 0]), sizes: Array(11).fill(2), archer: [5, 5] };
  assert(!sim.validateBuild(0, bad).ok, 'online: an over-budget sized plan is refused by the shared validator');
  for (const X of [A, B]) await X.evaluate(() => { __game.S.mode = 'menu'; });
  await A.goto(base, { waitUntil: 'load' }); await B.goto(base, { waitUntil: 'load' }); for (const X of [A, B]) await X.waitForFunction('window.__ready');
  await A.click('#castleBtn'); await A.click('#castleBtn'); await A.click('#createBtn');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code2 = await A.$eval('#code', e => e.textContent); await B.goto(`${base}/?room=${code2}`, { waitUntil: 'load' });
  for (const X of [A, B]) await X.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'build', { timeout: 30000 });
  assert(await B.evaluate(() => __game.bs().cmode && __game.bs().cmode.def === 0 && /10/.test(document.querySelector('#bCount').textContent)), 'online castle: guest is the attacker with a 10-block cover');
  await A.evaluate(() => __game.sendPlan(__game.autoPlan(0, 0, { def: 0 }), true)); await B.evaluate(() => __game.sendPlan(__game.autoPlan(1, 0, { def: 0 }), true));
  for (const X of [A, B]) await X.waitForFunction(() => __game.S.phase === 'aim', { timeout: 40000 });
  await sleep(800);
  const oc = await Promise.all([A, B].map(X => X.evaluate(() => ({ c: __game.castle(), turn: __game.S.turn, n: __game.squadN() }))));
  assert(oc.every(o => o.c && o.c.turns === 15 && o.c.def === 0 && o.turn === 1 && o.n === 2), 'online castle: 15 turns, attackers first, squad on both screens');
  const who = await B.evaluate(() => __game.pickSquad(1) && __game.castle().squad.act);
  const aimB = await B.evaluate(() => { for (let pw = 0.3; pw <= 1; pw += 0.05) return { pitch: 0.5, power: 0.6 }; });
  await B.evaluate(a => __game.shootAim(a), aimB); await Promise.all([A, B].map(X => X.waitForFunction(() => !__game.S.play && __game.S.turn === 0, { timeout: 90000, polling: 200 })));
  assert(who === 1 && await A.evaluate(() => __game.castle().squad.act) === 1, 'online castle: the picked attacker is synced by the server');
  await b.close();
}
assert(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 4).join(' | ') : ''));
