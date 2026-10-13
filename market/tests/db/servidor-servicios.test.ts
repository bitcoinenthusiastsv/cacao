import { afterAll, describe, expect, it } from 'vitest';

import {
  abiertoNegocio,
  anonimo,
  categoriaServicioDePrueba,
  fila,
  limpiar,
  negocio,
  ocultarServicio,
  ordenDe,
  servicio,
  servicioDe,
  sufijo,
  suspenderNegocio,
  usuarioNuevo,
  type Usuario,
} from './ayuda';
import {
  cambiarActivoServicio,
  contratarServicio,
  guardarServicio,
  leerCatalogo,
  leerServicioPublico,
  miServicio,
  misServicios,
  type DatosServicio,
} from '@/servidor/servicios';

// The services server layer, against the local database. Each test creates its own users and shops.

afterAll(async () => {
  await limpiar();
});

async function datosFijos(extra: Partial<DatosServicio> = {}): Promise<DatosServicio> {
  return {
    id: null,
    categoriaId: await categoriaServicioDePrueba(),
    titulo: `Corte ${sufijo()}`,
    descripcion: 'Corte a domicilio, con herramienta propia.',
    zona: 'Suchitoto, Cuscatlán',
    tipoPrecio: 'fijo',
    precioUsdCentavos: 500,
    unidad: 'por corte',
    activo: true,
    fotos: [],
    ...extra,
  };
}

async function negocioDeDueno(): Promise<{ dueno: Usuario; negocioId: string }> {
  const dueno = await usuarioNuevo();
  return { dueno, negocioId: await negocio(dueno) };
}

