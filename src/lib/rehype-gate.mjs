// Splits a story at its `<!-- gate -->` comment.
//   modo 'quitar'  (the site): everything after the marker is removed from the page and replaced by
//                  an empty <div data-gate-cerrado>. The locked text never reaches the browser.
//   modo 'extraer' (scripts/cerrado.mjs): keeps only what comes after the marker, so the build can
//                  store it server-side and hand it out to readers who unlocked the story.
const esMarca = (nodo) =>
  (nodo.type === 'comment' && nodo.value.trim() === 'gate') ||
  (nodo.type === 'raw' && /^<!--\s*gate\s*-->$/.test(nodo.value.trim()));

export function rehypeGate({ modo = 'quitar' } = {}) {
  return (arbol) => {
    const i = arbol.children.findIndex(esMarca);
    if (modo === 'extraer') {
      arbol.children = i === -1 ? [] : arbol.children.slice(i + 1);
      return;
    }
    if (i === -1) return;
    arbol.children.splice(i, arbol.children.length - i, {
      type: 'element',
      tagName: 'div',
      properties: { dataGateCerrado: '' },
      children: [],
    });
  };
}
