# Referencia de API, Acciones de Servidor y Funciones de Base de Datos

CacaoPay sigue la regla de seguridad de todo el grupo Cacao: **el navegador nunca lee ni escribe directamente en las tablas de transferencias**. Las vistas son Server Components de Next.js, los formularios invocan Server Actions (`'use server'`), la capa `src/servidor/` valida la sesión y los datos de entrada, y las mutaciones se ejecutan en PostgreSQL mediante funciones `security definer` invocadas únicamente con `service_role`.

## 1. Rutas HTTP y páginas de la aplicación (`src/app/`)

| Ruta | Método / Tipo | Acceso | Descripción |
|---|---|---|---|
| `/` | `GET` (Server Component) | Público | Portada con el cotizador interactivo (`Cotizador`), resumen de garantías y enlace a `/hacienda`. |
| `/hacienda` | `GET` (Server Component) | Público | Marco tributario de El Salvador (LISR Art. 3 num. 4 para valores del exterior, IVA 13% en F-07, Pago a Cuenta 1.75% en F-14 v17, DTE en CacaoLedger y normas del BCR/UIF). |
| `/entrar` | `GET` | Público | Ingreso con el componente `<SignIn />` de Clerk (celular o correo). Vuelve a `volver` si ya hay nombre; si falta, lleva a `/cuenta`. |
| `/registrarse` | `GET` | Público | Alta con el componente `<SignUp />` de Clerk. Al terminar pasa por `/entrar` para seguir al destino `volver`. |
| `/enviar` | `GET` / Server Actions | Con sesión | Flujo de envío en tres pasos: monto y vía de entrega, datos del destinatario y confirmación con clave de idempotencia. |
| `/envios` | `GET` (Server Component) | Con sesión | Historial paginado (20 por página) de las transferencias enviadas por la persona en sesión. |
| `/envios/[id]` | `GET` / Server Actions | Remitente o Admin | Detalle completo del envío, línea de tiempo, acciones según estado, desglose tributario (DGII · BCR) y comprobante imprimible. Si entra el destinatario, redirige a `/recibidos/[id]`. |
| `/recibidos` | `GET` (Server Component) | Con sesión | Historial paginado de las transferencias dirigidas al teléfono o correo de la persona en sesión, sin mostrar la comisión. |
| `/recibidos/[id]` | `GET` (Server Component) | Destinatario | Vista del destinatario con monto a recibir, estado en tiempo real y nota del remitente, sin mostrar la comisión. |
| `/rastrear` | `GET` | Público | Buscador por código de transferencia (`CP-XXXX-XXXX`). |
| `/t/[codigo]` | `GET` (Server Component) | Público | Seguimiento público sin cuenta: muestra solo el monto a recibir, la vía de entrega, el primer nombre del destinatario, el estado y la línea de tiempo. |
| `/cuenta` | `GET` / Server Actions | Con sesión | Edición del nombre visible y cierre de sesión local. |
| `/monitor` | `GET` (Server Component) | Administradora | Resumen del período por estado y tabla de liquidación tributaria (F-07 y F-14 v17) sobre envíos entregados. |
| `/monitor/envios` | `GET` (Server Component) | Administradora | Lista paginada de todos los envíos con filtro por estado y contactos enmascarados. |
| `/monitor/envios/[id]` | `GET` / Server Action | Administradora | Inspección administrativa de un envío y acciones para procesarlo, marcarlo como entregado o marcarlo como fallido con motivo. |
| `/monitor/embudo` | `GET` (Server Component) | Administradora | Embudo de conversión (`vio_cotizacion`, `inicio_envio`, `creo_envio`, `envio_completado`) con sesiones, eventos y monto en USD. |
| `/monitor/tarifas` | `GET` (Server Component) | Administradora | Tabla de comisiones por forma de entrega, código `CAT-017` para DTE y tipos de cambio guardados en `pay_tasas`. |

## 2. Tipo de respuesta estándar (`src/servidor/resultado.ts`)

Todas las funciones de mutación y lectura protegida devuelven el tipo discriminado `Resultado<T>`:

```ts
export type Resultado<T> =
  | { ok: true; dato: T }
  | { ok: false; codigo: string; mensaje: string };
```

### Códigos de error

