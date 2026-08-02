# Feeling Wheel — Emotion Labelling App

**Date:** 2026-08-02
**Status:** Design approved, pending spec review

---

## 1. Summary

A personal emotion-labelling app. The user navigates a radial wheel of feeling
words from vague to specific, logs what they're feeling with an intensity and a
trigger, and reviews the accumulated log for patterns across days.

Ships as a PWA: works at a URL in any browser, installs to the iOS home screen
where it runs fullscreen and offline. No account, no server, no network calls.

**The app's own goal is measurable:** not "feel better," but "name it more
precisely than you could three months ago." Section 6.5 tracks that directly.

---

## 2. Goals and non-goals

### Goals

- Log a feeling in under 10 seconds, start to saved.
- Support naming at whatever precision is actually true right now — including
  "I just feel bad."
- Surface patterns across days: what recurs, when, and around what.
- Keep every emotion word traceable to a published source.
- Work with no network, forever.

### Non-goals (v1)

Explicitly out of scope. Any of these can be added later; none are being
designed around now.

- Reminders / push notifications
- Sync of any kind, encrypted or otherwise
- Accounts, auth, or any server component
- Body-map capture
- Multiple feelings per entry (see §4 for why)
- Any form of algorithmic advice, diagnosis, or interpretation

---

## 3. Taxonomy and provenance

### 3.1 Spine: Willcox (1982)

Gloria Willcox, "The Feeling Wheel: A Tool for Expanding Awareness of Emotions
and Increasing Spontaneity and Intimacy," *Transactional Analysis Journal*
12(4), 274–276.

Structure is perfectly uniform, which is what makes it work as a radial control:

| Ring | Count | Branching |
|---|---|---|
| 1 — core | 6 | Mad, Sad, Scared, Joyful, Powerful, Peaceful |
| 2 | 36 | exactly 6 per core |
| 3 | 72 | exactly 2 per ring-2 word |

Total: 114 words, 72 leaves.

### 3.2 Ring 4: cited extension

Willcox stops at three rings. There is no published four-ring Willcox wheel; the
four-ring versions in circulation are coaching-organisation derivatives with no
citation behind the added words, and are **not** to be used as sources.

Ring 4 is therefore a deliberate construction, built under these rules:

1. Words are drawn only from **Shaver, Schwartz, Kirson & O'Connor (1987)**,
   "Emotion knowledge: Further exploration of a prototype approach," *JPSP*
   52(6), 1061–1086; or **Cowen & Keltner (2017)**, *PNAS* 114(38).
2. A ring-4 word is added only where it names a **genuinely distinct feeling**,
   never a near-synonym. Shaver's tertiary lists carry heavy synonym padding
   (its `affection` branch alone holds adoration, fondness, liking, attraction,
   caring, tenderness, compassion, sentimentality); for a tool tapped daily,
   that is friction, not richness.
3. Ring 4 is **partial**. Many ring-3 branches will have no children. This is
   correct and expected.
4. Every word in the dataset carries a `source` field. Ring-4 words are
   visually marked as extensions in the UI and expose their citation on
   long-press.

Estimated 150–190 total selectable words. Exact count is determined during the
vocabulary build, which is a reviewable artifact in its own right.

### 3.3 Why not Shaver as the spine

Shaver's tree is better science — empirically derived via cluster analysis of
similarity sorts — but its branching is lopsided (ring 2 ranges from 1
subcategory under Surprise to 7 under Joy). Rendered radially with proportional
segments, Surprise becomes an unusable sliver; rendered with equal segments, it
misrepresents the data. Willcox's uniform 6→6→2 is why it functions as an
interface. Shaver is better science; Willcox is better interface. We take the
interface and cite the science.

Willcox also carries `Powerful` and `Peaceful` as core feelings. These are
closer to appraisals than emotions and most researchers would not call them
basic — but for journaling they are among the most useful branches, because
"I feel capable today" needs somewhere to go and Shaver has no equivalent.

---

## 4. Data model

An entry is a timestamped moment holding **exactly one** feeling.

```ts
interface Entry {
  id:        string;   // uuid
  ts:        string;   // ISO 8601
  wordId:    string;   // "embarrassed"
  path:      string[]; // ["mad", "hurt", "embarrassed"] — denormalized
  ring:      1 | 2 | 3 | 4;
  intensity: 1 | 2 | 3 | 4 | 5;
  trigger:   string;   // short; autocompleted from history
  note:      string;   // optional, longer, free text
}
```

### 4.1 One word per entry

Feeling two things means two quick entries. This keeps capture fast and the
model trivially chartable. The cost is that co-occurrence can only be inferred
from timestamp proximity, which is accepted.

