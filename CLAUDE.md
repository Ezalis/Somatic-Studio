# Somatic Studio

A photography asset management and discovery system — a "living web of memory, color, and light." Navigate by feeling, not folders.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript 5.8 |
| Styling | Tailwind CSS v4 (build-time via `@tailwindcss/vite`) |
| Image Service | Immich (docker-01:2283) — images, EXIF, tags |
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
App.tsx                       → Root component, Immich hydration, renders flow navigation
├── components/
│   └── flow/                     → Flow-state navigation (the entire UI)
│       ├── NavigationPrototype.tsx  → Orchestrator (state machine, scroll layout)
│       ├── MiniSprite.tsx           → SVG sprite with bloom animation
│       ├── BloomOverlay.tsx         → Bloom scatter transition
│       ├── HeroSection.tsx          → Fullscreen hero with scroll-driven blur
│       ├── TraitSelector.tsx        → Color/tag/discovery-tag picker
│       ├── WaterfallAlbum.tsx       → Tiered album layout with zoom-through
│       ├── SpriteBackground.tsx     → Convergence ring sprite layer
│       ├── IdleField.tsx            → Drifting sprite + photo card field
│       ├── flowTypes.ts             → Flow-specific types
│       ├── flowHelpers.ts           → Scoring, color math, seeded random
│       ├── index.ts                 → Barrel export
│       └── flow.css                 → Keyframe animations
├── services/
│   ├── immichService.ts      → Immich API: album discovery, asset loading, tag reading
│   ├── dataService.ts        → Color palette extraction, color math utilities
│   └── resourceService.ts    → IndexedDB persistence (palette cache, user tag edits)
├── scripts/
│   └── migrate-legacy-tags.mjs → One-time migration of Gemini AI tags into Immich
├── types.ts                  → Data models (ImageNode, Tag)
└── vite.config.ts            → Tailwind plugin, Immich proxy, Docker polling
```

## Key Concepts

- **ImageNode** — An image with EXIF metadata, 5-color palette, manual tags, AI tags, and capture timestamp
- **MiniSprite** — A procedurally-generated SVG glyph unique to each image, derived from its palette and metadata
- **FlowPhase** — State machine: `idle → blooming → hero → exploring → album`
- **Trait** — A selected color or tag used to build the album pool; up to 6 traits per session
- **Relevance Score** — Calculated from temporal proximity, tag overlap, color distance, and technical matches

## Flow-State Navigation

The entire app is a single vertical scroll journey through images:

1. **Idle** — Drifting sprites and photo cards fill the viewport; tap any to begin
2. **Blooming** — Sprite scatters apart with staggered CSS transitions; hero preloads behind
3. **Hero** — Fullscreen image (sticky, progressively blurs 0–16px as user scrolls past)
4. **Exploring** — Trait selector scrolls up over blurred hero; pick colors + tags to build an album
5. **Album** — At 6 traits: sprite background with convergence rings, zoom-through depth on mobile
6. **Loop** — Tap any album item → bloom → new hero → new traits → new album

## Data Flow

1. **Initialization** — `initDatabase()` loads IndexedDB palette cache
2. **Skeleton hydration** — `hydrateSkeletonFromImmich()` finds "SomaticStudio" album → fetches assets with EXIF → builds ImageNodes with cached palettes → renders IdleField immediately
3. **Background enrichment** — `enrichWithTagsAndPalettes()` fetches tags and extracts missing palettes in background
4. **Priority enrichment** — When hero changes, `enrichAssetTags()` fetches tags for anchor + top 24 neighbors
5. **Scoring** — `scoreRelevance()` ranks images by temporal/semantic/visual/technical similarity to anchor
6. **Album pool** — Selected traits filter and rank the full image set; results shown as tiered album

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

### 2026-03-11: v1.0 — Flow-State Promoted to Primary App
- Flow-state navigation (previously at `/prototype`) now renders at root `/`
- Removed old Experience (D3 orbital physics), Workbench (admin curation), and all supporting components
- Deleted: `Experience.tsx`, `Workbench.tsx`, `DetailView.tsx`, `FieldGuideOverlay.tsx`, `Gallery.tsx`, `HistoryTimeline.tsx`, `ProgressiveImage.tsx`, `SatelliteLayer.tsx`, `VisualElements.tsx`
- Deleted: `hooks/useRelevanceScoring.ts`, `hooks/usePhysicsSimulation.ts` and test suite
- Removed D3.js dependency (`d3` package uninstalled)
- Removed types: `ExperienceNode`, `ExperienceMode`, `ExperienceContext`, `ViewMode`, `ScoreBreakdown`, `PhysicsConfig`, `SimulationNode`, `AnchorState`, `InsightSnapshot`
- Pruned `dataService.ts`: removed `getDominantColorsFromNodes`, `getRelatedTagsFromNodes`, `getIntersectionAttributes`
- App.tsx simplified: hydration + flow navigation only, no view routing or old-view state

### 2026-03-01: Immich Integration
Migrated from local gallery + Gemini AI to Immich image service:
- Images served from Immich (docker-01:2283) "SomaticStudio" album, not `public/gallery/`
- EXIF metadata from Immich API, not client-side `exifr` extraction
- AI tagging originally via Immich CLIP Smart Search (removed 2026-03-10, replaced by Ollama pipeline)
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
- Immich contains `SomaticStudio/*` tags from legacy Gemini data, former CLIP Smart Search, and Ollama pipeline
- `buildTagsFromImmichNative` reads all Immich tags (strips `SomaticStudio/` prefix if present)
- Immich-first hydration: tags from Immich take priority, IndexedDB cache only used as fallback when Immich has zero tags for an asset

### 2026-03-10: CLIP Smart Search Removed
- Removed `CLIP_TAG_DEFINITIONS`, `generateClipTags()`, `syncTagsToImmich()` from `immichService.ts`
- Removed CLIP TAGS button from Workbench, AI analyzing state/UI from App.tsx and Experience.tsx
- Immich ML container (`immich-machine-learning`) disabled and removed from docker-01
- Existing `SomaticStudio/*` tags in Immich preserved — readable via `buildTagsFromImmichNative()`
- `aiTagIds` field kept on ImageNode for Ollama pipeline (M3)
- Tagging strategy replaced by Ollama on MacBook Air (llava + llama3.1)

### 2026-03-02: Hero Image Performance Fix
Fixed slow hero image load on production (Nginx) vs dev (Vite):
- **Nginx upstream keepalive** — Added `upstream immich_backend` with `keepalive 16` to reuse TCP connections to Immich
- **Browser cache headers** — Added `expires 7d` + `Cache-Control: public, max-age=604800` on Immich image responses
- **New env var** — `IMMICH_BACKEND` (host:port, no protocol) added to docker-compose.yml for the `upstream` block

### 2026-03-01: Docker Self-Hosting
Migrated from Google AI Studio (CDN-hosted) to self-hosted Docker:
- Dockerfiles use `npm ci` with committed `package-lock.json` for deterministic builds

## Known Data Issues

- Legacy `public/gallery/` and `public/resources/*.json` files have been removed — Immich is now the single source of truth for images and tags

---

## Roadmap

Tracked on [GitHub Projects](https://github.com/users/Ezalis/projects/1) with milestones M1–M4.

### Completed

- [x] **M1: Structural Foundation** — Scoring engine, physics simulation, UI component extraction, ESLint, Vitest, package-lock.json (#1–#6)
- [x] **M2: Flow State Navigation** — Flow-state prototype built, decomposed into components, promoted to primary app as v1.0 (#19, #20)
- [x] **Replace Gemini with Immich CLIP Smart Search** — Eliminated Google API dependency (CLIP later removed in favor of Ollama)
- [x] **Configure Nginx proxy for Immich** — Nginx upstream keepalive + 7d cache headers for image responses (DockerAdmin repo)
- [x] **Generate package-lock.json** — Deterministic builds, Docker can use `npm ci`

### M2: Flow State Navigation (Remaining)

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
- [ ] Dark mode for UI chrome

### Infrastructure

- [ ] CI/CD pipeline (GitHub Actions → SSH → Docker rebuild)
- [ ] Nginx reverse proxy with SSL (Let's Encrypt / Tailscale)
- [ ] Image optimization pipeline (thumbnails, WebP variants)
- [ ] Health check endpoint
- [ ] Multi-user support (long-term)
