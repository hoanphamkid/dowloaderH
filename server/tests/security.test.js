import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { isPublicAddress, parsePublicUrl, resolvePublic, detectPlatform } from '../utils/url.js';
import { sanitizeFilename } from '../utils/filename.js';
import { startProxy } from '../services/proxyService.js';
test('blocks private, loopback, link-local, multicast and mapped IPv6', () => {
  for (const address of [
    '127.0.0.1',
    '0.0.0.0',
    '10.2.3.4',
    '172.16.1.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
  ])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])
    assert.equal(isPublicAddress(address), true, address);
});
test('rejects alternate URL representations, credentials, ports and protocols', () => {
  for (const url of [
    'file:///etc/passwd',
    'ftp://example.com/v',
    'http://localhost/v',
    'http://127.1/',
    'http://2130706433/',
    'http://0x7f000001/',
    'http://[::ffff:127.0.0.1]/',
    'http://user:pass@example.com/',
    'http://example.com:8080/',
    'http://foo.local/',
    '--exec calc.exe',
  ])
    assert.throws(() => parsePublicUrl(url), undefined, url);
  assert.equal(parsePublicUrl('https://example.com/watch?v=x').hostname, 'example.com');
});
test('rejects any private answer in mixed DNS results', async () => {
  await assert.rejects(
    resolvePublic('example.com', async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]),
  );
  assert.deepEqual(
    await resolvePublic('example.com', async () => [{ address: '8.8.8.8', family: 4 }]),
    { address: '8.8.8.8', family: 4 },
  );
});
test('platform detection uses full host boundaries', () => {
  assert.equal(detectPlatform('https://m.youtube.com/watch?v=x'), 'youtube');
  assert.equal(detectPlatform('https://youtube.com.evil.org'), 'other');
  assert.equal(detectPlatform('https://x.com/a/status/1'), 'twitter');
});
test('filenames are portable and cannot traverse directories', () => {
  assert.equal(sanitizeFilename('Đây là video | test / demo ?'), 'day-la-video-test-demo');
  for (const input of ['../../file', 'CON', 'NUL', 'a\\b:*?', '...', ''])
    assert.match(sanitizeFilename(input), /^[a-zA-Z0-9_-]+$/);
});
test('outbound proxy refuses HTTP and HTTPS tunnels to internal hosts', async () => {
  const proxy = await startProxy();
  try {
    const code = await new Promise((resolve, reject) => {
      const req = http.request(proxy.url, { path: 'http://127.0.0.1/secret' }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(code, 403);
    const response = await new Promise((resolve, reject) => {
      const socket = net.connect(Number(new URL(proxy.url).port), '127.0.0.1', () =>
        socket.write('CONNECT [::1]:443 HTTP/1.1\r\nHost: [::1]:443\r\n\r\n'),
      );
      socket.on('data', (data) => {
        resolve(data.toString());
        socket.destroy();
      });
      socket.on('error', reject);
    });
    assert.match(response, /403 Forbidden/);
  } finally {
    proxy.close();
  }
});
