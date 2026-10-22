// Archery Duel 3D v4 — cartoon Castle Siege. Hot-seat + online rooms. Plain Three.js.
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIST, HP, ARROWS, ARENA_IDS, WALL_H, SHOULDER, makeWorld, simulateShot, applyShot, applyResult, fullMerlons, winnerOf, randomWind, launch, G } from './sim.js';
import { buildArena, heraldry, toon, noOutline } from './world.js';
import * as sfx from './audio.js';

const V = THREE.Vector3, X = new V(1, 0, 0), $ = s => document.querySelector(s), DEG = Math.PI / 180;
const NAMES = ['Blue', 'Red'], COLORS = [0x2f6fd6, 0xd63a2f];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mat = c => toon(c);
const show = (sel, on) => $(sel).classList.toggle('hidden', !on);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); // keep phones fast
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const effect = new OutlineEffect(renderer, { defaultThickness: 0.0042, defaultColor: [0.09, 0.08, 0.13] }); // cheap inverted-hull outlines
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500), pipCam = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x4f6b35, 1.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(-12, 40, 22); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 22, bottom: -22, far: 110 }); sun.shadow.radius = 4;
scene.add(sun);
let world = null, arena = null;
function setArena(id) { if (arena) arena.dispose(); world = makeWorld(id); arena = buildArena(scene, world, { hemi, sun }); }

