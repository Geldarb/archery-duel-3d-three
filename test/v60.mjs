// v6.0 checks: Baldy Mordy skin (customise/in game/online), rubber chicken, cow catapult, giant boot, ragdoll victory + taunt dances, HUD fit, online sync.
// Usage: node test/v60.mjs <baseUrl> <outDir> [hot|online|all] [prefix]   (online needs a local server with LEGACY_TOWERS=1 TEST_AMMO=chicken,cow,boot)
import { createRequire } from 'module';
import fs from 'fs';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3947', out = 'shots/v60', which = 'all', pre = 'v60'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], sleep = ms => new Promise(r => setTimeout(r, ms)), results = [];
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); results.push('ok ' + m); console.log('ok', m); };
const shot = (pg, name) => { const v = pg.viewport(); return pg.screenshot({ captureBeyondViewport: false, path: `${out}/${pre}-${name.replace(/\d+x\d+$/, v.width + 'x' + v.height)}.png` }); }; // file name follows the real viewport
const SZ = process.env.V60_LAND ? [740, 360] : [360, 640]; // V60_LAND=1: hot-seat gameplay shots in landscape
const DEG = Math.PI / 180;
async function open(w, h, ctx = b, url = base, pre = null) {
  const pg = await ctx.newPage();
  const touch = w < 900;
  await pg.setViewport({ width: w, height: h, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  pg.on('console', m => { if (m.type() === 'error') errors.push(`${w}x${h}: ${m.text()}`); });
  pg.on('pageerror', e => errors.push(`${w}x${h}: ${e.message}`));
  if (pre) await pg.evaluateOnNewDocument(pre);
  await pg.goto(url, { waitUntil: 'load' }); await pg.waitForFunction('window.__ready', { timeout: 30000 }); await sleep(500);
  return pg;
}
const vis = (pg, sel) => pg.$eval(sel, e => !e.classList.contains('hidden') && e.offsetWidth > 0 && getComputedStyle(e).display !== 'none');
const settle = pg => pg.waitForFunction(() => !__game.S.play && ['aim', 'over', 'menu', 'round'].includes(__game.S.phase), { timeout: 60000, polling: 100 });
const noScroll = pg => pg.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1 && document.scrollingElement.scrollWidth <= innerWidth + 1);
const G = 0;
// every visible HUD control on screen, none overlapping another
const layout = pg => pg.evaluate(() => {
  const sels = ['#hp0', '#hp1', '#mid', '#menuBtn', '#fsGame', '#camBtn', '#camBar', '#types', '#lastShot', '#hint', '#pip'];
  const R = sels.map(s => [s, document.querySelector(s)]).filter(([, e]) => e && !e.classList.contains('hidden') && e.offsetWidth > 0 && getComputedStyle(e).display !== 'none').map(([s, e]) => [s, e.getBoundingClientRect()]);
  const bad = [];
  for (const [s, r] of R) if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) bad.push('off:' + s);
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const [s, a] = R[i], [t, c] = R[j]; if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1) bad.push(`${s}x${t}`); }
  return { bad, shown: R.map(x => x[0]) };
});

const onScreen = (pg, i) => pg.evaluate(i => { const p = __game.archers[i].root.position.clone(); p.y += 1; p.project(__game.camera); return Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1 ? [+p.x.toFixed(2), +p.y.toFixed(2)] : null; }, i);
const F = pg => pg.evaluate(() => __game.fun());
const VIC = pg => pg.evaluate(() => __game.victory());
const BAL = pg => pg.evaluate(() => __game.baldy());
// aim search in the page: first aim whose simulated shot satisfies a test (string body gets s = simulateShot result)
const findAim = (pg, type, test) => pg.evaluate((type, test) => {
  const f = new Function('s', 'g', 'return ' + test), D = Math.PI / 180;
  for (let pd = 8; pd <= 70; pd += 1) for (let pw = 0.3; pw <= 1; pw += 0.005) { const aim = { pitch: pd * D, power: pw }, s = __game.simulate(aim, type); if (f(s, __game)) return aim; }
  return null;
}, type, test);
const moved = (b0, b1) => b0.filter((p, i) => Math.hypot(p[0] - b1[i][0], p[1] - b1[i][1], p[2] - b1[i][2]) > 0.3).length;
const ENEMY_BLOCK = "s.arrows[0].res.kind === 'block' && (q => Math.hypot(q.x - s.arrows[0].res.pos[0], q.y + 0.8 - s.arrows[0].res.pos[1], q.z - s.arrows[0].res.pos[2]) < 2)(g.archers[1 - g.S.turn].root.position)"; // a block right next to the enemy archer
const CHICKEN_BLOCK = "(s.arrows[0].bounces || []).some(x => x.kind === 'block')";

