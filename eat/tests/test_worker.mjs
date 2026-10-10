import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const python = process.env.PYTHON || 'python3';
const build = (mode, out) => execFileSync(python, [join(root, 'eat/build.py'), '--mode', mode, '--out', out]);

async function fixture(t, mode) {
  const dir = await mkdtemp(join(tmpdir(), 'eat-build-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const out = join(dir, mode);
  build(mode, out);
  return { dir, out, modules: join(out, '_worker.js') };
}

 test('combined build keeps upstream byte-identical and is repeatable', async t => {
  const { out, modules } = await fixture(t, 'combined');
  const original = await readFile(join(root, '_worker.js'));
  assert.deepEqual(await readFile(join(modules, 'upstream.js')), original);
  const files = await readdir(modules);
  const initial = await Promise.all(files.map(name => readFile(join(modules, name))));
  build('combined', out);
  assert.deepEqual(await readdir(modules), files);
  assert.deepEqual(await Promise.all(files.map(name => readFile(join(modules, name)))), initial);
  assert.deepEqual(await readFile(join(root, '_worker.js')), original);
  // Import the real upstream bundle with the production adapter, without calling proxy code.
  const { default: worker } = await import(pathToFileURL(join(modules, 'index.js')));
  for (const path of ['/eat', '/eat/']) {
    const response = await worker.fetch(new Request(`https://example.test${path}`), {}, {});
    assert.equal(response.status, 200);
    assert.match(await response.text(), /大家的美味奖池/);
  }
  const head = await worker.fetch(new Request('https://example.test/eat', { method: 'HEAD' }), {}, {});
  assert.equal(await head.text(), '');
  const api = await worker.fetch(new Request('https://example.test/eat/api/pool'), {}, {});
  assert.equal(api.status, 503);
  assert.equal((await api.json()).code, 'NOT_CONFIGURED');
});

 test('adapter forwards untouched requests and preserves upstream exports/handlers', async t => {
  const { modules } = await fixture(t, 'combined');
  // A future upstream may rename variables or export a separate object: no source rewriting needed.
  await writeFile(join(modules, 'upstream.js'), `
    export class FutureBinding {};
    const service = {
      marker: 42,
      scheduled() { return 123; },
      async fetch(request, env, ctx) {
        if (this !== service) throw Error('Lost upstream receiver');
        env.received = {request, ctx};
        return env.result;
      }
    };
    export default service;
  `);
  const imported = await import(pathToFileURL(join(modules, 'index.js')));
  const worker = imported.default;
  assert.equal(typeof imported.FutureBinding, 'function');
  assert.equal(worker.scheduled(), 123);
  for (const [path, method, headers] of [
    ['/admin', 'GET'], ['/admin/config.json', 'POST'], ['/sub?token=x', 'GET'],
    ['/eatery', 'GET'], ['/eat/assets/missing', 'GET'], ['/eat', 'POST'],
    ['/eat', 'GET', { Upgrade: 'websocket' }],
    ['/eat/api/pool', 'GET', { Upgrade: 'websocket' }],
  ]) {
    const request = new Request(`https://example.test${path}`, { method, headers, body: method === 'POST' ? 'unchanged' : undefined });
    const result = new Response('upstream');
    const env = { result }, ctx = {};
    assert.equal(await worker.fetch(request, env, ctx), result);
    assert.equal(env.received.request, request);
    assert.equal(env.received.ctx, ctx);
    if (method === 'POST') assert.equal(await request.text(), 'unchanged');
  }
});

 test('standalone output has no upstream dependency and serves its own root', async t => {
  const { modules } = await fixture(t, 'standalone');
  assert.ok(!(await readdir(modules)).includes('upstream.js'));
  const { default: worker } = await import(pathToFileURL(join(modules, 'index.js')));
  const rootResponse = await worker.fetch(new Request('https://example.test/'), {}, {});
  assert.equal(rootResponse.status, 302);
  assert.equal(rootResponse.headers.get('Location'), 'https://example.test/eat');
  assert.equal((await worker.fetch(new Request('https://example.test/eat'), {}, {})).status, 200);
  assert.equal((await worker.fetch(new Request('https://example.test/admin'), {}, {})).status, 404);
});
