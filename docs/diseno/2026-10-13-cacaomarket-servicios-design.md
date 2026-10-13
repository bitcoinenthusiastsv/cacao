# CacaoMarket: Servicios y tablón "Necesito"

Fecha: 2026-10-13. Estado: diseño para revisión.

## Para qué

CacaoMarket hoy es un supermercado: productores venden productos y cobran en sats, directo a su
billetera. Falta la otra mitad de una economía local: el trabajo. Plomería, electricidad, mototaxi,
cortes de pelo, clases. Este diseño agrega esa mitad para que los sats que alguien cobra por un
servicio se vuelvan a gastar dentro de la misma red, y para que la métrica de circularidad lo muestre.

Éxito: en la demo se puede (1) contratar un servicio de precio fijo, (2) pedir una cotización a quien
ofrece un servicio, (3) publicar una necesidad y recibir ofertas, y en los tres casos pagar en sats
cuando el trabajo está hecho, con chat, reseña y disputa.

## Lo que decidió el usuario

- Servicios se contratan de dos formas: precio fijo y cotización.
- Hay dos lados: un catálogo de servicios ya publicados, y un tablón donde la gente publica lo que
  necesita y quienes trabajan ofrecen su precio.
- **El servicio se paga al terminar el trabajo**, no al contratar.

## Lo que se asume (decidido por el diseñador)

- Va dentro del mismo sitio (`market/`, `cacaomarket.vercel.app`), con la misma cuenta.
- Un solo perfil de negocio publica productos, servicios o ambos, con la misma Lightning Address y la
  misma aprobación del admin. No hay un perfil aparte para oficios.
- Cualquier persona con cuenta publica una necesidad. Solo perfiles aprobados ofertan o publican
  servicios.
- Sigue siendo no custodial: CacaoMarket nunca recibe ni guarda dinero. Por eso no puede retener un
  pago hasta que el trabajo termine, y por eso pagar al final es la única forma honesta de proteger al
  cliente. El riesgo pasa a quien trabaja: puede no cobrar. El diseño lo dice en pantalla y deja el
  caso a la vista del admin.
- Los productos no cambian: se siguen pagando al hacer el pedido.

## Qué ve la gente

### Tres puertas

El inicio y la cabecera de las tres secciones muestran un mismo selector: **Supermercado** (`/`),
**Servicios** (`/servicios`), **Necesito** (`/necesito`). La barra inferior no cambia (Inicio,
Carrito, Órdenes, Mi negocio).

### Catálogo de servicios (`/servicios`, `/servicios/[id]`)

- Lista pública con buscador y categorías: Hogar y reparaciones, Transporte y mandados, Belleza y
  cuidado personal, Clases y tutorías, Tecnología, Comida y eventos.
- Cada servicio: título, quién lo ofrece, zona donde trabaja, descripción, foto opcional y precio.
- Precio de dos tipos:
  - **Fijo:** "$5.00 por corte", "$2.00 por viaje". Se muestra en USD y en sats aproximados.
  - **A cotizar:** "Precio según el trabajo".
- Servicio de precio fijo: botón **Contratar**, con una nota opcional ("mañana a las 3 en mi casa").
  Crea el trabajo como *acordado* y lleva a su página. No se paga todavía.
- Servicio a cotizar: botón **Pedir cotización**, con la descripción del trabajo. Quien ofrece
  responde con precio y mensaje. El cliente acepta (queda *acordado*) o rechaza.
- Nadie contrata su propio servicio. Un negocio cerrado o no aprobado no recibe contrataciones.

### Tablón "Necesito" (`/necesito`, `/necesito/nuevo`, `/necesito/[id]`)

- Lista pública de necesidades abiertas, más nuevas primero, con categoría y zona.
- Publicar (con cuenta): título, descripción, categoría, zona, presupuesto opcional en USD.
- Un perfil aprobado ve el botón **Ofertar**: precio en USD y mensaje. Una oferta por perfil y por
  necesidad; puede retirarla mientras no esté aceptada.
- Quien publicó ve todas las ofertas con el nombre y la calificación del perfil, y acepta una. Al
  aceptar: el trabajo queda *acordado*, la necesidad pasa a *asignada* y las demás ofertas quedan
  rechazadas. Los demás visitantes solo ven cuántas ofertas hay.
- Quien publicó puede cancelar su necesidad mientras esté abierta. Sin oferta aceptada, vence a los
  14 días.

