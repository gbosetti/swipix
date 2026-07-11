// Regenerates the app icon/splash PNGs from the SVG sources in assets/.
// Run with: node scripts/generate-icons.js
// Edit the .svg sources to change the design, then re-run.
const sharp = require('sharp');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');

async function main() {
  await sharp(path.join(ASSETS, 'icon-source.svg'))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS, 'icon.png'));

  await sharp(path.join(ASSETS, 'icon-transparent-source.svg'))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS, 'adaptive-icon.png'));

  await sharp(path.join(ASSETS, 'splash-wordmark-source.svg'))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(ASSETS, 'splash-icon.png'));

  await sharp(path.join(ASSETS, 'icon-source.svg'))
    .resize(48, 48)
    .png()
    .toFile(path.join(ASSETS, 'favicon.png'));

  console.log('Generated icon.png, adaptive-icon.png, splash-icon.png, favicon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
