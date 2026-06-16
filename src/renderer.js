/* ── renderer.js — UI logic for MeRGB ──────────────────────────────────── */

// ── Strip LED counts ─────────────────────────────────────────────────────────
// Keyboard ring = 44 (confirmed, addresses 126-169).
// Numpad ring count is undocumented — update this ONE value once
// tools/find-strip.js reveals it; the UI dots, state array, and edge split all
// reflow automatically. Keep keyboard.js NUMPAD_SIDE_LEDIDX in sync with it.
const MAIN_SIDE_COUNT   = 44;
const NUMPAD_SIDE_COUNT = 22;   // verified: numpad ring = addresses 170-191 (find-strip.js)

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  connected:    false,
  activeProfile: 0,
  activeEffect: 'static',
  colorMode:    'rainbow',
  direction:    'right',
  speed:        128,
  brightness:   255,
  color1:       { r: 255, g: 77, b: 109 },
  color2:       { r: 0,   g: 128, b: 255 },
  // per-key colours (64 main keys + 17 numpad keys)
  keyColors:        Array.from({ length: 64 }, () => ({ r: 255, g: 255, b: 255 })),
  numpadColors:     Array.from({ length: 17 }, () => ({ r: 255, g: 255, b: 255 })),
  // side strip LEDs (keyboard ring + numpad ring) — sized from the counts above
  sideColors:       Array.from({ length: MAIN_SIDE_COUNT },   () => ({ r: 255, g: 255, b: 255 })),
  numpadSideColors: Array.from({ length: NUMPAD_SIDE_COUNT }, () => ({ r: 255, g: 255, b: 255 })),
  numpadVisible: false,
  brushColor:   { r: 255, g: 255, b: 255 },
  painting:     false,
  ambColor:     { r: 255, g: 255, b: 255 },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : null;
}
function rgbToHex({ r, g, b }) {
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function setStatus(elId, msg, type = '') {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.className = 'status-msg' + (type ? ' ' + type : '');
  if (type === 'ok') setTimeout(() => { el.textContent = ''; el.className = 'status-msg'; }, 3000);
}

// Sync color swatch + hex input pair
function syncColorInput(swatchId, hexId, rgb) {
  document.getElementById(swatchId).value = rgbToHex(rgb);
  document.getElementById(hexId).value    = rgbToHex(rgb);
}

function paintKeyEl(el, rgb) {
  const hex = rgbToHex(rgb);
  el.style.setProperty('--key-color', hex);
  const lit = rgb.r || rgb.g || rgb.b;
  // Backlit keycap: colour glows up from beneath over the keycap base.
  el.style.background = lit
    ? `radial-gradient(125% 95% at 50% 135%, rgba(${rgb.r},${rgb.g},${rgb.b},0.92), rgba(${rgb.r},${rgb.g},${rgb.b},0.2) 54%, transparent 76%),`
      + ` linear-gradient(180deg, #35353d 0%, #232328 100%)`
    : '';
  el.style.color = lit ? '#fff' : '';
}

function paintStripEl(el, rgb) {
  const hex = rgbToHex(rgb);
  el.style.setProperty('--key-color', hex);
}

// ── Strip dot initialisation ───────────────────────────────────────────────
// Both strips are continuous perimeter rings (verified via web research).
// Main keyboard ring = 44 LEDs (confirmed, addresses 126-169). Numpad ring
// count is undocumented — set NUMPAD_SIDE_COUNT once tools/find-strip.js reveals
// it and the dots + state array below reflow automatically.
// Per-edge LED counts.
// Main keyboard: distributed proportionally (wide board → more top/bottom).
// Numpad: verified empirically via tools/find-strip.js pin 170 191:
//   170-174 top (L→R), 175-181 right (T→B), 182-185 bottom (R→L), 186-191 left (B→T)
function distributeRing(total, { wide }) {
  if (!wide) return { top: 5, right: 7, bottom: 4, left: 6 }; // numpad — verified
  const f = [0.36, 0.14, 0.36, 0.14];
  let top   = Math.round(total * f[0]);
  let right = Math.round(total * f[1]);
  let bottom= Math.round(total * f[2]);
  let left  = total - top - right - bottom;
  if (left < 0) { bottom += left; left = 0; }
  return { top, right, bottom, left };
}

function initStripCells() {
  function makeDot(containerId, dataKey, idx) {
    const dot = document.createElement('div');
    dot.className = 'strip-dot';
    dot.dataset[dataKey] = idx;
    dot.title = `LED ${idx + 1}`;
    document.getElementById(containerId).appendChild(dot);
  }
  // Fill four rails in clockwise order from a flat LED index.
  // Clockwise path: top L→R, right T→B, bottom R→L, left B→T.
  // The UI renders bottom L→R and left T→B, so we reverse both
  // so that the visual position matches the physical LED position.
  function fillRing(prefix, dataKey, dist) {
    let idx = 0;
    const rails = [['top', dist.top], ['right', dist.right], ['bottom', dist.bottom], ['left', dist.left]];
    for (const [edge, n] of rails) {
      if (edge === 'bottom' || edge === 'left') {
        const indices = [];
        for (let i = 0; i < n; i++) indices.push(idx++);
        for (let i = indices.length - 1; i >= 0; i--) makeDot(`${prefix}-${edge}`, dataKey, indices[i]);
      } else {
        for (let i = 0; i < n; i++) makeDot(`${prefix}-${edge}`, dataKey, idx++);
      }
    }
  }

  fillRing('main-strip', 'strip',   distributeRing(MAIN_SIDE_COUNT,   { wide: true  }));
  fillRing('np-strip',   'npStrip', distributeRing(NUMPAD_SIDE_COUNT, { wide: false }));
}

initStripCells();

// ── Ambience strip dot initialisation ──────────────────────────────────────
function initAmbienceStrips() {
  function makeDot(containerId, dataKey, idx) {
    const dot = document.createElement('div');
    dot.className = 'strip-dot';
    dot.dataset[dataKey] = idx;
    dot.title = `LED ${idx + 1}`;
    document.getElementById(containerId).appendChild(dot);
  }
  function fillRing(prefix, dataKey, dist) {
    let idx = 0;
    const rails = [['top', dist.top], ['right', dist.right], ['bottom', dist.bottom], ['left', dist.left]];
    for (const [edge, n] of rails) {
      if (edge === 'bottom' || edge === 'left') {
        const indices = [];
        for (let i = 0; i < n; i++) indices.push(idx++);
        for (let i = indices.length - 1; i >= 0; i--) makeDot(`${prefix}-${edge}`, dataKey, indices[i]);
      } else {
        for (let i = 0; i < n; i++) makeDot(`${prefix}-${edge}`, dataKey, idx++);
      }
    }
  }
  fillRing('amb-strip', 'ambStrip',   distributeRing(MAIN_SIDE_COUNT,   { wide: true  }));
  fillRing('amb-np-strip', 'ambNpStrip', distributeRing(NUMPAD_SIDE_COUNT, { wide: false }));
}
initAmbienceStrips();

// Paint the ambience keyboard visual from the current custom state arrays
function paintAmbienceVisual() {
  document.querySelectorAll('#amb-kb-layout .key').forEach(el => {
    const idx = parseInt(el.dataset.key);
    if (state.keyColors[idx]) paintKeyEl(el, state.keyColors[idx]);
  });
  document.querySelectorAll('#amb-np-layout .key').forEach(el => {
    const idx = parseInt(el.dataset.np);
    if (state.numpadColors[idx]) paintKeyEl(el, state.numpadColors[idx]);
  });
  document.querySelectorAll('[data-amb-strip]').forEach(el => {
    paintStripEl(el, state.sideColors[parseInt(el.dataset.ambStrip)]);
  });
  document.querySelectorAll('[data-amb-np-strip]').forEach(el => {
    paintStripEl(el, state.numpadSideColors[parseInt(el.dataset.ambNpStrip)]);
  });
}

// ── Connection ─────────────────────────────────────────────────────────────
const connBadge = document.getElementById('conn-badge');
const btnConnect = document.getElementById('btn-connect');

async function connect() {
  connBadge.textContent = 'Connecting…';
  connBadge.className = 'badge badge-connecting';
  btnConnect.textContent = 'Connecting…';
  btnConnect.disabled = true;

  const res = await window.kb.connect();

  if (res.ok) {
    state.connected = true;
    connBadge.textContent = 'Connected';
    connBadge.className = 'badge badge-connected';
    btnConnect.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Connected`;
    btnConnect.classList.add('connected-state');
    btnConnect.disabled = false;
    btnConnect.onclick = disconnect;
    refreshDeviceTab();
    // Restore lighting state: if we have a saved custom mode with per-key data,
    // prefer it — the HID read can't return per-key colours so it would flash
    // the firmware's old colours first before our custom data overwrites them.
    const saved = res.savedState;
    const mode = (saved && saved.effect === 'custom' && saved.keyColors)
      ? saved
      : (res.currentMode || saved);
    if (mode) applyModeToUI(mode);
  } else {
    connBadge.textContent = 'Disconnected';
    connBadge.className = 'badge badge-disconnected';
    btnConnect.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Connect`;
    btnConnect.classList.remove('connected-state');
    btnConnect.disabled = false;
    setStatus('lighting-status', 'Connection failed: ' + res.message, 'err');
  }
}

async function disconnect() {
  await window.kb.disconnect();
  state.connected = false;
  connBadge.textContent = 'Disconnected';
  connBadge.className = 'badge badge-disconnected';
  btnConnect.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Connect`;
  btnConnect.classList.remove('connected-state');
  btnConnect.onclick = connect;
}

btnConnect.addEventListener('click', connect);

// Auto-connect on app launch
connect();

// USB hotplug: auto-connect when keyboard is plugged in
window.kb.onAutoConnected((data) => {
  if (state.connected) return;
  state.connected = true;
  connBadge.textContent = 'Connected';
  connBadge.className = 'badge badge-connected';
  btnConnect.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Connected`;
  btnConnect.classList.add('connected-state');
  btnConnect.disabled = false;
  btnConnect.onclick = disconnect;
  refreshDeviceTab();
  const saved = data.savedState;
  const mode = (saved && saved.effect === 'custom' && saved.keyColors)
    ? saved
    : (data.currentMode || saved);
  if (mode) applyModeToUI(mode);
});

