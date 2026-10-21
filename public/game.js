// Archery Duel 3D — hot-seat v1. One file, plain Three.js.
import * as THREE from 'three';

const V = THREE.Vector3, $ = s => document.querySelector(s);
const G = 9.8, MAXV = 31, DIST = 22, HP = 100, DMG = { head: 50, body: 25 };
const DT = 1 / 240, LAND_HOLD = 1.3, MAX_YAW = 12;
const NAMES = ['Blue', 'Red'], COLORS = [0x2f6fd6, 0xd63a2f];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (d, a, b) => { const t = clamp((d - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mat = c => new THREE.MeshStandardMaterial({ color: c, flatShading: true });

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xdcefff, 70, 190);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);

scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x4f6b35, 1.6));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(-15, 40, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 30, bottom: -30, far: 120 });
scene.add(sun);

{ // sky dome with vertex-colour gradient
  const geo = new THREE.SphereGeometry(300, 24, 12), p = geo.attributes.position, cols = [];
  const top = new THREE.Color(0x4a8fd8), bot = new THREE.Color(0xdcefff);
  for (let i = 0; i < p.count; i++) { const c = bot.clone().lerp(top, Math.pow(Math.max(0, p.getY(i) / 300), 0.6)); cols.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
}

// ---------- terrain + obstacles ----------
function groundH(x, z) {
  let h = 0.5 * Math.sin(x * 0.17) * Math.cos(z * 0.21) + 0.3 * Math.sin(x * 0.41 + z * 0.33) + 0.3;
  h *= smooth(Math.hypot(x + DIST, z), 3, 8) * smooth(Math.hypot(x - DIST, z), 3, 8);
  return h + Math.max(0, Math.abs(z) - 16) * 0.4 + Math.max(0, Math.abs(x) - 36) * 0.5;
}
{
  const geo = new THREE.PlaneGeometry(170, 110, 85, 55).rotateX(-Math.PI / 2).toNonIndexed();
  const p = geo.attributes.position, cols = [], c = new THREE.Color();
  for (let i = 0; i < p.count; i++) p.setY(i, groundH(p.getX(i), p.getZ(i)));
  for (let i = 0; i < p.count; i += 3) {
    const h = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    c.setHSL(0.26 + Math.random() * 0.04 - h * 0.006, 0.45, 0.36 + Math.random() * 0.05 + h * 0.01);
    for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }));
  ground.receiveShadow = true;
  scene.add(ground);
}
const obstacles = []; // functions p => boolean
const rockMat = mat(0x8a8a86), trunkMat = mat(0x6b4426), leafMat = mat(0x2f7a3a);
function rock(x, z, sx, sy, sz) {
  const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, groundH(x, z) + sy * 0.45, z);
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  const c = m.position.clone();
  obstacles.push(p => ((p.x - c.x) / sx) ** 2 + ((p.y - c.y) / sy) ** 2 + ((p.z - c.z) / sz) ** 2 < 0.85);
}
function tree(x, z, s) {
  const y = groundH(x, z), g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 1.3 * s, 6), trunkMat);
  trunk.position.y = 0.65 * s;
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.2 * s, 2.8 * s, 7), leafMat);
  leaves.position.y = 1.2 * s + 1.4 * s;
  trunk.castShadow = leaves.castShadow = true;
  g.add(trunk, leaves); g.position.set(x, y, z); g.rotation.y = x;
  scene.add(g);
  obstacles.push(p => {
    const ly = p.y - y, r = Math.hypot(p.x - x, p.z - z);
    if (ly < 0) return false;
    if (ly < 1.2 * s) return r < 0.24 * s;
    return ly < 4 * s && r < 1.2 * s * (1 - (ly - 1.2 * s) / (2.8 * s));
  });
}
rock(0, 0, 1.6, 2.8, 3);
rock(-9, -3, 0.8, 0.6, 0.8); rock(11, 4, 1, 0.7, 1);
[[-7, 7, 1.2], [9, -8, 1.4], [-14, -9, 1.1], [15, 9, 1.3], [3, 13, 1.5], [-3, -15, 1.6], [-25, -12, 1.4], [26, 12, 1.2], [-28, 10, 1.5], [27, -11, 1.3]]
  .forEach(([x, z, s]) => tree(x, z, s));

