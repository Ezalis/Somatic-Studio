import { ImageNode, Tag, TagType, TagCategory, TAG_CATEGORY_TYPE } from '../types';
import { extractColorPalette, getSeason, formatShutterSpeed } from './dataService';
import { getCachedPalette, getCachedPaletteSync, saveCachedPalette, getCachedAITagsForFile, getCachedTagDefinitions } from './resourceService';

const ALBUM_NAME = 'SomaticStudio';
const API_BASE = '/api/immich';
const DETAIL_BATCH_SIZE = 12;  // Asset detail GETs are lightweight
const PALETTE_BATCH_SIZE = 6;  // Palette extraction involves image download + CPU work

// --- Immich API Types ---
interface ImmichAsset {
    id: string;
    originalFileName: string;
    originalMimeType: string;
    type: string;
    exifInfo?: {
        make?: string;
        model?: string;
        lensModel?: string;
        fNumber?: number;
        exposureTime?: string;
        iso?: number;
        focalLength?: number;
        dateTimeOriginal?: string;
    };
    tags?: ImmichTag[];
}

interface ImmichTag {
    id: string;
    name: string;
    value: string;
}

interface ImmichAlbum {
    id: string;
    albumName: string;
    assetCount: number;
}

// --- API Helpers ---

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });
    if (!res.ok) {
        throw new Error(`Immich API error: ${res.status} ${res.statusText} for ${path}`);
    }
    return res.json();
}

// --- URL Builders ---

export const getThumbnailUrl = (assetId: string): string =>
    `${API_BASE}/assets/${assetId}/thumbnail`;

export const getPreviewUrl = (assetId: string): string =>
    `${API_BASE}/assets/${assetId}/thumbnail?size=preview`;

export const getOriginalUrl = (assetId: string): string =>
    `${API_BASE}/assets/${assetId}/original`;

// --- Core API Functions ---

export async function findAlbum(): Promise<string> {
    const albums = await apiFetch<ImmichAlbum[]>('/albums');
    const album = albums.find(a => a.albumName === ALBUM_NAME);
    if (!album) {
        throw new Error(`Album "${ALBUM_NAME}" not found in Immich`);
    }
    return album.id;
}

export async function getAlbumAssets(albumId: string): Promise<ImmichAsset[]> {
    const album = await apiFetch<{ assets: ImmichAsset[] }>(`/albums/${albumId}`);
    return (album.assets || []).filter(a => a.type === 'IMAGE');
}

export async function getAssetDetail(assetId: string): Promise<ImmichAsset> {
    return apiFetch<ImmichAsset>(`/assets/${assetId}`);
}

export async function getImmichTags(): Promise<ImmichTag[]> {
    return apiFetch<ImmichTag[]>('/tags');
}

// --- Asset → ImageNode Conversion ---

