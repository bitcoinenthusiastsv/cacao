# Hallazgos de CacaoLedger

Este documento recoge lo que se comprobó contra los esquemas y catálogos, las decisiones de
diseño con su razón, y lo que sigue sin resolver. Cuando un dato no se pudo comprobar, se dice.

## 1. Lo que se comprobó contra los esquemas

Las fuentes están en `esquemas/README.md`. Hay dos generaciones de esquemas, y cada una tiene
un origen distinto:

- **`caso`**: `esquemas/espejo-herson/`. Copia de un repositorio comunitario que no está
  afiliado al Ministerio. Los archivos no se descargaron del Ministerio.
- **`2026`**: `esquemas/ministerio-2026/`. Paquete `svfe-json-schemas.zip` publicado por el
  Ministerio de Hacienda, con fecha de modificación del 27 de julio de 2026.

| Afirmación del caso | Resultado | Evidencia |
|---|---|---|
| `tipoDte` es constante `"01"` en factura y `"03"` en CCF | Confirmado | Ambas generaciones |
| Factura 01 v1: `codigo` con patrón `^(0[1-9]\|\|10\|\|99)$` | Confirmado en v1 | `espejo-herson/DTE-FE-v1.json` |
| CCF 03 v3: `codigo` con patrón `^(0[1-9]\|\|1[0-3]\|\|99)$` | Confirmado en v3 | `espejo-herson/DTE-CCFE-v3.json` |
| Exportación 11 v1: patrón `^(0[1-9]\|\|10\|\|99)$` | Confirmado en el espejo | No descargado del Ministerio; no se usa |
| Factura 01 v2 mantiene el patrón de `codigo` | **No.** `codigo` es `string` o `null`, `maxLength` 2, sin patrón | `ministerio-2026/fe-f-v2.json` |
| CCF 03 v4 mantiene el patrón de `codigo` | **No.** Igual que 01 v2 | `ministerio-2026/fe-ccf-v4.json` |
| El patrón vacío `\|\|` acepta la cadena vacía | Confirmado con Ajv y con JavaScript | `src/dte/caso.test.ts`, `src/validar.test.ts` |
| CAT-017 incluye `11 Bitcoin` y `12 Otras Criptomonedas` | Confirmado | Libro oficial "Catálogos - Facturación Electrónica" (descarga 5353) |
| `tipoMoneda` es `enum ["USD"]` | Confirmado | Las cuatro versiones |
| `montoPago` es `multipleOf: 0.01` | Confirmado | Las cuatro versiones |
| Los ítems de `pagos` tienen `additionalProperties: false` | Confirmado | Las cuatro versiones |
| `referencia` es nulable con `maxLength` 50 | Confirmado | Las cuatro versiones |
| `codigoGeneracion` solo admite hexadecimal en mayúsculas | Confirmado | Las cuatro versiones |
| `numeroControl` tiene tres segmentos tras el prefijo | Confirmado | v1 y v3 `[A-Z0-9]{8}`; v2 y v4 `[MBSP]\d{3}P\d{3}` |
| `ambiente` es `"00"` o `"01"` | Confirmado | Enum en las cuatro versiones |
| Hacienda rechaza `codigo` 11 en un 01 | **No verificado.** El esquema caso lo bloquea; el esquema 2026 no. Lo que haga el servicio del Ministerio no se puede comprobar sin credenciales de prueba | Esquemas |
| La Normativa v2.0 es obligatoria desde el 1 de diciembre de 2026 | **No verificado por el Ministerio.** Lo dice el README del espejo: "La Normativa v2.0 (25 de mayo de 2026) es obligatoria desde el 1 de diciembre de 2026" | README del espejo, consultado el 13 de octubre de 2026 |

**Corrección al caso (se mantiene).** El defecto del patrón es real, pero está en 01 v1 y 03 v3.
El paquete que el Ministerio publica hoy trae 01 v2 y 03 v4, y en esas versiones el esquema no
restringe `codigo`. Si el servicio del Ministerio rechaza el 11 en 01, eso no se puede comprobar
desde este repositorio.

## 2. Dos generaciones de esquemas

El setting es `--esquemas caso|2026` o la variable `LEDGER_ESQUEMAS`. El valor por defecto es
`caso`, porque es la generación que describe el caso y la que el sistema de esquemas del espejo
describe como vigente. El valor explícito gana a la variable de entorno.

