import { describe, expect, it } from 'vitest';

import { cotizar, TARIFAS, type Cotizacion, type Tarifa, type Entrega } from './cotizacion';

const FUENTE = 'Precio de bitcoin: Coinbase y Kraken';

// Zero fees, so the rounding alone decides the result.
const sinComision: Record<Entrega, Tarifa> = {
  lightning: { fijoCentavos: 0, porcentajeBps: 0, minutosEstimados: 1 },
  cuenta: { fijoCentavos: 0, porcentajeBps: 0, minutosEstimados: 60 },
  efectivo: { fijoCentavos: 0, porcentajeBps: 0, minutosEstimados: 30 },
};

function ok(resultado: ReturnType<typeof cotizar>): Cotizacion {
  if ('error' in resultado) throw new Error(`Se esperaba una cotización: ${resultado.error}`);
  return resultado;
}

describe('cotizar: dólares a dólares', () => {
  it('en efectivo: comisión fija más porcentaje, redondeada hacia arriba', () => {
    const c = ok(
      cotizar({ monedaOrigen: 'USD', montoOrigenCentavos: 10_000, entrega: 'efectivo', tarifas: TARIFAS, eurUsd: 1.08, usdBtc: null, fuenteBtc: FUENTE }),
    );
    expect(c.comisionCentavos).toBe(349);
    expect(c.netoCentavos).toBe(9_651);
    expect(c.montoOrigenCentavos).toBe(c.comisionCentavos + c.netoCentavos);
    expect(c.tasa).toBe(1);
    expect(c.monedaDestino).toBe('USD');
    expect(c.montoDestino).toBe(9_651);
    expect(c.minutosEstimados).toBe(30);
  });

  it('en cuenta bancaria', () => {
    const c = ok(
      cotizar({ monedaOrigen: 'USD', montoOrigenCentavos: 10_000, entrega: 'cuenta', tarifas: TARIFAS, eurUsd: 1.08, usdBtc: null, fuenteBtc: FUENTE }),
    );
    expect(c.comisionCentavos).toBe(199);
    expect(c.montoDestino).toBe(9_801);
    expect(c.minutosEstimados).toBe(60);
  });
});

describe('cotizar: euros a dólares', () => {
  it('convierte con la tasa fija y redondea hacia abajo', () => {
    const c = ok(
      cotizar({ monedaOrigen: 'EUR', montoOrigenCentavos: 10_000, entrega: 'cuenta', tarifas: TARIFAS, eurUsd: 1.08, usdBtc: null, fuenteBtc: FUENTE }),
    );
    // 9,801 net cents times 1.08 is 10,585.08
    expect(c.netoCentavos).toBe(9_801);
    expect(c.tasa).toBe(1.08);
    expect(c.monedaDestino).toBe('USD');
    expect(c.montoDestino).toBe(10_585);
    expect(c.tasaFuente).toBe('Tasa fija de demostración');
  });

  it('redondea hacia abajo cuando el resultado tiene centavos fraccionarios', () => {
    // 9,259 times 1.08 is 9,999.72: the recipient gets 9,999 cents, not 10,000
    const c = ok(
      cotizar({ monedaOrigen: 'EUR', montoOrigenCentavos: 9_259, entrega: 'efectivo', tarifas: sinComision, eurUsd: 1.08, usdBtc: null, fuenteBtc: FUENTE }),
    );
    expect(c.montoDestino).toBe(9_999);
  });
});

