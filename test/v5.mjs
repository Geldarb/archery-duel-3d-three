// v5 checks: physics towers (base collapse, archer falls), power-ups (pickup -> bomb / wheelchair), online block/HP sync, FPS.
// Usage: node test/v5.mjs <baseUrl> <outDir> [hot|online|all] [prefix]   (V5_SIZES="360x640,740x360" for hot-seat viewports)
import { createRequire } from 'module';
import fs from 'fs';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3947', out = 'shots', which = 'all', pre = 'v5'] = process.argv;
const SIZES = (process.env.V5_SIZES || '360x640').split(',').map(s => s.split('x').map(Number));
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [], sleep = ms => new Promise(r => setTimeout(r, ms)), results = [];
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); results.push('ok ' + m); };
async function open(w, h, ctx = b) {
  const pg = await ctx.newPage();
  await pg.setViewport({ width: w, height: h, isMobile: w < 900, hasTouch: w < 900, deviceScaleFactor: 1 });
  pg.on('console', m => { if (m.type() === 'error') errors.push(`${w}x${h}: ${m.text()}`); });
  pg.on('pageerror', e => errors.push(`${w}x${h}: ${e.message}`));
  await pg.evaluateOnNewDocument(() => { // wheelchair aim: land on the slab beside the target archer, else hit them, else their tower
    window.chairAim = who => { const a = __game.st.phys.a[who], near = r => Math.hypot(r.pos[0] - a[0], r.pos[2] - a[2]) < 1.6 && Math.abs(r.pos[1] - a[1]) < 1.2;
      return __game.findLanding(r => near(r) && r.kind === 'block' && __game.layout[r.block].kind === 'slab', 'wheelchair') || __game.findLanding(r => near(r) && (r.kind === 'body' || r.kind === 'head'), 'wheelchair')
        || __game.findLanding(r => r.kind === 'block' && __game.layout[r.block].s === who, 'wheelchair'); };
  });
  await pg.goto(base, { waitUntil: 'load' }); await pg.waitForFunction('window.__ready', { timeout: 30000 }); await sleep(600);
  return pg;
}
const settle = pg => pg.waitForFunction(() => !__game.S.play && ['aim', 'over', 'menu'].includes(__game.S.phase), { timeout: 60000, polling: 100 });
const info = pg => pg.evaluate(() => ({ turn: __game.S.turn, phase: __game.S.phase, hp: [...__game.S.hp], st: JSON.parse(JSON.stringify(__game.st)), drift: __game.S.lastDrift, log: __game.S.lastLog, got: __game.S.lastGot, fps: __game.S.fps, score: [...__game.S.score] }));
const tops = (pg, side) => pg.evaluate(s => __game.blocks().map((b, i) => [i, b[1]]).filter(([i]) => __game.layout[i].s === s && __game.layout[i].pos[1] > 3), side);
const dropped = (before, after) => before.filter(([i, y], k) => y - after[k][1] > 0.5).length;
const moved = (a, b) => a.filter((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1], p[2] - b[i][2]) > 0.3).length;
async function watchShot(pg, shot, when, path, minFps) { // fire, then screenshot once when() is true in the page; track the FPS while it plays
  await shot();
  let shotTaken = false, fps = 99, started = false;
  for (let t = 0; t < 800; t++) {
    const [w, playing, f] = await pg.evaluate(`[(${when})(), !!__game.S.play, __game.S.fps || 99]`);
    if (playing) started = true;
    if (!started && t < 250) { await sleep(80); continue; } // wait for the (network-delayed) shot to start playing
    if (t > 8) fps = Math.min(fps, f);
    if (w && !shotTaken && path) { await sleep(120); await pg.screenshot({ captureBeyondViewport: false, path }); shotTaken = true; }
    if (!playing && t > 3) break;
    await sleep(80);
  }
  return { shotTaken, fps };
}
const BASE_IDS = side => `__game.layout.map((l, i) => l.s === ${side} && l.kind === 'wall' && l.pos[1] < 0.6 ? i : -1).filter(i => i >= 0)`;
const missAim = { pitch: 0.12, power: 0.3 };