### El trabajo (misma página de orden, `/ordenes/[id]`)

Un trabajo es una orden de tipo *servicio*. Pasos:

1. **Acordada.** Cliente y quien trabaja coordinan hora y lugar por el chat. Cualquiera de los dos
   puede cancelar, con un motivo corto.
2. **Trabajo hecho.** Quien trabaja lo marca. El cliente recibe el aviso "Ya podés pagar".
3. **Pago.** El cliente abre la pantalla de pago que ya existe. El monto en sats se calcula en ese
   momento con la cotización del día. Si la solicitud de pago vence, la orden vuelve a "Trabajo
   hecho" y se puede pedir otra; nunca se cancela sola por eso.
4. **Pagada.** Queda terminada; no hay código de entrega porque el pago es la confirmación.
5. **Cerrada**, con la reseña del cliente o sola a las 48 horas.

Desacuerdos:

- Con el trabajo hecho y sin pagar, el cliente puede abrir **"No estoy de acuerdo"** (disputa). El
  admin resuelve *corresponde pagar* (la orden vuelve a "Trabajo hecho") o *no corresponde pagar*
  (la orden se cancela).
- Después de pagar, el cliente tiene 48 horas para abrir la disputa de siempre (reembolso total,
  parcial o ninguno, pagado por quien trabajó desde su billetera).
- Un trabajo hecho que lleva más de 48 horas sin pagar aparece en la lista del admin "Trabajos sin
  pagar". CacaoMarket no cobra por nadie; el admin ve el caso y puede suspender a quien no paga.

Textos que la pantalla debe decir con claridad:

- Al contratar: "Pagás cuando el trabajo esté hecho. CacaoMarket no guarda tu dinero."
- A quien trabaja, al aceptar o al ser contratado: "Cobrás al terminar. Coordiná bien antes de ir."

### Panel de quien ofrece (`/mi-negocio`)

- **Servicios** (`/mi-negocio/servicios`): lista, crear, editar, pausar. Campos: título, categoría,
  descripción, zona, tipo de precio, precio y unidad ("por corte", "por hora", "por viaje") si es
  fijo, una foto opcional.
- **Cotizaciones** (`/mi-negocio/cotizaciones`): pedidos de cotización por responder y las ofertas
  que hizo en el tablón, con su estado.
- **Órdenes** (`/mi-negocio/ordenes`): muestra productos y servicios; los trabajos tienen sus propios
  grupos (Acordados, Por cobrar).

### Cliente

- **Órdenes** (`/ordenes`): productos y trabajos juntos, con una etiqueta que los distingue. Arriba,
  un acceso a **Mis cotizaciones y necesidades** (`/cotizaciones`): lo que pidió cotizar, lo que
  publicó en el tablón y las ofertas recibidas.

### Admin

- `/admin/servicios`: servicios y necesidades publicados, con botón para ocultar o volver a mostrar.
- `/admin/ordenes`: filtro por tipo y la lista "Trabajos sin pagar".
- `/admin/disputas`: las disputas de trabajos sin pagar usan las dos resoluciones nuevas.
- La circularidad no cambia de fórmula: ya suma toda orden pagada, sea producto o servicio.

## Datos

Cambios sobre el esquema actual (todo en migraciones nuevas; un valor nuevo de un `enum` se agrega
en una migración y se usa en la siguiente):

- `estado_orden`: se agregan `acordada`, `hecha`, `cancelada`.
- `resultado_disputa`: se agregan `corresponde_pagar`, `no_corresponde_pagar`.
- `ordenes`: `tipo` (`productos` | `servicio`, por defecto `productos`), `hecha_en`, `cancelada_en`,
  `motivo_cancelacion`. `modo_entrega` pasa a ser opcional y solo obligatorio para productos. En un
  servicio, `total_sats` y `cotizacion_usd_btc` se guardan al acordar como referencia y se vuelven a
  fijar al crear la solicitud de pago.
- `lineas_orden`: `producto_id` opcional y `servicio_id` nuevo; exactamente uno de los dos.
- `categorias_servicio` (id, nombre, orden).
- `servicios` (id, negocio, categoría, título, descripción, zona, tipo de precio `fijo` | `cotizar`,
  precio en centavos de USD y unidad solo si es fijo, activo, oculto por admin, fotos, fecha).
- `necesidades` (id, usuario, categoría, título, descripción, zona, presupuesto opcional, estado
  `abierta` | `asignada` | `cancelada` | `vencida`, oculta por admin, fecha, vence en 14 días).
