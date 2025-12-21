
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { ImageNode, Tag, TagType, SimulationNodeDatum, ViewMode, ExperienceMode, AnchorState, ExperienceContext } from '../types';
import { X, Camera, Activity, Maximize2, Calendar, Aperture, Info, Hash, Palette, Sparkles, MoveDown, ArrowDown, Clock, Sun, Cloud, Thermometer, MapPin, Gauge, Timer, Layers, Snowflake } from 'lucide-react';

interface ExperienceProps {
    images: ImageNode[];
    tags: Tag[];
    anchor: AnchorState;
    history: AnchorState[];
    experienceMode: ExperienceMode;
    onAnchorChange: (anchor: AnchorState) => void;
    onContextUpdate: (ctx: ExperienceContext) => void;
    onViewChange: (mode: ViewMode) => void;
    nsfwFilterActive: boolean;
}

// --- Procedural Sprite Component ---

const EsotericSprite: React.FC<{ node: SimNode }> = ({ node }) => {
    const palette = node.original.palette;
    const tagCount = (node.original.tagIds?.length || 0) + (node.original.aiTagIds?.length || 0);
    
    // Use the node id to generate deterministic "randomness"
    const hash = (str: string) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
        return Math.abs(h);
    };
    const seed = hash(node.id);
    
    return (
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md overflow-visible">
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
};

// --- Procedural Hand-Drawn Arrow Component ---

const GreasePencilArrow: React.FC<{ seed: number, className?: string }> = ({ seed, className }) => {
    // Deterministic random function
    const rng = (offset: number) => {
        const x = Math.sin(seed + offset) * 10000;
        return x - Math.floor(x);
    };

    // Randomized Properties
    const tilt = (rng(1) - 0.5) * 20; // -10 to 10 degrees tilt
    const curveX = (rng(2) - 0.5) * 15; // Curvature of the shaft
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
                {/* Shaft - Pointing UP (from bottom 60 to top 4) */}
                <path d={`M16,60 Q${16 + curveX},32 ${16 + shaftWiggle},4`} />
                
                {/* Arrowhead Left */}
                <path d={`M${16 + shaftWiggle},4 l-${Math.sin(headLeftAngle * Math.PI / 180) * headLeftLen},${Math.cos(headLeftAngle * Math.PI / 180) * headLeftLen}`} />
                
                {/* Arrowhead Right */}
                <path d={`M${16 + shaftWiggle},4 l${Math.sin(headRightAngle * Math.PI / 180) * headRightLen},${Math.cos(headRightAngle * Math.PI / 180) * headRightLen}`} />
            </g>
        </svg>
    );
};

// --- Scribble Line for Details ---
const ScribbleConnector: React.FC<{ direction: 'left' | 'right', width?: string }> = ({ direction, width = "100px" }) => (
    <div className={`flex items-center ${direction === 'left' ? 'flex-row-reverse' : 'flex-row'} opacity-50 text-zinc-500`}>
        <div className="h-px bg-current w-4" />
        <svg width="40" height="10" viewBox="0 0 40 10" className="overflow-visible" fill="none" stroke="currentColor" strokeWidth="1">
            <path d={direction === 'right' ? "M0,5 Q20,0 40,5" : "M40,5 Q20,10 0,5"} />
            <circle cx={direction === 'right' ? "40" : "0"} cy="5" r="1.5" fill="currentColor" />
        </svg>
    </div>
);

// --- Types ---

interface SimNode extends SimulationNodeDatum {
    id: string;
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
}

// --- Utilities ---

const hexToRgbVals = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [220, 220, 220];
}

const hexToRgb = (hex: string) => {
    const [r, g, b] = hexToRgbVals(hex);
    return { r, g, b };
}

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
    // 1. Common Tags
    const tagsA = new Set([...imgA.tagIds, ...(imgA.aiTagIds||[])]);
    const tagsB = new Set([...imgB.tagIds, ...(imgB.aiTagIds||[])]);
    const commonTagIds = [...tagsA].filter(x => tagsB.has(x));
    const commonTags = commonTagIds.map(id => allTags.find(t => t.id === id)).filter(Boolean) as Tag[];

    // 2. Color Similarity (Pairs of similar colors)
    const colorMatches: {cA: string, cB: string}[] = [];
    const usedB = new Set<string>();
    imgA.palette.forEach(cA => {
        let bestMatch = null;
        let minDist = 3000; // Tolerance
        imgB.palette.forEach(cB => {
            if (usedB.has(cB)) return;
            const dist = getColorDistSq(cA, cB);
            if (dist < minDist) {
                minDist = dist;
                bestMatch = cB;
            }
        });
        if (bestMatch) {
            colorMatches.push({ cA, cB: bestMatch });
            usedB.add(bestMatch);
        }
    });

    // 3. Technical & Temporal
    const techMatches: string[] = [];
    if (imgA.cameraModel === imgB.cameraModel && imgA.cameraModel !== 'Unknown Camera') techMatches.push(imgA.cameraModel);
    if (imgA.iso === imgB.iso) techMatches.push(`ISO ${imgA.iso}`);
    if (imgA.inferredSeason === imgB.inferredSeason) techMatches.push(imgA.inferredSeason);
    
    // Day match?
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
    return Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1]) 
        .slice(0, count)
        .map(entry => entry[0]);
};

const getRelatedTagsFromNodes = (
    nodes: SimNode[], 
    tags: Tag[], 
    count: number = 6, 
    excludeTagId?: string, 
    nsfwTagId?: string,
    nsfwFilterActive: boolean = false
): Tag[] => {
    const tagCounts: Record<string, number> = {};
    
    nodes.forEach(node => {
        // Collect BOTH User and AI tags
        const allTags = [...node.original.tagIds, ...(node.original.aiTagIds || [])];
        allTags.forEach(tId => {
            if (tId === excludeTagId) return;
            // Always filter "nsfw" from suggestions
            const t = tags.find(tag => tag.id === tId);
            if (!t) return;
            
            // STRICT FILTER: Only show AI Tags in navigation
            if (t.type !== TagType.AI_GENERATED) return;
            if (t.label.toLowerCase().trim() === 'nsfw') return;
            
            tagCounts[tId] = (tagCounts[tId] || 0) + 1;
        });
    });
    
    return Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([id]) => tags.find(t => t.id === id))
        .filter((t): t is Tag => {
            if (!t) return false;
            if (nsfwFilterActive && t.label.trim().toLowerCase() === 'nsfw') return false;
            return true;
        });
};

// --- ANNOTATION HELPERS ---

