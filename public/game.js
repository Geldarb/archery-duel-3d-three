// Archery Duel 3D v5.1 — cartoon Castle Siege with physics towers and sky power-ups. Hot-seat + online rooms. Plain Three.js.
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HP, ARROWS, ARENA_IDS, SHOULDER, SPECIALS, LAYOUT, BUILD_MAX, CELL, BUILD_TIME, BUILD_LEVELS, DIST, validateBuild, defaultPlan, autoPlan, seriesWinnerOf, makeWorld, simulateShot, finishShot, newRound, rng, winnerOf, randomWind, launch, facing, yawOf, initialPhys, G } from './sim.js';
import { PhysRun, shotEvents, STEP } from './physics.js';
import { SPECIAL_UI, pickupModel } from './specials.js';
import { buildArena, heraldry, toon, noOutline } from './world.js';
import { PALETTE, FLETCH, HELMETS, EMBLEMS, BOWS, TAUNTS, BLOCK_COLORS, DEFAULT_BLOCK, isBlockColor, sanitizeLook, teamColors, hexOf, cleanName, isBaldy } from './looks.js';
import * as sfx from './audio.js';

const V = THREE.Vector3, X = new V(1, 0, 0), $ = s => document.querySelector(s), DEG = Math.PI / 180;
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
function setArena(id) { if (arena) arena.dispose(); world = makeWorld(id); arena = buildArena(scene, world, { hemi, sun }); arena.setTeamColors(cols); }

// ---------- archers & arrows ----------
function setLimb(mesh, a, b) {
  const d = b.clone().sub(a);
  mesh.position.copy(a).addScaledVector(d, 0.5); mesh.scale.set(1, d.length(), 1);
  mesh.quaternion.setFromUnitVectors(new V(0, 1, 0), d.normalize());
}
function makeArrow(type = 'normal', fletch = 0xffffff) { // chunky cartoon arrow, tip at origin, points along +x; fletching in the player's colour
  if (SPECIAL_UI[type]) { const sp = SPECIAL_UI[type].model(); sp.userData.special = type; sp.traverse(o => { o.castShadow = true; }); return sp; }
  const g = new THREE.Group(), heavy = type === 'heavy', r = heavy ? 0.04 : 0.028;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.85, 6), mat(heavy ? 0x6b4423 : 0xc98a4b));
  shaft.rotation.z = Math.PI / 2; shaft.position.x = -0.5;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(heavy ? 0.09 : 0.065, heavy ? 0.22 : 0.17, 4), mat(heavy ? 0x7d8794 : 0xdfe4ea));
  tip.rotation.z = -Math.PI / 2; tip.position.x = -0.08;
  g.add(shaft, tip);
  if (type === 'split') { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 8), mat(0xffc928)); band.rotation.z = Math.PI / 2; band.position.x = -0.3; g.add(band); }
  const fl = mat(fletch); fl.side = THREE.DoubleSide;
  for (let k = 0; k < 3; k++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.1), fl);
    f.position.set(-0.83, 0.06, 0);
    const h = new THREE.Group(); h.rotation.x = k * Math.PI * 2 / 3; h.add(f); g.add(h);
  }
  g.traverse(o => { o.castShadow = true; });
  return g;
}
function makeArcher(i, look, color, parent = scene) { // chunky big-headed cartoon archer, dressed from a player look
  const f = i ? -1 : 1, root = new THREE.Group(), fletch = hexOf(FLETCH, look.fletch);
  const skin = mat(0xffc9a0), team = mat(color), dark = mat(new THREE.Color(color).multiplyScalar(0.45)), boot = mat(0x6b3f1d), leather = mat(0x9a5b2a), gold = mat(0xf4c430);
  const hair = mat(0x5a3418), eye = mat(0x1d1d24), steel = mat(0xc9d0da), wood = mat(0x8f5326);
  const add = (geo, m, x, y, z, p = root) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  const baldy = isBaldy(look); // v6.0 easter egg: cartoon dark-wizard parody (stylized toon, no real likeness)
  const robe = mat(0x1d2b24), pale = mat(0xe4e8e6), bone = mat(0xe9e2cc), darkWood = mat(0x2a1a12);
  if (baldy) wizardBody(add, color, robe, pale);
  else {
  for (const z of [-0.13, 0.13]) { add(new THREE.CylinderGeometry(0.1, 0.1, 0.42, 10), dark, 0, 0.27, z); add(new RoundedBoxGeometry(0.3, 0.14, 0.17, 2, 0.05), boot, 0.04, 0.07, z); }
  const herald = toon(0xffffff, { map: heraldry(color, look.emblem) });
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
  const shine = (x, y, z) => { const o = add(new THREE.SphereGeometry(1, 10, 8), noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })), x, y, z); o.scale.set(0.12, 0.04, 0.07); o.castShadow = false; };
  if (look.helmet === 'round') {
    add(new THREE.SphereGeometry(0.345, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 1.5, 0).scale.y = 0.95;
    add(new THREE.TorusGeometry(0.36, 0.055, 8, 28), steel, 0, 1.5, 0).rotation.x = Math.PI / 2;
    add(new THREE.SphereGeometry(0.04, 8, 6), gold, 0.33, 1.56, 0.13); shine(0.06, 1.77, -0.13);
  } else if (look.helmet === 'kettle') { // wide-brimmed kettle hat
    add(new THREE.SphereGeometry(0.32, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 1.53, 0).scale.y = 0.85;
    add(new THREE.CylinderGeometry(0.52, 0.52, 0.045, 30), steel, 0, 1.53, 0);
    add(new THREE.TorusGeometry(0.32, 0.03, 6, 24), gold, 0, 1.56, 0).rotation.x = Math.PI / 2; shine(0.05, 1.77, -0.12);
  } else if (look.helmet === 'hood') { // open-faced hood with a droopy tail
    const hood = mat(color); hood.side = THREE.DoubleSide;
    add(new THREE.SphereGeometry(0.345, 22, 14, Math.PI + 0.8, Math.PI * 2 - 1.6, 0, Math.PI * 0.8), hood, 0, 1.43, 0);
    add(new THREE.ConeGeometry(0.13, 0.42, 12), hood, -0.38, 1.4, 0).rotation.z = Math.PI / 2 + 0.6;
  } else if (look.helmet === 'crown') {
    add(new THREE.SphereGeometry(0.315, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.36), hair, 0, 1.42, 0);
    const band = mat(0xffcf33); band.side = THREE.DoubleSide;
    add(new THREE.CylinderGeometry(0.25, 0.235, 0.15, 20, 1, true), band, 0, 1.7, 0);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; add(new THREE.ConeGeometry(0.05, 0.14, 6), band, Math.cos(a) * 0.245, 1.83, Math.sin(a) * 0.245); }
    add(new THREE.SphereGeometry(0.045, 10, 8), mat(0xe0342c), 0.25, 1.7, 0);
  } else { // feathered cap
    add(new THREE.SphereGeometry(0.33, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), team, 0, 1.52, 0).scale.y = 0.72;
    add(new THREE.TorusGeometry(0.33, 0.045, 8, 26), dark, 0, 1.52, 0).rotation.x = Math.PI / 2;
    const feather = add(new THREE.SphereGeometry(1, 12, 8), mat(fletch === 0xffffff ? 0xffffff : fletch), -0.12, 1.86, 0.2); feather.scale.set(0.06, 0.3, 0.035); feather.rotation.z = 0.7;
  }
  }
  const quiver = add(new THREE.CylinderGeometry(0.12, 0.1, 0.58, 12), baldy ? robe : leather, -0.3, 0.92, 0.12); quiver.rotation.set(0.25, 0, -0.35);
  add(new THREE.TorusGeometry(0.12, 0.025, 6, 14), wood, 0, 0.29, 0, quiver).rotation.x = Math.PI / 2;
  const fl = mat(fletch); fl.side = THREE.DoubleSide;
  for (const [dx, dz] of [[0, 0], [0.05, 0.05], [-0.04, 0.05]]) { add(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 5), wood, dx, 0.4, dz, quiver); add(new THREE.PlaneGeometry(0.1, 0.16), fl, dx, 0.55, dz, quiver); }
  const aim = new THREE.Group(); aim.position.set(0, SHOULDER, 0); root.add(aim); // shoulder pivot, +x = shot direction
  const sFront = new V(0.02, -0.05, 0.27), hand = new V(0.6, 0, 0.04), sBack = new V(0, -0.05, -0.27);
  const sleeve = baldy ? robe : team, glove = baldy ? pale : leather;
  for (const z of [-0.29, 0.29]) add(new THREE.SphereGeometry(0.13, 12, 8), sleeve, 0, -0.05, z, aim);
  setLimb(add(new THREE.CylinderGeometry(0.09, baldy ? 0.11 : 0.08, 1, 10), sleeve, 0, 0, 0, aim), sFront, hand);
  add(new THREE.CylinderGeometry(0.095, 0.095, 0.14, 10), baldy ? robe : leather, 0.47, 0, 0.06, aim).rotation.z = Math.PI / 2;
  add(new THREE.SphereGeometry(0.09, 10, 8), glove, hand.x, hand.y, hand.z, aim);
  const recurve = look.bow === 'recurve', ARC = Math.PI * (recurve ? 0.58 : 0.62), R = recurve ? 0.62 : 0.8; // cosmetic bow styles
  const limbM = baldy ? darkWood : look.bow === 'gold' ? mat(0xffcf33) : recurve ? mat(0x5a3418) : wood;
  const bow = add(new THREE.TorusGeometry(R, baldy ? 0.03 : recurve ? 0.05 : 0.045, 8, 28, ARC), limbM, hand.x - R, 0, 0, aim); bow.rotation.z = -ARC / 2;
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), baldy ? bone : look.bow === 'gold' ? mat(0xffffff) : gold, hand.x, 0, 0, aim);
  if (baldy) { // wand-like: knobbly bone tips
    for (const sg of [1, -1]) add(new THREE.SphereGeometry(0.05, 8, 6), bone, hand.x - R + R * Math.cos(ARC / 2), sg * R * Math.sin(ARC / 2), 0, aim);
  } else if (look.bow === 'gold') add(new THREE.SphereGeometry(0.05, 10, 8), mat(0xe0342c), hand.x + 0.05, 0, 0, aim);
  let tipX = hand.x - R + R * Math.cos(ARC / 2), tipY = R * Math.sin(ARC / 2);
  if (recurve) { // tips curl forward
    for (const sg of [1, -1]) add(new THREE.CylinderGeometry(0.04, 0.03, 0.2, 8), limbM, tipX + 0.06, sg * (tipY + 0.07), 0, aim).rotation.z = sg * -0.75;
    tipX += 0.12; tipY += 0.13;
  }
  const stringGeo = new THREE.BufferGeometry().setFromPoints([new V(tipX, tipY, 0), new V(tipX, 0, 0), new V(tipX, -tipY, 0)]);
  aim.add(new THREE.Line(stringGeo, noOutline(new THREE.LineBasicMaterial({ color: 0xffffff }))));
  const armB = add(new THREE.CylinderGeometry(0.085, baldy ? 0.105 : 0.075, 1, 10), sleeve, 0, 0, 0, aim);
  const handB = add(new THREE.SphereGeometry(0.085, 10, 8), glove, 0, 0, 0, aim);
  let nocked = makeArrow('normal', fletch); aim.add(nocked);
  root.rotation.y = i ? Math.PI : 0;
  root.position.set(...initialPhys().a[i]);
  parent.add(root);
  root.userData.baldy = baldy;
  const a = {
    root, f, fletch, baldy, aim,
    pose(pitch, draw, showArrow, type) {
      aim.rotation.set(0, 0, pitch);
      if (type && nocked.userData.type !== type) { aim.remove(nocked); nocked = makeArrow(type, fletch); nocked.userData.type = type; aim.add(nocked); }
      const nx = tipX - 0.42 * draw, nock = new V(nx, 0, 0);
      stringGeo.attributes.position.setX(1, nx); stringGeo.attributes.position.needsUpdate = true;
      setLimb(armB, sBack, nock); handB.position.copy(nock);
      nocked.visible = showArrow; nocked.position.set(nx + (nocked.userData.special ? 0.25 : 0.92), 0, 0);
      if (nocked.userData.special) nocked.scale.setScalar(0.6);
    },
  };
  a.pose(0.5, 0, true);
  return a;
}
function wizardBody(add, color, robe, pale) { // v6.0 'baldy mordy': bald pale toon wizard in long high-collared dark robes, no helmet
  const robeD = robe.clone(); robeD.side = THREE.DoubleSide;
  for (const z of [-0.12, 0.12]) add(new RoundedBoxGeometry(0.26, 0.1, 0.15, 2, 0.04), mat(0x141414), 0.06, 0.05, z); // pointy dark shoes peeking out
  add(new THREE.CylinderGeometry(0.3, 0.46, 1.0, 18), robe, 0, 0.55, 0); // long robe to the floor
  add(new THREE.CylinderGeometry(0.29, 0.31, 0.3, 18), robe, 0, 1.05, 0); // chest
  add(new THREE.TorusGeometry(0.32, 0.03, 6, 22), mat(color), 0, 0.72, 0).rotation.x = Math.PI / 2; // thin team-colour sash so sides stay readable
  add(new THREE.CylinderGeometry(0.3, 0.21, 0.26, 18, 1, true, Math.PI * 0.35, Math.PI * 1.3), robeD, 0, 1.27, 0).rotation.y = Math.PI; // high open collar behind the head
  add(new THREE.BoxGeometry(0.03, 0.5, 0.05), mat(0x0e1712), 0.3, 0.95, 0); // robe seam
  add(new THREE.SphereGeometry(0.3, 22, 16), pale, 0, 1.43, 0).scale.set(1, 1.08, 0.96); // smooth bald dome
  for (const z of [-0.285, 0.285]) add(new THREE.SphereGeometry(0.06, 8, 6), pale, -0.02, 1.4, z).scale.set(0.7, 1.2, 0.6);
  const eye = mat(0x2a2030), slit = mat(0x6d7270), lip = mat(0xb4a4a6);
  for (const z of [-0.1, 0.1]) { add(new THREE.SphereGeometry(0.04, 8, 6), eye, 0.27, 1.46, z).scale.set(0.5, 0.75, 1.15); add(new THREE.BoxGeometry(0.02, 0.025, 0.1), mat(0xc4cac8), 0.285, 1.52, z).rotation.x = z > 0 ? -0.25 : 0.25; }
  for (const z of [-0.028, 0.028]) add(new THREE.SphereGeometry(0.02, 6, 4), slit, 0.3, 1.37, z).scale.set(0.5, 0.45, 1.4); // flat slit nose
  add(new THREE.BoxGeometry(0.02, 0.016, 0.13), lip, 0.282, 1.29, 0); // thin lips
}
// ---------- player looks (cosmetic) ----------
const loadLook = slot => { try { return sanitizeLook(JSON.parse(localStorage.getItem(`ad3t-look-${slot}`)), slot); } catch { return sanitizeLook(null, slot); } };
const saveLook = (slot, l) => { try { localStorage.setItem(`ad3t-look-${slot}`, JSON.stringify(l)); } catch {} };
const css = c => '#' + c.toString(16).padStart(6, '0');
let looks = [loadLook(0), loadLook(1)], cols = teamColors(looks[0], looks[1]);
const archers = [makeArcher(0, looks[0], cols[0]), makeArcher(1, looks[1], cols[1])];
function dispose(o) { o.removeFromParent(); o.traverse(m => { if (m.geometry) m.geometry.dispose(); }); }
function setLooks(ls) { // rebuild both archers and recolour castles/HUD
  looks = ls.map((l, i) => sanitizeLook(l, i)); cols = teamColors(looks[0], looks[1]);
  for (const i of [0, 1]) { dispose(archers[i].root); archers[i] = makeArcher(i, looks[i], cols[i]); }
  if (arena) arena.setTeamColors(cols);
  for (const i of [0, 1]) {
    $(`#hp${i} i`).style.background = `linear-gradient(${css(new THREE.Color(cols[i]).lerp(new THREE.Color(0xffffff), 0.3).getHex())}, ${css(cols[i])})`;
    $(`#hp${i} .shield path`).setAttribute('fill', css(cols[i]));
  }
}
const nameOf = i => looks[i].name;

