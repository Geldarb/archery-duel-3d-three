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
const svg = (inner, bg = '') => `<svg viewBox="0 0 40 40">${bg}${inner}</svg>`;
export const SPECIAL_UI = {
  bomb: { model: bombModel, color: 0xe0342c, label: 'Bomb',
    icon: svg('<circle cx="18" cy="23" r="11" fill="#2b2b34" stroke="#111" stroke-width="1.5"/><rect x="15" y="9.5" width="7" height="4" rx="1" fill="#c9a24a" stroke="#111" stroke-width="1.2"/><path d="M21 10q4-5 8-3" stroke="#8a6a3a" stroke-width="2" fill="none"/><circle cx="30" cy="7" r="3" fill="#ffd23f"/><ellipse cx="14" cy="19" rx="3" ry="2" fill="#fff" opacity=".6"/>'),
    spin: false },
  wheelchair: { model: wheelchairModel, color: 0x2f6fe0, label: 'Chair',
    icon: svg('<circle cx="16" cy="26" r="9" fill="none" stroke="#2a2a30" stroke-width="3"/><circle cx="16" cy="26" r="2" fill="#f4c430"/><path d="M12 11v11h12l4 8" stroke="#9aa3b2" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="12" y="17" width="12" height="4" rx="1.5" fill="#2f6fe0"/><circle cx="30" cy="31" r="2.6" fill="#2a2a30"/><path d="M7 14l4-3" stroke="#2a2a30" stroke-width="3" stroke-linecap="round"/>'),
    spin: true },
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
