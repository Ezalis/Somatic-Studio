import React, { useMemo } from 'react';
import { ImageNode } from '../../types';
import { TrailPoint } from './flowTypes';
import { detectSessionArc, getColorTemperature } from './flowHelpers';
import { getThumbnailUrl } from '../../services/immichService';

interface ArcViewProps {
    trail: TrailPoint[];
    images: ImageNode[];
}

const TEMP_COLORS: Record<string, string> = {
    warm: 'rgba(200, 140, 40, 0.7)',
    cool: 'rgba(70, 140, 100, 0.7)',
    neutral: 'rgba(120, 120, 130, 0.7)',
};

const TEMP_TEXT_COLORS: Record<string, string> = {
    warm: '#c8a030',
    cool: '#4a9068',
    neutral: '#888890',
};

const PATTERN_LABELS: Record<string, string> = {
    'circle-back': 'circle-back',
    'deep-dive': 'deep dive',
    'wander': 'wander',
    'drift': 'drift',
};

const ArcView: React.FC<ArcViewProps> = ({ trail, images }) => {
    const arc = useMemo(() => detectSessionArc(trail), [trail]);

    // Trait frequency for thread summary
    const traitSummary = useMemo(() => {
        const freq = new Map<string, number>();
        for (const point of trail) {
            for (const t of point.traits) freq.set(t, (freq.get(t) || 0) + 1);
        }
        return [...freq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([key, count]) => ({
                key,
                label: key.startsWith('color:') ? key.slice(6) : key.slice(4),
                isColor: key.startsWith('color:'),
                count,
                ratio: count / trail.length,
            }));
    }, [trail]);

    // Image lookup for hero thumbnails
    const imageMap = useMemo(() => {
        const map = new Map<string, ImageNode>();
        for (const img of images) map.set(img.id, img);
        return map;
    }, [images]);

    const mono = { fontFamily: 'JetBrains Mono, monospace' };

    if (trail.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-zinc-600 text-[11px]" style={mono}>
                    explore a few loops to see your arc
                </p>
            </div>
        );
    }

    return (
        <div className="px-5 pt-4 pb-20">
            {/* Pattern label */}
            <div className="mb-6">
                <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-600" style={mono}>
                    {PATTERN_LABELS[arc.pattern]}
                </span>
            </div>

            {/* Color temperature bar */}
            <div className="flex items-center gap-1 mb-4">
                {arc.tempSequence.map((temp, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && (
                            <span className="text-zinc-600 text-[10px] px-0.5">→</span>
                        )}
                        <div className="flex-1 h-8 rounded-md flex items-center justify-center"
                            style={{ background: TEMP_COLORS[temp], minWidth: 60 }}>
                            <span className="text-[10px] font-medium" style={{ ...mono, color: 'rgba(0,0,0,0.6)' }}>
                                {temp}
                            </span>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* Narrative */}
            <div className="mb-8">
                <p className="text-[16px] text-zinc-400 leading-relaxed" style={mono}>
                    {arc.narrative}
                </p>
                {arc.secondaryLine && (
                    <p className="text-[13px] text-zinc-500 mt-2 leading-relaxed" style={mono}>
                        {arc.secondaryLine}
                    </p>
                )}
            </div>

            {/* Divider */}
            <div className="h-px bg-zinc-800 mb-6" />

            {/* Per-loop breakdown */}
            <div className="mb-8">
                <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-600 mb-4 block" style={mono}>
                    your loops
                </span>

                {trail.map((point, i) => {
                    const heroImage = imageMap.get(point.id);
                    const temp = getColorTemperature(point.palette);

                    return (
                        <div key={point.id + i} className="flex items-start gap-3 mb-4">
                            {/* Hero thumbnail — natural aspect ratio */}
                            <div className="flex-shrink-0 w-16 rounded-md overflow-hidden"
                                style={{
                                    border: `1px solid ${point.palette[0] || '#333'}40`,
                                    maxHeight: 80,
                                }}>
                                {heroImage && (
                                    <img src={getThumbnailUrl(point.id)} alt=""
                                        className="w-full h-auto" loading="lazy" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                {/* Date + temp */}
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-[11px] text-zinc-500" style={mono}>{point.label}</span>
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: TEMP_COLORS[temp] }} />
                                    <span className="text-[10px] text-zinc-600" style={mono}>{temp}</span>
                                </div>

                                {/* Traits */}
                                {point.traits.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                        {point.traits.slice(0, 6).map(t => {
                                            const isColor = t.startsWith('color:');
                                            const val = isColor ? t.slice(6) : t.slice(4);
                                            return (
                                                <span key={t} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px]"
                                                    style={{
                                                        ...mono,
                                                        background: isColor ? `${val}18` : 'rgba(255,255,255,0.05)',
                                                        color: isColor ? val : 'rgba(255,255,255,0.4)',
                                                        border: `1px solid ${isColor ? val + '30' : 'rgba(255,255,255,0.08)'}`,
                                                    }}>
                                                    {isColor && <span className="w-1.5 h-1.5 rounded-full" style={{ background: val }} />}
                                                    {isColor ? '' : `#${val}`}
                                                </span>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-zinc-700" style={mono}>
                                        {i === trail.length - 1 ? 'current loop' : 'no traits recorded'}
                                    </span>
                                )}

                                {/* Album count */}
                                {point.albumPoolSize > 0 && (
                                    <span className="text-[9px] text-zinc-700 mt-1 block" style={mono}>
                                        {point.albumPoolSize} images surfaced
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Divider */}
            <div className="h-px bg-zinc-800 mb-6" />

            {/* Session threads summary */}
            {traitSummary.length > 0 && (
                <div>
                    <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-600 mb-4 block" style={mono}>
                        session threads
                    </span>

                    {traitSummary.map(trait => (
                        <div key={trait.key} className="flex items-center gap-3 mb-2.5">
                            {/* Color dot or tag icon */}
                            <div className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{
                                    background: trait.isColor ? trait.label : TEMP_TEXT_COLORS.neutral,
                                    opacity: 0.8,
                                }} />

                            {/* Bar */}
                            <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${trait.ratio * 100}%`,
                                        background: trait.isColor ? trait.label : 'rgba(255,255,255,0.2)',
                                        opacity: 0.6,
                                    }} />
                            </div>

                            {/* Label */}
                            <span className="text-[10px] text-zinc-500 flex-shrink-0 w-28 text-right" style={mono}>
                                {trait.isColor ? '' : `#${trait.label}`} {trait.count}/{trail.length}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ArcView;
