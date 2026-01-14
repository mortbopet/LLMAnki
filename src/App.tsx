import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Sparkles,
    Settings,
    Download,
    Wand2,
    Loader2,
    BookOpen,
    Layers,
    StopCircle,
    Info,
    Undo2,
    Redo2
} from 'lucide-react';
import { useAppStore } from './store/useAppStore';
import { FileUpload } from './components/FileUpload';
import { DeckBrowser } from './components/DeckBrowser';
import { CardList } from './components/CardList';
import { CardViewer } from './components/CardViewer';
import { AnalysisPanel } from './components/AnalysisPanel';
import { DeckAnalysisPanel } from './components/DeckAnalysisPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ToastContainer } from './components/ToastContainer';
import { SystemPromptUpdateModal } from './components/SystemPromptUpdateModal';
import { ErrorDisplay } from './components/ErrorDisplay';
import { analyzeCard, analyzeDeck, getApiKey, DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_VERSION } from './utils/llmService';
import { exportCollection, getCardsInDeck } from './utils/ankiParser';
import type { DeckAnalysisResult } from './types';

function App() {
    const collection = useAppStore(state => state.collection);
    const selectedDeckId = useAppStore(state => state.selectedDeckId);
    const selectedCard = useAppStore(state => state.selectedCard);
    const selectedCardId = useAppStore(state => state.selectedCardId);
    const analysisResult = useAppStore(state => state.analysisResult);
    const isAnalyzing = useAppStore(state => state.isAnalyzing);
    const analysisError = useAppStore(state => state.analysisError);
    const llmConfig = useAppStore(state => state.llmConfig);
    const setLLMConfig = useAppStore(state => state.setLLMConfig);
    const setShowSettings = useAppStore(state => state.setShowSettings);
    const setAnalysisResult = useAppStore(state => state.setAnalysisResult);
    const setIsAnalyzing = useAppStore(state => state.setIsAnalyzing);
    const setAnalysisError = useAppStore(state => state.setAnalysisError);
    const cacheAnalysis = useAppStore(state => state.cacheAnalysis);
    const analysisCache = useAppStore(state => state.analysisCache);

    // New deck analysis state
    const deckAnalysisCache = useAppStore(state => state.deckAnalysisCache);
    const analyzingDeckId = useAppStore(state => state.analyzingDeckId);
    const deckAnalysisProgress = useAppStore(state => state.deckAnalysisProgress);
    const cacheDeckAnalysis = useAppStore(state => state.cacheDeckAnalysis);
    const setAnalyzingDeckId = useAppStore(state => state.setAnalyzingDeckId);
    const setDeckAnalysisProgress = useAppStore(state => state.setDeckAnalysisProgress);
    const cancelDeckAnalysis = useAppStore(state => state.cancelDeckAnalysis);
    const isDeckAnalysisCancelled = useAppStore(state => state.isDeckAnalysisCancelled);
    const resetDeckAnalysisCancelled = useAppStore(state => state.resetDeckAnalysisCancelled);

    // Undo/Redo
    const undo = useAppStore(state => state.undo);
    const redo = useAppStore(state => state.redo);
    const canUndo = useAppStore(state => state.canUndo);
    const canRedo = useAppStore(state => state.canRedo);

    const [additionalPrompt, setAdditionalPrompt] = useState('');
    const [deckAdditionalPrompt, setDeckAdditionalPrompt] = useState('');
    const [showPromptUpdateModal, setShowPromptUpdateModal] = useState(false);

    // Keyboard shortcuts for undo/redo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for Ctrl+Z (undo) or Ctrl+Shift+Z / Ctrl+Y (redo)
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    if (canUndo()) {
                        undo();
                    }
                } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                    e.preventDefault();
                    if (canRedo()) {
                        redo();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, canUndo, canRedo]);

    // Check for system prompt updates on mount
    useEffect(() => {
        // If user has a stored prompt version that's older than current, show the update modal
        // Also show if version is undefined (old installs before versioning was added)
        const storedVersion = llmConfig.systemPromptVersion;
        const isOutdated = storedVersion === undefined || storedVersion < SYSTEM_PROMPT_VERSION;

        // Only show if they have an outdated version AND their prompt is different from default
        // (If they already have the default prompt, just update the version silently)
        if (isOutdated) {
            if (llmConfig.systemPrompt === DEFAULT_SYSTEM_PROMPT) {
                // Prompt is the same, just update the version silently
                setLLMConfig({ systemPromptVersion: SYSTEM_PROMPT_VERSION });
            } else {
                // Prompt is different, ask the user what to do
                setShowPromptUpdateModal(true);
            }
        }
    }, []); // Only run on mount

    const handleAcceptNewPrompt = () => {
        setLLMConfig({
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            systemPromptVersion: SYSTEM_PROMPT_VERSION
        });
        setShowPromptUpdateModal(false);
    };

    const handleKeepOldPrompt = () => {
        // Just update the version to acknowledge they've seen the update
        setLLMConfig({ systemPromptVersion: SYSTEM_PROMPT_VERSION });
        setShowPromptUpdateModal(false);
    };

    // Get cached result for current deck
    const deckAnalysisResult = selectedDeckId !== null ? deckAnalysisCache.get(selectedDeckId) : undefined;
    const isDeckAnalyzing = analyzingDeckId !== null;
    const isCurrentDeckAnalyzing = analyzingDeckId === selectedDeckId;

    // Compute dynamic deck stats from cached card analyses
    const dynamicDeckStats = useMemo((): DeckAnalysisResult | null => {
        if (!collection || selectedDeckId === null) return null;

        // If we have a full deck analysis result, prefer that
        if (deckAnalysisResult) return deckAnalysisResult;

        // Otherwise, compute stats from individual card analyses
        const cards = getCardsInDeck(collection, selectedDeckId, true);
        if (cards.length === 0) return null;

        const analyzedCards: { cardId: number; score: number; issues: string[]; suggestions: number }[] = [];

        for (const card of cards) {
            const cached = analysisCache.get(card.id);
            if (cached) {
                analyzedCards.push({
                    cardId: card.id,
                    score: cached.feedback.overallScore,
                    issues: cached.feedback.issues,
                    suggestions: cached.suggestedCards?.length ?? 0
                });
            }
        }

        if (analyzedCards.length === 0) return null;

        // Compute score distribution
        const scoreDistribution: { score: number; count: number }[] = [];
        for (let s = 1; s <= 10; s++) {
            scoreDistribution.push({
                score: s,
                count: analyzedCards.filter(a => Math.floor(a.score) === s).length
            });
        }

        // Compute common issues
        const issueCounts = new Map<string, number>();
        for (const { issues } of analyzedCards) {
            for (const issue of issues) {
                issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
            }
        }
        const commonIssues = Array.from(issueCounts.entries())
            .map(([issue, count]) => ({ issue, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const avgScore = analyzedCards.reduce((sum, a) => sum + a.score, 0) / analyzedCards.length;
        const totalSuggestions = analyzedCards.reduce((sum, a) => sum + a.suggestions, 0);

        const deck = collection.decks.get(selectedDeckId);

        return {
            deckId: selectedDeckId,
            deckName: deck?.name || 'Unknown Deck',
            totalCards: cards.length,
            analyzedCards: analyzedCards.length,
            averageScore: Math.round(avgScore * 10) / 10,
            scoreDistribution,
            commonIssues,
            classifiedIssues: [],
            deckSummary: '',
            suggestedNewCards: [],
            totalSuggestedFromCards: totalSuggestions
        };
    }, [collection, selectedDeckId, analysisCache, deckAnalysisResult]);

    const handleAnalyze = useCallback(async () => {
        if (!selectedCard || !selectedCardId) return;

        if (!getApiKey(llmConfig) && llmConfig.providerId !== 'ollama') {
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
            const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
            setAnalysisError(errorMessage);
            // Cache the error so it shows in the card list
            cacheAnalysis(selectedCardId, {
                feedback: {
                    isUnambiguous: false,
                    isAtomic: false,
                    isRecognizable: false,
                    isActiveRecall: false,
                    overallScore: 0,
                    issues: [],
                    suggestions: [],
                    reasoning: ''
                },
                suggestedCards: [],
                deleteOriginal: false,
                error: errorMessage
            });
        } finally {
            setIsAnalyzing(false);
        }
    }, [selectedCard, selectedCardId, llmConfig, additionalPrompt, setAnalysisResult, setIsAnalyzing, setAnalysisError, cacheAnalysis]);

    const handleDeckAnalyze = useCallback(async () => {
        if (!collection || selectedDeckId === null) return;

        // Prevent concurrent analysis
        if (analyzingDeckId !== null) {
            setAnalysisError('Another deck analysis is already in progress. Please wait or stop it first.');
            return;
        }

        if (!getApiKey(llmConfig) && llmConfig.providerId !== 'ollama') {
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

        resetDeckAnalysisCancelled();
        setAnalyzingDeckId(selectedDeckId);
        setDeckAnalysisProgress({ current: 0, total: Math.min(cards.length, llmConfig.maxDeckAnalysisCards) });
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
                },
                isDeckAnalysisCancelled,
                analysisCache  // Pass existing cache to skip already-analyzed cards
            );

            // Only cache if not cancelled
            if (!isDeckAnalysisCancelled()) {
                cacheDeckAnalysis(selectedDeckId, result);
            }
        } catch (error) {
            console.error('Deck analysis failed:', error);
            if (!isDeckAnalysisCancelled()) {
                setAnalysisError(error instanceof Error ? error.message : 'Deck analysis failed');
            }
        } finally {
            setAnalyzingDeckId(null);
            setDeckAnalysisProgress(null);
        }
    }, [collection, selectedDeckId, analyzingDeckId, llmConfig, deckAdditionalPrompt, setAnalyzingDeckId, setDeckAnalysisProgress, cacheDeckAnalysis, setAnalysisError, cacheAnalysis, isDeckAnalysisCancelled, resetDeckAnalysisCancelled]);

    const handleStopDeckAnalysis = useCallback(() => {
        cancelDeckAnalysis();
    }, [cancelDeckAnalysis]);

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
                            <>
                                {/* Undo/Redo buttons */}
                                <div className="flex items-center border-r border-gray-600 pr-2 mr-1">
                                    <button
                                        onClick={undo}
                                        disabled={!canUndo()}
                                        className={`p-2 rounded-lg transition-colors ${canUndo()
                                                ? 'hover:bg-gray-700 text-gray-300'
                                                : 'text-gray-600 cursor-not-allowed'
                                            }`}
                                        title="Undo (Ctrl+Z)"
                                    >
                                        <Undo2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={redo}
                                        disabled={!canRedo()}
                                        className={`p-2 rounded-lg transition-colors ${canRedo()
                                                ? 'hover:bg-gray-700 text-gray-300'
                                                : 'text-gray-600 cursor-not-allowed'
                                            }`}
                                        title="Redo (Ctrl+Y)"
                                    >
                                        <Redo2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <button
                                    onClick={handleExport}
                                    className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="hidden sm:inline text-sm">Export</span>
                                </button>
                            </>
                        )}

                        <button
                            onClick={() => setShowSettings(true)}
                            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                            title="Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>

                        <a
                            href="https://github.com/mortbopet/LLMAnki"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                            title="About LLMAnki"
                        >
                            <Info className="w-5 h-5" />
                        </a>
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
                                        <textarea
                                            value={additionalPrompt}
                                            onChange={(e) => setAdditionalPrompt(e.target.value)}
                                            placeholder="Optional: specific instructions..."
                                            rows={2}
                                            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 w-64 resize-none"
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
                                    <ErrorDisplay
                                        error={analysisError}
                                        onDismiss={() => setAnalysisError(null)}
                                    />
                                )}

                                {/* Analysis Results */}
                                {analysisResult && (
                                    <AnalysisPanel result={analysisResult} />
                                )}
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
                                        <textarea
                                            value={deckAdditionalPrompt}
                                            onChange={(e) => setDeckAdditionalPrompt(e.target.value)}
                                            placeholder="Optional: focus area or topic..."
                                            rows={2}
                                            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 w-64 resize-none"
                                            disabled={isDeckAnalyzing}
                                        />
                                        {isCurrentDeckAnalyzing ? (
                                            <button
                                                onClick={handleStopDeckAnalysis}
                                                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 rounded-lg font-medium transition-all shadow-lg hover:shadow-xl"
                                            >
                                                <StopCircle className="w-5 h-5" />
                                                Stop Analysis
                                                {deckAnalysisProgress && (
                                                    <span className="text-sm">({deckAnalysisProgress.current}/{deckAnalysisProgress.total})</span>
                                                )}
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleDeckAnalyze}
                                                disabled={isDeckAnalyzing}
                                                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all shadow-lg hover:shadow-xl"
                                            >
                                                {isDeckAnalyzing ? (
                                                    <>
                                                        <Loader2 className="w-5 h-5 animate-spin" />
                                                        Other Deck Analyzing...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Wand2 className="w-5 h-5" />
                                                        Analyze Deck
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400">
                                        Analyzes up to {llmConfig.maxDeckAnalysisCards} cards in the deck and generates statistics + new card suggestions
                                    </p>
                                </div>

                                {/* Error Message */}
                                {analysisError && (
                                    <ErrorDisplay
                                        error={analysisError}
                                        onDismiss={() => setAnalysisError(null)}
                                    />
                                )}

                                {/* Deck Analysis Results - Show dynamic stats or full analysis */}
                                {dynamicDeckStats && (
                                    <DeckAnalysisPanel result={dynamicDeckStats} />
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

            {/* System Prompt Update Modal */}
            {showPromptUpdateModal && (
                <SystemPromptUpdateModal
                    onAcceptNew={handleAcceptNewPrompt}
                    onKeepOld={handleKeepOldPrompt}
                />
            )}

            {/* Toast Notifications */}
            <ToastContainer />
        </div>
    );
}

export default App;
