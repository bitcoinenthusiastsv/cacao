# Cacao Media y Cacao Travel

Dos sitios que funcionan juntos. Cacao Media es una publicación editorial sobre El Salvador: cada historia tiene precio en satoshis y se desbloquea de a una, sin cuenta ni suscripción. Cacao Travel es un catálogo de experiencias en El Salvador, también con precio en satoshis, que nace de los lugares de esas historias. Hoy los dos son una demo y no se cobra ningún pago (ver "Estado actual: demo").

Sitios en vivo:

- https://cacao-media.vercel.app
- https://cacao-travel.vercel.app

## La idea

- **Pago por historia, no suscripción.** Cada historia de pago cuesta 120 sats. Con tarjeta, un cobro tan chico no tiene sentido porque las comisiones superan el precio. Con bitcoin por Lightning, pagar una sola historia sí es práctico.
- **Un circuito entre contenido y comercio.** Quien desbloqueó una historia vinculada a una experiencia obtiene 10% de descuento en esa experiencia. Quien reserva obtiene 30 días de acceso a las historias vinculadas a esa experiencia.
- **Reparto en cada reserva.** El operador recibe 85%, Cacao Travel 10% y el autor de la historia 5%. Si la reserva no viene de ninguna historia, el reparto es 90% para el operador y 10% para Cacao Travel.

## Estado actual: demo

- No se cobra ningún pago. Desbloquear historias y reservar funcionan, pero sin costo.
- Hay dos archivos donde hay que verificar que una factura Lightning está pagada antes de firmar el token o la confirmación: `src/pages/api/desbloquear.ts` (Cacao Media) y `travel/src/pages/api/reservar.ts` (Cacao Travel).
- Las 13 experiencias son de muestra y no tienen un operador real.
- Las reservas y los borradores de operador se guardan solo en el navegador de cada visitante. No hay cuentas, no hay base de datos y los cupos no se descuentan.
- Las historias son textos de muestra que no pasaron por verificación editorial.
- Los dos sitios piden a los buscadores que no los indexen: Cacao Media con una etiqueta `noindex` y `robots.txt`, Cacao Travel con `noindex`.

## Cómo funciona

Cacao Media y Cacao Travel son dos proyectos Astro separados. Sus páginas son estáticas y solo las rutas de API corren en el servidor. Se comunican por sus APIs públicas y por tokens firmados. El navegador guarda el token firmado de cada historia desbloqueada, nunca el texto cerrado.

```
CACAO MEDIA                                       CACAO TRAVEL
-----------                                       ------------
1. Lector desbloquea una historia
   POST /api/desbloquear/  -> token A (7 dias)
2. Parte cerrada de la historia
   GET /api/contenido/<slug>/  con token A
   -> texto cerrado, solo si el token es valido
3. Pagina de historia
   el navegador pide GET /api/tours.json ----->  catalogo publico
   <-------------------------------------------  experiencia relacionada
4. Enlace a la experiencia con #lector=A ----->  POST /api/lector/
                                                 -> 10 % de descuento
                                                 5. POST /api/reservar/
                                                 -> codigo + pase B (30 dias)
6. Enlace a la historia con #pase=B <---------   confirmacion de la reserva
   -> la historia se abre sin pagar
```

**Tokens firmados.** Ambos proyectos usan el mismo formato, definido en `src/lib/firma.ts` (`travel/src/lib/firma.ts` es una copia idéntica). Un token tiene dos partes separadas por un punto: un payload en JSON codificado en base64url, con el tipo (`pago` o `reserva`), las historias que abre y la fecha de vencimiento; y una firma HMAC-SHA256 de ese payload. Cualquiera puede leer el payload, pero solo quien conoce el secreto de la variable de entorno `CACAO_SECRET` puede firmar, y cualquier cambio en el payload invalida la firma.

## APIs

Las rutas de Cacao Media están en `src/pages/api/` y las de Cacao Travel en `travel/src/pages/api/`. El feed RSS está en `src/pages/rss.xml.ts`.

