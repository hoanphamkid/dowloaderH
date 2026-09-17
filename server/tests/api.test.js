import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
test('HTTP contract, validation, origin checks, security headers and SSRF errors', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, headers = {}) =>
    fetch(base + '/api' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  try {
    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
    const contentSecurityPolicy = health.headers.get('content-security-policy');
    assert.ok(contentSecurityPolicy);
    assert.match(contentSecurityPolicy, /media-src[^;]*https:/);
    for (const body of [{}, { url: 1 }, { url: 'https://example.com', args: '--exec calc' }])
      assert.equal((await post('/video/info', body)).status, 400);
    const blocked = await post('/video/info', { url: 'http://127.0.0.1/' });
    assert.equal(blocked.status, 400);
    assert.match((await blocked.json()).error, /private/);
    assert.equal(
      (
        await post(
          '/video/info',
          { url: 'https://example.com' },
          { Origin: 'https://evil.example' },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post('/video/download', {
          url: 'https://example.com',
          formatId: 'x;calc',
          type: 'video',
        })
      ).status,
      400,
    );
    assert.equal(
      (await post('/batch/info', { urls: Array(31).fill('https://example.com') })).status,
      400,
    );
    assert.equal((await fetch(base + '/api/download/missing/status')).status, 404);
    const batch = await post('/batch/info', { urls: ['http://localhost/', 'file:///etc/passwd'] });
    assert.equal(batch.status, 200);
    assert.equal((await batch.json()).results.filter((r) => r.error).length, 2);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
