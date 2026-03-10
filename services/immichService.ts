import { ImageNode, Tag, TagType, TagCategory, TAG_CATEGORY_TYPE } from '../types';
import { extractColorPalette, getSeason, formatShutterSpeed } from './dataService';
import { getCachedPalette, saveCachedPalette, getCachedAITagsForFile, getCachedTagDefinitions } from './resourceService';

const ALBUM_NAME = 'SomaticStudio';
const API_BASE = '/api/immich';
const DETAIL_BATCH_SIZE = 12;  // Asset detail GETs are lightweight
const PALETTE_BATCH_SIZE = 6;  // Palette extraction involves image download + CPU work

// --- CLIP Smart Search Tag Definitions ---
// Each entry maps a display label to a CLIP-optimized query phrase.
// Designed for a portrait/editorial collection with overlapping clusters (3-6 tags per image).
const CLIP_TAG_DEFINITIONS: Array<{ label: string; query: string }> = [
    // ── Subject ──
    { label: 'Portrait',         query: 'portrait photograph of a person, face and upper body visible' },
    { label: 'Close-Up',         query: 'extreme close-up photograph of a face, tight crop headshot' },
    { label: 'Full Body',        query: 'full body photograph of a person standing or posing, head to toe' },
    { label: 'Landscape',        query: 'landscape photograph of natural scenery without people, wide view' },
    { label: 'Automotive',       query: 'photograph of a car, automobile, vehicle, automotive detail' },
    { label: 'Live Music',       query: 'concert photograph, live music performance on stage, crowd, stage lights' },
    { label: 'Animal',           query: 'photograph of an animal, pet, cat, dog' },
    { label: 'Detail Shot',      query: 'close-up detail photograph of an object, texture, mechanical parts, not a person' },

    // ── Setting ──
    { label: 'Studio',           query: 'studio portrait with controlled lighting and backdrop, indoor setup' },
    { label: 'Outdoors',         query: 'outdoor photograph in nature, trees, sky, natural environment' },
    { label: 'Water',            query: 'photograph featuring water, river, creek, pool, ocean, waterfall' },
    { label: 'Mountains',        query: 'mountain landscape, foggy mountain overlook, Blue Ridge, ridgeline' },
    { label: 'Interior',         query: 'indoor photograph, room interior, furniture, domestic space, apartment' },

    // ── Lighting & Technique ──
    { label: 'Colored Gel',      query: 'photograph lit with colored gels, neon pink blue purple magenta lighting' },
    { label: 'Natural Light',    query: 'photograph using natural daylight, window light, sun on skin' },
    { label: 'Low Key',          query: 'dark low-key photograph, deep shadows, single dramatic light source' },
    { label: 'High Key',         query: 'bright high-key photograph, overexposed, white background, glowing light' },
    { label: 'Golden Hour',      query: 'warm golden hour sunlight, orange amber sunset light, warm tones' },
    { label: 'Night',            query: 'nighttime photograph, dark sky, moon, stars, city lights at night' },
    { label: 'Black & White',    query: 'monochrome black and white photograph, grayscale, no color' },
    { label: 'Long Exposure',    query: 'long exposure photograph, motion blur, light trails, streaking lights' },
    { label: 'Shallow Focus',    query: 'shallow depth of field, blurry background bokeh, subject in sharp focus' },
    { label: 'Silhouette',       query: 'silhouette of a person, dark figure against bright background' },

    // ── Mood & Atmosphere ──
    { label: 'Moody',            query: 'moody dark atmospheric photograph, emotional, brooding, shadows' },
    { label: 'Ethereal',         query: 'dreamy ethereal photograph, soft glowing light, otherworldly, hazy' },
    { label: 'Intimate',         query: 'intimate personal photograph, tender, close, vulnerable, warm' },
    { label: 'Dramatic',         query: 'dramatic photograph, strong contrast, bold composition, intense' },
    { label: 'Serene',           query: 'serene calm peaceful photograph, quiet, contemplative, still' },
    { label: 'Playful',          query: 'fun playful energetic photograph, bright, joyful, casual, smiling' },

    // ── Content & Visual ──
    { label: 'Tattoo Art',       query: 'person with visible tattoos, tattooed skin, body art, ink' },
    { label: 'Fashion',          query: 'fashion photography, styled wardrobe, editorial clothing, accessories, lace' },
    { label: 'Fog & Haze',       query: 'foggy misty photograph, atmospheric haze, smoke, fog machine' },
    { label: 'Autumn Foliage',   query: 'autumn fall scenery, orange red yellow leaves, fall foliage, October' },
    { label: 'Motorsport',       query: 'racing car, motorsport event, race track, speed, formula drift' },
    { label: 'Abstract',         query: 'abstract experimental photograph, distorted, prism, light leak, unconventional' },
];

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

// --- CLIP Smart Search (Supplementary Tagging) ---

interface SmartSearchResult {
    assets: {
        items: Array<{ id: string }>;
    };
}