const getAnnotationLayout = (id: string) => {
    // Deterministic variability based on image ID hash
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    // Determine which side gets which data
    const dateSide = hash % 2 === 0 ? 'left' : 'right';
    const techSide = dateSide === 'left' ? 'right' : 'left';
    
    // Slight tilt for the image card
    const tilt = (hash % 5) - 2; // -2deg to 2deg
    
    // Vertical offset for the annotations so they aren't perfectly aligned
    const verticalOffset = (hash % 40) - 20; // -20px to 20px
    
    // Line style variability
    const isCurved = hash % 3 === 0;
    
    return { dateSide, techSide, tilt, verticalOffset, isCurved, seed: hash };
};

const Annotation: React.FC<{
    side: 'left' | 'right';
    children: React.ReactNode;
    verticalOffset?: number;
    isCurved?: boolean;
    compact?: boolean;
}> = ({ side, children, verticalOffset = 0, isCurved = false, compact = false }) => {
    const isLeft = side === 'left';
    
    // Base position relative to the center image container
    const widthClass = compact ? 'w-32 md:w-40' : 'w-48 md:w-64';
    const offsetClass = isLeft 
        ? (compact ? 'right-full mr-4 md:mr-6 text-right' : 'right-full mr-8 md:mr-12 text-right')
        : (compact ? 'left-full ml-4 md:ml-6 text-left' : 'left-full ml-8 md:ml-12 text-left');

    return (
        <div 
            className={`absolute top-1/2 ${widthClass} ${offsetClass}`}
            style={{ 
                marginTop: `${verticalOffset}px`,
                transform: 'translateY(-50%)'
            }}
        >
            <div className={`relative font-hand text-zinc-600 ${compact ? 'text-sm md:text-base' : 'text-lg md:text-xl'} leading-snug`}>
                {/* Connecting Line (SVG) */}
                <svg 
                    className={`
                        absolute top-1/2 text-zinc-400 pointer-events-none opacity-60
                        ${isLeft ? '-right-8 translate-x-2' : '-left-8 -translate-x-2'}
                        ${compact ? 'w-8 h-4' : 'w-12 h-8'}
                    `}
                    style={{ transform: `translateY(-50%) ${isLeft ? '' : 'scaleX(-1)'}` }}
                    viewBox="0 0 48 32"
                    overflow="visible"
                >
                    {isCurved ? (
                        <path d="M0,16 Q24,4 48,16" fill="none" stroke="currentColor" strokeWidth={compact ? 1 : 1.5} strokeLinecap="round" />
                    ) : (
                        <line x1="0" y1="16" x2="48" y2="16" stroke="currentColor" strokeWidth={compact ? 1 : 1.5} strokeLinecap="round" />
                    )}
                    <circle cx="48" cy="16" r={compact ? 1.5 : 2.5} fill="currentColor" />
                </svg>

                {children}
            </div>
        </div>
    );
};


// --- HISTORY SUB-COMPONENT ---