// USB hotplug: update UI when keyboard is unplugged
window.kb.onAutoDisconnected(() => {
  state.connected = false;
  connBadge.textContent = 'Disconnected';
  connBadge.className = 'badge badge-disconnected';
  btnConnect.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Connect`;
  btnConnect.classList.remove('connected-state');
  btnConnect.onclick = connect;
});

// ── Tray effect sync ──────────────────────────────────────────────────────
window.kb.onTrayEffectChanged((effect) => {
  // Switch to Lighting tab
  document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const lightingBtn = document.querySelector('.nav-btn[data-tab="lighting"]');
  if (lightingBtn) lightingBtn.classList.add('active');
  document.getElementById('tab-lighting')?.classList.add('active');

  state.activeEffect = effect;
  document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
  const card = document.querySelector(`.effect-card[data-effect="${effect}"]`);
  if (card) card.classList.add('active');
  showEffectControls(effect);
  if (effect !== 'custom' && _stripAnimId) stopStripAnim();
  if (effect === 'custom') {
    prefillCustomFromLastEffect();
    scheduleCustomApply(100);
  }
  updateCurrentLighting(effect, state.color1);
});

// ── Tab navigation ─────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'device') refreshDeviceTab();
    if (btn.dataset.tab === 'ambience') paintAmbienceVisual();
  });
});

// ── Effect selection ───────────────────────────────────────────────────────
const effectControls = {
  static:    { color1: true,  color2: false, colormode: false, direction: false, speed: false, brightness: true  },
  wave:      { color1: false, color2: false, colormode: true,  direction: true,  speed: true,  brightness: true  },
  breathing: { color1: true,  color2: false, colormode: false, direction: false, speed: true,  brightness: true  },
  reactive:  { color1: true,  color2: true,  colormode: false, direction: false, speed: true,  brightness: true  },
  tornado:   { color1: true,  color2: true,  colormode: true,  direction: true,  speed: true,  brightness: true  },
  matrix:    { color1: true,  color2: true,  colormode: false, direction: false, speed: true,  brightness: true  },
  yeti:      { color1: true,  color2: true,  colormode: false, direction: false, speed: true,  brightness: true  },
  custom:    { color1: false, color2: false, colormode: false, direction: false, speed: false, brightness: false },
  off:       { color1: false, color2: false, colormode: false, direction: false, speed: false, brightness: false },
};

function showEffectControls(effect) {
  const cfg = effectControls[effect] || {};
  const isCustom = effect === 'custom';
  document.getElementById('group-color1').classList.toggle('hidden',    !cfg.color1);
  document.getElementById('group-color2').classList.toggle('hidden',    !cfg.color2);
  document.getElementById('group-colormode').classList.toggle('hidden', !cfg.colormode);
  document.getElementById('group-direction').classList.toggle('hidden', !cfg.direction);
  document.getElementById('group-speed').classList.toggle('hidden',     !cfg.speed);
  document.getElementById('group-brightness').classList.toggle('hidden',!cfg.brightness);
  // Wave & Tornado: color visibility depends on selected colour mode
  if (effect === 'wave' || effect === 'tornado') {
    document.getElementById('group-color1').classList.toggle('hidden', state.colorMode === 'rainbow');
    document.getElementById('group-color2').classList.toggle('hidden', state.colorMode !== 'dual');
  }
  // Toggle per-key section vs normal controls
  document.querySelector('.controls-grid').style.display = isCustom ? 'none' : '';
  document.getElementById('effect-action-row').style.display = isCustom ? 'none' : '';
  document.getElementById('perkey-section').style.display = isCustom ? '' : 'none';
}

document.querySelectorAll('.effect-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    state.activeEffect = card.dataset.effect;
    showEffectControls(state.activeEffect);
    if (state.activeEffect !== 'custom' && _stripAnimId) stopStripAnim();
    if (state.activeEffect === 'custom') {
      prefillCustomFromLastEffect();
      scheduleCustomApply(100);
    } else {
      scheduleApply(100);
    }
  });
});

showEffectControls('static'); // default

// ── Colour inputs ──────────────────────────────────────────────────────────
function wireColorPair(swatchId, hexId, stateKey) {
  const swatch = document.getElementById(swatchId);
  const hexIn  = document.getElementById(hexId);

  swatch.addEventListener('input', () => {
    const rgb = hexToRgb(swatch.value);
    if (rgb) { state[stateKey] = rgb; hexIn.value = swatch.value; scheduleApply(300); }
  });

  hexIn.addEventListener('input', () => {
    const v = hexIn.value.startsWith('#') ? hexIn.value : '#' + hexIn.value;
    const rgb = hexToRgb(v);
    if (rgb) { state[stateKey] = rgb; swatch.value = rgbToHex(rgb); scheduleApply(300); }
  });
}

wireColorPair('color1', 'color1-hex', 'color1');
wireColorPair('color2', 'color2-hex', 'color2');

// ── Segment groups ─────────────────────────────────────────────────────────
function wireSegGroup(groupId, stateKey) {
  document.querySelectorAll(`#${groupId} .seg-btn`).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`#${groupId} .seg-btn`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state[stateKey] = btn.dataset.val;
      scheduleApply(200);
    });
  });
}

wireSegGroup('colormode-seg', 'colorMode');

// When colour mode changes on wave/tornado, update which colour inputs are visible
document.querySelectorAll('#colormode-seg .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (state.activeEffect === 'wave' || state.activeEffect === 'tornado') {
      document.getElementById('group-color1').classList.toggle('hidden', state.colorMode === 'rainbow');
      document.getElementById('group-color2').classList.toggle('hidden', state.colorMode !== 'dual');
    }
  });
});

// Direction uses two groups; wire both to state.direction
['dir-seg', 'dir-seg-rot'].forEach(gid => {
  document.querySelectorAll(`#${gid} .seg-btn`).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dir-seg .seg-btn, #dir-seg-rot .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.direction = btn.dataset.val;
      scheduleApply(200);
    });
  });
});

// ── Sliders ────────────────────────────────────────────────────────────────
const sliderSpeed = document.getElementById('slider-speed');
const sliderBrightness = document.getElementById('slider-brightness');

sliderSpeed.addEventListener('input', () => {
  state.speed = parseInt(sliderSpeed.value);
  document.getElementById('lbl-speed').textContent = state.speed;
  scheduleApply(400);
});
sliderBrightness.addEventListener('input', () => {
  state.brightness = parseInt(sliderBrightness.value);
  document.getElementById('lbl-brightness').textContent = state.brightness;
  scheduleApply(400);
});

// ── Current lighting indicator ────────────────────────────────────────────
function updateCurrentLighting(effectName, color) {
  const nameEl = document.getElementById('current-effect-name');
  const swatchEl = document.getElementById('current-swatch');
  const label = effectName.charAt(0).toUpperCase() + effectName.slice(1);
  nameEl.textContent = label;
  if (color && (color.r || color.g || color.b)) {
    const hex = rgbToHex(color);
    swatchEl.style.background = hex;
    swatchEl.style.setProperty('--current-glow', hex);
    swatchEl.style.display = '';
  } else if (effectName === 'off') {
    swatchEl.style.background = '#333';
    swatchEl.style.setProperty('--current-glow', 'transparent');
    swatchEl.style.display = '';
  } else {
    swatchEl.style.display = 'none';
  }
}

