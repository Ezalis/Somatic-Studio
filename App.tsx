
import React, { useState, useEffect } from 'react';
import { ViewMode, ExploreViewMode, ImageNode, Tag, TagType, AnchorState, ExperienceContext } from './types';
import { 
    initDatabase,
    clearDatabase,
    saveTagDefinitions,
    saveTagsForFile,
    exportDatabase,
    getSavedTagsForFile,
    saveAITagsForFile,
    exportAITagsDatabase
} from './services/resourceService';
import { 
    processImageFile, 
    generateUUID, 
    getSeason, 
    extractColorPalette, 
    formatShutterSpeed 
} from './services/dataService';
import { processBatchAIAnalysis } from './services/aiService';
import Workbench from './components/Workbench';
import Experience from './components/Experience';
import { LayoutGrid, Network, DownloadCloud, Trash2, Loader2, Plus, HardDrive, Camera, X, Tag as TagIcon, Palette, Hash, Eye, Sparkles as SparklesIcon } from 'lucide-react';
import exifr from 'exifr';

const App: React.FC = () => {
    const [viewMode, setViewMode] = useState<ViewMode>('WORKBENCH');
    const [exploreViewMode, setExploreViewMode] = useState<ExploreViewMode>('ESOTERIC');
    const [images, setImages] = useState<ImageNode[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // AI State
    const [isAIAnalyzing, setIsAIAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(0);

    // Experience State
    const [experienceAnchor, setExperienceAnchor] = useState<AnchorState>({ mode: 'NONE', id: '' });
    const [experienceContext, setExperienceContext] = useState<ExperienceContext>({ commonTags: [], activePalette: [] });

    // --- INITIALIZATION ---
    useEffect(() => {
        const init = async () => {
            const loadedTags = await initDatabase();
            setTags(loadedTags);
        };
        init();
    }, []);

    const handleUpdateImages = (updatedImages: ImageNode[]) => setImages(updatedImages);

    const handleAddTag = (newTag: Tag) => {
        setTags(prev => {
            if (prev.some(t => t.id === newTag.id)) return prev;
            return [...prev, newTag];
        });
    };

    const handleResetDatabase = async () => {
        if(window.confirm("Are you sure you want to clear the current workspace?")) {
            await clearDatabase();
            setTags([]);
            setImages([]);
            const loadedTags = await initDatabase();
            setTags(loadedTags);
        }
    };

    const handleExperienceContextUpdate = (ctx: ExperienceContext) => {
        setExperienceContext(ctx);
    };

    const handleTagClick = (tag: Tag) => {
        setExperienceAnchor({ mode: 'TAG', id: tag.id, meta: tag });
    };

    const handleColorClick = (colorHex: string) => {
        setExperienceAnchor({ mode: 'COLOR', id: colorHex, meta: colorHex });
    };

    // --- AI ANALYSIS ---
    const handleRunAIAnalysis = async () => {
        if (images.length === 0) return;
        
        // 1. Filter for images that lack AI tags to prioritize them
        const unanalyzedImages = images.filter(img => !img.aiTagIds || img.aiTagIds.length === 0);
        
        // 2. If all are analyzed, ask to re-analyze all, otherwise process only new ones
        let batchToProcess = unanalyzedImages;
        if (unanalyzedImages.length === 0) {
            if (window.confirm("All images have AI tags. Re-analyze everything?")) {
                batchToProcess = images;
            } else {
                return;
            }
        }

        setIsAIAnalyzing(true);
        setAnalysisProgress(0);

        try {
            const results = await processBatchAIAnalysis(batchToProcess, (completed, total) => {
                setAnalysisProgress(Math.round((completed / total) * 100));
            });

            // Update State and DB
            const newTagsToAdd: Tag[] = [];
            
            const updatedImages = images.map(img => {
                const result = results.find(r => r.imageId === img.id);
                if (result) {
                    // Accumulate definitions
                    result.tags.forEach(t => {
                        if (!tags.some(existing => existing.id === t.id) && !newTagsToAdd.some(pending => pending.id === t.id)) {
                            newTagsToAdd.push(t);
                        }
                    });
                    
                    // Persist Mappings
                    saveAITagsForFile(img.fileName, result.tagIds);
                    
                    return { ...img, aiTagIds: result.tagIds };
                }
                return img;
            });

            if (newTagsToAdd.length > 0) {
                const mergedTags = [...tags, ...newTagsToAdd];
                setTags(mergedTags);
                await saveTagDefinitions(mergedTags);
            }

            setImages(updatedImages);

        } catch (error) {
            console.error("AI Analysis Failed", error);
            alert("Analysis interrupted. Please check console.");
        } finally {
            setIsAIAnalyzing(false);
            setAnalysisProgress(0);
        }
    };

    // --- GLOBAL FILE INGESTION ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        // Filter out duplicates based on filename
        const existingFileNames = new Set(images.map(img => img.fileName));
        // Fix: Explicitly cast Array.from result to File[] to avoid unknown inference
        const files = (Array.from(e.target.files) as File[]).filter(f => !existingFileNames.has(f.name));

        if (files.length === 0) {
            e.target.value = '';
            return;
        }

        setIsProcessing(true);
        const newImages: ImageNode[] = [];
        let currentTags = [...tags];
        const processedTags = new Set<string>(tags.map(t => t.id));

        const createTagId = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const ensureTag = (label: string, type: TagType): string => {
            const id = createTagId(label);
            if (!processedTags.has(id)) {
                const newTag: Tag = { id, label, type };
                handleAddTag(newTag);
                processedTags.add(id);
                currentTags.push(newTag);
                saveTagDefinitions(currentTags); 
            }
            return id;
        };

        try {
            for (const file of files) {
                // Fix: file is already typed as File from the array cast above
                const { image, newTags } = await processImageFile(file, file.name, currentTags);
                
                // Merge new tags from processing
                newTags.forEach(t => {
                    if (!processedTags.has(t.id)) {
                        handleAddTag(t);
                        processedTags.add(t.id);
                        currentTags.push(t);
                    }
                });
                if(newTags.length > 0) saveTagDefinitions(currentTags);

                newImages.push(image);
            }
            setImages(prev => [...prev, ...newImages].sort((a, b) => a.captureTimestamp - b.captureTimestamp));
        } catch (error) {
            console.error(error);
        } finally {
            setIsProcessing(false);
            e.target.value = '';
        }
    };


    // --- RENDERING ---
    const activeImage = experienceAnchor.mode === 'IMAGE' ? images.find(i => i.id === experienceAnchor.id) : undefined;

    return (
        <div className="flex flex-col h-screen w-screen bg-[#faf9f6] overflow-hidden">
            {/* --- PERSISTENT NAVIGATION --- */}
            <div className="h-14 flex-none bg-white/80 backdrop-blur-md border-b border-zinc-200 flex items-center px-6 justify-between z-50 transition-all duration-300">
                {/* Left: View Switcher */}
                <div className="flex items-center gap-6">
                    <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200">
                        <button 
                            onClick={() => setViewMode('WORKBENCH')} 
                            className={`px-3 py-1 text-xs font-medium flex items-center gap-2 transition-all rounded-md ${viewMode === 'WORKBENCH' ? 'bg-white shadow-sm text-teal-700 font-bold' : 'text-zinc-500 hover:text-zinc-800'}`}
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

                    {viewMode === 'EXPERIENCE' && (
                        <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200">
                            <button 
                                onClick={() => setExploreViewMode('ESOTERIC')} 
                                className={`px-3 py-1 text-xs font-medium flex items-center gap-2 transition-all rounded-md ${exploreViewMode === 'ESOTERIC' ? 'bg-zinc-800 shadow-sm text-zinc-50 font-bold' : 'text-zinc-500 hover:text-zinc-800'}`}
                                title="Procedural glyph representation"
                            >
                                <SparklesIcon size={12} />
                                ESOTERIC
                            </button>
                            <button 
                                onClick={() => setExploreViewMode('GALLERY')} 
                                className={`px-3 py-1 text-xs font-medium flex items-center gap-2 transition-all rounded-md ${exploreViewMode === 'GALLERY' ? 'bg-zinc-800 shadow-sm text-zinc-50 font-bold' : 'text-zinc-500 hover:text-zinc-800'}`}
                                title="Photographic gallery"
                            >
                                <Eye size={12} />
                                GALLERY
                            </button>
                        </div>
                    )}
                    
                    {viewMode === 'WORKBENCH' && (
                        <div className="hidden md:flex items-center gap-2 text-xs text-zinc-400 border-l border-zinc-200 pl-4 h-6">
                            <div className="flex items-center gap-2">
                                <HardDrive size={12} />
                                <span>{images.length} Assets</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Center: Contextual Toolbar (EXPERIENCE MODE) */}
                {viewMode === 'EXPERIENCE' && (
                    <div className="flex-1 flex items-center justify-center px-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        {experienceAnchor.mode !== 'NONE' && (
                            <div className="flex items-center gap-4 h-9 px-4 bg-white rounded-md border border-zinc-200 shadow-sm font-mono">
                                
                                {/* 1. IMAGE MODE */}
                                {experienceAnchor.mode === 'IMAGE' && activeImage && (
                                    <>
                                        {/* Palette (Navigable) */}
                                        <div className="flex gap-1.5 items-center">
                                            {experienceContext.activePalette.map((c, i) => (
                                                <button 
                                                    key={i} 
                                                    onClick={() => handleColorClick(c)} 
                                                    className="w-3.5 h-3.5 rounded-sm ring-1 ring-black/5 hover:scale-110 hover:ring-2 hover:ring-zinc-400 transition-all" 
                                                    style={{ backgroundColor: c }} 
                                                    title="Explore color"
                                                />
                                            ))}
                                        </div>

                                        <div className="w-px h-3 bg-zinc-200" />

                                        {/* Tags (Navigable) */}
                                        <div className="flex items-center gap-1.5">
                                            {experienceContext.commonTags.slice(0, 4).map(tag => (
                                                <button 
                                                    key={tag.id} 
                                                    onClick={() => handleTagClick(tag)}
                                                    className={`
                                                        px-2 py-0.5 text-[10px] rounded transition-colors whitespace-nowrap uppercase tracking-wide border
                                                        ${tag.type === TagType.AI_GENERATED 
                                                            ? 'bg-violet-50 hover:bg-violet-100 border-violet-100 text-violet-700' 
                                                            : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-zinc-900'}
                                                    `}
                                                >
                                                    {tag.label}
                                                </button>
                                            ))}
                                            {experienceContext.commonTags.length > 4 && (
                                                <span className="text-[10px] text-zinc-300">•••</span>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* 2. TAG MODE */}
                                {experienceAnchor.mode === 'TAG' && (
                                    <>
                                        <div className={`flex items-center gap-2 text-xs font-bold px-2 py-0.5 rounded border ${
                                            experienceAnchor.meta?.type === TagType.AI_GENERATED 
                                                ? 'bg-violet-100 text-violet-800 border-violet-200' 
                                                : 'bg-zinc-100 text-zinc-800 border-zinc-200/50'
                                        }`}>
                                            <TagIcon size={10} className={experienceAnchor.meta?.type === TagType.AI_GENERATED ? 'text-violet-500' : 'text-zinc-400'} />
                                            <span className="uppercase tracking-wide">{experienceAnchor.meta?.label || 'TAG'}</span>
                                        </div>
                                        
                                        {experienceContext.commonTags.length > 0 && (
                                            <>
                                                <div className="w-px h-3 bg-zinc-200" />
                                                <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider hidden sm:inline-block">Related</span>
                                                <div className="flex items-center gap-1.5">
                                                    {experienceContext.commonTags.map(tag => (
                                                        <button 
                                                            key={tag.id} 
                                                            onClick={() => handleTagClick(tag)}
                                                            className={`
                                                                px-2 py-0.5 text-[10px] rounded transition-colors whitespace-nowrap uppercase tracking-wide border
                                                                ${tag.type === TagType.AI_GENERATED 
                                                                    ? 'bg-violet-50 hover:bg-violet-100 border-violet-100 text-violet-700' 
                                                                    : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-600 hover:text-zinc-900'}
                                                            `}
                                                        >
                                                            {tag.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}

                                {/* 3. COLOR MODE */}
                                {experienceAnchor.mode === 'COLOR' && (
                                    <>
                                        <div className="flex items-center gap-2 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/50">
                                             <div className="w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: experienceAnchor.id }} />
                                             <span className="text-[10px] font-mono text-zinc-600 uppercase">{experienceAnchor.id}</span>
                                        </div>

                                        <div className="w-px h-3 bg-zinc-200" />
                                        <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider hidden sm:inline-block">Adjacent</span>

                                        <div className="flex gap-1.5 items-center">
                                            {experienceContext.activePalette.filter(c => c !== experienceAnchor.id).map((c, i) => (
                                                <button 
                                                    key={i} 
                                                    onClick={() => handleColorClick(c)} 
                                                    className="w-3.5 h-3.5 rounded-sm ring-1 ring-black/5 hover:scale-110 hover:ring-2 hover:ring-zinc-400 transition-all" 
                                                    style={{ backgroundColor: c }} 
                                                    title="Navigate to color"
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}

                                <div className="w-px h-3 bg-zinc-200 ml-1" />
                                
                                <button 
                                    onClick={() => setExperienceAnchor({ mode: 'NONE', id: '' })} 
                                    className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded transition-all"
                                    title="Close View"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Right: Global Actions (Workbench Only) */}
                <div className="flex items-center gap-3 w-[150px] justify-end">
                    {viewMode === 'WORKBENCH' && (
                        <>
                            <button
                                onClick={exportDatabase}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors text-xs font-medium"
                                title="Download Tags JSON"
                            >
                                <DownloadCloud size={14} />
                                <span className="hidden sm:inline">EXPORT</span>
                            </button>

                            <button
                                onClick={handleResetDatabase}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-xs font-medium"
                                title="Reset Workspace"
                            >
                                <Trash2 size={14} />
                                <span className="hidden sm:inline">RESET</span>
                            </button>

                            <div className="w-px h-6 bg-zinc-200 mx-2" />

                            <label className={`cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-1.5 rounded-md font-medium transition-colors text-xs tracking-wider flex items-center gap-2 shadow-sm ${isProcessing ? 'opacity-50' : ''}`}>
                                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                <span className="hidden sm:inline">INGEST</span>
                                <input type="file" multiple className="hidden" onChange={handleFileUpload} accept="image/jpeg,image/png,image/webp" />
                            </label>
                        </>
                    )}
                </div>
            </div>

            {/* --- MAIN CONTENT --- */}
            <main className="flex-1 w-full relative overflow-hidden">
                {viewMode === 'WORKBENCH' ? (
                    <Workbench 
                        images={images} 
                        tags={tags} 
                        onUpdateImages={handleUpdateImages}
                        onAddTag={handleAddTag}
                        onViewChange={setViewMode}
                        onResetDatabase={handleResetDatabase}
                        onRunAIAnalysis={handleRunAIAnalysis}
                        onExportAITags={exportAITagsDatabase}
                        isAnalyzing={isAIAnalyzing}
                        analysisProgress={analysisProgress}
                    />
                ) : (
                    <Experience 
                        images={images} 
                        tags={tags} 
                        anchor={experienceAnchor}
                        exploreViewMode={exploreViewMode}
                        onAnchorChange={setExperienceAnchor}
                        onContextUpdate={handleExperienceContextUpdate}
                        onViewChange={setViewMode}
                    />
                )}
            </main>
        </div>
    );
};

export default App;
