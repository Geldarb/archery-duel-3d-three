// v5.2 checks: build your own tower from the ground (30 blocks, 60 s, auto-lock), hot-seat + online.
// Usage: node test/v52.mjs <baseUrl> <outDir> [hot|online|all] [prefix]
import { createRequire } from 'module';
import fs from 'fs';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3947', out = 'shots/v52', which = 'all', pre = 'v52'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], sleep = ms => new Promise(r => setTimeout(r, ms)), results = [];
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); results.push('ok ' + m); console.log('ok', m); };
const shot = (pg, name) => pg.screenshot({ captureBeyondViewport: false, path: `${out}/${pre}-${name}.png` });
async function open(w, h, ctx = b, url = base) {
  const pg = await ctx.newPage();
  await pg.setViewport({ width: w, height: h, isMobile: w < 900, hasTouch: w < 900, deviceScaleFactor: 1 });
  pg.on('console', m => { if (m.type() === 'error') errors.push(`${w}x${h}: ${m.text()}`); });
  pg.on('pageerror', e => errors.push(`${w}x${h}: ${e.message}`));
  await pg.goto(url, { waitUntil: 'load' }); await pg.waitForFunction('window.__ready', { timeout: 30000 }); await sleep(500);
  return pg;
}
const vp = (pg, w, h) => pg.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const vis = (pg, sel) => pg.$eval(sel, e => !e.classList.contains('hidden') && e.offsetWidth > 0 && getComputedStyle(e).display !== 'none');
const B = pg => pg.evaluate(() => { const s = __game.build; return { side: s.side, plan: JSON.parse(JSON.stringify(s.plans[s.side])), res: JSON.parse(JSON.stringify(s.res[s.side])), ghost: s.ghost && { cell: s.ghost.cell, ok: s.ghost.ok }, msg: s.msg, err: s.err, phase: __game.S.phase }; });
// visible blocks on a side, by kind group: build = player-built, classic = the old tower
const seen = (pg, s, kind = 'build') => pg.evaluate((s, kind) => __game.blocks().map((q, i) => [q, __game.layout[i]]).filter(([q, l]) => l.s === s && (kind === 'build' ? l.kind === 'build' : l.kind !== 'build') && q[1] > -20).map(([q]) => q.slice(0, 3).map(v => +v.toFixed(4))), s, kind);
const settle = pg => pg.waitForFunction(() => !__game.S.play && ['aim', 'over', 'menu'].includes(__game.S.phase), { timeout: 60000, polling: 100 });
const noScroll = pg => pg.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1 && document.scrollingElement.scrollWidth <= innerWidth + 1);
const inView = (pg, sel) => pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0; });
const facingOk = pg => pg.evaluate(() => {
  const a = __game.archers.map(x => x.root.position.toArray()), out = [];
  for (const i of [0, 1]) {
    const r = __game.archers[i].root.rotation, dx = a[1 - i][0] - a[i][0], dz = a[1 - i][2] - a[i][2], h = Math.hypot(dx, dz);
    const want = Math.atan2(-dz / h, dx / h), dy = Math.atan2(Math.sin(r.y - want), Math.cos(r.y - want));
    out.push({ i, upright: Math.abs(r.x) < 1e-9 && Math.abs(r.z) < 1e-9, yawErr: Math.abs(dy), feet: a[i].map(v => +v.toFixed(2)) });
  }
  return out;
});
const shotPlane = (pg, aim) => pg.evaluate(aim => {
  __game.setWind(0, 0);
  const i = __game.S.turn, a = __game.st.phys.a, p0 = a[i], p1 = a[1 - i], dx = p1[0] - p0[0], dz = p1[2] - p0[2], h = Math.hypot(dx, dz);
  const pts = __game.simulate(aim).arrows[0].pts;
  const off = Math.max(...pts.map(p => Math.abs(((p[0] - p0[0]) * dz - (p[2] - p0[2]) * dx) / h)));
  const v = [pts[3][0] - pts[0][0], pts[3][2] - pts[0][2]], hv = Math.hypot(...v);
  return { off, cos: (v[0] * dx + v[1] * dz) / (hv * h), shooter: i };
}, aim);
// 30 blocks: 3x3 base two high (18) + 2x2 keep three more levels (12); the archer ends on the keep top (4.0 m)
const BLUE30 = []; for (let y = 0; y < 2; y++) for (const gx of [-2, -1, 0]) for (const gz of [-1, 0, 1]) BLUE30.push([gx, gz]);
for (let y = 2; y < 5; y++) for (const gx of [-1, 0]) for (const gz of [-1, 0]) BLUE30.push([gx, gz]);
const RED = [[-1, 0], [-1, 0], [-1, 0], [-1, 0], [-1, 0], [0, 0], [0, 0]]; // a 5-high column + a 2-high step

