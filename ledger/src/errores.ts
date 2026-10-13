// An error whose message is meant to be shown to the person at the terminal, in Spanish.
export class ErrorLedger extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorLedger";
  }
}