// ---------- archers & arrows ----------
function setLimb(mesh, a, b) {
  const d = b.clone().sub(a);
  mesh.position.copy(a).addScaledVector(d, 0.5); mesh.scale.set(1, d.length(), 1);
  mesh.quaternion.setFromUnitVectors(new V(0, 1, 0), d.normalize());
}
function makeArrow(type = 'normal') { // chunky cartoon arrow, tip at origin, points along +x
  const g = new THREE.Group(), heavy = type === 'heavy', r = heavy ? 0.04 : 0.028;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.85, 6), mat(heavy ? 0x6b4423 : 0xc98a4b));
  shaft.rotation.z = Math.PI / 2; shaft.position.x = -0.5;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(heavy ? 0.09 : 0.065, heavy ? 0.22 : 0.17, 4), mat(heavy ? 0x7d8794 : 0xdfe4ea));
  tip.rotation.z = -Math.PI / 2; tip.position.x = -0.08;
  g.add(shaft, tip);
  const fl = mat(type === 'split' ? 0xffc928 : heavy ? 0xe0342c : 0xffffff); fl.side = THREE.DoubleSide;
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.1), fl);
    f.position.set(-0.83, 0.06, 0);
    const h = new THREE.Group(); h.rotation.x = k * Math.PI * 2 / 3; h.add(f); g.add(h);
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}
function makeArcher(i) { // chunky big-headed cartoon archer
  const f = i ? -1 : 1, root = new THREE.Group();
  const skin = mat(0xffc9a0), team = mat(COLORS[i]), dark = mat(i ? 0x6e1a16 : 0x173a7a), boot = mat(0x6b3f1d), leather = mat(0x9a5b2a), gold = mat(0xf4c430);
  const hair = mat(0x5a3418), eye = mat(0x1d1d24), steel = mat(i ? 0xd8312b : 0xc9d0da), wood = mat(0x8f5326);
  const add = (geo, m, x, y, z, parent = root) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  for (const z of [-0.13, 0.13]) { add(new THREE.CylinderGeometry(0.1, 0.1, 0.42, 10), dark, 0, 0.27, z); add(new RoundedBoxGeometry(0.3, 0.14, 0.17, 2, 0.05), boot, 0.04, 0.07, z); }
  const herald = toon(0xffffff, { map: heraldry(i) });
  add(new RoundedBoxGeometry(0.44, 0.62, 0.62, 3, 0.13), [herald, herald, team, team, team, team], 0, 0.8, 0); // tabard, emblem front and back
  add(new THREE.CylinderGeometry(0.3, 0.36, 0.2, 16), team, 0, 0.47, 0);
  add(new THREE.TorusGeometry(0.355, 0.03, 6, 20), gold, 0, 0.38, 0).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.335, 0.335, 0.08, 16), leather, 0, 0.6, 0);
  add(new RoundedBoxGeometry(0.06, 0.09, 0.11, 1, 0.02), gold, 0.33, 0.6, 0);
  add(new THREE.SphereGeometry(0.3, 20, 14), skin, 0, 1.42, 0); // big head
  add(new THREE.SphereGeometry(0.315, 16, 12, Math.PI * 0.6, Math.PI * 0.8, 0.3, Math.PI * 0.5), hair, 0, 1.4, 0).rotation.y = Math.PI; // hair at the back
  for (const z of [-0.29, 0.29]) add(new THREE.SphereGeometry(0.07, 8, 6), skin, 0, 1.4, z);
  for (const z of [-0.1, 0.1]) add(new THREE.SphereGeometry(0.04, 8, 6), eye, 0.27, 1.44, z).scale.set(0.6, 1.3, 1);
  add(new THREE.SphereGeometry(0.05, 8, 6), skin, 0.3, 1.37, 0);
  add(new THREE.SphereGeometry(0.345, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 1.5, 0).scale.y = 0.95; // round helmet
  add(new THREE.TorusGeometry(0.36, 0.055, 8, 28), steel, 0, 1.5, 0).rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(0.04, 8, 6), gold, 0.33, 1.56, 0.13);
  const shine = add(new THREE.SphereGeometry(1, 10, 8), noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })), 0.06, 1.77, -0.13);
  shine.scale.set(0.12, 0.04, 0.07); shine.castShadow = false;
  const quiver = add(new THREE.CylinderGeometry(0.12, 0.1, 0.58, 12), leather, -0.3, 0.92, 0.12); quiver.rotation.set(0.25, 0, -0.35);
  add(new THREE.TorusGeometry(0.12, 0.025, 6, 14), wood, 0, 0.29, 0, quiver).rotation.x = Math.PI / 2;
  const white = mat(0xffffff); white.side = THREE.DoubleSide;
  for (const [dx, dz] of [[0, 0], [0.05, 0.05], [-0.04, 0.05]]) { add(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 5), wood, dx, 0.4, dz, quiver); add(new THREE.PlaneGeometry(0.1, 0.16), white, dx, 0.55, dz, quiver); }
  const aim = new THREE.Group(); aim.position.set(0, SHOULDER, 0); root.add(aim); // shoulder pivot, +x = shot direction
  const sFront = new V(0.02, -0.05, 0.27), hand = new V(0.6, 0, 0.04), sBack = new V(0, -0.05, -0.27);
  for (const z of [-0.29, 0.29]) add(new THREE.SphereGeometry(0.13, 12, 8), team, 0, -0.05, z, aim);
  setLimb(add(new THREE.CylinderGeometry(0.09, 0.08, 1, 10), team, 0, 0, 0, aim), sFront, hand);
  add(new THREE.CylinderGeometry(0.095, 0.095, 0.14, 10), leather, 0.47, 0, 0.06, aim).rotation.z = Math.PI / 2;
  add(new THREE.SphereGeometry(0.09, 10, 8), leather, hand.x, hand.y, hand.z, aim);
  const ARC = Math.PI * 0.62, R = 0.8; // chunky longbow
  const bow = add(new THREE.TorusGeometry(R, 0.045, 8, 28, ARC), wood, hand.x - R, 0, 0, aim); bow.rotation.z = -ARC / 2;
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), gold, hand.x, 0, 0, aim);
  const tipX = hand.x - R + R * Math.cos(ARC / 2), tipY = R * Math.sin(ARC / 2);
  const stringGeo = new THREE.BufferGeometry().setFromPoints([new V(tipX, tipY, 0), new V(tipX, 0, 0), new V(tipX, -tipY, 0)]);
  aim.add(new THREE.Line(stringGeo, noOutline(new THREE.LineBasicMaterial({ color: 0xffffff }))));
  const armB = add(new THREE.CylinderGeometry(0.085, 0.075, 1, 10), team, 0, 0, 0, aim);
  const handB = add(new THREE.SphereGeometry(0.085, 10, 8), leather, 0, 0, 0, aim);
  let nocked = makeArrow(); aim.add(nocked);
  root.rotation.y = i ? Math.PI : 0;
  root.position.set(-f * DIST, WALL_H, 0);
  scene.add(root);
  const a = {
    root, f,
    pose(pitch, yaw, draw, showArrow, type) {
      aim.rotation.set(0, -yaw, pitch);
      if (type && nocked.userData.type !== type) { aim.remove(nocked); nocked = makeArrow(type); nocked.userData.type = type; aim.add(nocked); }
      const nx = tipX - 0.42 * draw, nock = new V(nx, 0, 0);
      stringGeo.attributes.position.setX(1, nx); stringGeo.attributes.position.needsUpdate = true;
      setLimb(armB, sBack, nock); handB.position.copy(nock);
      nocked.visible = showArrow; nocked.position.set(nx + 0.92, 0, 0);
    },
  };
  a.pose(0.5, 0, 0, true);
  return a;
}
const archers = [makeArcher(0), makeArcher(1)];
const stuck = [];

