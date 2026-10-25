// v6.1 FUN DROP 2 checks: banana peel + bouncy castle build pieces, pigeon strike, toilet roll arrow, disco mode, big head (special + match toggle), grandma.
// Usage: node test/v61.mjs <baseUrl> <outDir> [hot|online|all] [prefix]   (online needs a server with TEST_AMMO=pigeon,toilet,disco,bighead,grandma)
// V61_LAND=1: hot-seat shots in landscape (740x360) instead of portrait (360x640). Online: client A is 360x640, client B is 740x360.
import { createRequire } from 'module';
import fs from 'fs';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3947', out = 'shots/v61', which = 'all', pre = 'v61'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], sleep = ms => new Promise(r => setTimeout(r, ms)), results = [];
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); results.push('ok ' + m); console.log('ok', m); };
const shot = (pg, name) => { const v = pg.viewport(); return pg.screenshot({ captureBeyondViewport: false, path: `${out}/${pre}-${name}-${v.width}x${v.height}.png` }); };
const SZ = process.env.V61_LAND ? [740, 360] : [360, 640];
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
const ST = pg => pg.evaluate(() => __game.status());
const findAim = (pg, type, test) => pg.evaluate((type, test) => {
  const f = new Function('s', 'g', 'return ' + test), D = Math.PI / 180;
  for (let pd = 3; pd <= 75; pd += 1) for (let pw = 0.3; pw <= 1; pw += 0.004) { const aim = { pitch: pd * D, power: pw }, s = __game.simulate(aim, type); if (f(s, __game)) return aim; }
  return null;
}, type, test);
const waitFun = (pg, key, n = 1) => pg.waitForFunction((k, n) => (__game.fun()[k] || 0) >= n, { timeout: 30000, polling: 30 }, key, n);
const HIT_ENEMY = "s.arrows[0].res.who === 1 - g.S.turn";
const WRAPS = "(r => r.who === 1 - g.S.turn || (r.kind !== 'out' && r.kind !== 'pickup' && (a => Math.hypot(r.pos[0] - a[0], r.pos[1] - a[1] - 0.8, r.pos[2] - a[2]) < 2.2)(g.S.st.phys.a[1 - g.S.turn])))(s.arrows[0].res)";
const ANY_LAND = "s.arrows[0].res.kind !== 'out'";
const HUD_SELS = ['#hp0', '#hp1', '#mid', '#menuBtn', '#fsGame', '#camBtn', '#types', '#hint'];
const layout = pg => pg.evaluate(sels => {
  const R = sels.map(s => [s, document.querySelector(s)]).filter(([, e]) => e && !e.classList.contains('hidden') && e.offsetWidth > 0 && getComputedStyle(e).display !== 'none').map(([s, e]) => [s, e.getBoundingClientRect()]), bad = [];
  for (const [s, r] of R) if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) bad.push('off:' + s);
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const [s, a] = R[i], [t, c] = R[j]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) bad.push(`${s}x${t}`); }
  return bad;
}, HUD_SELS);
// red's tower: bouncy castle blocks 16,17, banana peels 26,29 (29 is right under the archer)
const KINDS1 = "(p => ({ ...p, kinds: p.blocks.map((_, n) => n === 16 || n === 17 ? 'bouncy' : n === 26 || n === 29 ? 'banana' : 'block') }))(__game.autoPlan(1))";

