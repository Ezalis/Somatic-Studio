# Somatic Studio

A photography asset management and discovery system — a "living web of memory, color, and light." Navigate by feeling, not folders.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript 5.8 |
| Styling | Tailwind CSS v4 (build-time via `@tailwindcss/vite`) |
| Physics/Layout | D3.js 7.9 (force simulation) |
| Image Service | Immich (docker-01:2283) — images, EXIF, ML tags, CLIP Smart Search |
| Icons | Lucide React |
| Build | Vite 6 |
| Linting | ESLint + typescript-eslint (errors-only config) |
| Testing | Vitest (jsdom environment) |
| Fonts | @fontsource (Inter, JetBrains Mono, Caveat) |
| Storage | IndexedDB (client-side, palette cache + user tag edits) |

## Architecture

```
index.html                    → SPA shell, inline styles
index.css                     → Tailwind entry (@import "tailwindcss")
index.tsx                     → React entry, fontsource imports
App.tsx                       → Root component, global state, view routing
├── components/
│   ├── Experience.tsx        → Visual exploration (D3 physics, grid, focus views)
│   ├── Workbench.tsx         → Admin/curation list view (tagging, search, batch ops)
│   ├── VisualElements.tsx    → Shared visuals (EsotericSprite, LoadingOverlay, HistoryStream)
│   ├── DetailView.tsx        → Image detail overlay (metadata, tags, EXIF)
│   ├── FieldGuideOverlay.tsx → Onboarding overlay explaining the navigation metaphor
│   ├── Gallery.tsx           → Fullscreen vertical snap-scroll gallery
│   ├── HistoryTimeline.tsx   → Fullscreen chronological exploration history
│   ├── flow/                     → Flow-state navigation (vertical scroll journey)
│   │   ├── NavigationPrototype.tsx  → Orchestrator (state machine, scroll layout)
│   │   ├── MiniSprite.tsx           → SVG sprite with bloom animation
│   │   ├── BloomOverlay.tsx         → Bloom scatter transition
│   │   ├── HeroSection.tsx          → Fullscreen hero with 3D card flip
│   │   ├── TraitSelector.tsx        → Color/tag/discovery-tag picker
│   │   ├── WaterfallAlbum.tsx       → Tiered album layout
│   │   ├── IdleField.tsx            → Drifting sprite field
│   │   ├── flowTypes.ts             → Flow-specific types
│   │   ├── flowHelpers.ts           → Scoring, color math, seeded random
│   │   └── flow.css                 → Keyframe animations
│   ├── ProgressiveImage.tsx  → Preview→full-res crossfade image loader
│   └── SatelliteLayer.tsx    → Spectral ID + Semantic Web side panels
├── hooks/
│   ├── useRelevanceScoring.ts   → Relevance scoring with per-dimension breakdown
│   ├── usePhysicsSimulation.ts  → D3 force simulation with configurable physics
│   └── __tests__/
│       └── useRelevanceScoring.test.ts → Scoring engine test suite
├── services/
│   ├── immichService.ts      → Immich API: album discovery, asset loading, CLIP Smart Search
│   ├── dataService.ts        → Color palette extraction, color math, relationship scoring
│   └── resourceService.ts    → IndexedDB persistence (palette cache, user tag edits)
├── scripts/
│   └── migrate-legacy-tags.mjs → One-time migration of Gemini AI tags into Immich
├── types.ts                  → Data models (ImageNode, Tag, ExperienceNode, AnchorState, ScoreBreakdown)
└── vite.config.ts            → Tailwind plugin, Immich proxy, Docker polling
```

## Key Concepts

- **ImageNode** — An image with EXIF metadata, 5-color palette, manual tags, AI tags, and capture timestamp
- **ExperienceNode** — An ImageNode wrapped with D3 physics state (position, velocity, scale, opacity, relevance score)
- **AnchorState** — The current navigation focus: an image, tag, color, date, camera, lens, or season
- **EsotericSprite** — A procedurally-generated SVG glyph unique to each image, derived from its palette and metadata
- **Relevance Score** — Calculated from temporal proximity, tag overlap, color distance, and technical matches

## Views

