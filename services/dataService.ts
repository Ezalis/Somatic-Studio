import { ImageNode, Tag, TagType, ExperienceNode, ScoreBreakdown, ZoneName, ZoneSummary, NeighborhoodSummary } from '../types';

// --- Utilities ---

export const getSeason = (date: Date): string => {
    const month = date.getMonth(); // 0-11
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';
    if (month >= 8 && month <= 10) return 'Autumn';
    return 'Winter';
};

export const formatShutterSpeed = (val?: number) => {
    if (!val) return '--';
    if (val >= 1) return val.toString();
    return `1/${Math.round(1 / val)}`;
};

// --- COLOR MATH UTILS ---

export const hexToRgbVals = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [220, 220, 220];
}

export const hexToRgb = (hex: string) => { const [r, g, b] = hexToRgbVals(hex); return { r, g, b }; }

export const getColorDistSq = (hex1: string, hex2: string) => {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    return (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2;
};

export const getMinPaletteDistance = (p1: string[], p2: string[]): number => {
    let min = Infinity;
    for (const c1 of p1) {
        for (const c2 of p2) {
            const d = getColorDistSq(c1, c2);
            if (d < min) min = d;
        }
    }
    return min;
};

// --- ZONE LAYOUT ---

// Max expected score per dimension (for normalizing zone strength)
export const DIMENSION_MAX: Record<string, number> = {
    temporal:  520,
    thematic:  150,
    visual:    200,
    technical: 20,
};

// Zone compass vectors: temporal=top(-Y), thematic=right(+X), visual=bottom(+Y), technical=left(-X)
const ZONE_VECTORS: Record<string, { dx: number; dy: number }> = {
    temporal:  { dx: 0, dy: -1 },
    thematic:  { dx: 1, dy: 0 },
    visual:    { dx: 0, dy: 1 },
    technical: { dx: -1, dy: 0 },
};

export interface ZoneTarget {
    x: number;
    y: number;
    angle: number;
    distance: number;
}

/**
 * Compute the zone-targeted position for a neighbor node.
 * Direction is a weighted blend of zone vectors based on positive dimension scores.
 * Distance from hero is inversely proportional to score rank (closest = highest scoring).
 */
export function getZoneTarget(
    breakdown: ScoreBreakdown,
    heroCx: number,
    heroCy: number,
    rank: number,
    totalVisible: number,
    mobile: boolean,
    clusterAngles?: Map<ZoneName, number>
): ZoneTarget {
    const dims = (['temporal', 'thematic', 'visual', 'technical'] as const)
        .map(key => ({ key, value: Math.max(0, breakdown[key]) }));

    const totalPositive = dims.reduce((s, d) => s + d.value, 0);

    let dx = 0;
    let dy = 0;

    if (totalPositive > 0) {
        if (clusterAngles && clusterAngles.size > 0) {
            // Dynamic cluster angles
            for (const d of dims) {
                const angle = clusterAngles.get(d.key);
                if (angle === undefined) continue;
                const weight = d.value / totalPositive;
                dx += Math.cos(angle) * weight;
                dy += Math.sin(angle) * weight;
            }
        } else {
            // Fallback: fixed compass vectors
            for (const d of dims) {
                const vec = ZONE_VECTORS[d.key];
                const weight = d.value / totalPositive;
                dx += vec.dx * weight;
                dy += vec.dy * weight;
            }
        }
    } else {
        // Fallback: spread evenly using rank as angle
        const angle = (rank / Math.max(1, totalVisible)) * Math.PI * 2;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
    }

    const angle = Math.atan2(dy, dx);
    const vecLen = Math.sqrt(dx * dx + dy * dy) || 1;
    const normDx = dx / vecLen;
    const normDy = dy / vecLen;

    // Distance: closest ring for rank 0, farthest for last rank
    const minDist = mobile ? 140 : 190;
    const maxDist = mobile ? 300 : 450;
    const t = totalVisible <= 1 ? 0 : rank / (totalVisible - 1);
    const distance = minDist + t * (maxDist - minDist);

    return {
        x: heroCx + normDx * distance,
        y: heroCy + normDy * distance,
        angle,
        distance,
    };
}

export const extractColorPalette = (img: HTMLImageElement): string[] => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return ['#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b']; 
    const maxDim = 100;
    const scale = Math.min(maxDim / img.width, maxDim / img.height);
    canvas.width = Math.floor(img.width * scale);
    canvas.height = Math.floor(img.height * scale);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colorCounts: Record<string, number> = {};
    for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i];
        const g = imageData[i+1];
        const b = imageData[i+2];
        const a = imageData[i+3];
        if (a < 128) continue;
        if (r > 250 && g > 250 && b > 250) continue;
        if (r < 15 && g < 15 && b < 15) continue;
        const binSize = 16;
        const rQ = Math.floor(r / binSize) * binSize + (binSize / 2);
        const gQ = Math.floor(g / binSize) * binSize + (binSize / 2);
        const bQ = Math.floor(b / binSize) * binSize + (binSize / 2);
        const key = `${Math.floor(rQ)},${Math.floor(gQ)},${Math.floor(bQ)}`;
        colorCounts[key] = (colorCounts[key] || 0) + 1;
    }
    const sortedCandidates = Object.entries(colorCounts)
        .sort(([, countA], [, countB]) => countB - countA)
        .map(([key]) => {
            const [r, g, b] = key.split(',').map(Number);
            return { r, g, b, hex: `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}` };
        });
    const palette: string[] = [];
    const thresholds = [3600, 2500, 900, 100, 0]; 
    for (const threshold of thresholds) {
        if (palette.length >= 5) break;
        for (const candidate of sortedCandidates) {
            if (palette.length >= 5) break;
            const isDistinct = palette.every(selectedHex => getColorDistSq(candidate.hex, selectedHex) >= threshold);
            if (isDistinct) palette.push(candidate.hex);
        }
    }
    while (palette.length < 5) palette.push('#e4e4e7'); 
    return palette.slice(0, 5);
};