export async function generateClipTags(
    assetIds: string[],
    onProgress: (completed: number, total: number) => void
): Promise<{ tags: Tag[]; assetTagMap: Map<string, string[]> }> {
    const tagMap = new Map<string, Tag>();
    const assetTagMap = new Map<string, string[]>();
    const totalLabels = CLIP_TAG_DEFINITIONS.length;
    let completed = 0;

    // For each CLIP tag definition, run a smart search and see which of our assets appear
    const assetIdSet = new Set(assetIds);
    const penetrationLimit = Math.floor(assetIds.length * 0.3);

    for (const def of CLIP_TAG_DEFINITIONS) {
        try {
            const result = await apiFetch<SmartSearchResult>('/search/smart', {
                method: 'POST',
                body: JSON.stringify({ query: def.query, size: 10 }),
            });

            // Position cutoff: only top 5 results (strongest matches)
            const matchedIds = (result.assets?.items || [])
                .slice(0, 5)
                .map(item => item.id)
                .filter(id => assetIdSet.has(id));

            // Penetration limit: skip labels matching >30% of album (too generic)
            if (matchedIds.length > 0 && matchedIds.length <= penetrationLimit) {
                const tagId = createTagId(def.label);
                if (!tagMap.has(tagId)) {
                    tagMap.set(tagId, {
                        id: tagId,
                        label: def.label,
                        type: TagType.AI_GENERATED,
                    });
                }

                for (const id of matchedIds) {
                    const existing = assetTagMap.get(id) || [];
                    if (!existing.includes(tagId)) {
                        existing.push(tagId);
                        assetTagMap.set(id, existing);
                    }
                }
            }
        } catch (e) {
            console.error(`CLIP search failed for "${def.label}":`, e);
        }

        completed++;
        onProgress(completed, totalLabels);

        // Small delay between queries
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return {
        tags: Array.from(tagMap.values()),
        assetTagMap,
    };
}

// --- Sync Tags to Immich (Durable Persistence) ---

interface BulkIdResult {
    id: string;
    success: boolean;
    error?: string;
}

export async function syncTagsToImmich(
    clipTags: Tag[],
    assetTagMap: Map<string, string[]>
): Promise<void> {
    if (clipTags.length === 0) return;

    try {
        // 1. Fetch existing Immich tags to avoid duplicates
        const existingTags = await getImmichTags();
        const existingByName = new Map(existingTags.map(t => [t.name || t.value, t.id]));

        // 2. Create or find Immich tag IDs for each CLIP label
        const labelToImmichId = new Map<string, string>();

        for (const clipTag of clipTags) {
            const immichName = `${TAG_PREFIX}${clipTag.label}`;
            const existingId = existingByName.get(immichName);

            if (existingId) {
                console.log(`[TagSync] Found existing tag "${immichName}" → ${existingId}`);
                labelToImmichId.set(clipTag.id, existingId);
            } else {
                try {
                    const created = await apiFetch<{ id: string }>('/tags', {
                        method: 'POST',
                        body: JSON.stringify({ name: immichName }),
                    });
                    console.log(`[TagSync] Created tag "${immichName}" → ${created.id}`);
                    labelToImmichId.set(clipTag.id, created.id);
                } catch (e) {
                    console.error(`[TagSync] Failed to create tag "${immichName}":`, e);
                }
            }
        }

        // 3. Build reverse map: immichTagId → assetIds
        const tagToAssets = new Map<string, string[]>();
        for (const [assetId, tagIds] of assetTagMap) {
            for (const tagId of tagIds) {
                const immichTagId = labelToImmichId.get(tagId);
                if (immichTagId) {
                    const assets = tagToAssets.get(immichTagId) || [];
                    assets.push(assetId);
                    tagToAssets.set(immichTagId, assets);
                }
            }
        }

        // 4. Assign tags to assets in Immich
        let totalAssigned = 0;
        let totalFailures = 0;

        for (const [immichTagId, assetIds] of tagToAssets) {
            try {
                const results = await apiFetch<BulkIdResult[]>(`/tags/${immichTagId}/assets`, {
                    method: 'PUT',
                    body: JSON.stringify({ ids: assetIds }),
                });

                const successes = results.filter(r => r.success).length;
                const failures = results.filter(r => !r.success);
                totalAssigned += successes;
                totalFailures += failures.length;

                if (failures.length > 0) {
                    console.warn(`[TagSync] Tag ${immichTagId}: ${failures.length} assignment failures:`,
                        failures.map(f => `${f.id}: ${f.error}`).join(', '));
                }
            } catch (e) {
                console.error(`[TagSync] Failed to assign tag ${immichTagId} to ${assetIds.length} assets:`, e);
                totalFailures += assetIds.length;
            }
        }

        console.log(`[TagSync] Complete: ${labelToImmichId.size} tags, ${assetTagMap.size} assets, ${totalAssigned} assignments, ${totalFailures} failures`);
    } catch (e) {
        console.error('[TagSync] Fatal error:', e);
    }
}
