// Read a src/*.json file with its real email addresses.
//
// The committed src/*.json files have emails masked (j•••••@acme.com) by
// scripts/mask-emails.mjs, which keeps the unmasked copy in data/unmasked/
// (gitignored, local only). Scripts that match or report on emails read through
// this helper:
//   - a freshly written file (no _emailsMasked flag) is already raw → used as is;
//   - a masked file → its data/unmasked/ copy, if this machine has one;
//   - otherwise the masked file (fresh clone / CI) — emails are masked there.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const UNMASKED_DIR = 'data/unmasked';

export function readSrcJson(file, fallback) {
  let j;
  try { j = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { if (fallback !== undefined) return fallback; throw e; }
  if (!j || !j._emailsMasked) return j;
  const raw = path.join(path.dirname(file), '..', UNMASKED_DIR, path.basename(file));
  if (existsSync(raw)) {
    try { return JSON.parse(readFileSync(raw, 'utf8')); } catch { /* fall through to masked */ }
  }
  return j;
}
