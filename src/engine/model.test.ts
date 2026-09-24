import { describe, expect, it } from 'vitest';
import { DEFAULTS, recipe, runModel, type Outputs } from './model';

const out = runModel(DEFAULTS);
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.01);
const check = (row: Record<string, number>, expected: Record<string, number>) =>
  Object.entries(expected).forEach(([k, v]) => {
    expect(row[k], k).toBeDefined();
    near(row[k], v);
  });

describe('FE months', () => {
  const m = (n: number) => out.fe[n - 1] as unknown as Record<string, number>;
  it('month 1', () =>
    check(m(1), {
      callsPerDay: 100, agents: 5, totalCalls: 2086, totalApps: 208.6, totalPlaced: 135.59,
      advRev: 79320.15, agentPayout: 16270.8, callCost: 14602, lapseCost: 23796.045,
      totalCost: 54668.845, net: 24651.305, netPerPlaced: 181.8077, tailEarned: 18508.035,
    }));
  it('month 4', () => check(m(4), { callsPerDay: 200, agents: 10, advRev: 158640.3, totalCost: 109337.69, net: 49302.61 }));
  it('month 13', () => check(m(13), { callsPerDay: 500, agents: 25, advRev: 396600.75, net: 123256.525, tailEarned: 92540.175 }));
  it('month 36', () =>
    check(m(36), {
      callsPerDay: 1200, agents: 60, totalCalls: 25032, advRev: 951841.8,
      totalCost: 656026.14, net: 295815.66, tailEarned: 222096.42,
    }));
  it('tail cash by month received', () => {
    for (let k = 1; k <= 9; k++) near(m(k).tailCash, 0);
    near(m(10).tailCash, 6169.345);
    near(m(11).tailCash, 12338.69);
    near(m(12).tailCash, 18508.035);
    near(m(13).tailCash, 24677.38);
    near(m(24).tailCash, 92540.175);
    near(m(36).tailCash, 166572.31);
  });
  it('other checks', () => {
    near(out.unit.receivableAfter36, 1998867.78);
    [4067.7, 10576.02, 17084.34].forEach((v, y) => near(out.unit.fePlacedPerYear[y], v));
  });
});

describe('Medicare per selling month', () => {
  const rows: Record<string, number[]> = {
    callsPerDay: [625, 1250, 2500],
    totalCalls: [13037.5, 26075, 52150],
    totalApps: [1303.75, 2607.5, 5215],
    totalPlaced: [847.4375, 1694.875, 3389.75],
    rev: [338975, 677950, 1355900],
    agentPayout: [101692.5, 203385, 406770],
    callCost: [130375, 260750, 521500],
    lapseCost: [67795, 135590, 271180],
    totalCost: [299862.5, 599725, 1199450],
    net: [39112.5, 78225, 156450],
    netPerPlaced: [46.1538, 46.1538, 46.1538],
  };
  for (const [k, vals] of Object.entries(rows))
    it(k, () => vals.forEach((v, y) => near((out.md[y] as unknown as Record<string, number>)[k], v)));
});

describe('Summary', () => {
  const rows: Record<string, number[]> = {
    feAdv: [2379604.5, 6186971.7, 9994338.9],
    feTail: [37016.07, 703305.33, 1591691.01],
    feRenew: [0, 84581.72, 300366.9],
    feRev: [2416620.57, 6974858.75, 11886396.81],
    feRetention: [48332.41, 139497.17, 237727.94],
    feCost: [1640065.35, 4264169.91, 6888274.47],
    feNet: [728222.81, 2571191.66, 4760394.4],
    mdNew: [1694875, 3389750, 6779500],
    mdResid: [0, 1355900, 3796520],
    mdRev: [1694875, 4745650, 10576020],
    mdRetention: [33897.5, 94913, 211520.4],
    mdNet: [161665, 1652112, 4367249.6],
    totalRev: [4111495.57, 11720508.75, 22462416.81],
    totalNet: [889887.81, 4223303.67, 9127644],
  };
  for (const [k, vals] of Object.entries(rows))
    it(k, () => vals.forEach((v, y) => near((out.years[y] as unknown as Record<string, number>)[k], v)));
});

