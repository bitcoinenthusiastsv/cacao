import { afterAll, describe, expect, it } from 'vitest';

import {
  anonimo,
  categoriaServicioDePrueba,
  fila,
  limpiar,
  limpiarTablon,
  negocio,
  ocultarNecesidad,
  ofertarRaw,
  servicio,
  sufijo,
  usuarioNuevo,
  type Usuario,
} from './ayuda';
import {
  cancelarNecesidad,
  leerNecesidadPublica,
  leerTablon,
  misNecesidades,
  necesidadParaUsuario,
  publicarNecesidad,
  type DatosNecesidad,
} from '@/servidor/necesidades';

// The board on the server, against the local database. Needs posted here are cancelled afterwards.

const publicadas: { id: string; autor: Usuario }[] = [];

afterAll(async () => {
  for (const { id, autor } of publicadas.splice(0)) {
    await servicio().rpc('cancelar_necesidad', { p_necesidad: id, p_usuario: autor.id });
  }
  await limpiarTablon();
  await limpiar();
});

async function datos(extra: Partial<DatosNecesidad> = {}): Promise<DatosNecesidad> {
  return {
    categoriaId: await categoriaServicioDePrueba(),
    titulo: `Reparar techo ${sufijo()}`,
    descripcion: 'Gotera en el cuarto de atrás, hace falta ver el daño.',
    zona: 'Suchitoto, Cuscatlán',
    presupuestoUsdCentavos: 5000,
    ...extra,
  };
}

// Posts through the server layer and remembers the need for cleanup.
async function publicar(autor: Usuario, extra: Partial<DatosNecesidad> = {}): Promise<string> {
  const r = await publicarNecesidad(autor.id, await datos(extra));
  if (!r.ok) throw new Error(`${r.codigo}: ${r.mensaje}`);
  publicadas.push({ id: r.dato.id, autor });
  return r.dato.id;
}

async function tiendaAprobada(): Promise<{ dueno: Usuario; negocioId: string }> {
  const dueno = await usuarioNuevo();
  return { dueno, negocioId: await negocio(dueno) };
}

// Offers through the database, so the setup is not what the test checks.
async function ofertar(dueno: Usuario, necesidadId: string, precio = 3000, mensaje = 'Puedo pasar el jueves.') {
  const { data, error } = await ofertarRaw(dueno, necesidadId, precio, mensaje);
  if (error) throw error;
  return data;
}

