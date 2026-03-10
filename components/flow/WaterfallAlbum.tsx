import React, { useMemo } from 'react';
import { ImageNode } from '../../types';
import { AlbumImage, WaterfallNode } from './flowTypes';
import { seededRandom } from './flowHelpers';
import MiniSprite from './MiniSprite';

interface WaterfallAlbumProps {
    albumImages: AlbumImage[];
    traitCount: number;
    onSelect: (img: ImageNode, rect: DOMRect) => void;
    gentleReveal?: boolean;
}

const WaterfallAlbum: React.FC<WaterfallAlbumProps> = ({ albumImages, traitCount, onSelect, gentleReveal }) => {
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

    if (!visible) return null;

    const handleClick = (img: ImageNode, e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onSelect(img, rect);
    };

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
