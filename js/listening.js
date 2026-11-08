// Orders songs to be listened to front to back: ease in, build to a peak about
// two thirds through, wind down, with smooth joins and repeat artists spread out.
// (Not named aux.js: Windows can't create a file called "aux".)

import { transitionCost } from './music.js';

const ARC_WEIGHT = 6;
const SAME_ARTIST_NEXT = 3;
const SAME_ARTIST_ONE_APART = 1;
const PEAK_AT = 0.7;
const WINDOW = 40; // how far apart two songs can be and still trade places
const MAX_PASSES = 10;
const LARGE_LIST = 2000; // above this, keep the shape and skip the fine tuning

const ease = (x) => x * x * (3 - 2 * x);

// How intense the set should feel at t (0 to 1), as a share of this playlist's
// own range, so a playlist of nothing but bangers still rises and falls.
export function arcLevel(t) {
  return t < PEAK_AT ? 0.3 + 0.65 * ease(t / PEAK_AT) : 0.95 - 0.5 * ease((t - PEAK_AT) / (1 - PEAK_AT));
}

const intensity = ({ audio }) => 0.8 * audio.energy + 0.2 * audio.valence;

function link(a, b, gap) {
  const sameArtist = a.artist && a.artist === b.artist;
  if (gap === 1) return transitionCost(a.audio, b.audio) + (sameArtist ? SAME_ARTIST_NEXT : 0);
  return sameArtist ? SAME_ARTIST_ONE_APART : 0;
}

// The result depends only on the order of songs, so callers pass them in a
// fixed order to get a repeatable answer.
export function listeningOrder(songs) {
  const n = songs.length;
  if (n < 3) return songs.slice();

  const levels = Array.from({ length: n }, (_, i) => arcLevel(i / (n - 1)));
  const calmestFirst = songs.slice().sort((a, b) => intensity(a) - intensity(b));
  const rank = new Map(calmestFirst.map((song, i) => [song, i / (n - 1)]));

  // Start with the calmest song in the calmest slot, and so on up, which fits the shape exactly.
  const order = new Array(n);
  const slotsByLevel = levels.map((_, i) => i).sort((a, b) => levels[a] - levels[b] || a - b);
  slotsByLevel.forEach((slot, k) => {
    order[slot] = calmestFirst[k];
  });
  if (n > LARGE_LIST) return order;

  const arcCost = (i) => ARC_WEIGHT * (rank.get(order[i]) - levels[i]) ** 2;

  // Everything that depends on the songs at i and j, counting each pair once.
  function costAround(i, j) {
    let total = arcCost(i) + arcCost(j);
    for (const [at, already] of [[i, -1], [j, i]]) {
      for (let offset = -2; offset <= 2; offset++) {
        const other = at + offset;
        if (!offset || other < 0 || other >= n || other === already) continue;
        total += link(order[Math.min(at, other)], order[Math.max(at, other)], Math.abs(offset));
      }
    }
    return total;
  }

  // Keep any trade of two songs that makes the whole set better.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j <= Math.min(n - 1, i + WINDOW); j++) {
        const before = costAround(i, j);
        [order[i], order[j]] = [order[j], order[i]];
        if (costAround(i, j) + 1e-9 < before) improved = true;
        else [order[i], order[j]] = [order[j], order[i]];
      }
    }
    if (!improved) break;
  }
  return order;
}