const stuck = [];

// ---------- state ----------
const S = { last: [null, null], mode: 'menu', phase: 'menu', me: 0, turn: 0, hp: [HP, HP], st: newRound(Math.random), rand: Math.random, wind: { x: 0, z: 0 }, aim: { pitch: 0.5, power: 0 }, draw: 0,
  types: ['normal', 'normal'], seriesChoice: 1, best: 1, score: [0, 0], seriesWinner: -1, pending: null, cardT: 0, arenaChoice: 'random', arenaId: 'field', play: null, queue: [], winner: -1, focus: null };
const viewer = () => (S.mode === 'online' ? S.me : S.turn);
const myTurn = () => S.phase === 'aim' && (S.mode === 'hot' || S.turn === S.me);

const clone = o => JSON.parse(JSON.stringify(o));
const placeArchers = a => { archers.forEach((x, i) => x.root.position.set(...a[i])); faceArchers(a); };
function faceArchers(a) { // always upright, always facing the opponent's current spot (after falls, landings, build moves, every turn)
  archers.forEach((x, i) => { x.root.rotation.set(0, yawOf(facing(i, a[i], a[1 - i])), 0); });
}
let pickupObj = null, pickupKey = '';
const PICKUP_SCALE = 1.6; // big enough to read from across the field (hit radius PICKUP_R in sim.js)
function showPickup(p, pop) { // the floating power-up balloon (state lives in S.st.pickup)
  const key = p ? `${p.kind}:${p.pos.join()}` : '';
  if (key === pickupKey) return;
  pickupKey = key;
  if (pickupObj) { dispose(pickupObj); pickupObj = null; }
  if (!p) return;
  pickupObj = pickupModel(p.kind); pickupObj.position.set(...p.pos); pickupObj.userData.y = p.pos[1]; pickupObj.userData.pop = pop ? 0 : 1; pickupObj.scale.setScalar(pop ? 0.01 : PICKUP_SCALE); scene.add(pickupObj);
  if (pop) { flash('A power-up floats in!'); sfx.ding(); }
}
const fading = [];
// v6.0: little timed animations (sparkles, cow wander, boot drop, victory ragdoll/dance). fn(t, dt) returns false when done.
const anims = [];
const anim = (fn, tag = 'game') => { const a = { fn, t: 0, tag }; anims.push(a); return a; };
function tickAnims(dt) { for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; if (a.fn(a.t, dt) === false) anims.splice(i, 1); } }
function clearAnims(tag = 'game') { for (let i = anims.length - 1; i >= 0; i--) if (anims[i].tag === tag) { const a = anims.splice(i, 1)[0]; if (a.clean) a.clean(); } }
const starGeo = new THREE.OctahedronGeometry(1, 0);
function sparkle(parent, pos, size = 1, tag = 'game') { // twinkly burst of little stars
  const g = new THREE.Group(); g.position.copy(pos); parent.add(g);
  const cs = [0xfff3a0, 0xffffff, 0x9dffb0, 0xd9a6ff], parts = [];
  for (let k = 0; k < 18; k++) {
    const m = new THREE.Mesh(starGeo, noOutline(new THREE.MeshBasicMaterial({ color: cs[k % 4], transparent: true, depthWrite: false })));
    const d = new V(Math.random() - 0.5, Math.random() * 0.9 - 0.2, Math.random() - 0.5).normalize().multiplyScalar((0.6 + Math.random() * 0.8) * size);
    m.scale.setScalar(0.05 * size); g.add(m); parts.push([m, d]);
  }
  const a = anim((t) => {
    for (const [m, d] of parts) { m.position.copy(d).multiplyScalar(Math.min(1, t * 2.2) * (1 + t * 0.3)); m.rotation.y = t * 8; m.material.opacity = Math.max(0, 1 - t / 1.2); m.scale.setScalar(0.05 * size * (1 + Math.sin(t * 20 + d.x * 9) * 0.4)); }
    if (t > 1.2) { g.removeFromParent(); return false; }
  }, tag);
  a.clean = () => g.removeFromParent();
  return g;
}
function startMatch({ arenaId, mode, me = 0, turn = 0, st = null, wind, looks: ls = [loadLook(0), loadLook(1)], best = 1, score = [0, 0], builds = null, colors = null }) {
  const fromBuild = S.phase === 'build' || S.phase === 'pass';
  endBuildUi();
  setLooks(ls);
  if (arenaId !== S.arenaId || !world) setArena(arenaId);
  for (const a of stuck) a.removeFromParent();
  stuck.length = 0;
  for (const f of fading) f.o.removeFromParent();
  fading.length = 0;
  clearAnims(); resetVictoryPose();
  S.rand = rng((Math.random() * 2 ** 32) >>> 0); // hot-seat power-up spawns (online: the server's seeded rng)
  st = clone(st || newRound(S.rand, builds)); // every round of a series resets to the layout built at its start
  S.builds = builds;
  S.colors = colors || (builds ? builds.map(b => (b && b.colors) || null) : null); // v5.3: per-block colours (online: from the server each round)
  arena.setBuildColors(S.colors); arena.resetBlocks(st.phys.b); placeArchers(st.phys.a); pickupKey = '-'; showPickup(st.pickup, false);
  for (const i of [0, 1]) if (ARROWS[S.types[i]].special) S.types[i] = 'normal';
  S.last = [null, null]; camExit(true); // v5.4: the last-shot guide starts fresh every round
  Object.assign(S, { mode, me, turn, hp: [...st.hp], st, wind, arenaId, phase: 'aim', winner: -1, play: null, queue: [], focus: null, draw: 0, best, score: [...score], seriesWinner: -1, pending: null, cardT: 0 });
  show('#roundCard', false);
  archers.forEach((a, i) => a.pose(0.5, 0, true, S.types[i]));
  ['#home', '#lobby', '#over', '#menu', '#notice'].forEach(s => show(s, false));
  ['#hud', '#menuBtn', '#bottom', '#fsGame'].forEach(s => show(s, true));
  ['#help', '#custom'].forEach(s => show(s, false));
  if (!(history.state && history.state.ad3t)) history.pushState({ ad3t: 'game' }, ''); // Android back in a match opens the menu
  show('#restart', mode === 'hot');
  $('#homeBtn').textContent = mode === 'online' ? 'Leave room' : 'Main menu';
  camJump = true; updateHud();
  if (fromBuild) flash('Towers revealed!');
  if (score[0] + score[1] === 0 && archers.some(a => a.baldy)) { // reveal the easter-egg wizard with a sparkle at the start of a series
    for (const a of archers) if (a.baldy) sparkle(scene, a.root.position.clone().add(new V(0, 1.3, 0)), 1.3);
    sfx.sparkle(); S.baldyRevealed = (S.baldyRevealed || 0) + 1;
  }
}
const pickArena = () => (S.arenaChoice === 'random' ? ARENA_IDS[Math.floor(Math.random() * ARENA_IDS.length)] : S.arenaChoice);
const quickHot = (arenaId = pickArena(), turn = 0, builds = null) => startMatch({ arenaId, mode: 'hot', wind: randomWind(), turn, best: S.seriesChoice, builds }); // a new series, no build phase
const startHot = (arenaId = pickArena(), turn = 0) => enterBuild({ arenaId, mode: 'hot', turn, best: S.seriesChoice }); // a new series starts with the build phase
function goHome() {
  if (S.mode === 'online' && sock) sock.emit('leave');
  Object.assign(S, { mode: 'menu', phase: 'menu', play: null, queue: [], pending: null, cardT: 0, last: [null, null] }); endBuildUi(); camExit(true);
  ['#hud', '#menuBtn', '#fsGame', '#camBtn', '#bottom', '#pip', '#lobby', '#over', '#menu', '#notice', '#roundCard', '#help', '#custom'].forEach(s => show(s, false));
  show('#home', true); $('#homeMsg').textContent = '';
  setLooks([loadLook(0), loadLook(1)]);
}
function notice(msg) {
  if (S.mode !== 'online') return;
  S.mode = 'menu'; S.phase = 'menu'; S.pending = null; S.cardT = 0; endBuildUi();
  ['#over', '#menu', '#lobby', '#roundCard'].forEach(s => show(s, false));
  $('#noticeText').textContent = msg; openPanel('#notice');
}

