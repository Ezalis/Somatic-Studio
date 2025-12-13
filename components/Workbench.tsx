import React, { useState, useMemo } from 'react';
import { ImageNode, Tag, TagType, ViewMode } from '../types';
import { 
    Camera, Plus, Search, X, Check, Eraser, AlertCircle
} from 'lucide-react';
import { generateUUID } from '../services/dataService';
import { 
    saveTagsForFile, 
    saveTagDefinitions
} from '../services/resourceService';

interface WorkbenchProps {
    images: ImageNode[];
    tags: Tag[];
    onUpdateImages: (images: ImageNode[]) => void;
    onAddTag: (newTag: Tag) => void;
    onResetDatabase: () => void;
    onViewChange: (mode: ViewMode) => void;
}

const getTagColor = (type: TagType) => {
    switch(type) {
        case TagType.TECHNICAL: return 'bg-slate-100 text-slate-600 border-slate-200 group-hover:border-slate-300';
        case TagType.SEASONAL: return 'bg-emerald-50 text-emerald-700 border-emerald-100 group-hover:border-emerald-200';
        case TagType.CATEGORICAL: return 'bg-sky-50 text-sky-700 border-sky-100 group-hover:border-sky-200';
        case TagType.QUALITATIVE: return 'bg-rose-50 text-rose-700 border-rose-100 group-hover:border-rose-200';
        default: return 'bg-zinc-100 text-zinc-600 border-zinc-200';
    }
};

const Workbench: React.FC<WorkbenchProps> = ({ 
    images, 
    tags, 
    onUpdateImages, 
    onAddTag
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
    
    // --- DERIVED DATA ---
    const filteredImages = useMemo(() => {
        return images.filter(img => {
            // 1. Tag Filters
            if (activeTagFilters.size > 0) {
                const hasAll = Array.from(activeTagFilters).every(tId => img.tagIds.includes(tId));
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
                const imgTagLabels = img.tagIds.map(id => tags.find(t => t.id === id)?.label.toLowerCase());
                if (imgTagLabels.some(l => l?.includes(q))) return true;
                return false;
            }
            return true;
        });
    }, [images, activeTagFilters, searchQuery, tags]);

    const getTagById = (id: string) => tags.find(t => t.id === id);

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
            
            {/* --- FILTER ROW (No Top Header) --- */}
            <div className="px-6 py-3 flex items-center gap-4 border-b border-zinc-200 bg-white/50 backdrop-blur-sm z-20 shadow-sm">
                <div className="relative flex-1 max-w-md">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input 
                        type="text" 
                        placeholder="Filter by name, camera, lens, or tag..." 
                        className="w-full pl-9 pr-3 py-1.5 bg-white border border-zinc-200 rounded-md text-xs focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 transition-all shadow-sm"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                
                {/* Active Filters */}
                <div className="flex items-center gap-2 flex-1 overflow-x-auto no-scrollbar">
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
                                <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
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

            {/* --- LIST HEADER --- */}
            {filteredImages.length > 0 && (
                <div className="grid grid-cols-[40px_60px_140px_1fr_200px] gap-4 px-6 py-2 border-b border-zinc-200 text-[10px] text-zinc-400 uppercase tracking-wider font-bold bg-zinc-50/50">
                    <div className="flex justify-center items-center">
                        <button onClick={handleSelectAll} className="hover:text-zinc-600">
                             {selectedIds.size > 0 && selectedIds.size === filteredImages.length ? <AlertCircle size={14} /> : <div className="w-3.5 h-3.5 border border-zinc-300 rounded-sm" />}
                        </button>
                    </div>
                    <div>Preview</div>
                    <div>Captured</div>
                    <div>Metadata & Tags</div>
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
                {filteredImages.map((img) => {
                    const isSelected = selectedIds.has(img.id);
                    const dateObj = new Date(img.captureTimestamp);

                    return (
                        <div 
                            key={img.id}
                            onClick={(e) => { e.stopPropagation(); handleSelect(img.id, e); }}
                            className={`
                                grid grid-cols-[40px_60px_140px_1fr_200px] gap-4 px-6 py-3 border-b border-zinc-100 
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
                            <div className="w-10 h-10 bg-zinc-200 rounded overflow-hidden shadow-sm border border-zinc-200">
                                <img src={img.fileUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                            </div>

                            {/* Timestamp */}
                            <div className="flex flex-col justify-center text-zinc-500 leading-tight">
                                <span className={`font-medium text-xs ${isSelected ? 'text-indigo-900' : 'text-zinc-700'}`}>{dateObj.toLocaleDateString()}</span>
                                <span className="text-[10px] opacity-70">{dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>

                            {/* Tags */}
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