import React, { useEffect, useRef } from 'react';
import { ImageNode } from '../../types';
import { TrailPoint, HistoryTab } from './flowTypes';
import GravityView from './GravityView';
import ArcView from './ArcView';

interface SessionHistoryProps {
    trail: TrailPoint[];
    images: ImageNode[];
    activeTab: HistoryTab;
    onTabChange: (tab: HistoryTab) => void;
    onSeedLoop: (image: ImageNode, rect: DOMRect) => void;
}

const mono = { fontFamily: 'JetBrains Mono, monospace' };

const SessionHistory: React.FC<SessionHistoryProps> = ({
    trail, images, activeTab, onTabChange, onSeedLoop,
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [activeTab]);

    return (
        <div className="fixed inset-0 z-[55]"
            style={{ background: '#faf9f6', animation: 'history-fade-in 400ms ease-out forwards' }}>

            {/* Sub-tab bar */}
            <div className="fixed top-12 left-0 right-0 z-[56] flex items-center gap-1 px-4 py-2"
                style={{ background: 'rgba(250,249,246,0.85)', backdropFilter: 'blur(8px)' }}>
                <button
                    onClick={() => onTabChange('gravity')}
                    className="px-3 py-1.5 rounded-full text-[10px] transition-all cursor-pointer"
                    style={{
                        ...mono,
                        background: activeTab === 'gravity' ? 'rgba(0,0,0,0.08)' : 'transparent',
                        color: activeTab === 'gravity' ? '#18181b' : '#a1a1aa',
                        borderBottom: activeTab === 'gravity' ? '1.5px solid #18181b' : '1.5px solid transparent',
                    }}>
                    gravity
                </button>
                <button
                    onClick={() => onTabChange('arc')}
                    className="px-3 py-1.5 rounded-full text-[10px] transition-all cursor-pointer"
                    style={{
                        ...mono,
                        background: activeTab === 'arc' ? 'rgba(0,0,0,0.08)' : 'transparent',
                        color: activeTab === 'arc' ? '#18181b' : '#a1a1aa',
                        borderBottom: activeTab === 'arc' ? '1.5px solid #18181b' : '1.5px solid transparent',
                    }}>
                    arc
                </button>
            </div>

            {/* Scrollable content */}
            <div ref={scrollRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden pt-24">
                {activeTab === 'gravity' ? (
                    <GravityView trail={trail} images={images} onSeedLoop={onSeedLoop} />
                ) : (
                    <ArcView trail={trail} images={images} />
                )}
            </div>
        </div>
    );
};

export default SessionHistory;
