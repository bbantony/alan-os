// Generates the PWA icon set as plain PNGs using only Node's built-in zlib
// (no image-library dependency, since native-binary installs are restricted
// in this environment). Draws a simple geometric mark: British Racing Green
// square, cream rounded inset, ink chevron — a placeholder "A" mark for
// Alan OS that can be swapped for real artwork later.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BRG = [0x00, 0x42, 0x25];
const CREAM = [0xfa, 0xf7, 0xf2];
const INK = [0x14, 0x14, 0x0f];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function inSet(x, y, size, margin) {
  // rounded-square inset test
  const r = size * 0.22;
  const x0 = margin, y0 = margin, x1 = size - margin, y1 = size - margin;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const corners = [
    [x0 + r, y0 + r],
    [x1 - r, y0 + r],
    [x0 + r, y1 - r],
    [x1 - r, y1 - r],
  ];
  for (const [cx, cy] of corners) {
    const nearX = (x < x0 + r && cx === x0 + r) || (x > x1 - r && cx === x1 - r);
    const nearY = (y < y0 + r && cy === y0 + r) || (y > y1 - r && cy === y1 - r);
    if (nearX && nearY) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r) return false;
    }
  }
  return true;
}

/**
 * Fraction of a pixel covered by `test`, sampled on an n×n grid.
 *
 * The app icons are drawn with a hard per-pixel test, which is fine at 192px
 * and up. The notification badge is displayed at roughly 24dp, where an
 * un-antialiased diagonal is visibly ragged — and since the badge is pure
 * alpha, partial coverage maps straight onto partial opacity and comes out
 * clean.
 */
function coverage(x, y, size, test, samples = 4) {
  let hits = 0;
  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      if (test(x + (sx + 0.5) / samples, y + (sy + 0.5) / samples, size)) hits += 1;
    }
  }
  return hits / (samples * samples);
}

/**
 * The chevron again, but proportioned for the status bar: taller, wider at the
 * base and noticeably thicker in the leg. At 24dp the app icon's slimmer
 * version closes up into a smudge, so the badge gets its own geometry rather
 * than a scaled copy.
 */
function inBadgeChevron(x, y, size) {
  const cx = size / 2;
  const top = size * 0.14;
  const bottom = size * 0.86;
  const halfWidthTop = size * 0.05;
  const halfWidthBottom = size * 0.4;
  const thickness = size * 0.19;

  if (y < top || y > bottom) return false;
  const t = (y - top) / (bottom - top);
  const outer = halfWidthTop + (halfWidthBottom - halfWidthTop) * t;
  const inner = Math.max(0, outer - thickness);
  const dist = Math.abs(x - cx);
  return dist <= outer && dist >= inner;
}

/**
 * The Android notification badge — the small mark in the status bar.
 *
 * Android reads ONLY the alpha channel here and paints whatever is opaque in a
 * flat colour of its own choosing. A fully-opaque image therefore renders as a
 * solid block, which is exactly what was happening: `sw.js` was passing
 * `icon-192.png` as the badge, every pixel of it opaque, so Samsung drew a
 * white square. The colours below are irrelevant to the result; the
 * transparency is the entire point.
 */
function drawBadge(size) {
  // Buffer.alloc zero-fills, so every pixel starts fully transparent.
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const alpha = Math.round(coverage(x, y, size, inBadgeChevron) * 255);
      if (alpha === 0) continue;
      const idx = (y * size + x) * 4;
      rgba[idx] = 255;
      rgba[idx + 1] = 255;
      rgba[idx + 2] = 255;
      rgba[idx + 3] = alpha;
    }
  }
  return encodePNG(size, size, rgba);
}

function inChevron(x, y, size) {
  // simple upward chevron ("A" without crossbar), ink-colored, centered
  const cx = size / 2;
  const top = size * 0.32;
  const bottom = size * 0.68;
  const halfWidthTop = size * 0.03;
  const halfWidthBottom = size * 0.16;
  const thickness = size * 0.11;

  function legX(t) {
    return halfWidthTop + (halfWidthBottom - halfWidthTop) * t;
  }

  if (y < top || y > bottom) return false;
  const t = (y - top) / (bottom - top);
  const outer = legX(t);
  const inner = Math.max(0, outer - thickness);
  const dxLeft = x - cx;
  const dist = Math.abs(dxLeft);
  return dist <= outer && dist >= inner;
}

function drawIcon(size, { maskablePadding = 0 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const margin = maskablePadding > 0 ? size * maskablePadding : 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      let color = BRG;
      if (inSet(x, y, size, size * 0.1 + margin)) {
        color = CREAM;
        if (inChevron(x - margin * 0, y - margin * 0, size)) {
          // chevron drawn in full-size coordinate space regardless of margin
        }
      }
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = 255;
    }
  }
  // second pass: chevron on top of the cream inset
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inSet(x, y, size, size * 0.1 + margin) && inChevron(x, y, size)) {
        const idx = (y * size + x) * 4;
        rgba[idx] = INK[0];
        rgba[idx + 1] = INK[1];
        rgba[idx + 2] = INK[2];
        rgba[idx + 3] = 255;
      }
    }
  }
  return encodePNG(size, size, rgba);
}

mkdirSync(new URL("../public/icons", import.meta.url), { recursive: true });

const outputs = [
  ["icon-192.png", 192, {}, drawIcon],
  ["icon-512.png", 512, {}, drawIcon],
  ["icon-maskable-512.png", 512, { maskablePadding: 0.1 }, drawIcon],
  ["apple-touch-icon.png", 180, {}, drawIcon],
  ["favicon-32.png", 32, {}, drawIcon],
  // Android status bar. 96px is 24dp at xxxhdpi, the largest density Android
  // asks for, so it scales down cleanly to every smaller screen.
  ["badge-96.png", 96, {}, drawBadge],
];

for (const [name, size, opts, draw] of outputs) {
  const png = draw(size, opts);
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), png);
  console.log(`wrote ${name} (${png.length} bytes)`);
}