// ── Auto-apply (debounced) ────────────────────────────────────────────────
let _applyTimer = null;
function scheduleApply(delay = 400) {
  clearTimeout(_applyTimer);
  _applyTimer = setTimeout(() => {
    if (state.connected && state.activeEffect !== 'custom') applyEffect();
  }, delay);
}

let _customApplyTimer = null;
function scheduleCustomApply(delay = 500) {
  clearTimeout(_customApplyTimer);
  _customApplyTimer = setTimeout(() => applyCustomColors(), delay);
}

async function applyCustomColors() {
  if (!state.connected) return;
  setStatus('perkey-status', '');
  const res = await window.kb.setCustom({
    colors: state.keyColors,
    numpadColors: state.numpadVisible ? state.numpadColors : null,
    sideColors: state.sideColors,
    numpadSideColors: state.numpadVisible ? state.numpadSideColors : null,
    profile: state.activeProfile,
  });
  if (res.ok) {
    const msg = res.saved
      ? 'Applied & saved to keyboard.'
      : 'Applied (warning: onboard save failed — design may not persist after unplug).';
    setStatus('perkey-status', msg, res.saved ? 'ok' : 'err');
    updateCurrentLighting('custom', state.brushColor);
    saveLightingState();
    window.appInfo.setCurrentEffect('custom');
  } else {
    setStatus('perkey-status', 'Error: ' + (res.message || 'Unknown error'), 'err');
  }
}

// Paint the per-key keyboard visual from the current state arrays
function paintCustomVisual() {
  document.querySelectorAll('#kb-layout .key').forEach(el => {
    if (el.classList.contains('key-empty')) return;
    const idx = parseInt(el.dataset.key);
    if (state.keyColors[idx]) paintKeyEl(el, state.keyColors[idx]);
  });
  document.querySelectorAll('#np-layout .key').forEach(el => {
    const idx = parseInt(el.dataset.np);
    if (state.numpadColors[idx]) paintKeyEl(el, state.numpadColors[idx]);
  });
  document.querySelectorAll('[data-strip]').forEach(el => {
    paintStripEl(el, state.sideColors[parseInt(el.dataset.strip)]);
  });
  document.querySelectorAll('[data-np-strip]').forEach(el => {
    paintStripEl(el, state.numpadSideColors[parseInt(el.dataset.npStrip)]);
  });
}

// Pre-fill per-key visual with the current effect colour when switching to Custom
function prefillCustomFromLastEffect() {
  const allDefault = state.keyColors.every(c => c.r === 255 && c.g === 255 && c.b === 255);
  if (!allDefault) { paintCustomVisual(); return; } // user has custom colours, just repaint
  // Also update brush colour to match
  state.brushColor = { r: 255, g: 255, b: 255 };
  document.getElementById('brush-color').value = '#ffffff';
  document.getElementById('brush-hex').value = '#ffffff';
  paintCustomVisual();
}

