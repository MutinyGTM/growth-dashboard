#!/usr/bin/env node
// Unusual-activity check (Nick, Nov 22 2026: "make a note of any unusual activity
// and flag them for me when I go to refresh the data").
//
// Runs inside `npm run pull-data` after ingest-signups (also `npm run flag-unusual`).
// Reads the committed, already-ingested data only:
//   src/beta-signups.json   (sign up rows: d, uid, email, co, jx, nc)
//   src/beta-posthog.json   (PostHog Organization Created, with UTC timestamps)
//   src/framer.json         (daily website visitors)
//   src/multi-org-consolidate.json (domains Nick already told us to consolidate)
// Writes reports/unusual-activity.md (gitignored: it lists emails) and
// reports/unusual-activity.json (keys seen before → "NEW" marker), and prints a
// short summary. Never changes any dashboard data. Exit code is always 0.
//
// Checks (look-back LOOKBACK_DAYS, through the newest sign up day):
//  1. Multi-org: one person created 2+ companies (export rows or PostHog orgs).
//  2. Domain burst: 3+ different people from one non-freemail domain created /
//     started a company within 24h (joiners are skipped: teammates are normal).
//  3. Disposable or random-looking emails (e.g. i2299v2nl4i9l@…).
//  4. Time cluster: 4+ PostHog Organization Created within 60 minutes.
//  5. Daily spikes / drops vs the trailing 28-day median: sign ups, total users,
//     never completed, website visitors.
//  6. Joiner fan-in: 8+ people joined one company on one day (often a team
//     rollout — informational).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const LOOKBACK_DAYS = Number(process.env.UNUSUAL_LOOKBACK_DAYS || 14);
const readJson = (p, fallback = null) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };

const su = readJson('src/beta-signups.json', { signups: [] });
const ph = readJson('src/beta-posthog.json', { creators: [] });
const framer = readJson('src/framer.json', { daily: [] });
const cfg = readJson('src/multi-org-consolidate.json', { domains: [] });
const handledDomains = new Set((cfg.domains || []).map((x) => x.domain.toLowerCase()));

const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const et = (utc) => etFmt.format(new Date(utc));
const domainOf = (e) => (e || '').toLowerCase().split('@')[1] || '';
const localOf = (e) => (e || '').toLowerCase().split('@')[0] || '';

const rows = su.signups || [];
const lastDay = rows.reduce((m, s) => (s.d > m ? s.d : m), '');
if (!lastDay) { console.log('Unusual activity: no sign up rows, skipped.'); process.exit(0); }
const fromDay = addDays(lastDay, -(LOOKBACK_DAYS - 1));
const inLook = (d) => d >= fromDay && d <= lastDay;

const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'zoho.com', 'yandex.com', 'mail.com', 'hey.com', 'fastmail.com']);
const DISPOSABLE = /(^|\.)(euploading\.com|agentmail\.to|mail\.tm|mailinator\.|guerrillamail|sharklasers|10minutemail|tempmail|temp-mail|yopmail|trashmail|getnada|maildrop|dispostable|mohmal|emailnator|throwaway|fakeinbox|mailnesia|burnermail|spamgourmet|tmail|moakt|minuteinbox|emailondeck|mailpoof|tempr\.email|inboxkitten)/i;
// Security-testing words (Nov 12–15 2026: pentest-*, authzprobe, mutinyvictim-xss,
// mutiny-idorb, *@gmail.com.attacker.example, *@example.com).
const PROBE = /pentest|probe|xss|idor|sqli|attacker|victim|bugbounty|bug-bounty|hackerone|bugcrowd|intigriti|burp|interactsh|oast|payload|@example\.(com|org|net)$|\.example$|\.invalid$|\.test$|\.local$|\.evil\.com$|@(gmail|mutiny|mutinyhq)\.[a-z.]+\.[a-z]+$/i;
// Random-looking local part: long, letters+digits mixed, no separators, few vowels.
const randomLocal = (l) => {
  if (l.length < 10 || /[._+-]/.test(l)) return false;
  const digits = (l.match(/\d/g) || []).length;
  const letters = l.replace(/[^a-z]/g, '');
  const vowels = (letters.match(/[aeiou]/g) || []).length;
  const switches = (l.match(/[a-z]\d|\d[a-z]/g) || []).length;
  return digits >= 3 && switches >= 3 && letters.length > 0 && vowels / letters.length < 0.35;
};