| | `caso` | `2026` |
|---|---|---|
| Factura 01 | `version` 1, `esquema` `espejo-herson/DTE-FE-v1.json`, SHA-256 `748673c0f2d45d84e6b13a21d2ba411eb731ce199eb946dc33ca9b995571f0c1` | `version` 2, `esquema` `ministerio-2026/fe-f-v2.json`, SHA-256 `2887ff3ccf5594eb1f49dcec1ce8bba134a86462f900069de1365d18ff997aff` |
| CCF 03 | `version` 3, `esquema` `espejo-herson/DTE-CCFE-v3.json`, SHA-256 `dec029ecec57015c17f5e96f36a55321cb61b8433e1e410b08330502fc1f3740` | `version` 4, `esquema` `ministerio-2026/fe-ccf-v4.json`, SHA-256 `2c2db8b3f6144bdd0d128ec2babecd38f277f8493458a06cf1b2be7b816fba32` |
| Forma de pago Lightning en 01 | `99` con referencia `BTC-LN`; `11` lo rechaza el esquema y la regla | `11`, con aviso de que la recepción no fue probada |
| Código vacío o nulo | Rechazado por la regla de CacaoLedger (en 01 y 03 de las dos generaciones) | Igual |
| Códigos permitidos en 01 | `01 02 03 04 05 08 09 99` | Todo CAT-017 salvo `10` (que CAT-017 no tiene) |
| Códigos permitidos en 03 | `01 02 03 04 05 08 09 11 12 13 99` | Todo CAT-017 salvo `10` |
| Emisor | Requiere `tipoEstablecimiento` (CAT-009) y lo usa de `fixtures/caso/emisor.json` | No lo admite; `fixtures/emisor.json` |
| Municipios | Lista anterior a la reforma (sección 4) | Lista posterior a la reforma |

La versión de cada documento está en `identificacion.version`. `generacionDeDocumento` lo lee
de ahí y la recepción simulada valida cada documento con su propia generación.

**Diferencias de forma que el constructor maneja (cada una tiene prueba en `src/dte/caso.test.ts`):**

1. `identificacion.version`: 1, 3 en `caso`; 2, 4 en `2026`.
2. `numeroControl`: `caso` acepta cuatro caracteres alfanuméricos en cada código; `2026` exige
   `M001`/`P001`. El patrón de v2 y v4 (`^DTE-0x-(M|B|S|P)([0-9]{3})(P)([0-9]{3})-[0-9]{15}`) no
   tiene `$` final; la longitud fija de 31 caracteres lo cierra en la práctica.
3. `horEmi` de v2 y v4 agrega `(?!.*[\r\n])`. No cambia el resultado con los datos de CacaoLedger.
4. `emisor`: en `caso` aparecen `tipoEstablecimiento` (obligatorio en v1 y v3) y `codEstableMH`
   y `codPuntoVentaMH` (obligatorios en v3, nulos en v1). En `2026` no aparecen.
5. `direccion` (emisor y receptor): `distrito` existe en v2 y v4 y no existe en v1 y v3
   (`additionalProperties: false`). `caso` lo omite.
6. `extension` en la raíz: obligatorio en v1 (cuatro claves) y en v3 (seis claves). `2026` no lo
   admite. Todas las claves van en `null`.
7. `resumen` del 01: v1 exige `ivaRete1` y `reteRenta` y no admite `ivaRete` ni `observaciones`.
   v2 exige `ivaRete` y `observaciones`.
8. `resumen` del 03: v3 exige `ivaPerci1`, `ivaRete1` y `reteRenta`, y no admite `ivaPerci`,
   `ivaRete`, `totalIva` ni `observaciones`. v4 exige `ivaPerci`, `ivaRete` y `observaciones`.
9. Umbral del 01 en v1 (raíz `allOf`): desde USD 200 de `montoTotalOperacion` el receptor es
   obligatorio. El constructor no puede inventar los datos del receptor de un ticket de
   consumidor, así que **refusa** construir ese documento en `caso` y lo dice con esa razón.
   v2 no tiene esta condición.
10. Umbral del 03 en v3 (raíz `allOf`): desde USD 20,000 la `extension` lleva nombres y documentos
    de entrega como cadenas. CacaoLedger no captura esos datos; el constructor **refusa** ese
    caso en `caso`. v4 no tiene esta condición.
11. Direcciones en v1 y v3: `allOf` por departamento que restringe `municipio` (sección 4). v2
    y v4 no tienen ese `allOf`.
