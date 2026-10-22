// Archery Duel 3D server: static files, /health, and socket.io online rooms (server-authoritative shots).
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const BUILD = 'ad3t-v2';
const app = express();
app.get('/health', (req, res) => res.json({ ok: true, build: BUILD, rooms: rooms.size }));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules/three/build')));
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 }); // notice dropped players quickly
const rooms = new Map();
const CH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const clamp = (v, a, b) => Math.min(b, Math.max(a, Number(v) || 0));

import('./public/sim.js').then(sim => {
  const start = r => {
    Object.assign(r, { hp: [sim.HP, sim.HP], winner: -1, wind: sim.randomWind(), votes: new Set() });
    r.socks.forEach((s, i) => s.emit('start', { arena: r.arena, you: i, hp: r.hp, turn: r.turn, wind: r.wind }));
  };
  const leave = sock => {
    const r = sock.data.room;
    if (!r) return;
    rooms.delete(r.code);
    for (const s of r.socks) if (s) { s.data.room = null; s.leave(r.code); if (s !== sock) s.emit('opponentLeft'); }
  };
  io.on('connection', sock => {
    sock.on('create', ({ arena } = {}) => {
      leave(sock);
      let code;
      do code = Array.from({ length: 4 }, () => CH[Math.floor(Math.random() * CH.length)]).join(''); while (rooms.has(code));
      const id = sim.ARENA_IDS.includes(arena) ? arena : sim.ARENA_IDS[Math.floor(Math.random() * sim.ARENA_IDS.length)];
      const r = { code, arena: id, world: sim.makeWorld(id), socks: [sock, null], turn: 0, created: Date.now() };
      rooms.set(code, r); sock.data.room = r; sock.data.idx = 0; sock.join(code);
      sock.emit('created', { code, arena: id });
    });
    sock.on('join', ({ code } = {}) => {
      const r = rooms.get(String(code || '').toUpperCase().trim());
      if (!r) return sock.emit('joinError', 'Room not found');
      if (r.socks[1] || r.socks[0] === sock) return sock.emit('joinError', 'Room is full');
      leave(sock);
      r.socks[1] = sock; sock.data.room = r; sock.data.idx = 1; sock.join(r.code);
      start(r);
    });
    sock.on('aim', a => {
      const r = sock.data.room, o = r && r.socks[1 - sock.data.idx];
      if (o && r.turn === sock.data.idx && a) o.emit('aim', { pitch: clamp(a.pitch, -1, 2), yaw: clamp(a.yaw, -1, 1), draw: clamp(a.draw, 0, 1) });
    });
    sock.on('shoot', ({ aim = {}, type } = {}) => {
      const r = sock.data.room, i = sock.data.idx;
      if (!r || !r.socks[1] || r.winner >= 0 || r.turn !== i) return; // only the active player may shoot
      const a = { pitch: clamp(aim.pitch, -0.3, 1.45), yaw: clamp(aim.yaw, -0.25, 0.25), power: clamp(aim.power, 0.1, 1) };
      const shot = sim.simulateShot(r.world, i, a, r.wind, type);
      r.hp = sim.applyDamage(r.hp, shot);
      r.winner = sim.winnerOf(r.hp);
      r.turn = 1 - i; r.wind = sim.randomWind();
      io.to(r.code).emit('shot', { shooter: i, aim: a, sim: shot, hp: r.hp, turn: r.turn, wind: r.wind, winner: r.winner });
    });
    sock.on('rematch', () => {
      const r = sock.data.room;
      if (!r || r.winner < 0) return;
      r.votes.add(sock.data.idx);
      if (r.votes.size === 2) { r.turn = 1 - r.winner; start(r); } // loser starts
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
