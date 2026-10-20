// Splits a story at its `<!-- gate -->` comment.
//   modo 'quitar'  (the site): everything after the marker is removed from the page and replaced by
//                  an empty <div data-gate-cerrado>. The locked text never reaches the browser.
//   modo 'extraer' (scripts/cerrado.mjs): keeps only what comes after the marker, so the build can
//                  store it server-side and hand it out to readers who unlocked the story.
// Fail-closed: a paid story without the marker stops the build, so its text cannot reach the page.
// A marker nested inside another block also stops the build, because it cannot be cut cleanly.
const esMarca = (nodo) =>
  (nodo.type === 'comment' && nodo.value.trim() === 'gate') ||
  (nodo.type === 'raw' && /^<!--\s*gate\s*-->$/.test(nodo.value.trim()));

/** Every marker in the tree, at any depth. */
function marcasEn(nodo, hallazgos = []) {
  if (esMarca(nodo)) hallazgos.push(nodo);
  for (const hijo of nodo.children ?? []) marcasEn(hijo, hallazgos);
  return hallazgos;
}

/** Paid unless the frontmatter says gratis: true or gives a price of zero. Same rule as historiaDePago. */
function esPaga(fm) {
  return fm.gratis !== true && Number(fm.precio ?? 120) > 0;
}

/** The story's file name for error messages. */
function nombreDe(file, fm) {
  const ruta = String(file?.path ?? '');
  return ruta ? ruta.split(/[\\/]/).pop() : fm.titulo ?? 'historia sin nombre';
}

export function rehypeGate({ modo = 'quitar' } = {}) {
  return (arbol, file) => {
    // Astro passes the parsed frontmatter in file.data. A file without it counts as paid.
    const fm = file?.data?.astro?.frontmatter ?? {};
    const nombre = nombreDe(file, fm);
    const enRaiz = arbol.children.filter(esMarca);
    if (marcasEn(arbol).length !== enRaiz.length) {
      throw new Error(`${nombre}: el marcador <!-- gate --> está dentro de otro bloque. Ponelo en una línea propia, en la raíz del texto.`);
    }

    const i = arbol.children.findIndex(esMarca);
    if (modo === 'extraer') {
      arbol.children = i === -1 ? [] : arbol.children.slice(i + 1);
      return;
    }
    if (i === -1) {
      if (esPaga(fm)) {
        throw new Error(`${nombre} es paga pero no tiene el marcador <!-- gate -->. Sin él, el texto cerrado saldría en la página. Ponelo en una línea propia, después del texto gratis.`);
      }
      return;
    }
    arbol.children.splice(i, arbol.children.length - i, {
      type: 'element',
      tagName: 'div',
      properties: { dataGateCerrado: '' },
      children: [],
    });
  };
}
