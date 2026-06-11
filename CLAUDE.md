# Tasteboard

A personal design taste tracker. Capture visual inspiration (screenshots of websites, portfolios, typography, layouts), record *why* it resonated, and revisit the collection to discover taste patterns over time.

**Architecture stance: local-first.** The owner's collection lives in their browser's IndexedDB. The deployed site self-demonstrates via a **demo seed**: visitors load a sample board into their own browser and use the full productgit . There is no database server and no auth.

**Guiding principle:** Don't build the perfect inspiration manager. Build the smallest tool that helps me save something today and understand my taste better six months from now. For every feature decision ask: *does this help me capture inspiration or understand my taste?* If no, it doesn't belong in V1.

The note ("why I saved this") is the product. Everything else is a gallery around it.

## Scope — V1 only

**In scope:** capture sheet, masonry grid, detail lightbox, simple search, export/import, demo seed.

**Explicitly NOT in V1** (do not build, do not scaffold for, do not suggest):
AI categorization, palette extraction, typography detection, browser extension, authentication, hosted database, sync, collaboration, analytics, region highlighting, tags, collections, dark mode, public showcase of the owner's collection (gallery page or otherwise — undecided, parked for later).

(Do NOT use Supabase in any future iteration either — it is blocked in India as of Feb 2026. If a hosted DB is ever needed, the planned path is Neon Postgres + Vercel Blob within the existing Vercel account.)

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Dexie.js for IndexedDB (use `useLiveQuery` for reactive grid updates)
- Framer Motion (sparingly — see Motion)
- nanoid for IDs, JSZip for export/import
- Deploy target: Vercel

## Architecture: local-first

All user data (records + image blobs) lives in IndexedDB in the visitor's own browser. Every visitor effectively gets a private installation; nobody's data is ever shared or sent anywhere. Exactly one server-side piece exists:

- `/api/metadata?url=...` — a route handler that fetches a page server-side (CORS workaround) and returns `{ title, ogImage }` parsed from its meta tags. Stateless. Set a timeout (~5s) and fail gracefully — a failed metadata fetch must never block a save.

On first load, call `navigator.storage.persist()` to request persistent storage.

**Known caveats (accepted):** data is per-browser and per-origin (localhost and the deployed domain are separate databases — export/import is the bridge); "clear site data" deletes everything, so export regularly.

## Data model

```ts
interface Inspiration {
  id: string;          // nanoid
  createdAt: number;   // epoch ms
  note: string;        // REQUIRED — "why I saved this"
  url?: string;
  title?: string;
  image: Blob;         // original screenshot, stored AS-IS, never recompressed
  thumb: Blob;         // ~600px-wide WebP @ ~0.8 quality, generated via canvas at save time
  width: number;       // thumb dimensions — used to reserve masonry space
  height: number;      //   before image load (zero layout shift)
}
```

