# MuralGen

Plan wall murals end to end: upload a photo of the wall, generate artwork with AI, pick a
winner, then preview it on the real wall in perspective — with masking, blending, a paint plan
and a transfer grid.

**Status:** Next.js frontend + Firebase backend (Auth, Firestore, Cloud Storage, Cloud Functions).
Users sign in with Google or email/password; each user's projects live in Firestore and their
images in Cloud Storage, so everything follows them across devices.

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
| `/settings` | Theme, image providers (OpenAI quality), your data |
| `/login` · `/profile` | Sign in / create account (Google or email); edit name, sign out, delete data or account |

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

## Firebase backend

| Piece | Where | Notes |
| --- | --- | --- |
| Auth | `lib/firebase/auth.ts`, `components/auth-provider.tsx`, `/login`, `/profile` | Google + email/password. `AuthGate` in `app/(app)/layout.tsx` redirects signed-out users. |
| Metadata | `lib/firebase/sync.ts` | The zustand store (`store/app-store.ts`) stays the UI's working copy. `sync.ts` mirrors it to `users/{uid}/{projects,walls,designs,composites}` (debounced diff) and applies remote snapshots. Offline cache on; conflicts are last-write-wins per document. |
| Images | `lib/blob-store.ts` | IndexedDB per-user cache + Cloud Storage `users/{uid}/blobs/{id}`. Uploads are queued and retried on the next sign-in. |
| Rules | `firestore.rules`, `storage.rules` | Everything is owner-only; Storage accepts images up to 25 MB. |
| Paid AI | `functions/index.js` | `generateImage` callable holds the OpenAI key as a secret, requires sign-in and enforces a daily per-user image cap (`usage/*`, server-only). |
| Old local data | `lib/firebase/migrate.ts` | On first sign-in a banner offers to import projects saved in this browser before accounts existed. |

### Setup (once)

1. Create a Firebase project and a Web app; copy `.env.example` to `.env.local` and fill in the config.
2. Console → Authentication → Get started → enable **Google** and **Email/Password**.
3. Console → Storage → Get started (Cloud Storage and Functions need the **Blaze** plan).
4. `firebase deploy --only firestore,storage` (rules + indexes).
5. For OpenAI: `firebase functions:secrets:set OPENAI_API_KEY` (paste the key at the prompt), then
   `firebase deploy --only functions`. Set a monthly budget on the OpenAI project too.

The Firebase web config in `.env.local` is not a secret (access is enforced by the rules), but the file is
git-ignored; `.env.example` documents the variables.

## Image generators (free, for now)

There is **no fully reliable free, keyless image API callable from a browser** right now. What was
verified in Oct 2026 and what the app does about it:

| Provider | Status |
| --- | --- |
| **FLUX.1 schnell** (official Hugging Face demo Space) — default | ~10 s, great quality, CORS-enabled, no key. Shared ZeroGPU demo: anonymous use is limited to a **few images per day per connection**; when exhausted the Space answers `event: error / data: null`, the provider throws `ProviderUnavailableError` and the queue (`lib/generation-queue.ts`) moves the job to its `fallbackProviderId` (AI Horde) and skips FLUX for 30 min. |
| **AI Horde** (community GPUs) — fallback | Unlimited and keyless (you can add a free personal key in Settings for priority), but the anonymous queue is volatile: from ~10 s to 50+ min (800+ jobs ahead at peak, for every model). Auto mode ignores models whose worker has `performance` 0 and, if a job is stuck far back after a couple of polls, resubmits it to another model group. Results come back as base64 (the R2 links aren't CORS-readable). Results come back as base64 (the R2 links aren't CORS-readable). |
| **OpenAI GPT Image 2.5 (Flare)** — paid | Called through the `generateImage` Cloud Function so the key stays server-side. ~1 MP images at `low` quality (≈ $0.005 each; `medium` ≈ $0.05, selectable in Settings), max 60 images/day/user. |
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

* **More keyed providers** behind Cloud Functions (Imagen/Gemini, Replicate, Stability) and signed share links for clients.
* **AI harmonise / inpaint** on the wall photo using the mask (OpenAI image edits, Replicate, Stability).
* **Image-to-image** from the wall photo or a rough sketch (ControlNet) so designs follow the real geometry.
* **Client sharing**: a read-only presentation page with the before/after and a comment/approve button.
* **Upscale** chosen designs; **vectorise** for stencil work.
* **Grid projector mode** on mobile for painters on site; export the transfer grid as a PDF.
* **Multiple walls per design** (a mural that wraps a corner) and **scale reference** (a person/door for scale).
* Real colour matching: map the palette to spray-paint brand codes (Montana, Molotow…).

## Known limitations

* Edits made offline sync when the connection returns; two devices editing the same document at once is last-write-wins.
* HEIC photos aren't decoded by browsers; convert to JPEG first.
* The studio uses `ctx.filter` (blur / colour) which Safari only supports in recent versions.
* The free generators are best-effort (see above).
