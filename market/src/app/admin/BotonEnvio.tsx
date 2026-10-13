'use client';

import { useFormStatus } from 'react-dom';

// Submit button that shows the pending state of the form it sits in.
export function BotonEnvio({
  children,
  pendiente,
  variante = 'primario',
}: {
  children: React.ReactNode;
  pendiente: string;
  variante?: 'primario' | 'secundario';
}) {
  const { pending } = useFormStatus();
  const clase = variante === 'secundario' ? 'boton boton--secundario' : 'boton';
  return (
    <button type="submit" className={clase} disabled={pending} aria-disabled={pending || undefined}>
      {pending ? pendiente : children}
    </button>
  );
}
