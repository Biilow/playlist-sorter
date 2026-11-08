import { createSpotifyApi } from './api.js';
import { findClientId, finishLogin, getClientId, getRedirectUri, hasSession, logout, startLogin, wasInvited } from './auth.js';
import { dominantColour } from './colour.js';
import { createDemoApi } from './demo.js';
import { camelot, keyName, moodName } from './music.js';
import { matchesSearch } from './search.js';
import {
  applyMove,
  lacksData,
  planMoves,
  sameOrder,
  sortByArtist,
  sortByAux,
  sortByBpm,
  sortByColour,
  sortByColourJourney,
  sortByKey,
  sortByMood,
  sortByTransitions,
} from './sort.js';

const $ = (id) => document.getElementById(id);
const isDemo = new URLSearchParams(location.search).has('demo');
const api = isDemo ? createDemoApi() : createSpotifyApi();
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

const NOT_ALLOWED = 'Spotify didn’t allow this account. If you were invited, ask for your Spotify email to be added to the app. If it’s your own app, check that the account has Premium.';
const SAMPLE_SIZE = 40; // covers are shrunk to this many pixels square before reading
const COVER_WORKERS = 8;

const state = {
  me: null,
  playlist: null, // { id, name, url, snapshot, tracks, order, undo }
  shown: [], // tracks in the order currently on screen
  view: 'current',
  rows: new Map(), // track -> <li>
  coversReady: false,
  audioReady: false,
  busy: false,
  openRun: 0, // bumps when another playlist is opened, to abandon stale work
};

const SORT_LABEL = {
  colour: 'colour',
  journey: 'colour journey',
  artist: 'artist',
  bpm: 'BPM',
  key: 'key',
  mood: 'mood',
  transitions: 'best transitions',
  aux: 'aux',
};

const SORTERS = {
  current: (order) => order.slice(),
  colour: sortByColour,
  journey: sortByColourJourney,
  artist: sortByArtist,
  bpm: sortByBpm,
  key: sortByKey,
  mood: sortByMood,
  transitions: sortByTransitions,
  aux: sortByAux,
};

const bpmText = (audio) => `${Math.round(audio.bpm)} BPM`;
const transitionText = (audio) => `${bpmText(audio)}, ${camelot(audio)?.label ?? 'key unknown'}`;

// What each audio sort shows in place of the album name.
const READINGS = {
  bpm: bpmText,
  key: (audio) => (camelot(audio) ? `${keyName(audio)} (${camelot(audio).label})` : 'Key unknown'),
  mood: moodName,
  transitions: transitionText,
  aux: (audio) => `${moodName(audio)}, ${transitionText(audio)}`,
};

const SORT_NOTE = {
  aux: 'Eases in, builds to a peak, then winds down, with smooth joins and repeat artists spread out. ',
};

function setStatus(message, action) {
  const status = $('status');
  status.replaceChildren(message ? document.createTextNode(message) : '');
  if (!action) return;
  const control = document.createElement(action.href ? 'a' : 'button');
  control.textContent = action.label;
  if (action.href) {
    control.href = action.href;
    control.target = '_blank';
    control.rel = 'noreferrer';
  } else {
    control.type = 'button';
    control.addEventListener('click', action.run);
  }
  status.append(' ', control);
}

function updateControls() {
  const p = state.playlist;
  const changed = Boolean(p) && !sameOrder(state.shown, p.order);
  document.querySelectorAll('[data-view]').forEach((button) => {
    const { needs } = button.dataset;
    const waiting = (needs === 'covers' && !state.coversReady) || (needs === 'audio' && !state.audioReady);
    button.disabled = !p || state.busy || waiting;
    button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
  });
  $('reorder').disabled = !changed || state.busy;
  $('copy').disabled = !p || state.view === 'current' || state.busy;
  $('song-search').disabled = !p;
  document.querySelectorAll('#playlists button').forEach((button) => {
    button.disabled = state.busy;
  });
}

