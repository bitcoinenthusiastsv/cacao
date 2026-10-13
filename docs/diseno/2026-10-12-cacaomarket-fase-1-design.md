# CacaoMarket, Fase 1: mercado de granja con pagos Lightning no custodiales

Fecha: 2026-10-12
Estado: para revisión
Origen: borrador "Superapp Bitcoin, Fase 1". Este documento lo adapta a la familia Cacao y fija el
primer corte que se construye.

## 1. Objetivo

Que un productor de una zona Bitcoin de El Salvador publique sus productos, un comprador los pida y
pague en sats directo a la wallet del productor, y que la app registre la orden de principio a fin.

La Fase 1 existe para responder una pregunta: ¿los sats que cobra un vendedor se vuelven a gastar dentro
de la red? Lo que no ayuda a responderla queda fuera.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Nombre y marca | CacaoMarket, tercer producto de la familia Cacao. Mismo grano, misma paleta y tipografías del brandbook; marca `cacaomarket` |
| Lugar en el repo | Carpeta `market/` del repositorio de Cacao Media y Cacao Travel, con su propio `package.json` |
| Zona | Una comunidad donde ya se cobra en sats (El Zonte, Berlín o similar). Es un parámetro de configuración |
| Custodia | No custodial. La app nunca recibe ni guarda fondos |
| Plataforma | PWA en Next.js (App Router, TypeScript) sobre Supabase (Postgres, autenticación por teléfono, almacenamiento de fotos) |
| Base de datos de desarrollo | Supabase local en Docker. Migraciones, políticas y datos de prueba en el repo. La nube llega al desplegar |
| Entrega | Recogida en punto o entrega por el propio vendedor |
| Comisión | Ninguna en el piloto. Se calcula y registra una comisión teórica por orden |
| Primer corte de pagos | Adaptador `manual` y adaptador `falso` para pruebas. `nwc` y `blink` son el paso siguiente, sobre la misma interfaz |
| Idioma | Español con voseo, como Media y Travel |

## 3. Alcance del primer corte

### Incluido

- Registro e inicio de sesión por código al teléfono. En desarrollo, un código de prueba fijo; sin
  proveedor de SMS.
- Roles comprador, vendedor y administrador. Una cuenta puede ser comprador y vendedor.
- Alta de negocio con aprobación manual del administrador.
- Catálogo de productos de granja: nombre, fotos, categoría, unidad, precio en USD, stock.
- Búsqueda y filtro por categoría y por vendedor.
- Carrito y orden, una orden por vendedor.
- Pago Lightning con el adaptador `manual` (sección 5).
- Chat por orden entre comprador y vendedor.
- Reseña del comprador al cerrar la orden.
- Disputa simple resuelta por el administrador.
- Panel de administración con la métrica de circularidad.
- Avisos dentro de la app (cambios de estado y mensajes nuevos).

### Fuera del primer corte

Adaptadores `nwc` y `blink`, notificaciones push, despliegue en la nube. Se hacen después, sin cambiar
el modelo.

### Fuera de la Fase 1

Repartidores y seguimiento en mapa, pedidos de restaurantes, servicios, insumos B2B, hold invoices,
wallet o saldo interno, pedidos recurrentes y preventa, precios por volumen, WhatsApp o SMS como canal
de avisos, app nativa, cobro real de comisión, integración de compra con Cacao Media o Cacao Travel
(solo enlaces entre sitios).

## 4. Arquitectura

```
PWA (Next.js)  ──►  rutas de servidor (Next.js)  ──►  Postgres (Supabase)
                          │
                          ├──►  ProveedorDePago  ──►  wallet del vendedor
                          └──►  FuenteDePrecio   ──►  cotización BTC/USD
```

Unidades y su única responsabilidad:

| Unidad | Hace | Depende de |
|---|---|---|
| `cuentas` | Sesión, roles, perfil de negocio, aprobación | Supabase Auth |
| `catalogo` | Productos, categorías, stock, búsqueda | `cuentas` |
| `ordenes` | Carrito, creación de orden, máquina de estados | `catalogo`, `pagos` |
| `pagos` | Crear cobro, detectar pago, registrar tipo de cambio | `ProveedorDePago`, `FuenteDePrecio` |
| `mensajes` | Chat por orden | `ordenes` |
| `reputacion` | Reseñas y promedio por vendedor | `ordenes` |
| `disputas` | Reclamo, evidencia, resolución | `ordenes` |
| `admin` | Aprobaciones, vista de órdenes, métricas | todas; solo lectura salvo aprobar y resolver |

Toda regla de negocio vive en el servidor. El cliente no decide estados de orden ni montos. Las
transiciones de orden y la reserva de stock son funciones de Postgres llamadas desde el servidor, para
que sean atómicas.

## 5. Pagos

### 5.1 Interfaz `ProveedorDePago`

