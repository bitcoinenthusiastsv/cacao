'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { alternarAbierto, type EstadoAbierto } from './acciones';
import estilos from './estilos.module.css';

// Big switch for taking orders. A form posts the value the switch will take.
export function InterruptorAbierto({ abierto }: { abierto: boolean }) {
  const [estado, accion] = useActionState<EstadoAbierto, FormData>(alternarAbierto, { abierto });
  const estaAbierto = estado.abierto;

  return (
    <section className={estilos.bloque} aria-labelledby="titulo-pedidos">
      <h2 id="titulo-pedidos">Pedidos</h2>
      <form action={accion}>
        <input type="hidden" name="abierto" value={String(!estaAbierto)} />
        <BotonInterruptor estaAbierto={estaAbierto} />
      </form>
      <p className={estilos.ayuda}>
        {estaAbierto
          ? 'Los compradores pueden pedir tus productos.'
          : 'Nadie puede pedir por ahora. Tus productos siguen visibles.'}
      </p>
      {estado.error && (
        <div role="alert" className={estilos.error}>
          {estado.error}
        </div>
      )}
    </section>
  );
}

function BotonInterruptor({ estaAbierto }: { estaAbierto: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      role="switch"
      aria-checked={estaAbierto}
      className={`${estilos.interruptor} ${estaAbierto ? estilos.interruptorAbierto : estilos.interruptorCerrado}`}
      disabled={pending}
    >
      <span className={estilos.marcaInterruptor} aria-hidden="true" />
      {pending ? 'Guardando…' : estaAbierto ? 'Abierto para pedidos' : 'Cerrado por ahora'}
    </button>
  );
}
