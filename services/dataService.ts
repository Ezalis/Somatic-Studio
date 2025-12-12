
import { ImageNode, Tag, TagType } from '../types';
import { getSavedTagsForFile } from './resourceService';

// --- Utilities ---

export const generateUUID = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : ((r & 0x3) | 0x8);
        return v.toString(16);
    });
};

export const getSeason = (date: Date): string => {
    const month = date.getMonth(); // 0-11
    // Simple Northern Hemisphere logic
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';
    if (month >= 8 && month <= 10) return 'Autumn';
    return 'Winter';
};

// --- Mock Data Generators ---
const CAMERAS = ['Fujifilm X-T5', 'Fujifilm GFX 100S', 'Fujifilm X-Pro3'];
const LENSES = ['XF 35mm f/1.4', 'GF 80mm f/1.7', 'XF 23mm f/2'];

const getRandomHexColor = () => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

export const generateMockImages = (count: number, availableTags: Tag[]): ImageNode[] => {
    const images: ImageNode[] = [];
    const now = Date.now();

    for (let i = 0; i < count; i++) {
        const fileName = `mock_img_${i}_${Math.floor(Math.random() * 1000)}.jpg`;

        // Random date within last 2 years
        const timestamp = now - Math.floor(Math.random() * 63072000000);
        const date = new Date(timestamp);
        const dateStr = date.toISOString().split('T')[0];
        const season = getSeason(date);
        
        const camera = CAMERAS[Math.floor(Math.random() * CAMERAS.length)];
        const lens = LENSES[Math.floor(Math.random() * LENSES.length)];

        // Assign some random tags
        const assignedTags = new Set<string>();
        assignedTags.add(season.toLowerCase()); // Auto-tag season
        assignedTags.add(camera.replace(/\s/g, '-').toLowerCase()); // Auto-tag camera
        
        // Add 1-3 random qualitative/categorical tags
        if (availableTags.length > 0) {
            const numRandom = Math.floor(Math.random() * 3) + 1;
            for(let j=0; j<numRandom; j++) {
                const randomTag = availableTags[Math.floor(Math.random() * availableTags.length)];
                assignedTags.add(randomTag.id);
            }
        }

        // --- PERSISTENCE CHECK ---
        // Check if we have saved tags for this filename in our "resources" folder
        const savedTags = getSavedTagsForFile(fileName);
        savedTags.forEach(t => assignedTags.add(t));

        // Generate mock palette
        const mockPalette = Array(5).fill(0).map(() => getRandomHexColor());

        images.push({
            id: generateUUID(),
            fileName: fileName,
            fileUrl: `https://picsum.photos/seed/${i + 123}/400/600`, // Portrait aspect
            captureTimestamp: timestamp,
            inferredSeason: season,
            shootDayClusterId: dateStr,
            cameraModel: camera,
            lensModel: lens,
            aperture: `f/${(Math.random() * 10 + 1.4).toFixed(1)}`,
            shutterSpeed: `1/${Math.floor(Math.random() * 1000)}`,
            iso: Math.floor(Math.random() * 10) * 100 + 100,
            tagIds: Array.from(assignedTags),
            palette: mockPalette
        });
    }
    
    return images.sort((a, b) => a.captureTimestamp - b.captureTimestamp);
};
