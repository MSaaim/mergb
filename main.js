const { app, BrowserWindow, ipcMain, desktopCapturer, Tray, Menu, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { MountainKeyboard } = require('./src/keyboard');
const { MinecraftWatcher } = require('./src/minecraft');
const { usb } = require('usb');

const kb = new MountainKeyboard();
const mc = new MinecraftWatcher();

let mainWindow = null;
let tray = null;
let isQuitting = false;

// ─── Close-to-tray notification preference ───────────────────────────────────
const closePrefFile = path.join(app.getPath('userData'), '.close-to-tray-dismissed');

function isCloseBannerDismissed() {
  return fs.existsSync(closePrefFile);
}

function dismissCloseBanner() {
  try { fs.writeFileSync(closePrefFile, '1'); } catch (_) {}
}

// ─── Tray ────────────────────────────────────────────────────────────────────
let currentEffect = null; // track for tray checkmarks

function buildTrayMenu() {
  const effects = [
    { id: 'static',    label: 'Static' },
    { id: 'wave',      label: 'Wave' },
    { id: 'breathing', label: 'Breathing' },
    { id: 'reactive',  label: 'Reactive' },
    { id: 'tornado',   label: 'Tornado' },
    { id: 'matrix',    label: 'Matrix' },
    { id: 'yeti',      label: 'Yeti' },
    { id: 'off',       label: 'Off' },
  ];

  return Menu.buildFromTemplate([
    { label: 'Show MeRGB', click: showWindow },
    { type: 'separator' },
    { label: 'Lighting', enabled: false },
    ...effects.map(e => ({
      label: `  ${e.label}`,
      type: 'checkbox',
      checked: currentEffect === e.id,
      click: () => applyEffectFromTray(e.id),
    })),
    {
      label: '  Custom',
      type: 'checkbox',
      checked: currentEffect === 'custom',
      click: () => openCustomMode(),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
}

async function applyEffectFromTray(effect) {
  if (!kb.connected) return;
  const saved = loadLightingState() || {};
  const p = 0;
  const color1 = saved.color1 || { r: 255, g: 77, b: 109 };
  const color2 = saved.color2 || { r: 0, g: 128, b: 255 };
  const speed = saved.speed ?? 128;
  const brightness = saved.brightness ?? 255;
  const colorMode = saved.colorMode || 'rainbow';
  const direction = saved.direction || 'right';

  try {
    switch (effect) {
      case 'static':    await kb.setStaticColor(color1.r, color1.g, color1.b, p); break;
      case 'wave':      await kb.setWave({ colorMode, color1, color2, direction, speed, brightness, profile: p }); break;
      case 'breathing': await kb.setBreathing({ color1, speed, brightness, profile: p }); break;
      case 'reactive':  await kb.setReactive({ color1, color2, speed, brightness, profile: p }); break;
      case 'tornado':   await kb.setTornado({ color1, color2, direction, speed, brightness, profile: p }); break;
      case 'matrix':    await kb.setMatrix({ color1, color2, speed, brightness, profile: p }); break;
      case 'yeti':      await kb.setYeti({ color1, color2, speed, brightness, profile: p }); break;
      case 'off':       await kb.setOff(p); break;
    }
    currentEffect = effect;
    saveLightingState({ ...saved, effect });
    updateTrayMenu();
    // Sync the renderer UI if window is open
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tray:effect-changed', effect);
    }
  } catch (e) {
    console.log('[Tray] Effect error:', e.message);
  }
}

function openCustomMode() {
  showWindow();
  currentEffect = 'custom';
  updateTrayMenu();
  // Wait for window to be ready, then tell renderer to switch to custom
  const send = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tray:effect-changed', 'custom');
    }
  };
  if (mainWindow && mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

function updateTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  let icon;
  if (process.platform === 'darwin') {
    icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
    icon.setTemplateImage(true);
  } else {
    icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  }

  tray = new Tray(icon);
  tray.setToolTip('MeRGB');
  tray.setContextMenu(buildTrayMenu());

  // On Windows, left-click opens the window
  if (process.platform !== 'darwin') {
    tray.on('click', showWindow);
    tray.on('double-click', showWindow);
  }
}

let showCloseBanner = false; // set when window was hidden to tray for the first time

function showWindow() {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
  if (process.platform === 'darwin') app.dock?.show();
  // Show the close-to-tray notice after the window reopens
  if (showCloseBanner && mainWindow && !mainWindow.isDestroyed()) {
    showCloseBanner = false;
    mainWindow.webContents.send('app:close-to-tray');
  }
}

function createWindow() {
  const win = mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 800,
    minHeight: 580,
    backgroundColor: '#0a0a0f',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    vibrancy: process.platform === 'darwin' ? 'dark' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.loadFile('index.html');

  // Minimize to tray instead of quitting — always hide immediately
  win.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    if (!isCloseBannerDismissed()) showCloseBanner = true;
    win.hide();
    if (process.platform === 'darwin') app.dock?.hide();
  });

  win.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createTray();
  createWindow();
  startUsbWatcher();
});

