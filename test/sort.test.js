import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareColours, dominantColour } from '../js/colour.js';
import { camelot, keyName, moodName, transitionCost } from '../js/music.js';
import { shortestPath } from '../js/path.js';
import {
  applyMove,
  planMoves,
  sortByArtist,
  sortByBpm,
  sortByColour,
  sortByColourJourney,
  sortByKey,
  sortByMood,
  sortByTransitions,
} from '../js/sort.js';

// A fake 40x40 cover made of [[r, g, b], share] regions.
function cover(regions) {
  const total = 1600;
  const bytes = [];
  regions.forEach(([rgb, share]) => {
    for (let i = 0; i < Math.round(total * share); i++) bytes.push(...rgb, 255);
  });
  return new Uint8ClampedArray(bytes);
}

const solid = (rgb) => dominantColour(cover([[rgb, 1]]));
const track = (fields) => ({ disc: 1, number: 1, album: '', release: '', ...fields });

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];
const RED = [230, 30, 30];
const BLUE = [30, 60, 230];

test('a mostly black cover with a small red logo counts as black', () => {
  const colour = dominantColour(cover([[BLACK, 0.88], [RED, 0.12]]));
  assert.ok(colour.L < 0.2);
});

test('a vivid colour beats an equal area of white', () => {
  const colour = dominantColour(cover([[WHITE, 0.5], [BLUE, 0.5]]));
  assert.ok(colour.C > 0.15);
});

test('specks too small to notice never set the colour', () => {
  const colour = dominantColour(cover([[WHITE, 0.98], [RED, 0.02]]));
  assert.ok(colour.L > 0.95 && colour.C < 0.04);
});

test('a soft background gradient is treated as one colour', () => {
  const colour = dominantColour(cover([[[250, 250, 250], 0.3], [[235, 235, 235], 0.3], [[225, 225, 225], 0.25], [RED, 0.15]]));
  assert.ok(colour.C < 0.04, 'the pale gradient should beat the small red area');
});

test('colours order white, then red to violet, then black', () => {
  const names = {
    white: WHITE,
    lightGrey: [205, 205, 205],
    red: RED,
    orange: [240, 130, 20],
    yellow: [245, 225, 40],
    green: [40, 170, 70],
    cyan: [40, 190, 210],
    blue: BLUE,
    violet: [130, 50, 210],
    pink: [240, 110, 170],
    darkGrey: [70, 70, 70],
    black: BLACK,
  };
  const expected = Object.keys(names);
  const shuffled = expected.slice().reverse();
  const sorted = shuffled.sort((a, b) => compareColours(solid(names[a]), solid(names[b])));
  assert.deepEqual(sorted, expected);
});

test('songs without a readable cover go last in a colour sort', () => {
  const none = track({ title: 'none', colour: null });
  const white = track({ title: 'white', colour: solid(WHITE) });
  const black = track({ title: 'black', colour: solid(BLACK) });
  assert.deepEqual(sortByColour([none, black, white]).map((t) => t.title), ['white', 'black', 'none']);
});

test('songs from one album stay together in album order in a colour sort', () => {
  const colour = solid(BLUE);
  const second = track({ album: 'A', number: 2, colour });
  const first = track({ album: 'A', number: 1, colour });
  assert.deepEqual(sortByColour([second, first]), [first, second]);
});

test('artist sort ignores case and a leading "The"', () => {
  const names = ['Zedd', 'the Beatles', 'ABBA', 'The Cure', 'beck'];
  const sorted = sortByArtist(names.map((artist) => track({ artist }))).map((t) => t.artist);
  assert.deepEqual(sorted, ['ABBA', 'the Beatles', 'beck', 'The Cure', 'Zedd']);
});

