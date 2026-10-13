# CacaoLedger

CacaoLedger toma una venta pagada y produce el documento tributario electrónico (DTE) de El Salvador:
factura 01 para consumidor final o comprobante de crédito fiscal 03 para contribuyente. Registra
cómo se pagó cada venta, guarda en una cadena de registros lo que el DTE no puede contener (como la
tasa de un pago en bitcoin), cierra el día, produce los libros de IVA del mes y publica un sitio
estático del cierre.

Es parte del grupo Cacao (CacaoMedia, CacaoTravel, CacaoMarket, CacaoPay). Una orden pagada de
CacaoMarket puede convertirse en ticket con `importar market`, a partir de un archivo exportado. Producir
ese archivo desde la base de datos de CacaoMarket es un paso aparte, que todavía no existe.

## Requisitos y arranque

Necesitás Node 24 y nada más. Node 24 ejecuta TypeScript directamente.

```
npm install
npm test
npm run demo
```

`npm install` baja solo `ajv`, `ajv-formats`, `typescript` y los tipos de Node. `npm test` corre las
pruebas. `npm run demo` muestra el recorrido completo con datos de prueba, con reloj fijo y sin red.
Para la otra generación de esquemas: `npm run demo -- --esquemas 2026`.

El uso diario es `node src/cli.ts ayuda`. Los datos viven en `datos/`, que no entra al repositorio.

## Comandos

| Comando | Qué hace |
|---|---|
| `ticket nuevo --desde <archivo>` o `ticket nuevo --cliente ... --linea ...` | Crea un ticket con líneas, IVA del 13 % incluido y tipo de cliente. |
| `ticket ver <id>`, `ticket lista` | Muestra un ticket o la lista. |
| `pagar <id> --blink <archivo>` o `pagar <id> --efectivo` | Registra el pago por Lightning (webhook de Blink) o en efectivo. |
| `importar market <archivo>` | Crea un ticket pagado desde un pedido exportado de CacaoMarket. Ver `docs/importar-market.md`. |
| `dte construir <id>` | Construye el DTE 01 o 03 y lo valida. Escribe la atestación si el pago es Lightning. |
| `dte validar <archivo o id>` | Valida un documento contra el esquema y las reglas propias. |
| `dte transmitir <id> --simulado` | Completa el ciclo con un sello simulado. La transmisión real no existe. |
| `atestacion ver <id>`, `atestacion verificar`, `atestacion exportar` | Muestra, verifica o exporta la cadena de atestaciones de tasa. |
| `cierre [YYYY-MM-DD]` | Cierre del día: cada ticket en un grupo y una pregunta final. `cierre --ayuda` explica el plazo. |
| `mes <YYYY-MM> [--json] [--csv <carpeta>]` | Libros de IVA del mes y cifras para F-07 y F-14. |
| `web [--dia YYYY-MM-DD] [--salida <carpeta>]` | Escribe el sitio estático del cierre (por defecto `sitio/`). |
| `demo` | Recorrido completo con datos de prueba. |
| `npm run sitio` | Corre la demo en una carpeta temporal y escribe `sitio/` desde ella. |

Cuando un comando pide `<id>`, usá el identificador que imprimió el paso anterior (`TK-AAAAMMDD-XXXX`).

Opciones generales: `--esquemas caso|2026` (o la variable `LEDGER_ESQUEMAS`), `--datos <carpeta>` (o
`LEDGER_DATOS`), `--json` en la mayoría de los comandos.

## Los seis puntos del caso

| # | Punto | Estado | Cómo se muestra |
|---|---|---|---|
| 1 | Ticket con líneas, IVA del 13 % incluido y tipo de cliente (01 o 03) | Hecho | `node src/cli.ts ticket nuevo --desde fixtures/ticket-consumidor.json` y `node src/cli.ts ticket ver <id>` |
| 2 | Pago en dos rieles, uno Lightning (webhook de Blink) y otro efectivo | Hecho, desde fixtures | `node src/cli.ts pagar <id> --blink fixtures/blink-receive-lightning.json` y `node src/cli.ts pagar <id> --efectivo` |
| 3 | DTE 01 y 03 válidos, con la forma de pago del riel que liquidó | Hecho | `node src/cli.ts dte construir <id>` |
| 4 | Validación contra los esquemas oficiales, con falla legible del código 11 en 01 | Hecho | `node src/cli.ts dte construir <id> --forzar-codigo 11`, y con `--esquemas 2026` para ver el aviso |
| 5 | Atestación de tasa, enlazada y encadenada | Hecho | `node src/cli.ts atestacion ver <id>`, `node src/cli.ts atestacion verificar` |
| 6 | Cierre diario por grupos y pregunta final | Hecho | `node src/cli.ts cierre` (`node src/cli.ts cierre --ayuda` explica el plazo) |