// ---------- shooting & playback ----------
function fire() {
  const aim = { ...S.aim };
  let type = S.types[S.turn];
  if (ARROWS[type].special && !(S.st.ammo[S.turn][type] > 0)) type = 'normal';
  preview.visible = false; $('#readout').textContent = '';
  if (S.mode === 'online') { S.phase = 'wait'; sock.emit('shoot', { aim, type }); updateHud(); return; }
  playShot({ shooter: S.turn, aim, sim: simulateShot(world, S.turn, aim, S.wind, type, S.st), local: true }); // hot-seat: physics + outcome are resolved locally in endShot
}
function playShot(m) {
  if (S.play) { S.queue.push(m); return; }
  archers[m.shooter].pose(m.aim.pitch, 0, false);
  recordLast(m); camExit(false); // the shot cinematics take the camera back
  const arrows = m.sim.arrows.map(x => { const mesh = makeArrow(m.sim.type, archers[m.shooter].fletch); mesh.visible = false; scene.add(mesh); stuck.push(mesh); return { ...x, m: mesh, landed: false }; });
  // live rigid-body playback from the same snapshot + impulses the server uses; the server's settled state is snapped in at the end
  const run = new PhysRun(S.st.phys, shotEvents(m.sim));
  S.play = { arrows, ft: 0, hold: 1.0, m, run, fxi: 0, logi: 0, focus: null, chair: null, vy: new Float32Array(LAYOUT.length), puffs: 0, t0: performance.now() };
  S.phase = 'fly'; S.draw = 0; preview.visible = false;
  sfx.twang(); sfx.whoosh(Math.max(...arrows.map(a => a.res.t)) * 0.8);
  updateHud();
}
function land(a) {
  a.landed = true;
  const r = a.res, d = new V(...r.dir).normalize(), sp = a.m.userData.special;
  a.m.position.set(...r.pos).addScaledVector(d, sp ? -0.3 : 0.15);
  if (!sp) a.m.quaternion.setFromUnitVectors(X, d);
  a.m.visible = r.kind !== 'out' && r.kind !== 'pickup' && sp !== 'bomb';
  if (r.kind === 'pickup') { // popped the balloon: the special goes to the shooter's ammo
    const k = r.pickup, UI = SPECIAL_UI[k];
    arena.puff(new V(...r.pos), 10, 0.28, undefined, 1.2, 0.4, 0.8); showPickup(null);
    sfx.pop(); flash(`${nameOf(S.play.m.shooter)} grabs a ${UI.label.toUpperCase()}!`);
    floatText(`+1 ${UI.label}`, new V(...r.pos), '#ffd84a');
  } else if (r.kind === 'block') { // the arrow stays stuck in the stone it hit (and moves with it)
    if (!sp) { a.m.updateMatrixWorld(); arena.blockMesh(r.block).attach(a.m); }
    sfx.crack();
  } else if (r.who !== undefined) {
    if (!sp) { a.m.updateMatrixWorld(); archers[r.who].root.attach(a.m); }
    S.hp[r.who] = Math.max(0, S.hp[r.who] - r.dmg);
    const head = r.kind === 'head';
    floatText(`−${r.dmg}`, new V(...r.pos).add(new V(0, 0.4, 0)), head ? '#ffd84a' : '#fff');
    if (head) { sfx.ding(); flash('HEADSHOT!'); }
    sfx.grunt(); shake = head ? 0.45 : 0.25;
    updateHud();
  } else if (r.kind === 'stone') sfx.crack();
  else if (r.kind !== 'out' && !sp) sfx.thunk();
}
const LOG_TEXT = { ground: ['#ff8a5c', 'Fell to the ground!'], fall: ['#ffd0a0', 'Took a tumble!'], debris: ['#fff', ''], blast: ['#ff6a3a', ''], spin: ['#9ad0ff', ''] };
function stepPhysics(P) {
  const run = P.run, target = Math.floor(P.ft / STEP + 1e-6);
  for (let n = 0; n < 8 && !run.done && run.k < target; n++) run.step(); // fixed 1/60 steps tied to playback time (slow-mo slows the stones too)
  run.blocks.forEach((b, i) => { // copy transforms + crunch/dust when a falling stone lands
    const m = arena.blocks[i], vy = b.velocity.y, pv = P.vy[i];
    if (b.sleepState !== 2 || m.position.distanceToSquared(b.position) > 1e-8) { m.position.copy(b.position); m.quaternion.copy(b.quaternion); }
    if (pv < -2.2 && vy > pv + 2) { sfx.crunch(Math.min(1, -pv / 7)); if (P.puffs++ < 40) arena.puff(new V(b.position.x, b.position.y - LAYOUT[i].half[1], b.position.z), 2, 0.3); }
    P.vy[i] = vy;
  });
  run.archers.forEach((b, i) => archers[i].root.position.set(b.position.x, b.position.y - 0.8, b.position.z));
  faceArchers(archers.map(x => x.root.position.toArray()));
  for (; P.fxi < run.fx.length; P.fxi++) {
    const e = run.fx[P.fxi], p = new V(...e.p);
    if (e.kind === 'hit') { arena.chunks(p, 4, new V(...P.m.sim.arrows[0].res.dir).setY(0).normalize().multiplyScalar(0.6), arena.blockHex(e.i)); arena.puff(p, 3, 0.3); sfx.crunch(1); shake = Math.max(shake, 0.15); }
    else if (e.kind === 'blast') { arena.explode(p); sfx.boom(); shake = 1.0; flash('BOOM!'); P.focus = p; }
    else if (e.kind === 'chair') { P.chair = P.arrows[0].m; P.chair.visible = true; sfx.whir(ARROWS.wheelchair.spin + 0.3); flash('WHEEEEE!'); }
  }
  if (P.chair && run.chair) {
    P.chair.position.copy(run.chair.position); P.chair.quaternion.copy(run.chair.quaternion);
    if (run.spin && run.k >= run.spin.start && run.k < run.spin.end) { // whirl: sparks + dust around the spinning chair
      const c = run.chair.position, g = new V(c.x, c.y - 0.3, c.z);
      arena.sparks(g, 2); if (Math.random() < 0.25) arena.puff(g, 1, 0.3, undefined, 1.4, 0.5);
    }
  }
  for (; P.logi < run.log.length; P.logi++) { // physics damage: falls, falling stones, blast, spin
    const e = run.log[P.logi], [col, msg] = LOG_TEXT[e.kind] || ['#fff', ''];
    S.hp[e.who] = Math.max(0, S.hp[e.who] - e.dmg);
    floatText(`−${e.dmg}`, new V(...e.pos).add(new V(0, 2.1, 0)), col);
    if (msg) flash(`${nameOf(e.who)}: ${msg}`);
    if (e.kind !== 'spin' || Math.random() < 0.5) sfx.grunt();
    shake = Math.max(shake, e.kind === 'ground' ? 0.5 : 0.2); updateHud();
  }
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
    if (a.m.userData.special) a.m.rotation.set(0, P.ft * 1.3, -P.ft * (a.m.userData.special === 'wheelchair' ? 9 : 4) * archers[P.m.shooter].f); // tumbling lob
    else a.m.quaternion.setFromUnitVectors(X, p1.sub(p0).normalize());
    a.m.visible = true;
  }
  stepPhysics(P);
  if (P.arrows.every(a => a.landed) && P.run.done && (P.hold -= dt) <= 0) endShot();
}
function playLead() {
  const P = S.play;
  return P && (P.arrows.find(a => !a.landed && P.ft >= a.t0) || P.arrows.find(a => a.res.who !== undefined) || P.arrows.find(a => a.m.visible));
}
function blockDrift(b) { // largest gap between the live blocks and an authoritative snapshot (m)
  let d = 0; arena.blocks.forEach((m, i) => { d = Math.max(d, Math.hypot(m.position.x - b[i][0], m.position.y - b[i][1], m.position.z - b[i][2])); }); return d;
}
function endShot() {
  const P = S.play, m = P.m, lead = playLead();
  S.focus = P.focus || (lead ? lead.m.getWorldPosition(new V()) : null);
  let o;
  if (m.local) { // hot-seat: this machine is the authority
    const res = P.run.result(), next = finishShot(S.st, m.shooter, m.sim.type, m.sim, res, S.rand), winner = winnerOf(next.hp), score = [...S.score];
    if (winner >= 0) score[winner]++;
    o = { st: { hp: next.hp, phys: next.phys, ammo: next.ammo, pickup: next.pickup, spawnIn: next.spawnIn }, got: next.got, winner, score, seriesWinner: seriesWinnerOf(score, S.best), turn: winner >= 0 ? 1 - winner : 1 - m.shooter, wind: randomWind() };
  } else o = m;
  S.lastDrift = blockDrift(o.st.phys.b); S.lastLog = [...P.run.log]; S.lastGot = o.got; S.lastSteps = P.run.k; S.lastPlayMs = performance.now() - P.t0;
  arena.setBlocks(o.st.phys.b); placeArchers(o.st.phys.a); // snap to the settled authoritative state (normally identical)
  if (P.chair) fading.push({ o: P.chair, t: 1 });
  showPickup(o.st.pickup, true);
  S.st = clone(o.st);
  for (const i of [0, 1]) if (ARROWS[S.types[i]].special && !(S.st.ammo[i][S.types[i]] > 0)) S.types[i] = 'normal';
  Object.assign(S, { hp: [...S.st.hp], turn: o.turn, wind: o.wind, play: null, aim: { pitch: 0.5, power: 0 } });
  const mm = { winner: o.winner, seriesWinner: o.seriesWinner };
  if (mm.winner >= 0) S.score = [...o.score];
  if (mm.winner >= 0 && mm.seriesWinner < 0) { // round over: card, then the next round (loser shoots first; online the server sends it)
    S.phase = 'round'; S.winner = mm.winner; S.cardT = 2.4;
    $('#roundCard b').textContent = S.mode === 'online' && mm.winner === S.me ? 'Round to you!' : `Round to ${nameOf(mm.winner)}!`;
    $('#roundCard span').textContent = `${S.score[0]} - ${S.score[1]}`; $('#roundCard').style.borderColor = css(cols[mm.winner]);
    show('#roundCard', true); sfx.ding();
    if (S.mode === 'hot') S.pending = { arenaId: S.arenaId, mode: 'hot', wind: randomWind(), turn: 1 - mm.winner, best: S.best, score: S.score, builds: S.builds };
  } else if (mm.winner >= 0) { // series (or single match) over
    const w = mm.seriesWinner, series = S.best > 1, online = S.mode === 'online';
    S.phase = 'over'; S.winner = w; S.seriesWinner = w;
    $('#winner').textContent = online ? (w === S.me ? `You win${series ? ' the series' : ''}!` : `You lose${series ? ' the series' : ''}`) : `${nameOf(w)} wins${series ? ' the series' : ''}!`;
    $('#taunt').textContent = `${nameOf(w)}: “${TAUNTS[looks[w].taunt]}”`; $('#taunt').style.background = css(cols[w]);
    $('#overScore').textContent = series ? `${nameOf(0)} ${S.score[0]} - ${S.score[1]} ${nameOf(1)}` : '';
    $('#rematch').textContent = series ? 'Rematch series' : 'Rematch';
    $('#overTitle').textContent = series ? 'Series over' : 'Match over';
    $('#overMsg').textContent = ''; $('#rematch').disabled = false; show('#menu', false); openPanel('#over'); sfx.fanfare();
  } else {
    S.phase = 'aim';
    archers[S.turn].pose(0.5, 0, true, S.types[S.turn]);
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
  const { pos, vel } = launch(S.turn, S.aim, S.st.phys.a[S.turn], S.st.phys.a[1 - S.turn]), attr = preview.geometry.attributes.position, g = G * ARROWS[S.types[S.turn]].g, dt = 1 / 34;
  for (let k = 0; k < PREV_N; k++) {
    vel.y -= g * dt; pos.x += vel.x * dt; pos.y += vel.y * dt; pos.z += vel.z * dt;
    attr.setXYZ(k, pos.x, pos.y, pos.z);
  }
  attr.needsUpdate = true; preview.geometry.computeBoundingSphere(); preview.visible = true;
}

// ---------- v5.4: last-shot guide. Each player sees their own previous shot while aiming: a dashed ghost arc from the bow in their colour,
// a faded X where that arrow landed, a 'Last: 34° · 72%' label and ticks on the drag readout. Cleared every round.
function recordLast(m) {
  const a0 = m.sim.arrows && m.sim.arrows[0], p = a0 && a0.res && a0.res.pos;
  const land = p && p.every(Number.isFinite) && Math.abs(p[0]) < 70 && Math.abs(p[2]) < 70 && p[1] > -5 ? [...p] : null;
  S.last[m.shooter] = { pitch: m.aim.pitch, power: m.aim.power, type: m.sim.type, kind: a0 ? a0.res.kind : null, land };
}
const lastText = L => `Last: ${Math.round(L.pitch / DEG)}° · ${Math.round(L.power * 100)}%`;
const GHOST_N = 30;
const ghostLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(GHOST_N * 3), 3)),
  noOutline(new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.32, gapSize: 0.22, transparent: true, opacity: 0.7, depthWrite: false })));
