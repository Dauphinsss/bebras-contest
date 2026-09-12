import bcrypt from "bcryptjs";
import { ADMINS, executeStatements, insert, parseOptions, prismaDate, isScriptMain } from "../../scripts/cloudflare-seed";

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args, true);
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password?.trim()) throw new Error("Define SEED_ADMIN_PASSWORD.");
  const passwordHash = await bcrypt.hash(password, 10);
  const date = prismaDate();
  // Explicit admin reset retains the old upsert behavior, unlike bootstrap.
  await executeStatements(options, ADMINS.map(admin => insert("User", "email", {
    ...admin, passwordHash, role: "admin", status: "approved", createdAt: date, updatedAt: date,
  }, ["name", "passwordHash", "role", "updatedAt"])));
}

if (isScriptMain("backend/scripts/seed-admins.ts")) main().catch(() => {
  console.error("Seed admins falló; revisa contraseña, target, configuración y esquema D1.");
  process.exitCode = 1;
});