// --- RELATIONSHIP ANALYSIS ---

export const getIntersectionAttributes = (imgA: ImageNode, imgB: ImageNode, allTags: Tag[]) => {
    const tagsA = new Set([...imgA.tagIds, ...(imgA.aiTagIds||[])]);
    const tagsB = new Set([...imgB.tagIds, ...(imgB.aiTagIds||[])]);
    const commonTagIds = [...tagsA].filter(x => tagsB.has(x));
    const commonTags = commonTagIds.map(id => allTags.find(t => t.id === id)).filter(Boolean) as Tag[];
    
    const colorMatches: {cA: string, cB: string}[] = [];
    const usedB = new Set<string>();
    imgA.palette.forEach(cA => {
        let bestMatch = null;
        let minDist = 3000;
        imgB.palette.forEach(cB => {
            if (usedB.has(cB)) return;
            const dist = getColorDistSq(cA, cB);
            if (dist < minDist) { minDist = dist; bestMatch = cB; }
        });
        if (bestMatch) { colorMatches.push({ cA, cB: bestMatch }); usedB.add(bestMatch); }
    });
    
    const techMatches: string[] = [];
    if (imgA.cameraModel === imgB.cameraModel && imgA.cameraModel !== 'Unknown Camera') techMatches.push(imgA.cameraModel);
    if (imgA.iso === imgB.iso) techMatches.push(`ISO ${imgA.iso}`);
    if (imgA.inferredSeason === imgB.inferredSeason) techMatches.push(imgA.inferredSeason);
    
    const d1 = new Date(imgA.captureTimestamp);
    const d2 = new Date(imgB.captureTimestamp);
    if (d1.toDateString() === d2.toDateString()) techMatches.push("Same Day");
    else if (Math.abs(imgA.captureTimestamp - imgB.captureTimestamp) < 3600000) techMatches.push("Within 1 Hour");
    
    return { commonTags, colorMatches, techMatches };
};

export const MONO_KEYWORDS = ['b&w', 'black & white', 'black and white', 'monochrome', 'grayscale', 'noir', 'silver gelatin'];

