import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { MD_MONTHS, type Outputs } from './engine/model';
import { compact, fmt, FE_ROWS, MD_ROWS, money, type Kind } from './format';

export const C = {
  fe: '#2dd4bf', feTail: '#5eead4', feRenew: '#99f6e4',
  md: '#8b5cf6', mdResid: '#c4b5fd',
  net: '#34d399', cost: '#fb7185', grid: '#1c2742', muted: '#8392b0', gold: '#fbbf24',
};

const axis = { stroke: C.muted, fontSize: 11, tickLine: false, axisLine: false } as const;
const legend = { wrapperStyle: { fontSize: 11, color: C.muted, paddingTop: 4 }, iconSize: 8 } as const;

function Tip({ title, rows }: { title: string; rows: [string, Kind, number, string?][] }) {
  return (
    <div className="rounded-lg border border-line bg-canvas/95 px-3 py-2 text-[11px] leading-[15px] shadow-2xl backdrop-blur">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      {rows.map(([label, k, v, color]) => (
        <div key={label} className="flex justify-between gap-6">
          <span className="text-muted" style={color ? { color } : undefined}>{label}</span>
          <span className={v < 0 ? 'text-cost' : 'text-ink'}>{fmt(k, v)}</span>
        </div>
      ))}
    </div>
  );
}

export function OverviewChart({ out }: { out: Outputs }) {
  const data = out.years.map((y, i) => ({ name: `Year ${i + 1}`, ...y }));
  return (
    <ResponsiveContainer>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={6}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" {...axis} />
        <YAxis tickFormatter={compact} width={64} {...axis} />
        <Tooltip
          cursor={{ fill: '#ffffff08' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const y = payload[0].payload as (typeof data)[number];
            return (
              <Tip title={y.name} rows={[
                ['FE Advanced', '$', y.feAdv, C.fe], ['FE Months 10–12', '$', y.feTail, C.feTail], ['FE Renewal', '$', y.feRenew, C.feRenew],
                ['Medicare New', '$', y.mdNew, C.md], ['Medicare Residual', '$', y.mdResid, C.mdResid],
                ['Total Revenue', '$', y.totalRev], ['Total Net', '$', y.totalNet, C.net],
              ]} />
            );
          }}
        />
        <Legend {...legend} />
        <Bar dataKey="feAdv" name="FE Advanced" stackId="fe" fill={C.fe} isAnimationActive={false} maxBarSize={90} />
        <Bar dataKey="feTail" name="FE Months 10–12" stackId="fe" fill={C.feTail} isAnimationActive={false} maxBarSize={90} />
        <Bar dataKey="feRenew" name="FE Renewal" stackId="fe" fill={C.feRenew} isAnimationActive={false} maxBarSize={90} radius={[3, 3, 0, 0]} />
        <Bar dataKey="mdNew" name="Medicare New" stackId="md" fill={C.md} isAnimationActive={false} maxBarSize={90} />
        <Bar dataKey="mdResid" name="Medicare Residual" stackId="md" fill={C.mdResid} isAnimationActive={false} maxBarSize={90} radius={[3, 3, 0, 0]} />
        <Line dataKey="totalNet" name="Total Net" stroke={C.net} strokeWidth={2.5} dot={{ r: 4, fill: C.net }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function FeMonthlyChart({ out }: { out: Outputs }) {
  const data = out.fe.map((r) => ({ ...r, name: `M${r.month}` }));
  return (
    <ResponsiveContainer>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={1}>
        {[0, 1, 2].map((y) => (
          <ReferenceArea key={y} x1={`M${12 * y + 1}`} x2={`M${12 * y + 12}`} fill={y % 2 ? '#ffffff' : C.fe} fillOpacity={0.04}
            label={{ value: `Year ${y + 1}`, position: 'insideTopLeft', fill: C.muted, fontSize: 11 }} />
        ))}
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" interval={2} {...axis} />
        <YAxis tickFormatter={compact} width={64} {...axis} />
        <Tooltip
          cursor={{ fill: '#ffffff08' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload as (typeof data)[number];
            return <Tip title={`Month ${r.month} · Year ${Math.ceil(r.month / 12)}`} rows={FE_ROWS.map(([k, l, kind]) => [l, kind, r[k]])} />;
          }}
        />
        <Legend {...legend} />
        <Bar dataKey="advRev" name="Advanced revenue" fill={C.fe} isAnimationActive={false} />
        <Bar dataKey="totalCost" name="Total cost" fill={C.cost} fillOpacity={0.85} isAnimationActive={false} />
        <Line dataKey="net" name="Monthly net" stroke={C.net} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line dataKey="tailCash" name="Months 10–12 cash" stroke={C.gold} strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function MedicareChart({ out }: { out: Outputs }) {
  const data = out.md.flatMap((r, y) => MD_MONTHS.map((mo) => ({ ...r, name: `${mo} Y${y + 1}`, year: y + 1, mo })));
  return (
    <ResponsiveContainer>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        {[0, 1, 2].map((y) => (
          <ReferenceArea key={y} x1={`Oct Y${y + 1}`} x2={`Mar Y${y + 1}`} fill={y % 2 ? '#ffffff' : C.md} fillOpacity={0.04}
            label={{ value: `Year ${y + 1} season`, position: 'insideTopLeft', fill: C.muted, fontSize: 11 }} />
        ))}
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="name" {...axis} tickFormatter={(v: string) => v.split(' ')[0]} />
        <YAxis tickFormatter={compact} width={64} {...axis} />
        <Tooltip
          cursor={{ fill: '#ffffff08' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload as (typeof data)[number];
            return <Tip title={`${r.mo} · Year ${r.year} (per selling month)`} rows={MD_ROWS.map(([k, l, kind]) => [l, kind, r[k]])} />;
          }}
        />
        <Legend {...legend} />
        <Bar dataKey="rev" name="Revenue" fill={C.md} isAnimationActive={false} maxBarSize={28} />
        <Bar dataKey="totalCost" name="Total cost" fill={C.cost} fillOpacity={0.85} isAnimationActive={false} maxBarSize={28} />
        <Line dataKey="net" name="Net" stroke={C.net} strokeWidth={2} dot={{ r: 3, fill: C.net }} isAnimationActive={false} />
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
