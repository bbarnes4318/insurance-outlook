import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULTS, MD_MONTHS, runModel, type InputKey, type Inputs, type Outputs } from './engine/model';
import { FeMonthlyChart, MedicareChart, OverviewChart, Sparkline, C } from './Charts';
import { compact, FE_ROWS, fmt, MD_ROWS, money, num1, pct, SUMMARY_ROWS } from './format';

// ---------- controls ----------
type Unit = '$' | '%' | 'calls' | 'agents' | 'days';
type Ctl = [InputKey, string, number, number, number, Unit]; // key, label, min, max, step (display units), unit

const FE_CTLS: Ctl[] = [
  ['feCallsStart', 'Calls per day (start)', 0, 2000, 10, 'calls'],
  ['feCallsQtrInc', 'Calls per day quarterly increase', 0, 1000, 10, 'calls'],
  ['feConv', 'Conversion % (apps / calls)', 0, 50, 0.5, '%'],
  ['fePlace', 'Placement % (placed / apps)', 0, 100, 1, '%'],
  ['fePayout', 'Agent payout per placed policy', 0, 500, 5, '$'],
  ['feCallCost', 'Cost per call', 0, 50, 0.25, '$'],
  ['feLapse', 'Lapse rate', 0, 80, 1, '%'],
  ['feCallsPerAgent', 'Calls per agent per day', 1, 100, 1, 'calls'],
];
const FE_TERMS: Ctl[] = [
  ['feComm', 'Avg first-year commission per policy', 100, 2000, 10, '$'],
  ['feAdvance', 'Advanced portion', 0, 100, 1, '%'],
  ['feRenew', 'Renewal rate', 0, 25, 0.5, '%'],
];
const MD_CTLS: Ctl[] = [
  ['mdCallsPerAgent', 'Calls per agent per day', 1, 100, 1, 'calls'],
  ['mdConv', 'Conversion %', 0, 50, 0.5, '%'],
  ['mdPlace', 'Placement %', 0, 100, 1, '%'],
  ['mdComm', 'Avg commission per policy', 0, 1500, 10, '$'],
  ['mdPayout', 'Agent payout per placed policy', 0, 500, 5, '$'],
  ['mdCallCost', 'Cost per call', 0, 50, 0.25, '$'],
  ['mdLapse', 'Lapse rate', 0, 80, 1, '%'],
  ['mdAgentsY1', 'Agents – Year 1', 0, 500, 1, 'agents'],
  ['mdAgentsY2', 'Agents – Year 2', 0, 500, 1, 'agents'],
  ['mdAgentsY3', 'Agents – Year 3', 0, 500, 1, 'agents'],
];
const SHARED_CTLS: Ctl[] = [
  ['workDays', 'Working days per month', 15, 26, 0.01, 'days'],
  ['retention', 'Retention cost (% of revenue)', 0, 10, 0.1, '%'],
  ['holdback', 'Tax / reserve holdback before partner payout', 0, 60, 1, '%'],
];
const SPLIT_KEYS: InputKey[] = ['split1', 'split2', 'split3', 'split4'];
const ALL_KEYS = Object.keys(DEFAULTS) as InputKey[];
const DEFAULT_NAMES = ['Partner 1', 'Partner 2', 'Partner 3', 'Partner 4'];
const PARTNER_COLORS = [C.fe, C.md, C.net, C.gold];

const toDisplay = (unit: Unit, v: number) => (unit === '%' ? +(v * 100).toFixed(4) : v);
const fromDisplay = (unit: Unit, v: number) => (unit === '%' ? v / 100 : v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ---------- persistence: URL params → localStorage → defaults ----------
const LS_KEY = 'insurance-outlook-v1';
type State = { inputs: Inputs; names: string[] };

function loadState(): State {
  const inputs = { ...DEFAULTS };
  const names = [...DEFAULT_NAMES];
  const q = new URLSearchParams(location.search);
  let src: Record<string, unknown> | null = null;
  if ([...q.keys()].length) {
    src = Object.fromEntries(q);
    DEFAULT_NAMES.forEach((_, i) => q.has(`n${i + 1}`) && (names[i] = q.get(`n${i + 1}`)!));
  } else {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
      if (s) {
        src = s.inputs;
        if (Array.isArray(s.names) && s.names.length === 4) s.names.forEach((n: unknown, i: number) => typeof n === 'string' && (names[i] = n));
      }
    } catch { /* ignore corrupt storage */ }
  }
  if (src) for (const k of ALL_KEYS) {
    const n = Number(src[k]);
    if (src[k] != null && Number.isFinite(n)) inputs[k] = n;
  }
  return { inputs, names };
}