| Código | Cuándo se devuelve |
|---|---|
| `DATOS_INVALIDOS` | Monto fuera de rango (`$1.00` a `$3,000.00`), teléfono o correo mal formado, motivo de fallo fuera de 4 a 200 caracteres, moneda o entrega inválida, o discrepancia entre los montos enviados y el recálculo de la base de datos. |
| `NO_PERMITIDO` | Intento de enviarse dinero a sí mismo, acción reservada a administración, o intento de usar botones de simulación cuando `NEXT_PUBLIC_DEMO` no es `1`. |
| `NO_ENCONTRADA` | La transferencia o la cuenta no existe, o pertenece a otra persona (se devuelve el mismo mensaje para no revelar la existencia de un identificador ajeno). |
| `ESTADO_INVALIDO` | Transición no permitida por la máquina de estados (por ejemplo, cancelar un envío que ya está `procesando` o completar uno que ya terminó). |
| `SIN_COTIZACION` | Las fuentes de precio de Bitcoin (Coinbase y Kraken) no respondieron o difieren en más del 2% al cotizar un envío por Lightning. |
| `ERROR` | Falla inesperada de red o de base de datos; el detalle técnico queda en el registro del servidor y la persona recibe un mensaje claro en español. |

## 3. Capa de servidor (`src/servidor/`)

### 3.1 Cotización, tarifas y tasas (`src/servidor/tasas.ts`)

- `tarifas(): Promise<Record<Entrega, Tarifa>>`
  Lee `pay_tarifas` desde Supabase y devuelve `{ fijoCentavos, porcentajeBps, minutosEstimados }` para `lightning`, `cuenta` y `efectivo`. Si la lectura falla, usa las constantes de respaldo (`TARIFAS`).
- `tarifasDetalle(): Promise<TarifaDetalle[]>`
  Devuelve la lista completa de formas de entrega con su descripción.
- `tasaEurUsd(): Promise<{ tasa: number; fuente: string; actualizadaEn: string }>`
  Lee el par `EUR/USD` de `pay_tasas` (sembrado en `1.08`).
- `tasasDeCambio(): Promise<TasaDeCambio[]>`
  Devuelve todos los pares almacenados en `pay_tasas` para `/monitor/tarifas`.
- `cotizarEnServidor(entrada: EntradaCotizacion): Promise<Resultado<Cotizacion & { validaHasta: string }>>`
  Calcula la cotización oficial en el servidor leyendo `pay_tarifas`, `pay_tasas` y, si `entrega === 'lightning'`, el precio de Bitcoin en vivo (`cotizacionUsdBtc()`). Devuelve la cotización con una vigencia de 5 minutos (`validaHasta`).

### 3.2 Transferencias (`src/servidor/transferencias.ts`)

- `crearEnvio(usuarioId: string, datos: DatosNuevoEnvio): Promise<Resultado<{ id: string; codigo: string }>>`
  Valida nombre (2 a 80 caracteres), contacto (celular salvadoreño de 8 dígitos con o sin `+503`, o correo electrónico), nota (hasta 200 caracteres) y clave de idempotencia (1 a 100 caracteres). Vuelve a cotizar en el servidor con `cotizarEnServidor`, invoca la función RPC `pay_crear_transferencia` y registra el evento `creo_envio`.
- `procesarEnvio(usuarioId: string, envioId: string): Promise<Resultado<CambioEnvio>>`
  Pasa una transferencia de `creada` a `procesando` invocando `pay_procesar`. Permitido al remitente o a una administradora.
- `cancelarEnvio(usuarioId: string, envioId: string): Promise<Resultado<CambioEnvio>>`
  Pasa una transferencia de `creada` a `cancelada` invocando `pay_cancelar`. Permitido únicamente al remitente antes de que salga el envío.
- `simularCompletar(actor: { id: string; esAdmin: boolean }, envioId: string): Promise<Resultado<CambioEnvio>>`
  Pasa una transferencia de `procesando` a `completada` invocando `pay_completar` y registra el evento `envio_completado`. Permitido siempre a una administradora y, en modo demostración (`NEXT_PUBLIC_DEMO=1`), al remitente de su propio envío.
- `simularFallar(actor: { id: string; esAdmin: boolean }, envioId: string, motivo: string): Promise<Resultado<CambioEnvio>>`
  Pasa una transferencia en `creada` o `procesando` a `fallida` con un motivo obligatorio de 4 a 200 caracteres invocando `pay_fallar`.
