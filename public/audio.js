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
