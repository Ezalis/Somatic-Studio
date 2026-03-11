import React, { useState, useEffect } from 'react';
import { ImageNode } from '../../types';
import MiniSprite from './MiniSprite';

interface BloomOverlayProps {
    image: ImageNode;
    sourceRect: DOMRect;
    onComplete: () => void;
}

const BloomOverlay: React.FC<BloomOverlayProps> = ({ image, sourceRect, onComplete }) => {
    const [phase, setPhase] = useState<'start' | 'centering' | 'blooming' | 'fading'>('start');

    // start → centering (next frame, so CSS sees initial position first)
    useEffect(() => {
        const raf = requestAnimationFrame(() => {
            requestAnimationFrame(() => setPhase('centering'));
        });
        return () => cancelAnimationFrame(raf);
    }, []);

    // centering → blooming (after sprite arrives at center)
    useEffect(() => {
        if (phase === 'centering') {
            const timer = setTimeout(() => setPhase('blooming'), 450);
            return () => clearTimeout(timer);
        }
    }, [phase]);

    // blooming → fading (after bloom scatter completes)
    useEffect(() => {
        if (phase === 'blooming') {
            const timer = setTimeout(() => setPhase('fading'), 900);
            return () => clearTimeout(timer);
        }
    }, [phase]);

    // fading → complete (after overlay fades out)
    useEffect(() => {
        if (phase === 'fading') {
            const timer = setTimeout(onComplete, 500);
            return () => clearTimeout(timer);
        }
    }, [phase, onComplete]);

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Account for header (pt-12 = 48px)
    const headerOffset = 48;
    const centerY = (vh + headerOffset) / 2;

    // Sprite position: starts at clicked element center, moves to viewport center
    const isAtSource = phase === 'start';
    const spriteSize = isAtSource ? sourceRect.width : 200;
    const cx = isAtSource ? sourceRect.left + sourceRect.width / 2 : vw / 2;
    const cy = isAtSource ? sourceRect.top + sourceRect.height / 2 : centerY;

    return (
        <div className="fixed inset-0 z-[100]" style={{
            backgroundColor: phase === 'fading' ? 'transparent' : (phase === 'blooming' ? '#faf9f6cc' : 'transparent'),
            transition: 'background-color 500ms ease',
            pointerEvents: phase === 'fading' ? 'none' : 'auto',
        }}>
            {/* Sprite: moves to center, then blooms apart */}
            <div style={{
                position: 'absolute',
                left: cx - spriteSize / 2,
                top: cy - spriteSize / 2,
                width: spriteSize,
                height: spriteSize,
                transition: 'all 450ms cubic-bezier(0.22, 1, 0.36, 1)',
                opacity: phase === 'fading' ? 0 : 1,
            }}>
                <MiniSprite image={image} size={spriteSize}
                    blooming={phase === 'blooming' || phase === 'fading'} />
            </div>
        </div>
    );
};

export default BloomOverlay;
