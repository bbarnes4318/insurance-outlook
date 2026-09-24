import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MD_MONTHS, recipe, type Inputs, type LineRecipe } from './engine/model';
import { C } from './Charts';
import { compact, int, money, num1, pct } from './format';
import { Card, useCountUp } from './ui';

export type GoalState = { amount: number; partner: number; feMix: number };
export const GOAL_DEFAULT: GoalState = { amount: 25000, partner: 0, feMix: 0.8 };

const PRESETS = [10000, 25000, 50000, 100000, 250000];
const SPLITS = ['split1', 'split2', 'split3', 'split4'] as const;

// Animated number. `f` formats the in-flight value so it rolls like an odometer.
function Num({ v, f, className = '', color }: { v: number; f: (n: number) => string; className?: string; color?: string }) {
  const n = useCountUp(Number.isFinite(v) ? v : 0, 450);
  return <span className={`tnum ${className}`} style={{ color }}>{f(n)}</span>;
}

const B = ({ children }: { children: ReactNode }) => <b className="font-semibold text-ink">{children}</b>;

function Stat({ label, v, f, sub, color }: { label: string; v: number; f: (n: number) => string; sub: string; color: string }) {
  return (
    <div className="relative flex-1 overflow-hidden rounded-xl bg-surface2/60 px-4 py-3 ring-1 ring-line/70">
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <Num v={v} f={f} className="mt-0.5 block text-[26px] font-semibold leading-8" />
      <div className="text-[12px] text-muted">{sub}</div>
    </div>
  );
}

