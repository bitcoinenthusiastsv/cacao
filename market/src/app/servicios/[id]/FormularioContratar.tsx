'use client';

import {
  type FormEvent,
  startTransition,
  useActionState,
  useState,
  useSyncExternalStore,
} from 'react';

import { LIMITES } from '@/lib/servicios';

import { contratarAccion } from './acciones';
import estilos from './estilos.module.css';

// False on the server and during hydration, true once the page runs in the browser.
function suscribirNada(): () => void {
  return () => {};
}

function useMontado(): boolean {
  return useSyncExternalStore(suscribirNada, () => true, () => false);
}

// The clave is made once, when this part mounts in the browser. A random value rendered on the
// server would not match the browser, so this part is not rendered there at all.
function ClaveDelFormulario() {
  const [clave] = useState(() => crypto.randomUUID());
  return <input type="hidden" name="clave" value={clave} />;
}

// The fixed-price hire. A double tap sends the same clave, so it creates one job.
export function FormularioContratar({ servicioId }: { servicioId: string }) {
  const [estado, accion, pendiente] = useActionState(contratarAccion, { error: null });
  const [nota, setNota] = useState('');
  const montado = useMontado();

  // Sent through the action directly, not as a form action: React would reset the form after the
  // action and the typed note would be lost when the hire fails.
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!montado || pendiente) return;
    const datos = new FormData(evento.currentTarget);
    startTransition(() => accion(datos));
  }

  return (
    <form className={estilos.formulario} onSubmit={enviar} noValidate>
      <input type="hidden" name="servicioId" value={servicioId} />
      {montado && <ClaveDelFormulario />}

      <div className={estilos.grupo}>
        <label htmlFor="nota-contratar" className="campo-etiqueta">
          Contale cuándo y dónde
        </label>
        <textarea
          id="nota-contratar"
          name="nota"
          className={estilos.area}
          rows={3}
          maxLength={LIMITES.nota.maximo}
          value={nota}
          aria-describedby="nota-contratar-ayuda"
          onChange={(e) => setNota(e.target.value)}
        />
        <p id="nota-contratar-ayuda" className={estilos.ayuda}>
          Opcional. Hasta {LIMITES.nota.maximo} caracteres. {nota.length}/{LIMITES.nota.maximo}
        </p>
      </div>

      {estado.error && (
        <p role="alert" className={estilos.error}>
          {estado.error}
        </p>
      )}

      <button type="submit" className="boton" disabled={!montado || pendiente}>
        {pendiente ? 'Contratando…' : 'Contratar'}
      </button>

      <p className={estilos.garantia}>
        Pagás cuando el trabajo esté hecho. CacaoMarket no guarda tu dinero.
      </p>
    </form>
  );
}
