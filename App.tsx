import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ViewMode, ExperienceMode, ImageNode, Tag, AnchorState, ExperienceContext } from './types';
import { initDatabase, clearDatabase, saveTagDefinitions, saveAITagsForFile } from './services/resourceService';
import { hydrateFromImmich, hydrateSkeletonFromImmich, enrichWithTagsAndPalettes, enrichAssetTags, generateClipTags, syncTagsToImmich } from './services/immichService';
import Workbench from './components/Workbench';
import Experience from './components/Experience';
import NavigationPrototype from './components/flow';
import { LoadingOverlay } from './components/VisualElements';
import { LayoutGrid, Network, HardDrive, Shield, ShieldAlert, Trash2, RefreshCw } from 'lucide-react';

const App: React.FC = () => {
    const [viewMode, setViewMode] = useState<ViewMode>('EXPERIENCE');
    const [experienceMode, setExperienceMode] = useState<ExperienceMode>('EXPLORE');

    const [images, setImages] = useState<ImageNode[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [loadingProgress, setLoadingProgress] = useState<{current: number, total: number} | null>(null);
    const [isInitializing, setIsInitializing] = useState(true);

    // AI State (CLIP Smart Search)
    const [isAIAnalyzing, setIsAIAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(0);
    const [shouldAutoRunClip, setShouldAutoRunClip] = useState(false);

    // Experience State
    const [experienceAnchor, setExperienceAnchor] = useState<AnchorState>({ mode: 'NONE', id: '' });
    const [_experienceContext, setExperienceContext] = useState<ExperienceContext>({ commonTags: [], activePalette: [] });

    // Filter State
    const [nsfwFilterActive, setNsfwFilterActive] = useState(false);

    // History Log (Newest first)
    const [history, setHistory] = useState<AnchorState[]>([]);

    // Track which assets have had tags fetched (for prototype progressive loading)
    const enrichedAssetIds = useRef(new Set<string>());

    // Priority tag enrichment — called when hero changes in prototype
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
        let cancelled = false; // Prevent StrictMode double-run from racing

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

        const initPrototype = async () => {
            await initDatabase();
            if (cancelled) return;
            setLoadingProgress({ current: 0, total: 0 });
            setIsInitializing(false);

            try {
                // Phase 1: skeleton with cached palettes — renders IdleField immediately
                const { albumAssets } = await hydrateSkeletonFromImmich(mergeImageBatch);
                if (cancelled) return;
                setLoadingProgress(null);

                // Phase 2: background enrichment (palettes + tags)
                await enrichWithTagsAndPalettes(
                    albumAssets,
                    (enrichedTags, assetTagMap) => {
                        if (cancelled) return;
                        // Mark all assets as enriched so priority fetch skips them
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
                console.error("Failed to hydrate from Immich (prototype)", e);
                if (!cancelled) setLoadingProgress(null);
            }
        };

        const initFull = async () => {
            await initDatabase();
            if (cancelled) return;
            setLoadingProgress({ current: 0, total: 0 });
            setIsInitializing(false);

            try {
                const { tags: loadedTags } = await hydrateFromImmich(
                    (current, total) => {
                        if (!cancelled) setLoadingProgress({ current, total });
                    },
                    mergeImageBatch
                );

                if (cancelled) return;
                setTags(loadedTags);
                await saveTagDefinitions(loadedTags);

            } catch (e) {
                console.error("Failed to hydrate from Immich", e);
            } finally {
                if (!cancelled) setLoadingProgress(null);
            }
        };

        if (window.location.pathname === '/prototype') {
            initPrototype();
        } else {
            initFull();
        }

        return () => { cancelled = true; };
    }, []);

    // --- HISTORY TRACKING ENGINE ---
    useEffect(() => {
        setHistory(prev => {
            if (prev.length > 0) {
                const last = prev[0];
                if (last.mode === experienceAnchor.mode && last.id === experienceAnchor.id) {
                    return prev;
                }
            }
            return [experienceAnchor, ...prev];
        });
    }, [experienceAnchor]);

    const handleUpdateImages = (updatedImages: ImageNode[]) => setImages(updatedImages);

    const handleAddTag = (newTag: Tag) => {
        setTags(prev => {
            if (prev.some(t => t.id === newTag.id)) return prev;
            return [...prev, newTag];
        });
    };

    const handleRefreshFromImmich = async () => {
        if(window.confirm("Refresh all data from Immich? This will clear the local cache.")) {
            await clearDatabase();
            setTags([]);
            setImages([]);
            setHistory([]);
            setLoadingProgress({ current: 0, total: 0 });

            try {
                const { tags: loadedTags } = await hydrateFromImmich(
                    (current, total) => {
                        setLoadingProgress({ current, total });
                    },
                    (newBatch) => {
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
                    }
                );

                setTags(loadedTags);
                await saveTagDefinitions(loadedTags);
            } catch (e) {
                console.error("Failed to refresh from Immich", e);
            } finally {
                setLoadingProgress(null);
            }
        }
    };

    const handleExperienceContextUpdate = (ctx: ExperienceContext) => {
        setExperienceContext(ctx);
    };

    const _handleTagClick = (tag: Tag) => {
        setExperienceAnchor({ mode: 'TAG', id: tag.id, meta: tag });
    };

    const _handleColorClick = (colorHex: string) => {
        setExperienceAnchor({ mode: 'COLOR', id: colorHex, meta: colorHex });
    };

    // --- AUTO-CLIP TRIGGER ---
    useEffect(() => {
        if (shouldAutoRunClip && images.length > 0 && !isAIAnalyzing && !loadingProgress) {
            setShouldAutoRunClip(false);
            runClipAnalysis(images);
        }
    }, [shouldAutoRunClip, images, isAIAnalyzing, loadingProgress]);

    // --- CLIP SMART SEARCH ---
    const runClipAnalysis = async (batchToProcess: ImageNode[]) => {

        setIsAIAnalyzing(true);
        setAnalysisProgress(0);

        try {
            const assetIds = batchToProcess.map(img => img.id);
            const { tags: clipTags, assetTagMap } = await generateClipTags(assetIds, (completed, total) => {
                setAnalysisProgress(Math.round((completed / total) * 100));
            });

            const newTagsToAdd: Tag[] = [];
            clipTags.forEach(t => {
                if (!tags.some(existing => existing.id === t.id) && !newTagsToAdd.some(pending => pending.id === t.id)) {
                    newTagsToAdd.push(t);
                }
            });

            const updatedImages = images.map(img => {
                const clipTagIds = assetTagMap.get(img.id);
                if (clipTagIds && clipTagIds.length > 0) {
                    const mergedAiTags = [...new Set([...(img.aiTagIds || []), ...clipTagIds])];
                    saveAITagsForFile(img.id, mergedAiTags);
                    return { ...img, aiTagIds: mergedAiTags };
                }
                return img;
            });

            if (newTagsToAdd.length > 0) {
                const mergedTags = [...tags, ...newTagsToAdd];
                setTags(mergedTags);
                await saveTagDefinitions(mergedTags);
            }

            setImages(updatedImages);

            // Sync CLIP tags to Immich for cross-device persistence
            syncTagsToImmich(clipTags, assetTagMap).catch(e =>
                console.error('Background Immich sync failed:', e)
            );

        } catch (error) {
            console.error("CLIP Analysis Failed", error);
            alert("CLIP analysis interrupted. Please check console.");
        } finally {
            setIsAIAnalyzing(false);
            setAnalysisProgress(0);
        }
    };

    const handleRunClipAnalysis = async () => {
        if (images.length === 0) return;

        const unanalyzedImages = images.filter(img => !img.aiTagIds || img.aiTagIds.length === 0);

        if (unanalyzedImages.length > 0) {
            runClipAnalysis(unanalyzedImages);
        } else if (window.confirm("All images have CLIP tags. Re-analyze everything?")) {
            runClipAnalysis(images);
        }
    };

    // --- SIMPLE ROUTE STATE ---
    const [pathname, setPathname] = useState(window.location.pathname);

    useEffect(() => {
        const onPopState = () => setPathname(window.location.pathname);
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    const isPrototype = pathname === '/prototype';

    const handleExitPrototype = () => {
        window.history.pushState({}, '', '/');
        setPathname('/');
    };

    if (isInitializing) {
        return <div className="fixed inset-0 bg-black z-[9999]" />;
    }

    // Prototype view — completely separate from main app
    if (isPrototype) {
        if (loadingProgress) {
            return (
                <div className="fixed inset-0 bg-[#faf9f6] flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-sm text-zinc-400 tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            Loading {loadingProgress.current} / {loadingProgress.total > 0 ? loadingProgress.total : '...'}
                        </p>
                    </div>
                </div>
            );
        }
        return <NavigationPrototype images={images} tags={tags} onExit={handleExitPrototype} onPrioritizeAssets={handlePrioritizeAssets} />;
    }

    // --- RENDERING ---
    return (
        <div className="flex flex-col h-[100dvh] w-screen bg-[#faf9f6] overflow-hidden relative">

            {/* --- LOADING OVERLAY --- */}
            {loadingProgress && (viewMode as string) === 'WORKBENCH' && (
                <LoadingOverlay
                    progress={loadingProgress}
                    images={images}
                    tags={tags}
                />
            )}

            {/* --- PERSISTENT NAVIGATION (WORKBENCH ONLY) --- */}
            {(viewMode as string) === 'WORKBENCH' && (
                <div className="h-14 flex-none bg-white/80 backdrop-blur-md border-b border-zinc-200 flex items-center px-6 justify-between z-50 transition-all duration-300">
                    {/* Left: View Switcher */}
                    <div className="flex items-center gap-6">
                        <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200">
                            <button
                                onClick={() => setViewMode('WORKBENCH')}
                                className={`px-3 py-1 text-xs font-medium flex items-center gap-2 transition-all rounded-md ${(viewMode as string) === 'WORKBENCH' ? 'bg-white shadow-sm text-teal-700 font-bold' : 'text-zinc-500 hover:text-zinc-800'}`}
                            >
                                <LayoutGrid size={14} />
                                WORKBENCH
                            </button>
                            <button
                                onClick={() => setViewMode('EXPERIENCE')}
                                className={`px-3 py-1 text-xs font-medium flex items-center gap-2 transition-all rounded-md ${viewMode === 'EXPERIENCE' ? 'bg-white shadow-sm text-indigo-600 font-bold' : 'text-zinc-500 hover:text-zinc-800'}`}
                            >
                                <Network size={14} />
                                EXPERIENCE
                            </button>
                        </div>

                        <div className="hidden md:flex items-center gap-2 text-xs text-zinc-400 border-l border-zinc-200 pl-4 h-6">
                            <div className="flex items-center gap-2">
                                <HardDrive size={12} />
                                <span>{images.length} Assets</span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Global Actions (Workbench Only) */}
                    <div className="flex items-center gap-3 w-[150px] justify-end">
                        <button
                            onClick={() => setNsfwFilterActive(!nsfwFilterActive)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-colors text-xs font-medium ${nsfwFilterActive ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-white text-zinc-400 border-zinc-200 hover:text-zinc-600'}`}
                            title={nsfwFilterActive ? "Filter Active (NSFW Hidden)" : "Filter Inactive (NSFW Visible)"}
                        >
                            {nsfwFilterActive ? <Shield size={14} /> : <ShieldAlert size={14} />}
                            <span className="hidden sm:inline">{nsfwFilterActive ? 'SAFE' : 'UNSAFE'}</span>
                        </button>

                        <button
                            onClick={handleRefreshFromImmich}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors text-xs font-medium"
                            title="Refresh from Immich"
                        >
                            <RefreshCw size={14} />
                            <span className="hidden sm:inline">REFRESH</span>
                        </button>

                        <button
                            onClick={handleRefreshFromImmich}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-xs font-medium"
                            title="Reset Workspace"
                        >
                            <Trash2 size={14} />
                            <span className="hidden sm:inline">RESET</span>
                        </button>
                    </div>
                </div>
            )}

            {/* --- MAIN CONTENT --- */}
            <main className="flex-1 w-full relative overflow-hidden">
                {(viewMode as string) === 'WORKBENCH' ? (
                    <Workbench
                        images={images}
                        tags={tags}
                        onUpdateImages={handleUpdateImages}
                        onAddTag={handleAddTag}
                        onViewChange={setViewMode}
                        onRunAIAnalysis={handleRunClipAnalysis}
                        isAnalyzing={isAIAnalyzing}
                        analysisProgress={analysisProgress}
                    />
                ) : (
                    <Experience
                        images={images}
                        tags={tags}
                        anchor={experienceAnchor}
                        history={history}
                        experienceMode={experienceMode}
                        onAnchorChange={setExperienceAnchor}
                        onContextUpdate={handleExperienceContextUpdate}
                        onViewChange={setViewMode}
                        onExperienceModeChange={setExperienceMode}
                        nsfwFilterActive={nsfwFilterActive}
                        loadingProgress={loadingProgress}
                        isAIAnalyzing={isAIAnalyzing}
                        analysisProgress={analysisProgress}
                    />
                )}
            </main>
        </div>
    );
};

export default App;
