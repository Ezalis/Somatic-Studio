import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { ImageNode, Tag, TagType, SimulationNodeDatum, ViewMode, ExperienceMode, AnchorState, ExperienceContext } from '../types';
import { X, Camera, Activity, Maximize2, Calendar, Aperture, Info, Hash, Palette, Sparkles, MoveDown, ArrowDown, Clock, Sun, Cloud, Thermometer, MapPin, Gauge, Timer, Layers, Snowflake, LayoutGrid, Globe, History as HistoryIcon } from 'lucide-react';

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

// --- Procedural Sprite Component (Optimized) ---

const EsotericSprite = React.memo(({ node }: { node: SimNode }) => {
    // Robust fallback for palette to prevent render errors during initialization
    const palette = (node.original.palette && node.original.palette.length > 0) 
        ? node.original.palette 
        : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];
        
    const tagCount = (node.original.tagIds?.length || 0) + (node.original.aiTagIds?.length || 0);
    
    // Use the node id to generate deterministic "randomness"
    const hash = (str: string) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
        return Math.abs(h);
    };
    const seed = hash(node.id);
    
    return (
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md overflow-visible" shapeRendering="geometricPrecision">
            <defs>
                <filter id={`glow-${node.id}`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>
            <g filter={`url(#glow-${node.id})`}>
                {/* Background Blobs */}
                {palette.slice(1).map((color, i) => {
                    const angle = (seed + i * 73) % 360;
                    const dist = 10 + (seed % 15);
                    const rx = 20 + ((seed + i) % 15);
                    const ry = 20 + ((seed * (i+1)) % 15);
                    const tx = 50 + dist * Math.cos(angle * Math.PI / 180);
                    const ty = 50 + dist * Math.sin(angle * Math.PI / 180);
                    
                    return (
                        <ellipse 
                            key={i}
                            cx={tx} cy={ty} rx={rx} ry={ry}
                            fill={color}
                            fillOpacity={0.6}
                            transform={`rotate(${(seed * (i+1)) % 360}, ${tx}, ${ty})`}
                        />
                    );
                })}
                {/* Core Nucleus */}
                <circle 
                    cx="50" cy="50" r={15 + Math.min(tagCount, 15)} 
                    fill={palette[0]} 
                    className="animate-pulse"
                    style={{ animationDuration: `${3 + (seed % 5)}s` }}
                />
            </g>
        </svg>
    );
}, (prev, next) => prev.node.id === next.node.id);

// --- Procedural Hand-Drawn Arrow Component ---

const GreasePencilArrow: React.FC<{ seed: number, className?: string }> = ({ seed, className }) => {
    const rng = (offset: number) => {
        const x = Math.sin(seed + offset) * 10000;
        return x - Math.floor(x);
    };

    const tilt = (rng(1) - 0.5) * 20; 
    const curveX = (rng(2) - 0.5) * 15; 
    const headLeftLen = 8 + rng(3) * 6;
    const headRightLen = 8 + rng(4) * 6;
    const headLeftAngle = 25 + rng(5) * 15;
    const headRightAngle = 25 + rng(6) * 15;
    const shaftWiggle = (rng(7) - 0.5) * 4;

    return (
        <svg 
            viewBox="0 0 32 64" 
            className={className} 
            style={{ 
                transform: `rotate(${tilt}deg)`,
                overflow: 'visible'
            }}
        >
            <defs>
                <filter id={`sketch-${seed % 10}`}>
                    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" />
                </filter>
            </defs>
            <g 
                stroke="currentColor" 
                strokeWidth="2.5" 
                fill="none" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                filter={`url(#sketch-${seed % 10})`}
                opacity="0.7"
            >
                <path d={`M16,60 Q${16 + curveX},32 ${16 + shaftWiggle},4`} />
                <path d={`M${16 + shaftWiggle},4 l-${Math.sin(headLeftAngle * Math.PI / 180) * headLeftLen},${Math.cos(headLeftAngle * Math.PI / 180) * headLeftLen}`} />
                <path d={`M${16 + shaftWiggle},4 l${Math.sin(headRightAngle * Math.PI / 180) * headRightLen},${Math.cos(headRightAngle * Math.PI / 180) * headRightLen}`} />
            </g>
        </svg>
    );
};

// --- Scribble Line for Details ---
const ScribbleConnector: React.FC<{ direction: 'left' | 'right' | 'up' | 'down', length?: string, className?: string }> = ({ direction, length = "100px", className }) => {
    let pathD = "";
    let viewBox = "0 0 100 20";
    let width = "100px";
    let height = "20px";
    
    if (direction === 'right') pathD = "M0,10 Q50,0 100,10";
    else if (direction === 'left') pathD = "M100,10 Q50,20 0,10";
    else if (direction === 'up') { viewBox = "0 0 20 100"; width = "20px"; height = "100px"; pathD = "M10,100 Q0,50 10,0"; }
    else if (direction === 'down') { viewBox = "0 0 20 100"; width = "20px"; height = "100px"; pathD = "M10,0 Q20,50 10,100"; }

    return (
        <svg viewBox={viewBox} className={`overflow-visible text-zinc-300 opacity-60 ${className}`} style={{ width: direction === 'up' || direction === 'down' ? '20px' : length, height: direction === 'up' || direction === 'down' ? length : '20px' }} preserveAspectRatio="none">
             <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 2" />
             <circle cx={direction === 'right' || direction === 'left' ? (direction === 'right' ? 100 : 0) : 10} cy={direction === 'up' || direction === 'down' ? (direction === 'down' ? 100 : 0) : 10} r="3" fill="currentColor" />
        </svg>
    );
}

// --- LOADING OVERLAY ---

interface FloatingItem {
    id: number;
    text: string;
    x: number;
    y: number;
    rotation: number;
    type: 'TAG' | 'DATE' | 'COLOR' | 'TECH';
    delay: number;
}

