import Link from 'next/link';

import estilos from './estilos.module.css';

// Presentational only (no hooks), so it can be the Suspense fallback as well as the live nav.
const ENLACES = [
  { href: '/monitor', texto: 'Resumen' },
  { href: '/monitor/envios', texto: 'Envíos' },
  { href: '/monitor/embudo', texto: 'Embudo' },
  { href: '/monitor/tarifas', texto: 'Tarifas' },
];

// /monitor is current only on itself. The other sections also cover their detail pages.
function esActual(href: string, ruta: string | null | undefined): boolean {
  if (!ruta) return false;
  if (href === '/monitor') return ruta === '/monitor';
  return ruta === href || ruta.startsWith(`${href}/`);
}

export function NavegacionMonitor({ actual }: { actual?: string | null }) {
  return (
    <nav aria-label="Secciones del monitor" className={estilos.subnav}>
      <ul>
        {ENLACES.map((e) => (
          <li key={e.href}>
            <Link href={e.href} aria-current={esActual(e.href, actual) ? 'page' : undefined}>
              {e.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
