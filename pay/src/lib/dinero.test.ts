import { describe, expect, it } from 'vitest';
import { comisionTeorica, formatoSats, formatoUsd, usdCentavosASats } from './dinero';

describe('usdCentavosASats', () => {
  it('converts exact amounts without rounding up', () => {
    expect(usdCentavosASats(350, 100_000)).toBe(3500);
    expect(usdCentavosASats(100, 100_000)).toBe(1000);
  });

  it('rounds up any fraction of a sat', () => {
    // 1 cent at 3 USD/BTC is 333333.33 sats
    expect(usdCentavosASats(1, 3)).toBe(333_334);
    // 1 cent at 100,000,000 USD/BTC is 0.01 sat, which becomes 1 sat
    expect(usdCentavosASats(1, 100_000_000)).toBe(1);
  });

  it('accepts a fractional rate', () => {
    expect(usdCentavosASats(1000, 97_123.45)).toBe(Math.ceil((1000 * 1_000_000) / 97_123.45));
  });

  it.each([
    ['zero cents', 0, 100_000],
    ['negative cents', -5, 100_000],
    ['fractional cents', 3.5, 100_000],
    ['NaN cents', Number.NaN, 100_000],
    ['infinite cents', Number.POSITIVE_INFINITY, 100_000],
    ['zero rate', 350, 0],
    ['negative rate', 350, -1],
    ['NaN rate', 350, Number.NaN],
    ['infinite rate', 350, Number.POSITIVE_INFINITY],
  ])('throws RangeError for %s', (_nombre, centavos, cotizacion) => {
    expect(() => usdCentavosASats(centavos, cotizacion)).toThrow(RangeError);
  });
});

describe('formatoSats', () => {
  it('groups thousands with commas', () => {
    expect(formatoSats(1250)).toBe('1,250 sats');
    expect(formatoSats(1_000_000)).toBe('1,000,000 sats');
    expect(formatoSats(999)).toBe('999 sats');
  });

  it('uses the singular for exactly one sat', () => {
    expect(formatoSats(1)).toBe('1 sat');
  });

  it('uses the plural for zero', () => {
    expect(formatoSats(0)).toBe('0 sats');
  });
});

describe('formatoUsd', () => {
  it('formats cents as dollars with two decimals', () => {
    expect(formatoUsd(350)).toBe('$3.50');
    expect(formatoUsd(125_000)).toBe('$1,250.00');
    expect(formatoUsd(5)).toBe('$0.05');
    expect(formatoUsd(0)).toBe('$0.00');
    expect(formatoUsd(100_000_000)).toBe('$1,000,000.00');
  });

  it('puts the minus sign before the dollar sign', () => {
    expect(formatoUsd(-350)).toBe('-$3.50');
  });
});

describe('comisionTeorica', () => {
  it('computes basis points and rounds up', () => {
    expect(comisionTeorica(3500, 100)).toBe(35);
    expect(comisionTeorica(1000, 150)).toBe(15);
    // 250 * 33 / 10000 = 0.825, rounded up
    expect(comisionTeorica(250, 33)).toBe(1);
    // 1 * 100 / 10000 = 0.01, rounded up
    expect(comisionTeorica(1, 100)).toBe(1);
  });

  it('is zero for zero sats or zero bps', () => {
    expect(comisionTeorica(0, 100)).toBe(0);
    expect(comisionTeorica(5000, 0)).toBe(0);
  });
});
