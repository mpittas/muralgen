# MuralGen

Plan wall murals end to end: upload a photo of the wall, generate artwork with AI, pick a
winner, then preview it on the real wall in perspective — with masking, blending, a paint plan
and a transfer grid.

**Status: frontend only.** Everything runs in the browser (localStorage + IndexedDB). The Firebase
backend comes next; the seams for it are listed below.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint
```

Node 20+ (developed on 22). Next.js 16 (App Router, Turbopack), React 19, Tailwind 4, shadcn/ui (Radix),
zustand, idb-keyval.

New here? Open the app and click **Explore a sample project**: it creates a project with a procedural
brick wall and two sample designs, so you can try the studio without any uploads or AI calls.

## The workflow (one route per step)

| Route | What it does |
| --- | --- |
| `/` · `/starred` · `/archived` | Projects dashboard: search, status filter, sort, grid/list, star, archive, delete |
| `/projects/[id]` | Overview: details, 5-step workflow checklist, recent designs, notes |
| `…/walls` | Upload wall photos; set real size (m), surface and notes |
| `…/generate` | Prompt + style (12) + palette (8) + aspect + count; background queue with live progress |
| `…/designs` | Library: favourites, upload your own art, side-by-side compare, **choose** the winner |
| `…/studio` | Editor: corner-pin perspective, brush/lasso mask, blend modes, colour, wall-texture, before/after |
| `…/results` | Before/after slider, **paint plan** (palette → spray cans), **transfer grid**, download, duplicate |
| `/settings` | Theme, image providers, local data |

Studio shortcuts: `V` place · `E` erase · `B` restore · `L` lasso · `H`/`Space` pan · `[` `]` brush size ·
`C` before/after · hold `\` to peek at the original · `Ctrl+Z` / `Ctrl+Shift+Z` undo/redo.
Compositions autosave (mask + settings + a rendered preview).

## Code map

```
src/
  app/(app)/…            routes (thin server pages -> client feature components)
  features/<step>/       one folder per workflow step (walls, generate, designs, studio, results, …)
  components/            shell (sidebar, project header), shared UI, shadcn in components/ui
  store/app-store.ts     ALL data mutations: projects, walls, designs, composites (zustand + persist)
  lib/blob-store.ts      image storage (IndexedDB) behind put/get/deleteBlob
  lib/providers/         image-generation providers behind one interface
  lib/generation-queue.ts  background queue (survives navigation), per-provider concurrency + pacing
  lib/studio/render.ts   perspective warp + compositor + mask helpers (pure canvas code)
  lib/presets.ts         styles, palettes, prompt builder
```

### Where Firebase plugs in

* `store/app-store.ts` → Firestore. Entities in `lib/types.ts` map 1:1 to documents; every UI
  mutation already goes through the store's actions, so only that file changes.
* `lib/blob-store.ts` → Cloud Storage. Same `putBlob / getBlob / deleteBlob` surface; `imageId`,
  `thumbId`, `maskId` become storage keys.
* `lib/providers/*` → move provider calls behind Cloud Functions / route handlers so API keys stay
  server-side, then add keyed providers (OpenAI, Imagen/Gemini, Replicate, Stability — already listed
  as "coming soon" in `lib/providers/index.ts`).
* Auth + per-user projects: add an `ownerId` to `Project` and scope the store's selectors by it.

## Image generators (free, for now)

There is **no fully reliable free, keyless image API callable from a browser** right now. What was
verified in Oct 2026 and what the app does about it:

| Provider | Status |
| --- | --- |
| **FLUX.1 schnell** (official Hugging Face demo Space) — default | ~10 s, great quality, CORS-enabled, no key. Shared ZeroGPU demo: anonymous use is limited to a **few images per day per connection**; when exhausted the Space answers `event: error / data: null`, the provider throws `ProviderUnavailableError` and the queue (`lib/generation-queue.ts`) moves the job to its `fallbackProviderId` (AI Horde) and skips FLUX for 30 min. |
| **AI Horde** (community GPUs) — fallback | Unlimited and keyless (you can add a free personal key in Settings for priority), but the anonymous queue is volatile: from ~10 s to 50+ min (800+ jobs ahead at peak, for every model). Auto mode ignores models whose worker has `performance` 0 and, if a job is stuck far back after a couple of polls, resubmits it to another model group. Results come back as base64 (the R2 links aren't CORS-readable). Results come back as base64 (the R2 links aren't CORS-readable). |
| **Pollinations** — parked | Works from curl, but browser requests get `403 Missing Turnstile token` (Cloudflare bot check) unless you use an API key. Kept in `lib/providers/pollinations.ts` for the backend phase (`private`/`nologo` are paid; the free tier stamps a logo). |

Adding a provider = implement `ImageProvider` (`lib/providers/types.ts`) and register it in
`lib/providers/index.ts`. The generate page, queue and settings read everything from that object.

Prompt wording matters: models latch onto words, not negations. "mural", "wall", "street", "spray" make
them paint a photographed wall, so presets describe the *artwork itself* ("flat vector poster artwork,
edge-to-edge"). See `lib/presets.ts`.

## How "apply the design to the wall" works today

No server and no AI needed: `lib/studio/render.ts` warps the artwork into a four-point quad with a
projective homography (mesh-subdivided triangles on a 2D canvas), applies colour adjustments, a painted
alpha mask (with feather), a blend mode, and mixes the wall's own light back on top with a soft-light
texture pass. Edit at ≤1600 px, autosave at ≤2048 px, export up to 4096 px.

The inspector already reserves a slot for **AI harmonise** (relight + inpaint using your mask) — that's
the natural first backend feature, since inpainting needs a GPU model and the wall photo as input.

## Ideas worth building next

* **Backend**: auth, Firestore/Storage sync, keyed providers, signed share links for clients.
* **AI harmonise / inpaint** on the wall photo using the mask (OpenAI image edits, Replicate, Stability).
* **Image-to-image** from the wall photo or a rough sketch (ControlNet) so designs follow the real geometry.
* **Client sharing**: a read-only presentation page with the before/after and a comment/approve button.
* **Upscale** chosen designs; **vectorise** for stencil work.
* **Grid projector mode** on mobile for painters on site; export the transfer grid as a PDF.
* **Multiple walls per design** (a mural that wraps a corner) and **scale reference** (a person/door for scale).
* Real colour matching: map the palette to spray-paint brand codes (Montana, Molotow…).

## Known limitations

* Data lives in this browser only (clearing site data deletes it) — Settings has "Delete all local data".
* HEIC photos aren't decoded by browsers; convert to JPEG first.
* The studio uses `ctx.filter` (blur / colour) which Safari only supports in recent versions.
* The free generators are best-effort (see above).