// Slides visible rows from their old place to the new one. Row height is fixed,
// so positions come from indexes and nothing has to be measured row by row.
function showOrder(next) {
  const list = $('tracks');
  const previous = new Map(state.shown.map((track, i) => [track, i]));
  state.shown = next;
  const reading = READINGS[state.view];

  const fragment = document.createDocumentFragment();
  next.forEach((track, i) => {
    const row = state.rows.get(track);
    row.querySelector('.num').textContent = i + 1;
    row.querySelector('.album').textContent = reading ? (track.audio ? reading(track.audio) : 'No data') : track.album;
    fragment.append(row);
  });
  list.classList.toggle('reading', Boolean(reading));
  list.append(fragment);
  // Row positions come from indexes, which hidden rows would throw off.
  if (calm || !previous.size || !next.length || $('song-search').value.trim()) return;

  const rowHeight = list.firstElementChild.offsetHeight;
  const first = Math.max(0, Math.floor(-list.getBoundingClientRect().top / rowHeight));
  const last = Math.min(next.length - 1, first + Math.ceil(innerHeight / rowHeight));
  const reach = innerHeight * 1.1;
  for (let i = first; i <= last; i++) {
    const shift = ((previous.get(next[i]) ?? i) - i) * rowHeight;
    if (!shift) continue;
    const from = Math.max(-reach, Math.min(reach, shift));
    state.rows.get(next[i]).animate([{ transform: `translateY(${from}px)` }, { transform: 'none' }], {
      duration: 600,
      easing: 'cubic-bezier(.2,.8,.2,1)',
    });
  }
}

// Only hides rows. state.shown keeps every song, because Reorder and Save use it.
function filterSongs() {
  const query = $('song-search').value;
  let matches = 0;
  for (const [track, row] of state.rows) {
    row.hidden = !matchesSearch(query, track.title, track.artists, track.album);
    if (!row.hidden) matches++;
  }
  let summary = '';
  if (query.trim()) {
    summary = matches
      ? `${matches} of ${state.rows.size} songs shown. Reorder and Save still use the whole playlist.`
      : 'No songs match that search.';
  }
  $('song-count').textContent = summary;
}

function filterPlaylists() {
  const query = $('playlist-search').value;
  const items = [...$('playlists').children];
  for (const item of items) {
    item.hidden = !matchesSearch(query, item.querySelector('.name').textContent);
  }
  $('playlist-count').textContent = items.length && items.every((item) => item.hidden) ? 'No playlists match that search.' : '';
}

function setView(view) {
  state.view = view;
  showOrder(SORTERS[view](state.playlist.order));
  updateControls();
  if (view === 'current') {
    setStatus('');
    return;
  }
  const missing = state.playlist.order.filter(lacksData[view]).length;
  const note = missing ? ` ${missing} ${missing === 1 ? 'song has' : 'songs have'} no data for this sort and ${missing === 1 ? 'sits' : 'sit'} at the end.` : '';
  setStatus(`${SORT_NOTE[view] ?? ''}Preview only. Your playlist changes when you reorder it or save a new one.${note}`);
}

// Loading progress must not overwrite what a chosen sort is telling the user.
function setLoadingStatus(message, action) {
  if (state.view === 'current' && !state.busy) setStatus(message, action);
}

