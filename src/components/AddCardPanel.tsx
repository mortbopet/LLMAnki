import React, { useCallback } from 'react';
import { Plus, Sparkles, Loader2, X, Wand2 } from 'lucide-react';
import { RichTextField } from './RichTextField';
import { SuggestedCardsList } from './SuggestedCardsList';
import { CardCarousel } from './CardCarousel';
import { ErrorDisplay } from './ErrorDisplay';
import { useAppStore } from '../store/useAppStore';
import { generateCardsFromPrompt } from '../utils/llmService';
import type { CardType, SuggestedCard } from '../types';

interface AddCardPanelProps {
    deckId: number;
    deckName: string;
    onClose: () => void;
}

const CARD_TYPES: { value: CardType; label: string; fields: string[] }[] = [
    { value: 'basic', label: 'Basic', fields: ['Front', 'Back'] },
    { value: 'basic-reversed', label: 'Basic (and reversed)', fields: ['Front', 'Back'] },
    { value: 'cloze', label: 'Cloze', fields: ['Text', 'Extra'] },
];

/**
 * Panel for adding new cards to a deck.
 * Supports both manual card creation and AI-assisted card generation.
 * 
 * State is stored in the global store (per-deck) so it persists when switching decks.
 */
export const AddCardPanel: React.FC<AddCardPanelProps> = ({ deckId, deckName, onClose }) => {
    // Store actions
    const addCard = useAppStore(state => state.addCard);
    const deleteCard = useAppStore(state => state.deleteCard);
    const llmConfig = useAppStore(state => state.llmConfig);
    const setAddCardPanelState = useAppStore(state => state.setAddCardPanelState);
    const getAddCardPanelState = useAppStore(state => state.getAddCardPanelState);

    // Subscribe to panel state from store - use getAddCardPanelState which returns a stable reference
    const panelState = useAppStore(state => state.addCardPanelState.get(deckId)) ?? getAddCardPanelState(deckId);

    // Destructure for convenience
    const {
        activeTab,
        aiPrompt,
        suggestedCards,
        addedCards = [],
        carouselIndex,
        manualCardType = 'basic',
        manualFields = CARD_TYPES[0].fields.map(name => ({ name, value: '' })),
    } = panelState;

    // Local UI state (not persisted)
    const [isGenerating, setIsGenerating] = React.useState(false);
    const [generationError, setGenerationError] = React.useState<string | null>(null);

    // Helper to get added indices for UI
    const addedIndices = addedCards.map(ac => ac.suggestedIndex);

    // Update state helper
    const updateState = useCallback((updates: Partial<typeof panelState>) => {
        setAddCardPanelState(deckId, updates);
    }, [setAddCardPanelState, deckId]);

    // Handle tab change
    const handleTabChange = useCallback((tab: 'manual' | 'ai') => {
        updateState({ activeTab: tab });
    }, [updateState]);

    // Handle card type change
    const handleTypeChange = useCallback((type: CardType) => {
        const cardTypeConfig = CARD_TYPES.find(t => t.value === type);
        if (cardTypeConfig) {
            updateState({
                manualCardType: type,
                manualFields: cardTypeConfig.fields.map(name => ({ name, value: '' })),
            });
        }
    }, [updateState]);

    // Handle manual card field changes
    const handleFieldChange = useCallback((index: number, value: string) => {
        const newFields = [...manualFields];
        newFields[index] = { ...newFields[index], value };
        updateState({ manualFields: newFields });
    }, [manualFields, updateState]);

    // Handle AI prompt change
    const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        updateState({ aiPrompt: e.target.value });
    }, [updateState]);

    // Add manual card
    const handleAddManualCard = useCallback(async () => {
        const card: SuggestedCard = {
            type: manualCardType,
            fields: manualFields,
            explanation: ''
        };

        const newCardId = await addCard(card, deckId);
        if (newCardId) {
            // Reset fields for next card
            const cardTypeConfig = CARD_TYPES.find(t => t.value === manualCardType);
            if (cardTypeConfig) {
                updateState({
                    manualFields: cardTypeConfig.fields.map(name => ({ name, value: '' })),
                });
            }
        }
    }, [manualCardType, manualFields, deckId, addCard, updateState]);

    // Generate cards with AI
    const handleGenerateCards = useCallback(async () => {
        if (!aiPrompt.trim()) return;

        setIsGenerating(true);
        setGenerationError(null);
        updateState({
            suggestedCards: [],
            addedCards: [],
            carouselIndex: 0,
        });

        try {
            const result = await generateCardsFromPrompt(aiPrompt, deckName, llmConfig);

            if (result.error) {
                setGenerationError(result.error);
            } else {
                updateState({ suggestedCards: result.cards });
            }
        } catch (e) {
            setGenerationError(e instanceof Error ? e.message : 'Failed to generate cards');
        } finally {
            setIsGenerating(false);
        }
    }, [aiPrompt, deckName, llmConfig, updateState]);

    // Add suggested card to deck
    const handleAddSuggestedCard = useCallback(async (card: SuggestedCard, index: number) => {
        const newCardId = await addCard(card, deckId);
        if (newCardId) {
            updateState({
                addedCards: [...addedCards, { suggestedIndex: index, cardId: newCardId }],
            });
        }
    }, [deckId, addCard, addedCards, updateState]);

    // Update suggested card (from inline editing)
    const handleUpdateCard = useCallback((index: number, card: SuggestedCard) => {
        const newCards = [...suggestedCards];
        newCards[index] = card;
        updateState({ suggestedCards: newCards });
    }, [suggestedCards, updateState]);

    // Remove suggested card (that hasn't been added yet)
    const handleRemoveCard = useCallback((index: number) => {
        const newCards = suggestedCards.filter((_, i) => i !== index);
        // Adjust added card indices
        const newAddedCards = addedCards
            .filter(ac => ac.suggestedIndex !== index)
            .map(ac => ({
                ...ac,
                suggestedIndex: ac.suggestedIndex > index ? ac.suggestedIndex - 1 : ac.suggestedIndex,
            }));
        updateState({ suggestedCards: newCards, addedCards: newAddedCards });
    }, [suggestedCards, addedCards, updateState]);

    // Remove added card (delete from deck)
    const handleRemoveAddedCard = useCallback((index: number) => {
        const addedCard = addedCards.find(ac => ac.suggestedIndex === index);
        if (addedCard) {
            // Actually delete the card from the collection
            deleteCard(addedCard.cardId);
            // Remove from our tracking
            updateState({
                addedCards: addedCards.filter(ac => ac.suggestedIndex !== index),
            });
        }
    }, [addedCards, deleteCard, updateState]);

    // Handle carousel index change
    const handleCarouselIndexChange = useCallback((index: number) => {
        updateState({ carouselIndex: index });
    }, [updateState]);

    // Get layout preference
    const suggestedCardsLayout = llmConfig.suggestedCardsLayout || 'carousel';
    const canAddManualCard = manualFields.some(f => f.value.trim());

    return (
        <div className="h-full flex flex-col bg-gray-800 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gray-700 border-b border-gray-600 flex items-center justify-between">
                <div>
                    <h3 className="font-medium flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Add Cards
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                        Adding to: {deckName}
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-gray-600 rounded transition-colors"
                    title="Close"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-600">
                <button
                    onClick={() => handleTabChange('manual')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'manual'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                        }`}
                >
                    <Plus className="w-4 h-4" />
                    Manual
                </button>
                <button
                    onClick={() => handleTabChange('ai')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'ai'
                            ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-800/50'
                            : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/50'
                        }`}
                >
                    <Sparkles className="w-4 h-4" />
                    AI-Assisted
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'manual' ? (
                    <div className="space-y-4">
                        {/* Card type selector */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Card Type
                            </label>
                            <select
                                value={manualCardType}
                                onChange={(e) => handleTypeChange(e.target.value as CardType)}
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                            >
                                {CARD_TYPES.map(type => (
                                    <option key={type.value} value={type.value}>
                                        {type.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Field editors */}
                        {manualFields.map((field, index) => (
                            <RichTextField
                                key={`${manualCardType}-${field.name}`}
                                label={field.name}
                                value={field.value}
                                onChange={(value) => handleFieldChange(index, value)}
                                showClozeButton={manualCardType === 'cloze'}
                                placeholder={`Enter ${field.name.toLowerCase()}...`}
                                minHeight="100px"
                            />
                        ))}

                        {/* Add button */}
                        <div className="flex justify-end pt-2">
                            <button
                                onClick={handleAddManualCard}
                                disabled={!canAddManualCard}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors text-sm font-medium"
                            >
                                <Plus className="w-4 h-4" />
                                Add Card
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* AI prompt input */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Describe the cards you want
                            </label>
                            <textarea
                                value={aiPrompt}
                                onChange={handlePromptChange}
                                placeholder="e.g., Create flashcards about the definition and examples of homophones, homographs, and homonyms..."
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500 min-h-[100px] resize-y"
                            />
                        </div>

                        {/* Generate button */}
                        <div className="flex justify-end">
                            <button
                                onClick={handleGenerateCards}
                                disabled={isGenerating || !aiPrompt.trim()}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors text-sm font-medium"
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Wand2 className="w-4 h-4" />
                                        Generate Cards
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Error message */}
                        {generationError && (
                            <ErrorDisplay
                                error={generationError}
                                onDismiss={() => setGenerationError(null)}
                            />
                        )}

                        {/* Generated cards */}
                        {suggestedCards.length > 0 && (
                            <div className="mt-6">
                                <h4 className="text-sm font-medium text-gray-300 mb-3">
                                    Generated Cards ({suggestedCards.length})
                                </h4>
                                {suggestedCardsLayout === 'list' ? (
                                    <SuggestedCardsList
                                        cards={suggestedCards}
                                        onAddCard={handleAddSuggestedCard}
                                        onUpdateCard={handleUpdateCard}
                                        onRemoveCard={handleRemoveCard}
                                        onRemoveAddedCard={handleRemoveAddedCard}
                                        showActions={true}
                                        titlePrefix="Card"
                                        addedIndices={addedIndices}
                                    />
                                ) : (
                                    <CardCarousel
                                        cards={suggestedCards}
                                        onAddCard={handleAddSuggestedCard}
                                        onUpdateCard={handleUpdateCard}
                                        onRemoveCard={handleRemoveCard}
                                        onRemoveAddedCard={handleRemoveAddedCard}
                                        showActions={true}
                                        titlePrefix="Card"
                                        initialSlide={carouselIndex}
                                        onSlideChange={handleCarouselIndexChange}
                                        addedIndices={addedIndices}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
