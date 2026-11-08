import { colourDistance, compareColours } from './colour.js';
import { listeningOrder } from './listening.js';
import { camelot, moodIndex, transitionCost } from './music.js';
import { shortestPath } from './path.js';

const words = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const artistKey = (name) => name.replace(/^the\s+/i, '');

// Songs on the same album stay together and in album order.
function compareAlbumPosition(a, b) {
  return (
    (a.release || '').localeCompare(b.release || '') ||
    words.compare(a.album || '', b.album || '') ||
    a.disc - b.disc ||
    a.number - b.number
  );
}

export function sortByArtist(tracks) {
  return tracks.slice().sort((a, b) => {
    if (!a.artist || !b.artist) return Boolean(b.artist) - Boolean(a.artist);
    return words.compare(artistKey(a.artist), artistKey(b.artist)) || compareAlbumPosition(a, b);
  });
}

export function sortByColour(tracks) {
  return tracks.slice().sort((a, b) => {
    if (!a.colour || !b.colour) return Boolean(b.colour) - Boolean(a.colour);
    return compareColours(a.colour, b.colour) || compareAlbumPosition(a, b);
  });
}

const hasAudio = (track) => track.audio?.bpm > 0;
const hasKey = (track) => hasAudio(track) && camelot(track.audio) !== null;

export const lacksData = {
  colour: (track) => !track.colour,
  journey: (track) => !track.colour,
  artist: (track) => !track.artist,
  bpm: (track) => !hasAudio(track),
  key: (track) => !hasKey(track),
  mood: (track) => !hasAudio(track),
  transitions: (track) => !hasAudio(track),
  aux: (track) => !hasAudio(track),
};

const split = (tracks, usable) => [tracks.filter(usable), tracks.filter((track) => !usable(track))];

// Puts tracks in a fixed order first, so that sorting an already sorted
// playlist gives the same answer and "Reorder" has nothing left to do.
const canonical = (tracks) =>
  tracks.slice().sort((a, b) => {
    const x = a.uri || '';
    const y = b.uri || '';
    return x < y ? -1 : x > y ? 1 : a.position - b.position;
  });

export function sortByBpm(tracks) {
  const [ready, rest] = split(tracks, hasAudio);
  return [...ready.sort((a, b) => a.audio.bpm - b.audio.bpm), ...rest];
}

// Walks the Camelot wheel: 1A, 1B, 2A, 2B... and slow to fast inside each key.
export function sortByKey(tracks) {
  const [ready, rest] = split(tracks, hasKey);
  ready.sort((a, b) => {
    const x = camelot(a.audio);
    const y = camelot(b.audio);
    return x.number - y.number || x.letter.localeCompare(y.letter) || a.audio.bpm - b.audio.bpm;
  });
  return [...ready, ...rest];
}

export function sortByMood(tracks) {
  const [ready, rest] = split(tracks, hasAudio);
  ready.sort((a, b) => moodIndex(a.audio) - moodIndex(b.audio) || a.audio.energy - b.audio.energy);
  return [...ready, ...rest];
}

// Plays like a DJ set that starts at its calmer end.
export function sortByTransitions(tracks) {
  const [ready, rest] = split(tracks, hasAudio);
  const path = shortestPath(canonical(ready), (a, b) => transitionCost(a.audio, b.audio));
  if (path.length > 1 && path[0].audio.energy > path.at(-1).audio.energy) path.reverse();
  return [...path, ...rest];
}

export function sortByAux(tracks) {
  const [ready, rest] = split(tracks, hasAudio);
  return [...listeningOrder(canonical(ready)), ...rest];
}

// Each cover drifts into the most similar next one, starting at the palest end.
// Songs sharing a cover stay together as one stop.
export function sortByColourJourney(tracks) {
  const [ready, rest] = split(tracks, (track) => track.colour);
  const stops = new Map();
  for (const track of canonical(ready)) {
    if (!stops.has(track.thumb)) stops.set(track.thumb, []);
    stops.get(track.thumb).push(track);
  }
  const groups = [...stops.values()].map((songs) => songs.sort(compareAlbumPosition));
  const path = shortestPath(groups, (a, b) => colourDistance(a[0].colour, b[0].colour));
  if (path.length > 1 && path[0][0].colour.L < path.at(-1)[0].colour.L) path.reverse();
  return [...path.flat(), ...rest];
}

export function applyMove(order, { rangeStart, rangeLength, insertBefore }) {
  const next = order.slice();
  const block = next.splice(rangeStart, rangeLength);
  next.splice(insertBefore, 0, ...block);
  return next;
}

// Turns one order into another using Spotify's "move this block" operation,
// which (unlike replacing the list) keeps each song's date added and any local
// files. Moving runs of songs together keeps the number of requests down.
export function planMoves(current, target) {
  let order = current.slice();
  const moves = [];
  let i = 0;
  while (i < target.length) {
    if (order[i] === target[i]) {
      i++;
      continue;
    }
    const from = order.indexOf(target[i], i + 1);
    let length = 1;
    while (i + length < target.length && from + length < order.length && order[from + length] === target[i + length]) {
      length++;
    }
    const move = { rangeStart: from, rangeLength: length, insertBefore: i };
    moves.push(move);
    order = applyMove(order, move);
    i += length;
  }
  return moves;
}

export const sameOrder = (a, b) => a.length === b.length && a.every((item, i) => item === b[i]);
