import { getDb } from '@/lib/db';
import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth, addMonths } from 'date-fns';

// Always render fresh — no caching.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ─── Overrides ────────────────────────────────────────────────────────────────
// Manual corrections layered on top of CRM data. Promote to a `gantt_overrides`
// table + edit UI as a v2; for now hand-edit this constant and redeploy.
const OVERRIDES: Record<string, {
  excluded?: boolean;
  closed?: boolean;
  close_date?: string;
  first_meeting?: string;
  closing_this_week?: boolean;
  note?: string;
  key_contact?: string;
  training_date?: string;
}> = {
  'Art of Drawers':       { excluded: true },
  'Crossland Construction': { excluded: true },
  'ECC Exteriors':        { closed: true, close_date: '2026-04-24', note: 'MSA dated 2026-04-17, closed week-of' },
  'Taurus Builders':      { first_meeting: '2026-04-10', closing_this_week: true, note: 'calendar-confirmed: David Ellena + Nick Groeger 4/10' },
  'Dondlinger Construction': { first_meeting: '2026-04-01', training_date: '2026-05-18', note: 'training-led engagement; started, not yet closed' },
  'Designs by Sundown':   { first_meeting: '2026-02-19', note: 'landscaping — extended sales cycle' },
  'Haselden Builders':    { first_meeting: '2026-04-29' },
  'Proof of the Pudding': { first_meeting: '2026-02-20', key_contact: 'Adam Noyes' },
  'RK Industries':        { first_meeting: '2026-04-24', note: 'Luke-confirmed; calendar event not by company name' },
};

const MEETING_KIND_PRIMARY = 'meeting_held';
const MEETING_KIND_FALLBACK = 'meeting_scheduled';
const CYCLE_START_DAYS = 60;
const CYCLE_END_DAYS = 90;

type RawAccount = { id: string; name: string };
type RawEvent = { account_id: string; occurred_at: string; kind: string };

type RowStatus =
  | 'closed'
  | 'closing-this-week'
  | 'overdue'
  | 'in-window'
  | 'pre-window'
  | 'future-meeting'
  | 'no-meeting';

interface Row {
  name: string;
  status: RowStatus;
  firstMeeting?: Date;
  closeDate?: Date;
  daysSince?: number;
  note?: string;
  keyContact?: string;
  trainingDate?: string;
}

const STATUS_ORDER: RowStatus[] = [
  'closed', 'closing-this-week', 'overdue', 'in-window', 'pre-window', 'future-meeting', 'no-meeting',
];

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchRows(today: Date): Promise<{ rows: Row[]; crmGap: string[]; excluded: string[] }> {
  const sql = getDb();
  const accounts = (await sql`SELECT id, name FROM accounts ORDER BY name`) as unknown as RawAccount[];
  const events = (await sql`
    SELECT account_id, occurred_at::text AS occurred_at, kind
    FROM timeline_events
    WHERE kind IN (${MEETING_KIND_PRIMARY}, ${MEETING_KIND_FALLBACK})
    ORDER BY occurred_at ASC
  `) as unknown as RawEvent[];

  const byAccount = new Map<string, RawEvent[]>();
  for (const e of events) {
    if (!byAccount.has(e.account_id)) byAccount.set(e.account_id, []);
    byAccount.get(e.account_id)!.push(e);
  }

  const rows: Row[] = [];
  const crmGap: string[] = [];
  const excluded: string[] = [];

  for (const a of accounts) {
    const ov = OVERRIDES[a.name] || {};
    if (ov.excluded) {
      excluded.push(a.name);
      continue;
    }
    if (ov.closed && ov.close_date) {
      rows.push({
        name: a.name,
        status: 'closed',
        closeDate: parseISO(ov.close_date),
        note: ov.note,
      });
      continue;
    }

    const evs = byAccount.get(a.id) || [];
    const held = evs.filter((e) => e.kind === MEETING_KIND_PRIMARY);
    const sched = evs.filter((e) => e.kind === MEETING_KIND_FALLBACK);

    let firstMeeting: Date | undefined;
    if (ov.first_meeting) firstMeeting = parseISO(ov.first_meeting);
    else if (held.length) firstMeeting = parseISO(held[0].occurred_at.slice(0, 10));
    else if (sched.length) firstMeeting = parseISO(sched[0].occurred_at.slice(0, 10));

    if (!firstMeeting) {
      crmGap.push(a.name);
      continue;
    }

    const daysSince = differenceInCalendarDays(today, firstMeeting);
    let status: RowStatus;
    if (ov.closing_this_week) status = 'closing-this-week';
    else if (daysSince < 0) status = 'future-meeting';
    else if (daysSince < CYCLE_START_DAYS) status = 'pre-window';
    else if (daysSince <= CYCLE_END_DAYS) status = 'in-window';
    else status = 'overdue';

    rows.push({
      name: a.name,
      status,
      firstMeeting,
      daysSince,
      note: ov.note,
      keyContact: ov.key_contact,
      trainingDate: ov.training_date,
    });
  }

  rows.sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.status);
    const bi = STATUS_ORDER.indexOf(b.status);
    if (ai !== bi) return ai - bi;
    const ad = a.closeDate || (a.firstMeeting ? addDays(a.firstMeeting, CYCLE_END_DAYS) : undefined);
    const bd = b.closeDate || (b.firstMeeting ? addDays(b.firstMeeting, CYCLE_END_DAYS) : undefined);
    if (!ad || !bd) return 0;
    return ad.getTime() - bd.getTime();
  });

  return { rows, crmGap, excluded };
}

