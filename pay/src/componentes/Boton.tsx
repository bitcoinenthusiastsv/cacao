import Link from 'next/link';

type Props = {
  children: React.ReactNode;
  /** With href the button is a link. */
  href?: string;
  variante?: 'primario' | 'secundario';
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  'aria-describedby'?: string;
};

export function Boton({
  children,
  href,
  variante = 'primario',
  type = 'button',
  disabled = false,
  onClick,
  'aria-describedby': descritoPor,
}: Props) {
  const clase = variante === 'secundario' ? 'boton boton--secundario' : 'boton';

  if (href) {
    return (
      <Link href={href} className={clase}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={clase}
      disabled={disabled}
      onClick={onClick}
      aria-describedby={descritoPor}
    >
      {children}
    </button>
  );
}
