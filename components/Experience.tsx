
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { ImageNode, Tag, TagType, SimulationNodeDatum, ViewMode, ExploreViewMode, AnchorState, ExperienceContext } from '../types';
import { X, Camera, Activity, Maximize2, Calendar, Aperture, Info, Hash, Palette, Sparkles } from 'lucide-react';

interface ExperienceProps {
    images: ImageNode[];
    tags: Tag[];
    anchor: AnchorState;
    exploreViewMode: ExploreViewMode;
    onAnchorChange: (anchor: AnchorState) => void;
    onContextUpdate: (ctx: ExperienceContext) => void;
    onViewChange: (mode: ViewMode) => void;
}

// --- Procedural Sprite Component ---

const EsotericSprite: React.FC<{ node: SimNode }> = ({ node }) => {
    const palette = node.original.palette;
    const tagCount = (node.original.tagIds?.length || 0) + (node.original.aiTagIds?.length || 0);
    
    // Use the node id to generate deterministic "randomness"
    const hash = (str: string) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
        return Math.abs(h);
    };
    const seed = hash(node.id);
    
    return (
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md overflow-visible">
            <defs>
                <filter id={`glow-${node.id}`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>
            <g filter={`url(#glow-${node.id})`}>
                {/* Background Blobs */}
                {palette.slice(1).map((color, i) => {
                    const angle = (seed + i * 73) % 360;
                    const dist = 10 + (seed % 15);
                    const rx = 20 + ((seed + i) % 15);
                    const ry = 20 + ((seed * (i+1)) % 15);
                    const tx = 50 + dist * Math.cos(angle * Math.PI / 180);
                    const ty = 50 + dist * Math.sin(angle * Math.PI / 180);
                    
                    return (
                        <ellipse 
                            key={i}
                            cx={tx} cy={ty} rx={rx} ry={ry}
                            fill={color}
                            fillOpacity={0.6}
                            transform={`rotate(${(seed * (i+1)) % 360}, ${tx}, ${ty})`}
                        />
                    );
                })}
                {/* Core Nucleus */}
                <circle 
                    cx="50" cy="50" r={15 + Math.min(tagCount, 15)} 
                    fill={palette[0]} 
                    className="animate-pulse"
                    style={{ animationDuration: `${3 + (seed % 5)}s` }}
                />
            </g>
        </svg>
    );
};

// --- Types ---

interface SimNode extends SimulationNodeDatum {
    id: string;
    original: ImageNode;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    currentScale: number;
    targetScale: number;
    currentOpacity: number;
    targetOpacity: number;
    relevanceScore: number;
    isVisible: boolean;
    orbitSpeed?: number;
    orbitOffset?: number;
    orbitRadiusBase?: number;
}

// --- Utilities ---

const hexToRgbVals = (hex: string): [number, number, number] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [220, 220, 220];
}

const hexToRgb = (hex: string) => {
    const [r, g, b] = hexToRgbVals(hex);
    return { r, g, b };
}

const getColorDistSq = (hex1: string, hex2: string) => {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    return (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2;
};

const getMinPaletteDistance = (p1: string[], p2: string[]): number => {
    let min = Infinity;
    for (const c1 of p1) {
        for (const c2 of p2) {
            const d = getColorDistSq(c1, c2);
            if (d < min) min = d;
        }
    }
    return min;
};

const MONO_KEYWORDS = ['b&w', 'black and white', 'monochrome', 'grayscale', 'noir', 'silver gelatin'];

const isMonochrome = (tags: Tag[], tagIds: string[]) => {
    return tagIds.some(id => {
        const tag = tags.find(t => t.id === id);
        return tag && MONO_KEYWORDS.some(k => tag.label.toLowerCase().includes(k));
    });
};

const getDominantColorsFromNodes = (nodes: SimNode[], count: number = 5, excludeColor?: string): string[] => {
    const colorCounts: Record<string, number> = {};
    nodes.forEach(node => {
        node.original.palette.forEach(color => {
            if (excludeColor && color === excludeColor) return;
            colorCounts[color] = (colorCounts[color] || 0) + 1;
        });
    });
    return Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1]) 
        .slice(0, count)
        .map(entry => entry[0]);
};

