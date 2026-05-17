// Workaround for the well-known Windows electron-builder issue where extracting
// winCodeSign-X.Y.Z.7z fails because the archive contains macOS dylib symlinks
// that need SeCreateSymbolicLinkPrivilege (admin or Developer Mode + re-login).
//
// We're building for Windows-only, so the darwin/ folder isn't needed. This
// script downloads the archive once and extracts it WITHOUT darwin/, placing
// the result where electron-builder expects it so the build picks it up
// straight from cache.
//
// Run once before `npm run dist:win`:
//   node scripts/prime-wincodesign-cache.cjs

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { execFileSync } = require('node:child_process');

const VERSION = '2.6.0';
const URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-${VERSION}/winCodeSign-${VERSION}.7z`;
const CACHE_ROOT = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'winCodeSign');
const FINAL_DIR = path.join(CACHE_ROOT, `winCodeSign-${VERSION}`);
const TEMP_7Z = path.join(CACHE_ROOT, `winCodeSign-${VERSION}.7z`);
const SEVENZIP = path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = (target) => https.get(target, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return req(res.headers.location);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    });
    req(url);
  });
}

(async () => {
  if (fs.existsSync(path.join(FINAL_DIR, 'windows-10'))) {
    console.log(`Cache already populated at ${FINAL_DIR}`);
    return;
  }

  fs.mkdirSync(CACHE_ROOT, { recursive: true });
  fs.mkdirSync(FINAL_DIR, { recursive: true });

  console.log(`Downloading ${URL}…`);
  await download(URL, TEMP_7Z);
  console.log(`Saved → ${TEMP_7Z}`);

  console.log('Extracting (skipping darwin/ which contains symlinks)…');
  // -y: assume yes
  // -bd: disable progress bar
  // -snld: don't extract symlinks
  // -xr!darwin: exclude any "darwin" directory recursively
  try {
    execFileSync(SEVENZIP, [
      'x', '-y', '-bd', '-snld', '-xr!darwin',
      TEMP_7Z, `-o${FINAL_DIR}`,
    ], { stdio: 'inherit' });
  } catch (e) {
    console.error('Extraction failed:', e.message);
    process.exit(1);
  }

  try { fs.unlinkSync(TEMP_7Z); } catch {}
  console.log(`\n✔ Cache primed at ${FINAL_DIR}`);
  console.log('Now run:  npm run dist:win');
})().catch((e) => { console.error(e); process.exit(1); });
