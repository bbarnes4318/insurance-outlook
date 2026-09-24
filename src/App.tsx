import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULTS, MD_MONTHS, runModel, type Chain, type InputKey, type Inputs, type Outputs } from './engine/model';
import { CashFlowChart, MedicareChart, OverviewChart, TeamChart, C } from './Charts';
import { Card, useCountUp } from './ui';
import { Goal, GOAL_DEFAULT, type GoalState } from './Goal';
import { compact, count, FE_ROWS, fmt, int, MD_ROWS, money, num1, pct, SUMMARY_ROWS } from './format';

// ---------- controls ----------
type Unit = '$' | '%' | 'calls' | 'agents' | 'days';
type Ctl = [InputKey, string, number, number, number, Unit]; // key, label, min, max, step (display units), unit

const FE_BASIC: Ctl[] = [
  ['feCallsStart', 'Calls per day (start)', 0, 2000, 10, 'calls'],
  ['feCallCost', 'Cost per call', 0, 50, 0.25, '$'],
  ['feCallsPerAgent', 'Calls per agent per day', 1, 100, 1, 'calls'],
];
const FE_ADV: Ctl[] = [
  ['feCallsQtrInc', 'Quarterly call growth', 0, 1000, 10, 'calls'],
  ['feConv', 'Conversion %', 0, 50, 0.5, '%'],
  ['fePlace', 'Placement %', 0, 100, 1, '%'],
  ['feLapse', 'Lapse rate', 0, 80, 1, '%'],
  ['feComm', '1st-year commission', 100, 2000, 10, '$'],
  ['feAdvance', 'Advanced portion', 0, 100, 1, '%'],
  ['feRenew', 'Renewal rate', 0, 25, 0.5, '%'],
  ['fePayout', 'Agent payout / policy', 0, 500, 5, '$'],
];
const MD_BASIC: Ctl[] = [
  ['mdCallsPerAgent', 'Calls per agent per day', 1, 100, 1, 'calls'],
  ['mdCallCost', 'Cost per call', 0, 50, 0.25, '$'],
  ['mdAgentsY1', 'Agents – Year 1', 0, 500, 1, 'agents'],
  ['mdAgentsY2', 'Agents – Year 2', 0, 500, 1, 'agents'],
  ['mdAgentsY3', 'Agents – Year 3', 0, 500, 1, 'agents'],
];
const MD_ADV: Ctl[] = [
  ['mdConv', 'Conversion %', 0, 50, 0.5, '%'],
  ['mdPlace', 'Placement %', 0, 100, 1, '%'],
  ['mdLapse', 'Lapse rate', 0, 80, 1, '%'],
  ['mdComm', 'Commission / policy', 0, 1500, 10, '$'],
  ['mdPayout', 'Agent payout / policy', 0, 500, 5, '$'],
];
const SHARED_CTLS: Ctl[] = [
  ['workDays', 'Working days per month', 15, 26, 0.01, 'days'],
  ['retention', 'Retention cost (% of rev.)', 0, 10, 0.1, '%'],
  ['holdback', 'Tax / reserve holdback', 0, 60, 1, '%'],
];
const SPLIT_KEYS: InputKey[] = ['split1', 'split2', 'split3', 'split4'];
const ALL_KEYS = Object.keys(DEFAULTS) as InputKey[];
const DEFAULT_NAMES = ['Partner 1', 'Partner 2', 'Partner 3', 'Partner 4'];

