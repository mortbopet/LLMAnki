import React, { useMemo, useCallback, useState, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { CreditCard, Tag, Layers, Search, X, CheckCircle, AlertCircle, Wand2, Trash2, Undo2, ArrowUpDown, ChevronDown, Pencil } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { renderCard, getCardTypeName } from '../utils/cardRenderer';
import { getCardsInDeck } from '../utils/ankiParser';
import type { RenderedCard, AnkiCard, LLMAnalysisResult } from '../types';

// Individual card item component to properly handle hover state
interface CardListItemProps {
    card: AnkiCard;
    rendered: RenderedCard | undefined;
    isSelected: boolean;
    isAnalyzed: boolean;
    cachedResult: LLMAnalysisResult | undefined;
    isGenerated: boolean;
    isMarkedForDeletion: boolean;
    isEdited: boolean;
    onSelect: () => void;
    onMarkForDeletion: (id: number) => void;
    onUnmarkForDeletion: (id: number) => void;
    onDeleteCard: (id: number) => void;
}

const CardListItem: React.FC<CardListItemProps> = ({
    card,
    rendered,
    isSelected,
    isAnalyzed,
    cachedResult,
    isGenerated,
    isMarkedForDeletion,
    isEdited,
    onSelect,
    onMarkForDeletion,
    onUnmarkForDeletion,
    onDeleteCard
}) => {
    const [hovered, setHovered] = useState(false);

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Generated cards should be deleted immediately, not marked for deletion
        if (isGenerated) {
            onDeleteCard(card.id);
        } else {
            onMarkForDeletion(card.id);
        }
    };

    const handleRestore = (e: React.MouseEvent) => {
        e.stopPropagation();
        onUnmarkForDeletion(card.id);
    };

    return (
        <div
            className={`relative p-2 mb-1 rounded cursor-pointer transition-colors ${isMarkedForDeletion
                ? (isSelected ? 'bg-red-800' : 'hover:bg-red-900/50 bg-red-900/30 border border-red-700/50 opacity-60')
                : isSelected ? 'bg-blue-600' :
                    isGenerated ? 'hover:bg-purple-700/50 bg-purple-900/30 border border-purple-700/50' :
                        'hover:bg-gray-700 bg-gray-800'
                }`}
            onClick={onSelect}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* Trash/Restore icon on hover */}
            {hovered && (
                <button
                    className="absolute right-2 bottom-2 z-10 p-1 rounded hover:bg-gray-700"
                    title={isMarkedForDeletion ? 'Restore card' : 'Delete card'}
                    onClick={isMarkedForDeletion ? handleRestore : handleDelete}
                >
                    {isMarkedForDeletion ? (
                        <Undo2 className="w-4 h-4 text-green-400" />
                    ) : (
                        <Trash2 className="w-4 h-4 text-red-400" />
                    )}
                </button>
            )}
            <div className="flex items-start gap-2">
                {isMarkedForDeletion ? (
                    <Trash2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-400" />
                ) : isGenerated ? (
                    <Wand2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-purple-400" />
                ) : (
                    <CreditCard className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <div
                            className={`text-sm truncate flex-1 ${isMarkedForDeletion ? 'text-red-300 line-through' :
                                isGenerated ? 'text-purple-200' : ''
                                }`}
                            dangerouslySetInnerHTML={{
                                __html: rendered?.front?.slice(0, 100) || 'Loading...'
                            }}
                        />
                        {isMarkedForDeletion && (
                            <span className="text-xs text-red-400 flex-shrink-0">Delete</span>
                        )}
                        {isEdited && !isMarkedForDeletion && (
                            <span
                                className="flex items-center text-xs flex-shrink-0 px-1 py-0.5 text-yellow-400"
                                title="Card has been edited"
                            >
                                <Pencil className="w-3 h-3" />
                            </span>
                        )}
                        {isGenerated && !isMarkedForDeletion && (
                            <span className="text-xs text-purple-400 flex-shrink-0">New</span>
                        )}
                        {isAnalyzed && cachedResult && !isMarkedForDeletion && (
                            (cachedResult.error || cachedResult.feedback.overallScore === 0) ? (
                                <div
                                    className="flex items-center gap-1 flex-shrink-0 text-red-400"
                                    title={cachedResult.error ? `Error: ${cachedResult.error}` : 'Analysis failed'}
                                >
                                    <AlertCircle className="w-3.5 h-3.5" />
                                </div>
                            ) : (
                                <div
                                    className={`flex items-center gap-1 flex-shrink-0 ${cachedResult.feedback.overallScore >= 7 ? 'text-green-400' :
                                        cachedResult.feedback.overallScore >= 4 ? 'text-yellow-400' : 'text-red-400'
                                        }`}
                                    title={`Analyzed: ${cachedResult.feedback.overallScore}/10`}
                                >
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span className="text-xs">{cachedResult.feedback.overallScore}</span>
                                </div>
                            )
                        )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <span className={`px-1.5 py-0.5 rounded ${isMarkedForDeletion ? 'bg-red-800/50 text-red-300' :
                            isGenerated ? 'bg-purple-800/50 text-purple-300' : 'bg-gray-700'
                            }`}>
                            {getCardTypeName(card.type)}
                        </span>
                        {rendered?.tags && rendered.tags.length > 0 && (
                            <span className="flex items-center gap-1">
                                <Tag className="w-3 h-3" />
                                {rendered.tags.length}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export const CardList: React.FC = () => {
    const collection = useAppStore(state => state.collection);
    const selectedDeckId = useAppStore(state => state.selectedDeckId);
    const selectedCardId = useAppStore(state => state.selectedCardId);
    const selectCard = useAppStore(state => state.selectCard);
    const cards = useAppStore(state => state.cards);
    const persistedCardState = useAppStore(state => state.persistedCardState);
    const deleteCard = useAppStore(state => state.deleteCard);
    const restoreCard = useAppStore(state => state.restoreCard);
    const getCard = useAppStore(state => state.getCard);

    // Compute analysisCache from both cards Map and persistedCardState
    const analysisCache = useMemo(() => {
        const cache = new Map<number, LLMAnalysisResult>();
        // First add from cards Map (active state)
        for (const [cardId, cardState] of cards) {
            if (cardState.analysis) {
                cache.set(cardId, cardState.analysis);
            }
        }
        // Then add from persisted state (for cards not yet loaded)
        for (const [cardId, savedCard] of persistedCardState) {
            if (!cache.has(cardId) && savedCard.analysis) {
                cache.set(cardId, savedCard.analysis);
            }
        }
        return cache;
    }, [cards, persistedCardState]);

    const parentRef = useRef<HTMLDivElement>(null);
    const [renderedCards, setRenderedCards] = React.useState<Map<number, RenderedCard>>(new Map());
    const [isLoading, setIsLoading] = React.useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [includeSubdecks, setIncludeSubdecks] = useState(true);
    const [sortBy, setSortBy] = useState<'default' | 'score-asc' | 'score-desc' | 'state'>('default');
    const [showSortMenu, setShowSortMenu] = useState(false);

    const allCards = useMemo(() => {
        if (!collection || selectedDeckId === null) return [];
        return getCardsInDeck(collection, selectedDeckId, includeSubdecks);
    }, [collection, selectedDeckId, includeSubdecks]);

    // Count generated cards in the current deck
    const generatedCardCount = useMemo(() => {
        return allCards.filter(card => cards.get(card.id)?.origin === 'generated').length;
    }, [allCards, cards]);

    // Filter cards based on search query
    const filteredCards = useMemo(() => {
        if (!searchQuery.trim()) return allCards;

        const query = searchQuery.toLowerCase();
        return allCards.filter(card => {
            const rendered = renderedCards.get(card.id);
            if (!rendered) return true; // Keep cards that haven't been rendered yet

            const searchText = `${rendered.front} ${rendered.back} ${rendered.tags.join(' ')}`.toLowerCase();
            return searchText.includes(query);
        });
    }, [allCards, searchQuery, renderedCards]);

    // Sort cards based on sort option
    const sortedCards = useMemo(() => {
        if (sortBy === 'default') return filteredCards;

        return [...filteredCards].sort((a, b) => {
            if (sortBy === 'score-asc' || sortBy === 'score-desc') {
                const scoreA = analysisCache.get(a.id)?.feedback?.overallScore ?? -1;
                const scoreB = analysisCache.get(b.id)?.feedback?.overallScore ?? -1;
                return sortBy === 'score-asc' ? scoreA - scoreB : scoreB - scoreA;
            }

            if (sortBy === 'state') {
                // Priority: deleted (0) > new (1) > existing (2)
                const getStatePriority = (cardId: number) => {
                    const cardState = cards.get(cardId);
                    if (cardState?.isDeleted) return 0;
                    if (cardState?.origin === 'generated') return 1;
                    return 2;
                };
                return getStatePriority(a.id) - getStatePriority(b.id);
            }

            return 0;
        });
    }, [filteredCards, sortBy, analysisCache, cards]);

    // Virtualizer for efficient rendering of large lists
    const rowVirtualizer = useVirtualizer({
        count: sortedCards.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 72, // Initial estimate, will be measured dynamically
        overscan: 5, // Render 5 extra items above and below viewport
        measureElement: (element) => {
            // Dynamically measure each element's actual height
            return element.getBoundingClientRect().height;
        },
    });

    // Render cards when selection changes
    React.useEffect(() => {
        if (!collection || allCards.length === 0) {
            setRenderedCards(new Map());
            return;
        }

        setIsLoading(true);

        const renderCardsAsync = async () => {
            const rendered = new Map<number, RenderedCard>();
            for (const card of allCards) {
                try {
                    const rc = await renderCard(collection, card);
                    rendered.set(card.id, rc);
                } catch (e) {
                    console.error('Failed to render card:', e);
                }
            }
            setRenderedCards(rendered);
            setIsLoading(false);
        };

        renderCardsAsync();
    }, [collection, allCards]);

    const handleSelectCard = useCallback(async (card: AnkiCard) => {
        if (!collection) return;

        try {
            let rendered = renderedCards.get(card.id);
            if (!rendered) {
                rendered = await renderCard(collection, card);
            }
            // selectCard now only needs the cardId - rendered content is stored separately
            selectCard(card.id);
        } catch (e) {
            console.error('Failed to select card:', e);
        }
    }, [collection, renderedCards, selectCard]);

    if (!collection) {
        return null;
    }

    if (selectedDeckId === null) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
                <Layers className="w-12 h-12 mb-2 opacity-50" />
                <p className="text-sm text-center">Select a deck to view cards</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Filter bar */}
            <div className="p-2 border-b border-gray-700 space-y-2">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search cards..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-8 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={includeSubdecks}
                            onChange={(e) => setIncludeSubdecks(e.target.checked)}
                            className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                        />
                        Include subdecks
                    </label>

                    {/* Sort dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSortMenu(!showSortMenu)}
                            className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors ${sortBy !== 'default'
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                        >
                            <ArrowUpDown className="w-3 h-3" />
                            <span>
                                {sortBy === 'default' && 'Sort'}
                                {sortBy === 'score-asc' && 'Score ↑'}
                                {sortBy === 'score-desc' && 'Score ↓'}
                                {sortBy === 'state' && 'State'}
                            </span>
                            <ChevronDown className="w-3 h-3" />
                        </button>

                        {showSortMenu && (
                            <>
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setShowSortMenu(false)}
                                />
                                <div className="absolute right-0 top-full mt-1 z-20 bg-gray-800 border border-gray-600 rounded-lg shadow-lg py-1 min-w-[140px]">
                                    <button
                                        onClick={() => { setSortBy('default'); setShowSortMenu(false); }}
                                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 ${sortBy === 'default' ? 'text-blue-400' : 'text-gray-300'}`}
                                    >
                                        Default order
                                    </button>
                                    <button
                                        onClick={() => { setSortBy('score-desc'); setShowSortMenu(false); }}
                                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 ${sortBy === 'score-desc' ? 'text-blue-400' : 'text-gray-300'}`}
                                    >
                                        Score (high → low)
                                    </button>
                                    <button
                                        onClick={() => { setSortBy('score-asc'); setShowSortMenu(false); }}
                                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 ${sortBy === 'score-asc' ? 'text-blue-400' : 'text-gray-300'}`}
                                    >
                                        Score (low → high)
                                    </button>
                                    <button
                                        onClick={() => { setSortBy('state'); setShowSortMenu(false); }}
                                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-700 ${sortBy === 'state' ? 'text-blue-400' : 'text-gray-300'}`}
                                    >
                                        State (deleted, new, existing)
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Cards header */}
            <div className="px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                <span>
                    Cards ({sortedCards.length}
                    {allCards.length !== sortedCards.length ? ` of ${allCards.length}` : ''}
                    {generatedCardCount > 0 ? ` • ${generatedCardCount} new` : ''})
                </span>
            </div>

            {/* Loading state */}
            {isLoading && (
                <div className="flex items-center justify-center py-8">
                    <div className="spinner w-6 h-6"></div>
                </div>
            )}

            {/* Empty state */}
            {!isLoading && sortedCards.length === 0 && (
                <div className="flex flex-col items-center justify-center flex-1 text-gray-400 p-4">
                    <CreditCard className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm text-center">
                        {searchQuery ? 'No matching cards' : 'No cards in this deck'}
                    </p>
                </div>
            )}

            {/* Card list - Virtualized for performance */}
            <div
                ref={parentRef}
                className="flex-1 overflow-y-auto p-2"
            >
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                        const card = sortedCards[virtualItem.index];
                        const cardState = cards.get(card.id);
                        const persistedState = persistedCardState.get(card.id);
                        const domainCard = getCard(card.id);

                        // Use cardState if available, otherwise fall back to persistedState
                        const isDeleted = cardState?.isDeleted ?? persistedState?.isDeleted ?? false;
                        const isGenerated = cardState?.origin === 'generated' || persistedState?.origin === 'generated';

                        return (
                            <div
                                key={card.id}
                                data-index={virtualItem.index}
                                ref={rowVirtualizer.measureElement}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualItem.start}px)`,
                                }}
                            >
                                <CardListItem
                                    card={card}
                                    rendered={renderedCards.get(card.id)}
                                    isSelected={selectedCardId === card.id}
                                    isAnalyzed={analysisCache.has(card.id)}
                                    cachedResult={analysisCache.get(card.id)}
                                    isGenerated={isGenerated}
                                    isMarkedForDeletion={isDeleted}
                                    isEdited={domainCard?.isEdited ?? false}
                                    onSelect={() => handleSelectCard(card)}
                                    onMarkForDeletion={deleteCard}
                                    onUnmarkForDeletion={restoreCard}
                                    onDeleteCard={deleteCard}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
