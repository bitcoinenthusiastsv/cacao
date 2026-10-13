# CacaoPay

CacaoPay is a remittance simulator for the Cacao group. A person sends money to a family member
in El Salvador, sees the exchange rate and the fees before confirming, and follows the transfer
until it is paid out in cash, into a bank account, or as bitcoin over Lightning.

Every payment is simulated. No real money or bitcoin moves, and no private keys or seed phrases are
used anywhere in the app.

## What is here

- Home page with a quote preview that works without signing in. The arithmetic lives in
  `src/lib/cotizacion.ts` and is covered by `src/lib/cotizacion.test.ts`.
- Sign-in by phone or email, shared with CacaoMarket. The same accounts work in both apps.
- The sender's three steps on `/enviar`: amount, recipient, confirmation.
- Transfers for the sender (`/envios`), for the recipient (`/recibidos`) and for anyone with the
  code (`/rastrear`, `/t/CP-XXXX-XXXX`).
- The administrator's monitor (`/monitor`): summary, transfers, funnel and fees.

## Running it locally

The database is shared with CacaoMarket. Its local Supabase stack lives in `market/` and runs in
Docker at `http://127.0.0.1:54321`. Start it from that folder first, as described in the
CacaoMarket README.

Then, in this folder:

```bash
npm install
cp .env.example .env.local
```

Fill in the variables in `.env.local` with the local keys the Supabase stack prints. The
development server listens on port 4324:

```bash
npm run dev
```

Open `http://localhost:4324`. On `/entrar`, set `NEXT_PUBLIC_DEMO=1` to show the demo accounts
panel. The demo buttons sign in as Lucía (sends money), Rosa (receives money) and Ana
(administrator). Their phones are 7000 0006, 7000 0002 and 7000 0001, and the local code is
123456.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server on port 4324 |
| `npm run build` | Production build |
| `npm start` | Serves the production build on port 4324 |
| `npm run lint` | ESLint |
| `npm run check` | Type check with `tsc --noEmit` |
| `npm test` | Unit and database tests with Vitest |
| `npm run e2e` | Browser tests with Playwright (see Testing) |

## Testing

There are three kinds of test.

- **Unit tests** (`src/lib/*.test.ts`) cover the arithmetic, the state rules and the formats of
  codes and contacts. They need no server.
- **Database tests** (`tests/db/`) call the Postgres functions of the local stack: creation,
  transitions, limits, the monitor queries. They use the service-role key.
- **Browser tests** (`tests/e2e/`) drive the app in Chromium at 375 px, as a phone would, and check
  the whole flow: quote, creation, tracking, the monitor and the recipient's view.

Run the unit tests with `npm test`. The database tests in `tests/db/` need the keys in `.env.local`, so run all of them with:

```bash
node --env-file=.env.local node_modules/vitest/vitest.mjs run
```

The browser tests need three things running or set:

1. The local Supabase stack (CacaoMarket README).
2. The development server on port 4324, started with `npm run dev`. The tests do not start it.
3. `.env.local` with `NEXT_PUBLIC_DEMO=1` and `PRECIO_FIJO_USD_BTC` set, because the tests use the
   demo accounts and a fixed bitcoin price.

Then run:

```bash
node --env-file=.env.local node_modules/@playwright/test/cli.js test
```

Or one file:

```bash
node --env-file=.env.local node_modules/@playwright/test/cli.js test tests/e2e/envio.spec.ts
```

The browser tests run one at a time, because they share one database and the nine test phones.
Each test creates its own transfers through the database functions or the screens, so the tests
do not depend on seeded rows. Sessions for the test people are saved in `.qa/e2e-sesiones/`, so a
run does not send a code for every sign-in. The local stack sends at most 30 codes an hour; if a
run reports that limit, wait and run again. Results and traces go to `.qa/e2e-resultados/`. The
`.qa/` folder is ignored by git.

Files:

| File | What it checks |
|---|---|
| `envio.spec.ts` | The whole transfer: quote, three steps, code, sending, tracking signed out, delivery, receipt |
| `monedas.spec.ts` | Euros to a bank account, dollars to sats by Lightning, the amount limits |
| `estados.spec.ts` | Cancelling, failing from the monitor, the demo buttons, a finished transfer |
| `destinatario.spec.ts` | A transfer to Rosa's phone, what she sees, another person's transfer |
| `riesgos.spec.ts` | Double taps, a tampered quote, access by others, unknown codes, HTML in names and notes |
| `movil.spec.ts` | No sideways scroll at 320 px on every route, signed out, as sender, recipient and administrator |

## Cómo recorrer la demo

About two minutes, on a phone or in a narrow window. Start with `/entrar`.

1. Open `/entrar` and tap "Lucía, envía dinero".
2. Open "Enviar dinero". Leave "Dólares (USD)" and "Efectivo". Write 100 in "Monto a enviar".
   The four lines show: $100.00 sent, $3.49 fee, no exchange rate (El Salvador uses dollars),
   and $96.51 received.
3. Tap "Seguir". Write "Marta Hernández" and the phone 7612 3456, then tap "Seguir" again.
4. Check the summary and tap "Confirmar envío". The transfer opens with a code like CP-XXXX-XXXX
   and the state "Sin enviar". Tap "Copiar código".