- Grid renders **thumbs only**. Lightbox loads the full-res `image` blob (thumb shows instantly, full-res swaps in — imperceptible since it's a local disk read).
- The original is the archive; the thumb is disposable.
- Dexie schema: index on `createdAt`. Search is an in-memory case-insensitive substring filter on `note` + `title` — no search library.

## Features

### Capture flow

Target: **under 10 seconds from screenshot to saved.**

Entry points (all open the same capture sheet):
1. **Paste anywhere** on the board (global paste listener). Clipboard image → sheet opens with screenshot pre-filled. Clipboard URL text → sheet opens with URL pre-filled; fetch `/api/metadata` in the background and show the `og:image` in the preview slot, `og:title` in the title field.
2. **Drag-and-drop** an image file onto the grid.
3. **"Add" button** + `N` hotkey.

The capture sheet (modal):
- Screenshot preview at top — the hero. No "upload" button in the happy path.
- **"Why I saved this" textarea is autofocused** the moment the sheet opens. Rotating placeholder prompts: "What caught your eye first?", "What would you steal from this?".
- Note is **required**: any non-empty text passes, no minimum length. Disable the Save button when empty rather than showing an error.
- URL + title below, visually quiet, optional.
- `Cmd+Enter` saves. `Esc` discards. On save, the card visibly animates into its place in the grid (a settle, not confetti).

### Browse grid

- Masonry via **JS column balancing**: distribute items into N column arrays, always appending to the shortest column. Do NOT use CSS `columns` (scrambles chronological order). 3 columns default, 4 on wide screens.
- Cards are **pure image** — no titles, no metadata chrome, no border. 10px radius, 24px+ gutters. A 1px hairline border appears on hover only (handles near-white screenshots melting into the background).
- **Hover reveals the note**, not the title: a quiet overlay fades in at the bottom of the card showing the "why".
- Sort: newest first, no options. Lazy-load thumbs with an intersection observer.
- **Search**: single input, top of page, focus with `/`. Filters the grid live as you type — no results page; the grid just thins.
- **Empty state is the onboarding** (there is no other onboarding): centered, calm, in Instrument Serif — "Screenshot something you love, then paste it here. ⌘V anywhere." — plus a quiet secondary action: "just browsing? load a sample board" (the demo seed).

### Detail lightbox

Opens on card click; an overlay, not a route.
- Screenshot large on the left (~70%), metadata column on the right.
- Right column order: **note** (the headline — Instrument Serif italic, 19px), then URL as a quiet link out, then date.
- Date is **relative** ("Saved 4 months ago"); exact date on hover/title attribute.
- Open with the thumb instantly, swap in the full-res blob from IndexedDB when loaded.
- **Click the image to zoom** full-res (fit-to-screen, click again for 100%, drag to pan). The URL link handles visiting the source — the image never navigates.
- **←/→ navigate between items without closing.** `Esc` closes. This flipbook flow is the core "pleasant to revisit" feature.
- **Note is editable in place**: click → textarea, blur saves.
- Delete: small quiet control at the bottom of the column. No confirm dialog — show a brief undo toast instead.

### Demo seed

- 15–20 curated inspirations bundled with the app: images in `/public/demo/`, records in `lib/demo-data.json`.
- "Load sample board" inserts them into the visitor's IndexedDB through the normal save path (generating thumbs as usual), with a subtle dismissible "demo data" notice and a one-click "clear demo" action.
- Purpose: the deployed app self-demonstrates with zero signup — visitors use the real product, not screenshots of it.

### Export / import (build in week one, not later)

- Export: zip containing all original images + `data.json` (all records, image filenames referenced). Client-side via JSZip.
- Import: restore from that zip.
- Export is the backup story, the localhost→production data bridge, and the seed for any future migration or showcase.

## Design system — "Gallery"

The content is other people's design work; the UI is the gallery wall. Chrome must recede.

### Color tokens (the complete palette — do not add colors)

| Token        | Hex       | Use |
|--------------|-----------|-----|
| paper        | `#FAF9F5` | page background |
| surface      | `#FFFFFF` | cards, sheet, lightbox panel |
| ink          | `#1C1B18` | primary text, text on rose surfaces |
| muted        | `#6F6A60` | dates, URLs, hints, placeholders |
| hairline     | `#E9E5DC` | 1px borders (used instead of shadows) |
| rose-surface | `#F6CFD6` | button fills, hover washes, selection |
| rose-ink     | `#BE4B66` | links, focus rings |

Accent usage is rare and deliberate: rose-surface buttons always use **ink** text (never white). Links and focus rings use rose-ink.

### Typography

- **Instrument Serif** (italic) — notes, the wordmark, empty states ONLY. It ships in one weight and is delicate; it is the special-occasion voice. Never use it for UI labels, buttons, or metadata.
- **Geist** — all UI: labels, buttons, search, dates, microcopy.
- Both via Google Fonts (`next/font/google`).
- Scale: 14px UI, 13px metadata, 19px notes in lightbox, ~28px empty state / display moments.

### Surfaces, depth, motion

- Shadows: almost none. Hairline borders do separation. Exceptions: the capture sheet and lightbox get one soft, large, low-opacity shadow to lift off the dimmed page.
- Radius: 10px on cards and images, 8px on inputs/buttons.
- Motion: 180–220ms, ease-out, `opacity`/`transform` only. The three sanctioned animations: card settling into the grid on save, hover-note fade, lightbox scale-in from the clicked card's position. Nothing bounces or springs.
- Microcopy: lowercase, calm, brief Geist — "search your taste", "paste something you love". The serif is reserved for the user's own words.

## Conventions

- Project root: `~/Projects/tasteboard/`
- Small, incremental commits with clear messages; commit at each working milestone.
- **All Dexie calls live inside `lib/db.ts`** (`saveInspiration`, `getAll`, `searchInspirations`, ...) — components never touch Dexie directly. This file is the single seam for any future storage migration (Neon + Vercel Blob if ever needed).
- Components in `components/`, image/thumb helpers in `lib/images.ts`, demo seed in `lib/demo-data.json`.
- Grid and lightbox components receive their data as props — they never import Dexie directly. Keeps any future data source (showcase, hosted DB) a cheap swap.
- TypeScript strict mode. No `any`.
- When unsure whether to add something, re-read the guiding principle at the top of this file. Default to no.

## Build order

1. Scaffold: Next.js + Tailwind + fonts + design tokens; Dexie schema in `lib/db.ts`; `storage.persist()`
2. Capture sheet with paste/drag/hotkey entry, thumb generation, mandatory note, save
3. Masonry grid with column balancing, lazy thumbs, hover notes, empty state
4. `/api/metadata` route + URL-paste flow
5. Detail lightbox: layout, arrow navigation, full-res swap, zoom, edit-in-place note, delete + undo
6. Search
7. Export / import
8. Demo seed + empty-state "load sample board"
9. Polish pass: motion timing, focus states, edge cases (huge images, failed metadata, clipboard without image)

## Roadmap context (do not build now)

V1.5 tags/collections · V2 region highlighting · V3 taste analytics · V4 browser extension · V5 AI insights · Public showcase of the owner's collection: approach undecided (static gallery vs hosted board), revisit after V1 · Live hosted board if ever needed: Neon Postgres + Vercel Blob (NOT Supabase — India block), migrating via the export format through the `lib/db.ts` seam.