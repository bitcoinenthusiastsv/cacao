# Cacao Juego

Sexto producto del Grupo Cacao: un quiz jugable de 8 preguntas sobre El Salvador (cacao, cocina y lugares). Los **sats son simulados**, no tienen valor real y no se pueden retirar.

## Requisitos

- Node.js 24 o superior

## Instalación

```bash
cd juego
npm install
```

Los datos de jugadores, saldos, historial de premios y partidas se guardan en `juego/data/estado.json` (carpeta ignorada por git en este paquete). Podés cambiar la carpeta con la variable de entorno `CACAO_JUEGO_DATOS`.

## Cómo jugar

```bash
npm start
```

Abrí [http://localhost:4325](http://localhost:4325) en el navegador (el puerto se cambia con `CACAO_JUEGO_PUERTO`).

1. Escribí tu nombre en la portada.
2. Respondé las 8 preguntas en orden.
3. El servidor acredita sats solo si la respuesta es correcta y ese logro no se había cobrado antes en esa partida.
4. Revisá la tabla de posiciones o el historial vía API.

## Cómo probar

```bash
npm test
npm run check
```

Las pruebas cubren: un solo cobro por logro, rechazo de saldo mandado desde el cliente, premios solo por aciertos y orden de la tabla por saldo.

## Economía de sats (simulada)

| Regla | Valor |
| --- | --- |
| Acierto base | **40 sats** por pregunta correcta |
| Bonus de racha | **+15 sats** por cada nivel de racha después del primero (2 seguidas → +15, 3 seguidas → +30 en esa pregunta, etc.) |
| Tope por partida | **500 sats** máximo en una sola partida |
| Retiro / canje | **No aplica** |

Ejemplo: tres aciertos seguidos al inicio otorgan 40 + (40+15) + (40+30) = 165 sats, siempre respetando el tope.

## Seguridad y límites (MVP)

- El saldo vive solo en el servidor; las rutas rechazan cuerpos JSON con `saldo`, `balance`, `monto` o `sats` numérico enviados por el cliente.
- Cada premio usa un id de logro `{sesionId}:q{índice}`; no se paga dos veces el mismo logro.
- Las respuestas se validan en el servidor contra el banco de preguntas; el cliente no conoce la clave correcta hasta después de responder.
- Las partidas exigen responder en orden (pregunta 0, luego 1, etc.).
- Sesión por cookie HttpOnly (`cacao_juego_sesion`), vigencia de 24 horas.
- La vista `/admin` no lleva contraseña. En el sitio publicado no se muestra, salvo que exista la variable `CACAO_JUEGO_ADMIN`.

## API breve

- `POST /api/sesion` `{ "nombre": "..." }` abre sesión.
- `GET /api/estado` devuelve saldo, preguntas y progreso.
- `POST /api/responder` `{ "indice": 0, "opcion": 2 }`.
- `GET /api/tabla` tabla JSON.
- `GET /api/historial` premios de la sesión actual.

## Fuera de alcance en este MVP

- Audio, animaciones avanzadas o modo multijugador en tiempo real.
- Antiabuso avanzado (rate limit por IP, captcha, firma de payloads, auditoría remota).
- Autenticación fuerte en admin ni réplica en base compartida del monorepo.
