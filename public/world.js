// Castle-siege arena visuals: sky, field, moat, two castles with destructible merlons, banners, torches, siege camp, weather.
import * as THREE from 'three';
import { DIST, WALL_H, PARAPET, BREAST, MERLON_H, MERLON_Z, MERLON_HP, merlonBox, castleBoxes } from './sim.js';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...o });
const THEMES = {
  field: { sky: [0x4a8fd8, 0xdcefff], fog: [80, 200], hemi: 1.6, sun: [0xfff4e0, 2.2], torch: 6, stone: 0xc9bfae, water: 0x3b6e8f,
    weather: 'pollen', ground: (c, h, r) => c.setHSL(0.26 + r * 0.04 - h * 0.006, 0.45, 0.36 + r * 0.05 + h * 0.01) },
  dusk: { sky: [0x2b2f4a, 0xd98c5f], fog: [45, 150], hemi: 0.75, sun: [0xffb07a, 1.1], torch: 14, stone: 0x9d968f, water: 0x2a3b48,
    weather: 'rain', ground: (c, h, r) => c.setHSL(0.22 + r * 0.04, 0.3, 0.24 + r * 0.05 + h * 0.01) },
  winter: { sky: [0x7f9fc0, 0xe8eef5], fog: [45, 150], hemi: 1.5, sun: [0xf2f6ff, 1.7], torch: 8, stone: 0xb7bcc4, water: 0xcfe3ee,
    weather: 'snow', snow: true, ground: (c, h, r) => c.setHSL(0.58, 0.18 + r * 0.06, 0.84 + r * 0.08) },
};
const COLORS = [0x2f6fd6, 0xd63a2f];

// ---------- procedural textures ----------
const texCache = {};
function canvasTex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return (texCache[key] = t);
}
const stoneTex = () => canvasTex('stone', 256, 256, (g, w, h) => { // ashlar blocks: 4 rows x 2 per 2 m tile
  g.fillStyle = '#6d6a66'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) {
    const x = k * 128 + (r % 2) * 64, y = r * 64, l = 150 + Math.random() * 60;
    g.fillStyle = `rgb(${l},${l - 4},${l - 12})`; g.fillRect(x + 3, y + 3, 122, 58);
    for (let i = 0; i < 30; i++) { const d = Math.random() * 30 - 15; g.fillStyle = `rgba(${l + d},${l + d},${l + d - 10},.5)`; g.fillRect(x + 3 + Math.random() * 118, y + 3 + Math.random() * 54, 4, 4); }
  }
});
export function heraldry(i) { // Blue: gold chevron; Red: gold cross
  return canvasTex('herald' + i, 128, 160, (g, w, h) => {
    g.fillStyle = i ? '#b42a22' : '#1f4fae'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e8c25a'; g.fillStyle = '#e8c25a'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    if (i) { g.fillRect(w / 2 - 12, 18, 24, h - 36); g.fillRect(18, h * 0.38, w - 36, 24); }
    else { g.lineWidth = 22; g.beginPath(); g.moveTo(14, h * 0.72); g.lineTo(w / 2, h * 0.32); g.lineTo(w - 14, h * 0.72); g.stroke(); g.beginPath(); g.arc(w / 2, h * 0.17, 9, 0, 7); g.fill(); }
  });
}
const tentTex = () => canvasTex('tent', 64, 64, (g, w, h) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#f1e6cf' : '#9b2c2c'; g.fillRect(k * 8, 0, 8, h); } });
// Box whose UVs are scaled to its size so the stone pattern keeps a constant scale (2 m per tile)
function stoneBox(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / 2, uv.getY(i) * dims[f][1] / 2); }
  return geo;
}

function makeTrebuchet(m) {
  const g = new THREE.Group(), add = (geo, x, y, z, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.z = rz; o.castShadow = true; g.add(o); };
  add(new THREE.BoxGeometry(4, 0.3, 0.3), 0, 0.2, -0.9); add(new THREE.BoxGeometry(4, 0.3, 0.3), 0, 0.2, 0.9);
  for (const z of [-0.9, 0.9]) { add(new THREE.BoxGeometry(0.25, 3.4, 0.25), -0.6, 1.7, z, -0.32); add(new THREE.BoxGeometry(0.25, 3.4, 0.25), 0.6, 1.7, z, 0.32); }
  add(new THREE.BoxGeometry(0.2, 0.2, 2), 0, 3.2, 0);
  add(new THREE.BoxGeometry(5, 0.2, 0.2), 0.6, 3.6, 0, 0.5);
  add(new THREE.BoxGeometry(0.8, 0.8, 0.8), -1.6, 2.4, 0);
  return g;
}

