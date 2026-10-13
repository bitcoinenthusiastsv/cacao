import { formatoNumero } from './formato';
import { Simbolo } from './Simbolo';

// Rating as text plus five bean symbols. The beans are one labelled image, so a screen
// reader hears "4.5 de 5" once.
export function Estrellas({ valor, cantidad }: { valor: number; cantidad?: number }) {
  const llenas = Math.round(valor);
  const texto = formatoNumero(valor);
  const sufijo =
    cantidad === undefined
      ? ''
      : ` (${cantidad} ${cantidad === 1 ? 'reseña' : 'reseñas'})`;

  return (
    <p className="estrellas">
      <span className="estrellas__marcas" role="img" aria-label={`${texto} de 5`}>
        {[1, 2, 3, 4, 5].map((n) =>
          n <= llenas ? (
            <Simbolo key={n} tamano="1.1em" decorativo />
          ) : (
            <Simbolo
              key={n}
              tamano="1.1em"
              decorativo
              izquierda="var(--pulpa)"
              derecha="var(--chocolate)"
            />
          ),
        )}
      </span>
      <span className="estrellas__texto">
        {texto}
        {sufijo}
      </span>
    </p>
  );
}
