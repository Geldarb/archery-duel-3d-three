// v5.3 checks: per-block tower colours (build picker, Customise default, Auto/Quick play colour, coloured debris, online sync + server validation, Bo3 rounds keep colours).
// Usage: node test/v53.mjs <baseUrl> <outDir> [hot|online|all] [prefix]   (server: LEGACY_TOWERS not needed; BUILD_SECS may be shortened)
import { createRequire } from 'module';
import fs from 'fs';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3947', out = 'shots/v53', which = 'all', pre = 'v53'] = process.argv;
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
const B = pg => pg.evaluate(() => { const s = __game.build; return { side: s.side, color: s.color, plan: JSON.parse(JSON.stringify(s.plans[s.side])), res: JSON.parse(JSON.stringify(s.res[s.side])), msg: s.msg, phase: __game.S.phase }; });
const settle = pg => pg.waitForFunction(() => !__game.S.play && ['aim', 'over', 'menu'].includes(__game.S.phase), { timeout: 60000, polling: 100 });
const noScroll = pg => pg.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1 && document.scrollingElement.scrollWidth <= innerWidth + 1);
const inView = (pg, sel) => pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0; });
const onSw = pg => pg.$$eval('#bColors button.on', a => a.map(e => e.dataset.c));
// mesh colour id per placed block of side s (in placement order)
const meshCols = (pg, s) => pg.evaluate(s => { const i0 = __game.layout.findIndex(l => l.s === s && l.kind === 'build'); return __game.blocks().map((q, i) => [q, i]).filter(([q, i]) => i >= i0 && __game.layout[i].s === s && __game.layout[i].kind === 'build' && q[1] > -20).map(([, i]) => __game.blockColor(i)); }, s);
const meshRgb = (pg, s) => pg.evaluate(s => __game.layout.map((l, i) => (l.s === s && l.kind === 'build' && __game.blocks()[i][1] > -20 ? __game.blockRgb(i) : null)).filter(x => x !== null), s);
// the picker must not cover any cell of the build grid (each cell's ground/top point, projected)
const gridClear = pg => pg.evaluate(() => {
  const rs = [...document.querySelectorAll('#bColors button')].map(e => e.getBoundingClientRect()), bad = [];
  for (let gx = -3; gx <= 2; gx++) for (let gz = -3; gz <= 2; gz++) {
    const [x, y] = __game.cellScreen(gx, gz);
    if (rs.some(r => x > r.left - 4 && x < r.right + 4 && y > r.top - 4 && y < r.bottom + 4)) bad.push([gx, gz]);
  }
  return bad;
});
const IDS = ['stone', 'sand', 'brick', 'blue', 'green', 'purple', 'gold', 'white', 'dark'];
const BLUE30 = []; for (let y = 0; y < 2; y++) for (const gx of [-2, -1, 0]) for (const gz of [-1, 0, 1]) BLUE30.push([gx, gz]);
for (let y = 2; y < 5; y++) for (const gx of [-1, 0]) for (const gz of [-1, 0]) BLUE30.push([gx, gz]);
const BLUE_COLS = BLUE30.map((_, n) => IDS[n % IDS.length]);
const RED = [[-1, 0], [-1, 0], [-1, 0], [-1, 0], [-1, 0], [0, 0], [0, 0]], RED_COLS = ['brick', 'gold', 'brick', 'gold', 'purple', 'green', 'blue'];
const buildMixed = (pg, cells, cols) => pg.evaluate((cells, cols) => cells.map((c, n) => __game.buildColor(cols[n]) && __game.buildPlace(...c)), cells, cols);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (which !== 'online') {
  // ---------------- Customise default ----------------
  const pg = await open(360, 640);
  await pg.click('#customBtn'); await sleep(600);
  assert(await vis(pg, '#swTower') && (await pg.$$('#swTower button')).length === 9, 'customise: Tower colour row with 9 swatches');
  await pg.click('#swTower button[data-v="purple"]'); await sleep(200);
  await pg.click('#custom .tabs button[data-slot="1"]'); await sleep(200);
  await pg.click('#swTower button[data-v="gold"]'); await sleep(200);
  await pg.$eval('#swTower', e => e.scrollIntoView({ block: 'center' })); await sleep(300); await shot(pg, 'customise-tower-360x640');
  const ls = await pg.evaluate(() => [0, 1].map(i => JSON.parse(localStorage.getItem(`ad3t-look-${i}`) || '{}').tower));
  assert(same(ls, ['purple', 'gold']), `customise: tower colours saved with the look in localStorage (${ls})`);
  await pg.reload({ waitUntil: 'load' }); await pg.waitForFunction('window.__ready'); await sleep(400);
  await pg.click('#customBtn'); await sleep(400);
  assert(same(await pg.$$eval('#swTower button.on', a => a.map(e => e.dataset.v)), ['purple']), 'customise: Player 1 tower colour survives a reload');
  await pg.click('#customDone'); await sleep(400);
  // ---------------- hot-seat build: picker + mixed colours ----------------
  await pg.click('#arenas button[data-a="field"]'); await pg.click('#seriesBtns button[data-s="3"]'); await pg.click('#hotBtn'); await sleep(900);
  await pg.click('#passGo'); await sleep(1500);
  let s = await B(pg);
  assert(s.phase === 'build' && s.color === 'purple' && same(await onSw(pg), ['purple']), 'hot: Blue starts with their Customise tower colour (purple) selected');
  assert(await noScroll(pg) && await inView(pg, '#bColors') && await inView(pg, '#bReady') && await inView(pg, '#bUndo') && await inView(pg, '#bTimer'), 'hot 360x640: picker + build bar on screen, no page scroll');
  let bad = await gridClear(pg);
  assert(bad.length === 0, `hot 360x640: picker does not cover the build grid (${JSON.stringify(bad)})`);
  // real taps on swatches
  await pg.tap('#bColors button[data-c="brick"]'); await sleep(200);
  s = await B(pg);
  assert(s.color === 'brick' && same(await onSw(pg), ['brick']) && /brick/i.test(s.msg), `hot: tapping a swatch selects it (${s.msg})`);
  const xy = await pg.evaluate(() => __game.cellScreen(-2, 1)); await pg.touchscreen.tap(...xy); await sleep(300); await pg.touchscreen.tap(...xy); await sleep(300);
  await pg.tap('#bColors button[data-c="blue"]'); await sleep(200);
  await pg.click('#bConfirm'); await sleep(300);
  s = await B(pg);
  assert(same(s.plan.colors, ['brick', 'blue']) && same(s.res.colors, ['brick', 'blue']) && same(await meshCols(pg, 0), ['brick', 'blue']), `hot: real taps placed a brick block then a blue one on top (${s.plan.colors})`);
  const rgb2 = await meshRgb(pg, 0);
  assert(rgb2.length === 2 && rgb2[0] !== rgb2[1], 'hot: the two blocks render in different colours');
  await shot(pg, 'hot-picker-360x640');
  await pg.click('#bUndo'); await sleep(200);
  assert(same((await B(pg)).plan.colors, ['brick']) && (await B(pg)).color === 'blue', 'hot: Undo removes the last block and its colour (selection kept)');
  await pg.evaluate(() => { while (__game.build.hist[0].length) __game.buildUndo(); });
  const okB = await buildMixed(pg, BLUE30, BLUE_COLS); await pg.evaluate(() => __game.buildArcher(0, 0));
  s = await B(pg);
  assert(okB.every(Boolean) && same(s.plan.colors, BLUE_COLS) && same(s.res.colors, BLUE_COLS), 'hot: 30 blocks placed in all 9 colours, the plan keeps each block\'s colour');
  assert(same(await meshCols(pg, 0), BLUE_COLS) && new Set(await meshRgb(pg, 0)).size >= 9, 'hot: every block mesh shows its own colour');
  const archerKeep = await pg.evaluate(() => { __game.buildArcher(-3, 0); const c = __game.build.plans[0].colors.join(); __game.buildArcher(0, 0); return c; });
  assert(archerKeep === BLUE_COLS.join(), 'hot: moving the archer keeps the colours');
  const v = await pg.evaluate(() => [__game.validate(0, { blocks: [[0, 0]], colors: ['pink'], archer: [0, 0] }).err, __game.validate(0, { blocks: [[0, 0]], colors: [], archer: [0, 0] }).err, __game.validate(0, { blocks: [[0, 0]], archer: [0, 0] }).colors]);
  assert(/colour/i.test(v[0]) && /colour/i.test(v[1]) && same(v[2], ['sand']), `hot: validator rejects unknown/mismatched colours, missing = sandstone (${v[0]})`);
  await sleep(600); await shot(pg, 'hot-blue-mixed-360x640');
  await pg.click('#bReady'); await sleep(700);
  await vp(pg, 740, 360); await sleep(300);
  await pg.click('#passGo'); await sleep(1200);
  s = await B(pg);
  assert(s.side === 1 && s.color === 'gold' && same(await onSw(pg), ['gold']), "hot: Red starts with Red's tower colour (gold)");
  assert(await noScroll(pg) && await inView(pg, '#bColors') && await inView(pg, '#bReady') && await inView(pg, '#bTimer'), 'hot 740x360: picker + build bar on screen, no scroll');
  const okR = await buildMixed(pg, RED, RED_COLS); await pg.evaluate(() => __game.buildArcher(-1, 1));
  bad = await gridClear(pg);
  assert(okR.every(Boolean) && bad.length === 0, `hot 740x360: Red builds mixed colours; picker clear of the grid (${JSON.stringify(bad)})`);
  await sleep(600); await shot(pg, 'hot-red-picker-740x360');
  await pg.click('#bReady');
  await pg.waitForFunction(() => __game.S.phase === 'aim', { timeout: 15000 });
  await vp(pg, 360, 640); await sleep(1000);
  const c0 = await meshCols(pg, 0), c1 = await meshCols(pg, 1), sc = await pg.evaluate(() => __game.colors);
  assert(same(c0, BLUE_COLS) && same(c1, RED_COLS) && same(sc, [BLUE_COLS, RED_COLS]), 'hot: match shows both towers in their built colours');
  await shot(pg, 'hot-match-colours-360x640');
  // coloured debris: hit a built block, the chunks take that block's colour
  const hb = await pg.evaluate(() => { __game.setWind(0, 0); const t = __game.S.turn, ids = __game.layout.map((l, i) => (l.s === 1 - t && l.kind === 'build' ? i : -1)).filter(i => i >= 0); return __game.findBlockHit(ids, 'heavy'); });
  assert(hb, 'hot: aim at a built block found');
  await pg.evaluate(a => __game.shootAim(a, 'heavy'), hb.aim); await sleep(1600);
  const deb = await pg.evaluate(i => ({ want: __game.chunkHex(__game.blockHex(i)), got: __game.debrisHex(), col: __game.blockColor(i) }), hb.block);
  assert(deb.got.includes(deb.want), `hot: debris from a ${deb.col} block uses its colour (${deb.want.toString(16)} in ${[...new Set(deb.got)].map(x => x.toString(16))})`);
  await settle(pg); await sleep(300);
  // Bo3 round 2 keeps the colours
  for (let k = 0; k < 12 && (await pg.evaluate(() => __game.S.phase)) === 'aim' && (await pg.evaluate(() => __game.S.score.join())) === '0,0'; k++) {
    const aim = await pg.evaluate(() => { const t = __game.S.turn; __game.S.hp[1 - t] = __game.S.st.hp[1 - t] = 1; __game.setWind(0, 0); return __game.findHit(); });
    await pg.evaluate(a => __game.shootAim(a || { pitch: 0.3, power: 0.6 }), aim); await settle(pg); await sleep(300);
  }
  assert((await pg.evaluate(() => __game.S.score.join())) !== '0,0', 'hot: round 1 decided');
  await pg.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp.every(h => h === 100), { timeout: 30000, polling: 200 });
  await sleep(500);
  assert(same(await meshCols(pg, 0), BLUE_COLS) && same(await meshCols(pg, 1), RED_COLS) && same(await pg.evaluate(() => __game.colors), [BLUE_COLS, RED_COLS]), 'hot: Bo3 round 2 resets the towers with the same colours');
  await shot(pg, 'hot-round2-colours-360x640');
  await pg.close();
  // Quick play / Auto use each player's tower colour
  const q = await open(740, 360);
  await q.click('#hotBtn'); await sleep(800); await q.click('#passSkip'); await sleep(1200);
  const q0 = await meshCols(q, 0), q1 = await meshCols(q, 1);
  assert(q0.length === 30 && q1.length === 30 && q0.every(c => c === 'purple') && q1.every(c => c === 'gold'), 'hot: Quick play towers use the Customise tower colours (purple / gold)');
  await shot(q, 'quickplay-colours-740x360');
  await q.evaluate(() => __game.startHotBuild('field', 0)); await sleep(500); await q.click('#passGo'); await sleep(500);
  await q.click('#bColors button[data-c="green"]'); await q.click('#bSkip'); await sleep(500);
  const ar = await q.evaluate(() => __game.build.res[0].colors);
  assert(ar.length === 30 && ar.every(c => c === 'purple'), 'hot: Auto builds in the Customise tower colour');
  await q.close();
}

