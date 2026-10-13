import { describe, expect, it } from 'vitest';

import { fechaHoySalvador, rangoDesde } from './rango';

// Midnight on 13 Oct 2026 in El Salvador (06:00 UTC).
const AHORA = new Date('2026-10-13T06:00:00Z');

describe('rangoDesde', () => {
  it('today in El Salvador is read in El Salvador time, not UTC', () => {
    // 23:30 on the 12th in El Salvador is 05:30 UTC on the 13th.
    expect(fechaHoySalvador(new Date('2026-10-13T05:30:00Z'))).toBe('2026-10-12');
    expect(fechaHoySalvador(AHORA)).toBe('2026-10-13');
  });

  it('defaults to the last 30 days, both ends included', () => {
    const r = rangoDesde(undefined, undefined, AHORA);
    expect(r.desdeFecha).toBe('2026-09-14');
    expect(r.hastaFecha).toBe('2026-10-13');
    expect(r.aviso).toBeNull();
  });

  it('the query window starts at midnight in El Salvador and ends before the day after hasta', () => {
    const r = rangoDesde('2026-10-01', '2026-10-05', AHORA);
    expect(r.desde).toBe('2026-10-01T00:00:00-06:00');
    expect(r.hasta).toBe('2026-10-06T00:00:00-06:00');
  });

  it('crosses month and year ends', () => {
    const r = rangoDesde('2026-12-31', '2027-01-01', AHORA);
    expect(r.hasta).toBe('2027-01-02T00:00:00-06:00');
  });

  it('refuses dates that do not exist, and says so', () => {
    const r = rangoDesde('2026-02-30', '2026-10-13', AHORA);
    expect(r.aviso).toMatch(/no es válida/);
    expect(r.desdeFecha).toBe('2026-09-14');
  });

  it('refuses a backwards range and a range longer than a year', () => {
    expect(rangoDesde('2026-10-10', '2026-10-01', AHORA).aviso).toMatch(/posterior/);
    expect(rangoDesde('2025-01-01', '2026-10-13', AHORA).aviso).toMatch(/un año/);
  });

  it('a range of exactly one day is allowed', () => {
    const r = rangoDesde('2026-10-13', '2026-10-13', AHORA);
    expect(r.aviso).toBeNull();
    expect(r.hasta).toBe('2026-10-14T00:00:00-06:00');
  });

  it('a single date fills the other end: one day, or the 30 days before it', () => {
    expect(rangoDesde('2026-10-10', undefined, AHORA).hastaFecha).toBe('2026-10-13');
    expect(rangoDesde(undefined, '2026-10-10', AHORA).desdeFecha).toBe('2026-09-11');
  });
});
