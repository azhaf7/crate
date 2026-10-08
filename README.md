<p align="center"><img src="icon-512.png" width="128" alt="Crate icon"></p>

# Crate

Send songs to friends as vinyl records.

Paste a Spotify or Apple Music link and Crate turns it into a sealed record. Send it by text, WhatsApp,
Telegram, email, X, or your phone's share sheet. Your friend opens the link, taps the sleeve, and the
record slides out and starts to spin. Then they can play it on Spotify or Apple Music, or save it in
Crate.

It's a web app: it works in any browser, and on iPhone or Android you can add it to your home screen
(Share → Add to Home Screen) so it opens like an app.

## How it works

- **Make:** paste a link to one song. Add who it's for, your name and an optional note, then **Send
  record**: a sheet offers your phone's share list (Messages, WhatsApp, AirDrop…) or Copy link.
  Recently Sent shows each record as **Sealed** or **Opened**, and a badge on the Records tab counts
  records opened since you last looked.
- **Search:** type a song or artist into the box on Make and pick from Apple's catalogue, or paste a
  Spotify / Apple Music link as before.
- **Mixtapes:** "Add a song" turns a record into a sleeve of 2 to 5 songs with a collage of their covers.
  **Sequence it for me** (Claude) puts them in the order that flows best, names the tape and writes a line
  for each song. Your friend gets a tracklist; the previews play one after another.
- **Ask Crate (Claude):** not sure what to send? Describe the person or the moment ("my sister, just
  moved to Tokyo, misses home") and Claude picks six songs, each with a line on why it fits. Every pick
  is checked against Apple's catalogue before it's shown, so you never get a song that doesn't exist.
  Tap one and it's pressed onto a record.
- **Write it for me (Claude):** next to Note, Claude drafts three short notes for this song and this
  person (one tender, one playful, one about when to play it). Tap one to use it.
- **Records:** the records you've sent, and the ones friends sent you that you saved. They're kept in
  this browser. Sign in with your email (optional, no password: a 6-digit code) and they follow you to
  every phone and computer; records sent before signing in move into the account.
- **The record page:** your friend taps the sleeve, the record slides out and spins, and Apple's
  30-second preview starts playing. Then they can open it in Spotify or Apple Music, react (❤️ 🔥 😭 🕺 🤯),
  save it, or **Send one back**: Crate opens with the sender's name already filled in.
- **Link previews:** on Vercel, records are sent as short links (`/s/Ab3xK9…`). In iMessage, WhatsApp,
  Slack or X the preview is a picture of the record sliding out of its sleeve with "Sam sent you a
  record", the song and the note (`api/og.js`). Elsewhere (GitHub Pages)
  links stay long and work as before.
- **Ask Crate ideas:** one tap on "a rainy Sunday morning", "their birthday", "missing home"… to start.
- **Crate Wrapped (Claude):** once you've sent or saved a few records in a week, **Wrap my week** on
  Records writes up your week in records: a headline, what you shared and with whom, three vibe words.
- **Stats:** Records shows how many you've sent, how many were opened, and your friends' top reaction.
- **Reactions:** you see your friend's reaction on Records next to Opened, and it counts on the badge.
- **Discover:** what's playing right now in your country, by genre (Apple's public charts, no account
  needed), with a 30-second preview on every song. Tap one to press it onto a record. Moments like "A rainy
  Sunday" start Ask Crate. Spotify and Apple Music libraries show up here once they're set up.
- **Appearance:** the button at the top of Make switches between Automatic (follows the phone), Light and Dark.
- **The record link** carries the song, artist, cover, note and the Spotify / Apple Music IDs, so it
  opens anywhere even if the database is down. Links made by the Vinyl Player Mac app open here too.

Songs are looked up in the browser: first [song.link](https://odesli.co), then Apple's iTunes catalogue
and Spotify's public embed info. If none of them answer, Crate asks you to type the title and artist.

## Put it online (GitHub Pages)

1. In this repo: **Settings → Pages → Source: GitHub Actions**.
2. Push to `main`. The **Publish Crate** workflow puts the site at
   `https://<your-username>.github.io/crate/`.

## Database (Supabase)

Crate uses a Supabase project only to know which records have been opened. Each browser that sends a
record gets an anonymous identity automatically: no sign-up, no email.

1. In Supabase: **Authentication → Sign In / Providers → Allow anonymous sign-ins** (on).
2. **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), **Run**.
3. Run [`supabase/accounts.sql`](supabase/accounts.sql) the same way (email sign-in and saved records).
4. Put the project URL and the **anon / publishable** key in `config.js`.

For email sign-in:

- Sign-in works with Supabase's default emails (tap the link in them). To also show a code people can
  type (better for the home-screen app), set up SMTP below first; Supabase only lets you edit
  **Authentication → Emails → Templates** after that. Then add
  `<p>Your Crate code: <strong>{{ .Token }}</strong></p>` to **Magic Link** and **Confirm signup**.
- **Authentication → URL Configuration → Site URL:** your Crate address (e.g. `https://crate-three-mu.vercel.app/`).
- Supabase's built-in email only reaches your own team's addresses and sends a few an hour. For everyone
  else, set up your own sender under **Project Settings → Authentication → SMTP Settings** (e.g. Resend,
  or a Gmail account with an app password).

