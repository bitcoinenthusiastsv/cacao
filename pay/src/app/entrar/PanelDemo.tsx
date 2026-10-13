'use client';

import { useState, useTransition } from 'react';

import { entrarDemo } from './acciones';
import type { PersonaDemo } from './demo';
import estilos from './estilos.module.css';

const PERSONAS: { clave: PersonaDemo; etiqueta: string }[] = [
  { clave: 'lucia', etiqueta: 'Lucía, envía dinero' },
  { clave: 'rosa', etiqueta: 'Rosa, recibe dinero' },
  { clave: 'ana', etiqueta: 'Ana, administradora' },
];

// One tap signs in as a seeded test person. Shown only when NEXT_PUBLIC_DEMO is 1.
export function PanelDemo({ volver }: { volver: string }) {
  const [pendiente, empezar] = useTransition();
  const [quien, setQuien] = useState<PersonaDemo | null>(null);
  const [error, setError] = useState<string | null>(null);

  function entrar(persona: PersonaDemo) {
    setError(null);
    setQuien(persona);
    empezar(async () => {
      // On success the action redirects, so this only returns on a refusal.
      const resultado = await entrarDemo(persona, volver);
      if (!resultado.ok) {
        setError(resultado.mensaje);
        setQuien(null);
      }
    });
  }

  return (
    <section className={estilos.panelDemo} aria-labelledby="titulo-demo">
      <h2 id="titulo-demo" className={estilos.tituloDemo}>
        Probar con una cuenta de demo
      </h2>
      <div className={estilos.acciones}>
        {PERSONAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            className="boton boton--secundario"
            disabled={pendiente}
            onClick={() => entrar(p.clave)}
          >
            {pendiente && quien === p.clave ? 'Entrando…' : p.etiqueta}
          </button>
        ))}
      </div>
      <p className={estilos.ayudaDemo}>Son cuentas de muestra con datos de prueba. Cualquiera puede usarlas.</p>
      {error && (
        <p role="alert" className={estilos.error}>
          {error}
        </p>
      )}
    </section>
  );
}
