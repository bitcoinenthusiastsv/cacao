import { describe, expect, it } from 'vitest';

import { desglosarComisionUsd, desgloseTributarioEnvio } from './hacienda';

describe('desglosarComisionUsd', () => {
  it('separa base gravada, IVA 13% y Pago a Cuenta 1.75% en efectivo ($3.49)', () => {
    const d = desglosarComisionUsd(349);
    expect(d.comisionBrutaUsdCentavos).toBe(349);
    expect(d.baseSinIvaUsdCentavos).toBe(309);
    expect(d.ivaUsdCentavos).toBe(40);
    expect(d.baseSinIvaUsdCentavos + d.ivaUsdCentavos).toBe(349);
    expect(d.pagoACuentaUsdCentavos).toBe(5);
  });

  it('separa base gravada, IVA 13% y Pago a Cuenta 1.75% en cuenta bancaria ($1.99)', () => {
    const d = desglosarComisionUsd(199);
    expect(d.baseSinIvaUsdCentavos).toBe(176);
    expect(d.ivaUsdCentavos).toBe(23);
    expect(d.baseSinIvaUsdCentavos + d.ivaUsdCentavos).toBe(199);
    expect(d.pagoACuentaUsdCentavos).toBe(3);
  });

  it('separa base gravada, IVA 13% y Pago a Cuenta 1.75% en Lightning ($0.50)', () => {
    const d = desglosarComisionUsd(50);
    expect(d.baseSinIvaUsdCentavos).toBe(44);
    expect(d.ivaUsdCentavos).toBe(6);
    expect(d.baseSinIvaUsdCentavos + d.ivaUsdCentavos).toBe(50);
    expect(d.pagoACuentaUsdCentavos).toBe(1);
  });

  it('devuelve ceros cuando la comisión es cero o negativa', () => {
    expect(desglosarComisionUsd(0)).toEqual({
      comisionBrutaUsdCentavos: 0,
      baseSinIvaUsdCentavos: 0,
      ivaUsdCentavos: 0,
      pagoACuentaUsdCentavos: 0,
    });
    expect(desglosarComisionUsd(-50).comisionBrutaUsdCentavos).toBe(0);
  });
});

describe('desgloseTributarioEnvio', () => {
  it('separa el principal de $96.51 y la comisión de $3.49 en USD', () => {
    const d = desgloseTributarioEnvio({
      monedaOrigen: 'USD',
      montoOrigenCentavos: 10_000,
      comisionCentavos: 349,
      entrega: 'efectivo',
    });
    expect(d.montoOrigenUsdCentavos).toBe(10_000);
    expect(d.principalExentoUsdCentavos).toBe(9_651);
    expect(d.comisionBrutaUsdCentavos).toBe(349);
    expect(d.baseSinIvaUsdCentavos).toBe(309);
    expect(d.ivaUsdCentavos).toBe(40);
    expect(d.pagoACuentaUsdCentavos).toBe(5);
    expect(d.codigoCat017).toBe('01');
    expect(d.codigoCat017EsquemaCaso01).toBe('01');
  });

  it('convierte euros a dólares con la tasa guardada y asigna CAT-017 para Lightning', () => {
    const d = desgloseTributarioEnvio({
      monedaOrigen: 'EUR',
      montoOrigenCentavos: 10_000,
      comisionCentavos: 50,
      entrega: 'lightning',
      eurUsd: 1.08,
    });
    expect(d.montoOrigenUsdCentavos).toBe(10_800);
    expect(d.comisionBrutaUsdCentavos).toBe(54);
    expect(d.principalExentoUsdCentavos).toBe(10_746);
    expect(d.baseSinIvaUsdCentavos + d.ivaUsdCentavos).toBe(54);
    expect(d.codigoCat017).toBe('11');
    expect(d.codigoCat017EsquemaCaso01).toBe('99');
  });
});
