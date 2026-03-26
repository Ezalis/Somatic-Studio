import React, { useMemo, useState, useRef, useCallback } from 'react';
import { ImageNode } from '../../types';
import { TrailPoint, AffinityImage, AffinityLayer } from './flowTypes';
import { computeSessionAffinities, seededRandom, getColorTemperature } from './flowHelpers';
import { getThumbnailUrl, getPreviewUrl } from '../../services/immichService';

interface GravityViewProps {
    trail: TrailPoint[];
    images: ImageNode[];
    onSeedLoop: (image: ImageNode, rect: DOMRect) => void;
}

// Organic layout: images positioned with randomized horizontal offsets,
// varied widths, natural aspect ratios (no cropping), slight rotation.
// Heroes are centered and large, album images scatter to the sides.
interface PlacedImage {
    item: AffinityImage;
    left: number;     // percentage of viewport width (0-100)
    width: number;    // percentage of viewport width
    rotate: number;
    delay: number;
}

function placeImages(items: AffinityImage[], layer: AffinityLayer): PlacedImage[] {
    const placed: PlacedImage[] = [];
    let idx = 0;

    for (const item of items) {
        const r = seededRandom(item.image.id);
        const r2 = seededRandom(item.image.id + 'pos');

        let width: number;
        let left: number;

        if (item.isHero) {
            // Heroes: large, roughly centered with slight offset
            width = layer === 'gravity' ? 52 : layer === 'range' ? 40 : 32;
            left = 15 + r2 * 30; // 15-45% from left
        } else {
            // Album images: varied sizes, wider scatter
            const baseW = layer === 'gravity' ? 35 : layer === 'range' ? 28 : 22;
            width = baseW * (0.7 + item.affinityScore * 0.6);
            // Alternate sides with randomness
            if (idx % 2 === 0) {
                left = 5 + r2 * 35; // left side
            } else {
                left = 50 + r2 * 35; // right side
            }
        }

        // Clamp so image doesn't overflow
        if (left + width > 95) left = 95 - width;
        if (left < 2) left = 2;

        const rotate = (r - 0.5) * 6; // ±3 degrees
        const delay = 100 + idx * 45;

        placed.push({ item, left, width, rotate, delay });
        idx++;
    }

    return placed;
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

    // Palette dots: top 8 most frequent colors across hero palettes
    const paletteDots = useMemo(() => {
        const freq = new Map<string, number>();
        for (const point of trail) {
            for (const c of point.palette) freq.set(c, (freq.get(c) || 0) + 1);
        }
        return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
    }, [trail]);

    // Bridge info: find the continuedFromId that linked warm→cool or vice versa
    const bridgeInfo = useMemo(() => {
        for (let i = 0; i < trail.length - 1; i++) {
            const curr = getColorTemperature(trail[i].palette);
            const next = getColorTemperature(trail[i + 1].palette);
            if (curr !== next && trail[i].continuedFromId) {
                const bridgeImage = images.find(img => img.id === trail[i].continuedFromId);
                return { image: bridgeImage, fromTemp: curr, toTemp: next };
            }
        }
        return null;
    }, [trail, images]);

    const handleTap = useCallback((id: string) => {
        setSelectedId(prev => prev === id ? null : id);
    }, []);

    const handleSeed = useCallback((item: AffinityImage) => {
        if (selectedRef.current) {
            onSeedLoop(item.image, selectedRef.current.getBoundingClientRect());
        }
    }, [onSeedLoop]);

    const mono = { fontFamily: 'JetBrains Mono, monospace' };

    const renderSection = (
        items: AffinityImage[],
        layer: AffinityLayer,
        showTags: boolean,
        baseDelay: number,
    ) => {
        if (items.length === 0) return null;
        const placed = placeImages(items, layer);

        const glowColor = layer === 'gravity'
            ? 'rgba(200, 140, 40, 0.025)'
            : layer === 'detour'
                ? 'rgba(50, 120, 80, 0.025)'
                : 'transparent';

        return (
            <div className="relative mb-8">
                {/* Section label */}
                <div className="px-5 mb-4">
                    <span className="text-[11px] text-zinc-500" style={{ ...mono, fontWeight: 500 }}>
                        {SECTION_LABELS[layer]}
                    </span>
                </div>

                {/* Glow zone */}
                <div className="absolute inset-x-2 top-8 bottom-0 rounded-2xl"
                    style={{ background: glowColor }} />

                {/* Floating tags (gravity section only) */}
                {showTags && floatingTags.map((tag, ti) => (
                    <div key={tag.key} className="relative mx-auto mb-3"
                        style={{
                            width: 'fit-content',
                            marginLeft: `${15 + seededRandom(tag.key + 'mx') * 50}%`,
                            animation: `float-tag-appear 400ms ease-out ${baseDelay + 200 + ti * 80}ms both`,
                        }}>
                        <div className="px-3 py-1.5 rounded-full flex items-center gap-2"
                            style={{
                                background: tag.isColor ? `${tag.colorValue}18` : 'rgba(255,255,255,0.06)',
                                border: `1px solid ${tag.isColor ? tag.colorValue + '40' : 'rgba(255,255,255,0.1)'}`,
                            }}>
                            {tag.isColor && (
                                <div className="w-3 h-3 rounded-full" style={{ background: tag.colorValue }} />
                            )}
                            <span className="text-[10px]" style={{
                                ...mono,
                                color: tag.isColor ? tag.colorValue : 'rgba(255,255,255,0.5)',
                            }}>
                                {tag.isColor ? tag.label : `#${tag.label}`}
                            </span>
                            <div className="flex gap-0.5">
                                {Array.from({ length: tag.count }).map((_, i) => (
                                    <div key={i} className="w-1.5 h-1.5 rounded-full"
                                        style={{ background: tag.isColor ? tag.colorValue : 'rgba(255,255,255,0.4)' }} />
                                ))}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Scattered palette dots (gravity section only) */}
                {showTags && paletteDots.map((color, i) => (
                    <div key={color + i} className="absolute rounded-full"
                        style={{
                            width: 6 + seededRandom(color + 'ds') * 4,
                            height: 6 + seededRandom(color + 'ds') * 4,
                            background: color,
                            opacity: 0.35,
                            left: `${10 + seededRandom(color + 'dx') * 80}%`,
                            top: `${20 + seededRandom(color + 'dy') * 60}%`,
                        }} />
                ))}

                {/* Images — organic scatter with natural aspect ratios */}
                <div className="relative">
                    {placed.map((p) => {
                        const { item, left, width, rotate, delay } = p;
                        const isSelected = selectedId === item.image.id;
                        const usePreview = layer === 'gravity' && item.isHero;

                        return (
                            <div key={item.image.id}
                                className="relative mb-3"
                                style={{
                                    marginLeft: `${left}%`,
                                    width: `${width}%`,
                                    ['--card-rotate' as string]: `${rotate}deg`,
                                    animation: `history-image-appear 500ms cubic-bezier(0.22,1,0.36,1) ${baseDelay + delay}ms both`,
                                    zIndex: isSelected ? 20 : 1,
                                }}>
                                <button
                                    ref={isSelected ? selectedRef : undefined}
                                    onClick={() => handleTap(item.image.id)}
                                    className="w-full cursor-pointer rounded-md overflow-hidden transition-shadow duration-300"
                                    style={{
                                        transform: `rotate(${rotate}deg)`,
                                        boxShadow: item.isHero
                                            ? `0 0 24px ${item.image.palette[0] || '#555'}30, 0 4px 16px rgba(0,0,0,0.4)`
                                            : '0 4px 12px rgba(0,0,0,0.3)',
                                        ...(isSelected ? {
                                            boxShadow: `0 0 0 2px ${item.image.palette[0] || '#aaa'}80, 0 4px 24px rgba(0,0,0,0.5)`,
                                        } : {}),
                                    }}>
                                    {/* Natural aspect ratio — no height constraint, no object-cover crop */}
                                    <img
                                        src={usePreview ? getPreviewUrl(item.image.id) : getThumbnailUrl(item.image.id)}
                                        alt=""
                                        className="w-full h-auto"
                                        loading="lazy"
                                    />
                                </button>

                                {isSelected && (
                                    <div className="mt-2 flex justify-center"
                                        style={{ animation: 'seed-prompt-in 200ms ease-out forwards' }}>
                                        <button
                                            onClick={() => handleSeed(item)}
                                            className="px-3 py-1.5 rounded-full text-[10px] text-zinc-300 bg-white/10 hover:bg-white/15 transition-colors cursor-pointer border border-white/10"
                                            style={mono}>
                                            explore from here
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (affinityImages.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-zinc-600 text-[11px]" style={mono}>
                    explore a few loops to see your gravity
                </p>
            </div>
        );
    }

    return (
        <div className="pb-20">
            {/* Gravity section */}
            {renderSection(gravityItems, 'gravity', true, 0)}

            {/* Bridge zone (if temperature shift detected) */}
            {bridgeInfo && (
                <div className="relative py-8 px-5 mb-4">
                    <div className="flex items-center justify-center gap-3 mb-3">
                        {/* Color shift dots */}
                        <div className="flex gap-1">
                            {[0.4, 0.25, 0.12].map((op, i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full"
                                    style={{ background: bridgeInfo.fromTemp === 'warm' ? '#c88a28' : '#4a9068', opacity: op }} />
                            ))}
                        </div>

                        {/* Bridge image (if we have one) */}
                        {bridgeInfo.image && (
                            <div className="w-28 rounded-md overflow-hidden"
                                style={{
                                    transform: 'rotate(1deg)',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                }}>
                                <img src={getThumbnailUrl(bridgeInfo.image.id)} alt=""
                                    className="w-full h-auto" loading="lazy" />
                            </div>
                        )}

                        <div className="flex gap-1">
                            {[0.12, 0.25, 0.4].map((op, i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full"
                                    style={{ background: bridgeInfo.toTemp === 'cool' ? '#4a9068' : '#c88a28', opacity: op }} />
                            ))}
                        </div>
                    </div>
                    <p className="text-center text-[9px] text-zinc-600" style={mono}>
                        bridged {bridgeInfo.fromTemp} ↔ {bridgeInfo.toTemp}
                    </p>
                </div>
            )}

            {/* Range section */}
            {renderSection(rangeItems, 'range', false, 400)}

            {/* Detour section */}
            {renderSection(detourItems, 'detour', false, 700)}
        </div>
    );
};

export default GravityView;
