import { describe, expect, it } from 'vitest';

import {
  diasRestantes,
  enteroEnLimite,
  esTipoPrecio,
  esUuid,
  LIMITES,
  necesidadAbierta,
  precioDesdeTexto,
  primerNombre,
  textoBusqueda,
  textoEnLimite,
  textoPrecio,
} from './servicios';

describe('precioDesdeTexto', () => {
  it('reads dollars as typed into cents', () => {
    expect(precioDesdeTexto('3.50')).toBe(350);
    expect(precioDesdeTexto('5')).toBe(500);
    expect(precioDesdeTexto('0,25')).toBe(25);
    expect(precioDesdeTexto(' 10.00 ')).toBe(1000);
  });

  it('accepts exactly one cent and the ten thousand dollar ceiling', () => {
    expect(precioDesdeTexto('0.01')).toBe(1);
    expect(precioDesdeTexto('10000')).toBe(LIMITES.precioCentavos.maximo);
    expect(precioDesdeTexto('10000.01')).toBeNull();
  });

  it.each(['', '0', '0.00', '-1', '1.234', 'abc', '1e3'])('refuses %j', (texto) => {
    expect(precioDesdeTexto(texto)).toBeNull();
  });
});

describe('textoPrecio', () => {
  it('shows the fixed price with its unit', () => {
    expect(textoPrecio({ tipoPrecio: 'fijo', precioUsdCentavos: 500, unidad: 'por corte' })).toBe('$5.00 por corte');
  });

  it('shows the price without a unit when there is none', () => {
    expect(textoPrecio({ tipoPrecio: 'fijo', precioUsdCentavos: 1250, unidad: null })).toBe('$12.50');
  });

  it('says the price depends on the job for a quoted service', () => {
    expect(textoPrecio({ tipoPrecio: 'cotizar', precioUsdCentavos: null, unidad: null })).toBe(
      'Precio según el trabajo',
    );
  });
});

describe('textoEnLimite', () => {
  it('counts the trimmed text in characters', () => {
    expect(textoEnLimite('  ab ', LIMITES.tituloServicio)).toBe(true);
    expect(textoEnLimite('a', LIMITES.tituloServicio)).toBe(false);
    expect(textoEnLimite('ñandú', { minimo: 5, maximo: 5 })).toBe(true);
    expect(textoEnLimite('x'.repeat(81), LIMITES.tituloServicio)).toBe(false);
  });

  it('refuses anything that is not text', () => {
    expect(textoEnLimite(undefined, LIMITES.zona)).toBe(false);
    expect(textoEnLimite(42, LIMITES.zona)).toBe(false);
  });
});

describe('enteroEnLimite and esTipoPrecio', () => {
  it('accepts whole numbers inside the limit only', () => {
    expect(enteroEnLimite(1, LIMITES.categoria)).toBe(true);
    expect(enteroEnLimite(0, LIMITES.categoria)).toBe(false);
    expect(enteroEnLimite(1.5, LIMITES.categoria)).toBe(false);
    expect(enteroEnLimite('3', LIMITES.categoria)).toBe(false);
  });

  it('knows the two kinds of price', () => {
    expect(esTipoPrecio('fijo')).toBe(true);
    expect(esTipoPrecio('cotizar')).toBe(true);
    expect(esTipoPrecio('gratis')).toBe(false);
  });
});

describe('esUuid', () => {
  it('accepts a UUID and refuses everything else', () => {
    expect(esUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(esUuid('123E4567-E89B-12D3-A456-426614174000')).toBe(true);
    expect(esUuid('123e4567-e89b-12d3-a456-42661417400')).toBe(false);
    expect(esUuid("'; drop table servicios; --")).toBe(false);
    expect(esUuid(null)).toBe(false);
  });
});

describe('textoBusqueda', () => {
  it('leaves plain words alone', () => {
    expect(textoBusqueda('  corte de pelo ')).toBe('corte de pelo');
  });

  it('escapes % and _ so they match only themselves', () => {
    expect(textoBusqueda('100%')).toBe('100\\%');
    expect(textoBusqueda('a_b')).toBe('a\\_b');
  });

  it('removes characters that would change the filter', () => {
    expect(textoBusqueda('a,b(c)"d"*e\\f')).toBe('a b c d e f');
  });

  it('never ends with a lone backslash, even when cut at the limit', () => {
    const texto = `${'x'.repeat(79)}%`;
    const salida = textoBusqueda(texto);
    expect(salida.endsWith('\\')).toBe(false);
  });

  it('cuts long searches to 80 characters before escaping', () => {
    expect(textoBusqueda('a'.repeat(200))).toHaveLength(80);
  });
});

describe('diasRestantes', () => {
  const ahora = new Date('2026-10-12T12:00:00Z');

  it('rounds partial days up', () => {
    expect(diasRestantes('2026-10-13T00:00:00Z', ahora)).toBe(1);
    expect(diasRestantes('2026-10-26T12:00:00Z', ahora)).toBe(14);
    expect(diasRestantes('2026-10-26T12:00:01Z', ahora)).toBe(15);
  });

  it('is zero once the deadline has passed', () => {
    expect(diasRestantes('2026-10-01T00:00:00Z', ahora)).toBe(0);
  });
});

describe('primerNombre', () => {
  it('gives the first word of the name', () => {
    expect(primerNombre('  Lucía  Pérez ')).toBe('Lucía');
    expect(primerNombre('Diego')).toBe('Diego');
  });

  it('is empty when there is no name', () => {
    expect(primerNombre('')).toBe('');
    expect(primerNombre(null)).toBe('');
    expect(primerNombre(undefined)).toBe('');
  });
});

describe('necesidadAbierta', () => {
  const ahora = new Date('2026-10-12T12:00:00Z');
  const base = { estado: 'abierta' as const, oculta: false, venceEn: '2026-10-20T00:00:00Z' };

  it('is open when open, visible and before the deadline', () => {
    expect(necesidadAbierta(base, ahora)).toBe(true);
  });

  it.each([
    ['cancelled', { ...base, estado: 'cancelada' as const }],
    ['assigned', { ...base, estado: 'asignada' as const }],
    ['expired by state', { ...base, estado: 'vencida' as const }],
    ['hidden', { ...base, oculta: true }],
    ['past its deadline', { ...base, venceEn: '2026-10-11T00:00:00Z' }],
  ])('is closed when %s', (_, necesidad) => {
    expect(necesidadAbierta(necesidad, ahora)).toBe(false);
  });
});
