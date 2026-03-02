import React, { useEffect, useRef } from 'react';
import { ImageNode, Tag, ExperienceMode, AnchorState } from '../types';
import { HistoryStream } from './VisualElements';

interface HistoryTimelineProps {
    history: AnchorState[];
    images: ImageNode[];
    tags: Tag[];
    activeMode: ExperienceMode;
    nsfwFilterActive: boolean;
    nsfwTagId?: string;
    currentHero?: ImageNode;
}

const HistoryTimeline: React.FC<HistoryTimelineProps> = ({ history, images, tags, activeMode, nsfwFilterActive, nsfwTagId, currentHero }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => { if (activeMode === 'HISTORY' && scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'instant' }); }, [activeMode]);
    useEffect(() => { if (activeMode === 'EXPLORE' && scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' }); }, [activeMode]);

    return (
        <div ref={scrollRef} className={`absolute inset-0 z-40 bg-zinc-900/95 backdrop-blur-md overflow-y-auto snap-y snap-mandatory scroll-smooth no-scrollbar transition-opacity duration-500 ${activeMode === 'HISTORY' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
            <HistoryStream
                history={history}
                images={images}
                tags={tags}
                nsfwFilterActive={nsfwFilterActive}
                nsfwTagId={nsfwTagId}
                currentHero={currentHero}
                idPrefix="timeline-history-"
            />
        </div>
    );
};

export default HistoryTimeline;
