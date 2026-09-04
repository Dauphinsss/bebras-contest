# bebras-contest

Plataforma del **Desafío Bebras Bolivia**: gestión de tareas, competencias,
grupos, participantes y evaluación.

- `frontend/`: Astro 5 + React 19 + Tailwind + Shadcn/ui
- `backend/`: Express 5 + TypeScript + Prisma + SQLite

Gestor de paquetes: **Bun**.

## Puesta en marcha

Ejecuta todos los comandos desde la raíz del repositorio:

```bash
bun run setup
bun run env:setup
```

`env:setup` crea `backend/.env` y `frontend/.env` a partir de sus ejemplos sin
sobrescribir archivos existentes. Revisa sus valores y cambia
`SEED_ADMIN_PASSWORD` antes de crear las cuentas de administración.

Prepara Prisma, la base de datos y los datos iniciales:

```bash
bun run db:setup
```

Levanta backend y frontend juntos:

```bash
bun run dev
```

## Base de datos

La base local (`backend/dev.db`) **no se versiona**. Se reconstruye con
`prisma:push` mas `db:seed`.

| Comando                    | Qué hace                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `bun run db:setup`         | Genera el cliente Prisma, sincroniza el esquema y carga colegios, tareas Bebras y administradores. |
| `bun run db:seed`          | Carga los colegios desde `backend/prisma/seed/schools.ndjson.gz`. No hace nada si ya hay datos; usa `--force` para reemplazarlos. |
| `bun run db:tasks`         | Carga el banco de tareas Bebras desde `backend/prisma/seed/bebras-tasks.json`.                                                    |
| `bun run db:schools:fetch` | Vuelve a descargar las unidades educativas del MINEDU y regenera el snapshot. Solo hace falta cuando el listado oficial cambia.   |
| `bun run db:admins`        | Crea las cuentas de administración. La contraseña sale de `SEED_ADMIN_PASSWORD`.                                                  |
| `bun run db:clear-teams`   | Borra equipos e intentos para volver a probar el flujo.                                                                           |

## Pruebas

```bash
bun run test:e2e
```

El comando crea una base temporal, carga las semillas, inicia backend y frontend
en puertos de prueba y elimina la base al terminar. No requiere procesos previos.
