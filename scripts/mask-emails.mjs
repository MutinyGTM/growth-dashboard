// Mask email addresses in the committed src/*.json files (Nick, Nov 22 2026).
//
// The repo and the GitHub Pages dashboard are public, so no real email address
// should be committed or shipped. Every email in these files becomes
//   first letter + "•••••" + @ + full domain   (jane.doe@acme.com → j•••••@acme.com)
// The fixed 5 dots hide the name's length; the domain stays so the internal /
// consolidation rules (by domain) keep working, and user links still open the
// admin profile by user id.
//
// Before masking a file, its unmasked copy is saved to data/unmasked/ (gitignored)
// so local scripts that match on emails (pull-posthog, ingest-signups,
// compare-orgs, flag-unusual) keep working via scripts/lib/read-src.mjs.
//
// Idempotent: a file already carrying _emailsMasked is skipped. Runs as the first
// step of `npm run build:nodata` (so locally before every commit in the refresh
// flow, and again in CI so the live site never shows a raw address).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { UNMASKED_DIR } from './lib/read-src.mjs';

const FILES = ['src/beta-signups.json', 'src/beta-signups-ph.json', 'src/beta-posthog.json', 'src/data.json'];
const RX = /(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/g;
export const maskEmail = (s) => s.replace(RX, '$1•••••@$2');

let total = 0;
for (const file of FILES) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  const j = JSON.parse(text);
  if (j._emailsMasked) { console.log(`mask-emails: ${file} already masked`); continue; }

  mkdirSync(UNMASKED_DIR, { recursive: true });
  writeFileSync(path.join(UNMASKED_DIR, path.basename(file)), text);

  let n = 0;
  const walk = (o) => {
    if (Array.isArray(o)) return o.map(walk);
    if (o && typeof o === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(o)) out[typeof k === 'string' ? maskEmail(k) : k] = walk(v);
      return out;
    }
    if (typeof o === 'string') { const m = maskEmail(o); if (m !== o) n += (o.match(RX) || []).length; return m; }
    return o;
  };
  const masked = { _emailsMasked: true, ...walk(j) };
  const pretty = /^\{\s*\n/.test(text);
  writeFileSync(file, (pretty ? JSON.stringify(masked, null, 2) : JSON.stringify(masked)) + (text.endsWith('\n') ? '\n' : ''));
  total += n;
  console.log(`mask-emails: ${file} — ${n} emails masked (unmasked copy in ${UNMASKED_DIR}/)`);
}

// Safety net: fail loudly if anything that looks like an email survived.
for (const file of FILES) {
  if (!existsSync(file)) continue;
  const left = readFileSync(file, 'utf8').match(RX);
  if (left) { console.error(`mask-emails: ${file} still has ${left.length} unmasked email(s), e.g. ${left[0].replace(/^(.).*@/, '$1…@')}`); process.exit(1); }
}
if (total) console.log(`mask-emails: done (${total} total)`);
