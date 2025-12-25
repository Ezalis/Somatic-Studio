import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ImageNode, Tag, TagType, ExperienceNode, AnchorState } from '../types';
import { getIntersectionAttributes, hexToRgbVals } from '../services/dataService';
import { 
    Activity, Camera, Sun, Cloud, Thermometer, Calendar, Clock, 
    Hash, Palette, Aperture, LayoutGrid, Snowflake, Gauge, Timer 
} from 'lucide-react';

// --- Procedural Sprite Component ---
export const EsotericSprite = React.memo(({ node }: { node: ExperienceNode }) => {
    // Robust fallback for palette
    const palette = (node.original.palette && node.original.palette.length > 0) 
        ? node.original.palette 
        : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];
        
    const tagCount = (node.original.tagIds?.length || 0) + (node.original.aiTagIds?.length || 0);
    
    const hash = (str: string) => {
        let h = 0;
        for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
        return Math.abs(h);
    };
    const seed = hash(node.id);
    
    return (
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md overflow-visible" shapeRendering="geometricPrecision">
            <defs>
                <filter id={`glow-${node.id}`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
            </defs>
            <g filter={`url(#glow-${node.id})`}>
                {palette.slice(1).map((color, i) => {
                    const angle = (seed + i * 73) % 360;
                    const dist = 10 + (seed % 15);
                    const rx = 20 + ((seed + i) % 15);
                    const ry = 20 + ((seed * (i+1)) % 15);
                    const tx = 50 + dist * Math.cos(angle * Math.PI / 180);
                    const ty = 50 + dist * Math.sin(angle * Math.PI / 180);
                    
                    return (
                        <ellipse 
                            key={i}
                            cx={tx} cy={ty} rx={rx} ry={ry}
                            fill={color}
                            fillOpacity={0.6}
                            transform={`rotate(${(seed * (i+1)) % 360}, ${tx}, ${ty})`}
                        />
                    );
                })}
                <circle 
                    cx="50" cy="50" r={15 + Math.min(tagCount, 15)} 
                    fill={palette[0]} 
                    className="animate-pulse"
                    style={{ animationDuration: `${3 + (seed % 5)}s` }}
                />
            </g>
        </svg>
    );
}, (prev, next) => prev.node.id === next.node.id);

// --- Procedural Hand-Drawn Arrow Component ---
export const GreasePencilArrow: React.FC<{ seed: number, className?: string }> = ({ seed, className }) => {
    const rng = (offset: number) => {
        const x = Math.sin(seed + offset) * 10000;
        return x - Math.floor(x);
    };

    const tilt = (rng(1) - 0.5) * 20; 
    const curveX = (rng(2) - 0.5) * 15; 
    const headLeftLen = 8 + rng(3) * 6;
    const headRightLen = 8 + rng(4) * 6;
    const headLeftAngle = 25 + rng(5) * 15;
    const headRightAngle = 25 + rng(6) * 15;
    const shaftWiggle = (rng(7) - 0.5) * 4;

    return (
        <svg 
            viewBox="0 0 32 64" 
            className={className} 
            style={{ 
                transform: `rotate(${tilt}deg)`,
                overflow: 'visible'
            }}
        >
            <defs>
                <filter id={`sketch-${seed % 10}`}>
                    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" result="noise" />
                    <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" />
                </filter>
            </defs>
            <g 
                stroke="currentColor" 
                strokeWidth="2.5" 
                fill="none" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                filter={`url(#sketch-${seed % 10})`}
                opacity="0.7"
            >
                <path d={`M16,60 Q${16 + curveX},32 ${16 + shaftWiggle},4`} />
                <path d={`M${16 + shaftWiggle},4 l-${Math.sin(headLeftAngle * Math.PI / 180) * headLeftLen},${Math.cos(headLeftAngle * Math.PI / 180) * headLeftLen}`} />
                <path d={`M${16 + shaftWiggle},4 l${Math.sin(headRightAngle * Math.PI / 180) * headRightLen},${Math.cos(headRightAngle * Math.PI / 180) * headRightLen}`} />
            </g>
        </svg>
    );
};

// --- Scribble Line for Details ---
export const ScribbleConnector: React.FC<{ direction: 'left' | 'right' | 'up' | 'down', length?: string, className?: string }> = ({ direction, length = "100px", className }) => {
    let pathD = "";
    let viewBox = "0 0 100 20";
    
    if (direction === 'right') pathD = "M0,10 Q50,0 100,10";
    else if (direction === 'left') pathD = "M100,10 Q50,20 0,10";
    else if (direction === 'up') { viewBox = "0 0 20 100"; pathD = "M10,100 Q0,50 10,0"; }
    else if (direction === 'down') { viewBox = "0 0 20 100"; pathD = "M10,0 Q20,50 10,100"; }

    return (
        <svg viewBox={viewBox} className={`overflow-visible text-zinc-300 opacity-60 ${className}`} style={{ width: direction === 'up' || direction === 'down' ? '20px' : length, height: direction === 'up' || direction === 'down' ? length : '20px' }} preserveAspectRatio="none">
             <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 2" />
             <circle cx={direction === 'right' || direction === 'left' ? (direction === 'right' ? 100 : 0) : 10} cy={direction === 'up' || direction === 'down' ? (direction === 'down' ? 100 : 0) : 10} r="3" fill="currentColor" />
        </svg>
    );
}

