'use client';

import { useState } from 'react';

import estilos from '../estilos.module.css';

export const MAXIMO_FOTOS = 4;
// Same limit as the server; checked here only to fail fast before the upload.
const TAMANO_MAXIMO = 3 * 1024 * 1024;

type Props = {
  fotos: string[];
  onAgregar: (url: string) => void;
  onQuitar: (indice: number) => void;
  /** +1 when an upload starts, -1 when it ends, so the form can wait for it. */
  onProgreso: (cambio: 1 | -1) => void;
};

// Photo picker: one file at a time, uploaded on pick. The first photo is the cover.
export function FotosProducto({ fotos, onAgregar, onQuitar, onProgreso }: Props) {
  const [subiendo, setSubiendo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lleno = fotos.length + subiendo >= MAXIMO_FOTOS;

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

    setSubiendo((n) => n + 1);
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
      onAgregar(datos.url);
    } catch {
      setError('No pudimos subir la foto. Revisá tu conexión y probá de nuevo.');
    } finally {
      setSubiendo((n) => n - 1);
      onProgreso(-1);
    }
  }

  return (
    <fieldset className={estilos.grupo}>
      <legend className="campo-etiqueta">
        Fotos ({fotos.length} de {MAXIMO_FOTOS})
      </legend>

      {fotos.length > 0 && (
        <ul className={estilos.fotos} aria-label="Fotos del producto">
          {fotos.map((url, i) => (
            <li key={`${i}-${url}`} className={estilos.foto}>
              <img className={estilos.fotoImagen} src={url} alt={`Foto ${i + 1} de ${fotos.length}`} />
              {i === 0 && <span className={estilos.fotoPortada}>Portada</span>}
              <button type="button" className={estilos.fotoQuitar} onClick={() => onQuitar(i)}>
                Quitar foto {i + 1}
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="campo-etiqueta" htmlFor="foto-archivo">
        Agregar una foto
      </label>
      <input
        id="foto-archivo"
        className={estilos.archivo}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={alElegir}
        disabled={lleno}
        aria-describedby="foto-ayuda"
      />
      <p id="foto-ayuda" className={estilos.ayuda}>
        JPG, PNG o WebP, hasta 3 MB. La primera foto es la portada.
      </p>

      <p role="status" aria-live="polite" className={estilos.ayuda}>
        {subiendo > 0 ? 'Subiendo foto…' : ''}
      </p>
      {error && (
        <p className={estilos.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
