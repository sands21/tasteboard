# tasteboard

A little place to save the design that catches your eye — and, more importantly, to write down *why* it did.

Screenshot a website, a portfolio, a typeface, a layout — anything you'd otherwise lose in a Downloads folder full of `Screenshot 2026-06-13 at 4.42.png`. Paste it in, jot a quick note about what you'd steal from it, and move on. Six months later you scroll back through and start noticing what you actually keep reaching for. That's the whole idea. The note is the product; everything else is just a nice wall to hang it on.

## v1, and what that means

This is **v1** — deliberately small. It does the core loop well and not much else:

- **paste anywhere** (`⌘V`), drag-and-drop, or hit `add` — a screenshot, or a URL (it'll grab the page's preview image and title for you)
- a calm masonry **grid** that reveals your note on hover
- a **lightbox** you can flip through with `←` / `→`, zoom into, and edit notes inline
- **search** your notes with `/`
- **export / import** the whole thing as a zip (your backup, and the bridge between localhost and the deployed site)
- a **sample board** you can load to try it without saving anything of your own

It's **local-first**: everything lives in your own browser (IndexedDB). No accounts, no server holding your data, nothing synced anywhere. The only backend is a tiny route that fetches link previews. Flip side: your board is per-browser, and "clear site data" wipes it — so export every now and then. (That's what export is for.)

### coming later (no promises on timing)

tags & collections · highlighting regions of a screenshot · some way to see your taste patterns over time · maybe a browser extension · a public showcase, eventually. A bunch of things are intentionally *not* here yet — that's the point of v1.

## running it locally

```bash
npm install
npm run dev
```

Then open [localhost:3000](http://localhost:3000). That's it — no env vars, no database to spin up.

```bash
npm run build   # production build
npm run start   # serve the production build
```

## the stack

Next.js (App Router) + TypeScript + Tailwind, Dexie for IndexedDB, Framer Motion for the (sparing) animations, JSZip for export/import. Deploys to Vercel.

## want to contribute?

Yeah, please. This is a personal project but I'm happy to have company.

- Found a bug or have an idea? **Open an issue** — even a half-formed one is fine.
- Want to build something? **Open a PR.** Small, focused changes are the easiest to merge. If it's a bigger feature, maybe open an issue first so we can chat before you sink time into it.
- A couple of things worth knowing before you dive in:
  - The guiding principle is *does this help me capture inspiration or understand my taste?*
  - Keep the chrome quiet. The app is a gallery wall — the saved work is the art, the UI should get out of the way. There's a small, fixed palette and two typefaces; match what's already there rather than introducing new ones.

No CLA, no big process. Be kind in reviews, keep it simple, and we're good.

## license

MIT — do what you like with it.
