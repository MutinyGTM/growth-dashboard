// ---------------------------------------------------------------------------
// Peec visibility cards for the bottom of ?aeo (Nick, Nov 4 2026).
//
// Same card as the old "AEO Visibility · Peec AI" section on ?original
// (topic pills that toggle both charts, Visibility · daily on the left,
// mutinyhq.com retrievals · daily on the right), but driven by a dataset prop
// so it renders twice:
//   * data/peec.json    — FROZEN old prompt set (Apr 23 → Oct 27 2026)
//   * data/peec-v2.json — new prompt set since the Oct 28 reset (daily refresh
//                         appends here; see memory growth-dashboard-peec-v2-split)
// Both files share one schema: { windowStart, windowEnd, topics[], daily[],
// brandDailyStats[], sources.mutinyhq.{daily[], dailyStats[]} }.
// Stats are summed raw counts over the whole series (not averaged daily ratios).
// ---------------------------------------------------------------------------
import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ChevronDown, Calendar, Eye, Info } from 'lucide-react';

const C = {
  purple: '#A73BF5', green: '#B2FF14', red: '#FB5A3D', blue: '#96ECFF',
  darkBlue: '#2F6FED', lightPurple: '#F2D1FC', lightRed: '#FF9987', amber: '#E0A800', teal: '#1F9E8F',
  black: '#000000', white: '#FFFFFF', lightGrey: '#CFCFCF', muted: 'rgba(0,0,0,0.55)',
};
const FONT_DISPLAY = "'Fraunces', 'Reckless Condensed S', Georgia, serif";
const FONT_BODY = "'Manrope', 'KMR Waldenburg', Arial, sans-serif";
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const md = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${MON[m - 1]} ${d}`; };

// Topic → line color. Old set matches the ?original chart; new set uses
// saturated colors (the ?aeo topic pastels are too faint as lines on white).
export const PEEC_V1_COLORS = {
  'Competitor Comparisons': C.green,
  'ABM':                    '#EC4899',
  'Modern GTM tech stack':  C.blue,
  'AI Sales Tools':         C.red,
  'AI Sales Enablement':    C.lightRed,
  'Outbound tools':         C.lightPurple,
};
export const PEEC_V2_COLORS = {
  'Sales Enablement':                  '#EC4899',
  'Sales Presentations and Proposals': C.darkBlue,
  'Digital Sales Rooms':               C.green,
  'AI GTM Stack':                      C.amber,
  'Sales Call Notes and Recording':    C.red,
  'AI Sales Assistants':               C.teal,
};

// Same tick helper as ?original, but allows sub-1 steps so the new set's
// ~2% visibility doesn't flatten onto a 0–5 integer axis.
function niceTicks(maxValue, preferredCount = 5) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return { ticks: [0, 1, 2, 3, 4, 5], max: 5 };
  const rough = maxValue / preferredCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  let step = 10 * mag;
  for (const c of [1, 2, 5, 10]) { if (c * mag >= rough) { step = c * mag; break; } }
  const max = (Math.floor(maxValue / step) + 1) * step;
  const ticks = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(+v.toFixed(6));
  return { ticks, max: +max.toFixed(6) };
}

// --- Date filter (Nick, Nov 4): Amplitude-style Granularity + Date range, per
// card, like the beta controls bar (which ?aeo hides). Ranges end on the
// card's last day of data. Deltas compare with the same number of days just
// before, shown only when that prior period is fully inside the data.
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const PEEC_GRAINS = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
export const PEEC_RANGES = [
  ['all', 'All data'], ['7d', 'Last 7 days'], ['14d', 'Last 14 days'], ['30d', 'Last 30 days'],
  ['60d', 'Last 60 days'], ['90d', 'Last 90 days'], ['custom', 'Custom range…'],
];
function resolveWindow(peec, range, custom) {
  const days = peec?.daily || [];
  if (!days.length) return null;
  const first = days[0].date, last = days[days.length - 1].date;
  let start = first, end = last;
  if (range === 'custom') {
    const clamp = (iso, d) => (!iso ? d : iso < first ? first : iso > last ? last : iso);
    start = clamp(custom?.from, first);
    end = clamp(custom?.to, last);
    if (start > end) [start, end] = [end, start];
  } else if (range !== 'all') {
    const n = parseInt(range, 10);
    start = addDays(last, -(n - 1));
    if (start < first) start = first;
  }
  const n = daysBetween(start, end) + 1;
  const prevEnd = addDays(start, -1), prevStart = addDays(start, -n);
  return { first, last, start, end, n, prev: prevStart >= first ? { start: prevStart, end: prevEnd } : null };
}
const mondayOf = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const bucketKey = (iso, grain) => (grain === 'week' ? mondayOf(iso) : grain === 'month' ? iso.slice(0, 7) : iso);

// Raw-count totals for a date window (sum counts, then divide).
function windowTotals(peec, startISO, endISO) {
  const inR = (r) => r.date >= startISO && r.date <= endISO;
  const b = (peec.brandDailyStats || []).filter(inR).reduce((a, r) => ({ c: a.c + r.visCount, t: a.t + r.visTotal }), { c: 0, t: 0 });
  // Retrievals = Peec's retrieved_chat_count (sources.daily Total), summed;
  // retrieved % = that ÷ total chats (brandDailyStats.visTotal). Matches the
  // Domains table's Retrievals / Retrieved columns for the same dates + topics.
  const ret = (peec.sources?.mutinyhq?.daily || []).filter(inR).reduce((a, r) => a + (r.Total ?? 0), 0);
  return {
    visPct: b.t > 0 ? (b.c / b.t) * 100 : null,
    retrievedPct: b.t > 0 ? (ret / b.t) * 100 : null,
    retrievals: ret,
  };
}

// Daily → grain buckets. Visibility and retrieved % sum the bucket's raw
// counts then divide; topic visibility averages the daily topic ratios (no
// per-topic daily denominators); mentions sum.
function buildSeries(peec, colors, W, grain) {
  const topics = (peec?.topics || []).map((t) => {
    const first = (peec.daily || []).find((r) => r[t.name] != null)?.date;
    const lateStart = first && (peec.daily || []).some((r) => r[t.name] === null);
    return { ...t, color: colors[t.name] || C.lightGrey, note: lateStart ? `tracked from ${md(first)}` : undefined };
  });
  const inW = (r) => r.date >= W.start && r.date <= W.end;
  const brandBy = Object.fromEntries((peec.brandDailyStats || []).map((r) => [r.date, r]));
  const srcBy = Object.fromEntries((peec.sources?.mutinyhq?.daily || []).map((r) => [r.date, r.Total ?? 0]));
  const r2 = (v) => +v.toFixed(2);
  const mean = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : null);

  const buckets = new Map();
  for (const r of (peec.daily || []).filter(inW)) {
    const k = bucketKey(r.date, grain);
    if (!buckets.has(k)) buckets.set(k, { key: k, days: [] });
    buckets.get(k).days.push(r);
  }
  const rows = [];
  for (const bk of buckets.values()) {
    const first = bk.days[0].date, last = bk.days[bk.days.length - 1].date;
    const b = bk.days.reduce((a, r) => { const x = brandBy[r.date]; return x ? { c: a.c + x.visCount, t: a.t + x.visTotal, m: a.m + x.mentions } : a; }, { c: 0, t: 0, m: 0 });
    const ret = bk.days.reduce((a, r) => a + (srcBy[r.date] || 0), 0);
    const vis = b.t > 0 ? (b.c / b.t) * 100 : (() => { const m = mean(bk.days.map((r) => r.visibility).filter((x) => x != null)); return m == null ? null : m * 100; })();
    const row = {
      x: grain === 'month' ? `${MON[+bk.key.slice(5, 7) - 1]} ${bk.key.slice(0, 4)}` : dm(grain === 'week' ? bk.key : first),
      head: grain === 'day' ? first : `${dm(first)} – ${dm(last)}${grain === 'week' && bk.days.length < 7 ? ' (partial week)' : ''}`,
      visibility: vis == null ? null : r2(vis),
      mentions: b.m,
      source: b.t > 0 ? r2((ret / b.t) * 100) : null,
    };
    for (const t of topics) { const m = mean(bk.days.map((r) => r[t.name]).filter((x) => x != null)); row[t.name] = m == null ? null : r2(m * 100); }
    rows.push(row);
  }
  const cur = windowTotals(peec, W.start, W.end);
  const prev = W.prev ? windowTotals(peec, W.prev.start, W.prev.end) : null;
  return { topics, rows, cur, prev, windowLabel: `${md(W.start)} – ${md(W.end)}, ${W.end.slice(0, 4)}`, nDays: W.n };
}

// Peec-style chart palette (light, neutral), Nick Nov 4: "I want my charts to be like this".
const P = {
  line: '#A855F7', source: '#8E8E8E', grid: '#ECECEC', axis: '#7A7A7A', border: '#E6E6E6',
  panel: '#FFFFFF', soft: '#F5F5F5', text: '#1F1F1F', sub: '#7A7A7A',
};
const dm = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${String(d).padStart(2, '0')} ${MON[m - 1]}`; };

