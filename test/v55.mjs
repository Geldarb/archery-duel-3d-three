// v5.5 checks: custom camera views stay in place (aim, fire, spectate; per player; Me resets; kept across rounds, reset per match; online) + bold last-shot markers.
// Usage: node test/v55.mjs <baseUrl> <outDir> [hot|online|all] [prefix]
import { createRequire } from 'module';
import fs from 'fs';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3947', out = 'shots/v55', which = 'all', pre = 'v55'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], sleep = ms => new Promise(r => setTimeout(r, ms)), results = [];
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); results.push('ok ' + m); console.log('ok', m); };
const shot = (pg, name) => pg.screenshot({ captureBeyondViewport: false, path: `${out}/${pre}-${name}.png` });
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
const G = pg => pg.evaluate(() => __game.guide());
const C = pg => pg.evaluate(() => __game.cam());
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const label = a => `Last: ${Math.round(a.pitch / DEG)}° · ${Math.round(a.power * 100)}%`;
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
async function swipe(pg, x0, y0, x1, y1, n = 10, release = true) {
  await pg.touchscreen.touchStart(x0, y0);
  for (let k = 1; k <= n; k++) { await pg.touchscreen.touchMove(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n); await sleep(16); }
  if (release) await pg.touchscreen.touchEnd();
}

const nearCam = (pg, f) => pg.waitForFunction(f, { timeout: 6000, polling: 50 }).then(() => true, () => false);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const VW = pg => pg.evaluate(() => __game.views());
const viewP = pg => pg.evaluate(() => __game.viewPose());
// sample the camera through a whole shot: returns max distance of the (unshaken) look point from want, and of the position from wantPos
async function track(pg, wantPos, wantLook) {
  let mp = 0, ml = 0, n = 0;
  await pg.waitForFunction(() => !!__game.S.play, { timeout: 10000, polling: 20 });
  while (await pg.evaluate(() => !!__game.S.play)) { const c = await C(pg); mp = Math.max(mp, dist3(c.pos, wantPos)); ml = Math.max(ml, dist3(c.look, wantLook)); n++; await sleep(80); }
  return { mp, ml, n };
}
async function setView(pg, preset) { await pg.evaluate(() => document.querySelector('#camBtn').click()); await sleep(300); await pg.evaluate(p => document.querySelector(`#camBar [data-p="${p}"]`).click(), preset); await sleep(200); await pg.evaluate(() => document.querySelector('#camDone').click()); await sleep(1600); }
const guideCheck = async (pg, tag) => {
  const g = await G(pg);
  assert(g.ghost && g.dashes >= 8 && g.ghostCol === 0xffffff && g.glow === 0x8fd8ff && g.arcTop && g.markTop && g.mark && g.markScale > 1.4 && g.labelVis, `${tag}: last-shot arc = ${g.dashes} thick white dashes with light-blue glow, big X (${g.markScale.toFixed(2)}), both drawn on top; label "${g.label}"`);
};

