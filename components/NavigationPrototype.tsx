import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ImageNode, Tag } from '../types';
import { getThumbnailUrl, getPreviewUrl } from '../services/immichService';

// --- Types ---

interface ScoredImage {
    image: ImageNode;
    score: number;
    sharedTags: string[];
    isBridge: boolean;
    isTemporalNeighbor: boolean;
}

interface TrailPoint {
    id: string;
    palette: string[];
    label: string;
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

function scoreRelevance(image: ImageNode, anchor: ImageNode): { score: number; sharedTags: string[]; isTemporalNeighbor: boolean } {
    if (image.id === anchor.id) return { score: 1, sharedTags: [], isTemporalNeighbor: false };
    let score = 0;

    // Temporal
    const daysDiff = Math.abs(image.captureTimestamp - anchor.captureTimestamp) / 86400000;
    const isTemporalNeighbor = image.shootDayClusterId === anchor.shootDayClusterId || daysDiff < 7;
    if (image.shootDayClusterId === anchor.shootDayClusterId) score += 0.4;
    else if (daysDiff < 30) score += 0.1 * (1 - daysDiff / 30);

    // Tags
    const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
    const sharedTags = [...new Set([...image.tagIds, ...(image.aiTagIds || [])])].filter(t => anchorTags.has(t));
    score += Math.min(sharedTags.length * 0.12, 0.4);

    // Technical
    if (image.cameraModel === anchor.cameraModel && anchor.cameraModel !== 'Unknown Camera') score += 0.05;
    if (image.lensModel === anchor.lensModel && anchor.lensModel !== 'Unknown Lens') score += 0.05;
    if (image.inferredSeason === anchor.inferredSeason) score += 0.05;

    return { score: Math.min(score, 1), sharedTags, isTemporalNeighbor };
}

function classifyImages(images: ImageNode[], anchor: ImageNode, tagMap: Map<string, string>): ScoredImage[] {
    const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);

    return images
        .filter(img => img.id !== anchor.id)
        .map(img => {
            const { score, sharedTags, isTemporalNeighbor } = scoreRelevance(img, anchor);
            const totalTags = new Set([...img.tagIds, ...(img.aiTagIds || [])]).size;
            const isBridge = sharedTags.length === 1 && totalTags > 2 && score < 0.35;
            return { image: img, score, sharedTags, isBridge, isTemporalNeighbor };
        })
        .sort((a, b) => b.score - a.score);
}

// --- Mini Sprite ---

const MiniSprite: React.FC<{ image: ImageNode; size: number; convergence?: 'high' | 'low' | 'bridge' }> = React.memo(({ image, size, convergence }) => {
    const palette = image.palette.length > 0
        ? image.palette
        : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];

    const seed = (() => {
        let h = 0;
        for (let i = 0; i < image.id.length; i++) h = ((h << 5) - h) + image.id.charCodeAt(i) | 0;
        return Math.abs(h);
    })();

    const ringColor = convergence === 'high' ? palette[0] : convergence === 'bridge' ? '#f59e0b' : palette[2] || palette[0];
    const ringOpacity = convergence === 'high' ? 0.5 : 0.3;

    return (
        <svg viewBox="0 0 100 100" width={size} height={size} className="overflow-visible" shapeRendering="geometricPrecision">
            {palette.slice(1, 4).map((color, i) => {
                const angle = (seed + i * 73) % 360;
                const dist = 8 + (seed % 12);
                const rx = 18 + ((seed + i) % 14);
                const ry = 18 + ((seed * (i + 1)) % 14);
                const tx = 50 + dist * Math.cos(angle * Math.PI / 180);
                const ty = 50 + dist * Math.sin(angle * Math.PI / 180);
                return (
                    <ellipse key={i} cx={tx} cy={ty} rx={rx} ry={ry}
                        fill={color} fillOpacity={0.55}
                        transform={`rotate(${(seed * (i + 1)) % 360}, ${tx}, ${ty})`} />
                );
            })}
            <circle cx="50" cy="50" r={16} fill={palette[0]} opacity={0.85} />
            {convergence && (
                <circle cx="50" cy="50" r={22} fill="none" stroke={ringColor} strokeWidth={convergence === 'bridge' ? 1.2 : 1}
                    strokeDasharray={convergence === 'bridge' ? '3,3' : 'none'} opacity={ringOpacity} />
            )}
        </svg>
    );
});