// ---------- archers ----------
function setLimb(mesh, a, b) { // stretch a unit cylinder between two points
  const d = b.clone().sub(a);
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.scale.set(1, d.length(), 1);
  mesh.quaternion.setFromUnitVectors(new V(0, 1, 0), d.normalize());
}
function makeArrow() { // tip at origin, points along +x
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 5), mat(0xc9a36b));
  shaft.rotation.z = Math.PI / 2; shaft.position.x = -0.5;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 6), mat(0x9aa3ad));
  tip.rotation.z = -Math.PI / 2; tip.position.x = -0.07;
  g.add(shaft, tip);
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.006), mat(0xf2f2f2));
    f.position.set(-0.82, 0.045, 0);
    const holder = new THREE.Group(); holder.rotation.x = k * Math.PI * 2 / 3; holder.add(f); g.add(holder);
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}
function makeArcher(i) {
  const f = i ? -1 : 1, root = new THREE.Group();
  const skin = mat(0xf0c39a), tunic = mat(COLORS[i]), dark = mat(0x3b2a1e), wood = mat(0x7a4a22);
  const add = (geo, m, x, y, z, parent = root) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  for (const z of [-0.12, 0.12]) { add(new THREE.CylinderGeometry(0.08, 0.07, 0.86, 6), dark, 0, 0.43, z); add(new THREE.BoxGeometry(0.26, 0.08, 0.13), dark, 0.05, 0.04, z); }
  add(new THREE.CylinderGeometry(0.21, 0.26, 0.72, 8), tunic, 0, 1.18, 0);
  add(new THREE.CylinderGeometry(0.265, 0.265, 0.08, 8), dark, 0, 0.9, 0);
  add(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 6), skin, 0, 1.58, 0);
  add(new THREE.SphereGeometry(0.19, 10, 8), skin, 0, 1.76, 0);
  const hood = add(new THREE.ConeGeometry(0.22, 0.34, 8), tunic, -0.03, 1.95, 0); hood.rotation.z = 0.25;
  for (const z of [-0.07, 0.07]) add(new THREE.BoxGeometry(0.03, 0.04, 0.035), dark, 0.18, 1.78, z);
  const quiver = add(new THREE.CylinderGeometry(0.08, 0.07, 0.55, 6), wood, -0.26, 1.3, 0.05); quiver.rotation.z = -0.35;
  for (const z of [0, 0.05, 0.1]) add(new THREE.ConeGeometry(0.03, 0.12, 4), mat(0xf2f2f2), -0.36 - z * 0.3, 1.6 + z * 0.2, z);
  // aim rig: pivots at the shoulders, +x = shot direction
  const aim = new THREE.Group(); aim.position.set(0, 1.44, 0); root.add(aim);
  const sFront = new V(0.03, 0, 0.2), hand = new V(0.62, 0, 0.0), sBack = new V(0, 0, -0.2);
  for (const z of [-0.2, 0.2]) add(new THREE.SphereGeometry(0.09, 8, 6), tunic, 0, 0, z, aim);
  const armF = add(new THREE.CylinderGeometry(0.055, 0.05, 1, 6), tunic, 0, 0, 0, aim); setLimb(armF, sFront, hand);
  add(new THREE.SphereGeometry(0.06, 8, 6), skin, hand.x, hand.y, hand.z, aim);
  const ARC = Math.PI * 0.75, R = 0.62;
  const bow = add(new THREE.TorusGeometry(R, 0.025, 5, 20, ARC), wood, hand.x - R, 0, 0, aim); bow.rotation.z = -ARC / 2;
  const tipX = hand.x - R + R * Math.cos(ARC / 2), tipY = R * Math.sin(ARC / 2);
  const stringGeo = new THREE.BufferGeometry().setFromPoints([new V(tipX, tipY, 0), new V(tipX, 0, 0), new V(tipX, -tipY, 0)]);
  aim.add(new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: 0xeeeeee })));
  const armB = add(new THREE.CylinderGeometry(0.05, 0.045, 1, 6), tunic, 0, 0, 0, aim);
  const handB = add(new THREE.SphereGeometry(0.055, 8, 6), skin, 0, 0, 0, aim);
  const nocked = makeArrow(); aim.add(nocked);
  root.rotation.y = i ? Math.PI : 0;
  root.position.set(-f * DIST, 0, 0);
  scene.add(root);
  const a = {
    root, aim, f, hp: HP,
    pose(pitch, yaw, power, showArrow) {
      aim.rotation.set(0, yaw, pitch);
      const nx = tipX - 0.42 * power, nock = new V(nx, 0, 0);
      stringGeo.attributes.position.setX(1, nx); stringGeo.attributes.position.needsUpdate = true;
      setLimb(armB, sBack, nock); handB.position.copy(nock);
      nocked.visible = showArrow; nocked.position.set(nx + 0.92, 0, 0);
    },
    hit(p) { // which part (if any) of this archer contains point p
      const b = root.position, r2 = (p.x - b.x) ** 2 + (p.z - b.z) ** 2, y = p.y - b.y;
      if ((y - 1.8) ** 2 + r2 < 0.26 ** 2) return 'head';
      if (y > 0 && y < 1.62 && r2 < 0.3 ** 2) return 'body';
      return null;
    },
  };
  a.pose(0.5, 0, 0, true);
  return a;
}
const archers = [makeArcher(0), makeArcher(1)];

