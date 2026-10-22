// Usage: node test/check.mjs <baseUrl> <outDir> [hot|online|all]
import { createRequire } from 'module';
import fs from 'fs';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3931', out = 'shots', which = 'all'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };
async function open(w, h, touch, ctx = b) {
  const pg = await ctx.newPage();
  await pg.setViewport({ width: w, height: h, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  pg.on('console', m => { if (m.type() === 'error') errors.push(`${w}: ${m.text()}`); });
  pg.on('pageerror', e => errors.push(`${w}: ${e.message}`));
  await pg.goto(base, { waitUntil: 'networkidle0' });
  await pg.waitForFunction('window.__ready', { timeout: 20000 });
  await sleep(800);
  return pg;
}
const st = pg => pg.evaluate(() => ({ turn: __game.S.turn, phase: __game.S.phase, hp: [...__game.S.hp], mode: __game.S.mode, arena: __game.S.arenaId, winner: __game.S.winner }));
const settle = pg => pg.waitForFunction(() => ['aim', 'over', 'menu'].includes(__game.S.phase) && !__game.S.play, { timeout: 20000 });

if (which !== 'online') {
  for (const [w, h, touch] of [[390, 844, true], [1280, 800, false]]) {
    const pg = await open(w, h, touch);
    await pg.screenshot({ path: `${out}/${w}-menu.png` });
    for (const arena of ['field', 'dusk', 'winter']) {
      await pg.click(`#arenas button[data-a="${arena}"]`);
      await pg.click('#hotBtn'); await sleep(1500);
      const cx = w / 2, cy = h * 0.3;
      await pg.mouse.move(cx, cy); await pg.mouse.down();
      await pg.mouse.move(cx - w * 0.08, cy + h * 0.24, { steps: 8 });
      await sleep(400);
      await pg.screenshot({ path: `${out}/${w}-aim-${arena}.png` });
      await pg.mouse.up();
      await pg.waitForFunction(() => __game.S.phase === 'fly', { timeout: 3000 });
      await sleep(900);
      await pg.screenshot({ path: `${out}/${w}-fly-${arena}.png` });
      await settle(pg);
      const s = await st(pg);
      console.log(w, arena, 'drag shot ->', s);
      assert(s.arena === arena && s.turn === 1, 'drag shot passes turn');
      await pg.click('#menuBtn'); await pg.click('#homeBtn'); await sleep(300);
    }
    await pg.close();
  }
  // hot-seat full cycle with each arrow type
  const pg = await open(390, 844, true);
  await pg.click('#arenas button[data-a="field"]'); await pg.click('#hotBtn'); await sleep(800);
  // merlon: Blue knocks off a Red merlon with a heavy arrow, Red cracks a Blue merlon with a normal one
  for (const [ids, type, want] of [[[8, 9, 7, 10], 'heavy', 0], [[3, 2, 4, 1], 'normal', 1]]) {
    let hit = null;
    for (const id of ids) if ((hit = await pg.evaluate((i, t) => __game.findMerlonHit(i, t), id, type))) break;
    assert(hit, 'found merlon aim');
    await pg.evaluate((a, t) => __game.shootAim(a, t), hit.aim, type);
    await settle(pg); await sleep(600);
    const m = await pg.evaluate(() => __game.merlons());
    console.log('hot merlon', hit.merlon, type, '-> hp', m.hp[hit.merlon], m.vis[hit.merlon]);
    assert(m.hp[hit.merlon] === want && m.vis[hit.merlon].hp === want, 'merlon state');
    if (want === 0) { assert(m.vis[hit.merlon].fallen, 'merlon fell'); await pg.screenshot({ path: `${out}/hot-merlon-off.png` }); }
  }
  const types = ['normal', 'heavy', 'split', 'normal', 'heavy', 'normal', 'heavy', 'normal'];
  let shotN = 0;
  for (const type of types) {
    const before = await st(pg);
    if (before.phase === 'over') break;
    await pg.evaluate(() => __game.setWind(0, 0));
    const aim = await pg.evaluate(t => __game.findHit(t), type);
    assert(aim, 'found a hitting aim for ' + type);
    await pg.evaluate((a, t) => __game.shootAim(a, t), aim, type);
    if (shotN++ === 0) { await pg.waitForFunction(() => __game.S.play && __game.S.play.arrows.every(a => a.landed), { timeout: 10000 }); await sleep(150); await pg.screenshot({ path: `${out}/hot-hit.png` }); }
    await settle(pg);
    const after = await st(pg);
    console.log('hot', type, before.hp, '->', after.hp, 'turn', before.turn, '->', after.turn, after.phase);
    assert(after.hp[1 - before.turn] < before.hp[1 - before.turn], 'HP dropped');
    assert(after.phase === 'over' || after.turn !== before.turn, 'turn switched');
  }
  const fin = await st(pg);
  assert(fin.phase === 'over', 'hot-seat game over'); await sleep(400);
  await pg.screenshot({ path: `${out}/hot-win.png` });
  await pg.click('#rematch'); await sleep(400);
  const re = await st(pg); assert(re.phase === 'aim' && re.hp[0] === 100 && re.hp[1] === 100, 'rematch reset');
  console.log('hot-seat OK, final', fin.hp, 'winner', fin.winner);
  await pg.close();
}

if (which !== 'hot') {
  // two clients in separate browser contexts
  const A = await open(390, 844, true, await b.createBrowserContext());
  const B = await open(1280, 800, false, await b.createBrowserContext());
  await A.click('#arenas button[data-a="dusk"]');
  await A.click('#createBtn');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code = await A.$eval('#code', e => e.textContent);
  await sleep(300);
  await A.screenshot({ path: `${out}/online-room-code.png` });
  console.log('room code', code);
  await B.type('#codeIn', code.toLowerCase());
  await B.click('#joinBtn');
  await A.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'aim', { timeout: 15000 });
  await B.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'aim', { timeout: 15000 });
  const [sa, sb] = [await st(A), await st(B)];
  console.log('started', sa, sb);
  assert(sa.arena === 'dusk' && sb.arena === 'dusk', 'arena synced');
  assert(await A.evaluate(() => __game.S.me) === 0 && await B.evaluate(() => __game.S.me) === 1, 'seats');
  await sleep(800);
  await A.screenshot({ path: `${out}/online-A-aim.png` });
  await B.screenshot({ path: `${out}/online-B-wait.png` });
  // non-active player cannot shoot
  assert(await B.evaluate(() => __game.shootAim({ pitch: 0.5, yaw: 0, power: 0.8 })) === false, 'B blocked on A turn');
  // merlon destruction sync: A cracks a Red merlon, B knocks a Blue merlon off with a heavy arrow
  for (const [P, ids, type, want] of [[A, [8, 9, 7, 10], 'normal', 1], [B, [3, 2, 4, 1], 'heavy', 0]]) {
    let hit = null;
    for (const id of ids) if ((hit = await P.evaluate((i, t) => __game.findMerlonHit(i, t), id, type))) break;
    assert(hit, 'found merlon aim online');
    assert(await P.evaluate((a, t) => __game.shootAim(a, t), hit.aim, type), 'merlon shot accepted');
    await sleep(500); await settle(A); await settle(B); await sleep(700);
    const [ma, mb] = [await A.evaluate(() => __game.merlons()), await B.evaluate(() => __game.merlons())];
    console.log('online merlon', hit.merlon, type, 'A', ma.hp.join(''), 'B', mb.hp.join(''), 'fallen A/B', ma.vis[hit.merlon].fallen, mb.vis[hit.merlon].fallen);
    assert(JSON.stringify(ma.hp) === JSON.stringify(mb.hp) && ma.hp[hit.merlon] === want, 'merlons in sync');
    assert(ma.vis[hit.merlon].hp === want && mb.vis[hit.merlon].hp === want, 'merlon visuals in sync');
    if (want === 0) { assert(ma.vis[hit.merlon].fallen && mb.vis[hit.merlon].fallen, 'fell on both'); await A.screenshot({ path: `${out}/online-A-merlon-off.png` }); }
  }
  let n = 0;
  while (n < 14) {
    const s = await st(A);
    if (s.phase === 'over') break;
    const P = s.turn === 0 ? A : B, O = s.turn === 0 ? B : A;
    const aim = await P.evaluate(() => __game.findHit('normal'));
    assert(aim, 'found hit online');
    assert(await P.evaluate(a => __game.shootAim(a, 'normal'), aim), 'active player can shoot');
    await O.waitForFunction(() => __game.S.phase === 'fly', { timeout: 10000 });
    if (n === 0) { await sleep(700); await B.screenshot({ path: `${out}/online-B-fly.png` }); }
    await settle(A); await settle(B);
    const [a2, b2] = [await st(A), await st(B)];
    console.log('online shot', n, 'by', s.turn, 'hp A', a2.hp, 'hp B', b2.hp, 'turn', a2.turn, b2.turn);
    assert(JSON.stringify(a2.hp) === JSON.stringify(b2.hp), 'HP in sync');
    assert(a2.turn === b2.turn, 'turn in sync');
    assert(a2.phase === 'over' || a2.turn !== s.turn, 'turn passed');
    assert(a2.hp[1 - s.turn] < s.hp[1 - s.turn], 'hit registered');
    n++;
  }
  const [fa, fb] = [await st(A), await st(B)];
  assert(fa.phase === 'over' && fb.phase === 'over' && fa.winner === fb.winner, 'both see same winner');
  const [wa, wb] = [await A.$eval('#winner', e => e.textContent), await B.$eval('#winner', e => e.textContent)];
  console.log('win screens:', wa, '|', wb);
  await A.screenshot({ path: `${out}/online-A-over.png` });
  await A.click('#rematch'); await sleep(500);
  await B.waitForFunction(() => /rematch/i.test(document.querySelector('#overMsg').textContent), { timeout: 5000 });
  await B.click('#rematch');
  await A.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp[0] === 100, { timeout: 10000 });
  await B.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp[1] === 100, { timeout: 10000 });
  console.log('rematch started, turn', (await st(A)).turn, (await st(B)).turn);
  await B.close();
  await A.waitForFunction(() => !document.querySelector('#notice').classList.contains('hidden'), { timeout: 30000 });
  console.log('A notice:', await A.$eval('#noticeText', e => e.textContent));
  await A.click('#noticeBtn'); await sleep(300);
  assert((await st(A)).phase === 'menu', 'back to menu');
  await A.screenshot({ path: `${out}/online-A-left.png` });
  console.log('online OK');
}
await b.close();
console.log('console errors:', errors.length ? errors : 'none');
