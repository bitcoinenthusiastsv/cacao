import { describe, expect, it } from 'vitest';

import { crearEnvio, envioPara, misEnvios, procesarEnvio, rastreo, recibidos } from '@/servidor/transferencias';

import { administrador, codigoDe, datosEnvio, filaEnvio, ok, usuarioNuevo, type Usuario } from './ayuda';

// What each person may read: the sender and the recipient see their transfer, a stranger does not,
// and the public tracking view shows the state and nothing private.

async function envioNuevo(remitente: Usuario, cambios: Parameters<typeof datosEnvio>[1] = {}) {
  return ok(await crearEnvio(remitente.id, datosEnvio(remitente, cambios)));
}

describe('envioPara', () => {
  it('quien envía ve el contacto completo, el historial y su rol', async () => {
    const remitente = await usuarioNuevo('Lucía');
    const envio = await envioNuevo(remitente, { destinatarioContacto: '+503 7123 4567', nota: 'Para la colecta' });
    const vista = await envioPara({ id: remitente.id, esAdmin: false }, envio.id);
    expect(vista).toMatchObject({
      rol: 'remitente',
      destinatarioContacto: '+503 7123 4567',
      destinatarioContactoEnmascarado: '•••• ••67',
      remitenteNombre: 'Lucía',
      nota: 'Para la colecta',
      estado: 'creada',
    });
    expect(vista?.historial).toHaveLength(1);
  });

  it('quien recibe ve el envío, pero no el contacto completo', async () => {
    const remitente = await usuarioNuevo();
    const destinatario = await usuarioNuevo('Marta');
    const envio = await envioNuevo(remitente, { destinatarioContacto: `+${destinatario.telefono}` });

    const vista = await envioPara({ id: destinatario.id, esAdmin: false }, envio.id);
    expect(vista).toMatchObject({ rol: 'destinatario', destinatarioContacto: null });
    expect(JSON.stringify(vista)).not.toContain(destinatario.telefono);
  });

  it('el administrador ve el contacto completo, sin ser quien envió', async () => {
    const remitente = await usuarioNuevo();
    const admin = await administrador();
    const envio = await envioNuevo(remitente, { destinatarioContacto: '+503 7123 4567' });
    const vista = await envioPara({ id: admin.id, esAdmin: true }, envio.id);
    expect(vista).toMatchObject({ rol: 'admin', destinatarioContacto: '+503 7123 4567' });
  });

  it('una persona sin relación con el envío recibe null', async () => {
    const remitente = await usuarioNuevo();
    const extraño = await usuarioNuevo();
    const envio = await envioNuevo(remitente);
    expect(await envioPara({ id: extraño.id, esAdmin: false }, envio.id)).toBeNull();
    expect(await envioPara({ id: extraño.id, esAdmin: false }, 'no-es-un-id')).toBeNull();
  });
});

