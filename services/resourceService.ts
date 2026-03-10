
import { Tag } from '../types';

const DB_NAME = 'SomaticStudioDB';
const DB_VERSION = 4; // Incremented for palette cache store
const STORES = {
    DEFINITIONS: 'tag_definitions',
    MAPPINGS: 'image_mappings',      // Key: assetId, Value: tagIds[]
    AI_MAPPINGS: 'ai_image_mappings', // Key: assetId, Value: aiTagIds[]
    PALETTE_CACHE: 'palette_cache',  // Key: assetId, Value: string[] (5-color palette)
};

// --- IN-MEMORY CACHE ---
let definitionsCache: Tag[] = [];
let mappingsCache: Record<string, string[]> = {};
let aiMappingsCache: Record<string, string[]> = {};
let paletteCacheMemory: Record<string, string[]> = {};

// --- DATABASE CORE ---

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORES.DEFINITIONS)) {
                db.createObjectStore(STORES.DEFINITIONS, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORES.MAPPINGS)) {
                db.createObjectStore(STORES.MAPPINGS);
            }
            if (!db.objectStoreNames.contains(STORES.AI_MAPPINGS)) {
                db.createObjectStore(STORES.AI_MAPPINGS);
            }
            if (!db.objectStoreNames.contains(STORES.PALETTE_CACHE)) {
                db.createObjectStore(STORES.PALETTE_CACHE);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// --- INITIALIZATION ---

export const initDatabase = async (): Promise<void> => {
    try {
        const db = await openDB();

        // Hydrate tag definitions
        const currentTags = await new Promise<Tag[]>((resolve) => {
            const tx = db.transaction(STORES.DEFINITIONS, 'readonly');
            tx.objectStore(STORES.DEFINITIONS).getAll().onsuccess = (e) => resolve((e.target as IDBRequest).result);
        });
        if (currentTags) definitionsCache = currentTags;

        // Hydrate mappings & palette cache
        await new Promise<void>((resolve) => {
            const storeNames = [STORES.MAPPINGS, STORES.AI_MAPPINGS, STORES.PALETTE_CACHE].filter(
                name => db.objectStoreNames.contains(name)
            );
            const tx = db.transaction(storeNames, 'readonly');

            if (db.objectStoreNames.contains(STORES.MAPPINGS)) {
                tx.objectStore(STORES.MAPPINGS).openCursor().onsuccess = (e) => {
                    const cursor = (e.target as IDBRequest).result;
                    if (cursor) {
                        mappingsCache[cursor.key as string] = cursor.value;
                        cursor.continue();
                    }
                };
            }

            if (db.objectStoreNames.contains(STORES.AI_MAPPINGS)) {
                tx.objectStore(STORES.AI_MAPPINGS).openCursor().onsuccess = (e) => {
                    const cursor = (e.target as IDBRequest).result;
                    if (cursor) {
                        aiMappingsCache[cursor.key as string] = cursor.value;
                        cursor.continue();
                    }
                };
            }

            if (db.objectStoreNames.contains(STORES.PALETTE_CACHE)) {
                tx.objectStore(STORES.PALETTE_CACHE).openCursor().onsuccess = (e) => {
                    const cursor = (e.target as IDBRequest).result;
                    if (cursor) {
                        paletteCacheMemory[cursor.key as string] = cursor.value;
                        cursor.continue();
                    }
                };
            }

            tx.oncomplete = () => resolve();
        });
    } catch (e) {
        console.error("DB Init Failed", e);
    }
};

// --- TAG DEFINITIONS ---

export const saveTagDefinitions = async (tags: Tag[]) => {
    definitionsCache = tags;
    const db = await openDB();
    const tx = db.transaction(STORES.DEFINITIONS, 'readwrite');
    const store = tx.objectStore(STORES.DEFINITIONS);
    store.clear();
    tags.forEach(tag => store.put(tag));
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
};

// --- USER TAGS (keyed by asset ID) ---

export const getSavedTagsForFile = (assetId: string): string[] => {
    return mappingsCache[assetId] || [];
};

export const saveTagsForFile = async (assetId: string, tagIds: string[]) => {
    mappingsCache[assetId] = tagIds;
    const db = await openDB();
    const tx = db.transaction(STORES.MAPPINGS, 'readwrite');
    tx.objectStore(STORES.MAPPINGS).put(tagIds, assetId);
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
};

// --- AI TAGS (keyed by asset ID) ---

export const getCachedAITagsForFile = (assetId: string): string[] => {
    return aiMappingsCache[assetId] || [];
};

export const getCachedTagDefinitions = (): Tag[] => {
    return definitionsCache;
};

export const saveAITagsForFile = async (assetId: string, tagIds: string[]) => {
    aiMappingsCache[assetId] = tagIds;
    const db = await openDB();
    const tx = db.transaction(STORES.AI_MAPPINGS, 'readwrite');
    tx.objectStore(STORES.AI_MAPPINGS).put(tagIds, assetId);
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
};

// --- PALETTE CACHE ---

export const getCachedPaletteSync = (assetId: string): string[] | null => {
    return paletteCacheMemory[assetId] || null;
};

export const getCachedPalette = async (assetId: string): Promise<string[] | null> => {
    if (paletteCacheMemory[assetId]) return paletteCacheMemory[assetId];
    return null;
};

export const saveCachedPalette = async (assetId: string, palette: string[]) => {
    paletteCacheMemory[assetId] = palette;
    const db = await openDB();
    const tx = db.transaction(STORES.PALETTE_CACHE, 'readwrite');
    tx.objectStore(STORES.PALETTE_CACHE).put(palette, assetId);
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
};

// --- CLEAR ---

export const clearDatabase = async () => {
    const db = await openDB();
    const storeNames = Array.from(db.objectStoreNames);
    const tx = db.transaction(storeNames, 'readwrite');
    storeNames.forEach(name => tx.objectStore(name).clear());
    definitionsCache = [];
    mappingsCache = {};
    aiMappingsCache = {};
    paletteCacheMemory = {};
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
};
