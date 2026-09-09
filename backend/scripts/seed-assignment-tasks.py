"""Regenera las cinco tareas de estados/huecos desde el cuadernillo privado.

Requiere PyMuPDF. No modifica la base de datos ni la tarea 19 de opción múltiple.
Las coordenadas de recorte se refieren a páginas renderizadas a escala 2 (1224 px).
Solo se publican figuras necesarias: nunca páginas completas ni soluciones en imagen.
"""

import base64
import json
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "backend/prisma/seed/bebras-tasks.json"
OUTPUT = ROOT / "temp-crops/assignments"


def text_node(text):
    return {"type": "text", "text": text}


def blank_node(blank_id):
    return {"type": "taskBlank", "attrs": {"blankId": blank_id}}


def paragraph(*children, indent=0):
    return {"type": "paragraph", "attrs": {"indent": indent}, "content": list(children)}


def block(block_id, content, kind="text", rich_text=None):
    result = dict(id=block_id, type=kind, content=content, image=None, widthPercent=100)
    if rich_text is not None:
        result["richText"] = {"type": "doc", "content": rich_text}
    return result


def figure(document, page, box, name):
    pixmap = document[page].get_pixmap(
        matrix=fitz.Matrix(4, 4),
        clip=fitz.Rect(*(value / 2 for value in box)),
        alpha=False,
    )
    data = pixmap.tobytes("png")
    (OUTPUT / name).write_bytes(data)
    print(f"{name}: {pixmap.width} x {pixmap.height}")
    return dict(id=name.removesuffix(".png"), name=name,
                url="data:image/png;base64," + base64.b64encode(data).decode())


def image_block(block_id, image, width=60):
    return dict(id=block_id, type="image", content="", image=image, widthPercent=width)


def option(option_id, label, image=None, limit=1):
    return dict(id=option_id, label=label, image=image, limit=limit)


def task(number, slug, title, country, difficulties, category, answer_type,
         body, challenge, explanation, config, assignment):
    task_id = f"bebras-2024-{number:02d}-{slug}"
    return dict(
        id=task_id, title=title, country=country, year=2024,
        categories=[category], difficulties=difficulties,
        bodyBlocks=body, challengeBlocks=challenge,
        answerType=answer_type, answerConfig=config,
        answerKey=dict(version=1, acceptedAssignments=[assignment]),
        multipleChoiceOrderMode="fixed", answers=[], correctAnswerId="",
        shortAnswer="", rangeMin=None, rangeMax=None,
        dragDropBackground=None, dragDropItems=[], dragDropTargets=[], dragDropSolutions=[],
        explanationBlocks=[block(task_id + "-explanation", explanation)], isPractice=True,
    )


