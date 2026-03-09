import { ImageNode } from '../../types';

export type FlowPhase = 'idle' | 'blooming' | 'hero' | 'exploring';

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
    photoOpacity: number;
    driftDuration: number;
    driftDelay: number;
}