describe('guardarServicio', () => {
  it('crea un servicio de precio fijo en un negocio aprobado', async () => {
    const { dueno, negocioId } = await negocioDeDueno();
    const r = await guardarServicio(dueno.id, await datosFijos());
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const fila_ = await fila('servicios', r.dato.id);
    expect(fila_.negocio_id).toBe(negocioId);
    expect(fila_.tipo_precio).toBe('fijo');
    expect(fila_.precio_usd_centavos).toBe(500);
    expect(fila_.unidad).toBe('por corte');
  });

  it('un servicio a cotizar guarda precio y unidad en blanco', async () => {
    const { dueno } = await negocioDeDueno();
    const r = await guardarServicio(
      dueno.id,
      await datosFijos({ tipoPrecio: 'cotizar', precioUsdCentavos: 9900, unidad: 'por hora' }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const fila_ = await fila('servicios', r.dato.id);
    expect(fila_.tipo_precio).toBe('cotizar');
    expect(fila_.precio_usd_centavos).toBeNull();
    expect(fila_.unidad).toBeNull();
  });

  it('edita un servicio propio y devuelve el mismo id', async () => {
    const { dueno } = await negocioDeDueno();
    const creado = await guardarServicio(dueno.id, await datosFijos());
    if (!creado.ok) throw new Error(creado.mensaje);

    const titulo = `Afeitado ${sufijo()}`;
    const editado = await guardarServicio(dueno.id, await datosFijos({ id: creado.dato.id, titulo, precioUsdCentavos: 700 }));
    expect(editado).toEqual({ ok: true, dato: { id: creado.dato.id } });

    const fila_ = await fila('servicios', creado.dato.id);
    expect(fila_.titulo).toBe(titulo);
    expect(fila_.precio_usd_centavos).toBe(700);
  });

  it('otro negocio no puede editar un servicio ajeno: NO_ENCONTRADA', async () => {
    const { dueno } = await negocioDeDueno();
    const ajeno = await negocioDeDueno();
    const creado = await guardarServicio(dueno.id, await datosFijos());
    if (!creado.ok) throw new Error(creado.mensaje);

    const r = await guardarServicio(ajeno.dueno.id, await datosFijos({ id: creado.dato.id }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('NO_ENCONTRADA');
  });

  it('quien no tiene negocio no publica servicios: NO_PERMITIDO', async () => {
    const sinNegocio = await usuarioNuevo();
    const r = await guardarServicio(sinNegocio.id, await datosFijos());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('NO_PERMITIDO');
  });

  it('un negocio pendiente no publica servicios: NO_PERMITIDO', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno, { aprobar: false });
    const r = await guardarServicio(dueno.id, await datosFijos());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('NO_PERMITIDO');
  });

  it('refuses malformed input before the database: DATOS_INVALIDOS', async () => {
    const { dueno } = await negocioDeDueno();
    const base = await datosFijos();
    const casos: [string, string, Partial<DatosServicio> | null][] = [
      ['título de una letra', 'titulo', { titulo: 'a' }],
      ['descripción de 601 caracteres', 'desc', { descripcion: 'x'.repeat(601) }],
      ['precio cero', 'precio', { precioUsdCentavos: 0 }],
      ['precio mayor a $10,000', 'precio', { precioUsdCentavos: 1_000_001 }],
      ['precio con decimales', 'precio', { precioUsdCentavos: 5.5 }],
      ['precio nulo en servicio fijo', 'precio', { precioUsdCentavos: null }],
      ['unidad vacía en servicio fijo', 'unidad', { unidad: '  ' }],
      ['categoría cero', 'categoria', { categoriaId: 0 }],
      ['tipo de precio desconocido', 'tipo', { tipoPrecio: 'gratis' as never }],
      ['activo como texto', 'activo', { activo: 'si' as never }],
      ['siete fotos', 'fotos', { fotos: Array(7).fill('/productos/a.jpg') }],
      ['foto de otro sitio', 'fotos', { fotos: ['https://ejemplo.com/x.jpg'] }],
      ['id de servicio malformado', 'id', { id: 'no-es-un-uuid' }],
    ];
    for (const [nombre, , cambio] of casos) {
      const r = await guardarServicio(dueno.id, { ...base, ...(cambio ?? {}) });
      expect(r.ok, nombre).toBe(false);
      if (!r.ok) expect(r.codigo, nombre).toBe('DATOS_INVALIDOS');
    }

    const usuarioMalo = await guardarServicio('no-es-un-uuid', base);
    expect(usuarioMalo.ok).toBe(false);
    if (!usuarioMalo.ok) expect(usuarioMalo.codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('cambiarActivoServicio', () => {
  it('pausa y vuelve a activar un servicio propio, y guarda el resto', async () => {
    const { dueno } = await negocioDeDueno();
    const creado = await guardarServicio(dueno.id, await datosFijos({ precioUsdCentavos: 800 }));
    if (!creado.ok) throw new Error(creado.mensaje);

    const pausa = await cambiarActivoServicio(dueno.id, creado.dato.id, false);
    expect(pausa).toEqual({ ok: true, dato: { activo: false } });
    const pausado = await fila('servicios', creado.dato.id);
    expect(pausado.activo).toBe(false);
    expect(pausado.precio_usd_centavos).toBe(800);

    const vuelve = await cambiarActivoServicio(dueno.id, creado.dato.id, true);
    expect(vuelve.ok).toBe(true);
    expect((await fila('servicios', creado.dato.id)).activo).toBe(true);
  });

  it('un servicio ajeno no se pausa: NO_ENCONTRADA', async () => {
    const { dueno } = await negocioDeDueno();
    const ajeno = await negocioDeDueno();
    const creado = await guardarServicio(dueno.id, await datosFijos());
    if (!creado.ok) throw new Error(creado.mensaje);

    const r = await cambiarActivoServicio(ajeno.dueno.id, creado.dato.id, false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('NO_ENCONTRADA');
    expect((await fila('servicios', creado.dato.id)).activo).toBe(true);
  });

  it('refuses a malformed id or a value that is not yes or no: DATOS_INVALIDOS', async () => {
    const { dueno } = await negocioDeDueno();
    const malo = await cambiarActivoServicio(dueno.id, 'no-es-un-uuid', false);
    expect(malo.ok).toBe(false);
    if (!malo.ok) expect(malo.codigo).toBe('DATOS_INVALIDOS');

    const creado = await guardarServicio(dueno.id, await datosFijos());
    if (!creado.ok) throw new Error(creado.mensaje);
    const sinValor = await cambiarActivoServicio(dueno.id, creado.dato.id, 'no' as never);
    expect(sinValor.ok).toBe(false);
    if (!sinValor.ok) expect(sinValor.codigo).toBe('DATOS_INVALIDOS');
  });
});

describe('contratarServicio', () => {
  it('contrata un servicio fijo: un trabajo acordado a su precio', async () => {
    const { dueno, negocioId } = await negocioDeDueno();
    const cliente = await usuarioNuevo();
    const svc = await servicioDe(dueno, { precio: 450, unidad: 'por viaje' });

    const r = await contratarServicio(cliente.id, {
      servicioId: svc.id,
      nota: 'Mañana a las 3 en mi casa',
      clave: `contrato-${sufijo()}`,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const orden = await ordenDe(r.dato.ordenId);
    expect(orden.tipo).toBe('servicio');
    expect(orden.estado).toBe('acordada');
    expect(orden.total_usd_centavos).toBe(450);
    expect(orden.comprador_id).toBe(cliente.id);
    expect(orden.negocio_id).toBe(negocioId);
    expect(orden.modo_entrega).toBeNull();

    const { data: lineas } = await servicio().from('lineas_orden').select('*').eq('orden_id', r.dato.ordenId);
    expect(lineas).toHaveLength(1);
    expect(lineas![0].servicio_id).toBe(svc.id);
    expect(lineas![0].unidad).toBe('por viaje');
    expect(lineas![0].precio_usd_centavos).toBe(450);
  });

  it('el primer mensaje del chat es la nota del cliente', async () => {
    const { dueno } = await negocioDeDueno();
    const cliente = await usuarioNuevo();
    const svc = await servicioDe(dueno);
    const r = await contratarServicio(cliente.id, { servicioId: svc.id, nota: 'Llevo la escalera', clave: `n-${sufijo()}` });
    if (!r.ok) throw new Error(r.mensaje);

    const { data: mensajes } = await servicio().from('mensajes').select('texto, autor_id').eq('orden_id', r.dato.ordenId);
    expect(mensajes).toEqual([{ texto: 'Llevo la escalera', autor_id: cliente.id }]);
  });

  it('el mismo clave dos veces devuelve el mismo trabajo (doble toque)', async () => {
    const { dueno } = await negocioDeDueno();
    const cliente = await usuarioNuevo();
    const svc = await servicioDe(dueno);
    const clave = `doble-${sufijo()}`;

    const primero = await contratarServicio(cliente.id, { servicioId: svc.id, nota: '', clave });
    const segundo = await contratarServicio(cliente.id, { servicioId: svc.id, nota: '', clave });
    expect(primero.ok && segundo.ok).toBe(true);
    if (primero.ok && segundo.ok) expect(segundo.dato.ordenId).toBe(primero.dato.ordenId);
  });

  it('la misma clave para otro servicio crea otro trabajo', async () => {
    const { dueno } = await negocioDeDueno();
    const cliente = await usuarioNuevo();
    const uno = await servicioDe(dueno);
    const otro = await servicioDe(dueno);
    const clave = `compartida-${sufijo()}`;

    const a = await contratarServicio(cliente.id, { servicioId: uno.id, nota: '', clave });
    const b = await contratarServicio(cliente.id, { servicioId: otro.id, nota: '', clave });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.dato.ordenId).not.toBe(a.dato.ordenId);
  });

  it('acepta una clave de 100 caracteres', async () => {
    const { dueno } = await negocioDeDueno();
    const cliente = await usuarioNuevo();
    const svc = await servicioDe(dueno);
    const r = await contratarServicio(cliente.id, { servicioId: svc.id, nota: '', clave: 'k'.repeat(100) });
    expect(r.ok).toBe(true);
  });

  it('el trabajo conserva su precio aunque el negocio cambie o pause el servicio', async () => {
    const { dueno } = await negocioDeDueno();
    const cliente = await usuarioNuevo();
    const svc = await servicioDe(dueno, { precio: 500 });
    const r = await contratarServicio(cliente.id, { servicioId: svc.id, nota: '', clave: `precio-${sufijo()}` });
    if (!r.ok) throw new Error(r.mensaje);

    const cambio = await guardarServicio(
      dueno.id,
      await datosFijos({ id: svc.id, precioUsdCentavos: 9900, unidad: 'por hora' }),
    );
    expect(cambio.ok).toBe(true);
    await cambiarActivoServicio(dueno.id, svc.id, false);

    expect((await ordenDe(r.dato.ordenId)).total_usd_centavos).toBe(500);
  });

  it('un servicio a cotizar no se contrata directamente: ESTADO_INVALIDO', async () => {
    const { dueno } = await negocioDeDueno();
    const cliente = await usuarioNuevo();
    const svc = await servicioDe(dueno, { tipo: 'cotizar' });
    const r = await contratarServicio(cliente.id, { servicioId: svc.id, nota: '', clave: `cot-${sufijo()}` });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('ESTADO_INVALIDO');
  });

  it('no se contrata el propio servicio: NO_PERMITIDO', async () => {
    const { dueno } = await negocioDeDueno();
    const svc = await servicioDe(dueno);
    const r = await contratarServicio(dueno.id, { servicioId: svc.id, nota: '', clave: `propio-${sufijo()}` });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe('NO_PERMITIDO');
  });

  it('un servicio oculto por el administrador no se contrata: NO_ENCONTRADA', async () => {
    const { dueno } = await negocioDeDueno();
    const cliente = await usuarioNuevo();
    const svc = await servicioDe(dueno);
    await ocultarServicio(svc.id, true);
    try {
      const r = await contratarServicio(cliente.id, { servicioId: svc.id, nota: '', clave: `oculto-${sufijo()}` });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.codigo).toBe('NO_ENCONTRADA');
    } finally {
      await ocultarServicio(svc.id, false);
    }
  });

  it('un negocio cerrado no recibe el trabajo: NEGOCIO_CERRADO', async () => {
    const { dueno, negocioId } = await negocioDeDueno();
    const cliente = await usuarioNuevo();
    const svc = await servicioDe(dueno);
    await abiertoNegocio(negocioId, false);
    try {
      const r = await contratarServicio(cliente.id, { servicioId: svc.id, nota: '', clave: `cerrado-${sufijo()}` });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.codigo).toBe('NEGOCIO_CERRADO');
    } finally {
      await abiertoNegocio(negocioId, true);
    }
  });

  it('refuses malformed input before the database: DATOS_INVALIDOS', async () => {
    const { dueno } = await negocioDeDueno();
    const cliente = await usuarioNuevo();
    const svc = await servicioDe(dueno);
    const casos: [string, string, { servicioId: string; nota: string; clave: string }][] = [
      ['servicio malformado', cliente.id, { servicioId: 'x', nota: '', clave: 'clave' }],
      ['clave vacía', cliente.id, { servicioId: svc.id, nota: '', clave: '   ' }],
      ['clave de 101 caracteres', cliente.id, { servicioId: svc.id, nota: '', clave: 'k'.repeat(101) }],
      ['nota de 601 caracteres', cliente.id, { servicioId: svc.id, nota: 'n'.repeat(601), clave: 'clave' }],
      ['usuario malformado', 'no-es-un-uuid', { servicioId: svc.id, nota: '', clave: 'clave' }],
    ];
    for (const [nombre, usuarioId, datos] of casos) {
      const r = await contratarServicio(usuarioId, datos);
      expect(r.ok, nombre).toBe(false);
      if (!r.ok) expect(r.codigo, nombre).toBe('DATOS_INVALIDOS');
    }
  });
});

describe('lecturas del catálogo y del servicio público', () => {
  // One marker per test run: the search finds only the services this test made.
  async function escenario() {
    const marca = sufijo();
    const { dueno, negocioId } = await negocioDeDueno();
    const visible = await servicioDe(dueno, { titulo: `Corte visible ${marca}` });
    const pausado = await servicioDe(dueno, { titulo: `Corte pausado ${marca}`, activo: false });
    const oculto = await servicioDe(dueno, { titulo: `Corte oculto ${marca}` });
    await ocultarServicio(oculto.id, true);

    const otro = await negocioDeDueno();
    const suspendido = await servicioDe(otro.dueno, { titulo: `Corte suspendido ${marca}` });
    await suspenderNegocio(otro.negocioId);
    return { marca, dueno, negocioId, visible, pausado, oculto, suspendido };
  }

  it('el catálogo muestra solo servicios visibles de negocios aprobados', async () => {
    const e = await escenario();
    const resultados = await leerCatalogo(anonimo(), { busqueda: e.marca });
    const ids = resultados.map((r) => r.id);
    expect(ids).toContain(e.visible.id);
    expect(ids).not.toContain(e.pausado.id);
    expect(ids).not.toContain(e.oculto.id);
    expect(ids).not.toContain(e.suspendido.id);

    const visibleEnCatalogo = resultados.find((r) => r.id === e.visible.id)!;
    expect(visibleEnCatalogo.negocioId).toBe(e.negocioId);
    expect(visibleEnCatalogo.tipoPrecio).toBe('fijo');
    expect(visibleEnCatalogo.precioUsdCentavos).toBe(500);
    expect(visibleEnCatalogo.unidad).toBe('por corte');
    expect(visibleEnCatalogo.abierto).toBe(true);
  });

  it('un % o un _ escritos por la persona son literales en la búsqueda', async () => {
    const e = await escenario();
    const todos = await leerCatalogo(anonimo(), { busqueda: e.marca });
    expect(todos.length).toBeGreaterThan(0);

    // A bare wildcard matches nothing that has no literal % in it.
    const comodin = await leerCatalogo(anonimo(), { busqueda: `%${e.marca}` });
    expect(comodin).toEqual([]);
    const guion = await leerCatalogo(anonimo(), { busqueda: '_' });
    expect(guion.map((r) => r.id)).not.toContain(e.visible.id);
    const porcentaje = await leerCatalogo(anonimo(), { busqueda: '%' });
    expect(porcentaje.map((r) => r.id)).not.toContain(e.visible.id);
  });

  it('busca por título o por descripción, sin distinguir mayúsculas', async () => {
    const e = await escenario();
    const porTitulo = await leerCatalogo(anonimo(), { busqueda: `CORTE VISIBLE ${e.marca}` });
    expect(porTitulo.map((r) => r.id)).toContain(e.visible.id);

    const { dueno } = await negocioDeDueno();
    const frase = `Trabajo a domicilio ${sufijo()}`;
    const conFrase = await guardarServicio(dueno.id, await datosFijos({ descripcion: frase }));
    if (!conFrase.ok) throw new Error(conFrase.mensaje);
    const porDescripcion = await leerCatalogo(anonimo(), { busqueda: frase.toUpperCase() });
    expect(porDescripcion.map((r) => r.id)).toEqual([conFrase.dato.id]);
  });

  it('filtra por categoría y rechaza una categoría que no es un número válido', async () => {
    const e = await escenario();
    const categoria = await categoriaServicioDePrueba();
    const enCategoria = await leerCatalogo(anonimo(), { busqueda: e.marca, categoriaId: categoria });
    expect(enCategoria.map((r) => r.id)).toContain(e.visible.id);
    expect(enCategoria.every((r) => r.categoriaId === categoria)).toBe(true);

    expect(await leerCatalogo(anonimo(), { categoriaId: 0 })).toEqual([]);
  });

  it('la página de un servicio visible trae el negocio y las reseñas, y nada de los ocultos', async () => {
    const e = await escenario();
    const detalle = await leerServicioPublico(anonimo(), e.visible.id);
    expect(detalle).not.toBeNull();
    expect(detalle!.negocioNombre).toMatch(/Negocio de prueba/);
    expect(detalle!.descripcion).toBe('Servicio creado por las pruebas de base de datos.');
    expect(detalle!.negocioDescripcion).toBe('Negocio creado por las pruebas de base de datos.');
    expect(detalle!.promedio).toBeNull();
    expect(detalle!.cantidadResenas).toBe(0);

    expect(await leerServicioPublico(anonimo(), e.pausado.id)).toBeNull();
    expect(await leerServicioPublico(anonimo(), e.oculto.id)).toBeNull();
    expect(await leerServicioPublico(anonimo(), e.suspendido.id)).toBeNull();
    expect(await leerServicioPublico(anonimo(), 'no-es-un-uuid')).toBeNull();
  });

  it('la lista del catálogo no contiene teléfono, correo ni código de entrega', async () => {
    const e = await escenario();
    const texto = JSON.stringify(await leerCatalogo(anonimo(), { busqueda: e.marca }));
    expect(texto).not.toContain(e.dueno.telefono);
    expect(texto).not.toMatch(/codigo_entrega|telefono|correo|@/);
  });
});

describe('lecturas del propio negocio', () => {
  it('el negocio ve todos sus servicios, pausados y ocultos incluidos', async () => {
    const { dueno, negocioId } = await negocioDeDueno();
    const activo = await servicioDe(dueno);
    const pausado = await servicioDe(dueno, { activo: false });
    const oculto = await servicioDe(dueno);
    await ocultarServicio(oculto.id, true);
    try {
      const lista = await misServicios(negocioId);
      const ids = lista.map((s) => s.id);
      expect(ids).toEqual(expect.arrayContaining([activo.id, pausado.id, oculto.id]));
      expect(lista.find((s) => s.id === oculto.id)!.oculto).toBe(true);
      expect(lista.find((s) => s.id === pausado.id)!.activo).toBe(false);
      // Active services come first.
      expect(lista[0].activo).toBe(true);
    } finally {
      await ocultarServicio(oculto.id, false);
    }
  });

  it('un negocio no ve un servicio de otro: miServicio devuelve null', async () => {
    const { dueno } = await negocioDeDueno();
    const ajeno = await negocioDeDueno();
    const svc = await servicioDe(dueno);
    expect(await miServicio(ajeno.negocioId, svc.id)).toBeNull();
    expect(await miServicio(ajeno.negocioId, 'no-es-un-uuid')).toBeNull();
    expect(await misServicios('no-es-un-uuid')).toEqual([]);
  });
});