// ---------- game state ----------
const S = { turn: 0, phase: 'aim', wind: new V(), pitch: 0.6, yaw: 0, power: 0, arrow: null, pos: new V(), vel: new V(), timer: 0, result: null, winner: -1, shots: 0 };
const stuck = [];
const launch = (i, pitch, yaw, power) => {
  const f = archers[i].f, dir = new V(f * Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), -f * Math.cos(pitch) * Math.sin(yaw));
  const pos = archers[i].root.position.clone().add(new V(0, 1.44, 0)).addScaledVector(dir, 0.9);
  return { pos, vel: dir.multiplyScalar(MAXV * power) };
};
function step(p, v, wind) { v.x += wind.x * DT; v.z += wind.z * DT; v.y -= G * DT; p.addScaledVector(v, DT); }
function collide(p, shooter) {
  for (let i = 0; i < 2; i++) if (i !== shooter) { const part = archers[i].hit(p); if (part) return { kind: part, who: i }; }
  if (p.y <= groundH(p.x, p.z)) return { kind: 'ground' };
  if (obstacles.some(t => t(p))) return { kind: 'obstacle' };
  if (Math.abs(p.x) > 85 || Math.abs(p.z) > 55 || p.y < -5) return { kind: 'out' };
  return null;
}
function simulate(pitch, yaw, power, i = S.turn, wind = S.wind) { // pure: where would this shot land?
  const { pos, vel } = launch(i, pitch, yaw, power);
  for (let t = 0; t < 12; t += DT) { step(pos, vel, wind); const r = collide(pos, i); if (r) return { ...r, pos }; }
  return { kind: 'out', pos };
}
function newWind() { S.wind.set((Math.random() * 2 - 1) * 3.5, 0, (Math.random() * 2 - 1) * 0.8); }

