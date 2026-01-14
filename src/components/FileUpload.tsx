import { useCallback } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { parseApkgFile } from '../utils/ankiParser';
import { useAppStore } from '../store/useAppStore';
import { useToastStore } from '../store/useToastStore';

export const FileUpload: React.FC = () => {
    const setCollection = useAppStore(state => state.setCollection);
    const fileName = useAppStore(state => state.fileName);
    const isLoadingCollection = useAppStore(state => state.isLoadingCollection);
    const loadingProgress = useAppStore(state => state.loadingProgress);
    const setIsLoadingCollection = useAppStore(state => state.setIsLoadingCollection);
    const setLoadingProgress = useAppStore(state => state.setLoadingProgress);
    const addToast = useToastStore(state => state.addToast);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

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

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file || !file.name.endsWith('.apkg')) {
            addToast({
                type: 'warning',
                title: 'Invalid file',
                message: 'Please drop a valid .apkg file'
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

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    if (isLoadingCollection) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm text-gray-200">{loadingProgress || 'Loading...'}</span>
            </div>
        );
    }

    if (fileName) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-700 rounded-lg">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-gray-200 truncate max-w-[200px]">{fileName}</span>
                <button
                    onClick={() => setCollection(null, null)}
                    className="ml-2 text-xs text-gray-400 hover:text-white"
                >
                    ✕
                </button>
            </div>
        );
    }

    return (
        <label
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition-colors"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
        >
            <Upload className="w-4 h-4" />
            <span className="text-sm font-medium">Load .apkg</span>
            <input
                type="file"
                accept=".apkg"
                onChange={handleFileChange}
                className="hidden"
            />
        </label>
    );
};
