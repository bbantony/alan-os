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
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-maskable-512.png", 512, { maskablePadding: 0.1 }],
  ["apple-touch-icon.png", 180, {}],
  ["favicon-32.png", 32, {}],
];

for (const [name, size, opts] of outputs) {
  const png = drawIcon(size, opts);
  writeFileSync(new URL(`../public/icons/${name}`, import.meta.url), png);
  console.log(`wrote ${name} (${png.length} bytes)`);
}
