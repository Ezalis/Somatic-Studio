import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ImageNode, Tag } from '../types';
import { getThumbnailUrl, getPreviewUrl } from '../services/immichService';

// --- Types ---

type FlowPhase = 'idle' | 'blooming' | 'hero' | 'exploring';

interface ScoredImage {
    image: ImageNode;
    score: number;
    sharedTags: string[];
    sharedCamera: boolean;
    sharedLens: boolean;
    sharedSeason: boolean;
    isBridge: boolean;
    isTemporalNeighbor: boolean;
}

interface TrailPoint {
    id: string;
    palette: string[];
    label: string;
    timestamp: number;
}

interface AlbumImage {
    image: ImageNode;
    tagHits: number;
    isTemporal: boolean;
}

// --- Helpers ---

function seededRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    return ((hash & 0x7fffffff) % 1000) / 1000;
}

function scoreRelevance(image: ImageNode, anchor: ImageNode): ScoredImage {
    if (image.id === anchor.id) return { image, score: 1, sharedTags: [], sharedCamera: false, sharedLens: false, sharedSeason: false, isBridge: false, isTemporalNeighbor: false };
    let score = 0;

    const daysDiff = Math.abs(image.captureTimestamp - anchor.captureTimestamp) / 86400000;
    const isTemporalNeighbor = image.shootDayClusterId === anchor.shootDayClusterId || daysDiff < 7;
    if (image.shootDayClusterId === anchor.shootDayClusterId) score += 0.4;
    else if (daysDiff < 30) score += 0.1 * (1 - daysDiff / 30);

    const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
    const sharedTags = [...new Set([...image.tagIds, ...(image.aiTagIds || [])])].filter(t => anchorTags.has(t));
    score += Math.min(sharedTags.length * 0.12, 0.4);

    const sharedCamera = image.cameraModel === anchor.cameraModel && anchor.cameraModel !== 'Unknown Camera';
    const sharedLens = image.lensModel === anchor.lensModel && anchor.lensModel !== 'Unknown Lens';
    const sharedSeason = image.inferredSeason === anchor.inferredSeason;
    if (sharedCamera) score += 0.05;
    if (sharedLens) score += 0.05;
    if (sharedSeason) score += 0.05;

    const totalTags = new Set([...image.tagIds, ...(image.aiTagIds || [])]).size;
    const isBridge = sharedTags.length === 1 && totalTags > 2 && score < 0.35;

    return { image, score: Math.min(score, 1), sharedTags, sharedCamera, sharedLens, sharedSeason, isBridge, isTemporalNeighbor };
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function colorDist(a: string, b: string): number {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
const COLOR_THRESHOLD = 80;

// --- Mini Sprite ---

const MiniSprite: React.FC<{
    image: ImageNode;
    size: number;
    convergence?: number;
    blooming?: boolean;
    onBloomComplete?: () => void;
}> = React.memo(({ image, size, convergence, blooming, onBloomComplete }) => {
    useEffect(() => {
        if (blooming && onBloomComplete) {
            const timer = setTimeout(onBloomComplete, 900);
            return () => clearTimeout(timer);
        }
    }, [blooming, onBloomComplete]);

    const palette = image.palette.length > 0 ? image.palette : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];
    const seed = (() => {
        let h = 0;
        for (let i = 0; i < image.id.length; i++) h = ((h << 5) - h) + image.id.charCodeAt(i) | 0;
        return Math.abs(h);
    })();
    const ringOpacity = convergence != null ? 0.2 + convergence * 0.4 : 0;

    return (
        <svg viewBox="0 0 100 100" width={size} height={size} className="overflow-visible" shapeRendering="geometricPrecision">
            {palette.slice(1, 4).map((color: string, i: number) => {
                const angle = (seed + i * 73) % 360;
                const dist = 8 + (seed % 12);
                const rx = 18 + ((seed + i) % 14);
                const ry = 18 + ((seed * (i + 1)) % 14);
                const tx = 50 + dist * Math.cos(angle * Math.PI / 180);
                const ty = 50 + dist * Math.sin(angle * Math.PI / 180);

                // Bloom: scatter outward along natural angle
                const bloomDx = blooming ? Math.cos(angle * Math.PI / 180) * 60 : 0;
                const bloomDy = blooming ? Math.sin(angle * Math.PI / 180) * 60 : 0;
                const bloomScale = blooming ? 3 : 1;
                const bloomOpacity = blooming ? 0 : 0.55;
                const delay = i * 100;

                return (
                    <ellipse key={i} cx={tx} cy={ty} rx={rx} ry={ry} fill={color} fillOpacity={bloomOpacity}
                        transform={`rotate(${(seed * (i + 1)) % 360}, ${tx}, ${ty})`}
                        style={{
                            transform: `translate(${bloomDx}px, ${bloomDy}px) scale(${bloomScale})`,
                            transformOrigin: `${tx}px ${ty}px`,
                            transition: `all 600ms cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms`,
                            fillOpacity: bloomOpacity,
                        }} />
                );
            })}
            <circle cx="50" cy="50" r={16} fill={palette[0]}
                style={{
                    opacity: blooming ? 0 : 0.85,
                    transform: blooming ? 'scale(4)' : 'scale(1)',
                    transformOrigin: '50px 50px',
                    transition: 'all 600ms cubic-bezier(0.4, 0, 0.2, 1) 300ms',
                }} />
            {convergence != null && !blooming && (
                <circle cx="50" cy="50" r={22} fill="none" stroke={palette[0]}
                    strokeWidth={convergence > 0.5 ? 1.2 : 0.8}
                    strokeDasharray={convergence < 0.3 ? '3,3' : 'none'} opacity={ringOpacity} />
            )}
        </svg>
    );
});

// --- Bloom Overlay ---
// Always the same bloom scatter from viewport center.
// Sprite moves from clicked position to center, blooms apart, hero fades in once loaded.

const BloomOverlay: React.FC<{
    image: ImageNode;
    sourceRect: DOMRect;
    onComplete: () => void;
}> = ({ image, sourceRect, onComplete }) => {
    const [phase, setPhase] = useState<'start' | 'centering' | 'blooming' | 'hero'>('start');
    const [heroLoaded, setHeroLoaded] = useState(false);

    // Preload hero image immediately on mount
    useEffect(() => {
        const img = new Image();
        img.onload = () => setHeroLoaded(true);
        img.src = getPreviewUrl(image.id);
    }, [image.id]);

    // start → centering (next frame, so CSS sees initial position first)
    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            requestAnimationFrame(() => setPhase('centering'));
        });
        return () => cancelAnimationFrame(raf);
    }, []);

    // centering → blooming (after sprite arrives at center)
    useEffect(() => {
        if (phase === 'centering') {
            const timer = setTimeout(() => setPhase('blooming'), 450);
            return () => clearTimeout(timer);
        }
    }, [phase]);

    // blooming → hero (after bloom scatter completes)
    useEffect(() => {
        if (phase === 'blooming') {
            const timer = setTimeout(() => setPhase('hero'), 900);
            return () => clearTimeout(timer);
        }
    }, [phase]);

    // hero → complete (once hero image is loaded and visible)
    useEffect(() => {
        if (phase === 'hero' && heroLoaded) {
            const timer = setTimeout(onComplete, 500);
            return () => clearTimeout(timer);
        }
    }, [phase, heroLoaded, onComplete]);

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const palette = image.palette.length > 0 ? image.palette : ['#52525b'];

    // Sprite position: starts at clicked element center, moves to viewport center
    const isAtSource = phase === 'start';
    const spriteSize = isAtSource ? sourceRect.width : 200;
    const cx = isAtSource ? sourceRect.left + sourceRect.width / 2 : vw / 2;
    const cy = isAtSource ? sourceRect.top + sourceRect.height / 2 : vh / 2;

    return (
        <div className="fixed inset-0 z-[100]" style={{
            backgroundColor: phase === 'hero' ? '#faf9f6' : (phase === 'blooming' ? '#faf9f6cc' : 'transparent'),
            transition: 'background-color 500ms ease',
        }}>
            {/* Sprite: moves to center, then blooms apart */}
            <div style={{
                position: 'absolute',
                left: cx - spriteSize / 2,
                top: cy - spriteSize / 2,
                width: spriteSize,
                height: spriteSize,
                transition: 'all 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                opacity: phase === 'hero' ? 0 : 1,
            }}>
                <MiniSprite image={image} size={spriteSize}
                    blooming={phase === 'blooming' || phase === 'hero'} />
            </div>

            {/* Hero image fades in after bloom */}
            {phase === 'hero' && heroLoaded && (
                <div className="absolute inset-0 flex items-center justify-center"
                    style={{ animation: 'album-reveal 500ms ease-out forwards' }}>
                    <img src={getPreviewUrl(image.id)} alt=""
                        className="max-w-[92vw] max-h-[85vh] object-contain rounded-lg"
                        style={{ boxShadow: `0 16px 64px ${palette[0]}30` }}
                        draggable={false} />
                </div>
            )}
        </div>
    );
};

