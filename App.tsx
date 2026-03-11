import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ImageNode, Tag } from './types';
import { initDatabase, saveTagDefinitions } from './services/resourceService';
import { hydrateSkeletonFromImmich, enrichWithTagsAndPalettes, enrichAssetTags } from './services/immichService';
import NavigationPrototype from './components/flow';

const App: React.FC = () => {
    const [images, setImages] = useState<ImageNode[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);

    // Track which assets have had tags fetched (for progressive loading)
    const enrichedAssetIds = useRef(new Set<string>());

    // Priority tag enrichment — called when hero changes
    const handlePrioritizeAssets = useCallback(async (assetIds: string[]) => {
        const unenriched = assetIds.filter(id => !enrichedAssetIds.current.has(id));
        if (unenriched.length === 0) return;

        const { tags: newTags, assetTagMap } = await enrichAssetTags(unenriched);
        for (const id of unenriched) enrichedAssetIds.current.add(id);

        setTags(prev => {
            const existing = new Set(prev.map(t => t.id));
            const toAdd = newTags.filter(t => !existing.has(t.id));
            return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });

        setImages(prev => prev.map(img => {
            const aiTagIds = assetTagMap.get(img.id);
            if (!aiTagIds || aiTagIds.length === 0) return img;
            const merged = [...new Set([...(img.aiTagIds || []), ...aiTagIds])];
            if (merged.length === (img.aiTagIds || []).length) return img;
            return { ...img, aiTagIds: merged };
        }));
    }, []);

    // --- INITIALIZATION ---
    useEffect(() => {
        let cancelled = false;

        const mergeImageBatch = (newBatch: ImageNode[]) => {
            if (cancelled) return;
            setImages(prev => {
                const prevMap = new Map(prev.map(i => [i.id, i]));
                let changed = false;
                for (const node of newBatch) {
                    const existing = prevMap.get(node.id);
                    if (!existing) {
                        prevMap.set(node.id, node);
                        changed = true;
                    } else if (node.palette.length > 0 && existing.palette.length === 0) {
                        prevMap.set(node.id, { ...existing, palette: node.palette });
                        changed = true;
                    }
                }
                if (!changed) return prev;
                return Array.from(prevMap.values()).sort((a, b) => a.captureTimestamp - b.captureTimestamp);
            });
        };

        const init = async () => {
            await initDatabase();
            if (cancelled) return;

            try {
                // Phase 1: skeleton with cached palettes — renders IdleField immediately
                const { albumAssets } = await hydrateSkeletonFromImmich(mergeImageBatch);
                if (cancelled) return;

                // Phase 2: background enrichment (palettes + tags)
                await enrichWithTagsAndPalettes(
                    albumAssets,
                    (enrichedTags, assetTagMap) => {
                        if (cancelled) return;
                        for (const id of assetTagMap.keys()) enrichedAssetIds.current.add(id);
                        setTags(prev => {
                            const existing = new Set(prev.map(t => t.id));
                            const toAdd = enrichedTags.filter(t => !existing.has(t.id));
                            return toAdd.length > 0 ? [...prev, ...toAdd] : (prev.length === 0 ? enrichedTags : prev);
                        });
                        saveTagDefinitions(enrichedTags);
                        setImages(prev => prev.map(img => {
                            const newTagIds = assetTagMap.get(img.id);
                            if (!newTagIds || newTagIds.length === 0) return img;
                            const merged = [...new Set([...(img.aiTagIds || []), ...newTagIds])];
                            if (merged.length === (img.aiTagIds || []).length) return img;
                            return { ...img, aiTagIds: merged };
                        }));
                    },
                    (paletteUpdates) => {
                        if (cancelled) return;
                        setImages(prev => {
                            const map = new Map(prev.map(i => [i.id, i]));
                            let changed = false;
                            for (const u of paletteUpdates) {
                                const existing = map.get(u.id);
                                if (existing && existing.palette.length === 0) {
                                    map.set(u.id, { ...existing, palette: u.palette });
                                    changed = true;
                                }
                            }
                            if (!changed) return prev;
                            return Array.from(map.values());
                        });
                    }
                );
            } catch (e) {
                console.error("Failed to hydrate from Immich", e);
            }
        };

        init();
        return () => { cancelled = true; };
    }, []);

    return <NavigationPrototype images={images} tags={tags} onPrioritizeAssets={handlePrioritizeAssets} />;
};

export default App;
