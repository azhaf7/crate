# Crate

Send songs to friends as vinyl records.

Paste a Spotify or Apple Music link and Crate turns it into a sealed record. Send it by text, WhatsApp,
Telegram, email, X, or your phone's share sheet. Your friend opens the link, taps the sleeve, and the
record slides out and starts to spin. Then they can play it on Spotify or Apple Music, or save it in
Crate.

It's a web app: it works in any browser, and on iPhone or Android you can add it to your home screen
(Share → Add to Home Screen) so it opens like an app.

## How it works

- **Make:** paste a link to one song. Add your name and an optional note, then send.
- **Records:** the records you've sent, and the ones friends sent you that you saved. They're kept in
  this browser on this device; there's no account.
- **Library (optional):** connect Spotify to send songs straight from your liked songs, recently played
  and playlists.
- **The record link** carries the song, artist, cover, note and the Spotify / Apple Music IDs, so it
  opens anywhere without a server. Links made by the Vinyl Player Mac app open here too.

Songs are looked up in the browser: first [song.link](https://odesli.co), then Apple's iTunes catalogue
and Spotify's public embed info. If none of them answer, Crate asks you to type the title and artist.

## Put it online (GitHub Pages)

1. In this repo: **Settings → Pages → Source: GitHub Actions**.
2. Push to `main`. The **Publish Crate** workflow puts the site at
   `https://<your-username>.github.io/crate/`.

## Connect Spotify (optional)

1. Go to <https://developer.spotify.com/dashboard> and create an app (any name). Tick **Web API**.
2. Under **Redirect URIs**, add your Crate address exactly, e.g. `https://azhaf7.github.io/crate/`.
3. Copy the **Client ID** into `config.js` (`spotifyClientId: '…'`) and push.

Crate signs in with PKCE, so no Client Secret is needed. Never put the secret in this repo. While a
Spotify app is in development mode, only people you add under **User Management** (up to 25) can
connect; ask Spotify for an extension to open it to everyone.

## Files

```
index.html, app.css, app.js   The app: Make, Records, Library
r/                            The record page friends open (same motion as Vinyl Player's)
config.js                     Spotify Client ID (optional)
manifest.webmanifest, sw.js   Add to home screen, works on a poor connection
```
