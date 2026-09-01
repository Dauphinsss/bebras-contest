export type SiteNavRole = "public" | "admin" | "staff";

export const SITE_NAV_ITEMS = [
  { href: "/practica", label: "Práctica", role: "public" },
  { href: "/tareas", label: "Tareas", role: "admin" },
  { href: "/competencias", label: "Desafíos", role: "admin" },
  { href: "/grupos", label: "Grupos", role: "staff" },
  { href: "/maestros", label: "Maestros", role: "admin" },
] as const satisfies ReadonlyArray<{
  href: string;
  label: string;
  role: SiteNavRole;
}>;

export function canAccessSiteNav(
  itemRole: SiteNavRole,
  userRole?: string,
  userStatus?: string,
) {
  if (itemRole === "public") {
    return true;
  }

  if ((userStatus ?? "approved") !== "approved") {
    return false;
  }

  if (userRole === "admin") {
    return true;
  }

  return userRole === "maestro" && itemRole === "staff";
}
