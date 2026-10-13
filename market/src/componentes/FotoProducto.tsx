// Product photo at a fixed 4:3, or a flat block in a brand colour picked from the category,
// with the product's first letter large. Photos come from a storage URL, so plain img.
// `prioridad` is for the photos above the fold: they load now, the rest load lazily.
const COLORES = ['foto--criollo', 'foto--grano', 'foto--chocolate', 'foto--mazorca'] as const;

export function FotoProducto({
  src,
  nombre,
  categoriaId,
  prioridad = false,
}: {
  src: string | null;
  nombre: string;
  categoriaId: number;
  prioridad?: boolean;
}) {
  if (src) {
    return (
      <img
        className="foto"
        src={src}
        alt={nombre}
        width={800}
        height={600}
        loading={prioridad ? 'eager' : 'lazy'}
        fetchPriority={prioridad ? 'high' : undefined}
        decoding="async"
      />
    );
  }

  const inicial = nombre.trim().charAt(0).toLocaleUpperCase('es-SV');
  const color = COLORES[Math.abs(categoriaId) % COLORES.length];
  // The letter repeats the name next to it, so the block is hidden from assistive technology.
  return (
    <div className={`foto foto--sin ${color}`} aria-hidden="true">
      <span>{inicial}</span>
    </div>
  );
}
