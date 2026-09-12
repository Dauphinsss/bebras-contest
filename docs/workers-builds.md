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

Los despliegues manuales funcionan con el OAuth de Wrangler. Con un API token de
usuario con **Workers Builds Configuration: Edit** y **Workers Scripts: Read**,
la API de Builds ya responde: se resuelven los tags de ambos Workers y se llega a
`builds/repos/connections`.

Lo que **no** se puede hacer por API es la autorización inicial de la cuenta de
GitHub: es un OAuth del Dashboard, no hay endpoint para crearla ni para listar
instalaciones. Sin ella, crear la conexión responde:

```text
8000008  This project is disconnected from your Git account
```

y `builds/tokens` viene vacío, porque Cloudflare crea el build token al conectar
el repositorio. Hay que hacer esa conexión una vez desde el Dashboard.

El lado de GitHub **ya está completo**: la app `cloudflare-workers-and-pages`
está instalada en la organización con acceso a todos los repositorios
(installation `160729019`, comprobado con `gh api orgs/Bebras-Bolivia/installations`).
Lo que falta es solo que la cuenta de Cloudflare guarde esa asociación, y eso lo
crea el OAuth del Dashboard. El error es el mismo con el id de la organización
(`295968330`) y con el de la instalación, así que no es cuestión de dar con el
identificador correcto.

Al pulsar *Connect*, GitHub redirige a la página de instalación: hay que elegir
la organización **Bebras-Bolivia**, no la cuenta personal, porque el repositorio
es de la organización. Como la app ya está instalada ahí, es un paso de
confirmación y vuelve a Cloudflare.

Datos ya resueltos, por si se configura por API:

| | |
| --- | --- |
| Cuenta | `a9ca7f3bfd5ff492721f722856ac79b6` |
| Repositorio | `Bebras-Bolivia/bebras-contest` (id `1195777825`, org `295968330`) |
| Tag de `bebras-contest` | `4c3e208b37024d22b0bd4b9829cddef7` |
| Tag de `bebras-contest-staging` | `40c913ff795147878d4c502300477ade` |

```powershell
$env:CLOUDFLARE_API_TOKEN = '<token de usuario>'
bun scripts/cloudflare-builds-setup.ts --check
bun scripts/cloudflare-builds-setup.ts
```

El script crea la conexión y los dos triggers una vez exista la autorización.
El token que administra Builds y el que ejecuta el despliegue tienen permisos
distintos. No guardar tokens en el repositorio ni usar OAuth de corta duración
como token persistente del build.

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
