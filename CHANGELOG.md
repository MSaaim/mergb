# Changelog

## v1.0.1 — 2026-06-14

### Bug Fixes

- **Fix onboard save for all effects** — The SAVE command was hardcoding `buf[5]=0x01` (STATIC effect code). The firmware needs the active effect code to know which data to persist. Now passes the correct effect code (e.g. `0x07` for Custom, `0x08` for Yeti). Discovered via Wireshark capture of official BaseCamp protocol.
- **Fix Custom per-key colors not persisting to keyboard flash** — Custom per-key colors now save to onboard memory and survive unplugging into a different machine.
- **Fix Yeti colors not persisting** — Yeti effect colors now save correctly to onboard flash.
- **Skip premature save in Custom mode** — `_setMode` was saving incomplete state (mode=CUSTOM, no key data) before per-key upload. Added `save: false` option so `setCustomColors` only saves once after all data is uploaded.

### New Features

- **Rainbow Tornado** — Tornado effect now supports Rainbow, Single, and Dual color modes (previously hardcoded to Dual only). Color mode selector appears in the UI when Tornado is selected.

### Reliability Improvements

- **Pause keepalive during writes** — The 10s keepalive (`SELECT_MODE` ping) could collide with multi-step mode changes and custom uploads. Now paused during `_setMode` and `setCustomColors`, resumed in `finally` blocks.
- **Increase retry count** — `_sendAndVerify` retries increased from 3 to 5, delays from 50ms to 80ms.
- **Wrap sendFeatureReport in try-catch** — Write failures are now caught and retried instead of silently ignored.
- **Robust save with retry** — `_save()` now retries up to 3 rounds (5 attempts each) and returns success/failure status.
- **UI save feedback** — Custom mode now shows whether the onboard save succeeded or failed.

### Build Fixes

- Removed invalid `publisherName` from `win` config to fix electron-builder validation error.
