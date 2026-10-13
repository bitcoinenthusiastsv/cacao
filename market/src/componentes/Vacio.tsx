import { Boton } from './Boton';

// Empty state: one short sentence and an optional way out.
export function Vacio({
  texto,
  accion,
}: {
  texto: string;
  accion?: { href: string; etiqueta: string };
}) {
  return (
    <div className="vacio">
      <p>{texto}</p>
      {accion && (
        <Boton href={accion.href} variante="secundario">
          {accion.etiqueta}
        </Boton>
      )}
    </div>
  );
}
