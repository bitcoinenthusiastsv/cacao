import { describe, expect, it } from 'vitest';
import {
  anonimo,
  auditoriaDeTransferencia,
  codigoDe,
  contactoSinCuenta,
  fila,
  historialPayDe,
  administrador,
  sesionDe,
  servicio,
  sufijo,
  telefonoComoLoEscribe,
  transferir,
  transferirRaw,
  usuarioConCorreo,
  usuarioNuevo,
} from './ayuda';

// Cacao Pay: the money of a transfer, idempotency, every state change and its refusals, the recipient
// match, the admin summary, and security. The expected amounts are worked out by hand here, not read
// back from the database.

const CODIGO = /^CP-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/;

function pagoRaw(nombre: string, args: Record<string, unknown>) {
  return servicio().rpc(nombre, args);
}

describe('el cálculo del servidor', () => {
  it('USD a USD: $100.00 por efectivo cobra $3.49 y entrega $96.51', async () => {
    const remitente = await usuarioNuevo();
    const t = await transferir({
      remitente,
      monto: 10000,
      comision: 349,
      montoDestino: 9651,
      entrega: 'efectivo',
    });
    expect(t.codigo).toMatch(CODIGO);
    expect(t).toMatchObject({
      estado: 'creada',
      moneda_origen: 'USD',
      monto_origen_centavos: 10000,
      comision_centavos: 349,
      neto_centavos: 9651,
      moneda_destino: 'USD',
      monto_destino: 9651,
      entrega: 'efectivo',
      destinatario_id: null,
    });
    expect(Number(t.tasa)).toBe(1);
  });

  it('EUR a USD: €100.00 por cuenta cobra €1.99 y entrega $105.85 con la tasa de 1.08', async () => {
    const t = await transferir({
      remitente: await usuarioNuevo(),
      origen: 'EUR',
      monto: 10000,
      comision: 199,
      montoDestino: 10585,
      entrega: 'cuenta',
      tasa: 1.08,
    });
    expect(t).toMatchObject({ moneda_origen: 'EUR', comision_centavos: 199, neto_centavos: 9801, monto_destino: 10585, moneda_destino: 'USD' });
    expect(Number(t.tasa)).toBe(1.08);
  });

  it('USD a sats: $50.00 por Lightning cobra 25 centavos y entrega 49,750 sats a 1,000 sats por dólar', async () => {
    const t = await transferir({
      remitente: await usuarioNuevo(),
      monto: 5000,
      destino: 'SATS',
      entrega: 'lightning',
      tasa: 1000,
      comision: 25,
      montoDestino: 49750,
    });
    expect(t).toMatchObject({ comision_centavos: 25, neto_centavos: 4975, moneda_destino: 'SATS', monto_destino: 49750 });
  });

  it('un monto de destino o una comisión que no coinciden se rechazan', async () => {
    const remitente = await usuarioNuevo();
    const comisionMal = await transferirRaw({ remitente, monto: 10000, comision: 348, montoDestino: 9651, entrega: 'efectivo' });
    expect(codigoDe(comisionMal.error)).toBe('DATOS_INVALIDOS');
    expect(comisionMal.error?.message).toContain('Los montos no coinciden con el cálculo del servidor.');

    const destinoMal = await transferirRaw({
      remitente,
      origen: 'EUR',
      monto: 10000,
      comision: 199,
      montoDestino: 10584,
      entrega: 'cuenta',
      tasa: 1.08,
    });
    expect(codigoDe(destinoMal.error)).toBe('DATOS_INVALIDOS');
    expect(destinoMal.error?.message).toContain('Los montos no coinciden con el cálculo del servidor.');
  });

  it('la tasa tiene que ser la que corresponde: 1 para USD a USD y la guardada para EUR a USD', async () => {
    const remitente = await usuarioNuevo();
    const usdMal = await transferirRaw({ remitente, monto: 10000, comision: 349, montoDestino: 14000, tasa: 1.5, entrega: 'efectivo' });
    expect(codigoDe(usdMal.error)).toBe('DATOS_INVALIDOS');
    expect(usdMal.error?.message).toContain('La tasa no coincide con la tasa vigente.');

    const eurMal = await transferirRaw({
      remitente,
      origen: 'EUR',
      monto: 10000,
      comision: 199,
      montoDestino: 10890,
      entrega: 'cuenta',
      tasa: 1.1,
    });
    expect(codigoDe(eurMal.error)).toBe('DATOS_INVALIDOS');
  });

  it('el monto va de $1.00 a $3,000.00', async () => {
    const remitente = await usuarioNuevo();
    const poco = await transferirRaw({ remitente, monto: 99, comision: 0, montoDestino: 0 });
    expect(codigoDe(poco.error)).toBe('DATOS_INVALIDOS');
    const mucho = await transferirRaw({ remitente, monto: 300001, comision: 0, montoDestino: 0 });
    expect(codigoDe(mucho.error)).toBe('DATOS_INVALIDOS');
  });

  it('sats solo por Lightning y dólares solo por efectivo o cuenta', async () => {
    const remitente = await usuarioNuevo();
    const satsEnEfectivo = await transferirRaw({
      remitente,
      monto: 5000,
      destino: 'SATS',
      entrega: 'efectivo',
      tasa: 1000,
      comision: 0,
      montoDestino: 0,
    });
    expect(codigoDe(satsEnEfectivo.error)).toBe('DATOS_INVALIDOS');
    expect(satsEnEfectivo.error?.message).toContain('Los sats solo se entregan por Lightning.');

    const dolaresEnLightning = await transferirRaw({ remitente, monto: 5000, entrega: 'lightning', comision: 0, montoDestino: 0 });
    expect(codigoDe(dolaresEnLightning.error)).toBe('DATOS_INVALIDOS');
  });

  it('una comisión que deja el neto en cero o menos se rechaza', async () => {
    // 100 cents by efectivo: fee is 199 + ceil(100 * 150 / 10000) = 201, more than the amount.
    const { error } = await transferirRaw({ remitente: await usuarioNuevo(), monto: 100, comision: 201, montoDestino: 0 });
    expect(codigoDe(error)).toBe('DATOS_INVALIDOS');
    expect(error?.message).toContain('La comisión deja un monto neto de cero o menos.');
  });

  it('un remitente que no existe recibe NO_ENCONTRADA', async () => {
    const fantasma = { id: crypto.randomUUID(), telefono: '' };
    const { error } = await transferirRaw({ remitente: fantasma, monto: 10000, comision: 349, montoDestino: 9651 });
    expect(codigoDe(error)).toBe('NO_ENCONTRADA');
  });

  it('el nombre, el contacto y la nota tienen largos válidos', async () => {
    const remitente = await usuarioNuevo();
    const nombre = await transferirRaw({ remitente, nombre: 'A', monto: 10000, comision: 349, montoDestino: 9651 });
    expect(codigoDe(nombre.error)).toBe('DATOS_INVALIDOS');
    const contacto = await transferirRaw({ remitente, contacto: 'ab', monto: 10000, comision: 349, montoDestino: 9651 });
    expect(codigoDe(contacto.error)).toBe('DATOS_INVALIDOS');
    const nota = await transferirRaw({ remitente, nota: 'x'.repeat(201), monto: 10000, comision: 349, montoDestino: 9651 });
    expect(codigoDe(nota.error)).toBe('DATOS_INVALIDOS');
  });
});

