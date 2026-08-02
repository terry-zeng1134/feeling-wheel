# Feeling Wheel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-only PWA that lets a person navigate a radial wheel of feeling words from vague to specific, log what they feel with intensity and trigger, and review the log for patterns across days.

**Architecture:** Vite + TypeScript, no UI framework. Six modules with hard boundaries: `taxonomy` (pure data + lookup), `store` (IndexedDB), `wheel` (radial capture control), `review` (pure aggregation functions), `glyph` (day-glyph renderer), `app` (routing + screens). All rendering is hand-written SVG/DOM. Every module below `app` is a pure or near-pure unit testable without a browser.

**Tech Stack:** Vite 5, TypeScript 5 (strict), Vitest, `fake-indexeddb` for store tests, `idb` for IndexedDB access, `vite-plugin-pwa` for the service worker and manifest. No UI framework, no chart library, no CSS framework.

**Reference spec:** `docs/superpowers/specs/2026-08-02-emotion-labelling-design.md`

## Global Constraints

- **No network calls, ever.** No fetch, no CDN links, no analytics, no fonts from a remote host. The app must work fully offline from first load onward.
- **No account, no server, no sync.** All data lives in IndexedDB on the device.
- **TypeScript strict mode on.** `strict: true`, `noUncheckedIndexedAccess: true`.
- **Every emotion word carries a `source` field.** One of `"willcox-1982"`, `"shaver-1987"`, `"cowen-keltner-2017"`. No word may be added without one.
- **Ring 4 words must be visually marked as extensions in the UI** and expose their citation on long-press.
- **Family colors and angles are fixed and never computed at runtime.** Exact values in Task 3. They were chosen by validated search; do not substitute.
- **Capture target: under 10 seconds from app launch to saved entry.** Any change that adds a required step to the capture path needs justification.
- **Review shows counts, never verdicts.** No view may render interpretation, advice, or causal language. Thresholds: trigger breakdown needs ≥5 occurrences of that trigger; time-of-day needs ≥20 entries total. Below threshold, state how many more entries are needed.
- **Light and dark both designed.** Dark steps are given explicitly per family; never invert or filter.
- **`prefers-reduced-motion` respected** on all wheel and view transitions.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/taxonomy/types.ts` | `Ring`, `Family`, `Source`, `WordNode` types |
| `src/taxonomy/willcox.ts` | Rings 1–3, the published 114-word tree |
| `src/taxonomy/extension.ts` | Ring 4, cited extension words |
| `src/taxonomy/index.ts` | Tree assembly + lookup: `getNode`, `childrenOf`, `pathOf`, `searchWords` |
| `src/taxonomy/palette.ts` | `FAMILY_ANGLE`, `FAMILY_COLOR` — the validated constants |
| `src/store/types.ts` | `Entry` |
| `src/store/db.ts` | IndexedDB CRUD + queries |
| `src/store/transfer.ts` | Export/import JSON + CSV export |
| `src/geometry/arc.ts` | `arcPath`, `sectorForIndex` — pure SVG path math |
| `src/wheel/wheel.ts` | Radial capture control; emits selected node id |
| `src/glyph/dayGlyph.ts` | `spokesForDay`, `renderDayGlyph` |
| `src/review/aggregate.ts` | `byDay`, `familyRollup`, `timeOfDay`, `triggerBreakdown`, `granularity` |
| `src/app/screens/*.ts` | Capture, detail, month, review, settings screens |
| `src/app/router.ts` | Hash routing |
| `src/styles/tokens.css` | Color tokens for both themes |

---

## Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test` and `npm run dev`

- [ ] **Step 1: Initialize the project**

```bash
cd ~/feeling-wheel
npm init -y
npm i idb
npm i -D vite typescript vitest fake-indexeddb @types/node vite-plugin-pwa jsdom
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
  },
});
```

- [ ] **Step 4: Write the failing smoke test**

`src/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { appName } from "./main";

describe("scaffold", () => {
  it("exports an app name", () => {
    expect(appName).toBe("Feeling Wheel");
  });
});
```

- [ ] **Step 5: Run it and confirm it fails**

Run: `npx vitest run src/smoke.test.ts`
Expected: FAIL — cannot resolve `./main` or `appName` is undefined.

- [ ] **Step 6: Create `src/main.ts`**

```ts
export const appName = "Feeling Wheel";
```

- [ ] **Step 7: Run it and confirm it passes**

Run: `npx vitest run src/smoke.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 8: Add scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + typescript + vitest"
```

---

## Task 2: Taxonomy types and the Willcox tree (rings 1–3)

**Files:**
- Create: `src/taxonomy/types.ts`, `src/taxonomy/willcox.ts`, `src/taxonomy/index.ts`
- Test: `src/taxonomy/taxonomy.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Family = "mad" | "sad" | "scared" | "joyful" | "powerful" | "peaceful"`
  - `type Ring = 1 | 2 | 3 | 4`
  - `type Source = "willcox-1982" | "shaver-1987" | "cowen-keltner-2017"`
  - `interface WordNode { id: string; label: string; ring: Ring; parent: string | null; family: Family; source: Source; children: string[] }`
  - `getNode(id: string): WordNode | undefined`
  - `childrenOf(id: string | null): WordNode[]` — `null` returns the six roots
  - `pathOf(id: string): string[]`
  - `allNodes(): WordNode[]`

- [ ] **Step 1: Write `src/taxonomy/types.ts`**

```ts
export type Family = "mad" | "sad" | "scared" | "joyful" | "powerful" | "peaceful";
export type Ring = 1 | 2 | 3 | 4;
export type Source = "willcox-1982" | "shaver-1987" | "cowen-keltner-2017";

export interface WordNode {
  id: string;
  label: string;
  ring: Ring;
  parent: string | null;
  family: Family;
  source: Source;
  children: string[];
}

/** Raw authoring shape: [ring2 label, [ring3 label, ring3 label]][] */
export type FamilySpec = [string, [string, string]][];
```

- [ ] **Step 2: Write the failing structural test**

`src/taxonomy/taxonomy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { allNodes, childrenOf, getNode, pathOf } from "./index";

