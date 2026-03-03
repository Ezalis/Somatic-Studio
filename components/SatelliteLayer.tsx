import React, { useEffect, useRef, useState, useMemo } from 'react';
import { ImageNode, Tag, TagType, AnchorState } from '../types';
import { Hash, Palette, X } from 'lucide-react';

interface SatelliteLayerProps {
    node: ImageNode;
    tags: Tag[];
    onNavigate: (anchor: AnchorState) => void;
}

const SatelliteLayer: React.FC<SatelliteLayerProps> = ({ node, tags, onNavigate }) => {
    const [openPanel, setOpenPanel] = useState<'palette' | 'tags' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Handle click outside to close panels
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

    return (
        <div ref={containerRef} className="absolute inset-0 pointer-events-none z-[60]">
            {/* Icon buttons */}
            <button
                onClick={() => togglePanel('palette')}
                className="pointer-events-auto absolute bottom-8 left-4 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm border border-zinc-300/50 flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-white transition-all duration-200 shadow-sm cursor-pointer animate-in fade-in slide-in-from-bottom-4 duration-700"
                title="Spectral ID"
            >
                <Palette size={18} />
            </button>
            <button
                onClick={() => togglePanel('tags')}
                className="pointer-events-auto absolute bottom-8 right-4 w-10 h-10 rounded-full bg-white/80 backdrop-blur-sm border border-zinc-300/50 flex items-center justify-center text-zinc-500 hover:text-zinc-800 hover:bg-white transition-all duration-200 shadow-sm cursor-pointer animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100"
                title="Semantic Web"
            >
                <Hash size={18} />
            </button>

            {/* Left drawer — Spectral ID */}
            <div className={`pointer-events-auto absolute top-0 bottom-0 left-0 w-72 bg-white/90 backdrop-blur-xl border-r border-zinc-200/50 shadow-xl transition-transform duration-300 ease-out ${openPanel === 'palette' ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <h3 className="font-hand text-xl text-zinc-600">Spectral ID</h3>
                    <button onClick={() => setOpenPanel(null)} className="p-1 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer">
                        <X size={18} />
                    </button>
                </div>
                <div className="px-5 pb-5">
                    <p className="font-hand text-sm text-zinc-400 mb-4">Pivot via color space</p>
                    <div className="flex flex-col gap-3">
                        {node.palette.map((color, i) => (
                            <button key={i} className="flex items-center gap-3 group/color cursor-pointer transition-transform hover:translate-x-1" onClick={() => onNavigate({ mode: 'COLOR', id: color })} title={color}>
                                <div className="w-8 h-8 rounded-full border-2 border-white/80 shadow-sm" style={{ backgroundColor: color }} />
                                <span className="font-hand text-xl text-zinc-500 group-hover/color:text-zinc-800 transition-colors uppercase tracking-widest">{color}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right drawer — Semantic Web */}
            <div className={`pointer-events-auto absolute top-0 bottom-0 right-0 w-72 bg-white/90 backdrop-blur-xl border-l border-zinc-200/50 shadow-xl transition-transform duration-300 ease-out ${openPanel === 'tags' ? 'translate-x-0' : 'translate-x-full'}`}>
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <h3 className="font-hand text-xl text-zinc-600">Semantic Web</h3>
                    <button onClick={() => setOpenPanel(null)} className="p-1 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer">
                        <X size={18} />
                    </button>
                </div>
                <div className="px-5 pb-5">
                    <p className="font-hand text-sm text-zinc-400 mb-4">Traverse concept clusters</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 items-center max-h-[calc(100vh-140px)] overflow-y-auto no-scrollbar">
                        {uniqueTags.map(tag => (
                            <button key={tag.id} className="text-lg font-hand text-zinc-600 hover:text-indigo-600 hover:translate-x-1 transition-all text-left flex items-center gap-2 group/tag whitespace-nowrap cursor-pointer" onClick={() => onNavigate({ mode: 'TAG', id: tag.id, meta: tag })}>
                                <Hash size={14} className="opacity-30 group-hover/tag:opacity-100 flex-shrink-0 text-indigo-400" />
                                <span className="truncate max-w-[100px]">{tag.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SatelliteLayer;
