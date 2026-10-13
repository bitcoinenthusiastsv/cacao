'use client';

import { useState } from 'react';

import estilos from '../estilos.module.css';

// Same limit as the server; checked here only to fail fast before the upload.
const TAMANO_MAXIMO = 3 * 1024 * 1024;

type Props = {
  foto: string | null;
  onCambiar: (url: string | null) => void;
  /** +1 when an upload starts, -1 when it ends, so the form can wait for it. */
  onProgreso: (cambio: 1 | -1) => void;
};

// One optional photo for a service. Uploaded on pick through the same route the products use.
export function FotoServicio({ foto, onCambiar, onProgreso }: Props) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alElegir(evento: React.ChangeEvent<HTMLInputElement>) {
    const input = evento.currentTarget;
    const archivo = input.files?.[0];
    // Cleared so picking the same file again still fires the change event.
    input.value = '';
    if (!archivo) return;

    setError(null);
    if (archivo.size > TAMANO_MAXIMO) {
      setError('La foto pesa más de 3 MB. Probá con una más chica.');
      return;
    }

    setSubiendo(true);
    onProgreso(1);
    try {
      const cuerpo = new FormData();
      cuerpo.append('foto', archivo);
      const respuesta = await fetch('/api/fotos', { method: 'POST', body: cuerpo });
      const datos = (await respuesta.json().catch(() => null)) as {
        url?: unknown;
        mensaje?: unknown;
      } | null;

      if (!respuesta.ok || typeof datos?.url !== 'string') {
        setError(
          typeof datos?.mensaje === 'string' ? datos.mensaje : 'No pudimos subir la foto. Probá de nuevo.',
        );
        return;
      }
      onCambiar(datos.url);
    } catch {
      setError('No pudimos subir la foto. Revisá tu conexión y probá de nuevo.');
    } finally {
      setSubiendo(false);
      onProgreso(-1);
    }
  }

  return (
    <fieldset className={estilos.grupo}>
      <legend className="campo-etiqueta">Foto (opcional)</legend>

      {foto ? (
        <div className={estilos.foto}>
          <img className={estilos.fotoImagen} src={foto} alt="Foto del servicio" />
          <button type="button" className={estilos.quitarFoto} onClick={() => onCambiar(null)}>
            Quitar foto
          </button>
        </div>
      ) : (
        <>
          <label className="campo-etiqueta" htmlFor="foto-servicio">
            Agregar una foto
          </label>
          <input
            id="foto-servicio"
            className={estilos.archivo}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={alElegir}
            disabled={subiendo}
            aria-describedby="foto-servicio-ayuda"
          />
        </>
      )}

      <p id="foto-servicio-ayuda" className={estilos.ayuda}>
        JPG, PNG o WebP, hasta 3 MB. Una sola foto.
      </p>
      <p role="status" aria-live="polite" className={estilos.ayuda}>
        {subiendo ? 'Subiendo foto…' : ''}
      </p>
      {error && (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
