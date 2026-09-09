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

La bandeja de objetos conserva el hueco de cada pieza aunque esté colocada, así
que su lugar de partida no se mueve. El hueco va vacío, con marco punteado: solo
indica que ahí había algo, sin delatar cuál, porque las piezas se intercambian
entre sí. Tocarlo devuelve la pieza que salió de ahí; con una pieza
seleccionada, cualquier hueco la reclama para sí. Arrastrar una pieza fuera de
la imagen también la devuelve a la bandeja, al lugar donde se suelte; soltarla
dentro pero lejos de un destino la deja donde estaba.

El estudiante acomoda la fila a su gusto: arrastrar una pieza sobre el lugar de
otra intercambia sus posiciones. Tocar otra pieza solo mueve la selección, para
no perder el gesto de elegir. El orden es solo visual: la respuesta viaja como
`{ pieza: destino }` y no depende de la bandeja. Las instrucciones de
arrastre ya no ocupan el enunciado: viven en el «?» que está sobre la bandeja.

La semilla incluye las tareas 14 y 34. La segunda ruta ilustrada para la 14
en la guía termina fuera del tablero; solo se acepta el recorrido que llega a
la meta, incluyendo el intercambio de sus dos flechas iguales.

## Fin del intento

El equipo llega a la pantalla final por dos caminos y tiene que distinguirlos.
Si entrega, ve «¡Desafío terminado!»; si se le acaba el plazo, ve «Se acabó el
tiempo» y el aviso de que sus respuestas se entregaron tal como estaban. El
servidor marca la diferencia con `finishedAt`, que al cerrar por plazo queda
igual a `endsAt`, así que el mensaje sobrevive a recargar la página.

El plazo del equipo es `min(inicio + duración, cierre de la rendición)`: cuando
termina la ventana del desafío no queda ningún intento abierto. Puntaje,
correcciones y soluciones solo aparecen si los resultados están publicados y el
desafío los habilita, cada uno por su cuenta.

## Contrato de respuestas y probador

El probador, el concurso y la práctica comparten `TaskPlayContent` y
`PlayTaskFields`. El probador de tareas guardadas usa los endpoints exclusivos
de administradores `GET /api/tasks/:id/preview` y `POST /api/tasks/:id/check`
(cuerpo `{ "payload": ... }`). La comprobación devuelve `correct` y
`explanationBlocks`; las tareas privadas no se habilitan en la práctica pública.
Cambiar o reiniciar una respuesta descarta su resultado y cualquier comprobación
pendiente.

«Probar» desde el editor prueba lo que hay en pantalla, guardado o no: el
borrador viaja por `sessionStorage` y se corrige con `POST
/api/tasks/draft/preview` y `POST /api/tasks/draft/check` (cuerpo
`{ "task": ..., "payload": ... }`), que reciben la tarea entera y no tocan la
base. Si al borrador le falta algo obligatorio, el probador muestra el mismo
mensaje que daría al guardar. El probador vuelve al editor con «Volver a la
edición».

La configuración, validación, presencia de respuesta, corrección y proyección
pública están en `backend/src/lib/task-answers/`. Para incorporar una familia,
ampliar esos módulos y el reproductor compartido. Las zonas activas usan
configuración y solución versionadas, descritas abajo. En `answerConfig`, la opción
múltiple guarda `multipleChoiceLayout` (`vertical` u `horizontal`, la única
clave que acepta) para elegir si las opciones se ven una debajo de otra o una al
lado de otra; texto y arrastre siguen con `{}` y sus campos históricos. Las
opciones con imagen se achican y agrandan con los mismos tiradores que los
bloques de contenido (`ImageWidthResizer`). Cada familia nueva debe
validar su versión y proyectar explícitamente su configuración pública; nunca
enviar `answerKey` al estudiante. Las reglas de presencia del cliente y del
servidor se verifican con los mismos casos en las pruebas unitarias.

Para actualizar una base existente, respaldarla y ejecutar desde `backend/`
`bun run prisma:generate` y `bun run prisma:push`. También está disponible el
parche aditivo `backend/prisma/patches/20260906-task-answer-contract.sql`, que se
aplica una sola vez como alternativa a `prisma:push`. No hace falta recargar las
semillas para incorporar las columnas; así se conservan las tareas editadas.

## Zonas sobre la imagen: tareas 04 y 11

