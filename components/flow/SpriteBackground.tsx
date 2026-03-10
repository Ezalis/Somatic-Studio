import React, { useMemo } from 'react';
import { ImageNode } from '../../types';
import MiniSprite from './MiniSprite';
import { seededRandom } from './flowHelpers';

interface SpriteBackgroundProps {
    images: ImageNode[];
    count: number;
}

const SpriteBackground: React.FC<SpriteBackgroundProps> = ({ images, count }) => {
    const visibleImages = useMemo(() => images.slice(0, count), [images, count]);

    const positions = useMemo(() => {
        // Use grid-jitter: divide viewport into cells, place one sprite per cell with random offset
        const cols = Math.max(3, Math.ceil(Math.sqrt(visibleImages.length * 1.5)));
        const rows = Math.max(2, Math.ceil(visibleImages.length / cols));
        const cellW = 90 / cols;  // 5-95% range
        const cellH = 70 / rows;  // 15-85% range

        return visibleImages.map((img, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const jitterX = (seededRandom('sprX' + i + img.id.slice(0, 8)) - 0.5) * cellW * 0.7;
            const jitterY = (seededRandom('sprY' + i + img.id.slice(-8)) - 0.5) * cellH * 0.7;
            return {
                x: 5 + (col + 0.5) * cellW + jitterX,
                y: 15 + (row + 0.5) * cellH + jitterY,
                size: 30 + seededRandom('sprS' + i + img.id.slice(4, 12)) * 20,
                driftDuration: 8 + seededRandom('sprD' + i) * 10,
                driftDelay: seededRandom('sprDL' + i) * 5,
            };
        });
    }, [visibleImages]);

    if (count === 0) return null;

    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden"
            style={{ zIndex: 11 }}>
            {visibleImages.map((img, i) => (
                <div key={img.id}
                    className="absolute"
                    style={{
                        left: `${positions[i].x}%`,
                        top: `${positions[i].y}%`,
                        opacity: 0.4,
                        animation: `gentle-unveil 800ms cubic-bezier(0.22,1,0.36,1) ${i * 100}ms both,
                                    drift ${positions[i].driftDuration}s ease-in-out ${positions[i].driftDelay}s infinite`,
                    }}>
                    <MiniSprite image={img} size={positions[i].size} />
                </div>
            ))}
        </div>
    );
};

export default SpriteBackground;
