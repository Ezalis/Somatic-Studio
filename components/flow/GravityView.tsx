import React, { useMemo, useState, useRef, useCallback } from 'react';
import { ImageNode } from '../../types';
import { TrailPoint, AffinityImage, AffinityLayer, FloatingTag } from './flowTypes';
import { computeSessionAffinities, seededRandom } from './flowHelpers';
import { getThumbnailUrl, getPreviewUrl } from '../../services/immichService';

interface GravityViewProps {
    trail: TrailPoint[];
    images: ImageNode[];
    onSeedLoop: (image: ImageNode, rect: DOMRect) => void;
}

interface LayoutItem {
    item: AffinityImage;
    x: number;
    y: number;
    width: number;
    height: number;
    rotate: number;
}

// Layout config per layer
const LAYER_SIZES: Record<AffinityLayer, { base: number; heroMult: number; cols: number; gap: number }> = {
    gravity: { base: 150, heroMult: 1.35, cols: 2, gap: 20 },
    range:   { base: 110, heroMult: 1.2, cols: 3, gap: 14 },
    detour:  { base: 75, heroMult: 1.1, cols: 4, gap: 10 },
};

function layoutSection(items: AffinityImage[], layer: AffinityLayer, viewW: number, startY: number) {
    const config = LAYER_SIZES[layer];
    const cols = Math.min(config.cols, Math.max(1, Math.floor(viewW / (config.base + config.gap))));
    const cellW = (viewW - (cols + 1) * config.gap) / cols;
    const laid: LayoutItem[] = [];
    const colHeights = new Array(cols).fill(startY);

    for (const item of items) {
        let minCol = 0;
        for (let c = 1; c < cols; c++) {
            if (colHeights[c] < colHeights[minCol]) minCol = c;
        }

        const w = item.isHero ? Math.min(cellW * config.heroMult, viewW * 0.55) : cellW * (0.8 + item.affinityScore * 0.2);
        const aspectRatio = 0.6 + seededRandom(item.image.id + 'ar') * 0.3; // 0.6 to 0.9
        const h = w * aspectRatio;
        const rotate = (seededRandom(item.image.id) - 0.5) * 6; // ±3 degrees

        const x = config.gap + minCol * (cellW + config.gap) + (cellW - w) / 2;
        const y = colHeights[minCol] + config.gap;

        laid.push({ item, x, y, width: w, height: h, rotate });
        colHeights[minCol] = y + h;
    }

    return { laid, endY: Math.max(...colHeights, startY) + config.gap };
}

const SECTION_LABELS: Record<AffinityLayer, string> = {
    gravity: 'what you kept coming back to',
    range: 'where you wandered',
    detour: 'the detour',
};