12. Longitud de `descripcion` en el ítem: 1000 en v1 y v3, 1500 en v2 y v4. Los textos de los
    fixtures son cortos; el constructor no los recorta.
13. `codigo` en `resumen.pagos[]`: patrón en v1 y v3; `string` o `null` sin patrón en v2 y v4.
14. Correos: v1 y v3 tienen `format: email` en el emisor; v3 hace obligatorio `correo` del
    receptor como cadena no nula.

Hay 229 diferencias brutas entre la factura v1 y la v2 al comparar los dos archivos. La mayoría
son descripciones, `title` y orden de `required`. La lista de arriba es lo que cambia la forma de
lo que el constructor escribe o lo que la validación exige.

**Corrección a la sección anterior de este documento.** Antes se decía que el CCF v4 limita
`resumen.pagos` a tres elementos. **Es falso.** El `maxLength: 3` está sobre el objeto de
`items`, y `maxLength` solo aplica a cadenas, así que no limita nada. El arreglo no tiene
`maxItems`. Comprobado con Ajv: un CCF v4 con cuatro pagos se acepta. La regla de CacaoLedger
tampoco lo limita.

## 3. Reglas de CacaoLedger (capa adicional)

El validador informa dos capas por separado: "Esquema" (el archivo de la generación elegida) y
"Regla adicional de CacaoLedger". Además hay avisos, que nunca hacen fallar un documento.

1. **Código de pago permitido por tipo y generación** (sección 2).
2. **Código vacío o nulo.** Se rechaza en las dos generaciones. El patrón de v1 y v3 acepta la
   cadena vacía por sus alternativas vacías; v2 y v4 aceptan `null` y cadenas cortas.
3. **Código 11 (y 12) en factura 01.** En `caso` se rechaza con un mensaje propio. En `2026` no se
   rechaza: se emite un aviso de que la recepción del Ministerio no fue probada con ese código.
4. **Ambiente "01".** Se rechaza sin `--confirmar-produccion`.
5. **Al menos un pago.** `resumen.pagos` no puede estar vacío.
6. **Aritmética.** Los totales deben coincidir con las líneas al centavo. El IVA del 01 se
   recalcula con 13/113 por línea. El IVA del 03 se recalcula con el 13 % del neto por línea.
   La suma de `montoPago` debe ser igual a `totalPagar`.

Estas reglas no sustituyen al esquema. Son lo que el esquema no dice, o lo que dice distinto
según la generación.

## 4. El cambio de municipios: la reforma municipal contra los esquemas caso

**Evidencia (publicada, no del Ministerio):**

- En `espejo-herson/DTE-FE-v1.json` y `DTE-CCFE-v3.json`, el emisor y el receptor tienen un
  `allOf` por departamento que limita `municipio`. Para el departamento `05` (La Libertad) el
  patrón es `^0[1-9]|1[0-9]|2[0-2]$`: los códigos 01 a 22. Para el `06` (San Salvador) es
  `^0[1-9]|1[0-9]$` en v3 y en v1: los códigos 01 a 19. Comprobado con Ajv: el código `27` falla y
  el `09` pasa para el departamento `05`.
- El paquete `seedcode-catalogos-mh`, versiones `1.0.0` a `7.0.0`, lista para `05` los
  municipios 01 a 22 (incluido `18 TAMANIQUE`) y para `06` los 01 a 19 (incluido `14 SAN
  SALVADOR`). Desde la versión `8.0.0` lista para `05` los códigos 23 a 28 (`23 LA LIBERTAD
  NORTE`, … `27 LA LIBERTAD COSTA`, … `28 LA LIBERTAD SUR`) y para `06` los 20 a 24 (`23 SAN
  SALVADOR CENTRO`). La versión `8.2.0`, usada como referencia en el resto del proyecto, tiene la
  lista posterior.
- El paquete es un tercero. No es el catálogo del Ministerio, y no se encontró el catálogo oficial
  anterior ni su fecha.

**Lo que es inferencia:** que el cambio de numeración sea la reforma municipal de 2024 que
redujo los municipios del país. El paquete cambia entre las versiones 7.0.0 y 8.0.0, y el
esquema caso lo refleja; la causa es probable pero no está verificada en un documento oficial
en este trabajo.

**Consecuencia.** Un contribuyente en un municipio fusionado (por ejemplo Tamanique, que ahora
forma parte de La Libertad Costa) no puede pasar la validación `caso` con su código actual. El
esquema `caso` no puede expresar la lista municipal vigente. El esquema `2026` sí.