const LoadingOverlay: React.FC<{ 
    progress: { current: number, total: number }; 
    images: ImageNode[];
    tags: Tag[];
}> = ({ progress, images, tags }) => {
    const latestImage = images.length > 0 ? images[images.length - 1] : null;
    const percentage = Math.round((progress.current / progress.total) * 100);
    const [floatingItems, setFloatingItems] = useState<FloatingItem[]>([]);
    const lastImageCount = useRef(0);

    useEffect(() => {
        if (images.length > lastImageCount.current) {
            const newCount = images.length;
            const itemsToAdd: FloatingItem[] = [];
            const newImages = images.slice(lastImageCount.current, newCount);
            
            newImages.forEach(img => {
                if (Math.random() > 0.5 && img.tagIds.length > 0) {
                    const randomTagId = img.tagIds[Math.floor(Math.random() * img.tagIds.length)];
                    const tag = tags.find(t => t.id === randomTagId);
                    if (tag) itemsToAdd.push({ id: Math.random(), text: `#${tag.label}`, x: 10 + Math.random() * 80, y: 10 + Math.random() * 80, rotation: (Math.random() - 0.5) * 45, type: 'TAG', delay: Math.random() * 0.5 });
                }
                if (Math.random() > 0.7) {
                    const text = Math.random() > 0.5 ? new Date(img.captureTimestamp).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : img.cameraModel;
                    itemsToAdd.push({ id: Math.random(), text: text, x: 5 + Math.random() * 90, y: 5 + Math.random() * 90, rotation: (Math.random() - 0.5) * 30, type: 'TECH', delay: Math.random() * 0.5 });
                }
                if (Math.random() > 0.8 && img.palette.length > 0) {
                     itemsToAdd.push({ id: Math.random(), text: img.palette[0], x: 5 + Math.random() * 90, y: 5 + Math.random() * 90, rotation: (Math.random() - 0.5) * 60, type: 'COLOR', delay: Math.random() * 0.5 });
                }
            });
            setFloatingItems(prev => [...prev, ...itemsToAdd].slice(-20));
            lastImageCount.current = newCount;
        }
    }, [images, tags]);

    const polaroidRotation = useMemo(() => (Math.random() - 0.5) * 6, [latestImage]);

    return (
        <div className="absolute inset-0 z-[100] bg-zinc-950 flex flex-col items-center justify-center font-hand text-zinc-200 overflow-hidden">
             <div className="absolute inset-0 pointer-events-none overflow-hidden">
                 {floatingItems.map(item => (
                     <div key={item.id} className="absolute text-white/20 text-xl md:text-2xl animate-in fade-in zoom-in duration-1000 fill-mode-forwards pr-4" style={{ left: `${item.x}%`, top: `${item.y}%`, transform: `rotate(${item.rotation}deg)`, animationDelay: `${item.delay}s` }}>
                         {item.type === 'COLOR' ? (<div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full" style={{backgroundColor: item.text}} /><span className="font-mono text-sm">{item.text}</span></div>) : (item.text)}
                     </div>
                 ))}
             </div>
            <div className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")` }} />
            <div className="relative z-10 flex flex-col items-center gap-12 max-w-lg w-full px-6">
                <div className="flex flex-col items-center gap-1">
                    <h1 className="text-5xl md:text-7xl font-bold tracking-tighter opacity-90 drop-shadow-md pr-4">Somatic Studio</h1>
                </div>
                <div className="relative w-72 h-80 md:w-80 md:h-96 flex flex-col items-center justify-center transition-all duration-500 ease-out" style={{ transform: `rotate(${polaroidRotation}deg)` }}>
                    <div className="absolute inset-0 bg-[#f8f8f8] shadow-2xl rounded-sm transform translate-y-1" />
                    {latestImage ? (
                        <div className="relative w-[90%] h-[85%] mt-4 bg-zinc-100 flex flex-col animate-in fade-in duration-500">
                             <img src={latestImage.fileUrl} alt="Loading Preview" className="w-full h-64 object-cover filter sepia-[0.1] contrast-[1.1]" />
                             <div className="flex-1 flex flex-col justify-end p-3 pb-1">
                                 <div className="flex justify-between items-end font-mono text-[10px] text-zinc-400 tracking-wider">
                                     <span className="uppercase truncate max-w-[120px]">{latestImage.inferredSeason} {new Date(latestImage.captureTimestamp).getFullYear()}</span>
                                     <span>ISO{latestImage.iso}</span>
                                 </div>
                                 <div className="flex gap-1 mt-1 justify-end opacity-50">{latestImage.palette.slice(0,3).map(c => (<div key={c} className="w-2 h-2 rounded-full" style={{background: c}} />))}</div>
                             </div>
                        </div>
                    ) : (<div className="relative w-[90%] h-[85%] mt-4 bg-zinc-100 flex flex-col items-center justify-center text-zinc-300"><Activity size={32} /></div>)}
                </div>
                <div className="w-full flex flex-col gap-4 max-w-md">
                    <div className="flex justify-between text-2xl font-mono text-zinc-400 items-end px-2"><span>{progress.current.toString().padStart(3, '0')}</span><span className="opacity-30 text-sm mb-1">/</span><span>{progress.total}</span></div>
                    <div className="w-full h-6 relative">
                        <svg className="w-full h-full overflow-visible" preserveAspectRatio="none">
                            <path d="M2,10 Q50,14 100,10 T200,10 T300,10 T400,10" fill="none" stroke="#3f3f46" strokeWidth="2" strokeLinecap="round" className="w-full" vectorEffect="non-scaling-stroke" />
                            <path d="M2,10 Q50,14 100,10 T200,10 T300,10 T400,10" fill="none" stroke="#e4e4e7" strokeWidth="4" strokeLinecap="round" strokeDasharray="410" strokeDashoffset={410 - (percentage * 4.1)} className="transition-all duration-300 ease-linear" vectorEffect="non-scaling-stroke" filter="url(#pencil)" />
                            <defs><filter id="pencil"><feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="5" stitchTiles="stitch" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="2" /></filter></defs>
                        </svg>
                    </div>
                    <div className="text-center text-zinc-500 text-lg mt-1 font-mono tracking-widest">{percentage}% COMPLETED</div>
                </div>
            </div>
            <div className="fixed bottom-8 right-8 flex items-center gap-3 opacity-80 z-[110]">
                <div className="text-right"><div className="font-hand text-xl text-zinc-300 pr-4">Captured on</div><div className="font-mono text-xs text-zinc-400 uppercase tracking-widest">Fujifilm X-Series</div></div>
                <Camera size={24} className="text-zinc-300" strokeWidth={1.5} />
            </div>
        </div>
    );
}

// --- ROUGH CONTAINER ---
const RoughContainer: React.FC<{ 
    children?: React.ReactNode; 
    title: string; 
    description?: string;
    alignText: 'left' | 'right';
    onTitleClick?: () => void;
}> = ({ children, title, description, alignText, onTitleClick }) => {
    return (
        <div className="relative group pointer-events-auto p-6">
            {/* Hand-drawn Box Background - Expanding to contain text + children */}
            <div className="absolute -inset-4 bg-white/80 backdrop-blur-xl rounded-xl -z-10 shadow-lg border border-zinc-400/20" 
                 style={{ 
                     borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px',
                 }}
            />
            
            {/* Sketch Outline Overlay */}
            <div className="absolute -inset-4 -z-10 pointer-events-none text-zinc-400/40">
                 <svg className="w-full h-full overflow-visible">
                    <rect x="0" y="0" width="100%" height="100%" rx="15" ry="15" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="300 8" vectorEffect="non-scaling-stroke" style={{ filter: 'url(#sketch-filter)' }} />
                 </svg>
            </div>

            <div className={`flex flex-col gap-4 min-w-[120px] ${children ? 'min-w-[200px] max-w-[calc(100vw-5rem)]' : ''} ${alignText === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
                {/* Title & Description moved inside */}
                <div className="flex flex-col gap-0.5">
                    <div 
                        onClick={onTitleClick}
                        className={`font-hand text-3xl font-bold text-zinc-700 leading-none tracking-wide pr-4 select-none ${onTitleClick ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
                    >
                        {title}
                    </div>
                    {description && <div className="font-hand text-lg text-zinc-500 leading-tight pr-4">{description}</div>}
                    {children && <div className={`h-px bg-zinc-300 w-12 mt-2 ${alignText === 'right' ? 'ml-auto' : 'mr-auto'}`} />}
                </div>

                {/* Children content */}
                {children && (
                    <div className="relative z-10">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- SATELLITE NAVIGATION LAYER ---

const SatelliteLayer: React.FC<{
    node: ImageNode;
    tags: Tag[];
    onNavigate: (anchor: AnchorState) => void;
}> = ({ node, tags, onNavigate }) => {
    const uniqueTags = useMemo(() => {
        const allIds = [...node.tagIds, ...(node.aiTagIds || [])];
        const resolved = allIds.map(id => tags.find(t => t.id === id)).filter(Boolean) as Tag[];
        const concepts = resolved.filter(t => t.type !== TagType.TECHNICAL && t.type !== TagType.SEASONAL && t.label.toLowerCase() !== 'nsfw');
        const seen = new Set<string>();
        const final: Tag[] = [];
        concepts.forEach(t => { if(!seen.has(t.label.toLowerCase())){ seen.add(t.label.toLowerCase()); final.push(t); } });
        return final;
    }, [node, tags]);

    return (
        <div className="absolute inset-0 pointer-events-none z-[60]">
            {/* Left: Palette */}
            <div className="absolute bottom-12 left-10 flex items-end animate-in fade-in slide-in-from-bottom-4 duration-700">
                <RoughContainer title="Spectral ID" description="Pivot via color space" alignText="left">
                    <div className="flex flex-col gap-3 min-w-[140px]">
                        {node.palette.map((color, i) => (
                            <button key={i} className="flex items-center gap-3 group/color cursor-pointer transition-transform hover:translate-x-1" onClick={() => onNavigate({ mode: 'COLOR', id: color })} title={color}>
                                <div className="w-8 h-8 rounded-full border-2 border-white/80 shadow-sm" style={{ backgroundColor: color }} />
                                <span className="font-hand text-xl text-zinc-500 group-hover/color:text-zinc-800 transition-colors uppercase tracking-widest pr-4">{color}</span>
                            </button>
                        ))}
                    </div>
                </RoughContainer>
            </div>

            {/* Right: Tags */}
            <div className="absolute bottom-12 right-10 flex items-end animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
                <RoughContainer title="Semantic Web" description="Traverse concept clusters" alignText="right">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3 items-center max-h-[300px] overflow-y-auto no-scrollbar pr-2">
                        {uniqueTags.map(tag => (
                            <button key={tag.id} className="text-xl font-hand text-zinc-600 hover:text-indigo-600 hover:translate-x-1 transition-all text-left flex items-center gap-2 group/tag whitespace-nowrap cursor-pointer pr-2" onClick={() => onNavigate({ mode: 'TAG', id: tag.id, meta: tag })}>
                                <Hash size={14} className="opacity-30 group-hover/tag:opacity-100 flex-shrink-0 text-indigo-400" />
                                <span className="truncate max-w-[160px] pr-3">{tag.label}</span>
                            </button>
                        ))}
                    </div>
                </RoughContainer>
            </div>
        </div>
    );
};

// --- TYPES & UTILS ---

interface SimNode extends SimulationNodeDatum {
    id: string;
// ... (Rest of file unchanged)
    original: ImageNode;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    currentScale: number;
    targetScale: number;
    currentOpacity: number;
    targetOpacity: number;
    relevanceScore: number;
    isVisible: boolean;
    orbitSpeed?: number;
    orbitOffset?: number;
    orbitRadiusBase?: number;
    gridSortIndex?: number;
}

const hexToRgbVals = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [220, 220, 220];
}

const hexToRgb = (hex: string) => { const [r, g, b] = hexToRgbVals(hex); return { r, g, b }; }

const getColorDistSq = (hex1: string, hex2: string) => {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    return (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2;
};

const getMinPaletteDistance = (p1: string[], p2: string[]): number => {
    let min = Infinity;
    for (const c1 of p1) {
        for (const c2 of p2) {
            const d = getColorDistSq(c1, c2);
            if (d < min) min = d;
        }
    }
    return min;
};

const getIntersectionAttributes = (imgA: ImageNode, imgB: ImageNode, allTags: Tag[]) => {
    const tagsA = new Set([...imgA.tagIds, ...(imgA.aiTagIds||[])]);
    const tagsB = new Set([...imgB.tagIds, ...(imgB.aiTagIds||[])]);
    const commonTagIds = [...tagsA].filter(x => tagsB.has(x));
    const commonTags = commonTagIds.map(id => allTags.find(t => t.id === id)).filter(Boolean) as Tag[];
    const colorMatches: {cA: string, cB: string}[] = [];
    const usedB = new Set<string>();
    imgA.palette.forEach(cA => {
        let bestMatch = null;
        let minDist = 3000;
        imgB.palette.forEach(cB => {
            if (usedB.has(cB)) return;
            const dist = getColorDistSq(cA, cB);
            if (dist < minDist) { minDist = dist; bestMatch = cB; }
        });
        if (bestMatch) { colorMatches.push({ cA, cB: bestMatch }); usedB.add(bestMatch); }
    });
    const techMatches: string[] = [];
    if (imgA.cameraModel === imgB.cameraModel && imgA.cameraModel !== 'Unknown Camera') techMatches.push(imgA.cameraModel);
    if (imgA.iso === imgB.iso) techMatches.push(`ISO ${imgA.iso}`);
    if (imgA.inferredSeason === imgB.inferredSeason) techMatches.push(imgA.inferredSeason);
    const d1 = new Date(imgA.captureTimestamp);
    const d2 = new Date(imgB.captureTimestamp);
    if (d1.toDateString() === d2.toDateString()) techMatches.push("Same Day");
    else if (Math.abs(imgA.captureTimestamp - imgB.captureTimestamp) < 3600000) techMatches.push("Within 1 Hour");
    return { commonTags, colorMatches, techMatches };
};

const MONO_KEYWORDS = ['b&w', 'black and white', 'monochrome', 'grayscale', 'noir', 'silver gelatin'];
const isMonochrome = (tags: Tag[], tagIds: string[]) => {
    return tagIds.some(id => {
        const tag = tags.find(t => t.id === id);
        return tag && MONO_KEYWORDS.some(k => tag.label.toLowerCase().includes(k));
    });
};

const getDominantColorsFromNodes = (nodes: SimNode[], count: number = 5, excludeColor?: string): string[] => {
    const colorCounts: Record<string, number> = {};
    nodes.forEach(node => {
        node.original.palette.forEach(color => {
            if (excludeColor && color === excludeColor) return;
            colorCounts[color] = (colorCounts[color] || 0) + 1;
        });
    });
    return Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).slice(0, count).map(entry => entry[0]);
};

const getRelatedTagsFromNodes = (nodes: SimNode[], tags: Tag[], count: number = 6, excludeTagId?: string, nsfwTagId?: string, nsfwFilterActive: boolean = false): Tag[] => {
    const tagCounts: Record<string, number> = {};
    nodes.forEach(node => {
        const allTags = [...node.original.tagIds, ...(node.original.aiTagIds || [])];
        allTags.forEach(tId => {
            if (tId === excludeTagId) return;
            const t = tags.find(tag => tag.id === tId);
            if (!t) return;
            if (t.type !== TagType.AI_GENERATED) return;
            if (t.label.toLowerCase().trim() === 'nsfw') return;
            tagCounts[tId] = (tagCounts[tId] || 0) + 1;
        });
    });
    return Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, count).map(([id]) => tags.find(t => t.id === id)).filter((t): t is Tag => {
        if (!t) return false;
        if (nsfwFilterActive && t.label.trim().toLowerCase() === 'nsfw') return false;
        return true;
    });
};

const getAnnotationLayout = (id: string) => {
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const dateSide = hash % 2 === 0 ? 'left' : 'right';
    const techSide = dateSide === 'left' ? 'right' : 'left';
    const tilt = (hash % 5) - 2;
    const verticalOffset = (hash % 40) - 20;
    const isCurved = hash % 3 === 0;
    return { dateSide, techSide, tilt, verticalOffset, isCurved, seed: hash };
};

const Annotation: React.FC<{ side: 'left' | 'right'; children: React.ReactNode; verticalOffset?: number; isCurved?: boolean; compact?: boolean; }> = ({ side, children, verticalOffset = 0, isCurved = false, compact = false }) => {
    const isLeft = side === 'left';
    const widthClass = compact ? 'w-32 md:w-40' : 'w-48 md:w-64';
    const offsetClass = isLeft ? (compact ? 'right-full mr-4 md:mr-6 text-right' : 'right-full mr-8 md:mr-12 text-right') : (compact ? 'left-full ml-4 md:ml-6 text-left' : 'left-full ml-8 md:ml-12 text-left');
    return (
        <div className={`absolute top-1/2 ${widthClass} ${offsetClass}`} style={{ marginTop: `${verticalOffset}px`, transform: 'translateY(-50%)' }}>
            <div className={`relative font-hand text-zinc-600 ${compact ? 'text-sm md:text-base' : 'text-lg md:text-xl'} leading-snug pr-4`}>
                <svg className={`absolute top-1/2 text-zinc-400 pointer-events-none opacity-60 ${isLeft ? '-right-8 translate-x-2' : '-left-8 -translate-x-2'} ${compact ? 'w-8 h-4' : 'w-12 h-8'}`} style={{ transform: `translateY(-50%) ${isLeft ? '' : 'scaleX(-1)'}` }} viewBox="0 0 48 32" overflow="visible">
                    {isCurved ? (<path d="M0,16 Q24,4 48,16" fill="none" stroke="currentColor" strokeWidth={compact ? 1 : 1.5} strokeLinecap="round" />) : (<line x1="0" y1="16" x2="48" y2="16" stroke="currentColor" strokeWidth={compact ? 1 : 1.5} strokeLinecap="round" />)}
                    <circle cx="48" cy="16" r={compact ? 1.5 : 2.5} fill="currentColor" />
                </svg>
                {children}
            </div>
        </div>
    );
};

// --- REUSABLE HISTORY STREAM ---
const HistoryStream: React.FC<{ 
    history: AnchorState[]; 
    images: ImageNode[]; 
    tags: Tag[]; 
    nsfwFilterActive: boolean; 
    nsfwTagId?: string; 
    currentHero?: ImageNode;
}> = ({ history, images, tags, nsfwFilterActive, nsfwTagId, currentHero }) => {
    
    // VISUALIZE CONNECTION BETWEEN HERO AND FIRST HISTORY ITEM
    let heroConnection = null;
    if (currentHero && history.length > 0) {
        const prevItem = history[0];
        const isRichLink = prevItem.mode === 'IMAGE';
        let richContent = null;

        if (isRichLink) {
            const prevImg = images.find(i => i.id === prevItem.id);
            if (prevImg) {
                 const { commonTags, colorMatches, techMatches } = getIntersectionAttributes(currentHero, prevImg, tags);
                 if (commonTags.length > 0 || colorMatches.length > 0 || techMatches.length > 0) {
                     richContent = (
                        <div className="relative flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full border border-white/10 bg-zinc-800/50 backdrop-blur-sm p-1.5 flex items-center justify-center relative z-20 shadow-[0_0_20px_rgba(139,92,246,0.1)]">
                                <EsotericSprite node={{ id: currentHero.id, original: currentHero, x: 0, y: 0, currentScale: 1, targetScale: 1, currentOpacity: 1, targetOpacity: 1, relevanceScore: 100, isVisible: true }} />
                            </div>
                            <div className="hidden md:block"><Annotation side="left" compact verticalOffset={0} isCurved={true}><div className="flex flex-col gap-2 items-end">{colorMatches.slice(0, 3).map((pair, idx) => (<div key={idx} className="flex items-center gap-2"><span className="text-xs font-mono opacity-50 uppercase">{pair.cA}</span><div className="flex -space-x-1"><div className="w-3 h-3 rounded-full border border-white/20" style={{backgroundColor: pair.cA}} /><div className="w-3 h-3 rounded-full border border-white/20" style={{backgroundColor: pair.cB}} /></div></div>))}{techMatches.length > 0 && (<div className="mt-1 text-right">{techMatches.map((t, idx) => (<span key={idx} className="block text-zinc-400 text-sm">{t}</span>))}</div>)}</div></Annotation></div>
                            <div className="hidden md:block"><Annotation side="right" compact verticalOffset={0} isCurved={false}><div className="flex flex-col gap-1 items-start text-zinc-400">{commonTags.slice(0, 4).map((tag, idx) => (<div key={tag.id} className="flex items-center gap-2"><Hash size={12} className="opacity-50" /><span>{tag.label}</span></div>))}{commonTags.length > 4 && <span className="text-xs opacity-50 italic">+{commonTags.length - 4} more...</span>}</div></Annotation></div>
                        </div>
                     );
                 }
            }
        }

        if (richContent) {
            heroConnection = (
                <div className="w-full max-w-4xl flex flex-col items-center pb-6 relative z-10 animate-in fade-in slide-in-from-top-4 duration-700">
                    {richContent}
                </div>
            );
        } else {
            // Generic Arrow connection for non-image or weak-image connections
            heroConnection = (
                <div className="w-full max-w-4xl flex flex-col items-center pb-6 relative z-10 animate-in fade-in slide-in-from-top-4 duration-700 opacity-60">
                     <GreasePencilArrow seed={500} className="text-zinc-500 w-8 h-16 drop-shadow-sm" />
                </div>
            );
        }
    }

    return (
        <div className="flex flex-col items-center min-h-full pt-0 pb-20 relative">
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-zinc-800 to-transparent" />
            
            {/* Render the connection from Hero to first item */}
            {heroConnection}

            {history.map((step, index) => {
                const isFirst = index === 0;
                const prevStep = history[index + 1]; 
                const isDirectLink = step.mode === 'IMAGE' && prevStep?.mode === 'IMAGE';
                
                if (step.mode === 'IMAGE' && nsfwFilterActive) {
                    const img = images.find(i => i.id === step.id);
                    if (img) {
                        const hasNsfwTag = [...img.tagIds, ...(img.aiTagIds || [])].some(tid => {
                            if (tid === nsfwTagId) return true;
                            const t = tags.find(tag => tag.id === tid);
                            return t && t.label.trim().toLowerCase() === 'nsfw';
                        });
                        if (hasNsfwTag) return null;
                    }
                }
                if (step.mode === 'TAG') {
                    if (step.meta?.label?.toLowerCase() === 'nsfw') return null;
                }

                return (
                    <div key={index} className="w-full max-w-4xl flex flex-col items-center snap-center shrink-0 py-16 relative group perspective-1000">
                        {!isFirst && !isDirectLink && (<div className="absolute -top-16 left-1/2 -translate-x-1/2 z-0 flex flex-col items-center pointer-events-none opacity-50"><GreasePencilArrow seed={index * 123} className="text-zinc-500 w-8 h-16 drop-shadow-sm" /></div>)}
                        {step.mode === 'IMAGE' && (() => {
                            const img = images.find(i => i.id === step.id);
                            if (!img) return null;
                            const { dateSide, techSide, tilt, verticalOffset, isCurved, seed } = getAnnotationLayout(img.id);
                            const dateObj = new Date(img.captureTimestamp);
                            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const dateStr = dateObj.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
                            const seasonStr = img.inferredSeason;
                            return (
                                <div className="relative z-10 w-full flex flex-col items-center gap-12">
                                    <div className="relative">
                                        <div className="hidden md:block">
                                            <Annotation side={techSide as 'left' | 'right'} verticalOffset={-20} isCurved={isCurved}>
                                                <div className="flex flex-col gap-1 text-zinc-400"><span className="text-2xl text-zinc-300 font-bold flex items-center gap-2 justify-end flex-row-reverse">{img.cameraModel} <Camera size={20} strokeWidth={2} className="opacity-70" /></span><span className="text-xl italic opacity-80">{img.lensModel}</span><div className="flex items-center gap-3 justify-end mt-2 text-lg opacity-60"><span>ISO {img.iso}</span><span>•</span><span>{img.aperture}</span><span>•</span><span>{img.shutterSpeed}s</span></div></div>
                                            </Annotation>
                                            <Annotation side={dateSide as 'left' | 'right'} verticalOffset={40} isCurved={!isCurved}>
                                                <div className="flex flex-col gap-1 text-zinc-400"><span className="text-3xl text-zinc-200 font-bold flex items-center gap-2">{seasonStr}{seasonStr === 'Summer' ? <Sun size={24} /> : seasonStr === 'Winter' ? <Thermometer size={24} /> : <Cloud size={24} />}</span><span className="text-xl flex items-center gap-2"><Calendar size={18} /> {dateStr}</span><span className="text-xl flex items-center gap-2 italic opacity-70"><Clock size={18} /> {timeStr}</span></div>
                                            </Annotation>
                                        </div>
                                        <div className="bg-white p-3 rounded-sm shadow-2xl transition-transform duration-700 max-w-[80vw] md:max-w-[400px] relative z-20 group-hover:scale-[1.01]" style={{ transform: `rotate(${tilt}deg)` }}>
                                            <img src={img.fileUrl} alt="" className="w-full h-auto object-contain bg-zinc-100" />
                                            <div className="md:hidden mt-3 pt-3 border-t border-dashed border-zinc-200 font-hand text-zinc-600 text-lg flex justify-between items-start"><div className="flex flex-col"><span className="font-bold">{dateStr}</span><span className="text-sm opacity-70">{timeStr}</span></div><div className="flex flex-col items-end text-sm"><span>{img.cameraModel}</span><span className="opacity-70">{img.aperture}, ISO{img.iso}</span></div></div>
                                        </div>
                                    </div>
                                    {isDirectLink && (() => {
                                        const prevImg = images.find(i => i.id === prevStep.id);
                                        if (!prevImg) return null;
                                        const { commonTags, colorMatches, techMatches } = getIntersectionAttributes(img, prevImg, tags);
                                        if(commonTags.length === 0 && colorMatches.length === 0 && techMatches.length === 0) return (<div className="absolute -top-16 left-1/2 -translate-x-1/2 z-0 flex flex-col items-center pointer-events-none opacity-50"><GreasePencilArrow seed={index * 99} className="text-zinc-500 w-8 h-16" /></div>);
                                        return (
                                            <div className="relative flex flex-col items-center animate-in fade-in zoom-in duration-700 delay-300">
                                                <div className="w-20 h-20 rounded-full border border-white/10 bg-zinc-800/50 backdrop-blur-sm p-2 flex items-center justify-center relative z-20 shadow-[0_0_30px_rgba(139,92,246,0.1)]">
                                                    <EsotericSprite node={{ id: img.id, original: img, x: 0, y: 0, currentScale: 1, targetScale: 1, currentOpacity: 1, targetOpacity: 1, relevanceScore: 100, isVisible: true }} />
                                                </div>
                                                <div className="hidden md:block"><Annotation side="left" compact verticalOffset={0} isCurved={true}><div className="flex flex-col gap-2 items-end">{colorMatches.slice(0, 3).map((pair, idx) => (<div key={idx} className="flex items-center gap-2"><span className="text-xs font-mono opacity-50 uppercase">{pair.cA}</span><div className="flex -space-x-1"><div className="w-3 h-3 rounded-full border border-white/20" style={{backgroundColor: pair.cA}} /><div className="w-3 h-3 rounded-full border border-white/20" style={{backgroundColor: pair.cB}} /></div></div>))}{techMatches.length > 0 && (<div className="mt-1 text-right">{techMatches.map((t, idx) => (<span key={idx} className="block text-zinc-400 text-sm">{t}</span>))}</div>)}</div></Annotation></div>
                                                <div className="hidden md:block"><Annotation side="right" compact verticalOffset={0} isCurved={false}><div className="flex flex-col gap-1 items-start text-zinc-400">{commonTags.slice(0, 4).map((tag, idx) => (<div key={tag.id} className="flex items-center gap-2"><Hash size={12} className="opacity-50" /><span>{tag.label}</span></div>))}{commonTags.length > 4 && <span className="text-xs opacity-50 italic">+{commonTags.length - 4} more...</span>}</div></Annotation></div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        })()}
                        {step.mode === 'TAG' && (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="right" verticalOffset={0} isCurved><div className="flex flex-col gap-1 text-zinc-400"><span className="text-xl font-bold text-zinc-300">Semantic Focus</span><span className="text-sm opacity-70">Classification</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 bg-zinc-500/10 blur-xl rounded-full" /><div className="relative bg-zinc-900/90 backdrop-blur-md border border-zinc-700 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10"><Hash size={20} className="text-zinc-400" /><span className="text-3xl font-hand text-white tracking-wide pr-4">{step.meta?.label}</span></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Tag Filter</span></div>)}
                        {step.mode === 'COLOR' && (() => { const rgb = hexToRgbVals(step.id); return (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="left" verticalOffset={0} isCurved><div className="flex flex-col gap-1 items-end text-zinc-400"><span className="text-xl font-bold text-zinc-200 font-mono">{step.id}</span><span className="text-sm opacity-60 font-mono">R{rgb[0]} G{rgb[1]} B{rgb[2]}</span><span className="text-xs italic opacity-40 mt-1 font-hand pr-4">Dominant wavelength</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 blur-2xl opacity-40 rounded-full" style={{ backgroundColor: step.id }} /><div className="w-32 h-32 rounded-[2rem] border-4 border-white/10 shadow-2xl relative z-10 flex items-center justify-center overflow-hidden rotate-3" style={{ backgroundColor: step.id }}><div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent pointer-events-none" /><div className="absolute inset-0 bg-gradient-to-bl from-white/20 to-transparent pointer-events-none" /><Palette size={24} className="text-white mix-blend-overlay opacity-50" /></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Color Filter</span></div>); })()}
                        {step.mode === 'DATE' && (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="right" verticalOffset={0} isCurved><div className="flex flex-col gap-1 text-zinc-400"><span className="text-xl font-bold text-zinc-300">Temporal Pivot</span><span className="text-sm opacity-70">30-day Window</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full" /><div className="relative bg-zinc-900/90 backdrop-blur-md border border-blue-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10"><Calendar size={20} className="text-blue-400" /><span className="text-3xl font-hand text-white tracking-wide pr-4">{new Date(parseInt(step.id)).toLocaleDateString()}</span></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Date Filter</span></div>)}
                        {step.mode === 'SEASON' && (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="left" verticalOffset={0} isCurved><div className="flex flex-col gap-1 items-end text-zinc-400"><span className="text-xl font-bold text-zinc-300">Cyclical Time</span><span className="text-sm opacity-70">Seasonal Grid</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 bg-amber-500/10 blur-xl rounded-full" /><div className="relative bg-zinc-900/90 backdrop-blur-md border border-amber-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10">{step.id === 'Winter' ? <Snowflake size={24} className="text-cyan-200" /> : step.id === 'Summer' ? <Sun size={24} className="text-amber-400" /> : <Cloud size={24} className="text-zinc-400" />}<span className="text-3xl font-hand text-white tracking-wide pr-4">{step.id}</span></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Seasonal Filter</span></div>)}
                        {step.mode === 'CAMERA' && (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="left" verticalOffset={0} isCurved><div className="flex flex-col gap-1 items-end text-zinc-400"><span className="text-xl font-bold text-zinc-300">Mechanical Eye</span><span className="text-sm opacity-70">Equipment Match</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 bg-emerald-500/10 blur-xl rounded-full" /><div className="relative bg-zinc-900/90 backdrop-blur-md border border-emerald-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10"><Camera size={20} className="text-emerald-400" /><span className="text-3xl font-hand text-white tracking-wide pr-4">{step.id}</span></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Camera Filter</span></div>)}
                        {step.mode === 'LENS' && (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="right" verticalOffset={0} isCurved><div className="flex flex-col gap-1 text-zinc-400"><span className="text-xl font-bold text-zinc-300">Glass Signature</span><span className="text-sm opacity-70">Optic Match</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 bg-amber-500/10 blur-xl rounded-full" /><div className="relative bg-zinc-900/90 backdrop-blur-md border border-amber-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10"><Aperture size={20} className="text-amber-400" /><span className="text-2xl font-hand text-white tracking-wide pr-4">{step.id}</span></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Lens Filter</span></div>)}
                        {step.mode === 'NONE' && (
                            <div className="relative z-10 flex flex-col items-center py-12">
                                <div className="relative">
                                    <div className="hidden md:block">
                                        <Annotation side="left" verticalOffset={0} isCurved>
                                            <div className="flex flex-col gap-1 items-end text-zinc-400">
                                                <span className="text-xl font-bold text-zinc-300">Visual Index</span>
                                                <span className="text-sm opacity-70">Grid Origin</span>
                                            </div>
                                        </Annotation>
                                    </div>
                                    <div className="relative cursor-default">
                                        <div className="absolute inset-0 bg-zinc-500/10 blur-xl rounded-full" />
                                        <div className="relative bg-zinc-900/90 backdrop-blur-md border border-zinc-700 px-8 py-5 rounded-2xl flex items-center gap-4 shadow-lg ring-1 ring-white/10">
                                            <LayoutGrid size={24} className="text-zinc-400" />
                                            <span className="text-2xl font-hand text-white tracking-wide pr-2">Gallery</span>
                                        </div>
                                    </div>
                                </div>
                                <span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Gallery Origin</span>
                            </div>
                        )}
                    </div>
                );
            })}
            <div className="mt-20 flex flex-col items-center gap-3 opacity-30"><div className="w-2 h-2 bg-zinc-600 rounded-full" /><span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Session Origin</span></div>
        </div>
    );
};

// --- HISTORY SUB-COMPONENT --- 
const HistoryTimeline: React.FC<{ history: AnchorState[]; images: ImageNode[]; tags: Tag[]; activeMode: ExperienceMode; nsfwFilterActive: boolean; nsfwTagId?: string; currentHero?: ImageNode; }> = ({ history, images, tags, activeMode, nsfwFilterActive, nsfwTagId, currentHero }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (activeMode === 'HISTORY' && scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'instant' }); }, [activeMode]);
    useEffect(() => { if (activeMode === 'EXPLORE' && scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }, [activeMode]);

    return (
        <div ref={scrollRef} className={`absolute inset-0 z-40 bg-zinc-900/95 backdrop-blur-md overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar transition-opacity duration-500 ${activeMode === 'HISTORY' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            <HistoryStream history={history} images={images} tags={tags} nsfwFilterActive={nsfwFilterActive} nsfwTagId={nsfwTagId} currentHero={currentHero} />
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
    const [simNodes, setSimNodes] = useState<SimNode[]>([]);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    const [titleClicks, setTitleClicks] = useState(0);
    
    // Derived Data State
    const [commonTags, setCommonTags] = useState<Tag[]>([]);
    const [activePalette, setActivePalette] = useState<string[]>([]);

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

        if (isGalleryOpen) {
            color = '#000000'; // Black for full screen
        } else if (isDetailOpen || experienceMode === 'HISTORY') {
            color = '#18181b'; // Zinc-900 for Detail or History
        }

        metaThemeColor.setAttribute('content', color);

        // Cleanup: Reset to default when unmounting or switching views might be handled by other logic, 
        // but ensuring it resets on unmount is good practice.
        return () => {
            metaThemeColor.setAttribute('content', '#faf9f6');
        };
    }, [isGalleryOpen, isDetailOpen, experienceMode]);

    // Reset scroll when opening detail view with new node
    useEffect(() => {
        if (isDetailOpen && detailScrollRef.current) {
            detailScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [anchor.id, isDetailOpen]);

    const getTagById = useCallback((id: string) => tags.find(t => t.id === id), [tags]);
    const nsfwTagId = useMemo(() => tags.find(t => t.label.trim().toLowerCase() === 'nsfw')?.id, [tags]);

    // Timeline Calculation
    const { minTime, maxTime, timeRange } = useMemo(() => {
        if (images.length === 0) return { minTime: 0, maxTime: 0, timeRange: 1 };
        const timestamps = images.map(i => i.captureTimestamp);
        const min = Math.min(...timestamps);
        const max = Math.max(...timestamps);
        return { minTime: min, maxTime: max, timeRange: Math.max(max - min, 1) };
    }, [images]);

    // Reset modals if anchor changes to something else
    useEffect(() => {
        if (anchor.mode !== 'IMAGE') {
            setIsDetailOpen(false);
            setIsGalleryOpen(false);
        }
    }, [anchor]);

    // 1. SCORING & RELATIONSHIP ENGINE (Visibility Logic)
    // NOTE: This now drives visibility directly by updating simNodes state without full re-initialization
    useEffect(() => {
        if (loadingProgress) return; 

        // We use a functional update to get the latest simNodes without adding them to dependencies,
        // preventing infinite loops while ensuring we work with current physics state.
        setSimNodes(prevNodes => {
            if (prevNodes.length === 0) return prevNodes;

            let calculatedPalette: string[] = [];
            let calculatedTags: Tag[] = [];
            let newCommonTags = new Set<string>();

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

                             // --- REVISED SCORING LOGIC ---
                             
                             // 1. TEMPORAL (High Priority)
                             // Immediate session adjacency overrides almost everything
                             if (isSameDay) score += 500; 
                             else if (isNearDate) score += 100;
                             if (sameSeason) score += 20;

                             // 2. THEMATIC (Medium Priority)
                             // Calculate semantic overlap
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
                             const moderateThematicCorrelation = meaningfulTagMatches >= 1;

                             // 3. VISUAL & CROSS-MODALITY
                             
                             if (anchorIsMono) {
                                 if (targetIsMono) {
                                     // B&W -> B&W: Strong visual affinity
                                     score += 200; 
                                 } else {
                                     // B&W -> Color: Only allow if context is strong
                                     if (isSameDay) score += 150; // Context overrides visual mismatch
                                     else if (highThematicCorrelation) score += 50;
                                     else score -= 1000; // Punish random color images in B&W mode
                                 }
                             } else {
                                 // Anchor is Color
                                 if (targetIsMono) {
                                     // Color -> B&W: Only allow if context is strong
                                     if (isSameDay) score += 150;
                                     else if (highThematicCorrelation) score += 50;
                                     else score -= 500;
                                 } else {
                                     // Color -> Color: Check palette UNLESS semantic link is very strong
                                     if (isSameDay || highThematicCorrelation) {
                                         // Skip strict palette enforcement if it's the same moment or subject
                                         score += 50; 
                                     } else {
                                         // Strict visual matching for unrelated images
                                         if (colorDist < 1500) score += 200;
                                         else if (colorDist < 4000) score += 100;
                                         else if (colorDist < 8000) score += 20;
                                         else score -= 150; // Visual clash
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
            const visibleSubset: SimNode[] = [];

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
            
            // We need to set state derived values outside this updater if possible, or use a separate effect
            // But since these are just for context display, we can cheat a bit and set them in a timeout or 
            // just let the component re-render. 
            // To avoid side-effects in render, we'll schedule the context update.
            setTimeout(() => {
                setActivePalette(calculatedPalette);
                setCommonTags(calculatedTags);
            }, 0);

            return scoredNodes;
        });

    }, [anchor, images, getTagById, nsfwFilterActive, nsfwTagId, loadingProgress]); // Removed simNodes to avoid loop

    useEffect(() => {
        onContextUpdate({ commonTags, activePalette });
    }, [commonTags, activePalette]);

    // 2. INITIALIZATION (Grid Layout)
    // NOTE: Removed anchor.mode dependency to prevent state reset on navigation
    useEffect(() => {
        if(loadingProgress) return;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        setSimNodes((prev: SimNode[]) => {
            const existingMap = new Map<string, SimNode>(prev.map(n => [n.id, n]));
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

            // INITIAL SNAP: Only applied when initializing fresh nodes if in NONE mode
            // This happens on app load or file ingest
            if (anchor.mode === 'NONE') {
                const visibleNodes = newNodes.filter(n => n.isVisible);
                visibleNodes.sort((a, b) => (a.gridSortIndex || 0) - (b.gridSortIndex || 0));
                const COLS = Math.ceil(Math.sqrt(visibleNodes.length));
                const CELL_W = 120; 
                const CELL_H = 120;
                const gridW = (COLS - 1) * CELL_W;
                const ROWS = Math.ceil(visibleNodes.length / COLS);
                const gridH = (ROWS - 1) * CELL_H;
                const startX = centerX - gridW / 2;
                const startY = centerY - gridH / 2;

                visibleNodes.forEach((node, idx) => {
                    const col = idx % COLS;
                    const row = Math.floor(idx / COLS);
                    node.x = startX + col * CELL_W;
                    node.y = startY + row * CELL_H;
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
    }, [images, nsfwFilterActive, loadingProgress]); // anchor.mode REMOVED

    // 3. PHYSICS LOOP
    useEffect(() => {
        if (!containerRef.current || simNodes.length === 0 || loadingProgress) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const zoom = d3.zoom<HTMLDivElement, unknown>()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                if (worldRef.current) {
                    worldRef.current.style.transform = `translate3d(${event.transform.x}px, ${event.transform.y}px, 0) scale(${event.transform.k})`;
                }
            });
        
        zoomRef.current = zoom;
        d3.select(containerRef.current).call(zoom).on("dblclick.zoom", null);

        // Filter active nodes based on mode for force calculations
        let activeNodes: SimNode[] = [];
        if (anchor.mode === 'NONE') {
            activeNodes = simNodes.filter(n => n.isVisible).sort((a, b) => (a.gridSortIndex || 0) - (b.gridSortIndex || 0));
        } else {
            // In detail/cluster modes, we don't enforce a grid order for neighbors
            activeNodes = simNodes.filter(n => n.isVisible && n.id !== anchor.id);
        }

        const maxScaleByHeight = (height * 0.6) / 288;
        const heroScale = Math.min(Math.max(maxScaleByHeight, 1.2), 1.8); 
        const heroWidth = 192 * heroScale;
        const heroRadius = Math.sqrt(heroWidth ** 2 + (heroWidth * 1.5) ** 2) / 2;

        const simulation = d3.forceSimulation<SimNode>(simNodes)
            .alphaTarget(anchor.mode === 'NONE' ? 0 : 0.05) 
            .velocityDecay(anchor.mode === 'NONE' ? 0.2 : 0.3) 
            .force("charge", d3.forceManyBody<SimNode>().strength((d) => {
                if (!d.isVisible) return 0;
                if (anchor.mode === 'NONE') return 0; 
                if (d.id === anchor.id) return -1500; 
                if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') return -30;
                return -200; 
            }))
            .force("collide", d3.forceCollide<SimNode>().radius((d) => {
                 if (!d.isVisible) return 0;
                 if (anchor.mode === 'NONE') return 0;
                 if (anchor.mode === 'IMAGE') {
                     if (d.id === anchor.id) return heroRadius * 0.95; 
                     return 45; 
                 }
                 if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') return 30;
                 return 55; 
            }).strength(0.8)); 

        simulation.on("tick", () => {
            const cx = width / 2;
            const cy = height / 2;
            const time = Date.now() / 1000;

            simNodes.forEach((node, i) => {
                // VISIBILITY OPTIMIZATION:
                // Only skip calculation if node is invisible AND fully faded out/scaled down.
                // This allows nodes to gracefully animate out before freezing.
                if (!node.isVisible && node.currentOpacity < 0.01 && node.currentScale < 0.01) {
                    node.currentOpacity = 0;
                    node.currentScale = 0;
                    // Ensure hidden nodes don't block pointer events
                    const el = nodeRefs.current.get(node.id);
                    if (el) el.style.display = 'none';
                    return;
                }

                const isAnchor = anchor.mode === 'IMAGE' && node.id === anchor.id;
                
                // Define dynamic lerp factor based on state
                // If invisible (fading out), go fast (0.3). If visible (moving/scaling in), go smooth (0.1).
                const lerpFactor = !node.isVisible ? 0.3 : 0.1;

                // Ambient float for non-grid modes
                if (node.isVisible && !isAnchor && anchor.mode !== 'NONE' && !['TAG', 'COLOR', 'SEASON', 'DATE', 'CAMERA', 'LENS'].includes(anchor.mode)) {
                     const floatSpeed = 0.5;
                     const floatAmp = 0.05; 
                     node.vx = (node.vx || 0) + Math.sin(time * floatSpeed + i) * floatAmp;
                     node.vy = (node.vy || 0) + Math.cos(time * floatSpeed * 0.8 + i) * floatAmp;
                }

                // --- MODE-SPECIFIC FORCES ---

                if (anchor.mode === 'NONE') {
                    // RANDOMIZED GRID LAYOUT (Persistent)
                    if (node.isVisible) {
                        const idx = activeNodes.indexOf(node);
                        if (idx !== -1) {
                            const total = activeNodes.length;
                            const COLS = Math.ceil(Math.sqrt(total));
                            const CELL_W = 120; 
                            const CELL_H = 120; 
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
                        // Hero Position
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
                        // Satellite Position
                        const targetY = height * 0.45;
                        
                        // 1. JUMP LOGIC: If too far, snap to boundary to speed up arrival
                        const dxRaw = node.x - cx;
                        const dyRaw = node.y - targetY;
                        const distRaw = Math.sqrt(dxRaw*dxRaw + dyRaw*dyRaw) || 1;
                        const boundaryRadius = Math.max(width, height) * 0.9;
                        
                        if (distRaw > boundaryRadius) {
                            const angle = Math.atan2(dyRaw, dxRaw);
                            // Teleport to just inside the effective boundary
                            node.x = cx + Math.cos(angle) * (boundaryRadius * 0.95);
                            node.y = targetY + Math.sin(angle) * (boundaryRadius * 0.95);
                            // Dampen velocity to prevent slingshotting
                            node.vx = (node.vx || 0) * 0.1;
                            node.vy = (node.vy || 0) * 0.1;
                        }

                        // 2. ACCELERATED GRAVITY
                        const gravity = 0.035; 
                        node.vx = (node.vx || 0) + (cx - node.x) * gravity;
                        node.vy = (node.vy || 0) + (targetY - node.y) * gravity;
                        
                        // 3. ACCELERATED SWIRL
                        const dx = node.x - cx;
                        const dy = node.y - targetY;
                        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                        const swirlSpeed = 0.6; 
                        
                        node.vx += (-dy / dist) * swirlSpeed;
                        node.vy += (dx / dist) * swirlSpeed;
                        
                        node.targetScale = node.relevanceScore > 40 ? 0.8 : 0.6;
                        node.targetOpacity = 1.0; 
                    } 
                    else {
                        // Fade out for non-neighbors
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                    }
                }
                else if (['TAG', 'COLOR', 'DATE', 'CAMERA', 'LENS', 'SEASON'].includes(anchor.mode)) {
                    if (node.isVisible) {
                        // Cluster Grid
                        const idx = activeNodes.indexOf(node);
                        const total = activeNodes.length;
                        const COLS = Math.ceil(Math.sqrt(total));
                        const ROWS = Math.ceil(total / COLS);
                        const CELL_W = 220; 
                        const CELL_H = 220; 
                        const col = idx % COLS;
                        const row = Math.floor(idx / COLS);
                        const gridW = (COLS - 1) * CELL_W;
                        const gridH = (ROWS - 1) * CELL_H;
                        const tx = cx + (col * CELL_W) - (gridW / 2);
                        const ty = cy + (row * CELL_H) - (gridH / 2);
                        const structureStrength = 0.15;
                        node.vx = (node.vx || 0) + (tx - node.x) * structureStrength;
                        node.vy = (node.vy || 0) + (ty - node.y) * structureStrength;
                        node.targetScale = 0.85; 
                        node.targetOpacity = 1;
                    } else {
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                    }
                }

                // General Physics Integration
                node.vx = (node.vx || 0) * 0.9;
                node.vy = (node.vy || 0) * 0.9;
                node.currentScale += (node.targetScale - node.currentScale) * lerpFactor;
                node.currentOpacity += (node.targetOpacity - node.currentOpacity) * lerpFactor;

                // DOM Updates
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

    // 4. ZOOM RESET EFFECT (Kept as is)
    useEffect(() => {
        if (anchor.mode === 'IMAGE' && containerRef.current && zoomRef.current) {
             d3.select(containerRef.current).transition().duration(750).ease(d3.easeCubicOut).call(zoomRef.current.transform, d3.zoomIdentity);
        }
    }, [anchor.mode, anchor.id]);

    // 5. INTERACTION (Kept as is)
    const handleNodeClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (anchor.id === id && anchor.mode === 'IMAGE') setIsDetailOpen(true);
        else { onAnchorChange({ mode: 'IMAGE', id }); setIsDetailOpen(false); }
    };
    const handleMouseEnter = (node: SimNode) => { hoveredNodeIdRef.current = node.id; const el = nodeRefs.current.get(node.id); if (el) el.style.zIndex = '2000'; };
    const handleMouseLeave = (node: SimNode) => { hoveredNodeIdRef.current = null; const el = nodeRefs.current.get(node.id); if (el) { if (node.id === anchor.id) el.style.zIndex = '2000'; else el.style.zIndex = Math.floor(node.currentScale * 100).toString(); } };
    const activeNode = useMemo(() => simNodes.find(n => n.id === anchor.id), [simNodes, anchor]);

    // 6. RENDER
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
            {!isDetailOpen && !isGalleryOpen && (
                <div className="absolute top-8 left-8 z-[70] animate-in fade-in slide-in-from-top-4 duration-700">
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
                        // Strict Rendering Check
                        if (!node.isVisible && node.currentOpacity <= 0.05) return null;
                        
                        const isHero = anchor.mode === 'IMAGE' && node.id === anchor.id;
                        
                        // Determine if we should show the Esoteric Sprite or the full Image
                        // 1. Initial Grid (NONE): Use Sprites
                        // 2. Image Mode Satellite (IMAGE & !Hero): Use Sprites
                        // 3. Other modes (TAG, COLOR, etc) and Hero Image: Use Full Images
                        const isEsotericSprite = anchor.mode === 'NONE' || (anchor.mode === 'IMAGE' && !isHero);
                        
                        // Dynamic Sizing based on Context
                        let sizeClasses = 'w-48';
                        if (isEsotericSprite) {
                            // If Grid mode (NONE), use larger sprites for visibility
                            if (anchor.mode === 'NONE') {
                                sizeClasses = 'w-24 h-24';
                            } else {
                                // Satellite sprites remain smaller
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
            
            {/* Initial Guidance Overlay */}
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

            {anchor.mode === 'IMAGE' && activeNode && !isDetailOpen && experienceMode === 'EXPLORE' && (<SatelliteLayer node={activeNode.original} tags={tags} onNavigate={onAnchorChange} />)}
            <HistoryTimeline history={history} images={images} tags={tags} activeMode={experienceMode} nsfwFilterActive={nsfwFilterActive} nsfwTagId={nsfwTagId} />
            {isDetailOpen && activeNode && experienceMode === 'EXPLORE' && (
                <div ref={detailScrollRef} className="fixed inset-0 z-50 bg-zinc-900/95 backdrop-blur-md overflow-y-auto custom-scrollbar" onClick={() => setIsDetailOpen(false)}>
                    <button className="fixed top-6 right-6 text-zinc-500 hover:text-zinc-300 transition-colors z-[60] p-2" onClick={(e) => { e.stopPropagation(); setIsDetailOpen(false); }}><X size={32} /></button>
                    
                    <div className="flex flex-col items-center w-full min-h-screen">
                        <div className="w-full max-w-[1920px] min-h-[78vh] grid grid-cols-[1fr_auto_1fr] md:grid-cols-[minmax(250px,350px)_1fr_minmax(250px,350px)] gap-12 p-12 items-center mx-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="hidden md:flex flex-col items-end gap-16 h-full justify-center">
                                <div className="flex items-center gap-4"><div className="flex flex-col items-end gap-1 text-zinc-400"><button onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'SEASON', id: activeNode.original.inferredSeason }); setIsDetailOpen(false); }} className="text-4xl text-zinc-200 font-bold flex items-center gap-3 font-hand hover:text-amber-300 transition-colors text-right pr-4">{activeNode.original.inferredSeason}{activeNode.original.inferredSeason === 'Summer' ? <Sun size={28} /> : activeNode.original.inferredSeason === 'Winter' ? <Thermometer size={28} /> : <Cloud size={28} />}</button><button onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'DATE', id: activeNode.original.captureTimestamp.toString(), meta: activeNode.original.captureTimestamp }); setIsDetailOpen(false); }} className="text-2xl flex items-center gap-2 font-hand text-zinc-300 hover:text-blue-300 transition-colors text-right pr-4">{new Date(activeNode.original.captureTimestamp).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}</button><span className="text-xl italic opacity-70 font-hand pointer-events-none pr-4">{new Date(activeNode.original.captureTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><ScribbleConnector direction="right" length="60px" /></div>
                                <div className="relative group w-32 h-32 mr-8"><div className="absolute inset-0 bg-white/5 rounded-full blur-xl animate-pulse" /><EsotericSprite node={activeNode} /><span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-lg font-hand text-zinc-500 opacity-60 whitespace-nowrap pr-4">Spectral ID</span></div>
                                <div className="flex items-start gap-4"><div className="flex flex-col items-end gap-4"><h3 className="text-2xl font-hand font-bold text-zinc-500 flex items-center gap-2 flex-row-reverse pr-4"><Palette size={20} /> Palette</h3><div className="flex flex-col gap-3">{activeNode.original.palette.map((color, i) => (<div key={i} className="flex items-center gap-3 group cursor-pointer flex-row-reverse" onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'COLOR', id: color, meta: color }); setIsDetailOpen(false); }}><div className="w-8 h-8 rounded-full border border-white/20 group-hover:scale-110 transition-transform shadow-md" style={{ backgroundColor: color }} /><span className="font-hand text-xl text-zinc-500 group-hover:text-zinc-300 transition-colors pr-4">{color}</span></div>))}</div></div><ScribbleConnector direction="right" length="40px" /></div>
                            </div>
                            <div className="flex items-center justify-center h-full relative group"><div className="relative bg-white p-3 rounded-sm shadow-2xl transition-transform duration-500 group-hover:scale-[1.01] cursor-zoom-in rotate-1" onClick={() => setIsGalleryOpen(true)}><img src={activeNode.original.fileUrl} alt="" className="max-h-[65vh] w-auto max-w-[50vw] object-contain bg-zinc-100" /><div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 pointer-events-none"><Maximize2 size={48} className="text-white drop-shadow-md" /></div></div></div>
                            <div className="hidden md:flex flex-col items-start gap-16 h-full justify-center">
                                <div className="flex items-center gap-4"><ScribbleConnector direction="left" length="60px" /><div className="flex flex-col items-start gap-1 text-zinc-400"><button onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'CAMERA', id: activeNode.original.cameraModel }); setIsDetailOpen(false); }} className="text-3xl text-zinc-200 font-bold flex items-center gap-3 font-hand hover:text-emerald-300 transition-colors pr-4"><Camera size={24} className="opacity-70" />{activeNode.original.cameraModel}</button><button onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'LENS', id: activeNode.original.lensModel }); setIsDetailOpen(false); }} className="text-2xl italic opacity-80 font-hand text-zinc-500 ml-1 hover:text-amber-300 transition-colors text-left pr-4">{activeNode.original.lensModel}</button><div className="flex flex-col gap-1 mt-3 ml-2 font-hand text-xl text-zinc-400 opacity-80 pointer-events-none pr-4"><span className="flex items-center gap-2"><Aperture size={16} /> {activeNode.original.aperture}</span><span className="flex items-center gap-2"><Timer size={16} /> {activeNode.original.shutterSpeed}s</span><span className="flex items-center gap-2"><Gauge size={16} /> ISO {activeNode.original.iso}</span></div></div></div>
                                <div className="flex items-start gap-4 max-h-[60vh]"><ScribbleConnector direction="left" length="40px" /><div className="flex flex-col items-start gap-2 w-full"><h3 className="text-2xl font-hand font-bold text-zinc-500 flex items-center gap-2 mb-2 pr-4"><Hash size={20} /> Concepts</h3><div className="grid grid-cols-2 gap-x-6 gap-y-2 text-left overflow-y-auto max-h-[400px] pr-4 w-full no-scrollbar">{(() => { const allTagIds = Array.from(new Set([...activeNode.original.tagIds, ...(activeNode.original.aiTagIds || [])])); const candidates = allTagIds.map(tid => tags.find(t => t.id === tid)).filter((t): t is Tag => { if (!t) return false; if (t.type === TagType.TECHNICAL || t.type === TagType.SEASONAL) return false; if (t.label.trim().toLowerCase() === 'nsfw') return false; return true; }); const seenLabels = new Set<string>(); const visibleTags: Tag[] = []; candidates.forEach(t => { const key = t.label.toLowerCase().trim(); if (!seenLabels.has(key)) { seenLabels.add(key); visibleTags.push(t); } }); return visibleTags.map(tag => (<button key={tag.id} onClick={(e) => { e.stopPropagation(); onAnchorChange({ mode: 'TAG', id: tag.id, meta: tag }); setIsDetailOpen(false); }} className="font-hand text-xl text-zinc-400 hover:text-zinc-100 hover:scale-105 transition-all duration-200 truncate justify-self-start w-full text-left pr-4" title={tag.label}>{tag.label}</button>)); })()}</div></div></div>
                            </div>
                        </div>

                        {history.length > 1 && (
                            <div className="w-full relative pb-32" onClick={(e) => e.stopPropagation()}>
                                 <div className="flex flex-col items-center justify-center pt-2 pb-4 opacity-40">
                                    <ArrowDown className="text-zinc-500" size={32} strokeWidth={1.5} />
                                    <span className="font-hand text-zinc-500 text-2xl mt-2">History Trail</span>
                                 </div>
                                 <HistoryStream history={history.slice(1)} images={images} tags={tags} nsfwFilterActive={nsfwFilterActive} nsfwTagId={nsfwTagId} currentHero={activeNode.original} />
                            </div>
                        )}
                    </div>
                </div>
            )}
            {isGalleryOpen && activeNode && experienceMode === 'EXPLORE' && (<div className="fixed inset-0 z-[60] bg-black flex items-center justify-center animate-in fade-in duration-500 cursor-zoom-out" onClick={() => setIsGalleryOpen(false)}><img src={activeNode.original.fileUrl} alt="" className="max-w-full max-h-full object-contain p-4 shadow-2xl" /><div className="absolute top-6 right-6 text-white/60 text-2xl font-hand bg-white/10 px-6 py-2 rounded-full backdrop-blur-md pointer-events-none">Click to Close</div></div>)}
        </div>
    );
};

export default Experience;