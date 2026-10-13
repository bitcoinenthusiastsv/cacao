import type { Metadata } from 'next';
import { Suspense } from 'react';

import { Boton } from '@/componentes/Boton';
import { Chip } from '@/componentes/Chip';
import { Puertas } from '@/componentes/Puertas';
import { Vacio } from '@/componentes/Vacio';
import { cotizacionSegura } from '@/servidor/catalogo';
import { tablon } from '@/servidor/necesidades';
import { categoriasServicio } from '@/servidor/servicios';

import { TarjetaNecesidad } from './_componentes/TarjetaNecesidad';
import estilos from './estilos.module.css';

export const metadata: Metadata = { title: 'Necesito' };

// The heading and the call to action are static; the category chips and the list read data per request.
export default function PaginaNecesito(props: PageProps<'/necesito'>) {
  return (
    <>
      <Puertas actual="necesito" />

      <section className={estilos.cabecera}>
        <h1>Necesito</h1>
        <p>Publicá lo que buscás y recibí ofertas de gente que trabaja cerca.</p>
        <div>
          <Boton href="/necesito/nuevo">Publicar lo que necesito</Boton>
        </div>
      </section>

      <Suspense fallback={<p role="status">Cargando las necesidades…</p>}>
        <Tablero searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Tablero({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { categoria } = await searchParams;
  // Only digits count as a category; anything else shows the whole board.
  const categoriaId = categoria && /^\d{1,5}$/.test(categoria) ? Number(categoria) : undefined;

  const [categorias, necesidades, cotizacion] = await Promise.all([
    categoriasServicio(),
    tablon({ categoriaId }),
    cotizacionSegura(),
  ]);

  return (
    <>
      <nav aria-label="Categorías" className={estilos.filtros}>
        <div className="chips">
          <Chip href="/necesito" activo={categoriaId === undefined}>
            Todas
          </Chip>
          {categorias.map((c) => (
            <Chip key={c.id} href={`/necesito?categoria=${c.id}`} activo={categoriaId === c.id}>
              {c.nombre}
            </Chip>
          ))}
        </div>
      </nav>

      {necesidades.length === 0 ? (
        <Vacio
          texto={
            categoriaId === undefined
              ? 'Todavía no hay necesidades abiertas.'
              : 'No hay necesidades abiertas en esta categoría.'
          }
          accion={{ href: '/necesito/nuevo', etiqueta: 'Publicar lo que necesito' }}
        />
      ) : (
        <ul className={estilos.lista} aria-label="Necesidades abiertas">
          {necesidades.map((necesidad) => (
            <li key={necesidad.id}>
              <TarjetaNecesidad necesidad={necesidad} cotizacion={cotizacion} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