const flags = []; // { key, severity: 'high'|'medium'|'info', check, title, detail[], handled? }
const add = (f) => flags.push(f);

// --- 1. Multi-org --------------------------------------------------------------
const byUid = new Map();
for (const s of rows) if (s.uid && !s.jx && inLook(s.d)) (byUid.get(s.uid) || byUid.set(s.uid, []).get(s.uid)).push(s);
const phByUid = new Map((ph.creators || []).map((c) => [c.uid, c]));
const multiSeen = new Set();
for (const [uid, g] of byUid) {
  const cos = new Set(g.filter((s) => s.co).map((s) => s.co));
  const phOrgs = (phByUid.get(uid)?.orgs || []).filter((o) => o.utc && inLook(o.utc.slice(0, 10)));
  const n = Math.max(cos.size, phOrgs.length);
  if (n < 2) continue;
  multiSeen.add(uid);
  const email = g[0].email || phByUid.get(uid)?.email || uid;
  const handled = handledDomains.has(domainOf(email));
  add({
    key: `multi:${uid}:${n}`, severity: n >= 3 ? 'high' : 'medium', check: 'Multi-org', handled,
    title: `${email} created ${n} companies (${[...new Set(g.map((s) => s.d))].join(', ')})`,
    detail: [`Total users counts ${cos.size} org-creator rows; Sign ups counts 1.${handled ? ' Already consolidated (domain in src/multi-org-consolidate.json).' : ' Consolidate? Add the domain to src/multi-org-consolidate.json.'}`],
  });
}
for (const c of ph.creators || []) {
  if (multiSeen.has(c.uid) || (c.orgs || []).length < 2) continue;
  const inWin = c.orgs.filter((o) => inLook(o.utc.slice(0, 10)));
  if (inWin.length < 2) continue;
  add({ key: `multi-ph:${c.uid}:${inWin.length}`, severity: 'medium', check: 'Multi-org', handled: handledDomains.has(domainOf(c.email)),
    title: `${c.email} fired Organization Created for ${inWin.length} companies in PostHog`, detail: inWin.map((o) => `${et(o.utc)} ET · company ${o.co}`) });
}

// --- 2. Domain burst -------------------------------------------------------------
// Use PostHog timestamps where we have them, else the export day.
const starts = [];
for (const c of ph.creators || []) if (c.orgUtc && inLook(c.orgUtc.slice(0, 10))) starts.push({ email: c.email, t: Date.parse(c.orgUtc), label: `${et(c.orgUtc)} ET` });
const phEmails = new Set(starts.map((x) => (x.email || '').toLowerCase()));
for (const s of rows) if (!s.jx && s.email && inLook(s.d) && !phEmails.has(s.email.toLowerCase())) starts.push({ email: s.email, t: Date.parse(`${s.d}T12:00:00Z`), label: `${s.d}${s.nc ? ' (never completed)' : ''}` });
const byDomain = new Map();
for (const x of starts) { const dm = domainOf(x.email); if (!dm || FREEMAIL.has(dm)) continue; (byDomain.get(dm) || byDomain.set(dm, []).get(dm)).push(x); }
for (const [dm, list] of byDomain) {
  list.sort((a, b) => a.t - b.t);
  let best = [];
  for (let i = 0; i < list.length; i++) {
    const win = list.filter((x) => x.t >= list[i].t && x.t - list[i].t <= 24 * 3600e3);
    const people = new Set(win.map((x) => x.email.toLowerCase()));
    if (people.size > new Set(best.map((x) => x.email.toLowerCase())).size) best = win;
  }
  const people = [...new Set(best.map((x) => x.email.toLowerCase()))];
  if (people.length < 3) continue;
  add({ key: `domain:${dm}:${people.length}`, severity: people.length >= 5 || DISPOSABLE.test(dm) ? 'high' : 'medium', check: 'Domain burst', handled: handledDomains.has(dm),
    title: `${people.length} people from @${dm} started companies within 24h`,
    detail: best.map((x) => `${x.label} · ${x.email}`) });
}

