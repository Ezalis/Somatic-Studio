import { ImageNode } from '../../types';

export type FlowPhase = 'idle' | 'blooming' | 'hero' | 'exploring' | 'album';

export interface ScoredImage {
    image: ImageNode;
    score: number;
    sharedTags: string[];
    sharedCamera: boolean;
    sharedLens: boolean;
    sharedSeason: boolean;
    isBridge: boolean;
    isTemporalNeighbor: boolean;
}

export interface TrailPoint {
    id: string;
    palette: string[];
    label: string;
    timestamp: number;
    traits: string[];
    albumPoolSize: number;
    albumPool: string[];
    continuedFromId?: string;
    cameraModel?: string;
    lensModel?: string;
}

export type AffinityLayer = 'gravity' | 'range' | 'detour';

export interface AffinityImage {
    image: ImageNode;
    affinityScore: number;
    layer: AffinityLayer;
    loopCount: number;
    isHero: boolean;
}

export interface FloatingTag {
    key: string;
    label: string;
    count: number;
    isColor: boolean;
    colorValue?: string;
}

export type ArcPattern = 'circle-back' | 'deep-dive' | 'wander' | 'drift';

export interface SessionArc {
    pattern: ArcPattern;
    narrative: string;
    secondaryLine: string;
    tempSequence: ('warm' | 'cool' | 'neutral')[];
    dominantTrait?: string;
    detourTrait?: string;
}
export interface AlbumImage {
    image: ImageNode;
    tagHits: number;
    isTemporal: boolean;
}

export interface WaterfallNode {
    image: ImageNode;
    tagHits: number;
    relevance: number;
    size: number;
    driftDuration: number;
    driftDelay: number;
}

export interface WaterfallImage {
    image: ImageNode;
    score: number;
}
