/**
 * Conecta los dos Workers con GitHub para que cada push despliegue solo.
 *
 * Requiere que la cuenta de GitHub ya este autorizada en el Dashboard: esa
 * autorizacion es un OAuth que no tiene API y sin ella la creacion de la
 * conexion responde 8000008 ("This project is disconnected from your Git
 * account"). Todo lo demas si se hace por API.
 *
 *   $env:CLOUDFLARE_API_TOKEN = '<token con Workers Builds Configuration: Edit>'
 *   bun scripts/cloudflare-builds-setup.ts --check
 *   bun scripts/cloudflare-builds-setup.ts
 *
 * El token debe ser de usuario (los de cuenta no sirven) y necesita ademas
 * Workers Scripts: Read para resolver el tag de cada Worker.
 */
const ACCOUNT = "a9ca7f3bfd5ff492721f722856ac79b6";
const API = "https://api.cloudflare.com/client/v4";

const REPO = {
  provider_type: "github",
  provider_account_id: "295968330",
  provider_account_name: "Bebras-Bolivia",
  repo_id: "1195777825",
  repo_name: "bebras-contest",
};

/** Mismos comandos que el despliegue manual; ver docs/workers-builds.md. */
const TRIGGERS = [
  {
    worker: "bebras-contest",
    trigger_name: "production",
    branch: "master",
    build_command: "bun run setup && bun run build:production",
    deploy_command: "bunx wrangler deploy --env production",
  },
  {
    worker: "bebras-contest-staging",
    trigger_name: "staging",
    branch: "staging",
    build_command: "bun run setup && bun run build:staging",
    deploy_command: "bunx wrangler deploy --env staging",
  },
];

const check = process.argv.includes("--check");
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  throw new Error(
    "Falta CLOUDFLARE_API_TOKEN. No lo guardes en el repositorio: pasalo por entorno.",
  );
}

async function cf(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}/accounts/${ACCOUNT}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json()) as {
    success: boolean;
    result: any;
    errors: { code: number; message: string }[];
  };
  if (!body.success) {
    const detalle = body.errors?.map((e) => `${e.code}: ${e.message}`).join("; ");
    if (body.errors?.some((e) => e.code === 8000008)) {
      throw new Error(
        `${detalle}\n\n` +
          "La cuenta de GitHub no esta autorizada para esta cuenta de Cloudflare.\n" +
          "Autorizala una vez en el Dashboard (Workers & Pages > bebras-contest >\n" +
          "Settings > Builds > Connect) y vuelve a ejecutar este script.",
      );
    }
    throw new Error(`${path}: ${detalle}`);
  }
  return body.result;
}

const scripts: { id: string; tag: string }[] = await cf("workers/scripts");
const tags = new Map(scripts.map((s) => [s.id, s.tag]));
for (const t of TRIGGERS) {
  if (!tags.has(t.worker)) throw new Error(`No existe el Worker ${t.worker}.`);
}

const tokens: { build_token_uuid: string; build_token_name: string }[] =
  await cf("builds/tokens");

console.log("Workers:");
for (const t of TRIGGERS) console.log(`  ${t.worker}  tag=${tags.get(t.worker)}`);
console.log(`Build tokens disponibles: ${tokens.length}`);

if (!tokens.length) {
  console.log(
    "\nNo hay build tokens: Cloudflare los crea al conectar el repositorio\n" +
      "desde el Dashboard. Haz esa conexion una vez y vuelve a ejecutar.",
  );
  process.exit(1);
}

if (check) {
  console.log("\n--check: no se creo ninguna conexion ni trigger.");
  process.exit(0);
}

const conexion = await cf("builds/repos/connections", {
  method: "PUT",
  body: JSON.stringify(REPO),
});
console.log(`\nConexion del repositorio: ${conexion.repo_connection_uuid}`);

for (const t of TRIGGERS) {
  const creado = await cf("builds/triggers", {
    method: "POST",
    body: JSON.stringify({
      external_script_id: tags.get(t.worker),
      repo_connection_uuid: conexion.repo_connection_uuid,
      build_token_uuid: tokens[0].build_token_uuid,
      trigger_name: t.trigger_name,
      build_command: t.build_command,
      deploy_command: t.deploy_command,
      root_directory: "/",
      // Solo su rama dispara su entorno; `cloudflare-build.ts` ademas falla si
      // la rama que reporta Workers Builds no corresponde al objetivo.
      branch_includes: [t.branch],
      branch_excludes: [],
      path_includes: ["*"],
      path_excludes: [],
    }),
  });
  console.log(`  ${t.worker} <- ${t.branch}: ${creado.trigger_uuid ?? "creado"}`);
}

console.log(
  "\nListo. Falta comprobar en el Dashboard que las variables del build sean\n" +
    "BUN_VERSION=1.3.5, NODE_VERSION=22 y SKIP_DEPENDENCY_INSTALL=1.",
);