// Apply a mode object (from readCurrentMode) to the full UI
function applyModeToUI(mode) {
  if (!mode || !mode.effect) return;
  state.activeEffect = mode.effect;
  if (mode.color1 && (mode.color1.r || mode.color1.g || mode.color1.b)) state.color1 = mode.color1;
  if (mode.color2) state.color2 = mode.color2;
  if (mode.speed !== undefined) state.speed = mode.speed;
  if (mode.brightness !== undefined) state.brightness = mode.brightness;
  if (mode.colorMode) state.colorMode = mode.colorMode;
  if (mode.direction) state.direction = mode.direction;

  // Effect card
  document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
  const card = document.querySelector(`.effect-card[data-effect="${state.activeEffect}"]`);
  if (card) card.classList.add('active');
  showEffectControls(state.activeEffect);

  // Colour inputs
  syncColorInput('color1', 'color1-hex', state.color1);
  syncColorInput('color2', 'color2-hex', state.color2);

  // Sliders
  document.getElementById('slider-speed').value = state.speed;
  document.getElementById('lbl-speed').textContent = state.speed;
  document.getElementById('slider-brightness').value = state.brightness;
  document.getElementById('lbl-brightness').textContent = state.brightness;

  // Segments
  document.querySelectorAll('#colormode-seg .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.val === state.colorMode));
  document.querySelectorAll('#dir-seg .seg-btn, #dir-seg-rot .seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.val === state.direction));

  // Current indicator
  updateCurrentLighting(state.activeEffect, state.color1);

  // Restore ambience settings
  if (mode.ambColor) {
    state.ambColor = { ...mode.ambColor };
    document.getElementById('amb-color').value = rgbToHex(state.ambColor);
    document.getElementById('amb-color-hex').value = rgbToHex(state.ambColor);
  }

  // Restore custom per-key data if saved
  if (state.activeEffect === 'custom') {
    if (mode.keyColors) mode.keyColors.forEach((c, i) => { state.keyColors[i] = { ...c }; });
    if (mode.numpadColors) mode.numpadColors.forEach((c, i) => { state.numpadColors[i] = { ...c }; });
    if (mode.sideColors) mode.sideColors.forEach((c, i) => { state.sideColors[i] = { ...c }; });
    if (mode.numpadSideColors) mode.numpadSideColors.forEach((c, i) => { state.numpadSideColors[i] = { ...c }; });
    if (mode.brushColor) {
      state.brushColor = { ...mode.brushColor };
      document.getElementById('brush-color').value = rgbToHex(state.brushColor);
      document.getElementById('brush-hex').value = rgbToHex(state.brushColor);
    }
    paintCustomVisual();
    if (mode.animated) {
      // Switch to ambience tab and start animation
      document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      const ambBtn = document.querySelector('.nav-btn[data-tab="ambience"]');
      if (ambBtn) ambBtn.classList.add('active');
      document.getElementById('tab-ambience')?.classList.add('active');
      applyCustomColors().then(() => {
        paintAmbienceVisual();
        startStripAnim();
      });
    } else {
      scheduleCustomApply(100);
    }
  } else {
    prefillCustomFromLastEffect();
  }
}

// Persist current lighting state to disk (survives app restarts)
function saveLightingState() {
  const s = {
    effect: state.activeEffect,
    color1: state.color1,
    color2: state.color2,
    speed: state.speed,
    brightness: state.brightness,
    colorMode: state.colorMode,
    direction: state.direction,
    ambColor: { ...state.ambColor },
  };
  if (state.activeEffect === 'custom') {
    s.keyColors = state.keyColors.map(c => ({ ...c }));
    s.numpadColors = state.numpadColors.map(c => ({ ...c }));
    s.sideColors = state.sideColors.map(c => ({ ...c }));
    s.numpadSideColors = state.numpadSideColors.map(c => ({ ...c }));
    s.brushColor = { ...state.brushColor };
    s.animated = !!_stripAnimId;
  }
  window.kb.saveState(s);
}

// ── Apply effect ───────────────────────────────────────────────────────────
document.getElementById('btn-apply').addEventListener('click', applyEffect);

async function applyEffect() {
  if (!state.connected) {
    setStatus('lighting-status', 'Not connected — click Connect first.', 'err');
    return;
  }

  const btn = document.getElementById('btn-apply');
  btn.disabled = true;
  btn.textContent = 'Applying…';
  setStatus('lighting-status', '');

  const p = state.activeProfile;
  const { speed, brightness, color1, color2, direction, colorMode } = state;
  let res;

  switch (state.activeEffect) {
    case 'static':
      res = await window.kb.setStatic({ r: color1.r, g: color1.g, b: color1.b, profile: p });
      break;
    case 'breathing':
      res = await window.kb.setBreathing({ color1, speed, brightness, profile: p });
      break;
    case 'wave':
      res = await window.kb.setWave({ colorMode, color1, color2, direction, speed, brightness, profile: p });
      break;
    case 'reactive':
      res = await window.kb.setReactive({ color1, color2, speed, brightness, profile: p });
      break;
    case 'tornado':
      res = await window.kb.setTornado({ colorMode, color1, color2, direction, speed, brightness, profile: p });
      break;
    case 'matrix':
      res = await window.kb.setMatrix({ color1, color2, speed, brightness, profile: p });
      break;
    case 'yeti':
      res = await window.kb.setYeti({ color1, color2, speed, brightness, profile: p });
      break;
    case 'off':
      res = await window.kb.setOff({ profile: p });
      break;
    default:
      res = { ok: false, message: 'Unknown effect.' };
  }

  btn.disabled = false;
  btn.textContent = 'Apply Effect';

  if (res.ok) {
    setStatus('lighting-status', 'Applied successfully.', 'ok');
    const effectColor = state.activeEffect === 'off' ? null : state.color1;
    updateCurrentLighting(state.activeEffect, effectColor);
    saveLightingState();
    window.appInfo.setCurrentEffect(state.activeEffect);
  } else {
    setStatus('lighting-status', 'Error: ' + (res.message || 'Unknown error'), 'err');
  }
}

// ── Profiles (commented out) ──────────────────────────────────────────────
/*
document.querySelectorAll('.profile-card').forEach(card => {
  card.addEventListener('click', async () => {
    const idx = parseInt(card.dataset.profile);
    document.querySelectorAll('.profile-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    state.activeProfile = idx;

    if (state.connected) {
      const res = await window.kb.switchProfile({ index: idx });
      const msg = res.ok ? `Switched to Profile ${idx + 1}.` : 'Error: ' + res.message;
      const type = res.ok ? 'ok' : 'err';
      setStatus('profile-status', msg, type);
    }
  });
});
*/

// ── Per-key painting ───────────────────────────────────────────────────────
const brushSwatch = document.getElementById('brush-color');
const brushHex    = document.getElementById('brush-hex');

brushSwatch.addEventListener('input', () => {
  const rgb = hexToRgb(brushSwatch.value);
  if (rgb) { state.brushColor = rgb; brushHex.value = brushSwatch.value; }
});
brushHex.addEventListener('input', () => {
  const v = brushHex.value.startsWith('#') ? brushHex.value : '#' + brushHex.value;
  const rgb = hexToRgb(v);
  if (rgb) { state.brushColor = rgb; brushSwatch.value = rgbToHex(rgb); }
});

// Paint on mousedown+drag — works on keys and strip dots
document.querySelector('.keyboard-wrap').addEventListener('mousedown', e => {
  const key = e.target.closest('.key');
  const dot = e.target.closest('.strip-dot');
  if (key && !key.classList.contains('key-empty')) {
    state.painting = true;
    paintKey(key);
  } else if (dot) {
    state.painting = true;
    paintStrip(dot);
  }
});
document.addEventListener('mousemove', e => {
  if (!state.painting) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const key = el?.closest('.key');
  const dot = el?.closest('.strip-dot');
  if (key && !key.classList.contains('key-empty')) paintKey(key);
  else if (dot) paintStrip(dot);
});
document.addEventListener('mouseup', () => {
  if (state.painting) {
    state.painting = false;
    if (state.activeEffect === 'custom') scheduleCustomApply(300);
  }
});

function paintKey(el) {
  const rgb = { ...state.brushColor };
  if (el.dataset.key !== undefined) {
    const idx = parseInt(el.dataset.key);
    state.keyColors[idx] = rgb;
  } else if (el.dataset.np !== undefined) {
    const idx = parseInt(el.dataset.np);
    state.numpadColors[idx] = rgb;
  }
  paintKeyEl(el, rgb);
}

function paintStrip(el) {
  const rgb = { ...state.brushColor };
  if (el.dataset.strip !== undefined) {
    const idx = parseInt(el.dataset.strip);
    state.sideColors[idx] = rgb;
  } else if (el.dataset.npStrip !== undefined) {
    const idx = parseInt(el.dataset.npStrip);
    state.numpadSideColors[idx] = rgb;
  }
  paintStripEl(el, rgb);
}

document.getElementById('btn-fill-keys').addEventListener('click', () => {
  const rgb = { ...state.brushColor };
  document.querySelectorAll('#kb-layout .key, #np-layout .key').forEach(el => {
    if (el.classList.contains('key-empty')) return;
    if (el.dataset.key !== undefined) state.keyColors[parseInt(el.dataset.key)] = { ...rgb };
    if (el.dataset.np  !== undefined) state.numpadColors[parseInt(el.dataset.np)] = { ...rgb };
    paintKeyEl(el, rgb);
  });
  scheduleCustomApply(200);
});

document.getElementById('btn-fill-all').addEventListener('click', () => {
  const rgb = { ...state.brushColor };
  document.querySelectorAll('#kb-layout .key, #np-layout .key').forEach(el => {
    if (el.classList.contains('key-empty')) return;
    if (el.dataset.key !== undefined) state.keyColors[parseInt(el.dataset.key)] = { ...rgb };
    if (el.dataset.np  !== undefined) state.numpadColors[parseInt(el.dataset.np)] = { ...rgb };
    paintKeyEl(el, rgb);
  });
  document.querySelectorAll('[data-strip]').forEach(el => {
    state.sideColors[parseInt(el.dataset.strip)] = { ...rgb };
    paintStripEl(el, rgb);
  });
  document.querySelectorAll('[data-np-strip]').forEach(el => {
    state.numpadSideColors[parseInt(el.dataset.npStrip)] = { ...rgb };
    paintStripEl(el, rgb);
  });
  scheduleCustomApply(200);
});

document.getElementById('btn-clear-all').addEventListener('click', () => {
  const off = { r:0, g:0, b:0 };
  document.querySelectorAll('#kb-layout .key, #np-layout .key').forEach(el => {
    if (el.classList.contains('key-empty')) return;
    if (el.dataset.key !== undefined) state.keyColors[parseInt(el.dataset.key)] = { ...off };
    if (el.dataset.np  !== undefined) state.numpadColors[parseInt(el.dataset.np)] = { ...off };
    el.style.setProperty('--key-color', 'transparent');
    el.style.background = '';
    el.style.color = '';
  });
  document.querySelectorAll('[data-strip]').forEach(el => {
    state.sideColors[parseInt(el.dataset.strip)] = { ...off };
    el.style.setProperty('--key-color', 'transparent');
  });
  document.querySelectorAll('[data-np-strip]').forEach(el => {
    state.numpadSideColors[parseInt(el.dataset.npStrip)] = { ...off };
    el.style.setProperty('--key-color', 'transparent');
  });
  scheduleCustomApply(200);
});

// Strip fill / clear — affects both keyboard and numpad strips
document.getElementById('btn-fill-strip').addEventListener('click', () => {
  const rgb = { ...state.brushColor };
  document.querySelectorAll('[data-strip]').forEach(el => {
    state.sideColors[parseInt(el.dataset.strip)] = { ...rgb };
    paintStripEl(el, rgb);
  });
  document.querySelectorAll('[data-np-strip]').forEach(el => {
    state.numpadSideColors[parseInt(el.dataset.npStrip)] = { ...rgb };
    paintStripEl(el, rgb);
  });
  scheduleCustomApply(200);
});
document.getElementById('btn-clear-strip').addEventListener('click', () => {
  document.querySelectorAll('[data-strip]').forEach(el => {
    state.sideColors[parseInt(el.dataset.strip)] = { r:0, g:0, b:0 };
    el.style.setProperty('--key-color', 'transparent');
  });
  document.querySelectorAll('[data-np-strip]').forEach(el => {
    state.numpadSideColors[parseInt(el.dataset.npStrip)] = { r:0, g:0, b:0 };
    el.style.setProperty('--key-color', 'transparent');
  });
  scheduleCustomApply(200);
});

// ── Strip split animation ─────────────────────────────────────────────────
// Light splits from the bottom center and travels up both sides to the top.
// Uses the brush colour. Syncs the numpad ring if visible.
let _stripAnimId = null;

// Build the two paths (right-going and left-going) from bottom center to top
// center for a ring. Returns { right: [...indices], left: [...indices] }.
function buildSplitPaths(total, dist) {
  // Index ranges per edge (clockwise from top-left):
  const topStart    = 0;
  const rightStart  = dist.top;
  const bottomStart = dist.top + dist.right;
  const leftStart   = dist.top + dist.right + dist.bottom;

  // Bottom edge: indices bottomStart..bottomStart+dist.bottom-1
  // Physically R→L, so bottomStart = rightmost, bottomStart+dist.bottom-1 = leftmost
  const bottomMid = Math.floor(dist.bottom / 2);
  // Right path: from bottom center rightward → up right edge → across top to center
  const right = [];
  // Bottom center → bottom right (decreasing index = moving right physically)
  for (let i = bottomMid - 1; i >= 0; i--) right.push(bottomStart + i);
  // Right edge bottom → top (decreasing index = moving up)
  for (let i = dist.right - 1; i >= 0; i--) right.push(rightStart + i);
  // Top right → top center (decreasing index = moving left toward center)
  const topMid = Math.ceil(dist.top / 2);
  for (let i = dist.top - 1; i >= topMid; i--) right.push(topStart + i);

  // Left path: from bottom center leftward → up left edge → across top to center
  const left = [];
  // Bottom center → bottom left (increasing index = moving left physically)
  for (let i = bottomMid; i < dist.bottom; i++) left.push(bottomStart + i);
  // Left edge bottom → top (increasing index = moving up)
  for (let i = 0; i < dist.left; i++) left.push(leftStart + i);
  // Top left → top center (increasing index = moving right toward center)
  for (let i = 0; i < topMid; i++) left.push(topStart + i);

  return { right, left };
}

const mainDist   = distributeRing(MAIN_SIDE_COUNT,   { wide: true  });
const numpadDist = distributeRing(NUMPAD_SIDE_COUNT, { wide: false });
const mainPaths   = buildSplitPaths(MAIN_SIDE_COUNT,   mainDist);
const numpadPaths = buildSplitPaths(NUMPAD_SIDE_COUNT, numpadDist);

function stopStripAnim() {
  if (_stripAnimId) { cancelAnimationFrame(_stripAnimId); _stripAnimId = null; }
  document.getElementById('btn-amb-toggle').textContent = 'Start Animation';
}

function startStripAnim() {
  const mainMaxLen = Math.max(mainPaths.right.length, mainPaths.left.length);
  const npMaxLen   = Math.max(numpadPaths.right.length, numpadPaths.left.length);
  const npScale = npMaxLen / mainMaxLen;

  const mainGlow = Array.from({ length: MAIN_SIDE_COUNT }, () => 0);
  const npGlow   = Array.from({ length: NUMPAD_SIDE_COUNT }, () => 0);
  let lastTs = null;
  let sending = false;

  document.getElementById('btn-amb-toggle').textContent = 'Stop Animation';

  function frame(ts) {
    if (!_stripAnimId) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(ts - lastTs, 50);
    lastTs = ts;

    const rgb = state.ambColor;
    const speed = 0.02 + (10 - 5) * (0.12 / 95);
    const decayPerMs = 0.5 - (100 / 100) * 0.47;
    const decay = Math.pow(decayPerMs, dt / 16.67);

    const tailMain = Math.round(2 + (100 / 100) * 8);
    const tailNp   = Math.max(1, Math.round(tailMain * 0.5));

    const elapsed = ts;
    const mainPos = (elapsed * speed) % (mainMaxLen + tailMain);
    const npPos   = mainPos * npScale;

    for (let i = 0; i < mainGlow.length; i++) mainGlow[i] *= decay;
    for (let i = 0; i < npGlow.length; i++)   npGlow[i] *= decay;

    function stampTrail(paths, glow, pos, tail) {
      for (const path of [paths.right, paths.left]) {
        for (let t = 0; t < tail; t++) {
          const p = Math.floor(pos) - t;
          if (p < 0 || p >= path.length) continue;
          const brightness = 1 - (t / tail);
          glow[path[p]] = Math.max(glow[path[p]], brightness);
        }
      }
    }

    stampTrail(mainPaths, mainGlow, mainPos, tailMain);
    if (state.numpadVisible) stampTrail(numpadPaths, npGlow, npPos, tailNp);

    const mainColors = mainGlow.map(g => ({
      r: Math.round(rgb.r * g), g: Math.round(rgb.g * g), b: Math.round(rgb.b * g),
    }));
    const npColors = npGlow.map(g => ({
      r: Math.round(rgb.r * g), g: Math.round(rgb.g * g), b: Math.round(rgb.b * g),
    }));

    // Update ambience tab strip visuals
    document.querySelectorAll('[data-amb-strip]').forEach(el => {
      paintStripEl(el, mainColors[parseInt(el.dataset.ambStrip)]);
    });
    if (state.numpadVisible) {
      document.querySelectorAll('[data-amb-np-strip]').forEach(el => {
        paintStripEl(el, npColors[parseInt(el.dataset.ambNpStrip)]);
      });
    }

    if (state.connected && !sending) {
      sending = true;
      window.kb.sendVizFrame({
        colors: state.keyColors,
        sideColors: mainColors,
        numpadSideColors: state.numpadVisible ? npColors : null,
      }).finally(() => { sending = false; });
    }

    _stripAnimId = requestAnimationFrame(frame);
  }

  _stripAnimId = requestAnimationFrame(frame);
}

// ── Ambience tab controls ─────────────────────────────────────────────────
const ambSwatch = document.getElementById('amb-color');
const ambHexIn  = document.getElementById('amb-color-hex');

ambSwatch.addEventListener('input', () => {
  const rgb = hexToRgb(ambSwatch.value);
  if (rgb) { state.ambColor = rgb; ambHexIn.value = ambSwatch.value; }
});
ambHexIn.addEventListener('input', () => {
  const v = ambHexIn.value.startsWith('#') ? ambHexIn.value : '#' + ambHexIn.value;
  const rgb = hexToRgb(v);
  if (rgb) { state.ambColor = rgb; ambSwatch.value = rgbToHex(rgb); }
});


document.getElementById('btn-amb-toggle').addEventListener('click', async () => {
  if (_stripAnimId) {
    stopStripAnim();
    saveLightingState();
    return;
  }
  if (!state.connected) {
    setStatus('amb-status', 'Not connected — click Connect first.', 'err');
    return;
  }
  await applyCustomColors();
  paintAmbienceVisual();
  startStripAnim();
  saveLightingState();
});

document.getElementById('amb-toggle-numpad').addEventListener('change', e => {
  state.numpadVisible = e.target.checked;
  document.getElementById('numpad-module').style.display = e.target.checked ? 'flex' : 'none';
  document.getElementById('amb-numpad-module').style.display = e.target.checked ? 'flex' : 'none';
  document.getElementById('toggle-numpad').checked = e.target.checked;
});

// Numpad toggle
document.getElementById('toggle-numpad').addEventListener('change', e => {
  state.numpadVisible = e.target.checked;
  document.getElementById('numpad-module').style.display = e.target.checked ? 'flex' : 'none';
  document.getElementById('amb-numpad-module').style.display = e.target.checked ? 'flex' : 'none';
  document.getElementById('amb-toggle-numpad').checked = e.target.checked;
});

document.getElementById('btn-apply-custom').addEventListener('click', () => applyCustomColors());

// ── Custom presets ────────────────────────────────────────────────────────
let presets = [];

async function loadPresets() {
  presets = (await window.kb.loadPresets()) || [];
  renderPresets();
}

function renderPresets() {
  const list = document.getElementById('preset-list');
  if (!presets.length) { list.innerHTML = ''; return; }
  list.innerHTML = presets.map((p, i) => {
    // Pick up to 5 unique colours for swatch preview
    const seen = new Set();
    const swatches = [];
    for (const c of p.keyColors) {
      const hex = rgbToHex(c);
      if (!seen.has(hex)) { seen.add(hex); swatches.push(hex); }
      if (swatches.length >= 5) break;
    }
    const swatchHtml = swatches.map(h => `<span class="preset-sw" style="background:${h}"></span>`).join('');
    return `<div class="preset-chip" data-preset="${i}" title="Click to load">
      <div class="preset-swatches">${swatchHtml}</div>
      <span>${p.name}</span>
      <button class="preset-del" data-del="${i}" title="Delete">&times;</button>
    </div>`;
  }).join('');

  // Load preset on click
  list.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (e.target.closest('.preset-del')) return;
      const idx = parseInt(chip.dataset.preset);
      applyPreset(presets[idx]);
    });
  });

  // Delete preset
  list.querySelectorAll('.preset-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.del);
      presets.splice(idx, 1);
      await window.kb.savePresets(presets);
      renderPresets();
    });
  });
}

