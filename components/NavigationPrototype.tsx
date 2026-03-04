import React, { useState, useMemo, useCallback } from 'react';
import { ImageNode, Tag } from '../types';
import { getThumbnailUrl, getPreviewUrl } from '../services/immichService';

// --- Types ---

interface SessionGroup {
    date: string;
    label: string;
    images: ImageNode[];
}

type RelevanceTier = 'hero' | 'session' | 'high' | 'medium' | 'low';

interface TierStyle {
    blur: number;
    scale: number;
    opacity: number;
}

const TIER_STYLES: Record<RelevanceTier, TierStyle> = {
    hero:    { blur: 0,  scale: 1.0,  opacity: 1.0  },
    session: { blur: 1,  scale: 0.85, opacity: 1.0  },
    high:    { blur: 6,  scale: 0.6,  opacity: 0.95 },
    medium:  { blur: 15, scale: 0.45, opacity: 0.85 },
    low:     { blur: 32, scale: 0.3,  opacity: 0.65 },
};

// --- Helpers ---

function formatSessionDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function computeRelevanceTier(
    image: ImageNode,
    anchor: ImageNode | null,
): RelevanceTier {
    if (!anchor) return 'medium';
    if (image.id === anchor.id) return 'hero';
    if (image.shootDayClusterId === anchor.shootDayClusterId) return 'session';

    // Tag overlap
    const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
    const imageTags = [...image.tagIds, ...(image.aiTagIds || [])];
    const overlap = imageTags.filter(t => anchorTags.has(t)).length;

    if (overlap >= 3) return 'high';
    if (overlap >= 1) return 'medium';
    return 'low';
}

/** Seeded pseudo-random for consistent scatter positions */
function seededRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return ((hash & 0x7fffffff) % 1000) / 1000;
}

// --- Component ---

interface NavigationPrototypeProps {
    images: ImageNode[];
    tags: Tag[];
    onExit: () => void;
}

