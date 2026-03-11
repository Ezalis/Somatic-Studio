import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ImageNode, Tag, TAG_CATEGORIES, TAG_CATEGORY_LABELS, TagCategory } from '../../types';
import { AlbumImage, ScoredImage } from './flowTypes';

interface TraitSelectorProps {
    image: ImageNode;
    scored: ScoredImage[];
    tagMap: Map<string, string>;
    tags: Tag[];
    selectedTraits: Set<string>;
    onToggleTrait: (key: string) => void;
    albumImages: AlbumImage[];
}

const SkeletonPill: React.FC<{ width: number; delay: number }> = ({ width, delay }) => (
    <div className="rounded-full"
        style={{
            width, height: 22,
            backgroundColor: '#d4d4d8',
            animation: `skeleton-pulse 2s ease-in-out ${delay}s infinite`,
        }} />
);

const SkeletonCircle: React.FC<{ size: number; delay: number }> = ({ size, delay }) => (
    <div className="rounded-full flex-shrink-0"
        style={{
            width: size, height: size,
            backgroundColor: '#d4d4d8',
            animation: `skeleton-pulse 2s ease-in-out ${delay}s infinite`,
        }} />
);

const TraitSelector: React.FC<TraitSelectorProps> = ({ image, scored, tagMap, tags, selectedTraits, onToggleTrait, albumImages }) => {
    const paletteLoading = image.palette.length === 0;
    const palette = image.palette.length > 0 ? image.palette : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];
    const anchorTagIds = [...new Set([...image.tagIds, ...(image.aiTagIds || [])])];
    const anchorTagSet = new Set(anchorTagIds);
    // Tags are loading if image has no AI tags AND global tags haven't arrived yet
    const tagsLoading = (image.aiTagIds || []).length === 0 && tags.length === 0;
    const [pulsing, setPulsing] = useState(false);
    const prevCount = useRef(selectedTraits.size);

    // Build tag lookup by id
    const tagById = useMemo(() => {
        const map = new Map<string, Tag>();
        for (const t of tags) map.set(t.id, t);
        return map;
    }, [tags]);

    // Group anchor tags by category
    const anchorTagsByCategory = useMemo(() => {
        const groups = new Map<TagCategory | 'other', { tagId: string; label: string }[]>();
        for (const tagId of anchorTagIds) {
            const tag = tagById.get(tagId);
            const cat = tag?.category || 'other';
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat)!.push({ tagId, label: tag?.label || tagMap.get(tagId) || tagId });
        }
        return groups;
    }, [anchorTagIds, tagById, tagMap]);

    // Pulse counter on increment
    useEffect(() => {
        if (selectedTraits.size > prevCount.current) {
            setPulsing(true);
            const t = setTimeout(() => setPulsing(false), 300);
            prevCount.current = selectedTraits.size;
            return () => clearTimeout(t);
        }
        prevCount.current = selectedTraits.size;
    }, [selectedTraits.size]);

    // Discovery tags from top 30 scored neighbors, grouped by category
    const discoveryTagsByCategory = useMemo(() => {
        const tagCounts = new Map<string, number>();
        const hasFilters = selectedTraits.size > 0;
        const excludeTags = new Set(anchorTagSet);

        const sourceImages = hasFilters && albumImages.length > 0
            ? albumImages.map((a: AlbumImage) => a.image)
            : scored.slice(0, 30).map((s: ScoredImage) => s.image);

        for (const img of sourceImages) {
            const imgTags = [...new Set([...img.tagIds, ...(img.aiTagIds || [])])];
            for (const tagId of imgTags) {
                if (!excludeTags.has(tagId)) {
                    tagCounts.set(tagId, (tagCounts.get(tagId) || 0) + 1);
                }
            }
        }

        const limit = hasFilters ? 20 + selectedTraits.size * 3 : 15;
        const sorted = [...tagCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);
        const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

        // Group by category
        const groups = new Map<TagCategory | 'other', { tagId: string; count: number; relevance: number }[]>();
        for (const [tagId, count] of sorted) {
            const tag = tagById.get(tagId);
            const cat = tag?.category || 'other';
            if (!groups.has(cat)) groups.set(cat, []);
            groups.get(cat)!.push({ tagId, count, relevance: count / maxCount });
        }
        return groups;
    }, [scored, anchorTagSet, selectedTraits, albumImages, tagById]);

    const traitCount = selectedTraits.size;
    const maxTraits = 6;
    const isFull = traitCount >= maxTraits;

    // Shared tag button renderer
    const renderTagButton = (tagId: string, label: string, opts?: { relevance?: number; dashed?: boolean }) => {
        const key = `tag:${tagId}`;
        const isActive = selectedTraits.has(key);
        const canSelect = traitCount < maxTraits || isActive;
        const relevance = opts?.relevance;
        const dashed = opts?.dashed ?? false;

        const fontSize = relevance != null ? 9 + relevance * 4 : 11;
        const px = relevance != null ? 6 + relevance * 4 : 12;
        const py = relevance != null ? 2 + relevance * 2 : 4;

        return (
            <button key={tagId} onClick={() => canSelect && onToggleTrait(key)}
                className="rounded-full transition-all duration-200"
                style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize,
                    paddingLeft: px,
                    paddingRight: px,
                    paddingTop: py,
                    paddingBottom: py,
                    backgroundColor: isActive
                        ? 'rgba(0,0,0,0.12)'
                        : relevance != null
                            ? `rgba(0,0,0,${0.01 + relevance * 0.04})`
                            : 'rgba(0,0,0,0.04)',
                    color: isActive
                        ? '#18181b'
                        : relevance != null
                            ? `rgba(63,63,70,${0.5 + relevance * 0.5})`
                            : '#3f3f46',
                    outline: isActive
                        ? '1.5px solid rgba(0,0,0,0.25)'
                        : dashed && relevance != null
                            ? `1px dashed rgba(0,0,0,${0.08 + relevance * 0.12})`
                            : 'none',
                    fontWeight: isActive ? 600 : (relevance != null && relevance > 0.7) ? 500 : 400,
                    opacity: canSelect ? 1 : 0.4,
                    cursor: canSelect ? 'pointer' : 'default',
                }}>
                {label}
            </button>
        );
    };

    // Category section header
    const renderCategoryLabel = (cat: TagCategory | 'other') => (
        <span className="text-[8px] tracking-[0.15em] uppercase text-zinc-400 mr-2 flex-shrink-0 self-center"
            style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {cat === 'other' ? 'Other' : TAG_CATEGORY_LABELS[cat]}
        </span>
    );

    // When full: compact row of just the 6 selected traits
    if (isFull) {
        const selectedColors = palette.slice(0, 5).filter(c => selectedTraits.has(`color:${c}`));
        const selectedTagIds = [...selectedTraits]
            .filter(k => k.startsWith('tag:'))
            .map(k => k.slice(4));

        return (
            <div className="px-6 py-4 max-w-2xl mx-auto">
              <div className="rounded-2xl px-5 py-4" style={{
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  background: 'rgba(250, 249, 246, 0.65)',
                  border: '1px solid rgba(255,255,255,0.4)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
              }}>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[11px] tracking-[0.2em] uppercase text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Your traits
                    </h2>
                    <div className="flex gap-1">
                        {Array.from({ length: maxTraits }).map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full bg-zinc-700" style={{ border: '1.5px solid #3f3f46' }} />
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {selectedColors.map((color: string, i: number) => (
                        <button key={`c${i}`} onClick={() => onToggleTrait(`color:${color}`)}
                            className="rounded-full cursor-pointer flex-shrink-0"
                            style={{
                                backgroundColor: color,
                                width: 28, height: 28,
                                outline: '2px solid rgba(0,0,0,0.25)',
                                outlineOffset: 2,
                            }} />
                    ))}
                    {selectedTagIds.map((tagId: string) => {
                        const label = tagMap.get(tagId) || tagId;
                        return (
                            <button key={tagId} onClick={() => onToggleTrait(`tag:${tagId}`)}
                                className="px-3 py-1 rounded-full text-[11px] cursor-pointer"
                                style={{
                                    fontFamily: 'JetBrains Mono, monospace',
                                    backgroundColor: 'rgba(0,0,0,0.12)',
                                    color: '#18181b',
                                    outline: '1.5px solid rgba(0,0,0,0.25)',
                                    fontWeight: 600,
                                }}>
                                {label}
                            </button>
                        );
                    })}
                </div>
              </div>
            </div>
        );
    }

    // Ordered categories for display
    const categoryOrder: (TagCategory | 'other')[] = [...TAG_CATEGORIES, 'other'];

    return (
        <div className="px-6 py-8 max-w-2xl mx-auto">
          <div className="rounded-2xl px-5 py-6" style={{
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              background: 'rgba(250, 249, 246, 0.65)',
              border: '1px solid rgba(255,255,255,0.4)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}>
            {/* Header + counter */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-[11px] tracking-[0.2em] uppercase text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Choose your traits
                </h2>
                <div className="flex items-center gap-2"
                    style={{ animation: pulsing ? 'trait-pulse 300ms ease' : 'none' }}>
                    <span className="text-[10px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {traitCount} of {maxTraits}
                    </span>
                    <div className="flex gap-1">
                        {Array.from({ length: maxTraits }).map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full transition-all duration-200"
                                style={{
                                    backgroundColor: i < traitCount ? '#3f3f46' : 'transparent',
                                    border: `1.5px solid ${i < traitCount ? '#3f3f46' : '#d4d4d8'}`,
                                }} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Palette row */}
            <div className="mb-5">
                <span className="text-[9px] tracking-[0.15em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    Palette
                </span>
                <div className="flex gap-3 py-1">
                    {paletteLoading ? (
                        Array.from({ length: 5 }, (_, i) => (
                            <SkeletonCircle key={i} size={24} delay={i * 0.15} />
                        ))
                    ) : (
                        palette.slice(0, 5).map((color: string, i: number) => {
                            const key = `color:${color}`;
                            const isActive = selectedTraits.has(key);
                            const canSelect = traitCount < maxTraits || isActive;
                            return (
                                <button key={i} onClick={() => canSelect && onToggleTrait(key)}
                                    className="rounded-full transition-all duration-200 flex-shrink-0"
                                    style={{
                                        backgroundColor: color,
                                        width: isActive ? 32 : 24,
                                        height: isActive ? 32 : 24,
                                        outline: isActive ? '2.5px solid rgba(0,0,0,0.3)' : 'none',
                                        outlineOffset: 2,
                                        opacity: canSelect ? 1 : 0.4,
                                        cursor: canSelect ? 'pointer' : 'default',
                                    }} />
                            );
                        })
                    )}
                </div>
            </div>

            {/* Image tags — grouped by category */}
            <div className="mb-5">
                <span className="text-[9px] tracking-[0.15em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    This image
                </span>
                {tagsLoading ? (
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <SkeletonPill width={52} delay={0} />
                            <SkeletonPill width={68} delay={0.1} />
                            <SkeletonPill width={44} delay={0.2} />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <SkeletonPill width={60} delay={0.15} />
                            <SkeletonPill width={76} delay={0.25} />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {categoryOrder.map(cat => {
                            const items = anchorTagsByCategory.get(cat);
                            if (!items || items.length === 0) return null;
                            return (
                                <div key={cat} className="flex flex-wrap items-center gap-1.5">
                                    {renderCategoryLabel(cat)}
                                    {items.map(({ tagId, label }) => renderTagButton(tagId, label))}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Discovery tags — grouped by category */}
            {tagsLoading ? (
                <div>
                    <span className="text-[9px] tracking-[0.15em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Discover nearby
                    </span>
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <SkeletonPill width={56} delay={0.3} />
                            <SkeletonPill width={72} delay={0.4} />
                            <SkeletonPill width={48} delay={0.5} />
                            <SkeletonPill width={64} delay={0.35} />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <SkeletonPill width={44} delay={0.45} />
                            <SkeletonPill width={80} delay={0.55} />
                            <SkeletonPill width={56} delay={0.5} />
                        </div>
                    </div>
                </div>
            ) : discoveryTagsByCategory.size > 0 ? (
                <div>
                    <span className="text-[9px] tracking-[0.15em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Discover nearby
                    </span>
                    <div className="space-y-2">
                        {categoryOrder.map(cat => {
                            const items = discoveryTagsByCategory.get(cat);
                            if (!items || items.length === 0) return null;
                            return (
                                <div key={cat} className="flex flex-wrap items-center gap-1.5">
                                    {renderCategoryLabel(cat)}
                                    {items.map(({ tagId, relevance }) => {
                                        const label = tagMap.get(tagId) || tagId;
                                        return renderTagButton(tagId, label, { relevance, dashed: true });
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}
          </div>
        </div>
    );
};

export default TraitSelector;