function shoot() {
  if (S.phase !== 'aim' || S.power < 0.1) return;
  const { pos, vel } = launch(S.turn, S.pitch, S.yaw, S.power);
  S.pos.copy(pos); S.vel.copy(vel);
  S.arrow = makeArrow(); scene.add(S.arrow); stuck.push(S.arrow);
  archers[S.turn].pose(S.pitch, S.yaw, 0, false);
  S.phase = 'fly'; S.shots++; S.result = null;
  preview.visible = false; $('#hint').style.display = 'none'; $('#readout').textContent = '';
}
function land(r) {
  S.result = r; S.phase = 'land'; S.timer = LAND_HOLD;
  const d = S.vel.clone().normalize();
  S.arrow.position.copy(S.pos).addScaledVector(d, 0.15);
  if (r.kind === 'out') { S.arrow.visible = false; }
  if (r.who !== undefined) {
    const t = archers[r.who];
    t.root.attach(S.arrow);
    t.hp = Math.max(0, t.hp - DMG[r.kind]);
    flash(r.kind === 'head' ? 'HEADSHOT! −50' : 'Hit! −25');
    updateHud();
  } else flash(r.kind === 'out' ? 'Out of the arena' : 'Miss');
}
function nextTurn() {
  if (archers.some(a => a.hp <= 0)) {
    S.phase = 'over'; S.winner = archers[0].hp > 0 ? 0 : 1;
    $('#winner').textContent = `${NAMES[S.winner]} wins!`; $('#over').classList.remove('hidden');
    return;
  }
  S.turn = 1 - S.turn; S.phase = 'aim'; S.power = 0; S.pitch = 0.6; S.yaw = 0; S.arrow = null;
  archers[S.turn].pose(S.pitch, 0, 0, true);
  newWind(); updateHud();
}
function restart() {
  for (const a of stuck) a.removeFromParent();
  stuck.length = 0;
  archers.forEach(a => { a.hp = HP; a.pose(0.5, 0, 0, true); });
  Object.assign(S, { turn: 0, phase: 'aim', power: 0, pitch: 0.6, yaw: 0, arrow: null, winner: -1 });
  newWind(); updateHud(); camJump = true;
  $('#over').classList.add('hidden'); $('#menu').classList.add('hidden');
}

// ---------- trajectory preview (first part of the arc only, no wind) ----------
const PREV_N = 14;
const preview = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(PREV_N * 3), 3)),
  new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }));
preview.visible = false; scene.add(preview);
function updatePreview() {
  const { pos, vel } = launch(S.turn, S.pitch, S.yaw, S.power), attr = preview.geometry.attributes.position, none = new V();
  for (let k = 0; k < PREV_N; k++) { for (let s = 0; s < 8; s++) step(pos, vel, none); attr.setXYZ(k, pos.x, pos.y, pos.z); }
  attr.needsUpdate = true; preview.geometry.computeBoundingSphere(); preview.visible = true;
}

