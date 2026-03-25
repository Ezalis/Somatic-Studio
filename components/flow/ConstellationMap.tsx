import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Tag } from '../../types';
import { TrailPoint } from './flowTypes';
import { averagePaletteDistance, seededRandom } from './flowHelpers';
import { getThumbnailUrl } from '../../services/immichService';

interface ConstellationMapProps {
    trail: TrailPoint[];
    tags: Tag[];
    isOpen: boolean;
    onClose: () => void;
}

const NODE_SIZE = 80;
const NODE_SIZE_CURRENT = 96;
const VERTICAL_SPACING = 240;
const TOP_PADDING = 100;
const ORBIT_RADIUS = 48;
const ORBIT_DOT_COUNT = 5;

function computeHeroPositions(trail: TrailPoint[], viewW: number) {
    const positions: { x: number; y: number }[] = [];
    if (trail.length === 0) return positions;

    // First hero centered
    positions.push({ x: viewW / 2, y: TOP_PADDING + NODE_SIZE_CURRENT / 2 });

    const MIN_X = viewW * 0.15;
    const MAX_X = viewW * 0.85;

    for (let i = 1; i < trail.length; i++) {
        const prev = trail[i - 1];
        const curr = trail[i];
        const prevPos = positions[i - 1];

        const dist = averagePaletteDistance(prev.palette, curr.palette);
        const normalizedDist = Math.min(1, dist / 250);

        // Drift direction: alternate sides with palette-distance-driven magnitude
        const jitter = seededRandom(curr.id) * 0.3 - 0.15;
        const direction = i % 2 === 0 ? 1 : -1;
        const drift = direction * (0.1 + normalizedDist * 0.25) + jitter;

        let x = prevPos.x + drift * viewW;
        x = Math.max(MIN_X, Math.min(MAX_X, x));

        const y = TOP_PADDING + NODE_SIZE_CURRENT / 2 + i * VERTICAL_SPACING;
        positions.push({ x, y });
    }
    return positions;
}