app.on('window-all-closed', () => {
  // Don't quit — app lives in tray
});

app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => kb.disconnect());

// ─── Persistent lighting state ────────────────────────────────────────────────
const stateFile = path.join(app.getPath('userData'), 'lighting-state.json');

function saveLightingState(state) {
  try { fs.writeFileSync(stateFile, JSON.stringify(state, null, 2)); }
  catch (e) { console.log('[State] save error:', e.message); }
}

function loadLightingState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch (e) { return null; }
}

// ─── First launch detection ──────────────────────────────────────────────────
const firstLaunchFile = path.join(app.getPath('userData'), '.launched');

function isFirstLaunch() {
  if (fs.existsSync(firstLaunchFile)) return false;
  try { fs.writeFileSync(firstLaunchFile, '1'); } catch (_) {}
  return true;
}

// ─── Custom presets persistence ───────────────────────────────────────────────
const presetsFile = path.join(app.getPath('userData'), 'custom-presets.json');

function loadPresets() {
  try { return JSON.parse(fs.readFileSync(presetsFile, 'utf8')); }
  catch (e) { return []; }
}

function savePresets(presets) {
  try { fs.writeFileSync(presetsFile, JSON.stringify(presets)); }
  catch (e) { console.log('[Presets] save error:', e.message); }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('kb:list-devices', () => {
  return MountainKeyboard.listDevices().map(d => ({
    product:      d.product || 'Mountain Keyboard',
    manufacturer: d.manufacturer || 'Mountain',
    path:         d.path,
    vendorId:     d.vendorId,
    productId:    d.productId,
    interface:    d.interface,
    usagePage:    d.usagePage,
  }));
});

ipcMain.handle('app:is-first-launch', () => isFirstLaunch());
ipcMain.handle('app:set-current-effect', (_, effect) => {
  currentEffect = effect;
  updateTrayMenu();
  return { ok: true };
});
ipcMain.handle('app:dismiss-close-banner', () => { dismissCloseBanner(); return { ok: true }; });
ipcMain.handle('app:hide-to-tray', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
    if (process.platform === 'darwin') app.dock?.hide();
  }
  return { ok: true };
});

