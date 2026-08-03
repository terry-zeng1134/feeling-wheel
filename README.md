# Feeling Wheel

Name what you're feeling, then look back at the pattern.

A small offline web app built on Gloria Willcox's Feeling Wheel. You tap through
a radial wheel from vague to specific — *mad → hurt → embarrassed → mortified* —
log it with an intensity and a trigger, and the month view shows you the shape of
it afterwards.

**Everything stays on your device by default.** No account, no server, no
network request of any kind. Entries live in your browser's local storage, and
the only way data leaves is if you export it yourself.

Sync is available and off unless you turn it on — and when you do, entries are
encrypted here before they're sent, so the server holds a blob it cannot read.
See [encrypted sync](#optional-encrypted-sync).

## Install on iPhone

Open the site in Safari → **Share** → **Add to Home Screen**. It launches
fullscreen with no browser chrome, works with no connection, and gets its own
longer-lived storage bucket.

No Apple account, no Xcode, no developer fee, and nothing that expires.

### Making local storage permanent

Browser storage is *evictable* by default — the OS may reclaim it under disk
pressure. The app calls `navigator.storage.persist()` to ask for an exemption,
and **Data → Make storage permanent** asks again explicitly. Safari grants it on
engagement signals, and being installed to the Home Screen is the strongest one,
so install first and then tap it.

The Data screen states plainly which mode you're in rather than assuming, and
nudges you to export if you have 25+ entries and no backup in two weeks.

## What's in it

| | |
|---|---|
| **Log** | The wheel, plus search and recent-word shortcuts. Stop at any ring — two taps for "I just feel bad", five for something exact. |
| **Month** | One radial glyph per day. Angle is the feeling family, length is intensity, count is how many times you logged. Scroll down into a full timeline of entries. |
| **Patterns** | Where entries sat, granularity over time, time-of-day histogram, and what you felt after recurring triggers. |
| **Data** | Export JSON or CSV, import a backup, optional encrypted sync, delete everything. |

### The day glyph

Six families sit at fixed angles, and the rotation carries meaning: the three
positive families occupy the upper half, the three negative the lower. Spokes
pointing up was a good day. You read the shape of a month from across the room.

Colours were chosen by exhaustive search rather than by eye, gated on OKLab
separation for the six cyclically-adjacent pairs — the only pairs that ever
touch, because the angles are fixed. Worst adjacent pair: CVD ΔE 8.4 against a
target of 8.0, normal-vision ΔE 19.3 against a floor of 15.0, in both themes.

## Optional: encrypted sync

Off by default. Turn it on if you want your entries on more than one device, or
a backup that survives a cleared browser. Backed by **Firebase** (Firestore +
email auth) — chosen over Supabase because its free tier does not pause after a
week of inactivity, which a journal will absolutely hit.

Firestore stores `{ updatedAt, deleted, iv, ct }` at `users/{uid}/entries/{id}` —
a timestamp and a blob. The entry itself is AES-GCM encrypted in your browser under a key
derived (PBKDF2-SHA256, 250k iterations) from a passphrase **that is never
transmitted**. Every bit of analysis in this app is client-side, so making the
data opaque to the server costs nothing.

Two separate secrets, on purpose:

| | Seen by the server | Recoverable |
|---|---|---|
| Account password | yes, for auth | yes, password reset |
| Encryption passphrase | **never** | **no** |

**Lose the passphrase and the synced rows are unreadable — by anyone, including
you.** Your local entries and any export stay readable, so it isn't fatal, but
write it down.

### Setting it up

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) (Spark plan, no card).
2. **Build → Firestore Database → Create database** (production mode is fine).
3. **Firestore → Rules** → paste [`firestore.rules`](firestore.rules) → Publish.
4. **Build → Authentication → Get started → Email/Password → Enable.**
5. **Project settings (gear) → General → Your apps → Web app** → copy the
   `apiKey` and `projectId`.
6. In the app: **Data → Turn on sync**, paste those two, pick an account
   email/password, and choose a passphrase.

The Web API key is *public by design* — Google documents it as safe to ship in
client apps. It identifies the project; the Security Rules do the protecting. A
client-only app with no backend cannot hold a real secret, so authority comes
from your signed-in identity, not from hiding a string.

Nothing sync-related is stored in this repo. Your URL, key, and session live in
your browser's `localStorage`; the passphrase lives only in memory.

