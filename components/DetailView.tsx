import React, { useRef, useState, useEffect } from 'react';
import { ImageNode, Tag, TagType, ExperienceNode, AnchorState, NeighborhoodSummary, ZoneName } from '../types';
import {
    X, Camera, Maximize2, Aperture, Hash, Palette,
    ArrowDown, ArrowUp, Sun, Cloud, Thermometer, Gauge, Timer
} from 'lucide-react';
import { EsotericSprite, ScribbleConnector, HistoryStream } from './VisualElements';
import ProgressiveImage from './ProgressiveImage';

interface DetailViewProps {
    activeNode: ExperienceNode;
    images: ImageNode[];
    tags: Tag[];
    history: AnchorState[];
    onAnchorChange: (anchor: AnchorState) => void;
    onClose: (e: React.MouseEvent) => void;
    onOpenGallery: (startIndex: number) => void;
    nsfwFilterActive: boolean;
    nsfwTagId?: string;
    neighborhoodSummary?: NeighborhoodSummary | null;
}

const DetailView: React.FC<DetailViewProps> = ({
    activeNode,
    images,
    tags,
    history,
    onAnchorChange,
    onClose,
    onOpenGallery,
    nsfwFilterActive,
    nsfwTagId,
    neighborhoodSummary,
}) => {
    const detailScrollRef = useRef<HTMLDivElement>(null);
    const [showScrollTop, setShowScrollTop] = useState(false);

    // Reset scroll when opening detail view with new node
    useEffect(() => {
        if (detailScrollRef.current) {
            detailScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }, [activeNode.id]);

    const handleDetailScroll = () => {
        if (detailScrollRef.current) {
            setShowScrollTop(detailScrollRef.current.scrollTop > 300);
        }
    };

    const handleScrollToTop = (e: React.MouseEvent) => {
        e.stopPropagation();
        detailScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleNavigate = (anchor: AnchorState, e: React.MouseEvent) => {
        e.stopPropagation();
        onAnchorChange(anchor);
    };

    return (
        <>
            {/* Fixed Close Button (Outside Scroll Container) */}
            <button
                className="fixed top-8 right-8 sm:right-20 z-[70] p-2 text-zinc-400 hover:text-white bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full transition-all duration-200 shadow-xl border border-white/10"
                onClick={onClose}
                title="Close Detail View"
            >
                <X size={24} />
            </button>

            {/* Scroll To Top Button */}
            <button
                onClick={handleScrollToTop}
                className={`fixed bottom-8 right-8 z-[70] flex flex-col items-center gap-1 transition-all duration-500 group cursor-pointer ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8 pointer-events-none'}`}
                title="Back to Top"
            >
                <ArrowUp size={32} strokeWidth={1.5} className="text-zinc-500 group-hover:text-zinc-200 transition-transform duration-300 group-hover:-translate-y-1" />
                <span className="font-hand text-xl text-zinc-500 group-hover:text-zinc-200 drop-shadow-md">Top</span>
            </button>

            {/* Scrollable Container */}
            <div ref={detailScrollRef} onScroll={handleDetailScroll} className="fixed inset-0 z-50 bg-zinc-900/95 backdrop-blur-md overflow-y-auto custom-scrollbar overflow-x-hidden" onClick={onClose}>

                <div className="flex flex-col items-center w-full min-h-screen">
                    <div className="w-full max-w-[1920px] min-h-[78vh] grid grid-cols-1 sm:grid-cols-[120px_auto_120px] md:grid-cols-[140px_auto_140px] lg:grid-cols-[160px_1fr_160px] xl:grid-cols-[minmax(250px,350px)_1fr_minmax(250px,350px)] gap-12 sm:gap-4 lg:gap-12 p-8 sm:px-12 sm:py-4 lg:p-12 items-center mx-auto sm:justify-center" onClick={(e) => e.stopPropagation()}>
                        {/* Left Panel */}
                        <div className="flex flex-col gap-16 sm:gap-6 lg:gap-16 h-full justify-center order-2 sm:order-1 items-center sm:items-end text-center sm:text-right col-span-1">
                            {/* 1. Spectral ID */}
                            <div className="relative group w-40 h-40 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-48 lg:h-48 lg:mr-8 flex-shrink-0">
                                <div className="absolute inset-0 bg-white/5 rounded-full blur-xl animate-pulse" />
                                <EsotericSprite node={activeNode} />
                                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-lg sm:text-xs md:text-xs lg:text-lg font-hand text-zinc-500 opacity-60 whitespace-nowrap pr-4">Spectral ID</span>
                            </div>

                            {/* 2. Date Info */}
                            <div className="flex items-center gap-4 sm:gap-2 lg:gap-4">
                                <div className="flex flex-col items-center sm:items-end gap-1 text-zinc-400">
                                    <button onClick={(e) => handleNavigate({ mode: 'SEASON', id: activeNode.original.inferredSeason }, e)} className="text-4xl sm:text-2xl md:text-xl lg:text-4xl text-zinc-200 font-bold flex items-center gap-3 sm:gap-1.5 lg:gap-3 font-hand hover:text-amber-300 transition-colors pr-4 sm:pr-2 lg:pr-4">
                                        {activeNode.original.inferredSeason}
                                        {activeNode.original.inferredSeason === 'Summer' ? <Sun size={28} className="sm:w-6 sm:h-6 md:w-5 md:h-5 lg:w-7 lg:h-7" /> : activeNode.original.inferredSeason === 'Winter' ? <Thermometer size={28} className="sm:w-6 sm:h-6 md:w-5 md:h-5 lg:w-7 lg:h-7" /> : <Cloud size={28} className="sm:w-6 sm:h-6 md:w-5 md:h-5 lg:w-7 lg:h-7" />}
                                    </button>
                                    <button onClick={(e) => handleNavigate({ mode: 'DATE', id: activeNode.original.captureTimestamp.toString(), meta: activeNode.original.captureTimestamp }, e)} className="text-2xl sm:text-lg md:text-base lg:text-2xl flex items-center gap-2 sm:gap-1 lg:gap-2 font-hand text-zinc-300 hover:text-blue-300 transition-colors pr-4 sm:pr-2 lg:pr-4">
                                        {new Date(activeNode.original.captureTimestamp).toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </button>
                                    <span className="text-xl sm:text-base md:text-sm lg:text-xl italic opacity-70 font-hand pointer-events-none pr-4 sm:pr-2 lg:pr-4">{new Date(activeNode.original.captureTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <div className="hidden sm:block"><ScribbleConnector direction="right" length="60px" /></div>
                            </div>

                            {/* 3. Palette */}
                            <div className="flex items-start gap-4 sm:gap-2 lg:gap-4">
                                <div className="flex flex-col items-center sm:items-end gap-4 sm:gap-2 lg:gap-4">
                                    <h3 className="text-2xl sm:text-lg md:text-base lg:text-2xl font-hand font-bold text-zinc-500 flex items-center gap-2 sm:gap-1 lg:gap-2 flex-row-reverse pr-4 sm:pr-2 lg:pr-4"><Palette size={20} className="sm:w-4 sm:h-4 md:w-4 md:h-4 lg:w-5 lg:h-5" /> Palette</h3>
                                    <div className="flex flex-col gap-3 sm:gap-1.5 lg:gap-3">
                                        {activeNode.original.palette.map((color, i) => (
                                            <div key={i} className="flex items-center gap-3 sm:gap-1.5 lg:gap-3 group cursor-pointer flex-row-reverse" onClick={(e) => handleNavigate({ mode: 'COLOR', id: color, meta: color }, e)}>
                                                <div className="w-8 h-8 sm:w-6 sm:h-6 md:w-5 md:h-5 lg:w-8 lg:h-8 rounded-full border border-white/20 group-hover:scale-110 transition-transform shadow-md" style={{ backgroundColor: color }} />
                                                <span className="font-hand text-xl sm:text-base md:text-sm lg:text-xl text-zinc-500 group-hover:text-zinc-300 transition-colors pr-4 sm:pr-2 lg:pr-4">{color}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="hidden sm:block"><ScribbleConnector direction="right" length="40px" /></div>
                            </div>
                        </div>

                        {/* Center Image (Hero) */}
                        <div className="flex items-center justify-center h-full relative group order-1 sm:order-2 col-span-1 sm:col-span-1">
                            <div
                                className="relative bg-white p-3 sm:p-1.5 lg:p-3 rounded-sm shadow-2xl transition-transform duration-500 group-hover:scale-[1.01] cursor-zoom-in rotate-1 sm:rotate-0"
                                onClick={() => onOpenGallery(0)}
                            >
                                <ProgressiveImage
                                    previewSrc={activeNode.original.fileUrl}
                                    fullSrc={activeNode.original.originalUrl}
                                    imgClassName="max-h-[50vh] sm:max-h-[85vh] w-auto max-w-[85vw] sm:max-w-[40vw] lg:max-w-[50vw] object-contain bg-zinc-100"
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10 pointer-events-none">
                                    <Maximize2 size={48} className="text-white drop-shadow-md sm:w-8 sm:h-8 lg:w-12 lg:h-12" />
                                </div>
                            </div>
                        </div>

                        {/* Right Panel */}
                        <div className="flex flex-col gap-16 sm:gap-6 lg:gap-16 h-full justify-center order-3 items-center sm:items-start text-center sm:text-left col-span-1">
                            <div className="flex items-center gap-4 sm:gap-2 lg:gap-4">
                                <div className="hidden sm:block"><ScribbleConnector direction="left" length="60px" /></div>
                                <div className="flex flex-col items-center sm:items-start gap-1 text-zinc-400">
                                    <button onClick={(e) => handleNavigate({ mode: 'CAMERA', id: activeNode.original.cameraModel }, e)} className="text-3xl sm:text-xl md:text-base lg:text-3xl text-zinc-200 font-bold flex items-center gap-3 sm:gap-1.5 lg:gap-3 font-hand hover:text-emerald-300 transition-colors pr-4 sm:pr-0">
                                        <Camera size={24} className="opacity-70 sm:w-5 sm:h-5 md:w-5 md:h-5 lg:w-6 lg:h-6" />{activeNode.original.cameraModel}
                                    </button>
                                    <button onClick={(e) => handleNavigate({ mode: 'LENS', id: activeNode.original.lensModel }, e)} className="text-2xl sm:text-lg md:text-sm lg:text-2xl italic opacity-80 font-hand text-zinc-500 ml-1 sm:ml-0 hover:text-amber-300 transition-colors text-left pr-4 sm:pr-0">
                                        {activeNode.original.lensModel}
                                    </button>
                                    <div className="flex flex-col gap-1 mt-3 sm:mt-1 lg:mt-3 ml-2 sm:ml-0 font-hand text-xl sm:text-sm md:text-xs lg:text-xl text-zinc-400 opacity-80 pointer-events-none pr-4 sm:pr-0 items-center sm:items-start">
                                        <span className="flex items-center gap-2 sm:gap-1 lg:gap-2"><Aperture size={16} className="sm:w-3 sm:h-3 md:w-4 md:h-4 lg:w-4 lg:h-4" /> {activeNode.original.aperture}</span>
                                        <span className="flex items-center gap-2 sm:gap-1 lg:gap-2"><Timer size={16} className="sm:w-3 sm:h-3 md:w-4 md:h-4 lg:w-4 lg:h-4" /> {activeNode.original.shutterSpeed}s</span>
                                        <span className="flex items-center gap-2 sm:gap-1 lg:gap-2"><Gauge size={16} className="sm:w-3 sm:h-3 md:w-4 md:h-4 lg:w-4 lg:h-4" /> ISO {activeNode.original.iso}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 sm:gap-2 lg:gap-4">
                                <div className="hidden sm:block"><ScribbleConnector direction="left" length="40px" /></div>
                                <div className="flex flex-col items-center sm:items-start gap-2 sm:gap-1 lg:gap-2 w-full">
                                    <h3 className="text-2xl sm:text-lg md:text-base lg:text-2xl font-hand font-bold text-zinc-500 flex items-center gap-2 sm:gap-1 lg:gap-2 mb-2 sm:mb-1 lg:mb-2 pr-4 sm:pr-0"><Hash size={20} className="sm:w-4 sm:h-4 md:w-4 md:h-4 lg:w-5 lg:h-5" /> Concepts</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-1 gap-x-6 sm:gap-x-2 lg:gap-x-6 gap-y-2 sm:gap-y-0.5 lg:gap-y-2 text-left overflow-y-auto max-h-[400px] sm:max-h-[50vh] lg:max-h-[400px] pr-4 sm:pr-2 lg:pr-4 w-full no-scrollbar relative z-10">
                                        {(() => {
                                            const allTagIds = Array.from(new Set([...activeNode.original.tagIds, ...(activeNode.original.aiTagIds || [])]));
                                            const candidates = allTagIds.map(tid => tags.find(t => t.id === tid)).filter((t): t is Tag => { if (!t) return false; if (t.type === TagType.TECHNICAL || t.type === TagType.SEASONAL) return false; if (t.label.trim().toLowerCase() === 'nsfw') return false; return true; });
                                            const seenLabels = new Set<string>();
                                            const visibleTags: Tag[] = [];
                                            candidates.forEach(t => { const key = t.label.toLowerCase().trim(); if (!seenLabels.has(key)) { seenLabels.add(key); visibleTags.push(t); } });
                                            return visibleTags.map(tag => (
                                                <button key={tag.id} onClick={(e) => handleNavigate({ mode: 'TAG', id: tag.id, meta: tag }, e)} className="font-hand text-xl sm:text-lg md:text-base lg:text-xl text-zinc-400 hover:text-zinc-100 hover:scale-105 transition-all duration-200 justify-self-start w-full text-left pr-4 sm:pr-0 whitespace-normal break-words leading-tight py-1 sm:py-0.5" title={tag.label}>
                                                    {tag.label}
                                                </button>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {neighborhoodSummary && neighborhoodSummary.totalNeighbors > 0 && (
                        <div className="w-full max-w-3xl mx-auto px-8 py-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col items-center justify-center pt-2 pb-4 opacity-40">
                                <ArrowDown className="text-zinc-500" size={32} strokeWidth={1.5} />
                                <span className="font-hand text-zinc-500 text-2xl mt-2">Neighborhood</span>
                            </div>
                            <p className="font-hand text-xl sm:text-2xl text-zinc-400 text-center leading-relaxed max-w-2xl mx-auto">
                                {neighborhoodSummary.narrative}
                            </p>
                            <div className="flex flex-wrap justify-center gap-3 mt-6">
                                {neighborhoodSummary.zones.map(z => {
                                    const chipColors: Record<ZoneName, string> = {
                                        temporal:  'text-blue-400 border-blue-400/30',
                                        thematic:  'text-purple-400 border-purple-400/30',
                                        visual:    'text-amber-400 border-amber-400/30',
                                        technical: 'text-green-400 border-green-400/30',
                                    };
                                    const dotColors: Record<ZoneName, string> = {
                                        temporal:  'bg-blue-400',
                                        thematic:  'bg-purple-400',
                                        visual:    'bg-amber-400',
                                        technical: 'bg-green-400',
                                    };
                                    return (
                                        <span key={z.zone} className={`font-hand text-lg px-3 py-1 rounded-full border flex items-center gap-2 ${chipColors[z.zone]}`}>
                                            <span className={`w-2 h-2 rounded-full ${dotColors[z.zone]}`} />
                                            {z.count} {z.label}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {history.length > 1 && (
                        <div className="w-full relative pb-32" onClick={(e) => e.stopPropagation()}>
                             <div className="flex flex-col items-center justify-center pt-2 pb-4 opacity-40">
                                <ArrowDown className="text-zinc-500" size={32} strokeWidth={1.5} />
                                <span className="font-hand text-zinc-500 text-2xl mt-2">History Trail</span>
                             </div>
                             <HistoryStream
                                history={history.slice(1)}
                                images={images}
                                tags={tags}
                                nsfwFilterActive={nsfwFilterActive}
                                nsfwTagId={nsfwTagId}
                                currentHero={activeNode.original}
                                onItemClick={(index) => onOpenGallery(index)}
                                baseIndexOffset={1}
                                idPrefix="detail-history-"
                             />
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default DetailView;