describe('publicarNecesidad y cancelarNecesidad', () => {
  it('cualquier cuenta publica una necesidad abierta; el presupuesto es opcional', async () => {
    const autor = await usuarioNuevo();
    const r = await publicarNecesidad(autor.id, await datos({ presupuestoUsdCentavos: null }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    publicadas.push({ id: r.dato.id, autor });

    const fila_ = await fila('necesidades', r.dato.id);
    expect(fila_.estado).toBe('abierta');
    expect(fila_.presupuesto_usd_centavos).toBeNull();
    expect(fila_.usuario_id).toBe(autor.id);
  });

  it('refuses invalid input before the database: DATOS_INVALIDOS', async () => {
    const autor = await usuarioNuevo();
    const casos: [string, Partial<DatosNecesidad>][] = [
      ['título de tres letras', { titulo: 'abc' }],
      ['título de 101 caracteres', { titulo: 'x'.repeat(101) }],
      ['descripción de 1001 caracteres', { descripcion: 'x'.repeat(1001) }],
      ['zona de 161 caracteres', { zona: 'z'.repeat(161) }],
      ['presupuesto cero', { presupuestoUsdCentavos: 0 }],
      ['presupuesto con decimales', { presupuestoUsdCentavos: 12.5 }],
      ['presupuesto mayor a $10,000', { presupuestoUsdCentavos: 1_000_001 }],
      ['categoría cero', { categoriaId: 0 }],
    ];
    for (const [nombre, cambio] of casos) {
      const r = await publicarNecesidad(autor.id, await datos(cambio));
      expect(r.ok, nombre).toBe(false);
      if (!r.ok) expect(r.codigo, nombre).toBe('DATOS_INVALIDOS');
    }
    const malo = await publicarNecesidad('no-es-un-uuid', await datos());
    expect(malo.ok).toBe(false);
    if (!malo.ok) expect(malo.codigo).toBe('DATOS_INVALIDOS');
  });

  it('una cuenta que no existe no publica: NO_ENCONTRADA', async () => {
    const r = await publicarNecesidad(globalThis.crypto.randomUUID(), await datos());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('NO_ENCONTRADA');
  });

  it('solo quien publicó la cancela, y las ofertas abiertas se cierran', async () => {
    const autor = await usuarioNuevo();
    const id = await publicar(autor);
    const tienda = await tiendaAprobada();
    const oferta = await ofertar(tienda.dueno, id);

    const ajeno = await usuarioNuevo();
    const de_ajeno = await cancelarNecesidad(ajeno.id, id);
    expect(de_ajeno.ok).toBe(false);
    if (!de_ajeno.ok) expect(de_ajeno.codigo).toBe('NO_PERMITIDO');

    const cancelada = await cancelarNecesidad(autor.id, id);
    expect(cancelada).toEqual({ ok: true, dato: { id } });
    expect((await fila('necesidades', id)).estado).toBe('cancelada');
    expect((await fila('cotizaciones', oferta.id)).estado).toBe('rechazada');

    const otra_vez = await cancelarNecesidad(autor.id, id);
    expect(otra_vez.ok).toBe(false);
    if (!otra_vez.ok) expect(otra_vez.codigo).toBe('ESTADO_INVALIDO');
  });

  it('refuses malformed ids: DATOS_INVALIDOS', async () => {
    const autor = await usuarioNuevo();
    const r = await cancelarNecesidad(autor.id, 'no-es-un-uuid');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('tablón y necesidad pública', () => {
  // Nine needs: one visible with two offers, one hidden, one expired, one cancelled.
  async function escenario() {
    const lucia = await usuarioNuevo();
    await servicio().from('usuarios').update({ nombre: 'Lucía Pérez Ramírez' }).eq('id', lucia.id);
    const visible = await publicar(lucia, { titulo: `Pintar cerca ${sufijo()}`, presupuestoUsdCentavos: 5000 });
    const oculta = await publicar(lucia);
    await ocultarNecesidad(oculta, true);
    const vencida = await publicar(lucia);
    await servicio().from('necesidades').update({ vence_en: new Date(Date.now() - 86_400_000).toISOString() }).eq('id', vencida);

    const tiendaA = await tiendaAprobada();
    const tiendaB = await tiendaAprobada();
    await ofertar(tiendaA.dueno, visible, 4000);
    await ofertar(tiendaB.dueno, visible, 4500);
    return { lucia, visible, oculta, vencida, tiendaA, tiendaB };
  }

  it('el tablón trae la necesidad con autor (primer nombre), días, presupuesto y ofertas abiertas', async () => {
    const e = await escenario();
    const lista = await leerTablon(anonimo(), { categoriaId: await categoriaServicioDePrueba() });
    const n = lista.find((x) => x.id === e.visible);
    expect(n).toBeDefined();
    expect(n!.autorNombre).toBe('Lucía');
    expect(n!.estado).toBe('abierta');
    expect(n!.presupuestoUsdCentavos).toBe(5000);
    expect(n!.diasRestantes).toBeGreaterThanOrEqual(13);
    expect(n!.diasRestantes).toBeLessThanOrEqual(14);
    expect(n!.ofertasAbiertas).toBe(2);
    expect(n!.categoriaNombre).not.toBe('');
  });

  it('el tablón deja fuera las necesidades ocultas y vencidas', async () => {
    const e = await escenario();
    const ids = (await leerTablon(anonimo(), { categoriaId: await categoriaServicioDePrueba() })).map((x) => x.id);
    expect(ids).toContain(e.visible);
    expect(ids).not.toContain(e.oculta);
    expect(ids).not.toContain(e.vencida);
  });

  it('la necesidad pública no abre las ocultas, las vencidas ni las no válidas', async () => {
    const e = await escenario();
    const publica = await leerNecesidadPublica(anonimo(), e.visible);
    expect(publica).not.toBeNull();
    expect(publica!.ofertasAbiertas).toBe(2);
    expect(await leerNecesidadPublica(anonimo(), e.oculta)).toBeNull();
    expect(await leerNecesidadPublica(anonimo(), e.vencida)).toBeNull();
    expect(await leerNecesidadPublica(anonimo(), 'no-es-un-uuid')).toBeNull();
  });

  it('ninguna lista de necesidades trae teléfono, correo ni datos de contacto', async () => {
    const e = await escenario();
    const texto = JSON.stringify([
      ...(await leerTablon(anonimo(), { categoriaId: await categoriaServicioDePrueba() })),
      await leerNecesidadPublica(anonimo(), e.visible),
    ]);
    expect(texto).not.toContain(e.lucia.telefono);
    expect(texto).not.toMatch(/telefono|correo|codigo_entrega|@/);
  });
});

describe('necesidadParaUsuario', () => {
  async function escenario() {
    const autor = await usuarioNuevo();
    const id = await publicar(autor);
    const tiendaA = await tiendaAprobada();
    const tiendaB = await tiendaAprobada();
    const pendiente = await usuarioNuevo();
    await negocio(pendiente, { aprobar: false });
    const ofertaA = await ofertar(tiendaA.dueno, id, 3000, 'Tengo el material.');
    await ofertar(tiendaB.dueno, id, 4200, 'Voy el fin de semana.');
    return { autor, id, tiendaA, tiendaB, pendiente, ofertaA, extraño: await usuarioNuevo() };
  }

  it('el autor ve todas las ofertas, con tienda, precio, mensaje y estado; no puede ofertar', async () => {
    const e = await escenario();
    const r = await necesidadParaUsuario(e.id, e.autor);
    expect(r).not.toBeNull();
    expect(r!.esAutor).toBe(true);
    expect(r!.ofertas).toHaveLength(2);
    const precios = r!.ofertas.map((o) => o.precioUsdCentavos).sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(precios).toEqual([3000, 4200]);
    expect(r!.ofertas.find((o) => o.precioUsdCentavos === 3000)!.mensaje).toBe('Tengo el material.');
    expect(r!.ofertas[0].negocioNombre).toMatch(/Negocio de prueba/);
    expect(r!.ofertas[0].estado).toBe('ofrecida');
    expect(r!.miOferta).toBeNull();
    expect(r!.puedeOfertar).toBe(false);
    expect(r!.motivoNoPuedeOfertar).toBe('No podés ofertar en tu propia necesidad.');
  });

  it('una tienda ve solo su propia oferta, y no puede ofertar otra vez', async () => {
    const e = await escenario();
    const r = await necesidadParaUsuario(e.id, e.tiendaA.dueno);
    expect(r).not.toBeNull();
    expect(r!.esAutor).toBe(false);
    expect(r!.ofertas).toEqual([]);
    expect(r!.miOferta?.id).toBe(e.ofertaA.id);
    expect(r!.miOferta?.precioUsdCentavos).toBe(3000);
    expect(r!.puedeOfertar).toBe(false);
    expect(r!.motivoNoPuedeOfertar).toBe('Ya ofertaste en esta necesidad. Podés retirar tu oferta para cambiarla.');
  });

  it('una tienda sin oferta puede ofertar', async () => {
    const e = await escenario();
    const otra = await tiendaAprobada();
    const r = await necesidadParaUsuario(e.id, otra.dueno);
    expect(r!.miOferta).toBeNull();
    expect(r!.ofertas).toEqual([]);
    expect(r!.puedeOfertar).toBe(true);
    expect(r!.motivoNoPuedeOfertar).toBeNull();
  });

  it('un visitante sin negocio aprobado ve la necesidad, pero no ofertas ni opciones', async () => {
    const e = await escenario();
    const r = await necesidadParaUsuario(e.id, e.extraño);
    expect(r).not.toBeNull();
    expect(r!.esAutor).toBe(false);
    expect(r!.ofertas).toEqual([]);
    expect(r!.miOferta).toBeNull();
    expect(r!.puedeOfertar).toBe(false);
    expect(r!.motivoNoPuedeOfertar).toBe('Solo los negocios aprobados pueden ofertar.');

    const pendiente = await necesidadParaUsuario(e.id, e.pendiente);
    expect(pendiente!.miOferta).toBeNull();
    expect(pendiente!.puedeOfertar).toBe(false);
  });

  it('una necesidad cerrada sigue visible para la tienda que ofertó, con el motivo', async () => {
    const e = await escenario();
    await cancelarNecesidad(e.autor.id, e.id);

    const tienda = await necesidadParaUsuario(e.id, e.tiendaA.dueno);
    expect(tienda).not.toBeNull();
    expect(tienda!.necesidad.estado).toBe('cancelada');
    expect(tienda!.miOferta?.estado).toBe('rechazada');
    expect(tienda!.puedeOfertar).toBe(false);
    expect(tienda!.motivoNoPuedeOfertar).toBe('Esa necesidad ya no recibe ofertas.');

    // Other visitors do not see a closed need.
    expect(await necesidadParaUsuario(e.id, e.extraño)).toBeNull();
    const sinOferta = await tiendaAprobada();
    expect(await necesidadParaUsuario(e.id, sinOferta.dueno)).toBeNull();

    // The author still sees it, and every offer is closed.
    const autor = await necesidadParaUsuario(e.id, e.autor);
    expect(autor!.necesidad.estado).toBe('cancelada');
    expect(autor!.ofertas.every((o) => o.estado === 'rechazada')).toBe(true);
  });

  it('una necesidad oculta solo la ve su autor', async () => {
    const e = await escenario();
    await ocultarNecesidad(e.id, true);
    try {
      expect(await necesidadParaUsuario(e.id, e.autor)).not.toBeNull();
      expect(await necesidadParaUsuario(e.id, e.tiendaA.dueno)).toBeNull();
      expect(await necesidadParaUsuario(e.id, e.extraño)).toBeNull();
    } finally {
      await ocultarNecesidad(e.id, false);
    }
  });

  it('una tienda que retiró su oferta puede ofertar otra vez', async () => {
    const e = await escenario();
    const { error } = await servicio().rpc('retirar_cotizacion', { p_cotizacion: e.ofertaA.id, p_actor: e.tiendaA.dueno.id });
    expect(error).toBeNull();
    const r = await necesidadParaUsuario(e.id, e.tiendaA.dueno);
    expect(r!.miOferta?.estado).toBe('retirada');
    expect(r!.puedeOfertar).toBe(true);
    expect(r!.motivoNoPuedeOfertar).toBeNull();
  });

  it('ids malformados y visitantes sin id dan null', async () => {
    const e = await escenario();
    expect(await necesidadParaUsuario('no-es-un-uuid', e.autor)).toBeNull();
    expect(await necesidadParaUsuario(e.id, { id: 'no-es-un-uuid' })).toBeNull();
  });

  it('la respuesta no trae teléfono, correo ni código de entrega', async () => {
    const e = await escenario();
    const texto = JSON.stringify(await necesidadParaUsuario(e.id, e.autor));
    expect(texto).not.toContain(e.autor.telefono);
    expect(texto).not.toMatch(/telefono|correo|codigo_entrega|@/);
  });
});

describe('misNecesidades', () => {
  it('el autor ve sus necesidades en todos los estados, con las ofertas abiertas de cada una', async () => {
    const autor = await usuarioNuevo();
    const abierta = await publicar(autor, { titulo: `Abierta ${sufijo()}` });
    const cerrada = await publicar(autor, { titulo: `Cerrada ${sufijo()}` });
    const tienda = await tiendaAprobada();
    await ofertar(tienda.dueno, abierta);
    await cancelarNecesidad(autor.id, cerrada);

    const lista = await misNecesidades(autor.id);
    const ids = lista.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining([abierta, cerrada]));
    expect(lista.find((n) => n.id === abierta)!.ofertasAbiertas).toBe(1);
    expect(lista.find((n) => n.id === cerrada)!.estado).toBe('cancelada');
    expect(lista.find((n) => n.id === cerrada)!.ofertasAbiertas).toBe(0);

    const ajena = await misNecesidades((await usuarioNuevo()).id);
    expect(ajena).toEqual([]);
    expect(await misNecesidades('no-es-un-uuid')).toEqual([]);
  });
});