const HistoryTimeline: React.FC<{ 
    history: AnchorState[]; 
    images: ImageNode[]; 
    tags: Tag[];
    activeMode: ExperienceMode;
    nsfwFilterActive: boolean;
    nsfwTagId?: string;
}> = ({ history, images, tags, activeMode, nsfwFilterActive, nsfwTagId }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to top when re-entering History view
    useEffect(() => {
        if (activeMode === 'HISTORY' && scrollRef.current) {
            scrollRef.current.scrollTo({ top: 0, behavior: 'instant' });
        }
    }, [activeMode]);
    
    // Auto-scroll to top (rapidly) when leaving History view (before unmount visually completes)
    useEffect(() => {
        if (activeMode === 'EXPLORE' && scrollRef.current) {
            scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [activeMode]);

    return (
        <div 
            ref={scrollRef}
            className={`
                absolute inset-0 z-40 bg-zinc-900/95 backdrop-blur-md overflow-y-auto 
                snap-y snap-mandatory scroll-smooth no-scrollbar transition-opacity duration-500
                ${activeMode === 'HISTORY' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
            `}
        >
            <div className="flex flex-col items-center min-h-full py-20 relative">
                {/* Central Timeline Thread (Faint line behind) */}
                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-zinc-800 to-transparent" />
                
                {history.map((step, index) => {
                    const isFirst = index === 0;
                    const prevStep = history[index + 1]; 
                    
                    const isDirectLink = step.mode === 'IMAGE' && prevStep?.mode === 'IMAGE';

                    // --- FILTERING LOGIC ---
                    if (step.mode === 'IMAGE' && nsfwFilterActive) {
                        const img = images.find(i => i.id === step.id);
                        if (img) {
                            // Check via ID and Label for safety
                            const hasNsfwTag = [...img.tagIds, ...(img.aiTagIds || [])].some(tid => {
                                if (tid === nsfwTagId) return true;
                                const t = tags.find(tag => tag.id === tid);
                                return t && t.label.trim().toLowerCase() === 'nsfw';
                            });
                            if (hasNsfwTag) return null; // Omit NSFW steps
                        }
                    }
                    
                    // Always hide explicit NSFW tag steps AND Manual tags
                    if (step.mode === 'TAG') {
                        if (step.meta?.label?.toLowerCase() === 'nsfw') return null;
                        // Hide manual tags from history stream to keep it clean
                        if (step.meta?.type === TagType.CATEGORICAL || step.meta?.type === TagType.QUALITATIVE) return null;
                    }

                    return (
                        <div key={index} className="w-full max-w-4xl flex flex-col items-center snap-center shrink-0 py-24 relative group perspective-1000">
                            
                            {/* Organic Connection Arrow (Pointing UP towards newest state) */}
                            {!isFirst && !isDirectLink && (
                                <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-0 flex flex-col items-center pointer-events-none opacity-50">
                                    <GreasePencilArrow 
                                        seed={index * 123} 
                                        className="text-zinc-500 w-8 h-16 drop-shadow-sm" 
                                    />
                                </div>
                            )}

                            {/* --- NODE VISUALIZATION --- */}
                            
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
                                            {/* --- PHOTOGRAPHER'S NOTES (Desktop Only) --- */}
                                            <div className="hidden md:block">
                                                <Annotation side={techSide as 'left' | 'right'} verticalOffset={-20} isCurved={isCurved}>
                                                    <div className="flex flex-col gap-1 text-zinc-400">
                                                        <span className="text-2xl text-zinc-300 font-bold flex items-center gap-2 justify-end flex-row-reverse">
                                                            {img.cameraModel} 
                                                            <Camera size={20} strokeWidth={2} className="opacity-70" />
                                                        </span>
                                                        <span className="text-xl italic opacity-80">{img.lensModel}</span>
                                                        <div className="flex items-center gap-3 justify-end mt-2 text-lg opacity-60">
                                                            <span>ISO {img.iso}</span>
                                                            <span>•</span>
                                                            <span>{img.aperture}</span>
                                                            <span>•</span>
                                                            <span>{img.shutterSpeed}s</span>
                                                        </div>
                                                    </div>
                                                </Annotation>

                                                <Annotation side={dateSide as 'left' | 'right'} verticalOffset={40} isCurved={!isCurved}>
                                                    <div className="flex flex-col gap-1 text-zinc-400">
                                                        <span className="text-3xl text-zinc-200 font-bold flex items-center gap-2">
                                                            {seasonStr}
                                                            {seasonStr === 'Summer' ? <Sun size={24} /> : seasonStr === 'Winter' ? <Thermometer size={24} /> : <Cloud size={24} />}
                                                        </span>
                                                        <span className="text-xl flex items-center gap-2">
                                                            <Calendar size={18} /> {dateStr}
                                                        </span>
                                                        <span className="text-xl flex items-center gap-2 italic opacity-70">
                                                            <Clock size={18} /> {timeStr}
                                                        </span>
                                                    </div>
                                                </Annotation>
                                            </div>

                                            {/* --- IMAGE CARD --- */}
                                            <div 
                                                className="bg-white p-3 rounded-sm shadow-2xl transition-transform duration-700 max-w-[80vw] md:max-w-[400px] relative z-20 group-hover:scale-[1.01]"
                                                style={{ transform: `rotate(${tilt}deg)` }}
                                            >
                                                <img src={img.fileUrl} alt="" className="w-full h-auto object-contain bg-zinc-100" />
                                                <div className="md:hidden mt-3 pt-3 border-t border-dashed border-zinc-200 font-hand text-zinc-600 text-lg flex justify-between items-start">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold">{dateStr}</span>
                                                        <span className="text-sm opacity-70">{timeStr}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end text-sm">
                                                        <span>{img.cameraModel}</span>
                                                        <span className="opacity-70">{img.aperture}, ISO{img.iso}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* --- NAVIGATION LINK (INTERMEDIATE NODE) --- */}
                                        {isDirectLink && (() => {
                                            const prevImg = images.find(i => i.id === prevStep.id);
                                            if (!prevImg) return null;
                                            const { commonTags, colorMatches, techMatches } = getIntersectionAttributes(img, prevImg, tags);
                                            
                                            if(commonTags.length === 0 && colorMatches.length === 0 && techMatches.length === 0) return (
                                                <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-0 flex flex-col items-center pointer-events-none opacity-50">
                                                    <GreasePencilArrow seed={index * 99} className="text-zinc-500 w-8 h-16" />
                                                </div>
                                            );

                                            return (
                                                <div className="relative flex flex-col items-center animate-in fade-in zoom-in duration-700 delay-300">
                                                    <div className="w-20 h-20 rounded-full border border-white/10 bg-zinc-800/50 backdrop-blur-sm p-2 flex items-center justify-center relative z-20 shadow-[0_0_30px_rgba(139,92,246,0.1)]">
                                                        <EsotericSprite node={{
                                                            id: img.id,
                                                            original: img,
                                                            x: 0, y: 0,
                                                            currentScale: 1, targetScale: 1,
                                                            currentOpacity: 1, targetOpacity: 1,
                                                            relevanceScore: 100, isVisible: true
                                                        }} />
                                                    </div>
                                                    <div className="hidden md:block">
                                                        <Annotation side="left" compact verticalOffset={0} isCurved={true}>
                                                            <div className="flex flex-col gap-2 items-end">
                                                                {colorMatches.slice(0, 3).map((pair, idx) => (
                                                                    <div key={idx} className="flex items-center gap-2">
                                                                        <span className="text-xs font-mono opacity-50 uppercase">{pair.cA}</span>
                                                                        <div className="flex -space-x-1">
                                                                            <div className="w-3 h-3 rounded-full border border-white/20" style={{backgroundColor: pair.cA}} />
                                                                            <div className="w-3 h-3 rounded-full border border-white/20" style={{backgroundColor: pair.cB}} />
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {techMatches.length > 0 && (
                                                                    <div className="mt-1 text-right">
                                                                        {techMatches.map((t, idx) => (
                                                                            <span key={idx} className="block text-zinc-400 text-sm">{t}</span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </Annotation>
                                                    </div>
                                                    <div className="hidden md:block">
                                                        <Annotation side="right" compact verticalOffset={0} isCurved={false}>
                                                            <div className="flex flex-col gap-1 items-start text-zinc-400">
                                                                {commonTags.slice(0, 4).map((tag, idx) => (
                                                                    <div key={tag.id} className="flex items-center gap-2">
                                                                        <Hash size={12} className="opacity-50" />
                                                                        <span>{tag.label}</span>
                                                                    </div>
                                                                ))}
                                                                {commonTags.length > 4 && <span className="text-xs opacity-50 italic">+{commonTags.length - 4} more...</span>}
                                                            </div>
                                                        </Annotation>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                );
                            })()}

                            {step.mode === 'TAG' && (
                                <div className="relative z-10 flex flex-col items-center py-12">
                                    <div className="relative">
                                        <div className="hidden md:block">
                                            <Annotation side="right" verticalOffset={0} isCurved>
                                                <div className="flex flex-col gap-1 text-zinc-400">
                                                    <span className="text-xl font-bold text-zinc-300">Semantic Focus</span>
                                                    <span className="text-sm opacity-70">Classification</span>
                                                </div>
                                            </Annotation>
                                        </div>
                                        <div className="relative cursor-default">
                                            <div className="absolute inset-0 bg-zinc-500/10 blur-xl rounded-full" />
                                            <div className="relative bg-zinc-900/90 backdrop-blur-md border border-zinc-700 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10">
                                                <Hash size={20} className="text-zinc-400" />
                                                <span className="text-3xl font-hand text-white tracking-wide">{step.meta?.label}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Tag Filter</span>
                                </div>
                            )}

                            {step.mode === 'COLOR' && (() => {
                                const rgb = hexToRgbVals(step.id);
                                return (
                                    <div className="relative z-10 flex flex-col items-center py-12">
                                        <div className="relative">
                                            <div className="hidden md:block">
                                                <Annotation side="left" verticalOffset={0} isCurved>
                                                    <div className="flex flex-col gap-1 items-end text-zinc-400">
                                                        <span className="text-xl font-bold text-zinc-200 font-mono">{step.id}</span>
                                                        <span className="text-sm opacity-60 font-mono">R{rgb[0]} G{rgb[1]} B{rgb[2]}</span>
                                                        <span className="text-xs italic opacity-40 mt-1 font-hand">Dominant wavelength</span>
                                                    </div>
                                                </Annotation>
                                            </div>
                                            <div className="relative cursor-default">
                                                <div className="absolute inset-0 blur-2xl opacity-40 rounded-full" style={{ backgroundColor: step.id }} />
                                                <div className="w-32 h-32 rounded-[2rem] border-4 border-white/10 shadow-2xl relative z-10 flex items-center justify-center overflow-hidden rotate-3" style={{ backgroundColor: step.id }}>
                                                    <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent pointer-events-none" />
                                                    <div className="absolute inset-0 bg-gradient-to-bl from-white/20 to-transparent pointer-events-none" />
                                                    <Palette size={24} className="text-white mix-blend-overlay opacity-50" />
                                                </div>
                                            </div>
                                        </div>
                                         <span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Color Filter</span>
                                    </div>
                                );
                            })()}

                            {step.mode === 'DATE' && (
                                <div className="relative z-10 flex flex-col items-center py-12">
                                    <div className="relative">
                                        <div className="hidden md:block">
                                            <Annotation side="right" verticalOffset={0} isCurved>
                                                <div className="flex flex-col gap-1 text-zinc-400">
                                                    <span className="text-xl font-bold text-zinc-300">Temporal Pivot</span>
                                                    <span className="text-sm opacity-70">30-day Window</span>
                                                </div>
                                            </Annotation>
                                        </div>
                                        <div className="relative cursor-default">
                                            <div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full" />
                                            <div className="relative bg-zinc-900/90 backdrop-blur-md border border-blue-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10">
                                                <Calendar size={20} className="text-blue-400" />
                                                <span className="text-3xl font-hand text-white tracking-wide">
                                                    {new Date(parseInt(step.id)).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Date Filter</span>
                                </div>
                            )}

                            {step.mode === 'SEASON' && (
                                <div className="relative z-10 flex flex-col items-center py-12">
                                    <div className="relative">
                                        <div className="hidden md:block">
                                            <Annotation side="left" verticalOffset={0} isCurved>
                                                <div className="flex flex-col gap-1 items-end text-zinc-400">
                                                    <span className="text-xl font-bold text-zinc-300">Cyclical Time</span>
                                                    <span className="text-sm opacity-70">Seasonal Grid</span>
                                                </div>
                                            </Annotation>
                                        </div>
                                        <div className="relative cursor-default">
                                            <div className="absolute inset-0 bg-amber-500/10 blur-xl rounded-full" />
                                            <div className="relative bg-zinc-900/90 backdrop-blur-md border border-amber-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10">
                                                {step.id === 'Winter' ? <Snowflake size={24} className="text-cyan-200" /> : 
                                                 step.id === 'Summer' ? <Sun size={24} className="text-amber-400" /> : 
                                                 <Cloud size={24} className="text-zinc-400" />}
                                                <span className="text-3xl font-hand text-white tracking-wide">{step.id}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Seasonal Filter</span>
                                </div>
                            )}

                            {step.mode === 'CAMERA' && (
                                <div className="relative z-10 flex flex-col items-center py-12">
                                    <div className="relative">
                                        <div className="hidden md:block">
                                            <Annotation side="left" verticalOffset={0} isCurved>
                                                <div className="flex flex-col gap-1 items-end text-zinc-400">
                                                    <span className="text-xl font-bold text-zinc-300">Mechanical Eye</span>
                                                    <span className="text-sm opacity-70">Equipment Match</span>
                                                </div>
                                            </Annotation>
                                        </div>
                                        <div className="relative cursor-default">
                                            <div className="absolute inset-0 bg-emerald-500/10 blur-xl rounded-full" />
                                            <div className="relative bg-zinc-900/90 backdrop-blur-md border border-emerald-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10">
                                                <Camera size={20} className="text-emerald-400" />
                                                <span className="text-3xl font-hand text-white tracking-wide">{step.id}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Camera Filter</span>
                                </div>
                            )}

                            {step.mode === 'LENS' && (
                                <div className="relative z-10 flex flex-col items-center py-12">
                                    <div className="relative">
                                        <div className="hidden md:block">
                                            <Annotation side="right" verticalOffset={0} isCurved>
                                                <div className="flex flex-col gap-1 text-zinc-400">
                                                    <span className="text-xl font-bold text-zinc-300">Glass Signature</span>
                                                    <span className="text-sm opacity-70">Optic Match</span>
                                                </div>
                                            </Annotation>
                                        </div>
                                        <div className="relative cursor-default">
                                            <div className="absolute inset-0 bg-amber-500/10 blur-xl rounded-full" />
                                            <div className="relative bg-zinc-900/90 backdrop-blur-md border border-amber-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10">
                                                <Aperture size={20} className="text-amber-400" />
                                                <span className="text-2xl font-hand text-white tracking-wide">{step.id}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Lens Filter</span>
                                </div>
                            )}

                        </div>
                    );
                })}

                {/* End of History */}
                <div className="mt-20 flex flex-col items-center gap-3 opacity-30">
                    <div className="w-2 h-2 bg-zinc-600 rounded-full" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Session Origin</span>
                </div>
            </div>
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
    nsfwFilterActive
}) => {
    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const hoveredNodeIdRef = useRef<string | null>(null);
    const zoomRef = useRef<d3.ZoomBehavior<HTMLDivElement, unknown> | null>(null);
    
    // State
    const [simNodes, setSimNodes] = useState<SimNode[]>([]);
    
    // UI State for Modal
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    
    // Derived Data State (Internal for calculation, then reported up)
    const [commonTags, setCommonTags] = useState<Tag[]>([]);
    const [activePalette, setActivePalette] = useState<string[]>([]);

    const getTagById = useCallback((id: string) => tags.find(t => t.id === id), [tags]);

    // Identify NSFW tag (memoized)
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

    // 1. SCORING & RELATIONSHIP ENGINE
    useEffect(() => {
        let newCommonTags = new Set<string>();
        let calculatedPalette: string[] = [];
        let calculatedTags: Tag[] = [];

        // --- A. Scoring Nodes ---
        const scoredNodes = simNodes.map(node => {
             // FILTER CHECK: Omit node if NSFW filter is active
             if (nsfwFilterActive) {
                 const allNodeTagIds = [...node.original.tagIds, ...(node.original.aiTagIds || [])];
                 const isNsfw = allNodeTagIds.some(tid => {
                     if (tid === nsfwTagId) return true;
                     const t = getTagById(tid);
                     return t && t.label.trim().toLowerCase() === 'nsfw';
                 });
                 
                 if (isNsfw) {
                     return { ...node, relevanceScore: -9999, isVisible: false }; // Effectively hidden
                 }
             }

             let score = 0;
             
             if (anchor.mode === 'IMAGE') {
                 if (node.id === anchor.id) score = 10000; // Hero is king
                 else {
                     const anchorImg = images.find(i => i.id === anchor.id);
                     if (anchorImg) {
                         const anchorTags = [...anchorImg.tagIds, ...(anchorImg.aiTagIds || [])];
                         const targetTags = [...node.original.tagIds, ...(node.original.aiTagIds || [])];
                         
                         const anchorIsMono = isMonochrome(tags, anchorTags);
                         const targetIsMono = isMonochrome(tags, targetTags);
                         
                         const colorDist = getMinPaletteDistance(anchorImg.palette, node.original.palette);
                         const sameDate = node.original.shootDayClusterId === anchorImg.shootDayClusterId;
                         
                         // Tag Overlap Calculation
                         const sharedTags = targetTags.filter(t => anchorTags.includes(t));
                         let sharedAICount = 0;
                         
                         sharedTags.forEach(tid => {
                             const t = getTagById(tid);
                             if (t) {
                                 if (t.type === TagType.AI_GENERATED) {
                                     score += 20;
                                     sharedAICount++;
                                 }
                                 else if (t.type === TagType.QUALITATIVE) score += 25; 
                                 else if (t.type === TagType.CATEGORICAL) score += 20;
                                 else if (t.type === TagType.TECHNICAL) score += 5;
                                 else score += 2;
                             }
                         });

                         // --- STRICT COLOR & B&W LOGIC ---

                         if (anchorIsMono) {
                             if (sameDate) score += 500; 
                             if (sharedAICount >= 2) score += 100; 
                             score += 50; 
                         } 
                         else {
                             if (targetIsMono) {
                                 score += 50; 
                                 if (sameDate) score += 200;
                                 if (sharedAICount >= 2) score += 100;
                             } 
                             else {
                                 if (colorDist < 2500) score += 100; 
                                 else if (colorDist < 5000) score += 50; 
                                 else if (colorDist < 8000) score += 10; 
                                 else if (colorDist > 8000) score -= 2000; 
                                 else score -= 100; 
                             }
                         }

                         if (node.original.cameraModel === anchorImg.cameraModel && node.original.cameraModel !== 'Unknown Camera') score += 10;
                         if (node.original.lensModel === anchorImg.lensModel && node.original.lensModel !== 'Unknown Lens') score += 15;
                     }
                 }
             } else if (anchor.mode === 'TAG') {
                 const hasTag = node.original.tagIds.includes(anchor.id) || (node.original.aiTagIds && node.original.aiTagIds.includes(anchor.id));
                 if (hasTag) score = 100;
             } else if (anchor.mode === 'COLOR') {
                 const minD = node.original.palette.reduce((min, c) => Math.min(min, getColorDistSq(c, anchor.id)), Infinity);
                 if (minD < 1500) score = 100;
             } else if (anchor.mode === 'DATE') {
                 // Date clustering: +/- 30 days around selected date
                 const anchorTime = parseInt(anchor.id);
                 const diff = Math.abs(node.original.captureTimestamp - anchorTime);
                 const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
                 
                 if (diff < thirtyDaysMs) {
                     // Score higher the closer it is
                     score = 100 - (diff / thirtyDaysMs) * 50; 
                 } else {
                     score = 0;
                 }
             } else if (anchor.mode === 'CAMERA') {
                 if (node.original.cameraModel === anchor.id) score = 100;
                 else score = 0;
             } else if (anchor.mode === 'LENS') {
                 if (node.original.lensModel === anchor.id) score = 100;
                 else score = 0;
             } else if (anchor.mode === 'SEASON') {
                 if (node.original.inferredSeason === anchor.id) score = 100;
                 else score = 0;
             }

             return { ...node, relevanceScore: score };
        });

        // --- B. Determine Visibility & Context ---
        
        const visibleSubset: SimNode[] = [];

        if (anchor.mode === 'IMAGE') {
            // Only consider nodes that weren't forcefully hidden by NSFW filter
            const neighbors = scoredNodes.filter(n => n.id !== anchor.id && n.relevanceScore > -5000);
            neighbors.sort((a, b) => b.relevanceScore - a.relevanceScore);
            
            const RELEVANCE_THRESHOLD = 50; 
            const strongMatchCount = neighbors.filter(n => n.relevanceScore >= RELEVANCE_THRESHOLD).length;
            const visibleCount = Math.max(5, Math.min(18, strongMatchCount));
            const visibleNeighborIds = new Set(neighbors.slice(0, visibleCount).map(n => n.id));
            
            scoredNodes.forEach(n => {
                // Keep filter hidden nodes hidden
                if (n.relevanceScore <= -5000) {
                    n.isVisible = false;
                    return;
                }

                const isAnchor = n.id === anchor.id;
                const isNeighbor = visibleNeighborIds.has(n.id);
                const shouldBeVisible = isAnchor || (isNeighbor && n.relevanceScore > -500);
                const wasVisible = n.isVisible;

                if (shouldBeVisible) {
                    n.isVisible = true;
                    if (!wasVisible) {
                        const cx = window.innerWidth / 2;
                        const cy = window.innerHeight / 2;
                        const theta = Math.random() * Math.PI * 2;
                        const R = 600 + Math.random() * 200; 
                        n.x = cx + R * Math.cos(theta);
                        n.y = cy + R * Math.sin(theta);
                        n.vx = (cx - n.x) * 0.01; 
                        n.vy = (cy - n.y) * 0.01;
                    }
                    visibleSubset.push(n);
                } else {
                    n.isVisible = false;
                }
            });

            const anchorImg = images.find(i => i.id === anchor.id);
            calculatedPalette = anchorImg ? anchorImg.palette : [];
            calculatedTags = getRelatedTagsFromNodes(visibleSubset, tags, 6, undefined, nsfwTagId, nsfwFilterActive);

        } else if (['TAG', 'COLOR', 'DATE', 'CAMERA', 'LENS', 'SEASON'].includes(anchor.mode)) {
             // General clustering modes
             scoredNodes.forEach(n => {
                 if (n.relevanceScore <= -5000) { n.isVisible = false; return; }
                 n.isVisible = n.relevanceScore > 0;
                 if (n.isVisible) visibleSubset.push(n);
             });
             
             // Recalculate context based on subset
             if (anchor.mode === 'TAG') {
                 calculatedTags = getRelatedTagsFromNodes(visibleSubset, tags, 5, anchor.id, nsfwTagId, nsfwFilterActive);
                 calculatedPalette = [];
             } else if (anchor.mode === 'COLOR') {
                 const adjacent = getDominantColorsFromNodes(visibleSubset, 5, anchor.id);
                 calculatedPalette = [anchor.id, ...adjacent].slice(0, 5);
                 calculatedTags = [];
             } else {
                 calculatedTags = getRelatedTagsFromNodes(visibleSubset, tags, 5, undefined, nsfwTagId, nsfwFilterActive);
                 calculatedPalette = getDominantColorsFromNodes(visibleSubset, 5);
             }

        } else {
            scoredNodes.forEach(n => {
                if (n.relevanceScore <= -5000) { n.isVisible = false; return; }
                n.isVisible = true;
            });
            calculatedPalette = [];
            calculatedTags = [];
        }
        
        setSimNodes(scoredNodes);
        setActivePalette(calculatedPalette);
        setCommonTags(calculatedTags);

    }, [anchor, images, getTagById, nsfwFilterActive, nsfwTagId]); // Depend on filter state

    // Report context changes to parent
    useEffect(() => {
        onContextUpdate({
            commonTags,
            activePalette
        });
    }, [commonTags, activePalette]);

    // 2. INITIALIZATION
    useEffect(() => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        setSimNodes((prev: SimNode[]) => {
            // Fix: Add explicit generic type to Map to avoid unknown inference
            const existingMap = new Map<string, SimNode>(prev.map(n => [n.id, n]));
            return images.map((img, idx) => {
                const existing = existingMap.get(img.id);
                const orbitSpeed = 0.05 + (Math.random() * 0.1); 
                const orbitOffset = Math.random() * Math.PI * 2; 
                const orbitRadiusBase = 250 + (Math.random() * 100); 

                const goldenAngle = Math.PI * (3 - Math.sqrt(5));
                const SPREAD_FACTOR = 45; 
                const initR = SPREAD_FACTOR * Math.sqrt(idx); 
                const initTheta = idx * goldenAngle;
                const startX = centerX + initR * Math.cos(initTheta);
                const startY = centerY + initR * Math.sin(initTheta);

                // Initial NSFW check to prevent flash of content
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
                    x: existing ? existing.x : startX, 
                    y: existing ? existing.y : startY,
                    vx: existing?.vx || 0,
                    vy: existing?.vy || 0,
                    currentScale: existing ? existing.currentScale : 0,
                    targetScale: 0.4,
                    currentOpacity: existing ? existing.currentOpacity : 0,
                    targetOpacity: 0.8,
                    relevanceScore: 0,
                    isVisible, // Apply initial visibility
                    orbitSpeed,
                    orbitOffset,
                    orbitRadiusBase
                };
            });
        });
    }, [images, nsfwFilterActive]); // Re-run when filter active changes to update initial state

    // 3. PHYSICS LOOP
    useEffect(() => {
        if (!containerRef.current || simNodes.length === 0) return;
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

        let activeNodes: SimNode[] = [];
        if (anchor.mode !== 'NONE') {
            activeNodes = simNodes
                .filter(n => n.isVisible && n.id !== anchor.id)
                .sort((a, b) => a.original.captureTimestamp - b.original.captureTimestamp);
        }

        const maxScaleByHeight = (height * 0.6) / 288;
        const heroScale = Math.min(Math.max(maxScaleByHeight, 1.2), 1.8); 
        const heroWidth = 192 * heroScale;
        const heroHeight = heroWidth * 1.5;
        const heroRadius = Math.sqrt(heroWidth ** 2 + heroHeight ** 2) / 2;

        const simulation = d3.forceSimulation<SimNode>(simNodes)
            .alphaTarget(anchor.mode === 'NONE' ? 0 : 0.05) 
            .velocityDecay(anchor.mode === 'NONE' ? 0.2 : 0.3) 
            .force("charge", d3.forceManyBody<SimNode>().strength((d) => {
                if (!d.isVisible) return 0;
                if (anchor.mode === 'NONE') return -50; 
                if (d.id === anchor.id) return -1500; 
                if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') return -30;
                return -200; 
            }))
            .force("collide", d3.forceCollide<SimNode>().radius((d) => {
                 if (!d.isVisible) return 0;
                 if (anchor.mode === 'IMAGE') {
                     if (d.id === anchor.id) return heroRadius * 0.95; 
                     return 45; // Esoteric radius
                 }
                 if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') return 30;
                 return 55; 
            }).strength(0.8)); 

        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const HOME_SPREAD = 45; 

        simulation.on("tick", () => {
            const cx = width / 2;
            const cy = height / 2;
            const time = Date.now() / 1000;
            const lerpFactor = 0.1; 

            simNodes.forEach((node, i) => {
                const isAnchor = anchor.mode === 'IMAGE' && node.id === anchor.id;

                if (node.isVisible && !isAnchor && anchor.mode !== 'NONE' && !['TAG', 'COLOR', 'SEASON', 'DATE', 'CAMERA', 'LENS'].includes(anchor.mode)) {
                     const floatSpeed = 0.5;
                     const floatAmp = 0.05; 
                     node.vx = (node.vx || 0) + Math.sin(time * floatSpeed + i) * floatAmp;
                     node.vy = (node.vy || 0) + Math.cos(time * floatSpeed * 0.8 + i) * floatAmp;
                }

                if (anchor.mode === 'NONE') {
                    if (node.isVisible) {
                        node.targetScale = 0.4;
                        node.targetOpacity = 0.8;
                        const r = HOME_SPREAD * Math.sqrt(i); 
                        const theta = i * goldenAngle;
                        const homeX = cx + r * Math.cos(theta);
                        const homeY = cy + r * Math.sin(theta);
                        const pull = 0.05;
                        node.vx = (node.vx || 0) + (homeX - node.x) * pull;
                        node.vy = (node.vy || 0) + (homeY - node.y) * pull;
                    } else {
                        // Ensure hidden nodes fade out in 'Explore' mode too
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
                        const gravity = 0.005; 
                        node.vx = (node.vx || 0) + (cx - node.x) * gravity;
                        node.vy = (node.vy || 0) + (targetY - node.y) * gravity;
                        const dx = node.x - cx;
                        const dy = node.y - targetY;
                        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                        const swirlSpeed = 0.2; 
                        node.vx += (-dy / dist) * swirlSpeed;
                        node.vy += (dx / dist) * swirlSpeed;
                        
                        // ESOTERIC SCALE LOGIC
                        node.targetScale = node.relevanceScore > 40 ? 0.8 : 0.6;
                        
                        node.targetOpacity = 1.0; 
                    } 
                    else {
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                        const dx = node.x - cx;
                        const dy = node.y - cy;
                        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                        if (dist < 1500) {
                             node.vx = (node.vx || 0) + (dx/dist) * 5;
                             node.vy = (node.vy || 0) + (dy/dist) * 5;
                        } else {
                            node.vx = 0;
                            node.vy = 0;
                        }
                    }
                }
                else if (['TAG', 'COLOR', 'DATE', 'CAMERA', 'LENS', 'SEASON'].includes(anchor.mode)) {
                    if (node.isVisible) {
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
                        const dx = node.x - cx;
                        const dy = node.y - cy;
                        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                        node.vx = (node.vx || 0) + (dx/dist) * 3;
                        node.vy = (node.vy || 0) + (dy/dist) * 3;
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
                             el.style.boxShadow = 'none'; // No shadow for sprites
                         }
                    } else {
                         el.style.zIndex = Math.floor(node.currentScale * 100).toString();
                         el.style.filter = 'none';
                         el.style.boxShadow = 'none';
                    }
                }
            });
        });

        return () => {
            simulation.stop();
        };
    }, [simNodes, anchor, activePalette]); 

    // 4. ZOOM RESET EFFECT
    useEffect(() => {
        if (anchor.mode === 'IMAGE' && containerRef.current && zoomRef.current) {
             d3.select(containerRef.current)
                .transition()
                .duration(750)
                .ease(d3.easeCubicOut)
                .call(zoomRef.current.transform, d3.zoomIdentity);
        }
    }, [anchor.mode, anchor.id]);

    // 5. INTERACTION
    const handleNodeClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (anchor.id === id && anchor.mode === 'IMAGE') {
            setIsDetailOpen(true);
        } else {
            onAnchorChange({ mode: 'IMAGE', id });
            setIsDetailOpen(false); 
        }
    };
    
    const handleMouseEnter = (node: SimNode) => {
        hoveredNodeIdRef.current = node.id;
        const el = nodeRefs.current.get(node.id);
        if (el) el.style.zIndex = '2000'; 
    };

    const handleMouseLeave = (node: SimNode) => {
        hoveredNodeIdRef.current = null;
        const el = nodeRefs.current.get(node.id);
        if (el) {
            if (node.id === anchor.id) el.style.zIndex = '2000';
            else el.style.zIndex = Math.floor(node.currentScale * 100).toString();
        }
    };

    const activeNode = useMemo(() => simNodes.find(n => n.id === anchor.id), [simNodes, anchor]);

    // 6. RENDER
    return (
        <div className="relative w-full h-full bg-[#faf9f6] overflow-hidden font-mono select-none">
            
            {/* Ambient Background Layer */}
            <div 
                className="absolute inset-0 pointer-events-none transition-all duration-1000 ease-in-out"
                style={{
                    background: anchor.mode !== 'NONE' && activePalette.length > 0
                        ? `radial-gradient(circle at 50% 30%, ${activePalette[0]}1A, transparent 70%), 
                           radial-gradient(circle at 85% 85%, ${activePalette[1] || activePalette[0]}15, transparent 60%),
                           radial-gradient(circle at 15% 75%, ${activePalette[2] || activePalette[0]}10, transparent 60%)`
                        : '#faf9f6'
                }}
            />

            {/* Film Grain Texture */}
            <div 
                className="absolute inset-0 opacity-[0.03] pointer-events-none z-0 mix-blend-multiply"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
            />

            {/* 3D World */}
            <div ref={containerRef} className="absolute inset-0 top-0 cursor-move active:cursor-grabbing z-10 pb-0">
                <div ref={worldRef} className="absolute inset-0 origin-top-left will-change-transform">
                    {simNodes.map(node => {
                        const isHero = anchor.mode === 'IMAGE' && node.id === anchor.id;
                        // ESOTERIC LOGIC: Only show sprites if an anchor is selected and this is NOT the hero.
                        const isEsotericSprite = anchor.mode === 'IMAGE' && !isHero;
                        
                        return (
                            <div
                                key={node.id}
                                ref={(el) => {
                                    if (el) nodeRefs.current.set(node.id, el);
                                    else nodeRefs.current.delete(node.id);
                                }}
                                className="absolute top-0 left-0 w-0 h-0"
                                style={{ willChange: 'transform, opacity, filter' }}
                            >
                                <div 
                                    onClick={(e) => handleNodeClick(node.id, e)}
                                    onMouseEnter={() => handleMouseEnter(node)}
                                    onMouseLeave={() => handleMouseLeave(node)}
                                    className={`absolute -translate-x-1/2 -translate-y-1/2 ${isEsotericSprite ? 'w-24 h-24' : 'w-48'} transition-all duration-300 cursor-pointer ${isHero ? '' : 'hover:scale-105'}`}
                                >
                                    {isEsotericSprite ? (
                                        <EsotericSprite node={node} />
                                    ) : (
                                        <img 
                                            src={node.original.fileUrl} 
                                            alt="" 
                                            className={`w-full h-auto rounded-md pointer-events-none bg-white transition-all duration-500 ${isHero ? 'ring-4 ring-white/50' : 'ring-1 ring-black/5'}`}
                                            loading="lazy"
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --- HISTORY TIMELINE VIEW (OVERLAY) --- */}
            <HistoryTimeline 
                history={history} 
                images={images} 
                tags={tags} 
                activeMode={experienceMode}
                nsfwFilterActive={nsfwFilterActive}
                nsfwTagId={nsfwTagId}
            />

            {/* --- DETAILED CONTEXTUAL MODAL (Explore Mode Overlay) --- */}
            {isDetailOpen && activeNode && experienceMode === 'EXPLORE' && (
                <div 
                    className="fixed inset-0 z-50 bg-zinc-900/95 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in duration-300 overflow-hidden"
                    onClick={() => setIsDetailOpen(false)}
                >
                    {/* Close Button - Floating Fixed */}
                    <button 
                        className="absolute top-6 right-6 text-zinc-500 hover:text-zinc-300 transition-colors z-50 p-2"
                        onClick={(e) => { e.stopPropagation(); setIsDetailOpen(false); }}
                    >
                        <X size={32} />
                    </button>

                    <div 
                        className="w-full h-full max-w-[1920px] grid grid-cols-[1fr_auto_1fr] md:grid-cols-[minmax(250px,350px)_1fr_minmax(250px,350px)] gap-12 p-12 items-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* LEFT COLUMN: Context & Semantics */}
                        <div className="hidden md:flex flex-col items-end gap-16 h-full justify-center">
                            
                            {/* Date & Time */}
                            <div className="flex items-center gap-4">
                                <div className="flex flex-col items-end gap-1 text-zinc-400">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAnchorChange({ 
                                                mode: 'SEASON', 
                                                id: activeNode.original.inferredSeason 
                                            });
                                            setIsDetailOpen(false);
                                        }}
                                        className="text-4xl text-zinc-200 font-bold flex items-center gap-3 font-hand hover:text-amber-300 transition-colors text-right"
                                    >
                                        {activeNode.original.inferredSeason}
                                        {activeNode.original.inferredSeason === 'Summer' ? <Sun size={28} /> : activeNode.original.inferredSeason === 'Winter' ? <Thermometer size={28} /> : <Cloud size={28} />}
                                    </button>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAnchorChange({ 
                                                mode: 'DATE', 
                                                id: activeNode.original.captureTimestamp.toString(), 
                                                meta: activeNode.original.captureTimestamp 
                                            });
                                            setIsDetailOpen(false);
                                        }}
                                        className="text-2xl flex items-center gap-2 font-hand text-zinc-300 hover:text-blue-300 transition-colors text-right"
                                    >
                                        {new Date(activeNode.original.captureTimestamp).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </button>
                                    <span className="text-xl italic opacity-70 font-hand pointer-events-none">
                                        {new Date(activeNode.original.captureTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <ScribbleConnector direction="right" width="60px" />
                            </div>

                            {/* Esoteric Sprite (Visual Anchor) */}
                            <div className="relative group w-32 h-32 mr-8">
                                <div className="absolute inset-0 bg-white/5 rounded-full blur-xl animate-pulse" />
                                <EsotericSprite node={activeNode} />
                                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-lg font-hand text-zinc-500 opacity-60 whitespace-nowrap">
                                    Spectral ID
                                </span>
                            </div>

                            {/* Semantic Tags */}
                            <div className="flex items-start gap-4">
                                <div className="flex flex-col items-end gap-2">
                                    <h3 className="text-2xl font-hand font-bold text-zinc-500 flex items-center gap-2 mb-2">
                                        <Hash size={20} /> Concepts
                                    </h3>
                                    <div className="flex flex-col items-end gap-1 text-right">
                                        {[...activeNode.original.tagIds, ...(activeNode.original.aiTagIds || [])].slice(0, 12).map(tid => {
                                            const tag = tags.find(t => t.id === tid);
                                            if (!tag) return null;
                                            
                                            // STRICT FILTER: Only show AI Generated Tags
                                            if (tag.type !== TagType.AI_GENERATED) return null;
                                            if (tag.label.trim().toLowerCase() === 'nsfw') return null;
                                            
                                            return (
                                                <button
                                                    key={tid}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onAnchorChange({ mode: 'TAG', id: tag.id, meta: tag });
                                                        setIsDetailOpen(false);
                                                    }}
                                                    className="font-hand text-xl text-zinc-400 hover:text-zinc-100 hover:scale-105 transition-all duration-200"
                                                >
                                                    {tag.label}
                                                </button>
                                            );
                                        })}
                                        {[...activeNode.original.tagIds, ...(activeNode.original.aiTagIds || [])].length > 12 && (
                                            <span className="font-hand text-zinc-600 text-lg">...and more</span>
                                        )}
                                    </div>
                                </div>
                                <ScribbleConnector direction="right" width="40px" />
                            </div>
                        </div>

                        {/* CENTER COLUMN: Hero Image */}
                        <div className="flex items-center justify-center h-full relative group">
                            <div 
                                className="relative bg-white p-3 rounded-sm shadow-2xl transition-transform duration-500 group-hover:scale-[1.01] cursor-zoom-in rotate-1"
                                onClick={() => setIsGalleryOpen(true)}
                            >
                                <img 
                                    src={activeNode.original.fileUrl} 
                                    alt="" 
                                    className="max-h-[85vh] w-auto max-w-[50vw] object-contain bg-zinc-100" 
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 pointer-events-none">
                                    <Maximize2 size={48} className="text-white drop-shadow-md" />
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Tech & Colors */}
                        <div className="hidden md:flex flex-col items-start gap-16 h-full justify-center">
                            
                            {/* Tech Specs */}
                            <div className="flex items-center gap-4">
                                <ScribbleConnector direction="left" width="60px" />
                                <div className="flex flex-col items-start gap-1 text-zinc-400">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAnchorChange({ mode: 'CAMERA', id: activeNode.original.cameraModel });
                                            setIsDetailOpen(false);
                                        }}
                                        className="text-3xl text-zinc-200 font-bold flex items-center gap-3 font-hand hover:text-emerald-300 transition-colors"
                                    >
                                        <Camera size={24} className="opacity-70" />
                                        {activeNode.original.cameraModel} 
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onAnchorChange({ mode: 'LENS', id: activeNode.original.lensModel });
                                            setIsDetailOpen(false);
                                        }}
                                        className="text-2xl italic opacity-80 font-hand text-zinc-500 ml-1 hover:text-amber-300 transition-colors text-left"
                                    >
                                        {activeNode.original.lensModel}
                                    </button>
                                    <div className="flex flex-col gap-1 mt-3 ml-2 font-hand text-xl text-zinc-400 opacity-80 pointer-events-none">
                                        <span className="flex items-center gap-2"><Aperture size={16} /> {activeNode.original.aperture}</span>
                                        <span className="flex items-center gap-2"><Timer size={16} /> {activeNode.original.shutterSpeed}s</span>
                                        <span className="flex items-center gap-2"><Gauge size={16} /> ISO {activeNode.original.iso}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Chromatic DNA */}
                            <div className="flex items-start gap-4">
                                <ScribbleConnector direction="left" width="40px" />
                                <div className="flex flex-col items-start gap-4">
                                    <h3 className="text-2xl font-hand font-bold text-zinc-500 flex items-center gap-2">
                                        <Palette size={20} /> Palette
                                    </h3>
                                    <div className="flex flex-col gap-3">
                                        {activeNode.original.palette.map((color, i) => (
                                            <div key={i} className="flex items-center gap-3 group cursor-pointer"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onAnchorChange({ mode: 'COLOR', id: color, meta: color });
                                                    setIsDetailOpen(false);
                                                }}
                                            >
                                                <div 
                                                    className="w-8 h-8 rounded-full border border-white/20 group-hover:scale-110 transition-transform shadow-md"
                                                    style={{ backgroundColor: color }}
                                                />
                                                <span className="font-hand text-xl text-zinc-500 group-hover:text-zinc-300 transition-colors">
                                                    {color}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {/* --- FULL SCREEN GALLERY (Only in Explore Mode) --- */}
            {isGalleryOpen && activeNode && experienceMode === 'EXPLORE' && (
                <div 
                    className="fixed inset-0 z-[60] bg-black flex items-center justify-center animate-in fade-in duration-500 cursor-zoom-out"
                    onClick={() => setIsGalleryOpen(false)}
                >
                    <img 
                        src={activeNode.original.fileUrl} 
                        alt="" 
                        className="max-w-full max-h-full object-contain p-4 shadow-2xl"
                    />
                    <div className="absolute top-6 right-6 text-white/50 text-sm font-medium bg-white/10 px-4 py-2 rounded-full backdrop-blur-md">
                        Press ESC or Click to Close
                    </div>
                </div>
            )}
        </div>
    );
};

export default Experience;
