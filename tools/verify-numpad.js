#!/usr/bin/env node
/**
 * Numpad mapping verification — lights each numpad KEY in turn, by name, so you
 * can confirm the derived NUMPAD_LEDIDX addresses are correct.
 *
 * Usage:
 *   node tools/verify-numpad.js          # auto-walk, ~1.3s per key
 *   node tools/verify-numpad.js step     # press Enter to advance each key
 *
 * It should light, in order: NumLock, /, *, -, 7, 8, 9, +, 4, 5, 6,
 * 1, 2, 3, Enter, 0, .  — each in green. If any key is dark or the wrong
 * physical key lights, tell me which one and its position in the sequence.
 */

const readline = require('readline');
const { MountainKeyboard } = require('../src/keyboard');

// Keep in sync with NUMPAD_LEDIDX in src/keyboard.js
const KEYS = [
  ['NumLock', 38], ['/', 39], ['*', 40], ['-', 41],
  ['7', 59], ['8', 60], ['9', 61], ['+', 62],
  ['4', 80], ['5', 81], ['6', 82],
  ['1', 101], ['2', 102], ['3', 103], ['Enter', 104],
  ['0', 122], ['.', 124],
];

const step  = process.argv.includes('step');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const kb = new MountainKeyboard();
  try { await kb.connect(); }
  catch (e) { console.error('Connect failed:', e.message); process.exit(1); }
  kb._stopKeepalive();

  console.log('\nLighting each numpad key in order. Watch the numpad.\n');

  if (!step) {
    for (const [name, addr] of KEYS) {
      console.log(`  ${name.padEnd(8)} (addr ${addr}) -> GREEN`);
      await kb.lightOnly(addr, 0, 255, 0);
      await sleep(1300);
    }
    console.log('\nDone. Did each named key light correctly?');
    kb.disconnect();
    process.exit(0);
  }

  // step mode
  let i = 0;
  async function show() {
    const [name, addr] = KEYS[i];
    console.log(`  ${name.padEnd(8)} (addr ${addr}) -> GREEN   [${i + 1}/${KEYS.length}]`);
    await kb.lightOnly(addr, 0, 255, 0);
  }
  await show();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('  Enter = next, q = quit > ');
  rl.prompt();
  rl.on('line', async (line) => {
    if (line.trim().toLowerCase() === 'q' || i >= KEYS.length - 1) { rl.close(); return; }
    i++;
    await show();
    rl.prompt();
  });
  rl.on('close', () => { kb.disconnect(); process.exit(0); });
})();
