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

| | |
| --- | --- |
| Project ID | `bebras-bo` |
| Alias en `.firebaserc` | `production` |
| App Web | `1:1026208753397:web:652dd936ef213b6bab87bc` |
| Proveedores | Email/Password y Google, solo esos |

Los proveedores se declaran en `firebase.json` y se aplican por CLI:

```powershell
npx firebase deploy --only auth --project production
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

Autorizados hoy: `bebras-bo.firebaseapp.com`, `bebras-bo.web.app` y el Worker de
producción. Para desarrollar en local contra este proyecto hay que agregar
`localhost`.

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

Worker (`wrangler.jsonc` → `vars`), local en `.dev.vars`:

```text
FIREBASE_PROJECT_ID   production = bebras-bo | staging y local = vacío
```

Frontend (`PUBLIC_*`, públicas por diseño, viajan en el bundle). Producción las
inyecta `scripts/cloudflare-build.ts`; en local salen de `frontend/.env`:

```text
PUBLIC_FIREBASE_API_KEY
PUBLIC_FIREBASE_AUTH_DOMAIN
PUBLIC_FIREBASE_PROJECT_ID
PUBLIC_FIREBASE_APP_ID
PUBLIC_FIREBASE_MESSAGING_SENDER_ID
```

Vacío = entorno sin Firebase: los formularios lo dicen y no dejan entrar. Es el
estado de **staging**, que deberá usar un proyecto Firebase propio para no
compartir usuarios con producción.

## Migración de cuentas existentes

```powershell
bun scripts/firebase-migrate-users.ts --target production --check
bun scripts/firebase-migrate-users.ts --target production
```

Sube a Firebase las filas de D1 con `passwordHash` y sin `firebaseUid`,
**conservando la contraseña**: bcrypt viaja tal cual con `--hash-algo=BCRYPT`.
El UID es `bebras-d1-<id>`, derivado del id de D1, así que reejecutar no duplica
identidades. Después guarda ese UID en `User.firebaseUid`.

`emailVerified` se importa en `false`: no se afirma una verificación que nunca
ocurrió. Esas cuentas deben verificar su correo antes de poder entrar.

> Las tres cuentas de administrador usan direcciones `@bebras.bo`. Si ese dominio
> no recibe correo, no podrán completar la verificación. La salida es cambiarles
> el correo a uno real y volver a ejecutar la migración.

## Estado en local

```powershell
bun run db:push          # aplica 0002_user_firebase_uid.sql
# .dev.vars con FIREBASE_PROJECT_ID y frontend/.env con las PUBLIC_FIREBASE_*
bun run dev
```

## Pruebas pendientes

Las suites Playwright y `scripts/cloudflare-smoke.test.mts` firmaban su propio
JWT o llamaban a `/api/auth/login`. Con Firebase necesitan tokens reales:

- `tests/support/helpers.ts` ya pide el token a Identity Toolkit y requiere
  `E2E_FIREBASE_API_KEY` (emulador de Auth o un proyecto de pruebas, **nunca**
  `bebras-bo`);
- `cloudflare-smoke.test.mts` avisa y no corre hasta adaptarlo: necesita emitir
  tokens desde el emulador y que el Worker acepte ese emisor.

Lo ya comprobado de extremo a extremo contra el Worker: token ausente e
inválido, bloqueo por correo sin verificar, registro con correo sin verificar,
registro duplicado, entrada tras verificar, rechazo de rutas de admin a un
maestro y enlace por correo sin duplicar la fila.
