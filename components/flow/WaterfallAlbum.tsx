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

        // Cap tiers for visual clarity
        return {
            tier1: tier1.slice(0, 6),
            tier2: tier2.slice(0, 8),
            tier3: tier3.slice(0, 12),
        };
    }, [isAlbumPhase, nodes]);

    if (!visible) return null;

    const handleClick = (img: ImageNode, e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onSelect(img, rect);
    };

    // Album phase: fullscreen tiered layout
    if (isAlbumPhase && tiers) {
        return (
            <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 3 }}>
                {/* Tier 3: Sprites — lower-middle area */}
                <div className="absolute inset-0 flex items-center justify-center" style={{ paddingTop: '30vh' }}>
                    <div className="relative" style={{ width: '80vw', height: '40vh' }}>
                        {tiers.tier3.map((node, index) => {
                            const x = seededRandom(node.image.id + 't3x') * 100;
                            const y = seededRandom(node.image.id + 't3y') * 100;
                            const spriteSize = 40 + seededRandom(node.image.id + 't3sz') * 20;
                            return (
                                <div key={node.image.id}
                                    className="absolute pointer-events-auto cursor-pointer"
                                    style={{
                                        left: `${x}%`,
                                        top: `${y}%`,
                                        animation: `gentle-unveil 800ms cubic-bezier(0.22,1,0.36,1) ${index * 60}ms both,
                                                    drift ${6 + seededRandom(node.image.id + 'td') * 6}s ease-in-out infinite`,
                                    }}
                                    onClick={(e) => handleClick(node.image, e)}>
                                    <MiniSprite image={node.image} size={spriteSize} convergence={node.relevance} />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Tier 2: Smaller photo cards — upper-middle */}
                <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                    <div className="relative w-full h-full">
                        {tiers.tier2.map((node, index) => {
                            const x = 10 + seededRandom(node.image.id + 't2x') * 70;
                            const y = 20 + seededRandom(node.image.id + 't2y') * 35;
                            const rotate = (seededRandom(node.image.id + 't2r') - 0.5) * 12;
                            const cardWidth = 120 + seededRandom(node.image.id + 't2w') * 40;
                            return (
                                <div key={node.image.id}
                                    className="absolute pointer-events-auto cursor-pointer"
                                    style={{
                                        left: `${x}%`,
                                        top: `${y}%`,
                                        width: cardWidth,
                                        '--card-rotate': `${rotate}deg`,
                                        animation: `card-scatter 700ms cubic-bezier(0.22,1,0.36,1) ${400 + index * 60}ms both`,
                                        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.12))',
                                    } as React.CSSProperties}
                                    onClick={(e) => handleClick(node.image, e)}>
                                    <img src={getThumbnailUrl(node.image.id)} alt=""
                                        className="w-full rounded-lg object-cover"
                                        style={{ aspectRatio: '4/3' }}
                                        draggable={false} />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Tier 1: Large photo cards — top third */}
                <div className="absolute inset-0" style={{ pointerEvents: 'none' }}>
                    <div className="relative w-full h-full">
                        {tiers.tier1.map((node, index) => {
                            const x = 8 + seededRandom(node.image.id + 't1x') * 60;
                            const y = 5 + seededRandom(node.image.id + 't1y') * 25;
                            const rotate = (seededRandom(node.image.id + 't1r') - 0.5) * 16;
                            const cardWidth = 200 + seededRandom(node.image.id + 't1w') * 40;
                            return (
                                <div key={node.image.id}
                                    className="absolute pointer-events-auto cursor-pointer"
                                    style={{
                                        left: `${x}%`,
                                        top: `${y}%`,
                                        width: cardWidth,
                                        zIndex: 4,
                                        '--card-rotate': `${rotate}deg`,
                                        animation: `card-scatter 700ms cubic-bezier(0.22,1,0.36,1) ${800 + index * 60}ms both`,
                                        filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.18))',
                                    } as React.CSSProperties}
                                    onClick={(e) => handleClick(node.image, e)}>
                                    <img src={getPreviewUrl(node.image.id)} alt=""
                                        className="w-full rounded-lg object-cover"
                                        style={{ aspectRatio: '4/3' }}
                                        draggable={false} />
                                </div>
                            );
                        })}
                    </div>
                </div>
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