const toDisplay = (unit: Unit, v: number) => (unit === '%' ? +(v * 100).toFixed(4) : v);
const fromDisplay = (unit: Unit, v: number) => (unit === '%' ? v / 100 : v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------- persistence: URL params → localStorage → defaults ----------
const LS_KEY = 'insurance-outlook-v1';
type Page = 'Planner' | 'Income goal';
type State = { inputs: Inputs; names: string[]; goal: GoalState; page: Page };

// Goal fields arrive from URLs/storage as strings or junk; keep only sane values.
function readGoal(src: Record<string, unknown> | undefined): GoalState {
  const g = { ...GOAL_DEFAULT };
  const n = (v: unknown) => (v == null || v === '' ? NaN : Number(v));
  const a = n(src?.amount), p = n(src?.partner), m = n(src?.feMix);
  if (a >= 0 && a <= 1e8) g.amount = a;
  if ([0, 1, 2, 3].includes(p)) g.partner = p;
  if (m >= 0 && m <= 1) g.feMix = m;
  return g;
}

function loadState(): State {
  const inputs = { ...DEFAULTS };
  const names = [...DEFAULT_NAMES];
  let goal = GOAL_DEFAULT;
  let page: Page = 'Planner';
  const q = new URLSearchParams(location.search);
  let src: Record<string, unknown> | null = null;
  if ([...q.keys()].length) {
    src = Object.fromEntries(q);
    DEFAULT_NAMES.forEach((_, i) => q.has(`n${i + 1}`) && (names[i] = q.get(`n${i + 1}`)!));
    goal = readGoal({ amount: q.get('goal'), partner: q.get('goalPartner'), feMix: q.get('goalMix') });
    if (q.get('page') === 'goal') page = 'Income goal';
  } else {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
      if (s) {
        src = s.inputs;
        if (Array.isArray(s.names) && s.names.length === 4) s.names.forEach((n: unknown, i: number) => typeof n === 'string' && (names[i] = n));
        goal = readGoal(s.goal);
        if (s.page === 'Income goal') page = 'Income goal';
      }
    } catch { /* ignore corrupt storage */ }
  }
  if (src) for (const k of ALL_KEYS) {
    const n = Number(src[k]);
    if (src[k] != null && Number.isFinite(n)) inputs[k] = n;
  }
  return { inputs, names, goal, page };
}

function shareQuery({ inputs, names, goal, page }: State) {
  const q = new URLSearchParams();
  for (const k of ALL_KEYS) if (inputs[k] !== DEFAULTS[k]) q.set(k, String(inputs[k]));
  names.forEach((n, i) => n !== DEFAULT_NAMES[i] && q.set(`n${i + 1}`, n));
  if (goal.amount !== GOAL_DEFAULT.amount) q.set('goal', String(goal.amount));
  if (goal.partner !== GOAL_DEFAULT.partner) q.set('goalPartner', String(goal.partner));
  if (goal.feMix !== GOAL_DEFAULT.feMix) q.set('goalMix', String(goal.feMix));
  if (page === 'Income goal') q.set('page', 'goal');
  return q.toString();
}

