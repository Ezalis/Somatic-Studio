import { describe, it, expect } from 'vitest';
import { scoreImageNode, scoreAllNodes } from '../useRelevanceScoring';
import { ImageNode, Tag, TagType, ExperienceNode, AnchorState } from '../../types';
import { classifyRing, computeGlyphContext, computeDepthLayer, RING_COLORS } from '../../services/dataService';

// --- Test helpers ---

function makeImage(overrides: Partial<ImageNode> = {}): ImageNode {
    return {
        id: overrides.id || 'img-1',
        fileUrl: '',
        fileName: 'test.jpg',
        captureTimestamp: overrides.captureTimestamp ?? Date.now(),
        inferredSeason: overrides.inferredSeason || 'Summer',
        shootDayClusterId: '2024-06-01',
        cameraModel: overrides.cameraModel || 'Canon R5',
        lensModel: overrides.lensModel || 'RF 50mm',
        aperture: 'f/1.8',
        shutterSpeed: '1/200',
        iso: 400,
        tagIds: overrides.tagIds || [],
        aiTagIds: overrides.aiTagIds || [],
        palette: overrides.palette || ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'],
        ...overrides,
    };
}

function makeNode(image: ImageNode, overrides: Partial<ExperienceNode> = {}): ExperienceNode {
    return {
        id: image.id,
        original: image,
        x: 0,
        y: 0,
        currentScale: 1,
        targetScale: 1,
        currentOpacity: 1,
        targetOpacity: 1,
        relevanceScore: 0,
        isVisible: true,
        ...overrides,
    };
}

function makeTag(id: string, label: string, type: TagType = TagType.AI_GENERATED): Tag {
    return { id, label, type };
}

function getTagById(tags: Tag[]) {
    return (id: string) => tags.find(t => t.id === id);
}

// --- Tests ---

