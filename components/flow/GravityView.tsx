import React, { useMemo, useState, useRef, useCallback } from 'react';
import { ImageNode } from '../../types';
import { TrailPoint, AffinityImage, AffinityLayer } from './flowTypes';
import { computeSessionAffinities, seededRandom, getColorTemperature } from './flowHelpers';
import { getThumbnailUrl } from '../../services/immichService';

interface GravityViewProps {
    trail: TrailPoint[];
    images: ImageNode[];
    onSeedLoop: (image: ImageNode, rect: DOMRect) => void;
}

interface PlacedImage {
    item: AffinityImage;
    left: number;
    width: number;
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
            // Heroes: moderate size, roughly centered
            width = layer === 'gravity' ? 35 : layer === 'range' ? 28 : 24;
            left = 10 + r2 * 45;
        } else {
            // Album images: smaller, wider scatter
            const baseW = layer === 'gravity' ? 25 : layer === 'range' ? 20 : 16;
            width = baseW * (0.8 + item.affinityScore * 0.4);
            if (idx % 2 === 0) {
                left = 3 + r2 * 40;
            } else {
                left = 52 + r2 * 35;
            }
        }

        if (left + width > 96) left = 96 - width;
        if (left < 2) left = 2;

        const rotate = (r - 0.5) * 6;
        const delay = 80 + idx * 35;
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
    const mono = { fontFamily: 'JetBrains Mono, monospace' };

    const { images: affinityImages, floatingTags } = useMemo(
        () => computeSessionAffinities(trail, images),
        [trail, images],
    );

    const gravityItems = useMemo(() => affinityImages.filter(a => a.layer === 'gravity'), [affinityImages]);
    const rangeItems = useMemo(() => affinityImages.filter(a => a.layer === 'range'), [affinityImages]);
    const detourItems = useMemo(() => affinityImages.filter(a => a.layer === 'detour'), [affinityImages]);

    // Palette dots
    const paletteDots = useMemo(() => {
        const freq = new Map<string, number>();
        for (const point of trail) {
            for (const c of point.palette) freq.set(c, (freq.get(c) || 0) + 1);
        }
        return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([c]) => c);
    }, [trail]);

    // Bridge info
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

    const renderSection = (
        items: AffinityImage[],
        layer: AffinityLayer,
        showTags: boolean,
        baseDelay: number,
    ) => {
        if (items.length === 0) return null;
        const placed = placeImages(items, layer);

        return (
            <div className="relative mb-6">
                {/* Section label */}
                <div className="px-5 mb-3">
                    <span className="text-[11px] tracking-[0.12em] uppercase"
                        style={{ ...mono, color: '#52525b' }}>
                        {SECTION_LABELS[layer]}
                    </span>
                </div>

                {/* Floating tags — light theme, match TraitSelector pill style */}
                {showTags && floatingTags.map((tag, ti) => (
                    <div key={tag.key} className="relative mx-auto mb-2"
                        style={{
                            width: 'fit-content',
                            marginLeft: `${12 + seededRandom(tag.key + 'mx') * 55}%`,
                            animation: `float-tag-appear 400ms ease-out ${baseDelay + 150 + ti * 60}ms both`,
                        }}>
                        <div className="px-3 py-1 rounded-full flex items-center gap-2"
                            style={{
                                background: 'rgba(0,0,0,0.04)',
                                border: '1px solid rgba(0,0,0,0.08)',
                            }}>
                            {tag.isColor && (
                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: tag.colorValue }} />
                            )}
                            <span className="text-[9px]" style={{ ...mono, color: '#3f3f46' }}>
                                {tag.isColor ? tag.label : `#${tag.label}`}
                            </span>
                            <div className="flex gap-0.5">
                                {Array.from({ length: tag.count }).map((_, i) => (
                                    <div key={i} className="w-1.5 h-1.5 rounded-full"
                                        style={{ background: tag.isColor ? tag.colorValue : '#71717a' }} />
                                ))}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Scattered palette dots */}
                {showTags && paletteDots.map((color, i) => (
                    <div key={color + i} className="absolute rounded-full"
                        style={{
                            width: 6 + seededRandom(color + 'ds') * 4,
                            height: 6 + seededRandom(color + 'ds') * 4,
                            background: color,
                            opacity: 0.3,
                            left: `${10 + seededRandom(color + 'dx') * 80}%`,
                            top: `${15 + seededRandom(color + 'dy') * 65}%`,
                        }} />
                ))}

                {/* Images — white card wrappers, natural aspect ratios */}
                <div className="relative">
                    {placed.map((p) => {
                        const { item, left, width, rotate, delay } = p;
                        const isSelected = selectedId === item.image.id;

                        return (
                            <div key={item.image.id}
                                className="relative mb-2"
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
                                    className="bg-white p-1.5 rounded cursor-pointer transition-shadow duration-300"
                                    style={{
                                        transform: `rotate(${rotate}deg)`,
                                        boxShadow: isSelected
                                            ? `0 0 0 2px ${item.image.palette[0] || '#888'}60, 0 4px 16px rgba(0,0,0,0.15)`
                                            : '0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)',
                                        display: 'block',
                                        width: '100%',
                                    }}>
                                    <img
                                        src={getThumbnailUrl(item.image.id)}
                                        alt=""
                                        className="w-full h-auto rounded-sm"
                                        loading="lazy"
                                    />
                                </button>

                                {isSelected && (
                                    <div className="mt-2 flex justify-center"
                                        style={{ animation: 'seed-prompt-in 200ms ease-out forwards' }}>
                                        <button
                                            onClick={() => handleSeed(item)}
                                            className="px-3 py-1.5 rounded-full text-[9px] cursor-pointer transition-colors"
                                            style={{
                                                ...mono,
                                                background: 'rgba(0,0,0,0.06)',
                                                color: '#3f3f46',
                                                border: '1px solid rgba(0,0,0,0.1)',
                                            }}>
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
                <p className="text-[11px]" style={{ ...mono, color: '#a1a1aa' }}>
                    explore a few loops to see your gravity
                </p>
            </div>
        );
    }

    return (
        <div className="pb-20">
            {renderSection(gravityItems, 'gravity', true, 0)}

            {/* Bridge zone */}
            {bridgeInfo && (
                <div className="relative py-6 px-5 mb-4">
                    <div className="flex items-center justify-center gap-3 mb-2">
                        <div className="flex gap-1">
                            {[0.5, 0.3, 0.15].map((op, i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full"
                                    style={{ background: bridgeInfo.fromTemp === 'warm' ? '#92400e' : '#166534', opacity: op }} />
                            ))}
                        </div>
                        {bridgeInfo.image && (
                            <div className="bg-white p-1 rounded"
                                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.10)', width: 80 }}>
                                <img src={getThumbnailUrl(bridgeInfo.image.id)} alt=""
                                    className="w-full h-auto rounded-sm" loading="lazy" />
                            </div>
                        )}
                        <div className="flex gap-1">
                            {[0.15, 0.3, 0.5].map((op, i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full"
                                    style={{ background: bridgeInfo.toTemp === 'cool' ? '#166534' : '#92400e', opacity: op }} />
                            ))}
                        </div>
                    </div>
                    <p className="text-center text-[9px]" style={{ ...mono, color: '#a1a1aa' }}>
                        bridged {bridgeInfo.fromTemp} ↔ {bridgeInfo.toTemp}
                    </p>
                </div>
            )}

            {renderSection(rangeItems, 'range', false, 300)}
            {renderSection(detourItems, 'detour', false, 500)}
        </div>
    );
};

export default GravityView;