async function applyPreset(preset) {
  // Restore key colours
  preset.keyColors.forEach((c, i) => { state.keyColors[i] = { ...c }; });
  preset.numpadColors.forEach((c, i) => { state.numpadColors[i] = { ...c }; });
  preset.sideColors.forEach((c, i) => { state.sideColors[i] = { ...c }; });
  preset.numpadSideColors.forEach((c, i) => { state.numpadSideColors[i] = { ...c }; });
  // Restore brush colour if saved
  if (preset.brushColor) {
    state.brushColor = { ...preset.brushColor };
    document.getElementById('brush-color').value = rgbToHex(state.brushColor);
    document.getElementById('brush-hex').value = rgbToHex(state.brushColor);
  }
  paintCustomVisual();
  if (_stripAnimId) stopStripAnim();
  scheduleCustomApply(100);
  setStatus('perkey-status', `Loaded "${preset.name}"`, 'ok');
}

document.getElementById('btn-save-preset').addEventListener('click', async () => {
  const nameEl = document.getElementById('preset-name');
  const name = nameEl.value.trim() || ('Preset ' + (presets.length + 1));
  presets.push({
    name,
    keyColors: state.keyColors.map(c => ({ ...c })),
    numpadColors: state.numpadColors.map(c => ({ ...c })),
    sideColors: state.sideColors.map(c => ({ ...c })),
    numpadSideColors: state.numpadSideColors.map(c => ({ ...c })),
    brushColor: { ...state.brushColor },
  });
  await window.kb.savePresets(presets);
  renderPresets();
  nameEl.value = '';
  setStatus('perkey-status', `Saved "${name}"`, 'ok');
});

// Load presets on startup
loadPresets();

// ── Minecraft Mode ────────────────────────────────────────────────────────
const mcState = {
  active: false,
  dimension: 'overworld',
  flashTimeout: null,
  log: [],
};

const btnMcToggle = document.getElementById('btn-mc-toggle');
const mcBadge     = document.getElementById('mc-badge');
const mcLogEl     = document.getElementById('mc-log');