if (which !== 'online') {
  // ---------------- 1. build palette: piece limits ----------------
  const pb = await open(SZ[0], SZ[1]);
  await pb.evaluate(() => __game.startHotBuild('field', 0)); await sleep(600); await pb.evaluate(() => __game.passGo()); await sleep(800);
  const tools = await pb.$$eval('#bTool button', bs => bs.map(b => b.dataset.tool + ':' + !!b.querySelector('svg')));
  assert(tools.join() === 'block:true,banana:true,bouncy:true,archer:true', `build: palette has block / banana peel / bouncy castle / archer with icons (${tools})`);
  assert(await pb.evaluate(() => __game.buildTool('banana')) === 'banana', 'build: banana tool selected');
  const placed = [];
  for (const c of [[-3, -3], [-3, -3], [-2, -3]]) placed.push(await pb.evaluate(c => __game.buildPlace(c[0], c[1]), c));
  let kinds = await pb.evaluate(() => __game.kinds());
  assert(placed[0] && placed[1] && kinds.filter(k => k === 'banana').length === 2, `build: 2 banana peels placed (${placed})`);
  assert(await pb.evaluate(() => __game.build.tool) === 'block', 'build: banana limit reached, tool falls back to blocks');
  await pb.evaluate(() => __game.buildTool('banana'));
  assert(!(await pb.evaluate(() => __game.buildPlace(-1, -3))) && /Only 2 banana/i.test(await pb.$eval('#bMsg', e => e.textContent)), 'build: a 3rd banana peel is refused');
  await pb.evaluate(() => __game.buildTool('bouncy'));
  for (const c of [[2, 2], [2, 1], [1, 2]]) await pb.evaluate(c => __game.buildPlace(c[0], c[1]), c);
  await pb.evaluate(() => __game.buildTool('bouncy'));
  assert(!(await pb.evaluate(() => __game.buildPlace(1, 1))), 'build: a 4th bouncy castle is refused');
  kinds = await pb.evaluate(() => __game.kinds());
  const dec = await pb.evaluate(() => __game.decos());
  assert(kinds.filter(k => k === 'bouncy').length === 3 && dec.filter(d => d.kind === 'bouncy').length === 3 && dec.filter(d => d.kind === 'banana').length === 2, `build: 3 bouncy + 2 banana pieces with their 3D decorations (${kinds})`);
  const cnt = await pb.$$eval('#bTool .cnt', es => es.map(e => e.textContent));
  assert(cnt[1] === '0' && cnt[2] === '0', `build: palette counters show what is left (${cnt})`);
  const v = await pb.evaluate(() => __game.validate(0, { ...__game.autoPlan(0), kinds: __game.autoPlan(0).blocks.map((_, n) => n < 3 ? 'banana' : 'block') }));
  assert(!v.ok && /banana/i.test(v.err), `rules: validateBuild refuses 3 banana peels (${v.err})`);
  await pb.evaluate(() => __game.buildTool('block')); await sleep(800);
  assert(await noScroll(pb), `build ${SZ}: fits, no scroll`);
  await shot(pb, 'build-palette');
  await pb.close();

  // ---------------- 2. hot-seat match: red has bouncy + banana pieces ----------------
  const pg = await open(SZ[0], SZ[1]);
  await pg.evaluate(k => { const p1 = eval(k); __game.startHot('field', 0, [__game.validate(0, __game.autoPlan(0)), __game.validate(1, p1)]); __game.setWind(0, 0); }, KINDS1); await sleep(1500);
  let s;
  const k0 = await pg.evaluate(() => __game.kinds());
  assert(k0.bouncy.length === 2 && k0.banana.length === 2 && (await pg.evaluate(() => __game.decos())).length === 4, 'match: red tower shows 2 bouncy castles + 2 banana peels');
  await shot(pg, 'pieces-tower');
  // banana slip (blue): hit red, he slips off his peel
  let aim = await findAim(pg, 'normal', HIT_ENEMY);
  assert(aim, 'banana: aim at red found');
  const hp1 = (await pg.evaluate(() => __game.S.hp))[1];
  await pg.evaluate(a => __game.shootAim(a, 'normal'), aim);
  await waitFun(pg, 'slips'); await sleep(350); await shot(pg, 'banana-slip');
  await settle(pg); await sleep(300);
  assert((await F(pg)).sounds.squeak >= 1 && (await pg.evaluate(() => __game.S.hp))[1] < hp1, 'banana: red slipped (squeak), took damage');
  // pigeon strike (red at blue)
  await pg.evaluate(() => __game.giveAmmo('pigeon', 1));
  aim = await findAim(pg, 'pigeon', ANY_LAND);
  await pg.evaluate(a => __game.shootAim(a, 'pigeon'), aim);
  await waitFun(pg, 'flocks'); await sleep(800); await shot(pg, 'pigeon-flock');
  await waitFun(pg, 'splats'); await sleep(250); await shot(pg, 'pigeon-splat');
  await settle(pg); await sleep(400);
  s = await ST(pg);
  assert(s.fx[0].splat === 1 && s.splatVis[0] && s.overlay && s.splatted && !s.preview && !s.guide && s.hpTags[0].includes('💩'), 'pigeon: blue is splattered: overlay on, aim preview + guide hidden, HUD tag');
  assert((await F(pg)).sounds.splat >= 1 && (await F(pg)).sounds.coo >= 1, 'pigeon: coo + splat sounds');
  await shot(pg, 'pigeon-blind-aim');
  await pg.evaluate(() => __game.shootAim({ pitch: 0.4, power: 0.5 }, 'normal')); await settle(pg); await sleep(300);
  s = await ST(pg);
  assert(!s.splatVis[0] && !s.overlay, 'pigeon: splat wears off after blue\'s shot');
  // toilet roll (red wraps blue -> blue skips)
  await pg.evaluate(() => __game.giveAmmo('toilet', 1));
  aim = await findAim(pg, 'toilet', WRAPS);
  assert(aim, 'toilet: aim at blue found');
  await pg.evaluate(a => __game.shootAim(a, 'toilet'), aim);
  await pg.waitForFunction(() => __game.S.play && __game.S.play.ft > 0.5, { timeout: 10000, polling: 30 }); await shot(pg, 'toilet-trail');
  await waitFun(pg, 'wraps'); await sleep(400); await shot(pg, 'toilet-wrapped');
  await settle(pg); await sleep(300);
  s = await ST(pg);
  assert(s.skipped === 0 && await pg.evaluate(() => __game.S.turn) === 1 && s.wrapVis[0], 'toilet: blue wrapped up and skips: red shoots again');
  assert((await F(pg)).sounds.unroll >= 1 && (await F(pg)).sounds.wrapUp >= 1, 'toilet: unroll + wrap sounds');
  await shot(pg, 'toilet-skip');
  // disco (red again, at blue)
  await pg.evaluate(() => __game.giveAmmo('disco', 1));
  aim = await findAim(pg, 'disco', ANY_LAND);
  await pg.evaluate(a => __game.shootAim(a, 'disco'), aim);
  await waitFun(pg, 'discos'); await sleep(900); await shot(pg, 'disco-dance');
  await settle(pg); await sleep(1200);
  s = await ST(pg);
  assert(s.fx[0].disco === 1 && s.discoVis[0] && await pg.evaluate(() => __game.S.turn) === 0 && !s.wrapVis[0], 'disco: blue tower in disco mode through blue\'s turn (wrap gone)');
  assert((await F(pg)).sounds.disco >= 1, 'disco: music loop started');
  await shot(pg, 'disco-turn');
  // big head special (blue at red)
  await pg.evaluate(() => __game.giveAmmo('bighead', 1));
  aim = await findAim(pg, 'bighead', ANY_LAND);
  await pg.evaluate(a => __game.shootAim(a, 'bighead'), aim);
  await waitFun(pg, 'bigs'); await sleep(900); await shot(pg, 'bighead');
  await settle(pg); await sleep(500);
  s = await ST(pg);
  assert(s.fx[1].big === 2 && s.bigOf[1] === 2 && s.headScale[1] > 1.8 && !s.discoVis[0], `bighead: red has a big head for 2 turns (scale ${s.headScale[1].toFixed(2)}), blue's disco ended`);
  // grandma (red at blue's tower)
  await pg.evaluate(() => __game.giveAmmo('grandma', 1));
  const b0 = await pg.evaluate(() => __game.blocks());
  aim = await findAim(pg, 'grandma', "s.arrows[0].res.kind === 'block' || s.arrows[0].res.kind === 'ground'");
  await pg.evaluate(a => __game.shootAim(a, 'grandma'), aim);
  await waitFun(pg, 'grannies'); await sleep(700); await shot(pg, 'grandma-run');
  await waitFun(pg, 'smacks', 2); await sleep(120); await shot(pg, 'grandma-smack');
  await settle(pg); await sleep(300);
  const b1 = await pg.evaluate(() => __game.blocks()), mv = b0.filter((p, i) => Math.hypot(p[0] - b1[i][0], p[1] - b1[i][1], p[2] - b1[i][2]) > 0.3).length;
  assert((await F(pg)).smacks === 4 && (await F(pg)).sounds.smack >= 4 && mv >= 1, `grandma: 4 handbag smacks, ${mv} blocks shoved`);
  // big head bonus: blue's head hit on the big head
  const hd = await pg.evaluate(() => { const D = Math.PI / 180; for (let pd = 3; pd <= 60; pd++) for (let pw = 0.3; pw <= 1; pw += 0.003) { const a = { pitch: pd * D, power: pw }, r = __game.simulate(a, 'normal').arrows[0].res; if (r.kind === 'head') return { a, dmg: r.dmg, big: r.big }; } return null; });
  if (hd) { assert(hd.big && hd.dmg > 50, `bighead: head hit on the big head does bonus damage (${hd.dmg})`); await pg.evaluate(a => __game.shootAim(a, 'normal'), hd.a); await settle(pg); await sleep(300); await shot(pg, 'bighead-hit'); }
  else assert(true, 'bighead: no head shot available from here (skipped)');
  await pg.close();

  // bouncy castle: fresh match, blue's opening shot bounces off red's bouncy castle
  const pq = await open(SZ[0], SZ[1]);
  await pq.evaluate(k => { const p1 = eval(k); __game.startHot('field', 0, [__game.validate(0, __game.autoPlan(0)), __game.validate(1, p1)]); __game.setWind(0, 0); }, KINDS1); await sleep(1500);
  aim = await findAim(pq, 'normal', "(s.arrows[0].bounces || []).some(x => x.boing)");
  if (aim) {
    await pq.evaluate(a => __game.shootAim(a, 'normal'), aim);
    await waitFun(pq, 'boings'); await sleep(150); await shot(pq, 'bouncy-boing');
    await settle(pq); await sleep(300);
    assert((await F(pq)).sounds.boing >= 1, 'bouncy: arrow bounced off the bouncy castle (BOING sound)');
  } else assert(false, 'bouncy: no bounce aim found');
  await pq.close();

  // ---------------- 3. Big Head match toggle + HUD with many specials ----------------
  const pt = await open(SZ[0], SZ[1]);
  await pt.click('#funBtns button[data-big="1"]');
  assert(await pt.evaluate(() => __game.bigChoice) === true, 'setup: Big heads toggle on');
  await shot(pt, 'bighead-toggle-menu');
  await pt.evaluate(() => { __game.startHot('field', 0); __game.setWind(0, 0); }); await sleep(1500);
  s = await ST(pt);
  assert(s.big === 1 && s.bigOf.every(x => x === 2) && s.headScale.every(x => x > 1.9) && s.hpTags.every(t => t === 'BIG'), 'Big Head match: both archers have big heads all match');
  await pt.evaluate(() => { for (const k of ['bomb', 'wheelchair', 'chicken', 'cow', 'boot', 'pigeon', 'toilet', 'disco', 'bighead', 'grandma']) __game.giveAmmo(k, 1, 0); }); await sleep(400);
  const nb = await pt.$$eval('#types button:not(.hidden)', bs => bs.length);
  const bad = await layout(pt);
  assert(nb >= 13 && bad.length === 0 && await noScroll(pt), `hud ${SZ}: ${nb} ammo buttons fit, no overlap (${bad})`);
  await shot(pt, 'bighead-match-hud');
  await pt.close();
}