ghostLine.visible = false; ghostLine.frustumCulled = false; ghostLine.renderOrder = 3; scene.add(ghostLine);
function xTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.lineCap = 'round'; g.beginPath(); g.moveTo(14, 14); g.lineTo(50, 50); g.moveTo(50, 14); g.lineTo(14, 50);
  g.strokeStyle = '#1b1830'; g.lineWidth = 15; g.stroke(); g.strokeStyle = '#fff'; g.lineWidth = 8; g.stroke();
  return new THREE.CanvasTexture(c);
}
const landMark = new THREE.Sprite(noOutline(new THREE.SpriteMaterial({ map: xTex(), transparent: true, opacity: 0.6, depthTest: false, depthWrite: false })));
landMark.scale.setScalar(0.85); landMark.visible = false; landMark.renderOrder = 4; scene.add(landMark);
let guideKey = '';
const guideOn = () => { const L = S.last[S.turn]; return !!L && S.phase === 'aim' && myTurn() && !S.play; };
function updateGuide() {
  const on = guideOn(), L = on ? S.last[S.turn] : null;
  ghostLine.visible = on; landMark.visible = on && !!L.land;
  const lab = $('#lastShot'), txt = on ? lastText(L) : '';
  if (lab.textContent !== txt) lab.textContent = txt;
  lab.classList.toggle('hidden', !on || CAM.on || !!drag);
  if (!on) { guideKey = ''; return; }
  const ap = S.st.phys.a[S.turn], op = S.st.phys.a[1 - S.turn], type = S.types[S.turn];
  const key = [S.turn, L.pitch, L.power, type, ...ap, ...op, cols[S.turn]].join('|');
  if (key === guideKey) return;
  guideKey = key;
  const { pos, vel } = launch(S.turn, L, ap, op), attr = ghostLine.geometry.attributes.position, g = G * ARROWS[type].g, dt = 1 / 30; // no wind: same rule as the live preview, so the two line up when the aim matches
  let n = 0;
  for (; n < GHOST_N; n++) {
    attr.setXYZ(n, pos.x, pos.y, pos.z);
    if (n > 2 && pos.y < world.groundH(pos.x, pos.z)) { n++; break; }
    vel.y -= g * dt; pos.x += vel.x * dt; pos.y += vel.y * dt; pos.z += vel.z * dt;
  }
  attr.needsUpdate = true; ghostLine.geometry.setDrawRange(0, n); ghostLine.geometry.computeBoundingSphere(); ghostLine.computeLineDistances();
  ghostLine.material.color.setHex(cols[S.turn]); landMark.material.color.setHex(cols[S.turn]).lerp(new THREE.Color(0xffffff), 0.35);
  if (L.land) landMark.position.set(L.land[0], L.land[1] + 0.35, L.land[2]);
}
function gauge(cur, last) { // readout bar with a tick at your last shot (turns green when you're on it)
  return `<span class="g${Math.round(cur) === Math.round(last) ? ' eq' : ''}"><s style="width:${cur.toFixed(1)}%"></s><u style="left:${last.toFixed(1)}%"></u></span>`;
}
const powPct = p => (p - POW_MIN) / (1 - POW_MIN) * 100, angPct = d => (d - PITCH_MIN) / (PITCH_MAX - PITCH_MIN) * 100;

// ---------- v5.4: camera mode (🎥). Swipes aim, so looking around is a mode: drag orbits, pinch / wheel zooms, presets Me / Side / Enemy.
// Only while aiming on your turn or watching the opponent aim; any shot (or the round ending) hands the camera back to the cinematics.
const CAM = { on: false, yaw: 0, pitch: 0.3, dist: 10, T: new V(), preset: 'me' }, CAM_MIN = 2.5, CAM_MAX = 48, P_MIN = -0.12, P_MAX = 1.35;
const ptrs = new Map(); let pinch0 = 0;
const camAllowed = () => (S.phase === 'aim' || S.phase === 'wait') && !S.play && S.mode !== 'menu';
function camFrom(pos, look) {
  const d = pos.clone().sub(look); CAM.T.copy(look); CAM.dist = d.length(); CAM.yaw = Math.atan2(d.x, d.z); CAM.pitch = Math.asin(clamp(d.y / CAM.dist, -1, 1));
}
function camPreset(name) {
  const v = viewer(), fv = archers[v].f, en = archers[1 - v].root.position;
  if (name === 'side') { // the whole battlefield from the side, your archer on the left
    const hf = 2 * Math.atan(Math.tan(camera.fov * DEG / 2) * camera.aspect);
    CAM.T.set(0, 3.2, 0); CAM.dist = clamp((DIST + 6) / Math.tan(hf / 2), 14, CAM_MAX); CAM.yaw = fv > 0 ? 0 : Math.PI; CAM.pitch = 0.2;
  } else if (name === 'enemy') { // close on the enemy tower, from your side
    CAM.T.set(en.x, Math.max(1.6, en.y * 0.6 + 0.9), en.z); CAM.dist = camera.aspect < 0.9 ? 12 : 9.5; CAM.yaw = Math.atan2(-fv * 0.8, fv * 0.6); CAM.pitch = 0.32;
  } else { // behind my archer (the normal aim view), pivoting near the archer
    name = 'me'; const [cp, cl] = aimCam(), dir = cl.clone().sub(cp).normalize();
    camFrom(cp, cp.clone().addScaledVector(dir, 6));
  }
  CAM.preset = name; camClamp(); camBar();
}
function camClamp() { CAM.pitch = clamp(CAM.pitch, P_MIN, P_MAX); CAM.dist = clamp(CAM.dist, CAM_MIN, CAM_MAX); }
const _bb = new THREE.Box3();
function blockAt(p, pad = 0.45) { // a live tower block the point is inside (or too close to)
  for (const m of arena.blocks) {
    if (!m.visible || m.position.y < -20 || Math.abs(m.position.x - p.x) > 2.5 || Math.abs(m.position.z - p.z) > 2.5 || Math.abs(m.position.y - p.y) > 2.5) continue;
    if (_bb.setFromObject(m).expandByScalar(pad).containsPoint(p)) return _bb.clone();
  }
  return null;
}
function camPose() {
  camClamp();
  const c = Math.cos(CAM.pitch), p = CAM.T.clone().add(new V(Math.sin(CAM.yaw) * c, Math.sin(CAM.pitch), Math.cos(CAM.yaw) * c).multiplyScalar(CAM.dist));
  p.x = clamp(p.x, -60, 60); p.z = clamp(p.z, -60, 60);
  const gy = world.groundH(p.x, p.z) + 0.8; if (p.y < gy) p.y = gy; // never under the ground
  for (let k = 0, b; k < 60 && (b = blockAt(p)); k++) p.y = b.max.y + 0.05; // never inside a tower: rise over it
  return [p, CAM.T.clone()];
}
function camBar() {
  show('#camBar', CAM.on); $('#camBtn').classList.toggle('on', CAM.on);
  document.querySelectorAll('#camBar [data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === CAM.preset));
}
function camEnter() {
  if (!camAllowed() || CAM.on) return;
  drag = null; show('#aimTip', false); if (myTurn()) { S.draw = 0; preview.visible = false; archers[S.turn].pose(S.aim.pitch, 0, true, S.types[S.turn]); }
  CAM.on = true; ptrs.clear(); camPreset('me'); camBar(); updateHud();
}
function camExit(snap = true) { // back to the aim view (snaps to the default)
  if (!CAM.on) return;
  CAM.on = false; ptrs.clear(); if (snap) camJump = true; camBar(); updateHud();
}

// ---------- input (screen space, same for both players): drag UP/DOWN = higher/lower angle, RIGHT/LEFT = more/less power ----------
let drag = null, bdrag = null, lastCreak = 0, lastAimSend = 0;
const canvas = renderer.domElement;
const PITCH_MIN = 5, PITCH_MAX = 70, POW_MIN = 0.15, DEAD = 12; // degrees; px a drag must move before release fires (taps don't)
const lastAim = [{ pitch: 25, power: 0.6 }, { pitch: 25, power: 0.6 }]; // each archer's drag continues from their previous aim
function dragAim(dx, dy, from) { // dx/dy = pointer movement in px (screen y grows downward)
  const deg = clamp(from.pitch - dy / (0.45 * innerHeight) * (PITCH_MAX - PITCH_MIN), PITCH_MIN, PITCH_MAX);
  const power = clamp(from.power + dx / (0.6 * innerWidth) * (1 - POW_MIN), POW_MIN, 1);
  return { pitch: deg, power };
}
canvas.addEventListener('pointerdown', e => {
  sfx.unlock();
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch0 = 0;
  if (CAM.on) { canvas.setPointerCapture(e.pointerId); return; } // camera mode: gestures look around, never aim
  if (S.phase === 'build') { bdrag = { x: e.clientX, y: e.clientY, yaw: BS.yaw, moved: false }; canvas.setPointerCapture(e.pointerId); return; }
  if (!myTurn()) return;
  drag = { x: e.clientX, y: e.clientY, from: { ...lastAim[S.turn] }, moved: false }; canvas.setPointerCapture(e.pointerId);
});
function pinchStep() { // ratio of finger spread since the last move (>1 = fingers apart = zoom in)
  const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = pinch0 ? d / pinch0 : 1;
  pinch0 = d; return r;
}
canvas.addEventListener('pointermove', e => {
  const pt = ptrs.get(e.pointerId), px = pt ? pt.x : e.clientX, py = pt ? pt.y : e.clientY;
  if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
  if (CAM.on) {
    if (!pt) return;
    if (ptrs.size >= 2) CAM.dist /= pinchStep();
    else { CAM.yaw -= (e.clientX - px) / innerWidth * 3.4; CAM.pitch += (e.clientY - py) / innerHeight * 2.4; }
    camClamp(); if (CAM.preset !== 'free') { CAM.preset = 'free'; camBar(); }
    return;
  }
  if (S.phase === 'build' && ptrs.size >= 2) { BS.zoom = clamp(BS.zoom / pinchStep(), 0.6, 1.7); if (bdrag) bdrag.moved = true; return; } // build: pinch zooms
  if (bdrag && S.phase === 'build') { // drag = orbit the camera around your tower
    const dx = e.clientX - bdrag.x;
    if (bdrag.moved || Math.hypot(dx, e.clientY - bdrag.y) > DEAD) { bdrag.moved = true; BS.yaw = bdrag.yaw - dx / innerWidth * 3.2; }
    return;
  }
  if (!drag || !myTurn()) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < DEAD) return;
  drag.moved = true;
  const a = dragAim(dx, dy, drag.from), t = (a.power - POW_MIN) / (1 - POW_MIN);
  lastAim[S.turn] = a;
  S.draw = t; S.aim = { pitch: a.pitch * DEG, power: a.power };
  archers[S.turn].pose(S.aim.pitch, t, true, S.types[S.turn]);
  if (Math.abs(t - lastCreak) > 0.08) { sfx.creak(t); lastCreak = t; }
  $('#hint').textContent = '';
  const tip = $('#aimTip'); // readout next to the finger
  const L = S.last[S.turn];
  tip.innerHTML = `<b>${Math.round(a.power * 100)}%</b> · <i>${Math.round(a.pitch)}°</i>` + (L ? `<span class="gz">${gauge(powPct(a.power), powPct(L.power))}${gauge(angPct(a.pitch), angPct(L.pitch / DEG))}</span>` : '');
  Object.assign(tip.style, { left: `${clamp(e.clientX, 50, innerWidth - 50)}px`, top: `${Math.max(e.clientY - 34, 70)}px` });
  show('#aimTip', true);
  updatePreview();
  if (S.mode === 'online' && performance.now() - lastAimSend > 100) { lastAimSend = performance.now(); sock.emit('aim', { pitch: S.aim.pitch, draw: t }); }
});
const endDrag = e => {
  if (e) ptrs.delete(e.pointerId); pinch0 = 0;
  if (CAM.on) return;
  if (bdrag && ptrs.size) return; // still pinching
  if (bdrag) { const b = bdrag; bdrag = null; if (!b.moved && S.phase === 'build' && e && e.type === 'pointerup') buildTap(e.clientX, e.clientY); return; }
  if (!drag) return;
  const moved = drag.moved;
  drag = null; lastCreak = 0; show('#aimTip', false);
  if (myTurn() && moved) fire(); // release fires; a tap (inside the dead zone) does nothing
  else if (myTurn()) { S.draw = 0; preview.visible = false; archers[S.turn].pose(S.aim.pitch, 0, true); updateHud(); }
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => { // desktop zoom: camera mode, or the build view
  if (CAM.on) { e.preventDefault(); CAM.dist *= Math.exp(clamp(e.deltaY, -200, 200) * 0.0012); camClamp(); if (CAM.preset !== 'free') { CAM.preset = 'free'; camBar(); } }
  else if (S.phase === 'build') { e.preventDefault(); BS.zoom = clamp(BS.zoom * Math.exp(clamp(e.deltaY, -200, 200) * 0.001), 0.6, 1.7); }
}, { passive: false });
$('#camBtn').onclick = () => { sfx.unlock(); if (CAM.on) camExit(true); else camEnter(); };
$('#camDone').onclick = () => camExit(true);
document.querySelectorAll('#camBar [data-p]').forEach(b => b.onclick = () => { if (CAM.on) camPreset(b.dataset.p); });

