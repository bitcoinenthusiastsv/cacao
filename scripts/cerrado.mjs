// Runs before every build and dev start. Renders the locked part of each paid story (everything
// after `<!-- gate -->`) and writes it to src/data/cerrado.json, which only server routes import.
// The pages themselves are built without that text.
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
  cerrado[archivo.replace(/\.md$/, '')] = String(await procesador.process(cuerpo)).trim();
}

await mkdir('src/data', { recursive: true });
await writeFile('src/data/cerrado.json', JSON.stringify(cerrado));
console.log(`cerrado.json: ${Object.keys(cerrado).length} historias pagas`);
