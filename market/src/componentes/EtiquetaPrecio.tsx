import { formatoSats, formatoUsd } from '@/lib/dinero';

type Props = {
  usdCentavos: number;
  /** Null when no BTC price is available: the tag then shows USD only. */
  sats: number | null;
  tamano?: 'normal' | 'grande';
};

// The price tag: a Mazorca label with one end cut to a point and a punched hole. The hole is
// drawn in the ground it sits on (the card or the page), so the tag reads as a real tag.
export function EtiquetaPrecio({ usdCentavos, sats, tamano = 'normal' }: Props) {
  const clase = tamano === 'grande' ? 'etiqueta etiqueta--grande' : 'etiqueta';

  if (sats === null) {
    return (
      <p className={clase}>
        <span className="etiqueta__agujero" aria-hidden="true" />
        <span className="etiqueta__principal">
          <span className="etiqueta__num">{formatoUsd(usdCentavos)}</span>
        </span>
      </p>
    );
  }

  // "1,250 sats": the number is the big figure, the unit is set smaller after it.
  const texto = formatoSats(sats);
  const corte = texto.lastIndexOf(' ');
  const numero = corte > 0 ? texto.slice(0, corte) : texto;
  const unidad = corte > 0 ? texto.slice(corte + 1) : '';

  return (
    <p className={clase}>
      <span className="etiqueta__agujero" aria-hidden="true" />
      <span className="etiqueta__principal">
        <span className="etiqueta__num">{numero}</span>
        {unidad && <span className="etiqueta__unidad">{unidad}</span>}
      </span>
      <span className="etiqueta__secundario">{formatoUsd(usdCentavos)}</span>
    </p>
  );
}