export const isMonochrome = (tags: Tag[], tagIds: string[]) => {
    return tagIds.some(id => {
        const tag = tags.find(t => t.id === id);
        return tag && MONO_KEYWORDS.some(k => tag.label.toLowerCase().includes(k));
    });
};

export const getDominantColorsFromNodes = (nodes: ExperienceNode[], count: number = 5, excludeColor?: string): string[] => {
    const colorCounts: Record<string, number> = {};
    nodes.forEach(node => {
        node.original.palette.forEach(color => {
            if (excludeColor && color === excludeColor) return;
            colorCounts[color] = (colorCounts[color] || 0) + 1;
        });
    });
    return Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).slice(0, count).map(entry => entry[0]);
};

export const getRelatedTagsFromNodes = (nodes: ExperienceNode[], tags: Tag[], count: number = 6, excludeTagId?: string, nsfwTagId?: string, nsfwFilterActive: boolean = false): Tag[] => {
    const tagCounts: Record<string, number> = {};
    nodes.forEach(node => {
        const allTags = [...node.original.tagIds, ...(node.original.aiTagIds || [])];
        allTags.forEach(tId => {
            if (tId === excludeTagId) return;
            const t = tags.find(tag => tag.id === tId);
            if (!t) return;
            if (t.type !== TagType.AI_GENERATED) return;
            if (t.label.toLowerCase().trim() === 'nsfw') return;
            tagCounts[tId] = (tagCounts[tId] || 0) + 1;
        });
    });
    return Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, count).map(([id]) => tags.find(t => t.id === id)).filter((t): t is Tag => {
        if (!t) return false;
        if (nsfwFilterActive && t.label.trim().toLowerCase() === 'nsfw') return false;
        return true;
    });
};

// --- ZONE SUMMARIZATION ---

const ZONE_KEYS: ZoneName[] = ['temporal', 'thematic', 'visual', 'technical'];

/**
 * Determine which zone a node belongs to by comparing normalized dimension scores.
 * Highest normalized value wins.
 */
export function getDominantZone(breakdown: ScoreBreakdown): ZoneName {
    let best: ZoneName = 'temporal';
    let bestNorm = -Infinity;
    for (const key of ZONE_KEYS) {
        const norm = breakdown[key] / DIMENSION_MAX[key];
        if (norm > bestNorm) {
            bestNorm = norm;
            best = key;
        }
    }
    return best;
}

/**
 * Group neighbor nodes into zones by their dominant scoring dimension.
 */
export function groupNodesByZone(neighbors: ExperienceNode[]): Map<ZoneName, ExperienceNode[]> {
    const groups = new Map<ZoneName, ExperienceNode[]>();
    for (const node of neighbors) {
        if (!node.scoreBreakdown) continue;
        const zone = getDominantZone(node.scoreBreakdown);
        const list = groups.get(zone) || [];
        list.push(node);
        groups.set(zone, list);
    }
    return groups;
}

/**
 * Compute evenly-spaced angular positions for populated zones.
 * Angles start from top (-π/2) and proceed clockwise.
 * Only zones with at least one member get an angle.
 */
export function computeClusterAngles(neighbors: ExperienceNode[]): Map<ZoneName, number> {
    const groups = groupNodesByZone(neighbors);
    const populated = ZONE_KEYS.filter(key => (groups.get(key)?.length ?? 0) > 0);
    if (populated.length === 0) return new Map();

    const step = (2 * Math.PI) / populated.length;
    const startAngle = -Math.PI / 2;
    const angles = new Map<ZoneName, number>();
    populated.forEach((zone, i) => {
        angles.set(zone, startAngle + i * step);
    });
    return angles;
}