**Lo que hace CacaoLedger.** Los fixtures de `caso` (`fixtures/caso/`) usan los códigos anteriores
a la reforma: `05` `18` (Tamanique) y `06` `14` (San Salvador). Vienen del paquete de terceros de
arriba y no se pudieron comprobar contra el catálogo antiguo del Ministerio. Se marcan así en el
README de fixtures, en la salida de la demostración y en este documento. El fixture del receptor
de `2026` sigue con `23` y `27`.

## 5. Versiones y decisiones de numeración

- La generación por defecto es `caso`: emite `version` 1 en 01 y 3 en 03.
- `numeroControl` = `DTE-{tipo}-{codEstable}{codPuntoVenta}-{correlativo de 15 dígitos}`. Con el
  emisor de `caso`: `DTE-01-M001P001-000000000000001`. El emisor de caso usa `M001`/`P001`;
  `caso` admite cualquier código de cuatro alfanuméricos, `2026` exige `M/B/S/P` más tres dígitos.
- El correlativo se guarda por serie en `datos/correlativos.json`. Solo avanza cuando el documento
  pasa la validación, para no dejar huecos.
- `codigoGeneracion` se genera en mayúsculas. Con `LEDGER_SEMILLA` se deriva de la semilla, el
  ticket y el `numeroControl`; sin semilla, de `randomUUID`.
- `ambiente` es `"00"` por defecto. `"01"` exige `--confirmar-produccion`.
- `fecEmi` y `horEmi` se escriben en la hora de El Salvador (UTC-6, sin horario de verano).

## 6. Redondeo del dinero

**Regla elegida: el redondeo se hace por línea.** El IVA de cada línea se redondea al centavo
(mitad hacia arriba). Los totales son la suma de las líneas ya redondeadas.

- Factura 01 (precio con IVA incluido): IVA de línea = redondeo de `bruto × 13 / 113`.
  `totalGravada` = suma del bruto. `totalIva` = suma del IVA de línea. `subTotal`,
  `montoTotalOperacion` y `totalPagar` = `totalGravada`.
- CCF 03 (precio neto): neto de línea = `cantidad × precio`. IVA de línea = redondeo de `neto × 13 %`.
  `totalGravada` = suma de netos. `tributos[20].valor` = suma del IVA.
  `montoTotalOperacion` = `totalPagar` = neto + IVA.

**Por qué por línea.** Un auditor recalcula cada línea con la calculadora y obtiene el mismo
centavo. Además, la factura 01 lleva `ivaItem` por línea.

**Hallazgo: un mismo precio no siempre da el mismo total en 01 y en 03.** Si el neto se deriva del
precio con IVA y el IVA del 03 se recalcula sobre ese neto, el resultado coincide en 13,280 de
15,005 casos y difiere en un centavo en 1,725 (precios de $0.00 a $30.00, cantidades de 1 a 5).
Los precios múltiplos de $1.13 siempre coinciden. Por eso la herramienta no convierte el precio de
un ticket de consumidor en un 03. Para "la misma venta" en 01 y en 03, la demostración usa precios
múltiplos de $1.13 (`fixtures/ticket-consumidor.json` y `fixtures/ticket-contribuyente.json`, ambos
por $4.52).

## 7. Por qué 99 en `caso` y 11 en `2026`

| Código | Qué diría en la factura | Veredicto |
|---|---|---|
| 01 Billetes y monedas | Que se pagó en efectivo | Falso |
| 02, 03 Tarjetas | Que se pagó con tarjeta | Falso |
| 04 Cheque, 05 Transferencia | Otro medio bancario | Falso |
| 08 Dinero electrónico, 09 Monedero electrónico | Dinero electrónico de un emisor regulado | No describe un pago en bitcoin |
| 11 Bitcoin | Lo que pasó | En `caso`: bloqueado por el patrón v1 y por la regla. En `2026`: permitido, con aviso |
| 12 Otras criptomonedas | Lo que pasó, en otro término | Igual que 11 |
| 13 Cuentas por pagar del receptor, 14 Giro bancario | Otra modalidad | Falso |
| **99 Otros (se debe indicar el medio de pago)** | Que el medio es otro, y que se indica en la referencia | **Verdadero y permitido en las dos generaciones** |