if (which !== 'hot') {
  // ---------------- online ----------------
  const cA = await b.createBrowserContext(), cB = await b.createBrowserContext();
  const A = await open(360, 640, cA), Bp = await open(740, 360, cB);
  await A.evaluate(() => localStorage.setItem('ad3t-look-0', JSON.stringify({ name: 'Ann', tower: 'green' })));
  await Bp.evaluate(() => localStorage.setItem('ad3t-look-0', JSON.stringify({ name: 'Bob', tower: 'dark' })));
  for (const P of [A, Bp]) { await P.reload({ waitUntil: 'load' }); await P.waitForFunction('window.__ready'); await sleep(300); }
  await A.click('#arenas button[data-a="field"]'); await A.click('#seriesBtns button[data-s="3"]'); await A.click('#createBtn');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code = await A.$eval('#code', e => e.textContent);
  await Bp.goto(`${base}/?room=${code}`, { waitUntil: 'load' });
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'build', { timeout: 20000 });
  await sleep(800);
  const [ia, ib] = [await B(A), await B(Bp)];
  assert(ia.color === 'green' && ib.color === 'dark', `online: each player starts with their own tower colour (${ia.color} / ${ib.color})`);
  assert(await noScroll(A) && await inView(A, '#bColors') && await noScroll(Bp) && await inView(Bp, '#bColors') && (await gridClear(A)).length === 0 && (await gridClear(Bp)).length === 0, 'online: picker fits 360x640 and 740x360 without covering the grid');
  const errs = [];
  for (const plan of [{ blocks: [[0, 0]], colors: ['pink'], archer: [0, 0] }, { blocks: [[0, 0], [1, 1]], colors: ['blue'], archer: [0, 0] }, { blocks: [[0, 0]], colors: 'blue', archer: [0, 0] }, { blocks: [[0, 0]], colors: [{ hex: 1 }], archer: [0, 0] }]) {
    await A.evaluate(p => { __game.S.lastBuildErr = null; __game.sendPlan(p, false); }, plan); await sleep(400);
    errs.push(await A.evaluate(() => __game.S.lastBuildErr));
  }
  assert(errs.every(e => /colour/i.test(e || '')), `online: server rejects colours outside the palette / mismatched (${errs.join(' | ')})`);
  await buildMixed(A, BLUE30, BLUE_COLS); await A.evaluate(() => __game.buildArcher(0, 0));
  await buildMixed(Bp, RED, RED_COLS); await Bp.evaluate(() => __game.buildArcher(-1, 1));
  await sleep(1000);
  await shot(A, 'online-build-A-360x640'); await shot(Bp, 'online-build-B-740x360');
  await A.click('#bReady'); await sleep(500); await Bp.click('#bReady');
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.phase === 'aim', { timeout: 15000 });
  await sleep(1200);
  const [ka, kb] = await Promise.all([A, Bp].map(P => P.evaluate(() => JSON.stringify(__game.colors))));
  assert(ka === kb && ka === JSON.stringify([BLUE_COLS, RED_COLS]), 'online: both clients got the same per-block colours from the server');
  for (const s of [0, 1]) assert(same(await meshCols(A, s), [BLUE_COLS, RED_COLS][s]) && same(await meshCols(Bp, s), [BLUE_COLS, RED_COLS][s]) && same(await meshRgb(A, s), await meshRgb(Bp, s)), `online: side ${s} tower renders the same colours on both screens`);
  await shot(A, 'online-match-A-360x640'); await shot(Bp, 'online-match-B-740x360');
  // play to the end of round 1 (body hits), round 2 keeps the colours
  for (let k = 0; k < 30; k++) {
    const sc = await A.evaluate(() => __game.S.score.join());
    if (sc !== '0,0') break;
    const turn = await A.evaluate(() => __game.S.turn), P = turn === 0 ? A : Bp;
    const aim = await P.evaluate(() => { __game.setWind && (__game.S.wind = __game.S.wind); return __game.findHit('normal'); });
    await P.evaluate(a => __game.shootAim(a || { pitch: 0.4, power: 0.7 }), aim);
    await Promise.all([A, Bp].map(X => settle(X).catch(() => {}))); await sleep(600);
  }
  assert((await A.evaluate(() => __game.S.score.join())) !== '0,0', `online: round 1 decided (${await A.evaluate(() => __game.S.score.join())})`);
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp.every(h => h === 100), { timeout: 30000, polling: 200 });
  await sleep(1000);
  const [ra, rb] = await Promise.all([A, Bp].map(P => P.evaluate(() => JSON.stringify(__game.colors))));
  assert(ra === rb && ra === ka && same(await meshCols(A, 0), BLUE_COLS) && same(await meshCols(Bp, 1), RED_COLS), 'online: round 2 keeps every block colour on both clients');
  await shot(A, 'online-round2-A-360x640'); await shot(Bp, 'online-round2-B-740x360');
  await A.close(); await Bp.close();
}

console.log(results.length, 'checks passed');
console.log('console errors:', errors.length ? errors : 'none');
await b.close();
if (errors.length) process.exit(1);
