#!/usr/bin/env node
/**
 * Numpad-strip finder — locates the numpad bezel ("360° RGB") LED addresses.
 *
 * The numpad ring's addresses are undocumented. The keyboard ring is the known
 * range 126-169. The numpad ring is somewhere else (the old 170-196 guess lit
 * nothing). This tool finds it in two fast phases instead of one-LED-at-a-time:
 *
 *   PHASE 1 — block sweep (default):
 *     Lights a whole BLOCK of addresses at once (default 10), holds ~2.2s, then
 *     moves to the next block. Just watch the NUMPAD BEZEL and note which block
 *     makes it glow. Far faster than stepping single LEDs.
 *
 *       node tools/find-strip.js                 # sweeps 170..360 in blocks of 10
 *       node tools/find-strip.js 200 400         # custom range
 *       node tools/find-strip.js 170 360 16      # block size 16
 *
 *   PHASE 2 — pinpoint a found block one LED at a time (interactive):
 *       node tools/find-strip.js pin 230 260     # step 230..260, Enter to advance
 *
 *   FILL — light an exact range at once and hold (to count segments / confirm):
 *       node tools/find-strip.js fill 232 255    # all-on, then quit with Enter
 *
 * Tell me: the address where the numpad ring STARTS, where it ENDS, and roughly
 * how many segments light — I'll write NUMPAD_SIDE_LEDIDX from that.
 *
 * Attach the numpad first; quit the app (single HID owner).
 */

const readline = require('readline');

const VERBOSE = process.argv.includes('-v');
if (!VERBOSE) {
  const orig = console.log;
  console.log = (...a) => { if (typeof a[0] === 'string' && a[0].startsWith('[KB]')) return; orig(...a); };
}

const { MountainKeyboard } = require('../src/keyboard');

const argv  = process.argv.slice(2);
const mode  = ['pin', 'fill'].includes(argv[0]) ? argv[0] : 'block';
const nums  = argv.filter(a => /^\d+$/.test(a)).map(Number);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

(async () => {
  const kb = new MountainKeyboard();
  try { await kb.connect(); }
  catch (e) { console.error('Connect failed:', e.message); process.exit(1); }
  kb._stopKeepalive();

  // ── FILL: light an exact range simultaneously ──────────────────────────────
  if (mode === 'fill') {
    const [a = 232, b = 255] = nums;
    console.log(`\nLighting ${a}..${b} (${b - a + 1} addrs) all GREEN at once.`);
    await kb.lightOnly(range(a, b), 0, 255, 0);
    console.log('Count the lit numpad-bezel segments, then press Enter to quit.');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', () => rl.close());
    rl.on('close', () => { kb.disconnect(); process.exit(0); });
    return;
  }

  // ── PIN: step one LED at a time through a small range ──────────────────────
  if (mode === 'pin') {
    const [a = 170, b = a + 40] = nums;
    let addr = a;
    const showPin = async () => {
      await kb.lightOnly(addr, 0, 255, 0);
      console.log(`  addr ${addr} -> GREEN  ${addr >= b ? '(end of range)' : ''}`);
    };
    console.log(`\nPinpoint ${a}..${b}. Enter = next, p = prev, q = quit\n`);
    await showPin();
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', async (l) => {
      const c = l.trim().toLowerCase();
      if (c === 'q' || addr >= b) { rl.close(); return; }
      addr = c === 'p' ? Math.max(a, addr - 1) : addr + 1;
      await showPin();
    });
    rl.on('close', () => { kb.disconnect(); process.exit(0); });
    return;
  }

  // ── BLOCK: light blocks of N at once, auto-advance ─────────────────────────
  const [a = 170, b = 360, blk = 10] = nums;
  console.log(`\nBlock sweep ${a}..${b}, ${blk} addrs per block, ~2.2s each.`);
  console.log('Watch the NUMPAD BEZEL — note which block range makes it glow.\n');
  for (let s = a; s <= b; s += blk) {
    const e = Math.min(s + blk - 1, b);
    console.log(`  block ${String(s).padStart(3)}..${String(e).padStart(3)}  -> GREEN`);
    await kb.lightOnly(range(s, e), 0, 255, 0);
    await sleep(2200);
  }
  console.log('\nDone. Which block(s) lit the numpad ring? Re-run with:');
  console.log('  node tools/find-strip.js pin <blockStart> <blockEnd>   to pinpoint exact start/end');
  kb.disconnect();
  process.exit(0);
})();
