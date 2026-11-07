// Daily Metabase CSV pull. Downloads each saved question in
// config/metabase-exports.json through Metabase's CSV export API (the same
// unformatted CSV as clicking Download → .csv, no row cap below Metabase's own
// 1M download limit) and saves it as <name>_<UTC timestamp>.csv, matching
// Metabase's manual-download filenames so ingest-signups can read the folder.
//
//   npm run pull-metabase                  pull every question now
//   npm run pull-metabase -- --only 269,107 pull just these question ids
//   node scripts/pull-metabase.mjs --scheduled
//        what the launchd job runs (every hour + at login). Does nothing before
//        config.runAfter (local time) or once every question has a good pull
//        today, so a Mac that was off/asleep at run time catches up later and a
//        failed question is retried the next hour.
//
// Env (.env.local):
//   METABASE_URL       e.g. https://mutiny.metabaseapp.com (no trailing slash)
//   METABASE_API_KEY   Admin → Settings → Authentication → API keys. The key's
//                      group needs view + download access to the questions'
//                      collections and databases.
//   (or METABASE_USERNAME + METABASE_PASSWORD for a session login instead)
//
// Output folder, run time, and history kept: config/metabase-exports.json.
// Status of the last run: <outDir>/_last-run.json. Log (when run by launchd):
// ~/Library/Logs/growth-dashboard/metabase-pull.log.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

// ── args + config ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const SCHEDULED = flag('--scheduled');
const ONLY = opt('--only') ? new Set(opt('--only').split(',').map((s) => Number(s.trim()))) : null;
const CONFIG_PATH = opt('--config') || process.env.METABASE_CONFIG || 'config/metabase-exports.json';

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const expandHome = (p) => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p);
const OUT_DIR = resolve(expandHome(opt('--out') || config.outDir));
const KEEP = Number(config.keep ?? 7); // 0 = keep everything
const RUN_AFTER = config.runAfter || '07:30';
const STATE_FILE = join(OUT_DIR, '.pull-metabase-state.json');
const LOCK_FILE = join(OUT_DIR, '.pull-metabase.lock');
const STATUS_FILE = join(OUT_DIR, '_last-run.json');

const BASE = (process.env.METABASE_URL || '').replace(/\/+$/, '');
const API_KEY = process.env.METABASE_API_KEY;
const TIMEOUT_MS = Number(process.env.METABASE_TIMEOUT_MS || 15 * 60_000); // Athena can be slow
const RETRY_WAITS = (process.env.METABASE_RETRY_WAITS || '30,120').split(',').map((s) => Number(s) * 1000);