describe('cotizar: a sats por Lightning', () => {
  it('dólares a sats con precio de bitcoin de 100,000 USD', () => {
    const c = ok(
      cotizar({ monedaOrigen: 'USD', montoOrigenCentavos: 10_000, entrega: 'lightning', tarifas: TARIFAS, eurUsd: 1.08, usdBtc: 100_000, fuenteBtc: FUENTE }),
    );
    // Fee 50 cents (0.5 rounded up), net 9,950 cents: $99.50 at 1,000 sats per dollar
    expect(c.comisionCentavos).toBe(50);
    expect(c.netoCentavos).toBe(9_950);
    expect(c.monedaDestino).toBe('SATS');
    expect(c.tasa).toBe(1_000);
    expect(c.montoDestino).toBe(99_500);
    expect(c.tasaFuente).toBe(FUENTE);
    expect(c.minutosEstimados).toBe(1);
  });

  it('euros a sats: la tasa de sats por euro sale de la tasa euro-dólar', () => {
    const c = ok(
      cotizar({ monedaOrigen: 'EUR', montoOrigenCentavos: 10_000, entrega: 'lightning', tarifas: TARIFAS, eurUsd: 1.08, usdBtc: 100_000, fuenteBtc: FUENTE }),
    );
    // 1.08 USD per EUR at 1,000 sats per USD: 1,080 sats per EUR. Net 99.50 EUR gives 107,460 sats.
    expect(c.tasa).toBe(1_080);
    expect(c.montoDestino).toBe(107_460);
  });

  it('redondea hacia abajo los sats con una tasa no exacta', () => {
    // 1e8 / 70,000 is 1,428.571428...: 100 cents is 1.00 USD, so the floor is 1,428 sats
    const c = ok(
      cotizar({ monedaOrigen: 'USD', montoOrigenCentavos: 100, entrega: 'lightning', tarifas: sinComision, eurUsd: 1.08, usdBtc: 70_000, fuenteBtc: FUENTE }),
    );
    expect(c.tasa).toBe(1_428.57142857);
    expect(c.montoDestino).toBe(1_428);
  });

  it('redondea hacia abajo cuando la mitad de un sat queda fuera', () => {
    // 9,999 cents at 1,250 sats per dollar is 124,987.5 sats: the recipient gets 124,987
    const c = ok(
      cotizar({ monedaOrigen: 'USD', montoOrigenCentavos: 10_000, entrega: 'lightning', tarifas: { ...sinComision, lightning: { fijoCentavos: 1, porcentajeBps: 0, minutosEstimados: 1 } }, eurUsd: 1.08, usdBtc: 80_000, fuenteBtc: FUENTE }),
    );
    expect(c.netoCentavos).toBe(9_999);
    expect(c.montoDestino).toBe(124_987);
  });

  it('redondea la comisión de Lightning hacia arriba', () => {
    // 1,001 cents at 0.5 percent is 5.005 cents, so the fee is 6 cents and the net 995 cents
    const c = ok(
      cotizar({ monedaOrigen: 'USD', montoOrigenCentavos: 1_001, entrega: 'lightning', tarifas: TARIFAS, eurUsd: 1.08, usdBtc: 100_000, fuenteBtc: FUENTE }),
    );
    expect(c.comisionCentavos).toBe(6);
    expect(c.netoCentavos).toBe(995);
    expect(c.montoDestino).toBe(9_950);
  });
});

describe('cotizar: límites', () => {
  const base = { monedaOrigen: 'USD' as const, entrega: 'lightning' as const, tarifas: TARIFAS, eurUsd: 1.08, usdBtc: 100_000, fuenteBtc: FUENTE };

  it('acepta el mínimo de 100 centavos', () => {
    const c = ok(cotizar({ ...base, montoOrigenCentavos: 100 }));
    expect(c.montoDestino).toBe(990);
  });

  it('acepta el máximo de 300,000 centavos', () => {
    const c = ok(cotizar({ ...base, montoOrigenCentavos: 300_000 }));
    expect(c.comisionCentavos).toBe(1_500);
    expect(c.montoDestino).toBe(2_985_000);
  });

  it('rechaza 99 centavos y 300,001 centavos', () => {
    expect(cotizar({ ...base, montoOrigenCentavos: 99 })).toEqual({ error: expect.stringContaining('$1.00') });
    expect(cotizar({ ...base, montoOrigenCentavos: 300_001 })).toEqual({ error: expect.stringContaining('$3,000.00') });
  });

  it('rechaza montos que no son centavos enteros', () => {
    expect(cotizar({ ...base, montoOrigenCentavos: 1_000.5 })).toHaveProperty('error');
    expect(cotizar({ ...base, montoOrigenCentavos: Number.NaN })).toHaveProperty('error');
  });

  it('usa euros en el mensaje de límite cuando el origen es euro', () => {
    const r = cotizar({ ...base, monedaOrigen: 'EUR', montoOrigenCentavos: 50 });
    expect(r).toEqual({ error: expect.stringContaining('€1.00') });
  });
});

