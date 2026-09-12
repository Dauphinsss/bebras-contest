import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const target of ["staging", "production"]) {
  const origin = `https://bebras-contest${target === "staging" ? "-staging" : ""}.bebrasbolivia.workers.dev`;
  const secrets = JSON.parse(await readFile(`.wrangler/credentials/${target}.json`, "utf8"));
  for (const path of ["/", "/registro", "/login"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, `${target} ${path}`);
  }
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "steven@bebras.bo", password: secrets.SEED_ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200, `${target} login`);
  const session = await login.json() as { token: string };
  assert.ok(session.token);
  for (const path of ["/api/auth/me", "/api/tasks", "/api/contests", "/api/users/maestros"]) {
    const response = await fetch(`${origin}${path}`, { headers: { Authorization: `Bearer ${session.token}` } });
    assert.equal(response.status, 200, `${target} admin ${path}`);
  }
  const practice = await fetch(`${origin}/api/public-contests`);
  assert.equal(practice.status, target === "production" ? 401 : 200, `${target} public contests`);
  console.log(`PASS ${target}: páginas, login administrador, perfil, administración y restricción pública.`);
}
