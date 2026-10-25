// Shared rigid-body tower physics (cannon-es). Runs identically on the server (authoritative) and in the browser (live playback / hot-seat).
// A run is rebuilt from a snapshot at the start of every shot and driven by a list of timed events derived from the shot's arrows.
import * as C from 'cannon-es';
import { LAYOUT, ARROWS, ARCHER_HALF, parked, wrapHit } from './sim.js';

export const STEP = 1 / 60, SETTLE = 180, MAX_STEPS = 60 * 26;
const CHAIR_HALF = 0.36, CHAIR_DELAY = 20;
const v3 = a => new C.Vec3(a[0], a[1], a[2]);

// Turn a shot's arrow results into physics events (index k = fixed 1/60 s step when it applies).
// st (optional, the pre-shot round state) adds the v6.1 status-driven events (disco dancing through the shooter's own turn).
export function shotEvents(shot, st = null) {
  const T = ARROWS[shot.type] || ARROWS.normal, ev = [], me = shot.shooter, en = me === undefined ? -1 : 1 - me;
  const disco = (s, k0) => { for (let n = 0; n < ARROWS.disco.pulses; n++) ev.push({ k: k0 + n * ARROWS.disco.every, kind: 'disco', s, n, p: [0, 0, 0] }); };
  if (st && st.fx && me !== undefined && st.fx[me] && st.fx[me].disco > 0) disco(me, 1); // the disco'd player's tower keeps dancing through their shot
  for (const a of shot.arrows) if (a.res.who !== undefined) ev.push({ k: Math.ceil(a.res.t / STEP - 1e-6), kind: 'touch', who: a.res.who, p: a.res.pos }); // v6.1: a hit archer counts as jolted (banana peel)
  const first = shot.arrows[0];
  if (first && en >= 0) { // v6.1 sky specials that act on the enemy wherever the projectile lands
    const r = first.res, k = Math.ceil(r.t / STEP - 1e-6), ap = st ? st.phys.a[en] : [0, 0, 0];
    if (T.land === 'pigeon') ev.push({ k: k + T.delay, kind: 'pigeon', who: en, D: T.pigeonDmg, p: [ap[0], ap[1] + 1.6, ap[2]] });
    if (T.land === 'toilet' && st && wrapHit(st, me, shot)) ev.push({ k: k + 2, kind: 'toilet', who: en, D: r.who === en ? 0 : T.wrapDmg, p: [ap[0], ap[1] + 0.8, ap[2]] });
    if (T.land === 'disco') disco(en, k + 6);
    if (T.land === 'bighead') ev.push({ k: k + 2, kind: 'bighead', who: en, p: [ap[0], ap[1] + 1.6, ap[2]] });
    if (T.land === 'grandma') {
      const from = r.kind === 'out' || r.kind === 'pickup' ? [ap[0] - Math.sign(ap[0] || 1) * 7, 0, ap[2]] : r.pos;
      ev.push({ k: k + 1, kind: 'granny', s: en, p: from });
      for (let n = 0; n < T.smacks; n++) ev.push({ k: k + T.run + n * T.every, kind: 'smack', s: en, n, from, p: from });
    }
  }
  for (const a of shot.arrows) {
    const r = a.res, k = Math.ceil(r.t / STEP - 1e-6);
    if (r.kind === 'out' || r.kind === 'pickup') continue;
    if (r.kind === 'block' && T.push) { // push mostly along the ground: a stone shoved sideways topples what it carries
      const h = Math.hypot(r.dir[0], r.dir[2]) || 1, d = [r.dir[0] / h, 0.12, r.dir[2] / h];
      ev.push({ k, kind: 'hit', i: r.block, j: d.map(x => x * T.push), p: r.pos });
    }
    if (T.land === 'blast') ev.push({ k, kind: 'blast', p: r.pos, R: T.radius, V: T.power * 0.42, D: T.blastDmg });
    if (a.bounces) for (const b of a.bounces) if (b.kind === 'block') { // rubber chicken / bouncy castle: a light shove at every block it bounces off
      const h = Math.hypot(b.dir[0], b.dir[2]) || 1;
      ev.push({ k: Math.ceil(b.t / STEP - 1e-6), kind: 'hit', i: b.block, j: [b.dir[0] / h, 0.12, b.dir[2] / h].map(x => x * (b.boing ? 3 : T.push)), p: b.pos, ...(b.boing ? { boing: true } : {}) });
    }
    if (T.land === 'cow') ev.push({ k, kind: 'cow', p: r.pos, R: T.radius, V: T.power, D: T.cowDmg });
    if (T.land === 'boot' && r.bootAt) ev.push({ k: k + T.delay, kind: 'boot', p: r.bootAt, R: T.radius, V: T.power, D: T.bootDmg, land: k });
    if (T.land === 'spin') ev.push({ k, kind: 'chair', p: r.pos.map((x, n) => x - r.dir[n] * 0.4), v: r.dir.map(d => -d * 2), i: r.kind === 'block' ? r.block : -1, hit: r.pos, dir: r.dir });
  }
  return ev.sort((x, y) => x.k - y.k);
}

