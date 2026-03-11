import React, { useMemo } from 'react';
import { ImageNode } from '../../types';
import { AlbumImage, WaterfallNode } from './flowTypes';
import { seededRandom } from './flowHelpers';
import { getThumbnailUrl, getPreviewUrl } from '../../services/immichService';
import MiniSprite from './MiniSprite';

interface WaterfallAlbumProps {
    albumImages: AlbumImage[];
    traitCount: number;
    onSelect: (img: ImageNode, rect: DOMRect) => void;
    gentleReveal?: boolean;
    isAlbumPhase?: boolean;
}

// Distribute items across the viewport without overlapping too much
// Returns positions that feel like photos scattered on a surface
function scatterPositions(count: number, seed: string, bounds: { xMin: number; xMax: number; yMin: number; yMax: number }) {
    const positions: { x: number; y: number }[] = [];
    // Prefer wider grids (more columns) so items spread horizontally
    const cols = Math.max(2, Math.ceil(Math.sqrt(count * 2)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const cellW = (bounds.xMax - bounds.xMin) / cols;
    const cellH = (bounds.yMax - bounds.yMin) / rows;

    for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        // Large jitter (±40% of cell) for organic feel
        const jitterX = (seededRandom('X' + seed + i * 7) - 0.5) * cellW * 0.8;
        const jitterY = (seededRandom('Y' + seed + i * 13) - 0.5) * cellH * 0.8;
        const x = Math.max(bounds.xMin, Math.min(bounds.xMax, bounds.xMin + (col + 0.5) * cellW + jitterX));
        const y = Math.max(bounds.yMin, Math.min(bounds.yMax, bounds.yMin + (row + 0.5) * cellH + jitterY));
        positions.push({ x, y });
    }
    return positions;
}

const WaterfallAlbum: React.FC<WaterfallAlbumProps> = ({ albumImages, traitCount, onSelect, gentleReveal, isAlbumPhase }) => {
    const isPartial = traitCount >= 3 && traitCount < 6;
    const visible = traitCount >= 3;

    const nodes = useMemo((): WaterfallNode[] => {
        if (albumImages.length === 0) return [];
        const maxHits = Math.max(1, ...albumImages.map((a: AlbumImage) => a.tagHits));
        const limit = isPartial ? 8 : albumImages.length;

        return albumImages.slice(0, limit).map((item: AlbumImage) => {
            const relevance = item.tagHits / maxHits;
            const size = item.tagHits <= 1
                ? 40 + seededRandom(item.image.id + 'sz') * 8
                : 60 + relevance * 120;
            const driftDuration = 6 + seededRandom(item.image.id + 'wd') * 8;
            const driftDelay = seededRandom(item.image.id + 'wl') * 4;

            return { image: item.image, tagHits: item.tagHits, relevance, size, driftDuration, driftDelay };
        });
    }, [albumImages, isPartial]);

    // Tiered layout for album phase
    const tiers = useMemo(() => {
        if (!isAlbumPhase || nodes.length === 0) return null;
        const maxHits = Math.max(1, ...nodes.map(n => n.tagHits));
        const tier1: WaterfallNode[] = [];
        const tier2: WaterfallNode[] = [];
        const tier3: WaterfallNode[] = [];

        for (const node of nodes) {
            if (node.tagHits === maxHits && maxHits > 1) tier1.push(node);
            else if (node.tagHits >= maxHits * 0.5 && maxHits > 1) tier2.push(node);
            else tier3.push(node);
        }

        return {
            tier1: tier1.slice(0, 5),
            tier2: tier2.slice(0, 8),
            tier3: tier3.slice(0, 10),
        };
    }, [isAlbumPhase, nodes]);

    // Pre-compute scattered positions for each tier
    const tierPositions = useMemo(() => {
        if (!tiers) return null;
        return {
            // Tier 1: center zone, well-spaced (large cards need room)
            tier1: scatterPositions(tiers.tier1.length, 't1', { xMin: 15, xMax: 65, yMin: 20, yMax: 70 }),
            // Tier 2: full viewport edge-to-edge including corners
            tier2: scatterPositions(tiers.tier2.length, 't2', { xMin: 1, xMax: 92, yMin: 5, yMax: 92 }),
            // Tier 3: everywhere
            tier3: scatterPositions(tiers.tier3.length, 't3', { xMin: 2, xMax: 95, yMin: 8, yMax: 90 }),
        };
    }, [tiers]);

    if (!visible) return null;

    const handleClick = (img: ImageNode, e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onSelect(img, rect);
    };

    // Album phase: photos scattered on a surface
    if (isAlbumPhase && tiers && tierPositions) {
        return (
            <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 15 }}>
                {/* Tier 3: Sprites — scattered, lowest layer */}
                {tiers.tier3.map((node, index) => {
                    const pos = tierPositions.tier3[index];
                    const spriteSize = 35 + seededRandom(node.image.id + 't3sz') * 25;
                    return (
                        <div key={node.image.id}
                            className="absolute pointer-events-auto cursor-pointer"
                            style={{
                                left: `${pos.x}%`,
                                top: `${pos.y}%`,
                                zIndex: 1,
                                animation: `gentle-unveil 800ms cubic-bezier(0.22,1,0.36,1) ${index * 60}ms both`,
                            }}
                            onClick={(e) => handleClick(node.image, e)}>
                            <MiniSprite image={node.image} size={spriteSize} convergence={node.relevance} />
                        </div>
                    );
                })}

                {/* Tier 2: Smaller photo prints — natural aspect ratio */}
                {tiers.tier2.map((node, index) => {
                    const pos = tierPositions.tier2[index];
                    const rotate = (seededRandom(node.image.id + 't2r') - 0.5) * 8;
                    const cardWidth = 140 + seededRandom(node.image.id + 't2w') * 40;
                    return (
                        <div key={node.image.id}
                            className="absolute pointer-events-auto cursor-pointer"
                            style={{
                                left: `${pos.x}%`,
                                top: `${pos.y}%`,
                                width: cardWidth,
                                zIndex: 2,
                                '--card-rotate': `${rotate}deg`,
                                animation: `card-scatter 700ms cubic-bezier(0.22,1,0.36,1) ${400 + index * 80}ms both`,
                            } as React.CSSProperties}
                            onClick={(e) => handleClick(node.image, e)}>
                            <div className="bg-white p-1.5 rounded shadow-md"
                                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)' }}>
                                <img src={getThumbnailUrl(node.image.id)} alt=""
                                    className="w-full rounded-sm"
                                    draggable={false} />
                            </div>
                        </div>
                    );
                })}

                {/* Tier 1: Large photo prints — most prominent */}
                {tiers.tier1.map((node, index) => {
                    const pos = tierPositions.tier1[index];
                    const rotate = (seededRandom(node.image.id + 't1r') - 0.5) * 6;
                    const cardWidth = 260 + seededRandom(node.image.id + 't1w') * 60;
                    return (
                        <div key={node.image.id}
                            className="absolute pointer-events-auto cursor-pointer"
                            style={{
                                left: `${pos.x}%`,
                                top: `${pos.y}%`,
                                width: cardWidth,
                                zIndex: 3,
                                '--card-rotate': `${rotate}deg`,
                                animation: `card-scatter 800ms cubic-bezier(0.22,1,0.36,1) ${800 + index * 100}ms both`,
                            } as React.CSSProperties}
                            onClick={(e) => handleClick(node.image, e)}>
                            <div className="bg-white p-2 rounded-md"
                                style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)' }}>
                                <img src={getPreviewUrl(node.image.id)} alt=""
                                    className="w-full rounded-sm"
                                    draggable={false} />
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    // Default: sprite-only inline album (traits 3-5)
    return (
        <div className="px-6 pb-8 max-w-2xl mx-auto"
            style={gentleReveal ? undefined : { animation: 'album-reveal 600ms ease-out forwards' }}>
            <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] tracking-[0.2em] uppercase text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {isPartial ? 'Album preview' : 'Your album'}
                </span>
                <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {albumImages.length} images{isPartial ? ` · select ${6 - traitCount} more for full album` : ''}
                </span>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                {nodes.map((node: WaterfallNode, index: number) => {
                    const xJitter = (seededRandom(node.image.id + 'xj') - 0.5) * 8;

                    return (
                        <div key={node.image.id}
                            className="cursor-pointer transition-all duration-500 flex-shrink-0"
                            style={{
                                width: node.size,
                                marginLeft: xJitter,
                                animation: gentleReveal
                                    ? `gentle-unveil 800ms cubic-bezier(0.22,1,0.36,1) ${index * 80}ms both`
                                    : `drift ${node.driftDuration}s ease-in-out ${node.driftDelay}s infinite`,
                            }}
                            onClick={(e) => handleClick(node.image, e)}>
                            <div className="flex items-center justify-center" style={{ height: node.size }}>
                                <MiniSprite image={node.image} size={node.size * 0.9} convergence={node.relevance} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WaterfallAlbum;
