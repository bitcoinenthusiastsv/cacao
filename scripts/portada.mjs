// Finds and downloads freely licensed cover photos from Wikimedia Commons.
//   node scripts/portada.mjs buscar "El Zonte beach"
//   node scripts/portada.mjs hoja "Coatepeque" coatepeque   (contact sheet in .hojas/coatepeque.jpg)
//   node scripts/portada.mjs bajar "File:Some photo.jpg" <slug>
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'CacaoMediaBuild/1.0 (https://cacaomedia.sv)' };
const LIBRE = /^(cc0|public domain|pd|cc by(-sa)? \d)/i;

const limpiar = (html = '') =>
  html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, 80);

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return r.json();
    await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
  }
  throw new Error(`Commons API failed: ${url}`);
}

const info = (p) => {
  const ii = p.imageinfo?.[0];
  if (!ii) return null;
  const m = ii.extmetadata ?? {};
  return {
    titulo: p.title,
    ancho: ii.width,
    alto: ii.height,
    mime: ii.mime,
    licencia: limpiar(m.LicenseShortName?.value),
    autor: limpiar(m.Artist?.value) || 'Autor desconocido',
    pagina: ii.descriptionurl,
    miniatura: ii.thumburl,
    descripcion: limpiar(m.ImageDescription?.value),
  };
};

const IIPROP = { prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1920' };

async function buscar(consulta) {
  const d = await api({
    action: 'query', generator: 'search', gsrsearch: `${consulta} filetype:bitmap`,
    gsrnamespace: '6', gsrlimit: '40', ...IIPROP,
  });
  const fotos = Object.values(d.query?.pages ?? {})
    .map(info)
    .filter((f) => f && f.mime === 'image/jpeg' && f.ancho >= 1600 && LIBRE.test(f.licencia))
    .filter((f) => f.ancho / f.alto >= 1.2 && f.ancho / f.alto <= 2.1);
  if (!fotos.length) return console.log('SIN RESULTADOS. Probá otra consulta, más corta o en inglés.');
  for (const f of fotos.slice(0, 12)) {
    console.log(`${f.titulo}\n   ${f.ancho}x${f.alto} · ${f.licencia} · ${f.autor}\n   ${f.descripcion}`);
  }
}

// Commons assessments: quality image, featured picture, valued image.
const PREMIADAS = 'haswbstatement:P6731=Q63348069|P6731=Q63348049|P6731=Q63348040';

async function candidatas(consulta, extra = '') {
  const d = await api({
    action: 'query', generator: 'search', gsrsearch: `${consulta} ${extra} filetype:bitmap`,
    gsrnamespace: '6', gsrlimit: '50', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '640',
  });
  return Object.values(d.query?.pages ?? {})
    .sort((a, b) => a.index - b.index)
    .map(info)
    .filter((f) => f && f.mime === 'image/jpeg' && f.ancho >= 2000 && LIBRE.test(f.licencia))
    .filter((f) => f.ancho / f.alto >= 1.2 && f.ancho / f.alto <= 2.1);
}

async function usadas() {
  const mapa = new Map();
  for (const dir of ['src/content/historias', 'travel/src/content/tours'])
  for (const a of await readdir(dir).catch(() => [])) {
    const m = (await readFile(`${dir}/${a}`, 'utf8')).match(/^creditoUrl:\s*'?([^'\n]+)/m);
    if (m) mapa.set(decodeURIComponent(m[1].trim()), (dir.endsWith('tours') ? 'tour-' : '') + a.replace(/\.md$/, ''));
  }
  return mapa;
}

// Contact sheet: award-winning photos first, then the rest in search order.
async function hoja(consulta, nombre) {
  const premiadas = await candidatas(consulta, PREMIADAS).catch(() => []);
  const vistas = new Set(premiadas.map((f) => f.titulo));
  const resto = (await candidatas(consulta)).filter((f) => !vistas.has(f.titulo));
  const enUso = await usadas();
  const fotos = [...premiadas.map((f) => ({ ...f, premio: true })), ...resto]
    .filter((f) => !enUso.has(decodeURIComponent(f.pagina)))
    .slice(0, 12);
  if (!fotos.length) return console.log('SIN RESULTADOS. Probá otra consulta, más corta o en inglés.');
  const W = 480, H = 300, C = 4;
  const piezas = [];
  for (const [i, f] of fotos.entries()) {
    const r = await fetch(f.miniatura, { headers: UA });
    if (!r.ok) continue;
    const img = await sharp(Buffer.from(await r.arrayBuffer())).resize(W, H, { fit: 'cover' }).toBuffer();
    const x = (i % C) * W, y = Math.floor(i / C) * (H + 34);
    piezas.push({ input: img, left: x, top: y });
    piezas.push({
      input: Buffer.from(`<svg width="${W}" height="34" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000"/><text x="8" y="24" font-family="monospace" font-size="22" fill="${f.premio ? '#ffd24a' : '#fff'}">${i + 1}${f.premio ? ' PREMIADA' : ''}</text></svg>`),
      left: x, top: y + H,
    });
    console.log(`${i + 1}. ${f.titulo}
     ${f.ancho}x${f.alto} · ${f.licencia}${f.premio ? ' · PREMIADA' : ''} · ${f.descripcion}`);
  }
  await mkdir('.hojas', { recursive: true });
  await sharp({ create: { width: W * C, height: (H + 34) * Math.ceil(fotos.length / C), channels: 3, background: '#222' } })
    .composite(piezas).jpeg({ quality: 72 }).toFile(`.hojas/${nombre}.jpg`);
  console.log(`
HOJA: .hojas/${nombre}.jpg  (mirala con Read; los números coinciden con la lista)`);
}

async function bajar(titulo, slug) {
  const d = await api({ action: 'query', titles: titulo, ...IIPROP });
  const f = Object.values(d.query?.pages ?? {}).map(info)[0];
  if (!f) throw new Error(`No existe: ${titulo}`);
  if (!LIBRE.test(f.licencia)) throw new Error(`Licencia no permitida: ${f.licencia}`);
  const dueno = (await usadas()).get(decodeURIComponent(f.pagina));
  if (dueno && dueno !== slug) throw new Error(`Esa foto ya la usa la historia "${dueno}". Elegí otra.`);
  let r;
  for (let i = 0; i < 4; i++) {
    r = await fetch(f.miniatura, { headers: UA });
    if (r.ok) break;
    await new Promise((ok) => setTimeout(ok, 2000 * (i + 1)));
  }
  if (!r.ok) throw new Error(`Descarga falló: ${r.status}`);
  const jpg = await sharp(Buffer.from(await r.arrayBuffer()))
    .resize({ width: 1600, height: 1000, fit: 'cover', position: 'attention' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  await writeFile(`public/portadas/${slug}.jpg`, jpg);
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  console.log(`GUARDADA public/portadas/${slug}.jpg (${Math.round(jpg.length / 1024)} KB)\nPegá esto en el frontmatter:`);
  console.log(`portada: /portadas/${slug}.jpg\ncredito: ${q(f.autor)}\nlicencia: ${q(f.licencia)}\ncreditoUrl: ${q(f.pagina)}`);
}

const [modo, a, b] = process.argv.slice(2);
if (modo === 'buscar' && a) await buscar(a);
else if (modo === 'hoja' && a && b) await hoja(a, b);
else if (modo === 'bajar' && a && b) await bajar(a, b);
else console.log('Uso: buscar "<consulta>" | hoja "<consulta>" <nombre> | bajar "File:..." <slug>');