if (which !== 'online') for (const [W, H] of SIZES) {
  const tag = `${pre}-hot-${W}x${H}`, pg = await open(W, H);
  await pg.evaluate(() => { __game.S.seriesChoice = 3; __game.startHot('field', 0); __game.setWind(0, 0); }); await sleep(1500);
  const idleFps = await pg.evaluate(() => __game.S.fps);
  // 1) base shot: Heavy into Red's bottom course -> everything above collapses, Red falls and takes damage
  const hit = await pg.evaluate(`__game.findBlockHit(${BASE_IDS(1)}, 'heavy')`);
  assert(hit, `${tag}: found a heavy aim at Red's base course (block ${hit && hit.block})`);
  const t0 = await tops(pg, 1), blk0 = await pg.evaluate(() => __game.blocks());
  const w1 = await watchShot(pg, () => pg.evaluate(a => __game.shootAim(a, 'heavy'), hit.aim),
    `() => __game.blocks().filter((b, i) => __game.layout[i].s === 1 && __game.layout[i].pos[1] > 3 && __game.layout[i].pos[1] - b[1] > 0.6).length >= 3`, `${out}/${tag}-collapse.png`);
  await settle(pg); const i1 = await info(pg), t1 = await tops(pg, 1);
  console.log(tag, 'base collapse: upper blocks dropped', dropped(t0, t1), '/', t0.length, 'red feet', i1.st.phys.a[1].map(v => v.toFixed(2)), 'hp', i1.hp, 'log', JSON.stringify(i1.log), 'fps idle/min', idleFps && idleFps.toFixed(1), w1.fps.toFixed(1));
  assert(dropped(t0, t1) >= 3, `${tag}: shooting the base collapses the tower above (${dropped(t0, t1)} upper blocks fell)`);
  assert(i1.st.phys.a[1][1] < 4.5 && i1.hp[1] < 100 && i1.log.some(e => e.who === 1 && ['fall', 'ground', 'debris'].includes(e.kind)), `${tag}: Red fell and took fall damage (hp ${i1.hp[1]})`);
  assert(i1.hp.join() === i1.st.hp.join(), `${tag}: HUD HP = state HP`);
  assert(w1.shotTaken, `${tag}: mid-collapse screenshot`);
  // 2) Red misses; Blue pops a power-up balloon -> BOMB ammo
  await pg.evaluate(a => __game.shootAim(a, 'normal'), missAim); await settle(pg);
  await pg.evaluate(() => __game.setPickup({ kind: 'bomb', pos: [0, 8.5, 0] })); await sleep(900);
  await pg.screenshot({ captureBeyondViewport: false, path: `${out}/${tag}-pickup.png` });
  const pa = await pg.evaluate(() => __game.findPickupHit('normal'));
  assert(pa, `${tag}: found an aim at the power-up`);
  await pg.evaluate(a => __game.shootAim(a, 'normal'), pa); await settle(pg);
  const i2 = await info(pg);
  console.log(tag, 'pickup: got', i2.got, 'ammo', JSON.stringify(i2.st.ammo), 'pickup now', i2.st.pickup, 'spawnIn', i2.st.spawnIn);
  assert(i2.got === 'bomb' && i2.st.ammo[0].bomb === 1 && !i2.st.pickup, `${tag}: arrow hit grants a bomb to Blue`);
  await pg.evaluate(a => __game.shootAim(a, 'normal'), missAim); await settle(pg); // Red
  // 3) Blue: bomb slot shows with a count, select it, lob it at Red's tower
  const slot = await pg.evaluate(() => { const b = document.querySelector('#types button[data-t="bomb"]'); return { vis: !b.classList.contains('hidden') && b.offsetWidth > 0, n: b.querySelector('em').textContent }; });
  assert(slot.vis && slot.n === '×1', `${tag}: bomb ammo slot visible with count ${slot.n}`);
  await pg.click('#types button[data-t="bomb"]'); await sleep(300);
  assert(await pg.evaluate(() => __game.S.types[0]) === 'bomb', `${tag}: bomb selected from the HUD`);
  await pg.screenshot({ captureBeyondViewport: false, path: `${out}/${tag}-bomb-slot.png` });
  const ba = await pg.evaluate(() => (__game.findLanding(r => r.kind === 'block' && __game.layout[r.block].s === 1 && r.pos[1] > 2.5, 'bomb') || __game.findLanding(r => r.kind === 'block' && __game.layout[r.block].s === 1, 'bomb')));
  assert(ba, `${tag}: found a bomb lob onto Red's tower`);
  const bb = await pg.evaluate(() => __game.blocks()), hp3 = (await info(pg)).hp;
  const w3 = await watchShot(pg, () => pg.evaluate(a => __game.shootAim(a, 'bomb'), ba.aim), `() => __game.blasted()`, `${out}/${tag}-bomb-blast.png`);
  await settle(pg); const i3 = await info(pg), ba2 = await pg.evaluate(() => __game.blocks());
  console.log(tag, 'bomb: blocks moved', moved(bb, ba2), 'hp', hp3, '->', i3.hp, 'ammo', JSON.stringify(i3.st.ammo), 'log', JSON.stringify(i3.log.filter(e => e.kind === 'blast')), 'fps min', w3.fps.toFixed(1));
  assert(w3.shotTaken && moved(bb, ba2) >= 8, `${tag}: bomb blast flings blocks (${moved(bb, ba2)} moved)`);
  assert(i3.st.ammo[0].bomb === 0, `${tag}: bomb consumed`);
  // 4) Red gets a wheelchair (test helper) and lobs it next to Blue
  await pg.evaluate(() => __game.giveAmmo('wheelchair', 1, 1)); await sleep(200);
  await pg.click('#types button[data-t="wheelchair"]'); await sleep(200);
  const wa = await pg.evaluate(() => chairAim(0));
  assert(wa, `${tag}: found a wheelchair lob at Blue (lands ${wa && wa.res.kind})`);
  const wb = await pg.evaluate(() => __game.blocks()), hp4 = (await info(pg)).hp;
  const w4 = await watchShot(pg, () => pg.evaluate(a => __game.shootAim(a, 'wheelchair'), wa.aim), `() => __game.spinning() && __game.S.play.run.k > __game.S.play.run.spin.start + 40`, `${out}/${tag}-wheelchair.png`);
  await settle(pg); const i4 = await info(pg), wa2 = await pg.evaluate(() => __game.blocks());
  console.log(tag, 'wheelchair: lands', wa.res.kind, 'blocks moved', moved(wb, wa2), 'hp', hp4, '->', i4.hp, 'spin log', JSON.stringify(i4.log.filter(e => e.kind === 'spin')), 'fps min', w4.fps.toFixed(1));
  assert(w4.shotTaken, `${tag}: wheelchair spun (screenshot)`);
  assert(i4.log.some(e => e.kind === 'spin' && e.who === 0) && i4.hp[0] < hp4[0], `${tag}: wheelchair spin hurts the archer next to it (${hp4[0]} -> ${i4.hp[0]})`);
  // 5) round over -> towers, power-ups and ammo reset (Bo3)
  await pg.evaluate(() => { __game.S.st.pickup = { kind: 'bomb', pos: [0, 10, 0] }; __game.S.st.ammo[1].bomb = 2; });
  let guard = 0;
  while ((await info(pg)).score.join() === '0,0' && guard++ < 12) {
    const s = await info(pg); const who = s.turn, opp = 1 - who;
    await pg.evaluate(o => { __game.S.st.hp[o] = 1; __game.S.hp[o] = 1; }, opp);
    const aim = await pg.evaluate(o => { __game.giveAmmo('bomb', 1); const f = __game.st.phys.a[o]; return (__game.findLanding(r => Math.hypot(r.pos[0] - f[0], r.pos[1] - f[1], r.pos[2] - f[2]) < 2, 'bomb') || __game.findLanding(r => Math.hypot(r.pos[0] - f[0], r.pos[2] - f[2]) < 2.8, 'bomb') || {}).aim; }, opp);
    const fired = await pg.evaluate(a => __game.shootAim(a || { pitch: 0.3, power: 0.8 }, 'bomb'), aim);
    await pg.waitForFunction(() => !__game.S.play, { timeout: 60000 }); await sleep(200);
    const s2 = await info(pg); console.log(tag, 'KO try', guard, 'who', who, 'aim', !!aim, 'fired', fired, 'hp', s2.hp, 'score', s2.score, 'log', JSON.stringify(s2.log));
  }
  await settle(pg); const i5 = await info(pg);
  const fresh = await pg.evaluate(() => __game.blocks().every((b, i) => Math.hypot(b[0] - __game.layout[i].pos[0], b[1] - __game.layout[i].pos[1], b[2] - __game.layout[i].pos[2]) < 1e-6));
  console.log(tag, 'next round: score', i5.score, 'hp', i5.hp, 'fresh towers', fresh, 'pickup', i5.st.pickup, 'ammo', JSON.stringify(i5.st.ammo));
  assert(i5.score[0] + i5.score[1] === 1 && fresh && i5.hp.join() === '100,100' && !i5.st.pickup && i5.st.ammo.every(a => Object.values(a).every(n => n === 0)), `${tag}: new round resets towers, power-ups, ammo`);
  await pg.close();
}

