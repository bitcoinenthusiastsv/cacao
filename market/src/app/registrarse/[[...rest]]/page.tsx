import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { destinoSeguro, rutaContinuar, rutaEntrar } from '@/servidor/cuentas';
import { sesionActual } from '@/servidor/sesion';

export const metadata: Metadata = {
  title: 'Registrarse',
};

// The sign-up form is Clerk's. A new account lands on /continuar, which sends it to /cuenta to set a name.
export default function PaginaRegistrarse(props: PageProps<'/registrarse/[[...rest]]'>) {
  return (
    <div className="entrar">
      <Suspense fallback={<p role="status">Cargando…</p>}>
        <RegistroConDestino busqueda={props.searchParams} />
      </Suspense>
    </div>
  );
}

async function RegistroConDestino({ busqueda }: { busqueda: PageProps<'/registrarse/[[...rest]]'>['searchParams'] }) {
  await connection();
  const params = await busqueda;
  const volver = destinoSeguro(params.volver);

  // Already signed in: /entrar decides where to go.
  const sesion = await sesionActual();
  if (sesion) redirect(rutaEntrar(volver));

  return (
    <>
      <section className="encabezado">
        <h1>Creá tu cuenta</h1>
        <p>Usá tu celular o tu correo para registrarte.</p>
      </section>

      <SignUp
        routing="path"
        path="/registrarse"
        signInUrl={rutaEntrar(volver)}
        forceRedirectUrl={rutaContinuar(volver)}
      />
    </>
  );
}
