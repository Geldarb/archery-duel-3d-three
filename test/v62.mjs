// v6.2 checks: 'Arrow Becomes You' mode (teleport to the landing spot, bonk, no swap when lost, falls) + the 'jesus' easter egg (every special, halo).
// Usage: node test/v62.mjs <baseUrl> <outDir> [hot|online|all] [prefix]   (works against a plain server: the jesus egg needs no TEST_AMMO)
// V62_LAND=1: hot-seat in landscape (740x360) instead of portrait (360x640). Online: client A (jesus) is 360x640, client B is 740x360.
import { createRequire } from 'module';
import fs from 'fs';
import * as sim from '../public/sim.js';
import * as phys from '../public/physics.js';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3962', out = 'shots/v62', which = 'all', pre = 'v62'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const errors = [], sleep = ms => new Promise(r => setTimeout(r, ms)), results = [];
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); results.push('ok ' + m); console.log('ok', m); };
const SZ = process.env.V62_LAND ? [740, 360] : [360, 640];
const near = (a, b, d = 0.35) => Math.hypot(a[0] - b[0], a[2] - b[2]) < d;

// ---------------- 0. rules (node, no browser) ----------------
{
  const w = sim.makeWorld('field'), st = sim.newRound(sim.rng(7), null, { swap: 1 }), wind = { x: 0, z: 0 };
  const fake = (kind, pos, extra = {}) => ({ type: 'normal', shooter: 0, arrows: [{ res: { kind, pos, t: 1, ...extra } }] });
  assert(sim.warpTarget(w, 0, fake('out', [90, 3, 0]), st).why === 'out', 'rules: an arrow lost off the map = no teleport');
  assert(sim.warpTarget(w, 0, fake('pickup', [0, 3, 0]), st).why === 'pickup', 'rules: catching a power-up = no teleport');
  assert(sim.warpTarget(w, 0, fake('ground', [30, 0, 0]), st).why === 'past', 'rules: sailing past the enemy = no teleport');
  const cz = sim.warpTarget(w, 0, fake('ground', [-6, 0, 30]), st);
  assert(cz.p && Math.abs(cz.p[2]) <= sim.WARP.field[1] + 1e-9, `rules: landing spot clamped to the field (z ${cz.p && cz.p[2]})`);
  const rv = sim.warpTarget(w, 0, fake('ground', [w.riverX(0) + 0.5, -0.5, 0]), st);
  assert(Math.abs(rv.p[0] - w.riverX(0)) >= sim.WARP.river - 1e-9, 'rules: never left standing in the river');
  let ground = null, hit = null, block = null;
  for (let pd = 3; pd <= 75 && !(ground && hit && block); pd += 1) for (let pw = 0.3; pw <= 1; pw += 0.01) {
    const s = sim.simulateShot(w, 0, { pitch: pd * Math.PI / 180, power: pw }, wind, 'normal', st), r = s.arrows[0].res;
    if (!ground && r.kind === 'ground' && s.warp && Math.abs(s.warp.p[0]) < 9) ground = s;
    if (!hit && r.who === 1) hit = s;
    if (!block && r.kind === 'block' && r.pos[1] > 2 && s.warp) { const q = phys.resolvePhysics(st.phys, s, st); if (q.phys.a[0][1] > 1) block = s; }
  }
  let res = phys.resolvePhysics(st.phys, ground, st);
  assert(near(res.phys.a[0], ground.warp.p, 0.05) && Math.abs(res.phys.a[0][1] - ground.warp.p[1]) < 0.1 && near(res.phys.a[1], st.phys.a[1], 0.01), `rules: ground shot moves the shooter to the landing spot (${res.phys.a[0].map(v => v.toFixed(2))})`);
  res = phys.resolvePhysics(st.phys, hit, st);
  const bonk = res.log.find(l => l.kind === 'bonk');
  assert(bonk && bonk.who === 1 && bonk.dmg === sim.WARP.bonkDmg && Math.hypot(res.phys.a[0][0] - res.phys.a[1][0], res.phys.a[0][2] - res.phys.a[1][2]) < 2.5, 'rules: a direct hit lands you beside them + a melee BONK');
  res = phys.resolvePhysics(st.phys, block, st);
  assert(res.phys.a[0][1] > 1 && res.phys.a[0][0] > 5, `rules: a high block hit puts you on top of that tower (feet ${res.phys.a[0].map(v => v.toFixed(2))})`);
  // land on top of a block that the same shot knocks loose: ordinary fall damage applies
  let fell = null;
  for (let pd = 3; pd <= 40 && !fell; pd += 1) for (let pw = 0.5; pw <= 1 && !fell; pw += 0.01) {
    const s = sim.simulateShot(w, 0, { pitch: pd * Math.PI / 180, power: pw }, wind, 'normal', st);
    if (s.arrows[0].res.kind !== 'block' || !s.warp) continue;
    const run = new phys.PhysRun(st.phys, phys.shotEvents(s, st)); run.run();
    const wp = run.fx.find(e => e.kind === 'warp');
    if (wp && wp.p[1] > 1 && run.log.some(l => l.who === 0 && l.k > wp.k && (l.kind === 'fall' || l.kind === 'ground'))) fell = run;
  }
  assert(fell, 'rules: standing on a block that gets knocked down = normal fall damage');
  const j = sim.newRound(sim.rng(1), null, { jesus: [1, 0] });
  assert(sim.SPECIALS.every(k => sim.canFire(j, 0, k) && !sim.canFire(j, 1, k)) && sim.isJesus({ name: '  JeSuS ' }) && !sim.isJesus({ name: 'jesús' }), 'rules: jesus may fire every special without ammo; the other player may not');
}

