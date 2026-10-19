import { describe, expect, it } from 'vitest';
import { anonimo, servicio, sesionDe, sufijo, telefonoComoLoEscribe, usuarioNuevo } from './ayuda';

// Sign-in with Clerk. vincular_clerk links a Clerk user to its usuarios row, creating the row when none
// matches; usuario_actual finds that row from the session JWT's sub claim. The sessions are signed with
// the local JWT secret, as the browser sends them.

// A phone from the 5036 range, so it never matches a row another test creates (5035 range) or a seed.
function telefonoLibre(): string {
  return `5036${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
}

// A Clerk id no other row has.
function clerkIdLibre(): string {
  return `user_test_${sufijo()}${sufijo()}`;
}

// A row created before Clerk: no clerk_id yet, so vincular_clerk may link it.
async function filaPrevia(telefono: string): Promise<string> {
  const { data, error } = await servicio().from('usuarios').insert({ telefono, nombre: 'Previa' }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

async function vincular(clerkId: string, telefono: string, correo = '', nombre = '') {
  return servicio().rpc('vincular_clerk', { p_clerk_id: clerkId, p_telefono: telefono, p_correo: correo, p_nombre: nombre });
}

describe('vincular_clerk', () => {
  it('enlaza una fila existente por teléfono, aunque llegue con el signo + y espacios', async () => {
    const telefono = telefonoLibre();
    const previa = await filaPrevia(telefono);
    const clerkId = clerkIdLibre();

    const { data, error } = await vincular(clerkId, telefonoComoLoEscribe(telefono));

    expect(error).toBeNull();
    expect(data).toBe(previa);
    const { data: fila } = await servicio().from('usuarios').select('clerk_id').eq('id', previa).single();
    expect(fila?.clerk_id).toBe(clerkId);
  });

  it('enlaza una fila existente por correo, sin distinguir mayúsculas', async () => {
    const correo = `prueba-${sufijo()}@ejemplo.sv`;
    const previa = await filaPrevia(correo);
    const clerkId = clerkIdLibre();

    const { data, error } = await vincular(clerkId, '', correo.toUpperCase());

    expect(error).toBeNull();
    expect(data).toBe(previa);
    const { data: fila } = await servicio().from('usuarios').select('clerk_id').eq('id', previa).single();
    expect(fila?.clerk_id).toBe(clerkId);
  });

  it('crea una fila nueva cuando ninguna coincide', async () => {
    const telefono = telefonoLibre();
    const clerkId = clerkIdLibre();

    const { data, error } = await vincular(clerkId, telefono, '', 'Nueva');

    expect(error).toBeNull();
    expect(typeof data).toBe('string');
    const { data: fila } = await servicio().from('usuarios').select('clerk_id, telefono, nombre').eq('id', data).single();
    expect(fila).toEqual({ clerk_id: clerkId, telefono, nombre: 'Nueva' });
  });

  it('es idempotente: el mismo clerk id devuelve la misma fila y no crea otra', async () => {
    const clerkId = clerkIdLibre();
    const primera = await vincular(clerkId, telefonoLibre(), '', 'Repetida');
    const segunda = await vincular(clerkId, telefonoLibre(), '', 'Repetida');

    expect(primera.error).toBeNull();
    expect(segunda.error).toBeNull();
    expect(segunda.data).toBe(primera.data);
    const { count } = await servicio().from('usuarios').select('id', { count: 'exact', head: true }).eq('clerk_id', clerkId);
    expect(count).toBe(1);
  });
});

describe('usuario_actual', () => {
  it('devuelve la fila cuyo clerk_id es el sub del JWT propio', async () => {
    const usuario = await usuarioNuevo();
    const sesion = await sesionDe(usuario);

    const { data, error } = await sesion.rpc('usuario_actual');

    expect(error).toBeNull();
    expect(data).toBe(usuario.id);
  });

  it('sin sesión devuelve null', async () => {
    const { data, error } = await anonimo().rpc('usuario_actual');

    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

describe('usuarios con sesión', () => {
  it('un usuario autenticado no lee las filas de otros usuarios, y sí la suya', async () => {
    const yo = await usuarioNuevo();
    const otra = await usuarioNuevo();
    const sesion = await sesionDe(yo);

    const { data: ajena, error: errorAjena } = await sesion.from('usuarios').select('id').eq('id', otra.id);
    const { data: propia, error: errorPropia } = await sesion.from('usuarios').select('id').eq('id', yo.id);

    expect(errorAjena).toBeNull();
    expect(ajena).toEqual([]);
    expect(errorPropia).toBeNull();
    expect(propia).toEqual([{ id: yo.id }]);
  });

  it('un anónimo no puede ejecutar vincular_clerk', async () => {
    const clerkId = clerkIdLibre();

    const { error } = await anonimo().rpc('vincular_clerk', {
      p_clerk_id: clerkId,
      p_telefono: telefonoLibre(),
      p_correo: '',
      p_nombre: 'Intrusa',
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
    const { count } = await servicio().from('usuarios').select('id', { count: 'exact', head: true }).eq('clerk_id', clerkId);
    expect(count).toBe(0);
  });
});
