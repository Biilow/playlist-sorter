import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesSearch } from '../js/search.js';

test('an empty search matches everything', () => {
  assert.equal(matchesSearch('', 'Hot Brake'), true);
  assert.equal(matchesSearch('   ', 'Hot Brake'), true);
});

test('ignores case and accents in both directions', () => {
  assert.equal(matchesSearch('beyonce', 'Beyoncé'), true);
  assert.equal(matchesSearch('BEYONCÉ', 'beyonce'), true);
});

test('every word has to appear, in any field and any order', () => {
  assert.equal(matchesSearch('train blue', 'Evening Train', 'Blue Hour Club'), true);
  assert.equal(matchesSearch('train red', 'Evening Train', 'Blue Hour Club'), false);
});

test('treats punctuation as plain text', () => {
  assert.equal(matchesSearch('(.*', 'Hot Brake'), false);
  assert.equal(matchesSearch('a$ap', 'A$AP Rocky'), true);
});
