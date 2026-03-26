import React from 'react';
import { ImageNode } from '../../types';
import { ScoredImage, TrailPoint, AffinityImage, AffinityLayer, FloatingTag, SessionArc, ArcPattern } from './flowTypes';

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

// --- Shared Layout Helpers ---

// Grid-based scatter — guarantees spatial coverage, jitter adds organic feel.
// jitterScale: 0.8 = ±40% of cell (structured), 1.2 = ±60% (messy desk feel)
export function scatterPositions(count: number, seed: string, bounds: { xMin: number; xMax: number; yMin: number; yMax: number }, jitterScale = 0.8) {
    const positions: { x: number; y: number }[] = [];
    const aspectRatio = (bounds.xMax - bounds.xMin) / (bounds.yMax - bounds.yMin);
    const cols = Math.max(2, Math.round(Math.sqrt(count * aspectRatio)));
    const rows = Math.max(2, Math.ceil(count / cols));
    const cellW = (bounds.xMax - bounds.xMin) / cols;
    const cellH = (bounds.yMax - bounds.yMin) / rows;

    const cells: number[] = [];
    for (let i = 0; i < count; i++) cells.push(i);
    for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(seed + 'shuf' + i) * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    for (let i = 0; i < count; i++) {
        const cell = cells[i];
        const col = cell % cols;
        const row = Math.floor(cell / cols);
        const jitterX = (seededRandom(seed + 'X' + (i * 31 + 7)) - 0.5) * cellW * jitterScale;
        const jitterY = (seededRandom(seed + 'Y' + (i * 37 + 13)) - 0.5) * cellH * jitterScale;
        let x = bounds.xMin + (col + 0.5) * cellW + jitterX;
        let y = bounds.yMin + (row + 0.5) * cellH + jitterY;
        x = Math.max(bounds.xMin, Math.min(bounds.xMax, x));
        y = Math.max(bounds.yMin, Math.min(bounds.yMax, y));
        positions.push({ x, y });
    }
    return positions;
}

// Compute tier opacity/scale/blur based on scroll depth (0→1)
export function getTierStyle(tier: number, depth: number): React.CSSProperties {
    let opacity: number, scale: number;

    if (tier === 0) {
        if (depth < 0.15) { opacity = 1; scale = 1; }
        else {
            const t = Math.min(1, Math.max(0, (depth - 0.15) / 0.20));
            opacity = 1 - t; scale = 1 + t * 0.5;
        }
    } else if (tier === 1) {
        const enter = Math.min(1, Math.max(0, (depth - 0.20) / 0.15));
        const exit = Math.min(1, Math.max(0, (depth - 0.46) / 0.09));
        if (depth < 0.35) { opacity = 0.15 + enter * 0.85; scale = 0.85 + enter * 0.15; }
        else if (depth < 0.46) { opacity = 1; scale = 1; }
        else { opacity = 1 - exit; scale = 1 + exit * 0.5; }
    } else {
        const exit = Math.min(1, Math.max(0, (depth - 0.68) / 0.20));
        if (depth < 0.68) { opacity = 0.85; scale = 1; }
        else { opacity = 0.85 * (1 - exit); scale = 1 + exit * 0.5; }
    }

    let filter: string | undefined;
    if (tier === 2) {
        const unblur = Math.min(1, Math.max(0, (depth - 0.42) / 0.10));
        const blurPx = 8 * (1 - unblur);
        if (blurPx > 0.5) filter = `blur(${blurPx.toFixed(1)}px)`;
    }

    return {
        opacity, transform: `scale(${scale})`, transformOrigin: 'center center',
        ...(filter ? { filter } : {}),
        ...(opacity < 0.15 ? { visibility: 'hidden' as const } : {}),
    };
}

// --- Session History Helpers ---

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

export function getColorTemperature(palette: string[]): 'warm' | 'cool' | 'neutral' {
    if (!palette.length) return 'neutral';
    let rTotal = 0, bTotal = 0;
    for (const hex of palette) {
        const [r, , b] = hexToRgb(hex);
        rTotal += r; bTotal += b;
    }
    const avgR = rTotal / palette.length;
    const avgB = bTotal / palette.length;
    if (avgR > avgB + 30) return 'warm';
    if (avgB > avgR + 30) return 'cool';
    return 'neutral';
}

