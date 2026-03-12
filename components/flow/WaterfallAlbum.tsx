import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { ImageNode } from '../../types';
import { AlbumImage, WaterfallNode, WaterfallImage } from './flowTypes';
import { seededRandom } from './flowHelpers';
import { getThumbnailUrl, getPreviewUrl } from '../../services/immichService';
import MiniSprite from './MiniSprite';

interface WaterfallAlbumProps {
    albumImages: AlbumImage[];
    traitCount: number;
    onSelect: (img: ImageNode, rect: DOMRect) => void;
    gentleReveal?: boolean;
    isAlbumPhase?: boolean;
    onScrollDepth?: (depth: number) => void;
    waterfallImages?: WaterfallImage[];
}

// Grid-based scatter with jitter — good for tier 1 (few large items, even spread)
function scatterPositions(count: number, seed: string, bounds: { xMin: number; xMax: number; yMin: number; yMax: number }) {
    const positions: { x: number; y: number }[] = [];
    const aspectRatio = (bounds.xMax - bounds.xMin) / (bounds.yMax - bounds.yMin);
    const cols = Math.max(2, Math.round(Math.sqrt(count * aspectRatio)));
    const rows = Math.max(2, Math.ceil(count / cols));
    const cellW = (bounds.xMax - bounds.xMin) / cols;
    const cellH = (bounds.yMax - bounds.yMin) / rows;

    for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const jitterX = (seededRandom('X' + seed + i * 7) - 0.5) * cellW * 0.8;
        const jitterY = (seededRandom('Y' + seed + i * 13) - 0.5) * cellH * 0.8;
        let x = bounds.xMin + (col + 0.5) * cellW + jitterX;
        let y = bounds.yMin + (row + 0.5) * cellH + jitterY;
        x = Math.max(bounds.xMin, Math.min(bounds.xMax, x));
        y = Math.max(bounds.yMin, Math.min(bounds.yMax, y));
        positions.push({ x, y });
    }
    return positions;
}

// Fully random scatter with min-distance repulsion — organic "photos on a desk" feel
function organicScatter(count: number, seed: string, bounds: { xMin: number; xMax: number; yMin: number; yMax: number }, minDist = 8) {
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
        let x = bounds.xMin + seededRandom(seed + 'x' + i) * (bounds.xMax - bounds.xMin);
        let y = bounds.yMin + seededRandom(seed + 'y' + i) * (bounds.yMax - bounds.yMin);
        // Push away from nearest neighbor if too close (single pass)
        for (const p of positions) {
            const dx = x - p.x, dy = y - p.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < minDist && d > 0) {
                const push = (minDist - d) / d;
                x += dx * push * 0.5;
                y += dy * push * 0.5;
            }
        }
        x = Math.max(bounds.xMin, Math.min(bounds.xMax, x));
        y = Math.max(bounds.yMin, Math.min(bounds.yMax, y));
        positions.push({ x, y });
    }
    return positions;
}

// Compute tier opacity/scale/visibility based on scroll depth (0→1)
// Full zoom sequence: traits (0→0.20) → tier 0 (0.10→0.40) → tier 1 (0.25→0.60)
//   → waterfall (0.45→0.85) → hero unblurs (0.85→1.0)
function getTierStyle(tier: number, depth: number): React.CSSProperties {
    let opacity: number, scale: number;

    if (tier === 0) {
        // Tier 1 (large photos): visible at start, peels off 0.10→0.40
        const t = Math.min(1, Math.max(0, (depth - 0.10) / 0.30));
        opacity = 1 - t;
        scale = 1 + t * 0.5;
    } else if (tier === 1) {
        // Tier 2 (medium photos): enters 0.15→0.35, peaks 0.35→0.45, peels off 0.45→0.65
        const enter = Math.min(1, Math.max(0, (depth - 0.15) / 0.20));
        const exit = Math.min(1, Math.max(0, (depth - 0.45) / 0.20));
        if (depth < 0.35) {
            opacity = 0.15 + enter * 0.85;
            scale = 0.85 + enter * 0.15;
        } else if (depth < 0.45) {
            opacity = 1;
            scale = 1;
        } else {
            opacity = 1 - exit;
            scale = 1 + exit * 0.5;
        }
    } else {
        // Waterfall (hero-similar): visible from start behind other tiers, peels off 0.65→0.85
        const exit = Math.min(1, Math.max(0, (depth - 0.65) / 0.20));
        if (depth < 0.65) {
            opacity = 0.85;
            scale = 1;
        } else {
            opacity = 0.85 * (1 - exit);
            scale = 1 + exit * 0.5;
        }
    }

    return {
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        ...(opacity < 0.15 ? { visibility: 'hidden' as const } : {}),
    };
}