test('artist sort goes oldest album first, then track number', () => {
  const late = track({ artist: 'X', album: 'Late', release: '2020-01-01', number: 1 });
  const earlyTwo = track({ artist: 'X', album: 'Early', release: '1999', number: 2 });
  const earlyOne = track({ artist: 'X', album: 'Early', release: '1999', number: 1 });
  assert.deepEqual(sortByArtist([late, earlyTwo, earlyOne]), [earlyOne, earlyTwo, late]);
});

test('unavailable songs with no artist go last in an artist sort', () => {
  const gone = track({ artist: '' });
  const here = track({ artist: 'X' });
  assert.deepEqual(sortByArtist([gone, here]), [here, gone]);
});

test('planned moves reach the target for random orders, including duplicates', () => {
  let seed = 7;
  const random = (n) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  for (let round = 0; round < 300; round++) {
    // Same song twice is two distinct playlist entries, so entries are objects.
    const current = Array.from({ length: random(60) + 1 }, (_, i) => ({ uri: `song${i % 40}` }));
    const target = current.slice();
    for (let i = target.length - 1; i > 0; i--) {
      const j = random(i + 1);
      [target[i], target[j]] = [target[j], target[i]];
    }
    const result = planMoves(current, target).reduce(applyMove, current);
    assert.ok(result.every((entry, i) => entry === target[i]));
  }
});

test('an order that is already right needs no moves', () => {
  assert.deepEqual(planMoves(['a', 'b'], ['a', 'b']), []);
});

const audio = (bpm, key = 0, mode = 1, energy = 0.5, valence = 0.5) => ({ bpm, key, mode, energy, valence });
const song = (name, fields) => track({ uri: `spotify:track:${name}`, title: name, position: 0, ...fields });
const titles = (tracks) => tracks.map((t) => t.title);

test('camelot numbers match the wheel', () => {
  assert.equal(camelot({ key: 0, mode: 1 }).label, '8B'); // C major
  assert.equal(camelot({ key: 9, mode: 0 }).label, '8A'); // A minor
  assert.equal(camelot({ key: 11, mode: 1 }).label, '1B'); // B major
  assert.equal(camelot({ key: 8, mode: 0 }).label, '1A'); // A flat minor
  assert.equal(camelot({ key: 4, mode: 1 }).label, '12B'); // E major
  assert.equal(camelot({ key: -1, mode: 1 }), null);
  assert.equal(keyName({ key: 9, mode: 0 }), 'A minor');
});

test('mood comes from energy and positivity', () => {
  assert.equal(moodName(audio(100, 0, 1, 0.2, 0.2)), 'Sad');
  assert.equal(moodName(audio(100, 0, 1, 0.2, 0.8)), 'Chill');
  assert.equal(moodName(audio(100, 0, 1, 0.8, 0.8)), 'Happy');
  assert.equal(moodName(audio(100, 0, 1, 0.8, 0.2)), 'Hype');
});

test('double-time tempos count as a match', () => {
  assert.ok(transitionCost(audio(70), audio(140)) < 0.01);
  assert.ok(transitionCost(audio(100), audio(135)) > 1);
});

test('compatible keys cost less than clashing ones', () => {
  const c = audio(120, 0, 1); // 8B
  assert.ok(transitionCost(c, audio(120, 9, 0)) < transitionCost(c, audio(120, 6, 1))); // 8A beats 2B
});

test('transition cost is the same in both directions', () => {
  const a = audio(90, 3, 0, 0.3, 0.9);
  const b = audio(128, 7, 1, 0.8, 0.1);
  assert.equal(transitionCost(a, b), transitionCost(b, a));
});

test('shortest path solves points on a line', () => {
  const points = [9, 2, 14, 0, 7, 21, 5, 3, 18, 11];
  const path = shortestPath(points, (a, b) => Math.abs(a - b));
  const sorted = points.slice().sort((a, b) => a - b);
  assert.ok(path.join() === sorted.join() || path.join() === sorted.reverse().join());
});

test('BPM sort goes slow to fast with unknown songs last', () => {
  const sorted = sortByBpm([song('fast', { audio: audio(170) }), song('none', {}), song('slow', { audio: audio(60) })]);
  assert.deepEqual(titles(sorted), ['slow', 'fast', 'none']);
});

