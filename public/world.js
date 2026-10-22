// Cartoon castle arena: toon-shaded valley, winding river, stacked-block physics towers, toy castles, tents, trebuchet, clouds, weather.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LAYOUT, parked } from './sim.js';

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
export function heraldry(hex, emblem = 'plain') { // tabard texture: player colour field, gold trim and emblem (white on a gold field)
  const field = '#' + hex.toString(16).padStart(6, '0'), goldish = hex === 0xe8b416, metal = goldish ? '#ffffff' : '#f4c430';
  return canvasTex(`herald-${field}-${emblem}`, 128, 128, (g, w, h) => {
    g.fillStyle = field; g.fillRect(0, 0, w, h);
    g.fillStyle = metal; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10); g.fillRect(0, 0, 10, h); g.fillRect(w - 10, 0, 10, h);
    g.strokeStyle = goldish ? '#8a5a00' : '#8a5a00'; g.lineWidth = 3; g.lineJoin = 'round';
    const poly = pts => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke(); };
    if (emblem === 'crown') poly([[32, 86], [28, 44], [46, 62], [64, 36], [82, 62], [100, 44], [96, 86]]);
    else if (emblem === 'chevron') for (const y of [52, 80]) poly([[26, y + 16], [64, y - 10], [102, y + 16], [102, y + 30], [64, y + 4], [26, y + 30]]);
    else if (emblem === 'star') poly(Array.from({ length: 10 }, (_, k) => { const r = k % 2 ? 15 : 36, a = -Math.PI / 2 + k * Math.PI / 5; return [64 + r * Math.cos(a), 66 + r * Math.sin(a)]; }));
    else if (emblem === 'cross') poly([[54, 26], [74, 26], [74, 54], [102, 54], [102, 74], [74, 74], [74, 104], [54, 104], [54, 74], [26, 74], [26, 54], [54, 54]]);
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
  const clouds = new THREE.Group(), cloudM = noOutline(toon(T.cloud, { fog: false, emissive: new THREE.Color(T.cloud).multiplyScalar(0.55) })), cloudGeo = new THREE.SphereGeometry(1, 18, 12);
  for (let k = 0; k < 14; k++) {
    const c = new THREE.Group(), a = k / 14 * Math.PI * 2 + Math.random() * 0.3, r = 150 + Math.random() * 50;
    for (let j = 0; j < 6; j++) { const m = new THREE.Mesh(cloudGeo, cloudM), s = 5 + Math.random() * 5; m.scale.set(s * 1.2, s, s); m.position.set((j - 2.5) * 6 + Math.random() * 3, Math.random() * 4 - (Math.abs(j - 2.5) * 1.5), Math.random() * 4); c.add(m); }
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
  // ---------- towers: every block is a rigid body (physics.js drives the transforms) ----------
  const torches = [], geoCache = {};
  const blockGeo = h => geoCache[h] || (geoCache[h] = new RoundedBoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2, 2, Math.min(0.09, h[1] * 0.4)));
  const shade = (base, k) => new THREE.Color(base).multiplyScalar(0.86 + ((k * 37) % 11) / 11 * 0.16);
  const kindCol = { wall: T.stone === 0xffffff ? 0xc9ccd6 : new THREE.Color(T.stone).multiplyScalar(0.85).getHex(), slab: 0xb59a76, merlon: 0xdfe2ea, build: 0xe2a95a }; // build-phase blocks: warm sandstone, easy to tell apart
  const blocks = LAYOUT.map((l, i) => {
    const m = add(blockGeo(l.half), toon(shade(kindCol[l.kind], i)), ...l.pos);
    if (T.snow && l.kind !== 'wall') add(new RoundedBoxGeometry(l.half[0] * 2 + 0.06, 0.1, l.half[2] * 2 + 0.06, 1, 0.04), snowM, 0, l.half[1] + 0.03, 0, m);
    if (l.kind === 'wall' && l.pos[1] < 0.5 && Math.abs(l.pos[2]) < 0.1 && Math.sign(l.pos[0]) * (l.pos[0] - (l.s ? 15 : -15)) > 0) // door on the back face
      add(new THREE.BoxGeometry(0.06, 0.8, 0.7), toon(0x3a2a1a), Math.sign(l.pos[0]) * (l.half[0] + 0.02), -0.05, 0, m);
    if (T.torch && l.kind === 'merlon' && Math.abs(l.pos[2]) > 1 && Math.abs(l.pos[0] - (l.s ? 15 : -15)) < 0.1) {
      add(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 6), darkWood, 0, 0.6, 0, m);
      const flame = add(new THREE.ConeGeometry(0.13, 0.34, 7), noOutline(new THREE.MeshBasicMaterial({ color: 0xffb030 })), 0, 1.1, 0, m);
      torches.push({ flame, ph: Math.random() * 9 });
    }
    if (l.kind === 'build') m.visible = false;
    return m;
  });
  function setBlocks(b) { b.forEach((q, i) => { blocks[i].position.set(q[0], q[1], q[2]); blocks[i].quaternion.set(q[3], q[4], q[5], q[6]); blocks[i].visible = !parked(q); }); } // unplaced build blocks stay hidden
  // ---------- effects: chunks, dust, explosions, sparks ----------
  const debris = [], fx = [];
  const chunkGeo = new RoundedBoxGeometry(0.2, 0.16, 0.18, 1, 0.04), puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const dustM = noOutline(toon(T.snow ? 0xffffff : 0xd8c8a8, { transparent: true, opacity: 0.85 })), smokeM = noOutline(toon(0x6a6670, { transparent: true, opacity: 0.9 }));
  const fireM = noOutline(new THREE.MeshBasicMaterial({ color: 0xffc14a, transparent: true, opacity: 1, depthWrite: false })), sparkM = noOutline(new THREE.MeshBasicMaterial({ color: 0xffe066 }));
  function chunks(pos, n, out) {
    for (let k = 0; k < n; k++) {
      const c = add(chunkGeo, crackM, pos.x, pos.y, pos.z); c.scale.setScalar(0.6 + Math.random() * 0.8);
      debris.push({ o: c, v: out.clone().multiplyScalar(1 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2)), spin: Math.random() * 8, life: 6 });
    }
  }
  function puff(pos, n, size = 0.4, m = dustM, spread = 0.6, rise = 0.6, life = 1.1) {
    for (let k = 0; k < n; k++) {
      const o = new THREE.Mesh(puffGeo, m.clone()); o.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.5, (Math.random() - 0.5) * spread));
      o.scale.setScalar(size * (0.6 + Math.random() * 0.6)); group.add(o);
      fx.push({ o, t: 0, life: life * (0.7 + Math.random() * 0.6), grow: 1.8, v: new THREE.Vector3((Math.random() - 0.5) * spread * 2, rise * (0.5 + Math.random()), (Math.random() - 0.5) * spread * 2) });
    }
  }
  function explode(pos) { // flash + fireball + smoke + debris
    const fl = new THREE.Mesh(puffGeo, fireM.clone()); fl.position.copy(pos); fl.scale.setScalar(0.5); group.add(fl);
    fx.push({ o: fl, t: 0, life: 0.45, grow: 9, v: new THREE.Vector3() });
    puff(pos, 8, 0.7, noOutline(new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, depthWrite: false })), 1.2, 1.5, 0.55);
    puff(pos, 14, 0.8, smokeM, 2.2, 1.6, 2.2);
    chunks(pos, 16, new THREE.Vector3(0, 2, 0));
    for (let k = 0; k < 16; k++) { const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize(); chunks(pos.clone().addScaledVector(d, 0.4), 1, d.multiplyScalar(4)); }
  }
  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.22);
  function sparks(pos, n = 4) {
    for (let k = 0; k < n; k++) {
      const o = new THREE.Mesh(sparkGeo, sparkM), a = Math.random() * Math.PI * 2, v = new THREE.Vector3(Math.cos(a) * 5, 1.5 + Math.random() * 2.5, Math.sin(a) * 5);
      o.position.copy(pos); o.lookAt(pos.clone().add(v)); group.add(o);
      fx.push({ o, t: 0, life: 0.35, grow: 0, v, g: true });
    }
  }
  // ---------- toy castles behind each archer (red behind Red, blue behind Blue) with waving flags ----------
  const flags = [];
  const flagGeo = () => new THREE.PlaneGeometry(1.6, 0.9, 10, 1).translate(0.8, 0, 0);
  const teamFlag = [toon(0x2f6fe0, { side: THREE.DoubleSide }), toon(0xe0342c, { side: THREE.DoubleSide })], teamRoof = [toon(0x2f6fe0), toon(0xe0342c)]; // recoloured per player
  function flag(parent, x, y, z, color) {
    const pole = new THREE.Group(); pole.position.set(x, y, z); parent.add(pole);
    add(new THREE.CylinderGeometry(0.06, 0.06, 2, 6), darkWood, 0, 1, 0, pole);
    const geo = flagGeo(), cloth = add(geo, color.isMaterial ? color : toon(color, { side: THREE.DoubleSide }), 0, 1.6, 0, pole);
    flags.push({ cloth, yaw: parent.rotation.y, base: Float32Array.from(geo.attributes.position.array) });
  }
  for (const s of [0, 1]) {
    const sg = s ? 1 : -1, c = new THREE.Group(), roof = teamRoof[s], team = teamFlag[s];
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
  const fadeTrees = []; // near trees get their own materials so the camera can see through them
  function tree(x, y, z, s, k) {
    const mats = [trunkM.clone(), crownMs[k % 3].clone()];
    add(trunkGeo, mats[0], x, y + 0.8 * s, z).scale.set(s, 1.6 * s, s); add(crownGeo, mats[1], x, y + 2.5 * s, z).scale.setScalar(1.15 * s);
    fadeTrees.push({ c: new THREE.Vector3(x, y + 2.2 * s, z), r: 1.5 * s, mats });
  }
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
    fadeTrees,
    setTeamColors(cols) { cols.forEach((c, s) => { teamFlag[s].color.setHex(c); teamRoof[s].color.setHex(c); }); },
    setBlocks, blockMesh: i => blocks[i], blocks, chunks, puff, explode, sparks, group,
    resetBlocks(b) {
      for (const d of debris) d.o.removeFromParent();
      for (const f of fx) f.o.removeFromParent();
      debris.length = 0; fx.length = 0; setBlocks(b);
    },
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
      for (let i = debris.length - 1; i >= 0; i--) { // chunks bounce once, rest, then shrink away
        const d = debris[i];
        if ((d.life -= dt) < 1) { d.o.scale.multiplyScalar(Math.max(0, 1 - dt * 3)); if (d.life <= 0) { d.o.removeFromParent(); debris.splice(i, 1); continue; } }
        if (!d.v) continue;
        d.v.y -= 9.8 * dt; d.o.position.addScaledVector(d.v, dt); d.o.rotation.x += d.spin * dt; d.o.rotation.z += d.spin * 0.7 * dt;
        const floor = Math.max(0, world.groundH(d.o.position.x, d.o.position.z));
        if (d.o.position.y < floor + 0.08) { d.o.position.y = floor + 0.08; d.v = null; }
      }
      for (let i = fx.length - 1; i >= 0; i--) { // puffs / flashes / sparks
        const f = fx[i], u = (f.t += dt) / f.life;
        if (u >= 1) { f.o.removeFromParent(); f.o.material !== sparkM && f.o.material.dispose(); fx.splice(i, 1); continue; }
        if (f.g) f.v.y -= 9.8 * dt;
        f.o.position.addScaledVector(f.v, dt); f.v.multiplyScalar(Math.exp(-dt * (f.g ? 0.5 : 2.5)));
        if (f.grow) f.o.scale.multiplyScalar(1 + f.grow * dt * (1 - u));
        if (f.o.material.transparent) f.o.material.opacity = (1 - u) * (f.o.material === fireM ? 1 : 0.9);
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
