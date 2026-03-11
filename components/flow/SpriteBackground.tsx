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
    col: number;
    row: number;
    jitterX: number;
    jitterY: number;
    size: number;
    relevance: number;
    driftDuration: number;
    driftDelay: number;
    fading: boolean;
}

const SpriteBackground: React.FC<SpriteBackgroundProps> = ({ albumImages, maxCount, onSelect }) => {
    const [sprites, setSprites] = useState<Map<string, SpriteData>>(new Map());

    // Grid layout config — responsive columns
    const gridConfig = useMemo(() => {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        const cols = isMobile ? 3 : 5;
        const rows = Math.ceil(maxCount / cols) || 2;
        return { cols, rows, isMobile };
    }, [maxCount]);

    // Sync sprite pool when albumImages or maxCount changes
    useEffect(() => {
        if (maxCount === 0) {
            setSprites(new Map());
            return;
        }

        const pool = albumImages.slice(0, maxCount);
        const maxHits = Math.max(1, ...pool.map(a => a.tagHits));
        const currentIds = new Set(pool.map(a => a.image.id));
        const { cols, rows } = gridConfig;

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

            // Add new sprites — assign to grid cells
            const usedCells = new Set<string>();
            for (const [, sprite] of next) {
                if (!sprite.fading) usedCells.add(`${sprite.col},${sprite.row}`);
            }

            const newItems = pool.filter(item => !next.has(item.image.id));
            let cellIndex = 0;
            for (const item of newItems) {
                const id = item.image.id;
                // Find next open grid cell
                let col = 0, row = 0;
                while (cellIndex < cols * rows) {
                    col = cellIndex % cols;
                    row = Math.floor(cellIndex / cols);
                    if (!usedCells.has(`${col},${row}`)) break;
                    cellIndex++;
                }
                usedCells.add(`${col},${row}`);
                cellIndex++;

                // Jitter within cell (±30% of cell size)
                const jitterX = (seededRandom('JX' + id.slice(0, 6) + col) - 0.5) * 0.3;
                const jitterY = (seededRandom(id.slice(-6) + 'JY' + row) - 0.5) * 0.3;

                const baseSize = gridConfig.isMobile ? 36 : 48;
                next.set(id, {
                    albumItem: item,
                    col,
                    row,
                    jitterX,
                    jitterY,
                    size: baseSize + seededRandom('SZ' + id.slice(4, 12)) * (gridConfig.isMobile ? 16 : 24),
                    relevance: item.tagHits / maxHits,
                    driftDuration: 10 + seededRandom('DR' + id.slice(2, 10)) * 8,
                    driftDelay: seededRandom('DL' + id.slice(6, 14)) * 5,
                    fading: false,
                });
            }

            return next;
        });
    }, [albumImages, maxCount, gridConfig]);

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

    const { cols, rows } = gridConfig;
    // Grid spans most of the viewport with margins
    const marginX = 4; // % from edges
    const marginY = 12; // % from top (below header + trait bar area)
    const cellW = (100 - marginX * 2) / cols;
    const cellH = (100 - marginY - 5) / rows; // 5% bottom margin

    const handleClick = (img: ImageNode, e: React.MouseEvent) => {
        if (!onSelect) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onSelect(img, rect);
    };

    return (
        <div className="fixed inset-0 overflow-hidden" style={{ zIndex: 11, pointerEvents: 'none' }}>
            {spriteList.map(([id, sprite]) => {
                const blurAmount = 2 + (1 - sprite.relevance) * 4; // 2-6px range
                const x = marginX + (sprite.col + 0.5 + sprite.jitterX) * cellW;
                const y = marginY + (sprite.row + 0.5 + sprite.jitterY) * cellH;
                return (
                    <div key={id}
                        className="absolute rounded-lg overflow-hidden cursor-pointer"
                        style={{
                            left: `${x}%`,
                            top: `${y}%`,
                            width: sprite.size,
                            height: sprite.size,
                            transform: 'translate(-50%, -50%)',
                            opacity: sprite.fading ? 0 : 0.35 + sprite.relevance * 0.35,
                            filter: `blur(${blurAmount}px)`,
                            transition: 'opacity 600ms ease, filter 600ms ease',
                            animation: `drift ${sprite.driftDuration}s ease-in-out ${sprite.driftDelay}s infinite`,
                            pointerEvents: sprite.fading ? 'none' : 'auto',
                        }}
                        onClick={(e) => handleClick(sprite.albumItem.image, e)}>
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
