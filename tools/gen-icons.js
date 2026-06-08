#!/usr/bin/env node
/**
 * Generates PNG icons from the SVGs in public/ using Electron's offscreen rendering.
 * Run: npx electron tools/gen-icons.js
 *
 * Outputs:
 *   assets/icon.png            — 512x512 app icon
 *   assets/icon.icns           — macOS app icon
 *   assets/trayTemplate.png    — 22x22 menu bar icon (macOS template)
 *   assets/trayTemplate@2x.png — 44x44 retina menu bar icon
 *   assets/tray.png            — 16x16 tray icon (Windows)
 */

const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

app.whenReady().then(async () => {
  const assetsDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir);

  async function svgToPng(svgPath, size) {
    const win = new BrowserWindow({
      width: size, height: size, show: false,
      transparent: true,
      webPreferences: { offscreen: true },
    });
    const svg = fs.readFileSync(svgPath, 'utf8');
    const html = `<!DOCTYPE html>
      <html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden;}</style></head>
      <body><div style="width:${size}px;height:${size}px">${svg}</div></body></html>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 600));
    const img = await win.webContents.capturePage();
    win.close();
    return img.toPNG();
  }

  const appSvg = path.join(__dirname, '..', 'public', 'app_icon.svg');
  const traySvg = path.join(__dirname, '..', 'public', 'tray_menu_icon.svg');

  console.log('Generating app icon PNGs...');
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const s of sizes) {
    const png = await svgToPng(appSvg, s);
    fs.writeFileSync(path.join(assetsDir, `icon_${s}x${s}.png`), png);
    console.log(`  icon_${s}x${s}.png`);
  }
  fs.copyFileSync(
    path.join(assetsDir, 'icon_512x512.png'),
    path.join(assetsDir, 'icon.png')
  );

  // Tray icons: render white-on-black at a large size, crop to the keyboard
  // content area, resize to target, then convert luminance → alpha for a proper
  // macOS template image (black content on transparent background).
  async function svgToTrayPng(svgPath, targetSize) {
    // Render at 4x the target for quality, then resize
    const renderSize = 256;
    const win = new BrowserWindow({
      width: renderSize, height: renderSize, show: false,
      webPreferences: { offscreen: true },
    });
    const svg = fs.readFileSync(svgPath, 'utf8');
    // The SVG viewBox is 680x680 but the keyboard is centered at 340,340
    // spanning roughly x:170-510 y:230-450 (340x220). We override the
    // viewBox to crop tightly to the keyboard content with some padding.
    const croppedSvg = svg.replace(/viewBox="[^"]*"/, 'viewBox="40 100 600 480"');
    const html = `<!DOCTYPE html>
      <html><head><style>html,body{margin:0;padding:0;background:#000;overflow:hidden;}</style></head>
      <body><div style="width:${renderSize}px;height:${renderSize}px;display:flex;align-items:center;justify-content:center">${croppedSvg}</div></body></html>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise(r => setTimeout(r, 600));
    const img = await win.webContents.capturePage();
    win.close();

    // Resize to target
    const resized = img.resize({ width: targetSize, height: targetSize, quality: 'best' });
    const bmp = resized.toBitmap();
    const w = resized.getSize().width;
    const h = resized.getSize().height;

    // Convert luminance → alpha, fill with black (macOS template format)
    const buf = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const r = bmp[i * 4];
      const g = bmp[i * 4 + 1];
      const b = bmp[i * 4 + 2];
      const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      buf[i * 4] = 0;
      buf[i * 4 + 1] = 0;
      buf[i * 4 + 2] = 0;
      buf[i * 4 + 3] = lum;
    }
    const ni = nativeImage.createFromBitmap(buf, { width: w, height: h });
    return ni.toPNG();
  }

  console.log('Generating tray icon PNGs...');
  const tray16 = await svgToTrayPng(traySvg, 16);
  fs.writeFileSync(path.join(assetsDir, 'tray.png'), tray16);
  console.log('  tray.png (16x16)');

  const tray22 = await svgToTrayPng(traySvg, 22);
  fs.writeFileSync(path.join(assetsDir, 'trayTemplate.png'), tray22);
  console.log('  trayTemplate.png (22x22)');

  const tray44 = await svgToTrayPng(traySvg, 44);
  fs.writeFileSync(path.join(assetsDir, 'trayTemplate@2x.png'), tray44);
  console.log('  trayTemplate@2x.png (44x44)');

  console.log('Generating .icns...');
  const iconsetDir = path.join(assetsDir, 'icon.iconset');
  if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir);
  const icnsMap = [
    [16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'], [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'], [1024, 'icon_512x512@2x.png'],
  ];
  for (const [size, name] of icnsMap) {
    fs.copyFileSync(
      path.join(assetsDir, `icon_${size}x${size}.png`),
      path.join(iconsetDir, name)
    );
  }
  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(assetsDir, 'icon.icns')}"`);
    console.log('  icon.icns');
  } catch (e) {
    console.log('  iconutil failed:', e.message);
  }
  fs.rmSync(iconsetDir, { recursive: true, force: true });

  console.log('Done!');
  app.quit();
});