const now = () => new Date();
const localDay = (d = now()) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD, Mac's time zone
const stamp = () => new Date().toISOString().replace(/:/g, '_'); // Metabase-style: 2026-11-07T21_27_23.449Z
const log = (...m) => console.log(`[${new Date().toLocaleString('en-US', { hour12: false })}]`, ...m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function notify(title, message) {
  if (process.platform !== 'darwin' || process.env.METABASE_NO_NOTIFY) return;
  const q = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  execFile('osascript', ['-e', `display notification ${q(message)} with title ${q(title)}`], () => {});
}

function fail(msg, code = 1) {
  console.error(`pull-metabase: ${msg}`);
  notify('Metabase pull failed', msg);
  process.exit(code);
}

// ── output folder (macOS privacy check) ─────────────────────────────────────
try {
  mkdirSync(OUT_DIR, { recursive: true });
  readdirSync(OUT_DIR);
} catch (e) {
  if (e.code === 'EPERM' || e.code === 'EACCES') {
    fail(`macOS blocked access to ${OUT_DIR}. Open System Settings → Privacy & Security → Full Disk Access, click +, and add ${process.execPath} (press Cmd+Shift+G to paste the path).`);
  }
  throw e;
}

const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const state = readJson(STATE_FILE, { questions: {} });
state.questions ||= {};
const saveState = () => writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

// ── scheduled mode: decide whether there's anything to do ───────────────────
const today = localDay();
let questions = config.questions.filter((q) => !ONLY || ONLY.has(q.id));

if (SCHEDULED) {
  const [h, m] = RUN_AFTER.split(':').map(Number);
  const t = now();
  if (t.getHours() * 60 + t.getMinutes() < h * 60 + m) {
    log(`before ${RUN_AFTER}, nothing to do`);
    process.exit(0);
  }
  questions = questions.filter((q) => state.questions[q.id]?.day !== today);
  if (!questions.length) {
    log(`all ${config.questions.length} questions already pulled today, nothing to do`);
    process.exit(0);
  }
}

if (!BASE) fail('METABASE_URL is not set in .env.local');
if (!API_KEY && !(process.env.METABASE_USERNAME && process.env.METABASE_PASSWORD)) {
  fail('METABASE_API_KEY is not set in .env.local (or set METABASE_USERNAME + METABASE_PASSWORD)');
}

// ── single-run lock (hourly + at-login triggers can overlap a slow run) ──────
if (existsSync(LOCK_FILE)) {
  const pid = Number(readFileSync(LOCK_FILE, 'utf8'));
  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch {}
  if (alive) { log(`another run (pid ${pid}) is still going, exiting`); process.exit(0); }
}
writeFileSync(LOCK_FILE, String(process.pid));
const unlock = () => { try { unlinkSync(LOCK_FILE); } catch {} };
process.on('exit', unlock);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

// ── Metabase API ────────────────────────────────────────────────────────────
let authHeaders;
async function auth() {
  if (API_KEY) return (authHeaders = { 'x-api-key': API_KEY });
  const res = await fetch(`${BASE}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: process.env.METABASE_USERNAME, password: process.env.METABASE_PASSWORD }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw Object.assign(new Error(`login failed: HTTP ${res.status}`), { fatal: true });
  return (authHeaders = { 'X-Metabase-Session': (await res.json()).id });
}

// Rows in a CSV body, ignoring newlines inside quoted fields.
function countRows(text) {
  let rows = 0, inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 34) inQ = !inQ;
    else if (c === 10 && !inQ) rows++;
  }
  if (text.length && text[text.length - 1] !== '\n') rows++;
  return Math.max(0, rows - 1); // minus header
}

async function download(q) {
  const res = await fetch(`${BASE}/api/card/${q.id}/query/csv`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'format_rows=false&parameters=%5B%5D',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf8');
  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error(`HTTP ${res.status} — the API key can't read question ${q.id} (check its group's collection/data permissions)`), { fatal: true });
  }
  if (res.status === 404) throw Object.assign(new Error(`HTTP 404 — question ${q.id} not found`), { fatal: true });
  if (res.status >= 400) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  // Metabase streams exports, so a query error can arrive as a 200/202 with a JSON body.
  const head = text.replace(/^﻿/, '').trimStart();
  if (head.startsWith('{')) {
    let err = head.slice(0, 300);
    try { const j = JSON.parse(head); err = j.error || j.message || err; } catch {}
    throw new Error(`query failed: ${String(err).slice(0, 300)}`);
  }
  if (!head.length) throw new Error('empty response');
  return { buf, rows: countRows(text) };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function prune(name) {
  if (!KEEP) return 0;
  const re = new RegExp(`^${escapeRe(name)}_\\d{4}-\\d{2}-\\d{2}T[\\d_.]+Z\\.csv$`);
  const files = readdirSync(OUT_DIR).filter((f) => re.test(f)).sort();
  const old = files.slice(0, Math.max(0, files.length - KEEP));
  for (const f of old) unlinkSync(join(OUT_DIR, f));
  return old.length;
}

// ── run ─────────────────────────────────────────────────────────────────────
log(`pulling ${questions.length} question(s) from ${BASE} → ${OUT_DIR}`);
const results = [];
const warnings = [];
try {
  await auth();
} catch (e) {
  fail(e.message);
}

for (const q of questions) {
  const t0 = Date.now();
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_WAITS.length; attempt++) {
    try {
      const { buf, rows } = await download(q);
      const file = `${q.name}_${stamp()}.csv`;
      const tmp = join(OUT_DIR, `.${file}.partial`);
      writeFileSync(tmp, buf);
      renameSync(tmp, join(OUT_DIR, file));
      const prev = state.questions[q.id]?.rows;
      if (prev > 100 && rows < prev * 0.5) {
        warnings.push(`${q.name}: ${rows.toLocaleString()} rows, down from ${prev.toLocaleString()} last pull`);
      }
      const removed = prune(q.name);
      state.questions[q.id] = { name: q.name, day: today, at: new Date().toISOString(), rows, file };
      saveState();
      results.push({ id: q.id, name: q.name, ok: true, rows, file, seconds: Math.round((Date.now() - t0) / 1000) });
      log(`✓ Q${q.id} ${q.name}: ${rows.toLocaleString()} rows → ${file}${removed ? ` (pruned ${removed} old)` : ''}`);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      const msg = e.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 60000} min` : e.cause?.code || e.message;
      log(`✗ Q${q.id} ${q.name} attempt ${attempt + 1}: ${msg}`);
      if (e.fatal || attempt === RETRY_WAITS.length) break;
      await sleep(RETRY_WAITS[attempt]);
    }
  }
  if (lastErr) {
    const msg = lastErr.name === 'TimeoutError' ? 'timed out' : lastErr.cause?.code || lastErr.message;
    results.push({ id: q.id, name: q.name, ok: false, error: msg });
  }
}

const failed = results.filter((r) => !r.ok);
writeFileSync(STATUS_FILE, JSON.stringify({ ranAt: new Date().toISOString(), outDir: OUT_DIR, ok: !failed.length, warnings, results }, null, 2));

for (const w of warnings) log(`⚠ ${w}`);
if (warnings.length) notify('Metabase pull: row count dropped', warnings.join('; '));

if (failed.length) {
  const msg = `${failed.length} of ${results.length} failed: ${failed.map((f) => `Q${f.id} (${f.error})`).join(', ')}`;
  console.error(`pull-metabase: ${msg}`);
  // Hourly retries: notify once per day, not every hour.
  if (state.notifiedDay !== today) {
    notify('Metabase pull failed', `${msg}${SCHEDULED ? ' — will retry hourly' : ''}`);
    state.notifiedDay = today;
    saveState();
  }
  process.exit(1);
}
log(`done: ${results.length} file(s) saved`);
