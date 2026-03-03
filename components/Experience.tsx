import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { ImageNode, Tag, ExperienceNode, ViewMode, ExperienceMode, AnchorState, ExperienceContext, NeighborhoodSummary, ZoneName } from '../types';
import { buildNeighborhoodSummary } from '../services/dataService';

// Import visual components
import { EsotericSprite, LoadingOverlay, RoughContainer, ScribbleConnector } from './VisualElements';

// Import extracted components
import FieldGuideOverlay from './FieldGuideOverlay';
import Gallery from './Gallery';
import SatelliteLayer from './SatelliteLayer';
import HistoryTimeline from './HistoryTimeline';
import DetailView from './DetailView';

// Import hooks
import { useRelevanceScoring } from '../hooks/useRelevanceScoring';
import { usePhysicsSimulation } from '../hooks/usePhysicsSimulation';

interface ExperienceProps {
    images: ImageNode[];
    tags: Tag[];
    anchor: AnchorState;
    history: AnchorState[];
    experienceMode: ExperienceMode;
    onAnchorChange: (anchor: AnchorState) => void;
    onContextUpdate: (ctx: ExperienceContext) => void;
    onViewChange: (mode: ViewMode) => void;
    onExperienceModeChange: (mode: ExperienceMode) => void;
    nsfwFilterActive: boolean;
    loadingProgress?: { current: number, total: number } | null;
    isAIAnalyzing?: boolean;
    analysisProgress?: number;
}

