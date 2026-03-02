import React, { useEffect, useState } from 'react';
import { X, Shield } from 'lucide-react';

interface FieldGuideOverlayProps {
    onClose: () => void;
    onAdminAccess: () => void;
}

const FieldGuideOverlay: React.FC<FieldGuideOverlayProps> = ({ onClose, onAdminAccess }) => {
    const [adminClicks, setAdminClicks] = useState(0);

    // Prevent scroll propagation on body when open
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = ''; };
    }, []);

    const handleAdminClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (e.shiftKey) {
            onAdminAccess();
            return;
        }
        const next = adminClicks + 1;
        setAdminClicks(next);
        if (next >= 5) {
            onAdminAccess();
        }
    };

    return (
        <div
            className="fixed inset-0 z-[80] bg-zinc-950 animate-in fade-in duration-500 overflow-y-auto"
            onClick={onClose}
        >
             {/* Admin Access Button (Subtle/Hidden) */}
             <button
                onClick={handleAdminClick}
                className="fixed top-8 left-8 sm:left-20 z-[90] flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono uppercase tracking-widest text-zinc-800 hover:text-zinc-500 transition-colors cursor-default select-none group"
                title="Restricted Access"
             >
                <Shield size={12} className="opacity-50 group-hover:opacity-100" />
                <span>Admin</span>
             </button>

             {/* Fixed Close Button matching Detail View */}
             <button
                className="fixed top-8 right-8 sm:right-20 z-[90] p-2 text-zinc-400 hover:text-white bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full transition-all duration-200 shadow-xl border border-white/10"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                title="Close Field Guide"
            >
                <X size={24} />
            </button>

            <div className="min-h-full flex items-center justify-center p-6 md:p-12" onClick={onClose}>
                <div
                    className="max-w-5xl w-full bg-zinc-900 border border-zinc-800 rounded-lg p-8 md:p-16 shadow-2xl relative overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Decorative Elements - Darker for readability */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-900 via-purple-900 to-amber-900 opacity-50" />
                    <div className="absolute -right-20 -top-20 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative z-10 flex flex-col gap-12">
                        <div className="flex flex-col gap-2">
                            <h1 className="font-hand text-6xl md:text-8xl text-zinc-100 font-bold tracking-tight drop-shadow-sm">Field Guide</h1>
                            <p className="font-mono text-xs md:text-sm text-zinc-500 uppercase tracking-widest ml-2">Somatic Studio v1.0</p>
                        </div>

                        <div className="space-y-4 font-hand text-2xl md:text-3xl text-zinc-300 leading-relaxed border-l-4 border-zinc-800 pl-8 py-2">
                            <p>
                                <span className="text-white font-bold">Welcome to the archive.</span>
                            </p>
                            <p className="opacity-90">
                                This is not a static folder structure, but a living web of memory, color, and light. There is no wrong path here, only the journey.
                            </p>
                        </div>

                        <div className="grid md:grid-cols-2 gap-x-12 gap-y-16 pt-8">
                            <div className="space-y-3 group">
                                <h3 className="font-mono text-xs text-indigo-400 font-bold uppercase tracking-widest group-hover:text-indigo-300 transition-colors">01. The Pattern</h3>
                                <p className="font-hand text-2xl text-zinc-400 leading-relaxed group-hover:text-zinc-200 transition-colors">
                                    The grid is a living map. Each floating "esoteric sprite" is a unique signature generated from the color palette and complexity of a photograph.
                                </p>
                            </div>

                            <div className="space-y-3 group">
                                <h3 className="font-mono text-xs text-amber-400 font-bold uppercase tracking-widest group-hover:text-amber-300 transition-colors">02. The Reveal</h3>
                                <p className="font-hand text-2xl text-zinc-400 leading-relaxed group-hover:text-zinc-200 transition-colors">
                                    Select a symbol to bring the memory into focus. The studio rearranges itself around your selection, pulling related memories closer.
                                </p>
                            </div>

                            <div className="space-y-3 group">
                                <h3 className="font-mono text-xs text-emerald-400 font-bold uppercase tracking-widest group-hover:text-emerald-300 transition-colors">03. The Thread</h3>
                                <p className="font-hand text-2xl text-zinc-400 leading-relaxed group-hover:text-zinc-200 transition-colors">
                                    Navigate by feeling. Use the <span className="text-zinc-100">Satellite Layers</span> to pivot through color space or semantic concepts. Drift through the archive on threads of similarity.
                                </p>
                            </div>

                            <div className="space-y-3 group">
                                <h3 className="font-mono text-xs text-rose-400 font-bold uppercase tracking-widest group-hover:text-rose-300 transition-colors">04. The Discovery</h3>
                                <p className="font-hand text-2xl text-zinc-400 leading-relaxed group-hover:text-zinc-200 transition-colors">
                                    Every step is recorded. Your path creates a unique <span className="text-zinc-100">History Trail</span> below, allowing you to trace the lineage of your exploration.
                                </p>
                            </div>
                        </div>

                        <div className="pt-16 mt-8 border-t border-zinc-800 text-center opacity-50 hover:opacity-100 transition-opacity">
                            <p className="font-hand text-2xl italic text-zinc-500">"Wander. Get lost. Find the patterns that bind these moments together."</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FieldGuideOverlay;
