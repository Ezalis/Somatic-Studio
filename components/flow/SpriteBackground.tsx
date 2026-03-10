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
        return visibleImages.map(img => ({
            x: seededRandom(img.id + 'bgx') * 90 + 5,    // 5-95% spread
            y: seededRandom(img.id + 'bgy') * 80 + 10,    // 10-90%
            size: 30 + seededRandom(img.id + 'bgsz') * 20,
            driftDuration: 8 + seededRandom(img.id + 'bgd') * 10,
            driftDelay: seededRandom(img.id + 'bgdl') * 5,
        }));
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
