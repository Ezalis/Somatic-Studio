# 006 — Architecture Sketch

Theoretical code architecture for the rethought navigation. No implementation — just structure and concepts.

---

## New types

```typescript
// A group of related images that move and navigate as a unit
interface Cluster {
  id: string;
  type: ClusterType;
  imageIds: string[];          // Asset IDs of member images
  centroid: { x: number; y: number };  // Cluster center in physics space
  label: string;               // Human-readable name ("Mar 2 Session", "Portrait Series")
  metadata: ClusterMetadata;   // Type-specific data (date range, shared tags, etc.)
}

type ClusterType = 'session' | 'thematic' | 'gateway';

interface ClusterMetadata {
  // Session clusters
  dateRange?: { start: Date; end: Date };
  // Thematic clusters
  sharedTags?: string[];
  // Gateway clusters (virtual — computed from overlap)
  bridgedClusterIds?: string[];
}

// Where you are in the galaxy
interface NavigationState {
  zoomLevel: 'galaxy' | 'cluster' | 'image';
  activeClusterId: string | null;
  anchorImageId: string | null;
  history: NavigationHistoryEntry[];
}

interface NavigationHistoryEntry {
  imageId: string;
  clusterId: string;
  timestamp: number;
}

// Drives what text/UI to show
type InformationLayer = 'ambient' | 'proximity' | 'focus' | 'detail';

// Tracks which dimensions connect a neighbor to the hero
interface DimensionCollision {
  imageId: string;
  activeDimensions: {
    session: boolean;      // Same session cluster
    tags: number;          // Count of shared tags
    color: number;         // Perceptual color similarity (0-1)
    temporal: number;      // Temporal proximity score (0-1)
    lens: boolean;         // Same lens
  };
  collisionCount: number;  // How many dimensions are active
  compositeScore: number;  // Weighted total for positioning
}
```

## Scoring changes

**Remove camera body** from `scoreImageNode` in `dataService.ts`. The technical dimension becomes lens-only.

**Perceptual color distance:** Replace RGB Euclidean with HSL or CIE LAB distance. Consider palette-level features alongside individual color distances:
- Average warmth (hue distribution)
- Saturation range (vivid vs muted)
- Contrast ratio (high-key vs low-key)
- Dominant hue similarity

**Multi-dimension collision model:** Instead of computing a single relevance score, compute a `DimensionCollision` for each neighbor. Each dimension is evaluated independently. The collision count drives visual weight — more active dimensions = larger, closer, richer aura.

**Gateway identification:** A gateway image has high collision counts with images in *different* clusters. It's not "weakly connected to everything" — it's "strongly connected to multiple groups." Gateway score = number of distinct clusters the image has strong connections to.

## Cluster pre-computation

**On hydration (deterministic, cached):**

```
Session clusters:
  1. Sort all images by capture timestamp
  2. Walk sorted list, start new cluster when gap > 4 hours or date changes
  3. Label: date + time range ("Mar 2, 2-4pm")
  4. Store as Cluster[] in state

Thematic clusters:
  1. Build tag co-occurrence matrix (image × image, value = shared tag count)
  2. Threshold at ≥3 shared tags
  3. Connected component analysis on the thresholded graph
  4. Each component = one thematic cluster
  5. Label: top 2-3 most distinctive shared tags ("Portrait + Natural Light")
  6. Exclude within-session connections (those are already session clusters)
```

**At runtime (relative to current view):**

```
Color neighborhoods:
  - Compute perceptual palette distance from anchor to all images
  - No hard clustering — continuous similarity field
  - Drives background tint and atmospheric rendering

Gateway identification:
  - For each image, count distinct clusters it has strong connections to
  - Images bridging 2+ clusters are gateways
  - Update when anchor/cluster changes
```

## Physics changes

**Cluster-level forces** (replacing individual node forces):

```
Intra-cluster attraction:
  - Session: strong (spring constant ~0.8), tight spacing
  - Thematic: moderate (spring constant ~0.3), loose spacing

Inter-cluster repulsion:
  - Clusters repel each other to prevent overlap
  - Repulsion scaled by cluster size (bigger clusters push harder)

Hero gravity:
  - Pulls the entire active cluster toward center, not just one node
  - Nearby clusters pulled moderately (visible, reachable)
  - Distant clusters pulled weakly (peripheral, hinted)

Cluster shapes:
  - Session: tight circle or grid (compact, regular)
  - Thematic: loose constellation (organic, spread)
  - Cluster shape maintained by internal forces even as cluster moves
```

**Navigation transitions:**

```
Anchor change within cluster:
  - Smooth pan, minimal restructuring
  - Other cluster members shift slightly

Anchor change across clusters:
  - Camera travel animation (old cluster recedes, new cluster approaches)
  - Intermediate gateway nodes highlighted during transition
  - Physics simulation re-centers on new cluster

Zoom level changes:
  - Galaxy → cluster: zoom into region, cluster expands, others recede
  - Cluster → image: cluster spreads, hero image enlarges to hero position
  - Reverse: image → cluster → galaxy (zoom out)
```

## Rendering changes

**No EsotericSprite in focused modes.** Contextual reveal replaces the sprite system:
- Distance-based representation (atmospheric → thumbnail → full clarity)
- The sprite's role (abstraction, mystery, delight) lives in the atmospheric/distant layer
- Close-up images are always recognizable photographs

**No fixed chrome in any mode:**
- Remove RoughContainer component usage
- Remove satellite panel toggle buttons (fixed position)
- Remove field notes edge annotations
- Remove Somatic Studio title box
- All UI is contextual — positioned near content, appearing on proximity

**HUD-style text:**
- Positioned relative to content (near clusters, near images)
- Semi-transparent, appearing on proximity/focus
- Using the three-font system (Inter, JetBrains Mono, Caveat)
- Text lifecycle: appear on approach, fade on departure

**Full-bleed background:**
- Palette-driven gradients covering entire viewport
- No margins, no borders, no viewport chrome
- Background shifts with neighborhood — warm, cool, saturated, muted

**Grid entry = galaxy overview:**
- Pre-clustered layout showing session groups and thematic constellations
- Not a flat grid — variable spacing, density, grouping
- Entry animation: fade in from deep space, galaxy structure resolves

## What stays (unchanged)

- **D3 force simulation core** — Still the right tool, just with cluster-level forces
- **IndexedDB caching** — Palette cache and user tag edits persist
- **Immich API integration** — All image/tag/EXIF data still from Immich
- **Workbench view** — Admin/curation tool, untouched by navigation changes
- **ProgressiveImage loading** — Preview → full-res crossfade, still needed
- **DetailView** — Full metadata overlay, but triggered from immersive context instead of chrome buttons
- **usePhysicsSimulation hook** — Extended with cluster forces, not replaced
- **useRelevanceScoring hook** — Refactored to produce DimensionCollision, not replaced

## Open questions

1. **How to handle very large session clusters (15+ images)?** Do they subdivide? Show a subset with "N more" indicator?
2. **Thematic cluster stability** — Adding/removing tags changes cluster membership. How to handle smooth transitions when clusters split or merge?
3. **Performance of galaxy view** — Rendering 160+ images with blur/glow effects. Canvas vs DOM? WebGL for the atmospheric layer?
4. **Mobile/touch adaptation** — "Proximity to cursor" doesn't work on touch. Tap replaces hover? Long-press for focus layer?
5. **Accessibility** — How to communicate spatial relationships to screen readers? The galaxy metaphor is inherently visual.
