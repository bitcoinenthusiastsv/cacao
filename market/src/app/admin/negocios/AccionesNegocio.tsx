'use client';

import { useState } from 'react';

import { BotonEnvio } from '../BotonEnvio';
import estilos from '../estilos.module.css';
import type { EstadoNegocio } from '../etiquetas';

// Approve (pending or suspended) and suspend (approved, after a confirm step).
// The result message lives in ListaNegocios, which keeps it across the regroup.
export function AccionesNegocio({
  negocioId,
  nombre,
  estado,
  accion,
}: {
  negocioId: string;
  nombre: string;
  estado: EstadoNegocio;
  accion: (datos: FormData) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className={estilos.formulario}>
      {estado !== 'aprobado' && (
        <form action={accion}>
          <input type="hidden" name="negocio" value={negocioId} />
          <input type="hidden" name="estado" value="aprobado" />
          <BotonEnvio pendiente="Aprobando…">Aprobar</BotonEnvio>
        </form>
      )}

      {estado === 'aprobado' && !confirmando && (
        <div className={estilos.acciones}>
          <button type="button" className="boton boton--secundario" onClick={() => setConfirmando(true)}>
            Suspender
          </button>
        </div>
      )}

      {estado === 'aprobado' && confirmando && (
        <form action={accion} className={estilos.confirmacion}>
          <input type="hidden" name="negocio" value={negocioId} />
          <input type="hidden" name="estado" value="suspendido" />
          <p>
            Confirmá la suspensión de {nombre}. Sus productos dejan de mostrarse y no recibe pedidos
            nuevos.
          </p>
          <div className={estilos.acciones}>
            <BotonEnvio pendiente="Suspendiendo…">Confirmar suspensión</BotonEnvio>
            <button type="button" className="boton boton--secundario" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