// --- 3. Disposable / random-looking emails ------------------------------------
const odd = new Map();
for (const s of rows) {
  if (!s.email || !inLook(s.d)) continue;
  const dm = domainOf(s.email); const l = localOf(s.email);
  const why = PROBE.test(s.email) ? 'security-test-looking address'
    : DISPOSABLE.test(dm) ? 'disposable domain' : randomLocal(l) ? 'random-looking address' : null;
  if (!why) continue;
  const k = s.email.toLowerCase();
  const o = odd.get(k) || { email: s.email, why, days: new Set(), rows: 0, jx: 0, nc: 0 };
  o.days.add(s.d); o.rows += 1; o.jx += s.jx ? 1 : 0; o.nc += s.nc ? 1 : 0; odd.set(k, o);
}
const oddByDomain = new Map();
for (const o of odd.values()) { const dm = domainOf(o.email); (oddByDomain.get(dm) || oddByDomain.set(dm, []).get(dm)).push(o); }
for (const [dm, list] of oddByDomain) {
  const probe = list.filter((o) => o.why.startsWith('security'));
  const kind = probe.length ? 'security-test-looking' : list[0].why === 'disposable domain' ? 'disposable-domain' : 'random-looking';
  add({ key: `odd:${dm}:${list.length}`, severity: list.length >= 3 || kind !== 'random-looking' ? 'high' : 'medium', check: probe.length ? 'Security testing?' : 'Suspicious emails', handled: handledDomains.has(dm),
    title: `${list.length} ${kind} address${list.length === 1 ? '' : 'es'} @${dm}${probe.length ? ' — tell eng/security' : ''}`,
    detail: list.map((o) => `${o.email} · ${[...o.days].join(', ')} · ${o.rows} row${o.rows === 1 ? '' : 's'}${o.nc ? `, ${o.nc} never completed` : ''}${o.jx ? `, ${o.jx} joiner` : ''}`) });
}

// --- 4. Time cluster (PostHog Organization Created) -----------------------------
const phTimes = (ph.creators || []).filter((c) => c.orgUtc && inLook(c.orgUtc.slice(0, 10))).map((c) => ({ t: Date.parse(c.orgUtc), c })).sort((a, b) => a.t - b.t);
const clusterSeen = new Set();
for (let i = 0; i < phTimes.length; i++) {
  const win = phTimes.filter((x) => x.t >= phTimes[i].t && x.t - phTimes[i].t <= 3600e3);
  if (win.length < 4 || win.some((x) => clusterSeen.has(x.c.uid))) continue;
  win.forEach((x) => clusterSeen.add(x.c.uid));
  const doms = new Set(win.map((x) => domainOf(x.c.email)));
  add({ key: `cluster:${new Date(phTimes[i].t).toISOString().slice(0, 13)}:${win.length}`, severity: doms.size === 1 ? 'high' : 'medium', check: 'Time cluster',
    handled: doms.size === 1 && handledDomains.has([...doms][0]),
    title: `${win.length} Organization Created within an hour from ${et(phTimes[i].t)} ET (${doms.size} domain${doms.size === 1 ? '' : 's'})`,
    detail: win.map((x) => `${et(x.t)} ET · ${x.c.email}`) });
}

