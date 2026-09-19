import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveProvider } from '../providers/index.js';

test('resolves known providers by hostname and subdomain', () => {
  assert.equal(resolveProvider('https://www.youtube.com/watch?v=x').id, 'youtube');
  assert.equal(resolveProvider('https://m.tiktok.com/@user/video/1').id, 'tiktok');
  assert.equal(resolveProvider('https://clips.twitch.tv/example').id, 'twitch');
});

test('falls back to generic provider for unknown public websites', () => {
  assert.equal(resolveProvider('https://media.example.org/video').id, 'generic');
  assert.equal(resolveProvider('not-a-url').id, 'generic');
});
