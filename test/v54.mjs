// v5.4 checks: last-shot guide (ghost arc, landing X, label, readout ticks, per player, specials, reset each round) and camera mode
// (🎥 button, orbit/pinch/wheel, Me/Side/Enemy presets, clamps, back to aim, swipes never aim/fire in camera mode, build zoom, online).
// Usage: node test/v54.mjs <baseUrl> <outDir> [hot|online|all] [prefix]   (server: LEGACY_TOWERS=1 locally for online classic towers)
import { createRequire } from 'module';
import fs from 'fs';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3947', out = 'shots/v54', which = 'all', pre = 'v54'] = process.argv;
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
async function pinch(pg, cx, cy, d0, d1) {
  const c = await pg.createCDPSession(), pts = d => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(d0) });
  for (let k = 1; k <= 8; k++) { await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d0 + (d1 - d0) * k / 8) }); await sleep(16); }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await c.detach();
}
async function clampSweep(pg, tag) { // many orbit poses around both towers: never under the ground, never inside a block, zoom/pitch limits respected
  const r = await pg.evaluate(() => {
    const bad = [], g = __game, L = g.cam();
    for (const s of [0, 1]) {
      const a = g.archers[s].root.position;
      for (const yaw of [0, 0.7, 1.6, 2.4, 3.1, 4, 5, 5.9]) for (const pitch of [-1.5, -0.1, 0.05, 0.4, 1.2, 1.6]) for (const dist of [0.2, 1, 2, 4, 9, 30, 200]) for (const ty of [0.5, 2, 4])
        { const T = [a.x, ty, a.z], r = g.camPoseOf({ yaw, pitch, dist, T }); if (r.inBlock || r.pos[1] < r.ground + 0.79 || Math.hypot(r.pos[0] - T[0], r.pos[1] - T[1], r.pos[2] - T[2]) > L.max + 30) bad.push([s, yaw, pitch, dist, ty, r.pos.map(v => +v.toFixed(2))]); }
    }
    g.camSet({ pitch: -3, dist: 0.1 }); const lo = g.cam(); g.camSet({ pitch: 3, dist: 999 }); const hi = g.cam();
    return { bad: bad.slice(0, 5), n: bad.length, lo: [lo.pitch === lo.pmin, lo.dist === lo.min], hi: [hi.pitch === hi.pmax, hi.dist === hi.max] };
  });
  assert(r.n === 0, `${tag}: clamp sweep (2016 poses) never under the ground or inside a tower block ${r.n ? JSON.stringify(r.bad) : ''}`);
  assert(r.lo.every(Boolean) && r.hi.every(Boolean), `${tag}: orbit pitch and zoom clamp to their limits`);
}

