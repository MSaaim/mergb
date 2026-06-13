/**
 * Mountain Everest 60 — Correct HID Protocol
 *
 * Source: BaseCamp-Linux /devices/everest60/controller.py
 *         OpenRGB Mountain60KeyboardController.h/.cpp
 *
 * VID 0x3282 / PID 0x0005 (ANSI) or 0x0006 (ISO)
 * Interface 2, Feature Reports, 65-byte packets.
 *
 * Every packet:
 *   buf[0]     = 0x00          (HID report ID)
 *   buf[1]     = cmd byte
 *   buf[2..4]  = 0x46 0x23 0xEA  (magic — mandatory on ALL packets)
 *
 * Two-step mode flow:
 *   1. cmd 0x16 — SelectMode  (activates effect)
 *   2. cmd 0x17 — ModeDetails (colours / speed / brightness)
 *   After each send: read back feature report, verify resp[1] == cmd (retry ×3)
 */

const HID = require('node-hid');
const usb = require('usb');

const MOUNTAIN_VID = 0x3282;
const MAGIC        = [0x46, 0x23, 0xEA];

// ── Commands ──────────────────────────────────────────────────────────────────
const CMD = {
  RESET:         0x03,
  SELECT_MODE:   0x16,   // step 1: activate effect
  MODE_DETAILS:  0x17,   // step 2: colours / speed / brightness
  START_DIRECT:  0x34,   // custom per-key: begin
  MAP_DIRECT:    0x35,   // custom per-key: chunk
  END_DIRECT:    0x36,   // custom per-key: finish
  SAVE:          0x1A,
};

// ── Effect codes ──────────────────────────────────────────────────────────────
const EFFECT = {
  STATIC:    0x01,
  WAVE:      0x02,
  TORNADO:   0x03,
  BREATHING: 0x04,
  REACTIVE:  0x05,
  MATRIX:    0x06,
  CUSTOM:    0x07,
  YETI:      0x08,
  OFF:       0x09,
};

// ── Color modes ───────────────────────────────────────────────────────────────
const COLOR_MODE = { SINGLE: 0x00, RAINBOW: 0x02, DUAL: 0x10 };

// ── Directions ────────────────────────────────────────────────────────────────
const DIRECTION = {
  RIGHT: 0x00, DOWN: 0x02, LEFT: 0x04, UP: 0x06,
  ANTICLOCKWISE: 0x0A, CLOCKWISE: 0x09,
};

// ── LED hardware index map (logical key → firmware address) ───────────────────
// Source: BaseCamp-Linux /devices/everest60/controller.py
// Mountain Everest 60 — 65% layout, 64 keys
//
// Row 0: Esc  1    2    3    4    5    6    7    8    9    0    -    =   BkSp
// Row 1: Tab  Q    W    E    R    T    Y    U    I    O    P    [    ]    \
// Row 2: Caps A    S    D    F    G    H    J    K    L    ;    '   Ent
// Row 3: LSft Z    X    C    V    B    N    M    ,    .    /   RSft  ↑   Del
// Row 4: LCtl LWin LAlt       Space       RAlt  Fn   ←    ↓    →
const LEDIDX = [
  // Row 0 (14 keys) — Escape is at firmware address 0, not 21
  0, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,
  // Row 1 (14 keys)
  42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55,
  // Row 2 (13 keys)
  63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 76,
  // Row 3 (14 keys) — RShift is 1.75u, then Up, Del
  84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 97, 99, 56,
  // Row 4 (9 keys) — arrow cluster at far right
  105, 106, 107, 110, 113, 115, 119, 120, 121,
];