describe('scoreImageNode', () => {
    const baseTime = new Date('2024-06-15T12:00:00Z').getTime();

    it('gives +500 temporal bonus for same-day images', () => {
        const anchorImg = makeImage({ captureTimestamp: baseTime });
        const targetImg = makeImage({ id: 'img-2', captureTimestamp: baseTime + 3600000 }); // +1 hour
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, [], getTagById([]));
        expect(result.temporal).toBeGreaterThanOrEqual(500);
    });

    it('gives +100 temporal bonus for near-date (within 3 days) but not same day', () => {
        const anchorImg = makeImage({ captureTimestamp: baseTime, inferredSeason: 'Summer' });
        const targetImg = makeImage({ id: 'img-2', captureTimestamp: baseTime + 2 * 86400000, inferredSeason: 'Winter' }); // +2 days, different season
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, [], getTagById([]));
        expect(result.temporal).toBe(100);
    });

    it('gives +20 temporal bonus for same season', () => {
        const anchorImg = makeImage({ captureTimestamp: baseTime, inferredSeason: 'Summer' });
        const targetImg = makeImage({ id: 'img-2', captureTimestamp: baseTime + 30 * 86400000, inferredSeason: 'Summer' }); // far date, same season
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, [], getTagById([]));
        expect(result.temporal).toBe(20);
    });

    it('scores +20 thematic for shared AI tag', () => {
        const tags = [makeTag('t1', 'Portrait', TagType.AI_GENERATED)];
        const anchorImg = makeImage({ aiTagIds: ['t1'] });
        const targetImg = makeImage({ id: 'img-2', aiTagIds: ['t1'], captureTimestamp: 0 });
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, tags, getTagById(tags));
        expect(result.thematic).toBe(20);
    });

    it('scores +25 thematic for shared qualitative tag', () => {
        const tags = [makeTag('t1', 'Moody', TagType.QUALITATIVE)];
        const anchorImg = makeImage({ tagIds: ['t1'] });
        const targetImg = makeImage({ id: 'img-2', tagIds: ['t1'], captureTimestamp: 0 });
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, tags, getTagById(tags));
        expect(result.thematic).toBe(25);
    });

    it('applies -1000 visual penalty when anchor is mono and target is not (far apart, low thematic)', () => {
        const tags = [makeTag('bw', 'Black & White', TagType.QUALITATIVE)];
        const anchorImg = makeImage({ tagIds: ['bw'], captureTimestamp: 0 });
        const targetImg = makeImage({ id: 'img-2', tagIds: [], captureTimestamp: 30 * 86400000 });
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, tags, getTagById(tags));
        expect(result.visual).toBe(-1000);
    });

    it('gives +200 visual bonus when both are monochrome', () => {
        const tags = [makeTag('bw', 'Monochrome', TagType.QUALITATIVE)];
        const anchorImg = makeImage({ tagIds: ['bw'], captureTimestamp: 0 });
        const targetImg = makeImage({ id: 'img-2', tagIds: ['bw'], captureTimestamp: 30 * 86400000 });
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, tags, getTagById(tags));
        expect(result.visual).toBe(200);
    });

    it('gives +200 visual for close color distance (<1500)', () => {
        // Two images with similar palettes (same colors)
        const palette = ['#ff0000', '#ff1100', '#ff2200', '#ff3300', '#ff4400'];
        const anchorImg = makeImage({ palette, captureTimestamp: 0 });
        const targetImg = makeImage({ id: 'img-2', palette, captureTimestamp: 30 * 86400000 });
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, [], getTagById([]));
        expect(result.visual).toBe(200);
    });

    it('applies -150 visual penalty for very distant colors (>8000)', () => {
        // Completely opposite palettes
        const anchorImg = makeImage({ palette: ['#000000', '#111111', '#222222', '#333333', '#444444'], captureTimestamp: 0 });
        const targetImg = makeImage({ id: 'img-2', palette: ['#ffffff', '#eeeeff', '#ddddff', '#ccccff', '#bbbbff'], captureTimestamp: 30 * 86400000 });
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, [], getTagById([]));
        expect(result.visual).toBe(-150);
    });

    it('gives +10 technical for matching camera model', () => {
        const anchorImg = makeImage({ cameraModel: 'Canon R5', captureTimestamp: 0 });
        const targetImg = makeImage({ id: 'img-2', cameraModel: 'Canon R5', captureTimestamp: 30 * 86400000 });
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, [], getTagById([]));
        expect(result.technical).toBe(20); // +10 camera + +10 lens (both default to same)
    });

    it('gives 0 technical for "Unknown Camera"', () => {
        const anchorImg = makeImage({ cameraModel: 'Unknown Camera', lensModel: 'Unknown Lens', captureTimestamp: 0 });
        const targetImg = makeImage({ id: 'img-2', cameraModel: 'Unknown Camera', lensModel: 'Unknown Lens', captureTimestamp: 30 * 86400000 });
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, [], getTagById([]));
        expect(result.technical).toBe(0);
    });

    it('total equals sum of all dimensions', () => {
        const tags = [makeTag('t1', 'Portrait', TagType.AI_GENERATED)];
        const anchorImg = makeImage({ aiTagIds: ['t1'], captureTimestamp: baseTime });
        const targetImg = makeImage({ id: 'img-2', aiTagIds: ['t1'], captureTimestamp: baseTime + 3600000 });
        const node = makeNode(targetImg);

        const result = scoreImageNode(node, anchorImg, tags, getTagById(tags));
        expect(result.total).toBe(result.temporal + result.thematic + result.visual + result.technical);
    });
});