En el orden del punto 4, corré primero el comando forzado: un ticket con documento ya no admite una
segunda construcción.

## Los puntos opcionales del caso

| # | Punto | Estado | Por qué |
|---|---|---|---|
| 7 | Firma con el firmador del Ministerio (SVFE) y JWS | No hecho | Hace falta correr el firmador de Hacienda y un certificado de prueba. Sin eso no hay firma que mostrar. |
| 8 | Libros de consumidor final y de contribuyentes, y cifras de F-07 y F-14 | Hecho | `node src/cli.ts mes <YYYY-MM>`. Ver la sección siguiente. |
| 9 | Convención defendida para la referencia de 50 caracteres | Hecho | `BTC-LN\|<sats>sat\|<tasa>\|<hash>`. Los argumentos están en `docs/hallazgos.md`, sección 8. |
| 10 | Credenciales por inquilino con cifrado | No hecho | Solo hay un comerciante. Diseñar el cifrado sin un segundo comerciante real sería especular. |
| 11 | Contingencia (`tipoOperacion` 2) con cola de reenvío | No hecho | Requiere el canal de transmisión real. |
| 12 | Recibo para el cliente con QR y versión legible | No hecho | No hay PDF ni QR en esta versión. |
| 13 | Transmisión a la prueba del Ministerio | No hecho | Las credenciales de prueba salen de un NIT registrado; no se pudieron obtener dentro del sprint. El sello es simulado. |

## Libros de IVA y cifras del mes

`node src/cli.ts mes 2026-10` imprime, para el mes:

- **Libro de ventas a consumidor final (01).** Una fila por día del mes, incluidos los días sin
  ventas: primer y último número de control, cantidad de documentos y ventas gravadas con IVA incluido.
- **Libro de ventas a contribuyentes (03).** Una fila por documento: fecha, número de control, código
  de generación, nombre y NRC del receptor, venta gravada neta, IVA y total.
- **Cifras para las declaraciones.** La base gravada sin IVA y el débito de IVA para el F-07, y los
  ingresos brutos sin IVA y el pago a cuenta del 1.75 % para el F-14.
- **No incluidos.** Los tickets con dinero recibido y sin documento válido, con el motivo.

Solo cuentan los documentos con sello simulado. Los números salen del documento guardado, no se
retipean.

`--csv <carpeta>` escribe un CSV por libro (`libro-consumidor-final-01_2026-10.csv` y
`libro-contribuyentes-03_2026-10.csv`). Los CSV usan UTF-8 con BOM para que la hoja de cálculo abra
las tildes, separador punto y coma, decimales con coma y una fila final de totales. Los montos no
llevan separador de miles.

Lo que no se pudo confirmar contra el Ministerio: los nombres oficiales de las columnas de los libros
(por eso los encabezados describen el contenido), la base exacta del F-14 (aquí se toma sin IVA) y la
casilla exacta de cada cifra en el F-07. Está en `docs/hallazgos.md`, sección 12. Las cifras son una
ayuda para el contador, no una declaración presentada.

## Sitio estático del cierre

`npm run sitio` corre la demo en una carpeta temporal y escribe `sitio/`: un `index.html` con el cierre
del día, una página por ticket (líneas, pago, documento, forma de pago y por qué, sello simulado,
atestación con su hash y su lugar en la cadena, y la validación con la generación y el esquema usados),
y una página que explica las dos generaciones de esquemas. Es HTML y un CSS, sin scripts, para leer y
imprimir en el teléfono.

Para el cierre de tus datos reales: `node src/cli.ts web --dia 2026-10-12 --salida sitio`.

`sitio/` no entra al repositorio. `vercel.json` la publica como sitio estático: Vercel corre
`npm run sitio` y sirve la carpeta `sitio`.

## Dos generaciones de esquemas

El tool sabe construir y validar en dos generaciones, y lo elige explícitamente con `--esquemas caso`
o `--esquemas 2026` (o la variable `LEDGER_ESQUEMAS`). Por defecto usa `caso`.

