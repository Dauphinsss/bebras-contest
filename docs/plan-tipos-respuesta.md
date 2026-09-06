# Plan de ampliación de respuestas interactivas

Fecha: 2026-09-06. Estado: fases 1 y 2 implementadas; la siguiente entrega es zonas activas.

Actualización de fase 1: destinos independientes, soluciones sobre subconjuntos, equivalencia explícita y persistencia de semillas completados. Se incorporaron las tareas 14 (3 piezas/10 destinos) y 34 (3 piezas/12 destinos). Pasaron seis pruebas unitarias y once de navegador.

Corrección del diagnóstico original: el segundo recorrido ilustrado para la tarea 14 termina fuera del tablero, debajo de la meta. Se verificaron las 360 configuraciones de clases de pieza y se encontró un solo recorrido válido. La semilla conserva ese recorrido y la equivalencia de las dos flechas iguales. El soporte de alternativas se comprobó con configuraciones sintéticas válidas; no se acepta la segunda ilustración incorrecta del PDF.

Actualización de fase 2: configuración, validación, presencia, corrección y proyección pública viven en `backend/src/lib/task-answers/`. El probador consulta `GET /api/tasks/:id/preview` y `POST /api/tasks/:id/check`, ambos exclusivos de administradores, y comparte `TaskPlayContent`/`PlayTaskFields` con concurso y práctica. Cambiar o reiniciar la respuesta invalida resultados y peticiones pendientes.

Se añadieron `answerConfig` y `answerKey` con valor `{}` y un parche SQL aditivo. Los cuatro tipos actuales siguen usando sus campos históricos: los documentos nuevos solo admiten `{}` hasta incorporar los validadores versionados de las fases siguientes. La proyección pública excluye soluciones y claves privadas. El guardado rechaza formas/IDs inválidos antes de escribir; el cero numérico se distingue de una respuesta vacía. La migración local conservó las 24 tareas y dejó respaldo de la base.

Verificación de fase 2: 13 pruebas unitarias y 16 de navegador/API aprobadas, incluyendo los cuatro tipos actuales, tareas reales 14/34, permisos, respuestas pendientes, errores de red, guardado/recuperación y puntuación. Build y lint de ambos proyectos correctos. El typecheck global del frontend conserva el error previo de `calendar.tsx:31` sobre `locale` parcial (con `--ignoreDeprecations 5.0`); no se modificó ese componente.

Las secciones siguientes conservan el diagnóstico previo como contexto de la propuesta; las fases 1 y 2 ya están resueltas.

## 1. Alcance y diagnóstico comprobado

Se revisaron el código actual, las imágenes locales de las tareas y la guía PDF. El alcance es completar el ciclo **autoría → guardar/reabrir → probar → responder → recuperar respuesta → corregir** para las tareas 04, 09, 11, 14, 19, 31, 34, 37 y 40.

| Familia | Estado real | Decisión |
| --- | --- | --- |
| Zonas activas, 04 y 11 | No existe este tipo. La 04 selecciona un camino completo; la 11 selecciona un punto entre varios y admite dos puntos válidos. | Crear `image_hotspot`, selección única con una o varias regiones aceptadas. |
| Respuesta construida, 09 y 31 | No existe. Requieren tres y ocho posiciones ordenadas, respectivamente, con estados repetibles. | Crear `state_grid`, con fila como caso de una rejilla de una sola fila. |
| Huecos, 19, 37 y 40 | No existe interacción dentro del texto. La 19 ya está sembrada como opción múltiple; la 37 y la 40 tienen dos huecos con grupos distintos de opciones. | Crear `text_cloze` integrado en el documento de texto enriquecido. |
| Arrastre, 14 y 34 | Ya hay soluciones alternativas y firmas de piezas equivalentes. Sin embargo, el editor y API exigen igual número de piezas y destinos, y que todos los destinos estén ocupados. La semilla omite `dragDropSolutions`. | Completar `drag_drop`: destinos independientes, subconjuntos ocupados, equivalencia explícita y persistencia de alternativas. |

Detalles relevantes:

- La equivalencia actual prioriza URL de imagen, luego etiqueta y finalmente ID. Dos imágenes distintas con la misma etiqueta no cuentan como equivalentes. Además, la API exige imagen en cada pieza; la alternativa por etiqueta no soluciona normalmente la autoría actual.
- La tarea 34 necesita **3 piezas y 12 posiciones elegibles**, aunque solo tres queden ocupadas. Limitar los destinos a las posiciones correctas revelaría parte de la solución.
- Para la tarea 14 se deben registrar todas las posiciones permitidas por el tablero, incluyendo las usadas por distintas soluciones. Las alternativas no deben mover el tablero ni los destinos.
- Se enumeraron las 660 asignaciones distintas de dos piezas iguales y una diferente sobre las doce posiciones de la tarea 34: hay una configuración óptima de clases de pieza. El intercambio de las dos piezas iguales debe aceptarse automáticamente. Los detalles de la solución permanecen en el material local.
- El tester vuelve a implementar controles y corrección; `PlayTaskFields` ya atiende el juego real. Añadir tres implementaciones independientes aumentaría las diferencias entre prueba y concurso.

## 2. Contrato de datos y compatibilidad

Mantener los cuatro tipos existentes y añadir los tres nuevos al catálogo. No convertir las tareas antiguas masivamente.

Añadir a `TaskDraft` dos columnas de texto JSON, coherentes con SQLite y los campos actuales:

- `answerConfig`, predeterminado `{}`: configuración necesaria para presentar la interacción.
- `answerKey`, predeterminado `{}`: soluciones usadas por el servidor y por el editor autorizado.

Cada nuevo documento lleva `version: 1`. `answerType` discrimina su estructura. Los campos de arrastre actuales continúan siendo compatibles; no hace falta migrarlos al nuevo contrato en esta entrega.

| Tipo | `answerConfig` público | `answerKey` privado | Respuesta del estudiante |
| --- | --- | --- | --- |
| `image_hotspot` | Imagen, dimensiones originales, regiones con ID, etiqueta y geometría | `acceptedRegionIds` | `{ version: 1, regionId }`; `regionId: null` al borrar |
| `state_grid` | Filas, columnas, celdas con ID y orden, estados con ID/etiqueta/imagen, disponibilidad por estado | `acceptedAssignments`: configuraciones completas `cellId → stateId` | `{ version: 1, cells: { cellId: stateId } }` |
| `text_cloze` | Opciones con ID y contenido, huecos con ID, opciones permitidas por hueco y disponibilidad | `acceptedAssignments`: configuraciones completas `blankId → optionId` | `{ version: 1, blanks: { blankId: optionId } }` |
| `drag_drop` | Imagen, todas las piezas y todos los destinos permitidos | Principal y alternativas existentes; equivalencia semántica de piezas | `{ placements: { itemId: targetId } }`, sin romper el contrato actual |

En huecos, el documento de `bodyBlocks`/`challengeBlocks` es la fuente de verdad de la ubicación del hueco. `answerConfig` no guarda una segunda copia del texto. Un nodo de hueco solo contiene su ID, nunca una solución.

Las claves son IDs estables, independientes del orden visual, nombre del archivo, color, etiqueta o índice del array. El servidor valida identificadores existentes, forma del payload, cardinalidad, duplicados y límites antes de guardar.

Reglas de estado comunes:

- Vacío: ninguna selección; conserva el tratamiento actual de «sin respuesta».
- Parcial: se guarda y recupera; cuenta como respuesta iniciada, pero no correcta al finalizar.
- Completo: solo correcto si coincide con una configuración aceptada completa.
- Payload inválido: HTTP 400; no sobrescribir la última respuesta válida.
- «Borrar respuesta» produce una configuración vacía reconocida por el servidor.
- Mantener puntuación completa/incorrecta/sin respuesta. La puntuación parcial por casilla queda fuera de esta entrega.

`renderSafeTask` debe construir explícitamente el objeto público y excluir `answerKey`. No enviar soluciones, grupos privados de equivalencia, campos `correct*` ni respuestas dentro de atributos del texto. Verificar todos los accesos del estudiante: práctica pública, intento, vista previa y revisión según las opciones del concurso.

## 3. Primera fase: terminar el arrastre

