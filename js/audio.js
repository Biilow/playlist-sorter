// Spotify no longer shares BPM, key or mood with new apps, so this asks
// ReccoBeats, a free service keyed by Spotify song ID. Only song IDs are sent.

const ENDPOINT = 'https://api.reccobeats.com/v1/audio-features';
const BATCH = 40;
const MAX_ATTEMPTS = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBatch(ids) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${ENDPOINT}?ids=${ids.join(',')}`);
    if (res.status === 404) return [];
    if (res.ok) return (await res.json()).content ?? [];
    if ((res.status !== 429 && res.status < 500) || attempt === MAX_ATTEMPTS) {
      throw new Error(`ReccoBeats returned an error (${res.status}).`);
    }
    const wait = Number(res.headers.get('Retry-After')) || attempt;
    await sleep(wait * 1000 + 250);
  }
}

// Sets track.audio on every song ReccoBeats knows. Others keep audio undefined.
export async function loadAudioFeatures(tracks, onProgress) {
  const byId = new Map();
  for (const track of tracks) {
    if (!track.uri?.startsWith('spotify:track:')) continue;
    const id = track.uri.split(':')[2];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(track);
  }

  const ids = [...byId.keys()];
  for (let i = 0; i < ids.length; i += BATCH) {
    onProgress(i, ids.length);
    for (const entry of await fetchBatch(ids.slice(i, i + BATCH))) {
      const id = entry.href?.match(/track\/([A-Za-z0-9]+)/)?.[1];
      const audio = {
        bpm: entry.tempo,
        key: entry.key,
        mode: entry.mode,
        energy: entry.energy,
        valence: entry.valence,
      };
      for (const track of byId.get(id) ?? []) track.audio = audio;
    }
  }
}