if (which !== 'online') {
  const pg = await open(360, 640);
  await pg.click('#arenas button[data-a="field"]'); await pg.click('#seriesBtns button[data-s="3"]');
  await pg.evaluate(() => { __game.startHot('field', 0); __game.setWind(0, 0); }); await sleep(1200);
  // Blue picks Side and leaves camera mode
  await setView(pg, 'side');
  let c = await C(pg), vw = await VW(pg), vp = await viewP(pg);
  assert(!c.on && vw[0] && vw[0].preset === 'side' && !vw[1] && dist3(c.pos, vp) < 0.05, 'hot: Done after Side keeps the Side view (no snap back); stored for Blue only');
  const T0 = vw[0].T;
  // real swipe aims in that view and fires; the camera holds still for the whole shot
  await swipe(pg, 180, 380, 250, 330, 10, false); await sleep(150);
  c = await C(pg);
  assert(dist3(c.pos, vp) < 0.05 && await pg.evaluate(() => __game.S.draw > 0), 'hot: aiming swipe works in the Side view, camera does not move');
  await pg.touchscreen.touchEnd();
  setTimeout(() => shot(pg, 'fire-side-360x640').catch(() => {}), 650);
  let tr = await track(pg, vp, T0);
  assert(tr.n >= 5 && tr.ml < 1e-3 && tr.mp < 0.9, `hot: through the whole shot (${tr.n} samples) the Side view stays (look drift ${tr.ml.toExponential(1)}, pos within shake ${tr.mp.toFixed(2)})`);
  await settle(pg); await sleep(1500);
  // Red has no custom view: default aim cam
  let ok = await nearCam(pg, () => { const c = __game.cam(), a = __game.aimCam()[0]; return Math.hypot(c.pos[0] - a[0], c.pos[1] - a[1], c.pos[2] - a[2]) < 0.2; });
  c = await C(pg); let ac = await pg.evaluate(() => __game.aimCam()[0]);
  assert(ok && !(await VW(pg))[1], 'hot: Red (no custom view) gets the default aim cam');
  await guideCheck(pg, 'hot 360x640 Red').catch(async e => { if (!(await G(pg)).last[1]) results.push('skip guide (Red has no last shot yet)'); else throw e; });
  // Red picks Enemy view, fires with it
  await setView(pg, 'enemy');
  vw = await VW(pg); vp = await viewP(pg);
  assert(vw[1] && vw[1].preset === 'enemy' && vw[0].preset === 'side', 'hot: Red\'s Enemy view stored separately from Blue\'s Side view');
  await pg.evaluate(() => __game.shootAim({ pitch: 0.6, power: 0.55 }));
  tr = await track(pg, vp, vw[1].T);
  assert(tr.ml < 1e-3 && tr.mp < 0.9, 'hot: Red\'s shot plays from Red\'s Enemy view');
  await settle(pg); await sleep(1600);
  // back to Blue: Blue's Side view returns
  ok = await nearCam(pg, () => { const c = __game.cam(), a = __game.viewPose(); return a && Math.hypot(c.pos[0] - a[0], c.pos[1] - a[1], c.pos[2] - a[2]) < 0.2; });
  c = await C(pg); vp = await viewP(pg);
  assert(ok && dist3(c.look, T0) < 0.2, 'hot: Blue\'s turn again: camera returns to Blue\'s own Side view');
  await guideCheck(pg, 'hot 360x640 Blue');
  await shot(pg, 'guide-side-360x640');
  // clamp: a view aimed into the ground/tower is lifted
  const cl = await pg.evaluate(() => { const a = __game.archers[0].root.position; const r = __game.camPoseOf({ yaw: 1.6, pitch: -0.5, dist: 2, T: [a.x, 0.3, a.z] }); return r.pos[1] >= r.ground + 0.79 && !r.inBlock; });
  assert(cl, 'hot: a kept view is still clamped (never under the ground or inside blocks)');
  // camera mode re-opens on the kept view; Me restores the default follow cam
  await pg.evaluate(() => document.querySelector('#camBtn').click()); await sleep(300);
  c = await C(pg);
  assert(c.on && c.preset === 'side', 'hot: 🎥 re-opens on the kept Side view');
  await pg.evaluate(() => document.querySelector('#camBar [data-p="me"]').click()); await sleep(150); await pg.evaluate(() => document.querySelector('#camDone').click()); await sleep(1500);
  ok = await nearCam(pg, () => { const c = __game.cam(), a = __game.aimCam()[0]; return Math.hypot(c.pos[0] - a[0], c.pos[1] - a[1], c.pos[2] - a[2]) < 0.2; });
  vw = await VW(pg); c = await C(pg); ac = await pg.evaluate(() => __game.aimCam()[0]);
  assert(!vw[0] && vw[1] && ok, 'hot: Me clears Blue\'s custom view (Red keeps theirs) and snaps to the default aim cam');
  await pg.evaluate(() => __game.shootAim({ pitch: 0.55, power: 0.6 }));
  await pg.waitForFunction(() => __game.S.play && __game.S.play.ft > 0.5, { timeout: 10000, polling: 30 });
  c = await C(pg);
  assert(dist3(c.pos, ac) > 3, `hot: with Me the follow cam is back (camera moved ${dist3(c.pos, ac).toFixed(1)} m with the arrow)`);
  await settle(pg); await sleep(500);
  // across rounds: kept; new match: reset
  for (let k = 0; k < 30 && (await pg.evaluate(() => __game.S.score.join())) === '0,0'; k++) { const a = await pg.evaluate(() => __game.findHit('normal')); await pg.evaluate(a => __game.shootAim(a || { pitch: 0.4, power: 0.7 }), a); await settle(pg); await sleep(200); }
  await pg.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp.every(h => h === 100), { timeout: 20000, polling: 100 }); await sleep(300);
  vw = await VW(pg);
  assert(vw[1] && vw[1].preset === 'enemy', 'hot: custom views are kept across rounds of a series');
  // landscape: Side view fire
  await pg.setViewport({ width: 740, height: 360, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(600);
  const t = await pg.evaluate(() => __game.S.turn);
  await setView(pg, 'side'); vp = await viewP(pg); vw = await VW(pg);
  if (await pg.evaluate(() => !!__game.S.last[__game.S.turn])) { await guideCheck(pg, 'hot 740x360'); await shot(pg, 'guide-side-740x360'); }
  await pg.evaluate(() => __game.shootAim({ pitch: 0.5, power: 0.62 }));
  setTimeout(() => shot(pg, 'fire-side-740x360').catch(() => {}), 650);
  tr = await track(pg, vp, vw[t].T);
  assert(tr.ml < 1e-3 && tr.mp < 0.9, `hot 740x360: shot plays from the Side view (look drift ${tr.ml.toExponential(1)})`);
  await settle(pg); await sleep(1500);
  if (!(await pg.evaluate(() => fs => fs, 0)) || true) { // the other player shoots back so the first has a guide in landscape
    await pg.evaluate(() => __game.shootAim({ pitch: 0.62, power: 0.5 })); await settle(pg); await sleep(1600);
    if (await pg.evaluate(() => !!__game.S.last[__game.S.turn])) { await guideCheck(pg, 'hot 740x360 after'); await shot(pg, 'guide-side2-740x360'); }
  }
  await pg.evaluate(() => { document.querySelector('#menuBtn').click(); }); await sleep(300);
  await pg.evaluate(() => __game.startHot('field', 0)); await sleep(1200);
  vw = await VW(pg);
  assert(!vw[0] && !vw[1], 'hot: a new match resets both views');
  await pg.close();
}

if (which !== 'hot') {
  const cA = await b.createBrowserContext(), cB = await b.createBrowserContext(), skip = 'window.__autoSkip = true;';
  const A = await open(360, 640, cA, base, skip), Bp = await open(740, 360, cB, base, skip);
  await A.click('#arenas button[data-a="field"]'); await A.click('#createBtn');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code = await A.$eval('#code', e => e.textContent);
  await Bp.goto(`${base}/?room=${code}`, { waitUntil: 'load' });
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.mode === 'online' && /aim|build|wait/.test(__game.S.phase), { timeout: 30000 });
  await sleep(1500);
  for (const P of [A, Bp]) if (await P.evaluate(() => __game.S.phase === 'build') && await vis(P, '#bReady')) await P.click('#bReady');
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'aim', { timeout: 40000 });
  await sleep(1200);
  const who = async () => { const t = await A.evaluate(() => __game.S.turn); const me = await A.evaluate(() => __game.S.me); return t === me ? [A, Bp] : [Bp, A]; };
  let [P, Q] = await who();
  // waiting player picks Side; spectates the opponent's whole shot from it
  await setView(Q, 'side'); let vq = await viewP(Q), wq = (await VW(Q)).find(Boolean);
  await P.evaluate(() => __game.shootAim({ pitch: 0.55, power: 0.55 }));
  let tr = await track(Q, vq, wq.T);
  assert(tr.ml < 1e-3 && tr.mp < 0.9, `online: spectator keeps their Side view through the opponent's shot (${tr.n} samples)`);
  await Promise.all([A, Bp].map(X => settle(X))); await sleep(1500);
  // now it's Q's turn: aims + fires from the same view
  [P, Q] = await who();
  const okP = await nearCam(P, () => { const c = __game.cam(), a = __game.viewPose(); return a && Math.hypot(c.pos[0] - a[0], c.pos[1] - a[1], c.pos[2] - a[2]) < 0.2; });
  assert(okP, 'online: on their own turn the Side view is still in place');
  await P.evaluate(() => __game.shootAim({ pitch: 0.5, power: 0.6 }));
  tr = await track(P, vq, wq.T);
  assert(tr.ml < 1e-3, 'online: their own shot plays from the Side view');
  const vo = await VW(Q);
  assert(vo.every(v => !v), 'online: the opponent\'s camera is unaffected (still default)');
  await Promise.all([A, Bp].map(X => settle(X)));
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
assert(errors.length === 0, 'no page errors');
console.log(`PASS ${results.length} checks`);
await b.close();