btnMcToggle.addEventListener('click', async () => {
  if (!state.connected) {
    setStatus('mc-status', 'Not connected — click Connect first.', 'err');
    return;
  }
  if (mcState.active) {
    await window.mc.stop();
    mcState.active = false;
    mcBadge.textContent = 'Inactive';
    mcBadge.className = 'mc-state-badge mc-off';
    btnMcToggle.textContent = 'Start Minecraft Mode';
    if (mcState.flashTimeout) { clearTimeout(mcState.flashTimeout); mcState.flashTimeout = null; }
  } else {
    const res = await window.mc.start();
    if (!res.ok) { setStatus('mc-status', 'Error: ' + res.message, 'err'); return; }
    mcState.active = true;
    mcState.dimension = 'overworld';
    mcBadge.textContent = 'Active';
    mcBadge.className = 'mc-state-badge mc-active';
    btnMcToggle.textContent = 'Stop';
    mcUpdateDimUI('overworld');
    mcApplyDimension('overworld');
  }
});

function mcUpdateDimUI(dim) {
  document.querySelectorAll('.mc-dim-card').forEach(c => c.classList.remove('mc-dim-active'));
  const el = document.getElementById('mc-dim-' + dim);
  if (el) {
    el.classList.add('mc-dim-active');
    el.classList.remove('mc-flash');
    void el.offsetWidth;
    el.classList.add('mc-flash');
  }
}

function mcApplyDimension(dim) {
  if (!mcState.active || !state.connected) return;
  mcState.dimension = dim;
  switch (dim) {
    case 'nether':
      window.kb.setBreathing({ color1: {r:255,g:80,b:0}, color2: {r:60,g:10,b:0}, speed: 160, brightness: 255 });
      updateCurrentLighting('breathing', {r:255,g:80,b:0});
      break;
    case 'end':
      window.kb.setBreathing({ color1: {r:160,g:0,b:255}, color2: {r:30,g:0,b:60}, speed: 120, brightness: 255 });
      updateCurrentLighting('breathing', {r:160,g:0,b:255});
      break;
    default:
      window.kb.setStatic({ r: 0, g: 160, b: 60 });
      updateCurrentLighting('static', {r:0,g:160,b:60});
      break;
  }
}

function mcFlash(r, g, b, ms) {
  if (!state.connected) return;
  if (mcState.flashTimeout) clearTimeout(mcState.flashTimeout);
  window.kb.setStatic({ r, g, b });
  mcState.flashTimeout = setTimeout(() => {
    mcState.flashTimeout = null;
    mcApplyDimension(mcState.dimension);
  }, ms);
}

function mcLogEvent(type, msg) {
  const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
  mcState.log.unshift({ type, msg, ts });
  if (mcState.log.length > 30) mcState.log.length = 30;
  mcLogEl.innerHTML = mcState.log.map(e => `
    <div class="mc-log-entry">
      <span class="mc-log-time">${e.ts}</span>
      <span class="mc-log-type mc-t-${e.type}">${e.type}</span>
      <span class="mc-log-msg">${e.msg}</span>
    </div>
  `).join('');
}

window.mc.onEvent((data) => {
  if (!mcState.active) return;
  switch (data.type) {
    case 'death':
      mcLogEvent('death', data.message || 'Player died');
      mcFlash(255, 0, 0, 1200);
      break;
    case 'damage':
      mcLogEvent('damage', `Took ${data.delta} damage`);
      mcFlash(255, 60, 0, 350);
      break;
    case 'advancement':
      mcLogEvent('advancement', data.name || 'Advancement unlocked');
      mcFlash(255, 200, 0, 700);
      break;
    case 'dimension': {
      mcLogEvent('dimension', 'Entered ' + data.dimension);
      mcUpdateDimUI(data.dimension);
      const dim = data.dimension;
      const flashColor = dim === 'nether' ? [255,100,0] : dim === 'end' ? [160,0,255] : [0,200,80];
      if (mcState.flashTimeout) clearTimeout(mcState.flashTimeout);
      window.kb.setStatic({ r: flashColor[0], g: flashColor[1], b: flashColor[2] });
      mcState.flashTimeout = setTimeout(() => {
        mcState.flashTimeout = null;
        mcApplyDimension(dim);
      }, 400);
      break;
    }
  }
});

// ── Audio Visualizer ──────────────────────────────────────────────────────

// Keyboard grid: maps each row to key indices (14 columns, -1 = gap)
const VIZ_ROWS = [
  [0,1,2,3,4,5,6,7,8,9,10,11,12,13],
  [14,15,16,17,18,19,20,21,22,23,24,25,26,27],
  [28,29,30,31,32,33,34,35,36,37,38,39,-1,40],
  [41,42,43,44,45,46,47,48,49,50,51,52,53,54],
  [55,56,57,-1,-1,58,-1,-1,59,60,-1,61,62,63],
];

// Logarithmic band edges: 128 FFT bins → 14 columns
const BAND_EDGES = [0,2,4,6,9,13,18,25,34,46,61,79,99,116,128];

// Colour themes: column (0-13) → base RGB
const VIZ_THEMES = {
  spectrum: (col) => {
    const h = col / 13 * 300;
    return hslToRgb(h, 1, 0.5);
  },
  fire: (col) => {
    const t = col / 13;
    return { r: 255, g: Math.round(t * 200), b: Math.round(t * t * 60) };
  },
  ocean: (col) => {
    const t = col / 13;
    return { r: Math.round(t * 80), g: Math.round(100 + t * 155), b: Math.round(180 + t * 75) };
  },
  matrix: (col) => {
    const t = col / 13;
    return { r: 0, g: Math.round(120 + t * 135), b: Math.round(t * 40) };
  },
};

