// Tiny WebAudio synth for game sounds. No audio files.
let ctx = null, master = null, noise = null;
let muted = localStorage.getItem('ad3t-mute') === '1';
export const isMuted = () => muted;
export function setMuted(m) { muted = m; localStorage.setItem('ad3t-mute', m ? '1' : '0'); if (master) master.gain.value = m ? 0 : 0.7; }
export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}
const ok = () => ctx && !muted;
function gain(t, peak, dur, attack = 0.005) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(master); return g;
}
function osc(type, f0, f1, dur, peak, filter) {
  const t = ctx.currentTime, o = ctx.createOscillator(), g = gain(t, peak, dur);
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  if (filter) { filter.connect(g); o.connect(filter); } else o.connect(g);
  o.start(t); o.stop(t + dur + 0.05);
}
function hiss(dur, peak, type, f0, f1, q = 1, attack = 0.005) {
  const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = gain(t, peak, dur, attack);
  s.buffer = noise; s.loop = true; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  s.connect(f); f.connect(g); s.start(t); s.stop(t + dur + 0.05);
}
const bp = (f, q) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; return b; };
export const creak = p => ok() && osc('sawtooth', 55 + p * 70, 50 + p * 60, 0.09, 0.05, bp(900, 6));
export const twang = () => { if (!ok()) return; osc('triangle', 220, 90, 0.35, 0.35); hiss(0.05, 0.2, 'highpass', 3000, 2000); };
export const whoosh = d => ok() && hiss(Math.max(0.4, d), 0.12, 'bandpass', 500, 1600, 2, 0.15);
export const thunk = () => { if (!ok()) return; osc('sine', 140, 45, 0.16, 0.6); hiss(0.06, 0.25, 'lowpass', 900, 300); };
export const grunt = () => { if (!ok()) return; osc('sawtooth', 180, 105, 0.28, 0.3, bp(650, 3)); thunk(); };
export const ding = () => { if (!ok()) return; osc('sine', 1318, 1310, 0.9, 0.22); osc('sine', 1976, 1970, 0.7, 0.12); };
// castle flavour
export const crack = () => { if (!ok()) return; hiss(0.12, 0.45, 'highpass', 2500, 900); osc('square', 90, 40, 0.12, 0.25, bp(400, 2)); };
export const crumble = () => { if (!ok()) return; hiss(0.9, 0.5, 'lowpass', 1400, 120, 1, 0.01); osc('sine', 70, 30, 0.5, 0.5); };
export const thunder = () => ok() && hiss(2.2, 0.6, 'lowpass', 400, 60, 1, 0.05);
export function fanfare() { // horn call + crowd cheer on victory
  if (!ok()) return;
  const t0 = ctx.currentTime;
  [[392, 0], [523, 0.22], [659, 0.44], [784, 0.66]].forEach(([f, d]) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), b = bp(f * 2, 1.5);
    o.type = 'sawtooth'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.18, t0 + d + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + (d > 0.6 ? 0.9 : 0.3));
    o.connect(b); b.connect(g); g.connect(master); o.start(t0 + d); o.stop(t0 + d + 1);
  });
  hiss(2.2, 0.16, 'bandpass', 900, 1200, 0.8, 0.4);
}
// v5: physics towers + specials
let lastCrunch = 0;
export const crunch = (v = 1) => { // stone on stone (throttled: many blocks land at once)
  if (!ok() || ctx.currentTime - lastCrunch < 0.07) return; lastCrunch = ctx.currentTime;
  hiss(0.18 + 0.15 * v, 0.25 + 0.25 * v, 'lowpass', 1600, 200, 1, 0.004); osc('square', 85 + Math.random() * 40, 38, 0.14, 0.18 * v, bp(300, 1.5));
};
export const boom = () => { if (!ok()) return; hiss(1.6, 0.9, 'lowpass', 2400, 50, 0.7, 0.003); osc('sine', 120, 28, 1.1, 0.9); osc('sawtooth', 70, 30, 0.5, 0.25, bp(180, 1)); };
export const pop = () => { if (!ok()) return; hiss(0.08, 0.5, 'highpass', 4000, 1500); osc('sine', 880, 1760, 0.15, 0.25); setTimeout(ding, 120); };
export function whir(dur = 3) { // spinning wheels: rising then falling buzz with a rattle
  if (!ok()) return;
  const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = bp(700, 2), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(320, t + 0.5); o.frequency.setValueAtTime(320, t + dur - 0.6); o.frequency.exponentialRampToValueAtTime(60, t + dur);
  lfo.frequency.value = 24; lg.gain.value = 40; lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.3); g.gain.setValueAtTime(0.16, t + dur - 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(master); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  hiss(dur, 0.08, 'bandpass', 2500, 1800, 3, 0.2);
}
// v6.0 fun batch: rubber chicken, cow, boot, sad trombone, victory jingle, sparkle
export const played = {}; // call counts (tests check the right sound fired, even when muted)
const tag = n => { played[n] = (played[n] || 0) + 1; return ok(); };
function note(type, f0, f1, d, dur, peak, filter, vib = 0, vibF = 6) { // scheduled note with optional vibrato
  const t = ctx.currentTime + d, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.03); g.gain.setValueAtTime(peak, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vibF; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  if (filter) { o.connect(filter); filter.connect(g); } else o.connect(g);
  g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
export const squawk = () => { if (!tag('squawk')) return; const p = 0.9 + Math.random() * 0.25; note('square', 900 * p, 1500 * p, 0, 0.12, 0.12, bp(1400, 3)); note('square', 1500 * p, 700 * p, 0.12, 0.22, 0.12, bp(1200, 3), 60, 30); };
export const honk = () => { if (!tag('honk')) return; note('sawtooth', 520, 380, 0, 0.18, 0.2, bp(900, 4), 40, 28); hiss(0.05, 0.15, 'highpass', 3000, 2000); };
export const moo = () => { if (!tag('moo')) return; note('sawtooth', 150, 118, 0, 1.1, 0.22, bp(420, 2.5), 4, 5); note('sawtooth', 300, 236, 0.02, 1.05, 0.06, bp(700, 4)); };
export const stomp = () => { if (!tag('stomp')) return; osc('sine', 90, 24, 1.2, 1); hiss(0.9, 0.8, 'lowpass', 1200, 60, 0.7, 0.003); osc('square', 60, 30, 0.3, 0.3, bp(160, 1)); };
export const boing = () => { if (!tag('boing')) return; note('sine', 180, 520, 0, 0.35, 0.25, null, 25, 14); };
export function trombone() { // sad 'wah wah wah waaah'
  if (!tag('trombone')) return;
  [[311, 0, 0.42], [294, 0.48, 0.42], [277, 0.96, 0.42], [262, 1.44, 1.3]].forEach(([f, d, dur], k) => note('sawtooth', f, k === 3 ? f * 0.93 : f * 0.97, d, dur, 0.17, bp(f * 2.2, 1.6), k === 3 ? 9 : 3, 5));
}
export function jingle() { // short victory tune
  if (!tag('jingle')) return;
  [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.52], [1047, 0.64]].forEach(([f, d], k) => note('square', f, f, d, k === 5 ? 0.5 : 0.13, 0.08, bp(f * 1.5, 1)));
  [[262, 0], [392, 0.36], [523, 0.64]].forEach(([f, d]) => note('triangle', f, f, d, 0.3, 0.12));
}
export const sparkle = () => { if (!tag('sparkle')) return; [1568, 2093, 2637, 3136].forEach((f, k) => note('sine', f, f, k * 0.06, 0.35, 0.07)); };
// v6.1 fun drop 2: banana squeak, pigeons, loo roll, disco loop, grandma handbag
export const squeak = () => { if (!tag('squeak')) return; note('sine', 1200, 2400, 0, 0.12, 0.18); note('sine', 2400, 900, 0.12, 0.2, 0.15, null, 80, 30); };
export const coo = () => { if (!tag('coo')) return; [0, 0.22, 0.5].forEach((d, k) => note('sine', 420 - k * 30, 330, d, 0.2, 0.12, bp(500, 2), 30, 18)); hiss(0.6, 0.05, 'bandpass', 1500, 2500, 2, 0.1); };
export const splat = () => { if (!tag('splat')) return; hiss(0.18, 0.4, 'lowpass', 1200, 200, 1, 0.003); osc('sine', 260, 70, 0.15, 0.3); };
export const unroll = () => { if (!tag('unroll')) return; hiss(0.7, 0.12, 'highpass', 3000, 5000, 1, 0.05); };
export const wrapUp = () => { if (!tag('wrapUp')) return; [0, 0.1, 0.2, 0.3].forEach(d => note('triangle', 600, 900, d, 0.08, 0.08)); hiss(0.4, 0.15, 'highpass', 2500, 4000); };
export const smack = () => { if (!tag('smack')) return; hiss(0.07, 0.6, 'bandpass', 1800, 900, 1.2, 0.002); osc('square', 160, 60, 0.1, 0.3, bp(500, 2)); };
export const grannyHey = () => { if (!tag('grannyHey')) return; note('square', 700, 980, 0, 0.14, 0.08, bp(1300, 3), 20, 12); note('square', 980, 620, 0.16, 0.24, 0.08, bp(1200, 3), 30, 14); };
export const bigHead = () => { if (!tag('bigHead')) return; note('sine', 200, 900, 0, 0.5, 0.2, null, 15, 10); };
let disco = null; // disco loop: four-on-the-floor kick + offbeat hat + a little bassline, until discoStop()
export function discoStart(secs = 8) {
  tag('disco'); discoStop();
  if (!ok()) return;
  let n = 0; const bass = [110, 110, 165, 147];
  const beat = () => { if (!ok()) return; osc('sine', 150, 45, 0.12, 0.5); setTimeout(() => ok() && hiss(0.04, 0.12, 'highpass', 7000, 6000), 125); note('square', bass[n % 4], bass[n % 4], 0, 0.2, 0.06, bp(400, 1)); n++; };
  beat(); const id = setInterval(beat, 250), stop = setTimeout(discoStop, secs * 1000);
  disco = { id, stop };
}
export function discoStop() { if (disco) { clearInterval(disco.id); clearTimeout(disco.stop); disco = null; } }
export const discoOn = () => !!disco;
// v6.2: Arrow Becomes You (whoosh-poof teleport, melee bonk) and the halo egg's little choir
export const poof = () => { if (!tag('poof')) return; hiss(0.35, 0.35, 'bandpass', 600, 3200, 1.5, 0.01); note('sine', 300, 1200, 0, 0.22, 0.16); };
export const bonk = () => { if (!tag('bonk')) return; note('square', 260, 120, 0, 0.12, 0.2, bp(700, 2)); note('sine', 520, 500, 0.02, 0.2, 0.12); };
export const choir = () => { if (!tag('choir')) return; [523, 659, 784].forEach((f, k) => note('sine', f, f, k * 0.02, 1.1, 0.06)); };
