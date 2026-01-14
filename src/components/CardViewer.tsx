import React, { useState } from 'react';
import { Eye, RotateCcw, Tag, Layers } from 'lucide-react';
import type { RenderedCard, SuggestedCard, CardType } from '../types';
import { getCardTypeName } from '../utils/cardRenderer';

interface CardViewerProps {
  card: RenderedCard | SuggestedCard;
  title?: string;
  showFlip?: boolean;
  isSuggestion?: boolean;
}

export const CardViewer: React.FC<CardViewerProps> = ({ 
  card, 
  title,
  showFlip = true,
  isSuggestion = false
}) => {
  const [showBack, setShowBack] = useState(false);
  
  // Handle both RenderedCard and SuggestedCard formats
  const isRenderedCard = 'front' in card && 'back' in card;
  
  let front: string;
  let back: string;
  let cardType: CardType;
  let css = '';
  let tags: string[] = [];
  let deckName = '';
  
  if (isRenderedCard) {
    const rc = card as RenderedCard;
    front = rc.front;
    back = rc.back;
    cardType = rc.type;
    css = rc.css;
    tags = rc.tags;
    deckName = rc.deckName;
  } else {
    const sc = card as SuggestedCard;
    cardType = sc.type;
    
    if (cardType === 'cloze') {
      // For cloze, the first field contains the cloze text
      const clozeField = sc.fields.find(f => f.name.toLowerCase() === 'text' || f.name.toLowerCase() === 'front');
      const text = clozeField?.value || sc.fields[0]?.value || '';
      
      // Show with cloze hidden on front
      front = text.replace(/\{\{c\d+::([^}:]+)(?:::[^}]+)?\}\}/g, '<span class="cloze cloze-hint">[...]</span>');
      back = text.replace(/\{\{c\d+::([^}:]+)(?:::[^}]+)?\}\}/g, '<span class="cloze">$1</span>');
      
      // Add extra field if present
      const extraField = sc.fields.find(f => f.name.toLowerCase() === 'extra' || f.name.toLowerCase() === 'back');
      if (extraField?.value) {
        back += `<hr><div class="extra">${extraField.value}</div>`;
      }
    } else {
      // Basic card
      const frontField = sc.fields.find(f => f.name.toLowerCase() === 'front');
      const backField = sc.fields.find(f => f.name.toLowerCase() === 'back');
      front = frontField?.value || sc.fields[0]?.value || '';
      back = backField?.value || sc.fields[1]?.value || '';
    }
  }
  
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {title && (
        <div className="px-4 py-2 bg-gray-700 border-b border-gray-600 flex items-center justify-between">
          <h4 className="font-medium text-sm">{title}</h4>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-xs rounded ${
              isSuggestion ? 'bg-green-600' : 'bg-blue-600'
            }`}>
              {getCardTypeName(cardType)}
            </span>
          </div>
        </div>
      )}
      
      <div className="p-4">
        {/* Card info bar */}
        {!isSuggestion && deckName && (
          <div className="flex items-center gap-4 mb-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {deckName}
            </span>
            {tags.length > 0 && (
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                {tags.join(', ')}
              </span>
            )}
          </div>
        )}
        
        {/* Card content */}
        <div className="anki-card">
          <style>{css}</style>
          <div 
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: showBack ? back : front }}
          />
        </div>
        
        {/* Flip controls */}
        {showFlip && (
          <div className="mt-4 flex justify-center gap-2">
            <button
              onClick={() => setShowBack(!showBack)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              {showBack ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  Show Front
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  Show Back
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
