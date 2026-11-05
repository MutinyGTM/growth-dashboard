// ---------------------------------------------------------------------------
// AEO coaching board (Nick, Nov 4 2026): "as a top AEO expert coach… a JIRA
// board layout… suggestions, how to do them, what impact, ordered by
// importance, at least 10". Rendered at the bottom of ?aeo, under the Peec
// charts. Content lives in data/aeo/action-board.json (rank 1 = most
// important); move a card by editing its status / sprint there.
// Evidence: Peec Mutiny 2.0, 6 new topics, Oct 28 – Nov 3 2026 + live
// mutinyhq.com check Nov 4 + Oct 28 page audit.
// ---------------------------------------------------------------------------
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronsUp, ChevronUp, Equal, Bookmark, CheckSquare, Globe, Settings, X, LayoutGrid, List, Target, ChevronDown } from 'lucide-react';
import board from './data/aeo/action-board.json';

const FONT_BODY = "'Manrope', 'KMR Waldenburg', Arial, sans-serif";
const J = {
  bg: '#F7F8F9', border: '#DFE1E6', text: '#172B4D', sub: '#626F86', card: '#FFFFFF',
  shadow: '0 1px 1px rgba(9,30,66,0.25), 0 0 1px rgba(9,30,66,0.31)', hover: '#F1F2F4', link: '#0C66E4',
};
const PRIORITY = {
  Highest: { Icon: ChevronsUp, color: '#C9372C' },
  High: { Icon: ChevronUp, color: '#E2483D' },
  Medium: { Icon: Equal, color: '#D97008' },
  Low: { Icon: ChevronDown, color: '#1D7AFC' },
};
// Issue types styled like JIRA's (Story green, Task blue…).
const TYPES = {
  Content: { Icon: Bookmark, bg: '#63BA3C', label: 'Content' },
  Technical: { Icon: CheckSquare, bg: '#4BADE8', label: 'Technical' },
  'Off-site': { Icon: Globe, bg: '#904EE2', label: 'Off-site' },
  Ops: { Icon: Settings, bg: '#8590A2', label: 'Ops' },
};
const STATUS = {
  'To Do': { bg: '#DFE1E6', fg: '#44546F' },
  'In Progress': { bg: '#CCE0FF', fg: '#0055CC' },
  'In Review': { bg: '#F8E6A0', fg: '#7F5F01' },
  Done: { bg: '#BAF3DB', fg: '#216E4E' },
};
const TOPIC_COLOR = {
  'All topics': '#DFE1E6',
  'Sales Enablement': '#F2D1FC',
  'Sales Presentations and Proposals': '#BCEEFD',
  'Digital Sales Rooms': '#D2FD78',
  'AI GTM Stack': '#FFE3A3',
  'Sales Call Notes and Recording': '#FF9987',
  'AI Sales Assistants': '#D9D2FF',
};

const cards = [...(board.cards || [])].sort((a, b) => a.rank - b.rank);
const sprints = board.sprints || [];
const allTopics = ['All topics', ...Object.keys(TOPIC_COLOR).filter((t) => t !== 'All topics')];

