'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import type { DatosNegocio } from '@/servidor/cuentas';

import { actualizar, solicitar, type EstadoNegocio } from './acciones';
import estilos from './estilos.module.css';

// Shared by the application ("solicitar") and the edit form ("editar") for a shop.
export function FormularioNegocio({
  modo,
  valores,
}: {
  modo: 'solicitar' | 'editar';
  valores: DatosNegocio;
}) {
  const [estado, accion] = useActionState<EstadoNegocio, FormData>(
    modo === 'solicitar' ? solicitar : actualizar,
    { valores },
  );
  const v = estado.valores;

  return (
    <form action={accion} className={estilos.formulario} aria-labelledby="titulo-formulario">
      <h2 id="titulo-formulario">{modo === 'solicitar' ? 'Datos de tu negocio' : 'Datos del negocio'}</h2>

      <div className={estilos.grupo}>
        <label htmlFor="nombre" className="campo-etiqueta">
          Nombre del negocio
        </label>
        <input
          id="nombre"
          name="nombre"
          className="campo"
          type="text"
          maxLength={80}
          required
          defaultValue={v.nombre}
          aria-describedby="ayuda-nombre"
        />
        <p id="ayuda-nombre" className={estilos.ayuda}>
          Entre 2 y 80 caracteres. Así aparece en tu página y en el catálogo.
        </p>
      </div>

      <div className={estilos.grupo}>
        <label htmlFor="descripcion" className="campo-etiqueta">
          Descripción
        </label>
        <textarea
          id="descripcion"
          name="descripcion"
          className={`campo ${estilos.area}`}
          maxLength={600}
          rows={4}
          defaultValue={v.descripcion}
          aria-describedby="ayuda-descripcion"
        />
        <p id="ayuda-descripcion" className={estilos.ayuda}>
          Contá qué producís y cómo. Hasta 600 caracteres.
        </p>
      </div>

      <div className={estilos.grupo}>
        <label htmlFor="ubicacion" className="campo-etiqueta">
          Ubicación
        </label>
        <input
          id="ubicacion"
          name="ubicacion"
          className="campo"
          type="text"
          maxLength={160}
          defaultValue={v.ubicacion}
          aria-describedby="ayuda-ubicacion"
        />
        <p id="ayuda-ubicacion" className={estilos.ayuda}>
          Municipio o zona de donde viene tu producto. Hasta 160 caracteres.
        </p>
      </div>

      <div className={estilos.grupo}>
        <label htmlFor="lightningAddress" className="campo-etiqueta">
          Lightning Address
        </label>
        <input
          id="lightningAddress"
          name="lightningAddress"
          className="campo"
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          maxLength={254}
          required
          defaultValue={v.lightningAddress}
          aria-describedby="ayuda-lightning aviso-lightning"
        />
        <p id="ayuda-lightning" className={estilos.ayuda}>
          Es la dirección donde llegan los pagos de tus compradores, por ejemplo usuario@billetera.com.
        </p>
        <p id="aviso-lightning" className={estilos.notaPagos}>
          Los pagos llegan directo a tu billetera. CacaoMarket nunca guarda tu dinero y no pedimos llaves
          ni frases semilla.
        </p>
      </div>

      {estado.error && (
        <div role="alert" className={estilos.error}>
          {estado.error}
        </div>
      )}

      <p role="status" aria-live="polite" className="aviso">
        {estado.mensaje ?? ''}
      </p>

      <BotonGuardar modo={modo} />
    </form>
  );
}

function BotonGuardar({ modo }: { modo: 'solicitar' | 'editar' }) {
  const { pending } = useFormStatus();
  const etiqueta = modo === 'solicitar' ? 'Enviar solicitud' : 'Guardar cambios';
  const enCurso = modo === 'solicitar' ? 'Enviando…' : 'Guardando…';
  return (
    <button type="submit" className="boton" disabled={pending}>
      {pending ? enCurso : etiqueta}
    </button>
  );
}