const GravityView: React.FC<GravityViewProps> = ({ trail, images, onSeedLoop }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedRef = useRef<HTMLButtonElement>(null);

    const { images: affinityImages, floatingTags } = useMemo(
        () => computeSessionAffinities(trail, images),
        [trail, images],
    );

    const gravityItems = useMemo(() => affinityImages.filter(a => a.layer === 'gravity'), [affinityImages]);
    const rangeItems = useMemo(() => affinityImages.filter(a => a.layer === 'range'), [affinityImages]);
    const detourItems = useMemo(() => affinityImages.filter(a => a.layer === 'detour'), [affinityImages]);

    const viewW = typeof window !== 'undefined' ? window.innerWidth : 390;

    const { sections, totalHeight } = useMemo(() => {
        const results: { layer: AffinityLayer; items: LayoutItem[]; startY: number; endY: number; tags: FloatingTag[] }[] = [];
        let y = 50;

        const layers: [AffinityLayer, AffinityImage[]][] = [
            ['gravity', gravityItems],
            ['range', rangeItems],
            ['detour', detourItems],
        ];

        for (const [layer, items] of layers) {
            if (items.length === 0) continue;
            const { laid, endY } = layoutSection(items, layer, viewW, y + 30);
            // Floating tags go in gravity section only
            const sectionTags = layer === 'gravity' ? floatingTags : [];
            results.push({ layer, items: laid, startY: y, endY, tags: sectionTags });
            y = endY + 40;
        }

        return { sections: results, totalHeight: y + 60 };
    }, [gravityItems, rangeItems, detourItems, floatingTags, viewW]);

    const handleTap = useCallback((id: string) => {
        setSelectedId(prev => prev === id ? null : id);
    }, []);

    const handleSeed = useCallback((item: AffinityImage) => {
        if (selectedRef.current) {
            onSeedLoop(item.image, selectedRef.current.getBoundingClientRect());
        }
    }, [onSeedLoop]);

    // Stagger counters
    let globalIdx = 0;

    return (
        <div className="relative" style={{ height: totalHeight, minHeight: '100vh' }}>
            {sections.length === 0 && (
                <div className="flex items-center justify-center h-64">
                    <p className="text-zinc-600 text-[11px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        explore a few loops to see your gravity
                    </p>
                </div>
            )}

            {sections.map((section) => {
                const glowColor = section.layer === 'gravity'
                    ? 'rgba(200, 140, 40, 0.025)'
                    : section.layer === 'detour'
                        ? 'rgba(50, 120, 80, 0.025)'
                        : 'transparent';

                return (
                    <div key={section.layer}>
                        {/* Section label */}
                        <div className="absolute left-5" style={{ top: section.startY }}>
                            <span className="text-[11px] text-zinc-500"
                                style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 500 }}>
                                {SECTION_LABELS[section.layer]}
                            </span>
                        </div>

                        {/* Glow zone */}
                        <div className="absolute rounded-2xl" style={{
                            left: 5, right: 5,
                            top: section.startY + 24,
                            height: section.endY - section.startY - 20,
                            background: glowColor,
                        }} />

                        {/* Floating tags (gravity section only) */}
                        {section.tags.map((tag, ti) => {
                            const tagX = 20 + seededRandom(tag.key + 'tx') * (viewW - 120);
                            const tagY = section.startY + 30 + seededRandom(tag.key + 'ty') * 60;
                            return (
                                <div key={tag.key} className="absolute"
                                    style={{
                                        left: tagX, top: tagY, zIndex: 10,
                                        animation: `float-tag-appear 400ms ease-out ${300 + ti * 100}ms both`,
                                    }}>
                                    <div className="px-3 py-1.5 rounded-full flex items-center gap-2"
                                        style={{
                                            background: tag.isColor
                                                ? `${tag.colorValue}18`
                                                : 'rgba(255,255,255,0.06)',
                                            border: `1px solid ${tag.isColor ? tag.colorValue + '40' : 'rgba(255,255,255,0.1)'}`,
                                        }}>
                                        {tag.isColor && (
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ background: tag.colorValue }} />
                                        )}
                                        <span className="text-[9px]" style={{
                                            fontFamily: 'JetBrains Mono, monospace',
                                            color: tag.isColor ? tag.colorValue : 'rgba(255,255,255,0.5)',
                                        }}>
                                            {tag.isColor ? tag.label : `#${tag.label}`}
                                        </span>
                                        {/* Frequency dots */}
                                        <div className="flex gap-0.5">
                                            {Array.from({ length: tag.count }).map((_, i) => (
                                                <div key={i} className="w-1 h-1 rounded-full"
                                                    style={{ background: tag.isColor ? tag.colorValue : 'rgba(255,255,255,0.4)' }} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Images */}
                        {section.items.map((layoutItem) => {
                            const { item, x, y, width, height, rotate } = layoutItem;
                            const isSelected = selectedId === item.image.id;
                            const idx = globalIdx++;
                            const delay = 150 + idx * 50;
                            const usePreview = section.layer === 'gravity' && item.isHero;

                            return (
                                <div key={item.image.id} className="absolute"
                                    style={{
                                        left: x, top: y, width, zIndex: isSelected ? 20 : 1,
                                        ['--card-rotate' as string]: `${rotate}deg`,
                                        animation: `history-image-appear 500ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
                                    }}>
                                    <button
                                        ref={isSelected ? selectedRef : undefined}
                                        onClick={() => handleTap(item.image.id)}
                                        className="w-full cursor-pointer rounded-sm overflow-hidden transition-shadow duration-300"
                                        style={{
                                            transform: `rotate(${rotate}deg)`,
                                            boxShadow: item.isHero
                                                ? `0 0 20px ${item.image.palette[0] || '#555'}30, 0 4px 16px rgba(0,0,0,0.4)`
                                                : '0 4px 12px rgba(0,0,0,0.3)',
                                            ...(isSelected ? {
                                                boxShadow: `0 0 0 2px ${item.image.palette[0] || '#aaa'}80, 0 4px 24px rgba(0,0,0,0.5)`,
                                            } : {}),
                                        }}>
                                        <img
                                            src={usePreview ? getPreviewUrl(item.image.id) : getThumbnailUrl(item.image.id)}
                                            alt=""
                                            className="w-full object-cover"
                                            style={{ height }}
                                            loading="lazy"
                                        />
                                    </button>

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
                );
            })}
        </div>
    );
};

export default GravityView;
