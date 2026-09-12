export type SiteNavRole =
  | "public"
  | "admin"
  | "staff"
  | "maestro"
  | "approved-maestro";

export function canAccessSiteNavForMode(
  itemRole: SiteNavRole,
  userRole?: string,
  userStatus?: string,
  registrationOnly = false,
) {
  if (
    registrationOnly &&
    (itemRole === "public" ||
      itemRole === "staff" ||
      itemRole === "approved-maestro") &&
    userRole !== "admin"
  ) {
    return false;
  }
  if (itemRole === "public") return true;
  if (itemRole === "maestro") return userRole === "maestro";
  if (itemRole === "approved-maestro")
    return userRole === "maestro" && userStatus === "approved";
  if (userStatus !== "approved") return false;
  if (userRole === "admin") return true;
  return userRole === "maestro" && itemRole === "staff";
}