// ── Numpad module LED indices (detachable, attaches left or right) ────────────
// Verified empirically (scan-leds.js): the firmware is a 21-wide matrix
// (row starts 21,42,63,84,105) and the numpad is columns 17-20 of each row —
// i.e. addr = rowStart + 17..20. The old 170-186 block was a guess and lit
// nothing. Order matches the data-np indices in index.html.
//        col17  col18  col19  col20
// row0:   38NL   39/    40*    41-
// row1:   59-7   60-8   61-9   62+
// row2:   80-4   81-5   82-6
// row3:  101-1  102-2  103-3  104Ent
// row4:  122-0         124.
const NUMPAD_LEDIDX = [
   38,  39,  40,  41,   // Num Lock  /  *  -
   59,  60,  61,  62,   // 7  8  9  +
   80,  81,  82,        // 4  5  6
  101, 102, 103, 125,   // 1  2  3  Enter (Enter is 2u-tall: LED is bottom cell, row4 col20)
  122, 124,             // 0  .
];

// ── Side strip LED indices — 44 LEDs around the keyboard perimeter ────────────
// Source: BaseCamp-Linux /devices/everest60/controller.py
// "SIDE_LED_INDICES = list(range(126, 170))"
const SIDE_LEDIDX    = Array.from({ length: 44 }, (_, i) => 126 + i); // 126-169
// Numpad bezel ring — verified empirically (tools/find-strip.js): 22 LEDs at
// addresses 170-191, immediately after the keyboard ring. (Earlier "170 lit
// nothing" was the keepalive wiping the frame; with it stopped, 170-191 light
// the full numpad ring; 192+ are the numpad key LEDs.)
const NUMPAD_SIDE_LEDIDX = Array.from({ length: 22 }, (_, i) => 170 + i); // 170-191

class MountainKeyboard {
  constructor() {
    this.device     = null;   // node-hid for feature report send/get
    this.connected  = false;
    this._keepalive = null;
    this._devInfo   = null;
  }

  // ── List all detected Mountain HID devices ──────────────────────────────────
  static listDevices() {
    return HID.devices().filter(d => d.vendorId === MOUNTAIN_VID);
  }

  // ── Connect ─────────────────────────────────────────────────────────────────
  async connect() {
    const all = HID.devices().filter(d => d.vendorId === MOUNTAIN_VID);
    if (!all.length) throw new Error('Mountain Everest 60 keyboard not found.');

    // We need interface 2 (usagePage 0xFFFF) for feature reports
    const iface2 = all.find(d => d.usagePage === 0xFFFF)
                || all.find(d => d.interface === 2);
    if (!iface2) throw new Error('Could not find vendor HID interface (interface 2).');

    console.log(`[KB] Opening interface 2: ${iface2.path}`);
    this.device  = new HID.HID(iface2.path);
    this._devInfo = iface2;

    // Verify connection with a ping
    try {
      await this._sendAndVerify(CMD.SELECT_MODE, (buf) => { buf[9] = EFFECT.STATIC; });
      console.log('[KB] Ping OK — keyboard responded');
    } catch (e) {
      console.log('[KB] Ping failed but continuing:', e.message);
    }

    // Now that device is confirmed responsive, try to read current mode
    let currentMode = null;
    try {
      currentMode = await this.readCurrentMode();
    } catch (_) {}

    this.connected = true;
    this._startKeepalive();
    console.log('[KB] Connected to Mountain Everest 60');
    return { ...iface2, currentMode };
  }

