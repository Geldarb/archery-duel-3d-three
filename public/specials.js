// Client-side registry for special projectiles (models, HUD icons, pickup balloons). Gameplay numbers live in sim.js ARROWS;
// landing behaviour in physics.js. To add a special: an ARROWS entry + a physics landing handler + an entry here.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, noOutline } from './world.js';

const add = (p, geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };

function bombModel() { // round black cartoon bomb with a brass cap, fuse and glowing spark
  const g = new THREE.Group();
  add(g, new THREE.SphereGeometry(0.34, 20, 14), toon(0x2b2b34));
  add(g, new THREE.SphereGeometry(1, 10, 8), noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })), -0.1, 0.17, 0.12).scale.set(0.09, 0.05, 0.06);
  add(g, new THREE.CylinderGeometry(0.11, 0.13, 0.12, 12), toon(0xc9a24a), 0, 0.36, 0);
  const fuse = add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6), toon(0x8a6a3a), 0.04, 0.5, 0); fuse.rotation.z = -0.4;
  const spark = add(g, new THREE.SphereGeometry(0.07, 8, 6), noOutline(new THREE.MeshBasicMaterial({ color: 0xffd23f })), 0.09, 0.62, 0);
  g.userData.tick = t => spark.scale.setScalar(0.8 + Math.sin(t * 40) * 0.4);
  return g;
}
function wheelchairModel() { // friendly cartoon wheelchair in castle colours: big spoked wheels, padded seat, push handles
  const g = new THREE.Group(), frame = toon(0x9aa3b2), seat = toon(0x2f6fe0), tyre = toon(0x2a2a30), gold = toon(0xf4c430);
  for (const z of [-0.3, 0.3]) {
    const w = new THREE.Group(); w.position.set(0, 0.32, z); g.add(w);
    add(w, new THREE.TorusGeometry(0.3, 0.05, 8, 22), tyre);
    add(w, new THREE.TorusGeometry(0.25, 0.018, 6, 20), gold);
    for (let k = 0; k < 4; k++) add(w, new THREE.BoxGeometry(0.5, 0.025, 0.02), frame).rotation.z = k * Math.PI / 4;
    add(w, new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), gold).rotation.x = Math.PI / 2;
    add(g, new THREE.TorusGeometry(0.07, 0.025, 6, 12), tyre, 0.36, 0.08, z * 0.8);   // front casters
  }
  add(g, new RoundedBoxGeometry(0.5, 0.08, 0.56, 2, 0.03), seat, 0.08, 0.45, 0);    // seat
  add(g, new RoundedBoxGeometry(0.08, 0.48, 0.56, 2, 0.03), seat, -0.18, 0.72, 0);  // back
  for (const z of [-0.28, 0.28]) {
    add(g, new THREE.CylinderGeometry(0.022, 0.022, 0.62, 6), frame, -0.22, 0.68, z);
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.14, 6), tyre, -0.3, 0.98, z).rotation.z = Math.PI / 2; // grips
    add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.36, 6), frame, 0.3, 0.27, z).rotation.z = 0.5;          // leg rest
  }
  add(g, new RoundedBoxGeometry(0.14, 0.03, 0.5, 1, 0.01), frame, 0.42, 0.12, 0); // footplate
  const pivot = new THREE.Group(); g.position.y = -0.36; pivot.add(g);
  return pivot;
}
// ---------- v6.0 fun batch ----------
function chickenModel() { // floppy yellow rubber chicken: plump body, long bendy neck, red comb, orange beak, dangly legs
  const g = new THREE.Group(), y = toon(0xffd84a), red = toon(0xe0342c), orange = toon(0xff9a1a), eye = toon(0x1d1d24);
  add(g, new THREE.SphereGeometry(0.22, 16, 12), y, -0.25, 0, 0).scale.set(1.35, 0.8, 0.8);
  add(g, new THREE.ConeGeometry(0.12, 0.22, 10), y, -0.58, 0.06, 0).rotation.z = Math.PI / 2 + 0.5; // tail
  for (const z of [-0.17, 0.17]) add(g, new THREE.SphereGeometry(0.1, 10, 8), y, -0.25, 0.02, z).scale.set(1.3, 0.5, 0.4); // wings
  const neck = new THREE.Group(); neck.position.set(-0.02, 0.04, 0); g.add(neck);
  add(neck, new THREE.CylinderGeometry(0.055, 0.075, 0.36, 10), y, 0.14, 0.04, 0).rotation.z = -Math.PI / 2 + 0.35;
  const head = new THREE.Group(); head.position.set(0.32, 0.1, 0); neck.add(head);
  add(head, new THREE.SphereGeometry(0.1, 12, 10), y);
  add(head, new THREE.ConeGeometry(0.045, 0.14, 8), orange, 0.13, -0.02, 0).rotation.z = -Math.PI / 2;
  for (const x of [-0.04, 0.02, 0.07]) add(head, new THREE.SphereGeometry(0.035, 8, 6), red, x, 0.1, 0);
  add(head, new THREE.SphereGeometry(0.03, 8, 6), red, 0.06, -0.1, 0).scale.y = 1.5; // wattle
  for (const z of [-0.07, 0.07]) add(head, new THREE.SphereGeometry(0.02, 6, 4), eye, 0.06, 0.03, z);
  const legs = [];
  for (const z of [-0.08, 0.08]) { const l = new THREE.Group(); l.position.set(-0.22, -0.15, z); g.add(l); legs.push(l); add(l, new THREE.CylinderGeometry(0.018, 0.018, 0.22, 6), orange, 0, -0.1, 0); add(l, new THREE.ConeGeometry(0.05, 0.08, 3), orange, 0.02, -0.22, 0).rotation.z = -Math.PI / 2; }
  g.userData.tick = t => { neck.rotation.z = Math.sin(t * 13) * 0.55; head.rotation.z = Math.sin(t * 13 + 1) * 0.4; legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 17 + i * 2) * 0.8; }); };
  return g;
}
function cowModel() { // chunky black-and-white cartoon cow, faces +x
  const g = new THREE.Group(), w = toon(0xfafafa), blk = toon(0x26262c), pink = toon(0xffa6b8), horn = toon(0xf3e6c4);
  add(g, new RoundedBoxGeometry(0.95, 0.52, 0.52, 3, 0.16), w, 0, 0.62, 0);
  for (const [x, y, z, r] of [[0.15, 0.75, 0.25, 0.14], [-0.25, 0.6, -0.25, 0.16], [-0.3, 0.82, 0.12, 0.12], [0.25, 0.86, -0.08, 0.1]]) add(g, new THREE.SphereGeometry(r, 10, 8), blk, x, y, z).scale.set(1.3, 1, 0.35 + Math.abs(z) * 2.2);
  const head = new THREE.Group(); head.position.set(0.55, 0.85, 0); g.add(head);
  add(head, new RoundedBoxGeometry(0.32, 0.34, 0.34, 2, 0.1), w);
  add(head, new RoundedBoxGeometry(0.16, 0.2, 0.3, 2, 0.07), pink, 0.17, -0.07, 0);
  for (const z of [-0.07, 0.07]) { add(head, new THREE.SphereGeometry(0.022, 6, 4), blk, 0.25, -0.04, z); add(head, new THREE.SphereGeometry(0.035, 8, 6), blk, 0.13, 0.08, z * 1.6); }
  for (const z of [-1, 1]) { add(head, new THREE.ConeGeometry(0.035, 0.14, 6), horn, -0.02, 0.2, z * 0.12).rotation.x = -z * 0.5; add(head, new THREE.SphereGeometry(0.07, 8, 6), w, -0.04, 0.08, z * 0.2).scale.set(0.5, 0.6, 1.3); }
  const legs = [];
  for (const [x, z] of [[0.32, 0.17], [0.32, -0.17], [-0.32, 0.17], [-0.32, -0.17]]) { const l = new THREE.Group(); l.position.set(x, 0.42, z); g.add(l); legs.push(l); add(l, new THREE.CylinderGeometry(0.07, 0.07, 0.34, 8), w, 0, -0.17, 0); add(l, new THREE.CylinderGeometry(0.075, 0.075, 0.08, 8), blk, 0, -0.36, 0); }
  add(g, new THREE.SphereGeometry(0.1, 10, 8), pink, -0.05, 0.36, 0).scale.set(1.2, 0.6, 1); // udder
  const tail = add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.36, 5), w, -0.52, 0.66, 0); tail.rotation.z = -0.3;
  g.userData.legs = legs; g.userData.head = head;
  g.userData.tick = t => { legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 14 + i * 1.6) * 0.9; }); head.rotation.z = Math.sin(t * 6) * 0.2; tail.rotation.z = -0.3 + Math.sin(t * 9) * 0.5; };
  const pivot = new THREE.Group(); g.position.y = -0.6; pivot.add(g); pivot.userData.inner = g;
  return pivot;
}
export function bootModel(scale = 1) { // big brown cartoon boot, toe points +x, sole at y = 0 (scale up for the giant stomp)
  const g = new THREE.Group(), leather = toon(0x8a4b22), sole = toon(0x3a2416), lace = toon(0xf4e3b0), cuff = toon(0xb86a33);
  add(g, new THREE.CylinderGeometry(0.2, 0.22, 0.5, 16), leather, -0.06, 0.38, 0);
  add(g, new THREE.CylinderGeometry(0.235, 0.235, 0.1, 16), cuff, -0.06, 0.64, 0);
  add(g, new RoundedBoxGeometry(0.62, 0.24, 0.36, 3, 0.1), leather, 0.1, 0.14, 0);
  add(g, new THREE.SphereGeometry(0.18, 14, 10), leather, 0.34, 0.15, 0).scale.set(1, 0.75, 1.02);
  add(g, new RoundedBoxGeometry(0.72, 0.07, 0.4, 2, 0.03), sole, 0.12, 0.035, 0);
  for (const y of [0.3, 0.4, 0.5]) add(g, new THREE.BoxGeometry(0.03, 0.025, 0.22), lace, 0.15, y, 0).rotation.z = 0.2;
  g.scale.setScalar(scale);
  return g;
}
function bootProjectile() { const p = new THREE.Group(), b = bootModel(0.9); b.position.set(-0.1, -0.3, 0); p.add(b); return p; }
const svg = (inner, bg = '') => `<svg viewBox="0 0 40 40">${bg}${inner}</svg>`;
export const SPECIAL_UI = {
  bomb: { model: bombModel, color: 0xe0342c, label: 'Bomb',
    icon: svg('<circle cx="18" cy="23" r="11" fill="#2b2b34" stroke="#111" stroke-width="1.5"/><rect x="15" y="9.5" width="7" height="4" rx="1" fill="#c9a24a" stroke="#111" stroke-width="1.2"/><path d="M21 10q4-5 8-3" stroke="#8a6a3a" stroke-width="2" fill="none"/><circle cx="30" cy="7" r="3" fill="#ffd23f"/><ellipse cx="14" cy="19" rx="3" ry="2" fill="#fff" opacity=".6"/>'),
    spin: false },
  wheelchair: { model: wheelchairModel, color: 0x2f6fe0, label: 'Chair',
    icon: svg('<circle cx="16" cy="26" r="9" fill="none" stroke="#2a2a30" stroke-width="3"/><circle cx="16" cy="26" r="2" fill="#f4c430"/><path d="M12 11v11h12l4 8" stroke="#9aa3b2" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="12" y="17" width="12" height="4" rx="1.5" fill="#2f6fe0"/><circle cx="30" cy="31" r="2.6" fill="#2a2a30"/><path d="M7 14l4-3" stroke="#2a2a30" stroke-width="3" stroke-linecap="round"/>'),
    spin: true },
  chicken: { model: chickenModel, color: 0xffd84a, label: 'Chicken',
    icon: svg('<ellipse cx="16" cy="25" rx="10" ry="7" fill="#ffd84a" stroke="#111" stroke-width="1.5"/><path d="M22 22q4-8 6-12" stroke="#ffd84a" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M22 22q4-8 6-12" stroke="#111" stroke-width="1" fill="none" opacity=".3"/><circle cx="29" cy="9" r="4.5" fill="#ffd84a" stroke="#111" stroke-width="1.5"/><path d="M33 9l5 1.5-5 1.5z" fill="#ff9a1a" stroke="#111" stroke-width="1"/><path d="M26 5q1-3 3-1q1-3 3 0" fill="#e0342c" stroke="#111" stroke-width="1"/><circle cx="30" cy="8.5" r="1" fill="#111"/><path d="M14 32v5M19 32v5" stroke="#ff9a1a" stroke-width="2"/>'),
    spin: false },
  cow: { model: cowModel, color: 0x26262c, label: 'Cow',
    icon: svg('<rect x="5" y="15" width="22" height="13" rx="5" fill="#fafafa" stroke="#111" stroke-width="1.5"/><ellipse cx="12" cy="20" rx="4" ry="3" fill="#26262c"/><ellipse cx="21" cy="25" rx="3" ry="2" fill="#26262c"/><rect x="25" y="10" width="11" height="11" rx="3.5" fill="#fafafa" stroke="#111" stroke-width="1.5"/><rect x="29" y="16" width="8" height="6" rx="2.5" fill="#ffa6b8" stroke="#111" stroke-width="1"/><path d="M26 10l-2-4M35 10l2-4" stroke="#f3e6c4" stroke-width="2.4" stroke-linecap="round"/><path d="M9 28v6M23 28v6" stroke="#fafafa" stroke-width="3.4"/><path d="M9 28v6M23 28v6" stroke="#111" stroke-width="1" opacity=".4"/>'),
    spin: false },
  boot: { model: bootProjectile, color: 0x8a4b22, label: 'Boot',
    icon: svg('<path d="M10 4h12v17q8 1 12 5 2 3 0 6H6v-8q4-3 4-8z" fill="#8a4b22" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/><rect x="5" y="31" width="30" height="5" rx="2" fill="#3a2416" stroke="#111" stroke-width="1.2"/><rect x="9" y="3" width="14" height="4" rx="1.5" fill="#b86a33" stroke="#111" stroke-width="1.2"/><path d="M15 12h6M15 16h6M15 20h6" stroke="#f4e3b0" stroke-width="1.8"/>'),
    spin: false },
};
// floating power-up: a balloon carrying a crate that shows the special inside, with a glow and a bob
export function pickupModel(kind) {
  const UI = SPECIAL_UI[kind], g = new THREE.Group();
  const balloon = add(g, new THREE.SphereGeometry(0.55, 20, 16), toon(0xffc928)); // gold "mystery" balloon; the crate shows what is inside balloon.position.y = 0.62; balloon.scale.y = 1.15;
  add(g, new THREE.ConeGeometry(0.1, 0.14, 8), toon(UI.color), 0, -0.03, 0).rotation.x = Math.PI;
  add(g, new THREE.SphereGeometry(1, 10, 8), noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })), -0.2, 0.9, 0.3).scale.set(0.1, 0.16, 0.08);
  add(g, new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff })), 0, -0.12, 0);
  const crate = add(g, new RoundedBoxGeometry(0.62, 0.5, 0.62, 2, 0.06), toon(0xc98a4b), 0, -0.45, 0); crate.scale.setScalar(0.85);
  const tex = new THREE.CanvasTexture(Object.assign(document.createElement('canvas'), { width: 64, height: 64 }));
  { const c = tex.image.getContext('2d'); c.fillStyle = '#ffe9a8'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#7a4a1a'; c.font = 'bold 50px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 32, 35); tex.needsUpdate = true; tex.colorSpace = THREE.SRGBColorSpace; }
  for (const z of [-0.315, 0.315]) add(crate, new THREE.PlaneGeometry(0.4, 0.34), noOutline(toon(0xffffff, { map: tex })), 0, 0, z).rotation.y = z < 0 ? Math.PI : 0;
  const inside = UI.model(); inside.scale.setScalar(0.45); inside.position.set(0, 0.32, 0); crate.add(inside);
  const glow = add(g, new THREE.SphereGeometry(1.0, 18, 12), noOutline(new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.22, depthWrite: false })), 0, 0.1, 0);
  glow.castShadow = false;
  g.userData.tick = t => { g.position.y = g.userData.y + Math.sin(t * 2.2) * 0.18; g.rotation.y = Math.sin(t * 0.9) * 0.5; glow.material.opacity = 0.16 + 0.1 * Math.sin(t * 4); glow.scale.setScalar(1 + 0.08 * Math.sin(t * 4)); };
  return g;
}
