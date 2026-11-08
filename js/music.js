// Musical rules used by the BPM, key, mood and best transitions sorts.
// audio is { bpm, key, mode, energy, valence }: key is a pitch class (C = 0,
// -1 if unknown), mode is 1 for major and 0 for minor, the rest run 0 to 1.

const PITCHES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const MOODS = ['Sad', 'Chill', 'Happy', 'Hype'];

const TEMPO_TOLERANCE = Math.log(1.08); // an 8% tempo gap counts as one full unit of cost

// Camelot wheel: each step around it is a fifth, A is minor and B is major.
export function camelot({ key, mode }) {
  if (!(key >= 0)) return null;
  const number = ((7 * key + (mode === 1 ? 7 : 4)) % 12) + 1;
  const letter = mode === 1 ? 'B' : 'A';
  return { number, letter, label: `${number}${letter}` };
}

export function keyName({ key, mode }) {
  if (!(key >= 0)) return '';
  return `${PITCHES[key]} ${mode === 1 ? 'major' : 'minor'}`;
}

// Indexes MOODS, whose order also climbs in energy.
export function moodIndex({ energy, valence }) {
  if (energy < 0.5) return valence < 0.5 ? 0 : 1;
  return valence < 0.5 ? 3 : 2;
}

export const moodName = (audio) => MOODS[moodIndex(audio)];

// Half-time and double-time mix naturally, so 70 and 140 BPM count as equal.
function tempoCost(a, b) {
  const gap = Math.min(...[0.5, 1, 2].map((factor) => Math.abs(Math.log((a * factor) / b))));
  return Math.min(2, gap / TEMPO_TOLERANCE);
}

function keyCost(x, y) {
  const a = camelot(x);
  const b = camelot(y);
  if (!a || !b) return 0.6;
  const around = Math.abs(a.number - b.number);
  const steps = Math.min(around, 12 - around);
  const sameLetter = a.letter === b.letter;
  if (steps === 0) return sameLetter ? 0 : 0.25; // same key, or its relative major/minor
  if (steps === 1) return sameLetter ? 0.25 : 0.7; // a neighbouring key
  if (steps === 2 && sameLetter) return 0.75;
  return 1 + steps / 12;
}

// How rough it would feel to go from one song straight into another.
export function transitionCost(a, b) {
  return (
    tempoCost(a.bpm, b.bpm) +
    keyCost(a, b) +
    0.5 * Math.min(2, Math.abs(a.energy - b.energy) / 0.3) +
    0.2 * Math.abs(a.valence - b.valence)
  );
}