Elige **Zonas sobre la imagen** en el tipo de respuesta. Sube la figura y usa
**Añadir punto** o **Dibujar camino**. Todo se ajusta sobre la misma imagen:
arrastra los centros o vértices, o usa las flechas del teclado. Cierra el camino
tocando su primer vértice o con **Cerrar camino**. Al seleccionar una zona,
puedes cambiar su nombre y marcar **Respuesta válida**. **Otro tramo** añade
otra superficie al mismo camino. El editor avisa si dos zonas se superponen y
no permite guardar una configuración ambigua.

El estudiante toca la figura o usa Tab y Enter/Espacio. Una selección sustituye
la anterior y **Borrar** la quita. Las tareas 04 y 11 están en la semilla y en
la base local: cuatro caminos en 04 (B correcto) y nueve puntos en 11 (punta de
la vela y centro superior del casco correctos). El centro compartido del bosque
no pertenece a ningún camino seleccionable.

`image_hotspot` guarda `{ version: 1, image, imageWidth, imageHeight, regions }`
en `answerConfig`; cada región tiene `id`, `label` y `shapes` (círculos o
polígonos). Las posiciones son porcentajes de la imagen; el radio se mide contra
su lado menor. `answerKey` contiene `{ version: 1, acceptedRegionIds }` y nunca
se envía al estudiante. La respuesta es `{ version: 1, regionId }`, con `null`
al borrar. Se validan versiones, geometría, colisiones, IDs y solución antes de
guardar. Las funciones geométricas de cliente y servidor tienen pruebas comunes.

Las versiones finales de estas dos tareas se mantienen en el JSON canónico;
no se regeneran desde el PDF. El flujo de actualización se describe abajo.

## Estados por casilla y huecos en el texto: tareas 09, 19, 31, 37 y 40

Dos tipos que comparten el mismo gesto: un banco de opciones arriba y posiciones
que llenar abajo. Elige una opción y toca la posición, o arrástrala hasta ella.
Con el teclado, las flechas cambian la opción de la posición enfocada y Supr la
vacía; cada cambio se anuncia para lectores de pantalla. **Borrar** deja la
selección vacía, y desde ahí tocar una posición la desocupa.

**Estados por casilla** (`state_grid`) arma una rejilla de hasta 12 filas por 12
columnas. Se define el rótulo de cada casilla y los estados disponibles, con
imagen si hace falta. Sirve para construir una configuración final, como las
tres canicas de la 09 o las ocho pelotas de la 31. Una casilla vacía no es un
estado: si «blanca» es una respuesta posible, tiene que existir como estado.

**Huecos en el texto** (`text_cloze`) mete la respuesta dentro del enunciado.
En la barra del editor de texto, **Insertar hueco** deja un nodo con su propio
identificador: copiarlo crea uno nuevo, moverlo conserva el suyo y deshacer lo
restaura. Los botones de sangría mantienen la forma del pseudocódigo de la 40
sin guardarlo como imagen. Cada hueco elige qué opciones del banco acepta, así
la 37 y la 40 conservan sus dos grupos separados.

En ambos, la casilla de cantidad limita cuántas veces se usa una opción (vacía
es ilimitada) y se admiten varias soluciones completas: **Respuesta correcta**
y las **Alternativas** que se agreguen. Solo una configuración completa puntúa;
una a medias se guarda y se recupera, pero cuenta como incorrecta.

`answerConfig` guarda `{ version: 1, rows, columns, cells, states }` o
`{ version: 1, options, blanks }`; `answerKey`, `{ version: 1,
acceptedAssignments }` con cada solución completa. La respuesta del estudiante
es `{ version: 1, cells: { casilla: estado } }` o
`{ version: 1, blanks: { hueco: opción } }`, y un objeto vacío la borra. El
documento del enunciado es la única fuente de la posición de un hueco:
`answerConfig` no guarda una segunda copia del texto y el nodo nunca lleva la
solución. Se validan versión, identificadores, opciones permitidas, inventario
y soluciones repetidas antes de guardar. `answerKey` no sale en la proyección
pública.

La 19 usa huecos sobre su mismo identificador, nunca una variante adicional.

## Catálogo canónico