Sync is last-write-wins per entry on `updatedAt`, and deletes are tombstones so
they propagate rather than resurrecting from the other device.

### When it backs up

- **On open**, at most once a day.
- **After each entry**, debounced.
- **On demand**, via Sync now.

For the daily run to work without retyping anything, the derived key is cached
on the device after you first unlock. That is not a downgrade: your entries are
already stored here in plaintext, so the encryption exists to stop the *server*
reading them, not to defend against someone holding your unlocked phone. The
passphrase itself is never stored, and signing out erases the cached key.

Supabase access tokens expire hourly, so a once-a-day sync always opens with a
stale one; a 401 triggers a refresh and one retry before it counts as signed out.

If the network is down or a free-tier project has paused, the sync fails quietly
and the app carries on — local data never depended on it.

### Testing sync without a real project

`tools/mock-firebase.mjs` stands in for Google's endpoints — Identity Toolkit,
the secure-token refresh endpoint, and Firestore's typed-document REST API — so
the sync layer can be driven end to end locally:

```bash
node tools/mock-firebase.mjs 8792     # prints the apiKey and projectId to use
python3 -m http.server 8741
```

Point `FB_HOSTS` at `http://localhost:8792` in a scratch copy of the built page,
then run setup against it. This harness caught two real bugs in the Supabase
version that a live project would only have surfaced at the worst moment, so it
is worth keeping.

`tools/mock-supabase.mjs` remains for the previous backend.

## Backups on this device

Separate from sync, and aimed at a different failure: you.

A snapshot of every entry is taken when you open the app (at most twice a day),
and **always immediately before anything destructive** — delete-all, an import,
or restoring another snapshot. Up to 6 are kept, oldest dropped first, bounded by
a byte budget so they can't exhaust local storage. Restore any of them from
**Data → Backups**; the restore itself is snapshotted, so it's undoable too.

These live on the device. They survive mistakes, not a deleted app — for that,
use sync or export.

## Sources, and what is and isn't cited

- **Rings 1–3** follow Gloria Willcox, "The Feeling Wheel," *Transactional
  Analysis Journal* 12(4), 1982 — 6 core feelings, 36, then 72.
  **This tree is a reconstruction and has not been verified word-for-word
  against the 1982 paper.** It lives in one block at the top of
  [`app/index.html`](app/index.html); correct any word there and the whole app
  follows.
- **Ring 4** is marked `ext.` in the UI and cites Shaver, Schwartz, Kirson &
  O'Connor (*JPSP* 52:6, 1987) or Cowen & Keltner (*PNAS* 114:38, 2017). It is
  partial by design — a branch only gets a fourth ring where a genuinely
  distinct feeling exists, never a synonym.
- **Definitions are authored for this app.** They are differential — each says
  how a word differs from the ones beside it, because at the moment of choosing
  that is the only thing that helps. They are not from Willcox, Shaver, or
  Cowen & Keltner, and the UI says so.

The review screens show counts and never interpretation. Thirty self-logged
entries cannot support a causal claim, so nothing here makes one.

## Layout

```
index.html              built, hosted page — do not edit directly
app/index.html          the app itself; edit this
manifest.webmanifest    PWA manifest
sw.js                   offline cache
firestore.rules         paste into Firebase to enable sync
supabase-schema.sql     previous backend, kept for reference
tools/build.mjs         app/index.html + document shell → index.html
tools/deploy.sh         build, commit, push
tools/make-icons.mjs    generates the icons, no image dependencies
mockup/index.html       earlier design mockup
docs/superpowers/       design spec and full implementation plan
```

Edit `app/index.html`, then ship:

```bash
./tools/deploy.sh "what changed"
```

That rebuilds `index.html`, commits, and pushes. Pages redeploys automatically
and the installed app picks up the change next time it opens online — no
reinstall, and your entries are untouched.

Rebuild without shipping:

```bash
node tools/build.mjs
```

No dependencies, no package.json, no bundler.

## Status

Working and usable. The [spec](docs/superpowers/specs/) and
[implementation plan](docs/superpowers/plans/) describe a fuller TDD build —
typed modules, IndexedDB, ~110 tests — which this single-file version
deliberately shortcuts to be usable today.

Known gaps against that plan: storage is `localStorage` rather than IndexedDB,
there is no screen-reader list-mode alternative to the wheel, and the Willcox
transcription needs verifying.