// --- Hero Section ---

const HeroSection: React.FC<{
    image: ImageNode;
    allImages: ImageNode[];
    temporalNeighbors: ScoredImage[];
    flipped: boolean;
    onFlip: () => void;
    onNavigate: (img: ImageNode) => void;
}> = ({ image, allImages, temporalNeighbors, flipped, onFlip, onNavigate }) => {
    const scrollIndicatorRef = useRef<HTMLDivElement>(null);

    // Fade scroll indicator when traits section enters viewport
    useEffect(() => {
        const el = scrollIndicatorRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                // When traits section intersects, the hero section is leaving
                if (entry.isIntersecting) {
                    el.style.opacity = '0';
                } else {
                    el.style.opacity = '1';
                }
            },
            { threshold: 0.1 }
        );
        const traitSection = document.getElementById('trait-section');
        if (traitSection) observer.observe(traitSection);
        return () => observer.disconnect();
    }, []);

    const palette = image.palette.length > 0 ? image.palette : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];

    // Timeline data for back face
    const allTimestamps = useMemo(() => allImages.map(i => i.captureTimestamp).sort((a: number, b: number) => a - b), [allImages]);
    const minTs = allTimestamps[0];
    const maxTs = allTimestamps[allTimestamps.length - 1];
    const range = maxTs - minTs || 1;
    const anchorPos = (image.captureTimestamp - minTs) / range;

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center px-4"
            style={{ perspective: '1200px' }}>
            {/* 3D Card Flip Container */}
            <div
                className="w-full cursor-pointer"
                style={{
                    transformStyle: 'preserve-3d',
                    transition: 'transform 600ms ease-in-out',
                    transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
                onClick={onFlip}
            >
                {/* Front face — Hero image */}
                <div className="flex items-center justify-center w-full"
                    style={{ backfaceVisibility: 'hidden' }}>
                    <div className="w-full max-w-3xl mx-auto">
                        <div className="flex items-center justify-center">
                            <img src={getPreviewUrl(image.id)} alt=""
                                className="max-w-full max-h-[85vh] object-contain rounded-lg"
                                style={{ boxShadow: `0 16px 64px ${palette[0]}30, 0 4px 16px ${palette[1] || palette[0]}15` }}
                                draggable={false} />
                        </div>
                    </div>
                </div>

                {/* Back face — Handwritten details */}
                <div className="absolute inset-0 flex items-start justify-center pt-8"
                    style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        fontFamily: 'Caveat, cursive',
                    }}>
                    <div className="w-full max-w-lg flex flex-col items-center">
                        {/* Sprite identity */}
                        <MiniSprite image={image} size={80} />
                        <span className="text-zinc-400 mt-2 mb-6" style={{ fontSize: 14 }}>
                            Spectral Identity
                        </span>

                        {/* Timeline with hand-drawn annotation */}
                        <div className="w-full max-w-md px-4 mb-8 relative" style={{ height: 64 }}>
                            {/* Hand-drawn date label with line pointing to marker */}
                            <div className="absolute" style={{
                                left: `${anchorPos * 100}%`,
                                top: 0,
                                transform: 'translateX(-50%)',
                            }}>
                                <span className="text-zinc-500 block text-center whitespace-nowrap" style={{ fontSize: 13 }}>
                                    {new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                {/* Hand-drawn line from label to marker */}
                                <svg width="24" height="18" viewBox="0 0 24 18" className="mx-auto" style={{ overflow: 'visible' }}>
                                    <path d="M12 0 C11 6, 13 10, 12 18" stroke="#a1a1aa" strokeWidth="1.2" fill="none"
                                        strokeLinecap="round" strokeDasharray="none" />
                                </svg>
                            </div>
                            {/* Timeline bar — hand-drawn style */}
                            <svg className="absolute w-full" style={{ top: 36, left: 0, height: 28 }} viewBox="0 0 400 28" preserveAspectRatio="none">
                                {/* Hand-drawn baseline */}
                                <path d="M0 14 C20 13.5, 60 14.5, 100 14 C150 13.5, 200 14.5, 250 14 C300 13.5, 350 14.5, 400 14"
                                    stroke="#d4d4d8" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                                {/* Tick marks at year boundaries */}
                                {(() => {
                                    const startYear = new Date(minTs).getFullYear();
                                    const endYear = new Date(maxTs).getFullYear();
                                    const ticks: React.ReactNode[] = [];
                                    for (let y = startYear; y <= endYear; y++) {
                                        const yearTs = new Date(y, 0, 1).getTime();
                                        if (yearTs < minTs || yearTs > maxTs) continue;
                                        const pos = ((yearTs - minTs) / range) * 400;
                                        ticks.push(
                                            <g key={y}>
                                                <line x1={pos} y1={10} x2={pos + (seededRandom(String(y)) - 0.5) * 2} y2={18}
                                                    stroke="#a1a1aa" strokeWidth="1" strokeLinecap="round" />
                                            </g>
                                        );
                                    }
                                    return ticks;
                                })()}
                            </svg>
                            {/* Year labels */}
                            <div className="absolute w-full flex justify-between px-1" style={{ top: 50 }}>
                                <span className="text-zinc-400" style={{ fontSize: 12 }}>
                                    {new Date(minTs).getFullYear()}
                                </span>
                                <span className="text-zinc-400" style={{ fontSize: 12 }}>
                                    {new Date(maxTs).getFullYear()}
                                </span>
                            </div>
                            {/* Anchor marker — hand-drawn filled dot */}
                            <svg className="absolute" style={{
                                left: `calc(${anchorPos * 100}% - 6px)`,
                                top: 36 + 8,
                                width: 12, height: 12,
                            }}>
                                <circle cx="6" cy="6" r="5" fill="#3f3f46" stroke="#3f3f46" strokeWidth="0.5" />
                            </svg>
                        </div>

                        {/* Technical details — handwritten */}
                        <div className="space-y-0.5 text-center mb-6">
                            {image.cameraModel !== 'Unknown Camera' && (
                                <p className="text-zinc-500" style={{ fontSize: 16 }}>{image.cameraModel}</p>
                            )}
                            {image.lensModel !== 'Unknown Lens' && (
                                <p className="text-zinc-500" style={{ fontSize: 16 }}>{image.lensModel}</p>
                            )}
                            <p className="text-zinc-400" style={{ fontSize: 15 }}>
                                {[
                                    image.iso ? `ISO ${image.iso}` : null,
                                    image.aperture ? `f/${image.aperture}` : null,
                                ].filter(Boolean).join(' · ')}
                            </p>
                            {image.inferredSeason && (
                                <p className="text-zinc-400 italic" style={{ fontSize: 16 }}>{image.inferredSeason}</p>
                            )}
                        </div>

                        {/* Temporal neighbor thumbnails — 3 per row, max 3 rows */}
                        {temporalNeighbors.length > 0 && (
                            <div className="mt-4 w-full max-w-sm">
                                <span className="text-zinc-400 block text-center mb-3" style={{ fontSize: 15 }}>
                                    Same period ({temporalNeighbors.length})
                                </span>
                                <div className="grid grid-cols-3 gap-2 justify-items-center">
                                    {temporalNeighbors.slice(0, 9).map((s: ScoredImage) => (
                                        <div key={s.image.id}
                                            className="rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform w-full aspect-square"
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onNavigate(s.image); }}>
                                            <img src={getThumbnailUrl(s.image.id)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <span className="text-zinc-400 mt-8" style={{ fontSize: 14 }}>
                            tap to flip back
                        </span>
                    </div>
                </div>
            </div>

            {/* Scroll indicator */}
            <div ref={scrollIndicatorRef} className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 transition-opacity duration-500">
                <span className="text-zinc-400 text-base" style={{ fontFamily: 'Caveat, cursive', animation: 'scroll-hint-bounce 2s ease-in-out infinite' }}>
                    scroll to explore
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                    className="text-zinc-400" style={{ animation: 'scroll-hint-bounce 2s ease-in-out infinite' }}>
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </div>
        </div>
    );
};

// --- Trait Selector ---

const TraitSelector: React.FC<{
    image: ImageNode;
    scored: ScoredImage[];
    tagMap: Map<string, string>;
    selectedTraits: Set<string>;
    onToggleTrait: (key: string) => void;
    albumImages: AlbumImage[];
}> = ({ image, scored, tagMap, selectedTraits, onToggleTrait, albumImages }) => {
    const palette = image.palette.length > 0 ? image.palette : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];
    const anchorTagIds = [...new Set([...image.tagIds, ...(image.aiTagIds || [])])];
    const anchorTagSet = new Set(anchorTagIds);
    const [pulsing, setPulsing] = useState(false);
    const prevCount = useRef(selectedTraits.size);

    // Pulse counter on increment
    useEffect(() => {
        if (selectedTraits.size > prevCount.current) {
            setPulsing(true);
            const t = setTimeout(() => setPulsing(false), 300);
            prevCount.current = selectedTraits.size;
            return () => clearTimeout(t);
        }
        prevCount.current = selectedTraits.size;
    }, [selectedTraits.size]);

    // Discovery tags from top 30 scored neighbors
    const discoveryTags = useMemo((): { tagId: string; count: number; relevance: number }[] => {
        const tagCounts = new Map<string, number>();
        const hasFilters = selectedTraits.size > 0;
        const excludeTags = new Set(anchorTagSet);
        // Also exclude already-selected tag traits
        for (const key of selectedTraits) {
            if (key.startsWith('tag:')) excludeTags.add(key.slice(4));
        }

        const sourceImages = hasFilters && albumImages.length > 0
            ? albumImages.map((a: AlbumImage) => a.image)
            : scored.slice(0, 30).map((s: ScoredImage) => s.image);

        for (const img of sourceImages) {
            const imgTags = [...new Set([...img.tagIds, ...(img.aiTagIds || [])])];
            for (const tagId of imgTags) {
                if (!excludeTags.has(tagId)) {
                    tagCounts.set(tagId, (tagCounts.get(tagId) || 0) + 1);
                }
            }
        }

        const limit = hasFilters ? 20 + selectedTraits.size * 3 : 15;
        const sorted = [...tagCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
        const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

        return sorted.map(([tagId, count]) => ({
            tagId,
            count,
            relevance: count / maxCount,
        }));
    }, [scored, anchorTagSet, selectedTraits, albumImages]);

    const traitCount = selectedTraits.size;
    const maxTraits = 6;
    const isFull = traitCount >= maxTraits;

    // When full: compact row of just the 6 selected traits
    if (isFull) {
        // Collect selected items in order: colors first, then tags
        const selectedColors = palette.slice(0, 5).filter(c => selectedTraits.has(`color:${c}`));
        const selectedTagIds = [...selectedTraits]
            .filter(k => k.startsWith('tag:'))
            .map(k => k.slice(4));

        return (
            <div className="px-6 py-4 max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[11px] tracking-[0.2em] uppercase text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Your traits
                    </h2>
                    <div className="flex gap-1">
                        {Array.from({ length: maxTraits }).map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-zinc-700" style={{ border: '1.5px solid #3f3f46' }} />
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {selectedColors.map((color: string, i: number) => (
                        <button key={`c${i}`} onClick={() => onToggleTrait(`color:${color}`)}
                            className="rounded-full cursor-pointer flex-shrink-0"
                            style={{
                                backgroundColor: color,
                                width: 28, height: 28,
                                outline: '2px solid rgba(0,0,0,0.25)',
                                outlineOffset: 2,
                            }} />
                    ))}
                    {selectedTagIds.map((tagId: string) => {
                        const label = tagMap.get(tagId) || tagId;
                        return (
                            <button key={tagId} onClick={() => onToggleTrait(`tag:${tagId}`)}
                                className="px-3 py-1 rounded-full text-[11px] cursor-pointer"
                                style={{
                                    fontFamily: 'Inter, sans-serif',
                                    backgroundColor: 'rgba(0,0,0,0.12)',
                                    color: '#18181b',
                                    outline: '1.5px solid rgba(0,0,0,0.25)',
                                    fontWeight: 600,
                                }}>
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="px-6 py-8 max-w-2xl mx-auto">
            {/* Header + counter */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-[11px] tracking-[0.2em] uppercase text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Choose your traits
                </h2>
                <div className="flex items-center gap-2"
                    style={{ animation: pulsing ? 'trait-pulse 300ms ease' : 'none' }}>
                    <span className="text-[10px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {traitCount} of {maxTraits}
                    </span>
                    <div className="flex gap-1">
                        {Array.from({ length: maxTraits }).map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full transition-all duration-200"
                                style={{
                                    backgroundColor: i < traitCount ? '#3f3f46' : 'transparent',
                                    border: `1.5px solid ${i < traitCount ? '#3f3f46' : '#d4d4d8'}`,
                                }} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Palette row */}
            <div className="mb-5">
                <span className="text-[9px] tracking-[0.15em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Palette
                </span>
                <div className="flex gap-3 py-1">
                    {palette.slice(0, 5).map((color: string, i: number) => {
                        const key = `color:${color}`;
                        const isActive = selectedTraits.has(key);
                        const canSelect = traitCount < maxTraits || isActive;
                        return (
                            <button key={i} onClick={() => canSelect && onToggleTrait(key)}
                                className="rounded-full transition-all duration-200 flex-shrink-0"
                                style={{
                                    backgroundColor: color,
                                    width: isActive ? 32 : 24,
                                    height: isActive ? 32 : 24,
                                    outline: isActive ? '2.5px solid rgba(0,0,0,0.3)' : 'none',
                                    outlineOffset: 2,
                                    opacity: canSelect ? 1 : 0.4,
                                    cursor: canSelect ? 'pointer' : 'default',
                                }} />
                        );
                    })}
                </div>
            </div>

            {/* Image tags */}
            <div className="mb-5">
                <span className="text-[9px] tracking-[0.15em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    This image
                </span>
                <div className="flex flex-wrap gap-2">
                    {anchorTagIds.map((tagId: string) => {
                        const label = tagMap.get(tagId) || tagId;
                        const key = `tag:${tagId}`;
                        const isActive = selectedTraits.has(key);
                        const canSelect = traitCount < maxTraits || isActive;
                        return (
                            <button key={tagId} onClick={() => canSelect && onToggleTrait(key)}
                                className="px-3 py-1 rounded-full text-[11px] transition-all duration-200"
                                style={{
                                    fontFamily: 'Inter, sans-serif',
                                    backgroundColor: isActive ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.04)',
                                    color: isActive ? '#18181b' : '#3f3f46',
                                    outline: isActive ? '1.5px solid rgba(0,0,0,0.25)' : 'none',
                                    fontWeight: isActive ? 600 : 400,
                                    opacity: canSelect ? 1 : 0.4,
                                    cursor: canSelect ? 'pointer' : 'default',
                                }}>
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Discovery tags */}
            {discoveryTags.length > 0 && (
                <div>
                    <span className="text-[9px] tracking-[0.15em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Discover nearby
                    </span>
                    <div className="flex flex-wrap gap-2 items-center">
                        {discoveryTags.map(({ tagId, relevance }) => {
                            const label = tagMap.get(tagId) || tagId;
                            const key = `tag:${tagId}`;
                            const isActive = selectedTraits.has(key);
                            const canSelect = traitCount < maxTraits || isActive;
                            const fontSize = 9 + relevance * 4;
                            const px = 6 + relevance * 4;
                            const py = 2 + relevance * 2;
                            return (
                                <button key={tagId} onClick={() => canSelect && onToggleTrait(key)}
                                    className="rounded-full transition-all duration-200"
                                    style={{
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize,
                                        paddingLeft: px,
                                        paddingRight: px,
                                        paddingTop: py,
                                        paddingBottom: py,
                                        backgroundColor: isActive ? 'rgba(0,0,0,0.12)' : `rgba(0,0,0,${0.01 + relevance * 0.04})`,
                                        color: isActive ? '#18181b' : `rgba(63,63,70,${0.5 + relevance * 0.5})`,
                                        outline: isActive ? '1.5px solid rgba(0,0,0,0.25)' : `1px dashed rgba(0,0,0,${0.08 + relevance * 0.12})`,
                                        fontWeight: isActive ? 600 : relevance > 0.7 ? 500 : 400,
                                        opacity: canSelect ? 1 : 0.4,
                                        cursor: canSelect ? 'pointer' : 'default',
                                    }}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Waterfall Album ---

interface WaterfallNode {
    image: ImageNode;
    tagHits: number;
    relevance: number;
    size: number;
    photoOpacity: number;
    driftDuration: number;
    driftDelay: number;
}

const WaterfallAlbum: React.FC<{
    albumImages: AlbumImage[];
    traitCount: number;
    onSelect: (img: ImageNode, rect: DOMRect) => void;
}> = ({ albumImages, traitCount, onSelect }) => {
    const isPartial = traitCount >= 3 && traitCount < 6;
    const visible = traitCount >= 3;

    const nodes = useMemo((): WaterfallNode[] => {
        if (albumImages.length === 0) return [];
        const maxHits = Math.max(1, ...albumImages.map((a: AlbumImage) => a.tagHits));
        const limit = isPartial ? 8 : albumImages.length;

        return albumImages.slice(0, limit).map((item: AlbumImage) => {
            const relevance = item.tagHits / maxHits;
            // 1 match = small sprite (40px), top matches = large photo (180px)
            const size = item.tagHits <= 1
                ? 40 + seededRandom(item.image.id + 'sz') * 8
                : 60 + relevance * 120;
            // 1 match = always sprite (0), 2+ matches = photo fades in with relevance
            const photoOpacity = item.tagHits <= 1
                ? 0
                : Math.max(0, Math.min(1, (relevance - 0.3) * 1.8));
            const driftDuration = 6 + seededRandom(item.image.id + 'wd') * 8;
            const driftDelay = seededRandom(item.image.id + 'wl') * 4;

            return { image: item.image, tagHits: item.tagHits, relevance, size, photoOpacity, driftDuration, driftDelay };
        });
    }, [albumImages, isPartial]);

    const tiers = useMemo(() => {
        const tierMap = new Map<number, WaterfallNode[]>();
        for (const node of nodes) {
            const tier = node.tagHits;
            if (!tierMap.has(tier)) tierMap.set(tier, []);
            tierMap.get(tier)!.push(node);
        }
        return [...tierMap.entries()]
            .sort((a, b) => b[0] - a[0]);
    }, [nodes]);

    if (!visible) return null;

    const topTierHits = tiers.length > 0 ? tiers[0][0] : 0;

    const handleClick = (img: ImageNode, e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onSelect(img, rect);
    };

    return (
        <div className="px-6 pb-8 max-w-2xl mx-auto"
            style={{ animation: 'album-reveal 600ms ease-out forwards' }}>
            <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] tracking-[0.2em] uppercase text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {isPartial ? 'Album preview' : 'Your album'}
                </span>
                <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {albumImages.length} images{isPartial ? ` · select ${6 - traitCount} more for full album` : ''}
                </span>
            </div>

            {tiers.map(([tierHits, row], rowIdx) => {
                const isTopTier = tierHits === topTierHits && tierHits > 1;

                return (
                    <div key={rowIdx} className="mb-6">
                        {tierHits > 0 && (
                            <div className="mb-2">
                                <span className="text-[8px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                    {tierHits} {tierHits === 1 ? 'match' : 'matches'}
                                </span>
                            </div>
                        )}
                        {/* Top tier: two-column grid of large images */}
                        {isTopTier ? (
                            <div className="grid grid-cols-2 gap-4">
                                {row.map((node: WaterfallNode) => (
                                    <div key={node.image.id}
                                        className="cursor-pointer transition-all duration-500"
                                        onClick={(e) => handleClick(node.image, e)}>
                                        <img src={getPreviewUrl(node.image.id)} alt=""
                                            className="w-full h-auto rounded-lg"
                                            style={{
                                                boxShadow: `0 8px 24px rgba(0,0,0,${0.08 + node.relevance * 0.12})`,
                                            }}
                                            loading="lazy" draggable={false} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-end gap-3">
                                {row.map((node: WaterfallNode) => {
                                    const showPhoto = node.photoOpacity > 0.05;
                                    const xJitter = (seededRandom(node.image.id + 'xj') - 0.5) * 8;
                                    // 2-hit items: sprite fully visible behind photo
                                    const spriteOpacity = node.tagHits === 2 ? 1 : (1 - node.photoOpacity * 0.85);

                                    return (
                                        <div key={node.image.id}
                                            className="cursor-pointer transition-all duration-500 flex-shrink-0"
                                            style={{
                                                width: node.size,
                                                marginLeft: xJitter,
                                                animation: `drift ${node.driftDuration}s ease-in-out ${node.driftDelay}s infinite`,
                                            }}
                                            onClick={(e) => handleClick(node.image, e)}>
                                            {!showPhoto && (
                                                <div className="flex items-center justify-center" style={{ height: node.size }}>
                                                    <MiniSprite image={node.image} size={node.size * 0.9} convergence={node.relevance} />
                                                </div>
                                            )}
                                            {showPhoto && (
                                                <div className="relative">
                                                    <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-700"
                                                        style={{ opacity: spriteOpacity }}>
                                                        <MiniSprite image={node.image} size={node.size * 0.6} convergence={node.relevance} />
                                                    </div>
                                                    <img src={getPreviewUrl(node.image.id)} alt=""
                                                        className="w-full h-auto rounded-lg transition-opacity duration-700"
                                                        style={{
                                                            opacity: node.photoOpacity,
                                                            boxShadow: `0 ${2 + node.relevance * 6}px ${8 + node.relevance * 16}px rgba(0,0,0,${0.05 + node.relevance * 0.12})`,
                                                        }}
                                                        loading="lazy" draggable={false} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

// --- Idle Field ---

const IdleField: React.FC<{
    images: ImageNode[];
    onSelect: (img: ImageNode, rect: DOMRect) => void;
    canvasW: number;
    canvasH: number;
}> = ({ images, onSelect, canvasW, canvasH }) => {
    const nodes = useMemo(() => {
        const count = Math.min(images.length, 36);
        const cols = Math.ceil(Math.sqrt(count * (canvasW / canvasH)));
        const rows = Math.ceil(count / cols);
        const cellW = canvasW / (cols + 1);
        const cellH = canvasH / (rows + 1);
        return images.slice(0, count).map((img: ImageNode, i: number) => ({
            image: img,
            x: cellW * ((i % cols) + 1) + (seededRandom(img.id + 'ix') - 0.5) * cellW * 0.4,
            y: cellH * (Math.floor(i / cols) + 1) + (seededRandom(img.id + 'iy') - 0.5) * cellH * 0.3,
        }));
    }, [images, canvasW, canvasH]);

    return (
        <div className="fixed inset-0">
            {nodes.map(({ image, x, y }) => {
                const size = 56 + seededRandom(image.id + 'sz') * 20;
                const breatheDur = 5 + seededRandom(image.id + 'bd') * 6;
                const breatheDel = seededRandom(image.id + 'bl') * 4;
                return (
                    <div key={image.id}
                        className="absolute cursor-pointer hover:scale-110 transition-transform duration-300"
                        style={{
                            left: x - size / 2, top: y - size / 2,
                            animation: `drift ${breatheDur}s ease-in-out ${breatheDel}s infinite`,
                        }}
                        onClick={(e) => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            onSelect(image, rect);
                        }}>
                        <MiniSprite image={image} size={size} />
                    </div>
                );
            })}
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-40 text-center">
                <p className="text-zinc-400 text-sm" style={{ fontFamily: 'Caveat, cursive' }}>
                    Tap a sprite to begin
                </p>
            </div>
        </div>
    );
};

// --- Main Component ---

interface NavigationPrototypeProps {
    images: ImageNode[];
    tags: Tag[];
    onExit: () => void;
}

const NavigationPrototype: React.FC<NavigationPrototypeProps> = ({ images, tags, onExit }) => {
    const [flowPhase, setFlowPhase] = useState<FlowPhase>('idle');
    const [anchorId, setAnchorId] = useState<string | null>(null);
    const [trail, setTrail] = useState<TrailPoint[]>([]);
    const [selectedTraits, setSelectedTraits] = useState<Set<string>>(new Set());
    const [bloomSourceRect, setBloomSourceRect] = useState<DOMRect | null>(null);
    const [heroFlipped, setHeroFlipped] = useState(false);
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Pending image for bloom transition
    const [pendingImage, setPendingImage] = useState<ImageNode | null>(null);

    useEffect(() => {
        const update = () => {
            if (containerRef.current) {
                setCanvasSize({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight });
            }
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    const tagMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const t of tags) map.set(t.id, t.label);
        return map;
    }, [tags]);

    const anchor = useMemo(() => anchorId ? images.find((i: ImageNode) => i.id === anchorId) ?? null : null, [anchorId, images]);

    const scored = useMemo(() => {
        if (!anchor) return [];
        return images
            .filter((img: ImageNode) => img.id !== anchor.id)
            .map((img: ImageNode) => scoreRelevance(img, anchor))
            .sort((a: ScoredImage, b: ScoredImage) => b.score - a.score);
    }, [anchor, images]);

    const temporalNeighbors = useMemo(() => scored.filter((s: ScoredImage) => s.isTemporalNeighbor).slice(0, 12), [scored]);

    // Album pool derived from selectedTraits
    const albumPool = useMemo((): AlbumImage[] => {
        if (!anchor || selectedTraits.size === 0) {
            return scored.slice(0, 24).map((s: ScoredImage) => ({
                image: s.image,
                tagHits: 0,
                isTemporal: s.isTemporalNeighbor,
            }));
        }

        const tagTraits = new Set<string>();
        const colorTraits = new Set<string>();
        for (const key of selectedTraits) {
            if (key.startsWith('color:')) colorTraits.add(key.slice(6));
            else if (key.startsWith('tag:')) tagTraits.add(key.slice(4));
        }

        const seen = new Map<string, AlbumImage>();
        for (const img of images) {
            if (img.id === anchor.id) continue;
            let hits = 0;
            if (tagTraits.size > 0) {
                const imgTags = new Set([...img.tagIds, ...(img.aiTagIds || [])]);
                for (const tagId of tagTraits) {
                    if (imgTags.has(tagId)) hits++;
                }
            }
            if (colorTraits.size > 0 && img.palette.length > 0) {
                for (const activeHex of colorTraits) {
                    const closest = Math.min(...img.palette.map((c: string) => colorDist(c, activeHex)));
                    if (closest < COLOR_THRESHOLD) hits++;
                }
            }
            if (hits > 0) {
                seen.set(img.id, { image: img, tagHits: hits, isTemporal: false });
            }
        }
        return [...seen.values()].sort((a, b) => b.tagHits - a.tagHits);
    }, [anchor, scored, images, selectedTraits]);

    const surfaceStyle = useMemo((): React.CSSProperties => {
        if (!anchor?.palette?.length) return { background: '#faf9f6' };
        const p = anchor.palette;
        return {
            background: [
                `radial-gradient(ellipse at 30% 40%, ${p[0]}18, transparent 60%)`,
                `radial-gradient(ellipse at 70% 70%, ${p[1] || p[0]}10, transparent 50%)`,
                '#faf9f6',
            ].join(', '),
            transition: 'background 1s ease',
        };
    }, [anchor]);

    // --- Event handlers ---

    const handleSelectFromIdle = useCallback((image: ImageNode, rect: DOMRect) => {
        const label = new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        setTrail((t: TrailPoint[]) => [...t, { id: image.id, palette: image.palette, label, timestamp: image.captureTimestamp }]);
        setPendingImage(image);
        setBloomSourceRect(rect);

        setFlowPhase('blooming');
    }, []);

    const handleBloomComplete = useCallback(() => {
        if (pendingImage) {
            setAnchorId(pendingImage.id);
            setSelectedTraits(new Set());
            setHeroFlipped(false);
            setPendingImage(null);
            setBloomSourceRect(null);
            setFlowPhase('hero');
            // Scroll to top
            if (scrollRef.current) scrollRef.current.scrollTop = 0;
        }
    }, [pendingImage]);

    const handleAlbumSelect = useCallback((img: ImageNode, rect: DOMRect) => {
        const label = new Date(img.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        setTrail((t: TrailPoint[]) => [...t, { id: img.id, palette: img.palette, label, timestamp: img.captureTimestamp }]);
        setPendingImage(img);
        setBloomSourceRect(rect);

        setFlowPhase('blooming');
    }, []);

    const handleToggleTrait = useCallback((key: string) => {
        setSelectedTraits(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else if (next.size < 6) next.add(key);
            return next;
        });
        // Move to exploring phase on first trait selection
        setFlowPhase('exploring');
    }, []);

    const handleFlip = useCallback(() => {
        setHeroFlipped(prev => !prev);
    }, []);

    const handleNavigateFromHero = useCallback((img: ImageNode) => {
        const label = new Date(img.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        setTrail((t: TrailPoint[]) => [...t, { id: img.id, palette: img.palette, label, timestamp: img.captureTimestamp }]);
        setAnchorId(img.id);
        setSelectedTraits(new Set());
        setHeroFlipped(false);
        setFlowPhase('hero');
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, []);

    const handleClear = useCallback(() => {
        setTrail([]);
        setAnchorId(null);
        setSelectedTraits(new Set());
        setHeroFlipped(false);
        setFlowPhase('idle');
    }, []);

    return (
        <div ref={containerRef} className="fixed inset-0 overflow-hidden" style={surfaceStyle}>
            {/* Paper texture */}
            <div className="fixed inset-0 opacity-[0.02] pointer-events-none mix-blend-multiply z-0"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                }} />

            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                    <h1 className="text-[10px] tracking-[0.25em] uppercase text-zinc-500"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Flow State
                    </h1>
                    {trail.length > 0 && (
                        <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {trail.length} visited
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {trail.length > 0 && (
                        <button onClick={handleClear} className="text-[9px] text-zinc-400 hover:text-zinc-600 transition-colors tracking-widest uppercase cursor-pointer"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}>Clear</button>
                    )}
                    <button onClick={onExit} className="text-[9px] text-zinc-400 hover:text-zinc-600 transition-colors tracking-widest uppercase cursor-pointer"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>Exit</button>
                </div>
            </header>

            {/* IDLE */}
            {flowPhase === 'idle' && canvasSize.w > 0 && (
                <IdleField images={images} onSelect={handleSelectFromIdle} canvasW={canvasSize.w} canvasH={canvasSize.h} />
            )}

            {/* BLOOM OVERLAY */}
            {flowPhase === 'blooming' && pendingImage && bloomSourceRect && (
                <BloomOverlay image={pendingImage} sourceRect={bloomSourceRect} onComplete={handleBloomComplete} />
            )}

            {/* HERO + TRAITS + ALBUM — single scroll */}
            {(flowPhase === 'hero' || flowPhase === 'exploring') && anchor && (
                <div ref={scrollRef} className="fixed inset-0 pt-12 z-10 overflow-y-auto"
                    style={{ scrollSnapType: 'y proximity', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>

                    {/* Section 1: Hero */}
                    <div style={{ minHeight: '100vh', scrollSnapAlign: 'start' }}>
                        <HeroSection image={anchor} allImages={images}
                            temporalNeighbors={temporalNeighbors}
                            flipped={heroFlipped} onFlip={handleFlip}
                            onNavigate={handleNavigateFromHero} />
                    </div>

                    {/* Section 2: Traits */}
                    <div id="trait-section" style={{ minHeight: selectedTraits.size >= 6 ? undefined : '60vh', scrollSnapAlign: 'start' }}>
                        <TraitSelector image={anchor} scored={scored} tagMap={tagMap}
                            selectedTraits={selectedTraits} onToggleTrait={handleToggleTrait}
                            albumImages={albumPool} />
                    </div>

                    {/* Section 3: Album (appears at 3+ traits) */}
                    <div>
                        <WaterfallAlbum albumImages={albumPool} traitCount={selectedTraits.size}
                            onSelect={handleAlbumSelect} />
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Inject keyframes ---
if (typeof document !== 'undefined' && !document.getElementById('proto-flow-kf')) {
    const s = document.createElement('style');
    s.id = 'proto-flow-kf';
    s.textContent = `
@keyframes drift {
    0%, 100% { transform: translate(0, 0); }
    25% { transform: translate(3px, -4px); }
    50% { transform: translate(-2px, 3px); }
    75% { transform: translate(4px, 2px); }
}
@keyframes scroll-hint-bounce {
    0%, 100% { transform: translateY(0); opacity: 0.6; }
    50% { transform: translateY(8px); opacity: 0.9; }
}
@keyframes trait-pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.15); }
    100% { transform: scale(1); }
}
@keyframes album-reveal {
    from { opacity: 0; transform: translateY(24px); }
    to { opacity: 1; transform: translateY(0); }
}`;
    document.head.appendChild(s);
}

export default NavigationPrototype;
