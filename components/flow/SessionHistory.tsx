import React, { useMemo, useState, useRef, useCallback } from 'react';
import { ImageNode } from '../../types';
import { TrailPoint, AffinityImage } from './flowTypes';
import { computeSessionAffinities, seededRandom } from './flowHelpers';
import { getThumbnailUrl } from '../../services/immichService';
import ArcView from './ArcView';

interface SessionHistoryProps {
    trail: TrailPoint[];
    images: ImageNode[];
    onSeedLoop: (image: ImageNode, rect: DOMRect) => void;
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };

const SessionHistory: React.FC<SessionHistoryProps> = ({ trail, images, onSeedLoop }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedRef = useRef<HTMLButtonElement>(null);

    const { images: affinityImages, floatingTags } = useMemo(
        () => computeSessionAffinities(trail, images),
        [trail, images],
    );

    // Signal chips: tags + colors that generated the gallery (frequency >= 2)
    const signalChips = useMemo(() => {
        return floatingTags.slice(0, 6);
    }, [floatingTags]);

    const handleTap = useCallback((id: string) => {
        setSelectedId(prev => prev === id ? null : id);
    }, []);

    const handleSeed = useCallback((item: AffinityImage) => {
        if (selectedRef.current) {
            onSeedLoop(item.image, selectedRef.current.getBoundingClientRect());
        }
    }, [onSeedLoop]);

    // Scattered waterfall layout — 3 columns with jitter and rotation
    const galleryLayout = useMemo(() => {
        const cols = 3;
        const gap = 14;
        const colHeights = new Array(cols).fill(0);
        const items: { item: AffinityImage; col: number; y: number; rotate: number; xJitter: number; widthPct: number }[] = [];

        for (const item of affinityImages) {
            let minCol = 0;
            for (let c = 1; c < cols; c++) {
                if (colHeights[c] < colHeights[minCol]) minCol = c;
            }

            const r = seededRandom(item.image.id);
            const rotate = (r - 0.5) * 5; // ±2.5 degrees
            const xJitter = (seededRandom(item.image.id + 'jx') - 0.5) * 12; // ±6px horizontal jitter
            // Varied column widths — heroes wider
            const widthPct = item.isHero ? 36 : 28 + seededRandom(item.image.id + 'w') * 6;

            items.push({ item, col: minCol, y: colHeights[minCol], rotate, xJitter, widthPct });
            // Estimate height for layout (actual height comes from natural image aspect)
            const estH = 120 + seededRandom(item.image.id + 'eh') * 80;
            colHeights[minCol] += estH + gap;
        }

        return { items, totalHeight: Math.max(...colHeights, 400), cols };
    }, [affinityImages]);

    return (
        <div className="fixed inset-0 z-[55] pt-12 overflow-y-auto"
            style={{ background: '#faf9f6', animation: 'history-fade-in 400ms ease-out forwards' }}>

            {/* Two-column layout */}
            <div className="flex gap-6 px-5 pt-4 pb-20" style={{ minHeight: '100vh' }}>

                {/* LEFT COLUMN: Arc narrative + selected images/tags + threads */}
                <div className="flex-shrink-0" style={{ width: 'min(35%, 400px)' }}>
                    <ArcView trail={trail} images={images} />
                </div>

                {/* RIGHT COLUMN: Session gallery waterfall */}
                <div className="flex-1 min-w-0">
                    <div className="mb-3">
                        <span className="text-[11px] uppercase tracking-[0.15em]"
                            style={{ ...mono, color: '#71717a' }}>
                            session gallery
                        </span>
                    </div>

                    {/* Signal chips — what generated this gallery */}
                    {signalChips.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-4">
                            {signalChips.map(chip => (
                                <div key={chip.key}
                                    className="px-2.5 py-1 rounded-full flex items-center gap-1.5"
                                    style={{
                                        background: 'rgba(0,0,0,0.04)',
                                        border: '1px solid rgba(0,0,0,0.08)',
                                    }}>
                                    {chip.isColor && (
                                        <div className="w-2.5 h-2.5 rounded-full"
                                            style={{ background: chip.colorValue }} />
                                    )}
                                    <span className="text-[9px]" style={{ ...mono, color: '#3f3f46' }}>
                                        {chip.isColor ? '' : `#${chip.label}`}
                                    </span>
                                    <span className="text-[8px]" style={{ ...mono, color: '#a1a1aa' }}>
                                        {chip.count}/{trail.length}
                                    </span>
                                </div>
                            ))}
                            <span className="text-[8px] self-center" style={{ ...mono, color: '#a1a1aa' }}>
                                ← signals
                            </span>
                        </div>
                    )}

                    {/* Scattered gallery */}
                    <div className="relative" style={{ height: galleryLayout.totalHeight }}>
                        {galleryLayout.items.map(({ item, col, y, rotate, xJitter, widthPct }, idx) => {
                            const isSelected = selectedId === item.image.id;
                            const colPct = 100 / galleryLayout.cols;

                            return (
                                <div key={item.image.id}
                                    className="absolute"
                                    style={{
                                        left: `calc(${col * colPct}% + ${xJitter}px)`,
                                        top: y,
                                        width: `${widthPct}%`,
                                        zIndex: isSelected ? 20 : 1,
                                        ['--card-rotate' as string]: `${rotate}deg`,
                                        animation: `history-image-appear 500ms cubic-bezier(0.22,1,0.36,1) ${100 + idx * 40}ms both`,
                                    }}>
                                    <button
                                        ref={isSelected ? selectedRef : undefined}
                                        onClick={() => handleTap(item.image.id)}
                                        className="bg-white p-1.5 rounded cursor-pointer transition-shadow duration-200 w-full"
                                        style={{
                                            transform: `rotate(${rotate}deg)`,
                                            boxShadow: isSelected
                                                ? `0 0 0 2px ${item.image.palette[0] || '#888'}60, 0 4px 16px rgba(0,0,0,0.12)`
                                                : '0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
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
                                                className="px-2.5 py-1 rounded-full text-[8px] cursor-pointer transition-colors"
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
            </div>
        </div>
    );
};

export default SessionHistory;