function shareQuery({ inputs, names }: State) {
  const q = new URLSearchParams();
  for (const k of ALL_KEYS) if (inputs[k] !== DEFAULTS[k]) q.set(k, String(inputs[k]));
  names.forEach((n, i) => n !== DEFAULT_NAMES[i] && q.set(`n${i + 1}`, n));
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
function useCountUp(target: number, ms = 250) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const cur = a + (target - a) * (1 - (1 - p) ** 3);
      from.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Control({ ctl, value, onChange, accent }: { ctl: Ctl; value: number; onChange: (v: number) => void; accent: string }) {
  const [key, label, min, max, step, unit] = ctl;
  const shown = toDisplay(unit, value);
  const [draft, setDraft] = useState(String(shown));
  useEffect(() => setDraft(String(shown)), [shown]);
  const changed = Math.abs(value - DEFAULTS[key]) > 1e-9;
  const set = (d: number) => onChange(fromDisplay(unit, clamp(d, min, max)));
  const fill = `${((clamp(shown, min, max) - min) / (max - min)) * 100}%`;
  return (
    <div className="flex h-[60px] flex-col justify-center gap-1.5 border-b border-line/50 px-4">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="truncate text-ink/90">{label}</span>
        {changed && (
          <button title="Reset to default" onClick={() => onChange(DEFAULTS[key])}
            className="h-2 w-2 shrink-0 rounded-full hover:scale-150" style={{ background: accent }} />
        )}
      </div>
      <div className="flex items-center gap-3">
        <input type="range" aria-label={label} min={min} max={max} step={step} value={shown} onChange={(e) => set(+e.target.value)}
          className="min-w-0 flex-1 cursor-pointer" style={{ ['--accent' as string]: accent, ['--fill' as string]: fill }} />
        <div className="flex h-7 w-[112px] shrink-0 items-center rounded-md border border-line bg-canvas px-2 text-[12px] focus-within:border-muted">
          {unit === '$' && <span className="text-muted">$</span>}
          <input type="number" aria-label={`${label} value`} min={min} max={max} step={step} value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n) && n >= min && n <= max) set(n);
            }}
            onBlur={() => (Number.isFinite(+draft) && draft !== '' ? set(+draft) : setDraft(String(shown)))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full min-w-0 bg-transparent text-right outline-none" />
          <span className="ml-1 text-muted">{unit === '$' ? '' : unit === '%' ? '%' : unit}</span>
        </div>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, accent = C.fe }: { value: T; options: T[]; onChange: (v: T) => void; accent?: string }) {
  return (
    <div className="flex rounded-lg border border-line bg-canvas p-0.5 text-[12px]">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={`rounded-md px-3 py-1 transition-colors ${o === value ? 'bg-surface2 font-medium text-ink' : 'text-muted hover:text-ink'}`}
          style={o === value ? { boxShadow: `inset 0 -2px 0 ${accent}` } : undefined}>
          {o}
        </button>
      ))}
    </div>
  );
}

const Card = ({ className = '', children }: { className?: string; children: ReactNode }) => (
  <div className={`rounded-xl border border-line bg-surface ${className}`}>{children}</div>
);

const Btn = ({ onClick, children, primary }: { onClick: () => void; children: ReactNode; primary?: boolean }) => (
  <button onClick={onClick}
    className={`h-8 rounded-lg border px-3 text-[12px] font-medium transition-colors ${primary ? 'border-fe/40 bg-fe/10 text-fe hover:bg-fe/20' : 'border-line bg-surface text-ink/90 hover:border-muted'}`}>
    {children}
  </button>
);