1. Cambiar la restricción a `número de destinos >= número de piezas`. Toda solución coloca cada pieza exactamente una vez y usa cada destino como máximo una vez; puede dejar destinos vacíos.
2. Separar «Agregar pieza» de «Agregar destino» en el formulario. Crear, mover y quitar un destino no crea ni elimina una pieza automáticamente. Mantener los IDs de las tareas existentes.
3. Separar en el editor «Editar posiciones» de «Definir solución». Para cada solución, mover piezas entre destinos existentes; cambiar de alternativa no modifica coordenadas.
4. Si se elimina un destino utilizado, señalar qué soluciones quedaron incompletas y exigir repararlas antes de guardar. No reasignar silenciosamente respuestas correctas.
5. Añadir `equivalenceKey` opcional y privado por pieza, con un control «Piezas equivalentes». Dos fichas que representan la misma etiqueta pueden compartir esta clave aunque sus archivos difieran. La clave explícita tiene prioridad; las tareas sin ella conservan la regla histórica por URL/etiqueta.
6. Actualizar normalización, validación, formulario, corrección y carga de semillas para conservar esa clave y `dragDropSolutions`. Las dos copias actuales de `drag-drop-grading.ts` deben mantenerse idénticas hasta que el tester deje de utilizarlas.
7. Conservar lectura de respuestas antiguas de coordenadas. La geometría nueva no debe reinterpretar respuestas v1 ya guardadas.

Aceptación: tarea con más destinos que piezas; principal y alternativa con distintos subconjuntos de destinos; dos piezas equivalentes intercambiadas; configuración incorrecta; respuesta parcial; colisión de piezas; guardar/reabrir; cargar dos veces la semilla sin perder soluciones.

## 4. Segunda fase: base común para los nuevos tipos

- Extraer del gran `backend/src/index.ts` las funciones de configuración, validación de respuesta, presencia de respuesta, corrección y proyección pública a módulos `backend/src/lib/task-answers/`.
- Extender los puntos de despacho actuales sin reestructurar toda la API. Mantener los mismos cálculos de puntuación y finalización.
- Reutilizar `PlayTaskFields` para los controles del tester. Añadir un contenedor común de contenido de tarea que conecte bloques interactivos y controles; se usa tanto al probar como durante el concurso.
- El tester de tareas guardadas consultará un endpoint autenticado de comprobación que use el corrector del servidor. No reutilizar el endpoint público de práctica para comprobar tareas privadas.
- La respuesta a una comprobación del tester debe asociarse al payload probado; si el administrador lo modifica antes de terminar la petición, descartar el resultado anterior.
- Actualizar `answerHasResponse` del cliente y servidor con las mismas muestras de prueba. No enviar el corrector ni sus soluciones al navegador del estudiante.
- Conservar las colas de guardado, reintentos y vaciado de pendientes al finalizar de `attempt-page.tsx`.
- Añadir columnas de manera aditiva, con respaldo previo y verificación de que siguen existiendo las tareas y los intentos. No usar un reinicio de base para introducir estos tipos.

## 5. Zonas activas sobre imagen

**Editor:** subir la figura recortada, crear zonas, nombrarlas y marcar una o varias como respuestas aceptadas. Para el alcance inicial, usar círculos y polígonos con vértices editables: círculos para los puntos del barco y polígonos alrededor de los caminos. Dibujar un polígono mediante clics, cerrarlo, mover sus vértices y borrarlo. Un mismo camino puede tener varias geometrías bajo el mismo ID cuando haga falta.

**Estudiante:** tocar/clicar el camino o punto; resaltar únicamente la selección con el mismo estilo para todos los candidatos. Una selección nueva sustituye la anterior. Clic fuera de las regiones no cambia la selección; «Borrar» la elimina. El enunciado pide una sola selección incluso si hay varias regiones correctas.

**Geometría:** posiciones 0–100 relativas a la imagen, dimensiones originales conservadas, radio relativo al lado menor. Un SVG con `viewBox` proporcional a la imagen convierte posiciones a coordenadas coherentes. Evitar medir círculos con distancia euclídea entre porcentajes de ejes con escalas diferentes. Dibujar la imagen completa, sin recortes `cover`, y comprobar que el overlay coincide tras zoom o cambio de ancho.

**Ambigüedad:** las zonas de candidatos distintos deben evitar solapamientos; validar intersecciones y señalar conflictos al autor. En la 04, excluir el centro compartido del mapa. Para táctil, ampliar las zonas al preparar la tarea manteniendo separación entre candidatos. No agrandar de forma diferente únicamente la solución.

**Accesibilidad:** las regiones son elementos enfocables sobre la figura, con nombres neutrales, selección mediante Enter/Espacio y estado seleccionado anunciado. No depender solo del color. Usar las mismas zonas para ratón y teclado.

**Aceptación:** clics en principio/mitad/final de un camino, en los dos puntos aceptados del barco, en un punto incorrecto, en bordes y fuera de las zonas; conservar selección al recargar; comprobar alineación en móvil y escritorio.

El SVG soporta control de proporciones y de superficies que reciben eventos; esta es la base técnica propuesta, no un cambio ya aplicado. Referencias: [MDN, preserveAspectRatio](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/preserveAspectRatio) y [MDN, pointer-events](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/pointer-events).

