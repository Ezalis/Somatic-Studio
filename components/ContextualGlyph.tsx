import React from 'react';
import { ExperienceNode, RingLevel } from '../types';

interface ContextualGlyphProps {
    node: ExperienceNode;
    anchorPalette: string[];
    isHovered: boolean;
    thumbnailSrc: string;
}

const RING_LABELS: Record<RingLevel, string> = {
    session: 'SESSION',
    thematic: 'THEMATIC',
    visual: 'VISUAL',
    technical: 'TECHNICAL',
    gateway: 'GATEWAY',
};

// --- Ring-specific SVG shape generators ---

function SessionShape({ color, seed }: { color: string; seed: number }) {
    // Concentric arcs — clock/time feel
    const arcs = [0, 1, 2].map(i => {
        const r = 18 + i * 10;
        const startAngle = ((seed + i * 47) % 360) * (Math.PI / 180);
        const sweep = (120 + (seed % 60)) * (Math.PI / 180);
        const x1 = 50 + r * Math.cos(startAngle);
        const y1 = 50 + r * Math.sin(startAngle);
        const x2 = 50 + r * Math.cos(startAngle + sweep);
        const y2 = 50 + r * Math.sin(startAngle + sweep);
        return (
            <path
                key={i}
                d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`}
                fill="none"
                stroke={color}
                strokeWidth={2.5 - i * 0.5}
                opacity={0.7 - i * 0.15}
                strokeLinecap="round"
            />
        );
    });
    return <>{arcs}</>;
}

function ThematicShape({ color, seed }: { color: string; seed: number }) {
    // Overlapping circles — Venn diagram feel
    const circles = [0, 1, 2].map(i => {
        const angle = ((seed + i * 120) % 360) * (Math.PI / 180);
        const dist = 10 + (seed % 8);
        const cx = 50 + dist * Math.cos(angle);
        const cy = 50 + dist * Math.sin(angle);
        const r = 16 + (seed % 6);
        return (
            <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill={color}
                opacity={0.2}
                stroke={color}
                strokeWidth={1.5}
                strokeOpacity={0.5}
            />
        );
    });
    return <>{circles}</>;
}

function VisualShape({ color, seed }: { color: string; seed: number }) {
    // Gradient rectangle — palette card feel
    const rotation = (seed % 45) - 22;
    const w = 28 + (seed % 10);
    const h = 22 + (seed % 8);
    return (
        <g transform={`rotate(${rotation}, 50, 50)`}>
            <rect
                x={50 - w / 2}
                y={50 - h / 2}
                width={w}
                height={h}
                rx={3}
                fill={color}
                opacity={0.35}
                stroke={color}
                strokeWidth={1.5}
                strokeOpacity={0.6}
            />
            <rect
                x={50 - w / 2 + 4}
                y={50 - h / 2 + 4}
                width={w - 8}
                height={h - 8}
                rx={2}
                fill={color}
                opacity={0.2}
            />
        </g>
    );
}

function TechnicalShape({ color, seed }: { color: string; seed: number }) {
    // Angular polygon — mechanical/gear feel
    const sides = 5 + (seed % 3);
    const r = 20 + (seed % 8);
    const points = Array.from({ length: sides }, (_, i) => {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 2 + ((seed % 30) * Math.PI / 180);
        const rVar = r + ((seed + i * 7) % 6 - 3);
        return `${50 + rVar * Math.cos(angle)},${50 + rVar * Math.sin(angle)}`;
    }).join(' ');
    return (
        <polygon
            points={points}
            fill={color}
            opacity={0.25}
            stroke={color}
            strokeWidth={1.5}
            strokeOpacity={0.6}
            strokeLinejoin="bevel"
        />
    );
}

function GatewayShape({ color, seed }: { color: string; seed: number }) {
    // Scattered dots/particles — diffuse, exploratory feel
    const dots = Array.from({ length: 7 }, (_, i) => {
        const angle = ((seed + i * 51) % 360) * (Math.PI / 180);
        const dist = 8 + ((seed + i * 13) % 20);
        const cx = 50 + dist * Math.cos(angle);
        const cy = 50 + dist * Math.sin(angle);
        const r = 2 + ((seed + i) % 3);
        return (
            <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill={color}
                opacity={0.3 + ((seed + i) % 4) * 0.1}
            />
        );
    });
    return <>{dots}</>;
}

const SHAPE_COMPONENTS: Record<RingLevel, React.FC<{ color: string; seed: number }>> = {
    session: SessionShape,
    thematic: ThematicShape,
    visual: VisualShape,
    technical: TechnicalShape,
    gateway: GatewayShape,
};

function hashString(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i) | 0;
    return Math.abs(h);
}

const ContextualGlyph: React.FC<ContextualGlyphProps> = React.memo(({
    node,
    anchorPalette: _anchorPalette,
    isHovered,
    thumbnailSrc,
}) => {
    const ctx = node.glyphContext;
    if (!ctx) return null;

    const seed = hashString(node.id);
    const nucleusColor = node.original.palette[0] || '#808080';
    const ShapeComponent = SHAPE_COMPONENTS[ctx.shapeKey];

    return (
        <div className="relative w-full h-full">
            {/* Abstract glyph — fades out on hover */}
            <div
                className={`absolute inset-0 transition-opacity duration-300 ${isHovered ? 'opacity-0' : 'opacity-100'}`}
            >
                <svg
                    viewBox="0 0 100 100"
                    className="w-full h-full drop-shadow-md overflow-visible"
                    shapeRendering="geometricPrecision"
                >
                    {/* Layer 1: Halo ring */}
                    <defs>
                        <radialGradient id={`halo-${node.id}`} cx="50%" cy="50%" r="70%">
                            <stop offset="40%" stopColor={ctx.haloColor} stopOpacity={ctx.haloIntensity * 0.5} />
                            <stop offset="100%" stopColor={ctx.haloColor} stopOpacity={0} />
                        </radialGradient>
                    </defs>
                    <circle cx={50} cy={50} r={55} fill={`url(#halo-${node.id})`} />

                    {/* Layer 2: Ring-specific shape */}
                    <ShapeComponent color={ctx.affinityColor} seed={seed} />

                    {/* Layer 3: Core nucleus */}
                    <circle
                        cx={50}
                        cy={50}
                        r={6 + ctx.relevanceScale * 4}
                        fill={nucleusColor}
                        opacity={0.9}
                    />
                </svg>
            </div>

            {/* Photo thumbnail — fades in on hover */}
            <div
                className={`absolute inset-0 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}
            >
                <img
                    src={thumbnailSrc}
                    alt=""
                    className="w-full h-full object-cover rounded-lg"
                    loading="lazy"
                />
                {/* Ring label overlay */}
                <div
                    className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 text-[8px] font-mono tracking-wider text-white/80 text-center rounded-b-lg"
                    style={{ backgroundColor: `${ctx.haloColor}80` }}
                >
                    {RING_LABELS[ctx.shapeKey]}
                </div>
            </div>
        </div>
    );
}, (prev, next) => {
    // Custom memo comparator: only re-render when meaningful props change
    const prevCtx = prev.node.glyphContext;
    const nextCtx = next.node.glyphContext;
    if (!prevCtx || !nextCtx) return false;
    return (
        prevCtx.shapeKey === nextCtx.shapeKey &&
        prevCtx.haloColor === nextCtx.haloColor &&
        Math.abs(prevCtx.haloIntensity - nextCtx.haloIntensity) < 0.01 &&
        prev.isHovered === next.isHovered &&
        prev.node.id === next.node.id
    );
});

export default ContextualGlyph;
