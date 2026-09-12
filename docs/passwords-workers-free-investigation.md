# Hash de contraseñas en Workers Free — investigación local

Fecha: 2026-09-11.

## Estado de integración posterior a la investigación

`backend/src/lib/password-service.ts` ya implementa **`PasswordService`**, un DO
SQLite enlazado mediante `PASSWORDS`, con hash **bcryptjs coste 10** y verificación
de los hashes bcrypt existentes. No se migró a scrypt/PBKDF2 ni se redujo el coste.
Cada operación usa un identificador aleatorio generado por el servidor; no escribe
contraseñas en el storage del DO. El bootstrap también genera bcrypt coste 10,
fuera del Worker.

Esta separación traslada el hash/verificación al presupuesto del DO para preservar
la CPU Free del Worker HTTP principal. **La atribución CPU y el funcionamiento
alojado siguen sin verificarse remotamente**: el smoke local no certifica el límite
Free ni las cuotas de DO. `bun scripts/cloudflare-smoke.test.mts` pasó **10/10 grupos**,
incluyendo login correcto/incorrecto, altas y comprobación de coste 10 persistido.

Las secciones siguientes conservan los resultados y recomendaciones de la
investigación previa. Las propuestas de scrypt/formato futuro son exploratorias;
el contrato vigente de la aplicación es bcrypt10 mediante `PasswordService`.

## Decisión de la investigación previa

**No integrar un reemplazo directo de bcrypt por scrypt/PBKDF2 dentro del handler
HTTP Free de 10 ms.** Ninguna configuración nativa OWASP probada se acerca a ese
presupuesto. Callback, Promise y WebCrypto no convierten el cálculo en I/O exento.

**No se puede concluir que toda arquitectura gratuita sea inviable:** un Durable
Object SQLite es una alternativa documentada, disponible en Free, con límite de
CPU propio de 30 segundos y cuotas de requests/duración. El binding y scrypt se
verificaron funcionalmente en workerd local. Su atribución de CPU alojada y los
límites efectivos de KDF no se han verificado remotamente. Es un candidato para
integración posterior, no una certificación de Free desde el emulador.

La investigación no creó `passwords.ts` de producción bajo la premisa de que
cabe en Free. Su entregable fue una prueba reproducible y esta decisión para el
integrador; el estado posterior está descrito arriba.

## Prueba ejecutada

```sh
node scripts/passwords-workerd-probe.mjs
node scripts/passwords-workerd-probe.mjs --bindings-only
```

Windows, Node v24.14.0, Wrangler 4.131.0, Miniflare 5.20260910.0-alpha,
workerd 1.20260910.1; compatibility date 2026-09-11, `nodejs_compat`.
Se usan dependencias ya instaladas, bundle en memoria y recursos locales
efímeros de Miniflare. No se carga la configuración de la aplicación ni sus
bindings, secretos o bases de datos.

Medición: `TotalProcessorTime` de **nuestro proceso hijo workerd.exe**, incluyendo
código nativo y todos sus threads; no CPU de Node/Bun. Un calentamiento y tres
lotes de diez operaciones por variante. Los resultados son promedios por lote,
no percentiles por petición. La duración se mide desde el cliente; no se usa el
reloj restringido del Worker. La lectura del contador de CPU se hace fuera de la
ventana de wall time. El contador Windows tiene granularidad limitada, amortizada
por el lote. El control vacío dio 0 ms CPU y aproximadamente 0,5 ms de wall por
lote dividido por diez. No representa el coste del endpoint Express/Prisma.

**CPU de proceso local no es el medidor de límites/facturación de Cloudflare.**
Que diez hashes completen en una petición local tampoco demuestra que esa
petición esté permitida en Free.

Todos los resultados nativos se contrastaron byte a byte contra Node crypto
para contraseña UTF-8 con acento y emoji, salt fijo de 16 bytes y salida de 32
bytes. Los valores fijos son vectores de prueba públicos, no formato de almacenamiento.

### Resultados: medianas de los tres promedios por lote

| Variante | Parámetros | CPU local ms/op | Wall ms/op |
| --- | --- | ---: | ---: |
| bcryptjs | coste 10 | 59,375 | 58,707 |
| scrypt callback | N=131072, r=8, p=1 | 203,125 | 204,222 |
| scrypt callback | N=65536, r=8, p=2 | 189,063 | 191,087 |
| scrypt callback | N=32768, r=8, p=3 | 137,500 | 137,543 |
| scrypt callback | N=16384, r=8, p=5 | 112,500 | 112,996 |
| scrypt callback | N=8192, r=8, p=10 | 107,813 | 109,290 |
| PBKDF2 callback SHA-256 | 600000 iteraciones | 225,000 | 226,769 |
| PBKDF2 callback SHA-512 | 220000 iteraciones | 104,688 | 106,066 |
| WebCrypto PBKDF2 SHA-256 | 600000 iteraciones | 217,188 | 218,374 |
| WebCrypto PBKDF2 SHA-512 | 220000 iteraciones | 103,125 | 103,649 |

También se ejecutaron `scryptSync` y `pbkdf2Sync` con todos esos parámetros:
resultados correctos y costes comparables. El script imprime cada muestra.

Como **controles diagnósticos, no candidatos**, scrypt N=16384,r=8,p=1 dio 25 ms
CPU y PBKDF2 SHA-256/100000 aproximadamente 37,5 ms. No cumplen los mínimos
OWASP usados aquí y tampoco encajan. No se propone bajar coste.