// ─── Render helpers ───────────────────────────────────────────────────────────

const CHART_W = 1280;
const ROW_H = 36;
const LABEL_W = 240;
const LEFT_PAD = LABEL_W + 8;
const RIGHT_PAD = 32;
const PLOT_W = CHART_W - LEFT_PAD - RIGHT_PAD;

function statusNote(r: Row): { text: string; color: string } {
  const days = r.daysSince ?? 0;
  if (r.status === 'closed') return { text: `CLOSED ${format(r.closeDate!, 'yyyy-MM-dd')}`, color: '#0891b2' };
  if (r.status === 'closing-this-week') return { text: `🎯 CLOSING THIS WEEK (${days}d since first meeting)`, color: '#d97706' };
  if (r.status === 'overdue') return { text: `${days - CYCLE_END_DAYS}d past 90-day mark`, color: '#dc2626' };
  if (r.status === 'in-window') return { text: `${CYCLE_END_DAYS - days}d left in close window`, color: '#16a34a' };
  if (r.status === 'pre-window') return {
    text: `window opens ${format(addDays(r.firstMeeting!, CYCLE_START_DAYS), 'yyyy-MM-dd')} (in ${CYCLE_START_DAYS - days}d)`,
    color: '#64748b',
  };
  return { text: 'meeting scheduled (not yet held)', color: '#a78bfa' };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function GanttPage() {
  const today = new Date();
  const todayDateOnly = parseISO(format(today, 'yyyy-MM-dd'));
  const { rows, crmGap, excluded } = await fetchRows(todayDateOnly);

  const plotRows = rows.filter((r) => r.status !== 'no-meeting');

  // Chart date range
  const allDates: Date[] = [todayDateOnly, addDays(todayDateOnly, 60)];
  for (const r of plotRows) {
    if (r.firstMeeting) {
      allDates.push(r.firstMeeting);
      allDates.push(addDays(r.firstMeeting, CYCLE_END_DAYS));
    }
    if (r.closeDate) allDates.push(r.closeDate);
  }
  let chartStart = new Date(Math.min(...allDates.map((d) => d.getTime())));
  // Cap left edge so an ancient 2024 record doesn't squish everyone
  const floor = parseISO('2026-02-01');
  if (chartStart < floor) chartStart = floor;
  const chartEnd = new Date(Math.max(...allDates.map((d) => d.getTime())));
  const totalDays = Math.max(1, differenceInCalendarDays(chartEnd, chartStart));

  const xFor = (d: Date) => {
    const days = differenceInCalendarDays(d, chartStart);
    return LEFT_PAD + (days / totalDays) * PLOT_W;
  };

  const todayX = xFor(todayDateOnly);

  // Month ticks
  const ticks: Date[] = [];
  let cur = startOfMonth(chartStart);
  while (cur <= chartEnd) {
    ticks.push(cur);
    cur = addMonths(cur, 1);
  }

  const svgH = 80 + plotRows.length * ROW_H + 40;

  const counts: Record<RowStatus, number> = {
    closed: 0, 'closing-this-week': 0, overdue: 0, 'in-window': 0, 'pre-window': 0, 'future-meeting': 0, 'no-meeting': crmGap.length,
  };
  for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;

  const SummaryCard = ({ n, label, color }: { n: number; label: string; color: string }) => (
    <div className="px-3.5 py-2.5 rounded-lg bg-sand-50 border border-sand-200 min-w-[110px]">
      <span className="block text-2xl font-bold" style={{ color }}>{n}</span>
      <span className="text-[11px] text-navy-500 uppercase tracking-wider">{label}</span>
    </div>
  );

  return (
    <div className="p-8 max-w-[1340px] mx-auto">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-navy-900">Sales Pipeline Gantt</h1>
        <p className="text-sm text-navy-500 mt-1">
          Per-account first-meeting date + projected 60–90 day close window. Live from CRM as of {format(todayDateOnly, 'yyyy-MM-dd')}.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mt-5 mb-5">
        <SummaryCard n={counts['closed']} label="Closed" color="#0891b2" />
        <SummaryCard n={counts['closing-this-week']} label="Closing This Week" color="#d97706" />
        <SummaryCard n={counts['overdue']} label="Overdue" color="#dc2626" />
        <SummaryCard n={counts['in-window']} label="In Window" color="#16a34a" />
        <SummaryCard n={counts['pre-window']} label="Pre-window" color="#94a3b8" />
        <SummaryCard n={counts['future-meeting']} label="Upcoming" color="#a78bfa" />
        <SummaryCard n={counts['no-meeting']} label="CRM Gap" color="#94a3b8" />
      </div>

      <div className="flex flex-wrap gap-3 mb-4 text-xs text-navy-600">
        <Legend swatch="#cffafe" border="#0891b2" label="closed deal" />
        <Legend swatch="#e2e8f0" border="#cbd5e1" label="0–60 day ramp" />
        <Legend swatch="#86efac" border="#16a34a" label="60–90 day close window" />
        <Legend swatch="#fbbf24" border="#d97706" label="closing this week" />
        <Legend swatch="#fca5a5" border="#dc2626" label="overdue tail" />
        <Legend swatch="#a78bfa" border="#a78bfa" label="scheduled" />
        <span className="text-red-600 font-semibold">‖ today</span>
      </div>

      <div className="bg-white border border-sand-200 rounded-lg overflow-x-auto">
        <svg width={CHART_W} height={svgH} viewBox={`0 0 ${CHART_W} ${svgH}`} style={{ display: 'block' }}>
          {/* Month gridlines */}
          {ticks.map((m, i) => (
            <g key={i}>
              <line x1={xFor(m)} y1={40} x2={xFor(m)} y2={svgH - 20} stroke="#e5e7eb" strokeWidth={1} />
              <text x={xFor(m) + 4} y={36} style={{ fontSize: 10, fill: '#64748b' }}>{format(m, 'MMM yyyy')}</text>
            </g>
          ))}

          {/* Rows */}
          {plotRows.map((r, i) => {
            const y = 60 + i * ROW_H;
            const note = statusNote(r);
            return (
              <g key={i}>
                <text x={LABEL_W - 8} y={y + ROW_H / 2 + 4} textAnchor="end" style={{ fontSize: 13, fill: '#1e293b' }}>{r.name}</text>
                {r.status === 'closed' && r.closeDate ? (
                  <>
                    <rect x={LEFT_PAD} y={y + 8} width={xFor(r.closeDate) - LEFT_PAD} height={ROW_H - 16} fill="#cffafe" stroke="#0891b2" rx={3} />
                    <circle cx={xFor(r.closeDate)} cy={y + ROW_H / 2} r={7} fill="#0891b2" stroke="white" strokeWidth={2} />
                  </>
                ) : r.status === 'future-meeting' && r.firstMeeting ? (
                  <circle cx={xFor(r.firstMeeting)} cy={y + ROW_H / 2} r={6} fill="#a78bfa" stroke="white" strokeWidth={2} />
                ) : r.firstMeeting ? (
                  <>
                    <line x1={xFor(r.firstMeeting)} y1={y + 4} x2={xFor(r.firstMeeting)} y2={y + ROW_H - 4} stroke="#1e293b" strokeWidth={2} />
                    <rect
                      x={xFor(r.firstMeeting)}
                      y={y + 8}
                      width={xFor(addDays(r.firstMeeting, CYCLE_START_DAYS)) - xFor(r.firstMeeting)}
                      height={ROW_H - 16}
                      fill="#e2e8f0"
                      stroke="#cbd5e1"
                      rx={3}
                    />
                    <rect
                      x={xFor(addDays(r.firstMeeting, CYCLE_START_DAYS))}
                      y={y + 8}
                      width={xFor(addDays(r.firstMeeting, CYCLE_END_DAYS)) - xFor(addDays(r.firstMeeting, CYCLE_START_DAYS))}
                      height={ROW_H - 16}
                      fill="#86efac"
                      stroke="#16a34a"
                      strokeWidth={1.5}
                      rx={3}
                    />
                    {(r.status === 'overdue' || r.status === 'closing-this-week') &&
                      todayX > xFor(addDays(r.firstMeeting, CYCLE_END_DAYS)) && (
                      <rect
                        x={xFor(addDays(r.firstMeeting, CYCLE_END_DAYS))}
                        y={y + 8}
                        width={todayX - xFor(addDays(r.firstMeeting, CYCLE_END_DAYS))}
                        height={ROW_H - 16}
                        fill={r.status === 'closing-this-week' ? '#fbbf24' : '#fca5a5'}
                        stroke={r.status === 'closing-this-week' ? '#d97706' : '#dc2626'}
                        strokeWidth={1.5}
                        rx={3}
                        strokeDasharray="4,2"
                      />
                    )}
                  </>
                ) : null}
                <text
                  x={(r.closeDate ? xFor(r.closeDate) : r.firstMeeting ? xFor(addDays(r.firstMeeting, CYCLE_END_DAYS)) : LEFT_PAD) + 10}
                  y={y + ROW_H / 2 + 4}
                  style={{ fontSize: 11, fill: note.color, fontWeight: r.status === 'closed' || r.status === 'closing-this-week' ? 600 : 400 }}
                >
                  {note.text}
                  {r.trainingDate ? ` · training ${r.trainingDate}` : ''}
                  {r.keyContact ? ` · ${r.keyContact}` : ''}
                </text>
              </g>
            );
          })}

          {/* Today line */}
          <line x1={todayX} y1={40} x2={todayX} y2={svgH - 20} stroke="#dc2626" strokeWidth={2} strokeDasharray="6,3" />
          <text x={todayX} y={30} textAnchor="middle" style={{ fontSize: 11, fill: '#dc2626', fontWeight: 600 }}>
            TODAY {format(todayDateOnly, 'yyyy-MM-dd')}
          </text>
        </svg>
      </div>

      {crmGap.length > 0 && (
        <div className="mt-8 pt-6 border-t border-sand-200">
          <h2 className="text-base font-semibold text-navy-900 mb-2">CRM gap — no meeting on record ({crmGap.length})</h2>
          <p className="text-xs text-navy-500 mb-3">
            These accounts exist in the CRM but have no <code className="bg-sand-100 px-1 py-0.5 rounded">meeting_held</code> or{' '}
            <code className="bg-sand-100 px-1 py-0.5 rounded">meeting_scheduled</code> events. Verify whether real meetings happened.
          </p>
          <ul className="text-sm text-navy-600 space-y-0.5">
            {crmGap.map((n) => <li key={n}>· {n}</li>)}
          </ul>
        </div>
      )}

      {excluded.length > 0 && (
        <div className="mt-8 pt-6 border-t border-sand-200">
          <h2 className="text-base font-semibold text-navy-900 mb-2">Excluded ({excluded.length})</h2>
          <p className="text-xs text-navy-500 mb-3">Not part of the active pipeline view.</p>
          <ul className="text-sm text-navy-600 space-y-0.5">
            {excluded.map((n) => <li key={n}>· {n}</li>)}
          </ul>
        </div>
      )}

      <p className="text-xs text-navy-400 mt-8">
        Manual corrections live in <code className="bg-sand-100 px-1 py-0.5 rounded">src/app/gantt/page.tsx</code> under <code className="bg-sand-100 px-1 py-0.5 rounded">OVERRIDES</code>. Edit + redeploy to update. Promote to a DB-backed editable layer as a follow-up.
      </p>
    </div>
  );
}

function Legend({ swatch, border, label }: { swatch: string; border: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-4 h-3 rounded-sm" style={{ background: swatch, border: `1px solid ${border}` }} />
      {label}
    </span>
  );
}
