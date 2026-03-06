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
    convergence: number;
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

    const cameraImgs = nonTemporal.filter(s => s.sharedCamera);
    if (cameraImgs.length >= 1) {
        clusters.push({ label: anchor.cameraModel, type: 'camera', images: cameraImgs.slice(0, 6), convergence: 0.4 });
    }

    const lensImgs = nonTemporal.filter(s => s.sharedLens);
    if (lensImgs.length >= 1) {
        clusters.push({ label: anchor.lensModel, type: 'lens', images: lensImgs.slice(0, 6), convergence: 0.35 });
    }

    const seasonImgs = nonTemporal.filter(s => s.sharedSeason);
    if (seasonImgs.length >= 1 && anchor.inferredSeason) {
        clusters.push({ label: anchor.inferredSeason, type: 'season', images: seasonImgs.slice(0, 6), convergence: 0.3 });
    }

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

// --- Trail woven into center canvas ---

const WovenTrail: React.FC<{
    trail: TrailPoint[];
    centerX: number;
    centerY: number;
    heroW: number;
    heroH: number;
    onSelect: (id: string) => void;
}> = ({ trail, centerX, centerY, heroW, heroH, onSelect }) => {
    if (trail.length < 2) return null;

    // Place trail nodes in an orbit around the hero, spiraling outward
    const nodes = useMemo(() => {
        const minRadius = Math.max(heroW, heroH) * 0.55 + 20;
        const maxRadius = minRadius + Math.min(trail.length * 12, 120);
        return trail.map((pt: TrailPoint, i: number) => {
            const t = i / Math.max(trail.length - 1, 1);
            const radius = minRadius + t * (maxRadius - minRadius);
            // Spiral: start at top-left, wind around
            const angle = -Math.PI * 0.6 + t * Math.PI * 1.8 + (seededRandom(pt.id + 'ta') - 0.5) * 0.3;
            return {
                ...pt,
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
                radius,
                isCurrent: i === trail.length - 1,
                fade: Math.max(0.15, 0.6 - (trail.length - 1 - i) * 0.05),
            };
        });
    }, [trail, centerX, centerY, heroW, heroH]);

    return (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-15" style={{ zIndex: 15 }}>
            <defs>
                <filter id="trailglow">
                    <feGaussianBlur stdDeviation="2" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
            </defs>
            {/* Connecting threads */}
            {nodes.slice(0, -1).map((node, i: number) => {
                const next = nodes[i + 1];
                // Curved path between nodes
                const midX = (node.x + next.x) / 2 + (seededRandom(node.id + 'mx') - 0.5) * 30;
                const midY = (node.y + next.y) / 2 + (seededRandom(node.id + 'my') - 0.5) * 30;
                return (
                    <path key={`line-${i}`}
                        d={`M ${node.x} ${node.y} Q ${midX} ${midY} ${next.x} ${next.y}`}
                        fill="none"
                        stroke={node.palette[0] || '#a1a1aa'}
                        strokeWidth={1}
                        opacity={node.fade * 0.5}
                        filter="url(#trailglow)" />
                );
            })}
            {/* Trail nodes */}
            {nodes.map((node, i: number) => (
                <g key={`node-${i}`} className="pointer-events-auto cursor-pointer" onClick={() => onSelect(node.id)}>
                    {/* Color ring from palette */}
                    {node.palette.slice(0, 3).map((color: string, ci: number) => (
                        <circle key={ci}
                            cx={node.x} cy={node.y}
                            r={node.isCurrent ? 10 - ci * 2 : 7 - ci * 1.5}
                            fill="none" stroke={color}
                            strokeWidth={node.isCurrent ? 1.5 : 1}
                            opacity={node.fade * (0.6 - ci * 0.15)} />
                    ))}
                    {/* Center dot */}
                    <circle cx={node.x} cy={node.y}
                        r={node.isCurrent ? 4 : 2.5}
                        fill={node.palette[0] || '#a1a1aa'}
                        opacity={node.fade}
                        filter="url(#trailglow)" />
                    {/* Subtle label for current */}
                    {node.isCurrent && (
                        <text x={node.x} y={node.y - 14}
                            textAnchor="middle" fontSize="8"
                            fill={node.palette[0] || '#71717a'}
                            opacity={0.5}
                            style={{ fontFamily: 'Caveat, cursive' }}>
                            {trail.length}
                        </text>
                    )}
                </g>
            ))}
        </svg>
    );
};