// ---------- UI wiring ----------
for (const k of SPECIALS) { // extra ammo slots for earned specials (shown only while you hold one)
  const b = document.createElement('button'); b.dataset.t = k; b.className = 'special hidden';
  b.innerHTML = `${SPECIAL_UI[k].icon}<small>${SPECIAL_UI[k].label}</small><em>×0</em>`; $('#types').appendChild(b);
}
document.querySelectorAll('#types button').forEach(b => b.onclick = () => {
  if (!myTurn()) return;
  camExit(true); // picking an arrow = back to aiming
  S.types[S.turn] = b.dataset.t; archers[S.turn].pose(S.aim.pitch, 0, true, b.dataset.t); updateHud();
});
document.querySelectorAll('#arenas button').forEach(b => b.onclick = () => {
  S.arenaChoice = b.dataset.a;
  document.querySelectorAll('#arenas button').forEach(x => x.classList.toggle('on', x === b));
  if (b.dataset.a !== 'random') { setArena(b.dataset.a); S.arenaId = b.dataset.a; }
});
$('#hotBtn').onclick = () => { sfx.unlock(); startHot(); };
$('#createBtn').onclick = () => { sfx.unlock(); net().emit('create', { arena: S.arenaChoice, look: myLook(), best: S.seriesChoice }); $('#homeMsg').textContent = 'Creating room…'; };
$('#joinBtn').onclick = () => {
  sfx.unlock();
  const code = $('#codeIn').value.trim().toUpperCase();
  if (code.length < 4) { $('#homeMsg').textContent = 'Enter the 4-letter code'; return; }
  net().emit('join', { code, look: myLook() }); $('#homeMsg').textContent = 'Joining…';
};
$('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });
const roomLink = () => `${location.origin}/?room=${$('#code').textContent}`;
function copyText(t) { // clipboard API, falling back to a hidden textarea
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
  const ta = Object.assign(document.createElement('textarea'), { value: t }); document.body.appendChild(ta); ta.select();
  const ok = document.execCommand('copy'); ta.remove(); return ok ? Promise.resolve() : Promise.reject();
}
$('#shareBtn').onclick = () => {
  const url = roomLink(), done = t => { $('#shareBtn').textContent = t; setTimeout(() => { $('#shareBtn').textContent = 'Share link'; }, 1800); };
  if (navigator.share) navigator.share({ title: 'Archery Duel', text: 'Duel me in Archery Duel!', url }).catch(() => {});
  else copyText(url).then(() => done('Link copied!'), () => { $('#lobbyMsg').textContent = url; });
};
$('#seriesBtns').onclick = e => { const v = +e.target.dataset.s; if (!v) return; S.seriesChoice = v; document.querySelectorAll('#seriesBtns button').forEach(b => b.classList.toggle('on', +b.dataset.s === v)); };
$('#copyBtn').onclick = () => {
  const code = $('#code').textContent;
  (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => { $('#copyBtn').textContent = 'Copied!'; }, () => { $('#copyBtn').textContent = `Code: ${code}`; });
  setTimeout(() => { $('#copyBtn').textContent = 'Copy code'; }, 1500);
};
function cancelLobby() { if (sock) sock.emit('leave'); show('#lobby', false); show('#home', true); $('#homeMsg').textContent = ''; }
// ---------- panels + history: every panel has a Back (←); Android/browser back closes the top panel ----------
let helpFrom = null;
function openHelp() { helpFrom = ['#menu', '#home'].find(s => !$(s).classList.contains('hidden')) || null; if (helpFrom) show(helpFrom, false); openPanel('#help'); }
function closeHelp() { show('#help', false); if (helpFrom) show(helpFrom, true); helpFrom = null; }
const BACK = { '#help': closeHelp, '#custom': () => closeCustom(), '#menu': () => show('#menu', false), '#notice': goHome, '#over': goHome, '#lobby': cancelLobby };
const topPanel = () => Object.keys(BACK).find(s => !$(s).classList.contains('hidden'));
function openPanel(sel) { show(sel, true); const pb = $(sel + ' .pb'); if (pb) pb.scrollTop = 0; history.pushState({ ad3t: sel }, ''); }
function runBack() {
  const top = topPanel();
  if (top) BACK[top]();
  else if (S.mode !== 'menu' && S.phase !== 'menu') openPanel('#menu'); // back during a match opens the menu
}
let skipPop = 0;
function uiBack() { runBack(); if (history.state && history.state.ad3t) { skipPop++; history.back(); } }
addEventListener('popstate', () => { if (skipPop) { skipPop--; return; } runBack(); });
$('#cancelBtn').onclick = uiBack;
$('#menuBtn').onclick = () => ($('#menu').classList.contains('hidden') ? openPanel('#menu') : uiBack());
$('#close').onclick = uiBack; $('#resume').onclick = uiBack;
$('#helpBtn').onclick = $('#helpBtn2').onclick = openHelp;
$('#helpBack').onclick = uiBack; $('#helpOk').onclick = uiBack;
$('#restart').onclick = () => startHot(S.arenaId);
$('#homeBtn').onclick = goHome;
$('#overHome').onclick = uiBack; $('#overBack').onclick = uiBack;
$('#noticeBtn').onclick = uiBack; $('#noticeBack').onclick = uiBack;
// ---------- visible viewport (browser bars, keyboard) -> --vh; full screen; install (PWA) ----------
function setVH() {
  const vv = window.visualViewport, st = document.documentElement.style;
  st.setProperty('--vh', `${Math.round(vv ? vv.height : innerHeight)}px`); st.setProperty('--vt', `${Math.round(vv ? vv.offsetTop : 0)}px`);
}
setVH(); addEventListener('resize', setVH); if (window.visualViewport) { visualViewport.addEventListener('resize', setVH); visualViewport.addEventListener('scroll', setVH); }
const docEl = document.documentElement;
const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const fsOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(docEl.requestFullscreen || docEl.webkitRequestFullscreen);
document.body.classList.toggle('nofs', !fsOK); // e.g. iPhone Safari: no Fullscreen API for pages
function toggleFs() {
  try {
    if (fsOn()) return Promise.resolve((document.exitFullscreen || document.webkitExitFullscreen).call(document)).catch(() => {});
    return Promise.resolve((docEl.requestFullscreen || docEl.webkitRequestFullscreen).call(docEl, { navigationUI: 'hide' })).then(() => {
      // keep landscape players in landscape; never force portrait players to rotate
      if (innerWidth > innerHeight && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }).catch(() => {});
  } catch { return Promise.resolve(); }
}
function fsChanged() {
  document.querySelectorAll('.fsBtn').forEach(b => { b.classList.toggle('on', fsOn()); b.setAttribute('aria-label', fsOn() ? 'Exit full screen' : 'Full screen'); });
  setVH(); updateInstall();
}
document.querySelectorAll('.fsBtn').forEach(b => { b.onclick = () => { sfx.unlock(); toggleFs(); }; });
document.addEventListener('fullscreenchange', fsChanged); document.addEventListener('webkitfullscreenchange', fsChanged);
let installEvt = null;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || (matchMedia('(display-mode: fullscreen)').matches && !fsOn()) || navigator.standalone === true;
function updateInstall() { show('#installBtn', !installed()); if (installed()) show('#installTip', false); }
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; updateInstall(); });
addEventListener('appinstalled', () => { installEvt = null; show('#installBtn', false); show('#installTip', false); });
$('#installBtn').onclick = () => {
  if (installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; updateInstall(); }); return; }
  $('#installTip').textContent = isIOS ? 'Tap Share (the square with an arrow) → Add to Home Screen.' : 'Open your browser menu (⋮) → Install app / Add to Home screen.';
  show('#installTip', true);
};
updateInstall();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
$('#muteBtn').onclick = () => { sfx.setMuted(!sfx.isMuted()); updateHud(); };
$('#rematch').onclick = () => {
  if (S.mode === 'hot') return startHot(S.arenaId, 1 - S.seriesWinner);
  sock.emit('rematch'); $('#rematch').disabled = true; $('#overMsg').textContent = 'Waiting for opponent…';
};

// ---------- networking ----------
let sock = null;
function net() {
  if (sock) return sock;
  sock = window.io();
  sock.on('created', ({ code, best }) => {
    $('#code').textContent = code; $('#lobbyBest').textContent = best > 1 ? `Best of ${best}` : 'Single match';
    show('#home', false); openPanel('#lobby');
  });
  sock.on('joinError', msg => { show('#lobby', false); show('#home', true); $('#homeMsg').textContent = autoJoin ? `Couldn't join room ${autoJoin}: ${msg}.` : msg; autoJoin = null; });
  sock.on('start', ({ arena: id, you, st, turn, wind, looks: ls, best, score, colors }) => {
    autoJoin = null;
    const m = { arenaId: id, mode: 'online', me: you, st, turn, wind, looks: ls, best, score, colors };
    if (S.mode === 'online' && (S.play || S.cardT > 0)) S.pending = m; else startMatch(m); // let the last shot and round card finish first
  });
  sock.on('build', m => { autoJoin = null; enterBuild({ arenaId: m.arena, mode: 'online', me: m.you, turn: m.turn, looks: m.looks, best: m.best, score: m.score, time: m.time }); });
  sock.on('buildError', ({ err, late }) => { S.lastBuildErr = err; if (S.phase !== 'build' || late) return; BS.sent = false; buildMsg(err, true); renderBuildUi(); });
  sock.on('planOk', ({ ready }) => { if (ready && S.phase === 'build') { BS.locked = true; renderBuildUi(); } });
  sock.on('oppReady', () => { BS.oppReady = true; renderBuildUi(); });
  sock.on('aim', a => { if (S.mode === 'online' && S.phase === 'aim' && S.turn !== S.me) archers[S.turn].pose(a.pitch, a.draw, true, S.types[S.turn]); });
  sock.on('shot', m => { if (S.mode === 'online') playShot(m); });
  sock.on('rematchAsk', () => { $('#overMsg').textContent = 'Opponent wants a rematch!'; });
  sock.on('opponentLeft', () => notice('Opponent left'));
  sock.on('disconnect', () => notice('Connection lost'));
  return sock;
}
addEventListener('pagehide', () => { if (sock && S.mode === 'online') sock.emit('leave'); });

