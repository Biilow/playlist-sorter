// Spotify login using the PKCE flow, which needs no server and no client secret.

const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

const CLIENT_KEY = 'sorter.clientId';
const TOKEN_KEY = 'sorter.token';
const VERIFIER_KEY = 'sorter.verifier';
const STATE_KEY = 'sorter.state';

// The page's own folder, so it works at the root of a site or under a project path.
const redirectUri = () => new URL('./', location.href).href;

export const getRedirectUri = redirectUri;
export const getClientId = () => localStorage.getItem(CLIENT_KEY) || '';

const base64Url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const randomString = () => base64Url(crypto.getRandomValues(new Uint8Array(48)));

// Tokens live in sessionStorage: they end with the tab, and other sites on a
// shared host such as github.io can't read them the way they could localStorage.
function readToken() {
  try {
    return JSON.parse(sessionStorage.getItem(TOKEN_KEY));
  } catch {
    return null;
  }
}

function storeToken(body, previousRefresh) {
  const token = {
    access: body.access_token,
    refresh: body.refresh_token || previousRefresh,
    expires: Date.now() + body.expires_in * 1000,
  };
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  return token;
}

async function requestToken(params) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: getClientId(), ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error_description || `Spotify login failed (${res.status}).`);
  return body;
}

export async function startLogin(clientId) {
  localStorage.setItem(CLIENT_KEY, clientId);
  const verifier = randomString();
  const state = randomString();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: base64Url(digest),
    state,
  });
  location.assign(`https://accounts.spotify.com/authorize?${query}`);
}

// Finishes the login if Spotify just sent the browser back here.
// Returns an error message to show, or null.
export async function finishLogin() {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return null;
  history.replaceState(null, '', location.pathname);
  if (error) return error === 'access_denied' ? 'Spotify access was declined. Connect again to continue.' : `Spotify login failed: ${error}.`;

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  if (!verifier || params.get('state') !== expected) return 'That login could not be confirmed. Connect again to continue.';

  try {
    const body = await requestToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    });
    storeToken(body);
    return null;
  } catch (err) {
    return err.message;
  }
}

export const hasSession = () => Boolean(readToken()?.refresh);

export function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
}

let refreshing = null;

export function refreshToken() {
  refreshing ??= requestToken({ grant_type: 'refresh_token', refresh_token: readToken()?.refresh })
    .then((body) => storeToken(body, readToken()?.refresh))
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function getAccessToken() {
  const token = readToken();
  if (!token) throw new Error('Connect Spotify to continue.');
  if (Date.now() < token.expires - 60_000) return token.access;
  return (await refreshToken()).access;
}
