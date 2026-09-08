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

| Comando                                      | Qué hace                                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `bun run db:setup`                           | Genera el cliente Prisma, sincroniza el esquema y carga colegios, tareas Bebras y administradores.                                |
| `bun run db:seed`                            | Carga los colegios desde `backend/prisma/seed/schools.ndjson.gz`. No hace nada si ya hay datos; usa `--force` para reemplazarlos. |
| `bun run db:tasks`                           | Valida el banco Bebras e inserta solo las tareas que faltan; nunca sobrescribe tareas existentes.                                 |
| `bun run db:tasks:replace --confirm-replace` | Respalda la base y reemplaza tareas, concursos, grupos, equipos, intentos y resultados por el catálogo oficial. Es destructivo.   |
| `bun run db:schools:fetch`                   | Vuelve a descargar las unidades educativas del MINEDU y regenera el snapshot. Solo hace falta cuando el listado oficial cambia.   |
| `bun run db:admins`                          | Crea las cuentas de administración. La contraseña sale de `SEED_ADMIN_PASSWORD`.                                                  |
| `bun run db:clear-teams`                     | Borra equipos e intentos para volver a probar el flujo.                                                                           |

Los recortes corregidos del banco se pueden regenerar con
`uv run --with pymupdf python backend/scripts/recrop-task-images.py`.
El script requiere el PDF original en `tareas-otono-2024/_referencia/`, conserva
los identificadores de las imágenes y modifica únicamente la semilla JSON.
`bun run db:tasks` carga las tareas oficiales que falten en la base configurada.
Los tres fixtures sintéticos se cargan únicamente en la base temporal E2E.
El reemplazo explícito conserva intactos colegios, usuarios y solicitudes de
maestros. El respaldo verificado queda junto a la base como
`*.db.backup-<fecha>`; también se puede indicar otra ubicación con
`--backup <ruta>`. Detén el backend antes de ejecutarlo.

## Autoría de arrastre

En **Editar posiciones**, agrega todos los destinos permitidos y ajusta su
posición y radio. **Agregar pieza** y **Agregar destino** son independientes:
puede haber más destinos que piezas.

En **Definir solución**, coloca las piezas en la solución principal y usa
**Otra solución** para registrar otros acomodos correctos. Puedes arrastrar,
usar el teclado o elegir el destino de cada pieza en su selector. Cada pieza
debe quedar colocada y cada destino admite una sola pieza; los demás pueden
quedar vacíos. Si quitas un destino utilizado, repara las soluciones indicadas
antes de guardar.

Para piezas intercambiables, escribe el mismo grupo en **Piezas equivalentes**
(por ejemplo, `B`), incluso si sus imágenes provienen de archivos distintos.
Sin grupo explícito se conserva la equivalencia histórica por imagen.

La semilla incluye las tareas 14 y 34. La segunda ruta ilustrada para la 14
en la guía termina fuera del tablero; solo se acepta el recorrido que llega a
la meta, incluyendo el intercambio de sus dos flechas iguales.

## Contrato de respuestas y probador

El probador, el concurso y la práctica comparten `TaskPlayContent` y
`PlayTaskFields`. El probador de tareas guardadas usa los endpoints exclusivos
de administradores `GET /api/tasks/:id/preview` y `POST /api/tasks/:id/check`
(cuerpo `{ "payload": ... }`). La comprobación devuelve `correct` y
`explanationBlocks`; las tareas privadas no se habilitan en la práctica pública.
Cambiar o reiniciar una respuesta descarta su resultado y cualquier comprobación
pendiente.

La configuración, validación, presencia de respuesta, corrección y proyección
pública están en `backend/src/lib/task-answers/`. Para incorporar una familia,
ampliar esos módulos y el reproductor compartido. Los campos JSON `answerConfig`
y `answerKey` están reservados para las nuevas familias: los cuatro tipos
actuales admiten `{}` y conservan sus campos históricos. Cada familia nueva debe
validar su versión y proyectar explícitamente su configuración pública; nunca
enviar `answerKey` al estudiante. Las reglas de presencia del cliente y del
servidor se verifican con los mismos casos en las pruebas unitarias.

Para actualizar una base existente, respaldarla y ejecutar desde `backend/`
`bun run prisma:generate` y `bun run prisma:push`. También está disponible el
parche aditivo `backend/prisma/patches/20260906-task-answer-contract.sql`, que se
aplica una sola vez como alternativa a `prisma:push`. No hace falta recargar las
semillas para incorporar las columnas; así se conservan las tareas editadas.

## Pruebas

```bash
bun run test:e2e
```

El comando crea una base temporal, carga fixtures sintéticos aislados, inicia backend y frontend
en puertos de prueba y elimina la base al terminar. No requiere procesos previos.
Usa una clave de sesión exclusiva de las pruebas.

La lógica del contrato puede comprobarse desde `backend/` con:

```bash
bun x tsx --test ../tests/task-answer-contract.unit.ts src/lib/drag-drop-grading.test.ts prisma/seed-drag-drop.test.ts
```
