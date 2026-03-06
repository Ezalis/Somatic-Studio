import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ImageNode, Tag } from '../types';
import { getThumbnailUrl, getPreviewUrl } from '../services/immichService';

// --- Types ---

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

// --- Mini Sprite ---

const MiniSprite: React.FC<{ image: ImageNode; size: number; convergence?: number }> = React.memo(({ image, size, convergence }) => {
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
                return (
                    <ellipse key={i} cx={tx} cy={ty} rx={rx} ry={ry} fill={color} fillOpacity={0.55}
                        transform={`rotate(${(seed * (i + 1)) % 360}, ${tx}, ${ty})`} />
                );
            })}
            <circle cx="50" cy="50" r={16} fill={palette[0]} opacity={0.85} />
            {convergence != null && (
                <circle cx="50" cy="50" r={22} fill="none" stroke={palette[0]}
                    strokeWidth={convergence > 0.5 ? 1.2 : 0.8}
                    strokeDasharray={convergence < 0.3 ? '3,3' : 'none'} opacity={ringOpacity} />
            )}
        </svg>
    );
});

// --- Left Panel ---

const LeftPanel: React.FC<{
    image: ImageNode;
    allImages: ImageNode[];
    temporalImages: ScoredImage[];
    scored: ScoredImage[];
    tagMap: Map<string, string>;
    activeTags: Set<string>;
    onToggleTag: (tagId: string) => void;
    onNavigate: (img: ImageNode) => void;
}> = ({ image, allImages, temporalImages, tagMap, activeTags, onToggleTag, onNavigate }) => {
    const palette = image.palette.length > 0 ? image.palette : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];
    const allTagIds = [...new Set([...image.tagIds, ...(image.aiTagIds || [])])];

    // Timeline data
    const allTimestamps = useMemo(() => allImages.map(i => i.captureTimestamp).sort((a: number, b: number) => a - b), [allImages]);
    const minTs = allTimestamps[0];
    const maxTs = allTimestamps[allTimestamps.length - 1];
    const range = maxTs - minTs || 1;
    const anchorPos = (image.captureTimestamp - minTs) / range;

    const temporalTs = temporalImages.map(s => s.image.captureTimestamp);
    const hasNeighbors = temporalImages.length > 0;
    const tMin = hasNeighbors ? Math.min(image.captureTimestamp, ...temporalTs) : image.captureTimestamp;
    const tMax = hasNeighbors ? Math.max(image.captureTimestamp, ...temporalTs) : image.captureTimestamp;
    const tMinPos = (tMin - minTs) / range;
    const tMaxPos = (tMax - minTs) / range;

    const anchorDateStr = new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const rangeStart = new Date(minTs).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const rangeEnd = new Date(maxTs).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    return (
        <div className="flex flex-col h-full overflow-y-auto">
            {/* Sprite identity */}
            <div className="flex-shrink-0 flex flex-col items-center pt-3 pb-2 border-b border-zinc-200/40">
                <MiniSprite image={image} size={72} />
                <span className="text-[9px] text-zinc-500 mt-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Spectral Identity
                </span>
            </div>

            {/* Sprite DNA — Palette */}
            <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-zinc-200/40">
                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-500 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Sprite DNA
                </span>
                <div className="mb-2">
                    <span className="text-[8px] text-zinc-400 block mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Core
                    </span>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: palette[0] }} />
                        <span className="text-[9px] text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{palette[0]}</span>
                    </div>
                </div>
                <div className="mb-2">
                    <span className="text-[8px] text-zinc-400 block mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Orbital layers
                    </span>
                    <div className="flex gap-2">
                        {palette.slice(1, 4).map((color: string, i: number) => (
                            <div key={i} className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color, opacity: 0.7 }} />
                                <span className="text-[8px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{color}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Technical */}
            <div className="flex-shrink-0 px-3 pt-2 pb-2 border-b border-zinc-200/40">
                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-500 block mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Technical
                </span>
                <div className="space-y-0.5 text-[10px] text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {image.cameraModel !== 'Unknown Camera' && <div>{image.cameraModel}</div>}
                    {image.lensModel !== 'Unknown Lens' && <div>{image.lensModel}</div>}
                    {image.inferredSeason && <div>{image.inferredSeason}</div>}
                    {image.iso && <div>ISO {image.iso}</div>}
                    {image.focalLength && <div>{image.focalLength}mm</div>}
                    {image.aperture && <div>f/{image.aperture}</div>}
                </div>
            </div>

            {/* Timeline (bar only, no images) */}
            <div className="flex-shrink-0 px-3 pt-2 pb-2 border-b border-zinc-200/40">
                <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Timeline
                    </span>
                    {hasNeighbors && (
                        <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {temporalImages.length} nearby
                        </span>
                    )}
                </div>
                <div className="mb-1">
                    <span className="text-[12px] text-zinc-700 font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                        {anchorDateStr}
                    </span>
                </div>
                <div className="relative h-5 mb-1">
                    <div className="absolute top-2 left-0 right-0 h-[2px] bg-zinc-200 rounded-full" />
                    {hasNeighbors && (
                        <div className="absolute top-0.5 h-3 rounded-full transition-all duration-700"
                            style={{
                                left: `${tMinPos * 100}%`,
                                width: `${Math.max((tMaxPos - tMinPos) * 100, 3)}%`,
                                backgroundColor: 'rgba(0,0,0,0.06)',
                                border: '1px solid rgba(0,0,0,0.08)',
                            }} />
                    )}
                    {allImages.filter((_: ImageNode, i: number) => i % Math.max(1, Math.floor(allImages.length / 30)) === 0).map((img: ImageNode) => (
                        <div key={img.id} className="absolute top-[9px] w-[2px] h-[2px] rounded-full bg-zinc-300 -translate-x-1/2"
                            style={{ left: `${((img.captureTimestamp - minTs) / range) * 100}%` }} />
                    ))}
                    <div className="absolute top-0.5 w-2.5 h-2.5 rounded-full -translate-x-1/2 transition-all duration-500"
                        style={{ left: `${anchorPos * 100}%`, backgroundColor: '#3f3f46' }} />
                </div>
                <div className="flex justify-between">
                    <span className="text-[7px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{rangeStart}</span>
                    <span className="text-[7px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{rangeEnd}</span>
                </div>
            </div>

            {/* Tags — click to add to album pool */}
            <div className="flex-1 px-3 pt-2 pb-3">
                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-500 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Tags — click to build album
                </span>
                <div className="flex flex-wrap gap-1.5">
                    {allTagIds.map((tagId: string) => {
                        const label = tagMap.get(tagId) || tagId;
                        const isActive = activeTags.has(tagId);
                        return (
                            <button key={tagId} onClick={() => onToggleTag(tagId)}
                                className="px-2 py-0.5 rounded-full text-[10px] transition-all cursor-pointer"
                                style={{
                                    fontFamily: 'Inter, sans-serif',
                                    backgroundColor: isActive ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.04)',
                                    color: isActive ? '#18181b' : '#3f3f46',
                                    outline: isActive ? '1.5px solid rgba(0,0,0,0.25)' : 'none',
                                    fontWeight: isActive ? 600 : 400,
                                }}>
                                {isActive ? '+ ' : ''}{label}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// --- Dynamic Album ---

interface AlbumImage {
    image: ImageNode;
    tagHits: number;
    isTemporal: boolean;
}

const DynamicAlbum: React.FC<{
    allImages: ImageNode[];
    anchor: ImageNode;
    scored: ScoredImage[];
    temporalImages: ScoredImage[];
    activeTags: Set<string>;
    tagMap: Map<string, string>;
    onRemoveTag: (tagId: string) => void;
    onSelect: (img: ImageNode) => void;
}> = ({ allImages, anchor, scored, temporalImages, activeTags, tagMap, onRemoveTag, onSelect }) => {
    const hasActiveTags = activeTags.size > 0;

    // Build album pool
    const albumImages = useMemo((): AlbumImage[] => {
        if (!hasActiveTags) {
            // No tags selected: show scored similar images as sprites
            return scored.slice(0, 24).map(s => ({
                image: s.image,
                tagHits: 0,
                isTemporal: s.isTemporalNeighbor,
            }));
        }

        // Tags selected: find all images matching ANY active tag, count hits
        const seen = new Map<string, AlbumImage>();

        // Always include temporal neighbors
        for (const s of temporalImages) {
            seen.set(s.image.id, { image: s.image, tagHits: 0, isTemporal: true });
        }

        // Add tag-matched images
        for (const img of allImages) {
            if (img.id === anchor.id) continue;
            const imgTags = new Set([...img.tagIds, ...(img.aiTagIds || [])]);
            let hits = 0;
            for (const tagId of activeTags) {
                if (imgTags.has(tagId)) hits++;
            }
            if (hits > 0) {
                const existing = seen.get(img.id);
                if (existing) {
                    existing.tagHits = hits;
                } else {
                    seen.set(img.id, { image: img, tagHits: hits, isTemporal: false });
                }
            }
        }

        // Sort: more tag hits first, then temporal, then score
        return [...seen.values()].sort((a, b) => {
            if (b.tagHits !== a.tagHits) return b.tagHits - a.tagHits;
            if (a.isTemporal !== b.isTemporal) return a.isTemporal ? -1 : 1;
            return 0;
        });
    }, [hasActiveTags, scored, temporalImages, allImages, anchor.id, activeTags]);

    return (
        <div className="flex flex-col h-full">
            {/* Active tag pills (removable) */}
            {hasActiveTags && (
                <div className="flex-shrink-0 px-4 py-2 flex items-center gap-2 flex-wrap">
                    <span className="text-[8px] text-zinc-400 uppercase tracking-wider" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Album filters:
                    </span>
                    {[...activeTags].map((tagId: string) => (
                        <button key={tagId} onClick={() => onRemoveTag(tagId)}
                            className="px-2 py-0.5 rounded-full text-[9px] cursor-pointer transition-all hover:opacity-70 flex items-center gap-1"
                            style={{
                                fontFamily: 'Inter, sans-serif',
                                backgroundColor: 'rgba(0,0,0,0.1)',
                                color: '#18181b',
                            }}>
                            {tagMap.get(tagId) || tagId}
                            <span className="text-zinc-400 ml-0.5">&times;</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Album grid */}
            <div className="flex-1 overflow-y-auto px-4 pb-3">
                {!hasActiveTags ? (
                    // Sprite grid — no tags selected yet
                    <div>
                        <div className="mb-2">
                            <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                Similar images — select tags on the left to build an album
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-3 justify-start">
                            {albumImages.map(({ image }: AlbumImage) => {
                                const bd = 5 + seededRandom(image.id + 'ab') * 5;
                                const delay = seededRandom(image.id + 'ad') * 3;
                                return (
                                    <div key={image.id}
                                        className="cursor-pointer hover:scale-110 transition-transform duration-300"
                                        style={{ animation: `drift ${bd}s ease-in-out ${delay}s infinite` }}
                                        onClick={() => onSelect(image)}>
                                        <MiniSprite image={image} size={40} convergence={0.3} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    // Photo grid — tags are active
                    <div>
                        <div className="mb-2">
                            <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                {albumImages.length} images
                            </span>
                        </div>
                        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
                            {albumImages.map(({ image, tagHits, isTemporal }: AlbumImage) => (
                                <div key={image.id}
                                    className="cursor-pointer hover:scale-105 transition-transform duration-200 rounded-md overflow-hidden relative"
                                    style={{ aspectRatio: '4/3', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                                    onClick={() => onSelect(image)}>
                                    <img src={getThumbnailUrl(image.id)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                                    {/* Tag hit badge */}
                                    {tagHits > 1 && (
                                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                                            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                                            <span className="text-[8px] text-white font-medium">{tagHits}</span>
                                        </div>
                                    )}
                                    {/* Temporal indicator */}
                                    {isTemporal && (
                                        <div className="absolute bottom-1 left-1 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#3f3f46' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Hero Zone ---

const HeroZone: React.FC<{ image: ImageNode }> = ({ image }) => {
    return (
        <div className="flex flex-col items-center p-3">
            <div className="overflow-hidden rounded-lg max-w-full"
                style={{ boxShadow: `0 12px 48px ${image.palette[0] || '#000'}25, 0 4px 16px ${image.palette[1] || '#000'}12` }}>
                <img src={getPreviewUrl(image.id)} alt="" className="max-h-[38vh] max-w-full object-contain" draggable={false} />
            </div>
        </div>
    );
};

// --- Idle Field ---

const IdleField: React.FC<{
    images: ImageNode[];
    onSelect: (img: ImageNode) => void;
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
                        onClick={() => onSelect(image)}>
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
    const [anchorId, setAnchorId] = useState<string | null>(null);
    const [trail, setTrail] = useState<TrailPoint[]>([]);
    const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

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

    const handleSelect = useCallback((image: ImageNode) => {
        const label = new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        setTrail((t: TrailPoint[]) => [...t, { id: image.id, palette: image.palette, label, timestamp: image.captureTimestamp }]);
        setAnchorId(image.id);
        setActiveTags(new Set()); // Reset album tags on new anchor
    }, []);

    const handleToggleTag = useCallback((tagId: string) => {
        setActiveTags(prev => {
            const next = new Set(prev);
            if (next.has(tagId)) next.delete(tagId);
            else next.add(tagId);
            return next;
        });
    }, []);

    const handleRemoveTag = useCallback((tagId: string) => {
        setActiveTags(prev => {
            const next = new Set(prev);
            next.delete(tagId);
            return next;
        });
    }, []);

    const handleClear = useCallback(() => {
        setTrail([]);
        setAnchorId(null);
        setActiveTags(new Set());
    }, []);

    const leftW = 240;

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
                        Living Dashboard
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
            {!anchor && canvasSize.w > 0 && (
                <IdleField images={images} onSelect={handleSelect} canvasW={canvasSize.w} canvasH={canvasSize.h} />
            )}

            {/* DASHBOARD */}
            {anchor && (
                <div className="fixed inset-0 pt-12 pb-4 px-4 flex gap-3 z-10">
                    {/* LEFT: Sprite identity, DNA, technical, timeline, tags */}
                    <div className="flex-shrink-0 rounded-xl overflow-hidden transition-all duration-500"
                        style={{ width: leftW, backgroundColor: '#faf9f6dd' }}>
                        <LeftPanel image={anchor} allImages={images} temporalImages={temporalNeighbors}
                            scored={scored} tagMap={tagMap} activeTags={activeTags}
                            onToggleTag={handleToggleTag} onNavigate={handleSelect} />
                    </div>

                    {/* CENTER: Hero (top) + Dynamic Album (bottom) */}
                    <div className="flex-1 min-w-0 flex flex-col transition-all duration-500">
                        {/* Hero */}
                        <div className="flex-shrink-0 flex items-start justify-center">
                            <HeroZone image={anchor} />
                        </div>
                        {/* Dynamic Album */}
                        <div className="flex-1 min-h-0 rounded-xl overflow-hidden"
                            style={{ backgroundColor: '#faf9f6aa' }}>
                            <DynamicAlbum allImages={images} anchor={anchor} scored={scored}
                                temporalImages={temporalNeighbors} activeTags={activeTags}
                                tagMap={tagMap} onRemoveTag={handleRemoveTag} onSelect={handleSelect} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Inject keyframes ---
if (typeof document !== 'undefined' && !document.getElementById('proto-dash-kf')) {
    const s = document.createElement('style');
    s.id = 'proto-dash-kf';
    s.textContent = `
@keyframes drift {
    0%, 100% { transform: translate(0, 0); }
    25% { transform: translate(3px, -4px); }
    50% { transform: translate(-2px, 3px); }
    75% { transform: translate(4px, 2px); }
}
@keyframes breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.03); }
}`;
    document.head.appendChild(s);
}

export default NavigationPrototype;
