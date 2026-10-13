import { describe, expect, it } from 'vitest';

import { cotizarEnServidor } from '@/servidor/tasas';
import { crearEnvio, envioPara, type DatosNuevoEnvio } from '@/servidor/transferencias';

import { codigoDe, datosEnvio, eventosDeEnvio, filaEnvio, ok, servicio, usuarioNuevo } from './ayuda';

// The quote a sender sees and the transfer the database stores must agree to the cent.

const casos: { nombre: string; datos: Partial<DatosNuevoEnvio>; moneda: 'USD' | 'SATS' }[] = [
  { nombre: 'dólares en efectivo', datos: { monedaOrigen: 'USD', entrega: 'efectivo', montoOrigenCentavos: 10_000 }, moneda: 'USD' },
  { nombre: 'dólares a cuenta bancaria', datos: { monedaOrigen: 'USD', entrega: 'cuenta', montoOrigenCentavos: 25_050 }, moneda: 'USD' },
  { nombre: 'euros a cuenta bancaria', datos: { monedaOrigen: 'EUR', entrega: 'cuenta', montoOrigenCentavos: 12_345 }, moneda: 'USD' },
  { nombre: 'dólares a sats por Lightning', datos: { monedaOrigen: 'USD', entrega: 'lightning', montoOrigenCentavos: 10_000 }, moneda: 'SATS' },
];

describe('cotización y envío guardado coinciden al centavo', () => {
  for (const caso of casos) {
    it(`en ${caso.nombre}`, async () => {
      const remitente = await usuarioNuevo();
      const datos = datosEnvio(remitente, caso.datos);
      const cotizacion = ok(
        await cotizarEnServidor({ monedaOrigen: datos.monedaOrigen, montoOrigenCentavos: datos.montoOrigenCentavos, entrega: datos.entrega }),
      );

      const creado = ok(await crearEnvio(remitente.id, datos));
      const envio = await envioPara({ id: remitente.id, esAdmin: false }, creado.id);

      expect(envio).not.toBeNull();
      expect(envio).toMatchObject({
        montoOrigenCentavos: cotizacion.montoOrigenCentavos,
        comisionCentavos: cotizacion.comisionCentavos,
        netoCentavos: cotizacion.netoCentavos,
        tasa: cotizacion.tasa,
        tasaFuente: cotizacion.tasaFuente,
        monedaDestino: cotizacion.monedaDestino,
        montoDestino: cotizacion.montoDestino,
        minutosEstimados: cotizacion.minutosEstimados,
        estado: 'creada',
      });
      expect(envio?.monedaDestino).toBe(caso.moneda);
      expect(envio!.comisionCentavos + envio!.netoCentavos).toBe(envio!.montoOrigenCentavos);
    });
  }
});

describe('crearEnvio', () => {
  it('ignora cualquier monto que mande el navegador', async () => {
    const remitente = await usuarioNuevo();
    const datos = datosEnvio(remitente, { monedaOrigen: 'USD', entrega: 'cuenta', montoOrigenCentavos: 10_000 });
    const cotizacion = ok(
      await cotizarEnServidor({ monedaOrigen: 'USD', montoOrigenCentavos: 10_000, entrega: 'cuenta' }),
    );

    // A browser could send any extra field; the function reads only the fields it knows.
    const falsificado = { ...datos, montoDestino: 1, comisionCentavos: 0, tasa: 99 } as DatosNuevoEnvio;
    const creado = ok(await crearEnvio(remitente.id, falsificado));
    const fila = await filaEnvio(creado.id);

    expect(fila.monto_destino).toBe(cotizacion.montoDestino);
    expect(fila.comision_centavos).toBe(cotizacion.comisionCentavos);
    expect(fila.tasa).toBe(1);
  });

  it('con la misma clave devuelve el mismo envío, aunque se toque dos veces', async () => {
    const remitente = await usuarioNuevo();
    const datos = datosEnvio(remitente);

    const primero = ok(await crearEnvio(remitente.id, datos));
    const segundo = ok(await crearEnvio(remitente.id, datos));
    expect(segundo.id).toBe(primero.id);
    expect(segundo.codigo).toBe(primero.codigo);

    const { count } = await servicio()
      .from('pay_transferencias')
      .select('id', { count: 'exact', head: true })
      .eq('remitente_id', remitente.id);
    expect(count).toBe(1);
  });

  it('deja el código con la forma CP-XXXX-XXXX', async () => {
    const remitente = await usuarioNuevo();
    const creado = ok(await crearEnvio(remitente.id, datosEnvio(remitente)));
    expect(creado.codigo).toMatch(/^CP-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/);
  });

  it('guarda el contacto con la forma que la base usa para encontrar a la persona', async () => {
    const remitente = await usuarioNuevo();
    const creado = ok(await crearEnvio(remitente.id, datosEnvio(remitente, { destinatarioContacto: '7000 0002' })));
    const fila = await filaEnvio(creado.id);
    expect(fila.destinatario_contacto).toBe('+503 7000 0002');
  });

  it('rechaza un contacto que no es teléfono ni correo, un monto fuera de límite y un nombre corto', async () => {
    const remitente = await usuarioNuevo();
    expect(codigoDe(await crearEnvio(remitente.id, datosEnvio(remitente, { destinatarioContacto: 'abc' })))).toBe('DATOS_INVALIDOS');
    expect(codigoDe(await crearEnvio(remitente.id, datosEnvio(remitente, { montoOrigenCentavos: 99 })))).toBe('DATOS_INVALIDOS');
    expect(codigoDe(await crearEnvio(remitente.id, datosEnvio(remitente, { montoOrigenCentavos: 300_001 })))).toBe('DATOS_INVALIDOS');
    expect(codigoDe(await crearEnvio(remitente.id, datosEnvio(remitente, { destinatarioNombre: 'A' })))).toBe('DATOS_INVALIDOS');
  });

  it('una cuenta que no existe no puede crear un envío', async () => {
    const remitente = await usuarioNuevo();
    expect(codigoDe(await crearEnvio('no-es-un-id', datosEnvio(remitente)))).toBe('NO_ENCONTRADA');
  });

  it('registra el envío creado en el embudo con su valor en dólares', async () => {
    const remitente = await usuarioNuevo();
    const creado = ok(await crearEnvio(remitente.id, datosEnvio(remitente, { monedaOrigen: 'EUR', montoOrigenCentavos: 10_000, entrega: 'cuenta' })));
    const eventos = await eventosDeEnvio(creado.id);
    expect(eventos).toEqual([
      expect.objectContaining({ nombre: 'creo_envio', objeto: creado.codigo, valor_usd_centavos: 10_800, usuario_id: remitente.id }),
    ]);
  });
});
