import { ImageNode } from '../../types';
import { ScoredImage } from './flowTypes';

export function seededRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    return ((hash & 0x7fffffff) % 1000) / 1000;
}

// TODO: Unify with useRelevanceScoring (issue #20)
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