| Sitio | Método | Ruta | Qué hace |
|---|---|---|---|
| Cacao Media | GET | `/api/historias.json` | Índice público de las historias: título, bajada, lugar, precio y URL. CORS abierto. Cacao Travel lo usa para mostrar la lectura de cada experiencia. |
| Cacao Media | POST | `/api/desbloquear/` | Emite un token de 7 días para una historia de pago. Cuerpo: `{ "slug": "..." }`. Demo: no cobra. |
| Cacao Media | GET | `/api/contenido/<slug>/` | Devuelve el texto cerrado de una historia si el token de `Authorization: Bearer` la cubre. Si no, responde 401. |
| Cacao Media | GET | `/rss.xml` | Feed RSS de todas las historias. |
| Cacao Travel | GET | `/api/tours.json` | Catálogo público de experiencias: precio, lugar, salidas, grupo, historias vinculadas y reparto. CORS abierto. |
| Cacao Travel | POST | `/api/lector/` | Indica si un token de lector da descuento en una experiencia. Cuerpo: `{ "token": "...", "tour": "<id>" }`. |
| Cacao Travel | POST | `/api/reservar/` | Confirma una reserva. Cuerpo: `tour`, `fecha` (AAAA-MM-DD), `personas` y `lector` (opcional). Recalcula todo en el servidor y devuelve código, cotización, reparto, lecturas y pase. Demo: no cobra ni cuenta cupos. |

## Estructura del repositorio

```
CacaoMedia/                       Cacao Media (raíz del repositorio)
  package.json                    scripts y dependencias de Cacao Media
  astro.config.mjs                Astro y el adaptador de Vercel
  vercel.json                     cabeceras, redirecciones y buildCommand
  playwright.config.ts            configuración de las pruebas
  scripts/
    cerrado.mjs                   genera el texto cerrado de las historias de pago
    arreglar-funcion.mjs          ajuste del build para el adaptador de Vercel
    portada.mjs                   busca y baja fotos libres de Wikimedia Commons
  tests/
    gate.spec.ts                  pruebas del muro de pago y del widget de Travel
    travel.spec.ts                pruebas de Cacao Travel: catálogo, reservas, descuento, mapa
  public/
    robots.txt                    pide a los buscadores no indexar el sitio
    portadas/                     foto de portada de cada historia
  src/
    content/historias/            58 historias en Markdown; las de pago tienen <!-- gate -->
    content.config.ts             esquema de las historias
    pages/                        inicio, secciones, historias, archivo, créditos, rss
    pages/api/                    rutas de servidor: historias.json, desbloquear, contenido
    components/                   CacaoGate (muro de pago), WidgetTravel, tarjetas
    layouts/Base.astro            plantilla común de todas las páginas
    lib/                          firma.ts (tokens), gate.ts (muro en el navegador),
                                  rehype-gate.mjs (corta el texto cerrado), travel.ts
    styles/global.css
    data/                         cerrado.json, generado al arrancar (no se sube a git)
  travel/                         Cacao Travel (su propio proyecto Astro)
    package.json                  scripts y dependencias de Cacao Travel
    astro.config.mjs
    vercel.json
    scripts/arreglar-funcion.mjs  ajuste del build para el adaptador de Vercel
    public/fotos/                 foto de cada experiencia
    src/
      content/tours/              13 experiencias en Markdown
      pages/                      inicio, experiencias/<id>, mapa (Leaflet), reservas, operadores, créditos
      pages/api/                  tours.json, reservar, lector
      components/                 Boleto (tarjeta), Telon (animación de entrada)
      lib/                        firma.ts (tokens), reparto.ts (cuentas), lector.ts, tours.ts
      layouts/Base.astro
```

Cacao Media vive en la raíz del repositorio y Cacao Travel en la carpeta `travel/`. Cada uno tiene su propio `package.json`, sus dependencias y sus comandos.

## Correrlo en tu máquina

**Requisitos.** Node 22 o más reciente, con npm. Los `package.json` no fijan otra versión de Node.

**Cacao Media** (desde la raíz del repositorio):

```bash
npm install
```

```bash
npm run dev
```

Abrí http://localhost:4321. Antes de arrancar, `npm run dev` ejecuta `scripts/cerrado.mjs`, que genera `src/data/cerrado.json` con el texto de las historias de pago. Ese archivo no se sube a git.

**Cacao Travel** (desde la carpeta `travel/`):

```bash
cd travel
```

```bash
npm install
```

```bash
npm run dev
```

Abrí http://localhost:4322. Cacao Media usa el puerto 4321 y Cacao Travel el 4322, fijado en el script `dev` de `travel/package.json`.

**Sin `CACAO_SECRET`.** En desarrollo, cada proyecto usa un secreto fijo definido en `src/lib/firma.ts`. Como los dos archivos son iguales, los tokens entre los dos sitios locales funcionan sin configurar nada.

