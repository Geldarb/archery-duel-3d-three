// Archery Duel 3D server: static files, /health, and socket.io online rooms (server-authoritative shots).
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const BUILD = 'ad3t-v4.4';
const app = express();
app.get('/health', (req, res) => res.json({ ok: true, build: BUILD, rooms: rooms.size }));
app.use('/vendor/jsm', express.static(path.join(__dirname, 'node_modules/three/examples/jsm')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 }); // notice dropped players quickly
const rooms = new Map();
const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));

Promise.all([import('./public/sim.js'), import('./public/looks.js')]).then(([sim, looks]) => {
  const start = r => { // one round; HP and merlons reset, arena and score kept
    clearTimeout(r.timer);
    Object.assign(r, { hp: [sim.HP, sim.HP], merlons: sim.fullMerlons(), winner: -1, wind: sim.randomWind(), votes: new Set() });
    r.socks.forEach((s, i) => s.emit('start', { arena: r.arena, you: i, hp: r.hp, merlons: r.merlons, turn: r.turn, wind: r.wind, looks: r.looks, best: r.best, score: r.score }));
  };
  const newSeries = r => { r.score = [0, 0]; r.seriesWinner = -1; start(r); };
  const leave = sock => {
    const r = sock.data.room;
    if (!r) return;
    rooms.delete(r.code); clearTimeout(r.timer);
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
    sock.on('shoot', ({ aim = {}, type } = {}) => {
      const r = sock.data.room, i = sock.data.idx;
      if (!r || !r.socks[1] || r.winner >= 0 || r.turn !== i) return; // only the active player may shoot
      const a = { pitch: clamp(aim.pitch, 0, 1.3), power: clamp(aim.power, 0.1, 1) }; // any client yaw is dropped
      const shot = sim.simulateShot(r.world, i, a, r.wind, type, r.merlons);
      ({ hp: r.hp, merlons: r.merlons } = sim.applyShot(r.hp, r.merlons, shot)); // server tracks HP and destroyed merlons
      r.winner = sim.winnerOf(r.hp);
      r.turn = 1 - i; r.wind = sim.randomWind();
      if (r.winner >= 0) { // round over: score it; next round after the clients have played the shot back (loser shoots first)
        r.score[r.winner]++; r.seriesWinner = sim.seriesWinnerOf(r.score, r.best); r.turn = 1 - r.winner;
        if (r.seriesWinner < 0) r.timer = setTimeout(() => { if (rooms.get(r.code) === r) start(r); }, (Math.max(...shot.arrows.map(x => x.res.t)) + 4) * 1000);
      }
      io.to(r.code).emit('shot', { shooter: i, aim: a, sim: shot, hp: r.hp, merlons: r.merlons, turn: r.turn, wind: r.wind, winner: r.winner, score: r.score, seriesWinner: r.seriesWinner });
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