export class PhysRun {
  constructor(snap, events = []) {
    const w = this.world = new C.World({ gravity: new C.Vec3(0, -9.8, 0), allowSleep: true });
    w.broadphase = new C.SAPBroadphase(w); w.solver.iterations = 10;
    w.defaultContactMaterial.friction = 0.5; w.defaultContactMaterial.restitution = 0.05;
    const gm = new C.Material('ground');
    const sm = this.stone = new C.Material('stone');
    w.addContactMaterial(new C.ContactMaterial(sm, sm, { friction: 0.5, restitution: 0.05 }));
    w.addContactMaterial(new C.ContactMaterial(gm, sm, { friction: 0.3, restitution: 0.05 })); // stones slide a bit on the grass
    const bm = new C.Material('bouncy'); // v6.1 bouncy castle: springy against everything
    w.addContactMaterial(new C.ContactMaterial(bm, sm, { friction: 0.4, restitution: 0.8 }));
    w.addContactMaterial(new C.ContactMaterial(bm, gm, { friction: 0.4, restitution: 0.3 }));
    w.addContactMaterial(new C.ContactMaterial(bm, bm, { friction: 0.4, restitution: 0.6 }));
    this.kinds = { banana: [...((snap.k && snap.k.banana) || [])], bouncy: [...((snap.k && snap.k.bouncy) || [])] };
    this.banana = new Set(this.kinds.banana);
    const ground = new C.Body({ mass: 0, material: gm, shape: new C.Box(new C.Vec3(90, 1, 60)), position: new C.Vec3(0, -1, 0) }); w.addBody(ground);
    const sleepy = (b, add = true) => { b.material = sm; b.sleepSpeedLimit = 0.25; b.sleepTimeLimit = 0.3; if (add) w.addBody(b); b.sleep(); return b; };
    this.blocks = LAYOUT.map((l, i) => { // unused build-phase slots stay parked outside the world
      const s = snap.b[i], b = new C.Body({ mass: 8 * l.half[0] * l.half[1] * l.half[2], shape: new C.Box(v3(l.half)), position: v3(s) });
      b.quaternion.set(s[3], s[4], s[5], s[6]); b.idx = i; sleepy(b, !parked(s));
      if (this.kinds.bouncy.includes(i)) { b.material = bm; b.bouncy = true; b.addEventListener('collide', e => this.onBouncy(b, e.body)); }
      return b;
    });
    this.live = this.blocks.filter(b => b.world);
    this.archers = snap.a.map((a, i) => {
      const b = new C.Body({ mass: 3, shape: new C.Box(v3(ARCHER_HALF)), position: new C.Vec3(a[0], a[1] + ARCHER_HALF[1], a[2]), fixedRotation: true, linearDamping: 0.05 });
      b.who = i; sleepy(b);
      b.addEventListener('collide', e => this.onArcherHit(i, e.body));
      return b;
    });
    this.ev = events; this.k = 0; this.ei = 0; this.dmg = [0, 0]; this.log = []; this.fx = [];
    this.chair = null; this.spin = null; this.debris = [new Set(), new Set()];
    this.jolted = [false, false]; this.slipped = [false, false]; this.boingAt = new Map(); this.granny = null; // v6.1
    this.fall = this.archers.map(b => ({ peak: b.position.y, falling: false }));
    this.lastK = events.reduce((m, e) => Math.max(m, e.k + (e.kind === 'chair' ? CHAIR_DELAY + ARROWS.wheelchair.spin * 60 : e.kind === 'smack' && e.n === ARROWS.grandma.smacks - 1 ? 60 : 0)), -1);
    this.done = !events.length;
    if (events.length) this.k = events[0].k; // nothing moves before the first impact: skip straight to it (same on every machine)
  }
  hurt(who, dmg, kind, pos) { if (dmg <= 0) return; this.dmg[who] += dmg; this.log.push({ k: this.k, who, dmg, kind, pos: pos.map(v => Math.round(v * 100) / 100) }); }
  feet(i) { const p = this.archers[i].position; return [p.x, p.y - ARCHER_HALF[1], p.z]; }
  onArcherHit(i, other) { // falling stone landing on an archer: small damage (max 3 hits of 4)
    if (other.idx === undefined || this.debris[i].has(other.idx) || this.debris[i].size >= 3) return;
    const a = this.archers[i].position;
    if (other.velocity.y < -2 && other.position.y > a.y + 0.25) { this.debris[i].add(other.idx); this.hurt(i, 4, 'debris', this.feet(i)); }
  }
  onBouncy(b, other) { // v6.1: anything coming down onto a bouncy castle gets bounced back up (boing)
    if (other.mass === 0 || other.position.y < b.position.y + 0.3) return;
    const vy = other.velocity.y, last = this.boingAt.get(other.id) ?? -99;
    if (vy > -1.8 || this.k - last < 20) return;
    this.boingAt.set(other.id, this.k);
    other.velocity.y = Math.min(9, -vy * 0.9 + 2.2);
    if (other.who !== undefined) { this.jolted[other.who] = true; this.fall[other.who].falling = false; this.fall[other.who].peak = other.position.y + 1.5; } // a bounce isn't a fall
    this.fx.push({ k: this.k, kind: 'boing', i: b.idx, p: [b.position.x, b.position.y + 0.4, b.position.z] });
  }
  bananaUnder(i) { // a banana-peel block under (or right next to) the archer's feet
    const a = this.archers[i].position, fy = a.y - ARCHER_HALF[1];
    for (const idx of this.banana) {
      const b = this.blocks[idx]; if (!b.world) continue;
      b.updateAABB(); const A = b.aabb;
      if (Math.abs(A.upperBound.y - fy) < 0.15 && a.x > A.lowerBound.x - 0.3 && a.x < A.upperBound.x + 0.3 && a.z > A.lowerBound.z - 0.3 && a.z < A.upperBound.z + 0.3) return b;
    }
    return null;
  }
  slips() { // v6.1 banana peel: an archer who was hit / shoved / fell and ends up on a peel slips and slides (maybe off the edge)
    if (!this.banana.size) return;
    this.archers.forEach((b, i) => {
      const v = b.velocity, hs = Math.hypot(v.x, v.z);
      if (hs > 1.5 || Math.abs(v.y) > 1.5 || this.dmg[i] > 0) this.jolted[i] = true;
      if (!this.jolted[i] || this.slipped[i] || hs > 1.2 || Math.abs(v.y) > 1 || this.fall[i].falling) return;
      const pe = this.bananaUnder(i); if (!pe) return;
      this.slipped[i] = true;
      let dx = b.position.x - pe.position.x, dz = b.position.z - pe.position.z, h = Math.hypot(dx, dz);
      if (hs > 0.3) { dx = v.x; dz = v.z; h = hs; } else if (h < 0.1) { dx = i ? 1 : -1; dz = 0.35; h = Math.hypot(dx, dz); } // straight onto it: backwards
      b.wakeUp(); b.velocity.set(dx / h * 3.6, 1.3, dz / h * 3.6);
      this.fx.push({ k: this.k, kind: 'slip', who: i, p: this.feet(i) });
    });
  }
  smackTarget(s, from) { // grandma: the low block of tower s nearest to where she comes from (else the archer)
    let best = null, bd = 1e9;
    for (const b of this.live) if (LAYOUT[b.idx].s === s && b.position.y < 1.3 && b.position.y > -1) {
      const d = Math.hypot(b.position.x - from[0], b.position.z - from[2]); if (d < bd) { bd = d; best = b; }
    }
    const t = best ? best.position : this.archers[s].position;
    return [t.x, best ? Math.min(t.y, 0.5) : t.y - ARCHER_HALF[1], t.z];
  }
  wakeNear(p, r = 7) { for (const b of [...this.live, ...this.archers]) if (b.position.distanceTo(p) < r) b.wakeUp(); }
  apply(e) {
    const p = v3(e.p);
    this.wakeNear(p, e.kind === 'boot' || e.kind === 'cow' ? 9 : 7);
    if (e.kind === 'hit') { // shove at the block's mid-height so it slides out (tablecloth-style) instead of digging in
      const b = this.blocks[e.i]; b.applyImpulse(v3(e.j), new C.Vec3(0, 0, 0)); this.fx.push({ k: this.k, kind: e.boing ? 'boing' : 'hit', i: e.i, p: e.p }); }
    else if (e.kind === 'touch') { this.jolted[e.who] = true; this.archers[e.who].wakeUp(); }
    else if (e.kind === 'pigeon') { this.jolted[e.who] = true; this.hurt(e.who, e.D, 'pigeon', this.feet(e.who)); this.fx.push({ k: this.k, kind: 'pigeon', who: e.who, p: this.feet(e.who) }); }
    else if (e.kind === 'toilet') { this.hurt(e.who, e.D, 'toilet', this.feet(e.who)); this.fx.push({ k: this.k, kind: 'toilet', who: e.who, p: this.feet(e.who) }); }
    else if (e.kind === 'bighead') this.fx.push({ k: this.k, kind: 'bighead', who: e.who, p: this.feet(e.who) });
    else if (e.kind === 'disco') { // the tower dances: alternating sideways sways + little hops on every block of that side (and its archer)
      const D = ARROWS.disco, sg = e.n % 2 ? -1 : 1, hop = e.n % 2 === 0;
      for (const b of this.live) if (LAYOUT[b.idx].s === e.s && b.position.y > 0.3) { b.wakeUp(); b.applyImpulse(new C.Vec3(0, hop ? 0.5 * b.mass : 0, sg * D.sway * b.mass * Math.min(1.6, b.position.y / 3)), new C.Vec3(0, 0, 0)); }
      const a = this.archers[e.s]; if (hop) { a.wakeUp(); a.velocity.y = Math.max(a.velocity.y, 1.2); }
      this.fx.push({ k: this.k, kind: 'disco', s: e.s, n: e.n, p: this.feet(e.s) });
    } else if (e.kind === 'granny') { this.granny = { s: e.s, from: e.p, to: this.smackTarget(e.s, e.p) }; this.fx.push({ k: this.k, kind: 'granny', s: e.s, p: e.p, to: this.granny.to }); }
    else if (e.kind === 'smack') { // handbag: a strong shove at the tower base, away from where she came from
      const G = ARROWS.grandma, t = this.smackTarget(e.s, e.from), dx = t[0] - e.from[0], dz = t[2] - e.from[2], h = Math.hypot(dx, dz) || 1, ux = dx / h, uz = dz / h;
      const hp = [t[0] - ux * 0.55, t[1], t[2] - uz * 0.55]; // she stands just in front of the block
      for (const b of this.live) {
        const d = Math.hypot(b.position.x - t[0], b.position.z - t[2]);
        if (d > 1.3 || b.position.y > 2.5) continue;
        b.wakeUp(); b.applyImpulse(new C.Vec3(ux, 0.1, uz).scale(G.power * b.mass * (1 - d / 2) * (1 - b.position.y / 4)), new C.Vec3(0, 0, 0));
      }
      const a = this.archers[e.s];
      if (Math.hypot(a.position.x - t[0], a.position.z - t[2]) < 1.3 && a.position.y - ARCHER_HALF[1] < 1) { a.wakeUp(); a.velocity.set(ux * 2.5, 1.5, uz * 2.5); this.jolted[e.s] = true; this.hurt(e.s, G.smackDmg, 'smack', this.feet(e.s)); }
      this.fx.push({ k: this.k, kind: 'smack', s: e.s, n: e.n, p: hp, t });
    }
    else if (e.kind === 'blast') {
      for (const b of [...this.live, ...this.archers]) {
        const d = b.position.vsub(p), dist = d.length();
        if (dist >= e.R) continue;
        const f = 1 - dist / e.R; d.y += 0.6; d.normalize();
        b.applyImpulse(d.scale(e.V * f * b.mass * (b.who !== undefined ? 0.45 : 1)), new C.Vec3(0, 0, 0));
        if (b.who !== undefined) this.hurt(b.who, Math.round(e.D * f), 'blast', this.feet(b.who));
      }
      this.fx.push({ k: this.k, kind: 'blast', p: e.p });
    } else if (e.kind === 'cow') { // flattened: everything near the cow is shoved outward and down
      for (const b of [...this.live, ...this.archers]) {
        const dx = b.position.x - p.x, dz = b.position.z - p.z, dy = b.position.y - p.y, h = Math.hypot(dx, dz), dist = Math.hypot(h, dy);
        if (dist >= e.R) continue;
        const f = 1 - dist / e.R, ux = h > 1e-3 ? dx / h : 0, uz = h > 1e-3 ? dz / h : 0, arch = b.who !== undefined;
        const d = arch ? new C.Vec3(ux * 0.8, 0.45, uz * 0.8) : new C.Vec3(ux, dy > -0.3 ? -0.55 : -0.2, uz);
        b.wakeUp(); b.applyImpulse(d.scale(e.V * f * b.mass * (arch ? 0.2 : 1)), new C.Vec3(0, 0, 0));
        if (arch) this.hurt(b.who, Math.round(e.D * f), 'cow', this.feet(b.who));
      }
      this.fx.push({ k: this.k, kind: 'cow', p: e.p });
    } else if (e.kind === 'boot') { // giant boot stomp: huge downward shove on the whole column under it, damage in the radius
      for (const b of [...this.live, ...this.archers]) {
        const dx = b.position.x - p.x, dz = b.position.z - p.z, h = Math.hypot(dx, dz);
        if (h >= e.R || b.position.y > p.y + 5) continue;
        const f = 1 - 0.6 * h / e.R, ux = h > 1e-3 ? dx / h : 0, uz = h > 1e-3 ? dz / h : 0, arch = b.who !== undefined;
        b.wakeUp(); b.applyImpulse(new C.Vec3(ux * 0.45, -1, uz * 0.45).scale(e.V * f * b.mass * (arch ? 0.12 : 1)), new C.Vec3(0, 0, 0));
        if (arch) this.hurt(b.who, Math.round(e.D * f), 'boot', this.feet(b.who));
      }
      this.fx.push({ k: this.k, kind: 'boot', p: e.p });
    } else if (e.kind === 'chair') {
      let at = p, v = v3(e.v);
      if (e.i >= 0) { // clipped the top edge of a block: hop up onto it rather than bouncing off
        const b = this.blocks[e.i]; b.updateAABB(); const top = b.aabb.upperBound.y;
        if (top - e.hit[1] < 0.6) { at = new C.Vec3(e.hit[0] + e.dir[0] * 0.35, top + CHAIR_HALF + 0.03, e.hit[2] + e.dir[2] * 0.35); v = new C.Vec3(e.dir[0] * 0.8, 0, e.dir[2] * 0.8); }
      }
      const c = this.chair = new C.Body({ mass: 4, shape: new C.Box(new C.Vec3(CHAIR_HALF, CHAIR_HALF, CHAIR_HALF)), position: at, angularDamping: 0.3, linearDamping: 0.1 });
      c.material = this.stone; c.velocity.copy(v); this.world.addBody(c); c.allowSleep = false;
      this.spin = { start: this.k + CHAIR_DELAY, end: this.k + CHAIR_DELAY + ARROWS.wheelchair.spin * 60, ticks: 0 };
      this.fx.push({ k: this.k, kind: 'chair', p: e.p });
    }
  }
  spinStep() {
    const S = this.spin, c = this.chair, W = ARROWS.wheelchair;
    if (!S || this.k < S.start || this.k >= S.end) { if (S && this.k === S.end) { c.angularVelocity.set(0, 0, 0); c.allowSleep = true; } return; }
    c.quaternion.set(0, c.quaternion.y, 0, c.quaternion.w).normalize(); c.angularVelocity.set(0, 24, 0); c.wakeUp();
    const cp = c.position;
    for (const b of [...this.live, ...this.archers]) {
      const dx = b.position.x - cp.x, dz = b.position.z - cp.z, h = Math.hypot(dx, dz);
      if (h > W.radius + 0.6 || Math.abs(b.position.y - cp.y) > 1.4 || h < 1e-3) continue;
      b.wakeUp(); const dv = b.who !== undefined ? 0.015 : 0.15; // gentle steady shove, adds up over the 3 s spin
      b.applyImpulse(new C.Vec3(dx / h * dv * b.mass, 0.01 * b.mass, dz / h * dv * b.mass), new C.Vec3(0, 0, 0));
    }
    if ((this.k - S.start) % 30 === 0 && S.ticks < W.ticks) {
      S.ticks++;
      this.archers.forEach((b, i) => { if (Math.hypot(b.position.x - cp.x, b.position.z - cp.z) < W.radius && Math.abs(b.position.y - cp.y) < 1.6) this.hurt(i, W.tick, 'spin', this.feet(i)); });
    }
  }
  falls() { // fall damage scaled by height: small onto a lower block, big onto the ground
    this.archers.forEach((b, i) => {
      if (b.quaternion.w !== 1) { b.quaternion.set(0, 0, 0, 1); b.angularVelocity.set(0, 0, 0); } // archers never tip over (fixedRotation + guard)
      const F = this.fall[i], vy = b.velocity.y;
      if (vy < -2.5) F.falling = true;
      if (F.falling && vy > -0.6 && b.sleepState !== C.Body.SLEEPING) {
        const drop = F.peak - b.position.y, feet = b.position.y - ARCHER_HALF[1];
        F.falling = false; F.peak = b.position.y;
        const cap = this.slipped[i] ? 20 : 45; // v6.1: slipping off a banana peel hurts, but less than being knocked off
        if (feet < 0.2) this.hurt(i, Math.min(cap, 22 + Math.round(drop * 4)), 'ground', this.feet(i));
        else if (drop > 0.8) this.hurt(i, Math.min(cap, Math.round(3 + drop * 5)), 'fall', this.feet(i));
      } else if (!F.falling) F.peak = Math.max(F.peak, b.position.y);
    });
  }
  step() {
    if (this.done) return false;
    while (this.ei < this.ev.length && this.ev[this.ei].k <= this.k) this.apply(this.ev[this.ei++]);
    this.spinStep();
    this.world.step(STEP);
    this.falls();
    this.slips();
    this.k++;
    const still = this.live.every(b => b.sleepState === C.Body.SLEEPING) && this.archers.every(b => b.sleepState === C.Body.SLEEPING);
    if ((this.k > this.lastK && this.ei >= this.ev.length && still && (!this.spin || this.k >= this.spin.end)) || this.k >= this.lastK + SETTLE || this.k >= MAX_STEPS) this.done = true;
    return !this.done;
  }
  snapshot() {
    const q = b => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w];
    return { b: this.blocks.map(q), a: this.archers.map((b, i) => this.feet(i)), chair: this.chair ? q(this.chair) : null };
  }
  result() { return { phys: { b: this.snapshot().b, a: this.snapshot().a, k: this.kinds }, chair: this.snapshot().chair, dmg: [...this.dmg], log: this.log, steps: this.k }; }
  run() { while (this.step()); return this.result(); }
}
export const resolvePhysics = (snap, shot, st = null) => new PhysRun(snap, shotEvents(shot, st)).run(); // st: pre-shot round state (v6.1 statuses)
