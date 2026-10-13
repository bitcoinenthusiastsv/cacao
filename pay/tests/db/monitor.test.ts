import { describe, expect, it } from 'vitest';

import { embudoPay, resumenEnvios, tarifasYTasas, todosLosEnvios } from '@/servidor/monitor';
import { crearEnvio, procesarEnvio } from '@/servidor/transferencias';

import { administrador, codigoDe, datosEnvio, ok, usuarioNuevo } from './ayuda';

// The admin views: an administrator reads them, and anyone else is refused by every one.

const desde = new Date(Date.now() - 60_000);
const hasta = new Date(Date.now() + 60_000);

describe('vistas de administración', () => {
  it('todosLosEnvios muestra el envío con el primer nombre y el contacto enmascarado', async () => {
    const admin = await administrador();
    const remitente = await usuarioNuevo('Rosa Ramos');
    const creado = ok(await crearEnvio(remitente.id, datosEnvio(remitente, { destinatarioContacto: '+503 7123 4567' })));

    const pagina = ok(await todosLosEnvios(admin.id, { estado: 'creada' }));
    const envio = pagina.envios.find((e) => e.id === creado.id);
    expect(envio).toMatchObject({ remitenteNombre: 'Rosa', destinatarioContactoEnmascarado: '•••• ••67', estado: 'creada' });
    expect(JSON.stringify(pagina)).not.toContain('71234567');
  });

  it('todosLosEnvios filtra por estado', async () => {
    const admin = await administrador();
    const remitente = await usuarioNuevo();
    const creado = ok(await crearEnvio(remitente.id, datosEnvio(remitente)));
    await procesarEnvio(remitente.id, creado.id);

    const enCamino = ok(await todosLosEnvios(admin.id, { estado: 'procesando' }));
    expect(enCamino.envios.every((e) => e.estado === 'procesando')).toBe(true);
    expect(enCamino.envios.map((e) => e.id)).toContain(creado.id);
    const creadas = ok(await todosLosEnvios(admin.id, { estado: 'creada' }));
    expect(creadas.envios.map((e) => e.id)).not.toContain(creado.id);
  });

  it('resumenEnvios cuenta los envíos del periodo por estado', async () => {
    const admin = await administrador();
    const remitente = await usuarioNuevo();
    ok(await crearEnvio(remitente.id, datosEnvio(remitente, { monedaOrigen: 'USD', montoOrigenCentavos: 10_000 })));

    const resumen = ok(await resumenEnvios(admin.id, desde, hasta));
    const creadas = resumen.find((r) => r.estado === 'creada');
    expect(creadas).toBeDefined();
    expect(creadas!.cantidad).toBeGreaterThanOrEqual(1);
    expect(creadas!.montoOrigenUsdCentavos).toBeGreaterThanOrEqual(10_000);
  });

  it('resumenEnvios rechaza un periodo que termina antes de empezar', async () => {
    const admin = await administrador();
    expect(codigoDe(await resumenEnvios(admin.id, hasta, desde))).toBe('DATOS_INVALIDOS');
  });

  it('embudoPay devuelve los pasos de Cacao Pay en su orden y cuenta los envíos creados', async () => {
    const admin = await administrador();
    const remitente = await usuarioNuevo();
    const antes = ok(await embudoPay(admin.id, desde, hasta)).find((p) => p.nombre === 'creo_envio');
    ok(await crearEnvio(remitente.id, datosEnvio(remitente)));

    const pasos = ok(await embudoPay(admin.id, desde, hasta));
    expect(pasos.map((p) => p.nombre)).toEqual(['vio_cotizacion', 'inicio_envio', 'creo_envio', 'envio_completado']);
    expect(pasos.map((p) => p.orden)).toEqual([1, 2, 3, 4]);
    const despues = pasos.find((p) => p.nombre === 'creo_envio');
    expect(despues!.eventos).toBe(antes!.eventos + 1);
  });

  it('tarifasYTasas devuelve las tres formas de entrega y la tasa euro-dólar', async () => {
    const admin = await administrador();
    const datos = ok(await tarifasYTasas(admin.id));
    expect(datos.tarifas.map((t) => t.entrega).sort()).toEqual(['cuenta', 'efectivo', 'lightning']);
    expect(datos.tarifas.find((t) => t.entrega === 'efectivo')).toMatchObject({ fijoCentavos: 199, porcentajeBps: 150, minutosEstimados: 30 });
    expect(datos.tasas.find((t) => t.par === 'EUR/USD')).toMatchObject({ tasa: 1.08 });
  });
});

describe('quien no es administrador', () => {
  it('no puede leer ninguna vista de administración', async () => {
    const usuario = await usuarioNuevo();
    expect(codigoDe(await todosLosEnvios(usuario.id))).toBe('NO_PERMITIDO');
    expect(codigoDe(await resumenEnvios(usuario.id, desde, hasta))).toBe('NO_PERMITIDO');
    expect(codigoDe(await embudoPay(usuario.id, desde, hasta))).toBe('NO_PERMITIDO');
    expect(codigoDe(await tarifasYTasas(usuario.id))).toBe('NO_PERMITIDO');
  });

  it('un id que no existe tampoco pasa', async () => {
    expect(codigoDe(await todosLosEnvios('no-es-un-id'))).toBe('NO_PERMITIDO');
    expect(codigoDe(await tarifasYTasas('00000000-0000-0000-0000-000000000000'))).toBe('NO_PERMITIDO');
  });
});
