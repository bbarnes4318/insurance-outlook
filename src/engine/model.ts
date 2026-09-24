// Pure model. Every formula here is transcribed from the spec; the UI never does math.

export const DEFAULTS = {
  // Final Expense
  feCallsStart: 100,
  feCallsQtrInc: 100,
  feConv: 0.1,
  fePlace: 0.65,
  fePayout: 120,
  feCallCost: 7,
  feLapse: 0.3,
  feCallsPerAgent: 20,
  feComm: 780,
  feAdvance: 0.75,
  feRenew: 0.05,
  // Medicare
  mdCallsPerAgent: 25,
  mdConv: 0.1,
  mdPlace: 0.65,
  mdComm: 400,
  mdPayout: 120,
  mdCallCost: 10,
  mdLapse: 0.2,
  mdAgentsY1: 25,
  mdAgentsY2: 50,
  mdAgentsY3: 100,
  // Shared
  workDays: 20.86,
  retention: 0.02,
  holdback: 0,
  split1: 0.25,
  split2: 0.25,
  split3: 0.25,
  split4: 0.25,
};

export type Inputs = typeof DEFAULTS;
export type InputKey = keyof Inputs;

export interface FeMonth {
  month: number;
  callsPerDay: number;
  agents: number;
  totalCalls: number;
  appsPerDay: number;
  totalApps: number;
  placedPerDay: number;
  totalPlaced: number;
  advRevPerDay: number;
  advRev: number;
  agentPayout: number;
  callCost: number;
  lapseCost: number;
  totalCost: number;
  net: number;
  netPerPlaced: number;
  tailEarned: number;
  tailCash: number;
}

export interface MdMonth {
  agents: number;
  callsPerDay: number;
  totalCalls: number;
  appsPerDay: number;
  totalApps: number;
  placedPerDay: number;
  totalPlaced: number;
  revPerDay: number;
  rev: number;
  agentPayout: number;
  callCost: number;
  lapseCost: number;
  totalCost: number;
  net: number;
  netPerPlaced: number;
}

export interface YearSummary {
  feAdv: number;
  feTail: number;
  feRenew: number;
  feRev: number;
  feRetention: number;
  feCost: number;
  feNet: number;
  mdNew: number;
  mdResid: number;
  mdRev: number;
  mdRetention: number;
  mdNet: number;
  mdCosts: number; // everything between Medicare revenue and Medicare net (mdRev − mdNet)
  totalRev: number;
  totalCost: number; // totalRev − totalNet
  totalNet: number;
  margin: number;
  fePlaced: number;
}

export interface Outputs {
  fe: FeMonth[]; // 36 months
  md: MdMonth[]; // 3 years, per selling month
  years: YearSummary[]; // 3
  cumulative: { totalRev: number; totalNet: number; margin: number };
  partners: { yearly: number[]; total: number }[]; // 4
  splitTotal: number;
  unit: {
    feNetPerPlaced: number;
    mdNetPerPlaced: number;
    feAgentsAt: number[]; // months 12, 24, 36
    mdAgents: number[];
    fePlacedPerYear: number[];
    receivableAfter36: number;
  };
}

export const MD_MONTHS = ['Oct', 'Nov', 'Jan', 'Feb', 'Mar'];
const MD_SELLING_MONTHS = MD_MONTHS.length;

