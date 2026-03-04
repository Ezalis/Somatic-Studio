# 003 — Clustering Rethink

A new scoring and grouping architecture based on what the orbital rings experiment taught us.

---

## Remove camera body from scoring

Camera body match is noise. Most of the collection is shot on the same 1-2 bodies, so "same camera" is nearly universal and creates false clustering. Scoring it wastes a dimension.

Keep lens match only, as a lightweight technical signal. Lens implies intent — 35mm for street, 85mm for portrait, macro for detail work. That's meaningful. The body that held the lens is not.

## Tiered clustering (not flat scoring)

The current system computes a flat relevance score per image and uses score magnitude to position nodes. This loses structural information — a high score from session proximity means something fundamentally different from a high score from tag overlap.

**Replace flat scoring with tiered clusters:**

### Tier 1 — Session clusters

**Rule:** Same calendar day, images within ≤4 hours of each other.

These are *shoots*. The tightest, most coherent grouping. Users instantly understand "these were taken together." A session cluster is a unit — it moves together, it's presented together, navigating into one means seeing all of them.

**Visual treatment:** Tight cloud. Images nearly touching. Shared border/frame aesthetic — like photos spread on a lightbox. Maybe a filmstrip or photo-pile metaphor for the cluster as a whole. The cluster has a *shape* — compact, dense, recognizable.

**Typical size:** 3-15 images per session.

### Tier 2 — Thematic clusters

**Rule:** 3+ shared meaningful tags across images from different sessions.

These are conceptual threads — "urban portrait series," "golden hour landscapes," "close-up texture work." They connect across time. Two shoots from different months that explored the same themes form a thematic cluster.

**Visual treatment:** Loose constellation. Images connected by visible threads/lines colored by the shared tags. More spacing than session clusters. The constellation has a *pattern* — spread out, structured, but cohesive.

**Typical size:** 5-20 images across 2-5 sessions.

### Tier 3 — Color neighborhoods

**Rule:** Perceptual color similarity using HSL or CIE LAB distance (not RGB Euclidean).

These are atmospheric zones, not hard groups. You don't "enter" a color neighborhood — you drift through it. The warm golden corner of the galaxy. The high-contrast region. The muted, desaturated zone.

**Visual treatment:** Background tint, not explicit grouping. As you move through the galaxy, the ambient color shifts. No borders, no labels — just atmosphere. Color neighborhoods overlap freely with session and thematic clusters.

**Scoring approach:** Compare palette-level features — average warmth, saturation range, contrast ratio, dominant hue — alongside individual color distances. Use HSL or CIE LAB for perceptually meaningful comparisons.

### Tier 4 — Temporal proximity

**Rule:** Same week, same month, same season.

Softer than session clusters. Being shot the same week doesn't mean the images are related — but it provides contextual relevance. "What else was happening around this time?"

**Visual treatment:** Subtle gravitational pull, not hard grouping. Temporally proximate images drift slightly closer in the galaxy, but they don't form explicit clusters. Season creates the broadest contextual halo.

### Tier 5 — Lens affinity

**Rule:** Same lens across different sessions.

Shoot-type similarity. 85mm portraits cluster loosely across sessions. 35mm street work clusters. This is the lightest signal — it suggests aesthetic affinity without implying narrative connection.

**Visual treatment:** Subtle, metadata-level. Not visual grouping. Available in the focus/detail information layer but not driving layout.

## Clusters are groups, not classifications

Key conceptual shift: clusters are *groups of images that move together*, not *labels applied to individual images*.

A session cluster contains 3-8 images. When the hero image is in that cluster, the whole cluster is pulled into the foreground. When you navigate to a different cluster, the previous one recedes as a unit.

Navigation happens between clusters, not just between individual images. "Next" can mean "next image in this cluster" or "next cluster in this region" depending on context.

## Gateways are bridges, not weak connections

In the orbital rings system, "gateways" were images with weak, distributed connections — not strongly tied to anything. This made them uninteresting.

**Redefine:** Gateways are images that belong to *multiple clusters simultaneously*. A portrait from a session that also shares 4 tags with a thematic cluster from months ago — that's a bridge between two regions of the galaxy.

Gateways are the *most* interesting nodes, not the least. They connect regions. They enable travel between clusters. They're the wormholes of the galaxy.

**Visual treatment:** Gateways should show their multi-cluster membership visually — connection threads to multiple groups, a richer aura from the collision of dimensions. They're entry points for exploration.

## Pre-computation vs runtime

**Pre-computed on hydration:**
- Session clusters (deterministic: group by date, ≤4hr gaps)
- Thematic clusters (connected component analysis on tag overlap ≥3)

**Dynamic at runtime:**
- Color neighborhoods (palette similarity relative to current view)
- Temporal proximity (relative to current anchor)
- Gateway identification (cluster membership intersection)
- Cluster positioning in the force simulation