ipcMain.handle('kb:connect', async () => {
  if (kb.connected) return { ok: true, message: 'Already connected.' };
  try {
    const info = await kb.connect();
    return { ok: true, product: info.product || 'MeRGB', path: info.path, currentMode: info.currentMode || null, savedState: loadLightingState() };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

ipcMain.handle('kb:disconnect', () => {
  kb.disconnect();
  return { ok: true };
});

ipcMain.handle('kb:static', async (_, { r, g, b, profile }) => {
  try { await kb.setStaticColor(r, g, b, profile ?? 0); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('kb:off', async (_, { profile }) => {
  try { await kb.setOff(profile ?? 0); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('kb:breathing', async (_, args) => {
  try { await kb.setBreathing(args); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('kb:wave', async (_, args) => {
  try { await kb.setWave(args); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('kb:reactive', async (_, args) => {
  try { await kb.setReactive(args); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('kb:tornado', async (_, args) => {
  try { await kb.setTornado(args); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('kb:yeti', async (_, args) => {
  try { await kb.setYeti(args); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('kb:matrix', async (_, args) => {
  try { await kb.setMatrix(args); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('kb:custom', async (_, { colors, numpadColors, profile, sideColors, numpadSideColors }) => {
  try {
    const result = await kb.setCustomColors(colors, profile ?? 0, numpadColors ?? null, sideColors ?? null, numpadSideColors ?? null);
    return { ok: true, saved: result?.saved ?? false };
  }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('kb:read-mode', async () => {
  try { return await kb.readCurrentMode(); }
  catch (e) { return null; }
});

ipcMain.handle('kb:save-state', (_, state) => {
  saveLightingState(state);
  return { ok: true };
});

ipcMain.handle('kb:presets-load', () => loadPresets());

ipcMain.handle('kb:presets-save', (_, presets) => {
  savePresets(presets);
  return { ok: true };
});

let vizBusy = false;
ipcMain.handle('kb:viz-frame', async (_, { colors, sideColors, numpadSideColors }) => {
  if (vizBusy) return { ok: true, dropped: true }; // backpressure: skip frame
  vizBusy = true;
  try { await kb.sendVisualizerFrame(colors, sideColors ?? null, numpadSideColors ?? null); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
  finally { vizBusy = false; }
});

ipcMain.handle('desktop:get-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  return sources.map(s => ({ id: s.id, name: s.name }));
});

ipcMain.handle('kb:pause-keepalive', () => {
  kb._stopKeepalive();
  return { ok: true };
});

ipcMain.handle('kb:resume-keepalive', () => {
  kb._startKeepalive();
  return { ok: true };
});

ipcMain.handle('kb:light-only', async (_, { indices, r, g, b }) => {
  try { await kb.lightOnly(indices, r ?? 255, g ?? 0, b ?? 0); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('kb:profile-switch', (_, { index }) => {
  try { kb.switchProfile(index); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

// ─── USB hotplug: auto-connect / disconnect ──────────────────────────────────
const MOUNTAIN_VID = 0x3282;

function startUsbWatcher() {
  usb.on('attach', (dev) => {
    const desc = dev.deviceDescriptor;
    if (desc && desc.idVendor === MOUNTAIN_VID && !kb.connected) {
      console.log('[USB] Mountain keyboard attached — auto-connecting');
      setTimeout(async () => {
        try {
          const info = await kb.connect();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('kb:auto-connected', {
              product: info.product || 'MeRGB',
              currentMode: info.currentMode || null,
              savedState: loadLightingState(),
            });
          }
        } catch (e) {
          console.log('[USB] Auto-connect failed:', e.message);
        }
      }, 1500); // give OS time to enumerate the device
    }
  });

  usb.on('detach', (dev) => {
    const desc = dev.deviceDescriptor;
    if (desc && desc.idVendor === MOUNTAIN_VID && kb.connected) {
      console.log('[USB] Mountain keyboard detached');
      kb.disconnect();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kb:auto-disconnected');
      }
    }
  });
}

// ─── Minecraft IPC ────────────────────────────────────────────────────────────

mc.on('event', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mc:event', data);
  }
});

mc.on('status', (data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mc:status', data);
  }
});

ipcMain.handle('mc:start', () => {
  try { mc.start(); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('mc:stop', () => {
  try { mc.stop(); return { ok: true }; }
  catch (e) { return { ok: false, message: e.message }; }
});

ipcMain.handle('mc:set-log-path', (_, { path: p }) => {
  mc.setLogPath(p);
  return { ok: true };
});
