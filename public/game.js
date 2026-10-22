// Archery Duel 3D v3 — Castle Siege. Hot-seat + online rooms. Plain Three.js.
import * as THREE from 'three';
import { DIST, HP, ARROWS, ARENA_IDS, WALL_H, MERLONS, makeWorld, simulateShot, applyShot, applyResult, fullMerlons, winnerOf, randomWind, launch, G } from './sim.js';
import { buildArena, heraldry } from './world.js';
import * as sfx from './audio.js';

const V = THREE.Vector3, X = new V(1, 0, 0), $ = s => document.querySelector(s), DEG = Math.PI / 180;
const NAMES = ['Blue', 'Red'], COLORS = [0x2f6fd6, 0xd63a2f];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mat = c => new THREE.MeshStandardMaterial({ color: c, flatShading: true });
const show = (sel, on) => $(sel).classList.toggle('hidden', !on);

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500), pipCam = new THREE.PerspectiveCamera(38, 1, 0.1, 300);
const hemi = new THREE.HemisphereLight(0xe8f4ff, 0x4f6b35, 1.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(-15, 40, 25); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 30, bottom: -30, far: 120 });
scene.add(sun);
let world = null, arena = null;
function setArena(id) { if (arena) arena.dispose(); world = makeWorld(id); arena = buildArena(scene, world, { hemi, sun }); }

// ---------- archers & arrows ----------
function setLimb(mesh, a, b) {
  const d = b.clone().sub(a);
  mesh.position.copy(a).addScaledVector(d, 0.5); mesh.scale.set(1, d.length(), 1);
  mesh.quaternion.setFromUnitVectors(new V(0, 1, 0), d.normalize());
}
function makeArrow(type = 'normal') { // tip at origin, points along +x
  const g = new THREE.Group(), heavy = type === 'heavy', r = heavy ? 0.027 : 0.018;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.85, 5), mat(heavy ? 0x5b4632 : 0xc9a36b));
  shaft.rotation.z = Math.PI / 2; shaft.position.x = -0.5;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(heavy ? 0.065 : 0.045, heavy ? 0.18 : 0.14, 6), mat(heavy ? 0x4b5563 : 0x9aa3ad));
  tip.rotation.z = -Math.PI / 2; tip.position.x = -0.07;
  g.add(shaft, tip);
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.006), mat(type === 'split' ? 0xf5c518 : heavy ? 0x222222 : 0xf2f2f2));
    f.position.set(-0.82, 0.045, 0);
    const h = new THREE.Group(); h.rotation.x = k * Math.PI * 2 / 3; h.add(f); g.add(h);
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}
function makeArcher(i) { // medieval longbowman: mail coif, kettle helm, heraldic tabard
  const f = i ? -1 : 1, root = new THREE.Group();
  const skin = mat(0xf0c39a), team = mat(COLORS[i]), hose = mat(0x4a3b2a), boot = mat(0x2b1d12), wood = mat(0x7a4a22), yew = mat(0xa0652f);
  const mail = new THREE.MeshStandardMaterial({ color: 0x8d939b, roughness: 0.55, metalness: 0.35, flatShading: true });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb4bac2, roughness: 0.35, metalness: 0.45, flatShading: true });
  const add = (geo, m, x, y, z, parent = root) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  for (const z of [-0.12, 0.12]) { add(new THREE.CylinderGeometry(0.08, 0.07, 0.86, 6), hose, 0, 0.43, z); add(new THREE.BoxGeometry(0.28, 0.12, 0.14), boot, 0.05, 0.06, z); }
  add(new THREE.CylinderGeometry(0.2, 0.25, 0.74, 8), mail, 0, 1.17, 0); // mail hauberk
  const herald = new THREE.MeshStandardMaterial({ map: heraldry(i) });
  add(new THREE.BoxGeometry(0.05, 0.86, 0.4), [herald, team, team, team, team, team], 0.235, 1.12, 0); // tabard front with arms
  add(new THREE.BoxGeometry(0.05, 0.86, 0.4), team, -0.235, 1.12, 0); // tabard back
  add(new THREE.CylinderGeometry(0.265, 0.265, 0.07, 8), boot, 0, 0.98, 0); // belt
  add(new THREE.CylinderGeometry(0.09, 0.11, 0.14, 7), mail, 0, 1.58, 0); // mail neck
  add(new THREE.SphereGeometry(0.18, 10, 8), skin, 0, 1.76, 0);
  add(new THREE.SphereGeometry(0.205, 10, 8, -Math.PI * 0.65, Math.PI * 1.3, 0, Math.PI * 0.8), mail, 0, 1.76, 0); // coif, face open
  add(new THREE.SphereGeometry(0.215, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 1.82, 0); // kettle helm dome
  add(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 14), steel, 0, 1.83, 0); // helm brim
  for (const z of [-0.07, 0.07]) add(new THREE.BoxGeometry(0.03, 0.035, 0.035), boot, 0.175, 1.77, z);
  const quiver = add(new THREE.CylinderGeometry(0.08, 0.07, 0.55, 6), wood, -0.29, 1.3, 0.05); quiver.rotation.z = -0.35;
  for (const z of [0, 0.05, 0.1]) add(new THREE.ConeGeometry(0.03, 0.12, 4), mat(0xf2f2f2), -0.39 - z * 0.3, 1.6 + z * 0.2, z);
  const aim = new THREE.Group(); aim.position.set(0, 1.44, 0); root.add(aim); // shoulder pivot, +x = shot direction
  const sFront = new V(0.03, 0, 0.2), hand = new V(0.62, 0, 0), sBack = new V(0, 0, -0.2);
  for (const z of [-0.2, 0.2]) add(new THREE.SphereGeometry(0.09, 8, 6), team, 0, 0, z, aim);
  setLimb(add(new THREE.CylinderGeometry(0.055, 0.05, 1, 6), mail, 0, 0, 0, aim), sFront, hand);
  add(new THREE.SphereGeometry(0.06, 8, 6), skin, hand.x, hand.y, hand.z, aim);
  const ARC = Math.PI * 0.62, R = 0.9; // longbow
  const bow = add(new THREE.TorusGeometry(R, 0.022, 5, 24, ARC), yew, hand.x - R, 0, 0, aim); bow.rotation.z = -ARC / 2;
  const tipX = hand.x - R + R * Math.cos(ARC / 2), tipY = R * Math.sin(ARC / 2);
  const stringGeo = new THREE.BufferGeometry().setFromPoints([new V(tipX, tipY, 0), new V(tipX, 0, 0), new V(tipX, -tipY, 0)]);
  aim.add(new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xeeeeee })));
  const armB = add(new THREE.CylinderGeometry(0.05, 0.045, 1, 6), mail, 0, 0, 0, aim);
  const handB = add(new THREE.SphereGeometry(0.055, 8, 6), skin, 0, 0, 0, aim);
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
const PREV_N = 14;
const preview = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PREV_N * 3), 3)),
  new THREE.PointsMaterial({ color: 0xffffff, size: 6, sizeAttenuation: false, transparent: true, opacity: 0.6, depthWrite: false }));