function hslToRgb(h, s, l) {
  h /= 360; const a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

const audioViz = {
  active: false,
  stream: null,
  audioCtx: null,
  analyser: null,
  source: null,
  frameTimer: null,
  sensitivity: 1.5,
  smoothing: 0.7,
  colorTheme: 'spectrum',
  target: 'both',       // 'both' | 'keys' | 'strip'
  direction: 'bottom-up', // 'bottom-up' | 'top-down' | 'center-out' | 'full-row'
  fftData: null,
  inFlight: false,
};

// Init 14 preview bars
(function initVizBars() {
  const container = document.getElementById('viz-bars');
  for (let i = 0; i < 14; i++) {
    const bar = document.createElement('div');
    bar.className = 'viz-bar';
    bar.style.height = '3px';
    container.appendChild(bar);
  }
})();

async function startAudioViz() {
  if (!state.connected) {
    setStatus('viz-status', 'Not connected — click Connect first.', 'err');
    return;
  }

  // Capture audio input (picks up BlackHole if set as default input,
  // otherwise falls back to microphone)
  let stream = null;
  try {
    // List available audio inputs and prefer BlackHole
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');
    const blackhole = audioInputs.find(d => d.label.toLowerCase().includes('blackhole'));
    const constraints = blackhole
      ? { audio: { deviceId: { exact: blackhole.deviceId } } }
      : { audio: true };
    console.log('[Viz] Using audio device:', blackhole ? blackhole.label : 'default');
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (e) {
    setStatus('viz-status', 'Audio capture failed: ' + e.message + '. Check System Settings > Privacy > Microphone.', 'err');
    return;
  }

  audioViz.stream = stream;
  audioViz.audioCtx = new AudioContext();
  audioViz.analyser = audioViz.audioCtx.createAnalyser();
  audioViz.analyser.fftSize = 256;
  audioViz.analyser.smoothingTimeConstant = audioViz.smoothing;
  audioViz.source = audioViz.audioCtx.createMediaStreamSource(audioViz.stream);
  audioViz.source.connect(audioViz.analyser);
  audioViz.fftData = new Uint8Array(audioViz.analyser.frequencyBinCount);

  await window.kb.pauseKeepalive();

  // Activate CUSTOM mode once — subsequent frames use the fast path
  await window.kb.setCustom({
    colors: Array.from({ length: 64 }, () => ({ r: 0, g: 0, b: 0 })),
    sideColors: Array.from({ length: MAIN_SIDE_COUNT }, () => ({ r: 0, g: 0, b: 0 })),
    numpadColors: null, numpadSideColors: null, profile: state.activeProfile,
  });

  audioViz.active = true;
  vizFrameRunning();

  document.getElementById('viz-badge').textContent = 'Active';
  document.getElementById('viz-badge').className = 'mc-state-badge mc-active';
  document.getElementById('btn-viz-toggle').textContent = 'Stop';
}

async function stopAudioViz() {
  audioViz.active = false;
  if (audioViz.stream) { audioViz.stream.getTracks().forEach(t => t.stop()); audioViz.stream = null; }
  if (audioViz.audioCtx) { audioViz.audioCtx.close(); audioViz.audioCtx = null; }
  audioViz.source = null;
  audioViz.analyser = null;
  audioViz.inFlight = false;
  await window.kb.resumeKeepalive();

  // Reset preview bars
  document.querySelectorAll('.viz-bar').forEach(b => { b.style.height = '3px'; });

  document.getElementById('viz-badge').textContent = 'Inactive';
  document.getElementById('viz-badge').className = 'mc-state-badge mc-off';
  document.getElementById('btn-viz-toggle').textContent = 'Start Visualizer';
}

function computeBands(fftData, sensitivity) {
  const bands = new Float32Array(14);
  for (let b = 0; b < 14; b++) {
    let sum = 0, count = 0;
    for (let i = BAND_EDGES[b]; i < BAND_EDGES[b + 1]; i++) {
      sum += fftData[i]; count++;
    }
    bands[b] = Math.min(255, (sum / count) * sensitivity);
  }
  return bands;
}

function mapBandsToColors(bands, theme) {
  const themeFn = VIZ_THEMES[theme] || VIZ_THEMES.spectrum;
  const target = audioViz.target;
  const dir = audioViz.direction;
  const dim = { r: 2, g: 2, b: 2 };
  const off = { r: 0, g: 0, b: 0 };

  // Overall amplitude for left-right and strip modes
  const overallAmp = Math.min(255, Math.sqrt(bands.reduce((s, v) => s + v * v, 0) / 14)) / 255;

  // ── Keys ──
  const keyColors = Array.from({ length: 64 }, () => (target === 'strip' ? off : { ...dim }));

  if (target !== 'strip') {
    if (dir === 'left-right') {
      // Left-to-right: overall amplitude determines how many columns light up
      const litCols = Math.round(overallAmp * 14);
      for (let col = 0; col < 14; col++) {
        const base = themeFn(col);
        const isLit = col < litCols;
        for (let row = 0; row < 5; row++) {
          const keyIdx = VIZ_ROWS[row][col];
          if (keyIdx < 0) continue;
          keyColors[keyIdx] = isLit
            ? { r: Math.round(base.r * overallAmp), g: Math.round(base.g * overallAmp), b: Math.round(base.b * overallAmp) }
            : { ...dim };
        }
      }
    } else {
      for (let col = 0; col < 14; col++) {
        const amp = bands[col] / 255;
        const barHeight = amp * 5;
        const base = themeFn(col);
        const lit = {
          r: Math.round(base.r * Math.min(1, amp * 1.2)),
          g: Math.round(base.g * Math.min(1, amp * 1.2)),
          b: Math.round(base.b * Math.min(1, amp * 1.2)),
        };

        for (let row = 0; row < 5; row++) {
          const keyIdx = VIZ_ROWS[row][col];
          if (keyIdx < 0) continue;

          let shouldLight = false;
          if (dir === 'bottom-up') {
            shouldLight = (4 - row) < barHeight;
          } else if (dir === 'full-row') {
            shouldLight = amp > 0.05;
          }

          keyColors[keyIdx] = shouldLight ? { ...lit } : { ...dim };
        }
      }
    }
  }

  // ── Strip ──
  // Layout: top(0..15) → right(16..21) → bottom(22..37) → left(38..43)
  // Top goes L→R, bottom goes R→L (clockwise). We reverse bottom so
  // top and bottom are synced left-to-right, matching the key columns.
  const ST = 16, SR = 6, SB = 16, SL = 6; // distributeRing(44, wide)

  let sideColors;
  if (target === 'keys') {
    sideColors = Array.from({ length: MAIN_SIDE_COUNT }, () => ({ ...off }));
  } else {
    sideColors = Array.from({ length: MAIN_SIDE_COUNT }, () => ({ ...off }));

    for (let i = 0; i < MAIN_SIDE_COUNT; i++) {
      let bandIdx;

      if (i < ST) {
        // Top strip: left → right
        bandIdx = Math.floor(i / ST * 14);
      } else if (i < ST + SR) {
        // Right strip: treble bands
        const ri = i - ST;
        bandIdx = Math.min(13, 10 + Math.floor(ri / SR * 4));
      } else if (i < ST + SR + SB) {
        // Bottom strip: left → right (reverse index since clockwise = R→L)
        const bi = i - ST - SR;
        const posFromLeft = SB - 1 - bi;
        bandIdx = Math.floor(posFromLeft / SB * 14);
      } else {
        // Left strip: bass bands
        const li = i - ST - SR - SB;
        bandIdx = Math.min(3, Math.floor(li / SL * 4));
      }

      bandIdx = Math.min(13, Math.max(0, bandIdx));
      const amp = bands[bandIdx] / 255;
      const base = themeFn(bandIdx);
      sideColors[i] = {
        r: Math.round(base.r * amp),
        g: Math.round(base.g * amp),
        b: Math.round(base.b * amp),
      };
    }
  }

  return { keyColors, sideColors };
}

// Self-scheduling async loop — waits for each frame to finish before starting the next
async function vizFrameRunning() {
  while (audioViz.active) {
    try {
      audioViz.analyser.getByteFrequencyData(audioViz.fftData);
      const bands = computeBands(audioViz.fftData, audioViz.sensitivity);

      // Update preview bars
      const bars = document.querySelectorAll('.viz-bar');
      const themeFn = VIZ_THEMES[audioViz.colorTheme] || VIZ_THEMES.spectrum;
      bars.forEach((bar, i) => {
        const pct = Math.min(100, (bands[i] / 255) * 100);
        bar.style.height = Math.max(3, pct) + '%';
        const c = themeFn(i);
        bar.style.background = `rgb(${c.r},${c.g},${c.b})`;
        bar.style.boxShadow = `0 0 8px rgba(${c.r},${c.g},${c.b},0.4)`;
      });

      // Send to keyboard — awaits completion before next frame
      const { keyColors, sideColors } = mapBandsToColors(bands, audioViz.colorTheme);
      await window.kb.sendVizFrame({ colors: keyColors, sideColors });
    } catch (e) {
      console.log('[Viz] frame error:', e.message);
    }
    // Gap between frames — keeps UI responsive
    await new Promise(r => setTimeout(r, 40));
  }
}

// UI wiring
document.getElementById('btn-viz-toggle').addEventListener('click', () => {
  if (audioViz.active) stopAudioViz();
  else startAudioViz();
});

document.getElementById('slider-viz-sens').addEventListener('input', (e) => {
  audioViz.sensitivity = parseFloat(e.target.value);
  document.getElementById('lbl-viz-sens').textContent = audioViz.sensitivity.toFixed(1);
});

document.getElementById('slider-viz-smooth').addEventListener('input', (e) => {
  audioViz.smoothing = parseFloat(e.target.value);
  document.getElementById('lbl-viz-smooth').textContent = audioViz.smoothing.toFixed(2);
  if (audioViz.analyser) audioViz.analyser.smoothingTimeConstant = audioViz.smoothing;
});

document.querySelectorAll('#viz-theme-seg .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#viz-theme-seg .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    audioViz.colorTheme = btn.dataset.val;
  });
});

document.querySelectorAll('#viz-target-seg .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#viz-target-seg .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    audioViz.target = btn.dataset.val;
    // Strip-only always uses left-to-right; hide direction control
    const dirGroup = document.getElementById('group-viz-dir');
    if (audioViz.target === 'strip') {
      dirGroup.style.display = 'none';
    } else {
      dirGroup.style.display = '';
    }
  });
});

document.querySelectorAll('#viz-dir-seg .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#viz-dir-seg .seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    audioViz.direction = btn.dataset.val;
  });
});

// Stop visualizer if user switches to another effect
const origEffectClick = document.querySelectorAll('.effect-card');
origEffectClick.forEach(card => {
  card.addEventListener('click', () => {
    if (audioViz.active) stopAudioViz();
  });
});

// Stop on disconnect
window.kb.onAutoDisconnected(() => {
  if (_stripAnimId) stopStripAnim();
  if (audioViz.active) stopAudioViz();
  if (screenAmb.active) stopScreenAmb();
});

// ── Screen Ambience ──────────────────────────────────────────────────────

const SCR_W = 64, SCR_H = 36;

const screenAmb = {
  active: false,
  stream: null,
  video: null,
  canvas: null,
  ctx: null,
  saturation: 1.5,
  smoothing: 0.97,
  currentColor: { r: 0, g: 0, b: 0 },
  sending: false,
};

