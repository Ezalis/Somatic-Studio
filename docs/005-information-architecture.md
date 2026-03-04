# 005 — Information Architecture

Text, guidance, and navigation clarity — across all modes, not just IMAGE focus.

---

## The paradox

Two goals that compete:
- "Whole screen responsive and alive" — maximize immersion, minimize UI
- "Text, information, and navigation guidance very clear" — maximize clarity, add UI

The tension is real. Every label you add is a pixel of chrome. Every label you remove is a navigation cue lost. You can't resolve this by choosing one side — you need a system that provides *both* depending on context.

## Resolution: contextual information layers

Information density scales with attention and proximity. Four layers, from ambient to explicit.

### Layer 1 — Ambient (always visible, very subtle)

**What:** Background color/mood shifts with neighborhood palette. Particle density indicates cluster richness. Subtle drift and motion.

**Where:** The entire viewport. The background itself is information.

**Active in:** All modes. Even the grid entry is atmospheric. The ambient layer never turns off.

**No text.** Pure atmosphere. You can't "read" this layer — you *feel* it. Warm means golden hour neighborhood. Dense particles mean a rich cluster region. Calm means sparse territory.

### Layer 2 — Proximity (visible near cursor/focus)

**What:** Cluster labels, connection threads, neighbor counts, dominant theme indicators.

**Where:** Near the relevant content. A cluster label floats beside its group. Connection threads span between related images. Counts appear near the hero.

**Active in:** All modes. In grid/galaxy view, hovering near a cluster region shows what binds those images. In image focus, proximity to a neighbor shows why it's there.

**Trigger:** Cursor proximity or keyboard focus. Information appears as you approach and fades as you move away. The cursor is a flashlight — it illuminates what's nearby.

**Typography:** Hand font (Caveat) for cluster names and narrative labels. Short, evocative names — "Mar 2 Session," "Portrait Series," "Golden Hour Thread."

### Layer 3 — Focus (visible on hover/select)

**What:** Image metadata (date, camera, lens), shared attributes with hero ("3 tags, similar palette"), navigation hints ("5 more from this session →"), multi-dimension collision badges.

**Where:** Adjacent to the focused image. Not in a separate panel — near the image itself, like captions in a museum.

**Active in:** Image focus mode and grid/galaxy hover.

**Trigger:** Direct hover or keyboard select. Explicit attention on a specific image.

**Typography:** Mono (JetBrains Mono) for data — dates, counts, technical specs. High contrast, clear hierarchy. Data should look like data, not decoration.

### Layer 4 — Detail (explicit open)

**What:** Full EXIF data, complete tag list, exploration history trail, editing tools.

**Where:** DetailView overlay — deliberately opened, deliberately closed.

**Active in:** Any mode, triggered by explicit action (Enter key, double-click, long-press).

**Not ambient.** This is the one layer that requires intentional opening. It's the reference manual, not the experience.

## Grid entry reimagined

The current grid is a parking lot — dead, uniform, every image the same size in a flat grid. It communicates "file browser" instead of "living gallery."

**New vision:** The grid IS the galaxy view. The no-anchor state isn't "nothing selected" — it's "seeing everything."

**Pre-clustered layout:**
- Session clusters visible as tight clouds (images grouped by shoot)
- Thematic threads visible as loose constellations (shared tags across sessions)
- Density variations showing where the collection is rich and where it's sparse
- Color neighborhoods as atmospheric zones (background tint shifts across regions)

**Entering the app = landing in the galaxy.** Before any interaction, you already see structure. You already sense what's here. The first click isn't "selecting an item" — it's "zooming into a region."

**Animation:** Clicking an image triggers a zoom — the galaxy view doesn't disappear, it recedes. The clicked image's cluster comes forward. The transition communicates "you're going deeper," not "you're opening a new page."

## Typography approach

Three fonts, three roles:

| Font | Role | Usage |
|------|------|-------|
| Inter | Body/navigation | Sparse. For rare fixed-position elements if any survive. |
| JetBrains Mono | Data | Dates, counts, technical specs, EXIF values, dimension badges. |
| Caveat | Narrative/labels | Cluster names, navigation hints, emotional/descriptive labels. |

**Sizing:** Large, high-contrast. Not small muted labels — visible, readable, confident. If text appears, it should be worth reading. If it's not worth reading at 16px, it shouldn't appear at all.

**Positioning:** Relative to content, not fixed to viewport. Text belongs near what it describes. Cluster labels near their cluster. Image metadata near the image. No sidebar panels, no fixed headers, no bottom bars.

**Lifecycle:** Text appears on proximity/focus and disappears when attention moves away. Nothing is always-on except the ambient layer (which has no text). The screen can be completely text-free when nothing is hovered — and that's correct.

## Navigation clarity without chrome

How does the user know what they can do?

**Cursor feedback:** The cursor changes near interactive elements. Images have hover states. Clusters have approach states. The cursor itself communicates "you can act here."

**Spatial logic:** Closer things are more related. Bigger things are more important. Brighter things are more active. These aren't learned conventions — they're spatial intuitions. The navigation *makes sense* without instructions.

**Progressive disclosure:** The first time you hover a cluster, you see its label. The first time you click a neighbor, you see the transition. The first time you press Escape, you zoom out. Each action teaches the next. The Field Guide exists for those who want the manual upfront — but the experience should be learnable by doing.

**Keyboard hints:** On first keyboard interaction, subtle key hints appear near relevant targets. Arrow indicators near neighbors. Enter indicator on the focused node. Escape indicator for zoom-out. These fade after first use — they're training wheels, not permanent UI.