function createTagId(label: string): string {
    return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function assetToImageNode(
    asset: ImmichAsset,
    nativeTags: Tag[],
    nativeTagIds: string[]
): ImageNode {
    const exif = asset.exifInfo || {};

    const captureDate = exif.dateTimeOriginal ? new Date(exif.dateTimeOriginal) : new Date();
    const validDate = !isNaN(captureDate.getTime()) ? captureDate : new Date();
    const timestamp = validDate.getTime();
    const dateStr = validDate.toISOString().split('T')[0];
    const season = getSeason(validDate);

    let camera = exif.model || exif.make || 'Unknown Camera';
    let lens = exif.lensModel || 'Unknown Lens';
    if (lens !== 'Unknown Lens') lens = lens.replace(/^Fujifilm\s+Fujinon\s+/i, '').trim();
    if (lens === '18.5 mm f/2.8') camera = 'X70';

    // Build tagIds from EXIF-derived technical/seasonal tags
    const tagIds: string[] = [];
    tagIds.push(createTagId(season));
    if (camera !== 'Unknown Camera') tagIds.push(createTagId(camera));
    if (lens !== 'Unknown Lens') tagIds.push(createTagId(lens));

    // Parse shutter speed from string (e.g. "1/250" or "0.004")
    let shutterSpeed = '--';
    if (exif.exposureTime) {
        const val = parseFloat(exif.exposureTime);
        if (!isNaN(val)) {
            shutterSpeed = formatShutterSpeed(val);
        } else {
            shutterSpeed = exif.exposureTime;
        }
    }

    return {
        id: asset.id,
        fileName: asset.originalFileName,
        fileUrl: getPreviewUrl(asset.id),
        originalUrl: getOriginalUrl(asset.id),
        captureTimestamp: timestamp,
        inferredSeason: season,
        shootDayClusterId: dateStr,
        cameraModel: camera,
        lensModel: lens,
        aperture: exif.fNumber ? `f/${exif.fNumber}` : '--',
        shutterSpeed,
        iso: exif.iso || 0,
        focalLength: exif.focalLength || null,
        tagIds,
        aiTagIds: nativeTagIds,
        palette: [], // Populated later via palette extraction
    };
}

// --- Palette Extraction ---

async function extractPaletteFromAsset(assetId: string): Promise<string[]> {
    // Check cache first
    const cached = await getCachedPalette(assetId);
    if (cached) return cached;

    const url = getThumbnailUrl(assetId);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'Anonymous';
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error(`Failed to load thumbnail for ${assetId}`));
        el.src = url;
    });

    const palette = extractColorPalette(img);
    await saveCachedPalette(assetId, palette);
    return palette;
}

// --- Tag Processing ---

const TAG_PREFIX = 'SomaticStudio/';

// Category prefixes from the Ollama tagging pipeline (e.g. "SomaticStudio/Mood/Contemplative")
const CATEGORY_MAP: Record<string, TagCategory> = {
    'Mood': 'mood',
    'Lighting': 'lighting',
    'Subject': 'subject',
    'Setting': 'setting',
    'Style': 'style',
};

function buildTagsFromImmichNative(
    assets: ImmichAsset[]
): { tags: Tag[]; assetTagMap: Map<string, string[]> } {
    const tagMap = new Map<string, Tag>();
    const assetTagMap = new Map<string, string[]>();

    for (const asset of assets) {
        const tagIds: string[] = [];
        if (asset.tags) {
            for (const t of asset.tags) {
                const rawName = t.value || t.name;
                if (!rawName.startsWith(TAG_PREFIX)) continue;

                const afterPrefix = rawName.slice(TAG_PREFIX.length);

                // Parse categorized tags: "Mood/Contemplative" → category=mood, label="Contemplative"
                const slashIdx = afterPrefix.indexOf('/');
                let label: string;
                let category: TagCategory | undefined;
                let type: TagType = TagType.AI_GENERATED;

                if (slashIdx > 0) {
                    const catStr = afterPrefix.slice(0, slashIdx);
                    category = CATEGORY_MAP[catStr];
                    if (category) {
                        label = afterPrefix.slice(slashIdx + 1);
                        type = TAG_CATEGORY_TYPE[category];
                    } else {
                        // Unknown category prefix — skip parent nodes like "SomaticStudio/Mood"
                        continue;
                    }
                } else {
                    // Skip bare parent nodes (e.g. "SomaticStudio/Mood", "SomaticStudio/Lighting")
                    if (Object.keys(CATEGORY_MAP).includes(afterPrefix)) continue;
                    // Legacy flat tag without category
                    label = afterPrefix;
                }

                const id = createTagId(label);
                if (!tagMap.has(id)) {
                    tagMap.set(id, { id, label, type, category });
                }
                tagIds.push(id);
            }
        }
        assetTagMap.set(asset.id, tagIds);
    }

    return { tags: Array.from(tagMap.values()), assetTagMap };
}

// --- Main Hydration ---

