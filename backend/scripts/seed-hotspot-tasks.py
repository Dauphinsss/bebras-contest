"""Regenera solo las tareas 04/11 desde el PDF privado, sin modificar la base.
Requiere PyMuPDF y Shapely. Coordenadas sobre las páginas originales de 1224 px.
Las figuras extraídas no incluyen texto ni soluciones del cuadernillo.
"""
import base64
import json
import re
from pathlib import Path
import fitz
from shapely.geometry import LineString

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / 'backend/prisma/seed/bebras-tasks.json'
OUTPUT = ROOT / 'temp-crops/hotspots'
OUTPUT.mkdir(parents=True, exist_ok=True)


def block(id, content, kind='text'):
    return dict(id=id, type=kind, content=content, image=None, widthPercent=100)


def figure(document, page, box, name):
    pix = document[page].get_pixmap(matrix=fitz.Matrix(4, 4), clip=fitz.Rect(*(v / 2 for v in box)), alpha=False)
    data = pix.tobytes('png')
    (OUTPUT / name).write_bytes(data)
    return dict(id=name.removesuffix('.png'), name=name, url='data:image/png;base64,' + base64.b64encode(data).decode()), pix.width, pix.height


def percent(point, box):
    return dict(x=round((point[0] - box[0]) / (box[2] - box[0]) * 100, 4), y=round((point[1] - box[1]) / (box[3] - box[1]) * 100, 4))


def build():
    doc = fitz.open(next((ROOT / 'tareas-otono-2024/_referencia').glob('*.pdf')))
    pages = {}
    for i, page in enumerate(doc):
        match = re.search(r'TAREA\s+(\d+)', page.get_text(), re.I)
        if match:
            pages.setdefault(int(match[1]), i)

    box4 = (574, 520, 1110, 775)
    img4, w4, h4 = figure(doc, pages[4], box4, 'bosque-caminos.png')
    routes = {
        'A': [(600,580),(626,584),(650,600),(671,615),(700,623),(727,623),(761,619),(789,616),(811,624),(818,635)],
        'B': [(1080,586),(1054,585),(1028,587),(1002,597),(985,613),(967,631),(946,643),(924,646),(900,649),(881,655)],
        'C': [(613,742),(641,734),(661,723),(674,704),(697,684),(720,683),(742,689),(762,692),(785,687),(807,677),(817,673)],
        'D': [(1081,749),(1051,742),(1026,729),(1003,725),(978,726),(958,723),(945,706),(933,690),(912,687),(892,687),(874,684)],
    }
    regions4 = []
    for name, route in routes.items():
        polygon = LineString(route).buffer(12, quad_segs=3).simplify(0.7, preserve_topology=True)
        regions4.append(dict(id='camino-' + name.lower(), label='Camino ' + name, shapes=[dict(type='polygon', points=[percent(p, box4) for p in list(polygon.exterior.coords)[:-1]])]))
    config4 = dict(version=1, image=img4, imageWidth=w4, imageHeight=h4, regions=regions4)

    box11 = (702, 238, 1040, 482)
    img11, w11, h11 = figure(doc, pages[11], box11, 'barco-puntos.png')
    points = [(871,258,'Punta de la vela'), (729,387,'Extremo izquierdo de la vela'), (871,387,'Cruce de la vela'), (1013,387,'Extremo derecho de la vela'), (725,421,'Extremo izquierdo del casco'), (871,421,'Centro superior del casco'), (1018,421,'Extremo derecho del casco'), (777,460,'Esquina inferior izquierda'), (966,460,'Esquina inferior derecha')]
    regions11 = [dict(id=f'punto-{i+1}', label=label, shapes=[dict(type='circle', **percent((x,y), box11), radius=round(13 / (box11[3] - box11[1]) * 100, 4))]) for i, (x,y,label) in enumerate(points)]
    config11 = dict(version=1, image=img11, imageWidth=w11, imageHeight=h11, regions=regions11)

    def task(number, slug, title, country, difficulties, body, challenge, explanation, config, accepted):
        id = f'bebras-2024-{number:02d}-{slug}'
        return dict(id=id, title=title, country=country, year=2024, categories=['Algoritmos y programación'] if number == 4 else ['Estructuras de datos y representaciones'], difficulties=difficulties,
                    bodyBlocks=[block(id+'-body', body)], challengeBlocks=[block(id+'-challenge', challenge, 'challenge')],
                    answerType='image_hotspot', answerConfig=config, answerKey=dict(version=1, acceptedRegionIds=accepted),
                    multipleChoiceOrderMode='fixed', answers=[], correctAnswerId='', shortAnswer='', rangeMin=None, rangeMax=None, dragDropBackground=None, dragDropItems=[], dragDropTargets=[], dragDropSolutions=[],
                    explanationBlocks=[block(id+'-explanation', explanation)], isPractice=True)

    tasks = [task(4, 'caminando-por-el-bosque', 'Caminando por el bosque', 'Indonesia', {'5–8':'medium', '8–10':'medium'},
                  'Alia caminó desde una esquina del bosque hacia el centro. Primero vio flores rojas y amarillas; luego, un árbol con frutas rojas; finalmente, el nido de un pájaro en un árbol.',
                  'Haz clic sobre el camino que Alia utilizó.',
                  'El camino B tiene los tres objetos en ese orden: flores rojas y amarillas, un árbol con frutas rojas y, al final, un nido. El camino A comienza de forma parecida, pero no pasa junto al nido antes de llegar al centro. Seguir los pasos en orden permite distinguir el recorrido correcto.', config4, ['camino-b']),
             task(11, 'dibujando-barquitos', 'Dibujando barquitos', 'Polonia', {'8–10':'easy','10–12':'easy'},
                  'Sofía quiere dibujar este barco en un solo trazo, sin levantar el lápiz y sin pasar dos veces por la misma línea.',
                  '¿En dónde debería comenzar? Marca un punto inicial.',
                  'Puedes empezar en la punta superior de la vela o en el centro del borde superior del casco. Son los únicos puntos donde se unen tres líneas, un número impar. Para recorrer todas las líneas una sola vez, el trazo empieza en uno de esos puntos y termina en el otro. Este recorrido se conoce como camino de Euler.', config11, ['punto-1','punto-6'])]
    data = json.loads(SEED.read_text(encoding='utf-8'))
    for task in tasks:
        index = next((i for i,t in enumerate(data) if t['id'] == task['id']), None)
        if index is None: data.append(task)
        else: data[index] = task
        (OUTPUT / (task['id'] + '.json')).write_text(json.dumps(task, ensure_ascii=False), encoding='utf-8')
    SEED.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Tareas 04 y 11 regeneradas. La base de datos no fue modificada.')


if __name__ == '__main__':
    build()