const NavigationPrototype: React.FC<NavigationPrototypeProps> = ({ images, tags, onExit }) => {
    const [anchorId, setAnchorId] = useState<string | null>(null);

    const anchor = useMemo(
        () => (anchorId ? images.find(i => i.id === anchorId) ?? null : null),
        [anchorId, images]
    );

    // Group images by shoot day
    const sessionGroups = useMemo(() => {
        const groups = new Map<string, ImageNode[]>();
        for (const img of images) {
            const key = img.shootDayClusterId;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(img);
        }
        // Sort groups by date descending, images within each by timestamp
        return Array.from(groups.entries())
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([date, imgs]): SessionGroup => ({
                date,
                label: formatSessionDate(date),
                images: imgs.sort((a, b) => a.captureTimestamp - b.captureTimestamp),
            }));
    }, [images]);

    // Split into anchor's session strip vs everything else
    const { anchorSession, otherSessions, scatteredImages } = useMemo(() => {
        if (!anchor) {
            return { anchorSession: null, otherSessions: sessionGroups, scatteredImages: [] };
        }

        const anchorGroup = sessionGroups.find(g => g.date === anchor.shootDayClusterId) ?? null;
        const others = sessionGroups.filter(g => g.date !== anchor.shootDayClusterId);

        // Separate other sessions into "related" strips and scattered prints
        const related: SessionGroup[] = [];
        const scattered: ImageNode[] = [];

        for (const group of others) {
            // Check if any image in the group shares tags with anchor
            const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
            const hasOverlap = group.images.some(img =>
                [...img.tagIds, ...(img.aiTagIds || [])].some(t => anchorTags.has(t))
            );

            if (hasOverlap && group.images.length > 1) {
                related.push(group);
            } else {
                scattered.push(...group.images);
            }
        }

        return {
            anchorSession: anchorGroup,
            otherSessions: related,
            scatteredImages: scattered,
        };
    }, [anchor, sessionGroups]);

    // Palette-derived CSS custom properties for surface
    const surfaceStyle = useMemo(() => {
        if (!anchor || anchor.palette.length === 0) {
            return { background: '#faf9f6' };
        }
        const p = anchor.palette;
        return {
            background: `
                radial-gradient(ellipse at 30% 20%, ${p[0]}14, transparent 60%),
                radial-gradient(ellipse at 80% 70%, ${p[1] || p[0]}0D, transparent 55%),
                radial-gradient(ellipse at 50% 90%, ${p[2] || p[0]}08, transparent 50%),
                #faf9f6
            `.trim(),
            transition: 'background 1.5s ease',
        };
    }, [anchor]);

    const handleImageClick = useCallback((imageId: string) => {
        setAnchorId(prev => prev === imageId ? null : imageId);
    }, []);

    // Tag lookup for annotations
    const tagMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const t of tags) map.set(t.id, t.label);
        return map;
    }, [tags]);

    // Get shared tags between anchor and an image
    const getSharedTags = useCallback((image: ImageNode): string[] => {
        if (!anchor) return [];
        const anchorTags = new Set([...anchor.tagIds, ...(anchor.aiTagIds || [])]);
        return [...image.tagIds, ...(image.aiTagIds || [])]
            .filter(t => anchorTags.has(t))
            .map(t => tagMap.get(t) ?? t);
    }, [anchor, tagMap]);

    return (
        <div
            className="fixed inset-0 overflow-auto"
            style={surfaceStyle}
        >
            {/* Paper texture */}
            <div
                className="fixed inset-0 opacity-[0.03] pointer-events-none mix-blend-multiply"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                }}
            />

            {/* Header */}
            <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 backdrop-blur-sm bg-[#faf9f6]/60">
                <h1
                    className="text-sm tracking-[0.3em] text-zinc-400 uppercase cursor-pointer hover:text-zinc-600 transition-colors"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                    Navigation Prototype
                </h1>
                <button
                    onClick={onExit}
                    className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors tracking-widest uppercase"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                    Exit
                </button>
            </header>

            {/* Main content */}
            <div className="px-6 pb-12 space-y-8 max-w-[1800px] mx-auto">

                {/* Anchor session strip (highlighted) */}
                {anchorSession && (
                    <SessionStrip
                        group={anchorSession}
                        anchor={anchor}
                        isAnchorStrip={true}
                        onImageClick={handleImageClick}
                        getSharedTags={getSharedTags}
                    />
                )}

                {/* No anchor state — show all sessions */}
                {!anchor && sessionGroups.map(group => (
                    <SessionStrip
                        key={group.date}
                        group={group}
                        anchor={null}
                        isAnchorStrip={false}
                        onImageClick={handleImageClick}
                        getSharedTags={getSharedTags}
                    />
                ))}

                {/* Related session strips */}
                {anchor && otherSessions.length > 0 && (
                    <div className="space-y-6 mt-8">
                        <p
                            className="text-xs text-zinc-400 tracking-widest uppercase"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}
                        >
                            Related sessions
                        </p>
                        {otherSessions.map(group => (
                            <SessionStrip
                                key={group.date}
                                group={group}
                                anchor={anchor}
                                isAnchorStrip={false}
                                onImageClick={handleImageClick}
                                getSharedTags={getSharedTags}
                            />
                        ))}
                    </div>
                )}

                {/* Scattered prints */}
                {anchor && scatteredImages.length > 0 && (
                    <div className="mt-12">
                        <p
                            className="text-xs text-zinc-400 tracking-widest uppercase mb-6"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}
                        >
                            Elsewhere in the collection
                        </p>
                        <ScatteredPrints
                            images={scatteredImages}
                            anchor={anchor}
                            onImageClick={handleImageClick}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Session Strip ---

interface SessionStripProps {
    group: SessionGroup;
    anchor: ImageNode | null;
    isAnchorStrip: boolean;
    onImageClick: (id: string) => void;
    getSharedTags: (image: ImageNode) => string[];
}

const SessionStrip: React.FC<SessionStripProps> = ({
    group, anchor, isAnchorStrip, onImageClick, getSharedTags,
}) => {
    return (
        <div
            className={`
                relative rounded-lg transition-all duration-700
                ${isAnchorStrip
                    ? 'bg-white/70 shadow-lg ring-1 ring-black/5 p-4'
                    : 'bg-white/30 shadow-sm p-3 hover:bg-white/50 hover:shadow-md'
                }
            `}
        >
            {/* Session date label */}
            <div className="flex items-baseline gap-3 mb-3">
                <span
                    className={`text-lg ${isAnchorStrip ? 'text-zinc-700' : 'text-zinc-400'} transition-colors duration-700`}
                    style={{ fontFamily: 'Caveat, cursive' }}
                >
                    {group.label}
                </span>
                <span
                    className="text-[10px] text-zinc-300"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                    {group.images.length} frames
                </span>
            </div>

            {/* Contact sheet strip */}
            <div
                className="flex gap-[2px] overflow-x-auto pb-1"
                style={{ scrollbarWidth: 'none' }}
            >
                {group.images.map(image => {
                    const tier = computeRelevanceTier(image, anchor);
                    const style = TIER_STYLES[tier];
                    const isHero = tier === 'hero';
                    const shared = anchor ? getSharedTags(image) : [];

                    return (
                        <div
                            key={image.id}
                            className="relative flex-none group cursor-pointer"
                            onClick={() => onImageClick(image.id)}
                        >
                            {/* Image frame */}
                            <div
                                className={`
                                    overflow-hidden transition-all duration-700 ease-out
                                    ${isHero
                                        ? 'rounded-md ring-2 ring-black/20 shadow-xl'
                                        : 'rounded-sm'
                                    }
                                `}
                                style={{
                                    width: isHero ? 280 : (isAnchorStrip ? 160 : 120),
                                    height: isHero ? 200 : (isAnchorStrip ? 115 : 85),
                                }}
                            >
                                <img
                                    src={isHero ? getPreviewUrl(image.id) : getThumbnailUrl(image.id)}
                                    alt={image.fileName}
                                    className="w-full h-full object-cover transition-all duration-700 ease-out"
                                    style={{
                                        filter: `blur(${style.blur}px)`,
                                        opacity: style.opacity,
                                        transform: `scale(${1 + style.blur * 0.01})`, // Compensate blur edge shrink
                                    }}
                                    loading="lazy"
                                    draggable={false}
                                />
                            </div>

                            {/* Hover annotation (shared tags) */}
                            {shared.length > 0 && !isHero && (
                                <div
                                    className="absolute -bottom-5 left-0 right-0 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                                >
                                    <span
                                        className="text-[9px] text-zinc-400 whitespace-nowrap"
                                        style={{ fontFamily: 'Caveat, cursive' }}
                                    >
                                        {shared.slice(0, 2).join(', ')}
                                    </span>
                                </div>
                            )}

                            {/* Hero label */}
                            {isHero && (
                                <div className="absolute -bottom-6 left-0 right-0 text-center">
                                    <span
                                        className="text-xs text-zinc-500"
                                        style={{ fontFamily: 'Caveat, cursive' }}
                                    >
                                        {image.fileName.replace(/\.[^.]+$/, '')}
                                    </span>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- Scattered Prints ---

interface ScatteredPrintsProps {
    images: ImageNode[];
    anchor: ImageNode;
    onImageClick: (id: string) => void;
}

const ScatteredPrints: React.FC<ScatteredPrintsProps> = ({ images, anchor, onImageClick }) => {
    // Pre-compute scatter positions and rotations from image IDs (deterministic)
    const scattered = useMemo(() => {
        return images.map(img => {
            const tier = computeRelevanceTier(img, anchor);
            const style = TIER_STYLES[tier];
            const rotation = (seededRandom(img.id + 'rot') - 0.5) * 6; // +-3 degrees

            return { img, tier, style, rotation };
        });
    }, [images, anchor]);

    return (
        <div className="flex flex-wrap gap-6 justify-center">
            {scattered.map(({ img, tier, style, rotation }) => (
                <div
                    key={img.id}
                    className="cursor-pointer group transition-transform duration-500 ease-out hover:scale-105 hover:z-10"
                    style={{
                        transform: `rotate(${rotation}deg)`,
                    }}
                    onClick={() => onImageClick(img.id)}
                >
                    <div
                        className="bg-white rounded-sm shadow-md overflow-hidden p-[3px] transition-shadow duration-500 group-hover:shadow-xl"
                    >
                        <img
                            src={getThumbnailUrl(img.id)}
                            alt={img.fileName}
                            className="rounded-[1px] object-cover transition-all duration-700 ease-out"
                            style={{
                                width: tier === 'high' ? 140 : tier === 'medium' ? 100 : 80,
                                height: tier === 'high' ? 100 : tier === 'medium' ? 72 : 56,
                                filter: `blur(${style.blur}px)`,
                                opacity: style.opacity,
                                transform: `scale(${1 + style.blur * 0.01})`,
                            }}
                            loading="lazy"
                            draggable={false}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};

export default NavigationPrototype;