5. Tap "Enviar ahora", then "Sí, enviar ahora". The state becomes "En camino".
6. Open a private window and go to `/rastrear`. Paste the code, in lower case and without dashes
   if you like. The page shows $96.51 and "En camino", and no name, phone or fee of the sender.
7. Sign out of Lucía and tap "Ana, administradora". Open "Monitor", then "Envíos", and tap the code.
8. Tap "Marcar como entregado", then "Sí, marcar como entregado".
9. Go back to the private window. The tracking page shows "Entregado" without a reload.
   Lucía's transfer page shows it too.

## Requisitos del reto técnico

The "Dev Challenge" list and the "Expected Technical Deliverables" of the remittance assignment,
with the screen or file that meets each one. Partial items say so.

| Requisito | Cómo se cumple | Estado |
|---|---|---|
| Sender and recipient interfaces | `/enviar`, `/envios`, `/recibidos`, `/t/[codigo]` | Cumple |
| Enter an amount to transfer | `/enviar` step 1; the preview on `/` | Cumple |
| Two or more units or currencies | USD and EUR to pay in; USD and sats (Lightning) to receive | Cumple |
| Conversion with a defined rate | `src/lib/cotizacion.ts`; EUR/USD 1.08 stored in `pay_tasas`; BTC/USD from Coinbase and Kraken, with a fixed price for demos | Cumple (BTC price is live when the sources answer) |
| Fees shown apart from the rate | Comisión line, with its formula in words | Cumple |
| Final amount received | Recibe line, rounded down | Cumple |
| Simulated transfers | `pay_crear_transferencia` in `market/supabase/migrations/20261014000005_pay.sql` | Cumple |
| Unique transfer identifiers | `codigo` CP-XXXX-XXXX: 8 random characters from a 32-character alphabet, unique in the table | Cumple (a collision fails the creation with an error; it is not retried) |
| States Created, Processing, Completed, Failed, Cancelled | Sin enviar, En camino, Entregado, No se pudo entregar, Cancelado (`src/lib/transferencias.ts`) | Cumple |
| Store sender, recipient, amount, conversion, fee, status | `pay_transferencias`, `pay_historial` | Cumple |
| Transaction history | `/envios` and `/recibidos`, with pages of 20 | Cumple |
| Inspect a transfer | `/envios/[id]`, `/recibidos/[id]`, `/t/[codigo]` | Cumple |
| Simulated completion and failure | Demo buttons in demo mode; the monitor for administrators | Cumple |
| Administrative or monitoring interface | `/monitor`: Resumen, Envíos, Embudo, Tarifas | Cumple |
| Server-side validation of calculations | `cotizarEnServidor`, `crearEnvio`, and the database recomputes fee and received amount | Cumple |
| Document the Bitcoin and Lightning path | "Path to Bitcoin and Lightning" below | Parcial: documented, not built |
| Expected: functional simulator | The whole app | Cumple |
| Expected: conversion engine | `src/lib/cotizacion.ts` | Cumple |
| Expected: fee calculation | `src/lib/cotizacion.ts`, `pay_tarifas` | Cumple |
| Expected: transfer creation | `src/servidor/transferencias.ts`, `pay_crear_transferencia` | Cumple |
| Expected: transfer state machine | `accionesPosibles` and the `pay_procesar`, `pay_completar`, `pay_fallar`, `pay_cancelar` functions | Cumple |
| Expected: transaction history | `/envios`, `/recibidos`, the timeline on each transfer | Cumple |
| Expected: sender and recipient experience | Screens listed above | Cumple |
| Expected: basic administrative dashboard | `/monitor` | Cumple |
| Expected: database design | `market/supabase/migrations/20261014000005_pay.sql` | Cumple |
| Expected: API documentation | Function signatures are in the server layer's code comments; there is no separate API document | Parcial: no written API reference |
| Expected: technical architecture | "How the data flows" and "Path to Bitcoin and Lightning" below | Cumple |
| Expected: calculation tests | `src/lib/*.test.ts`, `tests/db/` | Cumple |
| Expected: end-to-end demonstration | `tests/e2e/envio.spec.ts` and "Cómo recorrer la demo" | Cumple |

## Environment variables

Names only. The values go in `.env.local`, which git ignores.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key for the signed-in visitor (row-level security applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for the functions that write. Never sent to the browser |
| `PRECIO_FIJO_USD_BTC` | Optional fixed bitcoin price in USD, for offline work and the tests |
| `NEXT_PUBLIC_INGRESO` | Sign-in methods, in order: `telefono`, `correo`. Unset means both |
| `NEXT_PUBLIC_DEMO` | Set to `1` to show the demo accounts on `/entrar` and the demo buttons on transfers |
| `DEMO_CODIGO` | Optional code for the demo accounts. Unset means `123456` |

## How the data flows

The browser never writes to the database. A form posts to a server action, the action calls a
function in `src/servidor/`, and that function calls a Postgres function with the service role
after checking the session. Tables have row-level security on.

Money is stored in integer cents for USD and in whole sats. Fees round up when a person pays and
the amount received rounds down.

## Path to Bitcoin and Lightning

The simulator already has the shape of a real flow. The Lightning option quotes in sats from the
live BTC/USD price. A real version would replace the simulated states with a payment request
from a Lightning node (or a wallet service that implements the same request), wait for the
payment to settle, then pay out to the recipient. The cash and bank options would hand the
transfer to a payout partner in the same way. The states, codes and history stay the same.
