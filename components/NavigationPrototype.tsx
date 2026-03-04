import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ImageNode, Tag } from '../types';
import { getThumbnailUrl, getPreviewUrl } from '../services/immichService';

// --- Types ---

interface TrailPoint {
    imageId: string;
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

function formatSessionDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Score image relevance to anchor (0-1) */
function scoreRelevance(image: ImageNode, anchor: ImageNode): number {
    if (image.id === anchor.id) return 1;

    let score = 0;

    // Same session = strong signal
    if (image.shootDayClusterId === anchor.shootDayClusterId) score += 0.4;

    // Tag overlap
    const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
    const overlap = [...image.tagIds, ...(image.aiTagIds || [])].filter(t => anchorTags.has(t)).length;
    score += Math.min(overlap * 0.12, 0.4);

    // Same camera/lens bonus
    if (image.cameraModel === anchor.cameraModel && anchor.cameraModel !== 'Unknown Camera') score += 0.05;
    if (image.lensModel === anchor.lensModel && anchor.lensModel !== 'Unknown Lens') score += 0.05;

    // Season match
    if (image.inferredSeason === anchor.inferredSeason) score += 0.05;

    // Temporal proximity (within 30 days = bonus)
    const daysDiff = Math.abs(image.captureTimestamp - anchor.captureTimestamp) / (1000 * 60 * 60 * 24);
    if (daysDiff < 30) score += 0.05 * (1 - daysDiff / 30);

    return Math.min(score, 1);
}

/** Get the top N most relevant images to the anchor */
function getNeighborhood(images: ImageNode[], anchor: ImageNode, count: number): ImageNode[] {
    return images
        .filter(img => img.id !== anchor.id)
        .map(img => ({ img, score: scoreRelevance(img, anchor) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map(({ img }) => img);
}

// --- Main Component ---

interface NavigationPrototypeProps {
    images: ImageNode[];
    tags: Tag[];
    onExit: () => void;
}

const NavigationPrototype: React.FC<NavigationPrototypeProps> = ({ images, tags, onExit }) => {
    const [anchorId, setAnchorId] = useState<string | null>(null);
    const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
    const [trail, setTrail] = useState<TrailPoint[]>([]);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    const anchor = useMemo(
        () => (anchorId ? images.find(i => i.id === anchorId) ?? null : null),
        [anchorId, images]
    );

    const neighborCount = isMobile ? 8 : 14;

    // Curated neighborhood
    const neighborhood = useMemo(() => {
        if (!anchor) return [];
        return getNeighborhood(images, anchor, neighborCount);
    }, [anchor, images, neighborCount]);

    // Group neighborhood by session for cluster display
    const neighborClusters = useMemo(() => {
        if (!anchor) return [];
        const groups = new Map<string, ImageNode[]>();
        // Add same-session images first
        for (const img of neighborhood) {
            const key = img.shootDayClusterId;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(img);
        }
        return Array.from(groups.entries()).map(([date, imgs]) => ({
            date,
            label: formatSessionDate(date),
            images: imgs.sort((a, b) => a.captureTimestamp - b.captureTimestamp),
            isSameSession: date === anchor.shootDayClusterId,
        }));
    }, [anchor, neighborhood]);

    // Initial idle state: show session clusters as previews
    const idleClusters = useMemo(() => {
        if (anchor) return [];
        const groups = new Map<string, ImageNode[]>();
        for (const img of images) {
            const key = img.shootDayClusterId;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(img);
        }
        return Array.from(groups.entries())
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, imgs]) => ({
                date,
                label: formatSessionDate(date),
                images: imgs.sort((a, b) => a.captureTimestamp - b.captureTimestamp),
            }));
    }, [images, anchor]);

    // Accumulated trail palette
    const trailPalette = useMemo(() => {
        const colors: string[] = [];
        for (const point of trail) {
            for (const c of point.palette.slice(0, 2)) {
                if (!colors.includes(c)) colors.push(c);
            }
        }
        return colors.slice(-8);
    }, [trail]);

    // Palette CSS custom properties from anchor
    const accentColors = useMemo(() => {
        const p = anchor?.palette ?? [];
        return {
            '--accent-1': p[0] || '#a1a1aa',
            '--accent-2': p[1] || p[0] || '#a1a1aa',
            '--accent-3': p[2] || p[0] || '#a1a1aa',
            '--accent-4': p[3] || p[0] || '#a1a1aa',
            '--accent-5': p[4] || p[0] || '#a1a1aa',
        } as React.CSSProperties;
    }, [anchor]);

    // Background — stronger palette impact + accumulated trail wash
    const surfaceStyle = useMemo((): React.CSSProperties => {
        const gradients: string[] = [];

        // Active anchor palette — vivid
        if (anchor?.palette?.length) {
            const p = anchor.palette;
            gradients.push(
                `radial-gradient(ellipse at 50% 30%, ${p[0]}30, transparent 70%)`,
                `radial-gradient(ellipse at 85% 70%, ${p[1] || p[0]}22, transparent 60%)`,
                `radial-gradient(ellipse at 15% 80%, ${p[2] || p[0]}18, transparent 55%)`,
            );
        }

        // Trail wash — accumulated colors, gentler
        for (let i = 0; i < trailPalette.length; i++) {
            const angle = (i / trailPalette.length) * 360;
            const x = 50 + Math.cos(angle * Math.PI / 180) * 35;
            const y = 50 + Math.sin(angle * Math.PI / 180) * 30;
            gradients.push(`radial-gradient(ellipse at ${x}% ${y}%, ${trailPalette[i]}0C, transparent 40%)`);
        }

        return {
            background: gradients.length > 0
                ? `${gradients.join(', ')}, #faf9f6`
                : '#faf9f6',
            transition: 'background 1.2s ease',
        };
    }, [anchor, trailPalette]);

    const handleAnchor = useCallback((image: ImageNode) => {
        setAnchorId(prev => {
            if (prev === image.id) return null;
            setTrail(t => [...t, { imageId: image.id, palette: image.palette }]);
            setExpandedCluster(null);
            return image.id;
        });
    }, []);

    const handleClusterTap = useCallback((date: string) => {
        setExpandedCluster(prev => prev === date ? null : date);
    }, []);

    const handleClear = useCallback(() => {
        setTrail([]);
        setAnchorId(null);
        setExpandedCluster(null);
    }, []);

    // Tag lookup
    const tagMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const t of tags) map.set(t.id, t.label);
        return map;
    }, [tags]);

    // Shared tags between two images
    const getSharedTags = useCallback((img: ImageNode): string[] => {
        if (!anchor) return [];
        const at = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
        return [...new Set([...img.tagIds, ...(img.aiTagIds || [])])]
            .filter(t => at.has(t))
            .map(t => tagMap.get(t) ?? t);
    }, [anchor, tagMap]);

    return (
        <div
            className="fixed inset-0 overflow-y-auto overflow-x-hidden"
            style={{ ...surfaceStyle, ...accentColors }}
        >
            {/* Paper texture — very lightweight */}
            <div
                className="fixed inset-0 opacity-[0.02] pointer-events-none mix-blend-multiply z-0"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Header */}
            <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 backdrop-blur-sm bg-[#faf9f6]/40">
                <div className="flex items-center gap-3">
                    <h1
                        className="text-[10px] tracking-[0.25em] uppercase"
                        style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            color: anchor ? 'var(--accent-1)' : '#a1a1aa',
                            transition: 'color 0.8s ease',
                        }}
                    >
                        Tide Pool
                    </h1>
                    {trail.length > 0 && (
                        <span
                            className="text-[9px]"
                            style={{
                                fontFamily: 'JetBrains Mono, monospace',
                                color: anchor ? 'var(--accent-2)' : '#d4d4d8',
                                transition: 'color 0.8s ease',
                            }}
                        >
                            {trail.length} explored
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {trail.length > 0 && (
                        <button
                            onClick={handleClear}
                            className="text-[9px] tracking-widest uppercase transition-colors"
                            style={{
                                fontFamily: 'JetBrains Mono, monospace',
                                color: 'var(--accent-2, #d4d4d8)',
                            }}
                        >
                            Clear
                        </button>
                    )}
                    <button
                        onClick={onExit}
                        className="text-[9px] text-zinc-300 hover:text-zinc-500 transition-colors tracking-widest uppercase"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    >
                        Exit
                    </button>
                </div>
            </header>

            {/* Content */}
            <div className="relative z-10 px-4 pb-16">

                {/* === ANCHORED STATE === */}
                {anchor && (
                    <div className="max-w-5xl mx-auto">
                        {/* Hero image — ~40% of viewport */}
                        <div className="flex justify-center mb-6">
                            <div
                                className="relative overflow-hidden rounded-lg transition-shadow duration-700"
                                style={{
                                    maxWidth: isMobile ? '100%' : '60%',
                                    boxShadow: `0 8px 40px ${anchor.palette[0] || '#00000020'}35,
                                                0 2px 12px ${anchor.palette[1] || '#00000010'}20`,
                                }}
                            >
                                <img
                                    src={getPreviewUrl(anchor.id)}
                                    alt={anchor.fileName}
                                    className="w-full object-contain transition-all duration-500"
                                    style={{
                                        maxHeight: isMobile ? '38vh' : '42vh',
                                    }}
                                    draggable={false}
                                />
                                {/* Hero info */}
                                <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/40 to-transparent">
                                    <p
                                        className="text-white/90 text-sm"
                                        style={{ fontFamily: 'Caveat, cursive' }}
                                    >
                                        {formatSessionDate(anchor.shootDayClusterId)}
                                    </p>
                                    <p
                                        className="text-white/50 text-[9px] mt-0.5"
                                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                                    >
                                        {anchor.cameraModel} · {anchor.lensModel}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Constellation trail — horizontal strip */}
                        {trail.length > 1 && (
                            <div className="flex items-center justify-center gap-1 mb-6">
                                {trail.map((point, i) => {
                                    const isCurrent = point.imageId === anchorId;
                                    return (
                                        <React.Fragment key={`t-${i}`}>
                                            <div
                                                className="rounded-full transition-all duration-500"
                                                style={{
                                                    width: isCurrent ? 10 : 6,
                                                    height: isCurrent ? 10 : 6,
                                                    backgroundColor: point.palette[0] || '#a1a1aa',
                                                    opacity: 0.4 + (i / trail.length) * 0.6,
                                                    boxShadow: isCurrent
                                                        ? `0 0 12px ${point.palette[0] || '#a1a1aa'}60`
                                                        : 'none',
                                                }}
                                            />
                                            {i < trail.length - 1 && (
                                                <div
                                                    className="h-px transition-all duration-500"
                                                    style={{
                                                        width: 12,
                                                        backgroundColor: point.palette[0] || '#d4d4d8',
                                                        opacity: 0.2 + (i / trail.length) * 0.3,
                                                    }}
                                                />
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        )}

                        {/* Neighborhood clusters */}
                        {neighborClusters.map(cluster => {
                            const isExpanded = cluster.isSameSession || expandedCluster === cluster.date;
                            const shared = cluster.images.length > 0 ? getSharedTags(cluster.images[0]) : [];

                            return (
                                <div key={cluster.date} className="mb-5">
                                    {/* Cluster header */}
                                    <div
                                        className="flex items-baseline gap-2 mb-2 cursor-pointer"
                                        onClick={() => handleClusterTap(cluster.date)}
                                    >
                                        <span
                                            className="text-sm transition-colors duration-500"
                                            style={{
                                                fontFamily: 'Caveat, cursive',
                                                color: cluster.isSameSession
                                                    ? 'var(--accent-1, #52525b)'
                                                    : '#71717a',
                                            }}
                                        >
                                            {cluster.isSameSession ? 'This session' : cluster.label}
                                        </span>
                                        {shared.length > 0 && !cluster.isSameSession && (
                                            <span
                                                className="text-[9px] transition-colors duration-500"
                                                style={{
                                                    fontFamily: 'Caveat, cursive',
                                                    color: 'var(--accent-2, #a1a1aa)',
                                                }}
                                            >
                                                {shared.slice(0, 2).join(', ')}
                                            </span>
                                        )}
                                        <span
                                            className="text-[9px] text-zinc-300"
                                            style={{ fontFamily: 'JetBrains Mono, monospace' }}
                                        >
                                            {cluster.images.length}
                                        </span>
                                    </div>

                                    {/* Images */}
                                    {isExpanded ? (
                                        /* Expanded: show all images in the cluster */
                                        <div className="flex flex-wrap gap-2">
                                            {cluster.images.map(img => {
                                                const rel = scoreRelevance(img, anchor);
                                                const imgShared = getSharedTags(img);
                                                return (
                                                    <div
                                                        key={img.id}
                                                        className="relative cursor-pointer group"
                                                        onClick={() => handleAnchor(img)}
                                                        style={{
                                                            transform: `rotate(${(seededRandom(img.id + 'r') - 0.5) * 4}deg)`,
                                                        }}
                                                    >
                                                        <div
                                                            className="overflow-hidden rounded-md transition-all duration-300"
                                                            style={{
                                                                boxShadow: `0 2px 8px ${anchor.palette[0] || '#000'}15`,
                                                            }}
                                                        >
                                                            <img
                                                                src={getThumbnailUrl(img.id)}
                                                                alt=""
                                                                className="object-cover transition-opacity duration-300"
                                                                style={{
                                                                    width: isMobile ? 80 : 110,
                                                                    height: isMobile ? 60 : 78,
                                                                    opacity: 0.7 + rel * 0.3,
                                                                }}
                                                                loading="lazy"
                                                                draggable={false}
                                                            />
                                                        </div>
                                                        {/* Shared tag label on hover (desktop) / always (mobile) */}
                                                        {imgShared.length > 0 && (
                                                            <div
                                                                className={`absolute -bottom-4 left-0 right-0 text-center pointer-events-none transition-opacity duration-300 ${
                                                                    isMobile ? 'opacity-60' : 'opacity-0 group-hover:opacity-70'
                                                                }`}
                                                            >
                                                                <span
                                                                    className="text-[8px]"
                                                                    style={{
                                                                        fontFamily: 'Caveat, cursive',
                                                                        color: 'var(--accent-1, #71717a)',
                                                                    }}
                                                                >
                                                                    {imgShared[0]}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        /* Collapsed: stacked preview — show top 3 overlapping */
                                        <div
                                            className="relative cursor-pointer h-16 w-28"
                                            onClick={() => handleClusterTap(cluster.date)}
                                        >
                                            {cluster.images.slice(0, 3).map((img, i) => (
                                                <div
                                                    key={img.id}
                                                    className="absolute overflow-hidden rounded-sm transition-transform duration-500"
                                                    style={{
                                                        left: i * 10,
                                                        top: i * 3,
                                                        transform: `rotate(${(seededRandom(img.id + 'sr') - 0.5) * 8}deg)`,
                                                        zIndex: 3 - i,
                                                        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                                    }}
                                                >
                                                    <img
                                                        src={getThumbnailUrl(img.id)}
                                                        alt=""
                                                        className="object-cover"
                                                        style={{
                                                            width: 64,
                                                            height: 48,
                                                            opacity: 0.85 - i * 0.15,
                                                        }}
                                                        loading="lazy"
                                                        draggable={false}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* === IDLE STATE (no anchor) === */}
                {!anchor && (
                    <div className="max-w-5xl mx-auto">
                        <p
                            className="text-center text-zinc-300 text-sm mb-8 mt-4"
                            style={{ fontFamily: 'Caveat, cursive' }}
                        >
                            Tap a cluster to explore
                        </p>

                        <div className={`grid gap-6 ${isMobile ? 'grid-cols-2' : 'grid-cols-3 md:grid-cols-4'}`}>
                            {idleClusters.map(cluster => {
                                const isExpanded = expandedCluster === cluster.date;
                                const topImages = cluster.images.slice(0, isExpanded ? cluster.images.length : 4);

                                return (
                                    <div key={cluster.date} className="space-y-1">
                                        <div
                                            className="cursor-pointer"
                                            onClick={() => handleClusterTap(cluster.date)}
                                        >
                                            {/* Stack preview */}
                                            <div className="relative" style={{ height: isExpanded ? 'auto' : 100 }}>
                                                {isExpanded ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {topImages.map(img => (
                                                            <div
                                                                key={img.id}
                                                                className="overflow-hidden rounded-sm cursor-pointer"
                                                                onClick={(e) => { e.stopPropagation(); handleAnchor(img); }}
                                                                style={{
                                                                    transform: `rotate(${(seededRandom(img.id + 'r') - 0.5) * 3}deg)`,
                                                                }}
                                                            >
                                                                <img
                                                                    src={getThumbnailUrl(img.id)}
                                                                    alt=""
                                                                    className="object-cover rounded-sm"
                                                                    style={{
                                                                        width: isMobile ? 70 : 80,
                                                                        height: isMobile ? 52 : 58,
                                                                    }}
                                                                    loading="lazy"
                                                                    draggable={false}
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    topImages.slice(0, 3).map((img, i) => (
                                                        <div
                                                            key={img.id}
                                                            className="absolute overflow-hidden rounded-sm transition-transform duration-700"
                                                            style={{
                                                                left: i * 12,
                                                                top: i * 4,
                                                                transform: `rotate(${(seededRandom(img.id + 'ir') - 0.5) * 10}deg)`,
                                                                zIndex: 3 - i,
                                                                boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
                                                            }}
                                                        >
                                                            <img
                                                                src={getThumbnailUrl(img.id)}
                                                                alt=""
                                                                className="object-cover"
                                                                style={{
                                                                    width: isMobile ? 80 : 90,
                                                                    height: isMobile ? 58 : 65,
                                                                    opacity: 0.9 - i * 0.15,
                                                                }}
                                                                loading="lazy"
                                                                draggable={false}
                                                            />
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                        {/* Date label */}
                                        <div className="flex items-baseline gap-1.5 pt-1">
                                            <span
                                                className="text-xs text-zinc-400"
                                                style={{ fontFamily: 'Caveat, cursive' }}
                                            >
                                                {cluster.label}
                                            </span>
                                            <span
                                                className="text-[9px] text-zinc-300"
                                                style={{ fontFamily: 'JetBrains Mono, monospace' }}
                                            >
                                                {cluster.images.length}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Trail palette dots — bottom of screen */}
            {trailPalette.length > 0 && (
                <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex gap-1.5">
                    {trailPalette.map((color, i) => (
                        <div
                            key={`${color}-${i}`}
                            className="w-2.5 h-2.5 rounded-full transition-all duration-700"
                            style={{
                                backgroundColor: color,
                                opacity: 0.5 + (i / trailPalette.length) * 0.5,
                                boxShadow: `0 0 6px ${color}30`,
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default NavigationPrototype;
