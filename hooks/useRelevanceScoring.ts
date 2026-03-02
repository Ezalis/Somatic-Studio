import { useEffect, useState, useCallback } from 'react';
import { ImageNode, Tag, TagType, ExperienceNode, AnchorState, ScoreBreakdown } from '../types';
import {
    getColorDistSq,
    getMinPaletteDistance,
    isMonochrome,
    getDominantColorsFromNodes,
    getRelatedTagsFromNodes
} from '../services/dataService';

// --- Pure scoring functions (testable without React) ---

export function scoreImageNode(
    node: ExperienceNode,
    anchorImg: ImageNode,
    tags: Tag[],
    getTagById: (id: string) => Tag | undefined
): ScoreBreakdown {
    const breakdown: ScoreBreakdown = { total: 0, temporal: 0, thematic: 0, visual: 0, technical: 0 };

    const anchorTags = [...anchorImg.tagIds, ...(anchorImg.aiTagIds || [])];
    const targetTags = [...node.original.tagIds, ...(node.original.aiTagIds || [])];

    const anchorIsMono = isMonochrome(tags, anchorTags);
    const targetIsMono = isMonochrome(tags, targetTags);
    const colorDist = getMinPaletteDistance(anchorImg.palette, node.original.palette);

    const timeDiff = Math.abs(node.original.captureTimestamp - anchorImg.captureTimestamp);
    const isSameDay = timeDiff < 86400000;
    const isNearDate = timeDiff < 259200000;
    const sameSeason = node.original.inferredSeason === anchorImg.inferredSeason;

    // 1. TEMPORAL (High Priority)
    if (isSameDay) breakdown.temporal += 500;
    else if (isNearDate) breakdown.temporal += 100;
    if (sameSeason) breakdown.temporal += 20;

    // 2. THEMATIC (Medium Priority)
    const sharedTags = targetTags.filter(t => anchorTags.includes(t));
    let meaningfulTagMatches = 0;

    sharedTags.forEach(tid => {
        const t = getTagById(tid);
        if (t) {
            if (t.type === TagType.AI_GENERATED) {
                breakdown.thematic += 20;
                meaningfulTagMatches++;
            } else if (t.type === TagType.QUALITATIVE) {
                breakdown.thematic += 25;
                meaningfulTagMatches++;
            } else if (t.type === TagType.CATEGORICAL) {
                breakdown.thematic += 20;
                meaningfulTagMatches++;
            } else if (t.type === TagType.TECHNICAL) {
                breakdown.thematic += 5;
            } else {
                breakdown.thematic += 2;
            }
        }
    });

    const highThematicCorrelation = meaningfulTagMatches >= 3;

    // 3. VISUAL & CROSS-MODALITY
    if (anchorIsMono) {
        if (targetIsMono) {
            breakdown.visual += 200;
        } else {
            if (isSameDay) breakdown.visual += 150;
            else if (highThematicCorrelation) breakdown.visual += 50;
            else breakdown.visual -= 1000;
        }
    } else {
        if (targetIsMono) {
            if (isSameDay) breakdown.visual += 150;
            else if (highThematicCorrelation) breakdown.visual += 50;
            else breakdown.visual -= 500;
        } else {
            if (isSameDay || highThematicCorrelation) {
                breakdown.visual += 50;
            } else {
                if (colorDist < 1500) breakdown.visual += 200;
                else if (colorDist < 4000) breakdown.visual += 100;
                else if (colorDist < 8000) breakdown.visual += 20;
                else breakdown.visual -= 150;
            }
        }
    }

    // 4. TECHNICAL
    if (node.original.cameraModel === anchorImg.cameraModel && node.original.cameraModel !== 'Unknown Camera') breakdown.technical += 10;
    if (node.original.lensModel === anchorImg.lensModel && node.original.lensModel !== 'Unknown Lens') breakdown.technical += 10;

    breakdown.total = breakdown.temporal + breakdown.thematic + breakdown.visual + breakdown.technical;
    return breakdown;
}

