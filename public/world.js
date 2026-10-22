// Cartoon castle arena: toon-shaded valley, winding river, round towers with destructible merlons, toy castles, tents, trebuchet, clouds, weather.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIST, WALL_H, TOWER_R, RING_IN, BREAST, MERLON_H, MERLON_HP, MERLONS, merlonGeom, STATIC_GEOM } from './sim.js';

// ---------- toon helpers (shared with game.js) ----------
const grad = (() => { const t = new THREE.DataTexture(new Uint8Array([110, 175, 230, 255]), 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
export const toon = (c, o = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: grad, ...o });
export const noOutline = m => { m.userData.outlineParameters = { visible: false }; return m; };
const texCache = {};
function canvasTex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return (texCache[key] = t);
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); g.stroke(); }
// rounded cartoon stone blocks with dark outlines; tint comes from the material colour
const stoneTex = () => canvasTex('stone', 256, 256, (g, w, h) => {
  g.fillStyle = '#5b5e68'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3d3f48'; g.lineWidth = 5;
  for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) {
    const l = 205 + Math.random() * 40; g.fillStyle = `rgb(${l},${l},${l + 6})`;
    rrect(g, k * 128 + (r % 2) * 64 + 5, r * 64 + 5, 118, 54, 14);
  }
});
const brickTex = () => canvasTex('brick', 256, 256, (g, w, h) => {
  g.fillStyle = '#7a2a22'; g.fillRect(0, 0, w, h); g.strokeStyle = '#5a1c16'; g.lineWidth = 3;
  for (let r = 0; r < 8; r++) for (let k = -1; k < 5; k++) { const l = 220 + Math.random() * 35; g.fillStyle = `rgb(${l},${l},${l})`; rrect(g, k * 64 + (r % 2) * 32 + 3, r * 32 + 3, 58, 26, 6); }
});
const stripeTex = () => canvasTex('stripe', 128, 16, (g, w, h) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#fff6ea' : '#e23b3b'; g.fillRect(k * 16, 0, 16, h); } });
export function heraldry(i) { // Blue: gold chevron; Red: gold crown — on a gold-trimmed field
  return canvasTex('herald' + i, 128, 128, (g, w, h) => {
    g.fillStyle = i ? '#d8312b' : '#1f5fd6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4c430'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
    g.strokeStyle = '#8a5a00'; g.lineWidth = 3;
    if (i) { g.beginPath(); g.moveTo(32, 86); g.lineTo(28, 44); g.lineTo(46, 62); g.lineTo(64, 36); g.lineTo(82, 62); g.lineTo(100, 44); g.lineTo(96, 86); g.closePath(); g.fill(); g.stroke(); }
    else for (const y of [52, 80]) { g.beginPath(); g.moveTo(26, y + 16); g.lineTo(64, y - 10); g.lineTo(102, y + 16); g.lineTo(102, y + 30); g.lineTo(64, y + 4); g.lineTo(26, y + 30); g.closePath(); g.fill(); g.stroke(); }
  });
}

const THEMES = {
  field: { sky: [0x1e88f0, 0xb4e2ff], fog: [130, 300], hemi: 0.95, sun: [0xfff3d6, 2.1], stone: 0xffffff, water: 0x37b6f6, cloud: 0xffffff,
    grass: [0.29, 0.72, 0.37], crowns: [0x4cbf3a, 0x3aa83a, 0x6fd14a], weather: null },
  dusk: { sky: [0x3a3270, 0xffa36b], fog: [80, 240], hemi: 0.7, sun: [0xffb27a, 1.3], stone: 0xd8d2e0, water: 0x3a7fc0, cloud: 0xb9a6c9,
    grass: [0.32, 0.5, 0.3], crowns: [0x2f8f4a, 0x2a7a46, 0x3d9e52], weather: 'rain', torch: 3 },
  winter: { sky: [0x5aa8ec, 0xe4f3ff], fog: [90, 260], hemi: 1.05, sun: [0xf2f6ff, 1.7], stone: 0xf0f4ff, water: 0xa8dcf5, cloud: 0xffffff,
    grass: [0.58, 0.4, 0.84], crowns: [0xe8f4ff, 0xd8ecf7, 0xcfe8d8], weather: 'snow', snow: true },
};

function makeTrebuchet(m, dark) {
  const g = new THREE.Group(), add = (geo, mm, x, y, z, rz = 0, rx = 0) => { const o = new THREE.Mesh(geo, mm); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = true; g.add(o); return o; };
  for (const z of [-0.75, 0.75]) {
    add(new RoundedBoxGeometry(3, 0.26, 0.26, 2, 0.06), m, 0, 0.55, z);
    for (const x of [-1.1, 1.1]) add(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 14), dark, x, 0.42, z * 1.25, 0, Math.PI / 2);
    add(new RoundedBoxGeometry(0.2, 2.4, 0.2, 2, 0.05), m, -0.45, 1.6, z, -0.35); add(new RoundedBoxGeometry(0.2, 2.4, 0.2, 2, 0.05), m, 0.45, 1.6, z, 0.35);
  }
  add(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 8), dark, 0, 2.65, 0, 0, Math.PI / 2);
  add(new RoundedBoxGeometry(3.6, 0.16, 0.16, 2, 0.04), m, 0.5, 3.1, 0, 0.55);
  add(new RoundedBoxGeometry(0.7, 0.6, 0.7, 2, 0.1), dark, -0.95, 1.9, 0);
  return g;
}

