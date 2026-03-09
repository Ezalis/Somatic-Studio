import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ImageNode } from '../../types';
import { AlbumImage, ScoredImage } from './flowTypes';

interface TraitSelectorProps {
    image: ImageNode;
    scored: ScoredImage[];
    tagMap: Map<string, string>;
    selectedTraits: Set<string>;
    onToggleTrait: (key: string) => void;
    albumImages: AlbumImage[];
}

const TraitSelector: React.FC<TraitSelectorProps> = ({ image, scored, tagMap, selectedTraits, onToggleTrait, albumImages }) => {
    const palette = image.palette.length > 0 ? image.palette : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];
    const anchorTagIds = [...new Set([...image.tagIds, ...(image.aiTagIds || [])])];
    const anchorTagSet = new Set(anchorTagIds);
    const [pulsing, setPulsing] = useState(false);
    const prevCount = useRef(selectedTraits.size);

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

    // Discovery tags from top 30 scored neighbors
    const discoveryTags = useMemo((): { tagId: string; count: number; relevance: number }[] => {
        const tagCounts = new Map<string, number>();
        const hasFilters = selectedTraits.size > 0;
        const excludeTags = new Set(anchorTagSet);
        for (const key of selectedTraits) {
            if (key.startsWith('tag:')) excludeTags.add(key.slice(4));
        }

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

        return sorted.map(([tagId, count]) => ({
            tagId,
            count,
            relevance: count / maxCount,
        }));
    }, [scored, anchorTagSet, selectedTraits, albumImages]);

    const traitCount = selectedTraits.size;
    const maxTraits = 6;
    const isFull = traitCount >= maxTraits;

    // When full: compact row of just the 6 selected traits
    if (isFull) {
        const selectedColors = palette.slice(0, 5).filter(c => selectedTraits.has(`color:${c}`));
        const selectedTagIds = [...selectedTraits]
            .filter(k => k.startsWith('tag:'))
            .map(k => k.slice(4));

        return (
            <div className="px-6 py-4 max-w-2xl mx-auto">
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
        );
    }

    return (
        <div className="px-6 py-8 max-w-2xl mx-auto">
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
                    {palette.slice(0, 5).map((color: string, i: number) => {
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
                    })}
                </div>
            </div>

            {/* Image tags */}
            <div className="mb-5">
                <span className="text-[9px] tracking-[0.15em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    This image
                </span>
                <div className="flex flex-wrap gap-2">
                    {anchorTagIds.map((tagId: string) => {
                        const label = tagMap.get(tagId) || tagId;
                        const key = `tag:${tagId}`;
                        const isActive = selectedTraits.has(key);
                        const canSelect = traitCount < maxTraits || isActive;
                        return (
                            <button key={tagId} onClick={() => canSelect && onToggleTrait(key)}
                                className="px-3 py-1 rounded-full text-[11px] transition-all duration-200"
                                style={{
                                    fontFamily: 'JetBrains Mono, monospace',
                                    backgroundColor: isActive ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.04)',
                                    color: isActive ? '#18181b' : '#3f3f46',
                                    outline: isActive ? '1.5px solid rgba(0,0,0,0.25)' : 'none',
                                    fontWeight: isActive ? 600 : 400,
                                    opacity: canSelect ? 1 : 0.4,
                                    cursor: canSelect ? 'pointer' : 'default',
                                }}>
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Discovery tags */}
            {discoveryTags.length > 0 && (
                <div>
                    <span className="text-[9px] tracking-[0.15em] uppercase text-zinc-400 block mb-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Discover nearby
                    </span>
                    <div className="flex flex-wrap gap-2 items-center">
                        {discoveryTags.map(({ tagId, relevance }) => {
                            const label = tagMap.get(tagId) || tagId;
                            const key = `tag:${tagId}`;
                            const isActive = selectedTraits.has(key);
                            const canSelect = traitCount < maxTraits || isActive;
                            const fontSize = 9 + relevance * 4;
                            const px = 6 + relevance * 4;
                            const py = 2 + relevance * 2;
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
                                        backgroundColor: isActive ? 'rgba(0,0,0,0.12)' : `rgba(0,0,0,${0.01 + relevance * 0.04})`,
                                        color: isActive ? '#18181b' : `rgba(63,63,70,${0.5 + relevance * 0.5})`,
                                        outline: isActive ? '1.5px solid rgba(0,0,0,0.25)' : `1px dashed rgba(0,0,0,${0.08 + relevance * 0.12})`,
                                        fontWeight: isActive ? 600 : relevance > 0.7 ? 500 : 400,
                                        opacity: canSelect ? 1 : 0.4,
                                        cursor: canSelect ? 'pointer' : 'default',
                                    }}>
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TraitSelector;
