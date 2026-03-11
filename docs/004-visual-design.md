# 004 — Visual Design

Contextual reveal + 2.5D depth. Progressive disclosure based on attention and distance, combined with depth to encode relationship strength.

---

## Progressive reveal layers

The representation of an image changes based on distance and attention. Nothing is static — everything responds to where you are and where you're looking.

### Distant / unfocused

Soft blur + color aura. A watercolor impression of the image — you sense the palette and mood without seeing the subject. Not a sprite, not a sharp photo. An atmospheric hint.

This is where the EsotericSprite energy lives — not as a literal glyph, but as an abstract, atmospheric presence. You know something is there. You know its color and feeling. You don't know what it is yet.

### Mid-range / cluster member

Small but recognizable thumbnail with depth/glow treatment. You can identify what the image *is* — a portrait, a landscape, a detail shot. But it's not fully resolved. It invites closer inspection.

Session cluster members at mid-range might show as a filmstrip or photo pile — recognizable as a group, with individual images partially visible.

### Focused / hovered

Full clarity with contextual metadata. The image becomes a portal. Metadata radiates from it — date, tags, shared attributes with the current anchor. Connection threads light up showing why this image is here.

### Hero / anchored

The image you're orbiting. Full resolution, centered, dominant. Everything else is positioned relative to it. The hero isn't in a frame or a card — it IS the center of the viewport.

## 2.5D as convergent/divergent signal

Depth encodes relationship strength without needing labels, scores, or explicit UI.

**Convergent images** — many shared dimensions with the hero — come *forward*. Larger, sharper, closer in z-space. They feel near, important, related.

**Divergent images** — few shared dimensions, gateway nodes, distant clusters — recede. Smaller, softer, depth-blurred. They're visible but clearly "far away" in relationship space.

The 2.5D field communicates relationship strength through the most intuitive visual channel: proximity. Close things are related. Far things are distant. No legend needed.

**Camera pan creates parallax:** When the viewport shifts (following the hero, tracking cursor movement), convergent nodes feel anchored near you — they move with you. Divergent nodes drift in the background — they move against you, like distant mountains when you drive. This parallax reinforces the depth relationship continuously.

## Multi-dimension collision visualization

The hardest unsolved problem: how to show that an image is connected by *multiple* dimensions simultaneously.

The current system picks a "dominant" dimension and ignores the rest. But the most interesting images are exactly the ones connected by multiple dimensions — same day AND shared tags AND similar palette. These multi-collision nodes are the richest, most meaningful connections.

### Ideas to explore

**Composite glow / aura:**
Each dimension contributes a color channel to the node's glow. Tag overlap = purple thread. Color similarity = amber warmth. Session proximity = blue-white intensity. Temporal = soft green. A node connected by tags AND color gets a warm violet aura. More dimensions = richer, more complex glow.

*Pro:* Beautiful, atmospheric, doesn't require reading.
*Con:* Hard to distinguish specific dimensions at a glance. More of a "feeling" than information.

**Connection threads:**
Visible lines between hero and neighbor, colored by dimension. A node with 3 active connections shows 3 threads of different colors converging on it. Dense connections = clearly important node.

*Pro:* Explicit, scannable, shows exactly which dimensions are active.
*Con:* Can become visual clutter with many connections. Needs careful opacity/thickness management.

**Layered rings / halos:**
Concentric rings around the node, one per active dimension. A 4-dimension collision shows 4 nested rings, each in its dimension color. Simple, scannable.

*Pro:* Clear, countable, no clutter between nodes.
*Con:* Gets busy on the node itself. Competes with the image.

**Size + depth combined:**
Multi-dimension nodes get both size boost AND forward z-position. Single-dimension nodes are small and recessed. The eye naturally gravitates to large, near objects — no labels needed.

*Pro:* Leverages existing 2.5D system. No additional visual elements.
*Con:* Doesn't tell you *which* dimensions — just "many" vs "few."

**Proximity reveal badge:**
On approach/hover, a small badge shows dimension icons (clock, palette, tag, lens) — lit up for active connections, dim for inactive. Quick visual scan of *why* this node is here.

*Pro:* Precise information, minimal screen impact, contextual.
*Con:* Only visible on hover — not ambient.

### Likely direction

Combine **size + depth** (ambient, always communicating) with **proximity reveal badges** (precise, on demand). The 2.5D field gives you the gestalt — "this one is important." The badge gives you the explanation — "it's connected by session, tags, and color."

Connection threads for the hero's *immediate* neighbors only (not the whole galaxy). Keeps threads informative without creating a web of lines.

## Full immersion — all modes

The immersive treatment isn't just for IMAGE focus mode. It's for everything.

**Remove all fixed chrome:**
- No Somatic Studio title box
- No satellite panel toggle buttons with fixed positions
- No rough container borders
- No field notes annotations on the edges

**Grid / entry mode:**
Even the no-anchor state should feel like entering a galaxy. A field of stars with visible structure — not a parking lot of thumbnails. Session clusters are visible as dense groups. Thematic threads connect across the field. You land in the middle of it.

**Navigation cues from content:**
- Cluster labels float near their group, appearing on proximity
- Connection lines emerge on hover, showing relationships
- Navigation hints appear near gateways ("5 more from this session →")
- All text is positioned relative to content, not fixed to viewport

**Full-bleed experience:**
No margins. No boxes. No viewport borders. The galaxy extends to every edge of the screen. The browser window is a viewport into infinite space.