function svgCurvePath(x1: number, y1: number, x2: number, y2: number): string {
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

const ConstellationMap: React.FC<ConstellationMapProps> = ({ trail, tags, isOpen, onClose }) => {
    const [isClosing, setIsClosing] = useState(false);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const tagMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const t of tags) map.set(t.id, t.label);
        return map;
    }, [tags]);

    // Viewport width for layout
    const [viewW, setViewW] = useState(window.innerWidth);
    useEffect(() => {
        const onResize = () => setViewW(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const positions = useMemo(() => computeHeroPositions(trail, viewW), [trail, viewW]);

    const totalHeight = trail.length > 0
        ? TOP_PADDING + NODE_SIZE_CURRENT / 2 + (trail.length - 1) * VERTICAL_SPACING + VERTICAL_SPACING
        : 400;

    // Auto-scroll to bottom on open
    useEffect(() => {
        if (isOpen && scrollRef.current) {
            requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
            });
        }
    }, [isOpen]);

    // Escape key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 300);
    };

    const handleHeroTap = (index: number) => {
        setExpandedIndex(prev => prev === index ? null : index);
    };

    const renderTraitChips = (traits: string[]) => {
        const colors = traits.filter(t => t.startsWith('color:')).map(t => t.slice(6));
        const tagIds = traits.filter(t => t.startsWith('tag:')).map(t => t.slice(4));

        return (
            <div className="flex flex-wrap gap-1.5 mt-2">
                {colors.map((c, i) => (
                    <div key={`c${i}`} className="w-4 h-4 rounded-full border border-white/20"
                        style={{ backgroundColor: c }} />
                ))}
                {tagIds.map(id => (
                    <span key={id} className="px-2 py-0.5 rounded-full text-[9px] bg-white/10 text-zinc-300"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {tagMap.get(id) || id}
                    </span>
                ))}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[60]"
            style={{
                animation: isClosing
                    ? 'constellation-fade-out 300ms ease-out forwards'
                    : 'constellation-fade-in 400ms ease-out forwards',
            }}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-zinc-950/80" style={{ backdropFilter: 'blur(16px)' }} />

            {/* Close button */}
            <button onClick={handleClose}
                className="fixed top-4 right-4 z-[61] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px' }}>
                close
            </button>

            {/* Header */}
            <div className="fixed top-4 left-4 z-[61]">
                <span className="text-[10px] tracking-[0.25em] uppercase text-zinc-500"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {trail.length} visited
                </span>
            </div>

            {/* Scrollable river */}
            <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden pt-12">
                <div className="relative" style={{ height: totalHeight, minHeight: '100vh' }}>
                    {/* SVG path lines */}
                    <svg className="absolute inset-0 w-full pointer-events-none" style={{ height: totalHeight }}>
                        <defs>
                            {positions.map((_, i) => {
                                if (i === 0) return null;
                                const prev = trail[i - 1];
                                const curr = trail[i];
                                return (
                                    <linearGradient key={`grad-${i}`} id={`path-grad-${i}`}
                                        x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={prev.palette[0] || '#555'} stopOpacity="0.6" />
                                        <stop offset="100%" stopColor={curr.palette[0] || '#555'} stopOpacity="0.6" />
                                    </linearGradient>
                                );
                            })}
                        </defs>
                        {positions.map((pos, i) => {
                            if (i === 0) return null;
                            const prev = positions[i - 1];
                            const pathLength = Math.sqrt((pos.x - prev.x) ** 2 + (pos.y - prev.y) ** 2) + 100;
                            return (
                                <path key={`line-${i}`}
                                    d={svgCurvePath(prev.x, prev.y, pos.x, pos.y)}
                                    fill="none"
                                    stroke={`url(#path-grad-${i})`}
                                    strokeWidth="1.5"
                                    strokeDasharray="6 4"
                                    strokeDashoffset={pathLength}
                                    style={{
                                        animation: `path-draw 800ms ease-out ${200 + i * 100}ms forwards`,
                                        strokeDashoffset: pathLength,
                                    }}
                                />
                            );
                        })}
                    </svg>

                    {/* Hero nodes */}
                    {positions.map((pos, i) => {
                        const point = trail[i];
                        const isCurrent = i === trail.length - 1;
                        const size = isCurrent ? NODE_SIZE_CURRENT : NODE_SIZE;
                        const isExpanded = expandedIndex === i;

                        return (
                            <div key={point.id + i}
                                className="absolute"
                                style={{
                                    left: pos.x - size / 2,
                                    top: pos.y - size / 2,
                                    animation: `node-appear 300ms ease-out ${100 + i * 80}ms both`,
                                }}>
                                {/* Orbit dots */}
                                <div className="absolute"
                                    style={{
                                        left: size / 2,
                                        top: size / 2,
                                        animation: `orbit ${50 + seededRandom(point.id) * 20}s linear infinite`,
                                    }}>
                                    {point.palette.slice(0, ORBIT_DOT_COUNT).map((color, j) => {
                                        const angle = (j / ORBIT_DOT_COUNT) * Math.PI * 2;
                                        const r = ORBIT_RADIUS + size / 2;
                                        const isContinued = point.continuedFromId && j === 0;
                                        return (
                                            <div key={j}
                                                className="absolute rounded-full"
                                                style={{
                                                    width: isContinued ? 10 : 6,
                                                    height: isContinued ? 10 : 6,
                                                    backgroundColor: color,
                                                    opacity: 0.7,
                                                    left: Math.cos(angle) * r - (isContinued ? 5 : 3),
                                                    top: Math.sin(angle) * r - (isContinued ? 5 : 3),
                                                }}
                                            />
                                        );
                                    })}
                                </div>

                                {/* Hero image */}
                                <button
                                    onClick={() => handleHeroTap(i)}
                                    className="relative rounded-full overflow-hidden cursor-pointer"
                                    style={{
                                        width: size,
                                        height: size,
                                        border: `2px solid ${point.palette[0] || '#555'}40`,
                                        ...(isCurrent ? {
                                            boxShadow: `0 0 24px ${point.palette[0] || '#555'}50`,
                                            animation: 'trait-pulse 3s ease-in-out infinite',
                                        } : {}),
                                    }}>
                                    <img
                                        src={getThumbnailUrl(point.id)}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                </button>

                                {/* Date label */}
                                <div className="text-center mt-1">
                                    <span className="text-[8px] text-zinc-500"
                                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                                        {point.label}
                                    </span>
                                </div>

                                {/* Expanded detail */}
                                {isExpanded && (
                                    <div className="mt-2 px-2 py-2 rounded-lg bg-zinc-900/80 border border-white/5"
                                        style={{
                                            width: Math.max(200, size + 80),
                                            marginLeft: -(Math.max(200, size + 80) - size) / 2,
                                            animation: 'detail-expand 300ms ease-out forwards',
                                            fontFamily: 'JetBrains Mono, monospace',
                                        }}>
                                        {/* Palette swatches */}
                                        <div className="flex gap-1 mb-2">
                                            {point.palette.map((c, j) => (
                                                <div key={j} className="w-5 h-5 rounded-full"
                                                    style={{ backgroundColor: c }} />
                                            ))}
                                        </div>

                                        {/* Traits */}
                                        {point.traits.length > 0 && renderTraitChips(point.traits)}

                                        {/* Meta */}
                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[8px] text-zinc-500">
                                            {point.albumPoolSize > 0 && (
                                                <span>{point.albumPoolSize} images</span>
                                            )}
                                            {point.cameraModel && point.cameraModel !== 'Unknown Camera' && (
                                                <span>{point.cameraModel}</span>
                                            )}
                                            {point.lensModel && point.lensModel !== 'Unknown Lens' && (
                                                <span>{point.lensModel}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ConstellationMap;