export async function hydrateFromImmich(
    onProgress: (current: number, total: number) => void,
    onBatchLoaded: (nodes: ImageNode[]) => void
): Promise<{ images: ImageNode[]; tags: Tag[] }> {
    // Signal loading immediately (total=0 means "discovering")
    onProgress(0, 0);

    // 1. Find album
    const albumId = await findAlbum();

    // 2. Get all assets with EXIF
    const assets = await getAlbumAssets(albumId);
    const total = assets.length;
    const progressTotal = total * 2; // Phase 1: details (0→N), Phase 2: palettes (N→2N)
    onProgress(0, progressTotal);

    // 3. Fetch per-asset details (for tags) — Phase 1 progress
    const detailedAssets: ImmichAsset[] = [];
    let detailsProcessed = 0;
    for (let i = 0; i < assets.length; i += DETAIL_BATCH_SIZE) {
        const batch = assets.slice(i, i + DETAIL_BATCH_SIZE);
        const details = await Promise.all(
            batch.map(a => getAssetDetail(a.id).catch(() => a))
        );
        detailedAssets.push(...details);
        detailsProcessed += batch.length;
        onProgress(Math.min(detailsProcessed, total), progressTotal);
    }

    // 4. Build native tags from Immich
    const { tags: nativeTags, assetTagMap } = buildTagsFromImmichNative(detailedAssets);

    // 5. Build technical/seasonal tags from EXIF
    const technicalTagMap = new Map<string, Tag>();
    const ensureTag = (label: string, type: TagType): string => {
        const id = createTagId(label);
        if (!technicalTagMap.has(id)) {
            technicalTagMap.set(id, { id, label, type });
        }
        return id;
    };

    // Pre-scan all assets for technical tags
    for (const asset of detailedAssets) {
        const exif = asset.exifInfo || {};
        const captureDate = exif.dateTimeOriginal ? new Date(exif.dateTimeOriginal) : new Date();
        const validDate = !isNaN(captureDate.getTime()) ? captureDate : new Date();
        const season = getSeason(validDate);
        ensureTag(season, TagType.SEASONAL);

        let camera = exif.model || exif.make || 'Unknown Camera';
        let lens = exif.lensModel || 'Unknown Lens';
        if (lens !== 'Unknown Lens') lens = lens.replace(/^Fujifilm\s+Fujinon\s+/i, '').trim();
        if (lens === '18.5 mm f/2.8') camera = 'X70';

        if (camera !== 'Unknown Camera') ensureTag(camera, TagType.TECHNICAL);
        if (lens !== 'Unknown Lens') ensureTag(lens, TagType.TECHNICAL);
    }

    // Merge cached AI tag definitions from previous CLIP runs
    const cachedDefs = getCachedTagDefinitions().filter(t => t.type === TagType.AI_GENERATED);
    const tagIdSet = new Set([...nativeTags.map(t => t.id), ...Array.from(technicalTagMap.keys())]);
    const restoredDefs = cachedDefs.filter(t => !tagIdSet.has(t.id));

    const allTags = [...nativeTags, ...Array.from(technicalTagMap.values()), ...restoredDefs];

    // 6a. Create ImageNodes immediately (empty palettes) — feed the loading overlay
    const allNodes: ImageNode[] = [];
    for (const asset of detailedAssets) {
        try {
            const nativeTagIds = assetTagMap.get(asset.id) || [];
            const node = assetToImageNode(asset, nativeTags, nativeTagIds);

            if (nativeTagIds.length === 0) {
                const cachedAiTags = getCachedAITagsForFile(asset.id);
                if (cachedAiTags.length > 0) {
                    node.aiTagIds = [...new Set([...node.aiTagIds, ...cachedAiTags])];
                }
            }

            allNodes.push(node);
        } catch (e) {
            console.error(`Failed to create node for ${asset.originalFileName}:`, e);
        }
    }

    // Send nodes to UI in batches so the polaroid animates through them
    for (let i = 0; i < allNodes.length; i += PALETTE_BATCH_SIZE) {
        onBatchLoaded(allNodes.slice(i, i + PALETTE_BATCH_SIZE));
    }

    // 6b. Extract palettes and update nodes — Phase 2 progress
    let palettesProcessed = 0;

    for (let i = 0; i < allNodes.length; i += PALETTE_BATCH_SIZE) {
        const batch = allNodes.slice(i, i + PALETTE_BATCH_SIZE);

        await Promise.all(
            batch.map(async (node) => {
                try {
                    node.palette = await extractPaletteFromAsset(node.id);
                } catch (e) {
                    console.error(`Failed to extract palette for ${node.fileName}:`, e);
                }
            })
        );

        // Send palette-updated nodes back so the UI can merge them
        const updatedBatch = batch.filter(n => n.palette.length > 0);
        if (updatedBatch.length > 0) {
            onBatchLoaded(updatedBatch);
        }

        palettesProcessed += batch.length;
        onProgress(Math.min(total + palettesProcessed, progressTotal), progressTotal);

        // Small delay to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 20));
    }

    return {
        images: allNodes.sort((a, b) => a.captureTimestamp - b.captureTimestamp),
        tags: allTags,
    };
}