// ---------- state ----------
const S = { mode: 'menu', phase: 'menu', me: 0, turn: 0, hp: [HP, HP], merlons: fullMerlons(), wind: { x: 0, z: 0 }, aim: { pitch: 0.5, yaw: 0, power: 0 }, draw: 0,
  types: ['normal', 'normal'], arenaChoice: 'random', arenaId: 'field', play: null, queue: [], winner: -1, focus: null };
const viewer = () => (S.mode === 'online' ? S.me : S.turn);
const myTurn = () => S.phase === 'aim' && (S.mode === 'hot' || S.turn === S.me);

function startMatch({ arenaId, mode, me = 0, turn = 0, hp = [HP, HP], merlons = fullMerlons(), wind }) {
  if (arenaId !== S.arenaId || !world) setArena(arenaId);
  for (const a of stuck) a.removeFromParent();
  stuck.length = 0;
  arena.resetMerlons(merlons);
  Object.assign(S, { mode, me, turn, hp: [...hp], merlons: [...merlons], wind, arenaId, phase: 'aim', winner: -1, play: null, queue: [], focus: null, draw: 0 });
  archers.forEach((a, i) => a.pose(0.5, 0, 0, true, S.types[i]));
  ['#home', '#lobby', '#over', '#menu', '#notice'].forEach(s => show(s, false));
  ['#hud', '#menuBtn', '#bottom'].forEach(s => show(s, true));
  show('#restart', mode === 'hot');
  $('#homeBtn').textContent = mode === 'online' ? 'Leave room' : 'Main menu';
  camJump = true; updateHud();
}
const pickArena = () => (S.arenaChoice === 'random' ? ARENA_IDS[Math.floor(Math.random() * ARENA_IDS.length)] : S.arenaChoice);
const startHot = (arenaId = pickArena()) => startMatch({ arenaId, mode: 'hot', wind: randomWind() });
function goHome() {
  if (S.mode === 'online' && sock) sock.emit('leave');
  Object.assign(S, { mode: 'menu', phase: 'menu', play: null, queue: [] });
  ['#hud', '#menuBtn', '#bottom', '#pip', '#lobby', '#over', '#menu', '#notice'].forEach(s => show(s, false));
  show('#home', true); $('#homeMsg').textContent = '';
}
function notice(msg) {
  if (S.mode !== 'online') return;
  S.mode = 'menu'; S.phase = 'menu';
  ['#over', '#menu', '#lobby'].forEach(s => show(s, false));
  $('#noticeText').textContent = msg; show('#notice', true);
}