**Los sitios locales hablan con producción por defecto.** Cacao Media local muestra las experiencias de https://cacao-travel.vercel.app y Cacao Travel local muestra las historias de https://cacao-media.vercel.app. Para que se hablen entre sí en local, definí `PUBLIC_TRAVEL_URL=http://localhost:4322` en Cacao Media y `PUBLIC_MEDIA_URL=http://localhost:4321` en Cacao Travel, por ejemplo en un archivo `.env` dentro de cada carpeta de proyecto. Los `.env` están en `.gitignore`.

## Pruebas

Las pruebas usan Playwright y están en `tests/`: `tests/gate.spec.ts` para Cacao Media y `tests/travel.spec.ts` para Cacao Travel. Se corren desde la raíz de Cacao Media:

```bash
npm test
```

`npm test` corre los dos proyectos de Playwright (`media` y `travel`, ver `playwright.config.ts`). Si el servidor de desarrollo de cada sitio no está corriendo (puerto 4321 para Cacao Media y 4322 para Cacao Travel), Playwright lo arranca solo. Si pide un navegador que no está instalado, seguí la documentación de Playwright para instalarlo.

Las pruebas de Cacao Media cubren el muro de pago. Una historia de pago empieza bloqueada. El desbloqueo dura 7 días, sobrevive a una recarga, y un desbloqueo vencido vuelve a bloquear la historia. La parte cerrada no aparece en el HTML, y la API solo la entrega con un token válido para esa historia; un token alterado se rechaza. También prueban el widget de Cacao Travel dentro de las historias, con la API de Travel simulada, y que no haya desborde horizontal a 375 px en cinco páginas.

Las pruebas de Cacao Travel recorren el catálogo con búsqueda, fecha, personas, filtros y orden, y comprueban que las tarjetas coincidan con `/api/tours.json`. También cubren la reserva: el reparto en cada experiencia, las validaciones de `POST /api/reservar/`, el descuento de lector y el guardado de reservas y borradores en el navegador. Por último revisan el mapa, la página de créditos, la página 404, el desborde horizontal a 320 px y la animación de entrada.

`npm run check` revisa los tipos en cada proyecto.

## Despliegue

Cacao Media y Cacao Travel se despliegan en Vercel como dos proyectos separados. Cada uno tiene su `vercel.json`, con `buildCommand` en `npm run build`. Los comandos que corre cada build, según su `package.json`, son:

- Cacao Media: `node scripts/cerrado.mjs && astro build && node scripts/arreglar-funcion.mjs`
- Cacao Travel: `astro build && node scripts/arreglar-funcion.mjs`

Cacao Travel se despliega desde la carpeta `travel/` (o configurando esa carpeta como directorio raíz de su proyecto en Vercel).

Dos scripts auxiliares participan del build:

- `scripts/cerrado.mjs` (Cacao Media) corre antes de cada build y de `dev`. Toma la parte cerrada de cada historia de pago, lo que viene después de `<!-- gate -->`, y la guarda en `src/data/cerrado.json`. Solo leen ese archivo las rutas del servidor, así que las páginas se construyen sin ese texto.
- `scripts/arreglar-funcion.mjs` (en los dos proyectos) es una solución temporal para el adaptador de Vercel con Astro 7. Quita de la función del servidor dos imports que hacían fallar cada petición con "Cannot find native binding". El build informa cuántas líneas quitó. Se puede borrar cuando el adaptador deje de generarlos.

Variables de entorno:

- `CACAO_SECRET` tiene que tener el mismo valor en los dos proyectos de Vercel, con al menos 32 caracteres. Si falta en producción, las rutas que emiten tokens fallan. No lo subas al repositorio.
- `PUBLIC_TRAVEL_URL` y `PUBLIC_MEDIA_URL` no hacen falta en producción: por defecto apuntan a las URL de los dos sitios.

## Fotos y créditos

Las fotos vienen de Wikimedia Commons, con licencias libres (por ejemplo CC BY-SA 4.0 o CC0). Cada foto muestra su autor y su licencia en la página donde aparece: en cada historia de Cacao Media y en cada experiencia de Cacao Travel. Cada sitio tiene su página `/creditos/`: la de Cacao Media lista las fotos de las historias y la de Cacao Travel las de las experiencias. Cuando una foto no es del lugar de la historia, el pie de foto dice dónde fue tomada.

Las fotos de Cacao Media están en `public/portadas/` y las de Cacao Travel en `travel/public/fotos/`. El script `scripts/portada.mjs` ayuda a buscar y bajar fotos libres de Wikimedia Commons.
