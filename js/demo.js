// A pretend Spotify account with drawn covers, so the app can be tried (and
// tested) without logging in. Opened with ?demo. Nothing here touches Spotify.

import { applyMove } from './sort.js';

const COVERS = [
  ['#ffffff', '#111111', 'dot', 'Paper Moons', 'Blank Page'],
  ['#f4f2ee', '#c9c5bc', 'bar', 'Ivory Coast Radio', 'Soft Static'],
  ['#d8d8d8', '#ffffff', 'dot', 'The Salt Lamps', 'Fog Machine'],
  ['#e0262e', '#7d0f14', 'bar', 'Cinder Club', 'Hot Brake'],
  ['#ffb4a8', '#e0262e', 'dot', 'Peach Fuzz Theory', 'Sunburn'],
  ['#8a1219', '#e0262e', 'stripe', 'The Salt Lamps', 'Night Shift'],
  ['#f37a1f', '#ffd9a8', 'dot', 'Marmalade Sky', 'Breakfast Tapes'],
  ['#ffc58a', '#f37a1f', 'bar', 'Tangerine Dial', 'AM Gold'],
  ['#6e3a12', '#f37a1f', 'stripe', 'Cinder Club', 'Rust Belt'],
  ['#f5c518', '#fff4b8', 'stripe', 'Lemon Law', 'As Is'],
  ['#fff08a', '#e0b800', 'dot', 'Marmalade Sky', 'Daylight Savings'],
  ['#c7d62a', '#5c6b0a', 'bar', 'Bitter Lime', 'Zest'],
  ['#27a84a', '#a8f0bb', 'dot', 'Fern Bar', 'Canopy'],
  ['#0e5a2a', '#27a84a', 'stripe', 'Moss Parade', 'Undergrowth'],
  ['#a8efc0', '#27a84a', 'bar', 'Fern Bar', 'Sprout'],
  ['#19b5a5', '#b8fff6', 'dot', 'Tidepool', 'Low Water'],
  ['#28c3de', '#d4f7ff', 'stripe', 'Glass Harbour', 'Clear Day'],
  ['#0d6b85', '#28c3de', 'bar', 'Tidepool', 'Deep End'],
  ['#2a6fe8', '#bcd5ff', 'dot', 'Blue Hour Club', 'Evening Train'],
  ['#a9c9ff', '#2a6fe8', 'bar', 'Glass Harbour', 'Skylight'],
  ['#14296b', '#2a6fe8', 'stripe', 'Blue Hour Club', 'Midnight Train'],
  ['#7a35d8', '#dcc4ff', 'dot', 'Violet Hours', 'Afterglow'],
  ['#3d1a70', '#7a35d8', 'bar', 'Grape Soda Kids', 'Flat'],
  ['#d03fc1', '#ffc9f6', 'stripe', 'Violet Hours', 'Neon Vacancy'],
  ['#f7699f', '#ffd3e4', 'dot', 'Bubblegum Court', 'Recess'],
  ['#ffc1d9', '#f7699f', 'bar', 'Bubblegum Court', 'Hopscotch'],
  ['#6c6c6c', '#9a9a9a', 'bar', 'Grey Market', 'Overcast'],
  ['#2a2a2a', '#555555', 'stripe', 'Grey Market', 'Coal Shed'],
  ['#050505', '#e0262e', 'small', 'Black Sedan', 'No Plates'],
  ['#000000', '#ffffff', 'small', 'The Salt Lamps', 'Lights Out'],
];

const TITLES = ['Slow Corner', 'Parking Lot', 'Two Lanes', 'Ten Minutes', 'Old Number', 'Good Coat', 'Last Ferry', 'Side Door'];

function drawCover([background, accent, shape]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 300;
  const g = canvas.getContext('2d');
  g.fillStyle = background;
  g.fillRect(0, 0, 300, 300);
  g.fillStyle = accent;
  if (shape === 'dot' || shape === 'small') {
    g.beginPath();
    g.arc(150, 150, shape === 'dot' ? 62 : 26, 0, Math.PI * 2);
    g.fill();
  } else if (shape === 'bar') {
    g.fillRect(0, 214, 300, 46);
  } else {
    for (let x = 24; x < 300; x += 76) g.fillRect(x, 0, 16, 300);
  }
  return canvas.toDataURL('image/png');
}

function buildTracks() {
  const tracks = [];
  COVERS.forEach((cover, album) => {
    const art = drawCover(cover);
    const count = album % 3 === 0 ? 2 : 1;
    for (let number = 1; number <= count; number++) {
      tracks.push({
        uri: `demo:${album}:${number}`,
        title: TITLES[(album * 3 + number) % TITLES.length],
        artist: cover[3],
        artists: cover[3],
        album: cover[4],
        release: String(1990 + ((album * 7) % 33)),
        disc: 1,
        number,
        art,
        thumb: art,
        colour: null,
        copyable: true,
      });
    }
  });
  // Fixed shuffle, so the sample always opens in the same jumbled order.
  let seed = 11;
  for (let i = tracks.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }
  return tracks.map((track, position) => ({ ...track, position }));
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createDemoApi() {
  const tracks = buildTracks();
  let order = tracks.map((t) => t.uri);
  let version = 1;

  return {
    me: async () => ({ id: 'sample', display_name: 'Sample account' }),
    playlists: async () => [{ id: 'sample', name: 'Sample playlist', total: tracks.length, image: tracks[0].art }],
    open: async (id) => ({
      id,
      name: 'Sample playlist',
      url: null,
      snapshot: `v${version}`,
      tracks: order.map((uri, position) => ({ ...tracks.find((t) => t.uri === uri), position, colour: null })),
    }),
    features: async (list, onProgress) => {
      onProgress(0, list.length);
      await pause(150);
      for (const track of list) {
        const album = Number(track.uri.split(':')[1]);
        if (album % 11 === 10) continue; // a few songs have no data, as with real playlists
        track.audio = {
          bpm: 70 + ((album * 37) % 90),
          key: (album * 5) % 12,
          mode: album % 2,
          energy: ((album * 13) % 30) / 30,
          valence: ((album * 7) % 30) / 30,
        };
      }
    },
    snapshot: async () => `v${version}`,
    uris: async () => order.slice(),
    move: async (id, move) => {
      await pause(12);
      order = applyMove(order, move);
      version += 1;
      return `v${version}`;
    },
    createCopy: async (name) => {
      await pause(200);
      return { name, url: null, isPublic: true };
    },
  };
}