// Right axis shares the left axis's number of intervals so gridlines line up
// (Peec: 0–3% on the left, 6–12% on the right). Not zero-based.
function alignedTicks(min, max, k) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [0, 1], domain: [0, 1] };
  if (max - min < 1e-9) { min = Math.max(0, min - 1); max += 1; }
  const mag = Math.pow(10, Math.floor(Math.log10((max - min) / k)));
  for (const m of [mag, mag * 10]) for (const c of [1, 2, 2.5, 5, 10]) {
    const step = c * m; const lo = Math.max(0, Math.floor(min / step) * step);
    if (lo + k * step >= max) { const ticks = Array.from({ length: k + 1 }, (_, i) => +(lo + i * step).toFixed(6)); return { ticks, domain: [ticks[0], ticks[k]] }; }
  }
  return { ticks: [min, max], domain: [min, max] };
}

function FilterSelect({ label, value, onChange, options, icon }) {
  return (
    <label title={label} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', background: P.panel, border: `1px solid ${P.border}`, borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
      {icon && <span aria-hidden style={{ position: 'absolute', left: 10, display: 'inline-flex', pointerEvents: 'none', color: P.sub }}>{icon}</span>}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ appearance: 'none', WebkitAppearance: 'none', border: 'none', background: 'transparent', fontFamily: FONT_BODY, fontSize: 13.5, fontWeight: 600, color: P.text, padding: `6px 30px 6px ${icon ? 32 : 12}px`, cursor: 'pointer', borderRadius: 8 }}>
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
      <ChevronDown size={14} aria-hidden style={{ position: 'absolute', right: 10, pointerEvents: 'none', color: P.sub }} />
    </label>
  );
}
const dateInput = { fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, color: P.text, border: `1px solid ${P.border}`, borderRadius: 8, padding: '5px 8px', background: P.panel };