  // ── Disconnect ───────────────────────────────────────────────────────────────
  disconnect() {
    this._stopKeepalive();
    if (this.device) { try { this.device.close(); } catch (_) {} this.device = null; }
    this.connected = false;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Make a zeroed 65-byte packet with magic bytes pre-filled
  _buf(cmd) {
    const b = Buffer.alloc(65, 0);
    b[0] = 0x00;           // report ID
    b[1] = cmd;
    b[2] = MAGIC[0];       // 0x46
    b[3] = MAGIC[1];       // 0x23
    b[4] = MAGIC[2];       // 0xEA
    return b;
  }

  _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Send feature report, then read back and verify resp[1] == cmd (retry × 5)
  async _sendAndVerify(cmd, fillFn, retries = 5) {
    for (let attempt = 0; attempt < retries; attempt++) {
      const buf = this._buf(cmd);
      if (fillFn) fillFn(buf);

      const hex = buf.slice(0, 14).toString('hex');
      console.log(`[KB] >> [${cmd.toString(16).padStart(2,'0')}] ${hex}...`);

      try {
        this.device.sendFeatureReport([...buf]);
      } catch (e) {
        console.log(`[KB] sendFeatureReport failed: ${e.message}`);
        await this._delay(100);
        continue;
      }
      await this._delay(80);

      try {
        const resp = this.device.getFeatureReport(0x00, 65);
        const respHex = Buffer.from(resp).slice(0, 8).toString('hex');
        console.log(`[KB] << [${cmd.toString(16).padStart(2,'0')}] ${respHex}...`);

        if (resp && resp[1] === cmd) {
          return resp;   // ACK confirmed
        }
        console.log(`[KB] ACK mismatch (got resp[1]=0x${resp[1]?.toString(16)}, expected 0x${cmd.toString(16)}) retry ${attempt+1}`);
      } catch (e) {
        console.log(`[KB] getFeatureReport failed: ${e.message}`);
      }
      await this._delay(80);
    }
    console.log(`[KB] No ACK for cmd 0x${cmd.toString(16)} after ${retries} tries — continuing anyway`);
  }

  _startKeepalive() {
    // Clear any existing interval before starting a new one
    if (this._keepalive) clearInterval(this._keepalive);
    // Light keepalive — just a harmless mode-details re-send every 10s
    this._keepalive = setInterval(async () => {
      if (!this.device) return;
      try {
        const buf = this._buf(CMD.SELECT_MODE);
        this.device.sendFeatureReport([...buf]);
      } catch (_) {}
    }, 10000);
  }

  _stopKeepalive() {
    if (this._keepalive) { clearInterval(this._keepalive); this._keepalive = null; }
  }

  // Convert 0-255 slider to nearest 25-step (0/25/50/75/100) expected by firmware
  _toStep(val255) {
    const pct = Math.round(val255 / 255 * 100);
    return Math.round(pct / 25) * 25;
  }

  // Save current state to the keyboard's onboard flash (active profile).
  // effectCode: the active effect (e.g. EFFECT.STATIC=0x01, EFFECT.CUSTOM=0x07).
  //             The firmware uses buf[5] to know WHICH effect's data to persist.
  // Returns true if the save was ACK'd, false otherwise.
  async _save(effectCode = EFFECT.STATIC) {
    for (let round = 0; round < 3; round++) {
      await this._delay(round === 0 ? 150 : 250);
      const resp = await this._sendAndVerify(CMD.SAVE, (buf) => {
        buf[5] = effectCode;
      }, 5);
      if (resp) {
        console.log(`[KB] Saved effect 0x${effectCode.toString(16)} to onboard memory`);
        return true;
      }
      console.log(`[KB] Save round ${round + 1} got no ACK — retrying`);
    }
    console.log('[KB] WARNING: save to onboard memory failed after all attempts');
    return false;
  }

  // ── Core: two-step mode setter ───────────────────────────────────────────────
  // save: set false to skip onboard flash write (used by setCustomColors which
  //        saves after the per-key data is fully uploaded)
  async _setMode({ effect, speed=128, brightness=255,
                   colorMode=COLOR_MODE.SINGLE,
                   color1={r:255,g:255,b:255}, color2={r:0,g:0,b:0},
                   direction=DIRECTION.RIGHT, save=true }) {
    // Pause keepalive to prevent collisions with the multi-step sequence
    this._stopKeepalive();
    try {
      // Step 1 — activate effect
      await this._sendAndVerify(CMD.SELECT_MODE, (buf) => {
        buf[5] = 0x01;
        buf[9] = effect;
      });

      await this._delay(60);

      // Step 2 — send details
      await this._sendAndVerify(CMD.MODE_DETAILS, (buf) => {
        buf[5]  = effect;
        buf[7]  = this._toStep(speed);
        buf[8]  = this._toStep(brightness);
        buf[9]  = colorMode;
        buf[10] = direction;
        if (colorMode !== COLOR_MODE.RAINBOW) {
          buf[12] = color1.r; buf[13] = color1.g; buf[14] = color1.b;
          if (colorMode === COLOR_MODE.DUAL) {
            buf[15] = color2.r; buf[16] = color2.g; buf[17] = color2.b;
          }
        }
      });

      if (save) await this._save(effect);
    } finally {
      // Only resume keepalive if we own the full lifecycle (i.e. save=true).
      // When save=false the caller manages the keepalive.
      if (save) this._startKeepalive();
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  async setStaticColor(r, g, b, profile = 0) {
    console.log(`[KB] setStaticColor rgb(${r},${g},${b})`);
    await this._setMode({ effect: EFFECT.STATIC, colorMode: COLOR_MODE.SINGLE,
                          color1: {r,g,b} });
  }

  async setOff() {
    await this._setMode({ effect: EFFECT.OFF });
  }

  async setBreathing({ color1={r:0,g:180,b:255}, color2={r:0,g:0,b:0},
                       speed=128, brightness=255 } = {}) {
    await this._setMode({ effect: EFFECT.BREATHING, speed, brightness,
                          colorMode: COLOR_MODE.DUAL, color1, color2 });
  }

  async setWave({ colorMode='rainbow', color1={r:255,g:0,b:0}, color2={r:0,g:0,b:255},
                  direction='right', speed=128, brightness=255 } = {}) {
    const cm  = { rainbow: COLOR_MODE.RAINBOW, single: COLOR_MODE.SINGLE, dual: COLOR_MODE.DUAL };
    const dir = { right: DIRECTION.RIGHT, left: DIRECTION.LEFT, up: DIRECTION.UP,
                  down: DIRECTION.DOWN, clockwise: DIRECTION.CLOCKWISE,
                  anticlockwise: DIRECTION.ANTICLOCKWISE };
    await this._setMode({ effect: EFFECT.WAVE, speed, brightness,
                          colorMode: cm[colorMode] ?? COLOR_MODE.RAINBOW,
                          color1, color2, direction: dir[direction] ?? DIRECTION.RIGHT });
  }

  async setReactive({ color1={r:255,g:255,b:255}, color2={r:0,g:100,b:255},
                      speed=180, brightness=255 } = {}) {
    await this._setMode({ effect: EFFECT.REACTIVE, speed, brightness,
                          colorMode: COLOR_MODE.DUAL, color1, color2 });
  }

  async setTornado({ color1={r:255,g:0,b:100}, color2={r:0,g:100,b:255},
                     colorMode='dual', direction='clockwise', speed=128, brightness=255 } = {}) {
    const cm  = { rainbow: COLOR_MODE.RAINBOW, single: COLOR_MODE.SINGLE, dual: COLOR_MODE.DUAL };
    const dir = { clockwise: DIRECTION.CLOCKWISE, anticlockwise: DIRECTION.ANTICLOCKWISE };
    await this._setMode({ effect: EFFECT.TORNADO, speed, brightness,
                          colorMode: cm[colorMode] ?? COLOR_MODE.DUAL, color1, color2,
                          direction: dir[direction] ?? DIRECTION.CLOCKWISE });
  }

  async setMatrix({ color1={r:0,g:255,b:0}, color2={r:0,g:80,b:0},
                    speed=128, brightness=255 } = {}) {
    await this._setMode({ effect: EFFECT.MATRIX, speed, brightness,
                          colorMode: COLOR_MODE.DUAL, color1, color2 });
  }

  async setYeti({ color1={r:255,g:255,b:255}, color2={r:0,g:180,b:255},
                   speed=128, brightness=255 } = {}) {
    await this._setMode({ effect: EFFECT.YETI, speed, brightness,
                          colorMode: COLOR_MODE.DUAL, color1, color2 });
  }

  // Check whether the numpad module is currently attached
  async checkNumpad() {
    try {
      const buf = this._buf(0x08);
      this.device.sendFeatureReport([...buf]);
      await this._delay(50);
      const resp = this.device.getFeatureReport(0x00, 65);
      // resp[5] == 0x01 means numpad detected
      const attached = resp && resp[5] === 0x01;
      console.log(`[KB] Numpad: ${attached ? 'attached' : 'not attached'}`);
      return attached;
    } catch (e) {
      return false;
    }
  }

  // Per-key custom colours
  // colors           = array of {r,g,b} for main keys (up to 64)
  // numpadColors     = optional array of {r,g,b} for numpad keys (up to 17)
  // sideColors       = optional array of {r,g,b} for keyboard side strip (up to 44)
  // numpadSideColors = optional array of {r,g,b} for numpad side strip (up to 10)
  async setCustomColors(colors, profile = 0, numpadColors = null, sideColors = null, numpadSideColors = null) {
    const brightness = 255;
    // Escape can't be addressed via MAP_DIRECT — pass its colour through
    // MODE_DETAILS so the firmware keeps it lit at the correct colour.
    const escColor = colors[0] || { r: 255, g: 255, b: 255 };
    // save:false — don't save to flash yet; per-key data hasn't been uploaded.
    // Saving incomplete state would write "custom mode, no key data" to flash,
    // so the keyboard would show blank if unplugged before the real save.
    // Keepalive stays paused (save:false keeps it stopped) until our finally block.
    await this._setMode({ effect: EFFECT.CUSTOM, brightness,
                          colorMode: COLOR_MODE.SINGLE, color1: escColor, save: false });
    try {
    await this._delay(50);

    // Start
    await this._sendAndVerify(CMD.START_DIRECT, (buf) => {
      buf[5] = this._toStep(brightness);
      buf[6] = 0xC0;
    });
    await this._delay(50);

    // Build stream: main keys + optional numpad + optional side strips
    const stream = LEDIDX.slice(0, colors.length).map((hwIdx, i) => ({
      hw: hwIdx, r: colors[i]?.r ?? 0, g: colors[i]?.g ?? 0, b: colors[i]?.b ?? 0,
    }));
    if (numpadColors) {
      NUMPAD_LEDIDX.slice(0, numpadColors.length).forEach((hwIdx, i) => {
        stream.push({ hw: hwIdx, r: numpadColors[i]?.r ?? 0,
                      g: numpadColors[i]?.g ?? 0, b: numpadColors[i]?.b ?? 0 });
      });
    }
    if (sideColors) {
      SIDE_LEDIDX.slice(0, sideColors.length).forEach((hwIdx, i) => {
        stream.push({ hw: hwIdx, r: sideColors[i]?.r ?? 0,
                      g: sideColors[i]?.g ?? 0, b: sideColors[i]?.b ?? 0 });
      });
    }
    if (numpadSideColors) {
      NUMPAD_SIDE_LEDIDX.slice(0, numpadSideColors.length).forEach((hwIdx, i) => {
        stream.push({ hw: hwIdx, r: numpadSideColors[i]?.r ?? 0,
                      g: numpadSideColors[i]?.g ?? 0, b: numpadSideColors[i]?.b ?? 0 });
      });
    }

    // Pad stream so the last chunk has >= 10 entries (matching the 0x0A marker).
    // Without padding, the firmware reads zeroes past the real data, setting
    // address 0 to black — which kills the Escape key.
    const CHUNK = 14;
    const lastSize = stream.length % CHUNK;
    if (lastSize > 0 && lastSize < 10) {
      for (let p = lastSize; p < 10; p++) {
        stream.push({ hw: 0xFF, r: 0, g: 0, b: 0 });
      }
    }

    for (let i = 0; i < stream.length; i += CHUNK) {
      const chunk     = stream.slice(i, i + CHUNK);
      const isLast    = (i + CHUNK) >= stream.length;
      await this._sendAndVerify(CMD.MAP_DIRECT, (buf) => {
        buf[5] = isLast ? 0x0A : 0x0E;
        chunk.forEach(({ hw, r, g, b }, j) => {
          buf[9 + j * 4]     = hw;
          buf[9 + j * 4 + 1] = r;
          buf[9 + j * 4 + 2] = g;
          buf[9 + j * 4 + 3] = b;
        });
      });
      await this._delay(20);
    }

    // End — signal the firmware that the per-key upload is complete
    await this._sendAndVerify(CMD.END_DIRECT, null);

    // Give firmware extra time to commit the per-key buffer before saving.
    await this._delay(300);
    const saved = await this._save(EFFECT.CUSTOM);
    return { saved };
    } finally {
      this._startKeepalive();
    }
  }

  // Fast per-key frame for visualizer — no mode activation, no ACK, no save.
  // Call setCustomColors() once first to activate CUSTOM mode, then use this
  // for rapid frame updates (~10-15 FPS).
  async sendVisualizerFrame(colors, sideColors = null, numpadSideColors = null) {
    const stream = LEDIDX.slice(0, colors.length).map((hwIdx, i) => ({
      hw: hwIdx, r: colors[i]?.r ?? 0, g: colors[i]?.g ?? 0, b: colors[i]?.b ?? 0,
    }));
    if (sideColors) {
      SIDE_LEDIDX.slice(0, sideColors.length).forEach((hwIdx, i) => {
        stream.push({ hw: hwIdx, r: sideColors[i]?.r ?? 0,
                      g: sideColors[i]?.g ?? 0, b: sideColors[i]?.b ?? 0 });
      });
    }
    if (numpadSideColors) {
      NUMPAD_SIDE_LEDIDX.slice(0, numpadSideColors.length).forEach((hwIdx, i) => {
        stream.push({ hw: hwIdx, r: numpadSideColors[i]?.r ?? 0,
                      g: numpadSideColors[i]?.g ?? 0, b: numpadSideColors[i]?.b ?? 0 });
      });
    }
    // Pad last chunk to >= 10 entries
    const CHUNK = 14;
    const lastSize = stream.length % CHUNK;
    if (lastSize > 0 && lastSize < 10) {
      for (let p = lastSize; p < 10; p++)
        stream.push({ hw: 0xFF, r: 0, g: 0, b: 0 });
    }

    // Send + read ACK + yield between each command so the main process
    // stays responsive (each await lets IPC messages through).
    const _sr = async (cmd, fillFn) => {
      const buf = this._buf(cmd);
      if (fillFn) fillFn(buf);
      this.device.sendFeatureReport([...buf]);
      try { this.device.getFeatureReport(0x00, 65); } catch (_) {}
      await this._delay(5); // yield to event loop
    };

    await _sr(CMD.START_DIRECT, (buf) => { buf[5] = this._toStep(255); buf[6] = 0xC0; });

    for (let i = 0; i < stream.length; i += CHUNK) {
      const chunk = stream.slice(i, i + CHUNK);
      const isLast = (i + CHUNK) >= stream.length;
      await _sr(CMD.MAP_DIRECT, (buf) => {
        buf[5] = isLast ? 0x0A : 0x0E;
        chunk.forEach(({ hw, r, g, b: bv }, j) => {
          buf[9 + j * 4] = hw; buf[9 + j * 4 + 1] = r;
          buf[9 + j * 4 + 2] = g; buf[9 + j * 4 + 3] = bv;
        });
      });
    }

    await _sr(CMD.END_DIRECT, null);
  }

  // ── LED discovery helper ─────────────────────────────────────────────────────
  // Lights ONLY the given firmware LED address(es) at full colour, everything
  // else off. Use this to empirically map unknown indices (e.g. the numpad
  // module) — sweep an index, see which physical LED lights, record it.
  // `indices` may be a single number or an array of numbers.
  async lightOnly(indices, r = 0, g = 255, b = 0) {
    const list = Array.isArray(indices) ? indices : [indices];
    await this._setMode({ effect: EFFECT.CUSTOM, brightness: 255, colorMode: 0x00 });
    await this._delay(50);

    await this._sendAndVerify(CMD.START_DIRECT, (buf) => {
      buf[5] = this._toStep(255);
      buf[6] = 0xC0;
    });
    await this._delay(50);

    const stream = list.map(hw => ({ hw, r, g, b }));
    const CHUNK = 14;
    const lastSize = stream.length % CHUNK;
    if (lastSize > 0 && lastSize < 10) {
      for (let p = lastSize; p < 10; p++) {
        stream.push({ hw: 0xFF, r: 0, g: 0, b: 0 });
      }
    }
    for (let i = 0; i < stream.length; i += CHUNK) {
      const chunk  = stream.slice(i, i + CHUNK);
      const isLast = (i + CHUNK) >= stream.length;
      await this._sendAndVerify(CMD.MAP_DIRECT, (buf) => {
        buf[5] = isLast ? 0x0A : 0x0E;
        chunk.forEach(({ hw, r, g, b }, j) => {
          buf[9 + j * 4]     = hw;
          buf[9 + j * 4 + 1] = r;
          buf[9 + j * 4 + 2] = g;
          buf[9 + j * 4 + 3] = b;
        });
      });
      await this._delay(20);
    }
    await this._sendAndVerify(CMD.END_DIRECT, null);
  }

  // Query the keyboard for its current lighting mode.
  // Sends a no-op SELECT_MODE (no activation, no effect) and parses the response.
  // Returns null if the response doesn't contain a recognisable mode.
  async readCurrentMode() {
    if (!this.device) return null;
    try {
      // Send SELECT_MODE with NO activation flag and NO effect code.
      // This is the same packet the keepalive uses — safe, does not change anything.
      const buf = this._buf(CMD.SELECT_MODE);
      // buf[5] stays 0 (no activation), buf[9] stays 0 (no effect)
      this.device.sendFeatureReport([...buf]);
      await this._delay(60);
      const resp = this.device.getFeatureReport(0x00, 65);

      if (!resp) return null;
      const hex = Buffer.from(resp).slice(0, 24).toString('hex');
      console.log('[KB] readCurrentMode raw:', hex);

      const effectMap = {
        0x01: 'static', 0x02: 'wave', 0x03: 'tornado',
        0x04: 'breathing', 0x05: 'reactive', 0x06: 'matrix',
        0x07: 'custom', 0x09: 'off',
      };
      const colorModeMap = { 0x00: 'single', 0x02: 'rainbow', 0x10: 'dual' };
      const dirMap = {
        0x00: 'right', 0x02: 'down', 0x04: 'left', 0x06: 'up',
        0x09: 'clockwise', 0x0A: 'anticlockwise',
      };

      // We sent buf[9]=0, so any non-zero effect code in the response
      // must be the keyboard's own current mode, not an echo.
      for (const pos of [5, 9, 6]) {
        const code = resp[pos];
        if (code && effectMap[code]) {
          console.log(`[KB] Detected effect 0x${code.toString(16)} (${effectMap[code]}) at byte ${pos}`);
          return {
            effect: effectMap[code],
            effectCode: code,
            speed: resp[7] ? Math.round(resp[7] * 255 / 100) : 128,
            brightness: resp[8] ? Math.round(resp[8] * 255 / 100) : 255,
            colorMode: colorModeMap[resp[9]] || 'single',
            direction: dirMap[resp[10]] || 'right',
            color1: { r: resp[12] || 0, g: resp[13] || 0, b: resp[14] || 0 },
            color2: { r: resp[15] || 0, g: resp[16] || 0, b: resp[17] || 0 },
          };
        }
      }
      console.log('[KB] No valid effect code found — will use saved state');
      return null;
    } catch (e) {
      console.log('[KB] readCurrentMode error:', e.message);
      return null;
    }
  }

  switchProfile(index) {
    // Profile switch — best-effort, no ACK needed
    try {
      const buf = this._buf(0x06);
      buf[5] = index & 0x0F;
      this.device.sendFeatureReport([...buf]);
    } catch (e) {
      console.log('[KB] profile switch error:', e.message);
    }
  }
}

module.exports = { MountainKeyboard, EFFECT, COLOR_MODE, DIRECTION };
