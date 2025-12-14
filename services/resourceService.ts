
import { Tag, TagType } from '../types';

const DB_NAME = 'SomaticStudioDB';
const DB_VERSION = 3; // Incremented for new store
const STORES = {
    DEFINITIONS: 'tag_definitions', // Key: tag.id
    MAPPINGS: 'image_mappings',      // Key: fileName, Value: tagIds[]
    AI_MAPPINGS: 'ai_image_mappings', // Key: fileName, Value: aiTagIds[]
    METADATA: 'image_metadata'       // Key: fileName, Value: { tagVersion: number, ... }
};

// --- IN-MEMORY CACHE ---
let definitionsCache: Tag[] = [];
let mappingsCache: Record<string, string[]> = {};
let aiMappingsCache: Record<string, string[]> = {};
let metadataCache: Record<string, any> = {};
let isInitialized = false;

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
            if (!db.objectStoreNames.contains(STORES.METADATA)) {
                db.createObjectStore(STORES.METADATA);
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// --- INITIALIZATION ---

export const initDatabase = async (): Promise<Tag[]> => {
    try {
        const db = await openDB();
        
        // 1. Hydrate Cache from DB first (Local state takes precedence)
        const currentTags = await new Promise<Tag[]>((resolve) => {
            const tx = db.transaction(STORES.DEFINITIONS, 'readonly');
            tx.objectStore(STORES.DEFINITIONS).getAll().onsuccess = (e) => resolve((e.target as IDBRequest).result);
        });
        
        if (currentTags) definitionsCache = currentTags;

        // Hydrate Mappings & Metadata Cache
        await new Promise<void>((resolve) => {
            const tx = db.transaction([STORES.MAPPINGS, STORES.AI_MAPPINGS, STORES.METADATA], 'readonly');
            
            tx.objectStore(STORES.MAPPINGS).openCursor().onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result;
                if (cursor) {
                    mappingsCache[cursor.key as string] = cursor.value;
                    cursor.continue();
                }
            };

            tx.objectStore(STORES.AI_MAPPINGS).openCursor().onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result;
                if (cursor) {
                    aiMappingsCache[cursor.key as string] = cursor.value;
                    cursor.continue();
                }
            };

            tx.objectStore(STORES.METADATA).openCursor().onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result;
                if (cursor) {
                    metadataCache[cursor.key as string] = cursor.value;
                    cursor.continue();
                }
            };

            tx.oncomplete = () => resolve();
        });

        // 2. ALWAYS Try to Merge from JSONs (Backfill missing data / Update from project config)
        console.log("Merging project configuration from JSON files...");
        
        // Load User Tags
        try {
            const response = await fetch('/resources/tags.json');
            if (response.ok) {
                const seedData = await response.json();
                
                const tx = db.transaction([STORES.DEFINITIONS, STORES.MAPPINGS], 'readwrite');
                
                // Merge Definitions
                if (seedData.definitions && Array.isArray(seedData.definitions)) {
                    seedData.definitions.forEach((def: Tag) => {
                        if (!definitionsCache.some(t => t.id === def.id)) {
                            definitionsCache.push(def);
                            tx.objectStore(STORES.DEFINITIONS).put(def);
                        }
                    });
                }

                // Merge Mappings
                if (seedData.mappings) {
                    Object.entries(seedData.mappings).forEach(([fileName, tagIds]) => {
                        if (!mappingsCache[fileName]) {
                            mappingsCache[fileName] = tagIds as string[];
                            tx.objectStore(STORES.MAPPINGS).put(tagIds, fileName);
                        }
                    });
                }
            }
        } catch (err) {
            console.warn("Failed to load/merge tags.json", err);
        }

        // Load AI Tags
        try {
            const response = await fetch('/resources/AI-tags.json');
            if (response.ok) {
                const seedData = await response.json();
                
                const tx = db.transaction([STORES.DEFINITIONS, STORES.AI_MAPPINGS], 'readwrite');

                // Merge AI Definitions
                if (seedData.definitions && Array.isArray(seedData.definitions)) {
                    seedData.definitions.forEach((aiTag: Tag) => {
                         aiTag.type = TagType.AI_GENERATED; // Force type
                         if (!definitionsCache.some(t => t.id === aiTag.id)) {
                             definitionsCache.push(aiTag);
                             tx.objectStore(STORES.DEFINITIONS).put(aiTag);
                         }
                    });
                }

                // Merge AI Mappings
                if (seedData.mappings) {
                    Object.entries(seedData.mappings).forEach(([fileName, tagIds]) => {
                        if (!aiMappingsCache[fileName]) {
                            aiMappingsCache[fileName] = tagIds as string[];
                            tx.objectStore(STORES.AI_MAPPINGS).put(tagIds, fileName);
                        }
                    });
                }
            }
        } catch (err) {
            console.warn("AI-tags.json not found or failed to load.", err);
        }

        isInitialized = true;
        return definitionsCache; 

    } catch (e) {
        console.error("DB Init Failed", e);
        return [];
    }
};

