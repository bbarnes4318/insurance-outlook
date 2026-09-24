import {
  Area, Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Outputs } from './engine/model';
import { compact, fmt, FE_ROWS, MD_ROWS, money, type Kind } from './format';

export const C = {
  fe: '#2dd4bf', feTail: '#5eead4', feRenew: '#99f6e4',
  md: '#8b5cf6', mdResid: '#c4b5fd',
  net: '#34d399', cost: '#fb7185', grid: '#1c2742', muted: '#8392b0', gold: '#fbbf24',
};

const axis = { stroke: C.muted, fontSize: 12, tickLine: false, axisLine: false } as const;
const legend = { wrapperStyle: { fontSize: 12, color: C.muted, paddingTop: 6 }, iconSize: 10, itemSorter: null } as const;
const label = (color: string) => ({ position: 'top' as const, formatter: (v: unknown) => compact(Number(v)), fill: color, fontSize: 12, fontWeight: 600 });

function Tip({ title, rows }: { title: string; rows: [string, Kind, number, string?][] }) {
  return (
    <div className="rounded-lg border border-line bg-canvas/95 px-3 py-2 text-[11px] leading-[15px] shadow-2xl backdrop-blur">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {rows.map(([l, k, v, color]) => (
        <div key={l} className="flex justify-between gap-6">
          <span className="text-muted" style={color ? { color } : undefined}>{l}</span>
          <span className={v < 0 ? 'text-cost' : 'text-ink'}>{fmt(k, v)}</span>
        </div>
      ))}
    </div>
  );
}

// Per year: revenue (stacked by business line) next to costs and net profit.
export function OverviewChart({ out }: { out: Outputs }) {
  const data = out.years.map((y, i) => ({ name: `Year ${i + 1}`, ...y }));
  return (
    <ResponsiveContainer>
      <ComposedChart data={data} margin={{ top: 24, right: 12, left: 0, bottom: 0 }} barGap={8} barCategoryGap="22%">
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" {...axis} fontSize={13} />
        <YAxis tickFormatter={compact} width={64} {...axis} />
        <Tooltip
          cursor={{ fill: '#ffffff08' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const y = payload[0].payload as (typeof data)[number];
            return (
              <Tip title={y.name} rows={[
                ['FE advanced', '$', y.feAdv, C.fe], ['FE months 10–12', '$', y.feTail, C.fe], ['FE renewals', '$', y.feRenew, C.fe],
                ['Medicare new', '$', y.mdNew, C.md], ['Medicare residual', '$', y.mdResid, C.md],
                ['Total revenue', '$', y.totalRev], ['Total costs', '$', y.totalCost, C.cost], ['Net profit', '$', y.totalNet, C.net],
              ]} />
            );
          }}
        />
        <Legend {...legend} />
        <Bar dataKey="feRev" name="Final Expense revenue" stackId="rev" fill={C.fe} isAnimationActive={false} />
        <Bar dataKey="mdRev" name="Medicare revenue" stackId="rev" fill={C.md} isAnimationActive={false} minPointSize={1} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="totalRev" {...label('#e6ebf5')} />
        </Bar>
        <Bar dataKey="totalCost" name="Costs" fill={C.cost} isAnimationActive={false} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="totalCost" {...label(C.cost)} />
        </Bar>
        <Bar dataKey="totalNet" name="Net profit" fill={C.net} isAnimationActive={false} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="totalNet" {...label(C.net)} />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// 36 months: cash in (advances + months 10–12 payments) vs cost, with net profit.
export function FeMonthlyChart({ out }: { out: Outputs }) {
  const data = out.fe.map((r) => ({ ...r, name: `M${r.month}` }));
  return (
    <ResponsiveContainer>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        {[0, 1, 2].map((y) => (
          <ReferenceArea key={y} x1={`M${12 * y + 1}`} x2={`M${12 * y + 12}`} fill={y % 2 ? '#ffffff' : C.fe} fillOpacity={0.035}
            label={{ value: `Year ${y + 1}`, position: 'insideTopLeft', fill: C.muted, fontSize: 12 }} />
        ))}
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" interval={2} {...axis} />
        <YAxis tickFormatter={compact} width={64} {...axis} />
        <Tooltip
          cursor={{ stroke: C.muted, strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload as (typeof data)[number];
            return <Tip title={`Month ${r.month} · Year ${Math.ceil(r.month / 12)}`} rows={FE_ROWS.map(([k, l, kind]) => [l, kind, r[k]])} />;
          }}
        />
        <Legend {...legend} />
        <Area dataKey="advRev" name="Advanced commissions" stackId="in" stroke={C.fe} fill={C.fe} fillOpacity={0.35} isAnimationActive={false} />
        <Area dataKey="tailCash" name="Months 10–12 payments" stackId="in" stroke={C.gold} fill={C.gold} fillOpacity={0.35} isAnimationActive={false} />
        <Line dataKey="totalCost" name="Costs" stroke={C.cost} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line dataKey="net" name="Net profit" stroke={C.net} strokeWidth={3} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// Per year: new + residual revenue vs costs and net. Tooltip adds the per-selling-month rows.
export function MedicareChart({ out }: { out: Outputs }) {
  const data = out.years.map((y, i) => ({ name: `Year ${i + 1}`, ...y, month: out.md[i] }));
  return (
    <ResponsiveContainer>
      <ComposedChart data={data} margin={{ top: 24, right: 12, left: 0, bottom: 0 }} barGap={8} barCategoryGap="24%">
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" {...axis} fontSize={13} />
        <YAxis tickFormatter={compact} width={64} {...axis} />
        <Tooltip
          cursor={{ fill: '#ffffff08' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as (typeof data)[number];
            return (
              <Tip title={`${d.name} · each of 5 selling months`} rows={[
                ...MD_ROWS.map(([k, l, kind]) => [l, kind, d.month[k]] as [string, Kind, number]),
                ['Year: new revenue', '$', d.mdNew, C.md], ['Year: residual revenue', '$', d.mdResid, C.mdResid], ['Year: net', '$', d.mdNet, C.net],
              ]} />
            );
          }}
        />
        <Legend {...legend} />
        <Bar dataKey="mdNew" name="New policy revenue" stackId="rev" fill={C.md} isAnimationActive={false} />
        <Bar dataKey="mdResid" name="Residual revenue" stackId="rev" fill={C.mdResid} isAnimationActive={false} minPointSize={1} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="mdRev" {...label('#e6ebf5')} />
        </Bar>
        <Bar dataKey="mdCosts" name="Costs" fill={C.cost} isAnimationActive={false} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="mdCosts" {...label(C.cost)} />
        </Bar>
        <Bar dataKey="mdNet" name="Net profit" fill={C.net} isAnimationActive={false} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="mdNet" {...label(C.net)} />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values.map(Math.abs));
  return (
    <div className="flex h-9 items-end gap-1">
      {values.map((v, i) => (
        <div key={i} title={`Year ${i + 1}: ${money(v)}`} className="w-3 rounded-sm"
          style={{ height: `${Math.max(2, (Math.abs(v) / max) * 36)}px`, background: v < 0 ? C.cost : color, opacity: 0.55 + i * 0.2 }} />
      ))}
    </div>
  );
}
