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
    warm: 'rgba(180, 120, 30, 0.5)',
    cool: 'rgba(50, 120, 80, 0.5)',
    neutral: 'rgba(120, 120, 130, 0.4)',
};

const PATTERN_LABELS: Record<string, string> = {
    'circle-back': 'circle-back',
    'deep-dive': 'deep dive',
    'wander': 'wander',
    'drift': 'drift',
};

const ArcView: React.FC<ArcViewProps> = ({ trail, images }) => {
    const mono = { fontFamily: 'JetBrains Mono, monospace' };

    const arc = useMemo(() => detectSessionArc(trail), [trail]);

    const traitSummary = useMemo(() => {
        const freq = new Map<string, number>();
        for (const point of trail) {
            for (const t of point.traits) freq.set(t, (freq.get(t) || 0) + 1);
        }
        return [...freq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5) // Limit to top 5
            .map(([key, count]) => ({
                key,
                label: key.startsWith('color:') ? key.slice(6) : key.slice(4),
                isColor: key.startsWith('color:'),
                count,
                ratio: count / trail.length,
            }));
    }, [trail]);

    const imageMap = useMemo(() => {
        const map = new Map<string, ImageNode>();
        for (const img of images) map.set(img.id, img);
        return map;
    }, [images]);

    if (trail.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-[11px]" style={{ ...mono, color: '#a1a1aa' }}>
                    explore a few loops to see your arc
                </p>
            </div>
        );
    }

    return (
        <div className="px-5 pt-4 pb-20 max-w-lg">
            {/* Pattern label */}
            <div className="mb-5">
                <span className="text-[11px] uppercase tracking-[0.15em]"
                    style={{ ...mono, color: '#71717a' }}>
                    {PATTERN_LABELS[arc.pattern]}
                </span>
            </div>

            {/* Color temperature bar */}
            <div className="flex items-center gap-1.5 mb-5">
                {arc.tempSequence.map((temp, i) => (
                    <React.Fragment key={i}>
                        {i > 0 && (
                            <span className="text-[11px] px-0.5" style={{ color: '#a1a1aa' }}>→</span>
                        )}
                        <div className="flex-1 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: TEMP_COLORS[temp], minWidth: 60 }}>
                            <span className="text-[10px] font-medium" style={{ ...mono, color: '#27272a' }}>
                                {temp}
                            </span>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* Narrative */}
            <div className="mb-10">
                <p className="text-[16px] leading-relaxed" style={{ ...mono, color: '#27272a' }}>
                    {arc.narrative}
                </p>
                {arc.secondaryLine && (
                    <p className="text-[13px] mt-2 leading-relaxed" style={{ ...mono, color: '#52525b' }}>
                        {arc.secondaryLine}
                    </p>
                )}
            </div>

            {/* Divider */}
            <div className="h-px mb-6" style={{ background: 'rgba(0,0,0,0.08)' }} />

            {/* Per-loop breakdown */}
            <div className="mb-10">
                <span className="text-[11px] uppercase tracking-[0.15em] mb-5 block"
                    style={{ ...mono, color: '#71717a' }}>
                    your loops
                </span>

                {trail.map((point, i) => {
                    const heroImage = imageMap.get(point.id);
                    const temp = getColorTemperature(point.palette);

                    return (
                        <div key={point.id + i} className="flex items-start gap-4 mb-6">
                            {/* Hero thumbnail — natural aspect ratio in white card */}
                            <div className="flex-shrink-0 bg-white p-1 rounded"
                                style={{
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                                    width: 80,
                                }}>
                                {heroImage && (
                                    <img src={getThumbnailUrl(point.id)} alt=""
                                        className="w-full h-auto rounded-sm" loading="lazy" />
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                {/* Date + temp */}
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="text-[11px]" style={{ ...mono, color: '#3f3f46' }}>
                                        {point.label}
                                    </span>
                                    <div className="w-2.5 h-2.5 rounded-full"
                                        style={{ background: TEMP_COLORS[temp] }} />
                                    <span className="text-[10px]" style={{ ...mono, color: '#71717a' }}>
                                        {temp}
                                    </span>
                                </div>

                                {/* Traits — match TraitSelector chip style */}
                                {point.traits.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {point.traits.slice(0, 6).map(t => {
                                            const isColor = t.startsWith('color:');
                                            const val = isColor ? t.slice(6) : t.slice(4);
                                            return (
                                                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px]"
                                                    style={{
                                                        ...mono,
                                                        background: 'rgba(0,0,0,0.04)',
                                                        color: '#3f3f46',
                                                        border: '1px solid rgba(0,0,0,0.08)',
                                                    }}>
                                                    {isColor && <span className="w-2 h-2 rounded-full" style={{ background: val }} />}
                                                    {isColor ? '' : `#${val}`}
                                                </span>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <span className="text-[10px]" style={{ ...mono, color: '#a1a1aa' }}>
                                        {i === trail.length - 1 ? 'current loop' : 'no traits recorded'}
                                    </span>
                                )}

                                {point.albumPoolSize > 0 && (
                                    <span className="text-[9px] mt-1.5 block" style={{ ...mono, color: '#a1a1aa' }}>
                                        {point.albumPoolSize} images surfaced
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Session threads — compact */}
            {traitSummary.length > 0 && (
                <>
                    <div className="h-px mb-6" style={{ background: 'rgba(0,0,0,0.08)' }} />
                    <div>
                        <span className="text-[11px] uppercase tracking-[0.15em] mb-4 block"
                            style={{ ...mono, color: '#71717a' }}>
                            session threads
                        </span>

                        {traitSummary.map(trait => (
                            <div key={trait.key} className="flex items-center gap-3 mb-2">
                                <div className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{
                                        background: trait.isColor ? trait.label : '#71717a',
                                        opacity: 0.6,
                                    }} />
                                <div className="h-0.5 rounded-full overflow-hidden" style={{ width: 120, background: 'rgba(0,0,0,0.06)' }}>
                                    <div className="h-full rounded-full"
                                        style={{
                                            width: `${trait.ratio * 100}%`,
                                            background: trait.isColor ? trait.label : '#71717a',
                                            opacity: 0.5,
                                        }} />
                                </div>
                                <span className="text-[9px] flex-shrink-0" style={{ ...mono, color: '#71717a' }}>
                                    {trait.isColor ? '' : `#${trait.label}`} {trait.count}/{trail.length}
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default ArcView;
