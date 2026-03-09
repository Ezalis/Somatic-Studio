import React, { useMemo } from 'react';
import { ImageNode } from '../../types';
import { getPreviewUrl } from '../../services/immichService';
import { AlbumImage, WaterfallNode } from './flowTypes';
import { seededRandom } from './flowHelpers';
import MiniSprite from './MiniSprite';

interface WaterfallAlbumProps {
    albumImages: AlbumImage[];
    traitCount: number;
    onSelect: (img: ImageNode, rect: DOMRect) => void;
}

const WaterfallAlbum: React.FC<WaterfallAlbumProps> = ({ albumImages, traitCount, onSelect }) => {
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
            const photoOpacity = item.tagHits <= 1
                ? 0
                : Math.max(0, Math.min(1, (relevance - 0.3) * 1.8));
            const driftDuration = 6 + seededRandom(item.image.id + 'wd') * 8;
            const driftDelay = seededRandom(item.image.id + 'wl') * 4;

            return { image: item.image, tagHits: item.tagHits, relevance, size, photoOpacity, driftDuration, driftDelay };
        });
    }, [albumImages, isPartial]);

    const tiers = useMemo(() => {
        const tierMap = new Map<number, WaterfallNode[]>();
        for (const node of nodes) {
            const tier = node.tagHits;
            if (!tierMap.has(tier)) tierMap.set(tier, []);
            tierMap.get(tier)!.push(node);
        }
        return [...tierMap.entries()]
            .sort((a, b) => b[0] - a[0]);
    }, [nodes]);

    if (!visible) return null;

    const topTierHits = tiers.length > 0 ? tiers[0][0] : 0;

    const handleClick = (img: ImageNode, e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onSelect(img, rect);
    };

    return (
        <div className="px-6 pb-8 max-w-2xl mx-auto"
            style={{ animation: 'album-reveal 600ms ease-out forwards' }}>
            <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] tracking-[0.2em] uppercase text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {isPartial ? 'Album preview' : 'Your album'}
                </span>
                <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {albumImages.length} images{isPartial ? ` · select ${6 - traitCount} more for full album` : ''}
                </span>
            </div>

            {tiers.map(([tierHits, row], rowIdx) => {
                const isTopTier = tierHits === topTierHits && tierHits > 1;

                return (
                    <div key={rowIdx} className="mb-6">
                        {tierHits > 0 && (
                            <div className="mb-2">
                                <span className="text-[8px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                    {tierHits} {tierHits === 1 ? 'match' : 'matches'}
                                </span>
                            </div>
                        )}
                        {/* Top tier: two-column grid of large images */}
                        {isTopTier ? (
                            <div className="grid grid-cols-2 gap-4">
                                {row.map((node: WaterfallNode) => (
                                    <div key={node.image.id}
                                        className="cursor-pointer transition-all duration-500"
                                        onClick={(e) => handleClick(node.image, e)}>
                                        <img src={getPreviewUrl(node.image.id)} alt=""
                                            className="w-full h-auto rounded-lg"
                                            style={{
                                                boxShadow: `0 8px 24px rgba(0,0,0,${0.08 + node.relevance * 0.12})`,
                                            }}
                                            loading="lazy" draggable={false} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex flex-wrap items-end gap-3">
                                {row.map((node: WaterfallNode) => {
                                    const showPhoto = node.photoOpacity > 0.05;
                                    const xJitter = (seededRandom(node.image.id + 'xj') - 0.5) * 8;
                                    const spriteOpacity = node.tagHits === 2 ? 1 : (1 - node.photoOpacity * 0.85);

                                    return (
                                        <div key={node.image.id}
                                            className="cursor-pointer transition-all duration-500 flex-shrink-0"
                                            style={{
                                                width: node.size,
                                                marginLeft: xJitter,
                                                animation: `drift ${node.driftDuration}s ease-in-out ${node.driftDelay}s infinite`,
                                            }}
                                            onClick={(e) => handleClick(node.image, e)}>
                                            {!showPhoto && (
                                                <div className="flex items-center justify-center" style={{ height: node.size }}>
                                                    <MiniSprite image={node.image} size={node.size * 0.9} convergence={node.relevance} />
                                                </div>
                                            )}
                                            {showPhoto && (
                                                <div className="relative">
                                                    <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-700"
                                                        style={{ opacity: spriteOpacity }}>
                                                        <MiniSprite image={node.image} size={node.size * 0.6} convergence={node.relevance} />
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
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default WaterfallAlbum;
