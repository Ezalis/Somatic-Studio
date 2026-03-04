import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ImageNode, Tag } from '../types';
import { getThumbnailUrl, getPreviewUrl } from '../services/immichService';

// --- Types ---

interface OrbitNode {
    image: ImageNode;
    ring: 'hero' | 'inner' | 'outer';
    angle: number;      // radians, position on ring
    distance: number;   // px from center
    score: number;      // relevance 0-1
    isBridge: boolean;  // tag bridge (escape route)
}

interface TrailPoint {
    id: string;
    x: number;
    y: number;
    palette: string[];
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

function scoreRelevance(image: ImageNode, anchor: ImageNode): number {
    if (image.id === anchor.id) return 1;
    let score = 0;
    if (image.shootDayClusterId === anchor.shootDayClusterId) score += 0.4;
    const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
    const overlap = [...image.tagIds, ...(image.aiTagIds || [])].filter(t => anchorTags.has(t)).length;
    score += Math.min(overlap * 0.12, 0.4);
    if (image.cameraModel === anchor.cameraModel && anchor.cameraModel !== 'Unknown Camera') score += 0.05;
    if (image.lensModel === anchor.lensModel && anchor.lensModel !== 'Unknown Lens') score += 0.05;
    if (image.inferredSeason === anchor.inferredSeason) score += 0.05;
    const daysDiff = Math.abs(image.captureTimestamp - anchor.captureTimestamp) / (86400000);
    if (daysDiff < 30) score += 0.05 * (1 - daysDiff / 30);
    return Math.min(score, 1);
}

/** Find tag bridge images: share exactly 1 tag but otherwise very different */
function findTagBridges(images: ImageNode[], anchor: ImageNode, exclude: Set<string>, count: number): ImageNode[] {
    const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
    return images
        .filter(img => !exclude.has(img.id) && img.id !== anchor.id)
        .map(img => {
            const shared = [...img.tagIds, ...(img.aiTagIds || [])].filter(t => anchorTags.has(t));
            const totalTags = new Set([...img.tagIds, ...(img.aiTagIds || [])]).size;
            // Want exactly 1 shared tag and otherwise different
            const bridgeScore = shared.length === 1 && totalTags > 2
                ? (1 - scoreRelevance(img, anchor)) // prefer MORE different
                : 0;
            return { img, bridgeScore };
        })
        .filter(({ bridgeScore }) => bridgeScore > 0.3)
        .sort((a, b) => b.bridgeScore - a.bridgeScore)
        .slice(0, count)
        .map(({ img }) => img);
}

// --- Inline Esoteric Sprite (self-contained, no ExperienceNode dependency) ---

const MiniSprite: React.FC<{ image: ImageNode; size: number; isBridge?: boolean }> = React.memo(({ image, size, isBridge }) => {
    const palette = image.palette.length > 0
        ? image.palette
        : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];

    const seed = (() => {
        let h = 0;
        for (let i = 0; i < image.id.length; i++) h = ((h << 5) - h) + image.id.charCodeAt(i) | 0;
        return Math.abs(h);
    })();

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
                    <ellipse
                        key={i}
                        cx={tx} cy={ty} rx={rx} ry={ry}
                        fill={color}
                        fillOpacity={0.55}
                        transform={`rotate(${(seed * (i + 1)) % 360}, ${tx}, ${ty})`}
                    />
                );
            })}
            <circle cx="50" cy="50" r={16} fill={palette[0]} opacity={0.85} />
            {isBridge && (
                <circle cx="50" cy="50" r={22} fill="none" stroke={palette[0]} strokeWidth={1} strokeDasharray="3,3" opacity={0.4} />
            )}
        </svg>
    );
});

// --- Build orbit layout ---

