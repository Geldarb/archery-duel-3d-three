// Shared rigid-body tower physics (cannon-es). Runs identically on the server (authoritative) and in the browser (live playback / hot-seat).
// A run is rebuilt from a snapshot at the start of every shot and driven by a list of timed events derived from the shot's arrows.
import * as C from 'cannon-es';
import { LAYOUT, ARROWS, ARCHER_HALF } from './sim.js';

export const STEP = 1 / 60, SETTLE = 180, MAX_STEPS = 60 * 26;
const CHAIR_HALF = 0.36, CHAIR_DELAY = 20;
const v3 = a => new C.Vec3(a[0], a[1], a[2]);

// Turn a shot's arrow results into physics events (index k = fixed 1/60 s step when it applies).
export function shotEvents(shot) {
  const T = ARROWS[shot.type] || ARROWS.normal, ev = [];
  for (const a of shot.arrows) {
    const r = a.res, k = Math.ceil(r.t / STEP - 1e-6);
    if (r.kind === 'out' || r.kind === 'pickup') continue;
    if (r.kind === 'block' && T.push) { // push mostly along the ground: a stone shoved sideways topples what it carries
      const h = Math.hypot(r.dir[0], r.dir[2]) || 1, d = [r.dir[0] / h, 0.12, r.dir[2] / h];
      ev.push({ k, kind: 'hit', i: r.block, j: d.map(x => x * T.push), p: r.pos });
    }
    if (T.land === 'blast') ev.push({ k, kind: 'blast', p: r.pos, R: T.radius, V: T.power * 0.42, D: T.blastDmg });
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
    const ground = new C.Body({ mass: 0, material: gm, shape: new C.Box(new C.Vec3(90, 1, 60)), position: new C.Vec3(0, -1, 0) }); w.addBody(ground);
    const sleepy = b => { b.material = sm; b.sleepSpeedLimit = 0.25; b.sleepTimeLimit = 0.3; w.addBody(b); b.sleep(); return b; };
    this.blocks = LAYOUT.map((l, i) => {
      const s = snap.b[i], b = new C.Body({ mass: 8 * l.half[0] * l.half[1] * l.half[2], shape: new C.Box(v3(l.half)), position: v3(s) });
      b.quaternion.set(s[3], s[4], s[5], s[6]); b.idx = i; return sleepy(b);
    });
    this.archers = snap.a.map((a, i) => {
      const b = new C.Body({ mass: 3, shape: new C.Box(v3(ARCHER_HALF)), position: new C.Vec3(a[0], a[1] + ARCHER_HALF[1], a[2]), fixedRotation: true, linearDamping: 0.05 });
      b.who = i; sleepy(b);
      b.addEventListener('collide', e => this.onArcherHit(i, e.body));
      return b;
    });
    this.ev = events; this.k = 0; this.ei = 0; this.dmg = [0, 0]; this.log = []; this.fx = [];
    this.chair = null; this.spin = null; this.debris = [new Set(), new Set()];
    this.fall = this.archers.map(b => ({ peak: b.position.y, falling: false }));
    this.lastK = events.reduce((m, e) => Math.max(m, e.k + (e.kind === 'chair' ? CHAIR_DELAY + ARROWS.wheelchair.spin * 60 : 0)), -1);
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
  wakeNear(p, r = 7) { for (const b of [...this.blocks, ...this.archers]) if (b.position.distanceTo(p) < r) b.wakeUp(); }
  apply(e) {
    const p = v3(e.p);
    this.wakeNear(p);
    if (e.kind === 'hit') { // shove at the block's mid-height so it slides out (tablecloth-style) instead of digging in
      const b = this.blocks[e.i]; b.applyImpulse(v3(e.j), new C.Vec3(0, 0, 0)); this.fx.push({ k: this.k, kind: 'hit', i: e.i, p: e.p }); }
    else if (e.kind === 'blast') {
      for (const b of [...this.blocks, ...this.archers]) {
        const d = b.position.vsub(p), dist = d.length();
        if (dist >= e.R) continue;
        const f = 1 - dist / e.R; d.y += 0.6; d.normalize();
        b.applyImpulse(d.scale(e.V * f * b.mass * (b.who !== undefined ? 0.45 : 1)), new C.Vec3(0, 0, 0));
        if (b.who !== undefined) this.hurt(b.who, Math.round(e.D * f), 'blast', this.feet(b.who));
      }
      this.fx.push({ k: this.k, kind: 'blast', p: e.p });
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
    for (const b of [...this.blocks, ...this.archers]) {
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
      const F = this.fall[i], vy = b.velocity.y;
      if (vy < -2.5) F.falling = true;
      if (F.falling && vy > -0.6 && b.sleepState !== C.Body.SLEEPING) {
        const drop = F.peak - b.position.y, feet = b.position.y - ARCHER_HALF[1];
        F.falling = false; F.peak = b.position.y;
        if (feet < 0.2) this.hurt(i, Math.min(45, 22 + Math.round(drop * 4)), 'ground', this.feet(i));
        else if (drop > 0.8) this.hurt(i, Math.round(3 + drop * 5), 'fall', this.feet(i));
      } else if (!F.falling) F.peak = Math.max(F.peak, b.position.y);
    });
  }
  step() {
    if (this.done) return false;
    while (this.ei < this.ev.length && this.ev[this.ei].k <= this.k) this.apply(this.ev[this.ei++]);
    this.spinStep();
    this.world.step(STEP);
    this.falls();
    this.k++;
    const still = this.blocks.every(b => b.sleepState === C.Body.SLEEPING) && this.archers.every(b => b.sleepState === C.Body.SLEEPING);
    if ((this.k > this.lastK && this.ei >= this.ev.length && still && (!this.spin || this.k >= this.spin.end)) || this.k >= this.lastK + SETTLE || this.k >= MAX_STEPS) this.done = true;
    return !this.done;
  }
  snapshot() {
    const q = b => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w];
    return { b: this.blocks.map(q), a: this.archers.map((b, i) => this.feet(i)), chair: this.chair ? q(this.chair) : null };
  }
  result() { return { phys: { b: this.snapshot().b, a: this.snapshot().a }, chair: this.snapshot().chair, dmg: [...this.dmg], log: this.log, steps: this.k }; }
  run() { while (this.step()); return this.result(); }
}
export const resolvePhysics = (snap, shot) => new PhysRun(snap, shotEvents(shot)).run();
