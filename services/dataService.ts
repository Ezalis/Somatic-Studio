import { ImageNode, Tag, TagType, ExperienceNode } from '../types';
import { getSavedTagsForFile, getSavedAITagsForFile, getSavedImageMetadata } from './resourceService';
import exifr from 'exifr';

// --- CONFIGURATION ---
const REPO_OWNER = 'Ezalis'; 
const REPO_NAME = 'Somatic-Studio';
const BRANCH = 'main';

const GALLERY_BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/public/gallery/`;

// --- Utilities ---

const strictEncodeURIComponent = (str: string) => {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => {
    return '%' + c.charCodeAt(0).toString(16);
  });
};

export const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : ((r & 0x3) | 0x8);
        return v.toString(16);
    });
};

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

export const MONO_KEYWORDS = ['b&w', 'black and white', 'monochrome', 'grayscale', 'noir', 'silver gelatin'];

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

// --- FILE PROCESSING ---

export const processImageFile = async (
    fileOrBlob: Blob, 
    fileName: string, 
    existingTags: Tag[]
): Promise<{ image: ImageNode, newTags: Tag[] }> => {
    
    const newTags: Tag[] = [];
    const processedTagIds = new Set(existingTags.map(t => t.id));

    const createTagId = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const ensureTag = (label: string, type: TagType): string => {
        const id = createTagId(label);
        if (!processedTagIds.has(id)) {
             if (!newTags.some(t => t.id === id)) {
                newTags.push({ id, label, type });
            }
        }
        return id;
    };

    const objectUrl = URL.createObjectURL(fileOrBlob);
    
    let exifData: any = {};
    try {
        exifData = await exifr.parse(fileOrBlob, ['Make', 'Model', 'LensModel', 'ISO', 'ExposureTime', 'FNumber', 'DateTimeOriginal', 'CreateDate']);
    } catch (e) {
        // ignore
    }

    const imgElem = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = objectUrl;
    });

    const palette = extractColorPalette(imgElem);
    
    const captureDate = exifData?.DateTimeOriginal || exifData?.CreateDate || new Date();
    const validDate = !isNaN(new Date(captureDate).getTime()) ? new Date(captureDate) : new Date();
    const timestamp = validDate.getTime();
    const dateStr = validDate.toISOString().split('T')[0];
    const season = getSeason(validDate);
    
    let camera = exifData?.Model || exifData?.Make || 'Unknown Camera';
    let lens = exifData?.LensModel || 'Unknown Lens';
    if (lens !== 'Unknown Lens') lens = lens.replace(/^Fujifilm\s+Fujinon\s+/i, '').trim();
    if (lens === '18.5 mm f/2.8') camera = 'X70';

    const tagIds: string[] = [];
    tagIds.push(ensureTag(season, TagType.SEASONAL));
    if (camera !== 'Unknown Camera') tagIds.push(ensureTag(camera, TagType.TECHNICAL));
    if (lens !== 'Unknown Lens') tagIds.push(ensureTag(lens, TagType.TECHNICAL));

    // Load User Tags
    const savedTags = getSavedTagsForFile(fileName);
    if (savedTags && savedTags.length > 0) {
        savedTags.forEach(tId => { if (!tagIds.includes(tId)) tagIds.push(tId); });
    }

    // Load AI Tags
    const savedAITags = getSavedAITagsForFile(fileName);
    const aiTagIds = savedAITags || [];

    // Load Metadata (Version)
    const metadata = getSavedImageMetadata(fileName);

    return {
        image: {
            id: generateUUID(),
            fileName: fileName,
            fileUrl: objectUrl,
            captureTimestamp: timestamp,
            inferredSeason: season,
            shootDayClusterId: dateStr,
            cameraModel: camera,
            lensModel: lens,
            aperture: exifData?.FNumber ? `f/${exifData.FNumber}` : '--',
            shutterSpeed: formatShutterSpeed(exifData?.ExposureTime),
            iso: exifData?.ISO || 0,
            tagIds: tagIds,
            aiTagIds: aiTagIds,
            tagVersion: metadata.tagVersion,
            palette: palette 
        },
        newTags: newTags
    };
};

export const hydrateGalleryAssets = async (
    filenames: string[],
    existingTags: Tag[],
    onProgress: (completed: number, total: number) => void,
    onBatchLoaded?: (nodes: ImageNode[]) => void
): Promise<ImageNode[]> => {
    const nodes: ImageNode[] = [];
    let processed = 0;
    const BATCH_SIZE = 4;

    console.groupCollapsed("Hydration Debug");
    
    if (filenames.length === 0) {
        console.groupEnd();
        return [];
    }

    for (let i = 0; i < filenames.length; i += BATCH_SIZE) {
        const batch = filenames.slice(i, i + BATCH_SIZE);
        const batchNodes: ImageNode[] = [];
        
        await Promise.all(batch.map(async (fileName) => {
            try {
                let res: Response | null = null;
                let fetchUrl = '';

                // Attempt 1: Standard encoding
                fetchUrl = `${GALLERY_BASE_URL}${encodeURIComponent(fileName)}`;
                res = await fetch(fetchUrl);
                
                // Attempt 2: Strict encoding
                if (!res.ok) {
                    fetchUrl = `${GALLERY_BASE_URL}${strictEncodeURIComponent(fileName)}`;
                    res = await fetch(fetchUrl);
                }

                // Attempt 3: Case insensitivity
                if (!res.ok) {
                    const ext = fileName.split('.').pop();
                    if (ext) {
                        let altName = '';
                        if (ext === 'jpg') altName = fileName.replace(/\.jpg$/, '.JPG');
                        else if (ext === 'JPG') altName = fileName.replace(/\.JPG$/, '.jpg');
                        else if (ext === 'jpeg') altName = fileName.replace(/\.jpeg$/, '.JPEG');
                        else if (ext === 'png') altName = fileName.replace(/\.png$/, '.PNG');
                        
                        if (altName) {
                            fetchUrl = `${GALLERY_BASE_URL}${encodeURIComponent(altName)}`;
                            res = await fetch(fetchUrl);
                        }
                    }
                }

                // Attempt 4: Local Fallback
                if (!res.ok) {
                    fetchUrl = `/gallery/${fileName}`;
                    res = await fetch(fetchUrl);
                }

                if (!res.ok) return;

                const blob = await res.blob();
                if (blob.size === 0) return;

                const { image } = await processImageFile(blob, fileName, existingTags);
                batchNodes.push(image);

            } catch (e) {
                console.error(`[Error] Processing ${fileName}:`, e);
            }
        }));

        nodes.push(...batchNodes);
        if (onBatchLoaded && batchNodes.length > 0) {
            onBatchLoaded(batchNodes);
        }

        processed += batch.length;
        onProgress(Math.min(processed, filenames.length), filenames.length);
        
        await new Promise(resolve => setTimeout(resolve, 20));
    }

    console.groupEnd();

    return nodes.sort((a, b) => a.captureTimestamp - b.captureTimestamp);
};