if (which !== 'hot') {
  // ---------------- online: Big Head room with bouncy/banana build, every special synced ----------------
  const cA = await b.createBrowserContext(), cB = await b.createBrowserContext();
  const A = await open(360, 640, cA), Bp = await open(740, 360, cB);
  await A.click('#arenas button[data-a="field"]'); await A.click('#funBtns button[data-big="1"]'); await A.click('#createBtn');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  assert(/BIG HEADS/.test(await A.$eval('#lobbyBest', e => e.textContent)), 'online: lobby shows the Big Heads room');
  const code = await A.$eval('#code', e => e.textContent);
  await Bp.goto(`${base}/?room=${code}`, { waitUntil: 'load' });
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'build', { timeout: 30000 });
  await sleep(800);
  const me = [await A.evaluate(() => __game.S.me), await Bp.evaluate(() => __game.S.me)];
  const P0 = me[0] === 0 ? A : Bp, P1 = me[0] === 0 ? Bp : A;
  await P1.evaluate(() => __game.sendPlan((p => ({ ...p, kinds: p.blocks.map((_, n) => n < 3 ? 'banana' : 'block') }))(__game.autoPlan(1)), false)); await sleep(600);
  assert(/banana/i.test(await P1.evaluate(() => __game.S.lastBuildErr || '')), 'online: server rejects 3 banana peels');
  await P1.evaluate(k => __game.sendPlan(eval(k), true), KINDS1); await P0.evaluate(() => __game.sendPlan(__game.autoPlan(0), true));
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.phase === 'aim', { timeout: 40000 });
  await sleep(1500);
  const ss = await Promise.all([A, Bp].map(X => ST(X))), kk = await Promise.all([A, Bp].map(X => X.evaluate(() => JSON.stringify(__game.kinds()))));
  assert(ss.every(x => x.big === 1 && x.headScale.every(h => h > 1.9)) && kk[0] === kk[1] && /bouncy/.test(kk[0]), 'online: Big Head match on both clients; bouncy/banana pieces synced');
  await shot(A, 'online-start-A'); await shot(Bp, 'online-start-B');
  const who = async () => (await A.evaluate(() => __game.S.turn === __game.S.me) ? [A, Bp] : [Bp, A]);
  const both = () => Promise.all([A, Bp].map(X => settle(X)));
  const sync = async label => {
    const [ra, rb] = await Promise.all([A, Bp].map(X => X.evaluate(() => ({ hp: __game.S.hp, b: __game.st.phys.b, st: JSON.stringify({ fx: __game.st.fx, k: __game.st.phys.k, big: __game.st.big, a: __game.st.phys.a }), turn: __game.S.turn, sk: __game.S.lastSkipped, d: __game.S.lastDrift }))));
    const bd = Math.max(...ra.b.map((p, i) => Math.max(...p.slice(0, 3).map((x, k) => Math.abs(x - rb.b[i][k])))));
    assert(JSON.stringify(ra.hp) === JSON.stringify(rb.hp) && ra.st === rb.st && ra.turn === rb.turn && ra.sk === rb.sk && bd < 1e-6, `online ${label}: clients in sync (hp ${ra.hp}, turn ${ra.turn}, skipped ${ra.sk}, block diff ${bd.toExponential(1)})`);
    return ra;
  };
  const fire = async (type, test) => {
    const [P, Q] = await who(); const aim = await findAim(P, type, test) || await findAim(P, type, ANY_LAND);
    assert(aim, `online ${type}: aim found`);
    await P.evaluate((a, t) => __game.shootAim(a, t), aim, type);
    await Q.waitForFunction(t => __game.S.play && __game.S.play.m.sim.type === t, { timeout: 15000, polling: 30 }, type);
    return [P, Q];
  };
  // blue hits red on his banana peel
  await fire('normal', HIT_ENEMY);
  await Promise.all([A, Bp].map(X => waitFun(X, 'slips'))); await sleep(300); await shot(A, 'online-slip-A'); await shot(Bp, 'online-slip-B');
  await both(); await sleep(400); await sync('banana slip');
  if (process.env.V61_LIVE) { // live has no TEST_AMMO: specials can't be fired online there; check one more synced shot instead
    await fire('normal', HIT_ENEMY); await Promise.all([A, Bp].map(X => settle(X))); await sleep(400); await sync('return shot');
    await shot(A, 'online-return-A'); await shot(Bp, 'online-return-B');
  } else {
  // red: pigeon
  let [P, Q] = await fire('pigeon', ANY_LAND);
  await Promise.all([A, Bp].map(X => waitFun(X, 'splats'))); await sleep(200); await shot(A, 'online-pigeon-A'); await shot(Bp, 'online-pigeon-B');
  await both(); await sleep(400); await sync('pigeon');
  const ov = await Promise.all([P, Q].map(X => ST(X)));
  assert(ov[1].overlay && !ov[0].overlay && ov.every(x => x.splatVis[1 - me[[A, Bp].indexOf(P)]]), 'online pigeon: only the victim\'s screen is splattered, both see the splat');
  await shot(Q, 'online-pigeon-blind');
  // blue: toilet roll at red -> red skips
  [P, Q] = await fire('toilet', WRAPS);
  await Promise.all([A, Bp].map(X => waitFun(X, 'wraps'))); await sleep(300); await shot(A, 'online-toilet-A'); await shot(Bp, 'online-toilet-B');
  await both(); await sleep(300);
  let r = await sync('toilet');
  assert(r.sk === 1 && r.turn === 0, 'online toilet: red is wrapped and skips; blue shoots again on both clients');
  // blue: disco at red
  await fire('disco', ANY_LAND);
  await Promise.all([A, Bp].map(X => waitFun(X, 'discos'))); await sleep(900); await shot(A, 'online-disco-A'); await shot(Bp, 'online-disco-B');
  await both(); await sleep(400); await sync('disco');
  assert((await Promise.all([A, Bp].map(X => ST(X)))).every(x => x.discoVis[1]), 'online disco: red tower dances on both clients');
  // red: big head at blue (already a big-head match: the special stacks its turn counter)
  await fire('bighead', ANY_LAND);
  await Promise.all([A, Bp].map(X => waitFun(X, 'bigs'))); await sleep(700); await shot(A, 'online-bighead-A'); await shot(Bp, 'online-bighead-B');
  await both(); await sleep(300); r = await sync('bighead');
  // blue: grandma
  await fire('grandma', "s.arrows[0].res.kind === 'block' || s.arrows[0].res.kind === 'ground'");
  await Promise.all([A, Bp].map(X => waitFun(X, 'smacks', 2))); await sleep(100); await shot(A, 'online-grandma-A'); await shot(Bp, 'online-grandma-B');
  await both(); await sleep(400); await sync('grandma');
  const fa = await Promise.all([A, Bp].map(X => F(X)));
  assert(fa.every(f => f.smacks === 4 && f.grannies === 1), 'online grandma: 4 smacks on both clients');
  }
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
assert(errors.length === 0, 'no page errors');
console.log(`PASS ${results.length} checks`);
await b.close();