export function computeSessionAffinities(
    trail: TrailPoint[],
    allImages: ImageNode[],
): { images: AffinityImage[]; floatingTags: FloatingTag[] } {
    if (trail.length === 0) return { images: [], floatingTags: [] };

    const heroIds = new Set(trail.map(t => t.id));

    // Count loop appearances per image
    const loopCounts = new Map<string, number>();
    for (const point of trail) {
        loopCounts.set(point.id, (loopCounts.get(point.id) || 0) + 1);
        for (const assetId of point.albumPool) {
            loopCounts.set(assetId, (loopCounts.get(assetId) || 0) + 1);
        }
    }

    // Trait frequency across all loops
    const traitFreq = new Map<string, number>();
    for (const point of trail) {
        for (const t of point.traits) {
            traitFreq.set(t, (traitFreq.get(t) || 0) + 1);
        }
    }

    // Floating tags: traits appearing in 2+ loops
    const floatingTags: FloatingTag[] = [];
    for (const [key, count] of traitFreq) {
        if (count >= 2) {
            const isColor = key.startsWith('color:');
            floatingTags.push({
                key,
                label: isColor ? key.slice(6) : key.slice(4),
                count,
                isColor,
                colorValue: isColor ? key.slice(6) : undefined,
            });
        }
    }
    floatingTags.sort((a, b) => b.count - a.count);

    // Center palette from heroes
    const colorFreq = new Map<string, number>();
    for (const point of trail) {
        for (const c of point.palette) colorFreq.set(c, (colorFreq.get(c) || 0) + 1);
    }
    const centerPalette = [...colorFreq.entries()]
        .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);

    // Build image lookup
    const imageMap = new Map<string, ImageNode>();
    for (const img of allImages) imageMap.set(img.id, img);

    // Score every session image
    const results: AffinityImage[] = [];
    for (const id of loopCounts.keys()) {
        const image = imageMap.get(id);
        if (!image) continue;

        const loops = loopCounts.get(id) || 0;
        const imageTags = new Set([...image.tagIds, ...(image.aiTagIds || [])]);
        let traitOverlap = 0;
        for (const [trait] of traitFreq) {
            if (trait.startsWith('tag:') && imageTags.has(trait.slice(4))) traitOverlap++;
            if (trait.startsWith('color:') && image.palette.length > 0) {
                const closest = Math.min(...image.palette.map(c => colorDist(c, trait.slice(6))));
                if (closest < COLOR_THRESHOLD) traitOverlap++;
            }
        }

        const paletteDist = centerPalette.length > 0 && image.palette.length > 0
            ? averagePaletteDistance(image.palette, centerPalette) : 200;
        const colorProximity = Math.max(0, 1 - paletteDist / 300);

        const maxLoops = Math.max(...loopCounts.values(), 1);
        const maxTraits = Math.max(traitFreq.size, 1);
        const affinityScore = 0.45 * (loops / maxLoops) + 0.30 * (traitOverlap / maxTraits) + 0.25 * colorProximity;

        let layer: AffinityLayer;
        if (loops >= 2 || (heroIds.has(id) && affinityScore > 0.4)) layer = 'gravity';
        else if (affinityScore > 0.25) layer = 'range';
        else layer = 'detour';

        // Only include images with meaningful affinity (skip low-relevance noise)
        if (affinityScore < 0.15 && !heroIds.has(id)) continue;

        results.push({ image, affinityScore, layer, loopCount: loops, isHero: heroIds.has(id) });
    }

    results.sort((a, b) => {
        const order = { gravity: 0, range: 1, detour: 2 };
        if (order[a.layer] !== order[b.layer]) return order[a.layer] - order[b.layer];
        if (a.isHero !== b.isHero) return a.isHero ? -1 : 1;
        return b.affinityScore - a.affinityScore;
    });

    // Cap to top 30 images to keep gallery focused
    return { images: results.slice(0, 30), floatingTags };
}