### Experience (Visual Exploration)
- **Grid View** — All images as EsotericSprites in a responsive grid; click to anchor
- **Image Focus** — Hero image centered with 12 related neighbors orbiting via physics simulation
- **Filter Views** — Pivot by tag, color, date, camera, lens, or season
- **Satellite Panels** — "Spectral ID" (color navigation) and "Semantic Web" (tag navigation)
- **History Timeline** — Fullscreen chronological view of exploration path
- **Fullscreen Gallery** — Vertical snap-scroll for sequential viewing
- **Field Guide** — Onboarding overlay explaining the metaphor

### Workbench (Admin/Curation)
- **List Grid** — 6-column table with preview, dates, tags, technical specs
- **Search** — Full-text across filenames, tags, camera/lens models
- **Multi-Select** — Click, Shift+Click range, Cmd+Click toggle
- **Batch Operations** — Add/remove tags across selection
- **AI Analysis** — CLIP Smart Search tagging (35 labels across subject/setting/lighting/mood/content categories)
- **Export** — Download tags.json and AI-tags.json

## Data Flow

1. **Initialization** — `initDatabase()` loads IndexedDB palette cache and user tag edits
2. **Hydration** — `hydrateFromImmich()` finds "SomaticStudio" album → fetches assets with EXIF → reads native ML tags → builds ImageNodes → extracts palettes from thumbnails (batches of 4)
3. **Scoring** — When an anchor changes, images are scored by temporal/semantic/visual/technical similarity
4. **Physics** — D3 force simulation positions nodes; top 12 by score become visible neighbors
5. **CLIP Tagging** — On-demand via Workbench "CLIP TAGS" button: queries Immich Smart Search for 35 semantic labels (portrait/editorial-optimized, top-5 position cutoff, 30% penetration limit)
6. **Persistence** — Manual tag edits + palette cache saved to IndexedDB

## Image Proxy

All Immich API calls go through `/api/immich/*` — the proxy rewrites to Immich's `/api/*` and injects the API key server-side. The browser never sees the key.

- **Dev:** Vite proxy in `vite.config.ts`
- **Prod:** Nginx proxy block in `nginx/default.conf.template` (DockerAdmin repo) — upstream keepalive (16 connections), 7-day browser cache on image responses

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `IMMICH_API_KEY` | Yes | Immich API key for image service access |
| `IMMICH_URL` | No | Immich server URL (default: `http://192.168.50.66:2283`) |
| `IMMICH_BACKEND` | No | Immich host:port for Nginx upstream (default: `192.168.50.66:2283`, no `http://` prefix) |

## Development

```bash
npm install
npm run dev        # Vite dev server at localhost:3000
npm run build      # Production build to dist/
npm run preview    # Preview production build
npm run lint       # ESLint (errors-only, TypeScript-aware)
npm run test       # Vitest (single run)
npm run test:watch # Vitest (watch mode)
```

## Deployment (Docker on docker-01)

| Environment | Port | URL |
|-------------|------|-----|
| Production | 3100 | `http://docker-01:3100` / `http://192.168.50.66:3100` |
| Development | 3001 | `http://docker-01:3001` / `http://192.168.50.66:3001` |

**Current branch state:** Both production and development run `main` (feature branches switched per milestone).

```bash
# Update production
ssh -i ~/.ssh/id_ed25519_dockeradmin thensomethingnew@docker-01 \
  "cd ~/somatic-studio-src && git pull origin main && \
   cd ~/compose-stacks/somatic-studio && docker compose --profile prod up -d --build"

# Update dev (switch BRANCH as needed)
ssh -i ~/.ssh/id_ed25519_dockeradmin thensomethingnew@docker-01 \
  "cd ~/somatic-studio-src && git fetch origin && git checkout BRANCH && git pull && \
   cd ~/compose-stacks/somatic-studio && docker compose --profile dev up -d --build"

# View logs
ssh -i ~/.ssh/id_ed25519_dockeradmin thensomethingnew@docker-01 "docker logs somatic-prod --tail 50"
ssh -i ~/.ssh/id_ed25519_dockeradmin thensomethingnew@docker-01 "docker logs somatic-dev --tail 50"
```

Docker infrastructure lives in the DockerAdmin repo at `compose-templates/somatic-studio/`.

## Migration Notes