// --- Timeline Zone ---

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

    const anchorPos = (anchor.captureTimestamp - minTs) / range;
    const temporalTs = temporalImages.map(s => s.image.captureTimestamp);
    const tMin = Math.min(anchor.captureTimestamp, ...temporalTs);
    const tMax = Math.max(anchor.captureTimestamp, ...temporalTs);
    const tMinPos = (tMin - minTs) / range;
    const tMaxPos = (tMax - minTs) / range;

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
            <div className="px-3 mb-3 flex-shrink-0">
                <div className="relative h-6">
                    <div className="absolute top-2.5 left-0 right-0 h-[2px] bg-zinc-200 rounded-full" />
                    <div className="absolute top-1 h-4 rounded-full transition-all duration-700"
                        style={{
                            left: `${tMinPos * 100}%`,
                            width: `${Math.max((tMaxPos - tMinPos) * 100, 2)}%`,
                            backgroundColor: `${anchor.palette[0] || '#52525b'}25`,
                            border: `1px solid ${anchor.palette[0] || '#52525b'}30`,
                        }} />
                    <div className="absolute top-1.5 w-2 h-2 rounded-full transition-all duration-500 -translate-x-1/2"
                        style={{
                            left: `${anchorPos * 100}%`,
                            backgroundColor: anchor.palette[0] || '#52525b',
                            boxShadow: `0 0 6px ${anchor.palette[0] || '#52525b'}50`,
                        }} />
                    {allImages.filter((_: ImageNode, i: number) => i % Math.max(1, Math.floor(allImages.length / 40)) === 0).map((img: ImageNode) => {
                        const pos = (img.captureTimestamp - minTs) / range;
                        return (
                            <div key={img.id} className="absolute top-[11px] w-[3px] h-[3px] rounded-full bg-zinc-300 -translate-x-1/2"
                                style={{ left: `${pos * 100}%`, opacity: 0.4 }} />
                        );
                    })}
                </div>
                <div className="flex justify-between mt-0.5">
                    <span className="text-[8px] text-zinc-300" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{formatShort(minDate)}</span>
                    <span className="text-[9px]" style={{ fontFamily: 'Caveat, cursive', color: anchor.palette[0] || '#71717a' }}>{formatAnchor(anchorDate)}</span>
                    <span className="text-[8px] text-zinc-300" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{formatShort(maxDate)}</span>
                </div>
            </div>
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

// --- Detail Panel (now left sidebar) ---

