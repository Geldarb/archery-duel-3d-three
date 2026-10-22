// Player looks: purely cosmetic options shared by the browser and the server (which sanitises what clients send).
export const PALETTE = [
  { id: 'blue', name: 'Blue', hex: 0x2f6fe0 }, { id: 'red', name: 'Red', hex: 0xe0342c }, { id: 'green', name: 'Green', hex: 0x2fa82a },
  { id: 'purple', name: 'Purple', hex: 0x8e44d6 }, { id: 'orange', name: 'Orange', hex: 0xf2860d }, { id: 'teal', name: 'Teal', hex: 0x12a3a3 },
  { id: 'pink', name: 'Pink', hex: 0xe84393 }, { id: 'gold', name: 'Gold', hex: 0xe8b416 },
];
export const FLETCH = [
  { id: 'white', hex: 0xffffff }, { id: 'gold', hex: 0xffc928 }, { id: 'red', hex: 0xe0342c }, { id: 'blue', hex: 0x3d8bff },
  { id: 'green', hex: 0x4cd13a }, { id: 'purple', hex: 0xa45ee8 }, { id: 'black', hex: 0x2a2a35 }, { id: 'pink', hex: 0xff7ab8 },
];
export const HELMETS = [['round', 'Round helm'], ['kettle', 'Kettle helm'], ['hood', 'Hood'], ['crown', 'Crown'], ['feather', 'Feathered cap']];
export const EMBLEMS = [['chevron', 'Chevron'], ['crown', 'Crown'], ['star', 'Star'], ['cross', 'Cross'], ['plain', 'Plain']];
export const BOWS = [['long', 'Longbow'], ['recurve', 'Recurve'], ['gold', 'Golden bow']];
export const TAUNTS = ['Bullseye!', 'Better luck next siege!', 'Long live the crown!', 'My castle, my rules!', 'Too slow, archer!',
  'Victory is mine!', 'Ha! Missed me!', 'Good game, well shot!'];
const ids = list => list.map(x => (Array.isArray(x) ? x[0] : x.id));
export const DEFAULTS = [
  { name: 'Blue', color: 'blue', helmet: 'round', emblem: 'chevron', bow: 'long', fletch: 'white', taunt: 0 },
  { name: 'Red', color: 'red', helmet: 'round', emblem: 'crown', bow: 'long', fletch: 'white', taunt: 1 },
];
export const cleanName = (s, fallback) => {
  const n = String(s ?? '').replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N} _'.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();
  return n || fallback;
};
export function sanitizeLook(l, slot = 0) { // anything unknown falls back to the slot's default
  const d = DEFAULTS[slot ? 1 : 0], o = l && typeof l === 'object' ? l : {};
  const pick = (v, list, def) => (ids(list).includes(v) ? v : def);
  const t = Number.isInteger(o.taunt) && o.taunt >= 0 && o.taunt < TAUNTS.length ? o.taunt : d.taunt;
  return { name: cleanName(o.name, d.name), color: pick(o.color, PALETTE, d.color), helmet: pick(o.helmet, HELMETS, d.helmet),
    emblem: pick(o.emblem, EMBLEMS, d.emblem), bow: pick(o.bow, BOWS, d.bow), fletch: pick(o.fletch, FLETCH, d.fletch), taunt: t };
}
export const hexOf = (list, id) => (list.find(x => x.id === id) || list[0]).hex;
// Team colours for the two seats; if both picked the same colour, seat 2 gets a darker/lighter tint so they stay distinguishable.
export function teamColors(l0, l1) {
  const c0 = hexOf(PALETTE, l0.color), c1 = hexOf(PALETTE, l1.color);
  if (c0 !== c1) return [c0, c1];
  const r = c1 >> 16, g = (c1 >> 8) & 255, b = c1 & 255, lum = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
  const f = lum > 0.5 ? 0.55 : 0.5, mix = v => (lum > 0.5 ? Math.round(v * f) : Math.round(v + (255 - v) * f));
  return [c0, (mix(r) << 16) | (mix(g) << 8) | mix(b)];
}
