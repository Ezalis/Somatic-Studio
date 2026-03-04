import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ExperienceNode, AnchorState, PhysicsConfig, RingLevel, ZoneName } from '../types';
import { getZoneTarget, getRingTarget, computeHeroEquilibrium } from '../services/dataService';

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
    velocityDecay: 0.45,
    velocityDecayIdle: 0.2,
    swirlSpeed: 0.35,
    floatPerturbation: 0.02,
    floatSpeed: 0.5,
    heroGravity: 0.12,
    neighborGravity: 0.035,
    zoneGravity: 0.05,
    localSwirlSpeed: 0.2,
    gridPull: 0.15,
    filterGridPull: 0.15,
    damping: 0.9,
    lerpVisible: 0.1,
    lerpHidden: 0.4,
    boundaryScale: 0.9,
    heroEquilibriumGravity: 0.025,
    heroVelocityDamping: 0.95,
    cameraPanSpeed: 0.03,
    comfortZoneRatio: 0.7,
    ringRadii: { session: 150, thematic: 250, visual: 350, technical: 420, gateway: 500 },
    ringRadiiMobile: { session: 100, thematic: 170, visual: 240, technical: 290, gateway: 340 },
    ringGravity: 0.04,
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
    config?: Partial<PhysicsConfig>,
    clusterAngles?: Map<ZoneName, number>,
    disabled?: boolean
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
    const clusterAnglesRef = useRef<Map<ZoneName, number>>(new Map());
    const disabledRef = useRef(disabled ?? false);

    // Phase 1: Dynamic hero equilibrium refs
    const heroEquilibriumRef = useRef<{ x: number; y: number }>({ x: windowDimensions.width / 2, y: windowDimensions.height / 2 });
    const heroPositionRef = useRef<{ x: number; y: number }>({ x: windowDimensions.width / 2, y: windowDimensions.height * 0.45 });

    // Phase 2: Camera tracking — user interaction guard
    const userInteractingRef = useRef(false);

    // Phase 3: Parallax — current zoom transform for per-node depth offsets
    const zoomTransformRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });

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
                    return mobile ? 25 : 35;
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
                zoomTransformRef.current = { x: event.transform.x, y: event.transform.y, k: event.transform.k };
                if (worldRef.current) {
                    worldRef.current.style.transform = `translate3d(${event.transform.x}px, ${event.transform.y}px, 0) scale(${event.transform.k})`;
                }
            });

        // Phase 2: Track user interaction for camera pan guard
        zoom.on("start.interaction", () => { userInteractingRef.current = true; });
        zoom.on("end.interaction", () => { userInteractingRef.current = false; });

        zoomRef.current = zoom;
        d3.select(containerRef.current).call(zoom).on("dblclick.zoom", null);
    }, []);

    // --- SIMULATION LIFECYCLE (create once when ready, destroy on loading/disabled) ---
    const hasNodes = simNodes.length > 0;
    useEffect(() => {
        if (!containerRef.current || loadingProgress || !hasNodes || disabledRef.current) {
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

            // Phase 1: Compute dynamic hero equilibrium before per-node loop (IMAGE mode only)
            if (a.mode === 'IMAGE') {
                const equilibrium = computeHeroEquilibrium(activeNodes, dims.width, dims.height, cfg.comfortZoneRatio);
                heroEquilibriumRef.current = equilibrium;

                // Capture actual hero position
                const heroNode = nodes.find(n => n.id === a.id);
                if (heroNode) {
                    heroPositionRef.current = { x: heroNode.x, y: heroNode.y };
                }
            }

            const heroPosX = heroPositionRef.current.x;
            const heroPosY = heroPositionRef.current.y;

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
                        // Phase 1: Dynamic equilibrium gravity (replaces fixed center gravity)
                        const eq = heroEquilibriumRef.current;
                        node.vx = (node.vx || 0) + (eq.x - node.x) * cfg.heroEquilibriumGravity;
                        node.vy = (node.vy || 0) + (eq.y - node.y) * cfg.heroEquilibriumGravity;
                        node.vx *= cfg.heroVelocityDamping;
                        node.vy *= cfg.heroVelocityDamping;
                        node.targetScale = heroScale;
                        node.targetOpacity = 1;
                    }
                    else if (node.isVisible) {
                        // Phase 1: Boundary containment relative to hero position
                        const boundaryRadius = Math.max(dims.width, dims.height) * cfg.boundaryScale;
                        const dxRaw = node.x - heroPosX;
                        const dyRaw = node.y - heroPosY;
                        const distRaw = Math.sqrt(dxRaw * dxRaw + dyRaw * dyRaw) || 1;

                        if (distRaw > boundaryRadius) {
                            const angle = Math.atan2(dyRaw, dxRaw);
                            node.x = heroPosX + Math.cos(angle) * (boundaryRadius * 0.95);
                            node.y = heroPosY + Math.sin(angle) * (boundaryRadius * 0.95);
                            node.vx = (node.vx || 0) * 0.1;
                            node.vy = (node.vy || 0) * 0.1;
                        }

                        // Ring-targeted gravity (replaces zone-targeted gravity)
                        if (node.scoreBreakdown && node.ringProfile) {
                            const ringRadii = mobile ? cfg.ringRadiiMobile : cfg.ringRadii;
                            // Group active nodes by ring for per-ring indexing
                            const ringKey = node.ringProfile.ring;
                            const ringNodes = activeNodes.filter(n => n.ringProfile?.ring === ringKey);
                            const ringIndex = ringNodes.indexOf(node);
                            const ringPop = ringNodes.length;

                            const ringTarget = getRingTarget(
                                node.scoreBreakdown,
                                node.ringProfile,
                                heroPosX,
                                heroPosY,
                                Math.max(0, ringIndex),
                                ringPop,
                                mobile,
                                clusterAnglesRef.current,
                                ringRadii
                            );

                            node.vx = (node.vx || 0) + (ringTarget.x - node.x) * cfg.ringGravity;
                            node.vy = (node.vy || 0) + (ringTarget.y - node.y) * cfg.ringGravity;

                            // Local swirl modulated by ring level
                            const swirlMultiplier: Record<RingLevel, number> = {
                                session: 0.4,
                                thematic: 0.7,
                                visual: 1.0,
                                technical: 1.0,
                                gateway: 1.2,
                            };
                            const localDx = node.x - ringTarget.x;
                            const localDy = node.y - ringTarget.y;
                            const localDist = Math.sqrt(localDx * localDx + localDy * localDy) || 1;
                            const swirlMod = swirlMultiplier[ringKey] || 1.0;
                            node.vx += (-localDy / localDist) * cfg.localSwirlSpeed * swirlMod;
                            node.vy += (localDx / localDist) * cfg.localSwirlSpeed * swirlMod;
                        } else if (node.scoreBreakdown) {
                            // Fallback: old zone-targeted gravity for nodes without ring profile
                            const rank = activeNodes.indexOf(node);
                            const totalVisible = activeNodes.length;
                            const zoneTarget = getZoneTarget(node.scoreBreakdown, heroPosX, heroPosY, Math.max(0, rank), totalVisible, mobile, clusterAnglesRef.current);

                            node.vx = (node.vx || 0) + (zoneTarget.x - node.x) * cfg.zoneGravity;
                            node.vy = (node.vy || 0) + (zoneTarget.y - node.y) * cfg.zoneGravity;
                        } else {
                            // Fallback: gentle pull toward hero
                            node.vx = (node.vx || 0) + (heroPosX - node.x) * cfg.neighborGravity;
                            node.vy = (node.vy || 0) + (heroPosY - node.y) * cfg.neighborGravity;
                        }

                        // Scale and opacity driven by glyph context depth
                        if (node.glyphContext && node.depthLayer) {
                            node.targetScale = node.glyphContext.relevanceScale * (mobile ? 0.7 : 1.0);
                            node.targetOpacity = node.depthLayer.opacity;
                        } else {
                            node.targetScale = node.relevanceScore > 40 ? (mobile ? 0.6 : 0.8) : (mobile ? 0.45 : 0.6);
                            node.targetOpacity = 1.0;
                        }
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
                    // Depth-scaled transform for 2.5D effect
                    const depthScale = node.depthLayer
                        ? Math.max(0.5, 1 + node.depthLayer.z / 500)
                        : 1;
                    const finalScale = node.currentScale * depthScale;

                    // Parallax offset: near objects counter camera movement, far objects drift with it
                    const zt = zoomTransformRef.current;
                    const pFactor = node.depthLayer?.parallaxFactor ?? 1;
                    const parallaxDx = zt.x * (1 - pFactor) / (zt.k || 1);
                    const parallaxDy = zt.y * (1 - pFactor) / (zt.k || 1);
                    el.style.transform = `translate3d(${node.x - parallaxDx}px, ${node.y - parallaxDy}px, 0) scale(${finalScale})`;
                    el.style.opacity = node.currentOpacity.toString();
                    el.style.display = node.currentOpacity < 0.05 ? 'none' : 'block';

                    const isHoveredOrHero = hoveredNodeIdRef.current === node.id || (a.mode === 'IMAGE' && node.id === a.id);

                    if (isHoveredOrHero) {
                        el.style.zIndex = node.id === a.id ? '2000' : '1000';
                        el.style.filter = 'none';
                        if (node.id === a.id) {
                            el.style.boxShadow = `0 20px 60px -10px ${palette[0] || 'rgba(0,0,0,0.3)'}`;
                        } else {
                            el.style.boxShadow = 'none';
                        }
                    } else {
                        el.style.zIndex = Math.floor(node.currentScale * 100).toString();
                        // Apply depth blur for non-hovered, non-hero nodes
                        const blurPx = node.depthLayer?.blur ?? 0;
                        el.style.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
                        el.style.boxShadow = 'none';
                    }
                }
            });

            // Phase 2: Camera tracking — pan when hero approaches comfort zone edges
            if (a.mode === 'IMAGE' && !userInteractingRef.current && containerRef.current && zoomRef.current) {
                const heroNode = nodes.find(n => n.id === a.id);
                if (heroNode) {
                    const currentTransform = d3.zoomTransform(containerRef.current);
                    const heroScreenX = heroNode.x * currentTransform.k + currentTransform.x;
                    const heroScreenY = heroNode.y * currentTransform.k + currentTransform.y;

                    const margin = (1 - cfg.comfortZoneRatio) / 2;
                    const minX = dims.width * margin;
                    const maxX = dims.width * (1 - margin);
                    const minY = dims.height * margin;
                    const maxY = dims.height * (1 - margin);

                    let panDx = 0;
                    let panDy = 0;
                    if (heroScreenX < minX) panDx = minX - heroScreenX;
                    else if (heroScreenX > maxX) panDx = maxX - heroScreenX;
                    if (heroScreenY < minY) panDy = minY - heroScreenY;
                    else if (heroScreenY > maxY) panDy = maxY - heroScreenY;

                    const panMag = Math.sqrt(panDx * panDx + panDy * panDy);
                    if (panMag > 1) {
                        const newX = currentTransform.x + panDx * cfg.cameraPanSpeed;
                        const newY = currentTransform.y + panDy * cfg.cameraPanSpeed;
                        const newTransform = d3.zoomIdentity.translate(newX, newY).scale(currentTransform.k);
                        zoomRef.current.transform(d3.select(containerRef.current), newTransform);
                    }
                }
            }
        });

        simulationRef.current = sim;

        return () => {
            sim.stop();
            simulationRef.current = null;
        };
    }, [hasNodes, loadingProgress]);

    // --- SYNC: disabled ---
    useEffect(() => {
        disabledRef.current = disabled ?? false;
        if (disabledRef.current && simulationRef.current) {
            simulationRef.current.stop();
            simulationRef.current = null;
        }
    }, [disabled]);

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

        // Reset hero equilibrium to viewport center on anchor change
        const dims = dimensionsRef.current;
        heroEquilibriumRef.current = { x: dims.width / 2, y: dims.height / 2 };
        heroPositionRef.current = { x: dims.width / 2, y: dims.height * 0.45 };

        if (simulationRef.current) {
            // Zero all node velocities to eliminate jolts on anchor change
            simNodesRef.current.forEach(node => {
                node.vx = 0;
                node.vy = 0;
            });
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

    // --- SYNC: clusterAngles ---
    useEffect(() => {
        clusterAnglesRef.current = clusterAngles || new Map();
    }, [clusterAngles]);

    return { zoomRef };
}
