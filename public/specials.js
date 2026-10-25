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

// ---------- v6.1 fun drop 2 ----------
export function pigeonModel() { // plump grey cartoon pigeon, faces +x, wings flap via tick
  const g = new THREE.Group(), grey = toon(0x8f96a3), dark = toon(0x5a606c), teal = toon(0x3fae9a), orange = toon(0xff9a1a), eye = toon(0x1d1d24);
  add(g, new THREE.SphereGeometry(0.2, 14, 10), grey).scale.set(1.4, 0.9, 0.9);
  add(g, new THREE.SphereGeometry(0.13, 12, 10), teal, 0.2, 0.1, 0).scale.set(0.9, 0.9, 1.05); // iridescent neck
  const head = add(g, new THREE.SphereGeometry(0.11, 12, 10), grey, 0.3, 0.2, 0);
  add(head, new THREE.ConeGeometry(0.035, 0.1, 6), orange, 0.12, -0.02, 0).rotation.z = -Math.PI / 2;
  for (const z of [-0.06, 0.06]) add(head, new THREE.SphereGeometry(0.022, 6, 4), eye, 0.06, 0.03, z);
  add(g, new THREE.ConeGeometry(0.1, 0.22, 6), dark, -0.32, 0.02, 0).rotation.z = Math.PI / 2;
  const wings = [-1, 1].map(sg => { const w = new THREE.Group(); w.position.set(0, 0.08, sg * 0.15); g.add(w); add(w, new THREE.SphereGeometry(0.16, 10, 6), dark, -0.02, 0, sg * 0.12).scale.set(1.2, 0.25, 1); return [w, sg]; });
  g.userData.tick = t => { for (const [w, sg] of wings) w.rotation.x = sg * Math.sin(t * 22) * 0.8; head.position.x = 0.3 + Math.sin(t * 9) * 0.03; };
  return g;
}
function toiletRollModel() { // fluffy white loo roll with a brown core, a loose flap
  const g = new THREE.Group(), w = toon(0xfbfbf4), core = toon(0xb0814f);
  const r = add(g, new THREE.CylinderGeometry(0.26, 0.26, 0.42, 20), w); r.rotation.x = Math.PI / 2;
  const c = add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.44, 12, 1, true), core); c.rotation.x = Math.PI / 2; c.material.side = THREE.DoubleSide;
  for (const z of [-0.12, 0, 0.12]) add(g, new THREE.TorusGeometry(0.262, 0.006, 4, 24), toon(0xe4e4dc), 0, 0, z);
  add(g, new THREE.BoxGeometry(0.02, 0.3, 0.4), w, 0.25, -0.15, 0);
  return g;
}
export function discoBallModel(r = 0.32) { // mirror ball: faceted sphere + sparkle tiles
  const g = new THREE.Group();
  add(g, new THREE.IcosahedronGeometry(r, 1), toon(0xd8dee8, { flatShading: true }));
  const tile = new THREE.BoxGeometry(r * 0.22, r * 0.22, r * 0.05), tiles = [];
  for (let k = 0; k < 26; k++) { const a = k * 2.39996, y = 1 - (k + 0.5) / 13, rr = Math.sqrt(1 - y * y), m = noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff })); const o = add(g, tile, m, Math.cos(a) * rr * r * 1.02, y * r * 1.02, Math.sin(a) * rr * r * 1.02); o.lookAt(0, 0, 0); o.castShadow = false; tiles.push(o); }
  const cols = [0xff4fd8, 0x4fe3ff, 0xfff04f, 0x7dff6a, 0xffffff];
  g.userData.tick = t => { g.rotation.y = t * 2; tiles.forEach((o, k) => o.material.color.setHex(cols[(k + Math.floor(t * 8)) % cols.length])); };
  return g;
}
function bigheadModel() { // a huge grinning balloon head
  const g = new THREE.Group(), skin = toon(0xffc9a0), eye = toon(0x1d1d24), red = toon(0xe0342c);
  add(g, new THREE.SphereGeometry(0.34, 18, 14), skin);
  for (const z of [-0.12, 0.12]) { add(g, new THREE.SphereGeometry(0.08, 10, 8), toon(0xffffff), 0.28, 0.08, z); add(g, new THREE.SphereGeometry(0.04, 8, 6), eye, 0.35, 0.08, z); }
  add(g, new THREE.TorusGeometry(0.12, 0.025, 6, 14, Math.PI), red, 0.3, -0.08, 0).rotation.set(0, Math.PI / 2, Math.PI);
  for (const z of [-0.33, 0.33]) add(g, new THREE.SphereGeometry(0.08, 8, 6), skin, 0, 0, z);
  return g;
}
export function grandmaModel() { // tiny toon grandma: grey bun, glasses, purple cardigan, long skirt, handbag on her arm. faces +x, feet at y = 0
  const g = new THREE.Group(), skin = toon(0xffd2b0), hair = toon(0xe6e6ea), cardi = toon(0x8a4fc4), skirt = toon(0x3d5a8a), shoe = toon(0x3a2416), bag = toon(0xe0342c), gold = toon(0xf4c430), dark = toon(0x1d1d24);
  const legs = [-1, 1].map(sg => { const l = new THREE.Group(); l.position.set(0, 0.24, sg * 0.07); g.add(l); add(l, new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), skin, 0, -0.12, 0); add(l, new RoundedBoxGeometry(0.11, 0.05, 0.07, 1, 0.02), shoe, 0.02, -0.22, 0); return l; });
  add(g, new THREE.CylinderGeometry(0.12, 0.2, 0.3, 14), skirt, 0, 0.36, 0);
  add(g, new THREE.CylinderGeometry(0.12, 0.13, 0.24, 14), cardi, 0, 0.62, 0);
  add(g, new THREE.SphereGeometry(0.15, 16, 12), skin, 0.02, 0.86, 0);
  add(g, new THREE.SphereGeometry(0.155, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 0.88, 0);
  add(g, new THREE.SphereGeometry(0.08, 10, 8), hair, -0.12, 0.97, 0); // bun
  for (const z of [-0.055, 0.055]) add(g, new THREE.TorusGeometry(0.04, 0.008, 4, 12), dark, 0.15, 0.87, z).rotation.y = Math.PI / 2;
  const arm = new THREE.Group(); arm.position.set(0, 0.7, 0.15); g.add(arm);
  add(arm, new THREE.CylinderGeometry(0.03, 0.03, 0.24, 6), cardi, 0, -0.1, 0);
  const hb = new THREE.Group(); hb.position.set(0, -0.24, 0.02); arm.add(hb);
  add(hb, new THREE.TorusGeometry(0.06, 0.012, 4, 12, Math.PI), gold, 0, 0, 0);
  add(hb, new RoundedBoxGeometry(0.18, 0.13, 0.08, 2, 0.03), bag, 0, -0.07, 0);
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), cardi, 0, 0.62, -0.15);
  g.userData = { legs, arm, run(t) { legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 22 + i * Math.PI) * 0.7; }); }, smack(u) { arm.rotation.z = -Math.sin(Math.min(1, u) * Math.PI) * 2.4; arm.rotation.x = -0.3; }, rest() { legs.forEach(l => { l.rotation.z = 0; }); arm.rotation.set(0, 0, 0); } };
  return g;
}
function grandmaProjectile() { const p = new THREE.Group(), gm = grandmaModel(); gm.position.y = -0.5; p.add(gm); p.userData.gm = gm; return p; }
function pigeonProjectile() { const p = new THREE.Group(), b = pigeonModel(); b.scale.setScalar(1.4); p.add(b); p.userData.tick = t => b.userData.tick(t); return p; }
function discoProjectile() { const p = discoBallModel(0.3); return p; }
// build-piece decorations (parented to the block mesh; block = 0.8 cube centred at 0)
export function peelDeco() { // a flopped-open banana peel lying on the top face
  const g = new THREE.Group(), y = toon(0xffd84a), tip = toon(0x6b4423), inner = toon(0xfff3c0);
  for (let k = 0; k < 4; k++) { const f = new THREE.Group(); f.rotation.y = k * Math.PI / 2 + 0.4; g.add(f); const leaf = add(f, new THREE.SphereGeometry(0.1, 10, 6), y, 0.15, 0, 0); leaf.scale.set(1.9, 0.18, 0.75); const in2 = add(f, new THREE.SphereGeometry(0.08, 8, 4), inner, 0.15, 0.012, 0); in2.scale.set(1.6, 0.1, 0.55); }
  add(g, new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), y, 0, 0.04, 0);
  add(g, new THREE.CylinderGeometry(0.02, 0.03, 0.06, 6), tip, 0, 0.11, 0);
  g.position.y = 0.41;
  return g;
}
export function bouncyDeco() { // inflatable castle look: striped puffy shell, corner turret puffs with cones
  const g = new THREE.Group(), cs = [0xff5aa8, 0x4fc3ff, 0xffd84a, 0x7ad94a];
  const shell = add(g, new RoundedBoxGeometry(0.84, 0.84, 0.84, 4, 0.2), toon(0xffffff, { map: stripes() })); shell.castShadow = true;
  let k = 0;
  for (const x of [-0.36, 0.36]) for (const z of [-0.36, 0.36]) { add(g, new THREE.CylinderGeometry(0.09, 0.09, 0.9, 10), toon(cs[k % 4]), x, 0.02, z); add(g, new THREE.ConeGeometry(0.11, 0.18, 10), toon(cs[(k + 1) % 4]), x, 0.55, z); k++; }
  return g;
}
let stripeT = null;
function stripes() {
  if (stripeT) return stripeT;
  const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 }), x = c.getContext('2d'), cs = ['#ff5aa8', '#ffd84a', '#4fc3ff', '#7ad94a'];
  for (let i = 0; i < 4; i++) { x.fillStyle = cs[i]; x.fillRect(i * 16, 0, 16, 64); }
  stripeT = new THREE.CanvasTexture(c); stripeT.colorSpace = THREE.SRGBColorSpace; return stripeT;
}
export function mummyWrap() { // loo-roll bands wrapped around an archer (feet at 0)
  const g = new THREE.Group(), m = toon(0xfbfbf4);
  for (let k = 0; k < 9; k++) { const o = add(g, new THREE.TorusGeometry(k > 6 ? 0.31 : 0.36, 0.06, 6, 20), m, 0, 0.25 + k * 0.17, 0); o.rotation.set(Math.PI / 2 + (k % 2 ? 0.25 : -0.25), 0, 0); }
  return g;
}
export const PIECE_UI = {
  block: { label: 'Block', icon: svg('<rect x="7" y="7" width="26" height="26" rx="4" fill="#d9b77a" stroke="#111" stroke-width="2"/><path d="M7 20h26M20 7v13" stroke="#8a6a3a" stroke-width="1.6"/>') },
  banana: { label: 'Peel', icon: svg('<rect x="6" y="20" width="28" height="14" rx="3" fill="#d9b77a" stroke="#111" stroke-width="1.6"/><path d="M20 18q-9-1-12-8q6 3 10 3M20 18q9-1 12-8q-6 3-10 3M20 18q-2-7 1-13" stroke="#111" stroke-width="1.4" fill="#ffd84a"/><circle cx="21" cy="5" r="1.6" fill="#6b4423"/>') },
  bouncy: { label: 'Bouncy', icon: svg('<rect x="7" y="13" width="26" height="22" rx="6" fill="#4fc3ff" stroke="#111" stroke-width="1.6"/><path d="M13 13v22M20 13v22M27 13v22" stroke="#ff5aa8" stroke-width="3"/><path d="M5 14l4-8 4 8zM27 14l4-8 4 8z" fill="#ffd84a" stroke="#111" stroke-width="1.2"/><path d="M14 5q6-4 12 0" stroke="#111" stroke-width="1.4" fill="none" stroke-dasharray="2 2"/>') },
  archer: { label: 'Archer', icon: svg('<circle cx="20" cy="10" r="6" fill="#ffc9a0" stroke="#111" stroke-width="1.5"/><rect x="13" y="16" width="14" height="14" rx="4" fill="#3b7de0" stroke="#111" stroke-width="1.5"/><path d="M30 8q8 12 0 24" stroke="#8f5326" stroke-width="2.5" fill="none"/><path d="M30 8v24" stroke="#fff" stroke-width="1"/>') },
};
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
  pigeon: { model: pigeonProjectile, color: 0x8f96a3, label: 'Pigeons',
    icon: svg('<ellipse cx="18" cy="22" rx="11" ry="8" fill="#8f96a3" stroke="#111" stroke-width="1.5"/><circle cx="28" cy="14" r="5" fill="#8f96a3" stroke="#111" stroke-width="1.5"/><path d="M32 14l5 1.5-5 1.5z" fill="#ff9a1a" stroke="#111"/><circle cx="29" cy="13" r="1" fill="#111"/><path d="M10 18q5-8 12-3" fill="#5a606c" stroke="#111" stroke-width="1.2"/><path d="M24 18q2 2 3 0" stroke="#3fae9a" stroke-width="2.4" fill="none"/><ellipse cx="14" cy="35" rx="3" ry="2" fill="#fff" stroke="#111"/><circle cx="21" cy="36" r="1.4" fill="#fff" stroke="#111" stroke-width=".8"/>'),
    spin: false },
  toilet: { model: toiletRollModel, color: 0xfbfbf4, label: 'Loo roll',
    icon: svg('<ellipse cx="15" cy="16" rx="9" ry="11" fill="#fbfbf4" stroke="#111" stroke-width="1.5"/><ellipse cx="15" cy="16" rx="3" ry="4" fill="#b0814f" stroke="#111" stroke-width="1.2"/><path d="M24 16q4 8 12 10v8q-8-2-12-10" fill="#fbfbf4" stroke="#111" stroke-width="1.4"/><path d="M28 26l1 2M32 28l1 2" stroke="#aaa" stroke-width="1"/>'),
    spin: false },
  disco: { model: discoProjectile, color: 0xff4fd8, label: 'Disco',
    icon: svg('<path d="M20 2v6" stroke="#111" stroke-width="1.5"/><circle cx="20" cy="20" r="12" fill="#d8dee8" stroke="#111" stroke-width="1.5"/><path d="M9 16h22M8.5 22h23M12 28h16M13 11h14M20 8v24M14 9q-3 11 0 22M26 9q3 11 0 22" stroke="#7a8496" stroke-width="1"/><rect x="14" y="13" width="4" height="4" fill="#ff4fd8"/><rect x="22" y="19" width="4" height="4" fill="#4fe3ff"/><rect x="16" y="24" width="4" height="3" fill="#fff04f"/><path d="M34 6l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" fill="#fff04f"/>'),
    spin: false },
  bighead: { model: bigheadModel, color: 0xffc9a0, label: 'Big head',
    icon: svg('<circle cx="20" cy="17" r="14" fill="#ffc9a0" stroke="#111" stroke-width="1.5"/><circle cx="15" cy="15" r="3.4" fill="#fff" stroke="#111"/><circle cx="25" cy="15" r="3.4" fill="#fff" stroke="#111"/><circle cx="15.5" cy="15.5" r="1.5" fill="#111"/><circle cx="25.5" cy="15.5" r="1.5" fill="#111"/><path d="M13 23q7 6 14 0" stroke="#e0342c" stroke-width="2.2" fill="none" stroke-linecap="round"/><rect x="16" y="31" width="8" height="7" rx="2" fill="#3b7de0" stroke="#111" stroke-width="1.2"/>'),
    spin: false },
  grandma: { model: grandmaProjectile, color: 0x8a4fc4, label: 'Grandma',
    icon: svg('<circle cx="17" cy="11" r="6.5" fill="#ffd2b0" stroke="#111" stroke-width="1.4"/><path d="M10.5 10a6.5 6.5 0 0113 0z" fill="#e6e6ea" stroke="#111" stroke-width="1.2"/><circle cx="11" cy="6" r="3" fill="#e6e6ea" stroke="#111" stroke-width="1.2"/><circle cx="16" cy="12" r="1.6" fill="none" stroke="#111"/><circle cx="20" cy="12" r="1.6" fill="none" stroke="#111"/><path d="M12 18h10l3 18H9z" fill="#8a4fc4" stroke="#111" stroke-width="1.4"/><path d="M24 20l7 4" stroke="#8a4fc4" stroke-width="3"/><path d="M29 24q2-5 5 0" stroke="#f4c430" stroke-width="1.5" fill="none"/><rect x="27" y="24" width="9" height="7" rx="2" fill="#e0342c" stroke="#111" stroke-width="1.2"/>'),
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
