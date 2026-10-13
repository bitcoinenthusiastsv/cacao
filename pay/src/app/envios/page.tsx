import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';

import { Boton } from '@/componentes/Boton';
import { Vacio } from '@/componentes/Vacio';
import { exigirSesion } from '@/servidor/sesion';
import { misEnvios, POR_PAGINA, type PaginaEnvios } from '@/servidor/transferencias';

import { TarjetaEnvio } from './TarjetaEnvio';
import estilos from './estilos.module.css';

export const metadata: Metadata = {
  title: 'Mis envíos',
};

// The page number comes from the URL, so it is read per request and checked here.
export default function PaginaEnvios(props: PageProps<'/envios'>) {
  return (
    <Suspense fallback={<p role="status">Cargando tus envíos…</p>}>
      <Lista busqueda={props.searchParams} />
    </Suspense>
  );
}

async function Lista({ busqueda }: { busqueda: PageProps<'/envios'>['searchParams'] }) {
  await connection();
  const params = await busqueda;
  const sesion = await exigirSesion('/envios');
  const pagina = paginaDesde(params.pagina);
  const datos = await envios(sesion.usuario.id, pagina);
  const totalPaginas = Math.max(1, Math.ceil(datos.total / POR_PAGINA));

  // The transfers still waiting for the sender come first. The order inside a page is newest first.
  const porConfirmar = datos.envios.filter((envio) => envio.estado === 'creada');
  const demas = datos.envios.filter((envio) => envio.estado !== 'creada');

  return (
    <div className={estilos.lista}>
      <section className={estilos.encabezado}>
        <h1>Mis envíos</h1>
        <div>
          <Boton href="/enviar">Enviar dinero</Boton>
        </div>
      </section>

      {datos.total === 0 && (
        <Vacio texto="Todavía no enviaste dinero." accion={{ href: '/enviar', etiqueta: 'Enviar dinero' }} />
      )}

      {datos.total > 0 && datos.envios.length === 0 && (
        <Vacio texto="No hay envíos en esta página." accion={{ href: '/envios', etiqueta: 'Ver la primera página' }} />
      )}

      {porConfirmar.length > 0 && (
        <section className={estilos.bloque} aria-labelledby="titulo-por-confirmar">
          <h2 id="titulo-por-confirmar">Te falta confirmar</h2>
          <ul className={estilos.tarjetas}>
            {porConfirmar.map((envio) => (
              <li key={envio.id}>
                <TarjetaEnvio envio={envio} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {demas.length > 0 && (
        <section className={estilos.bloque} aria-labelledby="titulo-demas">
          <h2 id="titulo-demas">{porConfirmar.length > 0 ? 'Los demás envíos' : 'Todos tus envíos'}</h2>
          <ul className={estilos.tarjetas}>
            {demas.map((envio) => (
              <li key={envio.id}>
                <TarjetaEnvio envio={envio} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {datos.total > POR_PAGINA && (
        <nav aria-label="Páginas de envíos" className={estilos.paginas}>
          {pagina > 1 && (
            <Boton href={`/envios?pagina=${pagina - 1}`} variante="secundario">
              Anterior
            </Boton>
          )}
          <p className={estilos.fecha}>
            Página {pagina} de {totalPaginas}
          </p>
          {pagina < totalPaginas && (
            <Boton href={`/envios?pagina=${pagina + 1}`} variante="secundario">
              Siguiente
            </Boton>
          )}
        </nav>
      )}
    </div>
  );
}

// A page past the last one is refused by the database, which the server layer reports as an error.
// The first page still gives the total, so that page can say there is nothing here.
async function envios(usuarioId: string, pagina: number): Promise<PaginaEnvios> {
  try {
    return await misEnvios(usuarioId, { pagina });
  } catch (error) {
    if (pagina === 1) throw error;
    const primera = await misEnvios(usuarioId, { pagina: 1 });
    return { envios: [], total: primera.total, pagina, porPagina: POR_PAGINA };
  }
}

// Anything that is not a whole page number from 1 up shows the first page.
function paginaDesde(valor: string | string[] | undefined): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (!texto || !/^\d{1,6}$/.test(texto)) return 1;
  const numero = Number(texto);
  return numero >= 1 ? numero : 1;
}