// ---------- CSV ----------
function exportCsv(out: Outputs) {
  const esc = (s: string | number) => (typeof s === 'number' ? String(Math.round(s * 100) / 100) : `"${s.replace(/"/g, '""')}"`);
  const lines: (string | number)[][] = [];
  lines.push(['Final Expense monthly'], ['Row', ...out.fe.map((r) => `Month ${r.month}`)]);
  FE_ROWS.forEach(([k, l]) => lines.push([l, ...out.fe.map((r) => r[k])]));
  lines.push([], ['Medicare per selling month'], ['Row', ...out.md.flatMap((_, y) => MD_MONTHS.map((m) => `Y${y + 1} ${m}`))]);
  MD_ROWS.forEach(([k, l]) => lines.push([l, ...out.md.flatMap((r) => MD_MONTHS.map(() => r[k]))]));
  lines.push([], ['3-Year Summary'], ['Row', 'Year 1', 'Year 2', 'Year 3']);
  SUMMARY_ROWS.forEach(([k, l]) => lines.push([l, ...out.years.map((y) => y[k])]));
  const blob = new Blob([lines.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'insurance-outlook.csv' });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- small components ----------
function Control({ ctl, value, onChange, accent, dense }: { ctl: Ctl; value: number; onChange: (v: number) => void; accent: string; dense?: boolean }) {
  const [key, label, min, max, step, unit] = ctl;
  const shown = toDisplay(unit, value);
  const [draft, setDraft] = useState(String(shown));
  useEffect(() => setDraft(String(shown)), [shown]);
  const changed = Math.abs(value - DEFAULTS[key]) > 1e-9;
  const set = (d: number) => onChange(fromDisplay(unit, clamp(d, min, max)));
  const fill = `${((clamp(shown, min, max) - min) / (max - min)) * 100}%`;
  return (
    <div className={`flex flex-col justify-center gap-1.5 px-5 ${dense ? 'h-[56px]' : 'h-[66px]'}`}>
      <div className="flex items-center gap-2">
        <span className="truncate text-[13px] text-sub">{label}</span>
        {changed && (
          <button title="Changed — click to reset" onClick={() => onChange(DEFAULTS[key])}
            className="h-1.5 w-1.5 shrink-0 rounded-full hover:scale-150" style={{ background: accent }} />
        )}
        <div className="ml-auto flex h-7 w-[100px] shrink-0 items-center rounded-md bg-surface2 px-2 text-[13px] ring-1 ring-line focus-within:ring-muted">
          {unit === '$' && <span className="text-muted">$</span>}
          <input type="number" aria-label={`${label} value`} min={min} max={max} step={step} value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n) && n >= min && n <= max) set(n);
            }}
            onBlur={() => (Number.isFinite(+draft) && draft !== '' ? set(+draft) : setDraft(String(shown)))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full min-w-0 bg-transparent text-right font-medium text-ink outline-none" />
          {unit !== '$' && <span className="ml-1 text-[12px] text-muted">{unit === '%' ? '%' : unit}</span>}
        </div>
      </div>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={shown} onChange={(e) => set(+e.target.value)}
        className="w-full cursor-pointer" style={{ ['--accent' as string]: accent, ['--fill' as string]: fill }} />
    </div>
  );
}

