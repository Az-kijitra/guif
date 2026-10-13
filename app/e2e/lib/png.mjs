// A tiny PNG writer (Node built-ins only: node:zlib) for the viewer image checks: a flat grey picture with coloured
// squares in the corners, so that "the top-left / bottom-right corner is visible" can be seen in a screenshot too.

import zlib from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

export const CORNER_COLORS = { topLeft: [220, 30, 30], topRight: [30, 160, 30], bottomLeft: [30, 30, 220], bottomRight: [230, 200, 20] };

/** `width` x `height` RGB PNG: grey background, a 10 x 10 square of CORNER_COLORS in each corner (or smaller for tiny images). */
export function makePng(width, height, { background = [190, 190, 190], marks = true } = {}) {
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const at = rowStart + 1 + x * 3;
      raw[at] = background[0];
      raw[at + 1] = background[1];
      raw[at + 2] = background[2];
    }
  }
  if (marks) {
    const size = Math.min(10, Math.max(1, Math.floor(Math.min(width, height) / 4)));
    const paint = (x0, y0, color) => {
      for (let y = y0; y < y0 + size; y++) {
        for (let x = x0; x < x0 + size; x++) {
          const at = y * stride + 1 + x * 3;
          raw[at] = color[0];
          raw[at + 1] = color[1];
          raw[at + 2] = color[2];
        }
      }
    };
    paint(0, 0, CORNER_COLORS.topLeft);
    paint(width - size, 0, CORNER_COLORS.topRight);
    paint(0, height - size, CORNER_COLORS.bottomLeft);
    paint(width - size, height - size, CORNER_COLORS.bottomRight);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
