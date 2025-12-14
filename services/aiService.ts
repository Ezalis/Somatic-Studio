
import { GoogleGenAI, Schema, Type } from "@google/genai";
import { ImageNode, Tag, TagType } from '../types';
import { generateUUID } from './dataService';

// Initialize Gemini
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
        
        await new Promise(resolve => setTimeout(resolve, 200)); 
    }

    return results;
};

// --- HARMONIZATION FEATURE (v1.0) ---

export const harmonizeTagsBatch = async (
    images: ImageNode[],
    allTags: Tag[], // Full list of definitions
    preferredCommonTags: string[], // Labels of top 100 most frequent tags
    onProgress: (completed: number, total: number) => void
): Promise<{ imageId: string, tags: Tag[], tagIds: string[] }[]> => {

    const results: { imageId: string, tags: Tag[], tagIds: string[] }[] = [];
    let completed = 0;
    
    // We can process slightly larger batches since we are sending text metadata mostly, 
    // but we might send image data if we want visual confirmation. 
    // For pure tag harmonization, context is key.
    // Let's stick to small batches to ensure the output JSON doesn't get truncated.
    const BATCH_SIZE = 5;

    for (let i = 0; i < images.length; i += BATCH_SIZE) {
        const batch = images.slice(i, i + BATCH_SIZE);
        
        // Prepare Payload
        const batchPayload = batch.map(img => {
            // Resolve tag IDs to labels
            const labels = [...img.tagIds, ...(img.aiTagIds || [])].map(tid => {
                const t = allTags.find(tag => tag.id === tid);
                return t ? t.label : tid;
            });
            return {
                id: img.id,
                currentTags: labels
            };
        });

        try {
            const responseSchema: Schema = {
                type: Type.OBJECT,
                properties: {
                    results: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                id: { type: Type.STRING },
                                tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                            }
                        }
                    }
                }
            };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: {
                    parts: [
                        {
                            text: `You are a Semantic Harmonizer for a photography database.
                            
                            Goal: Increase the overlap (collision) of tags between images to create a denser network graph.
                            Requirement: Less than 25% of tags for any image should be unique to that image.
                            
                            Input: A batch of 5 images with their CURRENT tags.
                            Context: Here is a list of PREFERRED COMMON TAGS found frequently in the wider library:
                            ${JSON.stringify(preferredCommonTags.slice(0, 150))}

                            Instructions:
                            1. Rewrite the tags for each image.
                            2. AGGRESSIVELY use tags from the PREFERRED COMMON TAGS list if they are semantically relevant.
                            3. Consolidate specific/unique synonyms into these common terms (e.g., change "Scarlet" to "Red", change "Vehicle" to "Car" if "Car" is in the common list).
                            4. Keep unique tags ONLY if they are critical to the specific image's distinct character.
                            5. Return exactly 15-20 tags per image.

                            Input Data:
                            ${JSON.stringify(batchPayload)}
                            `
                        }
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: responseSchema,
                    temperature: 0.3 // Lower temperature for more consistent classification
                }
            });

            const jsonStr = response.text || "{}";
            const batchResponse = JSON.parse(jsonStr);
            
            if (batchResponse.results) {
                batchResponse.results.forEach((res: any) => {
                    const newTags: Tag[] = [];
                    const tagIds: string[] = [];
                    
                    if (res.tags && Array.isArray(res.tags)) {
                        res.tags.forEach((label: string) => {
                            const cleanLabel = label.trim();
                            if (cleanLabel) {
                                const id = cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                                tagIds.push(id);
                                newTags.push({
                                    id,
                                    label: cleanLabel,
                                    type: TagType.AI_GENERATED // Harmonized tags treated as AI
                                });
                            }
                        });
                    }
                    results.push({ imageId: res.id, tags: newTags, tagIds });
                });
            }

        } catch (e) {
            console.error("Harmonization Batch Failed", e);
        }

        completed += batch.length;
        onProgress(Math.min(completed, images.length), images.length);
        await new Promise(resolve => setTimeout(resolve, 200)); 
    }

    return results;
};