preview.visible = false; scene.add(preview);
function updatePreview() {
  const { pos, vel } = launch(S.turn, S.aim), attr = preview.geometry.attributes.position, g = G * ARROWS[S.types[S.turn]].g, dt = 1 / 30;
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
    $(`#hp${i} span`).textContent = `${NAMES[i]}${online && i === S.me ? ' (you)' : ''} ${S.hp[i]}`;
  });
  $('#turn').textContent = online ? (S.turn === S.me ? 'Your turn' : `${NAMES[S.turn]}'s turn`) : `${NAMES[S.turn]}'s turn`;
  $('#turn').style.color = S.turn ? '#a3221b' : '#1f4fae';
  $('#wind span').textContent = Math.hypot(S.wind.x, S.wind.z).toFixed(1);
  const mine = myTurn();
  show('#types', mine);
  document.querySelectorAll('#types button').forEach(b => b.classList.toggle('on', b.dataset.t === S.types[S.turn]));
  $('#hint').textContent = S.phase === 'aim' && S.draw === 0 ? (mine ? 'Drag down to draw · left/right to aim' : 'Opponent is aiming…') : '';
  $('#muteBtn').textContent = `Sound: ${sfx.isMuted() ? 'off' : 'on'}`;
}
function updateWindArrow() {
  const c = archers[S.turn].root.position.clone().add(new V(0, 2, 0));
  const a = c.clone().project(camera), b = c.clone().add(new V(S.wind.x, 0, S.wind.z).normalize().multiplyScalar(4)).project(camera);
  $('#wind b').style.transform = `rotate(${Math.atan2(-(b.y - a.y) / camera.aspect, b.x - a.x)}rad)`;
}

// ---------- camera ----------
const camPos = new V(), camLook = new V();
let camJump = true;
function camTarget(t) {
  if (S.phase === 'menu') { const a = t * 0.06 + 1.2; return [new V(Math.cos(a) * 34, 13, Math.sin(a) * 34), new V(0, 3, 0)]; }
  const v = viewer(), fv = archers[v].f;
  const lead = S.play ? playLead() : null, focus = lead ? lead.m.getWorldPosition(new V()) : S.phase === 'over' ? S.focus : null;
  if (focus) {
    const fs = S.play ? archers[S.play.m.shooter].f : fv;
    return [focus.clone().add(new V(-3 * fs, 2.2, 5.5 * fv)), focus.clone().add(new V(1.5 * fs, 0, 0))];
  }
  const a = archers[v].root.position, portrait = camera.aspect < 0.9; // over-the-shoulder aim view
  return portrait ? [a.clone().add(new V(-5.6 * fv, 2.8, 2.1 * fv)), a.clone().add(new V(10 * fv, 2.4, -0.4 * fv))]
                  : [a.clone().add(new V(-5 * fv, 2.6, 2.4 * fv)), a.clone().add(new V(14 * fv, 1.8, -0.6 * fv))];
}
function pipRect() {
  const portrait = innerWidth < innerHeight, w = Math.round(innerWidth * (portrait ? 0.34 : 0.18)), h = Math.round(w * (portrait ? 1.2 : 0.85));
  return { x: innerWidth - w - 8, y: 58, w, h };
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
  const [tp, tl] = camTarget(time), k = camJump ? 1 : 1 - Math.exp(-dt * (S.phase === 'fly' ? 10 : 3));
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
  renderer.render(scene, camera);
  const pip = S.phase === 'aim' || S.phase === 'wait';
  show('#pip', pip);
  if (pip) { // picture-in-picture of the opponent
    const o = archers[1 - viewer()], r = pipRect(), fv = archers[viewer()].f;
    pipCam.position.copy(o.root.position).add(new V(4.2 * o.f, 2.9, 0.4 * fv));
    pipCam.lookAt(o.root.position.clone().add(new V(0, 1.25, 0)));
    $('#pip span').textContent = NAMES[1 - viewer()];
    renderer.setScissorTest(true);
    renderer.setViewport(r.x, innerHeight - r.y - r.h, r.w, r.h); renderer.setScissor(r.x, innerHeight - r.y - r.h, r.w, r.h);
    renderer.render(scene, pipCam);
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
