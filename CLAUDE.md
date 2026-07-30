# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MeRGB is an Electron desktop app for controlling RGB lighting on the Mountain Everest 60 keyboard and its detachable numpad module. It communicates directly via HID feature reports — no vendor software needed. Targets macOS (Apple Silicon) and Windows.

## Commands

```bash
npm install         # Install deps + auto-rebuild native modules (node-hid, uiohook-napi)
npm start           # Run in dev mode (launches Electron)
npm run rebuild     # Recompile native modules against current Electron version
npm run dist        # Build macOS DMG + ZIP (arm64)
npm run dist:win    # Build Windows NSIS installer
npm run pack        # Package without installer (for testing)
```

There is no test suite or linter configured. Build output goes to `dist/`.

## Architecture

**Vanilla Electron app** — no framework (React/Vue), no bundler (webpack/vite). Plain JavaScript with direct DOM manipulation.

### Process Model

- **Main process** (`main.js`) — Window creation, IPC handler registration, USB hotplug detection (`usb` package), system tray, global keyboard hook (`uiohook-napi`), auto-updater (Windows only), Minecraft log watcher lifecycle.
- **Preload** (`preload.js`) — Context bridge exposing `window.api` with `invoke()` and `on()` methods. All renderer↔main communication goes through this bridge (context isolation enabled, nodeIntegration disabled).
- **Renderer** (`src/renderer.js`, `index.html`, `src/styles.css`) — All UI logic: tab navigation, effect controls, per-key color painting on SVG keyboard, strip animation, audio visualizer, screen ambience. Manages a `state` object that tracks all lighting parameters.

### Hardware Layer

`src/keyboard.js` — HID protocol implementation for the Mountain Everest 60. Key details:
- Uses HID Interface 2 with 65-byte feature reports
- Magic bytes `0x46 0x23 0xEA` prefix every packet
- Two-step command pattern: SelectMode (`0x16`) → ModeDetails (`0x17`)
- Retry logic (5 attempts, 80ms delays) with feature report read-back verification
- 10-second keepalive ping to prevent firmware disconnect
- Keepalive is paused during multi-step writes to avoid corruption

### LED Addressing

- Main keyboard: 64 keys (addresses in `LEDIDX` array, range 0-99)
- Side strip: 44 LEDs around keyboard perimeter (addresses 126-169)
- Numpad keys: 17 keys (addresses 38-125)
- Numpad strip: 22 LEDs (addresses 170-191)

### IPC Namespaces

- `kb:*` — Keyboard operations (connect, disconnect, set effects, custom colors, presets, keepalive)
- `appInfo` — First-launch detection, tray visibility, effect state tracking
- `desktop` — Screen grab for ambience mode
- `mc:*` — Minecraft watcher start/stop and log path config
- Events from main to renderer: `kb:auto-connected`, `kb:auto-disconnected`, `global:keydown`, `mc:event`, `mc:status`, `tray:effect-changed`, `update:status`

### State Persistence

Saved to Electron's `userData` directory:
- `lighting-state.json` — Current effect, colors, brightness, speed, per-key colors
- `custom-presets.json` — Named per-key preset states
- `.launched` / `.close-to-tray-dismissed` — One-time flags

### Minecraft Integration

`src/minecraft.js` — Tail-based log watcher that tracks deaths (25+ vanilla patterns), dimension changes, and advancements. Emits events over IPC; renderer maps game state to keyboard colors.

## Adding Keyboard Support

New keyboards need: VID/PID added to `keyboard.js`, LED index mapping array, strip layout. Use `tools/scan-leds.js` and `tools/find-strip.js` to discover LED addresses on physical hardware. Verify numpad mapping with `tools/verify-numpad.js`.

## CI/CD

GitHub Actions (`.github/workflows/release.yml`) builds on every push to `main`. Parallel macOS + Windows builds, publishes to a `latest` release tag.