def build():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    document = fitz.open(next((ROOT / "tareas-otono-2024/_referencia").glob("*.pdf")))

    initial_tube = figure(document, 11, (326, 546, 535, 620), "canicas-tubo-inicial.png")
    insertions = figure(document, 11, (173, 658, 828, 727), "canicas-cuatro-inserciones.png")
    gray = figure(document, 11, (266, 661, 332, 727), "canica-gris.png")
    white = figure(document, 11, (431, 660, 500, 727), "canica-blanca.png")
    example = figure(document, 34, (193, 284, 537, 336), "pelotas-ejemplo.png")
    blue = figure(document, 34, (253, 286, 301, 335), "pelota-azul.png")
    red = figure(document, 34, (194, 286, 243, 335), "pelota-roja.png")
    islands = figure(document, 46, (613, 214, 1111, 433), "explorando-islas.png")

    tasks = []
    tasks.append(task(
        9, "tubo-de-canicas", "Tubo de canicas", "República de Corea",
        {"5–8": "hard", "8–10": "hard", "10–12": "hard"},
        "Estructuras de datos y representaciones", "state_grid",
        [block("canicas-regla", "En un tubo transparente abierto por ambos extremos caben tres canicas. Cuando empujas una canica dentro del tubo lleno, sale una canica por el extremo opuesto. El tubo comienza así:"),
         image_block("canicas-inicio", initial_tube, 36),
         block("canicas-pasos", "Bebras introduce estas cuatro canicas, en orden de izquierda a derecha. Cada flecha muestra hacia dónde empuja la canica: las dos primeras entran por la derecha y las dos últimas por la izquierda."),
         image_block("canicas-inserciones", insertions, 90)],
        [block("canicas-pregunta", "¿Cuáles tres canicas quedan en el tubo? Completa las posiciones de izquierda a derecha.", "challenge")],
        "De izquierda a derecha quedan una canica blanca y dos grises. Al principio hay gris, blanca, gris. Después de introducir la primera gris por la derecha queda blanca, gris, gris; después de la blanca por la derecha queda gris, gris, blanca; después de la gris por la izquierda queda gris, gris, gris; y después de la blanca por la izquierda queda blanca, gris, gris. El tubo se comporta como una cola de doble extremo de capacidad limitada.",
        dict(version=1, rows=1, columns=3,
             cells=[dict(id=f"posicion-{i}", label=f"Posición {i}") for i in range(1, 4)],
             states=[option("blanca", "Blanca", white, None), option("gris", "Gris", gray, None)]),
        {"posicion-1": "blanca", "posicion-2": "gris", "posicion-3": "gris"},
    ))

    code = [0, 1, 1, 1, 0, 1, 0, 0]
    colors = ["azul" if value != (code[index + 1] if index + 1 < len(code) else 0)
              else "roja" for index, value in enumerate(code)]
    # Verificación independiente: reconstruir la paridad de todos los sufijos.
    assert [sum(color == "azul" for color in colors[i:]) % 2
            for i in range(len(colors))] == code
    tasks.append(task(
        31, "secuencia-de-pelotas", "Secuencia de pelotas", "Bulgaria",
        {"14–16": "hard", "17–18": "hard"},
        "Estructuras de datos y representaciones", "state_grid",
        [block("pelotas-regla", "Una secuencia de pelotas rojas y azules se escribe con un código. Para cada posición, cuenta las pelotas azules que hay desde esa posición hasta el extremo derecho, incluida la propia pelota. Escribe 0 si el total es par y 1 si es impar."),
         image_block("pelotas-ejemplo", example, 55),
         block("pelotas-ejemplo-texto", "En el ejemplo, los totales son 3, 3, 2, 1, 1, 1 y el código es 1, 1, 0, 1, 1, 1.")],
        [block("pelotas-pregunta", "Construye la secuencia de pelotas para el código 0, 1, 1, 1, 0, 1, 0, 0, de izquierda a derecha.", "challenge")],
        "La secuencia es azul, roja, roja, azul, azul, azul, roja, roja. Los totales de pelotas azules desde cada posición hacia la derecha son 4, 3, 3, 3, 2, 1, 0, 0: al convertirlos en par o impar se obtiene el código indicado. También se puede resolver desde la derecha: la última pelota es roja porque su código es 0; al avanzar hacia la izquierda, un cambio entre 0 y 1 indica una pelota azul y un valor que se mantiene indica una roja.",
        dict(version=1, rows=1, columns=8,
             cells=[dict(id=f"posicion-{i + 1}", label=str(value)) for i, value in enumerate(code)],
             states=[option("roja", "Roja", red, None), option("azul", "Azul", blue, None)]),
        {f"posicion-{i + 1}": color for i, color in enumerate(colors)},
    ))

    sunny_body = "Tom dice: «En los días soleados, hay al menos un castor nadando en cada lago». Kim contesta: «Eso no es cierto. Por ejemplo, el domingo pasado no fue así»."
    sunny_options = [
        option("a", "había castores nadando en todos los lagos"),
        option("b", "ningún castor nadó en el lago con la cascada"),
        option("c", "un castor, Michael, nadó en todos los lagos"),
        option("d", "el castor Michael no nadó para nada"),
    ]
    tasks.append(task(
        19, "dias-soleados-huecos", "Días soleados: completa la frase", "Alemania",
        {"10–12": "medium", "12–14": "medium", "14–16": "easy"},
        "Algoritmos y programación", "text_cloze",
        [block("soleados-dialogo", sunny_body)],
        [block("soleados-pregunta", "Asume que Kim dice la verdad. Completa la frase con lo que pudo pasar el domingo.", "challenge"),
         block("soleados-frase", "El domingo pasado estaba soleado y [___].", "challenge",
               [paragraph(text_node("El domingo pasado estaba soleado y "), blank_node("suceso"), text_node("."))])],
        "La frase se completa con «ningún castor nadó en el lago con la cascada». Basta con un lago sin castores nadando en un día soleado para que la afirmación de Tom sea falsa. Que Michael no nade no basta: otros castores podrían haber nadado en todos los lagos.",
        dict(version=1, options=sunny_options,
             blanks=[dict(id="suceso", allowedOptionIds=["a", "b", "c", "d"])]),
        {"suceso": "b"},
    ))

    tasks.append(task(
        37, "dias-soleados-2", "Días soleados 2", "Alemania", {"17–18": "medium"},
        "Algoritmos y programación", "text_cloze",
        [block("soleados2-dialogo", "Tom dice: «En los días soleados siempre hay al menos un castor nadando en cada estanque». Kim contesta: «Esto no es cierto. Por ejemplo, el domingo no fue así».")],
        [block("soleados2-pregunta", "Asume que Kim tiene razón. Completa la oración para que lo que dijo Tom sea falso.", "challenge"),
         block("soleados2-frase", "El domingo [___] y [___].", "challenge",
               [paragraph(text_node("El domingo "), blank_node("clima"), text_node(" y "), blank_node("suceso"), text_node("."))])],
        "El domingo estuvo soleado y ningún castor nadó en el estanque de la cascada. La afirmación de Tom solo habla de días soleados, por eso el primer hueco debe indicar que hubo sol. Para contradecir que había un castor en cada estanque, basta con mostrar un estanque donde no nadó ninguno. Que Michael no nadara no descarta que otros castores sí lo hicieran.",
        dict(version=1, options=[
            option("a", "estuvo soleado"), option("b", "no hubo sol"),
            option("c", "había castores nadando en todos los estanques"),
            option("d", "ningún castor nadó en el estanque de la cascada"),
            option("e", "el castor Michael nadó en todos los estanques"),
            option("f", "el castor Michael no nadó para nada"),
        ], blanks=[dict(id="clima", allowedOptionIds=["a", "b"]),
                   dict(id="suceso", allowedOptionIds=["c", "d", "e", "f"])]),
        {"clima": "a", "suceso": "d"},
    ))

    program = [
        (0, [text_node("Coloca el letrero de INICIO y trasládate a una isla vecina al azar.")]),
        (0, [text_node("Cada vez que llegues a una isla:")]),
        (1, [text_node("Si esa isla ya tiene un letrero:")]),
        (2, [text_node("Deja el letrero como está.")]),
        (1, [text_node("Si no:")]),
        (2, [text_node("Coloca una flecha apuntando hacia la isla de donde vienes.")]),
        (1, [text_node("Si hay una isla vecina que "), blank_node("vecina"), text_node(", entonces:")]),
        (2, [text_node("Trasládate a esa isla.")]),
        (1, [text_node("Si no:")]),
        (2, [text_node("Observa el cartel de la isla en la que estás.")]),
        (2, [text_node("Si es una flecha, entonces:")]),
        (3, [text_node("Trasládate a la isla "), blank_node("regreso"), text_node(".")]),
        (2, [text_node("Si no:")]),
        (3, [text_node("Ya fuiste a todas las islas de esta red.")]),
    ]
    program_text = "\n".join("  " * indent + "".join(node.get("text", "[___]") for node in nodes)
                             for indent, nodes in program)
    tasks.append(task(
        40, "explorando", "Explorando", "Alemania", {"17–18": "hard"},
        "Algoritmos y programación", "text_cloze",
        [block("explorando-historia", "Harry quiere visitar al menos una vez cada isla de una red conectada por troncos. Desde cada isla puede ver las islas vecinas y sus letreros. Comenzó en la isla marcada INICIO y ya pasó por otras dos, como muestra el dibujo."),
         image_block("explorando-mapa", islands, 66)],
        [block("explorando-pregunta", "Completa los dos huecos para que las instrucciones permitan terminar de recorrer todas las islas.", "challenge"),
         block("explorando-programa", program_text, "challenge",
               [paragraph(*nodes, indent=indent) for indent, nodes in program])],
        "El primer hueco es «NO TIENE LETRERO» y el segundo «A DONDE APUNTA LA FLECHA». Una isla sin letrero todavía no fue visitada. Al llegar por primera vez, Harry marca el camino de regreso con una flecha. Cuando no quedan vecinas sin visitar, sigue esa flecha para retroceder y buscar otras ramas. Regresar siempre a la isla de donde acaba de venir podría encerrarlo en un recorrido de ida y vuelta. Al volver a INICIO sin vecinas pendientes, termina. Esta estrategia se llama búsqueda en profundidad.",
        dict(version=1, options=[
            option("sin-letrero", "NO TIENE LETRERO"),
            option("con-flecha", "TIENE UNA FLECHA"),
            option("inicio", "DICE INICIO"),
            option("de-donde-vienes", "DE DONDE ACABAS DE VENIR"),
            option("donde-apunta", "A DONDE APUNTA LA FLECHA"),
        ], blanks=[dict(id="vecina", allowedOptionIds=["sin-letrero", "con-flecha", "inicio"]),
                   dict(id="regreso", allowedOptionIds=["de-donde-vienes", "donde-apunta"])]),
        {"vecina": "sin-letrero", "regreso": "donde-apunta"},
    ))

    data = json.loads(SEED.read_text(encoding="utf-8"))
    for new_task in tasks:
        index = next((i for i, existing in enumerate(data) if existing["id"] == new_task["id"]), None)
        if index is None:
            data.append(new_task)
        else:
            data[index] = new_task
        (OUTPUT / (new_task["id"] + ".json")).write_text(
            json.dumps(new_task, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    SEED.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Regeneradas 09, 31, 19 (variante de huecos), 37 y 40. Base de datos intacta.")


if __name__ == "__main__":
    build()
