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
    const [gentleReveal, setGentleReveal] = useState(false);
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

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

    // --- Event handlers ---

    const handleSelectFromIdle = useCallback((image: ImageNode, rect: DOMRect) => {
        const label = new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        setTrail((t: TrailPoint[]) => [...t, { id: image.id, palette: image.palette, label, timestamp: image.captureTimestamp }]);
        setAnchorId(image.id);
        setSelectedTraits(new Set());
        setHeroBlur(0);
        setGentleReveal(false);
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
        setGentleReveal(false);
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

            // Trigger album phase when going from 5→6 traits
            if (prev.size === 5 && next.size === 6) {
                setGentleReveal(true);
                setTimeout(() => setGentleReveal(false), 2000);
                // Scroll to top and enter album phase
                if (scrollRef.current) {
                    scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                }
                setTimeout(() => setFlowPhase('album'), 500);
                return next;
            }
            // Deselecting from album phase returns to exploring
            if (prev.size === 6 && next.size === 5) {
                setGentleReveal(false);
                setFlowPhase('exploring');
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
        setGentleReveal(false);
        setFlowPhase('idle');
    }, []);

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

            {/* TRAITS — scrollable layer above hero */}
            {(flowPhase === 'blooming' || flowPhase === 'hero' || flowPhase === 'exploring' || flowPhase === 'album') && anchor && (
                <div ref={scrollRef} className="fixed inset-0 pt-12 z-20 overflow-y-auto">
                    {/* Spacer: first screen is transparent, showing hero behind */}
                    <div style={{ minHeight: '100vh', pointerEvents: 'none' }} />

                    {/* Trait section scrolls up over the hero */}
                    <div id="trait-section" style={{
                        position: 'relative',
                        minHeight: selectedTraits.size >= 6 ? undefined : '60vh',
                    }}>
                        <TraitSelector image={anchor} scored={scored} tagMap={tagMap} tags={tags}
                            selectedTraits={selectedTraits} onToggleTrait={handleToggleTrait}
                            albumImages={albumPool} />
                    </div>
                </div>
            )}

            {/* Sprite background — fixed layer, appears at 3+ traits behind trait selector */}
            {(flowPhase === 'exploring' || flowPhase === 'album') && anchor && (
                <SpriteBackground images={albumPool.slice(0, 20).map(a => a.image)}
                    count={selectedTraits.size < 3 ? 0 : Math.min(20, 4 + (selectedTraits.size - 2) * 6)} />
            )}

            {/* Album phase: tiered album + compact trait bar */}
            {flowPhase === 'album' && anchor && (
                <>
                    <WaterfallAlbum albumImages={albumPool} traitCount={selectedTraits.size}
                        onSelect={handleAlbumSelect} isAlbumPhase />
                    <div className="fixed top-12 left-0 right-0 z-50 pointer-events-auto">
                        <TraitSelector image={anchor} scored={scored} tagMap={tagMap} tags={tags}
                            selectedTraits={selectedTraits} onToggleTrait={handleToggleTrait}
                            albumImages={albumPool} />
                    </div>
                </>
            )}
        </div>
    );
};

export default NavigationPrototype;
