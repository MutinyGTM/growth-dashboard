// Installs (or removes) the macOS launchd job that runs the daily Metabase pull.
//
//   npm run install-metabase-schedule               install / update, then run once now
//   npm run install-metabase-schedule -- --uninstall
//   npm run install-metabase-schedule -- --print    show the plist, change nothing
//
// The job runs `node scripts/pull-metabase.mjs --scheduled`:
//   • every day at config.runAfter (local time) — if the Mac was asleep then,
//     macOS runs it on wake
//   • at login, and every hour — the script exits right away unless it's past
//     runAfter and some question hasn't had a good pull today. That covers a Mac
//     that was off at run time and retries failed questions.
// Log: ~/Library/Logs/growth-dashboard/metabase-pull.log

import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = 'com.mutiny.growth-dashboard.metabase-pull';
const PLIST = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const LOG_DIR = join(homedir(), 'Library/Logs/growth-dashboard');
const LOG = join(LOG_DIR, 'metabase-pull.log');
const DOMAIN = `gui/${userInfo().uid}`;
const args = process.argv.slice(2);

const config = JSON.parse(readFileSync(join(ROOT, 'config/metabase-exports.json'), 'utf8'));
const [hour, minute] = (config.runAfter || '07:30').split(':').map(Number);
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(process.execPath)}</string>
    <string>${xml(join(ROOT, 'scripts/pull-metabase.mjs'))}</string>
    <string>--scheduled</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(ROOT)}</string>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${xml(LOG)}</string>
  <key>StandardErrorPath</key><string>${xml(LOG)}</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
`;

if (args.includes('--print')) {
  console.log(plist);
  process.exit(0);
}

if (process.platform !== 'darwin') {
  console.error('install-metabase-schedule: run this on your Mac (launchd is macOS only).');
  process.exit(1);
}

const launchctl = (...a) => execFileSync('launchctl', a, { stdio: 'pipe' }).toString();
const bootout = () => { try { launchctl('bootout', `${DOMAIN}/${LABEL}`); } catch {} };

if (args.includes('--uninstall')) {
  bootout();
  if (existsSync(PLIST)) unlinkSync(PLIST);
  console.log(`Removed ${LABEL}. Downloaded CSVs were left in place.`);
  process.exit(0);
}

mkdirSync(dirname(PLIST), { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });
writeFileSync(PLIST, plist);
bootout();
launchctl('bootstrap', DOMAIN, PLIST); // RunAtLoad fires the first run now

const pad = (n) => String(n).padStart(2, '0');
console.log(`Installed ${LABEL}
  Runs daily at ${pad(hour)}:${pad(minute)} (this Mac's time zone), plus hourly catch-up and at login
  Saves to:  ${config.outDir}
  Node:      ${process.execPath}
  Log:       ${LOG}

It just started a first run. Watch it with:
  tail -f "${LOG}"

If the log says macOS blocked access to the folder: System Settings → Privacy &
Security → Full Disk Access → + → press Cmd+Shift+G, paste the Node path above,
add it, then run:  launchctl kickstart -k ${DOMAIN}/${LABEL}
`);
