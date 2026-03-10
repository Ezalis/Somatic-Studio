import React, { useRef } from 'react';
import { ImageNode } from '../../types';
import { getPreviewUrl } from '../../services/immichService';

interface HeroSectionProps {
    image: ImageNode;
    blur?: number;
    heroRevealed: boolean;
}

const HeroSection: React.FC<HeroSectionProps> = ({ image, blur = 0, heroRevealed }) => {
    const scrollIndicatorRef = useRef<HTMLDivElement>(null);

    const palette = image.palette.length > 0 ? image.palette : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center px-4"
            style={{
                opacity: heroRevealed ? 1 : 0,
                transform: heroRevealed ? 'translateY(0)' : 'translateY(48px)',
                transition: 'opacity 700ms ease, transform 700ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}>
            {/* Hero image */}
            <div className="flex items-center justify-center w-full">
                <div className="w-full max-w-3xl mx-auto">
                    <div className="flex items-center justify-center">
                        <img src={getPreviewUrl(image.id)} alt=""
                            className="max-w-full max-h-[85vh] object-contain rounded-lg"
                            style={{
                                boxShadow: `0 16px 64px ${palette[0]}30, 0 4px 16px ${palette[1] || palette[0]}15`,
                                filter: blur > 0 ? `blur(${blur}px)` : undefined,
                                willChange: 'filter',
                            }}
                            draggable={false} />
                    </div>
                </div>
            </div>

            {/* Scroll indicator — fades when blur > 1 */}
            <div ref={scrollIndicatorRef}
                className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 transition-opacity duration-500"
                style={{ opacity: blur > 1 ? 0 : 1 }}>
                <span className="text-zinc-400 text-base" style={{ fontFamily: 'Caveat, cursive', animation: 'scroll-hint-bounce 2s ease-in-out infinite' }}>
                    scroll to explore
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                    className="text-zinc-400" style={{ animation: 'scroll-hint-bounce 2s ease-in-out infinite' }}>
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </div>
        </div>
    );
};

export default HeroSection;
