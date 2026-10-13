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
- Account page: display name, masked contact, sign out.
- The navigation for the sections that come next: Enviar, Mis envíos, Recibidos and, for
  administrators, Monitor.

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
| `npm test` | Unit tests with Vitest |

## Environment variables

Names only. The values go in `.env.local`, which git ignores.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public key for the signed-in visitor (row-level security applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for the functions that write. Never sent to the browser |
| `PRECIO_FIJO_USD_BTC` | Optional fixed bitcoin price in USD, for offline work |
| `NEXT_PUBLIC_INGRESO` | Sign-in methods, in order: `telefono`, `correo`. Unset means both |
| `NEXT_PUBLIC_DEMO` | Set to `1` to show the demo accounts on `/entrar` |
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
