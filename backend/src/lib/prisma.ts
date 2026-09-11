import { env } from "cloudflare:workers";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "../generated/prisma/client";

export const prisma = new PrismaClient({
  adapter: new PrismaD1(env.DB),
  log: ["warn", "error"],
});