// --- 5. Daily spikes / drops ----------------------------------------------------
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const seriesCheck = (name, byDay, last, { floor, dropToo = false, who = null }) => {
  for (let d = fromDay; d <= last; d = addDays(d, 1)) {
    const hist = []; for (let k = 1; k <= 28; k++) hist.push(byDay[addDays(d, -k)] || 0);
    const med = median(hist); const v = byDay[d] || 0;
    if (v >= floor && v >= 3 * Math.max(med, 1)) {
      // Which domains made up the spike day.
      const doms = who ? Object.entries(count(who(d).map(domainOf))).sort((a, b) => b[1] - a[1]) : [];
      add({ key: `spike:${name}:${d}`, severity: v >= 5 * Math.max(med, 1) ? 'high' : 'medium', check: 'Daily spike', title: `${name} ${d}: ${v} vs ~${med} typical (28-day median)`,
        detail: doms.length ? [`By domain: ${doms.map(([k, n]) => `${k || '(no email)'} ${n}`).join(', ')}`] : [] });
    }
    if (dropToo && med >= 50 && v < 0.3 * med) add({ key: `drop:${name}:${d}`, severity: 'medium', check: 'Daily drop', title: `${name} ${d}: ${v} vs ~${med} typical — tracking break or export gap?`, detail: [] });
  }
};
const count = (list) => list.reduce((m, d) => { m[d] = (m[d] || 0) + 1; return m; }, {});
const phSignupDays = count((ph.creators || []).filter((c) => !c.viaExport && c.org).map((c) => c.org.slice(0, 10)));
seriesCheck('Sign ups (PostHog Org Created)', phSignupDays, lastDay, { floor: 8, who: (d) => (ph.creators || []).filter((c) => !c.viaExport && c.org?.slice(0, 10) === d).map((c) => c.email) });
seriesCheck('Total users', count(rows.filter((s) => !s.nc).map((s) => s.d)), lastDay, { floor: 12, who: (d) => rows.filter((s) => !s.nc && s.d === d).map((s) => s.email) });
seriesCheck('Never completed', count(rows.filter((s) => s.nc).map((s) => s.d)), lastDay, { floor: 6, who: (d) => rows.filter((s) => s.nc && s.d === d).map((s) => s.email) });
const visitors = Object.fromEntries((framer.daily || []).map((x) => [x.d, x.visitors]));
const lastVisitDay = (framer.daily || []).reduce((m, x) => (x.d > m ? x.d : m), '');
// Framer's newest day is usually partial — skip it.
if (lastVisitDay) seriesCheck('Website visitors (Framer)', visitors, addDays(lastVisitDay, -1), { floor: 300, dropToo: true });

// --- 6. Joiner fan-in -------------------------------------------------------------
const fan = new Map();
for (const s of rows) if (s.jx && s.co && inLook(s.d)) { const k = `${s.d}|${s.co}`; fan.set(k, (fan.get(k) || 0) + 1); }
for (const [k, n] of fan) if (n >= 8) {
  const [d, co] = k.split('|');
  const emails = rows.filter((s) => s.jx && s.co === co && s.d === d).map((s) => s.email).filter(Boolean);
  add({ key: `fan:${k}:${n}`, severity: 'info', check: 'Joiner fan-in', title: `${n} people joined one company on ${d} (${domainOf(emails[0]) || co})`, detail: ['Usually a team rollout; check it is a real customer.'] });
}

// --- Output -----------------------------------------------------------------------
mkdirSync('reports', { recursive: true });
const prev = readJson('reports/unusual-activity.json', { keys: [] });
const prevKeys = new Set(prev.keys || []);
const sevOrder = { high: 0, medium: 1, info: 2 };
flags.forEach((f) => { f.isNew = !prevKeys.has(f.key); });
flags.sort((a, b) => (a.handled - b.handled) || (sevOrder[a.severity] - sevOrder[b.severity]) || (b.isNew - a.isNew));
const open = flags.filter((f) => !f.handled);
const md = [
  `# Unusual activity — ${fromDay} → ${lastDay}`,
  '',
  `Generated ${new Date().toISOString()} by scripts/flag-unusual-activity.mjs. Local only (lists emails). Nothing here changes the dashboard; consolidations / exclusions happen only when Nick approves.`,
  '',
  `**${open.length} open flag${open.length === 1 ? '' : 's'}** (${open.filter((f) => f.isNew).length} new since last refresh) · ${flags.length - open.length} already handled.`,
  '',
  ...flags.flatMap((f) => [
    `## ${f.handled ? '✅ handled · ' : ''}${f.severity.toUpperCase()}${f.isNew ? ' · NEW' : ''} · ${f.check}: ${f.title}`,
    ...f.detail.map((x) => `- ${x}`),
    '',
  ]),
  flags.length ? '' : '_Nothing unusual._',
].join('\n');
writeFileSync('reports/unusual-activity.md', md);
writeFileSync('reports/unusual-activity.json', JSON.stringify({ generatedAt: new Date().toISOString(), fromDay, lastDay, keys: flags.map((f) => f.key), flags }, null, 2));

console.log(`Unusual activity ${fromDay} → ${lastDay}: ${open.length} open flag(s), ${open.filter((f) => f.isNew).length} new, ${flags.length - open.length} handled → reports/unusual-activity.md`);
for (const f of open.slice(0, 12)) console.log(`  ${f.isNew ? 'NEW ' : '    '}[${f.severity}] ${f.check}: ${f.title}`);
process.exit(0);
