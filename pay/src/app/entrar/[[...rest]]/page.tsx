import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { destinoSeguro, rutaAcceso, rutaCuenta } from '@/servidor/cuentas';
import { sesionActual } from '@/servidor/sesion';

import estilos from '../estilos.module.css';

export const metadata: Metadata = {
  title: 'Entrar',
};

// The sign-in form is Clerk's. The destination comes from the URL, so the form streams in behind a boundary.
export default function PaginaEntrar(props: PageProps<'/entrar/[[...rest]]'>) {
  return (
    <div className="entrar">
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <EntradaConDestino busqueda={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function EntradaConDestino({ busqueda }: { busqueda: PageProps<'/entrar/[[...rest]]'>['searchParams'] }) {
  await connection();
  const params = await busqueda;
  const volver = destinoSeguro(params.volver);

  // Already signed in: skip the form. A new account without a name sets it first.
  const sesion = await sesionActual();
  if (sesion) {
    redirect(sesion.usuario.nombre.trim() ? volver : rutaCuenta(volver));
  }

  return (
    <>
      <section className="encabezado">
        <h1>Entrá con tu celular</h1>
        <p>Te mandamos un código para entrar a tu cuenta.</p>
      </section>

      <div className={estilos.bloque}>
        {/* After sign-in this page runs again, so the name check and the destination happen here once. */}
        <SignIn
          forceRedirectUrl={rutaAcceso('/entrar', volver)}
          signUpUrl={rutaAcceso('/registrarse', volver)}
        />
      </div>
    </>
  );
}
