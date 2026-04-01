import React, { useMemo, useState, useRef, useCallback } from 'react';
import { ImageNode } from '../../types';
import { TrailPoint, AffinityImage, PersistedSession } from './flowTypes';
import { computeSessionAffinities, seededRandom, scatterPositions } from './flowHelpers';
import { getThumbnailUrl } from '../../services/immichService';
import ArcView from './ArcView';

interface SessionHistoryProps {
    trail: TrailPoint[];
    images: ImageNode[];
    onSeedLoop: (image: ImageNode, rect: DOMRect) => void;
    pastSessions: PersistedSession[];
    onLoadSession: (session: PersistedSession) => void;
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };

const TIER_Z: Record<number, number> = { 0: 6, 1: 3, 2: 1 };

const SessionHistory: React.FC<SessionHistoryProps> = ({ trail, images, onSeedLoop, pastSessions, onLoadSession }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selectedRef = useRef<HTMLButtonElement>(null);

    const { images: affinityImages } = useMemo(
        () => computeSessionAffinities(trail, images),
        [trail, images],
    );

    const gravityImages = useMemo(() => affinityImages.filter(a => a.layer === 'gravity'), [affinityImages]);
    const rangeImages = useMemo(() => affinityImages.filter(a => a.layer === 'range'), [affinityImages]);
    const detourImages = useMemo(() => affinityImages.filter(a => a.layer === 'detour'), [affinityImages]);

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

    const galBounds = { xMin: 2, xMax: 96, yMin: 2, yMax: 92 };

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
    ) => (
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
                    <div key={item.image.id} className="absolute"
                        style={{
                            left: `${pos.x}%`, top: `${pos.y}%`, width: size,
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
                            <img src={getThumbnailUrl(item.image.id)} alt=""
                                className="w-full h-auto rounded-sm" loading="lazy" />
                        </button>
                        {isSelected && (
                            <div className="mt-1.5 flex justify-center"
                                style={{ animation: 'seed-prompt-in 200ms ease-out forwards' }}>
                                <button onClick={() => handleSeed(item)}
                                    className="px-2.5 py-1 rounded-full text-[8px] cursor-pointer"
                                    style={{ ...mono, background: 'rgba(0,0,0,0.06)', color: '#3f3f46', border: '1px solid rgba(0,0,0,0.1)' }}>
                                    explore from here
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    // Gallery section (reused in both desktop and mobile layouts)
    const gallerySection = (
        <div>
            <div className="px-4 pt-4 pb-2">
                <div className="mb-2">
                    <span className="text-[11px] uppercase tracking-[0.15em]"
                        style={{ ...mono, color: '#71717a' }}>
                        session gallery
                    </span>
                </div>
                {signalChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {signalChips.map(chip => (
                            <div key={chip.key}
                                className="px-2 py-0.5 rounded-full flex items-center gap-1"
                                style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }}>
                                {chip.isColor && (
                                    <div className="w-2 h-2 rounded-full" style={{ background: chip.colorValue }} />
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
            <div className="relative overflow-hidden" style={{ minHeight: 500, height: 'min(70vh, 800px)' }}>
                {renderTier(detourImages, detourPositions, 2, { min: 80, max: 130 })}
                {renderTier(rangeImages, rangePositions, 1, { min: 120, max: 180 })}
                {renderTier(gravityImages, gravityPositions, 0, { min: 160, max: 280 })}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[55] pt-12"
            style={{ background: '#faf9f6', animation: 'history-fade-in 400ms ease-out forwards' }}>

            {/* Desktop: two-column (md and up) */}
            <div className="hidden md:flex h-full">
                <div className="flex-shrink-0 overflow-y-auto px-5 pt-4 pb-20"
                    style={{ width: 'min(35%, 400px)' }}>
                    <ArcView trail={trail} images={images} />
                    {pastSessions.length > 0 && (
                        <div className="mt-6">
                            <div className="mb-2 text-[10px] uppercase tracking-[0.15em]"
                                style={{ ...mono, color: '#71717a' }}>
                                past sessions
                            </div>
                            {pastSessions.map(session => (
                                <div key={session.id}
                                    className="flex items-center justify-between py-2 border-b"
                                    style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                                    <div>
                                        <div className="text-[10px]" style={{ ...mono, color: '#3f3f46' }}>
                                            {new Date(session.lastActiveAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </div>
                                        <div className="text-[9px]" style={{ ...mono, color: '#a1a1aa' }}>
                                            {session.heroCount} images{session.arcPattern ? ` · ${session.arcPattern}` : ''}
                                        </div>
                                    </div>
                                    <button onClick={() => onLoadSession(session)}
                                        className="text-[9px] px-2.5 py-1 rounded-full cursor-pointer transition-colors"
                                        style={{ ...mono, background: 'rgba(0,0,0,0.05)', color: '#3f3f46', border: '1px solid rgba(0,0,0,0.08)' }}>
                                        load
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                    {gallerySection}
                </div>
            </div>

            {/* Mobile: single column stacked */}
            <div className="md:hidden overflow-y-auto h-full">
                <div className="px-5 pt-4 pb-8">
                    <ArcView trail={trail} images={images} />
                    {pastSessions.length > 0 && (
                        <div className="mt-6">
                            <div className="mb-2 text-[10px] uppercase tracking-[0.15em]"
                                style={{ ...mono, color: '#71717a' }}>
                                past sessions
                            </div>
                            {pastSessions.map(session => (
                                <div key={session.id}
                                    className="flex items-center justify-between py-2 border-b"
                                    style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
                                    <div>
                                        <div className="text-[10px]" style={{ ...mono, color: '#3f3f46' }}>
                                            {new Date(session.lastActiveAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </div>
                                        <div className="text-[9px]" style={{ ...mono, color: '#a1a1aa' }}>
                                            {session.heroCount} images{session.arcPattern ? ` · ${session.arcPattern}` : ''}
                                        </div>
                                    </div>
                                    <button onClick={() => onLoadSession(session)}
                                        className="text-[9px] px-2.5 py-1 rounded-full cursor-pointer transition-colors"
                                        style={{ ...mono, background: 'rgba(0,0,0,0.05)', color: '#3f3f46', border: '1px solid rgba(0,0,0,0.08)' }}>
                                        load
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {gallerySection}
            </div>
        </div>
    );
};

export default SessionHistory;
