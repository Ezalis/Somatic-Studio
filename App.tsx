
import React, { useState, useEffect } from 'react';
import { ViewMode, ExperienceMode, ImageNode, Tag, TagType, AnchorState, ExperienceContext } from './types';
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
import { LayoutGrid, Network, DownloadCloud, Trash2, Loader2, Plus, HardDrive, Camera, X, Tag as TagIcon, Palette, Hash, Eye, Sparkles as SparklesIcon, History, Globe, Shield, ShieldAlert, Calendar, Aperture, Snowflake, Sun, Cloud, Thermometer } from 'lucide-react';
import exifr from 'exifr';

const App: React.FC = () => {
    const [viewMode, setViewMode] = useState<ViewMode>('WORKBENCH');
    const [experienceMode, setExperienceMode] = useState<ExperienceMode>('EXPLORE');
    
    const [images, setImages] = useState<ImageNode[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // AI State
    const [isAIAnalyzing, setIsAIAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState(0);

    // Experience State
    const [experienceAnchor, setExperienceAnchor] = useState<AnchorState>({ mode: 'NONE', id: '' });
    const [experienceContext, setExperienceContext] = useState<ExperienceContext>({ commonTags: [], activePalette: [] });
    
    // Filter State
    const [nsfwFilterActive, setNsfwFilterActive] = useState(false);

    // History Log (Newest first)
    const [history, setHistory] = useState<AnchorState[]>([]);

    // --- INITIALIZATION ---
    useEffect(() => {
        const init = async () => {
            const loadedTags = await initDatabase();
            setTags(loadedTags);
        };
        init();
    }, []);

    // --- HISTORY TRACKING ENGINE ---
    useEffect(() => {
        setHistory(prev => {
            // Prevent duplicate adjacent entries (e.g. React double-invokes or accidental multi-clicks)
            if (prev.length > 0) {
                const last = prev[0];
                if (last.mode === experienceAnchor.mode && last.id === experienceAnchor.id) {
                    return prev;
                }
            }
            // Add new step to the TOP of the stack
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

    const handleResetDatabase = async () => {
        if(window.confirm("Are you sure you want to clear the current workspace?")) {
            await clearDatabase();
            setTags([]);
            setImages([]);
            setHistory([]);
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
        
        const unanalyzedImages = images.filter(img => !img.aiTagIds || img.aiTagIds.length === 0);
        
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

            const newTagsToAdd: Tag[] = [];
            
            const updatedImages = images.map(img => {
                const result = results.find(r => r.imageId === img.id);
                if (result) {
                    result.tags.forEach(t => {
                        if (!tags.some(existing => existing.id === t.id) && !newTagsToAdd.some(pending => pending.id === t.id)) {
                            newTagsToAdd.push(t);
                        }
                    });
                    
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
        
        const existingFileNames = new Set(images.map(img => img.fileName));
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
                const { image, newTags } = await processImageFile(file, file.name, currentTags);
                
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

                    {viewMode === 'WORKBENCH' && (
                        <div className="hidden md:flex items-center gap-2 text-xs text-zinc-400 border-l border-zinc-200 pl-4 h-6">
                            <div className="flex items-center gap-2">
                                <HardDrive size={12} />
                                <span>{images.length} Assets</span>
                            </div>
                        </div>
                    )}
                    
                    {viewMode === 'EXPERIENCE' && (
                         <div className="flex items-center gap-2 text-xs text-zinc-400 border-l border-zinc-200 pl-4 h-6">
                            <span className="font-bold text-zinc-300 uppercase tracking-widest text-[10px]">View Mode</span>
                            <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg border border-zinc-200 ml-2">
                                <button 
                                    onClick={() => setExperienceMode('EXPLORE')}
                                    className={`px-2 py-0.5 text-[10px] font-bold flex items-center gap-1.5 transition-all rounded-md ${experienceMode === 'EXPLORE' ? 'bg-white shadow-sm text-indigo-600' : 'text-zinc-400 hover:text-zinc-600'}`}
                                >
                                    <Globe size={12} />
                                    EXPLORE
                                </button>
                                <button 
                                    onClick={() => setExperienceMode('HISTORY')}
                                    className={`px-2 py-0.5 text-[10px] font-bold flex items-center gap-1.5 transition-all rounded-md ${experienceMode === 'HISTORY' ? 'bg-white shadow-sm text-rose-600' : 'text-zinc-400 hover:text-zinc-600'}`}
                                >
                                    <History size={12} />
                                    HISTORY
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Global Actions (Workbench Only) */}
                <div className="flex items-center gap-3 w-[150px] justify-end">
                    {viewMode === 'WORKBENCH' && (
                        <>
                            {/* NSFW Filter Toggle */}
                            <button
                                onClick={() => setNsfwFilterActive(!nsfwFilterActive)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-colors text-xs font-medium ${nsfwFilterActive ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-white text-zinc-400 border-zinc-200 hover:text-zinc-600'}`}
                                title={nsfwFilterActive ? "Filter Active (NSFW Hidden)" : "Filter Inactive (NSFW Visible)"}
                            >
                                {nsfwFilterActive ? <Shield size={14} /> : <ShieldAlert size={14} />}
                                <span className="hidden sm:inline">{nsfwFilterActive ? 'SAFE' : 'UNSAFE'}</span>
                            </button>

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
                        history={history}
                        experienceMode={experienceMode}
                        onAnchorChange={setExperienceAnchor}
                        onContextUpdate={handleExperienceContextUpdate}
                        onViewChange={setViewMode}
                        nsfwFilterActive={nsfwFilterActive}
                    />
                )}
            </main>
        </div>
    );
};

export default App;