if (which !== 'online') {
  // ---------------- hot-seat ----------------
  const pg = await open(360, 640);
  await pg.click('#arenas button[data-a="field"]'); await pg.click('#seriesBtns button[data-s="3"]'); await pg.click('#hotBtn'); await sleep(900);
  assert(await vis(pg, '#pass') && (await B(pg)).phase === 'pass' && await vis(pg, '#passSkip'), 'hot: Play opens the look-away card (with Quick play)');
  await shot(pg, 'hot-pass-360x640');
  await pg.click('#passGo'); await sleep(1500);
  let s = await B(pg);
  const t0 = await pg.$eval('#bTimer', e => e.textContent);
  assert(s.phase === 'build' && s.side === 0 && await vis(pg, '#build') && /⏱ (60|59)s/.test(t0), `hot: Blue builds with a 60 s timer (${t0})`);
  assert(s.res.archer[1] === 0 && (await seen(pg, 0, 'classic')).length === 0 && (await seen(pg, 1, 'classic')).length === 0 && (await seen(pg, 0)).length === 0, 'hot: no pre-built towers, Blue archer starts on the ground');
  assert(await noScroll(pg) && await inView(pg, '#bReady') && await inView(pg, '#bUndo') && await inView(pg, '#bCount') && await inView(pg, '#bTimer'), 'hot 360x640: Done/Undo/counter/timer on screen, no page scroll');
  await shot(pg, 'hot-empty-360x640');
  // real taps: tap = ghost, tap again = placed, tap again = stacked on top; Place button works too
  let done = false;
  for (const c of [[-2, 1], [1, -2], [-3, 2], [2, 2], [1, 1]]) {
    const xy = await pg.evaluate(c => __game.cellScreen(...c), c); await pg.touchscreen.tap(...xy); await sleep(350);
    s = await B(pg);
    if (!s.ghost || !s.ghost.ok || s.ghost.cell.join() !== c.join()) continue;
    await shot(pg, 'hot-ghost-360x640');
    await pg.touchscreen.tap(...xy); await sleep(350);
    s = await B(pg);
    assert(s.plan.blocks.length === 1 && s.plan.blocks[0].join() === [...c, 0].join(), `hot: second tap placed a block on the ground at ${c}`);
    assert(s.ghost && s.ghost.ok && s.ghost.cell.join() === c.join(), 'hot: ghost moves up for quick stacking');
    const xy2 = await pg.evaluate(c => __game.cellScreen(...c), c); await pg.touchscreen.tap(...xy2); await sleep(350);
    s = await B(pg);
    assert(s.plan.blocks.length === 2 && s.plan.blocks[1].join() === [...c, 1].join(), `hot: tapping the block top stacked a second block (${JSON.stringify(s.plan.blocks)})`);
    assert(await vis(pg, '#bConfirm'), 'hot: Place button shows for the next ghost');
    await pg.click('#bConfirm'); await sleep(300); s = await B(pg);
    assert(s.plan.blocks.length === 3 && s.plan.blocks[2][2] === 2, 'hot: Place button stacked a third');
    done = true; break;
  }
  assert(done, 'hot: real taps found a visible ground cell');
  let cnt = await pg.$eval('#bCount', e => e.textContent);
  assert(cnt.includes('3/30'), `hot: counter shows ${cnt}`);
  await pg.click('#bUndo'); await sleep(250);
  assert((await B(pg)).plan.blocks.length === 2 && (await pg.$eval('#bCount', e => e.textContent)).includes('2/30'), 'hot: Undo removes the last block');
  await pg.evaluate(() => { while (__game.build.hist[0].length) __game.buildUndo(); });
  // rejected: outside the zone / opponent side / middle, floating, overlapping, too high, archer off-zone
  const bad = await pg.evaluate(() => { const r = []; for (const c of [[3, 0], [0, 4], [-9, 0], [18, 0]]) r.push([__game.buildPlace(...c), __game.build.msg]); return r; });
  assert(bad.every(x => x[0] === false && /outside/i.test(x[1])), `hot: cells outside the build zone rejected (${bad[0][1]})`);
  const flo = await pg.evaluate(() => { const r = __game.buildPlaceRaw({ blocks: [[0, 1, 1]], archer: [0, 0] }); return [r.ok, r.err, __game.build.plans[0].blocks.length]; });
  assert(flo[0] === false && /float/i.test(flo[1]) && flo[2] === 0, `hot: unsupported (floating) block rejected (${flo[1]})`);
  const flo2 = await pg.evaluate(() => [__game.validate(0, { blocks: [[1, 1], [1, 1, 3]], archer: [0, 0] }).err, __game.validate(0, { blocks: [[1, 1], [1, 1, 0]], archer: [0, 0] }).err]);
  assert(/float/i.test(flo2[0]) && /taken/i.test(flo2[1]), `hot: gap in a column / overlapping block rejected (${flo2.join(' | ')})`);
  const tall = await pg.evaluate(() => { const r = []; for (let k = 0; k < 9; k++) r.push(__game.buildPlace(1, -2)); return [r, __game.build.msg]; });
  assert(tall[0].slice(0, 8).every(Boolean) && tall[0][8] === false && /high/i.test(tall[1]), `hot: 9th level rejected (${tall[1]})`);
  await pg.evaluate(() => { while (__game.build.hist[0].length) __game.buildUndo(); });
  const offZone = await pg.evaluate(() => [__game.buildArcher(9, 0), __game.build.msg]);
  assert(offZone[0] === false, `hot: archer can't leave the build zone (${offZone[1]})`);
  // archer climbs onto a block placed under them
  const climb = await pg.evaluate(() => { __game.buildPlace(0, 0); const r = __game.build.res[0]; return [r.archer, __game.build.msg]; });
  assert(Math.abs(climb[0][1] - 0.8) < 1e-6, `hot: archer climbed onto the block placed under them (${JSON.stringify(climb)})`);
  await pg.evaluate(() => __game.buildUndo());
  // 30 blocks, the 31st is refused
  const ok0 = await pg.evaluate(p => p.map(c => __game.buildPlace(...c)), BLUE30);
  assert(ok0.every(Boolean) && (await B(pg)).plan.blocks.length === 30, 'hot: Blue builds a 30-block tower from the ground');
  assert(await pg.evaluate(() => __game.buildPlace(2, 2)) === false && /no blocks left/i.test((await B(pg)).msg) && (await pg.$eval('#bCount', e => e.textContent)).includes('30/30'), 'hot: 31st block refused (▦ 30/30)');
  await pg.click('#bTool button[data-tool="archer"]'); await sleep(200);
  assert(await pg.evaluate(() => __game.buildArcher(-3, 0)) && Math.abs((await B(pg)).res.archer[1] - 1.6) < 1e-6, 'hot: archer moved onto the low base (1.6 m)');
  assert(await pg.evaluate(() => __game.buildArcher(0, 0)) && Math.abs((await B(pg)).res.archer[1] - 4.0) < 1e-6, 'hot: archer moved onto the built top (4.0 m)');
  await sleep(800); await shot(pg, 'hot-blue-built-360x640');
  const bf = await facingOk(pg);
  assert(bf.every(f => f.upright && f.yawErr < 1e-6), 'hot: archers upright & facing during the build');
  await pg.click('#bReady'); await sleep(700);
  assert(await vis(pg, '#pass') && !(await vis(pg, '#passSkip')) && (await B(pg)).phase === 'pass', 'hot: Done -> pass card for Red');
  await vp(pg, 740, 360); await sleep(300);
  await pg.click('#passGo'); const tStart = Date.now(); await sleep(1200);
  assert((await B(pg)).side === 1 && (await seen(pg, 0)).length === 0, "hot: Red's build view hides Blue's tower");
  const ok1 = await pg.evaluate(p => p.map(c => __game.buildPlace(...c)), RED);
  await pg.evaluate(() => __game.buildArcher(-1, 1));
  assert(ok1.every(Boolean) && Math.abs((await B(pg)).res.archer[1] - 4.0) < 1e-6, 'hot: Red builds 7 blocks and stands on the column top');
  assert(await noScroll(pg) && await inView(pg, '#bReady') && await inView(pg, '#bUndo') && await inView(pg, '#bTimer'), 'hot 740x360: build bar on screen, no scroll');
  await sleep(600); await shot(pg, 'hot-red-build-740x360');
  // Red never presses Fight!: at 0 s the build locks and the match starts
  await pg.waitForFunction(() => __game.S.phase === 'aim', { timeout: 75000, polling: 250 });
  const took = (Date.now() - tStart) / 1000;
  assert(took > 57 && took < 64, `hot: Red's timer auto-locked the build at 60 s (${took.toFixed(1)} s)`);
  await vp(pg, 360, 640); await sleep(800);
  const s0 = await seen(pg, 0), s1 = await seen(pg, 1), m = await pg.evaluate(() => __game.st.phys.a);
  assert(s0.length === 30 && s1.length === 7 && (await seen(pg, 0, 'classic')).length === 0 && (await seen(pg, 1, 'classic')).length === 0, `hot: match between the two built towers (${s0.length} + ${s1.length} blocks, no classic towers)`);
  assert(Math.abs(m[0][1] - 4) < 1e-6 && Math.abs(m[1][1] - 4) < 1e-6, `hot: archers start on their built tops (${JSON.stringify(m)})`);
  await shot(pg, 'hot-match-built-360x640');
  assert(await pg.evaluate(() => __game.buildPlace(1, 1)) === false && (await seen(pg, 0)).length === 30, 'hot: no building after the start');
  await pg.evaluate(() => { __game.setWind(0, 0); __game.shootAim({ pitch: 0.12, power: 0.3 }); }); await settle(pg); await sleep(400);
  assert(JSON.stringify(await seen(pg, 0)) === JSON.stringify(s0), 'hot: built blocks are stable physics blocks (unmoved after a turn)');
  const f1 = await facingOk(pg), p1 = await shotPlane(pg, { pitch: 0.5, power: 0.7 });
  assert(f1.every(f => f.upright && f.yawErr < 1e-6) && p1.off < 0.011 && p1.cos > 0.999, `hot: archers face each other, shot stays in their plane (${p1.off.toFixed(4)})`);
  // a hit on a built tower moves its blocks (normal physics)
  const hb = await pg.evaluate(() => { __game.setWind(0, 0); const t = __game.S.turn, ids = __game.layout.map((l, i) => (l.s === 1 - t && l.kind === 'build' ? i : -1)).filter(i => i >= 0); return __game.findBlockHit(ids, 'heavy'); });
  assert(hb, 'hot: aim at a built block found');
  const before = await pg.evaluate(() => __game.blocks());
  await pg.evaluate(a => __game.shootAim(a, 'heavy'), hb.aim); await settle(pg); await sleep(300);
  const moved = await pg.evaluate(b0 => __game.blocks().filter((q, i) => Math.hypot(q[0] - b0[i][0], q[1] - b0[i][1], q[2] - b0[i][2]) > 0.05).length, before);
  const f2 = await facingOk(pg);
  assert(moved > 0 && f2.every(f => f.upright && f.yawErr < 1e-6), `hot: heavy hit pushes built blocks (${moved} moved), archers still upright & facing`);
  // Bo3: round 2 resets to both built towers, no build phase
  const builtB = await pg.evaluate(() => __game.S.builds && JSON.stringify(__game.S.builds));
  const init = await pg.evaluate(() => JSON.stringify(__game.S.builds));
  for (let k = 0; k < 12 && (await pg.evaluate(() => __game.S.phase)) === 'aim' && (await pg.evaluate(() => __game.S.score.join())) === '0,0'; k++) {
    const aim = await pg.evaluate(() => { const t = __game.S.turn; __game.S.hp[1 - t] = __game.S.st.hp[1 - t] = 1; __game.setWind(0, 0); return __game.findHit(); });
    await pg.evaluate(a => __game.shootAim(a || { pitch: 0.3, power: 0.6 }), aim); await settle(pg); await sleep(300);
  }
  const sc = await pg.evaluate(() => __game.S.score.join());
  assert(sc !== '0,0', `hot: round 1 decided (score ${sc})`);
  await pg.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp.every(h => h === 100), { timeout: 30000, polling: 200 });
  const r2s0 = await seen(pg, 0), r2s1 = await seen(pg, 1), r2a = await pg.evaluate(() => __game.st.phys.a);
  assert(JSON.stringify(r2s0) === JSON.stringify(s0) && JSON.stringify(r2s1) === JSON.stringify(s1) && JSON.stringify(r2a) === JSON.stringify(m) && builtB === init && !(await vis(pg, '#build')) && !(await vis(pg, '#pass')), 'hot: Bo3 round 2 resets to both built towers, no build phase');
  await pg.close();
  // Quick play + Auto: the ready-made 30-block tower
  const q = await open(740, 360);
  await q.click('#hotBtn'); await sleep(800);
  await shot(q, 'hot-pass-740x360');
  await q.click('#passSkip'); await sleep(900);
  assert(await q.evaluate(() => __game.S.phase) === 'aim' && (await seen(q, 0)).length === 30 && (await seen(q, 1)).length === 30 && (await seen(q, 0, 'classic')).length === 0, 'hot: Quick play -> both get the 30-block auto tower');
  await q.evaluate(() => __game.startHotBuild('field', 0)); await sleep(500); await q.click('#passGo'); await sleep(500);
  await q.click('#bSkip'); await sleep(500);
  assert((await B(q)).phase === 'pass' && (await q.evaluate(() => __game.build.res[0].blocks.length)) === 30, "hot: Auto fills Blue's 30-block tower and passes to Red");
  await q.close();
}

