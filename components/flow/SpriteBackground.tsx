import React, { useRef, useEffect, useState, useMemo } from 'react';
import { ImageNode } from '../../types';
import MiniSprite from './MiniSprite';
import { seededRandom } from './flowHelpers';

interface SpriteBackgroundProps {
    images: ImageNode[];
    count: number;
}

interface SpriteState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
}

const SpriteBackground: React.FC<SpriteBackgroundProps> = ({ images, count }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const spriteRefs = useRef<(HTMLDivElement | null)[]>([]);
    const statesRef = useRef<SpriteState[]>([]);
    const rafRef = useRef<number>(0);
    const [visible, setVisible] = useState(false);

    const visibleImages = useMemo(() => images.slice(0, count), [images, count]);

    // Initialize sprite states when count changes
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const w = el.clientWidth;
        const h = el.clientHeight;

        // Grow or shrink the states array
        while (statesRef.current.length < count) {
            const i = statesRef.current.length;
            const img = images[i];
            if (!img) break;
            const r = seededRandom(img.id + 'bg');
            const r2 = seededRandom(img.id + 'bg2');
            statesRef.current.push({
                x: r * w,
                y: r2 * h,
                vx: (seededRandom(img.id + 'vx') - 0.5) * 0.5,
                vy: (seededRandom(img.id + 'vy') - 0.5) * 0.5,
                size: 30 + seededRandom(img.id + 'bgsz') * 20,
            });
        }
        statesRef.current.length = Math.min(statesRef.current.length, count);

        setVisible(true);
    }, [count, images]);

    // Animation loop
    useEffect(() => {
        if (count === 0) return;

        const animate = () => {
            const el = containerRef.current;
            if (!el) { rafRef.current = requestAnimationFrame(animate); return; }
            const w = el.clientWidth;
            const h = el.clientHeight;
            const cx = w / 2;
            const cy = h / 2;

            for (let i = 0; i < statesRef.current.length; i++) {
                const s = statesRef.current[i];
                const dx = cx - s.x;
                const dy = cy - s.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                // Gentle gravity toward center
                s.vx += dx * 0.003;
                s.vy += dy * 0.003;

                // Tangential push for orbit
                s.vx += (-dy / dist) * 0.15;
                s.vy += (dx / dist) * 0.15;

                // Damping
                s.vx *= 0.99;
                s.vy *= 0.99;

                s.x += s.vx;
                s.y += s.vy;

                // Wrap around edges
                if (s.x < -50) s.x = w + 50;
                if (s.x > w + 50) s.x = -50;
                if (s.y < -50) s.y = h + 50;
                if (s.y > h + 50) s.y = -50;

                const ref = spriteRefs.current[i];
                if (ref) {
                    ref.style.transform = `translate(${s.x}px, ${s.y}px)`;
                }
            }

            rafRef.current = requestAnimationFrame(animate);
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    }, [count]);

    if (count === 0) return null;

    return (
        <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden"
            style={{ zIndex: 1 }}>
            {visibleImages.map((img, i) => (
                <div key={img.id}
                    ref={el => { spriteRefs.current[i] = el; }}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        opacity: visible ? 0.5 : 0,
                        transition: 'opacity 800ms ease',
                    }}>
                    <MiniSprite image={img} size={statesRef.current[i]?.size ?? 40} />
                </div>
            ))}
        </div>
    );
};

export default SpriteBackground;