describe('cotizar: comisión mayor que el monto', () => {
  it('cuenta bancaria con 100 centavos: la comisión iguala el monto y no queda nada', () => {
    // 99 fixed plus 1 cent of percentage is the whole amount
    const r = cotizar({ monedaOrigen: 'USD', montoOrigenCentavos: 100, entrega: 'cuenta', tarifas: TARIFAS, eurUsd: 1.08, usdBtc: null, fuenteBtc: FUENTE });
    expect(r).toEqual({ error: expect.stringContaining('comisión') });
  });

  it('una comisión fija mayor que el monto no da una cotización negativa', () => {
    const tarifas = { ...TARIFAS, efectivo: { fijoCentavos: 5_000, porcentajeBps: 0, minutosEstimados: 30 } };
    const r = cotizar({ monedaOrigen: 'USD', montoOrigenCentavos: 1_000, entrega: 'efectivo', tarifas, eurUsd: 1.08, usdBtc: null, fuenteBtc: FUENTE });
    expect(r).toHaveProperty('error');
  });
});

describe('cotizar: precio de bitcoin ausente', () => {
  const base = { monedaOrigen: 'USD' as const, montoOrigenCentavos: 10_000, tarifas: TARIFAS, eurUsd: 1.08, fuenteBtc: FUENTE };

  it('sin precio, Lightning no se cotiza', () => {
    const r = cotizar({ ...base, entrega: 'lightning', usdBtc: null });
    expect(r).toEqual({ error: expect.stringContaining('precio de bitcoin') });
  });

  it('con un precio de cero o negativo, Lightning tampoco', () => {
    expect(cotizar({ ...base, entrega: 'lightning', usdBtc: 0 })).toHaveProperty('error');
    expect(cotizar({ ...base, entrega: 'lightning', usdBtc: -5 })).toHaveProperty('error');
  });

  it('sin precio, efectivo y cuenta siguen cotizando en dólares', () => {
    expect(ok(cotizar({ ...base, entrega: 'efectivo', usdBtc: null })).montoDestino).toBe(9_651);
    expect(ok(cotizar({ ...base, entrega: 'cuenta', usdBtc: null })).montoDestino).toBe(9_801);
  });
});

describe('cotizar: origen de la tasa euro-dólar', () => {
  it('usa la fuente que llega de la base de datos', () => {
    const c = ok(
      cotizar({ monedaOrigen: 'EUR', montoOrigenCentavos: 10_000, entrega: 'cuenta', tarifas: TARIFAS, eurUsd: 1.08, fuenteEurUsd: 'Tasa del día', usdBtc: null, fuenteBtc: FUENTE }),
    );
    expect(c.tasaFuente).toBe('Tasa del día');
  });

  it('usa la misma fuente en euros a sats', () => {
    const c = ok(
      cotizar({ monedaOrigen: 'EUR', montoOrigenCentavos: 10_000, entrega: 'lightning', tarifas: TARIFAS, eurUsd: 1.08, fuenteEurUsd: 'Tasa del día', usdBtc: 100_000, fuenteBtc: FUENTE }),
    );
    expect(c.tasaFuente).toBe(`Tasa del día; ${FUENTE}`);
  });
});