function buildRow(track) {
  const row = document.createElement('li');
  row.className = 'row';

  const art = document.createElement('img');
  art.className = 'art';
  art.alt = '';
  art.loading = 'lazy';
  art.crossOrigin = 'anonymous';
  if (track.art) art.src = track.art;

  const text = document.createElement('div');
  text.className = 'text';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = track.title;
  const artist = document.createElement('span');
  artist.className = 'artist';
  artist.textContent = track.artists;
  text.append(title, artist);

  const album = document.createElement('span');
  album.className = 'album';
  album.textContent = track.album;

  const num = document.createElement('span');
  num.className = 'num';

  row.append(art, text, album, num);
  return row;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Cover did not load: ${url}`));
    image.src = url;
  });
}

function readCoverColour(image, context) {
  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  return dominantColour(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
}

// Reads each distinct cover once and paints its rows as soon as it is known.
async function readCovers(playlist, run) {
  const byCover = new Map();
  for (const track of playlist.tracks) {
    if (!track.thumb) continue;
    if (!byCover.has(track.thumb)) byCover.set(track.thumb, []);
    byCover.get(track.thumb).push(track);
  }

  const queue = [...byCover.keys()];
  const total = queue.length;
  let done = 0;
  let failed = 0;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });

  async function worker() {
    while (queue.length && run === state.openRun) {
      const url = queue.shift();
      try {
        const colour = readCoverColour(await loadImage(url), context);
        if (run !== state.openRun) return;
        for (const track of byCover.get(url)) {
          track.colour = colour;
          const row = state.rows.get(track);
          row.style.setProperty('--paint', colour.css);
          row.style.setProperty('--ink', colour.ink);
        }
      } catch {
        failed++;
      }
      done++;
      if (run === state.openRun) setLoadingStatus(`Reading album covers: ${done} of ${total}`);
    }
  }
  await Promise.all(Array.from({ length: COVER_WORKERS }, worker));
  if (run !== state.openRun) return failed;

  state.coversReady = true;
  updateControls();
  return failed;
}

async function readAudio(playlist, run) {
  try {
    await api.features(playlist.tracks, (done, total) => {
      if (run === state.openRun) setLoadingStatus(`Reading BPM, key and mood: ${done} of ${total}`);
    });
  } catch (err) {
    if (run === state.openRun) {
      setStatus(`BPM, key, mood and best transitions are unavailable. ${err.message}`, {
        label: 'Try again',
        run: async () => {
          if (await readAudio(playlist, run)) setLoadingStatus('');
        },
      });
    }
    return false;
  }
  if (run !== state.openRun) return false;
  state.audioReady = true;
  updateControls();
  return true;
}

async function prepareSorts(playlist, run) {
  const failedCovers = await readCovers(playlist, run);
  const audioLoaded = await readAudio(playlist, run);
  if (run !== state.openRun || !audioLoaded) return;
  setLoadingStatus(failedCovers ? `${failedCovers} covers could not be read, so their songs will sort last by colour.` : '');
}

async function openPlaylist(id) {
  const run = ++state.openRun;
  state.playlist = null;
  state.coversReady = false;
  state.audioReady = false;
  state.view = 'current';
  state.shown = [];
  state.rows = new Map();
  $('tracks').replaceChildren();
  $('song-search').value = '';
  $('song-count').textContent = '';
  $('empty').hidden = true;
  $('workspace').hidden = false;
  $('playlist-name').textContent = 'Loading songs';
  document.querySelectorAll('#playlists button').forEach((button) => {
    if (button.dataset.id === id) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  updateControls();
  setStatus('Loading songs from Spotify');

  let loaded;
  try {
    loaded = await api.open(id);
  } catch (err) {
    if (run === state.openRun) {
      $('playlist-name').textContent = 'This playlist did not load';
      setStatus(err.message, { label: 'Try again', run: () => openPlaylist(id) });
    }
    return;
  }
  if (run !== state.openRun) return;

  state.playlist = { ...loaded, order: loaded.tracks.slice(), undo: null };
  $('playlist-name').textContent = loaded.name;
  for (const track of loaded.tracks) state.rows.set(track, buildRow(track));
  showOrder(loaded.tracks.slice());
  updateControls();
  if (!loaded.tracks.length) {
    setStatus('This playlist has no songs to sort. Add some in Spotify, then open it again.');
    return;
  }
  prepareSorts(state.playlist, run);
}

async function moveSongs(playlist, target) {
  const moves = planMoves(playlist.order, target);
  for (let i = 0; i < moves.length; i++) {
    setStatus(`Moving songs: ${i} of ${moves.length} steps`);
    try {
      playlist.snapshot = await api.move(playlist.id, moves[i], playlist.snapshot);
    } catch (err) {
      err.message = `Stopped after ${i} of ${moves.length} steps, so the playlist is only partly sorted. ${err.message}`;
      throw err;
    }
    playlist.order = applyMove(playlist.order, moves[i]);
  }
}

// Spotify has been known to accept a move without applying it, so read back.
async function confirmSaved(playlist) {
  setStatus('Checking the new order on Spotify');
  const saved = await api.uris(playlist.id);
  if (!sameOrder(saved, playlist.order.map((track) => track.uri))) {
    throw new Error('Spotify accepted the changes, but the playlist came back in a different order. Open it again to see where it stands.');
  }
}

async function whileBusy(work) {
  state.busy = true;
  updateControls();
  try {
    await work();
  } catch (err) {
    setStatus(err.message);
  } finally {
    state.busy = false;
    updateControls();
  }
}

function reorder() {
  const playlist = state.playlist;
  const target = state.shown.slice();
  const sortName = SORT_LABEL[state.view];
  return whileBusy(async () => {
    if ((await api.snapshot(playlist.id)) !== playlist.snapshot) {
      await openPlaylist(playlist.id);
      setStatus('This playlist changed in Spotify since it was opened, so it was reloaded. Choose a sort and reorder it again.');
      return;
    }
    const before = playlist.order.slice();
    await moveSongs(playlist, target);
    await confirmSaved(playlist);
    playlist.undo = before;
    setStatus(`Reordered “${playlist.name}”${sortName ? ` by ${sortName}` : ''}. If Spotify still shows the old order, close and reopen the Spotify app. Undo is available until you leave this page.`, {
      label: 'Undo',
      run: undo,
    });
  });
}

function undo() {
  const playlist = state.playlist;
  const target = playlist.undo;
  return whileBusy(async () => {
    await moveSongs(playlist, target);
    await confirmSaved(playlist);
    playlist.undo = null;
    state.view = 'current';
    showOrder(playlist.order.slice());
    setStatus(`Put “${playlist.name}” back in its previous order.`);
  });
}

function saveCopy() {
  const playlist = state.playlist;
  const included = state.shown.filter((track) => track.copyable);
  const left = state.shown.length - included.length;
  const name = `${playlist.name} (by ${SORT_LABEL[state.view]})`;
  return whileBusy(async () => {
    const copy = await api.createCopy(name, 'Sorted with Playlist Sorter', included.map((track) => track.uri), (added) => {
      setStatus(`Saving new playlist: ${added} of ${included.length} songs`);
    });
    const leftOut = left ? ` ${left} local or unavailable songs could not be copied.` : '';
    const visibility = copy.isPublic ? ' Spotify made it public. To hide it, open it in Spotify and choose Make private.' : '';
    setStatus(`Saved “${copy.name}” with ${included.length} songs.${leftOut}${visibility}`, copy.url ? { label: 'Open in Spotify', href: copy.url } : undefined);
  });
}

async function showApp() {
  $('setup').hidden = true;
  $('app').hidden = false;
  $('account').textContent = state.me.display_name || state.me.id;
  const canInvite = !isDemo && !wasInvited();
  $('invite').hidden = !canInvite;
  if (canInvite) $('invite-users').href = `https://developer.spotify.com/dashboard/${getClientId()}/users`;

  const playlists = await api.playlists(state.me.id);
  const list = $('playlists');
  list.replaceChildren(
    ...playlists.map((playlist) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.id = playlist.id;

      const art = document.createElement('img');
      art.alt = '';
      art.loading = 'lazy';
      if (playlist.image) art.src = playlist.image;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = playlist.name;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = playlist.total;
      count.setAttribute('aria-label', `${playlist.total} songs`);

      button.append(art, name, count);
      button.addEventListener('click', () => openPlaylist(playlist.id));
      item.append(button);
      return item;
    }),
  );
  $('empty').textContent = playlists.length
    ? 'Choose a playlist to see its songs.'
    : 'No playlists to sort yet. Create one in Spotify, then reload this page.';
  updateControls();
  if (isDemo) openPlaylist('sample');
}