describe('scoreAllNodes — TAG mode', () => {
    it('scores 100 for nodes with matching tag, 0 for others', () => {
        const tags = [makeTag('t1', 'Portrait')];
        const img1 = makeImage({ id: 'img-1', tagIds: ['t1'] });
        const img2 = makeImage({ id: 'img-2', tagIds: [] });
        const nodes = [makeNode(img1), makeNode(img2)];
        const anchor: AnchorState = { mode: 'TAG', id: 't1', meta: tags[0] };

        const { scoredNodes } = scoreAllNodes(nodes, anchor, [img1, img2], tags, getTagById(tags), false, undefined);
        expect(scoredNodes.find(n => n.id === 'img-1')?.relevanceScore).toBe(100);
        expect(scoredNodes.find(n => n.id === 'img-2')?.relevanceScore).toBe(0);
    });

    it('makes tagged nodes visible and untagged invisible', () => {
        const tags = [makeTag('t1', 'Portrait')];
        const img1 = makeImage({ id: 'img-1', tagIds: ['t1'] });
        const img2 = makeImage({ id: 'img-2', tagIds: [] });
        const nodes = [makeNode(img1), makeNode(img2)];
        const anchor: AnchorState = { mode: 'TAG', id: 't1', meta: tags[0] };

        const { scoredNodes } = scoreAllNodes(nodes, anchor, [img1, img2], tags, getTagById(tags), false, undefined);
        expect(scoredNodes.find(n => n.id === 'img-1')?.isVisible).toBe(true);
        expect(scoredNodes.find(n => n.id === 'img-2')?.isVisible).toBe(false);
    });

    it('matches aiTagIds as well as tagIds', () => {
        const tags = [makeTag('t1', 'Portrait')];
        const img1 = makeImage({ id: 'img-1', aiTagIds: ['t1'] });
        const nodes = [makeNode(img1)];
        const anchor: AnchorState = { mode: 'TAG', id: 't1', meta: tags[0] };

        const { scoredNodes } = scoreAllNodes(nodes, anchor, [img1], tags, getTagById(tags), false, undefined);
        expect(scoredNodes.find(n => n.id === 'img-1')?.relevanceScore).toBe(100);
    });
});

describe('scoreAllNodes — COLOR mode', () => {
    it('scores 100 for nodes with close color distance', () => {
        const img1 = makeImage({ id: 'img-1', palette: ['#ff0000', '#ff1100', '#ff2200', '#ff3300', '#ff4400'] });
        const nodes = [makeNode(img1)];
        const anchor: AnchorState = { mode: 'COLOR', id: '#ff0000' };

        const { scoredNodes } = scoreAllNodes(nodes, anchor, [img1], [], getTagById([]), false, undefined);
        expect(scoredNodes[0].relevanceScore).toBe(100);
    });

    it('scores 0 for nodes with distant colors', () => {
        const img1 = makeImage({ id: 'img-1', palette: ['#0000ff', '#0011ff', '#0022ff', '#0033ff', '#0044ff'] });
        const nodes = [makeNode(img1)];
        const anchor: AnchorState = { mode: 'COLOR', id: '#ff0000' };

        const { scoredNodes } = scoreAllNodes(nodes, anchor, [img1], [], getTagById([]), false, undefined);
        expect(scoredNodes[0].relevanceScore).toBe(0);
    });
});

describe('scoreAllNodes — IMAGE mode', () => {
    it('gives anchor node score 10000', () => {
        const img = makeImage({ id: 'anchor-img' });
        const nodes = [makeNode(img)];
        const anchor: AnchorState = { mode: 'IMAGE', id: 'anchor-img' };

        const { scoredNodes } = scoreAllNodes(nodes, anchor, [img], [], getTagById([]), false, undefined);
        expect(scoredNodes[0].relevanceScore).toBe(10000);
    });

    it('limits visible neighbors to 18', () => {
        const anchorImg = makeImage({ id: 'anchor', captureTimestamp: 1000 });
        const images: ImageNode[] = [anchorImg];
        const nodes: ExperienceNode[] = [makeNode(anchorImg)];

        // Create 25 neighbors with positive scores (same day)
        for (let i = 0; i < 25; i++) {
            const img = makeImage({ id: `img-${i}`, captureTimestamp: 1000 + i * 1000 });
            images.push(img);
            nodes.push(makeNode(img));
        }

        const anchor: AnchorState = { mode: 'IMAGE', id: 'anchor' };
        const { scoredNodes } = scoreAllNodes(nodes, anchor, images, [], getTagById([]), false, undefined);

        const visibleNeighbors = scoredNodes.filter(n => n.isVisible && n.id !== 'anchor');
        expect(visibleNeighbors.length).toBe(18);
    });
});

