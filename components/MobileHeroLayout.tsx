import React, { useState } from 'react';
import { ExperienceNode, AnchorState, RingLevel, Tag } from '../types';
import { RING_COLORS } from '../services/dataService';
import ContextualGlyph from './ContextualGlyph';
import { EsotericSprite } from './VisualElements';
import ProgressiveImage from './ProgressiveImage';

interface MobileHeroLayoutProps {
    heroNode: ExperienceNode;
    neighbors: ExperienceNode[];
    tags: Tag[];
    onAnchorChange: (anchor: AnchorState) => void;
    onHeroClick: () => void;
}

interface RingSection {
    label: string;
    rings: RingLevel[];
    nodes: ExperienceNode[];
    accentColor: string;
    opacity: string;
}

const MobileHeroLayout: React.FC<MobileHeroLayoutProps> = ({
    heroNode,
    neighbors,
    onAnchorChange,
    onHeroClick,
}) => {
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const palette = heroNode.original.palette.length > 0
        ? heroNode.original.palette
        : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];

    // Group neighbors into sections
    const sessionNodes = neighbors.filter(n => n.ringProfile?.ring === 'session');
    const connectedNodes = neighbors.filter(n => {
        const ring = n.ringProfile?.ring;
        return ring === 'thematic' || ring === 'visual' || ring === 'technical';
    });
    const gatewayNodes = neighbors.filter(n => n.ringProfile?.ring === 'gateway');
    // Nodes without ring profile fall into connected
    const unclassified = neighbors.filter(n => !n.ringProfile);

    const sections: RingSection[] = [
        {
            label: 'SESSION',
            rings: ['session'],
            nodes: sessionNodes.sort((a, b) => b.relevanceScore - a.relevanceScore),
            accentColor: RING_COLORS.session,
            opacity: 'opacity-100',
        },
        {
            label: 'CONNECTED',
            rings: ['thematic', 'visual', 'technical'],
            nodes: [...connectedNodes, ...unclassified].sort((a, b) => b.relevanceScore - a.relevanceScore),
            accentColor: RING_COLORS.thematic,
            opacity: 'opacity-100',
        },
        {
            label: 'EXPLORE',
            rings: ['gateway'],
            nodes: gatewayNodes.sort((a, b) => b.relevanceScore - a.relevanceScore),
            accentColor: RING_COLORS.gateway,
            opacity: 'opacity-70',
        },
    ].filter(s => s.nodes.length > 0);

    return (
        <div className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-[#faf9f6]">
            {/* Hero card */}
            <div
                className="flex-shrink-0 p-4 pt-20 cursor-pointer"
                onClick={onHeroClick}
            >
                <ProgressiveImage
                    previewSrc={heroNode.original.fileUrl}
                    fullSrc={heroNode.original.originalUrl}
                    className="w-full max-h-[50vh] rounded-lg overflow-hidden"
                    imgClassName="w-full h-full object-contain rounded-lg"
                    loading="eager"
                />
                {/* Palette dots */}
                <div className="flex gap-1.5 mt-3 justify-center">
                    {palette.slice(0, 5).map((color, i) => (
                        <div
                            key={i}
                            className="w-4 h-4 rounded-full ring-1 ring-black/10"
                            style={{ backgroundColor: color }}
                        />
                    ))}
                </div>
            </div>

            {/* Ring-grouped neighbor sections */}
            {sections.map(section => (
                <div key={section.label} className={`px-4 pb-4 ${section.opacity}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: section.accentColor }}
                        />
                        <p className="text-xs text-zinc-400 font-mono tracking-wider">
                            {section.label}
                        </p>
                        <span className="text-[10px] text-zinc-300 font-mono">
                            {section.nodes.length}
                        </span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        {section.nodes.map(node => (
                            <div
                                key={node.id}
                                className="aspect-square cursor-pointer hover:scale-105 transition-transform duration-200"
                                style={{
                                    boxShadow: node.glyphContext
                                        ? `0 0 8px ${node.glyphContext.haloColor}40`
                                        : 'none',
                                }}
                                onClick={() => onAnchorChange({ mode: 'IMAGE', id: node.id })}
                                onMouseEnter={() => setHoveredId(node.id)}
                                onMouseLeave={() => setHoveredId(null)}
                            >
                                {node.glyphContext ? (
                                    <ContextualGlyph
                                        node={node}
                                        anchorPalette={palette}
                                        isHovered={hoveredId === node.id}
                                        thumbnailSrc={node.original.fileUrl}
                                    />
                                ) : (
                                    <EsotericSprite node={node} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* Bottom spacer */}
            <div className="h-8" />
        </div>
    );
};

export default MobileHeroLayout;
