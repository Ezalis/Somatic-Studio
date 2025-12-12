import React, { useState } from 'react';
import { ImageNode, Tag, TagType } from '../types';
import { Camera, Aperture, Plus, Tag as TagIcon, Loader2 } from 'lucide-react';
import { getSeason, generateUUID } from '../services/dataService';
import exifr from 'exifr';

interface WorkbenchProps {
    images: ImageNode[];
    tags: Tag[];
    onUpdateImages: (images: ImageNode[]) => void;
    onAddTag: (newTag: Tag) => void;
}

// --- Light-weight Color Extraction Routine ---
const extractColorPalette = (img: HTMLImageElement): string[] => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return ['#e4e4e7', '#d4d4d8', '#a1a1aa', '#71717a', '#52525b']; // Fallback Greyscale Light

    // Resize for speed - 100px is sufficient for dominant colors
    const maxDim = 100;
    const scale = Math.min(maxDim / img.width, maxDim / img.height);
    canvas.width = Math.floor(img.width * scale);
    canvas.height = Math.floor(img.height * scale);
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colorCounts: Record<string, number> = {};
    
    for (let i = 0; i < imageData.length; i += 4) {
        const r = imageData[i];
        const g = imageData[i+1];
        const b = imageData[i+2];
        const a = imageData[i+3];

        // Ignore transparent
        if (a < 128) continue;
        
        // --- LOGIC: Ignore White Borders ---
        if (r > 250 && g > 250 && b > 250) continue;

        // --- LOGIC: Ignore Black Borders ---
        if (r < 15 && g < 15 && b < 15) continue;
        
        // --- LOGIC: Quantization ---
        const binSize = 16;
        const rQ = Math.floor(r / binSize) * binSize + (binSize / 2);
        const gQ = Math.floor(g / binSize) * binSize + (binSize / 2);
        const bQ = Math.floor(b / binSize) * binSize + (binSize / 2);
        
        const key = `${Math.floor(rQ)},${Math.floor(gQ)},${Math.floor(bQ)}`;
        colorCounts[key] = (colorCounts[key] || 0) + 1;
    }
    
    // Convert to array of objects with counts, sorted by frequency
    const sortedCandidates = Object.entries(colorCounts)
        .sort(([, countA], [, countB]) => countB - countA)
        .map(([key]) => {
            const [r, g, b] = key.split(',').map(Number);
            const rSafe = Math.min(255, r);
            const gSafe = Math.min(255, g);
            const bSafe = Math.min(255, b);
            
            return {
                r: rSafe,
                g: gSafe,
                b: bSafe,
                hex: `#${((1 << 24) + (rSafe << 16) + (gSafe << 8) + bSafe).toString(16).slice(1)}`
            };
        });

    const palette: string[] = [];
    
    const getDistSq = (c1: {r:number, g:number, b:number}, hex2: string) => {
        const r2 = parseInt(hex2.slice(1, 3), 16);
        const g2 = parseInt(hex2.slice(3, 5), 16);
        const b2 = parseInt(hex2.slice(5, 7), 16);
        return Math.pow(c1.r - r2, 2) + Math.pow(c1.g - g2, 2) + Math.pow(c1.b - b2, 2);
    };

    const thresholds = [3600, 2500, 900, 100, 0]; 
    
    for (const threshold of thresholds) {
        if (palette.length >= 5) break;

        for (const candidate of sortedCandidates) {
            if (palette.length >= 5) break;
            const isDistinct = palette.every(selectedHex => getDistSq(candidate, selectedHex) >= threshold);
            if (isDistinct) {
                palette.push(candidate.hex);
            }
        }
    }
    
    while (palette.length < 5) {
        palette.push('#e4e4e7'); 
    }
    
    return palette.slice(0, 5);
};

