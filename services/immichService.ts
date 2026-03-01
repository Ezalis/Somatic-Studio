import { ImageNode, Tag, TagType } from '../types';
import { extractColorPalette, getSeason, formatShutterSpeed } from './dataService';
import { getCachedPalette, saveCachedPalette } from './resourceService';

const ALBUM_NAME = 'SomaticStudio';
const API_BASE = '/api/immich';
const BATCH_SIZE = 4;

// --- CLIP Smart Search Labels ---
const CLIP_LABELS = [
    'Portrait', 'Landscape', 'Street Photography', 'Architecture', 'Nature',
    'Night Photography', 'Black and White', 'Macro', 'Wildlife', 'Urban',
    'Minimalist', 'Documentary', 'Fashion', 'Abstract', 'Candid',
    'Silhouette', 'Motion Blur', 'Golden Hour', 'Moody', 'Vintage',
    'Cinematic', 'Industrial', 'Serene', 'Dramatic', 'Intimate',
    'Geometric', 'Textured'
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

function buildTagsFromImmichNative(
    assets: ImmichAsset[]
): { tags: Tag[]; assetTagMap: Map<string, string[]> } {
    const tagMap = new Map<string, Tag>();
    const assetTagMap = new Map<string, string[]>();

    for (const asset of assets) {
        const tagIds: string[] = [];
        if (asset.tags) {
            for (const t of asset.tags) {
                // Immich tags have name (category) and value (label)
                const label = t.value || t.name;
                const id = createTagId(label);
                if (!tagMap.has(id)) {
                    tagMap.set(id, {
                        id,
                        label,
                        type: TagType.AI_GENERATED,
                    });
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
    // 1. Find album
    const albumId = await findAlbum();

    // 2. Get all assets with EXIF
    const assets = await getAlbumAssets(albumId);
    const total = assets.length;
    onProgress(0, total);

    // 3. Fetch per-asset details (for tags) — batch to avoid overwhelming the server
    const detailedAssets: ImmichAsset[] = [];
    for (let i = 0; i < assets.length; i += BATCH_SIZE) {
        const batch = assets.slice(i, i + BATCH_SIZE);
        const details = await Promise.all(
            batch.map(a => getAssetDetail(a.id).catch(() => a))
        );
        detailedAssets.push(...details);
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

    const allTags = [...nativeTags, ...Array.from(technicalTagMap.values())];

    // 6. Convert assets to ImageNodes and extract palettes in batches
    const allNodes: ImageNode[] = [];
    let processed = 0;

    for (let i = 0; i < detailedAssets.length; i += BATCH_SIZE) {
        const batch = detailedAssets.slice(i, i + BATCH_SIZE);
        const batchNodes: ImageNode[] = [];

        await Promise.all(
            batch.map(async (asset) => {
                try {
                    const nativeTagIds = assetTagMap.get(asset.id) || [];
                    const node = assetToImageNode(asset, nativeTags, nativeTagIds);

                    // Extract palette from thumbnail
                    node.palette = await extractPaletteFromAsset(asset.id);

                    batchNodes.push(node);
                } catch (e) {
                    console.error(`Failed to process asset ${asset.originalFileName}:`, e);
                }
            })
        );

        allNodes.push(...batchNodes);
        if (batchNodes.length > 0) {
            onBatchLoaded(batchNodes);
        }

        processed += batch.length;
        onProgress(Math.min(processed, total), total);

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
    const totalLabels = CLIP_LABELS.length;
    let completed = 0;

    // For each CLIP label, run a smart search and see which of our assets appear
    const assetIdSet = new Set(assetIds);

    for (const label of CLIP_LABELS) {
        try {
            const result = await apiFetch<SmartSearchResult>('/search/smart', {
                method: 'POST',
                body: JSON.stringify({ query: label }),
            });

            const matchedIds = (result.assets?.items || [])
                .map(item => item.id)
                .filter(id => assetIdSet.has(id));

            if (matchedIds.length > 0) {
                const tagId = createTagId(label);
                if (!tagMap.has(tagId)) {
                    tagMap.set(tagId, {
                        id: tagId,
                        label,
                        type: TagType.AI_GENERATED,
                    });
                }

                // Assets that appear in results for this label get the tag
                // Weight by position (earlier = more relevant)
                for (const id of matchedIds) {
                    const existing = assetTagMap.get(id) || [];
                    if (!existing.includes(tagId)) {
                        existing.push(tagId);
                        assetTagMap.set(id, existing);
                    }
                }
            }
        } catch (e) {
            console.error(`CLIP search failed for "${label}":`, e);
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
