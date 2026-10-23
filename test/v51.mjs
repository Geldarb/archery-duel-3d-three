// NOTE: superseded by test/v52.mjs (v5.2 removed the pre-built towers; this suite assumes v5.1 rules).
// v5.1 checks: build phase (hot-seat pass-and-build, online private simultaneous build + server validation + timer),
// invalid placements rejected, layouts kept across Bo3 rounds, no building after the start, archers upright & facing each other after falls.
// Usage: node test/v51.mjs <baseUrl> <outDir> [hot|online|all] [prefix]    (server should run with BUILD_SECS=20 for the timer test)
import { createRequire } from 'module';
import fs from 'fs';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3947', out = 'shots/v51', which = 'all', pre = 'v51'] = process.argv;
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
const vis = (pg, sel) => pg.$eval(sel, e => !e.classList.contains('hidden') && e.offsetWidth > 0 && getComputedStyle(e).display !== 'none');
const B = pg => pg.evaluate(() => { const s = __game.build; return { side: s.side, plan: JSON.parse(JSON.stringify(s.plans[s.side])), ghost: s.ghost && { cell: s.ghost.cell, ok: s.ghost.ok }, msg: s.msg, err: s.err, phase: __game.S.phase }; });
const slots = (pg, s) => pg.evaluate(s => __game.blocks().slice(s ? 90 : 82, s ? 98 : 90).filter(q => q[1] > -20).map(q => q.slice(0, 3).map(v => +v.toFixed(4))), s);
const settle = pg => pg.waitForFunction(() => !__game.S.play && ['aim', 'over', 'menu'].includes(__game.S.phase), { timeout: 60000, polling: 100 });
const noScroll = pg => pg.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1 && document.scrollingElement.scrollWidth <= innerWidth + 1);
const inView = (pg, sel) => pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0; });
const PLAN0 = [[0, 0], [0, 0], [-1, -1], [2, 0], [2, 0], [2, 0], [2, -1], [1, 1]], PLAN1 = [[-1, 0], [-1, -1], [-3, 0], [-3, 0], [-3, -1], [0, 0]];
const facingOk = pg => pg.evaluate(() => { // upright, yaw toward the opponent; the next shot heads at the opponent in the vertical plane through both archers
  const a = __game.archers.map(x => x.root.position.toArray()), out = []; // what is on screen
  for (const i of [0, 1]) {
    const r = __game.archers[i].root.rotation, dx = a[1 - i][0] - a[i][0], dz = a[1 - i][2] - a[i][2], h = Math.hypot(dx, dz);
    const want = Math.atan2(-dz / h, dx / h), dy = Math.atan2(Math.sin(r.y - want), Math.cos(r.y - want));
    out.push({ i, upright: Math.abs(r.x) < 1e-9 && Math.abs(r.z) < 1e-9, yawErr: Math.abs(dy), feet: a[i].map(v => +v.toFixed(2)) });
  }
  return out;
});
const shotPlane = (pg, aim) => pg.evaluate(aim => { // max distance of the shot's points from the vertical plane through both archers, + heading
  __game.setWind(0, 0);
  const i = __game.S.turn, a = __game.st.phys.a, p0 = a[i], p1 = a[1 - i], dx = p1[0] - p0[0], dz = p1[2] - p0[2], h = Math.hypot(dx, dz);
  const pts = __game.simulate(aim).arrows[0].pts;
  const off = Math.max(...pts.map(p => Math.abs(((p[0] - p0[0]) * dz - (p[2] - p0[2]) * dx) / h)));
  const v = [pts[3][0] - pts[0][0], pts[3][2] - pts[0][2]], hv = Math.hypot(...v);
  return { off, cos: (v[0] * dx + v[1] * dz) / (hv * h), shooter: i, p0, p1 };
}, aim);

