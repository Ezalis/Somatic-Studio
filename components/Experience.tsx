import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { 
    zoom as d3Zoom, 
    select as d3Select, 
    forceSimulation as d3ForceSimulation, 
    forceManyBody as d3ForceManyBody, 
    forceCollide as d3ForceCollide 
} from 'd3';
import { ImageNode, Tag, TagType, SimulationNodeDatum } from '../types';
import { X, Network, Hash, Palette, Calendar } from 'lucide-react';

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
    // Spiral Target (for Tag/Color modes)
    targetX?: number;
    targetY?: number;
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

// --- Sub-Component: Chromatic Atmosphere ---
// Generates moving lens flares based on active colors (Watercolor Style)
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

        // Default to soft pastels if no specific colors, but slightly more saturated for impact
        const defaultPastels = ['#bae6fd', '#fbcfe8', '#fde68a', '#bbf7d0', '#c7d2fe', '#e9d5ff']; 
        const basePalette = colors.length > 0 ? colors : defaultPastels;
        
        // Expand palette to ensure visual density (create ~18-20 flares regardless of input size)
        let expandedPalette = [...basePalette];
        while(expandedPalette.length < 18) {
            expandedPalette = [...expandedPalette, ...basePalette];
        }
        
        // Cap to prevent performance issues but ensure density
        const maxFlares = 20;
        const flares = expandedPalette.slice(0, maxFlares).map((color, i) => ({
            x: Math.random() * width,
            y: Math.random() * height,
            // Mixed sizes: Large atmospheric washes AND smaller intense "flares"
            radius: Math.random() > 0.4 
                ? Math.min(width, height) * 0.5 + Math.random() * Math.min(width, height) * 0.4 // Big Wash
                : Math.min(width, height) * 0.15 + Math.random() * Math.min(width, height) * 0.25, // Focused Flare
            vx: (Math.random() - 0.5) * 0.6, // Dynamic movement
            vy: (Math.random() - 0.5) * 0.6,
            color: color,
            alpha: 0,
            // Higher opacity range for impact (especially in multiply mode)
            targetAlpha: 0.2 + (Math.random() * 0.25), 
            phase: Math.random() * Math.PI * 2
        }));

        const render = (time: number) => {
            ctx.clearRect(0, 0, width, height);
            
            // Multiply for watercolor effect on white paper
            ctx.globalCompositeOperation = 'multiply';

            flares.forEach(flare => {
                // Physics
                flare.x += flare.vx;
                flare.y += flare.vy;

                // Bounce off edges gently
                if(flare.x < -flare.radius) flare.vx = Math.abs(flare.vx);
                if(flare.x > width + flare.radius) flare.vx = -Math.abs(flare.vx);
                if(flare.y < -flare.radius) flare.vy = Math.abs(flare.vy);
                if(flare.y > height + flare.radius) flare.vy = -Math.abs(flare.vy);

                // Pulse opacity
                const pulse = Math.sin((time * 0.0008) + flare.phase); // Slightly faster pulse
                const currentAlpha = flare.targetAlpha * (0.8 + 0.3 * pulse); // Deeper pulse depth

                // Draw Gradient
                const gradient = ctx.createRadialGradient(flare.x, flare.y, 0, flare.x, flare.y, flare.radius);
                
                const rgb = hexToRgb(flare.color);
                
                // Steeper gradient profile for more "lens flare" look
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
    
    // State
    const [anchor, setAnchor] = useState<AnchorState>({ mode: 'NONE', id: '' });
    const [simNodes, setSimNodes] = useState<SimNode[]>([]);

    // -------------------------------------------------------------------------
    // 1. Data Prep & Relationship Mapping
    // -------------------------------------------------------------------------

    const getTagById = useCallback((id: string) => tags.find(t => t.id === id), [tags]);

    // Calculate active set based on Anchor Mode
    const activeSet = useMemo(() => {
        const set = new Set<string>();

        if (anchor.mode === 'NONE') return set;

        if (anchor.mode === 'IMAGE') {
            const activeImg = images.find(i => i.id === anchor.id);
            if (!activeImg) return set;
            
            set.add(anchor.id); // Self
            // Add related images (sharing tags)
            activeImg.tagIds.forEach(tId => {
                images.forEach(img => {
                    if (img.tagIds.includes(tId)) set.add(img.id);
                });
            });
        }
        else if (anchor.mode === 'TAG') {
            images.forEach(img => {
                if (img.tagIds.includes(anchor.id)) set.add(img.id);
            });
        }
        else if (anchor.mode === 'COLOR') {
            // Euclidean RGB Distance Threshold (Squared)
            // 2500 is roughly a tolerance of 50 units per channel total
            const THRESHOLD = 3000; 
            images.forEach(img => {
                // Check if ANY color in the image palette is close to the anchor color
                const hasMatch = img.palette.some(c => getColorDistSq(c, anchor.id) < THRESHOLD);
                if (hasMatch) set.add(img.id);
            });
        }

        return set;
    }, [anchor, images]);

    // Derived: Adjacent Colors (for Color Mode)
    const adjacentColors = useMemo(() => {
        if (anchor.mode !== 'COLOR') return [];
        
        const counts: Record<string, number> = {};
        images.forEach(img => {
            if (activeSet.has(img.id)) {
                img.palette.forEach(c => {
                    if (c !== anchor.id) {
                        counts[c] = (counts[c] || 0) + 1;
                    }
                });
            }
        });

        // Return top 8 most frequent distinct colors (Increased from 5 for visual richness)
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([c]) => c);
    }, [anchor, activeSet, images]);

    // Derived: Adjacent Tags (for Color Mode)
    const adjacentTags = useMemo(() => {
        if (anchor.mode !== 'COLOR') return [];

        const counts: Record<string, number> = {};
        images.forEach(img => {
            if (activeSet.has(img.id)) {
                img.tagIds.forEach(tid => {
                    counts[tid] = (counts[tid] || 0) + 1;
                });
            }
        });

        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([tid]) => getTagById(tid))
            .filter((t): t is Tag => t !== undefined);
    }, [anchor, activeSet, images, getTagById]);

    // Derived: Semantic Adjacent Colors (for Tag Mode)
    const semanticAdjacentColors = useMemo(() => {
        if (anchor.mode !== 'TAG') return [];
        
        const counts: Record<string, number> = {};
        images.forEach(img => {
            if (activeSet.has(img.id)) {
                img.palette.forEach(c => {
                    counts[c] = (counts[c] || 0) + 1;
                });
            }
        });

        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8) // Increased for visual richness
            .map(([c]) => c);
    }, [anchor, activeSet, images]);

    // Derived: Semantic Adjacent Tags (for Tag Mode)
    const semanticAdjacentTags = useMemo(() => {
        if (anchor.mode !== 'TAG') return [];

        const counts: Record<string, number> = {};
        images.forEach(img => {
            if (activeSet.has(img.id)) {
                img.tagIds.forEach(tid => {
                    if (tid !== anchor.id) {
                        counts[tid] = (counts[tid] || 0) + 1;
                    }
                });
            }
        });

        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([tid]) => getTagById(tid))
            .filter((t): t is Tag => t !== undefined);
    }, [anchor, activeSet, images, getTagById]);

    // Calculate Active Atmosphere Colors
    const atmosphereColors = useMemo(() => {
        if (anchor.mode === 'NONE') return [];
        
        if (anchor.mode === 'COLOR') {
            // Use anchor + ALL adjacent colors for impact
            return [anchor.id, ...adjacentColors];
        }
        
        if (anchor.mode === 'TAG') {
            // Use semantic adjacent colors
            return semanticAdjacentColors;
        }

        if (anchor.mode === 'IMAGE') {
            const activeImg = images.find(i => i.id === anchor.id);
            // Use full palette
            return activeImg ? activeImg.palette : [];
        }

        return [];
    }, [anchor, adjacentColors, semanticAdjacentColors, images]);

    // Initialize Simulation Nodes
    useEffect(() => {
        // Create nodes if not exist, preserving positions
        const existingMap = new Map(simNodes.map(n => [n.id, n]));
        
        const newSimNodes: SimNode[] = images.map(img => {
            const existing = existingMap.get(img.id);
            return {
                id: img.id,
                original: img,
                x: existing ? existing.x : Math.random() * 500,
                y: existing ? existing.y : Math.random() * 500,
                vx: existing?.vx || 0,
                vy: existing?.vy || 0,
                currentScale: existing ? existing.currentScale : 0,
                targetScale: 0.5,
                currentOpacity: existing ? existing.currentOpacity : 0,
                targetOpacity: 0.8
            };
        });
        setSimNodes(newSimNodes);
    }, [images]); // Only run on image list update

    // -------------------------------------------------------------------------
    // 2. Physics & Logic Engine
    // -------------------------------------------------------------------------

    useEffect(() => {
        if (!containerRef.current || simNodes.length === 0) return;

        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;

        // D3 Zoom Setup
        const zoom = d3Zoom<HTMLDivElement, unknown>()
            .scaleExtent([0.1, 5])
            .on("zoom", (event) => {
                if (worldRef.current) {
                    worldRef.current.style.transform = `translate3d(${event.transform.x}px, ${event.transform.y}px, 0) scale(${event.transform.k})`;
                }
            });
        d3Select(containerRef.current).call(zoom).on("dblclick.zoom", null);

        // Pre-calculate Targets for "Galaxy" layouts (Tag/Color modes)
        if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') {
            // Sort active nodes by time
            const activeNodes = simNodes
                .filter(n => activeSet.has(n.id))
                .sort((a, b) => a.original.captureTimestamp - b.original.captureTimestamp);

            // Fermat's Spiral: r = c * sqrt(n), theta = n * 137.508...
            const c = 60; // Spread factor
            const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~2.399...

            activeNodes.forEach((node, index) => {
                const r = c * Math.sqrt(index + 1);
                const theta = index * goldenAngle;
                
                node.targetX = (width / 2) + r * Math.cos(theta);
                node.targetY = (height / 2) + r * Math.sin(theta);
            });
        }

        const simulation = d3ForceSimulation<SimNode>(simNodes)
            // Forces
            .force("charge", d3ForceManyBody<SimNode>().strength((d) => {
                // Active set repels more to create space
                return activeSet.has(d.id) ? -300 : -50;
            }))
            .force("collide", d3ForceCollide<SimNode>().radius((d) => {
                 return activeSet.has(d.id) ? 60 : 10;
            }).strength(0.7));

        // THE TICK LOOP
        simulation.on("tick", () => {
            simNodes.forEach(node => {
                const isActive = activeSet.has(node.id);
                const isAnchor = anchor.mode === 'IMAGE' && node.id === anchor.id;

                // --- 1. Target Logic (The Brain) ---
                
                if (anchor.mode === 'NONE') {
                    // IDLE: Slight drift, center gravity
                    node.targetScale = 0.4;
                    node.targetOpacity = 0.6;
                    node.vx = (node.vx || 0) + (width/2 - node.x) * 0.0005;
                    node.vy = (node.vy || 0) + (height/2 - node.y) * 0.0005;
                }
                else if (anchor.mode === 'IMAGE') {
                    if (isAnchor) {
                        // Main Anchor: Top-Left Quadrant
                        const targetX = width * 0.3;
                        const targetY = height * 0.4;
                        node.vx = (node.vx || 0) + (targetX - node.x) * 0.05;
                        node.vy = (node.vy || 0) + (targetY - node.y) * 0.05;
                        node.targetScale = 1.3;
                        node.targetOpacity = 1;
                    } else if (isActive) {
                        // Related: Orbit center
                        node.vx = (node.vx || 0) + (width/2 - node.x) * 0.005;
                        node.vy = (node.vy || 0) + (height/2 - node.y) * 0.005;
                        node.targetScale = 0.7;
                        node.targetOpacity = 0.9;
                    } else {
                        // Unrelated: Fade
                        node.targetScale = 0.1;
                        node.targetOpacity = 0.1;
                    }
                }
                else if (anchor.mode === 'TAG' || anchor.mode === 'COLOR') {
                    if (isActive && node.targetX !== undefined && node.targetY !== undefined) {
                        // Galaxy Spiral Position
                        node.vx = (node.vx || 0) + (node.targetX - node.x) * 0.05;
                        node.vy = (node.vy || 0) + (node.targetY - node.y) * 0.05;
                        node.targetScale = 0.8;
                        node.targetOpacity = 1;
                    } else {
                        // Unrelated: Fade
                        node.targetScale = 0.1;
                        node.targetOpacity = 0.05;
                    }
                }

                // --- 2. Brownian Motion (Aliveness) ---
                node.vx = (node.vx || 0) + (Math.random() - 0.5) * 0.15;
                node.vy = (node.vy || 0) + (Math.random() - 0.5) * 0.15;

                // --- 3. 2.5D Interpolation ---
                const lerp = 0.1;
                node.currentScale += (node.targetScale - node.currentScale) * lerp;
                node.currentOpacity += (node.targetOpacity - node.currentOpacity) * lerp;

                // --- 4. DOM Update ---
                const el = nodeRefs.current.get(node.id);
                if (el) {
                    el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0) scale(${node.currentScale})`;
                    el.style.opacity = node.currentOpacity.toString();
                    
                    // Z-Index Logic with Hover Priority
                    const isHovered = hoveredNodeIdRef.current === node.id;
                    if (isHovered) {
                         el.style.zIndex = '1000';
                    } else {
                         el.style.zIndex = Math.floor(node.currentScale * 100).toString();
                    }
                    
                    // Light mode: Grayscale + Opacity rather than blur looks cleaner for "cultured" look
                    // But slight blur is still good for depth
                    el.style.filter = node.currentScale < 0.3 ? 'grayscale(100%) opacity(50%) blur(1px)' : 'none';
                    // Add slight shadow for depth on white background
                    el.style.boxShadow = node.currentScale > 0.6 ? '0 10px 40px -10px rgba(0,0,0,0.1)' : 'none';
                }
            });
        });

        return () => {
            simulation.stop();
        };
    }, [simNodes, anchor, activeSet]);

    // -------------------------------------------------------------------------
    // 3. Interaction Handlers
    // -------------------------------------------------------------------------

    const handleNodeClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (anchor.id === id && anchor.mode === 'IMAGE') {
            setAnchor({ mode: 'NONE', id: '' });
        } else {
            setAnchor({ mode: 'IMAGE', id });
        }
    };
    
    // Hover handlers for Z-Index manipulation
    const handleMouseEnter = (node: SimNode) => {
        hoveredNodeIdRef.current = node.id;
        const el = nodeRefs.current.get(node.id);
        if (el) {
            el.style.zIndex = '1000';
        }
    };

    const handleMouseLeave = (node: SimNode) => {
        hoveredNodeIdRef.current = null;
        const el = nodeRefs.current.get(node.id);
        if (el) {
            el.style.zIndex = Math.floor(node.currentScale * 100).toString();
        }
    };

    const handleTagClick = (tag: Tag) => {
        setAnchor({ mode: 'TAG', id: tag.id, meta: tag });
    };

    const handleColorClick = (colorHex: string) => {
        setAnchor({ mode: 'COLOR', id: colorHex, meta: colorHex });
    };

    const resetUniverse = () => setAnchor({ mode: 'NONE', id: '' });

    // -------------------------------------------------------------------------
    // 4. View Rendering
    // -------------------------------------------------------------------------

    // Resolve Active Data for UI
    let activeData: ImageNode | undefined;
    if (anchor.mode === 'IMAGE') activeData = images.find(i => i.id === anchor.id);

    return (
        <div className="relative w-full h-full bg-[#faf9f6] overflow-hidden font-mono select-none">
            
            {/* BACKGROUND: Chromatic Atmosphere (Watercolor effect) */}
            <ChromaticAtmosphere colors={atmosphereColors} />

            {/* 3D World */}
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
                                className={`
                                    absolute -translate-x-1/2 -translate-y-1/2 
                                    w-48 transition-all duration-300 cursor-pointer
                                    hover:scale-105
                                `}
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
                    {anchor.mode === 'IMAGE' && "Relational View Active. Connections visualized."}
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

            {/* --- MEMORY ANCHOR MODALS (COMPRESSED NAVIGATION TOOLS) --- */}

            {/* 1. IMAGE MODE TOOL */}
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

            {/* 2. TAG MODE TOOL */}
            {anchor.mode === 'TAG' && (
                <div className="absolute bottom-6 right-6 w-64 bg-white/90 backdrop-blur-md border border-zinc-200 p-4 rounded-lg shadow-xl z-50 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300">
                    <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
                        <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-widest">Semantic Signal</h3>
                        <button onClick={resetUniverse} className="text-zinc-400 hover:text-zinc-700"><X size={14} /></button>
                    </div>
                    
                    <div className="flex items-center gap-3">
                         <div className="p-2 bg-indigo-50 rounded border border-indigo-100">
                             <Hash size={16} className="text-indigo-500" />
                        </div>
                        <div>
                            <div className="text-sm font-medium text-zinc-800 truncate max-w-[120px]" title={anchor.meta?.label}>{anchor.meta?.label || 'Tag'}</div>
                            <div className="text-[10px] text-zinc-500">{activeSet.size} Linked Nodes</div>
                        </div>
                    </div>

                    {/* Chromatic Threads Navigation */}
                    {semanticAdjacentColors.length > 0 && (
                        <div className="space-y-1 pt-1">
                            <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Chromatic Threads</span>
                            <div className="flex gap-1 h-6">
                                {semanticAdjacentColors.map((c, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => handleColorClick(c)} 
                                        style={{backgroundColor: c}} 
                                        className="flex-1 rounded-sm border border-black/5 hover:border-black/20 hover:scale-105 transition-all shadow-sm" 
                                        title={c}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Adjacent Tags Navigation */}
                    {semanticAdjacentTags.length > 0 && (
                        <div className="space-y-1 pt-1">
                            <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Adjacent Threads</span>
                            <div className="flex flex-wrap gap-1.5">
                                {semanticAdjacentTags.map(t => (
                                    <button 
                                        key={t.id} 
                                        onClick={() => handleTagClick(t)}
                                        className="px-2 py-0.5 bg-zinc-50 border border-zinc-200 hover:border-indigo-500 hover:text-indigo-600 rounded-sm text-[10px] text-zinc-600 transition-colors cursor-pointer truncate max-w-[120px]"
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 3. COLOR MODE TOOL */}
            {anchor.mode === 'COLOR' && (
                <div className="absolute bottom-6 right-6 w-64 bg-white/90 backdrop-blur-md border border-zinc-200 p-4 rounded-lg shadow-xl z-50 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300">
                    <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
                        <h3 className="text-xs font-bold text-pink-500 uppercase tracking-widest">Chromatic Signal</h3>
                        <button onClick={resetUniverse} className="text-zinc-400 hover:text-zinc-700"><X size={14} /></button>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div 
                            className="w-8 h-8 rounded shadow-sm border border-zinc-200"
                            style={{ backgroundColor: anchor.id }}
                        />
                        <div>
                            <div className="text-xs font-mono text-zinc-600">{anchor.id}</div>
                            <div className="text-[10px] text-zinc-400">{activeSet.size} Linked Nodes</div>
                        </div>
                    </div>

                    {/* Adjacent Colors Navigation */}
                    {adjacentColors.length > 0 && (
                        <div className="space-y-1 pt-1">
                            <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Adjacent Tones</span>
                            <div className="flex gap-1 h-6">
                                {adjacentColors.map((c, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => handleColorClick(c)} 
                                        style={{backgroundColor: c}} 
                                        className="flex-1 rounded-sm border border-black/5 hover:border-black/20 hover:scale-105 transition-all shadow-sm" 
                                        title={c}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Adjacent Tags Navigation */}
                    {adjacentTags.length > 0 && (
                        <div className="space-y-1 pt-1">
                            <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Associated Threads</span>
                            <div className="flex flex-wrap gap-1.5">
                                {adjacentTags.map(t => (
                                    <button 
                                        key={t.id} 
                                        onClick={() => handleTagClick(t)}
                                        className="px-2 py-0.5 bg-zinc-50 border border-zinc-200 hover:border-pink-500 hover:text-pink-600 rounded-sm text-[10px] text-zinc-600 transition-colors cursor-pointer truncate max-w-[120px]"
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
};

export default Experience;