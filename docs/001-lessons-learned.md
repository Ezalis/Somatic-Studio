# 001 — Lessons Learned

What we know now, after building the orbital rings system and testing navigation patterns.

---

## Session is king

Same-day images are the strongest, most intuitive cluster. Users immediately understand "these were shot together." This needs to be visually *unmistakable*, not just another ring level.

The orbital rings experiment treated session proximity as one scoring dimension among many. But it's qualitatively different — a shoot is a *story*, not a data point. Images from the same afternoon share light, location, subject, intent. No amount of tag overlap or color matching between random images produces the same kind of coherence.

**Implication:** Session clusters deserve their own visual grammar — not just tighter spacing, but a fundamentally different treatment that reads as "these belong together" at a glance.

## Camera body is noise

Most images share the same body (X-T4, R5). Camera match creates false clustering — it's like grouping songs by "recorded in a studio." Nearly everything matches, so the signal is zero.

Lens match *is* meaningful. It tells you about shoot type: 35mm street, 85mm portrait, 100mm macro, 24-70 editorial. A lens implies intention. A body does not.

**Implication:** Remove camera body from scoring entirely. Keep lens as a lightweight technical signal, not a primary clustering dimension.

## Sprites create delight but block navigation

The EsotericSprite system produces genuine moments of surprise and discovery. People explore *more* with abstract sprites — the mystery creates curiosity, the reveal creates satisfaction.

But they can't navigate *efficiently*. When you're looking for "that portrait from last week," an abstract glyph gives you nothing to work with. You're reduced to random clicking.

The tension between surprise and usability is real and irreducible. You can't have both maximum mystery and maximum navigability.

**Implication:** The answer isn't sprites OR images — it's contextual reveal. Distance and attention should drive the representation. Far away = atmospheric impression. Close = recognizable image. The sprite energy lives in the atmospheric layer, not as a replacement for the image.

## UI chrome competes with content

The "Somatic Studio" title box, satellite panel buttons, field notes annotations, and rough container borders all fight for attention with the actual content. In a galaxy metaphor, you shouldn't see the walls of the planetarium.

Every pixel of fixed chrome is a pixel not available for the experience. Every label that's always visible is one more thing competing with the images themselves.

**Implication:** Remove all fixed chrome. Navigation cues should emerge from the content — cluster labels near their group, connection indicators on proximity, metadata on focus. HUD-style, not window-dressing.

## Color clustering works but is coarse

RGB Euclidean distance misses perceptual similarity. Two images can "feel" similar — warm golden hour light, soft amber tones — but score poorly because one has a blue sky background while the other has warm brick.

The 5-color palette extraction captures the dominant colors, but comparing palettes as flat arrays loses the gestalt. What matters is the *feeling* of the palette — warm vs cool, muted vs saturated, high contrast vs low contrast — not individual color distances.

**Implication:** Consider perceptual color spaces (HSL, CIE LAB) instead of RGB. And consider palette-level features (average warmth, saturation range, contrast ratio) alongside individual color distances.

## Tag overlap is the best cross-session connector

When images from different days share 3+ meaningful tags, that's a genuine conceptual relationship, not just metadata coincidence. "Portrait" + "Natural Light" + "Urban" across two different sessions means the photographer was exploring the same idea twice.

Single-tag matches are often meaningless (everything is "Photography"). But multi-tag intersections reveal real threads of creative intent running across time.

**Implication:** Tag overlap should be the primary mechanism for connecting images *across* sessions. Within a session, temporal proximity is sufficient. The tag system is the bridge between temporal islands.

## The grid view (NONE mode) is dead space

The current grid entry is a parking lot. Uniform spacing, no personality, no visual structure, no invitation to explore. It communicates "here are your files" instead of "here is your world."

The entry point should itself be the galaxy. Before you've clicked anything, you should already see structure — clusters, density variations, hints of the relationships waiting to be explored.

**Implication:** Grid mode needs to die as a flat grid. The "no anchor" state should be the galaxy overview — pre-clustered, atmospheric, alive. Entering the app means landing in space, not opening a file browser.