// --- Zone Components ---

const HeroZone: React.FC<{
    image: ImageNode;
    tagMap: Map<string, string>;
}> = ({ image, tagMap }) => {
    const dateStr = new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return (
        <div className="flex flex-col items-center justify-center h-full p-4">
            <div className="overflow-hidden rounded-lg max-w-full"
                style={{ boxShadow: `0 16px 64px ${image.palette[0] || '#000'}35, 0 4px 24px ${image.palette[1] || '#000'}20` }}>
                <img src={getPreviewUrl(image.id)} alt="" className="max-h-[55vh] max-w-full object-contain" draggable={false} />
            </div>
            <div className="mt-3 text-center">
                <span className="text-sm" style={{ fontFamily: 'Caveat, cursive', color: image.palette[0] || '#71717a' }}>
                    {dateStr}
                </span>
                <span className="text-[10px] text-zinc-300 ml-3" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {image.cameraModel !== 'Unknown Camera' ? image.cameraModel : ''}
                </span>
            </div>
        </div>
    );
};

const TemporalZone: React.FC<{
    images: ScoredImage[];
    anchor: ImageNode;
    onSelect: (img: ImageNode) => void;
}> = ({ images, anchor, onSelect }) => {
    if (images.length === 0) return null;
    return (
        <div className="flex flex-col h-full">
            <div className="px-3 py-2 flex-shrink-0">
                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Same Session
                </span>
                <span className="text-[9px] text-zinc-300 ml-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {images.length}
                </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
                <div className="flex flex-wrap gap-2 justify-center">
                    {images.map(({ image }) => {
                        const breatheDur = 6 + seededRandom(image.id + 'tb') * 3;
                        const breatheDel = seededRandom(image.id + 'td') * 2;
                        return (
                            <div key={image.id}
                                className="cursor-pointer hover:scale-105 transition-transform duration-300 rounded-md overflow-hidden"
                                style={{
                                    width: 80, height: 58,
                                    boxShadow: `0 2px 8px ${anchor.palette[0] || '#000'}15`,
                                    animation: `breathe ${breatheDur}s ease-in-out ${breatheDel}s infinite`,
                                }}
                                onClick={() => onSelect(image)}>
                                <img src={getThumbnailUrl(image.id)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const SpriteFieldZone: React.FC<{
    convergent: ScoredImage[];
    divergent: ScoredImage[];
    tagMap: Map<string, string>;
    onSelect: (img: ImageNode) => void;
    anchor: ImageNode;
}> = ({ convergent, divergent, tagMap, onSelect, anchor }) => {
    return (
        <div className="flex flex-col h-full">
            <div className="px-3 py-2 flex-shrink-0">
                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Associations
                </span>
            </div>
            <div className="flex-1 flex flex-col gap-4 px-3 pb-3 overflow-y-auto">
                {/* Convergent cluster */}
                {convergent.length > 0 && (
                    <div>
                        <span className="text-[8px] tracking-[0.15em] uppercase text-zinc-300 mb-2 block" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            Close
                        </span>
                        <div className="flex flex-wrap gap-3 justify-center">
                            {convergent.map(({ image, sharedTags }) => {
                                const breatheDur = 5 + seededRandom(image.id + 'cb') * 5;
                                const breatheDel = seededRandom(image.id + 'cd') * 3;
                                const label = sharedTags.slice(0, 2).map(t => tagMap.get(t) || '').filter(Boolean).join(', ');
                                return (
                                    <div key={image.id}
                                        className="flex flex-col items-center cursor-pointer hover:scale-110 transition-transform duration-300"
                                        style={{ animation: `drift ${breatheDur}s ease-in-out ${breatheDel}s infinite` }}
                                        onClick={() => onSelect(image)}>
                                        <MiniSprite image={image} size={52} convergence="high" />
                                        {label && (
                                            <span className="text-[7px] mt-0.5 text-center max-w-[60px] truncate"
                                                style={{ fontFamily: 'Caveat, cursive', color: anchor.palette[0] || '#71717a' }}>
                                                {label}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                {/* Divergent cluster */}
                {divergent.length > 0 && (
                    <div>
                        <span className="text-[8px] tracking-[0.15em] uppercase text-zinc-300 mb-2 block" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            Distant
                        </span>
                        <div className="flex flex-wrap gap-3 justify-center">
                            {divergent.map(({ image, sharedTags, isBridge }) => {
                                const breatheDur = 7 + seededRandom(image.id + 'db') * 4;
                                const breatheDel = seededRandom(image.id + 'dd') * 4;
                                const label = sharedTags.slice(0, 1).map(t => tagMap.get(t) || '').filter(Boolean)[0] || '';
                                return (
                                    <div key={image.id}
                                        className="flex flex-col items-center cursor-pointer hover:scale-110 transition-transform duration-300"
                                        style={{
                                            animation: `drift ${breatheDur}s ease-in-out ${breatheDel}s infinite`,
                                            opacity: 0.7,
                                        }}
                                        onClick={() => onSelect(image)}>
                                        <MiniSprite image={image} size={46} convergence={isBridge ? 'bridge' : 'low'} />
                                        {label && (
                                            <span className="text-[7px] mt-0.5 text-center max-w-[55px] truncate"
                                                style={{ fontFamily: 'Caveat, cursive', color: '#a1a1aa' }}>
                                                {label}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const TrailZone: React.FC<{
    trail: TrailPoint[];
    onSelect: (id: string) => void;
}> = ({ trail, onSelect }) => {
    if (trail.length < 1) return null;
    const svgRef = useRef<SVGSVGElement>(null);
    const width = 220;
    const nodeSpacing = 40;
    const height = Math.max(120, trail.length * nodeSpacing + 40);

    return (
        <div className="flex flex-col h-full">
            <div className="px-3 py-2 flex-shrink-0">
                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Trail
                </span>
                <span className="text-[9px] text-zinc-300 ml-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {trail.length}
                </span>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
                <svg ref={svgRef} width={width} height={height} className="mx-auto">
                    <defs>
                        <filter id="tglow5">
                            <feGaussianBlur stdDeviation="1.5" result="b" />
                            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                    </defs>
                    {trail.map((pt, i) => {
                        const cx = width / 2 + (seededRandom(pt.id + 'tx') - 0.5) * 80;
                        const cy = 20 + i * nodeSpacing;
                        const nextPt = trail[i + 1];
                        const nextCx = nextPt ? width / 2 + (seededRandom(nextPt.id + 'tx') - 0.5) * 80 : 0;
                        const nextCy = nextPt ? 20 + (i + 1) * nodeSpacing : 0;
                        const fade = Math.max(0.2, 0.7 - (trail.length - i - 1) * 0.06);
                        const isCurrent = i === trail.length - 1;
                        return (
                            <g key={pt.id + i}>
                                {nextPt && (
                                    <line x1={cx} y1={cy} x2={nextCx} y2={nextCy}
                                        stroke={pt.palette[0] || '#a1a1aa'} strokeWidth={1}
                                        opacity={fade * 0.6} filter="url(#tglow5)" />
                                )}
                                <circle cx={cx} cy={cy} r={isCurrent ? 5 : 3}
                                    fill={pt.palette[0] || '#a1a1aa'} opacity={fade}
                                    filter="url(#tglow5)" className="cursor-pointer"
                                    onClick={() => onSelect(pt.id)} />
                                {pt.palette.slice(0, 3).map((color, ci) => (
                                    <circle key={ci} cx={cx + 12 + ci * 6} cy={cy} r={2}
                                        fill={color} opacity={fade * 0.5} />
                                ))}
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};

const DetailDrawer: React.FC<{
    image: ImageNode;
    tagMap: Map<string, string>;
    onNavigateTag: (tagId: string) => void;
    onNavigateCamera: (camera: string) => void;
    onNavigateLens: (lens: string) => void;
    onNavigateSeason: (season: string) => void;
    isOpen: boolean;
    onToggle: () => void;
}> = ({ image, tagMap, onNavigateTag, onNavigateCamera, onNavigateLens, onNavigateSeason, isOpen, onToggle }) => {
    const allTagIds = [...new Set([...image.tagIds, ...(image.aiTagIds || [])])];
    return (
        <div className={`fixed right-0 top-0 bottom-0 z-50 transition-transform duration-500 ease-out ${isOpen ? 'translate-x-0' : 'translate-x-[calc(100%-28px)]'}`}
            style={{ width: 280 }}>
            {/* Tab */}
            <button onClick={onToggle}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full w-7 h-20 rounded-l-md flex items-center justify-center transition-colors"
                style={{ backgroundColor: `${image.palette[0] || '#52525b'}20`, borderRight: 'none' }}>
                <span className="text-zinc-400 text-[10px]" style={{ writingMode: 'vertical-rl', fontFamily: 'JetBrains Mono, monospace' }}>
                    {isOpen ? 'close' : 'details'}
                </span>
            </button>
            {/* Drawer content */}
            <div className="h-full overflow-y-auto py-14 px-4" style={{ backgroundColor: '#faf9f6ee', backdropFilter: 'blur(12px)' }}>
                {/* Tags */}
                <div className="mb-5">
                    <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Tags
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {allTagIds.map(tagId => {
                            const label = tagMap.get(tagId) || tagId;
                            return (
                                <button key={tagId} onClick={() => onNavigateTag(tagId)}
                                    className="px-2 py-0.5 rounded-full text-[10px] transition-colors hover:opacity-80 cursor-pointer"
                                    style={{
                                        fontFamily: 'Inter, sans-serif',
                                        backgroundColor: `${image.palette[0] || '#52525b'}15`,
                                        color: image.palette[0] || '#52525b',
                                    }}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                {/* Camera */}
                {image.cameraModel !== 'Unknown Camera' && (
                    <div className="mb-4">
                        <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            Camera
                        </span>
                        <button onClick={() => onNavigateCamera(image.cameraModel)}
                            className="text-[11px] text-zinc-600 hover:text-zinc-800 transition-colors cursor-pointer"
                            style={{ fontFamily: 'Inter, sans-serif' }}>
                            {image.cameraModel} &rarr;
                        </button>
                    </div>
                )}
                {/* Lens */}
                {image.lensModel !== 'Unknown Lens' && (
                    <div className="mb-4">
                        <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            Lens
                        </span>
                        <button onClick={() => onNavigateLens(image.lensModel)}
                            className="text-[11px] text-zinc-600 hover:text-zinc-800 transition-colors cursor-pointer"
                            style={{ fontFamily: 'Inter, sans-serif' }}>
                            {image.lensModel} &rarr;
                        </button>
                    </div>
                )}
                {/* Season */}
                {image.inferredSeason && (
                    <div className="mb-4">
                        <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            Season
                        </span>
                        <button onClick={() => onNavigateSeason(image.inferredSeason)}
                            className="text-[11px] text-zinc-600 hover:text-zinc-800 transition-colors cursor-pointer"
                            style={{ fontFamily: 'Inter, sans-serif' }}>
                            {image.inferredSeason} &rarr;
                        </button>
                    </div>
                )}
                {/* EXIF */}
                <div className="mb-4">
                    <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Technical
                    </span>
                    <div className="space-y-0.5 text-[10px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {image.iso && <div>ISO {image.iso}</div>}
                        {image.focalLength && <div>{image.focalLength}mm</div>}
                        {image.aperture && <div>f/{image.aperture}</div>}
                        {image.shutterSpeed && <div>{image.shutterSpeed}</div>}
                    </div>
                </div>
                {/* Palette */}
                <div>
                    <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Palette
                    </span>
                    <div className="flex gap-1.5">
                        {image.palette.map((color, i) => (
                            <div key={i} className="w-6 h-6 rounded-full" style={{ backgroundColor: color, boxShadow: `0 1px 4px ${color}40` }} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Idle State: sprite field ---

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
        return images.slice(0, count).map((img, i) => ({
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
                <p className="text-zinc-300 text-sm" style={{ fontFamily: 'Caveat, cursive' }}>
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
    const [drawerOpen, setDrawerOpen] = useState(false);
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

    const anchor = useMemo(() => anchorId ? images.find(i => i.id === anchorId) ?? null : null, [anchorId, images]);

    // Classify all images relative to anchor
    const classified = useMemo(() => anchor ? classifyImages(images, anchor, tagMap) : [], [anchor, images, tagMap]);

    // Zone populations
    const temporalNeighbors = useMemo(() => classified.filter(s => s.isTemporalNeighbor).slice(0, 12), [classified]);
    const convergent = useMemo(() => classified.filter(s => !s.isTemporalNeighbor && s.score >= 0.25 && !s.isBridge).slice(0, 8), [classified]);
    const divergent = useMemo(() => {
        const bridges = classified.filter(s => s.isBridge).slice(0, 4);
        const lowScore = classified.filter(s => !s.isTemporalNeighbor && s.score > 0.05 && s.score < 0.25 && !s.isBridge).slice(0, 4);
        return [...bridges, ...lowScore];
    }, [classified]);

    // Zone weight calculation for dynamic sizing
    const zoneWeights = useMemo(() => {
        const t = Math.max(temporalNeighbors.length, 0);
        const s = convergent.length + divergent.length;
        const total = Math.max(t + s, 1);
        // Temporal zone gets proportional weight, min 0, max 0.5
        const temporalWeight = t > 0 ? Math.min(0.5, Math.max(0.2, t / total)) : 0;
        // Sprite zone gets the rest
        const spriteWeight = s > 0 ? 1 - temporalWeight : 0;
        return { temporal: temporalWeight, sprite: spriteWeight };
    }, [temporalNeighbors, convergent, divergent]);

    // Surface style
    const surfaceStyle = useMemo((): React.CSSProperties => {
        if (!anchor?.palette?.length) return { background: '#faf9f6' };
        const p = anchor.palette;
        return {
            background: [
                `radial-gradient(ellipse at 30% 40%, ${p[0]}20, transparent 60%)`,
                `radial-gradient(ellipse at 70% 70%, ${p[1] || p[0]}15, transparent 50%)`,
                `radial-gradient(ellipse at 50% 20%, ${p[2] || p[0]}0D, transparent 45%)`,
                '#faf9f6',
            ].join(', '),
            transition: 'background 1s ease',
        };
    }, [anchor]);

    const handleSelect = useCallback((image: ImageNode) => {
        const label = new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        setTrail(t => [...t, { id: image.id, palette: image.palette, label }]);
        setAnchorId(image.id);
    }, []);

    const handleTrailSelect = useCallback((id: string) => {
        const img = images.find(i => i.id === id);
        if (img) handleSelect(img);
    }, [images, handleSelect]);

    // Navigate by metadata — find first image matching criteria and anchor it
    const handleNavigateTag = useCallback((tagId: string) => {
        const match = images.find(img => img.id !== anchorId && (img.tagIds.includes(tagId) || img.aiTagIds?.includes(tagId)));
        if (match) handleSelect(match);
    }, [images, anchorId, handleSelect]);

    const handleNavigateCamera = useCallback((camera: string) => {
        const match = images.find(img => img.id !== anchorId && img.cameraModel === camera);
        if (match) handleSelect(match);
    }, [images, anchorId, handleSelect]);

    const handleNavigateLens = useCallback((lens: string) => {
        const match = images.find(img => img.id !== anchorId && img.lensModel === lens);
        if (match) handleSelect(match);
    }, [images, anchorId, handleSelect]);

    const handleNavigateSeason = useCallback((season: string) => {
        const match = images.find(img => img.id !== anchorId && img.inferredSeason === season);
        if (match) handleSelect(match);
    }, [images, anchorId, handleSelect]);

    const handleClear = useCallback(() => {
        setTrail([]);
        setAnchorId(null);
        setDrawerOpen(false);
    }, []);

    // Compute right-side zone widths
    const hasTemporalZone = temporalNeighbors.length > 0;
    const hasSpriteZone = convergent.length > 0 || divergent.length > 0;

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
                    <h1 className="text-[10px] tracking-[0.25em] uppercase transition-colors duration-800"
                        style={{ fontFamily: 'JetBrains Mono, monospace', color: anchor?.palette?.[0] || '#a1a1aa' }}>
                        Living Dashboard
                    </h1>
                    {trail.length > 0 && (
                        <span className="text-[9px] text-zinc-300" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {trail.length} visited
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {trail.length > 0 && (
                        <button onClick={handleClear} className="text-[9px] text-zinc-300 hover:text-zinc-500 transition-colors tracking-widest uppercase cursor-pointer"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}>Clear</button>
                    )}
                    <button onClick={onExit} className="text-[9px] text-zinc-300 hover:text-zinc-500 transition-colors tracking-widest uppercase cursor-pointer"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>Exit</button>
                </div>
            </header>

            {/* === IDLE STATE === */}
            {!anchor && canvasSize.w > 0 && (
                <IdleField images={images} onSelect={handleSelect} canvasW={canvasSize.w} canvasH={canvasSize.h} />
            )}

            {/* === DASHBOARD STATE === */}
            {anchor && (
                <div className="fixed inset-0 pt-12 pb-4 px-4 flex gap-3 z-10">
                    {/* Trail zone — left sidebar */}
                    {trail.length > 0 && (
                        <div className="flex-shrink-0 rounded-xl transition-all duration-500"
                            style={{ width: 160, backgroundColor: '#faf9f6cc' }}>
                            <TrailZone trail={trail} onSelect={handleTrailSelect} />
                        </div>
                    )}

                    {/* Hero — center, takes majority of space */}
                    <div className="flex-1 min-w-0 flex items-center justify-center rounded-xl transition-all duration-500"
                        style={{ backgroundColor: '#faf9f600' }}>
                        <HeroZone image={anchor} tagMap={tagMap} />
                    </div>

                    {/* Right column — stacked zones */}
                    {(hasTemporalZone || hasSpriteZone) && (
                        <div className="flex-shrink-0 flex flex-col gap-3 transition-all duration-500"
                            style={{ width: Math.min(320, canvasSize.w * 0.25) }}>
                            {/* Temporal zone */}
                            {hasTemporalZone && (
                                <div className="rounded-xl overflow-hidden transition-all duration-500"
                                    style={{
                                        flex: hasSpriteZone ? `${zoneWeights.temporal} 1 0%` : '1 1 auto',
                                        backgroundColor: '#faf9f6cc',
                                    }}>
                                    <TemporalZone images={temporalNeighbors} anchor={anchor} onSelect={handleSelect} />
                                </div>
                            )}
                            {/* Sprite field zone */}
                            {hasSpriteZone && (
                                <div className="rounded-xl overflow-hidden transition-all duration-500"
                                    style={{
                                        flex: hasTemporalZone ? `${zoneWeights.sprite} 1 0%` : '1 1 auto',
                                        backgroundColor: '#faf9f6cc',
                                    }}>
                                    <SpriteFieldZone convergent={convergent} divergent={divergent}
                                        tagMap={tagMap} onSelect={handleSelect} anchor={anchor} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Detail drawer */}
            {anchor && (
                <DetailDrawer image={anchor} tagMap={tagMap}
                    onNavigateTag={handleNavigateTag} onNavigateCamera={handleNavigateCamera}
                    onNavigateLens={handleNavigateLens} onNavigateSeason={handleNavigateSeason}
                    isOpen={drawerOpen} onToggle={() => setDrawerOpen(o => !o)} />
            )}

            {/* Trail palette dots */}
            {trail.length > 0 && (
                <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-40 flex gap-1">
                    {trail.slice(-10).map((pt, i) => (
                        <div key={pt.id + i} className="w-1.5 h-1.5 rounded-full transition-all duration-700"
                            style={{ backgroundColor: pt.palette[0] || '#a1a1aa', opacity: 0.3 + (i / 10) * 0.7 }} />
                    ))}
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
