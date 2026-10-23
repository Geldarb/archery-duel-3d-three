// Usage: node test/ui.mjs <baseUrl> <outDir>
// Mobile UI check at real visible phone viewports: every panel's Back + primary button visible & clickable,
// every swatch reachable, no sideways overflow; browser back closes panels; full screen; PWA manifest/SW/installability.
import { createRequire } from 'module';
import fs from 'fs';
const puppeteer = createRequire('/tmp/ad3t-pw/')('puppeteer-core');
const [,, base = 'http://localhost:3947', out = 'v45-ui'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('FAIL: ' + m); };
const SIZES = [[360, 640], [384, 700], [412, 760], [640, 360], [740, 360], [844, 390]];
const PANELS = {
  home: { back: null, prim: ['#hotBtn', '#createBtn'], extra: ['#fsHome', '#installBtn', '#customBtn', '#helpBtn', '#joinBtn'] },
  help: { back: '#helpBack', prim: ['#helpOk'] },
  custom: { back: '#customBack', prim: ['#customDone'] },
  lobby: { back: '#cancelBtn', prim: ['#copyBtn', '#shareBtn'] },
  menu: { back: '#close', prim: ['#resume'], extra: ['#helpBtn2', '#muteBtn', '#restart', '#homeBtn'] },
  over: { back: '#overBack', prim: ['#rematch', '#overHome'] },
  notice: { back: '#noticeBack', prim: ['#noticeBtn'] },
};
// is the element fully inside the viewport and is it what a finger at its centre would hit?
const hit = (pg, sel, scroll) => pg.evaluate((sel, scroll) => {
  const e = document.querySelector(sel); if (!e) return 'missing';
  if (scroll) e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = e.getBoundingClientRect();
  if (r.width < 1) return 'not shown';
  if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) return `outside viewport ${JSON.stringify([r.left, r.top, r.right, r.bottom].map(Math.round))}`;
  const pb = e.closest('.pb, .cside');
  if (pb) { const q = pb.getBoundingClientRect(); if (r.top < q.top - 1 || r.bottom > q.bottom + 1) return 'clipped by scroll box'; }
  const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!t || !(t === e || e.contains(t))) return 'covered by ' + (t && (t.id || t.className || t.tagName));
  return Math.min(r.width, r.height) >= 40 ? 'ok' : `small ${Math.round(r.width)}x${Math.round(r.height)}`;
}, sel, scroll);
async function checkPanel(pg, name, tag) {
  const P = PANELS[name], id = '#' + name;
  assert(await pg.$eval(id, e => !e.classList.contains('hidden')), `${tag} ${name} not open`);
  await pg.$eval(id + ' .pb', e => { e.scrollTop = 0; });
  await sleep(150);
  await pg.screenshot({ path: `${out}/${tag}-${name}.png` });
  for (const s of [P.back, ...P.prim].filter(Boolean)) { const r = await hit(pg, s, false); assert(r === 'ok', `${tag} ${name} ${s}: ${r}`); }
  for (const s of P.extra || []) { const r = await hit(pg, s, true); assert(r === 'ok', `${tag} ${name} ${s}: ${r}`); }
  const ov = await pg.evaluate(id => { const p = document.querySelector(id).getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth, ih: innerHeight, sy: scrollY, p: [p.left, p.top, p.right, p.bottom], pbx: [...document.querySelectorAll(id + ' .pb, ' + id + ' .cside')].map(e => e.scrollWidth - e.clientWidth) }; }, id);
  assert(ov.sw <= ov.iw && ov.bw <= ov.iw && ov.sy === 0, `${tag} ${name} page overflow ${JSON.stringify(ov)}`);
  assert(ov.p[0] >= 0 && ov.p[1] >= 0 && ov.p[2] <= ov.iw && ov.p[3] <= ov.ih, `${tag} ${name} panel outside viewport ${JSON.stringify(ov.p)}`);
  assert(ov.pbx.every(x => x <= 1), `${tag} ${name} body scrolls sideways ${ov.pbx}`);
}
const res = [];
for (const [w, h] of SIZES) {
  const tag = `${w}x${h}`;
  const ctx = await b.createBrowserContext();
  const pg = await ctx.newPage(); await pg.evaluateOnNewDocument(() => { window.__autoSkip = true; });
  await pg.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  pg.on('console', m => { if (m.type() === 'error') errors.push(`${tag}: ${m.text()}`); });
  pg.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
  await pg.goto(base, { waitUntil: 'load' }); await pg.waitForFunction('window.__ready', { timeout: 20000 }); await sleep(700);
  await checkPanel(pg, 'home', tag);
  // help from home, closed by browser back
  await pg.click('#helpBtn'); await sleep(250); await checkPanel(pg, 'help', tag);
  await pg.goBack({ waitUntil: 'load' }).catch(() => {}); await sleep(300);
  assert(await pg.$eval('#help', e => e.classList.contains('hidden')) && await pg.$eval('#home', e => !e.classList.contains('hidden')), `${tag} browser back did not close help`);
  // customise: every swatch reachable
  await pg.click('#customBtn'); await sleep(700); await checkPanel(pg, 'custom', tag);
  const sw = await pg.$$eval('#swColor button, #swFletch button', es => es.map((e, i) => (e.closest('.sw').id) + i));
  assert(sw.length === 16, `${tag} swatch count ${sw.length}`);
  for (const grp of ['#swColor', '#swFletch']) for (let i = 1; i <= 8; i++) { const r = await hit(pg, `${grp} button:nth-child(${i})`, true); assert(r === 'ok', `${tag} swatch ${grp} ${i}: ${r}`); }
  for (const s of ['#nameIn', '.cyc[data-k=taunt] button[data-d="1"]', '.cyc[data-k=helmet] button[data-d="-1"]', '.tabs button[data-slot="1"]']) { const r = await hit(pg, s, true); assert(r === 'ok' || r.startsWith('small'), `${tag} custom ${s}: ${r}`); }
  await pg.click('#swFletch button:nth-child(8)'); await sleep(100);
  const pv = await pg.$eval('#preview', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  assert(pv[0] > 100 && pv[1] > 90, `${tag} preview too small ${pv}`);
  await pg.$eval('#custom .pb', e => { e.scrollTop = 0; }); await pg.$eval('#custom .cside', e => { e.scrollTop = 0; });
  await pg.screenshot({ path: `${out}/${tag}-custom.png` });
  await pg.click('#customBack'); await sleep(300);
  assert(await pg.$eval('#custom', e => e.classList.contains('hidden')) && await pg.$eval('#home', e => !e.classList.contains('hidden')), `${tag} custom back`);
  // lobby
  await pg.click('#createBtn'); await pg.waitForFunction(() => !document.querySelector('#lobby').classList.contains('hidden'), { timeout: 10000 }); await sleep(200);
  await checkPanel(pg, 'lobby', tag);
  await pg.goBack({ waitUntil: 'load' }).catch(() => {}); await sleep(300);
  assert(await pg.$eval('#lobby', e => e.classList.contains('hidden')), `${tag} back did not leave lobby`);
  // in-game HUD + menu + help-from-menu
  await pg.click('#hotBtn'); await sleep(3000);
  await pg.screenshot({ path: `${out}/${tag}-hud.png` });
  const hud = await pg.evaluate(() => ['#menuBtn', '#fsGame', '#hp0', '#hp1', '#mid', '#bottom'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [s, r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight]; }));
  assert(hud.every(x => x[1]), `${tag} HUD outside viewport ${JSON.stringify(hud)}`);
  const ovl = await pg.evaluate(() => { const a = document.querySelector('#menuBtn').getBoundingClientRect(), f = document.querySelector('#fsGame').getBoundingClientRect(), hp = document.querySelector('#hp0').getBoundingClientRect(); const o = (p, q) => !(p.right <= q.left || q.right <= p.left || p.bottom <= q.top || q.bottom <= p.top); return o(a, f) || o(f, hp) || o(a, hp); });
  assert(!ovl, `${tag} HUD buttons overlap`);
  // Android back during a match opens the menu
  await pg.goBack({ waitUntil: 'load' }).catch(() => {}); await sleep(300);
  assert(await pg.$eval('#menu', e => !e.classList.contains('hidden')), `${tag} back in match did not open menu`);
  await checkPanel(pg, 'menu', tag);
  await pg.click('#helpBtn2'); await sleep(250); await checkPanel(pg, 'help', tag + '-game');
  await pg.click('#helpOk'); await sleep(250);
  assert(await pg.$eval('#menu', e => !e.classList.contains('hidden')), `${tag} help did not return to menu`);
  await pg.click('#resume'); await sleep(250);
  assert(await pg.$eval('#menu', e => e.classList.contains('hidden')), `${tag} resume`);
  // series-end screen: play it out with the test hook
  let over = false;
  for (let i = 0; i < 4 && !over; i++) {
    await pg.waitForFunction(() => !__game.S.play && __game.S.phase === 'aim', { timeout: 20000 }).catch(() => {});
    await pg.evaluate(() => { __game.setWind(0, 0); __game.S.hp = [1, 1]; __game.shootAim(__game.findHit()); });
    await pg.waitForFunction(() => !document.querySelector('#over').classList.contains('hidden'), { timeout: 20000 }).catch(() => {});
    over = await pg.$eval('#over', e => !e.classList.contains('hidden'));
  }
  if (!over) await pg.evaluate(() => { document.querySelector('#winner').textContent = 'Blue wins!'; document.querySelector('#over').classList.remove('hidden'); });
  await sleep(400); await checkPanel(pg, 'over', tag);
  await pg.click('#overBack'); await sleep(400);
  assert(await pg.$eval('#home', e => !e.classList.contains('hidden')), `${tag} over back -> home`);
  // notice (opponent left)
  await pg.evaluate(() => { document.querySelector('#noticeText').textContent = 'Opponent left the room'; document.querySelector('#home').classList.add('hidden'); document.querySelector('#notice').classList.remove('hidden'); });
  await checkPanel(pg, 'notice', tag);
  await pg.click('#noticeBack'); await sleep(300);
  // full screen toggle (needs a real click = user gesture)
  const fsVisible = await pg.$eval('#fsHome', e => getComputedStyle(e).display !== 'none');
  await pg.click('#fsHome'); await sleep(600);
  const fsIn = await pg.evaluate(() => [!!document.fullscreenElement, document.querySelector('#fsHome').classList.contains('on')]);
  await pg.click('#fsHome'); await sleep(600);
  const fsOut = await pg.evaluate(() => [!!document.fullscreenElement, document.querySelector('#fsHome').classList.contains('on')]);
  assert(fsVisible && fsIn[0] && fsIn[1] && !fsOut[0] && !fsOut[1], `${tag} fullscreen ${fsVisible} ${fsIn} ${fsOut}`);
  res.push(`${tag}: all 7 panels ok, 16 swatches reachable, back nav ok, fullscreen on/off ok, series end reached=${over}`);
  await ctx.close();
}
// PWA: manifest, service worker, installability (desktop Chrome view)
{
  const pg = await b.newPage(); await pg.evaluateOnNewDocument(() => { window.__autoSkip = true; }); await pg.setViewport({ width: 1280, height: 800 });
  pg.on('pageerror', e => errors.push(`pwa: ${e.message}`));
  await pg.goto(base, { waitUntil: 'load' }); await pg.waitForFunction('window.__ready', { timeout: 20000 });
  const swr = await pg.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(r => r.active && r.active.scriptURL), new Promise(r => setTimeout(() => r(null), 15000))]));
  assert(swr && swr.endsWith('/sw.js'), 'SW not active ' + swr);
  const cache = await pg.evaluate(() => caches.keys());
  const health = await pg.evaluate(() => fetch('/health').then(r => r.json()));
  assert(cache.includes('ad3t-cache-' + health.build), 'SW cache not versioned ' + cache);
  const cdp = await pg.createCDPSession();
  const man = await cdp.send('Page.getAppManifest');
  assert(!man.errors.length, 'manifest errors ' + JSON.stringify(man.errors));
  const m = JSON.parse(man.data);
  assert(m.name === 'Archery Duel 3D' && m.short_name && m.display === 'fullscreen' && m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'), 'manifest fields');
  for (const i of m.icons) { const s = await pg.evaluate(u => fetch(u).then(r => r.status + ' ' + r.headers.get('content-type')), i.src); assert(s.startsWith('200 image/png'), i.src + ' ' + s); }
  await pg.reload({ waitUntil: 'load' }); await sleep(1500);
  const inst = await cdp.send('Page.getInstallabilityErrors');
  assert(!inst.installabilityErrors.length, 'installability ' + JSON.stringify(inst.installabilityErrors));
  // socket.io must never be in the cache
  const keys = await pg.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).map(r => new URL(r.url).pathname); });
  assert(!keys.some(k => k.startsWith('/socket.io')), 'socket.io cached');
  const installShown = await pg.$eval('#installBtn', e => !e.classList.contains('hidden'));
  res.push(`PWA: manifest ok (${m.icons.length} icons), SW active, cache ${cache.join(',')}, installable (no errors), ${keys.length} files cached, no socket.io, install button shown=${installShown}`);
  await pg.screenshot({ path: `${out}/desktop-home.png` });
}
await b.close();
console.log(res.join('\n'));
console.log('console errors:', errors.length ? errors : 'none');
process.exit(errors.length ? 1 : 0);
