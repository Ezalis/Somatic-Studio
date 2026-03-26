import { ImageNode } from '../../types';
import { ScoredImage, TrailPoint, AffinityImage, AffinityLayer } from './flowTypes';

export function seededRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    return ((hash & 0x7fffffff) % 1000) / 1000;
}

export function scoreRelevance(image: ImageNode, anchor: ImageNode): ScoredImage {
    if (image.id === anchor.id) return { image, score: 1, sharedTags: [], sharedCamera: false, sharedLens: false, sharedSeason: false, isBridge: false, isTemporalNeighbor: false };
    let score = 0;

    const daysDiff = Math.abs(image.captureTimestamp - anchor.captureTimestamp) / 86400000;
    const isTemporalNeighbor = image.shootDayClusterId === anchor.shootDayClusterId || daysDiff < 7;
    if (image.shootDayClusterId === anchor.shootDayClusterId) score += 0.4;
    else if (daysDiff < 30) score += 0.1 * (1 - daysDiff / 30);

    const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
    const sharedTags = [...new Set([...image.tagIds, ...(image.aiTagIds || [])])].filter(t => anchorTags.has(t));
    score += Math.min(sharedTags.length * 0.12, 0.4);

    const sharedCamera = image.cameraModel === anchor.cameraModel && anchor.cameraModel !== 'Unknown Camera';
    const sharedLens = image.lensModel === anchor.lensModel && anchor.lensModel !== 'Unknown Lens';
    const sharedSeason = image.inferredSeason === anchor.inferredSeason;
    if (sharedCamera) score += 0.05;
    if (sharedLens) score += 0.05;
    if (sharedSeason) score += 0.05;

    const totalTags = new Set([...image.tagIds, ...(image.aiTagIds || [])]).size;
    const isBridge = sharedTags.length === 1 && totalTags > 2 && score < 0.35;

    return { image, score: Math.min(score, 1), sharedTags, sharedCamera, sharedLens, sharedSeason, isBridge, isTemporalNeighbor };
}

// Equivalent to hexToRgbVals in dataService.ts — unify in issue #20
export function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function colorDist(a: string, b: string): number {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

export const COLOR_THRESHOLD = 80;

export function averagePaletteDistance(a: string[], b: string[]): number {
    if (!a.length || !b.length) return 300;
    let total = 0;
    for (const ca of a) {
        let min = Infinity;
        for (const cb of b) min = Math.min(min, colorDist(ca, cb));
        total += min;
    }
    return total / a.length;
}

/**
 * Compute session affinities: score every image that appeared in the session,
 * assign to gravity/range/detour layers based on cross-loop frequency,
 * trait overlap, and color proximity to the session's center palette.
 */
export function computeSessionAffinities(trail: TrailPoint[], allImages: ImageNode[]): AffinityImage[] {
    if (trail.length === 0) return [];

    // Collect hero IDs
    const heroIds = new Set(trail.map(t => t.id));

    // Count how many loops each image appeared in
    const loopCounts = new Map<string, number>();
    for (const point of trail) {
        // Hero counts as appearing in its own loop
        loopCounts.set(point.id, (loopCounts.get(point.id) || 0) + 1);
        for (const assetId of point.albumPool) {
            loopCounts.set(assetId, (loopCounts.get(assetId) || 0) + 1);
        }
    }

    // Gather all unique traits across the session
    const allTraits = new Set<string>();
    for (const point of trail) {
        for (const t of point.traits) allTraits.add(t);
    }

    // Compute the session's "center palette" — most frequent palette colors across heroes
    const colorFreq = new Map<string, number>();
    for (const point of trail) {
        for (const c of point.palette) {
            colorFreq.set(c, (colorFreq.get(c) || 0) + 1);
        }
    }
    const centerPalette = [...colorFreq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([c]) => c);

    // Build image lookup
    const imageMap = new Map<string, ImageNode>();
    for (const img of allImages) imageMap.set(img.id, img);

    // Score every image that appeared in the session
    const results: AffinityImage[] = [];
    const sessionImageIds = new Set(loopCounts.keys());

    for (const id of sessionImageIds) {
        const image = imageMap.get(id);
        if (!image) continue;

        const loops = loopCounts.get(id) || 0;

        // Trait overlap: how many session traits match this image's tags/colors
        const imageTags = new Set([...image.tagIds, ...(image.aiTagIds || [])]);
        let traitOverlap = 0;
        for (const trait of allTraits) {
            if (trait.startsWith('tag:') && imageTags.has(trait.slice(4))) traitOverlap++;
            if (trait.startsWith('color:') && image.palette.length > 0) {
                const traitColor = trait.slice(6);
                const closest = Math.min(...image.palette.map(c => colorDist(c, traitColor)));
                if (closest < COLOR_THRESHOLD) traitOverlap++;
            }
        }

        // Color proximity to center palette
        const paletteDist = centerPalette.length > 0 && image.palette.length > 0
            ? averagePaletteDistance(image.palette, centerPalette)
            : 200;
        const colorProximity = Math.max(0, 1 - paletteDist / 300);

        // Composite score (0-1)
        const maxLoops = Math.max(...loopCounts.values(), 1);
        const maxTraits = Math.max(allTraits.size, 1);
        const affinityScore = (
            0.45 * (loops / maxLoops) +
            0.30 * (traitOverlap / maxTraits) +
            0.25 * colorProximity
        );

        // Layer assignment
        let layer: AffinityLayer;
        if (loops >= 2 || (heroIds.has(id) && affinityScore > 0.4)) {
            layer = 'gravity';
        } else if (affinityScore > 0.25) {
            layer = 'range';
        } else {
            layer = 'detour';
        }

        results.push({
            image,
            affinityScore,
            layer,
            loopCount: loops,
            isHero: heroIds.has(id),
        });
    }

    // Sort within each layer: highest affinity first, heroes float up
    results.sort((a, b) => {
        const layerOrder = { gravity: 0, range: 1, detour: 2 };
        if (layerOrder[a.layer] !== layerOrder[b.layer]) return layerOrder[a.layer] - layerOrder[b.layer];
        if (a.isHero !== b.isHero) return a.isHero ? -1 : 1;
        return b.affinityScore - a.affinityScore;
    });

    return results;
}
