import Link from 'next/link';

// A filter chip. The active one is filled and marked with aria-current.
export function Chip({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="chip" aria-current={activo ? 'true' : undefined}>
      {children}
    </Link>
  );
}
