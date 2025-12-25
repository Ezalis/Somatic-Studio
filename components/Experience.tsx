import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { ImageNode, Tag, TagType, ExperienceNode, ViewMode, ExperienceMode, AnchorState, ExperienceContext } from '../types';
import { 
    X, Camera, Maximize2, Calendar, Aperture, Hash, Palette, 
    ArrowDown, ArrowUp, Sun, Cloud, Thermometer, Gauge, Timer 
} from 'lucide-react';

// Import visual components from new cleanup file
import { 
    EsotericSprite, 
    LoadingOverlay, 
    RoughContainer, 
    ScribbleConnector, 
    HistoryStream
} from './VisualElements';

// Import logic helpers from dataService
import { 
    getColorDistSq, 
    getMinPaletteDistance, 
    isMonochrome, 
    getDominantColorsFromNodes, 
    getRelatedTagsFromNodes 
} from '../services/dataService';

interface ExperienceProps {
    images: ImageNode[];
    tags: Tag[];
    anchor: AnchorState;
    history: AnchorState[];
    experienceMode: ExperienceMode;
    onAnchorChange: (anchor: AnchorState) => void;
    onContextUpdate: (ctx: ExperienceContext) => void;
    onViewChange: (mode: ViewMode) => void;
    onExperienceModeChange: (mode: ExperienceMode) => void;
    nsfwFilterActive: boolean;
    loadingProgress?: { current: number, total: number } | null;
}