// --- Two-Phase Hydration (Prototype Fast Path) ---

export async function hydrateSkeletonFromImmich(
    onBatchLoaded: (nodes: ImageNode[]) => void
): Promise<{ skeletonNodes: ImageNode[]; albumAssets: ImmichAsset[] }> {
    const albumId = await findAlbum();
    const assets = await getAlbumAssets(albumId);

    const nodes: ImageNode[] = [];
    for (const asset of assets) {
        const node = assetToImageNode(asset, [], []);
        const cached = getCachedPaletteSync(asset.id);
        if (cached) node.palette = cached;
        nodes.push(node);
    }

    onBatchLoaded(nodes);
    return { skeletonNodes: nodes, albumAssets: assets };
}

export async function enrichWithTagsAndPalettes(
    assets: ImmichAsset[],
    onTagsReady: (tags: Tag[], assetTagMap: Map<string, string[]>) => void,
    onPaletteUpdate: (updates: { id: string; palette: string[] }[]) => void
): Promise<void> {
    // 1. Extract palettes for uncached images (first load only)
    const uncachedAssets = assets.filter(a => !getCachedPaletteSync(a.id));
    if (uncachedAssets.length > 0) {
        for (let i = 0; i < uncachedAssets.length; i += PALETTE_BATCH_SIZE) {
            const batch = uncachedAssets.slice(i, i + PALETTE_BATCH_SIZE);
            const results = await Promise.all(
                batch.map(async a => {
                    try {
                        const palette = await extractPaletteFromAsset(a.id);
                        return { id: a.id, palette };
                    } catch {
                        return { id: a.id, palette: [] as string[] };
                    }
                })
            );
            const valid = results.filter(r => r.palette.length > 0);
            if (valid.length > 0) onPaletteUpdate(valid);
            await new Promise(resolve => setTimeout(resolve, 20));
        }
    }

    // 2. Fetch asset details for tags in batches
    const detailedAssets: ImmichAsset[] = [];
    for (let i = 0; i < assets.length; i += DETAIL_BATCH_SIZE) {
        const batch = assets.slice(i, i + DETAIL_BATCH_SIZE);
        const details = await Promise.all(
            batch.map(a => getAssetDetail(a.id).catch(() => a))
        );
        detailedAssets.push(...details);
    }

    // 3. Build tags
    const { tags: nativeTags, assetTagMap } = buildTagsFromImmichNative(detailedAssets);

    // Build technical/seasonal tags
    const technicalTagMap = new Map<string, Tag>();
    const ensureTag = (label: string, type: TagType): string => {
        const id = createTagId(label);
        if (!technicalTagMap.has(id)) {
            technicalTagMap.set(id, { id, label, type });
        }
        return id;
    };

    for (const asset of detailedAssets) {
        const exif = asset.exifInfo || {};
        const captureDate = exif.dateTimeOriginal ? new Date(exif.dateTimeOriginal) : new Date();
        const validDate = !isNaN(captureDate.getTime()) ? captureDate : new Date();
        ensureTag(getSeason(validDate), TagType.SEASONAL);

        let camera = exif.model || exif.make || 'Unknown Camera';
        let lens = exif.lensModel || 'Unknown Lens';
        if (lens !== 'Unknown Lens') lens = lens.replace(/^Fujifilm\s+Fujinon\s+/i, '').trim();
        if (lens === '18.5 mm f/2.8') camera = 'X70';

        if (camera !== 'Unknown Camera') ensureTag(camera, TagType.TECHNICAL);
        if (lens !== 'Unknown Lens') ensureTag(lens, TagType.TECHNICAL);
    }

    // Merge cached AI tag definitions
    const cachedDefs = getCachedTagDefinitions().filter(t => t.type === TagType.AI_GENERATED);
    const tagIdSet = new Set([...nativeTags.map(t => t.id), ...Array.from(technicalTagMap.keys())]);
    const restoredDefs = cachedDefs.filter(t => !tagIdSet.has(t.id));

    const allTags = [...nativeTags, ...Array.from(technicalTagMap.values()), ...restoredDefs];

    // Also enrich assetTagMap with cached AI tags for assets with no Immich tags
    for (const asset of detailedAssets) {
        const nativeTagIds = assetTagMap.get(asset.id) || [];
        if (nativeTagIds.length === 0) {
            const cachedAiTags = getCachedAITagsForFile(asset.id);
            if (cachedAiTags.length > 0) {
                assetTagMap.set(asset.id, [...new Set([...nativeTagIds, ...cachedAiTags])]);
            }
        }
    }

    onTagsReady(allTags, assetTagMap);
}

