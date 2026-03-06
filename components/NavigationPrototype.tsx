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

interface AssociationCluster {
    label: string;
    type: 'tag' | 'camera' | 'lens' | 'season' | 'palette';
    images: ScoredImage[];
    convergence: number; // 0-1, how close to anchor
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

function colorDistance(a: string, b: string): number {
    const parse = (hex: string) => {
        const h = hex.replace('#', '');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };
    try {
        const [r1, g1, b1] = parse(a);
        const [r2, g2, b2] = parse(b);
        return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) / 441.67; // normalized 0-1
    } catch { return 1; }
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

function buildAssociationClusters(scored: ScoredImage[], anchor: ImageNode, tagMap: Map<string, string>): AssociationCluster[] {
    const nonTemporal = scored.filter(s => !s.isTemporalNeighbor && s.score > 0.05);
    const clusters: AssociationCluster[] = [];

    // Group by shared tags
    const tagGroups = new Map<string, ScoredImage[]>();
    for (const s of nonTemporal) {
        for (const tagId of s.sharedTags) {
            if (!tagGroups.has(tagId)) tagGroups.set(tagId, []);
            const group = tagGroups.get(tagId)!;
            if (!group.find(x => x.image.id === s.image.id)) group.push(s);
        }
    }
    for (const [tagId, imgs] of tagGroups) {
        if (imgs.length >= 1) {
            const avgScore = imgs.reduce((sum, s) => sum + s.score, 0) / imgs.length;
            clusters.push({
                label: tagMap.get(tagId) || tagId,
                type: 'tag',
                images: imgs.sort((a, b) => b.score - a.score).slice(0, 6),
                convergence: avgScore,
            });
        }
    }

    // Camera cluster
    const cameraImgs = nonTemporal.filter(s => s.sharedCamera);
    if (cameraImgs.length >= 1) {
        clusters.push({
            label: anchor.cameraModel,
            type: 'camera',
            images: cameraImgs.slice(0, 6),
            convergence: 0.4,
        });
    }

    // Lens cluster
    const lensImgs = nonTemporal.filter(s => s.sharedLens);
    if (lensImgs.length >= 1) {
        clusters.push({
            label: anchor.lensModel,
            type: 'lens',
            images: lensImgs.slice(0, 6),
            convergence: 0.35,
        });
    }

    // Season cluster
    const seasonImgs = nonTemporal.filter(s => s.sharedSeason);
    if (seasonImgs.length >= 1 && anchor.inferredSeason) {
        clusters.push({
            label: anchor.inferredSeason,
            type: 'season',
            images: seasonImgs.slice(0, 6),
            convergence: 0.3,
        });
    }

    // Sort: highest convergence first
    clusters.sort((a, b) => b.convergence - a.convergence);
    return clusters.slice(0, 8);
}

// --- Mini Sprite ---

const MiniSprite: React.FC<{ image: ImageNode; size: number; convergence?: number }> = React.memo(({ image, size, convergence }) => {
    const palette = image.palette.length > 0
        ? image.palette
        : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];

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
                    <ellipse key={i} cx={tx} cy={ty} rx={rx} ry={ry}
                        fill={color} fillOpacity={0.55}
                        transform={`rotate(${(seed * (i + 1)) % 360}, ${tx}, ${ty})`} />
                );
            })}
            <circle cx="50" cy="50" r={16} fill={palette[0]} opacity={0.85} />
            {convergence != null && (
                <circle cx="50" cy="50" r={22} fill="none" stroke={palette[0]}
                    strokeWidth={convergence > 0.5 ? 1.2 : 0.8}
                    strokeDasharray={convergence < 0.3 ? '3,3' : 'none'}
                    opacity={ringOpacity} />
            )}
        </svg>
    );
});

// --- Timeline Mini Component ---

