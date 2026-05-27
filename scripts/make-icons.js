// Generates the PWA / home-screen icons as flat PNGs with no dependencies.
// The icon is the game's cyan player square on the dark background, plus the
// neon ground line, so the home-screen icon matches what the player sees.
// Run: node scripts/make-icons.js  (writes icon-512.png, icon-192.png,
// apple-touch-icon.png to the repo root). The OS applies its own rounded mask.
const fs = require('fs');
const zlib = require('zlib');

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function png(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

function makeIcon(size) {
  const bg = rgb(0x0b0b16);
  const cy = rgb(0x2ee6ff);
  const rgba = Buffer.alloc(size * size * 4);
  const cs = Math.round(size * 0.42);
  const off = Math.round((size - cs) / 2);
  const offY = Math.round(size * 0.44 - cs / 2);
  const lineY = Math.round(size * 0.72);
  const lineH = Math.max(2, Math.round(size * 0.014));
  const lineX0 = Math.round(size * 0.18);
  const lineX1 = Math.round(size * 0.82);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let col = bg;
      if (x >= off && x < off + cs && y >= offY && y < offY + cs) col = cy;
      else if (y >= lineY && y < lineY + lineH && x >= lineX0 && x < lineX1) col = cy;
      const i = (y * size + x) * 4;
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = 255;
    }
  }
  return png(size, rgba);
}

fs.writeFileSync('icon-512.png', makeIcon(512));
fs.writeFileSync('icon-192.png', makeIcon(192));
fs.writeFileSync('apple-touch-icon.png', makeIcon(180));
console.log('icons written: icon-512.png, icon-192.png, apple-touch-icon.png');
