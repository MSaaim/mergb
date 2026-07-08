/**
 * MinecraftWatcher — monitors Minecraft log + stats for reactive keyboard events
 *
 * Runs in the Electron main process.  Tails ~/.minecraft/logs/latest.log for
 * game events (deaths, advancements, dimension changes) and polls the most
 * recently modified stats JSON every 2 s to detect damage-taken deltas.
 *
 * Emits:
 *   'event'  → { type, ...payload }
 *   'status' → { running }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

// macOS: ~/Library/Application Support/minecraft
// Linux: ~/.minecraft
// Windows: %APPDATA%/.minecraft
const MC_DIR = process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Application Support', 'minecraft')
  : path.join(os.homedir(), '.minecraft');
const LOG_PATH = path.join(MC_DIR, 'logs', 'latest.log');

// ── Death message fragments (covers all vanilla death messages) ──────────────
const DEATH_PATTERNS = [
  /was slain by/i, /was shot by/i, /drowned/i, /experienced kinetic energy/i,
  /fell from/i, /fell off/i, /fell out of/i, /fell into/i, /hit the ground/i,
  /burned to death/i, /went up in flames/i, /tried to swim in lava/i,
  /suffocated/i, /was squished/i, /was killed/i, /blew up/i,
  /was struck by lightning/i, /died/i, /withered away/i, /starved/i,
  /was pummeled/i, /was fireballed/i, /was impaled/i, /was pricked/i,
  /was stung/i, /was frozen/i, /was obliterated/i,
];

const ADVANCEMENT_RE = /has made the advancement|has completed the challenge|has reached the goal/i;

class MinecraftWatcher extends EventEmitter {
  constructor() {
    super();
    this._logWatcher   = null;
    this._statsTimer   = null;
    this._logSize      = 0;
    this._lastDamage   = -1;   // -1 = uninitialised
    this._lastDeaths   = -1;
    this._running      = false;
    this._customLogPath = null;
  }

  /** Override the default log path (e.g. for MultiMC / Prism / ATLauncher). */
  setLogPath(p) { this._customLogPath = p || null; }

  get logPath() { return this._customLogPath || LOG_PATH; }

  start() {
    if (this._running) return;
    this._running = true;
    this._watchLog();
    this._pollStats();
    this.emit('status', { running: true });
  }

  stop() {
    this._running = false;
    if (this._logWatcher) { this._logWatcher.close(); this._logWatcher = null; }
    if (this._statsTimer) { clearInterval(this._statsTimer); this._statsTimer = null; }
    this._lastDamage = -1;
    this._lastDeaths = -1;
    this.emit('status', { running: false });
  }

  // ── Log tail ────────────────────────────────────────────────────────────────
  _watchLog() {
    const lp = this.logPath;
    try { this._logSize = fs.statSync(lp).size; } catch (_) { this._logSize = 0; }

    const readNew = () => {
      try {
        const stat = fs.statSync(lp);
        if (stat.size < this._logSize) this._logSize = 0;  // rotated
        const len = stat.size - this._logSize;
        if (len <= 0) return;
        const buf = Buffer.alloc(len);
        const fd = fs.openSync(lp, 'r');
        fs.readSync(fd, buf, 0, len, this._logSize);
        fs.closeSync(fd);
        this._logSize = stat.size;
        buf.toString('utf8').split('\n').forEach(l => this._parseLine(l.trim()));
      } catch (_) {}
    };

    try {
      this._logWatcher = fs.watch(lp, (ev) => { if (ev === 'change') readNew(); });
      this._logWatcher.on('error', () => {});
    } catch (e) {
      console.log('[MC] log watch failed:', e.message);
    }
  }

  _parseLine(line) {
    if (!line) return;

    // Deaths
    for (const pat of DEATH_PATTERNS) {
      if (pat.test(line)) {
        this.emit('event', { type: 'death', message: line });
        return;
      }
    }

    // Advancements
    if (ADVANCEMENT_RE.test(line)) {
      const m = line.match(/\[([^\]]+)\]\s*$/);
      this.emit('event', { type: 'advancement', name: m ? m[1] : 'Unknown', message: line });
      return;
    }

    // Dimension changes — match "Creating pipeline for dimension minecraft:X"
    // Avoid the "Reloading pipeline on dimension change: A => B" line which
    // contains both the old and new dimension names.
    const dimMatch = line.match(/Creating pipeline for dimension minecraft:(\S+)/i);
    if (dimMatch) {
      const d = dimMatch[1];
      if (/the_nether/i.test(d))       this.emit('event', { type: 'dimension', dimension: 'nether' });
      else if (/the_end/i.test(d))     this.emit('event', { type: 'dimension', dimension: 'end' });
      else if (/overworld/i.test(d))   this.emit('event', { type: 'dimension', dimension: 'overworld' });
    }
  }

  // ── Stats polling ───────────────────────────────────────────────────────────
  _pollStats() {
    const poll = () => {
      if (!this._running) return;
      try {
        const file = this._findLatestStats();
        if (!file) return;
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        const custom = data?.stats?.['minecraft:custom'] ?? {};
        const damage = custom['minecraft:damage_taken'] ?? 0;
        const deaths = custom['minecraft:deaths'] ?? 0;

        // First poll: just store baseline
        if (this._lastDamage < 0) { this._lastDamage = damage; this._lastDeaths = deaths; return; }

        if (deaths > this._lastDeaths) {
          this.emit('event', { type: 'death', source: 'stats' });
        }
        if (damage > this._lastDamage) {
          this.emit('event', { type: 'damage', delta: damage - this._lastDamage, source: 'stats' });
        }
        this._lastDamage = damage;
        this._lastDeaths = deaths;
      } catch (_) {}
    };

    poll();
    this._statsTimer = setInterval(poll, 2000);
  }

  _findLatestStats() {
    try {
      const savesDir = path.join(MC_DIR, 'saves');
      let best = null, bestMt = 0;
      for (const world of fs.readdirSync(savesDir)) {
        const sd = path.join(savesDir, world, 'stats');
        try {
          for (const f of fs.readdirSync(sd)) {
            if (!f.endsWith('.json')) continue;
            const fp = path.join(sd, f);
            const mt = fs.statSync(fp).mtimeMs;
            if (mt > bestMt) { bestMt = mt; best = fp; }
          }
        } catch (_) {}
      }
      return best;
    } catch (_) { return null; }
  }
}

module.exports = { MinecraftWatcher };