// ---------- build phase (once per match / series): place up to BUILD_MAX blocks on/around your tower + move your archer ----------
// The plan ({ blocks: grid cells in order, archer: grid spot }) is validated by the same pure validateBuild() the server runs.
const BS = { side: 0, tool: 'block', plans: [defaultPlan(), defaultPlan()], hist: [[], []], res: [null, null], ghost: null, yaw: 0, online: false, ends: 0, locked: false, sent: false, oppReady: false, m: null, msg: '', err: false, secs: -1 };
const TX = s => (s ? DIST : -DIST);
const EMPTY = [0, 1].map(i => validateBuild(i, defaultPlan()));
const ghostMats = { ok: noOutline(new THREE.MeshBasicMaterial({ color: 0x5ee05a, transparent: true, opacity: 0.5, depthWrite: false })), bad: noOutline(new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.45, depthWrite: false })) };
const ghost = new THREE.Mesh(new THREE.BoxGeometry(CELL, CELL, CELL), ghostMats.ok);
ghost.add(new THREE.LineSegments(new THREE.EdgesGeometry(ghost.geometry), noOutline(new THREE.LineBasicMaterial({ color: 0xffffff }))));
ghost.visible = false; ghost.renderOrder = 5; scene.add(ghost);
const spotRing = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 28).rotateX(-Math.PI / 2), noOutline(new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false })));
spotRing.visible = false; spotRing.renderOrder = 5; scene.add(spotRing);
const buildGrid = new THREE.GridHelper(CELL * 6, 6, 0xffffff, 0xffffff); // the snap grid on the ground around your tower
buildGrid.material.transparent = true; buildGrid.material.opacity = 0.55; buildGrid.material.depthWrite = false; buildGrid.visible = false; scene.add(buildGrid);
const colHeight = (plan, gx, gz) => plan.blocks.reduce((n, c) => n + (c[0] === gx && c[1] === gz ? 1 : 0), 0);
function withBlock(s, plan, cell) { // add a block on top of that column; if it lands under the archer, the archer climbs on top of it
  const c = [cell[0], cell[1], colHeight(plan, cell[0], cell[1])], before = BS.res[s] && BS.res[s].ok ? BS.res[s].archer[1] : 0;
  const colors = [...(plan.colors || plan.blocks.map(() => DEFAULT_BLOCK)), BS.color || DEFAULT_BLOCK]; // v5.3: the selected colour goes on the new block
  let next = { blocks: [...plan.blocks, c], colors, archer: plan.archer }, r = validateBuild(s, next), climbed = false;
  if ((!r.ok && r.at < 0) || (r.ok && r.archer[1] > before + 1e-6)) { // the archer's spot rose (or became unstable): step onto the new block's centre
    const up = { blocks: next.blocks, colors, archer: [2 * c[0] + 1, 2 * c[1] + 1] }, r2 = validateBuild(s, up);
    if (r2.ok) { next = up; r = r2; climbed = true; }
  }
  return { next, r, climbed };
}
function enterBuild(m) {
  setLooks(m.looks || [loadLook(0), loadLook(1)]);
  if (m.arenaId !== S.arenaId || !world) setArena(m.arenaId);
  for (const a of stuck) a.removeFromParent();
  stuck.length = 0;
  for (const f of fading) f.o.removeFromParent();
  fading.length = 0;
  clearAnims(); resetVictoryPose();
  const st = newRound(Math.random), hot = m.mode === 'hot';
  Object.assign(S, { mode: m.mode, me: m.me || 0, turn: m.turn || 0, hp: [...st.hp], st, wind: { x: 0, z: 0 }, arenaId: m.arenaId, phase: hot ? 'pass' : 'build', winner: -1, play: null, queue: [], focus: null, draw: 0,
    best: m.best || 1, score: [...(m.score || [0, 0])], seriesWinner: -1, pending: null, cardT: 0, builds: null });
  pickupKey = '-'; showPickup(null, false); S.last = [null, null]; camExit(true);
  Object.assign(BS, { zoom: 1, side: hot ? 0 : S.me, tool: 'block', plans: [defaultPlan(), defaultPlan()], hist: [[], []], ghost: null, yaw: 0, online: !hot, ends: performance.now() + (m.time || BUILD_TIME) * 1000,
    locked: false, sent: false, oppReady: false, m, msg: '', err: false, secs: -1, color: towerColor(hot ? 0 : S.me) });
  BS.res = [0, 1].map(i => validateBuild(i, BS.plans[i]));
  archers.forEach((a, i) => a.pose(0.5, 0, true, 'normal'));
  ['#home', '#lobby', '#over', '#menu', '#notice', '#help', '#custom', '#hud', '#bottom', '#pip', '#roundCard', '#aimTip'].forEach(x => show(x, false));
  ['#menuBtn', '#fsGame'].forEach(x => show(x, true));
  if (!(history.state && history.state.ad3t)) history.pushState({ ad3t: 'game' }, '');
  show('#restart', hot); $('#homeBtn').textContent = hot ? 'Main menu' : 'Leave room';
  camJump = true;
  if (hot) showPass(0); else { show('#build', true); buildMsg(HINT); }
  renderBuild();
  if (window.__game.autoSkip || window.__autoSkip) setTimeout(legacySkip, 0); // regression suites: the classic towers, no building
}
function towerColor(s) { const c = looks[s] && looks[s].tower; return isBlockColor(c) ? c : DEFAULT_BLOCK; } // starting colour = the player's Customise default
function legacySkip() {
  if (S.phase !== 'pass' && S.phase !== 'build') return;
  if (!BS.online) return quickHot(S.arenaId, BS.m.turn);
  BS.sent = true; sock.emit('plan', { plan: { classic: true }, ready: true }); renderBuild();
}
function endBuildUi() { show('#build', false); show('#pass', false); ghost.visible = false; spotRing.visible = false; buildGrid.visible = false; bdrag = null; }
function showPass(k) { // hot-seat privacy card: the player who isn't building looks away
  S.phase = 'pass'; BS.side = k; BS.ghost = null; show('#build', false); renderBuild();
  const a = nameOf(k), b = nameOf(1 - k);
  $('#passTitle').textContent = k ? `Pass to ${a}` : 'Build phase';
  $('#passText').innerHTML = '';
  $('#passText').append(k ? `${b} is done. ${a}: your turn to build. ${b}, no peeking!` : `Build your tower from the ground up: ${BUILD_MAX} blocks, ${BUILD_TIME} s each. ${a} builds first. ${b}, look away!`);
  $('#passGo').textContent = `${a}: build`;
  show('#passSkip', !k);
  openPanel('#pass');
}
const HINT = 'Tap the grid to place · tap again to stack';
$('#passGo').onclick = () => { // hot-seat: this player's 60 s starts now
  show('#pass', false); S.phase = 'build'; BS.yaw = 0; BS.tool = 'block'; BS.color = towerColor(BS.side); BS.ends = performance.now() + BUILD_TIME * 1000; BS.secs = -1; camJump = true;
  show('#build', true); buildMsg(HINT); renderBuild();
};
const autoRes = s => validateBuild(s, autoPlan(s, towerColor(s))); // auto / quick-play towers use each player's tower colour
$('#passSkip').onclick = () => quickHot(S.arenaId, BS.m.turn, [autoRes(0), autoRes(1)]); // quick play: both get the ready-made 30-block tower
function buildMsg(t, err = false) { BS.msg = t; BS.err = err; const el = $('#bMsg'); el.textContent = t; el.classList.toggle('err', err); }
function renderBuild() { // 3D: your own build (the other side stays hidden until the match starts)
  const s = BS.side, vis = [0, 1].map(i => (i === s && S.phase === 'build' ? BS.res[i] : EMPTY[i])), ph = initialPhys(vis); // the other side stays bare ground
  arena.setBuildColors(vis.map(r => (r && r.colors) || null)); arena.resetBlocks(ph.b); placeArchers(ph.a);
  const g = BS.ghost;
  ghost.visible = !!(g && g.pos && S.phase === 'build');
  if (ghost.visible) { ghost.position.set(...g.pos); ghost.material = g.ok ? ghostMats.ok : ghostMats.bad; }
  spotRing.visible = S.phase === 'build' && BS.tool === 'archer';
  buildGrid.visible = S.phase === 'build' && BS.tool === 'block' && !(BS.locked || BS.sent); buildGrid.position.set(TX(s), 0.03, 0);
  if (spotRing.visible) spotRing.position.set(ph.a[s][0], ph.a[s][1] + 0.03, ph.a[s][2]);
  renderBuildUi();
}
function renderBuildUi() {
  const s = BS.side, plan = BS.plans[s], lock = BS.locked || BS.sent;
  $('#bTitle').textContent = BS.online ? 'Build your tower' : `${nameOf(s)}: build`;
  $('#bTitle').style.background = css(cols[s]);
  $('#bCount').textContent = `▦ ${plan.blocks.length}/${BUILD_MAX}`;
  $('#bUndo').disabled = lock || !BS.hist[s].length;
  $('#bConfirm').classList.toggle('hidden', !(BS.ghost && BS.ghost.ok) || lock);
  document.querySelectorAll('#bTool button').forEach(b => { b.classList.toggle('on', b.dataset.tool === BS.tool); b.disabled = lock; });
  $('#bReady').textContent = BS.online ? (lock ? 'Waiting…' : 'Ready') : s ? 'Fight!' : 'Done';
  $('#bReady').disabled = lock; $('#bSkip').disabled = lock;
  document.querySelectorAll('#bColors button').forEach(b => { b.classList.toggle('on', b.dataset.c === BS.color); b.setAttribute('aria-checked', b.dataset.c === BS.color); b.disabled = lock; });
  $('#bOpp').textContent = BS.online ? (BS.oppReady ? 'Opponent ready ✓' : 'Opponent building…') : '';
  show('#bOpp', BS.online);
  if (lock && BS.online) buildMsg(BS.oppReady ? 'Starting…' : 'Locked in. Waiting for your opponent…');
}
function setPlan(next, r) { // apply a validated change (undoable); online the server gets every change privately
  const s = BS.side;
  BS.hist[s].push(clone(BS.plans[s])); BS.plans[s] = next; BS.res[s] = r; BS.ghost = null;
  if (BS.online && sock) sock.emit('plan', { plan: next, ready: false });
  renderBuild();
}
function buildTry(cell) {
  const s = BS.side, plan = BS.plans[s];
  if (S.phase !== 'build' || BS.locked || BS.sent) return false;
  if (plan.blocks.length >= BUILD_MAX) { buildMsg('No blocks left (Undo to take one back)', true); return false; }
  const { next, r, climbed } = withBlock(s, plan, cell);
  if (!r.ok) { buildMsg(r.at < 0 ? 'That would bury your archer' : r.err, true); return false; }
  setPlan(next, r); sfx.thunk(); buildMsg(`${climbed ? 'Archer climbed up' : 'Block placed'} · ${BUILD_MAX - next.blocks.length} left · tap again to stack`);
  if (next.blocks.length < BUILD_MAX) { const w = withBlock(s, next, cell); if (w.r.ok) { BS.ghost = { cell, ok: true, pos: w.r.blocks.at(-1) }; renderBuild(); } }
  return true;
}
function buildArcherTry(spot) {
  const s = BS.side, plan = BS.plans[s];
  if (S.phase !== 'build' || BS.locked || BS.sent) return false;
  const next = { ...plan, archer: spot }, r = validateBuild(s, next);
  if (!r.ok) { buildMsg(r.err, true); return false; }
  setPlan(next, r); buildMsg('Archer moved'); return true;
}
function setGhost(cell) {
  const s = BS.side, plan = BS.plans[s];
  if (plan.blocks.length >= BUILD_MAX) { BS.ghost = null; buildMsg('No blocks left (Undo to take one back)', true); renderBuild(); return; }
  const { r, climbed } = withBlock(s, plan, cell);
  BS.ghost = { cell, ok: r.ok, pos: r.ok ? r.blocks.at(-1) : r.pos || null };
  buildMsg(r.ok ? (climbed ? 'Archer will stand on it · tap again or Place' : 'Tap again or press Place') : r.at < 0 ? 'That would bury your archer' : r.err, !r.ok);
  renderBuild();
}
const _ray = new THREE.Raycaster(), _ground = new THREE.Plane(new V(0, 1, 0), 0);
function buildPick(x, y) { // what's under the finger: one of your blocks (point + face normal), else the ground
  _ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const s = BS.side, meshes = arena.blocks.filter((m, i) => LAYOUT[i].s === s && m.visible), hit = _ray.intersectObjects(meshes, false)[0];
  if (hit) return { p: hit.point, n: hit.face.normal.clone().transformDirection(hit.object.matrixWorld), block: arena.blocks.indexOf(hit.object) };
  const p = _ray.ray.intersectPlane(_ground, new V());
  return p && { p, n: new V(0, 1, 0), block: -1 };
}
function buildTap(x, y) {
  if (BS.locked || BS.sent) return;
  const pick = buildPick(x, y), s = BS.side;
  if (!pick) return;
  const { p, n } = pick;
  if (BS.tool === 'archer') {
    if (n.y < 0.5) { buildMsg('Tap the ground or the top of a block', true); return; }
    buildArcherTry([Math.round((p.x - TX(s)) / 0.4), Math.round(p.z / 0.4)]); return;
  }
  const q = p.clone().addScaledVector(n, 0.2); // top face: the column you tapped; side face: the neighbouring column
  const cell = [Math.floor((q.x - TX(s)) / CELL), Math.floor(q.z / CELL)], g = BS.ghost;
  if (g && g.ok && g.cell[0] === cell[0] && g.cell[1] === cell[1]) { buildTry(cell); return; } // second tap on the same spot places it
  setGhost(cell);
}
function buildCam() {
  const s = BS.side, f = s ? -1 : 1, portrait = camera.aspect < 0.9, res = BS.res[s];
  const h = res && res.ok ? Math.max(res.archer[1], ...res.blocks.map(b => b[1] + CELL / 2)) : 0; // framing follows your tower as it grows
  const z = BS.zoom || 1, R = ((portrait ? 7.6 : 7.4) + h * 0.4) * z, a = Math.atan2(f * 0.85, 1) + BS.yaw, T = new V(TX(s), (portrait ? 0.9 : 0.6) + h * 0.55, 0);
  return [T.clone().add(new V(Math.sin(a) * R, ((portrait ? 5.4 : 3.8) + h * 0.3) * z, Math.cos(a) * R)), T]; // high 3/4 view of your whole build zone
}
function buildTick() { // 60 s per build (hot-seat: per player; online: both at once, enforced by the server). At 0 the build locks as it is
  const secs = Math.max(0, Math.ceil((BS.ends - performance.now()) / 1000));
  if (secs === BS.secs) return;
  BS.secs = secs; $('#bTimer').textContent = `⏱ ${secs}s`; $('#bTimer').classList.toggle('low', secs <= 10);
  if (secs === 0 && !BS.locked && !BS.sent) {
    BS.ghost = null; buildMsg("Time's up!");
    if (!BS.online) return finishHotBuild(false); // hot-seat: lock whatever was placed and move on
    BS.locked = true; renderBuild();
  }
}
$('#bUndo').onclick = () => {
  const s = BS.side;
  if (S.phase !== 'build' || BS.locked || BS.sent || !BS.hist[s].length) return;
  BS.plans[s] = BS.hist[s].pop(); BS.res[s] = validateBuild(s, BS.plans[s]); BS.ghost = null;
  if (BS.online && sock) sock.emit('plan', { plan: BS.plans[s], ready: false });
  buildMsg('Undone'); renderBuild();
};
document.querySelectorAll('#bTool button').forEach(b => b.onclick = () => {
  BS.tool = b.dataset.tool; BS.ghost = null;
  buildMsg(BS.tool === 'archer' ? 'Tap the ground or a block top to move your archer' : HINT); renderBuild();
});
$('#bColors').innerHTML = BLOCK_COLORS.map(c => `<button data-c="${c.id}" role="radio" aria-label="${c.name} blocks" title="${c.name}" style="background-color:${css(c.hex)}"></button>`).join('');
function pickColor(id) { // v5.3: colour for the next blocks you place (blocks already placed keep theirs)
  if (S.phase !== 'build' || BS.locked || BS.sent || !isBlockColor(id)) return false;
  BS.color = id; buildMsg(`${BLOCK_COLORS.find(c => c.id === id).name} blocks`); renderBuildUi(); return true;
}
$('#bColors').onclick = e => { const b = e.target.closest('button'); if (b) pickColor(b.dataset.c); };
$('#bConfirm').onclick = () => { if (BS.ghost && BS.ghost.ok) buildTry(BS.ghost.cell); };
$('#bRot').onclick = () => { BS.yaw += Math.PI / 2; };
function finishHotBuild(auto) {
  if (auto) { BS.plans[BS.side] = autoPlan(BS.side, towerColor(BS.side)); BS.res[BS.side] = autoRes(BS.side); }
  if (BS.side === 0) return showPass(1);
  quickHot(S.arenaId, BS.m.turn, [BS.res[0], BS.res[1]]);
}
$('#bReady').onclick = () => {
  if (S.phase !== 'build' || BS.locked || BS.sent) return;
  if (!BS.online) return finishHotBuild(false);
  BS.sent = true; BS.ghost = null; sock.emit('plan', { plan: BS.plans[BS.side], ready: true }); renderBuild();
};
$('#bSkip').onclick = () => { // auto-build: the ready-made 30-block tower, locked in
  if (S.phase !== 'build' || BS.locked || BS.sent) return;
  if (!BS.online) return finishHotBuild(true); // hot-seat: this player gets the auto tower; the other still gets to build
  BS.plans[BS.side] = autoPlan(BS.side, towerColor(BS.side)); BS.res[BS.side] = validateBuild(BS.side, BS.plans[BS.side]); BS.sent = true; BS.ghost = null;
  sock.emit('plan', { plan: BS.plans[BS.side], ready: true }); renderBuild();
};

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
    const nm = document.createElement('span'); nm.textContent = nameOf(i);
    $(`#hp${i} .num`).replaceChildren(nm, ` ${S.hp[i]}`); // long names get an ellipsis, HP always shows
    $(`#hp${i} .you`).classList.toggle('hidden', !(online && i === S.me));
  });
  $('#turn').textContent = online && S.turn === S.me ? 'Your turn' : `${nameOf(S.turn)}'s turn`;
  $('#turn').style.background = css(cols[S.turn]);
  show('#score', S.best > 1);
  if (S.best > 1) { $('#score .n0').textContent = nameOf(0); $('#score .n1').textContent = nameOf(1); $('#score b').textContent = `${S.score[0]} - ${S.score[1]}`; }
  const along = S.wind.x * archers[S.turn].f, w = Math.abs(S.wind.x); // wind is only ever along the shot line
  $('#windNum').textContent = w < 0.05 ? 'Calm' : `${along > 0 ? 'Tail' : 'Head'} ${w.toFixed(1)}`;
  $('#windNum').style.color = w < 0.05 ? '' : along > 0 ? '#2f9a22' : '#d0251c'; // tail helps (green), head hurts (red)
  $('#windFlag').style.transform = `scaleX(${S.wind.x * archers[viewer()].f >= 0 ? 1 : -1})`; // flag points away from you = blowing toward the enemy
  const mine = myTurn();
  show('#types', mine);
  let specials = 0;
  document.querySelectorAll('#types button').forEach(b => {
    b.classList.toggle('on', b.dataset.t === S.types[S.turn]);
    if (!b.classList.contains('special')) return;
    const n = (S.st.ammo[S.turn] || {})[b.dataset.t] || 0;
    b.classList.toggle('hidden', n <= 0); b.querySelector('em').textContent = `×${n}`; specials += n > 0;
  });
  $('#types').classList.toggle('many', specials > 0);
  $('#hint').textContent = CAM.on ? 'Drag to look around · pinch or wheel to zoom' : S.phase === 'aim' && S.draw === 0 ? (mine ? 'Drag ↑↓ angle · ←→ power · release to shoot' : 'Opponent is aiming…') : '';
  $('#muteBtn').textContent = `Sound: ${sfx.isMuted() ? 'off' : 'on'}`;
}

