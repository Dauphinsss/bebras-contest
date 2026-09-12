# Firebase Authentication

Firebase es el sistema de identidad de Bebras: decide **quién es** la persona.
Bebras sigue siendo dueño de **sus datos** (rol, estado de aprobación, colegios,
documentos). La relación entre ambos es `User.firebaseUid`, nunca el correo.

```text
Frontend (Astro/React en Cloudflare)
        ↓  Firebase Web SDK
Firebase Authentication  →  ID Token (RS256)
        ↓  Authorization: Bearer <id-token>
Worker en Cloudflare  →  verificación por JWKS
        ↓
D1 (User.firebaseUid)
```

No se usa Firestore, Realtime Database, Storage, Functions ni Hosting.

## Proyecto y proveedores

Producción usa un proyecto independiente. Desarrollo local comparte únicamente
las identidades de Firebase con staging; sus datos de aplicación siguen en D1/R2
locales:

| | Producción | Staging y desarrollo local |
| --- | --- | --- |
| Project ID | `bebras-bo` | `bebras-bo-staging` |
| Alias en `.firebaserc` | `production` | `staging` |
| App Web | `1:1026208753397:web:652dd936ef213b6bab87bc` | `1:88239195646:web:044edbc9ca41c429286caf` |
| Proveedores | Email/Password y Google | Email/Password y Google |
| D1 | `bebras-prod` | `bebras-staging` (staging) / D1 local (desarrollo) |

Los dos habilitan **solo** Email/Password y Google.

Los proveedores se declaran en `firebase.json` y se aplican por CLI:

```powershell
npx firebase deploy --only auth --project production
npx firebase deploy --only auth --project staging
```

`authorizedRedirectUris` no se declara: el proyecto ya registra
`https://bebras-bo.firebaseapp.com/__/auth/handler` y repetirlo hace fallar el
despliegue con `OAuth 2 redirect URLs have duplicate`.

### Dominios autorizados

Google sign-in solo funciona desde un dominio autorizado; si falta, el navegador
responde `auth/unauthorized-domain`. El CLI no tiene un comando para esto, pero
sí el módulo interno que usa `hosting:channel:deploy`, con la misma sesión de
`firebase login`:

```powershell
bun scripts/firebase-authorized-domains.ts
bun scripts/firebase-authorized-domains.ts --add bebras-contest.bebrasbolivia.workers.dev
```

Autorizados hoy:

- **producción**: `bebras-bo.firebaseapp.com`, `bebras-bo.web.app` y
  `bebras-contest.bebrasbolivia.workers.dev`;
- **staging**: los suyos, `bebras-contest-staging.bebrasbolivia.workers.dev` y
  `localhost`.

Para desarrollar en local conviene apuntar a **staging**, que ya autoriza
`localhost`; producción no lo autoriza a propósito.

## Verificación de tokens en el Worker

`backend/src/lib/firebase-auth.ts` valida los ID Token con **jose** y Web Crypto,
sin Admin SDK ni Service Account: el Admin SDK no corre sobre workerd y una
Service Account seria una credencial privada mas que custodiar.

Se comprueba, siguiendo el procedimiento oficial de Firebase:

- firma RS256 contra `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`;
- `iss` = `https://securetoken.google.com/<FIREBASE_PROJECT_ID>`;
- `aud` = `<FIREBASE_PROJECT_ID>`;
- `sub` presente y `auth_time` ya ocurrido.

El JWKS se cachea en el isolate; `jose` lo revalida solo ante un `kid` nuevo.

## Correo verificado

Solo el proveedor `password` puede llegar con el correo sin confirmar; Google lo
verifica por si mismo. La regla vive en `needsEmailVerification`:

- **entrar**: correo sin verificar → `403 EMAIL_NOT_VERIFIED`, con opción de
  reenviar el enlace desde el formulario;
- **registrarse**: permitido sin verificar (`allowUnverified`), porque Firebase
  manda el correo *después* de crear la cuenta. El perfil se guarda, pero no se
  entra al sistema hasta verificar.

## Rutas

| Ruta | Qué hace |
| --- | --- |
| `POST /api/auth/session` | Cambia el ID Token por el perfil Bebras. Enlaza por correo si el UID aún no está asociado. `404 PROFILE_REQUIRED` cuando falta registrarse. |
| `POST /api/auth/register` | Crea el perfil Bebras para la identidad del token. Sin contraseña: la guarda Firebase. |
| Resto | `requireAuth` / `requireAdmin` resuelven el usuario por `firebaseUid`. |

