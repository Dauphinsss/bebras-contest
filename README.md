# bebras-contest

Plataforma del **Desafío Bebras Bolivia**: gestión de tareas, competencias,
grupos, participantes y evaluación.

- `frontend/`: Astro 5 + React 19 + Tailwind + Shadcn/ui
- `backend/`: Express 5 + TypeScript + Prisma + SQLite

Gestor de paquetes: **Bun**.

## Puesta en marcha

```bash
bun run setup
```

Copia los archivos de entorno y ajusta los valores:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Prepara la base de datos y carga los datos iniciales:

```bash
cd backend
bun run prisma:generate
bun run prisma:push
bun run db:seed
bun run db:admins
```

Levanta backend y frontend juntos desde la raíz:

```bash
bun run dev
```

## Base de datos

La base local (`backend/dev.db`) **no se versiona**. Se reconstruye con
`prisma:push` mas `db:seed`.

| Comando | Qué hace |
| --- | --- |
| `bun run db:seed` | Carga los colegios desde `prisma/seed/schools.ndjson.gz`. No hace nada si ya hay datos; usa `--force` para reemplazarlos. |
| `bun run db:schools:fetch` | Vuelve a descargar las unidades educativas del MINEDU y regenera el snapshot. Solo hace falta cuando el listado oficial cambia. |
| `bun run db:admins` | Crea las cuentas de administración. La contraseña sale de `SEED_ADMIN_PASSWORD`. |
| `bun run db:clear-teams` | Borra equipos e intentos para volver a probar el flujo. |

## Pruebas

```bash
bun run test:e2e
```

Requiere backend y frontend corriendo.