// --- CRUD OPERATIONS ---

export const getSavedTagDefinitions = (): Tag[] => {
    return definitionsCache;
};

export const getAllMappings = (): Record<string, string[]> => {
    return mappingsCache;
};

export const saveTagDefinitions = async (tags: Tag[]) => {
    definitionsCache = tags;
    
    const db = await openDB();
    const tx = db.transaction(STORES.DEFINITIONS, 'readwrite');
    const store = tx.objectStore(STORES.DEFINITIONS);
    
    // Clear and Rewrite to ensure consistency with memory
    store.clear(); 
    tags.forEach(tag => store.put(tag));
    
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
};

// USER TAGS
export const getSavedTagsForFile = (fileName: string): string[] => {
    return mappingsCache[fileName] || [];
};

export const saveTagsForFile = async (fileName: string, tagIds: string[]) => {
    mappingsCache[fileName] = tagIds;

    const db = await openDB();
    const tx = db.transaction(STORES.MAPPINGS, 'readwrite');
    tx.objectStore(STORES.MAPPINGS).put(tagIds, fileName);
    
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
};

// AI TAGS
export const getSavedAITagsForFile = (fileName: string): string[] => {
    return aiMappingsCache[fileName] || [];
};

export const saveAITagsForFile = async (fileName: string, tagIds: string[]) => {
    aiMappingsCache[fileName] = tagIds;

    const db = await openDB();
    const tx = db.transaction(STORES.AI_MAPPINGS, 'readwrite');
    tx.objectStore(STORES.AI_MAPPINGS).put(tagIds, fileName);
    
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
};

// METADATA (Version Tracking)
export const getSavedImageMetadata = (fileName: string): { tagVersion?: number } => {
    return metadataCache[fileName] || {};
};

export const saveImageMetadata = async (fileName: string, metadata: { tagVersion?: number }) => {
    const existing = metadataCache[fileName] || {};
    const updated = { ...existing, ...metadata };
    metadataCache[fileName] = updated;

    const db = await openDB();
    const tx = db.transaction(STORES.METADATA, 'readwrite');
    tx.objectStore(STORES.METADATA).put(updated, fileName);

    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
};

export const clearDatabase = async () => {
    const db = await openDB();
    const tx = db.transaction([STORES.DEFINITIONS, STORES.MAPPINGS, STORES.AI_MAPPINGS, STORES.METADATA], 'readwrite');
    tx.objectStore(STORES.DEFINITIONS).clear();
    tx.objectStore(STORES.MAPPINGS).clear();
    tx.objectStore(STORES.AI_MAPPINGS).clear();
    tx.objectStore(STORES.METADATA).clear();
    
    definitionsCache = [];
    mappingsCache = {};
    aiMappingsCache = {};
    metadataCache = {};
    
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
};

// --- EXPORT UTIL ---
export const exportDatabase = async () => {
    const db = await openDB();
    
    const tags = await new Promise<Tag[]>((resolve) => {
        db.transaction(STORES.DEFINITIONS, 'readonly').objectStore(STORES.DEFINITIONS).getAll().onsuccess = (e) => resolve((e.target as IDBRequest).result);
    });

    const userTags = tags.filter(t => t.type !== TagType.AI_GENERATED);

    const mappings: Record<string, string[]> = {};
    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORES.MAPPINGS, 'readonly');
        tx.objectStore(STORES.MAPPINGS).openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result;
            if (cursor) {
                mappings[cursor.key as string] = cursor.value;
                cursor.continue();
            } else {
                resolve();
            }
        };
    });

    const exportData = {
        definitions: userTags,
        mappings: mappings
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tags.json';
    a.click();
    URL.revokeObjectURL(url);
};

export const exportAITagsDatabase = async () => {
    const db = await openDB();
    
    const tags = await new Promise<Tag[]>((resolve) => {
        db.transaction(STORES.DEFINITIONS, 'readonly').objectStore(STORES.DEFINITIONS).getAll().onsuccess = (e) => resolve((e.target as IDBRequest).result);
    });

    const aiTags = tags.filter(t => t.type === TagType.AI_GENERATED);

    const mappings: Record<string, string[]> = {};
    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORES.AI_MAPPINGS, 'readonly');
        tx.objectStore(STORES.AI_MAPPINGS).openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest).result;
            if (cursor) {
                mappings[cursor.key as string] = cursor.value;
                cursor.continue();
            } else {
                resolve();
            }
        };
    });

    const exportData = {
        definitions: aiTags,
        mappings: mappings
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'AI-tags.json';
    a.click();
    URL.revokeObjectURL(url);
};