// ---------- shooting & playback ----------
function fire() {
  const aim = { ...S.aim }, type = S.types[S.turn];
  preview.visible = false; $('#readout').textContent = '';
  if (S.mode === 'online') { S.phase = 'wait'; sock.emit('shoot', { aim, type }); updateHud(); return; }
  const sim = simulateShot(world, S.turn, aim, S.wind, type, S.merlons), after = applyShot(S.hp, S.merlons, sim);
  playShot({ shooter: S.turn, aim, sim, hp: after.hp, merlons: after.merlons, turn: 1 - S.turn, wind: randomWind(), winner: winnerOf(after.hp) });
}
function playShot(m) {
  if (S.play) { S.queue.push(m); return; }
  archers[m.shooter].pose(m.aim.pitch, m.aim.yaw, 0, false);
  const arrows = m.sim.arrows.map(x => { const mesh = makeArrow(m.sim.type); mesh.visible = false; scene.add(mesh); stuck.push(mesh); return { ...x, m: mesh, landed: false }; });
  S.play = { arrows, ft: 0, hold: 1.3, m };
  S.phase = 'fly'; S.draw = 0; preview.visible = false;
  sfx.twang(); sfx.whoosh(Math.max(...arrows.map(a => a.res.t)) * 0.8);
  updateHud();
}
function land(a) {
  a.landed = true;
  const r = a.res, d = new V(...r.dir).normalize();
  a.m.position.set(...r.pos).addScaledVector(d, 0.15); a.m.quaternion.setFromUnitVectors(X, d);
  a.m.visible = r.kind !== 'out';
  if (r.merlon !== undefined) { // chip or knock off a merlon; the arrow stays stuck in it
    a.m.updateMatrixWorld(); arena.merlonMesh(r.merlon).attach(a.m);
    applyResult(S, r);
    arena.setMerlon(r.merlon, S.merlons[r.merlon], true);
    if (S.merlons[r.merlon] === 0) { sfx.crumble(); shake = 0.2; } else sfx.crack();
  } else if (r.who !== undefined) {
    a.m.updateMatrixWorld(); archers[r.who].root.attach(a.m);
    applyResult(S, r);
    const head = r.kind === 'head';
    floatText(`−${r.dmg}`, new V(...r.pos).add(new V(0, 0.4, 0)), head ? '#ffd84a' : '#fff');
    if (head) { sfx.ding(); flash('HEADSHOT!'); }
    sfx.grunt(); shake = head ? 0.45 : 0.25;
    updateHud();
  } else if (r.kind === 'stone') sfx.crack();
  else if (r.kind !== 'out') sfx.thunk();
}
function updatePlay(dt) {
  const P = S.play, slow = P.arrows.some(a => a.res.kind === 'head' && P.ft > a.res.t - 0.4 && P.ft < a.res.t + 0.25);
  P.ft += dt * (slow ? 0.25 : 1);
  for (const a of P.arrows) {
    if (a.landed || P.ft < a.t0) continue;
    const u = (P.ft - a.t0) * 60, i = Math.floor(u);
    if (i >= a.pts.length - 1) { land(a); continue; }
    const p0 = new V(...a.pts[i]), p1 = new V(...a.pts[i + 1]);
    a.m.position.lerpVectors(p0, p1, u - i);
    a.m.quaternion.setFromUnitVectors(X, p1.sub(p0).normalize());
    a.m.visible = true;
  }
  if (P.arrows.every(a => a.landed) && (P.hold -= dt) <= 0) endShot();
}
function playLead() {
  const P = S.play;
  return P && (P.arrows.find(a => !a.landed && P.ft >= a.t0) || P.arrows.find(a => a.res.who !== undefined) || P.arrows.find(a => a.m.visible));
}
function endShot() {
  const m = S.play.m, lead = playLead();
  S.focus = lead ? lead.m.getWorldPosition(new V()) : null;
  m.merlons.forEach((h, id) => arena.setMerlon(id, h, true)); // authoritative state
  Object.assign(S, { hp: [...m.hp], merlons: [...m.merlons], turn: m.turn, wind: m.wind, play: null, aim: { pitch: 0.5, yaw: 0, power: 0 } });
  if (m.winner >= 0) {
    S.phase = 'over'; S.winner = m.winner;
    $('#winner').textContent = S.mode === 'online' ? (m.winner === S.me ? 'You win!' : 'You lose') : `${NAMES[m.winner]} wins!`;
    $('#overMsg').textContent = ''; $('#rematch').disabled = false; show('#over', true); sfx.fanfare();
  } else {
    S.phase = 'aim';
    archers[S.turn].pose(0.5, 0, 0, true, S.types[S.turn]);
  }
  updateHud();
  if (S.queue.length) playShot(S.queue.shift());
}