El texto oficial de 99 pide indicar el medio de pago. La referencia lo hace, y la referencia lleva
el monto en sats y la tasa.

## 8. Convención de la referencia (50 caracteres)

Formato: `BTC-LN|<sats>sat|<USD por BTC>|<12 primeros hexadecimales del payment hash>`

Ejemplo real del código de prueba: `BTC-LN|12236sat|36940.18|bf6b61f814b2` (37 caracteres).

- **Sats recibidos.** Es lo que realmente llegó, no lo que se facturó en dólares.
- **Tasa USD por BTC.** Es la base del monto en dólares.
- **12 hexadecimales del payment hash.** Es el enlace a la atestación de la tasa, que tiene el
  hash completo. Doce caracteres son 48 bits: para un comercio pequeño la colisión es despreciable.
- **Prefijo `BTC-LN`.** Un lector ve el riel sin conocer el código del esquema.

Alternativas descartadas: la fecha y hora (ya viajan en `fecEmi` y `horEmi`), el nombre del
proveedor del pago, el hash completo (no cabe), el monto en dólares (ya está en `montoPago`).

## 9. Atestación de tasa, cierre y recepción simulada

- **Atestación.** Lo que el DTE no puede guardar: sats, USD en centavos, tasa, fuente de la tasa,
  momento del pago, hash del pago, ticket, `codigoGeneracion`, `numeroControl`, código de forma de
  pago emitido y referencia. Se escribe una sola vez por (ticket, `codigoGeneracion`) cuando se
  construye el documento de un pago Lightning. Cada registro lleva el hash del anterior. Ver
  `docs/atestacion.md`.
- **Recepción simulada.** `src/recepcion-simulada.ts`. Valida con la misma generación del documento y
  acepta solo documentos de prueba (`ambiente` `00`). Su sello empieza por `SIMULADO-` y no lo emitió
  ningún servicio del Ministerio.
- **Cierre diario.** `src/cierre.ts`. Agrupa cada ticket en uno de cuatro grupos: emitidos,
  huérfanos, con plazo de 24 horas y abiertos. Un DTE rechazado va al grupo de plazo mientras no se
  reenvíe; los huérfanos son cobros sin documento (nunca construido, o construido sin transmitir).
  La pregunta final cuenta huérfanos y plazos juntos.

## 10. Pagos y webhook de Blink

- La forma del webhook sale de <https://dev.blink.sv/api/webhooks>. Los archivos de `fixtures/` están
  construidos a mano con esa forma. No se capturó ningún pago real.
- El ejemplo documentado tiene `settlementDisplayPrice` con `offset` 12, que no cuadra con sus propios
  montos. La herramienta no lee `settlementDisplayPrice`: calcula la tasa como
  `settlementDisplayAmount / settlementAmount`.
- Un mismo payment hash no puede cubrir dos tickets. La CLI lo rechaza.

## 11. Lo que no está hecho o no se pudo comprobar

- **Transmisión real, firma, contingencia e invalidación.** No están implementados. El sello del
  ciclo de prueba es simulado.
- **Municipios del esquema `caso`.** Ver la sección 4. Los códigos de `fixtures/caso/` son de un
  paquete de terceros, no del Ministerio.
- **Catálogo de municipios vigente (CAT-013) en `2026`.** La herramienta valida el formato, no el par
  departamento-municipio.
- **NIT y NRC.** Se valida el formato. El dígito verificador no se comprueba.
- **`distrito`.** Es texto libre en los esquemas. Se toma tal cual.
- **Catálogos.** Los códigos usados se comprobaron a mano contra el libro oficial de CAT-011, CAT-014,
  CAT-015, CAT-016, CAT-017 y CAT-019. CAT-009 (`02` casa matriz, para `tipoEstablecimiento`) se
  tomó del paquete `seedcode-catalogos-mh` 8.2.0 porque el libro oficial no está en el repositorio;
  esa comprobación es de tercero.
- **Semántica de los totales en 01.** Se tomó como convenio que `totalGravada` y `montoTotalOperacion`
  incluyen el IVA. El manual funcional del Ministerio no se descargó para confirmarlo.
- **Receptor de consumidor de USD 200 o más en `caso`, y datos de entrega de USD 20,000 o más en 03.**
  El constructor refusa estos casos; CacaoLedger no captura esos datos.
- **MTIST 2.0, §6.4.** No se revisó.
- **Pagos reales.** Ningún dato proviene de una cuenta real de Blink.
