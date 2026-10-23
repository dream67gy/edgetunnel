import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('../_worker.js', import.meta.url), 'utf8');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
const kv = { async get() { return null; }, async put() {} };
const paths = ['/admin', '/admin/config.json', '/login', '/sub'];

for (const env of [{}, { KEY: 'not-an-admin-password' }, { UUID: '90cd4a77-141a-43c9-991b-08263cfe9c10' }, { ADMIN: '' }, { ADMIN: ' \r\n ' }]) {
  test('unconfigured ADMIN blocks all entry points: ' + JSON.stringify(env), async () => {
    for (const path of paths) {
      for (const init of [{}, { method: 'POST' }, { headers: { Upgrade: 'websocket' } }]) {
        const r = await worker.fetch(new Request('https://example.test' + path, init), { ...env, KV: kv }, {});
        assert.equal(r.status, 503);
        assert.match(await r.text(), /ADMIN/);
        assert.equal(r.headers.get('Cache-Control'), 'no-store');
      }
    }
  });
}
for (const binding of [undefined, {}, { get() {} }]) {
  test('missing/incomplete KV blocks protected routes: ' + String(binding), async () => {
    for (const path of paths) {
      const r = await worker.fetch(new Request('https://example.test' + path), { ADMIN: 'test-only-password', KV: binding }, {});
      assert.equal(r.status, 503);
      assert.match(await r.text(), /KV/);
    }
  });
}

test('configured service redirects unauthenticated management requests to login', async () => {
  // The upstream password derivation uses MD5, supported by the Workers runtime.
  // Use Node crypto only if the runtime does not expose MD5 through Web Crypto.
  const { createHash } = await import('node:crypto');
  const previous = globalThis.crypto;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    subtle: { digest: async (algorithm, data) => String(algorithm).toUpperCase() === 'MD5'
      ? createHash('md5').update(Buffer.from(data)).digest()
      : webcrypto.subtle.digest(algorithm, data) }
  } });
  try {
    for (const path of ['/admin', '/admin/config.json']) {
      const request = new Request('https://example.test' + path);
      Object.defineProperty(request, 'cf', { value: { colo: 'SJC' } });
      const r = await worker.fetch(request, { ADMIN: 'test-only-password', KV: kv }, {});
      assert.equal(r.status, 302);
      assert.equal(r.headers.get('Location'), '/login');
    }
  } finally { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: previous }); }
});