const TemporalTimeline: React.FC<{
    allImages: ImageNode[];
    temporalImages: ScoredImage[];
    anchor: ImageNode;
    onSelect: (img: ImageNode) => void;
}> = ({ allImages, temporalImages, anchor, onSelect }) => {
    if (temporalImages.length === 0) return null;

    const allTimestamps = allImages.map(i => i.captureTimestamp).sort((a, b) => a - b);
    const minTs = allTimestamps[0];
    const maxTs = allTimestamps[allTimestamps.length - 1];
    const range = maxTs - minTs || 1;

    // Anchor position on timeline
    const anchorPos = (anchor.captureTimestamp - minTs) / range;

    // Temporal neighbor range
    const temporalTs = temporalImages.map(s => s.image.captureTimestamp);
    const tMin = Math.min(anchor.captureTimestamp, ...temporalTs);
    const tMax = Math.max(anchor.captureTimestamp, ...temporalTs);
    const tMinPos = (tMin - minTs) / range;
    const tMaxPos = (tMax - minTs) / range;

    // Date labels
    const minDate = new Date(minTs);
    const maxDate = new Date(maxTs);
    const anchorDate = new Date(anchor.captureTimestamp);
    const formatShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const formatAnchor = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <div className="flex flex-col h-full">
            <div className="px-3 py-2 flex-shrink-0">
                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Timeline
                </span>
                <span className="text-[9px] text-zinc-300 ml-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {temporalImages.length} nearby
                </span>
            </div>

            {/* Mini timeline bar */}
            <div className="px-3 mb-3 flex-shrink-0">
                <div className="relative h-6">
                    {/* Full range bar */}
                    <div className="absolute top-2.5 left-0 right-0 h-[2px] bg-zinc-200 rounded-full" />
                    {/* Active period highlight */}
                    <div className="absolute top-1 h-4 rounded-full transition-all duration-700"
                        style={{
                            left: `${tMinPos * 100}%`,
                            width: `${Math.max((tMaxPos - tMinPos) * 100, 2)}%`,
                            backgroundColor: `${anchor.palette[0] || '#52525b'}25`,
                            border: `1px solid ${anchor.palette[0] || '#52525b'}30`,
                        }} />
                    {/* Anchor dot */}
                    <div className="absolute top-1.5 w-2 h-2 rounded-full transition-all duration-500 -translate-x-1/2"
                        style={{
                            left: `${anchorPos * 100}%`,
                            backgroundColor: anchor.palette[0] || '#52525b',
                            boxShadow: `0 0 6px ${anchor.palette[0] || '#52525b'}50`,
                        }} />
                    {/* All image dots (sparse) */}
                    {allImages.filter((_, i: number) => i % Math.max(1, Math.floor(allImages.length / 40)) === 0).map((img: ImageNode) => {
                        const pos = (img.captureTimestamp - minTs) / range;
                        return (
                            <div key={img.id} className="absolute top-[11px] w-[3px] h-[3px] rounded-full bg-zinc-300 -translate-x-1/2"
                                style={{ left: `${pos * 100}%`, opacity: 0.4 }} />
                        );
                    })}
                </div>
                {/* Labels */}
                <div className="flex justify-between mt-0.5">
                    <span className="text-[8px] text-zinc-300" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{formatShort(minDate)}</span>
                    <span className="text-[9px]" style={{ fontFamily: 'Caveat, cursive', color: anchor.palette[0] || '#71717a' }}>{formatAnchor(anchorDate)}</span>
                    <span className="text-[8px] text-zinc-300" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{formatShort(maxDate)}</span>
                </div>
            </div>

            {/* Thumbnails */}
            <div className="flex-1 overflow-y-auto px-3 pb-3">
                <div className="flex flex-wrap gap-2 justify-center">
                    {temporalImages.map(({ image }: ScoredImage) => {
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

// --- Association Clusters Zone ---

const AssociationZone: React.FC<{
    clusters: AssociationCluster[];
    anchor: ImageNode;
    onSelect: (img: ImageNode) => void;
}> = ({ clusters, anchor, onSelect }) => {
    if (clusters.length === 0) return null;

    const typeIcon = (type: string) => {
        switch (type) {
            case 'camera': return 'cam';
            case 'lens': return 'lens';
            case 'season': return 'season';
            default: return 'tag';
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="px-3 py-2 flex-shrink-0">
                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Associations
                </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
                {clusters.map((cluster: AssociationCluster, ci: number) => {
                    const breatheDur = 5 + ci * 0.7;
                    const convergenceLabel = cluster.convergence > 0.5 ? 'strong' : cluster.convergence > 0.25 ? 'moderate' : 'distant';
                    return (
                        <div key={cluster.label + ci}>
                            {/* Cluster header */}
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-[8px] px-1 py-0.5 rounded uppercase tracking-wider"
                                    style={{
                                        fontFamily: 'JetBrains Mono, monospace',
                                        backgroundColor: `${anchor.palette[0] || '#52525b'}${Math.round(cluster.convergence * 25).toString(16).padStart(2, '0')}`,
                                        color: anchor.palette[0] || '#52525b',
                                        opacity: 0.5 + cluster.convergence * 0.5,
                                    }}>
                                    {typeIcon(cluster.type)}
                                </span>
                                <span className="text-[10px] truncate"
                                    style={{ fontFamily: 'Caveat, cursive', color: anchor.palette[0] || '#71717a' }}>
                                    {cluster.label}
                                </span>
                                <span className="text-[7px] text-zinc-300 ml-auto flex-shrink-0" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                    {convergenceLabel}
                                </span>
                            </div>
                            {/* Sprites */}
                            <div className="flex flex-wrap gap-2 justify-start">
                                {cluster.images.map(({ image, score }: ScoredImage) => {
                                    const bd = breatheDur + seededRandom(image.id + 'ab') * 4;
                                    const delay = seededRandom(image.id + 'ad') * 3;
                                    return (
                                        <div key={image.id}
                                            className="cursor-pointer hover:scale-110 transition-transform duration-300"
                                            style={{ animation: `drift ${bd}s ease-in-out ${delay}s infinite` }}
                                            onClick={() => onSelect(image)}>
                                            <MiniSprite image={image} size={44} convergence={score} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- Trail Zone ---

const TrailZone: React.FC<{
    trail: TrailPoint[];
    onSelect: (id: string) => void;
}> = ({ trail, onSelect }) => {
    if (trail.length < 1) return null;
    const svgRef = useRef<SVGSVGElement>(null);
    const width = 180;
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
                    {trail.map((pt: TrailPoint, i: number) => {
                        const cx = width / 2 + (seededRandom(pt.id + 'tx') - 0.5) * 60;
                        const cy = 20 + i * nodeSpacing;
                        const nextPt = trail[i + 1];
                        const nextCx = nextPt ? width / 2 + (seededRandom(nextPt.id + 'tx') - 0.5) * 60 : 0;
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
                                {pt.palette.slice(0, 3).map((color: string, ci: number) => (
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

// --- Bottom Detail Panel ---

const DetailPanel: React.FC<{
    image: ImageNode;
    allImages: ImageNode[];
    tagMap: Map<string, string>;
    onNavigate: (img: ImageNode) => void;
    isOpen: boolean;
    onToggle: () => void;
}> = ({ image, allImages, tagMap, onNavigate, isOpen, onToggle }) => {
    const [previewGroup, setPreviewGroup] = useState<{ label: string; images: ImageNode[] } | null>(null);
    const allTagIds = [...new Set([...image.tagIds, ...(image.aiTagIds || [])])];

    const getImagesForTag = useCallback((tagId: string) => {
        return allImages.filter((img: ImageNode) => img.id !== image.id && (img.tagIds.includes(tagId) || img.aiTagIds?.includes(tagId))).slice(0, 10);
    }, [allImages, image.id]);

    const getImagesForCamera = useCallback((camera: string) => {
        return allImages.filter((img: ImageNode) => img.id !== image.id && img.cameraModel === camera).slice(0, 10);
    }, [allImages, image.id]);

    const getImagesForLens = useCallback((lens: string) => {
        return allImages.filter((img: ImageNode) => img.id !== image.id && img.lensModel === lens).slice(0, 10);
    }, [allImages, image.id]);

    const getImagesForSeason = useCallback((season: string) => {
        return allImages.filter((img: ImageNode) => img.id !== image.id && img.inferredSeason === season).slice(0, 10);
    }, [allImages, image.id]);

    const handleTagClick = useCallback((tagId: string) => {
        const label = tagMap.get(tagId) || tagId;
        const imgs = getImagesForTag(tagId);
        if (previewGroup?.label === label) {
            setPreviewGroup(null);
        } else {
            setPreviewGroup({ label, images: imgs });
        }
    }, [tagMap, getImagesForTag, previewGroup]);

    const handleCameraClick = useCallback((camera: string) => {
        const imgs = getImagesForCamera(camera);
        if (previewGroup?.label === camera) {
            setPreviewGroup(null);
        } else {
            setPreviewGroup({ label: camera, images: imgs });
        }
    }, [getImagesForCamera, previewGroup]);

    const handleLensClick = useCallback((lens: string) => {
        const imgs = getImagesForLens(lens);
        if (previewGroup?.label === lens) {
            setPreviewGroup(null);
        } else {
            setPreviewGroup({ label: lens, images: imgs });
        }
    }, [getImagesForLens, previewGroup]);

    const handleSeasonClick = useCallback((season: string) => {
        const imgs = getImagesForSeason(season);
        if (previewGroup?.label === season) {
            setPreviewGroup(null);
        } else {
            setPreviewGroup({ label: season, images: imgs });
        }
    }, [getImagesForSeason, previewGroup]);

    // Reset preview when anchor changes
    useEffect(() => { setPreviewGroup(null); }, [image.id]);

    return (
        <div className={`fixed left-0 right-0 bottom-0 z-50 transition-transform duration-500 ease-out ${isOpen ? 'translate-y-0' : 'translate-y-[calc(100%-32px)]'}`}
            style={{ height: previewGroup ? 280 : 200 }}>
            {/* Tab */}
            <button onClick={onToggle}
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full h-7 px-4 rounded-t-md flex items-center justify-center transition-colors cursor-pointer"
                style={{ backgroundColor: `${image.palette[0] || '#52525b'}15` }}>
                <span className="text-zinc-400 text-[9px] tracking-widest uppercase" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {isOpen ? 'close' : 'details'}
                </span>
            </button>

            <div className="h-full overflow-hidden rounded-t-xl" style={{ backgroundColor: '#faf9f6f0', backdropFilter: 'blur(12px)' }}>
                <div className="h-full overflow-y-auto px-6 py-4">
                    <div className="flex gap-8 items-start flex-wrap">
                        {/* Tags */}
                        <div className="min-w-[140px]">
                            <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                Tags
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                                {allTagIds.map((tagId: string) => {
                                    const label = tagMap.get(tagId) || tagId;
                                    const isActive = previewGroup?.label === label;
                                    return (
                                        <button key={tagId} onClick={() => handleTagClick(tagId)}
                                            className="px-2 py-0.5 rounded-full text-[10px] transition-all cursor-pointer"
                                            style={{
                                                fontFamily: 'Inter, sans-serif',
                                                backgroundColor: isActive ? `${image.palette[0] || '#52525b'}30` : `${image.palette[0] || '#52525b'}10`,
                                                color: image.palette[0] || '#52525b',
                                                outline: isActive ? `1px solid ${image.palette[0] || '#52525b'}40` : 'none',
                                            }}>
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Camera & Lens */}
                        <div className="min-w-[100px]">
                            <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                Gear
                            </span>
                            <div className="space-y-1">
                                {image.cameraModel !== 'Unknown Camera' && (
                                    <button onClick={() => handleCameraClick(image.cameraModel)}
                                        className="block text-[11px] transition-colors cursor-pointer"
                                        style={{
                                            fontFamily: 'Inter, sans-serif',
                                            color: previewGroup?.label === image.cameraModel ? image.palette[0] || '#52525b' : '#71717a',
                                        }}>
                                        {image.cameraModel}
                                    </button>
                                )}
                                {image.lensModel !== 'Unknown Lens' && (
                                    <button onClick={() => handleLensClick(image.lensModel)}
                                        className="block text-[11px] transition-colors cursor-pointer"
                                        style={{
                                            fontFamily: 'Inter, sans-serif',
                                            color: previewGroup?.label === image.lensModel ? image.palette[0] || '#52525b' : '#71717a',
                                        }}>
                                        {image.lensModel}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Season */}
                        {image.inferredSeason && (
                            <div>
                                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                    Season
                                </span>
                                <button onClick={() => handleSeasonClick(image.inferredSeason)}
                                    className="text-[11px] transition-colors cursor-pointer"
                                    style={{
                                        fontFamily: 'Inter, sans-serif',
                                        color: previewGroup?.label === image.inferredSeason ? image.palette[0] || '#52525b' : '#71717a',
                                    }}>
                                    {image.inferredSeason}
                                </button>
                            </div>
                        )}

                        {/* EXIF */}
                        <div>
                            <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                Technical
                            </span>
                            <div className="flex gap-3 text-[10px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                {image.iso && <span>ISO {image.iso}</span>}
                                {image.focalLength && <span>{image.focalLength}mm</span>}
                                {image.aperture && <span>f/{image.aperture}</span>}
                                {image.shutterSpeed && <span>{image.shutterSpeed}</span>}
                            </div>
                        </div>

                        {/* Palette */}
                        <div>
                            <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                Palette
                            </span>
                            <div className="flex gap-1.5">
                                {image.palette.map((color: string, i: number) => (
                                    <div key={i} className="w-5 h-5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 1px 4px ${color}40` }} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Preview thumbnails row */}
                    {previewGroup && previewGroup.images.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-zinc-200/50">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[9px] tracking-[0.15em] uppercase text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                    {previewGroup.label}
                                </span>
                                <span className="text-[8px] text-zinc-300" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                    {previewGroup.images.length} images
                                </span>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {previewGroup.images.map((img: ImageNode) => (
                                    <div key={img.id}
                                        className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform duration-200 rounded-md overflow-hidden"
                                        style={{ width: 72, height: 52, boxShadow: `0 2px 6px ${image.palette[0] || '#000'}15` }}
                                        onClick={() => onNavigate(img)}>
                                        <img src={getThumbnailUrl(img.id)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Hero Zone ---

const HeroZone: React.FC<{ image: ImageNode }> = ({ image }) => {
    return (
        <div className="flex flex-col items-center justify-center h-full p-4">
            <div className="overflow-hidden rounded-lg max-w-full"
                style={{ boxShadow: `0 16px 64px ${image.palette[0] || '#000'}35, 0 4px 24px ${image.palette[1] || '#000'}20` }}>
                <img src={getPreviewUrl(image.id)} alt="" className="max-h-[55vh] max-w-full object-contain" draggable={false} />
            </div>
            <div className="mt-3 text-center">
                <span className="text-sm" style={{ fontFamily: 'Caveat, cursive', color: image.palette[0] || '#71717a' }}>
                    {new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
                {image.cameraModel !== 'Unknown Camera' && (
                    <span className="text-[10px] text-zinc-300 ml-3" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {image.cameraModel}
                    </span>
                )}
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

    const anchor = useMemo(() => anchorId ? images.find((i: ImageNode) => i.id === anchorId) ?? null : null, [anchorId, images]);

    // Score all images relative to anchor
    const scored = useMemo(() => {
        if (!anchor) return [];
        return images
            .filter((img: ImageNode) => img.id !== anchor.id)
            .map((img: ImageNode) => scoreRelevance(img, anchor))
            .sort((a: ScoredImage, b: ScoredImage) => b.score - a.score);
    }, [anchor, images]);

    // Zone populations
    const temporalNeighbors = useMemo(() => scored.filter((s: ScoredImage) => s.isTemporalNeighbor).slice(0, 12), [scored]);
    const associationClusters = useMemo(() => anchor ? buildAssociationClusters(scored, anchor, tagMap) : [], [scored, anchor, tagMap]);

    // Dynamic zone weights
    const zoneWeights = useMemo(() => {
        const t = temporalNeighbors.length;
        const a = associationClusters.reduce((sum: number, c: AssociationCluster) => sum + c.images.length, 0);
        const total = Math.max(t + a, 1);
        const temporalWeight = t > 0 ? Math.min(0.5, Math.max(0.2, t / total)) : 0;
        const assocWeight = a > 0 ? 1 - temporalWeight : 0;
        return { temporal: temporalWeight, assoc: assocWeight };
    }, [temporalNeighbors, associationClusters]);

    // Surface
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
        setTrail((t: TrailPoint[]) => [...t, { id: image.id, palette: image.palette, label }]);
        setAnchorId(image.id);
    }, []);

    const handleTrailSelect = useCallback((id: string) => {
        const img = images.find((i: ImageNode) => i.id === id);
        if (img) handleSelect(img);
    }, [images, handleSelect]);

    const handleClear = useCallback(() => {
        setTrail([]);
        setAnchorId(null);
        setDrawerOpen(false);
    }, []);

    const hasTemporalZone = temporalNeighbors.length > 0;
    const hasAssocZone = associationClusters.length > 0;

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

            {/* IDLE */}
            {!anchor && canvasSize.w > 0 && (
                <IdleField images={images} onSelect={handleSelect} canvasW={canvasSize.w} canvasH={canvasSize.h} />
            )}

            {/* DASHBOARD */}
            {anchor && (
                <div className="fixed inset-0 pt-12 px-4 flex gap-3 z-10" style={{ paddingBottom: drawerOpen ? 210 : 44 }}>
                    {/* Trail — left */}
                    {trail.length > 0 && (
                        <div className="flex-shrink-0 rounded-xl transition-all duration-500"
                            style={{ width: 140, backgroundColor: '#faf9f6cc' }}>
                            <TrailZone trail={trail} onSelect={handleTrailSelect} />
                        </div>
                    )}

                    {/* Hero — center */}
                    <div className="flex-1 min-w-0 flex items-center justify-center rounded-xl transition-all duration-500">
                        <HeroZone image={anchor} />
                    </div>

                    {/* Right column */}
                    {(hasTemporalZone || hasAssocZone) && (
                        <div className="flex-shrink-0 flex flex-col gap-3 transition-all duration-500"
                            style={{ width: Math.min(320, canvasSize.w * 0.25) }}>
                            {hasTemporalZone && (
                                <div className="rounded-xl overflow-hidden transition-all duration-500"
                                    style={{
                                        flex: hasAssocZone ? `${zoneWeights.temporal} 1 0%` : '1 1 auto',
                                        backgroundColor: '#faf9f6cc',
                                    }}>
                                    <TemporalTimeline allImages={images} temporalImages={temporalNeighbors}
                                        anchor={anchor} onSelect={handleSelect} />
                                </div>
                            )}
                            {hasAssocZone && (
                                <div className="rounded-xl overflow-hidden transition-all duration-500"
                                    style={{
                                        flex: hasTemporalZone ? `${zoneWeights.assoc} 1 0%` : '1 1 auto',
                                        backgroundColor: '#faf9f6cc',
                                    }}>
                                    <AssociationZone clusters={associationClusters} anchor={anchor} onSelect={handleSelect} />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Bottom detail panel */}
            {anchor && (
                <DetailPanel image={anchor} allImages={images} tagMap={tagMap}
                    onNavigate={handleSelect} isOpen={drawerOpen}
                    onToggle={() => setDrawerOpen((o: boolean) => !o)} />
            )}

            {/* Trail palette dots */}
            {trail.length > 0 && !drawerOpen && (
                <div className="fixed bottom-9 left-1/2 -translate-x-1/2 z-40 flex gap-1">
                    {trail.slice(-10).map((pt: TrailPoint, i: number) => (
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
