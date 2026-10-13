'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import estilos from './estilos.module.css';

const SECCIONES = [
  { href: '/mi-negocio', texto: 'Resumen' },
  { href: '/mi-negocio/productos', texto: 'Productos' },
  { href: '/mi-negocio/servicios', texto: 'Servicios' },
  { href: '/mi-negocio/ordenes', texto: 'Órdenes' },
  { href: '/mi-negocio/cotizaciones', texto: 'Cotizaciones' },
];

// Only the summary matches exactly; the others also match their own sub-pages.
function esActual(href: string, ruta: string): boolean {
  if (href === '/mi-negocio') return ruta === href;
  return ruta === href || ruta.startsWith(`${href}/`);
}

export function SubNavegacion() {
  const ruta = usePathname();
  return (
    <nav aria-label="Secciones de mi negocio" className={estilos.subnav}>
      <ul>
        {SECCIONES.map((s) => (
          <li key={s.href}>
            <Link href={s.href} aria-current={esActual(s.href, ruta) ? 'page' : undefined}>
              {s.texto}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
