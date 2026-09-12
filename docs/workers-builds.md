# Workers Builds

Repositorio: `Bebras-Bolivia/bebras-contest`. La aplicación GitHub **Cloudflare
Workers and Pages** ya está instalada en la organización con acceso al repositorio.

En cada Worker, abrir **Settings → Builds → Connect** y configurar:

| Ajuste | Producción | Staging |
| --- | --- | --- |
| Worker | `bebras-contest` | `bebras-contest-staging` |
| Rama de producción del build | `master` | `staging` |
| Directorio raíz | `/` | `/` |
| Build command | `bun run setup && bun run build:production` | `bun run setup && bun run build:staging` |
| Deploy command | `bunx wrangler deploy --env production` | `bunx wrangler deploy --env staging` |
| Non-production branch builds | Deshabilitado | Deshabilitado |

Variables **del build**:

```text
BUN_VERSION=1.3.5
NODE_VERSION=22
SKIP_DEPENDENCY_INSTALL=1
```

`setup` instala los tres paquetes con sus lockfiles congelados. El build genera
Prisma para workerd, compila Astro y aplica el recorte sólo a producción. Si
Workers Builds comunica una rama distinta a la esperada, falla antes de compilar.
`develop` no debe estar conectado a ningún build.

Cloudflare proporciona el token de despliegue elegido en el Dashboard. La
autenticación pasó a Firebase y no requiere secrets de runtime: `FIREBASE_PROJECT_ID`
es una `var` de `wrangler.jsonc` y la configuración Web (`PUBLIC_FIREBASE_*`) la
inyecta `scripts/cloudflare-build.ts` según el entorno. Estos comandos no cargan
tareas, no ejecutan seeds y no borran/recrean D1 ni R2. Los cambios de esquema se
aplican explícitamente con las migraciones versionadas, primero en local.

## Estado comprobado

Los despliegues manuales funcionan con el OAuth de Wrangler disponible. La API
de Builds devuelve **403 / Authentication error** con esa sesión y
`wrangler login --scopes-list` no ofrece el scope Workers CI. La conexión queda
pendiente de completarla en el Dashboard o proporcionar un API token con
**Account → Workers CI → Edit** para configurarla mediante API. El token que
administra Builds y el token que ejecuta el despliegue tienen permisos distintos.
No guardar tokens en el repositorio ni usar OAuth de corta duración como token
persistente del build.

## Verificación al conectar

1. Sólo `master` y `staging` disparan sus respectivos Workers; previews desactivados.
2. Ejecutar un build para cada rama y comprobar el SHA desplegado.
3. Confirmar login y panel; producción conserva el recorte.
4. Verificar que permanecen administradores/colegios y no se cargaron tareas.

Referencias:
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/api/resources/workers_builds/subresources/triggers/methods/create/
- https://developers.cloudflare.com/fundamentals/api/reference/permissions/#account-permissions
