
import { GoogleGenAI, Schema, Type } from "@google/genai";
import { ImageNode, Tag, TagType } from '../types';
import { generateUUID } from './dataService';

// Initialize Gemini
// Note: In a production app, handle API key security more robustly.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper: Resize image to a smaller dimension (e.g. 512px) to optimize AI analysis speed
const resizeImageToBase64 = (url: string, maxDim: number = 512): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Maintain aspect ratio
            if (width > height) {
                if (width > maxDim) {
                    height *= maxDim / width;
                    width = maxDim;
                }
            } else {
                if (height > maxDim) {
                    width *= maxDim / height;
                    height = maxDim;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Canvas context failed"));
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to JPEG base64 string at reasonable quality
            // This massively reduces payload size compared to raw uploads
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
        };
        img.onerror = (err) => reject(err);
        img.src = url;
    });
};

export const generateAITagsForImage = async (
    imageNode: ImageNode
): Promise<{ tags: Tag[], tagIds: string[] }> => {
    try {
        // Optimization: Use resized image for analysis
        const base64Data = await resizeImageToBase64(imageNode.fileUrl);

        const responseSchema: Schema = {
            type: Type.OBJECT,
            properties: {
                tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "A list of 20 conceptual tags."
                }
            }
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: base64Data
                        }
                    },
                    {
                        text: `Analyze this photograph for a photographer's asset management system. 
                        Generate exactly 20 unique, high-quality conceptual tags.
                        
                        STRATEGY FOR INTERCONNECTED WEB:
                        1. Broad Connectors (10 tags): Generate broad themes (e.g., "Portrait", "Natural Light", "Urban", "Melancholy") that are likely to overlap with other images in a diverse dataset.
                        2. Unique Inferences (10 tags): Generate highly specific, evocative, or abstract tags (e.g., "Suburban Ennui", "Cobalt Haze", "Fugitive Moment") that capture the unique essence of this specific image.

                        Focus on:
                        - Mood and emotional resonance.
                        - Subtle facial expressions or body language.
                        - Specific Color Tones (e.g., "Crimson", "Desaturated Cyan").
                        - Aesthetic style (e.g., "Cinematic", "Lo-Fi").
                        
                        Return ONLY the tags as a JSON array.`
                    }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.7
            }
        });

        const jsonStr = response.text || "{}";
        const result = JSON.parse(jsonStr);
        const tagLabels: string[] = result.tags || [];

        const newTags: Tag[] = [];
        const tagIds: string[] = [];

        tagLabels.slice(0, 20).forEach(label => {
            const cleanLabel = label.trim();
            if (cleanLabel) {
                const id = cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                tagIds.push(id);
                newTags.push({
                    id,
                    label: cleanLabel,
                    type: TagType.AI_GENERATED
                });
            }
        });

        return { tags: newTags, tagIds };

    } catch (error) {
        console.error("Error generating AI tags for image:", imageNode.fileName, error);
        return { tags: [], tagIds: [] };
    }
};

export const processBatchAIAnalysis = async (
    images: ImageNode[],
    onProgress: (completed: number, total: number) => void
): Promise<{ imageId: string, tags: Tag[], tagIds: string[] }[]> => {
    
    const results: { imageId: string, tags: Tag[], tagIds: string[] }[] = [];
    let completed = 0;

    // Optimization: Process in concurrent batches to improve speed
    // Batch size of 3 balances speed with rate limits for the Flash model
    const BATCH_SIZE = 3;

    for (let i = 0; i < images.length; i += BATCH_SIZE) {
        const batch = images.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (img) => {
             const result = await generateAITagsForImage(img);
             return {
                 imageId: img.id,
                 tags: result.tags,
                 tagIds: result.tagIds
             };
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        completed += batch.length;
        onProgress(Math.min(completed, images.length), images.length);
        
        // Small delay to maintain stability and avoid burst rate limits
        await new Promise(resolve => setTimeout(resolve, 200)); 
    }

    return results;
};