// ---------- input: drag back like a bowstring ----------
let drag = null;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', e => {
  if (S.phase !== 'aim') return;
  drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const px = drag.x - e.clientX, py = e.clientY - drag.y, len = Math.hypot(px, py);
  S.power = clamp(len / (0.34 * Math.min(innerWidth, innerHeight)), 0, 1);
  if (len > 6) S.pitch = clamp(Math.atan2(py, px), -0.25, 1.4);
  archers[S.turn].pose(S.pitch, S.yaw, S.power, true);
  $('#hint').style.display = 'none';
  $('#readout').textContent = `${Math.round(S.pitch * 180 / Math.PI)}° · ${Math.round(S.power * 100)}%`;
  if (S.power >= 0.1) updatePreview(); else preview.visible = false;
});
const endDrag = () => { if (!drag) return; drag = null; if (S.power >= 0.1) shoot(); else { S.power = 0; preview.visible = false; $('#readout').textContent = ''; archers[S.turn].pose(S.pitch, S.yaw, 0, true); } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
const nudge = d => { if (S.phase !== 'aim') return; S.yaw = clamp(S.yaw + d * Math.PI / 180, -MAX_YAW * Math.PI / 180, MAX_YAW * Math.PI / 180); archers[S.turn].pose(S.pitch, S.yaw, S.power, true); updateHud(); };
$('#yawL').onclick = () => nudge(1);   // "far" from camera = screen-left
$('#yawR').onclick = () => nudge(-1);
$('#menuBtn').onclick = () => $('#menu').classList.toggle('hidden');
$('#close').onclick = () => $('#menu').classList.add('hidden');
$('#restart').onclick = restart;
$('#rematch').onclick = restart;

// ---------- HUD ----------
let flashT = 0;
function flash(msg) { $('#readout').textContent = msg; flashT = 1.3; }
function updateHud() {
  archers.forEach((a, i) => { $(`#hp${i} i`).style.width = `${a.hp}%`; $(`#hp${i} span`).textContent = `${NAMES[i]} ${a.hp}`; });
  $('#turn').textContent = `${NAMES[S.turn]}'s turn`;
  $('#turn').style.color = S.turn ? '#fecaca' : '#bfdbfe';
  $('#wind span').textContent = Math.hypot(S.wind.x, S.wind.z).toFixed(1);
  $('#yawV').textContent = `${Math.round(S.yaw * 180 / Math.PI)}°`;
  $('#hint').style.display = S.phase === 'aim' && S.power === 0 ? '' : 'none';
}
function updateWindArrow() { // rotate the wind glyph to match its on-screen direction
  const c = archers[S.turn].root.position.clone().add(new V(0, 2, 0));
  const a = c.clone().project(camera), b = c.clone().addScaledVector(S.wind.clone().normalize(), 4).project(camera);
  $('#wind b').style.transform = `rotate(${Math.atan2(-(b.y - a.y) / camera.aspect, b.x - a.x)}rad)`;
}
function updateMarker() { // point at the opponent when off-screen while aiming
  const m = $('#marker');
  if (S.phase !== 'aim') { m.style.display = 'none'; return; }
  const p = archers[1 - S.turn].root.position.clone().add(new V(0, 1.6, 0)).project(camera);
  if (Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95 && p.z < 1) { m.style.display = 'none'; return; }
  const x = clamp(p.x, -0.92, 0.92), y = clamp(p.y, -0.6, 0.6);
  m.style.display = 'block'; m.style.color = S.turn ? '#3b82f6' : '#ef4444';
  m.style.left = `${(x + 1) / 2 * innerWidth}px`; m.style.top = `${(1 - y) / 2 * innerHeight}px`;
  m.textContent = `${Math.round(2 * DIST)}m ▶`;
}

// ---------- camera ----------
const camPos = new V(), camLook = new V();
let camJump = true;
function camTarget() {
  const f = archers[S.turn].f, portrait = camera.aspect < 0.9;
  if (S.phase === 'aim' || S.phase === 'over') {
    const a = archers[S.turn].root.position, k = portrait ? 1.25 : 1;
    return [a.clone().add(new V(-3.5 * f * k, 3 * k, 11 * f * k)), a.clone().add(new V((portrait ? 5 : 9) * f, 2.2, 0))];
  }
  const p = S.phase === 'fly' ? S.pos : S.arrow.getWorldPosition(new V());
  return [p.clone().add(new V(-3 * f, 1.8, 9 * f)), p.clone().add(new V(2 * f, 0, 0))];
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 0.9 ? 66 : 50;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- loop ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (S.phase === 'fly') {
    for (let t = 0; t < dt; t += DT) {
      step(S.pos, S.vel, S.wind);
      const r = collide(S.pos, S.turn);
      if (r) { land(r); break; }
    }
    if (S.phase === 'fly') { S.arrow.position.copy(S.pos); S.arrow.quaternion.setFromUnitVectors(new V(1, 0, 0), S.vel.clone().normalize()); }
  } else if (S.phase === 'land' && (S.timer -= dt) <= 0) nextTurn();
  if (flashT > 0 && (flashT -= dt) <= 0 && S.phase === 'aim') $('#readout').textContent = '';
  const [tp, tl] = camTarget(), k = camJump ? 1 : 1 - Math.exp(-dt * (S.phase === 'fly' ? 6 : 3));
  camPos.lerp(tp, k); camLook.lerp(tl, k); camJump = false;
  camera.position.copy(camPos); camera.lookAt(camLook);
  updateWindArrow(); updateMarker();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
newWind(); updateHud(); frame();

// test hook (used by the scripted checks)
window.__game = {
  S, archers, simulate,
  setWind: (x, z) => { S.wind.set(x, 0, z); updateHud(); },
  aim: (pitchDeg, yawDeg, power) => { S.pitch = pitchDeg * Math.PI / 180; S.yaw = yawDeg * Math.PI / 180; S.power = power; archers[S.turn].pose(S.pitch, S.yaw, S.power, true); updatePreview(); },
  shoot,
};
window.__ready = true;
