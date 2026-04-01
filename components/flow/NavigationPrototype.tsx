import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ImageNode, Tag } from '../../types';
import { FlowPhase, ScoredImage, TrailPoint, AlbumImage, WaterfallImage, PersistedSession } from './flowTypes';
import { scoreRelevance, colorDist, COLOR_THRESHOLD, detectSessionArc } from './flowHelpers';
import { saveSession, getAllSessions } from '../../services/resourceService';
import ResonanceView from './ResonanceView';
import BloomOverlay from './BloomOverlay';
import HeroSection from './HeroSection';
import TraitSelector from './TraitSelector';
import WaterfallAlbum from './WaterfallAlbum';
import SpriteBackground from './SpriteBackground';
import IdleField from './IdleField';
import SessionHistory from './SessionHistory';
import './flow.css';

interface NavigationPrototypeProps {
    images: ImageNode[];
    tags: Tag[];
    onPrioritizeAssets?: (assetIds: string[]) => void;
}

const NavigationPrototype: React.FC<NavigationPrototypeProps> = ({ images, tags, onPrioritizeAssets }) => {
    const [flowPhase, setFlowPhase] = useState<FlowPhase>('idle');
    const [anchorId, setAnchorId] = useState<string | null>(null);
    const [trail, setTrail] = useState<TrailPoint[]>([]);
    const [selectedTraits, setSelectedTraits] = useState<Set<string>>(new Set());
    const [bloomSourceRect, setBloomSourceRect] = useState<DOMRect | null>(null);
    const [heroBlur, setHeroBlur] = useState(0);
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Album zoom-through depth (0→1, from WaterfallAlbum mobile touch)
    const [albumDepth, setAlbumDepth] = useState(0);

    // Trait bar transition state
    const [traitLeaving, setTraitLeaving] = useState(false);

    // Pending image for bloom transition
    const [pendingImage, setPendingImage] = useState<ImageNode | null>(null);

    // Mode: explore | history | resonance
    const [mode, setMode] = useState<'explore' | 'history' | 'resonance'>('explore');

    // Session persistence
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const currentSessionIdRef = useRef<string | null>(null);
    const [pastSessions, setPastSessions] = useState<PersistedSession[]>([]);
    const [resumeCandidate, setResumeCandidate] = useState<PersistedSession | null>(null);

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

    // Post session summary to resonance API (fire-and-forget, silent failure ok)
    const postToResonance = useCallback((trailPoints: TrailPoint[], sessionId: string) => {
        const arc = trailPoints.length >= 2 ? detectSessionArc(trailPoints) : null;
        fetch('/api/resonance/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: sessionId,
                createdAt: trailPoints[0].timestamp,
                arcPattern: arc?.pattern ?? null,
                heroCount: trailPoints.length,
                imageIds: trailPoints.map(t => t.id),
                traitSequence: trailPoints.map(t => t.traits),
            }),
        }).catch(() => {});
    }, []);

    // Auto-save session to IndexedDB on every trail mutation
    useEffect(() => {
        if (trail.length === 0) return;
        if (!currentSessionIdRef.current) {
            // crypto.randomUUID() requires a secure context (HTTPS/localhost);
            // fall back to getRandomValues which works over plain HTTP too.
            const generateId = (): string => {
                if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
                const b = new Uint8Array(16);
                crypto.getRandomValues(b);
                b[6] = (b[6] & 0x0f) | 0x40;
                b[8] = (b[8] & 0x3f) | 0x80;
                return [...b].map((v, i) => ([4,6,8,10].includes(i) ? '-' : '') + v.toString(16).padStart(2,'0')).join('');
            };
            currentSessionIdRef.current = generateId();
            setCurrentSessionId(currentSessionIdRef.current);
        }
        saveSession({
            id: currentSessionIdRef.current!,
            startedAt: trail[0].timestamp,
            lastActiveAt: Date.now(),
            trail,
            heroCount: trail.length,
        });

        // Also post summary to resonance API once we have a meaningful session
        if (trail.length >= 2) {
            postToResonance(trail, currentSessionIdRef.current!);
        }
    }, [trail, postToResonance]);

    // Load past sessions and check for resume candidate on mount
    useEffect(() => {
        const initSessions = async () => {
            const sessions = await getAllSessions();
            const last = sessions[0];
            const THIRTY_MIN = 30 * 60 * 1000;
            if (last && last.heroCount > 1 && Date.now() - last.lastActiveAt < THIRTY_MIN) {
                setResumeCandidate(last);
            }
            setPastSessions(sessions);
        };
        initSessions();
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

    // Trait drawer snap: only snaps AFTER user stops interacting.
    // Touch: scrollend fires after momentum settles. Wheel/trackpad: 500ms debounce.
    // Never fights the user mid-scroll — all snap logic waits for quiescence.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || !showScrollContainer) return;

        let animFrame = 0;
        let isSnapping = false;
        let wheelTimer: ReturnType<typeof setTimeout> | null = null;
        let wheelActive = false;

        const snapToNearest = () => {
            if (wheelActive) return; // Still receiving wheel events, don't snap yet
            const openTarget = window.innerHeight;
            const target = el.scrollTop < openTarget * 0.4 ? 0 : openTarget;
            if (Math.abs(el.scrollTop - target) < 2) return;
            isSnapping = true;
            const animate = () => {
                const diff = target - el.scrollTop;
                if (Math.abs(diff) < 1) {
                    el.scrollTop = target;
                    isSnapping = false;
                    return;
                }
                el.scrollTop += diff * 0.12;
                animFrame = requestAnimationFrame(animate);
            };
            animFrame = requestAnimationFrame(animate);
        };

        const onScrollEnd = () => {
            if (isSnapping || wheelActive) return;
            snapToNearest();
        };

        // Wheel/trackpad: mark active on every event, debounce 500ms for inertia
        const onWheel = () => {
            wheelActive = true;
            // Cancel any in-progress snap — user is still scrolling
            if (isSnapping) { isSnapping = false; cancelAnimationFrame(animFrame); }
            if (wheelTimer) clearTimeout(wheelTimer);
            wheelTimer = setTimeout(() => {
                wheelActive = false;
                if (!isSnapping) snapToNearest();
            }, 500);
        };

        const onTouchStart = () => {
            isSnapping = false;
            cancelAnimationFrame(animFrame);
            if (wheelTimer) clearTimeout(wheelTimer);
            wheelActive = false;
        };

        el.addEventListener('scrollend', onScrollEnd);
        el.addEventListener('wheel', onWheel, { passive: true });
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        return () => {
            el.removeEventListener('scrollend', onScrollEnd);
            el.removeEventListener('wheel', onWheel);
            el.removeEventListener('touchstart', onTouchStart);
            cancelAnimationFrame(animFrame);
            if (wheelTimer) clearTimeout(wheelTimer);
        };
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

    // Waterfall tier: independent pool — same session + shared tags + similar colors (loose)
    const WATERFALL_COLOR_THRESHOLD = 120; // Looser than COLOR_THRESHOLD (80)
    const waterfallPool = useMemo((): WaterfallImage[] => {
        if (!anchor) return [];
        const anchorTags = new Set([...(anchor.tagIds || []), ...(anchor.aiTagIds || [])]);
        const pool = new Map<string, WaterfallImage>();

        for (const img of images) {
            if (img.id === anchor.id) continue;
            let score = 0;

            // Same session
            if (img.shootDayClusterId === anchor.shootDayClusterId) score += 0.5;

            // Shared tags
            const imgTags = new Set([...(img.tagIds || []), ...(img.aiTagIds || [])]);
            let sharedTagCount = 0;
            for (const t of imgTags) {
                if (anchorTags.has(t)) sharedTagCount++;
            }
            if (sharedTagCount > 0) score += Math.min(sharedTagCount * 0.15, 0.5);

            // Color similarity (looser threshold)
            if (anchor.palette?.length > 0 && img.palette?.length > 0) {
                let colorMatches = 0;
                for (const heroColor of anchor.palette) {
                    const closest = Math.min(...img.palette.map((c: string) => colorDist(c, heroColor)));
                    if (closest < WATERFALL_COLOR_THRESHOLD) colorMatches++;
                }
                if (colorMatches > 0) score += colorMatches * 0.08;
            }

            if (score > 0) {
                pool.set(img.id, { image: img, score });
            }
        }
        return [...pool.values()].sort((a, b) => b.score - a.score).slice(0, 30);
    }, [anchor, images]);

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

    // Sprite background count based on trait count — start loading from first trait
    const spriteCount = useMemo(() => {
        if (selectedTraits.size === 0) return 0;
        return Math.min(20, 2 + selectedTraits.size * 3);
    }, [selectedTraits.size]);

    // --- Event handlers ---

    const handleSelectFromIdle = useCallback((image: ImageNode, rect: DOMRect) => {
        const label = new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        setTrail((t: TrailPoint[]) => [...t, {
            id: image.id, palette: image.palette, label, timestamp: image.captureTimestamp,
            traits: [], albumPoolSize: 0, albumPool: [],
            cameraModel: image.cameraModel, lensModel: image.lensModel,
        }]);
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
        setTrail((t: TrailPoint[]) => {
            const updated = [...t];
            if (updated.length > 0) {
                const last = { ...updated[updated.length - 1] };
                last.traits = [...selectedTraits];
                last.albumPoolSize = albumPool.length;
                last.albumPool = albumPool.map(a => a.image.id);
                last.continuedFromId = img.id;
                updated[updated.length - 1] = last;
            }
            return [...updated, {
                id: img.id, palette: img.palette, label, timestamp: img.captureTimestamp,
                traits: [], albumPoolSize: 0, albumPool: [],
                cameraModel: img.cameraModel, lensModel: img.lensModel,
            }];
        });
        setAnchorId(img.id);
        setSelectedTraits(new Set());
        setHeroBlur(0);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        setPendingImage(img);
        setBloomSourceRect(rect);
        setFlowPhase('blooming');
    }, [selectedTraits, albumPool]);

    const handleToggleTrait = useCallback((key: string) => {
        const currentSize = selectedTraits.size;
        const willAdd = !selectedTraits.has(key) && currentSize < 6;
        const newSize = selectedTraits.has(key) ? currentSize - 1 : (willAdd ? currentSize + 1 : currentSize);

        setSelectedTraits(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else if (next.size < 6) next.add(key);
            return next;
        });

        // 5→6: enter album phase
        if (currentSize === 5 && newSize === 6) {
            setFlowPhase('album');
        }
        // 6→5: leave album phase with exit animation
        else if (currentSize === 6 && newSize === 5) {
            setTraitLeaving(true);
            setTimeout(() => {
                setFlowPhase('exploring');
                setTraitLeaving(false);
                requestAnimationFrame(() => {
                    if (scrollRef.current) {
                        scrollRef.current.scrollTop = window.innerHeight;
                    }
                });
            }, 400);
        }
        // Any other change while not in album: stay in exploring
        else if (flowPhase !== 'album') {
            setFlowPhase('exploring');
        }
    }, [selectedTraits, flowPhase]);

    const handleClear = useCallback(() => {
        currentSessionIdRef.current = null;
        setCurrentSessionId(null);
        setTrail([]);
        setAnchorId(null);
        setSelectedTraits(new Set());
        setHeroBlur(0);
        setTraitLeaving(false);
        setFlowPhase('idle');
        setMode('explore');
    }, []);

    const handleSeedFromHistory = useCallback((image: ImageNode, rect: DOMRect) => {
        setMode('explore');
        setTrail((t: TrailPoint[]) => {
            const updated = [...t];
            if (updated.length > 0) {
                const last = { ...updated[updated.length - 1] };
                last.traits = [...selectedTraits];
                last.albumPoolSize = albumPool.length;
                last.albumPool = albumPool.map(a => a.image.id);
                updated[updated.length - 1] = last;
            }
            const label = new Date(image.captureTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return [...updated, {
                id: image.id, palette: image.palette, label, timestamp: image.captureTimestamp,
                traits: [], albumPoolSize: 0, albumPool: [],
                cameraModel: image.cameraModel, lensModel: image.lensModel,
            }];
        });
        setAnchorId(image.id);
        setSelectedTraits(new Set());
        setHeroBlur(0);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        setPendingImage(image);
        setBloomSourceRect(rect);
        setFlowPhase('blooming');
    }, [selectedTraits, albumPool]);

    const handleLoadSession = useCallback((session: PersistedSession) => {
        currentSessionIdRef.current = session.id;
        setCurrentSessionId(session.id);
        setTrail(session.trail);
        const lastHero = session.trail[session.trail.length - 1];
        setAnchorId(lastHero.id);
        setSelectedTraits(new Set());
        setHeroBlur(0);
        setFlowPhase('exploring');
        setMode('history');
        setPastSessions(prev => prev.filter(s => s.id !== session.id));
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
            <header className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                    <h1 className="text-[10px] tracking-[0.25em] uppercase text-zinc-500"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        Somatic Studio
                    </h1>
                    {trail.length > 0 && (
                        <div className="flex items-center gap-1 rounded-full px-1 py-0.5"
                            style={{ background: 'rgba(0,0,0,0.04)', fontFamily: 'JetBrains Mono, monospace' }}>
                            {(['explore', 'history', 'resonance'] as const).map(m => (
                                <button key={m} onClick={() => setMode(m)}
                                    className="px-3 py-1 rounded-full text-[10px] transition-all cursor-pointer"
                                    style={{
                                        background: mode === m ? 'rgba(0,0,0,0.08)' : 'transparent',
                                        color: mode === m ? '#18181b' : '#a1a1aa',
                                        borderBottom: mode === m ? '1.5px solid #18181b' : '1.5px solid transparent',
                                    }}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {trail.length > 0 && (
                    <button onClick={handleClear} className="text-[9px] text-zinc-400 hover:text-zinc-600 transition-colors tracking-widest uppercase cursor-pointer"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>Start over</button>
                )}
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
                    <HeroSection image={anchor}
                        blur={flowPhase === 'album' && albumDepth > 0.9
                            ? 16 * Math.max(0, 1 - (albumDepth - 0.9) / 0.1)
                            : heroBlur}
                        heroRevealed={flowPhase !== 'blooming'} />
                </div>
            )}

            {/* Sprite background — convergence rings show trait relevance (exploring phase only) */}
            {flowPhase === 'exploring' && anchor && (
                <div className="fixed inset-0" style={{ zIndex: 11 }}>
                    <SpriteBackground albumImages={albumPool} maxCount={spriteCount}
                        onSelect={handleAlbumSelect}
                        unblur={heroBlur < 2} />
                </div>
            )}

            {/* Album phase: tiered album (below trait bar, above hero) */}
            {flowPhase === 'album' && anchor && (
                <WaterfallAlbum albumImages={albumPool} traitCount={selectedTraits.size}
                    onSelect={handleAlbumSelect} isAlbumPhase
                    onScrollDepth={setAlbumDepth}
                    waterfallImages={waterfallPool} />
            )}

            {/* TRAIT SELECTOR — native-scrolling container for exploring phases.
                The scroll container itself is pointer-events:auto for native touch
                scroll with momentum. The spacer detects taps and forwards them to
                sprites/hero beneath via elementFromPoint. Desktop uses onWheel. */}
            {showScrollContainer && anchor && (
                <div ref={scrollRef} className="fixed inset-0 pt-12 z-20 overflow-y-auto">
                    {/* Spacer — hero visible area */}
                    <div style={{ minHeight: '100vh' }}
                        onClick={(e) => {
                            // Forward tap to element beneath (sprites, hero)
                            const scrollEl = scrollRef.current;
                            if (!scrollEl) return;
                            if (scrollEl.scrollTop > window.innerHeight * 0.3) {
                                scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
                            } else {
                                // Hide scroll container momentarily to find element beneath
                                scrollEl.style.pointerEvents = 'none';
                                const beneath = document.elementFromPoint(e.clientX, e.clientY);
                                scrollEl.style.pointerEvents = '';
                                if (beneath && beneath !== scrollEl) {
                                    (beneath as HTMLElement).click();
                                }
                            }
                        }} />

                    {/* Trait section scrolls up over the hero */}
                    <div id="trait-section" style={{ position: 'relative', minHeight: '60vh' }}>
                        <TraitSelector image={anchor} scored={scored} tagMap={tagMap} tags={tags}
                            selectedTraits={selectedTraits} onToggleTrait={handleToggleTrait}
                            albumImages={albumPool} />
                    </div>
                </div>
            )}

            {/* Fixed compact trait bar — album phase + exit transition overlay */}
            {showFixedTraitBar && anchor && (() => {
                // Trait bar peels off 0→0.06 so it's gone before tier 1 snap (0.08)
                const traitPeel = Math.min(1, Math.max(0, albumDepth / 0.06));
                const depthDriven = albumDepth > 0;
                return (
                    <div className="fixed top-12 left-0 right-0 z-30 pointer-events-auto"
                        style={{
                            ...(depthDriven ? {
                                opacity: 1 - traitPeel,
                                transform: `scale(${1 + traitPeel * 0.3}) translateY(${-traitPeel * 20}px)`,
                                transformOrigin: 'top center',
                                ...(traitPeel > 0.9 ? { visibility: 'hidden' as const, pointerEvents: 'none' as const } : {}),
                            } : {
                                animation: traitLeaving
                                    ? 'trait-settle-out 400ms cubic-bezier(0.22,1,0.36,1) both'
                                    : 'trait-settle-in 400ms cubic-bezier(0.22,1,0.36,1) both',
                            }),
                        }}>
                        <TraitSelector image={anchor} scored={scored} tagMap={tagMap} tags={tags}
                            selectedTraits={selectedTraits} onToggleTrait={handleToggleTrait}
                            albumImages={albumPool} />
                    </div>
                );
            })()}

            {/* Resume banner — shown on idle when a recent session is available */}
            {flowPhase === 'idle' && resumeCandidate && (
                <div className="fixed bottom-8 left-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full"
                    style={{
                        transform: 'translateX(-50%)',
                        background: 'rgba(255,255,255,0.9)',
                        border: '1px solid rgba(0,0,0,0.08)',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                        fontFamily: 'JetBrains Mono, monospace',
                        animation: 'history-fade-in 400ms ease-out forwards',
                    }}>
                    <span className="text-[9px] text-zinc-500 tracking-wide">
                        resume session from {new Date(resumeCandidate.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}?
                    </span>
                    <button onClick={() => { handleLoadSession(resumeCandidate); setResumeCandidate(null); }}
                        className="text-[9px] text-zinc-700 hover:text-zinc-900 transition-colors cursor-pointer tracking-widest uppercase">
                        resume
                    </button>
                    <button onClick={() => setResumeCandidate(null)}
                        className="text-[9px] text-zinc-400 hover:text-zinc-600 transition-colors cursor-pointer">
                        ✕
                    </button>
                </div>
            )}

            {/* Resonance overlay */}
            {mode === 'resonance' && trail.length > 0 && (
                <ResonanceView />
            )}

            {/* Session History overlay */}
            {mode === 'history' && trail.length > 0 && (
                <SessionHistory
                    trail={trail}
                    images={images}
                    onSeedLoop={handleSeedFromHistory}
                    pastSessions={pastSessions.filter(s => s.id !== currentSessionId)}
                    onLoadSession={handleLoadSession}
                />
            )}
        </div>
    );
};

export default NavigationPrototype;
