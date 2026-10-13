'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { entrar, type EstadoEntrar } from './acciones';
import type { Metodo } from './configuracion';
import estilos from './estilos.module.css';

export function FormularioEntrar({ metodo, volver }: { metodo: Metodo; volver: string }) {
  const estadoInicial: EstadoEntrar = { metodo, paso: 'contacto', contacto: '', codigo: '' };
  const [estado, accion] = useActionState(entrar, estadoInicial);
  const campoContacto = useRef<HTMLInputElement>(null);
  const campoCodigo = useRef<HTMLInputElement>(null);

  // Move focus to the field that needs the visitor: the one with the error, or the new step.
  useEffect(() => {
    if (estado.error?.campo === 'codigo' || (!estado.error && estado.paso === 'codigo')) {
      campoCodigo.current?.focus();
    } else {
      campoContacto.current?.focus();
    }
  }, [estado]);

  const errorContacto = estado.error?.campo === 'contacto' ? estado.error.mensaje : null;
  const errorCodigo = estado.error?.campo === 'codigo' ? estado.error.mensaje : null;
  const esCorreo = metodo === 'correo';

  return (
    <div className={estilos.bloque}>
      {estado.paso === 'contacto' ? (
        <form action={accion} className={estilos.formulario}>
          <input type="hidden" name="volver" value={volver} />
          <input type="hidden" name="metodo" value={metodo} />
          <input type="hidden" name="intencion" value="enviar" />

          {esCorreo ? (
            <div className={estilos.grupo}>
              <label htmlFor="correo" className="campo-etiqueta">
                Correo
              </label>
              <input
                ref={campoContacto}
                id="correo"
                name="contacto"
                className="campo"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                defaultValue={estado.contacto}
                aria-describedby={errorContacto ? 'error-contacto' : 'ayuda-correo'}
                aria-invalid={errorContacto ? true : undefined}
              />
              <p id="ayuda-correo" className={estilos.ayuda}>
                Te mandamos un correo para entrar a esta dirección.
              </p>
            </div>
          ) : (
            <div className={estilos.grupo}>
              <label htmlFor="telefono" className="campo-etiqueta">
                Número de celular
              </label>
              <div className={estilos.telefono}>
                <span className={estilos.prefijo}>+503</span>
                <input
                  ref={campoContacto}
                  id="telefono"
                  name="contacto"
                  className="campo"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  defaultValue={estado.contacto}
                  aria-describedby={errorContacto ? 'error-contacto' : 'ayuda-telefono'}
                  aria-invalid={errorContacto ? true : undefined}
                />
              </div>
              <p id="ayuda-telefono" className={estilos.ayuda}>
                Son 8 números. Podés escribirlos con espacios o guiones.
              </p>
            </div>
          )}

          {errorContacto && (
            <div id="error-contacto" role="alert" className={estilos.error}>
              {errorContacto}
            </div>
          )}

          {!esCorreo && (
            <p className={estilos.demo}>
              Modo demo: para probar usá un número de 7000 0001 a 7000 0009. No se manda SMS.
            </p>
          )}

          <BotonEnvio intencion="enviar" etiqueta="Enviar código" etiquetaEnvio="Enviando…" />
        </form>
      ) : (
        <form action={accion} className={estilos.formulario}>
          <input type="hidden" name="volver" value={volver} />
          <input type="hidden" name="metodo" value={metodo} />
          <input type="hidden" name="contacto" value={estado.contacto} />

          {esCorreo && (
            <p className={estilos.ayuda}>
              Te mandamos un correo a {mascaraCorreo(estado.contacto)}. Escribí el código de seis números, o abrí el
              enlace del correo en este mismo navegador.
            </p>
          )}

          <div className={estilos.grupo}>
            <label htmlFor="codigo" className="campo-etiqueta">
              Código de seis números
            </label>
            <input
              ref={campoCodigo}
              id="codigo"
              name="codigo"
              className="campo"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              defaultValue={estado.codigo}
              aria-describedby={errorCodigo ? 'error-codigo' : 'ayuda-codigo'}
              aria-invalid={errorCodigo ? true : undefined}
            />
            <p id="ayuda-codigo" className={estilos.ayuda}>
              {esCorreo ? 'Vence en una hora.' : `Enviado al +503 ${mascara(estado.contacto)}.`}
            </p>
          </div>

          {errorCodigo && (
            <div id="error-codigo" role="alert" className={estilos.error}>
              {errorCodigo}
            </div>
          )}

          {!esCorreo && <p className={estilos.demo}>Modo demo: usá el código 123456. No se manda SMS.</p>}

          <div className={estilos.acciones}>
            <BotonEnvio intencion="verificar" etiqueta="Entrar" etiquetaEnvio="Verificando…" />
            <BotonEnvio
              intencion="reenviar"
              etiqueta="Reenviar código"
              etiquetaEnvio="Reenviando…"
              secundario
              sinValidar
            />
            <BotonEnvio
              intencion="cambiar"
              etiqueta={esCorreo ? 'Cambiar correo' : 'Cambiar número'}
              etiquetaEnvio="Cambiando…"
              secundario
              sinValidar
            />
          </div>
        </form>
      )}

      <p role="status" aria-live="polite" className="aviso">{estado.aviso ?? ''}</p>
    </div>
  );
}

// Each button sends its own intent. While the form is pending, the button that was pressed
// shows its "…" label and the others stay disabled.
function BotonEnvio({
  intencion,
  etiqueta,
  etiquetaEnvio,
  secundario = false,
  sinValidar = false,
}: {
  intencion: 'enviar' | 'verificar' | 'reenviar' | 'cambiar';
  etiqueta: string;
  etiquetaEnvio: string;
  secundario?: boolean;
  sinValidar?: boolean;
}) {
  const { pending, data } = useFormStatus();
  const esEste = pending && data?.get('intencion') === intencion;
  const clase = secundario ? 'boton boton--secundario' : 'boton';

  return (
    <button
      type="submit"
      name="intencion"
      value={intencion}
      formNoValidate={sinValidar}
      className={clase}
      disabled={pending}
    >
      {esEste ? etiquetaEnvio : etiqueta}
    </button>
  );
}

// Shows the last two digits only, as "•••• ••07", so the number is not read out in full.
function mascara(telefono: string): string {
  const digitos = telefono.replace(/[\s-]/g, '');
  return `•••• ••${digitos.slice(-2)}`;
}

// Shows the first two letters of the address, as "jo•••@gmail.com".
function mascaraCorreo(correo: string): string {
  const limpio = correo.trim().toLowerCase();
  const arroba = limpio.indexOf('@');
  if (arroba < 1) return '';
  return `${limpio.slice(0, Math.min(2, arroba))}•••${limpio.slice(arroba)}`;
}
