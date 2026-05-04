# Flujo de una competencia

Este documento resume el flujo operativo de una competencia en `bebras-platform`, desde la preparación administrativa hasta el cierre con resultados.

## 1. Preparación de la competencia

1. Un administrador crea o configura la competencia en `teacherInterface`.
2. Se definen sus parámetros principales:
   - nombre
   - nivel
   - duración en minutos
   - fechas de inicio y fin
   - preguntas asociadas
   - opciones como participación en parejas, feedback y visibilidad
3. Luego se debe **generar** la competencia.
   - Generar una competencia significa compilar sus preguntas en los archivos que usará `contestInterface`.
   - Esta acción se hace desde la pestaña de competencias con el botón **Regenerate selected contest**.
4. La competencia generada queda disponible para que los participantes puedan abrirla desde la interfaz pública.

## 2. Organización por grupos

La plataforma trabaja sobre grupos, no sobre estudiantes cargados uno por uno antes de competir.

1. El docente crea grupos en `teacherInterface`.
2. Cada grupo representa estudiantes:
   - del mismo nivel
   - que compiten en el mismo horario
   - bajo la misma sesión de participación
3. Al crear un grupo, la plataforma genera dos códigos:
   - **código de acceso del grupo**: lo usan los estudiantes para entrar
   - **código secreto de recuperación**: lo usa el docente si hay una interrupción
4. El código del grupo solo es válido durante **30 minutos desde su primer uso**, por lo que conviene crear grupos separados por sesión real de competencia.
5. Antes de la competencia, el docente puede imprimir la hoja informativa del grupo con instrucciones y códigos.

## 3. Inicio de la competencia

1. Los estudiantes abren `contestInterface`.
2. Ingresan el **código del grupo** entregado por el docente.
3. Si la competencia permite parejas, eligen si participan:
   - individualmente
   - en dúo
4. Luego cargan sus datos personales solicitados por la competencia.
   - típicamente nombre y apellido
   - según configuración, también pueden pedirse otros datos
5. La plataforma les entrega un **código personal**.
   - ese código debe anotarse
   - sirve para retomar la competencia si se corta la sesión
6. Cuando están listos, presionan iniciar.
7. Desde ese momento corre el temporizador por la cantidad de minutos definida en la competencia.

## 4. Durante la competencia

1. Los participantes resuelven las preguntas desde la interfaz de competencia.
2. Las respuestas se guardan durante la sesión.
3. Si terminan antes del límite, pueden finalizar manualmente.
4. Si no, la competencia termina automáticamente al vencer el tiempo.

## 5. Recuperación ante interrupciones

Si un estudiante se desconecta o se corta la sesión:

1. Vuelve a la interfaz pública de la competencia.
2. Usa la opción de **continuar la competencia**.
3. Ingresa su **código personal**.
4. Si no lo tiene o lo anotó mal:
   - puede volver a entrar con el código del grupo
   - selecciona su equipo
   - el docente ingresa el **código secreto de recuperación**

## 6. Seguimiento durante la competencia

Mientras la competencia está en curso, `teacherInterface` permite ver los equipos a medida que empiezan a participar.

Desde ahí, el docente o administrador puede revisar:

- qué grupos ya comenzaron
- qué equipos aparecen registrados
- datos básicos de participación

## 7. Cierre y procesamiento de resultados

Cuando la competencia termina, el flujo administrativo continúa así:

1. Se calculan los **scores** de las respuestas.
2. Se pueden calcular los **scores totales** por equipo.
3. Se ejecuta el **ranking** de la competencia.
4. Después de eso, quedan disponibles procesos posteriores como:
   - consulta de resultados
   - exportación
   - certificados
   - premios o rankings adicionales, según configuración del país o instancia

## 8. Resumen corto

El flujo completo es:

1. configurar competencia
2. generar competencia
3. crear grupos
4. imprimir instrucciones y códigos
5. estudiantes ingresan con código de grupo
6. estudiantes reciben código personal e inician
7. resuelven dentro del tiempo límite
8. si hay cortes, retoman con código personal o recuperación docente
9. al final, administración calcula puntajes y ranking

## Referencias en el código

- `README.md`
- `teacherInterface/notice.php`
- `teacherInterface/index.php`
- `teacherInterface/i18n/en/translation.json`
- `teacherInterface/i18n/es/translation.json`
- `contestInterface/common.js`