function Kpi({ title, net, rev, margin, accent }: { title: string; net: number; rev: number; margin: number; accent: string }) {
  const n = useCountUp(net);
  const r = useCountUp(rev);
  return (
    <Card className="relative flex-1 overflow-hidden px-4 py-3">
      <div className="absolute inset-x-0 top-0 h-0.5" style={{ background: accent }} />
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">{title}</div>
      <div title={money(net)} className={`mt-0.5 text-[26px] font-semibold leading-tight ${net < 0 ? 'text-cost' : 'text-ink'}`}>{compact(n)}</div>
      <div className="mt-0.5 flex items-center justify-between whitespace-nowrap text-[11px]">
        <span className="text-muted" title={money(rev)}>Revenue <span className="text-ink/80">{compact(r)}</span></span>
        <span className={`rounded-md px-1.5 py-px font-medium ${margin < 0 ? 'bg-cost/15 text-cost' : 'bg-net/15 text-net'}`}>{pct(margin)} margin</span>
      </div>
    </Card>
  );
}

function Modal({ title, onClose, children, width }: { title: string; onClose: () => void; children: ReactNode; width: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xl" style={{ width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} className="h-7 w-7 rounded-md text-muted hover:bg-surface2 hover:text-ink">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- app ----------
type Tab = 'Final Expense' | 'Medicare' | 'Shared';
type ChartMode = '3-Year Overview' | 'FE Monthly' | 'Medicare Seasons';

export default function App() {
  const [state, setState] = useState<State>(loadState);
  const { inputs, names } = state;
  const out = useMemo(() => runModel(inputs), [inputs]);
  const [tab, setTab] = useState<Tab>('Final Expense');
  const [chart, setChart] = useState<ChartMode>('3-Year Overview');
  const [modal, setModal] = useState<null | 'notes' | 'month'>(null);
  const [detailYear, setDetailYear] = useState<'Year 1' | 'Year 2' | 'Year 3'>('Year 1');
  const [copied, setCopied] = useState(false);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const f = () => setScale(Math.min(innerWidth / 1600, innerHeight / 900));
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
  const setName = (i: number, n: string) => setState((s) => ({ ...s, names: s.names.map((x, j) => (j === i ? n : x)) }));
  const splitsOk = Math.abs(out.splitTotal - 1) < 1e-6;
  const taxLabel = inputs.holdback === 0 ? 'pre-tax' : `after ${pct(inputs.holdback)} holdback`;

  const ctl = (c: Ctl, accent: string) => <Control key={c[0]} ctl={c} value={inputs[c[0]]} onChange={(v) => setInput(c[0], v)} accent={accent} />;

  const splitInput = (i: number, cls = '') => (
    <div className={`flex h-7 items-center rounded-md border px-2 text-[12px] ${splitsOk ? 'border-line' : 'border-cost/60'} bg-canvas ${cls}`}>
      <input type="number" aria-label={`${names[i]} split`} min={0} max={100} step={0.5} value={+(inputs[SPLIT_KEYS[i]] * 100).toFixed(4)}
        onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setInput(SPLIT_KEYS[i], clamp(e.target.valueAsNumber, 0, 100) / 100)}
        className="w-full min-w-0 bg-transparent text-right outline-none" />
      <span className="ml-1 text-muted">%</span>
    </div>
  );
  const nameInput = (i: number, cls = '') => (
    <input aria-label={`Partner ${i + 1} name`} value={names[i]} onChange={(e) => setName(i, e.target.value)} maxLength={24}
      className={`min-w-0 rounded-md border border-transparent bg-transparent px-1 outline-none hover:border-line focus:border-muted ${cls}`} />
  );

  return (
    <div className="grid h-full w-full place-items-center bg-bg">
      <div style={{ width: 1600 * scale, height: 900 * scale }}>
        <div className="relative flex h-[900px] w-[1600px] flex-col overflow-hidden bg-canvas text-ink" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {/* top bar */}
          <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
            <div className="flex items-center gap-2.5">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-fe to-md text-[13px] font-bold text-canvas">IO</div>
              <h1 className="text-[16px] font-semibold tracking-tight">Insurance Outlook</h1>
              <span className="text-[12px] text-muted">Final Expense + Medicare · 3-year plan</span>
            </div>
            <div className="ml-auto flex gap-2">
              <Btn onClick={() => setModal('notes')}>Model notes</Btn>
              <Btn onClick={() => setState({ inputs: { ...DEFAULTS }, names: [...DEFAULT_NAMES] })}>Reset to defaults</Btn>
              <Btn onClick={() => {
                navigator.clipboard.writeText(location.href).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
              }}>{copied ? 'Link copied ✓' : 'Copy share link'}</Btn>
              <Btn primary onClick={() => exportCsv(out)}>Export CSV</Btn>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 gap-3 p-3">
            {/* left rail */}
            <Card className="flex w-[360px] shrink-0 flex-col overflow-hidden">
              <div className="flex border-b border-line p-2">
                {(['Final Expense', 'Medicare', 'Shared'] as Tab[]).map((t) => {
                  const col = t === 'Final Expense' ? C.fe : t === 'Medicare' ? C.md : C.net;
                  return (
                    <button key={t} onClick={() => setTab(t)}
                      className={`flex-1 rounded-md py-1.5 text-[12px] font-medium ${tab === t ? 'bg-surface2 text-ink' : 'text-muted hover:text-ink'}`}
                      style={tab === t ? { boxShadow: `inset 0 -2px 0 ${col}` } : undefined}>{t}</button>
                  );
                })}
              </div>
              {tab === 'Final Expense' && (
                <div>
                  {FE_CTLS.map((c) => ctl(c, C.fe))}
                  <div className="bg-surface2/50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-fe">FE commission terms</div>
                  {FE_TERMS.map((c) => ctl(c, C.fe))}
                </div>
              )}
              {tab === 'Medicare' && (
                <div>
                  {MD_CTLS.map((c) => ctl(c, C.md))}
                  <div className="px-4 py-3 text-[11px] leading-relaxed text-muted">
                    Selling months fixed at 5 per year: {MD_MONTHS.join(', ')}. Residual revenue follows (1 − lapse rate).
                  </div>
                </div>
              )}
              {tab === 'Shared' && (
                <div>
                  {SHARED_CTLS.map((c) => ctl(c, C.net))}
                  <div className="bg-surface2/50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-net">Partners &amp; splits</div>
                  {names.map((_, i) => (
                    <div key={i} className="flex h-[52px] items-center gap-3 border-b border-line/50 px-4">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PARTNER_COLORS[i] }} />
                      {nameInput(i, 'h-7 flex-1 text-[13px]')}
                      {splitInput(i, 'w-[92px]')}
                    </div>
                  ))}
                  <div className={`px-4 py-2 text-[12px] ${splitsOk ? 'text-muted' : 'text-cost'}`}>
                    Splits total {num1(out.splitTotal * 100)}%{splitsOk ? '' : ' — must equal 100%'}
                  </div>
                </div>
              )}
            </Card>

            {/* center */}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex h-[100px] shrink-0 gap-3">
                {out.years.map((y, i) => <Kpi key={i} title={`Year ${i + 1} Net`} net={y.totalNet} rev={y.totalRev} margin={y.margin} accent={C.net} />)}
                <Kpi title="3-Year Cumulative Net" net={out.cumulative.totalNet} rev={out.cumulative.totalRev} margin={out.cumulative.margin} accent={C.gold} />
              </div>

              <Card className="flex min-h-0 flex-1 flex-col px-3 pb-2 pt-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <Segmented value={chart} options={['3-Year Overview', 'FE Monthly', 'Medicare Seasons']} onChange={setChart}
                    accent={chart === 'Medicare Seasons' ? C.md : C.fe} />
                  {chart === 'FE Monthly' && <Btn onClick={() => setModal('month')}>Month detail ⤢</Btn>}
                  {chart === 'Medicare Seasons' && <span className="text-[11px] text-muted">Values per selling month</span>}
                </div>
                <div className="min-h-0 flex-1">
                  {chart === '3-Year Overview' && <OverviewChart out={out} />}
                  {chart === 'FE Monthly' && <FeMonthlyChart out={out} />}
                  {chart === 'Medicare Seasons' && <MedicareChart out={out} />}
                </div>
              </Card>

              <Card className="shrink-0 px-4 py-2">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="h-[22px] text-[11px] uppercase tracking-wider text-muted">
                      <th className="text-left font-medium">Overall Outlook</th>
                      {[1, 2, 3].map((y) => <th key={y} className="w-[150px] text-right font-medium">Year {y}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {SUMMARY_ROWS.map(([k, label, style]) => (
                      <tr key={k} className={`h-[22px] ${style ? 'border-t border-line/60' : ''} ${style === 'n' ? 'font-semibold' : ''}`}>
                        <td className={`${style === 'n' ? 'text-ink' : style === 't' ? 'text-ink/90' : 'pl-3 text-muted'}`}>
                          {style === 'n' && <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: k === 'totalNet' ? C.net : k === 'feNet' ? C.fe : C.md }} />}
                          {label}
                        </td>
                        {out.years.map((y, i) => (
                          <td key={i} className={`text-right ${y[k] < 0 ? 'text-cost' : style === 'n' ? 'text-ink' : 'text-ink/80'}`}>{money(y[k])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>

            {/* right: partners */}
            <div className="flex w-[360px] shrink-0 flex-col gap-3">
              <Card className="flex flex-col p-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-[13px] font-semibold">Partners</h3>
                  <span className="text-[11px] text-muted">Net income · {taxLabel}</span>
                </div>
                {!splitsOk && (
                  <div className="mb-2 rounded-md border border-cost/40 bg-cost/10 px-2 py-1 text-[11px] text-cost">
                    Splits total {num1(out.splitTotal * 100)}%. They must equal 100% to show partner income.
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {out.partners.map((p, i) => (
                    <div key={i} className="rounded-lg border border-line/70 bg-surface2/40 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PARTNER_COLORS[i] }} />
                        {nameInput(i, 'h-6 flex-1 text-[13px] font-medium')}
                        {splitInput(i, 'h-6 w-[76px]')}
                      </div>
                      <div className={`mt-1.5 flex items-end gap-3 ${splitsOk ? '' : 'opacity-25 blur-[2px]'}`}>
                        <div className="grid flex-1 grid-cols-3 gap-x-2 text-[11px]">
                          {p.yearly.map((v, y) => (
                            <div key={y}>
                              <div className="text-muted">Y{y + 1}</div>
                              <div className={v < 0 ? 'text-cost' : 'text-ink/90'} title={money(v)}>{compact(v)}</div>
                            </div>
                          ))}
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wider text-muted">3-yr</div>
                          <div className={`text-[15px] font-semibold ${p.total < 0 ? 'text-cost' : 'text-net'}`} title={money(p.total)}>{compact(p.total)}</div>
                        </div>
                        <Sparkline values={p.yearly} color={PARTNER_COLORS[i]} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="flex-1 p-3">
                <h3 className="mb-2 px-1 text-[13px] font-semibold">Unit Economics</h3>
                <div className="flex flex-col text-[12px]">
                  <UnitRow label="FE net per placed policy" values={[money(out.unit.feNetPerPlaced)]} color={C.fe} />
                  <UnitRow label="Medicare net per placed policy" values={[money(out.unit.mdNetPerPlaced)]} color={C.md} />
                  <UnitRow label="FE agents needed" sub={['M12', 'M24', 'M36']} values={out.unit.feAgentsAt.map(num1)} color={C.fe} />
                  <UnitRow label="Medicare agents" sub={['Y1', 'Y2', 'Y3']} values={out.unit.mdAgents.map(num1)} color={C.md} />
                  <UnitRow label="FE policies placed" sub={['Y1', 'Y2', 'Y3']} values={out.unit.fePlacedPerYear.map((v) => Math.round(v).toLocaleString('en-US'))} color={C.fe} />
                  <UnitRow label="FE months 10–12 unpaid after M36" values={[money(out.unit.receivableAfter36)]} color={C.gold} />
                </div>
              </Card>
            </div>
          </div>

          {modal === 'notes' && (
            <Modal title="Model notes" onClose={() => setModal(null)} width={920}>
              <div className="grid grid-cols-[1.4fr_1fr] gap-6 text-[12.5px] leading-relaxed">
                <div>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-fe">Math corrections vs the original spreadsheet</h3>
                  <ol className="list-decimal space-y-2 pl-4 text-ink/85">
                    <li><b>Months 10–12 carry-over added.</b> The spreadsheet dropped the portion of months 2 and 3 policies paid in the following year (months 13–14 and 25–26). Every tail payment is now placed in the month it is actually received. At defaults, Year 2 FE Months 10–12 goes from $684,797.30 to $703,305.33, and Year 3 from $1,499,150.84 to $1,591,691.01.</li>
                    <li><b>Fixed two broken cells.</b> A hardcoded 18508 in B18 and wrong-column references in D18, O18 and P18 are replaced by the payment schedule.</li>
                    <li><b>Hardcoded rates made into controls.</b> Every FE 0.7 retention factor now follows the FE Lapse Rate: (1 − feLapse), in months 10–12 and renewals. Every Medicare 0.7 residual factor now follows the Medicare Lapse Rate: (1 − mdLapse), 80% at defaults. The $780 commission, 75% advance, 5% renewal, 2% retention cost and 20.86 working days are now controls.</li>
                    <li><b>Effect on totals at defaults.</b> Total Net Year 2 goes from $4,039,068.04 to $4,223,303.67, and Year 3 from $8,454,977.68 to $9,127,644.00. Year 1 is unchanged.</li>
                  </ol>
                </div>
                <div>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-md">Assumptions</h3>
                  <ul className="list-disc space-y-2 pl-4 text-ink/85">
                    <li>FE commissions are 75% advanced; the remaining 25% is paid as earned in policy months 10–12 on active policies.</li>
                    <li>Renewals are paid as earned.</li>
                    <li>Medicare runs 5 selling months per year (Oct, Nov, Jan, Feb, Mar).</li>
                    <li>Retention cost is a percentage of revenue.</li>
                    <li>Partner figures are before tax unless a holdback is set.</li>
                    <li>Any retention factor is (1 − that line's lapse rate): FE uses the FE lapse rate, Medicare the Medicare lapse rate.</li>
                  </ul>
                </div>
              </div>
            </Modal>
          )}

          {modal === 'month' && (
            <Modal title="FE month detail" onClose={() => setModal(null)} width={1540}>
              <div className="mb-3"><Segmented value={detailYear} options={['Year 1', 'Year 2', 'Year 3']} onChange={setDetailYear} /></div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="h-7 text-muted">
                    <th className="text-left font-medium">Row</th>
                    {out.fe.slice((+detailYear.slice(-1) - 1) * 12, +detailYear.slice(-1) * 12).map((r) => <th key={r.month} className="text-right font-medium">M{r.month}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {FE_ROWS.map(([k, label, kind]) => (
                    <tr key={k} className={`h-[26px] border-t border-line/50 ${k === 'net' || k === 'totalCost' ? 'font-semibold' : ''}`}>
                      <td className="whitespace-nowrap pr-3 text-muted">{label}</td>
                      {out.fe.slice((+detailYear.slice(-1) - 1) * 12, +detailYear.slice(-1) * 12).map((r) => (
                        <td key={r.month} className={`text-right ${r[k] < 0 ? 'text-cost' : 'text-ink/90'}`}>{fmt(kind, r[k])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Modal>
          )}
        </div>
      </div>
    </div>
  );
}

function UnitRow({ label, values, sub, color }: { label: string; values: string[]; sub?: string[]; color: string }) {
  return (
    <div className="flex min-h-[30px] items-center border-b border-line/40 px-1 py-1 last:border-0">
      <span className="h-3 w-0.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="ml-2 flex-1 text-muted">{label}</span>
      <div className="flex gap-3">
        {values.map((v, i) => (
          <div key={i} className="min-w-[46px] text-right">
            {sub && <div className="text-[9px] uppercase text-muted">{sub[i]}</div>}
            <div className="text-ink/90">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