const DetailPanel: React.FC<{
    image: ImageNode;
    allImages: ImageNode[];
    tagMap: Map<string, string>;
    onNavigate: (img: ImageNode) => void;
}> = ({ image, allImages, tagMap, onNavigate }) => {
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

    const togglePreview = useCallback((label: string, imgs: ImageNode[]) => {
        setPreviewGroup(prev => prev?.label === label ? null : { label, images: imgs });
    }, []);

    useEffect(() => { setPreviewGroup(null); }, [image.id]);

    return (
        <div className="flex flex-col h-full overflow-y-auto py-2 px-3">
            {/* Tags */}
            <div className="mb-4">
                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Tags
                </span>
                <div className="flex flex-wrap gap-1.5">
                    {allTagIds.map((tagId: string) => {
                        const label = tagMap.get(tagId) || tagId;
                        const isActive = previewGroup?.label === label;
                        return (
                            <button key={tagId} onClick={() => togglePreview(label, getImagesForTag(tagId))}
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
                {/* Inline preview for tags */}
                {previewGroup && allTagIds.some((t: string) => (tagMap.get(t) || t) === previewGroup.label) && previewGroup.images.length > 0 && (
                    <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                        {previewGroup.images.map((img: ImageNode) => (
                            <div key={img.id}
                                className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform duration-200 rounded overflow-hidden"
                                style={{ width: 52, height: 38, boxShadow: `0 1px 4px ${image.palette[0] || '#000'}15` }}
                                onClick={() => onNavigate(img)}>
                                <img src={getThumbnailUrl(img.id)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Camera */}
            {image.cameraModel !== 'Unknown Camera' && (
                <div className="mb-3">
                    <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Camera
                    </span>
                    <button onClick={() => togglePreview(image.cameraModel, getImagesForCamera(image.cameraModel))}
                        className="text-[11px] transition-colors cursor-pointer"
                        style={{
                            fontFamily: 'Inter, sans-serif',
                            color: previewGroup?.label === image.cameraModel ? image.palette[0] || '#52525b' : '#71717a',
                        }}>
                        {image.cameraModel} &rarr;
                    </button>
                    {previewGroup?.label === image.cameraModel && previewGroup.images.length > 0 && (
                        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
                            {previewGroup.images.map((img: ImageNode) => (
                                <div key={img.id}
                                    className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform duration-200 rounded overflow-hidden"
                                    style={{ width: 52, height: 38 }}
                                    onClick={() => onNavigate(img)}>
                                    <img src={getThumbnailUrl(img.id)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Lens */}
            {image.lensModel !== 'Unknown Lens' && (
                <div className="mb-3">
                    <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Lens
                    </span>
                    <button onClick={() => togglePreview(image.lensModel, getImagesForLens(image.lensModel))}
                        className="text-[11px] transition-colors cursor-pointer"
                        style={{
                            fontFamily: 'Inter, sans-serif',
                            color: previewGroup?.label === image.lensModel ? image.palette[0] || '#52525b' : '#71717a',
                        }}>
                        {image.lensModel} &rarr;
                    </button>
                    {previewGroup?.label === image.lensModel && previewGroup.images.length > 0 && (
                        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
                            {previewGroup.images.map((img: ImageNode) => (
                                <div key={img.id}
                                    className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform duration-200 rounded overflow-hidden"
                                    style={{ width: 52, height: 38 }}
                                    onClick={() => onNavigate(img)}>
                                    <img src={getThumbnailUrl(img.id)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Season */}
            {image.inferredSeason && (
                <div className="mb-3">
                    <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-400 block mb-1" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Season
                    </span>
                    <button onClick={() => togglePreview(image.inferredSeason, getImagesForSeason(image.inferredSeason))}
                        className="text-[11px] transition-colors cursor-pointer"
                        style={{
                            fontFamily: 'Inter, sans-serif',
                            color: previewGroup?.label === image.inferredSeason ? image.palette[0] || '#52525b' : '#71717a',
                        }}>
                        {image.inferredSeason} &rarr;
                    </button>
                    {previewGroup?.label === image.inferredSeason && previewGroup.images.length > 0 && (
                        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
                            {previewGroup.images.map((img: ImageNode) => (
                                <div key={img.id}
                                    className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform duration-200 rounded overflow-hidden"
                                    style={{ width: 52, height: 38 }}
                                    onClick={() => onNavigate(img)}>
                                    <img src={getThumbnailUrl(img.id)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* EXIF */}
            <div className="mb-3">
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
                    {image.palette.map((color: string, i: number) => (
                        <div key={i} className="w-5 h-5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 1px 4px ${color}40` }} />
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- Hero Zone ---

const HeroZone: React.FC<{ image: ImageNode; heroRef: React.RefObject<HTMLDivElement | null> }> = ({ image, heroRef }) => {
    return (
        <div ref={heroRef} className="flex flex-col items-center justify-center h-full p-4">
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
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const heroRef = useRef<HTMLDivElement>(null);
    const [heroRect, setHeroRect] = useState({ w: 0, h: 0 });

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

    // Track hero size for trail positioning
    useEffect(() => {
        if (!heroRef.current) return;
        const obs = new ResizeObserver(entries => {
            for (const entry of entries) {
                setHeroRect({ w: entry.contentRect.width, h: entry.contentRect.height });
            }
        });
        obs.observe(heroRef.current);
        return () => obs.disconnect();
    }, [anchorId]);

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
    const associationClusters = useMemo(() => anchor ? buildAssociationClusters(scored, anchor, tagMap) : [], [scored, anchor, tagMap]);

    const zoneWeights = useMemo(() => {
        const t = temporalNeighbors.length;
        const a = associationClusters.reduce((sum: number, c: AssociationCluster) => sum + c.images.length, 0);
        const total = Math.max(t + a, 1);
        const temporalWeight = t > 0 ? Math.min(0.5, Math.max(0.2, t / total)) : 0;
        const assocWeight = a > 0 ? 1 - temporalWeight : 0;
        return { temporal: temporalWeight, assoc: assocWeight };
    }, [temporalNeighbors, associationClusters]);

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
        setTrail((t: TrailPoint[]) => [...t, { id: image.id, palette: image.palette, label, timestamp: image.captureTimestamp }]);
        setAnchorId(image.id);
    }, []);

    const handleTrailSelect = useCallback((id: string) => {
        const img = images.find((i: ImageNode) => i.id === id);
        if (img) handleSelect(img);
    }, [images, handleSelect]);

    const handleClear = useCallback(() => {
        setTrail([]);
        setAnchorId(null);
    }, []);

    // Compute center of hero area for trail positioning
    // Left panel ~220px, right panel ~320px, hero fills the middle
    const leftPanelWidth = anchor ? 220 : 0;
    const rightPanelWidth = (temporalNeighbors.length > 0 || associationClusters.length > 0) ? Math.min(320, canvasSize.w * 0.25) : 0;
    const centerX = leftPanelWidth + (canvasSize.w - leftPanelWidth - rightPanelWidth) / 2;
    const centerY = canvasSize.h * 0.45;

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
                <>
                    {/* Woven trail — SVG layer behind/around hero */}
                    <WovenTrail trail={trail} centerX={centerX} centerY={centerY}
                        heroW={heroRect.w || 300} heroH={heroRect.h || 300}
                        onSelect={handleTrailSelect} />

                    <div className="fixed inset-0 pt-12 pb-4 px-4 flex gap-3 z-10">
                        {/* LEFT: Detail panel (structured navigation) */}
                        <div className="flex-shrink-0 rounded-xl overflow-hidden transition-all duration-500"
                            style={{ width: 220, backgroundColor: '#faf9f6cc' }}>
                            <DetailPanel image={anchor} allImages={images} tagMap={tagMap} onNavigate={handleSelect} />
                        </div>

                        {/* CENTER: Hero with trail woven around it */}
                        <div className="flex-1 min-w-0 flex items-center justify-center rounded-xl transition-all duration-500 relative">
                            <HeroZone image={anchor} heroRef={heroRef} />
                        </div>

                        {/* RIGHT: Esoteric navigation (timeline + associations) */}
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
                </>
            )}

            {/* Trail palette dots at bottom */}
            {trail.length > 0 && (
                <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-40 flex gap-1">
                    {trail.slice(-12).map((pt: TrailPoint, i: number) => (
                        <div key={pt.id + i} className="w-1.5 h-1.5 rounded-full transition-all duration-700"
                            style={{ backgroundColor: pt.palette[0] || '#a1a1aa', opacity: 0.3 + (i / 12) * 0.7 }} />
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
