import { describe, expect, it } from 'vitest';
import {
  fmtDelta,
  fmtDollars,
  fmtInt,
  fmtMonth,
  fmtPct,
  fmtPctDelta,
  fmtPercentile,
} from './format';

describe('formatters', () => {
  it('renders the hero number with a true minus sign (§6.1)', () => {
    expect(fmtDelta(-547051)).toBe('−547,051');
    expect(fmtDelta(-547051)).not.toContain('-'); // hyphen-minus must not appear
  });

  it('formats counts and percents', () => {
    expect(fmtInt(3518649)).toBe('3,518,649');
    expect(fmtPct(0.093)).toBe('9.3%');
    expect(fmtPctDelta(-0.191)).toBe('−19.1%');
    expect(fmtPctDelta(-0.002)).toBe('−0.2%');
    expect(fmtPercentile(0.98)).toBe('p98');
  });

  it('renders eyebrow months as tracked caps (§6.1)', () => {
    expect(fmtMonth('2025-07')).toBe('JUL 2025');
    expect(fmtMonth('2026-05')).toBe('MAY 2026');
  });

  it('shows absence as an em dash, not zero', () => {
    expect(fmtInt(null)).toBe('—');
    expect(fmtDelta(null)).toBe('—');
    expect(fmtPct(null)).toBe('—');
    expect(fmtPercentile(null)).toBe('—');
  });
});

describe('fmtDollars', () => {
  it('abbreviates by size', () => {
    expect(fmtDollars(936_412_000)).toBe('$936M');
    expect(fmtDollars(29_160_000)).toBe('$29.2M');
    expect(fmtDollars(1_240_000_000)).toBe('$1.24B');
    expect(fmtDollars(89_359)).toBe('$89.4K');
    expect(fmtDollars(950)).toBe('$950');
    expect(fmtDollars(-5_000_000)).toBe('−$5.0M');
    expect(fmtDollars(null)).toBe('—');
  });
});