function screenDominantColor(data, sat) {
  // Bucket pixels into a coarse 4x4x4 colour cube, then pick the most
  // saturated bucket (highest distance from grey) that has enough pixels.
  const SHIFT = 6; // 256 >> 6 = 4 buckets per channel
  const SIZE = 4;
  const buckets = new Uint32Array(SIZE * SIZE * SIZE);
  const sums = new Float64Array(SIZE * SIZE * SIZE * 3);
  const total = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const ri = data[i] >> SHIFT, gi = data[i + 1] >> SHIFT, bi = data[i + 2] >> SHIFT;
    const idx = ri * SIZE * SIZE + gi * SIZE + bi;
    buckets[idx]++;
    const s = idx * 3;
    sums[s] += data[i]; sums[s + 1] += data[i + 1]; sums[s + 2] += data[i + 2];
  }

  // Find the bucket with the highest "vibrancy" score (saturation * count weight)
  const minCount = total * 0.02; // bucket must have ≥2% of pixels
  let bestScore = -1, bestR = 0, bestG = 0, bestB = 0;

  for (let idx = 0; idx < buckets.length; idx++) {
    if (buckets[idx] < minCount) continue;
    const s = idx * 3;
    const n = buckets[idx];
    const r = sums[s] / n, g = sums[s + 1] / n, b = sums[s + 2] / n;
    const avg = (r + g + b) / 3;
    const saturation = Math.sqrt((r - avg) ** 2 + (g - avg) ** 2 + (b - avg) ** 2);
    const brightness = Math.max(r, g, b);
    // Score = saturation weighted by brightness and bucket size
    const score = saturation * (0.5 + brightness / 510) * Math.sqrt(n / total);
    if (score > bestScore) {
      bestScore = score; bestR = r; bestG = g; bestB = b;
    }
  }

  // If nothing vivid found, fall back to plain average
  if (bestScore <= 0) {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    bestR = r / total; bestG = g / total; bestB = b / total;
  }

  // Boost saturation + brightness
  const avg = (bestR + bestG + bestB) / 3;
  let r = avg + (bestR - avg) * sat;
  let g = avg + (bestG - avg) * sat;
  let b = avg + (bestB - avg) * sat;

  // Lift brightness so the LED is vivid
  const peak = Math.max(r, g, b, 1);
  const lift = Math.min(255 / peak, 2.0); // up to 2× brighter
  return {
    r: Math.round(Math.max(0, Math.min(255, r * lift))),
    g: Math.round(Math.max(0, Math.min(255, g * lift))),
    b: Math.round(Math.max(0, Math.min(255, b * lift))),
  };
}

async function startScreenAmb() {
  if (!state.connected) {
    setStatus('screen-status', 'Not connected — click Connect first.', 'err');
    return;
  }

  let sources;
  try { sources = await window.desktop.getSources(); } catch (_) { sources = []; }
  if (!sources.length) {
    setStatus('screen-status', 'No screen sources. Grant Screen Recording in System Settings > Privacy & Security.', 'err');
    return;
  }

  try {
    screenAmb.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sources[0].id,
          maxWidth: 320,
          maxHeight: 180,
          maxFrameRate: 10,
        }
      }
    });
  } catch (e) {
    setStatus('screen-status', 'Capture failed: ' + e.message, 'err');
    return;
  }

  const video = document.createElement('video');
  video.srcObject = screenAmb.stream;
  video.muted = true;
  video.play();
  screenAmb.video = video;

  screenAmb.canvas = document.createElement('canvas');
  screenAmb.canvas.width = SCR_W;
  screenAmb.canvas.height = SCR_H;
  screenAmb.ctx = screenAmb.canvas.getContext('2d', { willReadFrequently: true });

  screenAmb.currentColor = { r: 0, g: 0, b: 0 };
  screenAmb.sending = false;

  await window.kb.pauseKeepalive();
  await window.kb.setCustom({
    colors: Array.from({ length: 64 }, () => ({ r: 0, g: 0, b: 0 })),
    sideColors: Array.from({ length: MAIN_SIDE_COUNT }, () => ({ r: 0, g: 0, b: 0 })),
    numpadColors: null, numpadSideColors: null, profile: state.activeProfile,
  });

  screenAmb.active = true;
  document.getElementById('screen-badge').textContent = 'Active';
  document.getElementById('screen-badge').className = 'mc-state-badge mc-active';
  document.getElementById('btn-screen-toggle').textContent = 'Stop';

  screenAmbFrame();
}

async function stopScreenAmb() {
  screenAmb.active = false;
  if (screenAmb.stream) { screenAmb.stream.getTracks().forEach(t => t.stop()); screenAmb.stream = null; }
  if (screenAmb.video) { screenAmb.video.pause(); screenAmb.video.srcObject = null; screenAmb.video = null; }
  screenAmb.canvas = null;
  screenAmb.ctx = null;
  await window.kb.resumeKeepalive();

  document.getElementById('screen-badge').textContent = 'Inactive';
  document.getElementById('screen-badge').className = 'mc-state-badge mc-off';
  document.getElementById('btn-screen-toggle').textContent = 'Start Screen Ambience';
}

function screenAmbFrame() {
  if (!screenAmb.active) return;
  const { video, ctx } = screenAmb;
  if (!video || !ctx) return;

  // Sample dominant screen colour from tiny offscreen canvas
  ctx.drawImage(video, 0, 0, SCR_W, SCR_H);
  const data = ctx.getImageData(0, 0, SCR_W, SCR_H).data;
  const target = screenDominantColor(data, screenAmb.saturation);

  // Smooth transition toward target
  const sm = screenAmb.smoothing;
  const c = screenAmb.currentColor;
  screenAmb.currentColor = {
    r: Math.round(c.r * sm + target.r * (1 - sm)),
    g: Math.round(c.g * sm + target.g * (1 - sm)),
    b: Math.round(c.b * sm + target.b * (1 - sm)),
  };

  // Update swatch in UI
  const hex = rgbToHex(screenAmb.currentColor);
  document.getElementById('screen-swatch').style.background = hex;
  document.getElementById('screen-hex').textContent = hex;

  // Fill entire keyboard with the one colour
  const col = { ...screenAmb.currentColor };
  const keyColors = Array.from({ length: 64 }, () => ({ ...col }));
  const stripColors = Array.from({ length: MAIN_SIDE_COUNT }, () => ({ ...col }));

  if (state.connected && !screenAmb.sending) {
    screenAmb.sending = true;
    window.kb.sendVizFrame({
      colors: keyColors,
      sideColors: stripColors,
      numpadSideColors: null,
    }).finally(() => { screenAmb.sending = false; });
  }

  requestAnimationFrame(screenAmbFrame);
}

// Screen Ambience UI wiring
document.getElementById('btn-screen-toggle').addEventListener('click', () => {
  if (screenAmb.active) stopScreenAmb();
  else startScreenAmb();
});

document.getElementById('slider-screen-sat').addEventListener('input', (e) => {
  screenAmb.saturation = parseFloat(e.target.value);
  document.getElementById('lbl-screen-sat').textContent = screenAmb.saturation.toFixed(1);
});

document.getElementById('slider-screen-smooth').addEventListener('input', (e) => {
  screenAmb.smoothing = parseFloat(e.target.value);
  document.getElementById('lbl-screen-smooth').textContent = screenAmb.smoothing.toFixed(2);
});

// Stop screen ambience when switching to another effect
origEffectClick.forEach(card => {
  card.addEventListener('click', () => {
    if (screenAmb.active) stopScreenAmb();
  });
});

// ── Device tab ─────────────────────────────────────────────────────────────
async function refreshDeviceTab() {
  const list = document.getElementById('device-list');
  const devices = await window.kb.listDevices();

  if (!devices.length) {
    list.innerHTML = '<div class="device-empty">No Mountain devices detected. Plug in the keyboard and click <strong>Connect</strong>.</div>';
    return;
  }

  list.innerHTML = devices.map(d => `
    <div class="device-card">
      <h3>${d.product || 'Mountain Keyboard'}</h3>
      <dl class="device-props">
        <dt>Manufacturer</dt><dd>${d.manufacturer || 'Mountain'}</dd>
        <dt>Vendor ID</dt>   <dd>0x${d.vendorId?.toString(16).padStart(4,'0').toUpperCase()}</dd>
        <dt>Product ID</dt>  <dd>0x${d.productId?.toString(16).padStart(4,'0').toUpperCase()}</dd>
        <dt>Interface</dt>   <dd>${d.interface ?? '—'}</dd>
        <dt>Usage Page</dt>  <dd>0x${d.usagePage?.toString(16).toUpperCase() ?? '—'}</dd>
        <dt>Path</dt>        <dd style="word-break:break-all;font-size:11px">${d.path}</dd>
      </dl>
    </div>
  `).join('');
}

// ── First-launch popup ────────────────────────────────────────────────────
(async () => {
  const first = await window.appInfo.isFirstLaunch();
  if (!first) return;
  const overlay = document.getElementById('first-launch-overlay');
  overlay.style.display = '';
  document.getElementById('btn-dismiss-modal').addEventListener('click', () => {
    overlay.style.display = 'none';
  });
})();

// ── Close-to-tray notification ────────────────────────────────────────────
window.appInfo.onCloseToTray(() => {
  const overlay = document.getElementById('close-tray-overlay');
  overlay.style.display = '';
  document.getElementById('btn-dismiss-close-tray').addEventListener('click', () => {
    overlay.style.display = 'none';
    if (document.getElementById('chk-dont-show-close').checked) {
      window.appInfo.dismissCloseBanner();
    }
  });
});
