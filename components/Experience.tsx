
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { ImageNode, Tag, TagType, SimulationNodeDatum } from '../types';
import { X, Network, Hash, Palette } from 'lucide-react';

interface ExperienceProps {
    images: ImageNode[];
    tags: Tag[];
}

// --- Types ---

type AnchorMode = 'NONE' | 'IMAGE' | 'TAG' | 'COLOR';

interface AnchorState {
    mode: AnchorMode;
    id: string; // UUID, TagID, or Hex Color
    meta?: any; // Tag object, Color string, etc.
}

interface SimNode extends SimulationNodeDatum {
    id: string;
    original: ImageNode;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    // 2.5D Properties
    currentScale: number;
    targetScale: number;
    currentOpacity: number;
    targetOpacity: number;
    // Galaxy Target (for Tag/Color modes)
    targetX?: number;
    targetY?: number;
    // Calculated Relationship Score (0-100+)
    relevanceScore: number; 
}

// --- Utilities ---

const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

const getColorDistSq = (hex1: string, hex2: string) => {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    return (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2;
};

// Calculates the closest distance between any color in Palette A and Palette B
// Lower is better match.
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

// --- Sub-Component: Chromatic Atmosphere ---
const ChromaticAtmosphere: React.FC<{ colors: string[] }> = ({ colors }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;

        const defaultPastels = ['#bae6fd', '#fbcfe8', '#fde68a', '#bbf7d0', '#c7d2fe', '#e9d5ff']; 
        const basePalette = colors.length > 0 ? colors : defaultPastels;
        
        let expandedPalette = [...basePalette];
        while(expandedPalette.length < 18) {
            expandedPalette = [...expandedPalette, ...basePalette];
        }
        
        const maxFlares = 20;
        const flares = expandedPalette.slice(0, maxFlares).map((color, i) => ({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: Math.random() > 0.4 
                ? Math.min(width, height) * 0.5 + Math.random() * Math.min(width, height) * 0.4 
                : Math.min(width, height) * 0.15 + Math.random() * Math.min(width, height) * 0.25, 
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.6,
            color: color,
            alpha: 0,
            targetAlpha: 0.2 + (Math.random() * 0.25), 
            phase: Math.random() * Math.PI * 2
        }));

        const render = (time: number) => {
            ctx.clearRect(0, 0, width, height);
            ctx.globalCompositeOperation = 'multiply';

            flares.forEach(flare => {
                flare.x += flare.vx;
                flare.y += flare.vy;

                if(flare.x < -flare.radius) flare.vx = Math.abs(flare.vx);
                if(flare.x > width + flare.radius) flare.vx = -Math.abs(flare.vx);
                if(flare.y < -flare.radius) flare.vy = Math.abs(flare.vy);
                if(flare.y > height + flare.radius) flare.vy = -Math.abs(flare.vy);

                const pulse = Math.sin((time * 0.0008) + flare.phase); 
                const currentAlpha = flare.targetAlpha * (0.8 + 0.3 * pulse);

                const gradient = ctx.createRadialGradient(flare.x, flare.y, 0, flare.x, flare.y, flare.radius);
                const rgb = hexToRgb(flare.color);
                
                gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${currentAlpha})`);
                gradient.addColorStop(0.25, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${currentAlpha * 0.8})`);
                gradient.addColorStop(0.6, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${currentAlpha * 0.3})`);
                gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);

                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(flare.x, flare.y, flare.radius, 0, Math.PI * 2);
                ctx.fill();
            });

            animationFrameId = requestAnimationFrame(render);
        };

        const handleResize = () => {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
        };

        window.addEventListener('resize', handleResize);
        render(0);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, [colors]);

    return (
        <canvas 
            ref={canvasRef} 
            className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-1000 mix-blend-multiply opacity-100"
        />
    );
};


const Experience: React.FC<ExperienceProps> = ({ images, tags }) => {
    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const hoveredNodeIdRef = useRef<string | null>(null);
    const simRef = useRef<d3.Simulation<SimNode, undefined> | null>(null);
    
    // State
    const [anchor, setAnchor] = useState<AnchorState>({ mode: 'NONE', id: '' });
    const [simNodes, setSimNodes] = useState<SimNode[]>([]);

    const getTagById = useCallback((id: string) => tags.find(t => t.id === id), [tags]);

    // -------------------------------------------------------------------------
    // 1. SCORING & RELATIONSHIP ENGINE
    // -------------------------------------------------------------------------

    // This effect runs whenever the Anchor changes to re-calculate "Relevance Scores"
    // for every node in the universe relative to the anchor.
    useEffect(() => {
        setSimNodes(prevNodes => {
            const updated = prevNodes.map(node => {
                let score = 0;

                // A. IMAGE ANCHOR MODE SCORING
                if (anchor.mode === 'IMAGE') {
                    if (node.id === anchor.id) return { ...node, relevanceScore: 1000 }; // The King

                    const anchorImg = images.find(i => i.id === anchor.id);
                    if (anchorImg) {
                        // 1. Tag Intersection (Weighted)
                        const sharedTags = node.original.tagIds.filter(t => anchorImg.tagIds.includes(t));
                        sharedTags.forEach(tid => {
                            const t = getTagById(tid);
                            if (t) {
                                if (t.type === TagType.QUALITATIVE) score += 20;
                                else if (t.type === TagType.CATEGORICAL) score += 15;
                                else if (t.type === TagType.TECHNICAL) score += 5;
                                else score += 2;
                            }
                        });

                        // 2. Hardware Similarity (Camera/Lens)
                        // If same camera: +10. If same Lens: +15.
                        if (node.original.cameraModel === anchorImg.cameraModel && node.original.cameraModel !== 'Unknown Camera') score += 10;
                        if (node.original.lensModel === anchorImg.lensModel && node.original.lensModel !== 'Unknown Lens') score += 15;

                        // 3. Temporal Similarity (Shoot Day)
                        if (node.original.shootDayClusterId === anchorImg.shootDayClusterId) score += 30;

                        // 4. Chromatic Similarity (Palette)
                        const colorDist = getMinPaletteDistance(anchorImg.palette, node.original.palette);
                        // Thresholds: < 500 is very close, < 2500 is related
                        if (colorDist < 500) score += 20;
                        else if (colorDist < 2500) score += 10;
                    }
                } 
                // B. TAG/COLOR ANCHOR MODE SCORING
                else if (anchor.mode === 'TAG') {
                    if (node.original.tagIds.includes(anchor.id)) score = 100;
                }
                else if (anchor.mode === 'COLOR') {
                     // Check if any color in palette matches anchor color
                     const minD = node.original.palette.reduce((min, c) => Math.min(min, getColorDistSq(c, anchor.id)), Infinity);
                     if (minD < 1500) score = 100;
                }

                return { ...node, relevanceScore: score };
            });
            return updated;
        });
    }, [anchor, images, getTagById]);

    // Derived: Active Atmosphere Colors
    const atmosphereColors = useMemo(() => {
        if (anchor.mode === 'NONE') return [];
        
        let relatedImages: ImageNode[] = [];

        // Gather top scoring images to extract palette
        if (anchor.mode === 'IMAGE') {
            relatedImages = simNodes
                .filter(n => n.relevanceScore > 40) // Tier 1 & 2
                .sort((a,b) => b.relevanceScore - a.relevanceScore)
                .slice(0, 5)
                .map(n => n.original);
        } else {
             relatedImages = simNodes
                .filter(n => n.relevanceScore > 0)
                .slice(0, 5)
                .map(n => n.original);
        }

        const colors = new Set<string>();
        if(anchor.mode === 'COLOR') colors.add(anchor.id);
        
        relatedImages.forEach(img => {
            img.palette.slice(0, 2).forEach(c => colors.add(c));
        });

        return Array.from(colors).slice(0, 8);
    }, [anchor, simNodes]);


    // -------------------------------------------------------------------------
    // 2. INITIALIZATION
    // -------------------------------------------------------------------------

    // Initialize Simulation Nodes only on mount or image set change
    useEffect(() => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        setSimNodes(prev => {
            const existingMap = new Map(prev.map(n => [n.id, n]));
            return images.map(img => {
                const existing = existingMap.get(img.id);
                return {
                    id: img.id,
                    original: img,
                    x: existing ? existing.x : centerX + (Math.random() - 0.5) * 800, 
                    y: existing ? existing.y : centerY + (Math.random() - 0.5) * 800,
                    vx: existing?.vx || 0,
                    vy: existing?.vy || 0,
                    currentScale: existing ? existing.currentScale : 0,
                    targetScale: 0.4,
                    currentOpacity: existing ? existing.currentOpacity : 0,
                    targetOpacity: 0.8,
                    relevanceScore: 0
                };
            });
        });
    }, [images]); 

    // -------------------------------------------------------------------------
    // 3. PHYSICS & RENDER LOOP
    // -------------------------------------------------------------------------

    useEffect(() => {
        if (!containerRef.current || simNodes.length === 0) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        // --- ZOOM BEHAVIOR ---
        const zoom = d3.zoom<HTMLDivElement, unknown>()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                if (worldRef.current) {
                    worldRef.current.style.transform = `translate3d(${event.transform.x}px, ${event.transform.y}px, 0) scale(${event.transform.k})`;
                }
            });
        d3.select(containerRef.current).call(zoom).on("dblclick.zoom", null);

        // --- GALAXY LAYOUT PRE-CALC (Tag/Color Mode) ---
        if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') {
            const activeNodes = simNodes
                .filter(n => n.relevanceScore > 0)
                .sort((a, b) => a.original.captureTimestamp - b.original.captureTimestamp);

            const c = 70; 
            const goldenAngle = Math.PI * (3 - Math.sqrt(5)); 

            activeNodes.forEach((node, index) => {
                const r = c * Math.sqrt(index + 1);
                const theta = index * goldenAngle;
                node.targetX = (width / 2) + r * Math.cos(theta);
                node.targetY = (height / 2) + r * Math.sin(theta);
            });
        }

        // --- SIMULATION ---
        const simulation = d3.forceSimulation<SimNode>(simNodes)
            // 1. Charge: Variable based on relevance to prevent dense clusters from exploding
            .force("charge", d3.forceManyBody<SimNode>().strength((d) => {
                if (anchor.mode === 'IMAGE') {
                    if (d.relevanceScore > 65) return -300; // Strong repulsion for main items to prevent overlap
                    if (d.relevanceScore > 35) return -100;
                    if (d.relevanceScore > 15) return -20;
                    return 0;
                }
                if (anchor.mode !== 'NONE' && d.relevanceScore > 0) return -150;
                return -30;
            }))
            // 2. Collision: Variable radii
            .force("collide", d3.forceCollide<SimNode>().radius((d) => {
                 if (anchor.mode === 'IMAGE') {
                     if (d.id === anchor.id) return 150;
                     if (d.relevanceScore > 65) return 90;
                     if (d.relevanceScore > 35) return 60;
                     if (d.relevanceScore > 15) return 40;
                     return 0;
                 }
                 if (d.relevanceScore > 0) return 60; 
                 if (anchor.mode === 'NONE') return 45;
                 return 0; 
            }).strength(0.7));

        simRef.current = simulation;

        // --- TICK ---
        simulation.on("tick", () => {
            const cx = width / 2;
            const cy = height / 2;

            simNodes.forEach(node => {
                const isAnchor = anchor.mode === 'IMAGE' && node.id === anchor.id;

                // --- LOGIC: TARGET CALCULATION ---
                if (anchor.mode === 'NONE') {
                    // IDLE
                    node.targetScale = 0.4;
                    node.targetOpacity = 0.6;
                    // Gentle center drift
                    node.vx = (node.vx || 0) + (cx - node.x) * 0.002;
                    node.vy = (node.vy || 0) + (cy - node.y) * 0.002;
                }
                else if (anchor.mode === 'IMAGE') {
                    if (isAnchor) {
                        // Anchor: Center, Huge
                        node.vx = (node.vx || 0) + (cx - node.x) * 0.1;
                        node.vy = (node.vy || 0) + (cy - node.y) * 0.1;
                        node.targetScale = 1.3;
                        node.targetOpacity = 1;
                    } else {
                        // GRADIENT TIERS based on relevanceScore
                        if (node.relevanceScore > 65) {
                            // TIER 1: The Inner Circle (Twins)
                            node.targetScale = 0.9;
                            node.targetOpacity = 1.0;
                            // Pull tight
                            const dx = cx - node.x;
                            const dy = cy - node.y;
                            node.vx = (node.vx || 0) + dx * 0.04; 
                            node.vy = (node.vy || 0) + dy * 0.04;
                        } 
                        else if (node.relevanceScore > 35) {
                            // TIER 2: The Context (Cousins)
                            node.targetScale = 0.6;
                            node.targetOpacity = 0.85;
                            // Pull medium
                            const dx = cx - node.x;
                            const dy = cy - node.y;
                            node.vx = (node.vx || 0) + dx * 0.02;
                            node.vy = (node.vy || 0) + dy * 0.02;
                        }
                        else if (node.relevanceScore > 15) {
                            // TIER 3: The Texture (Acquaintances)
                            node.targetScale = 0.35;
                            node.targetOpacity = 0.4;
                            // Pull loose / drift
                            const dx = cx - node.x;
                            const dy = cy - node.y;
                            node.vx = (node.vx || 0) + dx * 0.008;
                            node.vy = (node.vy || 0) + dy * 0.008;
                        } 
                        else {
                            // TIER 4: The Noise (Unrelated) -> HIDE
                            node.targetScale = 0;
                            node.targetOpacity = 0;
                            // Push away hard to clear center
                            const dx = node.x - cx;
                            const dy = node.y - cy;
                            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                            node.vx = (node.vx || 0) + (dx/dist) * 1.5;
                            node.vy = (node.vy || 0) + (dy/dist) * 1.5;
                        }
                    }
                }
                else if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') {
                    if (node.relevanceScore > 0 && node.targetX && node.targetY) {
                        node.vx = (node.vx || 0) + (node.targetX - node.x) * 0.05;
                        node.vy = (node.vy || 0) + (node.targetY - node.y) * 0.05;
                        node.targetScale = 0.8;
                        node.targetOpacity = 1;
                    } else {
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                        const dx = node.x - cx;
                        const dy = node.y - cy;
                        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
                        node.vx = (node.vx || 0) + (dx/dist) * 2;
                        node.vy = (node.vy || 0) + (dy/dist) * 2;
                    }
                }

                // --- BROWNIAN MOTION ---
                // Add slight organic noise to visible nodes
                if (node.targetOpacity > 0.1) {
                    node.vx = (node.vx || 0) + (Math.random() - 0.5) * 0.15;
                    node.vy = (node.vy || 0) + (Math.random() - 0.5) * 0.15;
                }

                // --- 2.5D INTERPOLATION ---
                const lerp = 0.1;
                node.currentScale += (node.targetScale - node.currentScale) * lerp;
                node.currentOpacity += (node.targetOpacity - node.currentOpacity) * lerp;

                // --- DOM UPDATE ---
                const el = nodeRefs.current.get(node.id);
                if (el) {
                    el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0) scale(${node.currentScale})`;
                    el.style.opacity = node.currentOpacity.toString();
                    el.style.display = node.currentOpacity < 0.05 ? 'none' : 'block';

                    const isHovered = hoveredNodeIdRef.current === node.id;
                    if (isHovered) {
                         el.style.zIndex = '1000';
                    } else {
                         el.style.zIndex = Math.floor(node.currentScale * 100).toString();
                    }
                    
                    // Depth of Field Effect
                    if (node.currentScale < 0.4) {
                         el.style.filter = 'grayscale(100%) opacity(50%) blur(2px)';
                    } else if (node.currentScale < 0.7) {
                         el.style.filter = 'grayscale(20%) blur(0.5px)';
                    } else {
                         el.style.filter = 'none';
                         el.style.boxShadow = '0 10px 40px -10px rgba(0,0,0,0.2)';
                    }
                }
            });
        });

        return () => {
            simulation.stop();
        };
    }, [simNodes, anchor]); // Removed specific dependency arrays to rely on state updates

    // -------------------------------------------------------------------------
    // 4. INTERACTION
    // -------------------------------------------------------------------------

    const handleNodeClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (anchor.id === id && anchor.mode === 'IMAGE') {
            setAnchor({ mode: 'NONE', id: '' });
        } else {
            setAnchor({ mode: 'IMAGE', id });
        }
    };
    
    const handleMouseEnter = (node: SimNode) => {
        hoveredNodeIdRef.current = node.id;
        const el = nodeRefs.current.get(node.id);
        if (el) el.style.zIndex = '1000';
    };

    const handleMouseLeave = (node: SimNode) => {
        hoveredNodeIdRef.current = null;
        const el = nodeRefs.current.get(node.id);
        if (el) el.style.zIndex = Math.floor(node.currentScale * 100).toString();
    };

    const handleTagClick = (tag: Tag) => {
        setAnchor({ mode: 'TAG', id: tag.id, meta: tag });
    };

    const handleColorClick = (colorHex: string) => {
        setAnchor({ mode: 'COLOR', id: colorHex, meta: colorHex });
    };

    const resetUniverse = () => setAnchor({ mode: 'NONE', id: '' });

    // -------------------------------------------------------------------------
    // 5. RENDER
    // -------------------------------------------------------------------------

    let activeData: ImageNode | undefined;
    if (anchor.mode === 'IMAGE') activeData = images.find(i => i.id === anchor.id);

    // Filter adjacent tags/colors for the HUD
    const activeClusterNodes = simNodes.filter(n => n.relevanceScore > 35);

    return (
        <div className="relative w-full h-full bg-[#faf9f6] overflow-hidden font-mono select-none">
            
            <ChromaticAtmosphere colors={atmosphereColors} />

            <div ref={containerRef} className="absolute inset-0 cursor-move active:cursor-grabbing z-10">
                <div ref={worldRef} className="absolute inset-0 origin-top-left will-change-transform">
                    {simNodes.map(node => (
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
                                className="absolute -translate-x-1/2 -translate-y-1/2 w-48 transition-all duration-300 cursor-pointer hover:scale-105"
                            >
                                <img 
                                    src={node.original.fileUrl} 
                                    alt="" 
                                    className="w-full h-auto rounded-md shadow-md pointer-events-none ring-1 ring-black/5 bg-white"
                                    loading="lazy"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Header Overlay */}
            <div className="absolute top-6 left-6 pointer-events-none z-50">
                <div className="flex items-center gap-2 text-zinc-900 mb-1">
                     <Network size={20} className="text-indigo-500" />
                     <h2 className="font-light text-2xl tracking-tight opacity-90">THE EXPERIENCE</h2>
                </div>
                <div className="text-zinc-500 text-xs max-w-xs leading-relaxed font-sans">
                    {anchor.mode === 'NONE' && "Drifting in the void. Click an image to anchor."}
                    {anchor.mode === 'IMAGE' && "Semantic & Chromatic Gravity active."}
                    {anchor.mode === 'TAG' && "Semantic Galaxy formation. Chronological spiral."}
                    {anchor.mode === 'COLOR' && "Chromatic Cluster formation. Palette extraction."}
                </div>
            </div>

            {/* RESET BUTTON */}
            {anchor.mode !== 'NONE' && (
                <button 
                    onClick={resetUniverse}
                    className="absolute top-6 right-6 bg-white text-zinc-600 hover:text-zinc-900 px-4 py-2 rounded-full text-xs font-medium border border-zinc-200 hover:border-zinc-400 transition-all z-50 shadow-sm hover:shadow-md"
                >
                    RESET UNIVERSE
                </button>
            )}

            {/* --- MEMORY ANCHOR MODALS --- */}

            {anchor.mode === 'IMAGE' && activeData && (
                <div className="absolute bottom-6 right-6 w-64 bg-white/90 backdrop-blur-md border border-zinc-200 p-4 rounded-lg shadow-xl z-50 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300">
                    <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
                        <h3 className="text-xs font-bold text-teal-600 uppercase tracking-widest">Image Signal</h3>
                        <button onClick={resetUniverse} className="text-zinc-400 hover:text-zinc-700"><X size={14} /></button>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-zinc-500">
                        <span>{new Date(activeData.captureTimestamp).toLocaleDateString()}</span>
                        <span className="font-mono text-zinc-400">{activeData.cameraModel}</span>
                    </div>
                    
                    {/* Visual Cluster Stats */}
                    <div className="flex gap-2 text-[9px] text-zinc-400 font-medium">
                        <span className="text-indigo-500">{activeClusterNodes.length} Linked Nodes</span>
                    </div>

                    {/* Palette Navigation */}
                    {activeData.palette && activeData.palette.length > 0 && (
                        <div className="space-y-1">
                            <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Chromatic Threads</span>
                            <div className="flex gap-1 h-6">
                                {activeData.palette.map((color, i) => (
                                    <button
                                        key={i} 
                                        onClick={() => handleColorClick(color)}
                                        style={{ backgroundColor: color }} 
                                        className="flex-1 rounded-sm border border-black/5 hover:scale-105 hover:border-black/20 transition-all cursor-pointer shadow-sm" 
                                        title={`Switch to ${color}`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tag Navigation */}
                    {activeData.tagIds.length > 0 && (
                        <div className="space-y-1 pt-1">
                            <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Semantic Threads</span>
                            <div className="flex flex-wrap gap-1.5">
                                {activeData.tagIds.map(tid => {
                                    const t = getTagById(tid);
                                    if(!t) return null;
                                    return (
                                        <button 
                                            key={tid} 
                                            onClick={() => handleTagClick(t)}
                                            className="px-2 py-0.5 bg-zinc-50 border border-zinc-200 hover:border-teal-500 hover:text-teal-600 rounded-sm text-[10px] text-zinc-600 transition-colors cursor-pointer truncate max-w-[120px]"
                                        >
                                            {t.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {/* Tag/Color Modals logic remains similar, simplified for brevity in this large update */}
            {(anchor.mode === 'TAG' || anchor.mode === 'COLOR') && (
                 <div className="absolute bottom-6 right-6 w-64 bg-white/90 backdrop-blur-md border border-zinc-200 p-4 rounded-lg shadow-xl z-50 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300">
                    <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
                        <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-widest">{anchor.mode} SIGNAL</h3>
                        <button onClick={resetUniverse} className="text-zinc-400 hover:text-zinc-700"><X size={14} /></button>
                    </div>
                     <div className="flex items-center gap-3">
                         {anchor.mode === 'TAG' ? <Hash size={16} className="text-indigo-500" /> : <div className="w-4 h-4 rounded bg-current" style={{color: anchor.id}} />}
                        <div>
                            <div className="text-sm font-medium text-zinc-800 truncate max-w-[120px]">{anchor.meta?.label || anchor.id}</div>
                            <div className="text-[10px] text-zinc-500">{activeClusterNodes.length} Linked Nodes</div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Experience;
