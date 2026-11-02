/**
 * Generates the Directly icon set: a purple rounded square with a white
 * speech bubble. Written by hand as a small PNG encoder so the repo needs no
 * image toolchain, and so the icon is provably ours (no traced asset).
 *
 *   node tools/make-icons.mjs
 *
 * Outputs: apps/extension/icons/*.png, apps/ios/assets/icon.png,
 *          apps/web/assets/icon-{48,192,512}.png
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ----------------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- drawing

const PURPLE_TOP = [125, 110, 240];
const PURPLE_BOTTOM = [91, 75, 214];

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/** The speech bubble: a rounded body with a small tail to the lower left. */
function insideBubble(nx, ny) {
  const body = insideRoundedRect(nx, ny, 0.27, 0.29, 0.73, 0.62, 0.11);
  if (body) return true;
  // Tail: a triangle hanging under the body's left third.
  if (ny >= 0.58 && ny <= 0.73 && nx >= 0.34 && nx <= 0.5) {
    const t = (ny - 0.58) / 0.15;
    return nx <= 0.5 - t * 0.14;
  }
  return false;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = size <= 32 ? 4 : 2;
  const radius = size * 0.235;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let squareHits = 0;
      let bubbleHits = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          if (insideRoundedRect(px, py, 0.5, 0.5, size - 0.5, size - 0.5, radius)) {
            squareHits += 1;
            if (insideBubble(px / size, py / size)) bubbleHits += 1;
          }
        }
      }
      const total = samples * samples;
      const coverage = squareHits / total;
      if (coverage === 0) continue;

      const t = y / size;
      const bg = [
        Math.round(PURPLE_TOP[0] + (PURPLE_BOTTOM[0] - PURPLE_TOP[0]) * t),
        Math.round(PURPLE_TOP[1] + (PURPLE_BOTTOM[1] - PURPLE_TOP[1]) * t),
        Math.round(PURPLE_TOP[2] + (PURPLE_BOTTOM[2] - PURPLE_TOP[2]) * t),
      ];
      const bubble = bubbleHits / total;
      const offset = (y * size + x) * 4;
      rgba[offset] = Math.round(bg[0] + (255 - bg[0]) * bubble);
      rgba[offset + 1] = Math.round(bg[1] + (255 - bg[1]) * bubble);
      rgba[offset + 2] = Math.round(bg[2] + (255 - bg[2]) * bubble);
      rgba[offset + 3] = Math.round(255 * coverage);
    }
  }

  return encodePng(size, rgba);
}

const targets = [
  ...[16, 32, 48, 128].map((size) => [`apps/extension/icons/icon${size}.png`, size]),
  ['apps/web/assets/icon-192.png', 192],
  ['apps/web/assets/icon-512.png', 512],
  ['apps/ios/assets/icon.png', 1024],
];

for (const [relative, size] of targets) {
  const file = path.join(root, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, render(size));
  console.log(`icon: ${relative} (${size}px)`);
}
