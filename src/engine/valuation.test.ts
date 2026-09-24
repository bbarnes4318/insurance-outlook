import { describe, expect, it } from 'vitest';
import { DEFAULTS, runModel } from './model';
import { exitValue, levers } from './valuation';

const out = runModel(DEFAULTS);
const ex = exitValue(DEFAULTS, out);
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
const each = (f: (e: (typeof ex)[number]) => number, vals: number[]) => vals.forEach((v, y) => near(f(ex[y]), v));

describe('exit value at defaults', () => {
  it('next-12-month renewals', () => {
    each((e) => e.mdFwd, [1355900, 3796520, 8460816]);
    each((e) => e.feFwd, [84581.72, 300366.9, 615767.88]);
  });
  it('FE owed to seller', () => {
    each((e) => e.receivable, [518224.98, 1258546.38, 1998867.78]);
    near(ex[2].receivable, out.unit.receivableAfter36);
  });
  it('adjusted EBITDA, both lenses, winner', () => {
    each((e) => e.adjEbitda, [560968.16, 3285662.96, 7330650.66]);
    each((e) => e.book.base, [2838672.58, 8043590.35, 17845283.82]);
    each((e) => e.earnings.base, [2243872.65, 21356809.27, 47649229.28]);
    expect(ex.map((e) => e.lens)).toEqual(['book', 'earnings', 'earnings']);
  });
  it('price range', () => {
    each((e) => e.price.low, [2129004.43, 16428314.82, 36653253.3]);
    each((e) => e.price.base, [2838672.58, 21356809.27, 47649229.28]);
    each((e) => e.price.high, [3548340.72, 26285303.72, 58645205.27]);
  });
  it('deal and walk-away', () => {
    each((e) => e.atClose, [1703203.55, 12814085.56, 28589537.57]);
    each((e) => e.cumProfit, [889887.81, 5113191.47, 14240835.48]);
    each((e) => e.walkAway, [4246785.37, 27728547.13, 63888932.54]);
    ex.forEach((e) => near(e.atClose + e.earnout, e.price.base));
  });
  it('forward renewals match what the next year actually pays', () => {
    near(ex[0].mdFwd, out.years[1].mdResid);
    near(ex[1].mdFwd, out.years[2].mdResid);
    near(ex[0].feFwd, out.years[1].feRenew);
    near(ex[1].feFwd, out.years[2].feRenew);
  });
});

describe('levers at Year 3', () => {
  const l = Object.fromEntries(levers(DEFAULTS, 3).map((x) => [x.label, x.delta]));
  it('price deltas', () => {
    near(l['Medicare lapse 5 pts lower'], 4012828);
    near(l['FE lapse 5 pts lower'], 4076733);
    near(l['Medicare placement 5 pts higher'], 3064334);
    near(l['FE placement 5 pts higher'], 2824667);
    near(l['Overhead 2 pts leaner'], 2920114);
    near(l['Add 10 FE calls/day per quarter'], 2177618);
    near(l['FE calls $1 cheaper'], 1708434);
    near(l['Medicare calls $1 cheaper'], 1694875);
    near(l['Year 3 Medicare team +10 agents'], 67795);
  });
  it('sorted biggest first', () => {
    const d = levers(DEFAULTS, 3).map((x) => x.delta);
    expect(d).toEqual([...d].sort((a, b) => b - a));
  });
});

describe('exit edge cases', () => {
  it('adjusted EBITDA <= 0 prices as a book', () => {
    const i = { ...DEFAULTS, exitOverhead: 1 };
    const e = exitValue(i, runModel(i));
    e.forEach((y) => {
      expect(y.adjEbitda).toBeLessThanOrEqual(0);
      expect(y.earnings.base).toBe(0);
      expect(y.lens).toBe('book');
    });
  });
  it('all splits 0 gives partners 0, no NaN', () => {
    const i = { ...DEFAULTS, split1: 0, split2: 0, split3: 0, split4: 0 };
    exitValue(i, runModel(i)).forEach((y) =>
      y.partners.forEach((p) => {
        expect(p.share).toBe(0);
        expect(p.atClose).toBe(0);
      }));
  });
});