### 4.2 `path` is denormalized deliberately

Storing the full ancestry on every entry costs ~40 bytes and means every
rollup ("Mad-family, 14 times this week") is an array filter rather than a tree
walk on each render. This is what makes the review layer instant at any depth.

### 4.3 `ring` records where the user stopped

Not every feeling resolves to a leaf. Forcing four taps to log a vague feeling
is how these apps get abandoned. `ring` captures how specific the user managed
to be — which is itself a tracked signal (§6.5).

### 4.4 `trigger` autocompletes from the user's own history

This is the quiet lever in the design. Free text cannot be aggregated —
"standup", "Standup", and "stand up" are three different things. Autocompleting
from prior entries makes triggers converge into de-facto tags with no tag
management. It is the difference between a review layer that can say *why* and
one that can only say *what*.

---

## 5. Capture

### 5.1 The wheel zooms

~150 leaf words cannot render legibly at 390px. A full static four-ring wheel is
a poster, not an interface. So each tap rescales the wheel: the selected wedge's
children expand to occupy the entire ring. There are never more than six
segments live, so targets stay finger-sized at every depth.

Breadcrumb across the top; tap any crumb to jump back; swipe down to back out
one level.

### 5.2 The hub commits; the wedges descend

At every level:

- **Tap a wedge** → descend one ring.
- **Tap the hub** → log at the current level.

The hub always displays the word it would commit, so a tap is never ambiguous.
At ring 4 there is nowhere deeper, so tapping a wedge commits directly.

"I just feel bad" is two taps. "Mortified specifically" is five.

### 5.3 Detail screen

One screen after commit: intensity (1–5), trigger (autocomplete), note
(optional). **Target: under 10 seconds from launch to saved.**

### 5.4 Escape hatches

The wheel is for when the word isn't known yet. When it is:

- **Search** — type "resent", land on it directly.
- **Recent** — last six words as chips. Most logging is repeat logging.

---

## 6. Review

Design principle: **show counts, never verdicts.** Self-logged emotion data is
sparse and self-selected. An app that concludes "your anxiety is caused by work"
from 30 entries is fabricating. Every view surfaces what was recorded and lets
the user draw the conclusion.

Minimum-data thresholds throughout; below them the screen states how many more
entries it needs rather than rendering noise as insight.

### 6.1 Month view — the day glyph

Each day is a miniature of the wheel itself. Full spec in §7.

### 6.2 Family rollup

Distribution across the six cores over 7 / 30 / 90 days, with top words inside
each. Powered by the denormalized `path`.

### 6.3 Time of day

24-hour histogram split by family. The most reliably real pattern in this kind
of data, and one almost nobody notices before seeing it plotted.

*Threshold: 20 entries.*

### 6.4 Trigger → feeling

For each trigger used 5+ times, the distribution of feelings that followed it.

```
"standup"  ·  11 entries
   scared › anxious      ██████  6
   mad › inadequate      ███     3
   joyful › relieved     ██      2
```

The most actionable view in the app, and the reason §4.4 exists.

*Threshold: 5 occurrences of a given trigger.*

### 6.5 Granularity

Two numbers tracked over time: **distinct words used** and **mean ring depth**.

Grounded in Barrett's work on emotional differentiation — the finding that
people who describe feelings more precisely regulate them better. This makes the
app's own purpose measurable, and is why §4.3 exists.

---

## 7. Day glyph — visual encoding spec

### 7.1 Form

A ~40px radial glyph, one per day in a 7-column month grid. Six fixed 60°
sectors, one per core family. Each entry draws one spoke.

| Channel | Encodes |
|---|---|
| Spoke **angle** | which family |
| Spoke **length** | intensity (1–5) |
| Spoke **count** | entries that day |

Position is the primary identity channel and hue reinforces it. Six hues alone
at 40px is precisely where colorblind readers lose the thread; fixed angles make
the glyph legible without color at all.

### 7.2 Rotation encodes valence

Fixed angles are being assigned regardless, so they are assigned to carry
meaning. The published wheel's rotational arrangement is decorative — the tree
is what is load-bearing, and the tree is untouched.

```
       PEACEFUL (0°)
POWERFUL (300°)   JOYFUL (60°)     ← upper half: positive
────────────────────────────
   MAD (240°)     SCARED (120°)    ← lower half: negative
       SAD (180°)
```

Spokes pointing up is a good day; spokes pointing down is a hard day. Valence
reads before anything specific does, and a month of glyphs shows the shape of
the month from three feet away.

### 7.3 Details