// ---------- camera ----------
const camPos = new V(), camLook = new V();
let camJump = true;
function camTarget(t) {
  if (S.phase === 'menu') { const a = t * 0.06 + 1.2; return [new V(Math.cos(a) * 30, 17, Math.sin(a) * 30), new V(0, 4, 0)]; }
  if (S.phase === 'build' || S.phase === 'pass') return buildCam();
  const v = viewer(), fv = archers[v].f;
  let lead = S.play ? playLead() : null, focus = lead ? lead.m.getWorldPosition(new V()) : S.phase === 'over' ? S.focus : null;
  if (S.play && S.play.focus) focus = S.play.focus;
  if (focus) {
    const fs = S.play ? archers[S.play.m.shooter].f : fv, P = S.play;
    if (P && !P.arrows.some(x => !x.landed)) { // impact: pull back so the whole tower (and anyone falling) is in shot
      const f = new V(focus.x, clamp(focus.y, 2.2, 4), 0), por = camera.aspect < 0.9 ? 1.5 : 1;
      return [f.clone().add(new V(-5.5 * fs * por, 3.2 * por, 10.5 * fv * por)), f.clone().add(new V(0, -0.6, 0))];
    }
    return [focus.clone().add(new V(-3 * fs, 2.2, 5.5 * fv)), focus.clone().add(new V(1.5 * fs, 0, 0))];
  }
  if (CAM.on) return camPose();
  return aimCam();
}
function aimCam() {
  const v = viewer(), fv = archers[v].f;
  const a = archers[v].root.position, portrait = camera.aspect < 0.9; // close over-the-shoulder view, archer big in the lower left
  const [cp, cl] = portrait ? [a.clone().add(new V(-3.45 * fv, 2.95, 1.5 * fv)), a.clone().add(new V(10 * fv, 0.06, -1.85 * fv))]
                            : [a.clone().add(new V(-5.1 * fv, 2.9, 2.3 * fv)), a.clone().add(new V(10 * fv, 0.78, -0.9 * fv))];
  const low = clamp(5 - a.y, 0, 5); // fallen archer: higher, further-back camera looking down over the rubble and props
  if (low > 0.3) { cp.y += low * 0.9; cp.x -= fv * low * 0.5; cl.y -= low * 0.5; }
  const top = Math.max(stoneTopNear(cp.x, cp.z), stoneTopNear((cp.x + a.x) / 2, (cp.z + a.z) / 2)); // after a fall the archer may stand inside a broken shell: keep the camera above the stones
  if (cp.y < top + 0.9) { const lift = top + 0.9 - cp.y; cp.y += lift; cp.addScaledVector(new V(-fv, 0, 0), lift * 0.4); }
  return [cp, cl];
}
const _ab = new V(), _ap = new V(), _chest = new V();
function fadeTo(mt, want, dt) {
  const o = mt.opacity + (want - mt.opacity) * Math.min(1, dt * 8);
  if (o === want && mt.opacity === want) return;
  mt.opacity = Math.abs(o - want) < 0.01 ? want : o; const tr = mt.opacity < 0.99;
  if (mt.transparent !== tr) { mt.transparent = tr; mt.depthWrite = !tr; mt.needsUpdate = true; }
}
function fadeOccluders(dt) { // stones between the camera and your archer (e.g. after a fall), and trees in front of the action, turn see-through
  const on = (S.phase === 'aim' || S.phase === 'wait') && !CAM.on;
  _ab.subVectors(camLook, camera.position); const LL = _ab.lengthSq();
  for (const t of arena.fadeTrees || []) {
    const k = _ap.subVectors(t.c, camera.position).dot(_ab) / LL;
    const want = k > 0 && k < 0.97 && _ap.addScaledVector(_ab, -k).length() < t.r + 0.6 ? 0.22 : 1;
    for (const mt of t.mats) fadeTo(mt, want, dt);
  }
  _chest.copy(archers[viewer()].root.position).y += 1;
  _ab.subVectors(_chest, camera.position); const L2 = _ab.lengthSq();
  for (const m of arena.blocks) {
    let want = 1;
    if (on) {
      const t = _ap.subVectors(m.position, camera.position).dot(_ab) / L2;
      if (t > 0.02 && t < 0.95 && _ap.addScaledVector(_ab, -t).lengthSq() < 1.3) want = 0.28;
    }
    fadeTo(m.material, want, dt);
  }
}
function stoneTopNear(x, z) { let t = -1; for (const m of arena.blocks) if (Math.abs(m.position.x - x) < 1.6 && Math.abs(m.position.z - z) < 1.6) t = Math.max(t, m.position.y + 0.5); return t; }
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
let time = 0, fpsN = 0, fpsT0 = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  time += dt;
  if (S.play) updatePlay(dt);
  tickAnims(dt);
  if (pickupObj) { const u = pickupObj.userData; u.tick(time); if (u.pop < 1) { u.pop = Math.min(1, u.pop + dt * 2.5); pickupObj.scale.setScalar(PICKUP_SCALE * Math.max(0.01, Math.sin(u.pop * Math.PI * 0.75) / Math.sin(Math.PI * 0.75))); } }
  for (let i = fading.length - 1; i >= 0; i--) { const f = fading[i]; f.t -= dt * 0.7; f.o.scale.setScalar(Math.max(0.01, f.t)); if (f.t <= 0) { f.o.removeFromParent(); fading.splice(i, 1); } }
  fpsN++; if (time - fpsT0 >= 1) { S.fps = fpsN / (time - fpsT0); fpsN = 0; fpsT0 = time; }
  if (S.cardT > 0) S.cardT -= dt;
  if (S.phase === 'build') buildTick();
  if (S.pending && !S.play && S.cardT <= 0) { const p = S.pending; S.pending = null; startMatch(p); }
  if (flashT > 0 && (flashT -= dt) <= 0 && !drag) $('#readout').textContent = '';
  arena.update(dt, time, S.phase === 'menu' ? { x: 1.5, z: 0.5 } : S.wind, camera.position, sfx);
  if (CAM.on && !camAllowed()) camExit(false); // a shot / round end: the cinematics take over
  show('#camBtn', camAllowed() && !$('#hud').classList.contains('hidden'));
  if (S.phase !== 'menu' && world) updateGuide();
  const [tp, tl] = camTarget(time), k = camJump ? 1 : 1 - Math.exp(-dt * (S.phase === 'fly' ? 10 : 4.5));
  camPos.lerp(tp, k); camLook.lerp(tl, k); camJump = false;
  camera.position.copy(camPos); camera.lookAt(camLook);
  if (S.phase !== 'build') fadeOccluders(dt);
  if (shake > 0.002) { camera.position.add(new V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake)); shake *= Math.exp(-dt * 7); }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; f.p.y += dt * 0.7;
    const s = f.p.clone().project(camera);
    Object.assign(f.el.style, { left: `${(s.x + 1) / 2 * innerWidth}px`, top: `${(1 - s.y) / 2 * innerHeight}px`, opacity: String(Math.max(0, 1 - f.t / 1.4)) });
    if (f.t > 1.4) { f.el.remove(); floats.splice(i, 1); }
  }
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  effect.render(scene, camera);
  let pip = (S.phase === 'aim' || S.phase === 'wait') && !CAM.on;
  if (pip && pickupObj) { // never let the opponent inset cover the power-up
    const q = pickupObj.position.clone().project(camera), r = pipRect(), x = (q.x + 1) / 2 * innerWidth, y = (1 - q.y) / 2 * innerHeight;
    if (q.z < 1 && x > r.x - 40 && x < r.x + r.w + 40 && y > r.y - 50 && y < r.y + r.h + 40) pip = false;
  }
  show('#pip', pip);
  if (pip) { // picture-in-picture of the opponent
    const o = archers[1 - viewer()], r = pipRect(), fv = archers[viewer()].f;
    pipCam.position.copy(o.root.position).add(new V(4.4 * o.f, 2.4, 0.6 * fv));
    pipCam.lookAt(o.root.position.clone().add(new V(0, 1.05, 0)));
    $('#pip span').textContent = nameOf(1 - viewer()); $('#pip span').style.background = css(cols[1 - viewer()]);
    renderer.setScissorTest(true);
    renderer.setViewport(r.x, innerHeight - r.y - r.h, r.w, r.h); renderer.setScissor(r.x, innerHeight - r.y - r.h, r.w, r.h);
    effect.render(scene, pipCam);
    renderer.setScissorTest(false);
  }
  if (!$('#custom').classList.contains('hidden')) drawPreview();
  requestAnimationFrame(frame);
}
setArena('field');
let autoJoin = null; // ?room=CODE links join straight away (with the saved look)
{
  const q = new URLSearchParams(location.search).get('room');
  if (q !== null) {
    history.replaceState(null, '', location.pathname);
    const code = q.toUpperCase().trim();
    if (/^[A-Z0-9]{4}$/.test(code)) { autoJoin = code; $('#homeMsg').textContent = `Joining room ${code}…`; setTimeout(() => net().emit('join', { code, look: myLook() }), 0); }
    else $('#homeMsg').textContent = "That room link isn't valid.";
  }
}
const myLook = () => (localStorage.getItem('ad3t-look-0') ? loadLook(0) : null); // online sends Player 1's look (if customised)
// ---------- customise screen: live rotating 3D preview rendered into #preview with the main renderer ----------
const pvScene = new THREE.Scene(), pvCam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
pvScene.background = new THREE.Color(0xcfeaff);
pvScene.add(new THREE.HemisphereLight(0xffffff, 0x8fb86a, 1.3));
{ const d = new THREE.DirectionalLight(0xffffff, 1.8); d.position.set(3, 5, 4); pvScene.add(d); }
{ const g = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 32), toon(0x7ccf5a)); g.position.y = -0.06; pvScene.add(g); }
pvCam.position.set(3.9, 1.5, 0); pvCam.lookAt(0, 0.98, 0);
let cSlot = 0, cLook = loadLook(0), pvArcher = null;
const pickers = { helmet: HELMETS, emblem: EMBLEMS, bow: BOWS };
function renderCustom() {
  if (pvArcher) dispose(pvArcher.root);
  pvArcher = makeArcher(0, cLook, hexOf(PALETTE, cLook.color), pvScene);
  pvArcher.root.position.set(0, 0, 0); pvArcher.pose(0.25, 0.3, true);
  document.querySelectorAll('#custom .tabs button').forEach(b => b.classList.toggle('on', +b.dataset.slot === cSlot));
  if (document.activeElement !== $('#nameIn')) $('#nameIn').value = cLook.name;
  document.querySelectorAll('#swColor button').forEach(b => b.classList.toggle('on', b.dataset.v === cLook.color));
  document.querySelectorAll('#swFletch button').forEach(b => b.classList.toggle('on', b.dataset.v === cLook.fletch));
  document.querySelectorAll('#swTower button').forEach(b => b.classList.toggle('on', b.dataset.v === cLook.tower));
  for (const [k, list] of Object.entries(pickers)) $(`.cyc[data-k="${k}"] span`).textContent = list.find(x => x[0] === cLook[k])[1];
  $('.cyc[data-k="taunt"] span').textContent = `“${TAUNTS[cLook.taunt]}”`;
}
function setLook(patch) { cLook = sanitizeLook({ ...cLook, ...patch }, cSlot); saveLook(cSlot, cLook); renderCustom(); }
$('#swColor').innerHTML = PALETTE.map(p => `<button data-v="${p.id}" aria-label="${p.name}" style="background:${css(p.hex)}"></button>`).join('');
$('#swFletch').innerHTML = FLETCH.map(p => `<button data-v="${p.id}" aria-label="${p.id} fletching" style="background:${css(p.hex)}"></button>`).join('');
$('#swColor').onclick = e => { const v = e.target.dataset.v; if (v) setLook({ color: v }); };
$('#swTower').innerHTML = BLOCK_COLORS.map(c => `<button data-v="${c.id}" aria-label="${c.name} tower" title="${c.name}" style="background:${css(c.hex)}"></button>`).join('');
$('#swTower').onclick = e => { const v = e.target.dataset.v; if (v) setLook({ tower: v }); };
$('#swFletch').onclick = e => { const v = e.target.dataset.v; if (v) setLook({ fletch: v }); };
document.querySelectorAll('.cyc').forEach(c => c.querySelectorAll('button').forEach(b => b.onclick = () => {
  const k = c.dataset.k, d = +b.dataset.d;
  if (k === 'taunt') return setLook({ taunt: (cLook.taunt + d + TAUNTS.length) % TAUNTS.length });
  const list = pickers[k], i = list.findIndex(x => x[0] === cLook[k]);
  setLook({ [k]: list[(i + d + list.length) % list.length][0] });
}));
$('#nameIn').oninput = () => {
  const was = isBaldy(cLook), n = cleanName($('#nameIn').value, '');
  cLook = sanitizeLook({ ...cLook, name: n || ['Blue', 'Red'][cSlot] }, cSlot); saveLook(cSlot, cLook);
  if (isBaldy(cLook) !== was) { // v6.0: live easter-egg swap in the preview
    renderCustom();
    if (isBaldy(cLook)) { sparkle(pvScene, new V(0, 1.1, 0), 1.1, 'pv'); sfx.sparkle(); S.pvSparkles = (S.pvSparkles || 0) + 1; }
  }
};
$('#nameIn').onblur = () => { $('#nameIn').value = cLook.name; };
document.querySelectorAll('#custom .tabs button').forEach(b => b.onclick = () => { cSlot = +b.dataset.slot; cLook = loadLook(cSlot); $('#nameIn').value = cLook.name; renderCustom(); });
$('#customBtn').onclick = () => { sfx.unlock(); show('#home', false); openPanel('#custom'); cLook = loadLook(cSlot); $('#nameIn').value = cLook.name; renderCustom(); };
function closeCustom() { if (document.activeElement) document.activeElement.blur(); show('#custom', false); show('#home', true); setLooks([loadLook(0), loadLook(1)]); }
$('#customDone').onclick = uiBack; $('#customBack').onclick = uiBack;
$('#nameIn').addEventListener('focus', () => setTimeout(() => $('#nameIn').scrollIntoView({ block: 'nearest' }), 300)); // keep it visible above the keyboard
let pvRenderer = null, pvEffect = null; // own small canvas inside the panel (the main canvas sits behind the panel)
function drawPreview() {
  const box = $('#preview');
  if (!pvRenderer) {
    pvRenderer = new THREE.WebGLRenderer({ antialias: true }); pvRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    pvEffect = new OutlineEffect(pvRenderer, { defaultThickness: 0.006, defaultColor: [0.09, 0.08, 0.13] });
    box.appendChild(pvRenderer.domElement);
  }
  const w = box.clientWidth, h = box.clientHeight;
  if (!pvArcher || w < 10) return;
  const c = pvRenderer.domElement;
  if (c.width !== Math.round(w * pvRenderer.getPixelRatio()) || c.height !== Math.round(h * pvRenderer.getPixelRatio())) { pvRenderer.setSize(w, h); pvCam.aspect = w / h; pvCam.updateProjectionMatrix(); }
  pvArcher.root.rotation.y = time * 0.6;
  pvEffect.render(pvScene, pvCam);
}

