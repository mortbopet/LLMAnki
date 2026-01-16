import React from 'react';
import { Plus, Trash2, Check, X } from 'lucide-react';
import { CardViewer } from './CardViewer';
import type { SuggestedCard } from '../types';

interface SuggestedCardsListProps {
    cards: SuggestedCard[];
    onAddCard?: (card: SuggestedCard, index: number) => void;
    onUpdateCard?: (index: number, card: SuggestedCard) => void;
    onRemoveCard?: (index: number) => void;
    onRemoveAddedCard?: (index: number) => void;
    showActions?: boolean;
    titlePrefix?: string;
    addedIndices?: number[];
}

export const SuggestedCardsList: React.FC<SuggestedCardsListProps> = ({
    cards,
    onAddCard,
    onUpdateCard,
    onRemoveCard,
    onRemoveAddedCard,
    showActions = true,
    titlePrefix = 'Card',
    addedIndices = []
}) => {
    if (cards.length === 0) return null;

    // Handle field updates for suggested cards
    const handleUpdateFields = (index: number) => (_noteId: number, fields: { name: string; value: string }[]) => {
        if (onUpdateCard) {
            const updatedCard = { ...cards[index], fields };
            onUpdateCard(index, updatedCard);
        }
    };

    return (
        <div className="space-y-6">
            {cards.map((card, index) => {
                const isAdded = addedIndices.includes(index);
                return (
                    <div key={index} className={`${isAdded ? 'opacity-50' : ''}`}>
                        <div className={`rounded-lg shadow-lg shadow-black/30 transition-shadow overflow-hidden ${isAdded
                            ? 'ring-1 ring-gray-500/30'
                            : 'ring-1 ring-green-500/30 hover:shadow-xl hover:shadow-black/40'
                            }`}>
                            {/* Added Badge */}
                            {isAdded && (
                                <div className="px-4 py-2 bg-gray-700/80 border-b border-gray-600 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Check className="w-4 h-4 text-green-400" />
                                        <span className="text-sm text-green-400 font-medium">Added to deck</span>
                                    </div>
                                    {onRemoveAddedCard && (
                                        <button
                                            onClick={() => onRemoveAddedCard(index)}
                                            className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                                            title="Remove from deck"
                                        >
                                            <X className="w-3 h-3" />
                                            Remove
                                        </button>
                                    )}
                                </div>
                            )}
                            {/* Explanation at top of card */}
                            {card.explanation && !isAdded && (
                                <div className="px-4 py-3 bg-gradient-to-r from-green-900/30 to-emerald-900/20 border-b border-green-500/20">
                                    <p className="text-sm text-green-200/90 italic">
                                        {card.explanation}
                                    </p>
                                </div>
                            )}
                            <CardViewer
                                card={card}
                                title={`${titlePrefix} ${index + 1}`}
                                isSuggestion
                                onUpdateFields={handleUpdateFields(index)}
                            />
                        </div>

                        {/* Action buttons below card - only show if not already added */}
                        {showActions && !isAdded && (
                            <div className="flex gap-2 mt-3">
                                {onRemoveCard && (
                                    <button
                                        onClick={() => onRemoveCard(index)}
                                        className="flex items-center gap-1 px-3 py-2 bg-gray-700 hover:bg-red-600 rounded-lg transition-colors text-sm"
                                        title="Remove suggestion"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Remove
                                    </button>
                                )}
                                <div className="flex-1" />
                                {onAddCard && (
                                    <button
                                        onClick={() => onAddCard(card, index)}
                                        className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors text-sm font-medium"
                                        title="Add to deck"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add to Deck
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
