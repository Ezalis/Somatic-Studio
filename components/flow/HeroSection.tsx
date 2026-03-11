import React, { useRef } from 'react';
import { ImageNode } from '../../types';
import { getPreviewUrl } from '../../services/immichService';

interface HeroSectionProps {
    image: ImageNode;
    blur?: number;
    heroRevealed: boolean;
    onImageClick?: () => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ image, blur = 0, heroRevealed, onImageClick }) => {
    const scrollIndicatorRef = useRef<HTMLDivElement>(null);

    const palette = image.palette.length > 0 ? image.palette : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];

    return (
        <div className="relative min-h-screen flex flex-col items-center justify-center px-4 pb-16"
            style={{
                opacity: heroRevealed ? 1 : 0,
                transform: heroRevealed ? 'translateY(0)' : 'translateY(48px)',
                // Only animate when revealing — instant hide prevents flash of new image during bloom
                transition: heroRevealed
                    ? 'opacity 700ms ease, transform 700ms cubic-bezier(0.22, 1, 0.36, 1)'
                    : 'none',
            }}>
            {/* Hero image — sized to viewport with breathing room */}
            <div className="flex items-center justify-center w-full"
                onClick={onImageClick} style={{ cursor: onImageClick ? 'pointer' : undefined }}>
                <img src={getPreviewUrl(image.id)} alt=""
                    className="object-contain rounded-lg"
                    style={{
                        maxWidth: 'calc(100vw - 80px)',
                        maxHeight: 'calc(100vh - 160px)',
                        boxShadow: `0 16px 64px ${palette[0]}30, 0 4px 16px ${palette[1] || palette[0]}15`,
                        filter: blur > 0 ? `blur(${blur}px)` : undefined,
                        willChange: 'filter',
                    }}
                    draggable={false} />
            </div>

            {/* Scroll indicator — fades when blur > 1 */}
            <div ref={scrollIndicatorRef}
                className="mt-6 flex flex-col items-center gap-2 transition-opacity duration-500"
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
