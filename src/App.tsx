import { useCallback, useState } from 'react';
import {
    Sparkles,
    Settings,
    Download,
    Wand2,
    Loader2,
    AlertCircle,
    BookOpen,
    Layers
} from 'lucide-react';
import { useAppStore } from './store/useAppStore';
import { FileUpload } from './components/FileUpload';
import { DeckBrowser } from './components/DeckBrowser';
import { CardList } from './components/CardList';
import { CardViewer } from './components/CardViewer';
import { AnalysisPanel } from './components/AnalysisPanel';
import { DeckAnalysisPanel } from './components/DeckAnalysisPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { PendingChanges } from './components/PendingChanges';
import { ToastContainer } from './components/ToastContainer';
import { analyzeCard, analyzeDeck } from './utils/llmService';
import { exportCollection, getCardsInDeck } from './utils/ankiParser';

function App() {
    const collection = useAppStore(state => state.collection);
    const selectedDeckId = useAppStore(state => state.selectedDeckId);
    const selectedCard = useAppStore(state => state.selectedCard);
    const selectedCardId = useAppStore(state => state.selectedCardId);
    const analysisResult = useAppStore(state => state.analysisResult);
    const isAnalyzing = useAppStore(state => state.isAnalyzing);
    const analysisError = useAppStore(state => state.analysisError);
    const llmConfig = useAppStore(state => state.llmConfig);
    const setShowSettings = useAppStore(state => state.setShowSettings);
    const setAnalysisResult = useAppStore(state => state.setAnalysisResult);
    const setIsAnalyzing = useAppStore(state => state.setIsAnalyzing);
    const setAnalysisError = useAppStore(state => state.setAnalysisError);
    const cacheAnalysis = useAppStore(state => state.cacheAnalysis);
    const deckAnalysisResult = useAppStore(state => state.deckAnalysisResult);
    const isDeckAnalyzing = useAppStore(state => state.isDeckAnalyzing);
    const deckAnalysisProgress = useAppStore(state => state.deckAnalysisProgress);
    const setDeckAnalysisResult = useAppStore(state => state.setDeckAnalysisResult);
    const setIsDeckAnalyzing = useAppStore(state => state.setIsDeckAnalyzing);
    const setDeckAnalysisProgress = useAppStore(state => state.setDeckAnalysisProgress);

    const [additionalPrompt, setAdditionalPrompt] = useState('');
    const [deckAdditionalPrompt, setDeckAdditionalPrompt] = useState('');

    const handleAnalyze = useCallback(async () => {
        if (!selectedCard || !selectedCardId) return;

        if (!llmConfig.apiKey && llmConfig.providerId !== 'ollama') {
            setAnalysisError('Please configure your API key in Settings first.');
            return;
        }

        setIsAnalyzing(true);
        setAnalysisError(null);

        try {
            const result = await analyzeCard(selectedCard, llmConfig, additionalPrompt);
            setAnalysisResult(result);
            cacheAnalysis(selectedCardId, result);
        } catch (error) {
            console.error('Analysis failed:', error);
            setAnalysisError(error instanceof Error ? error.message : 'Analysis failed');
        } finally {
            setIsAnalyzing(false);
        }
    }, [selectedCard, selectedCardId, llmConfig, additionalPrompt, setAnalysisResult, setIsAnalyzing, setAnalysisError, cacheAnalysis]);

    const handleDeckAnalyze = useCallback(async () => {
        if (!collection || selectedDeckId === null) return;

        if (!llmConfig.apiKey && llmConfig.providerId !== 'ollama') {
            setAnalysisError('Please configure your API key in Settings first.');
            return;
        }

        const deck = collection.decks.get(selectedDeckId);
        if (!deck) return;

        const cards = getCardsInDeck(collection, selectedDeckId, true);
        if (cards.length === 0) {
            setAnalysisError('No cards in this deck to analyze.');
            return;
        }

        setIsDeckAnalyzing(true);
        setDeckAnalysisProgress({ current: 0, total: cards.length });
        setAnalysisError(null);

        try {
            const result = await analyzeDeck(
                collection,
                deck,
                cards,
                llmConfig,
                deckAdditionalPrompt,
                (current, total, cardId, cardResult) => {
                    setDeckAnalysisProgress({ current, total });
                    if (cardId && cardResult) {
                        cacheAnalysis(cardId, cardResult);
                    }
                }
            );
            setDeckAnalysisResult(result);
        } catch (error) {
            console.error('Deck analysis failed:', error);
            setAnalysisError(error instanceof Error ? error.message : 'Deck analysis failed');
        } finally {
            setIsDeckAnalyzing(false);
            setDeckAnalysisProgress(null);
        }
    }, [collection, selectedDeckId, llmConfig, deckAdditionalPrompt, setIsDeckAnalyzing, setDeckAnalysisProgress, setDeckAnalysisResult, setAnalysisError, cacheAnalysis]);

    const handleExport = useCallback(async () => {
        if (!collection) return;

        try {
            const blob = await exportCollection(collection);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'modified_collection.apkg';
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. See console for details.');
        }
    }, [collection]);

    return (
        <div className="h-screen flex flex-col bg-anki-dark text-white">
            {/* Header */}
            <header className="flex-shrink-0 px-4 py-3 bg-anki-darker border-b border-gray-700">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-6 h-6 text-blue-400" />
                            <h1 className="text-xl font-bold">LLMAnki</h1>
                        </div>
                        <span className="text-xs text-gray-400 hidden sm:inline">
                            AI-Powered Anki Deck Improvement
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <FileUpload />

                        {collection && (
                            <button
                                onClick={handleExport}
                                className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                <span className="hidden sm:inline text-sm">Export</span>
                            </button>
                        )}

                        <button
                            onClick={() => setShowSettings(true)}
                            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex overflow-hidden">
                {/* Left Sidebar - Deck Browser */}
                <aside className="w-64 flex-shrink-0 bg-anki-darker border-r border-gray-700 overflow-hidden flex flex-col">
                    <DeckBrowser />
                </aside>

                {/* Card List */}
                <aside className="w-72 flex-shrink-0 bg-gray-900 border-r border-gray-700 overflow-hidden">
                    <CardList />
                </aside>

                {/* Main Panel */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {selectedCard ? (
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="max-w-4xl mx-auto space-y-6">
                                {/* Current Card */}
                                <div>
                                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                        <BookOpen className="w-5 h-5" />
                                        Current Card
                                    </h2>
                                    <CardViewer card={selectedCard} title="Original Card" />
                                </div>

                                {/* Analyze Button with Additional Prompt */}
                                <div className="flex flex-col items-center gap-3">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="text"
                                            value={additionalPrompt}
                                            onChange={(e) => setAdditionalPrompt(e.target.value)}
                                            placeholder="Optional: specific instructions..."
                                            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 w-64"
                                        />
                                        <button
                                            onClick={handleAnalyze}
                                            disabled={isAnalyzing}
                                            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all shadow-lg hover:shadow-xl"
                                        >
                                            {isAnalyzing ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Analyzing...
                                                </>
                                            ) : (
                                                <>
                                                    <Wand2 className="w-5 h-5" />
                                                    Analyze Card
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Error Message */}
                                {analysisError && (
                                    <div className="flex items-start gap-3 p-4 bg-red-900/30 border border-red-700 rounded-lg">
                                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-medium text-red-400">Analysis Error</p>
                                            <p className="text-sm text-gray-300 mt-1">{analysisError}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Analysis Results */}
                                {analysisResult && (
                                    <AnalysisPanel result={analysisResult} />
                                )}

                                {/* Pending Changes */}
                                <PendingChanges />
                            </div>
                        </div>
                    ) : selectedDeckId !== null && collection ? (
                        // Deck-level view (no card selected, but deck is selected)
                        <div className="flex-1 overflow-y-auto p-6">
                            <div className="max-w-4xl mx-auto space-y-6">
                                {/* Deck Info */}
                                <div>
                                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                        <Layers className="w-5 h-5" />
                                        Deck Analysis
                                    </h2>
                                    <div className="bg-gray-800 rounded-lg p-4">
                                        <p className="text-gray-300">
                                            <span className="font-medium">{collection.decks.get(selectedDeckId)?.name || 'Unknown Deck'}</span>
                                        </p>
                                        <p className="text-sm text-gray-400 mt-1">
                                            {getCardsInDeck(collection, selectedDeckId, true).length} cards (including subdecks)
                                        </p>
                                    </div>
                                </div>

                                {/* Deck Analyze Button with Additional Prompt */}
                                <div className="flex flex-col items-center gap-3">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="text"
                                            value={deckAdditionalPrompt}
                                            onChange={(e) => setDeckAdditionalPrompt(e.target.value)}
                                            placeholder="Optional: focus area or topic..."
                                            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 w-64"
                                        />
                                        <button
                                            onClick={handleDeckAnalyze}
                                            disabled={isDeckAnalyzing}
                                            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all shadow-lg hover:shadow-xl"
                                        >
                                            {isDeckAnalyzing ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Analyzing Deck...
                                                    {deckAnalysisProgress && (
                                                        <span className="text-sm">({deckAnalysisProgress.current}/{deckAnalysisProgress.total})</span>
                                                    )}
                                                </>
                                            ) : (
                                                <>
                                                    <Wand2 className="w-5 h-5" />
                                                    Analyze Deck
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-400">
                                        Analyzes all cards in the deck and generates statistics + new card suggestions
                                    </p>
                                </div>

                                {/* Error Message */}
                                {analysisError && (
                                    <div className="flex items-start gap-3 p-4 bg-red-900/30 border border-red-700 rounded-lg">
                                        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-medium text-red-400">Analysis Error</p>
                                            <p className="text-sm text-gray-300 mt-1">{analysisError}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Deck Analysis Results */}
                                {deckAnalysisResult && deckAnalysisResult.deckId === selectedDeckId && (
                                    <DeckAnalysisPanel result={deckAnalysisResult} />
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-gray-400">
                            <div className="text-center">
                                <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                <h3 className="text-lg font-medium mb-2">No Card Selected</h3>
                                <p className="text-sm max-w-md">
                                    {collection
                                        ? 'Select a deck from the sidebar to analyze the entire deck, or click on a card to analyze individually.'
                                        : 'Load an Anki deck (.apkg file) to get started.'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Settings Modal */}
            <SettingsPanel />

            {/* Toast Notifications */}
            <ToastContainer />
        </div>
    );
}

export default App;