- **Fan-out.** Multiple entries in one family spread across deterministic
  sub-angles within their 60° sector, so three anxious entries render as three
  distinct spokes rather than one overdrawn line.
- **Length.** `r = r_min + (intensity / 5) × (r_max − r_min)`. Never zero, so an
  intensity of 1 remains visible.
- **Marks.** 2px stroke, rounded outer end.
- **Guide ring.** Faint six-sector guide at low opacity, so orientation is
  readable on a sparse day.
- **Empty day.** Guide ring only. Days outside the month render nothing at all —
  the two states must be distinguishable.
- **Today.** Emphasized ring.
- **Dense days.** Beyond 8 entries, stroke thins to 1.5px. Beyond 12, the glyph
  caps and shows a count.
- **Tap.** Opens the day's entries with exact values.

Intensity reads as approximate at 40px. That is the honest cost of this form,
and the reason tap-for-detail exists: the glyph is a scanning instrument, the
detail view is for reading.

### 7.4 Color

Six categorical hues, fixed assignment per family, never cycled. **The palette
must be validated with the `dataviz` skill's `scripts/validate_palette.js` in
both light and dark modes before shipping** — pass/fail, not judgment. Dark mode
is stepped independently from the same ramps, not flipped.

A single key glyph above the grid shows the six family positions, satisfying the
legend requirement without repeating a legend on every cell.

---

## 8. Architecture

| Concern | Choice | Rationale |
|---|---|---|
| Stack | Vite + TypeScript, no UI framework | The app is one wheel, one form, five views. A framework is overhead; TS on a 150-node tree is not. |
| Wheel | Inline SVG, ~6 arc segments live | Real DOM nodes give real focus states and real hit targets. Canvas costs both. |
| Charts | Hand-rolled SVG | No library, no CSP concerns, full control. `dataviz` skill consulted before writing chart code. |
| Storage | IndexedDB via `idb` | Survives better than localStorage on iOS; won't wall at 5MB after a year of notes. |
| Offline | Service worker, precache-all | The app has no network dependency, so this is straightforward. |
| Install | Web manifest, `apple-touch-icon`, `display: standalone` | What makes it a home-screen app with no Safari chrome. |

### 8.1 Storage durability

iOS evicts web-app storage after long disuse. Home-screen–installed PWAs are far
more protected than Safari tabs, but "far more" is not "never." **Export is a
one-tap, first-class action**, not a settings-menu item. JSON (round-trips) and
CSV (portable). Import restores from JSON.

### 8.2 Module boundaries

Each unit stands alone and is testable without the others:

- `taxonomy/` — the word tree + provenance. Pure data plus lookup helpers.
- `store/` — IndexedDB persistence, export/import. Knows nothing of the wheel.
- `wheel/` — radial capture control. Emits a selected path; owns no state.
- `review/` — aggregations over entries. Pure functions, entries in, shapes out.
- `glyph/` — day glyph renderer. Takes a day's entries, returns SVG.
- `app/` — routing and screens.

---

## 9. Accessibility

- Every wheel segment is focusable with a visible focus state.
- **List mode**: a parallel nested-list navigation over the identical tree. A
  radial control is hostile to screen readers; the fallback is not a degraded
  version but a complete one.
- Every day glyph carries an `aria-label` reading its entries in full.
- A table view of the month exists alongside the glyph grid.
- `prefers-reduced-motion` respected on all wheel transitions.
- Light and dark both designed, not inverted.

---

## 10. Risks and open items

| Item | Resolution path |
|---|---|
| Ring-4 vocabulary is a construction, not a published source | Built as a separate reviewable artifact with per-word citations before implementation. §3.2 rules govern. |
| Day glyph legibility at 40px is unproven | Prototype the glyph at true size with realistic data before building the month view around it. |
| Six-hue palette may fail CVD validation | Run the validator early; snap to passing steps. Fixed angles mean the glyph survives even if hue separation is imperfect. |
| Storage eviction on iOS | One-tap export; consider an export nudge after N entries without one. |

---

## 11. Decisions log

Settled during design, recorded so they aren't relitigated:

1. Willcox spine over Shaver spine — interface geometry beats taxonomic rigor
   for a control that must be tapped daily.
2. One word per entry, not multi-word — capture speed over co-occurrence
   detection.
3. Local-only storage, no sync — nothing to breach, nothing to subpoena.
4. Radial day glyph over slot-strip or stacked column — continuity with the
   wheel's own geometry; days become recognizable signatures.
5. Rotation encodes valence rather than inheriting the published arrangement.
6. Hub commits, wedges descend — makes "stop at any layer" a first-class action
   rather than an escape hatch.
