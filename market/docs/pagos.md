# Pagos en CacaoMarket

CacaoMarket no custodia dinero. El comprador paga en bitcoin por Lightning, y el pago llega a la billetera del vendedor. La aplicación crea la solicitud de pago, la muestra, detecta cuándo se pagó, y registra la orden como pagada. En la versión de demostración, los pagos son simulados: no se mueve dinero real.

El cobro tiene tres piezas:

- **El adaptador** (`src/lib/pagos/`) crea la solicitud de pago en el proveedor y consulta si se pagó.
- **La base de datos** guarda la solicitud (`cobros`) y decide si la orden cambia de estado (`confirmar_pago`, `expirar_ordenes`).
- **La pantalla** (`src/app/ordenes/[id]/pagar/`) muestra la factura o la dirección, y consulta el estado cada pocos segundos.

Este documento describe cómo funciona hoy y, al final, qué cambiaría para aceptar pagos reales. Las reglas generales de escritura están en [arquitectura.md](arquitectura.md).

## El contrato: `ProveedorDePago`

Todo adaptador implementa esta interfaz (`src/lib/pagos/proveedor.ts`):

```ts
export interface ProveedorDePago {
  crearCobro(input: { sats: number; memo: string; expiraEnSeg: number }): Promise<Cobro>;
  consultarCobro(cobro: {
    referencia: string | null;
    verificarUrl: string | null;
    expiraEn: Date;
  }): Promise<'pendiente' | 'pagado' | 'expirado'>;
}

export type Cobro = {
  referencia: string | null;
  bolt11: string | null;
  destino: string | null;
  verificarUrl: string | null;
  expiraEn: Date;
};
```

`crearCobro` pide una solicitud por el monto exacto en sats. `consultarCobro` dice si esa solicitud se pagó. Ni la base de datos ni la pantalla saben qué proveedor hay detrás: solo usan estos dos métodos.

## Adaptadores

`proveedorPara(negocio)` (en `src/lib/pagos/index.ts`) elige el adaptador según `negocios.tipo_proveedor_pago`.

| Tipo | Estado | Qué hace |
|---|---|---|
| `manual` | Implementado (`manual.ts`) | Usa la Lightning Address del vendedor. Pide una factura por LNURL-pay por el monto exacto. Si la factura se pudo pedir, la pantalla muestra la factura. Si no, muestra la dirección y el monto, y el vendedor confirma el pago a mano. Si la factura trae una URL de verificación (LUD-21), el estado se consulta solo. |
| `falso` | Implementado (`falso.ts`), solo demostración | Genera una factura falsa (`lnbcfalso` más una referencia). No consulta ninguna red. El pago se confirma con `simularPago`, y la pantalla muestra el botón de simulación. |
| `nwc` | Solo nombrado | Existe en el enum de la base y en la columna de credenciales, pero `proveedorPara` lanza `NO_DISPONIBLE`. |
| `blink` | Solo nombrado | Igual que `nwc`. |

Un negocio con `manual` y sin Lightning Address válida no puede cobrar: `proveedorPara` lanza `SIN_DIRECCION`. Ningún flujo de la aplicación cambia el tipo de proveedor de un negocio. Todos los negocios nuevos nacen con `manual`, y la demostración los deja en `falso`.