describe('Partners', () => {
  it('25% each, 0% holdback', () => {
    for (const p of out.partners) {
      [222471.95, 1055825.92, 2281911.0].forEach((v, y) => near(p.yearly[y], v));
      near(p.total, 3560208.87);
    }
    near(out.splitTotal, 1);
  });
  it('splits 40/30/20/10', () =>
    near(runModel({ ...DEFAULTS, split1: 0.4, split2: 0.3, split3: 0.2, split4: 0.1 }).partners[0].yearly[0], 355955.12));
  it('holdback 30%', () =>
    runModel({ ...DEFAULTS, holdback: 0.3 }).partners.forEach((p) => near(p.yearly[0], 155730.37)));
});

const allFinite = (o: Outputs) => {
  const walk = (v: unknown): void => {
    if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(o);
};

describe('Edge cases', () => {
  it('feConv = 0', () => {
    const o = runModel({ ...DEFAULTS, feConv: 0 });
    o.fe.forEach((r) => expect(r.netPerPlaced).toBe(0));
    allFinite(o);
  });
  it('Medicare agents = 0 for a year', () => {
    const o = runModel({ ...DEFAULTS, mdAgentsY2: 0 });
    Object.values(o.md[1]).forEach((v) => expect(v).toBe(0));
    near(o.years[1].mdNew, 0);
    allFinite(o);
  });
  it('mdLapse = 30% residual', () => near(runModel({ ...DEFAULTS, mdLapse: 0.3 }).years[1].mdResid, 1186412.5));
});

describe('Chains (agents → net) reconcile with the summary', () => {
  it('revenue − costs = net for every period and line; All = sum of years', () => {
    for (const p of out.periods) for (const c of [p.fe, p.md]) near(c.revenue - c.costs, c.net);
    out.years.forEach((y, i) => {
      near(out.periods[i].fe.net, y.feNet);
      near(out.periods[i].md.net, y.mdNet);
    });
    near(out.periods[3].fe.net + out.periods[3].md.net, out.cumulative.totalNet);
    near(out.periods[0].fe.placed, 4067.7);
    near(out.periods[0].md.placed, 5 * 847.4375);
  });
  it('monthly cash in = advances + months 10–12 payments', () => {
    near(out.fe[35].cashIn, 951841.8 + 166572.31);
    near(out.fe[35].cashNet, 951841.8 + 166572.31 - 656026.14);
  });
});

describe('recipe (reverse model)', () => {
  it('works back from $25K/mo to a partner at 25%, all Final Expense', () => {
    const r = recipe(DEFAULTS, 25000, 0.25, 1);
    near(r.companyNet, 100000);
    // 585 advance + 136.5 tail − 120 payout − 107.69 calls − 175.5 chargeback − 14.43 retention
    near(r.fe.perPolicy.net, 303.8808);
    near(r.fe.policiesMo, 100000 / 303.8808);
    near(r.fe.callsDay, r.fe.policiesDay / 0.065);
    expect(r.fe.agents).toBe(Math.ceil(r.fe.callsDay / 20));
    expect(r.md.agents).toBe(0);
    expect(r.feasible).toBe(true);
    // the recipe's own numbers reconcile to the target
    near(r.fe.revenue - r.fe.payouts - r.fe.callCost - r.fe.chargebacks - r.fe.retention, 100000);
  });
  it('Medicare share is packed into 5 selling months', () => {
    const r = recipe(DEFAULTS, 25000, 0.25, 0.5);
    near(r.md.target, (50000 * 12) / 5);
    near(r.md.perPolicy.net, 400 - 120 - 10 / 0.065 - 80 - 8);
  });
  it('flags money-losing assumptions as infeasible', () => {
    expect(recipe({ ...DEFAULTS, feCallCost: 50 }, 25000, 0.25, 1).feasible).toBe(false);
    expect(recipe(DEFAULTS, 25000, 0, 1).feasible).toBe(false);
  });
});
