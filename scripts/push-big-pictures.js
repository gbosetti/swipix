#!/usr/bin/env node
/**
 * Generates a handful of genuinely large (20-200MB) JPEGs and pushes them
 * to a connected Android device so the "Big Pictures" category
 * (BigPicturesStrategy: 20MB-200MB) has real matches to test against.
 *
 * Random-noise pixels are used on purpose — noise barely compresses under
 * JPEG's DCT quantization, so a modest resolution reaches tens of MB
 * (a real photo of the same file size would need a far higher
 * resolution/detail level to resist compression the same way).
 *
 * Usage: node scripts/push-big-pictures.js [device-serial]
 * Re-run any time you want a fresh batch — each run picks new random
 * pixels and overwrites the previous batch's files on the device.
 */

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const DEVICE_DIR = '/sdcard/DCIM/BigPictures';
const TARGET_SIZES_MB = [22, 35, 55, 80, 120];
const JPEG_QUALITY = 92;
const ASPECT = 4 / 3;

function findAdb() {
  const candidates = [
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
    'adb',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  throw new Error('Could not find adb. Set ANDROID_HOME or install Android platform-tools.');
}

function assertDeviceConnected(adb, serial) {
  const args = serial ? ['-s', serial, 'get-state'] : ['get-state'];
  try {
    execFileSync(adb, args, { stdio: 'pipe' }).toString().trim();
  } catch {
    throw new Error('No Android device connected (or the given serial is wrong). Run `adb devices` to check.');
  }
}

async function noiseJpegBytesPerPixel() {
  const calibrationSide = 1200;
  const raw = crypto.randomBytes(calibrationSide * calibrationSide * 3);
  const buffer = await sharp(raw, { raw: { width: calibrationSide, height: calibrationSide, channels: 3 } })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
  return buffer.length / (calibrationSide * calibrationSide);
}

function exifTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function makeBigPictureJpeg(targetBytes, bytesPerPixel, outPath, takenAt) {
  const targetPixels = targetBytes / bytesPerPixel;
  const width = Math.round(Math.sqrt(targetPixels * ASPECT));
  const height = Math.round(targetPixels / width);
  const raw = crypto.randomBytes(width * height * 3);
  const exifDate = exifTimestamp(takenAt);
  // Without a DateTimeOriginal, Android's media scanner leaves DATE_TAKEN
  // NULL — expo-media-library sorts by that column, so a NULL-dated photo
  // lands at the very end of a "most recent first" fetch instead of near
  // the top like a real camera photo would. Confirmed on a real device:
  // Big Pictures scanned almost the entire library before ever reaching
  // these files. Stamping a recent date fixes the sort position.
  // Empirically confirmed (piexif-decoded a probe file): sharp's Exif
  // sub-IFD tags (DateTimeOriginal/DateTimeDigitized) only land correctly
  // under the "IFD2" key, not the more intuitive "ExifIFD" — the latter
  // is silently accepted but produces no tag at all.
  await sharp(raw, { raw: { width, height, channels: 3 } })
    .withExif({ IFD0: { DateTime: exifDate }, IFD2: { DateTimeOriginal: exifDate, DateTimeDigitized: exifDate } })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(outPath);
  return fs.statSync(outPath).size;
}

async function main() {
  const serial = process.argv[2];
  const adb = findAdb();
  assertDeviceConnected(adb, serial);
  const adbArgs = (args) => (serial ? ['-s', serial, ...args] : args);

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swipix-big-pictures-'));
  console.log(`==> Calibrating JPEG compression for random noise…`);
  const bytesPerPixel = await noiseJpegBytesPerPixel();

  console.log(`==> Generating ${TARGET_SIZES_MB.length} large JPEGs in ${workDir}…`);
  const files = [];
  let i = 0;
  for (const targetMb of TARGET_SIZES_MB) {
    const outPath = path.join(workDir, `big_${targetMb}mb.jpg`);
    // Staggered by a minute each, most recent first — avoids identical
    // EXIF timestamps across files (fine either way for sorting, but
    // matches how real photos never share a capture second).
    const takenAt = new Date(Date.now() - i * 60000);
    const actualBytes = await makeBigPictureJpeg(targetMb * 1024 * 1024, bytesPerPixel, outPath, takenAt);
    console.log(`    ${path.basename(outPath)}: ${(actualBytes / 1024 / 1024).toFixed(1)} MB`);
    files.push(outPath);
    i += 1;
  }

  console.log(`==> Pushing to ${DEVICE_DIR} on the device…`);
  execFileSync(adb, adbArgs(['shell', 'mkdir', '-p', DEVICE_DIR]), { stdio: 'inherit' });
  const deviceFiles = [];
  for (const file of files) {
    const deviceFile = `${DEVICE_DIR}/${path.basename(file)}`;
    execFileSync(adb, adbArgs(['push', file, deviceFile]), { stdio: 'inherit' });
    deviceFiles.push(deviceFile);
  }

  // The bulk `content call scan_volume` rescan only inserts stub rows with
  // a NULL _size on this device — confirmed via `content query` after
  // using it, which is exactly what made BigPicturesStrategy's size filter
  // find nothing. A per-file MEDIA_SCANNER_SCAN_FILE broadcast triggers a
  // real metadata extraction pass and reliably populates _size instead.
  console.log('==> Triggering a per-file media scan so MediaStore picks up real file sizes…');
  for (const deviceFile of deviceFiles) {
    execFileSync(adb, adbArgs(['shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file://${deviceFile}`]), { stdio: 'inherit' });
  }

  fs.rmSync(workDir, { recursive: true, force: true });

  console.log('\nDone. If the new photos still don\'t show up in Swipix, open the Gallery app on');
  console.log('the phone once as a fallback — that has reliably forced indexing before when');
  console.log('other adb-triggered rescans stalled.');
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
