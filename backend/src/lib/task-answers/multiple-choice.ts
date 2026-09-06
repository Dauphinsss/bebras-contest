export function parseMcCorrectness(value: string) {
  const raw = String(value ?? "").trim();
  const separatorAt = raw.indexOf(":");

  if (separatorAt === -1) {
    return { mode: "single", ids: raw ? [raw] : [] };
  }

  const rawMode = raw.slice(0, separatorAt);
  const mode = rawMode === "any" || rawMode === "all" ? rawMode : "single";
  const ids = [
    ...new Set(
      raw
        .slice(separatorAt + 1)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];

  return { mode, ids: mode === "single" ? ids.slice(0, 1) : ids };
}