function buildOrbit(
    images: ImageNode[],
    anchor: ImageNode,
    isMobile: boolean,
): OrbitNode[] {
    const innerCount = isMobile ? 4 : 6;
    const outerSpriteCount = isMobile ? 4 : 6;
    const bridgeCount = isMobile ? 2 : 3;

    // Score all images
    const scored = images
        .filter(img => img.id !== anchor.id)
        .map(img => ({ img, score: scoreRelevance(img, anchor) }))
        .sort((a, b) => b.score - a.score);

    // Inner ring: top N as photos
    const inner = scored.slice(0, innerCount);
    const innerIds = new Set(inner.map(s => s.img.id));

    // Tag bridges from remaining pool
    const bridges = findTagBridges(images, anchor, new Set([...innerIds, anchor.id]), bridgeCount);
    const bridgeIds = new Set(bridges.map(b => b.id));

    // Outer ring: next N scored (excluding bridges) + bridges
    const outerScored = scored
        .filter(s => !innerIds.has(s.img.id) && !bridgeIds.has(s.img.id))
        .slice(0, outerSpriteCount);

    // Ring radii
    const innerRadius = isMobile ? 130 : 190;
    const outerRadius = isMobile ? 230 : 320;

    const nodes: OrbitNode[] = [];

    // Hero
    nodes.push({ image: anchor, ring: 'hero', angle: 0, distance: 0, score: 1, isBridge: false });

    // Inner ring
    inner.forEach((s, i) => {
        const angle = (i / inner.length) * Math.PI * 2 - Math.PI / 2;
        const jitter = (seededRandom(s.img.id + 'a') - 0.5) * 0.2;
        nodes.push({
            image: s.img, ring: 'inner', angle: angle + jitter,
            distance: innerRadius + (seededRandom(s.img.id + 'd') - 0.5) * 20,
            score: s.score, isBridge: false,
        });
    });

    // Outer ring: scored sprites + bridges
    const outerAll = [
        ...outerScored.map(s => ({ img: s.img, score: s.score, isBridge: false })),
        ...bridges.map(b => ({ img: b, score: scoreRelevance(b, anchor), isBridge: true })),
    ];
    outerAll.forEach((item, i) => {
        const angle = (i / outerAll.length) * Math.PI * 2 - Math.PI / 2;
        const jitter = (seededRandom(item.img.id + 'oa') - 0.5) * 0.3;
        nodes.push({
            image: item.img, ring: 'outer', angle: angle + jitter,
            distance: outerRadius + (seededRandom(item.img.id + 'od') - 0.5) * 30,
            score: item.score, isBridge: item.isBridge,
        });
    });

    return nodes;
}

// --- Idle layout: all images as drifting sprites ---

function buildIdleLayout(images: ImageNode[], canvasW: number, canvasH: number): Array<{ image: ImageNode; x: number; y: number }> {
    const count = Math.min(images.length, 30); // Cap for performance
    const cols = Math.ceil(Math.sqrt(count * (canvasW / canvasH)));
    const rows = Math.ceil(count / cols);
    const cellW = canvasW / (cols + 1);
    const cellH = canvasH / (rows + 1);

    return images.slice(0, count).map((img, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
            image: img,
            x: cellW * (col + 1) + (seededRandom(img.id + 'ix') - 0.5) * cellW * 0.5,
            y: cellH * (row + 1) + (seededRandom(img.id + 'iy') - 0.5) * cellH * 0.4,
        };
    });
}

// --- Main Component ---

interface NavigationPrototypeProps {
    images: ImageNode[];
    tags: Tag[];
    onExit: () => void;
}