La fuente final es `backend/prisma/seed/bebras-tasks.json`: exactamente 43 tareas
en orden de cuadernillo, todas habilitadas para práctica. Las siete conversiones
manuales son 04/11 `image_hotspot`, 09/31 `state_grid` y 19/37/40 `text_cloze`.
Las 14/34 siguen siendo de arrastre. El validador rechaza IDs alternativos,
tareas adicionales, tipos incorrectos y cualquier tarea en cuarentena.

Se retiraron `seed-hotspot-tasks.py` y `seed-assignment-tasks.py`: sus plantillas
anteriores añadían IDs no canónicos y reemplazaban tareas enteras, perdiendo
metadatos, explicaciones e imágenes de solución revisadas. Mantener otra copia
de la autoría en Python no aporta una regeneración segura.

1. Edita el JSON canónico conservando IDs, metadatos verificados, explicaciones y
   las 25 imágenes de solución. Las imágenes van embebidas como
   `data:image/png;base64,...`, también en `answerConfig`; no dependen de rutas
   locales ni del PDF privado. Revisa visualmente cualquier imagen nueva.
2. Desde `backend/`, ejecuta `bun run catalog:validate` para validar la semilla,
   o `bun run catalog:validate -- <ruta-json>` para revisar una candidata sin
   escribir archivos ni conectar a la base. Ejecuta `bun run test:catalog`.
3. Desde la raíz, `bun run db:tasks` valida e inserta solo IDs faltantes. No
   actualiza tareas existentes ni elimina variantes antiguas o ediciones locales.
4. Solo si quieres descartar esos datos, detén el backend y ejecuta explícitamente
   `bun run db:tasks:replace --confirm-replace`, opcionalmente con
   `--backup <ruta-nueva>`. Crea un respaldo SQLite verificado antes del reemplazo;
   no sobrescribe respaldos existentes. Borra tareas y el grafo de concursos
   (incluidas respuestas y resultados), conservando colegios, usuarios y
   solicitudes. No es el flujo habitual de edición.

`catalog:migrate <legacy-json> <current-json> <output-json>` conserva el contrato
histórico de argumentos. Si el catálogo actual tiene 43 tareas, lo valida y
copia íntegro, sin reconstruir ninguna tarea `non-master` ni sustituir imágenes
con las del legado. El archivo legado debe ser JSON legible, pero su contenido
no se usa en ese caso. Un catálogo final inválido falla antes de escribir: no
hay recuperación silenciosa mediante placeholders. La importación antigua de
21 tareas no basta para publicar el catálogo final sin las siete autorías
interactivas. `--check` nunca escribe el archivo de salida.

## Pruebas

```bash
bun run test:e2e
```

El comando crea una base temporal, carga fixtures sintéticos aislados, inicia backend y frontend
en puertos de prueba y elimina la base al terminar. No requiere procesos previos.
Usa una clave de sesión exclusiva de las pruebas.

### Por módulo

La suite completa tarda unos diez minutos, así que está partida en módulos y se
corre solo el que se está tocando:

```bash
bun run test:e2e:tareas     # autoría, probador, arrastre, zonas de imagen
bun run test:e2e:desafios   # ciclo de vida, puntajes, publicación de resultados
bun run test:e2e:grupos     # grupos, inscripción y entrada del estudiante
bun run test:e2e:juego      # rendición: empezar, responder, entregar, cierre
bun run test:e2e:practica   # prácticas del maestro y su reproductor
bun run test:e2e:cuentas    # registro y acceso
bun run test:e2e:interfaz   # navegación y tarjetas responsivas
```

Cada archivo de `tests/` pertenece a un módulo, declarado en
`playwright.config.ts`. **Al agregar un archivo nuevo hay que listarlo ahí**, o
no lo corre ningún proyecto.

### Modo rápido

```bash
bun run test:e2e:servidores            # en otra terminal, se quedan arriba
bun run test:e2e:rapido -- --project=juego
```

El modo rápido conserva la base sembrada entre corridas y aprovecha los
servidores que ya estén escuchando; el reloj de pruebas sí se borra siempre,
porque una hora vieja rompe cualquier ventana de desafío. Con los servidores
arriba, un módulo baja de unos 40 s a unos 25 s. Para una verificación
reproducible, y siempre antes de dar algo por terminado, va la corrida normal:
base nueva, semillas nuevas y servidores nuevos.

La lógica del contrato, la geometría de las zonas, los huecos del documento y
las asignaciones se comprueban sin navegador:

```bash
bun run test:unidad
```