- `misEnvios(usuarioId: string, opciones?: { pagina?: number }): Promise<PaginaEnvios>`
  Devuelve las transferencias enviadas por `usuarioId`, ordenadas por `creada_en desc`, con contactos enmascarados.
- `recibidos(usuarioId: string, opciones?: { pagina?: number }): Promise<PaginaEnvios>`
  Devuelve las transferencias cuyo `destinatario_id` coincide con `usuarioId`.
- `envioPara(usuario: { id: string; esAdmin: boolean }, envioId: string): Promise<EnvioDetalle | null>`
  Devuelve el detalle y el historial de una transferencia si el usuario es su remitente, su destinatario o administradora (verificada en la base con `esAdministrador`). Oculta `destinatarioContacto` cuando el rol es `destinatario`.
- `rastreo(codigo: string): Promise<RastreoPublico | null>`
  Normaliza el código `CP-XXXX-XXXX` y selecciona únicamente las columnas públicas (`COLUMNAS_RASTREO`): código, estado, moneda y monto de destino, vía de entrega, primer nombre del destinatario, fecha de creación e historial. Nunca selecciona remitente, contacto, comisión ni nota.

### 3.3 Monitor administrativo (`src/servidor/monitor.ts`)

Cada función verifica primero en la base de datos que `usuarios.es_admin` sea `true` para `actorId`:

- `todosLosEnvios(actorId: string, opciones?: { estado?: EstadoEnvio; pagina?: number }): Promise<Resultado<PaginaEnvios>>`
- `resumenEnvios(actorId: string, desde: Date, hasta: Date): Promise<Resultado<ResumenEstado[]>>`
- `embudoPay(actorId: string, desde: Date, hasta: Date): Promise<Resultado<PasoEmbudo[]>>`
- `tarifasYTasas(actorId: string): Promise<Resultado<{ tarifas: TarifaDetalle[]; tasas: TasaDeCambio[] }>>`

### 3.4 Sesiones, cuentas y eventos (`src/servidor/sesion.ts`, `cuentas.ts`, `eventos.ts`)

- `sesionActual(): Promise<Sesion | null>`: toma `auth()` y `currentUser()` de Clerk, llama `vincular_clerk` con el teléfono E.164 y el correo principales y el nombre, y lee `id, nombre, es_admin` de `usuarios` con el cliente de servicio.
- `exigirSesion(volver?: string): Promise<Sesion>`: redirige a `/entrar` si no hay sesión activa.
- `exigirAdmin(volver: string): Promise<Sesion>`: exige sesión y responde `404` (`notFound()`) si la persona no es administradora.
- `actualizarPerfil(usuarioId: string, nombre: string): Promise<Resultado<{ nombre: string }>>`: actualiza el nombre visible invocando `actualizar_perfil`.
- `registrarEvento(datos: DatosEvento): Promise<void>`: registra pasos del embudo en la tabla compartida `eventos` con `p_sitio = 'pay'`.

## 4. Acciones de servidor (`acciones.ts`)

| Archivo | Acción | Entrada | Efecto |
|---|---|---|---|
| `src/app/enviar/acciones.ts` | `cotizarAccion` | `{ montoCentavos, monedaOrigen, entrega }` | Devuelve `Resultado<{ cotizacion, usdBtc }>` calculado en el servidor. |
| `src/app/enviar/acciones.ts` | `registrarVisitaCotizacion` | ninguna | Registra el evento `vio_cotizacion` con la cookie de visita. |
| `src/app/enviar/acciones.ts` | `registrarInicioEnvio` | ninguna | Registra el evento `inicio_envio`. |
| `src/app/enviar/acciones.ts` | `crearEnvioAccion` | `FormData` | Crea la transferencia con `crearEnvio` y redirige a `/envios/[id]`. |
| `src/app/envios/[id]/acciones.ts` | `procesarEnvioAccion` | `envioId: string` | Ejecuta `procesarEnvio` y refresca la ruta. |
| `src/app/envios/[id]/acciones.ts` | `cancelarEnvioAccion` | `envioId: string` | Ejecuta `cancelarEnvio` y refresca la ruta. |
| `src/app/envios/[id]/acciones.ts` | `simularCompletarAccion` | `envioId: string` | Ejecuta `simularCompletar` y refresca la ruta. |
| `src/app/envios/[id]/acciones.ts` | `simularFallarAccion` | `envioId: string, motivo: string` | Ejecuta `simularFallar` y refresca la ruta. |
| `src/app/envios/[id]/acciones.ts` | `estadoDeEnvioAccion` | `envioId: string` | Devuelve el estado actual para el sondeo en vivo cuando el envío está `procesando`. |
| `src/app/monitor/envios/[id]/acciones.ts` | `ejecutarAccion` | `FormData` (`envio`, `accion`, `motivo`) | Ejecuta `procesar`, `completar` o `fallar` como administradora y revalida `/monitor`. |
| `src/app/cuenta/acciones.ts` | `guardarNombre` | `FormData` | Guarda el nombre de la cuenta y revalida el layout. |
| `src/app/cuenta/BotonSalir.tsx` | `BotonSalir` | ninguna | Cliente. Cierra la sesión del dispositivo con `signOut` de Clerk y redirige a `/`. |

