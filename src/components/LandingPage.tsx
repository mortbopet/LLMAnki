import React, { useCallback, useState } from 'react';
import { Upload, Sparkles, FileText, Loader2, Wand2, Brain } from 'lucide-react';
import { parseApkgFile } from '../utils/ankiParser';
import { useAppStore } from '../store/useAppStore';
import { useToastStore } from '../store/useToastStore';

export const LandingPage: React.FC = () => {
    const setCollection = useAppStore(state => state.setCollection);
    const isLoadingCollection = useAppStore(state => state.isLoadingCollection);
    const loadingProgress = useAppStore(state => state.loadingProgress);
    const setIsLoadingCollection = useAppStore(state => state.setIsLoadingCollection);
    const setLoadingProgress = useAppStore(state => state.setLoadingProgress);
    const addToast = useToastStore(state => state.addToast);

    const [isDragOver, setIsDragOver] = useState(false);

    const handleFile = useCallback(async (file: File) => {
        if (!file.name.endsWith('.apkg')) {
            addToast({
                type: 'warning',
                title: 'Invalid file',
                message: 'Please select a valid .apkg file'
            });
            return;
        }

        setIsLoadingCollection(true);
        setLoadingProgress('Reading file...');

        try {
            const collection = await parseApkgFile(file, (progress) => {
                setLoadingProgress(progress);
            });
            setCollection(collection, file.name);
            addToast({
                type: 'success',
                title: 'Deck loaded successfully',
                message: `Found ${collection.decks.size} decks and ${collection.cards.size} cards`
            });
        } catch (error) {
            console.error('Failed to parse APKG file:', error);
            setIsLoadingCollection(false);
            setLoadingProgress(null);
            addToast({
                type: 'error',
                title: 'Failed to load deck',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }, [setCollection, addToast, setIsLoadingCollection, setLoadingProgress]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleFile(file);
        }
    }, [handleFile]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const file = e.dataTransfer.files[0];
        if (file) {
            handleFile(file);
        }
    }, [handleFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
            <div className="max-w-2xl w-full text-center space-y-8">
                {/* Logo and Title */}
                <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3">
                        <Sparkles className="w-12 h-12 text-blue-400" />
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                            LLMAnki
                        </h1>
                    </div>
                    <p className="text-xl text-gray-300">
                        AI-Powered Anki Deck Improvement
                    </p>
                </div>

                {/* Upload Area */}
                <div
                    className={`relative border-2 border-dashed rounded-2xl p-12 transition-all cursor-pointer
                        ${isDragOver
                            ? 'border-blue-400 bg-blue-400/10 scale-105'
                            : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50'
                        }
                        ${isLoadingCollection ? 'pointer-events-none' : ''}
                    `}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => document.getElementById('file-input')?.click()}
                >
                    {isLoadingCollection ? (
                        <div className="flex flex-col items-center gap-4">
                            <Loader2 className="w-16 h-16 text-blue-400 animate-spin" />
                            <div className="space-y-2">
                                <p className="text-lg text-gray-200">{loadingProgress || 'Loading...'}</p>
                                <p className="text-sm text-gray-400">Processing deck...</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4">
                            <div className={`p-4 rounded-full ${isDragOver ? 'bg-blue-400/20' : 'bg-gray-700'}`}>
                                <Upload className={`w-12 h-12 ${isDragOver ? 'text-blue-400' : 'text-gray-400'}`} />
                            </div>
                            <div className="space-y-2">
                                <p className="text-lg text-gray-200">
                                    {isDragOver ? 'Drop your deck here!' : 'Drop your Anki deck here'}
                                </p>
                                <p className="text-sm text-gray-400">
                                    or <span className="text-blue-400 hover:underline">click to browse</span>
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <FileText className="w-4 h-4" />
                                <span>Supports .apkg files</span>
                            </div>
                        </div>
                    )}
                    <input
                        id="file-input"
                        type="file"
                        accept=".apkg"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                </div>

                {/* Features */}
                <div className="grid grid-cols-2 gap-6 pt-8">
                    <div className="text-center space-y-2">
                        <div className="mx-auto w-12 h-12 rounded-full bg-purple-900/50 flex items-center justify-center">
                            <Wand2 className="w-6 h-6 text-purple-400" />
                        </div>
                        <h3 className="font-medium text-gray-200">AI Analysis</h3>
                        <p className="text-xs text-gray-400">Get intelligent feedback on your flashcards</p>
                    </div>
                    <div className="text-center space-y-2">
                        <div className="mx-auto w-12 h-12 rounded-full bg-green-900/50 flex items-center justify-center">
                            <Brain className="w-6 h-6 text-green-400" />
                        </div>
                        <h3 className="font-medium text-gray-200">Smart Suggestions</h3>
                        <p className="text-xs text-gray-400">AI-generated improvements and new cards</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
