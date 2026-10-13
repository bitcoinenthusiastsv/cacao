import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { destinoSeguro, rutaCuenta } from '@/servidor/cuentas';
import { sesionActual } from '@/servidor/sesion';

import { demoActivo, type Metodo, metodoElegido, metodosHabilitados } from './configuracion';
import estilos from './estilos.module.css';
import { FormularioEntrar } from './FormularioEntrar';
import { PanelDemo } from './PanelDemo';

export const metadata: Metadata = {
  title: 'Entrar',
};

// The sign-in form. The destination and the chosen method come from the URL, so the form
// streams in behind a boundary.
export default function PaginaEntrar(props: PageProps<'/entrar'>) {
  return (
    <div className="entrar">
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <EntradaConDestino busqueda={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function EntradaConDestino({ busqueda }: { busqueda: PageProps<'/entrar'>['searchParams'] }) {
  await connection();
  const params = await busqueda;
  const volver = destinoSeguro(params.volver);

  // Already signed in: skip the form. A new account without a name sets it first.
  const sesion = await sesionActual();
  if (sesion) {
    redirect(sesion.usuario.nombre.trim() ? volver : rutaCuenta(volver));
  }

  const habilitados = metodosHabilitados();
  const metodo = metodoElegido(params.metodo, habilitados);
  const otro = habilitados.find((m) => m !== metodo);
  // Only this one value is shown. The text is fixed, so no query text reaches the page.
  const avisoEnlace = params.aviso === 'enlace';

  return (
    <>
      <section className="encabezado">
        <h1>{metodo === 'correo' ? 'Entrá con tu correo' : 'Entrá con tu celular'}</h1>
        <p>
          {metodo === 'correo'
            ? 'Te mandamos un correo para entrar. No hace falta contraseña.'
            : 'Te mandamos un código de seis números. No hace falta contraseña.'}
        </p>
      </section>

      {avisoEnlace && (
        <p role="alert" className={estilos.error}>
          Ese enlace ya no sirve. Pedí uno nuevo y abrilo en este mismo navegador.
        </p>
      )}

      {demoActivo() && <PanelDemo volver={volver} />}

      <FormularioEntrar metodo={metodo} volver={volver} />

      {otro && (
        <Link href={enlaceMetodo(otro, volver)} className={estilos.cambio}>
          {otro === 'correo' ? 'Entrar con correo' : 'Entrar con celular'}
        </Link>
      )}
    </>
  );
}

// Keeps the visitor's destination when switching method.
function enlaceMetodo(metodo: Metodo, volver: string): string {
  const query = new URLSearchParams({ metodo });
  if (volver !== '/') query.set('volver', volver);
  return `/entrar?${query.toString()}`;
}