const NavigationPrototype: React.FC<NavigationPrototypeProps> = ({ images, tags, onExit }) => {
    const [anchorId, setAnchorId] = useState<string | null>(null);
    const [trail, setTrail] = useState<TrailPoint[]>([]);
    const [isMobile, setIsMobile] = useState(false);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

    useEffect(() => {
        const update = () => {
            setIsMobile(window.innerWidth < 768);
            if (canvasRef.current) {
                setCanvasSize({ w: canvasRef.current.clientWidth, h: canvasRef.current.clientHeight });
            }
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    const anchor = useMemo(
        () => anchorId ? images.find(i => i.id === anchorId) ?? null : null,
        [anchorId, images]
    );

    // Orbit layout
    const orbitNodes = useMemo(
        () => anchor ? buildOrbit(images, anchor, isMobile) : [],
        [anchor, images, isMobile]
    );

    // Idle layout
    const idleNodes = useMemo(
        () => !anchor && canvasSize.w > 0 ? buildIdleLayout(images, canvasSize.w, canvasSize.h) : [],
        [anchor, images, canvasSize]
    );

    const centerX = canvasSize.w / 2;
    const centerY = canvasSize.h * 0.45;

    // Trail palette
    const trailPalette = useMemo(() => {
        const colors: string[] = [];
        for (const p of trail) {
            for (const c of p.palette.slice(0, 2)) {
                if (!colors.includes(c)) colors.push(c);
            }
        }
        return colors.slice(-8);
    }, [trail]);

    // Surface gradient
    const surfaceStyle = useMemo((): React.CSSProperties => {
        const gradients: string[] = [];
        if (anchor?.palette?.length) {
            const p = anchor.palette;
            gradients.push(
                `radial-gradient(ellipse at 50% 35%, ${p[0]}28, transparent 65%)`,
                `radial-gradient(ellipse at 80% 75%, ${p[1] || p[0]}1E, transparent 55%)`,
                `radial-gradient(ellipse at 20% 80%, ${p[2] || p[0]}15, transparent 50%)`,
            );
        }
        for (let i = 0; i < trailPalette.length; i++) {
            const a = (i / trailPalette.length) * 360;
            const x = 50 + Math.cos(a * Math.PI / 180) * 35;
            const y = 50 + Math.sin(a * Math.PI / 180) * 30;
            gradients.push(`radial-gradient(ellipse at ${x}% ${y}%, ${trailPalette[i]}0A, transparent 35%)`);
        }
        return {
            background: gradients.length > 0 ? `${gradients.join(', ')}, #faf9f6` : '#faf9f6',
            transition: 'background 1.2s ease',
        };
    }, [anchor, trailPalette]);

    const handleNodeClick = useCallback((image: ImageNode) => {
        const nodeX = anchor
            ? centerX + (orbitNodes.find(n => n.image.id === image.id)?.distance ?? 0)
                * Math.cos(orbitNodes.find(n => n.image.id === image.id)?.angle ?? 0)
            : 0;
        const nodeY = anchor
            ? centerY + (orbitNodes.find(n => n.image.id === image.id)?.distance ?? 0)
                * Math.sin(orbitNodes.find(n => n.image.id === image.id)?.angle ?? 0)
            : 0;

        setTrail(t => [...t, {
            id: image.id,
            x: nodeX || centerX,
            y: nodeY || centerY,
            palette: image.palette,
        }]);
        setAnchorId(image.id);
    }, [anchor, orbitNodes, centerX, centerY]);

    const handleClear = useCallback(() => {
        setTrail([]);
        setAnchorId(null);
    }, []);

    // Tag lookup for annotations
    const tagMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const t of tags) map.set(t.id, t.label);
        return map;
    }, [tags]);

    // Shared tags between node and anchor
    const getSharedLabel = useCallback((img: ImageNode): string => {
        if (!anchor) return '';
        const at = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
        const shared = [...new Set([...img.tagIds, ...(img.aiTagIds || [])])]
            .filter(t => at.has(t))
            .map(t => tagMap.get(t) ?? '');
        return shared[0] || '';
    }, [anchor, tagMap]);

    // Hero size
    const heroSize = isMobile ? Math.min(canvasSize.w * 0.55, 260) : Math.min(canvasSize.w * 0.3, 360);

    return (
        <div className="fixed inset-0 overflow-hidden" style={surfaceStyle}>
            {/* Paper texture */}
            <div
                className="fixed inset-0 opacity-[0.02] pointer-events-none mix-blend-multiply z-0"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                    <h1
                        className="text-[10px] tracking-[0.25em] uppercase transition-colors duration-800"
                        style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            color: anchor?.palette?.[0] || '#a1a1aa',
                        }}
                    >
                        Tide Pool
                    </h1>
                    {trail.length > 0 && (
                        <span className="text-[9px] text-zinc-300" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {trail.length}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {trail.length > 0 && (
                        <button onClick={handleClear} className="text-[9px] text-zinc-300 hover:text-zinc-500 transition-colors tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            Clear
                        </button>
                    )}
                    <button onClick={onExit} className="text-[9px] text-zinc-300 hover:text-zinc-500 transition-colors tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Exit
                    </button>
                </div>
            </header>

            {/* Canvas */}
            <div ref={canvasRef} className="fixed inset-0">

                {/* Constellation trail SVG */}
                {trail.length > 1 && (
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-30">
                        <defs>
                            <filter id="tglow">
                                <feGaussianBlur stdDeviation="2" result="b" />
                                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                            </filter>
                        </defs>
                        {trail.slice(0, -1).map((pt, i) => {
                            const next = trail[i + 1];
                            const fade = Math.max(0.15, 0.5 - (trail.length - i - 1) * 0.05);
                            return (
                                <line key={`l${i}`} x1={pt.x} y1={pt.y} x2={next.x} y2={next.y}
                                    stroke={pt.palette[0] || '#a1a1aa'} strokeWidth={1.2}
                                    opacity={fade} filter="url(#tglow)" />
                            );
                        })}
                        {trail.map((pt, i) => (
                            <circle key={`d${i}`} cx={pt.x} cy={pt.y}
                                r={i === trail.length - 1 ? 4 : 2}
                                fill={pt.palette[0] || '#a1a1aa'}
                                opacity={Math.max(0.2, 0.6 - (trail.length - i - 1) * 0.05)}
                                filter="url(#tglow)" />
                        ))}
                    </svg>
                )}

                {/* === IDLE STATE: drifting sprite field === */}
                {!anchor && idleNodes.map(({ image, x, y }) => {
                    const breatheDuration = 5 + seededRandom(image.id + 'bd') * 6;
                    const breatheDelay = seededRandom(image.id + 'bl') * 4;
                    const spriteSize = isMobile ? 48 : 64;
                    return (
                        <div
                            key={image.id}
                            className="absolute cursor-pointer hover:scale-110 transition-transform duration-300"
                            style={{
                                left: x - spriteSize / 2,
                                top: y - spriteSize / 2,
                                animation: `drift ${breatheDuration}s ease-in-out ${breatheDelay}s infinite`,
                            }}
                            onClick={() => handleNodeClick(image)}
                        >
                            <MiniSprite image={image} size={spriteSize} />
                        </div>
                    );
                })}

                {/* === ANCHORED STATE: orbital layout === */}
                {anchor && orbitNodes.map(node => {
                    const x = centerX + node.distance * Math.cos(node.angle);
                    const y = centerY + node.distance * Math.sin(node.angle);

                    if (node.ring === 'hero') {
                        return (
                            <div
                                key={node.image.id}
                                className="absolute z-20 transition-all duration-700 ease-out"
                                style={{
                                    left: centerX - heroSize / 2,
                                    top: centerY - heroSize * 0.55,
                                    width: heroSize,
                                }}
                            >
                                <div
                                    className="overflow-hidden rounded-lg"
                                    style={{
                                        boxShadow: `0 12px 48px ${anchor.palette[0] || '#000'}40, 0 4px 16px ${anchor.palette[1] || '#000'}20`,
                                    }}
                                >
                                    <img
                                        src={getPreviewUrl(node.image.id)}
                                        alt=""
                                        className="w-full object-contain"
                                        style={{ maxHeight: isMobile ? '38vh' : '42vh' }}
                                        draggable={false}
                                    />
                                </div>
                                {/* Hero metadata */}
                                <div className="mt-2 text-center">
                                    <span className="text-xs" style={{ fontFamily: 'Caveat, cursive', color: anchor.palette[0] || '#71717a' }}>
                                        {new Date(node.image.captureTimestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </span>
                                    <span className="text-[9px] text-zinc-300 ml-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                        {node.image.cameraModel}
                                    </span>
                                </div>
                            </div>
                        );
                    }

                    if (node.ring === 'inner') {
                        // Photo thumbnail
                        const thumbSize = isMobile ? 64 : 88;
                        const sharedLabel = getSharedLabel(node.image);
                        const breatheDur = 6 + seededRandom(node.image.id + 'ib') * 4;
                        const breatheDel = seededRandom(node.image.id + 'id') * 3;
                        return (
                            <div
                                key={node.image.id}
                                className="absolute cursor-pointer z-20 transition-all duration-700 ease-out hover:scale-110"
                                style={{
                                    left: x - thumbSize / 2,
                                    top: y - thumbSize / 2,
                                    animation: `drift ${breatheDur}s ease-in-out ${breatheDel}s infinite`,
                                }}
                                onClick={() => handleNodeClick(node.image)}
                            >
                                <div
                                    className="overflow-hidden rounded-md"
                                    style={{
                                        width: thumbSize,
                                        height: thumbSize * 0.72,
                                        boxShadow: `0 3px 12px ${anchor.palette[0] || '#000'}20`,
                                    }}
                                >
                                    <img
                                        src={getThumbnailUrl(node.image.id)}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        draggable={false}
                                    />
                                </div>
                                {sharedLabel && (
                                    <div className="text-center mt-1">
                                        <span className="text-[8px]" style={{ fontFamily: 'Caveat, cursive', color: anchor.palette[0] || '#71717a' }}>
                                            {sharedLabel}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    }

                    // Outer ring: esoteric sprite
                    const spriteSize = isMobile ? 44 : 58;
                    const breatheDur = 7 + seededRandom(node.image.id + 'ob') * 5;
                    const breatheDel = seededRandom(node.image.id + 'od') * 4;
                    return (
                        <div
                            key={node.image.id}
                            className="absolute cursor-pointer z-10 transition-all duration-700 ease-out hover:scale-115"
                            style={{
                                left: x - spriteSize / 2,
                                top: y - spriteSize / 2,
                                opacity: node.isBridge ? 0.8 : 0.6,
                                animation: `drift ${breatheDur}s ease-in-out ${breatheDel}s infinite`,
                            }}
                            onClick={() => handleNodeClick(node.image)}
                        >
                            <MiniSprite image={node.image} size={spriteSize} isBridge={node.isBridge} />
                            {node.isBridge && (
                                <div className="text-center mt-0.5">
                                    <span className="text-[7px] text-zinc-400" style={{ fontFamily: 'Caveat, cursive' }}>
                                        {getSharedLabel(node.image) || 'bridge'}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Idle prompt */}
                {!anchor && images.length > 0 && (
                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-40 text-center">
                        <p className="text-zinc-300 text-sm" style={{ fontFamily: 'Caveat, cursive' }}>
                            Tap a sprite to begin
                        </p>
                    </div>
                )}
            </div>

            {/* Trail palette dots */}
            {trailPalette.length > 0 && (
                <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex gap-1.5">
                    {trailPalette.map((color, i) => (
                        <div key={`${color}-${i}`} className="w-2 h-2 rounded-full transition-all duration-700"
                            style={{ backgroundColor: color, opacity: 0.4 + (i / trailPalette.length) * 0.6, boxShadow: `0 0 6px ${color}30` }} />
                    ))}
                </div>
            )}
        </div>
    );
};

// --- Inject drift keyframes ---
if (typeof document !== 'undefined' && !document.getElementById('proto-drift-kf')) {
    const s = document.createElement('style');
    s.id = 'proto-drift-kf';
    s.textContent = `
@keyframes drift {
    0%, 100% { transform: translate(0, 0); }
    25% { transform: translate(3px, -4px); }
    50% { transform: translate(-2px, 3px); }
    75% { transform: translate(4px, 2px); }
}`;
    document.head.appendChild(s);
}

export default NavigationPrototype;
