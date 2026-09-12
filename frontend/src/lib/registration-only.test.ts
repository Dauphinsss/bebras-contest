import { describe, expect, test } from "bun:test";
import { isRegistrationRestrictedPath } from "./registration-only";
import { canAccessSiteNav } from "./site-navigation";

describe("registration-only frontend policy", () => {
  test("restricts activity routes and descendants only when enabled", () => {
    for (const path of [
      "/grupos",
      "/grupos/",
      "/mis-practicas",
      "/practica",
      "/practica/tarea",
      "/practica/categoria",
      "/entrar",
      "/rendir",
    ]) {
      expect(isRegistrationRestrictedPath(path, true)).toBe(true);
      expect(isRegistrationRestrictedPath(path, false)).toBe(false);
    }
    for (const path of [
      "/",
      "/registro",
      "/login",
      "/perfil",
      "/carta-modelo",
      "/maestros",
      "/tareas",
      "/desafios/probar",
      "/practicamente",
    ]) {
      expect(isRegistrationRestrictedPath(path, true)).toBe(false);
    }
  });

  test("hides activities from public and teachers in every account status", () => {
    for (const role of [undefined, "maestro"]) {
      for (const status of [
        undefined,
        "pending",
        "approved",
        "rejected",
        "suspended",
      ]) {
        for (const item of ["public", "staff", "approved-maestro"] as const) {
          expect(canAccessSiteNav(item, role, status, true)).toBe(false);
        }
      }
    }
    expect(canAccessSiteNav("maestro", "maestro", "pending", true)).toBe(true);
  });

  test("preserves all existing administrator navigation", () => {
    for (const item of [
      "public",
      "admin",
      "staff",
      "maestro",
      "approved-maestro",
    ] as const) {
      expect(canAccessSiteNav(item, "admin", "approved", true)).toBe(
        canAccessSiteNav(item, "admin", "approved", false),
      );
    }
  });

  test("keeps the complete mode when disabled", () => {
    expect(canAccessSiteNav("public", undefined, undefined, false)).toBe(true);
    expect(canAccessSiteNav("staff", "maestro", "approved", false)).toBe(true);
    expect(
      canAccessSiteNav("approved-maestro", "maestro", "approved", false),
    ).toBe(true);
    expect(canAccessSiteNav("admin", "maestro", "approved", false)).toBe(false);
  });
});
