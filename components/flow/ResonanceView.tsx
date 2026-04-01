import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { getThumbnailUrl } from '../../services/immichService';
import { seededRandom, scatterPositions } from './flowHelpers';

interface ResonanceData {
    sessionCount: number;
    imageFrequency: Record<string, number>;
    imageTraits: Record<string, Record<string, number>>;
    divergence: Record<string, number>;
    bridges: Array<{ from: string; to: string; count: number }>;
    arcPatterns: Record<string, number>;
}

interface ResonanceNode {
    imageId: string;
    frequency: number;
    divergence: number;
    topTraits: string[];
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };

// Empty state — anticipatory field of drifting marks
const EmptyState: React.FC<{ loading: boolean }> = ({ loading }) => {
    const marks = useMemo(() =>
        Array.from({ length: 9 }, (_, i) => ({
            x: 8 + seededRandom(`mark-x-${i}`) * 84,
            y: 8 + seededRandom(`mark-y-${i}`) * 84,
            size: 4 + seededRandom(`mark-s-${i}`) * 10,
            delay: seededRandom(`mark-d-${i}`) * 6,
            duration: 6 + seededRandom(`mark-dur-${i}`) * 6,
        })), []
    );

    return (
        <div className="fixed inset-0 z-[55] pt-12"
            style={{ background: '#faf9f6', animation: 'history-fade-in 400ms ease-out forwards' }}>
            <div className="relative w-full h-full">
                {marks.map((m, i) => (
                    <div key={i} className="absolute rounded-full"
                        style={{
                            left: `${m.x}%`, top: `${m.y}%`,
                            width: m.size, height: m.size,
                            background: 'rgba(0,0,0,0.07)',
                            animation: `drift ${m.duration}s ease-in-out ${m.delay}s infinite`,
                        }} />
                ))}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center" style={mono}>
                        <div className="text-[10px] text-zinc-400 tracking-[0.2em] uppercase mb-3">
                            resonance
                        </div>
                        <div className="text-[11px] text-zinc-500 leading-relaxed">
                            {loading
                                ? 'reading the field...'
                                : 'the shape of others\' explorations\nwill appear here'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ARC_LABELS: Record<string, string> = {
    'circle-back': 'circled back',
    'deep-dive': 'went deep',
    'wander': 'wandered',
    'drift': 'drifted',
};

const ResonanceView: React.FC = () => {
    const [data, setData] = useState<ResonanceData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        fetch('/api/resonance/data')
            .then(r => r.json())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const nodes = useMemo((): ResonanceNode[] => {
        if (!data) return [];
        return Object.entries(data.imageFrequency)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 32)
            .map(([imageId, frequency]) => ({
                imageId,
                frequency,
                divergence: data.divergence[imageId] || 0,
                topTraits: Object.entries(data.imageTraits[imageId] || {})
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([t]) => t.startsWith('tag:') ? t.slice(4) : t.startsWith('color:') ? t.slice(6) : t),
            }));
    }, [data]);

    const maxFreq = useMemo(() => Math.max(1, ...nodes.map(n => n.frequency)), [nodes]);

    const galBounds = { xMin: 2, xMax: 96, yMin: 2, yMax: 92 };
    const positions = useMemo(
        () => scatterPositions(nodes.length, 'resonance', galBounds, 1.0),
        [nodes.length]
    );

    const handleTap = useCallback((id: string) => {
        setSelectedId(prev => prev === id ? null : id);
    }, []);

    if (loading || !data || data.sessionCount === 0) {
        return <EmptyState loading={loading} />;
    }

    const totalArcs = Object.values(data.arcPatterns).reduce((a, b) => a + b, 0);

    const summaryPanel = (
        <div style={mono}>
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 mb-4">
                resonance
            </div>
            <div className="text-[22px] text-zinc-700 mb-1" style={{ fontFamily: 'inherit', letterSpacing: '-0.02em' }}>
                {data.sessionCount}
            </div>
            <div className="text-[10px] text-zinc-400 tracking-wide mb-6">
                exploration{data.sessionCount !== 1 ? 's' : ''} recorded
            </div>

            {/* Arc breakdown */}
            {totalArcs > 0 && (
                <div className="mb-6">
                    <div className="text-[9px] uppercase tracking-[0.15em] text-zinc-400 mb-2">how people explored</div>
                    {Object.entries(data.arcPatterns)
                        .sort(([, a], [, b]) => b - a)
                        .map(([pattern, count]) => (
                            <div key={pattern} className="flex items-center gap-2 mb-1.5">
                                <div className="h-0.5 rounded-full" style={{
                                    width: `${Math.round((count / totalArcs) * 80)}px`,
                                    background: 'rgba(0,0,0,0.15)',
                                    minWidth: 4,
                                }} />
                                <span className="text-[9px] text-zinc-500">
                                    {ARC_LABELS[pattern] || pattern}
                                </span>
                                <span className="text-[9px] text-zinc-400">{count}</span>
                            </div>
                        ))}
                </div>
            )}

            {/* Legend */}
            <div className="space-y-2">
                <div className="text-[9px] uppercase tracking-[0.15em] text-zinc-400 mb-2">reading the field</div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-sm bg-white" style={{ boxShadow: '0 0 0 1.5px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)' }} />
                    <span className="text-[9px] text-zinc-400">size — how often explored</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-sm bg-white" style={{ boxShadow: '0 0 0 2px rgba(251,146,60,0.5), 0 2px 8px rgba(0,0,0,0.08)' }} />
                    <span className="text-[9px] text-zinc-400">amber ring — divergent responses</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-sm bg-white" style={{ boxShadow: '0 0 0 2px rgba(99,102,241,0.4), 0 2px 8px rgba(0,0,0,0.08)' }} />
                    <span className="text-[9px] text-zinc-400">indigo ring — convergent pull</span>
                </div>
            </div>
        </div>
    );

    const scatterField = (
        <div className="relative overflow-hidden w-full h-full">
            {nodes.map((node, i) => {
                const pos = positions[i];
                if (!pos) return null;

                const isSelected = selectedId === node.imageId;
                const t = node.frequency / maxFreq;
                const size = Math.round(80 + t * 160);
                const rotate = (seededRandom(node.imageId + 'res-rot') - 0.5) * 6;

                // Ring color: divergence > 0.5 = amber tension, else indigo convergence (only if freq > 1)
                const hasMeaning = node.frequency > 1;
                const ringColor = hasMeaning
                    ? node.divergence > 0.5
                        ? 'rgba(251,146,60,0.55)'
                        : 'rgba(99,102,241,0.4)'
                    : 'transparent';

                const shadow = isSelected
                    ? `0 0 0 2px ${ringColor}, 0 8px 24px rgba(0,0,0,0.18)`
                    : hasMeaning
                        ? `0 0 0 1.5px ${ringColor}, 0 3px 12px rgba(0,0,0,0.10)`
                        : '0 2px 8px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)';

                return (
                    <div key={node.imageId}
                        className="absolute"
                        style={{
                            left: `${pos.x}%`, top: `${pos.y}%`,
                            width: size,
                            transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
                            zIndex: isSelected ? 20 : Math.round(t * 10) + 1,
                            animation: `history-image-appear ${0.3 + i * 0.03}s ease-out both`,
                            '--card-rotate': `${rotate}deg`,
                        } as React.CSSProperties}>
                        <button
                            onClick={() => handleTap(node.imageId)}
                            className="w-full bg-white p-1.5 rounded cursor-pointer block"
                            style={{ boxShadow: shadow, transition: 'box-shadow 200ms ease' }}>
                            <img src={getThumbnailUrl(node.imageId)} alt=""
                                className="w-full h-auto rounded-sm" loading="lazy" />
                        </button>

                        {/* Visit count badge */}
                        {node.frequency > 1 && !isSelected && (
                            <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                                style={{ background: hasMeaning && node.divergence > 0.5 ? 'rgba(251,146,60,0.9)' : 'rgba(99,102,241,0.8)', ...mono }}>
                                <span className="text-[7px] text-white">{node.frequency}</span>
                            </div>
                        )}

                        {/* Selected: show top traits */}
                        {isSelected && node.topTraits.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1 justify-center"
                                style={{ animation: 'seed-prompt-in 200ms ease-out forwards' }}>
                                {node.topTraits.map(t => (
                                    <span key={t} className="px-1.5 py-0.5 rounded-full text-[8px]"
                                        style={{ ...mono, background: 'rgba(0,0,0,0.06)', color: '#52525b' }}>
                                        {t}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="fixed inset-0 z-[55] pt-12"
            style={{ background: '#faf9f6', animation: 'history-fade-in 400ms ease-out forwards' }}>

            {/* Desktop: two-column */}
            <div className="hidden md:flex h-full">
                <div className="flex-shrink-0 overflow-y-auto px-5 pt-4 pb-20"
                    style={{ width: 'min(35%, 400px)' }}>
                    {summaryPanel}
                </div>
                <div className="flex-1 min-w-0" style={{ height: '100%' }}>
                    {scatterField}
                </div>
            </div>

            {/* Mobile: stacked */}
            <div className="md:hidden h-full flex flex-col">
                <div className="px-5 pt-4 pb-4 flex-shrink-0">
                    {summaryPanel}
                </div>
                <div className="flex-1 relative">
                    {scatterField}
                </div>
            </div>
        </div>
    );
};

export default ResonanceView;
