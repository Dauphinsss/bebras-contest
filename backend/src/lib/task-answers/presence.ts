/** Started answers include partial configurations; empty answers earn no penalty. */
export function answerHasResponse(
  answerType: string,
  payload: unknown,
): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return false;
  const response = payload as Record<string, unknown>;
  switch (answerType) {
    case "multiple_choice":
      return Array.isArray(response.selected) && response.selected.length > 0;
    case "short_text":
      return (
        typeof response.text === "string" && response.text.trim().length > 0
      );
    case "range": {
      const value = response.value;
      return (
        (typeof value === "string" || typeof value === "number") &&
        String(value).trim() !== "" &&
        Number.isFinite(Number(value))
      );
    }
    case "drag_drop":
      return (
        Boolean(response.placements) &&
        typeof response.placements === "object" &&
        !Array.isArray(response.placements) &&
        Object.keys(response.placements as object).length > 0
      );
    default:
      return false;
  }
}
