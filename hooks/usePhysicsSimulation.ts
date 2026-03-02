import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ExperienceNode, AnchorState, PhysicsConfig } from '../types';

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
    velocityDecay: 0.3,
    velocityDecayIdle: 0.2,
    swirlSpeed: 0.6,
    floatPerturbation: 0.05,
    floatSpeed: 0.5,
    heroGravity: 0.12,
    neighborGravity: 0.035,
    gridPull: 0.15,
    filterGridPull: 0.15,
    damping: 0.9,
    lerpVisible: 0.1,
    lerpHidden: 0.4,
    boundaryScale: 0.9,
};

function getHeroMetrics(dims: { width: number; height: number }) {
    const mobile = dims.width < 1024;
    const maxScaleByHeight = (dims.height * (mobile ? 0.5 : 0.6)) / 288;
    const heroScale = Math.min(Math.max(maxScaleByHeight, mobile ? 1.0 : 1.2), mobile ? 1.4 : 1.8);
    const heroWidth = 192 * heroScale;
    const heroRadius = Math.sqrt(heroWidth ** 2 + (heroWidth * 1.5) ** 2) / 2;
    return { heroScale, heroRadius, mobile };
}

export function usePhysicsSimulation(
    containerRef: React.RefObject<HTMLDivElement | null>,
    worldRef: React.RefObject<HTMLDivElement | null>,
    nodeRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
    hoveredNodeIdRef: React.MutableRefObject<string | null>,
    simNodes: ExperienceNode[],
    anchor: AnchorState,
    activePalette: string[],
    loadingProgress: { current: number; total: number } | null | undefined,
    windowDimensions: { width: number; height: number },
    config?: Partial<PhysicsConfig>
): { zoomRef: React.MutableRefObject<d3.ZoomBehavior<HTMLDivElement, unknown> | null> } {
    const zoomRef = useRef<d3.ZoomBehavior<HTMLDivElement, unknown> | null>(null);
    const simulationRef = useRef<d3.Simulation<ExperienceNode, undefined> | null>(null);

    // Value refs — tick callback reads these to access current state without recreation
    const simNodesRef = useRef(simNodes);
    const anchorRef = useRef(anchor);
    const activePaletteRef = useRef(activePalette);
    const activeNodesRef = useRef<ExperienceNode[]>([]);
    const dimensionsRef = useRef(windowDimensions);
    const configRef = useRef<PhysicsConfig>({ ...DEFAULT_PHYSICS_CONFIG, ...config });

    // Apply D3 force configuration based on current anchor mode and dimensions
    function applyForces(sim: d3.Simulation<ExperienceNode, undefined>) {
        const a = anchorRef.current;
        const dims = dimensionsRef.current;
        const cfg = configRef.current;
        const { heroRadius, mobile } = getHeroMetrics(dims);

        sim.alphaTarget(a.mode === 'NONE' ? 0 : 0.05)
            .velocityDecay(a.mode === 'NONE' ? cfg.velocityDecayIdle : cfg.velocityDecay)
            .force("charge", d3.forceManyBody<ExperienceNode>().strength((d) => {
                if (!d.isVisible) return 0;
                if (a.mode === 'NONE') return 0;
                if (d.id === a.id) return -1500;
                if (a.mode === 'TAG' || a.mode === 'COLOR') return mobile ? -15 : -30;
                return -200;
            }))
            .force("collide", d3.forceCollide<ExperienceNode>().radius((d) => {
                if (!d.isVisible) return 0;
                if (a.mode === 'NONE') return 0;
                if (a.mode === 'IMAGE') {
                    if (d.id === a.id) return heroRadius * (mobile ? 0.8 : 0.95);
                    return mobile ? 30 : 45;
                }
                if (a.mode === 'TAG' || a.mode === 'COLOR') return mobile ? 20 : 30;
                return mobile ? 35 : 55;
            }).strength(0.8));
    }

    // Recompute which nodes are "active" for grid/orbit layout calculations
    function recomputeActiveNodes() {
        const a = anchorRef.current;
        const nodes = simNodesRef.current;
        if (a.mode === 'NONE') {
            activeNodesRef.current = nodes.filter(n => n.isVisible)
                .sort((a, b) => (a.gridSortIndex || 0) - (b.gridSortIndex || 0));
        } else {
            activeNodesRef.current = nodes.filter(n => n.isVisible && n.id !== a.id);
        }
    }

    // --- ZOOM SETUP (once on mount) ---
    useEffect(() => {
        if (!containerRef.current) return;

        const zoom = d3.zoom<HTMLDivElement, unknown>()
            .scaleExtent([0.1, 4])
            .on("zoom", (event) => {
                if (worldRef.current) {
                    worldRef.current.style.transform = `translate3d(${event.transform.x}px, ${event.transform.y}px, 0) scale(${event.transform.k})`;
                }
            });

        zoomRef.current = zoom;
        d3.select(containerRef.current).call(zoom).on("dblclick.zoom", null);
    }, []);

    // --- SIMULATION LIFECYCLE (create once when ready, destroy on loading) ---
    const hasNodes = simNodes.length > 0;
    useEffect(() => {
        if (!containerRef.current || loadingProgress || !hasNodes) {
            if (simulationRef.current) {
                simulationRef.current.stop();
                simulationRef.current = null;
            }
            return;
        }

        // Already running — don't recreate
        if (simulationRef.current) return;

        // Sync all refs before first tick
        recomputeActiveNodes();

        const sim = d3.forceSimulation<ExperienceNode>(simNodesRef.current);
        applyForces(sim);

        sim.on("tick", () => {
            const nodes = simNodesRef.current;
            const a = anchorRef.current;
            const palette = activePaletteRef.current;
            const activeNodes = activeNodesRef.current;
            const dims = dimensionsRef.current;
            const cfg = configRef.current;
            const cx = dims.width / 2;
            const cy = dims.height / 2;
            const mobile = dims.width < 1024;
            const time = Date.now() / 1000;
            const { heroScale } = getHeroMetrics(dims);

            nodes.forEach((node, i) => {
                if (!node.currentOpacity && !node.targetOpacity && !node.isVisible) return;

                if (!node.isVisible && node.currentOpacity < 0.01 && node.currentScale < 0.01) {
                    node.currentOpacity = 0;
                    node.currentScale = 0;
                    const el = nodeRefs.current.get(node.id);
                    if (el) el.style.display = 'none';
                    return;
                }

                const isAnchor = a.mode === 'IMAGE' && node.id === a.id;
                const lerpFactor = !node.isVisible ? cfg.lerpHidden : cfg.lerpVisible;

                // Float perturbation for IMAGE mode neighbors
                if (node.isVisible && !isAnchor && a.mode !== 'NONE' &&
                    !['TAG', 'COLOR', 'SEASON', 'DATE', 'CAMERA', 'LENS'].includes(a.mode)) {
                    node.vx = (node.vx || 0) + Math.sin(time * cfg.floatSpeed + i) * cfg.floatPerturbation;
                    node.vy = (node.vy || 0) + Math.cos(time * cfg.floatSpeed * 0.8 + i) * cfg.floatPerturbation;
                }

                if (a.mode === 'NONE') {
                    if (node.isVisible) {
                        const idx = activeNodes.indexOf(node);
                        if (idx !== -1) {
                            const total = activeNodes.length;
                            const CELL_W = mobile ? 90 : 120;
                            const CELL_H = mobile ? 90 : 120;
                            const COLS = Math.max(1, Math.floor(dims.width / CELL_W));
                            const col = idx % COLS;
                            const row = Math.floor(idx / COLS);
                            const gridW = (COLS - 1) * CELL_W;
                            const ROWS = Math.ceil(total / COLS);
                            const gridH = (ROWS - 1) * CELL_H;
                            const tx = cx + (col * CELL_W) - (gridW / 2);
                            const ty = cy + (row * CELL_H) - (gridH / 2);

                            node.vx = (node.vx || 0) + (tx - node.x) * cfg.gridPull;
                            node.vy = (node.vy || 0) + (ty - node.y) * cfg.gridPull;
                        }
                        node.targetScale = 0.85;
                        node.targetOpacity = 1;
                    } else {
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                    }
                }
                else if (a.mode === 'IMAGE') {
                    if (isAnchor) {
                        const targetY = dims.height * 0.45;
                        node.vx = (node.vx || 0) + (cx - node.x) * cfg.heroGravity;
                        node.vy = (node.vy || 0) + (targetY - node.y) * cfg.heroGravity;
                        node.vx *= 0.8;
                        node.vy *= 0.8;
                        node.targetScale = heroScale;
                        node.targetOpacity = 1;
                    }
                    else if (node.isVisible) {
                        const targetY = dims.height * 0.45;
                        const dxRaw = node.x - cx;
                        const dyRaw = node.y - targetY;
                        const distRaw = Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw) || 1;
                        const boundaryRadius = Math.max(dims.width, dims.height) * cfg.boundaryScale;

                        if (distRaw > boundaryRadius) {
                            const angle = Math.atan2(dyRaw, dxRaw);
                            node.x = cx + Math.cos(angle) * (boundaryRadius * 0.95);
                            node.y = targetY + Math.sin(angle) * (boundaryRadius * 0.95);
                            node.vx = (node.vx || 0) * 0.1;
                            node.vy = (node.vy || 0) * 0.1;
                        }

                        node.vx = (node.vx || 0) + (cx - node.x) * cfg.neighborGravity;
                        node.vy = (node.vy || 0) + (targetY - node.y) * cfg.neighborGravity;

                        const dx = node.x - cx;
                        const dy = node.y - targetY;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                        node.vx += (-dy / dist) * cfg.swirlSpeed;
                        node.vy += (dx / dist) * cfg.swirlSpeed;

                        node.targetScale = node.relevanceScore > 40 ? (mobile ? 0.6 : 0.8) : (mobile ? 0.45 : 0.6);
                        node.targetOpacity = 1.0;
                    }
                    else {
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                    }
                }
                else if (['TAG', 'COLOR', 'DATE', 'CAMERA', 'LENS', 'SEASON'].includes(a.mode)) {
                    if (node.isVisible) {
                        const idx = activeNodes.indexOf(node);
                        const total = activeNodes.length;
                        const CELL_W = mobile ? 120 : 220;
                        const CELL_H = mobile ? 160 : 220;
                        const COLS = Math.max(1, Math.floor(dims.width / CELL_W));
                        const row = Math.floor(idx / COLS);
                        const col = idx % COLS;
                        const gridW = (COLS - 1) * CELL_W;
                        const gridH = (Math.ceil(total / COLS) - 1) * CELL_H;
                        const tx = cx + (col * CELL_W) - (gridW / 2);
                        const ty = cy + (row * CELL_H) - (gridH / 2);

                        node.vx = (node.vx || 0) + (tx - node.x) * cfg.filterGridPull;
                        node.vy = (node.vy || 0) + (ty - node.y) * cfg.filterGridPull;

                        node.targetScale = mobile ? 0.55 : 0.85;
                        node.targetOpacity = 1;
                    } else {
                        node.targetScale = 0;
                        node.targetOpacity = 0;
                    }
                }

                // Damping and interpolation
                node.vx = (node.vx || 0) * cfg.damping;
                node.vy = (node.vy || 0) * cfg.damping;
                node.currentScale += (node.targetScale - node.currentScale) * lerpFactor;
                node.currentOpacity += (node.targetOpacity - node.currentOpacity) * lerpFactor;

                // DOM updates
                const el = nodeRefs.current.get(node.id);
                if (el) {
                    el.style.transform = `translate3d(${node.x}px, ${node.y}px, 0) scale(${node.currentScale})`;
                    el.style.opacity = node.currentOpacity.toString();
                    el.style.display = node.currentOpacity < 0.05 ? 'none' : 'block';

                    if (hoveredNodeIdRef.current === node.id || (a.mode === 'IMAGE' && node.id === a.id)) {
                        el.style.zIndex = node.id === a.id ? '2000' : '1000';
                        el.style.filter = 'none';
                        if (node.id === a.id) {
                            el.style.boxShadow = `0 20px 60px -10px ${palette[0] || 'rgba(0,0,0,0.3)'}`;
                        } else {
                            el.style.boxShadow = 'none';
                        }
                    } else {
                        el.style.zIndex = Math.floor(node.currentScale * 100).toString();
                        el.style.filter = 'none';
                        el.style.boxShadow = 'none';
                    }
                }
            });
        });

        simulationRef.current = sim;

        return () => {
            sim.stop();
            simulationRef.current = null;
        };
    }, [hasNodes, loadingProgress]);

    // --- SYNC: simNodes (update simulation nodes without recreation) ---
    useEffect(() => {
        simNodesRef.current = simNodes;
        recomputeActiveNodes();

        if (simulationRef.current && simNodes.length > 0) {
            simulationRef.current.nodes(simNodes);
            simulationRef.current.alpha(0.3).restart();
        }
    }, [simNodes]);

    // --- SYNC: anchor (reconfigure forces without recreation) ---
    useEffect(() => {
        anchorRef.current = anchor;
        recomputeActiveNodes();

        if (simulationRef.current) {
            applyForces(simulationRef.current);
            simulationRef.current.alpha(0.3).restart();
        }
    }, [anchor]);

    // --- SYNC: activePalette (ref update only, no simulation changes) ---
    useEffect(() => {
        activePaletteRef.current = activePalette;
    }, [activePalette]);

    // --- SYNC: windowDimensions (reconfigure forces for new viewport) ---
    useEffect(() => {
        dimensionsRef.current = windowDimensions;
        if (simulationRef.current) {
            applyForces(simulationRef.current);
        }
    }, [windowDimensions]);

    // --- SYNC: config ---
    useEffect(() => {
        configRef.current = { ...DEFAULT_PHYSICS_CONFIG, ...config };
    }, [config]);

    return { zoomRef };
}