### 2026-03-01: Immich Integration
Migrated from local gallery + Gemini AI to Immich image service:
- Images served from Immich (docker-01:2283) "SomaticStudio" album, not `public/gallery/`
- EXIF metadata from Immich API, not client-side `exifr` extraction
- AI tagging via Immich CLIP Smart Search, replacing Gemini
- Removed `exifr`, `@google/genai`, process shim plugin
- API key injected server-side via proxy (Vite dev / Nginx prod)

### 2026-03-01: Dev Deployment
- Dev server (docker-01:3001) runs feature branches during active milestone work, `main` otherwise
- docker-compose.yml updated: removed `somatic-studio-data` volume, added `IMMICH_API_KEY`/`IMMICH_URL` env vars
- `.env` files created on remote (source repo + compose stack) with Immich API key

### 2026-03-01: Legacy AI Tag Migration to Immich
Migrated original Gemini AI tags from `main:public/resources/AI-tags.json` into Immich via one-time script:
- Script: `scripts/migrate-legacy-tags.mjs` — embeds legacy data, maps filenames to Immich asset IDs
- Source data: 65 defined tags + 58 orphan tag IDs (auto-derived labels), 160 image mappings
- Results: 122 `SomaticStudio/*` tags created, 158/160 images matched, 1,412 tag-to-asset assignments
- 2 unmatched files: `F38245A5-...` and `Petite LeMans-41 Edited.jpg` (not in Immich album)
- Script ran inside `somatic-dev` Docker container (Node v22) on docker-01 since no local Node.js installed
- Bug fix applied between runs: Immich GET /tags returns `{name: "Portrait", value: "SomaticStudio/Portrait"}` — first run matched on `name` only, missing 17 existing CLIP tags; fixed to index by both `name` and `value`
- Immich now contains `SomaticStudio/*` tags from both legacy Gemini data and CLIP Smart Search
- `buildTagsFromImmichNative` reads all Immich tags (strips `SomaticStudio/` prefix if present)
- Immich-first hydration: tags from Immich take priority, IndexedDB cache only used as fallback when Immich has zero tags for an asset

### 2026-03-01: CLIP Tag Revision
- Expanded from 27 to 35 CLIP tag definitions optimized for portrait/editorial collection
- Categories: Subject (8), Setting (5), Lighting & Technique (10), Mood & Atmosphere (6), Content & Visual (6)
- Tighter search params: `size: 10`, top-5 position cutoff, 30% penetration limit
- Tags written back to Immich as `SomaticStudio/*` via `syncTagsToImmich()`

### 2026-03-02: M1 Structural Foundation
Refactored Experience.tsx from a monolithic ~2000-line component into clean modules:
- **Scoring engine** — Extracted `useRelevanceScoring` hook with `ScoreBreakdown` per-dimension type; scoring logic moved to `dataService.ts`
- **Physics simulation** — Extracted `usePhysicsSimulation` hook with `PhysicsConfig`; tuned for slower movement and gentler transitions
- **UI components** — Extracted `DetailView`, `FieldGuideOverlay`, `Gallery`, `HistoryTimeline`, `ProgressiveImage`, `SatelliteLayer` from inline rendering
- **Progressive image loading** — Preview→full-res crossfade using CSS Grid stacking (no layout shift)
- **Developer tooling** — Added ESLint + typescript-eslint (errors-only), Vitest with jsdom, `package-lock.json`
- **Test suite** — Scoring engine tests covering dimension isolation, breakdown structure, anchor-self scoring

### 2026-03-02: Hero Image Performance Fix
Fixed slow hero image load on production (Nginx) vs dev (Vite):
- **Deferred preload** — Original-image preload in Experience.tsx now waits 1s before starting, so the ~267KB preview loads without the multi-MB original competing for bandwidth
- **Nginx upstream keepalive** — Added `upstream immich_backend` with `keepalive 16` to reuse TCP connections to Immich (previously opened a new connection per request)
- **Browser cache headers** — Added `expires 7d` + `Cache-Control: public, max-age=604800` on Immich image responses; thumbnails/previews cached for 7 days
- **New env var** — `IMMICH_BACKEND` (host:port, no protocol) added to docker-compose.yml for the `upstream` block
- Nginx config now requires `proxy_http_version 1.1` + `Connection ""` for keepalive to work

