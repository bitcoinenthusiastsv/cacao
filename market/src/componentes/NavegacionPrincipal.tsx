import Link from 'next/link';

// Presentational only (no hooks), so it can be the Suspense fallback as well as the live nav.
// The bottom bar shows all four sections. The header shows three, because the cart has its
// own link with the unit count.
const ENLACES = [
  { href: '/', texto: 'Inicio' },
  { href: '/carrito', texto: 'Carrito' },
  { href: '/ordenes', texto: 'Órdenes' },
  { href: '/mi-negocio', texto: 'Mi negocio' },
];

// The two navs are never both announced: CSS hides the header nav on phones and the bar on
// wide screens. Each still has its own name, so the two are told apart when both are in the DOM.
const NOMBRE = {
  barra: 'Navegación inferior',
  cabecera: 'Navegación principal',
} as const;

function esActual(href: string, ruta: string | null | undefined): boolean {
  if (!ruta) return false;
  if (href === '/') return ruta === '/';
  return ruta === href || ruta.startsWith(`${href}/`);
}

export function NavegacionPrincipal({
  actual,
  variante,
  insignia,
}: {
  actual?: string | null;
  variante: 'barra' | 'cabecera';
  /** Unread notices badge, drawn above the "Órdenes" label. */
  insignia?: React.ReactNode;
}) {
  const enlaces = variante === 'barra' ? ENLACES : ENLACES.filter((e) => e.href !== '/carrito');

  return (
    <nav aria-label={NOMBRE[variante]} className={`nav nav--${variante}`}>
      <ul>
        {enlaces.map((e) => {
          const activo = esActual(e.href, actual);
          return (
            <li key={e.href}>
              <Link href={e.href} aria-current={activo ? 'page' : undefined}>
                {/* The wrapper is the anchor for the badge; it does not change the label's size. */}
                <span className="nav__texto">
                  {e.texto}
                  {e.href === '/ordenes' && insignia}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
