// Arena visuals: sky, terrain, rocks, trees/cacti, wind flags and wind particles.
import * as THREE from 'three';

const mat = c => new THREE.MeshStandardMaterial({ color: c, flatShading: true });
const THEMES = {
  meadow: { sky: [0x4a8fd8, 0xdcefff], fog: [70, 190], rock: 0x8a8a86, particle: 0xc8e070, fall: 0.25,
    ground: (c, h, r) => c.setHSL(0.26 + r * 0.04 - h * 0.006, 0.45, 0.36 + r * 0.05 + h * 0.01) },
  canyon: { sky: [0x5b9bd5, 0xf7dfb5], fog: [70, 200], rock: 0xb0623a, particle: 0xe2c497, fall: -0.05,
    ground: (c, h, r) => h > 1.5 ? c.setHSL(0.04 + r * 0.02, 0.55, 0.4 + 0.07 * Math.sin(h * 1.7)) : c.setHSL(0.09 + r * 0.02, 0.55, 0.62 + r * 0.05) },
  peaks: { sky: [0x7f9fc0, 0xe8eef5], fog: [45, 150], rock: 0x7d8a99, particle: 0xffffff, fall: 1.2,
    ground: (c, h, r) => h > 4 && r < 0.4 ? c.setHSL(0.6, 0.08, 0.5) : c.setHSL(0.58, 0.18 + r * 0.06, 0.84 + r * 0.08) },
};

function makeTree(kind, s) {
  const g = new THREE.Group(), add = (geo, m, y, x = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, 0); o.castShadow = true; g.add(o); return o; };
  if (kind === 'cactus') {
    const m = mat(0x3f8a3a);
    add(new THREE.CylinderGeometry(0.28 * s, 0.3 * s, 2.6 * s, 7), m, 1.3 * s);
    add(new THREE.SphereGeometry(0.28 * s, 7, 5), m, 2.6 * s);
    for (const [x, y, h] of [[0.5, 1.2, 0.8], [-0.5, 1.5, 0.6]]) {
      const arm = add(new THREE.CylinderGeometry(0.15 * s, 0.15 * s, 0.5 * s, 6), m, y * s, x * 0.5 * s); arm.rotation.z = Math.PI / 2;
      add(new THREE.CylinderGeometry(0.15 * s, 0.15 * s, h * s, 6), m, (y + h / 2) * s, x * s);
    }
    return g;
  }
  add(new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 1.3 * s, 6), mat(0x6b4426), 0.65 * s);
  add(new THREE.ConeGeometry(1.2 * s, 2.8 * s, 7), mat(kind === 'snowpine' ? 0x24563a : 0x2f7a3a), 2.6 * s);
  if (kind === 'snowpine') add(new THREE.ConeGeometry(0.62 * s, 1.3 * s, 7), mat(0xf4f8fb), 3.4 * s);
  return g;
}

export function buildArena(scene, world) {
  const T = THEMES[world.id], group = new THREE.Group(), A = world.A;
  scene.fog = new THREE.Fog(T.sky[1], T.fog[0], T.fog[1]);
  { // sky
    const geo = new THREE.SphereGeometry(300, 24, 12), p = geo.attributes.position, cols = [];
    const top = new THREE.Color(T.sky[0]), bot = new THREE.Color(T.sky[1]);
    for (let i = 0; i < p.count; i++) { const c = bot.clone().lerp(top, Math.pow(Math.max(0, p.getY(i) / 300), 0.6)); cols.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  }
  { // terrain
    const geo = new THREE.PlaneGeometry(170, 110, 85, 55).rotateX(-Math.PI / 2).toNonIndexed();
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
  }
  const rockMat = mat(T.rock);
  for (const r of world.rocks) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
    m.scale.set(r.sx, r.sy, r.sz); m.position.set(r.x, r.y, r.z); m.castShadow = m.receiveShadow = true; group.add(m);
  }
  const sway = world.trees.map(t => {
    const pivot = new THREE.Group(), tree = makeTree(A.tree, t.s);
    tree.rotation.y = t.x; pivot.add(tree); pivot.position.set(t.x, t.y, t.z); group.add(pivot);
    return { pivot, ph: t.x * 1.3 };
  });
  // wind flags next to each archer
  const flags = [-1, 1].map((side, i) => {
    const pole = new THREE.Group(); pole.position.set(side * 14, world.groundH(side * 14, side * 6), side * 6); group.add(pole); // flags stand off to each side
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), mat(0x5a3d22)); stick.position.y = 1.6; stick.castShadow = true; pole.add(stick);
    const geo = new THREE.PlaneGeometry(1.2, 0.7, 10, 1).translate(0.6, 0, 0);
    const cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: i ? 0xd63a2f : 0x2f6fd6, side: THREE.DoubleSide, flatShading: true }));
    cloth.position.y = 2.8; cloth.castShadow = true; pole.add(cloth);
    return { cloth, base: Float32Array.from(geo.attributes.position.array) };
  });
  // wind particles (leaves / dust / snow)
  const N = 260, pp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) pp.set([(Math.random() - 0.5) * 90, Math.random() * 14, (Math.random() - 0.5) * 44], i * 3);
  const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pp, 3)),
    new THREE.PointsMaterial({ color: T.particle, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false }));
  group.add(pts);
  scene.add(group);

  return {
    update(dt, t, wind) {
      const s = Math.hypot(wind.x, wind.z), ang = Math.atan2(-wind.z, wind.x);
      for (const { pivot, ph } of sway) {
        const w = 0.012 * (1 + Math.sin(t * 1.8 + ph) * 0.5);
        pivot.rotation.z = -wind.x * w; pivot.rotation.x = wind.z * w;
      }
      for (const f of flags) {
        f.cloth.rotation.y = ang;
        const p = f.cloth.geometry.attributes.position, droop = Math.max(0, 1 - s / 2.5);
        for (let i = 0; i < p.count; i++) {
          const x = f.base[i * 3];
          p.setZ(i, Math.sin(x * 5 - t * (5 + s * 2)) * 0.07 * x * (0.4 + s * 0.3));
          p.setY(i, f.base[i * 3 + 1] - droop * x * 0.6);
        }
        p.needsUpdate = true;
      }
      const a = pts.geometry.attributes.position;
      for (let i = 0; i < N; i++) {
        let x = a.getX(i) + wind.x * 2 * dt + Math.sin(t + i) * 0.3 * dt, y = a.getY(i) - T.fall * dt + Math.cos(t * 1.3 + i) * 0.2 * dt, z = a.getZ(i) + wind.z * 2 * dt;
        if (x > 45) x -= 90; if (x < -45) x += 90; if (z > 22) z -= 44; if (z < -22) z += 44; if (y < 0) y += 14; if (y > 14) y -= 14;
        a.setXYZ(i, x, y, z);
      }
      a.needsUpdate = true;
    },
    dispose() {
      scene.remove(group);
      group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    },
  };
}