// Snap points for zoom-through depth
// drawer open → drawer closed → tier 1 → tier 2 → waterfall → hero
const SNAP_POINTS = [0.0, 0.10, 0.25, 0.40, 0.60, 1.0];

function findSnapTarget(current: number, velocity: number): number {
    const VELOCITY_THRESHOLD = 0.3; // px/ms threshold for directional snap
    if (Math.abs(velocity) > VELOCITY_THRESHOLD) {
        // Fast swipe: snap to next point in swipe direction
        if (velocity > 0) {
            return SNAP_POINTS.find(p => p > current + 0.02) ?? SNAP_POINTS[SNAP_POINTS.length - 1];
        } else {
            return [...SNAP_POINTS].reverse().find(p => p < current - 0.02) ?? SNAP_POINTS[0];
        }
    }
    // Low velocity: snap to nearest
    let nearest = SNAP_POINTS[0];
    let minDist = Math.abs(current - nearest);
    for (const p of SNAP_POINTS) {
        const dist = Math.abs(current - p);
        if (dist < minDist) { minDist = dist; nearest = p; }
    }
    return nearest;
}

const WaterfallAlbum: React.FC<WaterfallAlbumProps> = ({ albumImages, traitCount, onSelect, gentleReveal, isAlbumPhase, onScrollDepth, waterfallImages }) => {
    const isPartial = traitCount >= 3 && traitCount < 6;
    const visible = traitCount >= 3;
    const isMobile = useMemo(() =>
        typeof window !== 'undefined' && window.innerWidth < 768, []);

    // Scroll-depth state for zoom-through-layers effect (touch on mobile, wheel on desktop)
    const [scrollDepth, setScrollDepth] = useState(0);
    const touchRef = useRef({ startY: 0, lastY: 0, lastTime: 0, velocity: 0, isScrolling: false });
    const animRef = useRef<number>(0);
    const isScrollingRef = useRef(false);
    const snapTargetRef = useRef<number | null>(null);
    const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Animate smoothly toward a snap target
    const animateToSnap = useCallback((target: number) => {
        cancelAnimationFrame(animRef.current);
        snapTargetRef.current = target;
        const animate = () => {
            setScrollDepth(current => {
                const diff = target - current;
                if (Math.abs(diff) < 0.003) {
                    snapTargetRef.current = null;
                    setTimeout(() => { isScrollingRef.current = false; }, 50);
                    return target;
                }
                animRef.current = requestAnimationFrame(animate);
                return current + diff * 0.12;
            });
        };
        animRef.current = requestAnimationFrame(animate);
    }, []);

    // Reset scroll depth and touch state when album phase starts
    useEffect(() => {
        if (isAlbumPhase) {
            setScrollDepth(0);
            onScrollDepth?.(0);
            isScrollingRef.current = false;
            snapTargetRef.current = null;
            cancelAnimationFrame(animRef.current);
        }
    }, [isAlbumPhase, onScrollDepth]);

    // Notify parent of scroll depth changes
    useEffect(() => {
        onScrollDepth?.(scrollDepth);
    }, [scrollDepth, onScrollDepth]);

    // Cleanup on unmount
    useEffect(() => () => {
        cancelAnimationFrame(animRef.current);
        if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
    }, []);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        cancelAnimationFrame(animRef.current);
        snapTargetRef.current = null;
        isScrollingRef.current = false;
        const y = e.touches[0].clientY;
        touchRef.current = { startY: y, lastY: y, lastTime: Date.now(), velocity: 0, isScrolling: false };
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        const y = e.touches[0].clientY;
        const now = Date.now();
        const dy = touchRef.current.lastY - y; // positive = swipe up

        // Only start scroll-depth tracking after 10px threshold
        if (!touchRef.current.isScrolling) {
            if (Math.abs(touchRef.current.startY - y) < 10) return;
            touchRef.current.isScrolling = true;
            isScrollingRef.current = true;
        }

        const dt = now - touchRef.current.lastTime;
        if (dt > 0) touchRef.current.velocity = dy / dt;
        touchRef.current.lastY = y;
        touchRef.current.lastTime = now;

        const totalDistance = window.innerHeight * 2;
        setScrollDepth(d => Math.max(0, Math.min(1, d + dy / totalDistance)));
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (!touchRef.current.isScrolling) return;
        setScrollDepth(current => {
            const target = findSnapTarget(current, touchRef.current.velocity);
            animateToSnap(target);
            return current;
        });
    }, [animateToSnap]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        // Cancel any in-flight snap animation while actively wheeling
        cancelAnimationFrame(animRef.current);
        snapTargetRef.current = null;
        isScrollingRef.current = true;

        const totalDistance = window.innerHeight * 2;
        setScrollDepth(d => Math.max(0, Math.min(1, d + e.deltaY / totalDistance)));

        // Debounce: snap after 150ms of no wheel events
        if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current);
        wheelTimerRef.current = setTimeout(() => {
            setScrollDepth(current => {
                const target = findSnapTarget(current, 0);
                animateToSnap(target);
                return current;
            });
        }, 150);
    }, [animateToSnap]);

    const nodes = useMemo((): WaterfallNode[] => {
        if (albumImages.length === 0) return [];
        const maxHits = Math.max(1, ...albumImages.map((a: AlbumImage) => a.tagHits));
        const limit = isPartial ? 8 : albumImages.length;

        return albumImages.slice(0, limit).map((item: AlbumImage) => {
            const relevance = item.tagHits / maxHits;
            const size = item.tagHits <= 1
                ? 40 + seededRandom(item.image.id + 'sz') * 8
                : 60 + relevance * 120;
            const driftDuration = 6 + seededRandom(item.image.id + 'wd') * 8;
            const driftDelay = seededRandom(item.image.id + 'wl') * 4;

            return { image: item.image, tagHits: item.tagHits, relevance, size, driftDuration, driftDelay };
        });
    }, [albumImages, isPartial]);

    // Tiered layout for album phase
    const tiers = useMemo(() => {
        if (!isAlbumPhase || nodes.length === 0) return null;
        const maxHits = Math.max(1, ...nodes.map(n => n.tagHits));
        const tier1: WaterfallNode[] = [];
        const tier2: WaterfallNode[] = [];

        for (const node of nodes) {
            if (node.tagHits === maxHits && maxHits > 1) tier1.push(node);
            else if (node.tagHits >= maxHits * 0.5 && maxHits > 1) tier2.push(node);
            // Lower-relevance items are handled by SpriteBackground behind the album
        }

        return {
            tier1: tier1.slice(0, 5),
            tier2: tier2.slice(0, 8),
        };
    }, [isAlbumPhase, nodes]);

    // Pre-compute scattered positions for each tier
    // All tiers share viewport bounds — zoom-through effect means only one is visible at a time
    const tierPositions = useMemo(() => {
        if (!tiers) return null;
        const wfCount = waterfallImages?.length ?? 0;
        return {
            tier1: scatterPositions(tiers.tier1.length, 't1', { xMin: 10, xMax: 70, yMin: 10, yMax: 75 }),
            tier2: organicScatter(tiers.tier2.length, 't2', { xMin: 2, xMax: 90, yMin: 5, yMax: 88 }, 10),
            waterfall: organicScatter(wfCount, 'wf', { xMin: 2, xMax: 92, yMin: 3, yMax: 92 }, 6),
        };
    }, [tiers, waterfallImages]);

    if (!visible) return null;

    const handleClick = (img: ImageNode, e: React.MouseEvent) => {
        if (isScrollingRef.current) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        onSelect(img, rect);
    };

    // Album phase: photos scattered on a surface with zoom-through interaction
    if (isAlbumPhase && tiers && tierPositions) {
        return (
            <div className="fixed inset-0 pointer-events-auto"
                style={{ zIndex: 15, ...(isMobile ? { touchAction: 'none' } : {}) }}
                onClick={(e) => {
                    if (scrollDepth <= 0.85 || isScrollingRef.current) return;
                    const el = e.currentTarget;
                    el.style.pointerEvents = 'none';
                    const beneath = document.elementFromPoint(e.clientX, e.clientY);
                    el.style.pointerEvents = '';
                    if (beneath && beneath !== el) {
                        (beneath as HTMLElement).click();
                    }
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onWheel={handleWheel}>

                {/* Waterfall: hero-similar photos — revealed as tier 2 peels away */}
                {waterfallImages && waterfallImages.length > 0 && (
                    <div className="absolute inset-0"
                        style={getTierStyle(2, scrollDepth)}>
                        {waterfallImages.map((wf, index) => {
                            const pos = tierPositions.waterfall[index];
                            if (!pos) return null;
                            const rotate = (seededRandom(wf.image.id + 'wfr') - 0.5) * 10;
                            const cardWidth = isMobile
                                ? 60 + seededRandom(wf.image.id + 'wfw') * 30
                                : 80 + seededRandom(wf.image.id + 'wfw') * 40;
                            const driftDur = 10 + seededRandom(wf.image.id + 'wfd') * 8;
                            const driftDel = seededRandom(wf.image.id + 'wfl') * 5;
                            return (
                                <div key={wf.image.id}
                                    className="absolute"
                                    style={{
                                        left: `${pos.x}%`,
                                        top: `${pos.y}%`,
                                        animation: `drift ${driftDur}s ease-in-out ${driftDel}s infinite`,
                                    }}>
                                    <div className="pointer-events-auto cursor-pointer"
                                        style={{
                                            width: cardWidth,
                                            zIndex: 1,
                                            '--card-rotate': `${rotate}deg`,
                                            animation: `card-scatter 700ms cubic-bezier(0.22,1,0.36,1) ${200 + index * 60}ms both`,
                                        } as React.CSSProperties}
                                        onClick={(e) => handleClick(wf.image, e)}>
                                        <div className="bg-white p-1 rounded shadow-sm"
                                            style={{ boxShadow: '0 1px 6px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)' }}>
                                            <img src={getThumbnailUrl(wf.image.id)} alt=""
                                                className="w-full rounded-sm"
                                                draggable={false} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Tier 2: Medium photo prints — with drift */}
                <div className="absolute inset-0"
                    style={getTierStyle(1, scrollDepth)}>
                    {tiers.tier2.map((node, index) => {
                        const pos = tierPositions.tier2[index];
                        const rotate = (seededRandom(node.image.id + 't2r') - 0.5) * 8;
                        const cardWidth = isMobile
                            ? 100 + seededRandom(node.image.id + 't2w') * 24
                            : 140 + seededRandom(node.image.id + 't2w') * 40;
                        const driftDur = 12 + seededRandom(node.image.id + 't2d') * 6;
                        const driftDel = seededRandom(node.image.id + 't2l') * 5;
                        return (
                            <div key={node.image.id}
                                className="absolute"
                                style={{
                                    left: `${pos.x}%`,
                                    top: `${pos.y}%`,
                                    animation: `drift ${driftDur}s ease-in-out ${driftDel}s infinite`,
                                }}>
                                <div className="pointer-events-auto cursor-pointer"
                                    style={{
                                        width: cardWidth,
                                        zIndex: 2,
                                        '--card-rotate': `${rotate}deg`,
                                        animation: `card-scatter 700ms cubic-bezier(0.22,1,0.36,1) ${400 + index * 80}ms both`,
                                    } as React.CSSProperties}
                                    onClick={(e) => handleClick(node.image, e)}>
                                    <div className="bg-white p-1.5 rounded shadow-md"
                                        style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)' }}>
                                        <img src={getThumbnailUrl(node.image.id)} alt=""
                                            className="w-full rounded-sm"
                                            draggable={false} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Tier 1: Large photo prints — most prominent, peels off first, with drift */}
                <div className="absolute inset-0"
                    style={getTierStyle(0, scrollDepth)}>
                    {tiers.tier1.map((node, index) => {
                        const pos = tierPositions.tier1[index];
                        const rotate = (seededRandom(node.image.id + 't1r') - 0.5) * 6;
                        const cardWidth = isMobile
                            ? 160 + seededRandom(node.image.id + 't1w') * 30
                            : 260 + seededRandom(node.image.id + 't1w') * 60;
                        const driftDur = 14 + seededRandom(node.image.id + 't1d') * 4;
                        const driftDel = seededRandom(node.image.id + 't1l') * 5;
                        return (
                            <div key={node.image.id}
                                className="absolute"
                                style={{
                                    left: `${pos.x}%`,
                                    top: `${pos.y}%`,
                                    animation: `drift ${driftDur}s ease-in-out ${driftDel}s infinite`,
                                }}>
                                <div className="pointer-events-auto cursor-pointer"
                                    style={{
                                        width: cardWidth,
                                        zIndex: 3,
                                        '--card-rotate': `${rotate}deg`,
                                        animation: `card-scatter 800ms cubic-bezier(0.22,1,0.36,1) ${800 + index * 100}ms both`,
                                    } as React.CSSProperties}
                                    onClick={(e) => handleClick(node.image, e)}>
                                    <div className="bg-white p-2 rounded-md"
                                        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.08)' }}>
                                        <img src={getPreviewUrl(node.image.id)} alt=""
                                            className="w-full rounded-sm"
                                            draggable={false} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Depth indicator — dots on right edge, one per snap point */}
                <div className="fixed right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 pointer-events-none"
                    style={{ zIndex: 20 }}>
                    {SNAP_POINTS.map((snap, i) => {
                        const next = SNAP_POINTS[i + 1] ?? 1.1;
                        const mid = (snap + next) / 2;
                        const prev = SNAP_POINTS[i - 1] ?? -0.1;
                        const prevMid = (prev + snap) / 2;
                        const active = scrollDepth >= prevMid && scrollDepth < mid;
                        return (
                            <div key={i} className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                                style={{
                                    backgroundColor: active ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.12)',
                                    transform: active ? 'scale(1.3)' : 'scale(1)',
                                }} />
                        );
                    })}
                </div>
            </div>
        );
    }

    // Default: sprite-only inline album (traits 3-5)
    return (
        <div className="px-6 pb-8 max-w-2xl mx-auto"
            style={gentleReveal ? undefined : { animation: 'album-reveal 600ms ease-out forwards' }}>
            <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] tracking-[0.2em] uppercase text-zinc-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {isPartial ? 'Album preview' : 'Your album'}
                </span>
                <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {albumImages.length} images{isPartial ? ` · select ${6 - traitCount} more for full album` : ''}
                </span>
            </div>

            <div className="flex flex-wrap items-end gap-3">
                {nodes.map((node: WaterfallNode, index: number) => {
                    const xJitter = (seededRandom(node.image.id + 'xj') - 0.5) * 8;

                    return (
                        <div key={node.image.id}
                            className="cursor-pointer transition-all duration-500 flex-shrink-0"
                            style={{
                                width: node.size,
                                marginLeft: xJitter,
                                animation: gentleReveal
                                    ? `gentle-unveil 800ms cubic-bezier(0.22,1,0.36,1) ${index * 80}ms both`
                                    : `drift ${node.driftDuration}s ease-in-out ${node.driftDelay}s infinite`,
                            }}
                            onClick={(e) => handleClick(node.image, e)}>
                            <div className="flex items-center justify-center" style={{ height: node.size }}>
                                <MiniSprite image={node.image} size={node.size * 0.9} convergence={node.relevance} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default WaterfallAlbum;