if (which !== 'hot') {
  const A = await open(360, 640, await b.createBrowserContext()), B = await open(740, 360, await b.createBrowserContext());
  await A.click('#arenas button[data-a="field"]'); await A.click('#seriesBtns button[data-s="3"]'); await A.click('#createBtn');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code = await A.$eval('#code', e => e.textContent);
  await B.goto(`${base}/?room=${code}`, { waitUntil: 'load' });
  for (const P of [A, B]) await P.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'aim', { timeout: 20000 });
  await sleep(1000);
  const sync = async label => {
    const [ia, ib] = [await info(A), await info(B)], [ba, bb] = [await A.evaluate(() => __game.blocks()), await B.evaluate(() => __game.blocks())];
    let d = 0; ba.forEach((p, i) => { for (let k = 0; k < 7; k++) d = Math.max(d, Math.abs(p[k] - bb[i][k])); });
    let ds = 0; ba.forEach((p, i) => { for (let k = 0; k < 3; k++) ds = Math.max(ds, Math.abs(p[k] - ia.st.phys.b[i][k])); });
    console.log(`online ${label}: hp A ${ia.hp} B ${ib.hp} | block diff A-B ${d.toExponential(2)} | A vs server ${ds.toExponential(2)} | live drift A ${ia.drift && ia.drift.toExponential(2)} B ${ib.drift && ib.drift.toExponential(2)} | archers ${JSON.stringify(ia.st.phys.a.map(a => a.map(v => +v.toFixed(2))))}`);
    assert(JSON.stringify(ia.hp) === JSON.stringify(ib.hp) && JSON.stringify(ia.st.hp) === JSON.stringify(ib.st.hp) && ia.hp.join() === ia.st.hp.join(), `online ${label}: HP agree on both clients (${ia.hp})`);
    assert(!(ia.drift > 0.05) && !(ib.drift > 0.05), `online ${label}: live playback matched the server result (drift ${ia.drift})`);
    assert(d < 1e-9 && ds < 1e-9, `online ${label}: block transforms identical on both clients and = server state`);
    assert(JSON.stringify(ia.st.ammo) === JSON.stringify(ib.st.ammo) && JSON.stringify(ia.st.pickup) === JSON.stringify(ib.st.pickup), `online ${label}: ammo + power-up agree`);
    return [ia, ib];
  };
  const both = () => Promise.all([settle(A), settle(B)]);
  // A (Blue) knocks out Red's base with a heavy; both watch it collapse
  const hit = await A.evaluate(`__game.findBlockHit(${BASE_IDS(1)}, 'heavy')`);
  const t0 = await tops(A, 1);
  const shotB = watchShot(B, async () => {}, `() => __game.blocks().filter((b, i) => __game.layout[i].s === 1 && __game.layout[i].pos[1] > 3 && __game.layout[i].pos[1] - b[1] > 0.6).length >= 3`, `${out}/${pre}-online-B-740x360-collapse.png`);
  const shotA = watchShot(A, () => A.evaluate(a => __game.shootAim(a, 'heavy'), hit.aim), `() => __game.blocks().filter((b, i) => __game.layout[i].s === 1 && __game.layout[i].pos[1] > 3 && __game.layout[i].pos[1] - b[1] > 0.6).length >= 3`, `${out}/${pre}-online-A-360x640-collapse.png`);
  const [wa] = await Promise.all([shotA, shotB]); await both();
  const [ia] = await sync('base collapse');
  const t1 = await tops(A, 1);
  console.log('online collapse: upper red blocks dropped', dropped(t0, t1), 'red hp', ia.hp[1], 'log', JSON.stringify(ia.log), 'A fps min', wa.fps.toFixed(1));
  assert(dropped(t0, t1) >= 3 && ia.hp[1] < 100, 'online: base shot collapses Red tower, Red takes fall damage');
  // keep playing: misses until the server spawns a power-up, pop it, then use the special(s)
  const used = new Set();
  for (let n = 0; n < 22 && used.size < 2; n++) {
    const s = await info(A);
    if (s.phase === 'over') break;
    const P = s.turn === 0 ? A : B, O = s.turn === 0 ? B : A, me = s.turn, tagP = s.turn === 0 ? 'A-360x640' : 'B-740x360';
    const have = Object.keys(s.st.ammo[me]).filter(k => s.st.ammo[me][k] > 0);
    let label, run;
    if (have.length) {
      const k = have[0];
      await P.click(`#types button[data-t="${k}"]`); await sleep(200);
      const aim = await P.evaluate(k => { const opp = 1 - __game.S.me, a = __game.st.phys.a[opp];
        return (k === 'wheelchair' && chairAim(opp)) || __game.findLanding(r => Math.hypot(r.pos[0] - a[0], r.pos[1] - a[1], r.pos[2] - a[2]) < 2.5, k)
          || __game.findLanding(r => r.kind === 'block' && __game.layout[r.block].s === opp && r.pos[1] > 2.5, k) || __game.findLanding(r => r.kind === 'block' && __game.layout[r.block].s === opp, k) || __game.findLanding(r => r.kind === 'ground' && Math.abs(r.pos[0] - a[0]) < 3, k); }, k);
      assert(aim, `online: aim for ${k}`);
      const cond = k === 'bomb' ? `() => __game.blasted()` : `() => __game.spinning() && __game.S.play.run.k > __game.S.play.run.spin.start + 12`;
      const before = await A.evaluate(() => __game.blocks());
      const wo = watchShot(O, async () => {}, cond, `${out}/${pre}-online-${s.turn === 0 ? 'B-740x360' : 'A-360x640'}-${k}.png`);
      const wp = watchShot(P, () => P.evaluate((a, k) => __game.shootAim(a, k), aim.aim, k), cond, `${out}/${pre}-online-${tagP}-${k}.png`);
      const [r1, r2] = await Promise.all([wp, wo]); await both();
      const [x] = await sync(`${k} by ${me}`);
      const mv = moved(before, await A.evaluate(() => __game.blocks()));
      console.log(`online ${k}: landed ${aim.res.kind}, blocks moved ${mv}, log ${JSON.stringify(x.log)}, screenshots ${r1.shotTaken}/${r2.shotTaken}`);
      assert(r1.shotTaken && r2.shotTaken && x.st.ammo[me][k] === 0, `online: ${k} played on both clients and consumed`);
      if (k === 'bomb') assert(mv >= 5 || x.log.some(e => e.kind === 'blast'), `online: bomb moves blocks (${mv})`);
      used.add(k); continue;
    }
    if (s.st.pickup) {
      const pa = await P.evaluate(() => __game.findPickupHit('normal'));
      if (pa) {
        await P.evaluate(a => __game.shootAim(a, 'normal'), pa); await sleep(300); await both();
        const [x] = await sync(`pickup by ${me}`);
        console.log('online pickup: got', x.got, 'ammo', JSON.stringify(x.st.ammo));
        assert(x.got === s.st.pickup.kind && x.st.ammo[me][x.got] === 1, `online: server validated the pickup (${x.got})`);
        continue;
      }
    }
    await P.evaluate(a => __game.shootAim(a, 'normal'), missAim); await sleep(300); await both();
    await sync(`miss by ${me} (pickup ${JSON.stringify(s.st.pickup)})`);
  }
  console.log('online specials used:', [...used]);
  assert(used.size >= 1, 'online: at least one server-spawned power-up collected and used');
}
console.log('console errors:', errors.length ? errors : 'none');
assert(errors.length === 0, 'no console errors');
console.log(results.join('\n'));
await b.close();