const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const shot = (pg, name) => { const v = pg.viewport(); return pg.screenshot({ captureBeyondViewport: false, path: `${out}/${pre}-${name}-${v.width}x${v.height}.png` }); };
async function open(w, h, ctx = b, url = base, init = null) {
  const pg = await ctx.newPage(), touch = w < 900;
  await pg.setViewport({ width: w, height: h, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  pg.on('console', m => { if (m.type() === 'error') errors.push(`${w}x${h}: ${m.text()}`); });
  pg.on('pageerror', e => errors.push(`${w}x${h}: ${e.message}`));
  if (init) await pg.evaluateOnNewDocument(init);
  await pg.goto(url, { waitUntil: 'load' }); await pg.waitForFunction('window.__ready', { timeout: 30000 }); await sleep(500);
  return pg;
}
const settle = pg => pg.waitForFunction(() => !__game.S.play && ['aim', 'over', 'menu', 'round'].includes(__game.S.phase), { timeout: 90000, polling: 100 });
const noScroll = pg => pg.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1 && document.scrollingElement.scrollWidth <= innerWidth + 1);
const F = pg => pg.evaluate(() => __game.fun());
const J = pg => pg.evaluate(() => __game.jesus());
const findAim = (pg, type, test) => pg.evaluate((type, test) => {
  const f = new Function('s', 'g', 'return ' + test), D = Math.PI / 180;
  for (let pd = 3; pd <= 75; pd += 1) for (let pw = 0.3; pw <= 1; pw += 0.004) { const aim = { pitch: pd * D, power: pw }, s = __game.simulate(aim, type); if (f(s, __game)) return aim; }
  return null;
}, type, test);
const waitFun = (pg, key, n = 1) => pg.waitForFunction((k, n) => (__game.fun()[k] || 0) >= n, { timeout: 30000, polling: 30 }, key, n);
const GROUND_MID = "s.arrows[0].res.kind === 'ground' && !!s.warp && Math.abs(s.warp.p[0]) < 9";
const HIT_ENEMY = "s.arrows[0].res.who === 1 - g.S.turn && !!s.warp";
const HUD_SELS = ['#hp0', '#hp1', '#mid', '#menuBtn', '#fsGame', '#camBtn', '#types', '#hint'];
const layout = pg => pg.evaluate(sels => {
  const R = sels.map(s => [s, document.querySelector(s)]).filter(([, e]) => e && !e.classList.contains('hidden') && e.offsetWidth > 0 && getComputedStyle(e).display !== 'none').map(([s, e]) => [s, e.getBoundingClientRect()]), bad = [];
  for (const [s, r] of R) if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) bad.push('off:' + s);
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const [s, a] = R[i], [t, c] = R[j]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) bad.push(`${s}x${t}`); }
  return bad;
}, HUD_SELS);
const inView = (pg, sel) => pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0; });

