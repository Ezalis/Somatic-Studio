import React, { useState, useEffect, useMemo } from 'react';
import { ImageNode } from '../../types';
import { AlbumImage } from './flowTypes';
import { seededRandom } from './flowHelpers';
import { getThumbnailUrl } from '../../services/immichService';

interface SpriteBackgroundProps {
    albumImages: AlbumImage[];
    maxCount: number;
    onSelect?: (img: ImageNode, rect: DOMRect) => void;
}

interface SpriteData {
    albumItem: AlbumImage;
    x: number;
    y: number;
    width: number;
    rotate: number;
    relevance: number;
    driftDuration: number;
    driftDelay: number;
    fading: boolean;
}

// Poisson-disc-like scatter: divide viewport into loose zones and place
// one image per zone with large random offsets. Uses the full screen
// including corners and edges.
function scatterPositions(count: number, isMobile: boolean) {
    // More columns on desktop to spread wider, fewer rows to use vertical space
    const cols = isMobile ? 3 : 5;
    const rows = Math.max(2, Math.ceil(count / cols));
    const cellW = 100 / cols;
    const cellH = 100 / rows;

    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        positions.push({
            // Center of cell — jitter applied per-sprite with seededRandom
            xBase: (col + 0.5) * cellW,
            yBase: (row + 0.5) * cellH,
        } as unknown as { x: number; y: number });
    }
    return { positions, cellW, cellH };
}

const SpriteBackground: React.FC<SpriteBackgroundProps> = ({ albumImages, maxCount, onSelect }) => {
    const [sprites, setSprites] = useState<Map<string, SpriteData>>(new Map());

    const isMobile = useMemo(() =>
        typeof window !== 'undefined' && window.innerWidth < 768, []);

    // Sync sprite pool when albumImages or maxCount changes
    useEffect(() => {
        if (maxCount === 0) {
            setSprites(new Map());
            return;
        }

        const pool = albumImages.slice(0, maxCount);
        const maxHits = Math.max(1, ...pool.map(a => a.tagHits));
        const currentIds = new Set(pool.map(a => a.image.id));

        const cols = isMobile ? 3 : 5;
        const rows = Math.max(2, Math.ceil(maxCount / cols));
        const cellW = 100 / cols;
        const cellH = 100 / rows;

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

            // Count active sprites for grid cell assignment
            let nextSlot = 0;
            const usedSlots = new Set<number>();
            for (const [, s] of next) {
                if (!s.fading) {
                    // Estimate which slot this sprite is in
                    const col = Math.round((s.x / cellW) - 0.5);
                    const row = Math.round((s.y / cellH) - 0.5);
                    usedSlots.add(row * cols + col);
                }
            }

            const newItems = pool.filter(item => !next.has(item.image.id));
            for (const item of newItems) {
                const id = item.image.id;

                // Find next open slot
                while (usedSlots.has(nextSlot) && nextSlot < cols * rows) nextSlot++;
                const col = nextSlot % cols;
                const row = Math.floor(nextSlot / cols);
                usedSlots.add(nextSlot);
                nextSlot++;

                // Large jitter — ±40% of cell, so images feel scattered not gridded
                const jx = (seededRandom('JX' + id.slice(0, 6) + col) - 0.5) * cellW * 0.8;
                const jy = (seededRandom(id.slice(-6) + 'JY' + row) - 0.5) * cellH * 0.8;
                const x = Math.max(2, Math.min(98, (col + 0.5) * cellW + jx));
                const y = Math.max(3, Math.min(97, (row + 0.5) * cellH + jy));

                const baseWidth = isMobile ? 56 : 80;
                const width = baseWidth + seededRandom('WD' + id.slice(4, 12)) * (isMobile ? 24 : 40);
                const rotate = (seededRandom('RT' + id.slice(3, 11)) - 0.5) * 10; // ±5°

                next.set(id, {
                    albumItem: item,
                    x, y, width, rotate,
                    relevance: item.tagHits / maxHits,
                    driftDuration: 10 + seededRandom('DR' + id.slice(2, 10)) * 8,
                    driftDelay: seededRandom('DL' + id.slice(6, 14)) * 5,
                    fading: false,
                });
            }

            return next;
        });
    }, [albumImages, maxCount, isMobile]);

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

    const spriteList = useMemo(() => [...sprites.entries()], [sprites]);

    if (spriteList.length === 0) return null;

    const handleClick = (img: ImageNode, e: React.MouseEvent) => {
        if (!onSelect) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onSelect(img, rect);
    };

    return (
        <div className="fixed inset-0 overflow-hidden" style={{ zIndex: 11, pointerEvents: 'none' }}>
            {spriteList.map(([id, sprite]) => {
                const blurAmount = 2 + (1 - sprite.relevance) * 4;
                return (
                    <div key={id}
                        className="absolute cursor-pointer"
                        style={{
                            left: `${sprite.x}%`,
                            top: `${sprite.y}%`,
                            width: sprite.width,
                            transform: `translate(-50%, -50%) rotate(${sprite.rotate}deg)`,
                            opacity: sprite.fading ? 0 : 0.35 + sprite.relevance * 0.35,
                            filter: `blur(${blurAmount}px)`,
                            transition: 'opacity 600ms ease, filter 600ms ease',
                            animation: `drift ${sprite.driftDuration}s ease-in-out ${sprite.driftDelay}s infinite`,
                            pointerEvents: sprite.fading ? 'none' : 'auto',
                        }}
                        onClick={(e) => handleClick(sprite.albumItem.image, e)}>
                        {/* White print border — natural aspect ratio */}
                        <div className="bg-white p-1 rounded-sm"
                            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                            <img src={getThumbnailUrl(sprite.albumItem.image.id)} alt=""
                                className="w-full rounded-sm"
                                draggable={false} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default SpriteBackground;