describe('scoreAllNodes — NSFW filter', () => {
    it('hides NSFW-tagged nodes when filter is active', () => {
        const tags = [makeTag('nsfw-tag', 'nsfw', TagType.CATEGORICAL)];
        const img1 = makeImage({ id: 'img-1', tagIds: ['nsfw-tag'] });
        const img2 = makeImage({ id: 'img-2', tagIds: [] });
        const nodes = [makeNode(img1), makeNode(img2)];
        const anchor: AnchorState = { mode: 'NONE', id: '' };

        const { scoredNodes } = scoreAllNodes(nodes, anchor, [img1, img2], tags, getTagById(tags), true, 'nsfw-tag');
        expect(scoredNodes.find(n => n.id === 'img-1')?.isVisible).toBe(false);
        expect(scoredNodes.find(n => n.id === 'img-1')?.relevanceScore).toBe(-9999);
    });

    it('shows NSFW-tagged nodes when filter is inactive', () => {
        const tags = [makeTag('nsfw-tag', 'nsfw', TagType.CATEGORICAL)];
        const img1 = makeImage({ id: 'img-1', tagIds: ['nsfw-tag'] });
        const nodes = [makeNode(img1)];
        const anchor: AnchorState = { mode: 'NONE', id: '' };

        const { scoredNodes } = scoreAllNodes(nodes, anchor, [img1], tags, getTagById(tags), false, undefined);
        expect(scoredNodes.find(n => n.id === 'img-1')?.isVisible).toBe(true);
    });
});

describe('scoreAllNodes — NONE mode', () => {
    it('makes all non-NSFW nodes visible', () => {
        const img1 = makeImage({ id: 'img-1' });
        const img2 = makeImage({ id: 'img-2' });
        const nodes = [makeNode(img1), makeNode(img2)];
        const anchor: AnchorState = { mode: 'NONE', id: '' };

        const { scoredNodes } = scoreAllNodes(nodes, anchor, [img1, img2], [], getTagById([]), false, undefined);
        expect(scoredNodes.every(n => n.isVisible)).toBe(true);
    });

    it('returns empty palette and tags', () => {
        const img1 = makeImage({ id: 'img-1' });
        const nodes = [makeNode(img1)];
        const anchor: AnchorState = { mode: 'NONE', id: '' };

        const { activePalette, commonTags } = scoreAllNodes(nodes, anchor, [img1], [], getTagById([]), false, undefined);
        expect(activePalette).toEqual([]);
        expect(commonTags).toEqual([]);
    });
});

// --- Ring Classification Tests ---