function Tabs<T extends string>({ value, options, onChange }: { value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${o === value ? 'bg-surface2 text-ink ring-1 ring-line' : 'text-muted hover:text-ink'}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

const Btn = ({ onClick, children, primary }: { onClick: () => void; children: ReactNode; primary?: boolean }) => (
  <button onClick={onClick}
    className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${primary ? 'bg-ink text-canvas hover:bg-white' : 'text-sub hover:bg-surface2 hover:text-ink'}`}>
    {children}
  </button>
);

const Section = ({ color, children }: { color: string; children: ReactNode }) => (
  <div className="flex items-center gap-2 px-5 pb-1 pt-4 text-[12px] font-semibold uppercase tracking-wide text-ink">
    <span className="h-2 w-2 rounded-full" style={{ background: color }} />{children}
  </div>
);

function PeriodCard({ label, net, rev, active, onClick }: { label: string; net: number; rev: number; active: boolean; onClick: () => void }) {
  const n = useCountUp(net);
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`flex min-w-0 flex-1 flex-col justify-center rounded-xl px-5 text-left ring-1 transition-colors ${active ? 'bg-surface2 ring-2 ring-ink/70' : 'bg-surface ring-line/70 hover:bg-surface2/60'}`}>
      <div className="flex items-center justify-between text-[13px]">
        <span className={active ? 'font-semibold text-ink' : 'text-muted'}>{label}</span>
        {active && <span className="rounded bg-ink px-1.5 text-[10px] font-semibold uppercase leading-4 text-canvas">Showing</span>}
      </div>
      <div title={money(net)} className={`tnum text-[26px] font-semibold leading-9 ${n < 0 ? 'text-cost' : 'text-ink'}`}>{compact(n)}</div>
      <div className="text-[12px] text-muted">net profit on <span className="text-sub" title={money(rev)}>{compact(rev)}</span></div>
    </button>
  );
}

type StepProps = { label: string; value: string; exact?: string; sub: ReactNode; breakdown?: [string, number][]; tone?: string; bar?: number };

function Step({ label, value, exact, sub, breakdown, tone = 'text-ink', bar }: StepProps) {
  return (
    <div className="group relative flex min-w-0 flex-1 flex-col rounded-lg bg-surface2/70 px-3 py-2.5">
      <div className="truncate text-[11px] font-medium uppercase leading-4 tracking-wide text-muted">{label}</div>
      <div title={exact} className={`tnum mt-1 truncate text-[20px] font-semibold leading-6 ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] leading-[14px] text-muted">{sub}</div>
      {bar !== undefined && (
        <div className="mt-auto h-1 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-net" style={{ width: `${Math.max(0, Math.min(1, bar)) * 100}%` }} />
        </div>
      )}
      {breakdown && (
        <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-[240px] -translate-x-1/2 rounded-lg bg-surface2 px-3 py-2.5 text-[12px] leading-[18px] shadow-2xl ring-1 ring-line group-hover:block">
          {breakdown.map(([l, v]) => (
            <div key={l} className="flex justify-between gap-4">
              <span className="text-muted">{l}</span><span className="tnum text-ink">{money(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const Arrow = () => (
  <svg viewBox="0 0 12 24" className="h-6 w-3 shrink-0 self-center text-muted" aria-hidden><path d="M2 4l7 8-7 8" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
);

function ChainRow({ name, color, c, agentsSub, revSub, rates }: {
  name: string; color: string; c: Chain; agentsSub: string; revSub: string; rates: { conv: number; place: number };
}) {
  const range = (a: number, b: number, f: (v: number) => string) => (Math.abs(a - b) < 1e-9 ? f(b) : `${f(a)} → ${f(b)}`);
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-ink">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />{name}
      </div>
      <div className="flex h-[92px] items-stretch gap-1.5">
        <Step label="Agents" value={range(c.agentsStart, c.agentsEnd, int)} sub={agentsSub} />
        <Arrow />
        <Step label="Calls" value={count(c.calls)} exact={int(c.calls)} sub={`${range(c.callsPerDayStart, c.callsPerDayEnd, int)} a day`} />
        <Arrow />
        <Step label="Applications" value={count(c.apps)} exact={int(c.apps)} sub={`${pct(rates.conv)} of calls`} />
        <Arrow />
        <Step label="Policies" value={count(c.placed)} exact={int(c.placed)} sub={`${pct(rates.place)} of apps placed`} />
        <Arrow />
        <Step label="Revenue" value={compact(c.revenue)} exact={money(c.revenue)} sub={revSub} breakdown={[...c.revParts, ['Total revenue', c.revenue]]} />
        <Arrow />
        <Step label="Costs" value={compact(c.costs)} exact={money(c.costs)} sub="Hover for breakdown" tone="text-sub"
          breakdown={[['Agent payouts', c.payouts], ['Call costs', c.callCosts], ['Chargebacks (lapses)', c.chargebacks], ['Retention cost', c.retention], ['Total costs', c.costs]]} />
        <Arrow />
        <Step label="Net profit" value={compact(c.net)} exact={money(c.net)} sub={`${pct(c.margin)} margin`} tone={c.net < 0 ? 'text-cost' : 'text-net'} bar={c.margin} />
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70" onMouseDown={onClose}>
      <div className="rounded-2xl bg-surface p-6 shadow-2xl ring-1 ring-line" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-md text-muted hover:bg-surface2 hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}


// ---------- app ----------
type Tab = 'Final Expense' | 'Medicare' | 'Other';
type View = 'Cash flow' | 'Team' | 'Profit by year' | 'Medicare' | 'Table';
const PERIODS = ['Year 1', 'Year 2', 'Year 3', 'All 3 years'];

export default function App() {
  const [state, setState] = useState<State>(loadState);
  const { inputs, names, goal, page } = state;
  const out = useMemo(() => runModel(inputs), [inputs]);
  const [tab, setTab] = useState<Tab>('Final Expense');
  const [advanced, setAdvanced] = useState(false);
  const [period, setPeriod] = useState(3);
  const [view, setView] = useState<View>('Cash flow');
  const [modal, setModal] = useState<null | 'notes' | 'month'>(null);
  const [detailYear, setDetailYear] = useState<'Year 1' | 'Year 2' | 'Year 3'>('Year 1');
  const [copied, setCopied] = useState(false);
  const [box, setBox] = useState({ s: 1, w: 1440, h: 900 });

  useEffect(() => {
    // Design is at least 1440×900; scale to fit, then let the canvas fill the window exactly (no letterboxing).
    const f = () => {
      const s = Math.min(innerWidth / 1440, innerHeight / 900);
      setBox({ s, w: innerWidth / s, h: innerHeight / s });
    };
    f();
    addEventListener('resize', f);
    return () => removeEventListener('resize', f);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
    const q = shareQuery(state);
    history.replaceState(null, '', q ? `?${q}` : location.pathname);
  }, [state]);

  const setInput = (k: InputKey, v: number) => setState((s) => ({ ...s, inputs: { ...s.inputs, [k]: v } }));
  const setGoal = (goal: GoalState) => setState((s) => ({ ...s, goal }));
  const setPage = (page: Page) => setState((s) => ({ ...s, page }));
  const setName = (i: number, n: string) => setState((s) => ({ ...s, names: s.names.map((x, j) => (j === i ? n : x)) }));
  const splitsOk = Math.abs(out.splitTotal - 1) < 1e-6;
  const ctl = (c: Ctl, accent: string, dense = false) => (
    <Control key={c[0]} ctl={c} value={inputs[c[0]]} onChange={(v) => setInput(c[0], v)} accent={accent} dense={dense} />
  );
  const detailMonths = out.fe.slice((+detailYear.slice(-1) - 1) * 12, +detailYear.slice(-1) * 12);
  const p = out.periods[period];
  const periodNet = period < 3 ? out.years[period].totalNet : out.cumulative.totalNet;
  const partnerCol = (i: number) => (period < 3 ? out.partners[i].yearly[period] : out.partners[i].total);

  return (
    <div className="h-full w-full bg-canvas">
      <div className="relative flex flex-col overflow-hidden bg-canvas text-ink" style={{ width: box.w, height: box.h, transform: `scale(${box.s})`, transformOrigin: 'top left' }}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line/70 px-6">
          <h1 className="text-[16px] font-semibold tracking-tight">Insurance Outlook</h1>
          <span className="text-[13px] text-muted">Final Expense + Medicare · 3-year plan</span>
          <div className="ml-6 flex rounded-lg bg-surface p-0.5 ring-1 ring-line">
            {(['Planner', 'Income goal'] as const).map((v) => (
              <button key={v} onClick={() => setPage(v)}
                className={`rounded-md px-3 py-1 text-[13px] font-medium transition-colors ${page === v ? (v === 'Income goal' ? 'goal-tab text-white' : 'bg-surface2 text-ink') : 'text-muted hover:text-ink'}`}>
                {v === 'Income goal' ? '✦ Income goal' : v}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Btn onClick={() => setModal('notes')}>Model notes</Btn>
            <Btn onClick={() => setState((s) => ({ ...s, inputs: { ...DEFAULTS }, names: [...DEFAULT_NAMES], goal: GOAL_DEFAULT }))}>Reset</Btn>
            <Btn onClick={() => navigator.clipboard.writeText(location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
              {copied ? 'Link copied ✓' : 'Copy share link'}
            </Btn>
            <Btn primary onClick={() => exportCsv(out)}>Export CSV</Btn>
          </div>
        </header>

        {page === 'Income goal' ? <Goal inputs={inputs} names={names} goal={goal} setGoal={setGoal} /> : (
        <div className="flex min-h-0 flex-1 gap-4 p-4">
          {/* assumptions */}
          <Card className="flex w-[310px] shrink-0 flex-col overflow-hidden">
            <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-line/70 px-5">
              <h2 className="text-[14px] font-semibold">Assumptions</h2>
              <button role="switch" aria-checked={advanced} onClick={() => setAdvanced(!advanced)} className="flex items-center gap-2 text-[13px] text-sub">
                Advanced
                <span className={`relative h-5 w-9 rounded-full transition-colors ${advanced ? 'bg-fe' : 'bg-line'}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${advanced ? 'left-[18px]' : 'left-0.5'}`} />
                </span>
              </button>
            </div>
            {!advanced ? (
              <div>
                <Section color={C.fe}>Final Expense</Section>
                {FE_BASIC.map((c) => ctl(c, C.fe))}
                <Section color={C.md}>Medicare</Section>
                {MD_BASIC.map((c) => ctl(c, C.md))}
              </div>
            ) : (
              <>
                <div className="flex shrink-0 gap-1 px-4 pt-3">
                  <Tabs value={tab} options={['Final Expense', 'Medicare', 'Other']} onChange={setTab} />
                </div>
                {tab === 'Final Expense' && <div>{FE_BASIC.map((c) => ctl(c, C.fe, true))}<Section color={C.fe}>Advanced</Section>{FE_ADV.map((c) => ctl(c, C.fe, true))}</div>}
                {tab === 'Medicare' && <div>{MD_BASIC.map((c) => ctl(c, C.md, true))}<Section color={C.md}>Advanced</Section>{MD_ADV.map((c) => ctl(c, C.md, true))}</div>}
                {tab === 'Other' && <div className="pt-2">{SHARED_CTLS.map((c) => ctl(c, C.net))}</div>}
              </>
            )}
          </Card>

          {/* main */}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex h-[92px] shrink-0 gap-3">
              {PERIODS.map((label, i) => (
                <PeriodCard key={label} label={label} active={period === i} onClick={() => setPeriod(i)}
                  net={i < 3 ? out.years[i].totalNet : out.cumulative.totalNet} rev={i < 3 ? out.years[i].totalRev : out.cumulative.totalRev} />
              ))}
            </div>

            <Card className="shrink-0 px-4 pb-4 pt-3">
              <div className="mb-2 flex items-baseline gap-3">
                <h2 className="text-[14px] font-semibold">What it takes · {PERIODS[period]}</h2>
                <span className="text-[12px] text-muted">Each step feeds the next — change an assumption and watch it flow through. Hover revenue or costs for the breakdown.</span>
              </div>
              <div className="flex flex-col gap-3">
                <ChainRow name="Final Expense" color={C.fe} c={p.fe} rates={{ conv: inputs.feConv, place: inputs.fePlace }}
                  agentsSub={`${int(inputs.feCallsPerAgent)} calls/day each`}
                  revSub={`${money(inputs.feComm)}/policy · ${pct(inputs.feAdvance)} up front`} />
                <ChainRow name="Medicare" color={C.md} c={p.md} rates={{ conv: inputs.mdConv, place: inputs.mdPlace }}
                  agentsSub={`${int(inputs.mdCallsPerAgent)} calls/day · 5 mo/yr`}
                  revSub={`${money(inputs.mdComm)}/policy + residuals`} />
              </div>
            </Card>

            <div className="flex min-h-0 flex-1 gap-4">
            <Card className="flex min-w-0 flex-1 flex-col p-4">
              <div className="mb-2 flex items-center gap-3">
                <Tabs value={view} options={['Cash flow', 'Team', 'Profit by year', 'Medicare', 'Table']} onChange={setView} />
                <span className="ml-auto" />
                {view === 'Cash flow' && <Btn onClick={() => setModal('month')}>Month detail</Btn>}
              </div>
              <div className="min-h-0 flex-1">
                {view === 'Cash flow' && <CashFlowChart out={out} />}
                {view === 'Team' && <TeamChart out={out} />}
                {view === 'Profit by year' && <OverviewChart out={out} />}
                {view === 'Medicare' && <MedicareChart out={out} />}
                {view === 'Table' && (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="h-7 border-b border-line text-muted">
                        <th className="text-left font-medium" />
                        {[1, 2, 3].map((y) => <th key={y} className="w-[22%] text-right font-medium">Year {y}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {SUMMARY_ROWS.map(([k, label, style]) => (
                        <tr key={k} className={`h-[21px] ${style === 'n' ? 'border-b border-line font-semibold' : ''}`}>
                          <td className={style === 'n' ? 'text-ink' : style === 't' ? 'text-sub' : 'pl-4 text-muted'}>{label}</td>
                          {out.years.map((y, i) => (
                            <td key={i} className={`text-right ${y[k] < 0 ? 'text-cost' : style ? 'text-ink' : 'text-sub'}`}>{money(y[k])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>

            {/* right: partners + per-policy */}
            <div className="flex w-[360px] shrink-0 flex-col gap-4">
            <Card className="px-4 py-3">
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className="text-[14px] font-semibold">Partner payouts</h2>
                <span className="text-[12px] text-muted">{inputs.holdback === 0 ? 'pre-tax' : `after ${pct(inputs.holdback)} holdback`}</span>
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="h-7 text-[12px] text-muted">
                    <th className="text-left font-medium">Partner</th>
                    <th className="w-[64px] text-right font-medium">Split</th>
                    <th className="w-[84px] text-right font-medium">{PERIODS[period]}</th>
                    {period < 3 && <th className="w-[76px] text-right font-medium">3 years</th>}
                  </tr>
                </thead>
                <tbody>
                  {out.partners.map((pt, i) => (
                    <tr key={i} className="h-9 border-t border-line/70">
                      <td>
                        <input aria-label={`Partner ${i + 1} name`} value={names[i]} onChange={(e) => setName(i, e.target.value)} maxLength={24}
                          className="w-full min-w-0 rounded bg-transparent py-1 font-medium text-ink outline-none hover:bg-surface2 focus:bg-surface2" />
                      </td>
                      <td className="text-right">
                        <span className={`inline-flex h-7 w-[58px] items-center rounded-md bg-surface2 px-1.5 ring-1 ${splitsOk ? 'ring-line' : 'ring-cost'}`}>
                          <input type="number" aria-label={`${names[i]} split`} min={0} max={100} step={0.5} value={+(inputs[SPLIT_KEYS[i]] * 100).toFixed(4)}
                            onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setInput(SPLIT_KEYS[i], clamp(e.target.valueAsNumber, 0, 100) / 100)}
                            className="w-full min-w-0 bg-transparent text-right outline-none" />
                          <span className="text-muted">%</span>
                        </span>
                      </td>
                      {splitsOk ? (
                        <>
                          <td title={money(partnerCol(i))} className={`text-right font-semibold ${partnerCol(i) < 0 ? 'text-cost' : 'text-ink'}`}>{compact(partnerCol(i))}</td>
                          {period < 3 && <td title={money(pt.total)} className="text-right text-sub">{compact(pt.total)}</td>}
                        </>
                      ) : <td colSpan={period < 3 ? 2 : 1} className="text-right text-muted">—</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!splitsOk && (
                <div className="mt-2 rounded-md bg-cost/10 px-3 py-2 text-[12px] text-cost">
                  Splits add up to {num1(out.splitTotal * 100)}%. Make them total 100% to see payouts.
                </div>
              )}
              {splitsOk && <div className="mt-2 text-[12px] text-muted">Company net {PERIODS[period].toLowerCase()}: <span className="text-sub">{money(periodNet)}</span></div>}
            </Card>

            <Card className="grid shrink-0 grid-cols-3 divide-x divide-line/70 py-3">
              {([['FE net / policy', money(out.unit.feNetPerPlaced), ''], ['Medicare net / policy', money(out.unit.mdNetPerPlaced), ''],
                ['FE owed after mo 36', compact(out.unit.receivableAfter36), money(out.unit.receivableAfter36)]] as const).map(([l, v, t]) => (
                <div key={l} className="px-4" title={t || undefined}>
                  <div className="whitespace-nowrap text-[11px] text-muted">{l}</div>
                  <div className="tnum text-[17px] font-semibold">{v}</div>
                </div>
              ))}
            </Card>
            </div>
            </div>
          </div>
        </div>
        )}

        {modal === 'notes' && (
          <Modal title="Model notes" onClose={() => setModal(null)} width={960}>
            <div className="grid grid-cols-[1.4fr_1fr] gap-8 text-[13px] leading-relaxed">
              <div>
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Math corrections vs the original spreadsheet</h3>
                <ol className="list-decimal space-y-2 pl-4 text-sub">
                  <li><b className="text-ink">Months 10–12 carry-over added.</b> The spreadsheet dropped the portion of months 2 and 3 policies paid in the following year (months 13–14 and 25–26). Every tail payment is now placed in the month it is actually received. At defaults, Year 2 FE Months 10–12 goes from $684,797.30 to $703,305.33, and Year 3 from $1,499,150.84 to $1,591,691.01.</li>
                  <li><b className="text-ink">Fixed two broken cells.</b> A hardcoded 18508 in B18 and wrong-column references in D18, O18 and P18 are replaced by the payment schedule.</li>
                  <li><b className="text-ink">Hardcoded rates made into controls.</b> Every FE 0.7 retention factor now follows the FE Lapse Rate: (1 − feLapse), in months 10–12 and renewals. Every Medicare 0.7 residual factor now follows the Medicare Lapse Rate: (1 − mdLapse), 80% at defaults. The $780 commission, 75% advance, 5% renewal, 2% retention cost and 20.86 working days are now controls.</li>
                  <li><b className="text-ink">Effect on totals at defaults.</b> Total Net Year 2 goes from $4,039,068.04 to $4,223,303.67, and Year 3 from $8,454,977.68 to $9,127,644.00. Year 1 is unchanged.</li>
                </ol>
              </div>
              <div>
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Assumptions</h3>
                <ul className="list-disc space-y-2 pl-4 text-sub">
                  <li>FE commissions are 75% advanced; the remaining 25% is paid as earned in policy months 10–12 on active policies.</li>
                  <li>Renewals are paid as earned.</li>
                  <li>Medicare runs 5 selling months per year ({MD_MONTHS.join(', ')}).</li>
                  <li>Retention cost is a percentage of revenue.</li>
                  <li>Partner figures are before tax unless a holdback is set.</li>
                  <li>Any retention factor is (1 − that line's lapse rate).</li>
                </ul>
              </div>
            </div>
          </Modal>
        )}

        {modal === 'month' && (
          <Modal title="Final Expense month detail" onClose={() => setModal(null)} width={1400}>
            <div className="mb-3"><Tabs value={detailYear} options={['Year 1', 'Year 2', 'Year 3']} onChange={setDetailYear} /></div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="h-8 text-muted">
                  <th className="text-left font-medium" />
                  {detailMonths.map((r) => <th key={r.month} className="text-right font-medium">Mo {r.month}</th>)}
                </tr>
              </thead>
              <tbody>
                {FE_ROWS.map(([k, label, kind]) => (
                  <tr key={k} className={`h-[26px] border-t border-line/60 ${k === 'net' || k === 'totalCost' || k === 'cashNet' ? 'font-semibold text-ink' : 'text-sub'}`}>
                    <td className="whitespace-nowrap pr-3 text-muted">{label}</td>
                    {detailMonths.map((r) => <td key={r.month} className={`text-right ${r[k] < 0 ? 'text-cost' : ''}`}>{fmt(kind, r[k])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Modal>
        )}
      </div>
    </div>
  );
}
