// Local-only investigation. Run with Node; uses the installed Wrangler toolchain.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const require = createRequire(import.meta.url);
const toolRequire = createRequire(require.resolve('wrangler/package.json'));
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const { Miniflare, convertV4MiniflareOptions } = toolRequire('miniflare');
const { build } = toolRequire('esbuild');
const source = `
import { scrypt, scryptSync, pbkdf2, pbkdf2Sync } from 'node:crypto';
import { Buffer } from 'node:buffer';
import bcrypt from ${JSON.stringify(backendRequire.resolve('bcryptjs'))};
import { DurableObject } from 'cloudflare:workers';
const password = 'Local-test-contraseña-🔐';
const salt = Buffer.from('0123456789abcdef');
const handler = { async fetch(request) {
  const { kind, N, p, iterations, digest = 'sha256', repeat = 1, maxmem = 192 * 1024 * 1024 } = await request.json();
  try {
    let result;
    for (let i = 0; i < repeat; i++) {
      const options = { N, r: 8, p, maxmem };
      if (kind === 'scryptSync') result = scryptSync(password, salt, 32, options);
      else if (kind === 'scrypt') result = await new Promise((ok, fail) => scrypt(password, salt, 32, options, (e, v) => e ? fail(e) : ok(v)));
      else if (kind === 'pbkdf2Sync') result = pbkdf2Sync(password, salt, iterations, 32, digest);
      else if (kind === 'pbkdf2') result = await new Promise((ok, fail) => pbkdf2(password, salt, iterations, 32, digest, (e, v) => e ? fail(e) : ok(v)));
      else if (kind === 'webcrypto') {
        const key = await crypto.subtle.importKey('raw', Buffer.from(password), 'PBKDF2', false, ['deriveBits']);
        result = Buffer.from(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: digest === 'sha256' ? 'SHA-256' : 'SHA-512' }, key, 256));
      } else if (kind === 'bcrypt10') result = await bcrypt.hash(password, '$2b$10$abcdefghijklmnopqrstuu');
      else result = Buffer.alloc(32);
    }
    return Response.json({ ok: true, result: typeof result === 'string' ? result : result.toString('hex') });
  } catch (e) { return Response.json({ ok: false, error: e.name + ': ' + e.message }); }
}};
export class PasswordProbe extends DurableObject {
  async fetch(request) { return handler.fetch(request); }
}
export default { async fetch(request, env) {
  if (new URL(request.url).pathname === '/do') return env.HASHER.get(env.HASHER.idFromName('local-probe')).fetch(request);
  return handler.fetch(request);
}};`;
const bundle = await build({ stdin: { contents: source, resolveDir: process.cwd() }, bundle: true,
  write: false, format: 'esm', platform: 'browser', external: ['node:*', 'cloudflare:*'] });
const options = { modules: true, script: bundle.outputFiles[0].text,
  compatibilityDate: '2026-09-11', compatibilityFlags: ['nodejs_compat'],
  host: '127.0.0.1', port: 0, cf: false,
  durableObjects: { HASHER: { className: 'PasswordProbe', useSQLite: true } } };
const mf = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(options) : options);
const ps = (command) => execFileSync('pwsh', ['-NoProfile', '-Command', command], { encoding: 'utf8' }).trim();
try {
  await mf.ready;
  console.log(JSON.stringify({ node: process.version, wrangler: require('wrangler/package.json').version,
    miniflare: toolRequire('miniflare/package.json').version, workerd: toolRequire('workerd').version }));
  // Windows process CPU includes native code, all threads, and runtime overhead.
  // It is NOT the hosted Workers billing/limit meter. Identify only our child.
  const ids = JSON.parse(ps(`ConvertTo-Json -Compress -AsArray @(Get-CimInstance Win32_Process -Filter "ParentProcessId = ${process.pid}" | Where-Object Name -eq 'workerd.exe' | ForEach-Object ProcessId)`));
  assert.equal(ids.length, 1, 'Expected one isolated workerd child');
  const cpu = () => Number(ps(`(Get-Process -Id ${ids[0]}).TotalProcessorTime.TotalMilliseconds.ToString([cultureinfo]::InvariantCulture)`));
  const request = async (spec, path = '/probe') => (await mf.dispatchFetch(`http://localhost${path}`, {
    method: 'POST', body: JSON.stringify(spec),
  })).json();
  const specs = [{ kind: 'noop' }, { kind: 'bcrypt10' }];
  for (const kind of ['scrypt', 'scryptSync']) {
    for (const [N, p] of [[131072, 1], [65536, 2], [32768, 3], [16384, 5], [8192, 10], [16384, 1]]) specs.push({ kind, N, p });
  }
  for (const kind of ['pbkdf2', 'pbkdf2Sync', 'webcrypto']) {
    for (const [iterations, digest] of [[600000, 'sha256'], [220000, 'sha512'], [100001, 'sha256'], [100000, 'sha256']]) specs.push({ kind, iterations, digest });
  }
  const { scryptSync, pbkdf2Sync } = await import('node:crypto');
  for (const spec of process.argv.includes('--bindings-only') ? [] : specs) {
    const initial = await request(spec);
    if (!initial.ok) { console.log(JSON.stringify({ ...spec, ...initial })); continue; }
    if (spec.kind.startsWith('scrypt')) assert.equal(initial.result, scryptSync('Local-test-contraseña-🔐', '0123456789abcdef', 32, { N: spec.N, r: 8, p: spec.p, maxmem: 192 * 1024 * 1024 }).toString('hex'));
    if (spec.iterations) assert.equal(initial.result, pbkdf2Sync('Local-test-contraseña-🔐', '0123456789abcdef', spec.iterations, 32, spec.digest).toString('hex'));
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const before = cpu(), start = performance.now();
      const result = await request({ ...spec, repeat: 10 });
      const wall = performance.now() - start, after = cpu();
      assert.equal(result.ok, true);
      assert.equal(result.result, initial.result);
      samples.push({ processCpuMsPerOp: +( (after - before) / 10).toFixed(3), wallMsPerOp: +(wall / 10).toFixed(3) });
    }
    console.log(JSON.stringify({ ...spec, ok: true, matchesNode: spec.kind !== 'noop' && spec.kind !== 'bcrypt10', samples }));
  }
  const bindingSpec = { kind: 'scrypt', N: 16384, p: 5, maxmem: 32 * 1024 * 1024 };
  const direct = await request(bindingSpec);
  assert.equal(direct.ok, true);
  const before = cpu(), start = performance.now();
  const bound = await request({ ...bindingSpec, repeat: 10 }, '/do');
  const wall = performance.now() - start, after = cpu();
  assert.deepEqual(bound, direct);
  console.log(JSON.stringify({ binding: 'SQLite Durable Object', ...bindingSpec, matchesDirect: true,
    processCpuMsPerOp: +((after - before) / 10).toFixed(3), wallMsPerOp: +(wall / 10).toFixed(3),
    hostedCpuAttribution: 'Not measured locally; workerd process CPU includes both caller and DO' }));
} finally { await mf.dispose(); }
