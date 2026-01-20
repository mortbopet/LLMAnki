import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
    BarChart3,
    Plus
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
import { ExportDeletionFilterModal } from './components/ExportDeletionFilterModal';
import { LandingPage } from './components/LandingPage';
import { AddCardPanel } from './components/AddCardPanel';
import { analyzeCard, analyzeCardsInDeck, generateDeckInsights, getApiKey, DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_VERSION } from './utils/llmService';
import { exportCollection, getCardsInDeck } from './utils/ankiParser';

import type { DeckAnalysisResult, RenderedCard, LLMAnalysisResult } from './types';

function App() {
    // Apply theme to document
    const isDarkMode = useTheme();

    const collection = useAppStore(state => state.collection);
    const selectedDeckId = useAppStore(state => state.selectedDeckId);
    const selectedCardId = useAppStore(state => state.selectedCardId);
    const cards = useAppStore(state => state.cards);
    const isAnalyzing = useAppStore(state => state.isAnalyzing);
    const analysisError = useAppStore(state => state.analysisError);
    const llmConfig = useAppStore(state => state.llmConfig);
    const ankiSettings = useAppStore(state => state.ankiSettings);
    const setLLMConfig = useAppStore(state => state.setLLMConfig);
    const setShowSettings = useAppStore(state => state.setShowSettings);
    const setCardAnalysis = useAppStore(state => state.setCardAnalysis);
    const setIsAnalyzing = useAppStore(state => state.setIsAnalyzing);
    const setAnalysisError = useAppStore(state => state.setAnalysisError);
    const getCard = useAppStore(state => state.getCard);

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

    const isExporting = useAppStore(state => state.isExporting);
    const exportProgress = useAppStore(state => state.exportProgress);
    const setIsExporting = useAppStore(state => state.setIsExporting);
    const setExportProgress = useAppStore(state => state.setExportProgress);

    const [deckWidth, setDeckWidth] = useState(256);
    const [listWidth, setListWidth] = useState(288);
    const dragRef = useRef<{ type: 'deck' | 'list' | null; startX: number; startDeck: number; startList: number }>({
        type: null,
        startX: 0,
        startDeck: 256,
        startList: 288,
    });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!dragRef.current.type) return;
            const delta = e.clientX - dragRef.current.startX;
            const minDeck = 200;
            const maxDeck = 420;
            const minList = 220;
            const maxList = 520;
            const minMain = 360;
            const totalWidth = window.innerWidth;

            if (dragRef.current.type === 'deck') {
                const next = Math.min(maxDeck, Math.max(minDeck, dragRef.current.startDeck + delta));
                const remaining = totalWidth - next - listWidth;
                if (remaining >= minMain) {
                    setDeckWidth(next);
                }
            } else if (dragRef.current.type === 'list') {
                const next = Math.min(maxList, Math.max(minList, dragRef.current.startList + delta));
                const remaining = totalWidth - deckWidth - next;
                if (remaining >= minMain) {
                    setListWidth(next);
                }
            }
        };

        const handleMouseUp = () => {
            dragRef.current.type = null;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [deckWidth, listWidth]);

    const handleDeckResizeStart = useCallback((e: React.MouseEvent) => {
        dragRef.current = {
            type: 'deck',
            startX: e.clientX,
            startDeck: deckWidth,
            startList: listWidth,
        };
    }, [deckWidth, listWidth]);

    const handleListResizeStart = useCallback((e: React.MouseEvent) => {
        dragRef.current = {
            type: 'list',
            startX: e.clientX,
            startDeck: deckWidth,
            startList: listWidth,
        };
    }, [deckWidth, listWidth]);

    // Card editing
    const updateCardFields = useAppStore(state => state.updateCardFields);
    const restoreCardFields = useAppStore(state => state.restoreCardFields);

    // Compute derived state - selectedCard from cards Map
    const selectedCard = useMemo(() => {
        if (!selectedCardId) return null;
        const cardState = cards.get(selectedCardId);
        if (!cardState) return null;
        // Convert CardStateData to RenderedCard-like object for CardViewer
        return {
            id: cardState.cardId,
            noteId: cardState.noteId,
            deckId: cardState.deckId,
            type: cardState.type,
            front: cardState.front,
            back: cardState.back,
            css: cardState.css,
            tags: cardState.tags,
            fields: cardState.currentFields,
            modelName: cardState.modelName,
            deckName: cardState.deckName,
            queue: cardState.scheduling?.queue ?? 0,
            due: cardState.scheduling?.due ?? 0,
            interval: cardState.scheduling?.interval ?? 0,
            factor: cardState.scheduling?.factor ?? 2500,
            reps: cardState.scheduling?.reps ?? 0,
            lapses: cardState.scheduling?.lapses ?? 0,
            cardCreated: cardState.reviewData?.cardCreated ?? 0,
            firstReview: cardState.reviewData?.firstReview ?? null,
            lastReview: cardState.reviewData?.lastReview ?? null,
            totalTime: cardState.reviewData?.totalTime ?? 0,
            reviewHistory: cardState.reviewData?.reviewHistory ?? [],
        } as RenderedCard;
    }, [selectedCardId, cards]);

    // Compute analysisResult from selected card
    const analysisResult = useMemo(() => {
        if (!selectedCardId) return null;
        return cards.get(selectedCardId)?.analysis ?? null;
    }, [selectedCardId, cards]);

    // Compute analysisCache as Map for functions that need it
    const analysisCache = useMemo(() => {
        const cache = new Map<number, LLMAnalysisResult>();
        for (const [cardId, cardState] of cards) {
            if (cardState.analysis) {
                cache.set(cardId, cardState.analysis);
            }
        }
        return cache;
    }, [cards]);

    // Compute which cards are edited for this card
    const selectedCardEdited = useMemo(() => {
        if (!selectedCardId) return { isEdited: false, editedFields: undefined };
        const cardState = cards.get(selectedCardId);
        if (!cardState) return { isEdited: false, editedFields: undefined };
        const card = getCard(selectedCardId);
        return {
            isEdited: card?.isEdited ?? false,
            editedFields: card?.isEdited ? cardState.currentFields : undefined,
        };
    }, [selectedCardId, cards, getCard]);

    // Compute markedForDeletion as Set for export
    const markedForDeletion = useMemo(() => {
        const set = new Set<number>();
        for (const [cardId, cardState] of cards) {
            if (cardState.isDeleted) {
                set.add(cardId);
            }
        }
        return set;
    }, [cards]);

    const [additionalPrompt, setAdditionalPrompt] = useState('');
    const [deckAdditionalPrompt, setDeckAdditionalPrompt] = useState('');
    const [showPromptUpdateModal, setShowPromptUpdateModal] = useState(false);
    const [deletionFilter, setDeletionFilter] = useState<string | null>(null);
    const [deletionFilterDeckName, setDeletionFilterDeckName] = useState('All Decks');
    // Track which deck has the add card panel open (null = closed)
    const [addCardPanelDeckId, setAddCardPanelDeckId] = useState<number | null>(null);

    // Show add card panel only if it's open for the current deck
    const showAddCardPanel = addCardPanelDeckId !== null && addCardPanelDeckId === selectedDeckId;

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

    // Note: Cache loading is now handled atomically in setCollection()
    // No separate useEffect needed - this eliminates race conditions

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
        const deckCards = getCardsInDeck(collection, selectedDeckId, true);
        if (deckCards.length === 0) return null;

        const analyzedCardsData: { cardId: number; score: number; issues: string[]; suggestions: number }[] = [];

        for (const card of deckCards) {
            const cached = analysisCache.get(card.id);
            if (cached) {
                analyzedCardsData.push({
                    cardId: card.id,
                    score: cached.feedback.overallScore,
                    issues: cached.feedback.issues,
                    suggestions: cached.suggestedCards?.length ?? 0
                });
            }
        }

        // Compute score distribution (may be empty if no cards analyzed)
        const scoreDistribution: { score: number; count: number }[] = [];
        for (let s = 1; s <= 10; s++) {
            scoreDistribution.push({
                score: s,
                count: analyzedCardsData.filter(a => Math.floor(a.score) === s).length
            });
        }

        const avgScore = analyzedCardsData.length > 0
            ? analyzedCardsData.reduce((sum, a) => sum + a.score, 0) / analyzedCardsData.length
            : 0;
        const totalSuggestions = analyzedCardsData.reduce((sum, a) => sum + a.suggestions, 0);

        const deck = collection.decks.get(selectedDeckId);

        return {
            deckId: selectedDeckId,
            deckName: deck?.name || 'Unknown Deck',
            totalCards: deckCards.length,
            analyzedCards: analyzedCardsData.length,
            averageScore: analyzedCardsData.length > 0 ? Math.round(avgScore * 10) / 10 : 0,
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
            setCardAnalysis(selectedCardId, result);
        } catch (error) {
            console.error('Analysis failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
            setAnalysisError(errorMessage);
            // Cache the error so it shows in the card list
            setCardAnalysis(selectedCardId, {
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
    }, [selectedCard, selectedCardId, llmConfig, additionalPrompt, setCardAnalysis, setIsAnalyzing, setAnalysisError]);

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

        const deckCards = getCardsInDeck(collection, selectedDeckId, true);
        if (deckCards.length === 0) {
            setAnalysisError('No cards in this deck to analyze.');
            return;
        }

        resetDeckAnalysisCancelled();
        setAnalyzingDeckId(selectedDeckId);
        setDeckAnalysisProgress({ current: 0, total: Math.min(deckCards.length, llmConfig.maxDeckAnalysisCards) });
        setAnalysisError(null);

        try {
            const { error } = await analyzeCardsInDeck(
                collection,
                deckCards,
                llmConfig,
                (current, total, cardId, cardResult) => {
                    setDeckAnalysisProgress({ current, total });
                    if (cardId && cardResult) {
                        setCardAnalysis(cardId, cardResult);
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
    }, [collection, selectedDeckId, analyzingDeckId, llmConfig, setAnalyzingDeckId, setDeckAnalysisProgress, setAnalysisError, setCardAnalysis, isDeckAnalysisCancelled, resetDeckAnalysisCancelled, analysisCache]);

    // Generate deck insights from already-analyzed cards
    const handleGenerateDeckInsights = useCallback(async () => {
        if (!collection || selectedDeckId === null) return;

        if (!getApiKey(llmConfig) && llmConfig.providerId !== 'ollama') {
            setAnalysisError('Please configure your API key in Settings first.');
            return;
        }

        const deck = collection.decks.get(selectedDeckId);
        if (!deck) return;

        const deckCards = getCardsInDeck(collection, selectedDeckId, true);
        const cardIds = deckCards.map(c => c.id);

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
                deckCards.length,
                analysisCache,
                cardIds,
                llmConfig,
                deckAdditionalPrompt,
                collection,
                deckCards
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

    const handleExport = useCallback(async () => {
        if (!collection) return;

        try {
            setIsExporting(true);
            setExportProgress({ stage: 'Preparing export', percent: 0 });
            const blob = await exportCollection(collection, {
                excludeCardIds: markedForDeletion,
                mediaFormat: ankiSettings.exportMediaFormat ?? 'legacy',
                onProgress: (progress) => setExportProgress(progress)
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'modified_collection.apkg';
            a.click();
            URL.revokeObjectURL(url);

            if (markedForDeletion.size > 0) {
                const noteIds = new Set<number>();
                for (const cardId of markedForDeletion) {
                    const cardState = cards.get(cardId);
                    if (cardState?.noteId) {
                        noteIds.add(cardState.noteId);
                    }
                }

                if (noteIds.size > 0) {
                    const filter = `nid:${Array.from(noteIds).join(',')}`;
                    const deckName = selectedDeckId !== null
                        ? collection.decks.get(selectedDeckId)?.name || 'Selected Deck'
                        : 'All Decks';
                    setDeletionFilterDeckName(deckName);
                    setDeletionFilter(filter);
                }
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. See console for details.');
        } finally {
            setIsExporting(false);
            setExportProgress(null);
        }
    }, [collection, markedForDeletion, ankiSettings.exportMediaFormat, setIsExporting, setExportProgress, cards, selectedDeckId]);

    return (
        <div className={`h-screen flex flex-col ${isDarkMode ? 'bg-anki-dark text-white' : 'bg-gray-100 text-gray-900'}`}>
            {/* Header */}
            <header className={`flex-shrink-0 px-4 py-3 border-b ${isDarkMode ? 'bg-anki-darker border-gray-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                <div className="flex flex-col gap-2">
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
                                    <button
                                        onClick={handleExport}
                                        disabled={isExporting}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} ${isExporting ? 'opacity-60 cursor-not-allowed' : ''}`}
                                    >
                                        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                        <span className="hidden sm:inline text-sm">{isExporting ? 'Exporting...' : 'Export'}</span>
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
                    {isExporting && exportProgress && (
                        <div className="flex items-center gap-3">
                            <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {exportProgress.stage} ({exportProgress.percent}%)
                            </div>
                            <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                                <div
                                    className="h-full bg-blue-500 transition-all duration-150"
                                    style={{ width: `${exportProgress.percent}%` }}
                                />
                            </div>
                        </div>
                    )}
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
                        <aside
                            className={`flex-shrink-0 border-r overflow-hidden flex flex-col ${isDarkMode ? 'bg-anki-darker border-gray-700' : 'bg-white border-gray-200'}`}
                            style={{ width: deckWidth }}
                        >
                            <DeckBrowser />
                        </aside>

                        <div
                            onMouseDown={handleDeckResizeStart}
                            className={`flex-shrink-0 w-1.5 cursor-col-resize ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}`}
                        />

                        {/* Card List */}
                        <aside
                            className={`flex-shrink-0 border-r overflow-hidden ${isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
                            style={{ width: listWidth }}
                        >
                            <CardList />
                        </aside>

                        <div
                            onMouseDown={handleListResizeStart}
                            className={`flex-shrink-0 w-1.5 cursor-col-resize ${isDarkMode ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'}`}
                        />

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
                                            <div className={`text-xs mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                Deck: <span className="font-medium">{selectedCard.deckName || 'Unknown Deck'}</span>
                                            </div>
                                            <CardViewer
                                                card={selectedCard}
                                                title="Original Card"
                                                onUpdateFields={updateCardFields}
                                                editedFields={selectedCardEdited.editedFields}
                                                isEdited={selectedCardEdited.isEdited}
                                                onRestoreEdits={restoreCardFields}
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
                                        {/* Show AddCardPanel if open */}
                                        {showAddCardPanel ? (
                                            <AddCardPanel
                                                deckId={selectedDeckId}
                                                deckName={collection.decks.get(selectedDeckId)?.name || 'Unknown Deck'}
                                                onClose={() => setAddCardPanelDeckId(null)}
                                            />
                                        ) : (
                                            <>
                                                {/* Deck Info */}
                                                <div>
                                                    <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                                        <Layers className="w-5 h-5" />
                                                        Deck Analysis
                                                    </h2>
                                                    <div className={`rounded-lg p-4 ${isDarkMode ? 'bg-gray-800' : 'bg-white shadow-sm border border-gray-200'}`}>
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <p className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
                                                                    <span className="font-medium">{collection.decks.get(selectedDeckId)?.name || 'Unknown Deck'}</span>
                                                                </p>
                                                                <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                    {getCardsInDeck(collection, selectedDeckId, true).length} cards (including subdecks)
                                                                </p>
                                                            </div>
                                                            <button
                                                                onClick={() => setAddCardPanelDeckId(selectedDeckId)}
                                                                className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-sm font-medium text-white"
                                                            >
                                                                <Plus className="w-4 h-4" />
                                                                Add Cards
                                                            </button>
                                                        </div>
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
                                            </>
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

            {deletionFilter && (
                <ExportDeletionFilterModal
                    deckName={deletionFilterDeckName}
                    filterText={deletionFilter}
                    onClose={() => setDeletionFilter(null)}
                />
            )}
        </div>
    );
}

export default App;