// The opening picture: jumbled colour bands settle into white -> rainbow -> black.
function playBands() {
  const sorted = [
    '#ffffff', '#ececec', '#ffc9c2', '#e0262e', '#8a1219', '#6e3a12', '#f37a1f', '#ffd27a', '#f5c518',
    '#c7d62a', '#27a84a', '#0e5a2a', '#19b5a5', '#28c3de', '#2a6fe8', '#14296b', '#7a35d8', '#d03fc1',
    '#f7699f', '#6c6c6c', '#2a2a2a', '#000000',
  ];
  const bands = $('bands');
  const elements = sorted.map((colour) => {
    const band = document.createElement('div');
    band.style.background = colour;
    return band;
  });
  if (calm) {
    bands.append(...elements);
    return;
  }
  let seed = 5;
  const jumbled = elements.slice();
  for (let i = jumbled.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    [jumbled[i], jumbled[j]] = [jumbled[j], jumbled[i]];
  }
  bands.append(...jumbled);
  setTimeout(() => {
    const height = bands.firstElementChild.offsetHeight;
    const before = new Map(jumbled.map((element, i) => [element, i]));
    bands.append(...elements);
    elements.forEach((element, i) => {
      const shift = (before.get(element) - i) * height;
      if (shift) {
        element.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], {
          duration: 1100,
          easing: 'cubic-bezier(.65,0,.2,1)',
        });
      }
    });
  }, 700);
}