export function detectSessionArc(trail: TrailPoint[]): SessionArc {
    if (trail.length === 0) {
        return { pattern: 'wander', narrative: '', secondaryLine: '', tempSequence: [] };
    }

    const tempSequence = trail.map(p => getColorTemperature(p.palette));

    // Trait frequency
    const traitFreq = new Map<string, number>();
    for (const point of trail) {
        for (const t of point.traits) traitFreq.set(t, (traitFreq.get(t) || 0) + 1);
    }
    const sorted = [...traitFreq.entries()].sort((a, b) => b[1] - a[1]);
    const dominant = sorted[0];
    const secondary = sorted[1];

    const dominantLabel = dominant ? (dominant[0].startsWith('color:') ? dominant[0].slice(6) : dominant[0].slice(4)) : '';
    const secondaryLabel = secondary ? (secondary[0].startsWith('color:') ? secondary[0].slice(6) : secondary[0].slice(4)) : '';

    const n = trail.length;
    let pattern: ArcPattern;
    let narrative: string;
    let secondaryLine: string;

    // Detect pattern
    const dominantRatio = dominant ? dominant[1] / n : 0;
    const firstTemp = tempSequence[0];
    const lastTemp = tempSequence[n - 1];
    const allSameTemp = tempSequence.every(t => t === firstTemp);
    const isMonotonic = tempSequence.every((t, i) => {
        if (i === 0) return true;
        const order = { warm: 0, neutral: 1, cool: 2 };
        return order[t] >= order[tempSequence[i - 1]];
    }) || tempSequence.every((t, i) => {
        if (i === 0) return true;
        const order = { warm: 0, neutral: 1, cool: 2 };
        return order[t] <= order[tempSequence[i - 1]];
    });

    if (dominantRatio >= 0.9 && allSameTemp) {
        pattern = 'deep-dive';
        narrative = `You went deep. ${n} loops, all drawn to ${dominantLabel}.`;
        secondaryLine = secondaryLabel ? `${secondaryLabel} was your lens.` : '';
    } else if (firstTemp === lastTemp && n >= 3 && !allSameTemp) {
        pattern = 'circle-back';
        const middleTemps = tempSequence.slice(1, -1);
        const detourTemp = middleTemps.find(t => t !== firstTemp);
        const detourTrait = detourTemp === 'cool' ? 'cool tones' : detourTemp === 'warm' ? 'warm tones' : 'neutral tones';
        narrative = `You circled back. ${dominantLabel || firstTemp} was the thread through ${n} loops.`;
        secondaryLine = `The ${detourTrait} ${middleTemps.length === 1 ? 'was a single detour' : 'were a detour'}.`;
    } else if (isMonotonic && !allSameTemp && n >= 3) {
        pattern = 'drift';
        const startLabel = firstTemp;
        const endLabel = lastTemp;
        narrative = `You drifted from ${startLabel} to ${endLabel}.`;
        secondaryLine = dominantLabel ? `What started in ${dominantLabel} ended somewhere new.` : '';
    } else {
        // Check if a tag dominates even when color temp pattern is flat
        const dominantTag = sorted.find(([k]) => k.startsWith('tag:'));
        const dominantTagLabel = dominantTag ? dominantTag[0].slice(4) : '';
        const dominantTagRatio = dominantTag ? dominantTag[1] / n : 0;

        if (dominantTagLabel && dominantTagRatio >= 0.5) {
            // Tag-anchored narrative — more meaningful than "you wandered"
            pattern = 'deep-dive';
            narrative = `${dominantTagLabel.replace(/-/g, ' ')} pulled you through ${dominantTag![1]} of ${n} loops.`;
            secondaryLine = secondaryLabel
                ? `Your palette stayed ${firstTemp} throughout.`
                : '';
        } else {
            pattern = 'wander';
            const clusters = new Set(tempSequence).size;
            narrative = `You wandered. ${n} loops across ${clusters === 1 ? 'similar' : clusters} territories.`;
            secondaryLine = dominantTagLabel
                ? `${dominantTagLabel.replace(/-/g, ' ')} appeared most often.`
                : 'No single pull dominated.';
        }
    }

    return {
        pattern,
        narrative,
        secondaryLine,
        tempSequence,
        dominantTrait: dominantLabel,
        detourTrait: pattern === 'circle-back' ? 'cool' : undefined,
    };
}