const Workbench: React.FC<WorkbenchProps> = ({ images, tags, onUpdateImages, onAddTag }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [tagInput, setTagInput] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Toggle Selection with Shift+Click support
    const handleSelect = (id: string, event: React.MouseEvent) => {
        const newSelected = new Set(selectedIds);
        
        if (event.shiftKey && lastSelectedId) {
            const lastIndex = images.findIndex(img => img.id === lastSelectedId);
            const currentIndex = images.findIndex(img => img.id === id);
            
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            
            for (let i = start; i <= end; i++) {
                newSelected.add(images[i].id);
            }
        } else if (event.metaKey || event.ctrlKey) {
            if (newSelected.has(id)) newSelected.delete(id);
            else newSelected.add(id);
            setLastSelectedId(id);
        } else {
            if (newSelected.has(id)) newSelected.delete(id);
            else newSelected.add(id);
            setLastSelectedId(id);
        }
        
        setSelectedIds(newSelected);
    };

    const handleBulkTag = () => {
        if (!tagInput.trim() || selectedIds.size === 0) return;

        let tagToAdd = tags.find(t => t.label.toLowerCase() === tagInput.toLowerCase());
        
        // Create new tag if doesn't exist
        if (!tagToAdd) {
            tagToAdd = {
                id: generateUUID(),
                label: tagInput,
                type: TagType.QUALITATIVE
            };
            onAddTag(tagToAdd);
        }

        const updatedImages = images.map(img => {
            if (selectedIds.has(img.id)) {
                if (!img.tagIds.includes(tagToAdd!.id)) {
                    return { ...img, tagIds: [...img.tagIds, tagToAdd!.id] };
                }
            }
            return img;
        });

        onUpdateImages(updatedImages);
        setTagInput('');
    };

    const getTagById = (id: string) => tags.find(t => t.id === id);

    const getTagColor = (type: TagType) => {
        switch(type) {
            case TagType.TECHNICAL: return 'bg-slate-100 text-slate-600 border-slate-200';
            case TagType.SEASONAL: return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case TagType.CATEGORICAL: return 'bg-sky-50 text-sky-700 border-sky-100';
            case TagType.QUALITATIVE: return 'bg-rose-50 text-rose-700 border-rose-100';
            default: return 'bg-zinc-100 text-zinc-600 border-zinc-200';
        }
    };

    const formatShutterSpeed = (val?: number) => {
        if (!val) return 'N/A';
        if (val >= 1) return val.toString();
        return `1/${Math.round(1 / val)}`;
    };

    const createTagId = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        setIsProcessing(true);
        const files = Array.from(e.target.files);
        const newImages: ImageNode[] = [];
        
        const processedTags = new Set<string>(tags.map(t => t.id));

        const ensureTag = (label: string, type: TagType): string => {
            const id = createTagId(label);
            if (!processedTags.has(id)) {
                const newTag: Tag = { id, label, type };
                onAddTag(newTag);
                processedTags.add(id);
            }
            return id;
        };

        try {
            for (const file of files) {
                const objectUrl = URL.createObjectURL(file);
                
                const [exifData, imgElem] = await Promise.all([
                    exifr.parse(file, [
                        'Make', 'Model', 'LensModel', 'ISO', 
                        'ExposureTime', 'FNumber', 'DateTimeOriginal', 'CreateDate'
                    ]).catch(() => null),
                    new Promise<HTMLImageElement>((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.onerror = reject;
                        img.src = objectUrl;
                    })
                ]);

                const palette = extractColorPalette(imgElem);

                const now = new Date();
                const captureDate = exifData?.DateTimeOriginal || exifData?.CreateDate || now;
                const timestamp = new Date(captureDate).getTime();
                const dateStr = new Date(captureDate).toISOString().split('T')[0];
                
                let camera = exifData?.Model || exifData?.Make || 'Unknown Camera';
                const lens = exifData?.LensModel || 'Unknown Lens';
                const season = getSeason(new Date(captureDate));

                if (lens === '18.5 mm f/2.8') {
                    camera = 'X70';
                }

                const tagIds: string[] = [];
                tagIds.push(ensureTag(season, TagType.SEASONAL));

                if (camera !== 'Unknown Camera') {
                    tagIds.push(ensureTag(camera, TagType.TECHNICAL));
                }

                if (lens !== 'Unknown Lens') {
                    tagIds.push(ensureTag(lens, TagType.TECHNICAL));
                }

                const newNode: ImageNode = {
                    id: generateUUID(),
                    fileUrl: objectUrl,
                    captureTimestamp: timestamp,
                    inferredSeason: season,
                    shootDayClusterId: dateStr,
                    cameraModel: camera,
                    lensModel: lens,
                    aperture: exifData?.FNumber ? `f/${exifData.FNumber}` : '--',
                    shutterSpeed: formatShutterSpeed(exifData?.ExposureTime),
                    iso: exifData?.ISO || 0,
                    tagIds: tagIds,
                    palette: palette 
                };

                newImages.push(newNode);
            }

            newImages.sort((a, b) => a.captureTimestamp - b.captureTimestamp);
            onUpdateImages([...images, ...newImages]);

        } catch (error) {
            console.error("Ingestion failed", error);
            alert("Failed to parse some images.");
        } finally {
            setIsProcessing(false);
            e.target.value = '';
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#faf9f6] text-zinc-700 font-mono text-sm">
            {/* Toolbar */}
            <div className="h-16 border-b border-zinc-200 flex items-center px-6 justify-between bg-white/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <h2 className="text-zinc-800 font-semibold tracking-wide">WORKBENCH</h2>
                    <span className="text-zinc-300">|</span>
                    <span className="text-zinc-500">{images.length} Assets</span>
                    <span className="text-zinc-500">{selectedIds.size} Selected</span>
                </div>

                <div className="flex items-center gap-4">
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-md p-1 pl-3 shadow-sm">
                            <TagIcon size={14} className="text-zinc-400" />
                            <input 
                                type="text" 
                                placeholder="Apply tag..."
                                className="bg-transparent border-none outline-none text-zinc-800 placeholder-zinc-400 w-32"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleBulkTag()}
                            />
                            <button 
                                onClick={handleBulkTag}
                                className="bg-zinc-100 hover:bg-zinc-200 text-zinc-600 p-1 rounded transition-colors"
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                    )}
                    
                    <label className={`cursor-pointer bg-zinc-900 hover:bg-zinc-800 text-white px-4 py-2 rounded-md font-medium transition-colors text-xs tracking-wider flex items-center gap-2 shadow-sm ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                         {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                         {isProcessing ? 'PARSING...' : 'INGEST'}
                        <input type="file" multiple className="hidden" onChange={handleFileUpload} accept="image/jpeg,image/png,image/webp" />
                    </label>
                </div>
            </div>

            {/* Empty State */}
            {images.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-400 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center border border-zinc-200 text-zinc-300">
                        <Camera size={32} />
                    </div>
                    <p>No organic matter detected.</p>
                    <p className="text-xs max-w-md text-center text-zinc-400">Upload JPEG/PNG images.</p>
                </div>
            )}

            {/* Table Header */}
            {images.length > 0 && (
                <div className="grid grid-cols-[40px_80px_160px_1fr_200px] gap-4 px-6 py-3 border-b border-zinc-200 text-xs text-zinc-400 uppercase tracking-wider font-semibold bg-zinc-50/50">
                    <div></div>
                    <div>Thumb</div>
                    <div>Timestamp</div>
                    <div>Metadata & Tags</div>
                    <div>Technical</div>
                </div>
            )}

            {/* Scrollable List */}
            {images.length > 0 && (
            <div className="flex-1 overflow-y-auto">
                {images.map((img) => {
                    const isSelected = selectedIds.has(img.id);
                    const dateObj = new Date(img.captureTimestamp);

                    return (
                        <div 
                            key={img.id}
                            onClick={(e) => handleSelect(img.id, e)}
                            className={`
                                grid grid-cols-[40px_80px_160px_1fr_200px] gap-4 px-6 py-4 border-b border-zinc-100 
                                transition-colors cursor-pointer select-none group
                                ${isSelected ? 'bg-teal-50/50 border-l-4 border-l-teal-500' : 'hover:bg-white border-l-4 border-l-transparent'}
                            `}
                        >
                            {/* Checkbox */}
                            <div className="flex items-center justify-center">
                                <div className={`w-4 h-4 border rounded ${isSelected ? 'bg-teal-500 border-teal-500' : 'border-zinc-300 bg-white'}`} />
                            </div>

                            {/* Thumbnail */}
                            <div className="w-16 h-16 bg-zinc-100 rounded overflow-hidden relative shadow-sm border border-zinc-100">
                                <img src={img.fileUrl} alt="Thumbnail" className="w-full h-full object-cover transition-opacity" />
                            </div>

                            {/* Timestamp */}
                            <div className="flex flex-col justify-center text-zinc-500">
                                <span className="text-zinc-800 font-medium">{dateObj.toLocaleDateString()}</span>
                                <span className="text-xs">{dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                <span className="text-xs text-zinc-400 mt-1">{img.inferredSeason}</span>
                            </div>

                            {/* Tags */}
                            <div className="flex flex-col justify-center gap-2">
                                <div className="flex flex-wrap gap-1">
                                    {img.tagIds.map(tid => {
                                        const tag = getTagById(tid);
                                        if (!tag) return null;
                                        return (
                                            <span 
                                                key={tid} 
                                                className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${getTagColor(tag.type)}`}
                                            >
                                                {tag.label}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Technical */}
                            <div className="flex flex-col justify-center gap-1 text-xs text-zinc-400 group-hover:text-zinc-500">
                                <div className="flex items-center gap-2">
                                    <Camera size={12} /> {img.cameraModel}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Aperture size={12} /> {img.lensModel}
                                </div>
                                <div className="flex items-center gap-2 text-zinc-400">
                                    <span>{img.aperture}</span>
                                    <span>{img.shutterSpeed}</span>
                                    <span>ISO {img.iso}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            )}
        </div>
    );
};

export default Workbench;