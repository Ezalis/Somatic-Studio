import React, { useMemo } from 'react';
import { ImageNode } from '../../types';
import { seededRandom } from './flowHelpers';
import MiniSprite from './MiniSprite';

interface IdleFieldProps {
    images: ImageNode[];
    onSelect: (img: ImageNode, rect: DOMRect) => void;
    canvasW: number;
    canvasH: number;
}

const SKELETON_COUNT = 36;

function buildGrid(count: number, canvasW: number, canvasH: number) {
    const cols = Math.ceil(Math.sqrt(count * (canvasW / canvasH)));
    const rows = Math.ceil(count / cols);
    const cellW = canvasW / (cols + 1);
    const cellH = canvasH / (rows + 1);
    return { cols, cellW, cellH, rows };
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

    // Real sprite nodes
    const nodes = useMemo(() => {
        if (!hasImages) return [];
        const count = Math.min(images.length, 36);
        const indices = images.map((_, i) => i);
        for (let i = indices.length - 1; i > 0 && indices.length - 1 - i < count; i--) {
            const j = Math.floor(seededRandom(sessionSeed + i) * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        const sampled = indices.slice(indices.length - count).map(i => images[i]);
        const { cols, cellW, cellH } = buildGrid(count, canvasW, canvasH);
        return sampled.map((img: ImageNode, i: number) => ({
            image: img,
            x: cellW * ((i % cols) + 1) + (seededRandom(img.id + 'ix') - 0.5) * cellW * 0.4,
            y: cellH * (Math.floor(i / cols) + 1) + (seededRandom(img.id + 'iy') - 0.5) * cellH * 0.3,
        }));
    }, [images, canvasW, canvasH, sessionSeed, hasImages]);

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

            {/* Real sprites — fade in */}
            {nodes.map(({ image, x, y }) => {
                const size = 56 + seededRandom(image.id + 'sz') * 20;
                const breatheDur = 5 + seededRandom(image.id + 'bd') * 6;
                const breatheDel = seededRandom(image.id + 'bl') * 4;
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
                    Tap a sprite to begin
                </p>
            </div>
        </div>
    );
};

export default IdleField;
