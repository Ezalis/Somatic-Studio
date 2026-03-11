import React, { useMemo } from 'react';
import { ImageNode } from '../../types';
import { seededRandom } from './flowHelpers';
import { getThumbnailUrl } from '../../services/immichService';
import MiniSprite from './MiniSprite';

interface IdleFieldProps {
    images: ImageNode[];
    onSelect: (img: ImageNode, rect: DOMRect) => void;
    canvasW: number;
    canvasH: number;
}

const SKELETON_COUNT = 36;
const PHOTO_COUNT = 10;
const SPRITE_COUNT = 26;

function buildGrid(count: number, canvasW: number, canvasH: number) {
    const cols = Math.ceil(Math.sqrt(count * (canvasW / canvasH)));
    const rows = Math.ceil(count / cols);
    const cellW = canvasW / (cols + 1);
    const cellH = canvasH / (rows + 1);
    return { cols, cellW, cellH, rows };
}

// Pick images with minimal tag overlap for divergent starting points
function pickDivergent(images: ImageNode[], count: number, seed: string): Set<number> {
    if (images.length <= count) return new Set(images.map((_, i) => i));

    const picked = new Set<number>();
    // Start with a seeded random image
    const first = Math.floor(seededRandom(seed + 'first') * images.length);
    picked.add(first);

    while (picked.size < count) {
        let bestIdx = -1;
        let bestScore = -1;

        // Sample candidates randomly rather than scanning all
        const sampleSize = Math.min(images.length, 30);
        for (let s = 0; s < sampleSize; s++) {
            const idx = Math.floor(seededRandom(seed + 'c' + picked.size + s) * images.length);
            if (picked.has(idx)) continue;

            const candidate = images[idx];
            const candidateTags = new Set([...candidate.tagIds, ...candidate.aiTagIds]);

            // Score: minimum distance to any already-picked image (higher = more divergent)
            let minOverlap = Infinity;
            for (const pi of picked) {
                const pTags = new Set([...images[pi].tagIds, ...images[pi].aiTagIds]);
                let overlap = 0;
                for (const t of candidateTags) if (pTags.has(t)) overlap++;
                // Normalize by union size
                const union = new Set([...candidateTags, ...pTags]).size || 1;
                minOverlap = Math.min(minOverlap, overlap / union);
            }

            const score = 1 - minOverlap;
            if (score > bestScore) {
                bestScore = score;
                bestIdx = idx;
            }
        }

        if (bestIdx >= 0) picked.add(bestIdx);
        else break;
    }

    return picked;
}

