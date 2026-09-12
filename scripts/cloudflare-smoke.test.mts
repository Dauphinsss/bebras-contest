/** Real local workerd + Prisma/D1 + R2 + Astro smoke. Run: bun scripts/cloudflare-smoke.test.mts
 * Uses only a disposable temp directory. JWT secret/tokens/passwords stay in memory.
 * Miniflare is resolved from the installed Wrangler, without installing packages.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(join(root, "package.json"));
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
const backendRequire = createRequire(join(root, "backend/package.json"));
// Use Node for the installed Wrangler/Miniflare toolchain and CPU benchmark.
if (process.versions.bun) {
  const code = await new Promise<number>((done, fail) => {
    const child = spawn("node", ["--import", pathToFileURL(backendRequire.resolve("tsx")).href, fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: "inherit" });
    child.on("error", fail); child.on("exit", (code) => done(code ?? 1));
  });
  process.exit(code);
}
const { Miniflare, convertV4MiniflareOptions } = wranglerRequire("miniflare");
const bcrypt = backendRequire("bcryptjs");
const jwt = backendRequire("jsonwebtoken");
const { PDFDocument } = backendRequire("pdf-lib");
const { chromium } = require("@playwright/test");
const temp = await mkdtemp(join(tmpdir(), "bebras-smoke-"));
const secret = randomBytes(48).toString("base64url");
const password = `Smoke-${randomBytes(16).toString("hex")}!`;
let mf: any;
let browser: any;
let checks = 0;
function pass(label: string) { checks++; console.log(`PASS ${label}`); }
async function command(args: string[], cwd = root, extra: Record<string, string> = {}) {
  await new Promise<void>((ok, fail) => {
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env,
      WRANGLER_SEND_METRICS: "false", CLOUDFLARE_CF_FETCH_ENABLED: "false", ...extra }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => output += chunk);
    child.stderr.on("data", (chunk) => output += chunk);
    child.on("error", fail);
    child.on("exit", (code) => code === 0 ? ok() : fail(new Error(`Build failed (${code}): ${output}`)));
  });
}
async function request(path: string, status = 200, token?: string, body?: any, method?: string) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(new URL(path, await mf.ready), { method: method ?? (body ? "POST" : "GET"), headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  // Never print response bodies: authentication responses contain bearer credentials.
  assert.equal(res.status, status, `${method ?? (body ? "POST" : "GET")} ${path}: expected ${status}, received ${res.status}`);
  return res;
}
function multipart(fields: Record<string, string>, pdf: Uint8Array, documents: string[]) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  for (const name of documents) form.set(name, new Blob([pdf], { type: "application/pdf" }), `${name}.pdf`);
  return form;
}
try {
  // Opt in to avoid repeating the independent CPU benchmark during integration fixes.
  if (process.argv.includes("--benchmark")) {
  const benchmarkHash = await bcrypt.hash(password, 10);
  for (const operation of ["hash", "compare"]) {
    const cpuSamples: number[] = [], wallSamples: number[] = [];
    for (let i = 0; i < 6; i++) {
      const cpu = process.cpuUsage(), start = performance.now();
      if (operation === "hash") await bcrypt.hash(password, 10);
      else assert.equal(await bcrypt.compare(password, benchmarkHash), true);
      const used = process.cpuUsage(cpu);
      if (i) { cpuSamples.push((used.user + used.system) / 1000); wallSamples.push(performance.now() - start); }
    }
    const summary = (values: number[]) => {
      values.sort((a, b) => a - b);
      return { min: +values[0].toFixed(2), median: +values[2].toFixed(2), max: +values[4].toFixed(2) };
    };
    console.log(`BENCH bcryptjs cost=10 ${operation} n=5 warmup=1 ${JSON.stringify({ cpuMs: summary(cpuSamples), wallMs: summary(wallSamples) })}`);
  }
  console.log("Local process CPU is NOT remote Workers CPU; Free 10ms compliance remains unverified remotely.");
  }
  const config = JSON.parse((await readFile(join(root, "wrangler.jsonc"), "utf8")));
  const bundle = join(temp, "bundle");
  const configPath = join(temp, "wrangler.json");
  await writeFile(configPath, JSON.stringify({ name: "bebras-isolated-smoke", main: join(root, config.main),
    compatibility_date: config.compatibility_date, compatibility_flags: config.compatibility_flags,
    durable_objects: config.durable_objects, migrations: config.migrations }));
  for (let attempt = 1; ; attempt++) {
    try {
      await command([join(require.resolve("wrangler/package.json"), "..", "bin/wrangler.js"), "deploy", "--dry-run", "--config", configPath, "--outdir", bundle]);
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      console.log(`Bundle not ready; retry ${attempt}/2 in 10s (integration may be in progress).`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
  pass("Wrangler dry-run bundle");
  const frontendRequire = createRequire(join(root, "frontend/package.json"));
  const astro = join(frontendRequire.resolve("astro/package.json"), "..", "astro.js");
  for (const mode of ["true", "false"]) {
    await command([astro, "build", "--outDir", join(temp, `frontend-${mode}`)], join(root, "frontend"), {
      PUBLIC_REGISTRATION_ONLY: mode, PUBLIC_API_BASE_URL: "" });
  }
  pass("Astro builds for both registration modes");
  const scriptPath = join(bundle, (await readdir(bundle)).find((file) => file === "index.js")!);
  const modules = [{ type: "ESModule", path: scriptPath },
    ...(await readdir(bundle)).filter((file) => file.endsWith(".wasm"))
      .map((file) => ({ type: "CompiledWasm", path: join(bundle, file) }))];
  function options(mode: string) { const legacy = {
    name: "bebras-smoke", modules, modulesRoot: bundle, compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags, host: "127.0.0.1", port: 0, cf: false,
    inspectorPort: 0,
    durableObjects: { PASSWORDS: { className: "PasswordService", useSQLite: true } },
    d1Databases: { DB: "smoke-only-db" }, d1Persist: join(temp, "d1"),
    r2Buckets: { UPLOADS: "smoke-only-uploads" }, r2Persist: join(temp, "r2"),
    bindings: { JWT_SECRET: secret, REGISTRATION_ONLY: mode, FRONTEND_ORIGIN: "" },
    assets: { directory: join(temp, `frontend-${mode}`), binding: "ASSETS",
      run_worker_first: config.assets.run_worker_first, routerConfig: { has_user_worker: true },
      assetConfig: { not_found_handling: "404-page" } },
   }; return convertV4MiniflareOptions
     ? { ...convertV4MiniflareOptions(legacy), resourcePersistencePath: join(temp, "state") }
     : legacy; }
  mf = new Miniflare(options("true"));
  let db: any;
  try { db = await mf.getD1Database("DB"); }
  catch (startupError) {
    const line = /at index\.js:(\d+):/.exec(String(startupError));
    if (line) console.error("Failing bundle source (no test credentials):", (await readFile(scriptPath, "utf8")).split("\n").slice(Number(line[1]) - 5, Number(line[1]) + 2).join("\n"));
    throw startupError;
  }
  for (const file of (await readdir(join(root, "backend/migrations"))).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = await readFile(join(root, "backend/migrations", file), "utf8");
    for (const statement of sql.replace(/^--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run();
  }
  await db.prepare('INSERT INTO School (codUe,name,dep,pro,sec,dis) VALUES (?,?,?,?,?,?)').bind("SMOKE001", "Colegio Smoke", "La Paz", "Murillo", "Centro", "La Paz").run();
  const adminHash = await bcrypt.hash(password, 10);
  await db.prepare('INSERT INTO User (email,name,passwordHash,role,status,updatedAt) VALUES (?,?,?,?,?,?)').bind("admin@smoke.test", "Admin Smoke", adminHash, "admin", "approved", Date.now()).run();
  const admin = (await (await request("/api/auth/login", 200, undefined, { email: "admin@smoke.test", password })).json()).token;
  assert.equal(jwt.verify(admin, secret, { algorithms: ["HS256"] }).role, "admin");
  await request("/api/auth/me", 401);
  await request("/api/auth/me", 401, jwt.sign({ sub: 1, role: "admin" }, randomBytes(32).toString("hex")));
  await request("/api/auth/login", 401, undefined, { email: "admin@smoke.test", password: "wrong" });
  pass("real bcrypt login + JWT verification + invalid auth denied");
  const pdfResponse = await request("/api/letter/pdf", 200, undefined, { ciudad: "La Paz", colegio: "Colegio Smoke", maestro: "Ana Pérez", director: "Luis Gómez", anio: "2026" });
  assert.match(pdfResponse.headers.get("content-type")!, /application\/pdf/);
  const pdf = new Uint8Array(await pdfResponse.arrayBuffer());
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);
  pass("real generated PDF parsed by pdf-lib");
  const users: any[] = [];
  for (const institutionType of ["school", "homeschool"]) {
    const fields = { firstName: "Ana", lastName: "Pérez", email: `${institutionType}@smoke.test`, password,
      institutionType, schoolName: institutionType === "school" ? "Colegio Smoke" : "Familia Pérez", phone: "+59171234567",
      ...(institutionType === "school" ? { schoolCodUe: "SMOKE001" } : {}) };
    const documents = institutionType === "school" ? ["letter"] : ["idFront", "idBack"];
    const registered = await (await request("/api/auth/register", 201, undefined, multipart(fields, pdf, documents))).json();
    assert.equal(registered.pendingDocuments, false);
    assert.equal(registered.user.status, "pending");
    assert.equal(jwt.verify(registered.token, secret).sub, registered.user.id);
    const login = await (await request("/api/auth/login", 200, undefined, { email: fields.email, password })).json();
    const profile = await (await request("/api/auth/me", 200, login.token)).json();
    assert.equal(profile.institutionType, institutionType);
    assert.equal(profile.schoolName, fields.schoolName);
    users.push({ ...registered.user, token: login.token, documents });
    await request("/api/auth/register", 409, undefined, multipart(fields, pdf, documents));
    for (const doc of documents) {
      const path = `/api/users/${profile.id}/documents/${doc}`;
      await request(path, 401);
      await request(path, 403, login.token);
      assert.deepEqual(new Uint8Array(await (await request(path, 200, admin)).arrayBuffer()), pdf);
    }
    await request(`/api/users/${profile.id}/approve`, 403, login.token, {});
    assert.equal((await (await request(`/api/users/${profile.id}/approve`, 200, admin, {})).json()).status, "approved");
    await request("/api/auth/me/documents", 409, login.token, multipart({}, pdf, documents));
    pass(`${institutionType}: multipart registration, login, profile, private docs, approval and replacement restriction`);
  }
  assert.equal((await (await request("/api/schools?q=Smoke")).json())[0].codUe, "SMOKE001");
  const teacher = users[0];
  const extra = await (await request("/api/auth/me/schools", 201, teacher.token, multipart({ schoolName: "Segundo Colegio" }, pdf, ["letter"]))).json();
  assert.equal((await (await request("/api/auth/me/schools", 200, teacher.token)).json()).length, 1);
  await request(`/api/auth/me/schools/${extra.id}/letter`, 404, users[1].token, multipart({}, pdf, ["letter"]));
  assert.deepEqual(new Uint8Array(await (await request(`/api/users/schools/${extra.id}/letter`, 200, admin)).arrayBuffer()), pdf);
  await request(`/api/users/schools/${extra.id}/approve`, 200, admin, {});
  await request(`/api/auth/me/schools/${extra.id}/letter`, 409, teacher.token, multipart({}, pdf, ["letter"]));
  await request(`/api/auth/me/schools/${extra.id}`, 409, teacher.token, undefined, "DELETE");
  assert.equal((await (await request("/api/users/maestros", 200, admin)).json()).length, 2);
  pass("school catalog + additional school ownership, document and approval restrictions");
  for (const mode of ["true", "false"]) {
    if (mode === "false") { await mf.dispose(); mf = new Miniflare(options(mode)); }
    for (const path of ["/api/practice/categories", "/api/public-contests"]) {
      await request(path, mode === "true" ? 401 : 200);
      await request(path, mode === "true" ? 403 : 200, teacher.token);
      await request(path, 200, admin);
    }
    await request("/api/groups", mode === "true" ? 403 : 200, teacher.token);
    await request("/api/published-contests", mode === "true" ? 403 : 200, teacher.token);
    await request("/api/play/join", mode === "true" ? 401 : 400, undefined, {});
    await request("/api/auth/me", 200, teacher.token);
    const html = await (await request("/")).text();
    assert.match(html, /<html/);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.goto(new URL("/login", await mf.ready).href);
    // Inputs exist in SSR HTML before React attaches handlers. Wait for Astro hydration.
    await page.locator('astro-island[component-export="LoginForm"]:not([ssr])').waitFor({ state: "attached" });
    await page.locator("#login-email").fill(teacher.email);
    await page.locator("#login-password").fill(password);
    const [loginResponse] = await Promise.all([
      page.waitForResponse((response: any) => new URL(response.url()).pathname === "/api/auth/login" && response.request().method() === "POST", { timeout: 20_000 }),
      page.locator('button[type="submit"]').click(),
    ]);
    assert.equal(new URL(loginResponse.url()).origin, (await mf.ready).origin, "browser login must use same-origin Worker");
    assert.equal(loginResponse.status(), 200, "browser login response");
    await page.waitForURL((url: URL) => url.pathname.replace(/\/+$/, "") === "/perfil", { timeout: 20_000 });
    assert.deepEqual(errors, [], "frontend runtime errors");
    await browser.close(); browser = undefined;
    pass(`REGISTRATION_ONLY=${mode}: API restrictions + real browser hydrated login against same-origin Worker`);
  }
  db = await mf.getD1Database("DB");
  const rows = (await db.prepare('SELECT * FROM User WHERE role = ?').bind("maestro").all()).results;
  assert.equal(rows.length, 2);
  const bucket = await mf.getR2Bucket("UPLOADS");
  assert.equal((await bucket.list()).objects.length, 4, "only committed documents remain in R2");
  for (const row of rows) {
    assert.equal(row.status, "approved");
    assert.equal(bcrypt.getRounds(row.passwordHash), 10);
    assert.equal(await bcrypt.compare(password, row.passwordHash), true);
    for (const field of ["letterFilename", "idFrontFilename", "idBackFilename"]) if (row[field]) {
      const object = await bucket.get(row[field]);
      assert.ok(object, "persisted R2 document");
      assert.deepEqual(new Uint8Array(await object.arrayBuffer()), pdf);
    }
  }
  assert.equal((await db.prepare('SELECT status FROM TeacherSchool WHERE id = ?').bind(extra.id).first()).status, "approved");
  pass("D1 and byte-exact R2 persistence after runtime restart; rejected uploads cleaned up");
  console.log(`PASS ${checks} smoke groups; isolated local state only.`);
} finally {
  await browser?.close();
  await mf?.dispose().catch(() => {});
  await rm(temp, { recursive: true, force: true });
}
