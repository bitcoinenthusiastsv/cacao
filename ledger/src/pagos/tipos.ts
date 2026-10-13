// A settled payment, in the shape the rest of the tool uses. Each rail adapter
// (blink.ts, efectivo.ts) produces one of these and nothing else reads raw rail data.

export type Rail = "lightning" | "efectivo";

export interface PagoLightning {
  rail: "lightning";
  // What the customer paid, in USD cents, as the rail reports it.
  montoCentavos: number;
  // ISO-8601 time the rail settled the payment.
  momento: string;
  // Amount received in satoshis (integer).
  sats: number;
  // USD per BTC, two decimals, derived as montoCentavos / sats. Display only: the exact
  // amounts above are the source of truth.
  tasaUsdPorBtc: string;
  // Where the USD figure came from, in words, for the attestation later.
  tasaFuente: string;
  // Lightning payment hash, 64 hex characters. Links the payment to the rail's own record.
  paymentHash: string;
  // The rail's own transaction id.
  idTransaccion: string;
}

export interface PagoEfectivo {
  rail: "efectivo";
  montoCentavos: number;
  momento: string;
}

export type Pago = PagoLightning | PagoEfectivo;