describe('idempotencia', () => {
  it('la misma clave devuelve la misma transferencia y no crea historial de más', async () => {
    const remitente = await usuarioNuevo();
    const datos = { remitente, monto: 10000, comision: 349, montoDestino: 9651, clave: `pay-doble-${sufijo()}` };
    const primera = await transferir(datos);
    const segunda = await transferir(datos);
    expect(segunda.id).toBe(primera.id);
    expect(segunda.codigo).toBe(primera.codigo);
    expect(await historialPayDe(primera.id)).toHaveLength(1);
  });

  it('dos envíos simultáneos con la misma clave crean una sola transferencia', async () => {
    const datos = { remitente: await usuarioNuevo(), monto: 10000, comision: 349, montoDestino: 9651, clave: `pay-carrera-${sufijo()}` };
    const [a, b] = await Promise.all([transferirRaw(datos), transferirRaw(datos)]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect(a.data.id).toBe(b.data.id);
    const { data } = await servicio().from('pay_transferencias').select('id').eq('remitente_id', datos.remitente.id);
    expect(data).toHaveLength(1);
  });
});

describe('el destinatario', () => {
  it('un teléfono escrito con espacios y signo más se une a la cuenta registrada', async () => {
    const destinatario = await usuarioNuevo();
    const t = await transferir({
      remitente: await usuarioNuevo(),
      contacto: telefonoComoLoEscribe(destinatario.telefono),
      monto: 10000,
      comision: 349,
      montoDestino: 9651,
    });
    expect(t.destinatario_id).toBe(destinatario.id);
  });

  it('un correo se compara sin importar las mayúsculas', async () => {
    const cuenta = await usuarioConCorreo();
    const t = await transferir({
      remitente: await usuarioNuevo(),
      contacto: cuenta.correo.toUpperCase(),
      monto: 10000,
      comision: 349,
      montoDestino: 9651,
    });
    expect(t.destinatario_id).toBe(cuenta.id);
  });

  it('un contacto que nadie tiene deja destinatario_id vacío', async () => {
    const t = await transferir({
      remitente: await usuarioNuevo(),
      contacto: contactoSinCuenta(),
      monto: 10000,
      comision: 349,
      montoDestino: 9651,
    });
    expect(t.destinatario_id).toBeNull();
  });

  it('no se puede enviar a la propia cuenta', async () => {
    const remitente = await usuarioNuevo();
    const { error } = await transferirRaw({
      remitente,
      contacto: telefonoComoLoEscribe(remitente.telefono),
      monto: 10000,
      comision: 349,
      montoDestino: 9651,
    });
    expect(codigoDe(error)).toBe('NO_PERMITIDO');
    expect(error?.message).toContain('No podés enviarte dinero a vos mismo.');
  });

  it('un contacto que no es teléfono ni correo se rechaza', async () => {
    const remitente = await usuarioNuevo();
    const sinDigitos = await transferirRaw({ remitente, contacto: 'mamá', monto: 10000, comision: 349, montoDestino: 9651 });
    expect(codigoDe(sinDigitos.error)).toBe('DATOS_INVALIDOS');
    const correoMalo = await transferirRaw({ remitente, contacto: 'marta@ejemplo', monto: 10000, comision: 349, montoDestino: 9651 });
    expect(codigoDe(correoMalo.error)).toBe('DATOS_INVALIDOS');
  });
});

describe('cambios de estado', () => {
  it('el remitente procesa, el administrador completa, y el historial y la auditoría guardan cada paso', async () => {
    const remitente = await usuarioNuevo();
    const t = await transferir({ remitente, monto: 10000, comision: 349, montoDestino: 9651 });

    const procesada = await pagoRaw('pay_procesar', { p_transferencia: t.id, p_actor: remitente.id });
    expect(procesada.error).toBeNull();
    expect(procesada.data.estado).toBe('procesando');
    expect(procesada.data.procesando_en).not.toBeNull();

    const otraVez = await pagoRaw('pay_procesar', { p_transferencia: t.id, p_actor: remitente.id });
    expect(codigoDe(otraVez.error)).toBe('ESTADO_INVALIDO');

    // The simulator (no actor) pays out.
    const completada = await pagoRaw('pay_completar', { p_transferencia: t.id, p_actor: null });
    expect(completada.error).toBeNull();
    expect(completada.data.estado).toBe('completada');
    expect(completada.data.completada_en).not.toBeNull();

    const historial = (await historialPayDe(t.id)).map((h) => h.estado);
    expect(historial).toEqual(['creada', 'procesando', 'completada']);
    const auditoria = (await auditoriaDeTransferencia(t.id)).map((a) => a.accion);
    expect(auditoria).toEqual(['transferencia.creada', 'transferencia.procesando', 'transferencia.completada']);
    expect((await fila('pay_transferencias', t.id)).estado).toBe('completada');
  });

  it('quien no envía no procesa; el remitente no completa; un administrador sí', async () => {
    const remitente = await usuarioNuevo();
    const t = await transferir({ remitente, monto: 10000, comision: 349, montoDestino: 9651 });

    const extrano = await pagoRaw('pay_procesar', { p_transferencia: t.id, p_actor: (await usuarioNuevo()).id });
    expect(codigoDe(extrano.error)).toBe('NO_PERMITIDO');
    expect((await fila('pay_transferencias', t.id)).estado).toBe('creada');

    const admin = await administrador();
    const procesada = await pagoRaw('pay_procesar', { p_transferencia: t.id, p_actor: admin.id });
    expect(procesada.error).toBeNull();
    expect(procesada.data.estado).toBe('procesando');

    const porRemitente = await pagoRaw('pay_completar', { p_transferencia: t.id, p_actor: remitente.id });
    expect(codigoDe(porRemitente.error)).toBe('NO_PERMITIDO');

    const porAdmin = await pagoRaw('pay_completar', { p_transferencia: t.id, p_actor: admin.id });
    expect(porAdmin.data.estado).toBe('completada');
  });

  it('solo se completa una transferencia en proceso', async () => {
    const t = await transferir({ remitente: await usuarioNuevo(), monto: 10000, comision: 349, montoDestino: 9651 });
    const sinProcesar = await pagoRaw('pay_completar', { p_transferencia: t.id, p_actor: null });
    expect(codigoDe(sinProcesar.error)).toBe('ESTADO_INVALIDO');
    expect((await fila('pay_transferencias', t.id)).estado).toBe('creada');
  });

  it('fallar pide un motivo de 4 a 200 caracteres, y sirve desde creada o procesando', async () => {
    const remitente = await usuarioNuevo();
    const t = await transferir({ remitente, monto: 10000, comision: 349, montoDestino: 9651 });

    const corto = await pagoRaw('pay_fallar', { p_transferencia: t.id, p_actor: null, p_motivo: 'no' });
    expect(codigoDe(corto.error)).toBe('DATOS_INVALIDOS');

    const porRemitente = await pagoRaw('pay_fallar', { p_transferencia: t.id, p_actor: remitente.id, p_motivo: 'Me arrepentí.' });
    expect(codigoDe(porRemitente.error)).toBe('NO_PERMITIDO');

    const fallida = await pagoRaw('pay_fallar', { p_transferencia: t.id, p_actor: null, p_motivo: 'El punto de pago cerró.' });
    expect(fallida.error).toBeNull();
    expect(fallida.data.estado).toBe('fallida');
    expect(fallida.data.fallida_en).not.toBeNull();
    expect(fallida.data.motivo).toBe('El punto de pago cerró.');

    const otraVez = await pagoRaw('pay_fallar', { p_transferencia: t.id, p_actor: null, p_motivo: 'Otra vez el mismo motivo.' });
    expect(codigoDe(otraVez.error)).toBe('ESTADO_INVALIDO');

    // Failing while processing is allowed too.
    const enProceso = await transferir({ remitente, monto: 10000, comision: 349, montoDestino: 9651 });
    await pagoRaw('pay_procesar', { p_transferencia: enProceso.id, p_actor: remitente.id });
    const cayo = await pagoRaw('pay_fallar', { p_transferencia: enProceso.id, p_actor: null, p_motivo: 'Se cayó la red del proveedor.' });
    expect(cayo.data.estado).toBe('fallida');
    const auditoria = (await auditoriaDeTransferencia(enProceso.id)).map((a) => a.accion);
    expect(auditoria).toEqual(['transferencia.creada', 'transferencia.procesando', 'transferencia.fallida']);
  });

  it('cancelar solo el remitente y solo antes de procesar', async () => {
    const remitente = await usuarioNuevo();
    const t = await transferir({ remitente, monto: 10000, comision: 349, montoDestino: 9651 });

    const ajena = await pagoRaw('pay_cancelar', { p_transferencia: t.id, p_actor: (await usuarioNuevo()).id });
    expect(codigoDe(ajena.error)).toBe('NO_PERMITIDO');
    const admin = await administrador();
    const porAdmin = await pagoRaw('pay_cancelar', { p_transferencia: t.id, p_actor: admin.id });
    expect(codigoDe(porAdmin.error)).toBe('NO_PERMITIDO');
    const sinActor = await pagoRaw('pay_cancelar', { p_transferencia: t.id, p_actor: null });
    expect(codigoDe(sinActor.error)).toBe('NO_PERMITIDO');

    const cancelada = await pagoRaw('pay_cancelar', { p_transferencia: t.id, p_actor: remitente.id });
    expect(cancelada.error).toBeNull();
    expect(cancelada.data.estado).toBe('cancelada');
    expect(cancelada.data.cancelada_en).not.toBeNull();

    const procesando = await transferir({ remitente, monto: 10000, comision: 349, montoDestino: 9651 });
    await pagoRaw('pay_procesar', { p_transferencia: procesando.id, p_actor: remitente.id });
    const tarde = await pagoRaw('pay_cancelar', { p_transferencia: procesando.id, p_actor: remitente.id });
    expect(codigoDe(tarde.error)).toBe('ESTADO_INVALIDO');
    expect((await fila('pay_transferencias', procesando.id)).estado).toBe('procesando');
  });

  it('una transferencia completada no se cancela ni se falla', async () => {
    const remitente = await usuarioNuevo();
    const t = await transferir({ remitente, monto: 10000, comision: 349, montoDestino: 9651 });
    await pagoRaw('pay_procesar', { p_transferencia: t.id, p_actor: remitente.id });
    await pagoRaw('pay_completar', { p_transferencia: t.id, p_actor: null });

    expect(codigoDe((await pagoRaw('pay_cancelar', { p_transferencia: t.id, p_actor: remitente.id })).error)).toBe('ESTADO_INVALIDO');
    expect(codigoDe((await pagoRaw('pay_fallar', { p_transferencia: t.id, p_actor: null, p_motivo: 'Ya estaba pagada.' })).error)).toBe('ESTADO_INVALIDO');
    expect((await fila('pay_transferencias', t.id)).estado).toBe('completada');
  });

  it('una transferencia que no existe recibe NO_ENCONTRADA', async () => {
    const { error } = await pagoRaw('pay_procesar', { p_transferencia: crypto.randomUUID(), p_actor: (await usuarioNuevo()).id });
    expect(codigoDe(error)).toBe('NO_ENCONTRADA');
  });
});

describe('resumen para el administrador', () => {
  it('cuenta las transferencias del rango por estado, con los montos en dólares', async () => {
    const desde = new Date().toISOString();
    const remitente = await usuarioNuevo();
    // $100.00 in dollars: 10000 cents, fee 349.
    await transferir({ remitente, monto: 10000, comision: 349, montoDestino: 9651 });
    // EUR 100.00 by cuenta: 10800 dollars cents (floor of 10000 * 1.08), fee floor(199 * 1.08) = 214.
    await transferir({ remitente, origen: 'EUR', monto: 10000, comision: 199, montoDestino: 10585, entrega: 'cuenta', tasa: 1.08 });

    const { data, error } = await servicio().rpc('pay_resumen', {
      p_desde: desde,
      p_hasta: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(error).toBeNull();
    expect(data.find((r: { estado: string }) => r.estado === 'creada')).toEqual({
      estado: 'creada',
      cantidad: 2,
      monto_origen_usd_centavos: 20800,
      comision_usd_centavos: 563,
    });
  });
});

describe('lo que ve una sesión y un anónimo', () => {
  it('no leen ni escriben las tablas de Cacao Pay', async () => {
    const sesion = await sesionDe(await usuarioNuevo());
    const remitente = await usuarioNuevo();
    const t = await transferir({ remitente, monto: 10000, comision: 349, montoDestino: 9651 });
    for (const cliente of [sesion, anonimo()]) {
      for (const tabla of ['pay_tasas', 'pay_tarifas', 'pay_transferencias', 'pay_historial']) {
        expect((await cliente.from(tabla).select('*')).error, tabla).not.toBeNull();
      }
      const alta = await cliente.from('pay_tasas').insert({ par: 'USD/SATS', tasa: 1, fuente: 'colado' });
      expect(alta.error).not.toBeNull();
      const cambio = await cliente.from('pay_transferencias').update({ estado: 'completada' }).eq('id', t.id);
      expect(cambio.error).not.toBeNull();
    }
    expect((await fila('pay_transferencias', t.id)).estado).toBe('creada');
  });

  it('no ejecutan ninguna función de Cacao Pay: permiso denegado (42501)', async () => {
    const sesion = await sesionDe(await usuarioNuevo());
    const id = crypto.randomUUID();
    const llamadas: [string, Record<string, unknown>][] = [
      ['pay_crear_transferencia', {
        p_remitente: id, p_destinatario_nombre: 'Colado', p_destinatario_contacto: '+5030000000000',
        p_moneda_origen: 'USD', p_monto_origen: 10000, p_moneda_destino: 'USD', p_entrega: 'efectivo',
        p_tasa: 1, p_tasa_fuente: 'colado', p_comision: 349, p_monto_destino: 9651, p_nota: '', p_clave: 'colado',
      }],
      ['pay_procesar', { p_transferencia: id, p_actor: id }],
      ['pay_completar', { p_transferencia: id, p_actor: null }],
      ['pay_fallar', { p_transferencia: id, p_actor: null, p_motivo: 'colado' }],
      ['pay_cancelar', { p_transferencia: id, p_actor: id }],
      ['pay_resumen', { p_desde: new Date(0).toISOString(), p_hasta: new Date().toISOString() }],
    ];
    for (const cliente of [sesion, anonimo()]) {
      for (const [nombre, args] of llamadas) {
        const { error } = await cliente.rpc(nombre, args);
        expect(error?.code, nombre).toBe('42501');
      }
    }
  });
});
