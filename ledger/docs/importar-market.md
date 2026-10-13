# Importar un pedido de CacaoMarket

`ledger importar market <archivo.json>` lee un pedido pagado y crea un ticket pagado con sus
líneas y su pago. El comando lee un archivo: no se conecta a la base de datos de CacaoMarket ni
a la red. Producir ese archivo desde la base de datos es un paso aparte, que todavía no existe.

El archivo de ejemplo es `fixtures/market-orden-1042.json`: dos productos de una tienda de
Suchitoto pagados por Lightning.

## Formato

Un objeto JSON con estos campos. Ningún otro campo se acepta: un nombre mal escrito hace fallar
la importación en lugar de perderse en silencio.

| Campo | Tipo | Notas |
|---|---|---|
| `formato` | texto | Siempre `"cacaomarket-orden/1"`. |
| `numero` | texto | Número del pedido en CacaoMarket, de 1 a 20 letras, números o guiones. Identifica el pedido. |
| `pagadaEn` | texto | Momento del pago en ISO-8601 con zona, por ejemplo `"2026-10-12T18:22:00.000Z"`. |
| `tipoCliente` | texto | Opcional. Solo `"consumidor"` (es el valor por defecto). |
| `lineas` | lista | Una o más líneas, ver abajo. |
| `totalCentavos` | entero | Total del pedido en centavos de dólar. Debe ser la suma de las líneas. |
| `pago` | objeto | El pago, ver abajo. |

Cada línea:

| Campo | Tipo | Notas |
|---|---|---|
| `descripcion` | texto | No vacía. |
| `cantidad` | entero | Mayor que cero. |
| `precioCentavos` | entero | Precio unitario en centavos, **con IVA incluido**, como lo ve el consumidor. Mayor que cero. |

El pago tiene dos formas.

Por Lightning:

```json
"pago": {
  "riel": "lightning",
  "sats": 48051,
  "tasaUsdPorBtc": "36939.92",
  "tasaFuente": "Blink receive.lightning: settlementDisplayAmount / settlementAmount",
  "paymentHash": "6cceee99be38297f789659390dd3f6f042be99fffd2036287a77a99e980436e0"
}
```

- `sats` es lo que llegó, entero mayor que cero.
- `tasaUsdPorBtc` es texto con dos decimales. Tiene que cuadrar con el total y los sats: la
  importación calcula la tasa como `total × 100 000 000 / sats` (redondeo medio hacia arriba, a
  centavos) y rechaza el pedido si no coincide.
- `tasaFuente` dice de dónde salió la tasa. Va a la atestación.
- `paymentHash` tiene 64 caracteres hexadecimales en minúscula. Es la referencia del pago: un
  mismo hash no puede cubrir dos tickets.

En efectivo:

```json
"pago": { "riel": "efectivo" }
```

## Qué se rechaza

Cada rechazo es una frase, y no se crea ningún ticket:

- formato distinto de `cacaomarket-orden/1`, o un campo desconocido en el pedido, una línea o el pago;
- número de pedido vacío o con caracteres no permitidos;
- fecha de pago sin zona horaria o que no es ISO-8601;
- líneas vacías, con cantidad o precio que no sean enteros mayores que cero (los negativos
  también, y el cero);
- total que no es la suma de las líneas (`La suma de las líneas es $17.75 y el total del pedido
  dice $18.00; no cuadran.`);
- pago ausente, riel distinto de `lightning` o `efectivo`, o sats, tasa o hash mal formados;
- tasa que no cuadra con el total y los sats;
- un pedido de contribuyente: necesita precios sin IVA y los datos fiscales del receptor, que
  este formato todavía no trae. Esas ventas se cargan con `ticket nuevo --cliente contribuyente`;
- un pago de Lightning que ya cubre otro ticket.

## Idempotencia

El ticket guarda el número del pedido (`origen`). Si se importa el mismo pedido otra vez, el
comando no crea otro ticket y dice cuál es el existente. Si el número ya existe pero el contenido
es distinto (otras líneas, otro total o otro pago), la importación se rechaza: un pedido con el
mismo número no puede cambiar en silencio.

## Qué sigue después

El ticket importado queda pagado. A partir de ahí es igual que cualquier otro: `dte construir`
genera el 01, que produce la atestación de la tasa, y `dte transmitir --simulado` le da su sello
simulado.