## 5. Módulos puros (`src/lib/`)

- `src/lib/cotizacion.ts`: `cotizar(entrada)`, `formatoMonto(valor, moneda)`, `TARIFAS`, `TASA_EUR_USD`, `MINIMO_CENTAVOS` (`100`), `MAXIMO_CENTAVOS` (`300_000`).
- `src/lib/transferencias.ts`: `accionesPosibles(estado, rol)`, `descripcionDeEstado(estado, rol)`, `normalizarCodigo(texto)`, `esCodigo(texto)`, `normalizarContacto(texto)`, `enmascararContacto(contacto)`, `aUsdCentavos(monto, moneda, eurUsd)`.
- `src/lib/dinero.ts`: `formatoUsd(centavos)`, `formatoSats(sats)`, `usdCentavosASats(centavos, cotizacionUsdBtc)`.
- `src/lib/hacienda.ts`: `desglosarComisionUsd(comisionUsdCentavos)` y `desgloseTributarioEnvio(entrada)` para el cálculo del principal recibido (valores del exterior, Art. 3 num. 4 LISR; alcance para remesas no confirmado), base gravada sin IVA (supuesto de cálculo), débito fiscal de IVA del 13% (F-07), Pago a Cuenta del 1.75% (F-14 v17, Art. 151 CT) y código `CAT-017`.

## 6. Funciones RPC de PostgreSQL (`market/supabase/migrations/20261014000005_pay.sql`)

Todas las tablas (`pay_tasas`, `pay_tarifas`, `pay_transferencias`, `pay_historial`) tienen `row level security` activado y permisos revocados para `anon` y `authenticated`. Solo `service_role` puede ejecutar estas funciones:

| Función SQL | Firma | Qué garantiza |
|---|---|---|
| `pay_crear_transferencia` | `(p_remitente, p_destinatario_nombre, p_destinatario_contacto, p_moneda_origen, p_monto_origen, p_moneda_destino, p_entrega, p_tasa, p_tasa_fuente, p_comision, p_monto_destino, p_nota, p_clave)` | Bloquea el usuario con `for update`, verifica idempotencia por `(remitente_id, clave_idempotencia)`, recalcula comisión, neto y monto destino con `_pay_calcular`, enlaza `destinatario_id` si el contacto pertenece a un usuario registrado, impide autoenvíos, genera el código único `CP-XXXX-XXXX` y escribe en `pay_transferencias`, `pay_historial` y `auditoria`. |
| `pay_procesar` | `(p_transferencia, p_actor)` | Bloquea la fila con `for update`, verifica que el actor sea el remitente o administradora y que el estado sea `creada`, y avanza a `procesando`. |
| `pay_completar` | `(p_transferencia, p_actor)` | Verifica que el estado sea `procesando` y que el actor sea administradora (o `null` para el simulador en modo demo) y avanza a `completada`. |
| `pay_fallar` | `(p_transferencia, p_actor, p_motivo)` | Verifica motivo de 4 a 200 caracteres y estado `creada` o `procesando`, y avanza a `fallida`. |
| `pay_cancelar` | `(p_transferencia, p_actor)` | Verifica que el actor sea el remitente y que el estado sea `creada`, y avanza a `cancelada`. |
| `pay_resumen` | `(p_desde, p_hasta)` | Agrupa por `estado` los envíos creados en `[p_desde, p_hasta)`, convirtiendo los montos y comisiones en `EUR` a centavos de `USD` con la tasa guardada en `pay_tasas`. |