describe('classifyRing', () => {
    const baseTime = new Date('2024-06-15T12:00:00Z').getTime();

    it('assigns session ring for same-day images', () => {
        const anchorImg = makeImage({ captureTimestamp: baseTime });
        const neighborImg = makeImage({ id: 'img-2', captureTimestamp: baseTime + 3600000 }); // +1 hour
        const breakdown = { total: 520, temporal: 500, thematic: 0, visual: 20, technical: 0 };

        const profile = classifyRing(breakdown, anchorImg, neighborImg);
        expect(profile.ring).toBe('session');
        expect(profile.isSameDay).toBe(true);
        expect(profile.dominantDimension).toBe('temporal');
    });

    it('assigns thematic ring when thematic score is dominant and significant', () => {
        const anchorImg = makeImage({ captureTimestamp: baseTime });
        const neighborImg = makeImage({ id: 'img-2', captureTimestamp: baseTime + 7 * 86400000 }); // 7 days apart
        const breakdown = { total: 90, temporal: 20, thematic: 60, visual: 10, technical: 0 };

        const profile = classifyRing(breakdown, anchorImg, neighborImg);
        expect(profile.ring).toBe('thematic');
        expect(profile.dominantDimension).toBe('thematic');
        expect(profile.isSameDay).toBe(false);
    });

    it('assigns visual ring when visual score is dominant', () => {
        const anchorImg = makeImage({ captureTimestamp: baseTime });
        const neighborImg = makeImage({ id: 'img-2', captureTimestamp: baseTime + 30 * 86400000 });
        const breakdown = { total: 220, temporal: 0, thematic: 10, visual: 200, technical: 10 };

        const profile = classifyRing(breakdown, anchorImg, neighborImg);
        expect(profile.ring).toBe('visual');
        expect(profile.dominantDimension).toBe('visual');
    });

    it('assigns technical ring when lens match is strongest', () => {
        const anchorImg = makeImage({ captureTimestamp: baseTime });
        const neighborImg = makeImage({ id: 'img-2', captureTimestamp: baseTime + 60 * 86400000 });
        // Technical max is 20, so 10/20 = 0.5 (above threshold)
        // thematic and visual are below threshold
        const breakdown = { total: 15, temporal: 0, thematic: 5, visual: 0, technical: 10 };

        const profile = classifyRing(breakdown, anchorImg, neighborImg);
        expect(profile.ring).toBe('technical');
        expect(profile.dominantDimension).toBe('technical');
    });

    it('assigns gateway when no dimension exceeds significance threshold', () => {
        const anchorImg = makeImage({ captureTimestamp: baseTime });
        const neighborImg = makeImage({ id: 'img-2', captureTimestamp: baseTime + 60 * 86400000 });
        // All dimensions well below 20% of their max
        const breakdown = { total: 5, temporal: 0, thematic: 2, visual: 2, technical: 1 };

        const profile = classifyRing(breakdown, anchorImg, neighborImg);
        expect(profile.ring).toBe('gateway');
        expect(profile.dominantDimension).toBeNull();
    });

    it('same-day always wins over other dimensions', () => {
        const anchorImg = makeImage({ captureTimestamp: baseTime });
        const neighborImg = makeImage({ id: 'img-2', captureTimestamp: baseTime + 1000 }); // same day
        // Even with high thematic score, same-day takes priority
        const breakdown = { total: 620, temporal: 500, thematic: 100, visual: 10, technical: 10 };

        const profile = classifyRing(breakdown, anchorImg, neighborImg);
        expect(profile.ring).toBe('session');
    });

    it('normalizes scores to [0,1] range', () => {
        const anchorImg = makeImage({ captureTimestamp: baseTime });
        const neighborImg = makeImage({ id: 'img-2', captureTimestamp: baseTime + 60 * 86400000 });
        const breakdown = { total: 370, temporal: 0, thematic: 150, visual: 200, technical: 20 };

        const profile = classifyRing(breakdown, anchorImg, neighborImg);
        expect(profile.normalizedScores.thematic).toBe(1);
        expect(profile.normalizedScores.visual).toBe(1);
        expect(profile.normalizedScores.technical).toBe(1);
        expect(profile.normalizedScores.temporal).toBe(0);
    });
});