// --- On-Demand Tag Enrichment (Priority Fetch) ---

export async function enrichAssetTags(
    assetIds: string[]
): Promise<{ tags: Tag[]; assetTagMap: Map<string, string[]> }> {
    const detailedAssets: ImmichAsset[] = [];
    for (let i = 0; i < assetIds.length; i += DETAIL_BATCH_SIZE) {
        const batch = assetIds.slice(i, i + DETAIL_BATCH_SIZE);
        const details = await Promise.all(
            batch.map(id => getAssetDetail(id).catch(() => null))
        );
        for (const d of details) { if (d) detailedAssets.push(d); }
    }

    const { tags: nativeTags, assetTagMap } = buildTagsFromImmichNative(detailedAssets);

    // Build technical/seasonal tags
    const technicalTagMap = new Map<string, Tag>();
    const ensureTag = (label: string, type: TagType): void => {
        const id = createTagId(label);
        if (!technicalTagMap.has(id)) technicalTagMap.set(id, { id, label, type });
    };
    for (const asset of detailedAssets) {
        const exif = asset.exifInfo || {};
        const captureDate = exif.dateTimeOriginal ? new Date(exif.dateTimeOriginal) : new Date();
        const validDate = !isNaN(captureDate.getTime()) ? captureDate : new Date();
        ensureTag(getSeason(validDate), TagType.SEASONAL);
        let camera = exif.model || exif.make || 'Unknown Camera';
        let lens = exif.lensModel || 'Unknown Lens';
        if (lens !== 'Unknown Lens') lens = lens.replace(/^Fujifilm\s+Fujinon\s+/i, '').trim();
        if (lens === '18.5 mm f/2.8') camera = 'X70';
        if (camera !== 'Unknown Camera') ensureTag(camera, TagType.TECHNICAL);
        if (lens !== 'Unknown Lens') ensureTag(lens, TagType.TECHNICAL);
    }

    // Include cached AI tags for assets with no Immich tags
    for (const asset of detailedAssets) {
        const nativeTagIds = assetTagMap.get(asset.id) || [];
        if (nativeTagIds.length === 0) {
            const cachedAiTags = getCachedAITagsForFile(asset.id);
            if (cachedAiTags.length > 0) {
                assetTagMap.set(asset.id, [...new Set([...nativeTagIds, ...cachedAiTags])]);
            }
        }
    }

    const allTags = [...nativeTags, ...Array.from(technicalTagMap.values())];
    return { tags: allTags, assetTagMap };
}