```ts
interface ProveedorDePago {
  crearCobro(input: { sats: number; memo: string; expiraEnSeg: number }): Promise<Cobro>;
  consultarCobro(cobroId: string): Promise<'pendiente' | 'pagado' | 'expirado'>;
}

type Cobro = { id: string; bolt11?: string; destino?: string; expiraEn: Date };
```

Adaptadores del primer corte:

| Adaptador | Cómo funciona | Detección |
|---|---|---|
| `manual` | El vendedor registra su Lightning Address. El servidor le pide a esa dirección, por LNURL-pay, una factura por el monto exacto y se la muestra al comprador como QR y como texto para copiar. Si la dirección no entrega factura, se muestra la dirección y el monto | Automática si el servicio de la dirección ofrece verificación de pago (LUD-21). Si no, el vendedor pulsa "Pago recibido" |
| `falso` | Solo en pruebas y desarrollo. Crea cobros que se marcan pagados o expirados a pedido | Programable |

Adaptadores del paso siguiente, sin cambios en el resto de la app:

| Adaptador | Cómo funciona |
|---|---|
| `nwc` | Conexión Nostr Wallet Connect con permisos `make_invoice` y `lookup_invoice` solamente |
| `blink` | Llave de API de Blink con alcance de lectura y recepción, sin escritura |

Al guardar una conexión `nwc` o `blink`, el servidor comprobará que no tenga permiso de gasto.

### 5.2 Conversión

- El vendedor fija precios en USD (centavos enteros).
- Al crear la orden se consulta `FuenteDePrecio`, se calcula el total en sats (entero, redondeo hacia
  arriba) y se guardan los dos montos y la cotización usada.
- El cobro expira a los 600 segundos. Pasado ese tiempo la orden expira y el stock se libera.
- `FuenteDePrecio` usa una fuente principal y una de respaldo. Si las dos fallan o difieren más de 2%, no
  se crean órdenes y se muestra un aviso. En pruebas se usa una fuente fija.

### 5.3 Reembolsos

La app no puede devolver dinero porque no lo tiene. El vendedor paga al comprador fuera de la app y marca
el reembolso; el comprador lo confirma. Si el vendedor no cumple una resolución del administrador, se
suspende su negocio.

## 6. Órdenes

### 6.1 Estados

```
creada ─► esperando_pago ─► pagada ─► lista ─► entregada ─► cerrada
              │                │         │          │
              ▼                └─────────┴──────────┴──► disputada ─► resuelta
           expirada
```

| Transición | Quién | Condición |
|---|---|---|
| creada → esperando_pago | sistema | Stock reservado y cobro creado |
| esperando_pago → pagada | sistema, o vendedor en modo manual | Cobro pagado |
| esperando_pago → expirada | sistema | Cobro vencido; libera stock |
| pagada → lista | vendedor | Pedido preparado |
| lista → entregada | comprador, o vendedor con código de entrega | Entrega hecha |
| entregada → cerrada | sistema | 48 h sin disputa, o reseña enviada |
| pagada / lista / entregada → disputada | comprador | Desde el pago hasta 48 h después de la entrega |
| disputada → resuelta | administrador | Resultado: reembolso total, parcial o sin reembolso |

No hay paso de "aceptar orden": si hay stock, la orden se acepta sola. El vendedor controla su
disponibilidad con el stock y con un interruptor de "tienda abierta".

### 6.2 Stock

Crear la orden reserva el stock en la misma transacción. Dos compradores no pueden reservar la última
unidad. Una orden expirada devuelve el stock.

## 7. Modelo de datos

| Tabla | Campos principales |
|---|---|
| `usuarios` | id, telefono, nombre, es_admin |
| `negocios` | id, usuario_id, nombre, descripcion, ubicacion, estado (pendiente / aprobado / suspendido), abierto, tipo_proveedor_pago, credencial_pago_cifrada, lightning_address |
| `categorias` | id, nombre |
| `productos` | id, negocio_id, categoria_id, nombre, unidad, precio_usd_centavos, stock, activo, fotos |
| `ordenes` | id, comprador_id, negocio_id, estado, total_usd_centavos, total_sats, cotizacion_usd_btc, modo_entrega, codigo_entrega, comision_teorica_sats, clave_idempotencia, marcas de tiempo por estado |
| `lineas_orden` | id, orden_id, producto_id, cantidad, precio_usd_centavos (copiado al crear) |
| `cobros` | id, orden_id, proveedor, referencia_externa, bolt11, destino, estado, expira_en, pagado_en |
| `mensajes` | id, orden_id, autor_id, texto, creado_en |
| `resenas` | id, orden_id, puntuacion (1 a 5), comentario |
| `disputas` | id, orden_id, motivo, evidencia, estado, resultado, resuelta_por |
| `avisos` | id, usuario_id, tipo, orden_id, leido, creado_en |
| `auditoria` | id, actor_id, accion, entidad, entidad_id, detalle, creado_en |

