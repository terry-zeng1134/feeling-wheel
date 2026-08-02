/**
 * Generates the app icons with no image dependencies — rasterises the day glyph
 * into an RGBA buffer and writes a PNG by hand (IHDR / IDAT / IEND + CRC32).
 * Run: node tools/make-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const FAMILIES = [
  // [hex, angle deg from 12 o'clock, spoke length as fraction of usable radius]
  ["#1baf7a", 0, 0.95],   // peaceful
  ["#eda100", 60, 0.72],  // joyful
  ["#e87ba4", 120, 0.86], // scared
  ["#2a78d6", 180, 0.60], // sad
  ["#e34948", 240, 0.78], // mad
  ["#4a3aa7", 300, 0.66], // powerful
];
const BG = [22, 21, 15];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Distance from point p to segment ab. */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  let t = L2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function render(S) {
  const buf = new Uint8Array(S * S * 4);
  const c = S / 2, rHub = S * 0.10, rMax = S * 0.37;
  const halfW = Math.max(1, S * 0.036) / 2;
  const ringW = Math.max(0.8, S * 0.008) / 2;

  const spokes = FAMILIES.map(([h, deg, len]) => {
    const a = ((deg - 90) * Math.PI) / 180;
    const r1 = rHub + (rMax - rHub) * len;
    return {
      rgb: hex(h),
      ax: c + rHub * Math.cos(a), ay: c + rHub * Math.sin(a),
      bx: c + r1 * Math.cos(a), by: c + r1 * Math.sin(a),
    };
  });

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const px = x + 0.5, py = y + 0.5;
      let [r, g, b] = BG;

      // faint guide ring
      const dRing = Math.abs(Math.hypot(px - c, py - c) - rMax);
      if (dRing < ringW + 0.7) {
        const a = Math.max(0, Math.min(1, (ringW + 0.7 - dRing) / 0.7)) * 0.18;
        r += (255 - r) * a; g += (255 - g) * a; b += (255 - b) * a;
      }
      // spokes, drawn over
      for (const s of spokes) {
        const d = segDist(px, py, s.ax, s.ay, s.bx, s.by);
        if (d < halfW + 0.7) {
          const a = Math.max(0, Math.min(1, (halfW + 0.7 - d) / 0.7));
          r += (s.rgb[0] - r) * a; g += (s.rgb[1] - g) * a; b += (s.rgb[2] - b) * a;
        }
      }
      const i = (y * S + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
  return buf;
}

/* ── minimal PNG writer ───────────────────────────────────────────── */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(S, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, y * S * 4, S * 4).copy(raw, y * (S * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const S of [180, 192, 512]) {
  writeFileSync(new URL(`../icon-${S}.png`, import.meta.url), png(S, render(S)));
  console.log(`icon-${S}.png`);
}
