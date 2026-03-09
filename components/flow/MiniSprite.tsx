import React, { useEffect } from 'react';
import { ImageNode } from '../../types';

interface MiniSpriteProps {
    image: ImageNode;
    size: number;
    convergence?: number;
    blooming?: boolean;
    onBloomComplete?: () => void;
}

const MiniSprite: React.FC<MiniSpriteProps> = React.memo(({ image, size, convergence, blooming, onBloomComplete }) => {
    useEffect(() => {
        if (blooming && onBloomComplete) {
            const timer = setTimeout(onBloomComplete, 900);
            return () => clearTimeout(timer);
        }
    }, [blooming, onBloomComplete]);

    const palette = image.palette.length > 0 ? image.palette : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];
    const seed = (() => {
        let h = 0;
        for (let i = 0; i < image.id.length; i++) h = ((h << 5) - h) + image.id.charCodeAt(i) | 0;
        return Math.abs(h);
    })();
    const ringOpacity = convergence != null ? 0.2 + convergence * 0.4 : 0;

    return (
        <svg viewBox="0 0 100 100" width={size} height={size} className="overflow-visible" shapeRendering="geometricPrecision">
            {palette.slice(1, 4).map((color: string, i: number) => {
                const angle = (seed + i * 73) % 360;
                const dist = 8 + (seed % 12);
                const rx = 18 + ((seed + i) % 14);
                const ry = 18 + ((seed * (i + 1)) % 14);
                const tx = 50 + dist * Math.cos(angle * Math.PI / 180);
                const ty = 50 + dist * Math.sin(angle * Math.PI / 180);

                const bloomDx = blooming ? Math.cos(angle * Math.PI / 180) * 60 : 0;
                const bloomDy = blooming ? Math.sin(angle * Math.PI / 180) * 60 : 0;
                const bloomScale = blooming ? 3 : 1;
                const bloomOpacity = blooming ? 0 : 0.55;
                const delay = i * 100;

                return (
                    <ellipse key={i} cx={tx} cy={ty} rx={rx} ry={ry} fill={color} fillOpacity={bloomOpacity}
                        transform={`rotate(${(seed * (i + 1)) % 360}, ${tx}, ${ty})`}
                        style={{
                            transform: `translate(${bloomDx}px, ${bloomDy}px) scale(${bloomScale})`,
                            transformOrigin: `${tx}px ${ty}px`,
                            transition: `all 600ms cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms`,
                            fillOpacity: bloomOpacity,
                        }} />
                );
            })}
            <circle cx="50" cy="50" r={16} fill={palette[0]}
                style={{
                    opacity: blooming ? 0 : 0.85,
                    transform: blooming ? 'scale(4)' : 'scale(1)',
                    transformOrigin: '50px 50px',
                    transition: 'all 600ms cubic-bezier(0.4, 0, 0.2, 1) 300ms',
                }} />
            {convergence != null && !blooming && (
                <circle cx="50" cy="50" r={22} fill="none" stroke={palette[0]}
                    strokeWidth={convergence > 0.5 ? 1.2 : 0.8}
                    strokeDasharray={convergence < 0.3 ? '3,3' : 'none'} opacity={ringOpacity} />
            )}
        </svg>
    );
});

export default MiniSprite;
