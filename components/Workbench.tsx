
import React, { useState, useMemo } from 'react';
import { ImageNode, Tag, TagType, ViewMode } from '../types';
import { 
    Camera, Plus, Search, X, Check, Eraser, AlertCircle, Sparkles, BrainCircuit, Download,
    Network
} from 'lucide-react';
import { generateUUID } from '../services/dataService';
import { 
    saveTagsForFile, 
    saveTagDefinitions,
    saveAITagsForFile,
    saveImageMetadata
} from '../services/resourceService';
import { harmonizeTagsBatch } from '../services/aiService';

interface WorkbenchProps {
    images: ImageNode[];
    tags: Tag[];
    onUpdateImages: (images: ImageNode[]) => void;
    onAddTag: (newTag: Tag) => void;
    onResetDatabase: () => void;
    onViewChange: (mode: ViewMode) => void;
    onRunAIAnalysis: () => void;
    onExportAITags: () => void;
    isAnalyzing: boolean;
    analysisProgress: number;
}

const getTagColor = (type: TagType) => {
    switch(type) {
        case TagType.TECHNICAL: return 'bg-slate-100 text-slate-600 border-slate-200 group-hover:border-slate-300';
        case TagType.SEASONAL: return 'bg-emerald-50 text-emerald-700 border-emerald-100 group-hover:border-emerald-200';
        case TagType.CATEGORICAL: return 'bg-sky-50 text-sky-700 border-sky-100 group-hover:border-sky-200';
        case TagType.QUALITATIVE: return 'bg-rose-50 text-rose-700 border-rose-100 group-hover:border-rose-200';
        case TagType.AI_GENERATED: return 'bg-violet-50 text-violet-700 border-violet-100 group-hover:border-violet-200';
        default: return 'bg-zinc-100 text-zinc-600 border-zinc-200';
    }
};