const invitedClientId = () => findClientId(new URLSearchParams(location.search).get('app') ?? '');

function showSetup(message) {
  $('app').hidden = true;
  $('setup').hidden = false;
  $('redirect-uri').textContent = getRedirectUri();
  const invited = invitedClientId();
  const appId = invited ?? getClientId();
  $('client-id').value = appId;
  // Someone invited, or who has done this before, only needs the one button.
  $('guide').hidden = Boolean(appId);
  $('quick-connect').hidden = !appId;
  $('invite-note').hidden = !invited;
  $('setup-error').textContent = message || '';
  if (!$('bands').children.length) playBands();
}

function wireEvents() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
  $('reorder').addEventListener('click', reorder);
  $('copy').addEventListener('click', saveCopy);
  $('song-search').addEventListener('input', filterSongs);
  $('playlist-search').addEventListener('input', filterPlaylists);
  $('logout').addEventListener('click', () => {
    if (isDemo) {
      location.assign(location.pathname);
      return;
    }
    logout();
    location.reload();
  });
  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText($(button.dataset.copy).textContent);
      button.textContent = 'Copied';
    });
  });
  $('quick-button').addEventListener('click', () => {
    startLogin(findClientId($('client-id').value), Boolean(invitedClientId()));
  });
  $('copy-invite').addEventListener('click', async () => {
    await navigator.clipboard.writeText(`${getRedirectUri()}?app=${getClientId()}`);
    $('copy-invite').textContent = 'Copied';
  });
  $('change-app').addEventListener('click', () => {
    $('quick-connect').hidden = true;
    $('guide').hidden = false;
  });
  $('connect').addEventListener('submit', (event) => {
    event.preventDefault();
    const clientId = findClientId($('client-id').value);
    if (!clientId) {
      $('setup-error').textContent = 'That doesn’t look like a Client ID. It’s 32 letters and numbers, at the top of your app’s page on Spotify.';
      return;
    }
    startLogin(clientId);
  });
}

async function start() {
  // Stops another site framing this page to trick someone into pressing Reorder.
  if (window.top !== window.self) {
    document.body.textContent = 'Open Playlist Sorter in its own tab to use it.';
    return;
  }
  // Spotify rejects "localhost" as a redirect address, and logins are per-address.
  if (location.hostname === 'localhost') {
    location.replace(location.href.replace('//localhost', '//127.0.0.1'));
    return;
  }
  wireEvents();
  const loginError = isDemo ? null : await finishLogin();
  if (!isDemo && !hasSession()) {
    showSetup(loginError);
    return;
  }
  try {
    state.me = await api.me();
    await showApp();
  } catch (err) {
    logout();
    showSetup(err.status === 403 ? NOT_ALLOWED : err.message);
  }
}

start();
