export function practiceOrigin(value: string | null) {
  return value === "/entrar" ? "/entrar" : "/practica";
}

export function practiceCategoryHref(category: string, origin: string) {
  const params = new URLSearchParams({
    nombre: category,
    from: practiceOrigin(origin),
  });
  return `/practica/categoria?${params.toString()}`;
}

export function practiceTaskHref(
  taskId: string,
  category: string,
  origin: string,
) {
  const params = new URLSearchParams({
    id: taskId,
    nombre: category,
    from: practiceOrigin(origin),
  });
  return `/practica/tarea?${params.toString()}`;
}