const Workbench: React.FC<WorkbenchProps> = ({ 
    images, 
    tags, 
    onUpdateImages, 
    onAddTag,
    onRunAIAnalysis,
    onExportAITags,
    isAnalyzing,
    analysisProgress
}) => {
    // --- STATE ---
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    
    // Search & Filter
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTagFilters, setActiveTagFilters] = useState<Set<string>>(new Set());

    // Batch Action State
    const [batchTagInput, setBatchTagInput] = useState('');
    const [isRemoveMenuOpen, setIsRemoveMenuOpen] = useState(false);

    // Harmonization State
    const [isHarmonizing, setIsHarmonizing] = useState(false);
    const [harmonizeProgress, setHarmonizeProgress] = useState(0);
    
    // --- DERIVED DATA ---
    const filteredImages = useMemo(() => {
        return images.filter(img => {
            // 1. Tag Filters
            if (activeTagFilters.size > 0) {
                // Combine manual and AI tags for filtering
                const allImgTags = [...img.tagIds, ...(img.aiTagIds || [])];
                const hasAll = Array.from(activeTagFilters).every(tId => allImgTags.includes(tId));
                if (!hasAll) return false;
            }
            // 2. Text Search
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchesMeta = 
                    img.fileName.toLowerCase().includes(q) ||
                    img.cameraModel.toLowerCase().includes(q) ||
                    img.lensModel.toLowerCase().includes(q);
                
                if (matchesMeta) return true;
                const allImgTagIds = [...img.tagIds, ...(img.aiTagIds || [])];
                const imgTagLabels = allImgTagIds.map(id => tags.find(t => t.id === id)?.label.toLowerCase());
                if (imgTagLabels.some(l => l?.includes(q))) return true;
                return false;
            }
            return true;
        });
    }, [images, activeTagFilters, searchQuery, tags]);

    const getTagById = (id: string) => tags.find(t => t.id === id);

    // --- HARMONIZATION LOGIC ---
    const handleRunHarmonization = async () => {
        if (images.length === 0) return;

        // 1. Identify un-harmonized images (Resume Logic)
        const unharmonizedImages = images.filter(img => !img.tagVersion || img.tagVersion < 1);
        
        let batchToProcess = unharmonizedImages;
        if (unharmonizedImages.length === 0) {
            if (window.confirm("All images are already harmonized (v1.0). Re-process everything?")) {
                batchToProcess = images;
            } else {
                return;
            }
        }

        setIsHarmonizing(true);
        setHarmonizeProgress(0);

        // 2. Calculate Global Context (Preferred Common Tags)
        // Frequency analysis of current tags
        const tagCounts: Record<string, number> = {};
        images.forEach(img => {
            [...img.tagIds, ...(img.aiTagIds || [])].forEach(tid => {
                tagCounts[tid] = (tagCounts[tid] || 0) + 1;
            });
        });
        // Sort by frequency
        const sortedTagIds = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
        // Get top 100 labels
        const preferredLabels = sortedTagIds.slice(0, 100).map(tid => {
            const t = tags.find(tag => tag.id === tid);
            return t ? t.label : null;
        }).filter((l): l is string => !!l);

        try {
            const results = await harmonizeTagsBatch(
                batchToProcess, 
                tags, 
                preferredLabels, 
                (completed, total) => {
                    setHarmonizeProgress(Math.round((completed / total) * 100));
                }
            );

            // Update State & DB
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

                    // Save AI Tags (Overwriting previous ones with harmonized set)
                    saveAITagsForFile(img.fileName, result.tagIds);
                    
                    // Mark as Version 1.0
                    saveImageMetadata(img.fileName, { tagVersion: 1 });

                    return { ...img, aiTagIds: result.tagIds, tagVersion: 1 };
                }
                return img;
            });

            if (newTagsToAdd.length > 0) {
                const mergedTags = [...tags, ...newTagsToAdd];
                // Note: We don't call onAddTag in loop to avoid rapid re-renders, assuming parent handles updates via onUpdateImages? 
                // Actually parent manages `tags`. We need to bubble this up. 
                // For now, we will update the parent `tags` state via `onAddTag` manually or just assume saveTagDefinitions works if we reload. 
                // But to be safe, let's just save to DB. The parent `App` doesn't expose a bulk add tags.
                // We'll iterate and add.
                newTagsToAdd.forEach(t => onAddTag(t));
                await saveTagDefinitions([...tags, ...newTagsToAdd]); 
            }

            onUpdateImages(updatedImages);

        } catch (error) {
            console.error("Harmonization Failed", error);
            alert("Harmonization interrupted. Check console.");
        } finally {
            setIsHarmonizing(false);
            setHarmonizeProgress(0);
        }
    };

    // --- HANDLERS: SELECTION ---
    const handleSelect = (id: string, event: React.MouseEvent) => {
        const newSelected = new Set(selectedIds);
        if (event.shiftKey && lastSelectedId) {
            const lastIndex = filteredImages.findIndex(img => img.id === lastSelectedId);
            const currentIndex = filteredImages.findIndex(img => img.id === id);
            if (lastIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(lastIndex, currentIndex);
                const end = Math.max(lastIndex, currentIndex);
                for (let i = start; i <= end; i++) {
                    newSelected.add(filteredImages[i].id);
                }
            }
        } else if (event.metaKey || event.ctrlKey) {
            if (newSelected.has(id)) newSelected.delete(id);
            else newSelected.add(id);
            setLastSelectedId(id);
        } else {
            newSelected.clear();
            newSelected.add(id);
            setLastSelectedId(id);
        }
        setSelectedIds(newSelected);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === filteredImages.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredImages.map(i => i.id)));
        }
    };

    // --- HANDLERS: BATCH OPERATIONS ---
    const handleBatchAddTag = () => {
        if (!batchTagInput.trim() || selectedIds.size === 0) return;
        let tagToAdd = tags.find(t => t.label.toLowerCase() === batchTagInput.toLowerCase());
        let isNewTag = false;
        if (!tagToAdd) {
            tagToAdd = { id: generateUUID(), label: batchTagInput, type: TagType.QUALITATIVE };
            onAddTag(tagToAdd);
            isNewTag = true;
        }
        if (isNewTag) saveTagDefinitions([...tags, tagToAdd]);
        const updatedImages = images.map(img => {
            if (selectedIds.has(img.id)) {
                if (!img.tagIds.includes(tagToAdd!.id)) {
                    const newTags = [...img.tagIds, tagToAdd!.id];
                    saveTagsForFile(img.fileName, newTags);
                    return { ...img, tagIds: newTags };
                }
            }
            return img;
        });
        onUpdateImages(updatedImages);
        setBatchTagInput('');
    };

    const handleBatchRemoveTag = (tagIdToRemove: string) => {
        const updatedImages = images.map(img => {
            if (selectedIds.has(img.id)) {
                if (img.tagIds.includes(tagIdToRemove)) {
                    const newTags = img.tagIds.filter(t => t !== tagIdToRemove);
                    saveTagsForFile(img.fileName, newTags);
                    return { ...img, tagIds: newTags };
                }
            }
            return img;
        });
        onUpdateImages(updatedImages);
        setIsRemoveMenuOpen(false); 
    };

    const commonTagsInSelection = useMemo(() => {
        if (selectedIds.size === 0) return [];
        const tagsInSelection = new Set<string>();
        images.forEach(img => {
            if (selectedIds.has(img.id)) {
                img.tagIds.forEach(t => tagsInSelection.add(t));
            }
        });
        return Array.from(tagsInSelection).map(id => getTagById(id)).filter(Boolean) as Tag[];
    }, [selectedIds, images, tags]);

    return (
        <div className="flex flex-col h-full bg-[#faf9f6] text-zinc-700 font-mono text-sm relative">
            
            {/* --- FILTER ROW & AI ACTIONS --- */}
            <div className="px-6 py-3 flex items-center justify-between gap-4 border-b border-zinc-200 bg-white/50 backdrop-blur-sm z-20 shadow-sm">
                <div className="flex items-center gap-4 flex-1">
                    <div className="relative w-64">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input 
                            type="text" 
                            placeholder="Filter..." 
                            className="w-full pl-9 pr-3 py-1.5 bg-white border border-zinc-200 rounded-md text-xs focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 transition-all shadow-sm"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    
                    {/* Active Filters */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-[500px]">
                        {activeTagFilters.size > 0 && (
                            <span className="text-[10px] uppercase font-bold text-zinc-400 mr-1 flex-shrink-0">Filtered by:</span>
                        )}
                        {Array.from(activeTagFilters).map(tId => {
                            const tag = getTagById(tId);
                            if (!tag) return null;
                            return (
                                <button 
                                    key={tId}
                                    onClick={() => {
                                        const newSet = new Set(activeTagFilters);
                                        newSet.delete(tId);
                                        setActiveTagFilters(newSet);
                                    }}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-white border border-zinc-200 rounded text-xs text-zinc-700 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors shadow-sm whitespace-nowrap"
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full ${tag.type === TagType.AI_GENERATED ? 'bg-violet-500' : 'bg-teal-500'}`} />
                                    {tag.label}
                                    <X size={10} className="ml-1" />
                                </button>
                            );
                        })}
                        {activeTagFilters.size > 0 && (
                            <button 
                                onClick={() => setActiveTagFilters(new Set())}
                                className="text-[10px] text-zinc-400 hover:text-zinc-600 underline ml-2"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                </div>

                {/* AI & Export Actions */}
                <div className="flex items-center gap-3 pl-4 border-l border-zinc-200">
                     <button
                        onClick={onRunAIAnalysis}
                        disabled={isAnalyzing || isHarmonizing || images.length === 0}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors text-xs font-bold ${isAnalyzing ? 'opacity-70 cursor-wait' : ''}`}
                        title="Generate Initial AI Tags"
                    >
                        {isAnalyzing ? (
                             <div className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <BrainCircuit size={14} />
                        )}
                        <span>{isAnalyzing ? `${analysisProgress}%` : 'AI TAGS'}</span>
                    </button>

                    <button
                        onClick={handleRunHarmonization}
                        disabled={isAnalyzing || isHarmonizing || images.length === 0}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors text-xs font-bold ${isHarmonizing ? 'opacity-70 cursor-wait' : ''}`}
                        title="Refine tags to increase network density (v1.0)"
                    >
                        {isHarmonizing ? (
                             <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Network size={14} />
                        )}
                        <span>{isHarmonizing ? `${harmonizeProgress}%` : 'HARMONIZE v1.0'}</span>
                    </button>

                    <button
                        onClick={onExportAITags}
                        disabled={isAnalyzing || isHarmonizing}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 transition-colors text-xs font-medium"
                        title="Export AI-tags.json"
                    >
                        <Download size={14} />
                        <span>JSON</span>
                    </button>
                </div>
            </div>

            {/* --- LIST HEADER --- */}
            {filteredImages.length > 0 && (
                <div className="grid grid-cols-[40px_60px_140px_1fr_1fr_200px] gap-4 px-6 py-2 border-b border-zinc-200 text-[10px] text-zinc-400 uppercase tracking-wider font-bold bg-zinc-50/50">
                    <div className="flex justify-center items-center">
                        <button onClick={handleSelectAll} className="hover:text-zinc-600">
                             {selectedIds.size > 0 && selectedIds.size === filteredImages.length ? <AlertCircle size={14} /> : <div className="w-3.5 h-3.5 border border-zinc-300 rounded-sm" />}
                        </button>
                    </div>
                    <div>Preview</div>
                    <div>Captured</div>
                    <div>Metadata & Tags</div>
                    <div className="flex items-center gap-2 text-violet-400">
                        <Sparkles size={10} />
                        AI Insights
                    </div>
                    <div>Technical</div>
                </div>
            )}

            {/* --- EMPTY STATE --- */}
            {filteredImages.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 space-y-4 bg-zinc-50/30">
                    {images.length === 0 ? (
                        <>
                            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center border border-zinc-200 shadow-sm text-zinc-300">
                                <Camera size={32} strokeWidth={1.5} />
                            </div>
                            <p className="font-light">No organic matter detected.</p>
                        </>
                    ) : (
                        <div className="text-center">
                            <Search size={24} className="mx-auto mb-2 opacity-50" />
                            <p>No matches for current filter.</p>
                            <button onClick={() => {setSearchQuery(''); setActiveTagFilters(new Set())}} className="text-xs text-teal-600 hover:underline mt-2">Clear filters</button>
                        </div>
                    )}
                </div>
            )}

            {/* --- LIST VIEW --- */}
            <div className="flex-1 overflow-y-auto pb-32" onClick={() => setSelectedIds(new Set())}>
                {/* Fix: Explicitly type img as ImageNode to resolve unknown inference issues */}
                {filteredImages.map((img: ImageNode) => {
                    const isSelected = selectedIds.has(img.id);
                    const dateObj = new Date(img.captureTimestamp);
                    const isHarmonized = img.tagVersion === 1;

                    return (
                        <div 
                            key={img.id}
                            onClick={(e) => { e.stopPropagation(); handleSelect(img.id, e); }}
                            className={`
                                grid grid-cols-[40px_60px_140px_1fr_1fr_200px] gap-4 px-6 py-3 border-b border-zinc-100 
                                transition-colors cursor-pointer select-none group items-center relative
                                ${isSelected ? 'bg-indigo-50/40 border-l-4 border-l-indigo-500 pl-[20px]' : 'hover:bg-white border-l-4 border-l-transparent pl-[20px]'}
                            `}
                        >
                            {/* Checkbox */}
                            <div className="flex items-center justify-center">
                                <div className={`w-3.5 h-3.5 border rounded-sm flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-zinc-300 bg-white group-hover:border-zinc-400'}`}>
                                    {isSelected && <Check size={10} className="text-white" />}
                                </div>
                            </div>

                            {/* Thumbnail */}
                            <div className="w-10 h-10 bg-zinc-200 rounded overflow-hidden shadow-sm border border-zinc-200 relative">
                                <img src={img.fileUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                {isHarmonized && (
                                    <div className="absolute bottom-0 right-0 bg-indigo-500 w-2.5 h-2.5 rounded-tl-sm flex items-center justify-center" title="Tags Harmonized (v1.0)">
                                        <div className="w-1 h-1 bg-white rounded-full" />
                                    </div>
                                )}
                            </div>

                            {/* Timestamp */}
                            <div className="flex flex-col justify-center text-zinc-500 leading-tight">
                                <span className={`font-medium text-xs ${isSelected ? 'text-indigo-900' : 'text-zinc-700'}`}>{dateObj.toLocaleDateString()}</span>
                                <span className="text-[10px] opacity-70">{dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>

                            {/* Manual Tags */}
                            <div className="flex flex-wrap gap-1.5 items-center">
                                {img.tagIds.map(tid => {
                                    const tag = getTagById(tid);
                                    if (!tag) return null; 
                                    return (
                                        <button 
                                            key={tid} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if(e.altKey) {
                                                    setBatchTagInput(tag.label);
                                                } else {
                                                    const newSet = new Set(activeTagFilters);
                                                    newSet.add(tid);
                                                    setActiveTagFilters(newSet);
                                                }
                                            }}
                                            className={`
                                                text-[10px] px-2 py-0.5 rounded border font-medium transition-all
                                                ${getTagColor(tag.type)}
                                                hover:shadow-sm cursor-pointer active:scale-95
                                            `}
                                            title="Click to filter. Alt+Click to pick for batching."
                                        >
                                            {tag.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* AI Tags (New Column) */}
                            <div className="flex flex-wrap gap-1.5 items-center relative min-h-[24px]">
                                {img.aiTagIds && img.aiTagIds.length > 0 ? (
                                    img.aiTagIds.map(tid => {
                                        const tag = getTagById(tid);
                                        if (!tag) return null;
                                        return (
                                            <button 
                                                key={tid}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const newSet = new Set(activeTagFilters);
                                                    newSet.add(tid);
                                                    setActiveTagFilters(newSet);
                                                }}
                                                className={`
                                                    text-[10px] px-2 py-0.5 rounded border font-medium transition-all
                                                    ${isHarmonized ? 'bg-indigo-50 text-indigo-700 border-indigo-100 group-hover:border-indigo-200' : 'bg-violet-50 text-violet-700 border-violet-100 group-hover:border-violet-200'}
                                                    hover:shadow-sm cursor-pointer active:scale-95 flex items-center gap-1
                                                `}
                                            >
                                                {tag.label}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <span className="text-[10px] text-zinc-300 italic">No AI data</span>
                                )}
                            </div>

                            {/* Technical */}
                            <div className="flex flex-col justify-center gap-0.5 text-[10px] text-zinc-400">
                                <span className="text-zinc-600 truncate">{img.cameraModel}</span>
                                <span className="truncate">{img.lensModel}</span>
                                <span className="opacity-70">{img.aperture} • {img.shutterSpeed} • ISO{img.iso}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* --- ACTION BAR (FLOATING) --- */}
            {selectedIds.size > 0 && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-auto min-w-[500px] max-w-[90vw] z-50 animate-in slide-in-from-bottom-5 fade-in duration-300">
                    <div className="bg-zinc-900/95 backdrop-blur-xl text-zinc-100 rounded-2xl shadow-2xl border border-zinc-700/50 p-2 flex items-center gap-3">
                        <div className="flex items-center gap-3 pl-3 pr-4 border-r border-zinc-700/50">
                            <span className="font-mono text-sm font-bold text-white whitespace-nowrap">{selectedIds.size} Selected</span>
                            <button onClick={() => setSelectedIds(new Set())} className="text-zinc-400 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="relative flex-1 group">
                            <Plus size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400" />
                            <input 
                                type="text"
                                value={batchTagInput}
                                onChange={(e) => setBatchTagInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleBatchAddTag()}
                                placeholder="Add tag to selection..."
                                className="w-full bg-zinc-800/50 border border-transparent focus:border-indigo-500/50 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 outline-none transition-all focus:bg-zinc-800"
                            />
                        </div>
                        <div className="flex items-center gap-1 pr-1">
                            <button 
                                onClick={handleBatchAddTag}
                                disabled={!batchTagInput.trim()}
                                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                <Check size={16} />
                            </button>
                            <div className="relative">
                                <button 
                                    onClick={() => setIsRemoveMenuOpen(!isRemoveMenuOpen)}
                                    className={`p-2 rounded-lg transition-colors ${isRemoveMenuOpen ? 'bg-zinc-700 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'}`}
                                >
                                    <Eraser size={16} />
                                </button>
                                {isRemoveMenuOpen && (
                                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 min-w-[200px] bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden py-1">
                                        <div className="px-3 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                                            Remove Tag
                                        </div>
                                        <div className="max-h-48 overflow-y-auto">
                                            {commonTagsInSelection.length === 0 ? (
                                                <div className="px-3 py-2 text-zinc-500 text-xs italic">No common tags</div>
                                            ) : (
                                                commonTagsInSelection.map(tag => (
                                                    <button
                                                        key={tag.id}
                                                        onClick={() => handleBatchRemoveTag(tag.id)}
                                                        className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-red-900/30 hover:text-red-400 transition-colors flex items-center justify-between group"
                                                    >
                                                        <span>{tag.label}</span>
                                                        <X size={12} className="opacity-0 group-hover:opacity-100" />
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Workbench;