updateHud(); frame();

// test hook (scripted checks)
window.__game = {
  S, archers, camera,
  // v5.4 hooks: last-shot guide + camera mode
  guide: () => {
    const at = ghostLine.geometry.attributes.position, n = ghostLine.geometry.drawRange.count;
    return { last: clone(S.last), ghost: ghostLine.visible, ghostN: Math.min(n, GHOST_N), ghost0: [at.getX(0), at.getY(0), at.getZ(0)], ghostCol: ghostLine.material.color.getHex(), dashed: ghostLine.material.isLineDashedMaterial,
      mark: landMark.visible ? landMark.position.toArray() : null, label: $('#lastShot').textContent, labelVis: !$('#lastShot').classList.contains('hidden'), tip: $('#aimTip').innerHTML };
  },
  lastText,
  cam: () => ({ on: CAM.on, preset: CAM.preset, yaw: CAM.yaw, pitch: CAM.pitch, dist: CAM.dist, T: CAM.T.toArray(), pos: camera.position.toArray(), look: camLook.toArray(), want: CAM.on ? camPose()[0].toArray() : null,
    allowed: camAllowed(), ground: world.groundH(camera.position.x, camera.position.z), inBlock: !!blockAt(camera.position, 0), min: CAM_MIN, max: CAM_MAX, pmin: P_MIN, pmax: P_MAX, buildZoom: BS.zoom }),
  camEnter, camExit, camPreset, camSet: o => { Object.assign(CAM, o); if (o.T) CAM.T = new V(...o.T); CAM.preset = 'free'; camClamp(); },
  camPoseOf: o => { const keep = { ...CAM, T: CAM.T.clone() }; Object.assign(CAM, o); if (o.T) CAM.T = new V(...o.T); const r = camPose()[0]; Object.assign(CAM, keep); return { pos: r.toArray(), ground: world.groundH(r.x, r.z), inBlock: !!blockAt(r, 0) }; },
  aimCam: () => aimCam().map(v => v.toArray()),
  get looks() { return looks; }, get cols() { return cols; },
  screenX: i => archers[i].root.position.clone().project(camera).x, // -1..1, left..right
  get world() { return world; },
  startHot: quickHot, startHotBuild: startHot, // tests: quickHot skips the build phase
  autoSkip: false, // tests: skip every build phase straight away
  get build() { return BS; },
  buildPlace: (gx, gz) => buildTry([gx, gz]), buildArcher: (ax, az) => buildArcherTry([ax, az]), buildUndo: () => $('#bUndo').click(), buildReady: () => $('#bReady').click(),
  buildSkip: () => $('#bSkip').click(), passGo: () => $('#passGo').click(),
  buildColor: id => pickColor(id), blockColor: i => arena.blocks[i].userData.col, blockHex: i => arena.blockHex(i), // v5.3 colour hooks
  blockRgb: i => arena.blocks[i].material.color.getHex(), debrisHex: () => arena.debrisHex(), chunkHex: hex => new THREE.Color(hex).multiplyScalar(0.8).getHex(), get colors() { return S.colors; },
  cellScreen(gx, gz) { const s = BS.side, { r } = withBlock(s, BS.plans[s], [gx, gz]); const p = r.ok ? r.blocks.at(-1) : r.pos || [TX(s) + (gx + 0.5) * CELL, 5.4, (gz + 0.5) * CELL]; const q = new V(p[0], p[1] - 0.38, p[2]).project(camera); /* the surface the block would rest on */ return [(q.x + 1) / 2 * innerWidth, (1 - q.y) / 2 * innerHeight]; },
  validate: (s, plan) => validateBuild(s, plan), autoPlan, buildPlaceRaw: plan => { const s = BS.side, r = validateBuild(s, plan); if (r.ok) setPlan(plan, r); else buildMsg(r.err, true); return r; },
  pick: (x, y) => { const k = buildPick(x, y); return k && { p: k.p.toArray(), n: k.n.toArray(), block: k.block }; },
  sendPlan: (plan, ready) => { if (sock) sock.emit('plan', { plan, ready }); },
  simulate: (aim, type = 'normal') => simulateShot(world, S.turn, aim, S.wind, type, S.st),
  setWind: (x, z) => { S.wind = { x, z }; updateHud(); },
  layout: LAYOUT,
  pickupObj: () => pickupObj,
  spinning: () => !!(S.play && S.play.run.spin && S.play.run.k >= S.play.run.spin.start && S.play.run.k < S.play.run.spin.end),
  blasted: () => !!(S.play && S.play.focus),
  blocks: () => arena.blocks.map(m => [m.position.x, m.position.y, m.position.z, m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w]),
  get st() { return S.st; },
  playing: () => !!S.play,
  findBlockHit(ids, type = 'normal') { // aim whose first arrow hits one of the given block indices
    ids = [].concat(ids);
    for (let pd = 3; pd <= 45; pd += 1) for (let pw = 0.3; pw <= 1; pw += 0.004) {
      const aim = { pitch: pd * DEG, power: pw }, r = simulateShot(world, S.turn, aim, S.wind, type, S.st).arrows[0].res;
      if (r.kind === 'block' && ids.includes(r.block)) return { aim, block: r.block };
    }
    return null;
  },
  findPickupHit(type = 'normal') {
    for (let pd = 5; pd <= 70; pd += 1) for (let pw = 0.3; pw <= 1; pw += 0.004) {
      const aim = { pitch: pd * DEG, power: pw };
      if (simulateShot(world, S.turn, aim, S.wind, type, S.st).arrows.some(a => a.res.kind === 'pickup')) return aim;
    }
    return null;
  },
  findLanding(test, type) { // first aim whose landing point satisfies test(res)
    for (let pd = 5; pd <= 70; pd += 1) for (let pw = 0.3; pw <= 1; pw += 0.004) {
      const aim = { pitch: pd * DEG, power: pw }, r = simulateShot(world, S.turn, aim, S.wind, type, S.st).arrows[0].res;
      if (test(r)) return { aim, res: r };
    }
    return null;
  },
  setPickup(p) { if (S.mode !== 'hot') return false; S.st.pickup = p; showPickup(p, true); return true; }, // hot-seat test helper
  giveAmmo(k, n = 1, who = S.turn) { if (S.mode !== 'hot') return false; S.st.ammo[who][k] += n; updateHud(); return true; },
  findHit(type = 'normal') { // search for a body hit with the current wind
    for (const pd of [35, 25, 45, 55, 15]) for (let pw = 0.4; pw <= 1; pw += 0.002) {
      const aim = { pitch: pd * DEG, power: pw }, r = simulateShot(world, S.turn, aim, S.wind, type, S.st).arrows[0].res;
      if (r.kind === 'body') return aim;
    }
    return null;
  },
  shootAim(aim, type = 'normal') { if (!myTurn()) return false; S.types[S.turn] = type; S.aim = aim; S.draw = 1; fire(); return true; },
};
window.__ready = true;
// ---------- v6.0 victory show (visual only) ----------
function resetVictoryPose() {}
