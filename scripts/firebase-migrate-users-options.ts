export function selectedMigrationUsers(args: string[]) {
  const users: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--user") continue;
    const value = args[index + 1]?.trim();
    if (!value || value.startsWith("--")) {
      throw new Error("Cada --user requiere un correo o UID.");
    }
    users.push(value);
    index += 1;
  }

  return [...new Set(users)];
}

export function matchesMigrationUser(
  selector: string,
  user: { email: string; firebaseUid: string | null },
) {
  return (
    selector === user.firebaseUid ||
    selector.toLowerCase() === user.email.trim().toLowerCase()
  );
}
