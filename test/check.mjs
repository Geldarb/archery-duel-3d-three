// Usage: node test/check.mjs <baseUrl> <outDir> [hot|online|all]
import { createRequire } from 'module';
import fs from 'fs';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3947', out = 'shots', which = 'all'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };
async function open(w, h, touch, ctx = b, url = base) {
  const pg = await ctx.newPage();
  await pg.setViewport({ width: w, height: h, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  pg.on('console', m => { if (m.type() === 'error') errors.push(`${w}: ${m.text()}`); });
  pg.on('pageerror', e => errors.push(`${w}: ${e.message}`));
  await pg.goto(url, { waitUntil: 'networkidle0' });
  await pg.waitForFunction('window.__ready', { timeout: 20000 });
  await sleep(800);
  return pg;
}
const st = pg => pg.evaluate(() => ({ turn: __game.S.turn, phase: __game.S.phase, hp: [...__game.S.hp], mode: __game.S.mode, arena: __game.S.arenaId, winner: __game.S.winner, score: [...__game.S.score], best: __game.S.best, merl: __game.S.merlons.join('') }));
const done = pg => pg.waitForFunction(() => !__game.S.play && ['aim', 'over', 'round', 'menu'].includes(__game.S.phase), { timeout: 20000 });
const settle = pg => pg.waitForFunction(() => ['aim', 'over', 'menu'].includes(__game.S.phase) && !__game.S.play, { timeout: 20000 });

if (which !== 'online') {
  // customisation: set both hot-seat players' looks via the UI, check they persist across reload and show in a match
  {
    const pg = await open(390, 844, true);
    await pg.evaluate(() => localStorage.clear()); await pg.reload({ waitUntil: 'networkidle0' }); await pg.waitForFunction('window.__ready');
    await pg.click('#customBtn'); await sleep(400);
    const cyc = async (k, n) => { for (let i = 0; i < n; i++) await pg.click(`.cyc[data-k="${k}"] button[data-d="1"]`); };
    const setName = async n => { await pg.click('#nameIn', { clickCount: 3 }); await pg.keyboard.press('Backspace'); await pg.type('#nameIn', n); };
    await setName('Robin <b>Hood</b> of Locksley'); await pg.click('#swColor button[data-v="green"]'); await cyc('helmet', 3); await cyc('emblem', 2); await cyc('bow', 2);
    await pg.click('#swFletch button[data-v="gold"]'); await cyc('taunt', 3); await sleep(900);
    await pg.screenshot({ path: `${out}/custom-390-p1.png` });
    await pg.click('#custom .tabs button[data-slot="1"]'); await sleep(200);
    await setName('Marian'); await pg.click('#swColor button[data-v="green"]'); await cyc('helmet', 4); await cyc('bow', 1); await cyc('emblem', 3);
    await pg.click('#swFletch button[data-v="pink"]'); await sleep(900);
    await pg.screenshot({ path: `${out}/custom-390-p2.png` });
    const fits = await pg.evaluate(() => { const r = document.querySelector('#custom').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && document.scrollingElement.scrollHeight <= innerHeight; });
    await pg.click('#customDone'); await sleep(300);
    await pg.reload({ waitUntil: 'networkidle0' }); await pg.waitForFunction('window.__ready'); await sleep(300);
    const after = await pg.evaluate(() => ({ looks: __game.looks, cols: __game.cols.map(c => c.toString(16)) }));
    console.log('custom looks after reload', JSON.stringify(after), 'fits one screen', fits);
    assert(fits, 'customise screen fits without scrolling');
    const [p1, p2] = after.looks;
    assert(p1.name === 'Robin Hoo' && p1.color === 'green' && p1.helmet === 'crown' && p1.emblem === 'star' && p1.bow === 'gold' && p1.fletch === 'gold' && p1.taunt === 3, 'P1 look persisted (name sanitised)');
    assert(p2.name === 'Marian' && p2.color === 'green' && p2.helmet === 'feather' && p2.bow === 'recurve' && p2.emblem === 'plain' && p2.fletch === 'pink', 'P2 look persisted');
    assert(after.cols[0] !== after.cols[1], 'same colour auto-tinted');
    await pg.click('#arenas button[data-a="field"]'); await pg.click('#hotBtn'); await sleep(1500);
    await pg.mouse.move(195, 250); await pg.mouse.down(); await pg.mouse.move(235, 220, { steps: 5 }); await sleep(400);
    await pg.screenshot({ path: `${out}/custom-match-390.png` });
    await pg.mouse.move(195, 252); await pg.mouse.up(); await settle(pg); await sleep(1600);
    await pg.screenshot({ path: `${out}/custom-match-390-p2view.png` });
    const hud = await pg.evaluate(() => [document.querySelector('#hp0 .num').textContent, document.querySelector('#hp1 .num').textContent, document.querySelector('#turn').textContent]);
    console.log('hot HUD', hud);
    assert(hud[0] === 'Robin Hoo 100' && hud[1] === 'Marian 100', 'names on HP bars');
    await pg.close();
    const pd = await open(1280, 800, false);
    await pd.click('#customBtn'); await sleep(900);
    await pd.screenshot({ path: `${out}/custom-1280.png` });
    assert(await pd.$eval('#nameIn', e => e.value) === 'Robin Hoo', 'name shown after reload');
    await pd.close();
  }
  for (const [w, h, touch] of [[390, 844, true], [1280, 800, false]]) {
    const pg = await open(w, h, touch);
    await pg.screenshot({ path: `${out}/${w}-menu.png` });
    for (const arena of ['field', 'dusk', 'winter']) {
      await pg.click(`#arenas button[data-a="${arena}"]`);
      await pg.click('#hotBtn'); await sleep(1500);
      const cx = w / 2, cy = h * 0.3;
      await pg.mouse.move(cx, cy); await pg.mouse.down();
      await pg.mouse.move(cx + w * 0.1, cy - h * 0.06, { steps: 8 }); // up-right: a bit higher and stronger
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
  await pg.click('#arenas button[data-a="field"]'); await pg.click('#seriesBtns button[data-s="3"]'); await pg.click('#hotBtn'); await sleep(800);
  { const s0 = await st(pg); assert(s0.best === 3 && s0.score.join() === '0,0', 'hot-seat Best of 3 started'); }
  // drag mapping (screen space), checked from both players' views: up = higher angle only, right = more power only; taps don't fire
  {
    const read = () => pg.evaluate(() => ({ pitch: Math.round(__game.S.aim.pitch * 5729.6) / 100, power: Math.round(__game.S.aim.power * 1000) / 1000, yaw: __game.S.aim.yaw }));
    const near = (x, y) => Math.abs(x - y) < 0.011;
    for (const who of [0, 1]) {
      if ((await st(pg)).turn !== who) { await pg.evaluate(() => __game.shootAim({ pitch: 0.2, power: 0.25 }, 'normal')); await settle(pg); await sleep(1500); }
      const cx = 195, cy = 400;
      await pg.mouse.click(cx, cy); await sleep(300); // tap: no shot
      assert((await st(pg)).turn === who && (await st(pg)).phase === 'aim', 'tap does not fire');
      await pg.mouse.move(cx, cy); await pg.mouse.down();
      const at = async (dx, dy) => { await pg.mouse.move(cx + dx, cy + dy, { steps: 3 }); await sleep(80); return read(); };
      const base = await at(0, 20), up = await at(0, -60), right = await at(60, 20), left = await at(-60, 20), down = await at(0, 80), upRight = await at(60, -60);
      const tipShown = await pg.$eval('#aimTip', e => !e.classList.contains('hidden') && e.textContent);
      console.log('drag mapping', who ? 'Red' : 'Blue', { base, up, down, right, left, upRight, tipShown });
      assert(up.pitch > base.pitch && down.pitch < base.pitch && near(up.power, base.power) && near(down.power, base.power), 'up/down changes angle only');
      assert(right.power > base.power && left.power < base.power && near(right.pitch, base.pitch) && near(left.pitch, base.pitch), 'right/left changes power only');
      assert(near(upRight.pitch, up.pitch) && near(upRight.power, right.power), 'both independent in one gesture');
      assert([base, up, right].every(a => a.yaw === undefined), 'no yaw');
      assert(tipShown && /%/.test(tipShown) && /°/.test(tipShown), 'finger readout');
      if (who === 0) { await pg.mouse.up(); await settle(pg); assert((await st(pg)).turn === 1, 'release fires'); await sleep(1500); }
      else { await at(0, 20); await pg.mouse.up(); await settle(pg); await sleep(300); }
    }
    if ((await st(pg)).turn === 1) { await pg.evaluate(() => __game.shootAim({ pitch: 0.2, power: 0.25 }, 'normal')); await settle(pg); }
    // vertical split: screenshot shortly after the split, arrows must share z and spread in height
    await pg.evaluate(() => { __game.setWind(0, 0); __game.shootAim({ pitch: 40 / 57.3, power: 0.75 }, 'split'); });
    await pg.waitForFunction(() => __game.S.play && __game.S.play.arrows.length === 3 && __game.S.play.ft > __game.S.play.arrows[1].t0 + 0.55, { timeout: 10000, polling: 16 });
    await pg.screenshot({ path: `${out}/split-vertical.png` });
    const sp = await pg.evaluate(() => __game.S.play.arrows.map(a => a.m.position.toArray().map(v => +v.toFixed(2))));
    console.log('split arrows (x,y,z)', sp);
    assert(sp.every(p => p[2] === 0) && new Set(sp.map(p => p[1])).size === 3, 'split is vertical');
    await settle(pg); await sleep(300);
    const lane = await pg.evaluate(() => { __game.setWind(3.5, 0); let worst = 0, sym = 0;
      for (let k = 0; k < 40; k++) { const aim = { pitch: (5 + Math.random() * 60) / 57.3, power: 0.15 + Math.random() * 0.85 };
        for (const t of ['normal', 'heavy', 'split']) for (const a of __game.simulate(aim, t).arrows) for (const p of [...a.pts, a.res.pos]) worst = Math.max(worst, Math.abs(p[2]));
        const sp = __game.simulate(aim, 'split').arrows; if (sp.length === 3) sym = Math.max(sym, Math.abs(sp[1].pts.at(-1)[2] + sp[2].pts.at(-1)[2]) * (sp[1].res.t === sp[2].res.t ? 1 : 0)); }
      return { worst, sym }; });
    console.log('lane check (max |z| of normal/heavy arrows, split asymmetry)', lane);
    assert(lane.worst === 0, 'shots stay on the opponent line');
  }
  if ((await st(pg)).turn === 1) { await pg.evaluate(() => __game.shootAim({ pitch: 0.2, power: 0.25 }, 'normal')); await settle(pg); await sleep(300); }
  // merlons in the line of fire: Blue cracks Red's front merlon (10) with a low normal shot, Red knocks Blue's front merlon (3) off with a heavy one
  for (const [ids, type, want] of [[[10], 'normal', 1], [[3], 'heavy', 0]]) {
    await pg.evaluate(() => __game.setWind(0, 0));
    const hit = await pg.evaluate((i, t) => __game.findMerlonHit(i, t), ids, type);
    assert(hit, 'found merlon aim');
    await pg.evaluate((a, t) => __game.shootAim(a, t), hit.aim, type);
    await settle(pg); await sleep(600);
    const m = await pg.evaluate(() => __game.merlons());
    console.log('hot merlon', hit.merlon, type, '-> hp', m.hp[hit.merlon], m.vis[hit.merlon]);
    assert(m.hp[hit.merlon] === want && m.vis[hit.merlon].hp === want, 'merlon state');
    if (want === 0) { assert(m.vis[hit.merlon].fallen, 'merlon fell'); await pg.screenshot({ path: `${out}/hot-merlon-off.png` }); }
  }
  // play out a hot-seat Best of 3 with typed hit shots
  const types = ['normal', 'heavy', 'split', 'normal', 'heavy'];
  let shotN = 0, rounds = 0;
  while (shotN < 60) {
    const before = await st(pg);
    if (before.phase === 'over') break;
    const type = types[shotN % types.length];
    await pg.evaluate(() => __game.setWind(0, 0));
    const aim = await pg.evaluate(t => __game.findHit(t), type);
    assert(aim, 'found a hitting aim for ' + type);
    await pg.evaluate((a, t) => __game.shootAim(a, t), aim, type);
    if (shotN++ === 0) { await pg.waitForFunction(() => __game.S.play && __game.S.play.arrows.every(a => a.landed), { timeout: 10000 }); await sleep(150); await pg.screenshot({ path: `${out}/hot-hit.png` }); }
    await done(pg);
    const after = await st(pg);
    console.log('hot', type, before.hp, '->', after.hp, 'turn', before.turn, '->', after.turn, after.phase, 'score', after.score.join('-'));
    assert(after.hp[1 - before.turn] < before.hp[1 - before.turn], 'HP dropped');
    if (after.phase === 'round') {
      rounds++;
      assert(after.score[0] + after.score[1] === rounds, 'round scored');
      const card = await pg.$eval('#roundCard', e => (e.classList.contains('hidden') ? '' : e.textContent));
      assert(/Round to/.test(card), 'round card shown');
      if (rounds === 1) await pg.screenshot({ path: `${out}/hot-round-card.png` });
      await settle(pg);
      const nx = await st(pg);
      console.log('hot next round', nx.score.join('-'), 'hp', nx.hp, 'turn', nx.turn, 'arena', nx.arena);
      assert(nx.phase === 'aim' && nx.hp.join() === '100,100' && nx.turn === 1 - before.turn && nx.arena === 'field' && !nx.merl.includes('0') && !nx.merl.includes('1'), 'next round reset, loser first, same arena');
      if (rounds === 1) await pg.screenshot({ path: `${out}/hot-score-pill.png` });
    } else assert(after.phase === 'over' || after.turn !== before.turn, 'turn switched');
  }
  const fin = await st(pg);
  assert(fin.phase === 'over' && Math.max(...fin.score) === 2, 'hot-seat series over at 2 wins'); await sleep(400);
  console.log('hot series end:', await pg.$eval('#winner', e => e.textContent), '|', await pg.$eval('#overScore', e => e.textContent), '|', await pg.$eval('#rematch', e => e.textContent));
  await pg.screenshot({ path: `${out}/hot-win.png` });
  await pg.click('#rematch'); await sleep(400);
  const re = await st(pg); assert(re.phase === 'aim' && re.hp[0] === 100 && re.hp[1] === 100 && re.score.join() === '0,0' && re.turn === 1 - fin.winner, 'rematch series reset');
  console.log('hot-seat Bo3 OK, final score', fin.score, 'winner', fin.winner);
  await pg.close();
}

if (which !== 'hot') {
  // two clients in separate browser contexts
  const A = await open(390, 844, true, await b.createBrowserContext());
  const B = await open(1280, 800, false, await b.createBrowserContext());
  for (const [P, l] of [[A, { name: 'Archie', color: 'orange', helmet: 'kettle', emblem: 'cross', bow: 'recurve', fletch: 'blue', taunt: 4 }],
    [B, { name: 'Bella<i>!', color: 'teal', helmet: 'hood', emblem: 'star', bow: 'gold', fletch: 'pink', taunt: 5 }]]) {
    await P.evaluate(l => localStorage.setItem('ad3t-look-0', JSON.stringify(l)), l); await P.reload({ waitUntil: 'networkidle0' }); await P.waitForFunction('window.__ready'); await sleep(300);
  }
  await A.click('#arenas button[data-a="dusk"]'); await A.click('#seriesBtns button[data-s="3"]');
  await A.click('#createBtn');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#code').textContent), { timeout: 15000 });
  const code = await A.$eval('#code', e => e.textContent);
  console.log('room code', code, '|', await A.$eval('#lobbyBest', e => e.textContent));
  { // share link: navigator.share if present, else the link goes to the clipboard
    await A.browserContext().overridePermissions(base, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']).catch(() => {});
    const hasShare = await A.evaluate(() => !!navigator.share);
    await A.click('#shareBtn'); await sleep(300);
    const btn = await A.$eval('#shareBtn', e => e.textContent), msg = await A.$eval('#lobbyMsg', e => e.textContent);
    const clip = await A.evaluate(() => navigator.clipboard.readText().catch(e => 'ERR ' + e.message));
    console.log('share: navigator.share', hasShare, '| button', btn, '| clipboard', clip, '| msg', msg);
    assert(hasShare || clip === `${base}/?room=${code}` || msg.includes(`/?room=${code}`), 'share link is the room URL');
    await A.screenshot({ path: `${out}/online-room-share.png` });
  }
  // B opens the share link: auto-joins with its saved look, no code entry
  await B.goto(`${base}/?room=${code}`, { waitUntil: 'networkidle0' });
  await A.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'aim', { timeout: 15000 });
  await B.waitForFunction(() => __game.S.mode === 'online' && __game.S.phase === 'aim', { timeout: 15000 });
  console.log('B joined via link; B url now', B.url());
  assert(!B.url().includes('room='), 'link param cleared');
  const [sa, sb] = [await st(A), await st(B)];
  console.log('started', sa, sb);
  assert(sa.best === 3 && sb.best === 3 && sa.score.join() === '0,0', 'Best of 3 on both');
  assert(sa.arena === 'dusk' && sb.arena === 'dusk', 'arena synced');
  assert(await A.evaluate(() => __game.S.me) === 0 && await B.evaluate(() => __game.S.me) === 1, 'seats');
  { // each player sees the other's look and name
    const la = await A.evaluate(() => __game.looks), lb = await B.evaluate(() => __game.looks);
    const ha = await A.evaluate(() => document.querySelector('#hp1 .num').textContent), hb = await B.evaluate(() => document.querySelector('#hp0 .num').textContent);
    console.log('online looks A sees', JSON.stringify(la), '| B sees', JSON.stringify(lb), '| A HUD', ha, '| B HUD', hb);
    assert(JSON.stringify(la) === JSON.stringify(lb), 'both clients have the same looks');
    assert(la[0].name === 'Archie' && la[0].helmet === 'kettle' && la[1].name === 'Bella' && la[1].helmet === 'hood' && la[1].color === 'teal', 'looks exchanged (and sanitised)');
    assert(ha.startsWith('Bella') && hb.startsWith('Archie'), 'opponent names on HP bars');
  }
  await sleep(800);
  await A.screenshot({ path: `${out}/online-A-aim.png` });
  await B.screenshot({ path: `${out}/online-B-wait.png` });
  // non-active player cannot shoot
  assert(await B.evaluate(() => __game.shootAim({ pitch: 0.5, power: 0.8 })) === false, 'B blocked on A turn');
  // merlon destruction sync: A cracks Red's front merlon with a low normal shot, B knocks Blue's front merlon off with a heavy one
  for (const [P, ids, type, want] of [[A, [10], 'normal', 1], [B, [3], 'heavy', 0]]) {
    const hit = await P.evaluate((i, t) => __game.findMerlonHit(i, t), ids, type);
    assert(hit, 'found merlon aim online');
    const ok = await P.evaluate((a, t) => __game.shootAim(a, t), hit.aim, type);
    if (!ok) console.log('not accepted', await st(A), await st(B), await P.evaluate(() => __game.S.me));
    assert(ok, 'merlon shot accepted');
    await sleep(500); await settle(A); await settle(B); await sleep(700);
    const [ma, mb] = [await A.evaluate(() => __game.merlons()), await B.evaluate(() => __game.merlons())];
    console.log('online merlon', hit.merlon, type, 'A', ma.hp.join(''), 'B', mb.hp.join(''), 'fallen A/B', ma.vis[hit.merlon].fallen, mb.vis[hit.merlon].fallen);
    assert(JSON.stringify(ma.hp) === JSON.stringify(mb.hp) && ma.hp[hit.merlon] === want, 'merlons in sync');
    assert(ma.vis.every((v, k) => v.hp === ma.hp[k]) && mb.vis.every((v, k) => v.hp === mb.hp[k]), 'merlon visuals in sync');
    if (want === 0) { assert(ma.vis[hit.merlon].fallen && mb.vis[hit.merlon].fallen, 'fell on both'); await A.screenshot({ path: `${out}/online-A-merlon-off.png` }); }
  }
  let n = 0, rounds = 0;
  while (n < 80) {
    const s = await st(A);
    if (s.phase === 'over') break;
    const P = s.turn === 0 ? A : B, O = s.turn === 0 ? B : A;
    const aim = await P.evaluate(() => __game.findHit('normal'));
    assert(aim, 'found hit online');
    assert(await P.evaluate(a => __game.shootAim(a, 'normal'), aim), 'active player can shoot');
    await O.waitForFunction(() => __game.S.phase === 'fly', { timeout: 10000 });
    if (n === 0) { await sleep(700); await B.screenshot({ path: `${out}/online-B-fly.png` }); }
    await done(A); await done(B);
    const [a2, b2] = [await st(A), await st(B)];
    console.log('online shot', n, 'by', s.turn, 'hp A', a2.hp, 'hp B', b2.hp, 'turn', a2.turn, b2.turn, a2.phase, b2.phase, 'score A', a2.score.join('-'), 'B', b2.score.join('-'));
    assert(JSON.stringify(a2.hp) === JSON.stringify(b2.hp), 'HP in sync');
    assert(a2.score.join() === b2.score.join(), 'score in sync');
    assert(a2.phase === b2.phase, 'phase in sync');
    assert(a2.hp[1 - s.turn] < s.hp[1 - s.turn], 'hit registered');
    if (a2.phase === 'round') {
      rounds++;
      assert(a2.score[0] + a2.score[1] === rounds, 'round scored');
      if (rounds === 1) await A.screenshot({ path: `${out}/online-A-round-card.png` });
      await settle(A); await settle(B);
      const [a3, b3] = [await st(A), await st(B)];
      console.log('online round', rounds, 'next: score', a3.score.join('-'), b3.score.join('-'), 'turn', a3.turn, b3.turn, 'hp', a3.hp, b3.hp, 'merlons', a3.merl, b3.merl, 'arena', a3.arena);
      assert(a3.phase === 'aim' && b3.phase === 'aim' && a3.turn === 1 - s.turn && b3.turn === a3.turn, 'next round, loser first');
      assert(a3.hp.join() === '100,100' && b3.hp.join() === '100,100' && a3.merl === '2'.repeat(14) && b3.merl === a3.merl && a3.arena === 'dusk', 'round reset, same arena');
      assert(a3.score.join() === b3.score.join() && a3.score.join() === a2.score.join(), 'score kept');
      if (rounds === 1) {
        await sleep(600); await A.screenshot({ path: `${out}/online-A-score-pill.png` });
        console.log('pill A', await A.$eval('#score', e => e.textContent), '| pill B', await B.$eval('#score', e => e.textContent));
      }
    } else assert(a2.phase === 'over' || (a2.turn !== s.turn && a2.turn === b2.turn), 'turn passed');
    n++;
  }
  const [fa, fb] = [await st(A), await st(B)];
  assert(fa.phase === 'over' && fb.phase === 'over' && fa.winner === fb.winner, 'both see same winner');
  assert(fa.score.join() === fb.score.join() && Math.max(...fa.score) === 2, 'series over at 2 wins, same score');
  const [wa, wb] = [await A.$eval('#winner', e => e.textContent), await B.$eval('#winner', e => e.textContent)];
  console.log('series end screens:', wa, '|', wb, '|', await A.$eval('#overScore', e => e.textContent), '|', await A.$eval('#taunt', e => e.textContent), '| button', await A.$eval('#rematch', e => e.textContent));
  await sleep(500); await A.screenshot({ path: `${out}/online-A-over.png` }); await B.screenshot({ path: `${out}/online-B-over.png` });
  { // invalid and full room links
    const C = await open(390, 844, true, await b.createBrowserContext(), `${base}/?room=ZZZZ`);
    await C.waitForFunction(() => /Couldn't join/.test(document.querySelector('#homeMsg').textContent), { timeout: 10000 });
    const m1 = await C.$eval('#homeMsg', e => e.textContent), home = await C.$eval('#home', e => !e.classList.contains('hidden'));
    await C.screenshot({ path: `${out}/invalid-link.png` });
    await C.goto(`${base}/?room=${code}`, { waitUntil: 'load' }); await C.waitForFunction('window.__ready', { timeout: 20000 });
    await C.waitForFunction(() => /Couldn't join/.test(document.querySelector('#homeMsg').textContent), { timeout: 10000 });
    const m2 = await C.$eval('#homeMsg', e => e.textContent);
    await C.goto(`${base}/?room=bad!`, { waitUntil: 'load' }); await C.waitForFunction('window.__ready', { timeout: 20000 }); await sleep(300);
    const m3 = await C.$eval('#homeMsg', e => e.textContent);
    console.log('invalid link:', m1, '| home shown', home, '| full room:', m2, '| malformed:', m3);
    assert(home && /not found/i.test(m1) && /full/i.test(m2) && /valid/.test(m3) && (await st(C)).mode === 'menu', 'bad links handled');
    await C.close();
  }
  await A.click('#rematch'); await sleep(500);
  await B.waitForFunction(() => /rematch/i.test(document.querySelector('#overMsg').textContent), { timeout: 5000 });
  await B.click('#rematch');
  await A.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp[0] === 100, { timeout: 10000 });
  await B.waitForFunction(() => __game.S.phase === 'aim' && __game.S.hp[1] === 100, { timeout: 10000 });
  { const [ra, rb] = [await st(A), await st(B)]; assert(ra.score.join() === '0,0' && rb.score.join() === '0,0' && ra.best === 3 && ra.turn === 1 - fa.winner && rb.turn === ra.turn, 'rematch series reset, series loser first'); }
  console.log('rematch series started, turn', (await st(A)).turn, (await st(B)).turn);
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
