import { afterAll, describe, expect, it } from 'vitest';
import { administrador, anonimo, categoriaServicioDePrueba, codigoDe, fila, limpiar, negocio, ocultarServicio, servicio, servicioDe, sesionDe, suspenderNegocio, sufijo, usuarioNuevo } from './ayuda';

// The service catalogue: what a shop may publish, and who sees what.

afterAll(limpiar);

describe('guardar_servicio', () => {
  it('un servicio fijo guarda precio y unidad; uno a cotizar no guarda ninguno aunque lleguen', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);

    const fijo = await servicioDe(dueno, { precio: 500, unidad: 'por corte' });
    expect(fijo.tipo_precio).toBe('fijo');
    expect(fijo.precio_usd_centavos).toBe(500);
    expect(fijo.unidad).toBe('por corte');
    expect(fijo.activo).toBe(true);
    expect(fijo.oculto).toBe(false);

    const { data: cotizar, error } = await servicio().rpc('guardar_servicio', {
      p_usuario: dueno.id,
      p_servicio: null,
      p_categoria: await categoriaServicioDePrueba(),
      p_titulo: 'Reparación de prueba',
      p_descripcion: '',
      p_zona: '',
      p_tipo_precio: 'cotizar',
      p_precio: 900,
      p_unidad: 'por hora',
      p_activo: true,
      p_fotos: [],
    });
    expect(error).toBeNull();
    expect(cotizar.tipo_precio).toBe('cotizar');
    expect(cotizar.precio_usd_centavos).toBeNull();
    expect(cotizar.unidad).toBeNull();
  });

  it('un servicio fijo sin precio positivo o sin unidad es DATOS_INVALIDOS', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const categoria = await categoriaServicioDePrueba();
    const base = {
      p_usuario: dueno.id,
      p_servicio: null,
      p_categoria: categoria,
      p_titulo: 'Corte de prueba',
      p_descripcion: '',
      p_zona: '',
      p_tipo_precio: 'fijo',
      p_activo: true,
      p_fotos: [],
    };

    const cero = await servicio().rpc('guardar_servicio', { ...base, p_precio: 0, p_unidad: 'por corte' });
    expect(codigoDe(cero.error)).toBe('DATOS_INVALIDOS');

    const sinPrecio = await servicio().rpc('guardar_servicio', { ...base, p_precio: null, p_unidad: 'por corte' });
    expect(codigoDe(sinPrecio.error)).toBe('DATOS_INVALIDOS');

    const sinUnidad = await servicio().rpc('guardar_servicio', { ...base, p_precio: 500, p_unidad: '  ' });
    expect(codigoDe(sinUnidad.error)).toBe('DATOS_INVALIDOS');
  });

  it('título, descripción y zona fuera de largo son DATOS_INVALIDOS', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const base = {
      p_usuario: dueno.id,
      p_servicio: null,
      p_categoria: await categoriaServicioDePrueba(),
      p_titulo: 'Corte de prueba',
      p_descripcion: '',
      p_zona: '',
      p_tipo_precio: 'cotizar',
      p_precio: null,
      p_unidad: null,
      p_activo: true,
      p_fotos: [],
    };

    const titulo = await servicio().rpc('guardar_servicio', { ...base, p_titulo: 'a' });
    expect(codigoDe(titulo.error)).toBe('DATOS_INVALIDOS');

    const descripcion = await servicio().rpc('guardar_servicio', { ...base, p_descripcion: 'x'.repeat(601) });
    expect(codigoDe(descripcion.error)).toBe('DATOS_INVALIDOS');

    const zona = await servicio().rpc('guardar_servicio', { ...base, p_zona: 'x'.repeat(161) });
    expect(codigoDe(zona.error)).toBe('DATOS_INVALIDOS');
  });

  it('una categoría que no existe es DATOS_INVALIDOS', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const r = await servicio().rpc('guardar_servicio', {
      p_usuario: dueno.id,
      p_servicio: null,
      p_categoria: 999999,
      p_titulo: 'Corte de prueba',
      p_descripcion: '',
      p_zona: '',
      p_tipo_precio: 'cotizar',
      p_precio: null,
      p_unidad: null,
      p_activo: true,
      p_fotos: [],
    });
    expect(codigoDe(r.error)).toBe('DATOS_INVALIDOS');
  });

  it('un negocio pendiente no publica servicios y quien no tiene negocio tampoco', async () => {
    const pendiente = await usuarioNuevo();
    await negocio(pendiente, { aprobar: false });
    await expect(servicioDe(pendiente)).rejects.toMatchObject({ message: expect.stringMatching(/^NO_PERMITIDO:/) });

    const sinNegocio = await usuarioNuevo();
    await expect(servicioDe(sinNegocio)).rejects.toMatchObject({ message: expect.stringMatching(/^NO_PERMITIDO:/) });
  });

  it('editar un servicio ajeno responde NO_ENCONTRADA, como si no existiera', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const ajeno = await servicioDe(dueno);

    const intruso = await usuarioNuevo();
    await negocio(intruso);
    const r = await servicio().rpc('guardar_servicio', {
      p_usuario: intruso.id,
      p_servicio: ajeno.id,
      p_categoria: await categoriaServicioDePrueba(),
      p_titulo: 'Título robado',
      p_descripcion: '',
      p_zona: '',
      p_tipo_precio: 'fijo',
      p_precio: 1,
      p_unidad: 'por corte',
      p_activo: true,
      p_fotos: [],
    });
    expect(codigoDe(r.error)).toBe('NO_ENCONTRADA');
    expect((await fila('servicios', ajeno.id)).titulo).toBe(ajeno.titulo);
  });

  it('el dueño cambia precio y pausa; si un admin lo oculto, el dueño no lo desoculta', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const original = await servicioDe(dueno, { precio: 500 });

    const { data, error } = await servicio().rpc('guardar_servicio', {
      p_usuario: dueno.id,
      p_servicio: original.id,
      p_categoria: await categoriaServicioDePrueba(),
      p_titulo: original.titulo,
      p_descripcion: 'Nueva descripción',
      p_zona: 'Bálsamo, La Libertad',
      p_tipo_precio: 'fijo',
      p_precio: 900,
      p_unidad: 'por corte',
      p_activo: false,
      p_fotos: [],
    });
    expect(error).toBeNull();
    expect(data.precio_usd_centavos).toBe(900);
    expect(data.activo).toBe(false);

    await ocultarServicio(original.id, true);
    const { data: editado } = await servicio().rpc('guardar_servicio', {
      p_usuario: dueno.id,
      p_servicio: original.id,
      p_categoria: await categoriaServicioDePrueba(),
      p_titulo: original.titulo,
      p_descripcion: '',
      p_zona: '',
      p_tipo_precio: 'fijo',
      p_precio: 900,
      p_unidad: 'por corte',
      p_activo: true,
      p_fotos: [],
    });
    expect(editado.oculto).toBe(true);
  });
});