// --- FULLSCREEN VERTICAL GALLERY COMPONENT ---
const FullscreenVerticalGallery: React.FC<{
    history: AnchorState[];
    images: ImageNode[];
    tags: Tag[];
    startHistoryIndex: number;
    onClose: (finalHistoryIndex: number) => void;
    nsfwFilterActive: boolean;
    nsfwTagId?: string;
}> = ({ history, images, tags, startHistoryIndex, onClose, nsfwFilterActive, nsfwTagId }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    
    // 1. Filter history to strictly images for the gallery view.
    // We store the original index to snap back correctly in the history stream on close.
    // Also respect NSFW filter to ensure 1:1 parity with the visible stream.
    const galleryItems = useMemo(() => {
        return history
            .map((step, idx) => ({ step, originalIndex: idx }))
            .filter(x => {
                if (x.step.mode !== 'IMAGE') return false;
                
                if (nsfwFilterActive) {
                    const img = images.find(i => i.id === x.step.id);
                    if (img) {
                        const hasNsfwTag = [...img.tagIds, ...(img.aiTagIds || [])].some(tid => {
                            if (tid === nsfwTagId) return true;
                            const t = tags.find(tag => tag.id === tid);
                            return t && t.label.trim().toLowerCase() === 'nsfw';
                        });
                        if (hasNsfwTag) return false;
                    }
                }
                return true;
            });
    }, [history, images, tags, nsfwFilterActive, nsfwTagId]);

    // 2. Find the starting index in our filtered list based on the history index passed in.
    const initialGalleryIndex = useMemo(() => {
        const found = galleryItems.findIndex(x => x.originalIndex === startHistoryIndex);
        return found >= 0 ? found : 0;
    }, [galleryItems, startHistoryIndex]);

    const [currentIndex, setCurrentIndex] = useState(initialGalleryIndex);

    // 3. Initial scroll to the clicked image
    // Using scrollTop is more reliable than scrollIntoView for a 100vh snap container on mount
    useEffect(() => {
        if (scrollRef.current && galleryItems.length > 0) {
            // Use clientHeight for robustness against mobile browser chrome resizing
            const h = scrollRef.current.clientHeight || window.innerHeight;
            scrollRef.current.scrollTop = initialGalleryIndex * h;
        }
    }, []); // Only run on mount

    // 4. Track scroll to update current index (so we know where we are when we close)
    const handleScroll = () => {
        if (scrollRef.current) {
            const h = scrollRef.current.clientHeight;
            if (h > 0) {
                const index = Math.round(scrollRef.current.scrollTop / h);
                if (index !== currentIndex && index >= 0 && index < galleryItems.length) {
                    setCurrentIndex(index);
                }
            }
        }
    };

    const handleClose = () => {
        const finalHistoryIndex = galleryItems[currentIndex]?.originalIndex ?? 0;
        onClose(finalHistoryIndex);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black animate-in fade-in duration-300">
            {/* Close Button */}
            <button 
                onClick={handleClose}
                className="absolute top-6 right-6 z-50 p-3 text-white/50 hover:text-white bg-black/20 hover:bg-white/10 backdrop-blur-md rounded-full transition-all duration-200"
            >
                <X size={28} />
            </button>

            {/* Vertical Swipe Container */}
            <div 
                ref={scrollRef}
                onScroll={handleScroll}
                className="w-full h-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar"
                style={{ scrollBehavior: 'smooth' }} // Enforce smooth in CSS, though JS manual set above overrides it for init
            >
                {galleryItems.map((item, idx) => {
                    const img = images.find(i => i.id === item.step.id);
                    if (!img) return null;
                    
                    return (
                        <div key={idx} className="w-full h-full flex items-center justify-center snap-center relative shrink-0">
                            <img 
                                src={img.fileUrl} 
                                alt="" 
                                className="max-w-full max-h-full object-contain p-2 md:p-8 select-none shadow-2xl"
                                draggable={false}
                            />
                        </div>
                    );
                })}
            </div>
            
            {/* Minimal Page Indicator */}
            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 pointer-events-none">
                {galleryItems.map((_, i) => (
                    <div 
                        key={i} 
                        className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === currentIndex ? 'bg-white scale-150' : 'bg-white/20'}`} 
                    />
                ))}
            </div>
        </div>
    );
};

// --- SATELLITE NAVIGATION LAYER ---
const SatelliteLayer: React.FC<{
    node: ImageNode;
    tags: Tag[];
    onNavigate: (anchor: AnchorState) => void;
    isMobile: boolean;
}> = ({ node, tags, onNavigate, isMobile }) => {
    const [openPanel, setOpenPanel] = useState<'palette' | 'tags' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Handle click outside on mobile to close panels
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpenPanel(null);
            }
        };
        // Add listener
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const uniqueTags = useMemo(() => {
        const allIds = [...node.tagIds, ...(node.aiTagIds || [])];
        const resolved = allIds.map(id => tags.find(t => t.id === id)).filter(Boolean) as Tag[];
        const concepts = resolved.filter(t => t.type !== TagType.TECHNICAL && t.type !== TagType.SEASONAL && t.label.toLowerCase() !== 'nsfw');
        const seen = new Set<string>();
        const final: Tag[] = [];
        concepts.forEach(t => { if(!seen.has(t.label.toLowerCase())){ seen.add(t.label.toLowerCase()); final.push(t); } });
        return final;
    }, [node, tags]);

    const togglePanel = (panel: 'palette' | 'tags') => {
        setOpenPanel(prev => prev === panel ? null : panel);
    };

    return (
        <div ref={containerRef} className="absolute inset-0 pointer-events-none z-[60]">
            {/* Left: Palette */}
            <div className={`absolute bottom-4 left-4 md:bottom-12 md:left-10 flex items-end animate-in fade-in slide-in-from-bottom-4 duration-700 transition-all ${openPanel === 'palette' ? 'z-50' : 'z-40'}`}>
                <RoughContainer 
                    title="Spectral ID" 
                    description={isMobile && openPanel !== 'palette' ? undefined : "Pivot via color space"} 
                    alignText="left"
                    onTitleClick={() => togglePanel('palette')}
                >
                    <div className={`${openPanel === 'palette' ? 'block' : 'hidden md:block'} transition-all duration-300`}>
                        <div className="flex flex-col gap-3 min-w-[140px] pt-2 md:pt-0">
                            {node.palette.map((color, i) => (
                                <button key={i} className="flex items-center gap-3 group/color cursor-pointer transition-transform hover:translate-x-1" onClick={() => onNavigate({ mode: 'COLOR', id: color })} title={color}>
                                    <div className="w-8 h-8 rounded-full border-2 border-white/80 shadow-sm" style={{ backgroundColor: color }} />
                                    <span className="font-hand text-xl text-zinc-500 group-hover/color:text-zinc-800 transition-colors uppercase tracking-widest pr-4">{color}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </RoughContainer>
            </div>

            {/* Right: Tags */}
            <div className={`absolute bottom-4 right-4 md:bottom-12 md:right-10 flex items-end animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 transition-all ${openPanel === 'tags' ? 'z-50' : 'z-40'}`}>
                <RoughContainer 
                    title="Semantic Web" 
                    description={isMobile && openPanel !== 'tags' ? undefined : "Traverse concept clusters"} 
                    alignText="right"
                    onTitleClick={() => togglePanel('tags')}
                >
                    <div className={`${openPanel === 'tags' ? 'block' : 'hidden md:block'} transition-all duration-300`}>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-3 items-center max-h-[300px] overflow-y-auto no-scrollbar pr-2 pt-2 md:pt-0">
                            {uniqueTags.map(tag => (
                                <button key={tag.id} className="text-xl font-hand text-zinc-600 hover:text-indigo-600 hover:translate-x-1 transition-all text-left flex items-center gap-2 group/tag whitespace-nowrap cursor-pointer pr-2" onClick={() => onNavigate({ mode: 'TAG', id: tag.id, meta: tag })}>
                                    <Hash size={14} className="opacity-30 group-hover/tag:opacity-100 flex-shrink-0 text-indigo-400" />
                                    <span className="truncate max-w-[160px] pr-3">{tag.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </RoughContainer>
            </div>
        </div>
    );
};

// --- HISTORY TIMELINE WRAPPER ---
const HistoryTimeline: React.FC<{ history: AnchorState[]; images: ImageNode[]; tags: Tag[]; activeMode: ExperienceMode; nsfwFilterActive: boolean; nsfwTagId?: string; currentHero?: ImageNode; }> = ({ history, images, tags, activeMode, nsfwFilterActive, nsfwTagId, currentHero }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (activeMode === 'HISTORY' && scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'instant' }); }, [activeMode]);
    useEffect(() => { if (activeMode === 'EXPLORE' && scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }, [activeMode]);

    return (
        <div ref={scrollRef} className={`absolute inset-0 z-40 bg-zinc-900/95 backdrop-blur-md overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar transition-opacity duration-500 ${activeMode === 'HISTORY' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            <HistoryStream 
                history={history} 
                images={images} 
                tags={tags} 
                nsfwFilterActive={nsfwFilterActive} 
                nsfwTagId={nsfwTagId} 
                currentHero={currentHero} 
                idPrefix="timeline-history-"
            />
        </div>
    );
};

// --- MAIN COMPONENT ---
const Experience: React.FC<ExperienceProps> = ({ 
    images, 
    tags, 
    anchor,
    history,
    experienceMode,
    onAnchorChange,
    onContextUpdate,
    onViewChange,
    onExperienceModeChange,
    nsfwFilterActive,
    loadingProgress
}) => {
    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const hoveredNodeIdRef = useRef<string | null>(null);
    const zoomRef = useRef<d3.ZoomBehavior<HTMLDivElement, unknown> | null>(null);
    const detailScrollRef = useRef<HTMLDivElement>(null);
    
    // State
    const [simNodes, setSimNodes] = useState<ExperienceNode[]>([]);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [galleryState, setGalleryState] = useState<{ isOpen: boolean, startIndex: number }>({ isOpen: false, startIndex: 0 });
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [titleClicks, setTitleClicks] = useState(0);
    const [isMobile, setIsMobile] = useState(false); // Mobile state tracking
    
    // Derived Data State
    const [commonTags, setCommonTags] = useState<Tag[]>([]);
    const [activePalette, setActivePalette] = useState<string[]>([]);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        handleResize(); // Init
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleTitleClick = () => {
        const next = titleClicks + 1;
        setTitleClicks(next);
        if (next >= 5) {
            onViewChange('WORKBENCH');
            setTitleClicks(0);
        }
    };

    // --- EFFECT: DYNAMIC THEME COLOR FOR SAFARI ---
    useEffect(() => {
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (!metaThemeColor) return;

        let color = '#faf9f6'; // Default Light

        if (galleryState.isOpen) {
            color = '#000000'; // Black for gallery
        } else if (isDetailOpen || experienceMode === 'HISTORY') {
            color = '#18181b'; // Zinc-900 for Detail or History
        }

        metaThemeColor.setAttribute('content', color);
        return () => {
            metaThemeColor.setAttribute('content', '#faf9f6');
        };
    }, [galleryState.isOpen, isDetailOpen, experienceMode]);

    // Reset scroll when opening detail view with new node
    useEffect(() => {
        if (isDetailOpen && detailScrollRef.current) {
            detailScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [anchor.id, isDetailOpen]);

    const getTagById = useCallback((id: string) => tags.find(t => t.id === id), [tags]);
    const nsfwTagId = useMemo(() => tags.find(t => t.label.trim().toLowerCase() === 'nsfw')?.id, [tags]);

    // Reset modals if anchor changes to something else
    useEffect(() => {
        if (anchor.mode !== 'IMAGE') {
            setIsDetailOpen(false);
            setGalleryState({ isOpen: false, startIndex: 0 });
            setShowScrollTop(false);
        } else {
            // When entering image mode, ensure button is reset
            setShowScrollTop(false);
        }
    }, [anchor]);

    // Handlers for Scroll To Top
    const handleDetailScroll = () => {
        if (detailScrollRef.current) {
            setShowScrollTop(detailScrollRef.current.scrollTop > 300);
        }
    };

    const handleScrollToTop = (e: React.MouseEvent) => {
        e.stopPropagation();
        detailScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCloseDetail = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDetailOpen(false);
    };

    // 1. SCORING & RELATIONSHIP ENGINE (Visibility Logic)
    useEffect(() => {
        if (loadingProgress) return; 

        setSimNodes(prevNodes => {
            if (prevNodes.length === 0) return prevNodes;

            let calculatedPalette: string[] = [];
            let calculatedTags: Tag[] = [];

            // --- A. Scoring Nodes ---
            const scoredNodes = prevNodes.map(node => {
                 // FILTER CHECK
                 if (nsfwFilterActive) {
                     const allNodeTagIds = [...node.original.tagIds, ...(node.original.aiTagIds || [])];
                     const isNsfw = allNodeTagIds.some(tid => {
                         if (tid === nsfwTagId) return true;
                         const t = getTagById(tid);
                         return t && t.label.trim().toLowerCase() === 'nsfw';
                     });
                     if (isNsfw) return { ...node, relevanceScore: -9999, isVisible: false }; 
                 }

                 let score = 0;
                 
                 if (anchor.mode === 'IMAGE') {
                     if (node.id === anchor.id) score = 10000; 
                     else {
                         const anchorImg = images.find(i => i.id === anchor.id);
                         if (anchorImg) {
                             const anchorTags = [...anchorImg.tagIds, ...(anchorImg.aiTagIds || [])];
                             const targetTags = [...node.original.tagIds, ...(node.original.aiTagIds || [])];
                             
                             const anchorIsMono = isMonochrome(tags, anchorTags);
                             const targetIsMono = isMonochrome(tags, targetTags);
                             const colorDist = getMinPaletteDistance(anchorImg.palette, node.original.palette);
                             
                             const timeDiff = Math.abs(node.original.captureTimestamp - anchorImg.captureTimestamp);
                             const isSameDay = timeDiff < 86400000;
                             const isNearDate = timeDiff < 259200000; 
                             const sameSeason = node.original.inferredSeason === anchorImg.inferredSeason;

                             // 1. TEMPORAL (High Priority)
                             if (isSameDay) score += 500; 
                             else if (isNearDate) score += 100;
                             if (sameSeason) score += 20;

                             // 2. THEMATIC (Medium Priority)
                             const sharedTags = targetTags.filter(t => anchorTags.includes(t));
                             let meaningfulTagMatches = 0;
                             
                             sharedTags.forEach(tid => {
                                 const t = getTagById(tid);
                                 if (t) {
                                     if (t.type === TagType.AI_GENERATED) {
                                         score += 20;
                                         meaningfulTagMatches++;
                                     }
                                     else if (t.type === TagType.QUALITATIVE) {
                                         score += 25; 
                                         meaningfulTagMatches++;
                                     }
                                     else if (t.type === TagType.CATEGORICAL) {
                                         score += 20;
                                         meaningfulTagMatches++;
                                     }
                                     else if (t.type === TagType.TECHNICAL) score += 5;
                                     else score += 2;
                                 }
                             });

                             const highThematicCorrelation = meaningfulTagMatches >= 3;
                             // 3. VISUAL & CROSS-MODALITY
                             
                             if (anchorIsMono) {
                                 if (targetIsMono) {
                                     score += 200; 
                                 } else {
                                     if (isSameDay) score += 150; 
                                     else if (highThematicCorrelation) score += 50;
                                     else score -= 1000; 
                                 }
                             } else {
                                 if (targetIsMono) {
                                     if (isSameDay) score += 150;
                                     else if (highThematicCorrelation) score += 50;
                                     else score -= 500;
                                 } else {
                                     if (isSameDay || highThematicCorrelation) {
                                         score += 50; 
                                     } else {
                                         if (colorDist < 1500) score += 200;
                                         else if (colorDist < 4000) score += 100;
                                         else if (colorDist < 8000) score += 20;
                                         else score -= 150; 
                                     }
                                 }
                             }

                             // 4. TECHNICAL
                             if (node.original.cameraModel === anchorImg.cameraModel && node.original.cameraModel !== 'Unknown Camera') score += 10;
                             if (node.original.lensModel === anchorImg.lensModel && node.original.lensModel !== 'Unknown Lens') score += 10;
                         }
                     }
                 } else if (anchor.mode === 'TAG') {
                     const hasTag = node.original.tagIds.includes(anchor.id) || (node.original.aiTagIds && node.original.aiTagIds.includes(anchor.id));
                     if (hasTag) score = 100;
                 } else if (anchor.mode === 'COLOR') {
                     const minD = node.original.palette.reduce((min, c) => Math.min(min, getColorDistSq(c, anchor.id)), Infinity);
                     if (minD < 1500) score = 100;
                 } else if (anchor.mode === 'DATE') {
                     const anchorTime = parseInt(anchor.id);
                     const diff = Math.abs(node.original.captureTimestamp - anchorTime);
                     const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
                     if (diff < thirtyDaysMs) score = 100 - (diff / thirtyDaysMs) * 50; 
                 } else if (anchor.mode === 'CAMERA') {
                     if (node.original.cameraModel === anchor.id) score = 100;
                 } else if (anchor.mode === 'LENS') {
                     if (node.original.lensModel === anchor.id) score = 100;
                 } else if (anchor.mode === 'SEASON') {
                     if (node.original.inferredSeason === anchor.id) score = 100;
                 }

                 return { ...node, relevanceScore: score };
            });

            // --- B. Determine Visibility & Context ---
            const visibleSubset: ExperienceNode[] = [];

            if (anchor.mode === 'IMAGE') {
                const neighbors = scoredNodes.filter(n => n.id !== anchor.id && n.relevanceScore > 0); 
                neighbors.sort((a, b) => b.relevanceScore - a.relevanceScore);
                
                const visibleCount = Math.min(12, neighbors.length);
                const visibleNeighborIds = new Set(neighbors.slice(0, visibleCount).map(n => n.id));
                
                scoredNodes.forEach(n => {
                    if (n.relevanceScore <= -5000) { n.isVisible = false; return; }

                    if (n.id === anchor.id) {
                        n.isVisible = true;
                    } else if (visibleNeighborIds.has(n.id)) {
                        n.isVisible = true;
                    } else {
                        n.isVisible = false;
                    }

                    if (n.isVisible) visibleSubset.push(n);
                });

                const anchorImg = images.find(i => i.id === anchor.id);
                calculatedPalette = anchorImg ? anchorImg.palette : [];
                calculatedTags = getRelatedTagsFromNodes(visibleSubset, tags, 6, undefined, nsfwTagId, nsfwFilterActive);

            } else if (['TAG', 'COLOR', 'DATE', 'CAMERA', 'LENS', 'SEASON'].includes(anchor.mode)) {
                 scoredNodes.forEach(n => {
                     if (n.relevanceScore <= -5000) { n.isVisible = false; return; }
                     n.isVisible = n.relevanceScore > 0;
                     if (n.isVisible) visibleSubset.push(n);
                 });
                 
                 if (anchor.mode === 'TAG') {
                     calculatedTags = getRelatedTagsFromNodes(visibleSubset, tags, 5, anchor.id, nsfwTagId, nsfwFilterActive);
                 } else if (anchor.mode === 'COLOR') {
                     const adjacent = getDominantColorsFromNodes(visibleSubset, 5, anchor.id);
                     calculatedPalette = [anchor.id, ...adjacent].slice(0, 5);
                 } else {
                     calculatedTags = getRelatedTagsFromNodes(visibleSubset, tags, 5, undefined, nsfwTagId, nsfwFilterActive);
                     calculatedPalette = getDominantColorsFromNodes(visibleSubset, 5);
                 }

            } else {
                // NONE mode (Grid)
                scoredNodes.forEach(n => {
                    if (n.relevanceScore <= -5000) { n.isVisible = false; return; }
                    n.isVisible = true; 
                });
            }
            
            setTimeout(() => {
                setActivePalette(calculatedPalette);
                setCommonTags(calculatedTags);
            }, 0);

            return scoredNodes;
        });

    }, [anchor, images, getTagById, nsfwFilterActive, nsfwTagId, loadingProgress]);

    // 2. INITIALIZATION (Grid Layout)
    useEffect(() => {
        if(loadingProgress) return;
        
        // Immediate Grid Calculation for Static Startup
        const width = window.innerWidth;
        const height = window.innerHeight;
        const centerX = width / 2;
        const centerY = height / 2;
        const mobile = width < 768; // Local var for init logic, matches isMobile state eventually

        setSimNodes((prev: ExperienceNode[]) => {
            const existingMap = new Map<string, ExperienceNode>(prev.map(n => [n.id, n]));
            
            const newNodes = images.map((img, idx) => {
                const existing = existingMap.get(img.id);
                const gridSortIndex = existing?.gridSortIndex ?? Math.random();
                const startX = existing ? existing.x : centerX;
                const startY = existing ? existing.y : centerY;

                let isVisible = true;
                if (nsfwFilterActive) {
                    const allTags = [...img.tagIds, ...(img.aiTagIds || [])];
                    const isNsfw = allTags.some(tid => {
                        if (tid === nsfwTagId) return true;
                        const t = tags.find(tag => tag.id === tid);
                        return t && t.label.trim().toLowerCase() === 'nsfw';
                    });
                    if (isNsfw) isVisible = false;
                }

                return {
                    id: img.id,
                    original: img,
                    x: startX, 
                    y: startY,
                    vx: existing?.vx || 0,
                    vy: existing?.vy || 0,
                    currentScale: existing ? existing.currentScale : 0,
                    targetScale: 0.4,
                    currentOpacity: existing ? existing.currentOpacity : 0,
                    targetOpacity: 0.8,
                    relevanceScore: 0,
                    isVisible, 
                    orbitSpeed: 0.05 + (Math.random() * 0.1),
                    orbitOffset: Math.random() * Math.PI * 2,
                    orbitRadiusBase: 250 + (Math.random() * 100),
                    gridSortIndex
                };
            });

            // Force Grid Positions IMMEDIATELY if mode is NONE (Initial Load / Home)
            if (anchor.mode === 'NONE') {
                const visibleNodes = newNodes.filter(n => n.isVisible);
                visibleNodes.sort((a, b) => (a.gridSortIndex || 0) - (b.gridSortIndex || 0));
                
                // Match Physics Loop Grid Logic EXACTLY
                const CELL_W = mobile ? 90 : 120; 
                const CELL_H = mobile ? 90 : 120; 
                const COLS = Math.max(1, Math.floor(width / CELL_W));
                const total = visibleNodes.length;
                const gridW = (COLS - 1) * CELL_W;
                const ROWS = Math.ceil(total / COLS);
                const gridH = (ROWS - 1) * CELL_H;
                const startX = centerX - gridW / 2;
                const startY = centerY - gridH / 2;

                visibleNodes.forEach((node, idx) => {
                    const col = idx % COLS;
                    const row = Math.floor(idx / COLS);
                    const tx = startX + col * CELL_W;
                    const ty = startY + row * CELL_H;
                    
                    // Instant Snap
                    node.x = tx;
                    node.y = ty;
                    node.vx = 0;
                    node.vy = 0;
                    node.currentScale = 0.85;
                    node.targetScale = 0.85;
                    node.currentOpacity = 1;
                    node.targetOpacity = 1;
                });
            }
            return newNodes;
        });
    }, [images, nsfwFilterActive, loadingProgress]); 

    // 3. PHYSICS LOOP
    useEffect(() => {
        if (!containerRef.current || simNodes.length === 0 || loadingProgress) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        const mobile = width < 768;

        const zoom = d3.zoom<HTMLDivElement, unknown>()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                if (worldRef.current) {
                    worldRef.current.style.transform = `translate3d(${event.transform.x}px, ${event.transform.y}px, 0) scale(${event.transform.k})`;
                }
            });
        
        zoomRef.current = zoom;
        d3.select(containerRef.current).call(zoom).on("dblclick.zoom", null);

        let activeNodes: ExperienceNode[] = [];
        if (anchor.mode === 'NONE') {
            activeNodes = simNodes.filter(n => n.isVisible).sort((a, b) => (a.gridSortIndex || 0) - (b.gridSortIndex || 0));
        } else {
            activeNodes = simNodes.filter(n => n.isVisible && n.id !== anchor.id);
        }

        // Adjust scales for mobile responsiveness
        const maxScaleByHeight = (height * (mobile ? 0.5 : 0.6)) / 288;
        const heroScale = Math.min(Math.max(maxScaleByHeight, mobile ? 1.0 : 1.2), mobile ? 1.4 : 1.8); 
        const heroWidth = 192 * heroScale;
        const heroRadius = Math.sqrt(heroWidth ** 2 + (heroWidth * 1.5) ** 2) / 2;

        const simulation = d3.forceSimulation<ExperienceNode>(simNodes)
            .alphaTarget(anchor.mode === 'NONE' ? 0 : 0.05) 
            .velocityDecay(anchor.mode === 'NONE' ? 0.2 : 0.3) 
            .force("charge", d3.forceManyBody<ExperienceNode>().strength((d) => {
                if (!d.isVisible) return 0;
                if (anchor.mode === 'NONE') return 0; 
                if (d.id === anchor.id) return -1500; 
                if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') return mobile ? -15 : -30;
                return -200; 
            }))
            .force("collide", d3.forceCollide<ExperienceNode>().radius((d) => {
                 if (!d.isVisible) return 0;
                 if (anchor.mode === 'NONE') return 0;
                 if (anchor.mode === 'IMAGE') {
                     if (d.id === anchor.id) return heroRadius * (mobile ? 0.8 : 0.95); 
                     return mobile ? 30 : 45; // Smaller neighbor radius on mobile
                 }
                 if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') return mobile ? 20 : 30;
                 return mobile ? 35 : 55; 
            }).strength(0.8)); 

        simulation.on("tick", () => {
            const cx = width / 2;
            const cy = height / 2;
            const time = Date.now() / 1000;

            simNodes.forEach((node, i) => {
                if (!node.isVisible && node.currentOpacity < 0.01 && node.currentScale < 0.01) {
                    node.currentOpacity = 0;
                    node.currentScale = 0;
                    const el = nodeRefs.current.get(node.id);
                    if (el) el.style.display = 'none';
                    return;
                }

                const isAnchor = anchor.mode === 'IMAGE' && node.id === anchor.id;
                // Faster lerp for hiding to clear the view quickly
                const lerpFactor = !node.isVisible ? 0.4 : 0.1;

                if (node.isVisible && !isAnchor && anchor.mode !== 'NONE' && !['TAG', 'COLOR', 'SEASON', 'DATE', 'CAMERA', 'LENS'].includes(anchor.mode)) {
                     const floatSpeed = 0.5;
                     const floatAmp = 0.05; 
                     node.vx = (node.vx || 0) + Math.sin(time * floatSpeed + i) * floatAmp;
                     node.vy = (node.vy || 0) + Math.cos(time * floatSpeed * 0.8 + i) * floatAmp;
                }

                if (anchor.mode === 'NONE') {
                    if (node.isVisible) {
                        const idx = activeNodes.indexOf(node);
                        if (idx !== -1) {
                            const total = activeNodes.length;
                            // Denser grid on mobile
                            const CELL_W = mobile ? 90 : 120; 
                            const CELL_H = mobile ? 90 : 120; 
                            const COLS = Math.max(1, Math.floor(width / CELL_W)); // Dynamic cols
                            const col = idx % COLS;
                            const row = Math.floor(idx / COLS);
                            const gridW = (COLS - 1) * CELL_W;
                            const ROWS = Math.ceil(total / COLS);
                            const gridH = (ROWS - 1) * CELL_H;
                            const tx = cx + (col * CELL_W) - (gridW / 2);
                            const ty = cy + (row * CELL_H) - (gridH / 2);
                            
                            const pull = 0.15; 
                            node.vx = (node.vx || 0) + (tx - node.x) * pull;
                            node.vy = (node.vy || 0) + (ty - node.y) * pull;
                        }
                        node.targetScale = 0.85;
                        node.targetOpacity = 1;
                    } else {
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                    }
                }
                else if (anchor.mode === 'IMAGE') {
                    if (isAnchor) {
                        const targetY = height * 0.45; 
                        const k = 0.12;
                        node.vx = (node.vx || 0) + (cx - node.x) * k; 
                        node.vy = (node.vy || 0) + (targetY - node.y) * k;
                        node.vx *= 0.8; 
                        node.vy *= 0.8;
                        node.targetScale = heroScale;
                        node.targetOpacity = 1;
                    } 
                    else if (node.isVisible) {
                        const targetY = height * 0.45;
                        const dxRaw = node.x - cx;
                        const dyRaw = node.y - targetY;
                        const distRaw = Math.sqrt(dxRaw*dxRaw + dyRaw*dyRaw) || 1;
                        const boundaryRadius = Math.max(width, height) * 0.9;
                        
                        if (distRaw > boundaryRadius) {
                            const angle = Math.atan2(dyRaw, dxRaw);
                            node.x = cx + Math.cos(angle) * (boundaryRadius * 0.95);
                            node.y = targetY + Math.sin(angle) * (boundaryRadius * 0.95);
                            node.vx = (node.vx || 0) * 0.1;
                            node.vy = (node.vy || 0) * 0.1;
                        }

                        const gravity = 0.035; 
                        node.vx = (node.vx || 0) + (cx - node.x) * gravity;
                        node.vy = (node.vy || 0) + (targetY - node.y) * gravity;
                        
                        const dx = node.x - cx;
                        const dy = node.y - targetY;
                        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                        const swirlSpeed = 0.6; 
                        
                        node.vx += (-dy / dist) * swirlSpeed;
                        node.vy += (dx / dist) * swirlSpeed;
                        
                        // Smaller neighbors on mobile
                        node.targetScale = node.relevanceScore > 40 ? (mobile ? 0.6 : 0.8) : (mobile ? 0.45 : 0.6);
                        node.targetOpacity = 1.0; 
                    } 
                    else {
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                    }
                }
                else if (['TAG', 'COLOR', 'DATE', 'CAMERA', 'LENS', 'SEASON'].includes(anchor.mode)) {
                    if (node.isVisible) {
                        const idx = activeNodes.indexOf(node);
                        const total = activeNodes.length;
                        // Denser grid for filtered view on mobile
                        // Adjusted for better mobile layout (3 columns preferred, smaller images)
                        const CELL_W = mobile ? 120 : 220; 
                        const CELL_H = mobile ? 160 : 220; 
                        const COLS = Math.max(1, Math.floor(width / CELL_W));
                        const row = Math.floor(idx / COLS);
                        const col = idx % COLS;
                        const gridW = (COLS - 1) * CELL_W;
                        const gridH = (Math.ceil(total / COLS) - 1) * CELL_H;
                        const tx = cx + (col * CELL_W) - (gridW / 2);
                        const ty = cy + (row * CELL_H) - (gridH / 2);
                        const structureStrength = 0.15;
                        node.vx = (node.vx || 0) + (tx - node.x) * structureStrength;
                        node.vy = (node.vy || 0) + (ty - node.y) * structureStrength;
                        
                        // Scale down on mobile to fit the tighter grid
                        node.targetScale = mobile ? 0.55 : 0.85; 
                        node.targetOpacity = 1;
                    } else {
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                    }
                }

                node.vx = (node.vx || 0) * 0.9;
                node.vy = (node.vy || 0) * 0.9;
                node.currentScale += (node.targetScale - node.currentScale) * lerpFactor;
                node.currentOpacity += (node.targetOpacity - node.currentOpacity) * lerpFactor;

                const el = nodeRefs.current.get(node.id);
                if (el) {
                    el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0) scale(${node.currentScale})`;
                    el.style.opacity = node.currentOpacity.toString();
                    el.style.display = node.currentOpacity < 0.05 ? 'none' : 'block';
                    
                    if (hoveredNodeIdRef.current === node.id || (anchor.mode === 'IMAGE' && node.id === anchor.id)) {
                         el.style.zIndex = node.id === anchor.id ? '2000' : '1000';
                         el.style.filter = 'none';
                         if (node.id === anchor.id) {
                             el.style.boxShadow = `0 20px 60px -10px ${activePalette[0] || 'rgba(0,0,0,0.3)'}`;
                         } else {
                             el.style.boxShadow = 'none';
                         }
                    } else {
                         el.style.zIndex = Math.floor(node.currentScale * 100).toString();
                         el.style.filter = 'none';
                         el.style.boxShadow = 'none';
                    }
                }
            });
        });

        return () => { simulation.stop(); };
    }, [simNodes, anchor, activePalette, loadingProgress]); 

    // 4. ZOOM RESET EFFECT
    useEffect(() => {
        if (anchor.mode === 'IMAGE' && containerRef.current && zoomRef.current) {
             d3.select(containerRef.current).transition().duration(750).ease(d3.easeCubicOut).call(zoomRef.current.transform, d3.zoomIdentity);
        }
    }, [anchor.mode, anchor.id]);

    // 5. INTERACTION
    const handleNodeClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (anchor.id === id && anchor.mode === 'IMAGE') setIsDetailOpen(true);
        else { onAnchorChange({ mode: 'IMAGE', id }); setIsDetailOpen(false); }
    };
    const handleMouseEnter = (node: ExperienceNode) => { hoveredNodeIdRef.current = node.id; const el = nodeRefs.current.get(node.id); if (el) el.style.zIndex = '2000'; };
    const handleMouseLeave = (node: ExperienceNode) => { hoveredNodeIdRef.current = null; const el = nodeRefs.current.get(node.id); if (el) { if (node.id === anchor.id) el.style.zIndex = '2000'; else el.style.zIndex = Math.floor(node.currentScale * 100).toString(); } };
    const activeNode = useMemo(() => simNodes.find(n => n.id === anchor.id), [simNodes, anchor]);

    return (
        <div className="relative w-full h-full bg-[#faf9f6] overflow-hidden font-mono select-none">
            <svg className="absolute w-0 h-0">
                <defs>
                    <filter id="sketch-filter">
                        <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" result="noise" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" />
                    </filter>
                </defs>
            </svg>
            
            {/* Top-Left Navigation Control */}
            {!isDetailOpen && !galleryState.isOpen && (
                <div className="absolute top-4 left-4 md:top-8 md:left-8 z-[70] animate-in fade-in slide-in-from-top-4 duration-700">
                    <RoughContainer 
                        title="Somatic Studio" 
                        alignText="left" 
                        onTitleClick={handleTitleClick}
                    />
                </div>
            )}

            {loadingProgress && loadingProgress.current < loadingProgress.total && (<LoadingOverlay progress={loadingProgress} images={images} tags={tags} />)}
            {anchor.mode !== 'IMAGE' && (<div className="absolute inset-0 pointer-events-none transition-all duration-1000 ease-in-out" style={{ background: anchor.mode !== 'NONE' && activePalette.length > 0 ? `radial-gradient(circle at 50% 30%, ${activePalette[0]}1A, transparent 70%), radial-gradient(circle at 85% 85%, ${activePalette[1] || activePalette[0]}15, transparent 60%), radial-gradient(circle at 15% 75%, ${activePalette[2] || activePalette[0]}10, transparent 60%)` : '#faf9f6' }} />)}
            {anchor.mode !== 'IMAGE' && (<div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0 mix-blend-multiply" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />)}
            <div ref={containerRef} className="absolute inset-0 top-0 cursor-move active:cursor-grabbing z-10 pb-0">
                <div ref={worldRef} className="absolute inset-0 origin-top-left will-change-transform">
                    {simNodes.map(node => {
                        if (!node.isVisible && node.currentOpacity <= 0.05) return null;
                        
                        const isHero = anchor.mode === 'IMAGE' && node.id === anchor.id;
                        const isEsotericSprite = anchor.mode === 'NONE' || (anchor.mode === 'IMAGE' && !isHero);
                        let sizeClasses = 'w-48';
                        if (isEsotericSprite) {
                            if (anchor.mode === 'NONE') {
                                sizeClasses = 'w-24 h-24';
                            } else {
                                sizeClasses = 'w-24 h-24';
                            }
                        }

                        return (
                            <div key={node.id} ref={(el) => { if (el) nodeRefs.current.set(node.id, el); else nodeRefs.current.delete(node.id); }} className="absolute top-0 left-0 w-0 h-0">
                                <div onClick={(e) => handleNodeClick(node.id, e)} onMouseEnter={() => handleMouseEnter(node)} onMouseLeave={() => handleMouseLeave(node)} className={`absolute -translate-x-1/2 -translate-y-1/2 ${sizeClasses} transition-all duration-300 cursor-pointer ${isHero ? '' : 'hover:scale-105'}`}>
                                    {isEsotericSprite ? (<EsotericSprite node={node} />) : (<img src={node.original.fileUrl} alt="" className={`w-full h-auto rounded-md pointer-events-none bg-white transition-all duration-500 ${isHero ? 'ring-4 ring-white/50' : 'ring-1 ring-black/5'}`} loading="lazy" />)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            {anchor.mode === 'NONE' && experienceMode === 'EXPLORE' && images.length > 0 && !loadingProgress && (
                <div className="absolute bottom-12 right-12 z-[60] animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500">
                     <RoughContainer title="Visual Index" description="Start your journey" alignText="right">
                         <div className="text-zinc-600 font-hand text-xl leading-relaxed text-right max-w-[280px]">
                             <p className="pr-4">Every pattern encodes a unique image.</p>
                             <p className="mt-2 pr-4">Select a node to reveal the photograph and explore the collection through shared colors, concepts, and time.</p>
                         </div>
                     </RoughContainer>
                </div>
            )}

            {anchor.mode === 'IMAGE' && activeNode && !isDetailOpen && experienceMode === 'EXPLORE' && (<SatelliteLayer node={activeNode.original} tags={tags} onNavigate={onAnchorChange} isMobile={isMobile} />)}
            <HistoryTimeline history={history} images={images} tags={tags} activeMode={experienceMode} nsfwFilterActive={nsfwFilterActive} nsfwTagId={nsfwTagId} currentHero={activeNode?.original} />
            
            {/* DETAIL VIEW OVERLAY */}
            {isDetailOpen && activeNode && experienceMode === 'EXPLORE' && (
                <>
                    {/* Fixed Close Button (Outside Scroll Container) */}
                    <button 
                        className="fixed top-6 right-6 z-[70] p-2 text-zinc-400 hover:text-white bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full transition-all duration-200 shadow-xl border border-white/10"
                        onClick={handleCloseDetail}
                        title="Close Detail View"
                    >
                        <X size={24} />
                    </button>

                    {/* Scroll To Top Button */}
                    <button 
                        onClick={handleScrollToTop}
                        className={`fixed bottom-10 right-10 z-[70] flex flex-col items-center gap-1 transition-all duration-500 group cursor-pointer ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}
                        title="Back to Top"
                    >
                        <ArrowUp size={32} strokeWidth={1.5} className="text-zinc-500 group-hover:text-zinc-200 transition-transform duration-300 group-hover:-translate-y-1" />
                        <span className="font-hand text-xl text-zinc-500 group-hover:text-zinc-200 drop-shadow-md">Top</span>
                    </button>

                    {/* Scrollable Container */}
                    <div ref={detailScrollRef} onScroll={handleDetailScroll} className="fixed inset-0 z-50 bg-zinc-900/95 backdrop-blur-md overflow-y-auto custom-scrollbar" onClick={handleCloseDetail}>
                        
                        <div className="flex flex-col items-center w-full min-h-screen">
                            <div className="w-full max-w-[1920px] min-h-[78vh] grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(250px,350px)_1fr_minmax(250px,350px)] gap-12 p-8 md:p-12 items-center mx-auto" onClick={(e) => e.stopPropagation()}>
                                {/* Left Panel */}
                                <div className="flex flex-col gap-16 h-full justify-center order-2 xl:order-1 items-center md:items-end text-center md:text-right col-span-1">
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-center md:items-end gap-1 text-zinc-400">
                                            <button onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'SEASON', id: activeNode.original.inferredSeason }); setIsDetailOpen(false); }} className="text-4xl text-zinc-200 font-bold flex items-center gap-3 font-hand hover:text-amber-300 transition-colors pr-4">
                                                {activeNode.original.inferredSeason}
                                                {activeNode.original.inferredSeason === 'Summer' ? <Sun size={28} /> : activeNode.original.inferredSeason === 'Winter' ? <Thermometer size={28} /> : <Cloud size={28} />}
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'DATE', id: activeNode.original.captureTimestamp.toString(), meta: activeNode.original.captureTimestamp }); setIsDetailOpen(false); }} className="text-2xl flex items-center gap-2 font-hand text-zinc-300 hover:text-blue-300 transition-colors pr-4">
                                                {new Date(activeNode.original.captureTimestamp).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
                                            </button>
                                            <span className="text-xl italic opacity-70 font-hand pointer-events-none pr-4">{new Date(activeNode.original.captureTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                        <div className="hidden xl:block"><ScribbleConnector direction="right" length="60px" /></div>
                                    </div>
                                    <div className="relative group w-32 h-32 lg:mr-8"><div className="absolute inset-0 bg-white/5 rounded-full blur-xl animate-pulse" /><EsotericSprite node={activeNode} /><span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-lg font-hand text-zinc-500 opacity-60 whitespace-nowrap pr-4">Spectral ID</span></div>
                                    <div className="flex items-start gap-4">
                                        <div className="flex flex-col items-center md:items-end gap-4">
                                            <h3 className="text-2xl font-hand font-bold text-zinc-500 flex items-center gap-2 flex-row-reverse pr-4"><Palette size={20} /> Palette</h3>
                                            <div className="flex flex-col gap-3">
                                                {activeNode.original.palette.map((color, i) => (
                                                    <div key={i} className="flex items-center gap-3 group cursor-pointer flex-row-reverse" onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'COLOR', id: color, meta: color }); setIsDetailOpen(false); }}>
                                                        <div className="w-8 h-8 rounded-full border border-white/20 group-hover:scale-110 transition-transform shadow-md" style={{ backgroundColor: color }} />
                                                        <span className="font-hand text-xl text-zinc-500 group-hover:text-zinc-300 transition-colors pr-4">{color}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="hidden xl:block"><ScribbleConnector direction="right" length="40px" /></div>
                                    </div>
                                </div>

                                {/* Center Image (Hero) */}
                                <div className="flex items-center justify-center h-full relative group order-1 xl:order-2 col-span-1 md:col-span-2 xl:col-span-1">
                                    <div 
                                        className="relative bg-white p-3 rounded-sm shadow-2xl transition-transform duration-500 group-hover:scale-[1.01] cursor-zoom-in rotate-1" 
                                        onClick={() => setGalleryState({ isOpen: true, startIndex: 0 })}
                                    >
                                        <img src={activeNode.original.fileUrl} alt="" className="max-h-[50vh] xl:max-h-[65vh] w-auto max-w-[85vw] xl:max-w-[50vw] object-contain bg-zinc-100" />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 pointer-events-none">
                                            <Maximize2 size={48} className="text-white drop-shadow-md" />
                                        </div>
                                    </div>
                                </div>

                                {/* Right Panel */}
                                <div className="flex flex-col gap-16 h-full justify-center order-3 items-center md:items-start text-center md:text-left col-span-1">
                                    <div className="flex items-center gap-4">
                                        <div className="hidden xl:block"><ScribbleConnector direction="left" length="60px" /></div>
                                        <div className="flex flex-col items-center md:items-start gap-1 text-zinc-400">
                                            <button onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'CAMERA', id: activeNode.original.cameraModel }); setIsDetailOpen(false); }} className="text-3xl text-zinc-200 font-bold flex items-center gap-3 font-hand hover:text-emerald-300 transition-colors pr-4">
                                                <Camera size={24} className="opacity-70" />{activeNode.original.cameraModel}
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'LENS', id: activeNode.original.lensModel }); setIsDetailOpen(false); }} className="text-2xl italic opacity-80 font-hand text-zinc-500 ml-1 hover:text-amber-300 transition-colors text-left pr-4">
                                                {activeNode.original.lensModel}
                                            </button>
                                            <div className="flex flex-col gap-1 mt-3 ml-2 font-hand text-xl text-zinc-400 opacity-80 pointer-events-none pr-4 items-center md:items-start">
                                                <span className="flex items-center gap-2"><Aperture size={16} /> {activeNode.original.aperture}</span>
                                                <span className="flex items-center gap-2"><Timer size={16} /> {activeNode.original.shutterSpeed}s</span>
                                                <span className="flex items-center gap-2"><Gauge size={16} /> ISO {activeNode.original.iso}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-4 max-h-[60vh]">
                                        <div className="hidden xl:block"><ScribbleConnector direction="left" length="40px" /></div>
                                        <div className="flex flex-col items-center md:items-start gap-2 w-full">
                                            <h3 className="text-2xl font-hand font-bold text-zinc-500 flex items-center gap-2 mb-2 pr-4"><Hash size={20} /> Concepts</h3>
                                            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-left overflow-y-auto max-h-[400px] pr-4 w-full no-scrollbar">
                                                {(() => { 
                                                    const allTagIds = Array.from(new Set([...activeNode.original.tagIds, ...(activeNode.original.aiTagIds || [])])); 
                                                    const candidates = allTagIds.map(tid => tags.find(t => t.id === tid)).filter((t): t is Tag => { if (!t) return false; if (t.type === TagType.TECHNICAL || t.type === TagType.SEASONAL) return false; if (t.label.trim().toLowerCase() === 'nsfw') return false; return true; }); 
                                                    const seenLabels = new Set<string>(); 
                                                    const visibleTags: Tag[] = []; 
                                                    candidates.forEach(t => { const key = t.label.toLowerCase().trim(); if (!seenLabels.has(key)) { seenLabels.add(key); visibleTags.push(t); } }); 
                                                    return visibleTags.map(tag => (
                                                        <button key={tag.id} onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'TAG', id: tag.id, meta: tag }); setIsDetailOpen(false); }} className="font-hand text-xl text-zinc-400 hover:text-zinc-100 hover:scale-105 transition-all duration-200 truncate justify-self-start w-full text-left pr-4" title={tag.label}>
                                                            {tag.label}
                                                        </button>
                                                    )); 
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {history.length > 1 && (
                                <div className="w-full relative pb-32" onClick={(e) => e.stopPropagation()}>
                                     <div className="flex flex-col items-center justify-center pt-2 pb-4 opacity-40">
                                        <ArrowDown className="text-zinc-500" size={32} strokeWidth={1.5} />
                                        <span className="font-hand text-zinc-500 text-2xl mt-2">History Trail</span>
                                     </div>
                                     <HistoryStream 
                                        history={history.slice(1)} 
                                        images={images} 
                                        tags={tags} 
                                        nsfwFilterActive={nsfwFilterActive} 
                                        nsfwTagId={nsfwTagId} 
                                        currentHero={activeNode.original} 
                                        onItemClick={(index) => setGalleryState({ isOpen: true, startIndex: index })}
                                        baseIndexOffset={1}
                                        idPrefix="detail-history-"
                                     />
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
            
            {/* FULLSCREEN GALLERY OVERLAY */}
            {galleryState.isOpen && (
                <FullscreenVerticalGallery
                    history={history}
                    images={images}
                    tags={tags}
                    startHistoryIndex={galleryState.startIndex}
                    nsfwFilterActive={nsfwFilterActive}
                    nsfwTagId={nsfwTagId}
                    onClose={(finalHistoryIndex) => {
                        setGalleryState({ isOpen: false, startIndex: 0 });
                        
                        // SNAP LOGIC
                        // We use a small timeout to ensure the state update renders before we attempt to scroll
                        setTimeout(() => {
                            // If index is 0, we snap to top (Hero)
                            if (finalHistoryIndex <= 0) {
                                 detailScrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
                            } else {
                                 // Target the DETAIL view item, not the timeline one
                                 const el = document.getElementById(`detail-history-item-${finalHistoryIndex}`);
                                 if (el) el.scrollIntoView({ behavior: 'auto', block: 'center' });
                            }
                        }, 0);
                    }}
                />
            )}
        </div>
    );
};

export default Experience;