function summarizeTemporalZone(nodes: ExperienceNode[], anchorImg: ImageNode): ZoneSummary {
    const anchorDate = new Date(anchorImg.captureTimestamp);
    const anchorDay = anchorDate.toDateString();
    const sameDay = nodes.filter(n => new Date(n.original.captureTimestamp).toDateString() === anchorDay);
    const oneWeekMs = 7 * 24 * 3600 * 1000;
    const sameWeek = nodes.filter(n => Math.abs(n.original.captureTimestamp - anchorImg.captureTimestamp) < oneWeekMs);

    let label: string;
    let sublabel: string;

    if (sameDay.length === nodes.length) {
        label = 'Same Session';
        const monthDay = anchorDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
        sublabel = `${nodes.length} from ${monthDay}`;
    } else if (sameWeek.length >= nodes.length * 0.7) {
        label = 'Same Week';
        const monthDay = anchorDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
        sublabel = `${nodes.length} near ${monthDay}`;
    } else {
        const season = anchorImg.inferredSeason;
        const year = anchorDate.getFullYear();
        label = `${season} ${year}`;
        sublabel = `${nodes.length} seasonal neighbors`;
    }

    return { zone: 'temporal', count: nodes.length, label, sublabel };
}

function summarizeThematicZone(nodes: ExperienceNode[], anchorImg: ImageNode, allTags: Tag[]): ZoneSummary {
    const anchorTagSet = new Set([...anchorImg.tagIds, ...(anchorImg.aiTagIds || [])]);
    const tagCounts: Record<string, number> = {};

    for (const node of nodes) {
        const nodeTags = [...node.original.tagIds, ...(node.original.aiTagIds || [])];
        for (const tid of nodeTags) {
            if (anchorTagSet.has(tid)) {
                tagCounts[tid] = (tagCounts[tid] || 0) + 1;
            }
        }
    }

    const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
    const topTags = sorted.slice(0, 2).map(([id]) => {
        const t = allTags.find(tag => tag.id === id);
        return t ? t.label : '';
    }).filter(Boolean);

    const label = topTags.length > 0 ? topTags.join(', ') : 'Shared Concepts';
    const totalShared = sorted.length;
    const sublabel = `${nodes.length} with ${totalShared} shared concept${totalShared !== 1 ? 's' : ''}`;

    return { zone: 'thematic', count: nodes.length, label, sublabel };
}

function summarizeVisualZone(nodes: ExperienceNode[], anchorImg: ImageNode, allTags: Tag[]): ZoneSummary {
    const allTagIds = [...anchorImg.tagIds, ...(anchorImg.aiTagIds || [])];
    const mono = isMonochrome(allTags, allTagIds);

    if (mono) {
        return { zone: 'visual', count: nodes.length, label: 'Monochrome', sublabel: `${nodes.length} palette matches` };
    }

    // Determine warm/cool/neutral by averaging R vs B channels across zone node palettes
    let totalR = 0;
    let totalB = 0;
    let samples = 0;
    for (const node of nodes) {
        for (const hex of node.original.palette) {
            const [r, , b] = hexToRgbVals(hex);
            totalR += r;
            totalB += b;
            samples++;
        }
    }

    let label: string;
    if (samples === 0) {
        label = 'Color Kin';
    } else {
        const avgR = totalR / samples;
        const avgB = totalB / samples;
        if (avgR > avgB + 20) label = 'Warm Tones';
        else if (avgB > avgR + 20) label = 'Cool Palette';
        else label = 'Neutral Tones';
    }

    return { zone: 'visual', count: nodes.length, label, sublabel: `${nodes.length} palette match${nodes.length !== 1 ? 'es' : ''}` };
}

function summarizeTechnicalZone(nodes: ExperienceNode[], anchorImg: ImageNode): ZoneSummary {
    const camera = anchorImg.cameraModel;
    const lens = anchorImg.lensModel;

    const cameraMatches = nodes.filter(n => n.original.cameraModel === camera && camera !== 'Unknown Camera');
    const lensMatches = nodes.filter(n => n.original.lensModel === lens && lens !== 'Unknown Lens');

    let label: string;
    let sublabel: string;

    if (cameraMatches.length > 0 && lensMatches.length > 0) {
        label = camera;
        sublabel = `${nodes.length} on ${camera.split(' ').pop()} + ${lens.split(' ').pop()}`;
    } else if (cameraMatches.length > 0) {
        label = camera;
        sublabel = `${nodes.length} on ${camera}`;
    } else if (lensMatches.length > 0) {
        label = lens;
        sublabel = `${nodes.length} with ${lens}`;
    } else {
        label = 'Same Setup';
        sublabel = `${nodes.length} similar settings`;
    }

    return { zone: 'technical', count: nodes.length, label, sublabel };
}

