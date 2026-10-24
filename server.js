// Archery Duel 3D server: static files, /health, and socket.io online rooms (server-authoritative shots).
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const BUILD = 'ad3t-v5.4';
const app = express();
app.get('/health', (req, res) => res.json({ ok: true, build: BUILD, rooms: rooms.size }));
const fs = require('fs');
const SW = fs.readFileSync(path.join(__dirname, 'public/sw.js'), 'utf8').replace('__BUILD__', BUILD); // cache name = build, so deploys never serve stale files
app.get('/sw.js', (req, res) => res.set({ 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' }).send(SW));
app.get(['/', '/index.html'], (req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); });
app.get('/vendor/cannon-es.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/cannon-es/dist/cannon-es.js')));
app.use('/vendor/jsm', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 }); // notice dropped players quickly
const rooms = new Map();
const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));

Promise.all([import('./public/sim.js'), import('./public/looks.js'), import('./public/physics.js')]).then(([sim, looks, phys]) => {
  const start = r => { // one round; HP, towers (every block) and power-ups reset, arena and score kept
    clearTimeout(r.timer);
    r.rand = sim.rng(Math.floor(Math.random() * 2 ** 32)); // seeded per round: power-up timing / position / kind
    Object.assign(r, { phase: 'play', st: sim.newRound(r.rand, r.builds), winner: -1, wind: sim.randomWind(), votes: new Set(), busy: 0 }); // every round resets to the built layout
    r.socks.forEach((s, i) => s.emit('start', { arena: r.arena, you: i, st: r.st, turn: r.turn, wind: r.wind, looks: r.looks, best: r.best, score: r.score, colors: r.builds ? r.builds.map(b => b && b.colors) : null }));
  };
  // build phase (once per series): both players build privately; the server validates + stores each plan, reveals both at the start
  const LEGACY = process.env.LEGACY_TOWERS === '1'; // test-only: lets the regression suites keep the classic towers
  const BUILD_SECS = Math.max(5, Number(process.env.BUILD_SECS) || sim.BUILD_TIME);
  const finishBuild = r => {
    if (r.phase !== 'build' || rooms.get(r.code) !== r) return;
    clearTimeout(r.buildTimer);
    r.builds = [0, 1].map(i => r.res[i]); // last valid plan each (bare ground + archer if nothing was placed)
    start(r);
  };
  const newSeries = r => {
    clearTimeout(r.timer); clearTimeout(r.buildTimer);
    Object.assign(r, { score: [0, 0], seriesWinner: -1, phase: 'build', st: null, winner: -1, votes: new Set(), builds: null, ready: [false, false],
      res: [0, 1].map(i => sim.validateBuild(i, sim.defaultPlan())), buildEnds: Date.now() + BUILD_SECS * 1000 });
    r.buildTimer = setTimeout(() => finishBuild(r), BUILD_SECS * 1000 + 800); // small grace for a last-second Ready
    r.socks.forEach((s, i) => s.emit('build', { arena: r.arena, you: i, turn: r.turn, looks: r.looks, best: r.best, score: r.score, time: BUILD_SECS }));
  };
  const leave = sock => {
    const r = sock.data.room;
    if (!r) return;
    rooms.delete(r.code); clearTimeout(r.timer); clearTimeout(r.buildTimer);
    for (const s of r.socks) if (s) { s.data.room = null; s.leave(r.code); if (s !== sock) s.emit('opponentLeft'); }
  };
  io.on('connection', sock => {
    sock.on('create', ({ arena, look, best } = {}) => {
      leave(sock);
      let code;
      do code = Array.from({ length: 4 }, () => CH[Math.floor(Math.random() * CH.length)]).join(''); while (rooms.has(code));
      const id = sim.ARENA_IDS.includes(arena) ? arena : sim.ARENA_IDS[Math.floor(Math.random() * sim.ARENA_IDS.length)];
      const r = { code, arena: id, world: sim.makeWorld(id), socks: [sock, null], looks: [looks.sanitizeLook(look, 0), null], best: sim.SERIES.includes(+best) ? +best : 1, turn: 0, created: Date.now() }; // looks are cosmetic, sanitised
      rooms.set(code, r); sock.data.room = r; sock.data.idx = 0; sock.join(code);
      sock.emit('created', { code, arena: id, best: r.best });
    });
    sock.on('join', ({ code, look } = {}) => {
      const r = rooms.get(String(code || '').toUpperCase().trim());
      if (!r) return sock.emit('joinError', 'Room not found (it may have expired)');
      if (r.socks[1] || r.socks[0] === sock) return sock.emit('joinError', r.socks[0] === sock ? 'That is your own room' : 'Room is full');
      leave(sock);
      r.socks[1] = sock; r.looks[1] = looks.sanitizeLook(look, 1); sock.data.room = r; sock.data.idx = 1; sock.join(r.code);
      newSeries(r);
    });
    sock.on('aim', a => {
      const r = sock.data.room, o = r && r.socks[1 - sock.data.idx];
      if (o && r.turn === sock.data.idx && a) o.emit('aim', { pitch: clamp(a.pitch, -1, 2), draw: clamp(a.draw, 0, 1) });
    });
    sock.on('plan', ({ plan, ready } = {}) => {
      const r = sock.data.room, i = sock.data.idx;
      if (!r || !r.socks[1]) return;
      if (r.phase !== 'build') return sock.emit('buildError', { err: 'Building is over', late: true });
      if (r.ready[i]) return sock.emit('buildError', { err: 'Already ready' });
      if (plan && plan.classic && LEGACY) { r.res[i] = null; r.ready[i] = !!ready; const o = r.socks[1 - i]; if (ready && o) o.emit('oppReady'); sock.emit('planOk', { ready: !!ready, n: 0 }); if (r.ready[0] && r.ready[1]) finishBuild(r); return; } // regression suites only
      const v = sim.validateBuild(i, plan);
      if (!v.ok) return sock.emit('buildError', { err: v.err, at: v.at });
      r.res[i] = v;
      if (ready) { r.ready[i] = true; const o = r.socks[1 - i]; if (o) o.emit('oppReady'); }
      sock.emit('planOk', { ready: !!ready, n: v.blocks.length });
      if (r.ready[0] && r.ready[1]) finishBuild(r);
    });
    sock.on('shoot', ({ aim = {}, type } = {}) => {
      const r = sock.data.room, i = sock.data.idx;
      if (!r || !r.socks[1] || r.phase !== 'play' || r.winner >= 0 || r.turn !== i || Date.now() < r.busy) return; // only the active player, once the last shot has settled
      const a = { pitch: clamp(aim.pitch, 0, 1.3), power: clamp(aim.power, 0.1, 1) }; // any client yaw is dropped
      if (!sim.ARROWS[type] || (sim.ARROWS[type].special && !(r.st.ammo[i][type] > 0))) type = 'normal'; // specials only if earned
      const shot = sim.simulateShot(r.world, i, a, r.wind, type, r.st);
      const res = phys.resolvePhysics(r.st.phys, shot); // authoritative: blocks, falls, debris, blasts, wheelchair spin
      const next = sim.finishShot(r.st, i, shot.type, shot, res, r.rand);
      r.st = { hp: next.hp, phys: next.phys, ammo: next.ammo, pickup: next.pickup, spawnIn: next.spawnIn };
      const dur = Math.max(...shot.arrows.map(x => x.res.t), res.steps * phys.STEP);
      r.busy = Date.now() + dur * 1000 * 0.6;
      r.winner = sim.winnerOf(r.st.hp);
      r.turn = 1 - i; r.wind = sim.randomWind();
      if (r.winner >= 0) { // round over: score it; next round after the clients have played the shot back (loser shoots first)
        r.score[r.winner]++; r.seriesWinner = sim.seriesWinnerOf(r.score, r.best); r.turn = 1 - r.winner;
        if (r.seriesWinner < 0) r.timer = setTimeout(() => { if (rooms.get(r.code) === r) start(r); }, (dur + 4) * 1000);
      }
      io.to(r.code).emit('shot', { shooter: i, aim: a, sim: shot, st: r.st, dmg: res.dmg, log: res.log, steps: res.steps, got: next.got, turn: r.turn, wind: r.wind, winner: r.winner, score: r.score, seriesWinner: r.seriesWinner });
    });
    sock.on('rematch', () => {
      const r = sock.data.room;
      if (!r || r.seriesWinner < 0) return; // rematch = a whole new series, both must agree
      r.votes.add(sock.data.idx);
      if (r.votes.size === 2) { r.turn = 1 - r.seriesWinner; newSeries(r); } // series loser starts
      else { const o = r.socks[1 - sock.data.idx]; if (o) o.emit('rematchAsk'); }
    });
    sock.on('leave', () => leave(sock));
    sock.on('disconnect', () => leave(sock));
  });
  setInterval(() => { // drop stale rooms (e.g. abandoned lobbies)
    for (const [code, r] of rooms) if (Date.now() - r.created > 6 * 3600e3 || r.socks.every(s => !s || !s.connected)) rooms.delete(code);
  }, 600e3).unref();
  server.listen(process.env.PORT || 3000, () => console.log('listening', server.address().port, BUILD));
});