// ---------- trajectory preview: first part of the arc only, no wind ----------
const PREV_N = 16;
function dotTex() { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.strokeStyle = '#e8b830'; g.lineWidth = 3; g.beginPath(); g.arc(16, 16, 12, 0, 7); g.fill(); g.stroke(); return new THREE.CanvasTexture(c); }
const preview = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PREV_N * 3), 3)),
  noOutline(new THREE.PointsMaterial({ color: 0xffffff, size: 11, sizeAttenuation: false, map: dotTex(), alphaTest: 0.4, transparent: true, depthWrite: false })));
preview.visible = false; scene.add(preview);
function updatePreview() {
  const { pos, vel } = launch(S.turn, S.aim), attr = preview.geometry.attributes.position, g = G * ARROWS[S.types[S.turn]].g, dt = 1 / 34;
  for (let k = 0; k < PREV_N; k++) {
    vel.y -= g * dt; pos.x += vel.x * dt; pos.y += vel.y * dt; pos.z += vel.z * dt;
    attr.setXYZ(k, pos.x, pos.y, pos.z);
  }
  attr.needsUpdate = true; preview.geometry.computeBoundingSphere(); preview.visible = true;
}

// ---------- input: drag down to draw (range), left/right to aim ----------
let drag = null, lastCreak = 0, lastAimSend = 0;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', e => {
  sfx.unlock();
  if (!myTurn()) return;
  drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag || !myTurn()) return;
  const px = drag.x - e.clientX, py = e.clientY - drag.y;
  const t = clamp(py / (0.42 * innerHeight), 0, 1); // one pull sets range: steeper and stronger together
  S.draw = t;
  S.aim = { pitch: (8 + 42 * t) * DEG, yaw: clamp(px / (0.35 * innerWidth), -1, 1) * 12 * DEG, power: 0.3 + 0.7 * t };
  archers[S.turn].pose(S.aim.pitch, S.aim.yaw, t, true, S.types[S.turn]);
  if (Math.abs(t - lastCreak) > 0.08) { sfx.creak(t); lastCreak = t; }
  $('#hint').textContent = '';
  const yd = Math.round(S.aim.yaw / DEG);
  $('#readout').textContent = t < 0.04 ? '' : `${Math.round(t * 100)}%${yd ? ` · ${yd > 0 ? '→' : '←'} ${Math.abs(yd)}°` : ''}`;
  if (t >= 0.04) updatePreview(); else preview.visible = false;
  if (S.mode === 'online' && performance.now() - lastAimSend > 100) { lastAimSend = performance.now(); sock.emit('aim', { pitch: S.aim.pitch, yaw: S.aim.yaw, draw: t }); }
});
const endDrag = () => {
  if (!drag) return;
  drag = null; lastCreak = 0;
  if (myTurn() && S.draw >= 0.04) fire();
  else if (myTurn()) { S.draw = 0; preview.visible = false; $('#readout').textContent = ''; archers[S.turn].pose(S.aim.pitch, S.aim.yaw, 0, true); updateHud(); }
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// ---------- UI wiring ----------
document.querySelectorAll('#types button').forEach(b => b.onclick = () => {
  if (!myTurn()) return;
  S.types[S.turn] = b.dataset.t; archers[S.turn].pose(S.aim.pitch, S.aim.yaw, 0, true, b.dataset.t); updateHud();
});
document.querySelectorAll('#arenas button').forEach(b => b.onclick = () => {
  S.arenaChoice = b.dataset.a;
  document.querySelectorAll('#arenas button').forEach(x => x.classList.toggle('on', x === b));
  if (b.dataset.a !== 'random') { setArena(b.dataset.a); S.arenaId = b.dataset.a; }
});
$('#hotBtn').onclick = () => { sfx.unlock(); startHot(); };
$('#createBtn').onclick = () => { sfx.unlock(); net().emit('create', { arena: S.arenaChoice }); $('#homeMsg').textContent = 'Creating room…'; };
$('#joinBtn').onclick = () => {
  sfx.unlock();
  const code = $('#codeIn').value.trim().toUpperCase();
  if (code.length < 4) { $('#homeMsg').textContent = 'Enter the 4-letter code'; return; }
  net().emit('join', { code }); $('#homeMsg').textContent = 'Joining…';
};
$('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });
$('#copyBtn').onclick = () => {
  const code = $('#code').textContent;
  (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => { $('#copyBtn').textContent = 'Copied!'; }, () => { $('#copyBtn').textContent = `Code: ${code}`; });
  setTimeout(() => { $('#copyBtn').textContent = 'Copy code'; }, 1500);
};
$('#cancelBtn').onclick = () => { if (sock) sock.emit('leave'); show('#lobby', false); show('#home', true); $('#homeMsg').textContent = ''; };
$('#menuBtn').onclick = () => show('#menu', $('#menu').classList.contains('hidden'));
$('#close').onclick = () => show('#menu', false);
$('#restart').onclick = () => startHot(S.arenaId);
$('#homeBtn').onclick = goHome;
$('#overHome').onclick = goHome;
$('#noticeBtn').onclick = goHome;
$('#muteBtn').onclick = () => { sfx.setMuted(!sfx.isMuted()); updateHud(); };
$('#rematch').onclick = () => {
  if (S.mode === 'hot') return startHot(S.arenaId);
  sock.emit('rematch'); $('#rematch').disabled = true; $('#overMsg').textContent = 'Waiting for opponent…';
};

// ---------- networking ----------
let sock = null;
function net() {
  if (sock) return sock;
  sock = window.io();
  sock.on('created', ({ code }) => { $('#code').textContent = code; show('#home', false); show('#lobby', true); });
  sock.on('joinError', msg => { $('#homeMsg').textContent = msg; });
  sock.on('start', ({ arena: id, you, hp, merlons, turn, wind }) => startMatch({ arenaId: id, mode: 'online', me: you, hp, merlons, turn, wind }));
  sock.on('aim', a => { if (S.mode === 'online' && S.phase === 'aim' && S.turn !== S.me) archers[S.turn].pose(a.pitch, a.yaw, a.draw, true, S.types[S.turn]); });
  sock.on('shot', m => { if (S.mode === 'online') playShot(m); });
  sock.on('rematchAsk', () => { $('#overMsg').textContent = 'Opponent wants a rematch!'; });
  sock.on('opponentLeft', () => notice('Opponent left'));
  sock.on('disconnect', () => notice('Connection lost'));
  return sock;
}
addEventListener('pagehide', () => { if (sock && S.mode === 'online') sock.emit('leave'); });

// ---------- HUD ----------
let flashT = 0, shake = 0;
const floats = [];
function flash(msg) { $('#readout').textContent = msg; flashT = 1.4; }
function floatText(txt, pos, color) {
  const el = document.createElement('div');
  el.className = 'float'; el.textContent = txt; el.style.color = color; document.body.appendChild(el);
  floats.push({ el, p: pos, t: 0 });
}
function updateHud() {
  const online = S.mode === 'online';
  archers.forEach((a, i) => {
    $(`#hp${i} i`).style.width = `${S.hp[i]}%`;
    $(`#hp${i} .num`).textContent = S.hp[i];
    $(`#hp${i} .you`).classList.toggle('hidden', !(online && i === S.me));
  });
  $('#turn').textContent = online ? (S.turn === S.me ? 'Your turn' : `${NAMES[S.turn]}'s turn`) : `${NAMES[S.turn]}'s turn`;
  $('#turn').className = S.turn ? 'red' : 'blue';
  $('#windNum').textContent = Math.hypot(S.wind.x, S.wind.z).toFixed(1);
  const mine = myTurn();
  show('#types', mine);
  document.querySelectorAll('#types button').forEach(b => b.classList.toggle('on', b.dataset.t === S.types[S.turn]));
  $('#hint').textContent = S.phase === 'aim' && S.draw === 0 ? (mine ? 'Drag down to draw · left/right to aim' : 'Opponent is aiming…') : '';
  $('#muteBtn').textContent = `Sound: ${sfx.isMuted() ? 'off' : 'on'}`;
}
function updateWindArrow() {
  const c = archers[S.turn].root.position.clone().add(new V(0, 2, 0));
  const a = c.clone().project(camera), b = c.clone().add(new V(S.wind.x, 0, S.wind.z).normalize().multiplyScalar(4)).project(camera);
  const ang = Math.atan2(-(b.y - a.y) / camera.aspect, b.x - a.x), left = Math.cos(ang) < 0; // flag flies the way the wind blows on screen
  $('#windFlag').style.transform = `scaleX(${left ? -1 : 1}) rotate(${clamp(Math.atan2(Math.sin(ang), Math.abs(Math.cos(ang))) * -0.5, -0.5, 0.5)}rad)`;
}

// ---------- camera ----------
const camPos = new V(), camLook = new V();
let camJump = true;
function camTarget(t) {
  if (S.phase === 'menu') { const a = t * 0.06 + 1.2; return [new V(Math.cos(a) * 30, 17, Math.sin(a) * 30), new V(0, 4, 0)]; }
  const v = viewer(), fv = archers[v].f;
  const lead = S.play ? playLead() : null, focus = lead ? lead.m.getWorldPosition(new V()) : S.phase === 'over' ? S.focus : null;
  if (focus) {
    const fs = S.play ? archers[S.play.m.shooter].f : fv;
    return [focus.clone().add(new V(-3 * fs, 2.2, 5.5 * fv)), focus.clone().add(new V(1.5 * fs, 0, 0))];
  }
  const a = archers[v].root.position, portrait = camera.aspect < 0.9; // close over-the-shoulder view, archer big in the lower left
  return portrait ? [a.clone().add(new V(-3.45 * fv, 2.95, 1.5 * fv)), a.clone().add(new V(10 * fv, 0.06, -1.85 * fv))]
                  : [a.clone().add(new V(-5.1 * fv, 2.9, 2.3 * fv)), a.clone().add(new V(10 * fv, 0.78, -0.9 * fv))];
}
function pipRect() {
  const portrait = innerWidth < innerHeight, w = Math.round(innerWidth * (portrait ? 0.3 : 0.16)), h = Math.round(w * (portrait ? 1.15 : 0.85));
  return { x: innerWidth - w - 10, y: 74, w, h };
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.9 ? 70 : 50; camera.updateProjectionMatrix();
  const r = pipRect();
  Object.assign($('#pip').style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w - 4}px`, height: `${r.h - 4}px` });
  pipCam.aspect = r.w / r.h; pipCam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- loop ----------
const clock = new THREE.Clock();
let time = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  if (S.play) updatePlay(dt);
  if (flashT > 0 && (flashT -= dt) <= 0 && !drag) $('#readout').textContent = '';
  arena.update(dt, time, S.phase === 'menu' ? { x: 1.5, z: 0.5 } : S.wind, camera.position, sfx);
  const [tp, tl] = camTarget(time), k = camJump ? 1 : 1 - Math.exp(-dt * (S.phase === 'fly' ? 10 : 4.5));
  camPos.lerp(tp, k); camLook.lerp(tl, k); camJump = false;
  camera.position.copy(camPos); camera.lookAt(camLook);
  if (shake > 0.002) { camera.position.add(new V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake)); shake *= Math.exp(-dt * 7); }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; f.p.y += dt * 0.7;
    const s = f.p.clone().project(camera);
    Object.assign(f.el.style, { left: `${(s.x + 1) / 2 * innerWidth}px`, top: `${(1 - s.y) / 2 * innerHeight}px`, opacity: String(Math.max(0, 1 - f.t / 1.4)) });
    if (f.t > 1.4) { f.el.remove(); floats.splice(i, 1); }
  }
  if (S.phase !== 'menu') updateWindArrow();
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  effect.render(scene, camera);
  const pip = S.phase === 'aim' || S.phase === 'wait';
  show('#pip', pip);
  if (pip) { // picture-in-picture of the opponent
    const o = archers[1 - viewer()], r = pipRect(), fv = archers[viewer()].f;
    pipCam.position.copy(o.root.position).add(new V(4.4 * o.f, 2.4, 0.6 * fv));
    pipCam.lookAt(o.root.position.clone().add(new V(0, 1.05, 0)));
    $('#pip span').textContent = NAMES[1 - viewer()]; $('#pip span').style.background = viewer() ? '#2f6fe0' : '#e0342c';
    renderer.setScissorTest(true);
    renderer.setViewport(r.x, innerHeight - r.y - r.h, r.w, r.h); renderer.setScissor(r.x, innerHeight - r.y - r.h, r.w, r.h);
    effect.render(scene, pipCam);
    renderer.setScissorTest(false);
  }
  requestAnimationFrame(frame);
}
setArena('field');
updateHud(); frame();

// test hook (scripted checks)
window.__game = {
  S, archers,
  get world() { return world; },
  startHot,
  simulate: (aim, type = 'normal') => simulateShot(world, S.turn, aim, S.wind, type, S.merlons),
  setWind: (x, z) => { S.wind = { x, z }; updateHud(); },
  merlons: () => ({ hp: [...S.merlons], vis: arena.merlonState() }),
  findMerlonHit(id, type = 'normal') { // aim that hits a given merlon (or any, if id is undefined)
    for (const pd of [25, 35, 15, 45]) for (let yaw = 0; yaw <= 0.25; yaw += 0.005) for (const ys of [1, -1]) for (let pw = 0.4; pw <= 1; pw += 0.004) {
      const aim = { pitch: pd * DEG, yaw: yaw * ys, power: pw }, r = simulateShot(world, S.turn, aim, S.wind, type, S.merlons).arrows[0].res;
      if (r.kind === 'merlon' && (id === undefined || r.merlon === id)) return { aim, merlon: r.merlon };
    }
    return null;
  },
  findHit(type = 'normal') { // search for a body hit with the current wind
    for (const pd of [35, 25, 45]) for (let yaw = 0; yaw <= 0.2; yaw += 0.01) for (const ys of [1, -1]) for (let pw = 0.4; pw <= 1; pw += 0.004) {
      const aim = { pitch: pd * DEG, yaw: yaw * ys, power: pw }, r = simulateShot(world, S.turn, aim, S.wind, type, S.merlons).arrows[0].res;
      if (r.kind === 'body') return aim;
    }
    return null;
  },
  shootAim(aim, type = 'normal') { if (!myTurn()) return false; S.types[S.turn] = type; S.aim = aim; S.draw = 1; fire(); return true; },
};
window.__ready = true;
