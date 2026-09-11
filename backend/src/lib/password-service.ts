import { DurableObject, env } from "cloudflare:workers";
import bcrypt from "bcryptjs";

export class PasswordService extends DurableObject {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

function passwordService() {
  // A fresh, server-generated shard per operation avoids a global queue and
  // keeps credentials/identity out of object names. No DO storage is used.
  return env.PASSWORDS.get(env.PASSWORDS.idFromName(crypto.randomUUID()));
}

export async function hashPassword(password: string): Promise<string> {
  return passwordService().hash(password);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return passwordService().verify(password, hash);
}
