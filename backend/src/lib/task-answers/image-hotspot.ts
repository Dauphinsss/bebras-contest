export type HotspotPoint = { x: number; y: number };
export type HotspotShape =
  | { type: "circle"; x: number; y: number; radius: number }
  | { type: "polygon"; points: HotspotPoint[] };
export type HotspotRegion = {
  id: string;
  label: string;
  shapes: HotspotShape[];
};
export type HotspotConfig = {
  version: 1;
  image: { id: string; name: string; url: string };
  imageWidth: number;
  imageHeight: number;
  regions: HotspotRegion[];
};
export type HotspotKey = { version: 1; acceptedRegionIds: string[] };

const EPS = 1e-7;
const cross = (a: HotspotPoint, b: HotspotPoint, c: HotspotPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function onSegment(p: HotspotPoint, a: HotspotPoint, b: HotspotPoint) {
  return (
    Math.abs(cross(a, b, p)) < EPS &&
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}
function intersects(
  a: HotspotPoint,
  b: HotspotPoint,
  c: HotspotPoint,
  d: HotspotPoint,
) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, c, d) ||
    onSegment(b, c, d) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b)
  );
}
function edges(points: HotspotPoint[]): [HotspotPoint, HotspotPoint][] {
  return points.map((point, i) => [point, points[(i + 1) % points.length]]);
}
export function pointInPolygon(point: HotspotPoint, points: HotspotPoint[]) {
  let inside = false;
  for (const [a, b] of edges(points)) {
    if (onSegment(point, a, b)) return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
function distanceToSegment(p: HotspotPoint, a: HotspotPoint, b: HotspotPoint) {
  const length = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = length
    ? Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length,
        ),
      )
    : 0;
  return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y));
}
export function physicalShape(
  shape: HotspotShape,
  width: number,
  height: number,
): HotspotShape {
  const point = (p: HotspotPoint) => ({
    x: (p.x * width) / 100,
    y: (p.y * height) / 100,
  });
  return shape.type === "circle"
    ? {
        type: "circle",
        ...point(shape),
        radius: (shape.radius * Math.min(width, height)) / 100,
      }
    : { type: "polygon", points: shape.points.map(point) };
}
export function shapeContains(
  shape: HotspotShape,
  point: HotspotPoint,
  width: number,
  height: number,
) {
  const scaled = physicalShape(shape, width, height);
  const p = { x: (point.x * width) / 100, y: (point.y * height) / 100 };
  return scaled.type === "circle"
    ? Math.hypot(p.x - scaled.x, p.y - scaled.y) <= scaled.radius + EPS
    : pointInPolygon(p, scaled.points);
}
function shapesOverlap(a: HotspotShape, b: HotspotShape): boolean {
  if (a.type === "circle" && b.type === "circle")
    return Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius + EPS;
  if (a.type === "polygon" && b.type === "circle") return shapesOverlap(b, a);
  if (a.type === "circle" && b.type === "polygon")
    return (
      pointInPolygon(a, b.points) ||
      edges(b.points).some(
        ([p, q]) => distanceToSegment(a, p, q) <= a.radius + EPS,
      )
    );
  if (a.type === "polygon" && b.type === "polygon")
    return (
      pointInPolygon(a.points[0], b.points) ||
      pointInPolygon(b.points[0], a.points) ||
      edges(a.points).some(([p, q]) =>
        edges(b.points).some(([r, s]) => intersects(p, q, r, s)),
      )
    );
  return false;
}
export function hotspotConflicts(config: HotspotConfig): string[] {
  const conflicts: string[] = [];
  for (let i = 0; i < config.regions.length; i++) {
    for (let j = i + 1; j < config.regions.length; j++) {
      const a = config.regions[i],
        b = config.regions[j];
      if (
        a.shapes.some((sa) =>
          b.shapes.some((sb) =>
            shapesOverlap(
              physicalShape(sa, config.imageWidth, config.imageHeight),
              physicalShape(sb, config.imageWidth, config.imageHeight),
            ),
          ),
        )
      )
        conflicts.push(`${a.label} / ${b.label}`);
    }
  }
  return conflicts;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("La configuración de zonas no es válida.");
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, limit = 150) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > limit)
    throw new Error(`${name} debe tener entre 1 y ${limit} caracteres.`);
  return value.trim();
}
function number(value: unknown, name: string, max = 100, min = 0) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error(`${name} debe estar entre ${min} y ${max}.`);
  return value;
}
function parsePoint(value: unknown) {
  const p = object(value);
  return {
    x: number(p.x, "La posición horizontal"),
    y: number(p.y, "La posición vertical"),
  };
}
function parseShape(
  value: unknown,
  width: number,
  height: number,
): HotspotShape {
  const s = object(value);
  if (s.type === "circle") {
    const p = parsePoint(s),
      radius = number(s.radius, "El radio", 50, 0.1);
    const rx = (radius * Math.min(width, height)) / width,
      ry = (radius * Math.min(width, height)) / height;
    if (p.x - rx < 0 || p.x + rx > 100 || p.y - ry < 0 || p.y + ry > 100)
      throw new Error("El círculo debe quedar dentro de la imagen.");
    return { type: "circle", ...p, radius };
  }
  if (
    s.type !== "polygon" ||
    !Array.isArray(s.points) ||
    s.points.length < 3 ||
    s.points.length > 100
  )
    throw new Error("Cada camino necesita entre 3 y 100 vértices.");
  const points = s.points.map(parsePoint),
    segments = edges(points);
  if (new Set(points.map((p) => `${p.x},${p.y}`)).size !== points.length)
    throw new Error("El camino tiene vértices repetidos.");
  const area = segments.reduce((sum, [a, b]) => sum + a.x * b.y - b.x * a.y, 0);
  if (Math.abs(area) < EPS)
    throw new Error("El camino debe encerrar una superficie.");
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (j === i + 1 || (i === 0 && j === segments.length - 1)) continue;
      if (intersects(...segments[i], ...segments[j]))
        throw new Error("Los bordes de un camino no pueden cruzarse.");
    }
  }
  return { type: "polygon", points };
}
/** Rebuilds every object explicitly, preventing private attributes in public data. */
export function parseHotspotConfig(value: unknown): HotspotConfig {
  const c = object(value);
  if (c.version !== 1)
    throw new Error("La versión de zonas activas no es válida.");
  const img = object(c.image);
  const url = text(img.url, "La imagen", 12_000_000);
  if (
    !/^(data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]|https?:\/\/|\/[^/])/i.test(
      url,
    )
  )
    throw new Error("La URL de la imagen no es válida.");
  const imageWidth = number(c.imageWidth, "El ancho de imagen", 20000, 1),
    imageHeight = number(c.imageHeight, "El alto de imagen", 20000, 1);
  if (
    !Array.isArray(c.regions) ||
    c.regions.length < 1 ||
    c.regions.length > 50
  )
    throw new Error("Agrega entre 1 y 50 zonas sobre la imagen.");
  const regions = c.regions.map((value) => {
    const r = object(value);
    if (!Array.isArray(r.shapes) || !r.shapes.length || r.shapes.length > 20)
      throw new Error("Cada zona necesita entre 1 y 20 trazados.");
    return {
      id: text(r.id, "El ID de la zona"),
      label: text(r.label, "El nombre de la zona"),
      shapes: r.shapes.map((s) => parseShape(s, imageWidth, imageHeight)),
    };
  });
  if (new Set(regions.map((r) => r.id)).size !== regions.length)
    throw new Error("Los IDs de las zonas deben ser únicos.");
  const config: HotspotConfig = {
    version: 1,
    image: {
      id: text(img.id, "El ID de imagen"),
      name: text(img.name, "El nombre de imagen", 255),
      url,
    },
    imageWidth,
    imageHeight,
    regions,
  };
  const conflicts = hotspotConflicts(config);
  if (conflicts.length)
    throw new Error(
      `Se superponen estas zonas: ${conflicts.join(", ")}. Separa sus bordes.`,
    );
  return config;
}
export function parseHotspotKey(
  value: unknown,
  config: HotspotConfig,
): HotspotKey {
  const key = object(value);
  if (
    key.version !== 1 ||
    !Array.isArray(key.acceptedRegionIds) ||
    !key.acceptedRegionIds.length
  )
    throw new Error("Marca al menos una zona como respuesta correcta.");
  const ids = key.acceptedRegionIds;
  if (
    ids.some(
      (id) =>
        typeof id !== "string" || !config.regions.some((r) => r.id === id),
    ) ||
    new Set(ids).size !== ids.length
  )
    throw new Error(
      "Las respuestas correctas deben ser zonas existentes y no repetidas.",
    );
  return { version: 1, acceptedRegionIds: ids as string[] };
}
export function validateHotspotAnswer(config: HotspotConfig, payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return false;
  const answer = payload as Record<string, unknown>;
  return (
    answer.version === 1 &&
    Object.keys(answer).every((k) => k === "version" || k === "regionId") &&
    (answer.regionId === null ||
      (typeof answer.regionId === "string" &&
        config.regions.some((r) => r.id === answer.regionId)))
  );
}
