
import { Tag } from '../types';

// INTERFACES FOR FILE SYSTEM ACCESS API
interface FileSystemHandle {
    kind: 'file' | 'directory';
    name: string;
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: any): Promise<void>;
    close(): Promise<void>;
}

interface FileSystemFileHandle extends FileSystemHandle {
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
    getDirectoryHandle(name: string, options?: {create?: boolean}): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: {create?: boolean}): Promise<FileSystemFileHandle>;
}

// --- IDB PERSISTENCE HELPERS ---
const DB_NAME = 'SomaticStudioDB';
const STORE_NAME = 'handles';

const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

const saveHandleToDB = async (handle: FileSystemDirectoryHandle) => {
    try {
        const db = await initDB();
        return new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(handle, 'root');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    } catch (e) {
        console.warn("IDB Save Failed", e);
    }
};

const getHandleFromDB = async (): Promise<FileSystemDirectoryHandle | undefined> => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get('root');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } catch (e) {
        return undefined;
    }
};

// --- STATE ---

let rootHandle: FileSystemDirectoryHandle | null = null;
let resourcesHandle: FileSystemDirectoryHandle | null = null;
let tagsFileHandle: FileSystemFileHandle | null = null;
let definitionsFileHandle: FileSystemFileHandle | null = null;

// Cache
let registryCache: Record<string, string[]> = {}; // Mappings: "img.jpg" -> ["tag-id-1"]
let definitionsCache: Tag[] = [];                // Objects: { id: "tag-id-1", label: "Summer" }

let isConnected = false;
let isFileSystemSupported = false;

const STORAGE_FALLBACK_KEY_REGISTRY = 'somatic_studio_resources_tags_fallback';
const STORAGE_FALLBACK_KEY_DEFINITIONS = 'somatic_studio_resources_definitions_fallback';

// --- HELPERS ---

const loadLibraryFromHandle = async (dirHandle: FileSystemDirectoryHandle): Promise<boolean> => {
    try {
        resourcesHandle = await dirHandle.getDirectoryHandle('resources', { create: true });
        tagsFileHandle = await resourcesHandle.getFileHandle('tags.json', { create: true });
        definitionsFileHandle = await resourcesHandle.getFileHandle('definitions.json', { create: true });

        // Load Mappings
        const tFile = await tagsFileHandle.getFile();
        const tText = await tFile.text();
        try { registryCache = tText ? JSON.parse(tText) : {}; } catch { registryCache = {}; }

        // Load Definitions
        const dFile = await definitionsFileHandle.getFile();
        const dText = await dFile.text();
        try { definitionsCache = dText ? JSON.parse(dText) : []; } catch { definitionsCache = []; }

        rootHandle = dirHandle;
        isConnected = true;
        isFileSystemSupported = true;
        return true;
    } catch (error) {
        console.error("Failed to load library from handle:", error);
        return false;
    }
};

const loadFromLocalStorage = (): boolean => {
    try {
        const storedReg = localStorage.getItem(STORAGE_FALLBACK_KEY_REGISTRY);
        if (storedReg) registryCache = JSON.parse(storedReg);
        
        const storedDef = localStorage.getItem(STORAGE_FALLBACK_KEY_DEFINITIONS);
        if (storedDef) definitionsCache = JSON.parse(storedDef);

        isConnected = true;
        isFileSystemSupported = false;
        return true;
    } catch (e) {
        return false;
    }
};

// --- API ---

export const getIsConnected = (): boolean => isConnected;

export const restoreConnection = async (): Promise<boolean> => {
    // 1. Check for File System Support
    // @ts-ignore
    if (typeof window.showDirectoryPicker !== 'function') {
        // Auto-connect to LocalStorage
        return loadFromLocalStorage();
    }

    // 2. Try to load handle from IDB
    const handle = await getHandleFromDB();
    if (handle) {
        // Check permissions
        const perm = await handle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
            return await loadLibraryFromHandle(handle);
        }
        // If 'prompt', we can't auto-connect without gesture.
    }

    return false;
};

export const connectResourceLibrary = async (): Promise<boolean> => {
    // 1. Feature Detection
    // @ts-ignore
    if (typeof window.showDirectoryPicker !== 'function') {
        return loadFromLocalStorage();
    }

    try {
        // 2. Prompt user
        // @ts-ignore
        const handle = await window.showDirectoryPicker({
            id: 'somatic-studio-root',
            mode: 'readwrite'
        });

        if (!handle) return false;

        // 3. Load Data
        const success = await loadLibraryFromHandle(handle);
        
        // 4. Save handle for future auto-connect
        if (success) {
            await saveHandleToDB(handle);
        }

        return success;

    } catch (error) {
        console.error("Failed to connect to file system:", error);
        return false;
    }
};

const persistData = async () => {
    if (isFileSystemSupported && tagsFileHandle && definitionsFileHandle) {
        try {
            // Write Mappings
            const writableTags = await tagsFileHandle.createWritable();
            await writableTags.write(JSON.stringify(registryCache, null, 2));
            await writableTags.close();

            // Write Definitions
            const writableDefs = await definitionsFileHandle.createWritable();
            await writableDefs.write(JSON.stringify(definitionsCache, null, 2));
            await writableDefs.close();
        } catch (error) {
            console.error("Disk write failed:", error);
        }
    } else if (isConnected) {
        try {
            localStorage.setItem(STORAGE_FALLBACK_KEY_REGISTRY, JSON.stringify(registryCache));
            localStorage.setItem(STORAGE_FALLBACK_KEY_DEFINITIONS, JSON.stringify(definitionsCache));
        } catch (error) {
            console.error("LocalStorage write failed:", error);
        }
    }
};

// --- ACCESSORS ---

export const getSavedTagsForFile = (fileName: string): string[] => {
    return registryCache[fileName] || [];
};

export const saveTagsForFile = (fileName: string, tagIds: string[]) => {
    registryCache[fileName] = Array.from(new Set(tagIds));
    persistData();
};

export const getSavedTagDefinitions = (): Tag[] => {
    return definitionsCache;
};

export const saveTagDefinitions = (tags: Tag[]) => {
    definitionsCache = tags;
    persistData();
};
