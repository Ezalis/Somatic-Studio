import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ImageNode, Tag, TagType, AnchorState } from '../types';
import { Hash } from 'lucide-react';
import { RoughContainer } from './VisualElements';

interface SatelliteLayerProps {
    node: ImageNode;
    tags: Tag[];
    onNavigate: (anchor: AnchorState) => void;
    isMobile: boolean;
}

const SatelliteLayer: React.FC<SatelliteLayerProps> = ({ node, tags, onNavigate, isMobile }) => {
    const [openPanel, setOpenPanel] = useState<'palette' | 'tags' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Handle click outside on mobile to close panels
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpenPanel(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const uniqueTags = useMemo(() => {
        const allIds = [...node.tagIds, ...(node.aiTagIds || [])];
        const resolved = allIds.map(id => tags.find(t => t.id === id)).filter(Boolean) as Tag[];
        const concepts = resolved.filter(t => t.type !== TagType.TECHNICAL && t.type !== TagType.SEASONAL && t.label.toLowerCase() !== 'nsfw');
        const seen = new Set<string>();
        const final: Tag[] = [];
        concepts.forEach(t => { if(!seen.has(t.label.toLowerCase())){ seen.add(t.label.toLowerCase()); final.push(t); } });
        return final;
    }, [node, tags]);

    const togglePanel = (panel: 'palette' | 'tags') => {
        setOpenPanel(prev => prev === panel ? null : panel);
    };

    const showPalette = !isMobile || openPanel === 'palette';
    const showTags = !isMobile || openPanel === 'tags';

    return (
        <div ref={containerRef} className="absolute inset-0 pointer-events-none z-[60]">
            {/* Left: Palette - Increased offset for landscape mobile (Dynamic Island) */}
            <div className={`absolute bottom-8 left-8 sm:left-20 lg:bottom-12 lg:left-10 flex items-end animate-in fade-in slide-in-from-bottom-4 duration-700 transition-all ${openPanel === 'palette' ? 'z-50' : 'z-40'}`}>
                <RoughContainer
                    title="Spectral ID"
                    description={isMobile && !showPalette ? undefined : "Pivot via color space"}
                    alignText="left"
                    onTitleClick={() => togglePanel('palette')}
                >
                    {showPalette && (
                        <div className="transition-all duration-300 animate-in fade-in">
                            <div className="flex flex-col gap-3 min-w-[140px] pt-1 lg:pt-0">
                                {node.palette.map((color, i) => (
                                    <button key={i} className="flex items-center gap-3 group/color cursor-pointer transition-transform hover:translate-x-1" onClick={() => onNavigate({ mode: 'COLOR', id: color })} title={color}>
                                        <div className="w-8 h-8 rounded-full border-2 border-white/80 shadow-sm" style={{ backgroundColor: color }} />
                                        <span className="font-hand text-xl text-zinc-500 group-hover/color:text-zinc-800 transition-colors uppercase tracking-widest pr-4">{color}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </RoughContainer>
            </div>

            {/* Right: Tags - Increased offset for landscape mobile (Dynamic Island) */}
            <div className={`absolute bottom-8 right-8 sm:right-20 lg:bottom-12 lg:right-10 flex items-end animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 transition-all ${openPanel === 'tags' ? 'z-50' : 'z-40'}`}>
                <RoughContainer
                    title="Semantic Web"
                    description={isMobile && !showTags ? undefined : "Traverse concept clusters"}
                    alignText="right"
                    onTitleClick={() => togglePanel('tags')}
                >
                    {showTags && (
                        <div className="transition-all duration-300 animate-in fade-in">
                            <div className="grid grid-cols-2 gap-x-8 gap-y-3 items-center max-h-[300px] overflow-y-auto no-scrollbar pr-2 pt-1 lg:pt-0">
                                {uniqueTags.map(tag => (
                                    <button key={tag.id} className="text-xl font-hand text-zinc-600 hover:text-indigo-600 hover:translate-x-1 transition-all text-left flex items-center gap-2 group/tag whitespace-nowrap cursor-pointer pr-2" onClick={() => onNavigate({ mode: 'TAG', id: tag.id, meta: tag })}>
                                        <Hash size={14} className="opacity-30 group-hover/tag:opacity-100 flex-shrink-0 text-indigo-400" />
                                        <span className="truncate max-w-[160px] pr-3">{tag.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </RoughContainer>
            </div>
        </div>
    );
};

export default SatelliteLayer;
