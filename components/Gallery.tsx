import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ImageNode, Tag, AnchorState } from '../types';
import { X } from 'lucide-react';

interface GalleryProps {
    history: AnchorState[];
    images: ImageNode[];
    tags: Tag[];
    startHistoryIndex: number;
    onClose: (finalHistoryIndex: number) => void;
    nsfwFilterActive: boolean;
    nsfwTagId?: string;
}

const Gallery: React.FC<GalleryProps> = ({ history, images, tags, startHistoryIndex, onClose, nsfwFilterActive, nsfwTagId }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // 1. Filter history to strictly images for the gallery view.
    // We store the original index to snap back correctly in the history stream on close.
    // Also respect NSFW filter to ensure 1:1 parity with the visible stream.
    const galleryItems = useMemo(() => {
        return history
            .map((step, idx) => ({ step, originalIndex: idx }))
            .filter(x => {
                if (x.step.mode !== 'IMAGE') return false;

                if (nsfwFilterActive) {
                    const img = images.find(i => i.id === x.step.id);
                    if (img) {
                        const hasNsfwTag = [...img.tagIds, ...(img.aiTagIds || [])].some(tid => {
                            if (tid === nsfwTagId) return true;
                            const t = tags.find(tag => tag.id === tid);
                            return t && t.label.trim().toLowerCase() === 'nsfw';
                        });
                        if (hasNsfwTag) return false;
                    }
                }
                return true;
            });
    }, [history, images, tags, nsfwFilterActive, nsfwTagId]);

    // 2. Find the starting index in our filtered list based on the history index passed in.
    const initialGalleryIndex = useMemo(() => {
        const found = galleryItems.findIndex(x => x.originalIndex === startHistoryIndex);
        return found >= 0 ? found : 0;
    }, [galleryItems, startHistoryIndex]);

    const [currentIndex, setCurrentIndex] = useState(initialGalleryIndex);

    // 3. Initial scroll to the clicked image
    // Using scrollTop is more reliable than scrollIntoView for a 100vh snap container on mount
    useEffect(() => {
        if (scrollRef.current && galleryItems.length > 0) {
            // Use clientHeight for robustness against mobile browser chrome resizing
            const h = scrollRef.current.clientHeight || window.innerHeight;
            scrollRef.current.scrollTop = initialGalleryIndex * h;
        }
    }, []); // Only run on mount

    // 4. Track scroll to update current index (so we know where we are when we close)
    const handleScroll = () => {
        if (scrollRef.current) {
            const h = scrollRef.current.clientHeight;
            if (h > 0) {
                const index = Math.round(scrollRef.current.scrollTop / h);
                if (index !== currentIndex && index >= 0 && index < galleryItems.length) {
                    setCurrentIndex(index);
                }
            }
        }
    };

    const handleClose = () => {
        const finalHistoryIndex = galleryItems[currentIndex]?.originalIndex ?? 0;
        onClose(finalHistoryIndex);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black animate-in fade-in duration-300">
            {/* Close Button */}
            <button
                onClick={handleClose}
                className="absolute top-6 right-6 z-50 p-3 text-white/50 hover:text-white bg-black/20 hover:bg-white/10 backdrop-blur-md rounded-full transition-all duration-200"
            >
                <X size={28} />
            </button>

            {/* Vertical Swipe Container */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="w-full h-full overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar"
                style={{ scrollBehavior: 'smooth' }}
            >
                {galleryItems.map((item, idx) => {
                    const img = images.find(i => i.id === item.step.id);
                    if (!img) return null;

                    return (
                        <div key={idx} className="w-full h-full flex items-center justify-center snap-center relative shrink-0">
                            <img
                                src={img.originalUrl || img.fileUrl}
                                alt=""
                                className="max-w-full max-h-full object-contain p-2 md:p-8 select-none shadow-2xl"
                                draggable={false}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Minimal Page Indicator */}
            <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 pointer-events-none">
                {galleryItems.map((_, i) => (
                    <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === currentIndex ? 'bg-white scale-150' : 'bg-white/20'}`}
                    />
                ))}
            </div>
        </div>
    );
};

export default Gallery;
