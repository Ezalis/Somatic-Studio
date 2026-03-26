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

    const { images: affinityImages } = useMemo(
        () => computeSessionAffinities(trail, images),
        [trail, images],
    );

    // Signal chips: all session traits with frequency, sorted by count
    const signalChips = useMemo(() => {
        // Include all traits (floatingTags only has freq >= 2), so compute from trail directly
        const freq = new Map<string, number>();
        for (const point of trail) {
            for (const t of point.traits) freq.set(t, (freq.get(t) || 0) + 1);
        }
        return [...freq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([key, count]) => ({
                key,
                label: key.startsWith('color:') ? key.slice(6) : key.slice(4),
                isColor: key.startsWith('color:'),
                colorValue: key.startsWith('color:') ? key.slice(6) : undefined,
                count,
            }));
    }, [trail]);

    const handleTap = useCallback((id: string) => {
        setSelectedId(prev => prev === id ? null : id);
    }, []);

    const handleSeed = useCallback((item: AffinityImage) => {
        if (selectedRef.current) {
            onSeedLoop(item.image, selectedRef.current.getBoundingClientRect());
        }
    }, [onSeedLoop]);

    // Gallery items with rotation for organic feel
    const galleryItems = useMemo(() => {
        return affinityImages.map((item, i) => ({
            item,
            rotate: (seededRandom(item.image.id) - 0.5) * 6, // ±3 degrees
            delay: 80 + i * 25,
        }));
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

                    {/* Masonry gallery with CSS columns — fills space evenly */}
                    <div style={{ columnCount: 4, columnGap: 10 }}>
                        {galleryItems.map(({ item, rotate, delay }) => {
                            const isSelected = selectedId === item.image.id;

                            return (
                                <div key={item.image.id}
                                    className="mb-2.5"
                                    style={{
                                        breakInside: 'avoid',
                                        ['--card-rotate' as string]: `${rotate}deg`,
                                        animation: `history-image-appear 500ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
                                    }}>
                                    <button
                                        ref={isSelected ? selectedRef : undefined}
                                        onClick={() => handleTap(item.image.id)}
                                        className="bg-white p-1.5 rounded cursor-pointer transition-shadow duration-200 w-full"
                                        style={{
                                            transform: `rotate(${rotate}deg)`,
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