`POST /api/auth/login` y el JWT propio (HS256) fueron retirados.

## Sin usuarios duplicados

`/api/auth/session` busca primero por `firebaseUid`. Si no hay coincidencia y
existe una fila con ese correo, la enlaza en vez de crear otra: es el caso de los
admins migrados y el de quien ya tenía cuenta y ahora entra con Google. Un correo
ya enlazado a otro UID responde `409 UID_CONFLICT` en lugar de reasignarse.

En el navegador, cuando Firebase responde
`auth/account-exists-with-different-credential`, el formulario guarda la
credencial de Google, pide la contraseña existente y hace `linkWithCredential`:
es el flujo oficial de vinculación, sin identidades paralelas.

## Variables

Worker (`wrangler.jsonc` → `vars`):

```text
FIREBASE_PROJECT_ID   production = bebras-bo
                      staging/local = bebras-bo-staging
```

Frontend (`PUBLIC_*`, públicas por diseño, viajan en el bundle). Los builds las
inyectan desde `scripts/firebase-config.ts`; `bun run dev` inyecta staging:

```text
PUBLIC_FIREBASE_API_KEY
PUBLIC_FIREBASE_AUTH_DOMAIN
PUBLIC_FIREBASE_PROJECT_ID
PUBLIC_FIREBASE_APP_ID
PUBLIC_FIREBASE_MESSAGING_SENDER_ID
```

Vacío = entorno sin Firebase: los formularios lo dicen y no dejan entrar.

`bun run dev` siempre levanta Astro y Wrangler local con Firebase staging. No
selecciona bindings remotos ni permite producción. La cuenta y su UID existen en
Firebase staging; el perfil Bebras asociado se crea o enlaza independientemente
en D1 local. Para probar staging con su D1/R2, se abre el sitio desplegado.

`REGISTRATION_ONLY` es independiente de todo esto: `true` solo en producción, que
por eso oculta las secciones que no son inscripción. Staging lo tiene en `false`
y muestra todo.

## Migración de cuentas existentes

```powershell
bun scripts/firebase-migrate-users.ts --target production --check
bun scripts/firebase-migrate-users.ts --target production
# staging usa su propio proyecto y su propia D1
bun scripts/firebase-migrate-users.ts --target staging
```

Sube a Firebase las filas de D1 con `passwordHash` y sin `firebaseUid`,
**conservando la contraseña**: bcrypt viaja tal cual con `--hash-algo=BCRYPT`.
El UID es `bebras-d1-<id>`, derivado del id de D1, así que reejecutar no duplica
identidades. Después guarda ese UID en `User.firebaseUid`.

`emailVerified` se importa en `false`: no se afirma una verificación que nunca
ocurrió. Esas cuentas deben verificar su correo antes de poder entrar.

### Excepción: `--mark-verified`

```powershell
bun scripts/firebase-migrate-users.ts --target production --mark-verified --check
bun scripts/firebase-migrate-users.ts --target production --mark-verified
```

Reimporta cuentas **ya migradas** con `emailVerified: true`, conservando su
contraseña. Es una decisión del operador, no del script, y solo tiene sentido
cuando esas direcciones no pueden recibir el enlace de Firebase.

Se aplicó a los tres administradores: `bebras.bo` no existe en DNS (`NXDOMAIN`,
sin registros MX), así que la verificación normal era imposible y sin esto
habrían quedado sin acceso a producción. Si algún día esas cuentas pasan a
direcciones reales, lo correcto es cambiar el correo y verificarlo de verdad.

> Reimportar **sin** el hash borra la contraseña de la cuenta. El script siempre
> reenvía el hash existente junto con `--hash-algo=BCRYPT`.

## Estado en local

```powershell
bun run db:push          # aplica 0002_user_firebase_uid.sql
bun run dev
```

## Pruebas pendientes

Las suites Playwright antiguas firmaban su propio JWT o llamaban a
`/api/auth/login`. Con Firebase necesitan tokens reales:

- `tests/support/helpers.ts` ya pide el token a Identity Toolkit y requiere
  `E2E_FIREBASE_API_KEY` (emulador de Auth o un proyecto de pruebas, **nunca**
  `bebras-bo`).

El smoke heredado de Cloudflare se eliminó en lugar de conservar una prueba
desactivada que ya no representaba la autenticación desplegada.

Lo ya comprobado de extremo a extremo contra el Worker: token ausente e
inválido, bloqueo por correo sin verificar, registro con correo sin verificar,
registro duplicado, entrada tras verificar, rechazo de rutas de admin a un
maestro y enlace por correo sin duplicar la fila.
