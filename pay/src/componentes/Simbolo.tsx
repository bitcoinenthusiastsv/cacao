// Split cacao bean: two half discs rotated 30 degrees, pulled apart by 2.5 units.
// Same geometry as the Cacao Media, Cacao Travel and Cacao Market symbols.

type Props = {
  /** Any CSS length. */
  tamano?: number | string;
  /** "claro" for light grounds (Tostado and Mazorca), "oscuro" for dark grounds. */
  fondo?: 'claro' | 'oscuro';
  /** Hides the symbol from assistive technology when the wordmark already names the brand. */
  decorativo?: boolean;
  /** Overrides the colours of the two halves. */
  izquierda?: string;
  derecha?: string;
};

export function Simbolo({
  tamano = 32,
  fondo = 'claro',
  decorativo = false,
  izquierda,
  derecha,
}: Props) {
  const colorIzquierda = izquierda ?? (fondo === 'claro' ? 'var(--tostado)' : 'var(--pulpa)');
  const colorDerecha = derecha ?? 'var(--mazorca)';

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: tamano, height: tamano, flex: 'none' }}
      role={decorativo ? undefined : 'img'}
      aria-label={decorativo ? undefined : 'Símbolo de CacaoPay'}
      aria-hidden={decorativo ? true : undefined}
      focusable="false"
    >
      <g transform="rotate(30 50 50)">
        <path
          d="M50 14.3 A40 40 0 0 0 50 85.7 Z"
          style={{ fill: colorIzquierda }}
          transform="translate(-2.5 0)"
        />
        <path
          d="M50 14.3 A40 40 0 0 1 50 85.7 Z"
          style={{ fill: colorDerecha }}
          transform="translate(2.5 0)"
        />
      </g>
    </svg>
  );
}
