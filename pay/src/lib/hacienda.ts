import { TASA_EUR_USD, type Entrega } from './cotizacion';
import { aUsdCentavos } from './transferencias';

// Tax and regulatory breakdown for a remittance in El Salvador (DGII · Ministerio de Hacienda and BCR).
// All amounts are integer US cents. Los registros van en dólares: art. 139 CT (asientos en moneda de curso legal)
// y art. 6 de la Ley Bitcoin (dólar como moneda de referencia).
//
// 1. Remittance principal (neto):
//    - ISR: Art. 3 numeral 4) LISR: los valores recibidos del exterior no constituyen renta; el alcance para remesas familiares no está confirmado.
//    - IVA: tratamiento no verificado en esta revisión.
// 2. Service commission (when billed locally in El Salvador as a Factura de Consumidor Final DTE 01):
//    - Base sin IVA = round(comisionUsdCentavos * 100 / 113)    (supone IVA 13% incluido; artículos de la Ley de IVA no verificados)
//    - Débito IVA   = comisionUsdCentavos - baseSinIva          (F-07: débito fiscal por consumidor final en DTE 01 y por contribuyentes en DTE 03; versión 14 sin vigencia confirmada)
//    - Pago a Cuenta ISR (1.75%, Art. 151 inc. 3° CT, reformado por Decreto 958; F-14 v17) = round(baseSinIva * 175 / 10000)   (base sin IVA: supuesto de cálculo, no es norma)

export type DesgloseTributario = {
  montoOrigenUsdCentavos: number;
  principalExentoUsdCentavos: number;
  comisionBrutaUsdCentavos: number;
  baseSinIvaUsdCentavos: number;
  ivaUsdCentavos: number;
  pagoACuentaUsdCentavos: number;
  codigoCat017: '01' | '05' | '11';
  codigoCat017EsquemaCaso01: '01' | '05' | '99';
  etiquetaCat017: string;
};

const CODIGO_CAT017: Record<Entrega, { codigo: '01' | '05' | '11'; caso01: '01' | '05' | '99'; etiqueta: string }> = {
  efectivo: {
    codigo: '01',
    caso01: '01',
    etiqueta: '01 · Billetes y monedas',
  },
  cuenta: {
    codigo: '05',
    caso01: '05',
    etiqueta: '05 · Transferencia y depósito bancario',
  },
  lightning: {
    codigo: '11',
    caso01: '99',
    etiqueta: '11 · Bitcoin (99 · Otros con referencia BTC-LN en Factura 01 v1)',
  },
};

/**
 * Splits a commission in US cents into its net taxable base (without 13% IVA), its 13% IVA debit
 * for F-07 (version 14, vigencia no confirmada), and the 1.75% Pago a Cuenta advance for F-14 v17 (Art. 151 CT).
 */
export function desglosarComisionUsd(comisionUsdCentavos: number): {
  comisionBrutaUsdCentavos: number;
  baseSinIvaUsdCentavos: number;
  ivaUsdCentavos: number;
  pagoACuentaUsdCentavos: number;
} {
  const bruta = Math.max(0, Math.trunc(comisionUsdCentavos));
  const baseSinIva = Math.round((bruta * 100) / 113);
  const iva = bruta - baseSinIva;
  const pagoACuenta = Math.round((baseSinIva * 175) / 10_000);
  return {
    comisionBrutaUsdCentavos: bruta,
    baseSinIvaUsdCentavos: baseSinIva,
    ivaUsdCentavos: iva,
    pagoACuentaUsdCentavos: pagoACuenta,
  };
}

/**
 * Computes the El Salvador tax breakdown of one transfer, converting EUR to USD cents with the
 * stored rate when the transfer originated in euros.
 */
export function desgloseTributarioEnvio(entrada: {
  monedaOrigen: 'USD' | 'EUR';
  montoOrigenCentavos: number;
  comisionCentavos: number;
  entrega: Entrega;
  eurUsd?: number;
}): DesgloseTributario {
  const tasaEur = entrada.eurUsd ?? TASA_EUR_USD;
  const montoUsd = aUsdCentavos(entrada.montoOrigenCentavos, entrada.monedaOrigen, tasaEur);
  const comisionUsd = aUsdCentavos(entrada.comisionCentavos, entrada.monedaOrigen, tasaEur);
  const principalUsd = Math.max(0, montoUsd - comisionUsd);
  const impuestos = desglosarComisionUsd(comisionUsd);
  const cat = CODIGO_CAT017[entrada.entrega];

  return {
    montoOrigenUsdCentavos: montoUsd,
    principalExentoUsdCentavos: principalUsd,
    ...impuestos,
    codigoCat017: cat.codigo,
    codigoCat017EsquemaCaso01: cat.caso01,
    etiquetaCat017: cat.etiqueta,
  };
}