if (which !== 'online') {
  // ---------------- 1. menu toggle fits portrait + landscape ----------------
  const pm = await open(360, 640);
  await pm.click('#swapBtn'); await sleep(200);
  assert(await pm.evaluate(() => __game.swapChoice) === true && await pm.$eval('#swapBtn', e => e.classList.contains('on')), 'menu: Arrow Becomes You chip toggles on');
  assert(await noScroll(pm) && await inView(pm, '#swapBtn') && await inView(pm, '#createBtn'), 'menu 360x640: chip visible, no scroll');
  await shot(pm, 'menu');
  await pm.setViewport({ width: 740, height: 360, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(600);
  assert(await noScroll(pm) && await inView(pm, '#swapBtn'), 'menu 740x360: chip visible, no scroll');
  await shot(pm, 'menu');
  await pm.click('#swapBtn'); assert(await pm.evaluate(() => __game.swapChoice) === false, 'menu: chip toggles off again');
  // customise: typing jesus gives the halo preview
  await pm.setViewport({ width: 360, height: 640, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(400);
  await pm.click('#customBtn'); await sleep(600);
  await pm.click('#nameIn', { clickCount: 3 }); await pm.keyboard.type('jesu'); await sleep(250);
  assert((await J(pm)).preview === false, 'customise: "jesu" is a normal archer');
  await pm.keyboard.type('s'); await sleep(400);
  let jj = await J(pm);
  assert(jj.preview === true && jj.pvHalos === 1, 'customise: typing "jesus" adds the halo (with a sparkle)');
  await shot(pm, 'customise-jesus');
  await pm.click('#nameIn', { clickCount: 3 }); await pm.keyboard.type('baldy mordy'); await sleep(400);
  assert(await pm.evaluate(() => __game.baldy().preview) === true && (await J(pm)).preview === false, 'customise: the baldy mordy egg still works');
  await pm.close();

  // ---------------- 2. hot-seat Arrow Becomes You: teleport + bonk ----------------
  const pg = await open(SZ[0], SZ[1], b, base, "localStorage.removeItem('ad3t-look-0'); localStorage.removeItem('ad3t-look-1');");
  await pg.evaluate(() => { __game.setSwap(true); __game.startHot('field', 0); __game.setWind(0, 0); }); await sleep(1500);
  assert(await pg.evaluate(() => __game.st.swap) === 1, 'hot: match is in Arrow Becomes You mode');
  let aim = await findAim(pg, 'normal', GROUND_MID); assert(aim, 'hot: aim for a mid-field ground shot');
  const want = await pg.evaluate(a => __game.simulate(a).warp.p, aim);
  await pg.evaluate(a => __game.shootAim(a), aim);
  await waitFun(pg, 'warps'); await sleep(120); await shot(pg, 'hot-poof');
  await settle(pg); await sleep(300);
  let ft = await pg.evaluate(() => __game.feet()), sa = await pg.evaluate(() => __game.st.phys.a);
  assert(near(ft[0], want) && near(sa[0], want) && Math.abs(sa[0][1] - want[1]) < 0.15, `hot: blue teleported to the landing spot (${ft[0]}) and stands there`);
  assert((await layout(pg)).length === 0 && await noScroll(pg), `hot ${SZ}: HUD fits after the teleport`);
  await shot(pg, 'hot-landed');
  await pg.evaluate(() => __game.setWind(0, 0));
  aim = await findAim(pg, 'normal', HIT_ENEMY); assert(aim, 'hot: red can hit blue');
  const hp0 = await pg.evaluate(() => __game.S.hp[0]);
  await pg.evaluate(a => __game.shootAim(a), aim);
  await waitFun(pg, 'bonks'); await sleep(150); await shot(pg, 'hot-bonk');
  await settle(pg); await sleep(300);
  ft = await pg.evaluate(() => __game.feet());
  const hp1 = await pg.evaluate(() => __game.S.hp[0]);
  assert(Math.hypot(ft[0][0] - ft[1][0], ft[0][2] - ft[1][2]) < 4 && hp0 - hp1 >= sim.WARP.bonkDmg + 10, `hot: red hit blue, popped up beside them and BONKED (hp ${hp0} -> ${hp1})`);
  const fx = await pg.evaluate(() => [...document.querySelectorAll('#hp0,#hp1')].every(e => e.getBoundingClientRect().width > 0));
  assert(fx, 'hot: HUD still shows both archers');
  await pg.close();

  // ---------------- 3. hot-seat jesus: every special, unlimited, halo ----------------
  const pj = await open(SZ[0], SZ[1], b, base, "localStorage.setItem('ad3t-look-0', JSON.stringify({ name: 'Jesus' })); localStorage.setItem('ad3t-look-1', JSON.stringify({ name: 'Baldy Mordy' }));");
  await pj.evaluate(() => { __game.setSwap(false); __game.startHot('field', 0); __game.setWind(0, 0); }); await sleep(1500);
  jj = await J(pj);
  assert(jj.archers[0] && !jj.archers[1] && jj.halo[0] && jj.st[0] === 1 && jj.st[1] === 0 && jj.revealed === 1, 'hot jesus: blue has the halo and the egg flag');
  assert(await pj.evaluate(() => __game.baldy().archers[1]) === true, 'hot jesus: red is still the baldy mordy wizard');
  assert(jj.picker.length === sim.SPECIALS.length && jj.picker.every(([, n]) => n === '∞'), `hot jesus: picker offers all ${sim.SPECIALS.length} specials, unlimited`);
  assert((await layout(pj)).length === 0 && await noScroll(pj), `hot jesus ${SZ}: 13-button picker fits`);
  await shot(pj, 'jesus-picker');
  assert(await pj.evaluate(() => __game.pickType('cow')) === 'cow', 'hot jesus: pick the cow without having one');
  aim = await findAim(pj, 'cow', "s.arrows[0].res.kind !== 'out'");
  await pj.evaluate(a => __game.shootAim(a, 'cow'), aim);
  await pj.waitForFunction(() => __game.S.play, { timeout: 5000 });
  assert((await F(pj)).type === 'cow', 'hot jesus: the cow really flies');
  await settle(pj); await sleep(300);
  assert((await J(pj)).picker.length === 0, 'hot jesus: red (not jesus) gets no free specials');
  await pj.close();
}

if (which !== 'hot') {
  // ---------------- 4. online: jesus creates an Arrow Becomes You room ----------------
  const cA = await b.createBrowserContext(), cB = await b.createBrowserContext();
  const A = await open(360, 640, cA, base, "localStorage.setItem('ad3t-look-0', JSON.stringify({ name: 'jesus' }));"), Bp = await open(740, 360, cB, base, "localStorage.removeItem('ad3t-look-0');");
  await A.click('#arenas button[data-a="field"]'); await A.click('#swapBtn'); await A.click('#createBtn');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  assert(/Arrow Becomes You/.test(await A.$eval('#lobbyBest', e => e.textContent)), 'online: lobby shows the Arrow Becomes You room');
  const code = await A.$eval('#code', e => e.textContent);
  await Bp.goto(`${base}/?room=${code}`, { waitUntil: 'load' });
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'build', { timeout: 30000 });
  await sleep(800);
  assert(await A.evaluate(() => __game.S.me) === 0, 'online: jesus is player 1');
  await A.evaluate(() => __game.sendPlan(__game.autoPlan(0), true)); await Bp.evaluate(() => __game.sendPlan(__game.autoPlan(1), true));
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.phase === 'aim', { timeout: 40000 });
  await sleep(1500);
  const js = await Promise.all([A, Bp].map(J)), sw = await Promise.all([A, Bp].map(X => X.evaluate(() => __game.st.swap)));
  assert(sw.every(v => v === 1) && js.every(x => x.archers[0] && !x.archers[1] && x.halo[0] && x.st[0] === 1 && x.st[1] === 0), 'online: both clients see the swap mode and the halo on jesus');
  assert(js[0].picker.length === sim.SPECIALS.length && js[0].picker.every(([, n]) => n === '∞'), 'online: jesus gets the full special picker');
  await shot(A, 'online-jesus-A'); await shot(Bp, 'online-jesus-B');
  const turn = await A.evaluate(() => __game.S.turn);
  if (turn !== 0) { // red starts: a plain shot first
    const a2 = await findAim(Bp, 'normal', GROUND_MID); await Bp.evaluate(a => __game.shootAim(a), a2);
    await Promise.all([A, Bp].map(settle)); await sleep(500);
  }
  await A.evaluate(() => __game.setWind && 0);
  const aimJ = await findAim(A, 'boot', "s.arrows[0].res.kind === 'ground' && !!s.warp && Math.abs(s.warp.p[0]) < 10");
  assert(aimJ, 'online: jesus aims a boot (no ammo held) at mid-field');
  const wantJ = await A.evaluate(a => __game.simulate(a, 'boot').warp.p, aimJ);
  await A.evaluate(() => __game.pickType('boot'));
  await A.evaluate(a => __game.shootAim(a, 'boot'), aimJ);
  await Promise.all([A, Bp].map(X => waitFun(X, 'warps'))); await sleep(150); await shot(A, 'online-poof-A'); await shot(Bp, 'online-poof-B');
  await Promise.all([A, Bp].map(settle)); await sleep(600);
  const fa = await Promise.all([A, Bp].map(F)), stA = await A.evaluate(() => JSON.stringify(__game.st.phys.a)), stB = await Bp.evaluate(() => JSON.stringify(__game.st.phys.a));
  const feetA = await A.evaluate(() => __game.feet()), feetB = await Bp.evaluate(() => __game.feet());
  assert(fa.every(f => f.type === 'boot'), 'online: the server let jesus fire the boot');
  assert(stA === stB && near(feetA[0], wantJ, 0.6) && near(feetB[0], wantJ, 0.6) && near(feetA[0], feetB[0], 0.05), `online: jesus teleported to the landing spot on both clients (${feetA[0]})`);
  const hp = await Promise.all([A, Bp].map(X => X.evaluate(() => JSON.stringify(__game.S.hp))));
  assert(hp[0] === hp[1], `online: HP in sync (${hp[0]})`);
  assert((await layout(A)).length === 0 && (await layout(Bp)).length === 0 && await noScroll(A) && await noScroll(Bp), 'online: HUD fits on both phones');
  await shot(A, 'online-landed-A'); await shot(Bp, 'online-landed-B');
  // red (not jesus) can't cheat a special through the server
  await Bp.evaluate(() => __game.S.types && 0);
  const aimR = await findAim(Bp, 'normal', "s.arrows[0].res.kind !== 'out'");
  await Bp.evaluate(a => { __game.S.types[__game.S.turn] = 'cow'; __game.S.aim = a; __game.S.draw = 1; return true; }, aimR);
  await Bp.evaluate(a => __game.shootAim(a, 'cow'), aimR);
  await Promise.all([A, Bp].map(X => X.waitForFunction(() => __game.S.play, { timeout: 10000 })));
  assert((await F(A)).type === 'normal', 'online: red asking for a cow without ammo gets a normal arrow');
  await Promise.all([A, Bp].map(settle));
}
await b.close();
const errs = errors.filter(e => !/favicon|ERR_|Failed to load resource/.test(e));
fs.writeFileSync(`${out}/${pre}-results.txt`, results.join('\n') + '\n' + (errs.length ? 'ERRORS\n' + errs.join('\n') : 'no console errors') + '\n');
assert(errs.length === 0, `no console errors (${errs.slice(0, 3).join(' | ')})`);
console.log('ALL OK', results.length);