## 6. Respuesta construida por estados

**Editor:** definir dimensiones y orden de las celdas, crear los estados posibles y construir la solución usando el mismo selector de estados. Permitir varias configuraciones aceptadas completas mediante «Otra solución».

La tarea 09 será una fila de tres posiciones con dos tipos de canica. La tarea 31 será una fila de ocho posiciones con dos tipos de pelota y etiquetas del código sobre cada posición. La primera entrega necesita filas/rejillas regulares; tableros arbitrarios y simuladores de movimiento quedan fuera.

**Estudiante:** seleccionar un estado de la paleta y tocar una celda para asignarlo. Poder cambiarlo y vaciar la celda. También permitir seleccionar la celda y escoger su estado por teclado. Todas las celdas empiezan sin respuesta: una canica blanca es un estado real, distinto de una casilla vacía.

Las opciones se reutilizan; no crear docenas de objetos arrastrables con identidades artificiales. El contrato contempla disponibilidad ilimitada (`null`) o un número de usos. Para 09 y 31 la paleta es reutilizable sin límite; no dar pistas publicando el número de piezas que tiene la solución.

**Corrección:** comparar `cellId → stateId`, conservando el orden espacial. Una fila invertida no equivale automáticamente a la correcta. La comparación es de IDs semánticos, no de archivos ni de colores CSS. No hace falta simular el tubo ni ejecutar el algoritmo del enunciado durante el juego.

**Aceptación:** estados repetidos; blanco frente a vacío; una celda mal; orden inverso; respuesta parcial; cambio de estado; limpieza; recuperación tras recarga; IDs desconocidos; inventario finito excedido cuando se configure.

## 7. Huecos dentro del texto editable

**Editor:** añadir «Insertar hueco» al editor Tiptap existente. Insertar un nodo inline atómico `taskBlank` con `blankId` estable. Al seleccionarlo, editar sus opciones permitidas en el panel de respuesta. Copiar un hueco crea un ID nuevo; cortar/mover conserva el ID; borrar actualiza referencias y señala las soluciones afectadas. Deshacer debe restaurar el nodo y su configuración.

El nodo debe registrarse y conservarse al cargar, copiar, pegar, guardar y renderizar. `getNonEmptyBlocks` y `TaskContentRenderer` actualmente omiten bloques cuyo `content` está vacío: deben reconocer un bloque que solo contiene huecos. También actualizar el resumen textual y la extracción de contenido para que un hueco no desaparezca ni se transforme en su respuesta.

Para el pseudocódigo de la 40, conservar líneas e indentación como estructura editable: atributo de indentación de párrafo validado y controles para aumentarla/disminuirla. El editor actual tiene `codeBlock` desactivado y no conviene guardar una imagen ni basarse en espacios que puedan perderse. No se necesitan tablas generales para estas tres tareas.

**Estudiante:** arrastrar desde el banco hasta un hueco o seleccionar una opción y después tocar el hueco. Cada hueco ofrece también selección por teclado. Poder reemplazar y devolver una opción al banco. Las opciones largas deben envolver líneas sin tapar el texto. El banco pasa debajo del enunciado en pantallas estrechas.

**Opciones:** admitir `allowedOptionIds` por hueco. Así se conserva la separación entre los grupos de opciones de 37 y 40. Modelar cuántas veces puede utilizarse cada opción; al mover una de uso único a otro hueco se libera su posición anterior. Si sustituye otra opción, la anterior vuelve al banco. Rechazar estados que excedan el inventario.

**Corrección:** aceptar una configuración completa, no una mezcla de respuestas pertenecientes a dos alternativas distintas. La 19 tiene un hueco; la 37 y la 40 tienen dos. No incluir la opción correcta en el HTML inicial o en los atributos del nodo.

**Aceptación:** insertar y mover huecos; duplicar sin repetir IDs; deshacer; editar texto alrededor; guardar/reabrir; arrastre, clic y teclado; grupos de opciones distintos; opciones reutilizables; banco agotado; respuesta parcial; pseudocódigo con indentación; restauración de respuesta.