const div = (a: number, b: number) => (b === 0 ? 0 : a / b);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function runModel(i: Inputs): Outputs {
  const D = i.workDays;

  const fe: FeMonth[] = [];
  for (let m = 1; m <= 36; m++) {
    const q = Math.floor((m - 1) / 3);
    const callsPerDay = i.feCallsStart + i.feCallsQtrInc * q;
    const appsPerDay = callsPerDay * i.feConv;
    const placedPerDay = appsPerDay * i.fePlace;
    const advRevPerDay = i.feComm * i.feAdvance * placedPerDay;
    const totalCalls = callsPerDay * D;
    const totalPlaced = placedPerDay * D;
    const advRev = advRevPerDay * D;
    const agentPayout = totalPlaced * i.fePayout;
    const callCost = totalCalls * i.feCallCost;
    const lapseCost = advRev * i.feLapse;
    const totalCost = agentPayout + callCost + lapseCost;
    const net = advRev - totalCost;
    fe.push({
      month: m,
      callsPerDay,
      agents: div(callsPerDay, i.feCallsPerAgent),
      totalCalls,
      appsPerDay,
      totalApps: appsPerDay * D,
      placedPerDay,
      totalPlaced,
      advRevPerDay,
      advRev,
      agentPayout,
      callCost,
      lapseCost,
      totalCost,
      net,
      netPerPlaced: div(net, totalPlaced),
      tailEarned: i.feComm * (1 - i.feAdvance) * placedPerDay * (1 - i.feLapse) * D,
      tailCash: 0,
    });
  }
  // Tail paid one third in each of months m+9, m+10, m+11.
  for (const r of fe)
    for (const k of [r.month + 9, r.month + 10, r.month + 11])
      if (k <= 36) fe[k - 1].tailCash += r.tailEarned / 3;
  const receivableAfter36 = sum(fe.map((r) => r.tailEarned)) - sum(fe.map((r) => r.tailCash));

  const mdAgents = [i.mdAgentsY1, i.mdAgentsY2, i.mdAgentsY3];
  const md: MdMonth[] = mdAgents.map((agents) => {
    const callsPerDay = i.mdCallsPerAgent * agents;
    const appsPerDay = callsPerDay * i.mdConv;
    const placedPerDay = appsPerDay * i.mdPlace;
    const revPerDay = i.mdComm * placedPerDay;
    const totalCalls = callsPerDay * D;
    const totalPlaced = placedPerDay * D;
    const rev = revPerDay * D;
    const agentPayout = totalPlaced * i.mdPayout;
    const callCost = totalCalls * i.mdCallCost;
    const lapseCost = rev * i.mdLapse;
    const totalCost = agentPayout + callCost + lapseCost;
    const net = rev - totalCost;
    return {
      agents,
      callsPerDay,
      totalCalls,
      appsPerDay,
      totalApps: appsPerDay * D,
      placedPerDay,
      totalPlaced,
      revPerDay,
      rev,
      agentPayout,
      callCost,
      lapseCost,
      totalCost,
      net,
      netPerPlaced: div(net, totalPlaced),
    };
  });

  const feKeep = 1 - i.feLapse;
  const mdKeep = 1 - i.mdLapse;
  const yr = (y: number) => fe.slice(12 * y, 12 * y + 12);
  const feAdv = [0, 1, 2].map((y) => sum(yr(y).map((r) => r.advRev)));
  const feTail = [0, 1, 2].map((y) => sum(yr(y).map((r) => r.tailCash)));
  const feRenew = [
    0,
    (feAdv[0] + feTail[0]) * feKeep * i.feRenew,
    (feAdv[1] + feTail[1]) * feKeep * i.feRenew + (feAdv[0] + feTail[0]) * feKeep ** 2 * i.feRenew,
  ];
  const mdNew = md.map((r) => MD_SELLING_MONTHS * r.rev);
  const mdResid = [0, mdNew[0] * mdKeep, mdNew[0] * mdKeep ** 2 + mdNew[1] * mdKeep];

  const years: YearSummary[] = [0, 1, 2].map((y) => {
    const feRev = feAdv[y] + feTail[y] + feRenew[y];
    const feRetention = feRev * i.retention;
    const feCost = sum(yr(y).map((r) => r.totalCost));
    const feNet = feRev - feCost - feRetention;
    const mdRev = mdNew[y] + mdResid[y];
    const mdRetention = mdRev * i.retention;
    const mdNet = MD_SELLING_MONTHS * md[y].net + mdResid[y] - mdRetention;
    const totalRev = feRev + mdRev;
    const totalNet = feNet + mdNet;
    return {
      feAdv: feAdv[y],
      feTail: feTail[y],
      feRenew: feRenew[y],
      feRev,
      feRetention,
      feCost,
      feNet,
      mdNew: mdNew[y],
      mdResid: mdResid[y],
      mdRev,
      mdRetention,
      mdNet,
      mdCosts: mdRev - mdNet,
      totalRev,
      totalNet,
      totalCost: totalRev - totalNet,
      margin: div(totalNet, totalRev),
      fePlaced: sum(yr(y).map((r) => r.totalPlaced)),
    };
  });

  const cumRev = sum(years.map((y) => y.totalRev));
  const cumNet = sum(years.map((y) => y.totalNet));
  const splits = [i.split1, i.split2, i.split3, i.split4];
  const partners = splits.map((s) => {
    const yearly = years.map((y) => y.totalNet * s * (1 - i.holdback));
    return { yearly, total: sum(yearly) };
  });

  return {
    fe,
    md,
    years,
    cumulative: { totalRev: cumRev, totalNet: cumNet, margin: div(cumNet, cumRev) },
    partners,
    splitTotal: sum(splits),
    unit: {
      // Per-policy net is identical across months/years; take the last period with volume.
      feNetPerPlaced: [...fe].reverse().find((r) => r.totalPlaced > 0)?.netPerPlaced ?? 0,
      mdNetPerPlaced: [...md].reverse().find((r) => r.totalPlaced > 0)?.netPerPlaced ?? 0,
      feAgentsAt: [12, 24, 36].map((m) => fe[m - 1].agents),
      mdAgents,
      fePlacedPerYear: years.map((y) => y.fePlaced),
      receivableAfter36,
    },
  };
}