describe('computeGlyphContext', () => {
    const baseTime = new Date('2024-06-15T12:00:00Z').getTime();

    it('produces affinity color as blend of two palettes', () => {
        const anchorImg = makeImage({ palette: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'] });
        const neighborImg = makeImage({ id: 'img-2', palette: ['#0000ff', '#00ff00', '#ff0000', '#00ffff', '#ff00ff'] });
        const breakdown = { total: 200, temporal: 0, thematic: 100, visual: 100, technical: 0 };
        const profile = classifyRing(breakdown, anchorImg, neighborImg);

        const ctx = computeGlyphContext(anchorImg, neighborImg, breakdown, profile);
        // #ff0000 + #0000ff → average = #800080
        expect(ctx.affinityColor).toBe('#800080');
    });

    it('uses ring-specific halo color', () => {
        const anchorImg = makeImage({ captureTimestamp: baseTime });
        const neighborImg = makeImage({ id: 'img-2', captureTimestamp: baseTime + 1000 });
        const breakdown = { total: 520, temporal: 500, thematic: 0, visual: 20, technical: 0 };
        const profile = classifyRing(breakdown, anchorImg, neighborImg);

        const ctx = computeGlyphContext(anchorImg, neighborImg, breakdown, profile);
        expect(ctx.haloColor).toBe(RING_COLORS.session);
        expect(ctx.shapeKey).toBe('session');
    });

    it('clamps haloIntensity to [0,1]', () => {
        const anchorImg = makeImage();
        const neighborImg = makeImage({ id: 'img-2' });

        const highBreakdown = { total: 1600, temporal: 500, thematic: 150, visual: 200, technical: 20 };
        const profile = classifyRing(highBreakdown, anchorImg, neighborImg);
        const ctx = computeGlyphContext(anchorImg, neighborImg, highBreakdown, profile);
        expect(ctx.haloIntensity).toBeLessThanOrEqual(1);
        expect(ctx.haloIntensity).toBeGreaterThanOrEqual(0);

        const zeroBreakdown = { total: 0, temporal: 0, thematic: 0, visual: 0, technical: 0 };
        const profile2 = classifyRing(zeroBreakdown, anchorImg, neighborImg);
        const ctx2 = computeGlyphContext(anchorImg, neighborImg, zeroBreakdown, profile2);
        expect(ctx2.haloIntensity).toBe(0);
    });

    it('relevanceScale ranges from 0.4 to 1.0', () => {
        const anchorImg = makeImage();
        const neighborImg = makeImage({ id: 'img-2' });

        const zeroBreakdown = { total: 0, temporal: 0, thematic: 0, visual: 0, technical: 0 };
        const profile0 = classifyRing(zeroBreakdown, anchorImg, neighborImg);
        const ctx0 = computeGlyphContext(anchorImg, neighborImg, zeroBreakdown, profile0);
        expect(ctx0.relevanceScale).toBe(0.4);

        const highBreakdown = { total: 800, temporal: 500, thematic: 100, visual: 100, technical: 100 };
        const profileHigh = classifyRing(highBreakdown, anchorImg, neighborImg);
        const ctxHigh = computeGlyphContext(anchorImg, neighborImg, highBreakdown, profileHigh);
        expect(ctxHigh.relevanceScale).toBe(1.0);
    });
});

describe('computeDepthLayer', () => {
    it('session ring has no blur and full opacity', () => {
        const layer = computeDepthLayer('session');
        expect(layer.blur).toBe(0);
        expect(layer.opacity).toBe(1.0);
        expect(layer.z).toBe(0);
        expect(layer.parallaxFactor).toBe(0.2);
    });

    it('gateway ring has maximum blur and reduced opacity', () => {
        const layer = computeDepthLayer('gateway');
        expect(layer.blur).toBe(2.0);
        expect(layer.opacity).toBe(0.6);
        expect(layer.z).toBe(-200);
        expect(layer.parallaxFactor).toBe(0.85);
    });

    it('depth increases monotonically from session to gateway', () => {
        const rings: ('session' | 'thematic' | 'visual' | 'technical' | 'gateway')[] =
            ['session', 'thematic', 'visual', 'technical', 'gateway'];
        const layers = rings.map(r => computeDepthLayer(r));

        for (let i = 1; i < layers.length; i++) {
            expect(layers[i].z).toBeLessThan(layers[i - 1].z);
            expect(layers[i].blur).toBeGreaterThanOrEqual(layers[i - 1].blur);
            expect(layers[i].opacity).toBeLessThanOrEqual(layers[i - 1].opacity);
            expect(layers[i].parallaxFactor).toBeGreaterThan(layers[i - 1].parallaxFactor);
        }
    });
});
