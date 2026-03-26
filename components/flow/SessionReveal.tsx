import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { ImageNode } from '../../types';
import { TrailPoint, AffinityImage, AffinityLayer } from './flowTypes';
import { computeSessionAffinities, seededRandom } from './flowHelpers';
import { getThumbnailUrl, getPreviewUrl } from '../../services/immichService';

interface SessionRevealProps {
    trail: TrailPoint[];
    images: ImageNode[];
    onSeedLoop: (image: ImageNode, rect: DOMRect) => void;
    onClose: () => void;
}

interface LayoutItem {
    item: AffinityImage;
    x: number;
    y: number;
    size: number;
    rotate: number;
}

// Layout config per layer
const LAYER_CONFIG: Record<AffinityLayer, { minSize: number; maxSize: number; gap: number; columns: number }> = {
    gravity: { minSize: 200, maxSize: 280, gap: 24, columns: 2 },
    range:   { minSize: 120, maxSize: 180, gap: 16, columns: 3 },
    detour:  { minSize: 80,  maxSize: 120, gap: 12, columns: 4 },
};

function layoutLayer(
    items: AffinityImage[],
    layer: AffinityLayer,
    viewW: number,
    startY: number,
): { laid: LayoutItem[]; endY: number } {
    if (items.length === 0) return { laid: [], endY: startY };

    const config = LAYER_CONFIG[layer];
    const cols = Math.min(config.columns, Math.floor(viewW / (config.minSize + config.gap)));
    const effectiveCols = Math.max(1, cols);
    const totalGap = (effectiveCols + 1) * config.gap;
    const cellW = (viewW - totalGap) / effectiveCols;
    const clampedCellW = Math.min(cellW, config.maxSize);

    const laid: LayoutItem[] = [];
    const colHeights = new Array(effectiveCols).fill(startY);

    for (const item of items) {
        // Pick shortest column
        let minCol = 0;
        for (let c = 1; c < effectiveCols; c++) {
            if (colHeights[c] < colHeights[minCol]) minCol = c;
        }

        const baseSize = item.isHero
            ? clampedCellW * 1.1  // Heroes are slightly larger
            : clampedCellW * (0.75 + item.affinityScore * 0.25);
        const size = Math.max(config.minSize, Math.min(config.maxSize, baseSize));

        const x = config.gap + minCol * (clampedCellW + config.gap) + (clampedCellW - size) / 2;
        const y = colHeights[minCol] + config.gap;
        const rotate = (seededRandom(item.image.id) - 0.5) * 4; // -2 to 2 degrees

        laid.push({ item, x, y, size, rotate });
        colHeights[minCol] = y + size;
    }

    const endY = Math.max(...colHeights) + config.gap * 2;
    return { laid, endY };
}