- `caso` (01 v1, 03 v3) es la generación que describe el caso. Sus archivos son una copia de un
  repositorio comunitario, no del Ministerio. Ahí el patrón de la forma de pago rechaza el 11 en 01.
- `2026` (01 v2, 03 v4) es el paquete que el Ministerio publica hoy. Ahí el esquema ya admite el 11;
  el tool lo emite con un aviso, porque el servicio de recepción no se pudo probar.

Además, la reforma municipal cambió los códigos de municipio, y los esquemas `caso` no aceptan la lista
vigente. Detalle y pruebas en `docs/hallazgos.md`, secciones 2 y 4.

## Qué NO hace

- **No transmite al Ministerio.** Sin credenciales de prueba de un contribuyente registrado no es
  posible. `dte transmitir` exige `--simulado`, y el sello que devuelve empieza por `SIMULADO-`.
- **No firma.** No usa el firmador del Ministerio ni hay JWS. El DTE sale sin firma.
- **Los pagos son fixtures construidos a mano**, con la forma documentada por Blink. No hay una cuenta
  real ni se capturó un pago real.
- **La importación de CacaoMarket lee un archivo.** No se conecta a su base de datos ni a la red, y
  solo importa consumidores finales.
- **No calcula el dígito verificador** del NIT ni del NRC. Solo valida el formato.
- **Un solo comerciante**, un solo emisor de prueba, sin credenciales por inquilino.
- **Sin contingencia, invalidación ni eventos.** Tipo de operación 1 siempre.
- **Los libros no son la declaración.** No incluyen compras ni retenciones, no llevan los nombres
  oficiales de columnas que no se pudieron confirmar, y no presentan nada.
- **No verifica el par departamento-municipio** del catálogo vigente (CAT-013).
- **El esquema `caso` no admite** un consumidor de USD 200 o más ni un comprobante de USD 20,000 o más,
  porque exige datos del receptor o de entrega que CacaoLedger no captura. El tool lo dice y no
  construye el documento.
- **Los municipios del esquema `caso`** (18 y 14 en `fixtures/caso/`) vienen de un paquete npm de
  terceros. No se comprobaron contra el catálogo del Ministerio.
- **Sin PDF ni versión legible con QR.**

## Las trampas del caso

- **El patrón `^(0[1-9]||10||99)$` acepta la cadena vacía** por sus alternativas vacías. Un validador
  ingenuo deja pasar `codigo: ""`. Aquí la regla de CacaoLedger lo rechaza en las dos generaciones,
  con prueba.
- **`codigoGeneracion` solo admite mayúsculas.** El constructor escribe en mayúsculas y la prueba rechaza
  un UUID en minúsculas.
- **`numeroControl` tiene tres segmentos después del prefijo.** `DTE-01-M001P001-000000000000001` es la
  forma. La prueba rechaza la de cuatro segmentos que aparece en blogs.
- **`ambiente` es `00` para prueba y `01` para producción.** El valor por defecto es `00`; `01` exige
  `--confirmar-produccion` en el constructor y en el validador.
- **El IVA está incluido en el precio de la factura 01.** El IVA de cada línea es el precio por 13/113,
  redondeado al centavo por línea; los totales son la suma de las líneas. Las pruebas comprueban que
  `totalGravada`, `totalIva` y `montoTotalOperacion` cuadren con las líneas.
- **Bitcoin (11) no se declara en una factura 01 con el esquema `caso`.** La forma de pago pasa a 99,
  con la referencia `BTC-LN|<sats>sat|<tasa>|<hash>`. El tool muestra la falla del esquema y de la regla.

## Lo que sigue

- Transmisión real a la prueba del Ministerio, con un NIT registrado. Hoy el ciclo está simulado.
- Firma con el firmador del Ministerio (SVFE) y el JWS.
- Contingencia (`tipoOperacion` 2) con cola de reenvío.
- Importar pedidos de contribuyentes, con precios sin IVA y datos fiscales del receptor.
- Firma o ancla externa de la cadena de atestaciones (`docs/atestacion.md`).

## Documentos del repositorio

- `docs/hallazgos.md`: lo comprobado contra los esquemas, las dos generaciones, la reforma municipal,
  las decisiones, los libros de IVA y lo que no se pudo confirmar.
- `docs/atestacion.md`: qué prueba la cadena y qué no.
- `docs/importar-market.md`: formato del pedido de CacaoMarket y sus rechazos.
- `esquemas/README.md`: origen y huellas de cada archivo de esquema.
- `fixtures/README.md`: qué es cada dato de prueba.
