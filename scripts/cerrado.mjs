// Manual tool, not part of build or dev. Renders the locked part of each paid story (everything
// after `<!-- gate -->`) and writes it to src/data/cerrado.json (gitignored). Run it while the stories
// still hold their locked text, then upload the result with scripts/subir-cerrado.mjs.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { rehypeGate } from '../src/lib/rehype-gate.mjs';

const DIR = 'src/content/historias';
const procesador = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeGate, { modo: 'extraer' })
  .use(rehypeStringify);

const cerrado = {};
for (const archivo of (await readdir(DIR)).filter((a) => a.endsWith('.md')).sort()) {
  const texto = await readFile(`${DIR}/${archivo}`, 'utf8');
  const [, frontmatter, cuerpo] = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/) ?? [];
  if (!cuerpo || /^gratis:\s*true\s*$/m.test(frontmatter) || !cuerpo.includes('<!-- gate -->')) continue;
  const html = String(await procesador.process(cuerpo)).trim();
  // A story already cut keeps only its marker, so its locked text is empty: nothing to save.
  if (html) cerrado[archivo.replace(/\.md$/, '')] = html;
}

// Stories already cut have no locked text left. An empty result must not replace the saved file.
if (Object.keys(cerrado).length === 0) {
  console.error('No hay texto cerrado en src/content/historias. src/data/cerrado.json no se tocó.');
  process.exit(1);
}

await mkdir('src/data', { recursive: true });
await writeFile('src/data/cerrado.json', JSON.stringify(cerrado));
console.log(`cerrado.json: ${Object.keys(cerrado).length} historias pagas`);