// Trapezoid funnel: calls → applications → policies.
function Funnel({ l, color, conv, place }: { l: LineRecipe; color: string; conv: number; place: number }) {
  const stages: [string, number, string, number][] = [
    ['Calls a day', l.callsDay, '', 100],
    ['Applications a day', l.appsDay, `${pct(conv)} convert`, 78],
    ['Policies placed a day', l.policiesDay, `${pct(place)} placed`, 56],
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1">
      {stages.map(([label, v, rate, w], k) => (
        <div key={label} className="relative flex max-h-[84px] min-h-[52px] flex-1 items-center justify-center"
          style={{ width: `${w}%`, clipPath: 'polygon(0 0, 100% 0, 94% 100%, 6% 100%)', background: `linear-gradient(180deg, ${color}${['55', '3d', '28'][k]}, ${color}${['3a', '28', '18'][k]})` }}>
          <div className="text-center leading-tight">
            <Num v={v} f={k === 0 ? int : num1} className="text-[20px] font-semibold" />
            <div className="text-[11px] text-sub">{label}{rate && <span className="text-muted"> · {rate}</span>}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// One dot per agent on the phones.
function Team({ n, color }: { n: number; color: string }) {
  const MAX = 120;
  return (
    <div className="flex min-h-[34px] flex-wrap content-start gap-[5px]">
      {Array.from({ length: Math.min(n, MAX) }, (_, k) => (
        <span key={k} className="goal-dot h-[10px] w-[10px] rounded-full" style={{ background: color, animationDelay: `${Math.min(k, 60) * 12}ms`, boxShadow: `0 0 8px ${color}88` }} />
      ))}
      {n > MAX && <span className="text-[12px] leading-[10px] text-muted">+{int(n - MAX)}</span>}
    </div>
  );
}

// Where one policy's revenue goes.
function PerPolicy({ l, color }: { l: LineRecipe; color: string }) {
  const p = l.perPolicy;
  const parts: [string, number, string][] = [
    ['Agent', p.payout, '#52525b'], ['Leads', p.calls, '#6b6b75'], ['Chargebacks', p.chargeback, '#7f7f89'],
    ['Retention', p.retention, '#94949e'], ['Net', Math.max(0, p.net), C.net],
  ];
  const total = parts.reduce((a, [, v]) => a + v, 0) || 1;
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="text-muted">Each policy: <span className="text-sub">{money(p.revenue)}</span> in</span>
        <span className={p.net > 0 ? 'text-net' : 'text-cost'}>{money(p.net)} profit</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full" style={{ outline: `1px solid ${color}33` }}>
        {parts.map(([k, v, c]) => <div key={k} title={`${k}: ${money(v)}`} className="h-full transition-all duration-500" style={{ width: `${(v / total) * 100}%`, background: c }} />)}
      </div>
      <div className="mt-1 flex gap-3 text-[11px] text-muted">
        {parts.slice(0, 4).map(([k, v]) => <span key={k}>{k} {money(v)}</span>)}
      </div>
    </div>
  );
}

function LineCard({ name, when, color, l, conv, place, perAgent, off }: {
  name: string; when: string; color: string; l: LineRecipe; conv: number; place: number; perAgent: number; off: boolean;
}) {
  return (
    <Card className={`relative flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4 transition-opacity ${off ? 'opacity-35' : ''}`}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl" style={{ background: `${color}22` }} />
      <div className="flex items-baseline gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        <h3 className="text-[14px] font-semibold">{name}</h3>
        <span className="text-[12px] text-muted">{when}</span>
        {l.target > 0 && Number.isFinite(l.target) && <span className="ml-auto text-[12px] text-muted">nets <span className="text-ink">{compact(l.target)}</span>/selling mo.</span>}
      </div>
      <div>
        <div className="mb-1.5 flex items-baseline gap-2">
          <Num v={l.agents} f={int} className="text-[30px] font-bold leading-none" color={color} />
          <span className="text-[13px] text-sub">agents on the phones</span>
          <span className="ml-auto text-[12px] text-muted">{int(perAgent)} calls each / day</span>
        </div>
        <Team n={l.agents} color={color} />
      </div>
      <Funnel l={l} color={color} conv={conv} place={place} />
      <div className="grid grid-cols-3 gap-2 text-[12px]">
        {([['Lead spend', l.callCost], ['Agent payouts', l.payouts], ['Revenue', l.revenue]] as const).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface2/60 px-2.5 py-1.5">
            <div className="text-muted">{k} / mo</div>
            <Num v={v} f={compact} className="text-[15px] font-semibold text-ink" />
          </div>
        ))}
      </div>
      <PerPolicy l={l} color={color} />
    </Card>
  );
}

export function Goal({ inputs, names, goal, setGoal }: { inputs: Inputs; names: string[]; goal: GoalState; setGoal: (g: GoalState) => void }) {
  const share = inputs[SPLITS[goal.partner]];
  const r = useMemo(() => recipe(inputs, goal.amount, share, goal.feMix), [inputs, goal, share]);
  const [draft, setDraft] = useState(int(goal.amount));
  useEffect(() => setDraft(int(goal.amount)), [goal.amount]);
  const set = (p: Partial<GoalState>) => setGoal({ ...goal, ...p });
  const you = names[goal.partner];
  const { fe, md } = r;
  const mdAvg = MD_MONTHS.length / 12; // Medicare per-selling-month → monthly average
  const revenueMo = fe.revenue + md.revenue * mdAvg;
  const costsMo = revenueMo - r.companyNet;
  const hasFe = goal.feMix > 0;
  const hasMd = goal.feMix < 1;
  const planCallsAt36 = inputs.feCallsStart + inputs.feCallsQtrInc * 11;

  // Revenue → costs → every partner's cut (monthly average).
  const payoutOf = (k: number) => r.companyNet * inputs[SPLITS[k]] * (1 - inputs.holdback);
  const partnersTotal = [0, 1, 2, 3].reduce((a, k) => a + payoutOf(k), 0);
  const flow: [string, number, string, boolean?][] = [
    ['Agent payouts', fe.payouts + md.payouts * mdAvg, '#3f3f46'],
    ['Leads', fe.callCost + md.callCost * mdAvg, '#52525b'],
    ['Chargebacks', fe.chargebacks + md.chargebacks * mdAvg, '#63636d'],
    ['Retention', fe.retention + md.retention * mdAvg, '#75757f'],
    ...(inputs.holdback > 0 ? [['Holdback', r.companyNet * inputs.holdback, '#8b8b94'] as [string, number, string]] : []),
    ...names.map((n, k): [string, number, string, boolean] => [n, payoutOf(k), k === goal.partner ? C.net : '#146b4f', k === goal.partner]),
    ...(Math.abs(partnersTotal + r.companyNet * inputs.holdback - r.companyNet) > 1 ? [['Unallocated', Math.max(0, r.companyNet - partnersTotal - r.companyNet * inputs.holdback), '#2a2a2f'] as [string, number, string]] : []),
  ];
  const flowTotal = flow.reduce((a, [, v]) => a + v, 0) || 1;

  return (
    <div className="relative flex min-h-0 flex-1 gap-4 p-4">
      {/* glow */}
      <div className="pointer-events-none absolute left-[30%] top-[-200px] h-[500px] w-[700px] rounded-full opacity-60 blur-[120px]" style={{ background: 'radial-gradient(closest-side, #199e7040, #3987e520, transparent)' }} />

      {/* left: the ask + the recipe in words */}
      <div className="relative flex w-[440px] shrink-0 flex-col gap-4">
        <Card className="relative overflow-hidden p-5">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">I want to take home</div>
          <label className="goal-input mt-2 flex items-baseline gap-1 rounded-xl bg-canvas/60 px-4 py-2 ring-1 ring-line">
            <span className="text-[40px] font-bold text-muted">$</span>
            <input aria-label="Desired monthly net income" inputMode="numeric" value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                const n = +e.target.value.replace(/[^0-9.]/g, '');
                if (Number.isFinite(n)) set({ amount: Math.min(n, 1e8) });
              }}
              onBlur={() => setDraft(int(goal.amount))}
              className="goal-grad w-full min-w-0 bg-transparent text-[52px] font-bold leading-[64px] tracking-tight outline-none" />
            <span className="shrink-0 text-[15px] text-muted">/ month</span>
          </label>
          <div className="mt-3 flex gap-1.5">
            {PRESETS.map((v) => (
              <button key={v} onClick={() => set({ amount: v })}
                className={`flex-1 rounded-md py-1.5 text-[13px] font-medium ring-1 transition-colors ${goal.amount === v ? 'bg-net/15 text-ink ring-net/60' : 'text-sub ring-line hover:bg-surface2'}`}>
                {compact(v).replace('.0K', 'K')}
              </button>
            ))}
          </div>
          <div className="mt-2 text-[12px] text-muted">That's <span className="text-sub">{money(goal.amount * 12)}</span> a year{inputs.holdback > 0 ? ` after a ${pct(inputs.holdback)} holdback` : ', pre-tax'}.</div>

          <div className="mt-4 text-[12px] font-medium text-muted">Whose paycheck?</div>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {names.map((n, k) => (
              <button key={k} onClick={() => set({ partner: k })}
                className={`truncate rounded-md px-2 py-1.5 text-left text-[12px] ring-1 transition-colors ${k === goal.partner ? 'bg-surface2 text-ink ring-ink/60' : 'text-muted ring-line hover:text-ink'}`}>
                <div className="truncate font-medium">{n}</div>
                <div className="text-[11px] opacity-80">{pct(inputs[SPLITS[k]])} split</div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between text-[12px]">
            <span style={{ color: C.fe }}>Final Expense {Math.round(goal.feMix * 100)}%</span>
            <span className="text-muted">profit mix</span>
            <span style={{ color: C.md }}>Medicare {Math.round((1 - goal.feMix) * 100)}%</span>
          </div>
          <input type="range" aria-label="Profit mix, Final Expense share" min={0} max={100} step={5} value={Math.round(goal.feMix * 100)}
            onChange={(e) => set({ feMix: +e.target.value / 100 })} className="mt-1 w-full cursor-pointer"
            style={{ ['--accent' as string]: C.fe, ['--fill' as string]: `${goal.feMix * 100}%` }} />
        </Card>

        <Card className="flex min-h-0 flex-1 flex-col p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[14px] font-semibold">The recipe</h2>
            <span className="text-[12px] text-muted">every workday · {num1(inputs.workDays)} days/mo</span>
          </div>
          {!r.feasible ? (
            <div className="rounded-lg bg-cost/10 p-4 text-[13px] leading-relaxed text-cost">
              {share <= 0 || inputs.holdback >= 1
                ? `${you} has a 0% take — no amount of volume pays them. Give them a split in the planner.`
                : `At today's assumptions a ${fe.perPolicy.net <= 0 && hasFe ? 'Final Expense' : 'Medicare'} policy loses ${money(-Math.min(hasFe ? fe.perPolicy.net : Infinity, hasMd ? md.perPolicy.net : Infinity))} — more volume only digs deeper. Lower call cost or payouts, or raise conversion, in the planner.`}
            </div>
          ) : (
            <ol className="goal-steps flex flex-col gap-3 text-[13px] leading-[19px] text-sub">
              {hasFe && <li>Put <B>{int(fe.agents)} Final Expense agents</B> on the phones, <B>{int(inputs.feCallsPerAgent)} calls</B> each.</li>}
              {hasFe && <li>Buy <B>{int(fe.callsDay)} FE calls a day</B> — <B>{money(fe.callCost / inputs.workDays)}</B>/day in leads.</li>}
              {hasFe && <li>Write <B>{num1(fe.appsDay)} apps a day</B> and get <B>{num1(fe.policiesDay)} placed</B> — <B>{int(fe.policiesMo)} policies</B> a month.</li>}
              {hasMd && <li>Each selling month ({MD_MONTHS.join(', ')}) staff <B>{int(md.agents)} Medicare agents</B> on <B>{int(md.callsDay)} calls a day</B>, placing <B>{num1(md.policiesDay)} a day</B>.</li>}
              <li>That's <B>{compact(revenueMo)}</B> revenue a month; <B>{compact(costsMo)}</B> goes to agents, leads, chargebacks and retention.</li>
              <li>The agency keeps <B>{money(r.companyNet)}</B> a month. {you}'s {pct(share)} is <span className="font-bold text-net">{money(goal.amount)}</span>.</li>
            </ol>
          )}
          {r.feasible && (
            <div className="mt-auto flex flex-col gap-2 pt-3 text-[12px] leading-[17px]">
              {hasFe && (
                <div className="rounded-lg bg-surface2/60 px-3 py-2 text-muted">
                  <span className="text-ink">When: </span>
                  {r.feMonthReached ? <>the current plan hits {int(fe.callsDay)} FE calls/day in <B>month {r.feMonthReached}</B> (year {Math.ceil(r.feMonthReached / 12)}).</>
                    : <>beyond the 3-year plan, which tops out at {int(planCallsAt36)} FE calls/day.</>}
                </div>
              )}
              {hasFe && <div className="rounded-lg bg-surface2/60 px-3 py-2 text-muted"><span className="text-ink">Ramp: </span>months 1–9 pay about <span className="text-sub">{money(r.youEarly)}</span>/mo until the held-back 25% starts landing.</div>}
              <div className="rounded-lg bg-net/10 px-3 py-2 text-muted"><span className="text-net">Upside: </span>from year 2, renewals{hasMd ? ' and Medicare residuals' : ''} add about <span className="text-ink">{money(r.upside)}</span>/mo on top.</div>
            </div>
          )}
        </Card>
      </div>

      {/* right: the machine */}
      <div className="relative flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex gap-3">
          <Stat label="Agency net / month" v={r.feasible ? r.companyNet : 0} f={money} sub={r.feasible ? `${you} gets ${pct(share * (1 - inputs.holdback))} of it` : 'not reachable'} color={C.net} />
          <Stat label="Revenue / month" v={r.feasible ? revenueMo : 0} f={compact} sub={r.feasible ? `${pct(r.companyNet / revenueMo)} margin` : '—'} color={C.fe} />
          <Stat label="Agents on the phones" v={r.feasible ? fe.agents + md.agents : 0} f={int} sub={!r.feasible ? '—' : hasMd ? `${int(fe.agents)} FE · ${int(md.agents)} Medicare in season` : 'Final Expense, year-round'} color={C.md} />
          <Stat label="Calls a day" v={r.feasible ? fe.callsDay + md.callsDay : 0} f={int} sub={r.feasible ? `${compact(fe.callCost + md.callCost * mdAvg)}/mo in leads` : '—'} color="#a78bfa" />
        </div>

        <div className="flex min-h-0 flex-1 gap-4">
          <LineCard name="Final Expense" when="year-round" color={C.fe} l={fe} conv={inputs.feConv} place={inputs.fePlace} perAgent={inputs.feCallsPerAgent} off={!hasFe || !r.feasible} />
          <LineCard name="Medicare" when={`${MD_MONTHS.length} selling months`} color={C.md} l={md} conv={inputs.mdConv} place={inputs.mdPlace} perAgent={inputs.mdCallsPerAgent} off={!hasMd || !r.feasible} />
        </div>

        <Card className="shrink-0 px-5 py-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[14px] font-semibold">Where every dollar goes</h2>
            <span className="text-[12px] text-muted">average month · {compact(revenueMo)} in</span>
          </div>
          <div className="flex h-9 gap-[2px] overflow-hidden rounded-lg">
            {r.feasible && flow.map(([k, v, c, me]) => (
              <div key={k} title={`${k}: ${money(v)}`}
                className={`flex h-full min-w-0 items-center justify-center overflow-hidden text-[11px] font-semibold transition-all duration-500 ${me ? 'goal-me text-white' : 'text-white/70'}`}
                style={{ width: `${(v / flowTotal) * 100}%`, background: c }}>
                <span className="truncate px-1">{(v / flowTotal) > 0.06 ? k : ''}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            {r.feasible && flow.map(([k, v, c, me]) => (
              <span key={k} className={`flex items-center gap-1.5 ${me ? 'text-ink' : 'text-muted'}`}>
                <span className="h-2 w-2 rounded-sm" style={{ background: c }} />{k}{me ? ' (you)' : ''} <span className="tnum text-sub">{compact(v)}</span>
              </span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
