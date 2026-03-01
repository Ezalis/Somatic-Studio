import { ImageNode, Tag, TagType, ExperienceNode } from '../types';

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

// processImageFile and hydrateGalleryAssets removed — image loading now handled by immichService.ts