// --- Loading Overlay with Floating Items ---
interface FloatingItem {
    id: number;
    text: string;
    x: number;
    y: number;
    rotation: number;
    type: 'TAG' | 'DATE' | 'COLOR' | 'TECH';
    delay: number;
}

export const LoadingOverlay: React.FC<{ 
    progress: { current: number, total: number }; 
    images: ImageNode[];
    tags: Tag[];
}> = ({ progress, images, tags }) => {
    const latestImage = images.length > 0 ? images[images.length - 1] : null;
    const percentage = Math.round((progress.current / progress.total) * 100);
    const [floatingItems, setFloatingItems] = useState<FloatingItem[]>([]);
    const lastImageCount = useRef(0);

    useEffect(() => {
        if (images.length > lastImageCount.current) {
            const newCount = images.length;
            const itemsToAdd: FloatingItem[] = [];
            const newImages = images.slice(lastImageCount.current, newCount);
            
            newImages.forEach(img => {
                if (Math.random() > 0.5 && img.tagIds.length > 0) {
                    const randomTagId = img.tagIds[Math.floor(Math.random() * img.tagIds.length)];
                    const tag = tags.find(t => t.id === randomTagId);
                    if (tag) itemsToAdd.push({ id: Math.random(), text: `#${tag.label}`, x: 10 + Math.random() * 80, y: 10 + Math.random() * 80, rotation: (Math.random() - 0.5) * 45, type: 'TAG', delay: Math.random() * 0.5 });
                }
                if (Math.random() > 0.7) {
                    const text = Math.random() > 0.5 ? new Date(img.captureTimestamp).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : img.cameraModel;
                    itemsToAdd.push({ id: Math.random(), text: text, x: 5 + Math.random() * 90, y: 5 + Math.random() * 90, rotation: (Math.random() - 0.5) * 30, type: 'TECH', delay: Math.random() * 0.5 });
                }
                if (Math.random() > 0.8 && img.palette.length > 0) {
                     itemsToAdd.push({ id: Math.random(), text: img.palette[0], x: 5 + Math.random() * 90, y: 5 + Math.random() * 90, rotation: (Math.random() - 0.5) * 60, type: 'COLOR', delay: Math.random() * 0.5 });
                }
            });
            setFloatingItems(prev => [...prev, ...itemsToAdd].slice(-20));
            lastImageCount.current = newCount;
        }
    }, [images, tags]);

    const polaroidRotation = useMemo(() => (Math.random() - 0.5) * 6, [latestImage]);

    return (
        <div className="absolute inset-0 z-[100] bg-zinc-950 flex flex-col items-center justify-center font-hand text-zinc-200 overflow-hidden">
             <div className="absolute inset-0 pointer-events-none overflow-hidden">
                 {floatingItems.map(item => (
                     <div key={item.id} className="absolute text-white/20 text-lg md:text-2xl animate-in fade-in zoom-in duration-1000 fill-mode-forwards pr-4" style={{ left: `${item.x}%`, top: `${item.y}%`, transform: `rotate(${item.rotation}deg)`, animationDelay: `${item.delay}s` }}>
                         {item.type === 'COLOR' ? (<div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full" style={{backgroundColor: item.text}} /><span className="font-mono text-sm">{item.text}</span></div>) : (item.text)}
                     </div>
                 ))}
             </div>
            <div className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-overlay" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")` }} />
            
            <div className="relative z-10 flex flex-col items-center justify-center w-full h-[100dvh] p-4 md:p-8 gap-6 md:gap-12">
                <div className="flex flex-col items-center gap-1 shrink-0">
                    <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tighter opacity-90 drop-shadow-md pr-4 text-center">Somatic Studio</h1>
                </div>
                
                <div className="relative shrink-0 w-[65vw] max-w-[280px] aspect-[4/5] md:w-80 md:h-96 md:max-w-none md:aspect-auto flex flex-col items-center justify-center transition-all duration-500 ease-out" style={{ transform: `rotate(${polaroidRotation}deg)` }}>
                    <div className="absolute inset-0 bg-[#f8f8f8] shadow-2xl rounded-sm transform translate-y-1" />
                    {latestImage ? (
                        <div className="relative w-[90%] h-[90%] mt-[5%] bg-zinc-100 flex flex-col animate-in fade-in duration-500 shadow-inner">
                             <div className="flex-1 w-full overflow-hidden relative bg-zinc-200">
                                 <img src={latestImage.fileUrl} alt="Loading Preview" className="absolute inset-0 w-full h-full object-cover filter sepia-[0.1] contrast-[1.1]" />
                             </div>
                             <div className="h-12 md:h-16 flex flex-col justify-end p-2 md:p-3 pb-1 md:pb-2 shrink-0">
                                 <div className="flex justify-between items-end font-mono text-[8px] md:text-[10px] text-zinc-400 tracking-wider">
                                     <span className="uppercase truncate max-w-[120px]">{latestImage.inferredSeason} {new Date(latestImage.captureTimestamp).getFullYear()}</span>
                                     <span>ISO{latestImage.iso}</span>
                                 </div>
                                 <div className="flex gap-1 mt-1 justify-end opacity-50">
                                    {latestImage.palette.slice(0,3).map(c => (<div key={c} className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full" style={{background: c}} />))}
                                 </div>
                             </div>
                        </div>
                    ) : (<div className="relative w-[90%] h-[90%] mt-[5%] bg-zinc-100 flex flex-col items-center justify-center text-zinc-300"><Activity size={32} /></div>)}
                </div>

                <div className="w-full flex flex-col gap-2 md:gap-4 max-w-[240px] md:max-w-md shrink-0">
                    <div className="flex justify-between text-lg md:text-2xl font-mono text-zinc-400 items-end px-2">
                        <span>{progress.current.toString().padStart(3, '0')}</span>
                        <span className="opacity-30 text-xs md:text-sm mb-1">/</span>
                        <span>{progress.total}</span>
                    </div>
                    <div className="w-full h-4 md:h-6 relative">
                        <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 400 20">
                            <path d="M2,10 Q50,14 100,10 T200,10 T300,10 T400,10" fill="none" stroke="#3f3f46" strokeWidth="2" strokeLinecap="round" className="w-full" vectorEffect="non-scaling-stroke" />
                            <path d="M2,10 Q50,14 100,10 T200,10 T300,10 T400,10" fill="none" stroke="#e4e4e7" strokeWidth="4" strokeLinecap="round" strokeDasharray="410" strokeDashoffset={410 - (percentage * 4.1)} className="transition-all duration-300 ease-linear" vectorEffect="non-scaling-stroke" filter="url(#pencil)" />
                            <defs><filter id="pencil"><feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="5" stitchTiles="stitch" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="2" /></filter></defs>
                        </svg>
                    </div>
                    <div className="text-center text-zinc-500 text-xs md:text-lg mt-1 font-mono tracking-widest">{percentage}% COMPLETED</div>
                </div>
            </div>
            
            <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8 flex items-center gap-2 md:gap-3 opacity-60 md:opacity-80 z-[110] scale-75 md:scale-100 origin-bottom-right">
                <div className="text-right"><div className="font-hand text-lg md:text-xl text-zinc-300 pr-2">Captured on</div><div className="font-mono text-[10px] md:text-xs text-zinc-400 uppercase tracking-widest">Fujifilm X-Series</div></div>
                <Camera size={20} className="text-zinc-300" strokeWidth={1.5} />
            </div>
        </div>
    );
}

// --- Rough Container (Hand-drawn box) ---
export const RoughContainer: React.FC<{ 
    children?: React.ReactNode; 
    title: string; 
    description?: string;
    alignText: 'left' | 'right';
    onTitleClick?: () => void;
}> = ({ children, title, description, alignText, onTitleClick }) => {
    
    // Handler to toggle open/close when clicking the container, but ignored if clicking an internal button
    const handleContainerClick = (e: React.MouseEvent) => {
        if (!onTitleClick) return;
        // Check if the target is a button or inside a button (like a color swatch or tag)
        if ((e.target as HTMLElement).closest('button')) {
            return;
        }
        onTitleClick();
    };

    return (
        <div 
            onClick={handleContainerClick}
            className={`relative group pointer-events-auto p-3 md:p-6 transition-all duration-300 ${onTitleClick ? 'cursor-pointer active:scale-[0.99]' : ''}`}
        >
            <div className="absolute -inset-4 bg-white/80 backdrop-blur-xl rounded-xl -z-10 shadow-lg border border-zinc-400/20" 
                 style={{ 
                     borderRadius: '255px 15px 225px 15px / 15px 225px 15px 255px',
                 }}
            />
            
            <div className="absolute -inset-4 -z-10 pointer-events-none text-zinc-400/40">
                 <svg className="w-full h-full overflow-visible">
                    <rect x="0" y="0" width="100%" height="100%" rx="15" ry="15" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="300 8" vectorEffect="non-scaling-stroke" style={{ filter: 'url(#sketch-filter)' }} />
                 </svg>
            </div>

            <div className={`flex flex-col gap-3 min-w-[80px] md:min-w-[120px] ${children ? 'min-w-[200px] max-w-[calc(100vw-5rem)]' : ''} ${alignText === 'right' ? 'items-end text-right' : 'items-start text-left'}`}>
                <div className="flex flex-col gap-0.5 pointer-events-none">
                    <div 
                        className="font-hand text-2xl md:text-3xl font-bold text-zinc-700 leading-none tracking-wide pr-2 md:pr-4 select-none"
                    >
                        {title}
                    </div>
                    {description && (
                        <div className="font-hand text-base md:text-lg text-zinc-500 leading-tight pr-2 md:pr-4">
                            {description}
                        </div>
                    )}
                    {children && <div className={`h-px bg-zinc-300 w-12 mt-2 ${alignText === 'right' ? 'ml-auto' : 'mr-auto'}`} />}
                </div>

                {children && (
                    <div className="relative z-10 pointer-events-auto">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Annotation Component ---
export const getAnnotationLayout = (id: string) => {
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const dateSide = hash % 2 === 0 ? 'left' : 'right';
    const techSide = dateSide === 'left' ? 'right' : 'left';
    const tilt = (hash % 5) - 2;
    const verticalOffset = (hash % 40) - 20;
    const isCurved = hash % 3 === 0;
    return { dateSide, techSide, tilt, verticalOffset, isCurved, seed: hash };
};

export const Annotation: React.FC<{ side: 'left' | 'right'; children: React.ReactNode; verticalOffset?: number; isCurved?: boolean; compact?: boolean; }> = ({ side, children, verticalOffset = 0, isCurved = false, compact = false }) => {
    const isLeft = side === 'left';
    const widthClass = compact ? 'w-32 md:w-40' : 'w-48 md:w-64';
    const offsetClass = isLeft ? (compact ? 'right-full mr-4 md:mr-6 text-right' : 'right-full mr-8 md:mr-12 text-right') : (compact ? 'left-full ml-4 md:ml-6 text-left' : 'left-full ml-8 md:ml-12 text-left');
    return (
        <div className={`absolute top-1/2 ${widthClass} ${offsetClass}`} style={{ marginTop: `${verticalOffset}px`, transform: 'translateY(-50%)' }}>
            <div className={`relative font-hand text-zinc-600 ${compact ? 'text-sm md:text-base' : 'text-lg md:text-xl'} leading-snug pr-4`}>
                <svg className={`absolute top-1/2 text-zinc-400 pointer-events-none opacity-60 ${isLeft ? '-right-8 translate-x-2' : '-left-8 -translate-x-2'} ${compact ? 'w-8 h-4' : 'w-12 h-8'}`} style={{ transform: `translateY(-50%) ${isLeft ? '' : 'scaleX(-1)'}` }} viewBox="0 0 48 32" overflow="visible">
                    {isCurved ? (<path d="M0,16 Q24,4 48,16" fill="none" stroke="currentColor" strokeWidth={compact ? 1 : 1.5} strokeLinecap="round" />) : (<line x1="0" y1="16" x2="48" y2="16" stroke="currentColor" strokeWidth={compact ? 1 : 1.5} strokeLinecap="round" />)}
                    <circle cx="48" cy="16" r={compact ? 1.5 : 2.5} fill="currentColor" />
                </svg>
                {children}
            </div>
        </div>
    );
};

// --- Mobile Connection Helper ---
const MobileConnectionInfo: React.FC<{ 
    colorMatches: {cA: string, cB: string}[], 
    techMatches: string[], 
    commonTags: Tag[] 
}> = ({ colorMatches, techMatches, commonTags }) => (
    <div className="md:hidden flex flex-col items-center gap-3 mt-6 w-full px-4 animate-in fade-in slide-in-from-top-2 duration-500">
        {/* Visual & Tech Row */}
        <div className="flex items-center justify-center gap-6 w-full">
             {colorMatches.length > 0 && (
                 <div className="flex -space-x-3">
                     {colorMatches.slice(0, 3).map((pair, idx) => (
                         <div key={idx} className="relative">
                             <div className="w-5 h-5 rounded-full border border-white/20 shadow-sm" style={{backgroundColor: pair.cA}} />
                             <div className="w-5 h-5 rounded-full border border-white/20 shadow-sm absolute top-2 left-2" style={{backgroundColor: pair.cB}} />
                         </div>
                     ))}
                 </div>
             )}
             {techMatches.length > 0 && (
                 <div className="flex flex-col gap-0.5 text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-center">
                     {techMatches.map((t, idx) => <span key={idx}>{t}</span>)}
                 </div>
             )}
        </div>

        {/* Tags Row */}
        {commonTags.length > 0 && (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
                {commonTags.slice(0, 6).map((tag) => (
                    <div key={tag.id} className="flex items-center gap-1.5 text-zinc-400">
                        <Hash size={12} className="opacity-40" />
                        <span className="font-hand text-lg leading-none text-zinc-500">{tag.label}</span>
                    </div>
                ))}
            </div>
        )}
        
        {/* Divider to separate from next item */}
        <div className="w-8 h-px bg-zinc-200 mt-2 mb-4" />
    </div>
);

// --- History Stream (Extracted from Experience.tsx) ---
export const HistoryStream: React.FC<{ 
    history: AnchorState[]; 
    images: ImageNode[]; 
    tags: Tag[]; 
    nsfwFilterActive: boolean; 
    nsfwTagId?: string; 
    currentHero?: ImageNode;
    onItemClick?: (index: number) => void;
    baseIndexOffset?: number;
    idPrefix?: string; 
}> = ({ history, images, tags, nsfwFilterActive, nsfwTagId, currentHero, onItemClick, baseIndexOffset = 0, idPrefix = 'history-' }) => {
    
    // VISUALIZE CONNECTION BETWEEN HERO AND FIRST HISTORY ITEM
    let heroConnection = null;
    if (currentHero && history.length > 0) {
        const prevItem = history[0];
        const isRichLink = prevItem.mode === 'IMAGE';
        let richContent = null;

        if (isRichLink) {
            const prevImg = images.find(i => i.id === prevItem.id);
            if (prevImg) {
                 const { commonTags, colorMatches, techMatches } = getIntersectionAttributes(currentHero, prevImg, tags);
                 if (commonTags.length > 0 || colorMatches.length > 0 || techMatches.length > 0) {
                     richContent = (
                        <div className="relative flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full border border-white/10 bg-zinc-800/50 backdrop-blur-sm p-1.5 flex items-center justify-center relative z-20 shadow-[0_0_20px_rgba(139,92,246,0.1)]">
                                <EsotericSprite node={{ id: currentHero.id, original: currentHero, x: 0, y: 0, currentScale: 1, targetScale: 1, currentOpacity: 1, targetOpacity: 1, relevanceScore: 100, isVisible: true }} />
                            </div>
                            
                            {/* Desktop Annotations */}
                            <div className="hidden md:block"><Annotation side="left" compact verticalOffset={0} isCurved={true}><div className="flex flex-col gap-2 items-end">{colorMatches.slice(0, 3).map((pair, idx) => (<div key={idx} className="flex items-center gap-2"><span className="text-xs font-mono opacity-50 uppercase">{pair.cA}</span><div className="flex -space-x-1"><div className="w-3 h-3 rounded-full border border-white/20" style={{backgroundColor: pair.cA}} /><div className="w-3 h-3 rounded-full border border-white/20" style={{backgroundColor: pair.cB}} /></div></div>))}{techMatches.length > 0 && (<div className="mt-1 text-right">{techMatches.map((t, idx) => (<span key={idx} className="block text-zinc-400 text-sm">{t}</span>))}</div>)}</div></Annotation></div>
                            <div className="hidden md:block"><Annotation side="right" compact verticalOffset={0} isCurved={false}><div className="flex flex-col gap-1 items-start text-zinc-400">{commonTags.slice(0, 4).map((tag, idx) => (<div key={tag.id} className="flex items-center gap-2"><Hash size={12} className="opacity-50" /><span>{tag.label}</span></div>))}{commonTags.length > 4 && <span className="text-xs opacity-50 italic">+{commonTags.length - 4} more...</span>}</div></Annotation></div>
                            
                            {/* Mobile Info */}
                            <MobileConnectionInfo colorMatches={colorMatches} techMatches={techMatches} commonTags={commonTags} />
                        </div>
                     );
                 }
            }
        }

        if (richContent) {
            heroConnection = (
                <div className="w-full max-w-4xl flex flex-col items-center pb-6 relative z-10 animate-in fade-in slide-in-from-top-4 duration-700">
                    {richContent}
                </div>
            );
        } else {
            // Generic Arrow connection for non-image or weak-image connections
            heroConnection = (
                <div className="w-full max-w-4xl flex flex-col items-center pb-6 relative z-10 animate-in fade-in slide-in-from-top-4 duration-700 opacity-60">
                     <GreasePencilArrow seed={500} className="text-zinc-500 w-8 h-16 drop-shadow-sm" />
                </div>
            );
        }
    }

    return (
        <div className="flex flex-col items-center min-h-full pt-0 pb-20 relative">
            <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-zinc-800 to-transparent" />
            
            {/* Render the connection from Hero to first item */}
            {heroConnection}

            {history.map((step, index) => {
                const isFirst = index === 0;
                const prevStep = history[index + 1]; 
                const isDirectLink = step.mode === 'IMAGE' && prevStep?.mode === 'IMAGE';
                const actualIndex = baseIndexOffset + index;
                
                if (step.mode === 'IMAGE' && nsfwFilterActive) {
                    const img = images.find(i => i.id === step.id);
                    if (img) {
                        const hasNsfwTag = [...img.tagIds, ...(img.aiTagIds || [])].some(tid => {
                            if (tid === nsfwTagId) return true;
                            const t = tags.find(tag => tag.id === tid);
                            return t && t.label.trim().toLowerCase() === 'nsfw';
                        });
                        if (hasNsfwTag) return null;
                    }
                }
                if (step.mode === 'TAG') {
                    if (step.meta?.label?.toLowerCase() === 'nsfw') return null;
                }

                return (
                    <div 
                        key={index} 
                        id={`${idPrefix}item-${actualIndex}`}
                        className={`w-full max-w-4xl flex flex-col items-center snap-center shrink-0 py-16 relative group perspective-1000 ${step.mode === 'IMAGE' && onItemClick ? 'cursor-pointer' : ''}`}
                        onClick={(e) => {
                            if (step.mode === 'IMAGE' && onItemClick) {
                                e.stopPropagation();
                                onItemClick(actualIndex);
                            }
                        }}
                    >
                        {!isFirst && !isDirectLink && (<div className="absolute -top-16 left-1/2 -translate-x-1/2 z-0 flex flex-col items-center pointer-events-none opacity-50"><GreasePencilArrow seed={index * 123} className="text-zinc-500 w-8 h-16 drop-shadow-sm" /></div>)}
                        {step.mode === 'IMAGE' && (() => {
                            const img = images.find(i => i.id === step.id);
                            if (!img) return null;
                            const { dateSide, techSide, tilt, verticalOffset, isCurved, seed } = getAnnotationLayout(img.id);
                            const dateObj = new Date(img.captureTimestamp);
                            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const dateStr = dateObj.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
                            const seasonStr = img.inferredSeason;
                            return (
                                <div className="relative z-10 w-full flex flex-col items-center gap-12 px-6 md:px-12 lg:px-0">
                                    
                                    {/* XL+ (Desktop/Landscape Large): Centered with Absolute Annotations */}
                                    <div className="hidden xl:block relative">
                                        <div className="hidden xl:block">
                                            <Annotation side={techSide as 'left' | 'right'} verticalOffset={-20} isCurved={isCurved}>
                                                <div className="flex flex-col gap-1 text-zinc-400"><span className="text-2xl text-zinc-300 font-bold flex items-center gap-2 justify-end flex-row-reverse">{img.cameraModel} <Camera size={20} strokeWidth={2} className="opacity-70" /></span><span className="text-xl italic opacity-80">{img.lensModel}</span><div className="flex items-center gap-3 justify-end mt-2 text-lg opacity-60"><span>ISO {img.iso}</span><span>•</span><span>{img.aperture}</span><span>•</span><span>{img.shutterSpeed}s</span></div></div>
                                            </Annotation>
                                            <Annotation side={dateSide as 'left' | 'right'} verticalOffset={40} isCurved={!isCurved}>
                                                <div className="flex flex-col gap-1 text-zinc-400"><span className="text-3xl text-zinc-200 font-bold flex items-center gap-2">{seasonStr}{seasonStr === 'Summer' ? <Sun size={24} /> : seasonStr === 'Winter' ? <Thermometer size={24} /> : <Cloud size={24} />}</span><span className="text-xl flex items-center gap-2"><Calendar size={18} /> {dateStr}</span><span className="text-xl flex items-center gap-2 italic opacity-70"><Clock size={18} /> {timeStr}</span></div>
                                            </Annotation>
                                        </div>
                                        <div className="bg-white p-3 rounded-sm shadow-2xl transition-transform duration-700 max-w-[400px] relative z-20 group-hover:scale-[1.01]" style={{ transform: `rotate(${tilt}deg)` }}>
                                            <img src={img.fileUrl} alt="" className="w-full h-auto object-contain bg-zinc-100" />
                                        </div>
                                    </div>

                                    {/* < XL (Mobile/Tablet/Portrait Desktop): Flex Row (Image Left, Details Right) */}
                                    <div className="xl:hidden w-full flex items-center justify-center gap-4 md:gap-10 px-4 md:px-8">
                                         {/* Image */}
                                         <div className="bg-white p-2 md:p-3 rounded-sm shadow-xl transition-transform duration-700 w-[40%] md:w-[48%] max-w-[300px] md:max-w-[500px] shrink-0 relative z-20 rotate-1 group-hover:rotate-0">
                                            <img src={img.fileUrl} alt="" className="w-full h-auto object-contain bg-zinc-100" />
                                         </div>

                                         {/* Details */}
                                         <div className="flex flex-col gap-3 md:gap-6 text-left min-w-0 flex-1">
                                            {/* Date Block */}
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-2xl md:text-4xl text-zinc-200 font-bold flex items-center gap-2 font-hand">
                                                    {seasonStr}
                                                    {seasonStr === 'Summer' ? <Sun size={20} className="md:w-8 md:h-8" /> : seasonStr === 'Winter' ? <Thermometer size={20} className="md:w-8 md:h-8" /> : <Cloud size={20} className="md:w-8 md:h-8" />}
                                                </span>
                                                <div className="flex flex-col text-zinc-400 font-hand text-lg md:text-2xl leading-tight">
                                                    <span className="flex items-center gap-2"><Calendar size={14} className="md:w-5 md:h-5" /> {dateStr}</span>
                                                    <span className="flex items-center gap-2 italic opacity-60"><Clock size={14} className="md:w-5 md:h-5" /> {timeStr}</span>
                                                </div>
                                            </div>

                                            {/* Tech Block */}
                                            <div className="h-px bg-zinc-800 w-12 md:w-24" />
                                            
                                            <div className="flex flex-col gap-0.5 text-zinc-500 font-hand text-base md:text-xl">
                                                <span className="text-zinc-300 font-bold flex items-center gap-2">
                                                    <Camera size={16} strokeWidth={2} className="opacity-70 md:w-6 md:h-6" />
                                                    {img.cameraModel}
                                                </span>
                                                <span className="italic opacity-80 truncate">{img.lensModel}</span>
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-sm md:text-base opacity-60 mt-1 font-mono tracking-wider">
                                                    <span>ISO{img.iso}</span>
                                                    <span>•</span>
                                                    <span>{img.aperture}</span>
                                                    <span>•</span>
                                                    <span>{img.shutterSpeed}s</span>
                                                </div>
                                            </div>
                                         </div>
                                    </div>

                                    {isDirectLink && (() => {
                                        const prevImg = images.find(i => i.id === prevStep.id);
                                        if (!prevImg) return null;
                                        const { commonTags, colorMatches, techMatches } = getIntersectionAttributes(img, prevImg, tags);
                                        if(commonTags.length === 0 && colorMatches.length === 0 && techMatches.length === 0) return (<div className="absolute -top-16 left-1/2 -translate-x-1/2 z-0 flex flex-col items-center pointer-events-none opacity-50"><GreasePencilArrow seed={index * 99} className="text-zinc-500 w-8 h-16" /></div>);
                                        return (
                                            <div className="relative flex flex-col items-center animate-in fade-in zoom-in duration-700 delay-300 mt-[-2rem] lg:mt-0">
                                                <div className="w-20 h-20 rounded-full border border-white/10 bg-zinc-800/50 backdrop-blur-sm p-2 flex items-center justify-center relative z-20 shadow-[0_0_30px_rgba(139,92,246,0.1)]">
                                                    <EsotericSprite node={{ id: img.id, original: img, x: 0, y: 0, currentScale: 1, targetScale: 1, currentOpacity: 1, targetOpacity: 1, relevanceScore: 100, isVisible: true }} />
                                                </div>
                                                
                                                {/* Desktop Annotations */}
                                                <div className="hidden md:block"><Annotation side="left" compact verticalOffset={0} isCurved={true}><div className="flex flex-col gap-2 items-end">{colorMatches.slice(0, 3).map((pair, idx) => (<div key={idx} className="flex items-center gap-2"><span className="text-xs font-mono opacity-50 uppercase">{pair.cA}</span><div className="flex -space-x-1"><div className="w-3 h-3 rounded-full border border-white/20" style={{backgroundColor: pair.cA}} /><div className="w-3 h-3 rounded-full border border-white/20" style={{backgroundColor: pair.cB}} /></div></div>))}{techMatches.length > 0 && (<div className="mt-1 text-right">{techMatches.map((t, idx) => (<span key={idx} className="block text-zinc-400 text-sm">{t}</span>))}</div>)}</div></Annotation></div>
                                                <div className="hidden md:block"><Annotation side="right" compact verticalOffset={0} isCurved={false}><div className="flex flex-col gap-1 items-start text-zinc-400">{commonTags.slice(0, 4).map((tag, idx) => (<div key={tag.id} className="flex items-center gap-2"><Hash size={12} className="opacity-50" /><span>{tag.label}</span></div>))}{commonTags.length > 4 && <span className="text-xs opacity-50 italic">+{commonTags.length - 4} more...</span>}</div></Annotation></div>
                                                
                                                {/* Mobile Info */}
                                                <MobileConnectionInfo colorMatches={colorMatches} techMatches={techMatches} commonTags={commonTags} />
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        })()}
                        {step.mode === 'TAG' && (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="right" verticalOffset={0} isCurved><div className="flex flex-col gap-1 text-zinc-400"><span className="text-xl font-bold text-zinc-300">Semantic Focus</span><span className="text-sm opacity-70">Classification</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 bg-zinc-500/10 blur-xl rounded-full" /><div className="relative bg-zinc-900/90 backdrop-blur-md border border-zinc-700 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10"><Hash size={20} className="text-zinc-400" /><span className="text-3xl font-hand text-white tracking-wide pr-4">{step.meta?.label}</span></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Tag Filter</span></div>)}
                        {step.mode === 'COLOR' && (() => { const rgb = hexToRgbVals(step.id); return (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="left" verticalOffset={0} isCurved><div className="flex flex-col gap-1 items-end text-zinc-400"><span className="text-xl font-bold text-zinc-200 font-mono">{step.id}</span><span className="text-sm opacity-60 font-mono">R{rgb[0]} G{rgb[1]} B{rgb[2]}</span><span className="text-xs italic opacity-40 mt-1 font-hand pr-4">Dominant wavelength</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 blur-2xl opacity-40 rounded-full" style={{ backgroundColor: step.id }} /><div className="w-32 h-32 rounded-[2rem] border-4 border-white/10 shadow-2xl relative z-10 flex items-center justify-center overflow-hidden rotate-3" style={{ backgroundColor: step.id }}><div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent pointer-events-none" /><div className="absolute inset-0 bg-gradient-to-bl from-white/20 to-transparent pointer-events-none" /><Palette size={24} className="text-white mix-blend-overlay opacity-50" /></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Color Filter</span></div>); })()}
                        {step.mode === 'DATE' && (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="right" verticalOffset={0} isCurved><div className="flex flex-col gap-1 text-zinc-400"><span className="text-xl font-bold text-zinc-300">Temporal Pivot</span><span className="text-sm opacity-70">30-day Window</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 bg-blue-500/10 blur-xl rounded-full" /><div className="relative bg-zinc-900/90 backdrop-blur-md border border-blue-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10"><Calendar size={20} className="text-blue-400" /><span className="text-3xl font-hand text-white tracking-wide pr-4">{new Date(parseInt(step.id)).toLocaleDateString()}</span></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Date Filter</span></div>)}
                        {step.mode === 'SEASON' && (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="left" verticalOffset={0} isCurved><div className="flex flex-col gap-1 items-end text-zinc-400"><span className="text-xl font-bold text-zinc-300">Cyclical Time</span><span className="text-sm opacity-70">Seasonal Grid</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 bg-amber-500/10 blur-xl rounded-full" /><div className="relative bg-zinc-900/90 backdrop-blur-md border border-amber-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10">{step.id === 'Winter' ? <Snowflake size={24} className="text-cyan-200" /> : step.id === 'Summer' ? <Sun size={24} className="text-amber-400" /> : <Cloud size={24} className="text-zinc-400" />}<span className="text-3xl font-hand text-white tracking-wide pr-4">{step.id}</span></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Seasonal Filter</span></div>)}
                        {step.mode === 'CAMERA' && (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="left" verticalOffset={0} isCurved><div className="flex flex-col gap-1 items-end text-zinc-400"><span className="text-xl font-bold text-zinc-300">Mechanical Eye</span><span className="text-sm opacity-70">Equipment Match</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 bg-emerald-500/10 blur-xl rounded-full" /><div className="relative bg-zinc-900/90 backdrop-blur-md border border-emerald-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10"><Camera size={20} className="text-emerald-400" /><span className="text-3xl font-hand text-white tracking-wide pr-4">{step.id}</span></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Camera Filter</span></div>)}
                        {step.mode === 'LENS' && (<div className="relative z-10 flex flex-col items-center py-12"><div className="relative"><div className="hidden md:block"><Annotation side="right" verticalOffset={0} isCurved><div className="flex flex-col gap-1 text-zinc-400"><span className="text-xl font-bold text-zinc-300">Glass Signature</span><span className="text-sm opacity-70">Optic Match</span></div></Annotation></div><div className="relative cursor-default"><div className="absolute inset-0 bg-amber-500/10 blur-xl rounded-full" /><div className="relative bg-zinc-900/90 backdrop-blur-md border border-amber-900/30 px-10 py-5 rounded-full flex items-center gap-4 shadow-lg ring-1 ring-white/10"><Aperture size={20} className="text-amber-400" /><span className="text-2xl font-hand text-white tracking-wide pr-4">{step.id}</span></div></div></div><span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Lens Filter</span></div>)}
                        {step.mode === 'NONE' && (
                            <div className="relative z-10 flex flex-col items-center py-12">
                                <div className="relative">
                                    <div className="hidden md:block">
                                        <Annotation side="left" verticalOffset={0} isCurved>
                                            <div className="flex flex-col gap-1 items-end text-zinc-400">
                                                <span className="text-xl font-bold text-zinc-300">Visual Index</span>
                                                <span className="text-sm opacity-70">Grid Origin</span>
                                            </div>
                                        </Annotation>
                                    </div>
                                    <div className="relative cursor-default">
                                        <div className="absolute inset-0 bg-zinc-500/10 blur-xl rounded-full" />
                                        <div className="relative bg-zinc-900/90 backdrop-blur-md border border-zinc-700 px-8 py-5 rounded-2xl flex items-center gap-4 shadow-lg ring-1 ring-white/10">
                                            <LayoutGrid size={24} className="text-zinc-400" />
                                            <span className="text-2xl font-hand text-white tracking-wide pr-2">Gallery</span>
                                        </div>
                                    </div>
                                </div>
                                <span className="md:hidden mt-4 text-xs font-mono text-zinc-500 uppercase tracking-widest">Gallery Origin</span>
                            </div>
                        )}
                    </div>
                );
            })}
            <div className="mt-20 flex flex-col items-center gap-3 opacity-30"><div className="w-2 h-2 bg-zinc-600 rounded-full" /><span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Session Origin</span></div>
        </div>
    );
};