describe("willcox tree", () => {
  it("has exactly 6 roots", () => {
    expect(childrenOf(null)).toHaveLength(6);
  });

  it("gives every root exactly 6 children", () => {
    for (const root of childrenOf(null)) {
      expect(childrenOf(root.id)).toHaveLength(6);
    }
  });

  it("gives every ring-2 node exactly 2 children", () => {
    for (const root of childrenOf(null)) {
      for (const r2 of childrenOf(root.id)) {
        expect(childrenOf(r2.id)).toHaveLength(2);
      }
    }
  });

  it("has 114 willcox nodes total", () => {
    const willcox = allNodes().filter((n) => n.source === "willcox-1982");
    expect(willcox).toHaveLength(114);
  });

  it("assigns every node a unique id", () => {
    const ids = allNodes().map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves a full path from a ring-3 node", () => {
    expect(pathOf("embarrassed")).toEqual(["mad", "hurt", "embarrassed"]);
  });

  it("propagates family down every branch", () => {
    for (const n of allNodes()) {
      expect(pathOf(n.id)[0]).toBe(n.family);
    }
  });

  it("returns undefined for an unknown id", () => {
    expect(getNode("not-a-feeling")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run src/taxonomy`
Expected: FAIL — `./index` does not exist.

- [ ] **Step 4: Author `src/taxonomy/willcox.ts`**

Transcribe the published wheel. Every ring-2 entry has exactly 6 siblings; every ring-3 pair has exactly 2 members. The `mad` family is given in full below as the authoritative format; author the remaining five identically from the published wheel.

```ts
import type { Family, FamilySpec } from "./types";

export const WILLCOX: Record<Family, FamilySpec> = {
  mad: [
    ["hurt",       ["embarrassed", "devastated"]],
    ["hostile",    ["irritated", "frustrated"]],
    ["angry",      ["furious", "jealous"]],
    ["rage",       ["hateful", "critical"]],
    ["exasperated",["violated", "furious"]],
    ["jealous",    ["resentful", "provoked"]],
  ],
  sad: [/* 6 entries, same shape */] as FamilySpec,
  scared: [/* 6 entries */] as FamilySpec,
  joyful: [/* 6 entries */] as FamilySpec,
  powerful: [/* 6 entries */] as FamilySpec,
  peaceful: [/* 6 entries */] as FamilySpec,
};
```

**Note for the implementer:** the `mad` rows above are the format specimen, not a licence to invent the rest. Transcribe the other five families from the published Willcox wheel. If a label collides with one already used (Willcox repeats a few words across branches), suffix the id with the parent, e.g. `furious--angry` and `furious--exasperated`, while keeping `label` unsuffixed. The uniqueness test in Step 2 will catch any collision you miss.

- [ ] **Step 5: Write `src/taxonomy/index.ts`**

```ts
import type { Family, WordNode } from "./types";
import { WILLCOX } from "./willcox";

const nodes = new Map<string, WordNode>();

function add(n: WordNode): void {
  if (nodes.has(n.id)) throw new Error(`duplicate node id: ${n.id}`);
  nodes.set(n.id, n);
}

function build(): void {
  for (const family of Object.keys(WILLCOX) as Family[]) {
    const rootId = family;
    add({
      id: rootId, label: family, ring: 1, parent: null,
      family, source: "willcox-1982", children: [],
    });
    for (const [r2Label, r3Labels] of WILLCOX[family]) {
      const r2Id = nodes.has(r2Label) ? `${r2Label}--${family}` : r2Label;
      add({
        id: r2Id, label: r2Label, ring: 2, parent: rootId,
        family, source: "willcox-1982", children: [],
      });
      nodes.get(rootId)!.children.push(r2Id);
      for (const r3Label of r3Labels) {
        const r3Id = nodes.has(r3Label) ? `${r3Label}--${r2Id}` : r3Label;
        add({
          id: r3Id, label: r3Label, ring: 3, parent: r2Id,
          family, source: "willcox-1982", children: [],
        });
        nodes.get(r2Id)!.children.push(r3Id);
      }
    }
  }
}
build();

export function getNode(id: string): WordNode | undefined {
  return nodes.get(id);
}

export function allNodes(): WordNode[] {
  return [...nodes.values()];
}

export function childrenOf(id: string | null): WordNode[] {
  if (id === null) return allNodes().filter((n) => n.ring === 1);
  const n = nodes.get(id);
  if (!n) return [];
  return n.children.map((c) => nodes.get(c)!).filter(Boolean);
}

export function pathOf(id: string): string[] {
  const out: string[] = [];
  let cur = nodes.get(id);
  while (cur) {
    out.unshift(cur.id);
    cur = cur.parent ? nodes.get(cur.parent) : undefined;
  }
  return out;
}

export type { Family, Ring, Source, WordNode } from "./types";
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/taxonomy`
Expected: PASS, 7 tests. If "114 willcox nodes" fails, a family is short a row.

- [ ] **Step 7: Commit**

```bash
git add src/taxonomy
git commit -m "feat(taxonomy): willcox 1982 tree, rings 1-3, with lookup helpers"
```

---

## Task 3: Palette and angle constants

**Files:**
- Create: `src/taxonomy/palette.ts`
- Test: `src/taxonomy/palette.test.ts`

**Interfaces:**
- Consumes: `Family` from Task 2
- Produces:
  - `FAMILY_ANGLE: Record<Family, number>` — degrees clockwise from 12 o'clock
  - `FAMILY_COLOR: Record<Family, { light: string; dark: string }>`
  - `CYCLE: Family[]` — families in angular order

These values came from an exhaustive search over hue assignments, gated on OKLab CVD separation and normal-vision separation in both modes (worst cyclic-adjacent pair: CVD ΔE 8.4, normal-vision ΔE 19.3). **They are not adjustable by eye.** Changing one requires re-running the search.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { CYCLE, FAMILY_ANGLE, FAMILY_COLOR } from "./palette";

describe("palette", () => {
  it("places the three positive families in the upper half", () => {
    for (const f of ["peaceful", "joyful", "powerful"] as const) {
      const a = FAMILY_ANGLE[f];
      expect(a === 0 || a > 240 || a < 120).toBe(true);
    }
  });

  it("places the three negative families in the lower half", () => {
    for (const f of ["scared", "sad", "mad"] as const) {
      expect(FAMILY_ANGLE[f]).toBeGreaterThanOrEqual(120);
      expect(FAMILY_ANGLE[f]).toBeLessThanOrEqual(240);
    }
  });

  it("spaces all six families 60 degrees apart", () => {
    const sorted = [...CYCLE].sort((a, b) => FAMILY_ANGLE[a] - FAMILY_ANGLE[b]);
    sorted.forEach((f, i) => expect(FAMILY_ANGLE[f]).toBe(i * 60));
  });

  it("gives every family a light and dark hex", () => {
    for (const f of CYCLE) {
      expect(FAMILY_COLOR[f].light).toMatch(/^#[0-9a-f]{6}$/);
      expect(FAMILY_COLOR[f].dark).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/taxonomy/palette.test.ts`
Expected: FAIL — `./palette` does not exist.

- [ ] **Step 3: Write `src/taxonomy/palette.ts`**

```ts
import type { Family } from "./types";

/** Angular order clockwise from 12 o'clock. Upper half positive, lower half negative. */
export const CYCLE: Family[] = ["peaceful", "joyful", "scared", "sad", "mad", "powerful"];

export const FAMILY_ANGLE: Record<Family, number> = {
  peaceful: 0,
  joyful: 60,
  scared: 120,
  sad: 180,
  mad: 240,
  powerful: 300,
};

/**
 * Validated by exhaustive search over hue assignments against the cyclic
 * adjacency pairlist. Worst adjacent pair: CVD ΔE 8.4, normal-vision ΔE 19.3,
 * both modes. Do not substitute by eye.
 */
export const FAMILY_COLOR: Record<Family, { light: string; dark: string }> = {
  peaceful: { light: "#1baf7a", dark: "#199e70" },
  joyful:   { light: "#eda100", dark: "#c98500" },
  scared:   { light: "#e87ba4", dark: "#d55181" },
  sad:      { light: "#2a78d6", dark: "#3987e5" },
  mad:      { light: "#e34948", dark: "#e66767" },
  powerful: { light: "#4a3aa7", dark: "#9085e9" },
};
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/taxonomy/palette.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/taxonomy/palette.ts src/taxonomy/palette.test.ts
git commit -m "feat(taxonomy): validated family palette and fixed angular positions"
```

---

## Task 4: Ring-4 cited extension

**Files:**
- Create: `src/taxonomy/extension.ts`
- Modify: `src/taxonomy/index.ts` (extend `build()`)
- Test: `src/taxonomy/extension.test.ts`

**Interfaces:**
- Consumes: `WordNode`, `Source` from Task 2
- Produces: `EXTENSION: Record<string, { label: string; source: Source }[]>` keyed by ring-3 parent id

**Rules (from spec §3.2), enforced by test:**
1. Words come only from Shaver et al. (1987) or Cowen & Keltner (2017).
2. A word is added only where it names a genuinely distinct feeling, never a near-synonym.
3. Ring 4 is partial — most ring-3 branches will have no children.
4. Every word carries its `source`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { allNodes, childrenOf, getNode, pathOf } from "./index";

describe("ring 4 extension", () => {
  it("marks every ring-4 node with a non-willcox source", () => {
    const r4 = allNodes().filter((n) => n.ring === 4);
    expect(r4.length).toBeGreaterThan(0);
    for (const n of r4) {
      expect(n.source).not.toBe("willcox-1982");
    }
  });

  it("parents every ring-4 node to a ring-3 node", () => {
    for (const n of allNodes().filter((x) => x.ring === 4)) {
      expect(getNode(n.parent!)!.ring).toBe(3);
    }
  });

  it("leaves ring 4 partial — not every ring-3 node has children", () => {
    const r3 = allNodes().filter((n) => n.ring === 3);
    const withKids = r3.filter((n) => childrenOf(n.id).length > 0);
    expect(withKids.length).toBeGreaterThan(0);
    expect(withKids.length).toBeLessThan(r3.length);
  });

  it("keeps the willcox spine at exactly 114 nodes", () => {
    expect(allNodes().filter((n) => n.source === "willcox-1982")).toHaveLength(114);
  });

  it("gives ring-4 nodes a 4-deep path", () => {
    for (const n of allNodes().filter((x) => x.ring === 4)) {
      expect(pathOf(n.id)).toHaveLength(4);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/taxonomy/extension.test.ts`
Expected: FAIL — no ring-4 nodes exist.

- [ ] **Step 3: Author `src/taxonomy/extension.ts`**

```ts
import type { Source } from "./types";

export interface ExtensionWord {
  label: string;
  source: Source;
}

/**
 * Ring 4: cited extension beyond the published Willcox wheel.
 * Keyed by ring-3 parent id. Partial by design.
 * Rules in spec §3.2 — distinct feelings only, never synonyms.
 */
export const EXTENSION: Record<string, ExtensionWord[]> = {
  embarrassed: [
    { label: "mortified", source: "shaver-1987" },
    { label: "humiliated", source: "shaver-1987" },
  ],
  // ... author the rest per spec §3.2, with a citation on every word.
};
```

**Note for the implementer:** this file is the reviewable vocabulary artifact named in spec §10. Produce it as a standalone commit and surface the full word list with citations for review before moving on. Do not pad it to hit a word count — a branch with no distinct extension gets no children.

- [ ] **Step 4: Extend `build()` in `src/taxonomy/index.ts`**

Insert immediately after the ring-3 `add(...)` call, inside the `for (const r3Label of r3Labels)` loop:

```ts
        for (const ext of EXTENSION[r3Id] ?? []) {
          const r4Id = nodes.has(ext.label) ? `${ext.label}--${r3Id}` : ext.label;
          add({
            id: r4Id, label: ext.label, ring: 4, parent: r3Id,
            family, source: ext.source, children: [],
          });
          nodes.get(r3Id)!.children.push(r4Id);
        }
```

Add the import at the top: `import { EXTENSION } from "./extension";`

- [ ] **Step 5: Run all taxonomy tests and confirm they pass**

Run: `npx vitest run src/taxonomy`
Expected: PASS — both Task 2's 7 tests and this task's 5.

- [ ] **Step 6: Commit**

```bash
git add src/taxonomy
git commit -m "feat(taxonomy): cited ring-4 extension from shaver 1987 / cowen-keltner 2017"
```

---

## Task 5: Word search

**Files:**
- Modify: `src/taxonomy/index.ts`
- Test: `src/taxonomy/search.test.ts`

**Interfaces:**
- Consumes: `allNodes`, `WordNode`
- Produces: `searchWords(q: string, limit?: number): WordNode[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { searchWords } from "./index";

describe("searchWords", () => {
  it("returns [] for an empty query", () => {
    expect(searchWords("")).toEqual([]);
  });

  it("finds a word by prefix", () => {
    expect(searchWords("embar").map((n) => n.label)).toContain("embarrassed");
  });

  it("ranks a prefix match above a mid-word match", () => {
    const r = searchWords("rate");
    const prefixIdx = r.findIndex((n) => n.label.startsWith("rate"));
    const midIdx = r.findIndex((n) => !n.label.startsWith("rate"));
    if (prefixIdx !== -1 && midIdx !== -1) expect(prefixIdx).toBeLessThan(midIdx);
  });

  it("is case insensitive", () => {
    expect(searchWords("EMBAR").length).toBe(searchWords("embar").length);
  });

  it("respects the limit", () => {
    expect(searchWords("a", 3).length).toBeLessThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/taxonomy/search.test.ts`
Expected: FAIL — `searchWords` is not exported.

- [ ] **Step 3: Add `searchWords` to `src/taxonomy/index.ts`**

```ts
export function searchWords(q: string, limit = 20): WordNode[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const scored: { n: WordNode; score: number }[] = [];
  for (const n of allNodes()) {
    const hay = n.label.toLowerCase();
    const at = hay.indexOf(needle);
    if (at === -1) continue;
    scored.push({ n, score: at === 0 ? 0 : 1 });
  }
  scored.sort((a, b) => a.score - b.score || a.n.label.localeCompare(b.n.label));
  return scored.slice(0, limit).map((s) => s.n);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/taxonomy/search.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/taxonomy
git commit -m "feat(taxonomy): word search with prefix ranking"
```

---

## Task 6: Entry store

**Files:**
- Create: `src/store/types.ts`, `src/store/db.ts`
- Test: `src/store/db.test.ts`

**Interfaces:**
- Consumes: `Ring` from Task 2
- Produces:
  - `interface Entry { id: string; ts: string; wordId: string; path: string[]; ring: Ring; intensity: 1|2|3|4|5; trigger: string; note: string }`
  - `putEntry(e: Entry): Promise<void>`
  - `getEntry(id: string): Promise<Entry | undefined>`
  - `deleteEntry(id: string): Promise<void>`
  - `allEntries(): Promise<Entry[]>` — newest first
  - `entriesBetween(fromIso: string, toIso: string): Promise<Entry[]>`
  - `recentWordIds(n: number): Promise<string[]>`
  - `triggerSuggestions(prefix: string, n: number): Promise<string[]>`

- [ ] **Step 1: Write `src/store/types.ts`**

```ts
import type { Ring } from "../taxonomy/types";

export type Intensity = 1 | 2 | 3 | 4 | 5;

export interface Entry {
  id: string;
  ts: string;        // ISO 8601
  wordId: string;
  path: string[];    // denormalized ancestry, spec §4.2
  ring: Ring;
  intensity: Intensity;
  trigger: string;
  note: string;
}
```

- [ ] **Step 2: Write the failing test**

`src/store/db.test.ts`:

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  allEntries, deleteEntry, entriesBetween, getEntry,
  putEntry, recentWordIds, resetForTests, triggerSuggestions,
} from "./db";
import type { Entry } from "./types";

const entry = (over: Partial<Entry> = {}): Entry => ({
  id: crypto.randomUUID(),
  ts: "2026-08-02T14:20:00.000Z",
  wordId: "embarrassed",
  path: ["mad", "hurt", "embarrassed"],
  ring: 3,
  intensity: 3,
  trigger: "standup",
  note: "",
  ...over,
});

beforeEach(async () => { await resetForTests(); });

describe("entry store", () => {
  it("round-trips an entry", async () => {
    const e = entry();
    await putEntry(e);
    expect(await getEntry(e.id)).toEqual(e);
  });

  it("returns all entries newest first", async () => {
    await putEntry(entry({ ts: "2026-08-01T10:00:00.000Z" }));
    await putEntry(entry({ ts: "2026-08-03T10:00:00.000Z" }));
    const all = await allEntries();
    expect(all[0]!.ts).toBe("2026-08-03T10:00:00.000Z");
  });

  it("deletes an entry", async () => {
    const e = entry();
    await putEntry(e);
    await deleteEntry(e.id);
    expect(await getEntry(e.id)).toBeUndefined();
  });

  it("filters by date range inclusively on both ends", async () => {
    await putEntry(entry({ ts: "2026-07-31T23:59:59.000Z" }));
    await putEntry(entry({ ts: "2026-08-01T00:00:00.000Z" }));
    await putEntry(entry({ ts: "2026-08-02T00:00:00.000Z" }));
    const got = await entriesBetween("2026-08-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z");
    expect(got).toHaveLength(2);
  });

  it("lists recent word ids without duplicates, newest first", async () => {
    await putEntry(entry({ wordId: "lonely", ts: "2026-08-01T10:00:00.000Z" }));
    await putEntry(entry({ wordId: "anxious", ts: "2026-08-02T10:00:00.000Z" }));
    await putEntry(entry({ wordId: "lonely", ts: "2026-08-03T10:00:00.000Z" }));
    expect(await recentWordIds(6)).toEqual(["lonely", "anxious"]);
  });

  it("suggests triggers by prefix, most used first", async () => {
    await putEntry(entry({ trigger: "standup" }));
    await putEntry(entry({ trigger: "standup" }));
    await putEntry(entry({ trigger: "stand-down" }));
    expect(await triggerSuggestions("stand", 5)).toEqual(["standup", "stand-down"]);
  });

  it("ignores empty triggers in suggestions", async () => {
    await putEntry(entry({ trigger: "" }));
    expect(await triggerSuggestions("", 5)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run src/store`
Expected: FAIL — `./db` does not exist.

- [ ] **Step 4: Write `src/store/db.ts`**

```ts
import { openDB, type IDBPDatabase } from "idb";
import type { Entry } from "./types";

const DB_NAME = "feeling-wheel";
const STORE = "entries";
let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbp ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      const s = d.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("ts", "ts");
    },
  });
  return dbp;
}

/** Test-only: drop the database and reset the connection. */
export async function resetForTests(): Promise<void> {
  const d = await db();
  await d.clear(STORE);
}

export async function putEntry(e: Entry): Promise<void> {
  await (await db()).put(STORE, e);
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  return (await db()).get(STORE, id) as Promise<Entry | undefined>;
}

export async function deleteEntry(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
}

export async function allEntries(): Promise<Entry[]> {
  const rows = (await (await db()).getAllFromIndex(STORE, "ts")) as Entry[];
  return rows.reverse();
}

export async function entriesBetween(fromIso: string, toIso: string): Promise<Entry[]> {
  const rows = (await (await db()).getAllFromIndex(
    STORE, "ts", IDBKeyRange.bound(fromIso, toIso)
  )) as Entry[];
  return rows.reverse();
}

export async function recentWordIds(n: number): Promise<string[]> {
  const seen: string[] = [];
  for (const e of await allEntries()) {
    if (!seen.includes(e.wordId)) seen.push(e.wordId);
    if (seen.length === n) break;
  }
  return seen;
}

export async function triggerSuggestions(prefix: string, n: number): Promise<string[]> {
  const needle = prefix.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const e of await allEntries()) {
    const t = e.trigger.trim();
    if (!t) continue;
    if (needle && !t.toLowerCase().startsWith(needle)) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([t]) => t);
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/store`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/store
git commit -m "feat(store): indexeddb entry store with range, recent, and trigger queries"
```

---

## Task 7: Export and import

**Files:**
- Create: `src/store/transfer.ts`
- Test: `src/store/transfer.test.ts`

**Interfaces:**
- Consumes: `Entry`, `allEntries`, `putEntry` from Task 6
- Produces:
  - `exportJson(entries: Entry[]): string`
  - `exportCsv(entries: Entry[]): string`
  - `parseJson(text: string): Entry[]` — throws `Error` with a readable message on malformed input
  - `importEntries(entries: Entry[]): Promise<{ added: number; skipped: number }>` — skips ids already present

- [ ] **Step 1: Write the failing test**

```ts
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { allEntries, putEntry, resetForTests } from "./db";
import { exportCsv, exportJson, importEntries, parseJson } from "./transfer";
import type { Entry } from "./types";

const e1: Entry = {
  id: "a", ts: "2026-08-02T14:20:00.000Z", wordId: "embarrassed",
  path: ["mad", "hurt", "embarrassed"], ring: 3, intensity: 3,
  trigger: "standup", note: "said the wrong thing",
};

beforeEach(async () => { await resetForTests(); });

describe("transfer", () => {
  it("round-trips json", () => {
    expect(parseJson(exportJson([e1]))).toEqual([e1]);
  });

  it("writes a csv header plus one row per entry", () => {
    const lines = exportCsv([e1]).trim().split("\n");
    expect(lines[0]).toBe("id,ts,wordId,path,ring,intensity,trigger,note");
    expect(lines).toHaveLength(2);
  });

  it("quotes csv fields containing commas or quotes", () => {
    const csv = exportCsv([{ ...e1, note: 'he said "no", loudly' }]);
    expect(csv).toContain('"he said ""no"", loudly"');
  });

  it("throws a readable error on malformed json", () => {
    expect(() => parseJson("{not json")).toThrow(/could not be read/i);
  });

  it("throws when the payload is not an array of entries", () => {
    expect(() => parseJson('{"foo":1}')).toThrow(/expected a list of entries/i);
  });

  it("skips entries whose id already exists", async () => {
    await putEntry(e1);
    const res = await importEntries([e1, { ...e1, id: "b" }]);
    expect(res).toEqual({ added: 1, skipped: 1 });
    expect(await allEntries()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/store/transfer.test.ts`
Expected: FAIL — `./transfer` does not exist.

- [ ] **Step 3: Write `src/store/transfer.ts`**

```ts
import { getEntry, putEntry } from "./db";
import type { Entry } from "./types";

const COLUMNS = ["id", "ts", "wordId", "path", "ring", "intensity", "trigger", "note"] as const;

export function exportJson(entries: Entry[]): string {
  return JSON.stringify({ version: 1, exported: new Date().toISOString(), entries }, null, 2);
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function exportCsv(entries: Entry[]): string {
  const rows = entries.map((e) =>
    [e.id, e.ts, e.wordId, e.path.join(" > "), String(e.ring), String(e.intensity), e.trigger, e.note]
      .map(csvCell).join(",")
  );
  return [COLUMNS.join(","), ...rows].join("\n") + "\n";
}

export function parseJson(text: string): Entry[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file could not be read as JSON. Pick a file exported from this app.");
  }
  const entries = (data as { entries?: unknown })?.entries ?? data;
  if (!Array.isArray(entries)) {
    throw new Error("Expected a list of entries. Pick a file exported from this app.");
  }
  return entries as Entry[];
}

export async function importEntries(entries: Entry[]): Promise<{ added: number; skipped: number }> {
  let added = 0, skipped = 0;
  for (const e of entries) {
    if (await getEntry(e.id)) { skipped++; continue; }
    await putEntry(e);
    added++;
  }
  return { added, skipped };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/store/transfer.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/store
git commit -m "feat(store): json/csv export and json import with duplicate skip"
```

---

## Task 8: Arc geometry

**Files:**
- Create: `src/geometry/arc.ts`
- Test: `src/geometry/arc.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number }` — 0° is 12 o'clock, clockwise
  - `arcPath(cx: number, cy: number, rInner: number, rOuter: number, a0: number, a1: number): string`
  - `sectorForIndex(i: number, n: number): { a0: number; a1: number }`
  - `fanAngles(centerDeg: number, spanDeg: number, count: number): number[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { arcPath, fanAngles, polar, sectorForIndex } from "./arc";

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe("polar", () => {
  it("puts 0 degrees at 12 o'clock", () => {
    const p = polar(0, 0, 10, 0);
    close(p.x, 0); close(p.y, -10);
  });

  it("goes clockwise: 90 degrees is 3 o'clock", () => {
    const p = polar(0, 0, 10, 90);
    close(p.x, 10); close(p.y, 0);
  });
});

describe("sectorForIndex", () => {
  it("divides the circle evenly and starts at the top", () => {
    expect(sectorForIndex(0, 6)).toEqual({ a0: -30, a1: 30 });
  });

  it("wraps the last sector without exceeding 360", () => {
    const s = sectorForIndex(5, 6);
    expect(s.a1 - s.a0).toBe(60);
  });
});

describe("arcPath", () => {
  it("emits a closed path", () => {
    expect(arcPath(50, 50, 20, 40, 0, 60)).toMatch(/^M .*Z$/);
  });

  it("sets the large-arc flag past 180 degrees", () => {
    expect(arcPath(50, 50, 20, 40, 0, 200)).toContain(" 1 1 ");
    expect(arcPath(50, 50, 20, 40, 0, 100)).toContain(" 0 1 ");
  });
});

describe("fanAngles", () => {
  it("returns the centre angle for a single spoke", () => {
    expect(fanAngles(120, 40, 1)).toEqual([120]);
  });

  it("spreads spokes symmetrically about the centre", () => {
    const a = fanAngles(120, 40, 3);
    expect(a).toHaveLength(3);
    close(a[1]!, 120);
    close(a[0]! + a[2]!, 240);
  });

  it("keeps every spoke inside the span", () => {
    for (const a of fanAngles(120, 40, 8)) {
      expect(a).toBeGreaterThanOrEqual(100);
      expect(a).toBeLessThanOrEqual(140);
    }
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/geometry`
Expected: FAIL — `./arc` does not exist.

- [ ] **Step 3: Write `src/geometry/arc.ts`**

```ts
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function sectorForIndex(i: number, n: number): { a0: number; a1: number } {
  const span = 360 / n;
  const center = i * span;
  return { a0: center - span / 2, a1: center + span / 2 };
}

export function arcPath(
  cx: number, cy: number, rInner: number, rOuter: number, a0: number, a1: number
): string {
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const o0 = polar(cx, cy, rOuter, a0);
  const o1 = polar(cx, cy, rOuter, a1);
  const i1 = polar(cx, cy, rInner, a1);
  const i0 = polar(cx, cy, rInner, a0);
  return [
    `M ${o0.x} ${o0.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o1.x} ${o1.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i0.x} ${i0.y}`,
    "Z",
  ].join(" ");
}

/** Deterministic sub-angles so repeated feelings in one family don't overdraw. */
export function fanAngles(centerDeg: number, spanDeg: number, count: number): number[] {
  if (count <= 1) return [centerDeg];
  const usable = spanDeg * 0.8;
  const step = usable / (count - 1);
  const start = centerDeg - usable / 2;
  return Array.from({ length: count }, (_, i) => start + i * step);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/geometry`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/geometry
git commit -m "feat(geometry): polar, arc path, sector, and deterministic fan angles"
```

---

## Task 9: Day glyph

**Files:**
- Create: `src/glyph/dayGlyph.ts`
- Test: `src/glyph/dayGlyph.test.ts`

**Interfaces:**
- Consumes: `Entry` (Task 6), `FAMILY_ANGLE` / `FAMILY_COLOR` / `CYCLE` (Task 3), `polar` / `fanAngles` (Task 8)
- Produces:
  - `interface Spoke { entryId: string; family: Family; angleDeg: number; lengthFrac: number }`
  - `spokesForDay(entries: Entry[]): Spoke[]`
  - `renderDayGlyph(entries: Entry[], size: number, theme: "light" | "dark"): SVGSVGElement`

Encoding per spec §7: angle = family, length = intensity, count = frequency.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { renderDayGlyph, spokesForDay } from "./dayGlyph";
import { FAMILY_ANGLE } from "../taxonomy/palette";
import type { Entry } from "../store/types";

const e = (over: Partial<Entry>): Entry => ({
  id: crypto.randomUUID(), ts: "2026-08-02T14:20:00.000Z",
  wordId: "anxious", path: ["scared", "anxious"], ring: 2,
  intensity: 3, trigger: "", note: "", ...over,
});

describe("spokesForDay", () => {
  it("returns no spokes for an empty day", () => {
    expect(spokesForDay([])).toEqual([]);
  });

  it("returns one spoke per entry", () => {
    expect(spokesForDay([e({}), e({}), e({})])).toHaveLength(3);
  });

  it("places a lone spoke at its family angle", () => {
    const [s] = spokesForDay([e({ path: ["mad", "hurt"] })]);
    expect(s!.angleDeg).toBe(FAMILY_ANGLE.mad);
  });

  it("fans multiple entries of one family to distinct angles", () => {
    const angles = spokesForDay([e({}), e({}), e({})]).map((s) => s.angleDeg);
    expect(new Set(angles).size).toBe(3);
  });

  it("keeps every spoke inside its 60-degree sector", () => {
    for (const s of spokesForDay([e({}), e({}), e({}), e({}), e({})])) {
      expect(Math.abs(s.angleDeg - FAMILY_ANGLE.scared)).toBeLessThanOrEqual(30);
    }
  });

  it("maps intensity monotonically to length, never zero", () => {
    const lens = ([1, 2, 3, 4, 5] as const).map(
      (i) => spokesForDay([e({ intensity: i })])[0]!.lengthFrac
    );
    expect(lens[0]).toBeGreaterThan(0);
    for (let i = 1; i < lens.length; i++) expect(lens[i]!).toBeGreaterThan(lens[i - 1]!);
  });

  it("derives family from path[0], not wordId", () => {
    const [s] = spokesForDay([e({ path: ["joyful", "excited"], wordId: "excited" })]);
    expect(s!.family).toBe("joyful");
  });
});

describe("renderDayGlyph", () => {
  it("renders a guide ring even with no entries", () => {
    const svg = renderDayGlyph([], 40, "light");
    expect(svg.querySelectorAll("circle").length).toBeGreaterThan(0);
    expect(svg.querySelectorAll("line")).toHaveLength(0);
  });

  it("renders one line per entry", () => {
    expect(renderDayGlyph([e({}), e({})], 40, "light").querySelectorAll("line")).toHaveLength(2);
  });

  it("thins the stroke on dense days", () => {
    const many = Array.from({ length: 9 }, () => e({}));
    const thin = renderDayGlyph(many, 40, "light").querySelector("line")!;
    const norm = renderDayGlyph([e({})], 40, "light").querySelector("line")!;
    expect(Number(thin.getAttribute("stroke-width")))
      .toBeLessThan(Number(norm.getAttribute("stroke-width")));
  });

  it("labels the glyph for screen readers", () => {
    const svg = renderDayGlyph([e({})], 40, "light");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toMatch(/1 entry/);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/glyph`
Expected: FAIL — `./dayGlyph` does not exist.

- [ ] **Step 3: Write `src/glyph/dayGlyph.ts`**

```ts
import { fanAngles, polar } from "../geometry/arc";
import { CYCLE, FAMILY_ANGLE, FAMILY_COLOR } from "../taxonomy/palette";
import type { Family } from "../taxonomy/types";
import type { Entry } from "../store/types";

export interface Spoke {
  entryId: string;
  family: Family;
  angleDeg: number;
  lengthFrac: number; // 0..1 of the usable radius
}

const SECTOR_SPAN = 60;
const MIN_FRAC = 0.35;

export function spokesForDay(entries: Entry[]): Spoke[] {
  const out: Spoke[] = [];
  for (const family of CYCLE) {
    const mine = entries.filter((e) => e.path[0] === family);
    if (mine.length === 0) continue;
    const angles = fanAngles(FAMILY_ANGLE[family], SECTOR_SPAN, mine.length);
    mine.forEach((e, i) => {
      out.push({
        entryId: e.id,
        family,
        angleDeg: angles[i]!,
        lengthFrac: MIN_FRAC + (e.intensity / 5) * (1 - MIN_FRAC),
      });
    });
  }
  return out;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderDayGlyph(
  entries: Entry[], size: number, theme: "light" | "dark"
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    entries.length === 0
      ? "No entries"
      : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`);

  const c = size / 2;
  const rHub = size * 0.08;
  const rMax = size * 0.44;

  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("cx", String(c));
  ring.setAttribute("cy", String(c));
  ring.setAttribute("r", String(rMax));
  ring.setAttribute("fill", "none");
  ring.setAttribute("stroke", "currentColor");
  ring.setAttribute("stroke-opacity", "0.14");
  ring.setAttribute("stroke-width", "1");
  svg.appendChild(ring);

  const spokes = spokesForDay(entries);
  const width = spokes.length > 8 ? 1.5 : 2;

  for (const s of spokes) {
    const a = polar(c, c, rHub, s.angleDeg);
    const b = polar(c, c, rHub + (rMax - rHub) * s.lengthFrac, s.angleDeg);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("stroke", FAMILY_COLOR[s.family][theme]);
    line.setAttribute("stroke-width", String(width));
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);
  }
  return svg;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/glyph`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/glyph
git commit -m "feat(glyph): radial day glyph — angle=family, length=intensity, count=frequency"
```

---

## Task 10: Review aggregations

**Files:**
- Create: `src/review/aggregate.ts`
- Test: `src/review/aggregate.test.ts`

**Interfaces:**
- Consumes: `Entry` (Task 6), `Family` / `CYCLE` (Tasks 2–3)
- Produces:
  - `byDay(entries: Entry[]): { date: string; entries: Entry[] }[]` — `date` is local `YYYY-MM-DD`, ascending
  - `familyRollup(entries: Entry[]): { family: Family; count: number; topWords: { wordId: string; count: number }[] }[]` — descending by count
  - `timeOfDay(entries: Entry[]): { hour: number; byFamily: Record<Family, number> }[]` — 24 rows, hour 0–23
  - `triggerBreakdown(entries: Entry[], minCount?: number): { trigger: string; total: number; feelings: { wordId: string; count: number }[] }[]`
  - `granularity(entries: Entry[]): { distinctWords: number; meanRing: number; total: number }`

All pure. No dates from `Date.now()`, no I/O.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { byDay, familyRollup, granularity, timeOfDay, triggerBreakdown } from "./aggregate";
import type { Entry } from "../store/types";

const e = (over: Partial<Entry>): Entry => ({
  id: crypto.randomUUID(), ts: "2026-08-02T14:20:00.000Z",
  wordId: "anxious", path: ["scared", "anxious"], ring: 2,
  intensity: 3, trigger: "", note: "", ...over,
});

describe("byDay", () => {
  it("returns [] for no entries", () => {
    expect(byDay([])).toEqual([]);
  });

  it("groups entries sharing a local date", () => {
    const g = byDay([e({ ts: "2026-08-02T01:00:00.000Z" }), e({ ts: "2026-08-02T23:00:00.000Z" })]);
    expect(g).toHaveLength(1);
    expect(g[0]!.entries).toHaveLength(2);
  });

  it("sorts days ascending", () => {
    const g = byDay([e({ ts: "2026-08-05T10:00:00.000Z" }), e({ ts: "2026-08-01T10:00:00.000Z" })]);
    expect(g[0]!.date < g[1]!.date).toBe(true);
  });
});

describe("familyRollup", () => {
  it("counts per family, descending", () => {
    const r = familyRollup([
      e({ path: ["mad", "hurt"] }), e({ path: ["mad", "hostile"] }),
      e({ path: ["sad", "lonely"] }),
    ]);
    expect(r[0]).toMatchObject({ family: "mad", count: 2 });
    expect(r[1]).toMatchObject({ family: "sad", count: 1 });
  });

  it("omits families with no entries", () => {
    expect(familyRollup([e({ path: ["mad", "hurt"] })])).toHaveLength(1);
  });

  it("lists top words inside a family", () => {
    const r = familyRollup([
      e({ path: ["mad", "hurt"], wordId: "hurt" }),
      e({ path: ["mad", "hurt"], wordId: "hurt" }),
      e({ path: ["mad", "angry"], wordId: "angry" }),
    ]);
    expect(r[0]!.topWords[0]).toEqual({ wordId: "hurt", count: 2 });
  });
});

describe("timeOfDay", () => {
  it("always returns 24 rows", () => {
    expect(timeOfDay([])).toHaveLength(24);
  });

  it("buckets an entry into its local hour", () => {
    const hour = new Date("2026-08-02T14:20:00.000Z").getHours();
    expect(timeOfDay([e({})])[hour]!.byFamily.scared).toBe(1);
  });
});

describe("triggerBreakdown", () => {
  it("hides triggers below the threshold", () => {
    expect(triggerBreakdown([e({ trigger: "standup" })], 5)).toEqual([]);
  });

  it("shows a trigger at the threshold with its feeling counts", () => {
    const five = Array.from({ length: 5 }, () => e({ trigger: "standup", wordId: "anxious" }));
    const r = triggerBreakdown(five, 5);
    expect(r[0]!.trigger).toBe("standup");
    expect(r[0]!.total).toBe(5);
    expect(r[0]!.feelings[0]).toEqual({ wordId: "anxious", count: 5 });
  });

  it("ignores empty triggers", () => {
    const five = Array.from({ length: 5 }, () => e({ trigger: "" }));
    expect(triggerBreakdown(five, 5)).toEqual([]);
  });

  it("treats triggers case-insensitively", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => e({ trigger: "Standup" })),
      ...Array.from({ length: 2 }, () => e({ trigger: "standup" })),
    ];
    expect(triggerBreakdown(rows, 5)[0]!.total).toBe(5);
  });
});

describe("granularity", () => {
  it("reports zeroes for no entries", () => {
    expect(granularity([])).toEqual({ distinctWords: 0, meanRing: 0, total: 0 });
  });

  it("counts distinct words and averages ring depth", () => {
    const r = granularity([
      e({ wordId: "anxious", ring: 2 }), e({ wordId: "anxious", ring: 2 }),
      e({ wordId: "hurt", ring: 4 }),
    ]);
    expect(r.distinctWords).toBe(2);
    expect(r.total).toBe(3);
    expect(r.meanRing).toBeCloseTo(8 / 3, 5);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/review`
Expected: FAIL — `./aggregate` does not exist.

- [ ] **Step 3: Write `src/review/aggregate.ts`**

```ts
import { CYCLE } from "../taxonomy/palette";
import type { Family } from "../taxonomy/types";
import type { Entry } from "../store/types";

const localDate = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const famOf = (e: Entry): Family => e.path[0] as Family;

function tally<T>(items: T[], key: (t: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return m;
}

export function byDay(entries: Entry[]): { date: string; entries: Entry[] }[] {
  const m = new Map<string, Entry[]>();
  for (const e of entries) {
    const d = localDate(e.ts);
    (m.get(d) ?? m.set(d, []).get(d)!).push(e);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, es]) => ({ date, entries: es }));
}

export function familyRollup(
  entries: Entry[]
): { family: Family; count: number; topWords: { wordId: string; count: number }[] }[] {
  const out: { family: Family; count: number; topWords: { wordId: string; count: number }[] }[] = [];
  for (const family of CYCLE) {
    const mine = entries.filter((e) => famOf(e) === family);
    if (mine.length === 0) continue;
    const topWords = [...tally(mine, (e) => e.wordId).entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([wordId, count]) => ({ wordId, count }));
    out.push({ family, count: mine.length, topWords });
  }
  return out.sort((a, b) => b.count - a.count);
}

export function timeOfDay(entries: Entry[]): { hour: number; byFamily: Record<Family, number> }[] {
  const rows = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    byFamily: Object.fromEntries(CYCLE.map((f) => [f, 0])) as Record<Family, number>,
  }));
  for (const e of entries) rows[new Date(e.ts).getHours()]!.byFamily[famOf(e)]++;
  return rows;
}

export function triggerBreakdown(
  entries: Entry[], minCount = 5
): { trigger: string; total: number; feelings: { wordId: string; count: number }[] }[] {
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const key = e.trigger.trim().toLowerCase();
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }
  return [...groups.entries()]
    .filter(([, es]) => es.length >= minCount)
    .map(([, es]) => ({
      trigger: es[0]!.trigger.trim(),
      total: es.length,
      feelings: [...tally(es, (e) => e.wordId).entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([wordId, count]) => ({ wordId, count })),
    }))
    .sort((a, b) => b.total - a.total);
}

export function granularity(
  entries: Entry[]
): { distinctWords: number; meanRing: number; total: number } {
  if (entries.length === 0) return { distinctWords: 0, meanRing: 0, total: 0 };
  return {
    distinctWords: new Set(entries.map((e) => e.wordId)).size,
    meanRing: entries.reduce((a, e) => a + e.ring, 0) / entries.length,
    total: entries.length,
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/review`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/review
git commit -m "feat(review): pure aggregations for day, family, hour, trigger, granularity"
```

---

## Task 11: The wheel control

**Files:**
- Create: `src/wheel/wheel.ts`, `src/styles/tokens.css`
- Test: `src/wheel/wheel.test.ts`

**Interfaces:**
- Consumes: `childrenOf` / `getNode` / `pathOf` (Tasks 2, 4), `FAMILY_COLOR` (Task 3), `arcPath` / `sectorForIndex` (Task 8)
- Produces:
  - `interface WheelOptions { onCommit: (nodeId: string) => void; size?: number; theme?: "light" | "dark" }`
  - `createWheel(opts: WheelOptions): { el: HTMLElement; focus(nodeId: string | null): void; current(): string | null }`

Behaviour per spec §5.2: **tapping a wedge descends; tapping the hub commits the current node.** At ring 4 (no children) tapping a wedge commits directly.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { createWheel } from "./wheel";

const wedges = (el: HTMLElement) => [...el.querySelectorAll<SVGPathElement>("[data-node-id]")];
const hub = (el: HTMLElement) => el.querySelector<SVGGElement>("[data-hub]")!;

describe("wheel", () => {
  it("starts on the six core families", () => {
    const { el } = createWheel({ onCommit: vi.fn() });
    expect(wedges(el)).toHaveLength(6);
  });

  it("has no committable node at the root", () => {
    const { current } = createWheel({ onCommit: vi.fn() });
    expect(current()).toBeNull();
  });

  it("descends when a wedge is tapped", () => {
    const { el } = createWheel({ onCommit: vi.fn() });
    wedges(el).find((w) => w.dataset.nodeId === "mad")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    expect(wedges(el)).toHaveLength(6);
    expect(wedges(el).every((w) => w.dataset.nodeId !== "mad")).toBe(true);
  });

  it("commits the current node when the hub is tapped", () => {
    const onCommit = vi.fn();
    const { el } = createWheel({ onCommit });
    wedges(el).find((w) => w.dataset.nodeId === "mad")!.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    hub(el).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith("mad");
  });

  it("does not commit from the hub at the root", () => {
    const onCommit = vi.fn();
    const { el } = createWheel({ onCommit });
    hub(el).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits directly when a childless wedge is tapped", () => {
    const onCommit = vi.fn();
    const { el, focus } = createWheel({ onCommit });
    focus("hurt");
    const leaf = wedges(el)[0]!;
    const id = leaf.dataset.nodeId!;
    leaf.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onCommit).toHaveBeenCalledWith(id);
  });

  it("renders a breadcrumb that walks back", () => {
    const { el, focus, current } = createWheel({ onCommit: vi.fn() });
    focus("hurt");
    const crumbs = [...el.querySelectorAll<HTMLElement>("[data-crumb-id]")];
    expect(crumbs.map((c) => c.dataset.crumbId)).toEqual(["mad", "hurt"]);
    crumbs[0]!.click();
    expect(current()).toBe("mad");
  });

  it("gives every wedge a focusable role and a label", () => {
    const { el } = createWheel({ onCommit: vi.fn() });
    for (const w of wedges(el)) {
      expect(w.getAttribute("role")).toBe("button");
      expect(w.getAttribute("tabindex")).toBe("0");
      expect(w.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("marks ring-4 wedges as extensions", () => {
    const { el, focus } = createWheel({ onCommit: vi.fn() });
    focus("embarrassed");
    for (const w of wedges(el)) expect(w.dataset.extension).toBe("true");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/wheel`
Expected: FAIL — `./wheel` does not exist.

- [ ] **Step 3: Implement `src/wheel/wheel.ts`**

Build to the test above. Required structure:

- Root `HTMLElement` containing a breadcrumb `<nav>` and an `<svg>`.
- Wedges are `<path data-node-id="…" role="button" tabindex="0" aria-label="…">`, filled with `FAMILY_COLOR[family][theme]`, laid out via `sectorForIndex(i, children.length)` and `arcPath`.
- Ring-4 wedges additionally carry `data-extension="true"`.
- The hub is a `<g data-hub>` holding a circle and the current node's label; it is `role="button"` and `tabindex="0"` only when `current() !== null`.
- `focus(nodeId)` sets the view to that node's children and rebuilds the breadcrumb from `pathOf(nodeId)`; `focus(null)` returns to the roots.
- Clicking a wedge with children calls `focus(id)`; clicking a childless wedge calls `onCommit(id)`.
- Clicking the hub calls `onCommit(current()!)` when a node is current.
- `Enter` and `Space` on a focused wedge or hub behave as a click.
- Transitions are CSS-driven and wrapped in `@media (prefers-reduced-motion: no-preference)`.

- [ ] **Step 4: Write `src/styles/tokens.css`**

Define `--surface-1`, `--text-primary`, `--text-secondary`, and `--family-{name}` for all six families, in three scopes: `:root`, `@media (prefers-color-scheme: dark) :root:where(:not([data-theme="light"]))`, and `:root[data-theme="dark"]`. Family values come from `FAMILY_COLOR` in Task 3. Add a visible `:focus-visible` outline for `[data-node-id]` and `[data-hub]`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/wheel`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/wheel src/styles
git commit -m "feat(wheel): zooming radial capture control, hub commits and wedges descend"
```

---

## Task 12: Capture screen and detail form

**Files:**
- Create: `src/app/screens/capture.ts`, `src/app/screens/detail.ts`
- Test: `src/app/screens/detail.test.ts`

**Interfaces:**
- Consumes: `createWheel` (Task 11), `putEntry` / `triggerSuggestions` / `recentWordIds` (Task 6), `pathOf` / `getNode` / `searchWords` (Tasks 2, 5)
- Produces:
  - `renderCapture(root: HTMLElement): void`
  - `buildEntry(nodeId: string, intensity: Intensity, trigger: string, note: string, now?: Date): Entry`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { buildEntry } from "./detail";

describe("buildEntry", () => {
  it("denormalizes the full path", () => {
    expect(buildEntry("embarrassed", 3, "", "").path).toEqual(["mad", "hurt", "embarrassed"]);
  });

  it("records the ring the user stopped at", () => {
    expect(buildEntry("mad", 2, "", "").ring).toBe(1);
    expect(buildEntry("embarrassed", 2, "", "").ring).toBe(3);
  });

  it("trims the trigger but keeps the note verbatim", () => {
    const e = buildEntry("mad", 3, "  standup  ", "  spaced  ");
    expect(e.trigger).toBe("standup");
    expect(e.note).toBe("  spaced  ");
  });

  it("stamps an ISO timestamp from the supplied clock", () => {
    expect(buildEntry("mad", 3, "", "", new Date("2026-08-02T14:20:00Z")).ts)
      .toBe("2026-08-02T14:20:00.000Z");
  });

  it("gives every entry a unique id", () => {
    expect(buildEntry("mad", 3, "", "").id).not.toBe(buildEntry("mad", 3, "", "").id);
  });

  it("throws on an unknown word id", () => {
    expect(() => buildEntry("not-a-feeling", 3, "", "")).toThrow(/unknown/i);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/app`
Expected: FAIL — `./detail` does not exist.

- [ ] **Step 3: Write `buildEntry` in `src/app/screens/detail.ts`**

```ts
import { getNode, pathOf } from "../../taxonomy/index";
import type { Entry, Intensity } from "../../store/types";

export function buildEntry(
  nodeId: string, intensity: Intensity, trigger: string, note: string, now = new Date()
): Entry {
  const node = getNode(nodeId);
  if (!node) throw new Error(`Unknown feeling: ${nodeId}`);
  return {
    id: crypto.randomUUID(),
    ts: now.toISOString(),
    wordId: nodeId,
    path: pathOf(nodeId),
    ring: node.ring,
    intensity,
    trigger: trigger.trim(),
    note,
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/app`
Expected: PASS, 6 tests.

- [ ] **Step 5: Build the detail form UI in the same file**

A single screen showing the committed word (with its family color and, for ring 4, its citation), a 1–5 intensity control, a trigger input backed by `triggerSuggestions`, an optional note textarea, and Save. Save calls `putEntry(buildEntry(...))` and returns to capture. The intensity control must be operable by keyboard.

- [ ] **Step 6: Build the capture screen**

`renderCapture` mounts `createWheel({ onCommit })` where `onCommit` opens the detail form. Above the wheel: a search input driving `searchWords` (selecting a result commits it directly), and a row of chips from `recentWordIds(6)` (tapping a chip commits it directly).

- [ ] **Step 7: Manually verify the 10-second target**

Run `npm run dev`, open the app, and log a feeling. Time it. If it exceeds 10 seconds with a known word, the escape hatches are in the wrong place.

- [ ] **Step 8: Commit**

```bash
git add src/app
git commit -m "feat(app): capture screen with wheel, search, recents, and detail form"
```

---

## Task 13: Month view and review screens

**Files:**
- Create: `src/app/screens/month.ts`, `src/app/screens/review.ts`, `src/app/router.ts`
- Test: `src/app/screens/month.test.ts`

**Interfaces:**
- Consumes: `renderDayGlyph` (Task 9), all of `review/aggregate` (Task 10), `entriesBetween` (Task 6)
- Produces:
  - `monthGrid(year: number, month: number, entries: Entry[]): { date: string; entries: Entry[]; inMonth: boolean }[]`
  - `renderMonth(root: HTMLElement, year: number, month: number): Promise<void>`
  - `renderReview(root: HTMLElement): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { monthGrid } from "./month";
import type { Entry } from "../../store/types";

const e = (ts: string): Entry => ({
  id: crypto.randomUUID(), ts, wordId: "anxious", path: ["scared", "anxious"],
  ring: 2, intensity: 3, trigger: "", note: "",
});

describe("monthGrid", () => {
  it("returns whole weeks", () => {
    expect(monthGrid(2026, 8, []).length % 7).toBe(0);
  });

  it("marks leading and trailing days as out of month", () => {
    const g = monthGrid(2026, 8, []);
    expect(g.some((c) => !c.inMonth)).toBe(true);
    expect(g.filter((c) => c.inMonth)).toHaveLength(31);
  });

  it("attaches entries to their day", () => {
    const g = monthGrid(2026, 8, [e("2026-08-02T14:20:00.000Z")]);
    expect(g.find((c) => c.date === "2026-08-02")!.entries).toHaveLength(1);
  });

  it("leaves days with no entries empty", () => {
    expect(monthGrid(2026, 8, []).every((c) => c.entries.length === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/app/screens/month.test.ts`
Expected: FAIL — `./month` does not exist.

- [ ] **Step 3: Implement `monthGrid`, then the screens**

`monthGrid` pads to whole weeks from Monday. `renderMonth` renders one `renderDayGlyph` per cell, plus a key glyph above the grid showing the six family positions (this is the legend — do not repeat it per cell), and a table view toggle listing the same data. Tapping a day opens its entries with exact values.

`renderReview` renders, in order: family rollup with a 7/30/90-day range control; time of day; trigger breakdown; granularity. Each view below its threshold renders the count of entries still needed instead of a chart — never an empty chart, never a fabricated insight.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/app/screens/month.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "feat(app): month grid of day glyphs and the review screens"
```

---

## Task 14: List-mode accessibility fallback

**Files:**
- Create: `src/app/screens/listMode.ts`
- Test: `src/app/screens/listMode.test.ts`

**Interfaces:**
- Consumes: `childrenOf` / `pathOf` (Task 2), `buildEntry` (Task 12)
- Produces: `renderListMode(root: HTMLElement, onCommit: (nodeId: string) => void): void`

A complete parallel navigation over the identical tree — not a degraded one. A radial control is hostile to screen readers; this is the equal path, reachable from the capture screen and announced.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { renderListMode } from "./listMode";

describe("list mode", () => {
  it("lists the six families as a tree", () => {
    const root = document.createElement("div");
    renderListMode(root, vi.fn());
    expect(root.querySelector("[role=tree]")).toBeTruthy();
    expect(root.querySelectorAll("[role=treeitem]")).toHaveLength(6);
  });

  it("expands a family to its children", () => {
    const root = document.createElement("div");
    renderListMode(root, vi.fn());
    const mad = [...root.querySelectorAll<HTMLElement>("[role=treeitem]")]
      .find((i) => i.dataset.nodeId === "mad")!;
    mad.click();
    expect(mad.getAttribute("aria-expanded")).toBe("true");
    expect(root.querySelectorAll("[role=treeitem]").length).toBeGreaterThan(6);
  });

  it("offers a log action at every level", () => {
    const onCommit = vi.fn();
    const root = document.createElement("div");
    renderListMode(root, onCommit);
    root.querySelector<HTMLElement>("[data-log-id=mad]")!.click();
    expect(onCommit).toHaveBeenCalledWith("mad");
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/app/screens/listMode.test.ts`
Expected: FAIL — `./listMode` does not exist.

- [ ] **Step 3: Implement `renderListMode`**

An ARIA `tree` with `treeitem` rows. Each row carries the word, its family swatch, an expand toggle when it has children, and a "Log this" button (`data-log-id`) so stopping at any level works here too. Ring-4 rows show their citation inline rather than on long-press.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/app/screens/listMode.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "feat(a11y): full list-mode navigation as an equal path to the wheel"
```

---

## Task 15: PWA shell, export UI, and install

**Files:**
- Modify: `vite.config.ts`, `index.html`
- Create: `src/app/screens/settings.ts`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`

**Interfaces:**
- Consumes: `allEntries` (Task 6), `exportJson` / `exportCsv` / `parseJson` / `importEntries` (Task 7)
- Produces: a build that installs to the iOS home screen and runs offline

- [ ] **Step 1: Add the PWA plugin to `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Feeling Wheel",
        short_name: "Feelings",
        display: "standalone",
        background_color: "#fcfcfb",
        theme_color: "#fcfcfb",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,png,svg}"] },
    }),
  ],
  test: { globals: true, environment: "jsdom" },
});
```

- [ ] **Step 2: Add the iOS meta tags to `index.html`**

```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

- [ ] **Step 3: Build the settings screen**

Export JSON and Export CSV buttons, each triggering a Blob download named `feeling-wheel-YYYY-MM-DD.json` / `.csv`. An Import control accepting a JSON file, reporting `"Added N, skipped M already present."` on success and the thrown message on failure. Per spec §8.1, export is a top-level action on this screen, not nested.

- [ ] **Step 4: Add the export nudge**

If entry count is a multiple of 50 and no export has happened since the last multiple, show a dismissible line on the month screen: `"N entries and no backup yet. Export"`. Store `lastExportAt` in `localStorage`.

- [ ] **Step 5: Verify offline operation**

```bash
npm run build && npm run preview
```

Open the preview, load once, then stop the server and reload. Expected: the app still opens and prior entries are still listed.

- [ ] **Step 6: Verify installation on iOS**

Serve the build on the LAN, open it in iOS Safari, Add to Home Screen, launch from the icon. Expected: no Safari chrome, correct icon, entries persist across launches.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(pwa): manifest, service worker, ios install, and export/import UI"
```

---

## Task 16: Full-suite verification

**Files:** none

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: PASS. Tally: 7 (taxonomy) + 4 (palette) + 5 (extension) + 5 (search) + 7 (store) + 6 (transfer) + 9 (geometry) + 11 (glyph) + 13 (review) + 9 (wheel) + 6 (detail) + 4 (month) + 3 (list mode) = 89 tests.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Re-validate the palette against the shipped constants**

Run the dataviz validator against the six light hexes and the six dark hexes in cyclic order, closing the cycle. Expected: no FAIL on the adjacent pairlist in either mode.

- [ ] **Step 4: Render and look at it**

Open the month view with at least 30 days of varied entries. Check: glyphs legible at true size, no label collisions, no horizontal page scroll, focus rings visible on wheel wedges, both themes correct. This is the check the validator cannot do.

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore: full-suite verification pass"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3.1 Willcox spine | 2 |
| §3.2 Ring-4 extension + provenance | 4, 11 (extension marking), 14 (citations in list mode) |
| §4 Data model | 6, 12 (`buildEntry` sets `path` and `ring`) |
| §5.1 Zooming wheel | 11 |
| §5.2 Hub commits / wedges descend | 11 |
| §5.3 Detail screen | 12 |
| §5.4 Search + recents | 5, 12 |
| §6.1 Month view | 13 |
| §6.2 Family rollup | 10, 13 |
| §6.3 Time of day | 10, 13 |
| §6.4 Trigger → feeling | 10, 13 |
| §6.5 Granularity | 10, 13 |
| §7 Day glyph encoding | 9 |
| §7.2 Valence rotation | 3 |
| §7.4 Color + legend | 3, 13 |
| §8 Architecture | 1, and the module split throughout |
| §8.1 Storage durability / export | 7, 15 |
| §9 Accessibility | 11 (focus, labels), 9 (aria-label), 13 (table view), 14 (list mode) |

No spec section is unimplemented.

**Placeholder scan:** Two files are authored rather than transcribed here — `willcox.ts` (Task 2 Step 4) and `extension.ts` (Task 4 Step 3). Both are *content* transcription from cited sources, not logic, and both are gated by tests that fail if the content is wrong shape or wrong count. The `mad` family is given in full as the format specimen. Task 4 additionally routes the vocabulary through review before the work continues.

**Type consistency:** `Entry`, `Family`, `Ring`, `Source`, `Intensity`, `WordNode`, and `Spoke` are each defined once and imported everywhere else. `childrenOf`, `pathOf`, `getNode`, `searchWords`, `putEntry`, `allEntries`, `spokesForDay`, `renderDayGlyph`, `buildEntry`, and the five aggregation functions keep identical names and signatures across every task that references them.
