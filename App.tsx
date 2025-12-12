import React, { useState, useEffect } from 'react';
import { ViewMode, ImageNode, Tag } from './types';
import { createMockTags } from './services/dataService';
import Workbench from './components/Workbench';
import Experience from './components/Experience';
import { LayoutGrid, Network } from 'lucide-react';

const App: React.FC = () => {
    const [viewMode, setViewMode] = useState<ViewMode>('WORKBENCH');
    const [images, setImages] = useState<ImageNode[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);

    // Initial Data Load
    useEffect(() => {
        // Load only basic system tags, no images
        const initialTags = createMockTags();
        setTags(initialTags);
        setIsLoaded(true);
    }, []);

    const handleUpdateImages = (updatedImages: ImageNode[]) => {
        setImages(updatedImages);
    };

    const handleAddTag = (newTag: Tag) => {
        setTags(prev => {
            // Prevent duplicates based on ID
            if (prev.some(t => t.id === newTag.id)) return prev;
            return [...prev, newTag];
        });
    };

    if (!isLoaded) return <div className="h-screen w-full bg-[#faf9f6] flex items-center justify-center text-zinc-400 font-light tracking-widest">SOMATIC STUDIO</div>;

    return (
        <div className="flex h-screen w-screen bg-[#faf9f6] overflow-hidden">
            
            {/* Sidebar Navigation (Slim) */}
            <nav className="w-16 border-r border-zinc-200 flex flex-col items-center py-6 gap-8 bg-white z-50 shadow-sm">
                <div className="w-8 h-8 bg-gradient-to-br from-teal-400 to-indigo-500 rounded-md shadow-lg shadow-indigo-100" title="Somatic Studio" />
                
                <div className="flex flex-col gap-6 w-full">
                    <button 
                        onClick={() => setViewMode('WORKBENCH')}
                        className={`w-full p-3 flex justify-center transition-all duration-300 relative group ${viewMode === 'WORKBENCH' ? 'text-teal-600' : 'text-zinc-400 hover:text-zinc-600'}`}
                        title="The Workbench"
                    >
                        <LayoutGrid size={24} strokeWidth={1.5} />
                        {viewMode === 'WORKBENCH' && <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-teal-500" />}
                    </button>
                    
                    <button 
                        onClick={() => setViewMode('EXPERIENCE')}
                        className={`w-full p-3 flex justify-center transition-all duration-300 relative group ${viewMode === 'EXPERIENCE' ? 'text-indigo-600' : 'text-zinc-400 hover:text-zinc-600'}`}
                        title="The Experience"
                    >
                        <Network size={24} strokeWidth={1.5} />
                        {viewMode === 'EXPERIENCE' && <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-indigo-500" />}
                    </button>
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="flex-1 relative">
                {viewMode === 'WORKBENCH' ? (
                    <Workbench 
                        images={images} 
                        tags={tags} 
                        onUpdateImages={handleUpdateImages}
                        onAddTag={handleAddTag}
                    />
                ) : (
                    <Experience 
                        images={images} 
                        tags={tags} 
                    />
                )}
            </main>

        </div>
    );
};

export default App;