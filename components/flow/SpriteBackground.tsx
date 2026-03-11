import React, { useState, useEffect, useMemo } from 'react';
import { AlbumImage } from './flowTypes';
import { seededRandom } from './flowHelpers';
import { getThumbnailUrl } from '../../services/immichService';

interface SpriteBackgroundProps {
    albumImages: AlbumImage[];
    maxCount: number;
}

interface SpriteData {
    albumItem: AlbumImage;
    x: number;
    y: number;
    size: number;
    relevance: number;
    driftDuration: number;
    driftDelay: number;
    fading: boolean;
}

const SpriteBackground: React.FC<SpriteBackgroundProps> = ({ albumImages, maxCount }) => {
    const [sprites, setSprites] = useState<Map<string, SpriteData>>(new Map());

    // Sync sprite pool when albumImages or maxCount changes
    useEffect(() => {
        if (maxCount === 0) {
            setSprites(new Map());
            return;
        }

        const pool = albumImages.slice(0, maxCount);
        const maxHits = Math.max(1, ...pool.map(a => a.tagHits));
        const currentIds = new Set(pool.map(a => a.image.id));

        setSprites(prev => {
            const next = new Map(prev);

            // Mark removed sprites for fadeout
            for (const [id, sprite] of next) {
                if (!currentIds.has(id) && !sprite.fading) {
                    next.set(id, { ...sprite, fading: true });
                }
            }

            // Update existing or un-fade returning sprites
            for (const item of pool) {
                const existing = next.get(item.image.id);
                if (existing) {
                    next.set(item.image.id, {
                        ...existing,
                        albumItem: item,
                        relevance: item.tagHits / maxHits,
                        fading: false,
                    });
                }
            }

            // Add new sprites with scattered positions
            const newItems = pool.filter(item => !next.has(item.image.id));
            for (let i = 0; i < newItems.length; i++) {
                const item = newItems[i];
                const id = item.image.id;
                // Use very different seed construction for x vs y to avoid correlation
                const x = 5 + seededRandom('XXBG' + id.slice(0, 8) + i) * 85;
                const y = 15 + seededRandom(id.slice(-8) + 'YYBG' + (i * 7)) * 65;

                next.set(id, {
                    albumItem: item,
                    x,
                    y,
                    size: 28 + seededRandom('SZ' + id.slice(4, 12)) * 22,
                    relevance: item.tagHits / maxHits,
                    driftDuration: 8 + seededRandom('DR' + id.slice(2, 10)) * 10,
                    driftDelay: seededRandom('DL' + id.slice(6, 14)) * 5,
                    fading: false,
                });
            }

            return next;
        });
    }, [albumImages, maxCount]);

    // Clean up fully faded sprites after transition
    useEffect(() => {
        const hasFading = [...sprites.values()].some(s => s.fading);
        if (!hasFading) return;
        const timer = setTimeout(() => {
            setSprites(prev => {
                const next = new Map(prev);
                for (const [id, s] of next) {
                    if (s.fading) next.delete(id);
                }
                return next;
            });
        }, 800);
        return () => clearTimeout(timer);
    }, [sprites]);

    // Stable sprite list for rendering (avoid key changes)
    const spriteList = useMemo(() => [...sprites.entries()], [sprites]);

    if (spriteList.length === 0) return null;

    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 11 }}>
            {spriteList.map(([id, sprite]) => {
                const imgSize = sprite.size * 2;
                const blurAmount = 4 + (1 - sprite.relevance) * 6;
                return (
                    <div key={id}
                        className="absolute rounded-lg overflow-hidden"
                        style={{
                            left: `${sprite.x}%`,
                            top: `${sprite.y}%`,
                            width: imgSize,
                            height: imgSize,
                            opacity: sprite.fading ? 0 : 0.3 + sprite.relevance * 0.4,
                            filter: `blur(${blurAmount}px)`,
                            transition: 'opacity 600ms ease, filter 600ms ease',
                            animation: `drift ${sprite.driftDuration}s ease-in-out ${sprite.driftDelay}s infinite`,
                        }}>
                        <img src={getThumbnailUrl(sprite.albumItem.image.id)} alt=""
                            className="w-full h-full object-cover"
                            draggable={false} />
                    </div>
                );
            })}
        </div>
    );
};

export default SpriteBackground;
