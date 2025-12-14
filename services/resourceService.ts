
import { Tag, TagType } from '../types';

const DB_NAME = 'SomaticStudioDB';
const DB_VERSION = 2; // Incremented version for new store
const STORES = {
    DEFINITIONS: 'tag_definitions', // Key: tag.id
    MAPPINGS: 'image_mappings',      // Key: fileName, Value: tagIds[]
    AI_MAPPINGS: 'ai_image_mappings' // Key: fileName, Value: aiTagIds[]
};

// --- IN-MEMORY CACHE ---
let definitionsCache: Tag[] = [];
let mappingsCache: Record<string, string[]> = {};
let aiMappingsCache: Record<string, string[]> = {};
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
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

// --- INITIALIZATION ---

export const initDatabase = async (): Promise<Tag[]> => {
    try {
        const db = await openDB();
        
        // 1. Check if DB has definitions
        const currentTags = await new Promise<Tag[]>((resolve, reject) => {
            const tx = db.transaction(STORES.DEFINITIONS, 'readonly');
            const req = tx.objectStore(STORES.DEFINITIONS).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        // 2. Hydrate Cache if exists
        if (currentTags.length > 0) {
            definitionsCache = currentTags;
            
            // Hydrate Mappings Cache
            const tx = db.transaction([STORES.MAPPINGS, STORES.AI_MAPPINGS], 'readonly');
            
            // User Mappings
            const reqCursor = tx.objectStore(STORES.MAPPINGS).openCursor();
            mappingsCache = {};
            reqCursor.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result;
                if (cursor) {
                    mappingsCache[cursor.key as string] = cursor.value;
                    cursor.continue();
                }
            };

            // AI Mappings
            const aiReqCursor = tx.objectStore(STORES.AI_MAPPINGS).openCursor();
            aiMappingsCache = {};
            aiReqCursor.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result;
                if (cursor) {
                    aiMappingsCache[cursor.key as string] = cursor.value;
                    cursor.continue();
                }
            };

            await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
            
            isInitialized = true;
            return definitionsCache;
        }

        // 3. Seeding Logic (If DB is empty, load from JSONs)
        console.log("Seeding Database from project configuration...");
        
        // Load User Tags
        try {
            const response = await fetch('/resources/tags.json');
            if (response.ok) {
                const seedData = await response.json();
                
                // Write Definitions
                if (seedData.definitions && Array.isArray(seedData.definitions)) {
                    await saveTagDefinitions(seedData.definitions);
                }

                // Write Mappings
                if (seedData.mappings) {
                    const tx = db.transaction(STORES.MAPPINGS, 'readwrite');
                    const store = tx.objectStore(STORES.MAPPINGS);
                    Object.entries(seedData.mappings).forEach(([fileName, tagIds]) => {
                        store.put(tagIds, fileName);
                        mappingsCache[fileName] = tagIds as string[];
                    });
                }
            }
        } catch (err) {
            console.error("Failed to load tags.json", err);
        }

        // Load AI Tags
        try {
            const response = await fetch('/resources/AI-tags.json');
            if (response.ok) {
                const seedData = await response.json();
                
                // Merge AI Definitions
                if (seedData.definitions && Array.isArray(seedData.definitions)) {
                    const current = getSavedTagDefinitions();
                    const merged = [...current];
                    seedData.definitions.forEach((aiTag: Tag) => {
                         // Force type to AI_GENERATED just in case
                         aiTag.type = TagType.AI_GENERATED;
                         if (!merged.some(t => t.id === aiTag.id)) {
                             merged.push(aiTag);
                         }
                    });
                    await saveTagDefinitions(merged);
                }

                // Write AI Mappings
                if (seedData.mappings) {
                    const tx = db.transaction(STORES.AI_MAPPINGS, 'readwrite');
                    const store = tx.objectStore(STORES.AI_MAPPINGS);
                    Object.entries(seedData.mappings).forEach(([fileName, tagIds]) => {
                        store.put(tagIds, fileName);
                        aiMappingsCache[fileName] = tagIds as string[];
                    });
                }
            }
        } catch (err) {
            console.warn("AI-tags.json not found or failed to load. This is expected if not generated yet.");
        }

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

export const clearDatabase = async () => {
    const db = await openDB();
    const tx = db.transaction([STORES.DEFINITIONS, STORES.MAPPINGS, STORES.AI_MAPPINGS], 'readwrite');
    tx.objectStore(STORES.DEFINITIONS).clear();
    tx.objectStore(STORES.MAPPINGS).clear();
    tx.objectStore(STORES.AI_MAPPINGS).clear();
    
    definitionsCache = [];
    mappingsCache = {};
    aiMappingsCache = {};
    
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

    // Filter out AI tags for standard export if desired, or keep all. 
    // Usually standard export implies User curated tags. Let's filter out AI tags for the main file.
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
