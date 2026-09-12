import { dirname, resolve } from "node:path";

export type Statement = { sql: string; params: (string | number | null)[] };
export interface LocalD1 {
  prepare(sql: string): { bind(...params: (string | number | null)[]): any; run(): Promise<any>; all<T = Record<string, unknown>>(): Promise<{ results: T[] }> };
  batch(statements: any[]): Promise<any[]>;
}

export async function withLocalD1<T>(config: string, action: (db: LocalD1) => Promise<T>, persist: boolean | { path: string } = true): Promise<T> {
  process.env.WRANGLER_SEND_METRICS = "false";
  process.env.WRANGLER_WRITE_LOGS = "false";
  const { getPlatformProxy } = await import("wrangler");
  // Wrangler CLI resolves default state relative to its config; Miniflare's
  // relative persist path can otherwise resolve against the caller's cwd.
  const persistence = persist === true ? { path: resolve(dirname(resolve(config)), ".wrangler/state/v3") } : persist;
  const platform = await getPlatformProxy<{ DB: LocalD1 }>({ configPath: resolve(config), persist: persistence, remoteBindings: false });
  try {
    if (!platform.env.DB?.prepare) throw new Error("La configuración no declara el binding D1 DB.");
    return await action(platform.env.DB);
  } finally { await platform.dispose(); }
}

export async function runStatements(db: LocalD1, statements: Statement[], batchSize = 50) {
  const results: any[] = [];
  for (let start = 0; start < statements.length; start += batchSize) {
    results.push(...await db.batch(statements.slice(start, start + batchSize).map(({ sql, params }) => db.prepare(sql).bind(...params))));
  }
  return results;
}