What's stored per record: a random id, who it's to and from (the names typed in), the song, the note,
and when it was first opened and how many times. Senders can only read their own records. Anyone with a
record's link can mark it opened, and nothing else. Never put the `service_role` / secret key anywhere
in this repo.

## Ask Crate: Claude (optional)

Ask Crate and "Write it for me" run in a Supabase Edge Function (`supabase/functions/crate-ai`), so the
Anthropic API key never reaches the browser. Each call carries the person's own session, and
`public.use_ai()` allows 20 calls an hour per person.

1. Run [`supabase/social.sql`](supabase/social.sql) in the SQL Editor (reactions + the AI allowance).
2. Get an API key at <https://platform.claude.com>, then with the
   [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy crate-ai
   ```
3. `ai: true` in `config.js` shows the features (set `false` to hide them).

It uses Claude Opus 5.5 at low effort with structured JSON output and server-side refusal fallback.

## Database updates, in order

After `schema.sql` and `accounts.sql`, run these once each in the SQL Editor, in this order:

1. [`supabase/social.sql`](supabase/social.sql): reactions, the hourly Ask Crate allowance
2. [`supabase/growth.sql`](supabase/growth.sql): short links, reply tracking, daily growth numbers
3. [`supabase/mixtapes.sql`](supabase/mixtapes.sql): mixtapes

Plain records keep syncing even before `mixtapes.sql` has run; only mixtapes need it.

## Short links and previews (Vercel)

1. Run the SQL above.
2. Deploy on Vercel as usual. `vercel.json` sends `/s/<id>` to `api/card.js`, which reads the
   Supabase URL and anon key from `config.js` (or `SUPABASE_URL` / `SUPABASE_ANON_KEY` env vars).
   `api/og.js` draws the preview picture with `@vercel/og` (the one dependency in `package.json`,
   installed by Vercel; the site itself still has no build step).

The app checks `api/card?probe=1` once per session and only makes short links when it answers.

## Growth numbers

`growth.sql` also records which records were replies ("Send one back") and adds a daily view only you
can read, in the Supabase SQL Editor:

```sql
select * from public.crate_daily order by day desc limit 30;
-- day | records_sent | senders | opened | open_rate_pct | reacted | replies
```

## Connect Apple Music (optional)

Apple only lets a web app read someone's library with a developer token signed by an Apple Developer
account ($99/year). The `apple-music-token` Edge Function signs it, so the private key never reaches the page.

1. In the [Apple Developer portal](https://developer.apple.com/account/resources/identifiers/list/musicId):
   **Identifiers → Media IDs → +**, then **Keys → +** with **Media Services (MusicKit)** ticked, linked to
   that Media ID. Download the `.p8` key and note its **Key ID** and your **Team ID**.
2. Deploy the function with your secrets:
   ```bash
   supabase secrets set APPLE_TEAM_ID=XXXXXXXXXX APPLE_KEY_ID=XXXXXXXXXX APPLE_MUSIC_KEY="$(cat AuthKey_XXXXXXXXXX.p8)"
   supabase secrets set APPLE_MUSIC_ORIGINS=https://your-crate.vercel.app   # optional: only works on your site
   supabase functions deploy apple-music-token
   ```
3. Set `appleMusic: true` in `config.js`.

## Connect Spotify (optional)

1. Go to <https://developer.spotify.com/dashboard> and create an app (any name). Tick **Web API**.
2. Under **Redirect URIs**, add your Crate address exactly, e.g. `https://azhaf7.github.io/crate/`.
3. Copy the **Client ID** into `config.js` (`spotifyClientId: '…'`) and push.

Crate signs in with PKCE, so no Client Secret is needed. Never put the secret in this repo. While a
Spotify app is in development mode, only people you add under **User Management** (up to 25) can
connect; ask Spotify for an extension to open it to everyone.

## Files

```
index.html, app.css, app.js   The app: Make, Records, Discover
stack.js, stack.css           The sleeve stack on Records, the Library source cards
r/                            The record page friends open (same motion as Vinyl Player's)
config.js                     Supabase URL + anon key, Spotify Client ID (optional)
supabase/schema.sql           The database: records, who can see them, open receipts
supabase/accounts.sql         Email sign-in: saved records per account, moving records into an account
supabase/social.sql           Reactions, and the hourly Ask Crate allowance
supabase/growth.sql           Short-link lookups, reply tracking, daily growth numbers
supabase/mixtapes.sql         Mixtapes: 2 to 5 songs per record
supabase/functions/apple-music-token/  Edge Function: signs the Apple Music developer token
api/card.js, vercel.json      Short links /s/<id> with link previews (Vercel)
api/og.js, package.json       The preview picture: the record sliding out of its sleeve (Vercel)
supabase/functions/crate-ai/  Edge Function: Ask Crate, "Write it for me", mixtape sequencing, Crate Wrapped (Claude)
manifest.webmanifest, sw.js   Add to home screen, works on a poor connection
```