### 2026-03-01: Docker Self-Hosting
Migrated from Google AI Studio (CDN-hosted) to self-hosted Docker:
- Dockerfiles use `npm ci` with committed `package-lock.json` for deterministic builds

## Navigation Prototype

The `/prototype` route hosts the navigation exploration prototype — a self-contained single-file component (`NavigationPrototype.tsx`) that's completely independent from the main Experience view.

**Active branch:** `flow-state` (off `navigation-ideation`)

**Architecture (Phase 3 — "Flow State"):**
- Single vertical scroll journey (no dashboard panels)
- State machine: `idle → blooming → hero → exploring`
- Bloom transition: sprite SVG elements scatter apart with staggered CSS transitions, hero preloads behind
- Hero section: fullscreen image with card flip to handwritten details (Caveat font, SVG timeline)
- Trait selector: pick up to 6 traits (palette colors + tags + discovery tags) to build album
- Waterfall album: tiered by tag hit count — photos for high relevance, sprites for low
- Navigation loop: tap album item → bloom → new hero → new traits → new album

**Previous phases** (documented in memory/prototyping.md):
- Phase 1 (iterations 1-4): Single-canvas exploration experiments
- Phase 2 (iterations 5.0-5.5): "Living Dashboard" with left panel + center hero + dynamic album

## Known Data Issues

- Legacy `public/gallery/` and `public/resources/*.json` files have been removed — Immich is now the single source of truth for images and tags

---

## Roadmap

Tracked on [GitHub Projects](https://github.com/users/Ezalis/projects/1) with milestones M1–M4.

### Completed

- [x] **M1: Structural Foundation** — Scoring engine, physics simulation, UI component extraction, ESLint, Vitest, package-lock.json (#1–#6)
- [x] **Replace Gemini with Immich CLIP Smart Search** — Immich provides ML auto-tags and CLIP semantic search, eliminating the Google API dependency
- [x] **Configure Nginx proxy for Immich** — Nginx upstream keepalive + 7d cache headers for image responses (DockerAdmin repo)
- [x] **Generate package-lock.json** — Deterministic builds, Docker can use `npm ci`

### M2: Flow State Navigation (Next)

- [ ] **Decompose NavigationPrototype into production components** — Extract MiniSprite, BloomOverlay, HeroSection, TraitSelector, WaterfallAlbum, IdleField into separate files; reuse `useRelevanceScoring` and `dataService` (#19)
- [ ] **Integrate flow-state navigation with main app** — Wire components into App.tsx, decide routing (replace Experience or coexist), connect Immich hydration (#20)
- [ ] **Keyboard navigation + URL state + browser back** — Arrow keys, Enter/Escape, hero ID in URL, history stack (#9)
- [ ] **Mobile responsive flow-state layout** — Touch targets, bloom perf, trait selector on narrow viewports, album grid sizing (#21)
- [ ] **Trail/history visualization in flow journey** — Exploration trail within vertical scroll context (#22)
- [ ] **Show shared-attribute labels on album items** — Surface why each image appears (e.g. "same session", "shared tag: Portrait") (#8)

### M3: AI Pipeline

- [ ] **Hybrid AI tagging architecture (ADR)** (#11)
- [ ] **Server-side AI proxy endpoint** (#12)
- [ ] **Claude Vision rich tagging** (#13)
- [ ] **Embedding-based similarity scoring** (#14)

### M4: 3D Prototype

- [ ] **Rendering abstraction layer** (#15)
- [ ] **Three.js/R3F scene setup** (#16)
- [ ] **3D navigation with depth** (#17)

### Backlog

- [ ] Image upload via drag-and-drop or file picker (currently requires adding to Immich directly)
- [ ] Persistent exploration state across sessions
- [ ] Tag management UI (rename, merge, delete)
- [ ] Advanced search (date range, ISO, aperture, color similarity)
- [ ] InsightSnapshot capture and replay
- [ ] Dark mode for UI chrome

### Infrastructure

- [ ] CI/CD pipeline (GitHub Actions → SSH → Docker rebuild)
- [ ] Nginx reverse proxy with SSL (Let's Encrypt / Tailscale)
- [ ] Image optimization pipeline (thumbnails, WebP variants)
- [ ] Health check endpoint
- [ ] Multi-user support (long-term)
