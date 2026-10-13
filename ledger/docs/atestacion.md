# La atestación de tasa

El DTE tiene un campo para el monto, pero no tiene campo para los sats, la tasa, el hash del pago
ni el momento en que llegó el dinero. Cuando un ticket se paga por Lightning, CacaoLedger escribe
una **atestación**: un registro con esos datos que el DTE no puede guardar.

## Qué guarda cada registro

Un registro está en `datos/atestaciones.jsonl`, una línea JSON por registro:

- `ticket`, `codigoGeneracion`, `numeroControl` y `tipoDte` del DTE al que pertenece.
- `generacion` de esquemas con la que se construyó.
- `sats` recibidos, `usdCentavos` (el monto en dólares en centavos), `tasaUsdPorBtc` y `tasaFuente`.
- `momentoPago` (el instante en que el riel liquidó el pago), `paymentHash` y la forma de pago
  que se emitió (`codigoFormaPago`) con la `referencia` que quedó en el DTE.
- `registrada`: cuándo se escribió el registro.
- `anterior`: el `hash` del registro previo. El primero lleva 64 ceros.
- `hash`: la huella del propio registro.

Los números enteros van como enteros. Los decimales (la tasa) van como texto, para que no haya
redondeos de coma flotante.

## Cómo se calcula el hash

El `hash` es SHA-256 de la forma canónica del registro **sin** el campo `hash`. La forma canónica
ordena las claves por nombre, no deja espacios y escribe los enteros sin parte decimal. Por eso el
hash no depende del orden en que se escribieron las claves. Está probado en `src/atestacion.test.ts`.

## Cuándo se escribe

Una sola vez por cada par (ticket, `codigoGeneracion`). Si se vuelve a construir el mismo
documento, la CLI no escribe otro registro. Las pruebas lo cubren.

## Qué se puede comprobar

```
ledger atestacion verificar
```

Recorre la cadena entera y se detiene en el primer enlace roto. Informa la línea y la razón:

- Si cambió un campo de un registro, la verificación falla en ese registro: su contenido ya no
  coincide con su `hash`.
- Si se borró una línea del medio, falla en el registro siguiente: su `anterior` apunta a un
  registro que ya no está.
- Si se cambió el orden de dos líneas, falla en la primera línea desordenada, por la misma razón.

`ledger atestacion exportar` imprime la **cabeza** de la cadena (el `hash` del último registro) y
el número de registros. La cabeza es la pieza que el comerciante guarda fuera de la carpeta de
datos: en una nota, en un mensaje a sí mismo, o en una marca de tiempo publicada.

## Qué prueba la cadena

Prueba que **un registro no se alteró después de que se escribieron los siguientes**. Si alguien
cambia un monto en un registro de hace seis meses, la cadena se rompe en ese registro, porque el
registro siguiente se calculó con el hash original.

Con la cabeza guardada fuera, la cadena también muestra si se borraron registros al final, algo
que la cadena sola no puede ver: si quedan menos registros o la cabeza cambió, hubo un borrado.

## Qué NO prueba

- **No prueba que la tasa sea justa.** La tasa es la que el riel informó (en este caso, Blink, en
  `settlementDisplayAmount / settlementAmount`). Si el riel la informó mal, la cadena lo guarda
  bien y no lo detecta.
- **No prueba que el pago existió.** Eso se comprueba contra la billetera: el `paymentHash` debe
  aparecer en el historial del comercio con esos sats. La cadena solo garantiza que el registro no
  cambió.
- **No prueba quién escribió el registro.** Cualquiera con acceso a la carpeta puede escribir un
  registro nuevo y calcular su hash. Una cadena sin firma y sin cabeza publicada demuestra
  integridad, no autoría.
- **No prueba que un registro falso no se haya añadido al final** si no hay una cabeza guardada
  fuera antes de ese momento.

## Por qué una cadena de hashes y no una firma

Para un solo comerciante, una firma exige una clave privada. Esa clave tendría que guardarse en la
misma máquina que la base de datos, y quien pueda leer la máquina puede firmar. La cadena de hashes
no necesita secretos: cualquiera puede recalcularla, y el comerciante puede comprobarla sin pedir
nada a nadie. Es el mínimo que hace que una alteración sea visible.

## Cómo añadir una firma o un ancla externa

- **Firma.** Cada registro, o la cabeza, se firma con una clave que no esté junto a los datos
  (una llave de hardware o una clave en un gestor de contraseñas). La verificación pasa a ser
  «la cadena es íntegra y la cabeza la firmó esta clave». Con `node:crypto` basta con `sign` y
  `verify` con Ed25519. Cambia `verificarCadena` para comprobar la firma de la cabeza.
- **Ancla externa.** Se publica la cabeza en un lugar con fecha que el comerciante no controla: una
  nota con marca de tiempo, un mensaje con sello, o un registro de transacciones. Desde ese momento,
  cualquier cambio posterior a esa cabeza es visible contra algo externo.

Ninguna de las dos está implementada. Las dos encajan sin cambiar el formato de los registros:
la cadena sigue igual y se añade un paso por encima.

## Lo que este documento no cubre

Las atestaciones no reemplazan la conciliación con la billetera ni con el banco. Sirven para que
el registro de la tasa, que el DTE no puede contener, no se pueda cambiar en silencio.