function GrainToggle({ value, onChange }) {
  return (
    <div role="group" aria-label="Granularity" style={{ display: 'inline-flex', background: P.soft, borderRadius: 8, padding: 2, gap: 2 }}>
      {Object.entries(PEEC_GRAINS).map(([id, label]) => {
        const on = value === id;
        return (
          <button key={id} type="button" title={label} aria-pressed={on} onClick={() => onChange(id)}
            style={{ all: 'unset', cursor: 'pointer', minWidth: 26, textAlign: 'center', padding: '4px 6px', borderRadius: 6, fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 700, color: on ? P.text : '#A0A0A0', background: on ? P.panel : 'transparent', boxShadow: on ? '0 1px 2px rgba(0,0,0,0.12)' : 'none' }}>
            {label[0]}
          </button>
        );
      })}
    </div>
  );
}

function DeltaChip({ cur, prev, kind }) {
  if (cur == null || prev == null) return null;
  const d = kind === 'pts' ? cur - prev : prev ? ((cur - prev) / prev) * 100 : null;
  if (d == null) return null;
  const flat = Math.abs(d) < 0.05;
  return (
    <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 700, color: flat ? P.sub : d > 0 ? '#1E8A3A' : '#E0401F', whiteSpace: 'nowrap' }}>
      {flat ? 'flat' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}${kind === 'pts' ? ' pts' : '%'}`}
    </span>
  );
}

// Hover/focus explanations (Nick, Nov 4: "when I hover over things like Chats
// retrieving mutinyhq.com, explain what they mean"). Fixed-position popover so
// it isn't clipped by scrolling table wrappers.
export const PEEC_HELP = {
  visibility: {
    title: 'Visibility',
    body: 'Share of AI answers that name Mutiny. Peec runs our tracked buyer prompts every day in ChatGPT, Google AI Overview and Perplexity; this is answers naming Mutiny ÷ all answers in the selected dates.',
    why: 'Being named is what puts Mutiny on a buyer\'s shortlist. It\'s the hardest number to move.',
  },
  source: {
    title: 'Used as a source',
    body: 'Share of AI chats that read at least one mutinyhq.com page while building the answer (Peec calls this "retrieved"). It counts even if the answer doesn\'t name Mutiny.',
    why: 'AI has to read us before it can link or name us, so this usually moves first.',
  },
  chats: {
    title: 'Chats retrieving mutinyhq.com',
    body: 'Number of AI chats in the selected dates that read at least one mutinyhq.com page. A chat counts once however many of our pages it read. Same number as the Retrievals column in Peec\'s Domains table, once Peec is filtered to the same dates and our 6 topics.',
    why: 'The raw volume behind "Used as a source". It grows when more prompts pull our pages.',
  },
  mentions: {
    title: 'Mentions',
    body: 'Total times Mutiny is named across AI answers. One answer can name Mutiny more than once, so this can be higher than the number of answers naming us.',
  },
  citations: {
    title: 'mutinyhq.com citations',
    body: 'Times an AI answer linked a mutinyhq.com page inside the answer itself. Reading a page (used as a source) is step one; linking it is step two.',
    why: 'A link sends the reader to our page and signals AI trusts it.',
  },
  rank: {
    title: 'Rank',
    body: 'Mutiny\'s position among all brands Peec tracks for this prompt set, ordered by visibility. Peec gives this for all data only, so it doesn\'t follow the date filter.',
  },
  leader: {
    title: 'Leader',
    body: 'The tracked brand AI names most often, with its visibility. It\'s the bar to clear. All data only.',
  },
  topic: {
    title: 'Topic visibility',
    body: 'Share of answers to this topic\'s prompts that name Mutiny, averaged over the days. Topics name different numbers of brands, so compare a topic with its own baseline, not with other topics.',
  },
};

export function Help({ k, children, style }) {
  const h = typeof k === 'string' ? PEEC_HELP[k] : k;
  const ref = React.useRef(null);
  const [pos, setPos] = useState(null);
  if (!h) return children;
  const show = () => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const w = 300, left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 8 + 170 < window.innerHeight;
    setPos({ left, top: below ? r.bottom + 6 : undefined, bottom: below ? undefined : window.innerHeight - r.top + 6, w });
  };
  return (
    <span ref={ref} tabIndex={0} onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'help', outline: 'none', ...style }}>
      {children}
      <Info size={13} strokeWidth={2.2} aria-hidden style={{ color: '#A0A0A0', flexShrink: 0 }} />
      {pos && (
        <span role="tooltip" style={{ position: 'fixed', zIndex: 2000, left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.w, background: P.panel, border: `1px solid ${P.border}`, borderRadius: 10, padding: '10px 12px', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', fontFamily: FONT_BODY, fontSize: 12.5, lineHeight: 1.5, color: P.text, fontWeight: 400, textAlign: 'left', whiteSpace: 'normal', letterSpacing: 0, textTransform: 'none', pointerEvents: 'none' }}>
          <span style={{ display: 'block', fontWeight: 700, marginBottom: 3 }}>{h.title}</span>
          {h.body}
          {h.why && <span style={{ display: 'block', marginTop: 6, color: P.sub }}><b style={{ color: P.text }}>Why it matters:</b> {h.why}</span>}
        </span>
      )}
    </span>
  );
}

function Kpis({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
      {items.map((it) => (
        <div key={it.label} style={{ border: `1px solid ${P.border}`, borderRadius: 10, padding: '10px 14px', background: P.panel }}>
          <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: P.sub, fontWeight: 600 }}><Help k={it.help}>{it.label}</Help></div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: FONT_BODY, fontSize: 22, fontWeight: 700, color: P.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{it.value}</span>
            {it.delta}
          </div>
        </div>
      ))}
    </div>
  );
}

function InsightTooltip({ active, payload, metric, topicLines }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const fmtL = (v) => (v == null ? '·' : metric === 'visibility' ? `${v.toFixed(1)}%` : v.toLocaleString());
  const Swatch = ({ color, dashed }) => <span style={{ width: 14, height: 0, borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`, flexShrink: 0 }} />;
  const Row = ({ color, dashed, name, value, bold }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
      <Swatch color={color} dashed={dashed} />
      <span style={{ flex: 1, fontWeight: bold ? 600 : 500 }}>{name}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, marginLeft: 16 }}>{value}</span>
    </div>
  );
  return (
    <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 10, padding: '12px 14px', fontFamily: FONT_BODY, fontSize: 13, color: P.text, minWidth: 250, boxShadow: '0 6px 20px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight: 600 }}>{row.head}</div>
      <Row color={P.line} name={metric === 'visibility' ? 'Visibility' : 'Mentions'} value={fmtL(row[metric])} bold />
      {metric === 'visibility' && topicLines.map((t) => <Row key={t.name} color={t.color} name={t.name} value={fmtL(row[t.name])} />)}
      <div style={{ borderTop: `1px solid ${P.border}`, margin: '10px 0 2px' }} />
      <div style={{ color: P.sub, fontSize: 12 }}>Used as a source</div>
      <Row color={P.source} dashed name="mutinyhq.com" value={row.source == null ? '·' : `${row.source.toFixed(1)}%`} bold />
    </div>
  );
}

