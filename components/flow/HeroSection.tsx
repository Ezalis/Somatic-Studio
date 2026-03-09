import React, { useMemo, useRef, useEffect } from 'react';
import { ImageNode } from '../../types';
import { getPreviewUrl, getThumbnailUrl } from '../../services/immichService';
import { ScoredImage } from './flowTypes';
import { seededRandom } from './flowHelpers';
import MiniSprite from './MiniSprite';

interface HeroSectionProps {
    image: ImageNode;
    allImages: ImageNode[];
    temporalNeighbors: ScoredImage[];
    flipped: boolean;
    onFlip: () => void;
    onNavigate: (img: ImageNode) => void;
    heroRevealed: boolean;
}

const HeroSection: React.FC<HeroSectionProps> = ({ image, allImages, temporalNeighbors, flipped, onFlip, onNavigate, heroRevealed }) => {
    const scrollIndicatorRef = useRef<HTMLDivElement>(null);

    // Fade scroll indicator when traits section enters viewport
    useEffect(() => {
        const el = scrollIndicatorRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    el.style.opacity = '0';
                } else {
                    el.style.opacity = '1';
                }
            },
            { threshold: 0.1 }
        );
        const traitSection = document.getElementById('trait-section');
        if (traitSection) observer.observe(traitSection);
        return () => observer.disconnect();
    }, []);

    const palette = image.palette.length > 0 ? image.palette : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];

    // Timeline data for back face
    const allTimestamps = useMemo(() => allImages.map(i => i.captureTimestamp).sort((a: number, b: number) => a - b), [allImages]);
    const minTs = allTimestamps[0];
    const maxTs = allTimestamps[allTimestamps.length - 1];
    const range = maxTs - minTs || 1;
    const anchorPos = (image.captureTimestamp - minTs) / range;

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center px-4"
            style={{
                perspective: '1200px',
                opacity: heroRevealed ? 1 : 0,
                transform: heroRevealed ? 'translateY(0)' : 'translateY(48px)',
                transition: 'opacity 700ms ease, transform 700ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}>
            {/* 3D Card Flip Container */}
            <div
                className="w-full cursor-pointer"
                style={{
                    transformStyle: 'preserve-3d',
                    transition: 'transform 600ms ease-in-out',
                    transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
                onClick={onFlip}
            >
                {/* Front face — Hero image */}
                <div className="flex items-center justify-center w-full"
                    style={{ backfaceVisibility: 'hidden' }}>
                    <div className="w-full max-w-3xl mx-auto">
                        <div className="flex items-center justify-center">
                            <img src={getPreviewUrl(image.id)} alt=""
                                className="max-w-full max-h-[85vh] object-contain rounded-lg"
                                style={{ boxShadow: `0 16px 64px ${palette[0]}30, 0 4px 16px ${palette[1] || palette[0]}15` }}
                                draggable={false} />
                        </div>
                    </div>
                </div>

                {/* Back face — Handwritten details */}
                <div className="absolute inset-0 flex items-start justify-center pt-8"
                    style={{
                        backfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                        fontFamily: 'Caveat, cursive',
                    }}>
                    <div className="w-full max-w-lg flex flex-col items-center">
                        {/* Sprite identity */}
                        <MiniSprite image={image} size={80} />
                        <span className="text-zinc-400 mt-2 mb-6" style={{ fontSize: 14 }}>
                            Spectral Identity
                        </span>

                        {/* Timeline with hand-drawn annotation */}
                        <div className="w-full max-w-md px-4 mb-8 relative" style={{ height: 64 }}>
                            {/* Hand-drawn date label with line pointing to marker */}
                            <div className="absolute" style={{
                                left: `${anchorPos * 100}%`,
                                top: 0,
                                transform: 'translateX(-50%)',
                            }}>
                                <span className="text-zinc-500 block text-center whitespace-nowrap" style={{ fontSize: 13 }}>
                                    {new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                {/* Hand-drawn line from label to marker */}
                                <svg width="24" height="18" viewBox="0 0 24 18" className="mx-auto" style={{ overflow: 'visible' }}>
                                    <path d="M12 0 C11 6, 13 10, 12 18" stroke="#a1a1aa" strokeWidth="1.2" fill="none"
                                        strokeLinecap="round" strokeDasharray="none" />
                                </svg>
                            </div>
                            {/* Timeline bar — hand-drawn style */}
                            <svg className="absolute w-full" style={{ top: 36, left: 0, height: 28 }} viewBox="0 0 400 28" preserveAspectRatio="none">
                                {/* Hand-drawn baseline */}
                                <path d="M0 14 C20 13.5, 60 14.5, 100 14 C150 13.5, 200 14.5, 250 14 C300 13.5, 350 14.5, 400 14"
                                    stroke="#d4d4d8" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                                {/* Tick marks at year boundaries */}
                                {(() => {
                                    const startYear = new Date(minTs).getFullYear();
                                    const endYear = new Date(maxTs).getFullYear();
                                    const ticks: React.ReactNode[] = [];
                                    for (let y = startYear; y <= endYear; y++) {
                                        const yearTs = new Date(y, 0, 1).getTime();
                                        if (yearTs < minTs || yearTs > maxTs) continue;
                                        const pos = ((yearTs - minTs) / range) * 400;
                                        ticks.push(
                                            <g key={y}>
                                                <line x1={pos} y1={10} x2={pos + (seededRandom(String(y)) - 0.5) * 2} y2={18}
                                                    stroke="#a1a1aa" strokeWidth="1" strokeLinecap="round" />
                                            </g>
                                        );
                                    }
                                    return ticks;
                                })()}
                            </svg>
                            {/* Year labels */}
                            <div className="absolute w-full flex justify-between px-1" style={{ top: 50 }}>
                                <span className="text-zinc-400" style={{ fontSize: 12 }}>
                                    {new Date(minTs).getFullYear()}
                                </span>
                                <span className="text-zinc-400" style={{ fontSize: 12 }}>
                                    {new Date(maxTs).getFullYear()}
                                </span>
                            </div>
                            {/* Anchor marker — hand-drawn filled dot */}
                            <svg className="absolute" style={{
                                left: `calc(${anchorPos * 100}% - 6px)`,
                                top: 36 + 8,
                                width: 12, height: 12,
                            }}>
                                <circle cx="6" cy="6" r="5" fill="#3f3f46" stroke="#3f3f46" strokeWidth="0.5" />
                            </svg>
                        </div>

                        {/* Technical details — handwritten notes style */}
                        <div className="space-y-1 text-center mb-6">
                            {image.cameraModel !== 'Unknown Camera' && (
                                <p className="text-zinc-600" style={{ fontSize: 18 }}>
                                    {image.cameraModel}
                                </p>
                            )}
                            {image.lensModel !== 'Unknown Lens' && (
                                <p className="text-zinc-500" style={{ fontSize: 16 }}>
                                    {image.lensModel}
                                    {image.focalLength ? ` · ${image.focalLength}mm` : ''}
                                </p>
                            )}
                            <p className="text-zinc-400" style={{ fontSize: 15 }}>
                                {[
                                    image.shutterSpeed && image.shutterSpeed !== '--' ? image.shutterSpeed : null,
                                    image.aperture && image.aperture !== '--' ? image.aperture : null,
                                    image.iso ? `ISO ${image.iso}` : null,
                                ].filter(Boolean).join(' · ')}
                            </p>
                            {image.inferredSeason && (
                                <p className="text-zinc-400 italic" style={{ fontSize: 16 }}>{image.inferredSeason}</p>
                            )}
                        </div>

                        {/* Temporal neighbor thumbnails — 3 per row, max 3 rows */}
                        {temporalNeighbors.length > 0 && (
                            <div className="mt-4 w-full max-w-sm">
                                <span className="text-zinc-400 block text-center mb-3" style={{ fontSize: 15 }}>
                                    Same period ({temporalNeighbors.length})
                                </span>
                                <div className="grid grid-cols-3 gap-2 justify-items-center">
                                    {temporalNeighbors.slice(0, 9).map((s: ScoredImage) => (
                                        <div key={s.image.id}
                                            className="rounded-lg overflow-hidden cursor-pointer hover:scale-105 transition-transform w-full aspect-square"
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); onNavigate(s.image); }}>
                                            <img src={getThumbnailUrl(s.image.id)} alt="" className="w-full h-full object-cover" loading="lazy" draggable={false} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <span className="text-zinc-400 mt-8" style={{ fontSize: 14 }}>
                            tap to flip back
                        </span>
                    </div>
                </div>
            </div>

            {/* Scroll indicator */}
            <div ref={scrollIndicatorRef} className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 transition-opacity duration-500">
                <span className="text-zinc-400 text-base" style={{ fontFamily: 'Caveat, cursive', animation: 'scroll-hint-bounce 2s ease-in-out infinite' }}>
                    scroll to explore
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                    className="text-zinc-400" style={{ animation: 'scroll-hint-bounce 2s ease-in-out infinite' }}>
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </div>
        </div>
    );
};

export default HeroSection;
