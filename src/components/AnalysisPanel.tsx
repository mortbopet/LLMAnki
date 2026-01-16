import React, { useState, useCallback } from 'react';
import {
    CheckCircle,
    XCircle,
    AlertTriangle,
    Lightbulb,
    Star,
    ThumbsUp,
    ThumbsDown,
    Trash2,
    Plus,
    Undo2
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { CardCarousel } from './CardCarousel';
import { SuggestedCardsList } from './SuggestedCardsList';
import type { LLMAnalysisResult, SuggestedCard } from '../types';

interface AnalysisPanelProps {
    result: LLMAnalysisResult;
}

const CriteriaCheck: React.FC<{ label: string; passed: boolean }> = ({ label, passed }) => (
    <div className="flex items-center gap-2">
        {passed ? (
            <CheckCircle className="w-4 h-4 text-green-500" />
        ) : (
            <XCircle className="w-4 h-4 text-red-500" />
        )}
        <span className={passed ? 'text-green-400' : 'text-red-400'}>{label}</span>
    </div>
);

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ result }) => {
    const { feedback, suggestedCards, deleteOriginal, deleteReason } = result;

    const suggestedCardsState = useAppStore(state => state.suggestedCards);
    const updateSuggestedCard = useAppStore(state => state.updateSuggestedCard);
    const removeSuggestedCard = useAppStore(state => state.removeSuggestedCard);
    const addCardToDeck = useAppStore(state => state.addCardToDeck);
    const markCardForDeletion = useAppStore(state => state.markCardForDeletion);
    const unmarkCardForDeletion = useAppStore(state => state.unmarkCardForDeletion);
    const isCardMarkedForDeletion = useAppStore(state => state.isCardMarkedForDeletion);
    const getAddedSuggestedIndices = useAppStore(state => state.getAddedSuggestedIndices);
    const getAddedCardId = useAppStore(state => state.getAddedCardId);
    const deleteCard = useAppStore(state => state.deleteCard);
    const selectedCard = useAppStore(state => state.selectedCard);
    const selectedDeckId = useAppStore(state => state.selectedDeckId);
    const llmConfig = useAppStore(state => state.llmConfig);

    // Track carousel position to persist across edit/save cycles
    const [carouselIndex, setCarouselIndex] = useState(0);

    // Get layout preference (default to carousel for backwards compatibility)
    const suggestedCardsLayout = llmConfig.suggestedCardsLayout || 'carousel';

    // Get indices of suggested cards that have already been added
    const addedIndices = selectedCard ? getAddedSuggestedIndices(selectedCard.id) : [];

    // Handle inline updates to suggested cards
    const handleUpdateCard = useCallback((index: number, card: SuggestedCard) => {
        updateSuggestedCard(index, card);
    }, [updateSuggestedCard]);

    const handleAddCard = (card: SuggestedCard, index: number) => {
        if (selectedDeckId !== null) {
            // Pass the selected card ID for potential metadata inheritance, and the suggested card index
            addCardToDeck(card, selectedDeckId, selectedCard?.id, index);
        }
    };

    const handleRemoveAddedCard = (index: number) => {
        if (selectedCard) {
            const addedCardId = getAddedCardId(selectedCard.id, index);
            if (addedCardId !== null) {
                deleteCard(addedCardId);
            }
        }
    };

    const handleToggleDeleteMark = () => {
        if (selectedCard) {
            if (isCardMarkedForDeletion(selectedCard.id)) {
                unmarkCardForDeletion(selectedCard.id);
            } else {
                markCardForDeletion(selectedCard.id);
            }
        }
    };

    // Check if the current card is marked for deletion
    const isCurrentCardMarked = selectedCard ? isCardMarkedForDeletion(selectedCard.id) : false;

    // Use local suggestedCards state which can be edited
    const displayCards = suggestedCardsState.length > 0 ? suggestedCardsState : suggestedCards;

    return (
        <div className="space-y-6">
            {/* Score Overview */}
            <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Star className="w-5 h-5 text-yellow-500" />
                        Analysis Score
                    </h3>
                    <div className="flex items-center gap-2">
                        <span className={`text-2xl font-bold ${feedback.overallScore >= 7 ? 'text-green-500' :
                            feedback.overallScore >= 4 ? 'text-yellow-500' : 'text-red-500'
                            }`}>
                            {feedback.overallScore}/10
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <CriteriaCheck label="Unambiguous" passed={feedback.isUnambiguous} />
                    <CriteriaCheck label="Atomic" passed={feedback.isAtomic} />
                    <CriteriaCheck label="Recognizable" passed={feedback.isRecognizable} />
                    <CriteriaCheck label="Active Recall" passed={feedback.isActiveRecall} />
                </div>
            </div>

            {/* Issues */}
            {feedback.issues.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-orange-500" />
                        Issues Found
                    </h3>
                    <ul className="space-y-2">
                        {feedback.issues.map((issue, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm">
                                <ThumbsDown className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                                <span className="text-gray-300">{typeof issue === 'string' ? issue : JSON.stringify(issue)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Suggestions */}
            {feedback.suggestions.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-semibold flex items-center gap-2 mb-3">
                        <Lightbulb className="w-5 h-5 text-yellow-500" />
                        Suggestions
                    </h3>
                    <ul className="space-y-2">
                        {feedback.suggestions.map((suggestion, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm">
                                <ThumbsUp className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                                <span className="text-gray-300">{typeof suggestion === 'string' ? suggestion : JSON.stringify(suggestion)}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Detailed Reasoning */}
            {feedback.reasoning && (
                <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="font-semibold mb-3">Detailed Analysis</h3>
                    {feedback.reasoning.startsWith('Failed to parse LLM response. Raw response:') ? (
                        <>
                            <p className="text-sm text-red-400 mb-2">Failed to parse LLM response. Raw response:</p>
                            <pre className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-900 p-3 rounded-lg border border-gray-700 overflow-x-auto font-mono">
                                {feedback.reasoning.replace('Failed to parse LLM response. Raw response:\n\n', '')}
                            </pre>
                        </>
                    ) : (
                        <p className="text-sm text-gray-300 whitespace-pre-wrap">{feedback.reasoning}</p>
                    )}
                </div>
            )}

            {/* Delete Recommendation */}
            {(deleteOriginal || isCurrentCardMarked) && (
                <div className={`rounded-lg p-4 ${isCurrentCardMarked
                    ? 'bg-gray-700 border border-gray-600'
                    : 'bg-red-900/30 border border-red-700'}`}>
                    <h3 className={`font-semibold flex items-center gap-2 mb-2 ${isCurrentCardMarked ? 'text-gray-300' : 'text-red-400'}`}>
                        {isCurrentCardMarked ? (
                            <>
                                <Trash2 className="w-5 h-5" />
                                Card Marked for Deletion
                            </>
                        ) : (
                            <>
                                <Trash2 className="w-5 h-5" />
                                Deletion Recommended
                            </>
                        )}
                    </h3>
                    {!isCurrentCardMarked && deleteReason && (
                        <p className="text-sm text-gray-300 mb-3">{deleteReason}</p>
                    )}
                    {isCurrentCardMarked ? (
                        <p className="text-sm text-gray-400 mb-3">
                            This card will be excluded when you export the deck. You can still add suggested replacement cards.
                        </p>
                    ) : null}
                    <button
                        onClick={handleToggleDeleteMark}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${isCurrentCardMarked
                            ? 'bg-gray-600 hover:bg-gray-500'
                            : 'bg-red-600 hover:bg-red-700'
                            }`}
                    >
                        {isCurrentCardMarked ? (
                            <>
                                <Undo2 className="w-4 h-4" />
                                Unmark for Deletion
                            </>
                        ) : (
                            <>
                                <Trash2 className="w-4 h-4" />
                                Mark for Deletion
                            </>
                        )}
                    </button>
                </div>
            )}

            {/* Suggested Cards - Carousel or List based on settings */}
            {displayCards.length > 0 && (
                <div className="space-y-4">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Plus className="w-5 h-5 text-green-500" />
                        Suggested Replacement Cards ({displayCards.length})
                    </h3>

                    {suggestedCardsLayout === 'list' ? (
                        <SuggestedCardsList
                            cards={displayCards}
                            onAddCard={(card, index) => handleAddCard(card, index)}
                            onUpdateCard={handleUpdateCard}
                            onRemoveCard={(index) => removeSuggestedCard(index)}
                            onRemoveAddedCard={handleRemoveAddedCard}
                            titlePrefix="Suggested Card"
                            addedIndices={addedIndices}
                        />
                    ) : (
                        <CardCarousel
                            cards={displayCards}
                            onAddCard={(card, index) => handleAddCard(card, index)}
                            onUpdateCard={handleUpdateCard}
                            onRemoveCard={(index) => removeSuggestedCard(index)}
                            onRemoveAddedCard={handleRemoveAddedCard}
                            titlePrefix="Suggested Card"
                            addedIndices={addedIndices}
                            initialSlide={carouselIndex}
                            onSlideChange={setCarouselIndex}
                        />
                    )}
                </div>
            )}
        </div>
    );
};