En `manual.ts`, `pedirFactura` nunca lanza: si la dirección no responde, la solicitud sale sin factura, y la pantalla muestra la dirección. La consulta a la dirección sigue las reglas de `fetchSeguro` (solo https, sin IP privadas, sin redirecciones; ver [arquitectura.md](arquitectura.md#decisiones-de-seguridad)).

## Cómo se crea una solicitud de pago

### Pedido de productos

1. `crearPedido` llama a `crear_orden`. La orden nace en `creada`, con `total_sats` ya calculado.
2. Enseguida llama a `asegurarCobro(ordenId)`. Si ya hay un cobro, no hace nada. Si la orden no está `creada`, responde `ESTADO_INVALIDO`.
3. `asegurarCobro` llama a `proveedorDe(negocio).crearCobro({ sats, memo, expiraEnSeg: 600 })`, con los sats de la orden tal cual están guardados.
4. Con la respuesta del adaptador, llama a `registrar_cobro`, que guarda el cobro y pasa la orden a `esperando_pago`.

Si el adaptador falla (sin factura o sin dirección válida), la orden queda en `creada`. La pantalla de pago vuelve a pedir la solicitud al abrirse (`asegurarCobro`), y ofrece un botón de reintento (`reintentarCobro`). Si nadie la pide, `expirar_ordenes` vence la orden a los 10 minutos y devuelve el stock.

### Trabajo

Un trabajo recibe la solicitud cuando el vendedor lo marca como hecho (`hecha`). Lo hace `asegurarCobroDeTrabajo`, que es una variante de la anterior:

1. Toma el precio del bitcoin de ese momento y lo redondea a centavos, igual que lo guarda la base.
2. Calcula los sats con `usdCentavosASats` (la misma fórmula que la base).
3. Crea la solicitud con el adaptador del negocio.
4. Llama a `registrar_cobro_servicio`, que vuelve a calcular los sats con la cotización que recibe, reemplaza el cobro anterior si lo hay, y pasa el trabajo a `esperando_pago`.

Si el precio del bitcoin no está disponible, el trabajo queda en `hecha` y devuelve `SIN_COTIZACION`.

## Cómo se muestra

`/ordenes/[id]/pagar` es una página del servidor. Revisa que la persona sea el comprador, lee el estado (`estadoDePago`) y, si la orden no está en un estado pagable, la redirige a la orden. En un pedido de productos, y si la persona ya tiene cookie de visita, registra el evento `vio_pago`. Después renderiza `PagoCliente`, que muestra:

- **QR** de la factura, o de la dirección si no hay factura. Se dibuja en el navegador con la biblioteca `qrcode`.
- **Botones de copia:** "Copiar factura", "Copiar dirección" y "Copiar monto" (en sats). Usan `navigator.clipboard`.
- **Cuenta regresiva** que se actualiza cada segundo. Con menos de un minuto, la pantalla lo dice en el texto.
- **Montos en sats y en dólares**, juntos.
- Si el plazo se cumple, la pantalla vuelve a consultar el estado y muestra la orden como expirada.

La pantalla se actualiza de dos maneras:

- Consulta el estado con `estadoDePagoAccion` cada 3 segundos, mientras la pestaña esté visible. Al volver a mostrarse, consulta de inmediato.
- Escucha los cambios (`UPDATE`) de la orden por Realtime. Cada cambio dispara una lectura nueva.

El estado lo decide el servidor. Por eso el navegador no tiene forma de marcar una orden como pagada.

## Cómo se detecta el pago

Hay tres caminos. Los tres terminan en `confirmar_pago`.

1. **Verificación automática (`manual` con LUD-21).** Cada consulta de la pantalla llama a `verificarPago`, que pide la URL de verificación de la factura. Si la respuesta dice `settled: true`, el servidor llama a `confirmarPagoEnBD(ordenId, null, sesión)`. Un error de la consulta cuenta como "todavía no pagado", y la siguiente consulta lo vuelve a intentar.
2. **Confirmación del vendedor (`manual`).** Si la dirección no tiene verificación, el vendedor ve el botón "Confirmar pago" en la orden, y lo usa cuando le llega el dinero. La acción llama a `confirmarPagoManual`, que pasa el actor del vendedor a `confirmar_pago`. Solo aparece para el tipo `manual`.
3. **Simulación (`falso`).** El botón de la pantalla llama a `simularPago`, que confirma el pago. Solo funciona si el cobro es del tipo `falso`. Para cualquier otro tipo responde `NO_PERMITIDO`.

Cuando el pago se confirma de un pedido de productos, se registra el evento `pago` del embudo. La sesión es la de la visita, o `orden-<id>` si la confirmó el vendedor o el sistema.

## Vencimiento

- **Solicitud:** vence a los 600 segundos desde que se creó (`SEGUNDOS_COBRO`). El adaptador `manual` usa su propio reloj para esto; no lee la fecha de la factura Lightning.
- **Pago fuera de plazo:** `confirmar_pago` lo rechaza con `FUERA_DE_PLAZO`. El vencimiento gana aunque el proveedor diga que se pagó: así un pago tardío nunca marca la orden como pagada.
- **Pedido de productos:** `expirar_ordenes` lo pasa a `expirada`, marca el cobro como `expirado` y devuelve el stock. Las consultas de la pantalla llaman antes a `barrer()`, así que la orden se actualiza cuando alguien la mira.
- **Trabajo:** `expirar_ordenes` lo devuelve a `hecha`. La persona que lo contrató ve "Generar otra solicitud". Esa solicitud usa la cotización del momento, porque el monto en sats puede cambiar y nunca se renueva sola.
- **Pantalla:** si el plazo se cumple mientras la página está abierta, la pantalla muestra la orden como expirada antes de que la base se actualice.

## Cancelación

- **Pedido de productos:** el comprador lo cancela mientras está `creada` o `esperando_pago`. `cancelar_orden` marca el cobro como `cancelado`, devuelve el stock y pasa la orden a `cancelada`. Un pago que llega después no se confirma, porque la orden ya no está en `esperando_pago`.
- **Pedido ya pagado:** no se cancela. El comprador abre una disputa.
- **Trabajo:** se cancela mientras está `acordada`, antes de que exista una solicitud. Desde `esperando_pago` no se puede cancelar.

## Cuándo se fijan los sats

| Caso | Cuándo se fijan | Cotización |
|---|---|---|
| Pedido de productos | Al crear la orden (`crear_orden`). Después no cambian. | La del momento de confirmar el carrito. |
| Trabajo de precio fijo | Al contratar (`contratar_servicio`) es provisional. Se vuelven a calcular al pedir el pago (`registrar_cobro_servicio`), y esos son los que valen. | Al contratar, y después la del pedido de pago. |
| Trabajo cotizado | Al aceptar la cotización (`aceptar_cotizacion`) es provisional. Se fijan al pedir el pago. | La del pedido de pago. |

En un trabajo, el monto que ve la persona cambia hasta que se pide el pago. Desde ese momento, el monto y la cotización no cambian hasta que venza la solicitud.

La comisión teórica del 1 % (`comision_teorica_sats`) se calcula y se guarda en la orden, pero ningún flujo la cobra.

## Precio del bitcoin

Lo calcula `cotizacionUsdBtc` (`src/lib/precio/fuente.ts`):

- **Fuentes:** Coinbase (precio spot de BTC-USD) y Kraken (último precio de XBTUSD). Cada una tiene un límite de 4 segundos.
- **Tolerancia:** si las dos responden y difieren más del 2 % respecto del precio más bajo, no se crea ninguna orden nueva. Si responde una sola, se usa esa. Si no responde ninguna, tampoco se crea orden.
- **Precio:** el promedio de las dos, redondeado a centavos.
- **Caché:** 60 segundos, en memoria del proceso del servidor. En Vercel cada instancia tiene la suya.
- **Precio fijo:** si `PRECIO_FIJO_USD_BTC` tiene un número positivo, se usa siempre ese precio, sin consultar nada. El archivo `.env.example` lo fija en 100000 para el trabajo local.

Lo que ve la persona es el resultado del servidor. Si no hay precio, la aplicación responde `SIN_COTIZACION` con un mensaje para volver a intentar, y no crea orden.

**Conversión:** `sats = ceil(centavos × 1,000,000 / cotización)`. Por ejemplo, $3.50 con una cotización de 100,000 USD por BTC: 350 × 1,000,000 / 100,000 = 3,500 sats. Redondear hacia arriba significa que el vendedor nunca recibe menos que el precio en dólares.

## Idempotencia: por qué no se confirma dos veces

Ningún pago se confirma dos veces, por tres mecanismos independientes:

1. **La orden no se duplica.** La pantalla de carrito manda una clave que se guarda en `sessionStorage` por tienda. `crear_orden` tiene `unique (comprador_id, clave_idempotencia)` y, antes de insertar, busca una orden con esa misma pareja. Una doble pulsación devuelve la misma orden y no vuelve a descontar stock.
2. **La solicitud no se duplica.** `registrar_cobro` rechaza un cobro si la orden no está en `creada`. `asegurarCobro` trata ese rechazo como éxito si ya hay un cobro. Para los trabajos, `registrar_cobro_servicio` reemplaza el cobro anterior, así que queda un solo cobro vigente.
3. **El pago se confirma una vez.** La función que lo garantiza es `confirmar_pago`. Bloquea la orden y el cobro con `for update`, y solo confirma si la orden está en `esperando_pago` y el cobro en `pendiente`. Una segunda llamada, desde el sondeo o desde el vendedor, recibe `ESTADO_INVALIDO`, y `estadoDePago` lo ignora. Como las dos llamadas toman el mismo bloqueo, no hay carrera posible entre ellas. `cancelar_orden` toma el mismo bloqueo, así que un pago y una cancelación que llegan a la vez se ordenan uno después del otro.

Además, `expirar_ordenes` usa `for update skip locked`, de modo que dos páginas que lo disparan a la vez no vencen la misma orden dos veces.

## Recibo

`/ordenes/[id]/recibo` muestra el comprobante de una orden pagada. Solo lo ven el comprador y el vendedor. Si la orden no está pagada, redirige a la orden. El comprobante incluye:

- El número de la orden, las líneas (o el trabajo), el total en dólares y en sats.
- La referencia del pago (`referenciaDeCobro`), acortada.
- La cotización usada (1 BTC = USD).
- La forma de pago: "Bitcoin por Lightning". En la demostración dice "pago simulado".
- Un botón para imprimir (`window.print()`).

El recibo dice explícitamente que no es un documento tributario, y que la factura electrónica (DTE) la emite el vendedor. La factura electrónica de El Salvador la genera CacaoLedger, la herramienta del grupo para tickets, pagos y documentos tributarios. CacaoMarket no emite DTE.

## Integración con un procesador real

Esta sección describe lo que haría falta para aceptar pagos Lightning reales. No está implementado.

### Qué cambia y qué se queda

Se queda igual: la tabla `cobros`, las funciones `confirmar_pago`, `expirar_ordenes`, `cancelar_orden` y `registrar_cobro`, los estados de las órdenes, la pantalla de pago y los eventos del embudo. El resto de la aplicación no sabe qué proveedor hay detrás.

Cambia: un adaptador nuevo, su registro en `proveedorPara`, la forma en que se confirma el pago (sondeo, webhook o ambos), y la forma en que se guarda la credencial del vendedor.

### Pasos

1. **Elegir el servicio.** Los dos nombrados en el enum son `nwc` (Nostr Wallet Connect, que deja a la aplicación pedir facturas y consultar pagos a la billetera del vendedor) y `blink` (una API de cuenta con facturas y estado de pago). Hay que escribir contra la API del servicio elegido, no contra la red Lightning.
2. **Crear el adaptador.** Un archivo nuevo, por ejemplo `src/lib/pagos/nwc.ts`, con una función `crearProveedorNwc(credencial, opciones)` que devuelva un `ProveedorDePago`. `crearCobro` pide una factura por `sats` con el `memo` y la expiración que recibe. `consultarCobro` devuelve `pagado` cuando el servicio lo confirma. Pruebas en `src/lib/pagos/nwc.test.ts`, con un `fetch` falso, como `manual.test.ts`.
3. **Registrarlo.** En `src/lib/pagos/index.ts`, los casos `nwc` y `blink` de `proveedorPara` dejan de lanzar `NO_DISPONIBLE` y construyen el adaptador con la credencial del negocio.
4. **Guardar la credencial.** La columna `negocios.credencial_pago_cifrada` ya existe y ya está fuera de los permisos de sesión. Hay que escribirla con una función SQL nueva (solo `service_role`), cifrada en el servidor con una clave que no esté en la base de datos, y con un formulario en `src/app/mi-negocio` que la envíe por una acción de servidor. La credencial nunca va al navegador ni a un registro.
5. **Confirmar desde la red (opcional).** El sondeo de la pantalla ya confirma los pagos mientras el comprador mira. Un webhook agrega confirmación aunque el comprador cierre la pantalla. Sería una ruta nueva, por ejemplo `src/app/api/pagos/nwc/route.ts`, que:
   - verifica la firma del servicio;
   - busca el cobro por `cobros.referencia_externa` con la clave de servicio;
   - llama a `confirmarPagoEnBD(ordenId, null, null)`;
   - trata `ESTADO_INVALIDO` como éxito, porque significa que el pago ya estaba confirmado.
6. **Usar la fecha de vencimiento de la factura.** `crearCobro` debe devolver como `expiraEn` la fecha que da el servicio, en lugar del reloj de 600 segundos.
7. **Trabajos.** No cambia: pasan por el mismo `proveedorDe` y por `registrar_cobro_servicio`.
8. **Pruebas.** Unitarias del adaptador. De base de datos, un caso con dos avisos del mismo pago (tests/db). Y un recorrido de navegador con el servicio en su red de pruebas. El proyecto no debe usar fondos reales en ningún momento.

### Decisiones que hay que tomar antes

- **Custodia.** El dinero tiene que llegar a la billetera del vendedor. Si el procesador retiene los fondos y los reenvía, la plataforma pasa a custodiar dinero de otras personas. Eso cambia el modelo legal y operativo del proyecto. Hay que decidirlo antes de escribir el adaptador.
- **Reembolsos.** Siguen fuera de la aplicación. El vendedor paga y marca el reembolso, y el comprador lo confirma. Si el procesador debe hacer reembolsos automáticos, hay que cambiar `resolver_disputa` y `marcar_reembolso`.
- **Comisión.** La comisión teórica del 1 % se guarda, pero no se cobra. Hay que decidir si se cobra, cómo (con una división del pago en el procesador, o con una factura aparte) y quién la paga.
- **Credenciales.** Quién entrega la credencial del vendedor, cómo se revoca y qué pasa cuando cambia.
- **Pagos tardíos.** Hoy, una factura pagada después del vencimiento se rechaza, y la orden expira. Si el procesador ya cobró, el vendedor tendría que devolver ese dinero fuera de la aplicación. Hay que decidir si el procesador puede cancelarlo.
- **Registro.** Cada confirmación que llega desde la red debe quedar en `auditoria`, con el origen.
