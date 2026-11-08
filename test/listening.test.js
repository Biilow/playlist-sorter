import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transitionCost } from '../js/music.js';
import { sortByAux } from '../js/sort.js';

function randomSongs(count, artistCount = count) {
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  return Array.from({ length: count }, (_, i) => ({
    uri: `spotify:track:s${String(i).padStart(4, '0')}`,
    title: `s${i}`,
    position: i,
    artist: `artist${i % artistCount}`,
    audio: {
      bpm: 70 + random() * 90,
      key: Math.floor(random() * 12),
      mode: random() > 0.5 ? 1 : 0,
      energy: random(),
      valence: random(),
    },
  }));
}

const roughness = (songs) => songs.slice(1).reduce((sum, s, i) => sum + transitionCost(songs[i].audio, s.audio), 0);
const meanEnergy = (songs) => songs.reduce((sum, s) => sum + s.audio.energy, 0) / songs.length;
const titles = (songs) => songs.map((s) => s.title);

test('aux keeps every song exactly once, with unknown songs last', () => {
  const songs = [...randomSongs(50), { uri: 'spotify:track:none', title: 'none', position: 50, artist: 'x' }];
  const sorted = sortByAux(songs);
  assert.equal(sorted.at(-1).title, 'none');
  assert.deepEqual(titles(sorted).sort(), titles(songs).sort());
});

test('aux gives the same order whatever order it starts from', () => {
  const songs = randomSongs(60);
  const once = sortByAux(songs);
  assert.deepEqual(titles(sortByAux(once)), titles(once));
  assert.deepEqual(titles(sortByAux(songs.slice().reverse())), titles(once));
});

test('aux eases in, peaks late and winds down', () => {
  const sorted = sortByAux(randomSongs(100));
  const peak = meanEnergy(sorted.slice(55, 80));
  assert.ok(peak > meanEnergy(sorted.slice(0, 15)) + 0.15);
  assert.ok(peak > meanEnergy(sorted.slice(90)) + 0.1);
});

test('aux has much smoother joins than the original order', () => {
  const songs = randomSongs(100);
  assert.ok(roughness(sortByAux(songs)) < roughness(songs) * 0.75);
});

test('aux keeps the same artist from playing twice in a row', () => {
  const sorted = sortByAux(randomSongs(60, 10));
  const repeats = sorted.slice(1).filter((s, i) => s.artist === sorted[i].artist).length;
  assert.equal(repeats, 0);
});

test('aux handles very short playlists', () => {
  assert.equal(sortByAux([]).length, 0);
  assert.equal(sortByAux(randomSongs(2)).length, 2);
});
