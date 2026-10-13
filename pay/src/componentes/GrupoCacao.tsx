import { GRUPO_FRASE, PRODUCTOS, type ProductoId } from '@/lib/grupo';

import estilos from './GrupoCacao.module.css';

// The group block after the page, on a dark band. The phone tab bar is fixed at the bottom, so the
// band pads itself by the bar's height (see the CSS module).
export function GrupoCacao({ actual }: { actual: ProductoId }) {
  return (
    <div className={estilos.banda}>
      <div className={`contenedor ${estilos.grupo}`}>
        <h2 className={estilos.titulo}>Grupo Cacao</h2>
        <nav aria-label="Productos del grupo Cacao">
          <ul className={estilos.lista}>
            {PRODUCTOS.map((p) => (
              <li key={p.id} className={estilos.item}>
                {p.id === actual ? (
                  <span className={estilos.enlace} aria-current="true">
                    <span className={estilos.marca}>
                      <b>cacao</b>
                      {p.marca}
                    </span>
                    <span className={estilos.linea}>{p.linea}</span>
                    <span className={estilos.aqui} aria-hidden="true">
                      aquí
                    </span>
                    <span className="solo-lectores">estás aquí</span>
                  </span>
                ) : (
                  <a className={estilos.enlace} href={p.url}>
                    <span className={estilos.marca}>
                      <b>cacao</b>
                      {p.marca}
                    </span>
                    <span className={estilos.linea}>{p.linea}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <p className={estilos.frase}>{GRUPO_FRASE}</p>
      </div>
    </div>
  );
}