// Axis titles (Nick, Nov 4: "make the chart taller and clearly label the axis").
// Each axis gets a rotated title in its line's colour, plus a key above the
// chart saying which line reads off which side.
const AXIS_TEXT = {
  visibility: { title: 'Visibility (% of AI answers)', key: 'Visibility', sub: '% of AI answers that name Mutiny' },
  mentions: { title: 'Mentions (count)', key: 'Mentions', sub: 'times AI answers named Mutiny' },
  source: { title: 'Used as a source (% of chats)', key: 'Used as a source', sub: '% of AI chats that read a mutinyhq.com page' },
};
const X_TITLE = { day: 'Date', week: 'Week starting (Mon)', month: 'Month' };

function AxisTitle({ viewBox, text, color, side }) {
  if (!viewBox) return null;
  const { x, y, width, height } = viewBox;
  const cx = side === 'left' ? x + 12 : x + width - 12;
  const cy = y + height / 2;
  return (
    <text x={cx} y={cy} transform={`rotate(${side === 'left' ? -90 : 90}, ${cx}, ${cy})`} textAnchor="middle" dominantBaseline="central"
      style={{ fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 700, fill: color }}>{text}</text>
  );
}

function InsightChart({ rows, metric, topicLines, grain = 'day' }) {
  const leftKeys = [metric, ...(metric === 'visibility' ? topicLines.map((t) => t.name) : [])];
  const leftVals = rows.flatMap((r) => leftKeys.map((k) => r[k]).filter((v) => v != null));
  const L = niceTicks(leftVals.length ? Math.max(...leftVals) : 1, 5);
  const srcVals = rows.map((r) => r.source).filter((v) => v != null);
  const R = alignedTicks(Math.min(...srcVals), Math.max(...srcVals), L.ticks.length - 1);
  const tick = { fontFamily: FONT_BODY, fontSize: 12.5, fill: P.axis };
  const fmtLeft = (v) => (metric === 'visibility' ? `${+v.toFixed(2)}%` : v.toLocaleString());
  const AL = AXIS_TEXT[metric], AR = AXIS_TEXT.source;
  const Key = ({ color, dashed, t, side, align }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: align, minWidth: 0 }}>
      {align === 'flex-end' && <span style={{ fontSize: 12, color: P.sub }}>{side} axis →</span>}
      {align !== 'flex-end' && <span style={{ fontSize: 12, color: P.sub }}>← {side} axis</span>}
      <span style={{ width: 18, height: 0, borderTop: `2.5px ${dashed ? 'dashed' : 'solid'} ${color}`, flexShrink: 0 }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: P.text }}>{t.key}</span>
      <span style={{ fontSize: 12, color: P.sub }}>{t.sub}</span>
    </div>
  );
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px 16px', flexWrap: 'wrap', padding: '0 8px 8px' }}>
        <Key color={P.line} t={AL} side="Left" align="flex-start" />
        <Key color={P.source} dashed t={AR} side="Right" align="flex-end" />
      </div>
      <div style={{ width: '100%', height: 440 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 12, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid vertical={false} stroke={P.grid} strokeDasharray="4 4" />
            <XAxis dataKey="x" axisLine={{ stroke: '#D9D9D9' }} tickLine={false} tick={tick} interval="preserveStartEnd" minTickGap={28} height={52} padding={{ left: 12, right: 12 }}
              label={{ value: X_TITLE[grain], position: 'insideBottom', offset: 2, style: { fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 700, fill: P.sub } }} />
            <YAxis yAxisId="L" axisLine={false} tickLine={false} tick={tick} tickFormatter={fmtLeft} domain={[0, L.max]} ticks={L.ticks} width={78}
              label={(p) => <AxisTitle {...p} text={AL.title} color={P.line} side="left" />} />
            <YAxis yAxisId="R" orientation="right" axisLine={false} tickLine={false} tick={tick} tickFormatter={(v) => `${+v.toFixed(2)}%`} domain={R.domain} ticks={R.ticks} width={78}
              label={(p) => <AxisTitle {...p} text={AR.title} color="#6B6B6B" side="right" />} />
            <Tooltip cursor={{ stroke: '#D4D4D4', strokeWidth: 1 }} content={(p) => <InsightTooltip {...p} metric={metric} topicLines={topicLines} />} />
            {metric === 'visibility' && topicLines.map((t) => (
              <Line key={t.name} yAxisId="L" type="monotone" dataKey={t.name} stroke={t.color} strokeWidth={1.5} strokeOpacity={0.85} dot={false} activeDot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
            ))}
            <Line yAxisId="R" type="monotone" dataKey="source" stroke={P.source} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: P.source, stroke: P.source }} activeDot={{ r: 5, fill: P.source, stroke: '#fff', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
            <Line yAxisId="L" type="monotone" dataKey={metric} stroke={P.line} strokeWidth={2.5} dot={{ r: 3.5, fill: P.line, stroke: P.line }} activeDot={{ r: 6, fill: P.line, stroke: '#fff', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Baseline vs latest week (Nick, Nov 4 2026: "baseline metrics so as we
// improve we have tangible stats to compare to"). Baseline = the first 7 days
// of the series (new prompt set: Oct 28 → Nov 3), locked. Latest = the most
// recent 7 days. Comparison only shows once the two weeks don't overlap.
// Overall metrics sum raw counts then divide; per-topic visibility is the mean
// of daily topic ratios (Peec gives no per-topic daily denominators).
// ---------------------------------------------------------------------------
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function weekStats(peec, startISO, endISO) {
  const inR = (r) => r.date >= startISO && r.date <= endISO;
  const b = (peec.brandDailyStats || []).filter(inR).reduce((a, r) => ({ c: a.c + r.visCount, t: a.t + r.visTotal, m: a.m + r.mentions }), { c: 0, t: 0, m: 0 });
  const ret = (peec.sources?.mutinyhq?.daily || []).filter(inR).reduce((a, r) => a + (r.Total ?? 0), 0);
  const cc = (peec.sources?.mutinyhq?.dailyStats || []).filter(inR).reduce((a, r) => a + r.citationCount, 0);
  const days = (peec.daily || []).filter(inR);
  const topicMean = (name) => {
    const v = days.map((r) => r[name]).filter((x) => x != null);
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : null;
  };
  return {
    visibility: b.t > 0 ? b.c / b.t : null,
    mentions: b.m,
    retrieved: b.t > 0 ? ret / b.t : null,
    retrievals: ret,
    citations: cc,
    topics: Object.fromEntries((peec.topics || []).map((t) => [t.name, topicMean(t.name)])),
  };
}

export function BaselineTable({ data, colors, baselineDays = 7 }) {
  if (!data?.daily?.length) return null;
  const first = data.daily[0].date;
  const last = data.daily[data.daily.length - 1].date;
  const bStart = first, bEnd = addDays(first, baselineDays - 1);
  const lStart = addDays(last, -(baselineDays - 1)), lEnd = last;
  const haveBaseline = last >= bEnd;
  const canCompare = lStart > bEnd;
  const B = weekStats(data, bStart, bEnd);
  const L = canCompare ? weekStats(data, lStart, lEnd) : null;
  const firstCompare = md(addDays(bEnd, baselineDays));
  const fmtPct = (v) => (v == null ? '·' : `${(v * 100).toFixed(1)}%`);
  const fmtNum = (v) => (v == null ? '·' : v.toLocaleString());
  const chg = (cur, base, kind) => {
    if (cur == null || base == null) return '·';
    const d = kind === 'pts' ? (cur - base) * 100 : base ? ((cur - base) / base) * 100 : null;
    if (d == null) return '·';
    const color = Math.abs(d) < 0.05 ? C.muted : d > 0 ? '#1E8A3A' : '#E0401F';
    return <span style={{ color, fontWeight: 700 }}>{d > 0 ? '+' : ''}{d.toFixed(1)}{kind === 'pts' ? ' pts' : '%'}</span>;
  };
  const rows = [
    { label: 'Visibility (AI answers naming Mutiny)', b: B.visibility, l: L?.visibility, f: fmtPct, k: 'pts', strong: true, help: 'visibility' },
    { label: 'Mentions', b: B.mentions, l: L?.mentions, f: fmtNum, k: 'rel', help: 'mentions' },
    { label: 'mutinyhq.com retrieved (% of chats)', b: B.retrieved, l: L?.retrieved, f: fmtPct, k: 'pts', strong: true, help: 'source' },
    { label: 'Chats retrieving mutinyhq.com', b: B.retrievals, l: L?.retrievals, f: fmtNum, k: 'rel', help: 'chats' },
    { label: 'mutinyhq.com citations', b: B.citations, l: L?.citations, f: fmtNum, k: 'rel', help: 'citations' },
    ...(data.topics || []).map((t) => ({ label: t.name, b: B.topics[t.name], l: L?.topics[t.name], f: fmtPct, k: 'pts', topic: true, color: colors[t.name], help: 'topic' })),
  ];
  const th = { fontFamily: FONT_BODY, fontWeight: 700, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.6, textAlign: 'right', padding: '6px 10px', borderBottom: `1px solid ${C.black}`, whiteSpace: 'nowrap' };
  const td = { fontFamily: FONT_BODY, fontSize: 13, padding: '7px 10px', borderBottom: '1px solid rgba(0,0,0,0.08)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  return (
    <section style={{ background: C.white, border: `1px solid ${C.black}`, borderRadius: 4, padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, letterSpacing: '-0.02em' }}>Baseline vs latest week</div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: C.muted }}>
          Baseline locked to the first {baselineDays} days ({md(bStart)} to {md(bEnd)}).{' '}
          {canCompare ? `Latest = ${md(lStart)} to ${md(lEnd)}.` : `First comparison when data reaches ${firstCompare}.`}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
          <thead><tr>
            <th style={{ ...th, textAlign: 'left' }}>Metric</th>
            <th style={th}>Baseline {haveBaseline ? '' : '(partial)'}</th>
            <th style={th}>Latest 7 days</th>
            <th style={th}>Change</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} style={r.topic && !rows[i - 1]?.topic ? { borderTop: `1px solid ${C.black}` } : undefined}>
                <td style={{ ...td, textAlign: 'left', fontWeight: r.strong ? 700 : 400, whiteSpace: 'normal' }}>
                  {r.topic && <span style={{ display: 'inline-block', width: 14, height: 0, borderTop: `2px solid ${r.color}`, marginRight: 8, verticalAlign: 'middle' }} />}
                  <Help k={r.help}>{r.label}</Help>
                </td>
                <td style={td}>{r.f(r.b)}</td>
                <td style={{ ...td, color: L ? C.black : C.muted }}>{L ? r.f(r.l) : '·'}</td>
                <td style={td}>{L ? chg(r.l, r.b, r.k) : '·'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 10.5, opacity: 0.55, marginTop: 10, lineHeight: 1.5 }}>
        Percentages change in points; counts change in %. Overall rows sum the week's raw counts, then divide. Topic rows average the daily topic visibility
        (Peec doesn't give per-topic daily totals). Compare a topic with its own baseline, not with other topics.
      </div>
    </section>
  );
}

const readPref = (k, d) => { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const writePref = (k, v) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };

export function PeecVisibilityCard({ data, colors, title = 'Mutiny brand insights', sub = "How Mutiny's metrics change over time", badge, badgeBg = C.white, footnote, competitor = true, prefKey }) {
  // Filters remembered per card (prefKey) in this browser.
  const [f, setF] = useState(() => ({ grain: 'day', range: 'all', custom: null, metric: 'visibility', ...(prefKey ? readPref(prefKey, {}) : {}) }));
  const update = (patch) => setF((o) => { const n = { ...o, ...patch }; if (prefKey) writePref(prefKey, n); return n; });
  const W = useMemo(() => resolveWindow(data, f.range, f.custom), [data, f.range, f.custom]);
  const S = useMemo(() => (W ? buildSeries(data, colors, W, f.grain) : null), [data, colors, W, f.grain]);
  const [shown, setShown] = useState({}); // topic name → overlaid on the chart
  if (!data || !S) return null;
  const top = data.topCompetitor;
  const allData = W.start === W.first && W.end === W.last;
  const fmt = (v) => (v == null ? '·' : `${v.toFixed(1)}%`);
  const topicLines = S.topics.filter((t) => shown[t.name]);
  return (
    <section style={{ background: '#FCFCFC', border: `1px solid ${P.border}`, borderRadius: 14, padding: '20px 22px', fontFamily: FONT_BODY, color: P.text }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
          <div style={{ fontSize: 14, color: P.sub, marginTop: 2 }}>{sub} · {S.windowLabel}{W.prev ? ` · changes vs ${md(W.prev.start)} – ${md(W.prev.end)}` : ''}</div>
        </div>
        {badge && <span style={{ marginLeft: 'auto', border: `1px solid ${C.black}`, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700, background: badgeBg, whiteSpace: 'nowrap' }}>{badge}</span>}
      </div>

      <Kpis items={[
        { label: 'Visibility', value: fmt(S.cur.visPct), delta: <DeltaChip cur={S.cur.visPct} prev={S.prev?.visPct} kind="pts" />, help: 'visibility' },
        { label: 'Used as a source', value: fmt(S.cur.retrievedPct), delta: <DeltaChip cur={S.cur.retrievedPct} prev={S.prev?.retrievedPct} kind="pts" />, help: 'source' },
        { label: 'Chats retrieving mutinyhq.com', value: S.cur.retrievals.toLocaleString(), delta: <DeltaChip cur={S.cur.retrievals} prev={S.prev?.retrievals} kind="rel" />, help: 'chats' },
        ...(competitor && data.competitorRank ? [{ label: allData ? 'Rank' : 'Rank (all data)', value: `#${data.competitorRank} of ${data.competitorTotal}`, help: 'rank' }] : []),
        ...(competitor && top ? [{ label: allData ? 'Leader' : 'Leader (all data)', value: `${top.name} ${(top.visibility * 100).toFixed(1)}%`, help: 'leader' }] : []),
      ]} />

      <div style={{ background: P.panel, border: `1px solid ${P.border}`, borderRadius: 12, overflow: 'hidden' }}>
        {/* Toolbar: metric + date range on the left, D/W/M on the right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 14px', borderBottom: `1px solid ${P.border}` }}>
          <FilterSelect label="Metric" icon={<Eye size={15} />} value={f.metric} onChange={(metric) => update({ metric })} options={[['visibility', 'Visibility'], ['mentions', 'Mentions']]} />
          <FilterSelect label="Date range" icon={<Calendar size={15} />} value={f.range} onChange={(range) => update({ range, ...(range === 'custom' && !f.custom ? { custom: { from: W.start, to: W.end } } : {}) })} options={PEEC_RANGES} />
          {f.range === 'custom' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="date" aria-label="From" style={dateInput} min={W.first} max={W.last} value={f.custom?.from || W.start} onChange={(e) => e.target.value && update({ custom: { ...f.custom, from: e.target.value } })} />
              <span style={{ fontSize: 12, color: P.sub }}>to</span>
              <input type="date" aria-label="To" style={dateInput} min={W.first} max={W.last} value={f.custom?.to || W.end} onChange={(e) => e.target.value && update({ custom: { ...f.custom, to: e.target.value } })} />
            </span>
          )}
          <span style={{ marginLeft: 'auto' }}><GrainToggle value={f.grain} onChange={(grain) => update({ grain })} /></span>
        </div>

        <div style={{ padding: '14px 10px 6px' }}>
          <InsightChart rows={S.rows} metric={f.metric} topicLines={topicLines} grain={f.grain} />
        </div>

        {/* Footer: domain key + topic overlays */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px 8px', flexWrap: 'wrap', padding: '10px 16px', borderTop: `1px solid ${P.border}`, fontSize: 13 }}>
          <Help k="source" style={{ color: P.sub }}>Your domain</Help>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: P.soft, borderRadius: 6, padding: '3px 8px', fontWeight: 600 }}>
            <span style={{ width: 14, height: 0, borderTop: `2px dashed ${P.source}` }} />mutinyhq.com
          </span>
          {f.metric === 'visibility' && (
            <>
              <span style={{ color: P.sub, marginLeft: 10 }}>Topics</span>
              {S.topics.map((t) => {
                const on = !!shown[t.name];
                return (
                  <button key={t.name} type="button" title={t.note || (on ? 'Hide this topic' : 'Overlay this topic')} aria-pressed={on} onClick={() => setShown((o) => ({ ...o, [t.name]: !o[t.name] }))}
                    style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 6, padding: '3px 8px', fontWeight: 600, fontSize: 12.5, background: on ? P.soft : 'transparent', border: `1px solid ${on ? P.border : 'transparent'}`, color: on ? P.text : '#9A9A9A' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: t.color, opacity: on ? 1 : 0.5 }} />{t.name}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: P.sub, marginTop: 10, lineHeight: 1.5 }}>
        Source: Peec AI. Solid purple = {f.metric === 'visibility' ? 'visibility, left axis' : 'mentions, left axis'}; dashed grey = mutinyhq.com used as a source (% of chats that retrieved it), right axis, not zero-based.
        {f.grain !== 'day' && ' Weekly/monthly points sum the period\'s counts then divide; topic lines average daily topic visibility. Weeks run Mon–Sun.'}
        {' '}Changes compare with the same number of days just before{W.prev ? '' : ' (hidden until a full prior period exists)'}. Rank and leader are Peec's all-data figures.
        {footnote ? ` ${footnote}` : ''}
      </div>
    </section>
  );
}
