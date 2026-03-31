# Design Documents

These are **pre-v1.0 design thinking documents** from the orbital rings era (early 2026). They capture the philosophy, lessons, and architectural ideas that shaped the current flow-state navigation system.

They are historical context, not current architecture. For current architecture, see:
- **CLAUDE.md** (in repo root) — authoritative architecture guide
- **Stumpy knowledge files** — `knowledge/projects/somatic-studio.md` and `somatic-studio-tagging.md`

## Index

| Doc | What it captures |
|-----|-----------------|
| 001 — Lessons Learned | What the orbital rings experiment taught us (session is king, sprites block nav, color clustering is coarse) |
| 002 — Navigation Philosophy | The galaxy/spacecraft metaphor that drives UX decisions |
| 003 — Clustering Rethink | Tiered clustering proposal (session → thematic → color → temporal → lens) |
| 004 — Visual Design | Contextual reveal + 2.5D depth vision |
| 005 — Information Architecture | Four-layer information model (ambient → proximity → focus → detail) |
| 006 — Architecture Sketch | Theoretical code architecture for the rethought navigation (types, forces, rendering) |

Many ideas from these docs were implemented in flow-state v1.0. Others (3D navigation, connection threads, cluster-level physics) remain future possibilities tracked in GitHub issues and the Stumpy ideas file.
