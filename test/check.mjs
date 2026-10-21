// Usage: node test/check.mjs <baseUrl> <outDir>  — screenshots + scripted shot cycle
import { createRequire } from 'module';
const req = createRequire('/tmp/ad3t-pw/');
const puppeteer = req('puppeteer-core');
const [,, base = 'http://localhost:3123', out = 'shots'] = process.argv;
const fs = await import('fs'); fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(w, h, touch) {
  const pg = await b.newPage();
  await pg.setViewport({ width: w, height: h, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  pg.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  pg.on('pageerror', e => errors.push(e.message));
  await pg.goto(base, { waitUntil: 'networkidle0' });
  await pg.waitForFunction('window.__ready', { timeout: 15000 });
  await sleep(1500);
  return pg;
}
const waitPhase = (pg, ph, t = 15000) => pg.waitForFunction(p => window.__game.S.phase === p, { timeout: t }, ph);
const state = pg => pg.evaluate(() => ({ turn: __game.S.turn, phase: __game.S.phase, hp: __game.archers.map(a => a.hp), shots: __game.S.shots, result: __game.S.result && __game.S.result.kind }));

for (const [w, h, touch] of [[390, 844, true], [1280, 800, false]]) {
  const pg = await open(w, h, touch);
  await pg.screenshot({ path: `${out}/${w}x${h}-start.png` });
  // real pointer drag: pull back down-left from screen centre
  const cx = w / 2, cy = h / 2;
  await pg.mouse.move(cx, cy); await pg.mouse.down();
  await pg.mouse.move(cx - 90, cy + 70, { steps: 8 });
  await sleep(300);
  await pg.screenshot({ path: `${out}/${w}x${h}-aim.png` });
  await pg.mouse.up();
  await waitPhase(pg, 'fly', 2000);
  await sleep(500);
  await pg.screenshot({ path: `${out}/${w}x${h}-fly.png` });
  await waitPhase(pg, 'land');
  await pg.screenshot({ path: `${out}/${w}x${h}-land.png` });
  await waitPhase(pg, 'aim');
  console.log(w, 'after drag shot', await state(pg));
  await pg.close();
}

// scripted full cycle: find a hitting shot with no wind, fire, verify HP drop + turn switch
const pg = await open(390, 844, true);
const find = () => pg.evaluate(() => {
  __game.setWind(0, 0);
  for (let p = 5; p <= 70; p += 0.5) for (let pw = 0.4; pw <= 1; pw += 0.01) {
    const r = __game.simulate(p * Math.PI / 180, 0, pw);
    if (r.kind === 'body') return [p, pw];
  }
  return null;
});
for (let n = 0; n < 4; n++) {
  const before = await state(pg);
  const shot = await find();
  if (!shot) throw new Error('no hitting shot found');
  await pg.evaluate(([p, pw]) => { __game.aim(p, 0, pw); __game.shoot(); }, shot);
  await waitPhase(pg, 'land');
  if (n === 0) { await sleep(200); await pg.screenshot({ path: `${out}/hit.png` }); }
  await pg.waitForFunction(() => ['aim', 'over'].includes(__game.S.phase), { timeout: 10000 });
  const after = await state(pg);
  console.log('shot', n, shot, before.hp, '->', after.hp, 'turn', before.turn, '->', after.turn, after.result);
  if (after.hp[1 - before.turn] !== before.hp[1 - before.turn] - 25) throw new Error('HP did not drop by 25');
  if (after.phase === 'aim' && after.turn === before.turn) throw new Error('turn did not switch');
}
// finish Blue's win: Blue needs 2 more hits (Red has 50) — turns alternate so do 3 more shots
for (let n = 0; n < 3; n++) {
  const shot = await find();
  await pg.evaluate(([p, pw]) => { __game.aim(p, 0, pw); __game.shoot(); }, shot);
  await pg.waitForFunction(() => ['aim', 'over'].includes(__game.S.phase), { timeout: 15000 });
}
const fin = await state(pg);
console.log('final', fin);
if (fin.phase !== 'over') throw new Error('expected game over');
await sleep(500);
await pg.screenshot({ path: `${out}/win.png` });
await pg.click('#rematch'); await sleep(500);
console.log('after rematch', await state(pg));
await b.close();
console.log('console errors:', errors.length ? errors : 'none');
