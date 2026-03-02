# Somatic Studio

A photography asset management and discovery system — a "living web of memory, color, and light." Navigate by feeling, not folders.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19, TypeScript 5.8 |
| Styling | Tailwind CSS v4 (build-time via `@tailwindcss/vite`) |
| Physics/Layout | D3.js 7.9 (force simulation) |
| Image Service | Immich (docker-01:2283) — images, EXIF, ML tags, CLIP Smart Search |
| Build | Vite 6 |
| Fonts | @fontsource (Inter, JetBrains Mono, Caveat) |
| Storage | IndexedDB (client-side, palette cache + user tag edits) |

## Architecture

```
index.html          → SPA shell, inline styles
index.css           → Tailwind entry (@import "tailwindcss")
index.tsx           → React entry, fontsource imports
App.tsx             → Root component, global state, view routing
├── components/
│   ├── Experience.tsx      → Visual exploration interface (D3 physics, grid, focus views)
│   ├── Workbench.tsx       → Admin/curation list view (tagging, search, batch ops)
│   └── VisualElements.tsx  → Shared visuals (EsotericSprite, LoadingOverlay, HistoryStream, FieldGuide)
├── services/
│   ├── immichService.ts    → Immich API: album discovery, asset loading, CLIP Smart Search
│   ├── dataService.ts      → Color palette extraction, color math, relationship scoring
│   └── resourceService.ts  → IndexedDB persistence (palette cache, user tag edits)
├── types.ts                → Data models (ImageNode, Tag, ExperienceNode, AnchorState)
└── vite.config.ts          → Tailwind plugin, Immich proxy, Docker polling
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
- **Prod:** Nginx proxy block in `nginx/default.conf` (DockerAdmin repo)

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `IMMICH_API_KEY` | Yes | Immich API key for image service access |
| `IMMICH_URL` | No | Immich server URL (default: `http://192.168.50.66:2283`) |

## Development

```bash
npm install
npm run dev        # Vite dev server at localhost:3000
npm run build      # Production build to dist/
npm run preview    # Preview production build
```

## Deployment (Docker on docker-01)

| Environment | Port | URL |
|-------------|------|-----|
| Production | 3100 | `http://docker-01:3100` / `http://192.168.50.66:3100` |
| Development | 3001 | `http://docker-01:3001` / `http://192.168.50.66:3001` |

**Current branch state:** Production runs `main`. Development runs `feature/immich-integration`.

```bash
# Update production
ssh -i ~/.ssh/id_ed25519_dockeradmin thensomethingnew@docker-01 \
  "cd ~/somatic-studio-src && git pull origin main && \
   cd ~/compose-stacks/somatic-studio && docker compose --profile prod up -d --build"

# Update dev (feature branch)
ssh -i ~/.ssh/id_ed25519_dockeradmin thensomethingnew@docker-01 \
  "cd ~/somatic-studio-src && git pull origin feature/immich-integration && \
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

### 2026-03-01: Dev Deployment (feature/immich-integration)
- Dev server (docker-01:3001) switched from `main` to `feature/immich-integration`
- docker-compose.yml updated: removed `somatic-studio-data` volume, added `IMMICH_API_KEY`/`IMMICH_URL` env vars
- `.env` files created on remote (source repo + compose stack) with Immich API key
- Prod (docker-01:3100) unchanged, still on `main`

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

### 2026-03-01: Docker Self-Hosting
Migrated from Google AI Studio (CDN-hosted) to self-hosted Docker:
- Dockerfiles use `npm install` (not `npm ci`) since no lockfile is committed

## Known Data Issues

- Legacy `public/gallery/` and `public/resources/*.json` files have been removed — Immich is now the single source of truth for images and tags

---

## Future Roadmap

### High Priority

- [x] **Replace Gemini with Immich CLIP Smart Search** — Immich provides ML auto-tags and CLIP semantic search, eliminating the Google API dependency
- [ ] **Generate package-lock.json** — Install Node.js locally, run `npm install`, commit the lockfile so Docker builds can use faster `npm ci`
- [ ] **Configure Nginx proxy for Immich** — Add `/api/immich/` proxy block to nginx config in DockerAdmin repo for production

### Features

- [ ] **Image upload via UI** — Drag-and-drop or file picker to add new images directly through the app (currently requires adding to `public/gallery/` and updating tags.json)
- [ ] **Persistent exploration state** — Save/restore anchor, history, and view state across sessions (currently resets on page reload)
- [ ] **InsightSnapshot recording** — The `InsightSnapshot` type exists in types.ts but isn't used yet; implement capture and replay of exploration moments
- [ ] **Tag management UI** — Create, rename, merge, and delete tags from the Workbench; currently tags can only be added, not edited
- [ ] **Image deletion** — Remove images from the gallery through the UI
- [ ] **Bulk image import** — Batch upload with automatic EXIF extraction and AI tagging
- [ ] **Advanced search** — Filter by date range, ISO range, aperture range, color similarity
- [ ] **Keyboard navigation** — Arrow keys to traverse neighbors in Experience mode, Escape to return to grid
- [ ] **Dark mode** — The CSS already has a black background; extend to a full dark theme for the UI chrome

### Visual & UX

- [ ] **Cluster visualization** — Show shoot-day clusters or semantic groups as visual regions on the grid
- [ ] **Color wheel navigation** — Interactive color picker to find images by dominant hue
- [ ] **Timeline view** — Chronological strip showing images across days/months/years
- [ ] **Comparison mode** — Side-by-side view of two images with their intersection attributes
- [ ] **Animation polish** — Smoother transitions between anchor changes, entry/exit animations for satellites

### Infrastructure

- [ ] **CI/CD pipeline** — Auto-deploy on push to main (GitHub Actions → SSH → docker compose rebuild)
- [ ] **Nginx reverse proxy with SSL** — Add HTTPS via Let's Encrypt or Tailscale certs
- [ ] **Image optimization pipeline** — Generate thumbnails and WebP variants during build for faster loading
- [ ] **Backup strategy** — Automated backup of IndexedDB exports and gallery images
- [ ] **Health check endpoint** — Simple `/health` route for monitoring
- [ ] **Multi-user support** — Separate galleries/tag databases per user (long-term)
