import React, { useMemo, useState, useRef, useCallback } from 'react';
import { ImageNode } from '../../types';
import { TrailPoint, AffinityImage } from './flowTypes';
import { computeSessionAffinities, seededRandom, scatterPositions } from './flowHelpers';
import { getThumbnailUrl } from '../../services/immichService';
import ArcView from './ArcView';

interface SessionHistoryProps {
    trail: TrailPoint[];
    images: ImageNode[];
    onSeedLoop: (image: ImageNode, rect: DOMRect) => void;
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };

// Static tier z-layers: gravity on top, range middle, detour behind
const TIER_Z: Record<number, number> = { 0: 6, 1: 3, 2: 1 };

const SessionHistory: React.FC<SessionHistoryProps> = ({ trail, images, onSeedLoop }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedRef = useRef<HTMLButtonElement>(null);

    const { images: affinityImages } = useMemo(
        () => computeSessionAffinities(trail, images),
        [trail, images],
    );

    // Split into three tiers by affinity layer
    const gravityImages = useMemo(() => affinityImages.filter(a => a.layer === 'gravity'), [affinityImages]);
    const rangeImages = useMemo(() => affinityImages.filter(a => a.layer === 'range'), [affinityImages]);
    const detourImages = useMemo(() => affinityImages.filter(a => a.layer === 'detour'), [affinityImages]);

    // Signal chips from all traits
    const signalChips = useMemo(() => {
        const freq = new Map<string, number>();
        for (const point of trail) {
            for (const t of point.traits) freq.set(t, (freq.get(t) || 0) + 1);
        }
        return [...freq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([key, count]) => ({
                key, count,
                label: key.startsWith('color:') ? key.slice(6) : key.slice(4),
                isColor: key.startsWith('color:'),
                colorValue: key.startsWith('color:') ? key.slice(6) : undefined,
            }));
    }, [trail]);

    // Scatter positions for each tier
    const galBounds = { xMin: 2, xMax: 96, yMin: 2, yMax: 92 }; // percentage of gallery viewport

    const gravityPositions = useMemo(
        () => scatterPositions(gravityImages.length, 'grav', galBounds, 0.8),
        [gravityImages.length],
    );
    const rangePositions = useMemo(
        () => scatterPositions(rangeImages.length, 'range', galBounds, 1.0),
        [rangeImages.length],
    );
    const detourPositions = useMemo(
        () => scatterPositions(detourImages.length, 'detour', galBounds, 1.2),
        [detourImages.length],
    );

    const handleTap = useCallback((id: string) => {
        setSelectedId(prev => prev === id ? null : id);
    }, []);

    const handleSeed = useCallback((item: AffinityImage) => {
        if (selectedRef.current) {
            onSeedLoop(item.image, selectedRef.current.getBoundingClientRect());
        }
    }, [onSeedLoop]);

    const renderTier = (
        items: AffinityImage[],
        positions: { x: number; y: number }[],
        tier: number,
        baseSize: { min: number; max: number },
    ) => {
        return (
            <div className="absolute inset-0" style={{ zIndex: TIER_Z[tier] }}>
                {items.map((item, i) => {
                    const pos = positions[i];
                    if (!pos) return null;
                    const isSelected = selectedId === item.image.id;
                    const r = seededRandom(item.image.id + 'rot');
                    const rotate = (r - 0.5) * 6;
                    const size = item.isHero
                        ? baseSize.max
                        : baseSize.min + (baseSize.max - baseSize.min) * item.affinityScore;

                    return (
                        <div key={item.image.id}
                            className="absolute"
                            style={{
                                left: `${pos.x}%`,
                                top: `${pos.y}%`,
                                width: size,
                                transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
                                zIndex: isSelected ? 30 : TIER_Z[tier] + Math.round(item.affinityScore * 5),
                            }}>
                            <button
                                ref={isSelected ? selectedRef : undefined}
                                onClick={() => handleTap(item.image.id)}
                                className="bg-white p-1.5 rounded cursor-pointer transition-shadow duration-200 w-full"
                                style={{
                                    boxShadow: isSelected
                                        ? `0 0 0 2px ${item.image.palette[0] || '#888'}60, 0 4px 16px rgba(0,0,0,0.15)`
                                        : '0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)',
                                    display: 'block',
                                }}>
                                <img
                                    src={getThumbnailUrl(item.image.id)}
                                    alt=""
                                    className="w-full h-auto rounded-sm"
                                    loading="lazy"
                                />
                            </button>

                            {isSelected && (
                                <div className="mt-1.5 flex justify-center"
                                    style={{ animation: 'seed-prompt-in 200ms ease-out forwards' }}>
                                    <button
                                        onClick={() => handleSeed(item)}
                                        className="px-2.5 py-1 rounded-full text-[8px] cursor-pointer"
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
        );
    };

    return (
        <div className="fixed inset-0 z-[55] pt-12"
            style={{ background: '#faf9f6', animation: 'history-fade-in 400ms ease-out forwards' }}>

            {/* Two-column layout */}
            <div className="flex h-full">

                {/* LEFT COLUMN: Arc + threads + selected images (scrollable) */}
                <div className="flex-shrink-0 overflow-y-auto px-5 pt-4 pb-20"
                    style={{ width: 'min(35%, 400px)' }}>
                    <ArcView trail={trail} images={images} />
                </div>

                {/* RIGHT COLUMN: Session gallery (scroll-through tiers, no scroll bar) */}
                <div className="flex-1 min-w-0 flex flex-col">
                    {/* Gallery header */}
                    <div className="px-4 pt-4 pb-2 flex-shrink-0">
                        <div className="mb-2">
                            <span className="text-[11px] uppercase tracking-[0.15em]"
                                style={{ ...mono, color: '#71717a' }}>
                                session gallery
                            </span>
                        </div>

                        {/* Signal chips */}
                        {signalChips.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {signalChips.map(chip => (
                                    <div key={chip.key}
                                        className="px-2 py-0.5 rounded-full flex items-center gap-1"
                                        style={{
                                            background: 'rgba(0,0,0,0.04)',
                                            border: '1px solid rgba(0,0,0,0.08)',
                                        }}>
                                        {chip.isColor && (
                                            <div className="w-2 h-2 rounded-full"
                                                style={{ background: chip.colorValue }} />
                                        )}
                                        <span className="text-[8px]" style={{ ...mono, color: '#3f3f46' }}>
                                            {chip.isColor ? '' : `#${chip.label}`}
                                        </span>
                                        <span className="text-[7px]" style={{ ...mono, color: '#a1a1aa' }}>
                                            {chip.count}/{trail.length}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Gallery viewport — static layered scatter */}
                    <div className="flex-1 relative overflow-hidden">

                        {/* Tier 2 (detour) — behind, blurred initially */}
                        {renderTier(detourImages, detourPositions, 2, { min: 80, max: 130 })}

                        {/* Tier 1 (range) — middle layer */}
                        {renderTier(rangeImages, rangePositions, 1, { min: 120, max: 180 })}

                        {/* Tier 0 (gravity) — on top, large */}
                        {renderTier(gravityImages, gravityPositions, 0, { min: 160, max: 280 })}

                    </div>
                </div>
            </div>
        </div>
    );
};

export default SessionHistory;