if (which !== 'online') {
  // ---------------- hot-seat 360x640: guide ----------------
  const pg = await open(360, 640);
  await pg.click('#arenas button[data-a="field"]'); await pg.click('#seriesBtns button[data-s="3"]');
  await pg.evaluate(() => { __game.startHot('field', 0); __game.setWind(0, 0); }); await sleep(1200);
  let g = await G(pg);
  assert(!g.ghost && !g.labelVis && !g.mark && g.last.every(x => x === null), 'hot: no guide before the first shot');
  // Blue: a real swipe (no previous shot: no ticks on the readout)
  await swipe(pg, 180, 380, 250, 330, 10, false);
  const tip0 = await pg.$eval('#aimTip', e => e.innerHTML);
  await pg.touchscreen.touchEnd();
  const aimB1 = await pg.evaluate(() => __game.S.play && __game.S.play.m.aim);
  assert(aimB1 && !/class="gz"/.test(tip0), `hot: Blue's real swipe fired (${aimB1 && label(aimB1)}); readout has no last-shot ticks yet`);
  const landB1 = await pg.evaluate(() => __game.S.play.m.sim.arrows[0].res);
  await settle(pg); await sleep(300);
  g = await G(pg);
  assert(near(g.last[0].pitch, aimB1.pitch) && near(g.last[0].power, aimB1.power) && g.last[1] === null, 'hot: Blue\'s shot recorded (angle + power) for Blue only');
  assert(!g.ghost && !g.labelVis, 'hot: Red (no previous shot) sees no guide, Blue\'s guide is not shown on Red\'s turn');
  const aimR1 = { pitch: 41 * DEG, power: 0.47 };
  await pg.evaluate(a => __game.shootAim(a), aimR1); await settle(pg); await sleep(500);
  g = await G(pg);
  const cols = await pg.evaluate(() => __game.cols);
  assert(g.ghost && g.dashed && g.ghostN >= 6 && g.ghostCol === 0xffffff, `hot: Blue's turn: dashed ghost arc in Blue's colour (${g.ghostN} pts)`);
  assert(g.labelVis && g.label === label(aimB1), `hot: label "${g.label}" matches Blue's last shot`);
  const bow = await pg.evaluate(() => { const L = __game.S.last[0]; const ap = __game.S.st.phys.a[0]; return [ap[0], ap[1], ap[2]]; });
  assert(Math.hypot(g.ghost0[0] - bow[0], g.ghost0[2] - bow[2]) < 1.2 && g.ghost0[1] > bow[1] + 0.8 && g.ghost0[1] < bow[1] + 2.5, 'hot: ghost arc starts at Blue\'s bow');
  const expLand = landB1.pos;
  assert(g.mark && near(g.mark[0], expLand[0], 1e-3) && near(g.mark[2], expLand[2], 1e-3) && near(g.mark[1], expLand[1] + 0.35, 1e-3), `hot: faded X marks where Blue's last arrow landed (${landB1.kind} @ ${expLand.map(v => v.toFixed(1))})`);
  let lay = await layout(pg);
  assert(lay.bad.length === 0 && await noScroll(pg), `hot 360x640: guide label + camera button fit with the HUD, no overlap/scroll (${lay.bad})`);
  await shot(pg, 'guide-360x640');
  // readout ticks during a drag
  await swipe(pg, 180, 380, 200, 300, 10, false);
  const tip = await pg.$eval('#aimTip', e => ({ html: e.innerHTML, ticks: [...e.querySelectorAll('.g u')].map(u => parseFloat(u.style.left)) }));
  const want = [(aimB1.power - 0.15) / 0.85 * 100, (aimB1.pitch / DEG - 5) / 65 * 100];
  assert(tip.ticks.length === 2 && near(tip.ticks[0], want[0], 0.06) && near(tip.ticks[1], want[1], 0.06), `hot: readout has ticks at the last power/angle (${tip.ticks.map(v => v.toFixed(1))})`);
  assert(!(await vis(pg, '#lastShot')), 'hot: label tucks away while dragging (the readout ticks take over)');
  await shot(pg, 'readout-ticks-360x640');
  await pg.touchscreen.touchEnd();
  const aimB2 = await pg.evaluate(() => __game.S.play && __game.S.play.m.aim);
  await settle(pg); await sleep(300);
  // Red's turn: Red's own guide, not Blue's
  g = await G(pg);
  assert(g.ghost && g.label === label(aimR1) && g.ghostCol === 0xffffff, `hot: Red sees their own last shot "${g.label}" in Red's colour`);
  // special (bomb) still records angle/power
  await pg.evaluate(() => __game.giveAmmo('bomb', 1, 1));
  const aimR2 = { pitch: 52 * DEG, power: 0.38 };
  await pg.evaluate(a => __game.shootAim(a, 'bomb'), aimR2); await settle(pg); await sleep(300);
  g = await G(pg);
  assert(g.label === label(aimB2) && near(g.last[1].pitch, aimR2.pitch) && g.last[1].type === 'bomb', `hot: Blue sees "${g.label}"; Red's bomb recorded (${label(g.last[1])}, ${g.last[1].type})`);
  await pg.evaluate(() => __game.shootAim({ pitch: 0.349, power: 0.3 })); await settle(pg); await sleep(300);
  g = await G(pg);
  assert(g.label === label(aimR2), `hot: after the bomb, Red's guide shows the bomb shot "${g.label}"`);

  // ---------------- camera mode (touch) ----------------
  assert(await vis(pg, '#camBtn'), 'cam: 🎥 button shown while aiming');
  const aimBefore = await pg.evaluate(() => ({ aim: __game.S.aim, draw: __game.S.draw, turn: __game.S.turn }));
  await pg.tap('#camBtn'); await sleep(900);
  let c = await C(pg);
  assert(c.on && c.preset === 'me' && await vis(pg, '#camBar') && !(await vis(pg, '#pip')), 'cam: tapping 🎥 enters camera mode (preset Me, bar shown)');
  lay = await layout(pg);
  assert(lay.bad.length === 0 && lay.shown.includes('#camBar') && lay.shown.includes('#types') && await noScroll(pg), `cam 360x640: preset bar fits with the ammo slots + HUD (${lay.bad})`);
  const y0 = c.yaw, p0 = c.pitch;
  await swipe(pg, 120, 380, 260, 300, 12);
  await sleep(400);
  c = await C(pg);
  const after = await pg.evaluate(() => ({ aim: __game.S.aim, draw: __game.S.draw, phase: __game.S.phase, play: !!__game.S.play, turn: __game.S.turn, tip: !document.querySelector('#aimTip').classList.contains('hidden') }));
  assert(Math.abs(c.yaw - y0) > 0.5 && Math.abs(c.pitch - p0) > 0.05 && c.preset === 'free', `cam: one-finger drag orbits (yaw ${y0.toFixed(2)}→${c.yaw.toFixed(2)}, pitch ${p0.toFixed(2)}→${c.pitch.toFixed(2)})`);
  assert(after.phase === 'aim' && !after.play && after.turn === aimBefore.turn && JSON.stringify(after.aim) === JSON.stringify(aimBefore.aim) && after.draw === 0 && !after.tip, 'cam: the swipe did not aim or fire');
  let d0 = c.dist;
  await pinch(pg, 180, 360, 60, 200); await sleep(300); c = await C(pg);
  assert(c.dist < d0 * 0.6, `cam: pinch out zooms in (${d0.toFixed(1)}→${c.dist.toFixed(1)})`);
  d0 = c.dist; await pinch(pg, 180, 360, 200, 70); await sleep(300); c = await C(pg);
  assert(c.dist > d0 * 1.8, `cam: pinch in zooms out (${d0.toFixed(1)}→${c.dist.toFixed(1)})`);
  assert(await pg.evaluate(() => __game.S.phase === 'aim' && !__game.S.play), 'cam: pinching did not fire');
  await pg.tap('#camBar [data-p="side"]'); await sleep(1800);
  c = await C(pg);
  const V = await pg.evaluate(() => __game.S.turn), s0 = await onScreen(pg, V), s1 = await onScreen(pg, 1 - V);
  assert(c.preset === 'side' && s0 && s1 && s0[0] < s1[0], `cam: Side shows the whole battlefield, the aiming player on the left (${s0}) and the enemy on the right (${s1})`);
  assert(Math.hypot(...c.pos.map((v, i) => v - c.want[i])) < 0.3, 'cam: camera settles on the preset pose');
  await shot(pg, 'cam-side-360x640');
  await pg.tap('#camBar [data-p="enemy"]'); await sleep(1800);
  c = await C(pg); const e1 = await onScreen(pg, 1 - V);
  assert(c.preset === 'enemy' && e1 && Math.abs(e1[0]) < 0.45 && c.dist < 14, `cam: Enemy is a close-up on the enemy tower (${e1}, dist ${c.dist.toFixed(1)})`);
  await shot(pg, 'cam-enemy-360x640');
  await pg.tap('#camBar [data-p="me"]'); await sleep(1500);
  c = await C(pg); const m0 = await onScreen(pg, V);
  assert(c.preset === 'me' && m0 && m0[0] < 0.2, `cam: Me is back behind the aiming archer (${m0})`);
  await clampSweep(pg, 'cam');
  await pg.tap('#camBar [data-p="me"]'); await sleep(300);
  // Done with the Me preset -> back to aim, snapped to the default view (v5.5: a custom view would stay, see test/v55.mjs)
  await pg.tap('#camDone'); await sleep(120);
  c = await C(pg); const def = await pg.evaluate(() => __game.aimCam()[0]);
  assert(!c.on && !(await vis(pg, '#camBar')) && Math.hypot(...c.pos.map((v, i) => v - def[i])) < 0.15, 'cam: Done returns to aim mode and the view snaps back to default');
  // swipe now aims + fires again; first check 🎥 toggles off and an ammo tap exits
  await pg.tap('#camBtn'); await sleep(300); await pg.tap('#camBtn'); await sleep(150);
  assert(!(await C(pg)).on, 'cam: tapping 🎥 again exits');
  await pg.tap('#camBtn'); await sleep(300); await pg.tap('#types button[data-t="heavy"]'); await sleep(150);
  c = await C(pg);
  assert(!c.on && await pg.evaluate(() => __game.S.types[__game.S.turn] === 'heavy'), 'cam: picking an arrow (starting to aim) exits camera mode');
  await pg.tap('#types button[data-t="normal"]');
  await pg.tap('#camBtn'); await sleep(300);
  await pg.evaluate(() => __game.shootAim({ pitch: 0.524, power: 0.4 }));
  await sleep(100);
  assert(!(await C(pg)).on && await pg.evaluate(() => __game.S.phase === 'fly'), 'cam: a shot hands the camera back to the cinematics');
  await settle(pg); await sleep(300);
  await swipe(pg, 180, 380, 240, 330); await sleep(200);
  assert(await pg.evaluate(() => !!__game.S.play), 'cam: after leaving camera mode a swipe aims and fires again');
  await settle(pg); await sleep(300);

  // ---------------- landscape 740x360 ----------------
  await pg.setViewport({ width: 740, height: 360, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }); await sleep(800);
  g = await G(pg);
  assert(g.ghost && g.labelVis, `hot 740x360: guide shown (${g.label})`);
  lay = await layout(pg);
  assert(lay.bad.length === 0 && await noScroll(pg), `hot 740x360: guide label + 🎥 fit, no overlap/scroll (${lay.bad})`);
  await shot(pg, 'guide-740x360');
  await pg.tap('#camBtn'); await sleep(300); await pg.tap('#camBar [data-p="side"]'); await sleep(1800);
  lay = await layout(pg);
  const l0 = await onScreen(pg, 0), l1 = await onScreen(pg, 1);
  assert(lay.bad.length === 0 && l0 && l1 && await noScroll(pg), `cam 740x360: Side view shows both archers; bar fits (${lay.bad})`);
  await shot(pg, 'cam-side-740x360');
  await pg.tap('#camDone'); await sleep(200);

  // ---------------- reset at a new round ----------------
  for (let k = 0; k < 30; k++) {
    if ((await pg.evaluate(() => __game.S.score.join())) !== '0,0') break;
    const a = await pg.evaluate(() => __game.findHit('normal'));
    await pg.evaluate(a => __game.shootAim(a || { pitch: 0.4, power: 0.7 }), a); await settle(pg); await sleep(200);
  }
  assert((await pg.evaluate(() => __game.S.score.join())) !== '0,0', 'hot: round 1 decided');
  await pg.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp.every(h => h === 100), { timeout: 20000, polling: 100 }); await sleep(400);
  g = await G(pg);
  assert(g.last.every(x => x === null) && !g.ghost && !g.labelVis && !g.mark, 'hot: new round clears both players\' last-shot guides');
  await pg.close();

  // ---------------- desktop mouse + build-phase zoom ----------------
  const dk = await open(1280, 720);
  await dk.evaluate(() => { __game.startHot('field', 0); }); await sleep(900);
  await dk.click('#camBtn'); await sleep(400);
  c = await C(dk); const dy0 = c.yaw;
  await dk.mouse.move(500, 400); await dk.mouse.down(); for (let k = 1; k <= 10; k++) await dk.mouse.move(500 + 30 * k, 400 - 5 * k); await dk.mouse.up(); await sleep(200);
  c = await C(dk); d0 = c.dist;
  assert(Math.abs(c.yaw - dy0) > 0.5 && await dk.evaluate(() => !__game.S.play), 'desktop: mouse drag orbits in camera mode without shooting');
  await dk.mouse.move(640, 360); await dk.mouse.wheel({ deltaY: 400 }); await sleep(200); c = await C(dk);
  assert(c.dist > d0 * 1.2, `desktop: mouse wheel zooms (${d0.toFixed(1)}→${c.dist.toFixed(1)})`);
  await dk.click('#camBar [data-p="side"]'); await sleep(1500); await shot(dk, 'cam-side-1280x720');
  await clampSweep(dk, 'desktop');
  await dk.click('#camDone'); await sleep(200);
  await dk.evaluate(() => __game.startHotBuild('field', 0)); await sleep(700); await dk.evaluate(() => __game.passGo()); await sleep(800);
  assert(!(await vis(dk, '#camBtn')), 'build: no 🎥 button (Turn + drag already orbit)');
  const z0 = (await C(dk)).buildZoom;
  await dk.mouse.move(640, 300); await dk.mouse.wheel({ deltaY: 500 }); await sleep(100); await dk.mouse.wheel({ deltaY: 500 }); await sleep(200);
  const z1 = (await C(dk)).buildZoom;
  assert(z1 > z0 * 1.3, `build: mouse wheel zooms the build view (${z0}→${z1.toFixed(2)})`);
  await dk.close();
  // touch build pinch
  const pb = await open(360, 640);
  await pb.evaluate(() => __game.startHotBuild('field', 0)); await sleep(700); await pb.evaluate(() => __game.passGo()); await sleep(800);
  const nb0 = await pb.evaluate(() => __game.build.plans[0].blocks.length);
  await pinch(pb, 180, 380, 200, 70); await sleep(300);
  const bz = (await C(pb)).buildZoom, nb1 = await pb.evaluate(() => __game.build.plans[0].blocks.length);
  assert(bz > 1.3 && nb1 === nb0, `build: pinch zooms the build view without placing blocks (zoom ${bz.toFixed(2)})`);
  await pb.close();
}

