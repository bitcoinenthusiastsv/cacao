import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

import type { EstadoOrden } from '@/lib/estados';
import { asegurarCobro, estadoDePago } from '@/servidor/pagos';
import { exigirSesion } from '@/servidor/sesion';

import { PagoCliente } from './PagoCliente';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// States that still belong on this screen. Anything later means the order was paid.
const ESTADOS_DE_PAGO: EstadoOrden[] = ['creada', 'esperando_pago', 'expirada'];
// A job is payable once its work is done ('hecha'); its request is made here, when the screen opens.
const ESTADOS_DE_TRABAJO: EstadoOrden[] = ['hecha', 'esperando_pago'];

export const metadata: Metadata = { title: 'Pagar la orden' };

export default function PaginaPagar(props: PageProps<'/ordenes/[id]/pagar'>) {
  return (
    <Suspense fallback={<p role="status">Cargando el pago…</p>}>
      <PagoOrden params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function PagoOrden({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reintento?: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { reintento } = await searchParams;

  const sesion = await exigirSesion(`/ordenes/${id}/pagar`);
  const lectura = await estadoDePago(id, sesion.usuario.id);
  if (!lectura.ok) {
    // Not the buyer and not found look the same on purpose.
    if (lectura.codigo === 'NO_ENCONTRADA') notFound();
    return <p role="alert">{lectura.mensaje}</p>;
  }

  let estado = lectura.dato;
  let problema: string | null = null;
  // The order exists but its payment request failed earlier: try again on load.
  // A job's request is made here too, so its sats are fixed when the client opens the screen.
  const trabajo = estado.tipo === 'servicio';
  const pidesCobro = estado.estado === 'creada' || (trabajo && estado.estado === 'hecha');
  if (pidesCobro) {
    const cobro = await asegurarCobro(id);
    if (cobro.ok) {
      const relectura = await estadoDePago(id, sesion.usuario.id);
      // The request was made, so a read that still shows the state from before it is stale: Next
      // memoizes the identical GET that estadoDePago made before asegurarCobro (see servidor/supabase.ts).
      // Reload once; the new render reads the stored request. The flag stops a loop if that is stale too.
      if (relectura.ok && relectura.dato.estado === estado.estado && reintento !== '1') {
        redirect(`/ordenes/${id}/pagar?reintento=1`);
      }
      if (relectura.ok) estado = relectura.dato;
    } else {
      problema = cobro.mensaje;
    }
  }

  const pagable = trabajo ? ESTADOS_DE_TRABAJO.includes(estado.estado) : ESTADOS_DE_PAGO.includes(estado.estado);
  if (!pagable) redirect(`/ordenes/${id}`);

  return <PagoCliente ordenId={id} inicial={estado} errorCobro={problema} />;
}