El benchmark establece `maxmem=192 MiB` para explorar también N=131072.
Eso no aumenta la memoria del Worker: ese perfil consume unos 128 MiB solo
para scrypt y no deja margen en un isolate de 128 MB. Para un futuro DO, el
perfil N=16384,r=8,p=5 usa aproximadamente 16 MiB, es una de las configuraciones
OWASP explícitas y permite `maxmem=32 MiB` en un módulo definitivo.

## Restricciones nativas y WebCrypto

Las docs de `node:crypto` anuncian soporte salvo excepciones, entre ellas
`argon2` y `argon2Sync`. WebCrypto ofrece PBKDF2, no scrypt ni Argon2.

La implementación pública muestra restricciones adicionales:

- `IsolateLimitEnforcer::checkPbkdfIterations`: máximo **por defecto** de
  100000 iteraciones, inferior a SHA-256/600000 y SHA-512/220000 de OWASP.
- `checkScryptCost`: máximo **por defecto** de `N*r*p <= 2^20`.
  Todos los perfiles scrypt OWASP de la tabla respetan ese producto;
  N=16384,r=8,p=5 da 655360.
- Node PBKDF2 y WebCrypto llaman al mismo control de iteraciones.
- Los controles son virtuales, delegados al limit enforcer. Los defaults del
  código público no prueban los overrides del servicio alojado.
- Este workerd local aceptó 100000, **100001**, 220000 y 600000 iteraciones.
  Por tanto no reproduce el default de 100000 en esta ejecución. No asumir que
  pasar a `node:crypto` evita ese límite en producción.
- WebCrypto PBKDF2 requiere importación `raw`, clave no extraíble,
  uso `deriveBits`/`deriveKey`, iteraciones positivas y longitud de bits múltiplo
  de ocho. El código nativo comprueba además la longitud derivada.
- `crypto_scrypt.ts` ejecuta `cryptoImpl.getScrypt(...)` dentro del constructor
  de una Promise y luego entrega el callback. El cálculo no se envía al
  threadpool libuv de Node. PBKDF2/scrypt terminan en funciones nativas de
  ncrypto/BoringSSL. No hay base para declarar su CPU exenta.

## Bindings y opción gratuita

### Service Binding a otro Worker común

La documentación de precios suma CPU de A+B. Separar el hash en un Worker
común no ofrece evidencia de eludir el límite Free; la API async no elimina el
cómputo y el Worker receptor sigue sujeto a sus límites.

### Binding a Durable Object SQLite

La documentación específica de DO enumera 30 s de CPU por request y permite
SQLite en Free. Las cuotas gratuitas publicadas son 100000 requests/día y
13000 GB-s/día, con cómputo medido por duración; no es cómputo ilimitado ni
invisible. La espera de I/O del llamador no cuenta como su CPU según Workers
Limits; el DO realiza y contabiliza el trabajo en su propio modelo.

Prueba real: Worker -> binding `HASHER` -> DO SQLite `PasswordProbe` -> scrypt
N=16384,r=8,p=5. Resultado idéntico al cálculo directo, diez operaciones:
**112,5 ms CPU/op de proceso**, **114,22 ms wall/op**.
Se repitió con `maxmem=32 MiB`: correcto, 112,5 ms CPU/op y 113,832 ms wall/op.
El contador del proceso incluye tanto el llamador como el DO: no permite
afirmar cuánto reportaría Workers Logs para cada uno. La documentación de DO
también contiene frases generales sobre límites iguales a Workers; aquí se
usa la tabla específica de CPU de DO, sin convertirla en prueba remota.

Para el integrador, esta es la vía gratuita razonable a evaluar. Requeriría
exportar una clase DO, declarar binding y migración `new_sqlite_classes`, y
ejecutar hash/verificación dentro del DO. No basta con añadir un helper local.
Evitar un único objeto global que serialice todos los accesos; el reparto debe
ser acotado y considerar las cuotas de duración/memoria. No guardar passwords
en el storage del objeto.

## Propuesta exploratoria de formato futuro (no adoptada)

Si se adopta la vía DO o un presupuesto Paid suficiente, el candidato nativo
es scrypt N=16384,r=8,p=5, salida de 32 bytes y salt aleatorio de 16 bytes.
Usar formato versionado que incluya parámetros, salt y derivado, con parser
estricto, límites de entrada y comparación de tiempo constante. Verificar
password correcta/incorrecta, Unicode, nulos, entradas malformadas, salts
distintos y compatibilidad cruzada antes de integrarlo.

Para remotos vacíos indicados por el solicitante, crear solo el nuevo formato.
La compatibilidad bcrypt debe ser opt-in para hashes locales existentes,
conservar coste 10 y contemplar su límite de 72 bytes. No regenerar bcrypt
para altas nuevas. No se inspeccionaron bases remotas.

## Fuentes consultadas

- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) (actualización 2026-09-05)
- [Node crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)
- [WebCrypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Workers Pricing / Service bindings](https://developers.cloudflare.com/workers/platform/pricing/#service-bindings)
- [DO Limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [DO Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Limit enforcer público](https://github.com/cloudflare/workerd/blob/main/src/workerd/io/limit-enforcer.h)
- [Controles de KDF](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/crypto/impl.c++)
- [Node crypto nativo](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/node/crypto.c++)
- [Callback scrypt](https://github.com/cloudflare/workerd/blob/main/src/node/internal/crypto_scrypt.ts)
- [PBKDF2 nativo/WebCrypto](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/crypto/pbkdf2.c++)
- [scrypt nativo](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/crypto/scrypt.c++)

Las fuentes `main` son una revisión actual, no una prueba de identidad exacta
con el binario instalado ni con la versión alojada.