export function buildArena(scene, world, lights) {
  const T = THEMES[world.id], group = new THREE.Group();
  scene.fog = new THREE.Fog(T.sky[1], T.fog[0], T.fog[1]);
  lights.hemi.intensity = T.hemi; lights.sun.color.setHex(T.sun[0]); lights.sun.intensity = T.sun[1];
  { // sky
    const geo = new THREE.SphereGeometry(300, 24, 12), p = geo.attributes.position, cols = [];
    const top = new THREE.Color(T.sky[0]), bot = new THREE.Color(T.sky[1]);
    for (let i = 0; i < p.count; i++) { const c = bot.clone().lerp(top, Math.pow(Math.max(0, p.getY(i) / 300), 0.6)); cols.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  }
  { // field
    const geo = new THREE.PlaneGeometry(170, 110, 110, 55).rotateX(-Math.PI / 2).toNonIndexed();
    const p = geo.attributes.position, cols = [], c = new THREE.Color();
    for (let i = 0; i < p.count; i++) p.setY(i, world.groundH(p.getX(i), p.getZ(i)));
    for (let i = 0; i < p.count; i += 3) {
      T.ground(c, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, Math.random());
      for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }));
    ground.receiveShadow = true; group.add(ground);
    for (const s of [-1, 1]) { // moat water
      const w = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2 * world.A.wallZ + 6).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: T.water, roughness: T.snow ? 0.6 : 0.15, metalness: 0.1, transparent: !T.snow, opacity: 0.88 }));
      w.position.set(s * 17.8, -0.75, 0); group.add(w);
    }
  }
  const stoneM = mat(T.stone, { map: stoneTex(), flatShading: false }), crackM = mat(new THREE.Color(T.stone).multiplyScalar(0.7), { map: stoneTex(), flatShading: false });
  const snowM = mat(0xf4f8fb), woodM = mat(0x7a5532), darkM = mat(0x1d1a17);
  const addMesh = (geo, m, x, y, z, parent = group) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  // ---------- castles ----------
  const torches = [];
  for (const s of [0, 1]) {
    const sg = s ? 1 : -1;
    for (const b of castleBoxes(s)) {
      const w = b.x1 - b.x0, h = b.y1 - b.y0, d = b.z1 - b.z0;
      addMesh(stoneBox(w, h, d), stoneM, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
      if (h > WALL_H + 2) for (const [dx, dz] of [[-1.7, -1.1], [-1.7, 1.1], [1.7, -1.1], [1.7, 1.1], [0, -1.1], [0, 1.1]]) { // tower crenellations
        const m = addMesh(stoneBox(0.7, 0.9, 0.7), stoneM, (b.x0 + b.x1) / 2 + dx, b.y1 + 0.45, (b.z0 + b.z1) / 2 + dz);
        if (T.snow) addMesh(new THREE.BoxGeometry(0.72, 0.1, 0.72), snowM, 0, 0.5, 0, m);
      }
    }
    for (const z of [-4.5, 4.5]) addMesh(new THREE.BoxGeometry(0.06, 1.1, 0.22), darkM, sg * 20.37, 2.6, z); // arrow slits
    addMesh(new THREE.BoxGeometry(0.06, 2.6, 1.8), darkM, sg * 20.37, 1.3 - 0.3, 0); // gate
    for (const z of [-3.2, 3.2]) { // hanging heraldic banner on the wall front
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2), new THREE.MeshStandardMaterial({ map: heraldry(s), side: THREE.DoubleSide }));
      ban.position.set(sg * 20.36, WALL_H - 1.4, z); ban.rotation.y = -sg * Math.PI / 2; group.add(ban);
    }
    for (const z of [-5.8, 5.8]) { // torches at the ends of the walkway
      const tx = sg * 21.2;
      addMesh(new THREE.CylinderGeometry(0.04, 0.05, 1.3, 5), woodM, tx, WALL_H + 0.65, z);
      const flame = addMesh(new THREE.ConeGeometry(0.11, 0.32, 6), new THREE.MeshBasicMaterial({ color: 0xffb347 }), tx, WALL_H + 1.45, z);
      flame.castShadow = false;
      torches.push({ flame, ph: Math.random() * 10 });
    }
    const light = new THREE.PointLight(0xff9a3c, T.torch, 9, 1.6); light.position.set(sg * 21.2, WALL_H + 1.7, 0); group.add(light);
    torches.push({ light, ph: Math.random() * 10 });
  }
  // destructible merlons
  const merlons = [];
  for (let id = 0; id < MERLON_Z.length * 2; id++) {
    const b = merlonBox(id), home = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    const m = addMesh(stoneBox(PARAPET[1] - PARAPET[0], MERLON_H, 1), stoneM, home.x, home.y, home.z);
    if (T.snow) addMesh(new THREE.BoxGeometry(0.52, 0.1, 1.02), snowM, 0, 0.53, 0, m);
    merlons.push({ m, home, hp: MERLON_HP });
  }
  const debris = [];
  function chunks(pos, n, outward) {
    for (let k = 0; k < n; k++) {
      const c = addMesh(new THREE.BoxGeometry(0.18, 0.14, 0.16), crackM, pos.x, pos.y, pos.z);
      debris.push({ o: c, v: new THREE.Vector3(outward * (1 + Math.random() * 2), 2 + Math.random() * 2, (Math.random() - 0.5) * 3), spin: Math.random() * 8, chunk: true });
    }
  }
  function setMerlon(id, hp, animate) {
    const M = merlons[id], m = M.m, out = id < MERLON_Z.length ? 1 : -1; // debris falls toward the field
    if (hp === M.hp) return;
    if (hp >= MERLON_HP) { // restore
      group.attach(m); m.position.copy(M.home); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); m.material = stoneM; m.visible = true;
    } else if (hp === 1) { // cracked: chipped top, darker, a few chunks fly off
      m.material = crackM; m.scale.set(1, 0.75, 0.85); m.position.y = M.home.y - 0.125; m.rotation.set(0.05, 0.1, -0.04 * out);
      if (animate) chunks(M.home.clone().add(new THREE.Vector3(0, 0.4, 0)), 4, out);
    } else if (animate) { // knocked off: tumbles into the moat
      m.material = crackM;
      debris.push({ o: m, v: new THREE.Vector3(out * (1.5 + Math.random()), 2.5, (Math.random() - 0.5) * 2), spin: 5 });
      chunks(M.home, 6, out);
    } else m.visible = false;
    M.hp = hp;
  }
  // ---------- siege camp ----------
  for (const p of world.props) {
    if (p.kind === 'stone') { addMesh(stoneBox(p.sx, p.sy, p.sz), stoneM, p.x, p.y + p.sy / 2, p.z); continue; }
    const crate = addMesh(new THREE.BoxGeometry(p.sx, p.sy, p.sz), woodM, p.x, p.y + p.sy / 2, p.z);
    if (p.sy > 2.5) for (let z = -p.sz / 2 + 0.25; z < p.sz / 2; z += 0.5) addMesh(new THREE.ConeGeometry(0.18, 0.5, 5), woodM, p.x, p.y + p.sy + 0.25, z); // palisade stakes
    if (T.snow) addMesh(new THREE.BoxGeometry(p.sx + 0.04, 0.12, p.sz + 0.04), snowM, 0, p.sy / 2 + 0.06, 0, crate);
  }
  const tentM = mat(0xffffff, { map: tentTex() });
  for (const t of world.tents) {
    addMesh(new THREE.ConeGeometry(t.r, t.h, 8), tentM, t.x, t.y + t.h / 2, t.z);
    addMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 4), woodM, t.x, t.y + t.h + 0.3, t.z);
  }
  const treb = makeTrebuchet(woodM); treb.position.set(-4, world.groundH(-4, -17), -17); treb.rotation.y = 0.4; group.add(treb);
  // ---------- tower banners that blow in the wind ----------
  const banners = [];
  for (const s of [0, 1]) for (const z of [-8.5, 8.5]) {
    const x = (s ? 1 : -1) * 22.2, pole = new THREE.Group(); pole.position.set(x, WALL_H + 3.9, z); group.add(pole);
    addMesh(new THREE.CylinderGeometry(0.05, 0.06, 3, 6), woodM, 0, 1.5, 0, pole);
    const geo = new THREE.PlaneGeometry(1.8, 1.1, 12, 1).translate(0.9, 0, 0);
    const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: heraldry(s), side: THREE.DoubleSide }));
    cloth.position.y = 2.4; cloth.castShadow = true; pole.add(cloth);
    banners.push({ cloth, base: Float32Array.from(geo.attributes.position.array) });
  }
  // ---------- weather ----------
  const N = T.weather === 'rain' ? 700 : 300, pp = new Float32Array(N * (T.weather === 'rain' ? 6 : 3));
  const weather = T.weather === 'rain'
    ? new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pp, 3)), new THREE.LineBasicMaterial({ color: 0xaab8d0, transparent: true, opacity: 0.5 }))
    : new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pp, 3)),
      new THREE.PointsMaterial({ color: T.weather === 'snow' ? 0xffffff : 0xe8e070, size: T.weather === 'snow' ? 0.14 : 0.1, transparent: true, opacity: 0.9, depthWrite: false }));
  weather.frustumCulled = false; group.add(weather);
  const drops = Array.from({ length: N }, () => new THREE.Vector3((Math.random() - 0.5) * 40, Math.random() * 20, (Math.random() - 0.5) * 40));
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
      for (const b of banners) {
        b.cloth.rotation.y = ang;
        const p = b.cloth.geometry.attributes.position, droop = Math.max(0, 1 - s / 2.5);
        for (let i = 0; i < p.count; i++) {
          const x = b.base[i * 3];
          p.setZ(i, Math.sin(x * 4 - t * (5 + s * 2)) * 0.08 * x * (0.4 + s * 0.3));
          p.setY(i, b.base[i * 3 + 1] - droop * x * 0.55);
        }
        p.needsUpdate = true;
      }
      for (const tc of torches) {
        const f = 0.75 + 0.25 * Math.sin(t * 13 + tc.ph) * Math.sin(t * 7.3 + tc.ph * 2);
        if (tc.light) tc.light.intensity = T.torch * f;
        else { tc.flame.scale.set(1, f * 1.2, 1); tc.flame.rotation.z = -wind.x * 0.08; tc.flame.rotation.x = wind.z * 0.08; }
      }
      for (const d of debris) {
        if (!d.v) continue;
        d.v.y -= 9.8 * dt; d.o.position.addScaledVector(d.v, dt); d.o.rotation.x += d.spin * dt; d.o.rotation.z += d.spin * 0.7 * dt;
        const floor = Math.max(world.groundH(d.o.position.x, d.o.position.z), Math.abs(d.o.position.x) > 15.5 && Math.abs(d.o.position.x) < 20 ? -0.8 : -9);
        if (d.o.position.y < floor + 0.1) { d.o.position.y = floor + 0.1; d.v = null; }
      }
      // weather around the camera
      const a = weather.geometry.attributes.position, rain = T.weather === 'rain', fall = rain ? 16 : T.weather === 'snow' ? 1.3 : 0.1;
      for (let i = 0; i < N; i++) {
        const d = drops[i];
        d.x += (wind.x * (rain ? 1.5 : 2) + Math.sin(t + i) * 0.3) * dt; d.y -= fall * dt; d.z += wind.z * 2 * dt;
        if (d.y < 0) d.y += 20; if (d.y > 20) d.y -= 20;
        for (const k of ['x', 'z']) { if (d[k] > 20) d[k] -= 40; if (d[k] < -20) d[k] += 40; }
        const x = cam.x + d.x, y = cam.y - 8 + d.y, z = cam.z + d.z;
        if (rain) { a.setXYZ(i * 2, x, y, z); a.setXYZ(i * 2 + 1, x - wind.x * 0.05, y - 0.5, z - wind.z * 0.05); } else a.setXYZ(i, x, y, z);
      }
      a.needsUpdate = true;
      if (rain) { // lightning
        if ((nextBolt -= dt) <= 0) { nextBolt = 7 + Math.random() * 10; flashT = 0.25; setTimeout(() => sfx && sfx.thunder(), 500); }
        flashT = Math.max(0, flashT - dt);
        lights.hemi.intensity = T.hemi + (flashT > 0.12 || (flashT > 0 && flashT < 0.06) ? 2.5 : 0);
      }
    },
    dispose() {
      scene.remove(group);
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}
