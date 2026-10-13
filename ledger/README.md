# CacaoLedger

CacaoLedger toma una venta pagada y produce el documento tributario electrónico (DTE) de El Salvador:
factura 01 para consumidor final o comprobante de crédito fiscal 03 para contribuyente. Registra
cómo se pagó cada venta y guarda en una cadena de registros lo que el DTE no puede contener, como la
tasa de un pago en bitcoin.

Es parte del grupo Cacao (CacaoMedia, CacaoTravel, CacaoMarket, CacaoPay). Una orden de CacaoMarket
puede convertirse en ticket; ese paso todavía no existe.

## Requisitos y arranque

Necesitás Node 24 y nada más. Node 24 ejecuta TypeScript directamente.

```
npm install
npm test
npm run demo
```

`npm install` baja solo `ajv`, `ajv-formats`, `typescript` y los tipos de Node. `npm test` corre las pruebas. `npm run
demo` muestra el recorrido completo con datos de prueba, con reloj fijo y sin red. Para la otra
generación de esquemas: `npm run demo -- --esquemas 2026`.

El uso diario es `node src/cli.ts ayuda`. Los datos viven en `datos/`, que no entra al repositorio.

## Los seis puntos del caso

| # | Punto | Estado | Cómo se muestra |
|---|---|---|---|
| 1 | Ticket con líneas, IVA del 13 % incluido y tipo de cliente (01 o 03) | Hecho | `node src/cli.ts ticket nuevo --desde fixtures/ticket-consumidor.json` y `node src/cli.ts ticket ver <id>` |
| 2 | Pago en dos rieles, uno Lightning (webhook de Blink) y otro efectivo | Hecho, desde fixtures | `node src/cli.ts pagar <id> --blink fixtures/blink-receive-lightning.json` y `node src/cli.ts pagar <id> --efectivo` |
| 3 | DTE 01 y 03 válidos, con la forma de pago del riel que liquidó | Hecho | `node src/cli.ts dte construir <id>` |
| 4 | Validación contra los esquemas oficiales, con falla legible del código 11 en 01 | Hecho | `node src/cli.ts dte construir <id> --forzar-codigo 11`, y con `--esquemas 2026` para ver el aviso |
| 5 | Atestación de tasa, enlazada y encadenada | Hecho | `node src/cli.ts atestacion ver <id>`, `node src/cli.ts atestacion verificar` |
| 6 | Cierre diario por grupos y pregunta final | Hecho | `node src/cli.ts cierre` (`node src/cli.ts cierre --ayuda` explica el plazo) |

Además: `node src/cli.ts dte transmitir <id> --simulado` completa el ciclo con un sello simulado, y
`npm run demo` lo muestra de principio a fin.

Cuando un comando pide `<id>`, usá el identificador que imprimió el paso anterior (`TK-AAAAMMDD-XXXX`).
En el orden del punto 4, corré primero el comando forzado: un ticket con documento ya no admite una
segunda construcción.

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
- **No calcula el dígito verificador** del NIT ni del NRC. Solo valida el formato.
- **Un solo comerciante**, un solo emisor de prueba, sin credenciales por inquilino.
- **Sin contingencia, invalidación ni eventos.** Tipo de operación 1 siempre.
- **No exporta libros de IVA ni F-07.** Eso es el siguiente paso.
- **No importa pedidos de CacaoMarket.** Hoy los tickets se crean desde archivo o desde la línea de comandos.
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
- Libros de IVA y los datos de F-07 y F-14, generados desde los tickets.
- Importar pedidos de CacaoMarket como tickets.
- Firma o ancla externa de la cadena de atestaciones (`docs/atestacion.md`).

## Documentos del repositorio

- `docs/hallazgos.md`: lo comprobado contra los esquemas, las dos generaciones, la reforma municipal y
  las decisiones.
- `docs/atestacion.md`: qué prueba la cadena y qué no.
- `esquemas/README.md`: origen y huellas de cada archivo de esquema.
- `fixtures/README.md`: qué es cada dato de prueba.
