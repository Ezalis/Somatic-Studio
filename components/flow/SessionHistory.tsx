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

    // Organic scatter layout — absolute positioned, z-layered by affinity
    // High-affinity images on top (larger, higher z), low-affinity behind (smaller, lower z)
    const galleryLayout = useMemo(() => {
        const items: { item: AffinityImage; left: number; top: number; width: number; rotate: number; zIndex: number; delay: number }[] = [];

        // Tighter grid with jitter — fills space better
        const colCount = 6;
        const rowHeight = 90;
        let row = 0;
        let col = 0;

        for (let i = 0; i < affinityImages.length; i++) {
            const item = affinityImages[i];
            const r1 = seededRandom(item.image.id);
            const r2 = seededRandom(item.image.id + 'p');
            const r3 = seededRandom(item.image.id + 'r');

            // Smaller sizes: heroes ~16%, high-affinity ~13%, low ~10%
            const width = item.isHero ? 16 : 9 + item.affinityScore * 8;

            // Tighter grid with moderate jitter
            const baseLeft = (col / colCount) * 100;
            const baseTop = row * rowHeight;
            const left = baseLeft + (r1 - 0.5) * 10; // ±5% jitter
            const top = baseTop + (r2 - 0.5) * 25; // ±12px jitter

            const rotate = (r3 - 0.5) * 8; // ±4 degrees

            // Z-index: higher affinity = on top
            const zIndex = Math.round(item.affinityScore * 10) + (item.isHero ? 5 : 0);

            items.push({
                item, width, rotate, zIndex,
                left: Math.max(0, Math.min(100 - width, left)),
                top: Math.max(0, top),
                delay: 80 + i * 30,
            });

            col++;
            if (col >= colCount) {
                col = 0;
                row++;
            }
        }

        const maxTop = items.length > 0 ? Math.max(...items.map(i => i.top)) + 200 : 400;
        return { items, totalHeight: maxTop };
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

                    {/* Organic scattered gallery — z-layered by affinity */}
                    <div className="relative" style={{ height: galleryLayout.totalHeight }}>
                        {galleryLayout.items.map(({ item, left, top, width, rotate, zIndex, delay }) => {
                            const isSelected = selectedId === item.image.id;

                            return (
                                <div key={item.image.id}
                                    className="absolute"
                                    style={{
                                        left: `${left}%`,
                                        top,
                                        width: `${width}%`,
                                        zIndex: isSelected ? 30 : zIndex,
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
