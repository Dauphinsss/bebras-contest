import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// Limpia datos de equipos/intentos de prueba (no toca usuarios ni competencias).
async function main() {
  await prisma.attemptAnswer.deleteMany({});
  await prisma.result.deleteMany({});
  await prisma.attempt.deleteMany({});
  const teams = await prisma.team.deleteMany({});
  console.log("Equipos eliminados:", teams.count);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