const getRelatedTagsFromNodes = (nodes: SimNode[], tags: Tag[], count: number = 6, excludeTagId?: string): Tag[] => {
    const tagCounts: Record<string, number> = {};
    
    nodes.forEach(node => {
        // Collect BOTH User and AI tags
        const allTags = [...node.original.tagIds, ...(node.original.aiTagIds || [])];
        allTags.forEach(tId => {
            if (tId === excludeTagId) return;
            tagCounts[tId] = (tagCounts[tId] || 0) + 1;
        });
    });
    
    return Object.entries(tagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([id]) => tags.find(t => t.id === id))
        .filter((t): t is Tag => !!t);
};

// --- MAIN COMPONENT ---

const Experience: React.FC<ExperienceProps> = ({ 
    images, 
    tags, 
    anchor,
    exploreViewMode,
    onAnchorChange,
    onContextUpdate,
    onViewChange 
}) => {
    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const hoveredNodeIdRef = useRef<string | null>(null);
    const zoomRef = useRef<d3.ZoomBehavior<HTMLDivElement, unknown> | null>(null);
    
    // State
    const [simNodes, setSimNodes] = useState<SimNode[]>([]);
    
    // UI State for Modal
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);
    
    // Derived Data State (Internal for calculation, then reported up)
    const [commonTags, setCommonTags] = useState<Tag[]>([]);
    const [activePalette, setActivePalette] = useState<string[]>([]);

    const getTagById = useCallback((id: string) => tags.find(t => t.id === id), [tags]);

    // Timeline Calculation
    const { minTime, maxTime, timeRange } = useMemo(() => {
        if (images.length === 0) return { minTime: 0, maxTime: 0, timeRange: 1 };
        const timestamps = images.map(i => i.captureTimestamp);
        const min = Math.min(...timestamps);
        const max = Math.max(...timestamps);
        return { minTime: min, maxTime: max, timeRange: Math.max(max - min, 1) };
    }, [images]);

    // Reset modals if anchor changes to something else
    useEffect(() => {
        if (anchor.mode !== 'IMAGE') {
            setIsDetailOpen(false);
            setIsGalleryOpen(false);
        }
    }, [anchor]);

    // 1. SCORING & RELATIONSHIP ENGINE
    useEffect(() => {
        let newCommonTags = new Set<string>();
        let calculatedPalette: string[] = [];
        let calculatedTags: Tag[] = [];

        // --- A. Scoring Nodes ---
        const scoredNodes = simNodes.map(node => {
             let score = 0;
             
             if (anchor.mode === 'IMAGE') {
                 if (node.id === anchor.id) score = 10000; // Hero is king
                 else {
                     const anchorImg = images.find(i => i.id === anchor.id);
                     if (anchorImg) {
                         const anchorTags = [...anchorImg.tagIds, ...(anchorImg.aiTagIds || [])];
                         const targetTags = [...node.original.tagIds, ...(node.original.aiTagIds || [])];
                         
                         const anchorIsMono = isMonochrome(tags, anchorTags);
                         const targetIsMono = isMonochrome(tags, targetTags);
                         
                         const colorDist = getMinPaletteDistance(anchorImg.palette, node.original.palette);
                         const sameDate = node.original.shootDayClusterId === anchorImg.shootDayClusterId;
                         
                         // Tag Overlap Calculation
                         const sharedTags = targetTags.filter(t => anchorTags.includes(t));
                         let sharedAICount = 0;
                         
                         sharedTags.forEach(tid => {
                             const t = getTagById(tid);
                             if (t) {
                                 if (t.type === TagType.AI_GENERATED) {
                                     score += 20;
                                     sharedAICount++;
                                 }
                                 else if (t.type === TagType.QUALITATIVE) score += 25; 
                                 else if (t.type === TagType.CATEGORICAL) score += 20;
                                 else if (t.type === TagType.TECHNICAL) score += 5;
                                 else score += 2;
                             }
                         });

                         // --- STRICT COLOR & B&W LOGIC ---

                         if (anchorIsMono) {
                             if (sameDate) score += 500; 
                             if (sharedAICount >= 2) score += 100; 
                             score += 50; 
                         } 
                         else {
                             if (targetIsMono) {
                                 score += 50; 
                                 if (sameDate) score += 200;
                                 if (sharedAICount >= 2) score += 100;
                             } 
                             else {
                                 if (colorDist < 2500) score += 100; 
                                 else if (colorDist < 5000) score += 50; 
                                 else if (colorDist < 8000) score += 10; 
                                 else if (colorDist > 8000) score -= 2000; 
                                 else score -= 100; 
                             }
                         }

                         if (node.original.cameraModel === anchorImg.cameraModel && node.original.cameraModel !== 'Unknown Camera') score += 10;
                         if (node.original.lensModel === anchorImg.lensModel && node.original.lensModel !== 'Unknown Lens') score += 15;
                     }
                 }
             } else if (anchor.mode === 'TAG') {
                 const hasTag = node.original.tagIds.includes(anchor.id) || (node.original.aiTagIds && node.original.aiTagIds.includes(anchor.id));
                 if (hasTag) score = 100;
             } else if (anchor.mode === 'COLOR') {
                 const minD = node.original.palette.reduce((min, c) => Math.min(min, getColorDistSq(c, anchor.id)), Infinity);
                 if (minD < 1500) score = 100;
             }
             return { ...node, relevanceScore: score };
        });

        // --- B. Determine Visibility & Context ---
        
        const visibleSubset: SimNode[] = [];

        if (anchor.mode === 'IMAGE') {
            const neighbors = scoredNodes.filter(n => n.id !== anchor.id);
            neighbors.sort((a, b) => b.relevanceScore - a.relevanceScore);
            
            const RELEVANCE_THRESHOLD = 50; 
            const strongMatchCount = neighbors.filter(n => n.relevanceScore >= RELEVANCE_THRESHOLD).length;
            const visibleCount = Math.max(5, Math.min(18, strongMatchCount));
            const visibleNeighborIds = new Set(neighbors.slice(0, visibleCount).map(n => n.id));
            
            scoredNodes.forEach(n => {
                const isAnchor = n.id === anchor.id;
                const isNeighbor = visibleNeighborIds.has(n.id);
                const shouldBeVisible = isAnchor || (isNeighbor && n.relevanceScore > -500);
                const wasVisible = n.isVisible;

                if (shouldBeVisible) {
                    n.isVisible = true;
                    if (!wasVisible) {
                        const cx = window.innerWidth / 2;
                        const cy = window.innerHeight / 2;
                        const theta = Math.random() * Math.PI * 2;
                        const R = 600 + Math.random() * 200; 
                        n.x = cx + R * Math.cos(theta);
                        n.y = cy + R * Math.sin(theta);
                        n.vx = (cx - n.x) * 0.01; 
                        n.vy = (cy - n.y) * 0.01;
                    }
                    visibleSubset.push(n);
                } else {
                    n.isVisible = false;
                }
            });

            const anchorImg = images.find(i => i.id === anchor.id);
            calculatedPalette = anchorImg ? anchorImg.palette : [];
            calculatedTags = getRelatedTagsFromNodes(visibleSubset, tags, 6);

        } else if (anchor.mode === 'TAG') {
             scoredNodes.forEach(n => {
                 n.isVisible = n.relevanceScore > 0;
                 if (n.isVisible) visibleSubset.push(n);
             });
             calculatedTags = getRelatedTagsFromNodes(visibleSubset, tags, 5, anchor.id);
             calculatedPalette = []; 

        } else if (anchor.mode === 'COLOR') {
             scoredNodes.forEach(n => {
                 n.isVisible = n.relevanceScore > 0;
                 if (n.isVisible) visibleSubset.push(n);
             });
             const adjacent = getDominantColorsFromNodes(visibleSubset, 5, anchor.id);
             calculatedPalette = [anchor.id, ...adjacent].slice(0, 5);
             calculatedTags = []; 

        } else {
            scoredNodes.forEach(n => n.isVisible = true);
            calculatedPalette = [];
            calculatedTags = [];
        }
        
        setSimNodes(scoredNodes);
        setActivePalette(calculatedPalette);
        setCommonTags(calculatedTags);

    }, [anchor, images, getTagById]);

    // Report context changes to parent
    useEffect(() => {
        onContextUpdate({
            commonTags,
            activePalette
        });
    }, [commonTags, activePalette]);

    // 2. INITIALIZATION
    useEffect(() => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        setSimNodes((prev: SimNode[]) => {
            // Fix: Add explicit generic type to Map to avoid unknown inference
            const existingMap = new Map<string, SimNode>(prev.map(n => [n.id, n]));
            return images.map((img, idx) => {
                const existing = existingMap.get(img.id);
                const orbitSpeed = 0.05 + (Math.random() * 0.1); 
                const orbitOffset = Math.random() * Math.PI * 2; 
                const orbitRadiusBase = 250 + (Math.random() * 100); 

                const goldenAngle = Math.PI * (3 - Math.sqrt(5));
                const SPREAD_FACTOR = 45; 
                const initR = SPREAD_FACTOR * Math.sqrt(idx); 
                const initTheta = idx * goldenAngle;
                const startX = centerX + initR * Math.cos(initTheta);
                const startY = centerY + initR * Math.sin(initTheta);

                return {
                    id: img.id,
                    original: img,
                    x: existing ? existing.x : startX, 
                    y: existing ? existing.y : startY,
                    vx: existing?.vx || 0,
                    vy: existing?.vy || 0,
                    currentScale: existing ? existing.currentScale : 0,
                    targetScale: 0.4,
                    currentOpacity: existing ? existing.currentOpacity : 0,
                    targetOpacity: 0.8,
                    relevanceScore: 0,
                    isVisible: true,
                    orbitSpeed,
                    orbitOffset,
                    orbitRadiusBase
                };
            });
        });
    }, [images]); 

    // 3. PHYSICS LOOP
    useEffect(() => {
        if (!containerRef.current || simNodes.length === 0) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        const zoom = d3.zoom<HTMLDivElement, unknown>()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                if (worldRef.current) {
                    worldRef.current.style.transform = `translate3d(${event.transform.x}px, ${event.transform.y}px, 0) scale(${event.transform.k})`;
                }
            });
        
        zoomRef.current = zoom;
        d3.select(containerRef.current).call(zoom).on("dblclick.zoom", null);

        let activeNodes: SimNode[] = [];
        if (anchor.mode !== 'NONE') {
            activeNodes = simNodes
                .filter(n => n.isVisible && n.id !== anchor.id)
                .sort((a, b) => a.original.captureTimestamp - b.original.captureTimestamp);
        }

        const maxScaleByHeight = (height * 0.6) / 288;
        const heroScale = Math.min(Math.max(maxScaleByHeight, 1.2), 1.8); 
        const heroWidth = 192 * heroScale;
        const heroHeight = heroWidth * 1.5;
        const heroRadius = Math.sqrt(heroWidth ** 2 + heroHeight ** 2) / 2;

        const simulation = d3.forceSimulation<SimNode>(simNodes)
            .alphaTarget(anchor.mode === 'NONE' ? 0 : 0.05) 
            .velocityDecay(anchor.mode === 'NONE' ? 0.2 : 0.3) 
            .force("charge", d3.forceManyBody<SimNode>().strength((d) => {
                if (!d.isVisible) return 0;
                if (anchor.mode === 'NONE') return -50; 
                if (d.id === anchor.id) return -1500; 
                if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') return -30;
                return -200; 
            }))
            .force("collide", d3.forceCollide<SimNode>().radius((d) => {
                 if (!d.isVisible) return 0;
                 if (anchor.mode === 'IMAGE') {
                     if (d.id === anchor.id) return heroRadius * 0.95; 
                     return exploreViewMode === 'ESOTERIC' ? 45 : 65; 
                 }
                 if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') return 30;
                 return 55; 
            }).strength(0.8)); 

        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const HOME_SPREAD = 45; 

        simulation.on("tick", () => {
            const cx = width / 2;
            const cy = height / 2;
            const time = Date.now() / 1000;
            const lerpFactor = 0.1; 

            simNodes.forEach((node, i) => {
                const isAnchor = anchor.mode === 'IMAGE' && node.id === anchor.id;

                if (node.isVisible && !isAnchor && anchor.mode !== 'NONE' && anchor.mode !== 'TAG' && anchor.mode !== 'COLOR') {
                     const floatSpeed = 0.5;
                     const floatAmp = 0.05; 
                     node.vx = (node.vx || 0) + Math.sin(time * floatSpeed + i) * floatAmp;
                     node.vy = (node.vy || 0) + Math.cos(time * floatSpeed * 0.8 + i) * floatAmp;
                }

                if (anchor.mode === 'NONE') {
                    node.targetScale = 0.4;
                    node.targetOpacity = 0.8;
                    const r = HOME_SPREAD * Math.sqrt(i); 
                    const theta = i * goldenAngle;
                    const homeX = cx + r * Math.cos(theta);
                    const homeY = cy + r * Math.sin(theta);
                    const pull = 0.05;
                    node.vx = (node.vx || 0) + (homeX - node.x) * pull;
                    node.vy = (node.vy || 0) + (homeY - node.y) * pull;
                }
                else if (anchor.mode === 'IMAGE') {
                    if (isAnchor) {
                        const targetY = height * 0.45; 
                        const k = 0.12;
                        node.vx = (node.vx || 0) + (cx - node.x) * k; 
                        node.vy = (node.vy || 0) + (targetY - node.y) * k;
                        node.vx *= 0.8; 
                        node.vy *= 0.8;
                        node.targetScale = heroScale;
                        node.targetOpacity = 1;
                    } 
                    else if (node.isVisible) {
                        const targetY = height * 0.45;
                        const gravity = 0.005; 
                        node.vx = (node.vx || 0) + (cx - node.x) * gravity;
                        node.vy = (node.vy || 0) + (targetY - node.y) * gravity;
                        const dx = node.x - cx;
                        const dy = node.y - targetY;
                        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                        const swirlSpeed = 0.2; 
                        node.vx += (-dy / dist) * swirlSpeed;
                        node.vy += (dx / dist) * swirlSpeed;
                        
                        if (exploreViewMode === 'ESOTERIC') {
                            node.targetScale = node.relevanceScore > 40 ? 0.8 : 0.6;
                        } else {
                            node.targetScale = node.relevanceScore > 40 ? 0.6 : 0.45;
                        }
                        node.targetOpacity = 1.0; 
                    } 
                    else {
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                        const dx = node.x - cx;
                        const dy = node.y - cy;
                        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                        if (dist < 1500) {
                             node.vx = (node.vx || 0) + (dx/dist) * 5;
                             node.vy = (node.vy || 0) + (dy/dist) * 5;
                        } else {
                            node.vx = 0;
                            node.vy = 0;
                        }
                    }
                }
                else if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') {
                    if (node.isVisible) {
                        const idx = activeNodes.indexOf(node);
                        const total = activeNodes.length;
                        const COLS = Math.ceil(Math.sqrt(total));
                        const ROWS = Math.ceil(total / COLS);
                        const CELL_W = 220; 
                        const CELL_H = 220; 
                        const col = idx % COLS;
                        const row = Math.floor(idx / COLS);
                        const gridW = (COLS - 1) * CELL_W;
                        const gridH = (ROWS - 1) * CELL_H;
                        const tx = cx + (col * CELL_W) - (gridW / 2);
                        const ty = cy + (row * CELL_H) - (gridH / 2);
                        const structureStrength = 0.15;
                        node.vx = (node.vx || 0) + (tx - node.x) * structureStrength;
                        node.vy = (node.vy || 0) + (ty - node.y) * structureStrength;
                        node.targetScale = 0.85; 
                        node.targetOpacity = 1;
                    } else {
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                        const dx = node.x - cx;
                        const dy = node.y - cy;
                        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                        node.vx = (node.vx || 0) + (dx/dist) * 3;
                        node.vy = (node.vy || 0) + (dy/dist) * 3;
                    }
                }

                node.vx = (node.vx || 0) * 0.9;
                node.vy = (node.vy || 0) * 0.9;
                node.currentScale += (node.targetScale - node.currentScale) * lerpFactor;
                node.currentOpacity += (node.targetOpacity - node.currentOpacity) * lerpFactor;

                const el = nodeRefs.current.get(node.id);
                if (el) {
                    el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0) scale(${node.currentScale})`;
                    el.style.opacity = node.currentOpacity.toString();
                    el.style.display = node.currentOpacity < 0.05 ? 'none' : 'block';
                    
                    if (hoveredNodeIdRef.current === node.id || (anchor.mode === 'IMAGE' && node.id === anchor.id)) {
                         el.style.zIndex = node.id === anchor.id ? '2000' : '1000';
                         el.style.filter = 'none';
                         if (node.id === anchor.id) {
                             el.style.boxShadow = `0 20px 60px -10px ${activePalette[0] || 'rgba(0,0,0,0.3)'}`;
                         } else {
                             el.style.boxShadow = exploreViewMode === 'ESOTERIC' ? 'none' : '0 10px 30px -5px rgba(0,0,0,0.2)';
                         }
                    } else {
                         el.style.zIndex = Math.floor(node.currentScale * 100).toString();
                         el.style.filter = node.currentScale < 0.4 && exploreViewMode === 'GALLERY' ? 'grayscale(100%) blur(1px)' : 'none';
                         el.style.boxShadow = 'none';
                    }
                }
            });
        });

        return () => {
            simulation.stop();
        };
    }, [simNodes, anchor, activePalette, exploreViewMode]); 

    // 4. ZOOM RESET EFFECT
    useEffect(() => {
        if (anchor.mode === 'IMAGE' && containerRef.current && zoomRef.current) {
             d3.select(containerRef.current)
                .transition()
                .duration(750)
                .ease(d3.easeCubicOut)
                .call(zoomRef.current.transform, d3.zoomIdentity);
        }
    }, [anchor.mode, anchor.id]);

    // 5. INTERACTION
    const handleNodeClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (anchor.id === id && anchor.mode === 'IMAGE') {
            setIsDetailOpen(true);
        } else {
            onAnchorChange({ mode: 'IMAGE', id });
            setIsDetailOpen(false); 
        }
    };
    
    const handleMouseEnter = (node: SimNode) => {
        hoveredNodeIdRef.current = node.id;
        const el = nodeRefs.current.get(node.id);
        if (el) el.style.zIndex = '2000'; 
    };

    const handleMouseLeave = (node: SimNode) => {
        hoveredNodeIdRef.current = null;
        const el = nodeRefs.current.get(node.id);
        if (el) {
            if (node.id === anchor.id) el.style.zIndex = '2000';
            else el.style.zIndex = Math.floor(node.currentScale * 100).toString();
        }
    };

    const activeNode = useMemo(() => simNodes.find(n => n.id === anchor.id), [simNodes, anchor]);

    // 6. RENDER
    return (
        <div className="relative w-full h-full bg-[#faf9f6] overflow-hidden font-mono select-none">
            
            {/* Ambient Background Layer */}
            <div 
                className="absolute inset-0 pointer-events-none transition-all duration-1000 ease-in-out"
                style={{
                    background: anchor.mode !== 'NONE' && activePalette.length > 0
                        ? `radial-gradient(circle at 50% 30%, ${activePalette[0]}1A, transparent 70%), 
                           radial-gradient(circle at 85% 85%, ${activePalette[1] || activePalette[0]}15, transparent 60%),
                           radial-gradient(circle at 15% 75%, ${activePalette[2] || activePalette[0]}10, transparent 60%)`
                        : '#faf9f6'
                }}
            />

            {/* Film Grain Texture */}
            <div 
                className="absolute inset-0 opacity-[0.03] pointer-events-none z-0 mix-blend-multiply"
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                }}
            />

            {/* 3D World */}
            <div ref={containerRef} className="absolute inset-0 top-0 cursor-move active:cursor-grabbing z-10 pb-0">
                <div ref={worldRef} className="absolute inset-0 origin-top-left will-change-transform">
                    {simNodes.map(node => {
                        const isHero = anchor.mode === 'IMAGE' && node.id === anchor.id;
                        const isEsotericMode = exploreViewMode === 'ESOTERIC' && anchor.mode === 'IMAGE' && !isHero;
                        
                        return (
                            <div
                                key={node.id}
                                ref={(el) => {
                                    if (el) nodeRefs.current.set(node.id, el);
                                    else nodeRefs.current.delete(node.id);
                                }}
                                className="absolute top-0 left-0 w-0 h-0"
                                style={{ willChange: 'transform, opacity, filter' }}
                            >
                                <div 
                                    onClick={(e) => handleNodeClick(node.id, e)}
                                    onMouseEnter={() => handleMouseEnter(node)}
                                    onMouseLeave={() => handleMouseLeave(node)}
                                    className={`absolute -translate-x-1/2 -translate-y-1/2 ${isEsotericMode ? 'w-24 h-24' : 'w-48'} transition-all duration-300 cursor-pointer ${isHero ? '' : 'hover:scale-105'}`}
                                >
                                    {isEsotericMode ? (
                                        <EsotericSprite node={node} />
                                    ) : (
                                        <img 
                                            src={node.original.fileUrl} 
                                            alt="" 
                                            className={`w-full h-auto rounded-md pointer-events-none bg-white transition-all duration-500 ${isHero ? 'ring-4 ring-white/50' : 'ring-1 ring-black/5'}`}
                                            loading="lazy"
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* --- DETAILED CONTEXTUAL MODAL --- */}
            {isDetailOpen && activeNode && (
                <div 
                    className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-900/10 backdrop-blur-sm p-8 animate-in fade-in duration-300"
                    onClick={() => setIsDetailOpen(false)}
                >
                    <div 
                        className="bg-white/95 backdrop-blur-xl w-full max-w-5xl h-[80vh] rounded-2xl shadow-2xl border border-white/50 flex overflow-hidden relative animate-in zoom-in-95 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button 
                            onClick={() => setIsDetailOpen(false)}
                            className="absolute top-4 right-4 p-2 bg-white/50 hover:bg-zinc-100 rounded-full text-zinc-500 hover:text-zinc-800 transition-colors z-20"
                        >
                            <X size={20} />
                        </button>

                        {/* Left: Hero Image */}
                        <div className="w-1/2 h-full bg-zinc-50 flex items-center justify-center p-8 border-r border-zinc-100 relative group">
                            <img 
                                src={activeNode.original.fileUrl} 
                                alt="" 
                                className="w-full h-full object-contain shadow-lg rounded cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.02]"
                                onClick={() => setIsGalleryOpen(true)}
                            />
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-zinc-400 bg-white/80 px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                Click to Expand
                            </div>
                        </div>

                        {/* Right: Context */}
                        <div className="w-1/2 h-full p-10 overflow-y-auto">
                            <div className="space-y-8">
                                
                                {/* Timeline Section */}
                                <div className="mb-8">
                                    <div className="flex items-end justify-between mb-2">
                                         <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                                            <Activity size={12} />
                                            Temporal Distribution
                                        </h3>
                                        <span className="text-xs font-mono text-zinc-500 font-medium">
                                            {new Date(activeNode.original.captureTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                    </div>
                                    
                                    <div className="relative h-12 w-full flex items-center select-none group/timeline">
                                        <div className="absolute inset-x-0 h-px bg-zinc-200" />
                                        {images.map(img => {
                                            const pct = ((img.captureTimestamp - minTime) / timeRange) * 100;
                                            return (
                                                <div 
                                                    key={img.id}
                                                    className={`absolute top-1/2 -translate-y-1/2 w-px h-3 transition-all duration-300 ${img.id === activeNode.id ? 'opacity-0' : 'bg-zinc-300 opacity-40'}`}
                                                    style={{ left: `${pct}%` }}
                                                />
                                            )
                                        })}
                                        <div 
                                            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-zinc-800 rounded-full border-2 border-white shadow-md z-10 flex items-center justify-center transition-all hover:scale-110 cursor-help"
                                            style={{ left: `${((activeNode.original.captureTimestamp - minTime) / timeRange) * 100}%`, transform: 'translate(-50%, -50%)' }}
                                        >
                                             <div className="w-1.5 h-1.5 bg-white rounded-full" />
                                        </div>
                                        <div className="absolute -bottom-4 left-0 text-[9px] text-zinc-400 font-mono">
                                            {new Date(minTime).getFullYear()}
                                        </div>
                                        <div className="absolute -bottom-4 right-0 text-[9px] text-zinc-400 font-mono">
                                             {new Date(maxTime).getFullYear()}
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px w-full bg-zinc-100" />

                                {/* Tech Specs */}
                                <div>
                                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Aperture size={12} />
                                        Technical Specifications
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-zinc-50 rounded-lg p-3 border border-zinc-100">
                                            <span className="block text-[10px] text-zinc-400 uppercase mb-1">Camera</span>
                                            <span className="font-medium text-zinc-700">{activeNode.original.cameraModel}</span>
                                        </div>
                                        <div className="bg-zinc-50 rounded-lg p-3 border border-zinc-100">
                                            <span className="block text-[10px] text-zinc-400 uppercase mb-1">Lens</span>
                                            <span className="font-medium text-zinc-700">{activeNode.original.lensModel}</span>
                                        </div>
                                        <div className="bg-zinc-50 rounded-lg p-3 border border-zinc-100 flex justify-between">
                                            <div>
                                                <span className="block text-[10px] text-zinc-400 uppercase mb-1">Aperture</span>
                                                <span className="font-mono text-zinc-700">{activeNode.original.aperture}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-[10px] text-zinc-400 uppercase mb-1">ISO</span>
                                                <span className="font-mono text-zinc-700">{activeNode.original.iso}</span>
                                            </div>
                                        </div>
                                        <div className="bg-zinc-50 rounded-lg p-3 border border-zinc-100">
                                            <span className="block text-[10px] text-zinc-400 uppercase mb-1">Shutter</span>
                                            <span className="font-mono text-zinc-700">{activeNode.original.shutterSpeed}s</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="h-px w-full bg-zinc-100" />

                                {/* Tags */}
                                <div>
                                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Hash size={12} />
                                        Semantic Tags
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {[...activeNode.original.tagIds, ...(activeNode.original.aiTagIds || [])].map(tid => {
                                            const tag = tags.find(t => t.id === tid);
                                            if (!tag) return null;
                                            const isAI = tag.type === TagType.AI_GENERATED;
                                            return (
                                                <button 
                                                    key={tid} 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onAnchorChange({ mode: 'TAG', id: tag.id, meta: tag });
                                                        setIsDetailOpen(false);
                                                    }}
                                                    className={`
                                                        px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5
                                                        ${isAI 
                                                            ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 hover:border-violet-300' 
                                                            : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-200 hover:text-zinc-900'}
                                                    `}
                                                >
                                                    {isAI && <Sparkles size={10} className="opacity-70" />}
                                                    {tag.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Palette */}
                                <div>
                                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <Palette size={12} />
                                        Color Palette
                                    </h3>
                                    <div className="flex h-12 w-full rounded-lg overflow-hidden border border-zinc-200 shadow-sm">
                                        {activeNode.original.palette.map((color, i) => (
                                            <button 
                                                key={i} 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onAnchorChange({ mode: 'COLOR', id: color, meta: color });
                                                    setIsDetailOpen(false);
                                                }}
                                                className="flex-1 h-full group relative hover:opacity-90 transition-opacity" 
                                                style={{ backgroundColor: color }}
                                                title="Click to explore color"
                                            >
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 text-white text-[10px] font-mono transition-opacity">
                                                    {color}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- FULL SCREEN GALLERY --- */}
            {isGalleryOpen && activeNode && (
                <div 
                    className="fixed inset-0 z-[60] bg-black flex items-center justify-center animate-in fade-in duration-500 cursor-zoom-out"
                    onClick={() => setIsGalleryOpen(false)}
                >
                    <img 
                        src={activeNode.original.fileUrl} 
                        alt="" 
                        className="max-w-full max-h-full object-contain p-4 shadow-2xl"
                    />
                    <div className="absolute top-6 right-6 text-white/50 text-sm font-medium bg-white/10 px-4 py-2 rounded-full backdrop-blur-md">
                        Press ESC or Click to Close
                    </div>
                </div>
            )}
        </div>
    );
};

export default Experience;