export function scoreAllNodes(
    nodes: ExperienceNode[],
    anchor: AnchorState,
    images: ImageNode[],
    tags: Tag[],
    getTagById: (id: string) => Tag | undefined,
    nsfwFilterActive: boolean,
    nsfwTagId: string | undefined
): { scoredNodes: ExperienceNode[]; activePalette: string[]; commonTags: Tag[] } {
    if (nodes.length === 0) return { scoredNodes: nodes, activePalette: [], commonTags: [] };

    let calculatedPalette: string[] = [];
    let calculatedTags: Tag[] = [];

    // --- A. Scoring Nodes ---
    const scoredNodes = nodes.map(node => {
        // NSFW FILTER CHECK
        if (nsfwFilterActive) {
            const allNodeTagIds = [...node.original.tagIds, ...(node.original.aiTagIds || [])];
            const isNsfw = allNodeTagIds.some(tid => {
                if (tid === nsfwTagId) return true;
                const t = getTagById(tid);
                return t && t.label.trim().toLowerCase() === 'nsfw';
            });
            if (isNsfw) return { ...node, relevanceScore: -9999, isVisible: false };
        }

        let score = 0;
        let scoreBreakdown: ScoreBreakdown | undefined;

        if (anchor.mode === 'IMAGE') {
            if (node.id === anchor.id) {
                score = 10000;
            } else {
                const anchorImg = images.find(i => i.id === anchor.id);
                if (anchorImg) {
                    scoreBreakdown = scoreImageNode(node, anchorImg, tags, getTagById);
                    score = scoreBreakdown.total;
                }
            }
        } else if (anchor.mode === 'TAG') {
            const hasTag = node.original.tagIds.includes(anchor.id) || (node.original.aiTagIds && node.original.aiTagIds.includes(anchor.id));
            if (hasTag) score = 100;
        } else if (anchor.mode === 'COLOR') {
            const minD = node.original.palette.reduce((min, c) => Math.min(min, getColorDistSq(c, anchor.id)), Infinity);
            if (minD < 1500) score = 100;
        } else if (anchor.mode === 'DATE') {
            const anchorTime = parseInt(anchor.id);
            const diff = Math.abs(node.original.captureTimestamp - anchorTime);
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            if (diff < thirtyDaysMs) score = 100 - (diff / thirtyDaysMs) * 50;
        } else if (anchor.mode === 'CAMERA') {
            if (node.original.cameraModel === anchor.id) score = 100;
        } else if (anchor.mode === 'LENS') {
            if (node.original.lensModel === anchor.id) score = 100;
        } else if (anchor.mode === 'SEASON') {
            if (node.original.inferredSeason === anchor.id) score = 100;
        }

        return { ...node, relevanceScore: score, scoreBreakdown };
    });

    // --- B. Determine Visibility & Context ---
    const visibleSubset: ExperienceNode[] = [];

    if (anchor.mode === 'IMAGE') {
        const neighbors = scoredNodes.filter(n => n.id !== anchor.id && n.relevanceScore > 0);
        neighbors.sort((a, b) => b.relevanceScore - a.relevanceScore);

        const visibleCount = Math.min(12, neighbors.length);
        const visibleNeighborIds = new Set(neighbors.slice(0, visibleCount).map(n => n.id));

        scoredNodes.forEach(n => {
            if (n.relevanceScore <= -5000) { n.isVisible = false; return; }

            if (n.id === anchor.id) {
                n.isVisible = true;
            } else if (visibleNeighborIds.has(n.id)) {
                n.isVisible = true;
            } else {
                n.isVisible = false;
            }

            if (n.isVisible) visibleSubset.push(n);
        });

        const anchorImg = images.find(i => i.id === anchor.id);
        calculatedPalette = anchorImg ? anchorImg.palette : [];
        calculatedTags = getRelatedTagsFromNodes(visibleSubset, tags, 6, undefined, nsfwTagId, nsfwFilterActive);

    } else if (['TAG', 'COLOR', 'DATE', 'CAMERA', 'LENS', 'SEASON'].includes(anchor.mode)) {
        scoredNodes.forEach(n => {
            if (n.relevanceScore <= -5000) { n.isVisible = false; return; }
            n.isVisible = n.relevanceScore > 0;
            if (n.isVisible) visibleSubset.push(n);
        });

        if (anchor.mode === 'TAG') {
            calculatedTags = getRelatedTagsFromNodes(visibleSubset, tags, 5, anchor.id, nsfwTagId, nsfwFilterActive);
        } else if (anchor.mode === 'COLOR') {
            const adjacent = getDominantColorsFromNodes(visibleSubset, 5, anchor.id);
            calculatedPalette = [anchor.id, ...adjacent].slice(0, 5);
        } else {
            calculatedTags = getRelatedTagsFromNodes(visibleSubset, tags, 5, undefined, nsfwTagId, nsfwFilterActive);
            calculatedPalette = getDominantColorsFromNodes(visibleSubset, 5);
        }

    } else {
        // NONE mode (Grid)
        scoredNodes.forEach(n => {
            if (n.relevanceScore <= -5000) { n.isVisible = false; return; }
            n.isVisible = true;
        });
    }

    return { scoredNodes, activePalette: calculatedPalette, commonTags: calculatedTags };
}

// --- React hook wrapper ---

export function useRelevanceScoring(
    simNodes: ExperienceNode[],
    setSimNodes: React.Dispatch<React.SetStateAction<ExperienceNode[]>>,
    anchor: AnchorState,
    images: ImageNode[],
    tags: Tag[],
    nsfwFilterActive: boolean,
    nsfwTagId: string | undefined,
    loadingProgress: { current: number; total: number } | null | undefined
): { activePalette: string[]; commonTags: Tag[] } {
    const getTagById = useCallback((id: string) => tags.find(t => t.id === id), [tags]);
    const [activePalette, setActivePalette] = useState<string[]>([]);
    const [commonTags, setCommonTags] = useState<Tag[]>([]);

    useEffect(() => {
        if (loadingProgress) return;

        setSimNodes(prevNodes => {
            const result = scoreAllNodes(
                prevNodes,
                anchor,
                images,
                tags,
                getTagById,
                nsfwFilterActive,
                nsfwTagId
            );

            // Defer state updates to avoid setState-in-setState
            setTimeout(() => {
                setActivePalette(result.activePalette);
                setCommonTags(result.commonTags);
            }, 0);

            return result.scoredNodes;
        });
    }, [anchor, images, tags, getTagById, nsfwFilterActive, nsfwTagId, loadingProgress, setSimNodes]);

    return { activePalette, commonTags };
}