/**
 * Build a complete neighborhood summary: zone groupings, summaries, and narrative.
 */
export function buildNeighborhoodSummary(
    neighbors: ExperienceNode[],
    anchorImg: ImageNode,
    allTags: Tag[]
): NeighborhoodSummary {
    const groups = groupNodesByZone(neighbors);
    const zones: ZoneSummary[] = [];

    const summarizers: Record<ZoneName, (nodes: ExperienceNode[]) => ZoneSummary> = {
        temporal:  (nodes) => summarizeTemporalZone(nodes, anchorImg),
        thematic:  (nodes) => summarizeThematicZone(nodes, anchorImg, allTags),
        visual:    (nodes) => summarizeVisualZone(nodes, anchorImg, allTags),
        technical: (nodes) => summarizeTechnicalZone(nodes, anchorImg),
    };

    for (const key of ZONE_KEYS) {
        const nodes = groups.get(key);
        if (!nodes || nodes.length === 0) continue;
        zones.push(summarizers[key](nodes));
    }

    // Build narrative
    const parts: string[] = [];
    for (const z of zones) {
        switch (z.zone) {
            case 'temporal':
                parts.push(`${z.count} from the same ${z.label.toLowerCase().includes('session') ? 'shooting session' : z.label.toLowerCase().includes('week') ? 'week' : 'season'}`);
                break;
            case 'thematic':
                parts.push(`${z.count} sharing ${z.label} themes`);
                break;
            case 'visual':
                parts.push(`${z.count} with ${z.label.toLowerCase()}`);
                break;
            case 'technical':
                parts.push(`${z.count} shot on the same ${z.label}`);
                break;
        }
    }

    let narrative: string;
    if (parts.length === 0) {
        narrative = `This image connects to ${neighbors.length} neighbors.`;
    } else if (parts.length === 1) {
        narrative = `This image connects to ${neighbors.length} neighbor${neighbors.length !== 1 ? 's' : ''} — ${parts[0]}.`;
    } else {
        const last = parts.pop()!;
        narrative = `This image connects to ${neighbors.length} neighbors — ${parts.join(', ')}, and ${last}.`;
    }

    return { zones, totalNeighbors: neighbors.length, narrative };
}

// --- HERO EQUILIBRIUM ---

/**
 * Compute the hero's dynamic equilibrium position based on neighbor positions.
 * Places the hero on the opposite side of viewport center from the weighted neighbor centroid,
 * clamped to a comfort zone (margin on each side).
 */
export function computeHeroEquilibrium(
    neighbors: ExperienceNode[],
    viewportWidth: number,
    viewportHeight: number,
    comfortZoneRatio: number
): { x: number; y: number } {
    const cx = viewportWidth / 2;
    const cy = viewportHeight / 2;

    if (neighbors.length === 0) return { x: cx, y: cy };

    // Weighted centroid of visible neighbors
    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;
    for (const n of neighbors) {
        const w = Math.max(n.relevanceScore, 1);
        weightedX += n.x * w;
        weightedY += n.y * w;
        totalWeight += w;
    }
    const centroidX = weightedX / totalWeight;
    const centroidY = weightedY / totalWeight;

    // Offset hero opposite to the centroid, scaled by 0.4 to prevent overreaction
    const offsetX = (centroidX - cx) * 0.4;
    const offsetY = (centroidY - cy) * 0.4;
    let heroX = cx - offsetX;
    let heroY = cy - offsetY;

    // Clamp to comfort zone bounds
    const margin = (1 - comfortZoneRatio) / 2;
    const minX = viewportWidth * margin;
    const maxX = viewportWidth * (1 - margin);
    const minY = viewportHeight * margin;
    const maxY = viewportHeight * (1 - margin);
    heroX = Math.max(minX, Math.min(maxX, heroX));
    heroY = Math.max(minY, Math.min(maxY, heroY));

    return { x: heroX, y: heroY };
}

// processImageFile and hydrateGalleryAssets removed — image loading now handled by immichService.ts