describe('ocultar_servicio', () => {
  it('solo el administrador oculta y muestra, y cada cambio queda en la auditoría', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const svc = await servicioDe(dueno);

    const r = await servicio().rpc('ocultar_servicio', { p_servicio: svc.id, p_actor: dueno.id, p_oculto: true });
    expect(codigoDe(r.error)).toBe('NO_PERMITIDO');

    const admin = await administrador();
    const oculto = await ocultarServicio(svc.id, true);
    expect(oculto.oculto).toBe(true);
    const mostrado = await servicio().rpc('ocultar_servicio', { p_servicio: svc.id, p_actor: admin.id, p_oculto: false });
    expect(mostrado.data.oculto).toBe(false);

    const { data: auditoria } = await servicio()
      .from('auditoria')
      .select('accion')
      .eq('entidad', 'servicio')
      .eq('entidad_id', svc.id)
      .order('id');
    expect(auditoria!.map((a) => a.accion)).toEqual(['servicio.ocultado', 'servicio.mostrado']);
  });
});

describe('quién ve el catálogo', () => {
  it('anónimos y otros usuarios ven los servicios visibles; el dueño ve también los ocultos y pausados', async () => {
    const dueno = await usuarioNuevo();
    await negocio(dueno);
    const visible = await servicioDe(dueno, { titulo: `Visible ${sufijo()}` });
    const oculto = await servicioDe(dueno, { titulo: `Oculto ${sufijo()}` });
    await ocultarServicio(oculto.id, true);
    const pausado = await servicioDe(dueno, { titulo: `Pausado ${sufijo()}`, activo: false });

    const suspendido = await usuarioNuevo();
    const tiendaSuspendida = await negocio(suspendido);
    const deSuspendido = await servicioDe(suspendido, { titulo: `Suspendido ${sufijo()}` });
    await suspenderNegocio(tiendaSuspendida);

    const ids = [visible.id, oculto.id, pausado.id, deSuspendido.id];

    const anon = await anonimo().from('servicios').select('id').in('id', ids);
    expect(anon.error).toBeNull();
    expect(anon.data!.map((r) => r.id)).toEqual([visible.id]);

    const otro = await sesionDe(await usuarioNuevo());
    const ajeno = await otro.from('servicios').select('id').in('id', ids);
    expect(ajeno.error).toBeNull();
    expect(ajeno.data!.map((r) => r.id)).toEqual([visible.id]);

    const sesionDueno = await sesionDe(dueno);
    const propios = await sesionDueno.from('servicios').select('id').in('id', ids);
    expect(propios.error).toBeNull();
    expect(propios.data!.map((r) => r.id).sort()).toEqual([visible.id, oculto.id, pausado.id].sort());
  });

  it('las categorías de servicio las lee cualquiera', async () => {
    await categoriaServicioDePrueba();
    const r = await anonimo().from('categorias_servicio').select('nombre').order('orden');
    expect(r.error).toBeNull();
    expect(r.data!.map((c) => c.nombre)).toContain('Hogar y reparaciones');
  });
});
