import React from 'react';
import { ExperienceNode, AnchorState, Tag } from '../types';
import { EsotericSprite } from './VisualElements';
import ProgressiveImage from './ProgressiveImage';

interface MobileHeroLayoutProps {
    heroNode: ExperienceNode;
    neighbors: ExperienceNode[];
    tags: Tag[];
    onAnchorChange: (anchor: AnchorState) => void;
    onHeroClick: () => void;
}

const MobileHeroLayout: React.FC<MobileHeroLayoutProps> = ({
    heroNode,
    neighbors,
    onAnchorChange,
    onHeroClick,
}) => {
    const palette = heroNode.original.palette.length > 0
        ? heroNode.original.palette
        : ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5'];

    const sorted = [...neighbors].sort((a, b) => b.relevanceScore - a.relevanceScore);

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

            {/* Neighbor grid */}
            {sorted.length > 0 && (
                <div className="flex-1 px-4 pb-8">
                    <p className="text-xs text-zinc-400 font-mono tracking-wider mb-3 text-center">
                        {sorted.length} NEIGHBOR{sorted.length !== 1 ? 'S' : ''}
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                        {sorted.map(node => (
                            <div
                                key={node.id}
                                className="aspect-square cursor-pointer hover:scale-105 transition-transform duration-200"
                                onClick={() => onAnchorChange({ mode: 'IMAGE', id: node.id })}
                            >
                                <EsotericSprite node={node} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MobileHeroLayout;
