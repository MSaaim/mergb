# MeRGB

An open-source macOS and Windows app for controlling RGB lighting on the **Mountain Everest 60** keyboard and numpad module. Built with Electron and raw HID — no vendor software required.

> **Note:** Currently only the Mountain Everest 60 is supported. More keyboards will be added in future updates.

## Download

[![Build & Release](https://github.com/MSaaim/mergb/actions/workflows/release.yml/badge.svg)](https://github.com/MSaaim/mergb/actions/workflows/release.yml)

Grab the latest build from the [Releases page](https://github.com/MSaaim/mergb/releases/latest):

| Platform | Download |
|---|---|
| macOS (Apple Silicon) | [Latest DMG / ZIP](https://github.com/MSaaim/mergb/releases/latest) |
| Windows | [Latest Setup EXE](https://github.com/MSaaim/mergb/releases/latest) |

A new release is built automatically on every push to `main`.

On macOS, you may need to grant Input Monitoring permission (System Settings > Privacy & Security > Input Monitoring). On Windows, run as Administrator if the keyboard is not detected.

## Features

- **Lighting Effects** — Static, Wave, Breathing, Reactive, Tornado, Matrix, Yeti, and Off. Each with configurable colours, speed, brightness, colour mode, and direction.
- **Per-Key Custom Lighting** — Paint individual keys and strip LEDs with any colour. Click-and-drag to paint, fill/clear keys and strips independently.
- **Strip Animation** — Smooth split animation that starts from the bottom center and travels up both sides of the keyboard strip. Numpad strip syncs automatically when connected.
- **Numpad Module Support** — Full RGB control for the detachable numpad, including its 22-LED perimeter strip (verified hardware mapping).
- **Minecraft Mode** — Reactive keyboard lighting driven by Minecraft game state. Watches the log file for deaths, damage, dimension changes, and advancements. Dimension-based ambient colours (green Overworld, orange Nether, purple End) with event flashes.
- **Audio Visualizer** — Real-time audio-reactive lighting using microphone input. Multiple colour themes (Spectrum, Fire, Ocean, Matrix), configurable sensitivity, smoothing, direction, and target (keys, strip, or both). For system audio, route through BlackHole or a similar loopback driver.
- **Custom Presets** — Save and load per-key lighting presets by name. Animation state is preserved with presets.
- **Auto-Connect** — Detects the keyboard via USB hotplug and connects automatically.
- **Persistent State** — Lighting settings (including per-key custom colours) are saved and restored across app restarts.
- **Menu Bar / System Tray** — Lives in the macOS menu bar or Windows system tray. Switch lighting modes directly from the tray menu without opening the window.
- **Close to Tray** — Closing the window keeps the app running in the background.

## Supported Hardware

| Device | VID | PID | Status |
|---|---|---|---|
| Mountain Everest 60 (ANSI) | `0x3282` | `0x0005` | Supported |
| Mountain Everest 60 (ISO) | `0x3282` | `0x0006` | Supported |
| Numpad Module | — | — | Supported (auto-detected) |

Communication uses HID Interface 2 with 65-byte feature reports. Protocol is based on reverse-engineered work from [BaseCamp-Linux](https://github.com/whitelynx/basecamp-linux) and [OpenRGB](https://openrgb.org/).

## Building from Source

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- macOS or Windows

### Install & Run

```bash
git clone https://github.com/your-username/mergb.git
cd mergb
npm install
npm start
```

### Build Installers

```bash
npm run dist          # macOS DMG (Apple Silicon)
npm run dist:win      # Windows NSIS installer
```

Output goes to `dist/`.

### Troubleshooting

- **Keyboard not detected** — Try running the app once with `sudo` (macOS) or as Administrator (Windows) to grant HID access, or add MeRGB to System Settings > Privacy & Security > Input Monitoring.
- **Native module errors** — Run `npm run rebuild` to recompile `node-hid` and `usb` against the installed Electron version.

## Project Structure

```
main.js            Electron main process, IPC handlers, USB hotplug, tray
preload.js         Context bridge (renderer <-> main)
index.html         App UI
src/
  renderer.js      UI logic, effects, painting, animations, visualizer
  keyboard.js      HID protocol implementation (feature reports)
  minecraft.js     Minecraft log watcher and game state events
  styles.css       Styles
tools/
  scan-leds.js     Interactive LED address scanner
  find-strip.js    Strip LED discovery (block sweep / pinpoint / fill)
  verify-numpad.js Numpad key mapping verification
  gen-icons.js     Icon generation from SVGs
```

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Clone** your fork locally
   ```bash
   git clone https://github.com/your-username/mergb.git
   cd mergb
   npm install
   ```
3. **Create a branch** for your feature or fix
   ```bash
   git checkout -b feature/my-feature
   ```
4. **Make your changes** — run `npm start` to test locally
5. **Commit** with a clear message describing what you changed and why
6. **Push** to your fork
   ```bash
   git push origin feature/my-feature
   ```
7. **Open a Pull Request** against the `main` branch

### Guidelines

- **Open an issue first** to discuss significant changes before starting work
- **Test on real hardware** if possible — RGB changes can't be fully tested without the keyboard
- **Keep PRs focused** — one feature or fix per pull request
- **Don't break existing effects** — if you're adding a new mode, make sure the existing ones still work
- **Adding keyboard support?** Check `src/keyboard.js` for the HID protocol. New keyboards need their VID/PID, LED index mapping, and strip layout documented and verified with the tools in `tools/`

### Ideas for Contributions

- Support for additional Mountain keyboards (Everest Max, etc.)
- Linux support
- macOS Intel builds
- New lighting effects
- Import/export presets
- Per-key lighting for more games beyond Minecraft

## License

MIT

## Acknowledgements

- [BaseCamp-Linux](https://github.com/whitelynx/basecamp-linux) — Reverse-engineered Mountain keyboard HID protocol
- [OpenRGB](https://openrgb.org/) — Mountain60KeyboardController reference implementation
- [node-hid](https://github.com/node-hid/node-hid) — Node.js HID device access
- [Electron](https://www.electronjs.org/) — Desktop app framework