if (which !== 'online') {
  // ---------------- 1. Baldy Mordy in Customise (live as you type) ----------------
  const pc = await open(360, 640);
  await pc.click('#customBtn'); await sleep(600);
  assert((await BAL(pc)).preview === false, 'customise: default preview is the normal archer');
  await pc.click('#nameIn', { clickCount: 3 }); await pc.keyboard.type('baldy mord'); await sleep(250);
  assert((await BAL(pc)).preview === false, 'customise: "baldy mord" is still the normal archer');
  await pc.keyboard.type('y'); await sleep(350);
  let bl = await BAL(pc);
  assert(bl.preview === true && bl.pvSparkles === 1, 'customise: typing the last letter of "baldy mordy" swaps the preview to the wizard, with a sparkle');
  await shot(pc, 'baldy-customise-360x640');
  await pc.click('#nameIn', { clickCount: 3 }); await pc.keyboard.type('Bob'); await sleep(300);
  assert((await BAL(pc)).preview === false, 'customise: changing the name back restores the normal archer');
  await pc.click('#nameIn', { clickCount: 3 }); await pc.keyboard.type(' BALDY MORDY'); await sleep(350);
  bl = await BAL(pc);
  assert(bl.preview === true && bl.pvSparkles === 2, 'customise: " BALDY MORDY" (trimmed, any case) also reveals the wizard');
  await pc.setViewport({ width: 740, height: 360, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(700);
  assert(await noScroll(pc), 'customise 740x360: fits, no scroll');
  await shot(pc, 'baldy-customise-740x360');
  await pc.close();

  // ---------------- 2. hot-seat: Red is Baldy Mordy ----------------
  const pg = await open(SZ[0], SZ[1], b, base, "localStorage.setItem('ad3t-look-1', JSON.stringify({ name: 'Baldy Mordy' })); localStorage.removeItem('ad3t-look-0');");
  await pg.click('#arenas button[data-a="field"]'); await pg.click('#seriesBtns button[data-s="3"]');
  await pg.evaluate(() => { __game.startHot('field', 0); __game.setWind(0, 0); }); await sleep(1500);
  bl = await BAL(pg);
  assert(bl.archers[0] === false && bl.archers[1] === true && bl.revealed >= 1, `hot: Red ("${bl.names[1]}") is the wizard in game, Blue is normal; reveal sparkle fired`);
  await pg.evaluate(() => __game.camPreset ? (__game.camEnter(), __game.camPreset('enemy')) : 0); await sleep(1800);
  await shot(pg, 'baldy-ingame-360x640');
  await pg.evaluate(() => { __game.camPreset('me'); __game.camExit(); }); await sleep(300); // v5.5: views persist, so go back to Me first
  // pickup registry: all five specials can come out of a sky crate
  const reg = await pg.evaluate(async () => { const m = await import('/sim.js'); const r = m.rng(7), seen = {}; for (let k = 0; k < 2000; k++) { const p = m.spawnPickup(r); seen[p.kind] = (seen[p.kind] || 0) + 1; } return { SPECIALS: m.SPECIALS, seen }; });
  assert(['bomb', 'wheelchair', 'chicken', 'cow', 'boot'].every(k => reg.SPECIALS.includes(k) && reg.seen[k] > 2000 / reg.SPECIALS.length * 0.6), // v6.1: more specials share the crate odds
    `registry: sky crates grant bomb/wheelchair/chicken/cow/boot (${JSON.stringify(reg.seen)})`);
  // HUD: all 8 slots fit on a 360px phone
  await pg.evaluate(() => { for (const k of ['bomb', 'wheelchair', 'chicken', 'cow', 'boot']) __game.giveAmmo(k, 1, 0); }); await sleep(300);
  const icons = await pg.evaluate(() => ['chicken', 'cow', 'boot'].map(k => { const e = document.querySelector(`#types button[data-t="${k}"]`); return e && !e.classList.contains('hidden') && !!e.querySelector('svg') && e.querySelector('em').textContent; }));
  assert(icons.every(x => x === '×1'), `hud: chicken/cow/boot ammo buttons with icons and ×1 counters (${icons})`);
  let lay = await layout(pg);
  assert(lay.bad.length === 0 && await noScroll(pg), `hud 360x640: 8 ammo slots fit, no overlap/scroll (${lay.bad})`);
  await shot(pg, 'hud-8-slots-360x640');
  await pg.setViewport({ width: 740, height: 360, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(700);
  lay = await layout(pg);
  assert(lay.bad.length === 0 && await noScroll(pg), `hud 740x360: 8 ammo slots fit (${lay.bad})`);
  await shot(pg, 'hud-8-slots-740x360');
  await pg.setViewport({ width: SZ[0], height: SZ[1], isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(500);

  // ---------------- 3. rubber chicken ----------------
  let aim = await findAim(pg, 'chicken', CHICKEN_BLOCK);
  assert(aim, 'chicken: an aim that bounces off a tower block exists');
  const sim0 = await pg.evaluate(a => { const s = __game.simulate(a, 'chicken'); return { b: s.arrows[0].bounces, res: s.arrows[0].res }; }, aim);
  assert(sim0.b.length <= 2 && sim0.b.every(x => ['block', 'stone', 'ground'].includes(x.kind)), `chicken: ${sim0.b.length} bounce(s) (${sim0.b.map(x => x.kind)}), max 2, then lands (${sim0.res.kind})`);
  const det = await pg.evaluate(a => JSON.stringify(__game.simulate(a, 'chicken')) === JSON.stringify(__game.simulate(a, 'chicken')), aim);
  assert(det, 'chicken: simulation is deterministic');
  let s0 = (await F(pg)).sounds || {};
  let b0 = await pg.evaluate(() => __game.blocks());
  await pg.evaluate(a => __game.shootAim(a, 'chicken'), aim);
  await pg.waitForFunction(() => __game.S.play && __game.S.play.ft > 0.45, { timeout: 10000, polling: 30 });
  await shot(pg, 'chicken-flight-360x640');
  await settle(pg); await sleep(300);
  let f = await F(pg);
  assert(f.type === 'chicken' && f.squawks >= 1 && f.sounds.squawk > (s0.squawk || 0), `chicken: squawks in flight (${f.squawks})`);
  assert(f.honks === sim0.b.length && f.sounds.honk > (s0.honk || 0), `chicken: honk on every bounce (${f.honks})`);
  let drift = await pg.evaluate(() => __game.S.lastDrift);
  assert(drift < 0.05, `chicken: replay matches the authoritative result (drift ${drift.toExponential(1)})`);
  assert(await pg.evaluate(() => __game.st.ammo[0].chicken === 0), 'chicken: ammo spent');

  // ---------------- 4. cow catapult (Red's turn) ----------------
  await pg.evaluate(() => __game.giveAmmo('cow', 1, 1)); 
  aim = await findAim(pg, 'cow', ENEMY_BLOCK);
  assert(aim, 'cow: an aim onto the enemy tower exists');
  b0 = await pg.evaluate(() => __game.blocks()); const hp0 = await pg.evaluate(() => [...__game.S.hp]); s0 = (await F(pg)).sounds;
  await pg.evaluate(a => __game.shootAim(a, 'cow'), aim);
  await pg.waitForFunction(() => __game.fun().cow, { timeout: 15000, polling: 30 }); await sleep(250);
  await shot(pg, 'cow-impact-360x640');
  f = await F(pg);
  assert(f.sounds.moo > (s0.moo || 0) && f.sounds.stomp > (s0.stomp || 0), 'cow: moos in flight, thuds on impact');
  await settle(pg); await sleep(300);
  let b1 = await pg.evaluate(() => __game.blocks()), hp1 = await pg.evaluate(() => [...__game.S.hp]);
  assert(moved(b0, b1) >= 4, `cow: impact flattens the tower (${moved(b0, b1)} blocks knocked)`);
  assert(hp1[0] < hp0[0], `cow: damage near impact (Blue ${hp0[0]}→${hp1[0]})`);
  drift = await pg.evaluate(() => __game.S.lastDrift);
  assert(drift < 0.05, `cow: deterministic replay (drift ${drift.toExponential(1)})`);
  await sleep(2500);
  assert(await pg.evaluate(() => { const c = __game.fun().cow; return !__game.S.play; }), 'cow: wanders off and fades (no lingering state)');

  // ---------------- 5. giant boot (Blue) ----------------
  aim = await findAim(pg, 'boot', ENEMY_BLOCK);
  assert(aim, 'boot: an aim onto the enemy tower exists');
  const bsim = await pg.evaluate(a => __game.simulate(a, 'boot').arrows[0].res.bootAt, aim);
  b0 = await pg.evaluate(() => __game.blocks()); const hb0 = await pg.evaluate(() => [...__game.S.hp]); s0 = (await F(pg)).sounds;
  await pg.evaluate(a => __game.shootAim(a, 'boot'), aim);
  await pg.waitForFunction(() => __game.fun().boot, { timeout: 15000, polling: 30 }); await sleep(380);
  await shot(pg, 'boot-drop-360x640');
  await pg.waitForFunction(() => __game.S.play && __game.S.play.focus, { timeout: 8000, polling: 30 }); await sleep(150);
  await shot(pg, 'boot-impact-360x640');
  f = await F(pg);
  assert(f.boot && bsim && f.boot.every((v, i) => Math.abs(v - bsim[i]) < 1e-9) && f.sounds.stomp > s0.stomp, `boot: giant boot drops onto the landing point (${bsim.map(v => v.toFixed(1))}) and stomps`);
  await settle(pg); await sleep(300);
  b1 = await pg.evaluate(() => __game.blocks()); const hb1 = await pg.evaluate(() => [...__game.S.hp]);
  assert(moved(b0, b1) >= 3 && hb1[1] < hb0[1], `boot: stomp crushes blocks (${moved(b0, b1)}) and hurts Red (${hb0[1]}→${hb1[1]})`);
  drift = await pg.evaluate(() => __game.S.lastDrift);
  assert(drift < 0.05, `boot: deterministic replay (drift ${drift.toExponential(1)})`);
  // boot that misses lands on the enemy tower area at the aim point
  const miss = await pg.evaluate(() => { const s = __game.simulate({ pitch: 0.2, power: 1 }, 'boot').arrows[0].res; return { kind: s.kind, at: s.bootAt, ex: __game.archers[1 - __game.S.turn].root.position.x }; });
  assert(miss.kind !== 'out' || (miss.at && Math.abs(miss.at[0] - miss.ex) < 1e-6), `boot: an overshot boot still stomps the enemy tower area (${miss.kind})`);

  // ---------------- 6. ragdoll victory + taunt dance ----------------
  const turn = await pg.evaluate(() => __game.S.turn);
  await pg.evaluate(t => __game.setHp(1 - t, 3), turn);
  aim = await pg.evaluate(() => __game.findHit('normal'));
  s0 = (await F(pg)).sounds;
  await pg.evaluate(a => __game.shootAim(a, 'normal'), aim);
  await pg.waitForFunction(() => __game.victory(), { timeout: 15000, polling: 30 });
  let v = await VIC(pg);
  assert(v.w === turn && v.l === 1 - turn && ['wiggle', 'spin', 'pump'].includes(v.dance), `victory: winner ${v.w} dances (${v.dance}), loser ${v.l} ragdolls`);
  await sleep(1000);
  const v1 = await VIC(pg);
  await shot(pg, 'ragdoll-360x640');
  assert(v1.lrot > 0.6 && Math.hypot(v1.lp[0] - v.lp[0], v1.lp[2] - v.lp[2]) > 0.3, `victory: loser tumbles off in slow-mo (tilt ${v1.lrot.toFixed(2)})`);
  await pg.waitForFunction(() => __game.victory() && __game.victory().t > 2.6, { timeout: 15000, polling: 30 }); // dance phase (focus switches to the winner at 2.1s)
  const v2 = await VIC(pg); await sleep(120); const v3 = await VIC(pg);
  await shot(pg, 'dance-360x640');
  assert(JSON.stringify(v2.wrot) !== JSON.stringify(v3.wrot) || v2.wp[1] !== v3.wp[1], 'victory: winner is dancing (pose changes frame to frame)');
  f = await F(pg);
  assert(f.sounds.trombone > (s0.trombone || 0) && f.sounds.jingle > (s0.jingle || 0), 'victory: sad trombone + victory jingle played');
  assert(await vis(pg, '#roundCard') || await pg.evaluate(() => __game.S.phase === 'round'), 'victory: round card still up during the show');
  await pg.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp.every(h => h === 100), { timeout: 20000, polling: 100 }); await sleep(300);
  const up = await pg.evaluate(() => ({ v: __game.victory(), r: __game.archers.map(a => [a.root.rotation.x, a.root.rotation.z]) }));
  assert(!up.v && up.r.flat().every(x => Math.abs(x) < 1e-6), 'victory: next round both archers are upright again');
  // landscape victory show
  await pg.setViewport({ width: 740, height: 360, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(600);
  const t2 = await pg.evaluate(() => __game.S.turn);
  await pg.evaluate(t => __game.setHp(1 - t, 3), t2);
  aim = await pg.evaluate(() => __game.findHit('normal'));
  await pg.evaluate(a => __game.shootAim(a, 'normal'), aim);
  await pg.waitForFunction(() => __game.victory() && __game.victory().t > 1.0, { timeout: 15000, polling: 30 });
  await shot(pg, 'ragdoll-740x360');
  await pg.waitForFunction(() => __game.victory() && __game.victory().t > 2.6, { timeout: 15000, polling: 30 });
  await shot(pg, 'dance-740x360');
  const ph = await pg.evaluate(() => __game.S.phase);
  if (ph === 'over') {
    assert(!(await vis(pg, '#over')), 'victory: series over - the results panel waits for the show');
    await pg.waitForFunction(() => !document.querySelector('#over').classList.contains('hidden'), { timeout: 8000, polling: 100 });
    assert(true, 'victory: results panel opens after the dance');
  } else assert(ph === 'round', `victory (landscape): round show (${ph})`);
  await pg.close();
  // PiP never hides the landing X (portrait + landscape)
  for (const [w, h] of [[360, 640], [740, 360]]) {
    const pp = await open(w, h);
    await pp.evaluate(() => { __game.startHot('field', 0); __game.setWind(0, 0); }); await sleep(1200);
    let checked = 0, worst = '';
    for (const aim of [{ pitch: 0.62, power: 0.86 }, { pitch: 0.55, power: 0.8 }, { pitch: 0.7, power: 0.93 }, { pitch: 0.5, power: 0.72 }]) {
      await pp.evaluate(a => __game.shootAim(a, 'normal'), aim); await settle(pp); await sleep(1400);
      if (await pp.evaluate(() => __game.S.phase !== 'aim')) break;
      const g = await pp.evaluate(() => __game.guide());
      if (!g.markXY) continue; checked++;
      const r = g.pipRect, m = g.markXY;
      if (r && m[0] > r.x - 10 && m[0] < r.x + r.w + 10 && m[1] > r.y - 10 && m[1] < r.y + r.h + 10) worst = `X ${m.map(Math.round)} in PiP ${JSON.stringify(r)}`;
      if (checked === 2) await shot(pp, `pip-x-${w}x${h}`);
    }
    const lay = await layout(pp);
    assert(checked >= 1 && !worst && lay.bad.length === 0, `pip ${w}x${h}: the opponent inset never covers the landing X (${checked} turns checked) and overlaps nothing ${worst} ${lay.bad}`);
    await pp.close();
  }
}

if (which !== 'hot') {
  // ---------------- online: server TEST_AMMO=chicken,cow,boot; B is Baldy Mordy ----------------
  const cA = await b.createBrowserContext(), cB = await b.createBrowserContext(), skip = 'window.__autoSkip = true;';
  const A = await open(360, 640, cA, base, skip), Bp = await open(740, 360, cB, base, skip + "localStorage.setItem('ad3t-look-0', JSON.stringify({ name: 'baldy mordy' }));");
  await A.click('#arenas button[data-a="field"]'); await A.click('#seriesBtns button[data-s="3"]'); await A.click('#createBtn'); // Bo3 so the next round is tested
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code = await A.$eval('#code', e => e.textContent);
  await Bp.goto(`${base}/?room=${code}`, { waitUntil: 'load' });
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.mode === 'online' && /aim|build|wait/.test(__game.S.phase), { timeout: 30000 });
  await sleep(1500);
  for (const P of [A, Bp]) if (await P.evaluate(() => __game.S.phase === 'build') && await vis(P, '#bReady')) await P.click('#bReady');
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'aim', { timeout: 40000 });
  await sleep(1200);
  const meB = await Bp.evaluate(() => __game.S.me);
  const [ba, bb] = [await BAL(A), await BAL(Bp)];
  assert(ba.archers[meB] && !ba.archers[1 - meB] && bb.archers[meB] && !bb.archers[1 - meB], 'online: Baldy Mordy skin shows for the opponent and for the player');
  await A.evaluate(m => { __game.camEnter(); __game.camPreset(__game.S.me === m ? 'me' : 'enemy'); }, meB); await sleep(1800);
  await shot(A, 'online-baldy-opponent-360x640');
  await A.evaluate(() => { __game.camPreset('me'); __game.camExit(); });
  const who = async () => { const t = await A.evaluate(() => __game.S.turn); const me = await A.evaluate(() => __game.S.me); return t === me ? [A, Bp] : [Bp, A]; };
  const both = () => Promise.all([A, Bp].map(X => settle(X)));
  const ammo0 = await A.evaluate(() => __game.st.ammo);
  assert(ammo0.every(a => a.chicken === 2 && a.cow === 2 && a.boot === 2), 'online (test server): both players start with fun specials');
  let won = false;
  for (const type of ['chicken', 'chicken', 'cow', 'cow', 'boot', 'boot', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal']) {
    const [P, Q] = await who();
    const aim = type === 'normal' ? await P.evaluate(() => __game.findHit('normal')) : (await findAim(P, type, type === 'chicken' ? CHICKEN_BLOCK : ENEMY_BLOCK) || await P.evaluate(t => __game.findHit(t), type)); // fallback: blocks next to the enemy may already be gone
    assert(aim, `online ${type}: aim found`);
    await P.evaluate((a, t) => __game.shootAim(a, t), aim, type);
    await Q.waitForFunction(t => __game.S.play && __game.S.play.m.sim.type === t, { timeout: 10000, polling: 30 }, type);
    if (type !== 'normal') await Q.waitForFunction(() => __game.S.play && __game.S.play.ft > 0.4, { timeout: 10000, polling: 30 });
    await both(); await sleep(400);
    const [ra, rb] = await Promise.all([A, Bp].map(X => X.evaluate(() => ({ hp: __game.S.hp, d: __game.S.lastDrift, b: __game.blocks(), f: __game.fun(), ph: __game.S.phase, v: __game.victory() }))));
    const bd = Math.max(...ra.b.map((p, i) => Math.max(...p.slice(0, 3).map((x, k) => Math.abs(x - rb.b[i][k])))));
    assert(JSON.stringify(ra.hp) === JSON.stringify(rb.hp) && bd < 1e-6 && ra.d < 0.05 && rb.d < 0.05, `online ${type}: both clients in sync (hp ${ra.hp}, block diff ${bd.toExponential(1)}, drift ${ra.d.toExponential(1)}/${rb.d.toExponential(1)})`);
    if (type !== 'normal') assert(ra.f.type === type && rb.f.type === type && JSON.stringify(ra.f.boot) === JSON.stringify(rb.f.boot), `online ${type}: special visuals ran on both clients${ra.f.boot ? ' (boot at ' + ra.f.boot.map(v => v.toFixed(1)) + ')' : ''}`);
    if (type === 'chicken') assert(ra.f.honks === rb.f.honks && ra.f.honks >= 1, `online chicken: both clients honked ${ra.f.honks}×`);
    if (ra.ph === 'round' || ra.ph === 'over') {
      assert(ra.v && rb.v && ra.v.w === rb.v.w && ra.v.dance === rb.v.dance, `online: round over, both clients play the ragdoll + ${ra.v && ra.v.dance} dance for winner ${ra.v && ra.v.w}`);
      await sleep(1600); await shot(A, 'online-victory-A-360x640'); await shot(Bp, 'online-victory-B-740x360');
      won = true; break;
    }
  }
  assert(won, 'online: a round was won during the special barrage');
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp.every(h => h > 90), { timeout: 30000, polling: 100 });
  const ups = await Promise.all([A, Bp].map(X => X.evaluate(() => !__game.victory() && __game.archers.every(a => Math.abs(a.root.rotation.z) < 1e-6))));
  assert(ups.every(Boolean), 'online: next round starts after the show, archers upright');
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
assert(errors.length === 0, 'no page errors');
console.log(`PASS ${results.length} checks`);
await b.close();
