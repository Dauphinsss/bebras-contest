import { readFileSync } from "node:fs";
import { runStatements, type LocalD1, type Statement } from "./cloudflare-local-d1";

export function parameterizeExportInsert(sql: string): Statement {
  const params: Statement["params"] = [];
  let prepared = "";
  for (let i = 0; i < sql.length; i++) {
    // Quoted identifiers are not values (and can contain apostrophes).
    if (sql[i] === '"' || sql[i] === '`' || sql[i] === '[') {
      const end = sql[i] === '[' ? ']' : sql[i];
      prepared += sql[i];
      while (++i < sql.length) {
        prepared += sql[i];
        if (sql[i] === end) {
          if (sql[i + 1] === end && end !== ']') prepared += sql[++i];
          else break;
        }
      }
    } else if (sql[i] === "'") {
      const start = i;
      let value = "";
      let closed = false;
      while (++i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { value += "'"; i++; }
          else { closed = true; break; }
        } else value += sql[i];
      }
      if (!closed) throw new Error("Literal SQL de respaldo incompleto.");
      if (start > 0 && /[xX]/.test(sql[start - 1])) {
        // BLOB literals remain SQL; application data currently has no BLOBs.
        prepared += sql.slice(start, i + 1);
      } else { prepared += "?"; params.push(value); }
    } else prepared += sql[i];
  }
  if (Buffer.byteLength(prepared) > 100_000 || params.length > 100) throw new Error("Sentencia de respaldo excede límites D1.");
  return { sql: prepared, params };
}

export async function restoreExport(db: LocalD1, file: string): Promise<void> {
  const { unstable_splitSqlQuery } = await import("wrangler");
  const queries = unstable_splitSqlQuery(readFileSync(file, "utf8"));
  const schema: Statement[] = [];
  const data: Statement[] = [];
  const remaining: Statement[] = [];
  for (const query of queries) {
    const sql = query.trim();
    if (/^(?:BEGIN|COMMIT|END TRANSACTION|PRAGMA foreign_keys|PRAGMA defer_foreign_keys)\b/i.test(sql)) continue;
    if (/^CREATE TABLE\b/i.test(sql)) schema.push({ sql, params: [] });
    else if (/^(?:INSERT|REPLACE)\b/i.test(sql)) data.push(parameterizeExportInsert(sql));
    else if (/^DELETE\b/i.test(sql)) data.push({ sql, params: [] });
    else remaining.push({ sql, params: [] });
  }
  if (!schema.length) throw new Error("El respaldo no contiene esquema.");
  const statements = [{ sql: "PRAGMA defer_foreign_keys = ON", params: [] }, ...schema, ...data, ...remaining];
  if (statements.some(s => Buffer.byteLength(s.sql) > 100_000)) throw new Error("Esquema de respaldo excede límites D1.");
  await runStatements(db, statements, statements.length);
}