if (which !== 'hot') {
  // ---------------- online ----------------
  const A = await open(360, 640, await b.createBrowserContext()), Bp = await open(740, 360, await b.createBrowserContext());
  await A.click('#arenas button[data-a="field"]'); await A.click('#seriesBtns button[data-s="3"]'); await A.click('#createBtn');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code = await A.$eval('#code', e => e.textContent);
  await Bp.goto(`${base}/?room=${code}`, { waitUntil: 'load' });
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'build', { timeout: 20000 });
  const [ia, ib] = [await B(A), await B(Bp)];
  assert(ia.side === 0 && ib.side === 1 && ia.res.archer[1] === 0 && (await seen(A, 0, 'classic')).length === 0, 'online: both build at once from bare ground');
  const tA = await A.$eval('#bTimer', e => e.textContent);
  assert(/⏱ (60|59|58)s/.test(tA), `online: 60 s build timer shown (${tA})`);
  const errs = [];
  for (const plan of [{ blocks: [[3, 0]], archer: [0, 0] }, { blocks: Array(31).fill(0).map((_, n) => [n % 6 - 3, Math.floor(n / 6) - 3]), archer: [0, 0] }, { blocks: [[0, 0, 1]], archer: [0, 0] }, { blocks: [], archer: [9, 0] }, { classic: true }]) {
    await A.evaluate(p => { __game.S.lastBuildErr = null; __game.sendPlan(p, false); }, plan); await sleep(400);
    errs.push(await A.evaluate(() => __game.S.lastBuildErr));
  }
  console.log('server errors', errs);
  assert(errs.slice(0, 4).every(Boolean) && /float/i.test(errs[2]) && /30/.test(errs[1]) && (await B(A)).phase === 'build', `online: server rejects bad plans (${errs.join(' | ')})`);
  await A.evaluate(p => p.forEach(c => __game.buildPlace(...c)), BLUE30); await A.evaluate(() => __game.buildArcher(0, 0));
  await Bp.evaluate(p => p.forEach(c => __game.buildPlace(...c)), RED); await Bp.evaluate(() => __game.buildArcher(-1, 1));
  await sleep(1000);
  assert((await seen(A, 1)).length === 0 && (await seen(Bp, 0)).length === 0 && (await seen(A, 0)).length === 30, "online: neither sees the other's build");
  await shot(A, 'online-build-A-360x640'); await shot(Bp, 'online-build-B-740x360');
  await A.click('#bReady'); await sleep(700);
  assert(await A.evaluate(() => __game.build.locked || __game.build.sent) && await Bp.evaluate(() => __game.build.oppReady), 'online: Blue locked in, Red sees "Opponent ready"');
  await Bp.click('#bReady');
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.phase === 'aim', { timeout: 15000 });
  await sleep(1200);
  const [ma, mb] = await Promise.all([A, Bp].map(P => P.evaluate(() => JSON.stringify(__game.st.phys))));
  assert(ma === mb, 'online: both clients hold exactly the same built layout');
  assert((await seen(A, 0)).length === 30 && (await seen(A, 1)).length === 7 && JSON.stringify(await seen(A, 1)) === JSON.stringify(await seen(Bp, 1)) && (await seen(Bp, 0, 'classic')).length === 0, 'online: both towers revealed on both screens');
  await shot(A, 'online-match-A-360x640'); await shot(Bp, 'online-match-B-740x360');
  const fa = await facingOk(A);
  assert(fa.every(f => f.upright && f.yawErr < 1e-6), 'online: archers upright & facing after the reveal');
  await A.evaluate(() => { __game.S.lastBuildErr = null; __game.sendPlan({ blocks: [[0, -1]], archer: [0, 0] }, true); }); await sleep(500);
  assert(/over/i.test(await A.evaluate(() => __game.S.lastBuildErr)), 'online: server refuses building after the start');
  const hb = await A.evaluate(() => { __game.setWind(0, 0); __game.S.wind = { x: 0, z: 0 }; return null; });
  await A.evaluate(() => __game.shootAim({ pitch: 0.3, power: 0.8 }, 'heavy'));
  await Promise.all([A, Bp].map(P => settle(P))); await sleep(1000);
  const [pa, pb] = await Promise.all([A, Bp].map(P => P.evaluate(() => JSON.stringify({ hp: __game.S.hp, phys: __game.st.phys }))));
  assert(pa === pb, 'online: shot result agrees exactly (hp + every block)');
  await A.close(); await Bp.close();
  // timer: nobody presses Ready -> at 60 s the server starts with whatever was placed
  const C = await open(360, 640, await b.createBrowserContext()), D = await open(360, 640, await b.createBrowserContext());
  await C.click('#createBtn'); await C.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code2 = await C.$eval('#code', e => e.textContent);
  await D.goto(`${base}/?room=${code2}`, { waitUntil: 'load' });
  for (const P of [C, D]) await P.waitForFunction(() => __game.S.phase === 'build', { timeout: 20000 });
  const t0 = Date.now();
  await C.evaluate(() => { __game.buildPlace(0, -1); __game.buildPlace(0, -1); __game.buildPlace(-2, 0); });
  for (const P of [C, D]) await P.waitForFunction(() => __game.S.phase === 'aim', { timeout: 90000, polling: 250 });
  const took = (Date.now() - t0) / 1000;
  const [sc, sd] = [await seen(C, 0), await seen(D, 0)], da = await D.evaluate(() => __game.st.phys.a);
  assert(took > 57 && took < 66 && sc.length === 3 && JSON.stringify(sc) === JSON.stringify(sd) && (await seen(D, 1)).length === 0 && da[1][1] === 0, `online: at 60 s the build auto-locks (${took.toFixed(1)} s), 3 placed blocks used, idle player on the ground, both agree`);
  await C.close(); await D.close();
}

console.log(results.length, 'checks passed');
console.log('console errors:', errors.length ? errors : 'none');
await b.close();
if (errors.length) process.exit(1);