describe('misEnvios y recibidos', () => {
  it('muestra los envíos de quien envía, del más nuevo al más viejo, de 20 en 20', async () => {
    const remitente = await usuarioNuevo();
    const creados: string[] = [];
    for (let i = 0; i < 21; i++) {
      creados.push((await envioNuevo(remitente, { montoOrigenCentavos: 1_000 + i })).id);
    }

    const primera = await misEnvios(remitente.id);
    expect(primera.total).toBe(21);
    expect(primera.porPagina).toBe(20);
    expect(primera.envios).toHaveLength(20);
    expect(primera.envios[0].id).toBe(creados[20]);

    const segunda = await misEnvios(remitente.id, { pagina: 2 });
    expect(segunda.envios).toHaveLength(1);
    expect(segunda.envios[0].id).toBe(creados[0]);
  });

  it('una página que no existe o no es un número cae en la primera', async () => {
    const remitente = await usuarioNuevo();
    await envioNuevo(remitente);
    expect((await misEnvios(remitente.id, { pagina: -4 })).pagina).toBe(1);
    expect((await misEnvios(remitente.id, { pagina: 1.5 })).pagina).toBe(1);
    expect((await misEnvios('no-es-un-id')).envios).toEqual([]);
  });

  it('un envío a un teléfono registrado llega a la lista de quien lo recibe', async () => {
    const remitente = await usuarioNuevo();
    const destinatario = await usuarioNuevo('Rosa');
    const envio = await envioNuevo(remitente, { destinatarioContacto: `+${destinatario.telefono}` });

    expect((await filaEnvio(envio.id)).destinatario_id).toBe(destinatario.id);
    const lista = await recibidos(destinatario.id);
    expect(lista.total).toBe(1);
    expect(lista.envios[0]).toMatchObject({ id: envio.id, destinatarioContactoEnmascarado: expect.stringMatching(/••/) });
  });

  it('un contacto sin cuenta no tiene destinatario registrado', async () => {
    const remitente = await usuarioNuevo();
    const envio = await envioNuevo(remitente, { destinatarioContacto: '+503 6199 0000' });
    expect((await filaEnvio(envio.id)).destinatario_id).toBeNull();
  });

  it('el remitente no puede enviarse dinero a sí mismo', async () => {
    const remitente = await usuarioNuevo();
    const r = await crearEnvio(remitente.id, datosEnvio(remitente, { destinatarioContacto: `+${remitente.telefono}` }));
    expect(codigoDe(r)).toBe('NO_PERMITIDO');
  });
});

describe('rastreo: la vista pública', () => {
  it('devuelve el estado, la línea de tiempo y lo que recibe el destinatario, con solo su primer nombre', async () => {
    const remitente = await usuarioNuevo('Sentinela Remitente');
    const envio = await envioNuevo(remitente, { destinatarioNombre: 'Mamá Marta Fuentes', destinatarioContacto: '+503 7123 4567' });
    await procesarEnvio(remitente.id, envio.id);

    const vista = await rastreo(envio.codigo);
    expect(vista).toMatchObject({
      codigo: envio.codigo,
      estado: 'procesando',
      monedaDestino: 'USD',
      montoDestino: 9_651,
      entrega: 'efectivo',
      minutosEstimados: 30,
      destinatarioNombre: 'Mamá',
    });
    expect(vista?.historial.map((p) => p.estado)).toEqual(['creada', 'procesando']);
  });

  it('nunca muestra el remitente, el contacto, la comisión ni la nota', async () => {
    const remitente = await usuarioNuevo('Sentinela Remitente');
    const envio = await envioNuevo(remitente, {
      destinatarioNombre: 'Mamá Marta',
      destinatarioContacto: '+503 7123 4567',
      nota: 'nota secreta 4411',
    });
    await procesarEnvio(remitente.id, envio.id);

    const texto = JSON.stringify(await rastreo(envio.codigo));
    expect(texto).not.toContain('Sentinela');
    expect(texto).not.toContain('71234567');
    expect(texto).not.toContain('+503');
    expect(texto).not.toContain('nota secreta');
    expect(texto).not.toContain('comision');
    expect(texto).not.toContain('remitente');
    expect(texto).not.toContain(remitente.telefono);
  });

  it('acepta el código escrito en minúsculas y sin guiones', async () => {
    const remitente = await usuarioNuevo();
    const envio = await envioNuevo(remitente);
    const forma = envio.codigo.replace(/-/g, '').toLowerCase();
    expect((await rastreo(forma))?.codigo).toBe(envio.codigo);
  });

  it('un código desconocido o mal escrito devuelve null', async () => {
    const remitente = await usuarioNuevo();
    await envioNuevo(remitente);
    expect(await rastreo('CP-AAAA-BBBB')).toBeNull();
    expect(await rastreo('CP-0OI1-2345')).toBeNull();
    expect(await rastreo('hola')).toBeNull();
  });
});
