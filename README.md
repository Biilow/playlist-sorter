# Playlist Sorter

Sorts a Spotify playlist by album cover colour, artist, BPM, key, mood, best transitions or Aux (a full listening arc that eases in, peaks and winds down).
It runs entirely in your browser. There is no server and no client secret.

Use it at <https://biilow.github.io/playlist-sorter/>, or add `?demo` to try a sample playlist without logging in.

If you reorder a playlist and Spotify still shows the old order, close and reopen the Spotify app.

## Privacy

- There is no server, database, account system, analytics or tracking.
- Each person connects their own Spotify developer app, so nobody else's app or login is involved.
- The Spotify login is kept in `sessionStorage`, so it ends when the tab closes. To remove the app's access completely, use [Manage apps](https://www.spotify.com/account/apps/) on Spotify.
- It only asks for permission to read and change your playlists. It never asks for your email.
- Your search text stays on the page.
- Only three outside services are contacted: Spotify, ReccoBeats (song IDs only, no login), and Google Fonts (which sees your IP address when it serves the typeface).
- A Content Security Policy blocks the page from talking to any other site.

## Run it locally

```bash
npm start
```

Then open <http://127.0.0.1:5199/>. The page walks through connecting Spotify.
Add `?demo` to the address to try a sample playlist without logging in.

## Spotify's rules

- The account that owns the developer app needs Premium.
- An app in Development Mode can be used by up to 5 people, who must be added under User Management.
- Spotify only returns songs for playlists you own or collaborate on, so other playlists are not listed.
- New playlists can come out public even though the app asks for private. The page tells you when that happens, and you can change it in the Spotify app.

## Where the data comes from

Colour comes from the album covers. BPM, key and mood come from [ReccoBeats](https://reccobeats.com), because Spotify no longer shares them with new apps. Only song IDs are sent to it. Songs it doesn't know go at the end of those sorts.

## Tests

```bash
npm test
```
