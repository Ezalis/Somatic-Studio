import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ImageNode, Tag } from '../types';
import { getThumbnailUrl, getPreviewUrl } from '../services/immichService';

// --- Types ---

interface SessionCluster {
    id: string; // date string
    label: string;
    images: ImageNode[];
    // Layout position (percentage of viewport)
    cx: number;
    cy: number;
    // Breathing animation offset
    breatheDelay: number;
}

interface TrailPoint {
    imageId: string;
    x: number;
    y: number;
    palette: string[];
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

function formatSessionDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function clusterRelevance(cluster: SessionCluster, anchor: ImageNode | null): number {
    if (!anchor) return 0.5;
    if (cluster.id === anchor.shootDayClusterId) return 1.0;

    const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
    let maxOverlap = 0;
    for (const img of cluster.images) {
        const overlap = [...img.tagIds, ...(img.aiTagIds || [])].filter(t => anchorTags.has(t)).length;
        if (overlap > maxOverlap) maxOverlap = overlap;
    }
    if (maxOverlap >= 3) return 0.8;
    if (maxOverlap >= 1) return 0.5;
    return 0.2;
}

// --- Cluster Layout ---
// Distribute clusters in a loose organic arrangement

function layoutClusters(
    clusters: SessionCluster[],
    anchor: ImageNode | null,
    canvasW: number,
    canvasH: number,
): SessionCluster[] {
    if (clusters.length === 0) return clusters;

    if (!anchor) {
        // Idle state: arrange in a loose organic grid centered on canvas
        const cols = Math.ceil(Math.sqrt(clusters.length * (canvasW / canvasH)));
        const rows = Math.ceil(clusters.length / cols);
        const cellW = canvasW / (cols + 1);
        const cellH = canvasH / (rows + 1);

        return clusters.map((c, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            // Jitter within cell for organic feel
            const jx = (seededRandom(c.id + 'jx') - 0.5) * cellW * 0.4;
            const jy = (seededRandom(c.id + 'jy') - 0.5) * cellH * 0.3;
            return {
                ...c,
                cx: cellW * (col + 1) + jx,
                cy: cellH * (row + 1) + jy,
            };
        });
    }

    // Anchored state: anchor cluster near center, others arranged by relevance
    const anchorIdx = clusters.findIndex(c => c.id === anchor.shootDayClusterId);
    const centerX = canvasW * 0.5;
    const centerY = canvasH * 0.45;

    return clusters.map((c, i) => {
        if (i === anchorIdx) {
            return { ...c, cx: centerX, cy: centerY };
        }

        const rel = clusterRelevance(c, anchor);
        // Higher relevance = closer to center
        const distance = 180 + (1 - rel) * Math.min(canvasW, canvasH) * 0.35;
        // Spread around in a circle, skipping the anchor's position
        const otherIdx = i > anchorIdx ? i - 1 : i;
        const totalOthers = clusters.length - 1;
        const angle = (otherIdx / totalOthers) * Math.PI * 2 - Math.PI / 2;
        const jitter = (seededRandom(c.id + 'a') - 0.5) * 0.3;

        return {
            ...c,
            cx: centerX + Math.cos(angle + jitter) * distance,
            cy: centerY + Math.sin(angle + jitter) * distance,
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
    const [hoveredCluster, setHoveredCluster] = useState<string | null>(null);
    const [trail, setTrail] = useState<TrailPoint[]>([]);
    const canvasRef = useRef<HTMLDivElement>(null);
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

    const anchor = useMemo(
        () => (anchorId ? images.find(i => i.id === anchorId) ?? null : null),
        [anchorId, images]
    );

    // Measure canvas
    useEffect(() => {
        const measure = () => {
            if (canvasRef.current) {
                setCanvasSize({
                    w: canvasRef.current.clientWidth,
                    h: canvasRef.current.clientHeight,
                });
            }
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // Build session clusters
    const rawClusters = useMemo((): SessionCluster[] => {
        const groups = new Map<string, ImageNode[]>();
        for (const img of images) {
            const key = img.shootDayClusterId;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(img);
        }
        return Array.from(groups.entries())
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, imgs], i) => ({
                id: date,
                label: formatSessionDate(date),
                images: imgs.sort((a, b) => a.captureTimestamp - b.captureTimestamp),
                cx: 0,
                cy: 0,
                breatheDelay: (seededRandom(date) * 8),
            }));
    }, [images]);

    // Layout clusters
    const clusters = useMemo(
        () => layoutClusters(rawClusters, anchor, canvasSize.w, canvasSize.h),
        [rawClusters, anchor, canvasSize]
    );

    // Handle image click
    const handleImageClick = useCallback((image: ImageNode, clusterX: number, clusterY: number) => {
        setAnchorId(prev => {
            if (prev === image.id) return null; // Toggle off
            // Add to trail
            setTrail(t => [...t, {
                imageId: image.id,
                x: clusterX,
                y: clusterY,
                palette: image.palette,
                timestamp: Date.now(),
            }]);
            return image.id;
        });
    }, []);

    // Accumulated palette from trail
    const trailPalette = useMemo(() => {
        const colors: string[] = [];
        for (const point of trail) {
            for (const c of point.palette.slice(0, 2)) {
                if (!colors.includes(c)) colors.push(c);
            }
        }
        return colors.slice(-8); // Last 8 unique colors
    }, [trail]);

    // Surface background — accumulated palette wash
    const surfaceStyle = useMemo(() => {
        if (trailPalette.length === 0) {
            return { background: '#faf9f6' };
        }
        const gradients = trailPalette.map((color, i) => {
            const angle = (i / trailPalette.length) * 360;
            const radius = 30 + (i % 3) * 20;
            const x = 50 + Math.cos(angle * Math.PI / 180) * 30;
            const y = 50 + Math.sin(angle * Math.PI / 180) * 25;
            return `radial-gradient(ellipse at ${x}% ${y}%, ${color}12, transparent ${radius}%)`;
        });
        return {
            background: `${gradients.join(', ')}, #faf9f6`,
            transition: 'background 2s ease',
        };
    }, [trailPalette]);

    // Tag lookup
    const tagMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const t of tags) map.set(t.id, t.label);
        return map;
    }, [tags]);

    return (
        <div className="fixed inset-0 overflow-hidden" style={surfaceStyle}>
            {/* Paper texture */}
            <div
                className="fixed inset-0 opacity-[0.025] pointer-events-none mix-blend-multiply"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Constellation trail SVG */}
            {trail.length > 1 && (
                <svg className="fixed inset-0 w-full h-full pointer-events-none z-10" style={{ opacity: 0.3 }}>
                    <defs>
                        <filter id="trail-glow">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    {trail.slice(0, -1).map((point, i) => {
                        const next = trail[i + 1];
                        const color = point.palette[0] || '#a1a1aa';
                        return (
                            <line
                                key={`trail-${i}`}
                                x1={point.x}
                                y1={point.y}
                                x2={next.x}
                                y2={next.y}
                                stroke={color}
                                strokeWidth={1.5}
                                strokeOpacity={0.6 - (trail.length - i - 1) * 0.08}
                                filter="url(#trail-glow)"
                            />
                        );
                    })}
                    {trail.map((point, i) => (
                        <circle
                            key={`dot-${i}`}
                            cx={point.x}
                            cy={point.y}
                            r={i === trail.length - 1 ? 4 : 2.5}
                            fill={point.palette[0] || '#a1a1aa'}
                            opacity={0.7 - (trail.length - i - 1) * 0.06}
                            filter="url(#trail-glow)"
                        />
                    ))}
                </svg>
            )}

            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-4">
                    <h1
                        className="text-[11px] tracking-[0.3em] text-zinc-300 uppercase"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    >
                        Tide Pool
                    </h1>
                    {trail.length > 0 && (
                        <span
                            className="text-[10px] text-zinc-300"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}
                        >
                            {trail.length} explored
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {trail.length > 0 && (
                        <button
                            onClick={() => { setTrail([]); setAnchorId(null); }}
                            className="text-[10px] text-zinc-300 hover:text-zinc-500 transition-colors tracking-widest uppercase"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}
                        >
                            Clear
                        </button>
                    )}
                    <button
                        onClick={onExit}
                        className="text-[10px] text-zinc-300 hover:text-zinc-500 transition-colors tracking-widest uppercase"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    >
                        Exit
                    </button>
                </div>
            </header>

            {/* Canvas */}
            <div ref={canvasRef} className="fixed inset-0 z-20">
                {canvasSize.w > 0 && clusters.map(cluster => {
                    const rel = clusterRelevance(cluster, anchor);
                    const isAnchorCluster = anchor && cluster.id === anchor.shootDayClusterId;
                    const isHovered = hoveredCluster === cluster.id;
                    const isExpanded = isAnchorCluster || isHovered;

                    return (
                        <ClusterNode
                            key={cluster.id}
                            cluster={cluster}
                            anchor={anchor}
                            relevance={rel}
                            isAnchorCluster={!!isAnchorCluster}
                            isExpanded={!!isExpanded}
                            onHover={setHoveredCluster}
                            onImageClick={handleImageClick}
                            tagMap={tagMap}
                        />
                    );
                })}
            </div>

            {/* Trail palette strip — bottom of screen */}
            {trailPalette.length > 0 && (
                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-1">
                    {trailPalette.map((color, i) => (
                        <div
                            key={`${color}-${i}`}
                            className="w-3 h-3 rounded-full transition-all duration-700"
                            style={{
                                backgroundColor: color,
                                opacity: 0.6 + (i / trailPalette.length) * 0.4,
                                boxShadow: `0 0 8px ${color}40`,
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// --- Cluster Node ---

interface ClusterNodeProps {
    cluster: SessionCluster;
    anchor: ImageNode | null;
    relevance: number;
    isAnchorCluster: boolean;
    isExpanded: boolean;
    onHover: (id: string | null) => void;
    onImageClick: (image: ImageNode, cx: number, cy: number) => void;
    tagMap: Map<string, string>;
}

const ClusterNode: React.FC<ClusterNodeProps> = ({
    cluster, anchor, relevance, isAnchorCluster, isExpanded, onHover, onImageClick, tagMap,
}) => {
    const imgCount = cluster.images.length;

    // Determine blur based on relevance (abstract → resolved)
    const baseBlur = isExpanded ? 0 : Math.round((1 - relevance) * 20 + 4);
    const clusterScale = isAnchorCluster ? 1.0 : (isExpanded ? 0.85 : 0.5 + relevance * 0.3);
    const clusterOpacity = isAnchorCluster ? 1.0 : (0.5 + relevance * 0.5);

    // Image positions within the cluster
    const imagePositions = useMemo(() => {
        if (imgCount === 0) return [];

        if (isExpanded) {
            // Fan out in a loose circle
            const radius = isAnchorCluster ? 80 : 50;
            return cluster.images.map((img, i) => {
                const isHero = anchor && img.id === anchor.id;
                if (isHero) return { img, x: 0, y: 0, rot: 0, isHero: true };

                const angle = ((i) / imgCount) * Math.PI * 2 - Math.PI / 2;
                const jitter = (seededRandom(img.id + 'fan') - 0.5) * 15;
                return {
                    img,
                    x: Math.cos(angle) * (radius + jitter),
                    y: Math.sin(angle) * (radius + jitter),
                    rot: (seededRandom(img.id + 'r') - 0.5) * 8,
                    isHero: false,
                };
            });
        }

        // Collapsed: overlapping pile
        return cluster.images.map((img, i) => ({
            img,
            x: (seededRandom(img.id + 'px') - 0.5) * 20,
            y: (seededRandom(img.id + 'py') - 0.5) * 15 - i * 2,
            rot: (seededRandom(img.id + 'r') - 0.5) * 12,
            isHero: false,
        }));
    }, [cluster.images, imgCount, isExpanded, isAnchorCluster, anchor]);

    // Shared tags between cluster and anchor (for annotation)
    const sharedTags = useMemo(() => {
        if (!anchor || isAnchorCluster) return [];
        const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
        const clusterTags = new Set<string>();
        for (const img of cluster.images) {
            for (const t of [...img.tagIds, ...(img.aiTagIds || [])]) {
                if (anchorTags.has(t)) clusterTags.add(t);
            }
        }
        return Array.from(clusterTags).slice(0, 3).map(t => tagMap.get(t) ?? t);
    }, [anchor, isAnchorCluster, cluster.images, tagMap]);

    return (
        <div
            className="absolute transition-all duration-1000 ease-out"
            style={{
                left: cluster.cx,
                top: cluster.cy,
                transform: `translate(-50%, -50%) scale(${clusterScale})`,
                opacity: clusterOpacity,
                zIndex: isAnchorCluster ? 30 : (isExpanded ? 25 : 10),
                animation: `breathe ${6 + cluster.breatheDelay}s ease-in-out ${cluster.breatheDelay}s infinite`,
            }}
            onMouseEnter={() => onHover(cluster.id)}
            onMouseLeave={() => onHover(null)}
        >
            {/* Images in cluster */}
            <div className="relative" style={{ width: isExpanded ? 240 : 100, height: isExpanded ? 200 : 80 }}>
                {imagePositions.map(({ img, x, y, rot, isHero }) => {
                    const imgBlur = isHero ? 0 : (isExpanded ? 1 : baseBlur);
                    const imgSize = isHero ? 160 : (isExpanded ? 70 : 55);
                    const imgHeight = isHero ? 120 : (isExpanded ? 50 : 40);

                    return (
                        <div
                            key={img.id}
                            className="absolute cursor-pointer transition-all duration-700 ease-out hover:z-20"
                            style={{
                                left: '50%',
                                top: '50%',
                                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${rot}deg)`,
                                zIndex: isHero ? 15 : 10,
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onImageClick(img, cluster.cx, cluster.cy);
                            }}
                        >
                            <div
                                className={`overflow-hidden rounded-sm shadow-md transition-all duration-700 ${
                                    isHero ? 'ring-2 ring-white/50 shadow-xl rounded-md' : 'hover:shadow-lg'
                                }`}
                            >
                                <img
                                    src={isHero ? getPreviewUrl(img.id) : getThumbnailUrl(img.id)}
                                    alt=""
                                    className="object-cover transition-all duration-700 ease-out"
                                    style={{
                                        width: imgSize,
                                        height: imgHeight,
                                        filter: `blur(${imgBlur}px)`,
                                        transform: `scale(${1 + imgBlur * 0.015})`,
                                    }}
                                    loading="lazy"
                                    draggable={false}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Date label — shows on hover or when anchor cluster */}
            <div
                className={`absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap transition-opacity duration-500 ${
                    isExpanded ? 'opacity-80' : 'opacity-0'
                }`}
            >
                <span
                    className="text-sm text-zinc-500"
                    style={{ fontFamily: 'Caveat, cursive' }}
                >
                    {cluster.label}
                </span>
            </div>

            {/* Shared tag annotation */}
            {sharedTags.length > 0 && isExpanded && (
                <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span
                        className="text-[9px] text-zinc-400"
                        style={{ fontFamily: 'Caveat, cursive' }}
                    >
                        {sharedTags.join(' · ')}
                    </span>
                </div>
            )}
        </div>
    );
};

// --- Breathing keyframes (injected once) ---
const styleSheet = document.createElement('style');
styleSheet.textContent = `
@keyframes breathe {
    0%, 100% { transform: translate(-50%, -50%) scale(var(--cluster-scale, 1)) translateY(0px); }
    50% { transform: translate(-50%, -50%) scale(var(--cluster-scale, 1)) translateY(-4px); }
}
`;
if (!document.getElementById('breathe-keyframes')) {
    styleSheet.id = 'breathe-keyframes';
    document.head.appendChild(styleSheet);
}

export default NavigationPrototype;
