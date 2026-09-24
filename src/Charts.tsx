import {
  Area, Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, ReferenceArea, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { Outputs } from './engine/model';
import { compact, fmt, FE_ROWS, MD_ROWS, type Kind } from './format';

// Validated (dataviz validator, dark, surface #161618): fe / md / net pass CVD + contrast. Costs are neutral on purpose.
export const C = {
  fe: '#3987e5', feLight: '#86b6ef',
  md: '#d95926', mdLight: '#f0a27f',
  net: '#199e70', cost: '#5b5b64',
  surface: '#161618', grid: '#26262b', muted: '#8b8b94', ink: '#f4f4f5', neg: '#e66767',
};

const axis = { stroke: C.muted, fontSize: 12, tickLine: false, axisLine: false } as const;
const legend = { verticalAlign: 'top' as const, align: 'right' as const, iconType: 'circle' as const, iconSize: 8, itemSorter: null, wrapperStyle: { fontSize: 12, color: C.muted, paddingBottom: 12 } };
const bar = { isAnimationActive: false, stroke: C.surface, strokeWidth: 2 } as const;
const topLabel = { position: 'top' as const, formatter: (v: unknown) => compact(Number(v)), fill: C.ink, fontSize: 12, fontWeight: 600 };

// Sizes charts in layout pixels. Recharts' ResponsiveContainer can measure the CSS-scaled (screen) size and overflow.
function Fit({ children }: { children: (w: number, h: number) => ReactElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setS({ w: el.offsetWidth, h: el.offsetHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={ref} className="h-full w-full overflow-hidden">{s.w > 0 && children(s.w, s.h)}</div>;
}

function Tip({ title, rows }: { title: string; rows: [string, Kind, number, string?][] }) {
  return (
    <div className="min-w-[220px] rounded-lg border border-line bg-surface2 px-3 py-2.5 text-[12px] leading-[18px] shadow-2xl">
      <div className="mb-1.5 font-semibold text-ink">{title}</div>
      {rows.map(([l, k, v, color]) => (
        <div key={l} className="flex items-center justify-between gap-6">
          <span className="flex items-center gap-2 text-muted">
            {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}{l}
          </span>
          <span className={`tnum ${v < 0 ? 'text-cost' : 'text-ink'}`}>{fmt(k, v)}</span>
        </div>
      ))}
    </div>
  );
}

export function OverviewChart({ out }: { out: Outputs }) {
  const data = out.years.map((y, i) => ({ name: `Year ${i + 1}`, ...y }));
  return (
    <Fit>{(w, h) => (
      <ComposedChart width={w} height={h} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={6} barCategoryGap="24%">
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" {...axis} fontSize={13} tick={{ fill: C.ink }} dy={6} />
        <YAxis tickFormatter={compact} width={60} {...axis} />
        <Tooltip cursor={{ fill: '#ffffff06' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const y = payload[0].payload as (typeof data)[number];
          return <Tip title={y.name} rows={[
            ['Final Expense revenue', '$', y.feRev, C.fe], ['Medicare revenue', '$', y.mdRev, C.md],
            ['Costs', '$', y.totalCost, C.cost], ['Net profit', '$', y.totalNet, C.net],
          ]} />;
        }} />
        <Legend {...legend} />
        <Bar dataKey="feRev" name="Final Expense revenue" stackId="rev" fill={C.fe} {...bar} />
        <Bar dataKey="mdRev" name="Medicare revenue" stackId="rev" fill={C.md} {...bar} minPointSize={1} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="totalRev" {...topLabel} />
        </Bar>
        <Bar dataKey="totalCost" name="Costs" fill={C.cost} {...bar} radius={[4, 4, 0, 0]} />
        <Bar dataKey="totalNet" name="Net profit" fill={C.net} {...bar} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="totalNet" {...topLabel} />
        </Bar>
      </ComposedChart>
    )}</Fit>
  );
}

export function FeMonthlyChart({ out }: { out: Outputs }) {
  const data = out.fe.map((r) => ({ ...r, name: `M${r.month}` }));
  return (
    <Fit>{(w, h) => (
      <ComposedChart width={w} height={h} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {[1].map((y) => <ReferenceArea key={y} x1={`M${12 * y + 1}`} x2={`M${12 * y + 12}`} fill="#ffffff" fillOpacity={0.025} />)}
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" {...axis} ticks={['M1', 'M6', 'M12', 'M13', 'M18', 'M24', 'M25', 'M30', 'M36']}
          tickFormatter={(v: string) => (v === 'M1' ? 'Year 1' : v === 'M13' ? 'Year 2' : v === 'M25' ? 'Year 3' : v.replace('M', 'Mo '))} dy={6} />
        <YAxis tickFormatter={compact} width={60} {...axis} />
        <Tooltip cursor={{ stroke: C.muted, strokeDasharray: '3 3' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const r = payload[0].payload as (typeof data)[number];
          return <Tip title={`Month ${r.month} · Year ${Math.ceil(r.month / 12)}`} rows={FE_ROWS.map(([k, l, kind]) => [l, kind, r[k]])} />;
        }} />
        <Legend {...legend} />
        <Area dataKey="advRev" name="Advanced commissions" stackId="in" stroke={C.fe} strokeWidth={2} fill={C.fe} fillOpacity={0.25} isAnimationActive={false} />
        <Area dataKey="tailCash" name="Months 10–12 payments" stackId="in" stroke={C.feLight} strokeWidth={2} fill={C.feLight} fillOpacity={0.2} isAnimationActive={false} />
        <Line dataKey="totalCost" name="Costs" stroke="#9a9aa3" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Line dataKey="net" name="Net profit" stroke={C.net} strokeWidth={2.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    )}</Fit>
  );
}

export function MedicareChart({ out }: { out: Outputs }) {
  const data = out.years.map((y, i) => ({ name: `Year ${i + 1}`, ...y, month: out.md[i] }));
  return (
    <Fit>{(w, h) => (
      <ComposedChart width={w} height={h} data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={6} barCategoryGap="24%">
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" {...axis} fontSize={13} tick={{ fill: C.ink }} dy={6} />
        <YAxis tickFormatter={compact} width={60} {...axis} />
        <Tooltip cursor={{ fill: '#ffffff06' }} content={({ active, payload }) => {
          if (!active || !payload?.length) return null;
          const d = payload[0].payload as (typeof data)[number];
          return <Tip title={`${d.name} · per selling month (×5)`} rows={[
            ...MD_ROWS.map(([k, l, kind]) => [l, kind, d.month[k]] as [string, Kind, number]),
            ['Year new revenue', '$', d.mdNew, C.md], ['Year residual revenue', '$', d.mdResid, C.mdLight], ['Year net profit', '$', d.mdNet, C.net],
          ]} />;
        }} />
        <Legend {...legend} />
        <Bar dataKey="mdNew" name="New policies" stackId="rev" fill={C.md} {...bar} />
        <Bar dataKey="mdResid" name="Residuals" stackId="rev" fill={C.mdLight} {...bar} minPointSize={1} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="mdRev" {...topLabel} />
        </Bar>
        <Bar dataKey="mdCosts" name="Costs" fill={C.cost} {...bar} radius={[4, 4, 0, 0]} />
        <Bar dataKey="mdNet" name="Net profit" fill={C.net} {...bar} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="mdNet" {...topLabel} />
        </Bar>
      </ComposedChart>
    )}</Fit>
  );
}
