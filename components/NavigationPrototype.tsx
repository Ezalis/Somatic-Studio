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
    activeColors: Set<string>;
    temporalActive: boolean;
    onToggleTag: (tagId: string) => void;
    onToggleColor: (hex: string) => void;
    onToggleTemporal: () => void;
    onNavigate: (img: ImageNode) => void;
    albumPreview?: React.ReactNode;
    albumImages?: AlbumImage[];
}> = ({ image, allImages, temporalImages, scored, tagMap, activeTags, activeColors, temporalActive, onToggleTag, onToggleColor, onToggleTemporal, onNavigate, albumPreview, albumImages }) => {
    const palette = image.palette.length > 0 ? image.palette : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];
    const anchorTagIds = [...new Set([...image.tagIds, ...(image.aiTagIds || [])])];
    const anchorTagSet = new Set(anchorTagIds);

    // Discovery tags: from album pool images when filters active, otherwise from top scored neighbors
    const hasFilters = activeTags.size > 0 || activeColors.size > 0 || temporalActive;
    const discoveryTags = useMemo(() => {
        const tagCounts = new Map<string, number>();
        const excludeTags = new Set([...anchorTagSet, ...activeTags]);

        const sourceImages = hasFilters && albumImages && albumImages.length > 0
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
        // Sort by frequency, take top 15
        return [...tagCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([tagId]) => tagId);
    }, [scored, anchorTagSet, activeTags, hasFilters, albumImages]);

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

            {/* Sprite DNA — Palette (clickable for album) */}
            <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-zinc-200/40">
                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-500 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Palette — click to build album
                </span>
                <div className="flex gap-2 flex-wrap">
                    {palette.slice(0, 5).map((color: string, i: number) => {
                        const isActive = activeColors.has(color);
                        return (
                            <button key={i} onClick={() => onToggleColor(color)}
                                className="flex items-center gap-1.5 cursor-pointer transition-all"
                                style={{ opacity: isActive ? 1 : 0.7 }}>
                                <div className="rounded-full transition-all" style={{
                                    backgroundColor: color,
                                    width: isActive ? 18 : 14,
                                    height: isActive ? 18 : 14,
                                    outline: isActive ? '2px solid rgba(0,0,0,0.3)' : 'none',
                                    outlineOffset: 1,
                                }} />
                                <span className="text-[8px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                    {i === 0 ? 'core' : ''}
                                </span>
                            </button>
                        );
                    })}
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
                {/* Temporal neighbor thumbnails */}
                {hasNeighbors && (
                    <div className="mt-2">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[8px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                Same period
                            </span>
                            <button onClick={onToggleTemporal}
                                className="text-[8px] cursor-pointer transition-all px-1.5 py-0.5 rounded"
                                style={{
                                    fontFamily: 'JetBrains Mono, monospace',
                                    backgroundColor: temporalActive ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.04)',
                                    color: temporalActive ? '#18181b' : '#71717a',
                                    fontWeight: temporalActive ? 600 : 400,
                                }}>
                                {temporalActive ? '✓ In album' : '+ Add to album'}
                            </button>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                            {temporalImages.map((s: ScoredImage) => (
                                <div key={s.image.id}
                                    className="rounded overflow-hidden cursor-pointer hover:scale-105 transition-transform"
                                    style={{ width: 36, height: 36 }}
                                    onClick={() => onNavigate(s.image)}>
                                    <img src={getThumbnailUrl(s.image.id)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Tags — this image */}
            <div className="flex-shrink-0 px-3 pt-2 pb-2 border-b border-zinc-200/40">
                <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-500 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    This image — click to build album
                </span>
                <div className="flex flex-wrap gap-1.5">
                    {anchorTagIds.map((tagId: string) => {
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

            {/* Discovery tags — from nearby images */}
            {discoveryTags.length > 0 && (
                <div className="flex-1 px-3 pt-2 pb-3">
                    <span className="text-[9px] tracking-[0.2em] uppercase text-zinc-500 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Discover nearby
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                        {discoveryTags.map((tagId: string) => {
                            const label = tagMap.get(tagId) || tagId;
                            const isActive = activeTags.has(tagId);
                            return (
                                <button key={tagId} onClick={() => onToggleTag(tagId)}
                                    className="px-2 py-0.5 rounded-full text-[10px] transition-all cursor-pointer"
                                    style={{
                                        fontFamily: 'Inter, sans-serif',
                                        backgroundColor: isActive ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.02)',
                                        color: isActive ? '#18181b' : '#71717a',
                                        outline: isActive ? '1.5px solid rgba(0,0,0,0.25)' : '1px dashed rgba(0,0,0,0.12)',
                                        fontWeight: isActive ? 600 : 400,
                                    }}>
                                    {isActive ? '+ ' : ''}{label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Album preview slot (used in tablet/mobile bottom sheet) */}
            {albumPreview && (
                <div className="border-t border-zinc-200/40 mt-2">
                    {albumPreview}
                </div>
            )}
        </div>
    );
};

// --- Dynamic Album ---

interface AlbumImage {
    image: ImageNode;
    tagHits: number;
    isTemporal: boolean;
}

// Color distance (simple Euclidean in RGB)
function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function colorDist(a: string, b: string): number {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}
const COLOR_THRESHOLD = 80; // max RGB distance to count as a "hit"

// --- Waterfall Album Field ---

interface WaterfallNode {
    image: ImageNode;
    tagHits: number;
    relevance: number; // 0-1
    size: number;
    photoOpacity: number; // 0 = sprite, 1 = photo
    driftDuration: number;
    driftDelay: number;
}

const WaterfallField: React.FC<{
    albumImages: AlbumImage[];
    hasFilters: boolean;
    onSelect: (img: ImageNode) => void;
}> = ({ albumImages, hasFilters, onSelect }) => {
    const nodes = useMemo((): WaterfallNode[] => {
        if (albumImages.length === 0) return [];

        const maxHits = Math.max(1, ...albumImages.map((a: AlbumImage) => a.tagHits));

        return albumImages.map((item: AlbumImage, i: number) => {
            // Default (no filters): all sprites, relevance based on score order
            const relevance = hasFilters ? item.tagHits / maxHits : 0;

            // Size: high relevance = larger photos, low = small sprites
            const size = hasFilters
                ? 36 + relevance * 64  // 36px (sprite) to 100px (top photo)
                : 36 + (1 - i / Math.max(1, albumImages.length - 1)) * 12; // 36-48px sprites

            // Photo opacity: progressive — only when filters active
            // Top items (high hits) = full photos, fades to sprites
            const photoOpacity = hasFilters
                ? Math.max(0, Math.min(1, relevance * 1.5 - 0.2))
                : 0; // Default: ALL sprites

            const driftDuration = 6 + seededRandom(item.image.id + 'wd') * 8;
            const driftDelay = seededRandom(item.image.id + 'wl') * 4;

            return {
                image: item.image,
                tagHits: item.tagHits,
                relevance,
                size,
                photoOpacity,
                driftDuration,
                driftDelay,
            };
        });
    }, [albumImages, hasFilters]);

    // Group into rows by relevance bands for horizontal spreading
    const rows = useMemo(() => {
        if (!hasFilters) {
            // No filters: spread sprites into loose rows
            const perRow = 8;
            const result: WaterfallNode[][] = [];
            for (let i = 0; i < nodes.length; i += perRow) {
                result.push(nodes.slice(i, i + perRow));
            }
            return result;
        }

        // With filters: group by hit count tiers (high → low, top → bottom)
        const tiers = new Map<number, WaterfallNode[]>();
        for (const node of nodes) {
            const tier = node.tagHits;
            if (!tiers.has(tier)) tiers.set(tier, []);
            tiers.get(tier)!.push(node);
        }
        // Sort tiers descending (highest hits first = top)
        return [...tiers.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([, items]) => items);
    }, [nodes, hasFilters]);

    return (
        <div className="px-4 pb-4">
            {!hasFilters && albumImages.length > 0 && (
                <div className="mb-3 mt-1">
                    <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Similar images — select tags, colors, or dates to build an album
                    </span>
                </div>
            )}
            {hasFilters && albumImages.length > 0 && (
                <div className="mb-3 mt-1">
                    <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {albumImages.length} images
                    </span>
                </div>
            )}
            {rows.map((row, rowIdx) => {
                // Determine tier info for label
                const tierHits = hasFilters ? row[0]?.tagHits ?? 0 : 0;
                const isTopTier = hasFilters && rowIdx === 0;

                return (
                    <div key={rowIdx} className="mb-4">
                        {hasFilters && tierHits > 0 && (
                            <div className="mb-1.5">
                                <span className="text-[8px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                    {tierHits} {tierHits === 1 ? 'match' : 'matches'}
                                </span>
                            </div>
                        )}
                        <div className="flex flex-wrap items-end gap-3">
                            {row.map((node: WaterfallNode) => {
                                const showPhoto = node.photoOpacity > 0.05;
                                const xJitter = (seededRandom(node.image.id + 'xj') - 0.5) * 8;

                                return (
                                    <div key={node.image.id}
                                        className="cursor-pointer transition-all duration-500 flex-shrink-0"
                                        style={{
                                            width: node.size,
                                            marginLeft: xJitter,
                                            animation: `drift ${node.driftDuration}s ease-in-out ${node.driftDelay}s infinite`,
                                        }}
                                        onClick={() => onSelect(node.image)}>
                                        {/* Sprite — shown when no/low photo opacity */}
                                        {!showPhoto && (
                                            <div className="flex items-center justify-center" style={{ height: node.size }}>
                                                <MiniSprite image={node.image} size={node.size * 0.9}
                                                    convergence={node.relevance} />
                                            </div>
                                        )}
                                        {/* Photo with natural aspect ratio */}
                                        {showPhoto && (
                                            <div className="relative">
                                                {/* Sprite behind photo for crossfade */}
                                                <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-700"
                                                    style={{ opacity: 1 - node.photoOpacity * 0.85 }}>
                                                    <MiniSprite image={node.image} size={node.size * 0.6}
                                                        convergence={node.relevance} />
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
                    </div>
                );
            })}
        </div>
    );
};

// --- Dynamic Album ---

const DynamicAlbum: React.FC<{
    albumImages: AlbumImage[];
    activeTags: Set<string>;
    activeColors: Set<string>;
    temporalActive: boolean;
    tagMap: Map<string, string>;
    onRemoveTag: (tagId: string) => void;
    onRemoveColor: (hex: string) => void;
    onToggleTemporal: () => void;
    onClearFilters: () => void;
    onSelect: (img: ImageNode) => void;
}> = ({ albumImages, activeTags, activeColors, temporalActive, tagMap, onRemoveTag, onRemoveColor, onToggleTemporal, onClearFilters, onSelect }) => {
    const hasFilters = activeTags.size > 0 || activeColors.size > 0 || temporalActive;

    return (
        <div className="flex flex-col h-full">
            {/* Active filter pills (removable) */}
            {hasFilters && (
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
                    {[...activeColors].map((hex: string) => (
                        <button key={hex} onClick={() => onRemoveColor(hex)}
                            className="px-2 py-0.5 rounded-full text-[9px] cursor-pointer transition-all hover:opacity-70 flex items-center gap-1"
                            style={{
                                fontFamily: 'Inter, sans-serif',
                                backgroundColor: 'rgba(0,0,0,0.1)',
                                color: '#18181b',
                            }}>
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hex }} />
                            {hex}
                            <span className="text-zinc-400 ml-0.5">&times;</span>
                        </button>
                    ))}
                    {temporalActive && (
                        <button onClick={onToggleTemporal}
                            className="px-2 py-0.5 rounded-full text-[9px] cursor-pointer transition-all hover:opacity-70 flex items-center gap-1"
                            style={{
                                fontFamily: 'Inter, sans-serif',
                                backgroundColor: 'rgba(0,0,0,0.1)',
                                color: '#18181b',
                            }}>
                            Same period
                            <span className="text-zinc-400 ml-0.5">&times;</span>
                        </button>
                    )}
                    <button onClick={onClearFilters}
                        className="px-2 py-0.5 text-[8px] cursor-pointer transition-all hover:text-zinc-600 uppercase tracking-wider"
                        style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            color: '#a1a1aa',
                        }}>
                        Clear all
                    </button>
                </div>
            )}

            {/* Waterfall album view */}
            <WaterfallField albumImages={albumImages} hasFilters={hasFilters} onSelect={onSelect} />
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

// --- Device Detection ---

type DeviceType = 'mobile' | 'tablet' | 'desktop';

function useDeviceType(): DeviceType {
    return useMemo(() => {
        if (typeof navigator === 'undefined') return 'desktop';
        const ua = navigator.userAgent;
        // iPad reports as Mac in newer iOS, check for touch + Mac
        const isIPad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
        if (/iPhone|iPod/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua))) return 'mobile';
        if (isIPad || /iPad/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
        return 'desktop';
    }, []);
}

// --- Main Component ---

interface NavigationPrototypeProps {
    images: ImageNode[];
    tags: Tag[];
    onExit: () => void;
}

const NavigationPrototype: React.FC<NavigationPrototypeProps> = ({ images, tags, onExit }) => {
    const deviceType = useDeviceType();
    const isMobile = deviceType === 'mobile' || deviceType === 'tablet';
    const [anchorId, setAnchorId] = useState<string | null>(null);
    const [trail, setTrail] = useState<TrailPoint[]>([]);
    const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
    const [activeColors, setActiveColors] = useState<Set<string>>(new Set());
    const [temporalActive, setTemporalActive] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);
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

    // Album pool — shared between DynamicAlbum and LeftPanel discovery tags
    const albumPool = useMemo((): AlbumImage[] => {
        const hasFilters = activeTags.size > 0 || activeColors.size > 0 || temporalActive;
        if (!anchor || !hasFilters) {
            return scored.slice(0, 24).map((s: ScoredImage) => ({
                image: s.image,
                tagHits: 0,
                isTemporal: s.isTemporalNeighbor,
            }));
        }

        const seen = new Map<string, AlbumImage>();
        if (temporalActive) {
            for (const s of temporalNeighbors) {
                seen.set(s.image.id, { image: s.image, tagHits: 0, isTemporal: true });
            }
        }
        for (const img of images) {
            if (img.id === anchor.id) continue;
            let hits = 0;
            if (activeTags.size > 0) {
                const imgTags = new Set([...img.tagIds, ...(img.aiTagIds || [])]);
                for (const tagId of activeTags) {
                    if (imgTags.has(tagId)) hits++;
                }
            }
            if (activeColors.size > 0 && img.palette.length > 0) {
                for (const activeHex of activeColors) {
                    const closest = Math.min(...img.palette.map((c: string) => colorDist(c, activeHex)));
                    if (closest < COLOR_THRESHOLD) hits++;
                }
            }
            if (hits > 0) {
                const existing = seen.get(img.id);
                if (existing) existing.tagHits = Math.max(existing.tagHits, hits);
                else seen.set(img.id, { image: img, tagHits: hits, isTemporal: false });
            }
        }
        return [...seen.values()].sort((a, b) => {
            if (b.tagHits !== a.tagHits) return b.tagHits - a.tagHits;
            if (a.isTemporal !== b.isTemporal) return a.isTemporal ? -1 : 1;
            return 0;
        });
    }, [anchor, scored, temporalNeighbors, images, activeTags, activeColors, temporalActive]);

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
        setActiveTags(new Set());
        setActiveColors(new Set());
        setTemporalActive(false);
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

    const handleToggleColor = useCallback((hex: string) => {
        setActiveColors(prev => {
            const next = new Set(prev);
            if (next.has(hex)) next.delete(hex);
            else next.add(hex);
            return next;
        });
    }, []);

    const handleRemoveColor = useCallback((hex: string) => {
        setActiveColors(prev => {
            const next = new Set(prev);
            next.delete(hex);
            return next;
        });
    }, []);

    const handleToggleTemporal = useCallback(() => {
        setTemporalActive(prev => !prev);
    }, []);

    const handleClearFilters = useCallback(() => {
        setActiveTags(new Set());
        setActiveColors(new Set());
        setTemporalActive(false);
    }, []);

    const handleClear = useCallback(() => {
        setTrail([]);
        setAnchorId(null);
        setActiveTags(new Set());
        setActiveColors(new Set());
        setTemporalActive(false);
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

            {/* DASHBOARD — Desktop */}
            {anchor && !isMobile && (
                <div className="fixed inset-0 pt-12 z-10 flex gap-3 overflow-hidden">
                    {/* LEFT: Sprite identity, DNA, technical, timeline, tags */}
                    <div className="flex-shrink-0 rounded-xl overflow-y-auto transition-all duration-500 ml-4 my-4"
                        style={{ width: leftW, backgroundColor: '#faf9f6dd' }}>
                        <LeftPanel image={anchor} allImages={images} temporalImages={temporalNeighbors}
                            scored={scored} tagMap={tagMap} activeTags={activeTags}
                            activeColors={activeColors} temporalActive={temporalActive}
                            onToggleTag={handleToggleTag} onToggleColor={handleToggleColor}
                            onToggleTemporal={handleToggleTemporal} onNavigate={handleSelect}
                            albumImages={albumPool} />
                    </div>

                    {/* CENTER: Single scrollable page — Hero then Album */}
                    <div className="flex-1 min-w-0 overflow-y-auto pr-4 pb-4">
                        {/* Hero */}
                        <div className="flex items-start justify-center">
                            <HeroZone image={anchor} />
                        </div>
                        {/* Dynamic Album */}
                        <div className="rounded-xl"
                            style={{ backgroundColor: '#faf9f6aa' }}>
                            <DynamicAlbum albumImages={albumPool}
                                activeTags={activeTags} activeColors={activeColors} temporalActive={temporalActive}
                                tagMap={tagMap} onRemoveTag={handleRemoveTag} onRemoveColor={handleRemoveColor}
                                onToggleTemporal={handleToggleTemporal} onClearFilters={handleClearFilters}
                                onSelect={handleSelect} />
                        </div>
                    </div>
                </div>
            )}

            {/* DASHBOARD — Mobile / Tablet */}
            {anchor && isMobile && (
                <>
                    {/* Single scrollable page */}
                    <div className="fixed inset-0 pt-12 pb-0 z-10 overflow-y-auto"
                        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                        {/* Hero */}
                        <div className="flex items-start justify-center px-3 pt-1">
                            <div className="overflow-hidden rounded-lg max-w-full"
                                style={{ boxShadow: `0 8px 32px ${anchor.palette[0] || '#000'}25` }}>
                                <img src={getPreviewUrl(anchor.id)} alt=""
                                    className="max-h-[45vh] max-w-full object-contain" draggable={false} />
                            </div>
                        </div>

                        {/* Info button — opens bottom sheet */}
                        <div className="flex items-center justify-between px-4 py-2">
                            <button onClick={() => setSheetOpen(true)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-all"
                                style={{
                                    backgroundColor: 'rgba(0,0,0,0.06)',
                                    fontFamily: 'JetBrains Mono, monospace',
                                }}>
                                <MiniSprite image={anchor} size={20} />
                                <span className="text-[10px] text-zinc-600">Info & Filters</span>
                            </button>
                            {(activeTags.size > 0 || activeColors.size > 0 || temporalActive) && (
                                <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                    {activeTags.size + activeColors.size + (temporalActive ? 1 : 0)} filters
                                </span>
                            )}
                        </div>

                        {/* Dynamic Album — full width, flows in page */}
                        <div className="rounded-t-xl"
                            style={{ backgroundColor: '#faf9f6aa' }}>
                            <DynamicAlbum albumImages={albumPool}
                                activeTags={activeTags} activeColors={activeColors} temporalActive={temporalActive}
                                tagMap={tagMap} onRemoveTag={handleRemoveTag} onRemoveColor={handleRemoveColor}
                                onToggleTemporal={handleToggleTemporal} onClearFilters={handleClearFilters}
                                onSelect={handleSelect} />
                        </div>
                    </div>

                    {/* Bottom Sheet Overlay */}
                    {sheetOpen && (
                        <div className="fixed inset-0 z-50">
                            {/* Backdrop */}
                            <div className="absolute inset-0 bg-black/20" onClick={() => setSheetOpen(false)} />
                            {/* Sheet — uses fixed positioning with explicit height for iOS/iPadOS scroll */}
                            <div className="fixed bottom-0 left-0 right-0 rounded-t-2xl"
                                style={{
                                    backgroundColor: '#faf9f6',
                                    boxShadow: '0 -4px 32px rgba(0,0,0,0.12)',
                                    height: '85vh',
                                    display: 'flex',
                                    flexDirection: 'column' as const,
                                }}>
                                {/* Handle bar + close */}
                                <div style={{ flexShrink: 0 }}>
                                    <div className="flex justify-center pt-3 pb-1">
                                        <div className="w-10 h-1 rounded-full bg-zinc-300" />
                                    </div>
                                    <div className="flex justify-between items-center px-4 pb-2">
                                        <span className="text-[10px] tracking-[0.2em] uppercase text-zinc-500"
                                            style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                            Image Details
                                        </span>
                                        <button onClick={() => setSheetOpen(false)}
                                            className="text-[10px] text-zinc-400 hover:text-zinc-600 cursor-pointer px-2 py-1 rounded"
                                            style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                            Done
                                        </button>
                                    </div>
                                </div>
                                {/* Scrollable content — explicit overflow scroll for iOS */}
                                <div style={{
                                    flex: 1,
                                    overflowY: 'scroll' as const,
                                    WebkitOverflowScrolling: 'touch',
                                    overscrollBehavior: 'contain',
                                } as React.CSSProperties}>
                                    <LeftPanel image={anchor} allImages={images} temporalImages={temporalNeighbors}
                                        scored={scored} tagMap={tagMap} activeTags={activeTags}
                                        activeColors={activeColors} temporalActive={temporalActive}
                                        onToggleTag={handleToggleTag} onToggleColor={handleToggleColor}
                                        onToggleTemporal={handleToggleTemporal} onNavigate={(img: ImageNode) => { setSheetOpen(false); handleSelect(img); }}
                                        albumImages={albumPool}
                                        albumPreview={
                                            <DynamicAlbum albumImages={albumPool}
                                                activeTags={activeTags} activeColors={activeColors} temporalActive={temporalActive}
                                                tagMap={tagMap} onRemoveTag={handleRemoveTag} onRemoveColor={handleRemoveColor}
                                                onToggleTemporal={handleToggleTemporal} onClearFilters={handleClearFilters}
                                                onSelect={(img: ImageNode) => { setSheetOpen(false); handleSelect(img); }} />
                                        } />
                                </div>
                            </div>
                        </div>
                    )}
                </>
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
