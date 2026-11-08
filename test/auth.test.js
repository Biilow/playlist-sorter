import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findClientId } from '../js/auth.js';

const ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

test('finds the Client ID on its own, with stray spaces', () => {
  assert.equal(findClientId(`  ${ID}\n`), ID);
});

test('finds the Client ID inside the dashboard address', () => {
  assert.equal(findClientId(`https://developer.spotify.com/dashboard/${ID}/settings`), ID);
});

test('rejects anything that is not a Client ID', () => {
  assert.equal(findClientId(''), null);
  assert.equal(findClientId('a1b2c3'), null);
  assert.equal(findClientId(`${ID}ff`), null);
  assert.equal(findClientId('z1b2c3d4e5f60718293a4b5c6d7e8f90'), null);
});
