import React, { useMemo, useCallback, useState } from 'react';
import { CreditCard, Tag, Layers, Search, X, CheckCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { renderCard, getCardTypeName } from '../utils/cardRenderer';
import { getCardsInDeck } from '../utils/ankiParser';
import type { RenderedCard, AnkiCard } from '../types';

export const CardList: React.FC = () => {
    const collection = useAppStore(state => state.collection);
    const selectedDeckId = useAppStore(state => state.selectedDeckId);
    const selectedCardId = useAppStore(state => state.selectedCardId);
    const selectCard = useAppStore(state => state.selectCard);
    const analysisCache = useAppStore(state => state.analysisCache);

    const [renderedCards, setRenderedCards] = React.useState<Map<number, RenderedCard>>(new Map());
    const [isLoading, setIsLoading] = React.useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [includeSubdecks, setIncludeSubdecks] = useState(true);

    const allCards = useMemo(() => {
        if (!collection || selectedDeckId === null) return [];
        return getCardsInDeck(collection, selectedDeckId, includeSubdecks);
    }, [collection, selectedDeckId, includeSubdecks]);

    // Filter cards based on search query
    const cards = useMemo(() => {
        if (!searchQuery.trim()) return allCards;

        const query = searchQuery.toLowerCase();
        return allCards.filter(card => {
            const rendered = renderedCards.get(card.id);
            if (!rendered) return true; // Keep cards that haven't been rendered yet

            const searchText = `${rendered.front} ${rendered.back} ${rendered.tags.join(' ')}`.toLowerCase();
            return searchText.includes(query);
        });
    }, [allCards, searchQuery, renderedCards]);

    // Render cards when selection changes
    React.useEffect(() => {
        if (!collection || allCards.length === 0) {
            setRenderedCards(new Map());
            return;
        }

        setIsLoading(true);

        const renderCardsAsync = async () => {
            const rendered = new Map<number, RenderedCard>();
            for (const card of allCards.slice(0, 200)) { // Limit to first 200 for performance
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
            selectCard(card.id, rendered);
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

                <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={includeSubdecks}
                        onChange={(e) => setIncludeSubdecks(e.target.checked)}
                        className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                    />
                    Include subdecks
                </label>
            </div>

            {/* Cards header */}
            <div className="px-2 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                <span>Cards ({cards.length}{allCards.length !== cards.length ? ` of ${allCards.length}` : ''})</span>
            </div>

            {/* Loading state */}
            {isLoading && (
                <div className="flex items-center justify-center py-8">
                    <div className="spinner w-6 h-6"></div>
                </div>
            )}

            {/* Empty state */}
            {!isLoading && cards.length === 0 && (
                <div className="flex flex-col items-center justify-center flex-1 text-gray-400 p-4">
                    <CreditCard className="w-12 h-12 mb-2 opacity-50" />
                    <p className="text-sm text-center">
                        {searchQuery ? 'No matching cards' : 'No cards in this deck'}
                    </p>
                </div>
            )}

            {/* Card list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {cards.map(card => {
                    const rendered = renderedCards.get(card.id);
                    const isSelected = selectedCardId === card.id;
                    const isAnalyzed = analysisCache.has(card.id);
                    const cachedResult = analysisCache.get(card.id);

                    return (
                        <div
                            key={card.id}
                            className={`p-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-600' : 'hover:bg-gray-700 bg-gray-800'
                                }`}
                            onClick={() => handleSelectCard(card)}
                        >
                            <div className="flex items-start gap-2">
                                <CreditCard className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="text-sm truncate flex-1"
                                            dangerouslySetInnerHTML={{
                                                __html: rendered?.front?.slice(0, 100) || 'Loading...'
                                            }}
                                        />
                                        {isAnalyzed && cachedResult && (
                                            <div
                                                className={`flex items-center gap-1 flex-shrink-0 ${cachedResult.feedback.overallScore >= 7 ? 'text-green-400' :
                                                        cachedResult.feedback.overallScore >= 4 ? 'text-yellow-400' : 'text-red-400'
                                                    }`}
                                                title={`Analyzed: ${cachedResult.feedback.overallScore}/10`}
                                            >
                                                <CheckCircle className="w-3.5 h-3.5" />
                                                <span className="text-xs">{cachedResult.feedback.overallScore}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                                        <span className="px-1.5 py-0.5 bg-gray-700 rounded">
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
                })}
            </div>
        </div>
    );
};
