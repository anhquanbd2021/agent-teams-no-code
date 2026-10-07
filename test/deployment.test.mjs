import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaticServer } from '../app/server.js';
import { once } from 'node:events';

async function withServer(fn) {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('/health returns ok', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/health`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
  });
});

test('/version returns name, version, commit', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/version`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'agent-teams-no-code-demo');
    assert.ok(body.version);
    assert.ok(body.commit);
  });
});

test('the allowlist serves the lab pages and modules', async () => {
  await withServer(async base => {
    for (const path of ['/', '/guide.html', '/app.js', '/styles.css', '/team.mjs', '/scenario.mjs']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 200, `${path} should be served`);
    }
  });
});

test('path traversal and unknown paths get 404', async () => {
  await withServer(async base => {
    for (const path of ['/../package.json', '/../app/server.js', '/secrets', '/package.json']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.status, 404, `${path} should 404`);
    }
  });
});

test('security headers are present on static responses', async () => {
  await withServer(async base => {
    const res = await fetch(`${base}/`);
    assert.ok(res.headers.get('content-security-policy'));
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  });
});