const SessionReveal: React.FC<SessionRevealProps> = ({ trail, images, onSeedLoop, onClose }) => {
    const [isClosing, setIsClosing] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const selectedRef = useRef<HTMLButtonElement>(null);

    const [viewW, setViewW] = useState(window.innerWidth);
    useEffect(() => {
        const onResize = () => setViewW(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Compute affinities
    const affinityImages = useMemo(
        () => computeSessionAffinities(trail, images),
        [trail, images],
    );

    // Group by layer
    const gravityItems = useMemo(() => affinityImages.filter(a => a.layer === 'gravity'), [affinityImages]);
    const rangeItems = useMemo(() => affinityImages.filter(a => a.layer === 'range'), [affinityImages]);
    const detourItems = useMemo(() => affinityImages.filter(a => a.layer === 'detour'), [affinityImages]);

    // Compute layout
    const { allItems, totalHeight } = useMemo(() => {
        const topPad = 80;
        const { laid: gravityLaid, endY: gravityEnd } = layoutLayer(gravityItems, 'gravity', viewW, topPad);
        const { laid: rangeLaid, endY: rangeEnd } = layoutLayer(rangeItems, 'range', viewW, gravityEnd + 32);
        const { laid: detourLaid, endY: detourEnd } = layoutLayer(detourItems, 'detour', viewW, rangeEnd + 32);
        return {
            allItems: [...gravityLaid, ...rangeLaid, ...detourLaid],
            totalHeight: detourEnd + 100,
        };
    }, [gravityItems, rangeItems, detourItems, viewW]);

    // Stagger delays: gravity appears first, then range, then detour
    const staggerBase = useMemo(() => {
        let gravityCount = 0, rangeCount = 0;
        for (const item of allItems) {
            if (item.item.layer === 'gravity') gravityCount++;
            else if (item.item.layer === 'range') rangeCount++;
        }
        return {
            gravity: 200,
            range: 200 + gravityCount * 60 + 300,
            detour: 200 + gravityCount * 60 + 300 + rangeCount * 40 + 200,
        };
    }, [allItems]);

    // Escape key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const handleClose = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 300);
    }, [onClose]);

    const handleImageTap = useCallback((id: string) => {
        setSelectedId(prev => prev === id ? null : id);
    }, []);

    const handleSeed = useCallback((item: AffinityImage) => {
        if (selectedRef.current) {
            const rect = selectedRef.current.getBoundingClientRect();
            onSeedLoop(item.image, rect);
        }
    }, [onSeedLoop]);

    let gravityIdx = 0, rangeIdx = 0, detourIdx = 0;

    return (
        <div className="fixed inset-0 z-[60]"
            style={{
                animation: isClosing
                    ? 'reveal-fade-out 300ms ease-out forwards'
                    : 'reveal-fade-in 500ms ease-out forwards',
            }}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-zinc-950/85" style={{ backdropFilter: 'blur(20px)' }} />

            {/* Close button */}
            <button onClick={handleClose}
                className="fixed top-4 right-4 z-[61] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
                close
            </button>

            {/* Scrollable reveal */}
            <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden">
                <div className="relative" style={{ height: Math.max(totalHeight, window.innerHeight), minHeight: '100vh' }}>

                    {allItems.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <p className="text-zinc-600 text-[11px]"
                                style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                explore a few loops to reveal your session
                            </p>
                        </div>
                    )}

                    {allItems.map((layoutItem) => {
                        const { item, x, y, size, rotate } = layoutItem;
                        const isSelected = selectedId === item.image.id;
                        const isHero = item.isHero;
                        const layer = item.layer;

                        // Stagger index within layer
                        let layerIndex: number;
                        if (layer === 'gravity') layerIndex = gravityIdx++;
                        else if (layer === 'range') layerIndex = rangeIdx++;
                        else layerIndex = detourIdx++;

                        const staggerDelay = staggerBase[layer] + layerIndex * (layer === 'gravity' ? 60 : layer === 'range' ? 40 : 30);

                        // Use preview URL for gravity heroes, thumbnails for rest
                        const imgUrl = layer === 'gravity' && isHero
                            ? getPreviewUrl(item.image.id)
                            : getThumbnailUrl(item.image.id);

                        return (
                            <div key={item.image.id}
                                className="absolute"
                                style={{
                                    left: x,
                                    top: y,
                                    width: size,
                                    ['--card-rotate' as string]: `${rotate}deg`,
                                    animation: `reveal-image-appear 500ms cubic-bezier(0.22, 1, 0.36, 1) ${staggerDelay}ms both`,
                                }}>
                                <button
                                    ref={isSelected ? selectedRef : undefined}
                                    onClick={() => handleImageTap(item.image.id)}
                                    className="w-full cursor-pointer rounded-sm overflow-hidden transition-shadow duration-300"
                                    style={{
                                        transform: `rotate(${rotate}deg)`,
                                        boxShadow: isHero
                                            ? `0 0 20px ${item.image.palette[0] || '#555'}30, 0 4px 16px rgba(0,0,0,0.4)`
                                            : '0 4px 16px rgba(0,0,0,0.3)',
                                        ...(isSelected ? {
                                            boxShadow: `0 0 0 2px ${item.image.palette[0] || '#aaa'}80, 0 4px 24px rgba(0,0,0,0.5)`,
                                        } : {}),
                                    }}>
                                    <img
                                        src={imgUrl}
                                        alt=""
                                        className="w-full aspect-[3/2] object-cover"
                                        loading="lazy"
                                    />
                                </button>

                                {/* Seed prompt */}
                                {isSelected && (
                                    <div className="mt-2 flex justify-center"
                                        style={{ animation: 'seed-prompt-in 200ms ease-out forwards' }}>
                                        <button
                                            onClick={() => handleSeed(item)}
                                            className="px-3 py-1.5 rounded-full text-[9px] text-zinc-300 bg-white/10 hover:bg-white/15 transition-colors cursor-pointer border border-white/10"
                                            style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                            explore from here
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default SessionReveal;
