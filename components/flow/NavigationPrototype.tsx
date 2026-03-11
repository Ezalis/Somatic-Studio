import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ImageNode, Tag } from '../../types';
import { FlowPhase, ScoredImage, TrailPoint, AlbumImage } from './flowTypes';
import { scoreRelevance, colorDist, COLOR_THRESHOLD } from './flowHelpers';
import BloomOverlay from './BloomOverlay';
import HeroSection from './HeroSection';
import TraitSelector from './TraitSelector';
import WaterfallAlbum from './WaterfallAlbum';
import SpriteBackground from './SpriteBackground';
import IdleField from './IdleField';
import './flow.css';

interface NavigationPrototypeProps {
    images: ImageNode[];
    tags: Tag[];
    onExit: () => void;
    onPrioritizeAssets?: (assetIds: string[]) => void;
}

const NavigationPrototype: React.FC<NavigationPrototypeProps> = ({ images, tags, onExit, onPrioritizeAssets }) => {
    const [flowPhase, setFlowPhase] = useState<FlowPhase>('idle');
    const [anchorId, setAnchorId] = useState<string | null>(null);
    const [trail, setTrail] = useState<TrailPoint[]>([]);
    const [selectedTraits, setSelectedTraits] = useState<Set<string>>(new Set());
    const [bloomSourceRect, setBloomSourceRect] = useState<DOMRect | null>(null);
    const [heroBlur, setHeroBlur] = useState(0);
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const heroTouchY = useRef<number | null>(null);

    // Trait bar transition state
    const [traitLeaving, setTraitLeaving] = useState(false);

    // Pending image for bloom transition
    const [pendingImage, setPendingImage] = useState<ImageNode | null>(null);

    useEffect(() => {
        const update = () => {
            if (containerRef.current) {
                setCanvasSize({ w: containerRef.current.clientWidth, h: containerRef.current.clientHeight });
            }
        };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    // Scroll-driven hero blur
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            const heroHeight = window.innerHeight;
            const blur = Math.min(16, Math.max(0, (el.scrollTop / heroHeight) * 16));
            setHeroBlur(blur);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [flowPhase]);

    const tagMap = useMemo(() => {
        const map = new Map<string, string>();
        for (const t of tags) map.set(t.id, t.label);
        return map;
    }, [tags]);

    const anchor = useMemo(() => anchorId ? images.find((i: ImageNode) => i.id === anchorId) ?? null : null, [anchorId, images]);

    const scored = useMemo(() => {
        if (!anchor) return [];
        return images
            .filter((img: ImageNode) => img.id !== anchor.id)
            .map((img: ImageNode) => scoreRelevance(img, anchor))
            .sort((a: ScoredImage, b: ScoredImage) => b.score - a.score);
    }, [anchor, images]);

    // Priority-fetch tags for anchor + top neighbors when hero changes
    const lastPrioritizedId = useRef<string | null>(null);
    useEffect(() => {
        if (!anchorId || anchorId === lastPrioritizedId.current || !onPrioritizeAssets) return;
        lastPrioritizedId.current = anchorId;
        const ids = [anchorId, ...scored.slice(0, 24).map((s: ScoredImage) => s.image.id)];
        onPrioritizeAssets(ids);
    }, [anchorId, scored, onPrioritizeAssets]);

    // Album pool derived from selectedTraits
    const albumPool = useMemo((): AlbumImage[] => {
        if (!anchor || selectedTraits.size === 0) {
            return scored.slice(0, 24).map((s: ScoredImage) => ({
                image: s.image,
                tagHits: 0,
                isTemporal: s.isTemporalNeighbor,
            }));
        }

        const tagTraits = new Set<string>();
        const colorTraits = new Set<string>();
        for (const key of selectedTraits) {
            if (key.startsWith('color:')) colorTraits.add(key.slice(6));
            else if (key.startsWith('tag:')) tagTraits.add(key.slice(4));
        }

        const seen = new Map<string, AlbumImage>();
        for (const img of images) {
            if (img.id === anchor.id) continue;
            let hits = 0;
            if (tagTraits.size > 0) {
                const imgTags = new Set([...img.tagIds, ...(img.aiTagIds || [])]);
                for (const tagId of tagTraits) {
                    if (imgTags.has(tagId)) hits++;
                }
            }
            if (colorTraits.size > 0 && img.palette.length > 0) {
                for (const activeHex of colorTraits) {
                    const closest = Math.min(...img.palette.map((c: string) => colorDist(c, activeHex)));
                    if (closest < COLOR_THRESHOLD) hits++;
                }
            }
            if (hits > 0) {
                seen.set(img.id, { image: img, tagHits: hits, isTemporal: false });
            }
        }
        return [...seen.values()].sort((a, b) => b.tagHits - a.tagHits);
    }, [anchor, scored, images, selectedTraits]);

    const surfaceStyle = useMemo((): React.CSSProperties => {
        if (!anchor?.palette?.length) return { background: '#faf9f6' };
        const p = anchor.palette;
        return {
            background: [
                `radial-gradient(ellipse at 30% 40%, ${p[0]}18, transparent 60%)`,
                `radial-gradient(ellipse at 70% 70%, ${p[1] || p[0]}10, transparent 50%)`,
                '#faf9f6',
            ].join(', '),
            transition: 'background 1s ease',
        };
    }, [anchor]);

    // Sprite background count based on trait count
    const spriteCount = useMemo(() => {
        if (selectedTraits.size < 3) return 0;
        return Math.min(20, 4 + (selectedTraits.size - 2) * 6);
    }, [selectedTraits.size]);

    // --- Event handlers ---

    const handleSelectFromIdle = useCallback((image: ImageNode, rect: DOMRect) => {
        const label = new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        setTrail((t: TrailPoint[]) => [...t, { id: image.id, palette: image.palette, label, timestamp: image.captureTimestamp }]);
        setAnchorId(image.id);
        setSelectedTraits(new Set());
        setHeroBlur(0);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        setPendingImage(image);
        setBloomSourceRect(rect);
        setFlowPhase('blooming');
    }, []);

    const handleBloomComplete = useCallback(() => {
        setPendingImage(null);
        setBloomSourceRect(null);
        setFlowPhase('hero');
    }, []);

    const handleAlbumSelect = useCallback((img: ImageNode, rect: DOMRect) => {
        const label = new Date(img.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        setTrail((t: TrailPoint[]) => [...t, { id: img.id, palette: img.palette, label, timestamp: img.captureTimestamp }]);
        setAnchorId(img.id);
        setSelectedTraits(new Set());
        setHeroBlur(0);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        setPendingImage(img);
        setBloomSourceRect(rect);
        setFlowPhase('blooming');
    }, []);

    const handleToggleTrait = useCallback((key: string) => {
        setSelectedTraits(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else if (next.size < 6) next.add(key);

            // 5→6: enter album phase
            if (prev.size === 5 && next.size === 6) {
                setFlowPhase('album');
                return next;
            }

            // 6→5: leave album phase with exit animation
            if (prev.size === 6 && next.size === 5) {
                setTraitLeaving(true);
                // After exit animation, switch to exploring and restore scroll
                setTimeout(() => {
                    setFlowPhase('exploring');
                    setTraitLeaving(false);
                    requestAnimationFrame(() => {
                        if (scrollRef.current) {
                            scrollRef.current.scrollTop = window.innerHeight;
                        }
                    });
                }, 400);
                return next;
            }

            return next;
        });
        if (flowPhase !== 'album') {
            setFlowPhase('exploring');
        }
    }, [flowPhase]);

    const handleClear = useCallback(() => {
        setTrail([]);
        setAnchorId(null);
        setSelectedTraits(new Set());
        setHeroBlur(0);
        setTraitLeaving(false);
        setFlowPhase('idle');
    }, []);

    // Whether to show the scroll container (exploring phases)
    const showScrollContainer = flowPhase === 'blooming' || flowPhase === 'hero' || flowPhase === 'exploring';
    // Whether to show the fixed trait bar (album phase + exit transition)
    const showFixedTraitBar = flowPhase === 'album' || traitLeaving;

    return (
        <div ref={containerRef} className="fixed inset-0 overflow-hidden" style={surfaceStyle}>
            {/* Paper texture */}
            <div className="fixed inset-0 opacity-[0.02] pointer-events-none mix-blend-multiply z-0"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                }} />

            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                    <h1 className="text-[10px] tracking-[0.25em] uppercase text-zinc-500"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Flow State
                    </h1>
                    {trail.length > 0 && (
                        <span className="text-[9px] text-zinc-400" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                            {trail.length} visited
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {trail.length > 0 && (
                        <button onClick={handleClear} className="text-[9px] text-zinc-400 hover:text-zinc-600 transition-colors tracking-widest uppercase cursor-pointer"
                            style={{ fontFamily: 'JetBrains Mono, monospace' }}>Clear</button>
                    )}
                    <button onClick={onExit} className="text-[9px] text-zinc-400 hover:text-zinc-600 transition-colors tracking-widest uppercase cursor-pointer"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>Exit</button>
                </div>
            </header>

            {/* IDLE */}
            {flowPhase === 'idle' && canvasSize.w > 0 && (
                <IdleField images={images} onSelect={handleSelectFromIdle} canvasW={canvasSize.w} canvasH={canvasSize.h} />
            )}

            {/* BLOOM OVERLAY */}
            {flowPhase === 'blooming' && pendingImage && bloomSourceRect && (
                <BloomOverlay image={pendingImage} sourceRect={bloomSourceRect} onComplete={handleBloomComplete} />
            )}

            {/* HERO — fixed behind everything, unaffected by scroll bounce */}
            {(flowPhase === 'blooming' || flowPhase === 'hero' || flowPhase === 'exploring' || flowPhase === 'album') && anchor && (
                <div className="fixed inset-0 pt-12 z-10">
                    <HeroSection image={anchor} blur={heroBlur}
                        heroRevealed={flowPhase !== 'blooming'} />
                </div>
            )}

            {/* Sprite background — smooth pool transitions, convergence rings show trait relevance */}
            {(flowPhase === 'exploring' || flowPhase === 'album') && anchor && (
                <SpriteBackground albumImages={albumPool} maxCount={spriteCount}
                    onSelect={handleAlbumSelect}
                    unblur={flowPhase !== 'album' && heroBlur < 2} />
            )}

            {/* Album phase: tiered album (below trait bar, above hero) */}
            {flowPhase === 'album' && anchor && (
                <WaterfallAlbum albumImages={albumPool} traitCount={selectedTraits.size}
                    onSelect={handleAlbumSelect} isAlbumPhase />
            )}

            {/* Hero tap zone — sits below sprites (z-11) so sprite clicks take priority.
                If no sprite intercepts, this handles scroll-to-traits / dismiss-traits. */}
            {showScrollContainer && anchor && (
                <div className="fixed inset-0 cursor-pointer" style={{ zIndex: 10 }}
                    onClick={() => {
                        const el = scrollRef.current;
                        if (!el) return;
                        if (el.scrollTop > window.innerHeight * 0.3) {
                            el.scrollTo({ top: 0, behavior: 'smooth' });
                        } else {
                            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
                        }
                    }}
                    onWheel={(e) => {
                        if (scrollRef.current) scrollRef.current.scrollTop += e.deltaY;
                    }}
                    onTouchStart={(e) => {
                        heroTouchY.current = e.touches[0].clientY;
                    }}
                    onTouchMove={(e) => {
                        if (heroTouchY.current === null || !scrollRef.current) return;
                        const dy = heroTouchY.current - e.touches[0].clientY;
                        heroTouchY.current = e.touches[0].clientY;
                        scrollRef.current.scrollTop += dy;
                    }}
                    onTouchEnd={() => {
                        heroTouchY.current = null;
                    }} />
            )}

            {/* TRAIT SELECTOR — scroll container for exploring, fixed bar for album */}
            {showScrollContainer && anchor && (
                <div ref={scrollRef} className="fixed inset-0 pt-12 z-20 overflow-y-auto pointer-events-none">
                    {/* Spacer: pointer-events-none so sprites/images underneath get clicks */}
                    <div style={{ minHeight: '100vh' }} />

                    {/* Trait section scrolls up over the hero */}
                    <div id="trait-section" style={{ position: 'relative', minHeight: '60vh', pointerEvents: 'auto' }}>
                        <TraitSelector image={anchor} scored={scored} tagMap={tagMap} tags={tags}
                            selectedTraits={selectedTraits} onToggleTrait={handleToggleTrait}
                            albumImages={albumPool} />
                    </div>
                </div>
            )}

            {/* Fixed compact trait bar — album phase + exit transition overlay */}
            {showFixedTraitBar && anchor && (
                <div className="fixed top-12 left-0 right-0 z-30 pointer-events-auto"
                    style={{
                        animation: traitLeaving
                            ? 'trait-settle-out 400ms cubic-bezier(0.22,1,0.36,1) both'
                            : 'trait-settle-in 400ms cubic-bezier(0.22,1,0.36,1) both',
                    }}>
                    <TraitSelector image={anchor} scored={scored} tagMap={tagMap} tags={tags}
                        selectedTraits={selectedTraits} onToggleTrait={handleToggleTrait}
                        albumImages={albumPool} />
                </div>
            )}
        </div>
    );
};

export default NavigationPrototype;