test('key sort walks the wheel and leaves unknown keys last', () => {
  const sorted = sortByKey([
    song('8B', { audio: audio(100, 0, 1) }),
    song('unknown', { audio: audio(100, -1, 1) }),
    song('8A', { audio: audio(100, 9, 0) }),
    song('1A', { audio: audio(100, 8, 0) }),
  ]);
  assert.deepEqual(titles(sorted), ['1A', '8A', '8B', 'unknown']);
});

test('mood sort runs sad, chill, happy, hype', () => {
  const sorted = sortByMood([
    song('hype', { audio: audio(100, 0, 1, 0.9, 0.1) }),
    song('happy', { audio: audio(100, 0, 1, 0.9, 0.9) }),
    song('sad', { audio: audio(100, 0, 1, 0.1, 0.1) }),
    song('chill', { audio: audio(100, 0, 1, 0.1, 0.9) }),
  ]);
  assert.deepEqual(titles(sorted), ['sad', 'chill', 'happy', 'hype']);
});

function randomSongs(count) {
  let seed = 3;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  return Array.from({ length: count }, (_, i) => {
    const rgb = [random() * 255, random() * 255, random() * 255].map(Math.round);
    return song(`s${i}`, {
      position: i,
      thumb: `cover${i}`,
      colour: solid(rgb),
      audio: audio(70 + random() * 90, Math.floor(random() * 12), random() > 0.5 ? 1 : 0, random(), random()),
    });
  });
}

const roughness = (tracks) => tracks.slice(1).reduce((sum, t, i) => sum + transitionCost(tracks[i].audio, t.audio), 0);

test('best transitions is far smoother than the original order', () => {
  const songs = randomSongs(60);
  assert.ok(roughness(sortByTransitions(songs)) < roughness(songs) * 0.5);
});

test('best transitions starts at the calmer end and keeps unknown songs last', () => {
  const sorted = sortByTransitions([...randomSongs(20), song('none', {})]);
  assert.equal(sorted.at(-1).title, 'none');
  assert.ok(sorted[0].audio.energy <= sorted.at(-2).audio.energy);
});

test('colour journey makes smaller colour steps and starts at the pale end', () => {
  const songs = randomSongs(60);
  const steps = (tracks) => tracks.slice(1).reduce((sum, t, i) => sum + Math.hypot(...t.colour.lab.map((v, d) => v - tracks[i].colour.lab[d])), 0);
  const journey = sortByColourJourney(songs);
  assert.ok(steps(journey) < steps(songs) * 0.5);
  assert.ok(journey[0].colour.L >= journey.at(-1).colour.L);
});

test('colour journey keeps songs with the same cover together', () => {
  const same = solid(BLUE);
  const other = solid(RED);
  const sorted = sortByColourJourney([
    song('a2', { thumb: 'a', album: 'A', number: 2, colour: same, position: 0 }),
    song('b1', { thumb: 'b', album: 'B', number: 1, colour: other, position: 1 }),
    song('a1', { thumb: 'a', album: 'A', number: 1, colour: same, position: 2 }),
  ]);
  const a = titles(sorted).indexOf('a1');
  assert.equal(titles(sorted)[a + 1], 'a2');
});

test('sorting an already sorted list changes nothing', () => {
  const songs = randomSongs(40);
  for (const sort of [sortByTransitions, sortByColourJourney, sortByBpm, sortByKey, sortByMood]) {
    const once = sort(songs);
    const twice = sort(once);
    assert.deepEqual(titles(twice), titles(once), sort.name);
  }
});

test('moving one song or one block takes a single move', () => {
  assert.equal(planMoves(['a', 'b', 'c', 'd'], ['d', 'a', 'b', 'c']).length, 1);
  assert.equal(planMoves(['a', 'b', 'c', 'd'], ['b', 'c', 'd', 'a']).length, 1);
});