if (which !== 'hot') {
  // ---------------- online: two clients ----------------
  const cA = await b.createBrowserContext(), cB = await b.createBrowserContext(), skip = 'window.__autoSkip = true;';
  const A = await open(360, 640, cA, base, skip), Bp = await open(740, 360, cB, base, skip);
  await A.click('#arenas button[data-a="field"]'); await A.click('#createBtn');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code = await A.$eval('#code', e => e.textContent);
  await Bp.goto(`${base}/?room=${code}`, { waitUntil: 'load' });
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.mode === 'online' && /aim|build|wait/.test(__game.S.phase), { timeout: 30000 });
  await sleep(1500); // live server (no LEGACY_TOWERS): build phase -> both press Ready with the default tower
  for (const P of [A, Bp]) if (await P.evaluate(() => __game.S.phase === 'build') && await vis(P, '#bReady')) await P.click('#bReady');
  for (const P of [A, Bp]) await P.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'aim', { timeout: 40000 });
  await sleep(1200);
  const both = () => Promise.all([A, Bp].map(X => settle(X)));
  const who = async () => { const t = await A.evaluate(() => __game.S.turn); const me = await A.evaluate(() => __game.S.me); return t === me ? [A, Bp] : [Bp, A]; };
  let [P, Q] = await who();
  const meP = await P.evaluate(() => __game.S.me), meQ = 1 - meP;
  // the waiting player spectates with the camera
  assert(await vis(Q, '#camBtn') && !(await vis(Q, '#types')), 'online: the waiting player has the 🎥 button (spectate)');
  await Q.evaluate(() => document.querySelector('#camBtn').click()); await sleep(300); await Q.evaluate(() => document.querySelector('#camBar [data-p="side"]').click()); await sleep(1500);
  let cq = await C(Q);
  assert(cq.on && cq.preset === 'side' && await onScreen(Q, 0) && await onScreen(Q, 1), 'online: spectator uses Side view while the opponent aims');
  await shot(Q, `online-spectate-side-${meQ ? 'B-740x360' : 'A-360x640'}`);
  const a1 = { pitch: 33 * DEG, power: 0.52 };
  await P.evaluate(a => __game.shootAim(a), a1);
  await Q.waitForFunction(() => !!__game.S.play, { timeout: 10000, polling: 50 });
  assert(!(await C(Q)).on, 'online: the opponent\'s shot ends spectate camera mode (cinematics play)');
  await both(); await sleep(500);
  [P, Q] = await who();
  let gp = await G(P), gq = await G(Q);
  assert(!gp.ghost && !gp.labelVis && !gq.ghost && !gq.labelVis, 'online: the second shooter sees no guide (no shot of their own yet); the first shooter, now waiting, sees none');
  const a2 = { pitch: 47 * DEG, power: 0.44 };
  // shooter in camera mode: swipe does not aim/fire on the server either
  await P.evaluate(() => document.querySelector('#camBtn').click()); await sleep(300);
  const box = await P.evaluate(() => [innerWidth, innerHeight]);
  if (await P.evaluate(() => innerWidth < 900)) await swipe(P, box[0] * 0.3, box[1] * 0.6, box[0] * 0.6, box[1] * 0.45); else { await P.mouse.move(300, 300); await P.mouse.down(); await P.mouse.move(420, 260, { steps: 8 }); await P.mouse.up(); }
  await sleep(700);
  assert(await P.evaluate(() => __game.S.phase === 'aim' && !__game.S.play) && await Q.evaluate(() => !__game.S.play), 'online: a swipe in camera mode neither aims nor fires (both clients)');
  await P.evaluate(() => document.querySelector('#camDone').click()); await sleep(200);
  await P.evaluate(a => __game.shootAim(a), a2); await P.waitForFunction(() => !!__game.S.play, { timeout: 10000, polling: 50 }); await both(); await sleep(500);
  [P, Q] = await who();
  gp = await G(P); gq = await G(Q);
  const colsP = await P.evaluate(() => __game.cols[__game.S.me]);
  assert(gp.ghost && gp.labelVis && gp.label === label(a1) && gp.ghostCol === 0xffffff && gp.mark, `online: first shooter's turn again, their own guide "${gp.label}" + landing X in their colour`);
  assert(!gq.ghost && !gq.labelVis, 'online: the opponent\'s screen does not show it');
  await shot(P, `online-guide-${P === A ? 'A-360x640' : 'B-740x360'}`);
  await P.evaluate(() => __game.shootAim({ pitch: 0.436, power: 0.35 })); await P.waitForFunction(() => !!__game.S.play, { timeout: 10000, polling: 50 }); await both(); await sleep(500);
  [P, Q] = await who();
  gp = await G(P);
  assert(gp.ghost && gp.label === label(a2), `online: the other client shows its own last shot "${gp.label}"`);
  await shot(P, `online-guide-${P === A ? 'A-360x640' : 'B-740x360'}`);
  for (const X of [A, Bp]) { const l = await layout(X); assert(l.bad.length === 0 && await noScroll(X), `online ${X === A ? '360x640' : '740x360'}: no overlap/scroll (${l.bad})`); }
  await A.close(); await Bp.close();
}

console.log(results.length, 'checks passed');
console.log('console errors:', errors.length ? errors : 'none');
await b.close();
if (errors.length) process.exit(1);