Seguridad a nivel de fila en Postgres: cada usuario ve solo sus órdenes, mensajes, avisos y disputas; el
vendedor ve las de su negocio; el catálogo de negocios aprobados es público.

## 8. Métrica de circularidad

Para cada vendedor y para la red:

- **Sats cobrados**: suma de `total_sats` de sus órdenes pagadas como vendedor.
- **Sats re-gastados**: suma de `total_sats` de sus órdenes pagadas como comprador.
- **Índice de circularidad** = sats re-gastados / sats cobrados.
- **Vendedores que también compran**: porcentaje de negocios con al menos una orden pagada como
  comprador.

Solo mide lo que pasa dentro de la app. El gasto en sats fuera de la app no se ve; el índice es un piso,
no el valor real.

## 9. Errores

| Caso | Comportamiento |
|---|---|
| La Lightning Address no responde al crear el cobro | Se crea el cobro sin factura: se muestra la dirección y el monto. El vendedor confirma a mano |
| Detección automática caída con cobro ya pagado | Reintento cada 15 s hasta el vencimiento, luego cada 5 min por 1 h. El vendedor puede confirmar a mano |
| Pago por monto incorrecto | El vendedor no confirma; la orden expira; arreglan por chat o se abre disputa |
| Vendedor confirma un pago que no recibió | Riesgo suyo; no afecta al comprador |
| Vendedor niega un pago real | El comprador abre disputa con comprobante; el administrador resuelve |
| Fuente de precio caída | No se crean órdenes nuevas |
| Doble envío del formulario de orden | Clave de idempotencia por carrito; se devuelve la orden ya creada |

## 10. Seguridad

- Las credenciales de pago (cuando existan `nwc` y `blink`) van cifradas en reposo, se usan solo en el
  servidor y nunca se envían al cliente.
- Límite de intentos en envío y verificación de códigos por teléfono.
- Toda acción de administrador y todo cambio de estado de orden queda en `auditoria`.
- Fotos validadas por tipo y tamaño.
- La app no pide ni almacena llaves privadas ni frases semilla. La pantalla de configuración de pagos lo
  dice de forma explícita.
- El servidor solo consulta Lightning Addresses por HTTPS a dominios públicos, con tiempo límite, para que
  no se pueda usar para alcanzar direcciones internas.

## 11. Interfaz

- Pensada para teléfono primero; se instala como PWA.
- Marca Cacao: paleta Pulpa, Tostado, Mazorca, Criollo, Grano fresco y Chocolate; Bricolage Grotesque y
  JetBrains Mono para precios y datos; sin sombras ni degradados.
- Identidad propia frente a Media (hoja editorial) y Travel (boletos sobre fondo oscuro): el mercado usa
  la etiqueta de precio como pieza central, con el precio en sats y en USD siempre juntos.
- Pantallas: inicio y búsqueda, negocio, producto, carrito, pago, mis órdenes, orden (estado, chat,
  entrega, reseña, disputa), mi negocio (productos, órdenes, pagos, tienda abierta), administración
  (aprobaciones, órdenes, disputas, circularidad), entrar.

## 12. Pruebas

- **Unitarias**: máquina de estados de órdenes (cada transición válida e inválida), conversión USD a sats
  y redondeo, cálculo de la métrica, resolución de Lightning Address.
- **Integración** (contra Supabase local): reserva de stock concurrente; ciclo de orden completo con el
  adaptador `falso`; expiración y devolución de stock; idempotencia.
- **Seguridad a nivel de fila**: un usuario no puede leer órdenes, mensajes ni avisos ajenos.
- **Extremo a extremo** (Playwright, vista de teléfono): alta de vendedor y aprobación, publicar producto,
  comprar y pagar, entregar con código, reseñar, disputar.
- Antes de un piloto: una compra real en mainnet con monto mínimo.

## 13. Criterios de éxito del piloto

Metas propuestas, a ajustar con la comunidad:

- 15 negocios aprobados con al menos un producto activo.
- 100 órdenes pagadas en 8 semanas.
- Al menos 20% de los vendedores con una compra propia dentro de la app.
- Menos de 5% de órdenes en disputa.

## 14. Riesgos y supuestos

- **Legal**: se asume que el modelo no custodial no exige registro como proveedor de servicios Bitcoin. No
  está verificado; requiere abogado salvadoreño antes de abrir al público. Igual para IVA y facturación
  electrónica de los vendedores.
- **Compatibilidad de wallets**: no todas las Lightning Addresses entregan facturas por monto exacto ni
  permiten verificar el pago. Para esas, la confirmación es manual, con peor experiencia.
- **Costo de SMS**: en producción los códigos por teléfono necesitan un proveedor de SMS de pago.
- **Arranque en frío**: la app no consigue por sí sola a los primeros vendedores. El trabajo de campo va
  antes o en paralelo.
- **Protección al comprador**: débil por diseño. Depende de reputación y de la suspensión de vendedores.