export function buildArena(scene, world, lights) {
  const T = THEMES[world.id], group = new THREE.Group();
  scene.fog = new THREE.Fog(T.sky[1], T.fog[0], T.fog[1]);
  lights.hemi.intensity = T.hemi; lights.sun.color.setHex(T.sun[0]); lights.sun.intensity = T.sun[1];
  const add = (geo, m, x, y, z, parent = group) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  { // sky dome
    const geo = new THREE.SphereGeometry(300, 24, 12), p = geo.attributes.position, cols = [];
    const top = new THREE.Color(T.sky[0]), bot = new THREE.Color(T.sky[1]);
    for (let i = 0; i < p.count; i++) { const c = bot.clone().lerp(top, Math.pow(Math.max(0, p.getY(i) / 300), 0.5)); cols.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    group.add(new THREE.Mesh(geo, noOutline(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }))));
  }
  // puffy clouds
  const clouds = new THREE.Group(), cloudM = noOutline(toon(T.cloud, { fog: false, emissive: new THREE.Color(T.cloud).multiplyScalar(0.55) })), puff = new THREE.SphereGeometry(1, 18, 12);
  for (let k = 0; k < 14; k++) {
    const c = new THREE.Group(), a = k / 14 * Math.PI * 2 + Math.random() * 0.3, r = 150 + Math.random() * 50;
    for (let j = 0; j < 6; j++) { const m = new THREE.Mesh(puff, cloudM), s = 5 + Math.random() * 5; m.scale.set(s * 1.2, s, s); m.position.set((j - 2.5) * 6 + Math.random() * 3, Math.random() * 4 - (Math.abs(j - 2.5) * 1.5), Math.random() * 4); c.add(m); }
    c.position.set(Math.cos(a) * r, 42 + Math.random() * 34, Math.sin(a) * r); c.lookAt(0, c.position.y, 0); clouds.add(c);
  }
  group.add(clouds);
  { // valley
    const geo = new THREE.PlaneGeometry(200, 140, 120, 70).rotateX(-Math.PI / 2);
    const p = geo.attributes.position, cols = [], c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = world.groundH(p.getX(i), p.getZ(i)); p.setY(i, y);
      c.setHSL(T.grass[0] + Math.sin(p.getX(i) * 0.3 + p.getZ(i) * 0.2) * 0.015, T.grass[1], T.grass[2] + y * 0.012 + Math.random() * 0.02);
      if (!T.snow && y < -0.15) c.setHSL(0.12, 0.45, 0.62); // sandy river banks
      cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals();
    const ground = add(geo, noOutline(toon(0xffffff, { vertexColors: true })), 0, 0, 0); ground.castShadow = false;
    const hillM = noOutline(toon(new THREE.Color().setHSL(T.grass[0] + 0.04, T.grass[1] * 0.8, T.grass[2] - 0.03)));
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, r = 100 + (k % 3) * 12, h = add(new THREE.SphereGeometry(1, 20, 10), hillM, Math.cos(a) * r, -4, Math.sin(a) * r * 0.75); h.scale.set(28 + (k % 4) * 6, 7 + (k % 5) * 2.5, 22); h.castShadow = false; }
  }
  { // winding river + sparkles
    const pts = [], idx = [], N = 80;
    for (let i = 0; i <= N; i++) { const z = -70 + i * 140 / N, x = world.riverX(z); pts.push(x - 3, -0.45, z, x + 3, -0.45, z); if (i < N) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const water = add(geo, noOutline(toon(T.water)), 0, 0, 0); water.castShadow = false;
    var sparkle = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(Array.from({ length: 120 }, () => { const z = (Math.random() - 0.5) * 60; return [world.riverX(z) + (Math.random() - 0.5) * 4.6, -0.42, z]; }).flat(), 3)),
      noOutline(new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.9, depthWrite: false })));
    if (!T.snow) group.add(sparkle);
  }
  const stoneM = toon(T.stone, { map: stoneTex() }), crackM = toon(new THREE.Color(T.stone).multiplyScalar(0.62), { map: stoneTex() });
  const snowM = toon(0xffffff), woodM = toon(0xa8662e), darkWood = toon(0x6b3f1d), stoneMat2 = toon(0xc7cad3);
  // ---------- round towers (one per archer) ----------
  const torches = [];
  for (const s of [0, 1]) {
    const cx = s ? DIST : -DIST;
    const body = add(new THREE.CylinderGeometry(TOWER_R, TOWER_R + 0.35, WALL_H + 2, 36), stoneM.clone(), cx, WALL_H / 2 - 1, 0);
    body.material.map = stoneTex().clone(); body.material.map.repeat.set(8, 3.5); body.material.map.needsUpdate = true;
    add(new THREE.TorusGeometry(TOWER_R + 0.02, 0.14, 8, 40), stoneMat2, cx, WALL_H - 0.05, 0).rotation.x = Math.PI / 2;
    const floor = add(new THREE.CircleGeometry(RING_IN + 0.05, 32), stoneM.clone(), cx, WALL_H + 0.01, 0); floor.rotation.x = -Math.PI / 2;
    floor.material.map = stoneTex().clone(); floor.material.map.repeat.set(2, 2); floor.material.map.needsUpdate = true;
    const prof = [[RING_IN, 0], [TOWER_R - 0.03, 0], [TOWER_R + 0.03, 0.08], [TOWER_R + 0.03, BREAST - 0.08], [TOWER_R - 0.05, BREAST], [RING_IN + 0.06, BREAST], [RING_IN, BREAST - 0.08]].map(([x, y]) => new THREE.Vector2(x, y));
    add(new THREE.LatheGeometry(prof, 48), stoneMat2, cx, WALL_H, 0);
    add(new THREE.BoxGeometry(0.08, 1.4, 0.9), toon(0x3a2a1a), cx + (s ? -1 : 1) * (TOWER_R + 0.33), 0.2, 0); // door
    if (T.torch) {
      add(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), darkWood, cx, WALL_H + BREAST + 0.2, (s ? -1 : 1) * -2.25);
      const flame = add(new THREE.ConeGeometry(0.14, 0.38, 7), noOutline(new THREE.MeshBasicMaterial({ color: 0xffb030 })), cx, WALL_H + BREAST + 0.85, (s ? -1 : 1) * -2.25);
      torches.push({ flame, ph: Math.random() * 9 }); // no point light: it washed out the toon archers and costs phone GPU time
    }
  }
  const merlonGeo = new RoundedBoxGeometry(0.55, MERLON_H, 0.72, 3, 0.12);
  for (const g of STATIC_GEOM) { const m = add(merlonGeo, stoneMat2, g.x, WALL_H + BREAST + MERLON_H / 2, g.z); m.rotation.y = -g.ang; if (T.snow) add(new RoundedBoxGeometry(0.6, 0.12, 0.78, 2, 0.05), snowM, 0, MERLON_H / 2 + 0.03, 0, m); }
  const merlons = [];
  for (let id = 0; id < MERLONS; id++) {
    const g = merlonGeom(id), home = new THREE.Vector3(g.x, WALL_H + BREAST + MERLON_H / 2, g.z);
    const m = add(merlonGeo, stoneMat2, home.x, home.y, home.z); m.rotation.y = -g.ang;
    if (T.snow) add(new RoundedBoxGeometry(0.6, 0.12, 0.78, 2, 0.05), snowM, 0, MERLON_H / 2 + 0.03, 0, m);
    merlons.push({ m, home, rot: -g.ang, out: new THREE.Vector3(Math.cos(g.ang), 0, Math.sin(g.ang)), hp: MERLON_HP });
  }
  const debris = [];
  const chunkGeo = new RoundedBoxGeometry(0.2, 0.16, 0.18, 1, 0.04);
  function chunks(pos, n, out) {
    for (let k = 0; k < n; k++) {
      const c = add(chunkGeo, crackM, pos.x, pos.y, pos.z);
      debris.push({ o: c, v: out.clone().multiplyScalar(1 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2)), spin: Math.random() * 8, chunk: true });
    }
  }
  function setMerlon(id, hp, animate) {
    const M = merlons[id], m = M.m;
    if (hp === M.hp) return;
    if (hp >= MERLON_HP) { group.attach(m); m.position.copy(M.home); m.rotation.set(0, M.rot, 0); m.scale.set(1, 1, 1); m.material = stoneMat2; m.visible = true; }
    else if (hp === 1) { // cracked: chipped and darker, chunks fly off
      m.material = crackM; m.scale.set(0.9, 0.72, 0.85); m.position.y = M.home.y - 0.11; m.rotation.set(0.06, M.rot + 0.08, -0.05);
      if (animate) chunks(M.home.clone().add(new THREE.Vector3(0, 0.35, 0)), 5, M.out);
    } else if (animate) { m.material = crackM; debris.push({ o: m, v: M.out.clone().multiplyScalar(2).add(new THREE.Vector3(0, 2.5, 0)), spin: 5 }); chunks(M.home, 7, M.out); }
    else m.visible = false;
    M.hp = hp;
  }
  // ---------- toy castles behind each archer (red behind Red, blue behind Blue) with waving flags ----------
  const flags = [];
  const flagGeo = () => new THREE.PlaneGeometry(1.6, 0.9, 10, 1).translate(0.8, 0, 0);
  function flag(parent, x, y, z, color) {
    const pole = new THREE.Group(); pole.position.set(x, y, z); parent.add(pole);
    add(new THREE.CylinderGeometry(0.06, 0.06, 2, 6), darkWood, 0, 1, 0, pole);
    const geo = flagGeo(), cloth = add(geo, toon(color, { side: THREE.DoubleSide }), 0, 1.6, 0, pole);
    flags.push({ cloth, yaw: parent.rotation.y, base: Float32Array.from(geo.attributes.position.array) });
  }
  for (const s of [0, 1]) {
    const sg = s ? 1 : -1, c = new THREE.Group(), roof = toon(s ? 0xe0342c : 0x2f6fe0), team = s ? 0xe0342c : 0x2f6fe0;
    const wallM = s ? toon(0xe25b4a, { map: brickTex() }) : toon(0xdfe6f2, { map: stoneTex() });
    c.position.set(sg * 44, world.groundH(sg * 44, -sg * 9), -sg * 9); c.rotation.y = s ? -Math.PI / 2 : Math.PI / 2; c.scale.setScalar(1.25); group.add(c);
    add(new RoundedBoxGeometry(12, 6, 3, 2, 0.3), wallM, 0, 3, 0, c);
    add(new RoundedBoxGeometry(5, 10, 5, 2, 0.4), wallM, 0, 5, -2, c);
    for (let k = -5; k <= 5; k += 1.25) add(new RoundedBoxGeometry(0.7, 0.8, 0.9, 2, 0.12), wallM, k, 6.4, 1.1, c);
    add(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 20, 1, false, 0, Math.PI), toon(0x3a2a1a), 0, 1.6, 1.52, c).rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(2.8, 1.6, 0.2), toon(0x3a2a1a), 0, 0.8, 1.52, c);
    add(new THREE.ConeGeometry(3.8, 4.5, 4), roof, 0, 12.2, -2, c).rotation.y = Math.PI / 4;
    flag(c, 0, 14.3, -2, team);
    for (const [x, h] of [[-6.5, 9], [6.5, 9], [-3.2, 11], [3.2, 11]]) {
      add(new THREE.CylinderGeometry(1.35, 1.45, h, 18), wallM, x, h / 2, x > -4 && x < 4 ? -3.8 : 0, c);
      add(new THREE.ConeGeometry(1.75, 3.2, 18), roof, x, h + 1.6, x > -4 && x < 4 ? -3.8 : 0, c);
      flag(c, x, h + 3.1, x > -4 && x < 4 ? -3.8 : 0, team);
    }
  }
  // ---------- field props ----------
  const trunkM = toon(0x8a5a2b), crownMs = T.crowns.map(c => toon(c)), crownGeo = new THREE.IcosahedronGeometry(1, 2), trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 8);
  function tree(x, y, z, s, k) { add(trunkGeo, trunkM, x, y + 0.8 * s, z).scale.set(s, 1.6 * s, s); add(crownGeo, crownMs[k % 3], x, y + 2.5 * s, z).scale.setScalar(1.15 * s); }
  world.trees.forEach((t, k) => tree(t.x, t.y, t.z, t.s, k));
  { // background lollipop trees, instanced
    const n = 70, tr = new THREE.InstancedMesh(trunkGeo, trunkM, n), cr = new THREE.InstancedMesh(crownGeo, toon(0xffffff), n), m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let k = 0; k < n; k++) {
      let x, z; // re-roll spots in the river or inside a castle
      do { x = (Math.random() - 0.5) * 90; z = (Math.random() < 0.5 ? -1 : 1) * (16 + Math.random() * 30); } while (Math.abs(x - world.riverX(z)) < 5 || Math.hypot(Math.abs(x) - 44, Math.abs(z) - 9) < 11);
      const s = 0.9 + Math.random() * 0.8, y = world.groundH(x, z);
      m4.compose(new THREE.Vector3(x, y + 0.8 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, 1.6 * s, s)); tr.setMatrixAt(k, m4);
      m4.compose(new THREE.Vector3(x, y + 2.5 * s, z), new THREE.Quaternion(), new THREE.Vector3(1.15 * s, 1.15 * s, 1.15 * s)); cr.setMatrixAt(k, m4);
      cr.setColorAt(k, col.setHex(T.crowns[k % 3]));
    }
    tr.castShadow = cr.castShadow = true; group.add(tr, cr);
  }
  const stripeM = toon(0xffffff, { map: stripeTex() });
  for (const t of world.tents) {
    add(new THREE.CylinderGeometry(t.r, t.r, t.h * 0.45, 16), stripeM, t.x, t.y + t.h * 0.225, t.z);
    add(new THREE.ConeGeometry(t.r * 1.12, t.h * 0.58, 16), stripeM, t.x, t.y + t.h * 0.45 + t.h * 0.29, t.z);
    flag(group, t.x, t.y + t.h - 0.1, t.z, 0xe0342c); flags[flags.length - 1].cloth.scale.setScalar(0.5); flags[flags.length - 1].cloth.position.y = 0.9;
  }
  const treb = makeTrebuchet(woodM, darkWood); treb.position.set(world.treb.x, world.treb.y, world.treb.z); treb.rotation.y = 0.3; group.add(treb);
  const rockM = toon(0xa9adb8), rockGeo = new THREE.IcosahedronGeometry(1, 1);
  for (const k of world.rocks) add(rockGeo, rockM, k.x, k.y, k.z).scale.set(k.r * 1.2, k.r, k.r);
  // ---------- weather ----------
  let weather = null, drops = [], N = 0;
  if (T.weather) {
    const rain = T.weather === 'rain'; N = rain ? 600 : 300;
    const pp = new Float32Array(N * (rain ? 6 : 3)), g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pp, 3));
    weather = rain ? new THREE.LineSegments(g, noOutline(new THREE.LineBasicMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.6 })))
      : new THREE.Points(g, noOutline(new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.95, depthWrite: false })));
    weather.frustumCulled = false; group.add(weather);
    drops = Array.from({ length: N }, () => new THREE.Vector3((Math.random() - 0.5) * 40, Math.random() * 20, (Math.random() - 0.5) * 40));
  }
  let flashT = 0, nextBolt = 6;
  scene.add(group);

  return {
    setMerlon,
    resetMerlons(hp) {
      for (const d of debris) if (d.chunk) d.o.removeFromParent();
      debris.length = 0;
      hp.forEach((h, id) => { setMerlon(id, MERLON_HP, false); setMerlon(id, h, false); });
    },
    merlonMesh: id => merlons[id].m,
    merlonState: () => merlons.map(M => ({ hp: M.hp, visible: M.m.visible, fallen: M.m.position.distanceTo(M.home) > 1 })),
    update(dt, t, wind, cam, sfx) {
      const s = Math.hypot(wind.x, wind.z), ang = Math.atan2(-wind.z, wind.x);
      for (const f of flags) {
        f.cloth.rotation.y = ang - f.yaw; // flags point downwind
        const p = f.cloth.geometry.attributes.position, droop = Math.max(0, 1 - s / 2.5);
        for (let i = 0; i < p.count; i++) { const x = f.base[i * 3]; p.setZ(i, Math.sin(x * 4 - t * (5 + s * 2)) * 0.09 * x * (0.4 + s * 0.3)); p.setY(i, f.base[i * 3 + 1] - droop * x * 0.5); }
        p.needsUpdate = true;
      }
      clouds.rotation.y = t * 0.004;
      if (!T.snow) sparkle.material.opacity = 0.45 + 0.45 * Math.abs(Math.sin(t * 2.3));
      for (const tc of torches) { const f = 0.75 + 0.25 * Math.sin(t * 13 + tc.ph) * Math.sin(t * 7.3 + tc.ph * 2); tc.flame.scale.set(1, f * 1.2, 1); }
      for (const d of debris) {
        if (!d.v) continue;
        d.v.y -= 9.8 * dt; d.o.position.addScaledVector(d.v, dt); d.o.rotation.x += d.spin * dt; d.o.rotation.z += d.spin * 0.7 * dt;
        const floor = world.groundH(d.o.position.x, d.o.position.z);
        if (d.o.position.y < floor + 0.12) { d.o.position.y = floor + 0.12; d.v = null; }
      }
      if (weather) {
        const a = weather.geometry.attributes.position, rain = T.weather === 'rain', fall = rain ? 16 : 1.3;
        for (let i = 0; i < N; i++) {
          const d = drops[i];
          d.x += (wind.x * (rain ? 1.5 : 2) + Math.sin(t + i) * 0.3) * dt; d.y -= fall * dt; d.z += wind.z * 2 * dt;
          if (d.y < 0) d.y += 20; if (d.y > 20) d.y -= 20;
          for (const k of ['x', 'z']) { if (d[k] > 20) d[k] -= 40; if (d[k] < -20) d[k] += 40; }
          const x = cam.x + d.x, y = cam.y - 8 + d.y, z = cam.z + d.z;
          if (rain) { a.setXYZ(i * 2, x, y, z); a.setXYZ(i * 2 + 1, x - wind.x * 0.05, y - 0.5, z - wind.z * 0.05); } else a.setXYZ(i, x, y, z);
        }
        a.needsUpdate = true;
        if (rain) {
          if ((nextBolt -= dt) <= 0) { nextBolt = 7 + Math.random() * 10; flashT = 0.25; setTimeout(() => sfx && sfx.thunder(), 500); }
          flashT = Math.max(0, flashT - dt);
          lights.hemi.intensity = T.hemi + (flashT > 0.12 || (flashT > 0 && flashT < 0.06) ? 2.5 : 0);
        }
      }
    },
    dispose() { scene.remove(group); group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); },
  };
}
