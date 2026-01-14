import React, { useMemo, useCallback } from 'react';
import { CreditCard, Tag, Layers } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { renderCard, getCardTypeName } from '../utils/cardRenderer';
import { getCardsInDeck } from '../utils/ankiParser';
import type { RenderedCard, AnkiCard } from '../types';

export const CardList: React.FC = () => {
  const collection = useAppStore(state => state.collection);
  const selectedDeckId = useAppStore(state => state.selectedDeckId);
  const selectedCardId = useAppStore(state => state.selectedCardId);
  const selectCard = useAppStore(state => state.selectCard);
  
  const [renderedCards, setRenderedCards] = React.useState<Map<number, RenderedCard>>(new Map());
  const [isLoading, setIsLoading] = React.useState(false);
  
  const cards = useMemo(() => {
    if (!collection || selectedDeckId === null) return [];
    return getCardsInDeck(collection, selectedDeckId, false); // Don't include subdecks by default
  }, [collection, selectedDeckId]);
  
  // Render cards when selection changes
  React.useEffect(() => {
    if (!collection || cards.length === 0) {
      setRenderedCards(new Map());
      return;
    }
    
    setIsLoading(true);
    
    const renderCards = async () => {
      const rendered = new Map<number, RenderedCard>();
      for (const card of cards.slice(0, 100)) { // Limit to first 100 for performance
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
    
    renderCards();
  }, [collection, cards]);
  
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
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner w-8 h-8"></div>
      </div>
    );
  }
  
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
        <CreditCard className="w-12 h-12 mb-2 opacity-50" />
        <p className="text-sm text-center">No cards in this deck</p>
      </div>
    );
  }
  
  return (
    <div className="h-full overflow-y-auto p-2">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2 flex items-center justify-between">
        <span>Cards ({cards.length})</span>
      </h3>
      
      <div className="space-y-1">
        {cards.map(card => {
          const rendered = renderedCards.get(card.id);
          const isSelected = selectedCardId === card.id;
          
          return (
            <div
              key={card.id}
              className={`p-2 rounded cursor-pointer transition-colors ${
                isSelected ? 'bg-blue-600' : 'hover:bg-gray-700 bg-gray-800'
              }`}
              onClick={() => handleSelectCard(card)}
            >
              <div className="flex items-start gap-2">
                <CreditCard className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
                <div className="flex-1 min-w-0">
                  <div 
                    className="text-sm truncate"
                    dangerouslySetInnerHTML={{ 
                      __html: rendered?.front?.slice(0, 100) || 'Loading...' 
                    }}
                  />
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