La elección del nodo inline atómico se apoya en la [API de nodos de Tiptap](https://tiptap.dev/docs/editor/extensions/custom-extensions/create-new/node). La propuesta requiere integrarlo también en el renderizador propio del repositorio.

## 8. Archivos e integración

| Área | Archivos principales |
| --- | --- |
| Persistencia y semillas | `backend/prisma/schema.prisma`, `backend/prisma/seed-tasks.ts`, banco JSON y migración aditiva |
| API y corrección | `backend/src/index.ts`, `backend/src/lib/drag-drop-grading.ts`, nuevos módulos `backend/src/lib/task-answers/` |
| Contratos cliente | `frontend/src/lib/task-schema.ts`, `play-api.ts`, `tasks-api.ts` |
| Autoría | `task-upload-form.tsx`, `drag-drop-editor.tsx`, nuevos editores de zonas y estados, `task-rich-text-editor.tsx`, `task-content-builder.tsx` |
| Reproducción | `play-task-fields.tsx`, `task-content-renderer.tsx`, `rich-text-document.tsx`, `drag-drop-player.tsx`, nuevos reproductores de zonas/estados/huecos |
| Flujos y pruebas | `task-tester.tsx`, `attempt-page.tsx`, prácticas, `tests/task-authoring.spec.ts`, `tests/play-flow.spec.ts`, `tests/scoring.spec.ts` y nuevas pruebas específicas |

Reutilizar los componentes shadcn existentes para campos, selectores, botones, avisos y paneles. La superficie de dibujo y los nodos interactivos son componentes específicos de la tarea. No cambiar el diseño general del sitio durante esta ampliación.

## 9. Orden de entrega y verificación

| Entrega | Resultado revisable | Esfuerzo relativo |
| --- | --- | --- |
| 1. Arrastre completo | 14 y 34 configurables con todas sus posiciones elegibles; alternativas y equivalencias persistentes | Medio: hay base, pero faltan destinos independientes |
| 2. Contrato común | Migración aditiva, API, tester y persistencia preparados sin romper tipos actuales | Medio |
| 3. Zonas activas | 04 y 11 completas de editor a concurso | Medio; menor que huecos, pero requiere polígonos |
| 4. Estados por posición | 09 y 31 completas y recuperables | Medio |
| 5. Huecos | 19, 37 y 40 editables como texto y utilizables en concurso | Alto: integración de editor, documento y opciones |
| 6. Banco y regresión | Nueve casos cargados y recorridos completos verificados | Transversal; se valida cada familia al terminarla |

No equiparar «admite el tipo» con «tarea terminada». Para cerrar una entrega se debe crear, guardar, reabrir, responder, recargar y finalizar al menos una tarea de esa familia en una base de pruebas aislada.

Pruebas de lógica: soluciones válidas, incorrectas y parciales; normalización de IDs; equivalencias; inventarios; geometría; configuración inválida. Pruebas de API: permisos, ausencia de soluciones en datos públicos, guardado y recuperación, puntuación final y fin de tiempo. Pruebas de interfaz: edición y reapertura, teclado/táctil, móvil/escritorio, guardado pendiente al terminar y comportamiento de solo lectura.

Usar el arnés existente `bun run test:e2e` y sus filtros con fixtures pequeñas sintéticas, sin incorporar páginas ni soluciones del cuadernillo a pruebas públicas. Corregir las fixtures de fechas que fallen por reglas vigentes del concurso. Ejecutar las comprobaciones de tipos y lint de ambos proyectos; comprobar los fallos actuales en lugar de asumir que las notas históricas siguen vigentes.

## 10. Carga de tareas y límites

- Recortar solo figuras necesarias del material local y revisar cada recurso; no trasladar páginas completas del PDF al frontend público.
- Mantener la tarea 19 actual mientras tenga referencias o respuestas registradas. Crear una variante con ID nuevo para huecos; no interpretar sus respuestas históricas de opción múltiple como respuestas cloze. Migrar en el mismo ID solo si se verifica que no hay usos ni respuestas y se desea reemplazarla.
- Las otras ocho tareas objetivo no están en la semilla revisada. Su carga forma parte del cierre; la existencia del nuevo tipo no las añade automáticamente.
- Actualizar el serializador de semillas junto con cada configuración nueva y comprobar que una segunda ejecución conserva todos los datos.
- No hacer reseeding general de la base de trabajo para probar: preservar las ediciones del usuario y usar la base temporal del arnés.
- Quedan fuera: dibujo libre, ejecución de programas, un constructor de tablas general, puntuación parcial, arrastre libre sin destinos y un rediseño completo de los tipos existentes.

Resultado esperado: tres tipos nuevos y el arrastre completado, con las nueve tareas objetivo cubiertas por el flujo real. Esto no demuestra por sí solo la cobertura práctica de las 43 tareas del cuadernillo.
