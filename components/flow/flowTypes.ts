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
    // Loop context (populated when user leaves this hero for the next)
    traits: string[];
    albumPoolSize: number;
    continuedFromId?: string;
    cameraModel?: string;
    lensModel?: string;
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
