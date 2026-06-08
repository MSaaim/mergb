#!/usr/bin/env node
/**
 * LED address scanner — maps unknown firmware LED indices to physical LEDs.
 *
 * The numpad module's LED addresses are NOT documented anywhere public, and the
 * values currently in src/keyboard.js (170-196) light nothing — they are not
 * real LED addresses. The firmware addresses LEDs by the hardware-index byte
 * (that is why the main keys use a sparse, gappy list like 21..34, 42..55).
 * The numpad almost certainly lives in those gap addresses. This tool lights
 * ONE address at a time, on your command, so you can SEE which physical LED
 * (which numpad key, or which strip segment) each address drives.
 *
 * Usage:
 *   node tools/scan-leds.js                 # interactive, starts at addr 35
 *   node tools/scan-leds.js 122             # interactive, starts at addr 122
 *   node tools/scan-leds.js 35 240 auto     # auto-sweep 35..240, ~1.5s each
 *   node tools/scan-leds.js ... -v          # add -v anywhere to see raw packets
 *
 * INTERACTIVE controls (default mode):
 *   Enter / n   -> light the NEXT address
 *   p           -> re-light the PREVIOUS address
 *   <number>    -> jump to and light that exact address
 *   q           -> quit
 *
 * Watch the keyboard. For each lit address note what responds:
 *   - a numpad KEY  -> record the address + key name (NumLock, 7, 8, +, Enter…)
 *   - a strip LED   -> record the address as a numpad-strip segment
 *   - nothing       -> address is unused
 *
 * Attach the numpad first. Quit the app (only one process can hold the HID
 * interface). The known main-key addresses are 21-121 and the keyboard side
 * strip is 126-169, so the numpad is most likely in the gaps: 35-41, 57-62,
 * 77-83, 98-104, 122-125, or somewhere past 197.
 */

const readline = require('readline');

// Suppress the chatty [KB] protocol logging unless -v / --verbose is passed.
const VERBOSE = process.argv.includes('-v') || process.argv.includes('--verbose');
if (!VERBOSE) {
  const origLog = console.log;
  console.log = (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('[KB]')) return;
    origLog(...args);
  };
}

const { MountainKeyboard } = require('../src/keyboard');

// Positional args (ignore flags)
const nums = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const auto = process.argv.includes('auto');
const start = nums[0] != null ? nums[0] : 35;
const end   = nums[1] != null ? nums[1] : (auto ? 240 : start + 200);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const kb = new MountainKeyboard();
  try {
    await kb.connect();
  } catch (e) {
    console.error('Connect failed:', e.message);
    process.exit(1);
  }
  // Stop the 10s keepalive — it re-sends SELECT_MODE and would wipe our frame.
  kb._stopKeepalive();

  async function light(addr) {
    try {
      await kb.lightOnly(addr, 0, 255, 0);
      console.log(`\n  >>> addr ${addr} is now bright GREEN — what lit up?`);
    } catch (e) {
      console.log(`\n  addr ${addr} -> error: ${e.message}`);
    }
  }

  if (auto) {
    console.log(`\nAuto-sweeping ${start}..${end} (1.5s each). Ctrl-C to stop.\n`);
    for (let i = start; i <= end; i++) {
      console.log(`  addr ${String(i).padStart(3)} -> GREEN`);
      await kb.lightOnly(i, 0, 255, 0);
      await sleep(1500);
    }
    kb.disconnect();
    process.exit(0);
  }

  // Interactive mode
  console.log('\nInteractive LED scan. Controls:');
  console.log('   Enter / n = next   p = previous   <number> = jump   q = quit\n');

  let addr = start;
  await light(addr);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(`  [addr ${addr}] > `);
  rl.prompt();

  rl.on('line', async (line) => {
    const cmd = line.trim().toLowerCase();
    if (cmd === 'q') { rl.close(); return; }
    else if (cmd === 'p') { addr = Math.max(0, addr - 1); }
    else if (/^\d+$/.test(cmd)) { addr = parseInt(cmd, 10); }
    else { addr = addr + 1; }            // Enter or 'n'
    await light(addr);
    rl.setPrompt(`  [addr ${addr}] > `);
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\nDone. Tell me which addresses lit which physical LEDs and');
    console.log('I will write the correct NUMPAD_LEDIDX / NUMPAD_SIDE_LEDIDX arrays.');
    kb.disconnect();
    process.exit(0);
  });
})();