- `cotizaciones` (id, negocio, cliente, origen: un servicio o una necesidad, exactamente uno;
  descripción del cliente; precio y mensaje de quien ofrece; estado `solicitada` | `ofrecida` |
  `aceptada` | `rechazada` | `retirada` | `vencida`; orden creada al aceptar; fechas). Única por
  (necesidad, negocio).
- `avisos`: `ruta` opcional, para avisos que no son de una orden (cotización nueva, oferta nueva).

Reglas que ya valen y siguen valiendo: el navegador nunca escribe; toda escritura es una función de
Postgres llamada por el servidor con el rol de servicio; las sesiones solo leen, con permisos
columna por columna; todo permiso se concede de forma explícita (la migración
`20261012000003_privilegios.sql` quita los permisos por defecto).

Quién lee qué:

- Servicios: todos, si el servicio está activo, no oculto y el negocio aprobado; su dueño siempre.
- Necesidades: todos, si están abiertas y no ocultas; su autor siempre. Del autor se muestra el
  nombre, nunca el contacto.
- Cotizaciones: solo el cliente y el negocio de esa cotización, y el admin. El conteo de ofertas de
  una necesidad lo calcula el servidor.

Funciones nuevas (solo rol de servicio, con los mismos códigos de error que las actuales):
`guardar_servicio`, `ocultar_servicio`, `publicar_necesidad`, `cancelar_necesidad`,
`ocultar_necesidad`, `vencer_necesidades`, `solicitar_cotizacion`, `responder_cotizacion`,
`ofertar`, `retirar_cotizacion`, `rechazar_cotizacion`, `aceptar_cotizacion`, `contratar_servicio`,
`marcar_hecha`, `cancelar_orden`. Cambian: `registrar_cobro` (acepta una orden de servicio en
`hecha`, vuelve a fijar sats y cotización, reemplaza la solicitud vencida), `confirmar_pago` (un
servicio pasa a pagada y a entregada en el mismo acto, sin código), `expirar_ordenes` (un servicio
con la solicitud vencida vuelve a `hecha`), `abrir_disputa` y `resolver_disputa` (caso sin pagar).

## Casos que deben quedar bien

- Dos personas aceptan a la vez dos ofertas distintas de la misma necesidad, o la misma oferta dos
  veces: nace una sola orden.
- Doble toque en "Contratar": un solo trabajo (clave de idempotencia, como en el carrito).
- La solicitud de pago de un trabajo vence con el cliente en la pantalla: se lo dice, la orden vuelve
  a "Trabajo hecho" y puede pedir otra; pagar tarde la factura vieja no marca la orden como pagada.
- Quien ofrece cambia el precio o pausa el servicio después de que alguien lo contrató: la orden
  conserva el precio acordado.
- Alguien adivina la URL de una cotización, de las ofertas de una necesidad ajena o de un trabajo
  ajeno: "Esta página no existe".
- Un perfil suspendido o pendiente no puede ofertar ni ser contratado, y sus servicios no se ven.
- Texto con HTML en títulos, descripciones, mensajes y motivos se muestra como texto.

## Pruebas

- Base de datos: cada función nueva, cada rol, las transiciones de un trabajo, el vencimiento del
  cobro que vuelve a `hecha`, las dos aceptaciones simultáneas, la seguridad de lectura de
  cotizaciones, y que las pruebas actuales de productos sigan pasando.
- Unitarias: `estados.ts` con los estados y acciones nuevas por tipo de orden.
- De punta a punta (Playwright, teléfono): precio fijo completo; cotización completa; tablón
  completo con dos ofertas; cancelación; disputa sin pagar con sus dos resoluciones; URLs ajenas;
  320 px sin desborde en las pantallas nuevas.

## Datos de demo

Seis categorías de servicio. Unos 12 servicios repartidos entre los negocios de muestra (por
ejemplo: asesoría de huerto casero, tour del cafetal, taller de queso, entrega en moto) y dos
perfiles nuevos de puro servicio (una barbería y un electricista). Cinco necesidades abiertas con
una o dos ofertas, y trabajos de muestra en cada estado. Lucía sigue siendo la compradora de demo
sin perfil.

## Fuera de este paso

Agenda con horarios, mapa y distancia, pago por adelantado o parcial, propinas, varios servicios en
un solo trabajo, calificación al cliente, notificaciones push, y los adaptadores de pago `nwc` y
`blink`.
