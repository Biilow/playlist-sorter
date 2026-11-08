import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSpotifyApi } from '../js/api.js';

test('a refused request reports its status, so the page can explain it', async () => {
  const token = JSON.stringify({ access: 'x', refresh: 'y', expires: Date.now() + 3_600_000 });
  globalThis.sessionStorage = { getItem: () => token };
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'User not registered' } }), { status: 403 });
  await assert.rejects(createSpotifyApi().me(), (err) => err.status === 403 && err.message.includes('User not registered'));
});