const TypeIcon = ({ type, size = 16 }) => {
  const t = TYPES[type] || TYPES.Ops;
  return (
    <span title={t.label} style={{ width: size, height: size, borderRadius: 3, background: t.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <t.Icon size={size - 5} color="#fff" strokeWidth={2.6} />
    </span>
  );
};
const PriorityIcon = ({ p, size = 16 }) => {
  const x = PRIORITY[p] || PRIORITY.Medium;
  return <x.Icon size={size} color={x.color} strokeWidth={2.8} aria-label={`${p} priority`} />;
};
const Lozenge = ({ status }) => {
  const s = STATUS[status] || STATUS['To Do'];
  return <span style={{ background: s.bg, color: s.fg, borderRadius: 3, padding: '1px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{status}</span>;
};
const TopicLabel = ({ t }) => (
  <span style={{ background: TOPIC_COLOR[t] || '#DFE1E6', color: J.text, borderRadius: 3, padding: '1px 6px', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{t}</span>
);
const Avatar = ({ name }) => {
  const initials = (name || '?').split(/[\s/+]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return <span title={`Suggested owner: ${name}`} style={{ width: 24, height: 24, borderRadius: 999, background: '#DCDFE4', color: J.text, fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</span>;
};
const Points = ({ n }) => <span title="Story points (relative effort)" style={{ background: '#DCDFE4', color: J.text, borderRadius: 999, minWidth: 20, padding: '0 6px', height: 18, fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>;

function IssueCard({ c, onOpen }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" onClick={() => onOpen(c)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'block', width: '100%', background: hover ? J.hover : J.card, borderRadius: 4, boxShadow: J.shadow, padding: '10px 12px', fontFamily: FONT_BODY, color: J.text }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span title="Rank by importance" style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: J.text, borderRadius: 999, minWidth: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{c.rank}</span>
        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{c.title}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
        {c.topics.map((t) => <TopicLabel key={t} t={t} />)}
      </div>
      {c.metric && (
        <div style={{ marginTop: 8, fontSize: 12, color: J.sub, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Target size={13} style={{ flexShrink: 0, marginTop: 2 }} />
          <span><b style={{ color: J.text, fontWeight: 600 }}>{c.metric.baseline}</b> → {c.metric.target}</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <TypeIcon type={c.type} />
        <span style={{ fontSize: 12, fontWeight: 600, color: J.sub }}>{c.key}</span>
        <Lozenge status={c.status} />
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <PriorityIcon p={c.priority} />
          <Points n={c.points} />
          <Avatar name={c.owner} />
        </span>
      </div>
      {c.progress && c.progress.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: J.sub }}>
          {c.progress.filter((p) => p.status === 'done').length} of {c.progress.length} activity items done
        </div>
      )}
    </button>
  );
}

export function IssueModal({ c, onClose }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  if (!c) return null;
  const sprint = sprints.find((s) => s.id === c.sprint);
  const H = ({ children }) => <div style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 8px' }}>{children}</div>;
  const Field = ({ label, children }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: 8, padding: '7px 0', fontSize: 13, alignItems: 'start' }}>
      <span style={{ color: J.sub, fontWeight: 600 }}>{label}</span><span>{children}</span>
    </div>
  );
  return (
    <div role="dialog" aria-modal="true" aria-label={`${c.key} ${c.title}`} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(9,30,66,0.54)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '48px 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} className="aeo-issue"
        style={{ background: J.card, borderRadius: 8, width: 'min(1040px, 100%)', boxShadow: '0 8px 24px rgba(9,30,66,0.3)', fontFamily: FONT_BODY, color: J.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: `1px solid ${J.border}` }}>
          <span style={{ fontSize: 13, color: J.sub }}>AEO board</span><span style={{ color: J.sub }}>/</span>
          <TypeIcon type={c.type} /><span style={{ fontSize: 13, fontWeight: 600, color: J.sub }}>{c.key}</span>
          <button type="button" onClick={onClose} aria-label="Close" style={{ all: 'unset', cursor: 'pointer', marginLeft: 'auto', padding: 4, borderRadius: 4, display: 'inline-flex' }}><X size={20} /></button>
        </div>
        <div className="aeo-issue-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 28, padding: '18px 24px 26px' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, margin: 0 }}>{c.title}</h3>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: '10px 0 0' }}>{c.summary}</p>
            <H>Why now: what Peec and the site show</H>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6 }}>{c.evidence.map((e) => <li key={e} style={{ marginBottom: 6 }}>{e}</li>)}</ul>
            <H>How to do it</H>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6 }}>{c.steps.map((s) => <li key={s} style={{ marginBottom: 8 }}>{s}</li>)}</ol>
            <H>Expected impact</H>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{c.impact}</p>
            <H>Definition of done</H>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>{c.done}</p>
            {c.progress && c.progress.length > 0 && (
              <>
                <H>Activity</H>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 13.5, lineHeight: 1.55 }}>
                  {c.progress.map((p, i) => (
                    <li key={i} style={{ display: 'grid', gridTemplateColumns: '18px 84px minmax(0,1fr)', gap: 8, padding: '6px 0', borderTop: i ? `1px solid ${J.border}` : 'none' }}>
                      <span aria-label={p.status} style={{ color: p.status === 'done' ? '#216E4E' : J.sub, fontWeight: 700 }}>{p.status === 'done' ? '✓' : '○'}</span>
                      <span style={{ color: J.sub, fontVariantNumeric: 'tabular-nums' }}>{p.date}</span>
                      <span style={{ color: p.status === 'done' ? J.text : J.sub }}>{p.text}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <aside style={{ border: `1px solid ${J.border}`, borderRadius: 6, padding: '8px 14px', alignSelf: 'start' }}>
            <Field label="Status"><Lozenge status={c.status} /></Field>
            <Field label="Rank"><b>#{c.rank}</b> of {cards.length} by importance</Field>
            <Field label="Priority"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><PriorityIcon p={c.priority} />{c.priority}</span></Field>
            <Field label="Sprint">{sprint ? `${sprint.name} · ${sprint.dates}` : c.sprint}</Field>
            <Field label="Type"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TypeIcon type={c.type} />{c.type}</span></Field>
            <Field label="Effort">{c.effort} · <Points n={c.points} /> pts</Field>
            <Field label="Owner"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Avatar name={c.owner} />{c.owner}</span></Field>
            <Field label="Topics"><span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{c.topics.map((t) => <TopicLabel key={t} t={t} />)}</span></Field>
            {c.metric && (
              <div style={{ borderTop: `1px solid ${J.border}`, marginTop: 6, paddingTop: 10, fontSize: 13 }}>
                <div style={{ color: J.sub, fontWeight: 600, marginBottom: 4 }}>Metric to watch</div>
                <div style={{ fontWeight: 600 }}>{c.metric.name}</div>
                <div style={{ marginTop: 6 }}><span style={{ color: J.sub }}>Baseline:</span> {c.metric.baseline}</div>
                <div><span style={{ color: J.sub }}>Target:</span> {c.metric.target}</div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

const SEL = { fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: J.text, border: `1px solid ${J.border}`, borderRadius: 4, padding: '5px 8px', background: J.card };

export default function AeoActionBoard() {
  const [view, setView] = useState('board');
  const [topic, setTopic] = useState('any');
  const [type, setType] = useState('any');
  const [open, setOpen] = useState(null);
  const shown = useMemo(() => cards.filter((c) =>
    (topic === 'any' || c.topics.includes(topic) || c.topics.includes('All topics')) && (type === 'any' || c.type === type)), [topic, type]);
  const ViewBtn = ({ id, Icon, label }) => (
    <button type="button" onClick={() => setView(id)} aria-pressed={view === id}
      style={{ all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 4, fontSize: 13, fontWeight: 600, background: view === id ? '#E9F2FF' : 'transparent', color: view === id ? J.link : J.text }}>
      <Icon size={15} />{label}
    </button>
  );
  return (
    <div style={{ fontFamily: FONT_BODY, color: J.text, background: J.card, border: `1px solid ${J.border}`, borderRadius: 8, padding: '18px 20px 20px' }}>
      <style>{`@media (max-width: 1000px){.aeo-board{grid-template-columns:minmax(0,1fr)!important}} @media (max-width: 760px){.aeo-issue-grid{grid-template-columns:minmax(0,1fr)!important}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', background: J.bg, borderRadius: 6, padding: 2, gap: 2 }}>
          <ViewBtn id="board" Icon={LayoutGrid} label="Board" />
          <ViewBtn id="list" Icon={List} label="Ranked list" />
        </div>
        <select aria-label="Filter by topic" value={topic} onChange={(e) => setTopic(e.target.value)} style={SEL}>
          <option value="any">All topics</option>
          {allTopics.filter((t) => t !== 'All topics').map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} style={SEL}>
          <option value="any">All types</option>
          {Object.keys(TYPES).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ fontSize: 12.5, color: J.sub }}>{shown.length} of {cards.length} items · ranked by importance · click a card for the how-to</span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 12, fontSize: 12, color: J.sub, flexWrap: 'wrap' }}>
          {Object.entries(PRIORITY).filter(([k]) => k !== 'Low').map(([k]) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><PriorityIcon p={k} size={14} />{k}</span>)}
          {Object.entries(TYPES).map(([k]) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><TypeIcon type={k} size={14} />{k}</span>)}
        </span>
      </div>

      {view === 'board' ? (
        <div className="aeo-board" style={{ display: 'grid', gridTemplateColumns: `repeat(${sprints.length}, minmax(0,1fr))`, gap: 12, alignItems: 'start' }}>
          {sprints.map((s) => {
            const col = shown.filter((c) => c.sprint === s.id);
            const pts = col.reduce((a, c) => a + (c.points || 0), 0);
            return (
              <div key={s.id} style={{ background: J.bg, borderRadius: 6, padding: '10px 8px 8px' }}>
                <div style={{ padding: '0 4px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: J.sub }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: J.sub }}>{s.dates}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: J.sub }}>{col.length} issues · {pts} pts</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: J.text, marginTop: 4, lineHeight: 1.45 }}>{s.goal}</div>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {col.length ? col.map((c) => <IssueCard key={c.key} c={c} onOpen={setOpen} />)
                    : <div style={{ fontSize: 12.5, color: J.sub, padding: '12px 6px' }}>No items match the filters.</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860, fontSize: 13 }}>
            <thead>
              <tr style={{ color: J.sub, textAlign: 'left' }}>
                {['#', 'Key', 'Summary', 'P', 'Type', 'Topics', 'Sprint', 'Pts', 'Metric: baseline → target', 'Status'].map((h) => (
                  <th key={h} style={{ padding: '6px 8px', borderBottom: `2px solid ${J.border}`, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.key} onClick={() => setOpen(c)} style={{ cursor: 'pointer', borderBottom: `1px solid ${J.border}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = J.hover; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                  <td style={{ padding: '8px', fontWeight: 800 }}>{c.rank}</td>
                  <td style={{ padding: '8px', color: J.sub, whiteSpace: 'nowrap' }}>{c.key}</td>
                  <td style={{ padding: '8px', fontWeight: 600, color: J.link, minWidth: 260 }}>{c.title}</td>
                  <td style={{ padding: '8px' }}><PriorityIcon p={c.priority} /></td>
                  <td style={{ padding: '8px' }}><TypeIcon type={c.type} /></td>
                  <td style={{ padding: '8px' }}><span style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{c.topics.map((t) => <TopicLabel key={t} t={t} />)}</span></td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{sprints.find((s) => s.id === c.sprint)?.name}</td>
                  <td style={{ padding: '8px' }}><Points n={c.points} /></td>
                  <td style={{ padding: '8px', color: J.sub, minWidth: 200 }}>{c.metric ? <><b style={{ color: J.text, fontWeight: 600 }}>{c.metric.baseline}</b> → {c.metric.target}</> : '·'}</td>
                  <td style={{ padding: '8px' }}><Lozenge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: J.sub, marginTop: 12, lineHeight: 1.55 }}>
        Evidence: Peec project Mutiny 2.0 filtered to the 6 new topics, Oct 28 – Nov 3, 2026 (3,888 chats across ChatGPT, Perplexity and Google AI Overview), a live check of mutinyhq.com on Nov 4, and the Oct 28 page audit. Targets are estimates to check against the baseline table above, not promises: head terms move slowly and visibility flattens when effort stops.
        {' '}Board as of {board.asOf}. To move a card, change its status or sprint in data/aeo/action-board.json.
      </div>
      {open && <IssueModal c={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
