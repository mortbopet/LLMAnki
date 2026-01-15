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
    Redo2,
    BarChart3
} from 'lucide-react';
import { useAppStore } from './store/useAppStore';
import { useTheme } from './hooks/useTheme';
import { FileUpload } from './components/FileUpload';
import { DeckBrowser } from './components/DeckBrowser';
import { CardList } from './components/CardList';
import { CardViewer } from './components/CardViewer';
import { AnalysisPanel } from './components/AnalysisPanel';
import { DeckAnalysisPanel } from './components/DeckAnalysisPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ToastContainer } from './components/ToastContainer';
import { SystemPromptUpdateModal } from './components/SystemPromptUpdateModal';
import { ErrorModal } from './components/ErrorModal';
import { LandingPage } from './components/LandingPage';
import { analyzeCard, analyzeCardsInDeck, generateDeckInsights, getApiKey, DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_VERSION } from './utils/llmService';
import { exportCollection, getCardsInDeck } from './utils/ankiParser';
import { renderCard } from './utils/cardRenderer';
import { getCacheIndex } from './utils/analysisCache';
import type { DeckAnalysisResult } from './types';

function App() {
    // Apply theme to document
    const isDarkMode = useTheme();

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
    const fileName = useAppStore(state => state.fileName);
    const loadCachedAnalysesForDeck = useAppStore(state => state.loadCachedAnalysesForDeck);
    const loadDeckState = useAppStore(state => state.loadDeckState);

    // Card editing
    const updateCardFields = useAppStore(state => state.updateCardFields);
    const getEditedFields = useAppStore(state => state.getEditedFields);
    const isCardEdited = useAppStore(state => state.isCardEdited);

    const [additionalPrompt, setAdditionalPrompt] = useState('');
    const [deckAdditionalPrompt, setDeckAdditionalPrompt] = useState('');
    const [showPromptUpdateModal, setShowPromptUpdateModal] = useState(false);
    const [cacheLoadedForFile, setCacheLoadedForFile] = useState<string | null>(null);

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

    // Load cached analyses when a new file is loaded
    useEffect(() => {
        if (!collection || !fileName || cacheLoadedForFile === fileName) return;

        // Check if we have cached analyses for this file
        const cacheIndex = getCacheIndex();
        if (!cacheIndex.decks[fileName]) {
            setCacheLoadedForFile(fileName);
            return;
        }

        // Render all cards to get their fields for hash verification
        const loadCachedData = async () => {
            const allCards = Array.from(collection.cards.values());
            const cardsWithFields: Array<{ id: number; fields: { name: string; value: string }[] }> = [];

            // Render cards in batches to avoid blocking
            for (const card of allCards) {
                try {
                    const rendered = await renderCard(collection, card);
                    cardsWithFields.push({ id: card.id, fields: rendered.fields });
                } catch (e) {
                    // Skip cards that fail to render
                }
            }

            // Load valid cached results
            const loadedCount = loadCachedAnalysesForDeck(cardsWithFields);
            if (loadedCount > 0) {
                console.log(`Loaded ${loadedCount} cached analyses for ${fileName}`);
            }

            // Load deck state (generated cards, marked for deletion)
            loadDeckState();

            setCacheLoadedForFile(fileName);
        };

        loadCachedData();
    }, [collection, fileName, cacheLoadedForFile, loadCachedAnalysesForDeck, loadDeckState]);

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
            knowledgeCoverage: null,
            deckSummary: '',
            suggestedNewCards: [],
            addedSuggestedCardIndices: [],
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
            cacheAnalysis(selectedCardId, result, selectedCard.fields);
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
            }, selectedCard.fields);
        } finally {
            setIsAnalyzing(false);
        }
    }, [selectedCard, selectedCardId, llmConfig, additionalPrompt, setAnalysisResult, setIsAnalyzing, setAnalysisError, cacheAnalysis]);

    // Analyze individual cards in the deck (LLM processing)
    const handleAnalyzeCards = useCallback(async () => {
        if (!collection || selectedDeckId === null) return;

        // Prevent concurrent analysis
        if (analyzingDeckId !== null) {
            setAnalysisError('Another card analysis is already in progress. Please wait or stop it first.');
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
            const { error } = await analyzeCardsInDeck(
                collection,
                cards,
                llmConfig,
                (current, total, cardId, cardResult, fields) => {
                    setDeckAnalysisProgress({ current, total });
                    if (cardId && cardResult) {
                        cacheAnalysis(cardId, cardResult, fields);
                    }
                },
                isDeckAnalysisCancelled,
                analysisCache
            );

            // If there was an error, show it and stop
            if (error && !isDeckAnalysisCancelled()) {
                setAnalysisError(`Card analysis stopped: ${error}`);
            }
        } catch (error) {
            console.error('Card analysis failed:', error);
            if (!isDeckAnalysisCancelled()) {
                setAnalysisError(error instanceof Error ? error.message : 'Card analysis failed');
            }
        } finally {
            setAnalyzingDeckId(null);
            setDeckAnalysisProgress(null);
        }
    }, [collection, selectedDeckId, analyzingDeckId, llmConfig, setAnalyzingDeckId, setDeckAnalysisProgress, setAnalysisError, cacheAnalysis, isDeckAnalysisCancelled, resetDeckAnalysisCancelled, analysisCache]);

    // Generate deck insights from already-analyzed cards
    const handleGenerateDeckInsights = useCallback(async () => {
        if (!collection || selectedDeckId === null) return;

        if (!getApiKey(llmConfig) && llmConfig.providerId !== 'ollama') {
            setAnalysisError('Please configure your API key in Settings first.');
            return;
        }

        const deck = collection.decks.get(selectedDeckId);
        if (!deck) return;

        const cards = getCardsInDeck(collection, selectedDeckId, true);
        const cardIds = cards.map(c => c.id);

        // Check if we have any analyzed cards
        const analyzedCount = cardIds.filter(id => analysisCache.has(id) && !analysisCache.get(id)?.error).length;
        if (analyzedCount === 0) {
            setAnalysisError('No analyzed cards found. Please analyze cards first before generating deck insights.');
            return;
        }

        setAnalyzingDeckId(selectedDeckId);
        setAnalysisError(null);

        try {
            const result = await generateDeckInsights(
                deck,
                cards.length,
                analysisCache,
                cardIds,
                llmConfig,
                deckAdditionalPrompt,
                collection,
                cards
            );

            cacheDeckAnalysis(selectedDeckId, result);
        } catch (error) {
            console.error('Deck insights generation failed:', error);
            setAnalysisError(error instanceof Error ? error.message : 'Deck insights generation failed');
        } finally {
            setAnalyzingDeckId(null);
        }
    }, [collection, selectedDeckId, llmConfig, deckAdditionalPrompt, analysisCache, setAnalyzingDeckId, cacheDeckAnalysis, setAnalysisError]);

    const handleStopDeckAnalysis = useCallback(() => {
        cancelDeckAnalysis();
    }, [cancelDeckAnalysis]);

    const markedForDeletion = useAppStore(state => state.markedForDeletion);

    const handleExport = useCallback(async () => {
        if (!collection) return;

        try {
            const blob = await exportCollection(collection, markedForDeletion);
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
    }, [collection, markedForDeletion]);

    return (
        <div className={`h-screen flex flex-col ${isDarkMode ? 'bg-anki-dark text-white' : 'bg-gray-100 text-gray-900'}`}>
            {/* Header */}
            <header className={`flex-shrink-0 px-4 py-3 border-b ${isDarkMode ? 'bg-anki-darker border-gray-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Sparkles className="w-6 h-6 text-blue-400" />
                            <h1 className="text-xl font-bold">LLMAnki</h1>
                        </div>
                        <span className={`text-xs hidden sm:inline ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            AI-Powered Anki Deck Improvement
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <FileUpload />

                        {collection && (
                            <>
                                {/* Undo/Redo buttons */}
                                <div className={`flex items-center border-r pr-2 mr-1 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                                    <button
                                        onClick={undo}
                                        disabled={!canUndo()}
                                        className={`p-2 rounded-lg transition-colors ${canUndo()
                                            ? isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-600'
                                            : isDarkMode ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed'
                                            }`}
                                        title="Undo (Ctrl+Z)"
                                    >
                                        <Undo2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={redo}
                                        disabled={!canRedo()}
                                        className={`p-2 rounded-lg transition-colors ${canRedo()
                                            ? isDarkMode ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-600'
                                            : isDarkMode ? 'text-gray-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed'
                                            }`}
                                        title="Redo (Ctrl+Y)"
                                    >
                                        <Redo2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <button
                                    onClick={handleExport}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="hidden sm:inline text-sm">Export</span>
                                </button>
                            </>
                        )}

                        <button
                            onClick={() => setShowSettings(true)}
                            className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                            title="Settings"
                        >
                            <Settings className="w-5 h-5" />
                        </button>

                        <a
                            href="https://github.com/mortbopet/LLMAnki"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
                            title="About LLMAnki"
                        >
                            <Info className="w-5 h-5" />
                        </a>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex overflow-hidden">
                {!collection ? (
                    /* Landing Page - Centered upload area when no collection loaded */
                    <LandingPage />
                ) : (
                    <>
                        {/* Left Sidebar - Deck Browser */}
                        <aside className={`w-64 flex-shrink-0 border-r overflow-hidden flex flex-col ${isDarkMode ? 'bg-anki-darker border-gray-700' : 'bg-white border-gray-200'}`}>
                            <DeckBrowser />
                        </aside>

                        {/* Card List */}
                        <aside className={`w-72 flex-shrink-0 border-r overflow-hidden ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
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
                                            <CardViewer
                                                card={selectedCard}
                                                title="Original Card"
                                                onUpdateFields={updateCardFields}
                                                editedFields={getEditedFields(selectedCard.noteId)}
                                                isEdited={isCardEdited(selectedCard.noteId)}
                                            />
                                        </div>

                                        {/* Analyze Button with Additional Prompt */}
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="flex items-center gap-3">
                                                <textarea
                                                    value={additionalPrompt}
                                                    onChange={(e) => setAdditionalPrompt(e.target.value)}
                                                    placeholder="Optional: specific analysis instructions..."
                                                    rows={2}
                                                    className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 w-64 resize-none ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                                                />
                                                <button
                                                    onClick={handleAnalyze}
                                                    disabled={isAnalyzing}
                                                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all shadow-lg hover:shadow-xl text-white"
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
                                            <div className={`rounded-lg p-4 ${isDarkMode ? 'bg-gray-800' : 'bg-white shadow-sm border border-gray-200'}`}>
                                                <p className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
                                                    <span className="font-medium">{collection.decks.get(selectedDeckId)?.name || 'Unknown Deck'}</span>
                                                </p>
                                                <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    {getCardsInDeck(collection, selectedDeckId, true).length} cards (including subdecks)
                                                </p>
                                            </div>
                                        </div>

                                        {/* Deck Analyze Buttons */}
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="flex items-center gap-3">
                                                <textarea
                                                    value={deckAdditionalPrompt}
                                                    onChange={(e) => setDeckAdditionalPrompt(e.target.value)}
                                                    placeholder="Optional: focus area or topic..."
                                                    rows={2}
                                                    className={`px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-blue-500 w-64 resize-none ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                                                    disabled={isDeckAnalyzing}
                                                />
                                                <div className="flex flex-col gap-2">
                                                    {isCurrentDeckAnalyzing && deckAnalysisProgress ? (
                                                        <button
                                                            onClick={handleStopDeckAnalysis}
                                                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 rounded-lg font-medium transition-all shadow-lg hover:shadow-xl text-white"
                                                            title="Stop the current card analysis"
                                                        >
                                                            <StopCircle className="w-4 h-4" />
                                                            Stop ({deckAnalysisProgress.current}/{deckAnalysisProgress.total})
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={handleAnalyzeCards}
                                                            disabled={isDeckAnalyzing}
                                                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all shadow-lg hover:shadow-xl text-white"
                                                            title="Run LLM analysis on each card in the deck. Skips already-analyzed cards."
                                                        >
                                                            {isDeckAnalyzing ? (
                                                                <>
                                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                                    Analyzing...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Wand2 className="w-4 h-4" />
                                                                    Analyze Cards
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={handleGenerateDeckInsights}
                                                        disabled={isDeckAnalyzing}
                                                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all shadow-lg hover:shadow-xl text-white"
                                                        title="Generate deck summary and suggestions from already-analyzed cards. Uses cached card analyses only."
                                                    >
                                                        {isCurrentDeckAnalyzing && !deckAnalysisProgress ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                Generating...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <BarChart3 className="w-4 h-4" />
                                                                Generate Insights
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className={`text-xs text-center space-y-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                <p><strong>Analyze Cards:</strong> Runs LLM on up to {llmConfig.maxDeckAnalysisCards} cards (skips cached)</p>
                                                <p><strong>Generate Insights:</strong> Creates deck summary &amp; suggestions from analyzed cards</p>
                                            </div>
                                        </div>

                                        {/* Deck Analysis Results - Show dynamic stats or full analysis */}
                                        {dynamicDeckStats && (
                                            <DeckAnalysisPanel result={dynamicDeckStats} />
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className={`flex-1 flex items-center justify-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <div className="text-center">
                                        <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-30" />
                                        <h3 className="text-lg font-medium mb-2">No Card Selected</h3>
                                        <p className="text-sm max-w-md">
                                            Select a deck from the sidebar to analyze the entire deck, or click on a card to analyze individually.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
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

            {/* Error Modal */}
            {analysisError && (
                <ErrorModal
                    error={analysisError}
                    onClose={() => setAnalysisError(null)}
                />
            )}
        </div>
    );
}

export default App;