const IdleField: React.FC<IdleFieldProps> = ({ images, onSelect, canvasW, canvasH }) => {
    const sessionSeed = useMemo(() => Math.random().toString(36), []);
    const hasImages = images.length > 0;

    // Skeleton grid positions (stable seed so they don't shift)
    const skeletonNodes = useMemo(() => {
        if (hasImages) return [];
        const { cols, cellW, cellH } = buildGrid(SKELETON_COUNT, canvasW, canvasH);
        return Array.from({ length: SKELETON_COUNT }, (_, i) => {
            const seed = `skel${i}`;
            return {
                x: cellW * ((i % cols) + 1) + (seededRandom(seed + 'ix') - 0.5) * cellW * 0.4,
                y: cellH * (Math.floor(i / cols) + 1) + (seededRandom(seed + 'iy') - 0.5) * cellH * 0.3,
                size: 56 + seededRandom(seed + 'sz') * 20,
                delay: seededRandom(seed + 'dl') * 2,
            };
        });
    }, [hasImages, canvasW, canvasH]);

    // Place photos on a sparse grid, then fill sprites in remaining space
    const nodes = useMemo(() => {
        if (!hasImages) return [] as { image: ImageNode; x: number; y: number; isPhoto: boolean }[];

        // Pick divergent images for photos
        const divergentIndices = pickDivergent(images, PHOTO_COUNT, sessionSeed);
        const photoImages = [...divergentIndices].map(i => images[i]);
        const photoIdSet = new Set(photoImages.map(img => img.id));

        // Place photos on their own grid with generous spacing
        const photoGrid = buildGrid(PHOTO_COUNT, canvasW, canvasH);
        const photoNodes = photoImages.map((img, i) => ({
            image: img,
            x: photoGrid.cellW * ((i % photoGrid.cols) + 1) + (seededRandom(img.id + 'px') - 0.5) * photoGrid.cellW * 0.25,
            y: photoGrid.cellH * (Math.floor(i / photoGrid.cols) + 1) + (seededRandom(img.id + 'py') - 0.5) * photoGrid.cellH * 0.2,
            isPhoto: true,
        }));

        // Pick random sprites from remaining images
        const spritePool = images.filter(img => !photoIdSet.has(img.id));
        const spriteCount = Math.min(spritePool.length, SPRITE_COUNT);
        const spriteIndices = spritePool.map((_, i) => i);
        for (let i = spriteIndices.length - 1; i > 0 && spriteIndices.length - 1 - i < spriteCount; i--) {
            const j = Math.floor(seededRandom(sessionSeed + 's' + i) * (i + 1));
            [spriteIndices[i], spriteIndices[j]] = [spriteIndices[j], spriteIndices[i]];
        }
        const sprites = spriteIndices.slice(spriteIndices.length - spriteCount).map(i => spritePool[i]);

        // Place sprites on a denser grid, nudging away from photos
        const totalSprites = sprites.length;
        const spriteGrid = buildGrid(totalSprites, canvasW, canvasH);
        const minDist = Math.min(canvasW, canvasH) * 0.10; // keep sprites this far from photo centers

        const spriteNodes = sprites.map((img, i) => {
            let x = spriteGrid.cellW * ((i % spriteGrid.cols) + 1) + (seededRandom(img.id + 'sx') - 0.5) * spriteGrid.cellW * 0.5;
            let y = spriteGrid.cellH * (Math.floor(i / spriteGrid.cols) + 1) + (seededRandom(img.id + 'sy') - 0.5) * spriteGrid.cellH * 0.4;

            // Push away from nearby photos
            for (const pn of photoNodes) {
                const dx = x - pn.x;
                const dy = y - pn.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist && dist > 0) {
                    const push = (minDist - dist);
                    x += (dx / dist) * push;
                    y += (dy / dist) * push;
                }
            }

            // Clamp to viewport
            x = Math.max(30, Math.min(canvasW - 30, x));
            y = Math.max(30, Math.min(canvasH - 30, y));

            return { image: img, x, y, isPhoto: false };
        });

        return [...photoNodes, ...spriteNodes];
    }, [images, canvasW, canvasH, sessionSeed, hasImages]);

    const isMobile = useMemo(() =>
        typeof window !== 'undefined' && window.innerWidth < 768, []);

    return (
        <div className="fixed inset-0">
            {/* Skeleton circles */}
            {!hasImages && skeletonNodes.map((node, i) => (
                <div key={`sk-${i}`} className="absolute"
                    style={{
                        left: node.x - node.size / 2,
                        top: node.y - node.size / 2,
                        width: node.size,
                        height: node.size,
                        borderRadius: '50%',
                        backgroundColor: '#d4d4d8',
                        animation: `skeleton-pulse 2s ease-in-out ${node.delay}s infinite, drift 8s ease-in-out ${node.delay}s infinite`,
                    }} />
            ))}

            {/* Real nodes — photos or sprites */}
            {nodes.map(({ image, x, y, isPhoto }) => {
                const breatheDur = 5 + seededRandom(image.id + 'bd') * 6;
                const breatheDel = seededRandom(image.id + 'bl') * 4;
                const revealDelay = isPhoto ? seededRandom(image.id + 'rd') * 400 : 0;

                if (isPhoto) {
                    const cardWidth = isMobile
                        ? 90 + seededRandom(image.id + 'cw') * 30
                        : 120 + seededRandom(image.id + 'cw') * 40;
                    const rotate = (seededRandom(image.id + 'rot') - 0.5) * 8;

                    return (
                        <div key={image.id}
                            className="absolute cursor-pointer hover:scale-105 transition-transform duration-300"
                            style={{
                                left: x - cardWidth / 2, top: y - cardWidth / 2,
                                width: cardWidth,
                                opacity: 0,
                                transform: `rotate(${rotate}deg)`,
                                animationName: 'drift, album-reveal',
                                animationDuration: `${breatheDur}s, 600ms`,
                                animationDelay: `${breatheDel}s, ${revealDelay}ms`,
                                animationIterationCount: 'infinite, 1',
                                animationFillMode: 'none, forwards',
                                animationTimingFunction: 'ease-in-out, ease-out',
                            }}
                            onClick={(e) => {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                onSelect(image, rect);
                            }}>
                            <div className="bg-white p-1.5 rounded shadow-md"
                                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)' }}>
                                <img src={getThumbnailUrl(image.id)} alt=""
                                    className="w-full rounded-sm"
                                    draggable={false} />
                            </div>
                        </div>
                    );
                }

                // Sprite node
                const size = 56 + seededRandom(image.id + 'sz') * 20;
                return (
                    <div key={image.id}
                        className="absolute cursor-pointer hover:scale-110 transition-transform duration-300"
                        style={{
                            left: x - size / 2, top: y - size / 2,
                            animation: `drift ${breatheDur}s ease-in-out ${breatheDel}s infinite`,
                            opacity: 0,
                            animationName: 'drift, album-reveal',
                            animationDuration: `${breatheDur}s, 600ms`,
                            animationDelay: `${breatheDel}s, 0ms`,
                            animationIterationCount: 'infinite, 1',
                            animationFillMode: 'none, forwards',
                            animationTimingFunction: 'ease-in-out, ease-out',
                        }}
                        onClick={(e) => {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            onSelect(image, rect);
                        }}>
                        <MiniSprite image={image} size={size} />
                    </div>
                );
            })}
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-40 text-center">
                <p className="text-zinc-400 text-sm" style={{
                    fontFamily: 'Caveat, cursive',
                    opacity: hasImages ? 1 : 0,
                    transition: 'opacity 600ms ease',
                }}>
                    Tap to begin
                </p>
            </div>
        </div>
    );
};

export default IdleField;
