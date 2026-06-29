import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "bebras2026";

const admins = [
  { name: "Marko", email: "marko@bebras.bo" },
  { name: "Steven", email: "steven@bebras.bo" },
  { name: "Vladimir", email: "vladimir@bebras.bo" },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const admin of admins) {
    await prisma.user.upsert({
      where: { email: admin.email },
      update: { name: admin.name, passwordHash, role: "admin" },
      create: {
        name: admin.name,
        email: admin.email,
        passwordHash,
        role: "admin",
      },
    });
    console.log(`Admin listo: ${admin.email}`);
  }

  console.log(`\nContraseña para los 3: ${PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
