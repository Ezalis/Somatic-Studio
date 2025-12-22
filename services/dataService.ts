
import { ImageNode, Tag, TagType } from '../types';
import { getSavedTagsForFile, getSavedAITagsForFile, getSavedImageMetadata } from './resourceService';
import exifr from 'exifr';

// --- CONFIGURATION ---
// REPLACE THESE VALUES WITH YOUR GITHUB DETAILS
const REPO_OWNER = 'Ezalis'; 
const REPO_NAME = 'Somatic-Studio';
const BRANCH = 'main'; // or 'master'

// Constructs the raw URL: https://raw.githubusercontent.com/User/Repo/main/public/gallery/
const GALLERY_BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/public/gallery/`;

// --- Utilities ---

// Strict encoding that handles parentheses which encodeURIComponent misses
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
    // Simple Northern Hemisphere logic
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
    const getDistSq = (c1: {r:number, g:number, b:number}, hex2: string) => {
        const r2 = parseInt(hex2.slice(1, 3), 16);
        const g2 = parseInt(hex2.slice(3, 5), 16);
        const b2 = parseInt(hex2.slice(5, 7), 16);
        return Math.pow(c1.r - r2, 2) + Math.pow(c1.g - g2, 2) + Math.pow(c1.b - b2, 2);
    };
    const thresholds = [3600, 2500, 900, 100, 0]; 
    for (const threshold of thresholds) {
        if (palette.length >= 5) break;
        for (const candidate of sortedCandidates) {
            if (palette.length >= 5) break;
            const isDistinct = palette.every(selectedHex => getDistSq(candidate, selectedHex) >= threshold);
            if (isDistinct) palette.push(candidate.hex);
        }
    }
    while (palette.length < 5) palette.push('#e4e4e7'); 
    return palette.slice(0, 5);
};

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
        img.crossOrigin = "Anonymous"; // Essential for remote images (GitHub) to allow canvas extraction
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
    console.log(`Target: ${GALLERY_BASE_URL}`);
    console.log(`Total Files: ${filenames.length}`);

    if (filenames.length === 0) {
        console.warn("No filenames provided for hydration.");
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
                
                // Attempt 2: Strict encoding (handles parentheses)
                if (!res.ok) {
                    fetchUrl = `${GALLERY_BASE_URL}${strictEncodeURIComponent(fileName)}`;
                    res = await fetch(fetchUrl);
                }

                // Attempt 3: Case insensitivity fallback (jpg <-> JPG)
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

                // Attempt 4: Local Fallback (Dev environment)
                if (!res.ok) {
                    fetchUrl = `/gallery/${fileName}`;
                    res = await fetch(fetchUrl);
                }

                // Final Failure Check
                if (!res.ok) {
                    console.warn(`[Skipping] Failed to load: ${fileName} (404/Error)`);
                    return;
                }

                const blob = await res.blob();
                if (blob.size === 0) {
                     console.warn(`[Skipping] Empty blob received: ${fileName}`);
                     return;
                }

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
        
        // Slightly faster delay to feel snappier but still breathe
        await new Promise(resolve => setTimeout(resolve, 20));
    }

    console.log(`Hydration Complete. Loaded ${nodes.length} images.`);
    console.groupEnd();

    return nodes.sort((a, b) => a.captureTimestamp - b.captureTimestamp);
};

export const generateMockImages = (count: number, availableTags: Tag[]): ImageNode[] => {
    const images: ImageNode[] = [];
    return images; 
};
