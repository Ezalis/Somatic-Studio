import React, { useState, useEffect, useRef } from 'react';

interface ProgressiveImageProps {
    previewSrc: string;
    fullSrc?: string;
    alt?: string;
    className?: string;
    imgClassName?: string;
    loading?: 'lazy' | 'eager';
}

const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
    previewSrc,
    fullSrc,
    alt = '',
    className,
    imgClassName,
    loading,
}) => {
    const [fullLoaded, setFullLoaded] = useState(false);
    const fullRef = useRef<HTMLImageElement>(null);

    const shouldShowFull = fullSrc && fullSrc !== previewSrc;

    useEffect(() => {
        setFullLoaded(false);

        if (!shouldShowFull) return;

        // Check if the image is already cached (from preload)
        const img = fullRef.current;
        if (img?.complete && img.naturalWidth > 0) {
            setFullLoaded(true);
        }
    }, [fullSrc, previewSrc, shouldShowFull]);

    const handleFullLoad = () => {
        setFullLoaded(true);
    };

    const handleFullError = () => {
        // Stay on preview — no broken image icon
    };

    // Grid stacking: both images occupy the same cell with identical classes,
    // so they render at the exact same size. Full-res crossfades over preview.
    return (
        <div className={`grid [&>*]:col-start-1 [&>*]:row-start-1 ${className ?? ''}`}>
            <img
                src={previewSrc}
                alt={alt}
                className={imgClassName}
                loading={loading}
                draggable={false}
            />
            {shouldShowFull && (
                <img
                    ref={fullRef}
                    src={fullSrc}
                    alt={alt}
                    className={`transition-opacity duration-500 ${fullLoaded ? 'opacity-100' : 'opacity-0'} ${imgClassName ?? ''}`}
                    onLoad={handleFullLoad}
                    onError={handleFullError}
                    loading={loading}
                    draggable={false}
                />
            )}
        </div>
    );
};

export default ProgressiveImage;
