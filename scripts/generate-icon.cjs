// One-shot icon generator. Produces resources/icon.png with the same rounded-square
// gradient + white waveform bars as the in-app LogoMark, so the OS window/taskbar
// shows the Meetly brand instead of the default Electron diamond.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const SIZE = 512;

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function buildPng(W, H) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(H * (1 + W * 4));
  const cornerR = W * 0.18;

  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < W; x++) {
      const off = rowStart + 1 + x * 4;
      // Rounded square mask
      const dx = x < cornerR ? cornerR - x : (x >= W - cornerR ? x - (W - cornerR - 1) : 0);
      const dy = y < cornerR ? cornerR - y : (y >= H - cornerR ? y - (H - cornerR - 1) : 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if ((dx > 0 || dy > 0) && dist > cornerR) {
        raw[off] = raw[off + 1] = raw[off + 2] = raw[off + 3] = 0;
        continue;
      }

      // Gradient: top-left #6D28D9 → bottom-right #0EA5E9
      const t = (x + y) / (W + H);
      let r = Math.round(0x6D * (1 - t) + 0x0E * t);
      let g = Math.round(0x28 * (1 - t) + 0xA5 * t);
      let b = Math.round(0xD9 * (1 - t) + 0xE9 * t);

      // Three white bars in the middle — left short, middle tall, right medium.
      const barW = W * 0.105;
      const cx = W / 2;
      const positions = [cx - barW * 2.4, cx - barW / 2, cx + barW * 1.4];
      const heights  = [H * 0.22,         H * 0.46,      H * 0.30];
      for (let i = 0; i < 3; i++) {
        const bx = positions[i];
        const by = H / 2 - heights[i] / 2;
        if (x >= bx && x < bx + barW && y >= by && y < by + heights[i]) {
          r = g = b = 0xff;
          break;
        }
      }

      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b; raw[off + 3] = 0xff;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

const outPath = path.join(__dirname, '..', 'resources', 'icon.png');
fs.writeFileSync(outPath, buildPng(SIZE, SIZE));
console.log(`wrote ${outPath} (${SIZE}x${SIZE})`);
