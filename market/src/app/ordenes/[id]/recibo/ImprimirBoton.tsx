'use client';

// Opens the browser's print dialog, where the buyer can also save a PDF. Hidden when printing.
export function ImprimirBoton() {
  return (
    <button type="button" className="boton" onClick={() => window.print()}>
      Imprimir o guardar como PDF
    </button>
  );
}