if (which !== 'online') {
  // ---------------- hot-seat ----------------
  const pg = await open(360, 640);
  await pg.click('#arenas button[data-a="field"]'); await pg.click('#seriesBtns button[data-s="3"]'); await pg.click('#hotBtn'); await sleep(900);
  assert(await vis(pg, '#pass') && (await B(pg)).phase === 'pass' && await vis(pg, '#passSkip'), 'hot: Play opens the build-phase look-away card (with Skip)');
  await shot(pg, 'hot-pass-360x640');
  await pg.click('#passGo'); await sleep(1500);
  let s = await B(pg);
  assert(s.phase === 'build' && s.side === 0 && await vis(pg, '#build') && !(await vis(pg, '#hud')), 'hot: Blue builds (build UI up, match HUD hidden)');
  assert(await noScroll(pg) && await inView(pg, '#bReady') && await inView(pg, '#bUndo') && await inView(pg, '#bCount'), 'hot 360x640: Ready/Undo/counter on screen, no page scroll');
  // real taps: tap once = ghost, tap again on the same spot = placed; Confirm button places the ghost too
  let tapped = 0;
  for (const c of [[0, 0], [-1, -1], [1, 1], [0, -1], [-1, 0], [1, -2], [2, 0], [-3, 0], [2, 1]]) {
    const xy = await pg.evaluate(c => __game.cellScreen(...c), c); await pg.touchscreen.tap(...xy); await sleep(350);
    s = await B(pg);
    if (!s.ghost || !s.ghost.ok || s.ghost.cell.join() !== c.join()) continue;
    const n = s.plan.blocks.length;
    if (tapped === 0) { await shot(pg, 'hot-ghost-360x640'); await pg.touchscreen.tap(...xy); }
    else { assert(await vis(pg, '#bConfirm'), 'hot: Place button shows for a valid ghost'); await pg.click('#bConfirm'); }
    await sleep(350); s = await B(pg);
    assert(s.plan.blocks.length === n + 1 && s.plan.blocks.at(-1).join() === c.join(), `hot: real tap placed a block at cell ${c} (${tapped ? 'Place button' : 'second tap'})`);
    if (++tapped === 2) break;
  }
  assert(tapped === 2, 'hot: two blocks placed with real taps');
  const cnt = await pg.$eval('#bCount', e => e.textContent);
  assert(cnt.includes('6/8'), `hot: block counter shows ${cnt}`);
  await pg.click('#bUndo'); await sleep(250);
  assert((await B(pg)).plan.blocks.length === 1 && (await pg.$eval('#bCount', e => e.textContent)).includes('7/8'), 'hot: Undo removes the last block');
  await pg.click('#bUndo'); await sleep(250);
  // invalid placements are rejected with a reason
  const bad = await pg.evaluate(() => { const r = []; for (const c of [[5, 0], [0, 7], [-9, -9]]) r.push([__game.buildPlace(...c), __game.build.msg]); return r; });
  assert(bad.every(x => x[0] === false && /far/i.test(x[1])), `hot: off-grid / far cells rejected (${bad.map(x => x[1]).join(' | ')})`);
  const tooHigh = await pg.evaluate(() => { const r = []; for (let k = 0; k < 4; k++) r.push(__game.buildPlace(1, 1)); return [r, __game.build.msg, __game.build.plans[0].blocks.length]; });
  assert(tooHigh[0].includes(false) && /high/i.test(tooHigh[1]), `hot: stacking past the height limit rejected (${JSON.stringify(tooHigh)})`);
  await pg.evaluate(() => { while (__game.build.hist[0].length) __game.buildUndo(); });
  const offSide = await pg.evaluate(() => [__game.buildArcher(5, 5), __game.build.msg, __game.buildArcher(0, 9), __game.build.msg]);
  assert(offSide[0] === false && offSide[2] === false, `hot: archer can't move off the tower (${offSide[1]} | ${offSide[3]})`);
  // the full Blue plan + archer move
  const ok0 = await pg.evaluate(p => p.map(c => __game.buildPlace(...c)), PLAN0);
  assert(ok0.every(Boolean), 'hot: Blue places 8 blocks');
  assert(await pg.evaluate(() => __game.buildPlace(0, -1)) === false && /no blocks left/i.test((await B(pg)).msg), 'hot: 9th block refused (limit 8)');
  await pg.click('#bTool button[data-tool="archer"]'); await sleep(200);
  assert(await pg.evaluate(() => __game.buildArcher(-1, -1)), 'hot: Blue archer moved onto the placed block');
  await sleep(500); await shot(pg, 'hot-blue-built-360x640');
  const blueFace = await facingOk(pg);
  assert(blueFace.every(f => f.upright && f.yawErr < 1e-6), `hot: archers face each other during the build (${JSON.stringify(blueFace)})`);
  const plan0 = (await B(pg)).plan;
  await pg.click('#bReady'); await sleep(700);
  assert(await vis(pg, '#pass') && !(await vis(pg, '#passSkip')) && (await B(pg)).phase === 'pass', 'hot: Done -> pass card for Red (no peeking)');
  await pg.click('#passGo'); await sleep(1200);
  assert((await B(pg)).side === 1 && (await slots(pg, 0)).length === 0, "hot: Red's build view hides Blue's placed blocks");
  const ok1 = await pg.evaluate(p => p.map(c => __game.buildPlace(...c)), PLAN1);
  assert(ok1.every(Boolean), 'hot: Red places 6 blocks');
  await pg.evaluate(() => __game.buildArcher(1, 1));
  await pg.setViewport({ width: 740, height: 360, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(900);
  assert(await noScroll(pg) && await inView(pg, '#bReady') && await inView(pg, '#bUndo'), 'hot 740x360: build bar on screen, no scroll');
  await shot(pg, 'hot-red-build-740x360');
  await pg.setViewport({ width: 360, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(500);
  await pg.click('#bReady'); await sleep(1500);
  const m = await pg.evaluate(() => ({ phase: __game.S.phase, builds: JSON.parse(JSON.stringify(__game.S.builds)), a: __game.st.phys.a }));
  assert(m.phase === 'aim' && !(await vis(pg, '#build')), 'hot: Fight! starts the match');
  const s0 = await slots(pg, 0), s1 = await slots(pg, 1);
  assert(s0.length === 8 && s1.length === 6, `hot: both builds in the match (${s0.length} + ${s1.length} blocks)`);
  assert(Math.abs(m.a[0][1] - 5.8) < 1e-6 && Math.abs(m.a[0][0] - m.builds[0].archer[0]) < 1e-6, `hot: Blue archer starts on its new spot ${m.a[0]}`);
  await shot(pg, 'hot-match-built-360x640');
  // nothing to build once the match runs
  assert(await pg.evaluate(() => __game.buildPlace(0, -1)) === false && (await slots(pg, 0)).length === 8, 'hot: no building after the start');
  // stable: let a turn pass and nothing has moved
  await pg.evaluate(() => { __game.setWind(0, 0); __game.shootAim({ pitch: 0.12, power: 0.3 }); }); await settle(pg); await sleep(400);
  const s0b = await slots(pg, 0);
  assert(JSON.stringify(s0b) === JSON.stringify(s0), 'hot: placed blocks are stable physics blocks (unmoved after a turn)');
  // archer facing + shot plane with a sideways archer (Red moved to z=+0.4)
  const f1 = await facingOk(pg), p1 = await shotPlane(pg, { pitch: 0.5, power: 0.7 });
  assert(f1.every(f => f.upright && f.yawErr < 1e-6) && p1.off < 0.011 && p1.cos > 0.999, `hot: off-axis archers face each other, shot stays in their plane (${JSON.stringify(p1)})`);
  // Bo3: finish round 1 quickly, round 2 resets to the built layout (no new build phase)
  const builtB = await pg.evaluate(() => __game.blocks().map(q => q.slice(0, 3)));
  for (let k = 0; k < 12 && (await pg.evaluate(() => __game.S.phase)) === 'aim' && (await pg.evaluate(() => __game.S.score.join())) === '0,0'; k++) {
    const aim = await pg.evaluate(() => { const t = __game.S.turn; __game.S.hp[1 - t] = __game.S.st.hp[1 - t] = 1; __game.setWind(0, 0); return __game.findHit(); });
    await pg.evaluate(a => __game.shootAim(a || { pitch: 0.3, power: 0.6 }), aim); await settle(pg); await sleep(300);
  }
  const sc = await pg.evaluate(() => __game.S.score.join());
  assert(sc !== '0,0', `hot: round 1 decided (score ${sc})`);
  await pg.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp.every(h => h === 100), { timeout: 30000, polling: 200 });
  const r2 = await pg.evaluate(() => __game.blocks().map(q => q.slice(0, 3)));
  const diff = Math.max(...r2.map((q, i) => Math.hypot(q[0] - builtB[i][0], q[1] - builtB[i][1], q[2] - builtB[i][2])));
  assert(diff < 1e-6 && !(await vis(pg, '#build')) && !(await vis(pg, '#pass')), `hot: round 2 starts from the built layout, no build phase (max diff ${diff})`);
  // fall: knock Red's archer down, then it is upright, faces Blue, and its next shot flies at Blue
  await pg.evaluate(() => { __game.S.seriesChoice = 1; __game.startHot('field', 0); __game.setWind(0, 0); }); await sleep(1500); // plain tower so the base is open
  const red0 = await pg.evaluate(() => __game.st.phys.a[1]);
  const hit = await pg.evaluate(() => { __game.setWind(0, 0); return __game.findBlockHit(__game.layout.map((l, i) => l.s === 1 && l.kind === 'wall' && l.pos[1] < 0.6 ? i : -1).filter(i => i >= 0), 'heavy'); });
  assert(hit, 'hot: aim at the base of Red tower found');
  await pg.evaluate(a => __game.shootAim(a, 'heavy'), hit.aim); await settle(pg); await sleep(500);
  const red1 = await pg.evaluate(() => __game.st.phys.a[1]);
  console.log('red archer', red0, '->', red1);
  assert(red1[1] < red0[1] - 1, `hot: Red's archer fell (${red0[1].toFixed(2)} -> ${red1[1].toFixed(2)})`);
  const f2 = await facingOk(pg);
  assert(f2.every(f => f.upright && f.yawErr < 1e-6), `hot: after the fall both archers upright & facing (${JSON.stringify(f2)})`);
  if ((await pg.evaluate(() => __game.S.turn)) === 1 && (await pg.evaluate(() => __game.S.phase)) === 'aim') {
    const p2 = await shotPlane(pg, { pitch: 0.6, power: 0.8 });
    assert(p2.shooter === 1 && p2.off < 0.011 && p2.cos > 0.999, `hot: fallen Red's next shot heads at Blue in their vertical plane (${JSON.stringify(p2)})`);
    const fired = await pg.evaluate(() => { __game.setWind(0, 0); __game.shootAim({ pitch: 0.6, power: 0.8 }); return true; });
    await sleep(700); await shot(pg, 'hot-fallen-red-shoots');
    const ax = await pg.evaluate(() => __game.S.play && __game.S.play.arrows[0].m.position.toArray());
    assert(fired && ax && ax[0] < red1[0] - 1, `hot: fallen Red's real arrow flies toward Blue's side (x ${ax && ax[0].toFixed(2)})`);
    await settle(pg);
  }
  // sideways-stranded archer (synthetic): Red standing 3 m off the lane still aims at Blue
  const syn = await pg.evaluate(() => { __game.S.turn = 1; __game.st.phys.a[1] = [14.2, 0, 3]; return true; });
  const p3 = await shotPlane(pg, { pitch: 0.4, power: 0.8 });
  assert(syn && p3.off < 0.011 && p3.cos > 0.999, `hot: archer 3 m off the lane still shoots at the opponent (${JSON.stringify(p3)})`);
  await pg.close();
  // Skip: pass card Skip goes straight to a plain match
  const q = await open(740, 360);
  await q.click('#hotBtn'); await sleep(800);
  await shot(q, 'hot-pass-740x360');
  await q.click('#passSkip'); await sleep(900);
  assert(await q.evaluate(() => __game.S.phase) === 'aim' && (await slots(q, 0)).length === 0, 'hot: Skip building -> plain match');
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
  assert(ia.side === 0 && ib.side === 1, 'online: both players in the build phase at once (Blue / Red)');
  const tA = await A.$eval('#bTimer', e => e.textContent);
  assert(/\d+s/.test(tA), `online: build timer shown (${tA})`);
  // invalid plans are rejected by the server
  await A.evaluate(() => { __game.S.lastBuildErr = null; __game.sendPlan({ blocks: [[9, 9]], archer: [0, 0] }, false); }); await sleep(500);
  const e1 = await A.evaluate(() => __game.S.lastBuildErr);
  await A.evaluate(() => { __game.S.lastBuildErr = null; __game.sendPlan({ blocks: Array(9).fill([0, -1]), archer: [0, 0] }, true); }); await sleep(500);
  const e2 = await A.evaluate(() => __game.S.lastBuildErr);
  await A.evaluate(() => { __game.S.lastBuildErr = null; __game.sendPlan({ blocks: [], archer: [5, 5] }, true); }); await sleep(500);
  const e3 = await A.evaluate(() => __game.S.lastBuildErr);
  assert(e1 && e2 && e3 && (await B(A)).phase === 'build', `online: server rejects bad plans (${e1} | ${e2} | ${e3})`);
  // both build privately
  await A.evaluate(p => p.forEach(c => __game.buildPlace(...c)), PLAN0); await A.evaluate(() => __game.buildArcher(-1, -1));
  await Bp.evaluate(p => p.forEach(c => __game.buildPlace(...c)), PLAN1); await Bp.evaluate(() => __game.buildArcher(1, 1));
  await sleep(800);
  assert((await slots(A, 1)).length === 0 && (await slots(Bp, 0)).length === 0, "online: neither sees the other's build");
  await shot(A, 'online-build-A-360x640'); await shot(Bp, 'online-build-B-740x360');
  await A.click('#bReady'); await sleep(700);
  assert(await A.evaluate(() => __game.build.locked || __game.build.sent) && (await B(A)).phase === 'build', 'online: Blue locked in, waiting');
  assert(await Bp.evaluate(() => __game.build.oppReady), 'online: Red sees "Opponent ready"');
  await shot(A, 'online-waiting-360x640');
  await Bp.click('#bReady');
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.phase === 'aim', { timeout: 15000 });
  await sleep(1200);
  const [ma, mb] = await Promise.all([A, Bp].map(P => P.evaluate(() => JSON.stringify(__game.st.phys))));
  assert(ma === mb, 'online: both clients hold exactly the same built layout');
  assert((await slots(A, 0)).length === 8 && (await slots(A, 1)).length === 6 && JSON.stringify(await slots(A, 1)) === JSON.stringify(await slots(Bp, 1)), 'online: both builds revealed on both screens');
  await shot(A, 'online-match-A-360x640'); await shot(Bp, 'online-match-B-740x360');
  const fa = await facingOk(A);
  assert(fa.every(f => f.upright && f.yawErr < 1e-6), 'online: archers upright & facing after the reveal');
  await A.evaluate(() => { __game.S.lastBuildErr = null; __game.sendPlan({ blocks: [[0, -1]], archer: [0, 0] }, true); }); await sleep(500);
  assert(/over/i.test(await A.evaluate(() => __game.S.lastBuildErr)) && (await slots(A, 0)).length === 8, 'online: server refuses building after the start');
  // a shot from the built spot (off the lane) agrees on both clients and heads at the opponent
  const pA = await shotPlane(A, { pitch: 0.45, power: 0.75 });
  assert(pA.off < 0.011 && pA.cos > 0.999, `online: Blue's shot from the moved spot heads at Red (${JSON.stringify(pA)})`);
  await A.evaluate(() => __game.shootAim({ pitch: 0.45, power: 0.75 }));
  await Promise.all([A, Bp].map(P => settle(P))); await sleep(800);
  const [ha, hb] = await Promise.all([A, Bp].map(P => P.evaluate(() => JSON.stringify({ hp: __game.S.hp, d: __game.S.lastDrift }))));
  console.log('after shot', ha, hb);
  assert(JSON.parse(ha).hp.join() === JSON.parse(hb).hp.join(), 'online: shot result agrees');
  await A.close(); await Bp.close();
  // timer: nobody presses Ready -> the server starts with whatever was placed
  const C = await open(360, 640, await b.createBrowserContext()), D = await open(360, 640, await b.createBrowserContext());
  await C.click('#createBtn'); await C.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code2 = await C.$eval('#code', e => e.textContent);
  await D.goto(`${base}/?room=${code2}`, { waitUntil: 'load' });
  for (const P of [C, D]) await P.waitForFunction(() => __game.S.phase === 'build', { timeout: 20000 });
  const secs = await C.evaluate(() => Math.round((__game.build.ends - performance.now()) / 1000));
  const placed = await C.evaluate(() => [__game.buildPlace(0, -1), __game.buildPlace(-2, 0), JSON.stringify(__game.build.plans), __game.S.lastBuildErr]); console.log('timer placed', placed);
  const t0 = Date.now();
  for (const P of [C, D]) await P.waitForFunction(() => __game.S.phase === 'aim', { timeout: 120000, polling: 250 });
  console.log('timer: client countdown', secs, 's, started after', ((Date.now() - t0) / 1000).toFixed(1), 's');
  console.log('timer slots', await slots(C, 0), await slots(D, 0), await slots(D, 1));
  const nPlaced = JSON.parse(placed[2])[0].blocks.length;
  assert(nPlaced >= 1 && (await slots(C, 0)).length === nPlaced && JSON.stringify(await slots(C, 0)) === JSON.stringify(await slots(D, 0)) && (await slots(D, 1)).length === 0, 'online: timer ends the build, unsubmitted plan used, both agree');
  await C.close(); await D.close();
}

console.log(results.length, 'checks passed');
console.log('console errors:', errors.length ? errors : 'none');
await b.close();
if (errors.length) process.exit(1);
