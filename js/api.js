import { loadAudioFeatures } from './audio.js';
import { getAccessToken, refreshToken } from './auth.js';

const BASE = 'https://api.spotify.com/v1';
const MAX_ATTEMPTS = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, { method = 'GET', body } = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  for (let attempt = 1; ; attempt++) {
    const token = await getAccessToken();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const wait = Number(res.headers.get('Retry-After')) || 2 * attempt;
      await sleep(wait * 1000 + 250);
      continue;
    }
    if (res.status === 401 && attempt === 1) {
      await refreshToken();
      continue;
    }
    // Only reads are retried: a failed move may still have been applied.
    if (res.status >= 500 && method === 'GET' && attempt < 4) {
      await sleep(800 * attempt);
      continue;
    }
    if (!res.ok) {
      const detail = await res.json().catch(() => null);
      const message = `Spotify returned an error (${res.status}): ${detail?.error?.message || res.statusText || 'no details given'}.`;
      throw Object.assign(new Error(message), { status: res.status });
    }
    return res.status === 204 ? null : res.json();
  }
}

async function readAllPages(firstPath) {
  const all = [];
  let next = firstPath;
  while (next) {
    const page = await request(next);
    all.push(...page.items);
    next = page.next;
  }
  return all;
}

function toTrack(entry, position) {
  const item = entry.item ?? entry.track ?? null;
  const isEpisode = item?.type === 'episode';
  const images = (isEpisode ? item?.images : item?.album?.images) ?? [];
  const artists = isEpisode ? [item?.show?.name].filter(Boolean) : (item?.artists ?? []).map((a) => a.name).filter(Boolean);
  return {
    position,
    uri: item?.uri ?? null,
    title: item?.name || 'Unavailable song',
    artist: artists[0] ?? '',
    artists: artists.join(', '),
    album: isEpisode ? item?.show?.name ?? '' : item?.album?.name ?? '',
    release: isEpisode ? item?.release_date ?? '' : item?.album?.release_date ?? '',
    disc: item?.disc_number ?? 1,
    number: item?.track_number ?? 1,
    art: images[1]?.url ?? images[0]?.url ?? null, // shown in the list
    thumb: images.at(-1)?.url ?? null, // smallest size, read for its colour
    colour: null,
    copyable: Boolean(item?.uri) && !entry.is_local,
  };
}

export function createSpotifyApi() {
  return {
    me: () => request('/me'),

    features: loadAudioFeatures,

    async playlists(userId) {
      const all = await readAllPages('/me/playlists?limit=50');
      // Spotify only returns songs for playlists the user owns or collaborates on.
      return all
        .filter((p) => p && (p.owner?.id === userId || p.collaborative))
        .map((p) => ({
          id: p.id,
          name: p.name,
          total: p.items?.total ?? p.tracks?.total ?? 0,
          image: p.images?.at(-1)?.url ?? null,
        }));
    },

    async open(id) {
      const info = await request(`/playlists/${id}?fields=name,snapshot_id,external_urls`);
      const entries = await readAllPages(`/playlists/${id}/items?limit=50`);
      return {
        id,
        name: info.name,
        url: info.external_urls?.spotify ?? null,
        snapshot: info.snapshot_id,
        tracks: entries.map(toTrack),
      };
    },

    async snapshot(id) {
      return (await request(`/playlists/${id}?fields=snapshot_id`)).snapshot_id;
    },

    async uris(id) {
      const entries = await readAllPages(`/playlists/${id}/items?limit=50`);
      return entries.map((entry, i) => toTrack(entry, i).uri);
    },

    async move(id, { rangeStart, rangeLength, insertBefore }, snapshot) {
      const result = await request(`/playlists/${id}/items`, {
        method: 'PUT',
        body: {
          range_start: rangeStart,
          range_length: rangeLength,
          insert_before: insertBefore,
          snapshot_id: snapshot,
        },
      });
      return result.snapshot_id;
    },

    async createCopy(name, description, uris, onProgress) {
      const playlist = await request('/me/playlists', {
        method: 'POST',
        body: { name, description, public: false },
      });
      for (let i = 0; i < uris.length; i += 100) {
        onProgress(i);
        await request(`/playlists/${playlist.id}/items`, {
          method: 'POST',
          body: { uris: uris.slice(i, i + 100) },
        });
      }
      // Spotify can make a playlist public even when asked for private, so check.
      const { public: isPublic } = await request(`/playlists/${playlist.id}?fields=public`);
      return { name: playlist.name, url: playlist.external_urls?.spotify ?? null, isPublic };
    },
  };
}