// --- MAIN COMPONENT ---
const Experience: React.FC<ExperienceProps> = ({
    images,
    tags,
    anchor,
    history,
    experienceMode,
    onAnchorChange,
    onContextUpdate: _onContextUpdate,
    onViewChange,
    onExperienceModeChange: _onExperienceModeChange,
    nsfwFilterActive,
    loadingProgress,
    isAIAnalyzing,
    analysisProgress
}) => {
    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const hoveredNodeIdRef = useRef<string | null>(null);

    // State
    const [simNodes, setSimNodes] = useState<ExperienceNode[]>([]);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [galleryState, setGalleryState] = useState<{ isOpen: boolean, startIndex: number }>({ isOpen: false, startIndex: 0 });
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [windowDimensions, setWindowDimensions] = useState({ width: typeof window !== 'undefined' ? window.innerWidth : 0, height: typeof window !== 'undefined' ? window.innerHeight : 0 });

    const nsfwTagId = useMemo(() => tags.find(t => t.label.trim().toLowerCase() === 'nsfw')?.id, [tags]);

    // Scoring Engine
    const { activePalette } = useRelevanceScoring(simNodes, setSimNodes, anchor, images, tags, nsfwFilterActive, nsfwTagId, loadingProgress);

    // Physics Simulation
    const { zoomRef } = usePhysicsSimulation(
        containerRef, worldRef, nodeRefs, hoveredNodeIdRef,
        simNodes, anchor, activePalette, loadingProgress, windowDimensions
    );

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 1024);
            setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleTitleClick = () => {
        setIsGuideOpen(true);
    };

    // --- EFFECT: DYNAMIC THEME COLOR FOR SAFARI ---
    useEffect(() => {
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (!metaThemeColor) return;

        let color = '#faf9f6';

        if (galleryState.isOpen) {
            color = '#000000';
        } else if (isDetailOpen || experienceMode === 'HISTORY') {
            color = '#18181b';
        } else if (isGuideOpen) {
            color = '#09090b';
        }

        metaThemeColor.setAttribute('content', color);
        return () => {
            metaThemeColor.setAttribute('content', '#faf9f6');
        };
    }, [galleryState.isOpen, isDetailOpen, experienceMode, isGuideOpen]);

    // Preload original image when an image is anchored (delayed to let preview load first)
    useEffect(() => {
        if (anchor.mode !== 'IMAGE') return;
        const img = images.find(i => i.id === anchor.id);
        if (!img?.originalUrl) return;
        const timer = setTimeout(() => {
            const preloader = new Image();
            preloader.src = img.originalUrl;
        }, 1000);
        return () => clearTimeout(timer);
    }, [anchor.mode, anchor.id, images]);

    // Reset modals if anchor changes to something else
    useEffect(() => {
        if (anchor.mode !== 'IMAGE') {
            setIsDetailOpen(false);
            setGalleryState({ isOpen: false, startIndex: 0 });
        }
    }, [anchor]);

    const handleCloseDetail = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDetailOpen(false);
        if (anchor.mode === 'IMAGE' && containerRef.current && zoomRef.current) {
             d3.select(containerRef.current).transition().duration(750).ease(d3.easeCubicOut).call(zoomRef.current.transform, d3.zoomIdentity);
        }
    };

    // 2. INITIALIZATION (Grid Layout)
    useEffect(() => {
        if(loadingProgress) return;

        const width = window.innerWidth;
        const height = window.innerHeight;
        const centerX = width / 2;
        const centerY = height / 2;
        const mobile = width < 1024;

        setSimNodes((prev: ExperienceNode[]) => {
            const existingMap = new Map<string, ExperienceNode>(prev.map(n => [n.id, n]));

            const newNodes = images.map((img) => {
                const existing = existingMap.get(img.id);
                const gridSortIndex = existing?.gridSortIndex ?? Math.random();
                const startX = existing ? existing.x : centerX;
                const startY = existing ? existing.y : centerY;

                let isVisible = true;
                if (nsfwFilterActive) {
                    const allTags = [...img.tagIds, ...(img.aiTagIds || [])];
                    const isNsfw = allTags.some(tid => {
                        if (tid === nsfwTagId) return true;
                        const t = tags.find(tag => tag.id === tid);
                        return t && t.label.trim().toLowerCase() === 'nsfw';
                    });
                    if (isNsfw) isVisible = false;
                }

                return {
                    id: img.id,
                    original: img,
                    x: startX,
                    y: startY,
                    vx: existing?.vx || 0,
                    vy: existing?.vy || 0,
                    currentScale: existing ? existing.currentScale : 0,
                    targetScale: 0.4,
                    currentOpacity: existing ? existing.currentOpacity : 0,
                    targetOpacity: 0.8,
                    relevanceScore: 0,
                    isVisible,
                    orbitSpeed: 0.05 + (Math.random() * 0.1),
                    orbitOffset: Math.random() * Math.PI * 2,
                    orbitRadiusBase: 250 + (Math.random() * 100),
                    gridSortIndex
                };
            });

            if (anchor.mode === 'NONE') {
                const visibleNodes = newNodes.filter(n => n.isVisible);
                visibleNodes.sort((a, b) => (a.gridSortIndex || 0) - (b.gridSortIndex || 0));

                const CELL_W = mobile ? 90 : 120;
                const CELL_H = mobile ? 90 : 120;
                const COLS = Math.max(1, Math.floor(width / CELL_W));
                const total = visibleNodes.length;
                const gridW = (COLS - 1) * CELL_W;
                const ROWS = Math.ceil(total / COLS);
                const gridH = (ROWS - 1) * CELL_H;
                const gridStartX = centerX - gridW / 2;
                const gridStartY = centerY - gridH / 2;

                visibleNodes.forEach((node, idx) => {
                    const col = idx % COLS;
                    const row = Math.floor(idx / COLS);
                    const tx = gridStartX + col * CELL_W;
                    const ty = gridStartY + row * CELL_H;

                    node.x = tx;
                    node.y = ty;
                    node.vx = 0;
                    node.vy = 0;
                    node.currentScale = 0.85;
                    node.targetScale = 0.85;
                    node.currentOpacity = 1;
                    node.targetOpacity = 1;
                });
            }
            return newNodes;
        });
    }, [images, nsfwFilterActive, loadingProgress]);

    // 3. ZOOM RESET EFFECT
    useEffect(() => {
        if (anchor.mode === 'IMAGE' && containerRef.current && zoomRef.current) {
             d3.select(containerRef.current).transition().duration(750).ease(d3.easeCubicOut).call(zoomRef.current.transform, d3.zoomIdentity);
        }
    }, [anchor.mode, anchor.id]);

    // 5. INTERACTION
    const handleNodeClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (anchor.id === id && anchor.mode === 'IMAGE') setIsDetailOpen(true);
        else { onAnchorChange({ mode: 'IMAGE', id }); setIsDetailOpen(false); }
    };
    const handleMouseEnter = (node: ExperienceNode) => { hoveredNodeIdRef.current = node.id; const el = nodeRefs.current.get(node.id); if (el) el.style.zIndex = '2000'; };
    const handleMouseLeave = (node: ExperienceNode) => { hoveredNodeIdRef.current = null; const el = nodeRefs.current.get(node.id); if (el) { if (node.id === anchor.id) el.style.zIndex = '2000'; else el.style.zIndex = Math.floor(node.currentScale * 100).toString(); } };
    const activeNode = useMemo(() => simNodes.find(n => n.id === anchor.id), [simNodes, anchor]);

    const neighborhoodSummary = useMemo((): NeighborhoodSummary | null => {
        if (anchor.mode !== 'IMAGE') return null;
        const anchorImg = images.find(i => i.id === anchor.id);
        if (!anchorImg) return null;
        const neighbors = simNodes.filter(n => n.isVisible && n.id !== anchor.id && n.scoreBreakdown);
        if (neighbors.length === 0) return null;
        return buildNeighborhoodSummary(neighbors, anchorImg, tags);
    }, [simNodes, anchor, images, tags]);

    return (
        <div className="relative w-full h-full bg-[#faf9f6] overflow-hidden font-mono select-none">
            <svg className="absolute w-0 h-0">
                <defs>
                    <filter id="sketch-filter">
                        <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" result="noise" />
                        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" />
                    </filter>
                </defs>
            </svg>

            {/* Top-Left Navigation Control */}
            {!isDetailOpen && !galleryState.isOpen && !isGuideOpen && (
                <div className="absolute top-8 left-8 sm:left-20 lg:top-8 lg:left-8 z-[90] animate-in fade-in slide-in-from-top-4 duration-700">
                    <RoughContainer
                        title="Somatic Studio"
                        alignText="left"
                        onTitleClick={handleTitleClick}
                    />
                </div>
            )}

            {/* FIELD GUIDE OVERLAY */}
            {isGuideOpen && (
                <FieldGuideOverlay
                    onClose={() => setIsGuideOpen(false)}
                    onAdminAccess={() => {
                        setIsGuideOpen(false);
                        onViewChange('WORKBENCH');
                    }}
                />
            )}

            {loadingProgress && (loadingProgress.total === 0 || loadingProgress.current < loadingProgress.total) && (<LoadingOverlay progress={loadingProgress} images={images} tags={tags} />)}
            {isAIAnalyzing && (
                <div className="absolute bottom-0 left-0 right-0 z-[70] pointer-events-none">
                    <div className="h-1 bg-zinc-200/50">
                        <div className="h-full bg-indigo-400/60 transition-all duration-500 ease-out" style={{ width: `${analysisProgress || 0}%` }} />
                    </div>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400 font-mono tracking-wider">
                        SENSING {analysisProgress || 0}%
                    </div>
                </div>
            )}
            {anchor.mode !== 'IMAGE' && (<div className="absolute inset-0 pointer-events-none transition-all duration-1000 ease-in-out" style={{ background: anchor.mode !== 'NONE' && activePalette.length > 0 ? `radial-gradient(circle at 50% 30%, ${activePalette[0]}1A, transparent 70%), radial-gradient(circle at 85% 85%, ${activePalette[1] || activePalette[0]}15, transparent 60%), radial-gradient(circle at 15% 75%, ${activePalette[2] || activePalette[0]}10, transparent 60%)` : '#faf9f6' }} />)}
            {anchor.mode !== 'IMAGE' && (<div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0 mix-blend-multiply" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />)}
            {/* Zone gradient washes + labels (IMAGE mode only) */}
            {anchor.mode === 'IMAGE' && (
                <div className="absolute inset-0 z-[5] pointer-events-none">
                    {/* Temporal zone — top (blue) */}
                    <div className="absolute top-0 left-1/4 right-1/4 h-1/2" style={{
                        background: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.05) 0%, transparent 70%)',
                    }} />
                    {/* Thematic zone — right (purple) */}
                    <div className="absolute top-1/4 bottom-1/4 right-0 w-1/2" style={{
                        background: 'radial-gradient(ellipse at 100% 50%, rgba(139,92,246,0.05) 0%, transparent 70%)',
                    }} />
                    {/* Visual zone — bottom (amber) */}
                    <div className="absolute bottom-0 left-1/4 right-1/4 h-1/2" style={{
                        background: 'radial-gradient(ellipse at 50% 100%, rgba(245,158,11,0.05) 0%, transparent 70%)',
                    }} />
                    {/* Technical zone — left (green) */}
                    <div className="absolute top-1/4 bottom-1/4 left-0 w-1/2" style={{
                        background: 'radial-gradient(ellipse at 0% 50%, rgba(34,197,94,0.05) 0%, transparent 70%)',
                    }} />
                    {/* Zone annotations — dynamic Field Notes or static fallback */}
                    {neighborhoodSummary ? (
                        <>
                            {neighborhoodSummary.zones.map(z => {
                                const posClasses: Record<ZoneName, string> = {
                                    temporal:  'top-4 left-1/2 -translate-x-1/2 text-center',
                                    thematic:  'right-4 top-1/2 -translate-y-1/2 text-right hidden sm:flex',
                                    visual:    'bottom-4 left-1/2 -translate-x-1/2 text-center',
                                    technical: 'left-4 top-1/2 -translate-y-1/2 text-left hidden sm:flex',
                                };
                                const colorClasses: Record<ZoneName, string> = {
                                    temporal:  'text-blue-400',
                                    thematic:  'text-purple-400',
                                    visual:    'text-amber-400',
                                    technical: 'text-green-400',
                                };
                                const scribbleDir: Record<ZoneName, 'down' | 'left' | 'up' | 'right'> = {
                                    temporal:  'down',
                                    thematic:  'left',
                                    visual:    'up',
                                    technical: 'right',
                                };
                                return (
                                    <div key={z.zone} className={`absolute flex flex-col items-center gap-1 select-none animate-in fade-in duration-700 ${posClasses[z.zone]}`}>
                                        <span className={`font-hand text-sm lg:text-lg opacity-60 ${colorClasses[z.zone]}`}>{z.label}</span>
                                        <span className={`font-hand text-xs lg:text-sm opacity-40 ${colorClasses[z.zone]}`}>{z.sublabel}</span>
                                        <ScribbleConnector direction={scribbleDir[z.zone]} length="30px" />
                                    </div>
                                );
                            })}
                        </>
                    ) : (
                        <>
                            <div className="absolute top-6 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-widest text-blue-500/25 select-none">TIME</div>
                            <div className="absolute right-6 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-widest text-purple-500/25 select-none">THEME</div>
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-widest text-amber-500/25 select-none">COLOR</div>
                            <div className="absolute left-6 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-widest text-green-500/25 select-none">TECH</div>
                        </>
                    )}
                </div>
            )}

            <div ref={containerRef} className="absolute inset-0 top-0 cursor-move active:cursor-grabbing z-10 pb-0">
                <div ref={worldRef} className="absolute inset-0 origin-top-left will-change-transform">
                    {simNodes.map(node => {
                        if (!node.isVisible && node.currentOpacity <= 0.05) return null;

                        const isHero = anchor.mode === 'IMAGE' && node.id === anchor.id;
                        const isEsotericSprite = anchor.mode === 'NONE' || (anchor.mode === 'IMAGE' && !isHero);
                        let sizeClasses = 'w-48';
                        if (isEsotericSprite) {
                            if (anchor.mode === 'NONE') {
                                sizeClasses = 'w-24 h-24';
                            } else {
                                sizeClasses = 'w-24 h-24';
                            }
                        }

                        return (
                            <div key={node.id} ref={(el) => { if (el) nodeRefs.current.set(node.id, el); else nodeRefs.current.delete(node.id); }} className="absolute top-0 left-0 w-0 h-0">
                                <div onClick={(e) => handleNodeClick(node.id, e)} onMouseEnter={() => handleMouseEnter(node)} onMouseLeave={() => handleMouseLeave(node)} className={`absolute -translate-x-1/2 -translate-y-1/2 ${sizeClasses} transition-all duration-300 cursor-pointer ${isHero ? '' : 'hover:scale-105'}`}>
                                    {isEsotericSprite ? (<EsotericSprite node={node} scoreBreakdown={anchor.mode === 'IMAGE' ? node.scoreBreakdown : undefined} />) : (<img src={node.original.fileUrl} alt="" className={`w-full h-auto rounded-md pointer-events-none bg-white transition-all duration-500 ${isHero ? 'ring-4 ring-white/50' : 'ring-1 ring-black/5'}`} loading="lazy" />)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {anchor.mode === 'NONE' && experienceMode === 'EXPLORE' && images.length > 0 && !loadingProgress && (
                <div className="absolute bottom-8 right-8 sm:right-20 z-[60] animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500">
                     <RoughContainer title="Visual Index" description="Start your journey" alignText="right">
                         <div className="text-zinc-600 font-hand text-xl leading-relaxed text-right max-w-[320px]">
                             <p className="pr-4">Navigate by feeling, not folders.</p>
                             <p className="mt-2 pr-4">Each <em>Esoteric Sprite</em> is a unique visual signature. Select one to anchor the space, then drift through the archive on threads of color, concept, and time.</p>
                         </div>
                     </RoughContainer>
                </div>
            )}

            {anchor.mode === 'IMAGE' && activeNode && !isDetailOpen && experienceMode === 'EXPLORE' && (<SatelliteLayer node={activeNode.original} tags={tags} onNavigate={onAnchorChange} isMobile={isMobile} />)}
            <HistoryTimeline history={history} images={images} tags={tags} activeMode={experienceMode} nsfwFilterActive={nsfwFilterActive} nsfwTagId={nsfwTagId} currentHero={activeNode?.original} />

            {/* DETAIL VIEW OVERLAY */}
            {isDetailOpen && activeNode && experienceMode === 'EXPLORE' && (
                <DetailView
                    activeNode={activeNode}
                    images={images}
                    tags={tags}
                    history={history}
                    onAnchorChange={(newAnchor) => { onAnchorChange(newAnchor); setIsDetailOpen(false); }}
                    onClose={handleCloseDetail}
                    onOpenGallery={(startIndex) => setGalleryState({ isOpen: true, startIndex })}
                    nsfwFilterActive={nsfwFilterActive}
                    nsfwTagId={nsfwTagId}
                    neighborhoodSummary={neighborhoodSummary}
                />
            )}

            {/* FULLSCREEN GALLERY OVERLAY */}
            {galleryState.isOpen && (
                <Gallery
                    history={history}
                    images={images}
                    tags={tags}
                    startHistoryIndex={galleryState.startIndex}
                    nsfwFilterActive={nsfwFilterActive}
                    nsfwTagId={nsfwTagId}
                    onClose={(finalHistoryIndex) => {
                        setGalleryState({ isOpen: false, startIndex: 0 });

                        setTimeout(() => {
                            const detailId = `detail-history-item-${finalHistoryIndex}`;
                            const detailEl = document.getElementById(detailId);
                            if (detailEl) {
                                detailEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }

                            const timelineId = `timeline-history-item-${finalHistoryIndex}`;
                            const timelineEl = document.getElementById(timelineId);
                            if (timelineEl) {
                                timelineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }, 50);
                    }}
                />
            )}
        </div>
    );
};

export default Experience;
